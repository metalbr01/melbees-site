import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { origin, pages, byId, languages, htmlLang, labels, redirects, filename, escape } from './site.mjs';
import { renderBoards } from './tabuleiros.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, text) => { const dest = path.join(root, p); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, text.replaceAll('\r\n', '\n'), 'utf8'); };
const partials = Object.fromEntries(['head', 'header', 'menu', 'footer'].map(name => [name, read(`_fonte/partials/${name}.html`)]));
const partial = (name, values) => partials[name].replace(/\{\{(\w+)\}\}/g, (_, key) => {
  if (!(key in values)) throw new Error(`Missing ${name}.${key}`);
  return values[key];
});
const metadata = JSON.parse(read('_fonte/metadata.json'));
const boardData = JSON.parse(read('_fonte/tabuleiros.json'));
const menuIds = ['jogo', 'professores', 'speedrun', 'imprensa', 'sobre', 'contato', 'privacidade'];
const textOnly = s => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
function links(ids, lang) {
  return ids.map(id => `<a class="keep-src" href="${byId[id].paths[lang]}">${labels[lang][id]}</a>`).join('');
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
  const head = partial('head', {
    title: escape(title), description: metadata[`${page.id}/${lang}`]?.description ? escape(metadata[`${page.id}/${lang}`].description) : lede ? textOnly(lede).replaceAll('"', '&quot;') : escape(title), canonical: origin + urlPath, alternates,
    robots: noindex ? '<meta name="robots" content="noindex">' : '',
    image: origin + (page.id === 'professores' ? '/secret-of-bees/professores/og.jpg' : '/assets/og.jpg'),
    styles: metadata[`${page.id}/${lang}`]?.styles ? `<style>${metadata[`${page.id}/${lang}`].styles}</style>` : '',
  });
  const menu = partial('menu', { links: links(menuIds, lang) });
  const languageLinks = languages.map(l => `<a data-idioma="${l}" lang="${htmlLang[l]}" hreflang="${htmlLang[l]}" href="${page.paths[l]}"${l === lang ? ' aria-current="page"' : ''}>${l.toUpperCase()}</a>`).join('');
  const header = partial('header', { home: byId.home.paths[lang], menu, languageLabel: t.language, languages: languageLinks, close: t.close });
  const footer = partial('footer', { footerLabel: t.footer, links: links([...menuIds, 'termos'], lang) });
  // These redirects are aliases only. Language preferences never trigger navigation.
  const redirectScript = redirect ? `<script>(function(){var a=document.getElementById("redirect-target");a.href=${JSON.stringify(page.paths[lang])}+(location.search||${JSON.stringify(redirect.fallback)})+location.hash;location.replace(a.href)})();</script>` : '';
  const refresh = redirect ? `<meta http-equiv="refresh" content="0;url=${page.paths[lang]}${escape(redirect.fallback)}">` : '';
  return `<!doctype html>\n<html lang="${htmlLang[lang]}" data-idioma="${lang}">\n<head>\n${head}${refresh}\n</head>\n<body>\n${header}<main>\n${body}\n</main>\n${footer}${redirectScript}\n</body>\n</html>\n`;
}
for (const page of pages) for (const lang of languages) write(filename(page.paths[lang]), render(page, lang));
for (const redirect of redirects) write(filename(redirect.path), render(byId[redirect.id], 'pt', redirect));
const sitemap = pages.filter(p => p.id !== '404').flatMap(page => languages.map(lang => {
  const alts = [...languages.map(l => `<xhtml:link rel="alternate" hreflang="${htmlLang[l]}" href="${origin}${page.paths[l]}"/>`), `<xhtml:link rel="alternate" hreflang="x-default" href="${origin}${page.paths.pt}"/>`].join('');
  return `  <url><loc>${origin}${page.paths[lang]}</loc>${alts}</url>`;
}));
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemap.join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /kit/\nDisallow: /_fonte/\nDisallow: /tests/\n\nSitemap: ${origin}/sitemap.xml\n`);
console.log(`Generated ${pages.length * languages.length + redirects.length} HTML pages and sitemap.`);
