// A performance: authored movement played through the procedural body (docs/phase-10/cutscene-research.md). The clip holds
// the pelvis, torso and head frames and the arm and foot joints at 30 fps (tools/motion/kimodo_clip.py); it is sampled
// on a Catmull-Rom curve at the render clock, so it never steps, and the cloth rides on it as on the gait.
// Allocation-free after construction.

export const CLIP_FIELDS = 45;
const FPS = 30;
const PELVIS = 0, R = 3, U = 6, F = 9, HR = 12, HU = 15, HF = 18, SH = 21, EL = 27, HA = 33, FEET = 39;

/** Catmull-Rom at u (0..1) between b and c. */
const cr = (a, b, c, d, u) => b + 0.5 * u * (c - a + u * (2 * a - 5 * b + 4 * c - d + u * (3 * (b - c) + d - a)));

export class Performance {
  /** @param {ArrayBuffer} buffer  a clip: float32 count, then count × CLIP_FIELDS */
  constructor(buffer) {
    const v = new Float32Array(buffer);
    this.n = v[0]; this.d = v.subarray(1);
    this.s = new Float64Array(CLIP_FIELDS);
    this.t = 0.5 - 0.5;
    this.loop = true;
    /** Where the clip stands: the ground point (x, y, z), its facing (rad) and its scale (the Veiled's sizes). */
    this.x = 0.5; this.y = 0.5; this.z = 0.5; this.yaw = 0.5 - 0.5; this.scale = 1.5 - 0.5;
    this._sy = 0.5 - 0.5; this._cy = 1.5 - 0.5;
    this._foot = new Float64Array(6);
  }

  /** Advance by dt and sample every field for this frame. */
  step(dt) {
    const n = this.n, L = (n - 1) / FPS;
    this.t += dt;
    if (this.t > L) this.t = this.loop ? this.t % L : L;
    const q = this.t * FPS, i = Math.min(n - 2, Math.floor(q)), u = q - i;
    const i0 = this.loop ? (i - 1 + n) % n : Math.max(0, i - 1), i3 = this.loop ? (i + 2) % n : Math.min(n - 1, i + 2);
    const d = this.d, s = this.s, C = CLIP_FIELDS;
    for (let k = 0; k < C; k++) s[k] = cr(d[i0 * C + k], d[i * C + k], d[(i + 1) * C + k], d[i3 * C + k], u);
    this._sy = Math.sin(this.yaw); this._cy = Math.cos(this.yaw);
  }

  /** Direction field k → out (rotated by the facing). */
  _dir(k, o) {
    const s = this.s, x = s[k], z = s[k + 2];
    o[0] = x * this._cy + z * this._sy; o[1] = s[k + 1]; o[2] = -x * this._sy + z * this._cy;
  }
  _norm3(a, b, c) {
    // Gram-Schmidt: the curve leaves a frame a little off square.
    let l = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]) || 1; b[0] /= l; b[1] /= l; b[2] /= l;
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; a[0] -= b[0] * d; a[1] -= b[1] * d; a[2] -= b[2] * d;
    l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; a[0] /= l; a[1] /= l; a[2] /= l;
    c[0] = a[1] * b[2] - a[2] * b[1]; c[1] = a[2] * b[0] - a[0] * b[2]; c[2] = a[0] * b[1] - a[1] * b[0];
  }
  /** Point field k → out (world). */
  _pos(k, o, at) {
    const s = this.s, x = s[k] * this.scale, z = s[k + 2] * this.scale;
    o[at] = this.x + x * this._cy + z * this._sy; o[at + 1] = this.y + s[k + 1] * this.scale; o[at + 2] = this.z - x * this._sy + z * this._cy;
  }

  /** Pose the body (after Body.update) and put the feet on the gait. */
  apply(body, gait) {
    this._dir(R, body.r); this._dir(U, body.u); this._dir(F, body.f); this._norm3(body.r, body.u, body.f);
    this._dir(HR, body.hr); this._dir(HU, body.hu); this._dir(HF, body.hf); this._norm3(body.hr, body.hu, body.hf);
    this._pos(PELVIS, this.s, 0);
    body.px = this.s[0]; body.py = this.s[1]; body.pz = this.s[2];
    gait.px = body.px; gait.py = body.py; gait.pz = body.pz;
    this._pos(SH, body.sh, 0); this._pos(SH + 3, body.sh, 3);
    this._pos(EL, body.el, 0); this._pos(EL + 3, body.el, 3);
    this._pos(HA, body.ha, 0); this._pos(HA + 3, body.ha, 3);
    body.toWorld(0, 0.42, 0); body.chest[0] = body.out[0]; body.chest[1] = body.out[1]; body.chest[2] = body.out[2];
    const u = body.u, sy = body.sh; body.head[0] = (sy[0] + sy[3]) * 0.5 + u[0] * 0.26; body.head[1] = (sy[1] + sy[4]) * 0.5 + u[1] * 0.26; body.head[2] = (sy[2] + sy[5]) * 0.5 + u[2] * 0.26;
    const fo = this._foot;
    this._pos(FEET, fo, 0); this._pos(FEET + 3, fo, 3);
    for (let f = 0; f < 2; f++) { gait.fx[f] = fo[f * 3]; gait.fy[f] = fo[f * 3 + 1]; gait.fz[f] = fo[f * 3 + 2]; }
  }
}
