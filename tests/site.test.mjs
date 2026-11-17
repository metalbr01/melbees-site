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
import { loadBlog, parseArticle, PAGE_SIZE } from '../_fonte/blog.mjs';
import { blogSeries, blogText, daily, bannedCopy } from '../_fonte/site.mjs';
const banned = /\u2014|\bduelo\b|adsense|destaque do google|loja em destaque|sem anúncios|sem chutar|feito no brasil|from brazil|nova temporada|\bwordle\b|\btermo\b|\bpr[eê]mios?\b|\bsorteios?\b|\bprizes?\b|\bsweepstakes?\b/iu;

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
  // Real published articles: owner rules on the generated pages and feeds (a series name is exempt, prose is not).
  for (const p of blogGenerated.pages) assert.doesNotMatch(exempt(read(p.file), p.lang), bannedCopy, p.file);
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
const cards = html => [...html.matchAll(/<li class="post-card">[\s\S]*?<h2><a href="([^"]+)"/g)].map(m => m[1]);
const hreflangs = html => (html.match(/<link\b[^>]*>/g) || []).map(attrs).filter(a => a.rel === 'alternate' && a.hreflang).map(a => `${a.hreflang} ${a.href}`);
const pageOf = (site, urlPath) => site.read(filename(urlPath));
const head = html => /<head>([\s\S]*?)<\/head>/.exec(html)[1];
const ldOf = html => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
// "Duelo" is a series name (a registry entry), so its capitalised name and its URL segment are exempt from the
// banned-copy rule; the same word in prose still fails.
const exempt = (html, lang) => Object.values(blogSeries).reduce((h, s) => h.replaceAll(s.name[lang] || '\0', '').replaceAll(`/${s.slug[lang]}/`, '//'), html);

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

