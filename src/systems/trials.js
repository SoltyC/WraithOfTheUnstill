// The things to do on the frost steppe (user decision 2026-10-08, DECISIONS.md): the Shapers' Run
// (nine gates down the chute, timed), the verb stones in the monastery hall (cast the verb at the
// stone), Echo stones (listen: lore, a step toward an Echo), braziers (light them), Shaped
// encounters armed by the quest step that wants them, and death re-forming at the last shrine.
// The quests read all of it as events (`use:<id>`, `run:done`, `encounter:<id>:clear`), flags
// (`used:<id>`, `lit:<site>`) and variables (`run.gates`, `run.fast`, `stones`); the compass reads the
// dynamic goals registered here. No story lives here — it is data/quests/frost.json.

/** Encounters: the quest step that arms one, where, and what rises (world offsets from the site). */
const ENCOUNTERS = {
  'varo-hounds': { quest: 'held-snow', step: 'ridge', at: 'varo-rise', name: 'Hounds on the ridge',
    spawn: [['hound', -12, 10], ['hound', 12, 12], ['hound', 0, 18]] },
  den: { quest: 'hounds-of-the-ridge', step: 'hunt', at: 'den-frost', name: 'The den',
    spawn: [['hound', -8, 8], ['hound', 8, 9], ['hound', 0, -10], ['brute', 0, 14]] },
};
const FAST_RUN_SECONDS = 38;
const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

