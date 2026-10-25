// Bot: the Bellwether's first phase from the forecourt: Gust the turf off the three chimneys, as a player
// would (aim the camera at a chimney, tap Bend (Q)), watching the gale and taking cover when it breathes.
import { bot, js } from './client.mjs';
const t0 = Date.now(), T = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's';
const say = (...a) => console.log(T(), ...a);
const logs = (s) => { for (const l of s.log || []) if (!/BARK/.test(l)) say('  |', l); };
let s = await bot('press', { key: 'Element2' }); logs(s);
const vents = await js(`const f=g.bellFight,o=[];for(let k=0;k<3;k++){const q=f.ventPos(k,{});o.push([q.x,q.y,q.z])}return o`);
for (let k = 0; k < 3; k++) {
  for (let tries = 0; tries < 8; tries++) {
    s = await bot('state');
    if (s.bell.vents[k] <= 0) break;
    if (s.focus < 15) { await bot('wait', { ms: 2000 }); continue; }
    const v = vents[k];
    s = await bot('aim', { x: v[0], y: v[1], z: v[2] });
    s = await bot('press', { key: 'Bend' });
    await bot('wait', { ms: 700 });
    s = await bot('state');
    say(`vent ${k} try ${tries}: vents ${s.bell.vents.join(',')} | phase ${s.bell.phase} galeIn ${s.bell.galeIn} | health ${s.health.toFixed(0)} focus ${s.focus.toFixed(0)} | ${s.bell.hint}`);
    logs(s);
  }
}
s = await bot('wait', { ms: 3000 });
say('after vents:', JSON.stringify(s.bell), 'health', s.health, 'fps', s.perf && s.perf.fps); logs(s);
await bot('shot', { name: 'b05-vents' });
