import fs from 'node:fs';
const base='http://localhost:4180';
const source=fs.readFileSync('src/audio/sandSurfSound.js','utf8').replace('export function','function');
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
const results=[];
for(const [name,speed,wet,frozen,active,stop] of [['idle',0,0,0,false,false],['slow',8,0,0,true,false],['fast',32,0,0,true,false],['wet',32,1,0,true,false],['frozen',32,0,1,true,false],['stop',32,0,0,true,true]]){
 const out=await ev(`
  const ctx=new OfflineAudioContext(1,96000,48000),noise=ctx.createBuffer(1,120000,48000),d=noise.getChannelData(0);
  let seed=7,b=0;for(let i=0;i<d.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const w=seed/4294967296*2-1;b=.97*b+.03*w;d[i]=w*.6+b*2.2;}
  const build=new Function('ctx','noise','output',${JSON.stringify(source+';return createSandSurfSound(ctx,noise,output);')});
  const s=build(ctx,noise,ctx.destination);s.active=${active};s.speed=${speed};s.grip=1;s.wet=${wet};s.frozen=${frozen};s.update();
  if(${stop})ctx.suspend(.8).then(()=>{s.active=false;s.update();return ctx.resume();});
  const buffer=await ctx.startRendering(),a=buffer.getChannelData(0);
  let energy=0,high=0,peak=0,tail=0;for(let i=24000;i<a.length;i++){energy+=a[i]*a[i];high+=(a[i]-a[i-1])**2;peak=Math.max(peak,Math.abs(a[i]));if(i>=84000)tail+=a[i]*a[i];}
  const bytes=new Uint8Array(44+a.length*2),v=new DataView(bytes.buffer),str=(p,x)=>{for(let i=0;i<x.length;i++)bytes[p+i]=x.charCodeAt(i);};
  str(0,'RIFF');v.setUint32(4,bytes.length-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,48000,true);v.setUint32(28,96000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,a.length*2,true);
  for(let i=0;i<a.length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,a[i]))*32767),true);
  let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return {rms:Math.sqrt(energy/(a.length-24000)),highRms:Math.sqrt(high/(a.length-24000)),peak,tailRms:Math.sqrt(tail/12000),targets:{hiss:s.hissLevel,rush:s.rushLevel},wav:btoa(binary)};
 `);
 fs.mkdirSync('screenshots/d3-surf-sound',{recursive:true});fs.writeFileSync('screenshots/d3-surf-sound/'+name+'.wav',Buffer.from(out.wav,'base64'));delete out.wav;results.push({name,...out});console.log(results.at(-1));
}
const find=n=>results.find(r=>r.name===n),errors=await ev('return {gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};');
fs.writeFileSync('docs/phase-9/sand-surf/sound-offline.json',JSON.stringify({date:new Date().toISOString(),results,...errors,note:'Actual createSandSurfSound source evaluated in isolated browser OfflineAudioContexts, deterministic shared noise,48kHz2s mono. RMS uses0.5–2s; tail uses1.75–2s. Stop at0.8s. No human listening/balance or real-time audio/performance signoff; game mixer context untouched.'},null,2)+'\n');
if(find('fast').rms<find('slow').rms*2||find('wet').rms>find('fast').rms*.6||find('wet').highRms>find('fast').highRms*.3||find('idle').rms!==0||find('frozen').rms!==0||find('stop').tailRms>find('fast').rms*.002||results.some(r=>r.peak>.5)||errors.gpuErrors||errors.late.length)process.exitCode=1;
