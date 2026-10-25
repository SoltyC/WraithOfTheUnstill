import { describe, it, expect } from 'vitest';
import { createInventory } from '../src/game/inventory.js';
import { createBuffs } from '../src/game/economy/buffs.js';
import { createTrade } from '../src/game/economy/trade.js';
import { TRADERS } from '../src/game/economy/traders.js';
import { forgeStatus, forge, infuse } from '../src/game/economy/forge.js';
import { createDrop } from '../src/game/economy/drop.js';
import { createPurse, PURSE } from '../src/game/economy/purse.js';
import { applyReward, backPay } from '../src/game/economy/rewards.js';
import { CONSUMABLES, maxHealth, USE_TIME, HEALTH } from '../src/game/economy/items.js';
import { tierDef, TIER_DMG, FORGE_COST, TIER_INFO, clearTierCache } from '../src/game/weapons/tiers.js';
import { weaponDefs } from '../src/game/weapons/defs.js';
import { robeDefence, ROBES } from '../src/game/robes.js';

const rich = () => { const i = createInventory(); i.addMarks(2000); for (const m of ['rime-core', 'hedge-heart', 'turf-amber']) i.addMaterial(m, 20); return i; };

describe('inventory: marks, materials, pouch', () => {
  it('spends marks only when there are enough', () => {
    const i = createInventory();
    expect(i.addMarks(30)).toBe(30);
    expect(i.spendMarks(31)).toBe(false);
    expect(i.marks).toBe(30);
    expect(i.spendMarks(30)).toBe(true);
    expect(i.marks).toBe(0);
    expect(i.addMarks(-5)).toBe(0);
  });
  it('takes materials all or nothing', () => {
    const i = createInventory();
    i.addMaterial('rime-core', 2);
    expect(i.takeMaterials({ 'rime-core': 3 })).toBe(false);
    expect(i.materials['rime-core']).toBe(2);
    expect(i.takeMaterials({ 'rime-core': 2 })).toBe(true);
    expect(i.materials['rime-core']).toBe(0);
  });
  it('holds a stack to its cap and cycles through what is carried', () => {
    const i = createInventory();
    expect(i.addItem('salve', 9)).toBe(CONSUMABLES.salve.cap);
    expect(i.addItem('tea', 1)).toBe(1);
    expect(i.sel).toBe('flask');
    expect(i.cycleItem()).toBe('salve');
    expect(i.cycleItem()).toBe('tea');
    expect(i.cycleItem()).toBe('flask');
    expect(i.selected).toBe('flask');
  });
  it('the flask holds charges, refills at a rest and deepens with a quest', () => {
    const i = createInventory();
    expect(i.flask.charges).toBe(3);
    i.consume('flask'); i.consume('flask');
    expect(i.refillFlask()).toBe(true);
    expect(i.flask.charges).toBe(3);
    expect(i.refillFlask()).toBe(false);
    i.growFlask(1);
    expect(i.flask).toEqual({ charges: 4, max: 4 });
  });
  it('an emptied selection moves on to the next carried item', () => {
    const i = createInventory();
    i.addItem('salve', 1); i.sel = 'salve';
    i.consume('salve');
    expect(i.selected).toBe('flask');
  });
  it('threads add a segment of health each, to the cap', () => {
    const i = createInventory();
    expect(maxHealth(i.threads)).toBe(100);
    for (let k = 0; k < 7; k++) i.addThread();
    expect(i.threads).toBe(HEALTH.maxThreads);
    expect(maxHealth(i.threads)).toBe(100 + 20 * HEALTH.maxThreads);
  });
  it('round-trips through serialize / restore', () => {
    const i = rich(); i.addItem('tonic', 2); i.addThread(); i.growFlask(1); i.consume('flask');
    i.give('maul'); i.upgrade('maul'); i.upgrade('maul'); i.upgrade('maul'); i.infuse('maul', 'frost');
    const j = createInventory(); j.restore(JSON.parse(JSON.stringify(i.serialize())));
    expect(j.serialize()).toEqual(i.serialize());
    expect(j.infusion('maul')).toBe('frost');
  });
  it('an infusion needs tier 3', () => {
    const i = createInventory();
    expect(i.infuse('staff', 'frost')).toBe(false);
    i.upgrade('staff'); i.upgrade('staff'); i.upgrade('staff');
    expect(i.infuse('staff', 'gale')).toBe(true);
  });
});

