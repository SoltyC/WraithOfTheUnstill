import { describe, it, expect } from 'vitest';
import { arc, bodyRadius } from '../src/game/weapons/arcs.js';
import { hitMat } from '../src/game/weapons/affinity.js';
import { weaponDefs } from '../src/game/weapons/defs.js';
import { createInventory } from '../src/game/inventory.js';
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

function world(weapon = 'staff') {
  const ground = { qx: 0, qz: 0, h: 0, nx: 0, ny: 1, nz: 0, sample() { this.h = 0; }, sampleNormal() { this.nx = 0; this.ny = 1; this.nz = 0; } };
  const stamps = [], pins = [];
  const ts = { stamp() { stamps.push(this.bk); } }, fx = { emit() {} }, clock = { hitStop: 0, simTime: 0, dt: 1 / 60 };
  const controller = new CapsuleController(ground); controller.teleport(0, 0);
  const shaped = createShaped({ ts, fx, ground });
  const frost = createFrostBending({ ts, fx, ground });
  const flow = createFlow();
  const combat = createCombat({ shaped, frost, controller, ts, clock, flow, teleport: () => {} });
  const inventory = createInventory();
  if (weapon !== 'staff') { inventory.give(weapon); inventory.cycle(); }
  const weapons = createWeapons({ shaped, combat, controller, clock, ts, fx, flow, inventory, ground });
  const step = (n, input = {}) => {
    for (let k = 0; k < n; k++) {
      const dt = 1 / 60;
      weapons.able = true; weapons.dt = dt; weapons.aimYaw = 0; weapons.down = !!input.down; weapons.pressed = !!input.press && k === 0; weapons.dodgePressed = false; weapons.swapPressed = false;
      weapons.update();
      controller.dt = dt; controller.update();
      shaped.px = controller.pos.x; shaped.pz = controller.pos.z; shaped.pvx = controller.vel.x; shaped.pvz = controller.vel.z;
      shaped.dt = dt; shaped.time += dt; shaped.update();
      combat.dt = dt; combat.update(); clock.simTime += dt;
      for (const p of pins) { const b = shaped.slots[p.i].body; if (shaped.isLive(p.i) && shaped.slots[p.i].state !== S.FROZEN) b.place(0, p.z, Math.PI); }
      if (clock.hitStop > 0) clock.hitStop = 0;
    }
  };
  return { controller, shaped, combat, flow, weapons, step, stamps, clock, pins };
}
/** Spawn a hound a metre or two ahead and let it settle (hold it still). */
function target(w, name = 'hound', z = 1.8) {
  const i = w.shaped.spawn(name, 0, z);
  w.step(100);
  const s = w.shaped.slots[i]; s.state = S.STALK; s.cool = 99;
  w.pins.push({ i, z });     // held where it stands: the AI would walk it through the Wraith
  return i;
}

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
