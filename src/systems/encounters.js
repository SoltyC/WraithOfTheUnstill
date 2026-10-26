// Shaped encounters the quests arm (user request 2026-10-09: quests that are fights, not errands):
// each belongs to a quest step (and optionally a flag), rises when the Wraith comes near its place,
// and comes in waves — the next rising a moment after the last is broken. The quests read
// `encounter:<id>:clear` and the flag `cleared:<id>`. Respects the ≤ 8 Shaped cap (BRIEF §10).
// Also: death re-forms the Wraith at the nearest place it has made safe — a rested shrine, the
// pilgrims' fire once defended, the arena's brazier once lit.
// Calm after peaks (systems/calm.js): no new rising within 120 m for 60 s after a clear, a Warden release or a re-form.

import { createCalm } from './calm.js';
import { worldState } from '../game/worldState.js';

/**
 * Spawns are [archetype, angle (rad, from the direction given by `from`), radius (m)].
 * `from`: 'player' (round the line from the place to the Wraith: they rise ahead of it) or a
 * heading in radians (the monastery's front).
 */
export const ENCOUNTERS = {
  cloister: { quest: 'empty-robe', step: 'cloister', at: 'monastery', name: 'Below the steps', fromFacing: true, near: 70, arena: 'ruins', kind: 'ambush',
    waves: [[['hound', -0.35, 27], ['hound', 0.35, 27]], [['seer', 0, 32]]] },
  'camp-raid': { quest: 'pilgrims-fire', step: 'defend', at: 'camp-frost', name: 'The pilgrims\' fire', near: 80, arena: 'slope', kind: 'storm surge', weather: 'blizzard',
    waves: [[['hound', -0.6, 14], ['hound', 0, 16], ['hound', 0.6, 14]], [['brute', 0, 18], ['hound', -0.9, 15], ['hound', 0.9, 15]]] },
  'varo-hounds': { quest: 'watching-stone', step: 'rescue', at: 'varo-rise', name: 'Round the watching stone', near: 70, arena: 'slope', kind: 'guarded site',
    waves: [[['hound', -0.7, 12], ['hound', 0, 14], ['hound', 0.7, 12]], [['seer', 0, 20], ['hound', 1.2, 12]]] },
  'spring-hounds': { quest: 'trail-in-snow', step: 'guard', at: 'spring-frost', name: 'At the spring', near: 60, arena: 'ice', kind: 'guarded site',
    waves: [[['hound', -2.4, 9], ['hound', 2.4, 9]], [['seer', 3.1, 22]]] },
  'escort-ambush': { quest: 'trail-in-snow', step: 'home', flag: 'escorting', at: 'tarn-crossing', name: 'On the tarn', near: 40, arena: 'ice', kind: 'ambush',
    waves: [[['hound', 0.9, 16], ['hound', -0.9, 16]], [['brute', 0, 20]]] },
  den: { quest: 'den-mother', step: 'den', at: 'den-frost', name: 'The den', near: 60, arena: 'cliffs', kind: 'hunt',
    waves: [[['hound', -0.6, 11], ['hound', 0, 13], ['hound', 0.6, 11]], [['brute', 0.3, 13], ['hound', -1, 11], ['hound', 1.4, 11]], [['denmother', 0, 9]]] },
  // The meadow (none before the audit, docs/encounter-audit.md): the hedge guards the stair, and the Ring of Nine is held.
  'stair-wardens': { quest: 'meadow-the-burning-night', step: 'manor', at: 'stair-foot', name: 'The foot of the stair', near: 60, arena: 'slope', kind: 'guarded site',
    waves: [[['hedgewarden', -0.5, 11], ['sedgerunner', 0.8, 13]], [['chanter', 0, 14], ['sedgerunner', -1, 12]]] },
  'ring-ambush': { quest: 'meadow-side-stone', step: 'go', at: 'side-stone-ring', name: 'The Ring of Nine', near: 50, arena: 'ruins', kind: 'ambush',
    waves: [[['sedgerunner', -0.6, 16], ['sedgerunner', 0.6, 18], ['chanter', 0, 26]], [['hedgewarden', 0, 18]]] },
};
/** Role of each archetype (§4.1): the test and the audit count these. */
export const ROLES = { hound: 'swarmer', sedgerunner: 'swarmer', brute: 'bruiser', hedgewarden: 'bruiser', seer: 'caster', chanter: 'caster', denmother: 'elite' };
/** The encounters in the order a player meets them, with the Warden frenzies that close each biome's main path (kinds in a row must differ). */
export const ROUTES = {
  'frost-main': ['cloister', 'camp-raid', 'varo-hounds', 'frenzy:frost-warden'],
  'frost-trail': ['spring-hounds', 'escort-ambush', 'den'],
  'meadow-main': ['stair-wardens', 'frenzy:bellwether'],
  'meadow-side': ['side-flock', 'ring-ambush'],
};
/** Not in ENCOUNTERS: their kinds, and the ones allowed to be one role alone (a lure that rises at night). */
export const EXTRA_KINDS = { 'frenzy:frost-warden': 'frenzy', 'frenzy:bellwether': 'frenzy', 'side-flock': 'hunt' };
export const SOLO_OK = ['flame-prey'];
const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