describe('consumable effects', () => {
  const setup = () => { const inv = createInventory(); inv.addItem('salve', 2); inv.addItem('tea', 1); inv.addItem('tonic', 1); inv.addItem('bread', 1); inv.addItem('draught', 1); return { inv, b: createBuffs(inv) }; };
  /** Step `secs`; returns the health the heal added meanwhile. */
  const run = (b, secs, max = 100) => { let h = 0; for (let t = 0; t < secs; t += 1 / 60) { b.update(1 / 60, max); h += b.heal; } return h; };
  it('a use takes time, then spends the item', () => {
    const { inv, b } = setup();
    b.begin('salve');
    run(b, USE_TIME - 0.1);
    expect(inv.pouch.salve).toBe(2);
    run(b, 0.2);
    expect(inv.pouch.salve).toBe(1);
    expect(b.using).toBeNull();
  });
  it('a salve heals 40% of the maximum over three seconds, in a trickle', () => {
    const { b } = setup();
    b.begin('salve');
    let total = 0, frames = 0;
    for (let t = 0; t < 4.5; t += 1 / 60) { b.update(1 / 60, 100); total += b.heal; if (b.heal > 0) frames++; }
    expect(total).toBeGreaterThan(39.5); expect(total).toBeLessThan(40.6);
    expect(frames).toBeGreaterThan(150);
  });
  it('a blow breaks off a heal, a dodge breaks off a drink', () => {
    const { inv, b } = setup();
    b.begin('salve'); run(b, USE_TIME + 1);
    b.blow = true; b.update(1 / 60, 100);
    let total = 0; for (let t = 0; t < 3; t += 1 / 60) { b.update(1 / 60, 100); total += b.heal; }
    expect(total).toBe(0);
    b.begin('salve'); run(b, 0.2); b.dodge = true; b.update(1 / 60, 100);
    expect(b.broken).toBe(true);
    expect(inv.pouch.salve).toBe(1);                         // the second drink was never spent
  });
  it('the buffs hold their strength for their time and then lapse', () => {
    const { b } = setup();
    for (const id of ['tea', 'tonic', 'bread', 'draught']) { b.begin(id); run(b, USE_TIME + 0.05); }
    expect(b.damageMul).toBe(1.25); expect(b.takenMul).toBe(0.75); expect(b.focusMul).toBe(1.5); expect(b.flowDecayMul).toBe(0.5);
    expect(b.sheen).toBeGreaterThan(0.4);
    run(b, 55);                                  // ~58 s since the tea: the minute-long buffs are in their last seconds
    expect(b.damageMul).toBe(1.25);
    run(b, 6);
    expect(b.damageMul).toBe(1); expect(b.takenMul).toBe(1); expect(b.flowDecayMul).toBe(1); expect(b.focusMul).toBe(1.5);   // bread lasts 90 s
    run(b, 40);
    expect(b.focusMul).toBe(1);
  });
  it('refuses a heal at full health, and an item not carried', () => {
    const { b } = setup();
    expect(b.blocked('salve', 100, 100)).toBe('whole');
    expect(b.blocked('salve', 60, 100)).toBeNull();
    expect(b.blocked('flask', 100, 100)).toBe('whole');
    const inv = createInventory(); const c = createBuffs(inv);
    expect(c.blocked('tea', 10, 100)).toBe('none');
  });
  it('the flask heals 55% and spends a charge', () => {
    const inv = createInventory(), b = createBuffs(inv);
    b.begin('flask');
    let total = 0; for (let t = 0; t < 4.5; t += 1 / 60) { b.update(1 / 60, 120); total += b.heal; }
    expect(inv.flask.charges).toBe(2);
    expect(total).toBeGreaterThan(65); expect(total).toBeLessThan(66.5);
  });
});

