#!/usr/bin/env node
// Isolated synthetic GPU oracle; diagnostic pipeline creation is outside the world late gate.
import fs from 'node:fs';
import { sandCoarseRelaxWGSL } from '../../src/shaders/sandCoarseRelax.wgsl.js';
import { createRelaxationGrid, projectTalusPairs } from '../../src/terrain/state/relaxation.js';
import { pack2,pack4,fromHalf } from '../../src/terrain/state/healing.js';
const base=process.env.WRAITH_URL||'http://127.0.0.1:4176';
const seeds=[[15*512+250,pack2(0,3),0],[16*512+254,pack2(1,0),0],[15*512+251,pack2(0,1),pack4(0,0,1,0)],[14*512+250,pack2(0,0.8),pack4(0,0,0,1/255)],[16*512+250,pack2(0,0.7),pack4(0,1,0,0)]];
const codes=[];for(const vertical of [false,true])for(let phase=0;phase<2;phase++)codes.push(sandCoarseRelaxWGSL(vertical,phase));
const js=`
 const device=w.gpuStats.device, owned=[], oldArmed=w.gpuStats.armed, errors0=w.gpuStats.gpuErrors;
 const buffer=(size,usage)=>{const b=device.createBuffer({size,usage});owned.push(b);return b;};
 const usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC;
 const h=buffer(512*512*4,usage),state=buffer(512*512*4,usage),extra=buffer(512*512*4,usage);
 const surface=buffer(2048*2048*4,usage),job=buffer(32,usage),levels=buffer(257*257*16,usage),cp=buffer(12*16,usage);
 const hv=new Uint32Array(512*512),sv=new Uint32Array(512*512);
 for(const [i,a,b] of ${JSON.stringify(seeds)}){hv[i]=a;sv[i]=b;}
 device.queue.writeBuffer(h,0,hv);device.queue.writeBuffer(state,0,sv);device.queue.writeBuffer(surface,0,new Uint32Array(2048*2048).fill(1));
 device.queue.writeBuffer(job,0,new Int32Array([0,0,0,0,1,0,0,0]));
 const params=new Float32Array(12*4);params.set([64,64,1,0]);device.queue.writeBuffer(cp,0,params);
 const pipelines=[];
 try{
   w.gpuStats.armed=false;
   for(const code of ${JSON.stringify(codes)})pipelines.push(await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code}),entryPoint:'main'}}));
 }finally{w.gpuStats.armed=oldArmed;}
 const resources=[h,state,extra,surface,job,levels,cp],encoder=device.createCommandEncoder();
 for(let i=0;i<4;i++){
   const p=pipelines[i],group=device.createBindGroup({layout:p.getBindGroupLayout(0),entries:resources.map((buffer,binding)=>({binding,resource:{buffer}}))});
   const pass=encoder.beginComputePass();pass.setPipeline(p);pass.setBindGroup(0,group);pass.dispatchWorkgroups(i<2?32:64,i<2?4:2);pass.end();
 }
 const bytes=33*512*4,read=buffer(bytes*2,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
 encoder.copyBufferToBuffer(h,0,read,0,bytes);encoder.copyBufferToBuffer(extra,0,read,bytes,bytes);device.queue.submit([encoder.finish()]);
 await read.mapAsync(GPUMapMode.READ);const data=Array.from(new Uint32Array(read.getMappedRange()));read.unmap();
 for(const b of owned)b.destroy();return {data,errors:w.gpuStats.gpuErrors-errors0};
`;
const {id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();
const response=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!response.ok)throw new Error(response.error);
const {data,errors}=response.result,g=createRelaxationGrid(512,0.25);
for(const [i,h,s] of seeds){g.height[i]=fromHalf(h>>>16)-fromHalf(h&65535);g.frozen[i]=(s>>>16)&255;g.wet[i]=((s>>>8)&255)/255;if(s>>>24)g.material[i]=5;}
const before=g.height.reduce((a,b)=>a+b,0);for(const axis of [false,true])for(let phase=0;phase<2;phase++)projectTalusPairs(g,axis,phase,0,32);
let maxError=0,mass=0;const n=data.length/2;
for(let i=0;i<n;i++){const v=fromHalf(data[i]>>>16)-fromHalf(data[i]&65535)+fromHalf(data[n+i]>>>16);maxError=Math.max(maxError,Math.abs(v-g.height[i]));mass+=v;}
const result={date:new Date().toISOString(),maxError,massError:mass-before,beforeMass:before,errors,note:'Synthetic flat base, four disjoint-pair phases, frozen/transform/wet barriers; diagnostic pipelines created with late detector temporarily unarmed. Real cold world gate is checked separately.'};
fs.mkdirSync('docs/phase-9/relaxation',{recursive:true});fs.writeFileSync('docs/phase-9/relaxation/coarse-oracle.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
if(errors||maxError>1e-6||Math.abs(result.massError)>1e-5)process.exitCode=1;
