// Doran's story (docs/storyline.md, Meadow: doubt — The Gatekeeper; user 2026-11-22: Doran set the fire, and the scenes
// round the Bellwether may change, not its fight). The data is in data/quests/meadow.json (talk, dialogue, barks, clues);
// this system does what the data cannot:
//   Bryn, his daughter, held at the hall's one lit window since she climbed to see the bell at sixteen: a still figure with a
//     lamp behind the glass (the window clue lets the Wraith see her), gone when the Bellwether is released.
//   His fate, settled the moment the Bellwether is released, from what the player did (story state, game/story.js):
//     told Hild (meadow:doran-told) → already cast out north (fate gone; at the frost shrine on the road, alive if Isolde's
//       four braziers burn when the Wraith first comes there, dead in the snow if not);
//     told Doran about Bryn and waited a night (the release on a later day than he asked) → he came back down; he leaves
//       with Wenna (fate moved, where dunes);
//     otherwise → he went up to her and is lost with her (fate dead).
//   Hearn's own (systems/villagers.js doranBrain) hide him once his fate takes him away.

import { manorWorld, MANOR, FACING } from '../world/manor.js';

/** Bryn stands at one of the hall's tall front windows (world/manor.js: WU[4] = 19, the glass mostly gone), looking out over the
 *  forecourt where the stair arrives: the hall's front wall is drawn at manor f = −12 and its site stands BACK (13 m) behind, so the
 *  window is at f ≈ −25.9; she is a metre inside it, on the upper floor, the sill at her waist. */
export const DORAN = { shrine: 'shrine-frost-3', windowAt: [19, -26.8], windowFloor: 3.9 };

/** Doran's fate at the Bellwether's release, from the flags and the days (pure: tests/doran.test.js). */
export function doranFate(flags, vars) {
  if (flags.has('meadow:doran-told')) return { fate: 'gone', where: 'frost-shrine' };
  if (flags.has('meadow:doran-goodbye') && (vars.days || 0) > (vars['doran.goodbyeDay'] ?? Infinity)) return { fate: 'moved', where: 'dunes' };
  return { fate: 'dead', where: 'manor' };
}

/** @param {any} g  shared boot context */
export function addDoranSystem(g) {
  const { chapter, loop, controller } = g;
  const flags = chapter.graph.flags, vars = chapter.graph.vars;
  const api = g.npcApi;
  const setFate = (f, where) => { for (const s of ['dead', 'gone', 'moved']) flags.delete('fate:doran:' + s); flags.add('fate:doran:' + f); for (const k of [...flags]) if (k.startsWith('where:doran:')) flags.delete(k); flags.add('where:doran:' + where); };

  // Bryn at the window: her own floor (the hall's upper floor behind the lancet), still, the lamp lit.
  let bryn = null;
  const [bx, bz] = manorWorld(DORAN.windowAt[0], DORAN.windowAt[1]), floorY = MANOR.y + DORAN.windowFloor;
  const floor = { qx: 0.5, qz: 0.5, h: 0.5, sample() { this.h = floorY; }, covers() { return true; } };
  function brynTick() {
    const want = !flags.has('meadow:bellwether-released') && Math.hypot(controller.pos.x - bx, controller.pos.z - bz) < 400;
    if (want && !bryn) {
      bryn = api.make('meadow-bryn', null, 'lantern', [bx, bz], { interact: false, ground: floor, tint: [1.2, 0.95, 0.7] });
      bryn.brain = (n) => { n.x = bx; n.z = bz; n.vx = 0; n.vz = 0; n.yaw = FACING; n.noLook = true; n.hunch = 0.05; };
    }
    if (bryn) bryn.hide = !want;
    // Her lamp: a steady warm light in the window (it never flickers: 'lamp' kind, no flame), seen from the forecourt at night.
    if (!lamp && g.worldLights) { const [lx, lz] = manorWorld(DORAN.windowAt[0], DORAN.windowAt[1] + 0.5); lamp = g.worldLights.add({ x: lx, y: floorY + 1.1, z: lz, radius: 7, color: [1, 0.66, 0.32], intensity: 1.6, kind: 'lamp', level: 0 }); }
    if (lamp) lamp.level = want ? 0.35 + 0.65 * g.worldLights.night : 0;
  }
  let lamp = null;

  // Doran in the north: at the frost shrine on the road, alive by Isolde's fire, or not.
  let exile = null;
  function exileTick() {
    if (!flags.has('meadow:doran-told')) return;
    const sh = chapter.table[DORAN.shrine].pos, at = [sh[0] + 3.5, sh[1] - 2.5];
    const d = Math.hypot(controller.pos.x - at[0], controller.pos.z - at[1]);
    if (d > 260) return;
    // Settled the first time the Wraith comes near: the braziers lit or not, then.
    if (!flags.has('doran:exile-alive') && !flags.has('fate:doran:dead')) {
      if ((vars.braziers || 0) >= 4) flags.add('doran:exile-alive'); else { setFate('dead', 'frost-shrine'); flags.add('know:doran-froze'); }
    }
    if (!exile) {
      const alive = flags.has('doran:exile-alive');
      exile = api.make(alive ? 'meadow-doran' : 'doran-frozen', alive ? 'Doran' : null, 'elder', at, { interact: alive, tint: [1.2, 1.2, 1.7] });
      exile.yaw = Math.atan2(sh[0] - at[0], sh[1] - at[1]);
      exile.brain = (n, dt) => { n.vx = 0; n.vz = 0; n.noLook = !alive; n.hunch = alive ? 0.45 : 0.75; if (!alive) { n.t = (n.t || 0) + dt; if (n.t > 3 && n.shown) n.frozen = true; } };
    }
  }

  let wasReleased = null;
  loop.add({ name: 'doran', update: () => {
    // The night he asked for begins when he is told.
    if (flags.has('meadow:doran-goodbye') && vars['doran.goodbyeDay'] === undefined) vars['doran.goodbyeDay'] = vars.days || 0;
    const rel = flags.has('meadow:bellwether-released');
    if (wasReleased === false && rel && !flags.has('fate:doran:dead') && !flags.has('fate:doran:moved') && !flags.has('meadow:doran-told')) {
      const f = doranFate(flags, vars);
      setFate(f.fate, f.where);
      if (f.fate === 'moved') flags.add('meadow:doran-back');
    }
    // (A save made before this system existed, released with no fate: settle it as at the release.)
    if (rel && wasReleased === null && !flags.has('meadow:doran-told') && !flags.has('fate:doran:dead') && !flags.has('fate:doran:moved')) {
      const f = doranFate(flags, vars); setFate(f.fate, f.where); if (f.fate === 'moved') flags.add('meadow:doran-back');
    }
    wasReleased = rel;
    if (g.npcApi) { brynTick(); exileTick(); }
  } });
  { const prev = g.navSync; g.navSync = () => { prev?.(); wasReleased = null; }; }
}
