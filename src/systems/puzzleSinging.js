// The Singing Dunes in the world (machine: game/puzzles/singing.js; the pool and brush hook: systems/puzzles.js).

import { BRUSH } from '../shaders/terrainState.wgsl.js';
import { CHUNK } from '../game/shaped/rig.js';
import { createSinging, NOTE, STAGE, LAYOUT, SING_SITE, SD, PHRASE } from '../game/puzzles/singing.js';

const SHOW_R = 260, SOLVED = 'dunes:instrument-song';
const FLAG = ['dunes:sing-teach', 'dunes:sing-combine'];
const GAIN = [1.6, 1.3, 1.1];
const ROBE = 'robe:sand-runner';

export function buildSinging(g, P) {
  const { POD, ICE } = CHUNK;
  const X = g.singParts = { notes: [], lipGlow: [] };
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.5, n = P.group(SING_SITE[0] + Math.cos(a) * 2.2, 0, SING_SITE[1] + Math.sin(a) * 2.2); P.add(n, 0, 0, 0, 0.45, 0.45, 0.45, POD); X.notes.push(n); }
  X.ice = P.group(); P.add(X.ice, 0, 0.3, 0, 13, 1.1, 13, ICE, { glow: 0 });
  for (let k = 0; k < 3; k++) { const n = P.group(); P.add(n, 0, 2, 0, 0.55, 0.55, 0.55, POD); X.lipGlow.push(n); }
}

