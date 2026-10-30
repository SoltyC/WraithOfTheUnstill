#!/usr/bin/env node
// Dune fights: WRAITH_URL=http://localhost:4175 node tools/bot/dune-fight.mjs frost|gale skitter:4|plateback:1,skitter:2|plateback:2.
// Fight with a weapon through the bot: an in-page auto-fighter turns to the nearest Shaped, closes to the weapon's
// reach, swings (lights, or heavies) and bend-steps away from telegraphed lunges, and reports hits, time to kill,
// damage taken and Flow.   WRAITH_URL=http://localhost:4177 node tools/bot/fight.mjs <weapon> <light|heavy|mixed> <spawns>
//   spawns: e.g. hound:3 or hound:2,brute:1 (at 7 m ahead, spread);   env: SEED_DIST (m), TIMEOUT (s), FROZEN=1 freezes them first.
const base = process.env.WRAITH_URL || 'http://localhost:4177';
const [, , element = 'frost', spawnArg = 'skitter:4'] = process.argv;
const weapon = 'staff', mode = process.env.MODE || 'light';
const bot = async (cmd, args = {}) => {
  const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify({ do: cmd, ...args }) })).json();
  return await (await fetch(`${base}/__wraith/bot/reply?id=${id}&wait=600000`)).json();
};
const spawns = spawnArg.split(',').map((s) => { const [n, c] = s.split(':'); return [n, +c || 1]; });
await bot('eval',{js:`g.clock.frozen=false;g.game.wraithHeld=false;g.controller.hold=false;g.game.setPlayerVisible(true);g.arm.setFree(false);return true;`});
await bot('teleport', { x: 1900, z: 900 });
await new Promise((r) => setTimeout(r, 3000));
const js = `
  const W = ${JSON.stringify(weapon)}, MODE = ${JSON.stringify(mode)}, SPAWNS = ${JSON.stringify(spawns)}, TIMEOUT = ${+(process.env.TIMEOUT || 60)}, DIST = ${+(process.env.SEED_DIST || 7)}, FROZEN = ${process.env.FROZEN ? 'true' : 'false'};
  const ELEMENT = ${JSON.stringify(element)}; g.elements.unlock(ELEMENT); if (ELEMENT === 'gale') g.elements.unlock('stone'); g.elements.select(ELEMENT);
  const inv = g.inventory; inv.give(W); inv.equip(W);
  g.weapons.machine.reset(); g.combat.health = 100; g.combat.focus = 100; g.combat.dying = 0;
  g.flow.reset(true);
  g.weapons.stats.swings = g.weapons.stats.heavies = g.weapons.stats.hits = g.weapons.stats.damage = g.weapons.stats.shatters = g.weapons.stats.glances = 0;
  g.game.killShaped();
  await new Promise((r) => setTimeout(r, 2500));
  const p = g.controller.pos, f = g.arm.yaw;
  let k = 0, total = 0; for (const [, c] of SPAWNS) total += c;
  const ids = [];
  for (const [name, c] of SPAWNS) for (let q = 0; q < c; q++) {
    const a = f + (k++ - (total - 1) / 2) * 0.55;
    const i = g.shaped.spawn(name, p.x + Math.sin(a) * DIST, p.z + Math.cos(a) * DIST);
    if (i >= 0) ids.push(i);
  }
  await new Promise((r) => setTimeout(r, 2200));
  if (FROZEN) for (const i of ids) g.shaped.freeze(i, 60);
  const def = g.weapons.def, reach = def.combo[0].reach;
  const S = { STALK: 2, TELEGRAPH: 3, LUNGE: 4, STAGGER: 6, FROZEN: 7 };
  const t0 = g.clock.simTime, h0 = g.combat.health;
  const killT = [], alive0 = ids.length;
  let starvedFrames=0,fightFrames=0,maxBlind=0;const frozenSeen=new Set();
  let heavyT = 0, tapT = 0, dodged = 0, downSince = -1, state = 'ready', castAt = -10, ribbonUntil = -1, crystals = 0, gusts = 0, shards = 0, shardAt = -10, stripped = 0, popped = 0;
  const stripSeen = new Set(), popSeen = new Set();
  const held = { Primary: false, MoveForward: false, MoveBack: false };
  const set = (n, d) => { if (held[n] !== d) { held[n] = d; w.inject(n, d); } };
  const tick = () => {
    const now = g.clock.simTime, p = g.controller.pos;fightFrames++;maxBlind=Math.max(maxBlind,g.shaped.blind);for(const i of ids)if(g.shaped.isFrozen(i))frozenSeen.add(i);if(g.combat.focus<14)starvedFrames++;
    let best = -1, bd = 1e9, cnt = 0;
    for (const i of ids) { if (!g.shaped.isLive(i)) continue; cnt++; const b = g.shaped.slots[i].body, d = Math.hypot(b.sx[1] - p.x, b.sz[1] - p.z); if (d < bd) { bd = d; best = i; } }
    for (const i of ids) { if (!g.shaped.isLive(i) && !killT[ids.indexOf(i)]) killT[ids.indexOf(i)] = +(now - t0).toFixed(2); }
    if (best < 0 || now - t0 > TIMEOUT) { set('Primary', false); set('MoveForward', false); set('MoveBack', false); w.inject('Bend', false); state = 'done'; return; }
    for (const i of ids) { const q = g.shaped.slots[i]; if (q.arch === 'plateback') { if (q.st.seamK === 0 && !stripSeen.has(i)) { stripSeen.add(i); stripped++; } if (q.st.plateOff && !popSeen.has(i)) { popSeen.add(i); popped++; } } }
    g.combat.lock=best; // Use the normal lock-on aim for material answers.
    const s = g.shaped.slots[best], b = s.body;
    g.arm.yaw = Math.atan2(b.sx[1] - p.x, b.sz[1] - p.z);
    const m = g.weapons.machine;
    if (ELEMENT === 'gale' && s.arch === 'plateback' && s.st.seamK === 0 && !s.st.plateOff && bd < 12 && now - shardAt > 3 && g.combat.focus > 10) {
      g.elements.select('stone'); w.inject('Bend', true); setTimeout(() => w.inject('Bend', false), 80); shardAt = now; shards++;
    }
    if (ELEMENT === 'gale' && now - shardAt > 1) g.elements.select('gale');
    if (ribbonUntil > 0 && now >= ribbonUntil) { w.inject('Bend', false); ribbonUntil = -1; w.inject('Heavy', true); setTimeout(() => w.inject('Heavy', false), 50); crystals++; }
    if (ribbonUntil < 0 && bd < 8 && now - castAt > 5 && now - shardAt > 1 && g.combat.focus > 40 && !m.busy) {
      castAt = now;
      if (ELEMENT === 'frost') { w.inject('Bend', true); ribbonUntil = now + 0.8; }
      else { w.inject('Bend', true); setTimeout(() => w.inject('Bend', false), 80); gusts++; }
    }

    const want = reach * 0.72;
    set('MoveForward', bd > want + 0.3 && !m.busy);
    set('MoveBack', bd < 0.8 && !m.busy);
    // Dodge a lunge: any Shaped within 4 m telegraphing, while not in a charge or windup.
    let threat = false;
    for (const i of ids) { if (!g.shaped.isLive(i)) continue; const q = g.shaped.slots[i], qb = q.body; if ((q.state === S.TELEGRAPH || q.state === S.LUNGE) && Math.hypot(qb.sx[1] - p.x, qb.sz[1] - p.z) < 4.2) threat = true; }
    if (threat && now - dodged > 0.9 && m.phase !== 1 && m.phase !== 3) { dodged = now; w.inject('Dodge', true); setTimeout(() => w.inject('Dodge', false), 50); }
    if (bd < reach + 0.4) {
      const heavyNow = MODE === 'heavy' || (MODE === 'mixed' && (g.shaped.isFrozen(best)||now - heavyT > 3.5));
      if (heavyNow) {
        if (m.phase === 0 && downSince < 0) { set('Primary', true); downSince = now; }
        if (downSince >= 0 && now - downSince > 0.55) { set('Primary', false); downSince = -1; heavyT = now; }
      } else if (now - tapT > 0.2 && downSince < 0) { tapT = now; w.inject('Primary', true); setTimeout(() => w.inject('Primary', false), 45); }
    } else if (downSince >= 0 && now - downSince > 0.55) { set('Primary', false); downSince = -1; }
    for (const i of ids) { if (!g.shaped.isLive(i) && !killT[ids.indexOf(i)]) killT[ids.indexOf(i)] = +(now - t0).toFixed(2); }
  };
  while (state !== 'done') { tick(); await new Promise((r) => requestAnimationFrame(r)); }
  const st = g.weapons.stats, now = g.clock.simTime;
  return { frozenTargets:frozenSeen.size,frozenArchetypes:Array.from(frozenSeen,i=>g.shaped.slots[i].arch),maxBlind,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,starvedShare:starvedFrames/Math.max(1,fightFrames),element: ELEMENT, crystals, gusts, shards, stripped, popped, weapon: W, mode: MODE, spawns: SPAWNS, seconds: +(now - t0).toFixed(1), killed: ids.filter((i) => !g.shaped.isLive(i)).length + '/' + alive0, killT, damageTaken: +(h0 - g.combat.health).toFixed(1), hp: +g.combat.health.toFixed(0),
    swings: st.swings, heavies: st.heavies, hits: st.hits, dmgDealt: +st.damage.toFixed(0), shatters: st.shatters, glances: st.glances, dodges: g.flow.counts[5], flowHits: [g.flow.counts[0], g.flow.counts[1], g.flow.counts[2]], flowTierSecs: Array.from(g.flow.timeAt, (x) => +x.toFixed(1)), flowMax: g.flow.tier };
`;
const r = await bot('eval', { js });
console.log(JSON.stringify(r.result ?? r, null, 0));
