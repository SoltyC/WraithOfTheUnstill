// Trailer footage: each shot loads a photo spot in the bot page (tools/bot/play.sh), sets it up, and films it in
// film mode (src/core/bot.js `film`: fixed 1/60 s steps, every frame saved) to screenshots/trailer/frames/<name>/.
// Then tools/bot/trailer-cut.sh encodes and cuts them to the release theme.
//
//   node tools/bot/trailer.mjs [shot names…]     (no names: every shot not yet filmed)
//
// Camera moves are scripted per frame in page JS: `cam.at(x, y, z, tx, ty, tz, fov)`; H(x, z) is the ground height;
// S keeps state across frames (S.p = the Wraith's start position); u = eased 0..1 over the shot.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { bot, js } from './client.mjs';

const PRE = (dur) => `
  const S = w.__shot || (w.__shot = {});
  const H = (x, z) => { const gr = g.ground; gr.qx = x; gr.qz = z; gr.sample(); return gr.h; };
  const L = (a, b, k) => a + (b - a) * k, E = (k) => k * k * (3 - 2 * k);
  if (!S.p) { const p = g.controller.pos; S.p = { x: p.x, y: p.y, z: p.z }; const c = g.camera.position; S.c = { x: c.x, y: c.y, z: c.z }; S.yaw = g.arm.yaw; }
  const u = E(Math.min(1, t / ${dur})), P = S.p;
`;
// Orbit round (cx, cz) at radius r, from angle a0 to a1 (rad, world heading), camera height hy over the ground there, looking at ty.
const orbit = (cx, cz, r, a0, a1, hy, ty, fov = 0.75) => `
  { const a = L(${a0}, ${a1}, u), x = ${cx} + Math.sin(a) * ${r}, z = ${cz} + Math.cos(a) * ${r};
    cam.at(x, H(x, z) + ${hy}, z, ${cx}, ${ty}, ${cz}, ${fov}); }`;
// Round the Wraith: dist, height, from heading a0 to a1 (relative to the spot's camera yaw), looking at her chest (+ lookUp).
const around = (d0, d1, h0, h1, a0, a1, lookUp = 1.2, fov = 0.75) => `
  { const a = S.yaw + Math.PI + L(${a0}, ${a1}, u), d = L(${d0}, ${d1}, u), x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;
    cam.at(x, Math.max(H(x, z) + 0.6, P.y + L(${h0}, ${h1}, u)), z, P.x, P.y + ${lookUp}, P.z, ${fov}); }`;

// Gameplay on the game's own follow camera: forward held for the whole shot, the camera (and so her heading) drifting by `drift`
// rad; `extra` adds inputs (e.g. casts) by frame.
const walk = (n, drift = 0, extra = '', keys = "'MoveForward'") => `
  if (i === -30) { S.y0 = g.arm.yaw; for (const k of [${keys}]) inject(k, true); }
  if (i >= 0) g.arm.yaw = S.y0 + ${drift} * Math.min(1, t / ${n / 60});
  ${extra}
  if (i === ${n - 1}) for (const k of [${keys}]) inject(k, false);`;

