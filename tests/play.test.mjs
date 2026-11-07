// #589: assets/play.js run against the site's real pages in a small fake DOM (node:vm), no browser and no package.
// Run from the repo root: node --test tests/play.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import { generated } from './helpers.mjs';
import { byId, languages, filename } from '../_fonte/site.mjs';

const ROOT = new URL("../", import.meta.url);
const SCRIPT = readFileSync(new URL("assets/play.js", ROOT), "utf8");
const DEFAULT_TAGS = "utm_source=site&utm_medium=web&utm_campaign=botao_site";

function anchors(html) {
  return [...html.matchAll(/<a\s([^>]*)>/g)].map((m) => {
    const attrs = {};
    for (const a of m[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = (a[2] ?? "").replace(/&amp;/g, "&");
    return attrs;
  });
}

function element(attrs) {
  return {
    attrs,
    getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
    setAttribute(n, v) { this.attrs[n] = String(v); },
    get href() { return this.attrs.href; },
    set href(v) { this.attrs.href = String(v); },
    get classes() { return (this.attrs.class || "").split(/\s+/); },
  };
}

// Only the selectors play.js uses: "a.<class>" and 'a[href^="..."]', comma-separated.
function matches(el, selector) {
  return selector.split(",").some((one) => {
    const s = one.trim();
    let m;
    if ((m = /^a\.([\w-]+)$/.exec(s))) return el.classes.includes(m[1]);
    if ((m = /^a\[href\^="([^"]+)"\]$/.exec(s))) return (el.getAttribute("href") || "").startsWith(m[1]);
    throw new Error(`selector the fake DOM does not know: ${s}`);
  });
}

function runHtml(html, search) {
  const els = anchors(html).map(element);
  let ready = null;
  const document = {
    documentElement: { className: "" },
    addEventListener(type, fn) { if (type === "DOMContentLoaded") ready = fn; },
    querySelectorAll: (selector) => els.filter((el) => matches(el, selector)),
  };
  vm.runInNewContext(SCRIPT, { document, location: { search } });
  assert.ok(ready, "play.js waits for DOMContentLoaded");
  ready();
  return els;
}

const run = (page, search = "") => runHtml(readFileSync(new URL(page, ROOT), "utf8"), search);
const hrefs = (els, test) => els.map((e) => e.getAttribute("href")).filter(test);
const isDaily = (h) => /^https:\/\/(diario|daily)\./.test(h || "");
const withClass = (els, c) => els.filter((e) => e.classes.includes(c)).map((e) => e.getAttribute("href"));

function noKeyTwice(href) {
  const keys = [...new URL(href).searchParams.keys()];
  assert.equal(new Set(keys).size, keys.length, `a key twice in ${href}`);
}

test("the pages that load play.js are the ones this test covers", () => {
  const pages = readdirSync(ROOT, { recursive: true })
    .map((p) => String(p).replace(/\\/g, "/"))
    .filter((p) => p.endsWith(".html") && !p.startsWith(".git/") && !p.startsWith("tests/") && !p.startsWith("_fonte/"))
    .filter((p) => /assets\/play\.js/.test(readFileSync(new URL(p, ROOT), "utf8")))
    .sort();
  assert.deepEqual(pages, generated.map(p => p.file).sort());
});

test("nothing received: every Daily button gets the site's default tags, the stores keep the page's own", () => {
  for (const page of languages.flatMap(lang => ['home', 'jogo'].map(id => filename(byId[id].paths[lang])))) {
    const before = anchors(readFileSync(new URL(page, ROOT), "utf8"));
    const els = run(page);
    const daily = hrefs(els, isDaily);
    assert.equal(daily.length, /secret-of-bees/.test(page) ? 2 : 1, page);
    for (const h of daily) assert.match(h, new RegExp(`^https://(diario|daily)\\.melbees\\.games/\\?${DEFAULT_TAGS}$`), page);
    assert.deepEqual(withClass(els, "msstore"), before.filter((a) => (a.class || "").split(/\s+/).includes("msstore")).map((a) => a.href));
    assert.deepEqual(withClass(els, "msstore"), withClass(els, "msstore").map(() => "https://apps.microsoft.com/detail/9N72MD72DQBP?cid=site"));
    assert.deepEqual(withClass(els, "play"), before.filter((a) => (a.class || "").split(/\s+/).includes("play")).map((a) => a.href));
  }
  assert.ok(withClass(run("index.html"), "keep-src").includes('/secret-of-bees/'));
});

test("?s=instagram&c=bio (the Owner's check): Daily, Microsoft and Play carry instagram and bio", () => {
  const els = run("index.html", "?s=instagram&c=bio");
  const pt = hrefs(els, (h) => /^https:\/\/diario\./.test(h || ""));
  assert.deepEqual(pt, ["https://diario.melbees.games/?utm_source=instagram&utm_medium=social&utm_campaign=bio"]);
  for (const h of hrefs(els, isDaily)) {
    const u = new URL(h);
    assert.equal(u.searchParams.get("utm_source"), "instagram");
    assert.equal(u.searchParams.get("utm_campaign"), "bio");
    noKeyTwice(h);
  }
  assert.deepEqual(withClass(els, "msstore"), ["https://apps.microsoft.com/detail/9N72MD72DQBP?cid=instagram_bio"]);
  assert.deepEqual(withClass(els, "play"), [
    "https://play.google.com/store/apps/details?id=com.melbees.secretofbees&referrer=" +
      encodeURIComponent("utm_source=instagram&utm_medium=social&utm_campaign=bio"),
  ]);
  const before = anchors(readFileSync(new URL('index.html', ROOT), 'utf8')).filter(a => (a.class || '').split(/\s+/).includes('keep-src'));
  assert.deepEqual(withClass(els, "keep-src"), before.map(a => a.href + '?s=instagram&c=bio'));
});

test("Microsoft cid: <s>_<c>, <s> alone, site_<c> with only c", () => {
  const cid = (search) => withClass(run("secret-of-bees/index.html", search), "msstore");
  assert.deepEqual(cid("?s=youtube"), Array(2).fill("https://apps.microsoft.com/detail/9N72MD72DQBP?cid=youtube"));
  assert.deepEqual(cid("?utm_source=linkedin&utm_campaign=pagina"), Array(2).fill("https://apps.microsoft.com/detail/9N72MD72DQBP?cid=linkedin_pagina"));
  assert.deepEqual(cid("?c=bio"), Array(2).fill("https://apps.microsoft.com/detail/9N72MD72DQBP?cid=site_bio"));
  const press = run("secret-of-bees/press/index.html", "?s=reddit&c=puzzles-promo");
  assert.deepEqual(withClass(press, "msstore-id"), ["https://apps.microsoft.com/detail/9N72MD72DQBP?cid=reddit_puzzles-promo"]);
});

test("the professores page keeps cid=professores when nothing comes, and the short link's tags when they do", () => {
  const page = "secret-of-bees/professores/index.html";
  assert.deepEqual(withClass(run(page), "msstore"), ["https://apps.microsoft.com/detail/9N72MD72DQBP?cid=professores"]);
  assert.deepEqual(withClass(run(page, "?s=curto&c=professores"), "msstore"), ["https://apps.microsoft.com/detail/9N72MD72DQBP?cid=curto_professores"]);
});

test("all four utm_* pass to the Daily, utm_content included", () => {
  const els = run("secret-of-bees/index.html", "?utm_source=facebook&utm_medium=social&utm_campaign=pagina&utm_content=p-geral");
  for (const h of hrefs(els, isDaily)) {
    assert.match(h, /\/\?utm_source=facebook&utm_medium=social&utm_campaign=pagina&utm_content=p-geral$/);
  }
  const only = run("index.html", "?utm_content=link_in_bio");
  for (const h of hrefs(only, isDaily)) assert.match(h, new RegExp(`\\?${DEFAULT_TAGS}&utm_content=link_in_bio$`));
});

test("the link's own query and fragment stay, a received key replaces the link's, no key twice", () => {
  const html = [
    '<a href="https://daily.melbees.games/?lang=es#top">',
    '<a href="https://diario.melbees.games/?utm_source=site&amp;utm_medium=web&amp;utm_campaign=speedrun">',
    '<a href="https://daily.melbees.games/?utm_campaign=a&amp;utm_campaign=b&amp;lang=fr">',
    '<a href="https://www.youtube.com/@melbees">',
    '<a href="http://diario.melbees.games/">',
  ].join("");
  const none = runHtml(html, "").map((e) => e.getAttribute("href"));
  assert.deepEqual(none, [
    `https://daily.melbees.games/?lang=es&${DEFAULT_TAGS}#top`,
    "https://diario.melbees.games/?utm_source=site&utm_medium=web&utm_campaign=speedrun",
    "https://daily.melbees.games/?utm_campaign=a&lang=fr&utm_source=site&utm_medium=web",
    "https://www.youtube.com/@melbees",
    "http://diario.melbees.games/",
  ]);
  const got = runHtml(html, "?s=Reddit&c=bio").map((e) => e.getAttribute("href"));
  assert.deepEqual(got, [
    "https://daily.melbees.games/?lang=es&utm_source=reddit&utm_medium=social&utm_campaign=bio#top",
    "https://diario.melbees.games/?utm_source=reddit&utm_medium=web&utm_campaign=bio",
    "https://daily.melbees.games/?utm_campaign=bio&lang=fr&utm_source=reddit&utm_medium=social",
    "https://www.youtube.com/@melbees",
    "http://diario.melbees.games/",
  ]);
  for (const h of [...none, ...got].filter(isDaily)) noKeyTwice(h);
});

test("a value outside [a-z0-9_-] or a broken %-escape counts as not received", () => {
  for (const search of ["?s=%E0%A4%A", "?s=%3Cscript%3E&c=a%20b", "?s=" + "x".repeat(41)]) {
    const els = run("index.html", search);
    for (const h of hrefs(els, isDaily)) assert.match(h, new RegExp(`\\?${DEFAULT_TAGS}$`), search);
    assert.deepEqual(withClass(els, "msstore"), ["https://apps.microsoft.com/detail/9N72MD72DQBP?cid=site"], search);
  }
});

function runNavigation(page, search, extraHtml = '') {
  const html = readFileSync(new URL(page, ROOT), 'utf8') + extraHtml;
  const els = anchors(html).map(element);
  const ready = [];
  const url = new URL('https://melbees.games/' + page.replace(/index\.html$/, '') + search);
  const document = {
    documentElement: { className: '' },
    addEventListener(type, fn) { if (type === 'DOMContentLoaded') ready.push(fn); },
    querySelectorAll: selector => els.filter(el => matches(el, selector)),
  };
  const context = { document, location: { search, href: url.href, origin: url.origin }, URL, URLSearchParams };
  vm.runInNewContext(SCRIPT, context);
  vm.runInNewContext(readFileSync(new URL('assets/navigation.js', ROOT), 'utf8'), context);
  for (const fn of ready) fn();
  return els;
}

test('all generated pages preserve complete queries on internal navigation, including cid alone', () => {
  for (const page of generated) for (const query of ['?cid=instagram_bio', '?s=instagram&utm_medium=social&utm_campaign=bio&utm_content=card&cid=campaign&custom=%C3%A9']) {
    const result = runNavigation(page.file, query);
    for (const href of withClass(result, 'keep-src')) {
      const url = new URL(href, 'https://melbees.games');
      for (const [key, value] of new URLSearchParams(query)) assert.equal(url.searchParams.get(key), value, `${page.file}: ${href}`);
    }
  }
});

test('standalone cid reaches Microsoft while source and campaign keep play.js precedence', () => {
  for (const lang of languages) for (const id of ['home', 'jogo']) {
    const file = filename(byId[id].paths[lang]);
    assert.ok(withClass(runNavigation(file, '?cid=instagram_bio'), 'msstore').every(h => new URL(h).searchParams.get('cid') === 'instagram_bio'));
    assert.ok(withClass(runNavigation(file, '?cid=other&s=youtube&c=bio'), 'msstore').every(h => new URL(h).searchParams.get('cid') === 'youtube_bio'));
    assert.ok(withClass(runNavigation(file, '?cid=%3Cscript%3E'), 'msstore').every(h => new URL(h).searchParams.get('cid') === 'site'));
  }
});

test('every translated store and Daily button retains incoming attribution', () => {
  for (const page of generated.filter(p => !p.redirect)) {
    const result = runNavigation(page.file, '?s=instagram&m=social&c=bio&utm_content=card');
    for (const href of hrefs(result, isDaily)) {
      const q = new URL(href).searchParams;
      for (const [key, value] of Object.entries({ utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'bio', utm_content: 'card' })) assert.equal(q.get(key), value, page.file);
      noKeyTwice(href);
    }
    for (const href of [...withClass(result, 'msstore'), ...withClass(result, 'msstore-id')]) assert.equal(new URL(href).searchParams.get('cid'), 'instagram_bio', page.file);
    for (const href of withClass(result, 'play')) {
      const q = new URLSearchParams(new URL(href).searchParams.get('referrer'));
      assert.equal(q.get('utm_source'), 'instagram'); assert.equal(q.get('utm_campaign'), 'bio');
    }
  }
});

test('internal query merging retains a link fragment and its existing parameter', () => {
  const result = runNavigation('index.html', '?cid=test&s=instagram', '<a class="keep-src" href="/secret-of-bees/?existing=yes#como-jogar">');
  const href = withClass(result, 'keep-src').at(-1);
  assert.equal(href, '/secret-of-bees/?existing=yes&cid=test&s=instagram#como-jogar');
});
