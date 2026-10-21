import { describe, it, expect, afterEach } from 'vitest';
import { createShaped, S, MAX_SHAPED } from '../src/game/shaped/shaped.js';
import { ARCHETYPES } from '../src/game/shaped/archetypes.js';
import * as BH from '../src/game/shaped/behaviours.js';

const flat = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
const ts = { stamp() {} }, fx = { emit() {} };

// Behaviours key off arch.behaviour; the archetypes file may not carry it yet, so set it here.
const saved = {};
function arch(name, extra) { saved[name] = saved[name] || { ...ARCHETYPES[name] }; Object.assign(ARCHETYPES[name], extra); }
afterEach(() => { for (const k in saved) { for (const f of Object.keys(ARCHETYPES[k])) if (!(f in saved[k])) delete ARCHETYPES[k][f]; Object.assign(ARCHETYPES[k], saved[k]); } });

function world() {
  const sh = createShaped({ ts, fx, ground: flat });
  sh.px = 0; sh.pz = 0; sh.pvx = 0; sh.pvz = 0;
  const step = (sec, each) => { for (let t = 0; t < sec - 1e-9; t += 1 / 60) { if (each) each(t); sh.dt = 1 / 60; sh.time += 1 / 60; sh.update(); } };
  return { sh, step };
}

describe('pure helpers', () => {
  it('pass steering bends off the straight line (> 25 deg) far out and closes to straight', () => {
    const o = { x: 0, z: 0 };
    const d = BH.passSteer(o, 0, 8, 0, 0, 1);   // 8 m away, target straight ahead (-z)
    const ang = Math.acos(Math.max(-1, Math.min(1, o.z * -1)));
    expect(d).toBeCloseTo(8, 6);
    expect(ang * 180 / Math.PI).toBeGreaterThan(25);
    BH.passSteer(o, 0, 1, 0, 0, 1);
    expect(o.z).toBeCloseTo(-1, 6);
  });
  it('song heals only wounded allies in range', () => {
    expect(BH.songHeal(10, 40, 5, 14, 6, 0.5)).toBeCloseTo(13);
    expect(BH.songHeal(40, 40, 5, 14, 6, 0.5)).toBe(40);
    expect(BH.songHeal(10, 40, 20, 14, 6, 0.5)).toBe(10);
    expect(BH.songHeal(39, 40, 5, 14, 6, 1)).toBe(40);
    expect(BH.songEligible(0, 0)).toBe(false);
    expect(BH.songEligible(0, 1)).toBe(true);
    expect(BH.songEligible(2, 1)).toBe(false);
  });
  it('curtains sit between the Chanter and the target', () => {
    const o = { x: 0, z: 0 };
    BH.curtainPos(o, 0, 0, 20, 0, 5);
    expect(o.x).toBeCloseTo(5); expect(o.z).toBeCloseTo(0);
    BH.curtainPos(o, 0, 0, 4, 0, 5);
    expect(o.x).toBeCloseTo(2);
    expect(BH.curtainStrength(0, 6, 1, 1)).toBe(0);
    expect(BH.curtainStrength(3, 6, 1, 1)).toBe(1);
    expect(BH.curtainStrength(5.5, 6, 1, 1)).toBeCloseTo(0.5);
  });
  it('patrol points sit on the boundary and the leash strips outward motion', () => {
    const o = { x: 0, z: 0 };
    BH.patrolPoint(o, 3, 0, 0, 0, 14, 2.5);
    expect(Math.hypot(o.x, o.z)).toBeCloseTo(14);
    expect(BH.leash(o, 15, 0, 0, 0, 14, 2, 0)).toBe(true);
    expect(o.x).toBeLessThan(0.01);
    expect(BH.leash(o, 5, 0, 0, 0, 14, 2, 0)).toBe(false);
  });
});

