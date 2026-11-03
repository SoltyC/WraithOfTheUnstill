// Morrow (storylines.md "The jetty"; release-cinematic.md shot 10): the Veiled diver who sends the Wraith down. For now the
// cutscene's Morrow, years on — old, bowed, at the end of her jetty with the Lung in her hands, a knife working along its seam
// (the place it tore). The fen's guide of the chapter's first half comes with F10. The director poses her (sh.morrow).

import { Reach } from '../character/reach.js';
import { jettyPoint, JETTY } from '../world/jetty.js';

/** @param {any} g  shared boot context */
export function addMorrowSystem(g) {
  const api = g.npcApi;
  if (!api || g.capture) return null;
  const st = { x: 0, z: 0, yaw: 0, on: false, cut: 0 };
  const home = jettyPoint(JETTY.len - 2.2);
  const n = api.make('morrow', null, 'elder', [home[0], home[2]], { tint: [0.95, 1.05, 1.15], interact: false });
  n.noLook = true; n.hunch = 0.62;
  n.brain = (nn) => { nn.x = st.x; nn.z = st.z; nn.vx = 0; nn.vz = 0; nn.yaw = st.yaw; nn.hide = !st.on; };
  const reach = new Reach(); reach.hands = 3; reach.fade = 1.2;
  const T = reach.handT, xf = n.xf;
  /** A hand target (world) into the body's simulation space. */
  const put = (o, x, y, z) => { T[o] = xf.ox + (x - xf.ox) / xf.s; T[o + 1] = xf.oy + (y - xf.oy) / xf.s; T[o + 2] = xf.oz + (z - xf.oz) / xf.s; };
  // Where she sits along the jetty (cached: show() runs every frame of her shot).
  let atF = NaN; const p = [0, 0, 0];
  const morrow = g.morrow = {
    st, npc: n,
    /** Out on the jetty (f m along it, facing yaw), or gone; cut 0..1: the knife's work along the seam. */
    show(on, f = JETTY.len - 2.2, yaw = null, cut = 0) {
      st.on = on;
      if (!on) { if (n.view.wraith.performance === reach) reach.leave(); return; }
      if (f !== atF) { const q = jettyPoint(f); p[0] = q[0]; p[1] = q[1]; p[2] = q[2]; atF = f; }
      if (Math.hypot(p[0] - st.x, p[2] - st.z) > 2) api.put(n, p[0], p[2]);
      st.x = p[0]; st.z = p[2]; st.yaw = yaw ?? Math.atan2(-1, 0);
      // Her hands on the Lung in her lap: low, in front; the right hand drawing the knife along the seam, slowly.
      const sy = Math.sin(st.yaw), cy = Math.cos(st.yaw), rx = cy, rz = -sy;
      const lapY = p[1] + 0.6, out = 0.3, slide = (cut - 0.5) * 0.14;
      put(0, st.x + sy * out - rx * 0.1, lapY, st.z + cy * out - rz * 0.1);
      put(3, st.x + sy * (out + 0.02) + rx * (0.05 + slide), lapY + 0.06, st.z + cy * (out + 0.02) + rz * (0.05 + slide));
      if (n.view.wraith.performance !== reach) { reach.restart(); n.view.wraith.performance = reach; }
    },
  };
  return morrow;
}
