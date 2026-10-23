// Village fire (docs/village/plan-fire-quest.md): pure, allocation-free logic for the meadow fire quest.
// Per building (house, house2, shop, workshop, barn, hall, chapel, farm) a state OUT / IGNITE / BURN /
// SMOULDER / DEAD with heat 0..1, structure 1..0 (what is left standing) and char 0..1 (soot; permanent
// until restoreAll(): the Bellwether's release). Fire spreads to neighbours within SPREAD_R, favoured
// downwind; the wind verbs act through douse / rain / freeze / fan / draw (see fireTuning for the rates the
// wiring in systems/villageFire.js uses). Heat never kills the Wraith: heatDamage() floors health at 25 %.
//
// No Math.random, no allocation after creation: arrays are reused, results are written into caller buffers.

export const S = { OUT: 0, IGNITE: 1, BURN: 2, SMOULDER: 3, DEAD: 4 };
export const EV = { IGNITED: 1, OUT: 2, COLLAPSED: 3 };
export const BUILDING_KINDS = ['house', 'house2', 'shop', 'workshop', 'barn', 'hall', 'chapel', 'farm'];

export const fireTuning = {
  spreadRadius: 12,        // m between centres within which a burning building can seed a neighbour
  spreadRate: 0.06,        // ember charge per second at heat 1, touching distance, no wind (0.12 burned 19 of 23 down in a bot playtest)
  burnMin: 170, burnSpan: 90, // s a building takes to burn down at full heat (+ about 8 s of ramp): ~3-4.5 min (14 fires at ~11 s each to reach and douse)
  igniteTime: 5,           // s from first spark to a steady fire
  smoulderTime: 14,        // s of embers before a quenched building is out
  deadCool: 25,            // s for the ruin's heat to fall
  // Extinguish rates the wiring uses (heat per second unless noted):
  ribbonRate: 0.8, sweepBurst: 0.45, rainRate: 1.6,   // (bot playtest 2026-10-24: 0.35 took ~20 s of Ribbon per house)
  rainRadius: 5, rainWet: 0.08,
  freezeSeconds: 20, freezeRadius: 4.5,
  fanHeat: 0.5, fanBoost: 3,  // heat/s raised by a gust front; seconds a fanned building spreads as if the wind were strong
  drawRate: 0.35, drawFloor: 0.2,   // vortex/updraft: extra heat decay /s, never below this (no extinguish)
  // The Wraith:
  damagePerSec: 4, damageFloor: 0.25, damageHeat: 0.3, focusPerSec: 7, ejectHeat: 0.8, ejectDwell: 1.1,
  burnHealDelay: 3, burnHealRate: 6,   // s out of the heat before burns heal; health per second
};

/** Per kind: ridge height (m above the seat), flame size scale, burn time multiplier. */
const KIND = {
  house: { roof: 3.6, scale: 1.0, burn: 1.0 }, house2: { roof: 6.0, scale: 1.15, burn: 1.1 }, shop: { roof: 6.2, scale: 1.15, burn: 1.1 },
  workshop: { roof: 4.6, scale: 1.1, burn: 1.1 }, barn: { roof: 5.6, scale: 1.3, burn: 1.0 }, hall: { roof: 6.8, scale: 1.45, burn: 1.15 },
  chapel: { roof: 8.0, scale: 1.3, burn: 1.15 }, farm: { roof: 4.2, scale: 1.1, burn: 1.0 },
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const hash01 = (n) => { let x = Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b; x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); x ^= x >>> 12; return (x >>> 0) / 4294967296; };

