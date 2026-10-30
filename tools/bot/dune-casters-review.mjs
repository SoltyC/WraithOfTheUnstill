import fs from 'node:fs';
const base=process.env.WRAITH_URL||'http://127.0.0.1:4175';
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result??r;}
const spots=JSON.parse(fs.readFileSync('data/photo-spots.json')).spots.filter(s=>s.id.startsWith('p9d9b-'));
const reports=[];
console.log('cold GPU',await cmd({do:'eval',js:'return {errors:w.gpuStats.gpuErrors,messages:w.gpuStats.gpuErrorMessages};'}));
for(const spot of spots){
 await cmd({do:'eval',js:`g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=true;g.game.killShaped();g.terrainState.restore([]);g.stone.mass.clear();for(const s of g.shaped.slots)s.state=0;g.navSync();g.ws.restoration.frost='restored';g.ws.restoration.meadow='restored';g.ws.restoration.dunes='restored';g.restoration.snap=true;const c=g.engine.getRenderingCanvas();c.style.width='1280px';c.style.height='720px';g.engine.resize();w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.version++;return true;`});
 await cmd({do:'spot',id:spot.id});
 const shot=await cmd({do:'shot',dir:'dune-casters-review',name:spot.id,hud:false});
 const state=await cmd({do:'eval',js:`return {size:[g.engine.getRenderWidth(),g.engine.getRenderHeight()],gpuErrors:w.gpuStats.gpuErrors,gpuErrorMessages:w.gpuStats.gpuErrorMessages,late:w.gpuStats.late,blind:g.post.post.sandBlind,bodies:g.shaped.slots.filter(s=>s.state!==0).map(s=>({arch:s.arch,state:s.state,spin:s.spin,hp:s.hp}))};`});
 reports.push({id:spot.id,file:shot.file,...state});console.log(reports.at(-1));
}
fs.mkdirSync('docs/phase-9/dune-casters',{recursive:true});fs.writeFileSync('docs/phase-9/dune-casters/captures.json',JSON.stringify(reports,null,2)+'\n');
if(reports.some(r=>r.gpuErrors||r.late.length))process.exitCode=1;
