// The Bellwether fight, as a director over the manor-creature (docs/village/plan-manor-boss.md).
// In order:
//   VENTS  — "stilled air": it wakes and holds its breath. The three chimney vents are sealed with
//            turf. Gust/Vortex bursts strip it (owner calls windHit). While any vent is sealed its
//            gale is weak. When all three are bare, its neck rears (NECK_RISES).
//   CLIMB  — the Wraith climbs the neck and opens the three valves. It shakes now and then.
//   FRENZY — at 4 of 6 (vents + valves) it calls the meadow Shaped; the CLIMB rules carry on.
//   DONE   — the third valve opens: it exhales for the first time (RELEASED).
// Throughout, from waking: the gale. It breathes in (telegraph), then a wind wall sweeps the
// forecourt; only a solid between the Wraith and its mouth shelters it.
// Dying or leaving resets everything. Pure logic over injected parts (tested in Node).
//
// ctx: { bell, B, arena:{x,z,y}, vents:[{x,y,z}*3] (optional; default near the arena),
//        allowed():bool, sheltered(px,pz,mx,mz):bool, nearValve():int (-1 none),
//        spawn(name,x,z):slot (<0 none), alive(slot), kill(slot), summonNames:string[] }

export const BFIGHT = { IDLE: 0, VENTS: 1, CLIMB: 2, FRENZY: 3, DONE: 4 };
export const BEV = {
  WAKE: 1, VENT_HIT: 2, VENT_STRIPPED: 4, NECK_RISES: 8, INHALE: 16, GALE: 32, GALE_HIT: 64,
  VALVE: 128, SHAKE: 256, SUMMON: 512, RESET: 1024, RELEASED: 2048,
};
export const bellTuning = {
  wakeR: 40,            // m from the forecourt centre at which it wakes
  leashR: 140, leashT: 3, // m from the arena, and s beyond it, before the fight resets
  ventStrength: 3,      // power a vent's turf takes to strip
  ventCount: 3, valveCount: 3,
  galeEvery: 25, firstGale: 12, // s, start to start; s after waking
  inhaleTime: 3, galeTime: 2.5,
  galeArc: 50 * Math.PI / 180,   // sweep covers heading ± this
  wedge: 12 * Math.PI / 180,     // half-width of the wind wall
  galeR: 70,            // m reach of the gale from its mouth
  sealedPower: 0.5, fullPower: 1, // gale power while a vent is sealed / once they are all bare
  shove: 14, damage: 18, // per unit gale power (m/s impulse, health)
  shakeEvery: 9, shakeWarn: 1,    // s between shakes while the Wraith is on it; s of telegraph
  frenzyAt: 4,          // progress (of 6) that calls the Shaped
  summonMax: 6, summonR: 28, summonGap: 4, // cap, m from the centre, s before a lost one is replaced
  ventReach: 0,         // extra metres added to a burst's radius
};

