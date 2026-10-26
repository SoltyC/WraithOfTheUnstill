// The forge's five tiers per weapon (docs §11.3). Tiers 1, 3 and 5 change how the weapon plays — a
// longer combo, an infusion slot, the weapon's art; tiers 2 and 4 are damage and weight. So no
// upgrade is only numbers twice in a row. A tier's def is the base def with every tier up to it
// applied, built once and cached (never per frame); `id` is unchanged, so the mesh and the pose are
// the weapon's own. Tier 0 is the base def itself (the dev overlay's live edits show there).
//
// Cost: marks and materials (frost: rime cores; meadow: hedge-hearts and turf-amber).

import { weaponDefs } from './defs.js';

/** Weapon damage multiplier by tier (T2 +12 %, T4 +12 % more); T1/3/5 are about the move, not the number. */
export const TIER_DMG = [1, 1, 1.12, 1.12, 1.25, 1.25];

export const FORGE_COST = [
  null,
  { marks: 40, mats: { 'rime-core': 2 } },
  { marks: 70, mats: { 'rime-core': 2 } },
  { marks: 120, mats: { 'hedge-heart': 2, 'turf-amber': 1 } },
  { marks: 200, mats: { 'hedge-heart': 2 } },
  { marks: 320, mats: { 'hedge-heart': 3, 'turf-amber': 2 } },
];

const mirror = (p) => [-p[0], p[1], p[2], -p[3], p[4], p[5], -p[6], p[7]];

/** What each tier does, for the forge page: { name, moves: bool (changes play), text }. */
export const TIER_INFO = {
  staff: [null,
    { name: 'Return sweep', move: true, text: 'A fourth hit in the combo: the staff swings back across, wide and heavy.' },
    { name: 'Seasoned oak', move: false, text: 'Every blow lands 12% harder.' },
    { name: 'Infusion', move: true, text: 'The staff can carry an element; its blows apply that element lightly.' },
    { name: 'Iron-shod', move: false, text: 'A further 12% damage, and the blows throw foes farther.' },
    { name: 'The Plant', move: true, text: 'The overhead slam sends a shock down a seven-metre lane ahead of the impact.' },
  ],
  sickles: [null,
    { name: 'Lunging finish', move: true, text: 'A sixth cut after the cross: a long lunge that closes the gap.' },
    { name: 'Honed edges', move: false, text: 'Every cut lands 12% harder.' },
    { name: 'Infusion', move: true, text: 'The sickles can carry an element; their cuts apply that element lightly.' },
    { name: 'Folded steel', move: false, text: 'A further 12% damage, and the cuts bite deeper into the bleed.' },
    { name: 'Reaper\'s Fold', move: true, text: 'The reap makes three passes and draws foes in toward the Wraith.' },
  ],
  maul: [null,
    { name: 'Backhand', move: true, text: 'A third swing in the combo, back the way the second came.' },
    { name: 'Dressed stone', move: false, text: 'Every blow lands 12% harder.' },
    { name: 'Infusion', move: true, text: 'The maul can carry an element; its blows apply that element lightly.' },
    { name: 'Counterweight', move: false, text: 'A further 12% damage, and the blows throw foes farther.' },
    { name: 'Groundbreaker', move: true, text: 'The smash rings out past its crater: everything within five metres is thrown back.' },
  ],
  glaive: [null,
    { name: 'Rising crescent', move: true, text: 'A fourth cut after the finisher: a rising crescent that throws a whole pack back.' },
    { name: 'Honed edge', move: false, text: 'Every blow lands 12% harder.' },
    { name: 'Infusion', move: true, text: 'The glaive can carry an element; its blows apply that element lightly.' },
    { name: 'Ash-shod shaft', move: false, text: 'A further 12% damage, heavier knock, and the thrust holds a foe longer.' },
    { name: 'Withdrawn fling', move: true, text: 'The thrust runs farther, and as it is drawn back everything it pinned is flung off the blade.' },
  ],
  flail: [null,
    { name: 'Counter-wheel', move: true, text: 'A fourth blow after the wheel: the lantern spins back the other way, gathering what the first turn left.' },
    { name: 'Heavier lantern', move: false, text: 'Every blow lands 12% harder.' },
    { name: 'Infusion', move: true, text: 'The flail can carry an element; the flame takes its colour and its blows apply it lightly.' },
    { name: 'Deep oil', move: false, text: 'A further 12% damage, and the fire burns hotter and longer.' },
    { name: 'Pyre ring', move: true, text: 'The whirl ends with the flame flung to the ground: a ring of fire burns where the Wraith stood.' },
  ],
};

