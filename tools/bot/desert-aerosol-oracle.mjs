import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {ATMO_COMMON_WGSL as current} from '../../src/shaders/atmosphere.wgsl.js';
const revision='fc216fe',source=execFileSync('git',['show',revision+':src/shaders/atmosphere.wgsl.js'],{encoding:'utf8'}).replaceAll('export const ','const ');
const baseline=new Function(source+';return ATMO_COMMON_WGSL;')();
const cases=[];for(const h of [0,.15,.35,1,2,5,20,40])for(const haze of [.2,1,2])for(const dust of [0,.8])cases.push([h,haze,dust,0]);
const shaders=[baseline,current].map((common,i)=>`${common}
@group(0) @binding(0) var<storage,read> cases:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> output:array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3u){if(id.x>=arrayLength(&cases)){return;}let c=cases[id.x];let m=medium(c.x,c.y${i?',c.z':''});let k=id.x*4u;output[k]=vec4f(m.scattering,0.0);output[k+1u]=vec4f(m.extinction,0.0);output[k+2u]=vec4f(m.rayleigh,0.0);output[k+3u]=vec4f(m.mie,0.0);}`);
const js=`
 const device=w.gpuStats.device,owned=[],old=w.gpuStats.armed,data=new Float32Array(${JSON.stringify(cases.flat())}),bytes=${cases.length}*64;
 const buffer=(size,usage)=>{const b=device.createBuffer({size,usage});owned.push(b);return b;};
 const input=buffer(data.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(input,0,data);
 const out=[buffer(bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),buffer(bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC)],read=buffer(bytes*2,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ),pipelines=[];
 try{
  try{w.gpuStats.armed=false;for(const code of ${JSON.stringify(shaders)})pipelines.push(await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code}),entryPoint:'main'}}));}finally{w.gpuStats.armed=old;}
  const e=device.createCommandEncoder();for(let i=0;i<2;i++){const group=device.createBindGroup({layout:pipelines[i].getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:input}},{binding:1,resource:{buffer:out[i]}}]}),p=e.beginComputePass();p.setPipeline(pipelines[i]);p.setBindGroup(0,group);p.dispatchWorkgroups(1);p.end();e.copyBufferToBuffer(out[i],0,read,bytes*i,bytes);}
  device.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);const values=Array.from(new Float32Array(read.getMappedRange()));read.unmap();return {values,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
 }finally{w.gpuStats.armed=old;for(const b of owned)b.destroy();}
`;
const base='http://localhost:4181',{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const response=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!response.ok)throw new Error(response.error);
const {values,gpuErrors,late}=response.result,n=cases.length*16;let zeroDustMismatches=0,nonFinite=0,badExtinction=0;
const rows=cases.map((c,i)=>{const a=values.slice(i*16,i*16+16),b=values.slice(n+i*16,n+i*16+16);for(let j=0;j<16;j++){if(!Number.isFinite(b[j]))nonFinite++;if(c[2]===0&&a[j]!==b[j])zeroDustMismatches++;}for(let j=0;j<3;j++)if(b[j+4]<b[j]-1e-9)badExtinction++;return {h:c[0],haze:c[1],dust:c[2],scatterDelta:b.slice(0,3).map((v,j)=>v-a[j]),extinctionDelta:b.slice(4,7).map((v,j)=>v-a[j+4])};});
const ground=rows.find(r=>r.h===0&&r.haze===1&&r.dust===.8),loft=rows.find(r=>r.h===1&&r.haze===1&&r.dust===.8),ratio=loft.scatterDelta[0]/ground.scatterDelta[0];
const report={date:new Date().toISOString(),baselineRevision:revision,zeroDustMismatches,nonFinite,badExtinction,loftRatioAt1km:ratio,rows,gpuErrors,late,note:'Original pinned atmosphere medium versus current actual WGSL on48height/haze/dust cases. Dust0 must be bit-identical; positive dust must stay finite/energy-loss-consistent, warm scattering/blue extinction and low scale height. Diagnostic pipelines compiled unarmed; separate cold world checks required.'};
fs.writeFileSync('docs/phase-9/heat/aerosol-coefficients.json',JSON.stringify(report,null,2)+'\n');console.log({zeroDustMismatches,nonFinite,badExtinction,ratio,ground,gpuErrors,late});
if(zeroDustMismatches||nonFinite||badExtinction||ratio>.06||ground.scatterDelta[0]<=ground.scatterDelta[2]||ground.extinctionDelta[2]<=ground.extinctionDelta[0]||gpuErrors)process.exitCode=1;
