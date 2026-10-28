import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const base='http://localhost:4176';
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
const out='screenshots/phase-01/parity-check-d0.json';
if(fs.existsSync(out))fs.copyFileSync(out,'/tmp/wraith-pre-crest-parity.json');
for(const [name,x,z] of [['transverse',2950,500],['seif',3250,-950]]){
 await ev(`g.terrainState.relaxation.enabled=false;g.game.teleport(${x},${z});for(let i=0;i<600&&!g.game.worldSettled();i++)await new Promise(r=>requestAnimationFrame(r));return true;`);
 const r=spawnSync(process.execPath,['tools/capture/parity-bot.mjs','--points=4096','--radius=300'],{env:{...process.env,WRAITH_URL:base},stdio:'inherit'});
 fs.copyFileSync(out,'docs/phase-9/relaxation/analytic-height-parity-'+name+'.json');
 if(r.status!==0)process.exit(r.status||1);
}
console.log(await ev('return {gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,note:"Diagnostic parity pipelines are intentionally created after warmup; restart before cold late-pipeline gates."};'));
