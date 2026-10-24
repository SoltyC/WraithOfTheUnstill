import { describe, it, expect } from 'vitest';
import { createShaped, S } from '../src/game/shaped/shaped.js';
import { createFrostBending } from '../src/game/bending/frost.js';
import { createCombat, combatTuning } from '../src/game/combat/combat.js';
import { CapsuleController } from '../src/character/capsuleController.js';
import { createFlow, FLOW_EVENT } from '../src/game/flow.js';

function world() {
  const ground = { qx: 0, qz: 0, h: 0, nx: 0, ny: 1, nz: 0, sample() { this.h = 0; }, sampleNormal() { this.nx = 0; this.ny = 1; this.nz = 0; } };
  const ts = { stamp() { this.bk = 0; } }, fx = { emit() {} }, clock = { hitStop: 0 };
  const controller = new CapsuleController(ground); controller.teleport(0, 0);
  const shaped = createShaped({ ts, fx, ground });
  const frost = createFrostBending({ ts, fx, ground });
  const flow = createFlow();
  const combat = createCombat({ shaped, frost, controller, ts, clock, flow, teleport: () => {} });
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
  return { controller, shaped, frost, combat, flow, step };
}

describe('combat feeds Flow', () => {
  it('freeze then shatter lands a reaction', () => {
    const w = world();
    const i = w.shaped.spawn('hound', 0, 6);
    w.step(100);
    const b = w.shaped.slots[i].body;
    w.frost.tx = b.sx[1]; w.frost.tz = b.sz[1]; w.frost.castCrystal = true;
    w.step(2);
    expect(w.flow.counts[FLOW_EVENT.SHATTER]).toBe(0);
    w.frost.aimX = b.sx[1]; w.frost.aimZ = b.sz[1]; w.frost.castSweep = true;
    w.step(60);
    expect(w.flow.counts[FLOW_EVENT.SHATTER]).toBeGreaterThan(0);
    expect(w.flow.value).toBeGreaterThan(0.2);
  });
  it('a blow costs a tier; a dodge through the lunge is a near miss that feeds it', () => {
    const w = world();
    w.flow.setValue(2.2);
    w.shaped.spawn('hound', 0, 5);
    let k = 0;
    for (; k < 600 && w.combat.health >= combatTuning.health; k++) w.step();
    expect(w.combat.health).toBeLessThan(combatTuning.health);
    expect(w.flow.counts[9]).toBeGreaterThan(0);
    expect(w.flow.value).toBeLessThan(1.5);
    // A hit landing while the bend-step slides: no damage, and a near miss.
    const d = world();
    d.controller.dodgeT = 0.2; d.shaped.hits = 1; d.shaped.hitDamage = 10;
    d.combat.dt = 1 / 60; d.combat.update();
    expect(d.flow.counts[FLOW_EVENT.NEAR_MISS]).toBe(1);
    expect(d.combat.health).toBe(combatTuning.health);
  });
  it('flow multiplies focus regeneration', () => {
    const a = world(), b = world();
    b.flow.setValue(3);
    a.combat.focus = b.combat.focus = 10;
    a.step(60); b.step(60);
    expect(b.combat.focus - 10).toBeGreaterThan((a.combat.focus - 10) * 1.5);
  });
});
