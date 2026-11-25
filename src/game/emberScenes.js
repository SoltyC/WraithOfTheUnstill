// The eruption's consequence scenes (docs/people-and-cutscenes.md §3.2, "the village that stayed"), as directed scenes
// (game/scenes.js): beats about live subjects, so the camera holds on the real people and the real house as the real lava
// comes — nothing staged, nothing pre-rendered. Built from the state: who is still there, which house, where the mountain is.
// Tone (the user's): plain, never spectacle — the camera stays with the people the player knew, no slow motion, no lingering.
// Pure: systems/eruption.js decides when (the lava's arrival, a little ahead) and plays it through systems/scenes.js.

const CRATER = [2350, -2150];

/** Seconds from the scene's start to the moment the lava reaches the place (the eruption starts the scene this far ahead). */
export const STAYED_LEAD = 22;

/**
 * The village that stayed: one place, the people still at home.
 * @param {{ name: string, at: [number, number], site: string, people: string[], front?: [number, number] }} o
 *   front: the way the house faces (its yard and door, world x, z), where the camera can stand clear of the walls.
 */
export function villageStayed({ name, at, site, people, front }) {
  // Away from the mountain: the camera on the far side of the house, the mountain over its roof.
  const away = Math.atan2(at[0] - CRATER[0], at[1] - CRATER[1]);
  // The yard: in front of the door (a camera near the people elsewhere is inside a wall).
  const yard = front ? Math.atan2(front[0], front[1]) : away;
  const them = { npcs: people, fallback: { site } };
  return {
    people,   // (kept shown and simulated for the whole scene: systems/scenes.js)
    id: 'stayed-' + site,
    prepare: [site],
    beats: [
      // Where the Wraith is: it turns to the mountain as the flank opens (the place is loading behind this).
      { dur: 3.5, local: true, subject: { wraith: true }, target: { crater: true, up: 250 }, rig: 'pov', dist: 2.6, height: 1.9, fov: 0.7, drift: 0.12 },
      // The quiet before: the house as it is, its people at the door, the mountain behind.
      { dur: 4.5, subject: { site, up: 1.5 }, rig: 'static', yaw: away, dist: 28, height: 6, fov: 0.75, drift: 0.15,
        subs: [{ t: 0.4, d: 3.2, text: name }] },
      // The mountain answers: what is coming for them — the lava's front, live, over the edge of the farm.
      { dur: 4, subject: { site, up: 1 }, target: { custom: 'front', up: 1 }, rig: 'pov', dist: 16, height: 3.5, shoulder: 5, fov: 0.65, drift: 0.15 },
      // They know: close enough to see it in them — each stares at it in their own way (gated Kimodo takes).
      { dur: 4.5, subject: them, rig: 'static', yaw: yard + 0.55, dist: 7.5, height: 1.9, lookUp: 1.1, fov: 0.5, drift: 0.06, dof: 2.5 },
      // The door: the first there waves the other in; it opens; they go in; it shuts behind them.
      { dur: 4.5, subject: { custom: 'door' }, rig: 'static', yaw: yard + 0.7, dist: 9, height: 2.2, lookUp: 1.0, fov: 0.6, drift: 0.06, dof: 2.5 },
      // The fire: across the farm as the front comes in.
      { dur: 9, subject: { site, up: 1 }, rig: 'dolly', yaw: away + 0.9, dist: 32, height: 4.5, span: 22, fov: 0.8, drift: 0.2 },
      // The house goes.
      { dur: 10, subject: { site, up: 2 }, rig: 'crane', yaw: away - 0.4, dist: 20, dist2: 46, height: 3, height2: 22, fov: 0.85, drift: 0.15 },
      // Ash falls: wide and still.
      { dur: 5, subject: { site }, rig: 'static', yaw: away + Math.PI * 0.15, dist: 75, height: 32, fov: 0.8, drift: 0.05 },
    ],
  };
}

/** Seconds from the start of the watched scene to the lava reaching the farm (its fall lands in the farm's own shot). */
export const WATCHED_LEAD = 13;

