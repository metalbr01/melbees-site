// Blog model: reads and validates the articles, plans every page, and builds the page bodies, RSS and sitemap
// entries. It writes nothing; gerar.mjs owns the shell (head, header, footer) and the file system.
import fs from 'node:fs';
import path from 'node:path';
import { origin, languages, htmlLang, labels, byId, filename, blogRoutes, blogCategories, blogHosts, blogText, bannedCopy, formatDate, daily, escape } from './site.mjs';

export const PAGE_SIZE = 10;
export const RSS_LIMIT = 50;
export const STATES = ['rascunho', 'publicado'];
const KEYS = new Set(['titulo', 'descricao', 'publicado', 'atualizado', 'categorias', 'balao', 'galeria', 'video', 'traducao', 'destaque', 'estado']);
const IMAGE_FILE = /^[a-z0-9][a-z0-9._-]*\.(?:webp|png|jpe?g)$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VIDEO = /^[A-Za-z0-9_-]{11}$/;
const reserved = new Set(['feed', 'index', ...languages.flatMap(l => [blogRoutes[l].category, blogRoutes[l].page])]);
const voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));

export const blogBase = lang => `${lang === 'pt' ? '' : '/' + lang}/blog/`;
export const indexPath = (lang, page = 1) => blogBase(lang) + (page > 1 ? `${blogRoutes[lang].page}/${page}/` : '');
export const categoryPath = (lang, id, page = 1) => `${blogBase(lang)}${blogRoutes[lang].category}/${blogCategories[id].slug[lang]}/` + (page > 1 ? `${blogRoutes[lang].page}/${page}/` : '');
export const articlePath = a => `${blogBase(a.lang)}${a.slug}/`;
export const feedPath = lang => `${blogBase(lang)}feed.xml`;

