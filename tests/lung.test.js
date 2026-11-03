// The Lung and the descent (Phase 10 U2): game/lung.js (the air), world/kelp.js (the forest, the column, the ledge).
import { describe, it, expect } from 'vitest';
import { createLung, stepLung, fit, tear, putOut, whirlFlow, lungFromFlags, AIR, WHIRL } from '../src/game/lung.js';
import { kelpAt, kelpContact, inColumn, COLUMN, LEDGE, KELP, CANOPY_MID } from '../src/world/kelp.js';
import { SOUNDING } from '../src/world/sounding.js';

const under = { under: true, inColumn: false, speed: 0 };
const run = (L, secs, s = under, dt = 0.05) => { const evs = []; for (let t = 0; t < secs; t += dt) { const e = stepLung(L, dt, s); if (e) evs.push(e); } return evs; };
// A floor like the bake's: −105 with a little relief, walls up to the shelf from 205 m out.
const groundAt = (x, z) => { const d = Math.hypot(x - SOUNDING.x, z - SOUNDING.z); return d < 205 ? -105 + 3 * Math.sin(x * 0.05) * Math.cos(z * 0.04) : d < 250 ? -105 + (d - 205) / 45 * 105 : 0.7; };

describe('the air', () => {
  it('lasts about 14 s under the water with no Lung, then puts the body out, and comes back at the surface', () => {
    const L = createLung();
    expect(run(L, AIR.body * 0.9)).toEqual([]);
    expect(L.light).toBeGreaterThan(0.12);
    expect(run(L, AIR.body * 0.2)).toContain('out');
    expect(putOut(L)).toBe('surface');
    L.air = 0.2; run(L, 2, { under: false, inColumn: false, speed: 0 });
    expect(L.air).toBe(1);
  });
  it('the Lung holds enough to go down 105 m and come back at a dive\'s speed', () => {
    const L = createLung(); fit(L);
    expect(run(L, 2 * 105 / 2.6, { under: true, inColumn: false, speed: 2.6 })).toEqual([]);
    expect(L.air).toBeGreaterThan(0.2);
  });
  it('shows on the body: light falls with the air, the robe hangs and the body sinks below a third', () => {
    const L = createLung(); fit(L);
    run(L, 1); const full = { light: L.light, life: L.life, rise: L.rise };
    expect(full.life).toBe(1); expect(full.rise).toBeGreaterThan(0);
    L.air = 0.1; run(L, 0.05);
    expect(L.light).toBeLessThan(full.light * 0.5);
    expect(L.life).toBeLessThan(0.4);
    expect(L.rise).toBeLessThan(0);
    expect(L.stroke).toBeLessThan(0.6);
  });
  it('torn, it goes in about 14 s: too soon to climb back from the canopy (~75 m up)', () => {
    const L = createLung(); fit(L); run(L, 30);
    expect(tear(L)).toBe(true);
    expect(tear(L)).toBe(false);
    let y = -75, vy = 0, t = 0, ev = '';
    // Stroking straight up all the while: the stroke weakens and the drift becomes a sink as the air goes.
    for (; t < 60 && ev !== 'out'; t += 0.05) { ev = stepLung(L, 0.05, { under: true, inColumn: false, speed: 2.6 }); vy = 2.6 * L.stroke; y += vy * 0.05; }
    expect(ev).toBe('out');
    expect(y).toBeLessThan(-20);
    expect(L.stream).toBe(true);
    expect(putOut(L)).toBe('ledge');
    expect(L.stage).toBe('woke');
  });
});