/**
 * The village that left, watching (docs/people-and-cutscenes.md §3.2, "Evacuated"): from the headland camp the family who got
 * out watch the mountain take their farm, alive; one grieves, the other holds them.
 * @param {{ name: string, site: string, people: string[], toward: number }} o
 *   toward: the bearing from the lookout to the mountain (rad, atan2(dx, dz)): the farm itself is behind the hills from there.
 */
export function villageWatched({ name, site, people, toward, focus = null, far = 1, place = null }) {
  const them = { npcs: people, fallback: { camp: true } };
  return {
    people,   // (kept shown and simulated for the whole scene: systems/scenes.js)
    id: 'watched-' + site,
    prepare: [site],
    beats: [
      // Where the Wraith is: it turns to the mountain (the camp loading behind this).
      { dur: 3.5, local: true, subject: { wraith: true }, target: { crater: true, up: 250 }, rig: 'pov', dist: 2.6, height: 1.9, fov: 0.7, drift: 0.12 },
      // The headland: they stand at the cliff's edge with the others, looking back up the coast.
      { dur: 4.5, subject: them, rig: 'static', yaw: toward + Math.PI - 0.45, dist: 7.5, height: 2.4, lookUp: 1.4, fov: 0.62, drift: 0.08,
        subs: [{ t: 0.4, d: 3.2, text: 'The headland' }] },
      // What they see, a long lens over their heads: the mountain over the ridge their farm lies under, pouring.
      { dur: 5, subject: them, target: { crater: true, up: 160 }, rig: 'pov', dist: 1.4, height: 2.3, shoulder: 0.4, fov: 0.62, drift: 0.04 },   // (what they see: the ridge, the mountain under its cloud, the column)
      // The farm: its fall, burning.
      // (A town or the chapel: its own shot of what takes it — the tower going under the lava, the cloud coming down.)
      ...(place ? [{ ...place, subs: [{ t: 0.5, d: 3, text: name }] }] : [
      { dur: 11, subject: focus ? { point: focus, up: 2 } : { site, up: 2 }, rig: 'crane', yaw: toward + Math.PI + 0.5, dist: 22 * far, dist2: 44 * far, height: 3 * far, height2: 20 * far, fov: 0.8, drift: 0.15,
        subs: [{ t: 0.5, d: 3, text: name }] },
      ]),
      // Back to them: one covers their face; the other holds them (gated Kimodo takes).
      { dur: 5.5, subject: them, rig: 'static', yaw: toward + 0.55, dist: 6.5, height: 1.8, lookUp: 1.15, fov: 0.5, drift: 0.06, dof: 2.5 },
      // The end: up and back from behind them, until they are two small figures at the cliff's edge and the mountain burns beyond.
      { dur: 7, subject: them, target: { crater: true, up: 0 }, rig: 'pov', dist: 6, height: 1.3, shoulder: 1.5, fov: 0.9, drift: 0.05, noSwing: true, noLift: true },   // (low behind them: their silhouettes on the burning mountain)
    ],
  };
}

/** Seconds from the town scene's start to the lava reaching the winding tower over the shaft. */
export const TOWN_LEAD = 20;

/**
 * Cinderhold that stayed: the guild keeps its town to the last. The lava comes down the face between the galleries; the
 * guild goes to the winding tower over the shaft, the lava's way through the town, Morcant at the door waving them in;
 * the lava reaches it and it goes; the lava runs on through the yard; the town, its east end gone, the hall still standing.
 * @param {{ name: string, site: string, people: string[], door: [number, number], tower: [number, number], away: number }} o
 *   points in world x, z; away: the bearing from the crater to the town (rad), for cameras with the mountain behind.
 */
