import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { origin, pages, byId, languages, htmlLang, labels, filename } from '../_fonte/site.mjs';
import { centers } from '../_fonte/tabuleiros.mjs';
import { root, read, generated, attrs, publicFiles } from './helpers.mjs';

test('every published HTML page is covered, with shared navigation and privacy', () => {
  assert.deepEqual(publicFiles().filter(p => p.endsWith('.html')).sort(), generated.map(p => p.file).sort());
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
    const alternates = (html.match(/<link\b[^>]*>/g) || []).map(attrs).filter(a => a.rel === 'alternate');
    assert.equal(alternates.length, 5, item.file);
    for (const lang of languages) assert.equal(alternates.find(a => a.hreflang === htmlLang[lang])?.href, origin + item.page.paths[lang], item.file);
    assert.equal(alternates.find(a => a.hreflang === 'x-default')?.href, origin + item.page.paths.pt, item.file);
    const selector = (html.match(/<a\b[^>]*data-idioma="[^"]+"[^>]*>/g) || []).map(attrs);
    assert.equal(selector.length, 4);
    for (const lang of languages) assert.equal(selector.find(a => a['data-idioma'] === lang)?.href, item.page.paths[lang], item.file);
    assert.equal(/name="robots" content="noindex"/.test(html), Boolean(item.redirect) || item.page.id === '404');
  }
});

test('prohibited copy is absent from generated HTML', () => {
  const banned = /\u2014|\bduelo\b|adsense|destaque do google|loja em destaque|sem anúncios|sem chutar|feito no brasil|from brazil|nova temporada|\bwordle\b|\btermo\b|\bpr[eê]mios?\b|\bsorteios?\b|\bprizes?\b|\bsweepstakes?\b/iu;
  for (const { file } of generated) assert.doesNotMatch(read(file), banned, file);
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
  assert.deepEqual(entries.map(s => /<loc>(.*?)<\/loc>/.exec(s)[1]).sort(), expected.map(p => origin + p.path).sort());
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
  const files = [...generated.map(p => p.file), 'sitemap.xml', 'robots.txt'];
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
