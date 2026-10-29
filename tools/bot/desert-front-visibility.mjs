import fs from 'node:fs';
import {SANDSTORM_VOLUME_WGSL} from '../../src/shaders/post/sandstormVolume.wgsl.js';
const base='http://localhost:4181';
const shader=`struct Params{desert:array<vec4f,3>};
@group(0) @binding(0) var<storage,read> P:Params;
@group(0) @binding(1) var<storage,read> sandBiomeA:array<u32>;
@group(0) @binding(2) var<storage,read> rays:array<vec4f>;
@group(0) @binding(3) var<storage,read_write> result:array<vec4f>;
${SANDSTORM_VOLUME_WGSL}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){if(id.x>=arrayLength(&rays)/2u){return;}let c=rays[id.x*2u];let r=rays[id.x*2u+1u];let tau=stormOpticalDepth(c.xyz,r.xyz,r.w);result[id.x]=vec4f(tau,exp(-tau),3.0*r.w/max(tau,1e-6),stormBiome((c.xyz+r.xyz*r.w).xz));}`;
const js=`
 const f=g.sandstorm;if(f.block[3]<.99||f.age<90)throw new Error('Expected settled inside-storm pose');
 const d=w.gpuStats.device,points=[],labels=[],camera=[g.controller.pos.x,f.block[4],g.controller.pos.z];
 for(const [name,dir]of [['east',[1,0,0]],['west',[-1,0,0]],['north',[0,0,1]],['south',[0,0,-1]],['up',[0,1,0]]])for(const dist of [1,5,10,50,100,150,200,300,600]){points.push(...camera,0,...dir,dist);labels.push({name,dist});}
 const pts=new Float32Array(points),field=d.createBuffer({size:48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),rays=d.createBuffer({size:pts.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),out=d.createBuffer({size:labels.length*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),read=d.createBuffer({size:labels.length*16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 try{
 d.queue.writeBuffer(field,0,f.block);d.queue.writeBuffer(rays,0,pts);const module=d.createShaderModule({label:'actual storm optical-depth visibility',code:${JSON.stringify(shader)}}),info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw new Error(JSON.stringify(info.messages));let pipeline;const armed=w.gpuStats.armed;try{w.gpuStats.armed=false;pipeline=d.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}});}finally{w.gpuStats.armed=armed;}
 const buffers=[field,g.atmosphere.biomeA.getBuffer().underlyingResource,rays,out],group=d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:buffers.map((buffer,binding)=>({binding,resource:{buffer}}))});
 const run=async()=>{const enc=d.createCommandEncoder(),p=enc.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(1);p.end();enc.copyBufferToBuffer(out,0,read,0,labels.length*16);d.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);const a=Array.from(new Float32Array(read.getMappedRange()));read.unmap();return a;};
 const active=await run(),offField=f.block.slice();offField[3]=0;d.queue.writeBuffer(field,0,offField);const off=await run();
 let nonFinite=0,badNear=0,offNonzero=0;const results=[];for(let i=0;i<labels.length;i++){const o=i*4;for(let j=0;j<4;j++)if(!Number.isFinite(active[o+j]))nonFinite++;if(labels[i].dist<=10&&active[o]>.015*labels[i].dist+1e-5)badNear++;if(off[o]!==0)offNonzero++;results.push({...labels[i],tau:active[o],transmittance:active[o+1],visibility:active[o+2],endDunes:active[o+3]});}
 return {camera,results,nonFinite,badNear,offNonzero,gpuErrors:w.gpuStats.gpuErrors,gpuMessages:w.gpuStats.gpuErrorMessages,late:w.gpuStats.late};
 }finally{field.destroy();rays.destroy();out.destroy();read.destroy();}
`;
const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(JSON.stringify(r));const report={date:new Date().toISOString(),...r.result,note:'Actual renderer optical-depth integrator and live8m Dunes biome buffer,45horizontal/upward rays at ground-reference height in the fixed age95 storm. Visibility=3/sigmaEffective, measured from each path. Core200m horizontal rays test150–300m; near1–10m optical depth cannot exceed.015/m path bound. Diagnostic pipeline unarmed; no rendered actor/telegraph/shelter/performance acceptance.'};fs.writeFileSync('docs/phase-9/storm-front/visibility.json',JSON.stringify(report,null,2)+'\n');const core=report.results.filter(r=>r.name!=='up'&&r.dist===200&&r.endDunes>=.95);console.log({core,nonFinite:report.nonFinite,badNear:report.badNear,offNonzero:report.offNonzero,gpuErrors:report.gpuErrors,late:report.late});
if(core.length<2||core.some(r=>r.visibility<150||r.visibility>300)||report.nonFinite||report.badNear||report.offNonzero||report.gpuErrors||report.late.length)process.exitCode=1;