describe('trade', () => {
  const setup = (flags = []) => { const inv = createInventory(); inv.addMarks(100); return { inv, t: createTrade({ inventory: inv, test: (c) => !c || (c.flag ? [].concat(c.flag).every((f) => flags.includes(f)) : c.quest ? flags.includes('q:' + c.quest) : true) }) }; };
  it('buys a line: marks leave, the item arrives, the stock falls', () => {
    const { inv, t } = setup();
    expect(t.buy('corin', 'salve')).toBeNull();
    expect(inv.marks).toBe(100 - CONSUMABLES.salve.price);
    expect(inv.pouch.salve).toBe(1);
    expect(t.stock.corin.salve).toBe(3);
  });
  it('refuses when poor, sold out, full or closed', () => {
    const { inv, t } = setup();
    inv.marks = 5;
    expect(t.buy('corin', 'salve')).toBe('marks');
    inv.marks = 500;
    for (let k = 0; k < 4; k++) t.buy('corin', 'salve');
    expect(t.buy('corin', 'salve')).toBe('sold out');
    expect(t.buy('corin', 'tonic')).toBe('closed');
    inv.addItem('bread', 3);
    expect(t.buy('corin', 'bread')).toBe('pouch full');
  });
  it('lines open as quests are done', () => {
    const a = setup(), b = setup(['q:meadow-side-lamp', 'q:meadow-side-echoes', 'meadow:bellwether-released']);
    expect(a.t.lines('corin').map((l) => l.id)).toEqual(['salve', 'bread']);
    expect(b.t.lines('corin').map((l) => l.id)).toEqual(['salve', 'bread', 'tea', 'draught', 'tonic']);
  });
  it('restocks one a rest, never above what the trader began with', () => {
    const { inv, t } = setup(); inv.marks = 500;
    t.buy('corin', 'salve'); t.buy('corin', 'salve');
    t.restock(); expect(t.stock.corin.salve).toBe(3);
    t.restock(); t.restock(); t.restock(); expect(t.stock.corin.salve).toBe(TRADERS.corin.stock[0].qty);
  });
  it('buys materials and spare consumables back at less than they cost', () => {
    const { inv, t } = setup();
    inv.addMaterial('rime-core', 2); inv.addItem('salve', 1);
    const before = inv.marks;
    expect(t.sell('rime-core')).toBeGreaterThan(0);
    expect(t.sell('salve')).toBe(CONSUMABLES.salve.sell);
    expect(CONSUMABLES.salve.sell).toBeLessThan(CONSUMABLES.salve.price);
    expect(inv.marks).toBeGreaterThan(before);
    expect(inv.materials['rime-core']).toBe(1);
    expect(t.sell('rime-core')).toBeGreaterThan(0);
    expect(t.sell('rime-core')).toBe(0);
    expect(t.sellable()).toEqual([]);
    expect(t.sellPrice('maul')).toBe(0);
  });
  it('no round trip makes marks: buying then selling back loses', () => {
    const { inv, t } = setup(); inv.marks = 1000;
    for (const id of Object.keys(CONSUMABLES)) expect(CONSUMABLES[id].sell).toBeLessThan(CONSUMABLES[id].price);
    const m0 = inv.marks; t.buy('corin', 'salve'); t.sell('salve');
    expect(inv.marks).toBeLessThan(m0);
  });
  it('saves and restores the stock', () => {
    const { inv, t } = setup(); inv.marks = 500; t.buy('osk', 'tonic');
    const u = createTrade({ inventory: inv, test: () => true });
    u.restore(JSON.parse(JSON.stringify(t.serialize())));
    expect(u.stock.osk.tonic).toBe(2);
    u.restore(null);
    expect(u.stock.osk.tonic).toBe(3);
  });
});

