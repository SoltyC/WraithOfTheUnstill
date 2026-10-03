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
