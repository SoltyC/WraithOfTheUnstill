#!/usr/bin/env node
// Walk up and press Interact: every puzzle target's prompt, through the real key path (the solvers call onUse).
//   tools/bot/play.sh "" ""   then   node tools/bot/puzzle-reach.mjs
import { bot, js } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = await js(`return g.interactables.filter(t=>t.kind==='puzzle').map(t=>t.id)`);
for (const id of ids) {
  const t = await js(`const t=g.interactables.find(t=>t.id==='${id}');return {x:t.x,z:t.z}`);
  await bot('teleport', { x: t.x + 1.8, z: t.z + 1.2 }); await sleep(2600);
  const before = await js(`const t=g.interactables.find(t=>t.id==='${id}');t.__used=0;const f=t.onUse;t.onUse=(...a)=>{t.__used=1;};w.inject('Interact',true);return {hidden:t.hidden,y:+t.y.toFixed(1),py:+g.controller.pos.y.toFixed(1),keep:!!f};`);
  await sleep(120); await js(`w.inject('Interact',false);return 1`); await sleep(120);
  console.log(id, JSON.stringify(before), 'used', await js(`return g.interactables.find(t=>t.id==='${id}').__used`));
}
