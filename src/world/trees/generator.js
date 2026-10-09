// Procedural trees (PLAN.md Phase 8 M4; art bar: screenshots/reference/forest-ruins-target.webp —
// "we don't want the same trees over and over"). A tree is grown, not modelled: a trunk, then
// branches spawned along it at species angles and spacing, each bending under gravity and toward
// the light, splitting into finer branches, ending in twigs that carry leaf clusters (cards
// showing a cluster sprite from the leaf atlas). Every variant comes from a seed; the species sets
// the habit. Pure geometry (Node-testable): positions, normals, uvs and a per-vertex (kind, seed,
// atlas cell, height in tree) for the renderer.
//
// Species (frost-to-meadow highland, the reference's mix):
//   pine   tall straight trunk, whorls of drooping branches shortening upward, needle sprays
//   oak    stout trunk that forks low, wide spreading crown, broad leaf clusters
//   birch  slender, slightly leaning, light airy crown, small leaves

const TAU = Math.PI * 2;

export const SPECIES = {
  pine: { height: [14, 24], trunkR: [0.22, 0.38], trunkLean: 0.04, crownStart: [0.25, 0.4], levels: 2,
    whorl: true, branches: [26, 40], branchAngle: [1.25, 1.6], branchLen: [0.32, 0.42], droop: 0.55, up: 0.0,
    child: { count: [3, 6], angle: [0.6, 1.0], len: [0.3, 0.5] }, leafSize: [1.1, 1.7], leafDensity: 1.6, cell: 0, bark: 'bark-pine' },
  oak: { height: [13, 20], trunkR: [0.38, 0.62], trunkLean: 0.08, crownStart: [0.28, 0.42], levels: 3,
    whorl: false, branches: [9, 14], branchAngle: [0.55, 1.05], branchLen: [0.45, 0.65], droop: 0.12, up: 0.35,
    child: { count: [3, 5], angle: [0.5, 0.95], len: [0.4, 0.6] }, leafSize: [1.5, 2.3], leafDensity: 2.2, cell: 1, bark: 'bark-oak' },
  birch: { height: [13, 20], trunkR: [0.16, 0.26], trunkLean: 0.12, crownStart: [0.35, 0.5], levels: 3,
    whorl: false, branches: [10, 16], branchAngle: [0.5, 0.85], branchLen: [0.28, 0.4], droop: 0.35, up: 0.25,
    child: { count: [2, 4], angle: [0.45, 0.8], len: [0.45, 0.65] }, leafSize: [1.0, 1.5], leafDensity: 2.0, cell: 2, bark: 'bark-smooth' },
  // Understory shrub (hazel-like): several slender stems from the ground, arching out, dense
  // small-leaved clusters — it grows in groves' gaps and along their edges.
  shrub: { height: [2.0, 3.6], trunkR: [0.035, 0.06], trunkLean: 0.2, crownStart: [0.2, 0.3], levels: 2, stems: [7, 12],
    whorl: false, branches: [0, 0], branchAngle: [0.35, 0.95], branchLen: [0.75, 1.0], droop: 0.5, up: 0.15,
    child: { count: [4, 7], angle: [0.5, 1.0], len: [0.45, 0.7] }, leafSize: [0.9, 1.3], leafDensity: 3.8, cell: 1, bark: 'bark-smooth' },
  // A fallen trunk or a stump (growLog): bark only, mossed.
  log: { height: [0, 0], trunkR: [0.2, 0.42], log: true, cell: 1, bark: 'bark-oak' },
};
export const KIND = { BARK: 0, LEAF: 1 };

