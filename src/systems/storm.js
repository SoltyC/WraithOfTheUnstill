// The rain and the thunderstorm (Phase 8 M11), per frame: the rain renderer's inputs (density from the
// weather, the wind field's slant at the camera), the sound bed, lightning (world/lightning.js: the
// strike's flash turns the key light toward the bolt for a moment, lights the clouds and the key
// colour, and draws the bolt) and thunder arriving at the speed of sound. Wetness reaches the
// materials through env.wetParams (x wetness, y puddles, z rain, w lightning glow).

import { createLightning } from '../world/lightning.js';
import { env as envMod, updateEnvironment, invalidateEnvironment } from '../render/environment.js';
import { worldState } from '../game/worldState.js';

/** Key illuminance of a close strike's flash (the noon sun is 8.2). */
const FLASH_ILLUM = 1.7;

/** @param {any} g  shared boot context */
export function addStormSystems(g) {
  const { loop, weather, pendingTp, camera, clock, atmosphere, post, shadows, sfx, SFX, streamer, rain, bolt, arm, capture } = g;
  const env = envMod;
  const lightning = g.lightning = createLightning();
  let shelter = 0, shelterT = 0, lit = false, windSX = 1, windSZ = 0, boltVersion = -1, heldX = 0, heldZ = 0, shelterGoal = 0;
  // Ground height anywhere (the 8 m overview: strikes land beyond the streamed tiles).
  const farGround = (x, z) => {
    const ov = streamer.overview, n = streamer.overviewN; if (!ov) return 0;
    const i = Math.min(n - 1, Math.max(0, Math.floor((x + 4096) / 8))), j = Math.min(n - 1, Math.max(0, Math.floor((4096 - z) / 8)));
    return ov[j * n + i] / 32 - 128;
  };
  lightning.onThunder = (dist, gain, bearing) => {
    const p = camera.position;
    sfx.x = p.x + Math.sin(bearing) * 30; sfx.z = p.z + Math.cos(bearing) * 30; sfx.y = p.y;
    sfx.thunderDist = dist; sfx.gain = gain * 1.3;
    sfx.play(SFX.THUNDER);
  };
  // Before the atmosphere and the shadows read the key: the strike, then its light.
  loop.add({ name: 'lightning', update });
  function update() {
    const p = camera.position;
    lightning.storm = weather.storm; lightning.dt = clock.dt;
    lightning.camX = p.x; lightning.camY = p.y; lightning.camZ = p.z;
    // A forced strike (the dev overlay, a photo spot, the bot): bearing relative to the camera's view.
    const f = worldState.strike;
    if (f && !pendingTp.active) {
      worldState.strike = null;
      lightning.strike(arm.yaw + (f.bearing || 0) * Math.PI / 180, f.dist || 900, f.seed || 7, !!capture || !!f.hold);
      lightning.age = f.age ?? 0.04; lightning.shape();
    }
    // A held strike (a capture's) keeps its place relative to the camera as the view settles.
    if (lightning.hold && lightning.age >= 0 && (p.x - heldX) ** 2 + (p.z - heldZ) ** 2 > 0.25) { heldX = p.x; heldZ = p.z; lightning.reposition(); }
    lightning.update();
    const fl = lightning.flash;
    if (fl > 0.003) {
      env.keyDir.x = lightning.dirX; env.keyDir.y = lightning.dirY; env.keyDir.z = lightning.dirZ;
      lit = true;
    } else if (lit) { lit = false; invalidateEnvironment(); updateEnvironment(); } // the sun's (or moon's) direction again
    atmosphere.storm = weather.storm; atmosphere.flash = fl * FLASH_ILLUM;
    post.fog.glow = lightning.glow;
    env.wetParams.x = weather.wet; env.wetParams.y = weather.puddle; env.wetParams.z = weather.rain; env.wetParams.w = lightning.glow;
  }
  // After the weather: the rain, the bolt and the sound.
  loop.add({ name: 'rain', update: () => {
    const p = camera.position, wf = g.wind;
    // Rain slants with the wind at the camera (eased: gusts lean it, never jerk it).
    let sp = 0, dx = windSX, dz = windSZ;
    if (wf && wf.strength > 1e-3) { wf.sx = p.x; wf.sz = p.z; wf.sample(); sp = wf.speed; dx = wf.outX; dz = wf.outZ; }
    const ke = 1 - Math.exp(-clock.dt * 1.2);
    windSX += (dx - windSX) * ke; windSZ += (dz - windSZ) * ke;
    const wl = Math.sqrt(windSX * windSX + windSZ * windSZ) || 1;
    rain.windX = windSX / wl; rain.windZ = windSZ / wl;
    rain.fallSpeed = 8.8 + 1.6 * weather.storm;
    rain.windSpeed = Math.min(sp * 0.75, rain.fallSpeed * 0.95);
    // Under a roof or a floor above: the rain does not fall here (tested ~6×/s; eased), the bed is muffled.
    shelterT -= clock.realDt;
    const so = g.solids;
    if (shelterT <= 0 && so) { shelterT = 0.16; so.px = p.x; so.py = p.y; so.pz = p.z; shelterGoal = so.coveredQ() ? 1 : 0; }
    shelter += (shelterGoal - shelter) * (1 - Math.exp(-clock.realDt * 6));
    rain.density = weather.rain * (1 - shelter); rain.time = clock.simTime; rain.dt = clock.dt;
    rain.update();
    // The bolt: rebuilt per strike, bright for a third of a second.
    if (lightning.version !== boltVersion) {
      boltVersion = lightning.version;
      const gx = lightning.gx, gz = lightning.gz, sd = lightning.seed;
      bolt.build(boltVersion, sd, gx + (((sd * 37) % 11) - 5) * 40, lightning.topY, gz + (((sd * 53) % 11) - 5) * 40, gx, farGround(gx, gz), gz);
    }
    bolt.brightness = lightning.bolt;
    const fw = Math.pow(weather.fog, 2.2);
    bolt.fogDensity = 0.00002 + (0.02 - 0.00002) * fw; bolt.fogFalloff = 1 / (300 + 600 * weather.fog * weather.fog); bolt.fogBase = post.fog.groundY;
    bolt.update();
    sfx.rain = weather.rain; sfx.rainBed = weather.rain; sfx.shelter = shelter;
  } });
}
