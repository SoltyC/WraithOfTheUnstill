// Weapon definitions as data (docs/gameplay-design.md §11.2): reach, timings, damage and the
// material affinities of each family, plus the keyframes of every attack's procedural pose. The
// machine (machine.js) reads timings, the hit code (weapons.js) reads arcs and damage, the pose
// code (pose.js) reads the keyframes. Every number here is live-tunable from the dev overlay
// (ui/overlay/weaponTools.js).
//
// A pose is [phi, elev, roll, gx, gy, gz, twist, lean]: the weapon's direction in the torso frame
// (phi = sweep to the right, elev = up from horizontal), its roll about its own shaft, the grip
// (right hand; x right, y up from the pelvis, z forward) and the torso's twist and extra lean
// (rad). Left-hand attacks mirror the pose. The world sweep angle of a swing is phi + twist.
// Attack = { windup, active, recover, link } seconds (link: the share of the recovery after which
// a buffered press chains), then `wind` (cocked), `strike` (the end of the swing) and `end` (the
// follow-through) poses.

import { glaiveDef, flailDef } from './defs2.js';

export const WEAPON_ID = { STAFF: 'staff', SICKLES: 'sickles', MAUL: 'maul', GLAIVE: 'glaive', FLAIL: 'flail' };

/** Timings shared by all weapons (s). */
export const weaponFeel = {
  buffer: 0.15,       // a press this early before a swing can start is kept
  chainKeep: 0.45,    // a press during the cut or recovery waits this long for the link point
  dodgeBuffer: 0.22,  // a dodge pressed mid-swing fires when the recovery begins
  holdAt: 0.26,       // a held press this long becomes a heavy charge
  swapTime: 0.32,     // the draw after swapping weapons (no attacks)
  assistRange: 7, assistCone: 0.95,   // aim assist: nearest Shaped within this range and half-angle (rad)
  turnRate: 22,       // 1/s: how fast the facing eases to the swing's heading in the windup
};

const rest = (a) => a;