describe('forge', () => {
  it('raises a weapon one tier for marks and materials', () => {
    const inv = rich();
    const m0 = inv.marks;
    expect(forge(inv, 'staff')).toBeNull();
    expect(inv.tier('staff')).toBe(1);
    expect(inv.marks).toBe(m0 - FORGE_COST[1].marks);
    expect(inv.materials['rime-core']).toBe(20 - 2);
  });
  it('is refused without the marks or the materials, and spends nothing', () => {
    const inv = createInventory();
    expect(forge(inv, 'staff')).toBe('marks');
    inv.addMarks(500);
    expect(forge(inv, 'staff')).toBe('materials');
    expect(inv.marks).toBe(500); expect(inv.tier('staff')).toBe(0);
    expect(forge(inv, 'maul')).toBe('none');
  });
  it('stops at tier five', () => {
    const inv = rich(); inv.addMarks(5000);
    for (let t = 0; t < 5; t++) expect(forge(inv, 'staff')).toBeNull();
    expect(forge(inv, 'staff')).toBe('max');
    expect(forgeStatus(inv, 'staff').next).toBeNull();
  });
  it('tiers 1, 3 and 5 change the move and 2 and 4 are weight, for every weapon', () => {
    for (const id of ['staff', 'sickles', 'maul']) {
      expect(TIER_INFO[id].map((t) => t && t.move)).toEqual([null, true, false, true, false, true]);
      const kinds = TIER_INFO[id].slice(1).map((t) => t.move);
      for (let k = 1; k < 5; k++) expect(kinds[k] && kinds[k - 1]).toBe(false);    // never two weight tiers (nor two moves) abutting by accident
    }
  });
  it('tier 1 lengthens the combo; tier 5 gives the art; tier 3 opens the infusion', () => {
    clearTierCache();
    for (const id of ['staff', 'sickles', 'maul']) {
      const base = weaponDefs[id];
      const t1 = tierDef(base, 1), t3 = tierDef(base, 3), t5 = tierDef(base, 5);
      expect(t1.combo.length).toBe(base.combo.length + 1);
      expect(t1.infusable).toBe(false); expect(t3.infusable).toBe(true);
      expect(t5.combo.length).toBe(base.combo.length + 1);
      expect(tierDef(base, 0)).toBe(base);
      expect(tierDef(base, 5)).toBe(t5);               // cached: built once
      expect(base.combo.length).toBe(t1.combo.length - 1);   // the base def is never touched
    }
    expect(tierDef(weaponDefs.staff, 5).heavy.shock).toBeTruthy();
    expect(tierDef(weaponDefs.staff, 4).heavy.shock).toBeUndefined();
    expect(tierDef(weaponDefs.sickles, 5).heavy.passes).toBe(3);
    expect(tierDef(weaponDefs.sickles, 5).heavy.pull).toBeGreaterThan(0);
    expect(tierDef(weaponDefs.maul, 5).heavy.ring.radius).toBeGreaterThan(weaponDefs.maul.heavy.radius);
  });
  it('damage steps up only on tiers 2 and 4', () => {
    expect(TIER_DMG).toEqual([1, 1, 1.12, 1.12, 1.25, 1.25]);
    expect(tierDef(weaponDefs.maul, 2).dmgMul).toBe(1.12);
  });
  it('infusion needs tier 3 and a known element', () => {
    const inv = rich();
    expect(infuse(inv, 'staff', 'frost')).toBe(false);
    forge(inv, 'staff'); forge(inv, 'staff'); forge(inv, 'staff');
    expect(infuse(inv, 'staff', 'ember')).toBe(false);
    expect(infuse(inv, 'staff', 'frost')).toBe(true);
    expect(inv.infusion('staff')).toBe('frost');
    expect(infuse(inv, 'staff', null)).toBe(true);
    expect(inv.infusion('staff')).toBeNull();
  });
});

