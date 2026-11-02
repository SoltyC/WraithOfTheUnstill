// The Drowned of Ebbhold (Phase 10 U5; storylines.md §7–8, release-cinematic.md "Before: making them people"): the city's people,
// held in the second the water came, still doing what they were doing. They don't see. A noise turns every head in reach; they come
// to where it was, hands out, and hold the robe — until it is still. Saying a person's name, learned from the register on the
// platform, stops them for good (the player believes it is mercy). Twenty of them, each with a loop that reads from a few metres.
//
// Pure: the people's data and one step of a person's life. The system (systems/drowned.js) gives each a body (the Veiled robe
// figure), moves them through the city's floors and walls (`move`), and owns the noise, the holds and the naming.
// Coordinates are the city's local metres (world/ebbhold.js); y is the floor of the tier they live on. Tested in tests/drowned.test.js.

import { hears } from './noise.js';
import { HALL } from '../world/ebbhold.js';

const W = HALL.walk, G1 = HALL.g1, G2 = HALL.g2;
// Muted, sea-washed dyes (multipliers on the charcoal wool).
export const DYE = { rust: [2.1, 1.25, 0.85], kelp: [1.15, 1.6, 1.2], slate: [1.1, 1.3, 1.65], bone: [2.2, 2.1, 1.85], ink: [0.8, 0.85, 1.05], ochre: [2.0, 1.6, 0.9] };

/** A place round a centre, facing it (the door-wheel's crew at its bars). */
function round(c, r, a) {
  const bar = (q) => [c[0] + Math.cos(a) * q, 1.06, c[1] + Math.sin(a) * q];
  return { at: [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r], yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), c, hands: { l: bar(1.72), r: bar(1.98) } };
}

/**
 * The people. task: knead | rock | haul | sweep | wheel | shelve | tend | pace | carry | scribe | kneel | mend.
 * at: [x, z] the task's anchor; yaw: facing there; path: the walked line (ping-pong) for the walking tasks; c, r: the wheel's
 * centre and radius. clip: a motion clip (data/motion, through the gate) the body plays at the task, clipT where it starts; hands:
 * where the hands go on the thing worked (local, y above the tier's floor): { at, spread } one point under both, or { l, r } each. line: the register's entry — what it says is how the player tells who is who.
 */
