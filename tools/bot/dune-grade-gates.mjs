// Target-GPU visual gates; raw depth copy adds no diagnostic shader/pipeline.
// node tools/bot/dune-grade-gates.mjs wet|sunset|range
import fs from 'node:fs';
const base='http://127.0.0.1:4178',mode=process.argv[2]||'wet';
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result??r;}
const data=JSON.parse(fs.readFileSync('data/photo-spots.json')).spots;
const close=data.find(s=>s.id==='p9s1-close-noon'),mid=data.find(s=>s.id==='p9s1-star-mid');
const far=(pos,yaw,pitch,fov=.4)=>({biome:'dunes',player:[pos[0],pos[2]],camera:{mode:'free',pos,yaw,pitch,fov}});
const cases=mode==='far-light'?[12,17.8,23].flatMap(time=>['stilled','restored'].map(restored=>['north-'+time+'-'+restored,far([3000,600,-1100],0,.14),time,restored,0])):mode==='wall'?[['wall-noon',data.find(s=>s.id==='p9d0-canyon-floor'),12,'restored',0],['wall-dawn',data.find(s=>s.id==='p9d0-canyon-floor'),7,'restored',0]]:mode==='bands'?[['bands-normal',far([2950,550,2050],Math.PI,.12),12,'restored',0],['bands-no-shadow',far([2950,550,2050],Math.PI,.12),12,'restored',0],['bands-no-rock',far([2950,550,2050],Math.PI,.12),12,'restored',0]]:mode==='isolate'?[['normal',mid,17.8,'restored',0],['no-lut',mid,17.8,'restored',0],['no-bloom',mid,17.8,'restored',0]]:mode==='wet'?[['dry',close,12,'restored',0],['wet',close,12,'restored',1],['dry-stilled',close,12,'stilled',0],['wet-stilled',close,12,'stilled',1]]:mode==='sunset'?[['sunset-stilled',mid,17.8,'stilled',0],['sunset-restored',mid,17.8,'restored',0]]:[['north',far([3000,600,-1100],0,.14),12,'restored',0],['south',far([2950,550,2050],Math.PI,.12),12,'restored',0],['east',far([1200,550,900],Math.PI/2,.12),12,'restored',0]];
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
const reports=[];
try {
for(const[name,source,time,restored,wet]of cases){
 const spot={...source,id:'p9d1b-'+mode+'-'+name,biome:'dunes',hidePlayer:true,time,weather:'clear',restoration:restored,wet,puddle:0,rain:0};
 await cmd({do:'eval',js:`g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=true;g.game.killShaped();g.game.setPlayerVisible(false);g.frost.restoreCrystals([],g.clock.simTime);g.terrainState.restore([]);g.stone.mass.clear();const c=g.engine.getRenderingCanvas();c.style.width='2560px';c.style.height='1440px';w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.version++;g.engine.resize();g.ws.restoration.frost='${restored==='restored'?'stilled':'restored'}';g.ws.restoration.meadow=g.ws.restoration.frost;g.game.applySpot(${JSON.stringify(spot)});g.restoration.snap=true;g.clock.pinHour=${time};const frame=()=>new Promise(r=>requestAnimationFrame(r));for(let i=0;i<600&&(!g.game.worldSettled()||!g.game.stateSettled());i++)await frame();for(let i=0;i<240;i++)await frame();g.restoration.snap=true;for(let i=0;i<60;i++)await frame();`});
 await cmd({do:'eval',js:`if(w._d1bShadowUpdate){g.shadows.update=w._d1bShadowUpdate;w._d1bShadowUpdate=null;}if(w._d1bRockData){g.content.clipmap.rockMask.update(w._d1bRockData);w._d1bRockData=null;}if('${name}'==='bands-no-rock'){const src=g.streamer.surfaceData,n=src.length/4;w._d1bRockData=new Uint8Array(n);for(let i=0;i<n;i++)w._d1bRockData[i]=src[i*4]===g.streamer.manifest.surface.materials.rock?255:0;g.content.clipmap.rockMask.update(new Uint8Array(n));}g.post.post.lutOn=${name!=='no-lut'};g.post.bloom.on=${name!=='no-bloom'};if('${name}'==='bands-no-shadow'){w._d1bShadowUpdate=g.shadows.update;g.shadows.update=function(){g.shadows.strength=0;w._d1bShadowUpdate.call(g.shadows);};}for(let i=0;i<60;i++)await new Promise(r=>requestAnimationFrame(r));`});
 const metrics=await cmd({do:'eval',js:statsJs});
 await cmd({do:'eval',js:'w.botShotWidth=1280;'});
 const shot=await cmd({do:'shot',name:spot.id,dir:'dune-grade-gates',hud:false});
 reports.push({name:spot.id,file:shot.file,...metrics});console.log(reports.at(-1));
 fs.writeFileSync('docs/phase-9/dune-grade/'+mode+'-gate.json',JSON.stringify({date:new Date().toISOString(),reports,note:'Depth32float copied from actual frame without a diagnostic pipeline. Reverse-Z sky=0; 3px erosion excludes TAA silhouettes. Opaque geometry mask includes props, not only terrain. Sand-clipped count classifies opaque pixels by the bake material beneath their reconstructed world position. Distance is actual GPU-depth Euclidean range, sampled every 8px; dune bins require >70% dune weight and a point inside the baked world. Half-pixel TAA jitter and the 4m material map limit boundary precision. Clipping threshold any RGB >=253. Foreground luma is a fixed 20–80% x / 55–95% y opaque crop. Captures are review copies of verified 2560x1440 renders.'},null,2)+'\n');
}
} finally {
await cmd({do:'eval',js:'if(w._d1bShadowUpdate){g.shadows.update=w._d1bShadowUpdate;w._d1bShadowUpdate=null;}if(w._d1bRockData){g.content.clipmap.rockMask.update(w._d1bRockData);w._d1bRockData=null;}g.post.post.lutOn=true;g.post.bloom.on=true;'});
}
if(reports.some(r=>r.gpuErrors||r.late.length))process.exitCode=1;
