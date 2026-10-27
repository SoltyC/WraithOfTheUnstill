#!/usr/bin/env node
// Reproduce the diagnostic crest views. The views themselves do not sign off the silhouette gate.
import fs from 'node:fs';
const base = process.env.WRAITH_URL || 'http://127.0.0.1:4176';
async function bot(do_, args) {
  const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify({ do: do_, ...args }) })).json();
  const reply = await (await fetch(base + '/__wraith/bot/reply?id=' + id + '&wait=180000')).json();
  if (!reply.ok) throw new Error(reply.error);
  return reply;
}
const spots = JSON.parse(fs.readFileSync('data/photo-spots.json', 'utf8')).spots;
const shots = [];
for (const id of ['p9d2-crest-500', 'p9d2-crest-2000']) {
  const spot = spots.find(s => s.id === id);
  if (!spot) throw new Error('Missing photo spot ' + id);
  const setup = await bot('eval', { js: `
    g.terrainState.relaxation.enabled=false;g.arm.setFree(false);g.game.killShaped();
    for(const s of g.shaped.slots)s.state=0;g.navSync();
    g.game.applySpot(${JSON.stringify(spot)});g.clock.pinHour=${spot.time};
    w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.version++;
    for(let i=0;i<600&&!g.game.worldSettled();i++)await new Promise(resolve=>requestAnimationFrame(resolve));
    if(!g.game.worldSettled())throw new Error('World did not settle');
    for(let i=0;i<90;i++)await new Promise(resolve=>requestAnimationFrame(resolve));
    return {settled:g.game.worldSettled(),actualFov:g.camera.fov,renderScale:g.post.post.renderScale,
      camera:g.camera.position.asArray(),gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
  ` });
  const shot = await bot('shot', { name: id, dir: 'd2-crests-review', hud: false });
  shots.push({ spot, target: { x: 1415, z: -1670, h: 328.0152441543178 }, setup: setup.result, file: shot.file });
  console.log(JSON.stringify(shots.at(-1)));
}
fs.writeFileSync('docs/phase-9/relaxation/crest-captures.json', JSON.stringify({ date: new Date().toISOString(),
  assessment: 'Diagnostic views only: foreground/broad ridge composition does not establish the knife-edge silhouette or motion gate.', shots }, null, 2) + '\n');
if (shots.some(s => s.setup.gpuErrors || s.setup.late.length || Math.abs(s.setup.actualFov - s.spot.camera.fov) > 1e-6 || s.setup.renderScale !== 1)) process.exitCode = 1;
