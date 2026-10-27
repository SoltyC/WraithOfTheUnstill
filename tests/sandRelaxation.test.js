import { describe, it, expect } from 'vitest';
import { createRelaxationGrid, createRelaxationQueue, DRY_REPOSE, WET_REPOSE, RELAX_TILE, RELAX_LIFETIME, projectTalusPairs } from '../src/terrain/state/relaxation.js';
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
    const g = createRelaxationGrid(2, 1); g.base[0] = 2; g.height[0] = 0.1; g.run();
    expect(g.height[0]).toBeLessThan(0.1); expect(sum(g.height)).toBeCloseTo(0.1, 12);
  });
  it('does not erode untouched macro terrain when a restored neighbourhood wakes', () => {
    const g = createRelaxationGrid(9, 0.02);
    for (let i = 0; i < g.base.length; i++) g.base[i] = Math.sin(i) * 10;
    g.run(100);
    expect(g.height.every(h => h === 0)).toBe(true);
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
  it('wakes restored ground on approach without refreshing idle work forever', () => {
    const q = createRelaxationQueue(); q.now = 1;
    q.wake(-1, -1);
    expect(q.take(-1000, -1000, 1000, 1000)).toBe(true);
    expect(q.pending).toBe(25);
    q.now += RELAX_LIFETIME + 1;
    q.wake(-2, -2); // same negative-coordinate cell: settled idle work stays expired
    expect(q.take(-1000, -1000, 1000, 1000)).toBe(false);
    q.wake(1, 1);
    expect(q.take(-1000, -1000, 1000, 1000)).toBe(true);
    expect(q.pending).toBe(25);
    q.reset(); q.wake(1, 1); // load at the same location must wake again
    expect(q.take(-1000, -1000, 1000, 1000)).toBe(true);
  });
  it('deduplicates writes, handles negative coordinates, expires and resets', () => {
    const q = createRelaxationQueue(8); q.now = 1;
    q.mark(-2, -2, -1, -1); q.mark(-2, -2, -1, -1);
    expect(q.take(-1000, -1000, 1000, 1000)).toBe(true); expect(q.pending).toBe(1);
    expect(q.x).toBeLessThan(0); expect(q.z).toBeLessThan(0);
    q.now = 2 + RELAX_LIFETIME; expect(q.take(-1000, -1000, 1000, 1000)).toBe(false);
    q.mark(0, 0, 10, 10); q.reset(); expect(q.take(-1000, -1000, 1000, 1000)).toBe(false);
  });
  it('stays bounded under a huge write and discards tiles outside the fine window', () => {
    const q = createRelaxationQueue(4); q.mark(0, 0, RELAX_TILE * 4, RELAX_TILE * 4);
    expect(q.take(-1000, -1000, 1000, 1000)).toBe(true); expect(q.pending).toBe(4);
    expect(q.take(2000, 2000, 3000, 3000)).toBe(false);
  });
});

describe('coarse closed-form pairs',()=>{
  it('projects a pair directly to repose with equal and opposite mass',()=>{
    const g=createRelaxationGrid(2,0.25);g.height[0]=3;
    projectTalusPairs(g,false,0);
    expect(sum(g.height)).toBeCloseTo(3,12);
    expect(g.height[0]-g.height[1]).toBeCloseTo(DRY_REPOSE*0.25,12);
  });
  it('keeps paired sweeps conservative and honors wet/frozen/material barriers',()=>{
    const g=createRelaxationGrid(17,0.25);g.height[144]=3;g.height[145]=-1;g.frozen[145]=1;
    g.height[143]=2;g.material[143]=5;
    for(let i=0;i<100;i++)for(const axis of [false,true])for(const phase of [0,1])projectTalusPairs(g,axis,phase);
    expect(sum(g.height)).toBeCloseTo(4,10);expect(g.height[145]).toBe(-1);expect(g.height[143]).toBe(2);
    const wet=createRelaxationGrid(2,1);wet.wet.fill(1);wet.height[0]=1;projectTalusPairs(wet,false,0);expect(wet.height[0]).toBe(1);
  });
});
