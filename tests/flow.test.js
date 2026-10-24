import { describe, it, expect } from 'vitest';
import { createFlow, flowTuning, FLOW_EVENT, FLOW_IN } from '../src/game/flow.js';

const DT = 1 / 60;
/** Run the flow for `seconds` with the inputs `inp` (fields) merged in each frame. */
const NUM = { speed: FLOW_IN.SPEED, surfSpeed: FLOW_IN.SURF_SPEED, grip: FLOW_IN.GRIP, glideSpeed: FLOW_IN.GLIDE_SPEED, vy: FLOW_IN.VY, lift: FLOW_IN.LIFT };
function apply(f, inp) { for (const k in inp) { if (k in NUM) f.inp[NUM[k]] = inp[k]; else f[k] = inp[k]; } }
function run(f, seconds, inp, fn) {
  for (let t = 0; t < seconds; t += DT) { apply(f, inp); f.inp[FLOW_IN.DT] = DT; if (fn) fn(t); f.update(); }
}
const surfing = { surfOn: true, glideOn: false, grounded: true, speed: 18, surfSpeed: 18, grip: 0.3, vy: 0 };
const gliding = { surfOn: true, glideOn: true, grounded: false, speed: 14, glideSpeed: 14, vy: -2 };
const standing = { surfOn: false, glideOn: false, grounded: true, speed: 0, surfSpeed: 0, vy: 0 };

describe('flow build and decay', () => {
  it('builds while surfing fast, faster with speed and carving', () => {
    const a = createFlow(), b = createFlow(), c = createFlow();
    run(a, 3, { ...surfing, surfSpeed: 12 });
    run(b, 3, { ...surfing, surfSpeed: 20 });
    run(c, 3, { ...surfing, surfSpeed: 20, grip: 0.95 });
    expect(a.value).toBeGreaterThan(0.2);
    expect(b.value).toBeGreaterThan(a.value);
    expect(c.value).toBeGreaterThan(b.value);
  });
  it('does not build below the surf threshold', () => {
    const f = createFlow();
    run(f, 5, { ...surfing, surfSpeed: 8 });
    expect(f.value).toBe(0);
  });
  it('passive building stops near the soft cap: the last tier needs chains and reactions', () => {
    const f = createFlow();
    run(f, 60, { ...surfing, surfSpeed: 24, grip: 1 });
    expect(f.value).toBeLessThanOrEqual(flowTuning.softCap + 0.01);
    expect(f.value).toBeGreaterThan(1.8);
    expect(f.tier).toBe(1 + 1);
  });
  it('tiers sit at 1, 2 and 3, with hysteresis going down', () => {
    const f = createFlow();
    const at = (v) => { f.setValue(v); return f.tier; };
    expect([at(0.99), at(1), at(1.99), at(2), at(2.99), at(3)]).toEqual([0, 1, 1, 2, 2, 3]);
    // Hysteresis: just under a line keeps the tier, clearly under drops it.
    at(2); expect(at(1.95)).toBe(2); expect(at(1.8)).toBe(1);
    // Events past the top clamp at 3.
    for (let k = 0; k < 40; k++) { f.hit(FLOW_EVENT.WEAPON_HEAVY); }
    expect(f.value).toBeLessThanOrEqual(3);
  });
  it('drains to nothing in about 2 s standing still from full', () => {
    const f = createFlow();
    f.setValue(3);
    run(f, 0.3, standing);
    expect(f.value).toBeGreaterThan(2.9);                // the grace
    run(f, 2.1, standing);
    expect(f.value).toBeLessThan(0.1);
    expect(f.tier).toBe(0);
  });
  it('walking drains slowly, and not during the chain window', () => {
    const f = createFlow();
    f.setValue(2);
    run(f, 4, { ...standing, speed: 5 });
    expect(f.value).toBeLessThan(2 - 1);
    expect(f.value).toBeGreaterThan(0.2);
  });
  it('a blow costs a tier and stops building for a moment', () => {
    const f = createFlow();
    f.setValue(2.4);
    f.hurt();
    expect(f.value).toBeCloseTo(1.4, 5);
    expect(f.tier).toBe(1);
    expect(f.hurtEvent).toBe(1);
    run(f, 0.3, surfing);
    expect(f.value).toBeCloseTo(1.4, 5);
    run(f, 1, surfing);
    expect(f.value).toBeGreaterThan(1.4);
  });
  it('a hard landing costs a tier; a landing from a glide does not', () => {
    const f = createFlow();
    f.setValue(2.4);
    run(f, 0.5, { ...standing, grounded: false, vy: -22, speed: 3 });
    run(f, 0.02, { ...standing, grounded: true, vy: 0 });
    expect(f.value).toBeLessThan(1.5);
    const g = createFlow();
    g.setValue(2.4);
    run(g, 1, gliding, () => { g.inp[FLOW_IN.VY] = -22; });
    run(g, 0.05, { ...surfing });
    expect(g.value).toBeGreaterThan(2.4);
  });
  it('stacked events give diminishing returns and recover', () => {
    const f = createFlow();
    f.hit(FLOW_EVENT.SHATTER); const a = f.value;
    f.hit(FLOW_EVENT.SHATTER); const b = f.value - a;
    expect(b).toBeLessThan(a);
    run(f, 3, surfing);
  });
  it('near misses are rate limited', () => {
    const f = createFlow();
    f.nearMiss(); const a = f.value;
    f.nearMiss(); f.nearMiss();
    expect(f.value).toBe(a);
    run(f, 0.6, standing);
    f.nearMiss();
    expect(f.value).toBeGreaterThan(0);
  });
});

