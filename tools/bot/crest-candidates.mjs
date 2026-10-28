import fs from 'node:fs';
const base='http://127.0.0.1:4176';
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result??r;}
const spots=JSON.parse(fs.readFileSync('data/photo-spots.json')).spots.filter(s=>s.id.startsWith('p9d2-silhouette-'));
const report=[];
for(const spot of spots){
const setup=await cmd({do:'eval',js:`
g.terrainState.relaxation.enabled=false;g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();
g.ws.restoration.frost='restored';g.ws.restoration.meadow='restored';g.ws.restoration.dunes='restored';g.restoration.snap=true;
g.game.applySpot(${JSON.stringify(spot)});g.clock.pinHour=${spot.time};
w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.version++;
g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;const canvas=g.engine.getRenderingCanvas();canvas.style.width='2560px';canvas.style.height='1440px';g.engine.resize();
for(let i=0;i<600&&!g.game.worldSettled();i++)await new Promise(r=>requestAnimationFrame(r));for(let i=0;i<90;i++)await new Promise(r=>requestAnimationFrame(r));
return {camera:g.camera.position.asArray(),fov:g.camera.fov,width:g.engine.getRenderWidth(),height:g.engine.getRenderHeight(),gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`});
const shot=await cmd({do:'shot',name:spot.id,dir:'d2-silhouette-raw',hud:false});report.push({id:spot.id,setup,file:shot.file});console.log(report.at(-1));
}
fs.writeFileSync('docs/phase-9/relaxation/silhouette-captures.json',JSON.stringify({date:new Date().toISOString(),report},null,2)+'\n');
