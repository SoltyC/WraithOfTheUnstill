// The site: one fixed canvas the scroll drives through the game's world. Each chapter is a stretch of scroll whose frames
// (/seq/<name>/NNN.webp, from the game's own films) play through as you scroll it; between chapters the next land opens out of a
// slit of light. The scroll is eased, so the camera glides rather than steps. Frames load in the order they're needed (this
// chapter, then the next, then the rest), and the nearest loaded frame stands in for one still on its way. Normal scrolling
// everywhere: nothing here captures touch.

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.querySelector('.stage'), ctx = canvas.getContext('2d', { alpha: false });
const chapters = [...document.querySelectorAll('.ch')].map((el, i) => ({ el, i, seq: el.dataset.seq, n: +el.dataset.n, name: el.dataset.name, frames: new Array(+el.dataset.n), top: 0, h: 1 }));
const params = new URLSearchParams(location.search);
// Sharp frames for big screens (1600 × 900), light ones for phones and data saver (960 × 540).
const big = Math.max(screen.width, screen.height) * Math.min(devicePixelRatio || 1, 2) > 1300 && !(navigator.connection && navigator.connection.saveData);
const BASE = params.get('sd') ? '/seq/' : big ? '/seq-hd/' : '/seq/';
// Touch scrolling already glides (momentum): drive the film straight from it. A mouse wheel steps, so it is eased.
const coarse = matchMedia('(pointer: coarse)').matches;

// ---- Frames: a load queue in priority order.
let loaded = 0; const total = chapters.reduce((a, c) => a + c.n, 0);
const bar = document.querySelector('.loading span');
const queued = new Set(), queue = [];
let inflight = 0;
function want(c, k) { const key = c.i * 1000 + k; if (queued.has(key)) return; queued.add(key); queue.push([c, k]); }
function pump() {
  while (inflight < 6 && queue.length) {
    const [c, k] = queue.shift(); inflight++;
    const img = new Image(); img.decoding = 'async';
    img.onload = () => { c.frames[k] = img; inflight--; loaded++; bar.style.width = (100 * loaded / total) + '%'; if (loaded === total) bar.style.opacity = '0'; pump(); };
    img.onerror = () => { inflight--; pump(); };
    img.src = `${BASE}${c.seq}/${String(k + 1).padStart(3, '0')}.webp`;
  }
}
/** Queue a chapter's frames: every 8th first (a coarse pass that makes scrubbing work at once), then the rest. */
function queueChapter(c) { for (let k = 0; k < c.n; k += 8) want(c, k); for (let k = 0; k < c.n; k++) want(c, k); }
for (const c of chapters) queueChapter(c);
pump();
/** The loaded frames either side of position f (fractional): a at or before it, b at or after it, and how far between. */
const pair = { a: null, b: null, t: 0 };
function frames(c, f) {
  f = Math.max(0, Math.min(c.n - 1, f));
  let ia = Math.floor(f), ib = Math.ceil(f);
  while (ia >= 0 && !c.frames[ia]) ia--;
  while (ib < c.n && !c.frames[ib]) ib++;
  pair.a = ia >= 0 ? c.frames[ia] : null; pair.b = ib < c.n ? c.frames[ib] : null;
  if (!pair.a) { pair.a = pair.b; pair.t = 0; } else if (!pair.b) { pair.t = 0; } else pair.t = ib === ia ? 0 : (f - ia) / (ib - ia);
  return pair;
}

// ---- Layout and scroll.
let vw = 1, vh = 1, dpr = 1;
let lastW = 0, maxH = 0;
function layout() {
  dpr = Math.min(devicePixelRatio || 1, 2); vw = innerWidth; vh = innerHeight;
  // A phone's address bar sliding changes the height a little: keep the canvas at the tallest height seen for this width (it is
  // sized in CSS to the large viewport), so the picture doesn't jump.
  if (vw !== lastW) { lastW = vw; maxH = 0; }
  maxH = Math.max(maxH, vh);
  const cw = Math.round(vw * dpr), ch = Math.round(maxH * dpr);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; ctx.imageSmoothingQuality = 'high'; }
  for (const c of chapters) { const r = c.el.getBoundingClientRect(); c.top = r.top + scrollY; c.h = r.height; }
}
addEventListener('resize', layout);
addEventListener('load', layout);   // (fonts and layout settled: the chapters' tops)
let target = scrollY, shown = scrollY;
addEventListener('scroll', () => { target = scrollY; }, { passive: true });

/** Cover-fit an image into the canvas, with a slight drift from the pointer (a held camera, breathing). */
let px = 0, py = 0, mx = 0, my = 0;
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { mx = (e.clientX / vw - 0.5); my = (e.clientY / vh - 0.5); } }, { passive: true });
function draw(img, alpha = 1, zoom = 1) {
  if (!img || alpha <= 0.002) return;
  const W = canvas.width, H = canvas.height, s = Math.max(W / img.width, H / img.height) * 1.015 * zoom;
  const w = img.width * s, h = img.height * s;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, (W - w) / 2 - px * W * 0.012, (H - h) / 2 - py * H * 0.012, w, h);
  ctx.globalAlpha = 1;
}

// ---- The rail.
const rail = document.querySelector('.rail');
for (const c of chapters) {
  const a = document.createElement('a'); a.href = '#' + c.el.id; a.innerHTML = `<span class="lbl">${c.name}</span><span class="dot"></span>`;
  rail.appendChild(a); c.link = a;
}

