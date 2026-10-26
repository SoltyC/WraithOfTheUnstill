import { describe, it, expect } from 'vitest';
import { weaponDefs } from '../src/game/weapons/defs.js';
import { tierDef, TIER_INFO, TIER_DMG, clearTierCache, hasTiers } from '../src/game/weapons/tiers.js';
import { plungeDamage, tollRadius, tollFalloff, reboundHeight, reboundKeep, launchSpeed, StoredHeight, inStar } from '../src/game/weapons/plungeMath.js';
import { airRise, airTuning } from '../src/game/shaped/airborne.js';
import { S } from '../src/game/shaped/shaped.js';
import { FLOW_EVENT } from '../src/game/flow.js';
import { world, target } from './weaponWorld.js';
import { P, tierUp, lift, plungeFrom, hpOf } from './maceHelpers.js';

describe('the Shaped airborne state', () => {
  it('throws a body up 3-5 m by its weight, holds it near the top for about 0.8 s and sets it down on the ground', () => {
    expect(airRise(40)).toBeGreaterThan(4.3); expect(airRise(40)).toBeLessThan(5);
    expect(airRise(160)).toBeGreaterThan(3); expect(airRise(160)).toBeLessThan(4);
    expect(airRise(900)).toBe(airTuning.riseHeavy);
    const w = world('mace'), i = target(w, 'hound', 3);
    let top = 0, above = 0, steps = 0, landed = 0;
    w.shaped.air.onLand = () => { landed++; };
    w.shaped.air.launch(i);
    for (let k = 0; k < 200; k++) {
      w.step(1); steps++;
      const lift = w.shaped.slots[i].body.lift;
      top = Math.max(top, lift);
      if (lift > top * 0.0 && lift > 0.6 * airRise(40)) above++;
      if (landed) break;
    }
    expect(top).toBeGreaterThan(4); expect(top).toBeLessThan(5.1);
    expect(above / 60).toBeGreaterThan(0.6); expect(above / 60).toBeLessThan(1.0);       // near the top, about 0.8 s
    expect(landed).toBe(1);
    expect(w.shaped.slots[i].body.lift).toBe(0);
    expect(w.shaped.air.isAir(i)).toBe(false);
  });
  it('pauses the AI while up: a stagger that would end in 0.6 s lasts until the landing and runs from there', () => {
    const w = world('mace'), i = target(w, 'hound', 3.2);
    const s = w.shaped.slots[i];
    w.shaped.air.launch(i);
    w.step(50);                                                  // 0.83 s: longer than a hound's stagger
    expect(w.shaped.air.isAir(i)).toBe(true);
    expect(s.state).toBe(S.STAGGER);
    for (let k = 0; k < 120 && w.shaped.air.isAir(i); k++) w.step(1);
    expect(w.shaped.air.isAir(i)).toBe(false);
    w.step(20);
    expect(s.state).toBe(S.STAGGER);                             // the stagger runs from the landing
    w.step(30);
    expect(s.state).toBe(S.STALK);
  });
  it('is thrown up by an Updraft, which also strikes and staggers what it catches', () => {
    const w = world('mace', {}, null, { gale: true }), i = target(w, 'brute', 1.5);
    const hp0 = hpOf(w, i);
    w.step(1, { updraft: true, tx: 0, tz: 1.5 });
    w.step(10);
    expect(w.shaped.air.isAir(i)).toBe(true);
    expect(hpOf(w, i)).toBeLessThan(hp0);
    expect(w.shaped.slots[i].body.lift).toBeGreaterThan(0.3);
  });
});

