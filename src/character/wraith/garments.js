// The Wraith's garments as cloth grids (BRIEF §8.1): a long pleated robe gathered at the waist by
// a cord (with hanging sash ends), an over-mantle (a capelet gathered at the neck, pleated, with a
// ragged hem), bell sleeves, a deep cowl whose drape lies over the shoulders, and wrapped hands
// and feet. Each is a rows × cols grid of particles in one Cloth, with rest positions in a local
// frame (body, head, arm, hand or foot) so pinned/kinematic rows can be placed every step. Also
// builds the render topology (indices, per-vertex uv and garment id) for one shared mesh, and the
// fur regions (hood rim, cuffs) for the shell-fur mesh.

import { Cloth } from './cloth.js';

export const GARMENT = { ROBE: 0, MANTLE: 1, SLEEVE_L: 2, SLEEVE_R: 3, COWL: 4, HAND_L: 5, HAND_R: 6, FOOT_L: 7, FOOT_R: 8, BELT: 9, SASH: 10 };

// Collider indices (wraith.js _colliders order) and which garments see them.
export const COLLIDER = { TORSO: 0, SHOULDERS: 1, THIGH_L: 2, SHIN_L: 3, THIGH_R: 4, SHIN_R: 5, UPPER_L: 6, FORE_L: 7, UPPER_R: 8, FORE_R: 9, HEAD: 10 };
const bits = (...ks) => ks.reduce((m, k) => m | (1 << k), 0);
const LEGS = [COLLIDER.THIGH_L, COLLIDER.SHIN_L, COLLIDER.THIGH_R, COLLIDER.SHIN_R];
const MASK = {
  [GARMENT.ROBE]: bits(COLLIDER.TORSO, ...LEGS),
  [GARMENT.MANTLE]: bits(COLLIDER.TORSO, COLLIDER.SHOULDERS, COLLIDER.UPPER_L, COLLIDER.UPPER_R, COLLIDER.FORE_L, COLLIDER.FORE_R),
  [GARMENT.SLEEVE_L]: bits(COLLIDER.UPPER_L, COLLIDER.FORE_L),
  [GARMENT.SLEEVE_R]: bits(COLLIDER.UPPER_R, COLLIDER.FORE_R),
  [GARMENT.SASH]: bits(...LEGS),
};

/** Sleeve: the ring pinned at the wrist (rows after it are the free bell of the cuff). */
export const SLEEVE_WRIST_ROW = 9;
/** Sleeve: the ring pinned at the elbow. */
export const SLEEVE_ELBOW_ROW = 5;
/** Arm length shoulder → hand (body.js: upper 0.3 + fore 0.28). */
const ARM = 0.58;

/**
 * @typedef {{ id: number, start: number, rows: number, cols: number, wrap: boolean,
 *   frame: 'body'|'head'|'arm'|'hand'|'foot', side: number, pinRows: number, kinematic: boolean,
 *   lx: Float32Array, ly: Float32Array, lz: Float32Array, blend: Float32Array|null, flip: number }} Garment
 */

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function smooth(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
/** Smooth 1D value noise (ragged hems: neighbouring columns vary together). */
function vnoise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u); }

/**
 * Builds the cloth and garments. The body must already be updated once (initial placement).
 * @param {import('./body.js').Body} body
 */
