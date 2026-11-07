import { escape, labels } from './site.mjs';

// Hexagon geometry is the original rendered geometry. The solution marker is
// added only to closed cells, following the teacher material's answer key.
export function centers(svg) {
  return [...svg.matchAll(/<polygon\b[^>]*points="([^"]+)"[^>]*stroke-linejoin="round"[^>]*\/>/g)].map(m => {
    const points = m[1].split(' ').map(p => p.split(',').map(Number));
    return { x: points.reduce((s, p) => s + p[0], 0) / 6, y: points.reduce((s, p) => s + p[1], 0) / 6, r: (Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1]))) / 2 };
  });
}
function accessibleSvg(svg, title) {
  return svg.replace(/<svg\b[^>]*>/, tag => tag.replace(/\s(?:width|height)="[^"]*"/g, '').replace('>', ` role="img" aria-label="${escape(title)}">`));
}
export function answerSvg(board) {
  const marks = centers(board.svg).map(({ x, y, r }, i) => {
    if (board.view.cells[i].state !== 'idle') return '';
    return `<circle cx="${x + r * .5}" cy="${y + r * .52}" r="${r * .27}" fill="#fff" stroke="#2E1F0A" stroke-width="${r * .03}"/><text x="${x + r * .5}" y="${y + r * .65}" font-family="sans-serif" font-size="${r * .4}" text-anchor="middle" fill="#2E1F0A">${board.solution[i] ? '✓' : '✕'}</text>`;
  }).join('');
  return board.svg.replace('</svg>', `${marks}</svg>`);
}
export function renderBoards(data, lang) {
  const t = labels[lang];
  return `<section class="puzzles wrap"><h2>${t.desafios}</h2>
<p><a href="/secret-of-bees/professores/favo-de-papel.pdf">${t.pdf}</a></p>
<div class="legend">${data.legends[lang]}</div>
${data.boards.filter(b => b.lang === lang).map((b, i) => {
    const name = `${t.desafios} ${i + 1}`;
    const masks = b.view.masked.map((row, slot) => `<p class="masked secret-${slot + 1}">${slot + 1}: ${row.map(l => escape(l || '_')).join(' ')}</p>`).join('');
    return `<article class="puzzle" id="puzzle-${i + 1}" data-board="${escape(b.id || b.n)}"><h3>${name}</h3><p>${escape(b.category)} · ${escape(b.sub)}</p>
<div class="masked-words">${masks}</div>
<div class="board">${accessibleSvg(b.svg, name)}</div>
<details><summary>${t.answer}</summary><div class="board">${accessibleSvg(answerSvg(b), `${t.answer} ${i + 1}`)}</div>
${b.secrets.map((s, slot) => `<p>${slot + 1}: <b>${escape(s.display)}</b>. ${escape(s.description)}</p>`).join('\n')}
</details></article>`;
  }).join('\n')}</section>`;
}
