'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../logic.js');

// 한 번 뽑기: 목표 x 로 옮기고 내려서 끝날 때까지 돌린다
function shot(st, x) {
  while (st.phase === 'move' && Math.abs(st.claw.x - x) > 1) C.move(st, Math.sign(x - st.claw.x), 1 / 60);
  st.claw.x = x;
  C.drop(st);
  for (let i = 0; i < 60 * 30 && st.phase !== 'move' && st.phase !== 'over'; i++) C.step(st, 1 / 60);
}
function best(st) { const t = st.prizes.filter((p) => p.x > 100).sort((a, b) => a.y - b.y)[0]; return t.x; }

test('layout is deterministic and prizes rest on the floor or each other', () => {
  const a = C.newGame(C.rng(7)), b = C.newGame(C.rng(7));
  assert.deepStrictEqual(a.prizes.map((p) => [p.kind, p.x, Math.round(p.y)]), b.prizes.map((p) => [p.kind, p.x, Math.round(p.y)]));
  for (const p of a.prizes) { assert.ok(p.y <= C.FLOOR - p.r + 0.001 && p.x > 100 && p.x < 340); }
});

test('no two prizes overlap after stacking', () => {
  for (let s = 1; s <= 30; s++) {
    const st = C.newGame(C.rng(s));
    for (let i = 0; i < st.prizes.length; i++) for (let j = i + 1; j < st.prizes.length; j++) {
      const a = st.prizes[i], b = st.prizes[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r - 0.5, 'seed ' + s);
    }
  }
});

test('claw stays within the rails', () => {
  const st = C.newGame(C.rng(1));
  for (let i = 0; i < 1000; i++) C.move(st, -1, 1 / 60);
  assert.strictEqual(st.claw.x, C.X0);
  for (let i = 0; i < 1000; i++) C.move(st, 1, 1 / 60);
  assert.strictEqual(st.claw.x, C.X1);
});

test('a drop spends an attempt and cannot be repeated mid shot', () => {
  const st = C.newGame(C.rng(2), { level: 'normal' });
  assert.strictEqual(st.left, 6);
  assert.ok(C.drop(st));
  assert.strictEqual(st.left, 5);
  assert.strictEqual(C.drop(st), false);
  C.move(st, 1, 1); assert.strictEqual(st.claw.x, 200);
});

test('aligned shots on easy mode win prizes and every shot ends', () => {
  let total = 0;
  for (let s = 1; s <= 20; s++) {
    const st = C.newGame(C.rng(s), { level: 'easy' });
    for (let k = 0; k < 9 && !st.over; k++) { shot(st, best(st)); assert.ok(st.phase === 'move' || st.phase === 'over'); }
    assert.ok(st.over || st.left === 0);
    total += st.won.length;
  }
  assert.ok(total / 20 >= 3, 'easy aligned average ' + total / 20);
});

test('blind shots over the chute side catch nothing', () => {
  const st = C.newGame(C.rng(3));
  shot(st, 60);
  assert.strictEqual(st.won.length, 0);
  assert.strictEqual(st.misses, 1);
});

test('aligned beats misaligned on average', () => {
  let a = 0, m = 0;
  for (let s = 1; s <= 60; s++) {
    const x = C.newGame(C.rng(s), { level: 'normal' }), y = C.newGame(C.rng(s), { level: 'normal' });
    for (let k = 0; k < 6; k++) { if (!x.over) shot(x, best(x)); if (!y.over) shot(y, Math.min(C.X1, best(y) + 30)); }
    a += x.score; m += y.score;
  }
  assert.ok(a > m * 1.3, a + ' vs ' + m);
});

test('slipped prize returns to the pile', () => {
  const st = C.newGame(C.rng(4), { level: 'normal' });
  const n = st.prizes.length, p = st.prizes[0];
  st.prizes.splice(0, 1); st.claw.hold = p; st.claw.x = 200; st.phase = 'up';
  const before = st.prizes.length;
  // force a slip through the public path: drop checks use rng, so emulate with a rigged rand
  st.rand = () => 0; st.target = { y: 400, hit: null }; st.claw.y = 400; st.checks = 0;
  for (let i = 0; i < 300 && st.claw.hold; i++) C.step(st, 1 / 60);
  assert.strictEqual(st.claw.hold, null);
  assert.strictEqual(st.prizes.length, before + 1);
  assert.strictEqual(st.prizes.length, n);
});

test('tutorial mode never runs out and always grips', () => {
  const st = C.newGame(C.rng(5), { tutorial: true });
  shot(st, best(st));
  assert.strictEqual(st.won.length, 1);
  assert.ok(st.left > 90);
});

test('game over after the last attempt and score is the sum of prizes', () => {
  const st = C.newGame(C.rng(9), { level: 'easy' });
  for (let k = 0; k < 9; k++) shot(st, best(st));
  assert.ok(st.over);
  assert.strictEqual(st.score, st.won.reduce((a, k) => a + C.TYPES[k].pts, 0));
});