export function townStayed({ name, site, people, door, tower, away }) {
  return {
    people,   // (kept shown and simulated for the whole scene: systems/scenes.js)
    id: 'stayed-' + site,
    prepare: [site],
    beats: [
      { dur: 3.5, local: true, subject: { wraith: true }, target: { crater: true, up: 250 }, rig: 'pov', dist: 2.6, height: 1.9, fov: 0.7, drift: 0.12 },
      // Cinderhold on its bench, lamps lit, the face above it and the lava on it.
      { dur: 5, subject: { point: tower, up: 6 }, rig: 'static', yaw: away + 0.35, dist: 85, height: 28, fov: 0.62, drift: 0.12, subs: [{ t: 0.4, d: 3.2, text: name }] },
      // From the yard below it: the lava coming down between the galleries.
      { dur: 4.5, subject: { custom: 'front', up: 2 }, rig: 'static', yaw: away, dist: 32, height: 7, fov: 0.6, drift: 0.12 },
      // The guild at the tower's door: Morcant waving them in, one at a time, the glow on the walls.
      { dur: 7, subject: { point: door, up: 0 }, rig: 'static', yaw: Math.PI / 2 + 0.6, dist: 11, height: 2.6, lookUp: 1.4, fov: 0.6, drift: 0.07 },
      // The lava comes to the tower, and it goes.
      { dur: 16, subject: { point: tower, up: 8 }, rig: 'static', yaw: away - 0.5, dist: 44, height: 10, fov: 0.62, drift: 0.12 },
      // On through the yard.
      { dur: 8, subject: { custom: 'front', up: 1 }, rig: 'crane', yaw: away + 0.9, dist: 24, dist2: 40, height: 6, height2: 20, fov: 0.7, drift: 0.12 },
      // The town: its east end gone under the lava, the hall standing beyond.
      { dur: 6, subject: { point: tower }, rig: 'static', yaw: away + 0.2, dist: 120, height: 48, fov: 0.6, drift: 0.05 },
    ],
  };
}

/** Seconds from the chapel scene's start to the surge's front coming level with the chapel. */
export const CHAPEL_LEAD = 21;

/**
 * The Ash Chapel that stayed: the faithful keep to their chapel. The bell rings on its own; they gather before the door,
 * facing the summit, Annick in front; the cloud breaks over the rim and comes down the flank; it rolls over them; when it
 * thins they stand where they stood, grey, the chapel broken behind them.
 * @param {{ name: string, site: string, people: string[], chapel: [number, number], gather: [number, number], away: number }} o
 *   points in world x, z; away: the bearing from the crater to the chapel (rad).
 */
export function chapelStayed({ name, site, people, chapel, gather, away }) {
  const them = { npcs: people, fallback: { point: gather } };
  return {
    people,   // (kept shown and simulated for the whole scene: systems/scenes.js)
    id: 'stayed-' + site,
    prepare: [site],
    beats: [
      { dur: 3.5, local: true, subject: { wraith: true }, target: { crater: true, up: 250 }, rig: 'pov', dist: 2.6, height: 1.9, fov: 0.7, drift: 0.12 },
      // The chapel on its bench under the summit, white against the black ground, the column over it.
      { dur: 5, subject: { point: chapel, up: 14 }, rig: 'static', yaw: away + 0.45, dist: 60, height: 10, fov: 0.7, drift: 0.12, subs: [{ t: 0.4, d: 3.2, text: name }] },
      // The faithful before the door, facing the summit, the bell ringing over them on its own.
      { dur: 5, subject: them, rig: 'static', yaw: away + 0.3, dist: 8, height: 1.7, lookUp: 1.4, fov: 0.6, drift: 0.06 },
      // Over their heads: the summit, close, and what is gathering on it.
      { dur: 4, subject: them, target: { crater: true, up: 120 }, rig: 'pov', dist: 4, height: 2.2, shoulder: 1.2, fov: 0.75, drift: 0.05 },
      // The cloud breaks over the rim and comes down the flank at them.
      { dur: 5, subject: { point: chapel, up: 25 }, rig: 'static', yaw: away - 0.35, dist: 110, height: 16, fov: 0.8, drift: 0.1 },
      // It reaches them.
      { dur: 3.5, subject: them, rig: 'static', yaw: away + 1.1, dist: 11, height: 2.2, lookUp: 1.3, fov: 0.65, drift: 0.06 },
      // Close: Annick's face, the cloud round her, the ash climbing her (the focus a hand's breadth deep; all else gone soft).
      { dur: 4.5, subject: { npc: people[0], fallback: { point: gather } }, rig: 'static', yaw: away + Math.PI + 0.9, dist: 1.05, height: 1.35, lookUp: 1.3, fov: 0.5, drift: 0.02, dof: 0.35, maxBlur: 14, noSwing: true, noLift: true },
      // And one of the faithful behind her, from the side: their hands, their shawl, going grey.
      { dur: 3.5, subject: { npc: people[Math.min(2, people.length - 1)], fallback: { point: gather } }, rig: 'static', yaw: away + Math.PI - 0.95, dist: 1.25, height: 1.1, lookUp: 1.0, fov: 0.5, drift: 0.02, dof: 0.45, maxBlur: 12, noSwing: true, noLift: true },
      // When it thins: grey, where they stood.
      { dur: 7, subject: them, rig: 'push', yaw: away + 0.6, from: 9, to: 6, height: 1.8, lookUp: 1.2, fov: 0.6, drift: 0.04 },
      // The chapel, broken, under the ash.
      { dur: 5, subject: { point: chapel, up: 3 }, rig: 'static', yaw: away + 0.2, dist: 45, height: 14, fov: 0.65, drift: 0.04 },
    ],
  };
}

