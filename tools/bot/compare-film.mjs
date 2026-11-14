#!/usr/bin/env node
// Before/after comparison film (docs/realism-plan.md): the same scripted camera moves, in the bot's
// film mode (fixed step, frames to screenshots/compare/frames/<tag>-<shot>/), run once against each
// build. tools/bot/compare-encode.sh then splits them side by side.
//   WRAITH_URL=http://localhost:4174 node tools/bot/compare-film.mjs before [shot,shot]
//   WRAITH_URL=http://localhost:4173 node tools/bot/compare-film.mjs after
const base = process.env.WRAITH_URL || 'http://localhost:4173';
const [, , tag = 'after', only = ''] = process.argv;
const FPS = 30, SECONDS = 5, SIZE = [1920, 1080];
const bot = async (cmd, a = {}) => {
  const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify({ do: cmd, ...a }) })).json();
  return await (await fetch(`${base}/__wraith/bot/reply?id=${id}&wait=900000`)).json();
};
const ev = async (js) => { const r = await bot('eval', { js }); if (r.ok === false) throw new Error(r.error); return r.result; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each shot: where to stand while streaming, the hour, and the camera over u = t / SECONDS (0..1).
// G(x, z) is the ground height. Moves are slow and smooth (an ease in and out).
const SHOTS = {
  lake: { at: [-250, -450], hour: 14.5, cam: `
    const e = u * u * (3 - 2 * u), x = -252, z = -460 + 20 * e;
    cam.at(x, G(x, z) + 2.2, z, x + 120, G(x, z) + 6, z + 10, 0.85);` },
  meadow: { at: [-250, -450], hour: 11.0, cam: `
    const e = u * u * (3 - 2 * u), a = 215 * Math.PI / 180, d = 9 * e;
    const x = -250 + Math.sin(a) * d, z = -450 + Math.cos(a) * d;
    cam.at(x, G(x, z) + 1.4, z, x + Math.sin(a) * 30, G(x, z) + 0.3, z + Math.cos(a) * 30, 0.9);` },
  scarp: { at: [-400, -540], hour: 15.5, cam: `
    const e = u * u * (3 - 2 * u), x = -404 + 6 * e, z = -548 + 9 * e;
    cam.at(x, G(x, z) + 6 - 1.5 * e, z, -422, G(-422, -511) + 3, -511, 0.9);` },
  tree: { at: [-230, -455], hour: 13.0, cam: `
    const e = u * u * (3 - 2 * u), x = -233 + 2 * e, z = -449;
    cam.at(x, G(x, z) + 1.6 + 3.5 * e, z, -224, G(-224, -463) + 4 + 8 * e, -463, 0.95);` },
  vista: { at: [-250, -450], hour: 12.5, cam: `
    const e = u * u * (3 - 2 * u), a = (55 + 55 * e) * Math.PI / 180, x = -250, z = -450;
    cam.at(x, G(x, z) + 3, z, x + Math.sin(a) * 200, G(x, z) + 10, z + Math.cos(a) * 200, 0.85);` },
  golden: { at: [-250, -450], hour: 16.6, cam: `
    const e = u * u * (3 - 2 * u), a = 250 * Math.PI / 180, d = 6 * e;
    const x = -250 + Math.sin(a) * d, z = -450 + Math.cos(a) * d;
    cam.at(x, G(x, z) + 1.3, z, x + Math.sin(a) * 80, G(x, z) + 2.5, z + Math.cos(a) * 80, 0.9);` },
  // The lake (realism plan W): a slow pan across it from the west shore, the same at golden hour,
  // into the sun from the east shore, and down into the shallows. W(x, z): the eye's base (ground or water).
  'water-shore': { at: [-243, -443], hour: 13.0, cam: `
    const e = u * u * (3 - 2 * u), a = (30 + 35 * e) * Math.PI / 180, x = -243, z = -443, y = W(x, z) + 1.6;
    cam.at(x, y, z, x + Math.sin(a) * 100, y - 3.5, z + Math.cos(a) * 100, 0.9);` },
  'water-golden': { at: [-243, -443], hour: 17.6, cam: `
    const e = u * u * (3 - 2 * u), a = (70 - 25 * e) * Math.PI / 180, x = -243, z = -443, y = W(x, z) + 1.6;
    cam.at(x, y, z, x + Math.sin(a) * 100, y - 2.0, z + Math.cos(a) * 100, 0.9);` },
  'water-sun': { at: [-10, -330], hour: 16.3, cam: `
    const e = u * u * (3 - 2 * u), s = g.env.env.sunDir, b = Math.atan2(s.x, s.z) + (-0.25 + 0.5 * e), x = -10, z = -330, y = W(x, z) + 1.6;
    cam.at(x, y, z, x + Math.sin(b) * 100, y - 4, z + Math.cos(b) * 100, 0.9);` },
  'water-shallows': { at: [-243, -443], hour: 12.0, cam: `
    const e = u * u * (3 - 2 * u), x = -238 + 4 * e, z = -440 + 4 * e, y = W(x, z) + 1.7;
    cam.at(x, y, z, x + 6, y - 4.5, z + 6, 0.95);` },
};

for (const [name, s] of Object.entries(SHOTS)) {
  if (only ? !only.split(',').includes(name) : name.startsWith('water-')) continue;
  await bot('teleport', { x: s.at[0], z: s.at[1] }); await sleep(6000);
  await ev(`if (g.game && g.game.setPlayerVisible) g.game.setPlayerVisible(false); g.ws.weatherOverride = 'clear';
    if (g.ws.restoration) g.ws.restoration.meadow = 'restored'; if (g.restoration) g.restoration.snap = true;
    g.params.v.timeOfDay = ${s.hour}; g.params.v.windStrength = 0.6; g.params.version++; return 1`);
  await sleep(4000);
  const js = `const G = (x, z) => { g.ground.qx = x; g.ground.qz = z; g.ground.sample(); return g.ground.h; };
    const W = (x, z) => { const l = g.water.levelAt(x, z); return Math.max(G(x, z), l > -1e3 ? l : -1e9); };
    const u = Math.min(1, t / ${SECONDS}); cam.tod(${s.hour}); ${s.cam}`;
  const r = await bot('film', { name: `${tag}-${name}`, dir: 'compare', seconds: SECONDS, fps: FPS, size: SIZE, quality: 0.92, warm: 60, js });
  console.log(name, JSON.stringify(r).slice(0, 200));
}
console.log('done');
