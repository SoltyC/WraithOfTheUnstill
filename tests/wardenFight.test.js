import { describe, it, expect } from 'vitest';
import { createWarden, W, WARDEN_FIGHT } from '../src/game/warden/warden.js';
import { createFight, FIGHT, fightTuning } from '../src/game/warden/fight.js';
import { createSpikes } from '../src/game/warden/spikes.js';
import { createSolids } from '../src/world/solids.js';
import { frostSites, buildArchitecture, ARENA } from '../src/world/architecture.js';

const flat = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
const ts = { stamp() {} };
const fx = { emit() {} };
const noWall = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, t: 2, segBlocked() { return false; } };

function setup() {
  const warden = createWarden({ ts, fx, ground: flat });
  warden.place(0, 0, 0); warden.dt = 1 / 30;
  const spikes = createSpikes({ ground: flat, ts, fx, blocker: noWall });
  const pillars = { n: 6, x: new Float64Array(8), z: new Float64Array(8), y0: new Float64Array(8), up: new Float64Array(8), H: 9, r: 1.25 };
  const live = new Map();
  let nextSlot = 0;
  const fight = createFight({
    warden, spikes, pillars, ground: flat,
    spawn: (name) => { const s = nextSlot++; live.set(s, name); return s; },
    alive: (s) => live.has(s), kill: (s) => live.delete(s),
  });
  fight.dt = 1 / 30; fight.px = 0; fight.py = 0; fight.pz = -30;
  const step = (sec) => { for (let k = 0; k < sec * 30; k++) { warden.px = fight.px; warden.pz = fight.pz; warden.update(); fight.update(); spikes.dt = 1 / 30; spikes.update(); } };
  return { warden, spikes, pillars, fight, live, step };
}

