// Material reactions as data (BRIEF §4.4): surface × element → what happens and which state
// channels it writes. The brush programs implement the rows; this table is what they are tested
// against (BRIEF §19). `brush` names the BRUSH program(s) the game uses now; null = not built yet.

/** State channels a reaction may touch. */
export const CHANNELS = ['depression', 'displaced', 'compaction', 'wetness', 'thermal', 'transform', 'flatten'];
export const SURFACES = ['snow', 'water', 'sand', 'mud', 'grass', 'ash'];
export const ELEMENTS = ['frost', 'gale', 'stone', 'tide', 'ember'];

const r = (result, writes, brush = null) => ({ result, brush, writes });

/** @type {Record<string, Record<string, { result: string, brush: string|string[]|null, writes: string[] }>>} */
export const REACTIONS = {
  snow: {
    frost: r('Packs into ice crust', ['compaction', 'thermal', 'transform']),
    gale: r('Strips into spindrift, scours a ring', ['depression', 'displaced', 'flatten'], ['FLATTEN', 'STRIP']),
    stone: r('Hurls snow and earth', ['depression', 'displaced']),
    tide: r('Slush', ['wetness', 'compaction']),
    ember: r('Melts to slush, then refreezes to ice', ['thermal', 'wetness', 'transform']),
  },
  water: {
    frost: r('Ice (bridges, platforms)', ['thermal', 'transform']),
    gale: r('Waves, spray', ['displaced', 'depression']),
    stone: r('Nothing', ['depression']),
    tide: r('Surge, whirlpool', ['displaced', 'depression']),
    ember: r('Steam (occludes, scatters light)', ['thermal', 'wetness']),
  },
  sand: {
    frost: r('Frost-bound and firm', ['compaction', 'thermal']),
    gale: r('Erases and re-ripples, sand plume', ['depression', 'displaced', 'flatten'], ['FLATTEN', 'STRIP']),
    stone: r('Erupts, raises ridges', ['displaced', 'depression']),
    tide: r('Packed wet sand that holds sharp prints', ['wetness', 'compaction']),
    ember: r('Fuses to glass (permanent)', ['thermal', 'transform']),
  },
  mud: {
    frost: r('Frozen crust', ['thermal', 'transform']),
    gale: r('Nothing', ['flatten']),
    stone: r('Raised banks', ['displaced', 'depression']),
    tide: r('Draw dries it to cracked, walkable crust', ['wetness', 'compaction', 'transform']),
    ember: r('Bakes hard', ['thermal', 'compaction', 'wetness']),
  },
  grass: {
    // Frost on turf: the blades frost stiff and lie flat; no lasting ice (see `turf` in terrainState).
    frost: r('Frosted, brittle', ['thermal', 'flatten'], ['FREEZE']),
    // Gust and Vortex lay the blades (state.x), which then recover.
    gale: r('Flattened lanes that recover', ['flatten', 'compaction'], ['FLATTEN', 'STRIP']),
    stone: r('Torn turf', ['depression', 'displaced']),
    tide: r('Drenched', ['wetness']),
    ember: r('Burns, spreads downwind, leaves ash, regrows over in-game days', ['thermal', 'transform']),
  },
  ash: {
    frost: r('Obsidian (permanent) plus steam', ['thermal', 'transform']),
    gale: r('Ash plume that exposes the glowing crust', ['displaced', 'depression', 'flatten'], ['FLATTEN', 'STRIP']),
    stone: r('Cracks the crust', ['depression', 'displaced']),
    tide: r('Steam, cooled crust', ['thermal', 'wetness']),
    ember: r('Re-melts, crust glows', ['thermal', 'transform']),
  },
};

/**
 * Cross-element reactions (PLAN M6) that need two verbs or a verb and a live effect.
 * `implemented`: true once a brush or system does it.
 */
export const CROSS = {
  gustSlush: { result: 'Gust over wet slush throws spray and freezes it to rime', implemented: true, brush: 'FLATTEN' },
  vortexSnow: { result: 'Vortex on snow builds a drift wall', implemented: false, brush: null },
  updraftRibbon: { result: 'Updraft through a Ribbon carries the water up as falling droplets', implemented: false, brush: null },
};

/** The reaction for a surface and element; returns null for an unknown key (never throws). */
export function reactionFor(surface, element) {
  const row = Object.prototype.hasOwnProperty.call(REACTIONS, surface) ? REACTIONS[surface] : null;
  if (!row || !Object.prototype.hasOwnProperty.call(row, element)) return null;
  return row[element];
}
