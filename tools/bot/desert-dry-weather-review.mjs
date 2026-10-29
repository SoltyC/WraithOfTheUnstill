import fs from 'node:fs';
const base='http://localhost:4181';
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=240000')).json();if(!r.ok)throw new Error(r.error);return r.result??r;}
const spots=JSON.parse(fs.readFileSync('data/photo-spots.json')).spots,close=spots.find(s=>s.id==='p9s1-close-noon'),mid=spots.find(s=>s.id==='p9s1-star-mid');
const statsJs=`
 await new Promise(r=>requestAnimationFrame(r));
 const canvas=g.engine.getRenderingCanvas(),W=canvas.width,H=canvas.height;
 const image=new OffscreenCanvas(W,H),ctx=image.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0);const rgb=ctx.getImageData(0,0,W,H).data;
 const p=g.post.post,tex=p.depthTex.getInternalTexture()._hardwareTexture.underlyingResource;
 if(tex.width!==W||tex.height!==H)throw new Error('Depth/output size mismatch');
 const device=w.gpuStats.device,row=Math.ceil(W*4/256)*256,size=row*H;
 const buf=device.createBuffer({label:'d1b-depth-readback',size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 const vp=Array.from(p.params.slice(0,16)),cam=g.camera.position.asArray();
 const enc=device.createCommandEncoder();enc.copyTextureToBuffer({texture:tex,aspect:'depth-only'},{buffer:buf,bytesPerRow:row,rowsPerImage:H},[W,H,1]);device.queue.submit([enc.finish()]);
 await buf.mapAsync(GPUMapMode.READ);const depth=new Float32Array(buf.getMappedRange());
 const bins=[500,1000,2000,4000,8000,Infinity],range=new Array(bins.length).fill(0),duneRange=new Array(bins.length).fill(0);
 let terrain=0,clipped=0,sand=0,sandClipped=0,fgN=0,fgL=0,wholeClip=0;
 const at=(x,y)=>depth[(H-1-y)*(row/4)+x];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const i=(y*W+x)*4,c=Math.max(rgb[i],rgb[i+1],rgb[i+2])>=253;if(c)wholeClip++;
   const d=at(x,y);if(!(d>1e-7))continue;
   // Erode sky edges by 3 px: TAA/bloom silhouettes are not a stable material sample.
   if(x<3||y<3||x>=W-3||y>=H-3||!(at(x-3,y)>1e-7&&at(x+3,y)>1e-7&&at(x,y-3)>1e-7&&at(x,y+3)>1e-7))continue;
   terrain++;if(c)clipped++;
   if(x>W*.2&&x<W*.8&&y>H*.55&&y<H*.95){fgN++;fgL+=.2126*rgb[i]+.7152*rgb[i+1]+.0722*rgb[i+2];}
   if(!c&&(x%8||y%8))continue;
   const nx=(x+.5)/W*2-1,ny=(H-1-y+.5)/H*2-1;
   const q=vp[3]*nx+vp[7]*ny+vp[11]*d+vp[15];
   const wx=(vp[0]*nx+vp[4]*ny+vp[8]*d+vp[12])/q,wy=(vp[1]*nx+vp[5]*ny+vp[9]*d+vp[13])/q,wz=(vp[2]*nx+vp[6]*ny+vp[10]*d+vp[14])/q;
   g.streamer.mqx=wx;g.streamer.mqz=wz;g.streamer.sampleMaterial();
   if(c&&g.streamer.mat===1)sandClipped++;
   if(x%8||y%8)continue;
   const dist=Math.hypot(wx-cam[0],wy-cam[1],wz-cam[2]),bin=bins.findIndex(b=>dist<b);range[bin]++;
   g.streamer.sampleBiome();if(Math.abs(wx)<4096&&Math.abs(wz)<4096&&g.streamer.bw3>.7){duneRange[bin]++;if(g.streamer.mat===1)sand++;}
 }
 buf.unmap();buf.destroy();
 if(!(fgL>0))throw new Error("Empty canvas readback; exposure is not assessed");
 return {size:[W,H],depthSize:[tex.width,tex.height],camera:cam,biome:g.ws.biome,wet:g.ws.wetForce,restoration:{...g.restoration},opaquePixels:terrain,opaqueClippedPixels:clipped,opaqueClippedPct:100*clipped/terrain,sandClippedPixels:sandClipped,wholeClippedPct:100*wholeClip/(W*H),foregroundMeanLuma:fgL/fgN,range:{bins:['<500m','500–1000m','1–2km','2–4km','4–8km','8km+'],opaqueSamples:range,duneSamples:duneRange,sandSamples:sand,stride:8},gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`;
