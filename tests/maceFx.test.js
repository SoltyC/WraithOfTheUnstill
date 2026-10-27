import { describe, it, expect } from 'vitest';
import { weaponDefs } from '../src/game/weapons/defs.js';
import { tierDef, TIER_INFO, TIER_DMG, clearTierCache, hasTiers } from '../src/game/weapons/tiers.js';
import { plungeDamage, tollRadius, tollFalloff, reboundHeight, reboundKeep, launchSpeed, StoredHeight, inStar } from '../src/game/weapons/plungeMath.js';
import { airRise, airTuning } from '../src/game/shaped/airborne.js';
import { S } from '../src/game/shaped/shaped.js';
import { FLOW_EVENT } from '../src/game/flow.js';
import { world, target } from './weaponWorld.js';
import { P, tierUp, lift, plungeFrom, hpOf } from './maceHelpers.js';

describe('the ice star', () => {
  const frozenRing = (w, n, dist) => {
    const ids = [];
    for (let k = 0; k < n; k++) {
      const a = 0.35 + k * Math.PI / 3 * 2, x = Math.sin(a) * dist, z = Math.cos(a) * dist, i = target(w, 'hound', z, x);
      w.shaped.freeze(i, 60); ids.push(i);
    }
    return ids;
  };
  const iceUnder = (w) => { w.frost.tx = 0; w.frost.tz = 0; w.frost.ty = 0; w.frost.castCrystal = true; w.frost.dt = 1 / 60; w.frost.update(); for (let k = 0; k < 40; k++) { w.frost.dt = 1 / 60; w.frost.update(); } w.shaped.freeze; };
  it('cracks the ice in a six-armed star of h/2 m and shatters every frozen Shaped in it, each through onShatter', () => {
    const w = world('mace');
    let shattered = 0; w.combat.onShatter = () => { shattered++; };
    const ids = frozenRing(w, 3, 5.6);                           // on the arms, beyond the toll (3.8 m at 14 m)
    iceUnder(w);
    expect(w.frost.iceAt(0, 0)).toBe(true);
    for (const i of ids) w.shaped.freeze(i, 60);
    const last = plungeFrom(w, 14);
    expect(last.star).toBe(true);
    expect(last.shatters).toBe(3);
    expect(shattered).toBe(3);
    for (const i of ids) expect(w.shaped.isLive(i)).toBe(false);
    expect(w.flow.counts[FLOW_EVENT.SHATTER]).toBeGreaterThanOrEqual(3);          // +0.6 Flow each
  });
  it('needs real ice under the bell: on plain snow it is only the powder ring', () => {
    const w = world('mace');
    let shattered = 0; w.combat.onShatter = () => { shattered++; };
    const ids = frozenRing(w, 3, 5.6);
    expect(w.frost.iceAt(0, 0)).toBe(false);
    const last = plungeFrom(w, 14);
    expect(last.star).toBe(false);
    expect(shattered).toBe(0);
    for (const i of ids) expect(w.shaped.isLive(i)).toBe(true);
  });
  it('needs 6 m of height', () => {
    const w = world('mace'); iceUnder(w);
    const ids = frozenRing(w, 3, 3.0);
    const last = plungeFrom(w, 4.5);
    expect(last.star).toBe(false);
    void ids;
  });
  it('knows ice: a Sweep\'s lane for a while, a Crystallize sheet for good, a tarn by its hook', () => {
    const w = world('mace');
    expect(w.frost.iceAt(3, 3)).toBe(false);
    w.frost.x = 0; w.frost.z = 0; w.frost.aimX = 0; w.frost.aimZ = 1; w.frost.castSweep = true; w.frost.dt = 1 / 60; w.frost.update();
    expect(w.frost.iceAt(0, 5)).toBe(true);
    expect(w.frost.iceAt(9, 5)).toBe(false);
    for (let k = 0; k < 60 * 14; k++) { w.frost.dt = 1 / 60; w.frost.update(); }
    expect(w.frost.iceAt(0, 5)).toBe(false);                     // the lane slushes away
    w.frost.tarnAt = (x) => x > 100;
    expect(w.frost.iceAt(101, 0)).toBe(true);
  });
  it('lays six arms: a point on an arm is in the star, one between two arms beyond the toll is not', () => {
    expect(inStar(0, 0, 0.35, 7, 0.9, Math.sin(0.35) * 6, Math.cos(0.35) * 6)).toBe(true);
    expect(inStar(0, 0, 0.35, 7, 0.9, Math.sin(0.35 + Math.PI / 3) * 6, Math.cos(0.35 + Math.PI / 3) * 6)).toBe(true);
    expect(inStar(0, 0, 0.35, 7, 0.9, Math.sin(0.35 + Math.PI / 6) * 6, Math.cos(0.35 + Math.PI / 6) * 6)).toBe(false);
    expect(inStar(0, 0, 0.35, 7, 0.9, 12, 0)).toBe(false);
  });
});

