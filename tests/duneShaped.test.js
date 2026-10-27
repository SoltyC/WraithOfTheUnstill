import { describe, it, expect } from 'vitest';
import { createShaped, S } from '../src/game/shaped/shaped.js';
import { BRUSH } from '../src/shaders/terrainState.wgsl.js';
import { frontal, duneStep } from '../src/game/shaped/dune.js';
import { createStoneHits } from '../src/game/combat/stoneHits.js';
import { combatTuning } from '../src/game/combat/combat.js';
import { world, target } from './weaponWorld.js';

const ground = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
function setup() {
  const ts = { count: 0, kind: -1, stamp() { this.count++; this.kind = this.bk; } }, fx = { emit() {} }, frost = { ice: false, iceAt() { return this.ice; } };
  const shaped = createShaped({ ts, fx, ground, frost }); shaped.px = 30;
  const step = (n) => { for (let k = 0; k < n; k++) { shaped.dt = 1 / 60; shaped.update(); } };
  return { shaped, ts, frost, step };
}
describe('dune Shaped', () => {
  it('a telegraph on frozen ground never raises or streams a burrow', () => {
    let stamps = 0, emissions = 0;
    const s = { arch: 'skitter', state: S.TELEGRAPH, coverTime: 0, body: { x: 0, y: 0, z: 0, heading: 0 } };
    const ts = { stamp() { stamps++; } }, fx = { emit() { emissions++; } };
    duneStep(s, ts, fx, { iceAt: () => true }, 1 / 60);
    expect(s.cover).toBe(false);
    expect(stamps).toBe(0); expect(emissions).toBe(0);
    duneStep(s, ts, fx, { iceAt: () => false }, 1 / 60);
    expect(s.cover).toBe(true);
    expect(stamps).toBe(1); expect(emissions).toBeGreaterThan(0);
  });
  it('travels under a terrain brush and stops burrowing on frozen ground or after Gust', () => {
    const { shaped, ts, frost, step } = setup(); const i = shaped.spawn('skitter', 0, 0), s = shaped.slots[i];
    step(110); expect(s.state).toBe(S.STALK); expect(s.cover).toBe(true);
    const count = ts.count; step(5); expect(ts.count).toBeGreaterThan(count); expect(ts.kind).toBe(BRUSH.MOUND);
    frost.ice = true; step(1); expect(s.cover).toBe(false);
    frost.ice = false; step(1); expect(s.cover).toBe(true);
    shaped.strip(i); expect(s.state).toBe(S.STAGGER); step(1); expect(s.cover).toBe(false);
    shaped.erupt(i); expect(s.coverTime).toBeGreaterThan(2);
  });
  it('detached plate records move independently of the body and do not return on collapse', () => {
    const { shaped, step } = setup(), i = shaped.spawn('plateback', 0, 0); step(110);
    const s = shaped.slots[i], c = s.rig.plate0, o = (i * 96 + c) * 16;
    const x = shaped.chunks[o], y = shaped.chunks[o + 1]; shaped.popPlate(i);
    s.body.x += 20; step(10);
    expect(Math.abs(shaped.chunks[o] - x)).toBeLessThan(1); expect(shaped.chunks[o + 1]).toBeGreaterThan(y);
    shaped.damage(i, 1e9, true, 0, 0); step(1); expect(shaped.chunks[o + 15]).toBe(0);
  });
  it('uses the body heading to distinguish front from side and rear', () => {
    const b = { heading: 0 }; expect(frontal(b, 0, -1)).toBe(true); expect(frontal(b, 1, 0)).toBe(false); expect(frontal(b, 0, 1)).toBe(false);
  });
  it('frontal strikes glance while flank and crown strikes reach the body', () => {
    const damage = (dx, dz, crown) => { const w = world(), i = target(w, 'plateback'), s = w.shaped.slots[i]; s.body.heading = Math.PI; const hp = s.hp; w.weapons.strike(i, { ...w.weapons.def.combo[0], crown }, dx, dz, 1); return [hp - s.hp, w.weapons.stats.glances]; };
    const front = damage(0, 1, false), side = damage(1, 0, false), crown = damage(0, 1, true);
    expect(front[1]).toBe(1); expect(side[1]).toBe(0); expect(front[0]).toBeLessThan(side[0] * 0.3); expect(crown[0]).toBeCloseTo(side[0]);
  });
  it('a wet frozen seam pops on a weapon strike; a stripped seam can be popped independently', () => {
    const w = world(); const i = target(w, 'plateback'); const s = w.shaped.slots[i];
    s.wet = 2.5; w.shaped.freeze(i, 3); w.weapons.strike(i, w.weapons.def.combo[0], 0, 1, 1);
    expect(s.st.plateOff).toBe(true);
    const v = setup(), j = v.shaped.spawn('plateback', 0, 0); v.step(110);
    v.shaped.strip(j); expect(v.shaped.slots[j].st.seamK).toBe(0);
    expect(v.shaped.popPlate(j)).toBe(true); expect(v.shaped.popPlate(j)).toBe(false);
  });
  it('Ribbon contact followed by Crystallize freezes wet plate seams for a staff strike', () => {
    const w = world(), i = target(w, 'plateback', 4), s = w.shaped.slots[i], b = s.body, f = w.frost;
    f.ribbonHeld = true; f.hx = 0; f.hy = 1; f.hz = 0; f.tx = b.sx[1]; f.ty = b.sy[1]; f.tz = b.sz[1]; f.dt = 1 / 60;
    for (let k = 0; k < 20; k++) { f.update(); f.time += f.dt; }
    f.ribbonNodes[0] = b.sx[1]; f.ribbonNodes[1] = b.sy[1]; f.ribbonNodes[2] = b.sz[1]; f.ribbonNodes[3] = 1;
    w.combat.dt = 1 / 60; w.combat.update(); expect(s.wet).toBeGreaterThan(0);
    f.ribbonHeld = false; f.castCrystal = true; f.tx = b.sx[1]; f.tz = b.sz[1]; f.update(); w.combat.update();
    expect(w.shaped.isFrozen(i)).toBe(true);
    w.weapons.strike(i, w.weapons.def.combo[0], 0, 1, 1); expect(s.st.plateOff).toBe(true);
  });
  it('a real combat Gust strips both a covered skitter and a plate seam', () => {
    for (const name of ['skitter', 'plateback']) {
      const w = world('staff', {}, null, { gale: true }), i = target(w, name, 4), s = w.shaped.slots[i], b = s.body;
      const g = w.gale; g.gustActive[0] = 1; g.gustId[0] = 1; g.gustHW[0] = 2; g.gustFX[0] = b.sx[1]; g.gustFZ[0] = b.sz[1]; g.gustDX[0] = 0; g.gustDZ[0] = 1;
      w.combat.dt = 1 / 60; w.combat.update();
      if (name === 'skitter') { expect(s.coverTime).toBeGreaterThan(2); expect(s.state).toBe(S.STAGGER); }
      else expect(s.st.seamK).toBe(0);
    }
  });
  it('combat Shard opens Gust-cleared seams and erupts a skitter; Bloom erupts a skitter', () => {
    for (const name of ['skitter', 'plateback']) {
      const { shaped, step } = setup(), i = shaped.spawn(name, 0, 0); step(110); const s = shaped.slots[i], b = s.body;
      if (name === 'plateback') shaped.strip(i); else { expect(s.cover).toBe(true); }
      const stone = { shardOn: [1], shardPhase: [1], shardId: [1], shardX: [b.sx[1]], shardY: [b.sy[1]], shardZ: [b.sz[1]], shardWet: [0], shardDmg: [1], shardDX: [0], shardDZ: [1], shardHit() {}, bloomEvent: false, mass: { count: 0 } };
      const hits = createStoneHits({ shaped, stone, strike(i, d, dx, dz, h) { shaped.damage(i, d, h, dx, dz); }, flow: null, FLOW_EVENT: {}, tuning: combatTuning, maxShaped: 8 });
      hits.hit(i, b.sx[1], b.sz[1], 1 / 60);
      if (name === 'skitter') expect(s.coverTime).toBeGreaterThan(2); else expect(s.st.plateOff).toBe(true);
    }
    const { shaped, step } = setup(), i = shaped.spawn('skitter', 0, 0); step(110); const s = shaped.slots[i], b = s.body;
    const stone = { shardOn: [0], bloomEvent: true, bloomId: 1, bloomX: b.sx[1], bloomZ: b.sz[1], bloomR: 1, mass: { count: 0 } };
    const hits = createStoneHits({ shaped, stone, strike(i, d, dx, dz, h) { shaped.damage(i, d, h, dx, dz); }, flow: null, FLOW_EVENT: {}, tuning: combatTuning, maxShaped: 8 });
    hits.hit(i, b.sx[1], b.sz[1], 1 / 60); expect(s.coverTime).toBeGreaterThan(2);
  });
  it('keeps eight active bodies finite and reuses their output buffers', () => {
    const { shaped, step } = setup(); for (let i = 0; i < 8; i++) expect(shaped.spawn(i % 2 ? 'plateback' : 'skitter', i * 3, 0)).toBe(i);
    expect(shaped.spawn('skitter', 0, 0)).toBe(-1); const chunks = shaped.chunks; step(600);
    expect(shaped.chunks).toBe(chunks); expect(shaped.alive).toBe(8);
    for (const s of shaped.slots) expect(Number.isFinite(s.body.x) && Number.isFinite(s.body.z)).toBe(true);
    for (const v of chunks) expect(Number.isFinite(v)).toBe(true);
  });
});
