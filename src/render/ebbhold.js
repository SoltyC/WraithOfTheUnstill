// Ebbhold's mesh (world/ebbhold.js describes the city; shaders/ebbhold.wgsl.js shades it): the collision boxes as faces (flights as
// treads, rails as solid carved parapets), and the architecture they stand for — the great pillars with their stepped capitals and
// the roof's ribs, colonnades tier on tier behind the galleries, pilasters and cornices up the long walls, portals round the gate and
// the sea-doors, veiled Shaper statues sculpted as surfaces of revolution (robe folds, sleeves, the hood's dark opening, a staff),
// bronze braziers holding flames that never move. One static mesh in world space; it casts into the shadow maps (the roof keeps the
// sun out) and its waters join the lakes' (render/water.js addInterior). Always drawn (the city is sealed), pipelines made at load.
//
// Winding: Babylon's front faces are clockwise as seen; every face here is listed counter-clockwise from outside and emitted
// reversed (emitted as listed, the outsides were culled — hollow pillars, and coplanar inner faces fighting through the floors).
// info attribute: x = kind (EBB_KIND), y = per-piece seed, z = cavity (0 open … 1 deep: folds, the hood) or a flame's height 0..1.

import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js';
import { ENV_UNIFORMS } from '../shaders/common.wgsl.js';
import { ATMO_MATERIAL_TEXTURES, ATMO_MATERIAL_BUFFERS } from '../shaders/atmoMaterial.wgsl.js';
import { SHADOW_TEXTURES } from '../shaders/shadows.wgsl.js';
import { ebbVertexWGSL, ebbFragmentWGSL, EBB_KIND as K } from '../shaders/ebbhold.wgsl.js';
import { bindEnvironment } from './environment.js';
import { bindAtmosphere } from './atmosphereBindings.js';
import { fastFrozenIsReady } from './babylonTweaks.js';
import { MAT_SAMPLERS, bindMaterialLibrary } from '../materials/library.js';
import { EBB_ORIGIN, HALL, buildCity, createEbbholdSolids } from '../world/ebbhold.js';

const TAU = Math.PI * 2;
/** Catmull-Rom through [t, v] points (t ascending) at t. */
function spline(pts, t) {
  let i = 0;
  while (i < pts.length - 2 && t > pts[i + 1][0]) i++;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
  const u = Math.min(1, Math.max(0, (t - p1[0]) / Math.max(p2[0] - p1[0], 1e-6))), u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3);
}
const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
/** Signed angle a − b in (−π, π]. */
const dAng = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d <= -Math.PI) d += TAU; return d; };

