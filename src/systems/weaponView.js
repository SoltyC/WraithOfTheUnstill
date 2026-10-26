// The weapons on screen: after the Wraith has moved, each carried weapon is put in its hand along
// the pose's direction and roll (the grip is the hand itself, so it follows the arm); the swing's
// trail is fed a pair of edge points a frame while it cuts; the weapons lying in the world are
// seated on the ground under them. The lantern flail's head hangs on a simulated chain (game/weapons/
// flailHead.js): the haft, two chain segments stretched between the eye and the head, the head and
// its flame are each a slot; the flame is also a light in the world grid, and so is a burning Shaped.
// Allocation-free.

import { SLOT } from '../render/weaponGeo.js';
import { weaponFeel } from '../game/weapons/defs.js';
import { FlailHead } from '../game/weapons/flailHead.js';
import { PHASE } from '../game/weapons/machine.js';

const TO_SLOT = { staff: SLOT.STAFF, maul: SLOT.MAUL, glaive: SLOT.GLAIVE, flail: SLOT.FLAIL };
const HELD = [SLOT.STAFF, SLOT.SICKLE_R, SLOT.SICKLE_L, SLOT.MAUL, SLOT.GLAIVE, SLOT.FLAIL, SLOT.CHAIN1, SLOT.CHAIN2, SLOT.HEAD, SLOT.FLAME];
const BURN_LAMPS = 3;

/** @param {any} g  shared boot context */
const TRAIL_FROST = [0.5, 0.78, 1.0], TRAIL_GALE = [0.55, 1.0, 0.7];

