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
    const tick = () => {
      const now = g.clock.simTime;
      let best = -1, bd = 1e9;
      for (const i of ids) { if (!g.shaped.isLive(i)) continue; const b = g.shaped.slots[i].body, d = Math.hypot(b.sx[1] - p.x, b.sz[1] - p.z); if (d < bd) { bd = d; best = i; } }
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
        if (!pl.falling && ready2 && bd < 3.2 && now - pressedAt > 0.25) { pressedAt = now; w.inject('Primary', true); setTimeout(() => w.inject('Primary', false), 40); }
        return;
      }
      if (pl.falling || g.weapons.machine.busy) { set('MoveForward', false); return; }
      // On the ground.
      const gale = MODE !== 'nogale' && g.combat.focus >= 24;
      if (gale && bd < 9.5 && bd > 2.5 && now - castAt > 3.2) {
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
    return { weapon: 'mace', mode: MODE, spawns: SPAWNS, seconds: +(now - t0).toFixed(1), killed: ids.filter((i) => !g.shaped.isLive(i)).length + '/' + alive0, killT, damageTaken: +(h0 - g.combat.health).toFixed(1), hp: +g.combat.health.toFixed(0),
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
const js = test === 'fight' ? tests.fight(spawns, process.env.MODE || 'mixed') : tests[test] ? tests[test](heights) : null;
if (!js) { console.error('unknown test ' + test); process.exit(1); }
const r = await bot('eval', { js: prefix + js });
console.log(JSON.stringify(r.result ?? r, null, process.env.PRETTY ? 1 : 0));
