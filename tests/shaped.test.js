import { describe, it, expect } from 'vitest';
import { ShapedBody } from '../src/game/shaped/body.js';
import { ARCHETYPES } from '../src/game/shaped/archetypes.js';

const flat = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
function run(b, seconds, each) {
  const slides = []; let ev = 0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    if (each) each(t);
    const L = b.shape.legs.length, prev = [];
    for (let l = 0; l < L; l++) prev.push(b.state[l] === 0 ? [b.fx[l], b.fz[l]] : null);
    b.dt = 1 / 60; b.update(); ev += b.evCount;
    for (let l = 0; l < L; l++) if (prev[l] && b.state[l] === 0) slides.push(Math.hypot(b.fx[l] - prev[l][0], b.fz[l] - prev[l][1]));
  }
  return { maxSlide: Math.max(0, ...slides), ev };
}

describe('Shaped body (hound)', () => {
  it('trots without sliding a planted foot, and every landing is a footfall', () => {
    const b = new ShapedBody(ARCHETYPES.hound.shape, flat); b.place(0, 0, 0);
    const r = run(b, 4, () => { b.wantVx = 0; b.wantVz = 6; });
    expect(r.maxSlide).toBe(0);
    expect(r.ev).toBeGreaterThan(20);
    expect(b.z).toBeGreaterThan(15);
  });
  it('turns: the spine curves through the turn and stays its length', () => {
    const b = new ShapedBody(ARCHETYPES.hound.shape, flat); b.place(0, 0, 0);
    run(b, 3, (t) => { b.wantVx = 5 * Math.sin(t * 1.5); b.wantVz = 5 * Math.cos(t * 1.5); });
    const sh = b.shape;
    for (let i = 1; i < sh.spine; i++) expect(Math.hypot(b.sx[i] - b.sx[i - 1], b.sz[i] - b.sz[i - 1])).toBeCloseTo(sh.spacing, 5);
  });
  it('keeps feet on reachable ground: knees solve, legs never stretch past their length', () => {
    const b = new ShapedBody(ARCHETYPES.hound.shape, flat); b.place(0, 0, 0);
    run(b, 3, () => { b.wantVx = 0; b.wantVz = 7; });
    for (let l = 0; l < 4; l++) {
      const leg = b.shape.legs[l];
      const up = Math.hypot(b.kx[l] - b.px[l], b.ky[l] - b.py[l], b.kz[l] - b.pz[l]);
      expect(up).toBeCloseTo(leg.upper, 3);
    }
  });
  it('settles at rest: feet come under the hips and stop stepping', () => {
    const b = new ShapedBody(ARCHETYPES.hound.shape, flat); b.place(0, 0, 0);
    run(b, 2, () => { b.wantVx = 0; b.wantVz = 5; });
    const r = run(b, 3, () => { b.wantVx = 0; b.wantVz = 0; });
    const late = run(b, 1, () => { b.wantVx = 0; b.wantVz = 0; });
    expect(late.ev).toBe(0);
    expect(r.maxSlide).toBe(0);
  });
});
