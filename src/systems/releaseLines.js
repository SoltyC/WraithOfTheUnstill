// Release lines (docs/direction.md M4, "the land carries you on"; user 2026-11-22: build the connection now). When a Warden is
// released the land opens a way toward the next one. The first is The Melt: once the frost is restored, meltwater runs from
// the Warden's tarn down the fall line to the foot of the Bellwether's manor hill (data/world/releaseLines.json, baked by
// tools/world/releaseLines.mjs). It is drawn by a steady copy of the wadis' water (render/wadiWater.js) and it is a current:
// anywhere on it the Wraith can surf, whatever the ground (snow, then grass), slick, carried downstream (character/surf.js
// curA). About 1.5 km and 270 m of fall: a minute and a bit from one Warden to the next.
//
//   g.currents  { qx, qz → query() → fx, fz (unit flow), a (push m/s²), slick }   read by the player system
//   g.releaseLines  { lines, flow(id) }                                           for the bot and the tests

import { createWadiWater } from '../render/wadiWater.js';

/** The water sheet's share of the bed's half-width (render/wadiWater.js SPAN): the current covers the sheet and a little more. */
const SPAN = 0.42;
/** The push at the middle of the stream (m/s²), fading to nothing at its edge; how slick it is. */
export const CURRENT = { push: 5.5, slick: 0.7, edge: 1.25 };
const CC = 32;

/**
 * The current query over baked lines: segments in 32 m cells. `on(id)` says whether a line is running.
 * @param {{ id: string, pts: number[][] }[]} lines
 * @param {(id: string) => number} flowOf  0..1
 */
