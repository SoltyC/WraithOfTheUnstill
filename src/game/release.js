// The Listener's release, as a rough cut (Phase 10 U7; release-cinematic.md, "The cutscene: shot list"). The real rooms, the
// real people and the player's own record, timed to the 3-minute sequence; whatever isn't built yet (Sefa, the Listener, the
// wave, Morrow and the jetty, the kelp, the robes on the water) is a caption card over its shot, so the timing and the order
// can be judged now. Shot numbers are the document's. Pure: builds the director's shot list (tests/release.test.js).

import { EBB_ORIGIN as O, HALL } from '../world/ebbhold.js';
import { PEOPLE } from './drowned.js';
import { hallAlive, bakehouseBehind, hallFleeing } from './crowds.js';
import { faceOffset } from './wave.js';
import { SOUNDING } from '../world/sounding.js';
import { jettyPoint, JETTY } from '../world/jetty.js';
/** The Sounding's water (world y). */
const LV = 1.41;

const W = (x, y, z) => [x + O.x, y + O.y, z + O.z];
const H_WATER = HALL.water;   // the drowned floor of the hall: the great well
const key = (t, p, at, fov = 0.7) => ({ t, p: W(...p), at: W(...at), fov });
const still = (p, at, fov) => [key(0, p, at, fov), key(1, p, at, fov)];
const card = (dur, text, dim = 0.95, extra = {}) => ({ dur, ease: 0, slug: { text, dim }, wraith: false, keys: still([130, 2, 0], [131, 2, 0]), ...extra });
const PAST = { fill: 3, beam: 1.6 };
const TEO = { fill: 1.8, beam: 1.2 };   // the nursery is small and low: less of the haze's fill, or the swaddle burns out
/** The long north stair (world/ebbhold.js FLIGHTS: x 16 → 96, walk → the first gallery): its height at x, and its middle. */
const sy = (x) => (x - 16) * (24 / 80);
const SZ = 42.75;
/** Where Sefa stops on the stair (above where Ise sweeps). */
const SEFA_X = 57;
/** Lights for her shots: the stair is under the gallery above, out of the sea-light. Warm in the past; the wave's own cold
 *  green-white once it is over her. */
const KEY_RUN = { on: 'sefa', at: [-1.4, 2.4, -1.3], r: 11, c: [1, 0.78, 0.55], i: 11 };
const KEY_WAVE = { at: [SEFA_X + 1.5, sy(SEFA_X) + 3.6, SZ - 1.4], r: 13, c: [0.55, 0.95, 0.88], i: 9 };
/** Her held instant, close: brighter, so the still water glints. */
const KEY_HELD = { ...KEY_WAVE, r: 15, i: 15 };
/** Her father, waiting further up the stair. */
const father = () => [{ x: SEFA_X + 8 + O.x, y: sy(SEFA_X + 8) + O.y, z: SZ + 0.4 + O.z, yaw: -Math.PI / 2, motion: 'stand', scale: 1.06, t: 2, dye: [1.1, 1.3, 1.65] }];

/** What each person was doing, for the record's captions. */
const TASK = { knead: 'baker', rock: 'father', haul: 'door crew', sweep: 'sweeper', shelve: 'archivist', scribe: 'keeper of the register', tend: 'lamp-keeper', pace: 'the watch', carry: 'water-carrier', mend: 'scrubbing the causeway', kneel: 'at the shrine' };

/**
 * @param {{ record?: { id: string, kind: 'named' | 'held', at: number[], path: number[][] }[] }} [o]  the player's record (systems/drowned.js)
 * @returns {{ shots: any[], opt: any }}
 */