/** Per weapon, per tier: edit a fresh clone of the def (T1/T3/T5 moves, T4 weight). */
const PATCH = {
  staff: {
    1: (d) => { const a = { ...d.combo[0], dmg: 14, reach: 3.1, knock: 3.2, recover: 0.46, link: 0.7, lunge: 2.6 }; d.combo.push(a); },
    4: (d) => { for (const a of d.combo) a.knock *= 1.3; d.heavy.knock *= 1.3; },
    5: (d) => { d.heavy.shock = { len: 7, hw: 1.0, frac: 0.6 }; },
  },
  sickles: {
    1: (d) => { d.combo.push({ ...d.combo[2], hand: 0, dmg: 9, reach: 2.1, lunge: 3.8, recover: 0.3, link: 0.7, stagger: true, knock: 1.6, chip: 5 }); },
    4: (d) => { d.affinity.bleed *= 1.35; d.affinity.bleedTime += 1; },
    5: (d) => { d.heavy.passes = 3; d.heavy.pull = 4.5; d.heavy.active = 0.6; },
  },
  maul: {
    1: (d) => {
      const b = d.combo[1];
      d.combo.push({ ...b, dmg: 34, knock: 6, wind: mirror(b.end), strike: mirror(b.strike), end: mirror(b.wind), recover: 0.56 });
    },
    4: (d) => { for (const a of d.combo) a.knock *= 1.3; d.heavy.knock *= 1.3; },
    5: (d) => { d.heavy.ring = { radius: 5, frac: 0.4, knock: 7 }; },
  },
  glaive: {
    1: (d) => {
      d.combo.push({ ...d.combo[2], dmg: 16, knock: 6.5, reach: 3.8, windup: 0.2, recover: 0.5, link: 0.7, lunge: 2.0,
        wind: [-0.9, -0.3, 0, -0.1, 0.4, 0.3, -0.8, 0.15], strike: [0.9, 0.7, 0, 0.3, 0.6, 0.35, 0.85, -0.05], end: [1.0, 0.6, 0, 0.32, 0.58, 0.3, 0.95, -0.02] });
    },
    4: (d) => { for (const a of d.combo) a.knock *= 1.3; d.heavy.pin += 0.3; },
    5: (d) => { d.heavy.fling = { knock: 9, frac: 0.4 }; d.heavy.reach = 5.0; d.heavy.pin = Math.max(d.heavy.pin, 1.4); },
  },
  flail: {
    1: (d) => {
      const w = d.combo[2];
      d.combo.push({ ...w, dmg: 13, wind: mirror(w.wind), strike: mirror(w.strike), end: mirror(w.end), windup: 0.2, recover: 0.6 });
    },
    4: (d) => { d.affinity.burn *= 1.3; d.affinity.burnTime += 1.5; },
    5: (d) => { d.heavy.pyre = { radius: 3.2, time: 4 }; },
  },
};

const cache = new Map();

/** The def of weapon `base` at forge tier `tier` (0 = the base def). */
export function tierDef(base, tier) {
  if (!base || tier <= 0) return base;
  const key = base.id + ':' + tier;
  let d = cache.get(key);
  if (d) return d;
  d = structuredClone(base);
  d.dmgMul = TIER_DMG[tier];
  d.infusable = tier >= 3;
  const patch = PATCH[base.id] || {};
  for (let t = 1; t <= tier; t++) if (patch[t]) patch[t](d);
  cache.set(key, d);
  return d;
}

/** Forget derived defs (tests, or when base defs are edited). */
export function clearTierCache() { cache.clear(); }

export const maxTier = 5;
export const hasTiers = (id) => !!weaponDefs[id] && !!TIER_INFO[id];
