import fs from 'node:fs';
import { createServer } from 'vite';
const vite=await createServer({server:{middlewareMode:true}});
let sandDustVertexWGSL;try{({sandDustVertexWGSL}=await vite.ssrLoadModule('/src/shaders/sandDust.wgsl.js'));}finally{await vite.close();}
const base=process.env.WRAITH_URL||'http://127.0.0.1:4173';
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
// Run the actual vertex shader's material gate against the live world buffers.
const fn=sandDustVertexWGSL.slice(sandDustVertexWGSL.indexOf('fn looseSand('),sandDustVertexWGSL.indexOf('@vertex')).replace('fn looseSand(p: vec2f)', 'fn looseSand(p: vec2f, rain: f32)').replace('uniforms.dustParams.y','rain');
const code=`@group(0) @binding(0) var<storage,read> surface:array<u32>;
@group(0) @binding(1) var<storage,read> stateFine1:array<u32>;
@group(0) @binding(2) var<storage,read> stateParams:array<u32>;
@group(0) @binding(3) var<storage,read> pts:array<vec4f>;
@group(0) @binding(4) var<storage,read_write> result:array<f32>;
${fn}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){if(id.x<arrayLength(&pts)){let p=pts[id.x];result[id.x]=looseSand(p.xy,p.z);}}`;
console.log(await ev(`g.clock.frozen=true;g.ws.wetForce=0;g.ws.puddleForce=0;g.terrainState.restore([]);for(let i=0;i<90;i++)await new Promise(r=>requestAnimationFrame(r));return true;`));
const result=await ev(`
const stats=w.gpuStats,d=stats.device,ts=g.terrainState;
const points=new Float32Array([1900,902,0,0,1900,902,0.2,0,1900,902,0.5,0,1900,902,1,0,1130,2750,0,0]);
const input=d.createBuffer({size:points.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
const out=d.createBuffer({size:20,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
const read=d.createBuffer({size:20,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
try{
d.queue.writeBuffer(input,0,points);
const module=d.createShaderModule({label:'sand dust diagnostic material gate',code:${JSON.stringify(code)}});
const info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw new Error(JSON.stringify(info.messages));
let pipeline;const armed=stats.armed;try{stats.armed=false;pipeline=d.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}});}finally{stats.armed=armed;}
const buffers=[g.streamer.buffers.surface,ts.fine[1],ts.params].map(b=>b.getBuffer().underlyingResource);
const group=d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[...buffers.map((buffer,binding)=>({binding,resource:{buffer}})),{binding:3,resource:{buffer:input}},{binding:4,resource:{buffer:out}}]});
const run=async()=>{const enc=d.createCommandEncoder();const p=enc.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(1);p.end();enc.copyBufferToBuffer(out,0,read,0,20);d.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);const values=Array.from(new Float32Array(read.getMappedRange()));read.unmap();return values;};
const dry=await run();
ts.bx=1900;ts.bz=902;ts.bdx=1;ts.bdz=0;ts.bl=0;ts.bw=4;ts.bd=0;ts.bc=1;ts.bk=3;ts.stamp();for(let i=0;i<30;i++)await new Promise(r=>requestAnimationFrame(r));
const frozen=await run();
return {dry,frozen,gpuErrors:stats.gpuErrors,late:stats.late,note:'The unchanged looseSand shader body is run as a diagnostic compute function against actual surface/fine-state/window buffers. Columns are dry, rain 0.2, rain 0.5, rain 1, non-sand.'};
}finally{input.destroy();out.destroy();read.destroy();}`);
console.log(result);fs.writeFileSync('docs/phase-9/dust/material-oracle.json',JSON.stringify({date:new Date().toISOString(),...result},null,2)+'\n');
if(result.dry[0]!==1||!(result.dry[1]>result.dry[2]&&result.dry[2]>0)||result.dry[3]!==0||result.dry[4]!==0||result.frozen.slice(0,4).some(v=>v!==0)||result.gpuErrors||result.late.length)process.exitCode=1;
