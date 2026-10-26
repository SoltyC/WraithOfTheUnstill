import { describe, it, expect } from 'vitest';
import { createGaleBending, gustTuning, vortexTuning, updraftTuning, draftEnvelope, GALE_FX_VEC4 } from '../src/game/bending/gale.js';
import { SPELL_LIGHTS } from '../src/game/bending/frost.js';
import { BRUSH } from '../src/shaders/terrainState.wgsl.js';

const DT = 1 / 60;

function rig(lightBase = 0) {
  const stamps = [], bursts = [];
  const ts = { bx: 0, bz: 0, bdx: 0, bdz: 0, bl: 0, bw: 0, bd: 0, bc: 0, bk: 0, bwet: 0, bbias: 0, bberm: 0,
    stamp() { stamps.push({ k: this.bk, x: this.bx, z: this.bz, l: this.bl, w: this.bw, d: this.bd, c: this.bc, berm: this.bberm }); this.bk = 0; } };
  const ground = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
  const wind = { burst(x, z, s) { bursts.push({ x, z, s }); } };
  const lights = new Float32Array(32);
  const g = createGaleBending({ ts, ground, wind, lights });
  g.x = 0; g.y = 0; g.z = 0; g.aimX = 1; g.aimZ = 0; g.tx = 8; g.ty = 0; g.tz = 0; g.lightBase = lightBase; g.time = 0;
  const run = (seconds, each) => { const n = Math.round(seconds / DT); for (let i = 0; i < n; i++) { if (each) each(i * DT); g.dt = DT; g.time += DT; g.update(); } };
  return { g, stamps, bursts, lights, run };
}

describe('Gust', () => {
  it('lances along the aim, widening, with wind bursts, then clears', () => {
    const r = rig();
    r.g.castGust = true;
    r.run(1.2);
    const f = r.stamps.filter((s) => s.k === BRUSH.FLATTEN);
    expect(f.length).toBeGreaterThan(10);
    const far = Math.max(...f.map((s) => s.x + s.l));
    expect(far).toBeGreaterThan(gustTuning.range * 0.9);
    expect(far).toBeLessThan(gustTuning.range + 1.5);
    expect(f.every((s) => Math.abs(s.z) < 1e-9)).toBe(true);
    for (let i = 1; i < f.length; i++) expect(f[i].x).toBeGreaterThan(f[i - 1].x);
    expect(f[0].w).toBeLessThan(gustTuning.halfWidth0 + 0.3);
    expect(f[f.length - 1].w).toBeGreaterThan(gustTuning.halfWidth1 * 0.9);
    expect(f[f.length - 1].w).toBeLessThanOrEqual(gustTuning.halfWidth1 + 1e-9);
    expect(r.bursts.length).toBeGreaterThan(3);
    expect(r.bursts.every((b) => b.s > 0 && b.x > 0)).toBe(true);
    expect(r.g.gustActive[0]).toBe(0);
  });
  it('is active mid-flight and gustId increments per cast', () => {
    const r = rig();
    r.g.castGust = true;
    r.run(0.3);
    expect(r.g.gustActive[0]).toBe(1);
    expect(r.g.gustHW[0]).toBeGreaterThan(0);
    const id1 = r.g.gustId[0];
    r.run(1.2);
    r.g.castGust = true;
    r.run(DT);
    const ids = Array.from(r.g.gustId);
    expect(Math.max(...ids)).toBeGreaterThan(id1);
    r.g.castGust = true;
    r.run(DT);
    expect(new Set(Array.from(r.g.gustId).filter((v) => v > 0)).size).toBeGreaterThanOrEqual(2);
  });
});

describe('Vortex', () => {
  it('grows to full within grow, strips at the (clamped) aim, settles after release', () => {
    const r = rig();
    r.g.vortexHeld = true; r.g.tx = 40; r.g.tz = 0;
    r.run(vortexTuning.grow + 0.05);
    expect(r.g.vortexStrength).toBe(1);
    const s = r.stamps.filter((q) => q.k === BRUSH.STRIP);
    expect(s.length).toBeGreaterThan(0);
    expect(Math.max(...s.map((q) => q.x))).toBeLessThanOrEqual(vortexTuning.maxRange + 1e-9);
    expect(r.g.vortexX).toBeCloseTo(vortexTuning.maxRange, 3);
    expect(s[0].w).toBe(vortexTuning.radius);
    r.g.vortexHeld = false;
    r.run(0.3);
    expect(r.g.vortexStrength).toBeGreaterThan(0.3);  // not a snap
    r.run(vortexTuning.settle + 0.05);
    expect(r.g.vortexStrength).toBe(0);
    const n = r.stamps.length;
    r.run(1);
    expect(r.stamps.length).toBe(n);
  });
  it('drifts toward a moved aim without jumping', () => {
    const r = rig();
    r.g.vortexHeld = true; r.g.tx = 4; r.g.tz = 0;
    r.run(0.8);
    expect(r.g.vortexX).toBeCloseTo(4, 1);
    r.g.tz = 10;
    let prev = r.g.vortexZ, maxStep = 0;
    r.run(1, () => { maxStep = Math.max(maxStep, Math.abs(r.g.vortexZ - prev)); prev = r.g.vortexZ; });
    expect(maxStep).toBeLessThan(0.5);
    expect(r.g.vortexZ).toBeGreaterThan(5);
    r.run(3);
    expect(r.g.vortexZ).toBeCloseTo(10, 0);
  });
});

