import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { origin, pages, byId, languages, htmlLang, labels, filename } from '../_fonte/site.mjs';
import { centers } from '../_fonte/tabuleiros.mjs';
import { root, read, generated, attrs, publicFiles, blogGenerated, article, makeSite } from './helpers.mjs';
import { loadBlog, parseArticle, imageSources, PAGE_SIZE, STATES } from '../_fonte/blog.mjs';
import { blogCategories, blogText, daily, bannedCopy } from '../_fonte/site.mjs';
const banned = /\u2014|adsense|destaque do google|loja em destaque|sem anúncios|sem chutar|feito no brasil|from brazil|nova temporada|\bwordle\b|\btermo\b|\bpr[eê]mios?\b|\bsorteios?\b|\bprizes?\b|\bsweepstakes?\b/iu;

test('every published HTML page is covered, with shared navigation and privacy', () => {
  assert.deepEqual(publicFiles().filter(p => p.endsWith('.html')).sort(), [...generated.map(p => p.file), ...blogGenerated.pages.map(p => p.file)].sort());
  for (const item of generated) {
    const html = read(item.file);
    assert.match(html, /<header\b/); assert.match(html, /<main>/); assert.match(html, /<footer>/);
    const menu = /<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1];
    const footer = /<footer>([\s\S]*?)<\/footer>/.exec(html)?.[1];
    for (const id of ['jogo', 'professores', 'speedrun', 'imprensa', 'sobre', 'contato', 'privacidade']) {
      const link = `href="${byId[id].paths[item.lang]}"`;
      assert.ok(menu?.includes(link), `${item.file}: menu ${id}`);
      assert.ok(footer?.includes(link), `${item.file}: footer ${id}`);
    }
    assert.ok(footer.includes(`href="${byId.termos.paths[item.lang]}"`));
    assert.ok(footer.includes('mailto:contact@melbees.games'));
    assert.doesNotMatch(html, /\bdata-l\s*=/i, item.file);
    assert.doesNotMatch(html, /lang-(?:pt|en|es|fr)\b|\.langs button|userAgent/, item.file);
    assert.match(html, new RegExp(`<html lang="${htmlLang[item.lang]}"`), item.file);
    // Content fragments may use only the URL's language; native language names
    // in the selector and the optional suggestion are intentionally exempt.
    const main = /<main>([\s\S]*?)<\/main>/.exec(html)[1];
    for (const tag of main.match(/<[^>]+\slang="[^"]+"[^>]*>/g) || []) assert.equal(attrs(tag).lang, htmlLang[item.lang], item.file);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${item.file}: duplicate id`);
  }
});

test('every internal link, image, script, stylesheet and fragment resolves', () => {
  for (const { file, path: urlPath } of generated) {
    const html = read(file);
    for (const tag of html.match(/<(?:a|img|script|link|source)\b[^>]*>/g) || []) {
      const a = attrs(tag);
      const href = a.href || a.src || a.srcset;
      if (!href || /^(?:mailto:|data:)/.test(href)) continue;
      const url = new URL(href, origin + urlPath);
      if (url.origin !== origin) continue;
      const dest = filename(decodeURIComponent(url.pathname));
      assert.ok(fs.existsSync(path.join(root, dest)), `${file}: ${href} -> ${dest}`);
      if (url.hash && dest.endsWith('.html')) {
        const target = decodeURIComponent(url.hash.slice(1));
        assert.ok(read(dest).includes(`id="${target}"`), `${file}: missing #${target} in ${dest}`);
      }
    }
  }
});

test('generated documents retain balanced HTML and SVG elements', () => {
  const voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  for (const { file } of generated) {
    const stack = [];
    const html = read(file).replace(/<!--[\s\S]*?-->/g, '');
    for (const token of html.match(/<\/?[a-z][^>]*>/gi) || []) {
      const name = /^<\/?([\w-]+)/.exec(token)[1].toLowerCase();
      if (token.startsWith('</')) assert.equal(stack.pop(), name, `${file}: ${token}`);
      else if (!voids.has(name) && !token.endsWith('/>')) stack.push(name);
    }
    assert.deepEqual(stack, [], file);
  }
});

test('canonicals, four reciprocal alternates and x-default match the route map', () => {
  for (const item of generated) {
    const html = read(item.file);
    assert.ok(html.includes(`<link rel="canonical" href="${origin}${item.path}">`), item.file);
    const alternates = (html.match(/<link\b[^>]*>/g) || []).map(attrs).filter(a => a.rel === 'alternate' && a.hreflang);
    assert.equal(alternates.length, 5, item.file);
    for (const lang of languages) assert.equal(alternates.find(a => a.hreflang === htmlLang[lang])?.href, origin + item.page.paths[lang], item.file);
    assert.equal(alternates.find(a => a.hreflang === 'x-default')?.href, origin + item.page.paths.pt, item.file);
    const selector = (html.match(/<a\b[^>]*data-idioma="[^"]+"[^>]*>/g) || []).map(attrs);
    assert.equal(selector.length, 4);
    for (const lang of languages) assert.equal(selector.find(a => a['data-idioma'] === lang)?.href, item.page.paths[lang], item.file);
    assert.equal(/name="robots" content="noindex"/.test(html), Boolean(item.redirect) || item.page.id === '404');
  }
});

test('indexable pages carry exactly one AdSense tag for the ads.txt publisher; noindex pages carry none', () => {
  const publisher = /google\.com,\s*(pub-\d+),\s*DIRECT/.exec(read('ads.txt'))[1];
  const tag = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${publisher}" crossorigin="anonymous"></script>`;
  for (const item of generated) {
    const html = read(item.file);
    const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1];
    const noindex = Boolean(item.redirect) || item.page.id === '404';
    assert.equal(head.split(tag).length - 1, noindex ? 0 : 1, item.file);
    assert.equal(html.split('googlesyndication').length - 1, noindex ? 0 : 1, item.file);
  }
});

test('prohibited copy is absent from generated HTML', () => {
  for (const { file } of generated) assert.doesNotMatch(read(file), banned, file);
  // Real published articles: the editorial rules of the blog (Wordle and Termo are allowed in posts, and so is "duelo": the Duelo mode shipped in 1.0.42).
  for (const p of blogGenerated.pages) assert.doesNotMatch(read(p.file), bannedCopy, p.file);
  for (const f of blogGenerated.feeds) assert.doesNotMatch(read(f.file), bannedCopy, f.file);
});

test('every source fragment is rendered, and remaining draft markers stay literal', () => {
  for (const page of pages) for (const lang of languages) {
    const source = read(`_fonte/conteudo/${lang}/${page.id}.html`);
    for (const part of source.trim().split(/<!--FAVO:\d-->/)) assert.ok(read(filename(page.paths[lang])).includes(part.trim()), `${page.id}/${lang}: source fragment`);
    if (source.startsWith('RASCUNHO:')) assert.equal(source, 'RASCUNHO: texto a caminho\n');
  }
});

test('legal pages link to the existing policy and terms with the required language', () => {
  for (const lang of languages) for (const [id, legal] of [['privacidade', 'privacy'], ['termos', 'terms']]) {
    const html = read(filename(byId[id].paths[lang]));
    assert.ok(html.includes(`href="https://metalbr01.github.io/melbees-legal/secret-of-bees/${legal}.${lang === 'pt' ? 'pt-BR' : 'en'}.html"`));
    assert.ok(html.includes(labels[lang][id === 'privacidade' ? 'legal' : 'conditions']));
  }
});

test('home and game link to all four resources in the same language', () => {
  for (const lang of languages) for (const id of ['home', 'jogo']) {
    const main = /<main>([\s\S]*?)<\/main>/.exec(read(filename(byId[id].paths[lang])))[1];
    for (const resource of ['como-jogar', 'estrategia', 'desafios', 'professores']) assert.ok(main.includes(`href="${byId[resource].paths[lang]}"`));
  }
});

test('13 imported puzzles retain geometric neighbours, pollen, masks and unique solutions', () => {
  const data = JSON.parse(read('_fonte/tabuleiros.json'));
  assert.deepEqual(languages.map(lang => data.boards.filter(b => b.lang === lang).length), [6, 2, 3, 2]);
  for (const b of data.boards) {
    const cells = centers(b.svg);
    assert.equal(cells.length, b.view.cells.length, `geometry ${b.id || b.n}`);
    assert.equal(cells.length, b.solution.length);
    const distance = (a, c) => Math.hypot(a.x - c.x, a.y - c.y);
    const nearest = Math.min(...cells.flatMap((a, i) => cells.slice(i + 1).map(c => distance(a, c))));
    const neighbours = cells.map((a, i) => cells.map((c, j) => j !== i && Math.abs(distance(a, c) - nearest) < nearest * .02 ? j : -1).filter(j => j >= 0));
    const known = b.view.cells.map((v, i) => v.state === 'idle' ? null : v.state !== 'miss');
    const numbers = b.view.cells.map((v, i) => v.state === 'miss' ? i : -1).filter(i => i >= 0);
    for (const i of numbers) assert.equal(neighbours[i].filter(j => b.solution[j]).length, b.view.cells[i].pollen, `${b.id || b.n} pollen ${i}`);
    for (const [slot, row] of b.view.masked.entries()) {
      assert.equal(row.length, b.words[slot].length);
      row.forEach((letter, i) => { if (letter) assert.equal(letter, b.words[slot][i]); });
    }
    const unknown = known.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
    const valid = () => numbers.every(i => {
      const n = neighbours[i]; const required = b.view.cells[i].pollen;
      const right = n.filter(j => known[j] === true).length;
      return right <= required && right + n.filter(j => known[j] === null).length >= required;
    });
    let count = 0;
    function search(k) {
      if (count > 1 || !valid()) return;
      if (k === unknown.length) { count++; assert.deepEqual(known, b.solution); return; }
      const i = unknown[k];
      for (const value of [false, true]) { known[i] = value; search(k + 1); }
      known[i] = null;
    }
    search(0); assert.equal(count, 1, `${b.id || b.n}: unique solution`);
  }
  for (const lang of languages) {
    const html = read(filename(byId.desafios.paths[lang]));
    assert.equal((html.match(/<details>/g) || []).length, data.boards.filter(b => b.lang === lang).length);
    assert.ok(html.includes('/secret-of-bees/professores/favo-de-papel.pdf'));
  }
  assert.match(read('assets/site.css'), /@media print/);
  assert.match(read('assets/site.css'), /details:not\(\[open\]\)/);
});

