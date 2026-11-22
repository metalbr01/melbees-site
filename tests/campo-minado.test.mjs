import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { read } from './helpers.mjs';
import { bannedCopy } from '../_fonte/site.mjs';

const cm = createRequire(import.meta.url)('../assets/campo-minado.js');
const { LEVELS, createGame, hint, probabilities, placeMines, mulberry32, parseSeed, neighborsOf, describe, TEXT } = cm;

// A tiny deterministic generator for the tests themselves (not the one under test).
const rand = seed => { const r = mulberry32(seed ^ 0x9e3779b9); return n => Math.floor(r() * n); };

test('mulberry32 is deterministic and the seed parser is stable', () => {
  const a = mulberry32(12345), b = mulberry32(12345);
  const first = Array.from({ length: 5 }, () => a());
  assert.deepEqual(first, Array.from({ length: 5 }, () => b()));
  assert.ok(first.every(x => x >= 0 && x < 1));
  assert.notDeepEqual(first, Array.from({ length: 5 }, mulberry32(12346)));
  assert.equal(parseSeed('42'), 42);
  assert.equal(parseSeed(' 42 '), 42);
  assert.equal(parseSeed('4294967297'), 1);
  assert.equal(parseSeed('abc'), parseSeed('abc'));
  assert.notEqual(parseSeed('abc'), parseSeed('abd'));
  assert.equal(parseSeed(''), null);
  assert.equal(parseSeed(null), null);
  assert.equal(parseSeed('x'.repeat(65)), null);
});

test('the three levels have the classic sizes and the layout depends only on the seed, the level and the first click', () => {
  assert.deepEqual(LEVELS.beginner, { w: 9, h: 9, mines: 10 });
  assert.deepEqual(LEVELS.intermediate, { w: 16, h: 16, mines: 40 });
  assert.deepEqual(LEVELS.advanced, { w: 30, h: 16, mines: 99 });
  for (const [name, lv] of Object.entries(LEVELS)) for (let seed = 1; seed <= 40; seed++) {
    const first = (seed * 37) % (lv.w * lv.h);
    const mines = placeMines(lv, seed, first);
    assert.equal(mines.reduce((s, x) => s + x, 0), lv.mines, `${name} ${seed}`);
    assert.equal(mines[first], 0, 'the first click is never a mine');
    for (const nb of neighborsOf(lv.w, lv.h)[first]) assert.equal(mines[nb], 0, 'nor its neighbours');
    assert.deepEqual([...placeMines(lv, seed, first)], [...mines], 'same seed and click, same board');
  }
});

test('game rules: cascade, flags, chord, win and loss', () => {
  const g = createGame('beginner', 99);
  assert.equal(g.status, 'ready');
  assert.equal(g.toggleFlag(0), true); assert.equal(g.flags, 1); assert.equal(g.open(0), false, 'a flagged cell does not open');
  g.toggleFlag(0); assert.equal(g.flags, 0);
  g.open(40);
  assert.equal(g.status, 'playing');
  assert.equal(g.mine[40], 0);
  assert.ok(g.opened >= 1);
  if (g.near[40] === 0) assert.ok(g.opened > 1, 'a zero opens its neighbours in cascade');
  // Play it out by logic only where it is safe: open every non-mine cell and win.
  for (let i = 0; i < g.n; i++) if (!g.mine[i]) g.open(i);
  assert.equal(g.status, 'won');
  assert.equal(g.flags, g.total, 'a win flags the remaining mines');
  // Loss.
  const l = createGame('beginner', 99); l.open(40);
  const m = [...l.mine].findIndex(x => x === 1);
  l.open(m);
  assert.equal(l.status, 'lost'); assert.equal(l.hit, m);
  assert.equal(l.open(0), false); assert.equal(l.toggleFlag(0), false);
  // Chord opens the neighbours of a satisfied number and loses on a wrong flag.
  const c = createGame('beginner', 5); c.open(40);
  const num = [...Array(c.n).keys()].find(i => c.state[i] === 1 && c.near[i] > 0);
  const around = neighborsOf(9, 9)[num];
  for (const k of around) if (c.mine[k]) c.toggleFlag(k);
  assert.equal(c.chord(num), true);
  assert.ok(['playing', 'won'].includes(c.status));
  for (const k of around) if (!c.mine[k]) assert.equal(c.state[k] === 1 || c.state[k] === 0, true);
  const w = createGame('beginner', 5); w.open(40);
  const num2 = [...Array(w.n).keys()].find(i => w.state[i] === 1 && w.near[i] > 0);
  const nb2 = neighborsOf(9, 9)[num2];
  const wrong = nb2.filter(k => !w.mine[k] && w.state[k] === 0).slice(0, w.near[num2]);
  const real = nb2.filter(k => w.mine[k]);
  if (wrong.length === w.near[num2] && real.length) { wrong.forEach(k => w.toggleFlag(k)); w.chord(num2); assert.equal(w.status, 'lost'); }
});

