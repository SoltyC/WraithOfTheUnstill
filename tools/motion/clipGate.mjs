#!/usr/bin/env node
// The quality gate for generated movement (docs/phase-10/motion-gate.md): every clip in data/motion passes this before the
// game may load it. It reads the clip the game plays, not the model's output, so a fault added by the conversion counts.
// Only the checks here are automatic: a clip that passes still has to be filmed on the robe and accepted by eye.
//   node tools/motion/clipGate.mjs <clip.bin> [loop] [seated] [travels] [--json]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const FIELDS = 45;
export const FPS = 30;
const PELVIS = 0, R = 3, U = 6, F = 9, HR = 12, HU = 15, HF = 18, SH = 21, EL = 27, HA = 33, FEET = 39;
const POINTS = { pelvis: PELVIS, sL: SH, sR: SH + 3, eL: EL, eR: EL + 3, hL: HA, hR: HA + 3, fL: FEET, fR: FEET + 3 };
const LIMBS = ['hL', 'hR', 'fL', 'fR', 'eL', 'eR', 'pelvis'];

/** The rig the clip plays on (wraith.js, gait.js) and what a body can do. fail = rejected; each is argued in the doc. */
export const LIMITS = {
  minSeconds: 1,
  frameSkew: 0.03,          // a torso or head frame this far off square (dot, or length from 1)
  boneDrift: 0.01,          // m: an arm bone may not change length over the clip
  armRatio: [0.85, 1.2],    // clip arm / rig arm: outside this the sleeve and hand no longer match the pose
  legReach: 0.95,           // m: hip to sole; gait.js clamps at 0.92, so past this the knee locks and the shin ends short of the foot
  soleCm: 1.5,              // a fitted clip's lowest sole, from the ground
  standingPelvis: 0.93,     // m: above this the clip is not fitted to the rig (0.88), and the hem rides up
  hipWidth: 0.11,
  speed: { hand: 9, foot: 8, pelvis: 5 },    // m/s
  turn: { torso: 420, head: 600 },           // deg/s
  jitterHz: 7.5,            // nothing a body does on purpose sits above this
  jitterMms: 30,            // mm/s RMS of a limb's velocity above jitterHz
  jitterDegs: 6,            // deg/s RMS of a torso or head axis above jitterHz
  popRatio: 9,              // worst single-frame acceleration / the clip's 99th percentile of it
  popFloor: 18,             // m/s²: below this a spike is not a pop, however quiet the clip
  neckDeg: 95,              // head away from the torso
  foldDeg: 20,              // an elbow folded tighter than this is the arm through itself
  groundCm: 2,              // ankle below its own lowest resting height across the clip
  creepMm: 1.5,             // a low, slow foot's movement per frame, 90th percentile: a planted foot stays planted
  slideSeconds: 0.2,        // a low foot moving fast for longer than a step takes to lift or land
  hoverSeconds: 0.5,        // both feet off the ground this long, with no jump asked for
  hoverCm: 9,
  torsoRadius: 0.09,        // a hand or elbow deeper than this inside the torso capsule
  headRadius: 0.07,
  feetApart: 0.08,          // ankles closer than this: legs through each other
  penetrateSeconds: 0.1,
  balanceReach: 0.28,       // m: centre of mass past the line between the feet
  balanceSeconds: 0.6,
  seatedPelvis: 0.62,       // pelvis below this with both feet down is sitting, and a sitter needs a seat
  drift: 0.45,              // m of pelvis wander, in a clip that stays put
  frozenMm: 0.4,            // no joint moves more than this per frame...
  frozenSeconds: 0.5,       // ...for this long
  minHandTravel: 0.15,      // m/s, mean: below this the clip is a statue
  seamPose: 0.05,           // m: a looping clip's last frame to its first
  seamSpeed: 0.8,           // m/s: velocity across the seam
};

const pct = (a, p) => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / ((len(a) * len(b)) || 1)))) * 180 / Math.PI;
/** The longest run of true in a list of booleans, in frames. */
const longest = (b) => { let n = 0, m = 0; for (const v of b) { n = v ? n + 1 : 0; if (n > m) m = n; } return m; };
const toSeg = (p, a, b) => { const d = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), d) / (dot(d, d) || 1))); return len(sub(p, add(a, d, t))); };

