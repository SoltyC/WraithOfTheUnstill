// Flies a restored-world glide course (data/restored.json `summit`) with a soaring pilot over the baked ground and the
// real glide model: heads for the next ring, and when the ring is out of reach in still air it works the nearest stream
// (up and down its line) until it can glide on. `node tools/world/courseSim.mjs [nostream]` prints the legs and the time.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { S, riseAt as natural } from './lift.mjs';
import { Glide, glideTuning as T } from '../../src/character/glide.js';
import { Streams } from '../../src/game/restored/streams.js';

const data = JSON.parse(fs.readFileSync(new URL('../../data/restored.json', import.meta.url)));
const RATIO = T.best / T.minSink;

export function flyCourse(rings, streamList, { dt = 1 / 30, wind = 0.5, restore = 1, verbose = false, start = null, max = 600 } = {}) {
  const st = new Streams(streamList, { frost: restore, meadow: restore });
  const g = new Glide(); Object.assign(g, { want: true, airborne: true, height: 30 });
  const r1 = rings[0], q0 = rings[1] || r1, b0 = Math.atan2(q0.pos[0] - r1.pos[0], q0.pos[1] - r1.pos[1]);
  let x = start ? start[0] : r1.pos[0] - Math.sin(b0) * 22, z = start ? start[1] : r1.pos[1] - Math.cos(b0) * 22, y = start ? start[2] : r1.y + 3;
  { const h0 = start && start[3] !== undefined ? start[3] : b0; g.engage(Math.sin(h0) * 11, -1, Math.cos(h0) * 11, h0); }
  let next = 0, t = 0, soaring = -1, dir = 1, lost = null; const log = [];
  const k = wind / 0.5;
  while (t < max && next < rings.length) {
    const R = rings[next], gh = S.h(x, z), above = y - gh;
    if (above < 1.5) { lost = 'landed at ' + Math.round(x) + ',' + Math.round(z) + ' for ring ' + (next + 1); break; }
    const dx = R.pos[0] - x, dz = R.pos[1] - z, dist = Math.hypot(dx, dz), need = y - R.y;
    let tx = R.pos[0], tz = R.pos[1], thr = 0;
    // Reach in still air (the stream near the line may help, but the pilot counts on the glide alone).
    const reach = (y - (R.y - R.r * 0.6)) * (RATIO * 0.92);
    if (dist > reach && st.n) {
      // Work the stream nearest the Wraith: fly to its line, then along it and back.
      let bi = -1, bd = 1e9, bc = 1e9;
      for (let i = 0; i < st.n; i++) {
        if (!(st.restore[streamList[i].biome] > 0)) continue;
        const d = st.distance(i, x, z), pts = streamList[i].pts;
        let ex = pts[0][0], ez = pts[0][1], ed = 1e9;
        for (const p of pts) { const q = Math.hypot(p[0] - R.pos[0], p[1] - R.pos[1]); if (q < ed) { ed = q; ex = p[0]; ez = p[1]; } }
        const cost = d + ed;
        if (d < (y - gh) * RATIO * 0.75 && cost < bc) { bc = cost; bd = d; bi = i; }
      }
      if (bi >= 0) {
        soaring = bi; const pts = streamList[bi].pts, a = pts[0], b = pts[pts.length - 1];
        const ta = dir > 0 ? b : a;
        tx = ta[0]; tz = ta[1]; if (Math.hypot(tx - x, tz - z) < 40) dir = -dir;
        if (bd > streamList[bi].width * 0.6) { let nx = 0, nz = 0, best = 1e9; for (const p of pts) { const d = Math.hypot(p[0] - x, p[1] - z); if (d < best) { best = d; nx = p[0]; nz = p[1]; } } tx = nx; tz = nz; }
        thr = -0.2;
      }
    } else { soaring = -1; thr = need > dist / RATIO * 1.5 ? 1 : 0; }
    const want = Math.atan2(tx - x, tz - z); let d = want - g.heading; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
    g.height = above; g.steer = Math.max(-1, Math.min(1, d * 2.5)); g.throttle = thr;
    let rise = natural(x, z, above, wind) + st.rise(x, above, z, k);
    g.rise = rise;
    if (verbose && Math.abs(t % 2) < dt) log.push(`  t=${t.toFixed(0)} (${x.toFixed(0)},${z.toFixed(0)}) y=${y.toFixed(0)} agl=${above.toFixed(0)} rise=${rise.toFixed(1)} sp=${g.speed.toFixed(1)} vy=${g.vy.toFixed(1)} soar=${soaring} -> ring ${next + 1}`);
    g.engage(g.vx, g.vy, g.vz, g.heading); g.step(dt);
    x += g.vx * dt; z += g.vz * dt; y += g.vy * dt; t += dt;
    if (Math.hypot(x - R.pos[0], y - R.y, z - R.pos[1]) < R.r) { log.push(`ring ${next + 1} t=${t.toFixed(1)} y=${y.toFixed(0)} above=${(y - S.h(x, z)).toFixed(0)}`); next++; soaring = -1; }
  }
  return { reached: next, t, lost, log, x, z, y };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'road') {
    const chk = data.road.checks.map((c) => ({ ...c, y: c.y ?? S.h(c.pos[0], c.pos[1]) + c.agl + 12 }));
    const st = data.streams.filter((q) => q.biome === 'meadow');
    for (const [label, restore] of [['restored', 1], ['stilled', 0]]) {
      const r = flyCourse(chk, st, { restore, verbose: !!process.env.V, start: [128, 1060, S.h(128, 1060) + 3, 1.57], max: 900 });
      console.log(label, 'checks', r.reached + '/' + chk.length, 't=' + r.t.toFixed(1), r.lost || 'done'); console.log('  ' + r.log.join('\n  '));
    }
    process.exit(0);
  }
  const rings = data.summit.rings.map((r) => ({ ...r, y: r.y ?? S.h(r.pos[0], r.pos[1]) + r.agl }));
  for (const [label, restore] of [['restored', 1], ['stilled', 0]]) {
    const r = flyCourse(rings, data.streams, { restore, verbose: !!process.env.V });
    console.log(label, 'rings', r.reached + '/' + rings.length, 't=' + r.t.toFixed(1), r.lost || 'done'); console.log('  ' + r.log.join('\n  '));
  }
}
