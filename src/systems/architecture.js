// The built places of the frost chapter (world/architecture.js): seated on the ground once it is
// known under them (anchor patches keep it known from afar), shown, collided with. Shrines the
// Wraith has rested at keep a cold light in their glyphs; the monastery's wake when the steppe is
// restored; the camp's fire burns brighter at night.

import { frostSites, meadowSites, swatches, buildArchitecture, chunkArchitecture, ARENA } from '../world/architecture.js';
import { createSolids } from '../world/solids.js';
import { createArchitectureView } from '../render/architecture.js';
import { SHADOW_SPLITS } from '../render/shadows.js';
import { BRUSH } from '../shaders/terrainState.wgsl.js';

/** @param {any} g  shared boot context */
export function addArchitectureSystem(g) {
  const { loop, engine, camera, scene, atmosphere, shadows, bindShadows, ground, streamer, controller, chapter, params, weather, restoration, clock } = g;
  // The frost chapter's sites, then the meadow hub's (appended: the frost indices never change).
  const sites = [...frostSites(chapter.table, g.routes), ...meadowSites()];
  // Dev only (?swatches=1): the village material swatch row (world/architecture.js swatches), on the dry ground by the hill.
  // Appended last and only when asked, so the shipped site list (and the frost geometry checksum) is unchanged.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('swatches') === '1') sites.push({ id: 'hub-swatches', at: [95, 975], facing: 0, build: swatches, footprint: 14, seatAt: 'center', windows: true });
  // Pillars start sunk below the snow (the Warden's fight raises them).
  for (const s of sites) if (s.pillar) s.sink = (s.pillarH || ARENA.pillarH) + 1.2;
  const built = buildArchitecture(sites);
  // Drawn as chunks (a 128 m cell of sites each; the NPC-held props apart), one shared material.
  const view = g.architecture = createArchitectureView(scene, atmosphere, chunkArchitecture(sites, built), g.matLib);
  view.material.setArray4('spellLights', g.content.clipmap.spellLights); view.material.setStorageBuffer('lightGrid', g.content.clipmap.lightGrid); // fire and spell light on stone and felt
  g.archSites = sites;
  bindShadows(view.material, shadows);
  for (const c of view.chunks) shadows.addCaster(c.mesh, view.makeShadowMaterial, 1);
  view.freeze();
  const solids = g.solids = createSolids(sites, built);
  // No boulders inside the built places (one stood beside the camp fire).
  g.rocks.setExclusions(sites.filter((s) => !s.prop).map((s) => [s.at[0], s.at[1], (s.box ? s.box * 1.45 : s.footprint) + 4]));
  /** Prop sites by NPC id (the NPC system places them at the hand). */
  g.props = {};
  sites.forEach((s, i) => { if (s.prop) g.props[s.npc] = { index: i, kind: s.kind }; });
  controller.solids = solids;
  // The camera keeps out of walls, columns and plinths (with the Warden's own occluder).
  const wardenOcc = g.arm.occluder;
  g.arm.occluder = {
    qx: 0.5, qy: 0.5, qz: 0.5,
    probe() {
      if (wardenOcc !== null) { wardenOcc.qx = this.qx; wardenOcc.qy = this.qy; wardenOcc.qz = this.qz; if (wardenOcc.probe()) return true; }
      solids.px = this.qx; solids.py = this.qy; solids.pz = this.qz;
      return solids.insideQ();
    },
  };
  g.wraithGround.solids = solids;
  // Ground anchors for every site (indices after the NPCs' 1..5).
  sites.forEach((s) => { if (!s.prop) streamer.addAnchor(s.at[0], s.at[1]); });
  const camp = sites.findIndex((s) => s.id === 'camp-frost');
  const brazierIdx = []; sites.forEach((s, i) => { if (s.id.startsWith('brazier-')) brazierIdx.push(i); });
  view.glow[camp * 4 + 2] = sites[camp].at[0]; view.glow[camp * 4 + 3] = sites[camp].at[1];
  // The hall's candles and vigil brazier burn (embers on a site without a hearth: render/architecture).
  view.glow[sites.findIndex((s) => s.id === 'monastery') * 4 + 3] = 1;
  // The meadow's places: no snow on them, and the hub's hearth burns.
  sites.forEach((s, i) => { if (s.id.startsWith('hub-')) view.glow[i * 4 + 2] = 1; });
  view.glow[sites.findIndex((s) => s.id === 'hub-green') * 4 + 3] = 1;
  // World lights (systems/lights.js): those built into the places (the hall's candles, its vigil
  // brazier, the moon under its fallen roof), the camp's hearth, each brazier once lit, and the
  // lanterns the Veiled carry — placed once their site is seated.
  const WL = g.worldLights;
  const builtLights = built.lights.map((l) => ({ l, r: WL.add({ x: NaN, y: NaN, z: NaN, radius: l.radius, color: l.color, intensity: l.intensity, kind: l.kind, level: 0 }) }));
  const hearth = WL.add({ x: NaN, y: NaN, z: NaN, radius: 16, color: [1, 0.5, 0.2], intensity: 1, kind: 'fire', level: 0 });
  const brazierLights = brazierIdx.map(() => WL.add({ x: NaN, y: NaN, z: NaN, radius: 10, color: [1, 0.52, 0.22], intensity: 1.6, kind: 'fire', level: 0 }));
  const lanternLights = [];
  sites.forEach((s, i) => { if (s.kind === 'lantern' && s.npc !== 'wraith') lanternLights.push({ i, r: WL.add({ x: NaN, y: NaN, z: NaN, radius: 7, color: [1, 0.6, 0.28], intensity: 0.7, kind: 'lamp', level: 0 }) }); });

  /** Seat: the lowest ground over the site's footprint (9 samples) — or the highest for a site
   *  built up from a peak (seatAt 'top', foundations running down) — or NaN until known. */
  function seat(s) {
    if (s.box) {
      // A platform over a peak: the highest ground anywhere under its square (1.5 m grid), so
      // no rock or snow of the summit shows through its floor.
      const cf = Math.cos(s.facing), sf = Math.sin(s.facing);
      let top = -Infinity;
      for (let j = -s.box; j <= s.box + 1e-6; j += 1.5) for (let i = -s.box; i <= s.box + 1e-6; i += 1.5) {
        ground.qx = s.at[0] + i * cf + j * sf; ground.qz = s.at[1] - i * sf + j * cf;
        if (!ground.covers()) return NaN;
        ground.sample(); if (ground.h > top) top = ground.h;
      }
      return top;
    }
    if (s.seatAt === 'center') {
      ground.qx = s.at[0]; ground.qz = s.at[1];
      if (!ground.covers()) return NaN;
      ground.sample(); return ground.h;
    }
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 9; k++) {
      const a = (k / 8) * Math.PI * 2, r = k === 8 ? 0 : s.footprint;
      ground.qx = s.at[0] + Math.cos(a) * r; ground.qz = s.at[1] + Math.sin(a) * r;
      if (!ground.covers()) return NaN;
      ground.sample(); lo = Math.min(lo, ground.h); hi = Math.max(hi, ground.h);
    }
    return s.seatAt === 'top' ? hi : lo;
  }
  // Chunk culling. Snapshot rendering replays recorded bundles, so Babylon's per-frame frustum test
  // never runs (every mesh here is alwaysSelectAsActiveMesh); chunks are switched by distance
  // instead, with hysteresis, and snapshotRenderingReset() only when a set actually changes. Shadow
  // render lists are not frustum-culled by Babylon either: a chunk joins cascade c's list when its
  // edge is within SHADOW_SPLITS[c] + SHADOW_MARGIN (casters outside a slice still shade into it).
  const DRAW_R = 800, SHADOW_MARGIN = 120, HYST = 40, WARM_FRAMES = 60;
  const inShadow = view.chunks.map(() => [true, true]);
  function cullChunks(px, pz) {
    let changed = false;
    view.chunks.forEach((c, k) => {
      if (c.prop) return;
      const d = Math.hypot(c.cx - px, c.cz - pz) - c.radius;
      const on = c.mesh.isEnabled(), want = on ? d < DRAW_R + HYST : d < DRAW_R;
      if (want !== on) { c.mesh.setEnabled(want); changed = true; }
      for (let ci = 0; ci < 2; ci++) {
        const r = SHADOW_SPLITS[ci] + SHADOW_MARGIN, was = inShadow[k][ci], w = was ? d < r + HYST : d < r;
        if (w !== was) { inShadow[k][ci] = w; shadows.setCasterActive(c.mesh, ci, w); changed = true; }
      }
    });
    if (changed) engine.snapshotRenderingReset();
  }
  let frame = 0;
  loop.add({ name: 'architecture', update: () => {
    frame++;
    // Everything draws through the loading frames (every pipeline is made then, BRIEF §15); culling starts after.
    if (frame > WARM_FRAMES && frame % 6 === 0) cullChunks(camera.position.x, camera.position.z);
    const p = controller.pos;
    // Seat sites whose ground has come in (re-seated only while far, so nothing shifts in view).
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i], o = i * 4;
      if (s.prop) continue; // moved by the NPC system
      if ((frame + i) % 20 !== 0 && view.sites[o + 3] > 0.5) continue;
      const dx = s.at[0] - p.x, dz = s.at[1] - p.z;
      if (view.sites[o + 3] > 0.5 && dx * dx + dz * dz < 200 * 200) continue;
      const y = seat(s);
      if (Number.isNaN(y)) continue;
      view.sites[o] = s.at[0]; view.sites[o + 1] = y - (s.sink || 0) + (s.lift || 0); view.sites[o + 2] = s.at[1]; view.sites[o + 3] = 1;
      s.seatY = y; solids.sites[i].seat = y - (s.sink || 0);
    }
    // Moving sites (the arena's pillars rise and sink): their seat less how far they are sunk.
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      if (!s.pillar || s.seatY === undefined) continue;
      const y = s.seatY - s.sink;
      view.sites[i * 4 + 1] = y; solids.sites[i].seat = y;
    }
    // Glyph light (siteGlow.x): shrines rested at; the monastery once the steppe is restored. A site with
    // `windows: true` (the village) uses the same channel as its night factor 0..1 for lit windows (MAT.GLASS):
    // x is read by the shader only for MAT.GLYPH carvings, which the village does not have.
    const tod = params.v.timeOfDay, night = tod < 6 || tod > 18.5 ? 1 : tod < 7 || tod > 17.5 ? 0.5 : 0.2;
    for (let i = 0; i < sites.length; i++) {
      const id = sites[i].id;
      const want = sites[i].glow !== undefined ? sites[i].glow : sites[i].windows ? (night - 0.2) / 0.8 : id.startsWith('shrine') ? (chapter.shrines.has(id) ? 1 : 0.08) : id === 'monastery' ? 0.1 + 0.9 * restoration.value : id === 'varo-rise' ? 0.25 : /^(gesture|echo-frost|brazier|run-gate)/.test(id) ? (chapter.graph.flags.has('lit:' + id) ? 1 : 0.12) : 0;
      view.glow[i * 4] += (want - view.glow[i * 4]) * Math.min(1, clock.realDt * 0.8);
    }
    view.glow[camp * 4 + 1] = night;
    for (let i = 0; i < sites.length; i++) if (sites[i].kind === 'lantern') view.glow[i * 4 + 1] = 0.35 + 0.65 * night;
    view.params.x = clock.simTime; view.params.y = weather.snow; view.params.z = restoration.value;
    // Flames: the camp's hearth always burns; a brazier once its flame is carried to it.
    { const F = g.fire.fires, cs = view.sites, co = camp * 4;
      F[0] = cs[co]; F[1] = cs[co + 1] + 0.08; F[2] = cs[co + 2]; F[3] = cs[co + 3] > 0.5 ? 1.25 : 0;
      let fi = 1;
      for (const bi of brazierIdx) {
        if (fi >= 8) break;
        const lit = chapter.graph.flags.has('lit:' + sites[bi].id) && cs[bi * 4 + 3] > 0.5;
        F[fi * 4] = cs[bi * 4]; F[fi * 4 + 1] = cs[bi * 4 + 1] + 1.26; F[fi * 4 + 2] = cs[bi * 4 + 2]; F[fi * 4 + 3] = lit ? 0.5 : 0; fi++;
      }
      // Fires built into the places (the hall's vigil brazier): flames on their coals.
      for (const b of builtLights) {
        if (b.l.kind !== 'fire' || fi >= 8) continue;
        F[fi * 4] = b.r.x; F[fi * 4 + 1] = b.r.y - 0.35; F[fi * 4 + 2] = b.r.z; F[fi * 4 + 3] = b.r.x === b.r.x ? 0.38 : 0; fi++;
      }
      const ft = g.fire.fireT; ft.x = clock.simTime; ft.y = streamer.windX || 1; ft.z = streamer.windZ || 0; ft.w = 0.15 + 0.85 * restoration.value;
    }
    // World lights follow their seated sites.
    { const cs = view.sites, wn = WL.night;
      for (const b of builtLights) {
        const o = b.l.site * 4; if (cs[o + 3] <= 0.5) continue;
        b.r.x = cs[o] + b.l.x; b.r.y = cs[o + 1] + b.l.y; b.r.z = cs[o + 2] + b.l.z;
        // The moon under the roof only by night; candles and the brazier always (Aud keeps them).
        b.r.level = b.l.kind === 'bounce' ? wn : b.l.kind === 'lamp' ? 0.35 + 0.65 * wn : 1;
      }
      const co = camp * 4;
      if (cs[co + 3] > 0.5) {
        hearth.x = cs[co]; hearth.y = cs[co + 1] + 0.7; hearth.z = cs[co + 2]; hearth.level = 1; hearth.intensity = 1.2 + 3.2 * wn;
        // The hearth has melted a wet hollow round itself (pressed again now and then so it never
        // heals while the Wraith is near; brushes keep the deeper mark, so repeats are free).
        const dx = cs[co] - p.x, dz = cs[co + 2] - p.z;
        if (frame % 240 === 1 && dx * dx + dz * dz < 60 * 60) {
          const ts = g.terrainState;
          ts.bx = cs[co]; ts.bz = cs[co + 2]; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = 1.7; ts.bd = 0.12; ts.bc = 0.8;
          ts.bk = BRUSH.PRESS; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0; ts.stamp();
          ts.bw = 2.4; ts.bd = 0; ts.bk = BRUSH.WET; ts.bwet = 0.9; ts.stamp();
        }
      }
      brazierIdx.forEach((bi, k) => {
        const r = brazierLights[k], o = bi * 4;
        r.level = chapter.graph.flags.has('lit:' + sites[bi].id) && cs[o + 3] > 0.5 ? 1 : 0;
        r.x = cs[o]; r.y = cs[o + 1] + 1.6; r.z = cs[o + 2];
      });
      for (const ll of lanternLights) {
        const o = ll.i * 4;
        ll.r.level = cs[o + 3] > 0.5 ? 0.35 + 0.65 * wn : 0;
        ll.r.x = cs[o]; ll.r.y = cs[o + 1] - 0.2; ll.r.z = cs[o + 2];
      }
    }
  } });
}
