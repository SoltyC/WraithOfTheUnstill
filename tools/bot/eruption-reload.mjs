#!/usr/bin/env node
// Verify Ember across two Windows Chrome sessions and IndexedDB slot 1.
// Start npm run preview first, then run: node tools/bot/eruption-reload.mjs [http://localhost:4173]
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual, promisify } from 'node:util';

const url = new URL(process.argv[2] || process.env.WRAITH_URL || 'http://localhost:4173');
process.env.WRAITH_URL = url.origin;
const { bot, js } = await import('./client.mjs');
const env = { ...process.env, PORT: url.port || '80', PROFILE: 'keep' };
const run = promisify(execFile);
const dir = 'ember-reload';
const places = [
  { id: 'sow', from: [1000, -1640], to: [860, -1950], height: 20, target: 4 },
  { id: 'cinderhold', from: [1880, -2040], to: [1990, -2010], height: 14, target: 6 },
  { id: 'camp', from: [690, -2650], to: [760, -2632], height: 9, target: 2 },
];

/** Start or stop the kept browser on the same origin as the save. */
async function chrome(...args) {
  const { stdout } = await run('bash', ['tools/bot/play.sh', ...args], { env, timeout: 220000 });
  if (stdout.trim()) console.log(stdout.trim());
}

/** Let the destination stream in and let the nearby collapse workers settle. */
async function settle(condition, label, ms = 60000, stableFrames = 12) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    // Keep each wait shorter than the bot bridge's reply timeout. A town can take
    // several minutes to finish off-screen, even after the eruption is over.
    const interval = Math.min(20000, deadline - Date.now());
    const ready = await js(`
      const deadline = performance.now() + ${interval};
      let frames = 0;
      while (performance.now() < deadline) {
        frames = (${condition}) ? frames + 1 : 0;
        if (frames >= ${stableFrames}) return true;
        await new Promise(requestAnimationFrame);
      }
      return false;
    `);
    if (ready) return;
  }
  throw new Error('Timed out waiting for ' + label);
}

/** Record the world flags and the actual drawn effects at a settled location. */
async function stateAt() {
  return js(`
    const { flags, vars } = g.chapter.graph;
    const p = g.controller.pos;
    const ruins = {};
    const nearbyRuins = {};
    for (const id of Object.keys(vars).filter(id => id.startsWith('ruin:')).sort()) {
      const { force, seed, strength, char } = vars[id];
      ruins[id] = { force, seed, strength, char };
      const name = id.slice(5);
      const site = g.archSites.find(s => s.id === name);
      if (site && Math.hypot(site.at[0] - p.x, site.at[1] - p.z) <= 400) {
        const r = g.destruction.ruins.get(name);
        nearbyRuins[name] = { hidden: !!site.hidden, state: r?.state ?? null, drawn: r?.view?.mesh.isEnabled() ?? false };
      }
    }
    return {
      ruins,
      nearbyRuins,
      camp: g.archSites.filter(s => s.id.startsWith('emb-camp') && !s.hidden).map(s => s.id).sort(),
      flags: [...flags].filter(f => f.startsWith('ember:') && /erupt|after|dead|lost|fled|-go$|-stays$/.test(f)).sort(),
      flows: { shown: g.lavaFlows?.shown, cooling: g.lavaFlows?.cooling, fronts: Array.from(g.eruption.fronts) },
      ash: {
        falling: +g.snowfall.ashFall.toFixed(3),
        ground: g.content.clipmap.lavaGlow.w,
        grass: g.grass.ash,
        trees: g.trees.ash,
      },
      stage: g.volcano.stage,
    };
  `);
}

