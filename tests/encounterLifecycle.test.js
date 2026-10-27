import { afterEach, describe, expect, it, vi } from 'vitest';
import { addEncounterSystem } from '../src/systems/encounters.js';
import { addEncounterLog } from '../src/systems/encounterLog.js';
import { addFlock } from '../src/systems/side/flock.js';
import { S } from '../src/game/shaped/shaped.js';
import { worldState } from '../src/game/worldState.js';

afterEach(() => { vi.unstubAllGlobals(); worldState.weatherOverride = null; });

function context(place = 'monastery') {
  const systems = [], flags = new Set(), events = [];
  const slots = Array.from({ length: 8 }, () => ({ state: S.EMPTY }));
  const g = {
    loop: { add: (system) => systems.push(system) }, clock: { dt: 0.5, simTime: 0 },
    controller: { pos: { x: 0, z: 0 } },
    shapedMod: { S }, shaped: {
      slots,
      spawn: vi.fn((arch) => {
        const i = slots.findIndex((slot) => slot.state === S.EMPTY);
        if (i >= 0) Object.assign(slots[i], { state: S.RISING, arch });
        return i;
      }),
      damage: vi.fn((i) => { slots[i].state = S.FALLING; return true; }),
    },
    chapter: { graph: { flags, quests: {}, byId: new Map() }, table: { [place]: { pos: [0, 0] } },
      shrines: new Set(), raise: (event) => events.push(event) },
    combat: { health: 100, focus: 100, dying: 0 }, flow: { tier: 0 },
    encounterLog: { begin: vi.fn(), end: vi.fn(), cancel: vi.fn(), reset: vi.fn() },
    hud: { notice: vi.fn() }, music: { sting: vi.fn() }, capture: true, pois: [],
  };
  return { g, flags, events, slots, systems };
}

function encounter(place) {
  const c = context(place);
  addEncounterSystem(c.g);
  c.tick = c.systems.find((s) => s.name === 'encounters').update;
  return c;
}

describe('encounter wave lifecycle', () => {
  it('waits for a complete first wave before starting a fight', () => {
    const { g, slots, tick, flags } = encounter();
    slots.slice(0, 7).forEach((s) => { s.state = S.STALK; });
    g.startEncounter('cloister'); tick();
    expect(g.shaped.spawn).not.toHaveBeenCalled();
    expect(g.encounters.cloister.wave).toBe(-1);
    expect(flags.has('fighting:cloister')).toBe(false);
    expect(g.encounterLog.begin).not.toHaveBeenCalled();
    slots[0].state = S.EMPTY; tick();
    expect(g.shaped.spawn).toHaveBeenCalledTimes(2);
    expect(g.encounterLog.begin).toHaveBeenCalledWith('cloister');
    expect(flags.has('cleared:cloister')).toBe(false);
  });

  it('waits for sinking bodies to free slots before a later wave', () => {
    const { g, slots, tick, flags, events } = encounter();
    g.startEncounter('cloister'); tick();
    slots.forEach((s) => { s.state = S.FALLING; });
    g.clock.dt = 2; tick();
    expect(g.encounters.cloister.wave).toBe(0);
    expect(g.shaped.spawn).toHaveBeenCalledTimes(2);
    expect(flags.has('cleared:cloister')).toBe(false);
    slots[0].state = S.EMPTY; tick();
    expect(g.encounters.cloister.wave).toBe(1);
    expect(g.shaped.spawn).toHaveBeenCalledTimes(3);
    slots[0].state = S.FALLING; tick();
    expect(events).toEqual(['encounter:cloister:clear']);
    expect(g.encounterLog.end).toHaveBeenCalledExactlyOnceWith('cloister');
    expect(g.calm.holds(0, 0)).toBe(true);
  });

  it('holds automatic starts during calm but permits forced starts and later waves', () => {
    const { g, tick } = encounter();
    const graph = g.chapter.graph;
    graph.quests['empty-robe'] = { state: 'active', step: 0 };
    graph.byId.set('empty-robe', { steps: [{ id: 'cloister' }] });
    g.calm.note(0, 0); tick();
    expect(g.shaped.spawn).not.toHaveBeenCalled();
    g.startEncounter('cloister'); tick();
    expect(g.shaped.spawn).toHaveBeenCalledTimes(2);
    for (const i of g.encounters.cloister.slots) g.shaped.slots[i].state = S.EMPTY;
    g.clock.dt = 2; tick();
    expect(g.shaped.spawn).toHaveBeenCalledTimes(3);
  });

  it('releases storm weather and cancels telemetry when a fight is abandoned', () => {
    const { g, tick, flags } = encounter('camp-frost');
    g.startEncounter('camp-raid'); tick();
    expect(worldState.weatherOverride).toBe('blizzard');
    g.endEncounter('camp-raid');
    expect(worldState.weatherOverride).toBe(null);
    expect(g.encounterLog.cancel).toHaveBeenCalledWith('camp-raid');
    expect(g.encounterLog.end).not.toHaveBeenCalled();
    expect(flags.has('fighting:camp-raid')).toBe(false);
    expect(flags.has('cleared:camp-raid')).toBe(false);
  });

  it('clears run telemetry and calm on load without releasing an overlay weather override', () => {
    const { g, tick } = encounter('camp-frost');
    worldState.weatherOverride = 'rain';
    g.startEncounter('camp-raid'); tick(); g.calm.note(0, 0);
    g.navSync();
    expect(worldState.weatherOverride).toBe('rain');
    expect(g.encounterLog.reset).toHaveBeenCalledOnce();
    expect(g.calm.holds(0, 0)).toBe(false);
    expect(g.encounters['camp-raid'].wave).toBe(-1);
  });

  it('starts calm when the player re-forms', () => {
    const { g, tick } = encounter();
    g.combat.dying = 1; tick();
    expect(g.calm.holds(0, 0)).toBe(false);
    g.combat.dying = 0; tick();
    expect(g.calm.holds(0, 0)).toBe(true);
  });
});

