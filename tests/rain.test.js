import { describe, it, expect } from 'vitest';
import { createWeather } from '../src/world/weather.js';
import { resolveState } from '../src/world/weatherStates.js';
import { createLightning, thunderDelay, thunderGain, SOUND_SPEED } from '../src/world/lightning.js';
import { buildBolt, MAX_SEGMENTS } from '../src/world/boltShape.js';

const step = (w, seconds, dt = 0.1) => { for (let t = 0; t < seconds; t += dt) { w.dt = dt; w.update(); } };
const meadow = (override) => { const w = createWeather(); w.restored = 1; w.meadowRestored = 1; w.meadow = 1; w.override = override; w.snap = true; w.dt = 0; w.update(); return w; };

describe('weather: rain and storm (meadow)', () => {
  it('a restored meadow holds rain and storm, with the storm darker, windier and gustier', () => {
    const r = meadow('rain'), s = meadow('storm');
    expect(r.state).toBe('rain'); expect(s.state).toBe('storm');
    expect(r.rain).toBeGreaterThan(0.4); expect(r.storm).toBe(0);
    expect(s.rain).toBe(1); expect(s.storm).toBe(1);
    expect(s.cover).toBeGreaterThanOrEqual(r.cover); expect(s.wind).toBeGreaterThan(r.wind); expect(s.gust).toBeGreaterThan(r.gust);
    expect(r.snow).toBe(0);
  });
  it('a stilled meadow keeps only clear and still overcast: forced rain or storm fall back', () => {
    for (const name of ['rain', 'storm', 'thunderstorm']) {
      const w = createWeather(); w.restored = 1; w.meadowRestored = 0; w.meadow = 1; w.override = name; w.snap = true; w.update();
      expect(w.state).toBe('overcast'); expect(w.rain).toBe(0); expect(w.storm).toBe(0); expect(w.gust).toBe(0);
    }
    expect(resolveState('rain', 'meadow', false)).toBe('overcast');
    expect(resolveState('clear', 'meadow', false)).toBe('clear');
  });
  it('maps states across biomes: no rain in the frost, no snow in the meadow', () => {
    expect(resolveState('rain', 'frost', true)).toBe('snowfall');
    expect(resolveState('storm', 'frost', true)).toBe('blizzard');
    expect(resolveState('blizzard', 'meadow', true)).toBe('storm');
    expect(resolveState('cloudy', 'meadow', true)).toBe('overcast');
    const f = createWeather(); f.restored = 1; f.meadow = 0; f.override = 'rain'; f.snap = true; f.update();
    expect(f.rain).toBe(0); expect(f.snow).toBeGreaterThan(0.4);
  });
  it('the frost-meadow border blends snow through sleet to rain by the meadow weight', () => {
    const at = (b, name) => { const w = createWeather(); w.restored = 1; w.meadowRestored = 1; w.meadow = b; w.override = name; w.snap = true; w.update(); return w; };
    const snowy = [0, 0.5, 1].map((b) => at(b, 'snowfall'));
    expect(snowy[0].snow).toBeGreaterThan(snowy[1].snow); expect(snowy[1].snow).toBeGreaterThan(snowy[2].snow);
    expect(snowy[2].snow).toBe(0);
    // Sleet: at the border both fall; in the pure biomes only one does.
    expect(snowy[1].snow).toBeGreaterThan(0); expect(snowy[1].rain).toBeGreaterThan(0);
    expect(snowy[0].rain).toBe(0);
    // The meadow's own rain is gone in the frost (snow there instead).
    expect(at(1, 'rain').rain).toBeGreaterThan(0.5); expect(at(0, 'rain').rain).toBe(0);
  });
  it('eases in over tens of seconds without popping', () => {
    const w = meadow('clear'); w.override = 'storm';
    let prev = w.rain, jump = 0;
    for (let i = 0; i < 600; i++) { w.dt = 0.1; w.update(); jump = Math.max(jump, Math.abs(w.rain - prev)); prev = w.rain; }
    expect(w.rain).toBeGreaterThan(0.95); expect(jump).toBeLessThan(0.01);
    const v = meadow('clear'); v.override = 'storm'; step(v, 10);
    expect(v.rain).toBeGreaterThan(0.2); expect(v.rain).toBeLessThan(0.75);
  });
  it('the restored meadow cycle brings rain and the occasional storm, deterministically', () => {
    const run = () => {
      const w = createWeather(); w.restored = 1; w.meadowRestored = 1; w.meadow = 1; w.snap = true;
      const seen = new Set(); let storms = 0, was = false;
      for (let i = 0; i < 4 * 3600; i++) { w.dt = 1; w.update(); seen.add(w.state); const s = w.state === 'storm'; if (s && !was) storms++; was = s; }
      return { seen: [...seen].sort(), storms };
    };
    const a = run();
    expect(a.seen).toEqual(['clear', 'overcast', 'rain', 'storm']);
    expect(a.storms).toBeGreaterThanOrEqual(2); expect(a.storms).toBeLessThanOrEqual(8);
    expect(run()).toEqual(a);
  });
});

