// Weapons lying in the world (docs §11.2): each is placed, named and taken once — no random loot.
// `slot` is the weapon mesh's display slot (render/weaponGeo.js SLOT), `at` the world x, z, `yaw` the
// way it faces; `y` is filled in from the ground once it has streamed in (systems/weaponView.js).

export const weaponFinds = [
  {
    id: 'sickles', slot: 4, at: [-47, 872], yaw: 0.6, name: 'Sickle pair', place: 'The reaper\'s stand',
    text: 'Two iron sickles hang on a weathered post at the field\'s edge, the oak of their handles worn smooth. Fast and close; the cuts bleed.',
  },
  {
    id: 'maul', slot: 5, at: [1090, 2722], yaw: 2.2, name: 'Shaper maul', place: 'The cold forge',
    text: 'A Shaper\'s maul, left leaning on a broken anvil-stone. Slow and heavy: it staggers whatever it hits, drives through armour and shatters ice.',
  },
];
