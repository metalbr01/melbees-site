/* Campo Minado do melbees.games: jogo de lógica no navegador, sem servidor, sem biblioteca e sem requisição externa.
   O mesmo arquivo roda no navegador (monta a interface em #campo-minado) e no Node (module.exports, usado pelos testes).
   Partes: gerador de minas (mulberry32 com semente), regras do jogo, solver do Hug (dica correta por construção) e interface. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.CampoMinado = api;
    if (typeof document !== 'undefined') api.boot();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- tabuleiro e sementes ---------- */
  var LEVELS = {
    beginner: { w: 9, h: 9, mines: 10 },
    intermediate: { w: 16, h: 16, mines: 40 },
    advanced: { w: 30, h: 16, mines: 99 }
  };

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Semente vinda da URL: números viram uint32; qualquer outro texto passa por FNV-1a. Vazio ou inválido: null. */
  function parseSeed(value) {
    if (value === null || value === undefined) return null;
    var s = String(value).trim();
    if (!s || s.length > 64) return null;
    if (/^\d{1,15}$/.test(s)) return Number(s) % 4294967296;
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  var tables = {};
  function neighborsOf(w, h) {
    var key = w + 'x' + h;
    if (tables[key]) return tables[key];
    var t = [];
    for (var r = 0; r < h; r++) for (var c = 0; c < w; c++) {
      var list = [];
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < h && cc >= 0 && cc < w) list.push(rr * w + cc);
      }
      t.push(list);
    }
    tables[key] = t;
    return t;
  }

  /** Minas de um tabuleiro. A ordem vem só da semente; o primeiro clique e as casas em volta dele ficam sem mina. */
  function placeMines(level, seed, first) {
    var w = level.w, h = level.h, n = w * h, rng = mulberry32(seed), order = new Array(n), i;
    for (i = 0; i < n; i++) order[i] = i;
    for (i = n - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
    var zone = new Uint8Array(n), nb = neighborsOf(w, h), free = n;
    zone[first] = 1;
    nb[first].forEach(function (k) { zone[k] = 1; });
    free = 0; for (i = 0; i < n; i++) if (!zone[i]) free++;
    if (free < level.mines) { zone.fill(0); zone[first] = 1; }
    var mine = new Uint8Array(n), placed = 0;
    for (i = 0; i < n && placed < level.mines; i++) if (!zone[order[i]]) { mine[order[i]] = 1; placed++; }
    return mine;
  }

  /* ---------- regras do jogo ---------- */
  function createGame(level, seed) {
    var lv = typeof level === 'string' ? LEVELS[level] : level;
    var w = lv.w, h = lv.h, n = w * h, nb = neighborsOf(w, h);
    var g = { w: w, h: h, n: n, total: lv.mines, level: lv, seed: seed >>> 0, state: new Uint8Array(n), mine: null, near: null, status: 'ready', opened: 0, flags: 0, hit: -1 };
    // state: 0 fechada, 1 aberta, 2 bandeira

    function start(first) {
      g.mine = placeMines(lv, g.seed, first);
      g.near = new Uint8Array(n);
      for (var i = 0; i < n; i++) { var s = 0; for (var k = 0; k < nb[i].length; k++) s += g.mine[nb[i][k]]; g.near[i] = s; }
      g.status = 'playing';
    }
    function lose(i) { g.status = 'lost'; g.hit = i; }
    function openOne(i) {
      if (g.state[i] !== 0) return;
      if (g.mine[i]) { lose(i); return; }
      var stack = [i];
      while (stack.length) {
        var c = stack.pop();
        if (g.state[c] !== 0) continue;
        g.state[c] = 1; g.opened++;
        if (g.near[c] === 0) for (var k = 0; k < nb[c].length; k++) if (g.state[nb[c][k]] === 0) stack.push(nb[c][k]);
      }
    }
    function checkWin() {
      if (g.status === 'playing' && g.opened === n - g.total) {
        g.status = 'won';
        for (var i = 0; i < n; i++) if (g.mine[i] && g.state[i] !== 2) g.state[i] = 2;
        g.flags = g.total;
      }
    }
    g.open = function (i) {
      if (g.status !== 'ready' && g.status !== 'playing') return false;
      if (g.state[i] !== 0) return false;
      if (g.status === 'ready') start(i);
      openOne(i); checkWin();
      return true;
    };
    g.toggleFlag = function (i) {
      if (g.status !== 'ready' && g.status !== 'playing') return false;
      if (g.state[i] === 1) return false;
      if (g.state[i] === 0) { g.state[i] = 2; g.flags++; } else { g.state[i] = 0; g.flags--; }
      return true;
    };
    /** Clique num número com as bandeiras certas em volta: abre as outras vizinhas (como no clássico). */
    g.chord = function (i) {
      if (g.status !== 'playing' || g.state[i] !== 1 || !g.near[i]) return false;
      var f = 0, k;
      for (k = 0; k < nb[i].length; k++) if (g.state[nb[i][k]] === 2) f++;
      if (f !== g.near[i]) return false;
      for (k = 0; k < nb[i].length && g.status === 'playing'; k++) openOne(nb[i][k]);
      checkWin();
      return true;
    };
    /** O que o jogador vê: -1 fechada (com ou sem bandeira), 0 a 8 o número da casa aberta. */
    g.view = function () {
      var cells = new Int8Array(n);
      for (var i = 0; i < n; i++) cells[i] = g.state[i] === 1 ? g.near[i] : -1;
      return { w: w, h: h, total: g.total, cells: cells };
    };
    g.flagArray = function () { var f = new Uint8Array(n); for (var i = 0; i < n; i++) f[i] = g.state[i] === 2 ? 1 : 0; return f; };
    return g;
  }

  /* ---------- solver do Hug ----------
     Entrada: só o que o jogador vê (números e casas fechadas). Bandeiras não entram na lógica, porque podem estar erradas:
     só servem para saber o que o jogador já marcou. Todo passo é uma prova:
       1. contagem simples de um número;
       2. dois números, um com as casas dentro do outro (1-1, 1-2...);
       3. todas as formas de pôr as minas na borda, por grupo conexo, e depois com o total de minas do jogo.
     Uma casa só sai como segura ou mina se vale em TODAS as formas que combinam com os números. */
  var ENUM_NODES = 600000, ENUM_PER_GROUP = 300000, ENUM_MAX_VARS = 80;

  function convolve(a, b, cap) {
    var out = new Array(cap + 1), i, j;
    for (i = 0; i <= cap; i++) out[i] = 0;
    for (i = 0; i < a.length && i <= cap; i++) {
      if (!a[i]) continue;
      for (j = 0; j < b.length && i + j <= cap; j++) if (b[j]) out[i + j] += a[i] * b[j];
    }
    return out;
  }
  function positive(a) { return a.map(function (x) { return x > 0 ? 1 : 0; }); }

  /** Todas as soluções de um grupo de casas ligadas por números. Devolve null se estourar o limite. */
  function enumerateGroup(vars, cons, budget) {
    var m = vars.length;
    if (m > ENUM_MAX_VARS) return null;
    var idx = {}, i;
    vars.forEach(function (c, k) { idx[c] = k; });
    var cs = cons.map(function (k) { return { v: k.U.map(function (c) { return idx[c]; }), rem: k.need, free: k.U.length }; });
    var of = []; for (i = 0; i < m; i++) of.push([]);
    cs.forEach(function (k, ci) { k.v.forEach(function (v) { of[v].push(ci); }); });
    var order = [], seen = new Uint8Array(m), q, qi, v, ci, w2;
    for (i = 0; i < m; i++) {
      if (seen[i]) continue;
      seen[i] = 1; q = [i]; qi = 0;
      while (qi < q.length) {
        v = q[qi++]; order.push(v);
        for (ci = 0; ci < of[v].length; ci++) for (w2 = 0; w2 < cs[of[v][ci]].v.length; w2++) { var u = cs[of[v][ci]].v[w2]; if (!seen[u]) { seen[u] = 1; q.push(u); } }
      }
    }
    var val = new Int8Array(m), cnt = new Array(m + 1), cellCnt = [], sol = 0, mines = 0, limit = Math.min(ENUM_PER_GROUP, budget.nodes), used = 0, aborted = false;
    for (i = 0; i <= m; i++) cnt[i] = 0;
    for (i = 0; i < m; i++) { var arr = new Array(m + 1); for (var z = 0; z <= m; z++) arr[z] = 0; cellCnt.push(arr); }
    function put(v, x) {
      var ok = true;
      for (var a = 0; a < of[v].length; a++) { var k = cs[of[v][a]]; k.free--; k.rem -= x; if (k.rem < 0 || k.rem > k.free) ok = false; }
      return ok;
    }
    function undo(v, x) { for (var a = 0; a < of[v].length; a++) { var k = cs[of[v][a]]; k.free++; k.rem += x; } }
    function rec(pos) {
      if (pos === m) {
        sol++; cnt[mines]++;
        for (var a = 0; a < m; a++) if (val[a] === 1) cellCnt[a][mines]++;
        return;
      }
      var v2 = order[pos];
      for (var x = 0; x <= 1; x++) {
        if (++used > limit) { aborted = true; return; }
        val[v2] = x; mines += x;
        if (put(v2, x)) rec(pos + 1);
        undo(v2, x); mines -= x; val[v2] = 0;
        if (aborted) return;
      }
    }
    rec(0);
    budget.nodes -= used;
    if (aborted) return null;
    return { vars: vars, cons: cons, cnt: cnt, cellCnt: cellCnt, sol: sol };
  }

  function binomials(I, cap) {
    var out = [1], t;
    for (t = 0; t < Math.min(I, cap); t++) out.push(out[t] * (I - t) / (t + 1));
    return out;
  }

  /** Modelo da borda: grupos enumerados, casas do interior e minas que faltam. K e S são as casas já provadas. */
  function frontierModel(view, K, S, kCount, cons) {
    var n = view.w * view.h, cells = view.cells, i;
    var parent = {};
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    cons.forEach(function (k) {
      k.U.forEach(function (c) { if (parent[c] === undefined) parent[c] = c; });
      for (var a = 1; a < k.U.length; a++) { var r1 = find(k.U[0]), r2 = find(k.U[a]); if (r1 !== r2) parent[r2] = r1; }
    });
    var groups = {};
    Object.keys(parent).forEach(function (key) { var c = Number(key), r = find(c); (groups[r] = groups[r] || { vars: [], cons: [] }).vars.push(c); });
    cons.forEach(function (k) { groups[find(k.U[0])].cons.push(k); });
    var list = Object.keys(groups).map(function (k) { groups[k].vars.sort(function (a, b) { return a - b; }); return groups[k]; });
    list.sort(function (a, b) { return a.vars.length - b.vars.length || a.vars[0] - b.vars[0]; });
    var budget = { nodes: ENUM_NODES }, complete = true;
    var comps = list.map(function (gp) {
      var e = enumerateGroup(gp.vars, gp.cons, budget);
      if (!e) { complete = false; return { vars: gp.vars, cons: gp.cons, skipped: true }; }
      return e;
    });
    var interior = [];
    for (i = 0; i < n; i++) if (cells[i] < 0 && !K[i] && !S[i] && parent[i] === undefined) interior.push(i);
    return { comps: comps, complete: complete, interior: interior, R: view.total - kCount };
  }

  /** Casas decididas em todas as formas. withTotal usa também o total de minas (só vale com todos os grupos completos). */
  function determine(model, withTotal) {
    var out = [], R = model.R, I = model.interior.length;
    if (!withTotal) {
      model.comps.forEach(function (e) {
        if (e.skipped) return;
        var safe = [], mine = [];
        e.vars.forEach(function (c, a) {
          var tot = 0, m = 0, b;
          for (b = 0; b < e.cnt.length; b++) { tot += e.cnt[b]; m += e.cellCnt[a][b]; }
          if (!tot) return;
          if (m === 0) safe.push(c); else if (m === tot) mine.push(c);
        });
        if (safe.length || mine.length) out.push({ comp: e, safe: safe, mine: mine });
      });
      return out;
    }
    if (!model.complete || R < 0) return out;
    var feas = model.comps.map(function (e) { return positive(e.cnt); });
    var ones = binomials(I, R).map(function () { return 1; });
    model.comps.forEach(function (e, j) {
      var rest = ones;
      feas.forEach(function (f, k) { if (k !== j) rest = convolve(rest, f, R); });
      var safe = [], mine = [];
      e.vars.forEach(function (c, a) {
        var canMine = false, canSafe = false;
        for (var m = 0; m < e.cnt.length && m <= R; m++) {
          if (!rest[R - m]) continue;
          if (e.cellCnt[a][m] > 0) canMine = true;
          if (e.cnt[m] - e.cellCnt[a][m] > 0) canSafe = true;
        }
        if (canMine && !canSafe) mine.push(c); else if (canSafe && !canMine) safe.push(c);
      });
      if (safe.length || mine.length) out.push({ comp: e, safe: safe, mine: mine, total: true });
    });
    if (I > 0) {
      var all = [1];
      feas.forEach(function (f) { all = convolve(all, f, R); });
      var ts = [];
      for (var t = 0; t <= Math.min(I, R); t++) if (all[R - t]) ts.push(t);
      if (ts.length === 1 && ts[0] === 0) out.push({ comp: null, safe: model.interior.slice(), mine: [], total: true });
      else if (ts.length === 1 && ts[0] === I) out.push({ comp: null, safe: [], mine: model.interior.slice(), total: true });
    }
    return out;
  }

  /** Probabilidade de mina de cada casa fechada (Float64Array, NaN nas abertas), ou null se o modelo for incompleto. */
  function riskOf(model, cells, K) {
    var R = model.R, I = model.interior.length, n = cells.length;
    if (!model.complete || R < 0) return null;
    var iw = binomials(I, R), j;
    function others(skip) {
      var rest = iw;
      model.comps.forEach(function (e, k) { if (k !== skip) rest = convolve(rest, e.cnt, R); });
      return rest;
    }
    var p = new Float64Array(n).fill(NaN), W = 0;
    var rest0 = others(-1);
    W = rest0[R] || 0;
    if (!(W > 0) || !isFinite(W)) return null;
    for (j = 0; j < n; j++) if (K[j]) p[j] = 1;
    model.comps.forEach(function (e, jj) {
      var rest = others(jj);
      e.vars.forEach(function (c, a) {
        var s = 0;
        for (var m = 0; m < e.cnt.length && m <= R; m++) if (e.cellCnt[a][m] > 0) s += e.cellCnt[a][m] * (rest[R - m] || 0);
        p[c] = s / W;
      });
    });
    if (I > 0) {
      // esperança de minas no interior, dividida por I
      var allf = [1];
      model.comps.forEach(function (e) { allf = convolve(allf, e.cnt, R); });
      var s2 = 0;
      for (var f = 0; f <= R; f++) if (allf[f] && R - f <= I) s2 += allf[f] * iw[R - f] * (R - f);
      var pi = s2 / W / I;
      model.interior.forEach(function (c) { p[c] = pi; });
    }
    for (j = 0; j < n; j++) if (!isFinite(p[j]) && cells[j] < 0) return null;
    return p;
  }

  function rawModel(view) {
    var n = view.w * view.h, K = new Uint8Array(n), S = new Uint8Array(n), nb = neighborsOf(view.w, view.h), cons = [], i;
    for (i = 0; i < n; i++) {
      if (view.cells[i] < 0) continue;
      var U = nb[i].filter(function (c) { return view.cells[c] < 0; });
      if (U.length) cons.push({ c: i, U: U, need: view.cells[i] });
    }
    return { K: K, S: S, cons: cons, model: frontierModel(view, K, S, 0, cons), nb: nb };
  }
  /** Para os testes: probabilidade exata de mina pela enumeração, ou null. */
  function probabilities(view) {
    var r = rawModel(view);
    return riskOf(r.model, view.cells, r.K);
  }

  /**
   * A dica do Hug para o que o jogador vê. flags (opcional, Uint8Array de 0 e 1): bandeiras do jogador; servem só para
   * não repetir o que ele já marcou, nunca entram na lógica.
   * Resultado: { kind: 'start' | 'done' | 'deduction' | 'guess' | 'unknown', ... }.
   * deduction: { tier, rule, safe[], mine[], sources[], info }. Toda casa em safe/mine é provada em todas as formas possíveis.
   */
  function hint(view, flags) {
    var w = view.w, h = view.h, n = w * h, cells = view.cells, nb = neighborsOf(w, h), i;
    var closed = 0, opened = 0;
    for (i = 0; i < n; i++) { if (cells[i] < 0) closed++; else opened++; }
    if (!closed) return { kind: 'done' };
    if (!opened) return { kind: 'start' };
    var K = new Uint8Array(n), S = new Uint8Array(n), kCount = 0;
    var isFlag = function (c) { return !!(flags && flags[c]); };

    function build() {
      var cons = [];
      for (var c = 0; c < n; c++) {
        if (cells[c] < 0) continue;
        var U = [], k = 0;
        for (var a = 0; a < nb[c].length; a++) { var d = nb[c][a]; if (cells[d] >= 0) continue; if (K[d]) k++; else if (!S[d]) U.push(d); }
        if (U.length) cons.push({ c: c, U: U, need: cells[c] - k, known: k, shown: cells[c] });
      }
      return cons;
    }
    function useful(step) {
      var mine = step.mine.filter(function (c) { return !isFlag(c); });
      return { safe: step.safe, mine: mine };
    }
    function mark(step) {
      step.safe.forEach(function (c) { if (!S[c]) S[c] = 1; });
      step.mine.forEach(function (c) { if (!K[c]) { K[c] = 1; kCount++; } });
    }
    /** Devolve o passo pronto se trouxe algo útil ao jogador; senão só registra o que foi provado (e o jogador já marcou). */
    function finish(step) {
      var u = useful(step);
      mark(step);
      if (!u.safe.length && !u.mine.length) return null;
      step.kind = 'deduction'; step.safe = u.safe; step.mine = u.mine;
      step.wrongFlags = u.safe.filter(isFlag);
      return step;
    }
    function tier1(cons) {
      for (var a = 0; a < cons.length; a++) {
        var k = cons[a];
        if (k.need === 0) return { tier: 1, rule: 'full', safe: k.U.slice(), mine: [], sources: [k.c], info: { number: k.shown, at: k.c, known: k.known, need: 0, count: k.U.length } };
        if (k.need === k.U.length) return { tier: 1, rule: 'all', safe: [], mine: k.U.slice(), sources: [k.c], info: { number: k.shown, at: k.c, known: k.known, need: k.need, count: k.U.length } };
      }
      return null;
    }
    function tier2(cons) {
      var byCell = {}, a, b, x;
      cons.forEach(function (k, ci) { k.U.forEach(function (c) { (byCell[c] = byCell[c] || []).push(ci); }); });
      for (a = 0; a < cons.length; a++) {
        var A = cons[a], cand = byCell[A.U[0]];
        for (b = 0; b < cand.length; b++) {
          var B = cons[cand[b]];
          if (B === A || B.U.length <= A.U.length) continue;
          var inB = {}; B.U.forEach(function (c) { inB[c] = 1; });
          var sub = true; for (x = 0; x < A.U.length; x++) if (!inB[A.U[x]]) { sub = false; break; }
          if (!sub) continue;
          var inA = {}; A.U.forEach(function (c) { inA[c] = 1; });
          var D = B.U.filter(function (c) { return !inA[c]; });
          var needD = B.need - A.need;
          var info = { small: { number: A.shown, at: A.c, need: A.need, cells: A.U.slice() }, big: { number: B.shown, at: B.c, need: B.need, cells: B.U.slice() }, rest: D.slice(), needRest: needD };
          if (needD === 0) return { tier: 2, rule: 'subset', safe: D, mine: [], sources: [A.c, B.c], info: info };
          if (needD === D.length) return { tier: 2, rule: 'subset', safe: [], mine: D, sources: [A.c, B.c], info: info };
        }
      }
      return null;
    }
    function sourcesFor(cons, cellsList) {
      var set = {}; cellsList.forEach(function (c) { set[c] = 1; });
      return cons.filter(function (k) { return k.U.some(function (c) { return set[c]; }); }).map(function (k) { return k.c; });
    }
    function stepsOf(found, model, cons) {
      return found.map(function (d) {
        var cl = d.safe.concat(d.mine);
        return {
          tier: 3, rule: d.total ? 'enumTotal' : 'enum', safe: d.safe.slice(), mine: d.mine.slice(),
          sources: d.comp ? sourcesFor(d.comp.cons, cl) : [],
          info: { solutions: d.comp ? d.comp.sol : 0, size: d.comp ? d.comp.vars.length : model.interior.length, remaining: model.R, interior: !d.comp }
        };
      });
    }

    for (;;) {
      var cons = build();
      var step = tier1(cons) || tier2(cons);
      if (step) { var out = finish(step); if (out) return out; continue; }
      var inconsistent = cons.some(function (k) { return k.need < 0 || k.need > k.U.length; });
      if (inconsistent) return { kind: 'unknown' };
      var model = frontierModel(view, K, S, kCount, cons);
      var found = determine(model, false);
      if (!found.length) found = determine(model, true);
      if (found.length) {
        var progressed = false, steps = stepsOf(found, model, cons);
        for (var s = 0; s < steps.length; s++) {
          var o = finish(steps[s]);
          if (o) return o;
          progressed = true;
        }
        if (progressed) continue;
      }
      var p = riskOf(model, cells, K);
      if (!p) return { kind: 'unknown' };
      var best = -1;
      for (i = 0; i < n; i++) if (cells[i] < 0 && !K[i] && (best < 0 || p[i] < p[best] - 1e-12)) best = i;
      if (best < 0) return { kind: 'unknown' };
      return { kind: 'guess', cell: best, risk: p[best], sources: [] };
    }
  }

  /* ---------- textos (pt, en, es, fr) ---------- */
  var TEXT = {
    pt: {
      levels: { beginner: 'Iniciante 9×9 · 10 minas', intermediate: 'Intermediário 16×16 · 40 minas', advanced: 'Avançado 30×16 · 99 minas' },
      level: 'Nível', mines: 'Minas', time: 'Tempo', newGame: 'Novo jogo', replay: 'Repetir este tabuleiro', flagMode: 'Modo bandeira', hint: 'Dica do Hug', seed: 'Seed (semente)', seedGo: 'Jogar com esta seed', seedCopy: 'Copiar seed', seedCopied: 'Seed copiada', seedBad: 'Digite uma seed: um número ou um texto de até 64 caracteres.', copy: 'Copiar link', copied: 'Link copiado',
      boardLabel: 'Tabuleiro do Campo Minado. Setas movem, Espaço abre, F marca uma bandeira.', row: 'linha', col: 'coluna', refRow: 'L', refCol: 'C',
      closed: 'fechada', flag: 'bandeira', empty: 'vazia', mine: 'mina', wrongFlag: 'bandeira errada', near: function (n) { return n + (n === 1 ? ' mina em volta' : ' minas em volta'); },
      ready: 'Abra uma casa para começar. O primeiro clique é sempre seguro.', playing: 'Jogo em andamento.', won: function (t) { return 'Você venceu em ' + t + ' s!'; }, lost: 'Era uma mina. O tabuleiro foi aberto: tente de novo.',
      hugName: 'Hug, o professor', hugHello: 'Oi, eu sou o Hug. Quando quiser, aperte "Dica do Hug" e eu mostro uma jogada que a lógica prova, com o porquê.', hugWon: 'Que jogada! Todas as casas seguras foram abertas.', hugLost: 'Acontece com todo mundo. Que tal repetir este tabuleiro e tentar um caminho diferente?', hugLostHint: 'O jogo acabou. Comece um novo ou repita este tabuleiro.',
      rulesTitle: 'Como jogar (com o Hug)',
      rules: ['Toque ou clique para abrir uma casa. O número diz quantas minas existem nas 8 casas em volta dela.', 'Clique direito, toque longo ou o botão "Modo bandeira" marcam uma casa que você acha que tem mina.', 'Abra todas as casas sem mina para vencer. Abrir uma mina termina o jogo.', 'O primeiro clique e as casas em volta dele nunca têm mina.', 'Teclado: setas movem, Espaço abre, F marca. Em um número com as bandeiras certas, Espaço abre as casas que sobram.', 'A "Dica do Hug" só mostra o que a lógica prova. Se nada é certo, ele diz que é palpite.'],
      note: 'L3C4 = linha 3, coluna 4.',
      tSafe: 'Casa segura', tMine: 'Mina certa', tBoth: 'Duas certezas', tNone: 'Nada é certo agora', tGuess: 'Palpite', tStart: 'Comece aqui', tDone: 'Fim de jogo',
      start: 'Ainda não há números. Abra qualquer casa: o primeiro clique nunca é mina, nem as casas em volta dele, então ele sempre abre uma região.',
      full: 'O {n} em {x} já tem todas as minas dele marcadas. As outras casas fechadas em volta dele são seguras: {cells}.',
      allZero: 'O {n} em {x} tem exatamente {cc} em volta e precisa de {needM}. Então todas elas são minas: {cells}.',
      allSome: 'O {n} em {x} ainda precisa de {needM}, além das que já estão marcadas, e resta exatamente {ccNeed} em volta dele. Então todas são minas: {cells}.',
      subSafe: 'Compare dois números. O {na} em {xa} ainda precisa de {aM} entre {ua}. O {nb} em {xb} precisa da mesma quantidade entre {ub}, que incluem todas as casas do primeiro. Então não sobra mina para as outras casas do {nb}: {cells} são seguras.',
      subMine: 'Compare dois números. O {na} em {xa} ainda precisa de {aM} entre {ua}. O {nb} em {xb} ainda precisa de {bM} entre {ub}, que incluem todas as casas do primeiro. Tirando as do primeiro, sobram {dM} para {cells}, e há exatamente {dc} ali. Então todas são minas.',
      enum: 'Nenhuma regra simples resolve esta parte, então eu conferi todas as {N} formas de colocar as minas nas {size} casas desse grupo da borda que combinam com os números.',
      enumTotal: 'Nenhuma regra simples resolve, então eu conferi todas as formas de colocar as minas que combinam com os números e com o total do jogo: ainda há {RM} escondidas.',
      enumSafe: 'Sem mina em todas as formas: {cells}.', enumMine: 'Mina em todas as formas: {cells}.',
      wrongFlagNote: 'A bandeira em {cells} está errada: essa casa é segura.',
      guess: 'Não consigo provar nenhuma casa agora. Contando todas as formas possíveis, a mais segura é {x}, com cerca de {p}% de chance de mina. Isso é um palpite, não uma certeza.',
      unknown: 'Não consigo provar nenhuma casa agora, e a borda é grande demais para eu contar todas as formas. Qualquer jogada aqui é um palpite.',
      many: '{c} casas em destaque', and: ' e ', mineWord: ['mina', 'minas'], cc: function (k) { return k + (k === 1 ? ' casa fechada' : ' casas fechadas'); }, noscript: 'Este jogo precisa de JavaScript. Ative-o para jogar.'
    },
    en: {
      levels: { beginner: 'Beginner 9×9 · 10 mines', intermediate: 'Intermediate 16×16 · 40 mines', advanced: 'Advanced 30×16 · 99 mines' },
      level: 'Level', mines: 'Mines', time: 'Time', newGame: 'New game', replay: 'Replay this board', flagMode: 'Flag mode', hint: 'Hug’s hint', seed: 'Seed', seedGo: 'Play this seed', seedCopy: 'Copy seed', seedCopied: 'Seed copied', seedBad: 'Type a seed: a number or text of up to 64 characters.', copy: 'Copy link', copied: 'Link copied',
      boardLabel: 'Minesweeper board. Arrow keys move, Space opens, F places a flag.', row: 'row', col: 'column', refRow: 'R', refCol: 'C',
      closed: 'closed', flag: 'flag', empty: 'empty', mine: 'mine', wrongFlag: 'wrong flag', near: function (n) { return n + (n === 1 ? ' mine nearby' : ' mines nearby'); },
      ready: 'Open a cell to start. The first click is always safe.', playing: 'Game in progress.', won: function (t) { return 'You won in ' + t + ' s!'; }, lost: 'That was a mine. The board is open: try again.',
      hugName: 'Hug, the teacher', hugHello: 'Hi, I am Hug. Whenever you like, press “Hug’s hint” and I will show you a move that logic proves, and why.', hugWon: 'Well played! Every safe cell is open.', hugLost: 'It happens to everyone. Why not replay this board and try a different path?', hugLostHint: 'The game is over. Start a new one or replay this board.',
      rulesTitle: 'How to play (with Hug)',
      rules: ['Tap or click to open a cell. The number tells you how many mines are in the 8 cells around it.', 'Right click, a long press or the “Flag mode” button marks a cell you think holds a mine.', 'Open every cell without a mine to win. Opening a mine ends the game.', 'The first click and the cells around it never hold a mine.', 'Keyboard: arrows move, Space opens, F flags. On a number with the right flags, Space opens the remaining cells.', 'Hug’s hint only shows what logic proves. If nothing is certain, he says it is a guess.'],
      note: 'R3C4 = row 3, column 4.',
      tSafe: 'Safe cell', tMine: 'Sure mine', tBoth: 'Two certainties', tNone: 'Nothing is certain now', tGuess: 'A guess', tStart: 'Start here', tDone: 'Game over',
      start: 'There are no numbers yet. Open any cell: the first click is never a mine, nor are the cells around it, so it always opens up an area.',
      full: 'The {n} at {x} already has all of its mines marked. The other closed cells around it are safe: {cells}.',
      allZero: 'The {n} at {x} has exactly {cc} around it and needs {needM}. So all of them are mines: {cells}.',
      allSome: 'The {n} at {x} still needs {needM}, besides the ones already marked, and there are exactly {ccNeed} left around it. So all of them are mines: {cells}.',
      subSafe: 'Compare two numbers. The {na} at {xa} still needs {aM} among {ua}. The {nb} at {xb} needs the same amount among {ub}, which include every cell of the first one. So no mine is left for the other cells of the {nb}: {cells} are safe.',
      subMine: 'Compare two numbers. The {na} at {xa} still needs {aM} among {ua}. The {nb} at {xb} still needs {bM} among {ub}, which include every cell of the first one. Taking out the first one’s share leaves {dM} for {cells}, and there are exactly {dc} there. So all of them are mines.',
      enum: 'No simple rule solves this part, so I checked all {N} ways to place the mines in the {size} cells of this border group that agree with the numbers.',
      enumTotal: 'No simple rule solves this, so I checked every way to place the mines that agrees with the numbers and with the game’s total: {RM} still hidden.',
      enumSafe: 'No mine in any of them: {cells}.', enumMine: 'A mine in every one of them: {cells}.',
      wrongFlagNote: 'The flag on {cells} is wrong: that cell is safe.',
      guess: 'I cannot prove any cell right now. Counting every possible way, the safest one is {x}, with about a {p}% chance of a mine. This is a guess, not a certainty.',
      unknown: 'I cannot prove any cell right now, and the border is too big for me to count every way. Any move here is a guess.',
      many: '{c} cells highlighted', and: ' and ', mineWord: ['mine', 'mines'], cc: function (k) { return k + (k === 1 ? ' closed cell' : ' closed cells'); }, noscript: 'This game needs JavaScript. Turn it on to play.'
    },
    es: {
      levels: { beginner: 'Principiante 9×9 · 10 minas', intermediate: 'Intermedio 16×16 · 40 minas', advanced: 'Avanzado 30×16 · 99 minas' },
      level: 'Nivel', mines: 'Minas', time: 'Tiempo', newGame: 'Juego nuevo', replay: 'Repetir este tablero', flagMode: 'Modo bandera', hint: 'Pista de Hug', seed: 'Semilla (seed)', seedGo: 'Jugar con esta semilla', seedCopy: 'Copiar semilla', seedCopied: 'Semilla copiada', seedBad: 'Escribe una semilla: un número o un texto de hasta 64 caracteres.', copy: 'Copiar enlace', copied: 'Enlace copiado',
      boardLabel: 'Tablero del Buscaminas. Las flechas mueven, Espacio abre, F pone una bandera.', row: 'fila', col: 'columna', refRow: 'F', refCol: 'C',
      closed: 'cerrada', flag: 'bandera', empty: 'vacía', mine: 'mina', wrongFlag: 'bandera equivocada', near: function (n) { return n + (n === 1 ? ' mina alrededor' : ' minas alrededor'); },
      ready: 'Abre una casilla para empezar. El primer clic siempre es seguro.', playing: 'Partida en curso.', won: function (t) { return '¡Ganaste en ' + t + ' s!'; }, lost: 'Era una mina. El tablero quedó abierto: inténtalo de nuevo.',
      hugName: 'Hug, el profesor', hugHello: 'Hola, soy Hug. Cuando quieras, pulsa “Pista de Hug” y te muestro una jugada que la lógica demuestra, con su porqué.', hugWon: '¡Buena partida! Todas las casillas seguras están abiertas.', hugLost: 'Le pasa a todo el mundo. ¿Y si repites este tablero por otro camino?', hugLostHint: 'La partida terminó. Empieza una nueva o repite este tablero.',
      rulesTitle: 'Cómo jugar (con Hug)',
      rules: ['Toca o haz clic para abrir una casilla. El número dice cuántas minas hay en las 8 casillas de alrededor.', 'Clic derecho, toque largo o el botón “Modo bandera” marcan una casilla donde crees que hay mina.', 'Abre todas las casillas sin mina para ganar. Abrir una mina termina la partida.', 'El primer clic y las casillas de alrededor nunca tienen mina.', 'Teclado: las flechas mueven, Espacio abre, F marca. En un número con las banderas correctas, Espacio abre las casillas restantes.', 'La pista de Hug solo muestra lo que la lógica demuestra. Si nada es seguro, dice que es una apuesta.'],
      note: 'F3C4 = fila 3, columna 4.',
      tSafe: 'Casilla segura', tMine: 'Mina segura', tBoth: 'Dos certezas', tNone: 'Ahora nada es seguro', tGuess: 'Una apuesta', tStart: 'Empieza aquí', tDone: 'Fin de la partida',
      start: 'Todavía no hay números. Abre cualquier casilla: el primer clic nunca es mina, ni las casillas de alrededor, así que siempre abre una zona.',
      full: 'El {n} en {x} ya tiene todas sus minas marcadas. Las otras casillas cerradas a su alrededor son seguras: {cells}.',
      allZero: 'El {n} en {x} tiene exactamente {cc} alrededor y necesita {needM}. Entonces todas son minas: {cells}.',
      allSome: 'El {n} en {x} todavía necesita {needM}, además de las ya marcadas, y queda exactamente {ccNeed} a su alrededor. Entonces todas son minas: {cells}.',
      subSafe: 'Compara dos números. El {na} en {xa} todavía necesita {aM} entre {ua}. El {nb} en {xb} necesita la misma cantidad entre {ub}, que incluyen todas las casillas del primero. Así que no queda mina para las otras casillas del {nb}: {cells} son seguras.',
      subMine: 'Compara dos números. El {na} en {xa} todavía necesita {aM} entre {ua}. El {nb} en {xb} todavía necesita {bM} entre {ub}, que incluyen todas las casillas del primero. Quitando las del primero, quedan {dM} para {cells}, y ahí hay exactamente {dc}. Entonces todas son minas.',
      enum: 'Ninguna regla simple resuelve esta parte, así que revisé las {N} formas de poner las minas en las {size} casillas de este grupo del borde que concuerdan con los números.',
      enumTotal: 'Ninguna regla simple lo resuelve, así que revisé todas las formas de poner las minas que concuerdan con los números y con el total del juego: aún quedan {RM} ocultas.',
      enumSafe: 'Sin mina en todas las formas: {cells}.', enumMine: 'Mina en todas las formas: {cells}.',
      wrongFlagNote: 'La bandera en {cells} está mal: esa casilla es segura.',
      guess: 'Ahora no puedo demostrar ninguna casilla. Contando todas las formas posibles, la más segura es {x}, con un {p}% de probabilidad de mina. Es una apuesta, no una certeza.',
      unknown: 'Ahora no puedo demostrar ninguna casilla, y el borde es demasiado grande para contar todas las formas. Cualquier jugada aquí es una apuesta.',
      many: '{c} casillas resaltadas', and: ' y ', mineWord: ['mina', 'minas'], cc: function (k) { return k + (k === 1 ? ' casilla cerrada' : ' casillas cerradas'); }, noscript: 'Este juego necesita JavaScript. Actívalo para jugar.'
    },
    fr: {
      levels: { beginner: 'Débutant 9×9 · 10 mines', intermediate: 'Intermédiaire 16×16 · 40 mines', advanced: 'Avancé 30×16 · 99 mines' },
      level: 'Niveau', mines: 'Mines', time: 'Temps', newGame: 'Nouvelle partie', replay: 'Rejouer cette grille', flagMode: 'Mode drapeau', hint: 'Indice de Hug', seed: 'Graine (seed)', seedGo: 'Jouer cette graine', seedCopy: 'Copier la graine', seedCopied: 'Graine copiée', seedBad: 'Saisissez une graine : un nombre ou un texte de 64 caractères au maximum.', copy: 'Copier le lien', copied: 'Lien copié',
      boardLabel: 'Grille du Démineur. Les flèches déplacent, Espace ouvre, F pose un drapeau.', row: 'ligne', col: 'colonne', refRow: 'L', refCol: 'C',
      closed: 'fermée', flag: 'drapeau', empty: 'vide', mine: 'mine', wrongFlag: 'drapeau erroné', near: function (n) { return n + (n === 1 ? ' mine autour' : ' mines autour'); },
      ready: 'Ouvrez une case pour commencer. Le premier clic est toujours sûr.', playing: 'Partie en cours.', won: function (t) { return 'Gagné en ' + t + ' s !'; }, lost: 'C’était une mine. La grille est ouverte : réessayez.',
      hugName: 'Hug, le professeur', hugHello: 'Salut, je suis Hug. Quand vous voulez, appuyez sur « Indice de Hug » et je vous montre un coup que la logique démontre, avec le pourquoi.', hugWon: 'Bien joué ! Toutes les cases sûres sont ouvertes.', hugLost: 'Ça arrive à tout le monde. Et si vous rejouiez cette grille par un autre chemin ?', hugLostHint: 'La partie est finie. Lancez-en une nouvelle ou rejouez cette grille.',
      rulesTitle: 'Comment jouer (avec Hug)',
      rules: ['Touchez ou cliquez pour ouvrir une case. Le chiffre indique combien de mines se trouvent dans les 8 cases autour.', 'Clic droit, appui long ou le bouton « Mode drapeau » marquent une case où vous pensez qu’il y a une mine.', 'Ouvrez toutes les cases sans mine pour gagner. Ouvrir une mine termine la partie.', 'Le premier clic et les cases autour n’ont jamais de mine.', 'Clavier : les flèches déplacent, Espace ouvre, F pose un drapeau. Sur un chiffre bien entouré de drapeaux, Espace ouvre les cases restantes.', 'L’indice de Hug montre seulement ce que la logique démontre. Si rien n’est certain, il dit que c’est un pari.'],
      note: 'L3C4 = ligne 3, colonne 4.',
      tSafe: 'Case sûre', tMine: 'Mine certaine', tBoth: 'Deux certitudes', tNone: 'Rien n’est certain', tGuess: 'Un pari', tStart: 'Commencez ici', tDone: 'Partie finie',
      start: 'Il n’y a pas encore de chiffres. Ouvrez n’importe quelle case : le premier clic n’est jamais une mine, ni les cases autour, donc il ouvre toujours une zone.',
      full: 'Le {n} en {x} a déjà toutes ses mines marquées. Les autres cases fermées autour sont sûres : {cells}.',
      allZero: 'Le {n} en {x} a exactement {cc} autour et il lui faut {needM}. Donc toutes sont des mines : {cells}.',
      allSome: 'Le {n} en {x} a encore besoin de {needM}, en plus de celles déjà marquées, et il reste exactement {ccNeed} autour. Donc toutes sont des mines : {cells}.',
      subSafe: 'Comparez deux chiffres. Le {na} en {xa} a encore besoin de {aM} parmi {ua}. Le {nb} en {xb} a besoin de la même quantité parmi {ub}, qui contiennent toutes les cases du premier. Il ne reste donc aucune mine pour les autres cases du {nb} : {cells} sont sûres.',
      subMine: 'Comparez deux chiffres. Le {na} en {xa} a encore besoin de {aM} parmi {ua}. Le {nb} en {xb} a encore besoin de {bM} parmi {ub}, qui contiennent toutes les cases du premier. En retirant la part du premier, il reste {dM} pour {cells}, et il y a exactement {dc}. Donc toutes sont des mines.',
      enum: 'Aucune règle simple ne résout cette partie, alors j’ai vérifié les {N} façons de placer les mines dans les {size} cases de ce groupe du bord qui respectent les chiffres.',
      enumTotal: 'Aucune règle simple ne le résout, alors j’ai vérifié toutes les façons de placer les mines qui respectent les chiffres et le total de la partie : {RM} encore cachées.',
      enumSafe: 'Sans mine dans toutes les façons : {cells}.', enumMine: 'Mine dans toutes les façons : {cells}.',
      wrongFlagNote: 'Le drapeau en {cells} est faux : cette case est sûre.',
      guess: 'Je ne peux prouver aucune case pour l’instant. En comptant toutes les façons possibles, la plus sûre est {x}, avec environ {p} % de risque de mine. C’est un pari, pas une certitude.',
      unknown: 'Je ne peux prouver aucune case pour l’instant, et le bord est trop grand pour que je compte toutes les façons. Tout coup ici est un pari.',
      many: '{c} cases en surbrillance', and: ' et ', mineWord: ['mine', 'mines'], cc: function (k) { return k + (k === 1 ? ' case fermée' : ' cases fermées'); }, noscript: 'Ce jeu a besoin de JavaScript. Activez-le pour jouer.'
    }
  };

  function fmt(s, vars) { return s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] === undefined ? '' : vars[k]; }); }

  /** Texto da dica do Hug: { title, paragraphs[] }. ctx: { lang, w }. */
  function describe(step, lang, w) {
    var T = TEXT[lang] || TEXT.pt;
    function ref(i) { return T.refRow + (Math.floor(i / w) + 1) + T.refCol + ((i % w) + 1); }
    function list(cells) {
      if (cells.length > 6) return fmt(T.many, { c: cells.length });
      var r = cells.map(ref);
      return r.length < 2 ? r.join('') : r.slice(0, -1).join(', ') + T.and + r[r.length - 1];
    }
    function mm(k) { return k + ' ' + T.mineWord[k === 1 ? 0 : 1]; }
    var out = { title: '', paragraphs: [], note: T.note };
    if (step.kind === 'start') { out.title = T.tStart; out.paragraphs.push(T.start); out.note = ''; return out; }
    if (step.kind === 'done') { out.title = T.tDone; out.paragraphs.push(T.hugLostHint); out.note = ''; return out; }
    if (step.kind === 'unknown') { out.title = T.tNone; out.paragraphs.push(T.unknown); out.note = ''; return out; }
    if (step.kind === 'guess') { out.title = T.tGuess; out.paragraphs.push(fmt(T.guess, { x: ref(step.cell), p: Math.max(1, Math.round(step.risk * 100)) })); out.note = T.note; return out; }
    var both = step.safe.length && step.mine.length;
    out.title = both ? T.tBoth : step.safe.length ? T.tSafe : T.tMine;
    var cells = list(step.safe.length ? step.safe : step.mine), i = step.info;
    if (step.rule === 'full') out.paragraphs.push(fmt(T.full, { n: i.number, x: ref(i.at), cells: cells }));
    else if (step.rule === 'all') out.paragraphs.push(fmt(i.known ? T.allSome : T.allZero, { n: i.number, x: ref(i.at), need: i.need, needM: mm(i.need), cc: T.cc(i.count), ccNeed: T.cc(i.need), cells: cells }));
    else if (step.rule === 'subset') {
      var a = i.small, b = i.big;
      var vars = { na: a.number, xa: ref(a.at), aM: mm(a.need), ua: list(a.cells), nb: b.number, xb: ref(b.at), bM: mm(b.need), ub: list(b.cells), cells: list(i.rest), d: i.rest.length, dc: T.cc(i.rest.length), dM: mm(i.needRest) };
      out.paragraphs.push(fmt(step.safe.length ? T.subSafe : T.subMine, vars));
    } else {
      out.paragraphs.push(fmt(step.rule === 'enumTotal' ? T.enumTotal : T.enum, { N: i.solutions, size: i.size, RM: mm(i.remaining) }));
      if (step.safe.length) out.paragraphs.push(fmt(T.enumSafe, { cells: list(step.safe) }));
      if (step.mine.length) out.paragraphs.push(fmt(T.enumMine, { cells: list(step.mine) }));
    }
    if (step.wrongFlags && step.wrongFlags.length) out.paragraphs.push(fmt(T.wrongFlagNote, { cells: list(step.wrongFlags) }));
    return out;
  }

  /* ---------- interface ---------- */
  var FLAG_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M4.6 2.4l8 3.2-8 3.2z" fill="#D8362B"/></svg>';
  var MINE_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2"/></g><circle cx="8" cy="8" r="4.2" fill="currentColor"/><circle cx="6.6" cy="6.6" r="1.1" fill="#fff"/></svg>';

  function pageLang() {
    var l = (document.documentElement.lang || 'pt').slice(0, 2).toLowerCase();
    return TEXT[l] ? l : 'pt';
  }
  function randomSeed() {
    try { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; } catch (e) { return Math.floor(Math.random() * 4294967296) >>> 0; }
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  function mount(host) {
    var lang = pageLang(), T = TEXT[lang];
    var params = new URLSearchParams(location.search);
    var levelKey = LEVELS[params.get('level')] ? params.get('level') : 'beginner';
    var seed = parseSeed(params.get('seed'));
    if (seed === null) seed = randomSeed();
    var game, cellsEl = [], sig = [], highlights = {}, focus = 0, flagMode = false, startedAt = 0, tick = null, elapsed = 0, hintStep = null;

    host.textContent = '';
    host.classList.add('cm-ready');
    var bar = el('div', 'cm-bar');
    var levelLabel = el('label', 'cm-field'); levelLabel.appendChild(el('span', '', T.level));
    var select = el('select'); Object.keys(LEVELS).forEach(function (k) { var o = el('option', '', T.levels[k]); o.value = k; select.appendChild(o); });
    levelLabel.appendChild(select);
    var minesBox = el('div', 'cm-lcd'); var minesVal = el('output', 'cm-lcd-val'); minesBox.appendChild(el('span', 'cm-lcd-lab', T.mines)); minesBox.appendChild(minesVal);
    var timeBox = el('div', 'cm-lcd'); var timeVal = el('output', 'cm-lcd-val'); timeBox.appendChild(el('span', 'cm-lcd-lab', T.time)); timeBox.appendChild(timeVal);
    var newBtn = el('button', 'cm-btn', T.newGame); newBtn.type = 'button';
    var flagBtn = el('button', 'cm-btn cm-toggle', T.flagMode); flagBtn.type = 'button'; flagBtn.setAttribute('aria-pressed', 'false');
    var hintBtn = el('button', 'cm-btn cm-hint', T.hint); hintBtn.type = 'button';
    [levelLabel, minesBox, timeBox, newBtn, flagBtn].forEach(function (x) { bar.appendChild(x); });

    var hug = el('div', 'cm-hug');
    var avatarBtn = el('button', 'cm-hug-face'); avatarBtn.type = 'button'; avatarBtn.title = T.hint; avatarBtn.setAttribute('aria-label', T.hint);
    var avatar = el('img', 'cm-hug-img'); avatar.src = '/assets/blog/hosts/hug-avatar.webp'; avatar.alt = T.hugName; avatar.width = 96; avatar.height = 96; avatar.decoding = 'async';
    var bubble = el('div', 'cm-bubble'); bubble.setAttribute('role', 'status'); bubble.setAttribute('aria-live', 'polite');
    var bTitle = el('p', 'cm-bubble-title'), bText = el('div', 'cm-bubble-text'), bNote = el('p', 'cm-bubble-note');
    bubble.appendChild(bTitle); bubble.appendChild(bText); bubble.appendChild(bNote);
    avatarBtn.appendChild(avatar);
    var HOW = { pt: 'Como jogar', en: 'How to play', es: 'Cómo jugar', fr: 'Comment jouer' };
    var howBtn = el('button', 'cm-btn cm-how', HOW[lang] || HOW.pt); howBtn.type = 'button'; howBtn.setAttribute('aria-expanded', 'false');
    var actions = el('div', 'cm-hug-actions'); actions.appendChild(hintBtn); actions.appendChild(howBtn);
    var rules = el('div', 'cm-rules'); rules.hidden = true; rules.appendChild(el('p', 'cm-rules-title', T.rulesTitle));
    var ul = el('ul'); T.rules.forEach(function (r) { ul.appendChild(el('li', '', r)); }); rules.appendChild(ul);
    howBtn.addEventListener('click', function () { rules.hidden = !rules.hidden; howBtn.setAttribute('aria-expanded', String(!rules.hidden)); sizeBoard(); });
    hug.appendChild(avatarBtn); hug.appendChild(bubble); hug.appendChild(actions); hug.appendChild(rules);

    var CTRL = {
      pt: { mouse: ['Clique esquerdo', 'abre a casa', 'Clique direito', 'põe a bandeira'], touch: ['Toque', 'abre a casa', 'Segure o dedo', 'põe a bandeira'] },
      en: { mouse: ['Left click', 'opens a cell', 'Right click', 'places a flag'], touch: ['Tap', 'opens a cell', 'Press and hold', 'places a flag'] },
      es: { mouse: ['Clic izquierdo', 'abre la casilla', 'Clic derecho', 'pone la bandera'], touch: ['Toque', 'abre la casilla', 'Mantén pulsado', 'pone la bandera'] },
      fr: { mouse: ['Clic gauche', 'ouvre la case', 'Clic droit', 'pose le drapeau'], touch: ['Toucher', 'ouvre la case', 'Appui long', 'pose le drapeau'] }
    };
    var controls = el('p', 'cm-controls');
    function showControls(kind) {
      var c = (CTRL[lang] || CTRL.pt)[kind]; controls.textContent = '';
      [[c[0], c[1]], [c[2], c[3]]].forEach(function (p) { var s = el('span', 'cm-ctl'); s.appendChild(el('b', '', p[0])); s.appendChild(document.createTextNode(' ' + p[1])); controls.appendChild(s); });
      controls.dataset.kind = kind;
    }
    try { showControls(window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse'); } catch (e) { showControls('mouse'); }
    host.addEventListener('pointerdown', function (e) { var k = e.pointerType === 'mouse' ? 'mouse' : 'touch'; if (controls.dataset.kind !== k) showControls(k); });
    var status = el('p', 'cm-status'); status.setAttribute('role', 'status');
    var scroller = el('div', 'cm-scroll');
    var grid = el('div', 'cm-grid'); grid.setAttribute('role', 'grid'); grid.setAttribute('aria-label', T.boardLabel);
    scroller.appendChild(grid);
    var play = el('div', 'cm-play'); var boardCol = el('div', 'cm-board'); boardCol.appendChild(scroller);
    play.appendChild(boardCol); play.appendChild(hug);
    var seedForm = el('form', 'cm-seedform'); seedForm.noValidate = true;
    var seedLabel = el('label', 'cm-field cm-seedfield'); seedLabel.appendChild(el('span', '', T.seed));
    var seedInput = el('input', 'cm-seedinput'); seedInput.type = 'text'; seedInput.maxLength = 64; seedInput.autocomplete = 'off'; seedInput.spellcheck = false; seedInput.setAttribute('autocapitalize', 'off');
    seedLabel.appendChild(seedInput);
    var seedGo = el('button', 'cm-btn', T.seedGo); seedGo.type = 'submit';
    var seedCopy = el('button', 'cm-btn', T.seedCopy); seedCopy.type = 'button';
    var seedMsg = el('span', 'cm-copied'); seedMsg.setAttribute('role', 'status');
    [seedLabel, seedGo, seedCopy, seedMsg].forEach(function (x) { seedForm.appendChild(x); });
    var foot = el('div', 'cm-foot');
    var replayBtn = el('button', 'cm-link', T.replay); replayBtn.type = 'button';
    var copyBtn = el('button', 'cm-link', T.copy); copyBtn.type = 'button';
    var copyMsg = el('span', 'cm-copied'); copyMsg.setAttribute('role', 'status');
    [replayBtn, copyBtn, copyMsg].forEach(function (x) { foot.appendChild(x); });
    [bar, controls, status, play, seedForm, foot].forEach(function (x) { host.appendChild(x); });

    function say(title, paragraphs, note) {
      bTitle.textContent = title || '';
      bText.textContent = '';
      (paragraphs || []).forEach(function (p) { bText.appendChild(el('p', '', p)); });
      bNote.textContent = note || '';
    }
    function ref(i) { return T.refRow + (Math.floor(i / game.w) + 1) + T.refCol + ((i % game.w) + 1); }
    function setUrl() {
      try { var u = new URL(location.href); u.searchParams.set('seed', String(seed)); u.searchParams.set('level', levelKey); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) { /* sem histórico */ }
    }
    function sizeBoard() {
      // o tabuleiro inteiro cabe na largura e na altura da tela: sem barra de rolagem
      var side = (window.innerWidth || 1024) >= 820;
      var avail = Math.max(120, (host.clientWidth || 320) - (side ? 250 + 20 : 0) - 20);
      var byW = Math.floor(avail / game.w);
      var vh = window.innerHeight || 800;
      var byH = Math.floor((vh - 150) / game.h);
      var size = Math.max(10, Math.min(38, byW, Math.max(18, byH)));
      grid.style.setProperty('--cm-size', size + 'px');
      grid.style.setProperty('--cm-cols', String(game.w));
    }

    function describeCell(i) {
      var s = game.state[i], lost = game.status === 'lost', won = game.status === 'won', txt;
      if (s === 1) txt = game.near[i] ? T.near(game.near[i]) : T.empty;
      else if (lost && game.mine[i]) txt = s === 2 ? T.flag : T.mine;
      else if (lost && s === 2) txt = T.wrongFlag;
      else if (s === 2) txt = T.flag;
      else txt = T.closed;
      return (won && s === 2 ? T.mine : txt);
    }
    function paint(i) {
      var c = cellsEl[i], s = game.state[i], over = game.status === 'lost', hl = highlights[i] || '';
      var key = s + '|' + (over ? (game.mine && game.mine[i] ? 'm' : 'x') + (game.hit === i ? 'h' : '') : '') + '|' + hl + '|' + game.status + '|' + (focus === i ? 1 : 0);
      if (sig[i] === key) return;
      sig[i] = key;
      var cls = 'cm-cell', inner = '';
      if (s === 1) { cls += ' open'; if (game.near[i]) { cls += ' n' + game.near[i]; inner = String(game.near[i]); } }
      else {
        cls += ' closed';
        if (over && game.mine[i] && s !== 2) { cls += ' mine'; inner = MINE_SVG; }
        else if (over && s === 2 && !game.mine[i]) { cls += ' badflag'; inner = FLAG_SVG; }
        else if (s === 2) { cls += ' flagged'; inner = FLAG_SVG; }
      }
      if (over && game.hit === i) cls += ' boom';
      if (hl) cls += ' hl hl-' + hl;
      c.className = cls;
      if (inner.charAt(0) === '<') c.innerHTML = inner; else c.textContent = inner;
      c.setAttribute('aria-label', (T.row + ' ' + (Math.floor(i / game.w) + 1) + ', ' + T.col + ' ' + ((i % game.w) + 1) + ': ' + describeCell(i)));
      c.tabIndex = focus === i ? 0 : -1;
    }
    function paintAll() { for (var i = 0; i < game.n; i++) paint(i); updateBar(); }
    function updateBar() {
      var left = game.total - game.flags;
      minesVal.textContent = (left < 0 ? '-' : '') + String(Math.min(99, Math.abs(left))).padStart(left < 0 ? 2 : 3, '0');
      minesVal.setAttribute('aria-label', String(left));
      timeVal.textContent = String(Math.min(999, elapsed)).padStart(3, '0');
      hintBtn.disabled = game.status === 'won' || game.status === 'lost';
      var msg = game.status === 'won' ? T.won(elapsed) : game.status === 'lost' ? T.lost : game.status === 'ready' ? T.ready : T.playing;
      if (status.textContent !== msg) status.textContent = msg;
      status.className = 'cm-status ' + game.status;
    }
    function stopTimer() { if (tick) { clearInterval(tick); tick = null; } }
    function startTimer() {
      startedAt = Date.now();
      tick = setInterval(function () { elapsed = Math.floor((Date.now() - startedAt) / 1000); timeVal.textContent = String(Math.min(999, elapsed)).padStart(3, '0'); }, 500);
    }
    function afterMove() {
      highlights = {}; hintStep = null;
      if (game.status === 'playing' && !tick) startTimer();
      if (game.status === 'won' || game.status === 'lost') {
        stopTimer(); elapsed = Math.floor((Date.now() - startedAt) / 1000);
        say(T.hugName, [game.status === 'won' ? T.hugWon : T.hugLost], '');
      }
      paintAll();
    }
    function newGame(keepSeed) {
      stopTimer(); elapsed = 0; highlights = {}; hintStep = null;
      if (!keepSeed) seed = randomSeed();
      game = createGame(levelKey, seed);
      grid.textContent = ''; cellsEl = []; sig = []; focus = 0;
      grid.style.setProperty('--cm-cols', String(game.w));
      for (var r = 0; r < game.h; r++) {
        var row = el('div', 'cm-row'); row.setAttribute('role', 'row');
        for (var c = 0; c < game.w; c++) {
          var cell = el('div', 'cm-cell closed'); cell.setAttribute('role', 'gridcell'); cell.dataset.i = String(r * game.w + c);
          cellsEl.push(cell); row.appendChild(cell);
        }
        grid.appendChild(row);
      }
      sizeBoard(); setUrl(); copyMsg.textContent = ''; seedMsg.textContent = ''; seedInput.value = String(seed);
      say(T.hugName, [T.hugHello], '');
      select.value = levelKey;
      paintAll();
    }

    function primary(i) {
      if (flagMode && game.state[i] !== 1) { game.toggleFlag(i); afterMove(); return; }
      if (game.state[i] === 1) { if (game.chord(i)) afterMove(); return; }
      if (game.state[i] === 2) return;
      if (game.open(i)) afterMove();
    }
    function secondary(i) { if (game.toggleFlag(i)) afterMove(); }
    function cellOf(target) { var c = target && target.closest ? target.closest('.cm-cell') : null; return c ? Number(c.dataset.i) : -1; }
    function moveFocus(i) {
      var old = focus; focus = Math.max(0, Math.min(game.n - 1, i));
      paint(old); paint(focus); cellsEl[focus].focus();
    }

    var press = null, pressTimer = null, suppress = false, lastType = 'mouse';
    function cancelPress() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }
    grid.addEventListener('pointerdown', function (e) {
      var i = cellOf(e.target); if (i < 0) return;
      lastType = e.pointerType || 'mouse';
      if (lastType === 'mouse') return;
      press = { i: i, x: e.clientX, y: e.clientY, fired: false };
      cancelPress();
      pressTimer = setTimeout(function () {
        if (!press) return;
        press.fired = true; secondary(press.i);
        try { if (navigator.vibrate) navigator.vibrate(15); } catch (err) { /* sem vibração */ }
      }, 450);
    });
    grid.addEventListener('pointermove', function (e) { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) { cancelPress(); press = null; } });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (name) {
      grid.addEventListener(name, function () {
        cancelPress();
        if (press && press.fired) { suppress = true; setTimeout(function () { suppress = false; }, 500); }
        press = null;
      });
    });
    grid.addEventListener('click', function (e) {
      if (suppress) { suppress = false; e.preventDefault(); return; }
      var i = cellOf(e.target); if (i < 0) return;
      moveFocus(i); primary(i);
    });
    grid.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (lastType !== 'mouse') return;
      var i = cellOf(e.target); if (i < 0) return;
      moveFocus(i); secondary(i);
    });
    grid.addEventListener('auxclick', function (e) { if (e.button === 1) { e.preventDefault(); var i = cellOf(e.target); if (i >= 0 && game.chord(i)) afterMove(); } });
    grid.addEventListener('mousedown', function (e) { if (e.button === 1) e.preventDefault(); });
    grid.addEventListener('keydown', function (e) {
      var i = cellOf(e.target); if (i < 0) return;
      var r = Math.floor(i / game.w), c = i % game.w, handled = true;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') moveFocus(c > 0 ? i - 1 : i);
      else if (e.key === 'ArrowRight') moveFocus(c < game.w - 1 ? i + 1 : i);
      else if (e.key === 'ArrowUp') moveFocus(r > 0 ? i - game.w : i);
      else if (e.key === 'ArrowDown') moveFocus(r < game.h - 1 ? i + game.w : i);
      else if (e.key === 'Home') moveFocus(r * game.w);
      else if (e.key === 'End') moveFocus(r * game.w + game.w - 1);
      else if (e.key === ' ' || e.key === 'Enter') primary(i);
      else if (e.key === 'f' || e.key === 'F') secondary(i);
      else handled = false;
      if (handled) e.preventDefault();
    });
    grid.addEventListener('focusin', function (e) { var i = cellOf(e.target); if (i >= 0 && i !== focus) { var old = focus; focus = i; paint(old); paint(i); } });

    function showHint() {
      if (game.status === 'won' || game.status === 'lost') { var d = describe({ kind: 'done' }, lang, game.w); say(d.title, d.paragraphs, ''); return; }
      var step = hint(game.view(), game.flagArray());
      hintStep = step; highlights = {};
      (step.sources || []).forEach(function (c) { highlights[c] = 'src'; });
      if (step.kind === 'deduction') { step.safe.forEach(function (c) { highlights[c] = 'safe'; }); step.mine.forEach(function (c) { highlights[c] = 'mine'; }); }
      if (step.kind === 'guess') highlights[step.cell] = 'guess';
      var d2 = describe(step, lang, game.w);
      say(d2.title, d2.paragraphs, d2.note);
      var first = step.kind === 'deduction' ? (step.safe[0] !== undefined ? step.safe[0] : step.mine[0]) : step.kind === 'guess' ? step.cell : -1;
      if (first >= 0) { var old = focus; focus = first; paint(old); }
      paintAll();
      if (first >= 0) { try { cellsEl[first].focus({ preventScroll: true }); } catch (err) { /* sem foco */ } }
    }

    select.addEventListener('change', function () { levelKey = select.value; newGame(false); });
    newBtn.addEventListener('click', function () { newGame(false); });
    replayBtn.addEventListener('click', function () { newGame(true); });
    flagBtn.addEventListener('click', function () { flagMode = !flagMode; flagBtn.setAttribute('aria-pressed', String(flagMode)); flagBtn.classList.toggle('on', flagMode); });
    hintBtn.addEventListener('click', showHint);
    avatarBtn.addEventListener('click', showHint);
    copyBtn.addEventListener('click', function () {
      var url = location.href, done = function () { copyMsg.textContent = T.copied; };
      try { navigator.clipboard.writeText(url).then(done, function () { copyMsg.textContent = url; }); } catch (e) { copyMsg.textContent = url; }
    });
    seedForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = parseSeed(seedInput.value);
      if (v === null) { seedMsg.textContent = T.seedBad; seedInput.setAttribute('aria-invalid', 'true'); seedInput.focus(); return; }
      seedInput.removeAttribute('aria-invalid');
      seed = v; newGame(true);
    });
    seedCopy.addEventListener('click', function () {
      var t = String(seed), done = function () { seedMsg.textContent = T.seedCopied; };
      try { navigator.clipboard.writeText(t).then(done, function () { seedInput.select(); }); } catch (err) { seedInput.select(); }
    });
    window.addEventListener('resize', function () { if (game) sizeBoard(); });

    select.value = levelKey;
    newGame(true);
    host.cmApi = { game: function () { return game; }, hint: showHint, paint: paintAll, open: function (i) { primary(i); }, flag: function (i) { secondary(i); }, lastHint: function () { return hintStep; } };
  }

  function boot() {
    var host = document.getElementById('campo-minado');
    if (host) mount(host);
  }

  return { LEVELS: LEVELS, mulberry32: mulberry32, parseSeed: parseSeed, neighborsOf: neighborsOf, placeMines: placeMines, createGame: createGame, hint: hint, probabilities: probabilities, describe: describe, TEXT: TEXT, boot: boot };
});