test('Microsoft pt-br badge mapping remains intentionally inverted', () => {
  for (const id of ['home', 'jogo', 'professores']) {
    const html = read(filename(byId[id].paths.pt));
    for (const picture of html.match(/<picture[^>]*>[\s\S]*?<\/picture>/g) || []) {
      if (!picture.includes('get.microsoft.com')) continue;
      assert.match(picture, /<source[^>]*srcset="https:\/\/get.microsoft.com\/images\/pt-br%20dark.svg"/);
      assert.match(picture, /<img[^>]*src="https:\/\/get.microsoft.com\/images\/pt-br%20light.svg"/);
    }
  }
});

test('sitemap enumerates exactly the indexable URLs with all language alternates', () => {
  const xml = read('sitemap.xml');
  assert.ok(xml.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'));
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => m[1]);
  const expected = generated.filter(p => !p.redirect && p.page.id !== '404');
  const blogEntries = blogGenerated.pages.filter(p => p.sitemap).map(p => origin + p.path);
  assert.deepEqual(entries.map(s => /<loc>(.*?)<\/loc>/.exec(s)[1]).sort(), [...expected.map(p => origin + p.path), ...blogEntries].sort());
  for (const item of expected) {
    const entry = entries.find(s => s.includes(`<loc>${origin}${item.path}</loc>`));
    for (const lang of languages) assert.ok(entry.includes(`hreflang="${htmlLang[lang]}" href="${origin}${item.page.paths[lang]}"`));
    assert.ok(entry.includes(`hreflang="x-default" href="${origin}${item.page.paths.pt}"`));
  }
  for (const dir of ['_fonte', 'tests']) assert.ok(read('robots.txt').includes(`Disallow: /${dir}/`));
});

test('protected files remain byte-identical to the migration baseline', () => {
  for (const [p, hash] of Object.entries(JSON.parse(read('_fonte/protegidos.json')))) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex'), hash, p);
});

test('the generator is deterministic and preserves source fragments', () => {
  const files = [...generated.map(p => p.file), ...blogGenerated.pages.map(p => p.file), ...blogGenerated.feeds.map(f => f.file), 'sitemap.xml', 'robots.txt'];
  const before = files.map(p => fs.readFileSync(path.join(root, p)));
  const sourcePaths = pages.flatMap(page => languages.map(lang => `_fonte/conteudo/${lang}/${page.id}.html`));
  const sourceBefore = sourcePaths.map(read);
  execFileSync(process.execPath, ['_fonte/gerar.mjs'], { cwd: root, encoding: 'utf8' });
  files.forEach((p, i) => assert.deepEqual(fs.readFileSync(path.join(root, p)), before[i], p));
  assert.deepEqual(sourcePaths.map(read), sourceBefore);
});

test('generated text and source files are valid BOM-free UTF-8', () => {
  const files = fs.readdirSync(root, { recursive: true }).map(String).filter(p => !p.startsWith('.git') && /\.(?:mjs|js|html|css|json|md|xml|txt)$/.test(p));
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (const p of files) {
    const bytes = fs.readFileSync(path.join(root, p));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [239, 187, 191], p);
    assert.doesNotThrow(() => decoder.decode(bytes), p);
    assert.doesNotMatch(decoder.decode(bytes), /\uFFFD|Ã[\u00a0-\u00bf]|Â[\u00a0-\u00bf]/, p);
  }
});

function languageRun({ current = 'pt', search = '', saved, browser = ['en-US'], storageThrows = false, dismissed = false } = {}) {
  const elements = {};
  function element(a = {}) { return { a, hidden: true, handlers: {}, textContent: '', getAttribute(k) { return this.a[k]; }, setAttribute(k, v) { this.a[k] = v; }, addEventListener(k, fn) { this.handlers[k] = fn; } }; }
  const anchors = languages.map(lang => element({ 'data-idioma': lang, href: byId.jogo.paths[lang] }));
  for (const id of ['language-suggestion', 'language-suggestion-link', 'language-dismiss']) elements[id] = element();
  let stored = saved; const sessions = new Map();
  if (dismissed) sessions.set(`melbees-dismiss-${current}-en`, '1');
  const storage = { getItem() { if (storageThrows) throw new Error('blocked'); return stored; }, setItem(k, value) { if (storageThrows) throw new Error('blocked'); stored = value; } };
  const location = Object.freeze({ href: origin + byId.jogo.paths[current] + search + '#como-jogar', search, hash: '#como-jogar' });
  const document = { documentElement: element({ 'data-idioma': current }), querySelectorAll: () => anchors, getElementById: id => elements[id] };
  vm.runInNewContext(read('assets/language.js'), { document, location, navigator: { languages: browser }, localStorage: storage, sessionStorage: { getItem: k => sessions.get(k), setItem: (k, v) => sessions.set(k, v) }, URL, URLSearchParams });
  return { elements, anchors, stored: () => stored, sessions };
}

test('language preferences suggest links without navigation; query and hash survive', () => {
  for (const options of [{ saved: 'fr' }, { browser: ['fr-FR'] }, { search: '?lang=fr', saved: 'en' }, { storageThrows: true, browser: ['fr-FR'] }]) {
    const run = languageRun({ ...options, search: (options.search || '?s=instagram&cid=site&utm_content=bio') });
    const banner = run.elements['language-suggestion'];
    assert.equal(banner.hidden, false);
    const url = new URL(run.elements['language-suggestion-link'].a.href, origin);
    assert.equal(url.pathname, byId.jogo.paths.fr); assert.equal(url.hash, '#como-jogar');
    if (!options.search) { assert.equal(url.searchParams.get('s'), 'instagram'); assert.equal(url.searchParams.get('cid'), 'site'); assert.equal(url.searchParams.get('utm_content'), 'bio'); }
    else assert.equal(url.searchParams.get('lang'), 'fr');
    run.elements['language-dismiss'].handlers.click(); assert.equal(banner.hidden, true);
  }
  for (const options of [{ saved: 'pt' }, { browser: ['pt-BR'] }, { search: '?lang=pt', saved: 'fr' }, { dismissed: true }]) assert.equal(languageRun(options).elements['language-suggestion'].hidden, true);
  const run = languageRun({ search: '?lang=en&s=instagram' });
  const chosen = run.anchors.find(a => a.a['data-idioma'] === 'es');
  chosen.handlers.click.call(chosen); assert.equal(run.stored(), 'es');
  assert.equal(new URL(chosen.a.href, origin).searchParams.get('lang'), 'es');
  assert.equal(new URL(chosen.a.href, origin).searchParams.get('s'), 'instagram');
  assert.doesNotMatch(read('assets/language.js'), /location\.(?:replace|assign)|location\s*=|userAgent|classList/);
});

