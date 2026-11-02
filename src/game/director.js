// The cinematic director's timeline (Phase 10 U6; docs/phase-10/cutscene-research.md §4): a cutscene is a list of shots, each
// with its own camera — hand-placed keys (position, look-at, field of view, focus) on a smooth curve, eased in and out, with a
// little hand-held drift so no path is mathematically perfect. Cuts are hard (the system resets the temporal history on the
// frame a shot starts). Pure and allocation-free when evaluated (tests/director.test.js).
//
// A shot: { dur (s), keys: [{ t (0..1 of the shot), p: [x, y, z], at: [x, y, z], fov (rad), focus (m, or omitted: the look-at's
// distance) }], ease (0 linear … 1 smootherstep across the shot), drift (m of hand-held sway), dof (in-focus half range, m, or 0
// for none), blur (motion blur, 0..1 of a 180° shutter) }.

/** Catmull-Rom between b and c at u. */
const cr = (a, b, c, d, u) => b + 0.5 * u * (c - a + u * (2 * a - 5 * b + 4 * c - d + u * (3 * (b - c) + d - a)));
const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);

/** Total length of a shot list (s). */
export function totalLength(shots) { let s = 0; for (const sh of shots) s += sh.dur; return s; }

/** Which shot plays at time t → out { i, u (0..1 within it), cut (it began within the last dt) }. */
export function shotAt(shots, t, dt = 0, out = { i: 0, u: 0, cut: false }) {
  let s = 0;
  for (let i = 0; i < shots.length; i++) {
    const d = shots[i].dur;
    if (t < s + d || i === shots.length - 1) {
      out.i = i; out.u = Math.min(1, Math.max(0, (t - s) / d)); out.cut = t - dt < s && t >= s; return out;
    }
    s += d;
  }
  return out;
}

/** The camera of shot `sh` at u → out [px, py, pz, ax, ay, az, fov, focus]. time: the scene clock (for the drift). */
export function evalShot(sh, u, time, out) {
  const K = sh.keys, n = K.length;
  const e = sh.ease ?? 1, w = u + (smoother(u) - u) * e;
  let k = 0;
  while (k < n - 2 && w > K[k + 1].t) k++;
  const a = K[Math.max(0, k - 1)], b = K[k], c = K[Math.min(n - 1, k + 1)], d = K[Math.min(n - 1, k + 2)];
  const v = n === 1 ? 0 : Math.min(1, Math.max(0, (w - b.t) / Math.max(1e-6, c.t - b.t)));
  for (let j = 0; j < 3; j++) { out[j] = cr(a.p[j], b.p[j], c.p[j], d.p[j], v); out[3 + j] = cr(a.at[j], b.at[j], c.at[j], d.at[j], v); }
  out[6] = cr(a.fov ?? 0.8, b.fov ?? 0.8, c.fov ?? 0.8, d.fov ?? 0.8, v);
  // Hand-held: slow, uncorrelated sway on the camera and a smaller one on the look-at (a few sines, never repeating soon).
  const dr = sh.drift ?? 0;
  if (dr > 0) {
    out[0] += dr * (Math.sin(time * 0.71 + 1.3) * 0.6 + Math.sin(time * 1.37 + 0.4) * 0.4);
    out[1] += dr * (Math.sin(time * 0.53 + 2.1) * 0.5 + Math.sin(time * 1.91 + 1.7) * 0.25);
    out[2] += dr * (Math.sin(time * 0.83 + 0.2) * 0.6 + Math.sin(time * 1.13 + 2.9) * 0.4);
    out[3] += dr * 0.4 * Math.sin(time * 0.61 + 0.9); out[4] += dr * 0.3 * Math.sin(time * 0.97 + 2.2);
  }
  const hasF = b.focus !== undefined && c.focus !== undefined;
  out[7] = hasF ? b.focus + (c.focus - b.focus) * v : Math.hypot(out[3] - out[0], out[4] - out[1], out[5] - out[2]);
  return out;
}
