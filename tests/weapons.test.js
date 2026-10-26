import { describe, it, expect } from 'vitest';
import { arc, bodyRadius } from '../src/game/weapons/arcs.js';
import { hitMat } from '../src/game/weapons/affinity.js';
import { weaponDefs } from '../src/game/weapons/defs.js';
import { createInventory } from '../src/game/inventory.js';
import { world, target } from './weaponWorld.js';
import { ARCHETYPES } from '../src/game/shaped/archetypes.js';
import { createShaped, S } from '../src/game/shaped/shaped.js';
import { createFrostBending } from '../src/game/bending/frost.js';
import { createCombat } from '../src/game/combat/combat.js';
import { createWeapons } from '../src/game/weapons/weapons.js';
import { CapsuleController } from '../src/character/capsuleController.js';
import { createFlow, FLOW_EVENT } from '../src/game/flow.js';

function setArc(a0, a1, reach = 2.5, inner = 0.3) {
  arc.px = 0; arc.pz = 0; arc.yaw = 0; arc.a0 = a0; arc.a1 = a1; arc.reach = reach; arc.inner = inner;
}
function at(x, z, r = 0.3) { arc.cx = x; arc.cz = z; arc.r = r; return arc.test(); }

describe('swing arcs', () => {
  it('hits what stands inside the wedge and reach', () => {
    setArc(-0.5, 0.5);
    expect(at(0, 2)).toBe(true);            // dead ahead
    expect(at(0.8, 1.9)).toBe(true);         // to the right, inside the wedge
    expect(at(0, 3.5)).toBe(false);          // too far
    expect(at(0, 2.5 + 0.25)).toBe(true);    // its disc reaches in
    expect(at(0, -2)).toBe(false);           // behind
    expect(at(2.2, 0.2)).toBe(false);        // square to the right, outside a ±0.5 wedge
  });

  it('a swept wedge covers the whole path of a sweep, either way round', () => {
    setArc(1.2, -1.1);                       // right to left
    expect(at(1.9, 1.0)).toBe(true);
    expect(at(-1.9, 1.0)).toBe(true);
    expect(at(0, 2)).toBe(true);
    expect(at(0, -2)).toBe(false);
  });

  it('a thin frame-to-frame wedge still catches a disc it passes over', () => {
    setArc(0.2, 0.26);
    expect(at(0.5, 2.0, 0.35)).toBe(true);
    expect(at(2.0, 0.5, 0.2)).toBe(false);
  });

  it('a full turn hits all round; the inner radius leaves the Wraith itself out', () => {
    setArc(0.5, 0.5 + Math.PI * 2);
    expect(at(0, -2)).toBe(true); expect(at(-2, 0)).toBe(true);
    setArc(-3.1, 3.1);
    expect(at(0, -1.5)).toBe(true);           // behind: the wedge wraps through ±π
    setArc(-0.5, 0.5, 2.5, 1.2);
    expect(at(0, 0.4, 0.2)).toBe(false);
  });

  it('body radii follow the creatures', () => {
    expect(bodyRadius(ARCHETYPES.hound)).toBeLessThan(bodyRadius(ARCHETYPES.brute));
    expect(bodyRadius(ARCHETYPES.denmother)).toBeGreaterThan(bodyRadius(ARCHETYPES.brute));
  });
});

describe('material affinity', () => {
  const run = (id, o) => { hitMat.aff = weaponDefs[id].affinity; hitMat.heavy = !!o.heavy; hitMat.frozen = !!o.frozen; hitMat.armour = o.armour || 0; hitMat.meadow = !!o.meadow; hitMat.resolve(); return hitMat; };
  it('a maul shatters a frozen Shaped on any blow; a staff only with its slam; a blade chips it', () => {
    expect(run('maul', { frozen: true }).shatter).toBe(true);
    expect(run('staff', { frozen: true }).shatter).toBe(false);
    expect(run('staff', { frozen: true }).dmgMul).toBeGreaterThan(1.5);
    expect(run('staff', { frozen: true, heavy: true }).shatter).toBe(true);
    expect(run('sickles', { frozen: true, heavy: true }).shatter).toBe(false);
    expect(run('sickles', { frozen: true }).dmgMul).toBeGreaterThan(1);
  });
  it('a blade glances off armour, a maul drives through it', () => {
    expect(run('sickles', { armour: 0.3 }).glance).toBe(true);
    expect(run('sickles', { armour: 0.3 }).pierce).toBeLessThan(0.2);
    expect(run('maul', { armour: 0.3 }).glance).toBe(false);
    expect(run('maul', { armour: 0.3 }).pierce).toBeGreaterThan(0.7);
    expect(run('staff', { armour: 0.3 }).pierce).toBeCloseTo(0.3, 5);
  });
  it('a blade cuts meadow growth better than a maul bruises it; frost bodies are neutral', () => {
    expect(run('sickles', { meadow: true }).dmgMul).toBeGreaterThan(1);
    expect(run('maul', { meadow: true }).dmgMul).toBeLessThan(1);
    expect(run('sickles', {}).dmgMul).toBe(1);
  });
});

