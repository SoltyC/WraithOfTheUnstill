// Weather (BRIEF §5.6): a state machine per biome, driven by restoration and time, blended into a
// few continuous parameters that every consumer reads (sky and clouds, key light and IBL, fog,
// precipitation, ground blow, wind, terrain-state refill, sound). Transitions ease over tens of
// seconds and never pop.
//
// Frost states: clear, overcast, snowfall, blizzard. A stilled steppe has no moving air, so only
// clear and a still, hazy overcast occur there (no falling snow, no blizzard): the weather
// returning is part of the release's reward. Restored, the steppe cycles through all four.
// Dunes: an independent dry machine, blended by raw Dunes weight after the frost/meadow blend.
// Storm activation stays disabled until its visible front/terrain consumers pass review.
// Meadow states (Phase 8 M11): clear, overcast, rain, storm (a thunderstorm), the same rule: a
// stilled meadow only has clear and a still overcast. All three machines run all the time; the targets
// are blended by the meadow's weight under the camera, so the frost↔meadow border grades from snow
// through sleet to rain without a pop. Rain wets the world (wet, puddle: world/wetness inlined in
// update) and dries back after.
//
// Durations are real seconds and the sequence is seeded by the cycle index, so a session's
// weather is deterministic. The dev overlay can force a state (override); captures snap.

import { FROST_STATES, MEADOW_STATES, STILLED_STATES, FROST_CYCLE, MEADOW_CYCLE, STILLED_CYCLE, DUNES_STATES, STILLED_DUNES_STATES, DUNES_CYCLE, STILLED_DUNES_CYCLE, resolveState } from './weatherStates.js';

export { FROST_STATES, MEADOW_STATES, DUNES_STATES };

/** Ease time constant (s): ~3τ ≈ 40 s to settle. */
const TAU = 13;
/** Surface wetness (0..1) rises toward its target in WET_RISE s and dries back in WET_DRY; puddles
 *  fill and drain slower (a cloudburst floods hollows the drizzle only dampens). */
const WET_RISE = 22, WET_DRY = 75, PUDDLE_RISE = 70, PUDDLE_DRY = 160;

function hash(n) {
  let x = (Math.imul(n, 747796405) + 2891336453) >>> 0;
  x = Math.imul((x >>> ((x >>> 28) + 4)) ^ x, 277803737) >>> 0;
  return (((x >>> 22) ^ x) >>> 0) / 4294967295;
}
/** Step durations (s) of a cycle, drawn once. */
function lengths(cyc, seed) {
  const a = new Float64Array(cyc.length);
  for (let i = 0; i < cyc.length; i++) a[i] = cyc[i][1] + (cyc[i][2] - cyc[i][1]) * hash(i * 31 + seed);
  return a;
}
const LEN_FROST = lengths(FROST_CYCLE, 7), LEN_MEADOW = lengths(MEADOW_CYCLE, 11), LEN_STILLED = lengths(STILLED_CYCLE, 0), LEN_DUNES=lengths(DUNES_CYCLE,17), LEN_STILLED_DUNES=lengths(STILLED_DUNES_CYCLE,23);

/** Where a biome's machine is: seconds into the step, the step, its length. */
function newClock() { return { t: 0.5 - 0.5, step: 0, len: 600.5 }; }
/** Advance a clock by dt (a field of w, not an argument) through cyc; returns the step's state name. */
function tick(c, w, cyc, lens) {
  if (c.step >= cyc.length) c.step = 0;
  c.t += w.dt;
  if (c.t >= c.len) { c.t = 0; c.step = (c.step + 1) % cyc.length; c.len = lens[c.step]; }
  return cyc[c.step][0];
}

