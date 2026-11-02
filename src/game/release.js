// The Listener's release, as a rough cut (Phase 10 U7; release-cinematic.md, "The cutscene: shot list"). The real rooms, the
// real people and the player's own record, timed to the 3-minute sequence; whatever isn't built yet (Sefa, the Listener, the
// wave, Morrow and the jetty, the kelp, the robes on the water) is a caption card over its shot, so the timing and the order
// can be judged now. Shot numbers are the document's. Pure: builds the director's shot list (tests/release.test.js).

import { EBB_ORIGIN as O } from '../world/ebbhold.js';
import { PEOPLE } from './drowned.js';
import { hallAlive, bakehouseBehind } from './crowds.js';

const W = (x, y, z) => [x + O.x, y + O.y, z + O.z];
const key = (t, p, at, fov = 0.7) => ({ t, p: W(...p), at: W(...at), fov });
const still = (p, at, fov) => [key(0, p, at, fov), key(1, p, at, fov)];
const card = (dur, text, dim = 0.95, extra = {}) => ({ dur, ease: 0, slug: { text, dim }, wraith: false, keys: still([130, 2, 0], [131, 2, 0]), ...extra });
const PAST = { fill: 3, beam: 1.6 };

/** What each person was doing, for the record's captions. */
const TASK = { knead: 'baker', rock: 'father', haul: 'door crew', sweep: 'sweeper', shelve: 'archivist', scribe: 'keeper of the register', tend: 'lamp-keeper', pace: 'the watch', carry: 'water-carrier', mend: 'scrubbing the causeway', kneel: 'at the shrine' };

/**
 * @param {{ record?: { id: string, kind: 'named' | 'held', at: number[], path: number[][] }[] }} [o]  the player's record (systems/drowned.js)
 * @returns {{ shots: any[], opt: any }}
 */
