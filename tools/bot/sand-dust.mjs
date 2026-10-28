import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const base=process.env.WRAITH_URL||'http://127.0.0.1:4173';
async function cmd(body){const {id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result??r;}
const ev=js=>cmd({do:'eval',js});
const report={date:new Date().toISOString()};
report.setup=await ev(`
g.game.applySpot({id:'dust-review',player:[1900,900],time:16.5,weather:'clear',hidePlayer:true,camera:{mode:'follow',yaw:0,pitch:0.25,dist:5},wet:0,puddle:0,rain:0});
g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();
g.ws.restoration.frost='restored';g.ws.restoration.meadow='restored';g.ws.restoration.dunes='restored';g.restoration.snap=true;
w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.v.windStrength=0.9;w.params.version++;
g.post.post.grain=0;g.post.post.jitter=false;g.post.taa.on=false;
g.atmosphere.alwaysSnap=true;g.post.post.onParams(P=>{P[84]=0;});g.atmosphere.meterBuf.update(new Float32Array(4));
g.loop.add({name:'dustCompareFixedNoise',update(){g.clock.frame=0;}});
g.clock.frozen=false;for(let i=0;i<600&&!g.game.worldSettled();i++)await new Promise(r=>requestAnimationFrame(r));
g.terrainState.restore([]);for(let i=0;i<90;i++)await new Promise(r=>requestAnimationFrame(r));g.clock.frozen=true;
w.dustCompare={canvas:new OffscreenCanvas(g.engine.getRenderWidth(),g.engine.getRenderHeight())};
return {width:g.engine.getRenderWidth(),height:g.engine.getRenderHeight(),gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`);
async function pair(name,setup){
  await ev(setup+';g.sandDust.strength=0;for(let i=0;i<60;i++)await new Promise(r=>requestAnimationFrame(r));const c=w.dustCompare.canvas,ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(g.engine.getRenderingCanvas(),0,0);w.dustCompare.off=ctx.getImageData(0,0,c.width,c.height).data;return true;');
  const result=await ev(`g.sandDust.strength=1;for(let i=0;i<60;i++)await new Promise(r=>requestAnimationFrame(r));const c=w.dustCompare.canvas,ctx=c.getContext('2d');ctx.drawImage(g.engine.getRenderingCanvas(),0,0);const on=ctx.getImageData(0,0,c.width,c.height).data,off=w.dustCompare.off;let sum=0,max=0,changed=0;for(let i=0;i<on.length;i+=4){const d=Math.abs(on[i]-off[i])+Math.abs(on[i+1]-off[i+1])+Math.abs(on[i+2]-off[i+2]);sum+=d;max=Math.max(max,d);if(d>6)changed++;}return {meanRgbDifference:sum/(on.length/4*3),maxRgbSum:max,pixelsAboveSix:changed,emitted:g.sandDust.bursts.emitted,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`);
  await cmd({do:'shot',name:'sand-dust-'+name+'-review'});console.log(name,result);report[name]=result;
}
await pair('wind',`g.ws.restoration.dunes='restored';g.sandDust.bursts.reset()`);
await pair('stilled',`g.ws.restoration.dunes='stilled';g.sandDust.bursts.reset()`);
const stamp=`const ts=g.terrainState;ts.bx=1900;ts.bz=902;ts.bdx=1;ts.bdz=0;ts.bl=1.2;ts.bw=0.45;ts.bd=0.25;ts.bc=0.3;ts.bk=1;ts.stamp();for(let i=0;i<30;i++)await new Promise(r=>requestAnimationFrame(r));g.clock.simTime+=0.35;`;
await pair('puff',stamp);
await pair('wet',`g.ws.wetForce=1;g.ws.puddleForce=0.5;`);
await ev(`g.ws.wetForce=0;g.ws.puddleForce=0;const ts=g.terrainState;ts.bx=1900;ts.bz=902;ts.bdx=1;ts.bdz=0;ts.bl=0;ts.bw=4;ts.bd=0;ts.bc=1;ts.bk=3;ts.stamp();for(let i=0;i<30;i++)await new Promise(r=>requestAnimationFrame(r));return true;`);
await pair('frozen',``);
report.end=await ev(`const n=4092,i=Math.floor(1900*48),j=Math.floor(902*48),k=(((j%n)+n)%n)*n+(((i%n)+n)%n);const raw=await g.terrainState.fine[1].read(k*4,4);const word=new Uint32Array(raw.buffer,raw.byteOffset,1)[0];return {gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,pending:g.terrainState.pendingBrushes,frozenByte:(word>>>16)&255};`);
report.note='Image controls retain background variation and do not sign off material suppression; the separate live-buffer shader oracle enforces exact wet/frozen/non-sand zeros. Fixed-time comparisons disable grain/TAA/jitter, fix shadow-noise index and snap analytic exposure with the meter disabled. Background variation remains; image-only wet/frozen differences are not acceptance criteria. This verifies visible contribution and suppression, not human feel or sustained frame performance.';
fs.mkdirSync('docs/phase-9/dust',{recursive:true});fs.writeFileSync('docs/phase-9/dust/target-check.json',JSON.stringify(report,null,2)+'\n');
if(report.end.gpuErrors||report.end.late.length||report.wind.pixelsAboveSix<5000||report.puff.pixelsAboveSix<2000||report.puff.meanRgbDifference<2*report.stilled.meanRgbDifference)process.exitCode=1;
const material=spawnSync(process.execPath,['tools/bot/sand-dust-material.mjs'],{stdio:'inherit'});
if(material.status!==0)process.exitCode=1;