export function addWeaponViewSystem(g) {
  const { loop, wraithView, weapons, inventory, weaponView: V, ground, controller, clock } = g;
  const wraith = wraithView.wraith, body = wraith.body;
  let trailing = [false, false], reseat = 0;
  const head = new FlailHead();
  // Doubles in an object, not closure variables (a closure variable holding a double boxes on every write).
  const fl = { flare: 0.5 - 0.5, lastT: -1, t: 0.5 - 0.5, dt: 0.5 - 0.5, zx: 0.5, zy: 0.5, zz: 0.5, flame: 0.5 };
  let lamp = null, pyre = null, findLamp = null; const burnLamps = [];

  // Basis and origin of slot k's weapon → V.ax…pz (world), from the pose slot `ps` held in hand `hand` (and the rest hand).
  function orient(ps, hand, def) {
    const P = weapons.pose, b = body, d = P.dir, o = ps * 3;
    const dx = d[o], dy = d[o + 1], dz = d[o + 2];
    // Direction in the world.
    let yx = dx * b.r[0] + dy * b.u[0] + dz * b.f[0], yy = dx * b.r[1] + dy * b.u[1] + dz * b.f[1], yz = dx * b.r[2] + dy * b.u[2] + dz * b.f[2];
    const yl = Math.sqrt(yx * yx + yy * yy + yz * yz) || 1; yx /= yl; yy /= yl; yz /= yl;
    // z: the torso's forward, made square to y; x = y × z.
    let zx = b.f[0], zy = b.f[1], zz = b.f[2];
    let dd = zx * yx + zy * yy + zz * yz;
    if (Math.abs(dd) > 0.97) { zx = b.r[0]; zy = b.r[1]; zz = b.r[2]; dd = zx * yx + zy * yy + zz * yz; }
    zx -= yx * dd; zy -= yy * dd; zz -= yz * dd;
    const zl = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    let xx = yy * zz - yz * zy, xy = yz * zx - yx * zz, xz = yx * zy - yy * zx;
    const roll = P.roll[ps], cr = Math.cos(roll), sr = Math.sin(roll);
    const rzx = zx * cr + xx * sr, rzy = zy * cr + xy * sr, rzz = zz * cr + xz * sr;
    const rxx = xx * cr - zx * sr, rxy = xy * cr - zy * sr, rxz = xz * cr - zz * sr;
    V.ax = rxx; V.ay = rxy; V.az = rxz; V.bx = yx; V.by = yy; V.bz = yz; V.cx = rzx; V.cy = rzy; V.cz = rzz;
    // Origin: the hand that carries it, or the blend of the carrying hand and the swinging one for a two-handed
    // weapon (it crosses the body as the hands take it), pulled back by the carry grip's slide.
    const hA = def.twoHanded ? def.restHand : hand, hB = def.twoHanded ? def.mainHand : hand, w = def.twoHanded ? P.ikW[def.mainHand] : 1;
    const ha = b.ha, mA = hA * 3, mB = hB * 3, slide = def.twoHanded ? def.restSlide * (1 - w) : 0;
    V.px = ha[mA] * (1 - w) + ha[mB] * w - yx * slide; V.py = ha[mA + 1] * (1 - w) + ha[mB + 1] * w - yy * slide; V.pz = ha[mA + 2] * (1 - w) + ha[mB + 2] * w - yz * slide;
  }

  function placeHeld() {
    const def = inventory.def;
    // Everything in hand hidden, then the weapon carried.
    V.show = false; V.tr = 0; V.tg = 0; V.tb = 0;
    for (let k = 0; k < HELD.length; k++) V.place(HELD[k]);
    if (def === null) return;
    // A fresh draw grows out of the hand.
    const grow = weapons.swapT > 0 ? 1 - weapons.swapT / weaponFeel.swapTime : 1;
    const sc = grow * grow * (3 - 2 * grow);
    V.show = true; V.tr = 0; V.tg = 0; V.tb = 0;
    if (def.id === 'flail') placeFlail(def, sc);
    else if (def.twoHanded) { orient(1, def.mainHand, def); scale(sc); V.place(TO_SLOT[def.id]); }
    else {
      orient(0, 0, def); scale(sc); V.place(SLOT.SICKLE_L);
      orient(1, 1, def); scale(sc); V.place(SLOT.SICKLE_R);
    }
  }
  // The flail: the haft in the hand, the head on its chain below the haft's eye, the chain on two segments between them, the flame in the cage.
  const ref = [0, 0, 1];
  function frame(yx, yy, yz, ylen, w) {
    let zx = ref[0], zy = ref[1], zz = ref[2];
    const d = zx * yx + zy * yy + zz * yz;
    zx -= yx * d; zy -= yy * d; zz -= yz * d;
    const zl = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    V.ax = (yy * zz - yz * zy) * w; V.ay = (yz * zx - yx * zz) * w; V.az = (yx * zy - yy * zx) * w;
    V.bx = yx * ylen; V.by = yy * ylen; V.bz = yz * ylen; V.cx = zx * w; V.cy = zy * w; V.cz = zz * w;
  }
  function placeFlail(def, sc) {
    orient(1, def.mainHand, def);
    const ch = def.chain, ux = V.bx, uy = V.by, uz = V.bz;
    ref[0] = V.cx; ref[1] = V.cy; ref[2] = V.cz;
    head.tx = V.px + ux * ch.eye * sc; head.ty = V.py + uy * ch.eye * sc; head.tz = V.pz + uz * ch.eye * sc;
    head.ux = ux; head.uy = uy; head.uz = uz; head.len = ch.len * Math.max(0.05, sc);
    scale(sc); V.place(SLOT.FLAIL);
    const m = weapons.machine, ph = m.phase;
    head.guide = ph === PHASE.ACTIVE ? 0.85 : ph === PHASE.WINDUP ? 0.12 : ph === PHASE.CHARGE || ph === PHASE.LOADED ? 0.3 : ph === PHASE.RECOVER ? 0.22 : 0;
    head.dt = fl.dt; head.step();
    // The chain: the eye to the elbow, the elbow to the head's ring.
    frame(head.mx - head.tx, head.my - head.ty, head.mz - head.tz, Math.hypot(head.mx - head.tx, head.my - head.ty, head.mz - head.tz) || 1e-3, 1);
    V.px = head.tx; V.py = head.ty; V.pz = head.tz; V.place(SLOT.CHAIN1);
    frame(head.hx - head.mx, head.hy - head.my, head.hz - head.mz, Math.hypot(head.hx - head.mx, head.hy - head.my, head.hz - head.mz) || 1e-3, 1);
    V.px = head.mx; V.py = head.my; V.pz = head.mz; V.place(SLOT.CHAIN2);
    // The lantern, hanging along the last link; the flame leans away from the way it is travelling.
    frame(head.dx, head.dy, head.dz, sc, sc);
    V.px = head.hx; V.py = head.hy; V.pz = head.hz; V.place(SLOT.HEAD);
    const t = fl.t, flick = 0.5 + 0.25 * Math.sin(t * 13.1) + 0.25 * Math.sin(t * 21.7 + 1.3);
    const target = ph === PHASE.CHARGE ? Math.min(1, m.chargeT / def.heavy.chargeMax) : ph === PHASE.ACTIVE ? 1 : ph === PHASE.IDLE ? 0 : 0.4;
    fl.flare += (target - fl.flare) * (1 - Math.exp(-9 * fl.dt));
    // The flame stands in the cage from its floor toward the chain, leans up against gravity, and a fast swing lays it back along the head's travel.
    const fx = head.hx + head.dx * 0.3, fy = head.hy + head.dy * 0.3, fz = head.hz + head.dz * 0.3;
    const sp = Math.min(1, head.speed / 14);
    let fyx = -head.dx - (head.hx - head.px) * 0.5 * sp, fyy = 0.6 - head.dy - (head.hy - head.py) * 0.5 * sp, fyz = -head.dz - (head.hz - head.pz) * 0.5 * sp;
    const fl2 = Math.sqrt(fyx * fyx + fyy * fyy + fyz * fyz) || 1;
    ref[0] = head.dx; ref[1] = head.dy; ref[2] = head.dz;
    const wide = (0.75 + 0.35 * fl.flare + 0.12 * flick) * sc, tall = (0.7 + 0.8 * fl.flare + 0.2 * flick + 0.35 * sp) * sc;
    frame(fyx / fl2, fyy / fl2, fyz / fl2, tall, wide);
    V.px = fx; V.py = fy; V.pz = fz;
    V.tr = 0.45 + 0.35 * flick + 0.8 * fl.flare; V.tg = 0; V.tb = 0;
    V.place(SLOT.FLAME);
    V.tr = 0;
    fl.zx = fx; fl.zy = fy; fl.zz = fz; fl.flame = (0.45 + 0.35 * flick + 0.9 * fl.flare) * sc;
  }
  function scale(s) { V.ax *= s; V.ay *= s; V.az *= s; V.bx *= s; V.by *= s; V.bz *= s; V.cx *= s; V.cy *= s; V.cz *= s; }

  // The finds: seated on the ground under them once it has streamed in, each ~second while the Wraith is near.
  function placeFinds() {
    for (const f of g.weaponFinds) {
      const near = Math.hypot(controller.pos.x - f.at[0], controller.pos.z - f.at[1]) < 300;
      if (near && (f.y !== f.y || reseat <= 0)) {
        ground.qx = f.at[0]; ground.qz = f.at[1];
        if (ground.covers()) { ground.sample(); f.y = ground.h; }
      }
      const show = near && f.y === f.y && !f.taken && f.open;
      const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
      V.ax = c; V.ay = 0; V.az = -s; V.bx = 0; V.by = 1; V.bz = 0; V.cx = s; V.cy = 0; V.cz = c;
      V.px = f.at[0]; V.py = (f.y === f.y ? f.y : 0) - 0.04; V.pz = f.at[1]; V.show = show; V.tr = f.glow || 0; V.tg = 0; V.tb = 0;
      V.place(f.slot);
    }
  }

  // The trail: while the weapon cuts (and a moment after), a pair of edge points a frame.
  function feedTrail(time) {
    const def = inventory.def;
    if (def === null) return;
    const tr = def.trail, on = weapons.trailT > 0.06;
    // An infused weapon cuts in its element's colour; a forged one leaves a stronger trail (tier by tier).
    const inf = inventory.infusion(def.id), tint = inf === 'frost' ? TRAIL_FROST : inf === 'gale' ? TRAIL_GALE : tr.tint;
    V.setTrailLook(tint[0], tint[1], tint[2], tr.strength * (1 + 0.08 * Math.max(0, inventory.tier(def.id))));
    const n = def.twoHanded ? 1 : 2;
    for (let t = 0; t < n; t++) {
      // Which weapon edge: the staff/maul main one; for the pair, the blade that leads (or both on a spin / the X).
      const a = weapons.machine.attack;
      const lead = a === null ? -1 : (a.hand === 2 || weapons.machine.heavy) ? 2 : a.hand;
      const live = on && (def.twoHanded || lead === 2 || lead === (t === 0 ? 0 : 1));
      if (!live) { trailing[t] = false; continue; }
      if (!trailing[t]) { V.breakTrail(t); trailing[t] = true; }
      const slot = def.id === 'flail' ? SLOT.HEAD : def.twoHanded ? TO_SLOT[def.id] : (t === 0 ? SLOT.SICKLE_L : SLOT.SICKLE_R), o = slot * 16;
      // Edge points in the weapon's frame: (0, y0, 0) and (0, y1, z1) through the slot's table.
      const xf = V.xf;
      V.ta[0] = xf[o + 1] * tr.y0 + xf[o + 3]; V.ta[1] = xf[o + 5] * tr.y0 + xf[o + 7]; V.ta[2] = xf[o + 9] * tr.y0 + xf[o + 11];
      V.tb2[0] = xf[o + 1] * tr.y1 + xf[o + 2] * tr.z1 + xf[o + 3]; V.tb2[1] = xf[o + 5] * tr.y1 + xf[o + 6] * tr.z1 + xf[o + 7]; V.tb2[2] = xf[o + 9] * tr.y1 + xf[o + 10] * tr.z1 + xf[o + 11];
      V.pushTrail(t, time);
    }
  }

  // The lights in the world grid (systems/lights.js, made after this system, so on the first frame that has it): the lantern's flame,
  // the pyre ring's, and a share of the burning Shaped's.
  function lights() {
    const WL = g.worldLights;
    if (!WL) return;
    if (lamp === null) {
      lamp = WL.add({ x: NaN, y: NaN, z: NaN, radius: 9, color: [1, 0.52, 0.2], intensity: 5, kind: 'fire', level: 0 });
      findLamp = WL.add({ x: NaN, y: NaN, z: NaN, radius: 7, color: [1, 0.5, 0.18], intensity: 3, kind: 'fire', level: 0 });
      pyre = WL.add({ x: NaN, y: NaN, z: NaN, radius: 11, color: [1, 0.45, 0.15], intensity: 7, kind: 'fire', level: 0 });
      for (let i = 0; i < BURN_LAMPS; i++) burnLamps.push(WL.add({ x: NaN, y: NaN, z: NaN, radius: 5, color: [1, 0.45, 0.14], intensity: 4, kind: 'fire', level: 0 }));
    }
    const def = inventory.def, on = def !== null && def.id === 'flail' && weapons.swapT < 0.25 && g.game.pendingWeapon === null;
    lamp.level = on ? Math.min(1, fl.flame) : 0;
    if (on) { lamp.x = fl.zx; lamp.y = fl.zy; lamp.z = fl.zz; lamp.radius = 8 + 5 * WL.night + 3 * fl.flare; }
    const bz = weapons.burn, zt = bz.zt[0] > bz.zt[1] ? 0 : 1;
    pyre.level = bz.zt[zt] > 0 ? Math.min(1, bz.zt[zt]) : 0;
    if (pyre.level > 0) { pyre.x = bz.zx[zt]; pyre.z = bz.zz[zt]; pyre.y = controller.pos.y + 0.6; pyre.radius = bz.zr[zt] + 5 + 3 * WL.night; }
    // The flail left hanging by Isolde's fire is lit.
    findLamp.level = 0;
    for (const f of g.weaponFinds) {
      if (f.id !== 'flail' || f.taken || !f.open || !(f.y === f.y)) continue;
      if (Math.hypot(controller.pos.x - f.at[0], controller.pos.z - f.at[1]) > 120) continue;
      findLamp.x = f.at[0] + Math.sin(f.yaw) * 0.0; findLamp.y = f.y + 0.7; findLamp.z = f.at[1]; findLamp.level = 0.8; findLamp.radius = 6 + 4 * WL.night;
    }
    let k = 0;
    if (bz.burning > 0) {
      const slots = g.shaped.slots;
      for (let i = 0; i < slots.length && k < BURN_LAMPS; i++) {
        if (!bz.isBurning(i)) continue;
        const b = slots[i].body, L = burnLamps[k++];
        L.x = b.sx[1]; L.y = b.sy[1] + 0.8; L.z = b.sz[1]; L.level = 1; L.radius = 4.5 + 3 * WL.night;
      }
    }
    for (; k < BURN_LAMPS; k++) burnLamps[k].level = 0;
  }

  /** One sample of everything after a Wraith update (also called by the photo spots' scripted swings). */
  g.weaponViewSample = (time) => {
    fl.dt = fl.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, time - fl.lastT)); fl.lastT = time; fl.t = time;
    placeHeld(); feedTrail(time);
  };
  loop.add({ name: 'weaponView', update: () => {
    reseat -= clock.realDt; if (reseat <= 0) reseat = 1.5;
    placeFinds();
    lights();
    if (g.game.pendingWeapon === null && !(g.game.wraithHeld && g.capture)) g.weaponViewSample(clock.simTime);
    V.update(clock.simTime);
  } });
}