export function releaseShots(o = {}) {
  const hall = hallAlive(), bake = bakehouseBehind(), shots = [];
  const push = (s) => { shots.push({ wraith: false, blur: 0.5, ...s }); };
  // 1. The hall from high over the west bridge, as the light floods back into it and the colour warms: the reward, it seems.
  //    (Once the Listener is built, this opens on the well's water falling.)
  push({ dur: 8, ease: 1, drift: 0.05, grade: ['present', 'past'], light: [{ fill: 1, beam: 1 }, PAST], keys: [key(0, [20, 62, 0], [140, 0, 0], 0.85), key(1, [34, 55, 0], [150, 3, 0], 0.8)] });
  // 2. Match cuts: Hanne as the player saw her, then the same framing, dry and sunlit; Teodor and his daughter over the cradle;
  //    Old Ise on her stair (the camera on her, wherever her sweeping has got to).
  const side = [key(0, [41.3, 1.5, 53.7], [39.1, 1.15, 55.2], 0.5), key(1, [41.1, 1.46, 53.5], [39.05, 1.13, 55.22], 0.48)];
  push({ dur: 3, ease: 0.5, dof: 0.9, keys: side });
  push({ dur: 4, ease: 0.5, dof: 0.9, grade: 'past', light: PAST, crowd: bake, keys: side });
  push({ dur: 4, ease: 0.6, dof: 0.8, grade: 'past', light: TEO, keys: [key(0, [120.3, 0.45, -58.4], [119, 0.2, -54.6], 0.5), key(1, [120.1, 0.42, -58.1], [119, 0.2, -54.6], 0.47)] });
  push({ dur: 5, ease: 0.6, dof: 1.2, grade: 'past', light: PAST, key: { on: 'ise', at: [-2.2, 2.4, -1.4], r: 9, c: [1, 0.78, 0.55], i: 7 }, look: { id: 'ise', y: 1.0, from: [-4.2, 1.3, -1.6] }, keys: still([0, 0, 0], [1, 0, 0], 0.55) });
  // 3. Wide: the great hall alive; Liese at the wheel.
  push({ dur: 8, ease: 1, drift: 0.04, grade: 'past', light: PAST, crowd: hall, keys: [key(0, [4, 4.5, -1.5], [120, 3, 0], 0.78), key(1, [26, 4, -1], [130, 2.5, 0], 0.72)] });
  push({ dur: 5, ease: 0.6, dof: 1.5, grade: 'past', light: PAST, keys: [key(0, [156.8, 25.9, 51.2], [161, 25.2, 56], 0.6), key(1, [157.3, 25.8, 51.0], [161, 25.2, 56], 0.57)] });
  // 4. Sefa runs up the long stair towards her father. A shudder: she stops; the camera shakes.
  push({ dur: 6, ease: 0.4, grade: 'past', light: { fill: 5, beam: 1.6 }, key: KEY_RUN, crowd: father(), shake: 0.035, shakeAt: 0.62,
    sefa: { path: [[SEFA_X - 10, sy(SEFA_X - 10), SZ], [SEFA_X - 1.5, sy(SEFA_X - 1.5), SZ], [SEFA_X, sy(SEFA_X), SZ]] },
    keys: [key(0, [SEFA_X - 15, sy(SEFA_X - 15) + 1.3, SZ + 0.9], [SEFA_X - 6, sy(SEFA_X - 6) + 0.9, SZ], 0.62), key(1, [SEFA_X - 7, sy(SEFA_X - 7) + 1.3, SZ + 0.9], [SEFA_X + 6, sy(SEFA_X + 6) + 1.4, SZ], 0.62)] });
  // 5. The sea-doors break: the water comes down the hall as a wall, the people running from it towards the camera.
  push({ dur: 8, ease: 0.2, shake: 0.09, grade: 'past', light: PAST, crowd: hallFleeing(11, 110, 232), wave: { front: [266, 200], t: [0, 8] },
    keys: [key(0, [150, 3.2, -1.5], [250, 12, 0], 0.72), key(1, [146, 3.0, -1.5], [240, 13, 0], 0.76)] });
  // 6. Close: the wave over Sefa, inches from her raised hand (it is slower here: the moment stretched).
  const hand = [SEFA_X + 0.42, sy(SEFA_X) + 1.08, SZ], front = hand[0] + 0.15 - faceOffset(SZ, hand[1]);
  const sefaHeld = { path: [[SEFA_X, sy(SEFA_X), SZ]], yaw: Math.PI / 2, reach: hand };
  push({ dur: 3, ease: 0.3, shake: 0.02, grade: 'past', light: PAST, key: KEY_WAVE, sefa: sefaHeld, wave: { front: [front + 2.4, front], t: [8, 11] },
    keys: [key(0, [SEFA_X - 12.5, sy(SEFA_X - 12.5) + 1.2, SZ - 1.0], [SEFA_X + 1, sy(SEFA_X) + 3.2, SZ], 0.5), key(1, [SEFA_X - 11.8, sy(SEFA_X - 11.8) + 1.15, SZ - 1.0], [SEFA_X + 1, sy(SEFA_X) + 3.6, SZ], 0.5)] });
  // 7. Everything stops: the water, the spray, the drops in the air. Silence.
  const held = { front, t: 11 };
  push({ dur: 7, ease: 0.7, freeze: true, grade: ['past', 'held'], light: [PAST, { fill: 1, beam: 0.8 }], key: KEY_WAVE, sefa: sefaHeld, wave: held,
    keys: [key(0, [30, 5, -16], [62, 13, 18], 0.8), key(1, [36, 6, -12], [62, 13.5, 20], 0.76)] });
  // 8. Through the frozen crowd, caught running; Hanne's hands in the dough; to Sefa's hand.
  push({ dur: 9, ease: 0.8, freeze: true, grade: 'held', crowd: hallFleeing(5, 6, front - 6), wave: held, sefa: sefaHeld,
    keys: [key(0, [10, 1.7, 0], [40, 2.5, 0], 0.7), key(1, [front - 16, 1.8, 0], [front, 6, 0], 0.72)] });
  push({ dur: 5, ease: 0.6, freeze: true, grade: 'held', dof: 0.8, sefa: sefaHeld, wave: held, keys: [key(0, [41.2, 1.5, 53.4], [39, 1.1, 55.4], 0.5), key(1, [40.6, 1.4, 53.9], [38.9, 1.1, 55.5], 0.45)] });
  push({ dur: 6, ease: 0.7, freeze: true, grade: ['held', 'past'], light: [{ fill: 1, beam: 1 }, PAST], dof: 0.5, key: KEY_HELD, sefa: sefaHeld, wave: held,
    keys: [key(0, [SEFA_X - 1.6, sy(SEFA_X) + 1.2, SZ - 2.1], [hand[0], hand[1], hand[2]], 0.6), key(1, [SEFA_X - 0.6, sy(SEFA_X) + 1.15, SZ - 1.2], [hand[0], hand[1], hand[2]], 0.5)] });
  // 9. Time passes over them; the flames don't move. The Listener by the well, listening.
  push({ dur: 13, ease: 0, freeze: true, grade: 'held', light: [{ fill: 1, beam: 1 }, { fill: 0.45, beam: 0.3 }], crowd: hall, keys: still([30, 30, -30], [130, 0, 0], 0.75),
    subs: [{ t: 6, d: 5, who: 'The Listener', text: 'Stay. I have you.' }] });
  // 10–11. Morrow and the knife; the Wraith coming down through the kelp, seen from below.
  // 10. The jetty, years on (out of the city for it: the city's own exit puts the hidden Wraith on the rim, beside the jetty). Morrow,
  //     old, the Lung in her lap, a knife along its seam — the place it tore. A long time.
  const J = (f, u, y) => jettyPoint(JETTY.len - f, u, y);
  const M = { f: JETTY.len - 2.2, cut: [0.1, 0.5] };
  shots.push({ dur: 8, ease: 0.8, wraith: false, blur: 0.3, leave: true, hour: 17.6, morrow: M,
    keys: [{ t: 0, p: J(6.4, 0.7, 1.7), at: J(-8, -0.9, 0.7), fov: 0.62 }, { t: 1, p: J(5.4, 0.6, 1.6), at: J(-8, -0.8, 0.7), fov: 0.6 }] });
  // Close on her hands, from her left at their height (the Lung against the sky, her right arm coming over it): the knife
  // raised, one slash out along the seam, the bladder slumping as the air goes out of it (systems/morrow.js: the stroke at 0.6).
  shots.push({ dur: 4, ease: 0.5, wraith: false, blur: 0.2, dof: 0.7, morrow: { ...M, cut: [0.5, 0.78] },
    keys: [{ t: 0, p: J(1.6, -1.95, 1.15), at: J(1.68, 0, 1.17), fov: 0.39 }, { t: 1, p: J(1.5, -1.8, 1.15), at: J(1.68, 0, 1.15), fov: 0.37 }] });
  shots.push({ dur: 5, ease: 0.6, wraith: false, blur: 0.3, dof: 0.6, morrow: { ...M, cut: [0.78, 1.0] },
    keys: [{ t: 0, p: J(1.6, 3.4, 0.95), at: J(2.05, 0, 0.8), fov: 0.5 }, { t: 1, p: J(1.75, 3.0, 0.92), at: J(2.05, 0, 0.78), fov: 0.47 }] });
  // 11. Hard cut, back in the city: the Wraith comes down a shaft of the sea-light, seen from below, from among the held people
  //     on the causeway (their view: the first thing to move in all that time).
  push({ dur: 8, ease: 0.5, freeze: true, enter: 'hall', grade: 'held', light: { fill: 0.75, beam: 1.5 }, crowd: hall,
    wraith: { path: [[...W(105, 30, 2), 0.4], [...W(103.5, 17, 0.5), 0.5], [...W(102, 7, -1.5), 0.6]] },
    keys: [key(0, [97, 1.3, -7], [104.8, 26, 1.8], 0.62), key(1, [97.2, 1.3, -6.9], [102.2, 8.2, -1.3], 0.5)] });
  // 12. The player's own record: each person named, from their own eyes, the dark robe bending down. "Don't."
  const rec = (o.record || []).filter((r) => r.kind === 'named');
  const list = (rec.length ? rec : (o.record || [])).slice(0, 12);
  const back = shots.length;
  if (!list.length) shots.push(card(8, 'No names were said. The doors the Wraith forced, the rooms it flooded, the people pulled off its robe.'));
  for (const r of list) {
    const d = PEOPLE.find((q) => q.id === r.id);
    if (!d || !r.path.length) continue;
    // From their eyes: in front of the head, so the camera is clear of their own hood (the lens is wide). A name is said at arm's length,
    // so the Wraith is held off to NEAR in the replay — closer, its robe is the whole frame — and the eye looks up at its head.
    // Only the walk up to them: from the last jump in the record (a door, a teleport — samples metres apart), or the Wraith spends
    // the first of the shot somewhere out of sight and appears from nowhere when the path crosses the jump.
    let from = 0;
    for (let k = 1; k < r.path.length; k++) { const A = r.path[k - 1], B = r.path[k]; if (Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) > 3) from = k; }
    const walk = r.path.slice(from);
    if (walk.length < 2) walk.push(walk[0]);   // (a path needs two ends)
    const NEAR = 2.0, end = walk[walk.length - 1];
    let ex = end[0] - r.at[0], ez = end[2] - r.at[2], el = Math.hypot(ex, ez);
    if (el < 0.05) { ex = Math.sin(end[3]) * -1; ez = Math.cos(end[3]) * -1; el = 1; }   // on top of them: back along its facing
    const ux = ex / el, uz = ez / el;
    const eye = [r.at[0] + ux * 0.55, r.at[1] + 1.45, r.at[2] + uz * 0.55];
    const path = walk.map(([x, y, z, yaw]) => {
      const dx = x - r.at[0], dz = z - r.at[2], dl = Math.hypot(dx, dz);
      if (dl >= NEAR) return [...W(x, y, z), yaw];
      const ox = dl > 0.05 ? dx / dl : ux, oz = dl > 0.05 ? dz / dl : uz;
      return [...W(r.at[0] + ox * NEAR, y, r.at[2] + oz * NEAR), yaw];
    });
    const last = path[path.length - 1], head = [last[0] - O.x, last[1] - O.y + 1.6, last[2] - O.z];
    // Lit so the robe reads: the room's fill lifted, and a cold key between them, over the Wraith's head (it bends down out of it).
    const mid = [(eye[0] + head[0]) / 2, head[1] + 0.9, (eye[2] + head[2]) / 2];
    push({ dur: list.length > 6 ? 1.6 : 2.4, ease: 0, grade: 'held', dof: 0, record: r.id, wraith: { path }, keys: still(eye, head, 0.95),
      light: { fill: 1.9, beam: 1 }, key: { at: mid, r: 7, c: [0.62, 0.8, 1], i: 6 },
      subs: [{ t: 0, d: 0.7, text: d.name + ', ' + (TASK[d.task] || '') }, { t: 0.7, d: 3, who: d.name, text: r.kind === 'named' ? 'Don’t.' : '…' }] });
  }
  if (shots[back]) shots[back].enter = 'hall';   // back into the city for the record
  if (rec.length > 12) shots.push(card(Math.min(6, 0.3 * (rec.length - 12)), rec.slice(12).map((r) => (PEOPLE.find((q) => q.id === r.id) || {}).name).join('   '), 0.85));
  // 13–15. Now: the Listener lets go. Sefa's wave; the first breath; black before anyone is hurt; silence.
  // (Sefa placed and posed under the card, unfrozen, so the frozen shot after it has her as she was.)
  // 13. Back to now: the Wraith on the register's platform, over the well where the Listener holds the strand, seen low from in
  //     front against the roof's light. The hold lets go: the sea-light swells down the shafts and the colour returns. (The
  //     Listener itself, when it is built, turns its head here.)
  push({ dur: 5, ease: 0.6, freeze: true, grade: ['held', 'present'], light: [{ fill: 0.7, beam: 0.6 }, { fill: 1.8, beam: 2.6 }], sefa: sefaHeld,
    wraith: { path: [[...W(124, 0, 8), Math.PI / 2], [...W(124, 0, 8), Math.PI / 2]] },
    keys: [key(0, [128.3, 0.75, 9.7], [123.6, 2.15, 7.5], 0.62), key(1, [128.1, 0.7, 9.6], [123.6, 2.4, 7.5], 0.58)] });
  // 14. Sefa's frozen wave; then time again: the drops fall, the water moves. Cut to black before anyone is hurt.
  const wide14 = [key(0, [SEFA_X - 13.5, sy(SEFA_X - 13.5) + 0.7, SZ - 1.6], [SEFA_X + 0.5, sy(SEFA_X) + 2.6, SZ + 0.2], 0.42), key(1, [SEFA_X - 13.2, sy(SEFA_X - 13.2) + 0.68, SZ - 1.6], [SEFA_X + 0.5, sy(SEFA_X) + 2.7, SZ + 0.2], 0.41)];   // (outside the lip: under it the frame is all water)
  push({ dur: 4, ease: 0.5, freeze: true, grade: 'past', light: PAST, key: KEY_HELD, sefa: sefaHeld, wave: held, keys: wide14 });
  push({ dur: 2.2, ease: 0, grade: 'past', light: PAST, key: KEY_HELD, sefa: sefaHeld, wave: { front: [front, front - 3.5], t: [11, 13.2] }, shake: 0.03, keys: wide14 });
  // 15. Black, the water's sound, then silence — long enough to be uncomfortable. Under it, out of the city: the Wraith is on the
  //     Sounding's rim when it is over, at dawn (the world has these seconds to come in around the camera).
  shots.push(card(5, '', 1, { leave: true, hour: 6.2, subs: [{ t: 0.5, d: 4, text: '(the sound of the water coming, then gone)' }] }));
  shots.push(card(8, '', 1));
  // 16. Under the water: dark, then the robes rising past the camera, slowly, more and more.
  const SW = (x, y, z) => [SOUNDING.x + x, LV + y, SOUNDING.z + z];
  const wkey = (t, p, at, fov = 0.8) => ({ t, p: SW(...p), at: SW(...at), fov });
  shots.push({ dur: 15, ease: 0.6, wraith: false, blur: 0.4, robes: { rise: [2, 17] },
    keys: [wkey(0, [3, -12, -2], [6, -26, 8], 0.9), wkey(0.5, [3, -11.4, -2], [5, -2, 4], 0.9), wkey(1, [3, -10.8, -2], [4, 6, 1], 0.85)] });
  // 17. Dawn: a cut up through the surface (a camera at the waterline splits the frame) into the signature frame — the robes out to the mist — and cranes up, and holds.
  shots.push({ dur: 15, ease: 0.8, wraith: false, blur: 0.3, robes: {},
    keys: [wkey(0, [0.4, 0.45, 0.2], [40, 0.4, 16], 0.85), wkey(0.1, [0.5, 0.7, 0.3], [40, 0.2, 16], 0.85), wkey(0.75, [-3, 5.5, -5], [60, -2, 38], 0.8), wkey(1, [-4, 7, -6], [60, -2, 40], 0.8)] });
  return { shots, opt: { blendIn: 0, blendOut: 0, letterbox: true } };
}
