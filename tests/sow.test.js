import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { mergeChapters } from '../src/game/chapter.js';
import { validateQuests } from '../src/game/quests/questGraph.js';
import { sowSites, SOW_FARMS, SOW_SIGNS, sowPoint } from '../src/world/sow.js';
import { buildArchitecture } from '../src/world/architecture.js';
import { readyToGo, NEED } from '../src/systems/sow.js';

const read = (f) => JSON.parse(fs.readFileSync('data/quests/' + f, 'utf8'));
const ember = read('ember.json');
const raw = fs.readFileSync('data/world/height_overview.u16');
const ov = new Uint16Array(raw.buffer, raw.byteOffset, 1024 * 1024);

describe('The Sow (world/sow.js, systems/sow.js, data/quests/ember.json)', () => {
  it('merges with every chapter and its quests validate', () => {
    const all = mergeChapters(read('frost.json'), read('meadow.json'), read('meadow-side.json'), read('frost-restored.json'), read('meadow-restored.json'), read('dunes.json'), ember);
    expect(() => validateQuests(all.quests)).not.toThrow();
  });
  it('talks only in dialogue that exists, and every speaker is a real person', () => {
    const ids = new Set(ember.npcs.map((n) => n.id));
    for (const [npc, list] of Object.entries(ember.talk)) {
      expect(ids.has(npc), npc).toBe(true);
      for (const t of list) expect(ember.dialogue[t.say], t.say).toBeTruthy();
    }
    for (const [id, d] of Object.entries(ember.dialogue)) {
      expect(ids.has(d.speaker), id).toBe(true);
      for (const o of d.choice?.options || []) for (const a of o.then) if (a.say) expect(ember.dialogue[a.say], a.say).toBeTruthy();
      for (const l of d.lines) expect(l.length, id).toBeLessThan(200);
    }
  });
  it('gives every family an elder and one more, in the Sow costume with its own dyes', () => {
    for (const f of SOW_FARMS) {
      const fam = ember.npcs.filter((n) => n.home.poi.startsWith(`sow-${f.id}-`));
      expect(fam.length).toBe(2);
      expect(fam.every((n) => n.costume?.base === 'sow')).toBe(true);
    }
  });
  it('builds every farm on the hill, the signs inside each farm', () => {
    const sites = sowSites(ov, JSON.parse(fs.readFileSync('data/world/sowHeights.json', 'utf8')));
    const headland = sites.filter((site) => site.id.startsWith('emb-camp'));
    expect(headland.map((site) => site.id)).toEqual([
      'emb-camp', ...SOW_FARMS.map(({ id }) => 'emb-camp-' + id),
      'emb-camp-cinderhold', 'emb-camp-chapel', 'emb-camp-lookout', 'emb-camp-empty',
    ]);
    expect(headland.every((site) => site.hidden && site.seatAt === 'center')).toBe(true);
    expect(headland.find((site) => site.id === 'emb-camp-lookout').at).toEqual([750, -2731]);
    expect(sites.length - headland.length).toBe(SOW_FARMS.length * 5 + 3);
    const b = buildArchitecture(sites);
    expect(b.positions.every(Number.isFinite)).toBe(true);
    expect(b.indices.length).toBeGreaterThan(20000);
    for (const f of SOW_FARMS) {
      const [x, z] = sowPoint(f, ...SOW_SIGNS[f.id]);
      expect(Math.hypot(x - f.at[0], z - f.at[1])).toBeLessThan(30);
      const s = sites.find((q) => q.id === `sow-${f.id}-farm`);
      expect(s.seatAt).toBe('center');
    }
  });
  it('makes no family go before it believes, and each waits for its neighbours', () => {
    const flags = new Set();
    expect(readyToGo('bethan', flags, 5)).toBe(false);
    flags.add('ember:bethan-believes'); flags.add('ember:gwil-believes');
    expect(readyToGo('bethan', flags, 0)).toBe(true);
    expect(readyToGo('gwil', flags, NEED.gwil - 1)).toBe(false);
    expect(readyToGo('gwil', flags, NEED.gwil)).toBe(true);
    // A lie found out costs two more neighbours.
    flags.add('ember:lie-found');
    expect(readyToGo('bethan', flags, 1)).toBe(false);
    expect(readyToGo('bethan', flags, 2)).toBe(true);
  });
  it('can empty the valley with no lie: the families who need no neighbours start it', () => {
    let road = 0; const gone = new Set();
    const flags = new Set(SOW_FARMS.map((f) => `ember:${f.id}-believes`));
    for (let pass = 0; pass < 6; pass++) for (const f of SOW_FARMS) if (!gone.has(f.id) && readyToGo(f.id, flags, road)) { gone.add(f.id); road++; }
    expect(gone.size).toBe(6);
  });
});

import { emberStage } from '../src/systems/emberClock.js';
describe('The mountain clock (systems/emberClock.js)', () => {
  it('sleeps until the warning, wakes, goes on a stage a dawn, holds at Fire, and a thread given holds it back', () => {
    expect(emberStage(false, 3, 0)).toBe(0);
    expect(emberStage(true, 0, 0)).toBe(1);
    expect(emberStage(true, 2, 0)).toBe(3);
    expect(emberStage(true, 9, 0)).toBe(5);
    expect(emberStage(true, 3, 0)).toBe(4);
    expect(emberStage(true, 2, 1)).toBe(2);
    expect(emberStage(true, 1, 5)).toBe(1);
  });
  it('makes the farmers easier to move as it swells', () => {
    const flags = new Set(['ember:gwil-believes']);
    expect(readyToGo('gwil', flags, 0, 1)).toBe(false);
    expect(readyToGo('gwil', flags, 0, 3)).toBe(true);
  });
});

import { guildVotes } from '../src/systems/cinderhold.js';
import { cinderSites } from '../src/world/cinderhold.js';
describe('Cinderhold (world/cinderhold.js, systems/cinderhold.js)', () => {
  it('builds on its baked ground', () => {
    const sites = cinderSites(JSON.parse(fs.readFileSync('data/world/cinderHeights.json', 'utf8')));
    expect(sites.map((s) => s.id)).toEqual(['cin-town', 'cin-cage']);
    const b = buildArchitecture(sites);
    expect(b.positions.every(Number.isFinite)).toBe(true);
    expect(b.lights.length).toBeGreaterThan(8);
  });
  it('needs two masters of three', () => {
    expect(guildVotes(new Set(['ember:teg-yes']))).toBe(1);
    expect(guildVotes(new Set(['ember:teg-yes', 'ember:vell-yes']))).toBe(2);
  });
});

import { omensNeeded } from '../src/systems/ashChapel.js';
import { chapelSites } from '../src/world/ashChapel.js';
describe('The Ash Chapel (world/ashChapel.js, systems/ashChapel.js)', () => {
  it('builds on its baked ground', () => {
    const b = buildArchitecture(chapelSites(JSON.parse(fs.readFileSync('data/world/chapelHeights.json', 'utf8'))));
    expect(b.positions.every(Number.isFinite)).toBe(true);
  });
  it('wants two omens, three if the Wraith spoke through the bell', () => {
    expect(omensNeeded(new Set())).toBe(2);
    expect(omensNeeded(new Set(['ember:chapel-rude']))).toBe(3);
  });
  it('makes forcing the Seer cost the Wraith a neighbour at every farm', () => {
    const f = new Set(['ember:bethan-believes']);
    expect(readyToGo('bethan', f, 0)).toBe(true);
    f.add('ember:seer-forced');
    expect(readyToGo('bethan', f, 0)).toBe(false);
  });
});