describe("'flush' (Sedgerunners)", () => {
  const setup = () => { arch('sedgerunner', { behaviour: 'flush' }); return world(); };
  it('spawns stilled, crouched, unlit and motionless', () => {
    const { sh, step } = setup();
    sh.px = 40;
    const a = sh.spawn('sedgerunner', 0, 0), s = sh.slots[a];
    step(2);
    expect(s.state).toBe(S.STILLED); expect(s.flushed).toBe(false);
    expect(s.body.crouch).toBeGreaterThan(0.9); expect(s.glow).toBe(0);
    expect(Math.hypot(s.body.x, s.body.z)).toBeLessThan(1e-6);
  });
  it('flushes when the Wraith comes within flushRadius of any member, and the whole flock goes', () => {
    const { sh, step } = setup();
    sh.px = 30;
    const ids = [sh.spawn('sedgerunner', 0, 0), sh.spawn('sedgerunner', 4, 3), sh.spawn('sedgerunner', -3, 5)];
    expect(new Set(ids.map((i) => sh.slots[i].flock)).size).toBe(1);      // spawned together = one flock
    step(0.5); expect(ids.every((i) => !sh.slots[i].flushed)).toBe(true);
    sh.px = 4 + 10; step(0.1);                                              // 10 m from the nearest: still hidden
    expect(ids.every((i) => !sh.slots[i].flushed)).toBe(true);
    sh.px = 4 + 8; step(0.05);                                            // within 9 m of one member
    expect(ids.every((i) => sh.slots[i].flushed)).toBe(true);
    step(0.8);                                                              // breaking outward in different directions
    const angs = ids.map((i) => Math.atan2(sh.slots[i].body.x - [0, 4, -3][ids.indexOf(i)], sh.slots[i].body.z - [0, 3, 5][ids.indexOf(i)]));
    expect(new Set(angs.map((a) => a.toFixed(1))).size).toBe(3);
  });
  it('a strike on one member flushes the flock; a separate flock is untouched', () => {
    const { sh } = setup();
    sh.px = 60;
    const a = sh.spawn('sedgerunner', 0, 0), b = sh.spawn('sedgerunner', 3, 0);
    step0(sh);
    const c = sh.spawn('sedgerunner', 50, 0), d = sh.slots[c];
    sh.damage(a, 1, true, 0, 1);
    expect(sh.slots[b].flushed).toBe(true);
    expect(d.flock).not.toBe(sh.slots[a].flock);
    expect(d.flushed).toBe(false);
  });
  it('flock propagation (pure) follows flock ids only among live slots', () => {
    const flocks = [1, 1, 2, 1], flushed = [1, 0, 0, 0], live = [1, 1, 1, 0];
    expect(BH.flockPropagate(flocks, flushed, live, 4)).toBe(1);
    expect(flushed).toEqual([1, 1, 0, 0]);
    expect(BH.flushDue(8, 0, 9)).toBe(true); expect(BH.flushDue(9.5, 0, 9)).toBe(false);
  });
  it('passes start off the straight line, cross close and slash, then carry on and loop back', () => {
    const { sh, step } = setup();
    sh.px = 0; sh.pz = 0;
    const a = sh.spawn('sedgerunner', 0, 6), s = sh.slots[a];
    step(0.1); sh.damage(a, 0.1, false, 0, 0);                              // flush it
    let startAngles = [], closest = 1e9, hits = 0, passes = 0, lastPass = -1, maxFar = 0;
    step(8, () => {
      if (s.state === S.PASS && s.pass === 0 && lastPass !== 0) {
        const b = s.body, dx = sh.px - b.x, dz = sh.pz - b.z, d = Math.hypot(dx, dz);
        if (Math.hypot(b.vx, b.vz) > 1 && d > 5) startAngles.push(Math.acos((b.vx * dx + b.vz * dz) / (Math.hypot(b.vx, b.vz) * d)) * 180 / Math.PI);
        passes++;
      }
      lastPass = s.state === S.PASS ? s.pass : -1;
      if (s.state === S.PASS) closest = Math.min(closest, Math.hypot(s.body.x, s.body.z));
      maxFar = Math.max(maxFar, Math.hypot(s.body.x, s.body.z));
      hits += sh.hits; 
    });
    expect(passes).toBeGreaterThanOrEqual(2);
    expect(startAngles.length).toBeGreaterThan(0);
    for (const a2 of startAngles) expect(a2).toBeGreaterThan(25);
    expect(closest).toBeLessThan(1.5);
    expect(hits).toBeGreaterThanOrEqual(1);
    expect(maxFar).toBeGreaterThan(6);                                      // carried on and looped back
  });
});
function step0(sh) { sh.dt = 1 / 60; sh.update(); }

