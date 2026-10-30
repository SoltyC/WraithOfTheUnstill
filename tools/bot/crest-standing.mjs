#!/usr/bin/env node
import fs from 'node:fs';
const base = process.env.WRAITH_URL || 'http://127.0.0.1:4176';
const reports = [];
for (const [x, z] of [[2605, 685], [1415, -1670]]) {
  const js = `
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    g.terrainState.relaxation.enabled=false;g.arm.setFree(false);g.game.setPlayerVisible(true);
    g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.combat.dying=0;g.combat.health=100;
    g.game.teleport(${x},${z});
    for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
    if(!g.game.worldSettled())throw new Error('World did not settle');
    let maxFootError=0,groundedFrames=0;
    for(let i=0;i<120;i++){
      await frame();const p=g.controller.pos;g.ground.qx=p.x;g.ground.qz=p.z;g.ground.sample();
      maxFootError=Math.max(maxFootError,Math.abs(p.y-g.ground.h));if(g.controller.grounded)groundedFrames++;
    }
    return {target:[${x},${z}],position:{...g.controller.pos},groundHeight:g.ground.h,maxFootError,groundedFrames,
      gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
  `;
  const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify({ do: 'eval', js }) })).json();
  const reply = await (await fetch(base + '/__wraith/bot/reply?id=' + id + '&wait=180000')).json();
  if (!reply.ok) throw new Error(reply.error);
  reports.push(reply.result); console.log(JSON.stringify(reply.result));
}
fs.writeFileSync('docs/phase-9/relaxation/crest-standing.json', JSON.stringify({ date: new Date().toISOString(), reports }, null, 2) + '\n');
if (reports.some(r => r.groundedFrames < 118 || r.maxFootError > 0.01 || r.gpuErrors || r.late.length)) process.exitCode = 1;
