// The volcano seen from afar (user, 2026-11-22: "make sure the volcano looks [like one], especially from a distance"). Its cone
// and crater are baked (tools/bake-world/geography.mjs volcano(), centre VOLCANO_X/Z), but from kilometres off it read as a pale
// hill. A plume of ash rises from the crater (render/plume.js), leaning with the wind, and at night the crater glows: the base of
// the plume lit from below, and a light in the crater. The Ember chapter's stages (docs/phase-11/ember-design.md §6) will drive
// its height and darkness; until then it breathes at its "waking" stage.

import { createPlume } from '../render/plume.js';
import { createLavaLake, createLakeExtras } from '../render/lava.js';
import { PIT, LEDGE, LAKE_LEVEL, lakeRadius } from '../world/crater.js';

/** The crater's centre (tools/bake-world/geography.mjs VOLCANO_X, VOLCANO_Z). */
export const CRATER = { x: 2350, z: -2150 };

// The lake (render/lava.js) in the pit (world/crater.js): its level, heat and bursts by the stage; it burns, and throws the
// Wraith back onto the ledge.
const LAKE_HEAT = [0.3, 0.4, 0.55, 0.75, 0.92, 1];
const LAKE_BURSTS = [0, 0.1, 0.3, 0.65, 1, 1];

