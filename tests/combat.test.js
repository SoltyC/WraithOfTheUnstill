import { describe, it, expect } from 'vitest';
import { createShaped, S } from '../src/game/shaped/shaped.js';
import { createFrostBending } from '../src/game/bending/frost.js';
import { createCombat, combatTuning } from '../src/game/combat/combat.js';
import { CapsuleController } from '../src/character/capsuleController.js';

function world() {
  const ground = { qx: 0, qz: 0, h: 0, nx: 0, ny: 1, nz: 0, sample() { this.h = 0; }, sampleNormal() { this.nx = 0; this.ny = 1; this.nz = 0; } };
  const ts = { stamp() { this.bk = 0; } };
  const fx = { emit() {} };
  const clock = { hitStop: 0 };
  const controller = new CapsuleController(ground); controller.teleport(0, 0);
  const shaped = createShaped({ ts, fx, ground });
  const frost = createFrostBending({ ts, fx, ground });
  let tp = null;
  const combat = createCombat({ shaped, frost, controller, ts, clock, teleport: (x, z) => { tp = [x, z]; } });
  const step = (n = 1) => {
    for (let k = 0; k < n; k++) {
      const dt = 1 / 60;
      controller.dt = dt; controller.update();
      frost.x = controller.pos.x; frost.y = 0; frost.z = controller.pos.z; frost.hx = 0.2; frost.hy = 1.2; frost.hz = 0.3;
      frost.dt = dt; frost.time += dt; frost.update();
      shaped.px = controller.pos.x; shaped.pz = controller.pos.z; shaped.pvx = controller.vel.x; shaped.pvz = controller.vel.z;
      shaped.dt = dt; shaped.time += dt; shaped.update();
      combat.dt = dt; combat.update();
    }
  };
  return { controller, shaped, frost, combat, clock, step, get tp() { return tp; } };
}

describe('combat', () => {
  it('a brute closes in, rears up and slams: a crater, and the blow lands within reach', () => {
    const w = world();
    w.shaped.spawn('brute', 0, 9);
    let slams = 0, hurt = false;
    for (let k = 0; k < 60 * 14 && !hurt; k++) { w.step(); slams += w.shaped.slams; if (w.combat.health < combatTuning.health) hurt = true; }
    expect(slams).toBeGreaterThan(0);
    expect(hurt).toBe(true);
  });
  it('a seer keeps its distance and throws shards that find a Wraith standing still', () => {
    const w = world();
    const i = w.shaped.spawn('seer', 0, 6);
    let hurt = false, far = 0;
    for (let k = 0; k < 60 * 14 && !hurt; k++) {
      w.step();
      const b = w.shaped.slots[i].body; far = Math.max(far, Math.hypot(b.x, b.z));
      if (w.combat.health < combatTuning.health) hurt = true;
    }
    expect(far).toBeGreaterThan(9);              // backed off toward its distance
    expect(hurt).toBe(true);
  });
  it('Sweep strikes a hound in its path (damage, stagger, hit-stop)', () => {
    const w = world();
    const i = w.shaped.spawn('hound', 0, 6);
    w.step(100);                                           // risen
    const hp0 = w.shaped.slots[i].hp;
    w.frost.aimX = 0; w.frost.aimZ = 1; w.frost.castSweep = true;
    let stop = 0;
    for (let k = 0; k < 60; k++) { w.step(); stop = Math.max(stop, w.clock.hitStop); }
    expect(w.shaped.slots[i].hp).toBeLessThan(hp0);
    expect(stop).toBeGreaterThan(0);
  });
  it('Crystallize freezes, then a Sweep shatters it for triple damage (the reaction)', () => {
    const w = world();
    const i = w.shaped.spawn('hound', 0, 6);
    w.step(100);
    const b = w.shaped.slots[i].body;
    w.frost.tx = b.sx[1]; w.frost.tz = b.sz[1]; w.frost.castCrystal = true;
    w.step(2);
    expect(w.shaped.isFrozen(i)).toBe(true);
    const hp0 = w.shaped.slots[i].hp;
    w.frost.aimX = b.sx[1] - w.controller.pos.x; w.frost.aimZ = b.sz[1] - w.controller.pos.z; w.frost.castSweep = true;
    w.step(60);
    const st = w.shaped.slots[i].state;
    // Either it took ≥ 3× the sweep's damage or it shattered outright.
    expect(st === S.FALLING || hp0 - w.shaped.slots[i].hp >= combatTuning.sweepDamage * combatTuning.shatterMul - 1e-6).toBe(true);
  });
  it('a hound lunge wounds the Wraith, unless it is mid bend-step', () => {
    const w = world();
    w.shaped.spawn('hound', 0, 5);
    let hurt = false;
    for (let k = 0; k < 600 && !hurt; k++) { w.step(); if (w.combat.health < combatTuning.health) hurt = true; }
    expect(hurt).toBe(true);
    const w2 = world();
    w2.shaped.spawn('hound', 0, 5);
    // Dodge continuously whenever a lunge is in the air.
    for (let k = 0; k < 600; k++) {
      if (w2.shaped.slots[0].state === S.LUNGE && w2.controller.dodgeT <= 0) w2.controller.dodgeRequested = true;
      w2.step();
    }
    expect(w2.combat.health).toBeGreaterThan(w.combat.health - 1e-6);
  });
  it('focus pays for the verbs and flow restores it; with none left, a verb fizzles', () => {
    const w = world();
    expect(w.combat.spend(combatTuning.costCrystal)).toBe(true);
    w.combat.focus = 5;
    expect(w.combat.spend(combatTuning.costSweep)).toBe(false);
    const f0 = w.combat.focus;
    w.step(60);
    expect(w.combat.focus).toBeGreaterThan(f0);
  });
  it('lock-on takes the nearest live Shaped and lets go when it dies', () => {
    const w = world();
    const a = w.shaped.spawn('hound', 0, 9), b = w.shaped.spawn('hound', 3, 4);
    w.step(100);
    w.combat.wantLockToggle = true; w.step();
    expect(w.combat.lock).toBe(b);
    w.shaped.damage(b, 1e9, false, 0, 0); w.step();
    expect(w.combat.lock).toBe(-1);
    expect(a).toBeGreaterThanOrEqual(0);
  });
  it('death: the Wraith collapses and re-forms at the shrine with full health', () => {
    const w = world();
    w.combat.shrineX = 40; w.combat.shrineZ = -20;
    w.combat.health = 1; w.shaped.hits = 0;
    w.combat.dying = 1e-4; w.combat.health = 0;
    for (let k = 0; k < 60 * (combatTuning.deathTime + combatTuning.reformTime + 0.5); k++) w.step();
    expect(w.tp).toEqual([40, -20]);
    expect(w.combat.dying).toBe(0);
    expect(w.combat.health).toBe(combatTuning.health);
  });
});

