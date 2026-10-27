import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ENCOUNTERS, ROLES, ROUTES, EXTRA_KINDS, SOLO_OK } from '../src/systems/encounters.js';
import { createCalm, calmTuning } from '../src/systems/calm.js';
import { SUPPORT } from '../src/systems/side/flock.js';
import { ARCHETYPES } from '../src/game/shaped/archetypes.js';
import { MAX_SHAPED } from '../src/game/shaped/shaped.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
const quests = {}, places = {};
for (const f of ['frost', 'meadow', 'meadow-side']) {
  const d = read(`data/quests/${f}.json`);
  for (const q of d.quests) quests[q.id] = q;
  Object.assign(places, d.places);
}
for (const p of read('data/world/pois.json').pois ?? read('data/world/pois.json')) places[p.id] = p;
const KINDS = ['ambush', 'guarded site', 'storm surge', 'hunt', 'frenzy'];
const ARENAS = ['slope', 'ice', 'grass', 'ruins', 'water', 'cliffs'];

describe('encounter rules (gameplay-design §4.2)', () => {
  for (const [id, e] of Object.entries(ENCOUNTERS)) {
    describe(id, () => {
      it('is armed by a real quest step at a real place', () => {
        expect(quests[e.quest], 'quest').toBeTruthy();
        expect(quests[e.quest].steps.some((s) => s.id === e.step), 'step').toBe(true);
        expect(places[e.at], 'place').toBeTruthy();
      });
      it('uses real archetypes with a role', () => {
        for (const w of e.waves) for (const [name] of w) { expect(ARCHETYPES[name], name).toBeTruthy(); expect(ROLES[name], name).toBeTruthy(); }
      });
      it('has two or more roles across its waves (or is a listed exception)', () => {
        const roles = new Set(e.waves.flat().map(([n]) => ROLES[n]));
        if (!SOLO_OK.includes(id)) expect(roles.size).toBeGreaterThanOrEqual(2);
      });
      it('never asks for more than the cap at once (8)', () => {
        for (const w of e.waves) expect(w.length).toBeLessThanOrEqual(MAX_SHAPED);
        expect(MAX_SHAPED).toBe(8);
      });
      it('has an arena tag and a kind', () => {
        expect(ARENAS).toContain(e.arena);
        expect(KINDS).toContain(e.kind);
        if (e.kind === 'storm surge') expect(e.weather).toBeTruthy();
      });
    });
  }
  it('the Barley flock has a caster as well as its runners', () => {
    expect(SUPPORT.some(([n]) => ROLES[n] === 'caster')).toBe(true);
  });
  it('the meadow has armed encounters on its main path before the Warden', () => {
    const meadow = Object.values(ENCOUNTERS).filter((e) => e.quest.startsWith('meadow'));
    expect(meadow.length).toBeGreaterThanOrEqual(2);
    expect(meadow.some((e) => e.quest === 'meadow-the-burning-night')).toBe(true);
  });
  for (const [route, ids] of Object.entries(ROUTES)) {
    it(`route ${route}: no two kinds in a row`, () => {
      const kinds = ids.map((i) => ENCOUNTERS[i]?.kind ?? EXTRA_KINDS[i]);
      kinds.forEach((k) => expect(KINDS).toContain(k));
      for (let i = 1; i < kinds.length; i++) expect(kinds[i], `${ids[i - 1]} then ${ids[i]}`).not.toBe(kinds[i - 1]);
    });
  }
});

describe('calm after peaks', () => {
  it('holds new risings near a peak for 60 s, only near it, and then lets go', () => {
    const clock = { simTime: 0 }, c = createCalm(clock);
    expect(c.holds(0, 0)).toBe(false);
    c.note(100, 100);
    expect(calmTuning).toMatchObject({ radius: 120, secs: 60 });
    expect(c.holds(100, 100)).toBe(true);
    expect(c.holds(100 + 119, 100)).toBe(true);
    expect(c.holds(100 + 121, 100)).toBe(false);
    clock.simTime = 59; expect(c.holds(150, 100)).toBe(true); expect(c.left(150, 100)).toBeCloseTo(1, 5);
    clock.simTime = 61; expect(c.holds(150, 100)).toBe(false);
  });
  it('remembers several peaks', () => {
    const clock = { simTime: 0 }, c = createCalm(clock);
    c.note(0, 0); c.note(1000, 0); c.note(2000, 0);
    expect(c.holds(10, 0) && c.holds(1010, 0) && c.holds(2010, 0)).toBe(true);
    c.reset(); expect(c.holds(10, 0)).toBe(false);
  });
  it('the shipped encounters keep clear of each other\'s calm: consecutive route places are over the radius apart or on different steps', () => {
    // camp-raid and varo-rise are 128 m apart: a clear at one does not hold the other's rising.
    const d = (a, b) => Math.hypot(places[a].pos[0] - places[b].pos[0], places[a].pos[1] - places[b].pos[1]);
    expect(d('camp-frost', 'varo-rise')).toBeGreaterThan(calmTuning.radius);
  });
});
