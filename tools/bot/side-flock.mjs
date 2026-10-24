// Bot: play "The Flock in the Barley": Dunn in Hearn, the barley north of the village, walk the field so the Sedgerunners
// flush, fight them (Sweep/Gust when they come), Dunn's thanks and the barley cloak.
import { bot, js, say, logState, setupStory, quest, flags, goTo, leaveVillage, talk, shot, faceNpc } from './side-lib.mjs';

await setupStory({});
say('quest', await quest('meadow-side-flock'));
await bot('walkTo', { x: 100, z: 955, roads: true, timeout: 40 });
await faceNpc('meadow-dunn'); await bot('wait', { ms: 800 });
say('shot', (await shot('flock-1-direction-dunn')).file);
await talk('meadow-dunn'); await talk('meadow-dunn'); say('after Dunn:', await quest('meadow-side-flock'));
const b = await js(`return g.chapter.table['side-barley'].pos`);
await bot('face', { x: b[0], z: b[1], pitch: 0.05 }); await bot('wait', { ms: 800 });
say('shot', (await shot('flock-2-direction-barley')).file);
let r = await bot('walkTo', { x: 30, z: 1072, roads: true, arrive: 4, timeout: 80 });
r = await goTo(b[0], b[1] - 25, { arrive: 4, maxSlope: 1.4 });
say('at the field edge', JSON.stringify(r && r.walk), await quest('meadow-side-flock'));
const shaped = () => js(`const s=g.shaped.slots.map((q,i)=>({i,st:q.state,arch:q.arch,x:q.body?Math.round(q.body.x):0,z:q.body?Math.round(q.body.z):0})).filter(q=>q.st!==${0}); return {n:s.length,s,hp:g.combat.health}`);
say('shaped at the edge', JSON.stringify(await shaped()));
// Walk the field north through the middle, attacking whatever comes (Sweep: tap Primary facing the nearest).
for (let pass = 0; pass < 12; pass++) {
  const left = await shaped();
  if (!left.n && pass > 0) break;
  const p = await js('const q=g.controller.pos;return [q.x,q.z]');
  const tx = b[0] + (pass % 2 ? 12 : -12), tz = b[1] + (pass < 3 ? 10 : -6);
  await bot('walkTo', { x: tx, z: tz, arrive: 3, timeout: 12 });
  for (let k = 0; k < 6; k++) {
    const s = await shaped(); if (!s.n) break;
    const me = await js('const q=g.controller.pos;return [q.x,q.z]');
    const near = s.s.sort((a, c) => Math.hypot(a.x - me[0], a.z - me[1]) - Math.hypot(c.x - me[0], c.z - me[1]))[0];
    await bot('face', { x: near.x, z: near.z, pitch: 0.1 });
    r = await bot('press', { key: 'Primary' }); logState(r);
    await bot('wait', { ms: 500 });
  }
  say('pass', pass, 'shaped', JSON.stringify((await shaped()).n), 'health', (await shaped()).hp.toFixed(0), await quest('meadow-side-flock'));
}
say('shot', (await shot('flock-3-field')).file);
say('flags', JSON.stringify(await flags()), await quest('meadow-side-flock'));

await talk('meadow-dunn'); await talk('meadow-dunn'); say('final:', await quest('meadow-side-flock'), 'robe', await js(`return g.chapter.graph.flags.has('robe:barley')`));
