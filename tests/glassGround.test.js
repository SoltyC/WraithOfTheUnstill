import { describe, it, expect } from 'vitest';
import { glassSites } from '../src/world/glassKit.js';
import { BRUSH } from '../src/shaders/terrainState.wgsl.js';
import { TRANSFORM } from '../src/terrain/state/layout.js';

describe('glass ground', () => {
  it('every glass site carries the radius of the ground fused round it', () => {
    const s = glassSites({});
    expect(s.length).toBe(40);
    for (const g of s) { expect(g.glassR).toBeGreaterThan(1); expect(g.glassR).toBeLessThan(9); }
    // the hearts are the widest
    const hearts = s.filter((g) => g.id.endsWith('-heart'));
    expect(Math.min(...hearts.map((g) => g.glassR))).toBeGreaterThan(Math.max(...s.filter((g) => !g.id.endsWith('-heart')).map((g) => g.glassR)) - 1);
  });
  it('the brush and the transform id exist', () => { expect(BRUSH.GLASS).toBe(10); expect(TRANSFORM.GLASS).toBe(2); });
});
