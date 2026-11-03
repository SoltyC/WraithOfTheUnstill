// Morrow (storylines.md "The jetty"; release-cinematic.md shot 10): the Veiled diver who sends the Wraith down. For now the
// cutscene's Morrow, years on — old, bowed, at the end of her jetty with the Lung in her hands, a knife working along its seam
// (the place it tore). The fen's guide of the chapter's first half comes with F10. The director poses her (sh.morrow).

import { Reach } from '../character/reach.js';
import { jettyPoint, JETTY, GASH, SLUMP, SEAM, bladderTop, slumpOf, LUNG_K, LAP, KNIFE } from '../world/jetty.js';

/** Knife strokes along the seam as cut runs 0 → 1. */
const STROKES = 5;
/** The cut at which the stroke that opens the gash begins (the close on her hands: game/release.js). */
const OPEN = 0.6;

/** @param {any} g  shared boot context */
export function addMorrowSystem(g) {
  const api = g.npcApi;
  if (!api || g.capture) return null;
  const st = { x: 0, z: 0, yaw: 0, on: false, cut: 0 };
  const home = jettyPoint(JETTY.len - 2.2);
  const n = api.make('morrow', null, 'elder', [home[0], home[2]], { tint: [0.95, 1.05, 1.15], interact: false });
  n.noLook = true; n.hunch = 0.32;   // bowed, but her head kept back of her hands (bowed further, it hangs over the Lung and hides it)
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
      // The Lung held up and out before her, clear of her mantle, cradled on her left hand (systems/npcs.js 'lap': its middle
      // over that hand, a little right and up, on the forearm: LAP); the knife in her right. Each stroke: poised high over the near end, one quick
      // slash out along the seam, away from her (so the blade ends, and is held pressed, at the far end, clear of her hood), then
      // lifted high and carried back. cut 0..1 runs STROKES of them.
      const sy = Math.sin(st.yaw), cy = Math.cos(st.yaw), rx = cy, rz = -sy;
      const lapY = p[1] + 0.66, out = 0.74;
      const lx = st.x + sy * out - rx * 0.05, lz = st.z + cy * out - rz * 0.05;
      put(0, lx, lapY, lz);
      const ph = (cut * STROKES) % 1;
      let along, lift;
      if (ph < 0.16) { const e = ph / 0.16, s = e * e * (3 - 2 * e); along = SEAM[1] - 0.02 + (SEAM[0] - SEAM[1] + 0.02) * s; lift = -0.004; } // the slash
      else if (ph < 0.42) { along = SEAM[0]; lift = -0.004; }                                                            // pressed
      else { const e = (ph - 0.42) / 0.58, s = e * e * (3 - 2 * e); along = SEAM[0] - (SEAM[0] + 0.02 - SEAM[1]) * s; lift = 0.22 * Math.sin(Math.min(1, e * 1.25) * Math.PI) ** 0.7; } // back, high
      // The gash (world/jetty.js): shut until the stroke that opens it (the first at OPEN), opened behind the blade on its slash;
      // then, the knife held pressed, the bladder slumps as the air goes out; slumped after.
      const first = Math.floor(cut * STROKES) === Math.round(OPEN * STROKES);
      n.gash = cut < OPEN ? 0 : !first ? GASH + SLUMP - 1 : ph < 0.16 ? Math.max(0, Math.min(GASH, Math.floor((along - SEAM[1]) / ((SEAM[0] - SEAM[1]) / GASH))))
        : GASH + Math.min(SLUMP - 1, (SLUMP - 0.01) * (ph - 0.16) / 0.26);
      // Aimed at the Lung where it is (its site, placed at her left hand last frame: systems/npcs.js), else where it will be; the
      // seam on the bladder's crown over its middle, in its frame scaled by LUNG_K; the blade's point KNIFE ahead of and below the fist.
      const L = g.props?.morrow, sites = g.architecture?.sites, o = L ? L.index * 4 : 0, at = sites && sites[o + 3] > 0;
      const cx = at ? sites[o] : lx - sy * LAP[0] + rx * LAP[1], cz = at ? sites[o + 2] : lz - cy * LAP[0] + rz * LAP[1];
      const cyy = at ? sites[o + 1] : lapY + LAP[2], fo = LUNG_K * along - KNIFE[0];
      put(3, cx + sy * fo, cyy + LUNG_K * Math.max(0.08, bladderTop(along, 0, slumpOf(n.gash))) + KNIFE[1] + lift, cz + cy * fo);
      if (n.view.wraith.performance !== reach) { reach.restart(); n.view.wraith.performance = reach; }
    },
  };
  return morrow;
}
