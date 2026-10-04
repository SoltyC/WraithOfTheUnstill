import { describe, it, expect } from 'vitest';
import { createWarden } from '../src/game/warden/warden.js';
import { createClimb } from '../src/game/warden/climb.js';

/** Climb from every leg in random directions for 30 s with the Warden awake: the Wraith must
 *  never jump (no frame moves its pelvis more than a pull could), never go underground, and
 *  never end far from the Warden's surface. */
function run(seed, leg, side) {
  const ground = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
  const warden = createWarden({ ts: { stamp() { this.bk = 0; } }, fx: { emit() {} }, ground });
  warden.place(0, 0, 0);
  warden.px = 0; warden.pz = -60; warden.dt = 1 / 60; for (let k = 0; k < 30; k++) warden.update();
  const climb = createClimb({ warden, ground });
  climb.spend = () => true;
  let s = seed;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const b = warden.body;
  climb.px = b.fx[leg] + side * 1.2; climb.py = 0; climb.pz = b.fz[leg]; climb.grip = true;
  let maxJump = 0, minY = 1e9, maxDist = 0, frames = 0, where = '';
  let px = NaN, py = 0, pz = 0;
  for (let k = 0; k < 60 * 30; k++) {
    if (k % 60 === 0) { climb.mx = Math.round(rnd() * 2 - 1); climb.mz = Math.round(rnd() * 2 - 1); }
    climb.crx = 1; climb.crz = 0;
    warden.px = climb.climbing ? climb.x : 0; warden.pz = climb.climbing ? climb.z : -60;
    climb.dt = 1 / 60; climb.update(); warden.dt = 1 / 60; warden.update();
    if (!climb.climbing) { // fell or let go: mount again where it stands (as a player would)
      climb.px = climb.x; climb.py = 0; climb.pz = climb.z; px = NaN; continue;
    }
    frames++;
    if (!Number.isNaN(px)) {
      const j = Math.hypot(climb.x - px, climb.y - py, climb.z - pz);
      if (j > maxJump) { maxJump = j; where = `frame ${k} mode ${climb.mode} leg ${climb.leg} u ${climb.u.toFixed(2)} s ${climb.s.toFixed(2)} th ${climb.th.toFixed(2)}`; }
    }
    px = climb.x; py = climb.y; pz = climb.z;
    minY = Math.min(minY, climb.y - 0.85 * climb.uy);
    const dc = Math.hypot(climb.x - b.x, climb.z - b.z);
    maxDist = Math.max(maxDist, dc);
  }
  return { maxJump, minY, maxDist, frames, where };
}

describe('climbing never teleports or sinks', () => {
  for (let leg = 0; leg < 4; leg++) for (const side of [-1, 1]) {
    it(`leg ${leg}, side ${side}`, () => {
      const r = run(1234 + leg * 7 + side, leg, side);
      expect(r.frames).toBeGreaterThan(600);
      expect(r.maxJump, r.where).toBeLessThan(0.6);   // a pull at 60 Hz moves a few cm; 0.6 m is a snap
      expect(r.minY).toBeGreaterThan(-0.4);           // the feet never go under the ground
      expect(r.maxDist).toBeLessThan(40);
    });
  }
});
