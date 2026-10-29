import fs from 'node:fs';
import {createSandstormFront} from '../../src/world/sandstormFront.js';
import {SANDSTORM_FRONT_WGSL} from '../../src/shaders/sandstormFront.wgsl.js';
const cases=[{name:'off',age:0,on:false,dx:1,dz:0,target:1},{name:'incoming',age:0,on:true,dx:3,dz:4,target:1},{name:'leading-face',age:75,on:true,dx:1,dz:0,target:1},{name:'inside',age:100,on:true,dx:3,dz:4,target:1},{name:'tail',age:250,on:true,dx:1,dz:0,target:1},{name:'partial',age:100,on:true,dx:-.8,dz:.6,target:.4}];
const packed=new Float32Array(cases.length*12),points=[],expected=[];
for(let ci=0;ci<cases.length;ci++){
 const c=cases[ci],f=createSandstormFront();f.enabled=c.on;f.target=c.target;f.anchorX=2400;f.anchorZ=900;f.baseY=180;f.dirX=c.dx;f.dirZ=c.dz;f.snap=true;f.update();f.dt=1;for(let i=0;i<c.age;i++)f.update();packed.set(f.block,ci*12);
 for(let z=-3200;z<=3200;z+=200)for(let x=-3200;x<=3200;x+=200)for(const y of [-20,180,400,900]){
  // Evaluate CPU at the same f32 point coordinates supplied to the GPU.
  f.qx=Math.fround(2400+x);f.qy=Math.fround(y);f.qz=Math.fround(900+z);f.sample();points.push(f.qx,f.qy,f.qz,ci);expected.push(f.density);
 }
}
const input=new Float32Array(points),base='http://localhost:4181';
const shader=`@group(0) @binding(0) var<storage,read> fields:array<vec4f>;
@group(0) @binding(1) var<storage,read> points:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> result:array<f32>;
${SANDSTORM_FRONT_WGSL}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){if(id.x>=arrayLength(&points)){return;}let p=points[id.x];let k=u32(p.w)*3u;result[id.x]=sandstormDensity(p.xyz,fields[k],fields[k+1u],fields[k+2u]);}`;
const js=`
const d=w.gpuStats.device,F=new Float32Array(${JSON.stringify(Array.from(packed))}),pts=new Float32Array(${JSON.stringify(Array.from(input))}),expected=${JSON.stringify(expected)};
const fields=d.createBuffer({size:F.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),points=d.createBuffer({size:pts.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),out=d.createBuffer({size:expected.length*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),read=d.createBuffer({size:expected.length*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
try{
d.queue.writeBuffer(fields,0,F);d.queue.writeBuffer(points,0,pts);const module=d.createShaderModule({label:'shared storm density parity',code:${JSON.stringify(shader)}}),info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw new Error(JSON.stringify(info.messages));let pipeline;const armed=w.gpuStats.armed;try{w.gpuStats.armed=false;pipeline=d.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}});}finally{w.gpuStats.armed=armed;}
const group=d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[fields,points,out].map((buffer,binding)=>({binding,resource:{buffer}}))}),enc=d.createCommandEncoder(),pass=enc.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(expected.length/64));pass.end();enc.copyBufferToBuffer(out,0,read,0,expected.length*4);d.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);const values=new Float32Array(read.getMappedRange());let maxAbs=0,nonFinite=0,outOfRange=0,mismatches=0;const perCase=Array.from({length:6},()=>({maxAbs:0,active:0}));
for(let i=0;i<values.length;i++){const actual=values[i],error=Math.abs(actual-expected[i]),ci=pts[i*4+3];if(!Number.isFinite(actual))nonFinite++;if(actual<0||actual>1)outOfRange++;if(error>2e-5)mismatches++;maxAbs=Math.max(maxAbs,error);perCase[ci].maxAbs=Math.max(perCase[ci].maxAbs,error);if(actual>0)perCase[ci].active++;}read.unmap();return {samples:expected.length,maxAbs,nonFinite,outOfRange,mismatches,perCase,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
}finally{fields.destroy();points.destroy();out.destroy();read.destroy();}`;
const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(JSON.stringify(r));
const report={date:new Date().toISOString(),cases,...r.result,note:'Actual shared CPU model versus native GPU density function over fixed f32 inputs and six finite world-front phases.2e-5 absolute threshold, no filtered samples. Diagnostic pipeline compiled with late detector unarmed. This is density parity only, not a rendered wall, visibility/readability, storm gameplay, saved migration or cold-world pipeline acceptance.'};fs.mkdirSync('docs/phase-9/storm-front',{recursive:true});fs.writeFileSync('docs/phase-9/storm-front/density-parity.json',JSON.stringify(report,null,2)+'\n');console.log(report);
if(report.mismatches||report.nonFinite||report.outOfRange||report.gpuErrors||report.late.length)process.exitCode=1;