describe('inventory', () => {
  it('starts with the staff, takes finds into the free slot and cycles', () => {
    const inv = createInventory();
    expect(inv.equipped).toBe('staff');
    expect(inv.cycle()).toBe(false);          // nothing to swap to
    expect(inv.give('sickles')).toBe(true);
    expect(inv.carried).toEqual(['staff', 'sickles']);
    expect(inv.give('sickles')).toBe(false);  // already owned
    expect(inv.cycle()).toBe(true);
    expect(inv.equipped).toBe('sickles');
    expect(inv.cycle()).toBe(true);
    expect(inv.equipped).toBe('staff');
  });
  it('a third weapon replaces the one not in hand and stays owned', () => {
    const inv = createInventory();
    inv.give('sickles');
    inv.give('maul');
    expect(inv.carried).toEqual(['staff', 'maul']);
    expect(inv.has('sickles')).toBe(true);
    expect(inv.carry('sickles', 1)).toBe(true);
    expect(inv.carried).toEqual(['staff', 'sickles']);
    expect(inv.tier('maul')).toBe(0);
    inv.upgrade('maul'); expect(inv.tier('maul')).toBe(1);
  });
  it('round-trips through serialize / restore', () => {
    const inv = createInventory(); inv.give('maul'); inv.cycle(); inv.upgrade('maul');
    const copy = createInventory(); copy.restore(JSON.parse(JSON.stringify(inv.serialize())));
    expect(copy.equipped).toBe('maul'); expect(copy.tier('maul')).toBe(1); expect(copy.carried).toEqual(['staff', 'maul']);
    const bad = createInventory(); bad.restore({ owned: [{ id: 'nonesuch' }], carried: ['nonesuch', null], held: 1 });
    expect(bad.equipped).toBe('staff');
  });
});

describe('weapons in play', () => {
  it('a staff swing wounds a hound in front, feeds Flow and puts the machine back to idle', () => {
    const w = world();
    const i = target(w);
    const hp0 = w.shaped.slots[i].hp;
    w.step(40, { press: true });
    expect(w.shaped.slots[i].hp).toBeLessThan(hp0);
    expect(w.flow.counts[FLOW_EVENT.WEAPON_LIGHT]).toBeGreaterThan(0);
    expect(w.weapons.stats.hits).toBeGreaterThan(0);
    w.step(60);
    expect(w.weapons.machine.phase).toBe(0);
  });

  it('a blow behind the Wraith misses', () => {
    const w = world();
    const i = target(w, 'hound', -2.2);
    const hp0 = w.shaped.slots[i].hp;
    w.step(60, { press: true });
    expect(w.shaped.slots[i].hp).toBe(hp0);
  });

  it('a maul swing shatters a frozen hound; a blade does not', () => {
    const w = world('maul');
    const i = target(w);
    w.shaped.freeze(i, 10);
    w.step(70, { press: true });
    expect(w.shaped.isLive(i)).toBe(false);
    expect(w.flow.counts[FLOW_EVENT.SHATTER]).toBeGreaterThan(0);
    const b = world('sickles');
    const j = target(b);
    b.shaped.freeze(j, 10);
    b.step(40, { press: true });
    expect(b.shaped.isLive(j)).toBe(true);
  });

  it('a held press raises a heavy that lands a ground blow and dents the terrain', () => {
    const w = world();
    const i = target(w, 'hound', 1.9);
    const hp0 = w.shaped.slots[i].hp;
    w.step(50, { press: true, down: true });
    w.step(1, { down: false });
    w.step(60);
    expect(w.weapons.stats.heavies).toBe(1);
    expect(w.shaped.slots[i].hp).toBeLessThan(hp0);
    expect(w.stamps.length).toBeGreaterThan(2);
  });

  it('sickle cuts bleed after the blow', () => {
    const w = world('sickles');
    const i = target(w, 'brute', 1.6);
    w.step(14, { press: true });
    const hp1 = w.shaped.slots[i].hp;
    w.step(120);
    expect(w.shaped.slots[i].hp).toBeLessThan(hp1);
  });

  it('a den mother\'s rime turns a blade but not a maul', () => {
    const blade = world('sickles'), maul = world('maul');
    const a = target(blade, 'denmother', 2.4), b = target(maul, 'denmother', 2.4);
    const a0 = blade.shaped.slots[a].hp, b0 = maul.shaped.slots[b].hp;
    blade.step(30, { press: true }); maul.step(80, { press: true });
    const lostBlade = a0 - blade.shaped.slots[a].hp, lostMaul = b0 - maul.shaped.slots[b].hp;
    expect(lostMaul).toBeGreaterThan(lostBlade * 3);
  });

  it('a blow on the Wraith knocks a windup out', () => {
    const w = world();
    w.step(3, { press: true });
    expect(w.weapons.machine.busy).toBe(true);
    w.combat.blows++;
    w.step(1);
    expect(w.weapons.machine.busy).toBe(false);
  });
});

