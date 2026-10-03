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
    health: 40, chunks: 80, scale: 1,
  },
};
