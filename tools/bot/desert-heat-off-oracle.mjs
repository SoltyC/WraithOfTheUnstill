import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {POST_PARAMS_WGSL} from '../../src/shaders/post/common.wgsl.js';
const baselineRevision='98a1449';
const oldSource=execFileSync('git',['show',baselineRevision+':src/shaders/post/taa.wgsl.js'],{encoding:'utf8'}).replace(/^import.*;$/m,'').replace('export const taaCS','const taaCS');
const baseline=new Function('POST_PARAMS_WGSL',oldSource+';return taaCS;')(POST_PARAMS_WGSL);
import {taaCS as current} from '../../src/shaders/post/taa.wgsl.js';
const base='http://localhost:4181';
const js=`
 const device=w.gpuStats.device,owned=[],textures=[],oldArmed=w.gpuStats.armed;
 const buffer=(data)=>{const b=device.createBuffer({size:data.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(b,0,data);owned.push(b);return b;};
 const P=new Float32Array(g.post.post.params),W=P[112],H=P[113],row=Math.ceil(W*8/256)*256;
 const params=buffer(P),heat=buffer(new Float32Array(12));
 const texture=(width,height)=>{const t=device.createTexture({size:[width,height,1],format:'rgba16float',usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});textures.push(t);return t;};
 const hist=texture(1,1),sampler=device.createSampler({magFilter:'linear',minFilter:'linear'});
 device.queue.writeTexture({texture:hist},new Uint16Array([0x3266,0x2e66,0x2a66,0x3c00]),{bytesPerRow:8},[1,1,1]);
 const outputs=[texture(W,H),texture(W,H),texture(W,H),texture(W,H)],pipelines=[];
 try{w.gpuStats.armed=false;for(const code of ${JSON.stringify([baseline,current])})pipelines.push(await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code}),entryPoint:'main'}}));}finally{w.gpuStats.armed=oldArmed;}
 const cur=g.post.comp.out.getInternalTexture()._hardwareTexture.underlyingResource.createView(),depth=g.post.post.depthTex.getInternalTexture()._hardwareTexture.underlyingResource.createView();
 const surface=g.content.clipmap.buffers.surface.getBuffer().underlyingResource,reports=[];
 const half=n=>{const e=(n>>10)&31,m=n&1023;return (n&32768?-1:1)*(e?(1+m/1024)*2**(e-15):m*2**-24);};
 try{for(const taa of [0,1]){
  P[46]=taa;P[39]=0;device.queue.writeBuffer(params,0,P);
  const enc=device.createCommandEncoder();
  for(let i=0;i<2;i++){
   const entries=[{binding:0,resource:{buffer:params}},{binding:1,resource:cur},{binding:2,resource:depth},{binding:3,resource:sampler},{binding:4,resource:hist.createView()},{binding:5,resource:outputs[i*2].createView()},{binding:6,resource:outputs[i*2+1].createView()}];
   if(i)entries.push({binding:7,resource:{buffer:heat}},{binding:8,resource:{buffer:surface}},{binding:9,resource:{buffer:g.content.clipmap.buffers.wind.getBuffer().underlyingResource}});
   const group=device.createBindGroup({layout:pipelines[i].getBindGroupLayout(0),entries}),pass=enc.beginComputePass();pass.setPipeline(pipelines[i]);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(W/8),Math.ceil(H/8));pass.end();
  }
  const read=device.createBuffer({size:row*H*2,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  for(let i=0;i<2;i++)enc.copyTextureToBuffer({texture:outputs[i*2+1]},{buffer:read,offset:row*H*i,bytesPerRow:row,rowsPerImage:H},[W,H,1]);
  device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);const data=new Uint16Array(read.getMappedRange());let mismatches=0,maxDifference=0;
  for(let y=0;y<H;y++)for(let x=0;x<W*4;x++){const k=y*row/2+x,a=data[k],b=data[k+row*H/2];if(a!==b){mismatches++;maxDifference=Math.max(maxDifference,Math.abs(half(a)-half(b)));}}
  read.unmap();read.destroy();reports.push({taa,size:[W,H],mismatches,maxDifference});
 }}finally{for(const b of owned)b.destroy();for(const t of textures)t.destroy();}
 return {reports,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
`;
const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);
fs.writeFileSync('docs/phase-9/heat/off-oracle-mirage.json',JSON.stringify({date:new Date().toISOString(),baselineRevision,...r.result,note:'Actual baseline-main versus current TAA compute on identical live composed/depth inputs, shared parameters and constant history, heat strength0; both reconstruction-only and history branches. Diagnostic pipelines created with late detector unarmed; restart for world cold/performance gates. This is not heat-on temporal/motion acceptance.'},null,2)+'\n');console.log(r.result);
if(r.result.gpuErrors||r.result.reports.some(x=>x.mismatches))process.exitCode=1;
