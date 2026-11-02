// The quality gate for generated movement (docs/phase-10/motion-gate.md): no clip reaches the game unjudged, and the gate
// is itself tested by planting each fault it claims to catch in a clip it passes.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { gateClip, readClip, FIELDS, FPS } from '../tools/motion/clipGate.mjs';
import { lockFeet, closeLoop } from '../tools/motion/clipRepair.mjs';
import { Performance, CLIP_FIELDS } from '../src/character/performance.js';
import { Wraith } from '../src/character/wraith/wraith.js';
import { COLLIDER } from '../src/character/wraith/garments.js';

const dir = 'data/motion/';
const manifest = JSON.parse(readFileSync(dir + 'manifest.json', 'utf8'));
const base = readClip(dir + 'knead1.bin');
const SH = 21, EL = 27, HA = 33, FEET = 39, R = 3;

/** A copy of the clip with `fn(view, frame, offset of frame)` run on every frame in [from, to). */
function plant(fn, from = 0, to = base[0]) {
  const v = base.slice();
  for (let t = from; t < to; t++) fn(v, t, 1 + t * FIELDS);
  return v;
}
const fails = (v, o) => gateClip(v, o).failed;
const moveArm = (v, o, side, x, y, z) => { for (const k of [EL + side, HA + side]) { v[o + k] += x; v[o + k + 1] += y; v[o + k + 2] += z; } };

describe('clips in data/motion', () => {
  it('the clip format is the one the game reads', () => expect(FIELDS).toBe(CLIP_FIELDS));
  it('every file is in the manifest, and every entry has a file', () => {
    const bins = readdirSync(dir).filter((f) => f.endsWith('.bin')).map((f) => f.slice(0, -4)).sort();
    expect(Object.keys(manifest.clips).sort()).toEqual(bins);
  });
  for (const [name, c] of Object.entries(manifest.clips)) {
    it(`${name} passes the gate, unchanged since it was judged`, () => {
      const r = gateClip(readClip(`${dir}${name}.bin`), c.gate);
      expect(r.failed).toEqual([]);
      expect(createHash('sha256').update(readFileSync(`${dir}${name}.bin`)).digest('hex')).toBe(c.sha256);
    });
    it(`${name} says where it came from`, () => {
      for (const k of ['prompt', 'seed', 'model', 'repairs']) expect(c[k], k).toBeDefined();
      expect(c.model).toMatch(/^SOMA-RP v1\.1/);        // the licence was checked for this model only
    });
    it(`${name} is in the game only if someone accepted it on the robe`, () => {
      if (c.cues?.length) expect(c.eye?.film, 'a film, watched').toBeTruthy();
    });
  }
});

