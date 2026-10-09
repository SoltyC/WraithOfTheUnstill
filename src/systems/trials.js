// The things to do on the frost steppe that are not fights (encounters.js), Echo-stone gestures
// (echoTrials.js) or the carried flame (flame.js): the Shapers' Run (nine gates down the chute,
// timed; best time kept for its medals; the Warden first seen from gate five), the verb stones in
// the monastery hall (cast the stone's verb so it lands on the stone), the overturned sled and the
// hound tracks from it to the den, and the monastery bell. The quests read all of it as events
// (`use:<id>`, `run:done`), flags (`used:<id>`, `lit:<site>`) and variables (`run.gates`,
// `run.best`, `verbStones`; medals at 31 / 26.5 / 23 s, set from scripted rides of the chute at
// ~21 s on the racing line, 2026-10-09); the compass reads the dynamic goals registered here. No story lives
// here — it is data/quests/frost.json.

const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

/** @param {any} g  shared boot context */
export function addTrialsSystem(g) {
  const { loop, controller, chapter, nav, hud, music, frost, clock, footprints, sfx, SFX, capture } = g;
  const graph = chapter.graph, flags = graph.flags, vars = graph.vars, table = chapter.table;
  const siteById = new Map((g.archSites || []).map((s) => [s.id, s]));
  const gate = { x: 0.5, z: 0.5, name: '' };
  const targets = g.interactables;

  // ── The Shapers' Run ───────────────────────────────────────────────────────────────────────
  const run = (g.routes || []).find((r) => r.id === 'shapers-run');
  const gates = run ? run.gates : [];
  let gi = 0, t0 = 0;
  function runTick(p) {
    if (gates.length === 0) return;
    if (g.musicState) g.musicState.run = gi > 0;
    const gt = gates[gi];
    if (gi > 0 && !capture) hud.line('run', 'Gate ' + (gi + 1) + ' of ' + gates.length + ' · ' + (clock.simTime - t0).toFixed(1) + ' s');
    if (dist2(p.x, p.z, gt.pos[0], gt.pos[1]) < 64) {
      if (gi === 0) t0 = clock.simTime;
      flags.add('lit:run-gate-' + (gi + 1));
      gi++;
      vars['run.gates'] = Math.max(vars['run.gates'] || 0, gi);
      if (gi >= gates.length) {
        const secs = clock.simTime - t0, prev = vars['run.best'];
        vars['run.time'] = Math.round(secs * 10) / 10;
        if (prev === undefined || secs < prev) vars['run.best'] = Math.round(secs * 10) / 10;
        gi = 0;
        chapter.raise('run:done');
        hud.line('run', '');
        if (!capture) hud.notice('The Shapers\' Run', secs.toFixed(1) + ' seconds', prev === undefined || secs < prev ? 'Your best. Gold is under 23, silver under 26.5, bronze under 31.' : 'Best: ' + prev.toFixed(1) + ' s', 6);
      }
    } else if (gi > 1 && dist2(p.x, p.z, gates[0].pos[0], gates[0].pos[1]) < 100) { gi = 1; t0 = clock.simTime; } // back at the top: begin again
    else if (gi > 0 && dist2(p.x, p.z, gates[gi - 1].pos[0], gates[gi - 1].pos[1]) > 150 * 150) { gi = 0; hud.line('run', ''); } // lost the line
  }
  g.navDynamic['next-gate'] = () => {
    if (gates.length === 0) return null;
    const gt = gates[gi]; gate.x = gt.pos[0]; gate.z = gt.pos[1]; gate.name = 'Gate ' + (gi + 1) + ' of ' + gates.length; return gate;
  };

  // ── The Warden's next weak point (the compass follows it during the fight) ─────────────────
  const arena = nav.byId.get('warden-frost'), wj = { x: 0.5, z: 0.5, name: 'The Held Snow' };
  g.navDynamic['warden-joint'] = () => {
    const w = g.warden, k = w.active && w.state > 0 ? g.wardenTarget?.() ?? -1 : -1;
    if (k < 0) { if (!arena) return null; wj.x = arena.x; wj.z = arena.z; wj.name = 'The Held Snow'; return wj; }
    wj.x = w.jx[k]; wj.z = w.jz[k]; wj.name = 'The Warden\'s ' + w.jointName(k); return wj;
  };
  // Quest places that are not baked POIs (data/quests/frost.json `places`).
  for (const id of ['sled-wreck', 'seedling', 'tarn-crossing', 'warden-brazier']) {
    const pl = table[id]; if (!pl) continue;
    const goal = { x: pl.pos[0], z: pl.pos[1], name: pl.name || '' };
    g.navDynamic['place:' + id] = () => goal;
  }

  // ── Verb stones: cast the stone's verb so that it lands on the stone ───────────────────────
  const verbStones = ['crystal', 'sweep', 'ribbon'].map((v) => ({ id: 'gesture-' + v, verb: v, site: siteById.get('gesture-' + v) })).filter((v) => v.site);
  const gz = { x: 0.5, z: 0.5, name: 'A verb stone' };
  g.navDynamic.gesture = () => {
    for (const v of verbStones) if (!flags.has('used:' + v.id)) { gz.x = v.site.at[0]; gz.z = v.site.at[1]; gz.name = 'The ' + (v.verb === 'crystal' ? 'Crystallize' : v.verb === 'sweep' ? 'Sweep' : 'Ribbon') + ' stone'; return gz; }
    return null;
  };
  function verbOn(v) {
    const sx = v.site.at[0], sz = v.site.at[1];
    if (v.verb === 'crystal') return frost.crystalEvent && dist2(frost.crystalX, frost.crystalZ, sx, sz) < 4.5 * 4.5;
    if (v.verb === 'ribbon') {
      if (!frost.ribbonHeld) return false;
      const n = frost.ribbonNodes;
      for (let k = 0; k < n.length; k += 4) if (n[k + 3] > 0.05 && dist2(n[k], n[k + 2], sx, sz) < 1.6 * 1.6) return true;
      return false;
    }
    for (let k = 0; k < frost.sweepActive.length; k++) {
      if (!frost.sweepActive[k]) continue;
      if (dist2(frost.sweepFX[k], frost.sweepFZ[k], sx, sz) < (frost.sweepHW[k] + 1.4) * (frost.sweepHW[k] + 1.4)) return true;
    }
    return false;
  }
  let stoneHint = 0;
  function verbTick(p) {
    let near = null;
    for (const v of verbStones) {
      if (flags.has('used:' + v.id)) continue;
      if (dist2(p.x, p.z, v.site.at[0], v.site.at[1]) > 16 * 16) continue;
      near = v;
      if (!verbOn(v)) continue;
      flags.add('used:' + v.id); flags.add('lit:' + v.id);
      vars.verbStones = (vars.verbStones || 0) + 1;
      chapter.raise('use:' + v.id); music.sting('echo');
      hud.notice('The stone answers', v.verb === 'crystal' ? 'Crystallize' : v.verb === 'sweep' ? 'Sweep' : 'Ribbon', vars.verbStones + ' of 3 woken', 5);
    }
    // While one is in reach: what it wants, once (then only the line).
    if (!capture) hud.line('verb', near ? (near.verb === 'crystal' ? 'Crystallize (F) aimed at the stone' : near.verb === 'sweep' ? 'Sweep (click) through the stone' : 'Ribbon (hold click) onto the stone') : '');
    if (near && stoneHint === 0) stoneHint = 1;
  }

  // ── The overturned sled, and the hounds' tracks from it to the den ─────────────────────────
  const sled = table['sled-wreck'], den = table['den-frost'];
  let sledT = null;
  if (sled) {
    targets.push(sledT = { kind: 'sled', id: 'sled-wreck', verb: 'Examine', name: 'Overturned sled', x: sled.pos[0], y: sled.h ?? 0, z: sled.pos[1], r: 3.6, h: 0.8,
      onUse: () => {
        if (flags.has('used:sled-wreck')) { hud.notice('The sled', 'Torn felt, spilled wood', 'The tracks lead east, up the ridge.', 4); return; }
        flags.add('used:sled-wreck'); chapter.raise('use:sled-wreck');
        nav.visit?.('sled-wreck');
      } });
  }
  // Paired hound prints, a stretch at a time as the Wraith comes near (as the child's trail).
  const SEGS = 14, segPts = [], segFlag = [];
  if (sled && den) {
    for (let k = 0; k < SEGS; k++) {
      const pts = [];
      for (let q = 0; q <= 5; q++) {
        const t = (k + q / 5) / SEGS, dx = den.pos[0] - sled.pos[0], dz = den.pos[1] - sled.pos[1], L = Math.hypot(dx, dz);
        const wob = Math.sin(t * 17) * 9 + Math.sin(t * 41 + 2) * 3;
        pts.push([sled.pos[0] + dx * t - dz / L * wob, sled.pos[1] + dz * t + dx / L * wob]);
      }
      segPts.push(pts); segFlag.push('hound-trail-' + k);
    }
  }
  function trailTick(p) {
    if (!flags.has('used:sled-wreck') || flags.has('cleared:den')) return;
    for (let k = 0; k < segPts.length; k++) {
      if (flags.has(segFlag[k])) continue;
      const a = segPts[k][0], b = segPts[k][5];
      if (dist2((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, p.x, p.z) > 32 * 32) continue;
      footprints.size = 0.42; footprints.stampTrail(segPts[k]); footprints.stampTrail(segPts[k].map((q) => [q[0] + 0.5, q[1] + 0.3]));
      footprints.size = 1;
      flags.add(segFlag[k]);
    }
  }

  // ── The bell before the monastery's door ───────────────────────────────────────────────────
  const mon = table.monastery;
  if (mon) {
    const f = mon.facing ?? 0, bx = mon.pos[0] + Math.sin(f) * 10.5, bz = mon.pos[1] + Math.cos(f) * 10.5;
    const bell = { kind: 'bell', id: 'bell', verb: 'Ring', name: 'The bell', x: bx, y: 0, z: bz, r: 3.4, h: 2.2,
      onUse: () => {
        sfx.x = bx; sfx.y = bell.y + 4; sfx.z = bz; sfx.gain = 2;
        sfx.play(SFX.BOOM); sfx.play(SFX.CHIME); sfx.play(SFX.CHIME);
        g.arm.shake += 0.01;
        flags.add('used:bell'); chapter.raise('use:bell');
      } };
    targets.push(bell);
    const bellGoal = { x: bx, z: bz, name: 'The bell' };
    g.navDynamic.bell = () => bellGoal;
    // Its height comes from the monastery's seat.
    const mi = (g.archSites || []).findIndex((s) => s.id === 'monastery');
    const si = (g.archSites || []).findIndex((s) => s.id === 'sled-wreck'), A = g.architecture.sites;
    loop.add({ name: 'seats', update: () => {
      if (mi >= 0 && A[mi * 4 + 3] > 0.5) bell.y = A[mi * 4 + 1] + 0.35;
      if (sledT && si >= 0 && A[si * 4 + 3] > 0.5) sledT.y = A[si * 4 + 1];
    } });
  }

  const navSync = g.navSync;
  g.navSync = () => { navSync?.(); gi = 0; };

  loop.add({ name: 'trials', update: () => {
    const p = controller.pos;
    runTick(p);
    verbTick(p);
    if (!capture && (clock.frame & 15) === 0) trailTick(p);
  } });
}
