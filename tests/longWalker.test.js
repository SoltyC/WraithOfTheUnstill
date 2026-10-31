import { describe, it, expect } from 'vitest';
import { createWalker, WK, WEV, MODE, RIPPLE, SIDE, HIP_Z, PILLARS, walkerTuning } from '../src/game/walker/walker.js';
import { createDeck } from '../src/game/walker/deck.js';
import { CapsuleController } from '../src/character/capsuleController.js';
import { trackPrints, nextPrint, circuitTarget, CIRCUIT, WALKER_SEAT } from '../src/game/walker/route.js';

/** Flat ground (or a drop beyond x > cliff). */
function flat(cliff = Infinity) {
  return { qx: 0, qz: 0, h: 0, nx: 0, ny: 1, nz: 0, sample() { this.h = this.qx > cliff ? -60 : 0; }, sampleNormal() { this.sample(); this.nx = 0; this.ny = 1; this.nz = 0; }, covers() { return true; } };
}
function setup(cliff) {
  const ground = flat(cliff), w = createWalker({ ground }), deck = createDeck(w);
  deck.on = true;
  return { ground, w, deck };
}
const run = (w, secs, each) => { for (let i = 0; i < Math.round(secs * 60); i++) { w.update(1 / 60); each?.(i); } };

describe('the Long Walker: gait', () => {
  it('walks at its pace, feet lifting in the ripple order and landing exactly where they were telegraphed', () => {
    const { w } = setup();
    w.placeWalking(0, 0, 0); w.circuitX = 0; w.circuitZ = 1e5;
    const lifts = [], planned = new Map();
    let landed = 0, off = 0;
    run(w, 40, () => {
      for (let k = 0; k < 6; k++) if (w.swing[k] > 0 && w.swing[k] < 0.02 && !planned.has(k)) { planned.set(k, [w.tx[k], w.tz[k]]); lifts.push(k); }
      for (let i = 0; i < w.landN; i++) { const k = w.landLeg[i], p = planned.get(k); off = Math.max(off, Math.hypot(w.landX[i] - p[0], w.landZ[i] - p[1])); planned.delete(k); landed++; }
    });
    expect(w.z).toBeGreaterThan(170); expect(w.z).toBeLessThan(205);
    expect(landed).toBeGreaterThan(20);
    expect(off).toBeLessThan(1e-9);
    // Once up to speed every token lifts the next leg of the ripple.
    const tail = lifts.slice(6, 18), start = RIPPLE.indexOf(tail[0]);
    expect(tail).toEqual(tail.map((_, i) => RIPPLE[(start + i) % 6]));
    expect(Array.from(w.chunks).every(Number.isFinite)).toBe(true);
    // Never more than two feet in the air.
    let most = 0; run(w, 10, () => { let n = 0; for (let k = 0; k < 6; k++) if (w.swing[k] > 0) n++; most = Math.max(most, n); });
    expect(most).toBeLessThanOrEqual(2);
  });

  it('stands its deck about 22 m up on its feet', () => {
    const { w } = setup();
    w.placeWalking(0, 0, 0.7); w.circuitX = 1e5; w.circuitZ = 1e5;
    run(w, 10);
    expect(w.y).toBeGreaterThan(20); expect(w.y).toBeLessThan(24);
  });
});