// Pictures of the body, in order: every <img> outside comments, with its src read in any valid form (double or single
// quotes, no quotes, spaces around =). The card thumbnail and the gallery de-duplication both read this one list.
const IMG_TAG = /<img\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const ATTR = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'", '#34': '"' };
export function imageSources(body) {
  const out = [];
  for (const [, inner] of body.replace(/<!--[\s\S]*?-->/g, '').matchAll(IMG_TAG)) {
    const src = [...inner.matchAll(ATTR)].find(m => m[1].toLowerCase() === 'src');
    const value = src && (src[2] ?? src[3] ?? src[4] ?? '').trim();
    if (value) out.push(value.replace(/&(amp|quot|apos|lt|gt|#39|#34);/g, (_, e) => ENTITIES[e]));
  }
  return out;
}
const pictureName = src => src.split(/[?#]/)[0].split('/').pop().toLowerCase();

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
    if (m[1] === 'serie') fail('a chave "serie" foi substituída por "categorias" (ids separados por vírgula: ' + Object.keys(blogCategories).join(', ') + ')');
    if (!KEYS.has(m[1])) fail(`chave desconhecida "${m[1]}" (válidas: ${[...KEYS].join(', ')})`);
    if (m[1] in meta) fail(`chave repetida "${m[1]}"`);
    meta[m[1]] = m[2].trim();
  });
  const body = lines.slice(end + 1).join('\n').trim();
  if (!STATES.includes(meta.estado)) fail(`estado deve ser ${STATES.join(' ou ')}`);
  for (const key of ['publicado', 'atualizado']) if (meta[key] !== undefined && !realDate(meta[key])) fail(`${key} deve ser uma data real AAAA-MM-DD`);
  if (meta.destaque !== undefined && !/^[1-9]\d?$/.test(meta.destaque)) fail('destaque deve ser a posição na faixa de destaques, de 1 a 99 (1 aparece primeiro)');
  if (meta.video !== undefined && !VIDEO.test(meta.video)) fail('video deve ser o id do YouTube (11 caracteres: letras, números, - e _)');
  const categories = (meta.categorias || '').split(',').map(c => c.trim()).filter(Boolean);
  if (meta.categorias !== undefined && !categories.length) fail('categorias está vazia (use ids separados por vírgula)');
  for (const id of categories) {
    if (!Object.hasOwn(blogCategories, id)) fail(`categoria "${id}" não existe (válidas: ${Object.keys(blogCategories).join(', ')})`);
    if (!blogCategories[id].name[lang]) fail(`a categoria "${id}" ainda não tem nome em ${lang} (site.mjs)`);
    if (!SLUG.test(blogCategories[id].slug?.[lang] || '')) fail(`a categoria "${id}" ainda não tem slug válido em ${lang} (site.mjs)`);
  }
  if (new Set(categories).size !== categories.length) fail('categorias repetidas');
  if (meta.balao !== undefined && (!meta.balao || meta.balao.length > 120)) fail('balao deve ter de 1 a 120 caracteres');
  const gallery = (meta.galeria || '').split(';').map(s => s.trim()).filter(Boolean).map(item => {
    // Exactly one | per item: the alt text can hold neither ; nor |.
    const parts = item.split('|');
    const [file, alt] = parts.map(p => p.trim());
    if (parts.length !== 2 || !IMAGE_FILE.test(file) || !alt) fail(`galeria "${item}": use arquivo.webp|texto alternativo, itens separados por ; (sem ; nem | no texto)`);
    return { file, alt };
  });
  const declared = gallery.map(g => g.file);
  const twice = declared.find((g, i) => declared.indexOf(g) !== i);
  if (twice) fail(`galeria "${twice}" aparece mais de uma vez`);
  const translations = (meta.traducao || '').split(',').map(s => s.trim()).filter(Boolean).map(item => {
    const m = /^([a-z]{2})\/([a-z0-9-]+)$/.exec(item);
    if (!m || !languages.includes(m[1]) || m[1] === lang || !SLUG.test(m[2])) fail(`traducao "${item}": use idioma/slug de outro idioma (${languages.filter(l => l !== lang).join(', ')})`);
    return { lang: m[1], slug: m[2] };
  });
  const article = { lang, slug, file, state: meta.estado, title: meta.titulo, description: meta.descricao, published: meta.publicado, updated: meta.atualizado, categories, balloon: meta.balao, gallery, video: meta.video, featured: meta.destaque === undefined ? undefined : Number(meta.destaque), translations, body };
  if (meta.estado === 'publicado') {
    for (const [key, value] of [['titulo', meta.titulo], ['descricao', meta.descricao], ['publicado', meta.publicado], ['categorias', categories.length]]) if (!value) fail(`${key} é obrigatório em artigo publicado`);
    if (!body) fail('o corpo está vazio');
    checkBody(body, fail);
    for (const [key, value] of [['titulo', meta.titulo], ['descricao', meta.descricao], ['balao', meta.balao || ''], ['galeria', meta.galeria || ''], ['corpo', body]]) { const hit = bannedCopy.exec(value); if (hit) fail(`${key} contém texto proibido (${hit[0]}); veja o README`); }
    const sources = imageSources(body);
    article.thumb = sources[0];
    // The gallery never repeats a picture that already appears in the text.
    const used = new Set(sources.map(pictureName));
    article.gallery = gallery.filter(g => !used.has(g.file.toLowerCase()));
    article.minutes = Math.max(1, Math.round(body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length / 200));
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
  for (const a of all) if (a.state === 'publicado') for (const g of a.gallery) {
    if (!fs.existsSync(path.join(contentRoot, '..', '..', 'assets', 'blog', a.slug, g.file))) throw new Error(`${a.file}: galeria "${g.file}" não existe em assets/blog/${a.slug}/`);
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
  const inCategory = (lang, id) => inLang[lang].filter(a => a.categories.includes(id));
  return {
    pageSize, all, published: published.sort(byNewest), inLang, categoryIds: Object.keys(blogCategories),
    langs: languages.filter(l => inLang[l].length),
    has: lang => inLang[lang].length > 0,
    inCategory,
  };
}

/** Articles with `destaque:`, position order (1 first), newest first among equals; at most FEATURED_MAX. */
export const FEATURED_MAX = 3;
export const featuredOf = (blog, lang) => blog.inLang[lang].filter(a => a.featured !== undefined).sort((a, b) => a.featured - b.featured || byNewest(a, b)).slice(0, FEATURED_MAX);
const chunk = (items, size) => Array.from({ length: Math.max(1, Math.ceil(items.length / size)) }, (_, i) => items.slice(i * size, (i + 1) * size));
const latest = items => items.reduce((m, a) => (a.updated > m ? a.updated : m), '') || undefined;
const xDefault = members => (members.find(m => m.lang === 'pt') || members[0]);

/** Every public page of the blog: path, kind, alternates, sitemap entry data. */
export function planPages(blog) {
  const pages = [];
  for (const lang of blog.langs) {
    const list = blog.inLang[lang];
    const others = blog.langs.filter(l => l !== lang);
    // The "trending" strip of the first index page shows the featured articles, so the list below leaves them out.
    const featured = featuredOf(blog, lang);
    chunk(list.filter(a => !featured.includes(a)), blog.pageSize).forEach((items, i, all) => pages.push({
      kind: 'index', lang, page: i + 1, pages: all.length, items, featured: i === 0 ? featured : [], path: indexPath(lang, i + 1),
      alternates: i === 0 ? others.map(l => ({ lang: l, path: indexPath(l) })) : [], lastmod: latest(list), sitemap: i === 0,
    }));
    // Every fixed category has a page in a language that has a blog, so the filter buttons never lead to a 404.
    // An empty one says so, is noindex, carries no ad and stays out of the sitemap and the hreflang set.
    for (const id of blog.categoryIds) {
      const inCategory = blog.inCategory(lang, id);
      const otherLangs = others.filter(l => blog.inCategory(l, id).length);
      if (!inCategory.length) { pages.push({ kind: 'category', lang, category: id, page: 1, pages: 1, items: [], empty: true, path: categoryPath(lang, id), alternates: [], lastmod: '', sitemap: false }); continue; }
      chunk(inCategory, blog.pageSize).forEach((items, i, all) => pages.push({
        kind: 'category', lang, category: id, page: i + 1, pages: all.length, items, path: categoryPath(lang, id, i + 1),
        alternates: i === 0 ? otherLangs.map(l => ({ lang: l, path: categoryPath(l, id) })) : [], lastmod: latest(inCategory), sitemap: i === 0,
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

/** Where each language button of the header goes: the translation, else that language's blog (the same category page for a category), else its home page. */
export function selector(blog, page) {
  return Object.fromEntries(languages.map(l => {
    if (l === page.lang) return [l, page.path];
    if (!blog.has(l)) return [l, byId.home.paths[l]];
    if (page.kind === 'category') return [l, categoryPath(l, page.category)];
    const alt = page.kind === 'article' ? page.alternates.find(a => a.lang === l) : null;
    return [l, alt ? alt.path : indexPath(l)];
  }));
}

const time = (iso, lang) => `<time datetime="${iso}">${escape(formatDate(iso, lang))}</time>`;
const categoryName = (id, lang) => blogCategories[id].name[lang];
const firstCategory = a => blogCategories[a.categories[0]];
const colors = c => `--c:${c.bg};--ci:${c.ink}`;
const hostImg = (key, cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="/assets/blog/hosts/${key}.webp" alt="" width="${blogHosts[key].size[0]}" height="${blogHosts[key].size[1]}" decoding="async">`;
const avatarImg = key => `<img src="/assets/blog/hosts/${key}-avatar.webp" alt="" width="34" height="34" loading="lazy" decoding="async">`;
const hexIcon = fill => `<svg class="hx" viewBox="0 0 18 20" width="18" height="20" aria-hidden="true" focusable="false"><polygon points="9,1 17,5.5 17,14.5 9,19 1,14.5 1,5.5" fill="${fill}" stroke="rgba(46,31,10,.35)" stroke-width="1.5"/></svg>`;
const pagerNav = (page, link, t) => {
  if (page.pages < 2) return '';
  const prev = page.page > 1 ? `<a rel="prev" href="${link(page.page - 1)}">${t.newer}</a>` : '';
  const next = page.page < page.pages ? `<a rel="next" href="${link(page.page + 1)}">${t.older}</a>` : '';
  return `<nav class="pager" aria-label="${t.paging}">${prev}<span>${t.page} ${page.page} / ${page.pages}</span>${next}</nav>`;
};
const crumbs = (items, t) => `<nav class="breadcrumbs" aria-label="${t.crumbs}"><ol>${items.map((c, i) => i === items.length - 1 ? `<li><span aria-current="page">${escape(c.name)}</span></li>` : `<li><a class="keep-src" href="${c.path}">${escape(c.name)}</a></li>`).join('')}</ol></nav>`;
// Breadcrumbs and BreadcrumbList use the first category only; the article has one canonical URL.
const breadcrumbItems = (page) => {
  const { lang } = page;
  const items = [{ name: labels[lang].home, path: byId.home.paths[lang] }, { name: labels[lang].blog, path: indexPath(lang) }];
  if (page.kind === 'category') items.push({ name: categoryName(page.category, lang), path: categoryPath(lang, page.category) });
  if (page.kind === 'article') items.push({ name: categoryName(page.article.categories[0], lang), path: categoryPath(lang, page.article.categories[0]) }, { name: page.article.title, path: page.path });
  return items;
};
const meta = (a, t) => `${time(a.published, a.lang)} · ${a.minutes} ${t.minRead}`;
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
function card(a, t) {
  const lang = a.lang;
  const c = firstCategory(a);
  const photo = a.thumb ? `<img src="${escape(a.thumb)}" alt="" loading="lazy" decoding="async">` : hostImg(c.host);
  const tags = a.categories.map(id => `<span class="tag" style="background:${blogCategories[id].ink}">${escape(categoryName(id, lang))}</span>`).join('');
  // A card with a Short plays it right there (blog.js swaps the thumbnail for the player on click); the title link still opens the article.
  const media = a.video
    ? `<div class="ph vid"><a class="video-play" href="https://www.youtube.com/watch?v=${a.video}" rel="noopener" data-video-id="${a.video}" data-title="${escape(a.title)}" aria-label="${escape(`${t.watch}: ${a.title}`)}"><img src="https://i.ytimg.com/vi/${a.video}/hqdefault.jpg" alt="" width="480" height="360" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="video-icon" aria-hidden="true"></span><span class="video-label">${t.watch}</span></a></div>`
    : `<div class="ph">${photo}</div>`;
  return `<li class="card${a.video || a.thumb ? '' : ' contain'}${a.video ? ' has-video' : ''}" style="${colors(c)}">${media}<div class="tags">${tags}${a.video ? `<span class="vtag">${PLAY_ICON}${t.video}</span>` : ''}</div><h2><a href="${articlePath(a)}">${escape(a.title)}</a></h2><p>${escape(a.description)}</p><p class="m">${meta(a, t)}</p></li>`;
}
// Category buttons (Favo Vivo v3): "all" is a honey hexagon; every category shows the avatar of its host
// (blogCategories[id].host, one per category: Hug, Lil, Flo, Dot, Red, Mel and Lum).
function filters(lang, current, t) {
  const item = (href, label, icon, on) => `<a href="${href}"${on ? ' aria-current="page"' : ''}><span class="av">${icon}</span><span class="fl">${escape(label)}</span></a>`;
  const all = item(indexPath(lang), t.allCategories, hexIcon('#F4B82E'), current === 'all');
  const rest = Object.entries(blogCategories).map(([id, c]) => item(categoryPath(lang, id), c.name[lang], avatarImg(c.host), current === id));
  return `<nav class="filtros" aria-label="${t.categories}">${all}${rest.join('')}</nav>`;
}
function cta(lang, t) {
  return `<aside class="post-cta">${hostImg('mel', 'cta-mel')}<p>${t.lead}</p><div class="cta"><a class="btn" lang="${htmlLang[lang]}" href="${daily[lang]}?utm_source=site&amp;utm_medium=web&amp;utm_campaign=blog" rel="noopener">${t.play}</a></div></aside>`;
}
// Side column of the index and category pages: the games, so the width of a wide screen is not left empty.
function sidebar(lang, t) {
  const utm = `?utm_source=site&amp;utm_medium=web&amp;utm_campaign=blog-lateral`;
  const items = [
    [`${daily[lang]}${utm}`, t.side.daily, true],
    [`${daily[lang]}${utm}`, t.side.duel, true],
    [byId['como-jogar'].paths[lang], t.side.how, false],
    [byId.professores.paths[lang], t.side.teachers, false],
  ].map(([href, [title, text], external]) => `<li><a ${external ? 'rel="noopener" ' : 'class="keep-src" '}href="${href}"><strong>${escape(title)}</strong><span>${escape(text)}</span></a></li>`).join('');
  return `<aside class="lateral" aria-labelledby="lateral-t">${hostImg('mel', 'lateral-mel')}<h2 id="lateral-t">${t.side.title}</h2><ul>${items}</ul><a class="btn" lang="${htmlLang[lang]}" href="${daily[lang]}${utm}" rel="noopener">${t.play}</a></aside>`;
}
/** Strip of the home page: the featured articles first, then the newest, three in all. */
export function homeBlog(blog, lang) {
  const t = blogText[lang];
  const featured = featuredOf(blog, lang);
  const picks = [...featured, ...blog.inLang[lang].filter(a => !featured.includes(a))].slice(0, 3);
  return `<section class="blog home-blog" aria-labelledby="home-blog-t"><div class="wrap"><div class="sec-head"><p class="eyebrow">${escape(labels[lang].blog)}</p><h2 id="home-blog-t">${t.homeTitle}</h2></div><ol class="cards">${picks.map(a => card(a, t)).join('')}</ol><p class="home-blog-all"><a class="keep-src" href="${indexPath(lang)}">${t.all}</a></p></div></section>`;
}
function videoBlock(a, t) {
  const id = a.video;
  const label = `${t.watch}: ${a.title}`;
  // A plain link to YouTube works without JavaScript; blog.js swaps it for the iframe on click. Nothing from
  // YouTube except this one thumbnail image is requested before the click.
  return `<div class="vbox"><div class="video"><a class="video-play" href="https://www.youtube.com/watch?v=${id}" rel="noopener" data-video-id="${id}" data-title="${escape(a.title)}" aria-label="${escape(label)}"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" width="480" height="360" decoding="async" referrerpolicy="no-referrer"><span class="video-icon" aria-hidden="true"></span><span class="video-label">${t.watch}</span></a></div><div class="vtxt"><p class="vt-title">${t.shortTitle}</p><p>${t.shortText}</p></div></div>`;
}
function gallery(a, t) {
  if (!a.gallery.length) return '';
  const figs = a.gallery.map((g, i) => `<figure><img src="/assets/blog/${a.slug}/${g.file}" alt="${escape(g.alt)}" loading="lazy" decoding="async"><figcaption>${i + 1} ${t.galleryOf} ${a.gallery.length}</figcaption></figure>`).join('');
  return `<section class="gal" aria-labelledby="gal-title"><h2 id="gal-title">${t.gallery}</h2><div class="gal-row" tabindex="0" role="group" aria-labelledby="gal-title">${figs}</div></section>`;
}
// "Keep reading": the other articles of the language, those sharing the most categories first, then newest.
function related(blog, a, t) {
  const shared = r => r.categories.filter(id => a.categories.includes(id)).length;
  const others = blog.inLang[a.lang].filter(r => r !== a).sort((x, y) => shared(y) - shared(x)).slice(0, 4);
  if (!others.length) return '';
  const items = others.map(r => `<li class="mais-card"><div class="mais-ph">${r.thumb ? `<img src="${escape(r.thumb)}" alt="" loading="lazy" decoding="async">` : hostImg(firstCategory(r).host)}</div><div class="mais-t"><small>${r.categories.map(id => escape(categoryName(id, a.lang))).join(' · ')}</small><a href="${articlePath(r)}">${escape(r.title)}</a></div></li>`).join('');
  return `<aside class="mais" aria-labelledby="related-title"><h2 id="related-title">${t.keepReading}</h2><ul>${items}</ul><p><a href="${categoryPath(a.lang, a.categories[0])}">${t.all}: ${escape(categoryName(a.categories[0], a.lang))}</a></p></aside>`;
}
function band(page, t, title) {
  return `<div class="band"><div class="wrap"><div class="txtb">${crumbs(breadcrumbItems(page), t)}<h1>${escape(title)}</h1><p class="lede">${t.intro}</p></div><div class="cast" aria-hidden="true">${hostImg('red')}${hostImg('mel')}${hostImg('hug')}</div></div></div>`;
}

/** The HTML placed inside <main> for a planned page. */
export function renderBody(blog, page) {
  const { lang } = page;
  const t = blogText[lang];
  const rss = `<p class="blog-rss"><a href="${feedPath(lang)}">${t.rss}</a></p>`;
  if (page.kind === 'index' || page.kind === 'category') {
    const isCategory = page.kind === 'category';
    const title = isCategory ? categoryName(page.category, lang) : labels[lang].blog;
    const link = n => (isCategory ? categoryPath(lang, page.category, n) : indexPath(lang, n));
    const list = page.items.length ? `<ol class="cards">${page.items.map(a => card(a, t)).join('')}</ol>` : `<p class="vazio">${t.emptyCategory}</p>`;
    const trending = page.featured?.length ? `<section class="em-alta" aria-labelledby="em-alta-t"><h2 id="em-alta-t">${t.trending}</h2><ol class="cards">${page.featured.map(a => card(a, t)).join('')}</ol></section>` : '';
    return `<div class="blog">${band(page, t, title)}<div class="wrap idx"><div class="idx-grid"><div class="idx-main">${filters(lang, isCategory ? page.category : 'all', t)}${trending}${list}${pagerNav(page, link, t)}${rss}</div>${sidebar(lang, t)}</div></div></div>`;
  }
  const a = page.article;
  const c = firstCategory(a);
  const host = blogHosts[c.host];
  const chips = a.categories.map(id => { const k = blogCategories[id]; return `<a class="chip" href="${categoryPath(lang, id)}">${avatarImg(k.host)}${escape(k.name[lang])}</a>`; }).join('');
  const bubble = a.balloon ? `<div class="bub"><p>${escape(a.balloon)}</p><small>${escape(host.name[lang])}</small></div>` : '';
  const hero = `<div class="hero-b" style="${colors(c)}"><div class="wrap"><div class="t">${crumbs(breadcrumbItems(page), t)}<div class="chips-a">${chips}</div><h1>${escape(a.title)}</h1><p class="lede">${escape(a.description)}</p><p class="meta">${t.by} <span class="author">${t.author}</span> · ${t.published} ${time(a.published, lang)} · ${t.updated} ${time(a.updated, lang)} · ${a.minutes} ${t.minRead}</p></div><div class="host">${bubble}${hostImg(c.host)}</div></div></div>`;
  // The Short box goes after the introduction (before the first h2), or first when the text has no h2.
  const cut = a.body.search(/<h2[\s>]/i);
  const video = a.video ? videoBlock(a, t) : '';
  const body = cut < 0 ? video + a.body : a.body.slice(0, cut) + video + a.body.slice(cut);
  return `<article class="blog post">${hero}<div class="wrap"><div class="post-main"><div class="post-body">${body}</div>${gallery(a, t)}${cta(lang, t)}</div>${related(blog, a, t)}</div></article>`;
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
    // The article's own picture (first image of the text, else the Short's thumbnail) heads the share card and the structured data.
    const image = a.thumb ? (/^https?:/.test(a.thumb) ? a.thumb : origin + a.thumb) : a.video ? `https://i.ytimg.com/vi/${a.video}/hqdefault.jpg` : `${origin}/assets/og.jpg`;
    const video = a.video ? { '@type': 'VideoObject', name: a.title, description: a.description, thumbnailUrl: [`https://i.ytimg.com/vi/${a.video}/hqdefault.jpg`], uploadDate: a.published, contentUrl: `https://www.youtube.com/watch?v=${a.video}`, inLanguage: htmlLang[lang] } : null;
    extra.push(`<meta property="article:section" content="${escape(categoryName(a.categories[0], lang))}">`);
    extra.push(`<meta property="article:published_time" content="${a.published}">`, `<meta property="article:modified_time" content="${a.updated}">`);
    extra.push(jsonScript({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'BlogPosting', '@id': `${url}#post`, headline: a.title, description: a.description, datePublished: a.published, dateModified: a.updated, inLanguage: htmlLang[lang], url, mainEntityOfPage: { '@type': 'WebPage', '@id': url }, image: [image], keywords: a.categories.map(id => categoryName(id, lang)).join(', '), wordCount: a.body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length, articleSection: a.categories.map(id => categoryName(id, lang)), author: organization, publisher: { ...organization, logo: { '@type': 'ImageObject', url: `${origin}/assets/icon-192.png` } } },
        { '@type': 'BreadcrumbList', itemListElement: items },
        ...(video ? [video] : []),
      ],
    }));
    if (a.video) extra.push(`<script src="/assets/blog.js" defer></script>`);
    return { title: `${a.title} · Melbees`, description: a.description, ogtype: 'article', image, extra: '\n' + extra.join('\n') };
  }
  if (page.items.some(a => a.video) || page.featured?.some(a => a.video)) extra.push(`<script src="/assets/blog.js" defer></script>`);
  if (page.items.length) extra.push(jsonScript({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: page.kind === 'category' ? `${categoryName(page.category, lang)} · ${labels[lang].blog}` : labels[lang].blog, url: origin + page.path, inLanguage: htmlLang[lang], mainEntity: { '@type': 'ItemList', itemListElement: [...(page.featured || []), ...page.items].map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: origin + articlePath(a), name: a.title })) } }));
  const name = page.kind === 'category' ? `${categoryName(page.category, lang)} · ${labels[lang].blog}` : labels[lang].blog;
  const description = page.kind === 'category' ? `${categoryName(page.category, lang)}: ${t.intro}` : t.intro;
  return { title: `${name}${suffix} · Melbees`, description, ogtype: 'website', extra: '\n' + extra.join('\n') };
}

// RFC 822 date, fixed at noon GMT of the content date: deterministic and independent of the machine's time zone.
const rfc822 = iso => new Date(`${iso}T12:00:00Z`).toUTCString();

export function renderFeed(blog, lang) {
  const t = blogText[lang];
  const list = blog.inLang[lang].slice(0, RSS_LIMIT);
  const url = origin + indexPath(lang);
  const items = list.map(a => `<item><title>${escape(a.title)}</title><link>${origin}${articlePath(a)}</link><guid isPermaLink="true">${origin}${articlePath(a)}</guid><pubDate>${rfc822(a.published)}</pubDate>${a.categories.map(id => `<category>${escape(categoryName(id, lang))}</category>`).join('')}<description>${escape(a.description)}</description></item>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n<title>${escape(`${labels[lang].blog} · Melbees`)}</title>\n<link>${url}</link>\n<description>${escape(t.intro)}</description>\n<language>${htmlLang[lang]}</language>\n<lastBuildDate>${rfc822(latest(blog.inLang[lang]))}</lastBuildDate>\n<atom:link href="${origin}${feedPath(lang)}" rel="self" type="application/rss+xml"/>\n${items.join('\n')}\n</channel>\n</rss>\n`;
}

/** Sitemap `<url>` lines of the blog: index and category first pages and articles, each with lastmod. */
export function sitemapEntries(pages) {
  return pages.filter(p => p.sitemap).map(p => {
    const alts = hreflangs(p).map(h => `<xhtml:link rel="alternate" hreflang="${h.hreflang}" href="${h.href}"/>`).join('');
    return `  <url><loc>${origin}${p.path}</loc><lastmod>${p.lastmod}</lastmod>${alts}</url>`;
  });
}
