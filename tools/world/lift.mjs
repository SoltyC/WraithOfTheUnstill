// Ridge-lift analysis over the baked world (restored-world play, docs/gameplay-design.md §7): the climatology's wind
// and the ground's slope give the rising air a glide meets (the same rule as character/playerSystem.js: wind · uphill
// slope × WIND_MS, fading with height over RIDGE_FADE). `node tools/world/lift.mjs map cx cz half step [speed]` prints
// the lift in m/s as one digit (. = none, + = 10 and over); `fly x z y heading` flies a steady glide and prints its track.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorldSampler } from './sample.mjs';
import { Glide } from '../../src/character/glide.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/world/');
const wd = fs.readFileSync(dir + 'wind.rg8');
export const S = createWorldSampler();
export const WIND_MS = 7, RIDGE_FADE = 45;
/** Climatology wind (unit, toward) at the point: the 32 m map, nearest texel. */
export function windAt(x, z, out = [0, 0]) {
  const i = Math.max(0, Math.min(255, Math.floor((x + 4096) / 32))), j = Math.max(0, Math.min(255, Math.floor((4096 - z) / 32))), o = (j * 256 + i) * 2;
  out[0] = (wd[o] - 128) / 127; out[1] = (wd[o + 1] - 128) / 127; return out;
}
/** Wind-up-the-slope term at the ground: wind · uphill gradient (rise over run), 0 on the lee. */
export function upslope(x, z, w = [0, 0]) {
  windAt(x, z, w);
  const gx = (S.h(x + 6, z) - S.h(x - 6, z)) / 12, gz = (S.h(x, z + 6) - S.h(x, z - 6)) / 12;
  return Math.max(0, w[0] * gx + w[1] * gz);
}
/** Rising air (m/s) for a glide `above` m over the ground at (x, z), at wind speed `speed` (the field's: ~0.5 mean). */
export function riseAt(x, z, above, speed = 0.5) { return speed * WIND_MS * upslope(x, z) * Math.exp(-Math.max(0, above) / RIDGE_FADE); }

/** Fly a glide from (x, z, y) at `heading` (rad, 0 = +z), steering by `steerFn(g, x, y, z, t)` -> -1..1, throttle by `thrFn`. Returns the track. */
export function fly(x, z, y, heading, { steer = () => 0, thr = () => 0, speed = 0.5, dt = 1 / 30, max = 240, speedUp = 1 } = {}) {
  const g = new Glide(); Object.assign(g, { want: true, airborne: true, height: 30 });
  g.engage(Math.sin(heading) * 13, -1, Math.cos(heading) * 13, heading);
  const track = []; let t = 0;
  while (t < max) {
    const gh = S.h(x, z), above = y - gh;
    if (above < 1) break;
    g.height = above; g.rise = riseAt(x, z, above, speed * speedUp); g.steer = steer(g, x, y, z, t); g.throttle = thr(g, x, y, z, t);
    g.engage(g.vx, g.vy, g.vz, g.heading); g.step(dt);
    x += g.vx * dt; z += g.vz * dt; y += g.vy * dt; t += dt;
    if (track.length === 0 || t - track[track.length - 1][0] >= 1) track.push([+t.toFixed(0), Math.round(x), Math.round(z), Math.round(y), +g.rise.toFixed(1)]);
  }
  return { track, t, x, z, y, landed: y - S.h(x, z) < 1.5 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , cmd, ...a] = process.argv;
  if (cmd === 'map') {
    const [cx, cz, half, step, speed] = a.map(Number);
    for (let z = cz + half; z >= cz - half; z -= step) {
      let row = String(Math.round(z)).padStart(6) + ' ';
      for (let x = cx - half; x <= cx + half; x += step) { const r = riseAt(x, z, 0, speed || 0.5); row += r < 0.3 ? '.' : r >= 10 ? '+' : String(Math.floor(r)); }
      console.log(row);
    }
  } else if (cmd === 'fly') {
    const [x, z, y, h] = a.map(Number); const r = fly(x, z, y, h);
    console.log(r.track.map((p) => p.join(',')).join('  ')); console.log('landed', r.landed, 'at', Math.round(r.x), Math.round(r.z));
  } else if (cmd === 'wind') { console.log(windAt(+a[0], +a[1])); }
}
