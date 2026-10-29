import fs from 'node:fs';
const base='http://localhost:4181';
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(JSON.stringify(r));return r.result??r;}
const initial=await cmd({do:'eval',js:`
if(!g.sandstorm||g.post.post.params.length!==144)throw new Error('Wrong storm prototype build');if(w.gpuStats.gpuErrors)throw new Error('Initial GPU errors: '+JSON.stringify(w.gpuStats.gpuErrorMessages));
w.frontGpuMessages=[];w.gpuStats.device.addEventListener('uncapturederror',e=>w.frontGpuMessages.push(e.error.message));g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=true;g.clock.pinHour=13;w.params.v.timeOfDay=13;w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.version++;
const frame=()=>new Promise(r=>requestAnimationFrame(r)),c=g.engine.getRenderingCanvas();c.style.width='2560px';c.style.height='1440px';g.engine.resize();g.engine.setSize(2560,1440);
g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;g.ws.weatherOverride='clear';g.ws.wetForce=0;g.ws.puddleForce=0;g.game.teleport(2400,900);
for(let i=0;i<600&&(!g.game.worldSettled()||!g.game.stateSettled());i++)await frame();for(let i=0;i<180;i++)await frame();g.game.killShaped();g.game.setPlayerVisible(true);g.arm.setFree(true);g.arm.freePos.x=2406;g.arm.freePos.y=g.controller.pos.y+2.5;g.arm.freePos.z=900;g.arm.yaw=-Math.PI/2;g.arm.pitch=.035;g.arm.fov=.9;
g.restoration.snap=true;for(let i=0;i<120;i++)await frame();g.weather.snap=true;g.atmosphere.alwaysSnap=true;for(let i=0;i<90;i++)await frame();w.botShotWidth=1280;
return {camera:g.camera.position.asArray(),actor:g.controller.pos.y,output:[c.width,c.height],parameters:g.post.post.params.length,stormDefault:g.weather.duneStorms,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`});
console.log(initial);
const reports=[];
for(const [age,hour] of [[-1,13],[45,13],[75,13],[95,13],[95,18],[95,1]]){
 const result=await cmd({do:'eval',js:`
 g.clock.pinHour=${hour};w.params.v.timeOfDay=${hour};w.params.version++;
 const f=g.sandstorm;f.enabled=${age>=0};f.target=${age>=0?1:0};f.active=false;f.strength=0;f.anchorX=2400;f.anchorZ=900;f.baseY=g.controller.pos.y;f.dirX=1;f.dirZ=0;f.dt=0;f.snap=true;f.update();if(${age}>=0){f.age=${age};f.update();}
 const first=g.scene.getFrameId();for(let i=0;i<150;i++)await new Promise(r=>requestAnimationFrame(r));if(g.scene.getFrameId()-first<140)throw new Error('Render stalled');
 const c=g.engine.getRenderingCanvas(),im=new OffscreenCanvas(c.width,c.height),ctx=im.getContext('2d',{willReadFrequently:true});ctx.drawImage(c,0,0);const a=ctx.getImageData(0,0,c.width,c.height).data;let clipped=0,luma=0;for(let i=0;i<a.length;i+=4){if(Math.max(a[i],a[i+1],a[i+2])>=253)clipped++;luma+=.2126*a[i]+.7152*a[i+1]+.0722*a[i+2];}
 g.wind.sx=g.controller.pos.x;g.wind.sz=g.controller.pos.z;g.wind.sample();
 const wind={block:g.wind.block.slice(),speed:g.wind.speed,x:g.wind.outX,z:g.wind.outZ,density:g.wind.density,weight:g.wind.stormWeight};
 const p=g.post.post.params;for(let k=0;k<8;k++)if(p[120+k]!==Math.fround(g.wind.block[k]))throw new Error('SSR wind core mismatch '+k);
 if(p[140]!==Math.fround(g.wind.stormWeight))throw new Error('SSR wind gate mismatch');
 return {hour:${hour},wind,age:f.age,plane:f.plane,strength:f.strength,localDensity:g.atmosphere.sandStorm,desert:Array.from(g.post.post.params.slice(128,144)),sceneFrames:g.scene.getFrameId()-first,clippedPixels:clipped,meanLuma:luma/(c.width*c.height),gpuErrors:w.gpuStats.gpuErrors,gpuMessages:w.frontGpuMessages,late:w.gpuStats.late};`});
 const shot=await cmd({do:'shot',name:(age<0?'wind-off':'wind-age-'+age)+'-hour-'+hour,dir:'d6-storm-wind',hud:false});reports.push({...result,file:shot.file});console.log(reports.at(-1));
 fs.mkdirSync('docs/phase-9/storm-front',{recursive:true});fs.writeFileSync('docs/phase-9/storm-front/wind-views.json',JSON.stringify({date:new Date().toISOString(),initial,reports,note:'Prototype only: manually armed world-front at fixed erg anchor, native1440p view/near Wraith, fixed clear restored noon, snapped exposure, age poses. Normal weather.duneStorms stays false. Shared storm wind and SSR compile/render smoke test. Fixed scene and near Wraith, no human cloth/water art acceptance, moving border, allocation, streak/erasure/shelter/audio or full storm acceptance.'},null,2)+'\n');
}
if(reports.some(r=>r.gpuErrors||r.late.length||r.meanLuma<=0)||initial.stormDefault||initial.gpuErrors||initial.late.length)process.exitCode=1;
