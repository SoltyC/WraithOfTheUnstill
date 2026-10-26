#!/usr/bin/env node
// Bell-mace playtests through the bot (docs/mace-design.md §9): in-page scripts that play the weapon with the
// real input actions (Primary in the air = the plunge, Heavy = Updraft, Bend = Gust) and report what the weapon's
// telemetry saw (game/weapons/plunge.js `last` and `stats`).
//   WRAITH_URL=http://localhost:4178 node tools/bot/mace.mjs <test> [args]
//   iso 5,10,14,20      plunge onto an asleep brute from each height (the Wraith is set that high), log h, damage, toll, rebound
//   updraft [n]         Updraft under the Wraith, plunge from inside the column (+4 m), then rebound plunges; plunges per Updraft
//   dunk                Updraft a hound, plunge on it in the air, a second hound near where it lands
//   ice                 Crystallize ice under three frozen hounds, rise, plunge: the star shatters them
//   down                a Downdraft (Gust in the fall): +5 m in the logged h
//   ledge               the Bell Ledge: Updraft up from the hollow, take the mace, plunge down onto the hounds
//   fight <spawns>      the standard fights: rise with Updraft, plunge, rebound, plunge (env TIMEOUT, SEED_DIST; compare fight.mjs)
// The setup place is (1060, 2690) by the monastery unless X, Z are given.
const base = process.env.WRAITH_URL || 'http://localhost:4178';
const [, , test = 'iso', arg = ''] = process.argv;
const bot = async (cmd, args = {}) => {
  const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify({ do: cmd, ...args }) })).json();
  return await (await fetch(`${base}/__wraith/bot/reply?id=${id}&wait=600000`)).json();
};
const X = +(process.env.X || 1060), Z = +(process.env.Z || 2690);

/** Shared prelude, in the page: helpers and a clean, level place. */
const prelude = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const c = g.controller, pl = g.weapons.plunge, S = g.shapedMod.S;
  const press = async (name, ms = 60) => { w.inject(name, true); await sleep(ms); w.inject(name, false); };
  const gy = () => { g.ground.qx = c.pos.x; g.ground.qz = c.pos.z; g.ground.sample(); return g.ground.h; };
  const ready = async (weapon = 'mace') => {
    g.inventory.give(weapon); g.inventory.equip(weapon); g.weapons.machine.reset(); g.weapons.reset();
    g.combat.health = 100; g.combat.focus = 100; g.combat.dying = 0; g.flow.reset(true);
    g.game.killShaped(); await sleep(2500);
    for (const k in pl.stats) pl.stats[k] = 0;
  };
  const snap = () => ({ ...pl.last });