describe('forged weapons in play (the economy)', () => {
  const tierUp = (id, n) => (inv) => { for (let k = 0; k < n; k++) inv.upgrade(id); };
  /** hp a lone hound loses to one press of the staff at the given tier. */
  const lost = (n, extra) => {
    const w = world('staff', extra, tierUp('staff', n)), i = target(w), hp0 = w.shaped.slots[i].hp;
    w.step(16, { press: true });
    return hp0 - w.shaped.slots[i].hp;
  };
  it('a second tier lands harder than the first and the base; the first tier only moves', () => {
    const t0 = lost(0), t1 = lost(1), t2 = lost(2);
    expect(t1).toBeCloseTo(t0, 5);
    expect(t2).toBeGreaterThan(t0 * 1.1);
  });
  it('Ember tea strengthens the blow by a quarter', () => {
    const base = lost(0), buffed = lost(0, { buffs: { damageMul: 1.25 } });
    expect(buffed / base).toBeCloseTo(1.25, 1);
  });
  it('tier 1 adds a fourth staff hit to the combo', () => {
    const w = world('staff', {}, tierUp('staff', 1));
    w.step(1, { press: true });
    expect(w.weapons.def.combo.length).toBe(4);
    let maxCombo = 0;
    for (let k = 0; k < 160; k++) { w.step(1, { press: k % 8 === 0 }); maxCombo = Math.max(maxCombo, w.weapons.machine.combo); }
    expect(maxCombo).toBe(3);
  });
  it('a frost infusion freezes a hound on the third blow', () => {
    const w = world('staff', {}, (inv) => { tierUp('staff', 3)(inv); inv.infuse('staff', 'frost'); });
    const i = target(w, 'brute', 1.8);
    let frozen = false;
    for (let k = 0; k < 140 && !frozen; k++) { w.step(1, { press: k % 20 === 0 }); frozen = w.shaped.isFrozen(i); }
    expect(frozen).toBe(true);
    const plain = world('staff', {}, tierUp('staff', 3)), j = target(plain, 'brute', 1.8);
    for (let k = 0; k < 140; k++) plain.step(1, { press: k % 20 === 0 });
    expect(plain.shaped.isFrozen(j)).toBe(false);
  });
  it('the tier-5 staff\'s slam reaches a hound six metres down the lane', () => {
    const run = (n) => {
      const w = world('staff', {}, tierUp('staff', n)), i = target(w, 'hound', 6.5), hp0 = w.shaped.slots[i].hp;
      w.step(40, { press: true, down: true }); w.step(1, { down: false }); w.step(60);
      return hp0 - w.shaped.slots[i].hp;
    };
    expect(run(4)).toBe(0);
    expect(run(5)).toBeGreaterThan(5);
  });
  it('the tier-5 maul\'s smash throws back a hound the crater missed', () => {
    const run = (n) => {
      const w = world('maul', {}, tierUp('maul', n)), i = target(w, 'hound', 6.3), hp0 = w.shaped.slots[i].hp;
      w.step(60, { press: true, down: true }); w.step(1, { down: false }); w.step(70);
      return hp0 - w.shaped.slots[i].hp;
    };
    expect(run(5)).toBeGreaterThan(run(4));
  });
  it('a forged weapon never touches the base def the overlay edits', () => {
    const before = weaponDefs.staff.combo.length;
    world('staff', {}, tierUp('staff', 5)).step(2);
    expect(weaponDefs.staff.combo.length).toBe(before);
    expect(weaponDefs.staff.heavy.shock).toBeUndefined();
  });
});
