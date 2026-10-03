// The Wraith's procedural locomotion (BRIEF §8.1, Phase 3 gate: "feet plant without sliding";
// "footprints land on the exact frame").
import { describe, it, expect } from 'vitest';
import { Gait, GAIT } from '../src/character/wraith/gait.js';

// Gently rolling ground.
const ground = { qx: 0, qz: 0, h: 0, sample() { this.h = 0.4 * Math.sin(this.qx * 0.3) + 0.3 * Math.cos(this.qz * 0.23); } };
const H = (x, z) => { ground.qx = x; ground.qz = z; ground.sample(); return ground.h; };

/** Simulate a body path; path(t) → [x, z, vx, vz, yaw]. Returns per-frame records. */
function run(path, seconds, dt = 1 / 60) {
  const g = new Gait(ground);
  const frames = [];
  for (let i = 0, n = Math.round(seconds / dt); i < n; i++) {
    const [x, z, vx, vz, yaw] = path(i * dt);
    g.bx = x; g.bz = z; g.by = H(x, z); g.vx = vx; g.vz = vz; g.yaw = yaw; g.grounded = true; g.dt = dt;
    g.evCount = 0;
    g.update();
    const events = [];
    for (let e = 0; e < g.evCount; e++) events.push(Array.from(g.ev.subarray(e * 7, e * 7 + 7)));
    frames.push({ t: i * dt, x, z, state: Array.from(g.state), fx: Array.from(g.fx), fy: Array.from(g.fy), fz: Array.from(g.fz),
      px: g.px, py: g.py, pz: g.pz, events });
  }
  return frames;
}

const straight = (speed) => (t) => [speed * t, 0, speed, 0, Math.PI / 2];
const circle = (speed, r) => (t) => { const a = (speed * t) / r; return [r * Math.sin(a), r - r * Math.cos(a), speed * Math.cos(a), speed * Math.sin(a), Math.atan2(Math.cos(a), Math.sin(a))]; };

/** Largest movement of any foot while it stays planted (must be exactly 0). */
function maxPlantedSlide(frames) {
  let worst = 0;
  for (let i = 1; i < frames.length; i++) for (let f = 0; f < 2; f++) {
    if (frames[i].state[f] === 0 && frames[i - 1].state[f] === 0) {
      worst = Math.max(worst, Math.hypot(frames[i].fx[f] - frames[i - 1].fx[f], frames[i].fy[f] - frames[i - 1].fy[f], frames[i].fz[f] - frames[i - 1].fz[f]));
    }
  }
  return worst;
}

describe('Wraith gait', () => {
  for (const speed of [1.4, 3, 5.2]) {
    it(`planted feet never slide (straight at ${speed} m/s)`, () => {
      expect(maxPlantedSlide(run(straight(speed), 8))).toBe(0);
    });
  }
  it('planted feet never slide while turning and stopping', () => {
    expect(maxPlantedSlide(run(circle(3, 6), 10))).toBe(0);
    const stop = (t) => { const s = Math.max(0, 3 - t); const x = t < 3 ? 3 * t - 0.5 * t * t : 4.5; return [x, 0, s, 0, Math.PI / 2]; };
    expect(maxPlantedSlide(run(stop, 6))).toBe(0);
  });
  it('each footfall lands on the exact frame and spot where the foot plants, on the ground', () => {
    const frames = run(straight(3), 6);
    let n = 0;
    for (let i = 1; i < frames.length; i++) for (const e of frames[i].events) {
      const f = e[5];
      expect(frames[i - 1].state[f]).toBe(1);   // swinging the frame before
      expect(frames[i].state[f]).toBe(0);       // planted on this frame
      expect(e[0]).toBe(frames[i].fx[f]); expect(e[2]).toBe(frames[i].fz[f]);
      expect(Math.abs(e[1] - H(e[0], e[2]))).toBeLessThan(1e-9);
      n++;
    }
    expect(n).toBeGreaterThan(10);
  });
  it('steps alternate and cadence is plausible for walking and running', () => {
    for (const [speed, lo, hi] of [[1.4, 1.4, 2.6], [5.2, 2.6, 4.2]]) {
      const frames = run(straight(speed), 10);
      const ev = frames.flatMap((fr) => fr.events);
      const steady = ev.slice(4);
      for (let k = 1; k < steady.length; k++) expect(steady[k][5]).not.toBe(steady[k - 1][5]);
      const rate = ev.length / 10;
      expect(rate).toBeGreaterThan(lo); expect(rate).toBeLessThan(hi);
    }
  });
  it('walking keeps a foot on the ground; running has flight phases', () => {
    const walk = run(straight(1.4), 6).slice(60);
    expect(walk.every((fr) => fr.state[0] === 0 || fr.state[1] === 0)).toBe(true);
    const runF = run(straight(5.2), 6).slice(60);
    expect(runF.some((fr) => fr.state[0] === 1 && fr.state[1] === 1)).toBe(true);
  });
  it('feet stay near the hips (stride within leg reach plus toe-off)', () => {
    for (const speed of [1.4, 5.2]) {
      for (const fr of run(straight(speed), 6).slice(60)) for (let f = 0; f < 2; f++) {
        const d = Math.hypot(fr.fx[f] - fr.px, fr.fy[f] - fr.py, fr.fz[f] - fr.pz);
        expect(d).toBeLessThan(GAIT.legLength + 0.3);
      }
    }
  });
  it('settles both feet under the body at rest', () => {
    const frames = run(() => [0, 0, 0, 0, 0], 3);
    const last = frames[frames.length - 1];
    for (let f = 0; f < 2; f++) expect(Math.abs(Math.hypot(last.fx[f] - 0, last.fz[f] - 0) - GAIT.hipWidth)).toBeLessThan(0.07);
  });
});