/** Plays boards with the hint and checks every claim against the real mines. */
function playWithHints(levelName, seeds, { flagNoise = false } = {}) {
  const lv = LEVELS[levelName];
  let deductions = 0, wins = 0, guesses = 0, byTier = { 1: 0, 2: 0, 3: 0 };
  for (const seed of seeds) {
    const pick = rand(seed);
    const g = createGame(levelName, seed);
    assert.equal(hint(g.view(), g.flagArray()).kind, 'start');
    g.open(pick(lv.w * lv.h));
    if (flagNoise) {
      // some correct flags and some wrong ones: the solver must not trust or contradict any of them
      for (let i = 0; i < g.n; i++) if (g.state[i] === 0 && (g.mine[i] ? pick(3) === 0 : pick(25) === 0)) g.toggleFlag(i);
    }
    for (let guard = 0; guard < 1200 && g.status === 'playing'; guard++) {
      const flags = g.flagArray(), view = g.view();
      const step = hint(view, flags);
      if (step.kind !== 'deduction') { assert.ok(['guess', 'unknown'].includes(step.kind), step.kind); guesses++; break; }
      deductions++; byTier[step.tier]++;
      assert.ok(step.safe.length + step.mine.length > 0);
      for (const c of step.safe) { assert.equal(g.mine[c], 0, `${levelName} seed ${seed}: cell ${c} claimed safe but is a mine (${step.rule})`); assert.equal(g.state[c] === 1, false); }
      for (const c of step.mine) { assert.equal(g.mine[c], 1, `${levelName} seed ${seed}: cell ${c} claimed mine but is safe (${step.rule})`); assert.equal(flags[c], 0, 'a cell the player already flagged is not repeated as news'); }
      for (const c of step.sources) assert.ok(view.cells[c] >= 0, 'sources are open numbers');
      for (const c of step.safe) { if (g.state[c] === 2) g.toggleFlag(c); g.open(c); }
      for (const c of step.mine) g.toggleFlag(c);
    }
    if (g.status === 'won') wins++;
    assert.notEqual(g.status, 'lost', `${levelName} seed ${seed}: following the hint never loses`);
  }
  return { deductions, wins, guesses, byTier };
}

test('hint soundness: hundreds of seeded boards, every claimed safe cell is safe and every claimed mine is a mine', () => {
  const seeds = n => Array.from({ length: n }, (_, i) => 1000 + i * 7919);
  const b = playWithHints('beginner', seeds(300));
  const i = playWithHints('intermediate', seeds(120));
  const a = playWithHints('advanced', seeds(60));
  const all = [b, i, a];
  assert.ok(all.every(r => r.deductions > 50), 'the solver finds real deductions on every level');
  assert.ok(b.wins > 30, `beginner boards solved by logic alone: ${b.wins}`);
  const tiers = all.reduce((s, r) => [s[0] + r.byTier[1], s[1] + r.byTier[2], s[2] + r.byTier[3]], [0, 0, 0]);
  assert.ok(tiers.every(t => t > 0), `all three tiers are exercised: ${tiers}`);
});

test('hint with flags: the solver never contradicts correct flags and ignores wrong ones', () => {
  const seeds = Array.from({ length: 150 }, (_, i) => 5000 + i * 31);
  const r = playWithHints('beginner', seeds, { flagNoise: true });
  assert.ok(r.deductions > 30);
  const r2 = playWithHints('intermediate', seeds.slice(0, 60), { flagNoise: true });
  assert.ok(r2.deductions > 30);
  // A wrong flag on a provably safe cell is reported as such.
  const g = createGame('beginner', 123); g.open(40);
  const safeStep = hint(g.view(), g.flagArray());
  const target = safeStep.safe.length ? safeStep.safe[0] : null;
  if (target !== null) {
    g.toggleFlag(target);
    const again = hint(g.view(), g.flagArray());
    assert.ok(again.kind === 'deduction');
    if (again.safe.includes(target)) assert.ok(again.wrongFlags.includes(target));
  }
});

