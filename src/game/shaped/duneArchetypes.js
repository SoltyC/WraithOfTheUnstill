// Six-legged dune Shaped, scaled from the same procedural skeleton as the frost creatures.
const legs = (upper, lower, reach) => [0, 1, 2].flatMap((at) => [-1, 1].map((side) => ({ at, side, upper, lower, reach, kneeBack: at > 0, group: (at + (side > 0 ? 1 : 0)) % 2 })));
export const DUNE_ARCHETYPES = {
  skitter: {
    shape: { spine: 4, spacing: 0.28, hip: 0.55, legs: legs(0.32, 0.34, 0.26), tail: 3, tailSpacing: 0.17, headUp: 0.08, stride: 0.55, swing: 0.24, lift: 0.1, maxSpeed: 7.5, accel: 14, turnRate: 4.5 },
    health: 40, chunks: 96, rig: { girth: 0.55, leg: 0.13, head: 0.42, variant: 'skitter' }, role: 'flank', knock: 2.2, material: 'dune',
  },
  plateback: {
    shape: { spine: 4, spacing: 0.65, hip: 1.2, legs: legs(0.72, 0.72, 0.72), tail: 0, tailSpacing: 0.2, headUp: 0.1, stride: 1.3, swing: 0.5, lift: 0.22, maxSpeed: 3.4, accel: 5, turnRate: 1.4 },
    health: 160, chunks: 96, rig: { girth: 0.62, leg: 0.16, head: 0.35, variant: 'plate' }, role: 'advance', poise: 30, slamRadius: 3, slamDamage: 28, knock: 0.5, material: 'dune',
  },
};
