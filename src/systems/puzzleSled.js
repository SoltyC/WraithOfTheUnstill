// The buried sled behind the Wellhouse (docs/phase-9/dunes-design.md §4.1; the machine: game/puzzles/sled.js).
// The sand is the real terrain state: a heap stamped over the sled the first time the Wraith comes near
// (the state only exists near it), a channel of the player's own Sweep, and a slide that moves the heap.

import { BRUSH } from '../shaders/terrainState.wgsl.js';
import { createSled, SLED, STATE } from '../game/puzzles/sled.js';

const AT = [1810, 775], FACING = Math.atan2(1846 - 1810, 736 - 775), C = Math.cos(FACING), S = Math.sin(FACING);
const SLED_Z = -27, LIP_Z = -33, LANE_X = 4, LANE_Z = -29; // site-local (m): the sled, the lip, the channel's head
const FLAG = { HEAPED: 'dunes:sled-heaped', FREED: 'dunes:sled-freed' };
const NEAR = 42, LIP_R = 4.5;

export function addPuzzleSledSystem(g) {
  const { loop, controller, chapter, hud, sfx, SFX, arm, terrainState: ts, capture, clock } = g;
  if (!ts) return;
  const flags = chapter.graph.flags, sled = g.sled = createSled();
  const restore = () => { sled.state = flags.has(FLAG.FREED) ? STATE.FREED : STATE.BURIED; sled.cut.fill(0); };
  restore();
  g.puzzleRestores.push(restore);
  const dust = g.sandDust ? g.sandDust.bursts : null;
  const wx = (x, z) => AT[0] + x * C + z * S, wz = (x, z) => AT[1] - x * S + z * C;
  const dirX = C, dirZ = -S; // the site's +x in the world
  const mound = (x, z, l, w, d, kind = BRUSH.MOUND) => {
    ts.bx = wx(x, z); ts.bz = wz(x, z); ts.bdx = dirX; ts.bdz = dirZ; ts.bl = l; ts.bw = w; ts.bd = d; ts.bc = 0.5;
    ts.bk = kind; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0; ts.stamp();
  };
  // The player's Sweep is what cuts the channel: every plough passes through the stamp.
  const stamp = ts.stamp.bind(ts);
  ts.stamp = function () {
    if (ts.bk === BRUSH.PLOUGH && sled.state === STATE.BURIED) {
      const dx = ts.bx - AT[0], dz = ts.bz - AT[1];
      sled.plough(dx * C - dz * S - LANE_X, dx * S + dz * C - LANE_Z);
    }
    return stamp();
  };
  let heapT = 0, pourT = 0;
  const tell = (title, sub, text, secs = 7) => { if (!capture) hud.notice(title, sub, text, secs); };
  const shake = (k) => { sfx.x = wx(0, SLED_Z); sfx.y = controller.pos.y; sfx.z = wz(0, SLED_Z); sfx.gain = k; sfx.play(SFX.RUMBLE); arm.shake += 0.05; };

  loop.add({ name: 'puzzleSled', update: () => {
    const dt = clock.dt, p = controller.pos, dx = p.x - wx(0, SLED_Z), dz = p.z - wz(0, SLED_Z);
    if (dx * dx + dz * dz > 220 * 220) return;
    const near = dx * dx + dz * dz < NEAR * NEAR;
    // The heap, once: over the sled and up to its lip.
    if (near && !flags.has(FLAG.HEAPED) && !flags.has(FLAG.FREED)) {
      heapT += dt;
      if (heapT > 0.5) {
        for (let k = 0; k < 4; k++) mound(0, SLED_Z - 1.5 * k, 7, 6.5 - k * 0.5, 1.1);
        flags.add(FLAG.HEAPED);
      }
    }
    if (sled.state === STATE.BURIED && near) {
      const lx = p.x - wx(0, LIP_Z), lz = p.z - wz(0, LIP_Z);
      if (lx * lx + lz * lz < LIP_R * LIP_R && sled.trigger()) { shake(1.3); pourT = 0; }
    }
    if (sled.state === STATE.SLIDING) {
      pourT -= dt;
      if (pourT <= 0) {
        pourT = 0.35;
        const f = sled.t / SLED.slideTime;
        if (sled.wins) {
          mound(0, SLED_Z - 2.2 * (1 - f), 9, 8.5, 0.52, BRUSH.PLOUGH); // the heap leaves
          mound(LANE_X + SLED.length * f, LANE_Z, 3, 2.4, 0.5);      // and runs down the channel
        } else {
          mound(LANE_X + SLED.length * f, LANE_Z, 3, 2.6, 0.6);      // the channel fills
          mound(0, SLED_Z, 7, 6, 0.3);
        }
        if (dust) { dust.time = clock.simTime; dust.x = wx(0, SLED_Z - 3); dust.z = wz(0, SLED_Z - 3); dust.width = 8; dust.halfLength = 5; dust.dx = dirX; dust.dz = dirZ; dust.depth = 1; dust.kind = 0; dust.emit(); }
      }
    }
    const r = sled.update(dt);
    if (r === 1) {
      flags.add(FLAG.FREED); chapter.raise('sled:freed'); shake(0.8);
      tell('The sand-sled', 'Sand goes where the channel is cut', 'Sarai will want to hear of it.');
    } else if (r === -1) {
      tell('The sand-sled', 'It poured over the runners', 'It took the lowest way there was. Sweep a channel beside the sled, then try the lip again.');
    }
  } });
}
