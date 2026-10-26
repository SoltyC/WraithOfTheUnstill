// Weapons in play (docs §11.1): the left button swings the carried weapon (tap: the combo, hold:
// the charged heavy), X or the wheel swaps the two carried weapons. Each frame this reads the
// buttons, runs the weapon logic (game/weapons/weapons.js), hands the attack pose to the Wraith
// and the dodge cancel to the combat system, offers the weapons lying in the world as things to
// take, and plays the photo spots' scripted swings. Runs before the Wraith (its pose) and the
// creatures (the blows it lands).

import { createInventory } from '../game/inventory.js';
import { createBuffs } from '../game/economy/buffs.js';
import { createWeapons } from '../game/weapons/weapons.js';
import { weaponFinds } from '../game/weapons/finds.js';
import { macePhotoInit, macePhotoStep } from './macePhoto.js';

/** @param {any} g  shared boot context */
export function addWeaponSystem(g) {
  const { loop, input, Action, controller, arm, combat, clock, shaped, wraithView, terrainState: ts, flow, ground, game, sfx, SFX, capture } = g;
  if (g.frost && g.streamer) g.frost.tarnAt = (x, z) => { g.streamer.mqx = x; g.streamer.mqz = z; return g.streamer.frozenLakeAt(); };       // the frozen tarns are ice for the Bell-mace's star
  const inventory = g.inventory = createInventory();
  const buffs = g.buffs = createBuffs(inventory);      // Ember tea strengthens the blows (game/economy/buffs.js)
  const fxSink = wraithView;       // the Wraith's effects emitter doubles as the spray the blows throw up
  const weapons = g.weapons = createWeapons({ shaped, combat, controller, clock, ts, fx: fxSink, flow, inventory, ground, sfx, SFX, buffs, gale: g.gale, frost: g.frost, wind: g.wind, night: () => (g.worldLights ? g.worldLights.night : 0) });
  const wraith = wraithView.wraith;

  /** Why the weapon must stay sheathed this frame. */
  function able() {
    // The Bell-mace swings from a surf's crest or a glide (the plunge); every other weapon waits for the ground.
    const bell = inventory.equipped === 'mace' && !controller.grounded;
    return !arm.free && !controller.scripted && !controller.hold && !controller.god && (bell || !controller.surf.active) && (bell || !controller.glide.active)
      && !controller.swimming && !(g.chapter && g.chapter.talking) && !g.verbBlock && buffs.using === null && !(g.activeClimb && g.activeClimb.mode)
      && !(g.bellClimb && g.bellClimb.climbing) && !g.knock.active && game.pendingSurf === null && game.pendingBend === null;
  }

  /** Hand the pose to the Wraith (twist, lean, the reaching hands, the cloth's push). */
  function applyPose() {
    const P = weapons.pose, w = wraith;
    w.twist = P.twist; w.atkLean = P.lean;
    w.ikW[0] = P.ikW[0]; w.ikW[1] = P.ikW[1];
    for (let i = 0; i < 6; i++) w.ikT[i] = P.ikT[i];
    const m = weapons.machine, a = m.attack;
    let px = 0, pz = 0;
    if (a !== null && weapons.push > 0.01) {
      const yaw = weapons.heading, mag = weapons.push * 9;
      if (a.radius > 0) { px = Math.sin(yaw) * mag; pz = Math.cos(yaw) * mag; }       // a blow from above: the hem lifts ahead
      else {
        P.q = 1; const a1 = P.angle(); P.q = 0;
        const s = Math.sign(a1 - P.angle()) || 1;             // along the sweep (positive = toward the right)
        px = Math.cos(yaw) * s * mag; pz = -Math.sin(yaw) * s * mag;
      }
    }
    w.pushX = px; w.pushZ = pz;
  }

  let wheelCool = 0;
  loop.add({ name: 'weapons', update: () => {
    const dt = clock.dt;
    if (game.pendingWeapon !== null) { stepWeaponRoll(); return; }
    // The wheel swaps weapons (Shift + wheel zooms the camera instead).
    let swap = input.pressed[Action.WeaponSwap] === 1;
    wheelCool = Math.max(0, wheelCool - clock.realDt);
    if (!swap && wheelCool <= 0 && Math.abs(input.wheel) > 0.5 && !input.down[Action.FreeCamFast]) { swap = true; wheelCool = 0.3; }
    weapons.swapPressed = swap;
    weapons.down = input.down[Action.Primary] === 1; weapons.pressed = input.pressed[Action.Primary] === 1;
    weapons.dodgePressed = input.pressed[Action.Dodge] === 1 && !controller.god;
    weapons.able = able();
    weapons.aimYaw = arm.yaw; weapons.dt = dt;
    if (game.wraithHeld && capture) return;
    weapons.update();
    applyPose();
    // The bell hums higher the more height it has stored (docs/mace-design.md §2); a steady overtone once more adds nothing.
    const pl = weapons.plunge;
    sfx.hum = pl.hNow > 0.5 && inventory.equipped === 'mace' ? 0.45 + 0.55 * pl.glow : 0; sfx.humPitch = pl.pitch; sfx.humCap = pl.cap;
    if (swap && weapons.swapT > 0 && g.hud && !capture) { const d = inventory.def; if (d) g.hud.notice('Weapon', d.name, null, 2); }
  } });

  // ── The weapons lying in the world: an interaction glyph, and a notice when taken ──────────────
  g.weaponFinds = weaponFinds.map((f) => ({ ...f, y: NaN, taken: false, open: !f.needs && !f.gale, forced: false, siteIdx: -1 }));
  for (const f of g.weaponFinds) {
    const t = { kind: 'weapon', id: 'weapon-' + f.id, verb: 'Take', name: f.name, x: f.at[0], y: 0, z: f.at[1], r: f.site ? 3.6 : 3.2, h: f.site ? 1.6 : 1.1, hy: f.hy, hidden: true, find: f,
      onUse: () => take(f) };
    f.target = t;
  }
  let offered = false;     // the interaction list is made by the chapter system, which is set up after this one
  function take(f) {
    if (f.taken) return;
    f.taken = true; f.target.hidden = true;
    const had = inventory.has(f.id);
    inventory.give(f.id);
    // The new weapon is drawn at once (a second press of X goes back to the old one).
    inventory.equip(f.id);
    g.chapter?.graph.flags.add('own:' + f.id);     // carried in the quest flags until the inventory has a save of its own
    g.chapter?.raise?.('weapon:' + f.id);
    if (f.id === 'mace') foundBellLedge();
    if (g.hud && !capture) g.hud.notice('Weapon found', f.name, had ? 'Already yours.' : f.text + ' X or the wheel swaps weapons.', 9);
    g.music?.sting?.('echo');
    sfx.x = f.at[0]; sfx.y = f.y; sfx.z = f.at[1]; sfx.gain = 0.8; sfx.play(SFX.CHIME);
    if (!capture) game.saves?.requestAutosave?.();
  }
  // Finds already owned (a load) are gone from the world; the rest wait for the ground under them.
  loop.add({ name: 'weaponFinds', update: () => {
    const flags = g.chapter ? g.chapter.graph.flags : null;
    if (!offered && g.interactables) { offered = true; for (const f of g.weaponFinds) g.interactables.push(f.target); }
    for (const f of g.weaponFinds) {
      if (flags !== null && flags.has('own:' + f.id) && !inventory.has(f.id)) inventory.give(f.id);     // a load
      if (inventory.has(f.id)) { f.taken = true; f.target.hidden = true; continue; }
      f.open = (!f.needs || f.forced || (flags !== null && flags.has(f.needs))) && (!f.gale || f.forced || (g.elements !== undefined && g.elements.unlocked.has('gale')));      // a quest's reward waits for its flag; the bell for Gale
      f.target.hidden = !(f.y === f.y) || !f.open;
      f.target.y = f.y;
    }
  } });

  // ── Photo spots with a scripted swing: weapon: { id, attack: 'carry' | 'combo' | 'heavy', gap?, hold?, seconds } ──
  // The weapon is given and drawn, the buttons are pressed on a script (a combo: a tap every `gap` s;
  // a heavy: held `hold` s), and the machine, pose and cloth are stepped at 60 Hz, four steps a frame
  // (the capture clock is frozen), until `seconds`; then the pose is held.
  const roll = { t: -1 };
  function stepWeaponRoll() {
    const spec = game.pendingWeapon, p = controller.pos, w = wraith, dt = 1 / 60;
    if (!game.worldSettled() || game.pendingTrail !== null || game.pendingWalk !== null || game.pendingShaped !== null) return;
    if (roll.t < 0) {
      inventory.give(spec.id); inventory.equip(spec.id);
      roll.t = 0;
      for (const f of g.weaponFinds) if (spec.finds) { f.taken = false; f.forced = true; f.open = true; f.target.hidden = !(f.y === f.y); }
      if (spec.height !== undefined) macePhotoInit(g, spec);          // the Bell-mace in the air (macePhoto.js)
    }
    for (let k = 0; k < 4 && roll.t < spec.seconds; k++) {
      const t = roll.t, tap = Math.floor((t + 1e-6) / (spec.gap ?? 0.3)) !== Math.floor((t - dt + 1e-6) / (spec.gap ?? 0.3));
      weapons.able = true; weapons.swapPressed = false; weapons.dt = dt; weapons.aimYaw = controller.yaw; weapons.dodgePressed = false;
      const air = spec.height !== undefined, press = air && macePhotoStep(g, spec, t, dt);
      if (air) { weapons.down = false; weapons.pressed = press; }
      else if (spec.attack === 'heavy') { weapons.down = t < (spec.hold ?? 0.8); weapons.pressed = t < dt * 0.5; }
      else if (spec.attack === 'combo') { weapons.pressed = t < dt * 0.5 || tap; weapons.down = weapons.pressed; }
      else { weapons.down = false; weapons.pressed = false; }
      w.bx = p.x; w.by = p.y; w.bz = p.z; w.vx = 0; w.vz = 0; w.yaw = controller.yaw; w.grounded = controller.grounded || spec.height === undefined; w.dt = dt;
      w.time = clock.simTime - (spec.seconds - t); wraithView.time = w.time;
      weapons.update(); applyPose();
      wraithView.update();
      g.weaponViewSample?.(w.time);
      roll.t += dt;
    }
    if (roll.t >= spec.seconds) { game.pendingWeapon = null; roll.t = -1; game.wraithHeld = capture; }
  }
  g.takeWeaponFind = take;

  /** The Bell Ledge counts as a nook for the payoff log (systems/nooks.js): the flag the Remembrance listens for (`rem:bell-ledge`), and the tally. */
  function foundBellLedge() {
    const graph = g.chapter?.graph;
    if (!graph || graph.flags.has('nook:bell-ledge')) return;
    graph.flags.add('nook:bell-ledge');
    graph.vars['nooks.found'] = (graph.vars['nooks.found'] || 0) + 1;
    g.chapter.raise('nook:bell-ledge');
  }
}
