// A building's collapse (the destruction system: systems/destruction.js; pieces from world/fracture.js), on Rapier
// (@dimforge/rapier3d-compat, in a worker: game/collapse.worker.js). Nothing is scripted to fall: the structure decides
// (user, 2026-11-23: "too standardised … falls down in a very unrealistic way").
//   mortar     every two pieces that touch are bonded, the bond as strong as their contact is wide and their stuff is tough
//              (stone and basalt mortared, timber pegged, plaster weak). Bonded pieces are one rigid body (a compound of
//              their boxes); a body that holds a piece of the ground (a foundation, the hill) stands fixed.
//   the cause  attacks, not a script: the lava eats the lowest courses where it reaches them (their mortar gone, shoved
//              along with it); a surge's blast pushes every face that meets it and tears what cannot hold.
//   failure    a broken bond splits a body into new bodies, each going on with its share of the old one's motion. What
//              has lost its footing falls — onto whatever is still under it (every piece collides with every other and
//              with the ground): a wall undercut on one side leans and topples that way, a storey drops onto the one below.
//              What still stands but hangs by too little (most of its footing gone, or its weight outside what is left)
//              gives way. A blow harder than the mortar cracks it round where it struck, so bodies come apart as they land.
// Deterministic for a seed (fixed step, fixed order): a collapse seen once and replayed on loading settle alike.
// Events (the blows and the breaks) go to the dust; the heap at rest to the rubble mound (render/debris.js).

import RAPIER from '@dimforge/rapier3d-compat';

/** Resolves once the engine is ready (the worker and the tests wait on it). */
export const physicsReady = RAPIER.init({});

