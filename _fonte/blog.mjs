// Blog model: reads and validates the articles, plans every page, and builds the page bodies, RSS and sitemap
// entries. It writes nothing; gerar.mjs owns the shell (head, header, footer) and the file system.
import fs from 'node:fs';
import path from 'node:path';
import { origin, languages, htmlLang, labels, byId, filename, blogRoutes, blogSeries, blogText, bannedCopy, formatDate, daily, escape } from './site.mjs';

export const PAGE_SIZE = 10;
export const RSS_LIMIT = 50;
export const STATES = ['rascunho', 'publicado'];
const KEYS = new Set(['titulo', 'descricao', 'publicado', 'atualizado', 'serie', 'video', 'traducao', 'estado']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VIDEO = /^[A-Za-z0-9_-]{11}$/;
const reserved = new Set(['feed', 'index', ...languages.flatMap(l => [blogRoutes[l].series, blogRoutes[l].page])]);
const voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));

export const blogBase = lang => `${lang === 'pt' ? '' : '/' + lang}/blog/`;
export const indexPath = (lang, page = 1) => blogBase(lang) + (page > 1 ? `${blogRoutes[lang].page}/${page}/` : '');
export const seriesPath = (lang, id, page = 1) => `${blogBase(lang)}${blogRoutes[lang].series}/${blogSeries[id].slug[lang]}/` + (page > 1 ? `${blogRoutes[lang].page}/${page}/` : '');
export const articlePath = a => `${blogBase(a.lang)}${a.slug}/`;
export const feedPath = lang => `${blogBase(lang)}feed.xml`;

const realDate = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };
const badTags = new Set(['h1', 'script', 'iframe', 'html', 'head', 'body', 'style', 'object', 'embed', 'form', 'base', 'meta', 'link']);

function checkBody(body, fail) {
  const clean = body.replace(/<!--[\s\S]*?-->/g, '');
  if (/<!doctype/i.test(clean)) fail('o corpo não pode conter <!doctype');
  for (const [token] of clean.matchAll(/<\/?[a-z][^>]*>/gi)) {
    const name = /^<\/?([\w-]+)/.exec(token)[1].toLowerCase();
    if (badTags.has(name)) fail(`o corpo não pode conter <${name}>`);
  }
  if (/<[^>]*[\s/"']on[a-z]+\s*=/i.test(clean)) fail('o corpo não pode conter atributos on*');
  if (/\bjavascript:/i.test(clean)) fail('o corpo não pode conter javascript:');
  const stack = [];
  for (const token of body.replace(/<!--[\s\S]*?-->/g, '').match(/<\/?[a-z][^>]*>/gi) || []) {
    const name = /^<\/?([\w-]+)/.exec(token)[1].toLowerCase();
    if (token.startsWith('</')) { if (stack.pop() !== name) fail(`tag de fechamento inesperada ${token}`); }
    else if (!voids.has(name) && !token.endsWith('/>')) stack.push(name);
  }
  if (stack.length) fail(`tag sem fechamento: <${stack.at(-1)}>`);
}

/** Parses one article file. The header format is documented in README.md. */
export function parseArticle(source, { lang, slug, file }) {
  const fail = message => { throw new Error(`${file}: ${message}`); };
  if (source.startsWith('\uFEFF')) fail('o arquivo não pode ter BOM');
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  if (lines[0] !== '---') fail('a primeira linha deve ser ---');
  const end = lines.indexOf('---', 1);
  if (end < 0) fail('falta a linha --- que fecha o cabeçalho');
  const meta = {};
  lines.slice(1, end).forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    const m = /^([a-z]+):[ \t]*(.*)$/.exec(line);
    if (!m) fail(`cabeçalho, linha ${i + 2}: use "chave: valor"`);
    if (!KEYS.has(m[1])) fail(`chave desconhecida "${m[1]}" (válidas: ${[...KEYS].join(', ')})`);
    if (m[1] in meta) fail(`chave repetida "${m[1]}"`);
    meta[m[1]] = m[2].trim();
  });
  const body = lines.slice(end + 1).join('\n').trim();
  if (!STATES.includes(meta.estado)) fail(`estado deve ser ${STATES.join(' ou ')}`);
  for (const key of ['publicado', 'atualizado']) if (meta[key] !== undefined && !realDate(meta[key])) fail(`${key} deve ser uma data real AAAA-MM-DD`);
  if (meta.video !== undefined && !VIDEO.test(meta.video)) fail('video deve ser o id do YouTube (11 caracteres: letras, números, - e _)');
  if (meta.serie !== undefined && !Object.hasOwn(blogSeries, meta.serie)) fail(`serie "${meta.serie}" não existe (válidas: ${Object.keys(blogSeries).join(', ')})`);
  if (meta.serie !== undefined && !blogSeries[meta.serie].name[lang]) fail(`a série "${meta.serie}" ainda não tem nome em ${lang} (site.mjs)`);
  if (meta.serie !== undefined && !SLUG.test(blogSeries[meta.serie].slug?.[lang] || '')) fail(`a série "${meta.serie}" ainda não tem slug válido em ${lang} (site.mjs)`);
  const translations = (meta.traducao || '').split(',').map(s => s.trim()).filter(Boolean).map(item => {
    const m = /^([a-z]{2})\/([a-z0-9-]+)$/.exec(item);
    if (!m || !languages.includes(m[1]) || m[1] === lang || !SLUG.test(m[2])) fail(`traducao "${item}": use idioma/slug de outro idioma (${languages.filter(l => l !== lang).join(', ')})`);
    return { lang: m[1], slug: m[2] };
  });
  const article = { lang, slug, file, state: meta.estado, title: meta.titulo, description: meta.descricao, published: meta.publicado, updated: meta.atualizado, series: meta.serie, video: meta.video, translations, body };
  if (meta.estado === 'publicado') {
    for (const [key, value] of [['titulo', meta.titulo], ['descricao', meta.descricao], ['publicado', meta.publicado], ['serie', meta.serie]]) if (!value) fail(`${key} é obrigatório em artigo publicado`);
    if (!body) fail('o corpo está vazio');
    checkBody(body, fail);
    for (const [key, value] of [['titulo', meta.titulo], ['descricao', meta.descricao], ['corpo', body]]) { const hit = bannedCopy.exec(value); if (hit) fail(`${key} contém texto proibido (${hit[0]}); veja o README`); }
    article.updated ??= article.published;
    if (article.updated < article.published) fail('atualizado não pode ser anterior a publicado');
  }
  return article;
}

