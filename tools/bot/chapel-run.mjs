#!/usr/bin/env node
// The Ash Chapel, played (docs/phase-11/ember-design.md §4.2): node tools/bot/chapel-run.mjs [force|promise|leave]
// The Seer; the scripture read; the spring tasted; a bird from the still hollow; speaking through the bell (rude: three omens
// then); the mountain at Breathing (the third); Nerys read the end; the faithful go down; then the Seer.
import { bot, js } from './client.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seer = { force: 0, promise: 1, leave: 2 }[process.argv[2] || 'force'];
const flags = async () => js(`return [...g.chapter.graph.flags].filter(f=>/^ember:(omen|scripture|chapel|seer|annick|path|bells)/.test(f))`);
const skip = async () => { for (let i = 0; i < 40; i++) { const c = await js(`return g.chapter.current`); if (!c) return null; if (c.options) return c.options; await js(`g.chapter.updateDialogue(30,true,-1);return 1`); await sleep(60); } return null; };
const choose = async (k) => { const c = await js(`return g.chapter.current`); if (!c?.options) { console.log('  (no choice open)'); return null; } console.log('  →', c.options[k]); await js(`g.chapter.updateDialogue(0,false,${k});return 1`); await sleep(200); return skip(); };
const talk = async (id) => { await bot('talkTo', { id, ms: 600 }); const c = await js(`return g.chapter.current`); console.log('  ' + id + ':', c ? (c.text || '[choice]') : '-'); return skip(); };
const tp = async (x, z) => { await js(`g.requestTeleport(${x},${z});return 1`); for (let i = 0; i < 40; i++) { await sleep(500); if (await js(`return !g.pendingTp?.active && !g.controller.hold`)) break; } await sleep(1500); };
const pos = async (k) => js(`return g.chapter.table['${k}'].pos`);
const look = async (k, dx = 2, dz = 0) => { const P = await pos(k); await tp(P[0] - dx, P[1] - dz); await bot('face', { x: P[0], z: P[1] }); await bot('press', { key: 'Interact' }); await sleep(800); };
const log = async (what) => console.log(what.padEnd(20), JSON.stringify(await flags()), 'omens', await js(`return g.chapter.graph.vars['ember:omens']`));
await js(`g.params.v.timeOfDay=10.3;g.params.version++;g.chapter.graph.flags.add('ember:warned');return 1`);
const C = await pos('ember-chapel'); await tp(C[0] - 12, C[1] - 6);
await talk('ember-annick'); await log('seer met');
await look('ash-scripture', 2.2, 0); await log('scripture');
const S = await js(`return g.interactables.find(t=>t.id==='ash-spring')`); await tp(S.x - 2.2, S.z); await bot('face', { x: S.x, z: S.z }); await bot('press', { key: 'Interact' }); await sleep(800); await log('spring');
await look('ember-hollow', 3, 0); await log('birds');
// Speak through the bell.
await tp(C[0] + 2, C[1] + 4); await js(`g.ashChapel.ring();return 1`); await sleep(300);
await talk('ember-edda'); await log('spoke in the bell');
await js(`await new Promise(r=>setTimeout(r,26000));return 1`);
await talk('ember-edda'); await log('after the bell');
// The mountain at Breathing: the third omen.
await js(`g.chapter.graph.vars['ember:day']=2;return 1`); await sleep(1500); await log('breathing');
console.log(JSON.stringify(await talk('ember-edda'))); await choose(0); await sleep(1500); await log('nerys read');
await js(`await new Promise(r=>setTimeout(r,45000));return 1`);   // (the Seer walks to the spring)
console.log(JSON.stringify(await talk('ember-annick'))); await choose(seer); await skip(); await sleep(1500); await log('the seer');
await sleep(4000);
console.log(JSON.stringify(await js(`return g.npcs.filter(n=>/annick|edda|corwen|lio|ysolt|brannoc/.test(n.id)).map(n=>[n.id,Math.round(n.x),Math.round(n.z),n.leg??null])`)));
console.log('quest', JSON.stringify(await js(`return g.chapter.graph.quests['ember-chapel']`)), 'err', await js(`return w.gpuStats.gpuErrors`));
