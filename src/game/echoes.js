// Echoes (BRIEF §2.4): few upgrades, each with a visible effect. Applying one scales the tuning it
// names, once (a load re-applies the saved set on fresh tuning). Effects are described to the
// player in data/quests/<biome>.json.

/** @type {Record<string, (g: any) => void>} */
export const ECHO_EFFECTS = {
  // Ribbon reaches 25 % farther: its nodes fly faster for the same life.
  'echo-frost-reach': (g) => { g.frostMod.ribbonTuning.speed *= 1.25; },
  // Frozen joints and Shaped hold 40 % longer.
  'echo-frost-hold': (g) => { g.warden.thawTime *= 1.4; g.combatTuning.freezeTime *= 1.4; },
  // Snow-surf keeps its speed on flats: less snow friction and drag.
  'echo-frost-surf': (g) => { g.surfTuning.friction *= 0.6; g.surfTuning.drag *= 0.85; g.surfTuning.cruise *= 1.12; },
  // Sweep reaches 20 % farther along the ground.
  'echo-frost-sweep': (g) => { g.frostMod.sweepTuning.range *= 1.2; },
  // Focus returns faster while standing still.
  'echo-frost-still': (g) => { g.combatTuning.focusIdle *= 2.2; },
};

/** Apply an Echo's effect once. */
export function applyEcho(g, id) {
  g.echoesApplied ||= new Set();
  if (g.echoesApplied.has(id) || !ECHO_EFFECTS[id]) return;
  g.echoesApplied.add(id);
  ECHO_EFFECTS[id](g);
}
