// Bot: play "The Stones That Listen": Maud in Hearn, the three stones on the lake shore (press E to listen, then the
// Gale gestures each asks for, aimed at it with the camera), the Echo, attuning it at the Green Shrine, Maud's thanks.
import { bot, js, say, logState, setupStory, quest, flags, talk, shot, faceNpc } from './side-lib.mjs';

await setupStory({ bellwether: true });
await bot('teleport', { x: 62, z: 940 });
await bot('walkTo', { x: 80, z: 962, roads: true, timeout: 30 });
await faceNpc('meadow-maud'); await bot('wait', { ms: 600 });
say('shot', (await shot('echo-1-direction-maud')).file);
await talk('meadow-maud'); await talk('meadow-maud'); say('after Maud:', await quest('meadow-side-echoes'));
const shore = await js(`return g.chapter.table['side-echo-shore'].pos`);
await bot('face', { x: shore[0], z: shore[1], pitch: 0.05 }); await bot('wait', { ms: 600 });
say('shot', (await shot('echo-2-direction-stones')).file);
await bot('teleport', { x: shore[0] + 30, z: shore[1] + 10 }); await bot('wait', { ms: 2500 });   // (the walk there is the lamp's: a straight run west)
say('quest', await quest('meadow-side-echoes'));
await js(`g.elements.select('gale'); return g.elements.active`);

async function standAt(id, dist = 9) {
  const st = await js(`const p=g.chapter.table['${id}'].pos; return p`);
  const me = await js('const q=g.controller.pos;return [q.x,q.z]');
  const d = Math.hypot(me[0] - st[0], me[1] - st[1]) || 1;
  await bot('walkTo', { x: st[0] + (me[0] - st[0]) / d * dist, z: st[1] + (me[1] - st[1]) / d * dist, arrive: 1.5, timeout: 20 });
  return st;
}
async function aimAt(st) {
  const y = await js(`g.ground.qx=${st[0]};g.ground.qz=${st[1]};g.ground.sample();return g.ground.h`);
  await bot('aim', { x: st[0], y: y + 0.3, z: st[1] });
}
const DO = {
  gust: async () => bot('press', { key: 'Primary' }),
  updraft: async () => bot('press', { key: 'Heavy' }),
  vortex: async () => bot('hold', { keys: ['Primary'], ms: 2400 }),
};
for (const k of [1, 2, 3]) {
  const id = 'side-echo-' + k, ask = await js(`return g.chapter.table['${id}'].ask`);
  const st = await standAt(id, 1.8);
  await bot('face', { x: st[0], z: st[1], pitch: 0.1 });
  logState(await bot('press', { key: 'Interact' }));
  say('stone', k, 'asks', ask.join(', '), '| task:', (await bot('state')).task);
  await standAt(id, 6);
  for (const verb of ask) {
    await aimAt(st);
    const r = await DO[verb](); logState(r);
    await bot('wait', { ms: 900 });
    say('  ', verb, '→ task:', (await bot('state')).task, '| stones', JSON.stringify(await js('return g.chapter.graph.vars["side.stones"]||0')));
  }
  if (k === 1) say('shot', (await shot('echo-3-first-answered')).file);
}
say('quest', await quest('meadow-side-echoes'), 'echoes', JSON.stringify(await js('return [...g.chapter.echoes]')));
say('shot', (await shot('echo-4-all-answered')).file);
// Attune at the Green Shrine (rest there, then attune through the shrine page logic).
const sh = await js(`return g.chapter.table['shrine-meadow-6'].pos`);
await bot('teleport', { x: sh[0] + 3, z: sh[1] - 4 }); await bot('wait', { ms: 2500 });
await bot('face', { x: sh[0], z: sh[1], pitch: 0.2 }); await bot('wait', { ms: 500 });
say('shot', (await shot('echo-5-green-shrine')).file);
logState(await bot('press', { key: 'Interact' }));
await bot('wait', { ms: 1000 });
await js(`g.chapter.attune('echo-meadow-wind'); return g.chapter.attuned('echo-meadow-wind')`);
say('gust range now', await js(`const m=await import('/assets/'+[...document.scripts].length+'.js').catch(()=>null);return 'n/a'`));
await bot('wait', { ms: 800 });
say('quest', await quest('meadow-side-echoes'));
await bot('release');
await js(`g.menus && g.menus.close_ ; document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'})); return 1`);
await bot('teleport', { x: 80, z: 962 }); await talk('meadow-maud'); await bot('wait', { ms: 1500 });
say('final', await quest('meadow-side-echoes'));