/** @param {any} g  shared boot context */
export function addTrialsSystem(g) {
  const { loop, controller, chapter, nav, hud, music, shaped, shapedMod, frost, combat, clock, capture } = g;
  const graph = chapter.graph, flags = graph.flags, vars = graph.vars;
  const siteById = new Map((g.archSites || []).map((s) => [s.id, s]));
  const gate = { x: 0.5, z: 0.5, name: '' };

  // ── The Shapers' Run ───────────────────────────────────────────────────────────────────────
  const run = (g.routes || []).find((r) => r.id === 'shapers-run');
  const gates = run ? run.gates : [];
  let gi = 0, t0 = 0;
  function runTick(p) {
    if (gates.length === 0) return;
    if (g.musicState) g.musicState.run = gi > 0;
    const gt = gates[gi];
    if (dist2(p.x, p.z, gt.pos[0], gt.pos[1]) < 64) {
      if (gi === 0) { t0 = clock.simTime; g.music.rearm('run'); }
      flags.add('lit:run-gate-' + (gi + 1));
      gi++;
      vars['run.gates'] = Math.max(vars['run.gates'] || 0, gi);
      if (gi >= gates.length) {
        const secs = clock.simTime - t0;
        vars['run.time'] = Math.round(secs);
        if (secs <= FAST_RUN_SECONDS) vars['run.fast'] = 1;
        gi = 0;
        chapter.raise('run:done');
        if (!capture) hud.notice('The Shapers\' Run', Math.round(secs) + ' seconds', secs <= FAST_RUN_SECONDS ? 'Every gate. The snow remembers the line.' : 'Every gate. Faster is possible.', 6);
      } else if (!capture) music.sting('echo');
    } else if (gi > 1 && dist2(p.x, p.z, gates[0].pos[0], gates[0].pos[1]) < 100) gi = 1;           // back at the top: begin again
    else if (gi > 0 && dist2(p.x, p.z, gates[gi - 1].pos[0], gates[gi - 1].pos[1]) > 150 * 150) gi = 0; // lost the line (died, walked off)
  }
  g.navDynamic['next-gate'] = () => {
    if (gates.length === 0 || (flags.has('lit:run-gate-' + gates.length) && !flags.has('run-again'))) return null;
    const gt = gates[gi]; gate.x = gt.pos[0]; gate.z = gt.pos[1]; gate.name = 'Gate ' + (gi + 1) + ' of ' + gates.length; return gate;
  };

  // ── Interactables ──────────────────────────────────────────────────────────────────────────
  const targets = g.interactables;
  const stones = [], braziers = [];
  let loreN = 0;
  for (const pl of nav.places) {
    if (pl.kind !== 'echo-stone') continue;
    const t = { kind: 'stone', id: pl.id, verb: 'Listen', name: 'Echo stone', x: pl.x, y: pl.y, z: pl.z, r: 3.6, h: 1.2, hidden: true, place: pl, n: ++loreN,
      onUse: () => {
        if (flags.has('visited:' + pl.id)) { hud.notice('Echo stone', 'Quiet now', null, 3); return; }
        nav.visit(pl.id); flags.add('lit:' + pl.id); flags.add('used:' + pl.id);
        vars.stones = (vars.stones || 0) + 1;
        chapter.do({ lore: 'lore-' + pl.id });
        chapter.raise('use:' + pl.id);
        music.sting('echo');
      } };
    stones.push(t); targets.push(t);
  }
  for (const id of ['brazier-1', 'brazier-2', 'brazier-3']) {
    const s = siteById.get(id); if (!s) continue;
    const t = { kind: 'brazier', id, verb: 'Light', name: 'Brazier', x: s.at[0], y: 0, z: s.at[1], r: 3.2, h: 1.1,
      onUse: () => {
        if (flags.has('lit:' + id)) return;
        flags.add('lit:' + id); flags.add('used:' + id); vars.braziers = (vars.braziers || 0) + 1;
        chapter.raise('use:' + id); music.sting('echo');
        hud.notice('Brazier', 'The flame leans toward the Warden', vars.braziers + ' of 3 lit', 4);
      } };
    braziers.push(t);
  }
  // Brazier and stone heights come from the ground (set once the site is seated).
  function seatHeights() {
    for (const t of braziers) if (!t.y) { const o = g.archSites.indexOf(siteById.get(t.id)); const y = g.architecture.sites[o * 4 + 1]; if (g.architecture.sites[o * 4 + 3] > 0.5) { t.y = y; targets.push(t); } }
  }
  // Stones that nearest-first hint: the closest unvisited, within sensing of the quest's compass.
  const hint = { x: 0.5, z: 0.5, name: 'An Echo Stone' };
  g.navDynamic['stone-hint'] = () => {
    let best = 1e18, b = null;
    for (const t of stones) { if (flags.has('visited:' + t.id)) continue; const d = dist2(t.x, t.z, nav.px, nav.pz); if (d < best) { best = d; b = t; } }
    if (!b || best > 700 * 700) return null;
    hint.x = b.x; hint.z = b.z; return hint;
  };
  const bz = { x: 0.5, z: 0.5, name: 'A brazier' };
  g.navDynamic.brazier = () => {
    let best = 1e18, b = null;
    for (const t of braziers) { if (flags.has('lit:' + t.id)) continue; const d = dist2(t.x, t.z, nav.px, nav.pz); if (d < best) { best = d; b = t; } }
    if (!b) return null; bz.x = b.x; bz.z = b.z; return bz;
  };

  // ── Verb stones ────────────────────────────────────────────────────────────────────────────
  const verbStones = ['crystal', 'sweep', 'ribbon'].map((v) => ({ id: 'gesture-' + v, verb: v, site: siteById.get('gesture-' + v) })).filter((v) => v.site);
  const gz = { x: 0.5, z: 0.5, name: 'A verb stone' };
  g.navDynamic.gesture = () => {
    for (const v of verbStones) if (!flags.has('used:' + v.id)) { gz.x = v.site.at[0]; gz.z = v.site.at[1]; gz.name = 'The ' + v.verb + ' stone'; return gz; }
    return null;
  };
  function verbActive(v) {
    if (v === 'crystal') return frost.crystalEvent;
    if (v === 'ribbon') return frost.ribbonHeld;
    for (let k = 0; k < frost.sweepActive.length; k++) if (frost.sweepActive[k]) return true;
    return false;
  }
  function verbTick(p) {
    for (const v of verbStones) {
      if (flags.has('used:' + v.id)) continue;
      if (dist2(p.x, p.z, v.site.at[0], v.site.at[1]) > 14 * 14 || !verbActive(v.verb)) continue;
      flags.add('used:' + v.id); flags.add('lit:' + v.id);
      vars.verbStones = (vars.verbStones || 0) + 1;
      chapter.raise('use:' + v.id); music.sting('echo');
      hud.notice('The stone answers', v.verb === 'crystal' ? 'Crystallize' : v.verb === 'sweep' ? 'Sweep' : 'Ribbon', vars.verbStones + ' of 3 woken', 5);
    }
  }

  // ── Encounters ─────────────────────────────────────────────────────────────────────────────
  for (const id in ENCOUNTERS) Object.assign(ENCOUNTERS[id], { id, slots: [], spawned: false, force: false });
  g.startEncounter = (id) => { if (ENCOUNTERS[id]) ENCOUNTERS[id].force = true; };
  function stepOf(q) { const st = graph.quests[q]; if (!st || st.state !== 'active') return null; return graph.byId.get(q).steps[st.step]?.id ?? null; }
  function encounterTick(p) {
    for (const id in ENCOUNTERS) {
      const e = ENCOUNTERS[id];
      if (flags.has('cleared:' + id)) continue;
      const pl = nav.byId.get(e.at); if (!pl) continue;
      if (!e.spawned) {
        if (!(e.force || stepOf(e.quest) === e.step)) continue;
        if (dist2(p.x, p.z, pl.x, pl.z) > 70 * 70) continue;
        for (const [name, dx, dz] of e.spawn) { const k = shaped.spawn(name, pl.x + dx, pl.z + dz); if (k >= 0) e.slots.push(k); }
        e.spawned = e.slots.length > 0;
        if (e.spawned && !capture) { hud.notice('Shaped', e.name, 'Freeze them, sweep them, or lose them in the snow.', 5); music.sting('echo'); }
        continue;
      }
      for (let i = e.slots.length - 1; i >= 0; i--) {
        const st = shaped.slots[e.slots[i]].state;
        if (st === shapedMod.S.EMPTY || st === shapedMod.S.FALLING) e.slots.splice(i, 1);
      }
      if (e.slots.length === 0) {
        flags.add('cleared:' + id); e.spawned = false; e.force = false;
        chapter.raise('encounter:' + id + ':clear');
        if (!capture) hud.notice('Quiet', e.name + ' cleared', null, 4);
      }
    }
  }

  // ── Death re-forms at the last shrine ──────────────────────────────────────────────────────
  g.setRespawn = (t) => { combat.shrineX = t.x + 2.5; combat.shrineZ = t.z - 2.5; };
  const syncRespawn = () => { const k = vars.lastShrine; const pl = k && nav.byId.get('shrine-frost-' + k); if (pl) g.setRespawn({ x: pl.x, z: pl.z }); };
  const navSync = g.navSync;
  g.navSync = () => { navSync?.(); syncRespawn(); gi = 0; for (const id in ENCOUNTERS) { ENCOUNTERS[id].slots.length = 0; ENCOUNTERS[id].spawned = false; ENCOUNTERS[id].force = false; } };

  let seated = false;
  loop.add({ name: 'trials', update: () => {
    const p = controller.pos;
    runTick(p);
    verbTick(p);
    encounterTick(p);
    for (const t of stones) t.hidden = !t.place.known;
    if (!seated || (clock.frame & 63) === 0) { seatHeights(); seated = braziers.every((t) => t.y); }
  } });
}