describe('Updraft', () => {
  it('sets the event for one frame, stamps one ring and bursts the wind', () => {
    const r = rig();
    r.g.castUpdraft = true;
    r.run(DT);
    expect(r.g.updraftEvent).toBe(true);
    expect(r.g.updraftX).toBeCloseTo(8);
    const ring = r.stamps.filter((s) => s.k === BRUSH.STRIP);
    expect(ring.length).toBe(1);
    expect(ring[0].w).toBe(updraftTuning.radius);
    expect(ring[0].d).toBe(updraftTuning.ring);
    expect(r.bursts.length).toBe(1);
    r.run(DT);
    expect(r.g.updraftEvent).toBe(false);
    expect(r.stamps.filter((s) => s.k === BRUSH.STRIP).length).toBe(1);
  });
  it('lifts above gravity on the axis, nowhere outside, above or after its life', () => {
    const r = rig();
    r.g.castUpdraft = true;
    r.run(0.4);
    const T = updraftTuning;
    expect(r.g.liftAt(8, 0.5, 0)).toBeGreaterThan(24);
    expect(r.g.liftAt(8 + T.radius * 1.3 + 0.1, 0.5, 0)).toBe(0);
    expect(r.g.liftAt(8, T.height + 0.5, 0)).toBe(0);
    expect(r.g.liftAt(8, 0.5, 0)).toBeGreaterThan(r.g.liftAt(8 + T.radius, 0.5, 0));
    expect(r.g.liftAt(8 + 1.3, 0.5, 0)).toBeGreaterThan(24);           // a full core: 1.3 m off the axis still rises
    r.run(T.life + 0.2);
    expect(r.g.liftAt(8, 0.5, 0)).toBe(0);
  });
  it('draftEnvelope starts at 0, peaks at 1 and ends at 0', () => {
    const T = updraftTuning;
    expect(draftEnvelope(0)).toBe(0);
    let peak = 0;
    for (let a = 0; a <= T.life; a += 0.01) peak = Math.max(peak, draftEnvelope(a));
    expect(peak).toBeCloseTo(1, 2);
    expect(draftEnvelope(T.life)).toBeCloseTo(0, 6);
    expect(draftEnvelope(T.life + 1)).toBe(0);
    expect(draftEnvelope(-1)).toBe(0);
  });
});

describe('lights and allocation', () => {
  it('writes slots from lightBase, never above SPELL_LIGHTS, leaving lower slots alone', () => {
    const r = rig(2);
    for (let i = 0; i < 16; i++) r.lights[i] = 7;
    r.g.vortexHeld = true; r.g.castGust = true;
    r.run(0.1);
    r.g.castUpdraft = true;
    r.run(0.2);
    for (let i = 0; i < 16; i++) expect(r.lights[i]).toBe(7);
    let lit = 0;
    for (let s = 2; s < SPELL_LIGHTS; s++) if (r.lights[s * 8 + 7] > 0) lit++;
    expect(lit).toBeGreaterThan(0);
    for (let i = SPELL_LIGHTS * 8; i < 32; i++) expect(r.lights[i]).toBe(0);
  });
  it('keeps one fx Float32Array of GALE_FX_VEC4*4 and a stable shape', () => {
    const r = rig();
    const fx = r.g.fx, keys = Object.keys(r.g).join();
    expect(fx).toBeInstanceOf(Float32Array);
    expect(fx.length).toBe(GALE_FX_VEC4 * 4);
    r.g.castGust = true; r.g.vortexHeld = true; r.g.castUpdraft = true;
    r.run(1);
    expect(r.g.fx).toBe(fx);
    expect(Object.keys(r.g).join()).toBe(keys);
    expect(fx[27]).toBeGreaterThan(0);
  });
});
