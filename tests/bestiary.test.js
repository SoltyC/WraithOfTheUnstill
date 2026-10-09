import { describe, it, expect } from 'vitest';
import { takeSketch, sketchSvg } from '../src/game/bestiary.js';

describe('bestiary', () => {
  it('sketches visible chunks side-on and draws them as SVG', () => {
    const c = new Float32Array(3 * 16);
    const put = (k, x, y, z, s, alpha) => { const o = k * 16; c[o] = x; c[o + 1] = y; c[o + 2] = z; c[o + 3] = s; c[o + 4] = 0; c[o + 5] = 0; c[o + 6] = 1; c[o + 7] = s; c[o + 8] = 0; c[o + 9] = 1; c[o + 10] = 0; c[o + 11] = s; c[o + 15] = alpha; };
    put(0, 10, 1, 21, 0.5, 1); put(1, 10, 2, 22, 0.3, 1); put(2, 10, 2, 22, 0.3, 0);
    const sk = takeSketch(c, 0, 3, 10, 0, 20, 0);
    expect(sk.length).toBe(12);                  // the hidden chunk is left out
    expect(sk[0]).toBeCloseTo(-0.5, 2); expect(sk[1]).toBeCloseTo(1, 2); // along the body's long axis from its middle; up = y − ground
    const svg = sketchSvg(sk);
    expect(svg.startsWith('<svg')).toBe(true);
    expect((svg.match(/<path/g) || []).length).toBeGreaterThanOrEqual(3);
    expect((svg.match(/L/g) || []).length).toBeGreaterThan(20); // the traced silhouette's strokes
  });
});
