import { describe, it, expect } from 'vitest';
import spots from '../data/photo-spots.json';
import pois from '../data/world/pois.json';

describe('photo spots and POIs', () => {
  it('have unique ids and complete, valid fields', () => {
    const ids = new Set();
    for (const s of spots.spots) {
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(s.time).toBeGreaterThanOrEqual(0);
      expect(s.time).toBeLessThan(24);
      expect(typeof s.weather).toBe('string');
      expect(['follow', 'free']).toContain(s.camera.mode);
      if (s.camera.mode === 'free') expect(s.camera.pos).toHaveLength(3);
      else expect(s.camera.dist).toBeGreaterThan(0);
    }
    // Phase gates need dawn, noon, dusk and night coverage.
    const hours = spots.spots.map((s) => s.time);
    expect(hours.some((h) => h > 5 && h < 8)).toBe(true);
    expect(hours.some((h) => h > 11 && h < 13)).toBe(true);
    expect(hours.some((h) => h > 17 && h < 20)).toBe(true);
    expect(hours.some((h) => h >= 22 || h < 4)).toBe(true);
  });
  it('POIs have positions', () => {
    for (const p of pois.pois) expect(p.pos).toHaveLength(2);
  });
});
