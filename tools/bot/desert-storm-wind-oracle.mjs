import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createWind,WIND_VECTORS} from '../../src/world/wind.js';
import {createSandstormFront} from '../../src/world/sandstormFront.js';
import {WIND_WGSL} from '../../src/shaders/wind.wgsl.js';
const oldSource=execFileSync('git',['show','2224f79:src/shaders/wind.wgsl.js'],{encoding:'utf8'}).replaceAll('export const ','const ');
const oldWind=new Function(oldSource+'\nreturn WIND_WGSL;')();
const cases=[{name:'off',on:false,age:95,gate:1},{name:'gate-zero',on:true,age:95,gate:0},{name:'incoming',on:true,age:45,gate:1},{name:'inside',on:true,age:95,gate:1},{name:'gate-quarter',on:true,age:95,gate:.25},{name:'Gale-burst',on:true,age:95,gate:1,burst:true},{name:'zero-base',on:true,age:95,gate:1,zero:true}],packed=new Float32Array(cases.length*WIND_VECTORS*4),points=[],expected=[];
for(let ci=0;ci<cases.length;ci++){
 const c=cases[ci],f=createSandstormFront();f.enabled=c.on;f.target=1;f.snap=true;f.anchorX=2400;f.anchorZ=900;f.baseY=180;f.update();f.age=c.age;f.update();
 const w=createWind(f);w.stormWeight=c.gate;w.dirX=.6;w.dirZ=-.8;w.strength=c.zero?0:.9;w.gustiness=.65;w.time=13.3;w.update();if(c.burst){w.burst(2400,900,3);w.time=13.8;w.update();}packed.set(w.block,ci*WIND_VECTORS*4);
 const query=(x,z)=>{w.sx=Math.fround(x);w.sz=Math.fround(z);w.sample();points.push(w.sx,w.sz,ci,0);expected.push(w.outX,w.outZ,w.speed,0);};
 for(let z=500;z<=1800;z+=57)for(let x=1800;x<=3600;x+=57)query(x,z);query(2407,900);query(2393,900);
}
const prefix=`struct U{windField:array<vec4f,${WIND_VECTORS}>};var<private> uniforms:U;
@group(0) @binding(0) var<storage,read> fields:array<vec4f>;
@group(0) @binding(1) var<storage,read> points:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> result:array<vec4f>;`;
const kernel=`@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){if(id.x>=arrayLength(&points)){return;}let p=points[id.x];let k=u32(p.z)*${WIND_VECTORS}u;for(var i=0u;i<${WIND_VECTORS}u;i++){uniforms.windField[i]=fields[k+i];}result[id.x]=vec4f(windField(p.xy),0.0);}`;
const current=prefix+WIND_WGSL+kernel,original=prefix+oldWind+kernel,base='http://localhost:4181';
const js=`
const d=w.gpuStats.device,fieldData=new Float32Array(${JSON.stringify(Array.from(packed))}),pts=new Float32Array(${JSON.stringify(points)}),expected=${JSON.stringify(expected)};
const fields=d.createBuffer({size:fieldData.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),points=d.createBuffer({size:pts.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),out=d.createBuffer({size:pts.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),read=d.createBuffer({size:pts.byteLength,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
try{d.queue.writeBuffer(fields,0,fieldData);d.queue.writeBuffer(points,0,pts);
const run=async code=>{const module=d.createShaderModule({label:'storm wind CPU/GPU parity',code}),info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw new Error(JSON.stringify(info.messages));let pipeline;const armed=w.gpuStats.armed;try{w.gpuStats.armed=false;pipeline=d.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}});}finally{w.gpuStats.armed=armed;}const bg=d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[fields,points,out].map((buffer,binding)=>({binding,resource:{buffer}}))}),enc=d.createCommandEncoder(),p=enc.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,bg);p.dispatchWorkgroups(Math.ceil(pts.length/4/64));p.end();enc.copyBufferToBuffer(out,0,read,0,pts.byteLength);d.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);const a=new Float32Array(read.getMappedRange()).slice();read.unmap();return a;};
const actual=await run(${JSON.stringify(current)}),old=await run(${JSON.stringify(original)});let maxAbs=0,mismatches=0,nonFinite=0,offBitMismatches=0;const bitsA=new Uint32Array(actual.buffer),bitsB=new Uint32Array(old.buffer),perCase=Array.from({length:7},()=>({maxAbs:0,samples:0}));
for(let i=0;i<pts.length/4;i++){const ci=pts[i*4+2];perCase[ci].samples++;for(let j=0;j<3;j++){const k=i*4+j,error=Math.abs(actual[k]-expected[k]);if(!Number.isFinite(actual[k]))nonFinite++;maxAbs=Math.max(maxAbs,error);perCase[ci].maxAbs=Math.max(perCase[ci].maxAbs,error);if(error>2e-4)mismatches++;if(ci<2&&bitsA[k]!==bitsB[k])offBitMismatches++;}}
return {samples:pts.length/4,maxAbs,mismatches,nonFinite,offBitMismatches,perCase,gpuErrors:w.gpuStats.gpuErrors,gpuMessages:w.gpuStats.gpuErrorMessages,late:w.gpuStats.late};
}finally{fields.destroy();points.destroy();out.destroy();read.destroy();}`;
const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(JSON.stringify(r));const report={date:new Date().toISOString(),cases,...r.result,note:'Actual CPU field versus shared GPU wind function over7cases,2e-4 fixed absolute bound. Off and biome-gate0 are also bitwise compared to pinned2224f79 GPU wind on identical inputs. Burst slots unchanged. Diagnostic pipelines unarmed; not a cold-world/rendered wind, water SSR, cloth or allocation acceptance.'};fs.writeFileSync('docs/phase-9/storm-front/wind-parity.json',JSON.stringify(report,null,2)+'\n');console.log(report);if(report.mismatches||report.nonFinite||report.offBitMismatches||report.gpuErrors||report.late.length)process.exitCode=1;
