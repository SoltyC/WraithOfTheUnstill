import { describe, it, expect } from 'vitest';
import { weaponDefs } from '../src/game/weapons/defs.js';
import { tierDef, clearTierCache, TIER_INFO } from '../src/game/weapons/tiers.js';
import { FlailHead } from '../src/game/weapons/flailHead.js';
import { arc } from '../src/game/weapons/arcs.js';
import { S } from '../src/game/shaped/shaped.js';
import { FLOW_EVENT } from '../src/game/flow.js';
import { world, target } from './weaponWorld.js';

const tierUp = (id, n) => (inv) => { for (let k = 0; k < n; k++) inv.upgrade(id); };
const lostIn = (w, i, steps, input) => { const hp0 = w.shaped.slots[i].hp; w.step(steps, input); return hp0 - w.shaped.slots[i].hp; };

describe('the glaive', () => {
  it('a two-hit run cuts a hound on each flank', () => {
    const w = world('glaive');
    const r = target(w, 'hound', 0.5, 2.6), l = target(w, 'hound', 0.5, -2.6);
    const hr = w.shaped.slots[r].hp, hl = w.shaped.slots[l].hp;
    for (let k = 0; k < 60; k++) w.step(1, { press: k === 0 || k === 14 });
    expect(w.shaped.slots[r].hp).toBeLessThan(hr);
    expect(w.shaped.slots[l].hp).toBeLessThan(hl);
    expect(w.flow.counts[FLOW_EVENT.WEAPON_LIGHT]).toBeGreaterThan(0);
  });
  it('the blade\'s tip hits harder than its middle: spacing pays', () => {
    const at = (z) => { const w = world('glaive'), i = target(w, 'brute', z); return lostIn(w, i, 14, { press: true }); };
    expect(at(3.1)).toBeGreaterThan(at(1.6) * 1.2);
  });
  it('the thrust pins a hound where it stands, and the pin runs out', () => {
    const w = world('glaive'), i = target(w, 'hound', 2.4);
    w.step(30, { press: true, down: true }); w.step(1, { down: false }); w.step(14);
    expect(w.shaped.isPinned(i)).toBe(true);
    w.step(100);
    expect(w.shaped.isPinned(i)).toBe(false);
  });
  it('the thrust goes through everything in the lane', () => {
    const w = world('glaive'), a = target(w, 'hound', 2.0), b = target(w, 'hound', 3.7);
    const ha = w.shaped.slots[a].hp, hb = w.shaped.slots[b].hp;
    w.step(30, { press: true, down: true }); w.step(1, { down: false }); w.step(30);
    expect(w.shaped.slots[a].hp).toBeLessThan(ha);
    expect(w.shaped.slots[b].hp).toBeLessThan(hb);
  });
  it('a brute (poise 30) shrugs off a short draw but a long one pins it', () => {
    const run = (hold) => { const w = world('glaive'), i = target(w, 'brute', 2.4); w.step(hold, { press: true, down: true }); w.step(1, { down: false }); w.step(14); return w.shaped.isPinned(i); };
    expect(run(20)).toBe(false);
    expect(run(55)).toBe(true);
  });
  it('a pinned foe is not knocked about by the next blow', () => {
    const w = world('glaive'), i = target(w, 'hound', 2.4);
    w.step(30, { press: true, down: true }); w.step(1, { down: false }); w.step(14);
    expect(w.shaped.isPinned(i)).toBe(true);
    w.shaped.damage(i, 5, true, 3, 0);
    expect(w.shaped.isPinned(i)).toBe(true);
  });
  it('tier 5 flings what the thrust pinned', () => {
    const run = (n) => {
      const w = world('glaive', {}, tierUp('glaive', n)), i = target(w, 'hound', 2.4), hp0 = w.shaped.slots[i].hp;
      w.step(30, { press: true, down: true }); w.step(1, { down: false }); w.step(40);
      return { lost: hp0 - w.shaped.slots[i].hp, pinned: w.shaped.isPinned(i) };
    };
    expect(run(5).pinned).toBe(false);          // released by the fling when the blade comes back
    expect(run(5).lost).toBeGreaterThan(run(4).lost);
  });
});

