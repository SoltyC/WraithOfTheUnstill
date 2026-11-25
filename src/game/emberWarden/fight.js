// The Ember Warden's fight (docs/phase-11/ember-warden.md): pure logic over the titan's two arms, tested in Node.
//   ONE   — woken by the eruption with the Wraith in the caldera: its right arm tears off the vent and hunts; the left
//           still holds the vent.
//   TWO   — the right bound: it strains, the lake surges up (the caldera shrinks), the left tears free; both hunt in turn.
//   HELD  — both bound: it hangs, panting (the calm). The Wraith climbs a bound arm to its heart.
//   DONE  — the fire given back: it lets go, and settles into the lake.
// An arm's blow: RAISE (the telegraph: up over where the Wraith stands, the fist going white-hot) → STRIKE (down onto it)
// → REST (on the rock where it landed, cooling: white, orange, dark red) → LIFT (back up) → RECOVER → the next RAISE.
// Frost on a resting fist binds it only in the dark beat (heat under DARK): two freezings there and it is shackled to the
// rock. Earlier, in the heat, the frost flashes to steam and the beat is lost. A death resets the whole fight (no
// checkpoints: user, 2026-11-25). Allocation-free per update; events in `events` (the owner clears them: clear()).

export const EWF = { IDLE: 0, ONE: 1, TWO: 2, HELD: 3, DONE: 4 };
export const ARM = { HOLD: 0, RAISE: 1, STRIKE: 2, REST: 3, LIFT: 4, RECOVER: 5, BOUND: 6, HOVER: 7 };
export const ewfTuning = {
  raise: 1.7,          // s: the telegraph (the fist up over its mark, heating to white)
  strike: 0.42,        // s: down onto it
  rest: 4.6,           // s: on the rock, cooling
  restAfterFreeze: 1.8, // s more once the first freezing has taken (time for the second)
  lift: 1.1,
  recover: [1.4, 3.2], // s between blows (one arm); in TWO the arms alternate
  dark: 0.36,          // heat under which Frost takes
  freezes: 2,          // freezings to bind
  hitR: 10,            // m from the fist's landing within which the blow catches the Wraith
  raiseH: 30,          // m over its mark the fist rises
  lead: 0.35,          // s of the Wraith's motion the aim leads by
  hoverH: 30,          // m over the lake a free fist waits at, between blows, out in front
};

/**
 * @param {{ vent: number[][], reach: (x: number, z: number) => boolean, ground: (x: number, z: number) => number,
 *           home: number[][], rand?: () => number }} ctx
 *   vent[i]: arm i's place on the vent (world x, y, z); home[i]: where its free fist waits (x, z); reach: whether a mark
 *   is within its arms' reach; ground: the ground's height at a mark.
 */
