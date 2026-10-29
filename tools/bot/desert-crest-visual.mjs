import fs from 'node:fs';
const base='http://localhost:4181';
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=240000')).json();if(!r.ok)throw new Error(JSON.stringify(r));return r.result??r;}
await cmd({do:'eval',js:`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));g.engine.snapshotRendering=false;g.toggles.on.snapshot=false;g.clock.frozen=true;g.clock.pinHour=16.5;w.params.v.timeOfDay=16.5;
 const c=g.engine.getRenderingCanvas();c.style.width='2560px';c.style.height='1440px';w.params.v.renderScale=1;w.params.v.dynamicRes=0;w.params.version++;g.engine.resize();
 g.game.teleport(2514,816);for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();g.game.killShaped();g.game.setPlayerVisible(true);g.arm.setFree(true);g.arm.freePos.x=2498;g.arm.freePos.y=196.5;g.arm.freePos.z=805;g.arm.yaw=1.2;g.arm.pitch=.08;g.arm.fov=.9;
 g.ws.weatherOverride='clear';g.ws.wetForce=0;g.ws.puddleForce=0;g.ws.restoration.frost=g.ws.restoration.meadow='restored';g.ws.restoration.dunes='stilled';g.restoration.snap=true;
 g.terrainState.restore([]);g.sandDust.bursts.reset();g.sandDust.crests=false;g.atmosphere.alwaysSnap=true;g.post.post.jitter=false;g.post.post.grain=0;g.post.taa.on=false;g.loop.add({name:'crestReviewFixedNoise',update(){g.clock.frame=0;}});
 for(let i=0;i<240;i++)await frame();w.botShotWidth=1280;return {camera:g.camera.position.asArray(),gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
`});
const reports=[];
for(const [name,state,wet,on]of [['off','stilled',0,false],['held','stilled',0,true],['released','restored',0,true],['wet','restored',1,true]]){
 const result=await cmd({do:'eval',js:`const frame=()=>new Promise(r=>requestAnimationFrame(r));g.ws.restoration.dunes='${state}';g.restoration.snap=true;g.ws.wetForce=${wet};g.sandDust.crests=${on};const firstFrame=g.scene.getFrameId();for(let i=0;i<180;i++)await frame();if(g.scene.getFrameId()-firstFrame<170)throw new Error("Render loop stalled");
 const c=g.engine.getRenderingCanvas(),im=new OffscreenCanvas(c.width,c.height),ctx=im.getContext('2d',{willReadFrequently:true});ctx.drawImage(c,0,0);const a=ctx.getImageData(0,0,c.width,c.height).data;let changed=0,sum=0,max=0;if(w.crestOff)for(let i=0;i<a.length;i+=4){const v=Math.abs(a[i]-w.crestOff[i])+Math.abs(a[i+1]-w.crestOff[i+1])+Math.abs(a[i+2]-w.crestOff[i+2]);if(v>6)changed++;sum+=v;max=Math.max(max,v);}else w.crestOff=a;
 return {framesAdvanced:g.scene.getFrameId()-firstFrame,camera:g.camera.position.asArray(),restored:g.sandDust.restored,motion:g.sandDust.crestTime,changedPixels:changed,meanRGBDelta:sum/(a.length/4*3),maxRGBSum:max,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`});
 const shot=await cmd({do:'shot',name:'crest-'+name,dir:'d6-crest-review',hud:false});reports.push({name,state,wet,on,...result,file:shot.file});console.log(reports.at(-1));
}
await cmd({do:'eval',js:`g.ws.wetForce=0;g.ws.restoration.dunes='stilled';g.restoration.snap=true;g.post.post.jitter=true;g.post.taa.on=true;g.clock.frozen=false;return true;`});
const film=await cmd({do:'film',name:'crest-release',dir:'d6-crest-review',seconds:8,fps:60,size:[2560,1440],warm:120,js:`cam.off();if(i===180){g.ws.restoration.dunes='restored';}if(i===0){g.ws.restoration.dunes='stilled';g.restoration.snap=true;}`});
const final=await cmd({do:'eval',js:`g.atmosphere.alwaysSnap=false;g.ws.wetForce=-1;return {gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`});
fs.writeFileSync('docs/phase-9/crest-air/visuals.json',JSON.stringify({date:new Date().toISOString(),reports,film,...final,note:'Native1440p still matrix near actual detected crest;1280px review copies. Held/off colour comparison freezes time, shadow-noise index, exposure, grain/jitter/TAA. Released and wet change world restoration/material too and are not isolated crest deltas. Native8s fixed60 release film, release at3s without snapping restoration; not real-time performance or human art acceptance.'},null,2)+'\n');
if(reports.some(r=>r.gpuErrors||r.late.length)||reports[1].changedPixels<100||final.gpuErrors||final.late.length||film.frames!==480||film.failed)process.exitCode=1;
