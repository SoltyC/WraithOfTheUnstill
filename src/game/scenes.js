// Directed scenes (the cutscene system's second layer; systems/scenes.js plays them through the director, systems/director.js).
// The director's shots were cameras keyed by hand to fixed coordinates: they could not follow anything that moves, they went
// through hills, and a cut to a place far away showed it half loaded. A scene's beats are written about what they film:
//   subjects   resolved live each frame — a person ({ npc }), a few of them ({ npcs }), a building ({ site }), a point, the
//              crater, a lava front ({ front }), the camp, the Wraith — so a camera holds on someone walking, or a front coming on
//   rigs       how the camera moves about its subject: static, push (in or out along a line), orbit, crane (up and back), dolly
//              (across), track (keeps pace with a moving subject), two (frames two subjects), pov (from one toward another);
//              each eased, with a hand-held drift, its focus on the subject
//   ground     every camera kept clear of the ground under it and lifted until it sees its subject over any hill between
//   variants   a scene is chosen among its variants by the game's state (the first whose `when` holds)
// Pure (tests/scenes.test.js): the runtime gives `resolve(subject) → [x, y, z]` and `ground(x, z) → y`.

const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);
const lerp = (a, b, u) => a + (b - a) * u;

/** The camera of beat `b` at u (0..1 of the beat) → out [px, py, pz, ax, ay, az, fov, focus]. */
export function evalBeat(b, u, time, resolve, ground, out, blocked) {
  const e = smoother(Math.min(1, Math.max(0, u))), uu = lerp(u, e, b.ease ?? 0.8);
  const S = resolve(b.subject), T = b.target ? resolve(b.target) : null;
  const look = [S[0], S[1] + (b.lookUp ?? 1.2), S[2]];
  let cam;
  const R = b.rig || 'static';
  // Angles: yaw is the direction from the subject toward the camera (0 = +z), in radians; dist and height in metres.
  const at = (yaw, dist, h, base = S) => [base[0] + Math.sin(yaw) * dist, base[1] + h, base[2] + Math.cos(yaw) * dist];
  const yaw = b.yaw ?? 0;
  if (R === 'static') cam = at(yaw, b.dist ?? 8, b.height ?? 2);
  else if (R === 'push') cam = at(yaw, lerp(b.from ?? 12, b.to ?? 6, uu), lerp(b.height ?? 2, b.height2 ?? b.height ?? 2, uu));
  else if (R === 'orbit') cam = at(lerp(yaw, yaw + (b.sweep ?? 0.6), uu), b.dist ?? 10, b.height ?? 3);
  else if (R === 'crane') cam = at(yaw, lerp(b.dist ?? 6, b.dist2 ?? 18, uu), lerp(b.height ?? 1.5, b.height2 ?? 14, uu));
  else if (R === 'dolly') {
    const side = yaw + Math.PI / 2, s = lerp(-(b.span ?? 6), b.span ?? 6, uu) / 2, base = at(yaw, b.dist ?? 9, b.height ?? 2);
    cam = [base[0] + Math.sin(side) * s, base[1], base[2] + Math.cos(side) * s];
  } else if (R === 'track') {
    // Keeps pace: behind and beside the subject, along the line from the target (where it is headed) back through it.
    const dir = T ? Math.atan2(S[0] - T[0], S[2] - T[2]) : yaw;
    cam = at(dir + (b.side ?? 0.6), b.dist ?? 14, b.height ?? 4);
  } else if (R === 'two' && T) {
    // Two subjects: from beside the line between them, far enough back to hold both.
    const mid = [(S[0] + T[0]) / 2, (S[1] + T[1]) / 2, (S[2] + T[2]) / 2], sep = Math.hypot(S[0] - T[0], S[2] - T[2]);
    const across = Math.atan2(T[0] - S[0], T[2] - S[2]) + Math.PI / 2 * (b.side ?? 1);
    cam = at(across, Math.max(4, sep * (b.spread ?? 0.9)), b.height ?? 2, mid);
    look[0] = mid[0]; look[1] = mid[1] + (b.lookUp ?? 1.2); look[2] = mid[2];
  } else if (R === 'pov' && T) {
    // From just behind the subject's shoulder toward the target (what they are looking at).
    const dir = Math.atan2(T[0] - S[0], T[2] - S[2]);
    cam = [S[0] - Math.sin(dir) * (b.dist ?? 2.2) + Math.cos(dir) * (b.shoulder ?? 0.6), S[1] + (b.height ?? 1.7), S[2] - Math.cos(dir) * (b.dist ?? 2.2) - Math.sin(dir) * (b.shoulder ?? 0.6)];
    look[0] = T[0]; look[1] = T[1] + (b.targetUp ?? 0); look[2] = T[2];
  } else cam = at(yaw, b.dist ?? 8, b.height ?? 2);
  // Hand-held.
  const dr = b.drift ?? 0.08;
  if (dr > 0) { cam[0] += dr * (Math.sin(time * 0.71 + 1.3) * 0.6 + Math.sin(time * 1.37) * 0.4); cam[1] += dr * 0.6 * Math.sin(time * 0.53 + 2.1); cam[2] += dr * (Math.sin(time * 0.83 + 0.2) * 0.6 + Math.sin(time * 1.13 + 2.9) * 0.4); }
  // Clear of walls: if a building stands between the camera and what it films, swing round the subject until it is clear —
  // chosen once for the beat (at its first frame), so the camera never jumps mid-shot.
  if (blocked) {
    if (b._swing === undefined) {
      b._swing = 0;
      if (blocked(cam, look)) {
        for (const sw of [0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
          const c = swingAbout(cam, look, sw);
          if (!blocked(c, look)) { b._swing = sw; break; }
        }
      }
    }
    if (b._swing) cam = swingAbout(cam, look, b._swing);
  }
  // Clear of the ground, and over any hill between the camera and what it films.
  if (ground) {
    const clear = b.clear ?? 1.2;
    let g0 = ground(cam[0], cam[2]);
    if (cam[1] < g0 + clear) cam[1] = g0 + clear;
    for (let it = 0; it < 6; it++) {
      let worst = 0;
      for (let k = 1; k < 8; k++) {
        const f = k / 8, x = lerp(cam[0], look[0], f), z = lerp(cam[2], look[2], f), y = lerp(cam[1], look[1], f), gy = ground(x, z) + 0.6;
        if (gy > y) worst = Math.max(worst, (gy - y) / (1 - f));
      }
      if (worst <= 0) break;
      cam[1] += Math.min(worst, 30);
    }
  }
  out[0] = cam[0]; out[1] = cam[1]; out[2] = cam[2]; out[3] = look[0]; out[4] = look[1]; out[5] = look[2];
  out[6] = lerp(b.fov ?? 0.75, b.fov2 ?? b.fov ?? 0.75, uu);
  out[7] = Math.hypot(look[0] - cam[0], look[1] - cam[1], look[2] - cam[2]);
  return out;
}

/** The camera turned by a about the look-at point (round the vertical). */
function swingAbout(cam, look, a) {
  const dx = cam[0] - look[0], dz = cam[2] - look[2], c = Math.cos(a), s = Math.sin(a);
  return [look[0] + dx * c + dz * s, cam[1], look[2] - dx * s + dz * c];
}

/** The variant of a scene for the state: the first whose `when(ctx)` holds (none: null). */
export function pickVariant(scene, ctx) { for (const v of scene.variants) if (!v.when || v.when(ctx)) return v; return null; }

/** Where a scene's beats film (their subjects' places now): for pre-loading the world there. */
export function sceneSpots(variant, resolve) { return variant.beats.filter((b) => !b.local).map((b) => resolve(b.subject)); }

/** Total length (s). */
export const sceneLength = (variant) => variant.beats.reduce((s, b) => s + b.dur, 0);
