import fs from 'node:fs';
const base='http://localhost:4181';
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(JSON.stringify(r));return r.result;}
await ev(`w.params.v.renderScale=1;w.params.v.dynamicRes=0;w.params.version++;const c=g.engine.getRenderingCanvas();c.style.width='2560px';c.style.height='1440px';g.engine.resize();g.engine.setSize(2560,1440);g.clock.pinHour=13;w.params.v.timeOfDay=13;w.params.version++;g.sandStreaks.on=true;for(let i=0;i<120;i++)await new Promise(r=>requestAnimationFrame(r));return true;`);
const report=await ev(`
const s=g.sandStreaks,e=g.engine,d=w.gpuStats.device,p=g.post.post,comp=g.post.comp,W=p.width,H=p.height;
if(!s.warmed||g.sandstorm.block[3]<.99||g.sandstorm.age<90||w.gpuStats.gpuErrors)throw new Error('Wrong/invalid inside-front fixture');
const tex=t=>t.getInternalTexture()._hardwareTexture.underlyingResource,row=Math.ceil(W*8/256)*256,depthRow=Math.ceil(W*4/256)*256;
const read=async(t,bpr)=>{const rb=d.createBuffer({size:bpr*H,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),enc=d.createCommandEncoder();enc.copyTextureToBuffer({texture:t,aspect:t.format==='depth32float'?'depth-only':'all'},{buffer:rb,bytesPerRow:bpr,rowsPerImage:H},[W,H]);d.queue.submit([enc.finish()]);await rb.mapAsync(GPUMapMode.READ);const a=new Uint8Array(rb.getMappedRange()).slice();rb.unmap();rb.destroy();return a;};
const diff=(a,b,bpp,bpr)=>{let pixels=0,components=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){let changed=false;for(let k=0;k<bpp;k++){const j=y*bpr+x*bpp+k;if(a[j]!==b[j]){components++;changed=true;}}if(changed)pixels++;}return {pixels,changedBytes:components};};
const check=a=>{const u=new Uint16Array(a.buffer);let nonFinite=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let c=0;c<3;c++){const v=u[y*row/2+x*4+c];if((v&0x7c00)===0x7c00)nonFinite++;}return nonFinite;};
const oldSnapshot=e.snapshotRendering,oldCompatibility=e.compatibilityMode,oldGate=g.wind.block[27],oldFunc=s.material.depthFunction,armed=w.gpuStats.armed;
e.snapshotRendering=false;e.stopRenderLoop();await d.queue.onSubmittedWorkDone();
try{
 const depthBefore=await read(tex(p.depthTex),depthRow);
 comp.run();e.flushFramebuffer();const baseline=await read(tex(comp.out),row);
 s.run();e.flushFramebuffer();const grains=await read(tex(comp.out),row),depthAfter=await read(tex(p.depthTex),depthRow);
 comp.run();e.flushFramebuffer();const repeat=await read(tex(comp.out),row);
 g.wind.block[27]=0;s.run();e.flushFramebuffer();const disabled=await read(tex(comp.out),row);g.wind.block[27]=oldGate;
 // Controlled diagnostic only: compare the same quads with depth ALWAYS to prove real
 // terrain/actor occlusion. This extra test pipeline is never part of gameplay warm-up.
 comp.run();e.flushFramebuffer();e.compatibilityMode=true;s.material.depthFunction=519;w.gpuStats.armed=false;s.run();e.flushFramebuffer();await d.queue.onSubmittedWorkDone();
 const unoccluded=await read(tex(comp.out),row);
 comp.run();e.flushFramebuffer();s.material.depthFunction=512;s.run();e.flushFramebuffer();await d.queue.onSubmittedWorkDone();const never=await read(tex(comp.out),row);
 s.material.depthFunction=oldFunc;w.gpuStats.armed=armed;
 let depthNonzero=0,changedOverDepth=0;const dv=new Float32Array(depthBefore.buffer);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(dv[y*depthRow/4+x]>0){depthNonzero++;let changed=false;for(let k=0;k<8;k++)if(baseline[y*row+x*8+k]!==grains[y*row+x*8+k])changed=true;if(changed)changedOverDepth++;}}
 return {size:[W,H],sharedGeometry:s.mesh.geometry===g.snowfall.mesh.geometry,targetFormat:s.target.texture._hardwareTexture.format,depthReadOnly:s.target.depthReadOnly,materialDepthWriteDisabled:s.material.disableDepthWrite,
   changed:diff(baseline,grains,8,row),repeat:diff(baseline,repeat,8,row),disabled:diff(baseline,disabled,8,row),depth:diff(depthBefore,depthAfter,4,depthRow),
   never:diff(baseline,never,8,row),depthNonzero,changedOverDepth,unoccluded:diff(baseline,unoccluded,8,row),occlusion:diff(grains,unoccluded,8,row),nonFinite:check(grains),gpuErrors:w.gpuStats.gpuErrors,gpuMessages:w.gpuStats.gpuErrorMessages,late:w.gpuStats.late};
}finally{g.wind.block[27]=oldGate;s.material.depthFunction=oldFunc;w.gpuStats.armed=armed;e.compatibilityMode=oldCompatibility;e.snapshotRendering=oldSnapshot;g.loop.last=performance.now();e.runRenderLoop(g.loop._frame);}
`);
fs.writeFileSync('docs/phase-9/storm-front/streak-pixels.json',JSON.stringify({date:new Date().toISOString(),...report,note:'Stopped/drained actual1440p composed HDR target. Identical input compose baseline/repeat; actual shared precipitation geometry draw; zero storm gate; scene depth before/after. Controlled depth-ALWAYS/NEVER diagnostic pipelines unarmed with compatibility mode only for depth controls, not cold gameplay pipeline evidence. No moving-camera/temporal/actor telegraph/human art/performance/allocation acceptance.'},null,2)+'\n');console.log(report);
if(!report.sharedGeometry||!report.materialDepthWriteDisabled||!report.changed.pixels||report.repeat.pixels||report.disabled.pixels||report.depth.pixels||report.never.pixels||report.nonFinite||report.gpuErrors||report.late.length||report.unoccluded.pixels<=report.changed.pixels||!report.occlusion.pixels)process.exitCode=1;
