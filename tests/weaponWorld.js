// A small world for the weapon tests: the real shaped, combat, flow and weapon logic over a flat
// ground, with the Shaped held where they are placed (the AI would walk them through the Wraith).
import { createInventory } from '../src/game/inventory.js';
import { createShaped, S } from '../src/game/shaped/shaped.js';
import { createFrostBending } from '../src/game/bending/frost.js';
import { createCombat } from '../src/game/combat/combat.js';
import { createWeapons } from '../src/game/weapons/weapons.js';
import { CapsuleController } from '../src/character/capsuleController.js';
import { createFlow } from '../src/game/flow.js';

export function world(weapon = 'staff', extra = {}, setup = null) {
  const ground = { qx: 0, qz: 0, h: 0, nx: 0, ny: 1, nz: 0, sample() { this.h = 0; }, sampleNormal() { this.nx = 0; this.ny = 1; this.nz = 0; } };
  const stamps = [], pins = [];
  const ts = { stamp() { stamps.push(this.bk); } }, fx = { emit() {} }, clock = { hitStop: 0, simTime: 0, dt: 1 / 60 };
  const controller = new CapsuleController(ground); controller.teleport(0, 0);
  const shaped = createShaped({ ts, fx, ground });
  const frost = createFrostBending({ ts, fx, ground });
  const flow = createFlow();
  const combat = createCombat({ shaped, frost, controller, ts, clock, flow, teleport: () => {} });
  const inventory = createInventory();
  if (weapon !== 'staff') { inventory.give(weapon); inventory.cycle(); }
  if (setup) setup(inventory);
  const weapons = createWeapons({ shaped, combat, controller, clock, ts, fx, flow, inventory, ground, ...extra });
  const step = (n, input = {}) => {
    for (let k = 0; k < n; k++) {
      const dt = 1 / 60;
      weapons.able = true; weapons.dt = dt; weapons.aimYaw = 0; weapons.down = !!input.down; weapons.pressed = !!input.press && k === 0; weapons.dodgePressed = false; weapons.swapPressed = false;
      weapons.update();
      controller.dt = dt; controller.update();
      shaped.px = controller.pos.x; shaped.pz = controller.pos.z; shaped.pvx = controller.vel.x; shaped.pvz = controller.vel.z;
      shaped.dt = dt; shaped.time += dt; shaped.update();
      combat.dt = dt; combat.update(); clock.simTime += dt;
      for (const p of pins) { const b = shaped.slots[p.i].body; if (shaped.isLive(p.i) && shaped.slots[p.i].state !== S.FROZEN) b.place(p.x, p.z, Math.PI); }
      if (clock.hitStop > 0) clock.hitStop = 0;
    }
  };
  return { controller, shaped, combat, flow, weapons, step, stamps, clock, pins };
}
/** Spawn a hound a metre or two ahead and let it settle (hold it still). */
export function target(w, name = 'hound', z = 1.8, x = 0) {
  const i = w.shaped.spawn(name, x, z);
  w.step(100);
  const s = w.shaped.slots[i]; s.state = S.STALK; s.cool = 99;
  w.pins.push({ i, z, x });     // held where it stands: the AI would walk it through the Wraith
  return i;
}

