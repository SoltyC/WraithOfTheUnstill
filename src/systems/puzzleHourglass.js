// The Hourglass in the world (machine: game/puzzles/hourglass.js; the pool and brush hook: systems/puzzles.js).

import { CHUNK } from '../game/shaped/rig.js';
import { sunlit } from '../game/puzzles/grammar.js';
import { createHourglass, STAGE, BOWL, LAYOUT, HOUR_SITE, HG } from '../game/puzzles/hourglass.js';

const SHOW_R = 220, STREAM = 48, SOLVED = 'dunes:instrument-clock';
const FLAG = ['dunes:hg-teach', 'dunes:hg-combine'];

/** The moving parts, once. */
export function buildHourglass(g, P) {
  const { SAND, ICE, RUIN, POD } = CHUNK;
  const X = g.hourParts = { sand: [], stream: [] };
  const O = [HOUR_SITE[0], HOUR_SITE[1]], at = (p) => [O[0] + p[0], O[1] + p[1]];
  for (const [p, w] of [[LAYOUT.top, 5.4], [LAYOUT.middle, 11.4], [LAYOUT.left, 6.2], [LAYOUT.right, 6.2]]) {
    const s = P.group(at(p)[0], 0, at(p)[1]);
    P.add(s, 0, 0.5, 0, w, 1, w, SAND, { glow: 0 });
    X.sand.push(s);
  }
  for (let k = 0; k < STREAM; k++) { const f = P.group(); P.add(f, 0, 0, 0, 1.0, 1.1, 1.0, SAND, { glow: 0 }); X.stream.push(f); }
  X.iceBreach = P.group(at(LAYOUT.breach)[0], 0, at(LAYOUT.breach)[1]); P.add(X.iceBreach, 0, 2.5, 0, 2.2, 2.4, 3, ICE, { glow: 0 });
  const mid = [(LAYOUT.middle[0] + LAYOUT.left[0]) / 2, (LAYOUT.middle[1] + LAYOUT.left[1]) / 2];
  X.mid = mid;
  X.iceLeft = P.group(at(mid)[0], 0, at(mid)[1]); P.add(X.iceLeft, 0, 0.6, 0, 3, 1.4, 3, ICE, { glow: 0 });
  // Lights on the cradles' rims: the east one (it lifts the door) warms as it fills; the west one is red-dark while
  // it holds sand against the door.
  X.lamps = [LAYOUT.left, LAYOUT.right].map((p) => { const q = P.group(at(p)[0], 0, at(p)[1]); P.add(q, 0, 2.1, 0, 0.7, 0.7, 0.7, POD); return q; });
  // Chevrons in the pan's floor, pointing the way a channel should lean: toward the east cradle.
  X.chevrons = P.group(at(LAYOUT.middle)[0], 0, at(LAYOUT.middle)[1]);
  for (let k = 0; k < 3; k++) for (const s of [-1, 1]) P.add(X.chevrons, 1.2 + k * 1.5 - s * 0, 0.2, 0.6 * s, 0.25, 0.3, 1.6, RUIN, { glow: 0, f: [s * 0.7, 0, 0.7] });
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
  const heightAt = (x, z) => { ground.qx = x; ground.qz = z; ground.sample(); return ground.h; };
  const target = (id, verb, name, p, onUse) => {
    const t = { kind: 'puzzle', id, verb, name, x: wx(p[0]), y: 0, z: wz(p[1]), r: 3.2, h: 2.6, hy: 1.4, hidden: true, onUse };
    g.interactables?.push(t); return t;
  };
  const sluice = target('hg-sluice', 'Strike', 'Sluice stone', LAYOUT.sluice, () => { h.strike(); chime(SFX.CLANG, 0.7); });
  let burrowT = 15, burrow = -1, shadeT = 0, shadeB = false, shadeL = false;
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
        for (const q of [X.iceBreach, X.iceLeft, X.door, X.chevrons, ...X.lamps]) { const G = P.group_(q); P.pose(q, G.x, y, G.z, 0); }
      }
      if (d2 > HG.leaveR * HG.leaveR) { h.drain(dt); }
      else {
        // G4: the sun's height is read from the world, once a second: a low sun behind the rim dune keeps the ice.
        shadeT -= dt;
        if (shadeT <= 0) {
          shadeT = 1;
          const sun = g.env.env.sunDir, y = base + 1;
          shadeB = !sunlit(wx(LAYOUT.breach[0]), y, wz(LAYOUT.breach[1]), sun.x, sun.y, sun.z, heightAt);
          shadeL = !sunlit(wx(X.mid[0]), y, wz(X.mid[1]), sun.x, sun.y, sun.z, heightAt);
        }
        const before = h.stage, ev = h.update(dt, shadeB, shadeL);
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
      P.glow(X.lamps[0], h.bowls[BOWL.LEFT].level > 0.25 ? 0.06 : 0.02); P.glow(X.lamps[1], 0.1 + 1.3 * h.bowls[BOWL.RIGHT].level);
      // A Skitter in the pan (spawned below) spills the flow; it comes only while the clock is running.
      burrowT -= dt;
      if (burrowT <= 0 && !h.burrowed && h.stage === STAGE.TWIST && h.panIce <= 0 && d2 < 45 * 45 && g.shaped) {
        burrowT = 40; burrow = g.shaped.spawn('skitter', wx(LAYOUT.middle[0] + 3), wz(LAYOUT.middle[1]));
        h.burrowed = burrow >= 0;
        if (h.burrowed) tell('The Hourglass', 'Something moves in the pan', 'The flow spills both ways again. Frozen sand gives it nothing to dig.', 6);
      }
      if (h.burrowed && (burrow < 0 || g.shaped.slots[burrow].state === 0)) { h.burrowed = false; burrow = -1; }
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