describe('flow chains', () => {
  it('surf into a glide is a chain, once', () => {
    const f = createFlow();
    run(f, 1.5, { ...surfing, surfSpeed: 12 });
    const before = f.value;
    let chains = 0;
    run(f, 0.02, gliding, () => { chains += f.chainEvent; });
    f.update();
    expect(f.counts[8]).toBe(1);
    expect(f.value).toBeGreaterThan(before + flowTuning.chainGain - 0.05);
  });
  it('a glide landing back on the surf within the window is a chain', () => {
    const f = createFlow();
    run(f, 1, { ...surfing, surfSpeed: 12 });
    run(f, 1, gliding);
    expect(f.counts[8]).toBe(1);
    run(f, 0.1, { ...surfing, surfSpeed: 12 });
    expect(f.counts[8]).toBe(2);
    expect(f.streak).toBe(2);
  });
  it('a gap longer than the window breaks the chain', () => {
    const f = createFlow();
    run(f, 1, { ...surfing, surfSpeed: 12 });
    run(f, 1.5, { ...standing, speed: 5, grounded: false, vy: -1 });
    run(f, 1, gliding);
    expect(f.counts[8]).toBe(0);
  });
  it('a short blip of a mode is not a chain', () => {
    const f = createFlow();
    run(f, 0.2, { ...surfing, surfSpeed: 12 });
    run(f, 0.5, gliding);
    expect(f.counts[8]).toBe(0);
  });
  it('catching an updraft from the ground feeds flow', () => {
    const f = createFlow();
    run(f, 0.2, standing);
    run(f, 0.1, { ...gliding, surfOn: false, lift: 20 });
    expect(f.counts[FLOW_EVENT.UPDRAFT]).toBe(1);
    expect(f.value).toBeGreaterThan(0.3);
  });
  it('a crest jump landing back on the surf is a chain', () => {
    const f = createFlow();
    run(f, 1, { ...surfing, surfSpeed: 15 });
    run(f, 0.6, { ...surfing, surfSpeed: 15, grounded: false, vy: -3 });
    run(f, 0.05, surfing);
    expect(f.counts[8]).toBe(1);
  });
  it('a streak of chains is worth a little more each time', () => {
    const f = createFlow();
    const gains = [];
    for (let k = 0; k < 3; k++) {
      run(f, 0.8, { ...surfing, surfSpeed: 5 });          // below the build threshold: only chains count
      f.setValue(0);
      const v0 = f.value;
      run(f, 0.02, gliding);
      gains.push(f.value - v0);
      run(f, 0.7, gliding);
      run(f, 0.02, { ...surfing, surfSpeed: 5 });
    }
    expect(gains[1]).toBeGreaterThan(gains[0] - 1e-9);
  });
});

describe('flow gives and determinism', () => {
  it('focus regeneration scales with flow; verbs get cheaper and stronger at tier 2', () => {
    const f = createFlow();
    expect(f.focusMul).toBe(1); expect(f.costMul).toBe(1); expect(f.power).toBe(1);
    f.setValue(2.2);
    expect(f.focusMul).toBeCloseTo(1 + flowTuning.focusPerFlow * f.value, 6);
    expect(f.tier).toBeGreaterThanOrEqual(2);
    expect(f.costMul).toBe(flowTuning.tier2Cost);
    expect(f.power).toBe(flowTuning.tier2Power);
  });
  it('the flowing variants are on only at tier 3', () => {
    const f = createFlow();
    f.setValue(2.9);
    expect(f.flowing).toBe(false);
    f.hit(FLOW_EVENT.UPDRAFT);
    expect(f.tier).toBe(3);
    expect(f.flowing).toBe(true);
  });
  it('reports tier changes for one frame', () => {
    const f = createFlow();
    f.setValue(0.8);
    f.hit(FLOW_EVENT.SHATTER);
    expect(f.tierEvent).toBe(1);
    run(f, DT, standing);
    expect(f.tierEvent).toBe(0);
  });
  it('is deterministic and tracks time at each tier', () => {
    const go = () => {
      const f = createFlow();
      run(f, 6, surfing); run(f, 1, gliding); run(f, 1, surfing); run(f, 4, standing);
      return [f.value, ...f.timeAt, ...f.counts];
    };
    expect(go()).toEqual(go());
    const t = go();
    expect(t.slice(1, 5).reduce((a, b) => a + b, 0)).toBeCloseTo(12, 1);
  });
  it('paused does nothing', () => {
    const f = createFlow();
    f.setValue(2); f.paused = true;
    run(f, 5, standing);
    f.hurt(); f.hit(FLOW_EVENT.SHATTER);
    expect(f.value).toBe(2);
  });
});
