// Bot: play "The Fen Lamp" start to finish: Ketil in Hearn (day: told to come back; night: the flame), the carry
// along the lake shore, the lamp, and Ketil's thanks. Screenshots (with the HUD painted in) to screenshots/p8-side/.
import { bot, js, say, logState, setupStory, quest, flags, goTo, leaveVillage, talk, shot, faceNpc } from './side-lib.mjs';

await setupStory({ night: false });
say('quest', await quest('meadow-side-lamp'));
await bot('walkTo', { x: 100, z: 945, timeout: 30 });
await faceNpc('meadow-ketil'); await bot('wait', { ms: 800 });
say('shot', (await shot('lamp-1-direction-ketil')).file);
await talk('meadow-ketil'); say('after the first talk:', await quest('meadow-side-lamp'));
await talk('meadow-ketil'); say('by day (should say come back after dark):', await quest('meadow-side-lamp'));
await js(`g.params.v.timeOfDay=21.5; g.params.version++; return 1`); await bot('wait', { ms: 1500 });
await talk('meadow-ketil'); say('at night:', await quest('meadow-side-lamp'), 'carrying', await js('return g.flame.carrying'));
// The carry: to the lamp along the shore, walking.
const lamp = await js(`const p=g.chapter.table['side-fen-lamp'].pos;return p`);
await bot('face', { x: lamp[0], z: lamp[1], pitch: 0.08 }); await bot('wait', { ms: 800 });
say('shot', (await shot('lamp-2-direction-lamp')).file);
await leaveVillage();
let r = await goTo(lamp[0], lamp[1], { arrive: 3, maxSlope: 1.4 });
say('arrived', r && JSON.stringify(r.walk), 'flame', await js('return {c:g.flame.carrying,s:+g.flame.strength.toFixed(2),wind:+g.flame.wind.toFixed(2)}'));
await faceNpc('meadow-ketil').catch(() => {});
await bot('face', { x: lamp[0], z: lamp[1], pitch: 0.2 });
r = await bot('press', { key: 'Interact' }); logState(r);
await bot('wait', { ms: 1500 });
say('lit?', await flags(), await quest('meadow-side-lamp'));
say('shot', (await shot('lamp-3-lit')).file);
await talk('meadow-ketil'); say('final:', await quest('meadow-side-lamp'));
