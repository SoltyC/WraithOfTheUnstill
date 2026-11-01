// The Hourglass in the world (machine: game/puzzles/hourglass.js; the pool and brush hook: systems/puzzles.js).

import { CHUNK } from '../game/shaped/rig.js';
import { createHourglass, STAGE, BOWL, LAYOUT, HOUR_SITE, HG } from '../game/puzzles/hourglass.js';

const SHOW_R = 220, STREAM = 22, SOLVED = 'dunes:instrument-clock';
const FLAG = ['dunes:hg-teach', 'dunes:hg-combine'];

/** The moving parts, once. */
export function buildHourglass(g, P) {
  const { SAND, ICE, RUIN } = CHUNK;
  const X = g.hourParts = { sand: [], stream: [] };
  const O = [HOUR_SITE[0], HOUR_SITE[1]], at = (p) => [O[0] + p[0], O[1] + p[1]];
  for (const [p, w] of [[LAYOUT.top, 5.4], [LAYOUT.middle, 11.4], [LAYOUT.left, 6.2], [LAYOUT.right, 6.2]]) {
    const s = P.group(at(p)[0], 0, at(p)[1]);
    P.add(s, 0, 0.5, 0, w, 1, w, SAND, { glow: 0 });
    X.sand.push(s);
  }
  for (let k = 0; k < STREAM; k++) { const f = P.group(); P.add(f, 0, 0, 0, 0.7, 0.8, 0.7, SAND, { glow: 0 }); X.stream.push(f); }
  X.iceBreach = P.group(at(LAYOUT.breach)[0], 0, at(LAYOUT.breach)[1]); P.add(X.iceBreach, 0, 2.5, 0, 2.2, 2.4, 3, ICE, { glow: 0 });
  const mid = [(LAYOUT.middle[0] + LAYOUT.left[0]) / 2, (LAYOUT.middle[1] + LAYOUT.left[1]) / 2];
  X.mid = mid;
  X.iceLeft = P.group(at(mid)[0], 0, at(mid)[1]); P.add(X.iceLeft, 0, 0.6, 0, 3, 1.4, 3, ICE, { glow: 0 });
  X.door = P.group(at(LAYOUT.door)[0], 0, at(LAYOUT.door)[1]);
  for (let k = 0; k < 3; k++) P.add(X.door, 0, 1.4 + k * 2.7, 0, 7.4, 2.9, 1.1, RUIN, { glow: 0 });
}

export function addHourglassSite(g, P, tell, chime) {
  const { chapter, ground, sfx, SFX, qs } = g;
  const X = g.hourParts, flags = chapter.graph.flags, h = g.hourglass = createHourglass();
  const restore = () => h.restore(flags.has(SOLVED) ? STAGE.DONE : flags.has(FLAG[1]) ? STAGE.TWIST : flags.has(FLAG[0]) ? STAGE.COMBINE : STAGE.TEACH);
  restore(); g.puzzleRestores.push(restore);
  if (qs?.get('hourglass')) h.restore(Number(qs.get('hourglass')));
  const wx = (u) => HOUR_SITE[0] + u, wz = (v) => HOUR_SITE[1] + v;
  const target = (id, verb, name, p, onUse) => {
    const t = { kind: 'puzzle', id, verb, name, x: wx(p[0]), y: 0, z: wz(p[1]), r: 3.2, h: 2.6, hy: 1.4, hidden: true, onUse };
    g.interactables?.push(t); return t;
  };
  const sluice = target('hg-sluice', 'Strike', 'Sluice stone', LAYOUT.sluice, () => { h.strike(); chime(SFX.CLANG, 0.7); });
  let seated = false, seatedFar = false, base = 0, door = 0, phase = 0;
  const streamAt = (k, ax, ay, az, bx, by, bz, on, t) => {
    const f = X.stream[k];
    P.show(f, on);
    if (on) P.pose(f, wx(ax + (bx - ax) * t), base + ay + (by - ay) * t, wz(az + (bz - az) * t), 0);
  };
  return {
    freeze(x, z) { h.freeze(x - HOUR_SITE[0], z - HOUR_SITE[1]); },
    plough(x, z) { h.plough(x - HOUR_SITE[0], z - HOUR_SITE[1]); },
    update(dt, c) {
      const dx = c.x - wx(0), dz = c.z - wz(20), d2 = dx * dx + dz * dz, near = d2 < SHOW_R * SHOW_R;
      sluice.hidden = true;
      if (!near) return false;
      if (!seated || (seatedFar && d2 < 80 * 80)) {
        seatedFar = !seated;
        ground.qx = wx(0); ground.qz = wz(20); ground.sample(); base = ground.h; seated = true;
        sluice.y = base; const y = base;
        X.sand.forEach((s, k) => { const G = P.group_(s); P.pose(s, G.x, y + (k === 0 ? 6.4 : 0.2), G.z, 0); });
        for (const q of [X.iceBreach, X.iceLeft, X.door]) { const G = P.group_(q); P.pose(q, G.x, y, G.z, 0); }
      }
      if (d2 > HG.leaveR * HG.leaveR) { h.drain(dt); }
      else {
        const before = h.stage, ev = h.update(dt, false, false);
        if (ev) {
          if (before < 2) flags.add(FLAG[before]);
          if (h.stage === STAGE.COMBINE) { chime(SFX.CHIME); tell('The Hourglass', 'The sand holds its way', 'It runs down to the pan, and splits left and right.'); }
          else if (h.stage === STAGE.TWIST) { chime(SFX.CHIME); tell('The Hourglass', 'It leans to the right', 'But the left cradle is the door\'s other weight.'); }
          else if (h.stage === STAGE.DONE) { flags.add(SOLVED); chapter.raise('instrument:clock'); chime(SFX.TOLL, 1.4); tell('The Hourglass', 'Sand goes where the channel is cut', 'Frozen sand does not flow.', 10); }
        }
      }
      sluice.hidden = h.stage === STAGE.DONE;
      for (let k = 1; k < 4; k++) P.scale(X.sand[k], Math.max(0.05, h.bowls[k].level));
      P.show(X.iceBreach, h.breach.frozen); P.show(X.iceLeft, h.left.frozen);
      // The door rides its cradles: the right lifts it, the left pulls it down.
      const lift = Math.max(0, h.bowls[BOWL.RIGHT].level - h.bowls[BOWL.LEFT].level * 2);
      door += (lift - door) * Math.min(1, dt * 1.2);
      { const G = P.group_(X.door); P.pose(X.door, G.x, base + door * 6.8, G.z, 0); }
      // The streams: down the chute, out of the breach, down each side.
      phase = (phase + dt * 1.8) % 1;
      const L = LAYOUT, m = X.mid, chute = h.sluice.open, leak = chute && !h.breach.frozen, side = chute && h.breach.frozen;
      for (let k = 0; k < STREAM; k++) {
        const t = ((k % 6) + phase) / 6, s = Math.floor(k / 6);
        if (s === 0) streamAt(k, 0, 6.2, 2, L.middle[0], 0.6, L.middle[1] - 5, chute && !leak, t);
        else if (s === 1) streamAt(k, 0, 5.4, 4, 3.5, 0.2, L.breach[1], leak, t);
        else if (s === 2) streamAt(k, L.middle[0], 0.7, L.middle[1], L.right[0], 1.1, L.right[1], side, t);
        else streamAt(k, m[0] + 3, 0.7, m[1] - 4, L.left[0], 1.1, L.left[1], side && !h.left.frozen, t);
      }
      return true;
    },
  };
}