/** All mine layouts consistent with what the player sees, by brute force. */
function consistentLayouts(view) {
  const n = view.w * view.h, nb = neighborsOf(view.w, view.h), out = [];
  const closed = [...Array(n).keys()].filter(i => view.cells[i] < 0);
  const k = view.total;
  const chosen = [];
  const mine = new Uint8Array(n);
  (function rec(start) {
    if (chosen.length === k) {
      for (let i = 0; i < n; i++) if (view.cells[i] >= 0) { let s = 0; for (const j of nb[i]) s += mine[j]; if (s !== view.cells[i]) return; }
      out.push(Uint8Array.from(mine));
      return;
    }
    if (closed.length - start < k - chosen.length) return;
    for (let x = start; x < closed.length; x++) { mine[closed[x]] = 1; chosen.push(closed[x]); rec(x + 1); chosen.pop(); mine[closed[x]] = 0; }
  })(0);
  return out;
}

test('hint is exact on small boards: every claim holds in every consistent layout, nothing provable is missed, risks are exact', () => {
  const level = { w: 5, h: 4, mines: 5 };
  let checkedStates = 0, deductionStates = 0, guessStates = 0, totalUses = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const pick = rand(seed * 13);
    const g = createGame(level, seed);
    g.open(pick(20));
    for (let move = 0; move < 12 && g.status === 'playing'; move++) {
      const view = g.view();
      const layouts = consistentLayouts(view);
      assert.ok(layouts.length >= 1);
      const closed = [...Array(g.n).keys()].filter(i => view.cells[i] < 0);
      const alwaysMine = closed.filter(i => layouts.every(l => l[i] === 1));
      const alwaysSafe = closed.filter(i => layouts.every(l => l[i] === 0));
      const step = hint(view, new Uint8Array(g.n));
      checkedStates++;
      if (alwaysMine.length || alwaysSafe.length) {
        deductionStates++;
        assert.equal(step.kind, 'deduction', `seed ${seed} move ${move}: a provable cell exists`);
        for (const c of step.safe) assert.ok(alwaysSafe.includes(c), `claimed safe ${c} is not safe in all layouts (${step.rule})`);
        for (const c of step.mine) assert.ok(alwaysMine.includes(c), `claimed mine ${c} is not a mine in all layouts (${step.rule})`);
        if (step.rule === 'enumTotal') totalUses++;
      } else {
        guessStates++;
        assert.equal(step.kind, 'guess', 'no provable cell: an honest guess');
        const p = probabilities(view);
        for (const c of closed) assert.ok(Math.abs(p[c] - layouts.filter(l => l[c]).length / layouts.length) < 1e-9, `risk of ${c}`);
        const best = Math.min(...closed.map(c => p[c]));
        assert.ok(Math.abs(step.risk - best) < 1e-9);
        assert.ok(Math.abs(p[step.cell] - best) < 1e-9);
      }
      // advance: apply the claim, or open the lowest-risk cell if it is safe in the real board
      if (step.kind === 'deduction') { step.safe.forEach(c => g.open(c)); step.mine.forEach(c => g.toggleFlag(c)); }
      else { if (g.mine[step.cell]) break; g.open(step.cell); }
    }
  }
  assert.ok(deductionStates > 30 && guessStates > 5, `states: ${deductionStates} deductions, ${guessStates} guesses`);
  assert.ok(checkedStates > 100);
});