function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; s ^= s >>> 12; return (s >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t;
const rr = (R, [a, b]) => lerp(a, b, R());
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/**
 * Grow one tree. lod 0 = full (fine tubes, every leaf cluster), 1 = far (coarser tubes, fewer and
 * larger clusters, no finest branches). Returns flat arrays and the trunk radius at the base.
 */
export function growTree(speciesId, seed, lod = 0) {
  const sp = SPECIES[speciesId], R = rng(seed * 2654435761 + speciesId.length);
  const out = { pos: [], nrm: [], uv: [], info: [], idx: [] };
  const H = rr(R, sp.height), r0 = rr(R, sp.trunkR);
  const leafCell = sp.cell;
  // A branch as a list of nodes: position, radius; then a tube along it.
  function tube(nodes, sides, vScale) {
    const base = out.pos.length / 3;
    let prevT = null, vAcc = 0;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const t = norm(i < nodes.length - 1 ? add(nodes[i + 1].p, n.p, -1) : add(n.p, nodes[i - 1].p, -1));
      // A frame that rolls with the branch (parallel transport) so the bark does not twist.
      let u = prevT ? norm(cross(cross(t, prevT.u), t)) : norm(cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
      if (!isFinite(u[0])) u = norm(cross(t, [1, 0, 0]));
      const v = cross(t, u);
      prevT = { u };
      if (i > 0) vAcc += Math.hypot(n.p[0] - nodes[i - 1].p[0], n.p[1] - nodes[i - 1].p[1], n.p[2] - nodes[i - 1].p[2]);
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * TAU, c = Math.cos(a), s = Math.sin(a);
        // Bark ridges: a slight lumpy radius so silhouettes are not perfect cylinders.
        const lump = 1 + 0.06 * Math.sin(a * 3 + i * 1.7 + seed) * (n.r > 0.08 ? 1 : 0);
        const d = [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s];
        out.pos.push(n.p[0] + d[0] * n.r * lump, n.p[1] + d[1] * n.r * lump, n.p[2] + d[2] * n.r * lump);
        out.nrm.push(d[0], d[1], d[2]);
        // u around (in metres of circumference, so bark texel size is constant), v along.
        out.uv.push((k / sides) * TAU * Math.max(n.r, 0.05) * 1.0, vAcc * vScale);
        out.info.push(KIND.BARK, seed % 997, 0, n.p[1] / H);
      }
    }
    for (let i = 0; i < nodes.length - 1; i++) for (let k = 0; k < sides; k++) {
      const a = base + i * (sides + 1) + k, b = a + sides + 1;
      out.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // A leaf cluster: two crossed cards (and a third, flatter one) showing a cluster sprite.
  function cluster(p, dir, size, s2) {
    const up = norm(add(dir, [0, 0.6, 0]));
    const side = norm(cross(up, [R() - 0.5, 0.2, R() - 0.5]));
    const fwd = norm(cross(side, up));
    const variant = Math.floor(R() * 4); // four sprites per species cell row
    const cards = 2;
    for (let c = 0; c < cards; c++) {
      const ax = c === 0 ? side : c === 1 ? fwd : norm(add(side, fwd));
      const ay = c === 2 ? norm(add(up, fwd, -0.8)) : up;
      const base = out.pos.length / 3;
      const nrmC = norm(cross(ax, ay));
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const q = add(add(p, ax, (u - 0.5) * size), ay, (v - 0.15) * size);
        out.pos.push(q[0], q[1], q[2]);
        // Leaf normals point out of the crown (rounded crown lighting), not along the card.
        const crownN = norm(add(add(q, [0, -H * 0.62, 0], 1), nrmC, 0.3 * (u - 0.5)));
        out.nrm.push(crownN[0], crownN[1], crownN[2]);
        out.uv.push(u, v);
        out.info.push(KIND.LEAF, s2, leafCell * 4 + variant, q[1] / H);
      }
      out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  // Grow a branch from p along dir: length L, start radius r, level; spawns children and leaves.
  function branch(p, dir, L, r, level) {
    const segs = Math.max(2, Math.round(L / (lod ? 1.6 : 0.8)));
    const nodes = [{ p, r }];
    let d = dir, q = p;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      // Gravity droop grows along the branch; a pull toward the light; a little wander.
      d = norm(add(add(add(d, [0, -1, 0], sp.droop * 0.12 * (level > 0 ? 1 : 0.2)), [0, 1, 0], sp.up * 0.08), [R() - 0.5, R() - 0.5, R() - 0.5], 0.12));
      q = add(q, d, L / segs);
      nodes.push({ p: q, r: Math.max(0.012, r * (1 - 0.85 * t)) });
    }
    const sides = r > 0.25 ? (lod ? 7 : 10) : r > 0.08 ? (lod ? 5 : 6) : (lod ? 3 : 4);
    if (r > (lod ? 0.03 : 0.012)) tube(nodes, sides, 1 / 1.6);
    if (level >= sp.levels || (lod && level >= sp.levels - 1)) {
      // Twig end: leaf clusters along the outer part.
      const n = Math.max(1, Math.round((lod ? 1.2 : 2.5) * sp.leafDensity * L));
      for (let k = 0; k < n; k++) {
        const t = 0.45 + 0.55 * (k + R() * 0.5) / n, ni = Math.min(nodes.length - 1, Math.round(t * (nodes.length - 1)));
        cluster(nodes[ni].p, d, rr(R, sp.leafSize) * (lod ? 1.4 : 1), Math.floor(R() * 997));
      }
      return;
    }
    const c = sp.child, nc = Math.round(rr(R, c.count));
    for (let k = 0; k < nc; k++) {
      const t = 0.3 + 0.65 * (k + R()) / nc, ni = Math.min(nodes.length - 2, Math.round(t * (nodes.length - 1)));
      const a = R() * TAU, el = rr(R, c.angle);
      const side = norm(cross(d, [Math.cos(a), 0.3, Math.sin(a)]));
      const cd = norm(add(add(d, [0, 0, 0], Math.cos(el)), side, Math.sin(el) * 1.4));
      branch(nodes[ni].p, cd, L * rr(R, c.len), nodes[ni].r * 0.6, level + 1);
    }
  }
  if (sp.stems) {
    // Shrub: stems from a clump at the ground, each a branch of level 1 arching out.
    const ns = Math.round(rr(R, sp.stems));
    for (let k = 0; k < ns; k++) {
      const a = k * 2.39996 + R() * 0.5, el = rr(R, sp.branchAngle);
      const dir = norm([Math.cos(a) * Math.sin(el), Math.cos(el), Math.sin(a) * Math.sin(el)]);
      const p0 = [Math.cos(a) * 0.12 * R(), -0.15, Math.sin(a) * 0.12 * R()];
      branch(p0, dir, H * rr(R, sp.branchLen), r0 * (0.7 + 0.3 * R()), 1);
    }
    return finish();
  }
  // Trunk: a slightly leaning, wandering column; a root flare at the base.
  const lean = [(R() - 0.5) * sp.trunkLean * 2, 1, (R() - 0.5) * sp.trunkLean * 2];
  const tNodes = [];
  const tSegs = lod ? 6 : 12;
  let tp = [0, -0.4, 0], td = norm(lean);
  for (let i = 0; i <= tSegs; i++) {
    const t = i / tSegs;
    const flare = 1 + 0.6 * Math.max(0, 1 - t * 8) ** 2;
    tNodes.push({ p: tp, r: r0 * (1 - 0.82 * t) * flare });
    td = norm(add(td, [R() - 0.5, 0, R() - 0.5], 0.05));
    tp = add(tp, td, (H + 0.4) / tSegs);
  }
  tube(tNodes, lod ? 8 : 12, 1 / 1.6);
  // Main branches along the crown.
  const cs = rr(R, sp.crownStart), nb = Math.round(rr(R, sp.branches) * (lod ? 0.7 : 1));
  for (let k = 0; k < nb; k++) {
    const t = cs + (1 - cs) * (sp.whorl ? Math.floor(k / 4) / Math.ceil(nb / 4) : (k + R() * 0.8) / nb);
    const ti = Math.min(tSegs - 1, Math.floor(t * tSegs)), f = t * tSegs - ti;
    const p = add(tNodes[ti].p, add(tNodes[ti + 1].p, tNodes[ti].p, -1), f);
    const r = lerp(tNodes[ti].r, tNodes[ti + 1].r, f);
    const a = (sp.whorl ? (k % 4) / 4 * TAU + Math.floor(k / 4) * 0.7 : k * 2.39996) + R() * 0.4;
    const el = rr(R, sp.branchAngle);
    const dir = norm([Math.cos(a) * Math.sin(el), Math.cos(el), Math.sin(a) * Math.sin(el)]);
    // Higher branches are shorter (cone for conifers, rounder for broadleaf).
    const shorten = sp.whorl ? 1 - 0.85 * (t - cs) / (1 - cs) : 1 - 0.45 * Math.abs(t - (cs + 1) / 2) * 2;
    branch(p, dir, H * rr(R, sp.branchLen) * Math.max(0.15, shorten), r * 0.55, 1);
  }
  // The leader: a pine's top keeps going as a spire of needle clusters.
  if (sp.whorl) for (let k = 0; k < 4; k++) cluster(add(tNodes[tSegs].p, [0, -k * 0.6, 0]), [0, 1, 0], rr(R, sp.leafSize) * 0.8, k * 31);
  return finish();
  function finish() {
    return {
      positions: new Float32Array(out.pos), normals: new Float32Array(out.nrm), uvs: new Float32Array(out.uv),
      info: new Float32Array(out.info), indices: new Uint32Array(out.idx), height: H, trunkR: r0,
    };
  }
}

/**
 * A fallen log (lying along +x, centred, resting on y = 0) or, for every third seed, a stump:
 * bark tubes with broken branch stubs and a ragged end. info.w (height in tree) is kept low so the
 * bark shader mosses it. Returns the arrays growTree returns, plus length (m) and radius (m).
 */
export function growLog(seed, lod = 0) {
  const R = rng(seed * 2246822519 + 7);
  const out = { pos: [], nrm: [], uv: [], info: [], idx: [] };
  const stump = seed % 3 === 0;
  const r0 = rr(R, SPECIES.log.trunkR) * (stump ? 1.3 : 1);
  const L = stump ? 0.35 + 0.7 * R() : 4 + 6 * R();
  const sides = lod ? 7 : 12, segs = stump ? 3 : (lod ? 6 : 14);
  function ring(c, t, r, frame, vAcc, mossK) {
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      // Rot: the bark sags and splits a little; a lumpy section.
      const lump = 1 + 0.07 * Math.sin(a * 3 + t * 9 + seed) + 0.04 * Math.sin(a * 7 - t * 13);
      const d = [frame[0][0] * ca + frame[1][0] * sa, frame[0][1] * ca + frame[1][1] * sa, frame[0][2] * ca + frame[1][2] * sa];
      out.pos.push(c[0] + d[0] * r * lump, c[1] + d[1] * r * lump, c[2] + d[2] * r * lump);
      out.nrm.push(d[0], d[1], d[2]);
      out.uv.push((k / sides) * TAU * r, vAcc / 1.6);
      out.info.push(KIND.BARK, seed % 997, 0, mossK);
    }
  }
  function strip(n) {
    const base = out.pos.length / 3 - (n + 1) * (sides + 1);
    for (let i = 0; i < n; i++) for (let k = 0; k < sides; k++) {
      const a = base + i * (sides + 1) + k, b = a + sides + 1;
      out.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  if (stump) {
    // Upright, flared at the root, sunk a little; a ragged top.
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, flare = 1 + 0.5 * (1 - t) * (1 - t);
      ring([0, -0.25 + t * (L + 0.25), 0], t, r0 * flare, [[1, 0, 0], [0, 0, 1]], t * L, 0.05 + 0.1 * t);
    }
    strip(segs);
    // Top: a jagged disc of splinters (bark-textured; reads as broken wood).
    const top = out.pos.length / 3;
    out.pos.push(0, L - 0.05, 0); out.nrm.push(0, 1, 0); out.uv.push(0.5, 0.5); out.info.push(KIND.BARK, seed % 997, 0, 0.3);
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * TAU, jag = (k % 2 ? 0.12 : -0.05) * r0 + R() * 0.1 * r0;
      out.pos.push(Math.cos(a) * r0 * 0.98, L + jag, Math.sin(a) * r0 * 0.98); out.nrm.push(0, 1, 0);
      out.uv.push(0.5 + Math.cos(a) * 0.4, 0.5 + Math.sin(a) * 0.4); out.info.push(KIND.BARK, seed % 997, 0, 0.3);
      if (k < sides) out.idx.push(top, top + 1 + k + 1, top + 1 + k);
    }
  } else {
    // Lying along x, a gentle sag, tapering; resting on the ground (centre at y = r).
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, r = r0 * (1 - 0.35 * t);
      const y = r * 0.85 - 0.06 * Math.sin(Math.PI * t);
      ring([(t - 0.5) * L, y, 0.15 * Math.sin(t * 2.3 + seed)], t, r, [[0, 1, 0], [0, 0, 1]], t * L, 0.12);
    }
    strip(segs);
    // Broken branch stubs.
    const stubs = 2 + Math.floor(R() * 3);
    for (let k = 0; k < stubs; k++) {
      const t = 0.2 + 0.7 * R(), a = R() * TAU * 0.5 + 0.3, sr = r0 * (0.25 + 0.2 * R()), sl = 0.3 + 0.8 * R();
      const dir = norm([0.3 * (R() - 0.5), Math.sin(a), Math.cos(a)]);
      const c0 = [(t - 0.5) * L, r0 * 0.85, 0];
      const u = norm(cross(dir, [1, 0, 0])), v = cross(dir, u);
      for (let i = 0; i <= 2; i++) ring(add(c0, dir, (r0 * 0.6) + sl * i / 2), i / 2, sr * (1 - 0.4 * i / 2), [u, v], sl * i / 2, 0.15);
      strip(2);
    }
  }
  return {
    positions: new Float32Array(out.pos), normals: new Float32Array(out.nrm), uvs: new Float32Array(out.uv),
    info: new Float32Array(out.info), indices: new Uint32Array(out.idx), height: stump ? L : r0 * 2, trunkR: r0, length: stump ? 0 : L,
  };
}
