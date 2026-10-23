import { describe, it, expect } from 'vitest';
import { createBellFight, BFIGHT, BEV, bellTuning as T } from '../src/game/bellwether/fight.js';

const B = { DORMANT: 0, WAKE: 1, IDLE: 2, INHALE: 3, EXHALE: 4, SHAKE: 5, ROAR: 6, RELEASE: 7, RESTED: 8 };
const DT = 1 / 30;

function setup(opts = {}) {
  const calls = [];
  const bell = {
    state: B.DORMANT, hx: 0, hy: 20, hz: 0, exhaleFrom: 0, exhaleTo: 0,
    valves: { n: 3, x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0], open: [0, 0, 0] },
    wake() { calls.push('wake'); }, inhale() { calls.push('inhale'); }, exhale() { calls.push('exhale'); },
    shake() { calls.push('shake'); }, roar() { calls.push('roar'); }, release() { calls.push('release'); },
    reset() { calls.push('reset'); this.valves.open = [0, 0, 0]; },
    openValve(k) { calls.push('valve' + k); this.valves.open[k] = 1; },
  };
  const live = new Map(); let next = 0;
  const state = { allowed: true, sheltered: false, near: -1 };
  const fight = createBellFight({
    bell, B, arena: { x: 0, z: 0, y: 0 },
    vents: [{ x: -20, y: 30, z: 0 }, { x: 0, y: 30, z: 0 }, { x: 20, y: 30, z: 0 }],
    allowed: () => state.allowed, sheltered: () => state.sheltered, nearValve: () => state.near,
    spawn: (name) => { if (opts.noSpawn) return -1; const s = next++; live.set(s, name); return s; },
    alive: (s) => live.has(s), kill: (s) => live.delete(s),
    summonNames: ['grazer', 'stalker', 'brute'],
  });
  fight.dt = DT; fight.px = 0; fight.pz = 30;
  let evs = 0;
  const step = (sec) => { for (let k = 0; k < Math.round(sec / DT); k++) { fight.update(); evs |= fight.ev; } };
  const wakeIt = () => { step(0.1); };
  const strip = () => { for (const x of [-20, 0, 20]) fight.windHit(x, 30, 0, 3, 3); };
  return { bell, fight, live, state, calls, step, wakeIt, strip, evs: () => { const e = evs; evs = 0; return e; } };
}

