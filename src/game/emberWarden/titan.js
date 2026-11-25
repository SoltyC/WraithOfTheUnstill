// The Ember Warden's body (docs/phase-11/ember-warden.md): a titan of basalt crust and glowing seams, half sunk in the
// crater's lava lake, its hands on the vent. A rig of bones — a spine rising out of the lava to the chest, a neck and a
// head, two arms of shoulder, upper arm, forearm and hand — posed each frame by the fight (game/emberWarden/fight.js):
// the spine's lean and twist, and each hand's target, which two-bone IK reaches with the elbow out and up. Its chunks
// (the Shaped's records, game/shaped/rig.js: (pos, sx), (fwd, sy), (up, sz), (seed, kind, glow, alpha)) are its sculpted
// segments (tools/models/ember_warden.py: torso, head, and per arm the upper arm, forearm and hand), one per bone, each
// hung rigidly on it; and the obsidian shackles. Heat rides in glow (0 dark … 1 white-hot), obsidian (bound by Frost) as
// glow 2; a struck segment flashes in kind's fraction (shaders/emberWardenPiece.wgsl.js).
// Allocation-free per frame.

import { CHUNK_FLOATS } from '../shaped/rig.js';

/** Chunk kinds (shaders/emberWarden.wgsl.js): basalt crust, a molten seam, the heart, an obsidian shackle on the rock. */
export const EW_KIND = { CRUST: 18, SEAM: 19, HEART: 20, SHACKLE: 21, TORSO: 22, HEAD: 23, UPPER: 24, FORE: 25, HANDL: 26, HANDR: 27 };
export const EW_CHUNKS = 40;
/** The sculpted segments: size (m, the unit model's uniform scale: tools/models/ember_warden.py SEGMENTS) and where
 *  along its bone the model's z begins (the bone's start sits at model z0). */
export const EW_SEG = { TORSO: { S: 52, z0: -1 }, HEAD: { S: 22, z0: -0.55 }, UPPER: { S: 46, z0: -0.82 }, FORE: { S: 42, z0: -0.9 }, HAND: { S: 28, z0: -0.9 } };
export const EW_NBR = 16;

/** Its scale: the crater is 300 m across at the eruption's level; it must fill it, and its arms reach the bench. */
export const TITAN_SCALE = 1.7;
/** The titan's proportions (m). */
export const TITAN = (() => {
  const k = TITAN_SCALE, T = {
    sink: 5,                     // the pelvis below the lava's surface
    spine: [9, 8, 7],            // pelvis → waist → ribs → chest
    neck: 4.5, head: 5.2,
    shoulder: 11,                // half the shoulder width
    upper: 24, fore: 22, hand: 8,
    r: { waist: 8.5, ribs: 9.5, chest: 10, neck: 4, head: 5.2, upper0: 5, upper1: 4, fore0: 4, fore1: 3.4, hand: 4 },
  };
  for (const key of ['sink', 'neck', 'head', 'shoulder', 'upper', 'fore', 'hand']) T[key] *= k;
  T.spine = T.spine.map((v) => v * k);
  for (const key in T.r) T.r[key] *= k;
  return T;
})();