export const PEOPLE = [
  { id: 'hanne', name: 'Hanne', arch: 'pilgrim', dye: 'ochre', y: W, task: 'knead', clip: 'knead1', hands: { at: [38.7, 1.1, 55.62], spread: 0.1 }, at: [38.85, 55.02], yaw: 0,
    line: 'Hanne, baker, of the walk gallery’s north side. Fed the door crews through the last night. Her hands were never out of the dough.' },
  { id: 'ysolde', name: 'Ysolde', arch: 'elder', dye: 'bone', y: W, task: 'knead', clip: 'knead1', clipT: 3.1, hands: { at: [39.3, 1.09, 56.36], spread: 0.09 }, at: [39.2, 56.98], yaw: 3.1416,
    line: 'Ysolde, Hanne’s mother, who taught her. Worked the far side of Hanne’s table, facing her, and would not sit.' },
  { id: 'teodor', name: 'Teodor', arch: 'staff', dye: 'slate', y: W - 1, task: 'rock', clip: 'rock', carry: true, rest: 0, at: [119, -54.4], yaw: 3.1416,
    line: 'Teodor, rope-maker, a father this week. He would not put his daughter down in the low nursery; he rocked her in his arms by the cradle.' },
  { id: 'ise', name: 'Ise', arch: 'elder', dye: 'kelp', y: W, task: 'sweep', path: [[24, 42.6], [46, 42.6]], yaw: 1.5708,
    line: 'Old Ise, who swept the long stair from the walk gallery every morning, and sang while she did it, so the children could find her.' },
  { id: 'liese', name: 'Liese', arch: 'staff', dye: 'rust', y: G1, task: 'haul', clip: 'wheel', clipT: 0.0, ...round([161, 56], 2.4, 0),
    line: 'Liese, who ran the north door-wheel, high on the first gallery. Her crew hauled at its bars to her count. Tall, and loud with it.' },
  { id: 'brannoc', name: 'Brannoc', arch: 'monk', dye: 'ink', y: G1, task: 'haul', clip: 'wheel', clipT: 1.1, ...round([161, 56], 2.4, 1.2566),
    line: 'Brannoc, of Liese’s door crew. The broadest back on the wheel; he dyed his robe as dark as the deep.' },
  { id: 'oda', name: 'Oda', arch: 'pilgrim', dye: 'rust', y: G1, task: 'haul', clip: 'wheel', clipT: 2.3, ...round([161, 56], 2.4, 2.5133),
    line: 'Oda, of Liese’s door crew, who wore her robe the colour of rust, like her captain’s, to annoy her.' },
  { id: 'pell', name: 'Pell', arch: 'elder', dye: 'bone', y: G1, task: 'haul', clip: 'wheel', clipT: 3.4, ...round([161, 56], 2.4, 3.7699),
    line: 'Pell, of Liese’s door crew, the oldest who still walked a wheel. Stooped, in bleached wool.' },
  { id: 'wyn', name: 'Wyn', arch: 'lantern', dye: 'slate', y: G1, task: 'haul', clip: 'wheel', clipT: 4.5, ...round([161, 56], 2.4, 5.0265),
    line: 'Wyn, of Liese’s door crew, who carried a lamp even at the wheel, because she was afraid of the dark.' },
  { id: 'corran', name: 'Corran', arch: 'pilgrim', dye: 'kelp', y: G1, task: 'sweep', path: [[123, -53], [135, -53]], yaw: 1.5708,
    line: 'Corran, sweeper, of the sweepers’ hall on the first gallery’s south side. Kept the floor so clean you could see the lamps in it.' },
  { id: 'maudry', name: 'Maudry', arch: 'elder', dye: 'ink', y: G2, task: 'shelve', path: [[103, 58.6], [117, 58.6]], yaw: 1.5708,
    line: 'Maudry, keeper of the archive on the high gallery. Walked her shelves end to end, and stopped at each to look up at them.' },
  { id: 'aldo', name: 'Aldo', arch: 'monk', dye: 'bone', y: W, task: 'scribe', at: [130, 3.2], yaw: 3.1416,
    line: 'Aldo, who kept this book. He stands at it still, at the register’s south side, bent to write the last name in.' },
  { id: 'fenna', name: 'Fenna', arch: 'lantern', dye: 'ochre', y: G1, task: 'tend', path: [[10, 41.5], [40, 41.5], [70, 41.5]], yaw: 1.5708,
    line: 'Fenna, lamp-keeper of the first gallery’s north side. Went from flame to flame with her own lamp and stopped at each.' },
  { id: 'hesk', name: 'Hesk', arch: 'staff', dye: 'slate', y: G2, task: 'tend', path: [[160, -41.5], [190, -41.5], [214, -41.5]], yaw: 1.5708,
    line: 'Hesk, lamp-keeper of the high gallery’s south side. Tall; stopped at every flame as if it might have gone out.' },
  { id: 'rhun', name: 'Rhun', arch: 'pilgrim', dye: 'bone', y: W, task: 'tend', path: [[160, 41.5], [190, 41.5], [220, 41.5]], yaw: 1.5708,
    line: 'Rhun, the young lamp-keeper of the walk gallery’s north side, past the platform. Pale robe, and always late.' },
  { id: 'tamsin', name: 'Tamsin', arch: 'staff', dye: 'kelp', y: G1, task: 'pace', path: [[62, -26], [62, 26]], yaw: 0,
    line: 'Tamsin, of the watch, who walked the west bridge end to end and back, the whole night, every night.' },
  { id: 'bede', name: 'Bede', arch: 'monk', dye: 'rust', y: W, task: 'pace', path: [[110, -30], [110, 30]], yaw: 0,
    line: 'Bede, of the watch, who walked the register’s platform from gallery to gallery along its west edge. Red-robed, for the watch.' },
  { id: 'sorrel', name: 'Sorrel', arch: 'pilgrim', dye: 'slate', y: W, task: 'carry', path: [[160, -38], [232, -38]], yaw: 1.5708,
    line: 'Sorrel, water-carrier, who carried from the low landing to the south walk gallery, bowed under the yoke.' },
  { id: 'orla', name: 'Orla', arch: 'elder', dye: 'kelp', y: W, task: 'mend', at: [44, -3.6], yaw: 3.1416,
    line: 'Orla, who scrubbed the causeway’s stones on her knees, near the third statue on the south side, to the end.' },
  { id: 'gil', name: 'Gil', arch: 'monk', dye: 'ochre', y: -30, task: 'kneel', at: [-70.5, 10.5], yaw: 0.4,
    line: 'Gil, who kept the shrine in the undercroft, below the intake stair. Knelt to it, and did not get up.' },
];

/** Tuning. */
export const DR = {
  heardAt: 0.12,     // the least level that turns a head
  turnT: 0.9,        // s from hearing to coming
  come: 1.7,         // m/s towards the sound
  back: 1.1,         // m/s home again
  reach: 1.15,       // m: close enough to take hold
  linger: 4,         // s standing where the sound was, listening
  stillToLetGo: 2.5, // s of quiet before the hands open
};

export const ST = { TASK: 0, TURN: 1, COME: 2, HOLD: 3, LINGER: 4, BACK: 5, STILL: 6 };

