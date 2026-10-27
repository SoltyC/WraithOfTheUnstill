// The economy in play (docs §11.4-11.7): the pouch (R uses the selected consumable, C cycles), buffs
// shown on the body (warm hands for strength, frost on the robe for defence), health threads and the
// worn robe's armour, marks from quests and the Shaped, the shrine's rest (flask, restock), death
// dropping the carried marks where the Wraith fell, and the save v3 state. The traders and the forge
// open as codex pages (ui/menus/trade.js) through g.openTrade. Runs right after the weapons: it
// reads their `able`, takes the hands for a drink, and its multipliers reach combat and Flow.
// Allocation-free per frame.

import { createBuffs } from '../game/economy/buffs.js';
import { createTrade } from '../game/economy/trade.js';
import { createDrop } from '../game/economy/drop.js';
import { createDropBeacon } from './economyDrop.js';
import { createPurse } from '../game/economy/purse.js';
import { applyReward, backPay } from '../game/economy/rewards.js';
import { maxHealth, CONSUMABLES, MATERIALS, FLASK } from '../game/economy/items.js';
import { wornRobe, robeDefence } from '../game/robes.js';
import { combatTuning } from '../game/combat/combat.js';
import { BRUSH } from '../shaders/terrainState.wgsl.js';

/** Materials a placed elite leaves besides its marks. */
const ELITE_MATS = { denmother: { 'rime-core': 2 } };
/** The warm hand-light of Ember tea, and the default (cold) one it fades back to. */
const WARM = [1.0, 0.62, 0.25], COLD0 = [0.25, 0.45, 0.6];