/**
 * The count's words, from what happened: per place that had people at risk, how many reached the headland, how many were
 * lost; then the end of it. Pure (tests/emberScenes.test.js).
 * @param {{ name: string, res: number, here: number, lost: number }[]} places  res: who lived there; here: at the camp;
 *   lost: dead. A place nobody left and nobody lost (the mountain passed it by) is not counted.
 * @returns {string[]}
 */
const WORD = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export function countLines(places) {
  const out = [];
  let lostAll = 0;
  for (const p of places) {
    if (!p.here && !p.lost) continue;
    lostAll += p.lost;
    if (!p.lost) out.push(p.here === p.res ? `${p.name}: all of them.` : `${p.name}: ${WORD[p.here] || p.here}.`);
    else if (!p.here) out.push(`${p.name}: no one.`);
    else out.push(`${p.name}: ${WORD[p.here] || p.here}. ${p.lost === 1 ? 'One did not come.' : `${(WORD[p.lost] || String(p.lost)).replace(/^./, (c) => c.toUpperCase())} did not come.`}`);
  }
  out.push(lostAll ? 'Say their names. Every one.' : 'That is everyone. Everyone came.');
  return out;
}

/**
 * The camp on the coast: the survivors count themselves. Round the fire on the headland, one of them names each place
 * and who came from it; a face for those who did not; then all of them, small, before the smoking mountain.
 * @param {{ people: string[], counter: string, mourner: string|null, lines: string[], fire: [number, number],
 *   faceYaw: number, toward: number }} o  faceYaw: the bearing from the counter toward the camera's side (rad); toward: the
 *   bearing from the camp to the mountain.
 */