describe('Flow and the glide', () => {
  it('Flow 3: a plunge from 12 m or more leaves a small Updraft (half strength, 1.2 s) with no focus spent', () => {
    const w = world('mace', {}, null, { gale: true });
    w.flow.setValue(3);
    plungeFrom(w, 14);
    expect(w.weapons.plunge.stats.thunder).toBe(1);
    w.step(20);
    const half = w.gale.liftAt(0, 1, 0);
    expect(half).toBeGreaterThan(10);                              // half strength: it still lifts
    expect(half).toBeLessThan(24);                                 // an Updraft at full strength gives 42 m/s2 on the axis
    w.step(80);                                                    // 1.2 s: gone
    expect(w.gale.liftAt(0, 1, 0)).toBe(0);
    const low = world('mace', {}, null, { gale: true }); low.flow.setValue(3);
    plungeFrom(low, 8);
    expect(low.weapons.plunge.stats.thunder).toBe(0);
    const none = world('mace', {}, null, { gale: true });
    plungeFrom(none, 14);
    expect(none.weapons.plunge.stats.thunder).toBe(0);
  });
  it('Flow 2 and above: the rebound decays 20 % instead of 30 %', () => {
    const r = (tier) => { const w = world('mace'); target(w, 'hound', 0.2); target(w, 'hound', 0.2, 0.15); w.flow.setValue(tier); return plungeFrom(w, 14, 0, 0.2).rebound; };
    expect(r(0)).toBeCloseTo(7, 0); expect(r(2)).toBeCloseTo(7, 0);          // the first rebound loses nothing at either
    expect(reboundHeight(P, 10, 1, 2)).toBeGreaterThan(reboundHeight(P, 10, 1, 1));
  });
  it('a plunge begun in a glide keeps 60 % of its speed, one begun on foot 35 %', () => {
    const run = (glide) => { const w = world('mace'); lift(w, 10); w.controller.vel.x = 10; if (glide) w.controller.glide.active = true; w.step(1, { press: true }); return w.controller.vel.x; };
    expect(run(false)).toBeCloseTo(3.5, 0);
    expect(run(true)).toBeCloseTo(6, 0);
  });
  it('shuts the glide while it falls and for a moment after the rebound', () => {
    const w = world('mace'); target(w, 'hound', 0.2);
    lift(w, 10, 0, 0.2); w.step(1, { press: true });
    expect(w.controller.glide.blocked).toBe(true);
    for (let k = 0; k < 120 && w.weapons.plunge.falling; k++) w.step(1);
    expect(w.controller.glide.blocked).toBe(true);
    w.step(30);
    expect(w.controller.glide.blocked).toBe(false);
  });
});