describe('wetness', () => {
  it('rain soaks the world, puddles fill slower, and both dry back after it stops', () => {
    const w = meadow('clear'); w.override = 'rain';
    step(w, 30);
    const wet30 = w.wet, pud30 = w.puddle;
    expect(wet30).toBeGreaterThan(0.4);
    step(w, 200);
    expect(w.wet).toBeGreaterThan(0.85); expect(w.puddle).toBeGreaterThan(pud30);
    const full = w.wet;
    w.override = 'clear'; step(w, 30);
    // Still wet: the rain has gone but the ground dries over minutes.
    expect(w.wet).toBeGreaterThan(0.35);
    step(w, 400);
    expect(w.wet).toBeLessThan(0.05); expect(w.puddle).toBeLessThan(0.1);
    expect(full).toBeGreaterThan(w.wet);
  });
  it('a storm floods more than a drizzle, and a captured rain shot is already wet', () => {
    const r = meadow('rain'), s = meadow('storm');
    expect(r.wet).toBeGreaterThan(0.8); expect(s.puddle).toBeGreaterThan(r.puddle);
    expect(meadow('clear').wet).toBe(0);
  });
});

describe('thunder and lightning', () => {
  it('thunder is delayed by distance at the speed of sound and quieter far away', () => {
    expect(SOUND_SPEED).toBe(343);
    expect(thunderDelay(343)).toBeCloseTo(1, 6); expect(thunderDelay(3430)).toBeCloseTo(10, 6);
    expect(thunderGain(200)).toBeGreaterThan(thunderGain(2000)); expect(thunderGain(2000)).toBeGreaterThan(thunderGain(6000));
    expect(thunderGain(0)).toBe(1);
  });
  it('a strike flashes first and thunder reaches the camera after distance / 343 s', () => {
    const L = createLightning(); L.dt = 0.01; L.camX = 0; L.camZ = 0; L.camY = 5; L.storm = 1;
    const heard = []; L.onThunder = (d, g) => heard.push({ d, g, t: L.time });
    L.strike(0.3, 1715, 3, false);
    let flashSeen = 0;
    for (let i = 0; i < 700; i++) { L.update(); if (L.flash > 0.01) flashSeen++; }
    expect(flashSeen).toBeGreaterThan(3);
    expect(heard.length).toBe(1);
    expect(heard[0].t).toBeGreaterThan(1715 / 343 - 0.02); expect(heard[0].t).toBeLessThan(1715 / 343 + 0.03);
    expect(heard[0].d).toBeCloseTo(1715, 3);
  });
  it('strikes are seeded: the same storm repeats, rarely, and only while it storms', () => {
    const run = (storm) => {
      const L = createLightning(); L.dt = 0.1; L.storm = storm; const at = [];
      for (let i = 0; i < 6000; i++) { const v = L.version; L.update(); if (L.version !== v) at.push(i); }
      return at;
    };
    const a = run(1), b = run(1);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(8); expect(a.length).toBeLessThan(60);
    expect(run(0.1)).toEqual([]);
  });
  it('a held strike keeps its envelope and the flash points the key toward the bolt', () => {
    const L = createLightning(); L.camX = 0; L.camZ = 0; L.camY = 2; L.dt = 0.1;
    L.strike(Math.PI / 2, 900, 9, true); L.age = 0.04; L.shape();
    const f = L.flash; for (let i = 0; i < 20; i++) L.update();
    expect(L.age).toBe(0.04); expect(L.flash).toBeCloseTo(f, 9); expect(f).toBeGreaterThan(0.2);
    expect(L.dirX).toBeGreaterThan(0.7); expect(L.dirY).toBeGreaterThan(0.2); expect(Math.hypot(L.dirX, L.dirY, L.dirZ)).toBeCloseTo(1, 6);
  });
  it('the bolt runs from the cloud to the ground in connected, bounded segments', () => {
    const out = new Float32Array(MAX_SEGMENTS * 8);
    const n = buildBolt(5, 100, 1000, 200, 0, 10, 0, out);
    expect(n).toBeGreaterThan(64); expect(n).toBeLessThanOrEqual(MAX_SEGMENTS);
    // The main channel (the first 64 segments) is continuous, top to ground.
    expect(out[0]).toBe(100); expect(out[1]).toBe(1000);
    for (let s = 1; s < 64; s++) { expect(out[s * 8]).toBe(out[(s - 1) * 8 + 4]); expect(out[s * 8 + 2]).toBe(out[(s - 1) * 8 + 6]); }
    expect(out[63 * 8 + 5]).toBeCloseTo(10, 3);
    const out2 = new Float32Array(MAX_SEGMENTS * 8); buildBolt(5, 100, 1000, 200, 0, 10, 0, out2);
    expect(Array.from(out2)).toEqual(Array.from(out));
  });
});
