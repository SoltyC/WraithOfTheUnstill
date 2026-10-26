// The glaive and the lantern flail (docs §11.2), as data in the same format as defs.js (read the
// header there for the pose and attack layouts). Extra fields used only by these two:
//   tip      the glaive: blows landing beyond `from` of the reach do `mul` times the damage (spacing pays)
//   pin      the glaive's thrust: the first blow also holds the foe where it stands for this many seconds
//   burn     the flail's flame: damage per second, seconds, the meadow and night multipliers (affinity)
//   chain    the flail's chain: where the haft's eye is above the grip and the chain's length (m)
//   blades   a spin with one head (the flail) rather than two blades
//   byAngle  a spin's passes change every equal share of the turn, not of the time

export const glaiveDef = {
  // Shaper glaive: a long ash-and-oak shaft with a leaf blade, tasselled. Wide fast arcs that catch a
  // pack from both sides, a long thrust that pins what it meets. Pairs with Gale and Frost.
  id: 'glaive', name: 'Shaper glaive', family: 'glaive',
  twoHanded: true, mainHand: 1, restHand: 0, support: 0.55, restSlide: 0.4, restPose: [0.1, 1.38, 0, -0.22, 0.12, 0.2, 0, 0],
  blunt: false, edge: true,
  trail: { y0: 1.72, y1: 2.28, z1: 0, tint: [0.92, 0.96, 1.0], strength: 0.5 },
  // The point finds the gaps in armour but not the weight to break it; a blade cuts reed and sedge a little better.
  affinity: { frozen: 1.3, shatterHeavy: false, armourPass: 0.45, meadow: 1.25 },
  tip: { from: 0.7, mul: 1.35 },
  move: { windup: 0.7, active: 0.55, recover: 0.85, charge: 0.6 },
  combo: [
    { windup: 0.15, active: 0.12, recover: 0.3, link: 0.5, dmg: 9, stagger: false, knock: 2.6, reach: 3.5, inner: 0.5, lunge: 1.0,
      chip: 5, stop: 0.016, shake: 0, kick: 0.004, sfx: 'cut', brush: 'cut',
      wind: [0.8, 0.22, 0, 0.3, 0.42, 0.14, 0.75, 0.0], strike: [-0.85, 0.08, 0, -0.02, 0.46, 0.38, -0.75, 0.1], end: [-1.0, 0.12, 0, -0.06, 0.46, 0.34, -0.85, 0.08] },
    { windup: 0.14, active: 0.12, recover: 0.3, link: 0.5, dmg: 9, stagger: false, knock: 2.6, reach: 3.5, inner: 0.5, lunge: 1.0,
      chip: 5, stop: 0.016, shake: 0, kick: 0.004, sfx: 'cut', brush: 'cut',
      wind: [-0.95, 0.15, 0, -0.1, 0.44, 0.3, -0.8, 0.05], strike: [0.8, 0.08, 0, 0.3, 0.46, 0.4, 0.7, 0.1], end: [0.95, 0.12, 0, 0.34, 0.45, 0.3, 0.82, 0.06] },
    // The finisher: over the shoulder and down across, a step into it; the heavy knock clears the ring round the Wraith.
    { windup: 0.21, active: 0.14, recover: 0.5, link: 0.7, dmg: 15, stagger: true, knock: 5, reach: 3.6, inner: 0.5, lunge: 2.4,
      chip: 12, stop: 0.034, shake: 0.006, kick: 0.012, sfx: 'cut', brush: 'cut',
      wind: [-0.5, 1.0, 0, -0.1, 0.72, 0.15, -0.95, -0.1], strike: [0.55, -0.1, 0, 0.25, 0.44, 0.45, 0.75, 0.22], end: [0.7, -0.05, 0, 0.28, 0.44, 0.4, 0.85, 0.16] },
  ],
  // Heavy: the thrust. Hold to draw the glaive back (a long hold pins heavier things); the release
  // drives it down a lane 4 m long, through everything in it, and holds what it meets in place.
  heavy: {
    kind: 'thrust', chargeMax: 0.8, power: 0.45,
    windup: 0.1, active: 0.16, recover: 0.55, link: 1, impactAt: 1,
    dmg: 28, stagger: true, knock: 0, pin: 1.1, reach: 4.3, inner: 0.3, radius: 0, lunge: 3.2,
    chip: 14, stop: 0.045, shake: 0.012, kick: 0.022, sfx: 'cut', brush: 'cut',
    wind: [0.16, 0.12, 0, 0.14, 0.46, -0.16, 0.2, -0.12], strike: [0, 0.04, 0, 0.0, 0.5, 0.7, 0, 0.32], end: [0, 0.04, 0, 0.0, 0.5, 0.64, 0, 0.3],
  },
};

