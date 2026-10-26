// Shared by the mace*.test.js files: the plunge's numbers, tier helper, lift and plunge-from-height.
import { weaponDefs } from '../src/game/weapons/defs.js';
export const P = weaponDefs.mace.plunge;
export const tierUp = (n) => (inv) => { for (let k = 0; k < n; k++) inv.upgrade('mace'); };
/** Put the Wraith `y` m up, still, and let two frames settle. */
export const lift = (w, y, x = 0, z = 0) => { w.controller.pos.x = x; w.controller.pos.z = z; w.controller.pos.y = y; w.controller.grounded = false; w.controller.vel.x = 0; w.controller.vel.y = 0; w.controller.vel.z = 0; w.step(2); };
/** Plunge from `y` m and run until the blow has landed and the machine has begun its recovery. */
export const plungeFrom = (w, y, x = 0, z = 0) => {
  lift(w, y, x, z);
  w.step(1, { press: true });
  for (let k = 0; k < 120 && w.weapons.plunge.falling; k++) w.step(1);
  return w.weapons.plunge.last;
};
export const hpOf = (w, i) => w.shaped.slots[i].hp;