/** @param {any} g  shared boot context */
export function addEncounterSystem(g) {
  const { loop, controller, chapter, hud, music, shaped, shapedMod, combat, clock, capture } = g;
  const graph = chapter.graph, flags = graph.flags, table = chapter.table;
  for (const id in ENCOUNTERS) Object.assign(ENCOUNTERS[id], { id, slots: [], wave: -1, gap: 0, biome: table[ENCOUNTERS[id].at]?.biome ?? (ENCOUNTERS[id].quest.startsWith('meadow') ? 'meadow' : 'frost') });
  const calm = g.calm = createCalm(clock);
  g.startEncounter = (id) => { const e = ENCOUNTERS[id]; if (e) e.force = true; };
  /** Stand an encounter down without a clear (a load, the bot): slots forgotten, its weather released. */
  function reset(e) {
    e.slots.length = 0; e.wave = -1; e.force = false; e.gap = 0; flags.delete('fighting:' + e.id);
    if (e.weatherSet) { e.weatherSet = false; if (worldState.weatherOverride === e.weather) worldState.weatherOverride = null; }
  }
  g.endEncounter = (id) => { const e = ENCOUNTERS[id]; if (e) reset(e); };
  function stepOf(q) { const st = graph.quests[q]; if (!st || st.state !== 'active') return null; return graph.byId.get(q).steps[st.step]?.id ?? null; }

  function spawnWave(e, p) {
    const pl = table[e.at], px = pl.pos[0], pz = pl.pos[1];
    const base = e.heading !== undefined ? e.heading : e.fromFacing ? (pl.facing ?? 0) : Math.atan2(p.x - px, p.z - pz);
    for (const [name, a, r] of e.waves[e.wave]) {
      const k = shaped.spawn(name, px + Math.sin(base + a) * r, pz + Math.cos(base + a) * r);
      if (k >= 0) e.slots.push(k);
    }
  }
  function tick(dt) {
    const p = controller.pos;
    for (const id in ENCOUNTERS) {
      const e = ENCOUNTERS[id];
      if (flags.has('cleared:' + id)) continue;
      const pl = table[e.at]; if (!pl) continue;
      if (e.wave < 0) {
        if (!(e.force || (stepOf(e.quest) === e.step && (!e.flag || flags.has(e.flag))))) continue;
        if (dist2(p.x, p.z, pl.pos[0], pl.pos[1]) > e.near * e.near) continue;
        if (!e.force && calm.holds(pl.pos[0], pl.pos[1])) continue;
        // A storm surge: the weather turns for the fight (unless a photo spot or the overlay already holds it).
        if (e.weather && !worldState.weatherOverride) { worldState.weatherOverride = e.weather; e.weatherSet = true; }
        e.wave = 0; spawnWave(e, p); flags.add('fighting:' + id); g.encounterLog.begin(id);
        if (!capture) { hud.notice('Shaped', e.name, e.biome === 'meadow' ? 'Gust them, cut them, or leave the hedge to its ground.' : 'Freeze them, Sweep them, or lose them in the snow.', 5); music.sting('echo'); }
        continue;
      }
      for (let i = e.slots.length - 1; i >= 0; i--) {
        const st = shaped.slots[e.slots[i]].state;
        if (st === shapedMod.S.EMPTY || st === shapedMod.S.FALLING) e.slots.splice(i, 1);
      }
      if (e.slots.length > 0) { e.gap = 0; continue; }
      // A wave broken: the next rises after a breath; the last one clears the place.
      if (e.wave + 1 < e.waves.length) {
        e.gap += dt;
        if (e.gap > 1.8) {
          e.wave++; e.gap = 0; spawnWave(e, p);
          if (!capture) hud.notice('Shaped', e.wave + 1 === e.waves.length && id === 'den' ? 'The den mother' : 'More rise', e.wave + 1 === e.waves.length && id === 'den' ? 'Her rime turns blows aside. Freeze her first.' : null, 5);
        }
        continue;
      }
      flags.add('cleared:' + id); reset(e); calm.note(pl.pos[0], pl.pos[1]);
      chapter.raise('encounter:' + id + ':clear'); g.encounterLog.end(id);
      if (!capture) hud.notice('Quiet', e.name + ' cleared', null, 4);
    }
  }

  // ── Death re-forms at the nearest safe place ───────────────────────────────────────────────
  const shrineIds = [];
  for (let k = 1; k <= 5; k++) shrineIds.push('shrine-frost-' + k);
  for (const p of g.pois) if (p.kind === 'shrine' && p.biome === 'meadow') shrineIds.push(p.id);
  g.setRespawn = (t) => { combat.shrineX = t.x + 2.5; combat.shrineZ = t.z - 2.5; };
  let wasDying = false;
  function respawnTick() {
    const dying = combat.dying > 0;
    if (dying && !wasDying) {
      // Where it fell: the nearest place it has made safe.
      const p = controller.pos;
      let best = 1e18, bx = combat.shrineX, bz = combat.shrineZ;
      const consider = (x, z, ox, oz) => { const d = dist2(p.x, p.z, x, z); if (d < best) { best = d; bx = x + ox; bz = z + oz; } };
      for (const id of shrineIds) if (chapter.shrines.has(id)) { const s = table[id].pos; consider(s[0], s[1], 2.5, -2.5); }
      if (flags.has('camp-hearth')) { const c = table['camp-frost'].pos; consider(c[0], c[1], 4, 6); }
      if (flags.has('lit:brazier-4') && table['warden-brazier']) { const b = table['warden-brazier'].pos; consider(b[0], b[1], 2, 2); }
      if (best < 1e18) { combat.shrineX = bx; combat.shrineZ = bz; }
    }
    if (wasDying && !dying) calm.note(controller.pos.x, controller.pos.z);   // re-formed: a breath before anything rises near
    wasDying = dying;
  }

  const navSync = g.navSync;
  g.navSync = () => { navSync?.(); for (const id in ENCOUNTERS) reset(ENCOUNTERS[id]); calm.reset(); };
  g.encounters = ENCOUNTERS;

  loop.add({ name: 'encounters', update: () => { tick(clock.dt); respawnTick(); } });
}
