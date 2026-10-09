// Robes (BRIEF §2.4: found or earned; appearance first, at most one modest property; not a loot
// system). The frost chapter's three, each earned by play — the den mother's rime, gold on the
// Shapers' Run, Isolde's song when every brazier burns — plus the robe the Wraith woke in.
// Owned robes are quest-graph flags (`robe:<id>`), the worn one a variable (`robe`): both saved.
//
// Look: `tint` dyes the outer garments (multiplies the charcoal wool, as the Veiled's dyes do);
// `band` embroiders a hem band in that thread colour; `sash` re-dyes the sash.

export const ROBES = [
  { id: 'wanderer', name: 'The empty robe', how: 'The robe the last Shaper died in.',
    text: 'Charcoal wool, heavy at the hem, worn thin where hands once held it.',
    tint: [1, 1, 1], band: null, sash: null, effect: null },
  { id: 'rime-hide', name: 'Rime-hide mantle', how: 'Taken from the den mother’s hollow, when it was quiet.',
    text: 'Felted pale as old snow, stiff with the den mother’s rime. Claws skate on it.',
    tint: [2.5, 2.55, 2.7], band: [0.3, 0.42, 0.55], sash: null,
    effect: 'Blows from the Shaped land a little lighter.', mods: { shapedDamage: 0.85 } },
  { id: 'runner', name: 'The runner’s robe', how: 'Gold on the Shapers’ Run.',
    text: 'Slate-blue and close-cut for the chute, an oxblood sash to stream behind.',
    tint: [0.85, 1.12, 1.6], band: null, sash: [0.42, 0.07, 0.05],
    effect: 'The crest under a surf runs a little faster.', mods: { surfSpeed: 1.06 } },
  { id: 'ember', name: 'Isolde’s ember robe', how: 'Isolde’s gift, the night every brazier burned.',
    text: 'Dyed the colour of coals and banded in gold thread, the way the pilgrims dress for a song.',
    tint: [2.3, 1.15, 0.6], band: [0.62, 0.43, 0.14], sash: [0.22, 0.12, 0.05],
    effect: 'A carried flame gutters more slowly.', mods: { flameLife: 1.4 } },
];
export const ROBE_BY_ID = Object.fromEntries(ROBES.map((r) => [r.id, r]));

/** Robes the Wraith owns (the wanderer always), given the quest graph's flags. */
export function ownedRobes(flags) { return ROBES.filter((r) => r.id === 'wanderer' || flags.has('robe:' + r.id)); }

/** The worn robe (falls back to the wanderer if the variable names one not owned). */
export function wornRobe(flags, vars) {
  const id = typeof vars.robe === 'string' ? vars.robe : 'wanderer';
  const r = ROBE_BY_ID[id];
  return r && (id === 'wanderer' || flags.has('robe:' + id)) ? r : ROBE_BY_ID.wanderer;
}

/** The modifiers of a robe (1 where it has none). */
export function robeMods(r) {
  const m = r.mods || {};
  return { shapedDamage: m.shapedDamage ?? 1, surfSpeed: m.surfSpeed ?? 1, flameLife: m.flameLife ?? 1 };
}