describe('the Long Walker: stumble, kneel, climb', () => {
  it('a stumble kneels it on that side for about 15 s, then it rises and walks on (and is not tripped again at once)', () => {
    const { w } = setup();
    w.placeWalking(0, 0, 0); w.circuitX = 0; w.circuitZ = 1e5; run(w, 8);
    expect(w.stumble(4)).toBe(true);
    let knelt = -1, risen = -1, t = 0;
    for (let i = 0; i < 60 * 25 && risen < 0; i++) { w.update(1 / 60); t += 1 / 60; if (w.ev & WEV.KNELT) knelt = t; if (w.ev & WEV.RISEN) risen = t; }
    expect(knelt).toBeGreaterThan(1); expect(risen - knelt).toBeGreaterThan(walkerTuning.kneelTime); expect(risen - knelt).toBeLessThan(walkerTuning.kneelTime + 4);
    expect(w.state).toBe(WK.WALK);
    expect(w.stumble(1)).toBe(false);   // immune for a few seconds after rising
  });

  it('kneeling, the right-side deck edge comes down and the kneeling leg is a ramp of plates', () => {
    const { w } = setup();
    w.placeWalking(0, 0, 0); run(w, 4); w.stumble(4); run(w, 4);
    expect(w.state).toBe(WK.KNEEL);
    expect(w.y).toBeLessThan(12);
    let ramps = 0; for (let i = 0; i < w.nBox; i++) if (w.bon[i] && w.by0[i] > -29 && w.bc[i] !== 1) ramps++;
    expect(ramps).toBeGreaterThan(8);
  });

  it('the Wraith can walk from the sand up the kneeling leg and the flank stair onto its back', () => {
    const { ground, w, deck } = setup();
    w.placeWalking(0, 0, 0); run(w, 4); const leg = 4; w.stumble(leg); run(w, 4);
    const c = new CapsuleController(ground); c.deck = deck;
    // Waypoints in the body's frame: beyond the knee → along the leg to the flank → up the stair → in at the gap.
    const k = [0, 0, 0]; w.toLocal(w.kx[leg], w.ky[leg], w.kz[leg], k);
    const s = SIDE[leg], top = HIP_Z[leg] - 0.5 - 0.85 * 6;
    const wps = [[k[0] + s * 5, k[2]], [k[0], k[2]], [s * 12.9, HIP_Z[leg]], [s * 12.9, top], [s * 9, top], [0, 0]];
    const out = [0, 0, 0];
    w.toWorld(wps[0][0], 0, wps[0][1], out); c.teleport(out[0], out[2]);
    let wi = 1, frames = 0, best = -1e9;
    while (wi < wps.length && frames < 60 * 30) {
      w.update(1 / 60);
      w.toWorld(wps[wi][0], 0, wps[wi][1], out);
      const dx = out[0] - c.pos.x, dz = out[2] - c.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.6) { wi++; continue; }
      c.cameraYaw = 0; c.wishX = dx / d; c.wishZ = dz / d; c.dt = 1 / 60; c.update();
      w.toLocal(c.pos.x, c.pos.y, c.pos.z, out); best = Math.max(best, out[1]);
      if (process.env.WDEBUG && frames % 30 === 0) console.log(frames, wi, w.state, out.map((v) => v.toFixed(2)).join(' '), c.grounded);
      frames++;
    }
    expect(wi).toBe(wps.length);
    w.toLocal(c.pos.x, c.pos.y, c.pos.z, out);
    expect(Math.abs(out[1])).toBeLessThan(0.15);   // standing on the court's floor
    expect(deck.riding).toBe(true);
  });
});

describe('the Long Walker: riding', () => {
  it('carries a Wraith standing in its court as it walks and turns, and the walls hold it', () => {
    const { ground, w, deck } = setup();
    w.placeWalking(0, 0, 0); w.circuitX = 0; w.circuitZ = 1e5; run(w, 6);
    const c = new CapsuleController(ground); c.deck = deck;
    const out = [0, 0, 0]; w.toWorld(4, 0, 6, out);
    c.teleport(out[0], out[2], out[1]); deck.riding = true;
    for (let i = 0; i < 60 * 30; i++) {
      if (i === 60 * 10) { w.mode = MODE.STEER; w.targetYaw = 1.2; }
      w.update(1 / 60);
      c.wishX = 0; c.wishZ = 0; c.dt = 1 / 60; c.update();
    }
    w.toLocal(c.pos.x, c.pos.y, c.pos.z, out);
    expect(Math.hypot(out[0] - 4, out[2] - 6)).toBeLessThan(0.6);
    expect(Math.abs(out[1])).toBeLessThan(0.15);
    expect(deck.riding).toBe(true);
    // Running at a side wall for 3 s (away from its openings): it stays inside the court.
    w.toWorld(4, 0, 1, out); c.teleport(out[0], out[2], out[1]); deck.riding = true;
    for (let i = 0; i < 180; i++) { w.update(1 / 60); c.cameraYaw = w.yaw; c.wishX = 1; c.wishZ = 0; c.dt = 1 / 60; c.update(); }
    w.toLocal(c.pos.x, c.pos.y, c.pos.z, out);
    expect(out[0]).toBeLessThan(11.1); expect(Math.abs(out[1])).toBeLessThan(0.15);
  });

  it('jumping off keeps the stride (the deck velocity is handed over)', () => {
    const { ground, w, deck } = setup();
    w.placeWalking(0, 0, 0); w.circuitX = 0; w.circuitZ = 1e5; run(w, 10);
    const c = new CapsuleController(ground); c.deck = deck;
    const out = [0, 0, 0]; w.toWorld(0, 0, -16, out); c.teleport(out[0], out[2], out[1]); deck.riding = true;
    for (let i = 0; i < 30; i++) { w.update(1 / 60); c.dt = 1 / 60; c.update(); }
    expect(deck.riding).toBe(true);
    // Step off the back edge: run backward out through... simply place it beyond the edge in the air.
    c.pos.y += 0.5; w.toWorld(0, 2, -20.5, out); c.pos.x = out[0]; c.pos.z = out[2]; c.grounded = false;
    w.update(1 / 60); c.dt = 1 / 60; c.update();
    expect(deck.riding).toBe(false);
    expect(c.vel.z).toBeGreaterThan(3);
  });

  it('a glyph pillar turns it toward its side; steered at a drop it balks and goes back to its circuit', () => {
    const { w } = setup(260);
    w.placeWalking(0, 0, Math.PI / 2); w.circuitX = -1e5; w.circuitZ = 0; run(w, 4);
    w.steer(1); expect(w.mode).toBe(MODE.STEER); const t0 = w.targetYaw; w.steer(-1); w.steer(-1);
    expect(w.targetYaw).toBeCloseTo(t0 - walkerTuning.steerStep * 2, 6);
    w.targetYaw = Math.PI / 2;
    let balked = false; run(w, 60, () => { if (w.ev & WEV.BALK) balked = true; });
    expect(balked).toBe(true); expect(w.x).toBeLessThan(260);
    expect(w.mode).toBe(MODE.CIRCUIT);
    void PILLARS;
  });
});