/** @param {any} g  shared boot context */
export function addVolcanoSystem(g) {
  const { scene, atmosphere, loop, clock, controller } = g;
  // (Many smaller puffs: a churning column, cauliflower, not a few soft blobs — the eruption's is seen up close.)
  const plume = g.plume = createPlume(scene, atmosphere, { count: 2400 });
  plume.freeze();
  const lake = g.lavaLake = createLavaLake(scene, atmosphere);
  if (g.shadows && g.bindShadows) g.bindShadows(lake.material, g.shadows);
  lake.freeze(); lake.mesh.setEnabled(false);
  // Its crust rafts and its spatter: real solids on it and in the air over it (render/lava.js).
  const extras = createLakeExtras(scene, atmosphere, lake);
  if (g.shadows && g.bindShadows) g.bindShadows(extras.raftMaterial, g.shadows);
  extras.freeze(); extras.setEnabled(false);
  lake.x = PIT.x; lake.z = PIT.z; lake.y = LAKE_LEVEL[0];
  let floor = NaN, light = null, level = LAKE_LEVEL[0], thrown = 0;
  /** The mountain after its eruption: smoking, not erupting (plume height m, strength, darkness, glow). */
  const SPENT = { plume: 1300, strength: 0.8, dark: 0.55, glow: 0.2 };
  /** Plugged by the Ember Warden (its release): a thin breath of steam off the stopped vent, the fire under its body. */
  const QUIET = { plume: 520, strength: 0.3, dark: 0.12, glow: 0.04 };
  const quell = () => g.eruption?.quell || 0;
  const mix = (a, b, u) => a + (b - a) * u;
  const V = g.volcano = { level: LAKE_LEVEL[0], stage: 0, forceStage: -1, add: 0 };   // add: m over the stage's level (the Ember Warden's surge: systems/emberWarden.js)
  function lava(dt) {
    const st = V.forceStage >= 0 ? V.forceStage : (g.ember ? g.ember.stage : 0);
    V.stage = st;
    // The lake rises toward its stage's level over a minute or so.
    level += (LAKE_LEVEL[st] + V.add - level) * (1 - Math.exp(-dt / (V.add > 0 ? 6 : 40)));
    if (clock.dt === 0 || V.forceStage >= 0) level = LAKE_LEVEL[st] + V.add;
    V.level = level;
    const cam = scene.activeCamera, cd = cam ? Math.hypot(cam.globalPosition.x - PIT.x, cam.globalPosition.z - PIT.z) : 0;
    const on = cd < 2400;
    if (lake.mesh.isEnabled() !== on) { lake.mesh.setEnabled(on); extras.setEnabled(on); g.engine?.snapshotRenderingReset?.(); }
    if (on) {
      lake.y = level; lake.time = clock.simTime; lake.heat = mix(LAKE_HEAT[st], 0.03, quell()); lake.bursts = LAKE_BURSTS[st] * (1 - quell()); lake.radius = PIT.lake + 6; lake.swell = 0.25 + 0.15 * st;
      lake.update();
    }
    // The eruption's ash on the land (shaders/ash.wgsl.js): falling through it, lying after (the terrain's lavaGlow.w, the grass).
    const ashLand = () => { const E = g.eruption; return !E ? 0 : E.done && !E.stopT ? 1 : E.on || E.stopT ? Math.min(1, E.T / 420) : 0; };
    if (g.grass) g.grass.ash = ashLand();
    if (g.trees) g.trees.ash = ashLand();
    // Its light up the pit's walls (the terrain's lavaGlow), brighter at night and as it heats.
    const cl = g.content?.clipmap || g.clipmap;
    // The Waste restored (the Ember Warden's release): the crust's seams breathe; embers on the wind (systems/environment.js).
    const restored = g.ws?.restoration?.ember === 'restored' ? 1 : g.eruption?.stopT ? g.eruption.open : 0;
    if (cl?.emberWaste) cl.emberWaste.set(restored, clock.simTime % 10000, 0, 0);
    if (cl?.lavaGlow) { const night = g.worldLights ? g.worldLights.night : 0; cl.lavaGlow.set(level, on ? (0.25 + 0.75 * night) * (0.5 + LAKE_HEAT[st]) * 0.9 * (1 - 0.9 * quell()) : 0, lakeRadius(0) + (level - PIT.floor) / PIT.rise, ashLand()); }
    // In the lava: the heat throws the Wraith back onto the ledge, burned.
    thrown = Math.max(0, thrown - dt);
    const p = controller.pos, dx = p.x - PIT.x, dz = p.z - PIT.z, r = Math.hypot(dx, dz);
    // (The lake's edge at its level: the walls climb from the floor's edge at PIT.rise — risen, it covers the lower terraces.)
    if (thrown <= 0 && r < lakeRadius(Math.atan2(dz, dx)) + Math.max(0, level - PIT.floor) / PIT.rise + 4 && p.y < level + 0.4) {
      thrown = 2;
      const co = g.combat;
      if (co && co.dying <= 0) { co.health -= Math.min(Math.max(0, co.health - co.maxHealth * 0.25), co.maxHealth * 0.3); co.shake = Math.max(co.shake || 0, 0.05); }
      if (g.requestTeleport) g.requestTeleport(LEDGE.x, LEDGE.z); else { p.x = LEDGE.x; p.z = LEDGE.z; p.y = PIT.bench.y + 1; }
      if (g.hud && !g.capture) g.hud.notice('The crater', 'The lava throws you back', 'Nothing that moves can stand in it.', 4);
    }
  }
  loop.add({ name: 'volcano', update: () => {
    lava(clock.dt);
    // The summit's height, from the 8 m overview the streamer keeps (the 2 m ground is not resident from kilometres away): the
    // highest point within 250 m of the crater's centre, so the plume always leaves the top of the cone.
    if (!(floor === floor) && g.streamer?.overview) {
      const ov = g.streamer.overview, N = 1024; let top = -1e9;
      for (let dz = -250; dz <= 250; dz += 25) for (let dx = -250; dx <= 250; dx += 25) {
        if (dx * dx + dz * dz > 250 * 250) continue;
        const i = Math.floor((CRATER.x + dx + 4096) / 8), j = Math.floor((4096 - CRATER.z - dz) / 8);
        top = Math.max(top, ov[j * N + i] / 32 - 128);
      }
      if (top > 0) floor = top - 25;
    }
    plume.x = CRATER.x; plume.y = floor === floor ? floor : 950; plume.z = CRATER.z;
    plume.time = clock.simTime;
    if (g.wind) { g.wind.sx = CRATER.x; g.wind.sz = CRATER.z; g.wind.sample(); plume.windX = g.wind.outX; plume.windZ = g.wind.outZ; }
    const night = g.worldLights ? g.worldLights.night : 0;
    // By the mountain's stage (systems/emberClock.js); asleep, a modest plume still marks it from afar.
    // (After the eruption the mountain is spent: a lower, greyer plume of steam and ash, its fire banked — not the column.)
    // (Stopped by the Warden: from the column it was to a breath of steam, as its release quells it — the column drawn down.)
    const E = g.eruption, q = quell(), D = g.ember?.def;
    const S = E?.stopT ? { plume: mix(D ? D.plume : 500, QUIET.plume, q), strength: mix(D ? D.strength : 0.45, QUIET.strength, q), dark: mix(D ? D.dark : 0.05, QUIET.dark, q), glow: mix(D ? D.glow : 0.25, QUIET.glow, q) }
      : E?.done ? SPENT : D;
    plume.glow = Math.max(S ? S.glow : 0.25, (0.25 + 0.75 * night) * (1 - q)) * (E?.done && !E.stopT ? 0.5 : 1);
    plume.height = S ? S.plume : 500; plume.strength = S ? S.strength : 0.45; plume.dark = S ? S.dark : 0.05;
    plume.update();
    // The lake's light: up the pit's walls and out over the rim.
    if (!light && g.worldLights) light = g.worldLights.add({ x: PIT.x, y: level + 14, z: PIT.z, radius: 230, color: [1, 0.38, 0.1], intensity: 3, kind: 'fire', level: 0 });
    if (light) { light.y = level + 14; light.level = Math.max(0.45 + 0.55 * night, g.ember?.def ? g.ember.def.glow : 0) * (0.8 + 0.2 * LAKE_HEAT[V.stage]) * (1 - 0.85 * quell()); }
  } });
}