test('legacy aliases redirect to Portuguese, preserving arbitrary query and fragment', () => {
  for (const item of generated.filter(i => i.redirect)) {
    const html = read(item.file);
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
    assert.ok(script); assert.match(html, /http-equiv="refresh"/);
    for (const search of ['', '?s=curto&cid=test&lang=fr&custom=%C3%A9']) {
      let destination; const anchor = {};
      vm.runInNewContext(script, { document: { getElementById: () => anchor }, location: { search, hash: '#top', replace: value => { destination = value; } } });
      assert.equal(destination, item.page.paths.pt + (search || item.redirect.fallback) + '#top');
      assert.equal(anchor.href, destination);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------
// Blog. Every scenario generates into a throwaway copy in the OS temp folder; the repository is never written.

const sites = [];
process.on('exit', () => sites.forEach(s => s.cleanup()));
const build = files => { const s = makeSite(files); sites.push(s); const r = s.generate(); assert.ok(r.ok, r.out); return s; };
const pad = n => String(n).padStart(2, '0');
const blogFiles = (site, ext = '.html') => ['blog', 'en/blog', 'es/blog', 'fr/blog'].flatMap(d => site.exists(d) ? fs.readdirSync(path.join(site.dir, d), { recursive: true }).map(String).filter(f => f.endsWith(ext)).map(f => `${d}/${f.replaceAll('\\', '/')}`) : []);
const cards = html => [...html.matchAll(/<li class="card[^"]*"[^>]*>[\s\S]*?<h2><a href="([^"]+)"/g)].map(m => m[1]);
const hreflangs = html => (html.match(/<link\b[^>]*>/g) || []).map(attrs).filter(a => a.rel === 'alternate' && a.hreflang).map(a => `${a.hreflang} ${a.href}`);
const pageOf = (site, urlPath) => site.read(filename(urlPath));
const head = html => /<head>([\s\S]*?)<\/head>/.exec(html)[1];
const ldOf = html => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
function xmlWellFormed(xml) {
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/);
  const body = xml.replace(/^<\?xml[^>]*\?>/, '');
  assert.doesNotMatch(body.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, ''), /&/, 'raw ampersand');
  const stack = []; let pos = 0;
  for (const m of body.matchAll(/<([^<>]*)>/g)) {
    assert.doesNotMatch(body.slice(pos, m.index), /[<>]/);
    pos = m.index + m[0].length;
    const inner = m[1];
    if (inner.startsWith('/')) { assert.equal(stack.pop(), inner.slice(1).trim()); continue; }
    const name = /^([\w:-]+)/.exec(inner)?.[1];
    assert.ok(name, `bad tag <${inner}>`);
    assert.match(inner.slice(name.length), /^(?:\s+[\w:-]+="[^"<]*")*\s*\/?$/, `bad attributes <${inner}>`);
    if (!inner.endsWith('/')) stack.push(name);
  }
  assert.deepEqual(stack, []);
  assert.equal(body.slice(pos).trim(), '');
}

// The repository itself, shaped like a throwaway site, so the same checks run on the committed blog pages.
const repoSite = { dir: root, read, exists: p => fs.existsSync(path.join(root, p)) };

/** Shared page checks for every generated blog page of a site (a throwaway copy or the repository). */
function checkBlogPages(site) {
  const voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  const publisher = /google\.com,\s*(pub-\d+),\s*DIRECT/.exec(read('ads.txt'))[1];
  const tag = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${publisher}" crossorigin="anonymous"></script>`;
  const files = blogFiles(site);
  assert.ok(files.length);
  for (const file of files) {
    const html = site.read(file);
    const urlPath = '/' + file.replace(/index\.html$/, '');
    const lang = /^\/(en|es|fr)\//.exec(urlPath)?.[1] || 'pt';
    assert.match(html, new RegExp(`<html lang="${htmlLang[lang]}"`), file);
    const stack = [];
    for (const token of html.replace(/<!--[\s\S]*?-->/g, '').match(/<\/?[a-z][^>]*>/gi) || []) {
      const name = /^<\/?([\w-]+)/.exec(token)[1].toLowerCase();
      if (token.startsWith('</')) assert.equal(stack.pop(), name, `${file}: ${token}`);
      else if (!voids.has(name) && !token.endsWith('/>')) stack.push(name);
    }
    assert.deepEqual(stack, [], file);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${file}: duplicate id`);
    // An empty category page is noindex and carries no ad (thin content); every other page carries exactly one tag.
    const ads = /<meta name="robots" content="noindex">/.test(html) ? 0 : 1;
    assert.equal(head(html).split(tag).length - 1, ads, `${file}: AdSense tag`);
    assert.equal(html.split('googlesyndication').length - 1, ads, file);
    assert.ok(html.includes(`<link rel="canonical" href="${origin}${urlPath}">`), file);
    assert.doesNotMatch(html, bannedCopy, file);
    for (const t of /<main>([\s\S]*?)<\/main>/.exec(html)[1].match(/<[^>]+\slang="[^"]+"[^>]*>/g) || []) assert.equal(attrs(t).lang, htmlLang[lang], file);
    for (const t of html.match(/<(?:a|img|script|link|source)\b[^>]*>/g) || []) {
      const a = attrs(t); const href = a.href || a.src;
      if (!href || /^(?:mailto:|data:)/.test(href)) continue;
      const url = new URL(href, origin + urlPath);
      if (url.origin !== origin) continue;
      assert.ok(site.exists(filename(decodeURIComponent(url.pathname))), `${file}: ${href}`);
    }
    // The only third-party script is the AdSense tag; nothing from YouTube is in the markup before a click.
    for (const t of html.match(/<script\b[^>]*>/g) || []) { const src = attrs(t).src; assert.ok(!src || src.startsWith('/assets/') || t === tag.slice(0, t.length), `${file}: ${t}`); }
    assert.doesNotMatch(html, /<iframe|youtube-nocookie/i, file);
  }
}

let richSite;
function rich() {
  if (richSite) return richSite;
  const files = {};
  for (let i = 1; i <= 11; i++) files[`pt/post-${pad(i)}`] = article({ title: `Artigo ${i}`, description: `Resumo do artigo ${i}.`, published: `2026-11-${pad(i)}`, updated: i === 1 ? '2026-11-15' : undefined, video: i === 3 ? 'aqz-KE-bpKQ' : undefined, translation: i === 1 ? 'en/post-one' : i === 4 ? 'en/draft-secret' : undefined });
  files['pt/post-12'] = article({ title: 'Tom & Jerry <b>"q"</b> </script>', description: 'Aspas "duplas" & <tags>.', published: '2026-11-12', categories: 'jogos' });
  files['pt/rascunho-secreto'] = article({ title: 'SEGREDO PT', state: 'rascunho' });
  files['en/post-one'] = article({ title: 'Post one', description: 'English summary.', published: '2026-11-01', updated: '2026-11-15', translation: 'pt/post-01' });
  files['en/post-two'] = article({ title: 'Post two', description: 'Second summary.', published: '2026-11-02', categories: 'puzzle' });
  files['en/draft-secret'] = article({ title: 'SECRET EN', state: 'rascunho' });
  return (richSite = build(files));
}

test('blog: the committed example articles are drafts and publish nothing', () => {
  const blog = loadBlog(path.join(root, '_fonte/conteudo'));
  const fixtures = blog.all.filter(a => ['en/example-blog-article', 'pt/exemplo-de-artigo'].includes(`${a.lang}/${a.slug}`));
  assert.deepEqual(fixtures.map(a => a.state), ['rascunho', 'rascunho']);
  // Real articles may be published later; the zero-published checks apply only while nothing is published.
  if (blog.published.length) return;
  assert.deepEqual(blog.langs, []);
  assert.deepEqual(blogGenerated.pages, []);
  for (const dir of ['blog', 'en/blog', 'es/blog', 'fr/blog']) assert.equal(fs.existsSync(path.join(root, dir)), false, dir);
  assert.doesNotMatch(read('sitemap.xml'), /\/blog\b/);
  for (const item of generated) {
    const html = read(item.file);
    assert.doesNotMatch(html, /href="[^"]*\/blog\/"/, item.file);
    assert.doesNotMatch(html, /blog\.css|rss\+xml/, item.file);
  }
});

test('blog: a draft never generates a page, a list entry, a feed item, a sitemap entry or a translation link', () => {
  const site = rich();
  const everything = [...blogFiles(site), ...blogFiles(site, '.xml'), 'sitemap.xml'].map(f => site.read(f)).join('\n');
  for (const secret of ['rascunho-secreto', 'SEGREDO', 'draft-secret', 'SECRET EN']) assert.ok(!everything.includes(secret), secret);
  assert.equal(site.exists('blog/rascunho-secreto/index.html'), false);
  assert.equal(site.exists('en/blog/draft-secret/index.html'), false);
  // post-04 declares a translation that is only a draft: the link is ignored and no hreflang appears.
  assert.deepEqual(hreflangs(pageOf(site, '/blog/post-04/')), []);
});

test('blog: a language without a published article has no index, menu item, footer item, sitemap entry or feed', () => {
  const site = rich();
  for (const dir of ['es', 'fr']) assert.equal(site.exists(`${dir}/blog`), false);
  for (const lang of ['es', 'fr']) {
    const html = site.read(filename(byId.home.paths[lang]));
    assert.doesNotMatch(html, /\/blog\//);
    assert.doesNotMatch(html, new RegExp(`>${labels[lang].blog}<`));
  }
  assert.doesNotMatch(site.read('sitemap.xml'), /\/(?:es|fr)\/blog/);
  for (const lang of ['pt', 'en']) {
    const html = site.read(filename(byId.home.paths[lang]));
    const href = `href="${lang === 'pt' ? '' : '/en'}/blog/"`;
    const menu = /<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1];
    const footer = /<footer>([\s\S]*?)<\/footer>/.exec(html)[1];
    for (const part of [menu, footer]) {
      assert.ok(part.includes(href), `${lang}: Blog link`);
      assert.ok(part.indexOf(href) > part.indexOf(`href="${byId.imprensa.paths[lang]}"`) && part.indexOf(href) < part.indexOf(`href="${byId.sobre.paths[lang]}"`));
    }
  }
});

test('blog: unpublishing everything removes the pages, the feed, the menu item and the sitemap entries', () => {
  const site = build({ 'pt/a': article({ title: 'A' }), 'en/b': article({ title: 'B' }) });
  assert.ok(site.exists('blog/index.html') && site.exists('en/blog/feed.xml') && site.exists('blog/a/index.html'));
  site.set('pt/a', article({ title: 'A', state: 'rascunho' }));
  site.set('en/b', article({ title: 'B', state: 'rascunho' }));
  assert.ok(site.generate().ok);
  for (const dir of ['blog', 'en/blog']) assert.equal(site.exists(dir), false, `${dir} should be removed`);
  assert.doesNotMatch(site.read('sitemap.xml'), /\/blog/);
  assert.doesNotMatch(site.read('index.html'), /href="\/blog\/"/);
  // Only the blog is touched: the rest of the site is still there.
  assert.ok(site.exists('en/index.html') && site.exists('secret-of-bees/index.html'));
});

test('blog: the index paginates at 10 and recomputes as articles come and go', () => {
  assert.equal(PAGE_SIZE, 10);
  const files = {};
  for (let i = 1; i <= 10; i++) files[`pt/p${pad(i)}`] = article({ title: `P${i}`, published: `2026-11-${pad(i)}` });
  const site = build(files);
  assert.equal(cards(site.read('blog/index.html')).length, 10);
  assert.equal(site.exists('blog/pagina'), false, '10 articles fit one page');
  assert.doesNotMatch(site.read('blog/index.html'), /class="pager"/);
  site.set('pt/p11', article({ title: 'P11', published: '2026-11-11' }));
  assert.ok(site.generate().ok);
  const first = site.read('blog/index.html'), second = site.read('blog/pagina/2/index.html');
  assert.deepEqual(cards(first).slice(0, 2), ['/blog/p11/', '/blog/p10/']);
  assert.equal(cards(first).length, 10); assert.deepEqual(cards(second), ['/blog/p01/']);
  assert.match(first, /<a rel="next" href="\/blog\/pagina\/2\/">/); assert.doesNotMatch(first, /rel="prev"/);
  assert.match(second, /<a rel="prev" href="\/blog\/">/); assert.doesNotMatch(second, /rel="next"/);
  assert.ok(second.includes(`<link rel="canonical" href="${origin}/blog/pagina/2/">`));
  assert.equal(site.exists('blog/pagina/3'), false); assert.equal(site.exists('blog/pagina/1'), false);
  const sitemap = site.read('sitemap.xml');
  assert.ok(sitemap.includes(`<loc>${origin}/blog/</loc>`)); assert.doesNotMatch(sitemap, /\/pagina\//);
  site.remove('pt/p11');
  assert.ok(site.generate().ok);
  assert.equal(site.exists('blog/pagina'), false, 'page 2 goes away when 10 articles remain');
  assert.equal(cards(site.read('blog/index.html')).length, 10);
  checkBlogPages(site);
});

test('blog: every fixed category has a page in a language with a blog; the empty ones say so, are noindex and stay out of the sitemap', () => {
  const site = rich();
  const ids = Object.keys(blogCategories);
  assert.deepEqual(ids, ['ciencia', 'educacao', 'cultura', 'puzzle', 'jogos', 'musical', 'news']);
  for (const id of ids) {
    assert.ok(site.exists(`blog/categoria/${blogCategories[id].slug.pt}/index.html`), `pt ${id}`);
    assert.ok(site.exists(`en/blog/category/${blogCategories[id].slug.en}/index.html`), `en ${id}`);
  }
  for (const dir of ['es/blog', 'fr/blog']) assert.equal(site.exists(dir), false, 'languages without an article have no blog pages at all');
  const s1 = pageOf(site, '/blog/categoria/news/'), s2 = pageOf(site, '/blog/categoria/news/pagina/2/');
  assert.equal(cards(s1).length, 10); assert.deepEqual(cards(s2), ['/blog/post-01/']);
  assert.deepEqual(cards(pageOf(site, '/blog/categoria/jogos/')), ['/blog/post-12/']);
  const empty = pageOf(site, '/blog/categoria/ciencia/');
  assert.deepEqual(cards(empty), []);
  assert.match(empty, /<p class="vazio">Ainda não há artigos nesta seção\.<\/p>/);
  assert.match(head(empty), /<meta name="robots" content="noindex">/);
  assert.deepEqual(hreflangs(empty), []);
  assert.doesNotMatch(empty, /class="pager"/);
  assert.match(pageOf(site, '/en/blog/category/science/'), /There are no articles in this section yet\./);
  const sitemap = site.read('sitemap.xml');
  assert.doesNotMatch(sitemap, /categoria\/(?:ciencia|educacao|cultura|musical)\/|category\/(?:science|education|culture|music|games)\//);
  assert.ok(sitemap.includes(`<loc>${origin}/blog/categoria/jogos/</loc>`) && sitemap.includes(`<loc>${origin}/blog/categoria/news/</loc>`));
  assert.ok(sitemap.includes(`<loc>${origin}/en/blog/category/puzzle/</loc>`));
  // The filter buttons exist on index and category pages, link to all seven pages and mark the current one.
  const nav = /<nav class="filtros"[^>]*>([\s\S]*?)<\/nav>/.exec(pageOf(site, '/blog/'))[1];
  assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(m => m[1]), ['/blog/', ...ids.map(id => `/blog/categoria/${blogCategories[id].slug.pt}/`)]);
  assert.match(nav, /<a href="\/blog\/" aria-current="page">/);
  assert.match(/<nav class="filtros"[\s\S]*?<\/nav>/.exec(empty)[0], /<a href="\/blog\/categoria\/ciencia\/" aria-current="page">/);
  assert.deepEqual(nav.match(/<span class="fl">[^<]*<\/span>/g).map(x => x.replace(/<[^>]+>/g, '')), ['Todas', 'Ciência', 'Educação', 'Cultura', 'Puzzle', 'Jogos', 'Musical', 'News']);
  // The language button of a category page goes to the same category in the other language.
  assert.match(empty, /<a data-idioma="en"[^>]*href="\/en\/blog\/category\/science\/"/);
  checkBlogPages(site);
});

test('blog: every empty category page is noindex, carries no AdSense, and is out of the sitemap and of every hreflang set', () => {
  const site = rich();
  const sitemap = site.read('sitemap.xml');
  const empties = [];
  for (const [lang, base, route] of [['pt', '/blog/', 'categoria'], ['en', '/en/blog/', 'category']]) for (const id of Object.keys(blogCategories)) {
    const urlPath = `${base}${route}/${blogCategories[id].slug[lang]}/`;
    if (pageOf(site, urlPath).includes('<p class="vazio">')) empties.push(urlPath);
  }
  // rich(): pt has News and Jogos, en has News and Puzzle; the other categories are empty.
  assert.deepEqual(empties, ['/blog/categoria/ciencia/', '/blog/categoria/educacao/', '/blog/categoria/cultura/', '/blog/categoria/puzzle/', '/blog/categoria/musical/', '/en/blog/category/science/', '/en/blog/category/education/', '/en/blog/category/culture/', '/en/blog/category/games/', '/en/blog/category/music/']);
  const allHreflangs = blogFiles(site).flatMap(f => hreflangs(site.read(f)));
  for (const urlPath of empties) {
    const html = pageOf(site, urlPath);
    assert.match(head(html), /<meta name="robots" content="noindex">/, urlPath);
    assert.equal(html.split('googlesyndication').length - 1, 0, `${urlPath}: no AdSense`);
    assert.deepEqual(hreflangs(html), [], `${urlPath}: no hreflang of its own`);
    assert.ok(!sitemap.includes(`${origin}${urlPath}"`) && !sitemap.includes(`${origin}${urlPath}<`), `${urlPath}: out of the sitemap, as a loc and as an alternate`);
    assert.ok(!allHreflangs.some(h => h.endsWith(` ${origin}${urlPath}`)), `${urlPath}: no other page points to it`);
  }
  // A category with posts in one language only has no hreflang (pt Jogos is not empty, en Games is).
  assert.deepEqual(hreflangs(pageOf(site, '/blog/categoria/jogos/')), []);
  assert.deepEqual(hreflangs(pageOf(site, '/blog/categoria/news/')).sort(), [`pt-BR ${origin}/blog/categoria/news/`, `en ${origin}/en/blog/category/news/`, `x-default ${origin}/blog/categoria/news/`].sort());
});

test('blog: the category buttons and the article badges show the host avatar: Hug in Ciência, Red in Jogos, Mel in the others', () => {
  const hosts = Object.fromEntries(Object.entries(blogCategories).map(([id, c]) => [id, c.host]));
  assert.deepEqual(hosts, { ciencia: 'hug', educacao: 'mel', cultura: 'mel', puzzle: 'mel', jogos: 'red', musical: 'mel', news: 'mel' });
  const site = build({ 'pt/a': article({ title: 'A', categories: 'ciencia, jogos, puzzle' }), 'en/b': article({ title: 'B', categories: 'jogos' }) });
  const avatars = part => [...part.matchAll(/<img src="\/assets\/blog\/hosts\/([a-z]+)-avatar\.webp" alt=""/g)].map(m => m[1]);
  for (const urlPath of ['/blog/', '/blog/categoria/cultura/', '/en/blog/', '/en/blog/category/games/']) {
    const nav = /<nav class="filtros"[^>]*>([\s\S]*?)<\/nav>/.exec(pageOf(site, urlPath))[1];
    const buttons = [...nav.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map(m => m[1]);
    assert.equal(buttons.length, 8, urlPath);
    assert.match(buttons[0], /<svg class="hx"/, `${urlPath}: "all" keeps the honey hexagon`);
    assert.deepEqual(buttons.slice(1).map(b => avatars(b)), Object.values(hosts).map(h => [h]), urlPath);
  }
  const chips = [...pageOf(site, '/blog/a/').matchAll(/<a class="chip" href="[^"]+">([\s\S]*?)<\/a>/g)].map(m => m[1]);
  assert.deepEqual(chips.map(c => avatars(c)), [['hug'], ['red'], ['mel']]);
  assert.deepEqual(chips.map(c => c.replace(/<[^>]+>/g, '')), ['Ciência', 'Jogos', 'Puzzle']);
  assert.doesNotMatch(pageOf(site, '/blog/a/'), /class="dot"/);
  for (const host of ['hug', 'mel', 'red']) assert.ok(site.exists(`assets/blog/hosts/${host}-avatar.webp`), host);
  checkBlogPages(site);
});

test('blog: a post in several categories shows one badge each, appears in each filter, and takes colour, host and breadcrumb from the first', () => {
  const site = build({ 'pt/enem': article({ title: 'Música do Enem', categories: 'educacao, musical', balloon: 'Cante junto.', published: '2026-11-05' }), 'pt/hug': article({ title: 'Bichos', categories: 'ciencia', published: '2026-11-04' }) });
  assert.deepEqual(cards(pageOf(site, '/blog/')), ['/blog/enem/', '/blog/hug/']);
  assert.deepEqual(cards(pageOf(site, '/blog/categoria/educacao/')), ['/blog/enem/']);
  assert.deepEqual(cards(pageOf(site, '/blog/categoria/musical/')), ['/blog/enem/']);
  assert.deepEqual(cards(pageOf(site, '/blog/categoria/ciencia/')), ['/blog/hug/']);
  const card = /<li class="card[^"]*"[^>]*>[\s\S]*?<\/li>/.exec(pageOf(site, '/blog/'))[0];
  assert.equal([...card.matchAll(/<span class="tag"/g)].length, 2);
  assert.ok(card.includes(`style="--c:${blogCategories.educacao.bg};--ci:${blogCategories.educacao.ink}"`), 'first category gives the colour');
  const html = pageOf(site, '/blog/enem/');
  assert.ok(html.includes(`<div class="hero-b" style="--c:${blogCategories.educacao.bg};--ci:${blogCategories.educacao.ink}">`));
  assert.deepEqual([...html.matchAll(/<a class="chip" href="([^"]+)"/g)].map(m => m[1]), ['/blog/categoria/educacao/', '/blog/categoria/musical/']);
  assert.match(html, /<img src="\/assets\/blog\/hosts\/mel\.webp"/, 'Educação host is Mel');
  assert.match(html, /<div class="bub"><p>Cante junto\.<\/p><small>Mel<\/small><\/div>/);
  assert.match(pageOf(site, '/blog/hug/'), /hosts\/hug\.webp/);
  const crumbs = [...(/<nav class="breadcrumbs"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1]).matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1].replace(/<[^>]+>/g, ''));
  assert.deepEqual(crumbs, ['Início', 'Blog', 'Educação', 'Música do Enem'.replace('Música', 'Música')]);
  const ld = ldOf(html)['@graph'];
  assert.deepEqual(ld[0].articleSection, ['Educação', 'Musical']);
  assert.deepEqual(ld[1].itemListElement.map(i => i.name), crumbs);
  const feed = site.read('blog/feed.xml');
  assert.match(feed, /<category>Educação<\/category><category>Musical<\/category>/);
  assert.equal([...feed.matchAll(/<item>/g)].length, 2, 'one item per article, not per category');
  // "Keep reading": the other articles, the ones sharing more categories first, never the article itself.
  const more = /<aside class="mais"[\s\S]*?<\/aside>/.exec(html)[0];
  assert.ok(more.includes('href="/blog/hug/"') && !more.includes('href="/blog/enem/"'));
  checkBlogPages(site);
});

test('blog: a category that loses its last article stays as an empty noindex page; the last article of a language removes them all', () => {
  const site = build({ 'pt/a': article({ title: 'A', categories: 'ciencia' }), 'pt/b': article({ title: 'B', categories: 'jogos' }) });
  assert.deepEqual(cards(pageOf(site, '/blog/categoria/ciencia/')), ['/blog/a/']);
  assert.ok(site.read('sitemap.xml').includes('/blog/categoria/ciencia/'));
  site.set('pt/a', article({ title: 'A', categories: 'ciencia', state: 'rascunho' }));
  assert.ok(site.generate().ok);
  const html = pageOf(site, '/blog/categoria/ciencia/');
  assert.match(html, /class="vazio"/); assert.match(head(html), /noindex/); assert.doesNotMatch(html, /googlesyndication/);
  assert.equal(site.exists('blog/categoria/ciencia/pagina'), false, 'an empty category has page 1 only');
  assert.doesNotMatch(site.read('sitemap.xml'), /categoria\/ciencia\//);
  assert.doesNotMatch(site.read('blog/feed.xml'), /<category>Ciência/);
  site.set('pt/b', article({ title: 'B', categories: 'jogos', state: 'rascunho' }));
  assert.ok(site.generate().ok);
  assert.equal(site.exists('blog'), false);
});

test('blog: the header takes categorias; serie, empty, repeated and unknown ids are refused with the file named', () => {
  const ctx = { lang: 'pt', slug: 'x', file: 'pt/blog/x.html' };
  assert.deepEqual(parseArticle(article({ categories: 'educacao,  musical' }), ctx).categories, ['educacao', 'musical']);
  assert.throws(() => parseArticle('---\ntitulo: A\nserie: duelo\nestado: rascunho\n---\n', ctx), /x\.html: a chave "serie" foi substituída por "categorias"/);
  for (const [categories, message] of [['', /categorias está vazia/], ['nao-existe', /categoria "nao-existe" não existe/], ['ciencia, ciencia', /repetidas/], ['Ciencia', /não existe/]]) {
    assert.throws(() => parseArticle(article({ categories, state: 'rascunho' }), ctx), message, categories);
  }
  assert.throws(() => parseArticle(article({ categories: null }), ctx), /categorias é obrigatório/);
  parseArticle(article({ categories: null, state: 'rascunho' }), ctx);
  for (const bad of ['', 'x'.repeat(121)]) assert.throws(() => parseArticle(`---\ntitulo: A\nbalao: ${bad}\nestado: rascunho\n---\n`, ctx), /balao/, bad);
  assert.throws(() => parseArticle(article({ balloon: 'Sorteio de prêmio' }), ctx), /balao contém texto proibido/);
  for (const bad of ['../a.webp|x', 'a.webp', 'a.webp|', '/a.webp|x', 'a.gif|x', 'dir/a.webp|x']) assert.throws(() => parseArticle(article({ gallery: bad, state: 'rascunho' }), ctx), /galeria/, bad);
  // Slugs of the category routes are reserved, in every language.
  for (const slug of ['categoria', 'category', 'categorie', 'pagina', 'page', 'feed', 'index']) {
    const site = makeSite({ [`pt/${slug}`]: article({ title: 'A' }) }); sites.push(site);
    assert.match(site.generate().out, /reservado/, slug);
  }
});

test('blog: the gallery lists only declared pictures, in order, and never repeats a picture already in the text', () => {
  const body = '<p>Intro.</p><figure><img src="/assets/blog/post/a.webp?v=2#x" alt="A" width="10" height="10"></figure><h2>Parte</h2><p>Mais.</p>';
  const site = makeSite({ 'pt/post': article({ title: 'Post', body, gallery: 'a.webp|A de novo; b.webp|Figura B; c.png|Figura C' }), 'pt/all': article({ title: 'Todas', body: '<p>x</p><img src="/assets/blog/all/z.webp" alt="Z">', gallery: 'z.webp|Z', published: '2026-11-01' }), 'pt/none': article({ title: 'Nenhuma', published: '2026-11-02' }) });
  sites.push(site);
  for (const [slug, file] of [['post', 'a.webp'], ['post', 'b.webp'], ['post', 'c.png'], ['all', 'z.webp']]) { fs.mkdirSync(path.join(site.dir, 'assets/blog', slug), { recursive: true }); fs.writeFileSync(path.join(site.dir, 'assets/blog', slug, file), 'x'); }
  const r = site.generate(); assert.ok(r.ok, r.out);
  const gallery = /<section class="gal"[\s\S]*?<\/section>/.exec(pageOf(site, '/blog/post/'))[0];
  assert.deepEqual([...gallery.matchAll(/<img src="([^"]+)"/g)].map(m => m[1]), ['/assets/blog/post/b.webp', '/assets/blog/post/c.png']);
  assert.ok(!gallery.includes('a.webp'));
  assert.match(gallery, /<figcaption>1 de 2<\/figcaption>/); assert.match(gallery, /tabindex="0"/);
  const text = pageOf(site, '/blog/post/');
  assert.equal(text.split('/assets/blog/post/a.webp').length - 1, 1, 'the picture appears once, in the text');
  assert.doesNotMatch(pageOf(site, '/blog/all/'), /class="gal"/, 'all repeated: no gallery');
  assert.doesNotMatch(pageOf(site, '/blog/none/'), /class="gal"/, 'none declared: no gallery');
  checkBlogPages(site);
  // A missing file stops a published article; a draft needs nothing.
  site.set('pt/post', article({ title: 'Post', gallery: 'sumiu.webp|Sumiu' }));
  const bad = site.generate(); assert.equal(bad.ok, false); assert.match(bad.out, /galeria "sumiu\.webp" não existe/);
  site.set('pt/post', article({ title: 'Post', gallery: 'sumiu.webp|Sumiu', state: 'rascunho' }));
  assert.ok(site.generate().ok);
});

test('blog: thumbnail and gallery read src in every valid form, ignore comments and data-src, and the gallery takes exactly one | per item, each file once', () => {
  const ctx = { lang: 'pt', slug: 'x', file: 'pt/blog/x.html' };
  const parse = (body, gallery) => parseArticle(article({ body, gallery }), ctx);
  assert.deepEqual(imageSources([
    '<!-- <img src="/assets/blog/x/comentario.webp" alt=""> -->',
    `<img alt='Simples' src='/assets/blog/x/simples.webp'>`,
    '<IMG ALT="Espaços" SRC = "/assets/blog/x/espacos.webp?v=2" />',
    '<img src=/assets/blog/x/sem-aspas.webp alt=nada>',
    '<img alt="a > b e src=falso.webp" data-src="/assets/blog/x/data.webp" src="/assets/blog/x/depois.webp?a=1&amp;b=2#f">',
    '<img alt="sem src">',
  ].join('\n')), ['/assets/blog/x/simples.webp', '/assets/blog/x/espacos.webp?v=2', '/assets/blog/x/sem-aspas.webp', '/assets/blog/x/depois.webp?a=1&b=2#f']);
  // The thumbnail is the first picture outside comments, whatever the quoting.
  assert.equal(parse('<!-- <img src="/assets/blog/x/velha.webp" alt=""> --><p>a</p><img alt="A" src=\'/assets/blog/x/a.webp\'>').thumb, '/assets/blog/x/a.webp');
  assert.equal(parse('<p>a</p><img src = "/assets/blog/x/b.webp" alt="B">').thumb, '/assets/blog/x/b.webp');
  assert.equal(parse('<p>Sem figura.</p><!-- <img src="/assets/blog/x/c.webp"> -->').thumb, undefined);
  // Pictures in the text, in any form, leave the gallery; a picture only in a comment or in data-src stays.
  const body = [
    `<figure><img src='/assets/blog/x/simples.webp' alt="S"></figure>`,
    '<figure><img src = "/assets/blog/x/espacos.webp" alt="E"></figure>',
    '<figure><img src=/assets/blog/x/sem-aspas.webp alt="N"></figure>',
    '<!-- <img src="/assets/blog/x/comentario.webp" alt=""> -->',
    '<img data-src="/assets/blog/x/data.webp" src="/assets/blog/x/outra.webp" alt="O">',
  ].join('');
  const g = parse(body, 'simples.webp|S; espacos.webp|E; sem-aspas.webp|N; comentario.webp|C; data.webp|D; outra.webp|O').gallery;
  assert.deepEqual(g.map(x => x.file), ['comentario.webp', 'data.webp']);
  // Exactly one | per item.
  for (const bad of ['a.webp|Figura | A', 'a.webp||A', 'a.webp|A|', '|a.webp|A']) assert.throws(() => parseArticle(article({ gallery: bad, state: 'rascunho' }), ctx), /x\.html: galeria/, bad);
  assert.deepEqual(parseArticle(article({ gallery: ' a.webp | Figura A ;b.png|B ' }), ctx).gallery, [{ file: 'a.webp', alt: 'Figura A' }, { file: 'b.png', alt: 'B' }]);
  // The same file twice is refused, in a draft too.
  for (const state of ['rascunho', 'publicado']) assert.throws(() => parseArticle(article({ gallery: 'a.webp|A; b.webp|B; a.webp|De novo', state }), ctx), /x\.html: galeria "a\.webp" aparece mais de uma vez/, state);
});

test('blog: the committed articles have the decided categories, and never use the Secret-revealing picture', () => {
  const blog = loadBlog(path.join(root, '_fonte/conteudo'));
  const by = Object.fromEntries(blog.all.filter(a => a.lang === 'pt').map(a => [a.slug, a]));
  assert.deepEqual(by['hug-abelhas-do-chao'].categories, ['ciencia']);
  assert.deepEqual(by['enem-media-mediana-moda'].categories, ['educacao', 'musical']);
  assert.deepEqual(by['desafie-um-amigo-ao-vivo'].categories, ['jogos']);
  // Draft or published: the Owner publishes by switching estado, and that must not break this suite.
  for (const slug of ['hug-abelhas-do-chao', 'enem-media-mediana-moda', 'desafie-um-amigo-ao-vivo']) assert.ok(STATES.includes(by[slug].state), slug);
  const files = publicFiles(path.join(root, 'assets/blog'), 'assets/blog/');
  assert.ok(files.length > 3);
  for (const f of files) assert.doesNotMatch(f, /um-favo-dois-favos/, f);
  for (const slug of Object.keys(by)) for (const [, src] of read(`_fonte/conteudo/pt/blog/${slug}.html`).matchAll(/src="(\/assets\/blog\/[^"]+)"/g)) {
    assert.doesNotMatch(src, /um-favo-dois-favos/);
    assert.ok(fs.existsSync(path.join(root, src.slice(1))), `${slug}: ${src}`);
  }
  for (const f of files) assert.ok(fs.statSync(path.join(root, f)).size < 1024 * 1024, f);
  // The Duelo figure is the web Daily's Duelo tab (Criar sala, Entrar em sala): no board, word or Secret on it.
  const duelo = read('_fonte/conteudo/pt/blog/desafie-um-amigo-ao-vivo.html');
  const figure = attrs(/<img\b[^>]*duelo-salas\.webp[^>]*>/.exec(duelo)[0]);
  assert.equal(figure.src, '/assets/blog/desafie-um-amigo-ao-vivo/duelo-salas.webp');
  assert.match(figure.alt, /aba Duelo/); assert.match(figure.alt, /Criar sala/); assert.match(figure.alt, /Entrar em sala/);
  assert.ok(Number(figure.width) > 0 && Number(figure.height) > 0);
  assert.equal(imageSources(duelo)[0], figure.src, 'the first picture of the text, so also the card thumbnail');
});

test('blog: the three committed articles build when published and pass every page check', () => {
  const files = {};
  for (const slug of ['hug-abelhas-do-chao', 'enem-media-mediana-moda', 'desafie-um-amigo-ao-vivo']) files[`pt/${slug}`] = read(`_fonte/conteudo/pt/blog/${slug}.html`).replace('estado: rascunho', 'estado: publicado');
  const site = build(files);
  checkBlogPages(site);
  assert.deepEqual(cards(pageOf(site, '/blog/categoria/musical/')), ['/blog/enem-media-mediana-moda/']);
  assert.deepEqual(cards(pageOf(site, '/blog/categoria/educacao/')), ['/blog/enem-media-mediana-moda/']);
  assert.match(pageOf(site, '/blog/categoria/puzzle/'), /Ainda não há artigos nesta seção\./);
  for (const html of Object.keys(files).map(k => pageOf(site, `/blog/${k.slice(3)}/`))) assert.doesNotMatch(html, /um-favo-dois-favos|GUAXINIM/i);
  // Every picture of a figure in the text appears once on its page (the gallery never repeats it).
  for (const k of Object.keys(files)) { const html = pageOf(site, `/blog/${k.slice(3)}/`); for (const [, src] of html.matchAll(/<img src="(\/assets\/blog\/(?!hosts\/)[^"]+)"/g)) assert.equal(html.split(`src="${src}"`).length - 1, 1, `${k}: ${src}`); }
});

test('blog: newest first, ties broken by slug', () => {
  const site = build({ 'pt/zeta': article({ title: 'Z', published: '2026-11-05' }), 'pt/alfa': article({ title: 'A', published: '2026-11-05' }), 'pt/meio': article({ title: 'M', published: '2026-11-05' }), 'pt/antigo': article({ title: 'O', published: '2026-10-01' }), 'pt/novo': article({ title: 'N', published: '2026-11-09' }) });
  assert.deepEqual(cards(site.read('blog/index.html')), ['/blog/novo/', '/blog/alfa/', '/blog/meio/', '/blog/zeta/', '/blog/antigo/']);
});

test('blog: hreflang appears only between translations that exist', () => {
  const site = rich();
  const one = ['pt-BR ' + origin + '/blog/post-01/', 'en ' + origin + '/en/blog/post-one/', 'x-default ' + origin + '/blog/post-01/'];
  assert.deepEqual(hreflangs(pageOf(site, '/blog/post-01/')).sort(), one.sort(), 'declared on the pt side only, reciprocal anyway');
  assert.deepEqual(hreflangs(pageOf(site, '/en/blog/post-one/')).sort(), one.sort());
  assert.deepEqual(hreflangs(pageOf(site, '/blog/post-02/')), []);
  assert.deepEqual(hreflangs(pageOf(site, '/en/blog/post-two/')), []);
  assert.deepEqual(hreflangs(pageOf(site, '/blog/')).sort(), ['pt-BR ' + origin + '/blog/', 'en ' + origin + '/en/blog/', 'x-default ' + origin + '/blog/'].sort());
  assert.deepEqual(hreflangs(pageOf(site, '/blog/pagina/2/')), []);
  assert.equal(hreflangs(pageOf(site, '/blog/categoria/news/')).length, 3);
  assert.deepEqual(hreflangs(pageOf(site, '/blog/categoria/jogos/')), [], 'category only in pt');
  const xml = site.read('sitemap.xml');
  const entry = loc => new RegExp(`<url><loc>${loc.replaceAll('/', '\\/')}<\\/loc>.*?<\\/url>`).exec(xml)[0];
  assert.equal((entry(`${origin}/blog/post-01/`).match(/xhtml:link/g) || []).length, 3);
  assert.equal((entry(`${origin}/blog/post-02/`).match(/xhtml:link/g) || []).length, 0);
  // Language buttons: the translation, else the other blog, else the home page.
  const buttons = html => Object.fromEntries([...html.matchAll(/<a data-idioma="(\w+)"[^>]*href="([^"]+)"/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(buttons(pageOf(site, '/blog/post-01/')), { pt: '/blog/post-01/', en: '/en/blog/post-one/', es: '/es/', fr: '/fr/' });
  assert.deepEqual(buttons(pageOf(site, '/blog/post-02/')), { pt: '/blog/post-02/', en: '/en/blog/', es: '/es/', fr: '/fr/' });
  assert.equal(buttons(pageOf(site, '/blog/pagina/2/')).en, '/en/blog/');
});

test('blog: translation errors stop the generator and keep the previous output', () => {
  const site = build({ 'pt/a': article({ title: 'A' }), 'en/b': article({ title: 'B' }) });
  const before = site.read('blog/index.html');
  const cases = [
    ['pt/a', article({ title: 'A', translation: 'en/inexistente' }), /inexistente/],
    ['pt/a', article({ title: 'A', translation: 'pt/outro' }), /traducao/],
    ['pt/a', article({ title: 'A', translation: 'xx/a' }), /traducao/],
    ['pt/a', article({ title: 'A', translation: 'b' }), /traducao/],
    ['pt/a', article({ title: 'A', video: 'curto' }), /video/],
    ['pt/a', article({ title: 'A', body: '<h1>x</h1>' }), /<h1/],
    ['pt/a', article({ title: 'A', body: '<p>x</p><iframe src="https://example.com"></iframe>' }), /<iframe/],
    ['pt/a', article({ title: 'A', body: '<p>aberto' }), /fechamento|sem fechamento/],
    ['pt/a', article({ title: 'A', published: '2026-02-30' }), /data real/],
    ['pt/a', article({ title: 'A', published: '2026-11-10', updated: '2026-11-09' }), /anterior/],
    ['pt/a', article({ title: null }), /titulo/],
    ['pt/a', article({ title: 'A', categories: 'nao-existe' }), /categoria/],
    ['pt/a', article({ title: 'A', gallery: 'x.gif|a' }), /galeria/],
    ['pt/a', article({ title: 'A', state: 'agendado' }), /estado/],
    ['pt/a', '---\ntitulo: A\nfoo: bar\nestado: rascunho\n---\n', /chave desconhecida/],
    ['pt/a', '---\ntitulo: A\ntitulo: B\nestado: rascunho\n---\n', /repetida/],
    ['pt/a', 'sem cabeçalho\n', /---/],
    ['pt/categoria', article({ title: 'A' }), /reservado/],
    ['pt/Maiuscula', article({ title: 'A' }), /slug/],
  ];
  for (const [key, text, message] of cases) {
    site.set(key, text);
    const r = site.generate();
    assert.equal(r.ok, false, text);
    assert.match(r.out, message, text);
    assert.equal(site.read('blog/index.html'), before, 'failed run must not change the output');
    if (key !== 'pt/a') site.remove(key); else site.set('pt/a', article({ title: 'A' }));
  }
  // Two articles of one language in the same translation group.
  site.set('en/c', article({ title: 'C', translation: 'pt/a' }));
  site.set('en/b', article({ title: 'B', translation: 'pt/a' }));
  const r = site.generate(); assert.equal(r.ok, false); assert.match(r.out, /conflito/);
});

test('blog: sitemap and RSS are well-formed and list exactly the published pages', () => {
  const site = rich();
  const sitemap = site.read('sitemap.xml');
  xmlWellFormed(sitemap);
  const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => m[1]);
  const locs = entries.map(e => /<loc>(.*?)<\/loc>/.exec(e)[1]);
  assert.equal(new Set(locs).size, locs.length);
  const blogLocs = locs.filter(l => /\/blog\//.test(l)).map(l => l.slice(origin.length)).sort();
  const expected = ['/blog/', '/blog/categoria/news/', '/blog/categoria/jogos/', ...Array.from({ length: 12 }, (_, i) => `/blog/post-${pad(i + 1)}/`), '/en/blog/', '/en/blog/category/news/', '/en/blog/category/puzzle/', '/en/blog/post-one/', '/en/blog/post-two/'].sort();
  assert.deepEqual(blogLocs, expected);
  assert.equal(locs.length - blogLocs.length, 48, 'the 48 existing entries are unchanged');
  for (const e of entries.filter(e => /\/blog\//.test(e))) assert.match(e, /<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  assert.ok(sitemap.includes(`<loc>${origin}/blog/post-01/</loc><lastmod>2026-11-15</lastmod>`), 'article lastmod = updated');
  assert.ok(sitemap.includes(`<loc>${origin}/blog/post-02/</loc><lastmod>2026-11-02</lastmod>`), 'updated defaults to published');
  assert.ok(sitemap.includes(`<loc>${origin}/blog/</loc><lastmod>2026-11-15</lastmod>`), 'index lastmod = newest update');
  assert.doesNotMatch(sitemap.split('\n').filter(l => !/\/blog\//.test(l)).join('\n'), /lastmod/);

  const feed = site.read('blog/feed.xml');
  xmlWellFormed(feed);
  assert.match(feed, /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/);
  const items = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
  assert.equal(items.length, 12);
  const field = (s, name) => new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(s)?.[1];
  assert.equal(field(items[0], 'link'), `${origin}/blog/post-12/`);
  assert.equal(field(items[0], 'title'), 'Tom &amp; Jerry &lt;b&gt;&quot;q&quot;&lt;/b&gt; &lt;/script&gt;');
  assert.equal(field(items[0], 'pubDate'), 'Thu, 12 Nov 2026 12:00:00 GMT');
  assert.match(items[0], /<guid isPermaLink="true">https:\/\/melbees\.games\/blog\/post-12\/<\/guid>/);
  assert.equal(field(feed, 'lastBuildDate'), 'Sun, 15 Nov 2026 12:00:00 GMT');
  assert.equal(field(feed, 'language'), 'pt-BR');
  assert.ok(feed.includes(`<atom:link href="${origin}/blog/feed.xml" rel="self" type="application/rss+xml"/>`));
  assert.deepEqual(items.map(i => field(i, 'link')), Array.from({ length: 12 }, (_, i) => `${origin}/blog/post-${pad(12 - i)}/`));
  const en = site.read('en/blog/feed.xml');
  xmlWellFormed(en);
  assert.equal([...en.matchAll(/<item>/g)].length, 2); assert.match(en, /<language>en<\/language>/);
  assert.ok(pageOf(site, '/blog/post-01/').includes(`<link rel="alternate" type="application/rss+xml" title="Blog · Melbees" href="${origin}/blog/feed.xml">`));
  assert.ok(pageOf(site, '/en/blog/').includes(`href="${origin}/en/blog/feed.xml"`));
});

test('blog: the article page has breadcrumbs, author, both dates, category links, the Daily call to action and BlogPosting data', () => {
  const site = rich();
  const html = pageOf(site, '/blog/post-01/');
  const main = /<main>([\s\S]*?)<\/main>/.exec(html)[1];
  const crumbs = [...(/<nav class="breadcrumbs"[^>]*>([\s\S]*?)<\/nav>/.exec(main)[1]).matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1].replace(/<[^>]+>/g, ''));
  assert.deepEqual(crumbs, ['Início', 'Blog', 'News', 'Artigo 1']);
  assert.match(main, /<h1>Artigo 1<\/h1>/);
  assert.match(main, /Por <span class="author">Melbees<\/span>/);
  assert.match(main, /Publicado em <time datetime="2026-11-01">1 de novembro de 2026<\/time>/);
  assert.match(main, /Atualizado em <time datetime="2026-11-15">15 de novembro de 2026<\/time>/);
  const related = /<aside class="mais"[\s\S]*?<\/aside>/.exec(main)[0];
  assert.equal([...related.matchAll(/<li class="mais-card">/g)].length, 4);
  assert.ok(!related.includes('href="/blog/post-01/"') && !related.includes('rascunho') && !related.includes('SEGREDO'));
  assert.ok(related.includes('href="/blog/categoria/news/"'));
  assert.match(main, /<h1>Artigo 1<\/h1>[\s\S]*<div class="host">/);
  const cta = /<div class="cta"><a class="btn" lang="pt-BR" href="(https:\/\/diario\.melbees\.games\/[^"]*)" rel="noopener">Jogar o Diário no navegador<\/a><\/div>/.exec(main);
  assert.ok(cta, 'CTA markup follows the site pattern');
  assert.ok(new URL(cta[1].replaceAll('&amp;', '&')).origin === 'https://diario.melbees.games');
  assert.ok(pageOf(site, '/en/blog/post-one/').includes('href="https://daily.melbees.games/?utm_source=site&amp;utm_medium=web&amp;utm_campaign=blog"'));
  assert.match(head(html), /<meta property="og:type" content="article">/);
  assert.match(head(html), /<title>Artigo 1 · Melbees<\/title>/);
  const ld = ldOf(html);
  const post = ld['@graph'].find(n => n['@type'] === 'BlogPosting');
  assert.equal(post.headline, 'Artigo 1'); assert.equal(post.datePublished, '2026-11-01'); assert.equal(post.dateModified, '2026-11-15');
  assert.equal(post.inLanguage, 'pt-BR'); assert.equal(post.url, `${origin}/blog/post-01/`);
  assert.equal(post.author.name, 'Melbees'); assert.equal(post.publisher.name, 'Melbees'); assert.ok(post.image.length);
  assert.deepEqual(ld['@graph'].find(n => n['@type'] === 'BreadcrumbList').itemListElement.map(i => i.name), crumbs);
  // Awkward characters survive HTML, JSON-LD and the page head intact.
  const odd = pageOf(site, '/blog/post-12/');
  assert.equal(ldOf(odd)['@graph'][0].headline, 'Tom & Jerry <b>"q"</b> </script>');
  assert.match(head(odd), /<title>Tom &amp; Jerry &lt;b&gt;&quot;q&quot;&lt;\/b&gt; &lt;\/script&gt; · Melbees<\/title>/);
  assert.equal((odd.match(/<\/script>/g) || []).length, (odd.match(/<script\b/g) || []).length, 'no stray </script>');
  checkBlogPages(site);
});

test('blog: the video facade ships no iframe and no YouTube script; the click loads the nocookie player', () => {
  const site = rich();
  const html = pageOf(site, '/blog/post-03/');
  assert.doesNotMatch(html, /<iframe/i); assert.doesNotMatch(html, /youtube-nocookie/i);
  const link = attrs(/<a class="video-play"[^>]*>/.exec(html)[0]);
  assert.equal(link['data-video-id'], 'aqz-KE-bpKQ'); assert.equal(link.href, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  const img = attrs(/<div class="video">[\s\S]*?(<img[^>]*>)/.exec(html)[1]);
  assert.equal(new URL(img.src).hostname, 'i.ytimg.com'); assert.ok(img.width && img.height);
  const scripts = (html.match(/<script\b[^>]*>/g) || []).map(attrs).filter(a => a.src).map(a => a.src);
  assert.ok(scripts.includes('/assets/blog.js'));
  for (const src of scripts) assert.ok(src.startsWith('/assets/') || src.startsWith('https://pagead2.googlesyndication.com/'), src);
  assert.doesNotMatch(pageOf(site, '/blog/post-02/'), /blog\.js|video-play/, 'no video, no script');

  const source = read('assets/blog.js');
  function run(id) {
    const slot = { frames: [], querySelector(sel) { return sel === 'iframe' ? this.frames[0] || null : null; }, replaceChild(frame) { this.frames.push(frame); } };
    const anchor = { handlers: {}, parentNode: slot, getAttribute: k => ({ 'data-video-id': id, 'data-title': 'Título' })[k] ?? null, addEventListener(k, fn) { this.handlers[k] = fn; } };
    const document = { querySelectorAll: () => [anchor], createElement: tag => ({ tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, focus() { this.focused = true; } }) };
    vm.runInNewContext(source, { document });
    const click = () => { const e = { currentTarget: anchor, prevented: false, preventDefault() { this.prevented = true; } }; anchor.handlers.click(e); return e; };
    return { slot, click };
  }
  const ok = run('aqz-KE-bpKQ');
  assert.equal(ok.slot.frames.length, 0, 'nothing happens before the click');
  assert.equal(ok.click().prevented, true); ok.click(); ok.click();
  assert.equal(ok.slot.frames.length, 1, 'repeated clicks add no second player');
  const frame = ok.slot.frames[0];
  assert.equal(frame.tag, 'iframe'); assert.equal(frame.title, 'Título'); assert.equal(frame.focused, true);
  const src = new URL(frame.src);
  assert.equal(src.origin, 'https://www.youtube-nocookie.com'); assert.equal(src.pathname, '/embed/aqz-KE-bpKQ');
  for (const bad of ['', 'x', 'aqz-KE-bpKQ"><script>', '../../evil_____']) {
    const r = run(bad); const e = r.click();
    assert.equal(r.slot.frames.length, 0, `invalid id ${bad}`); assert.equal(e.prevented, false);
  }
});

test('blog: the committed blog pages, once any article is published, pass the same page checks as the throwaway sites', () => {
  // Nothing to check while every committed article is a draft (the first blog test proves nothing is generated then).
  if (!blogGenerated.pages.length) return assert.deepEqual(blogFiles(repoSite), []);
  checkBlogPages(repoSite);
  for (const f of blogGenerated.feeds) xmlWellFormed(read(f.file));
});

test('blog: the AdSense tag, third-party scripts, links, balance and banned copy hold on every generated blog page', () => {
  checkBlogPages(rich());
  // The generator refuses the owner's banned words in prose. "Duelo" is not one of them any more (the mode shipped in 1.0.42 and is on the web Daily).
  const prose = makeSite({ 'pt/a': article({ title: 'A', body: '<p>Participe do sorteio.</p>' }) });
  sites.push(prose);
  const r = prose.generate();
  assert.equal(r.ok, false);
  assert.match(r.out, /corpo contém texto proibido/);
});

test('blog: the page text exists for all four languages, so es and fr need only content', () => {
  for (const lang of languages) {
    assert.deepEqual(Object.keys(blogText[lang]).sort(), Object.keys(blogText.pt).sort(), lang);
    assert.ok(labels[lang].blog && daily[lang].startsWith('https://'));
  }
  // es and fr are prepared: names and slugs exist for every category, so a Spanish or French article just builds.
  for (const id of Object.keys(blogCategories)) for (const lang of languages) { assert.ok(blogCategories[id].name[lang], `${id} ${lang}`); assert.match(blogCategories[id].slug[lang], /^[a-z0-9]+(?:-[a-z0-9]+)*$/); }
  const site = build({ 'es/ejemplo': article({ title: 'Ejemplo', categories: 'jogos' }), 'fr/exemple': article({ title: 'Exemple', categories: 'musical, jogos' }) });
  assert.deepEqual(cards(pageOf(site, '/es/blog/categoria/juegos/')), ['/es/blog/ejemplo/']);
  assert.deepEqual(cards(pageOf(site, '/fr/blog/categorie/jeux/')), ['/fr/blog/exemple/']);
  assert.deepEqual(cards(pageOf(site, '/fr/blog/categorie/musique/')), ['/fr/blog/exemple/']);
  assert.match(pageOf(site, '/es/blog/categoria/cultura/'), /Todavía no hay artículos en esta sección\./);
  assert.match(pageOf(site, '/fr/blog/categorie/science/'), /Il n’y a pas encore d’articles dans cette section\./);
  assert.equal(site.exists('blog'), false);
});

test('blog: the parser refuses banned copy, unsafe bodies and bad dates with the file named; <header> passes', () => {
  const ctx = { lang: 'pt', slug: 'x', file: 'pt/blog/x.html' };
  const ok = body => parseArticle(article({ body }), ctx);
  ok('<header><h2>Seção</h2></header><p>Texto.</p>');
  for (const bad of ['<head><p>a</p></head>', '<form><p>a</p></form>', '<img src="a.png" alt=""/onerror=x>', '<a href="javascript:x">a</a>', '<p>Texto — longo</p>', '<p>Participe do sorteio</p>', '<p>Ganhe um prêmio</p>']) assert.throws(() => ok(bad), /x\.html/, bad);
  assert.throws(() => parseArticle(article({ title: 'Sorteio de verão' }), ctx), /titulo/);
  assert.throws(() => parseArticle(article({ description: 'Bom — ruim' }), ctx), /descricao/);
  for (const date of ['2026-13-01', '2026-11-00', '2026-02-30']) assert.throws(() => parseArticle(article({ published: date }), ctx), /x\.html: publicado deve ser uma data real/, date);
  ok('<p>Wordle e Termo inspiram o jogo.</p>'); // allowed in posts
  ok('<p>O Duelo saiu na 1.0.42.</p>'); // "duelo" is no longer banned
  parseArticle(article({ title: 'Duelo no Melbees' }), ctx);
  parseArticle(article({ state: 'rascunho', body: '<p>aberto' }), ctx); // a draft needs only a valid header
});

test('blog: a symlinked blog directory stops the generator before anything is written', t => {
  const site = makeSite({ 'pt/post': article({}) });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'melbees-out-'));
  t.after(() => { fs.rmSync(outside, { recursive: true, force: true }); site.cleanup(); });
  try { fs.symlinkSync(outside, path.join(site.dir, 'blog'), 'junction'); } catch { t.skip('cannot create a link here'); return; }
  const r = site.generate();
  assert.equal(r.ok, false);
  assert.match(r.out, /link simb/);
  assert.deepEqual(fs.readdirSync(outside), []);
});
