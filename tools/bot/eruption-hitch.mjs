#!/usr/bin/env node
// Long frames through the eruption's first half minute (the Fire stage first, as in play), and the GPU pipelines made from T19
// on, with who asked: a pipeline made at a first draw costs the GPU process up to half a second on that frame.
//   node tools/bot/eruption-hitch.mjs; tools/bot/play.sh stop
import { execSync } from 'node:child_process';
import { bot, js } from './client.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
execSync(`tools/bot/play.sh e1-chapel "^&gfx=high^&sysprof=1^&sysprofMs=30"`, { stdio: 'inherit' }); await sleep(8000);
await js(`g.params.v.timeOfDay=14;g.params.version++;g.params.v.dynamicRes=0;g.requestTeleport(1330,-2470);return 1`); await sleep(9000);
await js(`g.destruction.prepare('ash-chapel');return 1`); await sleep(8000);
// (Long frames, with what each was doing.)
await js(`w._long=[];let last=performance.now();const f=()=>{const n=performance.now();if(n-last>60)w._long.push({ms:Math.round(n-last),T:Math.round(g.eruption.T),scene:!!g.scenes.busy});last=n;requestAnimationFrame(f)};requestAnimationFrame(f);
  const dev=w.gpuStats.device;w._pipes=[];for(const nm of ['createRenderPipeline','createComputePipeline','createShaderModule']){const f=dev[nm].bind(dev);dev[nm]=(d)=>{const t=performance.now();const r=f(d);const ms=performance.now()-t;if(g.eruption.T>=19)w._pipes.push({nm,ms:Math.round(ms),T:Math.round(g.eruption.T),label:d.label||'',code:(d.code||d.vertex?.module?.label||'').slice(0,0),st:new Error().stack.split(String.fromCharCode(10)).slice(2,8).map(x=>x.trim().split('/').pop()).join(' < ')});return r}}
  const r0=g.loop.prof.resets;w._r0=JSON.parse(JSON.stringify(r0));return 1`);
await js(`g.chapter.graph.flags.add('ember:warned');g.chapter.graph.vars['ember:day']=3;return 1`); await sleep(25000);
await js(`g.chapter.graph.vars['ember:erupt-t']=20;g.chapter.graph.vars['ember:day']=4;return 1`);
await sleep(45000);
console.log(JSON.stringify(await js(`return w._long`)));
const r = await js(`const r=g.loop.prof.report();const d={};for(const k in g.loop.prof.resets){const v=g.loop.prof.resets[k]-(w._r0[k]||0);if(v)d[k]=v}return {worst:r.worstOnSlow,renderWorst:r.renderWorst,resets:d}`);
console.log(JSON.stringify(r).slice(0,300));
console.log(JSON.stringify(await js(`return w._pipes.filter(p=>p.T<=22).filter(p=>p.nm==='createRenderPipeline'||p.nm==='createComputePipeline').map(p=>[p.nm,p.label,p.st.split(' < ').slice(4).join(' < ')])`),null,0));
