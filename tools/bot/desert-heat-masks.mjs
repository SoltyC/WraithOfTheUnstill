import fs from 'node:fs';
const base='http://localhost:4181',jitter=process.env.JITTER!=='0',label=jitter?'synchronized':'static';
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result??r;}
console.log(await cmd({do:'eval',js:`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;
 g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;g.ws.weatherOverride='clear';g.ws.wetForce=0;g.weather.snap=true;
 w.heatOldTaa=g.post.taa.on;g.post.taa.on=${jitter};g.clock.frozen=true;g.clock.pinHour=13;w.params.v.timeOfDay=13;w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.version++;
 const canvas=g.engine.getRenderingCanvas();canvas.style.width='1280px';canvas.style.height='720px';g.engine.resize();
 g.game.teleport(1900,900);for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();for(let i=0;i<120;i++)await frame();
 g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.game.setPlayerVisible(true);g.arm.setFree(true);
 g.arm.freePos.x=1900;g.arm.freePos.y=g.controller.pos.y+2;g.arm.freePos.z=896;g.arm.yaw=0;g.arm.pitch=.025;g.arm.fov=.9;
 for(let i=0;i<240;i++)await frame();
 const raw=await g.content.clipmap.buffers.surface.read();w.heatSurface=new Uint32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
 return {gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
`}));
const reports=[];
for(const [name,hour,wet,restored,on]of [['dry-noon',13,0,true,true],['night',1,0,true,true],['wet',13,1,true,true],['stilled',13,0,false,true],['off',13,0,true,false]]){
 const result=await cmd({do:'eval',js:`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));w.params.v.timeOfDay=${hour};w.params.version++;g.ws.wetForce=${wet};g.weather.snap=true;g.ws.restoration.dunes='${restored?'restored':'stilled'}';g.restoration.snap=true;
 const h=g.post.heat;h.on=${on};h.debug=true;for(let i=0;i<30;i++)await frame();
 const device=w.gpuStats.device;g.engine.stopRenderLoop();
 try {
 await device.queue.onSubmittedWorkDone();const P=Array.from(g.post.post.params);
 const color=g.post.taa.out.getInternalTexture()._hardwareTexture.underlyingResource,depth=g.post.post.depthTex.getInternalTexture()._hardwareTexture.underlyingResource;
 const W=color.width,H=color.height,row=Math.ceil(W*8/256)*256,drow=Math.ceil(W*4/256)*256;
 const cb=device.createBuffer({size:row*H,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),db=device.createBuffer({size:drow*H,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 const e=device.createCommandEncoder();e.copyTextureToBuffer({texture:color},{buffer:cb,bytesPerRow:row,rowsPerImage:H},[W,H,1]);e.copyTextureToBuffer({texture:depth,aspect:'depth-only'},{buffer:db,bytesPerRow:drow,rowsPerImage:H},[W,H,1]);device.queue.submit([e.finish()]);
 await Promise.all([cb.mapAsync(GPUMapMode.READ),db.mapAsync(GPUMapMode.READ)]);
 const pixels=new Uint16Array(cb.getMappedRange()),ds=new Float32Array(db.getMappedRange());let positive=0,near=0,nearLeaks=0,sky=0,skyLeaks=0,other=0,otherLeaks=0,maxMask=0;
 const half=n=>{const e=(n>>10)&31,m=n&1023;return e?(1+m/1024)*2**(e-15):m*2**-24;};
 for(let y=0;y<H;y+=4)for(let x=0;x<W;x+=4){
  const mask=half(pixels[y*row/2+x*4]),d=ds[y*drow/4+x];if(mask>0.00001)positive++;maxMask=Math.max(maxMask,mask);
  if(d<=0){sky++;if(mask>0.00001)skyLeaks++;continue;}
  const nx=(x+.5-P[36])/W*2-1,ny=(y+.5-P[37])/H*2-1,q=P[3]*nx+P[7]*ny+P[11]*d+P[15];
  const wx=(P[0]*nx+P[4]*ny+P[8]*d+P[12])/q,wy=(P[1]*nx+P[5]*ny+P[9]*d+P[13])/q,wz=(P[2]*nx+P[6]*ny+P[10]*d+P[14])/q;
  const range=Math.hypot(wx-P[40],wy-P[41],wz-P[42]);if(range<80){near++;if(mask>0.00001)nearLeaks++;}
  const col=Math.max(0,Math.min(2047,Math.floor((wx+4096)*.25))),r=Math.max(0,Math.min(2047,Math.floor((4096-wz)*.25))),mat=w.heatSurface[r*2048+col]&255;
  if(mat!==1&&mat!==6){other++;if(mask>0.00001)otherLeaks++;}
 }
 cb.unmap();db.unmap();cb.destroy();db.destroy();w.botShotWidth=1280;
 return {size:[W,H],strength:h.strength,positive,maxMask,near,nearLeaks,sky,skyLeaks,other,otherLeaks,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
 } finally {g.loop.last=performance.now();g.engine.runRenderLoop(g.loop._frame);}
 `});
 const shot=await cmd({do:'shot',name,dir:'d5-heat-masks-'+label,hud:false});reports.push({name,...result,file:shot.file});console.log(reports.at(-1));
}
await cmd({do:'eval',js:'g.post.taa.on=w.heatOldTaa;g.post.post.resetHistory=true;g.post.heat.on=true;g.post.heat.debug=false;g.ws.wetForce=-1;g.ws.restoration.dunes="restored";g.restoration.snap=true;return true;'});
fs.mkdirSync('docs/phase-9/heat',{recursive:true});fs.writeFileSync('docs/phase-9/heat/masks-'+label+'.json',JSON.stringify({date:new Date().toISOString(),jitter,reports,note:'Actual TAA debug-mask and depth readback with render loop stopped and queue drained while matrices/color/depth are read together; jitter flag recorded, every4th pixel atnative1280x720. Independent CPU reconstruction/classification uses same resident baked surface buffer; no new diagnostic shader. Near<80m/sky/non-sand leaks checked; dry noon must have positive coverage, other cases must have none. Not a subjective shimmer/motion or performance gate.'},null,2)+'\n');
if(reports.some(r=>r.gpuErrors||r.late.length||r.nearLeaks||r.skyLeaks||r.otherLeaks||r.name==='dry-noon'&&r.positive<100||r.name!=='dry-noon'&&r.positive!==0))process.exitCode=1;