describe('the dunk', () => {
  it('drives a Shaped caught in the air into the ground, and where it lands a second impact strikes for 60 % in 2.4 m', () => {
    const w = world('mace', {}, null, { gale: true });
    const a = target(w, 'hound', 0, 0), b = target(w, 'hound', 0, 2.5);
    w.shaped.air.launch(a);
    w.step(34);                                                  // up to the top of its arc
    expect(w.shaped.air.isAir(a)).toBe(true);
    const hb0 = hpOf(w, b);
    lift(w, 7.2, 0, 0);
    w.step(1, { press: true });
    for (let k = 0; k < 6 && w.weapons.plunge.falling; k++) w.step(1);
    const pl = w.weapons.plunge;
    expect(pl.falling).toBe(false);
    expect(pl.stats.dunks).toBe(1);
    expect(hpOf(w, b)).toBe(hb0);                                 // outside the first toll: not touched yet
    for (let k = 0; k < 40 && pl.stats.dunkLands === 0; k++) w.step(1);
    expect(pl.stats.dunkLands).toBe(1);
    expect(pl.last.dunkHits).toBe(1);
    const lost = hb0 - hpOf(w, b);
    expect(lost).toBeGreaterThan(0);
    // 60 % of the plunge's damage, less the edge's falloff (the second hound stands 2.5 m off, a hound's body 0.38 m of it).
    const expected = pl.last.dmg * P.dunk * tollFalloff(P, 2.5 - 0.38, P.dunkRadius);
    expect(lost).toBeGreaterThan(expected * 0.8); expect(lost).toBeLessThan(expected * 1.25);
  });
  it('knocks down whatever it lands among, whatever its poise', () => {
    const w = world('mace', {}, null, { gale: true });
    const a = target(w, 'hound', 0, 0), b = target(w, 'brute', 0, 2.2);
    w.shaped.air.launch(a); w.step(34);
    lift(w, 7.2, 0, 0); w.step(1, { press: true });
    for (let k = 0; k < 60 && w.weapons.plunge.stats.dunkLands === 0; k++) w.step(1);
    expect(w.shaped.slots[b].state).toBe(S.STAGGER);
  });
  it('a body on the ground is not dunked: only the toll', () => {
    const w = world('mace'), a = target(w, 'hound', 0, 0);
    plungeFrom(w, 10);
    expect(w.weapons.plunge.stats.dunks).toBe(0);
    expect(w.shaped.air.isAir(a)).toBe(false);
  });
});

describe('the Updraft launch and the Downdraft', () => {
  it('a plunge begun inside a standing column gains 4 m of stored height and collapses the column', () => {
    const w = world('mace', {}, null, { gale: true });
    w.step(1, { updraft: true, tx: 0, tz: 0 });
    // Ride it a moment (the column lifts the Wraith), then plunge from inside it.
    w.step(40);
    expect(w.controller.pos.y).toBeGreaterThan(3);
    const gale = w.gale;
    expect(gale.columnAt(w.controller.pos.x, w.controller.pos.y, w.controller.pos.z)).toBeGreaterThanOrEqual(0);
    const topBefore = w.weapons.plunge.hs.top;
    w.step(1, { press: true });
    expect(w.weapons.plunge.stats.updraftSpent).toBe(1);
    expect(w.weapons.plunge.hs.bonus).toBe(4);
    expect(w.weapons.plunge.hs.top).toBeGreaterThanOrEqual(topBefore);
    expect(gale.columnAt(w.controller.pos.x, w.controller.pos.y, w.controller.pos.z)).toBe(-1);       // spent: it ends at once
    for (let k = 0; k < 200 && w.weapons.plunge.falling; k++) w.step(1);
    expect(w.weapons.plunge.last.bonus).toBe(4);
    expect(w.weapons.plunge.last.h).toBeGreaterThan(w.weapons.plunge.hs.top - 0.01 + 3);
  });
  it('a Downdraft cast in the fall adds 5 m (still capped at 20 for damage), once', () => {
    const w = world('mace');
    lift(w, 8); w.step(1, { press: true }); w.step(2);
    expect(w.weapons.plunge.falling).toBe(true);
    expect(w.weapons.plunge.downdraft(w.weapons.def)).toBe(true);
    expect(w.weapons.plunge.downdraft(w.weapons.def)).toBe(false);
    for (let k = 0; k < 120 && w.weapons.plunge.falling; k++) w.step(1);
    expect(w.weapons.plunge.last.h).toBeCloseTo(13, 0);
    expect(w.weapons.plunge.stats.downdrafts).toBe(1);
    const t = world('mace'); lift(t, 18); t.step(1, { press: true }); t.step(2); t.weapons.plunge.downdraft(t.weapons.def);
    for (let k = 0; k < 120 && t.weapons.plunge.falling; k++) t.step(1);
    expect(t.weapons.plunge.last.dmg).toBeCloseTo(82, 5);
  });
  it('does nothing outside a plunge or with another weapon', () => {
    const w = world('mace');
    expect(w.weapons.plunge.downdraft(w.weapons.def)).toBe(false);
    const s = world('staff');
    expect(s.weapons.plunge.downdraft(s.weapons.def)).toBe(false);
  });
});