const SHOTS = [
  // 0 — dawn over the meadow: a slow aerial push from the fields toward the hill and the village under it.
  { name: 's00-dawn-aerial', spot: 'p8-hill-aerial', seconds: 9,
    js: `if (i < 0 || i % 30 === 0) cam.tod(6.35 + t * 0.02); cam.at(L(-170, -60, u), L(430, 395, u), L(720, 830, u), L(160, 200, u), L(300, 330, u), L(960, 985, u), 0.75);` },
  // 1 — the meadow: a low glide over the grass up to the Wraith.
  { name: 's01-meadow', spot: 'p8-hill-south', seconds: 7, js: around(15, 6.5, 1.9, 2.3, 0.4, 0.05, 1.3, 0.7) },
  // 2 — the lake at golden hour, a slow track.
  { name: 's02-lake', spot: 'p8-lake-golden', seconds: 5.5, js: around(9, 8, 1.6, 2.2, -0.5, 0.2, 1.0, 0.75) },
  // 3 — the forest, light through the leaves.
  { name: 's03-forest', spot: 'p8-forest-shafts', seconds: 5.5, js: around(8, 5.5, 1.4, 1.8, 0.3, -0.1, 1.4, 0.8) },
  // 4 — the frost: walking into the blizzard (the game's own camera).
  { name: 's04-blizzard', spot: 'p6-blizzard-dusk', seconds: 4.5, js: `if (i === 0) inject('MoveForward', true); if (i === 260) inject('MoveForward', false);` },
  // 5 — the Frost Warden, a slow orbit.
  { name: 's05-warden', spot: 'p5-warden-golden', seconds: 5.5, js: around(16, 12, 3, 5, -0.6, 0.3, 4, 0.8) },
  // 6 — Hearn from above, a day in twelve seconds: dawn, noon, the long evening, the windows lit at night.
  { name: 's06-timelapse', spot: 'tour-09-dusk-aerial', seconds: 13,
    // A slow, low orbit (about 0.4 rad in 13 s, ~85 m up, ~230 m out), aimed level so the roofs fill the lower frame and the
    // hill, the manor and the sky the upper; the day runs from before dawn to night. Exposure snaps each frame (no lag).
    js: `{ const k = Math.min(1, t / 13); g.atmosphere.alwaysSnap = true; cam.tod(5.4 + 17.2 * k); const e = k * k * (3 - 2 * k) * 0.6 + k * 0.4, a = 3.78 - 0.42 * e;
      const y = H(125, 950) + 85 + 6 * e, x = 125 + Math.sin(a) * 230, z = 950 + Math.cos(a) * 230; cam.at(x, y, z, 200, y - 12, 985, 0.8); }` },
  // 7 — the burning night: the market square with the houses on fire.
  { name: 's07-fire-night', spot: 'p8-fire-night', seconds: 6, settle: 25000, js: around(14, 10, 4, 6, -0.4, 0.2, 2, 0.85) },
  // 8 — the Ribbon on a burning house (the game's camera, Primary held at the nearest fire).
  { name: 's08-ribbon', spot: 'p8-fire-night', seconds: 5, settle: 25000, setup: 'ribbon', js: `if (i === 0) inject('Primary', true); if (i === 290) inject('Primary', false);` },
  // 9 — the stair foot at golden hour, the camera rising to the manor on the summit.
  { name: 's09-stair', spot: 'tour-07-golden-stairfoot', seconds: 6, js: `{ const x = P.x - 6, z = P.z - 6; cam.at(x, P.y + L(1.5, 6, u), z, L(P.x, 300, u), L(P.y + 2, 440, u), L(P.z, 1000, u), 0.8); }` },
  // 10 — it wakes: the neck rears over the manor, seen from the market.
  { name: 's10-wake-market', spot: 'p8-bell-wake-market', seconds: 6, js: `{ cam.at(P.x - 2, P.y + 1.6, P.z + 1, 300, L(430, 440, u), 1000, L(0.75, 0.55, u)); }` },
  // 12 — the neck reared over the forecourt (the fight on, the chimneys stripped): a slow orbit round its head.
  { name: 's12-neck', spot: 'p8-bell-fight', extra: '^&gale=1^&bell=fight', seconds: 4, settle: 8000, setup: 'neck',
    js: `{ const b = g.bellwether; if (!S.h) S.h = { x: b.hx, y: b.hy, z: b.hz }; const a = L(-0.9, -0.6, u), x = S.h.x + Math.sin(a) * 48, z = S.h.z + Math.cos(a) * 48; cam.at(x, Math.max(H(x, z) + 2, S.h.y - 14), z, b.hx, b.hy - 6, b.hz, 0.85); }` },
  // 13 — the release: valves open, it breathes out, the front rolls down to the village (its own cinematic camera).
  { name: 's13-release', spot: 'p8-bell-fight', extra: '^&gale=1^&bell=fight', seconds: 16, settle: 8000, setup: 'release', warm: 2, js: '' },
  // 14 — the mill turning again.
  { name: 's14-mill', spot: 'tour-04-noon-street', extra: '^&bell=release', seconds: 6, setup: 'mill', js: orbit(41.3, 816.5, 26, 0.35, 0.75, 4, 'H(41.3, 816.5) + 7', 0.7) },
  // 16 — the finale: high on the stair, the village below, the camera craning away.
  { name: 's16-summit', spot: 'p8-summit', extra: '^&bell=release', seconds: 9, js: around(6, 26, 1.6, 12, 0.2, 0.75, 1.4, 0.8) },
  // Gameplay: walking the meadow at noon.
  { name: 'g01-meadow-walk', spot: 'p8-meadow-noon', seconds: 6, js: walk(360, 0.35) },
  // Gameplay: wading into the lake.
  { name: 'g02-wade', spot: 'p8-lake-wade', seconds: 5, js: walk(300, -0.25) },
  // Gameplay: surfing the frost (Traverse held on snow), carving left and right.
  { name: 'g03-surf', spot: 'p4-surf-carve-golden', seconds: 5, js: walk(300, 0, `if (i === 60) inject('MoveLeft', true); if (i === 130) { inject('MoveLeft', false); inject('MoveRight', true); } if (i === 210) inject('MoveRight', false);`, "'MoveForward', 'Traverse'") },
  // Gameplay: through the village by day, the villagers about.
  { name: 'g04-village-walk', spot: 'tour-04-noon-street', extra: '^&bell=release', seconds: 6, js: walk(360, -0.3) },
  // Gameplay: up the stair.
  { name: 'g05-stair-walk', spot: 'p8-stair-foot', extra: '^&bell=release', seconds: 5.5, js: walk(330, 0.1) },
  // Gameplay: Gust across the grass, twice, walking.
  { name: 'g06-gust', spot: 'p8-gale-meadow', extra: '^&gale=1', seconds: 5, setup: 'gale', js: walk(300, 0.2, `if (i === 40 || i === 170) inject('Primary', true); if (i === 46 || i === 176) inject('Primary', false);`) },

];

