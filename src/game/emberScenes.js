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
