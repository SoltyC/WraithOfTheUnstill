// Sefa (release-cinematic.md "Sefa"): a child of about seven in a pale robe. For now, the cutscenes' Sefa — a body the director
// moves and poses (a run up the long stair, a hand raised to the wave, held in time). The companion who takes the Wraith's hem
// comes after the release is cut. Local city metres in, like the Drowned (world/ebbhold.js).

import { createEbbholdSolids, EBB_ORIGIN as O } from '../world/ebbhold.js';
import { Reach } from '../character/reach.js';

/** @param {any} g  shared boot context */
export function addSefaSystem(g) {
  const city = g.ebbhold, api = g.npcApi;
  if (!city || !api) return null;
  const S = createEbbholdSolids(g.ebbholdView ? g.ebbholdView.city : undefined);
  // Where she is (local), her velocity (m/s) and facing; whether she is in the world at all.
  const st = { x: 0, y: 0, z: 0, vx: 0, vz: 0, yaw: 0, on: false };
  const ground = {
    qx: 0.5, qz: 0.5, h: 0.5,
    sample() { S.qx = this.qx; S.qz = this.qz; S.ref = st.y + O.y + 0.6; S.floorQ(); this.h = S.h > -1e3 ? S.h : st.y + O.y; },
    covers() { return true; },
  };
  let n = null;
  const reach = new Reach();
  function make() {
    n = api.make('sefa', null, 'child', [st.x + O.x, st.z + O.z], { tint: [2.25, 2.1, 1.9], interact: false, ground });
    n.noLook = true;
    n.brain = (nn) => { nn.x = st.x + O.x; nn.z = st.z + O.z; nn.vx = st.vx; nn.vz = st.vz; nn.yaw = st.yaw; nn.hide = !st.on || !city.active; };
  }
  // Made now, hidden (her robe's pipelines exist before any shot needs her).
  if (!g.capture) make();
  const sefa = g.sefa = {
    st,
    get npc() { return n; },
    /** In the world or not (a cutscene's shot puts her there). */
    show(on) { if (on && !n) make(); st.on = on; },
    /** Put her at (x, y, z) local, moving at (vx, vz), facing yaw. A jump of more than a stride re-places her body. */
    set(x, y, z, yaw, vx = 0, vz = 0) {
      if (!n) make();
      const jump = Math.hypot(x - st.x, z - st.z) > 2;
      st.x = x; st.y = y; st.z = z; st.yaw = yaw; st.vx = vx; st.vz = vz;
      if (jump) api.put(n, x + O.x, z + O.z);
    },
    /** Reach her right hand to a local point (null: lower it). */
    reachTo(p) {
      if (!n) return;
      const wr = n.view.wraith;
      if (!p) { if (wr.performance === reach) reach.leave(); return; }
      const xf = n.xf;
      reach.handT[3] = xf.ox + (p[0] + O.x - xf.ox) / xf.s; reach.handT[4] = xf.oy + (p[1] + O.y - xf.oy) / xf.s; reach.handT[5] = xf.oz + (p[2] + O.z - xf.oz) / xf.s;
      if (wr.performance !== reach) { reach.restart(); wr.performance = reach; }
    },
    /** Held in time (a frozen shot), or moving. */
    freeze(on) { if (n) n.frozen = on; },
  };
  return sefa;
}