export function campCount({ people, counter, mourner, lines, fire, faceYaw, toward, who, mournerYaw = 0 }) {
  const them = { npcs: people, fallback: { point: fire } };
  const per = 3.4;
  // The count in three: the counter, then those listening (across the fire, past the counter), then the counter for the end.
  const a = Math.min(2, lines.length - 1), b = Math.max(a, lines.length - 1);
  const sub = (from, to) => lines.slice(from, to).map((text, i) => ({ t: 0.5 + i * per, d: per - 0.3, who, text }));
  return {
    people,
    id: 'camp-count',
    beats: [
      // The headland at dusk: the shelters, the smoke of the cookfires, the mountain beyond.
      { dur: 6, subject: { point: fire, up: 2 }, rig: 'crane', yaw: toward + Math.PI + 0.35, dist: 13, dist2: 21, height: 4, height2: 8.5, fov: 0.7, drift: 0.1, subs: [{ t: 0.6, d: 3.4, text: 'The headland' }] },
      // Gathered at the fire: across it, past the one who will count, their faces.
      { dur: 5.5, subject: { point: fire, up: 0 }, rig: 'static', yaw: toward + 0.25, dist: 6.5, height: 3.2, lookUp: 0.9, fov: 0.7, drift: 0.06 },
      // The count: close on the one who keeps it.
      { dur: 0.8 + a * per, subject: { npc: counter, fallback: { point: fire } }, rig: 'static', yaw: faceYaw, dist: 2.3, height: 1.65, lookUp: 1.5, fov: 0.5, drift: 0.03, dof: 0.8, maxBlur: 10, noSwing: true, subs: sub(0, a) },
      // Those listening, the fire between.
      { dur: 0.8 + (b - a) * per, subject: them, rig: 'static', yaw: toward + 0.6, dist: 6.5, height: 3.2, lookUp: 1.2, fov: 0.55, drift: 0.04, dof: 2.5, maxBlur: 8, subs: sub(a, b) },   // (above the fire's flare, past it)
      // And the end of it.
      { dur: 0.8 + (lines.length - b) * per, subject: { npc: counter, fallback: { point: fire } }, rig: 'static', yaw: faceYaw + 0.35, dist: 1.9, height: 1.6, lookUp: 1.5, fov: 0.48, drift: 0.02, dof: 0.7, maxBlur: 10, noSwing: true, subs: sub(b, lines.length) },
      // For those who did not come: one of theirs.
      ...(mourner ? [{ dur: 5, subject: { npc: mourner, fallback: { point: fire } }, rig: 'static', yaw: mournerYaw - 0.45, dist: 2.4, height: 1.8, lookUp: 1.3, fov: 0.5, drift: 0.03, dof: 1.0, maxBlur: 10, noSwing: true }] : []),
      // All of them, small, before the mountain still smoking.
      { dur: 7, subject: them, target: { crater: true, up: 80 }, rig: 'pov', dist: 7, height: 2.2, shoulder: 1.5, fov: 0.85, drift: 0.04, noSwing: true, noLift: true },
    ],
  };
}

/**
 * The warning (people-and-cutscenes.md §3.3; ember-design.md §2): the messenger comes down the mountain to the Wraith.
 * The messenger is chosen from the story (Iven if he lived, Nadra if she left the erg, else Cole); only Cole exists yet —
 * the dunes chapter does not record the other two outcomes — so the scene is written about whoever `messenger` is.
 * @param {{ messenger: string, from: [number, number], to: [number, number], toward: number }} o  from: where they come
 *   down from; to: where they stop, before the Wraith; toward: the bearing from the Wraith to the mountain.
 */
export function warningArrives({ messenger, from, to, toward, side = Math.PI / 2 }) {
  const them = { npc: messenger, fallback: { point: from } };
  return {
    people: [messenger],
    id: 'warning-' + messenger,
    beats: [
      // Behind the Wraith: the mountain, and someone small coming down it, fast.
      { dur: 4.5, local: true, subject: { wraith: true }, target: { point: from, up: 1.2 }, rig: 'pov', dist: 3, height: 2.7, shoulder: 0.9, fov: 0.5, drift: 0.05, clear: 2.6 },
      // Running: the slope, the stones, the breath.
      { dur: 4, subject: them, target: { point: to, up: 1 }, rig: 'track', side: 0.7, dist: 7, height: 2.8, lookUp: 0.9, fov: 0.6, drift: 0.04, clear: 2.6 },   // (above the understory: ferns and broad leaves to 2.5 m)
      // Arrived: the two of them, the boy bent over, getting his breath.
      { dur: 3.5, subject: them, target: { wraith: true }, rig: 'two', side: 1, spread: 2, height: 2.7, lookUp: 0.9, fov: 0.6, drift: 0.03, noLift: true, clear: 2.6 },   // (no lift: the trees would raise it to look down on them)
      // Close: from the side, at his height — his face turned up to the Wraith's hood, the Wraith a grey wall beside him.
      { dur: 3.5, subject: them, rig: 'static', yaw: toward + side, dist: 2.4, height: 1.15, lookUp: 0.95, fov: 0.55, drift: 0.02, dof: 0.7, maxBlur: 8 },
    ],
  };
}

/**
 * The Ember Warden's release (docs/phase-11/ember-release.md, the 45 s cut): the fire given back at its heart, it blazes,
 * the shackles burst, it rises with its arms to the sky — and falls apart into the vent and plugs it. The column draws down
 * into the crater, the flows go black from the vent down, the ash parts over the Wraith on the bench. Skippable (the
 * user's): its end is the world's (systems/emberWarden.js releaseEnd).
 * @param {{ facing: number, ledge: { x: number, z: number }, crater: { x: number, z: number } }} o  facing: its yaw
 *   (atan2(dx, dz)) — the bench is in front of it
 * Subjects: custom 'chest' and 'titan' (systems/emberWarden.js; 'titan' moves from it to the vent as it comes apart).
 */
