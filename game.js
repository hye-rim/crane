'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 인형 뽑기: 화면·입력·소리. 규칙은 logic.js (LOGIC_CRANE).
const C = LOGIC_CRANE;
const $ = (id) => document.getElementById(id);
const W = 360, H = 640;
const canvas = $('game'), ctx = canvas.getContext('2d');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
const TUTORIAL = new URLSearchParams(location.search).get('tutorial') === '1';

let audio = null, muted = store.get('craneMuted') === '1';
function ac() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); return audio; } catch (_) { return null; } }
function tone(freq, dur, type = 'triangle', vol = 0.05, slide = 0) {
  if (muted) return;
  const a = ac(); if (!a) return;
  try {
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch (_) {}
}
const sfx = {
  drop() { tone(300, 0.35, 'sawtooth', 0.04, -150); },
  grab() { tone(180, 0.1, 'square', 0.05); },
  miss() { tone(220, 0.3, 'sawtooth', 0.05, -120); },
  slip() { tone(500, 0.3, 'triangle', 0.06, -380); },
  win(p) { [523, 659, 784, 1047].slice(0, p >= 30 ? 4 : 3).forEach((f, i) => setTimeout(() => tone(f, 0.15, 'triangle', 0.07), i * 80)); },
  over() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.06), i * 140)); },
};
function toggleMute() { muted = !muted; store.set('craneMuted', muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').textContent = muted ? '🔇' : '🔊';

let G = null, level = 'easy', dir = 0, floats = [], lastTs = 0, started = false, moved = 0, shake = 0, seedCount = 0;
const held = { left: false, right: false };

/* @test-hooks:start */
window.__cr = { get G() { return G; }, C, step: (dt) => update(dt), draw: () => draw(), held };
/* @test-hooks:end */

function showOverlay(html) {
  const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden'); $('ctls').classList.add('hidden');
  o.querySelectorAll('button[data-level]').forEach((b) => { b.onclick = () => start(b.dataset.level); });
  o.querySelectorAll('button[data-again]').forEach((b) => { b.onclick = () => start(level); });
}
function hideOverlay() { $('overlay').classList.add('hidden'); $('ctls').classList.remove('hidden'); }
function showTitle() {
  const best = +store.get('craneBest') || 0;
  showOverlay(`<h1>인형 뽑기</h1><div class="big">🧸 🐥 ⚽ 💎</div>
    <p>집게를 옮겨 인형 위에 맞추고 <b>뽑기!</b><br>왼쪽 출구에 떨어뜨리면 점수가 돼요</p>
    <p class="help">정확히 맞출수록 잘 잡혀요.<br>큰 인형은 미끄러지기 쉬워요</p>
    ${best ? `<p class="note">최고 점수 ${best}점</p>` : ''}
    <div class="lv"><button data-level="easy">쉬움<small>9번 · 잘 잡힘</small></button><button data-level="normal">보통<small>6번 · 잘 미끄러짐</small></button></div>`);
}
function start(lv) {
  level = lv; seedCount++;
  G = C.newGame(C.rng((Date.now() + seedCount * 7919) >>> 0), { level: lv, tutorial: TUTORIAL });
  floats = []; moved = 0; started = true; hideOverlay();
}
function finish() {
  const s = G.score, old = +store.get('craneBest') || 0, isBest = s > old;
  if (isBest) store.set('craneBest', String(s));
  sfx.over();
  setTimeout(() => showOverlay(`<h2>${G.prizes.length === 0 ? '전부 뽑았어요! 🎉' : '게임 끝'}</h2><div class="big">${G.won.map((k) => C.TYPES[k].emoji).join('') || '😢'}</div>
    <p class="big">${s}점</p><p class="help">${isBest ? '🏆 최고 점수!' : `최고 ${old}점`}</p>
    <button data-again="1">다시 하기</button><button data-level="${level === 'easy' ? 'normal' : 'easy'}" style="background:rgba(255,255,255,.14);color:#fff;box-shadow:none;font-size:14px">${level === 'easy' ? '보통으로' : '쉬움으로'}</button>`), 700);
}

// ---------- 입력 ----------
function setHold(k, v, btn) { held[k] = v; if (btn) $(btn).classList.toggle('on', v); }
for (const [id, k] of [['btnL', 'left'], ['btnR', 'right']]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { setHold(k, true, id); try { b.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
  const off = () => setHold(k, false, id);
  b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
}
$('btnDrop').addEventListener('pointerdown', (e) => { doDrop(); e.preventDefault(); });
function doDrop() { if (G && !G.over && C.drop(G)) { sfx.drop(); tutorialSignal('drop'); } }
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') setHold('left', true, 'btnL');
  else if (e.key === 'ArrowRight' || e.key === 'd') setHold('right', true, 'btnR');
  else if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'Enter') { if (!$('overlay').classList.contains('hidden')) return; e.preventDefault(); doDrop(); }
  else if (e.key === 'm' || e.key === 'M') toggleMute();
});
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') setHold('left', false, 'btnL');
  else if (e.key === 'ArrowRight' || e.key === 'd') setHold('right', false, 'btnR');
});
$('muteBtn').onclick = toggleMute;
addEventListener('blur', () => { setHold('left', false, 'btnL'); setHold('right', false, 'btnR'); });
function fit() { const s = Math.min(innerWidth / W, innerHeight / H); canvas.style.width = `${Math.floor(W * s)}px`; canvas.style.height = `${Math.floor(H * s)}px`; $('wrap').style.width = canvas.style.width; $('wrap').style.height = canvas.style.height; }
addEventListener('resize', fit); fit();