describe('the lantern flail', () => {
  it('sets what it strikes alight; the fire keeps taking health after the blow', () => {
    const w = world('flail'), i = target(w, 'brute', 2.0);
    w.step(26, { press: true });
    expect(w.weapons.burn.isBurning(i)).toBe(true);
    const hp1 = w.shaped.slots[i].hp;
    w.step(90);
    expect(w.shaped.slots[i].hp).toBeLessThan(hp1);
  });
  it('sedge burns hotter than snow, and an armoured foe burns through its armour', () => {
    const burnOf = (name, z = 2.0) => { const w = world('flail'), i = target(w, name, z); w.step(26, { press: true }); const hp1 = w.shaped.slots[i].hp; w.step(120); return hp1 - w.shaped.slots[i].hp; };
    expect(burnOf('sedgerunner')).toBeGreaterThan(burnOf('hound') * 1.3);
    // the den mother turns most of a steel blow aside; the flame does not care
    const blade = world('sickles'), flame = world('flail');
    const a = target(blade, 'denmother', 2.4), b = target(flame, 'denmother', 2.4);
    blade.step(26, { press: true }); flame.step(26, { press: true });
    const a0 = blade.shaped.slots[a].hp, b0 = flame.shaped.slots[b].hp;
    blade.step(100); flame.step(100);
    expect(b0 - flame.shaped.slots[b].hp).toBeGreaterThan(a0 - blade.shaped.slots[a].hp);
  });
  it('the fire jumps to a Shaped that stands close', () => {
    const w = world('flail'), a = target(w, 'hound', 2.0), b = target(w, 'hound', 2.0, 1.2);
    w.step(26, { press: true });
    w.step(80);
    expect(w.weapons.burn.isBurning(a) || !w.shaped.isLive(a)).toBe(true);
    expect(w.weapons.burn.isBurning(b) || w.shaped.slots[b].hp < 40).toBe(true);
  });
  it('the dead zone: the head cannot strike what is inside the circle of its swing', () => {
    const a = weaponDefs.flail.combo[0];
    arc.px = 0; arc.pz = 0; arc.yaw = 0; arc.a0 = -1; arc.a1 = 1; arc.reach = a.reach; arc.inner = a.inner;
    arc.cx = 0; arc.cz = 0.5; arc.r = 0.3; expect(arc.test()).toBe(false);
    arc.cz = 2.0; expect(arc.test()).toBe(true);
    expect(a.inner).toBeGreaterThan(weaponDefs.glaive.combo[0].inner * 1.8);
  });
  it('melts a frozen Shaped rather than shattering it; a frost-infused flame leaves the ice', () => {
    const w = world('flail'), i = target(w, 'hound', 2.0);
    w.shaped.freeze(i, 30);
    w.step(26, { press: true });
    w.step(4);
    expect(w.shaped.isLive(i)).toBe(true);
    expect(w.shaped.isFrozen(i)).toBe(false);
    const f = world('flail', {}, (inv) => { tierUp('flail', 3)(inv); inv.infuse('flail', 'frost'); }), j = target(f, 'hound', 2.0);
    f.shaped.freeze(j, 30);
    f.step(26, { press: true });
    expect(f.shaped.isFrozen(j) || f.shaped.slots[j].state === S.FROZEN || !f.shaped.isLive(j)).toBe(true);
  });
  it('the whirl strikes a foe behind the Wraith, twice round', () => {
    const w = world('flail'), i = target(w, 'brute', -2.2), hp0 = w.shaped.slots[i].hp;
    w.step(40, { press: true, down: true }); w.step(1, { down: false }); w.step(70);
    expect(hp0 - w.shaped.slots[i].hp).toBeGreaterThan(14);
    expect(w.weapons.stats.heavies).toBe(1);
  });
  it('tier 5 leaves a ring of fire where the whirl ended; tier 4 does not', () => {
    const run = (n) => { const w = world('flail', {}, tierUp('flail', n)); target(w, 'hound', 6); w.step(40, { press: true, down: true }); w.step(1, { down: false }); w.step(80); return w.weapons.burn.zt[0] + w.weapons.burn.zt[1]; };
    expect(run(4)).toBe(0);
    expect(run(5)).toBeGreaterThan(0);
  });
});

