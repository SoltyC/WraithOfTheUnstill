import { describe, it, expect } from 'vitest';
import { PEOPLE, newPerson, stepPerson, sayName, shakeOff, ST, DR } from '../src/game/drowned.js';
import { createNoise, noiseStep, noiseAt, hears, NOISE } from '../src/game/noise.js';
import { buildCity, createEbbholdSolids, EBB_ORIGIN as O } from '../src/world/ebbhold.js';

const S = createEbbholdSolids(buildCity());
const floorAt = (x, z, ref) => { S.qx = x + O.x; S.qz = z + O.z; S.ref = ref + O.y; S.floorQ(); return S.h - O.y; };
const free = (p, x, z) => { p.x = x; p.z = z; };
const quietNoise = () => createNoise();
const frame = { x: 0, y: 0, z: 0, speed: 0, grounded: true, quiet: false, swimming: false, landed: false, landV: 0, jumped: false, dodged: false, attacked: false };

describe('the noise', () => {
  it('is near silent at the quiet walk, heard across a room at a walk, far for a dodge', () => {
    const n = createNoise();
    noiseStep(n, { ...frame, speed: 2.2, quiet: true }, 1 / 60);
    expect(n.r).toBeLessThan(4);
    noiseStep(n, { ...frame, speed: 5.2 }, 1 / 60);
    expect(n.r).toBeGreaterThan(12);
    noiseStep(n, { ...frame, dodged: true }, 1 / 60);
    expect(n.r).toBeGreaterThan(25);
  });
  it('fades away once the body is still, and keeps where it was made', () => {
    const n = createNoise();
    noiseStep(n, { ...frame, x: 5, speed: 5.2 }, 1 / 60);
    for (let i = 0; i < 60; i++) noiseStep(n, { ...frame, x: 9 }, 1 / 60);
    expect(n.level).toBe(0);
    expect(n.x).toBe(5);
  });
  it('carries poorly between the gallery tiers', () => {
    const n = noiseAt(createNoise(), 0, 0, 0, 0.8);
    expect(hears(n, 10, 1, 0)).toBe(true);
    expect(hears(n, 10, NOISE.floor + 2, 0)).toBe(false);
  });
});

describe('the Drowned', () => {
  it('are twenty, named once each, with a register line apiece', () => {
    expect(PEOPLE.length).toBe(20);
    expect(new Set(PEOPLE.map((p) => p.name)).size).toBe(20);
    for (const d of PEOPLE) expect(d.line.startsWith(d.name === 'Ise' ? 'Old Ise' : d.name), d.id).toBe(true);
  });
  it('each stand and walk on a floor of their own tier', () => {
    for (const d of PEOPLE) {
      const pts = d.at ? [d.at] : d.path ? d.path : Array.from({ length: 8 }, (_, k) => [d.c[0] + Math.cos(k * 0.785) * d.r, d.c[1] + Math.sin(k * 0.785) * d.r]);
      for (const [x, z] of pts) expect(Math.abs(floorAt(x, z, d.y + 10) - d.y) < 10 && floorAt(x, z, d.y + 0.5) > d.y - 1.5, `${d.id} at ${x},${z}`).toBe(true);
    }
  });
  it('turn to a noise, come to it, take hold, and let go when the robe is still', () => {
    const p = newPerson(PEOPLE.find((d) => d.id === 'orla'));
    const w = { x: p.x + 6, y: 0, z: p.z, quietFor: 0 };
    const n = noiseAt(createNoise(), w.x, 0, w.z, 0.5);
    stepPerson(p, n, w, 1 / 60, free);
    expect(p.state).toBe(ST.TURN);
    const silent = quietNoise();
    let held = false;
    for (let i = 0; i < 600 && !held; i++) held = stepPerson(p, silent, w, 1 / 60, free);
    expect(held).toBe(true);
    for (let i = 0; i < 60 * 3; i++) { w.quietFor += 1 / 60; stepPerson(p, silent, w, 1 / 60, free); }
    expect(p.state === ST.LINGER || p.state === ST.BACK).toBe(true);
  });
  it('lose a sound that moved away quietly, and go home to their task', () => {
    const p = newPerson(PEOPLE.find((d) => d.id === 'hanne'));
    const w = { x: p.x + 8, y: 0, z: p.z, quietFor: 0 };
    stepPerson(p, noiseAt(createNoise(), w.x, 0, w.z, 0.5), w, 1 / 60, free);
    w.x += 30;   // the Wraith walks away quietly
    for (let i = 0; i < 60 * 20 && p.state !== ST.TASK; i++) stepPerson(p, quietNoise(), w, 1 / 60, free);
    expect(p.state).toBe(ST.TASK);
  });
  it('are shaken off by a dodge, and stopped for good by their own name only', () => {
    const p = newPerson(PEOPLE.find((d) => d.id === 'teodor'));
    p.state = ST.HOLD;
    shakeOff(p, { x: p.x + 0.5, z: p.z });
    expect(p.state).toBe(ST.TURN);
    expect(sayName(p, 'Hanne')).toBe('wrong');
    expect(sayName(p, 'Teodor')).toBe('named');
    for (let i = 0; i < 120; i++) stepPerson(p, noiseAt(createNoise(), p.x, 0, p.z, 1), { x: p.x, y: 0, z: p.z, quietFor: 0 }, 1 / 60, free);
    expect(p.state).toBe(ST.STILL);
    expect(DR.stillToLetGo).toBeGreaterThan(1);
  });
});