/** Shared page checks for every generated blog page of a throwaway site. */
function checkBlogPages(site) {
  const voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  const publisher = /google\.com,\s*(pub-\d+),\s*DIRECT/.exec(read('ads.txt'))[1];
  const tag = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${publisher}" crossorigin="anonymous"></script>`;
  const files = blogFiles(site);
  assert.ok(files.length);
  for (const file of files) {
    const html = site.read(file);
    const urlPath = '/' + file.replace(/index\.html$/, '');
    const lang = urlPath.startsWith('/en/') ? 'en' : 'pt';
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
    assert.equal(head(html).split(tag).length - 1, 1, `${file}: AdSense tag`);
    assert.equal(html.split('googlesyndication').length - 1, 1, file);
    assert.ok(html.includes(`<link rel="canonical" href="${origin}${urlPath}">`), file);
    assert.doesNotMatch(exempt(html, lang), banned, file);
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
  files['pt/post-12'] = article({ title: 'Tom & Jerry <b>"q"</b> </script>', description: 'Aspas "duplas" & <tags>.', published: '2026-11-12', series: 'duelo' });
  files['pt/rascunho-secreto'] = article({ title: 'SEGREDO PT', state: 'rascunho' });
  files['en/post-one'] = article({ title: 'Post one', description: 'English summary.', published: '2026-11-01', updated: '2026-11-15', translation: 'pt/post-01' });
  files['en/post-two'] = article({ title: 'Post two', description: 'Second summary.', published: '2026-11-02', series: 'quiz-explicado' });
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

test('blog: series pages exist only for series with a published article, paginate, and vanish with the last article', () => {
  const site = rich();
  const s1 = pageOf(site, '/blog/serie/bastidores-do-dev/'), s2 = pageOf(site, '/blog/serie/bastidores-do-dev/pagina/2/');
  assert.equal(cards(s1).length, 10); assert.deepEqual(cards(s2), ['/blog/post-01/']);
  assert.ok(site.exists('blog/serie/duelo/index.html'));
  assert.equal(site.exists('blog/serie/quiz-explicado'), false, 'quiz is only published in en');
  assert.ok(site.exists('en/blog/series/quiz-explained/index.html'));
  assert.ok(site.exists('en/blog/series/dev-behind-the-scenes/index.html'));
  assert.equal(site.exists('blog/serie/macetes-do-enem'), false);
  const small = build({ 'pt/a': article({ title: 'A', series: 'duelo' }), 'pt/b': article({ title: 'B', series: 'quiz-explicado' }) });
  small.set('pt/a', article({ title: 'A', series: 'duelo', state: 'rascunho' }));
  assert.ok(small.generate().ok);
  assert.equal(small.exists('blog/serie/duelo'), false);
  assert.ok(small.exists('blog/serie/quiz-explicado/index.html'));
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
  assert.equal(hreflangs(pageOf(site, '/blog/serie/bastidores-do-dev/')).length, 3);
  assert.deepEqual(hreflangs(pageOf(site, '/blog/serie/duelo/')), [], 'series only in pt');
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
    ['pt/a', article({ title: 'A', series: 'nao-existe' }), /serie/],
    ['pt/a', article({ title: 'A', state: 'agendado' }), /estado/],
    ['pt/a', '---\ntitulo: A\nfoo: bar\nestado: rascunho\n---\n', /chave desconhecida/],
    ['pt/a', '---\ntitulo: A\ntitulo: B\nestado: rascunho\n---\n', /repetida/],
    ['pt/a', 'sem cabeçalho\n', /---/],
    ['pt/serie', article({ title: 'A' }), /reservado/],
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
  const expected = ['/blog/', '/blog/serie/bastidores-do-dev/', '/blog/serie/duelo/', ...Array.from({ length: 12 }, (_, i) => `/blog/post-${pad(i + 1)}/`), '/en/blog/', '/en/blog/series/dev-behind-the-scenes/', '/en/blog/series/quiz-explained/', '/en/blog/post-one/', '/en/blog/post-two/'].sort();
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

test('blog: the article page has breadcrumbs, author, both dates, series links, the Daily call to action and BlogPosting data', () => {
  const site = rich();
  const html = pageOf(site, '/blog/post-01/');
  const main = /<main>([\s\S]*?)<\/main>/.exec(html)[1];
  const crumbs = [...(/<nav class="breadcrumbs"[^>]*>([\s\S]*?)<\/nav>/.exec(main)[1]).matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1].replace(/<[^>]+>/g, ''));
  assert.deepEqual(crumbs, ['Início', 'Blog', 'Bastidores do dev', 'Artigo 1']);
  assert.match(main, /<h1>Artigo 1<\/h1>/);
  assert.match(main, /Por <span class="author">Melbees<\/span>/);
  assert.match(main, /Publicado em <time datetime="2026-11-01">1 de novembro de 2026<\/time>/);
  assert.match(main, /Atualizado em <time datetime="2026-11-15">15 de novembro de 2026<\/time>/);
  const related = /<aside class="related"[\s\S]*?<\/aside>/.exec(main)[0];
  assert.equal([...related.matchAll(/<li><a href="(\/blog\/post-\d+\/)"/g)].length, 5);
  assert.ok(!related.includes('/blog/post-01/') && !related.includes('rascunho') && !related.includes('post-12'));
  assert.ok(related.includes('href="/blog/serie/bastidores-do-dev/"'));
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
  // The index lists every series that has articles.
  assert.ok(pageOf(site, '/blog/').includes('<a href="/blog/serie/duelo/">Duelo</a>'));
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

test('blog: the AdSense tag, third-party scripts, links, balance and banned copy hold on every generated blog page', () => {
  checkBlogPages(rich());
  // The word in prose is refused by the generator itself; only the series name (registry) is exempt.
  const prose = makeSite({ 'pt/a': article({ title: 'A', series: 'duelo', body: '<p>Um duelo de palavras.</p>' }) });
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
  const site = makeSite({ 'es/ejemplo': article({ title: 'Ejemplo', series: 'duelo' }) });
  sites.push(site);
  const r = site.generate();
  assert.equal(r.ok, false, 'a series without a Spanish name is a clear error, not a broken page');
  assert.match(r.out, /nome em es/);
});

test('blog: the parser refuses banned copy, unsafe bodies and bad dates with the file named; <header> passes', () => {
  const ctx = { lang: 'pt', slug: 'x', file: 'pt/blog/x.html' };
  const ok = body => parseArticle(article({ body }), ctx);
  ok('<header><h2>Seção</h2></header><p>Texto.</p>');
  for (const bad of ['<head><p>a</p></head>', '<form><p>a</p></form>', '<img src="a.png" alt=""/onerror=x>', '<a href="javascript:x">a</a>', '<p>Texto — longo</p>', '<p>Duelo de palavras</p>', '<p>o duelo</p>', '<p>Participe do sorteio</p>']) assert.throws(() => ok(bad), /x\.html/, bad);
  assert.throws(() => parseArticle(article({ title: 'Um duelo' }), ctx), /titulo/);
  assert.throws(() => parseArticle(article({ description: 'Bom — ruim' }), ctx), /descricao/);
  for (const date of ['2026-13-01', '2026-11-00', '2026-02-30']) assert.throws(() => parseArticle(article({ published: date }), ctx), /x\.html: publicado deve ser uma data real/, date);
  ok('<p>Wordle e Termo inspiram o jogo.</p>'); // allowed in posts
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