const byNewest = (a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/** Loads every article under <contentRoot>/<lang>/blog/. Only published articles are exposed. */
export function loadBlog(contentRoot, { pageSize = PAGE_SIZE } = {}) {
  const all = [];
  for (const lang of languages) {
    const dir = path.join(contentRoot, lang, 'blog');
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (!name.endsWith('.html')) continue;
      const slug = name.slice(0, -5);
      const file = `_fonte/conteudo/${lang}/blog/${name}`;
      if (!SLUG.test(slug)) throw new Error(`${file}: o nome do arquivo (slug) deve usar a-z, 0-9 e hífen`);
      if (reserved.has(slug)) throw new Error(`${file}: o slug "${slug}" é reservado`);
      all.push(parseArticle(fs.readFileSync(path.join(dir, name), 'utf8'), { lang, slug, file }));
    }
  }
  const byKey = new Map(all.map(a => [`${a.lang}/${a.slug}`, a]));
  // Translation groups: union of the links declared by published articles. A link to a draft is allowed and ignored.
  const parent = new Map();
  const find = a => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  const published = all.filter(a => a.state === 'publicado');
  for (const a of published) parent.set(a, a);
  for (const a of published) for (const t of a.translations) {
    const target = byKey.get(`${t.lang}/${t.slug}`);
    if (!target) throw new Error(`${a.file}: traducao "${t.lang}/${t.slug}" não existe em _fonte/conteudo/${t.lang}/blog/`);
    if (target.state === 'publicado') parent.set(find(a), find(target));
  }
  const groups = new Map();
  for (const a of published) { const g = find(a); groups.set(g, [...(groups.get(g) || []), a]); }
  for (const members of groups.values()) {
    members.sort((x, y) => languages.indexOf(x.lang) - languages.indexOf(y.lang));
    for (const l of languages) if (members.filter(m => m.lang === l).length > 1) throw new Error(`traduções em conflito: ${members.filter(m => m.lang === l).map(m => m.file).join(' e ')} ficam no mesmo grupo de tradução`);
    for (const m of members) m.group = members;
  }
  const inLang = Object.fromEntries(languages.map(l => [l, published.filter(a => a.lang === l).sort(byNewest)]));
  const seriesIn = lang => Object.keys(blogSeries).filter(id => inLang[lang].some(a => a.series === id));
  return {
    pageSize, all, published: published.sort(byNewest), inLang, seriesIn,
    langs: languages.filter(l => inLang[l].length),
    has: lang => inLang[lang].length > 0,
    inSeries: (lang, id) => inLang[lang].filter(a => a.series === id),
  };
}