export function createCurrents(lines, flowOf) {
  const SEG = [], CELLS = new Map(), key = (i, j) => i * 65536 + j;
  lines.forEach((L, li) => {
    for (let k = 0; k < L.pts.length - 1; k++) {
      const [ax, az, aw] = L.pts[k], [bx, bz, bw] = L.pts[k + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      const si = SEG.length, r = Math.max(aw, bw) * SPAN * CURRENT.edge + 2;
      SEG.push({ ax, az, ex: (bx - ax) / len, ez: (bz - az) / len, len, wa: aw * SPAN * CURRENT.edge, wb: bw * SPAN * CURRENT.edge, li, id: L.id });
      for (let i = Math.floor((Math.min(ax, bx) - r) / CC); i <= Math.floor((Math.max(ax, bx) + r) / CC); i++)
        for (let j = Math.floor((Math.min(az, bz) - r) / CC); j <= Math.floor((Math.max(az, bz) + r) / CC); j++) {
          const kk = key(i, j); if (!CELLS.has(kk)) CELLS.set(kk, []); CELLS.get(kk).push(si);
        }
    }
  });
  return {
    qx: 0.5, qz: 0.5, fx: 0.5, fz: 0.5, wx: 0.5, wz: 0.5, a: 0.5, slick: 0.5, id: '',
    /** True when (qx, qz) is on a running line: sets fx, fz, a, slick. */
    query() {
      const list = CELLS.get(key(Math.floor(this.qx / CC), Math.floor(this.qz / CC))); if (!list) return false;
      let best = -1, bestK = 0, bestLat = 0, bestHw = 1;
      for (let n = 0; n < list.length; n++) {
        const s = SEG[list[n]], dx = this.qx - s.ax, dz = this.qz - s.az, t = dx * s.ex + dz * s.ez;
        if (t < -1 || t > s.len + 1) continue;
        const hw = s.wa + (s.wb - s.wa) * Math.min(1, Math.max(0, t / s.len)), sl = dx * s.ez - dz * s.ex, lat = Math.abs(sl);
        if (lat > hw) continue;
        const flow = flowOf(s.id); if (flow < 0.05) continue;
        const k = (1 - (lat / hw) * (lat / hw)) * flow;
        if (k > bestK) { bestK = k; best = list[n]; bestLat = sl; bestHw = hw; }
      }
      if (best < 0) return false;
      const s = SEG[best];
      // The way to ride: downstream, turned back toward the middle the further out it is (the banks hold the rider).
      const inward = -Math.max(-1, Math.min(1, bestLat / bestHw)) * 0.45;
      let wx = s.ex + s.ez * inward, wz = s.ez - s.ex * inward; const wl = Math.hypot(wx, wz); wx /= wl; wz /= wl;
      this.fx = s.ex; this.fz = s.ez; this.wx = wx; this.wz = wz; this.a = CURRENT.push * bestK; this.slick = CURRENT.slick; this.id = s.id;
      return true;
    },
  };
}

/** @param {any} g  shared boot context */
export async function addReleaseLines(g) {
  const { loop, scene, content, atmosphere, shadows, bindShadows, chapter, clock, ground, post } = g;
  const data = await fetch(import.meta.env.BASE_URL + 'world/releaseLines.json').then((r) => r.json());
  const lines = data.lines;
  const flow = Object.fromEntries(lines.map((L) => [L.id, 0]));
  const isRestored = (b) => g.ws?.restoration?.[b] === 'restored';   // (the chapter's facts know only the frost and the meadow)
  const released = (L) => isRestored(L.after) || g.qs?.get('lines') === '1';
  // One steady water ribbon per line (render/wadiWater.js with a constant flow; no desert flowers).
  const views = lines.map((L) => {
    const v = createWadiWater(scene, content.clipmap, atmosphere, shadows, bindShadows, [L], post.post.waterRipples, ground, post.post.waterSim[0], 'line-' + L.id);
    v.flow = 0; v.bloom = 0;
    return v;
  });
  // Already running when a save is loaded (no thaw to watch again).
  let first = true;
  { const prev = g.navSync; g.navSync = () => { prev?.(); first = true; }; }
  // Nothing stands in a line's bed: no boulder, no tree (systems/architecture.js adds these to the rock and tree keep-outs).
  g.lineExclusions = lines.flatMap((L) => L.pts.filter((_, k) => k % 1 === 0).map((p) => [p[0], p[1], p[2] * SPAN * CURRENT.edge + 3]));
  g.currents = createCurrents(lines, (id) => flow[id]);
  // No grass or ground cover in a running stream (render/clearance.js): its sheet, stamped every 4 m while it runs.
  const bedPts = lines.map((L) => { const out = []; for (let k = 0; k < L.pts.length - 1; k++) { const a = L.pts[k], b = L.pts[k + 1]; for (let t = 0; t < 1; t += 0.2) out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (a[2] + (b[2] - a[2]) * t) * SPAN * 0.85]); } return out; });
  g.clearance?.addSource({ near(x, z, r, cb) {
    lines.forEach((L, i) => { if (flow[L.id] < 0.3) return; for (const p of bedPts[i]) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < r * r) cb(p[0], p[1], p[2], p[2], 0); });
  } });
  const wasOn = {};
  g.releaseLines = { lines, flow: (id) => flow[id] };
  // Sight lines (M4): the first time a Warden is released in play, once its own scene is over, two shots — the way the land
  // has opened, then the next Warden's landmark on the horizon. Never on a load (the flag), skippable like any cutscene.
  const gh = (x, z) => { ground.qx = x; ground.qz = z; ground.sample(); return ground.h; };
  // (Viewpoints found by line of sight over the baked heights: the manor's towers are seen 40 m over the melt's sixth point;
  // the lip from 70 m over the knoll; the dunes from 50 m over the Dry Stair's lip.)
  const SIGHTS = {
    // The frost: the melt leaving the tarn, then from above its head, down the fall line to the Bellwether's manor and its towers.
    frost: () => {
      const P = lines.find((L) => L.id === 'melt').pts, a = P[1], b = P[6], m = [300, 1000];
      return [
        { dur: 5, ease: 1, drift: 0.02, dof: 0, keys: [{ t: 0, p: [a[0] - (b[0] - a[0]) * 0.3, gh(a[0], a[1]) + 6, a[1] - (b[1] - a[1]) * 0.3], at: [b[0], gh(b[0], b[1]), b[1]], fov: 0.8 }, { t: 1, p: [a[0], gh(a[0], a[1]) + 10, a[1]], at: [b[0], gh(b[0], b[1]) - 2, b[1]], fov: 0.75 }] },
        { dur: 7, ease: 1, drift: 0.01, dof: 0, keys: [{ t: 0, p: [b[0], gh(b[0], b[1]) + 40, b[1]], at: [m[0], gh(m[0], m[1]) + 25, m[1]], fov: 0.45 }, { t: 1, p: [b[0], gh(b[0], b[1]) + 46, b[1]], at: [m[0], gh(m[0], m[1]) + 25, m[1]], fov: 0.26 }] },
      ];
    },
    // The meadow: over the knoll on the new winds toward the lip of the Dry Stair, then from the lip down onto the dunes.
    meadow: () => {
      const k = [600, 735], lip = [1040, 380], over = [950, 440], dn = [1800, 700];
      return [
        { dur: 6, ease: 1, drift: 0.02, dof: 0, keys: [{ t: 0, p: [k[0] - 30, gh(k[0], k[1]) + 60, k[1] + 25], at: [lip[0], gh(lip[0], lip[1]) + 5, lip[1]], fov: 0.6 }, { t: 1, p: [k[0], gh(k[0], k[1]) + 70, k[1]], at: [lip[0], gh(lip[0], lip[1]) + 5, lip[1]], fov: 0.45 }] },
        { dur: 7, ease: 1, drift: 0.01, dof: 0, keys: [{ t: 0, p: [over[0], gh(over[0], over[1]) + 50, over[1]], at: [dn[0], gh(dn[0], dn[1]) + 30, dn[1]], fov: 0.6 }, { t: 1, p: [over[0] + 20, gh(over[0], over[1]) + 55, over[1]], at: [dn[0], gh(dn[0], dn[1]) + 30, dn[1]], fov: 0.42 }] },
        // …and west: the lake's outflow running down to the sea, the Sounding's jetty far off at its edge (seen 25 m over its 42nd point).
        ...(() => {
          const O = lines.find((L) => L.id === 'outflow')?.pts; if (!O) return [];
          const c = O[42], j = [-2505, -1400];
          return [{ dur: 7, ease: 1, drift: 0.01, dof: 0, keys: [{ t: 0, p: [c[0] + 30, Math.max(gh(c[0], c[1]), c[3]) + 25, c[1] + 30], at: [j[0], 8, j[1]], fov: 0.5 }, { t: 1, p: [c[0], Math.max(gh(c[0], c[1]), c[3]) + 28, c[1]], at: [j[0], 6, j[1]], fov: 0.28 }] }];
        })(),
      ];
    },
    // The dunes: heat shimmering up the Dry Stair over its new banners, then from over the Stair to its lip and the meadow beyond.
    dunes: () => {
      const w = [1790, 690], st = [1445, 543], over = [1550, 550], lip = [1040, 380];
      return [
        // (The dunes move and the Stair's canyon walls are not in the baked heights: the cameras ride well above both.)
        { dur: 5, ease: 1, drift: 0.02, dof: 0, keys: [{ t: 0, p: [w[0] + 40, gh(w[0], w[1]) + 110, w[1] + 20], at: [st[0], gh(st[0], st[1]) + 20, st[1]], fov: 0.7 }, { t: 1, p: [w[0], gh(w[0], w[1]) + 125, w[1]], at: [st[0], gh(st[0], st[1]) + 40, st[1]], fov: 0.6 }] },
        { dur: 7, ease: 1, drift: 0.01, dof: 0, keys: [{ t: 0, p: [over[0], gh(over[0], over[1]) + 95, over[1]], at: [lip[0], gh(lip[0], lip[1]) + 10, lip[1]], fov: 0.55 }, { t: 1, p: [over[0] - 20, gh(over[0], over[1]) + 110, over[1] - 8], at: [lip[0], gh(lip[0], lip[1]) + 10, lip[1]], fov: 0.4 }] },
      ];
    },
  };
  const sightWas = {}, sightWait = {};
  function sight(biome) {
    if (!g.director || !SIGHTS[biome]) return false;
    chapter.graph.flags.add('seen:sight:' + biome);
    g.director.play(SIGHTS[biome](), { blendIn: 1.5, blendOut: 1.5 });
    return true;
  }
  g.releaseLines.sight = sight;
  function sightTick(dt) {
    for (const b in SIGHTS) {
      const on = isRestored(b);
      if (first) { sightWas[b] = on; continue; }
      if (on && !sightWas[b] && !chapter.graph.flags.has('seen:sight:' + b)) sightWait[b] = 4;   // released just now, in play
      sightWas[b] = on;
      if (sightWait[b] > 0) {
        // After the release's own scene: the director idle, the Wraith free, a few seconds of quiet.
        if (g.director?.active || g.controller.hold || g.capture) { sightWait[b] = 4; continue; }
        sightWait[b] -= dt; if (sightWait[b] <= 0) sight(b);
      }
    }
  }
  loop.add({ name: 'releaseLines', update: () => {
    const dt = clock.dt;
    lines.forEach((L, i) => {
      const on = released(L) ? 1 : 0;
      // The thaw: the water comes down over about twenty seconds.
      flow[L.id] = first ? on : on > flow[L.id] ? Math.min(1, flow[L.id] + dt / 20) : Math.max(0, flow[L.id] - dt / 4);
      const v = views[i]; v.time = clock.simTime; v.flow = flow[L.id]; v.update();
      const on2 = flow[L.id] >= 0.3; if (on2 !== wasOn[L.id]) { wasOn[L.id] = on2; g.clearance?.invalidate(); }
    });
    sightTick(dt);
    first = false;
  } });
}
