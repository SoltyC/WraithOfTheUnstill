import { describe, it, expect } from 'vitest';
import { weaponDefs } from '../src/game/weapons/defs.js';
import { tierDef, TIER_INFO, TIER_DMG, clearTierCache, hasTiers } from '../src/game/weapons/tiers.js';
import { plungeDamage, tollRadius, tollFalloff, reboundHeight, reboundKeep, launchSpeed, StoredHeight, inStar } from '../src/game/weapons/plungeMath.js';
import { airRise, airTuning } from '../src/game/shaped/airborne.js';
import { S } from '../src/game/shaped/shaped.js';
import { FLOW_EVENT } from '../src/game/flow.js';
import { world, target } from './weaponWorld.js';
import { P, tierUp, lift, plungeFrom, hpOf } from './maceHelpers.js';

describe('the damage curve and the numbers', () => {
  it('is 18 + 3.2 h, capped at 20 m: 18 from a hop, about 50 from one Updraft, 82 at the cap', () => {
    expect(plungeDamage(P, 0)).toBeCloseTo(18, 5);
    expect(plungeDamage(P, 10)).toBeCloseTo(50, 5);
    expect(plungeDamage(P, 14)).toBeCloseTo(62.8, 5);
    expect(plungeDamage(P, 20)).toBeCloseTo(82, 5);
    expect(plungeDamage(P, 35)).toBeCloseTo(82, 5);
    expect(plungeDamage(P, -3)).toBeCloseTo(18, 5);
  });
  it('rings a toll of 1.6 + 0.16 h metres (4.8 at the cap), the edge taking 40 %', () => {
    expect(tollRadius(P, 0)).toBeCloseTo(1.6, 5);
    expect(tollRadius(P, 10)).toBeCloseTo(3.2, 5);
    expect(tollRadius(P, 20)).toBeCloseTo(4.8, 5);
    expect(tollRadius(P, 50)).toBeCloseTo(4.8, 5);
    expect(tollFalloff(P, 0, 3)).toBeCloseTo(1, 5);
    expect(tollFalloff(P, 3, 3)).toBeCloseTo(0.4, 5);
    expect(tollFalloff(P, 9, 3)).toBeCloseTo(0.4, 5);
  });
  it('takes at most the maul smash\'s 56 on a Warden, whatever the height', () => {
    expect(P.wardenCap).toBe(weaponDefs.maul.heavy.dmg);
    expect(plungeDamage(P, 20, true)).toBe(56);
    expect(plungeDamage(P, 5, true)).toBeCloseTo(34, 5);          // below the cap it is the same blow
    expect(plungeDamage(P, 12, true)).toBeCloseTo(56, 5);
    expect(plungeDamage(P, 20, false)).toBeGreaterThan(56);
  });
  it('is the weakest weapon on the ground: a 9, 9, 14 combo with a 2 m reach, and an 11-damage hop-swing', () => {
    const d = weaponDefs.mace;
    expect(d.combo.map((a) => a.dmg)).toEqual([9, 9, 14]);
    for (const a of d.combo) expect(a.reach).toBe(2.0);
    expect(d.heavy.dmg).toBe(11);
    for (const id of ['staff', 'sickles', 'maul', 'glaive', 'flail']) expect(weaponDefs[id].combo.reduce((s, a) => s + a.dmg, 0)).toBeGreaterThanOrEqual(d.combo.reduce((s, a) => s + a.dmg, 0));
  });
});

