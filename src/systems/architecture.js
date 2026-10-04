// The built places of the frost chapter (world/architecture.js): seated on the ground once it is
// known under them (anchor patches keep it known from afar), shown, collided with. Shrines the
// Wraith has rested at keep a cold light in their glyphs; the monastery's wake when the steppe is
// restored; the camp's fire burns brighter at night.

import { frostSites, buildArchitecture } from '../world/architecture.js';
import { createSolids } from '../world/solids.js';
import { createArchitectureView } from '../render/architecture.js';

/** @param {any} g  shared boot context */
export function addArchitectureSystem(g) {
  const { loop, scene, atmosphere, shadows, bindShadows, ground, streamer, controller, chapter, params, weather, restoration, clock } = g;
  const sites = frostSites(chapter.table);
  const built = buildArchitecture(sites);
  const view = g.architecture = createArchitectureView(scene, atmosphere, built);
  bindShadows(view.material, shadows);
  shadows.addCaster(view.mesh, view.makeShadowMaterial, 1);
  view.freeze();
  const solids = g.solids = createSolids(sites, built);
  controller.solids = solids;
  // Ground anchors for every site (indices after the NPCs' 1..5).
  sites.forEach((s, i) => streamer.setAnchor(8 + i, s.at[0], s.at[1]));
  const camp = sites.findIndex((s) => s.id === 'camp-frost');
  view.glow[camp * 4 + 2] = sites[camp].at[0]; view.glow[camp * 4 + 3] = sites[camp].at[1];

  /** Seat: the lowest ground over the site's footprint (9 samples), or NaN until known. */
  function seat(s) {
    let lo = Infinity;
    for (let k = 0; k < 9; k++) {
      const a = (k / 8) * Math.PI * 2, r = k === 8 ? 0 : s.footprint;
      ground.qx = s.at[0] + Math.cos(a) * r; ground.qz = s.at[1] + Math.sin(a) * r;
      if (!ground.covers()) return NaN;
      ground.sample(); lo = Math.min(lo, ground.h);
    }
    return lo;
  }
  let frame = 0;
  loop.add({ name: 'architecture', update: () => {
    frame++;
    const p = controller.pos;
    // Seat sites whose ground has come in (re-seated only while far, so nothing shifts in view).
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i], o = i * 4;
      if ((frame + i) % 20 !== 0 && view.sites[o + 3] > 0.5) continue;
      const dx = s.at[0] - p.x, dz = s.at[1] - p.z;
      if (view.sites[o + 3] > 0.5 && dx * dx + dz * dz < 200 * 200) continue;
      const y = seat(s);
      if (Number.isNaN(y)) continue;
      view.sites[o] = s.at[0]; view.sites[o + 1] = y; view.sites[o + 2] = s.at[1]; view.sites[o + 3] = 1;
      solids.sites[i].seat = y;
    }
    // Glyph light: shrines rested at; the monastery once the steppe is restored.
    for (let i = 0; i < sites.length; i++) {
      const id = sites[i].id;
      const want = id.startsWith('shrine') ? (chapter.shrines.has(id) ? 1 : 0.08) : id === 'monastery' ? 0.1 + 0.9 * restoration.value : id === 'varo-rise' ? 0.25 : 0;
      view.glow[i * 4] += (want - view.glow[i * 4]) * Math.min(1, clock.realDt * 0.8);
    }
    const tod = params.v.timeOfDay, night = tod < 6 || tod > 18.5 ? 1 : tod < 7 || tod > 17.5 ? 0.5 : 0.2;
    view.glow[camp * 4 + 1] = night;
    view.params.x = clock.simTime; view.params.y = weather.snow; view.params.z = restoration.value;
  } });
}
