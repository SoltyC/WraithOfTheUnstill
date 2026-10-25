import { describe, it, expect } from 'vitest';
import { WeaponMachine, PHASE } from '../src/game/weapons/machine.js';
import { weaponDefs, weaponFeel } from '../src/game/weapons/defs.js';

const DT = 1 / 60;
function rig(def = weaponDefs.staff) {
  const m = new WeaponMachine(); m.def = def; m.dt = DT;
  const log = { active: 0, end: 0, start: 0, dodge: 0 };
  /** Step `secs` with the button held/not, optionally pressing on the first frame. */
  const step = (secs, { down = false, press = false, dodge = false } = {}) => {
    const n = Math.round(secs / DT);
    for (let k = 0; k < n; k++) {
      m.down = down; m.pressed = press && k === 0; m.dodgePressed = dodge && k === 0;
      m.update();
      if (m.activeEvent) log.active++; if (m.endEvent) log.end++; if (m.startEvent) log.start++; if (m.dodgeNow) log.dodge++;
    }
  };
  return { m, step, log };
}

describe('weapon state machine', () => {
  it('a tap winds up, cuts, recovers and returns to idle', () => {
    const { m, step, log } = rig();
    const a = weaponDefs.staff.combo[0];
    step(DT, { press: true });
    expect(m.phase).toBe(PHASE.WINDUP);
    step(a.windup + DT * 2);
    expect(m.phase).toBe(PHASE.ACTIVE);
    expect(log.active).toBe(1);
    step(a.active + DT);
    expect(m.phase).toBe(PHASE.RECOVER);
    step(a.recover + DT * 2);
    expect(m.phase).toBe(PHASE.IDLE);
    expect(log.end).toBe(1);
  });

  it('a press buffered before the link point chains into the next hit', () => {
    const { m, step } = rig();
    const a = weaponDefs.staff.combo[0];
    step(DT, { press: true });
    step(a.windup + a.active * 0.5);                // inside the cut
    step(DT, { press: true });                       // 150 ms buffer
    step(a.active * 0.5 + a.recover * a.link + DT * 4);
    expect(m.combo).toBe(1);
    expect(m.phase).toBe(PHASE.WINDUP);
  });

  it('a press too early to be buffered is dropped', () => {
    const { m, step } = rig();
    step(DT, { press: true });
    step(DT * 2, { press: true });
    step(weaponFeel.buffer + 0.1);                   // still in the first windup / cut; buffer long gone by the link point
    step(1);
    expect(m.phase).toBe(PHASE.IDLE);
    expect(m.combo).toBe(0);
  });

  it('walks the whole combo and never loops past the last hit', () => {
    const { m, step } = rig();
    const n = weaponDefs.staff.combo.length;
    let maxCombo = 0;
    step(DT, { press: true });
    for (let k = 0; k < 120 && m.phase !== PHASE.IDLE; k++) {
      step(DT, { press: m.phase === PHASE.RECOVER && m.t > 0.08 });
      maxCombo = Math.max(maxCombo, m.combo);
    }
    expect(maxCombo).toBe(n - 1);
    step(2);
    expect(m.phase).toBe(PHASE.IDLE);
  });

  it('holding the button charges a heavy; the release brings it down with a power by charge time', () => {
    const { m, step, log } = rig();
    step(DT, { press: true, down: true });
    step(weaponFeel.holdAt + 0.1, { down: true });
    expect(m.phase).toBe(PHASE.CHARGE);
    step(weaponDefs.staff.heavy.chargeMax + 0.2, { down: true });
    step(DT);                                        // release
    expect(m.heavy).toBe(true);
    expect(m.power).toBeCloseTo(1 + weaponDefs.staff.heavy.power, 2);
    step(weaponDefs.staff.heavy.windup + DT * 3);
    expect(m.phase).toBe(PHASE.ACTIVE);
    expect(log.active).toBe(1);
  });

  it('a short charge is a lighter heavy', () => {
    const { m, step } = rig();
    step(DT, { press: true, down: true });
    step(weaponFeel.holdAt + 0.25, { down: true });
    step(DT);
    expect(m.power).toBeGreaterThan(1);
    expect(m.power).toBeLessThan(1 + weaponDefs.staff.heavy.power);
  });

  it('a held press whose windup ends before holdAt waits loaded, and swings on release', () => {
    const { m, step } = rig();
    step(DT, { press: true, down: true });
    step(weaponDefs.staff.combo[0].windup + 0.02, { down: true });
    expect(m.phase).toBe(PHASE.LOADED);
    step(DT);                                        // released
    expect(m.phase).toBe(PHASE.ACTIVE);
  });

  it('a dodge cancels a recovery at once', () => {
    const { m, step, log } = rig();
    const a = weaponDefs.staff.combo[0];
    step(DT, { press: true });
    step(a.windup + a.active + 0.05);
    expect(m.phase).toBe(PHASE.RECOVER);
    step(DT, { dodge: true });
    expect(log.dodge).toBe(1);
    expect(m.phase).toBe(PHASE.IDLE);
  });

  it('a dodge pressed mid-swing is kept and fires as the recovery begins', () => {
    const { m, step, log } = rig();
    const a = weaponDefs.staff.combo[0];
    step(DT, { press: true });
    step(a.windup + 0.04);
    expect(m.phase).toBe(PHASE.ACTIVE);
    step(DT, { dodge: true });
    expect(log.dodge).toBe(0);
    step(a.active + DT * 3);
    expect(log.dodge).toBe(1);
    expect(m.phase).toBe(PHASE.IDLE);
  });

  it('a dodge cancels a charge, and passes straight through when idle', () => {
    const { m, step, log } = rig();
    step(DT, { dodge: true });
    expect(log.dodge).toBe(1);
    step(DT, { press: true, down: true });
    step(weaponFeel.holdAt + 0.1, { down: true });
    expect(m.phase).toBe(PHASE.CHARGE);
    step(DT, { down: true, dodge: true });
    expect(m.phase).toBe(PHASE.IDLE);
    expect(log.dodge).toBe(2);
  });

  it('blocked (dying, surfing) drops the swing and ignores presses', () => {
    const { m, step } = rig();
    step(DT, { press: true });
    expect(m.busy).toBe(true);
    m.blocked = true;
    m.update();
    expect(m.phase).toBe(PHASE.IDLE);
    m.pressed = true; m.update();
    expect(m.phase).toBe(PHASE.IDLE);
  });

  it('every weapon has a combo whose hits cut in a sensible order', () => {
    for (const k in weaponDefs) {
      const d = weaponDefs[k];
      expect(d.combo.length).toBeGreaterThan(1);
      for (const a of [...d.combo, d.heavy]) {
        expect(a.windup).toBeGreaterThan(0.03); expect(a.active).toBeGreaterThan(0.05); expect(a.recover).toBeGreaterThan(0.1);
        expect(a.wind).toHaveLength(8); expect(a.strike).toHaveLength(8); expect(a.end).toHaveLength(8);
      }
    }
  });
});
