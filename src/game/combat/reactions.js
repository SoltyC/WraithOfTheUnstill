// Material reactions as data (BRIEF §4.4): surface × element → what happens and which state
// channels it writes. The brush programs implement the rows; this table is what they are tested
// against (BRIEF §19). `brush` names the BRUSH program(s) the game uses now; null = not built yet.

/** State channels a reaction may touch. */
export const CHANNELS = ['depression', 'displaced', 'compaction', 'wetness', 'thermal', 'transform', 'flatten'];
export const SURFACES = ['snow', 'water', 'sand', 'mud', 'grass', 'ash'];
export const ELEMENTS = ['frost', 'gale', 'stone', 'tide', 'ember'];

const r = (result, writes, brush = null) => ({ result, brush, writes });
/** A Stone cell (D4): `brush` names the programs Shard (PRESS, MOUND), Ridge (RIDGE) and Bloom (CRATER) use there. `nothing`: explicitly no brush. `stub`: the surface does not exist yet; the brushes already work on it. */
const rs = (result, writes, brush, flags = {}) => ({ result, brush, writes, ...flags });

/** @type {Record<string, Record<string, { result: string, brush: string|string[]|null, writes: string[] }>>} */
export const REACTIONS = {
  snow: {
    frost: r('Packs into ice crust', ['compaction', 'thermal', 'transform']),
    gale: r('Strips into spindrift, scours a ring', ['depression', 'displaced', 'flatten'], ['FLATTEN', 'STRIP']),
    stone: rs('Hurls snow and earth', ['depression', 'displaced'], ['PRESS', 'MOUND', 'RIDGE', 'CRATER']),
    tide: r('Slush', ['wetness', 'compaction']),
    ember: r('Melts to slush, then refreezes to ice', ['thermal', 'wetness', 'transform']),
  },
  water: {
    frost: r('Ice (bridges, platforms)', ['thermal', 'transform']),
    gale: r('Waves, spray', ['displaced', 'depression']),
    stone: rs('Only splashes', ['wetness'], null, { nothing: true }),
    tide: r('Surge, whirlpool', ['displaced', 'depression']),
    ember: r('Steam (occludes, scatters light)', ['thermal', 'wetness']),
  },
  sand: {
    frost: r('Frost-bound and firm', ['compaction', 'thermal']),
    gale: r('Erases and re-ripples, sand plume', ['depression', 'displaced', 'flatten'], ['FLATTEN', 'STRIP']),
    stone: rs('Erupts, raises ridges (a sand ridge will slump: D2)', ['displaced', 'depression'], ['PRESS', 'MOUND', 'RIDGE', 'CRATER'], { stub: 'D2' }),
    tide: r('Packed wet sand that holds sharp prints', ['wetness', 'compaction']),
    ember: r('Fuses to glass (permanent)', ['thermal', 'transform']),
  },
  mud: {
    frost: r('Frozen crust', ['thermal', 'transform']),
    gale: r('Nothing', ['flatten']),
    stone: rs('Raised banks', ['displaced', 'depression'], ['PRESS', 'MOUND', 'RIDGE', 'CRATER'], { stub: 'Phase 10' }),
    tide: r('Draw dries it to cracked, walkable crust', ['wetness', 'compaction', 'transform']),
    ember: r('Bakes hard', ['thermal', 'compaction', 'wetness']),
  },
  grass: {
    // Frost on turf: the blades frost stiff and lie flat; no lasting ice (see `turf` in terrainState).
    frost: r('Frosted, brittle', ['thermal', 'flatten'], ['FREEZE']),
    // Gust and Vortex lay the blades (state.x), which then recover.
    gale: r('Flattened lanes that recover', ['flatten', 'compaction'], ['FLATTEN', 'STRIP']),
    stone: rs('Torn turf, which regrows', ['depression', 'displaced', 'flatten'], ['PRESS', 'MOUND', 'RIDGE', 'CRATER']),
    tide: r('Drenched', ['wetness']),
    ember: r('Burns, spreads downwind, leaves ash, regrows over in-game days', ['thermal', 'transform']),
  },
  ash: {
    frost: r('Obsidian (permanent) plus steam', ['thermal', 'transform']),
    gale: r('Ash plume that exposes the glowing crust', ['displaced', 'depression', 'flatten'], ['FLATTEN', 'STRIP']),
    stone: rs('Cracks the crust', ['depression', 'displaced'], ['PRESS', 'MOUND', 'RIDGE', 'CRATER'], { stub: 'Phase 11' }),
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
  // Stone (D4). Ridge + Frost: Crystallize near a wall freezes it to an ice rampart that holds its shape.
  ridgeFrost: { result: 'Ridge, then Crystallize: an ice rampart that keeps its shape', implemented: true, brush: ['RIDGE', 'FREEZE'] },
  // Shard + Ribbon: a plate that passes through the stream is carried faster and soaks what it strikes.
  shardRibbon: { result: 'A Shard through a Ribbon is carried faster and soaks what it strikes', implemented: true, brush: 'PRESS' },
  // Bloom + Vortex needs sand (D1/D2): the curtain exists, the grit that blasts does not.
  bloomVortex: { result: 'Vortex through a Bloom\'s falling curtain: a sand-blast that chips and blinds', implemented: false, brush: null, stub: 'D1' },
};

/** The reaction for a surface and element; returns null for an unknown key (never throws). */
export function reactionFor(surface, element) {
  const row = Object.prototype.hasOwnProperty.call(REACTIONS, surface) ? REACTIONS[surface] : null;
  if (!row || !Object.prototype.hasOwnProperty.call(row, element)) return null;
  return row[element];
}
