#!/usr/bin/env node
// Cinderhold, played (docs/phase-11/ember-design.md §4.1): node tools/bot/cinder-run.mjs vote | expose
//   vote:   read the bell, show Teg; three Sow families on the road move Vell; the guild votes; Cinderhold goes by the tube.
//   expose: look in the tithe cage, take Bron to it; the miners bring up the debtors and leave on foot; the guild stays.
import { bot, js } from './client.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mode = process.argv[2] || 'vote';
const flags = async () => js(`return [...g.chapter.graph.flags].filter(f=>/^ember:(cin|teg|vell|orrin|bron|tithe|tube|debt)|know:tithe/.test(f))`);
const skip = async () => { for (let i = 0; i < 40; i++) { const c = await js(`return g.chapter.current`); if (!c) return null; if (c.options) return c.options; await js(`g.chapter.updateDialogue(30,true,-1);return 1`); await sleep(60); } return null; };
const choose = async (k) => { const c = await js(`return g.chapter.current`); if (!c?.options) { console.log('  (no choice open)'); return null; } console.log('  →', c.options[k]); await js(`g.chapter.updateDialogue(0,false,${k});return 1`); await sleep(200); return skip(); };
const talk = async (id) => { await bot('talkTo', { id, ms: 600 }); return skip(); };
const tp = async (x, z) => { await js(`g.requestTeleport(${x},${z});return 1`); for (let i = 0; i < 40; i++) { await sleep(500); if (await js(`return !g.pendingTp?.active && !g.controller.hold`)) break; } await sleep(1500); };
const pt = async (k) => js(`return g.chapter.table['cin-${k}'].pos`);
const log = async (what) => console.log(what.padEnd(22), JSON.stringify(await flags()));
await js(`g.params.v.timeOfDay=11;g.params.version++;g.chapter.graph.flags.add('ember:warned');return 1`);
const C = await js(`return g.chapter.table['ember-cinderhold'].pos`);
await tp(C[0] - 30, C[1] + 25);
console.log('morcant', JSON.stringify(await talk('ember-orrin')));
if (mode === 'vote') {
  const T = await pt('thermo'); await tp(T[0] - 2.5, T[1]); await bot('face', { x: T[0], z: T[1] }); await bot('press', { key: 'Interact' }); await sleep(800); await log('bell read');
  console.log('teg', JSON.stringify(await talk('ember-teg'))); await choose(0);
  await bot('follow', { id: 'ember-teg', flag: 'ember:teg-yes', dist: 3, timeout: 60 }); await skip(); await log('teg shown');
  await js(`const F=g.chapter.graph.flags;for(const id of ['bethan','huw','ffion'])F.add('ember:'+id+'-go');return 1`); await sleep(2500); await log('sow on the road');
  await sleep(4000);
  console.log(JSON.stringify(await js(`return [...g.cinderhold.people].map(([id,n])=>[id,Math.round(n.x),Math.round(n.z),n.hide,n.leg??null])`)));
} else {
  const S = await pt('shaft'); await tp(S[0] - 3.5, S[1] - 2); await bot('face', { x: S[0], z: S[1] }); await bot('press', { key: 'Interact' }); await sleep(800); await log('cage seen');
  console.log('bron', JSON.stringify(await talk('ember-bron'))); await choose(0);
  await bot('follow', { id: 'ember-bron', flag: 'ember:tithe-exposed', dist: 3, timeout: 60 }); await skip(); await log('bron shown');
  await sleep(4000);
  console.log(JSON.stringify(await js(`return [...g.cinderhold.people].map(([id,n])=>[id,Math.round(n.x),Math.round(n.z),n.hide,n.leg??null])`)));
  console.log('morcant after', JSON.stringify(await js(`g.chapter.talk('ember-orrin');return g.chapter.current`)));
}
console.log('quest', JSON.stringify(await js(`return g.chapter.graph.quests['ember-cinderhold']`)), 'err', await js(`return w.gpuStats.gpuErrors`));
