import { describe, it, expect } from 'vitest';
import { createEmberFight, EWF, ARM, ewfTuning } from '../src/game/emberWarden/fight.js';

const ctx = () => ({ vent: [[-10, 736, 0], [10, 736, 0]], home: [[-30, 40], [30, 40]], reach: (x, z) => Math.hypot(x, z) < 120, ground: () => 745, rand: () => 0 });
/** Run until pred, stepping dt with the Wraith at (x, z); returns the events seen. */
function run(F, pred, x = 0, z = 70, max = 60, dt = 1 / 30) {
  const seen = [];
  for (let t = 0; t < max && !pred(F); t += dt) { F.update(dt, x, 745, z, 0, 0, true); seen.push(...F.events); F.clear(); }
  return seen;
}
const restDark = (F, i) => run(F, (f) => f.arms[i].state === ARM.REST && f.arms[i].heat < ewfTuning.dark);

describe('the Ember Warden fight', () => {
  it('sleeps until woken; then its right arm leaves the vent and hunts the Wraith', () => {
    const F = createEmberFight(ctx());
    F.update(1, 0, 745, 70, 0, 0, true);
    expect(F.phase).toBe(EWF.IDLE);
    F.wake();
    expect(F.phase).toBe(EWF.ONE);
    expect(F.arms[0].state).toBe(ARM.HOLD);
    const ev = run(F, (f) => f.arms[1].state === ARM.REST);
    const raise = ev.find((e) => e.e === 'raise'), hit = ev.find((e) => e.e === 'impact');
    expect(raise.arm).toBe(1);
    expect(hit.hit).toBe(true);
    expect(Math.hypot(hit.x - 0, hit.z - 70)).toBeLessThan(1);
  });

  it('misses a Wraith that moved off its mark; does not strike out of reach', () => {
    const F = createEmberFight(ctx()); F.wake();
    run(F, (f) => f.arms[1].state === ARM.RAISE);
    const ev = run(F, (f) => f.arms[1].state === ARM.REST, 0, 95);
    expect(ev.find((e) => e.e === 'impact').hit).toBe(false);
    const G = createEmberFight(ctx()); G.wake();
    run(G, () => false, 0, 200, 10);
    expect(G.arms[1].state).not.toBe(ARM.RAISE);
  });

  it('frost in the heat flashes to steam; in the dark beat, twice, it binds — and the left tears free', () => {
    const F = createEmberFight(ctx()); F.wake();
    run(F, (f) => f.arms[1].state === ARM.REST);
    expect(F.freeze(1)).toBe('steam');
    restDark(F, 1);
    expect(F.freeze(1)).toBe('count');
    expect(F.freeze(1)).toBe('bind');
    expect(F.arms[1].state).toBe(ARM.BOUND);
    expect(F.phase).toBe(EWF.TWO);
    expect(F.events.map((e) => e.e)).toEqual(expect.arrayContaining(['bound', 'surge']));
    expect(F.arms[0].state).toBe(ARM.LIFT);
  });

  it('a first freezing holds the fist down longer, so a second can land', () => {
    const F = createEmberFight(ctx()); F.wake();
    restDark(F, 1);
    const left = F.arms[1].dur - F.arms[1].t;
    F.freeze(1);
    expect(F.arms[1].dur - F.arms[1].t).toBeCloseTo(left + ewfTuning.restAfterFreeze, 5);
  });

  it('both bound: held, the heart reachable; the fire given back releases it', () => {
    const F = createEmberFight(ctx()); F.wake();
    restDark(F, 1); F.freeze(1); F.freeze(1);
    restDark(F, 0); F.freeze(0); F.freeze(0);
    expect(F.phase).toBe(EWF.HELD);
    expect(F.held).toBe(true);
    expect(F.give()).toBe(true);
    expect(F.phase).toBe(EWF.DONE);
  });

  it('a death resets the whole fight: both arms free, back on the vent, asleep until woken again', () => {
    const F = createEmberFight(ctx()); F.wake();
    restDark(F, 1); F.freeze(1); F.freeze(1);
    run(F, (f) => f.arms[0].state === ARM.REST);
    F.clear(); F.reset();
    expect(F.phase).toBe(EWF.IDLE);
    expect(F.arms.map((a) => a.state)).toEqual([ARM.HOLD, ARM.HOLD]);
    expect(F.arms.map((a) => a.bound)).toEqual([0, 0]);
    expect(F.events.map((e) => e.e)).toEqual(['reset']);
    F.wake();
    expect(F.phase).toBe(EWF.ONE);
  });

  it('in TWO the arms take turns', () => {
    const F = createEmberFight(ctx()); F.wake();
    restDark(F, 1); F.freeze(1);
    // (Only one bound: unbind by running out the rest without the second freezing: a fresh fight, both free.)
    const G = createEmberFight(ctx()); G.wake();
    restDark(G, 1); G.freeze(1); G.freeze(1);   // right bound → TWO
    const ev = run(G, () => false, 0, 70, 40);
    const raises = ev.filter((e) => e.e === 'raise').map((e) => e.arm);
    expect(raises.length).toBeGreaterThan(1);
    expect(new Set(raises)).toEqual(new Set([0]));   // the right is bound: only the left strikes
  });
});
