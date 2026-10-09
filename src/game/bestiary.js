// The journal's bestiary (BRIEF §11: "sketches of creatures and Wardens"): when a creature is
// first seen whole, its real form — the chunk records of its body — is taken side-on into a
// compact sketch (per chunk: along, up, half-length, half-height, tilt, ice), kept in the quest
// variables (saved), and drawn in ink on the codex page: wobbling outlines, a second lighter
// pass, hatching on the undersides, a ground line. Pure functions: testable in Node.

import { CHUNK_FLOATS } from './shaped/rig.js';

export const BEASTS = [
  { id: 'hound', name: 'Rime hound', text: 'Packed snow over a spine of ice, a core that glows when it means to lunge. They hunt in turns, never all at once. A frozen one breaks like a dropped plate.' },
  { id: 'brute', name: 'Drift brute', text: 'Heavy as a cornice. The crust along its back cracks and glows before it slams; step back from the ring, or over it.' },
  { id: 'seer', name: 'Frost seer', text: 'Keeps its distance and gathers light in its core, then throws shards in a fan at where you will be. Stone stops them.' },
  { id: 'denmother', name: 'The den mother', text: 'A brute grown old under rime that turns blows aside. Freeze her first; only then does she break.' },
  { id: 'warden', name: 'The Frost Warden', text: 'A glacier that learned to walk, holding the steppe still in its water joints. The Shapers made it to keep the snows moving. It kept them still instead.' },
];

/**
 * Take a sketch from chunk records: those in [rec0, rec0 + count) that are visible (alpha > 0.5),
 * seen side-on from a body at (cx, cz) facing `heading`, ground at gy. Returns a flat array of
 * numbers rounded to cm (6 per chunk).
 */
export function takeSketch(chunks, rec0, count, cx, gy, cz, heading) {
  // Side-on: along the body's own longest horizontal axis (principal axis of its chunks in plan),
  // which holds whatever the heading convention; the heading only picks which way it faces.
  let sxx = 0, szz = 0, sxz = 0, n = 0, mx = 0, mz = 0;
  for (let c = 0; c < count; c++) { const o = (rec0 + c) * CHUNK_FLOATS; if (chunks[o + 15] < 0.5) continue; mx += chunks[o]; mz += chunks[o + 2]; n++; }
  if (n) { mx /= n; mz /= n; }
  for (let c = 0; c < count; c++) {
    const o = (rec0 + c) * CHUNK_FLOATS; if (chunks[o + 15] < 0.5) continue;
    const dx = chunks[o] - mx, dz = chunks[o + 2] - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz;
  }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  let fx = Math.cos(ang), fz = Math.sin(ang);
  if (fx * Math.sin(heading) + fz * Math.cos(heading) < 0) { fx = -fx; fz = -fz; }
  cx = mx; cz = mz;
  const out = [];
  for (let c = 0; c < count; c++) {
    const o = (rec0 + c) * CHUNK_FLOATS;
    if (chunks[o + 15] < 0.5) continue;
    const px = chunks[o] - cx, pz = chunks[o + 2] - cz;
    const u = px * fx + pz * fz, v = chunks[o + 1] - gy;
    // The ellipsoid's extent in the side view: its forward and up axes projected on (along, up).
    const sx = chunks[o + 3], sy = chunks[o + 7], sz = chunks[o + 11];
    const fu = chunks[o + 4] * fx + chunks[o + 6] * fz, fv = chunks[o + 5];
    const uu = chunks[o + 8] * fx + chunks[o + 10] * fz, uv = chunks[o + 9];
    const a = Math.hypot(fu * sy, fv * sy) || sx, b = Math.hypot(uu * sz, uv * sz) || sz;
    const tilt = Math.atan2(fv, fu || 1e-6);
    const kind = chunks[o + 13];
    const r = (x) => Math.round(x * 100) / 100;
    out.push(r(u), r(v), r(Math.max(a, sx * 0.6)), r(Math.max(b, 0.02)), r(tilt), kind >= 0.5 && kind < 1.5 ? 1 : 0);
  }
  return out;
}

/** Ink drawing of a sketch as an SVG string: the creature's silhouette traced from the union of
 *  its chunks (marching squares on a fine grid, drawn as short wobbling strokes), its largest
 *  inner masses suggested faintly, hatching on the underside, a ground line. */
