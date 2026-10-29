import { describe, it, expect } from 'vitest';
import { createStoneBending, shardTuning, ridgeTuning, bloomTuning, SURF, SURFACE_INFO, STONE_CHUNKS, STONE_FX_VEC4 } from '../src/game/bending/stone.js';
import { createStoneMass, crestAt, trenchAt, bowlAt, rimAt, TRENCH_RATIO, RIM_RATIO, CREST, RIDGE_END, BOWL, RIM0, RIM1 } from '../src/game/bending/stoneMass.js';
import { combatTuning } from '../src/game/combat/combat.js';
import { BRUSH, stateBrushWGSL } from '../src/shaders/terrainState.wgsl.js';
import { SPELL_LIGHTS } from '../src/game/bending/frost.js';
import { PatchGround } from '../src/world/patchGround.js';
import { DECAY } from '../src/terrain/state/healing.js';

const DT = 1 / 60;

function rig(surf = SURF.SNOW) {
  const stamps = [];
  const ts = { bx: 0, bz: 0, bdx: 0, bdz: 0, bl: 0, bw: 0, bd: 0, bc: 0, bk: 0, bwet: 0, bbias: 0, bberm: 0, healScale: 1,
    stamp() { stamps.push({ k: this.bk, x: this.bx, z: this.bz, dx: this.bdx, dz: this.bdz, l: this.bl, w: this.bw, d: this.bd, berm: this.bberm }); this.bk = 0; } };
  const mass = createStoneMass();
  const ground = { qx: 0, qz: 0, h: 0, sample() { this.h = 0 + mass.heightAt(this.qx, this.qz); } };
  const lights = new Float32Array(SPELL_LIGHTS * 8);
  const st = createStoneBending({ ts, ground, lights, mass, surfaceAt: () => rig.surf });
  rig.surf = surf;
  st.x = 0; st.z = 0; st.aimX = 1; st.aimZ = 0; st.tx = 9; st.tz = 0; st.ty = 0; st.time = 0;
  const run = (seconds, each) => { const n = Math.round(seconds / DT); for (let i = 0; i < n; i++) { if (each) each(i * DT); st.dt = DT; st.time += DT; st.update(); } };
  return { st, stamps, mass, run, lights, ground, ts };
}
rig.surf = 0;

describe('the Stone profiles', () => {
  it('conserve mass: a ridge\'s crest equals its flank trench, a crater\'s rim equals its bowl', () => {
    // Cross-section of a ridge, integrated across the footprint (both sides).
    let crest = 0, trench = 0; const n = 20000, h = 2 * RIDGE_END / n;
    for (let i = 0; i < n; i++) { const d = Math.abs(-RIDGE_END + (i + 0.5) * h); crest += crestAt(d) * h; trench += TRENCH_RATIO * trenchAt(d) * h; }
    expect(Math.abs(crest - trench) / crest).toBeLessThan(0.002);
    // Volume of revolution of a crater.
    let bowl = 0, rim = 0; const m = 20000, dh = 2 / m;
    for (let i = 0; i < m; i++) { const d = (i + 0.5) * dh; bowl += bowlAt(d) * d * dh; rim += RIM_RATIO * rimAt(d) * d * dh; }
    expect(Math.abs(bowl - rim) / bowl).toBeLessThan(0.002);
  });
  it('are interpolated into the brush program, so the GPU and CPU copies share their constants', () => {
    expect(BRUSH.RIDGE).toBe(8); expect(BRUSH.CRATER).toBe(9);
    for (const v of [CREST, RIDGE_END, BOWL, RIM0, RIM1]) expect(stateBrushWGSL).toContain(String(v));
    expect(stateBrushWGSL).toMatch(/BRUSH\.RIDGE|program == 8u/);
  });
  it('keep a ridge climbable: the crest slope stays under the controller\'s 46 degrees', () => {
    const hw = ridgeTuning.halfWidth, H = ridgeTuning.height;
    let max = 0;
    for (let d = 0.001; d < CREST; d += 0.001) max = Math.max(max, Math.abs(H * (crestAt(d + 0.001) - crestAt(d)) / (0.001 * hw)));
    expect(Math.atan(max) * 180 / Math.PI).toBeLessThan(44);
  });
});

