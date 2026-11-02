// The crowd's robes, baked (Phase 10 U6; docs/phase-10/cutscene-research.md §3 "crowd cloth baked"): our own body and cloth
// (character/wraith) run here, off the main thread, through each motion — a gated clip looped by its cross-fade, or the gait
// standing or walking in place — and every particle's position and normal is recorded at 15 fps, relative to the figure's
// root, packed to half floats (render/crowd.js plays them back on the GPU, interpolated between frames: never stepped).
// So the crowd's robes are the heroes' robes exactly. Message in: { base, n? }; out: { clips: [{ name, frames, period, speed }],
// data: Uint32Array (4 per particle per frame) } transferred.

import { Wraith } from '../character/wraith/wraith.js';
import { Performance } from '../character/performance.js';

const FPS = 15, SIM = 30, WARM = 2.5;
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
/** Float → IEEE half (round toward zero; denormals flushed). */
function half(v) {
  f32[0] = v; const x = u32[0], s = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 112, m = x & 0x7fffff;
  if (e <= 0) return s;
  if (e >= 31) return s | 0x7c00;
  return s | (e << 10) | (m >>> 13);
}

const flat = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };

/** One clip: { name, clip (motion file) | null, walk (m/s) }. */
async function bakeOne(base, spec) {
  const w = new Wraith(flat);
  w.maxSteps = 4; w.windStrength = 0.12;
  let period;
  if (spec.clip) {
    const buf = await (await fetch(base + 'motion/' + spec.clip + '.bin')).arrayBuffer();
    const P = new Performance(buf);
    P.x = 0; P.y = 0; P.z = 0; P.yaw = 0; P.xfade = 1.2; P.fade = 0;
    if (spec.hands) { const T = P.handT; T.set(spec.hands); P.handW = 0.9; P.handSpread = spec.spread || 0; }
    w.performance = P;
    period = P.length - Math.min(1.2, P.length * 0.4);
  } else period = spec.walk ? 1.0 / spec.walk * 2.4 * 3 : 9.2;   // three strides of 2.4 m, or two breaths
  const frames = Math.round(period * FPS), n = w.cloth.n;
  const out = new Uint32Array(frames * n * 4);
  let bx = 0;
  const steps = Math.round((WARM + period) * SIM);
  let k = 0;
  for (let i = 0; i <= steps && k < frames; i++) {
    const t = i / SIM;
    if (spec.walk) bx += spec.walk / SIM;
    w.bx = 0; w.by = 0; w.bz = bx; w.vx = 0; w.vz = spec.walk || 0; w.yaw = 0; w.grounded = true; w.dt = 1 / SIM; w.time = t;
    w.update();
    if (t + 1e-6 < WARM || (t - WARM) * FPS + 1e-6 < k) continue;
    const p = w.packed;
    for (let j = 0; j < n; j++) {
      const a = j * 8, o = (k * n + j) * 4;
      out[o] = half(p[a]) | (half(p[a + 1]) << 16);
      out[o + 1] = half(p[a + 2] - bx) | (half(p[a + 3]) << 16);
      out[o + 2] = half(p[a + 4]) | (half(p[a + 5]) << 16);
      out[o + 3] = half(p[a + 6]) | (half(p[a + 7]) << 16);
    }
    k++;
  }
  return { name: spec.name, frames, period, speed: spec.walk || 0, n, data: out };
}

self.onmessage = async (e) => {
  const { base, specs } = e.data;
  const res = [];
  for (const s of specs) res.push(await bakeOne(base, s));
  const n = res[0].n, total = res.reduce((a, r) => a + r.frames, 0);
  const data = new Uint32Array(total * n * 4);
  let at = 0;
  const clips = res.map((r) => { data.set(r.data, at * n * 4); const c = { name: r.name, first: at, frames: r.frames, period: r.period, speed: r.speed }; at += r.frames; return c; });
  self.postMessage({ clips, n, data }, [data.buffer]);
};