const SETUP = {
  // Face the nearest burning house and walk up to it.
  async ribbon() {
    await js(`const v = g.villageFire, p = g.controller.pos; let b = -1, bd = 1e9; for (let i = 0; i < v.N; i++) { if (v.state[i] === 0) continue; const d = Math.hypot(v.x(i) - p.x, v.z(i) - p.z); if (d < bd) { bd = d; b = i; } } if (b < 0) return 'none'; w.__fire = [v.x(b), v.z(b)]; return [b, bd];`);
    const f = await js('return w.__fire || null');
    if (f) { await bot('walkTo', { x: f[0], z: f[1], arrive: 9, timeout: 20 }); await bot('face', { x: f[0], z: f[1], pitch: 0.05 }); }
  },
  // Strip the vents, wait for the neck to rise, open the valves: the director releases on its next update.
  async release() {
    await js(`g.bellFight.vents.fill(0); return true`);
    for (let k = 0; k < 40; k++) { const ph = await js('return g.bellFight.phase'); if (ph >= 2) break; await bot('wait', { ms: 500 }); }
  },
  async neck() {
    await js(`g.bellFight.vents.fill(0); return true`);
    for (let k = 0; k < 40; k++) { const ph = await js('return g.bellFight.phase'); if (ph >= 2) break; await bot('wait', { ms: 500 }); }
    await bot('wait', { ms: 6000 });   // the neck rears
  },
  async mill() { await bot('teleport', { x: 54, z: 842 }); await bot('wait', { ms: 2000 }); },
  async gale() { await js(`g.elements.select('gale'); return g.elements.active`); },
};

const want = process.argv.slice(2);
for (const s of SHOTS) {
  const dir = `screenshots/trailer/frames/${s.name}`;
  if (want.length ? !want.includes(s.name) : fs.existsSync(dir) && fs.readdirSync(dir).length >= Math.round(s.seconds * 60)) continue;
  fs.rmSync(dir, { recursive: true, force: true });
  const t0 = Date.now();
  console.log(`${s.name}: loading ${s.spot}`);
  execFileSync('tools/bot/play.sh', [s.spot, s.extra || ''], { stdio: 'inherit' });
  await bot('wait', { ms: s.settle || 6000 });
  if (s.setup) await SETUP[s.setup]();
  let js2 = PRE(s.seconds) + s.js;
  if (s.setup === 'release') js2 = `if (i === -1) { const b = g.bellwether; for (let k = 0; k < 3; k++) b.openValve(k); }` + js2;
  await js('w.__shot = null; return 1');
  const r = await bot('film', { name: s.name, seconds: s.seconds, js: js2, warm: s.warm ?? 30 }, 900000);
  console.log(`${s.name}: ${r.frames} frames, ${r.failed} failed, ${r.wallS} s (${((Date.now() - t0) / 1000).toFixed(0)} s total)`);
}
execFileSync('tools/bot/play.sh', ['stop'], { stdio: 'inherit' });
console.log('trailer shots done');
