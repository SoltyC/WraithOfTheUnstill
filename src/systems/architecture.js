// The built places of the frost chapter (world/architecture.js): seated on the ground once it is
// known under them (anchor patches keep it known from afar), shown, collided with. Shrines the
// Wraith has rested at keep a cold light in their glyphs; the monastery's wake when the steppe is
// restored; the camp's fire burns brighter at night.

import { frostSites, buildArchitecture, ARENA } from '../world/architecture.js';
import { createSolids } from '../world/solids.js';
import { createArchitectureView } from '../render/architecture.js';
import { BRUSH } from '../shaders/terrainState.wgsl.js';

/** @param {any} g  shared boot context */
export function addArchitectureSystem(g) {
  const { loop, scene, atmosphere, shadows, bindShadows, ground, streamer, controller, chapter, params, weather, restoration, clock } = g;
  const sites = frostSites(chapter.table, g.routes);
  // Pillars start sunk below the snow (the Warden's fight raises them).
  for (const s of sites) if (s.pillar) s.sink = (s.pillarH || ARENA.pillarH) + 1.2;
  const built = buildArchitecture(sites);
  const view = g.architecture = createArchitectureView(scene, atmosphere, built, g.matLib);
  view.material.setArray4('spellLights', g.content.clipmap.spellLights); // fire and spell light on stone and felt
  g.archSites = sites;
  bindShadows(view.material, shadows);
  shadows.addCaster(view.mesh, view.makeShadowMaterial, 1);
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
  let frame = 0;
  loop.add({ name: 'architecture', update: () => {
    frame++;
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
      view.sites[o] = s.at[0]; view.sites[o + 1] = y - (s.sink || 0); view.sites[o + 2] = s.at[1]; view.sites[o + 3] = 1;
      s.seatY = y; solids.sites[i].seat = y - (s.sink || 0);
    }
    // Moving sites (the arena's pillars rise and sink): their seat less how far they are sunk.
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      if (!s.pillar || s.seatY === undefined) continue;
      const y = s.seatY - s.sink;
      view.sites[i * 4 + 1] = y; solids.sites[i].seat = y;
    }
    // Glyph light: shrines rested at; the monastery once the steppe is restored.
    for (let i = 0; i < sites.length; i++) {
      const id = sites[i].id;
      const want = sites[i].glow !== undefined ? sites[i].glow : id.startsWith('shrine') ? (chapter.shrines.has(id) ? 1 : 0.08) : id === 'monastery' ? 0.1 + 0.9 * restoration.value : id === 'varo-rise' ? 0.25 : /^(gesture|echo-frost|brazier|run-gate)/.test(id) ? (chapter.graph.flags.has('lit:' + id) ? 1 : 0.12) : 0;
      view.glow[i * 4] += (want - view.glow[i * 4]) * Math.min(1, clock.realDt * 0.8);
    }
    const tod = params.v.timeOfDay, night = tod < 6 || tod > 18.5 ? 1 : tod < 7 || tod > 17.5 ? 0.5 : 0.2;
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
        b.r.level = b.l.kind === 'bounce' ? wn : 1;
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