/** A person's live state from their data (anchored at the task's start). */
export function newPerson(d) {
  const a = d.at || (d.path ? d.path[0] : [d.c[0] + Math.cos(d.phase) * d.r, d.c[1] + Math.sin(d.phase) * d.r]);
  return { d, state: ST.TASK, x: a[0], z: a[1], y: d.y, yaw: d.yaw || 0, vx: 0, vz: 0, hunch: 0.1, offX: 0, offZ: 0,
    t: 0, tx: 0, tz: 0, taskT: (d.phase || 0) * 3, seg: 0, dir: 1, pause: 0, slot: 0 };
}

const TAU = Math.PI * 2;
const turnTo = (p, x, z, k) => { const a = Math.atan2(x - p.x, z - p.z); let d = a - p.yaw; d -= TAU * Math.round(d / TAU); p.yaw += d * Math.min(1, k); };
/** Walk p toward (x, z) at speed; returns the distance left. move(p, nx, nz) applies it (the city's floors and walls). */
function walk(p, x, z, speed, dt, move) {
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
  if (d < 0.05) { p.vx = 0; p.vz = 0; return d; }
  const s = Math.min(d, speed * dt);
  p.vx = (dx / d) * speed; p.vz = (dz / d) * speed;
  move(p, p.x + (dx / d) * s, p.z + (dz / d) * s);
  turnTo(p, x, z, dt * 6);
  return d - s;
}

/** The task's own motion (state TASK): sets x, z, yaw, vx, vz, hunch, offX, offZ. */
export function stepTask(p, dt, move) {
  const d = p.d; p.taskT += dt;
  const t = p.taskT;
  p.offX = 0; p.offZ = 0; p.vx = 0; p.vz = 0;
  if (d.clip && p.clipOn) { p.yaw = d.yaw; return; }   // the clip has the body
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  switch (d.task) {
    case 'knead': {   // bowing into the dough and back, the weight going forward with each push
      const s = Math.sin(t * TAU / 1.5);
      p.hunch = 0.38 + 0.2 * s; p.offX = fx * 0.07 * s; p.offZ = fz * 0.07 * s; p.yaw = d.yaw; return;
    }
    case 'rock': {    // over the cradle, swaying side to side
      const s = Math.sin(t * TAU / 2.4);
      p.hunch = 0.32 + 0.04 * Math.abs(s); p.offX = fz * 0.1 * s; p.offZ = -fx * 0.1 * s; p.yaw = d.yaw; return;
    }
    case 'haul': p.hunch = 0.3; p.yaw = d.yaw; return;
    case 'scribe': p.hunch = 0.45 + 0.04 * Math.sin(t * TAU / 0.7); p.yaw = d.yaw; return;
    case 'kneel': p.hunch = 0.72 + 0.02 * Math.sin(t * TAU / 4); p.yaw = d.yaw; return;
    case 'mend': { const s = Math.sin(t * TAU / 0.9); p.hunch = 0.62; p.offX = fz * 0.08 * s; p.offZ = -fx * 0.08 * s; p.yaw = d.yaw; return; }
    case 'wheel': {   // walking the capstan round, leaning into the bar
      const a = d.phase + t * 0.19, nx = d.c[0] + Math.cos(a) * d.r, nz = d.c[1] + Math.sin(a) * d.r;
      p.vx = (nx - p.x) / Math.max(dt, 1e-4); p.vz = (nz - p.z) / Math.max(dt, 1e-4);
      move(p, nx, nz); p.yaw = Math.atan2(-Math.sin(a), Math.cos(a)); p.hunch = 0.38; return;
    }
    default: {        // the walking tasks: a line walked end to end and back, a pause at every point
      if (p.pause > 0) {
        p.pause -= dt;
        p.hunch = d.task === 'shelve' ? -0.08 : d.task === 'tend' ? 0.16 : d.task === 'sweep' ? 0.42 + 0.06 * Math.sin(t * TAU / 0.8) : 0.12;
        return;
      }
      const P = d.path, k = Math.min(P.length - 1, Math.max(0, p.seg + p.dir));
      const sp = d.task === 'sweep' ? 0.45 + 0.35 * Math.max(0, Math.sin(t * TAU / 1.6)) : d.task === 'carry' ? 0.8 : d.task === 'pace' ? 0.95 : 0.9;
      p.hunch = d.task === 'sweep' ? 0.42 : d.task === 'carry' ? 0.3 : 0.1;
      const left = walk(p, P[k][0], P[k][1], sp, dt, move);
      if (left < 0.08) {
        p.seg = k;
        if (k === P.length - 1 || k === 0) p.dir = k === 0 ? 1 : -1;
        p.pause = d.task === 'tend' ? 4 : d.task === 'shelve' ? 3 : d.task === 'pace' ? 1.5 : d.task === 'sweep' ? 0.6 : 1;
      }
    }
  }
}