test('the total mine count is used only when it is exact and still never gives a wrong claim', () => {
  // A hand-made board where the border alone proves nothing but the total does: 1x3 strip.
  // Cells: [1][ ][ ] with one mine in total: the 1 sees only cell 1, so cell 1 is a mine by rule 1.
  const view = { w: 3, h: 1, total: 1, cells: Int8Array.from([1, -1, -1]) };
  const s = hint(view, new Uint8Array(3));
  assert.equal(s.kind, 'deduction'); assert.deepEqual(s.mine, [1]);
  // Total 2 in a 2x2 corner with a 1 touching three cells: the interior cell is decided only by the total.
  const view2 = { w: 4, h: 1, total: 1, cells: Int8Array.from([-1, 1, -1, -1]) };
  const s2 = hint(view2, new Uint8Array(4));
  assert.equal(s2.kind, 'deduction');
  assert.deepEqual([...s2.safe].sort(), [3], 'one mine sits next to the 1, so the far cell is safe, by the total');
  assert.equal(s2.rule, 'enumTotal');
  // With 2 mines in total the far cell must hold the second one, by the total alone.
  const view3 = { w: 4, h: 1, total: 2, cells: Int8Array.from([-1, 1, -1, -1]) };
  const s3 = hint(view3, new Uint8Array(4));
  assert.equal(s3.rule, 'enumTotal'); assert.deepEqual(s3.mine, [3]);
});

test('hint states: start, done, honest guess, and explanations in four languages', () => {
  const g = createGame('beginner', 1);
  assert.equal(hint(g.view(), g.flagArray()).kind, 'start');
  // a guess: seeds where the hint ends in a guess
  let guess = null;
  for (let seed = 1; seed < 400 && !guess; seed++) {
    const p = rand(seed), gg = createGame('intermediate', seed); gg.open(p(256));
    for (let k = 0; k < 400 && gg.status === 'playing'; k++) {
      const s = hint(gg.view(), gg.flagArray());
      if (s.kind === 'guess') { guess = { s, w: gg.w }; break; }
      if (s.kind !== 'deduction') break;
      s.safe.forEach(c => gg.open(c)); s.mine.forEach(c => gg.toggleFlag(c));
    }
  }
  assert.ok(guess, 'some board needs a guess');
  assert.ok(guess.s.risk > 0 && guess.s.risk < 1);
  for (const lang of Object.keys(TEXT)) {
    const d = describe(guess.s, lang, guess.w);
    assert.match(d.paragraphs.join(' '), /%/);
    for (const kind of ['start', 'done', 'unknown']) assert.ok(describe({ kind }, lang, 9).paragraphs[0].length > 10);
  }
});

test('texts: four languages with the same keys, no banned copy, no em dash, no external requests', () => {
  assert.deepEqual(Object.keys(TEXT).sort(), ['en', 'es', 'fr', 'pt']);
  const keys = Object.keys(TEXT.pt).sort();
  for (const lang of Object.keys(TEXT)) {
    assert.deepEqual(Object.keys(TEXT[lang]).sort(), keys, lang);
    const flat = JSON.stringify(TEXT[lang], (k, v) => typeof v === 'function' ? v(2) : v);
    assert.doesNotMatch(flat, bannedCopy, lang);
    assert.doesNotMatch(flat, /[–—]/, lang);
    assert.equal(TEXT[lang].rules.length, TEXT.pt.rules.length);
  }
  for (const file of ['assets/campo-minado.js', 'assets/campo-minado.css']) {
    const src = read(file);
    assert.doesNotMatch(src, /https?:\/\/|fetch\(|XMLHttpRequest|WebSocket|sendBeacon|importScripts|eval\(|document\.write/, `${file}: no network, no eval`);
    assert.doesNotMatch(src, bannedCopy, file);
    assert.doesNotMatch(src, /—/, file);
  }
});

test('describe produces a title and text for every rule of the solver', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 200 && seen.size < 6; seed++) {
    const p = rand(seed), g = createGame('intermediate', seed); g.open(p(256));
    for (let k = 0; k < 400 && g.status === 'playing'; k++) {
      const s = hint(g.view(), g.flagArray());
      if (s.kind !== 'deduction') break;
      for (const lang of Object.keys(TEXT)) {
        const d = describe(s, lang, g.w);
        assert.ok(d.title && d.paragraphs.length && d.paragraphs.every(x => x.length > 15), `${s.rule}/${lang}`);
        assert.doesNotMatch(d.paragraphs.join(' '), /\{\w+\}|undefined|NaN/, `${s.rule}/${lang}`);
      }
      seen.add(s.rule + (s.safe.length ? '-safe' : '-mine'));
      s.safe.forEach(c => g.open(c)); s.mine.forEach(c => g.toggleFlag(c));
    }
  }
  assert.ok(seen.size >= 4, [...seen].join());
});