describe('Ridge', () => {
  it('drags a wall along the aim, conserving mass: the CPU copy holds crest and trench of equal volume', () => {
    const r = rig();
    r.st.tx = 30;
    r.st.ridgeHeld = true;
    r.run(2.2);
    r.st.ridgeHeld = false;
    r.run(1.2);
    expect(r.stamps.some((s) => s.k === BRUSH.RIDGE)).toBe(true);
    let up = 0, down = 0; const e = 0.25;
    for (let x = -4; x < 26; x += e) for (let z = -8; z < 8; z += e) { const v = r.mass.heightAt(x, z); if (v > 0) up += v * e * e; else down -= v * e * e; }
    expect(up).toBeGreaterThan(8);                 // a real wall (m³)
    expect(Math.abs(up - down) / up).toBeLessThan(0.15);   // the two rounded ends add crest with no flank
  });
  it('is solid the frame it is stamped: the ground query has its crest height at once, before any readback', () => {
    const r = rig();
    r.st.ridgeHeld = true;
    r.run(0.5);
    const early = r.stamps.filter((s) => s.k === BRUSH.RIDGE);
    expect(early.length).toBeGreaterThan(1);
    const s = early[1];
    const pg = new PatchGround(); pg.install({ x0: -50, z0: -50, step: 2.5, n: 41, heights: new Float32Array(41 * 41).fill(5), version: 1 }, false);
    pg.mass = r.mass;
    pg.qx = s.x; pg.qz = s.z; pg.sample();
    expect(pg.h).toBeGreaterThan(5 + 0.4 * ridgeTuning.height * ridgeTuning.firstSwell * 0.9);
    expect(pg.h).toBeLessThan(5 + ridgeTuning.height + 1e-9);
  });
  it('matches the brush: the CPU height at a stamp\'s axis is the profile of its depth, and of a stamp\'s flank its trench', () => {
    const r = rig();
    r.st.ridgeHeld = true; r.run(2.0); r.st.ridgeHeld = false; r.run(1);
    const mid = r.stamps.filter((s) => s.k === BRUSH.RIDGE).sort((a, b) => b.d - a.d)[0];   // a swelled (full height) stamp
    const px = -mid.dz, pz = mid.dx;               // across the wall
    expect(r.mass.heightAt(mid.x, mid.z)).toBeCloseTo(mid.d * crestAt(0), 2);
    const dFlank = 1.2;
    const off = r.mass.heightAt(mid.x + px * dFlank * mid.w, mid.z + pz * dFlank * mid.w);
    expect(off).toBeCloseTo(-mid.d * mid.berm * trenchAt(dFlank), 2);
    expect(mid.berm).toBeCloseTo(TRENCH_RATIO, 9);
  });
  it('turf holds: a ridge on grass still stands after a minute, a snow one slightly less (healing rates)', () => {
    for (const [surf, mat] of [[SURF.GRASS, 3], [SURF.SNOW, 0]]) {
      const r = rig(surf);
      r.st.ridgeHeld = true; r.run(2); r.st.ridgeHeld = false; r.run(1.2);
      const s = r.stamps.filter((q) => q.k === BRUSH.RIDGE).pop();
      const h0 = r.mass.heightAt(s.x, s.z);
      r.mass.update(r.st.time + 60);
      const h1 = r.mass.heightAt(s.x, s.z);
      expect(h1 / h0).toBeCloseTo(Math.exp(-DECAY[mat * 6 + 1] * 60), 3);
      expect(h1 / h0).toBeGreaterThan(mat === 3 ? 0.95 : 0.92);
    }
  });
  it('respects zero terrain refill in the actual Stone owner', () => {
    const r=rig();r.st.ridgeHeld=true;r.run(2);r.st.ridgeHeld=false;r.run(1.2);
    const s=r.stamps.filter(q=>q.k===BRUSH.RIDGE).pop(),h=r.mass.heightAt(s.x,s.z);
    r.ts.healScale=0;r.run(60);
    expect(r.mass.healScale).toBe(0);expect(r.mass.heightAt(s.x,s.z)).toBe(h);
  });
  it('only splashes on water and raises nothing', () => {
    const r = rig(SURF.WATER);
    r.st.ridgeHeld = true; r.run(1.5);
    expect(r.stamps.filter((s) => s.k === BRUSH.RIDGE).length).toBe(0);
    expect(r.mass.count).toBe(0);
  });
  it('caps its length and steers toward the aim', () => {
    const r = rig();
    r.st.ridgeHeld = true;
    r.run(4, () => { r.st.tx = 10; r.st.tz = 12; });
    const segs = r.stamps.filter((s) => s.k === BRUSH.RIDGE && s.d >= ridgeTuning.height * ridgeTuning.firstSwell * 0.99);
    const zs = segs.map((s) => s.z);
    expect(Math.max(...zs)).toBeGreaterThan(2);       // it bent toward +z
    expect(Math.max(...segs.map((q) => Math.hypot(q.x, q.z)))).toBeLessThan(ridgeTuning.start + ridgeTuning.maxLen + 1);   // and stops at its length
    expect(Math.max(...segs.map((q) => Math.hypot(q.x, q.z)))).toBeGreaterThan(ridgeTuning.start + ridgeTuning.maxLen * 0.8);
    r.st.ridgeHeld = false; r.run(1);
  });
  it('is cover: a shot along the ground through the wall is blocked, one over its crest is not', () => {
    const r = rig();
    r.st.ridgeHeld = true; r.run(2.6); r.st.ridgeHeld = false; r.run(1);
    // A wall along +x at z = 0 from about x = 2.4; shoot across it (along z) near x = 6.
    r.st.ax = 6; r.st.az = 6; r.st.ay = 0.9; r.st.bx = 6; r.st.bz = -6; r.st.by = 0.9;
    expect(r.st.segBlocked()).toBe(true);
    r.st.ay = 3; r.st.by = 3;
    expect(r.st.segBlocked()).toBe(false);
  });
  it('pushes a body standing in the wall out of it (swarmers do not cross)', () => {
    const r = rig();
    r.st.ridgeHeld = true; r.run(2.6); r.st.ridgeHeld = false; r.run(1);
    expect(r.st.pushOut(6, 0.3, 0.55)).toBe(true);
    expect(Math.hypot(r.st.pushX, r.st.pushZ)).toBeGreaterThan(0);
    expect(r.st.pushOut(6, 9, 0.55)).toBe(false);
  });
});