/** RMS of a signal's velocity above jitterHz: fast movement is low-frequency, however quick, so this reads only shake. */
function bandRms(x) {
  const n = x.length - 1, w = new Float64Array(n), d = new Float64Array(n); let ww = 0;
  for (let t = 0; t < n; t++) { w[t] = 0.5 - 0.5 * Math.cos(2 * Math.PI * t / (n - 1)); d[t] = (x[t + 1] - x[t]) * FPS; ww += w[t] * w[t]; }
  let sum = 0;
  for (let k = Math.ceil(LIMITS.jitterHz * n / FPS); k < n / 2; k++) {
    let re = 0, im = 0;
    for (let t = 0; t < n; t++) { const a = 2 * Math.PI * k * t / n; re += w[t] * d[t] * Math.cos(a); im -= w[t] * d[t] * Math.sin(a); }
    sum += re * re + im * im;
  }
  return Math.sqrt(2 * sum / (n * ww));
}

/**
 * Judge a clip.
 * @param {Float32Array} v  the clip file: count, then count × FIELDS
 * @param {{loop?:boolean, seated?:boolean, travels?:boolean}} o  what the clip is for; each relaxes or adds a check
 * @returns {{pass:boolean, seconds:number, checks:{id:string,pass:boolean,value:number,limit:number|string,unit:string}[], failed:string[]}}
 */