/** @param {Array<{id:string,kind:string,at:number[],facing:number,w:number,d:number,y?:number,seed?:number}>} plots */
export function createVillageFire(plots) {
  const T = fireTuning;
  const list = plots.filter((p) => KIND[p.kind]);
  const N = list.length;
  const ids = list.map((p) => p.id);
  const index = new Map(); ids.forEach((id, i) => index.set(id, i));
  const cx = new Float64Array(N), cz = new Float64Array(N), base = new Float64Array(N);
  const cs = new Float64Array(N), sn = new Float64Array(N);          // cos / sin of facing
  const rad = new Float64Array(N), hu = new Float64Array(N), hd = new Float64Array(N);
  const ridgeA = new Uint8Array(N).fill(1), ridgeH = new Float64Array(N), ridgeC = new Float64Array(N);
  const roof = new Float64Array(N), kscale = new Float64Array(N), burnTime = new Float64Array(N), thr = new Float64Array(N);
  list.forEach((p, i) => {
    const k = KIND[p.kind], h = hash01((p.seed | 0) + i * 7919);
    cx[i] = p.at[0]; cz[i] = p.at[1]; base[i] = p.y ?? 0; cs[i] = Math.cos(p.facing); sn[i] = Math.sin(p.facing);
    hu[i] = Math.max(1.2, p.w * 0.7); hd[i] = Math.max(1.2, p.d * 0.7); rad[i] = Math.sqrt(hu[i] * hd[i]) * 1.1;
    roof[i] = k.roof; kscale[i] = k.scale;
    burnTime[i] = (T.burnMin + T.burnSpan * h) * k.burn;
    thr[i] = 0.85 + 0.3 * hash01((p.seed | 0) ^ 0x51ed27);
  });
  // Neighbour lists (CSR): within spreadRadius, with the unit vector and distance precomputed.
  const nStart = new Int32Array(N + 1);
  let nn = 0;
  for (let i = 0; i < N; i++) { nStart[i] = nn; for (let j = 0; j < N; j++) if (j !== i && Math.hypot(cx[j] - cx[i], cz[j] - cz[i]) < T.spreadRadius) nn++; }
  nStart[N] = nn;
  const nIdx = new Int32Array(nn), nDist = new Float32Array(nn), nUx = new Float32Array(nn), nUz = new Float32Array(nn);
  { let o = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (j === i) continue;
      const dx = cx[j] - cx[i], dz = cz[j] - cz[i], d = Math.hypot(dx, dz);
      if (d >= T.spreadRadius) continue;
      nIdx[o] = j; nDist[o] = d; nUx[o] = dx / d; nUz[o] = dz / d; o++;
    } }

  const state = new Uint8Array(N), heat = new Float32Array(N), structure = new Float32Array(N).fill(1), char = new Float32Array(N);
  const smoke = new Float32Array(N), wet = new Float32Array(N), ign = new Float32Array(N);
  const stT = new Float32Array(N), ever = new Uint8Array(N), hold = new Uint8Array(N);
  const frozenT = new Float32Array(N), fanT = new Float32Array(N), fanDX = new Float32Array(N), fanDZ = new Float32Array(N), drawT = new Float32Array(N);
  const pCool = new Float32Array(N), pRain = new Float32Array(N), pHeat = new Float32Array(N), pWet = new Float32Array(N);
  const lastBurst = new Uint32Array(N);
  const act = new Int16Array(N); // buildings that are alight, smouldering, ruined-and-warm or smoking (rebuilt each update)
  const EVN = 64;
  const evKind = new Uint8Array(EVN), evId = new Int16Array(EVN), evT = new Float32Array(EVN);

  const self = {
    N, ids, plots: list, time: 0, nAct: 0, act,
    state, heat, structure, char, smoke, wet, frozenT,
    /** Counts, updated in place each update: burning (IGNITE+BURN), smouldering, saved (ignited then put out), lost (DEAD), threatened (ever ignited). */
    counts: { burning: 0, smouldering: 0, saved: 0, lost: 0, threatened: 0, total: N, out: 0 },
    /** True while building `id` (plot id) is catching or burning (the quest's question). */
    isBurning(id) { const i = index.get(id); return i !== undefined && (state[i] === S.IGNITE || state[i] === S.BURN); },
    /** Events since clearEvents(): evCount entries of (evKind EV.*, evId building index, evT time). */
    evCount: 0, evKind, evId, evT,
    clearEvents() { this.evCount = 0; },
    indexOf(id) { const i = index.get(id); return i === undefined ? -1 : i; },
    x(i) { return cx[i]; }, z(i) { return cz[i]; }, baseY(i) { return base[i]; }, radius(i) { return rad[i]; },

    /** Start a fire (the quest, the dev hook, a spark). Returns false if dead / already alight. */
    ignite(id, t) {
      const i = typeof id === 'number' ? id : index.get(id);
      if (i === undefined || i < 0 || state[i] === S.DEAD || state[i] === S.IGNITE || state[i] === S.BURN) return false;
      if (state[i] === S.SMOULDER) { state[i] = S.BURN; heat[i] = Math.max(heat[i], 0.3); hold[i] = 0; }
      else { state[i] = S.IGNITE; heat[i] = Math.max(heat[i], 0.08); stT[i] = 0; }
      ign[i] = 0; ever[i] = 1;
      push(EV.IGNITED, i, t === undefined ? self.time : t);
      return true;
    },

    // ---- Extinguish and wind inputs: call any number of times before update(); consumed by it. ----
    /** Water (Ribbon / Sweep): `amount` heat removed at once from every building whose footprint is within r of (x, z). */
    douse(x, z, r, amount) {
      for (let i = 0; i < N; i++) { const dx = x - cx[i], dz = z - cz[i], rr = rad[i] + r; if (dx * dx + dz * dz <= rr * rr) { pCool[i] += amount; pWet[i] += amount * 0.5; hold[i] = 0; } }
    },
    /** Douse one building by index (the Ribbon's stream, systems/villageFire.js). */
    douseAt(i, amount) { pCool[i] += amount; pWet[i] += amount * 0.5; hold[i] = 0; },
    /** The burning (or smouldering) building whose footprint (+ margin m) holds (x, z), or -1. */
    nearestBurning(x, z, margin) {
      let b = -1, bd = 1e9;
      for (let i = 0; i < N; i++) {
        const st = state[i]; if (st !== S.IGNITE && st !== S.BURN && st !== S.SMOULDER) continue;
        const dx = x - cx[i], dz = z - cz[i], d2 = dx * dx + dz * dz, rr = rad[i] + margin;
        if (d2 <= rr * rr && d2 < bd) { bd = d2; b = i; }
      }
      return b;
    },
    /** A one-off burst (Sweep): douse, but each building takes it only once per cast `castId`. */
    douseBurst(x, z, r, amount, castId) {
      for (let i = 0; i < N; i++) {
        if (lastBurst[i] === castId) continue;
        const dx = x - cx[i], dz = z - cz[i], rr = rad[i] + r;
        if (dx * dx + dz * dz <= rr * rr) { lastBurst[i] = castId; pCool[i] += amount; pWet[i] += amount * 0.5; hold[i] = 0; }
      }
    },
    /** Rain over a roof (Ribbon through an Updraft): `rate` heat per second on every building within r of (x, z); soaks the walls. */
    rain(x, z, r, rate) {
      for (let i = 0; i < N; i++) { const dx = x - cx[i], dz = z - cz[i], rr = rad[i] + r; if (dx * dx + dz * dz <= rr * rr && rate > pRain[i]) { pRain[i] = rate; hold[i] = 0; } }
    },
    /** Crystallize: heat stops growing, spreading and burning the structure for `seconds` (the fire sinks to embers). */
    freeze(x, z, r, seconds) {
      for (let i = 0; i < N; i++) { const dx = x - cx[i], dz = z - cz[i], rr = rad[i] + r; if (dx * dx + dz * dz <= rr * rr && seconds > frozenT[i]) { frozenT[i] = seconds; if (state[i] === S.BURN || state[i] === S.IGNITE) hold[i] = 1; } }
    },
    /** Gust: raises heat of burning buildings in reach by `amount` (instant) and makes them spread along (dirX, dirZ) for a few seconds. */
    fan(x, z, dirX, dirZ, amount, r = 3) {
      for (let i = 0; i < N; i++) {
        if (state[i] === S.OUT || state[i] === S.DEAD) continue;
        const dx = x - cx[i], dz = z - cz[i], rr = rad[i] + r;
        if (dx * dx + dz * dz <= rr * rr) { pHeat[i] += amount; fanT[i] = T.fanBoost; fanDX[i] = dirX; fanDZ[i] = dirZ; }
      }
    },
    /** Vortex / Updraft: pulls heat and smoke up and away near (x, z): faster decay (never below drawFloor), no spreading. Refresh each frame. */
    draw(x, z, r) {
      for (let i = 0; i < N; i++) { const dx = x - cx[i], dz = z - cz[i], rr = rad[i] + r; if (dx * dx + dz * dz <= rr * rr) drawT[i] = 0.3; }
    },

    // ---- Step ----
    /** `wind`: { x, z, strength 0..1 }; `verbs`: optional (vf, dt) callback that applies this frame's inputs first. */
    update(dt, wind, verbs) {
      if (verbs) verbs(self, dt);
      self.time += dt;
      let wx = 0, wz = 0, ws = 0;
      if (wind) { const l = Math.hypot(wind.x, wind.z); if (l > 1e-6) { wx = wind.x / l; wz = wind.z / l; ws = clamp01(wind.strength); } }
      const tk = Math.exp(-dt * 0.13), tcool = Math.exp(-dt * 0.5);
      // 1. Per-building heat, structure, char.
      for (let i = 0; i < N; i++) {
        const st = state[i];
        let w = wet[i] + pWet[i] * 0.4 + (pRain[i] > 0 ? T.rainWet * dt : 0);
        w -= dt * (0.012 + 0.03 * heat[i]);
        wet[i] = w < 0 ? 0 : w > 1 ? 1 : w;
        const cool = pCool[i] + pRain[i] * dt, add = pHeat[i];
        pCool[i] = 0; pRain[i] = 0; pHeat[i] = 0; pWet[i] = 0;
        const frozen = frozenT[i] > 0;
        if (frozen) frozenT[i] = Math.max(0, frozenT[i] - dt);
        if (fanT[i] > 0) fanT[i] -= dt;
        const drawn = drawT[i] > 0;
        if (drawn) drawT[i] -= dt;
        let h = heat[i];
        if (ign[i] > 0) ign[i] = Math.max(0, ign[i] - 0.03 * dt);

        if (st === S.IGNITE || st === S.BURN) {
          if (st === S.IGNITE) {
            stT[i] += dt;
            if (!frozen) h += 0.07 * dt * (1 - 0.7 * wet[i]);
            if (stT[i] >= T.igniteTime && h >= 0.27) state[i] = S.BURN;
          } else {
            let target = structure[i] > 0.25 ? 1 : 0.3 + structure[i] * 2.8;
            target *= 1 - 0.6 * wet[i];
            if (frozen) target = 0.05;
            h += (target - h) * (1 - (target > h ? tk : tcool));
            if (!frozen) structure[i] -= h * dt / burnTime[i];
          }
          h += add - cool;
          if (drawn && h > T.drawFloor) h = Math.max(T.drawFloor, h - T.drawRate * dt);
          h = h < 0 ? 0 : h > 1 ? 1 : h;
          const cap = 0.45 + 0.55 * (1 - structure[i]);
          if (char[i] < cap) char[i] = Math.min(cap, char[i] + h * dt / 100);
          if (structure[i] <= 0.03) { structure[i] = 0; state[i] = S.DEAD; char[i] = Math.max(char[i], 0.85); push(EV.COLLAPSED, i, self.time); }
          else if (h <= 0.01 && state[i] === S.IGNITE) { state[i] = S.OUT; h = 0; push(EV.OUT, i, self.time); }
          else if (h < 0.12 && state[i] === S.BURN) { state[i] = S.SMOULDER; stT[i] = 0; if (frozen) hold[i] = 1; }
        } else if (st === S.SMOULDER) {
          if (h > 0.07) h = Math.max(0.07, h - 0.1 * dt);
          h += add - cool;
          if (!frozen) stT[i] += dt;
          h = h < 0 ? 0 : h > 1 ? 1 : h;
          if (h > 0.4) { state[i] = S.BURN; hold[i] = 0; }
          else if (h <= 0.01 && (cool > 0 || stT[i] >= T.smoulderTime)) { state[i] = S.OUT; h = 0; hold[i] = 0; push(EV.OUT, i, self.time); }
          else if (!frozen && hold[i] === 1) { state[i] = S.BURN; h = Math.max(h, 0.3); hold[i] = 0; } // the ice has melted: it was only sleeping
          else if (stT[i] >= T.smoulderTime && hold[i] === 0) { state[i] = S.OUT; h = 0; push(EV.OUT, i, self.time); }
        } else if (st === S.DEAD) {
          h = Math.max(0, h - dt / T.deadCool - cool);
          if (char[i] < 1) char[i] = Math.min(1, char[i] + dt * 0.04);
        } else h = 0;
        heat[i] = h;
        // Smoke eases toward what the fire makes (drawn off by a vortex).
        const s2 = state[i];
        let ts = s2 === S.IGNITE || s2 === S.BURN ? 0.35 + 0.65 * h : s2 === S.SMOULDER || s2 === S.DEAD ? Math.min(0.5, 0.08 + h * 2.5) * (h > 0.015 ? 1 : 0) : 0;
        if (drawn) ts *= 0.45;
        smoke[i] += (ts - smoke[i]) * (1 - Math.exp(-dt * (ts > smoke[i] ? 0.5 : 0.9)));
      }
      // 2. Spread (ember charge on neighbours), downwind favoured.
      for (let i = 0; i < N; i++) {
        if (state[i] !== S.BURN || heat[i] < 0.35 || frozenT[i] > 0 || drawT[i] > 0) continue;
        let ex = wx * ws, ez = wz * ws;
        if (fanT[i] > 0) { ex += fanDX[i]; ez += fanDZ[i]; }
        const mag = Math.hypot(ex, ez), sw = mag > 1 ? 1 : mag, ux = mag > 1e-6 ? ex / mag : 0, uz = mag > 1e-6 ? ez / mag : 0;
        const hh = heat[i] * Math.sqrt(heat[i]);
        for (let o = nStart[i]; o < nStart[i + 1]; o++) {
          const j = nIdx[o], sj = state[j];
          if ((sj !== S.OUT && sj !== S.SMOULDER) || frozenT[j] > 0 || structure[j] < 0.2) continue;
          const dot = ux * nUx[o] + uz * nUz[o], dn = dot > 0 ? dot : 0;
          const q = nDist[o] / (1 + 0.5 * sw * dn) / T.spreadRadius, fall = 1 - q * q;
          if (fall <= 0) continue;
          const wf = (1 - sw) + sw * (0.4 + 1.2 * dn);
          ign[j] += T.spreadRate * hh * fall * wf * (1 - 0.9 * wet[j]) * dt;
          if (ign[j] >= thr[j]) self.ignite(j, self.time);
        }
      }
      // 3. Tallies and the active list.
      const c = self.counts;
      c.burning = 0; c.smouldering = 0; c.saved = 0; c.lost = 0; c.threatened = 0;
      let na = 0;
      for (let i = 0; i < N; i++) {
        const s2 = state[i];
        if (ever[i]) c.threatened++;
        if (s2 === S.IGNITE || s2 === S.BURN) c.burning++;
        else if (s2 === S.SMOULDER) c.smouldering++;
        else if (s2 === S.DEAD) c.lost++;
        else if (ever[i]) c.saved++;
        if (s2 !== S.OUT || smoke[i] > 0.02) act[na++] = i;
      }
      self.nAct = na;
      c.out = c.threatened - c.burning; // lit at some point and no longer burning (smouldering, saved or lost)
    },

    /** Everything restored: structure whole, char gone (the Bellwether's release). */
    restoreAll() {
      state.fill(0); heat.fill(0); structure.fill(1); char.fill(0); smoke.fill(0); wet.fill(0); ign.fill(0); stT.fill(0); ever.fill(0); hold.fill(0);
      frozenT.fill(0); fanT.fill(0); drawT.fill(0); pCool.fill(0); pRain.fill(0); pHeat.fill(0); pWet.fill(0); lastBurst.fill(0);
      self.nAct = 0; self.evCount = 0;
      const c = self.counts; c.burning = c.smouldering = c.saved = c.lost = c.threatened = 0;
    },

    // ---- Queries ----
    /** Heat 0..1 felt at a point (within ~3.5 m of a burning wall; fades above the roofline). */
    heatAt(x, y, z) {
      let best = 0;
      for (let a = 0; a < self.nAct; a++) {
        const i = act[a], h = heat[i];
        if (h <= best) continue;
        const dx = x - cx[i], dz = z - cz[i], d = Math.sqrt(dx * dx + dz * dz) - rad[i];
        if (d >= 3.5) continue;
        let f = d <= 0 ? 1 : 1 - d / 3.5;
        const dy = y - base[i];
        if (dy > 8) f *= Math.max(0, 1 - (dy - 8) / 6);
        const v = h * f;
        if (v > best) best = v;
      }
      return best;
    },
    /** Smoke 0..1 at ground level near (x, z) (interior fog, focus drain). */
    smokeAt(x, z) {
      let s = 0;
      for (let a = 0; a < self.nAct; a++) {
        const i = act[a], dx = x - cx[i], dz = z - cz[i], r = rad[i] + 9;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        const f = 1 - Math.sqrt(d2) / r;
        s += smoke[i] * f * f;
      }
      return s > 1 ? 1 : s;
    },
    /** Index of the IGNITE/BURN building (heat >= minHeat) whose interior rectangle holds (x, z), or -1. */
    insideAt(x, z, minHeat = 0.5) {
      for (let a = 0; a < self.nAct; a++) {
        const i = act[a];
        if ((state[i] !== S.BURN && state[i] !== S.IGNITE) || heat[i] < minHeat) continue;
        const dx = x - cx[i], dz = z - cz[i];
        const u = dx * cs[i] - dz * sn[i], f = dx * sn[i] + dz * cs[i];
        if (Math.abs(u) < hu[i] && Math.abs(f) < hd[i]) return i;
      }
      return -1;
    },
    /** Where to eject someone from building i: outside its door. Writes out[0] = x, out[1] = z. */
    doorPoint(i, out) { const d = hd[i] + 2.6; out[0] = cx[i] + sn[i] * d; out[1] = cz[i] + cs[i] * d; return out; },
    /** Flame emitters on a burning building: 1..3 by heat (roof, door, window). */
    emitterCount(i) {
      const st = state[i]; if (st !== S.IGNITE && st !== S.BURN) return 0;
      const h = heat[i]; return st === S.IGNITE || h < 0.45 ? 1 : h < 0.75 ? 2 : 3;
    },
    /** Emitter k of building i: out[0..2] = world x, height above the seat, world z; returns flame size (the fire slot's w). */
    /** The building's real roof (its kit's meta: ridgeOf in world/villageKits.js) in place of the kind's guess. */
    setRidge(i, ridgeY, alongA, half, c) { roof[i] = ridgeY; ridgeA[i] = alongA ? 1 : 0; ridgeH[i] = half; ridgeC[i] = c; },
    emitter(i, k, out) {
      const h = heat[i], roofY = roof[i] * (0.55 + 0.45 * structure[i]);
      let u = 0, f = ridgeC[i], y = roofY + 0.1;   // the ridge: on it, not inside the roof (bot playtest 2026-10-24: the flames were buried)
      if (k === 1) { f = hd[i] * 0.95; y = 1.3; } else if (k === 2) { u = hu[i] * 0.95; f = hd[i] * 0.1; y = 1.7; } // k 0: the ridge centre
      out[0] = cx[i] + u * cs[i] + f * sn[i]; out[1] = y; out[2] = cz[i] - u * sn[i] + f * cs[i];
      return (0.8 + h * 3.4) * kscale[i] * (k === 0 ? 1 : 0.7) * (0.7 + 0.3 * structure[i]); // a burning house: flames taller than a man over the roof
    },
    /** The line the emitter's flames are spread along (shaders/fire.wgsl.js fireL): out[0..1] = unit direction (x, z), out[2] = half length (m),
     *  out[3] = mode * 10 + flicker phase (0..1). Mode 0: the roof ridge, along the plot's width. Mode 1: an opening (door at the front, window in the side wall)
     *  whose flames burst out along (-dir.z, dir.x) and climb the wall. */
    emitterSegment(i, k, out) {
      const h = heat[i], ph = hash01(i * 31 + k * 7 + 5);
      if (k === 1) { out[0] = cs[i]; out[1] = -sn[i]; out[2] = Math.min(0.9, hu[i] * 0.3); out[3] = 10 + ph; }
      else if (k === 2) { out[0] = -sn[i]; out[1] = -cs[i]; out[2] = 0.5; out[3] = 10 + ph; }
      else if (ridgeA[i]) { out[0] = cs[i]; out[1] = -sn[i]; out[2] = Math.min(6, (ridgeH[i] || hu[i]) * (0.5 + 0.4 * h)); out[3] = ph; }
      else { out[0] = sn[i]; out[1] = cs[i]; out[2] = Math.min(6, ridgeH[i] * (0.5 + 0.4 * h)); out[3] = ph; }   // a front-gabled roof: the ridge runs front to back
      return out;
    },
    /** A smoke-only plume position for smouldering / ruined buildings (same out convention). */
    smokePoint(i, out) { out[0] = cx[i]; out[1] = roof[i] * 0.5 * (0.5 + 0.5 * structure[i]); out[2] = cz[i]; return 0.8 + smoke[i] * 1.2; },
    /** Save: per building 5 numbers (state, heat, structure, char, wet). */
    serialize() { const o = []; for (let i = 0; i < N; i++) o.push(state[i], heat[i], structure[i], char[i], wet[i]); return o; },
    load(a) { for (let i = 0; i < N; i++) { state[i] = a[i * 5]; heat[i] = a[i * 5 + 1]; structure[i] = a[i * 5 + 2]; char[i] = a[i * 5 + 3]; wet[i] = a[i * 5 + 4]; ever[i] = state[i] === S.OUT && char[i] === 0 ? 0 : 1; } },
  };

  function push(kind, i, t) {
    if (self.evCount >= EVN) return;
    evKind[self.evCount] = kind; evId[self.evCount] = i; evT[self.evCount] = t; self.evCount++;
  }
  return self;
}

/** Heat damage to the Wraith for dt seconds: scaled by heat, never taking health below 25 % of max. Returns the damage to apply. */
export function heatDamage(heat, dt, health, maxHealth, dps = fireTuning.damagePerSec) {
  if (heat < fireTuning.damageHeat) return 0;
  const room = health - maxHealth * fireTuning.damageFloor;
  if (room <= 0) return 0;
  return Math.min(room, dps * heat * dt);
}
