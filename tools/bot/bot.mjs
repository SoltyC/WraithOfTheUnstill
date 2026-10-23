#!/usr/bin/env node
// Play the live game from a terminal (src/core/bot.js, vite.config.js botBridge).
//   node tools/bot/bot.mjs <command> [json args]      e.g.  walkTo '{"x":150,"z":1200}'
//   node tools/bot/bot.mjs status
// Commands: state {full}, perf {frames}, hold {keys,ms}, press {key}, look {yaw,pitch,dyaw}, face {x,z},
// walkTo {x,z,timeout,arrive}, talkTo {id}, wait {ms}, shot {name}, spot {id}, teleport {x,z}, eval {js}, release.
const base = process.env.WRAITH_URL || 'http://localhost:4173';
const [, , cmd, arg] = process.argv;
if (!cmd) { console.error('usage: bot.mjs <command> [json]'); process.exit(1); }
if (cmd === 'status') { console.log(JSON.stringify(await (await fetch(base + '/__wraith/bot/status')).json())); process.exit(0); }
const body = { do: cmd, ...(arg ? JSON.parse(arg) : {}) };
const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify(body) })).json();
const wait = Number(process.env.BOT_WAIT || 180000);
const r = await fetch(`${base}/__wraith/bot/reply?id=${id}&wait=${wait}`);
const out = await r.json();
console.log(JSON.stringify(out, null, process.env.BOT_PRETTY ? 1 : 0));
process.exit(out.ok === false || r.status !== 200 ? 2 : 0);
