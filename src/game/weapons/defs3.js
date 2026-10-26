// The Bell-mace (docs/mace-design.md), as data in the format of defs.js (read the header there for
// the pose and attack layouts). A Shaper bell on an oak haft that stores the height you fall and
// pays it out in one tolling blow (game/weapons/plunge.js). On the ground it is the weakest weapon
// in the game on purpose: a slow three-hit combo and a short hop-swing that leaves the Wraith just
// high enough for a small plunge. Pairs with Gale (the Updraft takes you up).
//
// Extra fields used only by this weapon:
//   heavy.hop    the hop-swing lifts the Wraith this many metres (forged tier I: 4)
//   plunge       the plunge's numbers: the damage curve, the toll, the rebound and its decay, the
//                bonuses (Updraft, Downdraft), the dunk, the ice star, the Flow effects, and the two
//                attacks that play it out (`hit`: the blow and a short recovery; `miss`: the kneel)
//   attack.kneel the Wraith is on one knee: it cannot walk

export const maceDef = {
  id: 'mace', name: 'Bell-mace', family: 'mace',
  twoHanded: true, mainHand: 1, restHand: 1, support: 0.4, restSlide: 0, restPose: [0.12, 0.8, 0, 0.2, 0.2, 0.08, 0, 0.06],
  blunt: true, edge: false,
  trail: { y0: 0.5, y1: 1.25, z1: 0, tint: [1.0, 0.86, 0.58], strength: 0.5 },
  // A bell breaks ice about as well as a mace should, but not by itself: the star does the shattering (plunge.js).
  affinity: { frozen: 1.5, shatterHeavy: false, armourPass: 0.55, meadow: 1.1 },
  move: { windup: 0.4, active: 0.2, recover: 0.5, charge: 0.4 },
  combo: [
    { windup: 0.26, active: 0.14, recover: 0.52, link: 0.6, dmg: 9, stagger: false, knock: 2.0, reach: 2.0, inner: 0.3, lunge: 1.1,
      chip: 6, stop: 0.02, shake: 0.002, kick: 0.006, sfx: 'thud', brush: 'score',
      wind: [0.7, 0.9, 0, 0.26, 0.6, 0.1, 0.55, -0.08], strike: [-0.65, 0.05, 0, 0.0, 0.46, 0.4, -0.55, 0.14], end: [-0.85, 0.1, 0, -0.06, 0.45, 0.34, -0.7, 0.1] },
    { windup: 0.26, active: 0.14, recover: 0.52, link: 0.6, dmg: 9, stagger: false, knock: 2.0, reach: 2.0, inner: 0.3, lunge: 1.1,
      chip: 6, stop: 0.02, shake: 0.002, kick: 0.006, sfx: 'thud', brush: 'score',
      wind: [-0.85, 0.7, 0, -0.12, 0.55, 0.2, -0.7, -0.05], strike: [0.7, 0.08, 0, 0.3, 0.46, 0.4, 0.62, 0.12], end: [0.9, 0.12, 0, 0.32, 0.44, 0.3, 0.8, 0.08] },
    // The third swing is the bell brought down, a little: nothing like the plunge.
    { windup: 0.34, active: 0.15, recover: 0.7, link: 1, dmg: 14, stagger: true, knock: 3.2, reach: 2.0, inner: 0.3, lunge: 1.6,
      chip: 12, stop: 0.04, shake: 0.008, kick: 0.016, sfx: 'thud', brush: 'dent',
      wind: [0.1, 1.5, 0, 0.12, 0.95, 0.0, 0.3, -0.18], strike: [0, -0.5, 0, 0.04, 0.5, 0.5, -0.1, 0.5], end: [0, -0.55, 0, 0.04, 0.5, 0.5, -0.1, 0.46] },
  ],
  // Heavy: the hop-swing. The Wraith springs and swings in one motion and is left in the air, `hop` m up.
  heavy: {
    kind: 'hop', hop: 2.5, chargeMax: 0.3, power: 0.2,
    windup: 0.16, active: 0.14, recover: 0.5, link: 1, impactAt: 1,
    dmg: 11, stagger: true, knock: 3, reach: 2.2, inner: 0.3, radius: 0, lunge: 0.4,
    chip: 8, stop: 0.03, shake: 0.004, kick: 0.01, sfx: 'thud', brush: 'score',
    wind: [0.5, 0.7, 0, 0.2, 0.55, 0.1, 0.55, -0.12], strike: [-0.4, 0.2, 0, 0.0, 0.5, 0.42, -0.45, 0.1], end: [-0.5, 0.2, 0, -0.04, 0.48, 0.38, -0.5, 0.06],
  },
  // The plunge (plunge.js): LMB in the air. `windup` is the pull of the bell overhead, the one stretch in which it can still be cancelled.
  plunge: {
    speed: 30, drift: 0.35, glideDrift: 0.6, clearance: 2.5, assist: 2.5, commitWindow: 0.12,      // m/s fall, share of the horizontal drift kept, m of air needed under the Wraith, aim-assist bend (m)
    dmg: 18, dmgPerM: 3.2, hMax: 20, wardenCap: 56,                                                // 18 + 3.2 h, h capped at 20 m, the most a Warden takes
    tollR0: 1.6, tollRk: 0.16, tollEdge: 0.4, knock0: 3, knockPerM: 0.32, poiseFrom: 8,            // the toll: radius 1.6 + 0.16 h, the edge takes 40 %, poise counts double from 8 m
    rebound: 0.5, reboundMax: 8, decay: 0.3, decayFlow: 0.2, reboundDrift: 9, reboundDriftSpeed: 6,    // throw back up 0.5 h (max 8 m), 30 % less each time (20 % at Flow 2+)
    updraft: 4, downdraft: 5, glideHalf: 0.5,                                                      // +4 m inside an Updraft column, +5 m from a Gust cast in the fall, a glide's sink counts at half
    dunk: 0.6, dunkRadius: 2.4, dunkKnock: 6,                                                      // the second impact: 60 % of the damage in 2.4 m
    starFrom: 6, starLen: 0.5, trailFrom: 6,                                                       // the ice star: from 6 m, arms h/2 m long; the fall trail from 6 m
    flowRim: 1.5, flowUpdraft: 12, updraftLife: 1.2, updraftPower: 0.5,                            // Flow 2+: a rim of wind for 1.5 s; Flow 3 (or tier V): from 12 m a small Updraft
    infuseFreeze: 1.4, infuseRebound: 2,                                                           // tier III: frost freezes the ring on the third plunge, gale adds 2 m to the rebound
    tollBonus: 0,                                                                                  // tier IV: +0.6 m of toll
    thunder: false,                                                                                // tier V: Thunderhead
    stop: 0.07, shake: 0.03, kick: 0.04, chip: 30,
    // The attacks that play it out: the blow at the bottom (pose: bell brought down), then either a short recovery or the kneel.
    hit: { windup: 0.12, active: 0.1, recover: 0.22, link: 1, dmg: 0, stagger: true, knock: 0, reach: 0, inner: 0, radius: 0, lunge: 0, chip: 0, stop: 0, shake: 0, kick: 0, sfx: 'boom', brush: 'dent',
      wind: [0, 1.75, 0, 0.1, 1.0, -0.02, 0, -0.28], strike: [0, -0.8, 0, 0.05, 0.5, 0.52, 0, 0.62], end: [0, -0.75, 0, 0.05, 0.5, 0.52, 0, 0.5] },
    miss: { windup: 0.12, active: 0.1, recover: 0.55, link: 1, dmg: 0, stagger: true, knock: 0, reach: 0, inner: 0, radius: 0, lunge: 0, chip: 0, stop: 0, shake: 0, kick: 0, sfx: 'boom', brush: 'dent', kneel: true,
      wind: [0, 1.75, 0, 0.1, 1.0, -0.02, 0, -0.28], strike: [0, -0.8, 0, 0.05, 0.5, 0.52, 0, 0.62], end: [0, -1.0, 0, 0.04, 0.3, 0.46, 0, 0.95] },
  },
};