/** Where a person goes home to (the task's anchor nearest their walk). */
function home(p) { const d = p.d; if (d.at) return d.at; if (d.path) return d.path[p.seg]; const a = d.phase + p.taskT * 0.19; return [d.c[0] + Math.cos(a) * d.r, d.c[1] + Math.sin(a) * d.r]; }

/**
 * One step. n: the noise (game/noise.js); w: { x, y, z, quietFor } the Wraith (local); move(p, x, z): through the city.
 * Returns true when the person took hold this step.
 */
export function stepPerson(p, n, w, dt, move) {
  if (p.state === ST.STILL) { p.vx = 0; p.vz = 0; p.offX = 0; p.offZ = 0; p.hunch += (0.8 - p.hunch) * Math.min(1, dt * 1.5); return false; }
  // Hearing: a head turns towards any noise in reach (the hands are already holding: they keep holding).
  if (p.state !== ST.HOLD && n.level >= DR.heardAt && hears(n, p.x, p.y + 1, p.z)) {
    if (p.state === ST.COME) { p.tx = n.x; p.tz = n.z; }
    else if (p.state !== ST.TURN) { p.state = ST.TURN; p.t = DR.turnT; p.tx = n.x; p.tz = n.z; }
  }
  switch (p.state) {
    case ST.TASK: stepTask(p, dt, move); return false;
    case ST.TURN:
      p.vx = 0; p.vz = 0; p.offX = 0; p.offZ = 0;
      turnTo(p, p.tx, p.tz, dt * 5); p.hunch += (-0.05 - p.hunch) * Math.min(1, dt * 4);
      if ((p.t -= dt) <= 0) p.state = ST.COME;
      return false;
    case ST.COME: {
      p.hunch += (0.05 - p.hunch) * Math.min(1, dt * 3);
      const dw = Math.hypot(w.x - p.x, w.z - p.z);
      if (dw < DR.reach && Math.abs(w.y - p.y) < 1.6) { p.state = ST.HOLD; p.t = 0; return true; }
      // Close by, they find the robe itself; otherwise they go to where the sound was.
      const tx = dw < 2.5 && Math.abs(w.y - p.y) < 1.6 ? w.x : p.tx, tz = dw < 2.5 && Math.abs(w.y - p.y) < 1.6 ? w.z : p.tz;
      const left = walk(p, tx, tz, DR.come, dt, move);
      if (left < 0.5) { p.state = ST.LINGER; p.t = DR.linger; }
      return false;
    }
    case ST.HOLD: {
      // Hands on the robe: kept at arm's length round the Wraith, in its slot, until it has been still long enough.
      p.hunch += (0.22 - p.hunch) * Math.min(1, dt * 3);
      const a = p.slot, hx = w.x + Math.sin(a) * 0.8, hz = w.z + Math.cos(a) * 0.8;
      p.vx = (hx - p.x) / Math.max(dt, 1e-3); p.vz = (hz - p.z) / Math.max(dt, 1e-3);
      move(p, p.x + (hx - p.x) * Math.min(1, dt * 8), p.z + (hz - p.z) * Math.min(1, dt * 8));
      turnTo(p, w.x, w.z, dt * 8);
      // (quiet counted from when they took hold: a body already still when they reach it is held a while all the same)
      p.t += dt;
      if (Math.min(w.quietFor, p.t) > DR.stillToLetGo) { p.state = ST.LINGER; p.t = DR.linger * 0.6; }
      return false;
    }
    case ST.LINGER:
      p.vx = 0; p.vz = 0; p.hunch += (0.1 - p.hunch) * Math.min(1, dt * 2);
      if ((p.t -= dt) <= 0) p.state = ST.BACK;
      return false;
    case ST.BACK: {
      const h = home(p);
      p.hunch += (0.15 - p.hunch) * Math.min(1, dt * 2);
      if (walk(p, h[0], h[1], DR.back, dt, move) < 0.1) { p.state = ST.TASK; p.yaw = p.d.yaw ?? p.yaw; }
      return false;
    }
  }
  return false;
}

/** Shaken off (a dodge): the hands lose the robe; they stagger back and listen again. */
export function shakeOff(p, w) {
  if (p.state !== ST.HOLD) return;
  const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz) || 1;
  p.x = w.x + dx / d * 2; p.z = w.z + dz / d * 2;
  p.state = ST.TURN; p.t = DR.turnT * 1.5; p.tx = w.x; p.tz = w.z;
}

/** Say a name to a person: right, and they are still for good; wrong, and they cry out (the caller makes the noise). */
export function sayName(p, name) {
  if (p.state === ST.STILL) return 'still';
  if (name !== p.d.name) return 'wrong';
  p.state = ST.STILL;
  return 'named';
}
