#!/usr/bin/env node
// Encounter harness (docs/encounter-audit-plan.md phase B): for each armed encounter, teleport the Wraith 36 m from its place,
// force the encounter (`g.startEncounter(id)`), fight it with an in-page auto-fighter and print one JSON line per run
// from the in-page telemetry (`g.encounterLog`, src/systems/encounterLog.js): seconds to clear, deaths, health taken,
// archetypes engaged, seconds at each Flow tier, focus starvation (share of time below the Gust cost 10 / the dodge cost 8),
// the most Shaped alive at once.
//   WRAITH_URL=http://localhost:4177 node tools/bot/encounters.mjs [ids|all] [--kit staff|frost|best|both] [--runs 3] [--hour 13] [--label x]
// kits: staff = the start weapon, lights with a heavy every 3.5 s, bend-steps away from lunges (as tools/bot/fight.mjs);
//       frost = the start staff plus Frost, to check the route with only the starting kit and element;
//       best  = the glaive the same way, plus Frost's Sweep (Q tap) thrown at foes 4-13 m off whenever focus allows, and Crystallize (F) on brutes and the den mother.
// Output also goes to docs/encounter-runs/<label>.jsonl. A run that is not cleared in 100 s of game time counts as failed.
import fs from 'node:fs';
import { createWorldSampler } from '../world/sample.mjs';
const base = process.env.WRAITH_URL || 'http://localhost:4177';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const want = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) || 'all';
const kits = opt('kit', 'both') === 'both' ? ['staff', 'best'] : [opt('kit', 'both')];
const runs = +opt('runs', 3), hour = +opt('hour', 13), label = opt('label', 'run');
const TIMEOUT = +(process.env.TIMEOUT || 100);
const bot = async (cmd, a = {}) => {
  const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify({ do: cmd, ...a }) })).json();
  return await (await fetch(`${base}/__wraith/bot/reply?id=${id}&wait=280000`)).json();
};
const S = createWorldSampler();