describe('the stored height h', () => {
  it('is the drop from the highest point since the Wraith last stood on the ground', () => {
    const hs = new StoredHeight();
    hs.y = 0; hs.rest();
    for (const y of [1, 3, 8, 12, 9, 5]) { hs.y = y; hs.fly(); }       // up to 12, then down
    expect(hs.top).toBe(12);
    expect(hs.h(0)).toBe(12);
    expect(hs.h(2)).toBe(10);                 // to an impact point on higher ground
    hs.y = 0; hs.rest();
    expect(hs.h(0)).toBe(0);
  });
  it('counts a glide\'s sink at half, so a long glide is not a free charge', () => {
    const glideDown = (gliding) => { const hs = new StoredHeight(); hs.y = 20; hs.rest(); for (let y = 19; y >= 0; y--) { hs.y = y; hs.gliding = gliding; hs.fly(); } return hs.h(0); };
    expect(glideDown(false)).toBeCloseTo(20, 5);
    expect(glideDown(true)).toBeCloseTo(10, 5);
    // A climb in the glide (ridge lift, an Updraft) counts in full.
    const hs = new StoredHeight(); hs.y = 0; hs.rest(); for (let y = 1; y <= 9; y++) { hs.y = y; hs.gliding = true; hs.fly(); }
    expect(hs.h(0)).toBe(9);
  });
  it('is paid out in the world: a plunge from 10 m lands 10 m of stored height, 50 damage and a toll of 3.2 m', () => {
    const w = world('mace');
    const last = plungeFrom(w, 10);
    expect(last.h).toBeCloseTo(10, 0);
    expect(last.dmg).toBeCloseTo(18 + 3.2 * last.h, 5);
    expect(last.radius).toBeCloseTo(1.6 + 0.16 * last.h, 5);
    expect(last.hits).toBe(0);
  });
  it('caps at 20 m for damage but the telegraph reads on', () => {
    const w = world('mace');
    lift(w, 30);
    expect(w.weapons.plunge.hNow).toBeCloseTo(30, 0);
    expect(w.weapons.plunge.cap).toBe(true);
    const last = plungeFrom(w, 30);
    expect(last.dmg).toBeCloseTo(82, 5);
    expect(last.radius).toBeCloseTo(4.8, 5);
  });
  it('reads in the glow: dull on the ground, rising with the height stored', () => {
    const w = world('mace');
    w.step(10);
    expect(w.weapons.plunge.glow).toBe(0);
    lift(w, 5); w.step(30); const g5 = w.weapons.plunge.glow;
    lift(w, 12); w.step(30); const g12 = w.weapons.plunge.glow;
    lift(w, 20); w.step(30); const g20 = w.weapons.plunge.glow;
    expect(g5).toBeGreaterThan(0.15); expect(g12).toBeGreaterThan(g5 + 0.2); expect(g20).toBeGreaterThan(g12 + 0.2);
    expect(g20).toBeLessThanOrEqual(1);
  });
  it('commits only with 2.5 m of air under the Wraith: below that, LMB is an ordinary air swing', () => {
    const w = world('mace');
    lift(w, 1.5); w.step(1, { press: true }); w.step(3);
    expect(w.weapons.plunge.falling).toBe(false);
    expect(w.weapons.machine.phase).not.toBe(0);                // a swing began
    const v = world('mace'); lift(v, 3.5); v.step(1, { press: true });
    expect(v.weapons.plunge.falling).toBe(true);
  });
});

describe('the plunge strikes the crown, rings the toll and rebounds', () => {
  it('kills a hound underneath and throws the Wraith back up 0.5 h', () => {
    const w = world('mace'), i = target(w, 'hound', 0.2);
    const last = plungeFrom(w, 10, 0, 0.2);
    expect(last.hits).toBe(1);
    expect(hpOf(w, i)).toBeLessThanOrEqual(0);
    expect(last.rebound).toBeCloseTo(0.5 * last.h, 1);
    expect(w.controller.vel.y).toBeGreaterThan(5);
    expect(w.controller.grounded).toBe(false);
    expect(w.flow.counts[FLOW_EVENT.WEAPON_HEAVY]).toBeGreaterThan(0);        // a heavy through the shared strike path
  });
  it('takes 40 % at the edge of the toll and full at the centre', () => {
    const lost = (z) => { const w = world('mace'), i = target(w, 'brute', z); const h0 = hpOf(w, i); plungeFrom(w, 12, 0, 0); return h0 - hpOf(w, i); };
    const R = tollRadius(P, 12);
    const centre = lost(0.1), edge = lost(R + 0.2);
    expect(centre).toBeGreaterThan(0);
    expect(edge / centre).toBeLessThan(0.7);
    expect(edge / centre).toBeGreaterThan(0.3);
  });
  it('misses: nothing under it leaves the Wraith on one knee for 0.55 s, unable to walk', () => {
    const w = world('mace');
    plungeFrom(w, 8);
    const m = w.weapons.machine;
    expect(w.weapons.plunge.last.hits).toBe(0);
    w.step(12);                                                  // 0.2 s: past the blow, in the kneel
    expect(m.attack.kneel).toBe(true);
    expect(w.controller.walkMul).toBe(0);
    expect(m.attack.recover).toBe(0.55);
    w.step(Math.round(0.7 * 60));
    expect(m.phase).toBe(0);
    expect(w.controller.walkMul).toBe(1);
  });
  it('the dent scales with the height: the maul\'s crater only at the cap', () => {
    const dentOf = (y) => { const w = world('mace'); const dents = []; const ts = w.weapons; void ts; plungeFrom(w, y); return w.stamps.length; };
    expect(dentOf(20)).toBeGreaterThan(dentOf(3));              // more cracks and rings at height
  });
  it('strikes the crown: a den mother\'s rime turns a staff aside but not a plunge', () => {
    const lostTo = (weapon, press) => {
      const w = world(weapon), i = target(w, 'denmother', 0.3), h0 = hpOf(w, i);
      if (weapon === 'mace') plungeFrom(w, 10, 0, 0.3); else w.step(40, press);
      return h0 - hpOf(w, i);
    };
    const plunge = lostTo('mace'), staff = lostTo('staff', { press: true });
    expect(plunge).toBeGreaterThan(40);                          // 18 + 3.2 h at about 9-10 m: not divided by her armour
    expect(plunge).toBeGreaterThan(staff * 2);
  });
  it('counts poise double from 8 m: the brute staggers at the edge of a tall toll, not a short one', () => {
    const stagger = (y) => {
      const w = world('mace'), hc = y, R = tollRadius(P, hc), i = target(w, 'brute', R + 0.1 + 0.4);
      plungeFrom(w, y, 0, 0);
      return w.shaped.slots[i].state === S.STAGGER;
    };
    expect(stagger(10)).toBe(true);
    expect(stagger(6)).toBe(false);
  });
  it('aim assist bends the line up to 2.5 m toward the nearest Shaped below', () => {
    const w = world('mace'), i = target(w, 'hound', 0, 2.0);        // 2 m to the side of the line
    const last = plungeFrom(w, 12, 0, 0);
    expect(last.hits).toBeGreaterThan(0);
    expect(w.shaped.slots[i].hp).toBeLessThan(40);
    const far = world('mace'); target(far, 'hound', 0, 5.0);
    expect(plungeFrom(far, 12, 0, 0).hits).toBe(0);
  });
});

