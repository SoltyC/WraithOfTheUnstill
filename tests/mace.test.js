import { describe, it, expect } from 'vitest';
import { weaponDefs } from '../src/game/weapons/defs.js';
import { tierDef, TIER_INFO, TIER_DMG, clearTierCache, hasTiers } from '../src/game/weapons/tiers.js';
import { plungeDamage, tollRadius, tollFalloff, reboundHeight, reboundKeep, launchSpeed, StoredHeight, inStar } from '../src/game/weapons/plungeMath.js';
import { airRise, airTuning } from '../src/game/shaped/airborne.js';
import { S } from '../src/game/shaped/shaped.js';
import { FLOW_EVENT } from '../src/game/flow.js';
import { world, target } from './weaponWorld.js';

const P = weaponDefs.mace.plunge;
const tierUp = (n) => (inv) => { for (let k = 0; k < n; k++) inv.upgrade('mace'); };
/** Put the Wraith `y` m up, still, and let two frames settle. */
const lift = (w, y, x = 0, z = 0) => { w.controller.pos.x = x; w.controller.pos.z = z; w.controller.pos.y = y; w.controller.grounded = false; w.controller.vel.x = 0; w.controller.vel.y = 0; w.controller.vel.z = 0; w.step(2); };
/** Plunge from `y` m and run until the blow has landed and the machine has begun its recovery. */
const plungeFrom = (w, y, x = 0, z = 0) => {
  lift(w, y, x, z);
  w.step(1, { press: true });
  for (let k = 0; k < 120 && w.weapons.plunge.falling; k++) w.step(1);
  return w.weapons.plunge.last;
};
const hpOf = (w, i) => w.shaped.slots[i].hp;

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
