// The eruption's lava flows (systems/eruption.js; docs/phase-11/ember-design.md §7 "lava down the valleys"): each traced
// downhill from a notch in the crater's rim over the exact height field (src/world/worldData.js), with inertia, on the
// ground smoothed over ~14 m (lava follows valleys, not pebbles). The Sow's flow fills the basin under the west flank and
// spills over its lip toward the farms (a waypoint it is drawn to until past it). Per point every STEP m: x, z, the
// ground's height, the half-width (wide on the flats, narrow in the gullies), the time (s from the eruption) the front
// gets there, and the ground across the flow at ACROSS points (for the ribbon). Writes data/world/lavaFlows.json.
//   node tools/world/lavaFlows.mjs
import fs from 'node:fs';
import { WorldData } from '../../src/world/worldData.js';
import { PIT } from '../../src/world/crater.js';

const dir = 'data/world/', manifest = JSON.parse(fs.readFileSync(dir + 'manifest.json'));
const rd = (file, T) => { const b = fs.readFileSync(dir + file); return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); };
const world = new WorldData(manifest);
world.overview = rd(manifest.height.overview.file, Uint16Array); world.biomeA = rd(manifest.biome.files[0], Uint8Array); world.biomeB = rd(manifest.biome.files[1], Uint8Array); world.wind = rd(manifest.wind.file, Uint8Array); world.dunes = rd(manifest.dunes.file, Uint8Array);
for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) world.setTile(x, z, rd(`height/${x}_${z}.u16`, Uint16Array));
const H = (x, z) => { world.qx = x; world.qz = z; world.sample(); return world.h; };
const Hs = (x, z, r = 14) => { let s = 2 * H(x, z); for (let a = 0; a < 8; a++) s += H(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r); return s / 10; };

const STEP = 2, ACROSS = 13;
/** The flows: from the rim at an angle (atan2 dz, dx, degrees), how far, and a lip to be drawn over. */
const FLOWS = [
  { id: 'cinder', deg: 150, len: 1100, speed: 0.5 },                                       // north-west, through Cinderhold
  { id: 'sow', deg: 215, len: 2900, via: [1660, -2190], speed: 1.25 },                   // west: the basin, then the Sow's valley
  { id: 'east', deg: 30, len: 700, speed: 1 },                                           // east, into the empty ash
];

function trace(f) {
  const a = f.deg * Math.PI / 180;
  let x = PIT.x + Math.cos(a) * 172, z = PIT.z + Math.sin(a) * 172, dx = Math.cos(a), dz = Math.sin(a), passed = !f.via;
  const pts = [];
  let t = 0, prevY = H(x, z);
  for (let s = 0; s <= f.len; s += STEP) {
    const e = 4, gx = (Hs(x + e, z) - Hs(x - e, z)) / (2 * e), gz = (Hs(x, z + e) - Hs(x, z - e)) / (2 * e), gl = Math.hypot(gx, gz) || 1e-6;
    let tx = -gx / gl, tz = -gz / gl;
    // Drawn toward the lip until past it (the basin fills and spills over).
    if (!passed) {
      const vx = f.via[0] - x, vz = f.via[1] - z, vl = Math.hypot(vx, vz);
      if (vl < 25) passed = true;
      else { const k = Math.min(1, 0.35 + 0.65 * Math.max(0, 1 - gl * 6)); tx = tx * (1 - k) + vx / vl * k; tz = tz * (1 - k) + vz / vl * k; }
    }
    const kk = 1 - Math.pow(0.8, STEP / 4);   // (the same turning per metre whatever the step)
    dx = dx * (1 - kk) + tx * kk; dz = dz * (1 - kk) + tz * kk; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const y = H(x, z), slope = Math.max(0, (prevY - y) / STEP);
    // Narrow and quick on the steeps, wide and slow on the flats.
    const hw = Math.max(5, Math.min(17, 16 - slope * 28)), v = f.speed * Math.max(1.6, Math.min(9, 1.6 + slope * 16));
    if (s > 0) t += STEP / v;
    const nx = -dz, nz = dx, across = [];
    for (let k = 0; k < ACROSS; k++) { const u = (k / (ACROSS - 1)) * 2 - 1; across.push(Math.round(H(x + nx * u * hw, z + nz * u * hw) * 100) / 100); }
    pts.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(y * 100) / 100, Math.round(hw * 10) / 10, Math.round(t * 10) / 10, across]);
    prevY = y; x += dx * STEP; z += dz * STEP;
    // Pooled: the last 120 m of path went less than 60 m — the flow has spread into a sheet and stops (its lobe).
    const back = pts[pts.length - 61];
    if (passed && back && Math.hypot(x - back[0], z - back[1]) < 60) { pts.length -= 36; break; }
  }
  return { id: f.id, pts };
}

const out = { _comment: 'tools/world/lavaFlows.mjs: per flow, points every ' + STEP + ' m: [x, z, ground y, half-width, front arrival s, ground across (' + ACROSS + ', −hw … +hw, left of travel first)]', step: STEP, across: ACROSS, flows: FLOWS.map(trace) };
fs.writeFileSync(dir + 'lavaFlows.json', JSON.stringify(out) + '\n');
for (const f of out.flows) { const e = f.pts[f.pts.length - 1]; console.log(f.id, f.pts.length, 'points, ends', e[0], e[1], 'y', e[2], 'at', e[4], 's'); }
