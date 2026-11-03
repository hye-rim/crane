'use strict';
// 인형 뽑기: 규칙만 (DOM 없음). 화면·입력·소리는 game.js.
// 집게를 좌우로 옮기고 내려서 인형을 집어 왼쪽 출구에 떨어뜨린다. 잘 맞출수록 잘 잡히고, 큰 인형일수록 미끄러지기 쉽다.
(function (root) {
  const W = 360, FLOOR = 480, RAIL = 96, CHUTE_X = 52, CHUTE_W = 56, X0 = 34, X1 = 326;
  const SPEED = 110, DOWN = 230, UP = 200, CLOSE_T = 0.7, OPEN_T = 0.45, TOLERANCE = 12;
  const TYPES = {
    ball: { emoji: '⚽', r: 14, grip: 0.9, pts: 5 },
    chick: { emoji: '🐥', r: 19, grip: 0.75, pts: 15 },
    bear: { emoji: '🧸', r: 26, grip: 0.58, pts: 30 },
    gem: { emoji: '💎', r: 12, grip: 0.5, pts: 50 },
  };
  const LEVELS = {
    easy: { label: '쉬움', attempts: 9, strength: 1.2, slip: 0.5 },
    normal: { label: '보통', attempts: 6, strength: 1.0, slip: 0.9 },
  };
  const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };

  // 쌓기: 순서대로 위에서 떨어뜨려 놓는다
  function restack(st) {
    const placed = [];
    for (const p of st.prizes) {
      let y = FLOOR - p.r;
      for (const o of placed) {
        const dx = Math.abs(p.x - o.x), need = p.r + o.r;
        if (dx < need) y = Math.min(y, o.y - Math.sqrt(need * need - dx * dx));
      }
      p.y = y; placed.push(p);
    }
  }
  function makeLayout(rand) {
    const kinds = ['ball', 'ball', 'ball', 'ball', 'ball', 'ball', 'chick', 'chick', 'chick', 'chick', 'bear', 'bear', 'bear', 'gem'];
    for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    const prizes = kinds.map((k, i) => ({ id: i, kind: k, r: TYPES[k].r, x: 118 + Math.round(rand() * 200), y: 0 }));
    return prizes;
  }

  function newGame(rand, opts = {}) {
    rand = rand || Math.random;
    const lv = LEVELS[opts.level] ? opts.level : 'normal';
    const p = Object.assign({}, LEVELS[lv]);
    if (opts.tutorial) Object.assign(p, { attempts: 99, strength: 5, slip: 0 });
    const st = { rand, level: lv, params: p, tutorial: !!opts.tutorial, prizes: makeLayout(rand), claw: { x: 200, y: RAIL, open: 1, hold: null }, phase: 'move', t: 0, left: p.attempts, score: 0, won: [], misses: 0, slips: 0, events: [], over: false, target: null, checks: 0 };
    restack(st);
    return st;
  }

  // 지금 내리면 닿을 인형(가장 높이 있는 것)과 그 위치
  function probe(st, x) {
    let top = FLOOR, hit = null;
    for (const p of st.prizes) {
      if (Math.abs(p.x - x) < p.r + 10 && p.y - p.r < top) { top = p.y - p.r; hit = p; }
    }
    return { top, hit };
  }
  function drop(st) {
    if (st.over || st.phase !== 'move' || st.left <= 0) return false;
    const c = st.claw, { top, hit } = probe(st, c.x);
    st.left--; st.phase = 'down'; st.target = { hit, y: Math.max(RAIL, top - 6) }; st.t = 0;
    st.events.push({ type: 'drop', x: c.x });
    return true;
  }
  function move(st, dir, dt) {
    if (st.phase !== 'move' || !dir) return;
    st.claw.x = Math.max(X0, Math.min(X1, st.claw.x + dir * SPEED * dt));
  }
  function removePrize(st, p) { st.prizes = st.prizes.filter((q) => q !== p); }
  function slipDrop(st) {
    const c = st.claw, p = c.hold; c.hold = null;
    p.x = c.x; st.prizes.push(p); restack(st); st.slips++;
    st.events.push({ type: 'slip', kind: p.kind });
  }
  function finishShot(st) {
    st.phase = 'move'; st.t = 0;
    if (st.left <= 0 && !st.over) { st.over = true; st.phase = 'over'; st.events.push({ type: 'over', score: st.score }); }
  }

  function step(st, dt) {
    if (st.over) return;
    const c = st.claw; st.t += dt;
    if (st.phase === 'down') {
      c.y += DOWN * dt;
      if (c.y >= st.target.y) { c.y = st.target.y; st.phase = 'close'; st.t = 0; }
    } else if (st.phase === 'close') {
      c.open = Math.max(0, 1 - st.t / CLOSE_T);
      if (st.t >= CLOSE_T) {
        const hit = st.target.hit; let got = false;
        if (hit && st.prizes.includes(hit)) {
          const dx = Math.abs(hit.x - c.x), q = Math.max(0, 1 - dx / (hit.r + TOLERANCE));
          const chance = Math.min(1, TYPES[hit.kind].grip * (0.4 + 0.6 * q) * st.params.strength);
          if (st.rand() < chance) { got = true; c.hold = hit; removePrize(st, hit); restack(st); }
          st.events.push({ type: 'grab', ok: got, q, chance, kind: hit.kind });
        } else st.events.push({ type: 'grab', ok: false, q: 0, chance: 0, kind: null });
        if (!got) st.misses++;
        st.phase = 'up'; st.t = 0; st.checks = 0;
      }
    } else if (st.phase === 'up') {
      c.y -= UP * dt;
      if (c.hold) {
        const frac = (st.target.y - c.y) / Math.max(1, st.target.y - RAIL);
        if (st.checks < 2 && frac >= (st.checks + 1) / 3) {
          st.checks++;
          if (st.rand() < (1 - TYPES[c.hold.kind].grip) * st.params.slip) { slipDrop(st); }
        }
      }
      if (c.y <= RAIL) { c.y = RAIL; st.phase = c.hold ? 'return' : 'open'; st.t = 0; st.checks = 0; }
    } else if (st.phase === 'return') {
      const half = (c.x + CHUTE_X) / 2;
      const nx = Math.max(CHUTE_X, c.x - SPEED * 1.5 * dt);
      if (st.checks < 1 && nx <= half && c.hold) { st.checks++; if (st.rand() < (1 - TYPES[c.hold.kind].grip) * st.params.slip * 0.5) slipDrop(st); }
      c.x = nx;
      if (c.x <= CHUTE_X) { c.x = CHUTE_X; st.phase = 'open'; st.t = 0; }
    } else if (st.phase === 'open') {
      c.open = Math.min(1, st.t / OPEN_T);
      if (st.t >= OPEN_T) {
        if (c.hold) { const p = c.hold, pts = TYPES[p.kind].pts; st.score += pts; st.won.push(p.kind); c.hold = null; st.events.push({ type: 'win', kind: p.kind, pts, score: st.score }); }
        c.open = 1; finishShot(st);
      }
    } else if (st.phase === 'move' && st.prizes.length === 0 && !st.over) { st.over = true; st.phase = 'over'; st.score += st.left * 10; st.events.push({ type: 'over', score: st.score, cleared: true }); }
  }

  const api = { W, FLOOR, RAIL, CHUTE_X, CHUTE_W, X0, X1, SPEED, TYPES, LEVELS, TOLERANCE, rng, newGame, restack, probe, drop, move, step };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LOGIC_CRANE = api;
})(typeof window !== 'undefined' ? window : globalThis);