describe('the rebound and its decay', () => {
  it('keeps 70 % of its height each time in a chain, 80 % at Flow 2 and above', () => {
    expect(reboundKeep(P, 0, 0)).toBe(1);
    expect(reboundKeep(P, 1, 0)).toBeCloseTo(0.7, 5);
    expect(reboundKeep(P, 2, 0)).toBeCloseTo(0.49, 5);
    expect(reboundKeep(P, 2, 2)).toBeCloseTo(0.64, 5);
    expect(reboundKeep(P, 1, 3)).toBeCloseTo(0.8, 5);
    expect(reboundHeight(P, 10, 0, 0)).toBeCloseTo(5, 5);
    expect(reboundHeight(P, 10, 1, 0)).toBeCloseTo(3.5, 5);
    expect(reboundHeight(P, 10, 2, 0)).toBeCloseTo(2.45, 5);
    expect(reboundHeight(P, 20, 0, 0)).toBe(8);                  // max 8 m
    expect(reboundHeight(P, 10, 0, 0, P.infuseRebound)).toBeCloseTo(7, 5);
    expect(launchSpeed(5, 24)).toBeCloseTo(Math.sqrt(240), 5);
  });
  it('carries one plunge into the next, each rebound lower, until the Wraith touches ground', () => {
    const w = world('mace');
    target(w, 'brute', 0.2);                                     // 160 hp: it takes both blows
    const r1 = { ...plungeFrom(w, 16, 0, 0.2) };
    expect(r1.hits).toBe(1);
    expect(r1.rebound).toBeCloseTo(8, 1);                        // 0.5 h, max 8 m
    const plunge = w.weapons.plunge;
    for (let k = 0; k < 90 && w.controller.vel.y > 0; k++) w.step(1);
    expect(plunge.chain).toBe(1);
    expect(plunge.hNow).toBeGreaterThan(6);                      // the rebound's height is the new stored height
    w.step(1, { press: true });
    for (let k = 0; k < 120 && plunge.falling; k++) w.step(1);
    const r2 = plunge.last;
    expect(plunge.stats.plunges).toBe(2);
    expect(r2.hits).toBe(1);
    expect(r2.h).toBeLessThan(r1.h);
    expect(r2.rebound).toBeCloseTo(0.5 * r2.h * 0.7, 1);         // the second rebound keeps 70 %
    expect(r2.chain).toBe(2);
  });
  it('is reset by touching the ground', () => {
    const w = world('mace'), i = target(w, 'hound', 0.2);
    plungeFrom(w, 10, 0, 0.2);
    expect(w.weapons.plunge.chain).toBe(1);
    w.step(200);                                                 // fall and stand
    expect(w.controller.grounded).toBe(true);
    expect(w.weapons.plunge.chain).toBe(0);
    expect(i).toBeGreaterThanOrEqual(0);
  });
  it('a rebound plunge is a chain for Flow', () => {
    const w = world('mace'); target(w, 'hound', 0.2); target(w, 'hound', 0.2, 0.2);
    plungeFrom(w, 14, 0, 0.2);
    const chains0 = w.flow.counts[8];
    for (let k = 0; k < 90 && w.controller.vel.y > 0; k++) w.step(1);
    w.step(1, { press: true });
    expect(w.flow.counts[8]).toBe(chains0 + 1);
  });
});

