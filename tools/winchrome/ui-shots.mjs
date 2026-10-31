#!/usr/bin/env node
// Screenshots of the game's HTML UI over the real render (the bot's shots read back only the canvas):
// the title, pause, settings, the inventory, low health. Windows Chrome over CDP (connect.mjs).
//   node tools/winchrome/ui-shots.mjs [outDir=screenshots/ui]
import fs from 'node:fs';
import { openSession } from './session.mjs';

const out = process.argv[2] || 'screenshots/ui';
fs.mkdirSync(out, { recursive: true });
const s = await openSession({ query: 'spot=p8-meadow-golden&title=0', width: 1920, height: 1080 });
try {
  await s.settle(); await s.frames(30);
  const shot = async (name) => { await s.frames(20); await s.shot(`${out}/${name}.png`); console.log('shot', name); };
  const run = (js) => s.eval(new Function(js));
  await run(`const g = window.__wraith.g; g.menus.started = true; g.hud.release?.();`);
  // Health and the vignette.
  await run(`const g = window.__wraith.g; g.combat.health = g.combat.maxHealth * 0.6; g.combat.focus = 55;`);
  await s.frames(40); await shot('hud-health');
  await run(`const g = window.__wraith.g; g.combat.health = g.combat.maxHealth * 0.18;`);
  await s.frames(90); await shot('hud-low');
  await run(`const g = window.__wraith.g; g.combat.health = g.combat.maxHealth; g.combat.focus = 100;`);
  for (const [name, js] of [
    ['pause', `window.__wraith.g.menus.open('pause')`],
    ['settings-graphics', `window.__wraith.g.menus.open('settings', 'graphics')`],
    ['settings-interface', `window.__wraith.g.menus.open('settings', 'interface')`],
    ['settings-controls', `window.__wraith.g.menus.open('settings', 'controls')`],
    ['inventory', `window.__wraith.g.menus.open('journal', 'inventory')`],
    ['journal', `window.__wraith.g.menus.open('journal', 'quests')`],
    ['map', `window.__wraith.g.menus.open('map')`],
  ]) { await run(js + ';'); await s.frames(30); await shot(name); }
  await run(`const g = window.__wraith.g; g.menus.close(); g.menus.started = false; g.menus.showTitle();`);
  await s.frames(240); await shot('title');
  if (s.logs.length) console.log(s.logs.slice(0, 20).join('\n'));
} finally { await s.close(); }
