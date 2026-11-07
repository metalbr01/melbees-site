// One-time migration from the pre-210 commit. Never run over edited source content.
// Only the generator is needed after this import; it has no external inputs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pages, languages, filename } from './site.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => fs.readFileSync(p, 'utf8');
function write(p, s) { const dest = path.join(root, '_fonte', p); if (fs.existsSync(dest)) throw new Error(`Already exists: ${dest}`); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, s.replaceAll('\r\n', '\n').replace(/[ \t]+$/gm, ''), 'utf8'); }
const voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
export function localize(html, lang) {
  const stack = []; let out = '';
  for (const token of html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || []) {
    if (/^<\//.test(token)) { const hidden = stack.pop(); if (!hidden) out += token; }
    else if (/^<[a-z]/i.test(token)) {
      const name = /^<([\w-]+)/.exec(token)[1];
      const ownLang = /\bdata-l="([^"]+)"/.exec(token)?.[1];
      const hidden = Boolean(stack.at(-1)) || (ownLang !== undefined && ownLang !== lang);
      if (!hidden) out += token.replace(/\sdata-l="[^"]+"/g, '');
      if (!voids.has(name) && !/\/>$/.test(token)) stack.push(hidden);
    } else if (!stack.at(-1)) out += token;
  }
  return out;
}
const metadata = {};
for (const page of pages) {
  for (const lang of languages) {
    const missing = !page.existing || (page.id === 'professores' && lang !== 'pt') || (['speedrun', 'imprensa'].includes(page.id) && ['es', 'fr'].includes(lang));
    if (missing) { write(`conteudo/${lang}/${page.id}.html`, 'RASCUNHO: texto a caminho\n'); continue; }
    const original = execFileSync('git', ['show', `0b1d10e:${filename(page.paths.pt)}`], { cwd: root, encoding: 'utf8' });
    let body = localize(/<main>([\s\S]*?)<\/main>/.exec(original)[1], lang).trim();
    body = body.replace(/<p class="nojs-note">[\s\S]*?<\/p>/g, '');
    // Existing prohibited claims are removed, without replacement copy.
    body = body.replace(' Não é concurso nem sorteio.', '').replace(', sem chutar', '');
    body = body.replace(/<li><span><b>Sem prêmio,[\s\S]*?<\/li>/g, '').replace(/<li><span><b>No prizes[\s\S]*?<\/li>/gi, '');
    body = body.replace('Sem prêmio: só corrida e recorde. ', '').replace('No prizes: just races and records. ', '');
    // Shared, unlocalized accessibility strings refer to the product name.
    body = body.replace(/alt="(?:Ícone d[^\"]*|Arte d[^\"]*|Melbees[^\"]*)"/g, 'alt="Melbees: The Secret of Bees"');
    body = body.replace(/<title id="favo-t">([^<]+)<\/title>/, (_, value) => `<title id="favo-t">${lang === 'pt' ? value.split(' / ')[0] : lang === 'en' ? value.split(' / ')[1] : 'Melbees: The Secret of Bees'}</title>`);
    const srcBase = new URL(page.paths.pt, 'https://melbees.games');
    body = body.replace(/\b(href|src|srcset)="([^"]+)"/g, (all, attr, value) => {
      if (/^(?:https?:|mailto:|data:|#)/.test(value)) return all;
      const url = new URL(value, srcBase);
      const target = pages.find(p => p.paths.pt === url.pathname);
      if (target && attr === 'href') url.pathname = target.paths[lang];
      return `${attr}="${url.pathname}${url.search}${url.hash}"`;
    });
    // The example room goal was a shared English string; keep it on the English page only.
    if (page.id === 'speedrun' && lang === 'pt') body = body.replace(/<div class="goal-label">[\s\S]*?<div class="goal">[\s\S]*?<\/div>/, '');
    write(`conteudo/${lang}/${page.id}.html`, body + '\n');
    metadata[`${page.id}/${lang}`] = {
      title: /<title>(.*?)<\/title>/.exec(original)[1],
      styles: [...original.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n'),
    };
  }
}
write('metadata.json', JSON.stringify(metadata, null, 2) + '\n');
// Reuse the existing rendered hexagons, masks and legend. No dependency on the game repo.
const teacherRoot = 'C:/Melbees_marketing/professores';
const creatorRoot = 'C:/Melbees_marketing/criadores/favo';
const teachers = JSON.parse(read(`${teacherRoot}/boards.json`)).boards;
const creatorBoards = JSON.parse(read(`${creatorRoot}/boards.json`)).boards;
const teacherHtml = read(`${teacherRoot}/favo-de-papel.html`);
const teacherSvgs = [...teacherHtml.matchAll(/<div class="favo">(<svg[\s\S]*?<\/svg>)<\/div>/g)].map(m => m[1]);
if (teacherSvgs.length < 6) throw new Error('Teacher SVGs missing');
const boards = [];
for (const [i, b] of teachers.entries()) {
  boards.push({ ...b, lang: 'pt', svg: teacherSvgs[i], source: 'professores/boards.json' });
}
for (const b of creatorBoards.filter(b => !b.lang.startsWith('pt'))) {
  const html = read(`${creatorRoot}/out/${b.id}.html`);
  const svg = /<div class="board">(<svg[\s\S]*?<\/svg>)<\/div>/.exec(html)?.[1];
  if (!svg) throw new Error(`Missing SVG: ${b.id}`);
  boards.push({ ...b, lang: b.lang.slice(0, 2), svg, source: 'criadores/favo/boards.json' });
}
// Legend comes from preexisting material; only remove the prohibited phrase.
const legends = {};
for (const lang of languages) {
  const tag = { pt: 'pt-BR', en: 'en-US', es: 'es-419', fr: 'fr-FR' }[lang];
  const html = read(`${creatorRoot}/out/geo-${tag}.html`);
  legends[lang] = /<div class="legend">([\s\S]*?)<\/div>\s*<p class="goal">/.exec(html)[1];
}
write('tabuleiros.json', JSON.stringify({ boards, legends }, null, 2) + '\n');
const protectedPaths = ['ads.txt', 'app-ads.txt', 'CNAME', '.nojekyll', 'secret-of-bees/app-update.json', 'assets/play.js', ...fs.readdirSync(path.join(root, 'secret-of-bees/speedrun/splits')).map(n => `secret-of-bees/speedrun/splits/${n}`)];
const { createHash } = await import('node:crypto');
write('protegidos.json', JSON.stringify(Object.fromEntries(protectedPaths.map(p => [p, createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex')])), null, 2) + '\n');
console.log(`Imported ${boards.length} boards and localized source pages.`);
