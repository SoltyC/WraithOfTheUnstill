// The weapons on screen: after the Wraith has moved, each carried weapon is put in its hand along
// the pose's direction and roll (the grip is the hand itself, so it follows the arm); the swing's
// trail is fed a pair of edge points a frame while it cuts; the weapons lying in the world are
// seated on the ground under them. Allocation-free.

import { SLOT } from '../render/weaponGeo.js';
import { weaponFeel } from '../game/weapons/defs.js';

const TO_SLOT = { staff: SLOT.STAFF, maul: SLOT.MAUL };

/** @param {any} g  shared boot context */
export function addWeaponViewSystem(g) {
  const { loop, wraithView, weapons, inventory, weaponView: V, ground, controller, clock } = g;
  const wraith = wraithView.wraith, body = wraith.body;
  let trailing = [false, false], reseat = 0;

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
    for (let k = 0; k < 4; k++) { V.show = false; V.place(k); }
    if (def === null) return;
    // A fresh draw grows out of the hand.
    const grow = weapons.swapT > 0 ? 1 - weapons.swapT / weaponFeel.swapTime : 1;
    const sc = grow * grow * (3 - 2 * grow);
    V.show = true; V.tr = 0; V.tg = 0; V.tb = 0;
    if (def.twoHanded) { orient(1, def.mainHand, def); scale(sc); V.place(TO_SLOT[def.id]); }
    else {
      orient(0, 0, def); scale(sc); V.place(SLOT.SICKLE_L);
      orient(1, 1, def); scale(sc); V.place(SLOT.SICKLE_R);
    }
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
      const show = near && f.y === f.y && !f.taken;
      const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
      V.ax = c; V.ay = 0; V.az = -s; V.bx = 0; V.by = 1; V.bz = 0; V.cx = s; V.cy = 0; V.cz = c;
      V.px = f.at[0]; V.py = (f.y === f.y ? f.y : 0) - 0.04; V.pz = f.at[1]; V.show = show; V.tr = 0; V.tg = 0; V.tb = 0;
      V.place(f.slot);
    }
  }

  // The trail: while the weapon cuts (and a moment after), a pair of edge points a frame.
  function feedTrail(time) {
    const def = inventory.def;
    if (def === null) return;
    const tr = def.trail, on = weapons.trailT > 0.06;
    V.setTrailLook(tr.tint[0], tr.tint[1], tr.tint[2], tr.strength);
    const n = def.twoHanded ? 1 : 2;
    for (let t = 0; t < n; t++) {
      // Which weapon edge: the staff/maul main one; for the pair, the blade that leads (or both on a spin / the X).
      const a = weapons.machine.attack;
      const lead = a === null ? -1 : (a.hand === 2 || weapons.machine.heavy) ? 2 : a.hand;
      const live = on && (def.twoHanded || lead === 2 || lead === (t === 0 ? 0 : 1));
      if (!live) { trailing[t] = false; continue; }
      if (!trailing[t]) { V.breakTrail(t); trailing[t] = true; }
      const slot = def.twoHanded ? TO_SLOT[def.id] : (t === 0 ? SLOT.SICKLE_L : SLOT.SICKLE_R), o = slot * 16;
      // Edge points in the weapon's frame: (0, y0, 0) and (0, y1, z1) through the slot's table.
      const xf = V.xf;
      V.ta[0] = xf[o + 1] * tr.y0 + xf[o + 3]; V.ta[1] = xf[o + 5] * tr.y0 + xf[o + 7]; V.ta[2] = xf[o + 9] * tr.y0 + xf[o + 11];
      V.tb2[0] = xf[o + 1] * tr.y1 + xf[o + 2] * tr.z1 + xf[o + 3]; V.tb2[1] = xf[o + 5] * tr.y1 + xf[o + 6] * tr.z1 + xf[o + 7]; V.tb2[2] = xf[o + 9] * tr.y1 + xf[o + 10] * tr.z1 + xf[o + 11];
      V.pushTrail(t, time);
    }
  }

  /** One sample of everything after a Wraith update (also called by the photo spots' scripted swings). */
  g.weaponViewSample = (time) => { placeHeld(); feedTrail(time); };
  loop.add({ name: 'weaponView', update: () => {
    reseat -= clock.realDt; if (reseat <= 0) reseat = 1.5;
    placeFinds();
    if (g.game.pendingWeapon === null && !(g.game.wraithHeld && g.capture)) g.weaponViewSample(clock.simTime);
    V.update(clock.simTime);
  } });
}
