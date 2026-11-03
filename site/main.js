// The site's behaviour: reveals as lines come into view; each film plays only while it is on screen (and loads only when it
// first comes near); the snow you write in; the music, off until asked for (M); the trailer in a dialog; a note when the
// browser can't run the game.

import { createSnow } from './snow.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// ?at=<section id>: jump straight there (for shots and links that must land exactly).
const at = new URLSearchParams(location.search).get('at');
if (at) { document.documentElement.style.scrollBehavior = 'auto'; addEventListener('load', () => document.getElementById(at)?.scrollIntoView()); }
// ?solo=<section id>: that section alone at the top (screenshots of one beat).
const solo = new URLSearchParams(location.search).get('solo');
if (solo) document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
if (solo) for (const el of document.querySelectorAll('main > section, main > .chapters > article, .chapters')) {
  if (el.id !== solo && !el.querySelector('#' + solo)) el.style.display = 'none';
}

// Reveals.
const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }, { threshold: 0.2 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// Films: load when near, play while visible (the hero plays at once).
const films = [...document.querySelectorAll('video[data-src]')];
const near = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting && !e.target.src) { e.target.src = e.target.dataset.src; e.target.load(); }
}, { rootMargin: '120% 0px' });
const seen = new IntersectionObserver((es) => {
  for (const e of es) { const v = e.target; if (e.isIntersecting && !reduced) v.play().catch(() => {}); else v.pause(); }
}, { threshold: 0.15 });
films.forEach((v) => { near.observe(v); seen.observe(v); });
if (reduced) document.querySelectorAll('video[autoplay]').forEach((v) => { v.removeAttribute('autoplay'); v.pause(); });

// The snow.
const snowSec = document.querySelector('.snow'), canvas = document.querySelector('.snow-canvas');
let snow = null;
try { snow = createSnow(canvas, { reducedMotion: reduced }); } catch (e) { console.error('snow:', e && e.message); }
if (!snow) snowSec.classList.add('no-gl');
else {
  let demoed = false;
  new IntersectionObserver((es) => {
    for (const e of es) {
      if (e.isIntersecting) {
        snow.start();
        // The first time: the world writes a line itself, to show what it does (a slow S across the near snow).
        if (!demoed) { demoed = true; const pts = []; for (let i = 0; i <= 60; i++) { const u = i / 60; pts.push([0.28 + 0.5 * u, 0.62 - 0.07 * Math.sin(u * Math.PI * 2)]); } setTimeout(() => snow.demo(pts), 700); }
      } else snow.stop();
    }
  }, { threshold: 0.05 }).observe(snowSec);
}

// The music: off until asked for; M toggles; paused when the tab is hidden.
const music = document.querySelector('.music'), sound = document.querySelector('.sound'), label = sound.querySelector('.sound-label');
let on = false;
const setSound = (v) => {
  on = v; sound.setAttribute('aria-pressed', String(on)); label.textContent = on ? 'Sound on' : 'Sound off';
  if (on) { music.volume = 0; music.play().then(() => fade(0.7)).catch(() => {}); } else fade(0, () => music.pause());
};
let fadeT = 0;
function fade(to, done) {
  cancelAnimationFrame(fadeT);
  const from = music.volume, t0 = performance.now();
  const step = (now) => { const k = Math.min(1, (now - t0) / 1200); music.volume = from + (to - from) * k; if (k < 1) fadeT = requestAnimationFrame(step); else if (done) done(); };
  fadeT = requestAnimationFrame(step);
}
sound.addEventListener('click', () => setSound(!on));
window.addEventListener('keydown', (e) => { if ((e.key === 'm' || e.key === 'M') && !e.target.closest('input, textarea')) setSound(!on); });
document.addEventListener('visibilitychange', () => { if (document.hidden && on) music.pause(); else if (!document.hidden && on) music.play().catch(() => {}); });

// The trailer.
const dlg = document.querySelector('.trailer-dialog'), tv = dlg.querySelector('video');
document.querySelectorAll('[data-trailer]').forEach((b) => b.addEventListener('click', () => {
  if (on) music.pause();
  dlg.showModal(); tv.play().catch(() => {});
}));
const closeT = () => { tv.pause(); dlg.close(); if (on) music.play().catch(() => {}); };
dlg.querySelector('.close').addEventListener('click', closeT);
dlg.addEventListener('click', (e) => { if (e.target === dlg) closeT(); });
dlg.addEventListener('cancel', () => { tv.pause(); if (on) music.play().catch(() => {}); });

// The game needs WebGPU: say so beside the button if this browser can't.
if (!('gpu' in navigator)) document.querySelector('.gpu-note').hidden = false;
