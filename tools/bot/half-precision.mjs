#!/usr/bin/env node
import fs from 'node:fs';
import { HEIGHT_REMAINDER_WGSL } from '../../src/shaders/heightRemainder.wgsl.js';
import { toHalf } from '../../src/terrain/state/healing.js';
const values = new Float32Array(1024);
const tiny = [0, 1e-8, 3e-8, 6e-8, 1e-7, 1e-6, 1e-5, 3e-5, 2**-25, 3*2**-25, 1+2**-11, 1+3*2**-11];
for (let i = 0; i < values.length; i++) values[i] = i < tiny.length * 2 ? tiny[i % tiny.length] * (i < tiny.length ? 1 : -1) : Math.sin(i * 137.3) * 0.0002;
const code = `${HEIGHT_REMAINDER_WGSL}
@group(0) @binding(0) var<storage,read> inputData:array<f32>;
@group(0) @binding(1) var<storage,read_write> outputData:array<u32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){
 if(id.x<arrayLength(&inputData)){outputData[id.x]=packHeightRemainder(inputData[id.x])>>16u;}
}`;
const js = `
 const d=w.gpuStats.device,values=new Float32Array(new Uint32Array(${JSON.stringify(Array.from(new Uint32Array(values.buffer)))}).buffer),size=values.byteLength;
 const input=d.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
 const output=d.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
 const read=d.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
 try {
   d.queue.writeBuffer(input,0,values);const module=d.createShaderModule({code:${JSON.stringify(code)}});
   let pipeline;const armed=w.gpuStats.armed;
   try{w.gpuStats.armed=false;pipeline=d.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}});}
   finally{w.gpuStats.armed=armed;}
   const bg=d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:input}},{binding:1,resource:{buffer:output}}]});
   const e=d.createCommandEncoder(),pass=e.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bg);pass.dispatchWorkgroups(Math.ceil(values.length/64));pass.end();
   e.copyBufferToBuffer(output,0,read,0,size);d.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);
   const bits=Array.from(new Uint32Array(read.getMappedRange()));read.unmap();
   return {bits,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
 }finally{input.destroy();output.destroy();read.destroy();}
`;
const base = process.env.WRAITH_URL || 'http://127.0.0.1:4176';
const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify({ do: 'eval', js }) })).json();
const reply = await (await fetch(base + '/__wraith/bot/reply?id=' + id + '&wait=180000')).json();
if (!reply.ok) throw new Error(reply.error);
const { bits, gpuErrors, late } = reply.result;
const mismatches = [];
values.forEach((value, i) => { if (toHalf(value) !== bits[i]) mismatches.push({ value, cpu: toHalf(value), gpu: bits[i] }); });
const report = { date: new Date().toISOString(), points: values.length, mismatches, gpuErrors, late,
  note: 'Only synchronous creation of this diagnostic pipeline is excluded from world late detection.' };
fs.writeFileSync('docs/phase-9/relaxation/half-nearest.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (mismatches.length || gpuErrors || late.length) process.exitCode = 1;
