#!/usr/bin/env node
// Film a weapon's moves with the bot's film mode (src/core/bot.js filmRun): the render loop is driven at a fixed
// 60 fps and every frame saved to screenshots/weapons/frames/<name>/. The camera is scripted round the Wraith.
//   WRAITH_URL=http://localhost:4177 node tools/bot/weapons-film.mjs <weapon> <move> [cam]
//   weapon: staff | sickles | maul | glaive | flail     move: combo | heavy | carry | dodge      cam: side | front | back | high | wide
// A frost hound (or the meadow's Sedgerunners) stands ahead, held still by the script, so the blows land.
const base = process.env.WRAITH_URL || 'http://localhost:4177';
const [, , weapon = 'staff', move = 'combo', camName = 'side'] = process.argv;
const bot = async (cmd, args = {}) => {
  const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify({ do: cmd, ...args }) })).json();
  const r = await (await fetch(`${base}/__wraith/bot/reply?id=${id}&wait=600000`)).json();
  return r;
};
const CAMS = {
  // [yaw offset from the Wraith's facing (rad), distance, height above the feet, look-at height, fov]
  side: [1.45, 3.4, 1.35, 1.1, 0.75], front: [0.5, 3.6, 1.5, 1.1, 0.75], back: [3.14 - 0.45, 3.2, 1.6, 1.15, 0.8],
  high: [1.2, 4.2, 3.2, 0.9, 0.8], three: [0.85, 2.7, 1.35, 1.05, 0.72], rear: [2.6, 3.4, 1.7, 1.1, 0.75], wide: [1.1, 6.5, 2.0, 1.0, 0.8], close: [1.3, 2.4, 1.3, 1.1, 0.7],
};
const cfg = CAMS[camName] || CAMS.side;
const seconds = { combo: weapon === 'sickles' ? 2.6 : weapon === 'glaive' ? 2.0 : 2.4, heavy: 2.4, carry: 0.6, dodge: 1.5 }[move] ?? 2.4;
const js = `
  const p = g.controller.pos, f = g.controller.yaw0 ?? (g.controller.yaw0 = g.controller.yaw);
  const a = f + ${cfg[0]}, d = ${cfg[1]};
  cam.tod(${process.env.HOUR || 12.4});
  cam.at(p.x + Math.sin(a) * d, p.y + ${cfg[2]}, p.z + Math.cos(a) * d, p.x + Math.sin(f) * 0.9, p.y + ${cfg[3]}, p.z + Math.cos(f) * 0.9, ${cfg[4]});
  ${move === 'combo' ? `if (i === 0 || i === 18 || i === 36 || i === 54 || i === 72 || i === 90) inject('Primary', true); if (i === 4 || i === 22 || i === 40 || i === 58 || i === 76 || i === 94) inject('Primary', false);` : ''}
  ${move === 'heavy' ? `if (i === 0) inject('Primary', true); if (i === 50) inject('Primary', false);` : ''}
  ${move === 'dodge' ? `if (i === 0) inject('Primary', true); if (i === 4) inject('Primary', false); if (i === 22) { inject('Dodge', true); } if (i === 26) inject('Dodge', false);` : ''}
`;
const setup = `
  const W = ${JSON.stringify(weapon)};
  g.inventory.give(W); g.inventory.equip(W);
  g.weapons.machine.reset();
  g.combat.health = 100; g.combat.focus = 100;
  g.weaponsFilmSetup = () => {};
  const p = g.controller.pos, f = g.controller.yaw; g.controller.yaw0 = f;
  g.arm.yaw = f;
  return { W, at: [p.x, p.z], yaw: f };
`;
const r0 = await bot('eval', { js: setup });
console.log('setup', JSON.stringify(r0.result));
// SPAWN=hound:2:3.0 (archetype:count:metres ahead) puts Shaped in front of the blows; FREEZE=1 freezes them.
if (process.env.SPAWN) {
  const [name, n = '1', dist = '3'] = process.env.SPAWN.split(':');
  await bot('eval', { js: `g.game.killShaped(); await new Promise((r) => setTimeout(r, 1500)); const p = g.controller.pos, f = g.controller.yaw0 ?? g.controller.yaw; const n = ${+n}; const ids = [];
    for (let k = 0; k < n; k++) { const a = f + (k - (n - 1) / 2) * 0.5; ids.push(g.shaped.spawn(${JSON.stringify(name)}, p.x + Math.sin(a) * ${+dist}, p.z + Math.cos(a) * ${+dist})); }
    await new Promise((r) => setTimeout(r, 2400)); ${process.env.FREEZE ? 'for (const i of ids) g.shaped.freeze(i, 99);' : ''} return ids;` });
}
const r = await bot('film', { name: `${weapon}-${move}-${camName}`, dir: process.env.FILM_DIR || 'weapons2', seconds, fps: 60, size: [1280, 720], quality: 0.86, warm: 40, js });
console.log(JSON.stringify(r));