describe("'territory' (Hedgewarden)", () => {
  const setup = () => { arch('hedgewarden', { behaviour: 'territory' }); return world(); };
  it('ignores the Wraith outside the boundary and patrols its edge', () => {
    const { sh, step } = setup();
    sh.px = 30; sh.pz = 0;
    const a = sh.spawn('hedgewarden', 0, 0), s = sh.slots[a];
    expect(s.bound).toBe(14); expect(s.homeX).toBe(0);
    let moved = 0;
    step(30, () => { moved = Math.max(moved, Math.hypot(s.body.x, s.body.z)); });
    expect(s.aggro).toBe(false);
    expect(moved).toBeGreaterThan(8);
    expect(Math.hypot(s.body.x, s.body.z)).toBeGreaterThan(8);
  });
  it('chases inside, gives up ~1.5 s after the Wraith leaves, and never goes past bound + 1', () => {
    const { sh, step } = setup();
    sh.px = 8; sh.pz = 0;
    const a = sh.spawn('hedgewarden', 0, 0, { bound: 10 }), s = sh.slots[a];
    step(1); expect(s.aggro).toBe(true);
    let far = 0;
    sh.px = 9.5; step(10, () => { far = Math.max(far, Math.hypot(s.body.x, s.body.z)); });
    expect(s.aggro).toBe(true);
    expect(Math.hypot(s.body.x - 9.5, s.body.z)).toBeLessThan(4);          // on top of the Wraith
    sh.px = 25;                                                              // leaves, standing beyond the line
    step(1.2, () => { far = Math.max(far, Math.hypot(s.body.x, s.body.z)); });
    expect(s.aggro).toBe(true);
    step(0.5, () => { far = Math.max(far, Math.hypot(s.body.x, s.body.z)); });
    expect(s.aggro).toBe(false);
    step(10, () => { far = Math.max(far, Math.hypot(s.body.x, s.body.z)); });
    expect(far).toBeLessThanOrEqual(11 + 1e-6);
  });
  it('gate (pure): aggro on entry, give-up timer resets on re-entry', () => {
    const g = { aggro: false, away: 0 };
    expect(BH.territoryGate(g, 20, 14, 1)).toBe(false);
    expect(BH.territoryGate(g, 10, 14, 1)).toBe(true);
    expect(BH.territoryGate(g, 20, 14, 1)).toBe(true);
    BH.territoryGate(g, 10, 14, 0.1);
    expect(g.away).toBe(0);
    BH.territoryGate(g, 20, 14, 1); expect(BH.territoryGate(g, 20, 14, 0.6)).toBe(false);
  });
});

