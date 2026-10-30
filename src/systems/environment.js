// Per-frame world rendering inputs, after the actors: atmosphere, clipmap, shadows, the post
// chain, rocks; then weather, restoration (and the grade), ground blow / dust / falling snow /
// sound, the terrain state and its writers, render scale and the shadow strength. Also the
// system toggles of the dev overlay.

import { DynamicRes } from '../core/dynamicRes.js';
import { gpuTimer } from '../core/gpuTimer.js';

const smoothstep01 = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

/** @param {any} g  shared boot context */
export async function addEnvironmentSystems(g) {
  const { loop, engine, env, atmosphere, content, camera, streamer, shadows, post, rocks, weather, ws, clock, ground, pendingTp, warden, wardenMod, restoration,
    params, spindrift, dust, snowfall, sfx, SFX, arm, frost, controller, terrainState, footprints, toggles, game, registerToggle, ring, wraithView, setRenderScale } = g;
  // Rain, lightning and thunder (systems/storm.js): the strike turns the key light, so it runs first.
  (await import('./storm.js')).addStormSystems(g);
  loop.add({ name: 'atmosphere', update: () => {
    // Materials read their own pixel position in the scene target: the internal size.
    env.env.screenInfo.x = post.post.width; env.env.screenInfo.y = post.post.height;
    env.env.screenInfo.z = 1 / env.env.screenInfo.x; env.env.screenInfo.w = 1 / env.env.screenInfo.y;
    env.env.artParams.z = clock.frame & 63; // temporal noise index (shadow disk rotation; TAA integrates it)
    atmosphere.update();
  } });
  loop.add({ name: 'clipmap', update: () => {
    content.clipmap.camX = camera.position.x;
    content.clipmap.camZ = camera.position.z;
    content.clipmap.residencyVersion = streamer.residencyVersion;
    content.clipmap.update();
  } });
  loop.add({ name: 'shadows', update: () => shadows.update() });
  loop.add(post);
  loop.add({ name: 'rocks', update: () => { rocks.camX = camera.position.x; rocks.camZ = camera.position.z; rocks.update(); } });
  // The canyon's cliff walls: levels of detail by distance (every few frames; the switches are rare).
  let canyonTick = 0;
  // Its collision (world/solids.js walls) is refreshed round the Wraith twice a second.
  loop.add({ name: 'canyon', update: () => {
    if (++canyonTick % 4) return;
    const c = g.canyon; c.camX = camera.position.x; c.camZ = camera.position.z; c.camY = camera.position.y; c.update();
    if (g.solids && (canyonTick % 32 === 0 || g.pendingTp.active)) c.fillSolids(g.solids.walls, g.controller.pos.x, g.controller.pos.z, 40);
  } });
  // Restoration (BRIEF §2.4): the frost steppe is stilled until its Warden is released — still
  // air, no spindrift, a flat, cool, desaturated grade; restored brings back wind, spindrift and
  // warmth. `restore` eases toward the state (the Warden's release drives it directly).
  restoration.value = ws.restoration.frost === 'restored' ? 1 : 0;
  let fogGroundY = controller.pos.y, snowWX = 1, snowWZ = 0;
  loop.add({ name: 'weather', update: () => {
    weather.restored = ws.restoration.frost === 'restored' ? 1 : 0;
    weather.meadowRestored = ws.restoration.meadow === 'restored' ? 1 : 0;
    weather.dunesRestored=ws.restoration.dunes==='restored'?1:0;weather.dunes=bwD;
    weather.meadow = bwM / Math.max(bwF + bwM, 1e-3);  // the meadow's weight here (eased below)
    // A load, a teleport and a capture show the weather outright, not easing in from the old place.
    if (pendingTp.active || g.capture) weather.snap = true;
    weather.override = ws.weatherOverride;
    weather.wetForce = ws.wetForce; weather.puddleForce = ws.puddleForce; weather.rainForce = ws.rainForce;
    weather.dt = clock.dt;
    weather.update();
    ws.weather = weather.state;
    atmosphere.cover = weather.cover; atmosphere.snow = weather.snow;
    // The fog's base follows the ground under the camera, eased (no jumps on steps or teleports
    // beyond what the fog itself would show).
    ground.qx = camera.position.x; ground.qz = camera.position.z; ground.sample();
    fogGroundY += (ground.h - fogGroundY) * (pendingTp.active ? 1 : 1 - Math.exp(-clock.realDt * 0.5));
    const pf = post.fog;
    pf.weather = weather; pf.groundY = fogGroundY; pf.dt = clock.dt;
    valleyFog(pf.inv);
  } });
  // Valley fog of still air (the stilled look, with the grade): cold air pools in the low ground as
  // flat-topped fog lakes. Its level is the lower quartile of the land within ~500 m of the camera
  // (8 m overview, a 17×17 sample grid, a fixed histogram — no allocation) plus a margin, refreshed
  // once a second and eased; the release's wind tears it away (weight = 1 − restoration).
  const VF = { margin: 20, density: 3 / 200, every: 1 }, vfHist = new Uint16Array(64);
  let vfTarget = 0, vfTop = 0, vfClock = 1e9, vfX = 1e9, vfZ = 1e9;
  function valleyLevel() {
    const ov = streamer.overview, n = streamer.overviewN; if (!ov) return 0;
    const cx = camera.position.x, cz = camera.position.z;
    let mn = 1e9, mx = -1e9;
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1) vfHist.fill(0);
      for (let b = -8; b <= 8; b++) for (let a = -8; a <= 8; a++) {
        let i = Math.floor((cx + a * 60 + 4096) / 8), j = Math.floor((4096 - (cz + b * 60)) / 8);
        i = i < 0 ? 0 : i >= n ? n - 1 : i; j = j < 0 ? 0 : j >= n ? n - 1 : j;
        const h = ov[j * n + i] / 32 - 128;
        if (pass === 0) { if (h < mn) mn = h; if (h > mx) mx = h; }
        else vfHist[Math.min(63, Math.floor((h - mn) / Math.max(mx - mn, 1e-3) * 64))]++;
      }
    }
    let acc = 0, k = 0;
    for (; k < 64; k++) { acc += vfHist[k]; if (acc >= 289 * 0.25) break; }
    return mn + (k + 0.5) / 64 * (mx - mn) + VF.margin;
  }
  function valleyFog(inv) {
    vfClock += clock.realDt;
    const jumped = (camera.position.x - vfX) ** 2 + (camera.position.z - vfZ) ** 2 > 300 * 300;
    // Never over the Wraith's head: the lakes lie below where it stands (seen from above, the way
    // still fog reads best, and the place it walks stays clear).
    if (vfClock >= VF.every || jumped) { vfClock = 0; vfTarget = Math.min(valleyLevel(), controller.pos.y - 8); vfX = camera.position.x; vfZ = camera.position.z; if (jumped || vfTop === 0) vfTop = vfTarget; }
    vfTop += (vfTarget - vfTop) * (1 - Math.exp(-clock.realDt / 6));
    inv.top = vfTop; inv.density = VF.density; inv.soft = 7;
    // The erg's stopped air is a crest veil, not the frost/meadow's low fog lake.
    // Normalize the same eased biome shares as the grade, preserving the old path at dunes0.
    const duneShare=bwD/Math.max(bwF+bwM+bwD,1e-3);
    inv.weight = Math.max(0, 1 - restoration.value * 1.4)*(1-duneShare);
  }
  // Grades (post/grades.js): the LUT is rebuilt only when the blended grade moves.
  const { blendGrade } = await import('../post/grades.js');
  let lastGradeR=-1,lastGradeM=-1,lastGradeMR=-1,lastGradeD=-1,lastGradeDR=-1,lastGradeS=-1;
  // The land under the camera (biome weights, eased): which biome the player is in, and how much of
  // each one's restoration (and grade) applies here — borders blend.
  let bwF = 1, bwM = 0, bwD = 0, rDunes = ws.restoration.dunes === 'restored' ? 1 : 0, rMeadow = ws.restoration.meadow === 'restored' ? 1 : 0, rFrost = restoration.value, biomeT = 0;
  loop.add({ name: 'restoration', update: () => {
    biomeT -= clock.realDt;
    if(restoration.snap)biomeT=0;
    if (biomeT <= 0) {
      biomeT = 0.25;
      streamer.mqx = camera.position.x; streamer.mqz = camera.position.z; streamer.sampleBiome();
      const k = pendingTp.active || restoration.snap || g.capture ? 1 : 0.35;
      bwF += (streamer.bw0 - bwF) * k; bwM += (streamer.bw1 - bwM) * k; bwD += (streamer.bw3-bwD)*k;
      ws.biome = bwD>bwF && bwD>bwM ? 'dunes' : bwM > bwF ? 'meadow' : 'frost';
    }
    // A load or a photo spot sets the state outright (restoration.snap): no easing in.
    if (restoration.snap) { restoration.snap = false; rFrost = ws.restoration.frost === 'restored' ? 1 : 0; rMeadow = ws.restoration.meadow === 'restored' ? 1 : 0; rDunes=ws.restoration.dunes==='restored'?1:0; }
    rDunes+=((ws.restoration.dunes==='restored'?1:0)-rDunes)*(1-Math.exp(-clock.realDt*1.5));
        rMeadow += ((ws.restoration.meadow === 'restored' ? 1 : 0) - rMeadow) * (1 - Math.exp(-clock.realDt * 1.5));
    const target = ws.restoration.frost === 'restored' ? 1 : 0;
    if (warden.active && warden.state === wardenMod.W.RELEASE) rFrost = Math.max(rFrost, warden.restore);
    else rFrost += (target - rFrost) * (1 - Math.exp(-clock.realDt * 1.5));
    if (warden.restore >= 1 && ws.restoration.frost !== 'restored') ws.restoration.frost = 'restored';
    // restoration.value: the restoration of the land here (frost and meadow by weight at the camera).
    const mW = bwM / Math.max(bwF + bwM, 1e-3);
    const dW=bwD/Math.max(bwF+bwM+bwD,1e-3);
    restoration.value = (rFrost + (rMeadow - rFrost) * mW)*(1-dW)+rDunes*dW;
    restoration.frost = rFrost; restoration.meadow = rMeadow; restoration.dunes=rDunes;
    post.heat.hour=params.v.timeOfDay;post.heat.time=clock.simTime;post.heat.weight=bwD;
    post.heat.restored=rDunes;post.heat.wet=weather.wet;post.heat.cover=weather.cover;
    g.sandDust.duneWeight=bwD;
    const desert=atmosphere.desert;desert.weight=bwD;desert.restored=rDunes;desert.wet=weather.wet;desert.sunY=env.env.sunDir.y;
    const r = rFrost, gs = params.v.gradeStrength;
    // The ice halo (sky shader) belongs to the stilled air: gone with the first wind, hidden by a deck.
    env.env.artParams.y = Math.max(0, 1 - restoration.value * 1.6) * Math.max(0, 1 - weather.cover * 1.4);
    const mBlend = bwM / Math.max(bwF + bwM, 1e-3);
    // Compare independent inputs; a weighted scalar key can cancel two simultaneous changes.
    if (Math.abs(r-lastGradeR)>.002 || Math.abs(mBlend-lastGradeM)>.002 || Math.abs(rMeadow-lastGradeMR)>.002 || Math.abs(dW-lastGradeD)>.002 || Math.abs(rDunes-lastGradeDR)>.002 || gs!==lastGradeS) {
      lastGradeR=r;lastGradeM=mBlend;lastGradeMR=rMeadow;lastGradeD=dW;lastGradeDR=rDunes;lastGradeS=gs;
      blendGrade(post.post.grade, r, gs, mBlend, rMeadow,dW,rDunes);
      post.post.gradeDirty = true;
    }
  } });
  // The wind field (world/wind.js, PLAN.md M1): the prevailing wind at the player (climatology,
  // eased), its strength (the weather × restoration — still air while stilled — and the Warden's
  // gusts) and gustiness; everything that moves in the wind reads the same field.
  let wdX = 1, wdZ = 0;
  loop.add({ name: 'wind', update: () => {
    const wf = g.wind; if (!wf) return;
    const ke = 1 - Math.exp(-clock.realDt * 0.3);
    wdX += ((streamer.windX || 1) - wdX) * ke; wdZ += ((streamer.windZ || 0) - wdZ) * ke;
    wf.dirX = wdX; wf.dirZ = wdZ; wf.time = clock.simTime;
    wf.strength = params.v.windStrength * weather.wind * (0.04 + 0.96 * restoration.value) + 2 * warden.gust;
    wf.gustiness = 0.35 + 0.65 * weather.gust;
    wf.update();
  } });
  // Water: its clock and the Wraith wading (ripples, the splash going in).
  loop.add({ name: 'water', update: () => {
    const wa = g.water; if (!wa) return;
    wa.time = clock.simTime; wa.px = controller.pos.x; wa.py = controller.pos.y; wa.pz = controller.pos.z;
    wa.speed = Math.sqrt(controller.vel.x * controller.vel.x + controller.vel.z * controller.vel.z);
    wa.swimming = controller.swimming; wa.strokePhase = g.wraithView.wraith.swimPhase;
    // The oasis's well is choked while the erg is stilled: its pool fills once the Dunes are restored.
    if (wa.setOasis(ws.restoration.dunes === 'restored')) engine.snapshotRenderingReset();
    wa.update();
  } });
  // Grass: its clock and the push (its wind is the field; a stilled meadow stands rigid).
  loop.add({ name: 'grass', update: () => {
    const gr = g.grass; if (!gr) return;
    gr.time = clock.simTime;
    gr.wind = Math.min(1.6, params.v.windStrength * weather.wind * (0.04 + 0.96 * restoration.value) * 1.4 + 2 * warden.gust);
    gr.density = 1;
    gr.px = controller.pos.x; gr.py = controller.pos.y; gr.pz = controller.pos.z; gr.dt = clock.realDt;
    gr.pushK = 1;
    gr.update();
    const gc = g.groundCover;
    if (gc) { gc.time = clock.simTime; gc.wind = gr.wind; gc.update(); }
    const mo = g.motes;
    if (mo) { mo.time = clock.simTime; mo.wind = gr.wind; mo.density = 1; mo.update(); }
  } });
  let hazeBase = 0;
  const HAZE = 0.0032; // 1/m at the ground under a full canopy (~1 km visibility; local, 200 m)
  loop.add({ name: 'trees', update: () => {
    const tr = g.trees; if (!tr) return;
    tr.camX = camera.position.x; tr.camZ = camera.position.z; tr.time = clock.simTime; tr.dunesRestored = restoration.dunes;
    tr.update();
    // Forest haze (PLAN.md M4b): thickens under the canopy around the camera.
    const hz = post.fog.haze;
    // Trees grow only on meadow land; down in the erg's ravines the air holds dust (render/canyonWalls.js).
    hz.density = Math.max(HAZE * tr.canopy, g.canyon ? g.canyon.haze : 0);
    // Its base is the ground under the camera, eased quickly (the weather fog's base eases slowly
    // and lagged far below after a teleport).
    ground.qx = camera.position.x; ground.qz = camera.position.z; ground.sample();
    hazeBase += (ground.h - hazeBase) * (pendingTp.active || Math.abs(ground.h - hazeBase) > 40 ? 1 : 1 - Math.exp(-clock.realDt * 2));
    hz.base = hazeBase;
    // Eye adaptation under the canopy: up to +1.4 stops beyond the meter's bounded correction, so forest
    // shade reads (in the open, 1). Scene materials and the post chain both take it.
    const lift = 1 + 1.6 * tr.canopy;
    env.env.fogParams.z = params.v.exposure * lift; post.post.exposureLift = lift;
  } });
  loop.add({ name: 'spindrift', update: () => {
    const w = params.v.windStrength * weather.wind * (0.04 + 0.96 * restoration.value) + 1.2 * warden.gust;
    spindrift.time = clock.simTime;
    // Ground blow thickens with the weather (a blizzard is mostly snow on the move).
    spindrift.strength = Math.min(1.5, Math.max(0, (w - 0.15) / 0.5) * (1 + 0.6 * weather.snow * weather.gust));
    spindrift.drift.z = 0.4 + w;
    spindrift.update();
    // Dune air follows its own release state; footprints/verbs can lift dust even while stilled.
    const sd = g.sandDust;
    sd.time = clock.simTime; sd.wet = weather.wet;
    sd.restored = restoration.dunes;sd.dt=clock.dt;
    sd.windStrength = params.v.windStrength * weather.wind * (0.04 + 0.96 * sd.restored);
    sd.update();
    // Stilled air holds its ice grains motionless; as it is restored they drift off and thin.
    const r = restoration.value;
    dust.moving += clock.dt * (r * (0.6 + 0.4 * params.v.windStrength) + 2.5 * warden.gust);
    dust.density = Math.max(0, 1 - r * 1.25);
    dust.time = clock.simTime;
    dust.update();
    // Falling snow: density from the weather, carried by the prevailing wind (eased direction).
    streamer.mqx = camera.position.x; streamer.mqz = camera.position.z; streamer.sampleWind();
    const ke = 1 - Math.exp(-clock.dt * 0.3);
    snowWX += (streamer.windX - snowWX) * ke; snowWZ += (streamer.windZ - snowWZ) * ke;
    const wl = Math.sqrt(snowWX * snowWX + snowWZ * snowWZ) || 1;
    snowfall.windX = snowWX / wl; snowfall.windZ = snowWZ / wl;
    // Stilled overcast: snow that began to fall an age ago and stopped — flakes hanging motionless in
    // the air. They move at the restoration's rate (the release sets them falling with the wind).
    const held = (1 - r) * smoothstep01((weather.cover - 0.5) / 0.25) * 0.45;
    const move = Math.min(1, r * 1.5 + 2 * warden.gust + (weather.snow > held ? 1 : 0));
    snowfall.windSpeed = (1 + 7 * Math.pow(Math.max(w, 0), 1.5)) * move;
    snowfall.fallSpeed = (1.1 + 0.9 * weather.gust) * move;
    snowfall.density = Math.max(weather.snow, held); snowfall.dt = clock.dt;
    snowfall.update();
    // Sound: listener at the camera; the wind bed follows the wind (silent while stilled); the
    // Ribbon hisses while it flows; a formation chimes where it rises.
    const cp = camera.position;
    sfx.lx = cp.x; sfx.ly = cp.y; sfx.lz = cp.z; sfx.rx = Math.cos(arm.yaw); sfx.rz = -Math.sin(arm.yaw);
    // The wind bed swells with the gust fronts passing the camera (the field at the listener).
    let gf = 1;
    if (g.wind && g.wind.strength > 1e-3) { g.wind.sx = cp.x; g.wind.sz = cp.z; g.wind.sample(); gf = Math.min(1.6, Math.max(0.5, g.wind.speed / (0.66 * g.wind.strength))); }
    sfx.wind = Math.min(1, w / 1.1 * gf); sfx.hiss = Math.min(1, frost.ribbonStrength); sfx.time = clock.simTime;
    if (frost.crystalEvent) { sfx.x = frost.crystalX; sfx.y = controller.pos.y + 0.5; sfx.z = frost.crystalZ; sfx.gain = 1.1; sfx.play(SFX.CHIME); }
    sfx.update();
  } });
  loop.add({ name: 'terrainState', update: () => {
    const tsFollow = terrainState.followOverride;
    terrainState.px = tsFollow ? terrainState.followX : controller.pos.x;
    terrainState.pz = tsFollow ? terrainState.followZ : controller.pos.z;
    terrainState.time = clock.simTime;
    // Falling snow fills depressions (BRIEF §4.3: weather writes too): refill runs faster under it.
    terrainState.healScale = params.v.refillRate * (1 + 5 * weather.snow);
    footprints.enabled = toggles.on.footprints !== false;
    footprints.px = controller.pos.x; footprints.pz = controller.pos.z;
    footprints.grounded = controller.grounded && !arm.free && content.capsule.isEnabled();
    footprints.update();
    if (game.pendingTrail !== null && game.worldSettled()) { footprints.stampTrail(game.pendingTrail); game.pendingTrail = null; }
    // A photo spot's frozen patch ({ freeze: [x, z, radius] }): a round FREEZE stamp (sand shots).
    if (game.pendingFreeze !== null && game.worldSettled()) {
      const fz = game.pendingFreeze; game.pendingFreeze = null;
      terrainState.bx = fz[0]; terrainState.bz = fz[1]; terrainState.bdx = 1; terrainState.bdz = 0;
      terrainState.bl = 0; terrainState.bw = fz[2]; terrainState.bd = 0; terrainState.bc = 0.5;
      terrainState.bk = 3; terrainState.bwet = 0; terrainState.bbias = 0; terrainState.bberm = 0; terrainState.stamp();
    }
    terrainState.update();
  } });

  // Render scale follows the Quality slider (the maximum), stepped down/up by the dynamic-res
  // controller to hold params.v.targetMs of GPU time. Captures and benches stay fixed.
  let lastParamsVersion = -1;
  const dyn = new DynamicRes();
  const fixedScale = !!g.capture || !!g.qs?.get('bench') || !!g.qs?.get('shots');
  let dynOn = false, timerOwned = false, lastGpuCount = 0, dynT = 0;
  const applyScale = (s) => { post.post.renderScale = s; };
  loop.add({ name: 'renderScale', update: () => {
    const wantDyn = !fixedScale && params.v.dynamicRes >= 0.5;
    if (wantDyn !== dynOn) {
      dynOn = wantDyn;
      if (dynOn) { dyn.reset(params.v.renderScale, dynT); lastGpuCount = gpuTimer.count; }
      if (!dynOn && timerOwned) { gpuTimer.setActive(false); timerOwned = false; }
      lastParamsVersion = -1;
    }
    if (!dynOn) {
      if (params.version === lastParamsVersion) return;
      lastParamsVersion = params.version;
      // Internal resolution; TAA upscales to the output. Captures (photo spots, gate shots) are
      // stills: native.
      applyScale(g.capture ? 1 : params.v.renderScale);
      return;
    }
    dynT += clock.realDt;
    let gpuTimed = gpuTimer.supported;
    if (gpuTimed) {
      if (!gpuTimer.active) { gpuTimer.setActive(true); timerOwned = true; }
      // New timestamp samples since last frame (newest `count` entries of the ring).
      const H = gpuTimer.ms.length;
      let from = lastGpuCount;
      if (gpuTimer.count - from > H) from = gpuTimer.count - H;
      for (let i = from; i < gpuTimer.count; i++) dyn.push(gpuTimer.ms[i % H]);
      lastGpuCount = gpuTimer.count;
    } else dyn.push(clock.realDt * 1000);
    const s = dyn.update(dynT, params.v.renderScale, params.v.targetMs, gpuTimed);
    if (s !== post.post.renderScale) applyScale(s);
  } });

  // System toggles. Changing the drawn mesh set invalidates a recorded snapshot.
  const reg = registerToggle;
  const meshToggle = (mesh) => (on) => { mesh.setEnabled(on); engine.snapshotRenderingReset(); };
  reg({ key: 'sky', label: 'sky', group: 'System', on: true, onChange: meshToggle(content.sky) });
  reg({ key: 'terrain', label: 'terrain', group: 'System', on: true, onChange: meshToggle(content.terrain) });
  reg({ key: 'ring', label: 'mountain ring', group: 'System', on: true, onChange: meshToggle(ring) });
  reg({ key: 'desertAir', label: 'desert aerosol', group: 'System', on: true, onChange: (on) => { atmosphere.desert.on=on;post.post.resetHistory=true; } });
  reg({ key: 'crestDust', label: 'dune crest grains', group: 'System', on: true, onChange: (on) => { g.sandDust.crests=on; } });
  reg({ key: 'sandDust', label: 'sand dust', group: 'System', on: true, onChange: meshToggle(g.sandDust.mesh) });
  reg({ key: 'canyon', label: 'canyon walls (D7b kit)', group: 'System', on: true, onChange: (on) => { g.canyon.on = on; } });
  reg({ key: 'spindrift', label: 'spindrift', group: 'System', on: true, onChange: meshToggle(spindrift.mesh) });
  reg({ key: 'snowfall', label: 'falling snow', group: 'System', on: true, onChange: meshToggle(snowfall.mesh) });
  reg({ key: 'rain', label: 'rain (streaks, splashes)', group: 'System', on: true, onChange: (on) => { g.rain.mesh.setEnabled(on); g.rain.splashMesh.setEnabled(on); engine.snapshotRenderingReset(); } });
  reg({ key: 'rocks', label: 'rock outcrops', group: 'System', on: true, onChange: (on) => { for (const m of rocks.meshes) m.setEnabled(on); engine.snapshotRenderingReset(); } });
  reg({ key: 'player', label: 'player (the Wraith)', group: 'System', on: true, onChange: (on) => { wraithView.setEnabled(on); engine.snapshotRenderingReset(); } });
  // Shadows fade under a closed cloud deck (what little sun remains is diffused by it).
  let shadowsOn = true;
  reg({ key: 'shadows', label: 'shadows', group: 'System', on: true, onChange: (on) => { shadowsOn = on; } });
  // (A lightning flash is a hard, shadowed key light: it brings them back for its moment.)
  loop.add({ name: 'shadowStrength', update: () => { shadows.strength = shadowsOn ? Math.max(1 - 0.85 * atmosphere.deck, Math.min(1, g.lightning.flash * 1.6)) : 0; } });
  reg({ key: 'autosave', label: 'autosave', group: 'System', on: true });
  reg({ key: 'footprints', label: 'player footprints', group: 'Terrain', on: true });
}
