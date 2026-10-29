import fs from 'node:fs';
import {createServer} from 'vite';
const vite=await createServer({server:{middlewareMode:true}});
let vertex,wind;
try{vertex=(await vite.ssrLoadModule('/src/shaders/sandDust.wgsl.js')).sandDustVertexWGSL;wind=(await vite.ssrLoadModule('/src/shaders/wind.wgsl.js')).WIND_WGSL;}finally{await vite.close();}
const base='http://localhost:4181';
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
await ev(`const frame=()=>new Promise(r=>requestAnimationFrame(r));g.clock.frozen=true;g.ws.restoration.dunes='restored';g.restoration.snap=true;g.ws.weatherOverride='clear';g.ws.wetForce=0;g.game.teleport(2514,816);for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();for(let i=0;i<120;i++)await frame();g.terrainState.restore([]);for(let i=0;i<60;i++)await frame();return {gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`);
const helpers=vertex.slice(vertex.indexOf('const V:'),vertex.indexOf('@vertex'));
const branch=vertex.slice(vertex.indexOf('    let k=id-'),vertex.indexOf('  alpha *= looseSand'));
const code=`struct U{cameraPosition:vec4f,dustParams:vec4f,crestParams:vec4f,windField:array<vec4f,6>,levels:array<vec4f,16>};
@group(0) @binding(0) var<storage,read> levelData:array<vec4f>;
@group(0) @binding(1) var<storage,read> surface:array<u32>;
@group(0) @binding(2) var<storage,read> stateFine0:array<u32>;
@group(0) @binding(3) var<storage,read> stateFine1:array<u32>;
@group(0) @binding(4) var<storage,read> stateParams:array<u32>;
@group(0) @binding(5) var<storage,read> uniforms:U;
@group(0) @binding(6) var<storage,read_write> output:array<vec4f>;
${wind}
${helpers}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3u){if(gid.x>=1024u){return;}
let id=gid.x+2112u;let cam=uniforms.cameraPosition.xyz;var p=cam.xz;var source=p;var lift=0.0;var alpha=0.0;var sx=.3;var sy=.12;var crestY=0.0;var direction=uniforms.windField[0].xy;var particleSeed=0.0;
if(uniforms.crestParams.y>0.0 && uniforms.crestParams.z>.001){
${branch}
alpha*=looseSand(source)*uniforms.dustParams.z;
output[gid.x*2u]=vec4f(p.x,crestY+lift,p.y,alpha);output[gid.x*2u+1u]=vec4f(source,sx,sy);
}`;
const result=await ev(`
 const d=w.gpuStats.device,sd=g.sandDust,ts=g.terrainState;
 const params=new Float32Array(100);params.set([g.camera.position.x,g.camera.position.y,g.camera.position.z,0]);params.set([0,0,1,0],4);params.set([0,1,1,0],8);params.set(g.wind.block,12);params.set(g.content.clipmap.levels,36);
 const input=d.createBuffer({size:400,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),out=d.createBuffer({size:32768,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),read=d.createBuffer({size:32768,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 try{
 const module=d.createShaderModule({label:'actual crest vertex pose oracle',code:${JSON.stringify(code)}});const info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw new Error(JSON.stringify(info.messages));
 let pipeline;const armed=w.gpuStats.armed;try{w.gpuStats.armed=false;pipeline=d.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}});}finally{w.gpuStats.armed=armed;}
 const buffers=[g.content.clipmap.levelData,g.streamer.buffers.surface,ts.fine[0],ts.fine[1],ts.params].map(b=>b.getBuffer().underlyingResource);buffers.push(input,out);
 const bg=d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:buffers.map((buffer,binding)=>({binding,resource:{buffer}}))});
 const run=async()=>{d.queue.writeBuffer(input,0,params);const enc=d.createCommandEncoder(),p=enc.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,bg);p.dispatchWorkgroups(16);p.end();enc.copyBufferToBuffer(out,0,read,0,32768);d.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);const a=new Float32Array(read.getMappedRange()).slice();read.unmap();return a;};
 const still=await run();params[4]=100;params[15]+=100;const later=await run();let stillMismatches=0;for(let i=0;i<still.length;i++)if(still[i]!==later[i])stillMismatches++;
 params[7]=1;params[12+2]=1;params[8]=0;const moving=await run();params[8]=1;const moved=await run();
 let active=0,motion=0,nonFinite=0,maximumAlpha=0;const anchors=[];
 for(let i=0;i<1024;i++){const o=i*8;for(let j=0;j<8;j++)if(!Number.isFinite(still[o+j]))nonFinite++;if(still[o+3]>.001){active++;maximumAlpha=Math.max(maximumAlpha,still[o+3]);anchors.push(Array.from(still.slice(o,o+8)));}if((moving[o+3]>.001||moved[o+3]>.001)&&Math.hypot(moving[o]-moved[o],moving[o+1]-moved[o+1],moving[o+2]-moved[o+2])>.001)motion++;}
 params[5]=1;const wet=await run();params[5]=0;params[9]=0;const off=await run();params[9]=1;params[10]=0;const outside=await run();params[10]=1;const beforeFreeze=await run();
 let nearest=0,best=Infinity;for(let i=0;i<1024;i++)if(beforeFreeze[i*8+3]>.001){const dist=Math.hypot(beforeFreeze[i*8+4]-g.camera.position.x,beforeFreeze[i*8+5]-g.camera.position.z);if(dist<best){best=dist;nearest=i;}}
 ts.bx=beforeFreeze[nearest*8+4];ts.bz=beforeFreeze[nearest*8+5];ts.bdx=1;ts.bdz=0;ts.bl=0;ts.bw=8;ts.bd=0;ts.bc=1;ts.bk=3;ts.stamp();for(let i=0;i<30;i++)await new Promise(r=>requestAnimationFrame(r));const frozen=await run();let frozenSuppressed=0;for(let i=0;i<1024;i++)if(beforeFreeze[i*8+3]>.001&&frozen[i*8+3]===0)frozenSuppressed++;
 let outsideActive=0;for(let i=0;i<1024;i++)if(outside[i*8+3]!==0)outsideActive++;
 let wetActive=0,offActive=0;for(let i=0;i<1024;i++){if(wet[i*8+3]!==0)wetActive++;if(off[i*8+3]!==0)offActive++;}
 anchors.sort((a,b)=>Math.hypot(a[0]-g.camera.position.x,a[2]-g.camera.position.z)-Math.hypot(b[0]-g.camera.position.x,b[2]-g.camera.position.z));anchors.length=Math.min(12,anchors.length);
 return {active,maximumAlpha,stillMismatches,movingAnchors:motion,nonFinite,wetActive,offActive,outsideActive,frozenSuppressed,anchors,camera:g.camera.position.asArray(),gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
 }finally{input.destroy();out.destroy();read.destroy();}
`);
const ridgeFn=helpers.slice(helpers.indexOf('fn dustCrest('),helpers.indexOf('fn dustRelief('));
const synthetic=`@group(0) @binding(0) var<storage,read_write> result:array<vec4f>;
var<private> mode:u32;
fn dustGround(p:vec2f)->f32{
 if(mode==0u){return 10.0;}if(mode==1u){return 10.0+.4*p.x+.3*p.y;}
 if(mode==2u){return 10.0+.1*dot(p,p);}if(mode==3u){return 10.0-.1*p.x*p.x;}
 if(mode==4u){return 10.0-.1*p.y*p.y;}return 10.0-.05*(p.x+p.y)*(p.x+p.y);
}
${ridgeFn}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){if(id.x>=6u){return;}mode=id.x;result[id.x]=dustCrest(vec2f(.75,.8));}`;
result.synthetic=await ev(`const d=w.gpuStats.device,out=d.createBuffer({size:96,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),read=d.createBuffer({size:96,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
try{const module=d.createShaderModule({label:'actual crest classifier synthetic shapes',code:${JSON.stringify(synthetic)}}),info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw new Error(JSON.stringify(info.messages));let pipeline;const armed=w.gpuStats.armed;try{w.gpuStats.armed=false;pipeline=d.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}});}finally{w.gpuStats.armed=armed;}const bg=d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:out}}]});const enc=d.createCommandEncoder(),p=enc.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,bg);p.dispatchWorkgroups(1);p.end();enc.copyBufferToBuffer(out,0,read,0,96);d.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);const a=Array.from(new Float32Array(read.getMappedRange()));read.unmap();return ['flat','slope','basin','ridgeX','ridgeZ','ridgeDiagonal'].map((name,i)=>({name,pose:a.slice(i*4,i*4+4)}));}finally{out.destroy();read.destroy();}`);
if(result.synthetic.some((r,i)=>r.pose.some(v=>!Number.isFinite(v))||(i<3?r.pose[3]!==0:r.pose[3]<.99)))process.exitCode=1;
fs.mkdirSync('docs/phase-9/crest-air',{recursive:true});fs.writeFileSync('docs/phase-9/crest-air/oracle.json',JSON.stringify({date:new Date().toISOString(),...result,note:'Actual renderer crest branch, height/material helpers and shared wind functions compiled as compute against live clipmap/surface/fine-state buffers. Stilled raw/wind time advances100s with fixed integrated release time; restored pose advances1s. Diagnostic pipeline intentionally unarmed; not a cold world gate. Near-camera bounded coverage, not every distant crest.'},null,2)+'\n');console.log(result);
if(result.active<5||result.stillMismatches||result.movingAnchors<5||result.nonFinite||result.wetActive||result.offActive||result.outsideActive||result.frozenSuppressed<1||result.gpuErrors||result.late.length)process.exitCode=1;
