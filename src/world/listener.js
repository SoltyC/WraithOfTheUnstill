// The Listener's place (docs/phase-10/listener-design.md): where it stands in the Tide Hall's great well, the plinth under the water
// it stands on, and its bronze ears. Pure (tests/listener.test.js); systems/listener.js moves it.
//
// The ears are props on its head (systems/npcs.js 'earL'/'earR': either side of the hood, along the head's right). A prop is placed,
// never turned, so they are built for its facing (−z: towards the causeway): their faces to the sides (±x).

import { MAT } from './architecture.js';
import { stick } from './camp.js';
import { EBB_ORIGIN as O, HALL } from './ebbhold.js';

/** Where it stands (local city metres): in the chasm between the causeway and the north pillars, west of the register's platform
 *  (far enough out that its head is seen over the causeway's edge from the rail);
 *  on a drowned plinth, the water about its waist; facing the causeway (−z); its hands cupped at the surface below the causeway's edge. */
export const LISTENER = { x: 62, z: 22, base: -68, yaw: Math.PI, water: HALL.water };   // (its hips at the water: its hands reach it)

/** The plinth and the ears as architecture sites (world). */
export function listenerSites() {
  return [
    { id: 'listener-plinth', at: [LISTENER.x + O.x, LISTENER.z + O.z], facing: 0, footprint: 0, seatY: O.y + HALL.floor, seatAt: 'center', build: plinth },
    { id: 'prop-listener-ear-l', npc: 'listener', kind: 'earL', build: (b) => ear(b, 1), at: [0, 0], facing: 0, footprint: 0, prop: true },
    { id: 'prop-listener-ear-r', npc: 'listener', kind: 'earR', build: (b) => ear(b, -1), at: [0, 0], facing: 0, footprint: 0, prop: true },
  ];
}

/** A drum of the city's stone up out of the well's floor, its top a step under its feet, banded in bronze where the water was. */
function plinth(b) {
  const h = LISTENER.base - HALL.floor;
  b.drum(0, 0, 0, h - 0.6, 9.5, 9, 28, MAT.STONE, 7, { solid: false });
  b.drum(0, 0, h - 0.6, h, 9, 8.6, 28, MAT.STONE, 8, { solid: false });
  b.drum(0, 0, h - 4, h - 3.4, 9.25, 9.25, 28, MAT.METAL, 9, { solid: false, smooth: true });
}

/** One ear: a great bronze plate, dished like a hand cupped to listen, ringed, a boss at its centre; its face outward to side o
 *  (+1: +x, its left as it faces −z; −1: −x, its right), its axis along x. */
function ear(b, o) {
  // (A lying drum's axis sits at y0 + r0: offset so the plate is centred on the head's side.)
  const plate = (r0, r1, len, at, seed) => b.drum(at * o, 0, -r0, -r0 + len, r0, r1, 32, MAT.METAL, seed, { solid: false, lie: 1, yaw: Math.PI / 2, smooth: true });
  plate(2.3, 1.9, 0.35, 0, 1);        // the dish
  plate(2.5, 2.5, 0.12, -0.05, 2);    // its rim
  plate(0.55, 0.3, 0.5, 0.2, 3);      // the boss
  for (let k = 0; k < 8; k++) {       // ribs from boss to rim, like the fingers of a hand
    const a = (k / 8) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    stick(b, [0.2 * o, s * 0.6, c * 0.6], [0.05 * o, s * 2.2, c * 2.2], 0.09, 0.06, 5, MAT.METAL, 10 + k);
  }
}
