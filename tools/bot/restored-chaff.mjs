// Dunn's "The Chaff" and Ketil's lantern, played: clear the chaff with three Gusts downwind, then (by night) lift the lantern.
//   PORT=4176 tools/bot/play.sh p8r-chaff-floor   then   WRAITH_URL=http://localhost:4176 node tools/bot/restored-chaff.mjs [chaff|lantern]
import { bot, js, say, ok, wait, restoredWorld, flags } from './restored-lib.mjs';
const part = process.argv[2] || 'chaff', dir = 'polish2';
const shotAt = (name, yaw, pitch, zoom) => js(`g.arm.yaw=${yaw}; g.arm.pitch=${pitch}; g.arm.zoomTarget=${zoom}; return 1`).then(() => wait(1500)).then(() => bot('shot', { name, dir }));
if (part === 'chaff') {
  await restoredWorld({ hour: 11 });
  await js(`g.chapter.graph.flags.add('meadow:chaff-told'); return 1`);
  const D = await js(`const f=g.restoredData.chaff; g.wind.sx=f.pos[0]; g.wind.sz=f.pos[1]; g.wind.sample(); return [f.pos[0], f.pos[1], g.wind.outX, g.wind.outZ]`);
  const [fx, fz, wx, wz] = D, n = Math.hypot(wx, wz) || 1, ux = wx / n, uz = wz / n;
  say('wind', wx.toFixed(2), wz.toFixed(2));
  await bot('teleport', { x: fx - ux * 12, z: fz - uz * 12 }); await wait(4000);
  await bot('face', { x: fx, z: fz, pitch: 0.12 });
  await shotAt('chaff-1-before', Math.atan2(ux, uz) + 0.5, 0.35, 9);
  for (let k = 1; k <= 3; k++) {
    await bot('face', { x: fx, z: fz, pitch: 0.12 });
    await js(`g.gale.castGust=true; return 1`); await wait(700);
    if (k === 2) await bot('shot', { name: 'chaff-2-gust', dir });
    await wait(1800);
    say('gust', k, await flags('chaff'));
  }
  await wait(1500);
  ok((await flags('chaff-cleared')).length === 1, 'chaff cleared');
  await shotAt('chaff-3-cleared', Math.atan2(ux, uz) + 0.5, 0.35, 9);
} else {
  await restoredWorld({ hour: 21.5 });
  await js(`g.chapter.graph.flags.add('meadow:lantern-told'); return 1`);
  const l = await js(`return g.restoredData.lantern.pos`);
  await bot('teleport', { x: l[0] - 3, z: l[1] }); await wait(4000);
  await bot('face', { x: l[0], z: l[1], pitch: 0.2 });
  await shotAt('lantern-1-before', 1.8, 0.25, 6);
  await bot('face', { x: l[0] + 0.5, z: l[1], pitch: 0.4 });
  await js(`g.gale.castUpdraft=true; return 1`);
  for (const [k, ms] of [[2, 2500], [3, 3500], [4, 3500]]) { await wait(ms); await shotAt('lantern-' + k + '-rise', 1.8, -0.2, 14); say('lantern', k); }
  await wait(6000);
  await shotAt('lantern-5-aloft', 1.8, 0.7, 30);
  ok((await flags('lantern-lit')).length === 1, 'lantern lit');
}
