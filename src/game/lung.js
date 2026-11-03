// The Lung (Phase 10 U2; docs/phase-10/u2-design.md, storylines.md "The Lung"): deep water is the stillest place left and puts
// out whatever moves. The Wraith's air is the motion held in its robe; the Lung, Morrow's Shaper device, holds more of it against
// its chest. Pure state, stepped by systems/lung.js; no HUD: the air is the cowl light, the bubbles and the robe's life.
//
// Stages: 'none' (no Lung), 'fitted', 'torn' (it caught on the kelp), 'woke' (put out after the tear: woken on the ledge), 'whirl'
// (in the column, being taken), 'through' (the cut is done: in the undercroft; the Lung is finished).

/** Seconds of air under the water: the body alone, the Lung full, after the tear (from full), the thread on the ledge. */
export const AIR = { body: 14, lung: 160, torn: 14, thread: 30 };
/** Below this share of the air the robe hangs and the body sinks. */
export const SAG_AT = 0.34;
/** The column: refilled in this long (s); the pull wins after this long in it (s), or at the vent. */
export const WHIRL = { refill: 2, win: 12, ventClear: 4 };

export function createLung() {
  return {
    stage: 'none', air: 1, back: '',
    /** Seconds since the tear, in the column, since put out (for the effects). */
    tornT: 0, whirlT: 0, outT: -1,
    /** Outputs per step: cowl light, robe life, chest bubbles per second (and whether the stream is the tear's), the drift
     *  with no stroke (m/s), the up stroke's strength, the whirlpool's spin (0..1). */
    light: 1, life: 1, bubbles: 0, stream: false, rise: 0.25, stroke: 1, spin: 0,
  };
}

/** Seconds of air this stage holds when full. */
export function capacity(L) {
  if (L.stage === 'none' || L.stage === 'through') return AIR.body;
  if (L.stage === 'torn') return AIR.torn;
  if (L.stage === 'woke') return AIR.thread;
  return AIR.lung;
}

/** Fit the Lung (Morrow at the jetty; for now her pile of brass). */
export function fit(L) { if (L.stage === 'none') { L.stage = 'fitted'; L.air = 1; } }

/** The kelp caught it. */
export function tear(L) { if (L.stage !== 'fitted') return false; L.stage = 'torn'; L.tornT = 0; return true; }

/** Put out (the air gone): returns where to wake — 'ledge' (after the tear: lower, among the kelp roots) or 'surface'. */
export function putOut(L) {
  L.outT = 0;
  if (L.stage === 'torn' || L.stage === 'woke' || L.stage === 'whirl') { L.stage = 'woke'; L.air = 1; L.whirlT = 0; return 'ledge'; }
  L.air = 1; return 'surface';
}

/**
 * One step.
 * @param {ReturnType<typeof createLung>} L
 * @param {number} dt
 * @param {{ under: boolean, inColumn: boolean, speed: number, atVent?: boolean }} s  submerged; inside the column; body speed (m/s);
 *   at the column's vent
 * @returns {'' | 'out' | 'refill' | 'taken'} an event this step
 */
export function stepLung(L, dt, s) {
  let ev = '';
  if (L.stage === 'torn') L.tornT += dt;
  if (L.outT >= 0) L.outT += dt;
  // The column: once the Lung is torn it is the city's breath — it fills the Lung, then takes the body.
  if (s.inColumn && (L.stage === 'torn' || L.stage === 'woke' || L.stage === 'whirl' || L.stage === 'through')) {
    if (L.stage !== 'whirl') { L.back = L.stage === 'through' ? 'through' : 'woke'; L.stage = 'whirl'; L.whirlT = 0; ev = 'refill'; }
    L.whirlT += dt;
    L.air = Math.min(1, L.air + dt / WHIRL.refill);
    if (L.whirlT >= WHIRL.win) ev = 'taken';
    else if (s.atVent && L.whirlT > WHIRL.refill + 4) ev = 'taken';   // drawn down to the vent: it has won
  } else if (L.stage === 'whirl') {
    // Out of it (the pull holds the body in, but should it happen): the air runs as before (a thread's, or the body's own).
    L.stage = L.back || 'woke';
  }
  if (L.stage !== 'whirl') {
    if (s.under) {
      // Effort burns a little more: a fast stroke uses air (the light gutters as it works).
      const burn = 1 + 0.25 * Math.min(1, s.speed / 2.6);
      L.air = Math.max(0, L.air - dt * burn / capacity(L));
      if (L.air <= 0 && ev === '') ev = 'out';
    } else L.air = Math.min(1, L.air + dt / 1.5);   // a breath at the surface
  }
  // On the body. Light: the air, with a floor while there's any (it shrinks, then goes); a gutter as it runs out.
  const a = L.air;
  L.light = a <= 0 ? 0 : 0.12 + 0.88 * Math.sqrt(a);
  const sag = a < SAG_AT ? 1 - a / SAG_AT : 0;
  L.life = s.under ? 1 - sag : 1;
  // The drift: the body's buoyancy, which becomes a sink as the air goes; the up stroke weakens with it.
  L.rise = s.under ? 0.25 - 1.05 * sag : 0.25;
  L.stroke = 1 - 0.75 * sag;
  // Bubbles from the chest: with the Lung, a breath out every few seconds (fewer as it empties); torn, a stream.
  L.stream = L.stage === 'torn' && s.under;
  L.bubbles = !s.under ? 0 : L.stream ? 40 * Math.max(0.15, a) : L.stage === 'fitted' || L.stage === 'woke' ? 2.2 * a : 0.4 * a;
  L.spin = L.stage === 'whirl' ? Math.min(1, Math.max(0, (L.whirlT - WHIRL.refill * 0.6) / (WHIRL.win - WHIRL.refill))) : 0;
  return ev;
}

/** The whirlpool's flow at a point (m/s): round the axis, in towards it, and down; spin 0..1. Writes out[0..2]. */
export function whirlFlow(dx, dz, spin, out) {
  const r = Math.max(0.3, Math.hypot(dx, dz));
  const tx = -dz / r, tz = dx / r;
  const round = 0.6 + 3.4 * spin, inward = 0.4 + 1.2 * spin * Math.min(1, r / 2);
  out[0] = tx * round - dx / r * inward;
  out[2] = tz * round - dz / r * inward;
  // (Strong from the start: a stroke up, weakened in the turn, barely holds against it; it wins as it spins up.)
  out[1] = -(1.2 + 3.4 * spin);
  return out;
}

/** Saved flags (chapter flags): the stage as it should load. Through the column, the Lung is gone. */
export function lungFromFlags(flags) {
  if (flags.has('ebb:through')) return 'through';
  if (flags.has('ebb:torn')) return 'woke';
  if (flags.has('ebb:lung')) return 'fitted';
  return 'none';
}
