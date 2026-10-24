// The village fire, wired (game/fire/villageFire.js has the rules): reads the Frost and Gale verbs each frame
// and turns them into douse / rain / freeze / fan / draw; heat hurts the Wraith (never below 25 % health) and
// throws it out of a fully burning house; feeds the flames (render/fire.js slots 8..47), a world light per
// burning building, the smoke, and the char of each site (render/architecture.js `char`).
// Allocation-free per frame (events add a quest flag string when something ignites, goes out or falls).
// Must be added after the architecture system (it overrides the fire slots 8.. and the fire wind).
//
// Dev: ?fire=1 (or the photo spot p8-fire-night) sets fire to the 12 buildings nearest the market square at night.

import { createVillageFire, heatDamage, fireTuning, S, EV, BUILDING_KINDS } from '../game/fire/villageFire.js';
import { worldState } from '../game/worldState.js';

const FIRST_SLOT = 8;        // 0..7: the camp (systems/architecture.js)
const LIGHT_POOL = 24;       // world lights shared by the burning buildings (nearest first)
const MARKET = [93, 926];

/** @param {any} g  shared boot context */
export function addVillageFireSystem(g) {
  const { loop, clock, controller, params, qs, worldLights: WL } = g;
  const view = g.architecture, sites = g.archSites;
  const plots = g.village.plots.filter((p) => BUILDING_KINDS.includes(p.kind));
  const vf = g.villageFire = createVillageFire(plots);
  vf.events = [];
  const N = vf.N, T = fireTuning;
  const siteOf = new Int16Array(N), streamHits = new Uint8Array(N);
  for (let i = 0; i < N; i++) siteOf[i] = sites.findIndex((s) => s.id === 'vil-' + vf.ids[i]);
  for (let i = 0; i < N; i++) {
    const m = siteOf[i] >= 0 && sites[siteOf[i]].build && sites[siteOf[i]].build.meta;
    if (m && m.ridgeY) vf.setRidge(i, m.ridgeY, m.ridgeAlongA, m.ridgeHalf, m.ridgeC);
  }
  const F = g.fire.fires, FX = g.fire.fireX, FL = g.fire.fireL, FT = g.fire.fireT;
  const SLOTS = F.length / 4;

  /** The fire's own wind (the meadow is stilled: its air barely moves, so spread and smoke lean on a floor of 0.5). Override: g.villageFireWind = { x, z, strength }. */
  const wind = { x: 1, z: 0, strength: 0.5 };
  const windAt = () => {
    const o = g.villageFireWind;
    if (o) { wind.x = o.x; wind.z = o.z; wind.strength = o.strength; return; }
    const wf = g.wind;
    wind.x = wf ? wf.dirX : 1; wind.z = wf ? wf.dirZ : 0;
    wind.strength = Math.min(1, Math.max(0.5, wf ? wf.strength * 0.5 : 0.5));
  };

  // ---- The verbs ----
  let rainX = 0, rainZ = 0, rainLeft = 0;
  const verbs = (v, dt) => {
    const fr = g.frost, ga = g.gale;
    if (fr) {
      // The Ribbon's water: every live node of the stream over a burning house cools it (a quarter of the
      // stream on it is a full douse). Only the far tip counted before, and its figure-eight mostly missed
      // the roof (bot playtest 2026-10-24: 3 s of Ribbon took 0.25 heat off a house).
      let tip = -1;
      if (fr.ribbonStrength > 0.3) {
        const nodes = fr.ribbonNodes, NN = nodes.length / 4;
        streamHits.fill(0); let live = 0;
        for (let n = 0; n < NN; n++) {
          if (!(nodes[n * 4 + 3] > 0.15)) continue;
          live++; tip = n;
          const i = v.nearestBurning(nodes[n * 4], nodes[n * 4 + 2], 1.5);
          if (i >= 0) streamHits[i]++;
        }
        const q = Math.max(2, live * 0.25);
        for (let i = 0; i < N; i++) if (streamHits[i] > 0) v.douseAt(i, T.ribbonRate * dt * fr.ribbonStrength * Math.min(1, streamHits[i] / q));
      }
      if (tip >= 0) {
        const x = fr.ribbonNodes[tip * 4], y = fr.ribbonNodes[tip * 4 + 1], z = fr.ribbonNodes[tip * 4 + 2];
        // Through an Updraft the stream rains down over the whole roof.
        if (ga && ga.liftAt(x, y, z) > 0.4) { rainX = x; rainZ = z; rainLeft = 1.2; }
      }
      for (let k = 0; k < fr.sweepActive.length; k++) if (fr.sweepActive[k] && fr.sweepHW[k] > 0.05) v.douseBurst(fr.sweepFX[k], fr.sweepFZ[k], fr.sweepHW[k] + 0.8, T.sweepBurst, fr.sweepId[k]);
      if (fr.crystalEvent) v.freeze(fr.crystalX, fr.crystalZ, T.freezeRadius, T.freezeSeconds);
    }
    if (rainLeft > 0) { rainLeft -= dt; v.rain(rainX, rainZ, T.rainRadius, T.rainRate); }
    if (ga) {
      for (let k = 0; k < ga.gustActive.length; k++) if (ga.gustActive[k] && ga.gustHW[k] > 0.05) v.fan(ga.gustFX[k], ga.gustFZ[k], ga.gustDX[k], ga.gustDZ[k], T.fanHeat * dt, ga.gustHW[k] + 2);
      if (ga.vortexStrength > 0.2) v.draw(ga.vortexX, ga.vortexZ, 6);
      for (let a = 0; a < v.nAct; a++) {
        const i = v.act[a];
        if (v.state[i] !== S.OUT && ga.liftAt(v.x(i), v.baseY(i) + 3, v.z(i)) > 0.5) v.draw(v.x(i), v.z(i), 0.5);
      }
    }
  };

  // ---- Visual ranking (nearest first), reused buffers ----
  const cand = new Int16Array(N), candD = new Float32Array(N);
  const out3 = new Float32Array(3), seg4 = new Float32Array(4);
  const lights = [];
  for (let i = 0; i < LIGHT_POOL; i++) lights.push(WL.add({ x: NaN, y: NaN, z: NaN, radius: 20, color: [1, 0.4, 0.12], intensity: 1, kind: 'fire', level: 0 }));

  // ---- Hearths (the chimneys of the village, for smoke once it is restored) ----
  const hearths = (() => {
    const site = [], lx = [], ly = [], lz = [];
    sites.forEach((st, i) => { const c = st.id.startsWith('vil-') && st.build && st.build.meta && st.build.meta.chimneyTop; if (c) { site.push(i); lx.push(c[0]); ly.push(c[1]); lz.push(c[2]); } });
    const n = site.length, MAX = 12;
    return { n, site, lx, ly, lz, order: new Int16Array(MAX), d: new Float32Array(MAX), shown: 0, sortIn: 0, MAX };
  })();
  function rankHearths(cx, cz) {
    const H = hearths; let k = 0;
    for (let h = 0; h < H.n; h++) {
      const s = H.site[h], d = Math.hypot(view.sites[s * 4] - cx, view.sites[s * 4 + 2] - cz);
      if (d > 260 || (h * 7) % 3 === 0) continue;   // two chimneys in three are lit
      let q = Math.min(k, H.MAX - 1);
      if (k >= H.MAX && d >= H.d[q]) continue;
      while (q > 0 && H.d[q - 1] > d) { H.d[q] = H.d[q - 1]; H.order[q] = H.order[q - 1]; q--; }
      H.d[q] = d; H.order[q] = h; if (k < H.MAX) k++;
    }
    H.shown = k;
  }

  function feed() {
    const cam = g.camera.position, wn = WL.night;
    let nc = 0;
    for (let a = 0; a < vf.nAct; a++) {
      const i = vf.act[a];
      if (vf.state[i] === S.OUT) continue;
      const dx = vf.x(i) - cam.x, dz = vf.z(i) - cam.z, d = dx * dx + dz * dz;
      let q = nc++;
      while (q > 0 && candD[q - 1] > d) { candD[q] = candD[q - 1]; cand[q] = cand[q - 1]; q--; }
      candD[q] = d; cand[q] = i;
    }
    let slot = FIRST_SLOT, li = 0;
    for (let c = 0; c < nc && slot < SLOTS; c++) {
      const i = cand[c], d = Math.sqrt(candD[c]), s = siteOf[i];
      const seat = s >= 0 && view.sites[s * 4 + 3] > 0.5 ? view.sites[s * 4 + 1] : vf.baseY(i);
      const lod = d < 60 ? 1 : d < 140 ? 0.7 : d < 300 ? 0.45 : 0.3;
      const n = vf.emitterCount(i);
      if (n > 0) {
        const ne = Math.min(n, d > 160 ? 1 : d > 80 ? 2 : 3);
        for (let k = 0; k < ne && slot < SLOTS; k++, slot++) {
          const size = vf.emitter(i, k, out3), o = slot * 4;
          F[o] = out3[0]; F[o + 1] = seat + out3[1]; F[o + 2] = out3[2]; F[o + 3] = size;
          FX[o] = k === 0 ? 1.1 + 0.9 * vf.smoke[i] : 0.7; FX[o + 1] = 1; FX[o + 2] = lod; FX[o + 3] = k === 0 ? 0.5 + 0.5 * vf.smoke[i] : 0.6;
          vf.emitterSegment(i, k, seg4); FL[o] = seg4[0]; FL[o + 1] = seg4[1]; FL[o + 2] = seg4[2]; FL[o + 3] = seg4[3]; // tongues along the ridge / out of the opening
        }
        if (li < LIGHT_POOL) {
          const L = lights[li++];
          vf.emitter(i, 0, out3);
          L.x = vf.x(i); L.y = seat + out3[1] * 0.8; L.z = vf.z(i);
          L.level = vf.heat[i]; L.intensity = 6 + 10 * wn;
        }
      } else if (vf.smoke[i] > 0.04) {
        const size = vf.smokePoint(i, out3), o = slot * 4;
        F[o] = out3[0]; F[o + 1] = seat + out3[1]; F[o + 2] = out3[2]; F[o + 3] = size;
        FX[o] = 1.2 + 0.6 * vf.smoke[i]; FX[o + 1] = 0; FX[o + 2] = lod; FX[o + 3] = 0.85;
        FL[o] = 0; FL[o + 1] = 0; FL[o + 2] = 0; FL[o + 3] = 0;
        slot++;
      }
    }
    // Hearth smoke: after the release the air moves again and the village's chimneys smoke (the nearest few, thin and pale).
    if (hearths.n > 0 && worldState.restoration.meadow === 'restored' && vf.nAct === 0) {
      if (--hearths.sortIn <= 0) { hearths.sortIn = 30; rankHearths(cam.x, cam.z); }
      for (let c = 0; c < hearths.shown && slot < SLOTS; c++, slot++) {
        const h = hearths.order[c], s = hearths.site[h], o = slot * 4;
        if (view.sites[s * 4 + 3] < 0.5) { F[o + 3] = 0; continue; }
        F[o] = view.sites[s * 4] + hearths.lx[h]; F[o + 1] = view.sites[s * 4 + 1] + hearths.ly[h]; F[o + 2] = view.sites[s * 4 + 2] + hearths.lz[h]; F[o + 3] = 1.3;
        FX[o] = 1.0; FX[o + 1] = 0; FX[o + 2] = hearths.d[c] < 90 ? 0.8 : 0.5; FX[o + 3] = 0.35;
        FL[o] = 0; FL[o + 1] = 0; FL[o + 2] = 0; FL[o + 3] = 0;
      }
      const l = Math.hypot(wind.x, wind.z) || 1;
      FT.y = wind.x / l; FT.z = wind.z / l; FT.w = 0.3 + 0.4 * wind.strength;
    }
    for (; slot < SLOTS; slot++) F[slot * 4 + 3] = 0;
    for (; li < LIGHT_POOL; li++) lights[li].level = 0;
    // Char per site; fire wind for the particles.
    for (let i = 0; i < N; i++) if (siteOf[i] >= 0) view.char[siteOf[i]] = vf.char[i];
    if (vf.nAct > 0) {
      const l = Math.hypot(wind.x, wind.z) || 1;
      FT.y = wind.x / l; FT.z = wind.z / l; FT.w = Math.max(FT.w, 0.25 + 0.55 * wind.strength);
    }
  }

  // ---- The Wraith ----
  const door = [0, 0];
  let dwell = 0, burns = 0, coolT = 0;
  function wraith(dt) {
    const co = g.combat; if (!co || co.dying > 0 || dt <= 0) return;
    const p = controller.pos;
    const h = vf.heatAt(p.x, p.y, p.z);
    const inside = vf.insideAt(p.x, p.z, T.ejectHeat);
    if (h > T.damageHeat) {
      const d = heatDamage(h, dt, co.health, g.combatTuning.health);
      co.health -= d; burns += d; coolT = 0;
      // Only inside a burning house does the heat sap focus: out in the street it would starve the Ribbon
      // that puts the fire out (bot playtest 2026-10-24: focus sat at 0 beside the houses).
      if (inside >= 0) co.focus = Math.max(0, co.focus - T.focusPerSec * h * dt);
    } else if (burns > 0) {
      // Burns heal once out of the heat a moment (only what the fire took: the fight's wounds stay).
      coolT += dt;
      if (coolT > T.burnHealDelay) { const k = Math.min(burns, T.burnHealRate * dt, g.combatTuning.health - co.health); if (k > 0) { co.health += k; burns -= k; } else burns = 0; }
    }
    // Inside a fully burning house: after a moment the heat drives the Wraith out of the door (health unchanged by this).
    if (inside < 0) { dwell = Math.max(0, dwell - 2 * dt); return; }
    dwell += dt;
    if (dwell < T.ejectDwell) return;
    dwell = 0;
    vf.doorPoint(inside, door);
    const s = siteOf[inside], seat = s >= 0 ? view.sites[s * 4 + 1] : vf.baseY(inside);
    p.x = door[0]; p.z = door[1]; p.y = Math.max(p.y, seat + 0.3);
    controller.vel.x = (door[0] - vf.x(inside)) * 0.8; controller.vel.z = (door[1] - vf.z(inside)) * 0.8; controller.vel.y = 0;
    co.shake = Math.max(co.shake, 0.03);
    if (g.hud) g.hud.notice('The fire', 'The heat drives you back', '', 4);
  }

  // ---- Quest events as flags ----
  const KIND = { [EV.IGNITED]: 'fire:ignited:', [EV.OUT]: 'fire:out:', [EV.COLLAPSED]: 'fire:collapsed:' };
  function events() {
    const flags = g.chapter && g.chapter.graph ? g.chapter.graph.flags : null;
    if (flags) for (let e = 0; e < vf.evCount; e++) flags.add(KIND[vf.evKind[e]] + vf.ids[vf.evId[e]]);
    // The quest's view of them (systems/villagers.js): { type, plot } appended (a few a minute).
    for (let e = 0; e < vf.evCount; e++) { const k = vf.evKind[e]; if (k === EV.IGNITED || k === EV.OUT) vf.events.push({ type: k === EV.IGNITED ? 'ignited' : 'out', plot: vf.ids[vf.evId[e]] }); }
    vf.clearEvents();
  }

  // ---- Dev hook ----
  const spot = qs.get('spot');
  if (qs.get('fire') === '1' || spot === 'p8-fire-night') {
    const order = [];
    for (let i = 0; i < N; i++) order.push(i);
    order.sort((a, b) => Math.hypot(vf.x(a) - MARKET[0], vf.z(a) - MARKET[1]) - Math.hypot(vf.x(b) - MARKET[0], vf.z(b) - MARKET[1]));
    for (let k = 0; k < 12 && k < N; k++) vf.ignite(order[k], 0);
    windAt();
    for (let t = 0; t < 75; t += 0.25) vf.update(0.25, wind); // already well alight when the player arrives
    vf.clearEvents();
    if (!spot) params.v.timeOfDay = 22;
  }

  loop.add({ name: 'villageFire', update: () => {
    const dt = clock.dt;
    windAt();
    if (dt > 0) { vf.update(dt, wind, verbs); events(); wraith(dt); }
    feed();
  } });
}