// ---------- 갱신 ----------
function update(dt) {
  if (!G) return;
  if (!G.over) {
    const d = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    if (d && G.phase === 'move') { const x0 = G.claw.x; C.move(G, d, dt); moved += Math.abs(G.claw.x - x0); if (moved >= 60) { moved = 0; tutorialSignal('move'); } }
    C.step(G, dt);
  }
  while (G.events.length) {
    const ev = G.events.shift();
    if (ev.type === 'grab') { if (ev.ok) { sfx.grab(); tutorialSignal('grab'); floats.push({ x: G.claw.x, y: G.claw.y - 30, t: 0, text: '잡았다!', c: '#fff' }); } else { sfx.miss(); floats.push({ x: G.claw.x, y: G.claw.y - 30, t: 0, text: '아깝다!', c: '#ffb0b0' }); } }
    else if (ev.type === 'slip') { sfx.slip(); floats.push({ x: G.claw.x, y: G.claw.y + 20, t: 0, text: '앗, 미끄러졌다', c: '#ffd0a0' }); }
    else if (ev.type === 'win') { sfx.win(ev.pts); tutorialSignal('win'); shake = 0.25; floats.push({ x: C.CHUTE_X + 20, y: C.FLOOR + 20, t: 0, text: `+${ev.pts}`, c: '#ffe36a' }); }
    else if (ev.type === 'over') finish();
  }
  if (shake > 0) shake -= dt;
  for (const f of floats) { f.t += dt; f.y -= 28 * dt; }
  floats = floats.filter((f) => f.t < 1.2);
}

// ---------- 그리기 ----------
function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#3a1a4a'); bg.addColorStop(1, '#1d0d2a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // 기계 유리창
  ctx.fillStyle = '#ffd6e6'; ctx.fillRect(8, 40, W - 16, 8);
  const gl = ctx.createLinearGradient(0, 48, 0, C.FLOOR); gl.addColorStop(0, '#31495f'); gl.addColorStop(1, '#223244');
  ctx.fillStyle = gl; ctx.fillRect(14, 48, W - 28, C.FLOOR - 48);
  ctx.strokeStyle = '#ffb3d0'; ctx.lineWidth = 4; ctx.strokeRect(14, 48, W - 28, C.FLOOR - 48);
  // 바닥과 출구
  ctx.fillStyle = '#6b3b57'; ctx.fillRect(14, C.FLOOR, W - 28, 24);
  ctx.fillStyle = '#12080f'; ctx.fillRect(18, C.FLOOR - 2, 78, 28);
  ctx.fillStyle = 'rgba(255,230,120,.8)'; ctx.font = '800 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('출구', 57, C.FLOOR + 17);
  ctx.fillStyle = '#c33a6a'; ctx.fillRect(96, 48, 4, C.FLOOR - 48);
  if (!G) { ctx.restore(); return; }
  // 인형
  ctx.textBaseline = 'middle';
  for (const p of G.prizes) {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill();
    ctx.font = `${Math.round(p.r * 1.7)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(C.TYPES[p.kind].emoji, p.x, p.y + 2);
  }
  // 집게
  const c = G.claw, o = c.open;
  ctx.strokeStyle = '#cfd6e0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c.x, 48); ctx.lineTo(c.x, c.y); ctx.stroke();
  ctx.fillStyle = '#e8eef6'; ctx.fillRect(c.x - 14, c.y - 6, 28, 12);
  const sp = 8 + o * 26;
  ctx.strokeStyle = '#f0f4fa'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(c.x + s * 10, c.y + 4); ctx.lineTo(c.x + s * sp, c.y + 22); ctx.lineTo(c.x + s * (sp - 8 - (1 - o) * 4), c.y + 40); ctx.stroke(); }
  if (c.hold) { const p = c.hold; ctx.font = `${Math.round(p.r * 1.7)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(C.TYPES[p.kind].emoji, c.x, c.y + 38); }
  // 가이드 선(내리기 전)
  if (G.phase === 'move' && !G.over) {
    const pr = C.probe(G, c.x); ctx.setLineDash([4, 6]); ctx.strokeStyle = pr.hit ? 'rgba(255,230,120,.7)' : 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c.x, c.y + 40); ctx.lineTo(c.x, pr.top); ctx.stroke(); ctx.setLineDash([]);
  }
  // 위쪽 표시
  ctx.fillStyle = 'rgba(8,4,14,.7)'; ctx.fillRect(0, 0, W, 38);
  ctx.fillStyle = '#fff'; ctx.font = '800 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(`점수 ${G.score}`, 10, 19);
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffd0e0'; ctx.fillText(TUTORIAL ? '연습 중' : `남은 기회 ${G.left}`, W / 2 + 20, 19);
  for (const f of floats) { ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2); ctx.fillStyle = f.c; ctx.font = '800 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y); ctx.globalAlpha = 1; }
  // 들어간 인형
  ctx.textAlign = 'left'; ctx.font = '18px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(G.won.slice(-9).map((k) => C.TYPES[k].emoji).join(''), 12, C.FLOOR + 58);
  ctx.restore();
}
function frame(ts) {
  const dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000); lastTs = ts;
  update(dt); draw(); requestAnimationFrame(frame);
}
showTitle();
requestAnimationFrame(frame);