`;

const tests = {
  iso: (heights) => `
    ${prelude}
    ${X < 0 ? '' : `await bot_tp(${X}, ${Z});`}
    const out = [];
    for (const H of ${JSON.stringify(heights)}) {
      await ready();
      const y0 = gy();
      const i = g.shaped.spawn('brute', c.pos.x, c.pos.z + 0.35, { idle: 999 });
      await sleep(3000);
      const hp0 = g.shaped.slots[i].hp;
      c.pos.y = y0 + H; c.vel.x = 0; c.vel.y = 0; c.vel.z = 0; c.grounded = false;
      await frames(3);
      const glow = pl.glow;
      await press('Primary');
      let apex = 0, t0 = performance.now(), landed = false;
      while (performance.now() - t0 < 6000) {
        await frames(1);
        if (!pl.falling && pl.stats.plunges > 0) { landed = true; if (c.vel.y <= 0 && c.pos.y > 0) break; apex = Math.max(apex, c.pos.y - y0); }
      }
      const L = snap();
      out.push({ H, glow: +glow.toFixed(2), h: +L.h.toFixed(2), dmg: +L.dmg.toFixed(1), toll: +L.radius.toFixed(2), rebound: +L.rebound.toFixed(2), reboundApex: +apex.toFixed(2), dealt: +(hp0 - g.shaped.slots[i].hp).toFixed(1), hits: L.hits, flowHeavy: g.flow.counts[1] });
      g.game.killShaped(); await sleep(300);
    }
    return out;
  `,

  // Live combos (docs/mace-design.md §9): each returns the numbers the weapon's telemetry saw. Inputs are the real actions:
  // Heavy = Updraft / Crystallize, Bend = Gust / Sweep (element in hand), Primary = the plunge in the air, Jump held = the glide.
  dunk: () => `
    ${prelude}
    ${X < 0 ? '' : `await bot_tp(${X}, ${Z});`}
    await ready(); g.elements.unlock('gale'); g.elements.select('gale');
    const p = c.pos, y0 = gy(); g.arm.yaw = 0.7;
    // The aim is clamped to a minimum range, so the column rises at the Wraith's own feet: the column stands 3 m ahead: hound a 2.2 m past its axis (inside its reach of 2.6), hound b 2.2 m beyond a (out of reach, inside the dunk's 2.4 m).
    const fx = Math.sin(0.7), fz = Math.cos(0.7), ux = p.x, uz = p.z;
    const a = g.shaped.spawn('hound', p.x + fx * 5.2, p.z + fz * 5.2, { idle: 999 }), b = g.shaped.spawn('hound', p.x + fx * 7.4, p.z + fz * 7.4, { idle: 999 });
    await sleep(1500); const hpA = g.shaped.slots[a].hp, hpB = g.shaped.slots[b].hp;
    g.arm.pitch = 0.95; await press('Heavy', 60); await sleep(150);
    if (!g.shaped.air.isAir(a)) { g.combat.focus = 100; await press('Heavy', 60); await sleep(150); }
    // The Updraft is real (cast, caught, thrown up); the Wraith is then set 9 m above the caught hound (a setup, as in iso) and the plunge is the real input.
    const caught = g.shaped.air.isAir(a); let maxAirY = 0;
    const ab = g.shaped.slots[a].body;
    p.x = ab.sx[1]; p.z = ab.sz[1]; c.pos.y = y0 + 9; c.vel.x = 0; c.vel.y = 0; c.vel.z = 0; c.grounded = false;
    await frames(1); const airYAtPress = +g.shaped.air.y[a].toFixed(1);
    await press('Primary', 50);
    const t0 = performance.now(); while (performance.now() - t0 < 3000 && pl.stats.dunkLands === 0) { await frames(1); if (g.shaped.air.isAir(a)) maxAirY = Math.max(maxAirY, g.shaped.air.y[a]); }
    await sleep(500); const pressed = pl.stats.plunges > 0;
    return { test: 'dunk', col: [+(g.gale.updraftX - ux).toFixed(1), +(g.gale.updraftZ - uz).toFixed(1)], caught, airYAtPress, plunged: pressed, h: +pl.last.h.toFixed(2), dmg: +pl.last.dmg.toFixed(1), dunks: pl.stats.dunks, dunkLands: pl.stats.dunkLands, dunkHits: pl.last.dunkHits,
      hpA: [hpA, g.shaped.slots[a].hp], hpB: [hpB, g.shaped.slots[b].hp], second: +(hpB - g.shaped.slots[b].hp).toFixed(1) };
  `,

  ice: () => `
    ${prelude}
    ${X < 0 ? '' : `await bot_tp(${X}, ${Z});`}
    await ready(); g.elements.unlock('frost'); g.elements.select('frost');
    const p = c.pos, y0 = gy(), f = g.arm.yaw;
    const ids = [3.6, 5.8, 8.0].map((d, k) => g.shaped.spawn('hound', p.x + Math.sin(f) * d, p.z + Math.cos(f) * d + (k - 1) * 0.5, { idle: 999 }));
    await sleep(1500);
    g.arm.pitch = 0.1; await press('Bend', 60); await sleep(900);               // a real Sweep down the lane
    const iceAt = ids.map((i) => { const b = g.shaped.slots[i].body; return g.frost.iceAt(b.sx[1], b.sz[1]); });
    const frozenBefore = ids.map((i) => g.shaped.slots[i].state === 7);
    for (const i of ids) if (g.shaped.slots[i].state !== 7) g.shaped.freeze(i, 60);   // a Sweep that only staggers: freeze them (recorded)
    let shat = 0; g.combat.onShatter = () => { shat++; };
    const mid = g.shaped.slots[ids[1]].body, H = ${+(process.env.H || 8)};
    p.x = mid.sx[1] - Math.sin(f) * 2.5; p.z = mid.sz[1] - Math.cos(f) * 2.5; await frames(2);
    c.pos.y = gy() + H; c.vel.x = 0; c.vel.y = 0; c.vel.z = 0; c.grounded = false; await frames(3);
    g.arm.yaw = f; await press('Primary', 50);
    const t0 = performance.now(); while (performance.now() - t0 < 4000 && pl.stats.plunges < 1) await frames(1);
    await sleep(800);
    return { test: 'ice', H, swept_ice: iceAt, frozenBySweep: frozenBefore, star: pl.last.star, stars: pl.stats.stars, h: +pl.last.h.toFixed(2), shatters: pl.last.shatters, onShatterCalls: shat, live: ids.map((i) => g.shaped.isLive(i)) };
  `,

  down: () => `
    ${prelude}
    ${X < 0 ? '' : `await bot_tp(${X}, ${Z});`}
    await ready(); g.elements.unlock('gale'); g.elements.select('gale');
    const out = [];
    for (const mode of ['plain', 'downdraft']) {
      for (const k in pl.stats) pl.stats[k] = 0;
      c.pos.y = gy() + 10; c.vel.x = 0; c.vel.y = 0; c.vel.z = 0; c.grounded = false; g.combat.focus = 100; await frames(3);
      await press('Primary', 50);
      const t0 = performance.now(); let fired = false;
      while (performance.now() - t0 < 4000 && !(pl.stats.plunges > 0 && !pl.falling)) {
        await frames(1);
        if (mode === 'downdraft' && !fired && pl.falling) { fired = true; await press('Bend', 60); }
      }
      await sleep(400);
      out.push({ mode, h: +pl.last.h.toFixed(2), dmg: +pl.last.dmg.toFixed(1), downdrafts: pl.stats.downdrafts });
      await sleep(1500);
    }
    return { test: 'down', out, plusH: +(out[1].h - out[0].h).toFixed(2) };
  `,

  glide: () => `
    ${prelude}
    ${X < 0 ? '' : `await bot_tp(${X}, ${Z});`}
    await ready();
    const gl = c.glide, p = c.pos, f = g.arm.yaw, y0 = gy();
    for (let d = 4; d <= 20; d += 2) g.shaped.spawn('hound', p.x + Math.sin(f) * d, p.z + Math.cos(f) * d, { idle: 999 });   // a row of sleepers along the glide
    await sleep(1500);
    c.pos.y = y0 + ${+(process.env.H || 18)}; c.vel.x = Math.sin(f) * 12; c.vel.y = -2; c.vel.z = Math.cos(f) * 12; c.grounded = false; await frames(3);
    w.inject('Traverse', true); await sleep(900);
    const glidingBefore = gl.active, hBefore = +pl.hNow.toFixed(1), vBefore = +Math.hypot(c.vel.x, c.vel.z).toFixed(1);
    await press('Primary', 50);
    let t0 = performance.now(), landedAt = -1, reglideAt = -1, blockedSeen = false;
    while (performance.now() - t0 < 7000) {
      await frames(1);
      if (pl.stats.rebounds > 0 && landedAt < 0) landedAt = performance.now() - t0;
      if (landedAt >= 0) { if (gl.blocked) blockedSeen = true; if (gl.active && reglideAt < 0) { reglideAt = performance.now() - t0; break; } }
    }
    w.inject('Traverse', false);
    return { test: 'glide', glidingBefore, hBefore, speedBefore: vBefore, plunges: pl.stats.plunges, h: +pl.last.h.toFixed(2), hits: pl.last.hits, rebound: +pl.last.rebound.toFixed(2), rebounds: pl.stats.rebounds,
      reboundAtMs: Math.round(landedAt), glideBlockedAfterRebound: blockedSeen, backInGlideAtMs: Math.round(reglideAt), gap: reglideAt > 0 ? Math.round(reglideAt - landedAt) : null };
  `,

  ledge: () => `
    ${prelude}
    const L = g.bellLedge; if (!L) return { test: 'ledge', error: 'no bellLedge system' };
    const find = g.weaponFinds.find((f) => f.id === 'mace'), at = L.site.at, yaw = Math.atan2(at[0] - L.hollow.foot[0], at[1] - L.hollow.foot[1]);
    const sx = L.hollow.foot[0] - Math.sin(yaw) * 3.5, sz = L.hollow.foot[1] - Math.cos(yaw) * 3.5;       // 3.5 m out from the foot of the bluff
    g.chapter.graph.flags.delete('cleared:bell-ledge-hounds'); find.taken = false; g.weapons.reset();
    await bot_tp(sx, sz);
    g.combat.health = 100; g.combat.focus = 100; g.flow.reset(true); g.elements.unlock('gale'); g.elements.select('gale');
    await sleep(2500);
    const p = c.pos, y0 = gy(), hollowHounds = L.slots.map((i) => i >= 0 && g.shaped.isLive(i)), diag = { takenAfterTp: !!find.taken, cleared: g.chapter.graph.flags.has('cleared:bell-ledge-hounds'), spawned: L.spawned, flagsHasFn: typeof g.chapter.graph.flags.delete };
    // The climb (Updraft + glide from the hollow) is tried first and its peak logged; the Bell Ledge's top (14.6 m) is then stood on by a setup move.
    const held = {}; const set = (n, d) => { if (held[n] !== d) { held[n] = d; w.inject(n, d); } };
    g.arm.yaw = yaw; g.arm.pitch = 0.95; await press('Heavy', 60); await sleep(150);
    let maxY = 0, t0 = performance.now();
    while (performance.now() - t0 < 6000) {
      await frames(1);
      const dx = g.gale.updraftX - p.x, dz = g.gale.updraftZ - p.z;
      if (c.pos.y - y0 < 1.0 && performance.now() - t0 < 3000) { g.arm.yaw = Math.atan2(dx, dz); set('MoveForward', Math.hypot(dx, dz) > 0.5); set('Traverse', c.pos.y - y0 > 0.3); }
      else { g.arm.yaw = yaw; set('MoveForward', true); set('Traverse', true); }
      maxY = Math.max(maxY, c.pos.y - y0);
    }
    set('MoveForward', false); set('Traverse', false); await sleep(1500);
    // Setup: stand on the ledge, take the mace (Interact), then step off over the first hound and plunge.
    await bot_tp(at[0], at[1]); g.weapons.reset();
    const hy = gy(); c.pos.y = hy + 0.3; c.vel.y = 0; await sleep(500);
    const ledgeGround = +(c.pos.y - y0).toFixed(1);
    find.taken = false; await sleep(500);
    await press('Interact', 80); await sleep(900);
    const took = !!find.taken;
    const hb = g.shaped.slots[L.slots[0]]?.body; let plunge = null;
    if (hb) {
      g.shaped.slots[L.slots[0]].hp = 200; const hp0 = g.shaped.slots[L.slots[0]].hp;
      p.x = hb.sx[1]; p.z = hb.sz[1]; c.pos.y = y0 + 14.6; c.vel.x = 0; c.vel.y = 0; c.vel.z = 0; c.grounded = false; await frames(3);
      g.inventory.equip('mace'); await press('Primary', 50);
      const t1 = performance.now(); while (performance.now() - t1 < 4000 && !(pl.stats.plunges > 0 && !pl.falling)) await frames(1);
      await sleep(500);
      plunge = { h: +pl.last.h.toFixed(2), dmg: +pl.last.dmg.toFixed(1), hits: pl.last.hits, hound0Hp: [hp0, g.shaped.slots[L.slots[0]].hp] };
    }
    return { test: 'ledge', diag, climbPeakM: +maxY.toFixed(1), ledgeTopM: 14.6, took, ledgeGroundM: ledgeGround, houndsSleeping: hollowHounds, plunge };
  `,

  // The auto-fighter: Updraft (cast 3 m ahead, step into it), ride, steer over the foe, plunge when high enough, plunge again from each rebound;
  // on the ground (no focus for an Updraft) it hops (hold LMB, release) and plunges from the hop, or taps lights up close.
  fight: (spawns, mode) => `
    ${prelude}
    ${X < 0 ? '' : `await bot_tp(${X}, ${Z});`}
    const SPAWNS = ${JSON.stringify(spawns)}, TIMEOUT = ${+(process.env.TIMEOUT || 60)}, DIST = ${+(process.env.SEED_DIST || 7)}, MODE = ${JSON.stringify(mode)};
    await ready();
    g.elements.unlock('gale');
    const p = c.pos, f = g.arm.yaw;
    let k = 0, total = 0; for (const [, n] of SPAWNS) total += n;
    const ids = [];
    for (const [name, n] of SPAWNS) for (let q = 0; q < n; q++) {
      const a = f + (k++ - (total - 1) / 2) * 0.55;
      const i = g.shaped.spawn(name, p.x + Math.sin(a) * DIST, p.z + Math.cos(a) * DIST);
      if (i >= 0) ids.push(i);
    }
    await sleep(2200);
    const t0 = g.clock.simTime, h0 = g.combat.health, killT = [], alive0 = ids.length;
    const held = { Primary: false, MoveForward: false };
    const set = (n, d) => { if (held[n] !== d) { held[n] = d; w.inject(n, d); } };
    let updrafts = 0, dodged = 0, castAt = -9, hopAt = -9, tapT = 0, pressedAt = -9, state = 'go', hopDown = -1, maxChain = 0;
    const LOG = ${process.env.LOG ? 1 : 0}, trace = []; let lastLog = -9;
    const tick = () => {
      const now = g.clock.simTime;
      if (LOG && now - lastLog >= 0.5) { lastLog = now; trace.push([+(now - t0).toFixed(1), c.grounded ? 'G' : pl.falling ? 'F' : 'A', +(c.pos.y - gy()).toFixed(1), +g.combat.focus.toFixed(0), ids.filter((i) => g.shaped.isLive(i)).length, +pl.chain]); }
      // The target: the live foe with the most others within 3.5 m of it (the heart of the pack), the nearer on a tie; the plunge is for packs.
      let best = -1, bd = 1e9, bn = -1;
      for (const i of ids) {
        if (!g.shaped.isLive(i)) continue;
        const b = g.shaped.slots[i].body, d = Math.hypot(b.sx[1] - p.x, b.sz[1] - p.z);
        let n = 0;
        for (const j of ids) { if (j === i || !g.shaped.isLive(j)) continue; const o = g.shaped.slots[j].body; if (Math.hypot(o.sx[1] - b.sx[1], o.sz[1] - b.sz[1]) < 3.5) n++; }
        if (n > bn || (n === bn && d < bd)) { bn = n; bd = d; best = i; }
      }
      for (const i of ids) { const q = ids.indexOf(i); if (!g.shaped.isLive(i) && !killT[q]) killT[q] = +(now - t0).toFixed(2); }
      if (best < 0 || now - t0 > TIMEOUT) { set('Primary', false); set('MoveForward', false); state = 'done'; return; }
      const b = g.shaped.slots[best].body;
      g.arm.yaw = Math.atan2(b.sx[1] - p.x, b.sz[1] - p.z);
      maxChain = Math.max(maxChain, pl.chain);
      // Dodge a telegraphed lunge on the ground.
      let threat = false;
      for (const i of ids) { if (!g.shaped.isLive(i)) continue; const q = g.shaped.slots[i], qb = q.body; if ((q.state === S.TELEGRAPH || q.state === S.LUNGE) && Math.hypot(qb.sx[1] - p.x, qb.sz[1] - p.z) < 4.2) threat = true; }
      if (threat && c.grounded && now - dodged > 0.9 && !pl.falling && g.weapons.machine.phase !== 1) { dodged = now; w.inject('Dodge', true); setTimeout(() => w.inject('Dodge', false), 50); }
      if (!c.grounded) {
        // In the air: over the foe and high enough (or coming down already): plunge.
        set('MoveForward', bd > 1.2 && !pl.falling);
        g.arm.pitch = 0.5;
        const ready2 = pl.hNow >= (pl.chain > 0 ? 3 : 6) || (c.vel.y < 0 && pl.hNow >= 2.6);
        if (!pl.falling && ready2 && bd < 4 && now - pressedAt > 0.25) { pressedAt = now; w.inject('Primary', true); setTimeout(() => w.inject('Primary', false), 40); }
        return;
      }
      if (pl.falling || g.weapons.machine.busy) { set('MoveForward', false); return; }
      // On the ground.
      const gale = MODE !== 'nogale' && g.combat.focus >= 24;
      if (gale && bd < 11 && bd > 2.5 && now - castAt > 2.2) {
        g.elements.select('gale'); g.arm.pitch = 0.95; castAt = now; updrafts++;
        w.inject('Heavy', true); setTimeout(() => w.inject('Heavy', false), 50);
        set('MoveForward', true);                     // into the column
        return;
      }
      if (now - castAt < 1.6) {
        // Walk to the column's axis (it was cast 3 m or more ahead: the aim has a minimum range) and stand in it.
        const dx = g.gale.updraftX - p.x, dz = g.gale.updraftZ - p.z, d = Math.hypot(dx, dz);
        if (now - castAt > 0.15) g.arm.yaw = Math.atan2(dx, dz);
        set('MoveForward', d > 0.7 && now - castAt > 0.15);
        return;
      }
      set('MoveForward', bd > 1.9);
      if (bd < 2.3) {
        // Close: the hop (a heavy tap-and-hold) then the plunge, else lights.
        if (hopDown < 0 && now - hopAt > 1.2) { w.inject('Primary', true); hopDown = now; hopAt = now; }
        else if (hopDown >= 0 && now - hopDown > 0.4) { w.inject('Primary', false); hopDown = -1; }
        else if (hopDown < 0 && now - tapT > 0.45) { tapT = now; w.inject('Primary', true); setTimeout(() => w.inject('Primary', false), 45); }
      } else if (hopDown >= 0 && now - hopDown > 0.4) { w.inject('Primary', false); hopDown = -1; }
    };
    while (state !== 'done') { tick(); await frames(1); }
    const st = pl.stats, now = g.clock.simTime;
    set('Primary', false); set('MoveForward', false);
    return { trace: LOG ? trace : undefined, weapon: 'mace', mode: MODE, spawns: SPAWNS, seconds: +(now - t0).toFixed(1), killed: ids.filter((i) => !g.shaped.isLive(i)).length + '/' + alive0, killT, damageTaken: +(h0 - g.combat.health).toFixed(1), hp: +g.combat.health.toFixed(0),
      updrafts, plunges: st.plunges, plungesPerUpdraft: updrafts ? +(st.plunges / updrafts).toFixed(2) : null, plungeHits: st.hits, misses: st.misses, rebounds: st.rebounds, maxH: +st.maxH.toFixed(1), maxChain, dunks: st.dunks, stars: st.stars,
      swings: g.weapons.stats.swings, hits: g.weapons.stats.hits, dmgDealt: +g.weapons.stats.damage.toFixed(0), flowHits: [g.flow.counts[0], g.flow.counts[1], g.flow.counts[2]], flowChains: g.flow.counts[8], flowTierSecs: Array.from(g.flow.timeAt, (x) => +x.toFixed(1)), flowMax: g.flow.tier };
  `,
};

/** Move the Wraith (a real teleport request) and wait for the ground to be there. */
const prefix = `
  const bot_tp = async (x, z) => { g.requestTeleport(x, z); const t0 = performance.now(); await new Promise((r) => { const f = () => (!g.controller.hold || performance.now() - t0 > 30000 ? r() : setTimeout(f, 200)); f(); }); await new Promise((r) => setTimeout(r, 1500)); };
`;

const heights = (arg || '5,10,14,20').split(',').map(Number);
const spawnArg = process.argv[3] || 'hound:3';
const spawns = spawnArg.split(',').map((q) => { const [n, k] = q.split(':'); return [n, +k || 1]; });
const js = ['dunk', 'ice', 'down', 'glide', 'ledge'].includes(test) ? tests[test]() : test === 'fight' ? tests.fight(spawns, process.env.MODE || 'mixed') : tests[test] ? tests[test](heights) : null;
if (!js) { console.error('unknown test ' + test); process.exit(1); }
const r = await bot('eval', { js: prefix + js });
console.log(JSON.stringify(r.result ?? r, null, process.env.PRETTY ? 1 : 0));