describe('the gate catches each fault', () => {
  it('passes the base clip', () => expect(fails(base)).toEqual([]));
  const faults = [
    ['format', () => base.slice(0, 2000)],
    ['finite', () => plant((v, t, o) => { v[o + HA] = NaN; }, 50, 51)],
    ['length', () => { const v = base.slice(0, 1 + 20 * FIELDS); v[0] = 20; return v; }],
    ['frames square', () => plant((v, t, o) => { v[o + R] *= 1.3; }, 40, 41)],
    ['frames right-handed', () => plant((v, t, o) => { for (let c = 0; c < 3; c++) v[o + 9 + c] *= -1; })],
    ['bones hold length', () => plant((v, t, o) => { for (let c = 0; c < 3; c++) v[o + HA + c] += (v[o + HA + c] - v[o + EL + c]) * 0.2; }, 60, 120)],
    ['arm matches rig', () => plant((v, t, o) => { for (const s of [0, 3]) for (let c = 0; c < 3; c++) { v[o + EL + s + c] = v[o + SH + s + c] + (v[o + EL + s + c] - v[o + SH + s + c]) * 1.4; v[o + HA + s + c] = v[o + SH + s + c] + (v[o + HA + s + c] - v[o + SH + s + c]) * 1.4; } })],
    ['leg reach', () => plant((v, t, o) => { v[o + 1] += 0.15; }, 0)],
    ['soles on the ground', () => plant((v, t, o) => { v[o + FEET + 1] += 0.05; v[o + FEET + 4] += 0.05; })],
    ['pelvis fits the rig', () => plant((v, t, o) => { for (const k of [0, SH, SH + 3, EL, EL + 3, HA, HA + 3]) v[o + k + 1] += 0.1; })],
    ['hand speed', () => plant((v, t, o) => { v[o + HA] += t % 2 ? 0.5 : 0; }, 60, 70)],
    ['foot speed', () => plant((v, t, o) => { v[o + FEET + 2] += t % 2 ? 0.4 : 0; }, 60, 70)],
    ['pelvis speed', () => plant((v, t, o) => { v[o] += t % 2 ? 0.3 : 0; }, 60, 70)],
    ['torso turn', () => plant((v, t, o) => { const a = t % 2 ? 0.3 : 0; const y = v[o + 7], z = v[o + 8], fy = v[o + 10], fz = v[o + 11]; v[o + 7] = y * Math.cos(a) - z * Math.sin(a); v[o + 8] = y * Math.sin(a) + z * Math.cos(a); v[o + 10] = fy * Math.cos(a) - fz * Math.sin(a); v[o + 11] = fy * Math.sin(a) + fz * Math.cos(a); }, 60, 64)],
    ['jitter, limbs', () => plant((v, t, o) => { v[o + HA] += (t % 2 - 0.5) * 0.006; })],
    ['jitter, frames', () => plant((v, t, o) => { v[o + 16] += (t % 2 - 0.5) * 0.012; v[o + 17] -= (t % 2 - 0.5) * 0.012; })],
    ['pops', () => plant((v, t, o) => { moveArm(v, o, 0, 0.05, 0, 0); }, 100)],
    ['neck', () => plant((v, t, o) => { for (let c = 0; c < 3; c++) { const f = v[o + 18 + c]; v[o + 18 + c] = -v[o + 12 + c]; v[o + 12 + c] = f; } })],
    ['elbow fold', () => plant((v, t, o) => { for (let c = 0; c < 3; c++) v[o + HA + c] = v[o + EL + c] + (v[o + SH + c] - v[o + EL + c]) * 0.93 + (c === 0 ? 0.01 : 0); })],
    ['through the ground', () => plant((v, t, o) => { v[o + FEET + 1] -= 0.05; }, 80, 86)],
    ['foot creep', () => plant((v, t, o) => { for (const k of [0, SH, SH + 3, EL, EL + 3, HA, HA + 3, FEET, FEET + 3]) v[o + k] += t * 0.003; })],
    ['foot slide', () => plant((v, t, o) => { v[o + FEET] += (t - 60) * 0.035; }, 60, 80)],
    ['hovering', () => plant((v, t, o) => { v[o + FEET + 1] += 0.2; v[o + FEET + 4] += 0.2; }, 60, 100)],
    ['hand or elbow in the torso', () => plant((v, t, o) => { for (let c = 0; c < 3; c++) v[o + HA + c] = v[o + c] + v[o + 6 + c] * 0.25; }, 60, 80)],
    ['hand in the head', () => plant((v, t, o) => { for (let c = 0; c < 3; c++) v[o + HA + c] = (v[o + SH + c] + v[o + SH + 3 + c]) * 0.5 + v[o + 6 + c] * 0.26; }, 60, 80)],
    ['legs through each other', () => plant((v, t, o) => { for (let c = 0; c < 3; c++) v[o + FEET + 3 + c] = v[o + FEET + c]; }, 60, 80)],
    ['tipping', () => plant((v, t, o) => { for (const k of [0, SH, SH + 3, EL, EL + 3, HA, HA + 3]) v[o + k + 2] += 0.5; }, 0)],
    ['sitting on nothing', () => plant((v, t, o) => { for (const k of [0, SH, SH + 3, EL, EL + 3, HA, HA + 3]) v[o + k + 1] -= 0.4; }, 0)],
    ['stays put', () => plant((v, t, o) => { for (let k = 0; k < 15; k++) { const i = [0, SH, SH + 3, EL, EL + 3, HA, HA + 3, FEET, FEET + 3][k % 9]; if (k < 9) v[o + i + 2] += t * 0.01; } })],
    ['frozen', () => { const v = base.slice(); const hold = v.slice(1 + 90 * FIELDS, 1 + 91 * FIELDS); for (let t = 90; t < 120; t++) v.set(hold, 1 + t * FIELDS); return v; }],
    ['alive', () => { const v = base.slice(); const hold = v.slice(1, 1 + FIELDS); for (let t = 0; t < v[0]; t++) v.set(hold, 1 + t * FIELDS); return v; }],
  ];
  for (const [id, make] of faults) it(id, () => expect(fails(make())).toContain(id));
  it('a declared sitter is not told to stand', () => {
    const v = faults.find(([id]) => id === 'sitting on nothing')[1]();
    expect(fails(v, { seated: true })).not.toContain('sitting on nothing');
  });
  it('an unlooped clip fails as a loop, at its seam', () => {
    const v = plant((c, t, o) => { for (const k of [0, SH, SH + 3, EL, EL + 3, HA, HA + 3, FEET, FEET + 3]) c[o + k] += 0.2 * (t - 150) / 89; }, 150);
    expect(fails(v)).not.toContain('loop seam, pose');
    expect(fails(v, { loop: true })).toContain('loop seam, pose');
  });
});