/** Mesh data for the city (world space). */
export function ebbholdGeometry(city = buildCity()) {
  const O = EBB_ORIGIN, H = HALL;
  const pos = [], nrm = [], info = [], idx = [];
  const vert = (x, y, z, n, k, seed, cav = 0, w = 0) => { pos.push(x + O.x, y + O.y, z + O.z); nrm.push(n[0], n[1], n[2]); info.push(k, seed, cav, w); };
  /** Four corners listed counter-clockwise from outside → two triangles, clockwise as seen (Babylon's front). */
  const quad = (a, b, c, d, n, k, seed) => {
    const v = pos.length / 3;
    vert(...a, n, k, seed); vert(...b, n, k, seed); vert(...c, n, k, seed); vert(...d, n, k, seed);
    idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
  };
  const box = (x0, x1, y0, y1, z0, z1, k, seed = 0) => {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], k, seed);
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], k, seed);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], k, seed);
    quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], k, seed);
    quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1], k, seed);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], k, seed);
  };
  /** A box centred on (cx, cz), half-widths hx, hz. */
  const cbox = (cx, cz, hx, hz, y0, y1, k, seed = 0) => box(cx - hx, cx + hx, y0, y1, cz - hz, cz + hz, k, seed);
  /** A frustum on a regular polygon (radius r0 at y0 to r1 at y1, `sides`, turned by rot): flat facets and caps. */
  const frustum = (cx, cz, y0, y1, r0, r1, sides, rot, k, seed = 0, caps = true) => {
    const ang = (i) => rot + (i / sides) * TAU;
    for (let i = 0; i < sides; i++) {
      const a = ang(i), b = ang(i + 1), m = (a + b) / 2;
      const slope = (r0 - r1) / Math.max(y1 - y0, 1e-3), nl = Math.hypot(1, slope);
      const n = [Math.cos(m) / nl, slope / nl, Math.sin(m) / nl];
      quad([cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0], [cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1],
        [cx + Math.cos(b) * r1, y1, cz + Math.sin(b) * r1], [cx + Math.cos(b) * r0, y0, cz + Math.sin(b) * r0], n, k, seed);
    }
    if (!caps) return;
    for (const [y, r, up] of [[y1, r1, 1], [y0, r0, -1]]) {
      if (r < 1e-4) continue;
      const c = pos.length / 3;
      vert(cx, y, cz, [0, up, 0], k, seed);
      for (let i = 0; i <= sides; i++) { const a = ang(i); vert(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, [0, up, 0], k, seed); }
      for (let i = 0; i < sides; i++) idx.push(c, c + 1 + (up > 0 ? i : i + 1), c + 1 + (up > 0 ? i + 1 : i));
    }
  };
  /**
   * A smooth surface of revolution about (cx, cz): `rings` + 1 rings at heights fy(t), radius rad(t, a) (a = angle, 0 = +x), the
   * section scaled by sz(t) along z; normals from the grid. cav(t, a) → info.z. Closed where the radius reaches 0.
   */
  const lathe = (cx, cz, rings, sides, fy, rad, k, seed, opt = {}) => {
    const sz = opt.sz || (() => 1), cav = opt.cav || (() => 0), kOf = opt.kind || (() => k), wv = opt.w || 0, sOf = opt.seed || (() => seed);
    const base = pos.length / 3, P = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings, y = fy(t), s = sz(t);
      for (let j = 0; j < sides; j++) { const a = (j / sides) * TAU, r = Math.max(0, rad(t, a)); P.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r * s, t, a]); }
    }
    const at = (i, j) => P[Math.min(rings, Math.max(0, i)) * sides + (((j % sides) + sides) % sides)];
    for (let i = 0; i <= rings; i++) for (let j = 0; j < sides; j++) {
      const p = at(i, j), u0 = at(i, j - 1), u1 = at(i, j + 1), v0 = at(i - 1, j), v1 = at(i + 1, j);
      const du = [u1[0] - u0[0], u1[1] - u0[1], u1[2] - u0[2]], dv = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      let n = [dv[1] * du[2] - dv[2] * du[1], dv[2] * du[0] - dv[0] * du[2], dv[0] * du[1] - dv[1] * du[0]];
      let l = Math.hypot(...n);
      if (l < 1e-9) { n = [0, i > rings / 2 ? 1 : -1, 0]; l = 1; }
      vert(p[0], p[1], p[2], [n[0] / l, n[1] / l, n[2] / l], kOf(p[3], p[4]), sOf(p[3], p[4]), cav(p[3], p[4]), wv);
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) {
      const a = base + i * sides + j, b = base + (i + 1) * sides + j, c = base + (i + 1) * sides + ((j + 1) % sides), d = base + i * sides + ((j + 1) % sides);
      idx.push(a, c, b, a, d, c);
    }
  };
  /** A lathe through [y, r] points (ascending y), linear between them. */
  const turned = (cx, cz, pts, sides, k, seed, opt) => {
    const n = pts.length - 1;
    lathe(cx, cz, n, sides, (t) => pts[Math.round(t * n)][0], (t) => pts[Math.round(t * n)][1], k, seed, opt);
  };
  /** Radius to the corners of an octagon whose flats are s apart. */
  const octR = (s) => s / 2 / Math.cos(Math.PI / 8);
  const OCT = Math.PI / 8;


  /** A beam from (ax, az) to (bx, bz) at heights y0..y1, w wide: an oriented box. */
  const beam = (ax, az, bx, bz, y0, y1, w, k, seed = 0) => {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, sx = -uz * w / 2, sz = ux * w / 2;
    const c = [[ax - sx, az - sz], [bx - sx, bz - sz], [bx + sx, bz + sz], [ax + sx, az + sz]];
    const P = (i, y) => [c[i][0], y, c[i][1]];
    quad(P(0, y1), P(3, y1), P(2, y1), P(1, y1), [0, 1, 0], k, seed);
    quad(P(0, y0), P(1, y0), P(2, y0), P(3, y0), [0, -1, 0], k, seed);
    const side = (i, j) => { const ex = c[j][0] - c[i][0], ez = c[j][1] - c[i][1], el = Math.hypot(ex, ez) || 1; quad(P(i, y0), P(j, y0), P(j, y1), P(i, y1), [ez / el, 0, -ex / el], k, seed); };
    side(0, 1); side(1, 2); side(2, 3); side(3, 0);
  };
  /** A soft lump (dough, a blanket, a roll): a squashed spheroid. */
  const lump = (x, y, z, rx, ry, rz, k, seed) => lathe(x, z, 8, 14, (t) => y + ry * (1 - Math.cos(Math.PI * t)), (t) => rx * Math.sin(Math.PI * t) * (1 + 0.06 * Math.sin(t * 9 + seed * 6)), k, seed, { sz: () => rz / rx });
  /** Dough: a slumped, folded mound (flat-bottomed, a seam where it was folded over), finely divided so the hands can press it
   *  (info.w = 1: the vertex shader dents it under the hands it is given). info.z: height 0..1. */
  const dough = (x, y, z, rx, ry, rz, seed) => lathe(x, z, 16, 28, (t) => y + ry * Math.sin(Math.PI * 0.5 * Math.min(1, t * 1.15)) * (t > 0.87 ? 1 - (t - 0.87) * 0.4 : 1),
    (t, a) => rx * Math.pow(Math.sin(Math.PI * (0.5 + 0.5 * t)), 0.7) * (1 + 0.08 * Math.sin(a * 2 + seed * 5) + 0.04 * Math.sin(a * 5 + seed * 3)) * (1 - 0.12 * Math.exp(-((Math.sin(a - seed * 4)) ** 2) / 0.02) * t),
    K.dough, seed, { sz: () => rz / rx, cav: (t) => t, w: 1 });
  /** A baked loaf: a domed oval, slashed along its top (the shader scores it), info.z: height 0..1, info.y: the angle round it. */
  const loaf = (x, y, z, rx, ry, rz, seed) => lathe(x, z, 12, 24, (t) => y + ry * Math.sin(Math.PI * 0.5 * t), (t) => rx * Math.pow(Math.cos(Math.PI * 0.5 * t), 0.55) * (1 + 0.03 * Math.sin(t * 13 + seed * 7)), K.loaf, seed, { sz: () => rz / rx, cav: (t) => t, seed: (t, a) => a / (Math.PI * 2) });   // (seed: the angle round it, for the scores)
  /** The things the people work at (world/ebbhold.js 'prop' boxes). */
  const prop = (b, seed) => {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, y0 = b.y0, y1 = b.y1;
    if (b.prop === 'kneader') {
      // A stone table on two trestles, the dough on a floured board, a bronze bowl.
      box(b.x0, b.x1, y1 - 0.12, y1, b.z0, b.z1, K.prop, seed);
      for (const x of [b.x0 + 0.3, b.x1 - 0.3]) { box(x - 0.12, x + 0.12, y0 + 0.1, y1 - 0.12, b.z0 + 0.12, b.z1 - 0.12, K.prop, seed); box(x - 0.2, x + 0.2, y0, y0 + 0.1, b.z0 + 0.02, b.z1 - 0.02, K.prop, seed); }
      box(cx - 0.62, cx + 0.62, y1, y1 + 0.03, cz - 0.42, cz + 0.42, K.linen, 0.9);
      // Near the table's edges, under each baker's hands.
      dough(cx - 0.3, y1 + 0.03, cz - 0.32, 0.24, 0.11, 0.19, 0.2);
      dough(cx + 0.3, y1 + 0.03, cz + 0.3, 0.21, 0.1, 0.17, 0.5);
      // Loaves already shaped and baked, cooling at the far end; a dusting of flour on the board.
      for (const [dx, dz, sd] of [[-1.1, 0.24, 0.1], [-1.0, -0.22, 0.6], [-0.84, 0.02, 0.35]]) loaf(cx + dx, y1, cz + dz, 0.17, 0.09, 0.1, sd);
      turned(b.x1 - 0.32, cz + 0.2, [[y1, 0.1], [y1 + 0.04, 0.16], [y1 + 0.16, 0.22], [y1 + 0.17, 0.2], [y1 + 0.06, 0.001]], 14, K.bronze, seed);
    } else if (b.prop === 'cradle') {
      // A bronze cradle on rockers, a blanket heaped in it.
      for (const x of [b.x0 + 0.08, b.x1 - 0.08]) beam(x, b.z0 - 0.12, x, b.z1 + 0.12, y0, y0 + 0.14, 0.06, K.bronze, seed);
      box(b.x0, b.x1, y0 + 0.14, y0 + 0.22, b.z0, b.z1, K.bronze, seed);
      box(b.x0, b.x1, y0 + 0.22, y1, b.z0, b.z0 + 0.04, K.bronze, seed); box(b.x0, b.x1, y0 + 0.22, y1, b.z1 - 0.04, b.z1, K.bronze, seed);
      box(b.x0, b.x0 + 0.04, y0 + 0.22, y1 + 0.12, b.z0, b.z1, K.bronze, seed); box(b.x1 - 0.04, b.x1, y0 + 0.22, y1, b.z0, b.z1, K.bronze, seed);
      lump(cx, y0 + 0.22, cz, 0.42, 0.3, 0.22, K.linen, 0.4);
    } else if (b.prop === 'wheel') {
      // The door-wheel: a bronze drum, five bars at its crew's hands, its shaft rising to the chains in the ceiling.
      turned(cx, cz, [[y0, 0.75], [y0 + 0.12, 0.72], [y0 + 0.2, 0.58], [y1 - 0.35, 0.55], [y1 - 0.3, 0.66], [y1 - 0.18, 0.66], [y1 - 0.12, 0.5], [y1, 0.32], [y1 + 6, 0.16], [y1 + 6.9, 0.16], [y1 + 7.0, 0.001]], 20, K.bronze, seed);
      for (let k = 0; k < 5; k++) {
        const a = k * 1.2566, r1 = 2.05;
        beam(cx + Math.cos(a) * 0.5, cz + Math.sin(a) * 0.5, cx + Math.cos(a) * r1, cz + Math.sin(a) * r1, y1 - 0.3, y1 - 0.18, 0.11, K.bronze, seed);
        turned(cx + Math.cos(a) * r1, cz + Math.sin(a) * r1, [[y1 - 0.34, 0.001], [y1 - 0.32, 0.07], [y1 - 0.16, 0.07], [y1 - 0.14, 0.001]], 8, K.trim, seed);
      }
    } else if (b.prop === 'broom') {
      turned(cx, cz, [[y0, 0.2], [y0 + 0.45, 0.25], [y0 + 0.47, 0.26], [y0 + 0.46, 0.001]], 14, K.bronze, seed);
      beam(cx + 0.3, cz, cx + 0.32, cz + 0.02, y0, y0 + 1.5, 0.05, K.trim, seed);
    } else if (b.prop === 'shelves') {
      // The archive: a long case against the wall, five shelves of rolls and bound books, each a little different.
      const along = b.x1 - b.x0, back = b.z0 + b.z1 > 0 ? b.z1 : b.z0, front = back === b.z1 ? b.z0 : b.z1;
      box(b.x0, b.x1, y0, y1, Math.min(back, back - Math.sign(back) * 0.08), Math.max(back, back - Math.sign(back) * 0.08), K.wall, seed);
      const zA = Math.min(back, front), zB = Math.max(back, front);
      for (let s2 = 0; s2 <= 5; s2++) box(b.x0, b.x1, y0 + s2 * 0.7, y0 + s2 * 0.7 + 0.06, zA, zB, K.prop, seed);
      for (let x = b.x0; x <= b.x1 + 1e-3; x += along / 8) box(x - 0.06, x + 0.06, y0, y1, zA, zB, K.prop, seed);
      let h = seed * 977 + 1;
      const rn = () => { h = (h * 16807) % 2147483647; return h / 2147483647; };
      for (let s2 = 0; s2 < 5; s2++) for (let x = b.x0 + 0.1; x < b.x1 - 0.3;) {
        const w = 0.12 + rn() * 0.35, ht = 0.25 + rn() * 0.35;
        if (rn() > 0.15) box(x, x + w, y0 + s2 * 0.7 + 0.06, y0 + s2 * 0.7 + 0.06 + ht, zA + 0.05, zB - 0.12, K.linen, rn());
        x += w + 0.02;
      }
    } else if (b.prop === 'register') {
      // The register: a stone lectern, the book open on it, bronze-bound.
      box(b.x0 + 0.35, b.x1 - 0.35, y0, y1 - 0.25, b.z0 + 0.35, b.z1 - 0.35, K.wall, seed);
      box(b.x0 + 0.1, b.x1 - 0.1, y1 - 0.25, y1 - 0.15, b.z0 + 0.1, b.z1 - 0.1, K.trim, seed);
      box(b.x0 + 0.2, cx - 0.03, y1 - 0.15, y1 - 0.02, b.z0 + 0.2, b.z1 - 0.2, K.linen, 0.95);
      box(cx + 0.03, b.x1 - 0.2, y1 - 0.15, y1 - 0.02, b.z0 + 0.2, b.z1 - 0.2, K.linen, 0.95);
    } else if (b.prop === 'shrine') {
      box(b.x0, b.x1, y0, y0 + 0.3, b.z0, b.z1, K.wall, seed);
      box(b.x0 + 0.2, b.x1 - 0.2, y0 + 0.3, y1 + 0.8, b.z0 + 0.25, b.z1 - 0.25, K.wall, seed);
      box(b.x0 + 0.15, b.x1 - 0.15, y1 + 0.5, y1 + 0.6, b.z0 + 0.2, b.z1 - 0.2, K.trim, seed);
    } else box(b.x0, b.x1, y0, y1, b.z0, b.z1, K.prop, seed);
  };

  // ── The boxes ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  city.boxes.forEach((b, i) => {
    const seed = (i * 0.6180339) % 1;
    if (b.kind === 'column' || b.kind === 'statue') return;   // drawn as their decoration
    let k = K.wall;
    if (b.kind === 'floor') k = b.sand ? K.sand : K.floor;
    else if (b.kind === 'plinth') k = K.wall;
    else if (b.kind === 'poolWall') k = K.sand;
    else if (b.kind === 'ceiling') k = K.ceiling;
    else if (b.kind === 'prop') k = K.prop;
    else if (b.kind === 'door') k = K.door;
    if (b.ramp) {
      // A flight as treads of 0.3 m, each 1.2 m deep under its top (the collision's line runs through their middles), nosed in bronze.
      const R = b.ramp, n = Math.max(1, Math.round(Math.abs(R.y1 - R.y0) / 0.3));
      for (let s = 0; s < n; s++) {
        const u0 = R.a + (R.b - R.a) * s / n, u1 = R.a + (R.b - R.a) * (s + 1) / n, top = R.y0 + (R.y1 - R.y0) * (s + 0.5) / n;
        if (R.axis === 'x') box(Math.min(u0, u1), Math.max(u0, u1), top - 1.2, top, b.z0, b.z1, K.floor, seed);
        else box(b.x0, b.x1, top - 1.2, top, Math.min(u0, u1), Math.max(u0, u1), K.floor, seed);
      }
      return;
    }
    if (b.kind === 'rail') {
      // A solid parapet: a plinth course, a carved body, a bronze coping proud on both sides, piers every 6 m.
      const along = b.x1 - b.x0 > b.z1 - b.z0, w = 0.08;
      const ex = along ? 0 : w, ez = along ? w : 0;
      box(b.x0 - ex, b.x1 + ex, b.y0, b.y0 + 0.22, b.z0 - ez, b.z1 + ez, K.wall, seed);
      box(b.x0, b.x1, b.y0 + 0.22, b.y1 - 0.16, b.z0, b.z1, K.parapet, seed);
      box(b.x0 - ex * 1.5, b.x1 + ex * 1.5, b.y1 - 0.16, b.y1, b.z0 - ez * 1.5, b.z1 + ez * 1.5, K.trim, seed);
      const len = along ? b.x1 - b.x0 : b.z1 - b.z0, n = Math.max(1, Math.round(len / 6));
      for (let j = 0; j <= n; j++) {
        const t = j / n, pw = 0.32;
        if (along) { const x = Math.min(b.x1 - pw, Math.max(b.x0 + pw, b.x0 + (b.x1 - b.x0) * t)); box(x - pw, x + pw, b.y0, b.y1 + 0.12, b.z0 - 0.12, b.z1 + 0.12, K.wall, seed); box(x - pw - 0.06, x + pw + 0.06, b.y1 + 0.12, b.y1 + 0.22, b.z0 - 0.18, b.z1 + 0.18, K.trim, seed); }
        else { const z = Math.min(b.z1 - pw, Math.max(b.z0 + pw, b.z0 + (b.z1 - b.z0) * t)); box(b.x0 - 0.12, b.x1 + 0.12, b.y0, b.y1 + 0.12, z - pw, z + pw, K.wall, seed); box(b.x0 - 0.18, b.x1 + 0.18, b.y1 + 0.12, b.y1 + 0.22, z - pw - 0.06, z + pw + 0.06, K.trim, seed); }
      }
      return;
    }
    if (b.kind === 'prop') { prop(b, seed); return; }
    box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, k, seed);
    if (b.kind === 'plinth') {
      // A statue's plinth: a moulded base and a bronze band under its top.
      box(b.x0 - 0.25, b.x1 + 0.25, b.y0, Math.min(b.y1, b.y0 + 3.6), b.z0 - 0.25, b.z1 + 0.25, K.wall, seed);
      box(b.x0 - 0.12, b.x1 + 0.12, b.y1 - 0.35, b.y1 - 0.1, b.z0 - 0.12, b.z1 + 0.12, K.trim, seed);
    }
    // A floor over the void gets a deep stepped fascia under it, a bronze string course on its edge.
    if (b.kind === 'floor' && !b.sand && b.y1 > H.floor + 1 && b.x1 - b.x0 > 3 && b.z1 - b.z0 > 3) {
      box(b.x0 + 0.6, b.x1 - 0.6, b.y0 - 1.6, b.y0, b.z0 + 0.6, b.z1 - 0.6, K.wall, seed);
      box(b.x0 + 1.6, b.x1 - 1.6, b.y0 - 3.4, b.y0 - 1.6, b.z0 + 1.6, b.z1 - 1.6, K.wall, seed);
      box(b.x0 - 0.05, b.x1 + 0.05, b.y0 + 0.3, b.y0 + 0.6, b.z0 - 0.05, b.z1 + 0.05, K.trim, seed);
    }
  });

  // ── The great pillars, their capitals, the roof's ribs ────────────────────────────────────────────────────────────────
  for (const d of city.decor) {
    if (d.type === 'pillar') {
      const r = octR(d.s), top = d.y1;
      // Shaft from the drowned floor to the capital; a bronze band every 24 m.
      frustum(d.x, d.z, d.y0, top - 16, r, r, 8, OCT, K.pillar, 0.3, false);
      for (let y = H.water + 6; y < top - 20; y += 24) {
        frustum(d.x, d.z, y, y + 0.6, r * 1.05, r * 1.08, 8, OCT, K.wall, 0.5);
        frustum(d.x, d.z, y + 0.6, y + 1.6, r * 1.1, r * 1.1, 8, OCT, K.trim, 0.5);
        frustum(d.x, d.z, y + 1.6, y + 2.2, r * 1.08, r * 1.05, 8, OCT, K.wall, 0.5);
      }
      // Its stepped foot where it leaves the water.
      frustum(d.x, d.z, H.water - 3, H.water + 1, r * 1.45, r * 1.38, 8, OCT, K.wall, 0.7);
      frustum(d.x, d.z, H.water + 1, H.water + 2.5, r * 1.25, r * 1.2, 8, OCT, K.wall, 0.7);
      frustum(d.x, d.z, H.water + 2.5, H.water + 3.2, r * 1.12, r * 1.1, 8, OCT, K.trim, 0.7);
      // The capital: a bronze necking, two flaring tiers, an abacus meeting the ribs.
      frustum(d.x, d.z, top - 16, top - 15, r * 1.08, r * 1.08, 8, OCT, K.trim, 0.2);
      frustum(d.x, d.z, top - 15, top - 10, r * 1.04, r * 1.38, 8, OCT, K.pillar, 0.4);
      frustum(d.x, d.z, top - 10, top - 9, r * 1.42, r * 1.42, 8, OCT, K.trim, 0.2);
      frustum(d.x, d.z, top - 9, top - 4.5, r * 1.42, r * 1.72, 8, OCT, K.pillar, 0.45);
      const hw = r * 1.72 * Math.cos(OCT);
      cbox(d.x, d.z, hw, hw, top - 4.5, top, K.wall, 0.6);
      cbox(d.x, d.z, hw + 0.15, hw + 0.15, top - 4.5, top - 3.9, K.trim, 0.6);
    } else if (d.type === 'column') {
      // A gallery column: octagonal, a moulded base, a bronze ring at half height, a flared capital under the slab.
      const r = octR(d.s), h = d.y1 - d.y0;
      cbox(d.x, d.z, d.s * 0.68, d.s * 0.68, d.y0, d.y0 + 0.5, K.wall, 0.2);
      frustum(d.x, d.z, d.y0 + 0.5, d.y0 + 1.1, r * 1.22, r * 1.05, 8, OCT, K.wall, 0.2);
      frustum(d.x, d.z, d.y0 + 1.1, d.y1 - 2.4, r, r * 0.94, 8, OCT, K.pillar, 0.35, false);
      if (h > 12) frustum(d.x, d.z, d.y0 + h * 0.5, d.y0 + h * 0.5 + 0.5, r * 1.06, r * 1.06, 8, OCT, K.trim, 0.35);
      frustum(d.x, d.z, d.y1 - 2.4, d.y1 - 2.0, r * 1.02, r * 1.02, 8, OCT, K.trim, 0.35);
      frustum(d.x, d.z, d.y1 - 2.0, d.y1 - 0.6, r * 0.98, r * 1.45, 8, OCT, K.pillar, 0.35);
      cbox(d.x, d.z, d.s * 0.72, d.s * 0.72, d.y1 - 0.6, d.y1, K.wall, 0.4);
    } else if (d.type === 'pilaster') {
      const s = Math.sign(d.z), zs = (a) => [Math.min(d.z, d.z - s * a), Math.max(d.z, d.z - s * a)];
      const [a0, a1] = zs(1.6), [b0, b1] = zs(2.6), [c0, c1] = zs(2.2), [e0, e1] = zs(1.0);
      box(d.x - d.s / 2, d.x + d.s / 2, d.y0, d.y1, a0, a1, K.pillar, 0.15);
      box(d.x - d.s / 2 - 0.9, d.x + d.s / 2 + 0.9, d.y0, d.y1, e0, e1, K.wall, 0.12);
      box(d.x - d.s / 2 - 0.8, d.x + d.s / 2 + 0.8, d.y1 - 6, d.y1, b0, b1, K.trim, 0.25);
      for (const y of [H.walk - 2, H.g1 - 2, H.g2 - 2, 62]) box(d.x - d.s / 2 - 0.4, d.x + d.s / 2 + 0.4, y - 1.4, y, c0, c1, K.trim, 0.35);
    }
  }
  // The roof's ribs: across the hall between the slits (none of them under a slit), a beam along each gallery's edge.
  for (const x of [46, 88, 130, 172, 214]) {
    box(x - 1.6, x + 1.6, H.roof - 6, H.roof, -H.HW, H.HW, K.wall, 0.8);
    box(x - 2.6, x + 2.6, H.roof - 2.5, H.roof, -H.HW, H.HW, K.wall, 0.8);
    box(x - 1.7, x + 1.7, H.roof - 6.4, H.roof - 6, -H.HW, H.HW, K.trim, 0.8);
  }
  for (const s of [1, -1]) {
    const z = s * 33;
    box(0, H.L, H.roof - 5, H.roof, z - 1.8, z + 1.8, K.wall, 0.85);
    box(0, H.L, H.roof - 5.4, H.roof - 5, z - 1.9, z + 1.9, K.trim, 0.85);
    // Cornices along the long walls, under and over the windows.
    const zw = (a) => [Math.min(s * H.HW, s * (H.HW - a)), Math.max(s * H.HW, s * (H.HW - a))];
    for (const [y0, y1, a, kk] of [[60, 62, 1.6, K.wall], [62, 62.5, 1.9, K.trim], [104, 106, 1.8, K.wall], [106, 106.5, 2.1, K.trim]]) { const [z0, z1] = zw(a); box(0, H.L, y0, y1, z0, z1, kk, 0.9); }
  }
  // Portals: the gate's stepped frame (the hall's side), and the sea-doors' — a deep frame and a lintel over the bronze leaves.
  for (const [x, dir, hw, ht] of [[0, 1, 6, 16], [H.L, -1, 14, 56]]) {
    for (let k = 0; k < 3; k++) {
      const d0 = x, d1 = x + dir * (0.8 + k * 0.7), xa = Math.min(d0, d1), xb = Math.max(d0, d1), o = 1.2 + (2 - k) * 1.4;
      box(xa, xb, 0, ht + o, -hw - o, -hw - o + 1.4, k === 1 ? K.trim : K.wall, 0.3);
      box(xa, xb, 0, ht + o, hw + o - 1.4, hw + o, k === 1 ? K.trim : K.wall, 0.3);
      box(xa, xb, ht + o - 1.4, ht + o, -hw - o, hw + o, k === 1 ? K.trim : K.wall, 0.3);
    }
  }

  // ── Statues: veiled Shapers sculpted as surfaces of revolution ─────────────────────────────────────────────────────────
  // Profile (fraction of the height → radius / height): hem, robe falling to the waist, chest, shoulders, the hood.
  const BODY = [[0, 0.168], [0.03, 0.172], [0.08, 0.158], [0.3, 0.138], [0.48, 0.124], [0.62, 0.13], [0.72, 0.145], [0.765, 0.152], [0.8, 0.118],
    [0.83, 0.084], [0.87, 0.088], [0.92, 0.082], [0.96, 0.06], [0.985, 0.03], [1, 0]];
  for (const d of city.decor) {
    if (d.type !== 'statue') continue;
    const h = d.h, x = d.x, z = d.z, y = d.y, aF = d.face > 0 ? Math.PI / 2 : -Math.PI / 2;
    const seed = ((x * 0.37 + z * 0.11) % 1 + 1) % 1, ph = seed * TAU;
    const rings = h > 30 ? 72 : 48, sides = h > 30 ? 56 : 40;
    const fold = (t) => Math.max(0, Math.min(1, (0.78 - t) / 0.7));
    const folds = (t, a) => Math.sin(a * 11 + ph + 1.4 * Math.sin(a * 3 + ph)) * fold(t) ** 1.3;
    lathe(x, z, rings, sides, (t) => y + t * h, (t, a) => {
      const da = dAng(a, aF);
      let r = spline(BODY, t);
      r += 0.009 * folds(t, a);                                                     // the robe's folds, deep at the hem
      r += 0.048 * bell(da, 0, 0.62) * bell(t, 0.545, 0.05);                         // folded sleeves at the front
      r += 0.012 * bell(da, 0, 0.9) * bell(t, 0.5, 0.025);                          // the hands' fold over them
      r -= 0.03 * bell(da, 0, 0.42) * bell(t, 0.885, 0.04);                         // the hood's opening
      r += 0.012 * bell(Math.abs(da), Math.PI, 0.6) * bell(t, 0.9, 0.06);            // the hood falls back
      return r * h;
    }, K.statue, seed, {
      sz: (t) => (t < 0.8 ? 0.7 : 0.92),
      cav: (t, a) => {
        const da = dAng(a, aF);
        return Math.min(1, Math.max(0, -folds(t, a)) * 0.7 + bell(da, 0, 0.4) * bell(t, 0.885, 0.035) * 1.2 + bell(da, 0, 0.7) * bell(t, 0.515, 0.012) * 0.6);
      },
    });
    // The staff, held through the folded hands, crowned with a bronze crescent.
    const sx = x, szz = z + d.face * 0.127 * h, sr = 0.011 * h;
    turned(sx, szz, [[y - 0.02 * h, sr * 1.3], [y + 0.01 * h, sr], [y + 1.0 * h, sr], [y + 1.01 * h, sr * 2.2], [y + 1.04 * h, sr * 2.6], [y + 1.06 * h, sr * 1.2], [y + 1.12 * h, 0.001]], 10, K.trim, 0.45);
    for (const side of [-1, 1]) {
      // the crescent's horns
      lathe(sx + side * 0.035 * h, szz, 10, 8, (t) => y + 1.04 * h + t * 0.07 * h, (t) => sr * 1.3 * Math.sin(Math.PI * (0.1 + 0.9 * t)) * (1 - t * 0.7), K.trim, 0.5);
    }
  }

  // ── Windows ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  for (const d of city.decor) {
    if (d.type !== 'window') continue;
    const w = d.w;
    if (d.end) {
      const x = d.x - 0.2;
      box(x - 0.2, x, d.y0, d.y1, d.z - w / 2, d.z + w / 2, K.window, 0);
      box(x - 1.4, x - 0.2, d.y0 - 1.2, d.y0, d.z - w / 2 - 1.2, d.z + w / 2 + 1.2, K.trim, 0);
      box(x - 1.4, x - 0.2, d.y1, d.y1 + 1.2, d.z - w / 2 - 1.2, d.z + w / 2 + 1.2, K.trim, 0);
      box(x - 1.4, x - 0.2, d.y0, d.y1, d.z - w / 2 - 1.2, d.z - w / 2, K.wall, 0);
      box(x - 1.4, x - 0.2, d.y0, d.y1, d.z + w / 2, d.z + w / 2 + 1.2, K.wall, 0);
    } else {
      const s = d.side, z = d.z - s * 0.2;
      const zz = [Math.min(z, z - s * 0.2), Math.max(z, z - s * 0.2)], fz = [Math.min(z, z - s * 1.4), Math.max(z, z - s * 1.4)], gz = [Math.min(z, z - s * 2.2), Math.max(z, z - s * 2.2)];
      box(d.x - w / 2, d.x + w / 2, d.y0, d.y1, zz[0], zz[1], K.window, 0);
      box(d.x - w / 2 - 1.2, d.x + w / 2 + 1.2, d.y0 - 1.2, d.y0, fz[0], fz[1], K.trim, 0);
      box(d.x - w / 2 - 1.2, d.x - w / 2, d.y0, d.y1, fz[0], fz[1], K.wall, 0);
      box(d.x + w / 2, d.x + w / 2 + 1.2, d.y0, d.y1, fz[0], fz[1], K.wall, 0);
      // A pointed hood over it: stepped courses narrowing up.
      for (let k = 0; k < 4; k++) box(d.x - w / 2 - 1.6 + k * 1.5, d.x + w / 2 + 1.6 - k * 1.5, d.y1 + k * 1.4, d.y1 + (k + 1) * 1.4, gz[0], gz[1], k === 0 ? K.trim : K.wall, 0);
      // Mullions: the light in three lancets.
      for (const m of [-1, 1]) box(d.x + m * w / 6 - 0.25, d.x + m * w / 6 + 0.25, d.y0, d.y1, fz[0], fz[1], K.trim, 0);
    }
  }

  // ── Braziers: a bronze stand and bowl on the floor under each lamp, the flame in it ───────────────────────────────────
  const S = createEbbholdSolids(city);
  for (const [x, y, z] of city.lamps) {
    S.qx = x + O.x; S.qz = z + O.z; S.ref = y - 1 + O.y; S.floorQ();
    const f = S.h > -1e3 ? Math.min(S.h - O.y, y - 1.2) : y - 2.2, sd = ((x * 0.13 + z * 0.29) % 1 + 1) % 1;
    const L = y - f;
    turned(x, z, [[f, 0.36], [f + 0.06, 0.38], [f + 0.14, 0.3], [f + 0.24, 0.13], [f + 0.4, 0.07], [f + L * 0.45, 0.055], [f + L * 0.45 + 0.08, 0.11],
      [f + L * 0.45 + 0.16, 0.06], [y - 0.62, 0.05], [y - 0.5, 0.09], [y - 0.36, 0.25], [y - 0.24, 0.37], [y - 0.16, 0.42], [y - 0.12, 0.4], [y - 0.13, 0.001]], 16, K.bronze, sd);
    // A still flame: a teardrop that never moves.
    lathe(x, z, 14, 12, (t) => y - 0.2 + t * 0.95, (t) => 0.27 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.25 + 0.02)), 0.75) * (1 - 0.55 * t) * (t > 0.78 ? 1 - (t - 0.78) / 0.22 : 1), K.flame, sd, { cav: (t) => t });
  }
  // Teodor's daughter, swaddled (info.w = 2: built at the city's origin, lying along x; the vertex shader carries it in his arms,
  // ebbCarry). A bundle, and the small round of the head at one end under a fold of the cloth.
  { const v0 = pos.length / 3;
    // A wool swaddle wound round her (bulges where each turn of the cloth crosses), a fold of pale linen framing the small head.
    lathe(0, 0, 22, 32, (t) => -0.25 + 0.47 * t, (t, a) => 0.112 * Math.pow(Math.sin(Math.PI * t), 0.5) * (1 + 0.07 * Math.max(0, Math.sin(t * 19 + a * 1.0)) - 0.04 * Math.cos(a * 2)), K.blanket, 0.3, { sz: () => 0.82 });
    lathe(0, 0, 14, 20, (t) => 0.19 + 0.17 * t, (t, a) => 0.09 * Math.pow(Math.sin(Math.PI * t), 0.75) * (1 + 0.08 * Math.sin(a * 6 + t * 5)), K.linen, 0.93, { cav: (t, a) => Math.max(0, Math.cos(a - Math.PI / 2)) * Math.sin(Math.PI * t) * 0.6 });
    for (let v = v0; v < pos.length / 3; v++) {
      // y (the lathe's axis) → x: lie it down.
      const x = pos[v * 3] - O.x, y = pos[v * 3 + 1] - O.y, nx = nrm[v * 3], ny = nrm[v * 3 + 1];
      pos[v * 3] = y + O.x; pos[v * 3 + 1] = -x + O.y; nrm[v * 3] = ny; nrm[v * 3 + 1] = -nx; info[v * 4 + 3] = 2;
    }
  }
  // Her face, asleep, in the linen's opening (already lying as carried: up is up).
  { const v0 = pos.length / 3;
    lathe(0.275, 0, 8, 14, (t) => 0.075 + 0.045 * t, (t) => 0.056 * Math.sin(Math.PI * (0.25 + 0.75 * t)) * (t > 0.85 ? 1 - (t - 0.85) * 3 : 1), K.skin, 0.5, { sz: () => 0.85 });
    for (let v = v0; v < pos.length / 3; v++) info[v * 4 + 3] = 2;
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), info: new Float32Array(info), indices: new Uint32Array(idx) };
}