function flock() {
  const c = context('side-barley');
  let away = 0;
  c.g.calm = { holds: () => false, note: vi.fn() };
  c.flock = addFlock({ g: c.g, flags: c.flags, table: c.g.chapter.table,
    stepOf: () => 'field', away: () => away });
  c.leave = () => { away = 200; };
  return c;
}

describe('Barley flock lifecycle', () => {
  it('waits for all six slots so a full pool cannot clear the quest without a fight', () => {
    const { g, slots, flock: f, flags } = flock();
    slots.slice(0, 3).forEach((s) => { s.state = S.STALK; });
    f.tick(); f.tick();
    expect(g.shaped.spawn).not.toHaveBeenCalled();
    expect(flags.has('meadow:side-flock-cleared')).toBe(false);
    slots[0].state = S.EMPTY; f.tick();
    expect(g.shaped.spawn).toHaveBeenCalledTimes(6);
    expect(g.encounterLog.begin).toHaveBeenCalledExactlyOnceWith('side-flock');
  });

  it('starts calm on a real clear and ends the run once', () => {
    const { g, slots, flock: f, events } = flock();
    f.tick(); slots.forEach((s) => { s.state = S.FALLING; }); f.tick(); f.tick();
    expect(events).toEqual(['encounter:side-flock:clear']);
    expect(g.calm.note).toHaveBeenCalledExactlyOnceWith(0, 0);
    expect(g.encounterLog.end).toHaveBeenCalledExactlyOnceWith('side-flock');
  });

  it('cancels abandoned or reloaded runs without reporting a clear', () => {
    const { g, flock: f, leave, events } = flock();
    f.tick(); leave(); f.tick();
    expect(g.encounterLog.cancel).toHaveBeenCalledWith('side-flock');
    expect(g.encounterLog.end).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    g.encounterLog.cancel.mockClear(); f.sync();
    expect(g.encounterLog.cancel).toHaveBeenCalledExactlyOnceWith('side-flock');
  });
});

describe('encounter telemetry lifecycle', () => {
  function telemetry(search = '?bot=1') {
    const c = context(); vi.stubGlobal('location', { search });
    addEncounterLog(c.g);
    c.tick = c.systems.find((s) => s.name === 'encounterLog')?.update;
    return c;
  }

  it('provides the same lifecycle API outside bot mode', () => {
    const { g } = telemetry('');
    expect(g.encounterLog.enabled).toBe(false);
    expect(() => { g.encounterLog.begin('test'); g.encounterLog.cancel('test'); g.encounterLog.reset(); }).not.toThrow();
    expect(g.encounterLog.results).toEqual([]);
  });

  it('discards abandoned runs, and retrying starts with fresh counters', () => {
    const { g, tick } = telemetry(), log = g.encounterLog;
    log.begin('test'); tick(); log.cancel('test');
    expect(log.active()).toEqual([]); expect(log.results).toEqual([]);
    tick(); log.begin('test'); tick(); log.end('test');
    expect(log.results).toHaveLength(1);
    expect(log.results[0].secs).toBe(0.5);
  });

  it('excludes pre-fight health changes and records in-fight damage and deaths', () => {
    const { g, tick } = telemetry(), log = g.encounterLog;
    g.combat.health = 60; log.begin('test'); tick();
    g.combat.health = 48; tick();
    g.combat.dying = 1; tick(); tick(); log.end('test');
    expect(log.results[0]).toMatchObject({ taken: 12, deaths: 1, secs: 2 });
  });

  it('reset discards active and finished runs and rebases health', () => {
    const { g, tick } = telemetry(), log = g.encounterLog;
    log.begin('done'); tick(); log.end('done'); log.begin('old');
    g.combat.health = 35; log.reset();
    expect(log.active()).toEqual([]); expect(log.results).toEqual([]);
    log.begin('new'); tick(); log.end('new');
    expect(log.results[0]).toMatchObject({ id: 'new', taken: 0, deaths: 0 });
  });
});
