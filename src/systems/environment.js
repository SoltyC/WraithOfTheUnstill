// Per-frame world rendering inputs, after the actors: atmosphere, clipmap, shadows, the post
// chain, rocks; then weather, restoration (and the grade), ground blow / dust / falling snow /
// sound, the terrain state and its writers, render scale and the shadow strength. Also the
// system toggles of the dev overlay.

const smoothstep01 = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

/** @param {any} g  shared boot context */
export async function addEnvironmentSystems(g) {
  const { loop, engine, env, atmosphere, content, camera, streamer, shadows, post, rocks, weather, ws, clock, ground, pendingTp, warden, wardenMod, restoration,
    params, spindrift, dust, snowfall, sfx, SFX, arm, frost, controller, terrainState, footprints, toggles, game, registerToggle, ring, wraithView, setRenderScale } = g;
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
  // Restoration (BRIEF §2.4): the frost steppe is stilled until its Warden is released — still
  // air, no spindrift, a flat, cool, desaturated grade; restored brings back wind, spindrift and
  // warmth. `restore` eases toward the state (the Warden's release drives it directly).
  restoration.value = ws.restoration.frost === 'restored' ? 1 : 0;
  let fogGroundY = controller.pos.y, snowWX = 1, snowWZ = 0;
  loop.add({ name: 'weather', update: () => {
    weather.restored = ws.restoration.frost === 'restored' ? 1 : 0;
    weather.override = ws.weatherOverride;
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
    inv.weight = Math.max(0, 1 - restoration.value * 1.4);
  }
  // Grades (post/grades.js): the LUT is rebuilt only when the blended grade moves.
  const { blendGrade } = await import('../post/grades.js');
  let lastGradeR = -1, lastGradeS = -1;
  loop.add({ name: 'restoration', update: () => {
    const target = ws.restoration.frost === 'restored' ? 1 : 0;
    if (warden.active && warden.state === wardenMod.W.RELEASE) restoration.value = Math.max(restoration.value, warden.restore);
    else restoration.value += (target - restoration.value) * (1 - Math.exp(-clock.realDt * 1.5));
    if (warden.restore >= 1 && ws.restoration.frost !== 'restored') ws.restoration.frost = 'restored';
    const r = restoration.value, gs = params.v.gradeStrength;
    // The ice halo (sky shader) belongs to the stilled air: gone with the first wind, hidden by a deck.
    env.env.artParams.y = Math.max(0, 1 - r * 1.6) * Math.max(0, 1 - weather.cover * 1.4);
    if (Math.abs(r - lastGradeR) > 0.002 || gs !== lastGradeS) {
      lastGradeR = r; lastGradeS = gs;
      blendGrade(post.post.grade, r, gs);
      post.post.gradeDirty = true;
    }
  } });
  loop.add({ name: 'spindrift', update: () => {
    const w = params.v.windStrength * weather.wind * (0.04 + 0.96 * restoration.value) + 1.2 * warden.gust;
    spindrift.time = clock.simTime;
    // Ground blow thickens with the weather (a blizzard is mostly snow on the move).
    spindrift.strength = Math.min(1.5, Math.max(0, (w - 0.15) / 0.5) * (1 + 0.6 * weather.snow * weather.gust));
    spindrift.drift.z = 0.4 + w;
    spindrift.update();
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
    sfx.wind = Math.min(1, w / 1.1); sfx.hiss = Math.min(1, frost.ribbonStrength); sfx.time = clock.simTime;
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
    terrainState.update();
  } });

  // Render scale follows the Quality slider (checked via the integer params version).
  let lastParamsVersion = -1;
  loop.add({ name: 'renderScale', update: () => {
    if (params.version === lastParamsVersion) return;
    lastParamsVersion = params.version;
    // Internal resolution; TAA upscales to the output. Captures (photo spots, gate shots) are
    // stills: native.
    post.post.renderScale = g.capture ? 1 : params.v.renderScale;
  } });

  // System toggles. Changing the drawn mesh set invalidates a recorded snapshot.
  const reg = registerToggle;
  const meshToggle = (mesh) => (on) => { mesh.setEnabled(on); engine.snapshotRenderingReset(); };
  reg({ key: 'sky', label: 'sky', group: 'System', on: true, onChange: meshToggle(content.sky) });
  reg({ key: 'terrain', label: 'terrain', group: 'System', on: true, onChange: meshToggle(content.terrain) });
  reg({ key: 'ring', label: 'mountain ring', group: 'System', on: true, onChange: meshToggle(ring) });
  reg({ key: 'spindrift', label: 'spindrift', group: 'System', on: true, onChange: meshToggle(spindrift.mesh) });
  reg({ key: 'snowfall', label: 'falling snow', group: 'System', on: true, onChange: meshToggle(snowfall.mesh) });
  reg({ key: 'rocks', label: 'rock outcrops', group: 'System', on: true, onChange: (on) => { for (const m of rocks.meshes) m.setEnabled(on); engine.snapshotRenderingReset(); } });
  reg({ key: 'player', label: 'player (the Wraith)', group: 'System', on: true, onChange: (on) => { wraithView.setEnabled(on); engine.snapshotRenderingReset(); } });
  // Shadows fade under a closed cloud deck (what little sun remains is diffused by it).
  let shadowsOn = true;
  reg({ key: 'shadows', label: 'shadows', group: 'System', on: true, onChange: (on) => { shadowsOn = on; } });
  loop.add({ name: 'shadowStrength', update: () => { shadows.strength = shadowsOn ? 1 - 0.85 * atmosphere.deck : 0; } });
  reg({ key: 'autosave', label: 'autosave', group: 'System', on: true });
  reg({ key: 'footprints', label: 'player footprints', group: 'Terrain', on: true });
}
