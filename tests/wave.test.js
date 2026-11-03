import { describe, it, expect } from 'vitest';
import { across, faceOffset, wavePoint, ihash } from '../src/game/wave.js';
import { releaseShots } from '../src/game/release.js';

describe('the wave', () => {
  it('hashes as WGSL does (lowbias32)', () => {
    expect(ihash(0)).toBe(0);
    expect(ihash(1)).toBe(ihash(1));
    expect(ihash(100000)).not.toBe(ihash(100001));
  });
  it('stays a breaking wave across the hall: crest high, lip ahead of the face, front within a few metres', () => {
    for (let z = -45; z <= 45; z += 3) {
      const [lag, reach, hs] = across(z);
      expect(Math.abs(lag)).toBeLessThan(5); expect(reach).toBeGreaterThan(0.4); expect(hs).toBeGreaterThan(0.85);
      const crest = wavePoint(4 / 14, z, 0), lip = wavePoint(6 / 14, z, 0), face = faceOffset(z, 9);
      expect(crest[1]).toBeGreaterThan(17);
      expect(lip[0]).toBeLessThan(face);   // the lip is pitched out ahead (towards −x) of the face
    }
  });
  it('puts Sefa\'s hand just short of the water', () => {
    const { shots } = releaseShots();
    const sh = shots.find((s) => s.sefa && s.sefa.reach && s.wave && !Array.isArray(s.wave.front));
    const h = sh.sefa.reach, faceX = sh.wave.front + faceOffset(h[2], h[1]);
    expect(faceX - h[0]).toBeGreaterThan(0.05); expect(faceX - h[0]).toBeLessThan(0.3);
  });
});