describe('the Warden fight', () => {
  it('raises the pillars when it wakes and heals it while crystals stand; the ward seals its seams', () => {
    const { warden, pillars, fight, step } = setup();
    step(1);
    expect(fight.phase).toBe(FIGHT.WARD);
    step(fightTuning.riseTime + 2);
    for (let k = 0; k < 6; k++) expect(pillars.up[k]).toBe(1);
    expect([0, 1, 2, 3].some((k) => warden.exposed(k))).toBe(false);
    warden.chip = 20; warden.bodyHit();
    expect(warden.hp).toBe(80);
    step(1);
    expect(warden.hp).toBeGreaterThan(88);          // six crystals: 9 health a second
  });
  it('breaking every crystal breaks the ward (a cracked crystal takes one strike)', () => {
    const { warden, fight, step } = setup();
    fight.crackedCrystal = 2;
    step(fightTuning.riseTime + 3);
    expect(fight.crystal[2]).toBe(1);
    for (let k = 0; k < 6; k++) while (fight.crystal[k] > 0) expect(fight.strike(k)).toBe(true);
    expect(fight.phase).toBe(FIGHT.OPEN);
    expect(warden.ward).toBe(false);
    expect(warden.state).toBe(W.ROAR);
    expect(warden.exposed(0)).toBe(true);
  });
  it('gathers a barrage every fifteen seconds once the pillars stand', () => {
    const { warden, step } = setup();
    let charges = 0, last = -1;
    for (let k = 0; k < 30 * 60; k++) { step(1 / 30); if (warden.state === W.CHARGE && last !== W.CHARGE) charges++; last = warden.state; }
    // Rise (≈ 5.7 s) + 15 s to the first (≈ 21 s), then every 15 s: 36, 51 — three in a minute.
    expect(charges).toBe(3);
  });
  it('a barrage in the open wounds the Wraith, and no dodge helps', () => {
    const { warden, spikes, step } = setup();
    let dmg = 0;
    for (let k = 0; k < 30 * 30; k++) { step(1 / 30); dmg += spikes.hitDamage; }
    expect(dmg).toBeGreaterThan(30);
  });
  it('at 30 % it calls up the Shaped: never more than one seer at a time, two over the fight', () => {
    const { warden, fight, live, step } = setup();
    step(fightTuning.riseTime + 3);
    for (let k = 0; k < 6; k++) while (fight.crystal[k] > 0) fight.strike(k);
    step(3);
    warden.damage(WARDEN_FIGHT.hp - 25);
    step(4);
    expect(fight.phase).toBe(FIGHT.FRENZY);
    const seers = () => [...live.values()].filter((n) => n === 'seer').length;
    expect(seers()).toBe(1);
    expect([...live.values()].filter((n) => n === 'brute').length).toBe(2);
    // Kill the seer: a second comes after a while; kill it too: no third.
    for (const [s, n] of live) if (n === 'seer') live.delete(s);
    step(fightTuning.seerGap + 1);
    expect(seers()).toBe(1);
    for (const [s, n] of live) if (n === 'seer') live.delete(s);
    step(fightTuning.seerGap * 2);
    expect(seers()).toBe(0);
    expect(fight.seers).toBe(2);
  });
  it('with the den cleared it calls fewer Shaped (one brute at a time, no hounds)', () => {
    const { warden, fight, live, step } = setup();
    fight.denCleared = true;
    step(fightTuning.riseTime + 3);
    for (let k = 0; k < 6; k++) while (fight.crystal[k] > 0) fight.strike(k);
    step(3); warden.damage(80); step(4);
    expect([...live.values()].sort()).toEqual(['brute', 'seer']);
  });
  it('reset puts everything back: the Warden dormant where it was, pillars down, Shaped gone', () => {
    const { warden, pillars, fight, live, step } = setup();
    fight.homeHeading = 0.7;
    step(fightTuning.riseTime + 3);
    for (let k = 0; k < 6; k++) while (fight.crystal[k] > 0) fight.strike(k);
    step(3); warden.damage(80); step(4);
    expect(live.size).toBeGreaterThan(0);
    fight.reset();
    expect(fight.phase).toBe(FIGHT.IDLE);
    expect(warden.state).toBe(W.DORMANT);
    expect(warden.hp).toBe(WARDEN_FIGHT.hp);
    expect([warden.body.x, warden.body.z]).toEqual([0, 0]);
    expect(warden.body.heading).toBeCloseTo(0.7);
    expect(Array.from(pillars.up.slice(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);
    expect(live.size).toBe(0);
    expect(Array.from(warden.joint)).toEqual([0, 0, 0, 0]);
  });
});

describe('cover against the spikes', () => {
  it('a cover wall blocks the line from the Warden’s back to a Wraith sheltering behind it', () => {
    const table = {}; const put = (id, pos) => { table[id] = { pos }; };
    put('monastery', [0, 400]); put('camp-frost', [300, 0]); put('spring-frost', [600, 0]); put('varo-rise', [0, -300]); put('den-frost', [-300, 0]);
    for (let k = 1; k <= 5; k++) put('shrine-frost-' + k, [900 + k * 20, 0]);
    put('warden-frost', [0, 0]);
    const sites = frostSites(table);
    const built = buildArchitecture(sites);
    const solids = createSolids(sites, built);
    for (const s of solids.sites) s.seat = 0;
    const cover = sites.find((s) => s.id === 'warden-cover-1');
    const d = Math.hypot(cover.at[0], cover.at[1]), ux = cover.at[0] / d, uz = cover.at[1] / d;
    const ray = (px, pz) => { solids.ax = 0; solids.ay = 12; solids.az = 0; solids.bx = px; solids.by = 1.2; solids.bz = pz; return solids.segBlocked(); };
    expect(ray(cover.at[0] + ux * 1.8, cover.at[1] + uz * 1.8)).toBe(true);      // right behind it
    expect(ray(cover.at[0] + ux * 3.5, cover.at[1] + uz * 3.5)).toBe(true);      // a step or two back
    expect(ray(cover.at[0] - ux * 2, cover.at[1] - uz * 2)).toBe(false);         // in front of it
    // Every point on the ring the Wraith fights on has cover within an easy run.
    let worst = 0;
    // (Closer in than 10 m the Wraith is under the Warden, whose own bulk shelters it from an
    // aimed spike: spikes.js tests the body for those.)
    for (let a = 0; a < Math.PI * 2; a += 0.05) for (const r of [10, 15, 20, 25, 30, 35, 40, 45]) {
      let best = 1e9;
      for (const s of sites) {
        if (!s.id.startsWith('warden-cover') && !s.id.startsWith('warden-pillar')) continue;
        const sd = Math.hypot(s.at[0], s.at[1]), bx = s.at[0] + s.at[0] / sd * 1.8, bz = s.at[1] + s.at[1] / sd * 1.8;
        best = Math.min(best, Math.hypot(bx - Math.sin(a) * r, bz - Math.cos(a) * r));
      }
      worst = Math.max(worst, best);
    }
    expect(worst).toBeLessThan(5.2 * 3.3);     // the charge lasts 3.5 s; a walk is 5.2 m/s (surf is faster)
    expect(ARENA.cover).toBeGreaterThanOrEqual(8);
  });
});