export function createWeather() {
  const f = newClock(), m = newClock(), d = newClock();
  const w = {
    /** Current blended parameters (read by consumers). */
    cover: 0.12, snow: 0.5 - 0.5, rain: 0.5 - 0.5, storm: 0.5 - 0.5, wind: 1.5 - 0.5, fog: 0.04, gust: 0.3,
    /** Surface wetness and puddle fill, 0..1: what rain has done to the world (dries back after). */
    wet: 0.5 - 0.5, puddle: 0.5 - 0.5,
    /** The state now (target) of the biome under the camera. */
    state: 'clear',
    /** Forced state from the dev overlay or a photo spot, or null. */
    override: null,
    /** Dev / photo-spot forcing (0..1, or -1 for none): sets wetness, the slow puddle value and the rain outright. */
    wetForce: -1.5 + 0.5, puddleForce: -1.5 + 0.5, rainForce: -1.5 + 0.5,
    /** Inputs: frost restored (0/1), meadow restored (0/1), the meadow's weight under the camera
     *  (0 frost … 1 meadow, eased by the owner), raw Dunes weight and its release flag, and dt (s); snap jumps straight to the target
     *  (captures, loads). */
    // (Double-initialised fields: V8 keeps them unboxed, so per-frame stores never allocate.)
    restored: 0, meadowRestored: 0, dunesRestored:0, dunes:0.5-0.5, sand:0.5-0.5, duneStorms:true,
    /** Out: the erg's own state now (its cycle or the override), whatever biome the camera is in. */
    duneName: 'clear', meadow: 0.5 - 0.5, dt: 0.5 - 0.5, snap: true,
    frost: f, meadowClock: m, dunesClock:d,
    update() {
      // All three machines run all the time (also under an override: it ends where the cycle is).
      const fNat = w.restored ? tick(f, w, FROST_CYCLE, LEN_FROST) : tick(f, w, STILLED_CYCLE, LEN_STILLED);
      const mNat = w.meadowRestored ? tick(m, w, MEADOW_CYCLE, LEN_MEADOW) : tick(m, w, STILLED_CYCLE, LEN_STILLED);
      const dNat=w.dunesRestored?tick(d,w,DUNES_CYCLE,LEN_DUNES):tick(d,w,STILLED_DUNES_CYCLE,LEN_STILLED_DUNES);
      let duneName=resolveState(w.override||dNat,'dunes',w.dunesRestored);
      if(duneName==='sandstorm'&&!w.duneStorms)duneName='heat-haze';
      w.duneName=duneName;
      const duneTarget=(w.dunesRestored?DUNES_STATES:STILLED_DUNES_STATES)[duneName];
      const duneWeight=Math.max(0,Math.min(1,w.dunes));
      const frostName = resolveState(w.override || fNat, 'frost', w.restored), meadowName = resolveState(w.override || mNat, 'meadow', w.meadowRestored);
      const ft = (w.restored ? FROST_STATES : STILLED_STATES)[frostName];
      const mt = (w.meadowRestored ? MEADOW_STATES : STILLED_STATES)[meadowName];
      const b = w.meadow;
      w.state = duneWeight>.5?duneName:b > 0.5 ? meadowName : frostName;
      // Blend the two biomes' targets by the meadow weight. At the border a snowing frost turns to
      // sleet: some of its precipitation falls as rain on the meadow side (peaks at b = 0.5).
      const sleet = 4 * b * (1 - b) * 0.7 * ft.snow;
      let tCover = ft.cover + (mt.cover - ft.cover) * b, tWind = ft.wind + (mt.wind - ft.wind) * b;
      let tFog = ft.fog + (mt.fog - ft.fog) * b, tGust = ft.gust + (mt.gust - ft.gust) * b;
      let tSnow = ft.snow * (1 - b), tRain = Math.min(1, mt.rain * b + sleet), tStorm = mt.storm * b;
      tCover+=(duneTarget.cover-tCover)*duneWeight;tWind+=(duneTarget.wind-tWind)*duneWeight;
      tFog+=(duneTarget.fog-tFog)*duneWeight;tGust+=(duneTarget.gust-tGust)*duneWeight;
      tSnow*=1-duneWeight;tRain*=1-duneWeight;tStorm*=1-duneWeight;
      const k = w.snap ? 1 : 1 - Math.exp(-w.dt / TAU);
      w.cover += (tCover - w.cover) * k; w.snow += (tSnow - w.snow) * k; w.wind += (tWind - w.wind) * k;
      w.fog += (tFog - w.fog) * k; w.gust += (tGust - w.gust) * k;
      w.rain += (tRain - w.rain) * k; w.storm += (tStorm - w.storm) * k;
      w.sand+=((duneTarget.sand||0)*duneWeight-w.sand)*k;
      // Forced rain still soaks the surface when wetness itself is not pinned.
      if (w.rainForce >= 0) w.rain = Math.min(1, w.rainForce);
      // Wetness: rain soaks the world, dry air takes it back (a captured rain shot is already wet).
      const wetT = Math.min(1, w.rain * 1.5), pudT = Math.min(1, Math.max(0, (w.rain - 0.3) * 1.6));
      if (w.snap) { w.wet = wetT; w.puddle = pudT; }
      else {
        w.wet += (wetT - w.wet) * (1 - Math.exp(-w.dt / (wetT > w.wet ? WET_RISE : WET_DRY)));
        w.puddle += (pudT - w.puddle) * (1 - Math.exp(-w.dt / (pudT > w.puddle ? PUDDLE_RISE : PUDDLE_DRY)));
      }
      if (w.wetForce >= 0) w.wet = Math.min(1, w.wetForce);
      if (w.puddleForce >= 0) w.puddle = Math.min(1, w.puddleForce);
      w.snap = false;
    },
  };
  return w;
}

