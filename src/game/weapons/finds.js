// Weapons lying in the world (docs §11.2): each is placed, named and taken once — no random loot.
// `slot` is the weapon mesh's display slot (render/weaponGeo.js SLOT), `at` the world x, z, `yaw` the
// way it faces; `y` is filled in from the ground once it has streamed in (systems/weaponView.js).
// `needs` (optional) is a quest flag that must be set before the find is there to see or take: the
// glaive and the flail are rewards of quests (the Fallen Stone, Carry the Flame), the first three are not.

export const weaponFinds = [
  {
    id: 'sickles', slot: 4, at: [152, 948], yaw: 0.6, name: 'Sickle pair', place: 'The reaper\'s stand',
    text: 'Two iron sickles hang on a weathered post at the field\'s edge, the oak of their handles worn smooth. Fast and close; the cuts bleed.',
  },
  {
    id: 'maul', slot: 5, at: [1090, 2722], yaw: 2.2, name: 'Shaper maul', place: 'The cold forge',
    text: 'A Shaper\'s maul, left leaning on a broken anvil-stone. Slow and heavy: it staggers whatever it hits, drives through armour and shatters ice.',
  },
  {
    id: 'glaive', slot: 12, at: [235, 742.5], yaw: 2.6, name: 'Shaper glaive', place: 'The Ring of Nine', needs: 'meadow:side-stone-thanked',
    text: 'The stonewright\'s grandfather\'s glaive, planted in the middle of the ring where the ninth stone stood. Long and quick: it cuts a wide arc to either side, its thrust pins whatever it meets, and what it hits at the very tip it hits harder.',
  },
  {
    id: 'flail', slot: 13, at: [878.5, 2441.5], yaw: 1.2, name: 'Lantern flail', place: 'Isolde\'s fire', needs: 'isolde-sang', glow: 0.8,
    text: 'The monastery\'s censer-flail, hung on an iron post by Isolde\'s fire and kept lit for nine winters. A bronze lantern on a chain: it swings in wide rings, sets what it strikes alight and lights the way at night, but it cannot strike what is close, and the ice does not love it.',
  },
];
