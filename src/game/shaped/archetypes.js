// Frost Shaped archetypes (BRIEF §8.3: per biome three — a fast swarmer, a mid-sized bruiser, a
// ranged or area caster). Shapes for the procedural body (body.js) plus combat and look data.

/** @type {Record<string, any>} */
export const ARCHETYPES = {
  // Rime hound: a low, quick quadruped of packed snow with an ice-shard spine. Hunts in packs,
  // circles, telegraphs a lunge by crouching while the frost along its back cracks and glows.
  hound: {
    shape: {
      spine: 5, spacing: 0.27, hip: 0.62,
      legs: [
        { at: 1, side: -1, upper: 0.34, lower: 0.36, reach: 0.2, kneeBack: false, group: 0 },
        { at: 1, side: 1, upper: 0.34, lower: 0.36, reach: 0.2, kneeBack: false, group: 1 },
        { at: 4, side: -1, upper: 0.36, lower: 0.36, reach: 0.2, kneeBack: true, group: 1 },
        { at: 4, side: 1, upper: 0.36, lower: 0.36, reach: 0.2, kneeBack: true, group: 0 },
      ],
      tail: 4, tailSpacing: 0.18, headUp: 0.14,
      stride: 0.55, swing: 0.24, lift: 0.12, maxSpeed: 7.5, accel: 14, turnRate: 4.5,
    },
    health: 40, chunks: 80, rig: { girth: 0.44, leg: 0.3, head: 0.42, shards: 1 },
    role: 'flank', knock: 2.2,
  },
  // Drift brute: a heavy knuckle-walker of packed snow, twice the Wraith's height at the shoulder.
  // Slow, shrugs off light hits; rears up (cracks glowing) and slams, cratering the snow.
  brute: {
    shape: {
      spine: 4, spacing: 0.6, hip: 1.65,
      legs: [
        { at: 0, side: -1, upper: 1.02, lower: 1.08, reach: 0.68, kneeBack: false, group: 0 },
        { at: 0, side: 1, upper: 1.02, lower: 1.08, reach: 0.68, kneeBack: false, group: 1 },
        { at: 3, side: -1, upper: 0.86, lower: 0.88, reach: 0.5, kneeBack: true, group: 1 },
        { at: 3, side: 1, upper: 0.86, lower: 0.88, reach: 0.5, kneeBack: true, group: 0 },
      ],
      tail: 0, tailSpacing: 0.2, headUp: 0.25,
      stride: 1.6, swing: 0.55, lift: 0.3, maxSpeed: 3.4, accel: 5, turnRate: 1.5,
    },
    health: 160, chunks: 96, rig: { girth: 0.42, leg: 0.3, head: 0.3, shards: 2 },
    role: 'advance', poise: 30, slamRadius: 3, slamDamage: 30, knock: 0.5,
  },
  // Hoarfrost seer: tall and thin on four stilt legs, it keeps its distance and throws ice
  // shards (a glow gathers in its core first).
  seer: {
    shape: {
      spine: 3, spacing: 0.34, hip: 1.95,
      legs: [
        { at: 0, side: -1, upper: 1.04, lower: 1.1, reach: 0.5, kneeBack: false, group: 0 },
        { at: 0, side: 1, upper: 1.04, lower: 1.1, reach: 0.5, kneeBack: false, group: 1 },
        { at: 2, side: -1, upper: 1.04, lower: 1.1, reach: 0.5, kneeBack: true, group: 1 },
        { at: 2, side: 1, upper: 1.04, lower: 1.1, reach: 0.5, kneeBack: true, group: 0 },
      ],
      tail: 3, tailSpacing: 0.22, headUp: 0.32,
      stride: 1.0, swing: 0.4, lift: 0.18, maxSpeed: 4.2, accel: 7, turnRate: 3,
    },
    health: 55, chunks: 64, rig: { girth: 0.16, leg: 0.06, head: 0.17, shards: 3 },
    role: 'ranged', keep: 11, shardDamage: 10, knock: 1.4,
  },
};

// The den mother (side quest "The Den Mother"): an old drift brute grown huge in the hounds' den,
// crusted in a rime armour that turns most of a blow aside — freeze her, and the armour is only
// ice. The brute's shape scaled up a third; slower, heavier, a wider slam.
{
  const B = ARCHETYPES.brute, k = 1.32;
  const sh = B.shape;
  ARCHETYPES.denmother = {
    shape: {
      ...sh, spacing: sh.spacing * k, hip: sh.hip * k,
      legs: sh.legs.map((l) => ({ ...l, upper: l.upper * k, lower: l.lower * k, reach: l.reach * k })),
      headUp: sh.headUp * k, stride: sh.stride * k, swing: sh.swing * k, lift: sh.lift * k, maxSpeed: 3.0, accel: 4, turnRate: 1.2,
    },
    health: 420, chunks: 96, rig: { ...B.rig, shards: 3 },
    role: 'advance', poise: 70, slamRadius: 4.2, slamDamage: 36, knock: 0.25,
    /** Unfrozen, blows do this fraction of their damage (the rime armour). */
    armour: 0.3,
  };
}