export function createBellFight(ctx) {
  const { bell, B, arena, spawn, alive, kill } = ctx;
  const T = bellTuning;
  const names = ctx.summonNames && ctx.summonNames.length ? ctx.summonNames : ['grazer'];
  const vents = new Float64Array(3).fill(0);
  const vx = new Float64Array(3), vy = new Float64Array(3), vz = new Float64Array(3);
  for (let k = 0; k < 3; k++) {
    const v = ctx.vents && ctx.vents[k];
    vx[k] = v ? v.x : arena.x + (k - 1) * 14; vy[k] = v ? v.y : (arena.y || 0) + 30; vz[k] = v ? v.z : arena.z;
  }
  const slots = new Int16Array(16).fill(-1);
  let seed = 4177;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const TAU = Math.PI * 2;
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
  let _ev = 0;       // events set between updates (windHit, tryValve)
  let galeStage = 0; // 0 none, 1 inhale telegraph, 2 gale
  let galeT = 0, galePower = 1, hitThisGale = false, leashT = 0, nameI = 0;

  const self = {
    phase: BFIGHT.IDLE, t: 0, ev: 0,
    /** The Wraith (fields in). */
    px: 0, py: 0, pz: 0, dt: 0, climbing: false,
    /** Outputs. */
    vents, valvesOpen: 0, galeIn: T.firstGale, galeK: 0, galeActive: false, galeWarn: false, galePower: 1,
    shakeWarn: false, hint: '', releasedAt: -1,
    /** Gale hit this frame: direction × impulse (m/s), the impulse, and the damage. Zero otherwise. */
    shoveX: 0, shoveZ: 0, shove: 0, damage: 0,
    /** Shaped it has called, and the seconds until a replacement may come. */
    summoned: 0, frenzied: false, _summonT: 0, _shakeT: T.shakeEvery, _dead: false, _clock: 0,

    get active() { return this.phase !== BFIGHT.IDLE && this.phase !== BFIGHT.DONE; },
    get progress() { return this.strippedCount + this.valvesOpen; },
    get strippedCount() { let n = 0; for (let k = 0; k < 3; k++) if (vents[k] <= 0) n++; return n; },
    /** Shaped alive now. */
    get alive() { let n = 0; for (let k = 0; k < slots.length; k++) if (slots[k] >= 0 && alive(slots[k])) n++; return n; },
    ventPos(k, out) { out.x = vx[k]; out.y = vy[k]; out.z = vz[k]; return out; },

    /** A wind burst (Gust power 1, Vortex 1.5) at (x,y,z) of `radius`: each sealed vent in range loses
     *  power. Returns the vents hit. Only in the VENTS phase. */
    windHit(x, y, z, radius, power) {
      if (this.phase !== BFIGHT.VENTS) return 0;
      const R = radius + T.ventReach;
      let n = 0;
      for (let k = 0; k < 3; k++) {
        if (vents[k] <= 0) continue;
        const dx = x - vx[k], dy = y - vy[k], dz = z - vz[k];
        if (dx * dx + dy * dy + dz * dz > R * R) continue;
        vents[k] = Math.max(0, vents[k] - power);
        n++; _ev |= BEV.VENT_HIT;
        if (vents[k] <= 0) _ev |= BEV.VENT_STRIPPED;
      }
      if (this.strippedCount === 3) {
        this.phase = BFIGHT.CLIMB; this._shakeT = T.shakeEvery;
        bell.roar(); _ev |= BEV.NECK_RISES;
      }
      return n;
    },

    /** The Wraith pressed strike: open the valve she is next to. True if one opened. */
    tryValve() {
      if (this.phase !== BFIGHT.CLIMB && this.phase !== BFIGHT.FRENZY) return false;
      const k = ctx.nearValve();
      if (k < 0 || k >= 3 || bell.valves.open[k]) return false;
      bell.openValve(k);
      _ev |= BEV.VALVE;
      this.valvesOpen = countOpen();
      if (this.valvesOpen >= T.valveCount) release(this);
      return true;
    },
    /** The owner reports the Wraith died; the fight resets on the next update. */
    playerDead() { this._dead = true; },

    reset() {
      for (let k = 0; k < slots.length; k++) { if (slots[k] >= 0 && alive(slots[k])) kill(slots[k]); slots[k] = -1; }
      bell.reset();
      vents.fill(0);
      this.phase = BFIGHT.IDLE; this.t = 0; this.valvesOpen = 0; this.frenzied = false; this.summoned = 0;
      galeStage = 0; galeT = 0; this.galeIn = T.firstGale; this.galeK = 0; this.galeActive = false; this.galeWarn = false;
      this.shakeWarn = false; this._shakeT = T.shakeEvery; this._summonT = 0; leashT = 0; this._dead = false;
      this.hint = '';
      _ev |= BEV.RESET;
    },

    update() {
      const dt = this.dt;
      this.ev = _ev; _ev = 0;
      this.shoveX = 0; this.shoveZ = 0; this.shove = 0; this.damage = 0;
      this._clock += dt;
      if (this.phase === BFIGHT.DONE) return;
      const dx = this.px - arena.x, dz = this.pz - arena.z;
      const d2 = dx * dx + dz * dz;

      if (this.phase === BFIGHT.IDLE) {
        this._dead = false;
        if (d2 < T.wakeR * T.wakeR && ctx.allowed()) {
          this.phase = BFIGHT.VENTS; this.t = 0;
          vents.fill(T.ventStrength);
          this.galeIn = T.firstGale; galeStage = 0;
          bell.wake(); bell.inhale();
          this.ev |= BEV.WAKE;
          this.hint = 'Blow the turf off the chimneys with Gust.';
        }
        return;
      }

      // Reset: she died, or she left.
      if (this._dead) { this.reset(); this.ev |= _ev; _ev = 0; return; }
      if (d2 > T.leashR * T.leashR) { leashT += dt; if (leashT >= T.leashT) { this.reset(); this.ev |= _ev; _ev = 0; return; } } else leashT = 0;

      this.t += dt;
      this.valvesOpen = countOpen();
      if (this.valvesOpen >= T.valveCount && this.phase !== BFIGHT.VENTS) { release(this); this.ev |= _ev; _ev = 0; return; }

      // Frenzy: once, at 4 of 6.
      if (!this.frenzied && this.progress >= T.frenzyAt) {
        this.frenzied = true; this.phase = BFIGHT.FRENZY; this._summonT = 0;
        callShaped(this, T.summonMax);
      } else if (this.frenzied) {
        // Keep the count below the cap: replace the fallen, a few seconds apart.
        const n = this.alive;
        if (n < T.summonMax) { this._summonT += dt; if (this._summonT >= T.summonGap) { this._summonT = 0; callShaped(this, 1); } }
      }

      // Shaking, only while she is on its neck.
      this.shakeWarn = false;
      if ((this.phase === BFIGHT.CLIMB || this.phase === BFIGHT.FRENZY) && this.climbing) {
        this._shakeT -= dt;
        if (this._shakeT <= T.shakeWarn) this.shakeWarn = true;
        if (this._shakeT <= 0) { this._shakeT = T.shakeEvery; this.shakeWarn = false; bell.shake(); this.ev |= BEV.SHAKE; }
      }

      gale(this, dt);
      hintFor(this);
      this.ev |= _ev; _ev = 0;
    },
  };

  function countOpen() { let n = 0; const o = bell.valves.open; for (let k = 0; k < 3; k++) if (o[k]) n++; return n; }

  function release(F) {
    F.phase = BFIGHT.DONE; F.releasedAt = F._clock; F.valvesOpen = Math.max(F.valvesOpen, T.valveCount);
    for (let k = 0; k < slots.length; k++) { if (slots[k] >= 0 && alive(slots[k])) kill(slots[k]); slots[k] = -1; }
    galeStage = 0; F.galeActive = false; F.galeWarn = false; F.galeK = 0; F.shakeWarn = false;
    bell.release();
    _ev |= BEV.RELEASED;
    F.hint = 'It is breathing out. The wind is free.';
  }

  function callShaped(F, n) {
    let made = 0;
    for (let i = 0; i < n && F.alive < T.summonMax; i++) {
      const a = rnd() * TAU;
      const s = spawn(names[nameI++ % names.length], arena.x + Math.cos(a) * T.summonR, arena.z + Math.sin(a) * T.summonR);
      if (s < 0) continue;
      let put = false;
      for (let k = 0; k < slots.length; k++) if (slots[k] < 0 || !alive(slots[k])) { slots[k] = s; put = true; break; }
      if (put) { made++; F.summoned++; }
    }
    if (made) _ev |= BEV.SUMMON;
  }

  /** The gale: inhale (telegraph), then a wind wall sweeps the arc across the forecourt. */
  function gale(F, dt) {
    F.galeIn -= dt;
    if (galeStage === 0) {
      if (F.galeIn <= 0) {
        // It turns to face her; the sweep is centred on her heading from the mouth, ± arc.
        const c = Math.atan2(F.pz - bell.hz, F.px - bell.hx);
        bell.exhaleFrom = c - T.galeArc; bell.exhaleTo = c + T.galeArc;
        galeStage = 1; galeT = 0; F.galeIn = T.galeEvery; hitThisGale = false;
        F.galePower = F.strippedCount < 3 ? T.sealedPower : T.fullPower;
        bell.inhale(); F.ev |= BEV.INHALE;
      }
    } else if (galeStage === 1) {
      galeT += dt; F.galeWarn = true;
      if (galeT >= T.inhaleTime) {
        galeStage = 2; galeT = 0; F.galeWarn = false;
        bell.exhale(); F.ev |= BEV.GALE;
      }
    }
    if (galeStage === 2) {
      galeT += dt;
      F.galeActive = true;
      F.galeK = Math.min(1, galeT / T.galeTime);
      if (!hitThisGale && !F.climbing) {
        const mx = bell.hx, mz = bell.hz;
        const ddx = F.px - mx, ddz = F.pz - mz;
        const dist = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dist < T.galeR) {
          const sweep = bell.exhaleFrom + (bell.exhaleTo - bell.exhaleFrom) * F.galeK;
          if (Math.abs(angDiff(Math.atan2(ddz, ddx), sweep)) <= T.wedge && !ctx.sheltered(F.px, F.pz, mx, mz)) {
            hitThisGale = true;
            const inv = dist > 1e-6 ? 1 / dist : 0;
            F.shove = T.shove * F.galePower;
            F.shoveX = ddx * inv * F.shove; F.shoveZ = ddz * inv * F.shove;
            F.damage = T.damage * F.galePower;
            F.ev |= BEV.GALE_HIT;
          }
        }
      }
      if (galeT >= T.galeTime) {
        galeStage = 0; F.galeActive = false; F.galeK = 0;
        if (F.phase === BFIGHT.VENTS) bell.inhale(); // holds its breath again
      }
    } else { F.galeActive = false; F.galeK = 0; }
  }

  function hintFor(F) {
    if (F.galeWarn || F.galeActive) F.hint = 'Get behind a wall — it\'s going to breathe!';
    else if (F.phase === BFIGHT.VENTS) F.hint = 'Blow the turf off the chimneys with Gust.';
    else if (F.shakeWarn) F.hint = 'It is about to shake. Hold on!';
    else F.hint = ctx.nearValve() >= 0 ? 'Strike to open the valve.' : 'Climb its neck and open the valves.';
  }

  return self;
}