const chunk = (items, size) => Array.from({ length: Math.max(1, Math.ceil(items.length / size)) }, (_, i) => items.slice(i * size, (i + 1) * size));
const latest = items => items.reduce((m, a) => (a.updated > m ? a.updated : m), '');
const xDefault = members => (members.find(m => m.lang === 'pt') || members[0]);

/** Every public page of the blog: path, kind, alternates, sitemap entry data. */
export function planPages(blog) {
  const pages = [];
  for (const lang of blog.langs) {
    const list = blog.inLang[lang];
    const others = blog.langs.filter(l => l !== lang);
    chunk(list, blog.pageSize).forEach((items, i, all) => pages.push({
      kind: 'index', lang, page: i + 1, pages: all.length, items, path: indexPath(lang, i + 1),
      alternates: i === 0 ? others.map(l => ({ lang: l, path: indexPath(l) })) : [], lastmod: latest(list), sitemap: i === 0,
    }));
    for (const id of blog.seriesIn(lang)) {
      const inSeries = blog.inSeries(lang, id);
      const otherLangs = others.filter(l => blog.inSeries(l, id).length);
      chunk(inSeries, blog.pageSize).forEach((items, i, all) => pages.push({
        kind: 'series', lang, series: id, page: i + 1, pages: all.length, items, path: seriesPath(lang, id, i + 1),
        alternates: i === 0 ? otherLangs.map(l => ({ lang: l, path: seriesPath(l, id) })) : [], lastmod: latest(inSeries), sitemap: i === 0,
      }));
    }
    for (const article of list) pages.push({
      kind: 'article', lang, article, path: articlePath(article),
      alternates: article.group.filter(m => m !== article).map(m => ({ lang: m.lang, path: articlePath(m) })), lastmod: article.updated, sitemap: true,
    });
  }
  for (const p of pages) p.file = filename(p.path);
  return pages;
}

/** hreflang entries of a page: nothing without translations, else every member (self included) and one x-default. */
export function hreflangs(page) {
  if (!page.alternates.length) return [];
  const members = [{ lang: page.lang, path: page.path }, ...page.alternates].sort((a, b) => languages.indexOf(a.lang) - languages.indexOf(b.lang));
  const dflt = members.find(m => m.lang === 'pt') || members[0];
  return [...members.map(m => ({ hreflang: htmlLang[m.lang], href: origin + m.path })), { hreflang: 'x-default', href: origin + dflt.path }];
}

/** Where each language button of the header goes: the translation, else that language's blog, else its home page. */
export function selector(blog, page) {
  const first = page.page > 1 ? { ...page, alternates: planPagesFirst(blog, page) } : page;
  return Object.fromEntries(languages.map(l => {
    if (l === page.lang) return [l, page.path];
    const alt = first.alternates.find(a => a.lang === l);
    return [l, alt ? alt.path : blog.has(l) ? indexPath(l) : byId.home.paths[l]];
  }));
}
function planPagesFirst(blog, page) {
  const others = blog.langs.filter(l => l !== page.lang);
  if (page.kind === 'series') return others.filter(l => blog.inSeries(l, page.series).length).map(l => ({ lang: l, path: seriesPath(l, page.series) }));
  return others.map(l => ({ lang: l, path: indexPath(l) }));
}

