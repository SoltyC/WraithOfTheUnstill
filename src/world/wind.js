// The wind field (PLAN.md Phase 8 M1). One deterministic function of place and time, evaluated
// identically on the CPU (cloth, sound, glide) and on the GPU (grass, trees, ground cover, motes:
// shaders/wind.wgsl.js), so what the cloth feels is what the grass shows. It is:
//   base      the prevailing wind: climatology direction at the player (eased) × strength
//             (weather × restoration — 0 while stilled — plus the Warden's gusts)
//   fronts    wide gust bands moving downwind at FRONT_SPEED (two families with different spacing
//             and a slow wander along them), their height set by the weather's gustiness
//   eddies    small, slow turbulence
//   bursts    up to MAX_BURSTS injected local gusts (the Gale verbs; anything else may inject):
//             an expanding ring from a point that pushes outward and dies away
// The owner (systems/environment.js) sets the inputs once per frame; the uniform block (`block`,
// 6 × vec4) is shared by reference with every material that declares `windField`.
// Allocation-free.

export const FRONT_SPEED = 8;     // m/s
export const MAX_BURSTS = 4;
const BURST_SPEED = 14, BURST_LIFE = 2.2, BURST_WIDTH = 5;

/** Smooth front profile of a phase (radians): sharp-ish rises, long tails. Mirrors the WGSL. */
function front(ph) { const s = 0.5 + 0.5 * Math.sin(ph); return s * s * s * s; } // inlined (tiny)

export function createWind() {
  // [0] dir x, dir z, base strength, time; [1] gustiness, front speed, -, -; [2..5] bursts:
  // x, z, start time, strength (strength 0 = none).
  const block = new Array(24).fill(0);
  block[0] = 1; block[5] = FRONT_SPEED;
  let next = 0;
  const w = {
    block,
    /** Owner inputs, set each frame before update(). */
    dirX: 1, dirZ: 0, strength: 0.5 - 0.5, gustiness: 0.5 - 0.5, time: 0.5,
    update() {
      const l = Math.sqrt(this.dirX * this.dirX + this.dirZ * this.dirZ) || 1;
      block[0] = this.dirX / l; block[1] = this.dirZ / l; block[2] = this.strength; block[3] = this.time;
      block[4] = this.gustiness;
      for (let i = 0; i < MAX_BURSTS; i++) { const o = 8 + i * 4; if (block[o + 3] > 0 && this.time - block[o + 2] > BURST_LIFE) block[o + 3] = 0; }
    },
    /** A local gust: an expanding ring from (x, z) pushing outward (the Gale's Gust, the Warden). */
    burst(x, z, strength) {
      const o = 8 + next * 4; next = (next + 1) % MAX_BURSTS;
      block[o] = x; block[o + 1] = z; block[o + 2] = this.time; block[o + 3] = strength;
    },
    /** Out fields of sample(): the wind at the queried point — direction (unit) and speed factor. */
    sx: 0.5, sz: 0.5, outX: 0.5, outZ: 0.5, speed: 0.5,
    /** The wind at (sx, sz) now: outX, outZ (unit direction) and speed (≈ strength × gusts). */
    sample() { fieldAt(block, this); },
  };
  return w;
}

/** The field at (x, z) from a block into o.outX/outZ/speed (tests, cold paths). */
export function sampleInto(b, x, z, o) { o.sx = x; o.sz = z; fieldAt(b, o); }

/** The field at (o.sx, o.sz) into o.outX/outZ/speed (mirrors windField() in the WGSL). Takes no
 *  doubles as arguments (they box when the call is not inlined: the hot path allocated). */
function fieldAt(b, o) {
  const x = o.sx, z = o.sz;
  const dx = b[0], dz = b[1], base = b[2], t = b[3], gu = b[4], c = b[5];
  const along = x * dx + z * dz, across = -x * dz + z * dx;
  // Two families of fronts, each wandering a little along its length.
  const f1 = front((along - c * t) * 0.045 + Math.sin(across * 0.013 + t * 0.05) * 1.2);
  const f2 = front((along - c * 1.2 * t) * 0.11 + 1.7 + Math.sin(across * 0.031 - t * 0.07) * 0.9);
  const eddy = 0.12 * Math.sin(x * 0.21 + t * 1.3) * Math.sin(z * 0.17 - t * 1.1);
  const g = 0.55 + gu * (0.9 * f1 + 0.5 * f2) + eddy;
  let vx = dx * base * g, vz = dz * base * g;
  for (let i = 0; i < 4; i++) {
    const k = 8 + i * 4, s = b[k + 3]; if (s <= 0) continue;
    const age = t - b[k + 2]; if (age < 0 || age > BURST_LIFE) continue;
    const rx = x - b[k], rz = z - b[k + 1], d = Math.sqrt(rx * rx + rz * rz);
    const q = (d - BURST_SPEED * age) / BURST_WIDTH, ring = Math.exp(-q * q);
    const fade = (1 - age / BURST_LIFE) * (1 - age / BURST_LIFE) / (1 + d * 0.02);
    const m = s * ring * fade / Math.max(d, 0.5);
    vx += rx * m; vz += rz * m;
  }
  const sp = Math.sqrt(vx * vx + vz * vz);
  if (sp > 1e-5) { o.outX = vx / sp; o.outZ = vz / sp; } else { o.outX = dx; o.outZ = dz; }
  o.speed = sp;
}