describe('the flail\'s head on its chain', () => {
  const hang = () => { const h = new FlailHead(); h.tx = 0; h.ty = 1.5; h.tz = 0; h.ux = 0; h.uy = 1; h.uz = 0; h.len = 1.2; h.dt = 1 / 60; return h; };
  it('hangs below the eye at rest, the cage pointing down', () => {
    const h = hang(); for (let k = 0; k < 90; k++) h.step();
    expect(h.hy).toBeCloseTo(1.5 - 1.2, 1);
    expect(h.dy).toBeLessThan(-0.95);
    expect(h.speed).toBeLessThan(0.1);
  });
  it('is never farther than the chain from the eye, however hard the haft is swung', () => {
    const h = hang(); let worst = 0;
    for (let k = 0; k < 300; k++) {
      h.tx = Math.sin(k * 0.3) * 1.6; h.tz = Math.cos(k * 0.3) * 1.6; h.guide = k % 60 < 30 ? 0.8 : 0.1; h.ux = Math.cos(k * 0.3); h.uz = -Math.sin(k * 0.3); h.uy = 0;
      h.step(); worst = Math.max(worst, Math.hypot(h.hx - h.tx, h.hy - h.ty, h.hz - h.tz));
    }
    expect(worst).toBeLessThanOrEqual(1.2 + 1e-6);
  });
  it('flies out along the haft when the guide is on', () => {
    const h = hang(); h.ux = 1; h.uy = 0; h.uz = 0; h.guide = 1;
    for (let k = 0; k < 40; k++) h.step();
    expect(h.hx).toBeGreaterThan(1.0);
    expect(Math.abs(h.hy - 1.5)).toBeLessThan(0.3);
  });
  it('the chain\'s elbow sags when slack and is on the line when taut', () => {
    const h = hang(); h.tx = 0.2; for (let k = 0; k < 60; k++) h.step();
    const slack = h.my - (h.ty + h.hy) / 2;
    h.ux = 1; h.uy = 0; h.guide = 1; for (let k = 0; k < 40; k++) h.step();
    expect(slack).toBeLessThanOrEqual(0);
    expect(h.my - (h.ty + h.hy) / 2).toBeGreaterThan(slack - 1e-9);
  });
});

describe('forging the glaive and the flail', () => {
  it('tier 1 adds a hit, tier 3 opens the infusion, tier 5 gives the art; the base def is untouched', () => {
    clearTierCache();
    for (const id of ['glaive', 'flail']) {
      const base = weaponDefs[id];
      expect(TIER_INFO[id].map((t) => t && t.move)).toEqual([null, true, false, true, false, true]);
      expect(tierDef(base, 1).combo.length).toBe(base.combo.length + 1);
      expect(tierDef(base, 3).infusable).toBe(true);
      expect(base.combo.length).toBe(3);
    }
    expect(tierDef(weaponDefs.glaive, 5).heavy.fling).toBeTruthy();
    expect(tierDef(weaponDefs.glaive, 4).heavy.fling).toBeUndefined();
    expect(tierDef(weaponDefs.flail, 5).heavy.pyre.radius).toBeGreaterThan(3);
    expect(tierDef(weaponDefs.flail, 4).affinity.burn).toBeGreaterThan(weaponDefs.flail.affinity.burn);
  });
  it('the fourth flail blow turns the wheel the other way', () => {
    const d = tierDef(weaponDefs.flail, 1);
    expect(Math.sign(d.combo[3].strike[6])).toBe(-Math.sign(d.combo[2].strike[6]));
  });
});
