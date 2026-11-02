// Ebbhold, the sealed city (Phase 10 U3–U4; world/ebbhold.js, render/ebbhold.js). Entering it (the whirlpool's cut, U2; for now a
// test link, ?ebbhold=undercroft) moves the Wraith into the city's own space and hands every query that asked the terrain to the
// rooms: the ground (its floors), the controller's solids (walls, columns, ceilings), the camera's probe (stay inside the air), the
// water (each room's level). The sky goes (the interior flag: ambient, and post/compose's water) and the city's lamps come on. The
// sea-doors at its far end are the way out: to the Sounding's rim. Runs before the player (the floors know this frame's feet).

import { createEbbholdSolids, EBB_ORIGIN } from '../world/ebbhold.js';
import { env, invalidateEnvironment } from '../render/environment.js';
import { SOUNDING } from '../world/sounding.js';

/** Where the Wraith arrives (local x, y, z, facing yaw). */
export const EBB_SPAWNS = {
  undercroft: [20, 0, 18, 1.5708],
  gate: [82, 6, 12, 0],
  tideHall: [136, 18, 62, 1.5708],
  gallery: [118, 8, 11, 1.5708],
};

/** @param {any} g  shared boot context */
export function addEbbholdSystem(g) {
  const { loop, controller, arm, ground } = g;
  const S = createEbbholdSolids();
  const view = g.ebbholdView;
  // The controller's solids while inside: the floors come from the ground (it asks the rooms), so these only push.
  const solids = {
    qx: 0.5, qz: 0.5, qh: 0.5, qf: 0.5, h: 0.5,
    cull() {}, push(p, v) { S.push(p, v); },
    floorQ() { this.h = this.qh; }, floorAnyQ() { this.h = this.qh; }, floorReachQ() { this.h = this.qh; },
  };
  const occluder = { qx: 0.5, qy: 0.5, qz: 0.5, reach: 0.5, frame() {}, probe() { S.qx = this.qx; S.qy = this.qy; S.qz = this.qz; return S.solidQ(); } };
  let saved = null, lampsAdded = false;
  const city = {
    S, active: false,
    /** Into the city at a spawn (EBB_SPAWNS key). */
    enter(spot = 'undercroft') {
      const sp = EBB_SPAWNS[spot] || EBB_SPAWNS.undercroft;
      if (!city.active) {
        saved = { solids: controller.solids, occluder: arm.occluder, wgSolids: g.wraithGround ? g.wraithGround.solids : null };
        ground.interior = S; if (g.water) g.water.interior = S;
        controller.solids = solids; arm.occluder = occluder;
        if (g.wraithGround) g.wraithGround.solids = null;
        env.interior = 1; invalidateEnvironment();
        city.active = true;
      }
      const x = sp[0] + EBB_ORIGIN.x, y = sp[1] + EBB_ORIGIN.y, z = sp[2] + EBB_ORIGIN.z;
      S.ref = y;
      controller.hold = false; controller.swimming = false; controller.submerged = false;
      controller.teleport(x, z, y);
      controller.yaw = sp[3]; arm.yaw = sp[3]; arm.pitch = 0.18;
      arm.snap(controller.pos);
      if (g.post) g.post.post.resetHistory = true;
      if (g.atmosphere) g.atmosphere.snapExposure = true;
      g.engine.snapshotRenderingReset();
    },
    /** Out through the sea-doors: back to the Sounding's rim. */
    exit() {
      if (!city.active) return;
      ground.interior = null; if (g.water) g.water.interior = null;
      controller.solids = saved.solids; arm.occluder = saved.occluder;
      if (g.wraithGround) g.wraithGround.solids = saved.wgSolids;
      env.interior = 0; invalidateEnvironment();
      city.active = false;
      g.requestTeleport(SOUNDING.x + SOUNDING.r + 10, SOUNDING.z);
      if (g.post) g.post.post.resetHistory = true;
      if (g.atmosphere) g.atmosphere.snapExposure = true;
      g.engine.snapshotRenderingReset();
    },
  };
  g.ebbhold = city;
  // The interior flag for post/compose (no sky over the water inside).
  if (g.post) g.post.post.onParams((P) => { P[75] = city.active ? 1 : 0; });
  loop.add({ name: 'ebbhold', update: () => {
    // The lamps join the world lights once that system exists (it is added after this one).
    if (!lampsAdded && g.worldLights && view) { for (const l of view.lamps) g.worldLights.add(l); lampsAdded = true; }
    if (!city.active) return;
    S.ref = controller.pos.y;
    // Through the sea-doors (the hall's far wall, its bronze leaves): out.
    const lx = controller.pos.x - EBB_ORIGIN.x, lz = controller.pos.z - EBB_ORIGIN.z;
    if (lx > 230.5 && lz > 45 && lz < 75) city.exit();
  } });
  return city;
}
