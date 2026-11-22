import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { origin, pages, byId, languages, htmlLang, labels, redirects, filename, escape } from './site.mjs';
import { renderBoards } from './tabuleiros.mjs';
import { loadBlog, planPages, hreflangs, selector, renderBody, headParts, renderFeed, sitemapEntries, blogBase, indexPath, feedPath, homeBlog } from './blog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, text) => { const dest = path.join(root, p); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, text.replaceAll('\r\n', '\n'), 'utf8'); };
const adsenseClient = 'ca-pub-6020962423041240';
const partials = Object.fromEntries(['head', 'header', 'menu', 'footer'].map(name => [name, read(`_fonte/partials/${name}.html`)]));
const partial = (name, values) => partials[name].replace(/\{\{(\w+)\}\}/g, (_, key) => {
  if (!(key in values)) throw new Error(`Missing ${name}.${key}`);
  return values[key];
});
const metadata = JSON.parse(read('_fonte/metadata.json'));
const boardData = JSON.parse(read('_fonte/tabuleiros.json'));
const menuIds = ['jogo', 'professores', 'speedrun', 'imprensa', 'sobre', 'contato', 'privacidade'];
// Drafts never count: a language gets its Blog link only once it has a published article.
const blog = loadBlog(path.join(root, '_fonte/conteudo'));
const blogPages = planPages(blog);
// Blog first (Owner, 22/11/2026): the content is what a visitor and a search engine should meet before anything else.
const menuFor = lang => blog.has(lang) ? ['blog', ...menuIds] : menuIds;
const textOnly = s => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
function links(ids, lang) {
  return ids.map(id => `<a class="keep-src" href="${id === 'blog' ? indexPath(lang) : byId[id].paths[lang]}">${labels[lang][id]}</a>`).join('');
}
// The same tag for every visitor and robot; error and alias pages carry no ad code.
const adsenseTag = noindex => noindex ? '' : `
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}" crossorigin="anonymous"></script>`;
function shell({ lang, title, description, canonical, alternates, robots = '', adsense, image, styles = '', extra = '', ogtype = 'website', body, langHrefs, refresh = '', redirectScript = '' }) {
  const t = labels[lang];
  const head = partial('head', { title, description, canonical, alternates, robots, adsense, image, styles, extra, ogtype });
  const menu = partial('menu', { links: links(menuFor(lang), lang) });
  const languageLinks = languages.map(l => `<a data-idioma="${l}" lang="${htmlLang[l]}" hreflang="${htmlLang[l]}" href="${langHrefs[l]}"${l === lang ? ' aria-current="page"' : ''}>${l.toUpperCase()}</a>`).join('');
  const header = partial('header', { home: byId.home.paths[lang], menu, languageLabel: t.language, languages: languageLinks, close: t.close });
  const footer = partial('footer', { footerLabel: t.footer, links: links([...menuFor(lang), 'termos'], lang) });
  return `<!doctype html>\n<html lang="${htmlLang[lang]}" data-idioma="${lang}">\n<head>\n${head}${refresh}\n</head>\n<body>\n${header}<main>\n${body}\n</main>\n${footer}${redirectScript}\n</body>\n</html>\n`;
}
function renderBlogPage(page) {
  const parts = headParts(blog, page);
  return shell({
    lang: page.lang, title: escape(parts.title), description: escape(parts.description), canonical: origin + page.path,
    alternates: hreflangs(page).map(h => `<link rel="alternate" hreflang="${h.hreflang}" href="${h.href}">`).join('\n'),
    adsense: adsenseTag(Boolean(page.empty)), robots: page.empty ? '<meta name="robots" content="noindex">' : '', image: parts.image || origin + '/assets/og.jpg', extra: parts.extra, ogtype: parts.ogtype,
    body: renderBody(blog, page), langHrefs: selector(blog, page),
  });
}
function resourceLinks(lang) {
  return `<section class="resources"><div class="wrap"><h2>${labels[lang].jogo}</h2><nav aria-label="${labels[lang].jogo}">${links(['como-jogar', 'estrategia', 'desafios', 'professores'], lang)}</nav></div></section>`;
}
function render(page, lang, redirect) {
  const t = labels[lang];
  const urlPath = redirect?.path || page.paths[lang];
  const noindex = Boolean(redirect) || page.id === '404';
  let body = read(`_fonte/conteudo/${lang}/${page.id}.html`).trim();
  const draft = body === 'RASCUNHO: texto a caminho';
  const title = page.id === '404' ? 'Melbees · 404' : page.id === 'home' ? 'Melbees' : page.id === 'jogo' ? 'Melbees: The Secret of Bees' : `${t[page.id]} · Melbees`;
  // The body files are trusted, reviewed HTML fragments. Draft markers stay literal.
  if (draft) body = `<div class="wrap editorial"><h1>${t[page.id]}</h1><p class="draft">${escape(body)}</p></div>`;
  else if (!page.existing) body = `<article class="wrap editorial"><h1>${escape(metadata[`${page.id}/${lang}`]?.title || t[page.id])}</h1>${body}</article>`;
  if (page.id === 'home' && metadata[`home/${lang}`]?.recursos) body += '\n' + metadata[`home/${lang}`].recursos;
  const homeStrip = page.id === 'home' && !redirect && blog.has(lang);
  // The blog strip sits right under the hero, before the games: content first.
  if (homeStrip) { const at = body.indexOf('<section'); body = at < 0 ? body + '\n' + homeBlog(blog, lang) : body.slice(0, at) + homeBlog(blog, lang) + body.slice(at); }
  if (page.id === 'jogo' || (page.id === 'home' && !metadata[`home/${lang}`]?.recursos)) body += '\n' + resourceLinks(lang);
  if (page.id === 'desafios') body += '\n' + renderBoards(boardData, lang);
  if (page.id === 'estrategia') { const favos = boardData.boards.filter(b => b.lang === 'pt'); body = body.replace(/<!--FAVO:(\d)-->/g, (_, n) => `<figure class="board">${favos[n - 1].svg}</figure>`); }
  if (['privacidade', 'termos'].includes(page.id)) {
    const legalLang = lang === 'pt' ? 'pt-BR' : 'en';
    const legalPage = page.id === 'privacidade' ? 'privacy' : 'terms';
    body += `<div class="wrap legal-link"><p><a href="https://metalbr01.github.io/melbees-legal/secret-of-bees/${legalPage}.${legalLang}.html">${page.id === 'privacidade' ? t.legal : t.conditions}</a></p></div>`;
  }
  if (redirect) body = `<div class="wrap editorial"><h1>${t[page.id]}</h1><p><a id="redirect-target" href="${page.paths[lang]}${escape(redirect.fallback)}">${t[page.id]}</a></p></div>`;
  const alternates = [...languages.map(l => `<link rel="alternate" hreflang="${htmlLang[l]}" href="${origin}${page.paths[l]}">`), `<link rel="alternate" hreflang="x-default" href="${origin}${page.paths.pt}">`].join('\n');
  const lede = /<p class="lede">([\s\S]*?)<\/p>/.exec(body)?.[1];
  const head = {
    title: escape(title), description: metadata[`${page.id}/${lang}`]?.description ? escape(metadata[`${page.id}/${lang}`].description) : lede ? textOnly(lede).replaceAll('"', '&quot;') : escape(title), canonical: origin + urlPath, alternates,
    robots: noindex ? '<meta name="robots" content="noindex">' : '',
    adsense: adsenseTag(noindex),
    image: origin + (page.id === 'professores' ? '/secret-of-bees/professores/og.jpg' : '/assets/og.jpg'),
    styles: metadata[`${page.id}/${lang}`]?.styles ? `<style>${metadata[`${page.id}/${lang}`].styles}</style>` : '',
    extra: homeStrip ? '\n<link rel="stylesheet" href="/assets/blog.css">\n<script src="/assets/blog.js" defer></script>' : '',
  };
  // These redirects are aliases only. Language preferences never trigger navigation.
  const redirectScript = redirect ? `<script>(function(){var a=document.getElementById("redirect-target");a.href=${JSON.stringify(page.paths[lang])}+(location.search||${JSON.stringify(redirect.fallback)})+location.hash;location.replace(a.href)})();</script>` : '';
  const refresh = redirect ? `<meta http-equiv="refresh" content="0;url=${page.paths[lang]}${escape(redirect.fallback)}">` : '';
  return shell({ lang, ...head, body, langHrefs: page.paths, refresh, redirectScript });
}
const outputs = new Map();
for (const page of pages) for (const lang of languages) outputs.set(filename(page.paths[lang]), render(page, lang));
for (const redirect of redirects) outputs.set(filename(redirect.path), render(byId[redirect.id], 'pt', redirect));
for (const page of blogPages) outputs.set(page.file, renderBlogPage(page));
for (const lang of blog.langs) outputs.set(filename(feedPath(lang)), renderFeed(blog, lang));
const sitemap = pages.filter(p => p.id !== '404').flatMap(page => languages.map(lang => {
  const alts = [...languages.map(l => `<xhtml:link rel="alternate" hreflang="${htmlLang[l]}" href="${origin}${page.paths[l]}"/>`), `<xhtml:link rel="alternate" hreflang="x-default" href="${origin}${page.paths.pt}"/>`].join('');
  return `  <url><loc>${origin}${page.paths[lang]}</loc>${alts}</url>`;
}));
outputs.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${[...sitemap, ...sitemapEntries(blogPages)].join('\n')}\n</urlset>\n`);
outputs.set('robots.txt', `User-agent: *\nAllow: /\nDisallow: /kit/\nDisallow: /_fonte/\nDisallow: /tests/\n\nSitemap: ${origin}/sitemap.xml\n`);

// Everything above rendered without error, so only now touch the disk. Blog output left by an earlier run
// (an article since unpublished, a series or page that no longer exists) is removed: only *.html and feed.xml
// under the exact blog directories, never a symlink, never anything else.
function pruneBlog(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) { pruneBlog(full); if (!fs.readdirSync(full).length) fs.rmdirSync(full); }
    else if ((entry.name.endsWith('.html') || entry.name === 'feed.xml') && !outputs.has(path.relative(root, full).split(path.sep).join('/'))) fs.unlinkSync(full);
  }
}
// A symlink or junction anywhere on a blog output path would redirect writes elsewhere: refuse before any mutation.
for (const file of outputs.keys()) {
  if (!/(^|\/)blog\//.test(file)) continue;
  let cur = root;
  for (const part of file.split('/')) {
    cur = path.join(cur, part);
    if (fs.existsSync(cur) && fs.lstatSync(cur).isSymbolicLink()) throw new Error(`${path.relative(root, cur)} é um link simbólico; o gerador não escreve através de links`);
  }
}
for (const lang of languages) {
  const dir = path.join(root, blogBase(lang).slice(1, -1));
  if (path.relative(root, dir).startsWith('..') || !fs.existsSync(dir) || fs.lstatSync(dir).isSymbolicLink()) continue;
  pruneBlog(dir);
  if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
}
for (const [file, text] of outputs) write(file, text);
const blogCount = blogPages.length;
console.log(`Generated ${pages.length * languages.length + redirects.length} HTML pages and sitemap.${blogCount ? ` Blog: ${blogCount} pages in ${blog.langs.join(', ')}, ${blog.langs.length} feeds.` : ''}`);