export function addSingingSite(g, P, tell, chime) {
  const { chapter, ground, sfx, SFX, clock, controller, terrainState: ts, arm, qs } = g;
  const X = g.singParts, flags = chapter.graph.flags, s = g.singing = createSinging();
  const restore = () => s.restore(flags.has(SOLVED) ? STAGE.DONE : flags.has(FLAG[1]) ? STAGE.TWIST : flags.has(FLAG[0]) ? STAGE.COMBINE : STAGE.TEACH);
  restore(); g.puzzleRestores.push(restore);
  if (qs?.get('singing')) s.restore(Number(qs.get('singing')));
  const dust = g.sandDust ? g.sandDust.bursts : null;
  const wx = (u) => SING_SITE[0] + u, wz = (v) => SING_SITE[1] + v;
  const lip = (n) => LAYOUT.lips[n], MID = NOTE.MIDDLE;
  const heights = [0, 0, 0];
  let seated = false, seatedFar = false, baseY = 0, humT = -1, humAt = 0, wasFrozen = false;

  /** A face lets go: the boom, sand poured down the face (real state), dust. */
  function boom(n) {
    const x = wx(lip(n)[0]), z = wz(lip(n)[1]);
    sfx.x = x; sfx.y = heights[n]; sfx.z = z; sfx.gain = GAIN[n]; sfx.play(n === NOTE.LOW ? SFX.BOOM : n === MID ? SFX.RUMBLE : SFX.TOLL);
    arm.shake += 0.05;
    if (ts) { ts.bx = x; ts.bz = z; ts.bdx = 1; ts.bdz = 0; ts.bl = 4; ts.bw = 3; ts.bd = 0.4; ts.bc = 0.5; ts.bk = BRUSH.PLOUGH; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.3; ts.stamp(); }
    if (dust) { dust.time = clock.simTime; dust.x = x; dust.z = z; dust.width = 7; dust.halfLength = 7; dust.dx = 1; dust.dz = 0; dust.depth = 1; dust.kind = 0; dust.emit(); }
  }
  const ring = { kind: 'puzzle', id: 'sing-ring', verb: 'Touch', name: 'Resonance stones', x: wx(LAYOUT.ring[0]), y: 0, z: wz(LAYOUT.ring[1]), r: 9, h: 3, hy: 1.4, hidden: true, onUse: () => { humT = 0; humAt = 0; } };
  const crust = { kind: 'puzzle', id: 'sing-crust', verb: 'Strike', name: 'Frozen crust', x: wx(lip(MID)[0]), y: 0, z: wz(lip(MID)[1]), r: 6, h: 3, hy: 1.4, hidden: true, onUse: () => { if (s.strike(clock.simTime)) { boom(MID); after(); } } };
  g.interactables?.push(ring, crust);
  function after() {
    if (s.stage === STAGE.COMBINE) { flags.add(FLAG[0]); tell('The Singing Dunes', 'The stones answer', 'They hold one note of light. Touch them: they hum a phrase, and it is cut in their faces.'); }
    if (s.stage === STAGE.TWIST) { flags.add(FLAG[1]); }
    if (s.stage === STAGE.DONE && !flags.has(SOLVED)) { flags.add(SOLVED); chapter.raise('instrument:song'); chime(SFX.TOLL, 1.4); tell('The Singing Dunes', 'A frozen face does not sing', 'The phrase hangs in the sand. It is the Walker\'s own.', 10); }
  }
  const told = { hint: false };
  return {
    freeze(x, z) { s.freeze(x - SING_SITE[0], z - SING_SITE[1]); },
    update(dt, c) {
      const dx = c.x - wx(0), dz = c.z - wz(0), near = dx * dx + dz * dz < SHOW_R * SHOW_R;
      ring.hidden = crust.hidden = true;
      if (!near) return false;
      if (!seated || (seatedFar && dx * dx + dz * dz < 110 * 110)) {
        seatedFar = !seated;
        for (let n = 0; n < 3; n++) {
          ground.qx = wx(lip(n)[0]); ground.qz = wz(lip(n)[1]); ground.sample(); heights[n] = ground.h;
          P.pose(X.lipGlow[n], ground.qx, ground.h, ground.qz, 0);
        }
        ground.qx = wx(0); ground.qz = wz(0); ground.sample(); baseY = ground.h; ring.y = baseY;
        crust.y = heights[MID];
        P.pose(X.ice, wx(lip(MID)[0]), heights[MID], wz(lip(MID)[1]), 0);
        X.notes.forEach((n) => { const G = P.group_(n); P.pose(n, G.x, baseY + 1.4, G.z, 0); });
        seated = true;
      }
      const t = clock.simTime, p = controller.pos;
      const ev = s.update(dt, t);
      if (ev & 2) boom(MID);
      if (ev & 1) after();
      // Standing on a lip lets the face go.
      for (let n = 0; n < 3; n++) {
        const lx = p.x - wx(lip(n)[0]), lz = p.z - wz(lip(n)[1]);
        if (lx * lx + lz * lz < SD.lipR * SD.lipR && s.slide(n, t)) { boom(n); after(); }
      }
      // Mastery: after the waking, the phrase in one unbroken ride, for the sand-runner's robe. It wants no freezing:
      // on the run the crests are taken before the sympathy can start.
      if (s.stage === STAGE.DONE && !flags.has(ROBE)) {
        const riding = controller.surf.active;
        if (!riding && s.run.at > 0) s.run.at = 0;
        for (let n = 0; n < 3; n++) {
          const lx = p.x - wx(lip(n)[0]), lz = p.z - wz(lip(n)[1]);
          if (lx * lx + lz * lz < SD.lipR * SD.lipR * 4 && riding && s.wait[n] <= 0) {
            s.wait[n] = SD.reset; boom(n);
            if (s.ride(n, t, riding)) { flags.add(ROBE); chime(SFX.TOLL, 1.3); tell('The Singing Dunes', 'One unbroken ride', 'The sand-runner\'s robe is yours. Find it among your robes.', 9); }
          }
        }
      }
      if (s.lastNote === MID && s.song.at === 0 && s.stage >= STAGE.COMBINE && !told.hint) { told.hint = true; tell('The Singing Dunes', 'The middle dune slid with the low', 'It is overloaded: it goes when the low one goes.', 7); }
      // The hum: the phrase, note by note, on the stones.
      if (humT >= 0) {
        const k = Math.floor(humT / 1.2);
        if (k >= PHRASE.length) humT = -1;
        else { if (k >= humAt) { humAt = k + 1; const n = PHRASE[k]; sfx.x = p.x; sfx.y = p.y; sfx.z = p.z; sfx.gain = 0.6; sfx.play(n === NOTE.LOW ? SFX.BOOM : n === MID ? SFX.RUMBLE : SFX.TOLL); } humT += dt; }
      }
      ring.hidden = false; crust.hidden = s.frozen <= 0;
      const frozen = s.frozen > 0;
      if (frozen !== wasFrozen) { wasFrozen = frozen; P.show(X.ice, frozen); }
      const hum = humT >= 0 ? Math.floor(humT / 1.2) : -1;
      for (let n = 0; n < 3; n++) {
        P.glow(X.notes[n], s.stage === STAGE.DONE || s.song.at > n || hum === n ? 1.4 : 0.08);
        P.glow(X.lipGlow[n], hum >= 0 && hum < PHRASE.length && PHRASE[hum] === n ? 1.6 : s.wait[n] > 0 ? 0.9 : 0.15);
      }
      return true;
    },
  };
}