describe("'support' (Chanter)", () => {
  const setup = () => { arch('chanter', { behaviour: 'support', songEvery: 2, pollenEvery: 1, shardDamage: 0 }); return world(); };
  it('sings only when a wounded ally is near, and heals just the wounded in range', () => {
    const { sh, step } = setup();
    sh.px = 40; sh.pz = 0;
    const c = sh.spawn('chanter', 0, 0), h1 = sh.spawn('hound', 5, 0), h2 = sh.spawn('hound', 6, 3), h3 = sh.spawn('hound', 30, 0);
    sh.freeze(h1, 99); sh.freeze(h2, 99); sh.freeze(h3, 99);
    step(3);                                                               // all healthy: no song
    expect(sh.slots[c].state).not.toBe(S.SING);
    sh.slots[h1].hp = 10; sh.slots[h3].hp = 10;                            // h1 near, h3 far, h2 healthy
    let sang = false; step(5, () => { if (sh.slots[c].state === S.SING) sang = true; });
    expect(sang).toBe(true);
    expect(sh.slots[h1].hp).toBeGreaterThan(10);
    expect(sh.slots[h2].hp).toBe(40);
    expect(sh.slots[h3].hp).toBe(10);
  });
  it('heals at about 6 hp/s while singing', () => {
    const { sh, step } = setup();
    sh.px = 40;
    const c = sh.spawn('chanter', 0, 0), h = sh.spawn('hound', 5, 0);
    step(2); sh.freeze(h, 99);
    sh.slots[h].hp = 1; sh.slots[c].songCool = 0;
    let t0 = -1, hp0 = 0, t1 = 0, hp1 = 0;
    step(3, () => { const s = sh.slots[c]; if (s.state === S.SING && s.t > 1.0 && t0 < 0) { t0 = s.t; hp0 = sh.slots[h].hp; } if (s.state === S.SING && t0 >= 0) { t1 = s.t; hp1 = sh.slots[h].hp; } });
    expect((hp1 - hp0) / (t1 - t0)).toBeGreaterThan(5); expect((hp1 - hp0) / (t1 - t0)).toBeLessThan(7);
  });
  it('a strike interrupts the song (staggered)', () => {
    const { sh, step } = setup();
    sh.px = 40;
    const c = sh.spawn('chanter', 0, 0), h = sh.spawn('hound', 5, 0);
    step(2); sh.freeze(h, 99); sh.slots[h].hp = 10; sh.slots[c].songCool = 0;
    step(1.5); expect(sh.slots[c].state).toBe(S.SING);
    sh.damage(c, 0.5, false, 0, 1);
    expect(sh.slots[c].state).toBe(S.STAGGER);
    const hp = sh.slots[h].hp; step(0.3); expect(sh.slots[h].hp).toBe(hp);
  });
  it('breathes curtains between itself and the Wraith, at most 2 per Chanter, published in the pool', () => {
    const { sh, step } = setup();
    sh.px = 14; sh.pz = 0;
    const c = sh.spawn('chanter', 0, 0);
    let maxAlive = 0, checked = 0; const prev = new Float32Array(8);
    step(10, () => {
      let n = 0; const b = sh.slots[c].body;
      for (let k = 0; k < 8; k++) {
        const r = sh.pollen[k * 4 + 2], str = sh.pollen[k * 4 + 3];
        if (r > 0) n++;
        const rising = str > prev[k]; prev[k] = str;
        if (r > 0 && str > 0 && str < 0.08 && rising) {                                  // just breathed out
          const x = sh.pollen[k * 4], z = sh.pollen[k * 4 + 1];
          expect(r).toBe(4);
          expect(x).toBeGreaterThan(b.x); expect(x).toBeLessThan(sh.px);
          expect(Math.abs(z - b.z * (1 - (x - b.x) / (sh.px - b.x)))).toBeLessThan(0.4);   // on the line to the Wraith (z = 0)
          checked++;
        }
      }
      maxAlive = Math.max(maxAlive, n);
    });
    expect(maxAlive).toBe(2);
    expect(checked).toBeGreaterThan(0);
    expect(sh.pollen).toBeInstanceOf(Float32Array); expect(sh.pollen.length).toBe(32);
  });
  it('pollenAt is the max over curtains and disperseNear fades them over 0.5 s', () => {
    const { sh, step } = setup();
    sh.px = 14;
    sh.spawn('chanter', 0, 0);
    step(4);
    let cx = 0, cz = 0, best = 0;
    for (let k = 0; k < 8; k++) if (sh.pollen[k * 4 + 3] > best) { best = sh.pollen[k * 4 + 3]; cx = sh.pollen[k * 4]; cz = sh.pollen[k * 4 + 1]; }
    expect(best).toBeGreaterThan(0.5);
    expect(sh.pollenAt(cx, cz)).toBeCloseTo(best, 5);
    expect(sh.pollenAt(cx + 50, cz)).toBe(0);
    expect(sh.disperseNear(cx, cz, 2)).toBeGreaterThan(0);
    step(0.25); const mid = sh.pollenAt(cx, cz);
    expect(mid).toBeLessThan(best); expect(mid).toBeGreaterThan(0);
    step(0.3); expect(sh.pollenAt(cx, cz)).toBe(0);
  });
});

describe('default behaviour is bit-identical', () => {
  it('a frost mix simulated 600 frames matches the pre-behaviour snapshot', () => {
    const { sh, step } = world();
    const ids = [sh.spawn('hound', 5, 0), sh.spawn('hound', -4, 3), sh.spawn('brute', 0, 9), sh.spawn('seer', -9, -9)];
    step(10);
    const want = [[-0.32629810363449147, 0.4007289086761709, 4, 40], [-1.1944162710348867, -0.34182609960011523, 2, 40],
      [-0.13327212637540445, 1.3631695211314863, 5, 160], [-3.3854311848763885, -10.43494359892492, 2, 55]];
    ids.forEach((i, k) => {
      const s = sh.slots[i];
      expect(s.body.x).toBeCloseTo(want[k][0], 10); expect(s.body.z).toBeCloseTo(want[k][1], 10);
      expect(s.state).toBe(want[k][2]); expect(s.hp).toBe(want[k][3]);
    });
    expect(MAX_SHAPED).toBe(8);
  });
});