const time = (iso, lang) => `<time datetime="${iso}">${escape(formatDate(iso, lang))}</time>`;
const seriesName = (id, lang) => blogSeries[id].name[lang];
const pagerNav = (page, link, t) => {
  if (page.pages < 2) return '';
  const prev = page.page > 1 ? `<a rel="prev" href="${link(page.page - 1)}">${t.newer}</a>` : '';
  const next = page.page < page.pages ? `<a rel="next" href="${link(page.page + 1)}">${t.older}</a>` : '';
  return `<nav class="pager" aria-label="${t.paging}">${prev}<span>${t.page} ${page.page} / ${page.pages}</span>${next}</nav>`;
};
const crumbs = (items, t) => `<nav class="breadcrumbs" aria-label="${t.crumbs}"><ol>${items.map((c, i) => i === items.length - 1 ? `<li><span aria-current="page">${escape(c.name)}</span></li>` : `<li><a class="keep-src" href="${c.path}">${escape(c.name)}</a></li>`).join('')}</ol></nav>`;
const breadcrumbItems = (page) => {
  const { lang } = page;
  const items = [{ name: labels[lang].home, path: byId.home.paths[lang] }, { name: labels[lang].blog, path: indexPath(lang) }];
  if (page.kind === 'series') items.push({ name: seriesName(page.series, lang), path: seriesPath(lang, page.series) });
  if (page.kind === 'article') items.push({ name: seriesName(page.article.series, lang), path: seriesPath(lang, page.article.series) }, { name: page.article.title, path: page.path });
  return items;
};
function card(a, t) {
  const lang = a.lang;
  return `<li class="post-card"><p class="eyebrow"><a href="${seriesPath(lang, a.series)}">${escape(seriesName(a.series, lang))}</a></p><h2><a href="${articlePath(a)}">${escape(a.title)}</a></h2><p>${escape(a.description)}</p><p class="meta">${time(a.published, lang)}</p></li>`;
}
function cta(lang, t) {
  return `<aside class="post-cta"><p>${t.lead}</p><div class="cta"><a class="btn" lang="${htmlLang[lang]}" href="${daily[lang]}?utm_source=site&amp;utm_medium=web&amp;utm_campaign=blog" rel="noopener">${t.play}</a></div></aside>`;
}
function videoBlock(a, t) {
  const id = a.video;
  const label = `${t.watch}: ${a.title}`;
  // A plain link to YouTube works without JavaScript; blog.js swaps it for the iframe on click. Nothing from
  // YouTube except this one thumbnail image is requested before the click.
  return `<div class="video"><a class="video-play" href="https://www.youtube.com/watch?v=${id}" rel="noopener" data-video-id="${id}" data-title="${escape(a.title)}" aria-label="${escape(label)}"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" width="480" height="360" decoding="async" referrerpolicy="no-referrer"><span class="video-icon" aria-hidden="true"></span><span class="video-label">${t.watch}</span></a></div>`;
}

/** The HTML placed inside <main> for a planned page. */
export function renderBody(blog, page) {
  const { lang } = page;
  const t = blogText[lang];
  const rss = `<p class="blog-rss"><a href="${feedPath(lang)}">${t.rss}</a></p>`;
  if (page.kind === 'index' || page.kind === 'series') {
    const isSeries = page.kind === 'series';
    const title = isSeries ? seriesName(page.series, lang) : labels[lang].blog;
    const link = n => (isSeries ? seriesPath(lang, page.series, n) : indexPath(lang, n));
    const seriesNav = isSeries ? `<p class="blog-all"><a href="${indexPath(lang)}">${t.all}</a></p>`
      : `<nav class="blog-series" aria-label="${t.allSeries}">${blog.seriesIn(lang).map(id => `<a href="${seriesPath(lang, id)}">${escape(seriesName(id, lang))}</a>`).join('')}</nav>`;
    return `<div class="wrap blog">${crumbs(breadcrumbItems(page), t)}<header class="blog-head"><h1>${escape(title)}</h1><p class="lede">${t.intro}</p>${seriesNav}</header><ol class="post-list">${page.items.map(a => card(a, t)).join('')}</ol>${pagerNav(page, link, t)}${rss}</div>`;
  }
  const a = page.article;
  const related = blog.inSeries(lang, a.series).filter(r => r !== a).slice(0, 5);
  const more = `<aside class="related" aria-labelledby="related-title"><h2 id="related-title">${t.more}: ${escape(seriesName(a.series, lang))}</h2>${related.length ? `<ul>${related.map(r => `<li><a href="${articlePath(r)}">${escape(r.title)}</a> <span class="muted">${time(r.published, lang)}</span></li>`).join('')}</ul>` : ''}<p><a href="${seriesPath(lang, a.series)}">${t.all}: ${escape(seriesName(a.series, lang))}</a></p></aside>`;
  return `<article class="wrap blog post">${crumbs(breadcrumbItems(page), t)}<header class="post-head"><p class="eyebrow"><a href="${seriesPath(lang, a.series)}">${escape(seriesName(a.series, lang))}</a></p><h1>${escape(a.title)}</h1><p class="lede">${escape(a.description)}</p><p class="meta">${t.by} <span class="author">${t.author}</span> · ${t.published} ${time(a.published, lang)} · ${t.updated} ${time(a.updated, lang)}</p></header>${a.video ? videoBlock(a, t) : ''}<div class="post-body">${a.body}</div>${cta(lang, t)}${more}</article>`;
}