/** @param {any} g  shared boot context */
export function addEconomySystem(g) {
  const { loop, input, Action, controller, combat, flow, clock, wraithView, shaped, terrainState: ts, ground, sfx, SFX, capture } = g;
  const inventory = g.inventory, buffs = g.buffs;
  const purse = createPurse(), drop = createDrop();
  let trade = null;                                   // needs the quest graph: made on the first frame
  const note = (kind, title, sub, secs) => { if (!capture && g.hud) g.hud.notice(kind, title, sub, secs); };
  const chime = (gain) => { sfx.x = controller.pos.x; sfx.y = controller.pos.y + 1; sfx.z = controller.pos.z; sfx.gain = gain; sfx.play(SFX.CHIME); };

  // Plain numbers in typed slots (a double field is boxed on every write): 0 use pose weight, 1 fight marks, 2 quiet seconds,
  // 3 safe x, 4 safe z, 5 safe timer, 6 last guard, 7 last regen, 8 last decay, 9 warm level.
  const d = new Float64Array(10);
  d[6] = 1; d[7] = 1; d[8] = 1;
  let lastBlows = 0, wasDying = false, lastMax = combatTuning.health, fightTotal = 0;
  let light = null;
  const beacon = createDropBeacon(g);

  // ── Rewards, rests and what the pages call ────────────────────────────────────────────────────
  const self = g.economy = {
    inventory, buffs, purse, drop,
    get trade() { return trade; },
    /** The drop's world light (a lights.js record), once made. */
    get light() { return light; },
    /** A quest action that pays (marks, materials, items, a thread, a deeper flask). */
    reward(a) {
      const line = applyReward(inventory, a);
      if (line) { note(a.marks ? 'Marks' : 'Given', '+ ' + line, a.marks ? inventory.marks + ' in the pouch' : null, 5); chime(0.5); }
      if (a.thread) syncHealth(true);
    },
    /** Rest at a shrine: the flask fills, the traders restock. */
    rest() {
      const filled = inventory.refillFlask();
      trade?.restock();
      if (filled) note('Shrine water', 'The flask fills', null, 3);
    },
    /** A page asks for the nearby trader's stock or the forge. */
    open(id) { g.openTrade?.(id); },
    /** Save v3 (collect / apply are called from the game's progress hooks). */
    collect(s) {
      s.inventory = inventory.serialize();
      s.equipped = { weapon: inventory.equipped || 'staff', robe: g.chapter ? wornRobe(g.chapter.graph.flags, g.chapter.graph.vars).id : 'wanderer', mantle: null };
      s.economy = { stocks: trade ? trade.serialize() : null, drop: drop.serialize(), purse: purse.level, backPay: false };
    },
    apply(s) {
      inventory.restore(s.inventory);
      ensureTrade();
      trade.restore(s.economy.stocks);
      drop.restore(s.economy.drop);
      purse.level = Number.isFinite(s.economy.purse) ? Math.min(10, Math.max(0, s.economy.purse)) : 10;
      buffs.reset(); weaponsReset();
      if (s.economy.backPay && g.chapter) {
        // A save from before the economy: pay what its finished steps would have paid.
        for (const a of backPay(g.chapter.data.quests, g.chapter.graph.quests)) applyReward(inventory, a);
      }
      syncHealth(false);
      combat.health = Math.min(combat.health, combat.maxHealth);
    },
  };
  function weaponsReset() { g.weapons?.reset?.(); }
  function ensureTrade() {
    if (trade || !g.chapter) return;
    const gr = g.chapter.graph, f = g.chapter.facts;
    trade = createTrade({ inventory, test: (c) => gr.test(c, f) });
  }
  /** Maximum health follows the threads; a new segment also fills what it adds. */
  function syncHealth(fill) {
    const m = maxHealth(inventory.threads);
    if (m === lastMax) return;
    combat.maxHealth = m;
    if (fill && m > lastMax) combat.health = Math.min(m, combat.health + (m - lastMax));
    lastMax = m;
  }

  // ── Shaped collapse: a mark or two from the purse; placed elites pay outright ────────────────
  shaped.onKill = (arch) => {
    const n = purse.award(arch);
    if (n > 0) { inventory.addMarks(n); d[1] += n; d[2] = 0; chime(0.18); }
    const mats = ELITE_MATS[arch];
    if (mats) for (const id in mats) { inventory.addMaterial(id, mats[id]); note('Found', mats[id] + ' ' + MATERIALS[id].name.toLowerCase() + 's', null, 6); }
  };

  // ── The drop's mark in the world: the robe's imprint, a candle-light, sparks rising ───────────
  function stampImprint(x, z) {
    ts.bx = x; ts.bz = z; ts.bdx = 0; ts.bdz = 1; ts.bl = 0; ts.bw = 1.15; ts.bd = 0.1; ts.bc = 0.8; ts.bk = BRUSH.PRESS; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.5;
    ts.stamp();
  }
  function dropWorld(dt) {
    const WL = g.worldLights;
    if (WL && light === null) light = WL.add({ x: 0, y: 0, z: 0, radius: 9, color: [1.0, 0.78, 0.4], intensity: 3.2, kind: 'candle', level: 0 });
    const mk = g.nav?.mark;
    if (!drop.active) { if (light) light.level = 0; if (mk) mk.on = false; beacon.update(false); return; }
    if (mk && (!mk.on || mk.x !== drop.x || mk.z !== drop.z)) { mk.on = true; mk.x = drop.x; mk.z = drop.z; }
    ground.qx = drop.x; ground.qz = drop.z;
    const here = ground.covers();
    if (here) ground.sample();
    const y = here ? ground.h : controller.pos.y;
    if (light) { light.x = drop.x; light.y = y + 0.8; light.z = drop.z; light.level = here ? 1 : 0; }
    const cx = g.camera.position.x - drop.x, cy = g.camera.position.y - y, cz = g.camera.position.z - drop.z;
    const far = cx * cx + cy * cy + cz * cz;
    beacon.q[0] = drop.x; beacon.q[1] = y; beacon.q[2] = drop.z; beacon.q[9] = Math.sqrt(far);
    beacon.update(here && far < 140 * 140);
  }

  loop.add({ name: 'economy', update: () => {
    if (capture) return;
    ensureTrade();
    const dt = clock.dt, p = controller.pos;
    purse.fill(clock.realDt);
    syncHealth(false);
    // Death: the carried marks fall where the Wraith fell (the last safe footing if it fell into water or air).
    const dying = combat.dying > 0;
    if (dying && !wasDying) {
      const ok = controller.grounded && !controller.swimming;
      const x = ok ? p.x : d[3], z = ok ? p.z : d[4];
      const n = drop.die(inventory, x, z);
      stampImprint(x, z);
      buffs.reset();
      note('Fallen', n > 0 ? n + ' marks lie where you fell' : 'The robe re-forms', n > 0 ? 'Walk back to the glow to take them. Dying again first loses them.' : null, 7);
    }
    wasDying = dying;
    if (!dying) {
      if (controller.grounded && !controller.swimming && (d[5] -= clock.realDt) <= 0) { d[5] = 0.5; d[3] = p.x; d[4] = p.z; }
      const got = drop.recover(inventory, p.x, p.z);
      if (got > 0) { note('Marks', 'Recovered ' + got, inventory.marks + ' in the pouch', 5); chime(0.7); g.game?.saves?.requestAutosave?.(); }
    }
    dropWorld(dt);

    // The pouch: R uses, C cycles.
    if (input.pressed[Action.ConsumeNext] === 1 && !dying) {
      const id = inventory.cycleItem();
      if (id) note('Pouch', id === 'flask' ? FLASK.name + ' × ' + inventory.flask.charges : CONSUMABLES[id].name + ' × ' + inventory.count(id), id === 'flask' ? FLASK.text : CONSUMABLES[id].text, 3);
      else note('Pouch', 'Empty', 'Nothing to use. The traders sell salves and teas.', 3);
    }
    if (input.pressed[Action.Consume] === 1 && !dying && g.weapons && g.weapons.able && !g.weapons.machine.busy) {
      const id = inventory.selected;
      const why = id === null ? 'none' : buffs.blocked(id, combat.health, combat.maxHealth);
      if (why === null) buffs.begin(id);
      else if (why === 'whole') note('Pouch', 'Already whole', 'Keep it for when it counts.', 2.5);
      else if (why === 'none') note('Pouch', 'Empty', 'Nothing to use.', 2.5);
    }
    buffs.dodge = input.pressed[Action.Dodge] === 1;
    buffs.blow = combat.blows !== lastBlows; lastBlows = combat.blows;
    if (dying && buffs.using !== null) buffs.dodge = true;
    buffs.update(dt, combat.maxHealth);
    if (buffs.heal > 0) combat.health = Math.min(combat.maxHealth, combat.health + buffs.heal);
    if (buffs.applied !== null) {
      const id = buffs.applied;
      note('Pouch', id === 'flask' ? 'Shrine water' : CONSUMABLES[id].name, id === 'flask' || CONSUMABLES[id].kind === 'heal' ? 'It spreads warm. A blow breaks it off.' : CONSUMABLES[id].text, 4);
    }
    if (buffs.broken) note('Pouch', 'Broken off', null, 1.5);

    // Multipliers into combat and Flow, written only when they change (a double field is boxed per write).
    const guard = (1 - robeDefence(g.chapter ? wornRobe(g.chapter.graph.flags, g.chapter.graph.vars) : { defence: 0 })) * buffs.takenMul;
    if (guard !== d[6]) { d[6] = guard; combat.guardMul = guard; }
    if (buffs.focusMul !== d[7]) { d[7] = buffs.focusMul; combat.regenMul = d[7]; }
    if (buffs.flowDecayMul !== d[8]) { d[8] = buffs.flowDecayMul; flow.decayMul = d[8]; }

    // Using takes the hands (a drink at the lips) and slows the walk.
    const using = buffs.using !== null;
    d[0] += ((using ? 1 : 0) - d[0]) * (1 - Math.exp(-(using ? 14 : 9) * clock.realDt));
    if (d[0] > 0.01) {
      const w = wraithView.wraith;
      w.ikW[1] = Math.max(w.ikW[1], d[0]); w.ikW[0] = Math.max(w.ikW[0], d[0] * 0.8);
      w.ikT[3] = 0.07; w.ikT[4] = 1.22; w.ikT[5] = 0.3; w.ikT[0] = -0.12; w.ikT[1] = 1.0; w.ikT[2] = 0.28;
      if (using) controller.walkMul = Math.min(controller.walkMul, 0.5);
    }
    // Strength warms the hand-light (it cools over the last seconds); defence is the robe's frost (creatures.js reads `sheen`).
    const warm = buffs.left[0] > 0 ? Math.min(1, buffs.left[0] / 4) : 0;
    d[9] += (warm - d[9]) * (1 - Math.exp(-4 * clock.realDt));
    const hg = wraithView.handGlow, COLD = wraithView.handBase || COLD0;   // the element's hand-light (Stone: ochre)
    if (d[9] > 0.005 || hg[0] !== COLD[0]) {
      const k = d[9] < 0.005 ? 0 : d[9];
      hg[0] = COLD[0] + (WARM[0] - COLD[0]) * k; hg[1] = COLD[1] + (WARM[1] - COLD[1]) * k; hg[2] = COLD[2] + (WARM[2] - COLD[2]) * k;
      wraithView.handGlowSize = 0.035 + 0.085 * k; wraithView.warm = k;
    }

    // The fight's marks, summed into one quiet line when it is over.
    if (d[1] > 0) {
      d[2] += clock.realDt;
      if (d[2] > 4) { fightTotal = d[1]; d[1] = 0; note('Marks', '+ ' + fightTotal, inventory.marks + ' in the pouch', 3.5); }
    }
  } });
}