// Where each encounter's place is, and the way the Wraith comes to it (the bearing it arrives from, rad, world heading).
const info = (await bot('eval', { js: `const o = {}; for (const id in g.encounters) { const e = g.encounters[id], pl = g.chapter.table[e.at]; o[id] = { at: e.at, x: pl.pos[0], z: pl.pos[1], near: e.near }; } return o;` })).result;
const FROM = { cloister: 3.45 + 3.14, 'camp-raid': 0.6, 'varo-hounds': 5.6, 'spring-hounds': 1.2, 'escort-ambush': 1.3, den: 3.14, 'stair-wardens': 5.2, 'ring-ambush': 5.0 };
// Explicit starts where the 36 m ring is walled in (Hearn's streets at the foot of the stair): the end of the main road.
const START = { 'stair-wardens': [136, 883] };
function startFor(id) {
  if (START[id]) return START[id];
  const { x, z } = info[id], want0 = FROM[id] ?? 0; let best = null, bd = 1e9;
  for (let k = 0; k < 24; k++) {
    const a = want0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12), px = x + Math.sin(a) * 36, pz = z + Math.cos(a) * 36;
    if (S.slope(px, pz) > 0.35) continue;
    const d = Math.abs(((a - want0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (d < bd || !best) { best = [px, pz]; bd = d; break; }
  }
  return best || [x + 36, z];
}

const fighterJs = (cfg) => `
  const CFG = ${JSON.stringify(cfg)};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), frame = () => new Promise((r) => requestAnimationFrame(r));
  const flags = g.chapter.graph.flags, e = g.encounters[CFG.id], inv = g.inventory;
  g.game.killShaped(); flags.delete('cleared:' + CFG.id); flags.delete('fighting:' + CFG.id);
  g.endEncounter(CFG.id); g.calm.reset();
  g.encounterLog.reset();
  g.clock.pinHour = CFG.hour;
  g.game.teleport(CFG.x, CFG.z);
  for (let i = 0; i < 300 && !g.game.worldSettled(); i++) await sleep(100);
  await sleep(1500);
  inv.give(CFG.weapon); inv.equip(CFG.weapon);
  g.weapons.machine.reset(); g.combat.health = g.combat.maxHealth; g.combat.focus = 100; g.combat.dying = 0; g.flow.reset(true);
  g.elements.select('frost');
  g.arm.yaw = Math.atan2(CFG.px - g.controller.pos.x, CFG.pz - g.controller.pos.z);
  g.startEncounter(CFG.id);
  const def = g.weapons.def, reach = def.combo[0].reach;
  const S = { STALK: 2, TELEGRAPH: 3, LUNGE: 4 };
  const held = { Primary: false, MoveForward: false, MoveBack: false };
  const set = (n, d) => { if (held[n] !== d) { held[n] = d; w.inject(n, d); } };
  const tap = (n, ms) => { w.inject(n, true); setTimeout(() => w.inject(n, false), ms); };
  const t0 = g.clock.simTime, h0 = g.combat.health;
  let heavyT = 0, tapT = 0, dodged = -9, downSince = -1, sweepT = -9, sweeps = 0, crystalT = -9, crystals = 0, started = false, deathsSeen = 0, wasDying = false;
  const shapedSlots = g.shaped.slots;
  while (true) {
    const now = g.clock.simTime, p = g.controller.pos;
    if (flags.has('cleared:' + CFG.id)) break;
    if (now - t0 > CFG.timeout) break;
    if (g.combat.dying > 0) { set('Primary', false); set('MoveForward', false); set('MoveBack', false); wasDying = true; await frame(); continue; }
    if (wasDying) { wasDying = false; deathsSeen++; g.combat.focus = 100; }
    let best = -1, bd = 1e9;
    for (let i = 0; i < shapedSlots.length; i++) {
      if (!g.shaped.isLive(i)) continue;
      const b = shapedSlots[i].body, d = Math.hypot(b.sx[1] - p.x, b.sz[1] - p.z);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) {
      // Between waves, or the place has not risen yet: hold still and let the next rising come (walk up if it has not begun).
      set('Primary', false); set('MoveBack', false);
      if (e.wave < 0) { const pl = g.chapter.table[e.at]; g.arm.yaw = Math.atan2(pl.pos[0] - p.x, pl.pos[1] - p.z); set('MoveForward', Math.hypot(pl.pos[0] - p.x, pl.pos[1] - p.z) > 20); } else set('MoveForward', false);
      await frame(); continue;
    }
    started = true;
    const b = shapedSlots[best].body;
    g.arm.yaw = Math.atan2(b.sx[1] - p.x, b.sz[1] - p.z);
    const m = g.weapons.machine;
    set('MoveForward', bd > reach * 0.72 + 0.3 && !m.busy);
    set('MoveBack', bd < 0.8 && !m.busy);
    let threat = false;
    for (let i = 0; i < shapedSlots.length; i++) { if (!g.shaped.isLive(i)) continue; const q = shapedSlots[i], qb = q.body; if ((q.state === S.TELEGRAPH || q.state === S.LUNGE) && Math.hypot(qb.sx[1] - p.x, qb.sz[1] - p.z) < 4.2) threat = true; }
    if (threat && now - dodged > 0.9 && m.phase !== 1 && m.phase !== 3) { dodged = now; tap('Dodge', 50); }
    // Armoured foes (brute, den mother): Crystallize (F) freezes them 3-10 m off, so the next heavy shatters.
    const arch = shapedSlots[best].arch;
    if (CFG.kit !== 'staff' && (arch === 'denmother' || arch === 'brute') && bd > 2.5 && bd < 10 && now - crystalT > 4 && g.combat.focus >= 30 && !g.shaped.isFrozen(best) && !m.busy) { crystalT = now; crystals++; tap('Heavy', 60); }
    if (CFG.kit !== 'staff' && bd > 4 && bd < 13 && now - sweepT > 1.1 && g.combat.focus >= 14 && !m.busy) { sweepT = now; sweeps++; tap('Bend', 45); }
    if (bd < reach + 0.4) {
      if (now - heavyT > 3.5) {
        if (m.phase === 0 && downSince < 0) { set('Primary', true); downSince = now; }
        if (downSince >= 0 && now - downSince > 0.55) { set('Primary', false); downSince = -1; heavyT = now; }
      } else if (now - tapT > 0.2 && downSince < 0) { tapT = now; tap('Primary', 45); }
    } else if (downSince >= 0 && now - downSince > 0.55) { set('Primary', false); downSince = -1; }
    await frame();
  }
  set('Primary', false); set('MoveForward', false); set('MoveBack', false);
  const cleared = flags.has('cleared:' + CFG.id);
  if (!cleared) g.encounterLog.end(CFG.id);
  const res = g.encounterLog.results.filter((r) => r.id === CFG.id).pop() || null;
  const left = g.shaped.alive, surv = []; { const p = g.controller.pos; for (let i = 0; i < 8; i++) { const q = shapedSlots[i]; if (q.state === 0) continue; const b = q.body; surv.push([q.arch, q.state, Math.round(b.sx[1]), Math.round(b.sz[1]), Math.round(Math.hypot(b.sx[1] - p.x, b.sz[1] - p.z)), Math.round(q.hp)]); } }
  g.game.killShaped(); g.endEncounter(CFG.id); g.calm.reset();
  return { cleared, res, left, surv: cleared ? undefined : surv, at: [Math.round(g.controller.pos.x), Math.round(g.controller.pos.z)], sweeps, crystals, wall: +(g.clock.simTime - t0).toFixed(1), flowMax: g.flow.tier, hp: +g.combat.health.toFixed(0), deathsSeen };
`;

const ids = want === 'all' ? Object.keys(info) : want.split(',');
fs.mkdirSync(new URL('../../docs/encounter-runs/', import.meta.url), { recursive: true });
const out = new URL(`../../docs/encounter-runs/${label}.jsonl`, import.meta.url);
const all = [];
for (const id of ids) for (const kit of kits) for (let r = 0; r < runs; r++) {
  const [px, pz] = startFor(id);
  const t = Date.now();
  const resp = await bot('eval', { js: fighterJs({ id, kit, x: px, z: pz, px: info[id].x, pz: info[id].z, hour, weapon: kit === 'best' ? 'glaive' : 'staff', timeout: TIMEOUT }) });
  const line = resp.ok === false ? { id, kit, run: r, error: String(resp.error).slice(0, 300) } : { id, kit, run: r, hour, ...resp.result, ms: Date.now() - t };
  all.push(line); console.log(JSON.stringify(line)); fs.appendFileSync(out, JSON.stringify(line) + '\n');
}
// Summary: mean (min-max) per encounter and kit.
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const stat = (xs) => xs.length ? `${f1(xs.reduce((a, b) => a + b, 0) / xs.length)} (${f1(Math.min(...xs))}-${f1(Math.max(...xs))})` : '-';
console.log('\nSUMMARY');
for (const id of ids) for (const kit of kits) {
  const L = all.filter((l) => l.id === id && l.kit === kit && l.res);
  if (!L.length) { console.log(id, kit, 'no results'); continue; }
  console.log(id.padEnd(14), kit.padEnd(6), `cleared ${L.filter((l) => l.cleared).length}/${L.length}`, 'secs', stat(L.map((l) => l.res.secs)), 'taken', stat(L.map((l) => l.res.taken)), 'deaths', L.reduce((a, l) => a + l.res.deaths, 0),
    'starve10', stat(L.map((l) => l.res.starve10 * 100)) + '%', 'flow t2+3', stat(L.map((l) => l.res.tierSecs[2] + l.res.tierSecs[3])), 'maxActive', Math.max(...L.map((l) => l.res.maxActive)), 'engaged', [...new Set(L.flatMap((l) => l.res.engaged))].join('+'));
}