const jsonScript = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')}</script>`;

/** Title, description, og:type and the extra <head> lines of a planned page. */
export function headParts(blog, page) {
  const { lang } = page;
  const t = blogText[lang];
  const suffix = page.page > 1 ? ` · ${t.page} ${page.page}` : '';
  const extra = [`<link rel="stylesheet" href="/assets/blog.css">`, `<link rel="alternate" type="application/rss+xml" title="${escape(`${labels[lang].blog} · Melbees`)}" href="${origin}${feedPath(lang)}">`];
  if (page.kind === 'article') {
    const a = page.article;
    const url = origin + page.path;
    const items = breadcrumbItems(page).map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: origin + c.path }));
    const organization = { '@type': 'Organization', name: 'Melbees', url: `${origin}/` };
    extra.push(`<meta property="article:published_time" content="${a.published}">`, `<meta property="article:modified_time" content="${a.updated}">`);
    extra.push(jsonScript({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'BlogPosting', '@id': `${url}#post`, headline: a.title, description: a.description, datePublished: a.published, dateModified: a.updated, inLanguage: htmlLang[lang], url, mainEntityOfPage: { '@type': 'WebPage', '@id': url }, image: [`${origin}/assets/og.jpg`], articleSection: seriesName(a.series, lang), author: organization, publisher: { ...organization, logo: { '@type': 'ImageObject', url: `${origin}/assets/icon-192.png` } } },
        { '@type': 'BreadcrumbList', itemListElement: items },
      ],
    }));
    if (a.video) extra.push(`<script src="/assets/blog.js" defer></script>`);
    return { title: `${a.title} · Melbees`, description: a.description, ogtype: 'article', extra: '\n' + extra.join('\n') };
  }
  const name = page.kind === 'series' ? `${seriesName(page.series, lang)} · ${labels[lang].blog}` : labels[lang].blog;
  return { title: `${name}${suffix} · Melbees`, description: t.intro, ogtype: 'website', extra: '\n' + extra.join('\n') };
}

// RFC 822 date, fixed at noon GMT of the content date: deterministic and independent of the machine's time zone.
const rfc822 = iso => new Date(`${iso}T12:00:00Z`).toUTCString();

export function renderFeed(blog, lang) {
  const t = blogText[lang];
  const list = blog.inLang[lang].slice(0, RSS_LIMIT);
  const url = origin + indexPath(lang);
  const items = list.map(a => `<item><title>${escape(a.title)}</title><link>${origin}${articlePath(a)}</link><guid isPermaLink="true">${origin}${articlePath(a)}</guid><pubDate>${rfc822(a.published)}</pubDate><category>${escape(seriesName(a.series, lang))}</category><description>${escape(a.description)}</description></item>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n<title>${escape(`${labels[lang].blog} · Melbees`)}</title>\n<link>${url}</link>\n<description>${escape(t.intro)}</description>\n<language>${htmlLang[lang]}</language>\n<lastBuildDate>${rfc822(latest(blog.inLang[lang]))}</lastBuildDate>\n<atom:link href="${origin}${feedPath(lang)}" rel="self" type="application/rss+xml"/>\n${items.join('\n')}\n</channel>\n</rss>\n`;
}

/** Sitemap `<url>` lines of the blog: index and series first pages and articles, each with lastmod. */
export function sitemapEntries(pages) {
  return pages.filter(p => p.sitemap).map(p => {
    const alts = hreflangs(p).map(h => `<xhtml:link rel="alternate" hreflang="${h.hreflang}" href="${h.href}"/>`).join('');
    return `  <url><loc>${origin}${p.path}</loc><lastmod>${p.lastmod}</lastmod>${alts}</url>`;
  });
}