fs.mkdirSync('docs/phase-9/dry-weather',{recursive:true});
const reports=[];
for(const [name,source,hour,wet,state,restored]of [['crest-stilled',close,12,0,'clear','stilled'],['close-clear',close,12,0,'clear','restored'],['close-haze',close,12,0,'heat-haze','restored'],['close-wet',close,12,1,'clear','restored'],['mid-golden',mid,17.8,0,'clear','restored'],['mid-night',mid,23,0,'clear','restored']]){const on=true;
 const spot={...source,id:'d6-dry-'+name,biome:'dunes',hidePlayer:true,time:hour,weather:state,restoration:restored,wet,puddle:0,rain:0};
 await cmd({do:'eval',js:`
  const frame=()=>new Promise(r=>requestAnimationFrame(r));g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=true;g.atmosphere.alwaysSnap=true;g.atmosphere.desert.on=${on};
  g.game.killShaped();g.game.setPlayerVisible(false);g.frost.restoreCrystals([],g.clock.simTime);g.terrainState.restore([]);g.stone.mass.clear();
  const c=g.engine.getRenderingCanvas();c.style.width='2560px';c.style.height='1440px';w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.version++;g.engine.resize();
  g.ws.restoration.frost=g.ws.restoration.meadow='restored';g.ws.restoration.dunes='${restored}';g.game.applySpot(${JSON.stringify(spot)});g.weather.snap=true;g.restoration.snap=true;g.clock.pinHour=${hour};
  if('${name}'==='crest-stilled'){g.game.teleport(2514,816);g.arm.setFree(true);g.arm.freePos.x=2498;g.arm.freePos.y=196.5;g.arm.freePos.z=805;g.arm.yaw=1.2;g.arm.pitch=.08;g.arm.fov=.9;}
  for(let i=0;i<600&&(!g.game.worldSettled()||!g.game.stateSettled());i++)await frame();for(let i=0;i<180;i++)await frame();g.restoration.snap=true;for(let i=0;i<60;i++)await frame();g.weather.snap=true;for(let i=0;i<30;i++)await frame();return true;
 `});
 const metrics=await cmd({do:'eval',js:statsJs});
 const cache=await cmd({do:'eval',js:`const start=g.atmosphere.lutBuilds;for(let i=0;i<120;i++)await new Promise(r=>requestAnimationFrame(r));const a=g.atmosphere.desert;return {weather:{state:g.weather.state,snow:g.weather.snow,rain:g.weather.rain,storm:g.weather.storm,sand:g.weather.sand,cover:g.weather.cover,fog:g.weather.fog,weight:g.weather.dunes,stormReady:g.weather.duneStorms},inversion:{weight:g.post.fog.inv.weight,postDensity:g.post.post.params[108]},density:a.density,quantized:a.quantized,weight:a.weight,sunY:a.sunY,lutBuilds:g.atmosphere.lutBuilds,steadyRebuilds:g.atmosphere.lutBuilds-start};`});
 await cmd({do:'eval',js:'w.botShotWidth=1280;return true;'});const shot=await cmd({do:'shot',name:spot.id,dir:'d6-dry-weather-review',hud:false});
 reports.push({name,state,restored,on,hour,wet,...cache,...metrics,file:shot.file});console.log(reports.at(-1));
 fs.writeFileSync('docs/phase-9/dry-weather/views.json',JSON.stringify({date:new Date().toISOString(),reports,note:'Actual native2560x1440 dry-weather/stilled/haze/noon/wet/golden/night matrix after separate Dunes machine and valley-fog mask. No storm/front acceptance; storm capability remains false. Opaque/depth/luma statistics reuse the established D1b native canvas/depth gate (3px sky-edge erosion,RGB>=253 clipping).120frame steady LUT rebuild check, exposure snapped for comparison.1280px review copies. Not sustained world/weather/combat performance or human aesthetic acceptance.'},null,2)+'\n');
}
await cmd({do:'eval',js:'g.atmosphere.desert.on=true;g.atmosphere.alwaysSnap=false;g.ws.wetForce=-1;return true;'});
if(reports.some(r=>r.gpuErrors||r.late.length||r.opaqueClippedPixels||r.steadyRebuilds||r.weather.snow||r.weather.rain||r.weather.storm||r.weather.sand||r.weather.stormReady))process.exitCode=1;