export function createEmberFight(ctx) {
  const T = ewfTuning, rand = ctx.rand || Math.random;
  const mk = (i) => ({ i, state: ARM.HOLD, t: 0, dur: 0, heat: 0.15, freezes: 0, bound: 0, hand: [...ctx.vent[i]], from: [0, 0, 0], mark: [0, 0, 0], hit: false });
  const arms = [mk(0), mk(1)];
  const F = {
    phase: EWF.IDLE, arms, events: [], time: 0,
    /** The phase the fight returns to on a death (its checkpoint). */
    checkpoint: EWF.IDLE,
    /** Which arm strikes next (TWO: they alternate). */
    next: 1,
    /** Wake it: the right arm tears off the vent. */
    wake() {
      if (F.phase !== EWF.IDLE) return;
      F.phase = F.checkpoint = EWF.ONE; F.events.push({ e: 'wake' });
      lift(arms[1]); F.next = 1;
    },
    /**
     * One step. w: the Wraith (x, y, z, vx, vz), and whether it is in the arena.
     */
    update(dt, wx, wy, wz, wvx, wvz, inArena) {
      F.time += dt;
      if (F.phase === EWF.IDLE || F.phase === EWF.DONE) return F;
      for (const a of arms) step(a, dt, wx, wy, wz, wvx, wvz, inArena);
      return F;
    },
    /** Frost reached arm i's fist. 'bind' | 'count' | 'steam' | 'none'. */
    freeze(i) {
      const a = arms[i];
      if (a.state !== ARM.REST) return 'none';
      if (a.heat > T.dark) { F.events.push({ e: 'steam', arm: i }); return 'steam'; }
      a.freezes++;
      if (a.freezes === 1) { a.dur += T.restAfterFreeze; F.events.push({ e: 'freeze', arm: i, n: 1 }); }
      if (a.freezes >= T.freezes) { bind(a); return 'bind'; }
      return 'count';
    },
    /** The Wraith died: the whole fight resets (user, 2026-11-25: a boss fight's progress goes with a death) — both arms
     *  free and back on the vent, asleep until the Wraith comes down to it again. */
    reset() {
      if (F.phase === EWF.IDLE || F.phase === EWF.DONE) return;
      for (const a of arms) { a.state = ARM.HOLD; a.t = 0; a.dur = 0; a.freezes = 0; a.bound = 0; a.heat = 0.15; a.hit = false; for (let k = 0; k < 3; k++) a.hand[k] = ctx.vent[a.i][k]; }
      F.phase = F.checkpoint = EWF.IDLE; F.next = 1;
      F.events.push({ e: 'reset' });
    },
    /** The fire given back at its heart (HELD only). */
    give() {
      if (F.phase !== EWF.HELD) return false;
      F.phase = EWF.DONE; F.events.push({ e: 'release' }); return true;
    },
    /** The owner clears the events once it has acted on them (some come from wake / freeze / give, between updates). */
    clear() { F.events.length = 0; },
    /** Its heart can be reached (both arms bound). */
    get held() { return F.phase === EWF.HELD; },
  };

  function homeOf(a, out) { const h = ctx.home[a.i]; out[0] = h[0]; out[2] = h[1]; out[1] = ctx.vent[a.i][1] + T.hoverH; return out; }
  function lift(a) { a.from[0] = a.hand[0]; a.from[1] = a.hand[1]; a.from[2] = a.hand[2]; a.state = ARM.LIFT; a.t = 0; a.dur = T.lift; a.hit = false; }
  function bind(a) {
    a.state = ARM.BOUND; a.bound = 1; a.heat = 0;
    F.events.push({ e: 'bound', arm: a.i });
    if (F.phase === EWF.ONE) {
      // It strains; the vent hand slips: the lake surges, the left tears free.
      F.phase = F.checkpoint = EWF.TWO; F.events.push({ e: 'surge' });
      const l = arms[0]; if (l.state === ARM.HOLD) lift(l);
      F.next = 0;
    } else if (arms[0].state === ARM.BOUND && arms[1].state === ARM.BOUND) {
      F.phase = F.checkpoint = EWF.HELD; F.events.push({ e: 'held' });
    }
  }
  const ease = (u) => u * u * (3 - 2 * u);

  function step(a, dt, wx, wy, wz, wvx, wvz, inArena) {
    a.t += dt;
    const u = Math.min(1, a.t / Math.max(a.dur, 1e-6));
    switch (a.state) {
      case ARM.HOLD:
      case ARM.BOUND:
        a.heat += (0.1 - a.heat) * Math.min(1, dt * 0.5);
        return;
      case ARM.LIFT: {
        const h = homeOf(a, [0, 0, 0]), e = ease(u);
        for (let k = 0; k < 3; k++) a.hand[k] = a.from[k] + (h[k] - a.from[k]) * e;
        a.hand[1] += Math.sin(Math.PI * u) * 12;
        a.heat += (0.25 - a.heat) * Math.min(1, dt);
        if (u >= 1) { a.state = ARM.RECOVER; a.t = 0; a.dur = T.recover[0] + (T.recover[1] - T.recover[0]) * rand(); }
        return;
      }
      case ARM.HOVER:
      case ARM.RECOVER: {
        // Waiting out in front; it looks for the Wraith. (In TWO only the arm whose turn it is strikes.)
        const h = homeOf(a, [0, 0, 0]);
        for (let k = 0; k < 3; k++) a.hand[k] += (h[k] - a.hand[k]) * Math.min(1, dt * 1.5);
        a.hand[1] += Math.sin(F.time * 0.9 + a.i * 2) * 0.05;
        a.heat += (0.3 - a.heat) * Math.min(1, dt);
        const turn = F.phase !== EWF.TWO || F.next === a.i || arms[F.next].state === ARM.BOUND;
        const busy = arms.some((o) => o !== a && (o.state === ARM.RAISE || o.state === ARM.STRIKE));
        if (u >= 1 && turn && !busy && inArena) {
          const mx = wx + wvx * T.lead, mz = wz + wvz * T.lead;
          if (!ctx.reach(mx, mz)) return;
          a.mark[0] = mx; a.mark[2] = mz; a.mark[1] = ctx.ground(mx, mz);
          a.from[0] = a.hand[0]; a.from[1] = a.hand[1]; a.from[2] = a.hand[2];
          a.state = ARM.RAISE; a.t = 0; a.dur = T.raise; a.freezes = 0;
          F.events.push({ e: 'raise', arm: a.i, x: mx, y: a.mark[1], z: mz });
        }
        return;
      }
      case ARM.RAISE: {
        // Up over its mark, heating to white (the telegraph).
        const e = ease(u);
        a.hand[0] = a.from[0] + (a.mark[0] - a.from[0]) * e;
        a.hand[2] = a.from[2] + (a.mark[2] - a.from[2]) * e;
        a.hand[1] = a.from[1] + (a.mark[1] + T.raiseH - a.from[1]) * e;
        a.heat = Math.min(1, 0.3 + 0.7 * u);
        if (u >= 1) { a.from[0] = a.hand[0]; a.from[1] = a.hand[1]; a.from[2] = a.hand[2]; a.state = ARM.STRIKE; a.t = 0; a.dur = T.strike; a.hit = false; }
        return;
      }
      case ARM.STRIKE: {
        const e = u * u;
        a.hand[0] = a.from[0] + (a.mark[0] - a.from[0]) * e;
        a.hand[1] = a.from[1] + (a.mark[1] - a.from[1]) * e;
        a.hand[2] = a.from[2] + (a.mark[2] - a.from[2]) * e;
        a.heat = 1;
        if (u >= 1) {
          const d = Math.hypot(wx - a.mark[0], wz - a.mark[2]), hit = d < T.hitR && Math.abs(wy - a.mark[1]) < 8;
          F.events.push({ e: 'impact', arm: a.i, x: a.mark[0], y: a.mark[1], z: a.mark[2], hit, d });
          a.state = ARM.REST; a.t = 0; a.dur = T.rest; a.freezes = 0;
          if (F.phase === EWF.TWO) F.next = 1 - a.i;
        }
        return;
      }
      case ARM.REST:
        // Cooling where it landed: white, orange, dark red — the last stretch dark, then it flares before it lifts.
        a.heat = a.t < a.dur - 0.5 ? Math.max(0.12, 1 - a.t / Math.min(T.rest - 1.2, a.dur - 1.2) * 0.9) : Math.min(1, a.heat + dt * 2.2);
        if (u >= 1) lift(a);
        return;
    }
  }
  return F;
}
