#!/usr/bin/env node
// Target-GPU meso parity using the existing Windows bot, rather than a second browser.
import fs from 'node:fs';
import { createServer } from 'vite';
import { WorldData } from '../../src/world/worldData.js';
const base = process.env.WRAITH_URL || 'http://127.0.0.1:4176';
async function ev(js) {
  new Function('g', 'w', 'return (async()=>{' + js + '})()'); // validate generated bot code before sending
  const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify({ do: 'eval', js }) })).json();
  const reply = await (await fetch(base + '/__wraith/bot/reply?id=' + id + '&wait=180000')).json();
  if (!reply.ok) throw new Error(reply.error);
  return reply.result;
}
const vite = await createServer({ logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
let code;
try {
  const { TERRAIN_NOISE_WGSL } = await vite.ssrLoadModule('/src/shaders/terrainNoise.wgsl.js');
  const { HEIGHT_WGSL } = await vite.ssrLoadModule('/src/shaders/clipmap.wgsl.js');
  code = `
@group(0) @binding(0) var<storage, read> heights: array<u32>;
@group(0) @binding(1) var<storage, read> overviewH: array<u32>;
@group(0) @binding(2) var<storage, read> biomeA: array<u32>;
@group(0) @binding(3) var<storage, read> biomeB: array<u32>;
@group(0) @binding(4) var<storage, read> windMap: array<u32>;
@group(0) @binding(5) var<storage, read> resident: array<u32>;
@group(0) @binding(6) var<storage, read> pts: array<vec2f>;
@group(0) @binding(7) var<storage, read_write> outH: array<f32>;
${TERRAIN_NOISE_WGSL}
${HEIGHT_WGSL}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x < arrayLength(&pts)) { let p = pts[id.x]; outH[id.x] = terrainH(p.x, p.y, 0.5); }
}`;
} finally { await vite.close(); }
const dir = 'data/world/', manifest = JSON.parse(fs.readFileSync(dir + 'manifest.json', 'utf8'));
const u8 = file => new Uint8Array(fs.readFileSync(dir + file));
const reports = [];
for (const center of [[2700, 1300], [2100, 500]]) {
  const points = 4096, radius = 500, pts = new Float32Array(points * 2);
  for (let k = 0; k < points; k++) {
    const r = radius * Math.sqrt((k + 0.5) / points), a = k * 2.399963229728653;
    pts[2 * k] = center[0] + r * Math.cos(a); pts[2 * k + 1] = center[1] + r * Math.sin(a);
  }
  const gpu = await ev(`
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    g.arm.setFree(false);g.game.teleport(${center[0]},${center[1]});
    for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
    const stats=w.gpuStats,d=stats.device,B=g.streamer.buffers,n=${points};
    const inputs=new Float32Array(${JSON.stringify(Array.from(pts))});
    const src=d.createBuffer({size:inputs.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    const dst=d.createBuffer({size:n*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
    const read=d.createBuffer({size:n*4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
    try {
      d.queue.writeBuffer(src,0,inputs);
      const module=d.createShaderModule({label:'D2 diagnostic parity',code:${JSON.stringify(code)}});
      const info=await module.getCompilationInfo(),errors=info.messages.filter(m=>m.type==='error');
      if(errors.length)throw new Error(errors.map(m=>m.lineNum+': '+m.message).join('; '));
      let pipe;const armed=stats.armed;
      try {stats.armed=false;pipe=d.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}});}
      finally {stats.armed=armed;}
      const entries=[B.heights,B.overview,B.biomeA,B.biomeB,B.wind,B.resident].map((b,i)=>({binding:i,resource:{buffer:b.getBuffer().underlyingResource}}));
      entries.push({binding:6,resource:{buffer:src}},{binding:7,resource:{buffer:dst}});
      const bg=d.createBindGroup({layout:pipe.getBindGroupLayout(0),entries});
      const enc=d.createCommandEncoder(),pass=enc.beginComputePass();pass.setPipeline(pipe);pass.setBindGroup(0,bg);pass.dispatchWorkgroups(Math.ceil(n/64));pass.end();
      enc.copyBufferToBuffer(dst,0,read,0,n*4);d.queue.submit([enc.finish()]);
      await read.mapAsync(GPUMapMode.READ);
      const heights=Array.from(new Float32Array(read.getMappedRange()));read.unmap();
      return {heights,resident:Array.from(B.residentData),gpuErrors:stats.gpuErrors,late:stats.late};
    } finally {src.destroy();dst.destroy();read.destroy();}
  `);
  const world = new WorldData(manifest);
  world.overview = new Uint16Array(u8(manifest.height.overview.file).buffer);
  world.biomeA = u8(manifest.biome.files[0]); world.biomeB = u8(manifest.biome.files[1]);
  world.wind = u8(manifest.wind.file); world.dunes = u8(manifest.dunes.file);
  gpu.resident.forEach((resident, k) => {
    if (resident) { const x = k % manifest.height.tiles, z = Math.floor(k / manifest.height.tiles); world.setTile(x, z, new Uint16Array(u8(`height/${x}_${z}.u16`).buffer)); }
  });
  let max = 0, total = 0, worst;
  for (let k = 0; k < points; k++) {
    const cpu = world.heightAt(pts[2 * k], pts[2 * k + 1]), error = Math.abs(cpu - gpu.heights[k]);
    total += error;
    if (error > max) { max = error; worst = { x: pts[2 * k], z: pts[2 * k + 1], cpu, gpu: gpu.heights[k] }; }
  }
  const report = { center, points, radius, maxAbsErrM: max, meanAbsErrM: total / points, worst,
    gpuErrors: gpu.gpuErrors, late: gpu.late, pass: max < 0.01 && !gpu.gpuErrors && !gpu.late.length };
  reports.push(report); console.log(JSON.stringify(report));
}
fs.writeFileSync('docs/phase-9/relaxation/dune-parity.json', JSON.stringify({ date: new Date().toISOString(),
  note: 'Only synchronous creation of the diagnostic pipeline is excluded from the late-world detector; detector remains armed during all waits and gameplay.', reports }, null, 2) + '\n');
if (reports.some(report => !report.pass)) process.exitCode = 1;
