import { describe, it, expect } from 'vitest';
import { createBellwether, B, BELL_T, BELL_MAX, NECK_SEGS, SEG_LEN, neckRadius, VALVE_S, VALVE_TH } from '../src/game/bellwether/bellwether.js';
import { createNeckClimb, VALVE_WAY } from '../src/game/bellwether/neckClimb.js';
import { CHUNK_FLOATS } from '../src/game/shaped/rig.js';
import { manorWorld, MANOR } from '../src/world/manor.js';

const ground = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
function make() {
  const b = createBellwether({ ground });
  const w = manorWorld(0, 20);
  b.targetX = w[0]; b.targetY = MANOR.y + 2; b.targetZ = w[1];
  return b;
}
const run = (b, secs, dt = 1 / 60) => { for (let k = 0; k < Math.round(secs / dt); k++) b.update(dt, 0); };

describe('bellwether', () => {
  it('stays inside the chunk budget, with finite records', () => {
    const b = make();
    expect(b.count).toBeLessThanOrEqual(BELL_MAX);
    expect(neckRadius(0)).toBeGreaterThanOrEqual(5.5);
    expect(neckRadius(NECK_SEGS)).toBeGreaterThanOrEqual(2.8);
    expect(b.chunks.length).toBe(b.count * CHUNK_FLOATS);
    for (const st of ['wake', 'idle', 'exhale', 'shake']) {
      if (st === 'wake') b.wake(); else if (st === 'idle') b.forceIdle(); else if (st === 'exhale') { b.inhale(); run(b, 3.1); b.exhale(); } else b.shake();
      run(b, 1.2);
      for (let i = 0; i < b.chunks.length; i++) expect(Number.isFinite(b.chunks[i])).toBe(true);
    }
    expect(NECK_SEGS * SEG_LEN).toBeGreaterThan(45);
    expect(NECK_SEGS * SEG_LEN).toBeLessThan(60);
  });
  it('has valves on the neck surface that move with the pose and open once', () => {
    const b = make();
    const check = () => {
      for (let k = 0; k < 3; k++) {
        const s = VALVE_S[k];
        b.neckEval(s, VALVE_TH[k], 0);
        expect(Math.hypot(b.valves.x[k] - b.sp[0], b.valves.y[k] - b.sp[1], b.valves.z[k] - b.sp[2])).toBeLessThan(0.05);
        expect(Math.hypot(b.sp[0] - b.sc[0], b.sp[1] - b.sc[1], b.sp[2] - b.sc[2])).toBeCloseTo(neckRadius(s), 0);
      }
    };
    run(b, 0.1); check();
    const y0 = b.valves.y[2];
    b.forceIdle(); run(b, 4);
    check();
    expect(Math.abs(b.valves.y[2] - y0)).toBeGreaterThan(15);
    expect(b.valves.n).toBe(3);
    b.openValve(1); b.openValve(1);
    expect(b.valves.open[1]).toBe(1); expect(b.valvesOpen).toBe(1);
    run(b, 1);
    const o = b.valves.open;
    b.reset();
    expect(o[1]).toBe(0);
  });
  it('wakes over 5 s, rearing out of the wing; idle tracks the Wraith', () => {
    const b = make();
    expect(b.state).toBe(B.DORMANT);
    const low = b.hy;
    b.wake();
    run(b, BELL_T.wake - 0.2); expect(b.state).toBe(B.WAKE); expect(b.creak).toBeGreaterThanOrEqual(0);
    run(b, 0.4); expect(b.state).toBe(B.IDLE);
    run(b, 2);
    expect(b.hy - MANOR.y).toBeGreaterThan(36);
    expect(b.hy - MANOR.y).toBeLessThan(58);
    expect(b.hy).toBeGreaterThan(low + 35);
    // Head forward points toward a target placed to one side.
    const w = manorWorld(-40, -10);
    b.targetX = w[0]; b.targetY = b.hy; b.targetZ = w[1];
    run(b, 6);
    const dx = w[0] - b.hx, dz = w[1] - b.hz, dl = Math.hypot(dx, dz);
    expect(b.mdx * dx / dl + b.mdz * dz / dl).toBeGreaterThan(0.5);
  });
  it('inhale takes ~3 s and holds; exhale thrusts low with the mouth open, then idles after ~2.5 s', () => {
    const b = make(); b.forceIdle(); run(b, 3);
    const hIdle = b.hy;
    b.inhale(); run(b, 2.9); expect(b.inhaled).toBe(false);
    run(b, 0.3); expect(b.inhaled).toBe(true); expect(b.state).toBe(B.INHALE);
    expect(b.pose[10]).toBeGreaterThan(0.9);
    b.exhale(); run(b, 1.8);
    expect(b.state).toBe(B.EXHALE);
    expect(b.hy).toBeLessThan(hIdle - 15);
    expect(b.pose[6]).toBeGreaterThan(0.7);
    run(b, 0.9); expect(b.state).toBe(B.IDLE);
  });
  it('the exhale sweeps across its arc', () => {
    const b = make(); b.forceIdle(); run(b, 2);
    b.inhale(); run(b, 3.2); b.exhale(); run(b, 0.4);
    const a0 = Math.atan2(b.mx - b.base.x, b.mz - b.base.z);
    run(b, 1.8);
    const a1 = Math.atan2(b.mx - b.base.x, b.mz - b.base.z);
    expect(Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)))).toBeGreaterThan(0.5);
  });
  it('shake lasts ~2 s with shaking 0..1', () => {
    const b = make(); b.forceIdle(); run(b, 1);
    b.shake(); run(b, 1); expect(b.shaking).toBeGreaterThan(0.9);
    let max = 0; for (let k = 0; k < 60; k++) { b.update(1 / 60, 0); max = Math.max(max, b.shaking); }
    expect(max).toBeLessThanOrEqual(1);
    run(b, 0.2); expect(b.state).toBe(B.IDLE); expect(b.shaking).toBe(0);
  });
  it('roar then idle; release exhales, lowers and rests with the eyes dim', () => {
    const b = make(); b.forceIdle(); run(b, 1);
    b.roar(); run(b, 1); expect(b.state).toBe(B.ROAR); run(b, BELL_T.roar); expect(b.state).toBe(B.IDLE);
    run(b, 1);
    const eyeIdle = b.pose[7];
    b.release(); run(b, BELL_T.releaseExhale - 0.3); expect(b.state).toBe(B.RELEASE);
    run(b, BELL_T.releaseLower + 1); expect(b.state).toBe(B.RESTED);
    run(b, 3);
    expect(b.pose[7]).toBeLessThan(eyeIdle * 0.3);
    expect(b.hy - MANOR.y).toBeLessThan(10);
  });
  it('reset returns to DORMANT at once', () => {
    const b = make(); b.forceIdle(); run(b, 4); b.openValve(0); b.climbed = true;
    const dormant = make();
    b.reset();
    expect(b.state).toBe(B.DORMANT); expect(b.climbed).toBe(false); expect(b.valvesOpen).toBe(0); expect(b.shaking).toBe(0);
    expect(Math.abs(b.hy - dormant.hy)).toBeLessThan(0.6);
    expect(Math.abs(b.hx - dormant.hx)).toBeLessThan(0.6);
  });
  it('probe sees the body; rayOut leaves it', () => {
    const b = make(); b.forceIdle(); run(b, 4);
    b.neckEval(6, 0, 0);
    b.qx = b.sc[0]; b.qy = b.sc[1]; b.qz = b.sc[2];
    expect(b.probe()).toBe(true);
    b.qx += 80; expect(b.probe()).toBe(false);
    b.rox = b.sc[0]; b.roy = b.sc[1]; b.roz = b.sc[2]; b.rdx = b.sn[0]; b.rdy = b.sn[1]; b.rdz = b.sn[2];
    b.neckEval(6, 0, 0); b.rox = b.sc[0]; b.roy = b.sc[1]; b.roz = b.sc[2]; b.rdx = b.sn[0]; b.rdy = b.sn[1]; b.rdz = b.sn[2];
    b.rnear = 1e9; b.rfar = 1e9;
    expect(b.rayOut()).toBeGreaterThan(neckRadius(6) * 0.7);
  });
});

