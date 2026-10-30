import { describe, it, expect } from 'vitest';
import { writeBrushRect } from '../src/terrain/state/brushBounds.js';
import { createRelaxationQueue, RELAX_TILE, RELAX_LIFETIME } from '../src/terrain/state/relaxation.js';
import { FINE_N, FINE_PER_M } from '../src/terrain/state/layout.js';
function bounds(x, z, dx, dz, length, width, origin = [-2046, -2046]) {
  const brush = new Float32Array([x, z, dx, dz, length, width]);
  const rect = new Int32Array(4);writeBrushRect(rect, 0, brush, 0, new Int32Array(origin));return {brush,rect};
}
describe('directional brush coverage', () => {
  it('contains every capsule point for round, rotated, negative and non-unit directions', () => {
    for (const [dx, dz] of [[1,0],[0,-1],[.6,.8],[-.8,.6],[.5,.5],[2,-.3]]) {
      for (const length of [0,7]) {
        const {brush,rect} = bounds(-3.25, 1.125, dx, dz, length, 2.95);
        for (let t = -10; t <= 10; t++) for (let i = 0; i < 64; i++) {
          const angle = i*Math.PI/32, radius = brush[5]*1.9*.999999;
          const x = brush[0]+brush[2]*brush[4]*t/10+Math.cos(angle)*radius;
          const z = brush[1]+brush[3]*brush[4]*t/10+Math.sin(angle)*radius;
          const ix = Math.floor(x*FINE_PER_M), iz = Math.floor(z*FINE_PER_M);
          expect(ix>=rect[0]&&iz>=rect[1]&&ix<rect[2]&&iz<rect[3]).toBe(true);
        }
      }
    }
  });
  it('preserves the round extent, clips the fine window, and shrinks directional work', () => {
    const round=bounds(0,0,1,0,0,2).rect;
    expect(Array.from(round)).toEqual([-183,-183,183,183]);
    const line=bounds(0,0,1,0,7,2.95).rect;
    expect(line[3]-line[1]).toBeLessThan((line[2]-line[0])*.46);
    const clipped=bounds(0,0,1,0,7,2.95,[0,0]).rect;
    expect(clipped[0]).toBe(0);expect(clipped[1]).toBe(0);
    expect(clipped[2]).toBeLessThanOrEqual(FINE_N);expect(clipped[3]).toBeLessThanOrEqual(FINE_N);
  });
  it('writes only its designated rect in shared buffers', () => {
    const out=new Int32Array(12).fill(17),brush=new Float32Array(18),origin=new Int32Array([-2046,-2046]);
    brush.set([0,0,0,1,3,1],6);writeBrushRect(out,4,brush,6,origin);
    expect(Array.from(out.slice(0,4))).toEqual([17,17,17,17]);
    expect(Array.from(out.slice(8))).toEqual([17,17,17,17]);
    expect(out[7]-out[5]).toBeGreaterThan(out[6]-out[4]);
  });
});

describe('large writer scheduling coverage', () => {
  it('retains every overlapping full-size Ridge tile and visits each before expiry', () => {
    const q=createRelaxationQueue(),expected=new Set(),seen=new Set(),stride=RELAX_TILE/2;
    q.now=1;
    for(const z of [0,4]) {
      const {rect}=bounds(0,z,1,0,7,2.95);
      q.mark(rect[0],rect[1],rect[2],rect[3]);
      for(let zz=Math.floor(rect[1]/stride);zz<=Math.floor(rect[3]/stride);zz++) {
        for(let xx=Math.floor(rect[0]/stride);xx<=Math.floor(rect[2]/stride);xx++)expected.add((xx*stride-RELAX_TILE/4)+','+(zz*stride-RELAX_TILE/4));
      }
    }
    expect(expected.size).toBeGreaterThan(64);expect(expected.size).toBeLessThanOrEqual(q.capacity);
    for(let i=0;i<expected.size;i++) {
      q.now=1+i/60;expect(q.take(-2046,-2046,2046,2046)).toBe(true);seen.add(q.x+','+q.z);
    }
    expect(seen).toEqual(expected);expect(q.pending).toBe(expected.size);
    q.now=2+RELAX_LIFETIME;expect(q.take(-2046,-2046,2046,2046)).toBe(false);
  });
});