export function releaseShots(o = {}) {
  const hall = hallAlive(), bake = bakehouseBehind(), shots = [];
  const push = (s) => { shots.push({ wraith: false, blur: 0.5, ...s }); };
  // 1. From the well, the water starts to fall; warm light floods up into it.
  push({ dur: 8, ease: 1, drift: 0.03, grade: ['present', 'past'], light: [{ fill: 1, beam: 1 }, PAST], keys: [key(0, [112, -36, 26], [130, -50, 0], 0.8), key(1, [114, -30, 24], [130, -46, 4], 0.75)] });
  // 2. Match cuts: Hanne as the player saw her, then the same framing, dry and sunlit; Teodor; Old Ise on her stair.
  const side = [key(0, [41.3, 1.5, 53.7], [39.1, 1.15, 55.2], 0.5), key(1, [41.1, 1.46, 53.5], [39.05, 1.13, 55.22], 0.48)];
  push({ dur: 3, ease: 0.5, dof: 0.9, keys: side });
  push({ dur: 4, ease: 0.5, dof: 0.9, grade: 'past', light: PAST, crowd: bake, keys: side });
  push({ dur: 4, ease: 0.6, dof: 0.8, grade: 'past', light: PAST, keys: [key(0, [121.6, 0.9, -57.3], [119, 0.1, -54.7], 0.55), key(1, [121.3, 0.85, -57.0], [119, 0.1, -54.7], 0.52)] });
  push({ dur: 5, ease: 0.6, dof: 2.5, grade: 'past', light: PAST, keys: [key(0, [29, 1.7, 36.2], [36, 2.8, 42.6], 0.62), key(1, [30.5, 1.7, 36.4], [37, 3.0, 42.6], 0.6)] });
  // 3. Wide: the great hall alive; Liese at the wheel.
  push({ dur: 8, ease: 1, drift: 0.04, grade: 'past', light: PAST, crowd: hall, keys: [key(0, [4, 4.5, -1.5], [120, 3, 0], 0.78), key(1, [26, 4, -1], [130, 2.5, 0], 0.72)] });
  push({ dur: 5, ease: 0.6, dof: 1.5, grade: 'past', light: PAST, keys: [key(0, [156.8, 25.9, 51.2], [161, 25.2, 56], 0.6), key(1, [157.3, 25.8, 51.0], [161, 25.2, 56], 0.57)],
    slug: { text: 'Morrow beside her, young, handing her a Lung.', dim: 0.35 } });
  // 4–6. Sefa on the stair; the shudder; the sea-doors crack and the water comes.
  push({ dur: 6, ease: 0.5, drift: 0.03, shake: 0.03, grade: 'past', light: PAST, crowd: hall, keys: still([60, 8, 30], [80, 15, 42], 0.7),
    slug: { text: 'Sefa runs up the stair towards her father. A shudder. Dust falls. Everyone looks up.', dim: 0.55 } });
  push({ dur: 8, ease: 0.3, shake: 0.12, grade: 'past', light: PAST, crowd: hall, keys: [key(0, [200, 6, 0], [260, 25, 0], 0.75), key(1, [204, 6, 0], [260, 22, 0], 0.72)],
    slug: { text: 'The sea-doors crack. The music cuts. The water comes down the hall as a wall. People run.', dim: 0.5 } });
  shots.push(card(2, 'Close: the wave over Sefa, inches from her raised hand.'));
  // 7. The Listener rises from the well and opens its arms; everything stops.
  push({ dur: 6, ease: 0.6, grade: ['past', 'held'], light: [PAST, { fill: 1, beam: 0.8 }], keys: still([110, -30, 20], [130, -50, 0], 0.8),
    slug: { text: 'From the well, the Listener rises, and opens its arms. Everything stops: water, spray, a falling cup. Silence.', dim: 0.5 } });
  // 8. Through the frozen crowd, in the exact poses the player walked past.
  push({ dur: 9, ease: 0.8, freeze: true, grade: 'held', crowd: hall, keys: [key(0, [12, 1.7, -2.5], [40, 1.5, 0], 0.7), key(1, [70, 1.7, 2.5], [100, 1.5, 0], 0.7)] });
  push({ dur: 6, ease: 0.6, freeze: true, grade: 'held', dof: 0.8, keys: [key(0, [41.2, 1.5, 53.4], [39, 1.1, 55.4], 0.5), key(1, [40.6, 1.4, 53.9], [38.9, 1.1, 55.5], 0.45)],
    slug: { text: 'It reaches Sefa’s hand, and the eyes behind her veil move.', dim: 0.3 } });
  // 9. Time passes over them; the flames don't move. The Listener by the well, listening.
  push({ dur: 13, ease: 0, freeze: true, grade: 'held', light: [{ fill: 1, beam: 1 }, { fill: 0.45, beam: 0.3 }], crowd: hall, keys: still([30, 30, -30], [130, 0, 0], 0.75),
    subs: [{ t: 6, d: 5, who: 'The Listener', text: 'Stay. I have you.' }] });
  // 10–11. Morrow and the knife; the Wraith coming down through the kelp, seen from below.
  shots.push(card(14, 'The jetty, years on. Morrow, old. A knife on the Lung, cutting it at the seam: the place it tore. She sits there a long time with it in her lap.'));
  shots.push(card(8, 'Hard cut: the Wraith comes down through the kelp, seen from below by the held people. Heads turn. Hands reach.'));
  // 12. The player's own record: each person named, from their own eyes, the dark robe bending down. "Don't."
  const rec = (o.record || []).filter((r) => r.kind === 'named');
  const list = (rec.length ? rec : (o.record || [])).slice(0, 12);
  if (!list.length) shots.push(card(8, 'No names were said. The doors the Wraith forced, the rooms it flooded, the people pulled off its robe.'));
  for (const r of list) {
    const d = PEOPLE.find((q) => q.id === r.id);
    if (!d || !r.path.length) continue;
    // From their eyes: a little in front of the head, so the camera is clear of their own hood.
    const end = r.path[r.path.length - 1], ex = end[0] - r.at[0], ez = end[2] - r.at[2], el = Math.hypot(ex, ez) || 1;
    const eye = [r.at[0] + ex / el * 0.35, r.at[1] + 1.45, r.at[2] + ez / el * 0.35];
    const path = r.path.map(([x, y, z, yaw]) => [...W(x, y, z), yaw]);
    push({ dur: list.length > 6 ? 1.6 : 2.4, ease: 0, grade: 'held', dof: 0, wraith: { path }, keys: still(eye, [end[0], end[1] + 1.3, end[2]], 0.7),
      subs: [{ t: 0, d: 0.7, text: d.name + ', ' + (TASK[d.task] || '') }, { t: 0.7, d: 3, who: d.name, text: r.kind === 'named' ? 'Don’t.' : '…' }] });
  }
  if (rec.length > 12) shots.push(card(Math.min(6, 0.3 * (rec.length - 12)), rec.slice(12).map((r) => (PEOPLE.find((q) => q.id === r.id) || {}).name).join('   '), 0.85));
  // 13–15. Now: the Listener lets go. Sefa's wave; the first breath; black before anyone is hurt; silence.
  shots.push(card(5, 'Back to now. The player’s hand on the Undertow. The Listener turns its head to the Wraith and, for the first time, is not listening for anything. It lets go.', 0.85));
  shots.push(card(7, 'Sefa’s frozen wave. The droplet by her hand starts to fall. One by one, every person takes the breath they stopped on. Water moves.', 0.85));
  shots.push(card(5, '', 1, { subs: [{ t: 0.5, d: 4, text: '(the sound of the water coming, then gone)' }] }));
  shots.push(card(8, '', 1));
  // 16–17. Under the water, robes rising; dawn, the signature frame, thousands of robes on the water.
  shots.push(card(15, 'Under the water: dark, then veils and robes rising past the camera, slowly, more and more.'));
  shots.push(card(15, 'Dawn. The camera breaks the surface into the signature frame. Thousands of floating robes, out to the mist. A long, slow crane up, held.'));
  return { shots, opt: { blendIn: 0, blendOut: 0, letterbox: true } };
}