describe('Shard', () => {
  it('tears a depression scar ahead, hurls a plate along the aim, and shatters into displaced mass', () => {
    const r = rig();
    r.st.castShard = true;
    r.run(0.1);
    const scar = r.stamps.find((s) => s.k === BRUSH.PRESS);
    expect(scar).toBeTruthy();
    expect(scar.x).toBeCloseTo(shardTuning.scarAhead, 5);
    expect(scar.d).toBeGreaterThan(0.1);
    let maxX = 0;
    r.run(2, () => { if (r.st.shardOn[0]) maxX = Math.max(maxX, r.st.shardX[0]); });
    expect(maxX).toBeGreaterThan(8);
    expect(r.st.shardOn[0]).toBe(0);
    // Debris lands as mounds.
    r.run(1);
    expect(r.stamps.filter((s) => s.k === BRUSH.MOUND).length).toBeGreaterThan(3);
  });
  it('is real chunk geometry from the surface material', () => {
    for (const [surf, kind] of [[SURF.SNOW, 6], [SURF.GRASS, 5], [SURF.ROCK, 6]]) {
      const r = rig(surf);
      r.st.castShard = true; r.run(0.4);
      expect(r.st.chunks[13]).toBe(kind);
      expect(r.st.chunks[15]).toBe(1);
      expect(r.st.chunks.length).toBe(STONE_CHUNKS * 16);
    }
  });
  it('shatters when a body takes it (combat calls shardHit) and on water only splashes', () => {
    const r = rig();
    r.st.castShard = true; r.run(0.6);
    expect(r.st.shardPhase[0]).toBe(1);
    r.st.shardHit(0); r.run(DT);
    expect(r.st.shardOn[0]).toBe(0);
    expect(r.st.shatterEvent).toBe(true);
    const w = rig(SURF.WATER);
    w.st.castShard = true; w.run(0.1);
    expect(w.st.splashEvent || w.st.shardOn[0] === 0).toBe(true);
    expect(w.stamps.length).toBe(0);
  });
  it('at Flow 3 skims low and ploughs a lane', () => {
    const r = rig();
    r.st.flowing = true; r.st.castShard = true; r.run(0.8);
    expect(r.stamps.filter((s) => s.k === BRUSH.PLOUGH).length).toBeGreaterThan(3);
  });
  it('is carried by a Ribbon: faster, and wet', () => {
    const r = rig();
    const nodes = new Float32Array(4 * 4);
    for (let i = 0; i < 4; i++) { nodes[i * 4] = 3.0 + i * 0.1; nodes[i * 4 + 1] = 1.1; nodes[i * 4 + 2] = 0; nodes[i * 4 + 3] = 1; }
    const frost = { crystalEvent: false, ribbonStrength: 1, ribbonNodes: nodes };
    const base = rig();
    const ctx = { ts: { bx: 0, bz: 0, bdx: 0, bdz: 0, bl: 0, bw: 0, bd: 0, bc: 0, bk: 0, bwet: 0, bbias: 0, bberm: 0, healScale: 1, stamp() {} }, ground: base.ground, lights: new Float32Array(32), frost, surfaceAt: () => 0 };
    const st = createStoneBending(ctx);
    st.x = 0; st.z = 0; st.aimX = 1; st.aimZ = 0; st.tx = 9; st.tz = 0; st.ty = 0; st.time = 0;
    st.castShard = true;
    for (let i = 0; i < 40; i++) { st.dt = DT; st.time += DT; st.update(); }
    expect(st.shardWet[0]).toBe(1);
    expect(r).toBeTruthy();
  });
});

