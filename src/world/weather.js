// Weather (BRIEF §5.6): a state machine per biome, driven by restoration and time, blended into a
// few continuous parameters that every consumer reads (sky and clouds, key light and IBL, fog,
// precipitation, ground blow, wind, terrain-state refill, sound). Transitions ease over tens of
// seconds and never pop.
//
// Frost states: clear, overcast, snowfall, blizzard. A stilled steppe has no moving air, so only
// clear and a still, hazy overcast occur there (no falling snow, no blizzard): the weather
// returning is part of the release's reward. Restored, the steppe cycles through all four.
//
// Durations are real seconds and the sequence is seeded by the cycle index, so a session's
// weather is deterministic. The dev overlay can force a state (override); captures snap.

/** Target parameters per state. cover: cloud cover 0..1; snow: snowfall 0..1; wind: wind
 *  multiplier; fog: weather fog density 0..1 (visibility); gust: gustiness 0..1. */
export const FROST_STATES = {
  clear: { cover: 0.12, snow: 0, wind: 1, fog: 0.04, gust: 0.3 },
  overcast: { cover: 0.82, snow: 0, wind: 1.15, fog: 0.22, gust: 0.4 },
  snowfall: { cover: 0.94, snow: 0.55, wind: 0.85, fog: 0.42, gust: 0.3 },
  blizzard: { cover: 1, snow: 1, wind: 2.4, fog: 1, gust: 1 },
};
/** Stilled variants: no precipitation, still air. */
const STILLED_STATES = {
  clear: { cover: 0.06, snow: 0, wind: 1, fog: 0.06, gust: 0 },
  overcast: { cover: 0.7, snow: 0, wind: 1, fog: 0.3, gust: 0 },
};

/** Restored cycle: [state, min s, max s]. */
const CYCLE = [['clear', 420, 720], ['overcast', 240, 420], ['snowfall', 200, 360], ['blizzard', 120, 220], ['snowfall', 120, 200], ['overcast', 160, 300]];
const STILLED_CYCLE = [['clear', 600, 900], ['overcast', 300, 600]];

/** Ease time constant (s): ~3τ ≈ 40 s to settle. */
const TAU = 13;

function hash(n) {
  let x = (Math.imul(n, 747796405) + 2891336453) >>> 0;
  x = Math.imul((x >>> ((x >>> 28) + 4)) ^ x, 277803737) >>> 0;
  return (((x >>> 22) ^ x) >>> 0) / 4294967295;
}
/** Step durations (s), drawn once: [restored cycle..., stilled cycle...]. */
const LEN = new Float64Array(CYCLE.length + STILLED_CYCLE.length);
for (let i = 0; i < CYCLE.length; i++) LEN[i] = CYCLE[i][1] + (CYCLE[i][2] - CYCLE[i][1]) * hash(i * 31 + 7);
for (let i = 0; i < STILLED_CYCLE.length; i++) LEN[CYCLE.length + i] = STILLED_CYCLE[i][1] + (STILLED_CYCLE[i][2] - STILLED_CYCLE[i][1]) * hash(i * 31);

export function createWeather() {
  const w = {
    /** Current blended parameters (read by consumers). */
    cover: 0.12, snow: 0.5 - 0.5, wind: 1.5 - 0.5, fog: 0.04, gust: 0.3,
    /** The state now (target), its name in the cycle, and the restoration it was chosen for. */
    state: 'clear',
    /** Forced state from the dev overlay or a photo spot, or null. */
    override: null,
    /** Inputs: restored (0/1) and dt (s); snap jumps straight to the target (captures, loads). */
    // (Double-initialised fields: V8 keeps them unboxed, so per-frame stores never allocate.)
    restored: 0, dt: 0.5 - 0.5, snap: true,
    /** Seconds into the current cycle step, and the step. */
    t: 0.5 - 0.5, step: 0, stepLen: 600.5,
    update() {
      const cyc = w.restored ? CYCLE : STILLED_CYCLE;
      if (w.step >= cyc.length) w.step = 0;
      w.t += w.dt;
      if (w.t >= w.stepLen) {
        w.t = 0; w.step = (w.step + 1) % cyc.length;
        w.stepLen = LEN[w.step + (w.restored ? 0 : CYCLE.length)];
      }
      let name = w.override || cyc[w.step][0];
      const table = w.restored ? FROST_STATES : STILLED_STATES;
      if (!table[name]) name = name === 'snowfall' || name === 'blizzard' ? 'overcast' : 'clear';
      w.state = name;
      const tgt = table[name];
      const k = w.snap ? 1 : 1 - Math.exp(-w.dt / TAU);
      w.snap = false;
      w.cover += (tgt.cover - w.cover) * k; w.snow += (tgt.snow - w.snow) * k; w.wind += (tgt.wind - w.wind) * k;
      w.fog += (tgt.fog - w.fog) * k; w.gust += (tgt.gust - w.gust) * k;
    },
  };
  return w;
}
