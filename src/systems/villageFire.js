// The village fire, wired (game/fire/villageFire.js has the rules): reads the Frost and Gale verbs each frame
// and turns them into douse / rain / freeze / fan / draw; heat hurts the Wraith (never below 25 % health) and
// throws it out of a fully burning house; feeds the flames (render/fire.js slots 8..47), a world light per
// burning building, the smoke, and the char of each site (render/architecture.js `char`).
// Allocation-free per frame (events add a quest flag string when something ignites, goes out or falls).
// Must be added after the architecture system (it overrides the fire slots 8.. and the fire wind).
//
// Dev: ?fire=1 (or the photo spot p8-fire-night) sets fire to the 12 buildings nearest the market square at night.

import { createVillageFire, heatDamage, fireTuning, S, EV, BUILDING_KINDS } from '../game/fire/villageFire.js';

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
  const siteOf = new Int16Array(N);
  for (let i = 0; i < N; i++) siteOf[i] = sites.findIndex((s) => s.id === 'vil-' + vf.ids[i]);
  const F = g.fire.fires, FX = g.fire.fireX, FT = g.fire.fireT;
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
      // The Ribbon's far end (the oldest live node: where the water lands): water on whatever burns there.
      let tip = -1;
      if (fr.ribbonStrength > 0.3) for (let n = fr.ribbonNodes.length / 4 - 1; n >= 0; n--) if (fr.ribbonNodes[n * 4 + 3] > 0.15) { tip = n; break; }
      if (tip >= 0) {
        const x = fr.ribbonNodes[tip * 4], y = fr.ribbonNodes[tip * 4 + 1], z = fr.ribbonNodes[tip * 4 + 2];
        v.douse(x, z, 1.6, T.ribbonRate * dt * fr.ribbonStrength);
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
  const out3 = new Float32Array(3);
  const lights = [];
  for (let i = 0; i < LIGHT_POOL; i++) lights.push(WL.add({ x: NaN, y: NaN, z: NaN, radius: 20, color: [1, 0.4, 0.12], intensity: 1, kind: 'fire', level: 0 }));

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
        slot++;
      }
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
  let dwell = 0;
  function wraith(dt) {
    const co = g.combat; if (!co || co.dying > 0 || dt <= 0) return;
    const p = controller.pos;
    const h = vf.heatAt(p.x, p.y, p.z);
    if (h > T.damageHeat) {
      co.health -= heatDamage(h, dt, co.health, g.combatTuning.health);
      co.focus = Math.max(0, co.focus - T.focusPerSec * h * dt);
    }
    // Inside a fully burning house: after a moment the heat drives the Wraith out of the door (health unchanged by this).
    const inside = vf.insideAt(p.x, p.z, T.ejectHeat);
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