describe('neck climb', () => {
  function rig() {
    const b = make(); b.forceIdle(); run(b, 4);
    let focus = 100;
    const c = createNeckClimb({ bell: b });
    c.spend = (v) => { if (focus < v) return false; focus -= v; return true; };
    return { b, c, get focus() { return focus; }, set focus(v) { focus = v; } };
  }
  const step = (r, n, set) => { for (let k = 0; k < n; k++) { if (set) set(); r.c.dt = 1 / 60; r.c.update(); r.b.update(1 / 60, 0); } };
  it('mounts near the neck, climbs toward the head, stays on the surface', () => {
    const r = rig();
    r.b.neckEval(4, 0.3, 0);
    // Stand just beside the surface.
    r.c.px = r.b.sp[0] + r.b.sn[0] * 0.8; r.c.py = r.b.sp[1] - 1.1; r.c.pz = r.b.sp[2] + r.b.sn[2] * 0.8; r.c.grip = true;
    step(r, 1);
    expect(r.c.climbing).toBe(true); expect(r.b.climbed).toBe(true);
    const s0 = r.c.s;
    step(r, 60 * 6, () => { r.c.mz = 1; r.c.mx = 0; r.focus = 100; });
    expect(r.c.s).toBeGreaterThan(s0 + 2);
    r.b.neckEval(r.c.s, r.c.th, 0);
    expect(Math.hypot(r.c.x - r.b.sp[0], r.c.y - r.b.sp[1], r.c.z - r.b.sp[2])).toBeLessThan(0.6);
    expect(r.c.holds.every(Number.isFinite)).toBe(true);
  });
  it('reaches a valve from the neck', () => {
    const r = rig();
    r.b.neckEval(VALVE_S[1], VALVE_TH[1] * 0.85, 0);
    r.c.px = r.b.sp[0] + r.b.sn[0] * 0.8; r.c.py = r.b.sp[1] - 1.1; r.c.pz = r.b.sp[2] + r.b.sn[2] * 0.8; r.c.grip = true;
    step(r, 1);
    let near = -1;
    step(r, 60, () => { r.c.mx = 0; r.c.mz = 0.3; r.focus = 100; if (r.c.nearValve >= 0) near = r.c.nearValve; });
    expect(near).toBe(1);
  });
  // On a tube, steering by the camera's right each move stops at the silhouette: held A/D could not pass it, so the valve
  // on the far flank (valve 0, with the climb up the other side) was out of reach at most camera angles.
  describe('round the neck', () => {
    const atS = (r, s, th, yaw) => {
      r.c.mode = 1; r.c.s = s; r.c.th = th; r.c.grip = true; r.c.crx = Math.cos(yaw); r.c.crz = -Math.sin(yaw); r.c.regrip();
    };
    const heading = (r, s) => { r.b.neckEval(s, 0, 0); return Math.atan2(r.b.st[0], r.b.st[2]); };
    for (const off of [0, 0.8, 1.57, 2.4, 3.14, -1.57]) {
      it('a held key goes all the way round, past the silhouette, with the camera ' + off + ' off the neck', () => {
        const r = rig(), yaw = heading(r, VALVE_S[0]) + off;
        let far = 0;
        for (const mx of [1, -1]) {
          atS(r, VALVE_S[0], -2, yaw); r.c._key = 0;
          let reversals = 0, last = r.c.th, dir = 0, top = r.c.th;
          step(r, 60 * 24, () => {
            r.focus = 100; r.c.mx = mx; r.c.mz = 0;
            if (Math.abs(r.c.th - last) > 0.05) { const sg = Math.sign(r.c.th - last); if (dir && sg !== dir) reversals++; dir = sg; last = r.c.th; }
            if (r.c.th > top) top = r.c.th;
          });
          expect(reversals).toBe(0);
          far = Math.max(far, top);
        }
        expect(far).toBeGreaterThan(VALVE_TH[0]);   // one of A and D carries it right over the top to the far flank
      });
    }
    it('A undoes D on the side the camera sees: the way is taken anew at each press', () => {
      const r = rig(); atS(r, 6, 0, heading(r, 6));
      step(r, 60 * 2, () => { r.focus = 100; r.c.mx = 1; r.c.mz = 0; });
      const way = Math.sign(r.c.th);
      expect(Math.abs(r.c.th)).toBeGreaterThan(0.1); expect(Math.abs(r.c.th)).toBeLessThan(1);
      step(r, 30, () => { r.focus = 100; r.c.mx = 0; });
      const th = r.c.th;
      step(r, 60 * 3, () => { r.focus = 100; r.c.mx = -1; });
      expect(Math.sign(r.c.th - th)).toBe(-way);
    });
    it('from the top of the neck the last valve is reached by the hint alone: down, then round', () => {
      const r = rig(); r.b.openValve(1); r.b.openValve(2);
      atS(r, 13, -1, heading(r, 13) + 1.57);
      const ways = new Set();
      let mx = 1, near = -1;
      for (let k = 0; k < 60 * 90 && near < 0; k++) {
        r.focus = 100;
        const w = r.c.valveWay; ways.add(w);
        r.c.mz = w === VALVE_WAY.UP ? 1 : w === VALVE_WAY.DOWN ? -1 : 0;
        const th0 = r.c.th;
        r.c.mx = w === VALVE_WAY.ROUND ? mx : 0;
        r.c.dt = 1 / 60; r.c.update(); r.b.update(1 / 60, 0);
        if (w === VALVE_WAY.ROUND && Math.abs(r.c.th) >= 2.29 && th0 === r.c.th) mx = -mx;   // a flank's end: the other key
        near = r.c.nearValve;
        expect(r.c.climbing).toBe(true);
      }
      expect(near).toBe(0);
      expect(ways.has(VALVE_WAY.DOWN)).toBe(true);
    });
  });
  it('a shake drains focus fast and throws the Wraith off when it runs out', () => {
    const r = rig();
    r.b.neckEval(5, 0, 0);
    r.c.px = r.b.sp[0] + r.b.sn[0] * 0.8; r.c.py = r.b.sp[1] - 1.1; r.c.pz = r.b.sp[2] + r.b.sn[2] * 0.8; r.c.grip = true;
    step(r, 1);
    expect(r.c.climbing).toBe(true);
    r.focus = 25; r.b.shake();
    let fell = 0;
    step(r, 120, () => { if (r.c.fell && !fell) fell = r.c.fell; });
    expect(fell).toBe(1); expect(r.c.climbing).toBe(false); expect(r.b.climbed).toBe(false);
  });
  it('rides the neck: the pelvis follows the surface as it sways', () => {
    const r = rig();
    r.b.neckEval(5, 0, 0);
    r.c.px = r.b.sp[0] + r.b.sn[0] * 0.8; r.c.py = r.b.sp[1] - 1.1; r.c.pz = r.b.sp[2] + r.b.sn[2] * 0.8; r.c.grip = true;
    step(r, 1);
    const p0 = [r.c.x, r.c.y, r.c.z];
    r.b.inhale(); step(r, 180, () => { r.focus = 100; });
    expect(Math.hypot(r.c.x - p0[0], r.c.y - p0[1], r.c.z - p0[2])).toBeGreaterThan(0.3);
    r.b.neckEval(r.c.s, r.c.th, 0);
    expect(Math.hypot(r.c.x - r.b.sp[0], r.c.y - r.b.sp[1], r.c.z - r.b.sp[2])).toBeLessThan(0.6);
  });
});