export function gateClip(v, o = {}) {
  const L = LIMITS, checks = [], put = (id, value, limit, pass, unit = '') => checks.push({ id, pass: !!pass, value: Math.round(value * 1000) / 1000, limit, unit });
  const T = v[0], whole = Number.isInteger(T) && T >= 2 && v.length === 1 + T * FIELDS;
  put('format', v.length, `1 + ${FIELDS} × frames`, whole);
  if (!whole) return finish(checks, 0);
  let bad = 0; for (let i = 0; i < v.length; i++) if (!Number.isFinite(v[i])) bad++;
  put('finite', bad, 0, bad === 0, 'values');
  if (bad) return finish(checks, 0);
  const seconds = (T - 1) / FPS;
  put('length', seconds, L.minSeconds, seconds >= L.minSeconds, 's');

  const at = (t, k) => { const i = 1 + t * FIELDS + k; return [v[i], v[i + 1], v[i + 2]]; };
  const pts = {}; for (const k in POINTS) { pts[k] = []; for (let t = 0; t < T; t++) pts[k].push(at(t, POINTS[k])); }
  const frames = (a, b, c) => { const o = []; for (let t = 0; t < T; t++) o.push([at(t, a), at(t, b), at(t, c)]); return o; };
  const torso = frames(R, U, F), head = frames(HR, HU, HF);

  // The frames: performance.js squares them up per frame, so a skewed one is a pose that changes when it plays.
  let skew = 0, hand = 1;
  for (const set of [torso, head]) for (const [r, u, f] of set) {
    skew = Math.max(skew, Math.abs(len(r) - 1), Math.abs(len(u) - 1), Math.abs(len(f) - 1), Math.abs(dot(r, u)), Math.abs(dot(r, f)), Math.abs(dot(u, f)));
    hand = Math.min(hand, dot(cross(r, u), f));
  }
  put('frames square', skew, L.frameSkew, skew <= L.frameSkew);
  put('frames right-handed', hand, '> 0', hand > 0);

  // Bones: the clip's arm against itself and against the rig.
  const seg = (a, b) => pts[a].map((p, t) => len(sub(p, pts[b][t])));
  const up = [...seg('sL', 'eL'), ...seg('sR', 'eR')], fo = [...seg('eL', 'hL'), ...seg('eR', 'hR')];
  const drift = Math.max(Math.max(...up) - Math.min(...up), Math.max(...fo) - Math.min(...fo));
  put('bones hold length', drift, L.boneDrift, drift <= L.boneDrift, 'm');
  const arm = (mean(up) + mean(fo)) / 0.58;
  put('arm matches rig', arm, L.armRatio.join('–'), arm >= L.armRatio[0] && arm <= L.armRatio[1], '×');

  // Legs: a hip the knee solver can reach from the foot.
  let reach = 0;
  for (let t = 0; t < T; t++) for (const [k, s] of [['fL', -1], ['fR', 1]]) reach = Math.max(reach, len(sub(pts[k][t], add(pts.pelvis[t], torso[t][0], s * L.hipWidth))));
  put('leg reach', reach, L.legReach, reach <= L.legReach, 'm');

  // Speed, pops and jitter.
  const speed = (k) => { let m = 0; for (let t = 1; t < T; t++) m = Math.max(m, len(sub(pts[k][t], pts[k][t - 1])) * FPS); return m; };
  const hs = Math.max(speed('hL'), speed('hR')), fs = Math.max(speed('fL'), speed('fR')), ps = speed('pelvis');
  put('hand speed', hs, L.speed.hand, hs <= L.speed.hand, 'm/s');
  put('foot speed', fs, L.speed.foot, fs <= L.speed.foot, 'm/s');
  put('pelvis speed', ps, L.speed.pelvis, ps <= L.speed.pelvis, 'm/s');
  const turn = (set) => { let m = 0; for (let t = 1; t < T; t++) m = Math.max(m, angle(set[t][1], set[t - 1][1]), angle(set[t][2], set[t - 1][2])); return m * FPS; };
  const tt = turn(torso), ht = turn(head);
  put('torso turn', tt, L.turn.torso, tt <= L.turn.torso, '°/s');
  put('head turn', ht, L.turn.head, ht <= L.turn.head, '°/s');

  const acc = [], shake = [];
  for (const k of LIMBS) {
    const p = pts[k];
    for (let t = 1; t < T - 1; t++) acc.push(len(sub(add(p[t + 1], p[t - 1]), add(p[t], p[t]))) * FPS * FPS);
    for (let c = 0; c < 3; c++) shake.push(bandRms(p.map((q) => q[c])));
  }
  const jit = Math.max(...shake) * 1000;
  put('jitter, limbs', jit, L.jitterMms, jit <= L.jitterMms, 'mm/s');
  let jd = 0;
  for (const set of [torso, head]) for (const axis of [1, 2]) for (let c = 0; c < 3; c++) jd = Math.max(jd, bandRms(set.map((q) => q[axis][c])));
  jd *= 180 / Math.PI;
  put('jitter, frames', jd, L.jitterDegs, jd <= L.jitterDegs, '°/s');
  const a99 = pct(acc, 0.99), aMax = Math.max(...acc), ratio = aMax / (a99 || 1);
  put('pops', ratio, L.popRatio, aMax < L.popFloor || ratio <= L.popRatio, `× p99 (peak ${aMax.toFixed(1)} m/s²)`);

  // Anatomy.
  let neck = 0, fold = 180;
  for (let t = 0; t < T; t++) {
    neck = Math.max(neck, angle(torso[t][2], head[t][2]));
    for (const [s, e, h] of [['sL', 'eL', 'hL'], ['sR', 'eR', 'hR']]) fold = Math.min(fold, angle(sub(pts[s][t], pts[e][t]), sub(pts[h][t], pts[e][t])));
  }
  put('neck', neck, L.neckDeg, neck <= L.neckDeg, '°');
  put('elbow fold', fold, L.foldDeg, fold >= L.foldDeg, '°');

  // The ground, the feet. The ankle's lowest point in the clip stands for flat on the ground.
  const ank = pts.fL.concat(pts.fR).map((p) => p[1]), rest = pct(ank, 0.02);
  put('soles on the ground', Math.abs(rest) * 100, L.soleCm, Math.abs(rest) * 100 <= L.soleCm, 'cm');
  const hip = pct(pts.pelvis.map((p) => p[1]), 0.5);
  put('pelvis fits the rig', hip, L.standingPelvis, hip <= L.standingPelvis, 'm');
  const under = (rest - Math.min(...ank)) * 100;
  put('through the ground', under, L.groundCm, under <= L.groundCm, 'cm');
  const creep = []; let slide = 0;
  for (const k of ['fL', 'fR']) {
    const fast = [];
    for (let t = 1; t < T; t++) {
      const p = pts[k][t], q = pts[k][t - 1], d = Math.hypot(p[0] - q[0], p[2] - q[2]), low = p[1] < rest + 0.05;
      fast.push(low && d > 0.025);
      if (low && d <= 0.025) creep.push(d * 1000);
    }
    slide = Math.max(slide, longest(fast) / FPS);
  }
  const cr = pct(creep, 0.9);
  put('foot creep', cr, L.creepMm, cr <= L.creepMm, 'mm/frame');
  put('foot slide', slide, L.slideSeconds, slide <= L.slideSeconds, 's');
  const hoverF = []; for (let t = 0; t < T; t++) hoverF.push(Math.min(pts.fL[t][1], pts.fR[t][1]) - rest > L.hoverCm / 100);
  const hover = longest(hoverF) / FPS;
  put('hovering', hover, L.hoverSeconds, hover <= L.hoverSeconds, 's');

  // The body through itself.
  const inTorso = [], inHead = [], crossed = [];
  for (let t = 0; t < T; t++) {
    const top = add(add(pts.sL[t], pts.sR[t]), [0, 0, 0]).map((x) => x * 0.5), cap = add(top, torso[t][1], -0.06);
    const hd = add(top, torso[t][1], 0.26);
    let inT = false, inH = false;
    for (const k of ['hL', 'hR', 'eL', 'eR']) {
      if (toSeg(pts[k][t], pts.pelvis[t], cap) < L.torsoRadius) inT = true;
      if (k[0] === 'h' && len(sub(pts[k][t], hd)) < L.headRadius) inH = true;
    }
    inTorso.push(inT); inHead.push(inH);
    crossed.push(len(sub(pts.fL[t], pts.fR[t])) < L.feetApart);
  }
  const it = longest(inTorso) / FPS, ih = longest(inHead) / FPS, ic = longest(crossed) / FPS;
  put('hand or elbow in the torso', it, L.penetrateSeconds, it <= L.penetrateSeconds, 's');
  put('hand in the head', ih, L.penetrateSeconds, ih <= L.penetrateSeconds, 's');
  put('legs through each other', ic, L.penetrateSeconds, ic <= L.penetrateSeconds, 's');

  // Balance: a rough centre of mass from the points we have.
  const off = [];
  let sitF = 0;
  for (let t = 0; t < T; t++) {
    const mid = add(pts.sL[t], pts.sR[t]).map((x) => x * 0.5);
    const c = [0, 1, 2].map((i) => pts.pelvis[t][i] * 0.5 + mid[i] * 0.4 + (pts.hL[t][i] + pts.hR[t][i]) * 0.05);
    const g = [c[0], 0, c[2]], a = [pts.fL[t][0], 0, pts.fL[t][2]], b = [pts.fR[t][0], 0, pts.fR[t][2]];
    off.push(toSeg(g, a, b) > L.balanceReach);
    if (pts.pelvis[t][1] < L.seatedPelvis && Math.max(pts.fL[t][1], pts.fR[t][1]) < rest + 0.1) sitF++;
  }
  const tip = longest(off) / FPS;
  const sits = sitF / T;
  if (o.seated) put('seated', sits, 'declared', true, 'of frames');
  else {
    put('tipping', tip, L.balanceSeconds, tip <= L.balanceSeconds, 's');
    put('sitting on nothing', sits, 0.05, sits <= 0.05, 'of frames');
  }

  // A clip that stays at its work has to stay; one that walks is declared.
  const p0 = pts.pelvis[0]; let wander = 0;
  for (const p of pts.pelvis) wander = Math.max(wander, Math.hypot(p[0] - p0[0], p[2] - p0[2]));
  if (!o.travels) put('stays put', wander, L.drift, wander <= L.drift, 'm');

  // Dead stretches.
  const still = [];
  for (let t = 1; t < T; t++) { let m = 0; for (const k of LIMBS) m = Math.max(m, len(sub(pts[k][t], pts[k][t - 1]))); still.push(m * 1000 < L.frozenMm); }
  const froze = longest(still) / FPS;
  put('frozen', froze, L.frozenSeconds, froze <= L.frozenSeconds, 's');
  let run = 0; for (const k of ['hL', 'hR']) for (let t = 1; t < T; t++) run += len(sub(pts[k][t], pts[k][t - 1]));
  const activity = run / 2 / seconds;
  put('alive', activity, L.minHandTravel, activity >= L.minHandTravel, 'm/s');

  // The loop's seam: performance.js wraps straight from the last frame to the first.
  if (o.loop) {
    let pose = 0, vel = 0;
    for (const k of LIMBS) {
      const p = pts[k];
      pose = Math.max(pose, len(sub(p[T - 1], p[0])));
      vel = Math.max(vel, len(sub(sub(p[1], p[0]), sub(p[T - 1], p[T - 2]))) * FPS);
    }
    put('loop seam, pose', pose, L.seamPose, pose <= L.seamPose, 'm');
    put('loop seam, speed', vel, L.seamSpeed, vel <= L.seamSpeed, 'm/s');
  }
  return finish(checks, seconds);
}

function finish(checks, seconds) {
  const failed = checks.filter((c) => !c.pass).map((c) => c.id);
  return { pass: failed.length === 0, seconds, checks, failed };
}

/** A clip file on disk as the gate reads it. */
export function readClip(path) {
  const b = readFileSync(path);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), json = args.includes('--json'), flags = new Set(args.filter((a) => !a.startsWith('--')));
  const path = args[0]; flags.delete(path);
  const r = gateClip(readClip(path), { loop: flags.has('loop'), seated: flags.has('seated'), travels: flags.has('travels') });
  if (json) console.log(JSON.stringify(r));
  else {
    for (const c of r.checks) console.log(`${c.pass ? ' ok ' : 'FAIL'} ${c.id.padEnd(28)} ${String(c.value).padStart(9)} ${c.unit}  (limit ${c.limit})`);
    console.log(r.pass ? `PASS ${path}` : `FAIL ${path}: ${r.failed.join(', ')}`);
  }
  process.exit(r.pass ? 0 : 1);
}