/** Visit each save-check location and film a matched still from the requested camera. */
async function capture(phase) {
  const states = {};
  for (const { id, from, to, height, target } of places) {
    const [x, z] = from, [tx, tz] = to;
    await js(`
      g.paramsMod.setParam('timeOfDay', 12);
      g.clock.pinHour = 12;
      g.requestTeleport(${x}, ${z});
      g.game.setPlayerVisible(false);
    `);
    await settle(`!g.controller.hold && g.game.worldSettled()
      && Math.hypot(g.controller.pos.x - ${x}, g.controller.pos.z - ${z}) < 12`, id + ' streaming');
    // Some far ruins cannot settle until their ground is streamed in. Only wait for the local ones.
    await settle(`[...g.destruction.ruins].every(([id, r]) => {
      const site = g.archSites.find(s => s.id === id);
      return r.state === 'rest'
        || Math.hypot(site.at[0] - ${x}, site.at[1] - ${z}) > 400;
    })`, id + ' nearby ruins', 360000);
    states[id] = await stateAt();
    const image = await bot('film', {
      name: phase + '-' + id, dir, seconds: 1 / 60, quality: 0.94, warm: 48,
      js: `const ground = g.scenes.groundAt;
        cam.at(${x}, ground(${x}, ${z}) + ${height}, ${z},
          ${tx}, ground(${tx}, ${tz}) + ${target}, ${tz}, 0.8);`,
    });
    if (image.frames !== 1 || image.failed) throw new Error('Could not capture ' + phase + ' ' + id);
    console.log(image.dir + '/f000000.jpg');
  }
  return states;
}

try {
  await chrome('e1-chapel', '^&gfx=high');
  await js(`g.requestTeleport(1000, -1640);`);
  await settle('!g.controller.hold && g.game.worldSettled()', 'the Sow');
  await js(`
    const { flags, vars } = g.chapter.graph;
    // Two households made it to the headland. Leave other outcomes to the eruption.
    for (const id of ['aled', 'ffion']) flags.add('ember:' + id + '-go');
    flags.add('ember:warned');
    vars['ember:day'] = 4;
    g.eruption.rate = 25;
  `);
  await settle('g.eruption.done && !g.scenes.busy', 'the eruption and its scenes', 150000, 60);
  const before = await capture('before');
  if (Object.keys(before.sow.ruins).length === 0 || before.camp.camp.length === 0
      || before.sow.flows.cooling !== 1 || before.sow.ash.falling <= 0 || before.sow.ash.ground !== 1) {
    throw new Error('The eruption did not produce the ruins, camp, cooled flows and ash needed by this check');
  }
  // A save inside the ruined town's footprint must still let the Wraith land.
  await js('g.requestTeleport(1880, -2040);');
  await settle('!g.controller.hold && g.game.worldSettled()', 'the save location near Cinderhold');
  const saved = await js(`
    if (!await g.game.saves.save('slot1')) throw Error(String(g.game.saves.lastError));
    const slots = await g.game.saves.list();
    return slots.find(s => s.slot === 'slot1').updatedAt;
  `);
  await chrome('stop');
  await chrome('e1-chapel', '^&gfx=high');
  await js(`
    if (g.eruption.done) throw Error('Expected a fresh game before loading');
    const s = await g.game.saves.load('slot1');
    if (!s || s.updatedAt !== ${saved}) throw Error('The slot from the earlier Chrome session is missing');
  `);
  await settle(`g.eruption.done && !g.controller.hold && g.game.worldSettled()
    && Math.hypot(g.controller.pos.x - 1880, g.controller.pos.z + 2040) < 12`, 'loaded world near Cinderhold');
  const after = await capture('after');
  const comparison = Object.fromEntries(places.map(({ id }) => [id, Object.fromEntries(
    Object.keys(before[id]).map(key => [key, isDeepStrictEqual(before[id][key], after[id][key])]),
  )]));
  await mkdir('screenshots/' + dir, { recursive: true });
  await writeFile('screenshots/' + dir + '/state.json', JSON.stringify({ comparison, before, after }, null, 2) + '\n');
  console.log(JSON.stringify(comparison, null, 2));
  if (Object.values(comparison).some(place => Object.values(place).includes(false))) process.exitCode = 1;
} finally {
  await chrome('stop');
}

