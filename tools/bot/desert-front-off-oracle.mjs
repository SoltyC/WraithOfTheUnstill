import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
const show=path=>execFileSync('git',['show','2224f79:'+path],{encoding:'utf8'});
const originalCommon=await import('data:text/javascript;base64,'+Buffer.from(show('src/shaders/post/common.wgsl.js')).toString('base64'));
const originalFog=show('src/shaders/post/fog.wgsl.js').match(/export const WEATHER_FOG_WGSL =[^`]*`([\s\S]*?)`;/)[1];
const originalAO=show('src/shaders/post/ao.wgsl.js').replace(/^import .*;\s*$/gm,'').replaceAll('export const ','const ');
const oldShader=new Function('POST_PARAMS_WGSL','WEATHER_FOG_WGSL',originalAO+'\nreturn composeCS;')(originalCommon.POST_PARAMS_WGSL,originalFog);
const vite=await createServer({server:{middlewareMode:true}});let newShader;try{newShader=(await vite.ssrLoadModule('/src/shaders/post/ao.wgsl.js')).composeCS;}finally{await vite.close();}
const base='http://localhost:4181';
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(JSON.stringify(r));return r.result;}
await ev(`const frame=()=>new Promise(r=>requestAnimationFrame(r));g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=true;g.clock.pinHour=13;w.params.v.timeOfDay=13;w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.version++;const c=g.engine.getRenderingCanvas();c.style.width='1280px';c.style.height='720px';g.engine.resize();g.engine.setSize(1280,720);const f=g.sandstorm;f.enabled=false;f.target=0;f.active=false;f.strength=0;f.update();g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.ws.weatherOverride='clear';g.game.teleport(1900,900);g.restoration.snap=true;for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();for(let i=0;i<180;i++)await frame();g.restoration.snap=true;g.weather.snap=true;for(let i=0;i<60;i++)await frame();return true;`);
const result=await ev(`
const d=w.gpuStats.device,p=g.post.post,comp=g.post.comp,fog=g.post.fog,W=p.width,H=p.height;
if(p.params[131]!==0)throw new Error('Storm not off');if(!comp.aoTex||!comp.ssrTex)throw new Error('Compose inputs not exposed by this build');
const tex=t=>t.getInternalTexture()._hardwareTexture.underlyingResource,buf=b=>b.getBuffer().underlyingResource;
g.engine.stopRenderLoop();await d.queue.onSubmittedWorkDone();
const outA=d.createTexture({size:[W,H],format:'rgba16float',usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_SRC}),outB=d.createTexture({size:[W,H],format:'rgba16float',usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_SRC});
const row=Math.ceil(W*8/256)*256,readA=d.createBuffer({size:row*H,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),readB=d.createBuffer({size:row*H,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
try{
const sampler=d.createSampler({magFilter:'linear',minFilter:'linear',mipmapFilter:'nearest',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
const make=async(code,out,newer)=>{const module=d.createShaderModule({label:newer?'storm-off current compose':'pinned2224f79 compose',code}),info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw new Error(JSON.stringify(info.messages));let pipeline;const armed=w.gpuStats.armed;try{w.gpuStats.armed=false;pipeline=d.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}});}finally{w.gpuStats.armed=armed;}
const resources=[{buffer:buf(p.paramsBuf)},tex(p.sceneRT).createView(),tex(p.depthTex).createView({aspect:'depth-only'}),tex(comp.aoTex).createView(),sampler,tex(fog.cloudTex).createView(),sampler,tex(fog.shaftTex).createView(),{buffer:buf(g.atmosphere.atmoLight)},sampler,tex(comp.ssrTex).createView(),out.createView(),sampler,tex(g.atmosphere.canopyTex).createView(),sampler,tex(fog.hazeTex).createView()];if(newer)resources.push({buffer:buf(g.atmosphere.biomeA)});
return {pipeline,group:d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:resources.map((resource,binding)=>({binding,resource}))})};};
const a=await make(${JSON.stringify(oldShader)},outA,false),b=await make(${JSON.stringify(newShader)},outB,true),enc=d.createCommandEncoder();
for(const setup of [a,b]){const pass=enc.beginComputePass();pass.setPipeline(setup.pipeline);pass.setBindGroup(0,setup.group);pass.dispatchWorkgroups(Math.ceil(W/8),Math.ceil(H/8));pass.end();}
enc.copyTextureToBuffer({texture:outA},{buffer:readA,bytesPerRow:row,rowsPerImage:H},[W,H]);enc.copyTextureToBuffer({texture:outB},{buffer:readB,bytesPerRow:row,rowsPerImage:H},[W,H]);d.queue.submit([enc.finish()]);await Promise.all([readA.mapAsync(GPUMapMode.READ),readB.mapAsync(GPUMapMode.READ)]);
const av=new Uint16Array(readA.getMappedRange()),bv=new Uint16Array(readB.getMappedRange());let mismatchedComponents=0,mismatchedPixels=0;
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*(row/2)+x*4;let mismatch=false;for(let c=0;c<4;c++)if(av[i+c]!==bv[i+c]){mismatchedComponents++;mismatch=true;}if(mismatch)mismatchedPixels++;}readA.unmap();readB.unmap();
return {size:[W,H],storm:p.params[131],mismatchedPixels,mismatchedComponents,gpuErrors:w.gpuStats.gpuErrors,gpuMessages:w.gpuStats.gpuErrorMessages,late:w.gpuStats.late};
}finally{outA.destroy();outB.destroy();readA.destroy();readB.destroy();g.loop.last=performance.now();g.engine.runRenderLoop(g.loop._frame);}
`);
fs.mkdirSync('docs/phase-9/storm-front',{recursive:true});fs.writeFileSync('docs/phase-9/storm-front/off-compose.json',JSON.stringify({date:new Date().toISOString(),baseline:'2224f79',...result,note:'Pinned original128-float compose versus new144-float compose, actual same live scene/depth/AO/SSR/cloud/shaft/atmosphere/canopy/haze inputs, storm strength0. RGBA16F bitwise comparison. Diagnostic pipelines unarmed with renderer stopped/drained. This isolates compose off behavior, not whole-frame original atmosphere/weather output or a cold-world pipeline gate.'},null,2)+'\n');console.log(result);
if(result.mismatchedPixels||result.mismatchedComponents||result.gpuErrors||result.late.length)process.exitCode=1;
