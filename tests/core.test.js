import { describe, it, expect } from 'vitest';
import { Pool } from '../src/core/pool.js';
import { FrameStats } from '../src/core/frameStats.js';
import { input, Action, injectAction, endInputFrame } from '../src/input/actions.js';
import { angleDelta, damp } from '../src/core/scratch.js';
import { params, setParam } from '../src/core/params.js';

describe('Pool', () => {
  it('hands out every object once and guards releases', () => {
    const p = new Pool(() => ({ v: 0 }), 3, (o) => { o.v = 0; });
    const a = p.acquire(), b = p.acquire(), c = p.acquire();
    expect(new Set([a, b, c]).size).toBe(3);
    expect(p.acquire()).toBeNull();
    a.v = 7;
    p.release(a);
    expect(a.v).toBe(0);
    expect(() => p.release(a)).toThrow(/double/);
    expect(() => p.release({})).toThrow(/foreign/);
    expect(p.acquire()).toBe(a);
    let live = 0; p.forEachLive(() => live++);
    expect(live).toBe(3);
  });
});

describe('FrameStats', () => {
  it('computes median, 1% low and hitches over the window', () => {
    const f = new FrameStats(200);
    for (let i = 0; i < 198; i++) f.push(10);
    f.push(30); f.push(12);
    f.summarize();
    expect(f.medianMs).toBe(10);
    expect(f.maxMs).toBe(30);
    expect(f.p99Ms).toBe(12);
    expect(f.low1Fps).toBeCloseTo(1000 / 12);
    expect(f.hitches).toBe(1); // 30 > median + 4; 12 is not
    expect(f.ago(0)).toBe(12);
    expect(f.ago(1)).toBe(30);
  });
  it('wraps the ring', () => {
    const f = new FrameStats(4);
    for (let i = 1; i <= 6; i++) f.push(i);
    expect(f.count).toBe(4);
    expect([f.ago(0), f.ago(3)]).toEqual([6, 3]);
  });
});

describe('input action layer', () => {
  it('tracks held, pressed and released edges per frame', () => {
    injectAction(Action.Jump, true);
    expect(input.down[Action.Jump]).toBe(1);
    expect(input.pressed[Action.Jump]).toBe(1);
    endInputFrame();
    expect(input.pressed[Action.Jump]).toBe(0);
    expect(input.down[Action.Jump]).toBe(1);
    injectAction(Action.Jump, false);
    expect(input.released[Action.Jump]).toBe(1);
    endInputFrame();
    expect(input.released[Action.Jump]).toBe(0);
  });
  it('binds every BRIEF §7 action', () => {
    const b = input.bindings;
    expect(b.KeyW).toBe(Action.MoveForward);
    expect(b.Mouse2).toBe(Action.Traverse);
    expect(b.F1).toBe(Action.DevOverlay);
    expect(b.Backquote).toBe(Action.DevOverlay);
    for (let i = 1; i <= 5; i++) expect(b['Digit' + i]).toBe(Action['Element' + i]);
  });
});

describe('math helpers and params', () => {
  it('angleDelta takes the short way round', () => {
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    expect(angleDelta(0.1, 0.3)).toBeCloseTo(0.2);
  });
  it('damp is frame-rate independent', () => {
    const one = damp(0.1, 0.2);
    const two = 1 - (1 - damp(0.1, 0.1)) ** 2;
    expect(one).toBeCloseTo(two, 10);
  });
  it('setParam bumps the version used for change detection', () => {
    const v = params.version;
    setParam('fogDensity', 1.5);
    expect(params.version).toBe(v + 1);
    expect(() => setParam('nope', 1)).toThrow();
  });
});