describe('playing through the body', () => {
  const blank = () => ({ r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, 1], hr: [1, 0, 0], hu: [0, 1, 0], hf: [0, 0, 1], px: 0, py: 0.88, pz: 0,
    sh: new Float64Array([0.2, 1.3, 0, -0.2, 1.3, 0]), el: new Float64Array([0.25, 1, 0, -0.25, 1, 0]), ha: new Float64Array([0.25, 0.75, 0, -0.25, 0.75, 0]),
    chest: [0, 0, 0], head: [0, 0, 0], out: [0, 0, 0], toWorld(x, y, z) { this.out[0] = this.px + x; this.out[1] = this.py + y; this.out[2] = this.pz + z; } });
  const gait = () => ({ px: 0, py: 0, pz: 0, fx: [0.1, -0.1], fy: [0, 0], fz: [0, 0], state: [1, 1], t: [0.5, 0.5], dirX: [0, 0], dirZ: [1, 1], evCount: 2 });
  const play = () => { const p = new Performance(base.buffer.slice(0)); p.x = 0; p.y = 0; p.z = 0; p.yaw = 0; return p; };
  it('starts from the pose the body is in, and never in one step', () => {
    const p = play(), b = blank(), g = gait();
    p.step(1 / 120); p.apply(b, g);
    expect(b.sh[1]).toBeCloseTo(1.3, 2);
    const a = blank(), q = play(); q.step(1 / 60); q.apply(a, gait());
    expect(Math.abs(a.ha[1] - 0.75)).toBeLessThan(0.02);
  });
  it('takes the feet from the gait: no false strides, no footfalls', () => {
    const p = play(), g = gait();
    p.step(1 / 60); p.apply(blank(), g);
    expect(g.state).toEqual([0, 0]);
    expect(g.evCount).toBe(0);
  });
  it('leaves as it came, and says when it has', () => {
    const p = play(); p.step(1); p.leave(0.5);
    p.step(0.25); const b = blank(); p.apply(b, gait());
    expect(p.done).toBe(false);
    p.step(0.3);
    expect(p.done).toBe(true);
    const c = blank(); p.apply(c, gait());
    expect(c.sh[1]).toBeCloseTo(1.3, 6);
  });
  it('eases a nod to what the hood can follow, and keeps the head square', () => {
    const down = 1.2, c = Math.cos(down), s = Math.sin(down);
    const v = plant((x, t, o) => { x[o + 15] = 0; x[o + 16] = c; x[o + 17] = s; x[o + 18] = 0; x[o + 19] = -s; x[o + 20] = c; });
    const p = new Performance(v.buffer.slice(0)), b = blank(); p.x = 0; p.y = 0; p.z = 0; p.yaw = 0;
    p.step(2); p.apply(b, gait());
    const nod = Math.atan2(-b.hf[1], b.hf[2]);
    expect(nod).toBeGreaterThan(0.45);
    expect(nod).toBeLessThanOrEqual(0.6);
    expect(Math.abs(b.hf[0] * b.hu[0] + b.hf[1] * b.hu[1] + b.hf[2] * b.hu[2])).toBeLessThan(1e-6);
    expect(p.tuck).toBeGreaterThan(0.5);
  });
  it('leaves a nod the hood can follow as it is', () => {
    const p = play(), b = blank(); p.step(0.05); p.weight = 1; p.tuck = 0;
    const down = 0.2, c = Math.cos(down), s = Math.sin(down);
    b.hf[1] = -s; b.hf[2] = c; b.hu[1] = c; b.hu[2] = s;
    p._neck(b);
    expect(Math.atan2(-b.hf[1], b.hf[2])).toBeCloseTo(0.2, 9);
  });
  it('allocates nothing per frame', () => {
    const p = play(), b = blank(), g = gait();
    p.loop = true;
    for (let i = 0; i < 100000; i++) { p.step(1 / 60); p.apply(b, g); }     // past the warm-up: unoptimised code boxes its numbers
    const h0 = process.memoryUsage().heapUsed;
    for (let i = 0; i < 100000; i++) { p.step(1 / 60); p.apply(b, g); }
    expect(process.memoryUsage().heapUsed - h0).toBeLessThan(200000);
  });
});

