// The Listener (docs/phase-10/listener-design.md): a Veiled twenty times a person, standing in the Tide Hall's great well, its
// hands cupped at the water, its head bowed to them. It listens: its head turns, slowly, to the loudest sound in the hall (g.noise,
// made by the Wraith's body: systems/drowned.js), and settles back to its hands when the hall is quiet. The turn is the hunt's
// telegraph, before the fight exists (F9 part 1; the fight's phases wait for Tide, F3/F4). The cutscenes direct it (g.listener).

import { Reach } from '../character/reach.js';
import { EBB_ORIGIN as O } from '../world/ebbhold.js';
import { LISTENER } from '../world/listener.js';

/** How loud a sound it turns to (the quiet walk, 0.1, it lets pass), how fast its head goes (rad/s at its own slow time), how far a
 *  neck turns, and how long it keeps listening after a sound has gone (s). */
export const LISTEN = { heard: 0.14, turn: 0.55, yawMax: 1.1, pitchUp: 0.85, pitchDown: 0.25, hold: 3 };

/** The head's aim (yaw from its facing, pitch: negative up) towards a point, from its head at (hx, hy, hz) facing yaw. Clamped. */
export function aimAt(hx, hy, hz, yaw, x, y, z, out) {
  const dx = x - hx, dy = y - hy, dz = z - hz;
  let a = Math.atan2(dx, dz) - yaw;
  a -= Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
  out[0] = Math.max(-LISTEN.yawMax, Math.min(LISTEN.yawMax, a));
  out[1] = Math.max(-LISTEN.pitchUp, Math.min(LISTEN.pitchDown, -Math.atan2(dy, Math.hypot(dx, dz))));
  return out;
}

/** @param {any} g  shared boot context */
export function addListenerSystem(g) {
  const api = g.npcApi, city = g.ebbhold;
  if (!api || !city || g.capture) return null;
  const { clock, loop } = g;
  const base = O.y + LISTENER.base;
  // It stands on its plinth: its own ground (the well's floor is under 18 m of stone).
  const ground = { qx: 0.5, qz: 0.5, h: base, sample() { this.h = base; }, covers() { return true; } };
  const n = api.make('listener', null, 'listener', [LISTENER.x + O.x, LISTENER.z + O.z], { tint: null, interact: false, ground });
  n.noLook = true; n.warm = true; n.lookYaw = 0; n.lookPitch = 0;
  n.view.cowlLight = 0.35;
  const st = { on: true, x: LISTENER.x + O.x, z: LISTENER.z + O.z, yaw: LISTENER.yaw, attend: 0, aim: [0, 0], want: [0, 0], cupped: true };
  n.brain = (nn) => { nn.x = st.x; nn.z = st.z; nn.vx = 0; nn.vz = 0; nn.yaw = st.yaw; nn.hide = !st.on || !city.active; };
  const reach = new Reach(); reach.hands = 3; reach.fade = 2.5;
  const T = reach.handT, xf = n.xf;
  const put = (o, x, y, z) => { T[o] = xf.ox + (x - xf.ox) / xf.s; T[o + 1] = xf.oy + (y - xf.oy) / xf.s; T[o + 2] = xf.oz + (z - xf.oz) / xf.s; };
  const H = [0, 0, 0];

  const listener = g.listener = {
    st, npc: n,
    /** In the hall or not. */
    show(on) { st.on = on; },
    /** A shot's own look (local point), or null to listen again. */
    lookAt: null,
  };

  loop.add({ name: 'listener', update: () => {
    if (!city.active || !st.on) return;
    const dt = Math.min(clock.dt, 0.1);
    // Hands cupped at the water in front of it, a little apart: holding the strand.
    const sy = Math.sin(st.yaw), cy = Math.cos(st.yaw), s = xf.s;
    const fx = st.x + sy * 0.34 * s, fz = st.z + cy * 0.34 * s, wy = O.y + LISTENER.water + 0.15;
    put(0, fx + cy * 0.07 * s, wy, fz - sy * 0.07 * s); put(3, fx - cy * 0.07 * s, wy, fz + sy * 0.07 * s);
    if (n.view.wraith.performance !== reach) { reach.restart(); n.view.wraith.performance = reach; }
    // Where its head is (world), for the aim.
    const hd = n.view.wraith.body.head;
    H[0] = xf.ox + (hd[0] - xf.ox) * s; H[1] = xf.oy + (hd[1] - xf.oy) * s; H[2] = xf.oz + (hd[2] - xf.oz) * s;
    // What it listens to: a shot's point, or the loudest sound in the hall, held a while after it has gone; else its hands.
    const nz = g.noise, L = listener.lookAt;
    if (L) { aimAt(H[0], H[1], H[2], st.yaw, L[0] + O.x, L[1] + O.y, L[2] + O.z, st.want); st.attend = LISTEN.hold; }
    else if (nz && nz.level >= LISTEN.heard) { aimAt(H[0], H[1], H[2], st.yaw, nz.x + O.x, nz.y + O.y, nz.z + O.z, st.want); st.attend = LISTEN.hold; }
    else if ((st.attend -= dt) <= 0) { st.want[0] = 0; st.want[1] = 0; }
    // The head goes there slowly, easing in and out (a giant's neck).
    const k = 1 - Math.exp(-LISTEN.turn * dt * 2.2);
    st.aim[0] += (st.want[0] - st.aim[0]) * k; st.aim[1] += (st.want[1] - st.aim[1]) * k;
    n.lookYaw = st.aim[0]; n.lookPitch = st.aim[1];
  } });
  return listener;
}
