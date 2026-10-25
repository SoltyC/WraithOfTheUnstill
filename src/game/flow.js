// Flow (docs/gameplay-design.md §3): one diegetic momentum value, 0..3, built by unbroken, skilful
// motion and spent by bending well. Pure logic over plain numbers (testable in Node, allocation-
// free): the owner (systems/flow.js) sets the input fields once a frame and calls update(); combat
// and, later, the weapons feed it through hit(kind). Nothing here knows about rendering or sound:
// the tier, the eased `show` level and the one-frame events (tierEvent, chainEvent) are what the
// body, the wake, the streaks and the music read.
//
// Built by: surf speed above cruise, carving near the grip limit, glide speed; chains between
// traversal modes within a second (surf→glide, glide→surf, an updraft catch, a crest jump);
// landed reactions, near misses and (later) weapon hits. Passive building fades out toward
// `softCap`: the last tier needs chains and reactions, and bleeds away without them.
// Lost by: standing (about 2 s from full), walking, a blow (−1 tier), a hard fall.

/** Event kinds for hit(). Gains are flowTuning.events[kind]. */
export const FLOW_EVENT = { WEAPON_LIGHT: 0, WEAPON_HEAVY: 1, SHATTER: 2, STRIP: 3, REACTION: 4, NEAR_MISS: 5, UPDRAFT: 6 };
/** Traversal modes the chain detector watches. */
/** Slots of flow.inp for the numeric inputs. */
export const FLOW_IN = { DT: 16, SPEED: 17, SURF_SPEED: 18, GRIP: 19, GLIDE_SPEED: 20, VY: 21, LIFT: 22 };
export const FLOW_MODE = { NONE: 0, SURF: 1, GLIDE: 2 };

export const flowTuning = {
  max: 3,
  // Building, per second.
  surfBase: 0.16, surfMin: 11,          // surfing at least this fast
  surfFast: 0.42, surfFrom: 14, surfTo: 22,   // extra, scaled between these speeds (m/s)
  carve: 0.4, carveFrom: 0.55, carveMinSpeed: 9,   // at the grip limit; from this share of it
  glide: 0.34, glideMin: 9, glideTo: 15,    // gliding at least this fast (scaled to glideTo)
  softCap: 2.1, softBand: 0.6,          // passive building fades out over the last band below this
  overDrain: 0.2,                       // per second in motion above softCap with nothing feeding it
  // Chains: a mode entered within chainWindow s of leaving another (held at least chainMinTime).
  chainWindow: 1, chainMinTime: 0.5, chainGain: 0.45, chainStep: 0.12, chainStepMax: 0.3, chainReset: 4,
  crestAir: 0.35,                       // s airborne on a surf that lands back on it: a crest jump
  // Events: flow gained by FLOW_EVENT kind (diminishing when they stack: ÷(1 + recent)).
  events: [0.3, 0.55, 0.6, 0.45, 0.45, 0.5, 0.45],
  eventFade: 2.5,                       // per second: how fast stacked events are forgotten
  nearMissCool: 0.5,                    // s between near misses counted
  // Losing.
  idleSpeed: 1.6, idleGrace: 0.3, idleDrain: 1.5,   // standing: 3 → 0 in 2 s
  eventHold: 1.6,                       // s after a feeding event in which walking does not drain (a fight is not standing)
  walkDrain: 0.35,                      // per second moving in no traversal mode (after the chain window)
  hurtLoss: 1, hurtLock: 0.6,           // a blow: −1 tier, and nothing builds for a moment
  hardFall: 17, hardLoss: 1,            // m/s downward at touchdown (about 6 m of fall)
  // What it gives.
  focusPerFlow: 0.5,                    // focus regen × (1 + this × flow)
  tier2Cost: 0.7, tier2Power: 1.25,     // verbs at tier 2+: cost × this, range/size/damage × this
  easeUp: 3, easeDown: 2, hyst: 0.12,   // display ease (1/s); tier falls only this far below its line
};