// ---- Meadow Shaped (PLAN M8): the Shapers' field-hands, made of grass, turf, reed and stone.
// `material: 'meadow'` (absent = 'frost') plus a `variant` select the chunk kinds in rig.js; their
// light is a warm seed-amber. Roles borrow the nearest frost behaviour until M8's own land.

/** @type {Record<string, any>} */
export const MEADOW_ARCHETYPES = {
  // Sedgerunner: a lean, long-legged runner of plaited sedge, a ruff of awns at the neck, a seed-pod
  // core. Light: a Gust bowls it over.
  sedgerunner: {
    shape: {
      spine: 5, spacing: 0.34, hip: 0.8,
      legs: [
        { at: 1, side: -1, upper: 0.46, lower: 0.5, reach: 0.15, kneeBack: false, group: 0 },
        { at: 1, side: 1, upper: 0.46, lower: 0.5, reach: 0.15, kneeBack: false, group: 1 },
        { at: 4, side: -1, upper: 0.48, lower: 0.5, reach: 0.15, kneeBack: true, group: 1 },
        { at: 4, side: 1, upper: 0.48, lower: 0.5, reach: 0.15, kneeBack: true, group: 0 },
      ],
      tail: 3, tailSpacing: 0.14, headUp: 0.1,
      stride: 0.8, swing: 0.2, lift: 0.14, maxSpeed: 9, accel: 18, turnRate: 6,
    },
    health: 28, chunks: 72, rig: { girth: 0.26, leg: 0.11, head: 0.3, variant: 'sedge' },
    role: 'flank', knock: 3.6, material: 'meadow', variant: 'sedge',
    behaviour: 'flush', // hidden in the grass until the flock breaks (game/shaped/behaviours.js)
  },
  // Hedgewarden: a hunched, broad mound of turf over drystone ribs and roots, a standing stone
  // carried on its back, root-hands it walks on. Slow and heavy.
  hedgewarden: {
    shape: {
      spine: 4, spacing: 0.66, hip: 1.3,
      legs: [
        { at: 0, side: -1, upper: 0.82, lower: 0.9, reach: 0.82, kneeBack: false, group: 0 },
        { at: 0, side: 1, upper: 0.82, lower: 0.9, reach: 0.82, kneeBack: false, group: 1 },
        { at: 3, side: -1, upper: 0.62, lower: 0.72, reach: 0.6, kneeBack: true, group: 1 },
        { at: 3, side: 1, upper: 0.62, lower: 0.72, reach: 0.6, kneeBack: true, group: 0 },
      ],
      tail: 0, tailSpacing: 0.2, headUp: -0.1,
      stride: 1.4, swing: 0.6, lift: 0.26, maxSpeed: 2.6, accel: 4, turnRate: 1.3,
    },
    health: 200, chunks: 96, rig: { girth: 0.5, leg: 0.2, head: 0.3, variant: 'turf' },
    role: 'advance', poise: 40, slamRadius: 3, slamDamage: 28, knock: 0.4, material: 'meadow', variant: 'turf',
    behaviour: 'territory', // keeps its boundary; ignores the Wraith outside it
  },
  // Chanter: tall and stilt-legged like a heron, a long upright neck of reed and a hollow
  // bell-flower head. Keeps its distance; the shard attack stands in for its pollen.
  chanter: {
    shape: {
      spine: 3, spacing: 0.45, hip: 2.1,
      legs: [
        { at: 1, side: -1, upper: 1.12, lower: 1.2, reach: 0.2, kneeBack: true, group: 0 },
        { at: 1, side: 1, upper: 1.12, lower: 1.2, reach: 0.2, kneeBack: true, group: 1 },
      ],
      tail: 2, tailSpacing: 0.2, headUp: 1.05,
      stride: 1.1, swing: 0.45, lift: 0.2, maxSpeed: 4, accel: 6, turnRate: 2.6,
    },
    health: 50, chunks: 64, rig: { girth: 0.17, leg: 0.035, head: 0.1, variant: 'reed' },
    role: 'ranged', keep: 12, shardDamage: 0, knock: 1.4, material: 'meadow', variant: 'reed',
    behaviour: 'support', // its song heals the wounded; its breath hangs pollen (no shards: pollen is its weapon)
  },
};
Object.assign(ARCHETYPES, MEADOW_ARCHETYPES);
