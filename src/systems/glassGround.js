// Glass ground (Phase 9 D7; docs/phase-9/plan.md "the transform channel marks the ground under them as
// glass"): under each piece of battle glass the sand is fused for good — the terrain state's GLASS
// transform (shaders/terrainState.wgsl.js BRUSH.GLASS), which the sand shades as a crazed glassy crust
// (shaders/clipmap.wgsl.js) and which D9's Glass-sworn will write too. The state is written only in the
// fine window round the Wraith, so each piece's ground is stamped when the Wraith first comes near it
// this session (a stamp is idempotent; the pages keep it, saved with the terrain).

import { BRUSH } from '../shaders/terrainState.wgsl.js';

const NEAR = 30;   // m: within the fine window (±42 m) with room for the brush

/** @param {any} g  shared boot context */
export function addGlassGroundSystem(g) {
  const { loop, controller, terrainState, clock } = g;
  const sites = (g.archSites || []).filter((s) => s.glassR > 0);
  if (!sites.length || !terrainState) return;
  const done = new Uint8Array(sites.length);
  let t = 0;
  // Field query (no doubles as arguments): qx, qz → glassQ() → hit — fused ground there (a stamped
  // piece's, within its radius): surfable and slick (character/surf.js slick).
  const gg = { sites, done, qx: 0.5, qz: 0.5, hit: false,
    glassQ() {
      this.hit = false;
      for (let i = 0; i < sites.length; i++) {
        if (!done[i]) continue;
        const s = sites[i], dx = this.qx - s.at[0], dz = this.qz - s.at[1], r = s.glassR * 0.85;
        if (dx * dx + dz * dz < r * r) { this.hit = true; return; }
      }
    } };
  g.glassGround = gg;
  loop.add({ name: 'glassGround', update: () => {
    t += clock.dt;
    if (t < 0.25) return;
    t = 0;
    const p = controller.pos;
    for (let i = 0; i < sites.length; i++) {
      if (done[i]) continue;
      const s = sites[i];
      if (Math.hypot(s.at[0] - p.x, s.at[1] - p.z) > NEAR) continue;
      const ts = terrainState;
      ts.bx = s.at[0]; ts.bz = s.at[1]; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = s.glassR; ts.bd = 0; ts.bc = 0.5;
      ts.bk = BRUSH.GLASS; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0;
      ts.stamp();
      done[i] = 1;
    }
  } });
}
