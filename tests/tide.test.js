import { describe, it, expect } from 'vitest';
import { createTideBending, surgeTuning, undertowTuning, envelope } from '../src/game/bending/tide.js';
import { createTideHits } from '../src/game/combat/tideHits.js';
import { BRUSH } from '../src/shaders/terrainState.wgsl.js';

function rig() {
  const stamps = [];
  const ts = { bx: 0, bz: 0, bdx: 0, bdz: 0, bl: 0, bw: 0, bd: 0, bc: 0, bk: 0, bwet: 0, bbias: 0, bberm: 0, stamp() { stamps.push({ k: this.bk, wet: this.bwet, d: this.bd, x: this.bx, z: this.bz }); } };
  const ground = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
  const tide = createTideBending({ ts, ground, lights: new Float32Array(32) });
  Object.assign(tide, { x: 0, y: 0, z: 0, aimX: 0, aimZ: 1, tx: 0, ty: 0, tz: 8, time: 0 });
  const step = (t, f = () => {}) => { for (let k = 0; k < t * 60; k++) { f(k); tide.dt = 1 / 60; tide.time += 1 / 60; tide.update(); } };
  return { tide, stamps, step };
}

describe('Tide', () => {
  it('Surge: a rolling wave that travels, soaks what it crosses, and is a sound at its front', () => {
    const { tide, stamps, step } = rig();
    tide.castSurge = true; step(0.5);
    expect(tide.surgeActive.some((a) => a)).toBe(true);
    const k = tide.surgeActive.findIndex((a) => a);
    expect(tide.surgeFZ[k]).toBeGreaterThan(surgeTuning.speed * 0.5 * 0.9);         // travelled along the aim
    expect(stamps.some((s) => s.k === BRUSH.WET && s.wet > 0.5)).toBe(true);          // soaked the ground
    expect(tide.noiseLevel).toBeGreaterThan(0.42);                                   // louder than a walk, where its front is
    expect(tide.noiseZ).toBeCloseTo(tide.surgeFZ[k], 6);
    step(2); expect(tide.surgeActive.some((a) => a)).toBe(false);                    // and it ends
  });
  it('Draw: gathers while held, and the release throws it as a stronger Surge', () => {
    const { tide, step } = rig();
    tide.drawHeld = true; step(1.5);
    expect(tide.drawMass).toBe(1);
    tide.drawHeld = false; step(1 / 60);
    const k = tide.surgeActive.findIndex((a) => a);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(tide.surgeK[k]).toBeGreaterThan(1.5);
  });
  it('Undertow: a whirlpool that rises, holds, dies away, and leaves a basin', () => {
    const { tide, stamps, step } = rig();
    tide.castUndertow = true; step(1);
    expect(tide.undertowStrength).toBeGreaterThan(0.9);
    expect(stamps.some((s) => s.k === BRUSH.CRATER && s.d > 0.2)).toBe(true);
    step(undertowTuning.life); expect(tide.undertowStrength).toBe(0);
    expect(envelope(-1)).toBe(0);
  });
  it('a Surge soaks and shoves a Shaped, once a wave', () => {
    const { tide, step } = rig();
    const body = { vx: 0, vz: 0 }, slot = { wet: 0, body };
    const shaped = { slots: [slot], isLive: () => true };
    let hits = 0;
    const hits$ = createTideHits({ shaped, tide, strike: () => { hits++; }, flow: null, FLOW_EVENT: {}, tuning: { surgeDamage: 7, surgeShove: 9, drawCrumble: 30 }, maxShaped: 1 });
    tide.castSurge = true;
    step(1.5, () => hits$.hit(0, 0, 6, 1 / 60));
    expect(hits).toBe(1);
    expect(slot.wet).toBeGreaterThan(0);
    expect(body.vz).toBeGreaterThan(0);
  });
});