export function wardenLetsGo({ facing, ledge, crater }) {
  // (The cameras out over the lava to its side and above — in front of it is the bench's rock, which a camera there is in.)
  const back = Math.atan2(ledge.x - crater.x, ledge.z - crater.z);   // from the crater out to the ledge
  return {
    people: [],
    id: 'ember-warden-release',
    beats: [
      // The give: close on its chest, the light flooding the split, the cracks catching all over it.
      { dur: 5, subject: { custom: 'chest' }, rig: 'push', yaw: facing + 0.25, from: 78, to: 62, height: 46, height2: 40, lookUp: 2, fov: 0.5, drift: 0.04, noSwing: true },
      // The shackles burst; it rises out of the lava, its arms going up.
      { dur: 9, subject: { custom: 'titan' }, rig: 'crane', yaw: facing + 1.65, dist: 105, dist2: 125, height: 4, height2: 26, lookUp: 18, fov: 0.78, drift: 0.05, noSwing: true },
      // It comes apart: low over the lake, looking up as the pieces fall in.
      { dur: 10, subject: { custom: 'titan' }, rig: 'static', yaw: facing + 1.45, dist: 130, height: 16, lookUp: 6, fov: 0.92, drift: 0.06, noSwing: true },
      // The vent closed: high over the crater, the pieces lying in it going dark, the column drawn down into it.
      { dur: 10, subject: { crater: true, up: 0 }, rig: 'crane', yaw: back + 0.5, dist: 170, dist2: 260, height: 150, height2: 230, lookUp: 30, fov: 0.85, drift: 0.05, noSwing: true, noLift: true },
      // The flows going black from the mountain down, the land quiet.
      { dur: 5, subject: { crater: true, up: 0 }, rig: 'static', yaw: back - 0.4, dist: 1300, height: 520, lookUp: -150, fov: 0.75, drift: 0.04, noSwing: true, noLift: true },
      // The sky opens over the Wraith on the bench, the plugged crater beyond it.
      { dur: 6, subject: { wraith: true }, rig: 'crane', yaw: back, dist: 5, dist2: 16, height: 2, height2: 9, lookUp: 1.2, fov: 0.7, drift: 0.03, noSwing: true,
        subs: [{ t: 1.5, d: 4, text: 'The Ember Warden' }] },
    ],
  };
}

/**
 * The crater (docs/people-and-cutscenes.md §3.3; docs/phase-11/ember-warden.md §2): the first time the Wraith comes to
 * the rim before the eruption, it looks in — the lava lake, risen, and the Ember Warden half sunk in it, its hands on the
 * vent, straining. Over the Wraith's shoulder down into it; wide from above; close on the bowed head. Subjects: custom 'titan', 'hands', 'head' (systems/emberWarden.js).
 * @param {{ facing: number }} o  facing: its yaw (atan2(dx, dz)) — toward the bench
 */
export function craterLooksIn({ facing }) {
  return {
    people: [],
    id: 'ember-crater',
    beats: [
      { dur: 4.5, local: true, subject: { wraith: true }, target: { custom: 'titan' }, rig: 'pov', dist: 3.2, height: 2.6, shoulder: 0.9, fov: 0.55, drift: 0.04 },
      { dur: 6, subject: { custom: 'titan' }, rig: 'crane', yaw: facing + 1.6, dist: 120, dist2: 105, height: 70, height2: 55, fov: 0.62, drift: 0.04 },
      // (From in front and over the lava — the bench's rock is 70 m out in front of it, its arms off to either side.)
      // (Before the eruption the lake — and it with it — lies far under the bench's lip: these look down into the crater.)
      { dur: 5, subject: { custom: 'head' }, rig: 'static', yaw: facing + 0.35, dist: 46, height: 26, fov: 0.45, drift: 0.03 },
    ],
  };
}