const G = 9.81, DT = 1 / 60;
/** Mortar: bond strength per m² of contact (impulse, N·s), by architecture material (world/architecture.js MAT). */
const MORTAR = { 0: 2600, 1: 2600, 20: 3000, 5: 3500, 8: 900, 3: 2200, 13: 1600, 9: 500, 10: 700, 11: 800, 12: 700, 14: 1800, 16: 600, 6: 4000, 17: 4000, 18: 300, 2: 200 };
/** Density (kg/m³) by material. */
const DENSITY = { 0: 2400, 1: 2400, 20: 2700, 5: 2500, 8: 1500, 3: 650, 13: 650, 9: 250, 10: 2600, 11: 1900, 12: 600, 14: 2300, 16: 1700, 6: 7800, 17: 7800, 18: 2500, 2: 300 };

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function qrot(q, v) {
  const x = q.x, y = q.y, z = q.z, w = q.w, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/**
 * @param {{ frags: { pivot: number[], half: number[], vol: number, group: number, mat?: number, fixed?: boolean }[] }} debris
 * @param {{ origin: number[], ground?: (x: number, z: number) => number, grid?: { x0: number, z0: number, cell: number, n: number, h: Float32Array },
 *   force: number[], strength?: number, cause?: 'lava'|'surge', release?: (x: number, z: number, y: number) => number,
 *   releaseOf?: Record<number, number>, seed?: number }} opt
 *   ground: a height function, or grid: the ground as a height grid (the worker's); force: the cause's direction (x, z).
 */
export function createCollapse(debris, opt) {
  const R = rng(opt.seed ?? 1), [ox, oy, oz] = opt.origin, F = opt.force, str = opt.strength ?? 1, cause = opt.cause || 'lava';
  const P = debris.frags, n = P.length;
  const ext = Math.max(...P.map((f) => Math.hypot(f.pivot[0], f.pivot[2]) + Math.max(...f.half)), 10) + 25;
  // The ground: a height grid (given, or sampled from the function) — a mesh the pieces land on.
  const grid = opt.grid || (() => {
    const cell = ext > 60 ? 2 : 1, gn = Math.ceil(ext * 2 / cell) + 1, h = new Float32Array(gn * gn);
    for (let j = 0; j < gn; j++) for (let i = 0; i < gn; i++) h[j * gn + i] = opt.ground(ox - ext + i * cell, oz - ext + j * cell);
    return { x0: ox - ext, z0: oz - ext, cell, n: gn, h };
  })();
  const groundAt = (x, z) => {
    const u = Math.max(0, Math.min(grid.n - 1.001, (x - grid.x0) / grid.cell)), v = Math.max(0, Math.min(grid.n - 1.001, (z - grid.z0) / grid.cell));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, H = grid.h, N = grid.n;
    return (H[j * N + i] * (1 - fu) + H[j * N + i + 1] * fu) * (1 - fv) + (H[(j + 1) * N + i] * (1 - fu) + H[(j + 1) * N + i + 1] * fu) * fv;
  };

  const world = new RAPIER.World({ x: 0, y: -G, z: 0 });
  world.timestep = DT;
  // (Two solver iterations: rubble does not need a precise stack, and a town's worth of it must keep up.)
  world.integrationParameters.numSolverIterations = 2;
  const queue = new RAPIER.EventQueue(true);
  {
    // (A heightfield: solid under its surface, so nothing that starts a little in it is lost through it. Rows run along z.)
    const N = grid.n, hts = new Float32Array(N * N);
    for (let col = 0; col < N; col++) for (let row = 0; row < N; row++) hts[row + col * N] = grid.h[row * N + col];
    const span = (N - 1) * grid.cell;
    const gb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(grid.x0 + span / 2, 0, grid.z0 + span / 2));
    world.createCollider(RAPIER.ColliderDesc.heightfield(N - 1, N - 1, hts, { x: span, y: 1, z: span }).setFriction(0.8), gb);
  }

  // Pieces: world pose (kept in sync with their colliders), half extents, mass, material, when the cause reaches them.
  const xf = new Float32Array(n * 8);
  const pc = P.map((f, i) => {
    const mat = f.mat ?? 0, rho = DENSITY[mat] ?? 2000;
    xf[i * 8] = ox + f.pivot[0]; xf[i * 8 + 1] = oy + f.pivot[1]; xf[i * 8 + 2] = oz + f.pivot[2]; xf[i * 8 + 7] = 1;
    return { i, fixed: !!f.fixed, mat, rho, m: Math.max(4, f.vol * rho), half: f.half.map((v) => Math.max(0.03, v)), group: f.group,
      p: [ox + f.pivot[0], oy + f.pivot[1], oz + f.pivot[2]], q: f.rot ? { x: f.rot[0], y: f.rot[1], z: f.rot[2], w: f.rot[3] } : { x: 0, y: 0, z: 0, w: 1 }, q0: f.rot || [0, 0, 0, 1], cl: -1, col: null, attack: Infinity, shove: null };
  });
  // A piece that starts in the ground (a footing, a wall's buried course) is held by it.
  for (const p of pc) {
    if (p.fixed) continue;
    const q = p.q, ry = [2 * (q.x * q.y - q.z * q.w), 1 - 2 * (q.x * q.x + q.z * q.z), 2 * (q.y * q.z + q.x * q.w)];
    const vext = Math.abs(ry[0]) * p.half[0] + Math.abs(ry[1]) * p.half[1] + Math.abs(ry[2]) * p.half[2];
    if (p.p[1] - vext < groundAt(p.p[0], p.p[2]) - 0.05) p.fixed = true;
  }
  for (const p of pc) {
    if (p.fixed) continue;
    const t = opt.releaseOf && opt.releaseOf[p.group] !== undefined ? opt.releaseOf[p.group] : opt.release ? opt.release(p.p[0], p.p[2], p.p[1]) : null;
    p.attack = t !== null ? t + 0.6 * R() : 0.4 + 2.2 * (1 - ((p.p[0] - ox) * F[0] + (p.p[2] - oz) * F[1] + 40) / 80) + 0.5 * R();
  }

  let attacksLeft = pc.filter((p) => p.attack < Infinity).length;

  // ---- Mortar: bonds between touching pieces (their boxes, grown by a few centimetres, overlap) ----
  const bonds = [], byPiece = pc.map(() => []);
  {
    const cell = 1.5, hash = new Map();
    pc.forEach((p, i) => {
      const e = p.half;
      for (let a = Math.floor((p.p[0] - e[0]) / cell); a <= Math.floor((p.p[0] + e[0]) / cell); a++)
        for (let b = Math.floor((p.p[1] - e[1]) / cell); b <= Math.floor((p.p[1] + e[1]) / cell); b++)
          for (let c = Math.floor((p.p[2] - e[2]) / cell); c <= Math.floor((p.p[2] + e[2]) / cell); c++) { const k = `${a},${b},${c}`; let l = hash.get(k); if (!l) { l = []; hash.set(k, l); } l.push(i); }
    });
    const seen = new Set();
    for (const list of hash.values()) for (let u = 0; u < list.length; u++) for (let v = u + 1; v < list.length; v++) {
      const i = Math.min(list[u], list[v]), j = Math.max(list[u], list[v]), k = i * n + j;
      if (seen.has(k)) continue; seen.add(k);
      const A = pc[i], B = pc[j], g = 0.04;
      if (A.fixed && B.fixed) continue;
      const ov = [0, 1, 2].map((a) => Math.min(A.p[a] + A.half[a], B.p[a] + B.half[a]) - Math.max(A.p[a] - A.half[a], B.p[a] - B.half[a]));
      if (ov[0] < -g || ov[1] < -g || ov[2] < -g) continue;
      const s = [Math.max(0.02, ov[0]), Math.max(0.02, ov[1]), Math.max(0.02, ov[2])].sort((a, b) => b - a);
      const mid = [0, 1, 2].map((a) => (Math.max(A.p[a] - A.half[a], B.p[a] - B.half[a]) + Math.min(A.p[a] + A.half[a], B.p[a] + B.half[a])) / 2);
      const bd = { a: i, b: j, strength: Math.min(MORTAR[A.mat] ?? 1500, MORTAR[B.mat] ?? 1500) * (0.7 + 0.6 * R()) * Math.min(2.5, s[0] * s[1]), broken: false, at: mid };
      bonds.push(bd); byPiece[i].push(bd); byPiece[j].push(bd);
    }
  }

  // ---- Bodies: what is still bonded is one ----
  let clusters = [];          // { members, body, fixed, S0 (its footing's strength at first) }
  const pieceOf = new Map();  // collider handle → piece
  function syncPiece(p) { if (!p.col) return; const t = p.col.translation(), r = p.col.rotation(); p.p = [t.x, t.y, t.z]; p.q = { x: r.x, y: r.y, z: r.z, w: r.w }; }
  function makeBody(members, lin, ang) {
    const fixed = members.some((i) => pc[i].fixed);
    let m = 0; const c = [0, 0, 0];
    for (const i of members) { const p = pc[i]; m += p.m; for (let a = 0; a < 3; a++) c[a] += p.p[a] * p.m; }
    for (let a = 0; a < 3; a++) c[a] /= m;
    const desc = (fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic()).setTranslation(c[0], c[1], c[2]);
    if (!fixed && lin) desc.setLinvel(lin[0], lin[1], lin[2]).setAngvel({ x: ang[0], y: ang[1], z: ang[2] });
    // (Continuous collision only for the thin and light — a door leaf, a skin of plaster — which would pass through.)
    if (!fixed) desc.setLinearDamping(0.02).setAngularDamping(0.2).setCcdEnabled(members.length <= 3 && members.some((i) => Math.min(...pc[i].half) < 0.12));
    const body = world.createRigidBody(desc);
    for (const i of members) {
      const p = pc[i];
      // (Each box a little smaller than its piece: neighbours that touched, once apart, do not start inside each other.)
      const cd = RAPIER.ColliderDesc.cuboid(Math.max(0.035, p.half[0] * 0.96 - 0.012), Math.max(0.035, p.half[1] * 0.96 - 0.012), Math.max(0.035, p.half[2] * 0.96 - 0.012)).setTranslation(p.p[0] - c[0], p.p[1] - c[1], p.p[2] - c[2]).setRotation(p.q)
        .setDensity(p.rho).setFriction(0.75).setRestitution(0.04)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(Math.max(20000, p.m * G * 8));
      p.col = world.createCollider(cd, body);
      pieceOf.set(p.col.handle, i);
    }
    return { members, body, fixed, m, S0: -1 };
  }
  // Bodies whose bonds broke: split them (the rest untouched — a town's thousands of pieces are not re-read for one crack).
  const touched = new Set();
  function breakBond(b) { if (b.broken) return; b.broken = true; touched.add(pc[b.a].cl); touched.add(pc[b.b].cl); dirty = true; }
  function rebuild(first = false) {
    const targets = first ? null : [...touched].filter((k) => k >= 0 && clusters[k]).map((k) => clusters[k]);
    touched.clear();
    const pool = first ? pc.map((p) => p.i) : targets.flatMap((cl) => cl.members);
    if (!pool.length) return;
    if (!first) for (const i of pool) syncPiece(pc[i]);
    // Union-find over the intact bonds among those pieces.
    const par = new Map(pool.map((i) => [i, i])), find = (i) => { while (par.get(i) !== i) { const g2 = par.get(par.get(i)); par.set(i, g2); i = g2; } return i; };
    for (const i of pool) for (const b of byPiece[i]) { if (b.broken || !par.has(b.a) || !par.has(b.b)) continue; const x = find(b.a), y = find(b.b); if (x !== y) par.set(Math.max(x, y), Math.min(x, y)); }
    const groups = new Map();
    for (const i of pool) { const r = find(i); let l = groups.get(r); if (!l) { l = []; groups.set(r, l); } l.push(i); }
    if (!first && [...groups.values()].length === targets.length) return;   // (nothing actually came apart)
    // The old bodies' motion, then they go; the new parts take it at their own middles.
    const motion = new Map();
    if (!first) for (const cl of targets) {
      const bd = cl.body, v = bd.linvel(), w = bd.angvel(), t = bd.translation();
      motion.set(cl, { v: [v.x, v.y, v.z], w: [w.x, w.y, w.z], c: [t.x, t.y, t.z] });
      for (const i of cl.members) { pieceOf.delete(pc[i].col.handle); pc[i].col = null; }
      world.removeRigidBody(bd); cl.dead = true;
    }
    for (const members of groups.values()) {
      const from = first ? null : clusters[pc[members[0]].cl];
      let lin = null, ang = null;
      const mo = from ? motion.get(from) : null;
      if (mo) {
        let m = 0; const c = [0, 0, 0]; for (const i of members) { m += pc[i].m; for (let a = 0; a < 3; a++) c[a] += pc[i].p[a] * pc[i].m; }
        const r = [c[0] / m - mo.c[0], c[1] / m - mo.c[1], c[2] / m - mo.c[2]];
        lin = [mo.v[0] + mo.w[1] * r[2] - mo.w[2] * r[1], mo.v[1] + mo.w[2] * r[0] - mo.w[0] * r[2], mo.v[2] + mo.w[0] * r[1] - mo.w[1] * r[0]]; ang = mo.w;
      }
      const cl = makeBody(members, lin, ang), k = clusters.length;
      clusters.push(cl);
      for (const i of members) pc[i].cl = k;
    }
  }
  rebuild(true);

  const events = [];
  let dirty = false;
  function crack(i, j) {
    if (i === undefined) return;
    for (const b of byPiece[i]) if (!b.broken && j > b.strength) breakBond(b);
    if (j > 8000) for (const b of byPiece[i]) { const o = b.a === i ? b.b : b.a; for (const c of byPiece[o]) if (!c.broken && j * 0.35 > c.strength) breakBond(c); }
  }

  // ---- The cause ----
  function attack(t) {
    for (const p of pc) {
      if (p.fixed || !(t >= p.attack)) continue;
      p.attack = Infinity; attacksLeft--;
      const low = p.p[1] - p.half[1] - groundAt(p.p[0], p.p[2]);
      if (cause === 'lava') {
        // The melt reaches the foot: the low courses lose their mortar and are shoved along; what stands on them follows by itself.
        if (low < 1.4 + 0.7 * R()) {
          for (const b of byPiece[p.i]) breakBond(b);
          p.shove = [F[0] * (0.6 + 0.9 * R()) * str, 0.25, F[1] * (0.6 + 0.9 * R()) * str];
        }
      } else {
        // The blast: a push on every face that meets it, more on what stands high and exposed; what cannot hold tears.
        const area = 4 * (Math.abs(F[0]) * p.half[1] * p.half[2] + Math.abs(F[1]) * p.half[0] * p.half[1]);
        const J = area * 2600 * str * (0.6 + 0.8 * R()) * (0.5 + Math.min(1, Math.max(0, low) / 6));
        for (const b of byPiece[p.i]) if (J > b.strength * 1.2) breakBond(b);
        // (A hot cloud shoves; it does not fire light pieces like shot: a few metres a second at most.)
        const dv = Math.min(J / p.m, 6 + 3 * R());
        p.shove = [F[0] * dv, 0.05 * dv, F[1] * dv];
      }
    }
  }
  /** What still stands but hangs by too little gives way: most of its footing gone, or its weight past what is left. */
  function footing() {
    for (const cl of clusters) {
      if (cl.dead || !cl.fixed) continue;
      let S = 0, m = 0, cx = 0, cz = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      const foot = [];
      for (const i of cl.members) { const p = pc[i]; if (p.fixed) continue; m += p.m; cx += p.p[0] * p.m; cz += p.p[2] * p.m; for (const b of byPiece[i]) if (!b.broken && (pc[b.a].fixed || pc[b.b].fixed)) { S += b.strength; foot.push(b); x0 = Math.min(x0, b.at[0]); x1 = Math.max(x1, b.at[0]); z0 = Math.min(z0, b.at[2]); z1 = Math.max(z1, b.at[2]); } }
      if (!m) continue;
      if (cl.S0 < 0) { cl.S0 = S; continue; }
      cx /= m; cz /= m;
      const over = cx < x0 - 0.4 || cx > x1 + 0.4 || cz < z0 - 0.4 || cz > z1 + 0.4;
      if (S < cl.S0 * 0.3 || over) for (const b of foot) breakBond(b);
    }
  }

  let t = 0, done = false, acc = 0, steps = 0, cost = 0;
  function step() {
    t += world.timestep; steps++;
    attack(t);
    if (steps % 15 === 0) footing();
    if (dirty) { dirty = false; rebuild(); }
    for (const p of pc) if (p.shove) { const cl = clusters[p.cl]; if (!cl.fixed) cl.body.applyImpulse({ x: p.shove[0] * p.m, y: p.shove[1] * p.m, z: p.shove[2] * p.m }, true); p.shove = null; }
    world.step(queue);
    // (Pieces that began touching are pushed apart by the solver when their bond goes; a shell's curve can make that a
    // throw. Nothing in a collapse goes faster than a fall from its own height would make it, nor spins like a top.)
    for (const cl of clusters) {
      if (cl.dead || cl.fixed || cl.body.isSleeping()) continue;
      const v = cl.body.linvel(), w = cl.body.angvel(), sv = Math.hypot(v.x, v.y, v.z), sw = Math.hypot(w.x, w.y, w.z);
      const vmax = 16, up = v.y > 6 ? 6 / v.y : 1;
      if (sv > vmax || up < 1) { const k = Math.min(vmax / sv, 1); cl.body.setLinvel({ x: v.x * k, y: Math.min(v.y * k, 6), z: v.z * k }, true); }
      if (sw > 6) { const k = 6 / sw; cl.body.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true); }
    }
    // Blows: a contact harder than a piece's mortar (less the weight it simply rests with) cracks it.
    queue.drainContactForceEvents((e) => {
      const a = pieceOf.get(e.collider1()), b = pieceOf.get(e.collider2()), f = e.totalForceMagnitude() * DT;
      for (const i of [a, b]) { if (i === undefined) continue; const cl = clusters[pc[i].cl]; const j = f - (cl.fixed ? 0 : cl.m * G * DT * 1.5); if (j > 0) crack(i, j); }
      if (f > 4000 && events.length < 3000) { const i = a ?? b; if (i !== undefined) { syncPiece(pc[i]); events.push({ kind: f > 40000 ? 'break' : 'impact', x: pc[i].p[0], y: pc[i].p[1], z: pc[i].p[2], size: Math.min(4, Math.cbrt(f / 4000)) }); } }
    });
    // (A body found under the ground — a stick or a skin thrown down hard enough to pass through — is set back on it.)
    if (steps % 10 === 0) for (const cl of clusters) {
      if (cl.dead || cl.fixed || cl.body.isSleeping()) continue;
      const tr = cl.body.translation(), gy = groundAt(tr.x, tr.z);
      if (tr.y < gy - 0.6) { cl.body.setTranslation({ x: tr.x, y: gy + 0.4, z: tr.z }, true); cl.body.setLinvel({ x: 0, y: 0, z: 0 }, true); cl.body.setAngvel({ x: 0, y: 0, z: 0 }, true); }
    }
    const pending = attacksLeft > 0;
    done = !pending && t > 2 && clusters.every((cl) => cl.dead || cl.fixed || cl.body.isSleeping() || t > 50);
  }
  function write() {
    for (const cl of clusters) {
      if (cl.dead || cl.fixed || (cl.body.isSleeping() && cl.written)) continue;
      cl.written = cl.body.isSleeping();
      for (const i of cl.members) writePiece(pc[i]);
    }
  }
  function writeAll() { for (const p of pc) writePiece(p); }
  function writePiece(p) {
    {
      syncPiece(p);
      // (The render's rotation is from the piece as built: its box's turn now, less the turn it was built with.)
      const a = p.q, b = p.q0, bx = -b[0], by = -b[1], bz = -b[2], bw = b[3];
      const o = p.i * 8; xf[o] = p.p[0]; xf[o + 1] = p.p[1]; xf[o + 2] = p.p[2];
      xf[o + 4] = a.w * bx + a.x * bw + a.y * bz - a.z * by; xf[o + 5] = a.w * by - a.x * bz + a.y * bw + a.z * bx; xf[o + 6] = a.w * bz + a.x * by - a.y * bx + a.z * bw; xf[o + 7] = a.w * bw - a.x * bx - a.y * by - a.z * bz;
    }
  }
  /** The heap: per 0.5 m cell, how far above the ground the rubble stands (its pieces' tops), over the site's square. */
  function heap() {
    const CELL = 0.5, NR = Math.ceil(ext * 2 / CELL), top = new Float32Array(NR * NR).fill(-1e9), h = new Float32Array(NR * NR);
    for (const p of pc) {
      if (p.fixed) continue;
      syncPiece(p);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, ty = -Infinity;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const r = qrot(p.q, [sx * p.half[0], sy * p.half[1], sz * p.half[2]]); x0 = Math.min(x0, p.p[0] + r[0]); x1 = Math.max(x1, p.p[0] + r[0]); z0 = Math.min(z0, p.p[2] + r[2]); z1 = Math.max(z1, p.p[2] + r[2]); ty = Math.max(ty, p.p[1] + r[1]); }
      // (Only what has fallen: a piece still near where it stood is not rubble.)
      if (Math.hypot(p.p[0] - ox - P[p.i].pivot[0], p.p[1] - oy - P[p.i].pivot[1], p.p[2] - oz - P[p.i].pivot[2]) < 0.3) continue;
      for (let z = z0; z < z1; z += CELL) for (let x = x0; x < x1; x += CELL) {
        const i = Math.floor((x - ox + ext) / CELL), j = Math.floor((z - oz + ext) / CELL);
        if (i >= 0 && j >= 0 && i < NR && j < NR) top[j * NR + i] = Math.max(top[j * NR + i], ty - 0.25 * (ty - p.p[1]));
      }
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NR; i++) { const k = j * NR + i; if (top[k] > -1e8) h[k] = Math.max(0, top[k] - groundAt(ox - ext + (i + 0.5) * CELL, oz - ext + (j + 0.5) * CELL)); }
    return { h, n: NR, cell: CELL, x0: ox - ext, z0: oz - ext };
  }
  return {
    xf, events, heap, bonds, get clusters() { return clusters; },
    get t() { return t; }, get done() { return done; },
    /** Advance by dt (s, fixed 60 Hz steps inside; at most 3 a call). */
    // (When a whole town is moving at once and a step costs more than a frame, it steps at half the rate: the rubble's
    // fall is then coarser in time, but keeps up with the world.)
    advance(dt) {
      acc += dt; let k = 0;
      while (acc >= world.timestep && k < 3 && !done) { const t0 = performance.now(); step(); acc -= world.timestep; k++; cost = cost * 0.8 + 0.2 * (performance.now() - t0); }
      world.timestep = cost > 14 ? DT * 2 : DT;
      if (k === 3) acc = 0; write();
    },
    /** Run to rest at once (a collapse that happened out of sight, or replayed on loading). */
    finish(maxSteps = 60 * 55) { for (let k = 0; k < maxSteps && !done; k++) step(); writeAll(); events.length = 0; },
    dispose() { world.free(); queue.free(); },
  };
}