export function buildGarments(body) {
  const cloth = new Cloth(3200, 16000, 12);
  /** @type {Garment[]} */
  const garments = [];

  // Generic grid in a local frame. ring(u, v, g, k) writes the rest position (lx, ly, lz) of
  // particle k. Rows < pinRows are kinematic; kinematic garments (pinRows ≥ rows) get no
  // constraints. groundRows: bottom rows that collide with the terrain.
  function grid(id, frame, side, rows, cols, wrap, ring, pinRows, invMass, groundRows, blend = null) {
    const kinematic = pinRows >= rows;
    const g = { id, start: cloth.n, rows, cols, wrap, frame, side, pinRows, kinematic,
      lx: new Float32Array(rows * cols), ly: new Float32Array(rows * cols), lz: new Float32Array(rows * cols),
      blend: blend ? new Float32Array(rows * cols) : null, flip: 1 };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const v = r / (rows - 1), u = wrap ? c / cols : c / (cols - 1);
      const k = r * cols + c;
      ring(u, v, g, k, r, c);
      if (blend) g.blend[k] = blend(v);
      // Rest placement for constraint lengths only (the first update teleports into the real pose).
      body.toWorld(g.lx[k], g.ly[k], g.lz[k]);
      const i = cloth.addParticle(body.out[0], body.out[1], body.out[2], r < pinRows ? 0 : invMass);
      if (r >= rows - groundRows) cloth.ground[i] = 1;
      cloth.mask[i] = MASK[id] || 0;
    }
    if (!kinematic) {
      const idx = (r, c) => g.start + r * cols + ((c + cols) % cols);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const okC = wrap || c + 1 < cols;
        if (okC) cloth.addConstraint(idx(r, c), idx(r, c + 1), 1);
        if (r + 1 < rows) cloth.addConstraint(idx(r, c), idx(r + 1, c), 1);
        if (r + 1 < rows && okC) { cloth.addConstraint(idx(r, c), idx(r + 1, c + 1), 0.5); cloth.addConstraint(idx(r, c + 1), idx(r + 1, c), 0.5); }
        if (r + 2 < rows) cloth.addConstraint(idx(r, c), idx(r + 2, c), 0.25);
        if (wrap || c + 2 < cols) cloth.addConstraint(idx(r, c), idx(r, c + 2), 0.25);
      }
      // Tethers: every free particle to the last pinned particle of its column.
      if (pinRows > 0) {
        for (let r = pinRows; r < rows; r++) for (let c = 0; c < cols; c++) cloth.addTether(g.start + r * cols + c, g.start + (pinRows - 1) * cols + c, 1.03);
      }
    }
    garments.push(g);
    return g;
  }

  // ---- Robe: a long under-robe, fitted at the chest, gathered at the waist by the cord, pleated
  // and flaring to a trailing hem that brushes the snow. Kinematic down to the waist; free below.
  // Open at the front below the waist so a running stride parts it instead of stretching it.
  const ROBE_ROWS = 30, ROBE_WAIST = 9;
  grid(GARMENT.ROBE, 'body', 0, ROBE_ROWS, 38, false, (u, v, g, k, r, c) => {
    const vw = ROBE_WAIST / (ROBE_ROWS - 1);
    let y, rx, rz, s = 0;
    if (r <= ROBE_WAIST) {
      const t = v / vw;
      y = lerp(0.48, 0.04, t);
      rx = lerp(0.215, 0.2, t) + 0.025 * Math.sin(Math.PI * t * 0.9); // chest fullness
      rz = lerp(0.14, 0.15, t) + 0.02 * Math.sin(Math.PI * t * 0.9);
    } else {
      s = (v - vw) / (1 - vw);
      y = lerp(0.04, -0.845, s);
      const e = Math.pow(s, 0.7);
      rx = lerp(0.2, 0.37, e); rz = lerp(0.15, 0.33, e);
    }
    const gap = 0.1 * smooth(0.04, 0.35, s);
    const a = (gap + u * (2 - 2 * gap)) * Math.PI;
    // Pleats (more cloth than the ring needs, so it falls in folds) grow toward the hem.
    const pleat = 1 + 0.09 * Math.pow(s, 0.6) * Math.sin(a * 10 + 0.8 * Math.sin(a * 3 + 1));
    g.lx[k] = Math.sin(a) * rx * pleat;
    g.lz[k] = Math.cos(a) * rz * pleat - 0.04 * s;
    // Uneven hem, trailing longer at the back.
    const back = Math.max(0, -Math.cos(a));
    g.ly[k] = y - s * s * s * s * (0.035 * (vnoise(c * 0.9) - 0.5) + 0.03 * back);
  }, ROBE_WAIST + 1, 1, 5);

  // ---- Cord at the waist (kinematic): a rope ring over the robe's gather.
  grid(GARMENT.BELT, 'body', 0, 4, 40, true, (u, v, g, k) => {
    const a = u * Math.PI * 2, t = v * Math.PI * 2 * 0.75 + 0.6;
    const R = 0.012, ox = Math.cos(t) * R, oy = Math.sin(t) * R;
    g.lx[k] = Math.sin(a) * (0.218 + ox); g.lz[k] = Math.cos(a) * (0.168 + ox); g.ly[k] = 0.045 + oy;
  }, 4, 0, 0);

  // ---- Sash ends: two strips hanging from the cord at the front left, free in the wind.
  for (const s of [0, 1]) {
    const a0 = (-0.42 - s * 0.16);
    grid(GARMENT.SASH, 'body', s, 13, 2, false, (u, v, g, k) => {
      const a = a0 + (u - 0.5) * 0.2;
      g.lx[k] = Math.sin(a) * 0.235; g.lz[k] = Math.cos(a) * 0.185; g.ly[k] = 0.035 - v * (0.36 + s * 0.1);
    }, 1, 2.2, 0);
  }

  // ---- Over-mantle: a capelet gathered at the neck, pleated over the shoulders and back, open
  // at the chest (the cowl's drape closes it), with a ragged hem that is longer at the back.
  const MANTLE_PIN = 3;
  grid(GARMENT.MANTLE, 'body', 0, 13, 34, false, (u, v, g, k, r, c) => {
    const a = (40 + u * 280) * Math.PI / 180;
    let y, rx, rz, f = 0;
    if (r === 0) { y = 0.585; rx = 0.12; rz = 0.105; }
    else if (r === 1) { y = 0.54; rx = 0.2; rz = 0.15; }
    else if (r === 2) { y = 0.475; rx = 0.265; rz = 0.185; }
    else {
      f = (r - 2) / 10;
      y = 0.475 - 0.3 * f; rx = 0.265 + 0.15 * f; rz = 0.185 + 0.14 * f;
    }
    const pleat = 1 + 0.08 * f * Math.sin(a * 8 + 0.5);
    const back = Math.max(0, -Math.cos(a));
    g.lx[k] = Math.sin(a) * rx * pleat;
    g.lz[k] = Math.cos(a) * rz * pleat;
    g.ly[k] = y - f * f * f * (0.05 * (vnoise(c * 1.3 + 7) - 0.5) + 0.07 * back);
  }, MANTLE_PIN, 1.4, 0);

  // ---- Sleeves: bell sleeves from the shoulder; ring 0 pinned at the shoulder and ring
  // SLEEVE_WRIST_ROW at the wrist (arm-aligned frame); the cloth between sags off the arm, and the
  // rings after the wrist are the free, flaring bell of the cuff. ly = distance along the arm.
  for (const s of [0, 1]) {
    grid(s === 0 ? GARMENT.SLEEVE_L : GARMENT.SLEEVE_R, 'arm', s, SLEEVE_WRIST_ROW + 3, 14, true, (u, v, g, k, r) => {
      const a = u * Math.PI * 2;
      const t = r <= SLEEVE_WRIST_ROW ? r / SLEEVE_WRIST_ROW : 1 + (r - SLEEVE_WRIST_ROW) * 0.075 / ARM;
      const rr = r <= SLEEVE_WRIST_ROW ? lerp(0.082, 0.098, t) : 0.098 + (r - SLEEVE_WRIST_ROW) * 0.03;
      const pleat = 1 + 0.06 * Math.sin(a * 5) * Math.min(1, t);
      g.lx[k] = Math.sin(a) * rr * pleat; g.lz[k] = Math.cos(a) * rr * pleat; g.ly[k] = t * ARM;
    }, 1, 1.2, 0);
  }

  // ---- Cowl: a deep hood whose two front edges meet at the crown in a soft point that falls
  // back, framing a deep opening; below the jaw it closes under the chin and drapes over the
  // mantle onto the shoulders. Head frame (+z forward) for the hood, easing to the body frame
  // over the drape so it rests on the shoulders. Kinematic. u runs around from one front edge
  // over the back to the other; v from the crown down.
  const HOOD_ROWS = 18, HOOD_SPLIT = 0.68;
  grid(GARMENT.COWL, 'head', 0, HOOD_ROWS, 28, false, (u, v, g, k) => {
    const d = smooth(HOOD_SPLIT - 0.04, 1, v);                 // 0: hood shell → 1: shoulder drape
    const phi0 = lerp(143, 177, d) * Math.PI / 180;           // half-angle from the back to the edge
    const phi = -phi0 + u * 2 * phi0;
    const rim = smooth(0.62, 0.98, Math.abs(phi) / phi0) * (1 - d);
    if (v <= HOOD_SPLIT) {
      const th = lerp(0.05, 2.05, v / HOOD_SPLIT);
      const rx = 0.152, ry = 0.17, rz = 0.172 * (1 + 0.32 * rim);
      const tip = Math.pow(1 - v / HOOD_SPLIT, 3);
      // The brim: the upper rim is drawn forward and down over the brow, so the hood broods
      // forward instead of gazing up.
      const brim = rim * Math.pow(1 - v / HOOD_SPLIT, 1.5);
      g.lx[k] = Math.sin(th) * Math.sin(phi) * rx;
      g.lz[k] = -Math.sin(th) * Math.cos(phi) * rz - 0.015 - 0.055 * tip + 0.02 * rim + 0.07 * brim;
      g.ly[k] = Math.cos(th) * ry + 0.012 + 0.025 * tip - 0.015 * rim - 0.05 * brim;
    } else {
      const s = (v - HOOD_SPLIT) / (1 - HOOD_SPLIT), e = Math.pow(s, 0.8);
      const s0 = Math.sin(2.05), c0 = Math.cos(2.05);
      // Lies on the mantle's shoulders (just outside it), pleated, longer at the back.
      const pleat = 1 + 0.05 * s * Math.sin(phi * 7 + 0.4);
      const rx = lerp(s0 * 0.152, 0.29, e) * pleat, rz = lerp(s0 * 0.172 * 0.97, 0.235, e) * pleat;
      g.lx[k] = Math.sin(phi) * rx;
      g.lz[k] = -Math.cos(phi) * rz - 0.015 * (1 - s) + 0.01 * s;
      const backDrop = 0.05 * s * Math.max(0, Math.cos(phi));
      g.ly[k] = lerp(c0 * 0.17 + 0.012, -0.27, s) - 0.06 * s * Math.abs(Math.sin(phi)) - backDrop;
    }
  }, HOOD_ROWS, 0, 0, (v) => smooth(HOOD_SPLIT, 1, v));

  // ---- Hands: wrapped mittens along the forearm from the wrist, flattened, fingers curled in.
  // Hand frame: ly along the forearm (out of the cuff), lx across the palm, lz palm-forward.
  for (const s of [0, 1]) {
    grid(s === 0 ? GARMENT.HAND_L : GARMENT.HAND_R, 'hand', s, 8, 12, true, (u, v, g, k) => {
      const a = u * Math.PI * 2;
      const r = 0.044 * Math.max(0.1, Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * v)), 0.55));
      g.lx[k] = Math.sin(a) * r * 1.15;
      g.lz[k] = Math.cos(a) * r * 0.72 + 0.03 * v * v;
      g.ly[k] = -0.03 + 0.17 * v;
    }, 99, 0, 0);
  }

  // ---- Feet: wrapped, low, mostly hidden under the hem. Foot frame: origin at the gait's foot
  // point on the ground, +z toward the toe, +y up.
  for (const s of [0, 1]) {
    grid(s === 0 ? GARMENT.FOOT_L : GARMENT.FOOT_R, 'foot', s, 8, 12, true, (u, v, g, k) => {
      const a = u * Math.PI * 2;
      const r = Math.max(0.1, Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * v)), 0.5));
      const y = Math.cos(a) * 0.042 * r;
      g.lx[k] = Math.sin(a) * 0.047 * r * (0.85 + 0.25 * v);
      g.ly[k] = 0.045 + (y < 0 ? y * 0.35 : y) - 0.012 * v;
      g.lz[k] = -0.08 + 0.235 * v;
    }, 99, 0, 0);
  }

  // Render topology: triangles of every grid; uv = (u across, v down); garment id per vertex.
  const N = cloth.n;
  const uv = new Float32Array(N * 2), gid = new Float32Array(N), pid = new Float32Array(N);
  const tris = [], fur = [];
  for (const g of garments) {
    const { rows, cols, wrap, start } = g;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = start + r * cols + c;
      uv[i * 2] = wrap ? c / cols : c / (cols - 1); uv[i * 2 + 1] = r / (rows - 1);
      gid[i] = g.id; pid[i] = i;
      if (r + 1 < rows && (wrap || c + 1 < cols)) {
        const c1 = (c + 1) % cols;
        const a = start + r * cols + c, b = start + r * cols + c1, d = start + (r + 1) * cols + c, e = start + (r + 1) * cols + c1;
        tris.push(a, d, b, b, d, e);
        // Fur regions: the hood's rim (two columns each side, crown to chin) and the cuffs.
        const hoodRim = g.id === GARMENT.COWL && (c < 2 || c >= cols - 3) && r < Math.round(HOOD_ROWS * HOOD_SPLIT) + 1;
        const cuff = (g.id === GARMENT.SLEEVE_L || g.id === GARMENT.SLEEVE_R) && r >= SLEEVE_WRIST_ROW + 1;
        if (hoodRim || cuff) fur.push(a, d, b, b, d, e);
      }
    }
  }
  // The wrapped hand's open end at the wrist is hidden in the sleeve; wrap-texture u needs the seam.
  return { cloth, garments, uv, gid, pid, indices: new Uint32Array(tris), furIndices: new Uint32Array(fur) };
}