describe('forge tiers', () => {
  it('has five, following the pattern of the other weapons: I, III and V change play, II and IV are weight', () => {
    expect(hasTiers('mace')).toBe(true);
    expect(TIER_INFO.mace.length).toBe(6);
    expect(TIER_INFO.mace.slice(1).map((t) => t.move)).toEqual([true, false, true, false, true]);
    for (const id of ['staff', 'sickles', 'maul', 'glaive', 'flail']) expect(TIER_INFO[id].slice(1).map((t) => t.move)).toEqual(TIER_INFO.mace.slice(1).map((t) => t.move));
  });
  it('I: the hop-swing rises 4 m instead of 2.5 m, so a plunge works from flat ground with no Gale', () => {
    clearTierCache();
    expect(tierDef(weaponDefs.mace, 0).heavy.hop).toBe(2.5);
    expect(tierDef(weaponDefs.mace, 1).heavy.hop).toBe(4);
    const apex = (n) => {
      const w = world('mace', {}, tierUp(n));
      target(w, 'hound', 1.6);
      w.step(1, { press: true, down: true }); w.step(40, { down: true }); w.step(1, { down: false });
      let top = 0; for (let k = 0; k < 90; k++) { w.step(1); top = Math.max(top, w.controller.pos.y); }
      return top;
    };
    expect(apex(0)).toBeGreaterThan(2.3); expect(apex(0)).toBeLessThan(3.1);
    expect(apex(1)).toBeGreaterThan(3.8); expect(apex(1)).toBeLessThan(4.7);
  });
  it('II and IV: +12 % each; IV also widens the toll by 0.6 m; V: Thunderhead', () => {
    expect(TIER_DMG[2]).toBe(1.12); expect(TIER_DMG[4]).toBe(1.25);
    expect(tierDef(weaponDefs.mace, 2).dmgMul).toBe(1.12);
    expect(tollRadius(tierDef(weaponDefs.mace, 3).plunge, 10)).toBeCloseTo(3.2, 5);
    expect(tollRadius(tierDef(weaponDefs.mace, 4).plunge, 10)).toBeCloseTo(3.8, 5);
    expect(tierDef(weaponDefs.mace, 4).plunge.thunder).toBe(false);
    expect(tierDef(weaponDefs.mace, 5).plunge.thunder).toBe(true);
    expect(tierDef(weaponDefs.mace, 2).infusable).toBe(false);
    expect(tierDef(weaponDefs.mace, 3).infusable).toBe(true);
    // The base def is never changed by a forged one.
    expect(weaponDefs.mace.plunge.tollBonus).toBe(0); expect(weaponDefs.mace.plunge.thunder).toBe(false); expect(weaponDefs.mace.heavy.hop).toBe(2.5);
  });
  it('II lands the plunge 12 % harder through the shared strike path', () => {
    const hit = (n) => { const w = world('mace', {}, tierUp(n)), i = target(w, 'brute', 0.2), h0 = hpOf(w, i); plungeFrom(w, 10, 0, 0.2); return h0 - hpOf(w, i); };
    expect(hit(2) / hit(0)).toBeCloseTo(1.12, 1);
  });
  it('V: every plunge from 12 m or more leaves the small Updraft, at any Flow', () => {
    const w = world('mace', {}, tierUp(5), { gale: true });
    plungeFrom(w, 14);
    expect(w.weapons.plunge.stats.thunder).toBe(1);
    const low = world('mace', {}, tierUp(5), { gale: true });
    plungeFrom(low, 9);
    expect(low.weapons.plunge.stats.thunder).toBe(0);
  });
  it('III: a gale bell rebounds 2 m higher; a frost bell freezes the ring on the third plunge in a chain', () => {
    const reb = (inf) => {
      const w = world('mace', {}, (inv) => { for (let k = 0; k < 3; k++) inv.upgrade('mace'); if (inf) inv.infuse('mace', inf); });
      target(w, 'hound', 0.2);
      return plungeFrom(w, 10, 0, 0.2).rebound;
    };
    expect(reb('gale') - reb(null)).toBeCloseTo(2, 1);
    const ring = (inChain) => {
      const w = world('mace', {}, (inv) => { for (let k = 0; k < 3; k++) inv.upgrade('mace'); inv.infuse('mace', 'frost'); });
      const b = target(w, 'brute', 1.8);
      w.weapons.plunge.st.inChain = inChain;
      plungeFrom(w, 8, 0, 0);
      return w.shaped.isFrozen(b);
    };
    expect(ring(0)).toBe(false); expect(ring(1)).toBe(false);
    expect(ring(2)).toBe(true);                                   // the third plunge of the chain
  });
});

