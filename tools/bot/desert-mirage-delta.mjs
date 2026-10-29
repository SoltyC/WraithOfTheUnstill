import fs from 'node:fs';
import {taaCS} from '../../src/shaders/post/taa.wgsl.js';
const base='http://localhost:4181';
const js=`
 const device=w.gpuStats.device,owned=[],textures=[],oldArmed=w.gpuStats.armed;
 g.engine.stopRenderLoop();await device.queue.onSubmittedWorkDone();
 const buffer=data=>{const b=device.createBuffer({size:data.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(b,0,data);owned.push(b);return b;};
 const texture=(width,height)=>{const t=device.createTexture({size:[width,height,1],format:'rgba16float',usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});textures.push(t);return t;};
 try{
  const P=new Float32Array(g.post.post.params);P[46]=0;P[39]=0;
  const W=P[112],H=P[113],IW=P[32],IH=P[33],row=Math.ceil(W*8/256)*256,drow=Math.ceil(IW*4/256)*256;
  const params=buffer(P),a=new Float32Array(g.post.heat.data),b=new Float32Array(a);a[3]=b[3]=0;a[8]=0;b[8]=.45;
  const heats=[buffer(a),buffer(b)],hist=texture(1,1),sampler=device.createSampler({magFilter:'linear',minFilter:'linear'}),out=[texture(W,H),texture(W,H),texture(W,H),texture(W,H)];
  let pipeline;try{w.gpuStats.armed=false;pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code:${JSON.stringify(taaCS)}}),entryPoint:'main'}});}finally{w.gpuStats.armed=oldArmed;}
  const cur=g.post.comp.out.getInternalTexture()._hardwareTexture.underlyingResource.createView(),depth=g.post.post.depthTex.getInternalTexture()._hardwareTexture.underlyingResource;
  const surface=g.content.clipmap.buffers.surface.getBuffer().underlyingResource,wind=g.content.clipmap.buffers.wind.getBuffer().underlyingResource;
  const colorBytes=row*H,depthOffset=colorBytes*2,windOffset=depthOffset+drow*IH,surfaceOffset=windOffset+256*256*4;
  const read=device.createBuffer({size:surfaceOffset+2048*2048*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});owned.push(read);
  const enc=device.createCommandEncoder();
  for(let i=0;i<2;i++){
   const entries=[{binding:0,resource:{buffer:params}},{binding:1,resource:cur},{binding:2,resource:depth.createView()},{binding:3,resource:sampler},{binding:4,resource:hist.createView()},{binding:5,resource:out[i*2].createView()},{binding:6,resource:out[i*2+1].createView()},{binding:7,resource:{buffer:heats[i]}},{binding:8,resource:{buffer:surface}},{binding:9,resource:{buffer:wind}}];
   const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries}),pass=enc.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(W/8),Math.ceil(H/8));pass.end();
   enc.copyTextureToBuffer({texture:out[i*2+1]},{buffer:read,offset:colorBytes*i,bytesPerRow:row,rowsPerImage:H},[W,H,1]);
  }
  enc.copyTextureToBuffer({texture:depth,aspect:'depth-only'},{buffer:read,offset:depthOffset,bytesPerRow:drow,rowsPerImage:IH},[IW,IH,1]);enc.copyBufferToBuffer(wind,0,read,windOffset,256*256*4);enc.copyBufferToBuffer(surface,0,read,surfaceOffset,2048*2048*4);device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);
  const mapped=read.getMappedRange(),colors=new Uint16Array(mapped,0,colorBytes),depths=new Float32Array(mapped,depthOffset,drow*IH/4),winds=new Uint32Array(mapped,windOffset,256*256),materials=new Uint32Array(mapped,surfaceOffset,2048*2048);
  const half=n=>{const e=(n>>10)&31,m=n&1023;return (n&32768?-1:1)*(e?(1+m/1024)*2**(e-15):m*2**-24);};
  let changed=0,maxDifference=0,minRange=Infinity,nearChanged=0,skyChanged=0,nonSandChanged=0,unflatChanged=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const k=y*row/2+x*4,j=k+colorBytes/2;let different=false;
   for(let c=0;c<3;c++)if(colors[k+c]!==colors[j+c]){different=true;maxDifference=Math.max(maxDifference,Math.abs(half(colors[k+c])-half(colors[j+c])));}
   if(!different)continue;changed++;
   const qx=Math.min(IW-1,Math.floor((x+.5)*IW/W)),qy=Math.min(IH-1,Math.floor((y+.5)*IH/H)),d=depths[qy*drow/4+qx];
   if(d<=0){skyChanged++;continue;}
   const nx=(qx+.5)/IW*2-1,ny=(qy+.5)/IH*2-1,q=P[3]*nx+P[7]*ny+P[11]*d+P[15];
   const wx=(P[0]*nx+P[4]*ny+P[8]*d+P[12])/q,wy=(P[1]*nx+P[5]*ny+P[9]*d+P[13])/q,wz=(P[2]*nx+P[6]*ny+P[10]*d+P[14])/q;
   const range=Math.hypot(wx-P[40],wy-P[41],wz-P[42]);minRange=Math.min(minRange,range);if(range<80)nearChanged++;
   const cx=Math.max(0,Math.min(2047,Math.floor((wx+4096)*.25))),cz=Math.max(0,Math.min(2047,Math.floor((4096-wz)*.25))),mat=materials[cz*2048+cx]&255;if(mat!==1&&mat!==6)nonSandChanged++;
   const u=(wx+4096)/32-.5,v=(4096-wz)/32-.5,ix=Math.floor(u),iz=Math.floor(v),fx=u-ix,fz=v-iz;
   const flat=(x,z)=>(winds[Math.max(0,Math.min(255,z))*256+Math.max(0,Math.min(255,x))]>>>24)/255;
   const f0=flat(ix,iz)*(1-fx)+flat(ix+1,iz)*fx,f1=flat(ix,iz+1)*(1-fx)+flat(ix+1,iz+1)*fx;if(f0*(1-fz)+f1*fz<.65)unflatChanged++;
  }
  read.unmap();return {output:[W,H],internal:[IW,IH],strength:a[0],changed,maxDifference,minRange:Number.isFinite(minRange)?minRange:null,nearChanged,skyChanged,nonSandChanged,unflatChanged,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
 }finally{w.gpuStats.armed=oldArmed;for(const b of owned)b.destroy();for(const t of textures)t.destroy();g.loop.last=performance.now();g.engine.runRenderLoop(g.loop._frame);}
`;
const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);
fs.writeFileSync('docs/phase-9/heat/mirage-color-delta.json',JSON.stringify({date:new Date().toISOString(),...r.result,note:'Same current shader/composed/depth/frame/control inputs in isolated GPU reconstruction, only mirage gain0 versus0.45. Render loop stopped/queue drained; all changed output pixels independently classified from matching depth and baked buffers. Temporal accumulation disabled for this colour-output isolation. Diagnostic pipeline compiled with late detector unarmed; this is not human visual/performance acceptance.'},null,2)+'\n');console.log(r.result);
if(r.result.changed<100||r.result.minRange<179.9||r.result.nearChanged||r.result.skyChanged||r.result.nonSandChanged||r.result.unflatChanged||r.result.gpuErrors)process.exitCode=1;
