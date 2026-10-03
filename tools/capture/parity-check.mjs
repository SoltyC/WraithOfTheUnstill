// CPU/GPU height parity (BRIEF §4.2, §19): evaluates the clipmap shader's own height function on
// the GPU (compute, same storage buffers the terrain reads) and src/world/worldData.js in Node
// from the baked files, at the same points around the player. Collision uses macro + meso, so
// the GPU side is sampled at spacing 0.5 m (micro off, meso at full detail, 2 m macro).
//   node tools/capture/parity-check.mjs [--points=4096] [--radius=500] [--spot=<photo spot>] [--skip-build]

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, startServer, launchBrowser, openGame } from './harness.mjs';
import { WorldData } from '../../src/world/worldData.js';
import { TERRAIN_NOISE_WGSL } from '../../src/shaders/terrainNoise.wgsl.js';
import { HEIGHT_WGSL } from '../../src/shaders/clipmap.wgsl.js';

const args = parseArgs();
const N = Number(args.points ?? 4096), R = Number(args.radius ?? 500);
const server = await startServer({ skipBuild: !!args['skip-build'] });
const browser = await launchBrowser(args);
let result;
try {
  const { page } = await openGame(browser, server.url, 'capture=1' + (args.spot ? '&spot=' + args.spot : ''), { width: 320, height: 180 });
  const center = await page.evaluate(() => { const p = window.__wraith.game.controller.pos; return [p.x, p.z]; });
  // Deterministic point set (golden-angle spiral) within R of the player.
  const pts = new Float32Array(N * 2);
  for (let k = 0; k < N; k++) {
    const r = R * Math.sqrt((k + 0.5) / N), a = k * 2.399963229728653;
    pts[2 * k] = center[0] + r * Math.cos(a); pts[2 * k + 1] = center[1] + r * Math.sin(a);
  }
  const wgsl = `
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
  if (id.x >= arrayLength(&pts)) { return; }
  let p = pts[id.x];
  outH[id.x] = terrainH(p.x, p.y, 0.5);
}`;
  const gpu = await page.evaluate(async ([code, ptsArr]) => {
    const g = window.__wraith.game, d = window.__wraith.gpuStats.device, B = g.streamer.buffers;
    const n = ptsArr.length / 2;
    const ptsBuf = d.createBuffer({ size: ptsArr.length * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(ptsBuf, 0, new Float32Array(ptsArr));
    const outBuf = d.createBuffer({ size: n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const read = d.createBuffer({ size: n * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const module = d.createShaderModule({ code });
    const info = await module.getCompilationInfo();
    const errs = info.messages.filter((m) => m.type === 'error').map((m) => m.lineNum + ': ' + m.message);
    if (errs.length) return { errors: errs };
    const pipe = d.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
    const res = (b) => b.getBuffer().underlyingResource;
    const bg = d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [B.heights, B.overview, B.biomeA, B.biomeB, B.wind, B.resident].map((b, i) => ({ binding: i, resource: { buffer: res(b) } })).concat([{ binding: 6, resource: { buffer: ptsBuf } }, { binding: 7, resource: { buffer: outBuf } }]) });
    const enc = d.createCommandEncoder();
    const pass = enc.beginComputePass(); pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(Math.ceil(n / 64)); pass.end();
    enc.copyBufferToBuffer(outBuf, 0, read, 0, n * 4);
    d.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const out = Array.from(new Float32Array(read.getMappedRange()));
    read.unmap();
    return { heights: out, resident: Array.from(B.residentData) };
  }, [wgsl, Array.from(pts)]);
  if (gpu.errors) throw new Error('WGSL compile errors:\n' + gpu.errors.join('\n'));

  // CPU: WorldData with exactly the GPU's resident tiles.
  const dir = path.join(ROOT, 'data/world');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const w = new WorldData(m);
  const u8 = (f) => new Uint8Array(fs.readFileSync(path.join(dir, f)));
  w.overview = new Uint16Array(u8(m.height.overview.file).buffer);
  w.biomeA = u8(m.biome.files[0]); w.biomeB = u8(m.biome.files[1]); w.wind = u8(m.wind.file);
  for (let k = 0; k < gpu.resident.length; k++) if (gpu.resident[k]) {
    const tx = k % m.height.tiles, tz = (k / m.height.tiles) | 0;
    w.setTile(tx, tz, new Uint16Array(u8(`height/${tx}_${tz}.u16`).buffer));
  }
  let maxErr = 0, sumErr = 0, worst = null;
  for (let k = 0; k < N; k++) {
    const cpu = w.heightAt(pts[2 * k], pts[2 * k + 1]);
    const e = Math.abs(cpu - gpu.heights[k]);
    sumErr += e;
    if (e > maxErr) { maxErr = e; worst = { x: pts[2 * k], z: pts[2 * k + 1], cpu, gpu: gpu.heights[k] }; }
  }
  result = { date: new Date().toISOString(), points: N, radius: R, center, residentTiles: gpu.resident.filter(Boolean).length, maxAbsErrM: maxErr, meanAbsErrM: sumErr / N, worst, pass: maxErr < 0.01 };
} finally {
  await browser.close();
  await server.close();
}
fs.mkdirSync(path.join(ROOT, 'screenshots/phase-01'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'screenshots/phase-01/parity-check.json'), JSON.stringify(result, null, 2));
console.log(`parity: ${result.points} points within ${result.radius} m, max |CPU−GPU| = ${(result.maxAbsErrM * 1000).toFixed(3)} mm, mean ${(result.meanAbsErrM * 1000).toFixed(3)} mm → ${result.pass ? 'PASS' : 'FAIL'}`);
process.exit(result.pass ? 0 : 1);