describe('the Ribbon on a frozen Shaped (user bug 2026-10-09: the game froze, the camera spun)', () => {
  it('breaks it within a few seconds and never holds the clock stopped', async () => {
    const { createShaped } = await import('../src/game/shaped/shaped.js');
    const { createCombat } = await import('../src/game/combat/combat.js');
    const flat = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
    const shaped = createShaped({ ts: { stamp() {} }, fx: { emit() {} }, ground: flat });
    const nodes = new Float32Array(16 * 4);
    const frost = { sweepActive: [false, false, false, false], sweepHW: [0, 0, 0, 0], sweepId: [0, 0, 0, 0], sweepFX: [0, 0, 0, 0], sweepFZ: [0, 0, 0, 0], sweepDX: [0, 0, 0, 0], sweepDZ: [0, 0, 0, 0],
      ribbonStrength: 1, ribbonNodes: nodes, crystalEvent: false, crystalX: 0, crystalZ: 0 };
    const controller = { pos: { x: 0, y: 0, z: -4 }, vel: { x: 0, y: 0, z: 0 }, surf: { active: false }, dodgeT: 0 };
    const clock = { hitStop: 0 };
    const combat = createCombat({ shaped, frost, controller, ts: { stamp() {} }, clock, teleport() {} });
    shaped.px = 0; shaped.pz = -4;
    const k = shaped.spawn('hound', 0, 0);
    for (let f = 0; f < 240; f++) { shaped.dt = 1 / 60; shaped.update(); }
    shaped.freeze(k, 30);
    let stoppedRun = 0, worst = 0, kick = 0;
    for (let f = 0; f < 60 * 6 && shaped.isLive(k); f++) {
      const b = shaped.slots[k].body;
      for (let n = 0; n < 16; n++) { nodes[n * 4] = b.sx[1]; nodes[n * 4 + 1] = b.sy[1]; nodes[n * 4 + 2] = b.sz[1]; nodes[n * 4 + 3] = 1; }
      // The clock: a hit-stop holds the simulation (dt 0) while real time passes.
      const r = 1 / 60, dt = clock.hitStop > 0 ? 0 : r;
      clock.hitStop = Math.max(0, clock.hitStop - r);
      combat.dt = dt; combat.update(); kick += combat.kick;
      shaped.dt = dt; shaped.update();
      stoppedRun = dt === 0 ? stoppedRun + 1 : 0; worst = Math.max(worst, stoppedRun);
    }
    expect(shaped.isLive(k)).toBe(false);
    expect(worst).toBeLessThan(20);          // never more than a third of a second held
    expect(kick).toBeLessThan(1);
  });
});