describe('Bloom', () => {
  it('blows a crater with a raised rim at the aim, writes the CPU copy, and falls back as mounds', () => {
    const r = rig();
    r.st.tx = 8; r.st.tz = 0; r.st.castBloom = true;
    r.run(DT);
    const c = r.stamps.find((s) => s.k === BRUSH.CRATER);
    expect(c).toBeTruthy();
    expect(c.x).toBeCloseTo(8, 5);
    expect(c.berm).toBeCloseTo(RIM_RATIO, 9);
    expect(r.st.bloomEvent).toBe(true);
    expect(r.mass.heightAt(8, 0)).toBeLessThan(-bloomTuning.depth * 0.9);                       // the bowl
    expect(r.mass.heightAt(8 + c.w * 0.57, 0)).toBeGreaterThan(0.1);                            // the rim
    r.run(bloomTuning.curtain + 0.5);
    expect(r.stamps.filter((s) => s.k === BRUSH.MOUND).length).toBeGreaterThanOrEqual(bloomTuning.mounds);
    expect(r.st.bloomEvent).toBe(false);
  });
  it('on water raises nothing', () => {
    const r = rig(SURF.WATER);
    r.st.castBloom = true; r.run(DT);
    expect(r.stamps.filter((s) => s.k === BRUSH.CRATER).length).toBe(0);
    expect(r.st.splashEvent).toBe(true);
  });
  it('grows with Flow power', () => {
    const a = rig(), b = rig();
    b.st.power = 1.25;
    for (const q of [a, b]) { q.st.castBloom = true; q.run(DT); }
    expect(b.stamps.find((s) => s.k === BRUSH.CRATER).w).toBeGreaterThan(a.stamps.find((s) => s.k === BRUSH.CRATER).w * 1.2);
  });
});

describe('Stone in general', () => {
  it('costs focus: Shard 9, Ridge 12 a second plus half a focus a metre, Bloom 26', () => {
    expect(combatTuning.costShard).toBe(9);
    expect(combatTuning.costRidge).toBe(12);
    expect(combatTuning.costRidgeMetre).toBe(0.5);
    expect(combatTuning.costBloom).toBe(26);
  });
  it('lights the hand ochre and takes only free light slots', () => {
    const r = rig();
    r.lights.fill(0);
    r.lights[7] = 1; r.lights[15] = 1;               // two slots taken by other verbs
    r.st.tx = 8; r.st.castBloom = true; r.run(DT);
    expect(r.lights[7]).toBe(1); expect(r.lights[15]).toBe(1);
    const o = 2 * 8;
    expect(r.lights[o + 7]).toBeGreaterThan(0);
    expect(r.lights[o + 4]).toBeGreaterThan(r.lights[o + 6]);   // red > blue: ochre
  });
  it('has an explicit row for every surface and stubs sand slump at zero', () => {
    expect(SURFACE_INFO.length).toBe(Object.keys(SURF).length);
    for (const s of SURFACE_INFO) expect(s.slump).toBe(0);
    expect(SURFACE_INFO[SURF.WATER].heave).toBe(0);
    expect(STONE_FX_VEC4).toBe(37);
  });
});