/** The waters' surfaces (world): the hall's drowned floor, the nursery, the undercroft's pool. */
export function ebbholdWaterQuads(city = buildCity()) {
  const O = EBB_ORIGIN, out = [];
  for (const a of city.airs) if (a.water !== null && a.water < a.y1 - 0.05) out.push({ x0: a.x0 + O.x, x1: a.x1 + O.x, z0: a.z0 + O.z, z1: a.z1 + O.z, level: a.water + O.y, depth: a.water - a.y0 });
  for (const p of city.pools) out.push({ x0: p.x0 + O.x, x1: p.x1 + O.x, z0: p.z0 + O.z, z1: p.z1 + O.z, level: p.water + O.y, depth: 2.7 });
  return out;
}

/** @param {any} clipmap  its spell slots and world-light grid (the lamps) */
export function createEbbholdView(scene, atmo, clipmap, matLib) {
  const S = ShaderStore.ShadersStoreWGSL;
  S.ebbVertexShader = ebbVertexWGSL; S.ebbFragmentShader = ebbFragmentWGSL;
  const city = buildCity();
  const g = ebbholdGeometry(city);
  const mesh = new Mesh('ebbhold', scene);
  const vd = new VertexData(); vd.positions = g.positions; vd.normals = g.normals; vd.indices = g.indices; vd.applyToMesh(mesh, false);
  mesh.setVerticesData('info', g.info, false, 4);
  mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true; mesh.freezeWorldMatrix();
  /** y = fill (display-referred), z = the sea-light's strength (the sun through the slits). */
  const params = new Vector4(0, 0.035, 3.2, 0);   // z: the sea-light's strength on the stone (display-referred)
  const mat = new ShaderMaterial('ebbhold', scene, { vertex: 'ebb', fragment: 'ebb' }, {
    attributes: ['position', 'normal', 'info'],
    uniforms: ['viewProjection', 'spellLights', 'ebbParams', 'ebbHands', 'ebbCarry', ...ENV_UNIFORMS],
    samplers: [...ATMO_MATERIAL_TEXTURES, ...SHADOW_TEXTURES, ...MAT_SAMPLERS],
    storageBuffers: [...ATMO_MATERIAL_BUFFERS, 'lightGrid', 'shadowData'],
    shaderLanguage: ShaderLanguage.WGSL,
  });
  bindEnvironment(mat); bindAtmosphere(mat, atmo); bindMaterialLibrary(mat, matLib);
  mat.setArray4('spellLights', clipmap.spellLights); mat.setStorageBuffer('lightGrid', clipmap.lightGrid); mat.setVector4('ebbParams', params);
  /** Dents in the dough (world x, floor y, z, strength; systems/drowned.js writes them in place). */
  const hands = new Array(64).fill(0);
  mat.setArray4('ebbHands', hands);
  /** A carried thing (Teodor's daughter): world x, y, z, yaw; w of the second: 1 shown. */
  const carry = [0, 0, 0, 0, 0, 0, 0, 0];
  mat.setArray4('ebbCarry', carry);
  mesh.material = mat;
  const O = EBB_ORIGIN;
  return {
    mesh, material: mat, params, city, hands, carry, triangles: g.indices.length / 3,
    /** The lamps and glows (world, for systems/lights.js): flames that do not flicker, the cold light of the sea and the well. */
    lamps: [...city.lamps.map(([x, y, z]) => ({ x: x + O.x, y: y + O.y, z: z + O.z, radius: 20, color: [1, 0.62, 0.3], intensity: 7, kind: 'held' })),
      ...city.glows.map(([x, y, z, color, intensity, radius]) => ({ x: x + O.x, y: y + O.y, z: z + O.z, radius, color, intensity, kind: 'held' }))],
    /** The shadow casters' depth material (shadows.addCaster): its world matrix is the identity. */
    makeShadowMaterial(name, light, origin) {
      const m = new ShaderMaterial(name, scene, { vertex: 'capsule', fragment: 'shadowDepth' }, {
        attributes: ['position', 'normal'], uniforms: ['world', 'viewProjection', 'shadowLight', 'shadowOrigin'], shaderLanguage: ShaderLanguage.WGSL,
      });
      m.setVector4('shadowLight', light); m.setVector4('shadowOrigin', origin);
      m.backFaceCulling = false;
      return m;
    },
    freeze() { mat.freeze(); fastFrozenIsReady(mat); },
  };
}
