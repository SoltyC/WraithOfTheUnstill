// Ebbhold, the sealed city (Phase 10 U3–U4; world/ebbhold.js, render/ebbhold.js). Entering it (the whirlpool's cut, U2; for now a
// test link, ?ebbhold=undercroft) moves the Wraith into the city's own space and hands every query that asked the terrain to the
// rooms: the ground (its floors), the controller's solids (walls, columns, ceilings), the camera's probe (stay inside the air), the
// water (each room's level). The sky goes (the interior flag: ambient, and post/compose's water) and the city's lamps come on. The
// sea-doors at its far end are the way out: to the Sounding's rim. Runs before the player (the floors know this frame's feet).

import { createEbbholdSolids, EBB_ORIGIN, HALL } from '../world/ebbhold.js';
import { env, invalidateEnvironment } from '../render/environment.js';
import { SOUNDING } from '../world/sounding.js';


/** @param {any} g  shared boot context */
export function addEbbholdSystem(g) {
  const { loop, controller, arm, ground } = g;
  const view = g.ebbholdView;
  const S = createEbbholdSolids(view ? view.city : undefined);
  const EBB_SPAWNS = S.city.spawns, EXIT = S.city.exit;
  // The controller's solids while inside: the floors come from the ground (it asks the rooms), so these only push.
  const solids = {
    qx: 0.5, qz: 0.5, qh: 0.5, qf: 0.5, h: 0.5,
    cull() {}, push(p, v) { S.push(p, v); },
    floorQ() { this.h = this.qh; }, floorAnyQ() { this.h = this.qh; }, floorReachQ() { this.h = this.qh; },
  };
  const occluder = { qx: 0.5, qy: 0.5, qz: 0.5, reach: 0.5, frame() {}, probe() { S.qx = this.qx; S.qy = this.qy; S.qz = this.qz; return S.solidQ(); } };
  let saved = null, lampsAdded = false, cityShown = true;
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
        // The terrain and the far mountains are never seen from in here, and the terrain's shadow would keep the sun from the
        // roof's slits: both off while inside (the clipmap's shadow meshes are its children).
        saved.hidden = [g.content && g.content.clipmap && g.content.clipmap.mesh, g.ring].filter(Boolean).map((m) => [m, m.isEnabled()]);
        for (const [m] of saved.hidden) m.setEnabled(false);
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
      for (const [m, on] of saved.hidden) m.setEnabled(on);
      city.active = false;
      g.requestTeleport(SOUNDING.x + SOUNDING.r + 10, SOUNDING.z);
      if (g.post) g.post.post.resetHistory = true;
      if (g.atmosphere) g.atmosphere.snapExposure = true;
      g.engine.snapshotRenderingReset();
    },
  };
  g.ebbhold = city;
  // Inside: the interior flag for post/compose (no sky over the water; the haze's light is the sea's), and a haze filling the hall
  // (the weather fog's slots, after the weather wrote them): thick enough to lose the far end, its shafts marched through the shadows
  // (the roof's slits make beams of the sun). Valley fog and forest haze off.
  if (g.post) g.post.post.onParams((P) => {
    P[75] = city.active ? 1 : 0;
    if (!city.active) return;
    P[56] = 0.0055; P[57] = 1 / 260; P[58] = EBB_ORIGIN.y + HALL.water; P[59] = 1;
    P[60] = 0; P[61] = 0; P[106] = 0; P[107] = 0; P[108] = 0; P[116] = 0;
  });
  loop.add({ name: 'ebbhold', update: () => {
    // The lamps join the world lights once that system exists (it is added after this one).
    if (!lampsAdded && g.worldLights && view) { for (const l of view.lamps) g.worldLights.add(l); lampsAdded = true; }
    // The city's stone and its rooms' water are drawn only while the Wraith is in it: it floats 400 m up, beyond the world's west
    // edge, and from outside it hung in the sky as a dark block 280 m tall (seen from the Sounding and the meadow alike). Drawn for the
    // first frames regardless, so their pipelines are built at load.
    if (view && (g.clock.frame > 90 || city.active) && cityShown !== city.active) {
      cityShown = city.active;
      view.mesh.setEnabled(cityShown);
      if (view.waterMeshes) for (const m of view.waterMeshes) m.setEnabled(cityShown);
      g.engine.snapshotRenderingReset();
    }
    if (!city.active) return;
    S.ref = controller.pos.y;
    // A fall out of every space (a gap in the stone): back onto the causeway rather than falling for ever.
    if (controller.pos.y < EBB_ORIGIN.y + HALL.floor - 15) city.enter('hall');
    // Through the sea-doors (the hall's far wall, its bronze leaves): out.
    const lx = controller.pos.x - EBB_ORIGIN.x, lz = controller.pos.z - EBB_ORIGIN.z;
    const ly = controller.pos.y - EBB_ORIGIN.y;
    if (lx > EXIT.x0 && lx < EXIT.x1 && lz > EXIT.z0 && lz < EXIT.z1 && ly > EXIT.y0 && ly < EXIT.y1) city.exit();
  } });
  return city;
}