describe('death: the dropped marks', () => {
  it('the carried marks fall where the Wraith died, and walking there takes them back', () => {
    const inv = createInventory(), d = createDrop();
    inv.addMarks(80);
    expect(d.die(inv, 10, 20)).toBe(80);
    expect(inv.marks).toBe(0);
    expect(d.active).toBe(true);
    expect(d.recover(inv, 30, 20)).toBe(0);              // too far
    expect(d.recover(inv, 11, 20)).toBe(80);
    expect(inv.marks).toBe(80); expect(d.active).toBe(false);
  });
  it('dying again before recovering loses them; marks earned since drop instead', () => {
    const inv = createInventory(), d = createDrop();
    inv.addMarks(80); d.die(inv, 0, 0);
    inv.addMarks(25);
    d.die(inv, 50, 50);
    expect(d.marks).toBe(25); expect(d.x).toBe(50); expect(d.lost).toBe(80);
    expect(d.recover(inv, 0, 0)).toBe(0);
    d.die(inv, 70, 70);                                   // died with nothing: the 25 are lost too
    expect(d.active).toBe(false); expect(d.lost).toBe(105);
  });
  it('nothing but marks is ever lost', () => {
    const inv = rich(); inv.give('maul'); inv.addItem('salve', 3);
    const d = createDrop(); d.die(inv, 0, 0);
    expect(inv.has('maul')).toBe(true); expect(inv.pouch.salve).toBe(3); expect(inv.materials['rime-core']).toBe(20);
  });
  it('saves and restores the drop', () => {
    const inv = createInventory(), d = createDrop(); inv.addMarks(12); d.die(inv, 3, 4);
    const e = createDrop(); e.restore(JSON.parse(JSON.stringify(d.serialize())));
    expect(e.serialize()).toEqual({ marks: 12, x: 3, z: 4 });
    e.restore(null); expect(e.active).toBe(false);
    expect(createDrop().serialize()).toBeNull();
  });
});

describe('the Shaped\'s purse (no reason to grind)', () => {
  it('pays a mark or two a collapse until it runs dry, then a mark at a time', () => {
    const p = createPurse(); let got = 0;
    for (let k = 0; k < 40; k++) got += p.award('hound');
    expect(got).toBe(PURSE.cap);
    expect(p.award('brute')).toBe(0);
    p.fill(PURSE.secondsPerMark * 3);
    expect(p.award('brute')).toBe(3);
  });
  it('an hour of hunting pays a small fraction of the quests', () => {
    const p = createPurse(); let got = 0;
    for (let s = 0; s < 3600; s++) { p.fill(1); if (s % 5 === 0) got += p.award('brute'); }
    expect(got).toBeLessThan(PURSE.cap + 3600 / PURSE.secondsPerMark + 1);
    expect(got).toBeLessThan(150);
  });
  it('a placed elite pays outright', () => { expect(createPurse().award('denmother')).toBe(12); });
});

describe('quest rewards', () => {
  it('apply marks, materials, items, threads and the flask', () => {
    const inv = createInventory();
    expect(applyReward(inv, { marks: 40 })).toBe('40 marks');
    applyReward(inv, { give: { 'hedge-heart': 2 } });
    applyReward(inv, { item: { salve: 2 } });
    expect(applyReward(inv, { thread: true })).toBeTruthy();
    applyReward(inv, { flask: 1 });
    expect(inv.marks).toBe(40); expect(inv.materials['hedge-heart']).toBe(2); expect(inv.pouch.salve).toBe(2); expect(inv.threads).toBe(1); expect(inv.flask.max).toBe(4);
    expect(applyReward(inv, { setFlag: 'x' })).toBeNull();
  });
  it('back-pay tallies only the steps a save has finished', () => {
    const defs = [
      { id: 'a', steps: [{ id: 's1', actions: [{ marks: 10 }, { autosave: true }] }, { id: 's2', actions: [{ marks: 20 }] }], onDone: [{ marks: 5 }, { thread: true }] },
      { id: 'b', steps: [{ id: 's1', actions: [{ marks: 7 }] }] },
    ];
    const pay = (q) => backPay(defs, q).reduce((n, a) => n + (a.marks || 0), 0);
    expect(pay({})).toBe(0);
    expect(pay({ a: { state: 'active', step: 1 } })).toBe(10);
    expect(pay({ a: { state: 'done', step: 2 }, b: { state: 'locked', step: 0 } })).toBe(35);
    expect(backPay(defs, { a: { state: 'done', step: 2 } }).some((a) => a.thread)).toBe(true);
  });
});

describe('robes as armour', () => {
  it('each robe turns aside a modest share; the worn-out one none', () => {
    expect(robeDefence(ROBES.find((r) => r.id === 'wanderer'))).toBe(0);
    for (const r of ROBES) { expect(robeDefence(r)).toBeGreaterThanOrEqual(0); expect(robeDefence(r)).toBeLessThanOrEqual(0.1); }
    expect(ROBES.filter((r) => robeDefence(r) > 0).length).toBe(ROBES.length - 1);
  });
});