describe('the Long Walker: home and release', () => {
  it('near the well it turns home and kneels; released it lies down and becomes a dune range', () => {
    const { w } = setup();
    w.setWell(0, -0.4, 0, 2.4);
    w.placeWalking(90, 40, -1.4); w.mode = MODE.STEER; w.targetYaw = -1.4;
    let home = false; run(w, 120, () => { if (w.ev & WEV.HOME) home = true; });
    expect(home).toBe(true); expect(w.state).toBe(WK.HOME);
    // Its neck's root on the gate's axis, 20 m out; the body slanted off the axis.
    const root = w.toWorld(0, 0, 18, [0, 0, 0]);
    const along = root[0] * Math.sin(2.4) + root[2] * Math.cos(2.4), across = root[0] * Math.cos(2.4) - root[2] * Math.sin(2.4);
    expect(Math.abs(along - walkerTuning.homeRoot)).toBeLessThan(3.5); expect(Math.abs(across)).toBeLessThan(3.5);
    w.release(); let rested = false; run(w, 20, () => { if (w.ev & WEV.RESTED) rested = true; });
    expect(rested).toBe(true); expect(w.state).toBe(WK.RESTED); expect(w.y).toBeLessThan(1);
    expect(Array.from(w.chunks).every(Number.isFinite)).toBe(true);
  });

  it('buried, it lies low under its mound; woken it rises out of the dune to walking height', () => {
    const { w } = setup();
    w.placeBuried(0, 0, 0); run(w, 2);
    expect(w.y).toBeLessThan(1); expect(w.state).toBe(WK.BURIED);
    w.wake(); let woken = false; run(w, 12, () => { if (w.ev & WEV.WOKEN) woken = true; });
    expect(woken).toBe(true); expect(w.state).toBe(WK.WALK); expect(w.y).toBeGreaterThan(18);
  });
});

describe('the glass track', () => {
  it('prints run round the circuit and the compass leads from print to print to the Walker', () => {
    const pr = trackPrints();
    expect(pr.length).toBeGreaterThan(25);
    expect(Math.hypot(pr[0][0] - WALKER_SEAT[0], pr[0][1] - WALKER_SEAT[1])).toBeLessThan(140);
    // Standing on print 5, the next is print 4; on print 0, the Walker itself (null).
    expect(nextPrint(pr, { x: pr[5][0], z: pr[5][1] })).toBe(pr[4]);
    expect(nextPrint(pr, { x: pr[0][0], z: pr[0][1] })).toBe(null);
    // Far away: the nearest print.
    expect(nextPrint(pr, { x: 1800, z: 700 })).toBeTruthy();
    const out = [0, 0]; circuitTarget(CIRCUIT[3][0] + 5, CIRCUIT[3][1], out);
    expect(Math.hypot(out[0] - CIRCUIT[3][0], out[1] - CIRCUIT[3][1])).toBeGreaterThan(20);
  });
});
