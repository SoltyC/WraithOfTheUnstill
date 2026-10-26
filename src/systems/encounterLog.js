// Encounter telemetry (docs/gameplay-design.md §9, `.claude/skills/wraith-design/references/playtest.md`): per encounter,
// from its first spawn to its clear: time to clear, Wraith deaths, health taken, the archetypes engaged (dealt or took
// damage), seconds at each Flow tier, focus starvation (the share of time with focus below the cheapest verb: the Gust,
// or the bend-step) and the most Shaped alive at once. Only with ?bot=1 (everywhere else `begin`/`end` do nothing).
// Allocation-free per frame (fixed typed arrays; strings are only compared); a finished run builds one result object.
// Spawners call `g.encounterLog.begin(id)` at the first spawn and `end(id)` at the clear; the bot reads `results`.

import { combatTuning } from '../game/combat/combat.js';

export const ARCH_NAMES = ['hound', 'brute', 'seer', 'denmother', 'sedgerunner', 'hedgewarden', 'chanter'];
const BIT = {}; ARCH_NAMES.forEach((n, i) => { BIT[n] = 1 << i; });
const N = 16;

/** @param {any} g  shared boot context */
export function addEncounterLog(g) {
  const { loop, clock, combat, shaped, shapedMod, flow } = g;
  const on = new URLSearchParams(location.search).get('bot') === '1';
  const none = { enabled: false, begin() {}, end() {}, results: [], active: () => [] };
  if (!on) return (g.encounterLog = none);

  const S = shapedMod.S;
  const id = new Array(N).fill(''), live = new Uint8Array(N);
  const secs = new Float64Array(N), tier = new Float64Array(N * 4), starve10 = new Float64Array(N), starve8 = new Float64Array(N);
  const deaths = new Int32Array(N), engaged = new Int32Array(N), maxAlive = new Int32Array(N), hits = new Int32Array(N);
  const taken = new Float64Array(N), startAt = new Float64Array(N);
  const gustCost = combatTuning.costGust, dodgeCost = combatTuning.costDodge;
  let nLive = 0, lastHp = combat.health, wasDying = false;

  const markSlot = (i) => { const a = shaped.slots[i].arch; const b = a ? BIT[a] : 0; if (b) for (let k = 0; k < N; k++) if (live[k]) engaged[k] |= b; };
  // Blows dealt: every Shaped.damage call with a real amount (the kill-all calls use 1e9).
  const damage0 = shaped.damage;
  shaped.damage = function (i, amount, stagger, kx, kz) {
    if (nLive > 0 && amount > 0 && amount < 1e8) { markSlot(i); for (let k = 0; k < N; k++) if (live[k]) hits[k]++; }
    return damage0.call(this, i, amount, stagger, kx, kz);
  };

  const self = {
    enabled: true,
    /** Finished runs, oldest first: plain objects (read by tools/bot/encounters.mjs). */
    results: [],
    begin(name) {
      let free = -1;
      for (let k = 0; k < N; k++) { if (live[k] && id[k] === name) return; if (!live[k] && free < 0) free = k; }
      if (free < 0) return;
      id[free] = name; live[free] = 1; nLive++;
      secs[free] = 0; starve10[free] = 0; starve8[free] = 0; deaths[free] = 0; engaged[free] = 0; maxAlive[free] = 0; hits[free] = 0; taken[free] = 0;
      for (let t = 0; t < 4; t++) tier[free * 4 + t] = 0;
      startAt[free] = clock.simTime;
    },
    end(name) {
      for (let k = 0; k < N; k++) {
        if (!live[k] || id[k] !== name) continue;
        live[k] = 0; nLive--;
        const arch = []; for (let b = 0; b < ARCH_NAMES.length; b++) if (engaged[k] & (1 << b)) arch.push(ARCH_NAMES[b]);
        const r2 = (v) => Math.round(v * 100) / 100;
        const s = Math.max(secs[k], 1e-3);
        self.results.push({ id: name, secs: r2(secs[k]), deaths: deaths[k], taken: r2(taken[k]), hits: hits[k], engaged: arch, tierSecs: [0, 1, 2, 3].map((t) => r2(tier[k * 4 + t])),
          starve10: r2(starve10[k] / s), starve8: r2(starve8[k] / s), maxActive: maxAlive[k] });
        if (self.results.length > 64) self.results.shift();
        return;
      }
    },
    /** Ids of the runs in progress. */
    active() { const o = []; for (let k = 0; k < N; k++) if (live[k]) o.push(id[k]); return o; },
    reset() { self.results.length = 0; for (let k = 0; k < N; k++) live[k] = 0; nLive = 0; },
  };

  loop.add({ name: 'encounterLog', update: () => {
    const hp = combat.health, dying = combat.dying > 0;
    if (nLive > 0) {
      const dt = clock.dt;
      let alive = 0;
      for (let i = 0; i < shaped.slots.length; i++) { const st = shaped.slots[i].state; if (st !== S.EMPTY && st !== S.FALLING) alive++; }
      const fell = hp < lastHp - 1e-6 ? lastHp - hp : 0;
      if (fell > 0) {
        // Who hurt it: any Shaped mid-attack within reach this frame.
        const p = g.controller.pos;
        for (let i = 0; i < shaped.slots.length; i++) {
          const s = shaped.slots[i];
          if ((s.state === S.LUNGE || s.state === S.SLAM || s.state === S.CAST || s.state === S.TELEGRAPH) && s.body) {
            const dx = s.body.sx[1] - p.x, dz = s.body.sz[1] - p.z;
            if (dx * dx + dz * dz < 18 * 18) markSlot(i);
          }
        }
      }
      for (let k = 0; k < N; k++) {
        if (!live[k]) continue;
        secs[k] += dt; if (fell > 0) taken[k] += fell;
        tier[k * 4 + flow.tier] += dt;
        if (combat.focus < gustCost) starve10[k] += dt;
        if (combat.focus < dodgeCost) starve8[k] += dt;
        if (alive > maxAlive[k]) maxAlive[k] = alive;
        if (dying && !wasDying) deaths[k]++;
      }
    }
    lastHp = hp; wasDying = dying;
  } });
  return (g.encounterLog = self);
}