export const flailDef = {
  // Lantern flail: an oak haft, a chain, and a caged lantern of bronze and iron whose flame burns
  // while it swings. A heavy, wide, slow-looping weapon: nothing under the nose (the head cannot
  // strike what is inside the circle of the swing), everything in the ring; whatever it touches
  // catches. The flame is also a light that swings with it. Pairs with Ember (later).
  id: 'flail', name: 'Lantern flail', family: 'flail',
  twoHanded: true, mainHand: 1, restHand: 1, support: 0.28, restSlide: 0, restPose: [0.16, 0.95, 0, 0.22, 0.3, 0.1, 0, 0.04],
  blunt: true, edge: false,
  chain: { eye: 0.87, len: 1.18, head: 0.3 },
  trail: { y0: 0.1, y1: 0.5, z1: 0, tint: [1.0, 0.62, 0.22], strength: 0.55, fire: true },      // along the lantern head (slot HEAD)
  // Fire: the frozen are thawed (and barely hurt), the armoured burn through their armour, sedge and turf burn well.
  affinity: { frozen: 0.6, thaw: true, shatterHeavy: false, armourPass: 0.35, meadow: 1.15, burn: 4, burnTime: 3, burnMeadow: 1.8, burnNight: 0.45 },
  move: { windup: 0.45, active: 0.35, recover: 0.7, charge: 0.4 },
  combo: [
    { windup: 0.24, active: 0.15, recover: 0.4, link: 0.55, dmg: 11, stagger: false, knock: 2.0, reach: 3.0, inner: 1.1, lunge: 1.2,
      chip: 7, stop: 0.022, shake: 0.004, kick: 0.008, sfx: 'thud', brush: 'scorch',
      wind: [0.7, 1.35, 0, 0.18, 0.7, 0.05, 0.75, -0.1], strike: [-0.55, 0.0, 0, 0.0, 0.48, 0.42, -0.65, 0.22], end: [-0.8, -0.25, 0, -0.06, 0.44, 0.38, -0.8, 0.26] },
    { windup: 0.22, active: 0.15, recover: 0.4, link: 0.55, dmg: 11, stagger: false, knock: 2.0, reach: 3.0, inner: 1.1, lunge: 1.2,
      chip: 7, stop: 0.022, shake: 0.004, kick: 0.008, sfx: 'thud', brush: 'scorch',
      wind: [-1.0, 0.25, 0, -0.1, 0.44, 0.28, -0.8, 0.05], strike: [0.95, 0.15, 0, 0.3, 0.46, 0.4, 0.75, 0.12], end: [1.15, 0.2, 0, 0.34, 0.45, 0.3, 0.9, 0.08] },
    // The wheel: the lantern goes once right round the Wraith, low and fast, and strikes everything in the ring.
    { windup: 0.26, active: 0.4, recover: 0.55, link: 0.8, dmg: 14, stagger: true, knock: 3.2, scorch: true, reach: 3.0, inner: 1.1, lunge: 0.6,
      chip: 10, stop: 0.03, shake: 0.006, kick: 0.01, sfx: 'thud', brush: 'scorch',
      wind: [1.3, 0.55, 0, 0.2, 0.6, 0.1, 0.9, -0.12], strike: [1.3, 0.1, 0, 0.2, 0.5, 0.2, 7.2, 0.15], end: [0.9, 0.0, 0, 0.2, 0.46, 0.3, 7.2, 0.1] },
  ],
  // Heavy: the whirl. Hold to build the swing (the flame grows); the release spins twice round, the
  // lantern streaming a ring of fire at the height of the knee, everything it passes catching.
  heavy: {
    kind: 'spin', blades: 1, byAngle: true, chargeMax: 1.0, power: 0.4, passes: 2, scorch: true,
    windup: 0.16, active: 0.66, recover: 0.6, link: 1, impactAt: 1,
    dmg: 14, stagger: true, knock: 3, reach: 3.1, inner: 1.0, radius: 0, lunge: 0.4,
    chip: 9, stop: 0.04, shake: 0.01, kick: 0.015, sfx: 'thud', brush: 'scorch',
    wind: [1.4, 0.6, 0, 0.2, 0.62, 0.12, 0.6, -0.1], strike: [1.4, 0.1, 0, 0.2, 0.5, 0.25, 13.1, 0.1], end: [0.9, -0.1, 0, 0.2, 0.46, 0.3, 13.1, 0.05],
  },
};
