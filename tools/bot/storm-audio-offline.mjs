// Actual SFX graph rendered offline through the existing bot. Never opens speakers or changes the live renderer.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createWind} from '../../src/world/wind.js';
import {createSandstormFront} from '../../src/world/sandstormFront.js';
import {js} from './client.mjs';
const root=path.resolve(import.meta.dirname,'../..'),out=path.resolve(root,process.argv[2]||'docs/phase-9/storm-front/audio-offline');
fs.mkdirSync(out,{recursive:true});
const current=fs.readFileSync(path.join(root,'src/audio/sfx.js'),'utf8');
const baseline=execFileSync('git',['show','HEAD:src/audio/sfx.js'],{cwd:root,encoding:'utf8'});
const storm=fs.readFileSync(path.join(root,'src/audio/stormWind.js'),'utf8');
const rate=48000,seconds=4,frames=seconds*60;
function timeline(active){
 const f=createSandstormFront();f.enabled=active;f.target=1;f.snap=true;f.anchorX=2400;f.anchorZ=900;f.update();f.age=95;f.update();
 const w=createWind(f);w.stormWeight=1;w.strength=1;w.dirX=1;w.dirZ=0;w.gustiness=.545;
 return Array.from({length:frames},(_,i)=>{w.time=i/60;w.update();w.sx=2400;w.sz=900;w.sample();return {time:i/60,speed:w.speed,dx:w.outX,dz:w.outZ,density:w.density,wind:Math.min(1,w.speed/.66/1.1)};});
}
const normal=timeline(false),gusts=timeline(true),reports=[],pcms=new Map();
const cases=['head-off','current-off','storm-open','storm-shelter','storm-ramp','storm-muted','storm-volume-zero'];
for(const name of cases){
 const input={name,source:name==='head-off'?baseline:current,storm,series:name.endsWith('-off')?normal:gusts,rate,seconds};
 const result=await js(`return await (async(input)=>{
  const ctx=new OfflineAudioContext(2,input.rate*input.seconds,input.rate);
  let now=0,created=0,seed=0x13579bdf;
  const math=Object.create(Math);math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const proxy=new Proxy(ctx,{get(target,key){if(key==='currentTime')return now;if(key==='state')return 'running';if(key==='resume')return ()=>Promise.resolve();
   const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;return (...args)=>{if(String(key).startsWith('create')&&key!=='createBuffer')created++;return value.apply(target,args);};}});
  const win={AudioContext:function(){return proxy;}};
  const clean=s=>s.replace(/^import .*;\\s*$/mg,'').replace(/\\bexport\\s+/g,'');
  const createStormWind=new Function(clean(input.storm)+';return createStormWind;')();
  const createSfx=new Function('window','Math','createStormWind',clean(input.source)+';return createSfx;')(win,math,createStormWind);
  const s=createSfx();s.unlock();if(input.name==='storm-volume-zero')s.setVolume(0);const initNodes=created;
  let minSpeed=Infinity,maxSpeed=0,minDensity=Infinity,maxDensity=0;
  for(const p of input.series){
   now=p.time;s.time=p.time;s.wind=p.wind;s.stormDensity=p.density;s.stormSpeed=p.speed;s.stormDX=p.dx;s.stormDZ=p.dz;
   s.stormExposure=input.name==='storm-shelter'?0:1;
   if(input.name==='storm-ramp')s.stormDensity*=Math.min(1,p.time/2);
   if(input.name==='storm-muted'&&p.time>=1)s.enabled=false;

   s.update();minSpeed=Math.min(minSpeed,p.speed);maxSpeed=Math.max(maxSpeed,p.speed);minDensity=Math.min(minDensity,s.stormDensity);maxDensity=Math.max(maxDensity,s.stormDensity);
  }
  const audio=await ctx.startRendering(),pcm=new Float32Array(audio.length*2);
  let sum=0,peak=0,nonFinite=0,tailSum=0,tailN=0;const perSecond=[];
  for(let second=0;second<input.seconds;second++){let ss=0,nn=0;
   for(let i=second*input.rate;i<(second+1)*input.rate;i++)for(let c=0;c<2;c++){
    const v=audio.getChannelData(c)[i];pcm[i*2+c]=v;if(!Number.isFinite(v))nonFinite++;sum+=v*v;ss+=v*v;nn++;peak=Math.max(peak,Math.abs(v));if(i>=input.rate*2){tailSum+=v*v;tailN++;}
   }perSecond.push(Math.sqrt(ss/nn));
  }
  const bytes=new Uint8Array(pcm.buffer);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {pcm:btoa(binary),metrics:{rms:Math.sqrt(sum/pcm.length),peak,nonFinite,tailRms:Math.sqrt(tailSum/tailN),perSecond,initNodes,updateNodes:created-initNodes,minSpeed,maxSpeed,minDensity,maxDensity}};
 })(${JSON.stringify(input)})`);
 const pcm=Buffer.from(result.pcm,'base64');pcms.set(name,pcm);
 // IEEE float stereo WAV preserves the exact measured PCM.
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(3,20);header.writeUInt16LE(2,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*8,28);header.writeUInt16LE(8,32);header.writeUInt16LE(32,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
 fs.writeFileSync(path.join(out,name+'.wav'),Buffer.concat([header,pcm]));reports.push({name,...result.metrics});console.log(name,JSON.stringify(result.metrics));
}
const offBitIdentical=pcms.get('head-off').equals(pcms.get('current-off'));
const checks={offBitIdentical,finite:reports.every(r=>r.nonFinite===0),noUpdateNodes:reports.every(r=>r.updateNodes===0),shelterQuieter:reports.find(r=>r.name==='storm-shelter').rms<reports.find(r=>r.name==='storm-open').rms,mutedTail:reports.find(r=>r.name==='storm-muted').tailRms<1e-8,volumeZeroTail:reports.find(r=>r.name==='storm-volume-zero').tailRms<1e-8};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({date:new Date().toISOString(),rate,seconds,seed:'0x13579bdf',checks,reports,scope:'Actual createSfx source with a local window/Math/context facade; actual shared CPU wind sampled at60Hz. OfflineAudioContext only. No live audio context or renderer mutation. Compares float PCM before WAV encoding. Shelter uses stormExposure only; ramp changes stormDensity; enabled mute begins at1s and zero volume is set before the timeline. Not a listening review or shelter geometry validation.'},null,2)+'\n');
console.log(JSON.stringify(checks));if(Object.values(checks).some(v=>!v))process.exitCode=1;