export function createFlow() {
  const T = flowTuning;
  /** Seconds spent at each tier and counts since the last reset (telemetry, docs §9). */
  const timeAt = new Float64Array(4), counts = new Float64Array(12);   // counts: [0..7] events by kind, 8 chains, 9 blows, 10 falls
  // Internal state in an object's fields (a closure `let` holding a double allocates on every write).
  // value, show, pending value, focus ×, cost ×, power ×: typed array slots (no boxing on write).
  const d = new Float64Array([0, 0, 0, 1, 1, 1, /* modeTime */ 0, /* prevModeTime */ 0, /* gap */ 99, /* airT */ 0, /* idleT */ 0, /* lock */ 0, /* recent */ 0, /* nearCool */ 0, /* chainAge */ 99, /* minVy */ 0, /* inputs: dt, speed, surfSpeed, grip, glideSpeed, vy, lift */ 0, 0, 0, 0, 0, 0, 0, /* event hold */ 0]);
  const st = { mode: 0, prevMode: 0, streak: 0, wasGrounded: true };
  const self = {
    timeAt, counts,
    /** The value, 0..3. */
    /** Tier 0..3 (hysteresis), the eased value for the body (0..3), and whether the flowing verbs are on. */
    tier: 0, flowing: false,
    /** What it gives (read by combat and the verbs). */
    get value() { return d[0]; }, get show() { return d[1]; }, get focusMul() { return d[3]; }, get costMul() { return d[4]; }, get power() { return d[5]; },
    /** One-frame events: +1 / −1 a tier gained / lost, 1 a chain landed, 1 a blow taken. */
    tierEvent: 0, chainEvent: 0, hurtEvent: 0,
    /** Chains in the current streak (resets after a quiet spell). */
    get streak() { return st.streak; },
    get mode() { return st.mode; },
    // Inputs (fields, set by the owner each frame).
    surfOn: false, glideOn: false, grounded: true, swimming: false,
    /** The numeric inputs (FLOW_IN slots): a typed array, since a plain double field is boxed on every write. */
    inp: d,
    /** Paused (dead, scripted, in conversation, climbing): nothing builds or drains. */
    paused: false,

    update() {
      const dt = d[16];
      this.tierEvent = 0; this.chainEvent = 0; this.hurtEvent = 0;
      if (!(dt > 0) || this.paused) return;
      d[11] = Math.max(0, d[11] - dt); d[13] = Math.max(0, d[13] - dt);
      d[12] = Math.max(0, d[12] - T.eventFade * dt); d[23] = Math.max(0, d[23] - dt);
      d[14] += dt;
      if (d[14] > T.chainReset) st.streak = 0;
      // The traversal mode: the glide outranks the surf it grew out of (the surf stays "on" in the air).
      const m = this.glideOn ? 2 : this.surfOn ? 1 : 0;
      if (m !== st.mode) enter(this, m); else d[6] += dt;
      if (m === 0) d[8] += dt; else d[8] = 0;
      // Crest jumps and falls: airborne time on a surf; the hardest downward speed before a landing.
      if (!this.grounded && !this.swimming) {
        d[9] = (d[9] + dt) * (m === 1 ? 1 : 0);   // airborne on the surf (a glide is not a crest jump)
        if (this.glideOn) d[15] = 0; else if (d[21] < d[15]) d[15] = d[21];
      }
      if (this.grounded && !st.wasGrounded) land(this);
      st.wasGrounded = this.grounded;
      if (this.grounded || this.swimming) { d[9] = 0; d[15] = 0; }
      // Passive building, and what drains.
      const v = d[0];
      let rate = 0;
      if (m === 1) {
        rate = T.surfBase * (d[18] >= T.surfMin ? 1 : 0) + T.surfFast * Math.min(1, Math.max(0, (d[18] - T.surfFrom) / (T.surfTo - T.surfFrom)));
        if (d[18] >= T.carveMinSpeed) rate += T.carve * Math.min(1, Math.max(0, (d[19] - T.carveFrom) / (1 - T.carveFrom)));
      } else if (m === 2) rate = T.glide * Math.min(1, Math.max(0, (d[20] - T.glideMin) / (T.glideTo - T.glideMin)));
      let next = v;
      if (m !== 0) {
        if (d[11] <= 0) next += rate * dt * Math.min(1, Math.max(0, (T.softCap - v) / T.softBand));
        if (v > T.softCap) next -= T.overDrain * dt;
        d[10] = 0;
      } else if (this.grounded && !this.swimming && d[17] < T.idleSpeed) {
        d[10] += dt;
        if (d[10] > T.idleGrace && d[23] <= 0) next -= T.idleDrain * dt;      // a fight is not standing: swinging on the spot holds it too
      } else {
        d[10] = 0;
        if (d[8] > T.chainWindow && d[23] <= 0) next -= T.walkDrain * dt;
      }
      d[2] = next; commit(this);
      timeAt[this.tier] += dt;
      d[1] += (d[0] - d[1]) * (1 - Math.exp(-dt * (T.easeDown + (T.easeUp - T.easeDown) * (d[0] > d[1] ? 1 : 0))));
    },

    /** A landed reaction, weapon hit or other feeding event (FLOW_EVENT kind). */
    hit(kind) {
      if (this.paused) return;
      const g = T.events[kind] / (1 + d[12]);
      d[12] += 1; d[23] = T.eventHold; counts[kind]++;
      d[2] = d[0] + g; commit(this);
    },
    /** A dodge went through an attack's hit window (once per nearMissCool). */
    nearMiss() { if (d[13] > 0) return; d[13] = T.nearMissCool; this.hit(FLOW_EVENT.NEAR_MISS); },
    /** A blow landed on the Wraith: −1 tier, and a moment where nothing builds. */
    hurt() {
      if (this.paused) return;
      d[11] = T.hurtLock; this.hurtEvent = 1; counts[9]++;
      d[2] = d[0] - T.hurtLoss; commit(this);
    },
    /** Set the value (dev overlay, bot, tests): tier and gives follow. */
    setValue(x) { d[2] = x; commit(this); d[1] = d[0]; },
    /** Zero it (death, a new game) and clear the telemetry when `stats`. */
    reset(stats) {
      d[0] = 0; this.tier = 0; d[1] = 0; this.flowing = false;
      d[3] = 1; d[4] = 1; d[5] = 1;
      st.mode = 0; d[6] = 0; st.prevMode = 0; d[7] = 0; d[8] = 99.5; d[9] = 0; d[10] = 0; d[11] = 0; d[12] = 0; st.streak = 0; d[14] = 99.5; d[15] = 0; d[23] = 0;
      if (stats) { timeAt.fill(0); counts.fill(0); }
    },
  };


  /** The mode changed to m: a chain if it follows another mode closely enough. */
  function enter(s, m) {
    if (st.mode !== 0) { st.prevMode = st.mode; d[7] = d[6]; }
    const from = st.prevMode !== 0 && (st.mode !== 0 || d[8] <= T.chainWindow) ? st.prevMode : 0;
    if (m !== 0) {
      if (from !== 0 && from !== m && d[7] >= T.chainMinTime) chain(s);
      else if (m === 2 && d[22] > 0) s.hit(FLOW_EVENT.UPDRAFT);   // caught an updraft
    }
    st.mode = m; d[6] = 0;
  }
  function chain(s) {
    const g = T.chainGain + Math.min(T.chainStepMax, T.chainStep * st.streak);
    st.streak++; d[14] = 0; counts[8]++;
    s.chainEvent = 1;
    d[2] = d[0] + g; commit(s);
  }
  /** Touchdown: a crest jump landed back on the surf is a chain; a hard fall costs a tier. */
  function land(s) {
    if (d[15] < -T.hardFall && !s.glideOn) {
      counts[10]++; d[2] = d[0] - T.hardLoss; commit(s); s.hurtEvent = 1; d[11] = T.hurtLock;
    } else if (s.surfOn && !s.glideOn && d[9] >= T.crestAir && d[18] >= T.surfMin) chain(s);
  }
  /** Store the pending value `nv` (a field: a double argument would box), clamped, and derive the tier (with hysteresis), the gives and the eased display. */
  function commit(s) {
    const v = Math.min(T.max, Math.max(0, d[2]));
    d[0] = v;
    let t = s.tier;
    while (t < T.max && v >= t + 1) t++;
    while (t > 0 && v < t - T.hyst) t--;
    if (t !== s.tier) { s.tierEvent = t > s.tier ? 1 : -1; s.tier = t; }
    s.flowing = t >= 3;
    d[3] = 1 + T.focusPerFlow * v;
    const hi = t >= 2 ? 1 : 0;
    d[4] = 1 + (T.tier2Cost - 1) * hi;
    d[5] = 1 + (T.tier2Power - 1) * hi;
  }
  return self;
}
