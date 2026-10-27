import { describe, it, expect } from 'vitest';
import { createRelaxationGrid, createRelaxationQueue, DRY_REPOSE, WET_REPOSE, RELAX_TILE } from '../src/terrain/state/relaxation.js';
const sum = (a) => a.reduce((x, y) => x + y, 0);
describe('conservative granular relaxation', () => {
  it('conserves signed mass and remains bounded for mixed positive and negative relief', () => {
    const g = createRelaxationGrid(19, 0.1);
    for (let i = 0; i < g.height.length; i++) g.height[i] = Math.sin(i * 137.3) * 2;
    const before = sum(g.height), lo = Math.min(...g.height), hi = Math.max(...g.height);
    g.run(1000);
    expect(sum(g.height)).toBeCloseTo(before, 10);
    expect(Math.min(...g.height)).toBeGreaterThanOrEqual(lo);
    expect(Math.max(...g.height)).toBeLessThanOrEqual(hi);
  });
  it('settles an isolated pile to dry repose, deterministically', () => {
    const a = createRelaxationGrid(17, 0.1), b = createRelaxationGrid(17, 0.1);
    a.height[144] = b.height[144] = 3;
    a.run(1500); b.run(1500);
    expect(a.height).toEqual(b.height); expect(sum(a.height)).toBeCloseTo(3, 10);
    let slope = 0;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const i = z * 17 + x;
      slope = Math.max(slope, Math.abs(a.height[i] - a.height[i + 1]) / 0.1, Math.abs(a.height[i] - a.height[i + 17]) / 0.1);
    }
    expect(slope).toBeLessThanOrEqual(DRY_REPOSE + 1e-8);
  });
  it('holds wet slopes that dry sand sheds, and respects the underlying terrain slope', () => {
    const dry = createRelaxationGrid(2, 1), wet = createRelaxationGrid(2, 1);
    dry.height[0] = wet.height[0] = 1; wet.wet.fill(1);
    dry.run(); wet.run(); expect(dry.height[0]).toBeLessThan(1); expect(wet.height[0]).toBe(1);
    expect(WET_REPOSE).toBeGreaterThan(DRY_REPOSE);
    const g = createRelaxationGrid(2, 1); g.base[0] = 2; g.run();
    expect(g.height[0]).toBeLessThan(0); expect(sum(g.height)).toBeCloseTo(0, 12);
  });
  it('does not move frozen sand, snow, mud or transformed rock through a shared edge', () => {
    for (const m of [0, 2, 3, 5]) {
      const g = createRelaxationGrid(3, 0.1); g.height[4] = 3; g.material[4] = m; g.run(100);
      expect(g.height[4]).toBe(3); expect(sum(g.height)).toBe(3);
    }
    const g = createRelaxationGrid(3, 0.1); g.height[4] = 3; g.frozen[4] = 1; g.run(100);
    expect(g.height[4]).toBe(3); expect(sum(g.height)).toBe(3);
  });
});
describe('bounded relaxation scheduling', () => {
  it('deduplicates writes, handles negative coordinates, expires and resets', () => {
    const q = createRelaxationQueue(8); q.now = 1;
    q.mark(-2, -2, -1, -1); q.mark(-2, -2, -1, -1);
    expect(q.take(-1000, -1000, 1000, 1000)).toBe(true); expect(q.pending).toBe(1);
    expect(q.x).toBeLessThan(0); expect(q.z).toBeLessThan(0);
    q.now = 6; expect(q.take(-1000, -1000, 1000, 1000)).toBe(false);
    q.mark(0, 0, 10, 10); q.reset(); expect(q.take(-1000, -1000, 1000, 1000)).toBe(false);
  });
  it('stays bounded under a huge write and discards tiles outside the fine window', () => {
    const q = createRelaxationQueue(4); q.mark(0, 0, RELAX_TILE * 4, RELAX_TILE * 4);
    expect(q.take(-1000, -1000, 1000, 1000)).toBe(true); expect(q.pending).toBe(4);
    expect(q.take(2000, 2000, 3000, 3000)).toBe(false);
  });
});
