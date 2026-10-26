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
};

/** Move the Wraith (a real teleport request) and wait for the ground to be there. */
const prefix = `
  const bot_tp = async (x, z) => { g.requestTeleport(x, z); const t0 = performance.now(); await new Promise((r) => { const f = () => (!g.controller.hold || performance.now() - t0 > 30000 ? r() : setTimeout(f, 200)); f(); }); await new Promise((r) => setTimeout(r, 1500)); };
`;

const heights = (arg || '5,10,14,20').split(',').map(Number);
const js = tests[test] ? tests[test](heights) : null;
if (!js) { console.error('unknown test ' + test); process.exit(1); }
const r = await bot('eval', { js: prefix + js });
console.log(JSON.stringify(r.result ?? r, null, process.env.PRETTY ? 1 : 0));