// ---- The loop: ease the scroll, find the chapter and its progress, draw.
const T = 0.4;   // the last share of a chapter over which the next opens out of a slit of light
let lastCh = -1, lastT = performance.now();
/** A chapter's picture at position f: the two nearest frames, crossfaded (smooth while frames are still arriving). */
function drawSeq(c, f, alpha, zoom) { const q = frames(c, f); draw(q.a, alpha, zoom); if (q.b && q.b !== q.a && q.t > 0.01) draw(q.b, alpha * q.t, zoom); }
function tick() {
  requestAnimationFrame(tick);
  const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  const d = target - shown;
  // Eased toward the scroll (frame-rate independent), straight from it on touch, and snapped when close.
  shown = reduced || coarse || Math.abs(d) < 1 ? target : shown + d * (1 - Math.exp(-dt * 14));
  px += (mx - px) * 0.04; py += (my - py) * 0.04;
  // Which chapter: the one whose stretch holds the viewport's top.
  let ci = 0;
  for (let i = 0; i < chapters.length; i++) if (shown >= chapters[i].top - 1) ci = i;
  const c = chapters[ci], span = Math.max(1, c.h - vh), p = Math.max(0, Math.min(1, (shown - c.top) / span));
  // Words: each chapter's progress as a CSS variable.
  for (let i = Math.max(0, ci - 1); i <= Math.min(chapters.length - 1, ci + 1); i++) {
    const q = chapters[i], qp = Math.max(0, Math.min(1, (shown - q.top) / Math.max(1, q.h - vh)));
    q.el.style.setProperty('--p', qp.toFixed(4));
  }
  if (ci !== lastCh) { lastCh = ci; for (const q of chapters) q.link.classList.toggle('on', q === c); }
  document.body.classList.toggle('past-title', ci > 0 || p > 0.3);
  document.body.classList.toggle('on-outro', shown > chapters[chapters.length - 1].top + chapters[chapters.length - 1].h - vh * 1.2);
  // Draw: this chapter's frame; over its last stretch, the next opens out of a horizontal slit, a line of light at its edges.
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#08090b'; ctx.fillRect(0, 0, W, H);
  const fade0 = ci === 0 ? Math.min(1, 0.35 + p * 3) : 1;         // the first frame comes up out of the dark
  drawSeq(c, p * (c.n - 1), fade0, 1 + p * 0.02);
  const next = chapters[ci + 1];
  if (next && p > 1 - T) {
    const u = (p - (1 - T)) / T, e = u * u * (3 - 2 * u), half = H * 0.5 * e;
    ctx.save(); ctx.beginPath(); ctx.rect(0, H / 2 - half, W, half * 2); ctx.clip();
    drawSeq(next, 0, 1, 1.04 - 0.02 * e); ctx.restore();
    if (e > 0.001 && e < 0.999) {
      const glow = (1 - e) * 0.9;
      const gr = ctx.createLinearGradient(0, 0, W, 0);
      gr.addColorStop(0, 'rgba(255,240,215,0)'); gr.addColorStop(0.5, `rgba(255,240,215,${glow})`); gr.addColorStop(1, 'rgba(255,240,215,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, H / 2 - half - 1.5 * dpr, W, 1.5 * dpr); ctx.fillRect(0, H / 2 + half, W, 1.5 * dpr);
    }
  }
}

// ---- Music: off until asked for; M toggles; fades; paused with the tab.
const music = document.querySelector('.music'), sound = document.querySelector('.sound');
let on = false, fadeT = 0;
function fade(to, done) {
  cancelAnimationFrame(fadeT); const from = music.volume, t0 = performance.now();
  const st = (now) => { const k = Math.min(1, (now - t0) / 1400); music.volume = from + (to - from) * k; if (k < 1) fadeT = requestAnimationFrame(st); else if (done) done(); };
  fadeT = requestAnimationFrame(st);
}
function setSound(v) { on = v; sound.setAttribute('aria-pressed', String(on)); if (on) { music.volume = 0; music.play().then(() => fade(0.75)).catch(() => {}); } else fade(0, () => music.pause()); }
sound.addEventListener('click', () => setSound(!on));
addEventListener('keydown', (e) => { if (e.key === 'm' || e.key === 'M') setSound(!on); });
document.addEventListener('visibilitychange', () => { if (!on) return; if (document.hidden) music.pause(); else music.play().catch(() => {}); });

// ---- The trailer.
const dlg = document.querySelector('.trailer-dialog'), tv = dlg.querySelector('video');
document.querySelectorAll('[data-trailer]').forEach((b) => b.addEventListener('click', () => { if (on) music.pause(); dlg.showModal(); tv.play().catch(() => {}); }));
const closeT = () => { tv.pause(); if (dlg.open) dlg.close(); if (on) music.play().catch(() => {}); };
dlg.querySelector('.close').addEventListener('click', closeT);
dlg.addEventListener('click', (e) => { if (e.target === dlg) closeT(); });
dlg.addEventListener('cancel', () => { tv.pause(); if (on) music.play().catch(() => {}); });

// ---- Start. (?at=<id>: land on a chapter, for links and shots; ?p=0..1: that far into it.)
layout();
const at = params.get('at');
if (at) {
  document.documentElement.style.scrollBehavior = 'auto';
  const c = chapters.find((q) => q.el.id === at);
  const y = c ? c.top + (+(params.get('p') || 0.35)) * Math.max(1, c.h - vh) : (document.getElementById(at)?.offsetTop || 0);
  scrollTo(0, y); target = shown = y;
}
requestAnimationFrame(tick);