describe('repairs', () => {
  it('a closed loop passes at its seam and keeps its bones', () => {
    const v = closeLoop(base);
    expect(v[0]).toBe(base[0] - Math.round(0.7 * FPS));
    expect(fails(v, { loop: true })).toEqual([]);
  });
  it('the foot lock stops a planted foot sliding and moves nothing else', () => {
    const v = plant((c, t, o) => { c[o + FEET] += Math.sin(t * 0.2) * 0.02; });
    const fixed = lockFeet(v);
    let far = 0;
    for (let t = 1; t < v[0]; t++) far = Math.max(far, Math.abs(fixed[1 + t * FIELDS + FEET] - fixed[1 + (t - 1) * FIELDS + FEET]));
    expect(far).toBeLessThan(0.0015);
    for (let i = 1 + FIELDS; i < 1 + 2 * FIELDS; i++) if (i - 1 - FIELDS < FEET) expect(fixed[i]).toBe(v[i]);
  });
  it('a loop plays through its join without a step or a kink', () => {
    const v = closeLoop(base), p = new Performance(v.buffer.slice(0)), dt = 1 / 240;
    p.loop = true;
    const L = (v[0] - 1) / FPS;
    p.t = L - 0.25;
    let last = null, lastD = 0, worst = 0;
    for (let i = 0; i < 120; i++) {
      p.step(dt);
      const x = p.s[HA + 1];
      if (last !== null) { const d = x - last; if (i > 1) worst = Math.max(worst, Math.abs(d - lastD)); lastD = d; }
      last = x;
    }
    expect(worst).toBeLessThan(0.00015);      // m per step²: the curve's tangent is continuous across the join
  });
  it('a clip does not loop unless it is asked to', () => expect(new Performance(base.buffer.slice(0)).loop).toBe(false));
});

describe('the robe in a clip', () => {
  const figure = () => { const ground = { qx: 0, qz: 0, h: 0, sample() {} }, w = new Wraith(ground); w.dt = 1 / 60; w.update(); return w; };
  const clip = () => { const p = new Performance(base.buffer.slice(0)); p.x = 0; p.y = 0; p.z = 0; p.yaw = 0; p.step(0); return p; };
  const pose = (w) => Array.from(w.cloth.p.subarray(0, w.cloth.n * 3));
  it('pays for the mantle-over-sleeve colliders only during a clip', () => {
    const w = figure();
    expect(w.cloth.colN).toBe(COLLIDER.OVER_UPPER_L);
    w.performance = clip(); w.update();
    expect(w.cloth.colN).toBe(COLLIDER.OVER_FORE_R + 1);
    w.performance = null; w.update();
    expect(w.cloth.colN).toBe(COLLIDER.OVER_UPPER_L);
  });
  it('holds every collider it asks for, and no bad numbers follow', () => {
    const w = figure();
    expect(w.cloth.col.length / 7).toBeGreaterThanOrEqual(COLLIDER.OVER_FORE_R + 1);
    w.performance = clip();
    for (let i = 0; i < 120; i++) w.update();
    expect(w.performance.weight).toBeGreaterThan(0.9);
    expect(pose(w).every(Number.isFinite)).toBe(true);
  });
});