describe('the column', () => {
  it('before the tear it does nothing to the air (the system makes it an upwelling)', () => {
    const L = createLung(); fit(L);
    const evs = run(L, 3, { under: true, inColumn: true, speed: 0 });
    expect(evs).toEqual([]); expect(L.stage).toBe('fitted');
  });
  it('after the tear it refills the Lung, turns, and takes the body within WHIRL.win', () => {
    const L = createLung(); fit(L); tear(L); L.air = 0.05;
    const s = { under: true, inColumn: true, speed: 1 };
    expect(stepLung(L, 0.05, s)).toBe('refill');
    run(L, WHIRL.refill, s);
    expect(L.air).toBe(1);
    const evs = run(L, WHIRL.win, s);
    expect(evs).toContain('taken');
    expect(L.spin).toBeGreaterThan(0.9);
  });
  it('its flow turns round the axis, draws in and pulls down harder than a stroke up once it has spun up', () => {
    const f = whirlFlow(4, 0, 1, [0, 0, 0]);
    expect(f[2]).toBeGreaterThan(3);          // round (at +x, the turn is +z)
    expect(f[0]).toBeLessThan(0);             // in
    expect(-f[1]).toBeGreaterThan(2.6);       // down, past a full stroke up
    const s = whirlFlow(4, 0, 0, [0, 0, 0]);
    expect(-s[1]).toBeLessThan(2.6 * 0.6);    // at first a stroke up (weakened in the turn, systems/lung.js) still holds against it
  });
  it('the saved flags load the stage', () => {
    expect(lungFromFlags(new Set())).toBe('none');
    expect(lungFromFlags(new Set(['ebb:lung']))).toBe('fitted');
    expect(lungFromFlags(new Set(['ebb:lung', 'ebb:torn']))).toBe('woke');
    expect(lungFromFlags(new Set(['ebb:lung', 'ebb:torn', 'ebb:through']))).toBe('through');
  });
});

describe('the kelp forest', () => {
  const scan = () => {
    const out = [], t = new Array(7), n = Math.ceil(SOUNDING.r / KELP.cell);
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) if (kelpAt(i, j, groundAt, t)) out.push(t.slice());
    return out;
  };
  const all = scan();
  it('covers the floor (thousands of stipes), all deep, none on the apron round the column, tops under the cap', () => {
    expect(all.length).toBeGreaterThan(2500);
    for (const k of all) {
      expect(k[1]).toBeLessThan(KELP.rootMax);
      expect(k[1] + k[3]).toBeLessThanOrEqual(KELP.topMax + 1e-9);
      expect(Math.hypot(k[0] - COLUMN.x, k[2] - COLUMN.z)).toBeGreaterThan(KELP.apron);
    }
  });
  it('its canopy spans the descent: the canopy middle is inside the forest\'s height everywhere it grows', () => {
    const spans = all.filter((k) => k[1] < CANOPY_MID && k[1] + k[3] > CANOPY_MID).length;
    expect(spans / all.length).toBeGreaterThan(0.8);
    expect(Math.max(...all.map((k) => k[1] + k[3]))).toBeLessThanOrEqual(KELP.topMax + 1e-9);
  });
  it('a body passing a stipe touches it; one in open water does not', () => {
    const k = all[Math.floor(all.length / 2)];
    expect(kelpContact(k[0] + 0.3, k[1] + k[3] * 0.5, k[2], groundAt)).toBeGreaterThanOrEqual(0);
    expect(kelpContact(COLUMN.x, -80, COLUMN.z, groundAt)).toBe(-1);
    expect(kelpContact(k[0], -20, k[2], groundAt)).toBe(-1);
  });
  it('the ledge is in sight of the column (30 m) and in the forest\'s roots; the column is the axis under its top', () => {
    const d = Math.hypot(LEDGE.x - COLUMN.x, LEDGE.z - COLUMN.z);
    expect(d).toBeGreaterThan(20); expect(d).toBeLessThan(40);
    const yaw = LEDGE.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
    expect(fx * (COLUMN.x - LEDGE.x) + fz * (COLUMN.z - LEDGE.z)).toBeGreaterThan(d * 0.95);   // facing it
    expect(inColumn(COLUMN.x + 2, -90, COLUMN.z)).toBe(true);
    expect(inColumn(COLUMN.x + 2, -40, COLUMN.z)).toBe(false);
    expect(inColumn(LEDGE.x, -100, LEDGE.z)).toBe(false);
  });
});