const PART = { SPINE: 0, NECK: 1, HEAD: 2, UPPER: 3, FORE: 4, HAND: 5, HEART: 6, SHACKLE: 7 };
export const EW_PART = PART;

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const v3 = () => new Float64Array(3);
const set = (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; };
const sub = (o, a, b) => set(o, a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (o) => { const l = len(o) || 1; o[0] /= l; o[1] /= l; o[2] /= l; return o; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (o, a, b) => set(o, a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);

/** Two-bone IK: from s, reach t with bones a and b, the elbow toward `pole`; writes elbow e and wrist w. Pure. */
export function solveArm(s, t, a, b, pole, e, w) {
  const dx = t[0] - s[0], dy = t[1] - s[1], dz = t[2] - s[2];
  const d0 = Math.hypot(dx, dy, dz) || 1e-6;
  const d = Math.min(Math.max(d0, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const ux = dx / d0, uy = dy / d0, uz = dz / d0;
  const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
  // The pole, made perpendicular to the reach.
  const pd = pole[0] * ux + pole[1] * uy + pole[2] * uz;
  let nx = pole[0] - ux * pd, ny = pole[1] - uy * pd, nz = pole[2] - uz * pd;
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  e[0] = s[0] + ux * x + nx * h; e[1] = s[1] + uy * x + ny * h; e[2] = s[2] + uz * x + nz * h;
  w[0] = s[0] + ux * d; w[1] = s[1] + uy * d; w[2] = s[2] + uz * d;
  return d0 > a + b ? d0 - (a + b) : 0;   // how far out of reach it was
}

/**
 * @param {{ x: number, z: number, yaw: number }} at  where it stands in the lake, facing yaw (atan2(dx, dz))
 */
export function createTitan(at) {
  const chunks = new Float32Array(EW_CHUNKS * CHUNK_FLOATS);
  const nbr = new Uint32Array(EW_CHUNKS * EW_NBR);
  // Per chunk, fixed: part, side (−1 left, 1 right, 0 none), t along its bone, angle round it, radial fraction, sizes.
  const part = new Uint8Array(EW_CHUNKS), side = new Int8Array(EW_CHUNKS), tt = new Float32Array(EW_CHUNKS), ang = new Float32Array(EW_CHUNKS);
  const rad = new Float32Array(EW_CHUNKS), sx = new Float32Array(EW_CHUNKS), sy = new Float32Array(EW_CHUNKS), sz = new Float32Array(EW_CHUNKS);
  const kind = new Uint8Array(EW_CHUNKS), seed = new Float32Array(EW_CHUNKS), seg = new Uint8Array(EW_CHUNKS);
  const r = mulberry(0xe3be1);
  let n = 0;
  const add = (p, sd, sg, t, a, rf, w, h, l, k) => {
    if (n >= EW_CHUNKS) return;
    part[n] = p; side[n] = sd; seg[n] = sg; tt[n] = t; ang[n] = a; rad[n] = rf; sx[n] = w; sy[n] = h; sz[n] = l; kind[n] = k; seed[n] = r() * 100; n++;
  };
  // The segments, one chunk each.
  add(PART.SPINE, 0, 0, 0, 0, 0, 0, 0, 0, EW_KIND.TORSO);
  add(PART.HEAD, 0, 0, 0, 0, 0, 0, 0, 0, EW_KIND.HEAD);
  for (const sd of [-1, 1]) {
    add(PART.UPPER, sd, 0, 0, 0, 0, 0, 0, 0, EW_KIND.UPPER);
    add(PART.FORE, sd, 0, 0, 0, 0, 0, 0, 0, EW_KIND.FORE);
    add(PART.HAND, sd, 0, 0, 0, 0, 0, 0, 0, sd < 0 ? EW_KIND.HANDL : EW_KIND.HANDR);
    // The shackle that binds it to the rock (hidden until Frost makes it): obsidian round the wrist.
    for (let k = 0; k < 14; k++) add(PART.SHACKLE, sd, 0, k / 14, (k / 14) * Math.PI * 2, 1, (4.2 + 1.5 * r()) * TITAN_SCALE, (2.6 + 1.2 * r()) * TITAN_SCALE, 0.32 * TITAN_SCALE, EW_KIND.SHACKLE);
  }
  const count = n;
  // Loose pieces (the release): position, the model's z and y axes, velocity, spin; landed (0 falling, 1 sinking, 2 still).
  const fp = new Float64Array(EW_CHUNKS * 3), fz = new Float64Array(EW_CHUNKS * 3), fy = new Float64Array(EW_CHUNKS * 3);
  const fv = new Float64Array(EW_CHUNKS * 3), fw = new Float64Array(EW_CHUNKS * 3), fland = new Uint8Array(EW_CHUNKS);

  // Bones (world): pelvis, waist, ribs, chest, neck top, head top; per arm (0 left, 1 right): shoulder, elbow, wrist, hand end.
  const P = Array.from({ length: 6 }, v3);
  const S = [v3(), v3()], E = [v3(), v3()], Wr = [v3(), v3()], Hd = [v3(), v3()];
  const fwd = v3(), rgt = v3(), upv = v3(), tmp = v3(), tmp2 = v3(), bd = v3(), ref = v3(), r1 = v3(), r2 = v3(), pole = v3();

  const T = {
    chunks, nbr, count, part, side,
    /** Per chunk: its kind and seed (render/shapedPieces.js picks each segment's sculpt by them). */
    kinds: kind, seeds: seed,
    /** Where it stands; the lake's surface (m). */
    x: at.x, z: at.z, yaw: at.yaw, lake: 736,
    /** The pose: the spine's lean forward (rad) and twist (rad); a heave (m) and a shudder (0..1). */
    lean: 0.18, twist: 0, heave: 0, shudder: 0, headDown: 0.2,
    /** Each hand's target (world x, y, z) and its elbow's pole (world direction), [left, right]. */
    hand: [[0, 0, 0], [0, 0, 0]], poleOut: [1.2, 1.2],
    /** Heat (0 dark … 1 white) per arm and of the body; bound (0..1, the obsidian) per arm; the heart's light. */
    heat: [0.3, 0.3], bodyHeat: 0.35, bound: [0, 0], heart: 0.4,
    /** The shackles' place on the rock (world x, y, z), per arm. */
    shackle: [[0, 0, 0], [0, 0, 0]],
    /** A plate struck (0..1, fades): kind's fraction. */
    hurt: [0, 0],
    /** Shown at all. */
    shown: true,
    /** Its coming apart (the release): per chunk, loose (1: falling free of its bone), and a loose segment's heat. */
    loose: new Uint8Array(EW_CHUNKS), looseHeat: new Float32Array(EW_CHUNKS).fill(1),
    /** Where loose pieces come to rest: they fall to the vent and lie in the lake there (x, z, the lake's surface y). */
    restAt: [at.x, at.z],
    /** Set a segment loose: from its pose now, thrown by (vx, vy, vz), spinning at w (rad/s) about a random axis. */
    loosen(c, vx, vy, vz, w) {
      if (this.loose[c] || c >= count) return;
      const o = c * CHUNK_FLOATS;
      this.loose[c] = 1; this.anyLoose = true;
      fp[c * 3] = chunks[o]; fp[c * 3 + 1] = chunks[o + 1]; fp[c * 3 + 2] = chunks[o + 2];
      fz[c * 3] = chunks[o + 4]; fz[c * 3 + 1] = chunks[o + 5]; fz[c * 3 + 2] = chunks[o + 6];
      fy[c * 3] = chunks[o + 8]; fy[c * 3 + 1] = chunks[o + 9]; fy[c * 3 + 2] = chunks[o + 10];
      fv[c * 3] = vx; fv[c * 3 + 1] = vy; fv[c * 3 + 2] = vz;
      const a = r() * Math.PI * 2, b = r() * 2 - 1, q = Math.sqrt(1 - b * b);
      fw[c * 3] = Math.cos(a) * q * w; fw[c * 3 + 1] = b * w; fw[c * 3 + 2] = Math.sin(a) * q * w;
      fland[c] = 0;
    },
    /** All loose (a load after the release): each laid where it lies, settled. */
    settleAll() {
      this.anyLoose = true;
      for (let c = 0; c < count; c++) {
        if (part[c] === PART.SHACKLE) continue;
        this.loose[c] = 1; fland[c] = 2;
        const a = c * 2.4, rr = 6 + (c % 4) * 7;
        fp[c * 3] = this.restAt[0] + Math.cos(a) * rr; fp[c * 3 + 1] = this.lake - 6 - (c % 3) * 3; fp[c * 3 + 2] = this.restAt[1] + Math.sin(a) * rr;
        const t = c * 1.7; fz[c * 3] = Math.cos(t); fz[c * 3 + 1] = 0.3; fz[c * 3 + 2] = Math.sin(t);
        const l = Math.hypot(fz[c * 3], 0.3, fz[c * 3 + 2]); fz[c * 3] /= l; fz[c * 3 + 1] /= l; fz[c * 3 + 2] /= l;
        fy[c * 3] = -fz[c * 3 + 2]; fy[c * 3 + 1] = 0; fy[c * 3 + 2] = fz[c * 3];
        const m = Math.hypot(fy[c * 3], fy[c * 3 + 2]) || 1; fy[c * 3] /= m; fy[c * 3 + 2] /= m;
        this.looseHeat[c] = 0;
      }
    },
    /** A loose piece's landing this frame (−1: none): systems/emberWarden.js splashes it. */
    landed: -1, anyLoose: false,
    time: 0,
    nbrReady: false, nbrDirty: false,
    bones: { P, S, E, W: Wr, H: Hd },
    fwd, rgt,
    /** The hands resting on the vent, in front of the chest at the lava (the hold). */
    holdHands() {
      for (let i = 0; i < 2; i++) {
        const sd = i ? 1 : -1, h = this.hand[i];
        // (Braced: the arms long and down, the hands pressing the lava a long way out in front, a little apart.)
        const fw = 32 * TITAN_SCALE, sw = 13 * TITAN_SCALE;
        h[0] = this.x + Math.sin(this.yaw) * fw + Math.cos(this.yaw) * sd * sw;
        h[1] = this.lake + 0.8;
        h[2] = this.z + Math.cos(this.yaw) * fw - Math.sin(this.yaw) * sd * sw;
      }
    },
    update(dt) {
      this.time += dt;
      pose(this);
      write(this);
      if (this.anyLoose) loosePieces(this, dt);
      if (!this.nbrReady) { neighbours(); this.nbrReady = true; this.nbrDirty = true; }
    },
    /** The nearest point on a forearm or hand to (x, y, z), and its distance: Frost and blows test against it. */
    armDist(i, x, y, z) {
      let best = Infinity;
      const segd = (a, b) => {
        const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2], l2 = abx * abx + aby * aby + abz * abz || 1;
        const u = Math.max(0, Math.min(1, ((x - a[0]) * abx + (y - a[1]) * aby + (z - a[2]) * abz) / l2));
        return Math.hypot(a[0] + abx * u - x, a[1] + aby * u - y, a[2] + abz * u - z);
      };
      best = Math.min(segd(E[i], Wr[i]) - TITAN.r.fore1, segd(Wr[i], Hd[i]) - TITAN.r.hand);
      return best;
    },
  };
  T.holdHands();

  /** The spine and the arms from the pose. */
  function pose(t) {
    const cy = Math.cos(t.yaw), sy0 = Math.sin(t.yaw);
    // Facing and right (world), the body twisted by `twist`.
    const yw = t.yaw + t.twist;
    set(fwd, Math.sin(yw), 0, Math.cos(yw)); set(rgt, Math.cos(yw), 0, -Math.sin(yw));
    // Up, leaning forward by `lean`; a shudder trembles it.
    // (A titan's strain is slow and heavy: a small tremor over seconds, not a shiver — fast, it read as spasms.)
    const sh = t.shudder * 0.006 * Math.sin(t.time * 2.1), sh2 = t.shudder * 0.004 * Math.sin(t.time * 1.6 + 1);
    const ln = t.lean + sh;
    set(upv, fwd[0] * Math.sin(ln) + rgt[0] * sh2, Math.cos(ln), fwd[2] * Math.sin(ln) + rgt[2] * sh2); norm(upv);
    set(P[0], t.x, t.lake - TITAN.sink + t.heave, t.z);
    let acc = 0;
    for (let k = 0; k < 3; k++) {
      // (The spine curves: each segment leans a little more.)
      const bend = (k + 1) * 0.06 * t.lean;
      acc += TITAN.spine[k];
      set(P[k + 1], P[k][0] + (upv[0] + fwd[0] * bend) * TITAN.spine[k], P[k][1] + upv[1] * TITAN.spine[k], P[k][2] + (upv[2] + fwd[2] * bend) * TITAN.spine[k]);
    }
    // The neck and head: forward and down by headDown.
    const hd = t.headDown;
    set(tmp, upv[0] * Math.cos(hd) + fwd[0] * Math.sin(hd), upv[1] * Math.cos(hd) - Math.sin(hd) * 0.2, upv[2] * Math.cos(hd) + fwd[2] * Math.sin(hd)); norm(tmp);
    set(P[4], P[3][0] + tmp[0] * TITAN.neck + fwd[0] * 2 * TITAN_SCALE, P[3][1] + tmp[1] * TITAN.neck, P[3][2] + tmp[2] * TITAN.neck + fwd[2] * 2 * TITAN_SCALE);
    set(P[5], P[4][0] + tmp[0] * TITAN.head + fwd[0] * 2.5 * TITAN_SCALE, P[4][1] + tmp[1] * TITAN.head, P[4][2] + tmp[2] * TITAN.head + fwd[2] * 2.5 * TITAN_SCALE);
    // Arms.
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1;
      set(S[i], P[3][0] + rgt[0] * sd * TITAN.shoulder - upv[0] * 2 * TITAN_SCALE, P[3][1] - 2 * TITAN_SCALE, P[3][2] + rgt[2] * sd * TITAN.shoulder - upv[2] * 2 * TITAN_SCALE);
      // The elbow out to its side and up (a titan's elbows, not a T-rex's).
      set(pole, rgt[0] * sd * t.poleOut[i] - fwd[0] * 0.9, 0.55, rgt[2] * sd * t.poleOut[i] - fwd[2] * 0.9);
      set(tmp, t.hand[i][0], t.hand[i][1], t.hand[i][2]);
      // (The wrist aims a hand's length short of the target, so the fingers land on it.)
      sub(tmp2, tmp, S[i]); norm(tmp2);
      set(tmp, tmp[0] - tmp2[0] * TITAN.hand * 0.6, tmp[1] - tmp2[1] * TITAN.hand * 0.6 + TITAN.hand * 0.3, tmp[2] - tmp2[2] * TITAN.hand * 0.6);
      solveArm(S[i], tmp, TITAN.upper, TITAN.fore, pole, E[i], Wr[i]);
      // The hand: on along the forearm, bending down to the target.
      sub(tmp2, Wr[i], E[i]); norm(tmp2);
      set(tmp, t.hand[i][0] - Wr[i][0], t.hand[i][1] - Wr[i][1], t.hand[i][2] - Wr[i][2]); norm(tmp);
      set(tmp, tmp2[0] * 0.4 + tmp[0] * 0.6, tmp2[1] * 0.4 + tmp[1] * 0.6, tmp2[2] * 0.4 + tmp[2] * 0.6); norm(tmp);
      set(Hd[i], Wr[i][0] + tmp[0] * TITAN.hand, Wr[i][1] + tmp[1] * TITAN.hand, Wr[i][2] + tmp[2] * TITAN.hand);
    }
    void cy; void sy0;
  }

  /** A bone's frame: direction bd (a → b) and two perpendiculars r1, r2 (r1 toward `hint`). */
  function frame(a, b, hint) {
    sub(bd, b, a); norm(bd);
    set(ref, hint[0], hint[1], hint[2]);
    if (Math.abs(dot(ref, bd)) > 0.95) set(ref, 0, 1, 0);
    cross(r2, bd, ref); norm(r2); cross(r1, r2, bd); norm(r1);
  }

  function write(t) {
    const C = chunks;
    for (let c = 0; c < count; c++) {
      const o = c * CHUNK_FLOATS, p = part[c], sd = side[c], ai = sd > 0 ? 1 : 0;
      let a, b, rr, hint = fwd;
      if (p === PART.SPINE) { a = P[seg[c]]; b = P[seg[c] + 1]; rr = seg[c] === 0 ? TITAN.r.waist : seg[c] === 1 ? TITAN.r.ribs : TITAN.r.chest; }
      else if (p === PART.NECK) { a = P[3]; b = P[4]; rr = TITAN.r.neck; }
      else if (p === PART.HEAD) { a = P[4]; b = P[5]; rr = TITAN.r.head; }
      else if (p === PART.UPPER) { a = S[ai]; b = E[ai]; rr = TITAN.r.upper0; hint = upv; }
      else if (p === PART.FORE) { a = E[ai]; b = Wr[ai]; rr = TITAN.r.fore0; hint = upv; }
      else if (p === PART.HAND) { a = Wr[ai]; b = Hd[ai]; rr = TITAN.r.hand; hint = upv; }
      else if (p === PART.HEART) { a = P[2]; b = P[3]; rr = TITAN.r.chest * 0.3; }
      else { a = null; b = null; rr = 0; }
      let x, y, z;
      if (p === PART.SHACKLE) {
        // A ring of obsidian round the wrist where it lies on the rock, grown as it binds.
        const q = t.shackle[ai], bnd = t.bound[ai];
        frame(Wr[ai], Hd[ai], upv);
        const th = ang[c];
        x = Wr[ai][0] + (r1[0] * Math.cos(th) + r2[0] * Math.sin(th)) * (TITAN.r.fore1 + 0.8) + bd[0] * TITAN.hand * 0.2;
        y = Wr[ai][1] + (r1[1] * Math.cos(th) + r2[1] * Math.sin(th)) * (TITAN.r.fore1 + 0.8);
        z = Wr[ai][2] + (r1[2] * Math.cos(th) + r2[2] * Math.sin(th)) * (TITAN.r.fore1 + 0.8) + bd[2] * TITAN.hand * 0.2;
        void q;
        C[o] = x; C[o + 1] = y; C[o + 2] = z;
        const g = Math.min(1, bnd * 1.5);
        C[o + 3] = sx[c] * g; C[o + 4] = bd[0]; C[o + 5] = bd[1]; C[o + 6] = bd[2]; C[o + 7] = sy[c] * g;
        set(tmp, x - Wr[ai][0], y - Wr[ai][1], z - Wr[ai][2]); norm(tmp);
        C[o + 8] = tmp[0]; C[o + 9] = tmp[1]; C[o + 10] = tmp[2]; C[o + 11] = sz[c] * 8 * g;
        C[o + 12] = seed[c]; C[o + 13] = EW_KIND.SHACKLE; C[o + 14] = 2; C[o + 15] = bnd > 0.02 && t.shown ? 1 : 0;
        continue;
      }
      // A segment: hung on its bone (its start at the model's z0), the bone along the model's z, `hint` its front (y).
      const sg = p === PART.SPINE ? EW_SEG.TORSO : p === PART.HEAD ? EW_SEG.HEAD : p === PART.UPPER ? EW_SEG.UPPER : p === PART.FORE ? EW_SEG.FORE : EW_SEG.HAND;
      const A = p === PART.SPINE ? P[0] : p === PART.HEAD ? P[3] : a, Bn = p === PART.SPINE ? P[3] : p === PART.HEAD ? P[5] : b;
      frame(A, Bn, hint);
      const h = sg.S * 0.5;
      x = A[0] - bd[0] * sg.z0 * h; y = A[1] - bd[1] * sg.z0 * h; z = A[2] - bd[2] * sg.z0 * h;
      C[o] = x; C[o + 1] = y; C[o + 2] = z;
      C[o + 3] = sg.S; C[o + 4] = bd[0]; C[o + 5] = bd[1]; C[o + 6] = bd[2]; C[o + 7] = sg.S;
      C[o + 8] = r1[0]; C[o + 9] = r1[1]; C[o + 10] = r1[2]; C[o + 11] = sg.S;
      void rr;
      C[o + 12] = seed[c];
      // Heat: the arms' own; the body's; the heart's light; obsidian (2) where bound.
      const armPart = p === PART.UPPER || p === PART.FORE || p === PART.HAND;
      let heat = armPart ? t.heat[ai] * (p === PART.UPPER ? 0.6 : 1) + t.bodyHeat * 0.25 : t.bodyHeat;
      if (p === PART.HEART) heat = t.heart;
      // (The torso: its heart's light in the cracks of its chest — the split down it is in the sculpt's crack mask.)
      if (p === PART.SPINE) heat = Math.max(heat, (t.heart - 0.75) * 2.2);   // (only held — heart 0.9..1 — does it show: before, the crust stays dark)
      const bound = armPart && (p === PART.HAND || p === PART.FORE) && t.bound[ai] > 0.5;
      C[o + 13] = kind[c] + (armPart ? Math.min(0.45, t.hurt[ai] * 0.45) : 0);
      C[o + 14] = bound ? 2 : Math.min(1, heat);
      // (Under the lava: hidden — what is below its surface does not show.)
      C[o + 15] = t.shown ? 1 : 0;
    }
    for (let c = count; c < EW_CHUNKS; c++) chunks[c * CHUNK_FLOATS + 15] = 0;
  }

  /** Rotate axis v (at k*3) by the spin w over dt (Rodrigues). */
  function spin(v, k, wx, wy, wz, dt) {
    const wl = Math.hypot(wx, wy, wz); if (wl < 1e-6) return;
    const ax = wx / wl, ay = wy / wl, az = wz / wl, th = wl * dt, c = Math.cos(th), s = Math.sin(th);
    const x = v[k], y = v[k + 1], z = v[k + 2], d = ax * x + ay * y + az * z;
    const cx = ay * z - az * y, cy = az * x - ax * z, cz = ax * y - ay * x;
    v[k] = x * c + cx * s + ax * d * (1 - c); v[k + 1] = y * c + cy * s + ay * d * (1 - c); v[k + 2] = z * c + cz * s + az * d * (1 - c);
  }
  /** The loose pieces: falling, tumbling, into the lake at the vent; they sink to their shoulders in it and lie still. */
  function loosePieces(t, dt) {
    t.landed = -1;
    const C = chunks;
    for (let c = 0; c < count; c++) {
      if (!t.loose[c]) continue;
      const k = c * 3, o = c * CHUNK_FLOATS, sg = part[c] === PART.SPINE ? EW_SEG.TORSO : part[c] === PART.HEAD ? EW_SEG.HEAD : part[c] === PART.UPPER ? EW_SEG.UPPER : part[c] === PART.FORE ? EW_SEG.FORE : EW_SEG.HAND;
      // (How deep it lies: big pieces stand out of the plug like a ridge; small ones nearly under.)
      const rest = t.lake - sg.S * 0.12;
      if (fland[c] === 0) {
        fv[k + 1] -= 9.8 * 1.6 * dt;   // (a titan's fall reads slow at its size: gravity a little heavier keeps it from floating)
        fp[k] += fv[k] * dt; fp[k + 1] += fv[k + 1] * dt; fp[k + 2] += fv[k + 2] * dt;
        spin(fz, k, fw[k], fw[k + 1], fw[k + 2], dt); spin(fy, k, fw[k], fw[k + 1], fw[k + 2], dt);
        if (fp[k + 1] < rest + 2 && fv[k + 1] < 0) { fland[c] = 1; t.landed = c; fv[k] *= 0.15; fv[k + 2] *= 0.15; fv[k + 1] = -3; for (let q = 0; q < 3; q++) fw[k + q] *= 0.15; }
      } else if (fland[c] === 1) {
        // Into the lava: slowing, sinking to where it lies, the tumble damped out.
        const e = Math.exp(-dt * 1.2);
        fv[k] *= e; fv[k + 2] *= e; for (let q = 0; q < 3; q++) fw[k + q] *= e;
        fp[k] += fv[k] * dt; fp[k + 2] += fv[k + 2] * dt;
        fp[k + 1] += (rest - fp[k + 1]) * (1 - Math.exp(-dt * 0.8));
        spin(fz, k, fw[k], fw[k + 1], fw[k + 2], dt); spin(fy, k, fw[k], fw[k + 1], fw[k + 2], dt);
        if (Math.abs(fp[k + 1] - rest) < 0.2 && Math.hypot(fw[k], fw[k + 1], fw[k + 2]) < 0.01) fland[c] = 2;
      } else fp[k + 1] += (rest - fp[k + 1]) * Math.min(1, dt);   // (it rides the lake's level)
      // (Kept a true frame: y made perpendicular to z again — drift over a minute of spin would shear the piece.)
      const zl = Math.hypot(fz[k], fz[k + 1], fz[k + 2]) || 1; fz[k] /= zl; fz[k + 1] /= zl; fz[k + 2] /= zl;
      const dd = fy[k] * fz[k] + fy[k + 1] * fz[k + 1] + fy[k + 2] * fz[k + 2];
      fy[k] -= fz[k] * dd; fy[k + 1] -= fz[k + 1] * dd; fy[k + 2] -= fz[k + 2] * dd;
      const yl = Math.hypot(fy[k], fy[k + 1], fy[k + 2]) || 1; fy[k] /= yl; fy[k + 1] /= yl; fy[k + 2] /= yl;
      C[o] = fp[k]; C[o + 1] = fp[k + 1]; C[o + 2] = fp[k + 2];
      C[o + 4] = fz[k]; C[o + 5] = fz[k + 1]; C[o + 6] = fz[k + 2];
      C[o + 8] = fy[k]; C[o + 9] = fy[k + 1]; C[o + 10] = fy[k + 2];
      C[o + 13] = kind[c]; C[o + 14] = Math.min(1, t.looseHeat[c]);
    }
  }

  function neighbours() { /* (the piece path does not blend neighbours) */ }
  return T;
}
