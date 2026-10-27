#!/usr/bin/env node
// Compare one material view across builds with identical camera/quality settings.
// Run with one Windows bot page, e.g. WRAITH_URL=http://127.0.0.1:4174
// SPOTS_FILE=/path/to/data/photo-spots.json node tools/bot/material-audit.mjs p9s1-star-mid sand
// Timings on a locked PC are indicative; this is not the sustained performance gate.
import fs from 'node:fs';
import path from 'node:path';

const [spotId = 'p9s1-star-mid', label = 'material'] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Use a simple file label');
const base = process.env.WRAITH_URL || 'http://127.0.0.1:4173';
const { spots } = JSON.parse(fs.readFileSync(process.env.SPOTS_FILE || 'data/photo-spots.json', 'utf8'));
const spot = spots.find((s) => s.id === spotId);
if (!spot) throw new Error('Unknown photo spot: ' + spotId);
const bot = async (cmd, args) => {
  const { id } = await (await fetch(base + '/__wraith/bot/cmd', { method: 'POST', body: JSON.stringify({ do: cmd, ...args }) })).json();
  const r = await (await fetch(base + '/__wraith/bot/reply?id=' + id + '&wait=180000')).json();
  if (r.ok === false) throw new Error(r.error);
  return r;
};
const { result } = await bot('eval', { js: `
  const spot = ${JSON.stringify(spot)}, frame = () => new Promise((r) => requestAnimationFrame(r));
  w.params.v.dynamicRes = 0; w.params.v.renderScale = 1; w.params.version++;
  g.atmosphere.alwaysSnap = true; g.clock.pinHour = spot.time; g.game.applySpot(spot);
  for (let k = 0; k < 600 && !g.game.worldSettled(); k++) await frame();
  if (!g.game.worldSettled()) throw new Error('World did not settle');
  for (let k = 0; k < 90; k++) await frame();
  const timer = w.gpuTimer, oldActive = timer.active, oldEvery = timer.sampleEvery;
  timer.sampleEvery = 1; timer.active = true;
  const start = timer.count;
  for (let k = 0; k < 180; k++) await frame();
  const values = [], compute = [], main = [];
  for (let k = start; k < timer.count; k++) {
    const i = k % timer.ms.length;
    if (timer.ms[i] > 0) { values.push(timer.ms[i]); compute.push(timer.msCompute[i]); main.push(timer.msMain[i]); }
  }
  timer.active = oldActive; timer.sampleEvery = oldEvery;
  const stats = (v) => { v.sort((a, b) => a - b); return v.length ? {
    samples: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length,
    median: v[Math.floor(v.length * 0.5)], p95: v[Math.min(v.length - 1, Math.floor(v.length * 0.95))],
  } : null; };
  const light = await g.atmosphere.atmoLight.read();
  const a = new Float32Array(light.buffer, light.byteOffset, light.byteLength / 4);
  return { spot: spot.id, gpu: w.gpuStats.adapterInfo, size: [g.engine.getRenderWidth(), g.engine.getRenderHeight()],
    renderScale: w.params.v.renderScale, dynamicRes: w.params.v.dynamicRes, gpuTimestampSupported: timer.supported,
    frameGpuMs: stats(values), computeGpuMs: stats(compute), mainGpuMs: stats(main), exposure: a[15],
    late: w.gpuStats.late, gpuErrors: w.gpuStats.gpuErrors,
    pos: [g.controller.pos.x, g.controller.pos.y, g.controller.pos.z] };
` });
const out = { date: new Date().toISOString(), label, note: 'Headless target GPU; locked-PC timing is indicative, not sustained gate acceptance.', ...result };
fs.mkdirSync('docs/phase-9/material-audit', { recursive: true });
fs.writeFileSync(path.join('docs/phase-9/material-audit', label + '.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out));
await bot('shot', { name: label, dir: 'material-audit', hud: false });