export const weaponDefs = {
  // ---------------------------------------------------------------------------------------------
  // Pilgrim's staff: reach and wide sweeping arcs, defensive. A walking staff of oak with a
  // carved stone bead, the Shapers' marks cut along it. Two hands. Pairs with Frost.
  staff: {
    id: 'staff', name: 'Pilgrim\'s staff', family: 'staff',
    twoHanded: true, mainHand: 1, restHand: 0, support: 0.5, restSlide: 0.35, restPose: rest([0.08, 1.45, 0, -0.22, 0.12, 0.2, 0, 0]),
    blunt: true, edge: false,
    trail: { y0: 0.9, y1: 1.3, z1: 0, tint: [0.85, 0.92, 1.0], strength: 0.4 },
    // Material affinity (affinity.js): a staff cracks frozen Shaped (more with the slam, which shatters them), turns armour as ever.
    affinity: { frozen: 1.8, shatterHeavy: true, armourPass: 0.3, meadow: 1 },
    move: { windup: 0.5, active: 0.3, recover: 0.7, charge: 0.4 },     // walking speed scale per phase
    combo: [
      { windup: 0.18, active: 0.12, recover: 0.34, link: 0.5, dmg: 11, stagger: true, knock: 1.2, reach: 2.7, inner: 0.35, lunge: 1.6,
        chip: 6, stop: 0.022, shake: 0, kick: 0.006, sfx: 'whoosh', brush: 'score',
        wind: [0.8, 0.28, 0, 0.32, 0.4, 0.12, 0.62, 0.0], strike: [-0.7, 0.1, 0, -0.04, 0.46, 0.4, -0.58, 0.1], end: [-0.9, 0.16, 0, -0.1, 0.46, 0.34, -0.7, 0.07] },
      { windup: 0.17, active: 0.12, recover: 0.34, link: 0.5, dmg: 11, stagger: true, knock: 1.2, reach: 2.7, inner: 0.35, lunge: 1.6,
        chip: 6, stop: 0.022, shake: 0, kick: 0.006, sfx: 'whoosh', brush: 'score',
        wind: [-0.95, 0.2, 0, -0.14, 0.44, 0.3, -0.76, 0.05], strike: [0.75, 0.08, 0, 0.3, 0.46, 0.4, 0.62, 0.1], end: [0.95, 0.14, 0, 0.34, 0.45, 0.3, 0.74, 0.06] },
      { windup: 0.24, active: 0.15, recover: 0.52, link: 0.7, dmg: 16, stagger: true, knock: 2.6, reach: 3.0, inner: 0.35, lunge: 3.2,
        chip: 12, stop: 0.04, shake: 0.006, kick: 0.012, sfx: 'whoosh', brush: 'score',
        wind: [-0.4, 0.95, 0, -0.08, 0.72, 0.18, -0.85, -0.12], strike: [0.35, -0.06, 0, 0.22, 0.4, 0.5, 0.75, 0.22], end: [0.55, 0.02, 0, 0.24, 0.42, 0.4, 0.82, 0.14] },
    ],
    // Heavy: the overhead slam. Hold to raise it; the release brings it down and dents the ground.
    heavy: {
      kind: 'slam', chargeMax: 0.9, power: 0.45,                 // up to +45 % damage and radius when fully raised
      windup: 0.10, active: 0.15, recover: 0.55, link: 1, impactAt: 0.7,
      dmg: 34, stagger: true, knock: 4, reach: 2.9, inner: 0, radius: 2.1, impactDist: 1.5, lunge: 2.5,
      chip: 26, stop: 0.055, shake: 0.03, kick: 0.05, sfx: 'thud', brush: 'dent', cone: 1.15,
      wind: [0, 1.75, 0, 0.08, 0.98, 0.02, 0, -0.2], strike: [0, -0.55, 0, 0.05, 0.55, 0.55, 0, 0.55], end: [0, -0.5, 0, 0.05, 0.5, 0.55, 0, 0.5],
    },
  },

  // ---------------------------------------------------------------------------------------------
  // Sickle pair: fast and close, cuts that bleed. Two iron blades on oak, one in each hand. The
  // flurry alternates hands; the reap is a full turn with both arms out. Pairs with Gale.
  sickles: {
    id: 'sickles', name: 'Sickle pair', family: 'sickles',
    twoHanded: false, mainHand: 1, restHand: 1, support: 0, restSlide: 0, restPose: rest([0.0, -0.55, 0, 0.22, 0.12, 0.2, 0, 0]),
    // The off hand while the other cuts: drawn back, blade up (mirrored for the left).
    guard: [-0.35, 0.3, 0, 0.26, 0.38, 0.2, 0, 0],
    blunt: false, edge: true,
    trail: { y0: 0.22, y1: 0.49, z1: 0.42, tint: [0.95, 0.97, 1.0], strength: 0.5 },
    affinity: { frozen: 1.3, shatterHeavy: false, armourPass: 0.12, meadow: 1.4, bleed: 3.2, bleedTime: 3 },
    move: { windup: 0.65, active: 0.45, recover: 0.8, charge: 0.55 },
    combo: [
      { windup: 0.07, active: 0.08, recover: 0.17, link: 0.35, dmg: 6.5, stagger: true, knock: 0.8, reach: 1.75, inner: 0.2, lunge: 2.2, hand: 1,
        chip: 3, stop: 0.012, shake: 0, kick: 0.003, sfx: 'cut', brush: 'cut',
        wind: [0.9, 0.5, 0.0, 0.28, 0.48, 0.2, 0.45, 0.02], strike: [-0.7, 0.0, 0.2, 0.0, 0.42, 0.38, -0.35, 0.1], end: [-0.9, -0.15, 0.2, -0.04, 0.38, 0.34, -0.45, 0.08] },
      { windup: 0.07, active: 0.08, recover: 0.17, link: 0.35, dmg: 6.5, stagger: false, knock: 0.8, reach: 1.75, inner: 0.2, lunge: 2.2, hand: 0,
        chip: 3, stop: 0.012, shake: 0, kick: 0.003, sfx: 'cut', brush: 'cut',
        wind: [0.9, 0.5, 0.0, 0.28, 0.48, 0.2, 0.45, 0.02], strike: [-0.7, 0.0, 0.2, 0.0, 0.42, 0.38, -0.35, 0.1], end: [-0.9, -0.15, 0.2, -0.04, 0.38, 0.34, -0.45, 0.08] },
      { windup: 0.07, active: 0.08, recover: 0.18, link: 0.35, dmg: 7, stagger: true, knock: 0.8, reach: 1.85, inner: 0.2, lunge: 2.4, hand: 1,
        chip: 3, stop: 0.012, shake: 0, kick: 0.003, sfx: 'cut', brush: 'cut',
        wind: [1.1, 0.1, 0.0, 0.3, 0.42, 0.14, 0.55, 0.0], strike: [-0.6, 0.05, 0.0, 0.0, 0.42, 0.4, -0.5, 0.08], end: [-0.8, 0.05, 0.0, -0.05, 0.4, 0.36, -0.6, 0.06] },
      { windup: 0.07, active: 0.08, recover: 0.18, link: 0.35, dmg: 7, stagger: false, knock: 0.8, reach: 1.85, inner: 0.2, lunge: 2.4, hand: 0,
        chip: 3, stop: 0.012, shake: 0, kick: 0.003, sfx: 'cut', brush: 'cut',
        wind: [1.1, 0.1, 0.0, 0.3, 0.42, 0.14, 0.55, 0.0], strike: [-0.6, 0.05, 0.0, 0.0, 0.42, 0.4, -0.5, 0.08], end: [-0.8, 0.05, 0.0, -0.05, 0.4, 0.36, -0.6, 0.06] },
      // The finisher: both blades cross in an X, with a step into it.
      { windup: 0.11, active: 0.1, recover: 0.36, link: 0.8, dmg: 12, stagger: true, knock: 2.4, reach: 1.9, inner: 0.2, lunge: 3.4, hand: 2,
        chip: 12, stop: 0.035, shake: 0.004, kick: 0.01, sfx: 'cut', brush: 'cut',
        wind: [0.7, 0.6, 0.0, 0.3, 0.55, 0.1, 0.3, -0.1], strike: [-0.25, -0.1, 0.3, 0.06, 0.42, 0.46, -0.25, 0.22], end: [-0.3, -0.2, 0.3, 0.05, 0.38, 0.42, -0.3, 0.16] },
    ],
    // Heavy: the reap, one full turn, arms out. Hits twice (each half of the turn) and bleeds all it touches.
    heavy: {
      kind: 'spin', chargeMax: 0.6, power: 0.35, passes: 2,
      windup: 0.10, active: 0.46, recover: 0.42, link: 1, impactAt: 1,
      dmg: 13, stagger: true, knock: 3, reach: 2.4, inner: 0.25, radius: 0, lunge: 1.2,
      chip: 10, stop: 0.04, shake: 0.012, kick: 0.016, sfx: 'cut', brush: 'cut',
      wind: [1.5, 0.15, 0.0, 0.42, 0.36, 0.1, 0.5, 0.25], strike: [1.5, 0.0, 0.0, 0.42, 0.36, 0.1, 6.78, 0.25], end: [1.0, -0.2, 0.0, 0.3, 0.3, 0.2, 6.78, 0.1],
    },
  },

  // ---------------------------------------------------------------------------------------------
  // Shaper maul: slow, staggering, breaks armour. A dressed stone head on an oak haft, bound in
  // iron. Two heavy swings; the charged smash cracks the ground. Pairs with Stone.
  maul: {
    id: 'maul', name: 'Shaper maul', family: 'maul',
    twoHanded: true, mainHand: 1, restHand: 1, support: 0.42, restSlide: 0, restPose: rest([0.1, 0.78, 0, 0.2, 0.2, 0.08, 0, 0.06]),
    blunt: true, edge: false,
    trail: { y0: 0.7, y1: 1.3, z1: 0, tint: [0.9, 0.85, 0.75], strength: 0.3 },
    // The maul shatters any frozen Shaped outright and drives most of its weight through armour.
    affinity: { frozen: 4, shatterHeavy: true, shatterLight: true, armourPass: 0.85, meadow: 0.9 },
    move: { windup: 0.4, active: 0.15, recover: 0.5, charge: 0.25 },
    combo: [
      { windup: 0.30, active: 0.15, recover: 0.52, link: 0.55, dmg: 30, stagger: true, knock: 5, reach: 2.55, inner: 0.3, lunge: 2.8, impactAt: 0.85, impactDist: 1.55, radius: 1.3,
        chip: 24, stop: 0.055, shake: 0.018, kick: 0.03, sfx: 'thud', brush: 'dent',
        wind: [0.45, 1.5, 0, 0.14, 0.95, 0.0, 0.55, -0.15], strike: [-0.1, -0.7, 0, 0.0, 0.52, 0.5, -0.5, 0.52], end: [-0.12, -0.65, 0, 0.0, 0.5, 0.5, -0.5, 0.45] },
      { windup: 0.34, active: 0.15, recover: 0.6, link: 0.6, dmg: 38, stagger: true, knock: 6, reach: 2.7, inner: 0.3, lunge: 3.0,
        chip: 28, stop: 0.06, shake: 0.022, kick: 0.036, sfx: 'thud', brush: 'score',
        wind: [-1.0, 0.1, 0, -0.1, 0.42, 0.25, -0.8, 0.12], strike: [0.8, 0.12, 0, 0.3, 0.46, 0.4, 0.75, 0.2], end: [1.0, 0.18, 0, 0.32, 0.44, 0.3, 0.9, 0.12] },
    ],
    // Heavy: the smash. Raised high, brought down with the whole body; the ground cracks and rings.
    heavy: {
      kind: 'smash', chargeMax: 1.0, power: 0.4,
      windup: 0.14, active: 0.16, recover: 0.72, link: 1, impactAt: 0.8,
      dmg: 56, stagger: true, knock: 7, reach: 3.0, inner: 0, radius: 3.2, impactDist: 1.7, lunge: 3.2,
      chip: 40, stop: 0.06, shake: 0.05, kick: 0.07, sfx: 'boom', brush: 'crater', cone: 3.2,
      wind: [0, 1.85, 0, 0.1, 1.0, -0.02, 0, -0.28], strike: [0, -0.75, 0, 0.05, 0.5, 0.52, 0, 0.62], end: [0, -0.7, 0, 0.05, 0.48, 0.52, 0, 0.58],
    },
  },
};

weaponDefs.glaive = glaiveDef; weaponDefs.flail = flailDef;      // defs2.js: the later families
export const weaponList = [weaponDefs.staff, weaponDefs.sickles, weaponDefs.maul, weaponDefs.glaive, weaponDefs.flail];