export function sketchSvg(sk, w = 560, h = 300) {
  if (!sk || sk.length < 6) return '';
  let u0 = 1e9, u1 = -1e9, v1 = 0;
  for (let i = 0; i < sk.length; i += 6) { u0 = Math.min(u0, sk[i] - sk[i + 2]); u1 = Math.max(u1, sk[i] + sk[i + 2]); v1 = Math.max(v1, sk[i + 1] + sk[i + 3]); }
  const span = Math.max(u1 - u0, 0.5), sc = Math.min((w - 60) / span, (h - 50) / Math.max(v1, 0.3));
  const ox = 30 + (w - 60 - (u1 - u0) * sc) / 2;
  const X = (u) => ox + (u - u0) * sc, Y = (v) => h - 28 - v * sc;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // Inside test in sketch space (u, v): any chunk ellipse (tilted) covers it, above the ground.
  const inside = (u, v) => {
    if (v < 0) return false;
    for (let i = 0; i < sk.length; i += 6) {
      const du = u - sk[i], dv = v - sk[i + 1], c = Math.cos(sk[i + 4]), s = Math.sin(sk[i + 4]);
      const a = du * c + dv * s, b = -du * s + dv * c;
      if ((a * a) / (sk[i + 2] * sk[i + 2]) + (b * b) / (sk[i + 3] * sk[i + 3]) <= 1) return true;
    }
    return false;
  };
  const N = 150, M = Math.max(30, Math.round(N * Math.max(v1, 0.3) / span));
  const du = span / N, dv = Math.max(v1, 0.3) * 1.05 / M;
  const g = new Uint8Array((N + 1) * (M + 1));
  for (let j = 0; j <= M; j++) for (let k = 0; k <= N; k++) g[j * (N + 1) + k] = inside(u0 + k * du, j * dv) ? 1 : 0;
  // Marching squares: one stroke per boundary cell, through the edge midpoints (with wobble).
  let outline = '';
  const P = (k, j) => [X(u0 + k * du), Y(j * dv)];
  for (let j = 0; j < M; j++) for (let k = 0; k < N; k++) {
    const a = g[j * (N + 1) + k], b = g[j * (N + 1) + k + 1], c = g[(j + 1) * (N + 1) + k + 1], d = g[(j + 1) * (N + 1) + k];
    const code = a | (b << 1) | (c << 2) | (d << 3);
    if (code === 0 || code === 15) continue;
    const e = [P(k + 0.5, j), P(k + 1, j + 0.5), P(k + 0.5, j + 1), P(k, j + 0.5)]; // bottom, right, top, left
    const segs = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 2], [0, 1]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[2, 0]], 10: [[2, 1], [0, 3]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]] }[code];
    for (const [p, q] of segs) {
      const j1 = (rnd() - 0.5) * 0.9, j2 = (rnd() - 0.5) * 0.9;
      outline += `M${(e[p][0] + j1).toFixed(1)},${(e[p][1] + j2).toFixed(1)}L${(e[q][0] - j2).toFixed(1)},${(e[q][1] + j1).toFixed(1)}`;
    }
  }
  // Inner masses: the largest few chunks, faint, as hints of form.
  const idx = [];
  for (let i = 0; i < sk.length; i += 6) idx.push(i);
  idx.sort((p, q) => sk[q + 2] * sk[q + 3] - sk[p + 2] * sk[p + 3]);
  let inner = '';
  for (const i of idx.slice(0, Math.min(10, Math.ceil(idx.length * 0.12)))) {
    const cx = X(sk[i]), cy = Y(sk[i + 1]), a = sk[i + 2] * sc * 0.92, b = sk[i + 3] * sc * 0.92, t = sk[i + 4];
    const a0 = 0.6 + rnd() * 1.2, a1 = a0 + 1.6 + rnd() * 1.4; // an arc, not a whole ellipse
    let d = '';
    for (let k = 0; k <= 10; k++) {
      const ang = a0 + (a1 - a0) * k / 10, x = Math.cos(ang) * a, y = Math.sin(ang) * b;
      d += (k ? 'L' : 'M') + (cx + x * Math.cos(t) - y * Math.sin(t)).toFixed(1) + ',' + (cy - (x * Math.sin(t) + y * Math.cos(t))).toFixed(1);
    }
    inner += `<path d="${d}" fill="none" stroke="#3b2a1a" stroke-width="0.7" stroke-opacity="0.4"/>`;
  }
  // Hatching: short diagonal strokes inside the lower part of the body.
  let hatch = '';
  for (let j = 1; j < M * 0.55; j += 2) for (let k = 0; k < N; k += 3) {
    if (!g[j * (N + 1) + k] || !g[(j + 2) * (N + 1) + Math.min(N, k + 2)]) continue;
    if (rnd() < 0.35) continue;
    const [x, y] = P(k, j);
    hatch += `M${x.toFixed(1)},${y.toFixed(1)}l${(du * sc * 2.2).toFixed(1)},${(-dv * sc * 2.2).toFixed(1)}`;
  }
  const gy = Y(0);
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg" class="sketch">` +
    `<path d="${hatch}" stroke="#3b2a1a" stroke-width="0.55" stroke-opacity="0.35" fill="none"/>` + inner +
    `<path d="${outline}" stroke="#2e2014" stroke-width="1.5" stroke-opacity="0.85" stroke-linecap="round" fill="none"/>` +
    `<path d="M14,${gy.toFixed(1)} Q${(w * 0.3).toFixed(0)},${(gy + 2).toFixed(1)} ${(w * 0.55).toFixed(0)},${gy.toFixed(1)} T${w - 14},${(gy + 1).toFixed(1)}" stroke="#3b2a1a" stroke-width="0.9" stroke-opacity="0.5" fill="none"/></svg>`;
}