describe('the Bellwether fight', () => {
  it('wakes within wakeR only when allowed', () => {
    const s = setup();
    s.fight.pz = T.wakeR + 5; s.step(1);
    expect(s.fight.phase).toBe(BFIGHT.IDLE);
    s.fight.pz = 20; s.state.allowed = false; s.step(1);
    expect(s.fight.phase).toBe(BFIGHT.IDLE);
    s.state.allowed = true; s.fight.update();
    expect(s.fight.phase).toBe(BFIGHT.VENTS);
    expect(s.fight.ev & BEV.WAKE).toBe(BEV.WAKE);
    expect(s.calls).toContain('wake');
    expect(Array.from(s.fight.vents)).toEqual([3, 3, 3]);
  });

  it('strips vents by power and radius, then the neck rises', () => {
    const s = setup(); s.wakeIt();
    expect(s.fight.windHit(-20, 30, 0, 3, 1)).toBe(1);
    expect(s.fight.vents[0]).toBe(2);
    expect(s.fight.windHit(100, 30, 0, 3, 1)).toBe(0);
    s.fight.windHit(-20, 30, 0, 3, 1.5); s.fight.windHit(-20, 30, 0, 3, 1);
    expect(s.fight.vents[0]).toBe(0);
    s.fight.update();
    expect(s.fight.ev & BEV.VENT_STRIPPED).toBeTruthy();
    expect(s.fight.phase).toBe(BFIGHT.VENTS);
    s.fight.windHit(0, 30, 0, 3, 3); s.fight.windHit(20, 30, 0, 3, 3);
    expect(s.fight.phase).toBe(BFIGHT.CLIMB);
    expect(s.calls).toContain('roar');
    s.fight.update();
    expect(s.fight.ev & BEV.NECK_RISES).toBeTruthy();
    // A radius that reaches two vents hits both.
    const t = setup(); t.wakeIt();
    expect(t.fight.windHit(-10, 30, 0, 12, 1)).toBe(2);
  });

  it('opens valves only near one, shakes only while climbing', () => {
    const s = setup(); s.wakeIt(); s.strip();
    expect(s.fight.tryValve()).toBe(false);
    s.state.near = 1;
    expect(s.fight.tryValve()).toBe(true);
    expect(s.fight.tryValve()).toBe(false); // already open
    s.fight.update();
    expect(s.fight.valvesOpen).toBe(1);
    s.step(T.shakeEvery + 1); expect(s.calls).not.toContain('shake');
    s.fight.climbing = true; s.evs();
    s.step(T.shakeEvery + 0.5);
    expect(s.calls).toContain('shake');
    expect(s.evs() & BEV.SHAKE).toBeTruthy();
  });

  it('gale timing: first after 12 s, inhale 3 s then 2.5 s of gale, every 25 s', () => {
    const s = setup(); s.wakeIt();
    s.step(T.firstGale - 0.5);
    expect(s.fight.galeWarn).toBe(false);
    s.step(1);
    expect(s.fight.galeWarn).toBe(true);
    expect(s.fight.hint).toMatch(/behind a wall/);
    s.step(T.inhaleTime); expect(s.fight.galeActive).toBe(true);
    s.step(T.galeTime + 0.1); expect(s.fight.galeActive).toBe(false);
    expect(s.fight.galeIn).toBeGreaterThan(T.galeEvery - T.inhaleTime - T.galeTime - 1);
    expect(s.fight.galeIn).toBeLessThan(T.galeEvery);
    expect(s.calls.filter((c) => c === 'exhale').length).toBe(1);
    s.step(T.galeEvery - 5.5 - 0.5 + 0.2 + 1);
    expect(s.calls.filter((c) => c === 'exhale').length).toBe(1);
    s.step(T.inhaleTime + 0.3);
    expect(s.calls.filter((c) => c === 'exhale').length).toBe(2);
  });

  it('gale hits once, in the wedge, weak while vents are sealed; shelter and climbing prevent it', () => {
    const run = (mod, strip) => {
      const s = setup(); s.wakeIt(); if (strip) s.strip();
      s.fight.px = 0; s.fight.pz = 30; // due +z of the mouth: sweep centre is at 90 deg
      if (mod) mod(s);
      let hits = 0, last = null;
      for (let k = 0; k < Math.round((T.firstGale + T.inhaleTime + T.galeTime + 1) / DT); k++) {
        s.fight.update();
        if (s.fight.ev & BEV.GALE_HIT) { hits++; last = { x: s.fight.shoveX, z: s.fight.shoveZ, sh: s.fight.shove, d: s.fight.damage }; }
      }
      return { hits, last, s };
    };
    const a = run(null, false);
    expect(a.hits).toBe(1);
    expect(a.last.sh).toBeCloseTo(14 * 0.5); expect(a.last.d).toBeCloseTo(18 * 0.5);
    expect(a.last.z).toBeCloseTo(7); expect(a.last.x).toBeCloseTo(0);
    expect(a.s.bell.exhaleTo - a.s.bell.exhaleFrom).toBeCloseTo(2 * T.galeArc);
    const b = run(null, true);
    expect(b.hits).toBe(1); expect(b.last.sh).toBeCloseTo(14); expect(b.last.d).toBeCloseTo(18);
    expect(run((s) => { s.state.sheltered = true; }, true).hits).toBe(0);
    expect(run((s) => { s.fight.climbing = true; }, true).hits).toBe(0);
    // Out of range.
    const far = setup(); far.wakeIt(); far.fight.pz = 30; far.step(T.firstGale + 0.1);
    far.fight.pz = T.galeR + 5; far.fight.px = 0;
    let h = 0; for (let k = 0; k < 300; k++) { far.fight.update(); if (far.fight.ev & BEV.GALE_HIT) h++; }
    expect(h).toBe(0);
    // Outside the sweep arc entirely (behind the head).
    const back = setup(); back.wakeIt(); back.fight.pz = 30; back.step(T.firstGale + 0.1);
    back.fight.pz = -30; let h2 = 0;
    for (let k = 0; k < 300; k++) { back.fight.update(); if (back.fight.ev & BEV.GALE_HIT) h2++; }
    expect(h2).toBe(0);
  });

  it('frenzy once at progress 4, capped, replaces losses below the cap', () => {
    const s = setup(); s.wakeIt(); s.strip();
    expect(s.fight.progress).toBe(3);
    s.step(0.2); expect(s.live.size).toBe(0);
    s.state.near = 0; s.fight.tryValve(); s.step(0.1);
    expect(s.fight.phase).toBe(BFIGHT.FRENZY);
    expect(s.live.size).toBe(T.summonMax);
    expect([...s.live.values()]).toContain('stalker');
    const first = s.fight.summoned;
    s.step(10); expect(s.fight.summoned).toBe(first); // at cap: no more
    s.live.delete(0); s.live.delete(1);
    s.step(T.summonGap + 0.5);
    expect(s.live.size).toBeLessThanOrEqual(T.summonMax);
    expect(s.live.size).toBeGreaterThanOrEqual(T.summonMax - 1);
    s.state.near = 1; s.fight.tryValve();
    expect(s.fight.phase).toBe(BFIGHT.FRENZY);
  });

  it('third valve releases, kills summons, ends in DONE', () => {
    const s = setup(); s.wakeIt(); s.strip();
    for (const k of [0, 1, 2]) { s.state.near = k; s.fight.tryValve(); s.step(0.1); }
    expect(s.fight.phase).toBe(BFIGHT.DONE);
    expect(s.calls).toContain('release');
    expect(s.live.size).toBe(0);
    expect(s.fight.releasedAt).toBeGreaterThanOrEqual(0);
    expect(s.evs() & BEV.RELEASED).toBeTruthy();
    s.fight.playerDead(); s.step(1);
    expect(s.fight.phase).toBe(BFIGHT.DONE);
  });

  it('resets on death and on the leash', () => {
    const s = setup(); s.wakeIt(); s.strip();
    s.state.near = 0; s.fight.tryValve(); s.step(0.2);
    expect(s.live.size).toBeGreaterThan(0);
    s.fight.playerDead(); s.evs(); s.fight.update();
    expect(s.fight.phase).toBe(BFIGHT.IDLE);
    expect(s.fight.ev & BEV.RESET).toBeTruthy();
    expect(s.live.size).toBe(0);
    expect(s.calls).toContain('reset');
    expect(Array.from(s.fight.vents)).toEqual([0, 0, 0]);
    expect(s.fight.valvesOpen).toBe(0);
    // Leash.
    s.fight.pz = 20; s.step(0.2); expect(s.fight.phase).toBe(BFIGHT.VENTS);
    expect(Array.from(s.fight.vents)).toEqual([3, 3, 3]);
    s.fight.pz = T.leashR + 10; s.step(T.leashT - 1); expect(s.fight.phase).toBe(BFIGHT.VENTS);
    s.fight.pz = 30; s.step(0.5); s.fight.pz = T.leashR + 10; s.step(T.leashT - 1); // timer restarted
    expect(s.fight.phase).toBe(BFIGHT.VENTS);
    s.step(2); expect(s.fight.phase).toBe(BFIGHT.IDLE);
  });
});
