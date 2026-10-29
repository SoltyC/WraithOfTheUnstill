import fs from 'node:fs';
const base='http://localhost:4180',label=process.argv[2]||'trial',solver=process.env.SOLVER!=='0',audio=process.env.AUDIO==='1',wet=Number(process.env.WET||0),frozen=process.env.FROZEN==='1',frames=Number(process.env.FRAMES||600);
const faceIndex=Number(process.env.FACE||0);
if(!Number.isInteger(faceIndex)||faceIndex<0||faceIndex>3||frozen&&faceIndex)throw new Error('FACE0..3; frozen fixture uses default corridor');
const pose=faceIndex?JSON.parse(fs.readFileSync('docs/phase-9/sand-surf/slipfaces.json')).faces[faceIndex-1]:{x:1900,z:900,heading:0};
if(!Number.isFinite(wet)||wet<0||wet>1||!Number.isInteger(frames)||frames<120||frames>600)throw new Error('WET0..1 and FRAMES120..600 required');
if(frozen&&frames>180)throw new Error('Frozen corridor fixture supports FRAMES120..180');
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Use a simple report label');
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const reply=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!reply.ok)throw new Error(reply.error);return reply.result??reply;}
let report,shot;
try {
report=await cmd({do:'eval',js:`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));
 g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=false;g.clock.pinHour=16.2;
 const canvas=g.engine.getRenderingCanvas();canvas.style.width='2560px';canvas.style.height='1440px';g.engine.resize();
 w.params.v.dynamicRes=0;w.params.v.renderScale=.7;w.params.v.refillRate=0;w.params.version++;
 g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;g.ws.weatherOverride='clear';g.ws.wetForce=${wet};g.weather.snap=true;
 g.arm.setFree(false);g.game.wraithHeld=false;g.controller.hold=false;g.game.setPlayerVisible(true);
 g.game.teleport(${pose.x},${pose.z});for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
 g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.combat.health=10000;g.combat.dying=0;
 const ts=g.terrainState,r=ts.relaxation;r.enabled=false;ts.restore([]);g.stone.mass.clear();
 for(let i=0;i<120;i++)await frame();
 if(${audio}){
  g.sfx.unlock();const ctx=g.sfx.context();if(!ctx)throw new Error('No audio context');
  await Promise.race([ctx.resume(),new Promise(r=>setTimeout(r,2000))]);
  if(ctx.state!=='running')throw new Error('Actual mixer audio context did not start');
 }
 const sf=g.controller.surf;
 sf.active=false;sf.exiting=false;sf.speed=0;sf.turnRate=0;sf.lean=0;sf.blend=0;
 g.controller.glide.active=false;g.controller.yaw=${pose.heading};
 g.controller.vel.x=0;g.controller.vel.y=0;g.controller.vel.z=0;
 sf.sandUnlocked=true;g.arm.yaw=${pose.heading};g.arm.pitch=.25;
 const originalStamp=ts.stamp,originalEmit=g.wraithView.emit;let stamps=0,grains=0;
 ts.stamp=function(){if(this.bk===1)stamps++;return originalStamp.call(this);};
 g.wraithView.emit=function(){grains++;return originalEmit.call(this);};
 // Explicitly enable the unintegrated solver only for this diagnostic collision run.
 r.enabled=${solver};
 if(${frozen}){
  ts.bx=1900;ts.bz=908;ts.bdx=0;ts.bdz=1;ts.bl=16;ts.bw=4;ts.bd=0;ts.bc=1;ts.bwet=1;ts.bk=3;ts.stamp();
  for(let i=0;i<90;i++)await frame();
 }
 const start=g.clock.simTime,p0=g.controller.pos.asArray?g.controller.pos.asArray():[g.controller.pos.x,g.controller.pos.y,g.controller.pos.z];
 const samples=[],materials=new Uint32Array(16);let active=0,grounded=0,peak=0,maxAge=0,covered=0;
 const timer=w.gpuTimer,oldEvery=timer.sampleEvery,gpuStart=timer.count,raf=[];
 timer.sampleEvery=1;timer.setActive(true);let last=performance.now();
 w.inject('Traverse',true);w.inject('MoveForward',true);
 try{for(let i=0;i<${frames};i++){
  if(i===180)w.inject('MoveRight',true);if(i===240)w.inject('MoveRight',false);
  await frame();const now=performance.now();raf.push(now-last);last=now;const p=g.controller.pos,speed=Math.hypot(g.controller.vel.x,g.controller.vel.z);
  peak=Math.max(peak,speed);if(sf.active)active++;if(g.controller.grounded)grounded++;
  if(sf.material>=0&&sf.material<materials.length)materials[sf.material]++;
  const v=ts.collision.view;v.qx=p.x;v.qz=p.z;if(v.sample()){covered++;maxAge=Math.max(maxAge,g.clock.simTime-v.sampleTime);}
  if(i%30===0)samples.push({audio:${audio}?{context:g.sfx.context().state,active:g.sfx.sandActive,wet:g.sfx.sandWet,frozen:g.sfx.sandFrozen,hiss:g.sfx.sandSound.hissLevel,rush:g.sfx.sandSound.rushLevel}:undefined,i,time:g.clock.simTime,pos:[p.x,p.y,p.z],speed,modelSpeed:sf.speed,throttle:sf.throttle,normal:[sf.nx,sf.ny,sf.nz],heading:sf.heading,material:sf.material,active:sf.active,lean:sf.lean,grounded:g.controller.grounded,blend:sf.blend});
 }}finally{timer.setActive(false);timer.sampleEvery=oldEvery;w.inject('Traverse',false);w.inject('MoveForward',false);w.inject('MoveRight',false);ts.stamp=originalStamp;g.wraithView.emit=originalEmit;g.combat.health=100;}
 await w.gpuStats.device.queue.onSubmittedWorkDone();for(let i=0;i<8;i++)await frame();
 const gpu=[];for(let i=gpuStart;i<timer.count;i++)gpu.push(timer.ms[i%timer.ms.length]);
 const stats=a=>{a.sort((a,b)=>a-b);return {samples:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,p99:a[Math.floor(a.length*.99)],max:a.at(-1)};};
 const p=g.controller.pos;w.botShotWidth=1280;
 return {wetMeasured:g.weather.wet,frameMs:stats(raf),gpuMs:stats(gpu),start:p0,end:[p.x,p.y,p.z],seconds:g.clock.simTime-start,frames:${frames},active,grounded,peak,stamps,grains,materials:Array.from(materials),collision:{covered,maxAge,errors:ts.collision.errors},samples,output:[g.engine.getRenderWidth(),g.engine.getRenderHeight()],internal:[g.post.post.width,g.post.post.height],renderScale:g.post.post.renderScale,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`});
shot=await cmd({do:'shot',dir:'d3-first-input-'+label,name:'after-run',hud:false});
} finally {
await cmd({do:'eval',js:"w.inject('Traverse',false);w.inject('MoveForward',false);w.inject('MoveRight',false);g.terrainState.relaxation.enabled=false;g.controller.surf.sandUnlocked=false;g.combat.health=100;g.ws.wetForce=-1;return true;"});
}
fs.mkdirSync('docs/phase-9/sand-surf',{recursive:true});
fs.writeFileSync('docs/phase-9/sand-surf/first-input-'+label+'.json',JSON.stringify({date:new Date().toISOString(),solver,audio,wet,frozen,pose,...report,file:shot.file,note:'Normal Traverse/forward inputs from rest, optional right carve,recorded number of real rAF frames on actual dunes. Explicit diagnostic sand grant; solver flag recorded; solver disabled afterward. Traversal reset to rest with recorded body/camera heading; no positive speed or active-state injection. Not three authored slip faces, whole persistence, performance, allocation or human-feel acceptance.'},null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if((audio&&!frozen&&!report.samples.some(s=>s.audio.rush>0))||(audio&&frozen&&report.samples.some(s=>s.audio.hiss+s.audio.rush>0))||Math.abs(report.wetMeasured-wet)>.01||(frozen&&(report.stamps!==0||report.grains!==0))||report.gpuErrors||report.late.length||report.active<frames*.9||(!frozen&&report.stamps<frames*.6)||(wet===1&&report.grains!==0)||report.collision.errors)process.exitCode=1;
