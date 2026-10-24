// Bot: play "The Fallen Stone": Orm in Hearn, the Ring of Nine, three Updrafts at the stone's head, middle and foot
// (Gale in hand, Heavy aimed with the camera), the stone standing, Orm's thanks.
import { bot, js, say, logState, setupStory, quest, flags, goTo, leaveVillage, talk, shot, faceNpc } from './side-lib.mjs';

await setupStory({ bellwether: true });
say('quest', await quest('meadow-side-stone'));
await bot('walkTo', { x: 62, z: 940, roads: true, timeout: 40 });
await faceNpc('meadow-orm'); await bot('wait', { ms: 800 });
say('shot', (await shot('stone-1-direction-orm')).file);
await talk('meadow-orm'); await talk('meadow-orm'); say('after Orm:', await quest('meadow-side-stone'));
const ring = await js(`return g.chapter.table['side-stone-ring'].pos`);
await bot('face', { x: ring[0], z: ring[1], pitch: 0.05 }); await bot('wait', { ms: 800 });
say('shot', (await shot('stone-2-direction-ring')).file);
await leaveVillage(142, 860);
let r = await goTo(ring[0], ring[1] - 10, { arrive: 4, maxSlope: 1.4 });
say('at the ring', JSON.stringify(r && r.walk), await quest('meadow-side-stone'));
// The marks: head, middle, foot of the lying stone.
const marks = await js(`const m=await import('/src/world/sideSites.js'); return m.stoneRingGeometry(g.chapter.table['side-stone-ring'].pos).marks`).catch(() => null);
const geo = marks || (() => { const dx = Math.sin(0.6), dz = Math.cos(0.6), sx = ring[0] + dx * 9, sz = ring[1] + dz * 9; return [0.88, 0.5, 0.12].map((t) => [sx + dx * 5.4 * t, sz + dz * 5.4 * t]); })();
await js(`g.elements.select('gale'); return g.elements.active`);
say('shot', (await shot('stone-3-before')).file);
let k = 0;
for (const [x, z] of geo) {
  // Stand ~7 m off the mark, face it, aim the view ray at the ground there, tap Heavy (Updraft).
  const p = await js('const q=g.controller.pos;return [q.x,q.z]');
  const d = Math.hypot(p[0] - x, p[1] - z), ux = (p[0] - x) / d, uz = (p[1] - z) / d;
  await bot('walkTo', { x: x + ux * 7, z: z + uz * 7, arrive: 1.5, timeout: 15 });
  const y = await js(`g.ground.qx=${x};g.ground.qz=${z};g.ground.sample();return g.ground.h`);
  await bot('aim', { x, y, z });
  const aimed = await js(`return [g.gale?.tx, g.gale?.tz]`);
  r = await bot('press', { key: 'Heavy' }); logState(r);
  await bot('wait', { ms: 700 });
  say('mark', ++k, 'aimed at', aimed.map((v) => v && v.toFixed(1)).join(','), 'want', x.toFixed(1), z.toFixed(1), '→ task', r.task, await quest('meadow-side-stone'));
}
await bot('wait', { ms: 5000 });
say('flags', JSON.stringify(await flags()), await quest('meadow-side-stone'));
say('shot', (await shot('stone-4-raised')).file);
await talk('meadow-orm'); await talk('meadow-orm'); say('final:', await quest('meadow-side-stone'));
