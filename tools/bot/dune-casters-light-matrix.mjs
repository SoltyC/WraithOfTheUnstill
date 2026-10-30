import fs from 'node:fs';
const base='http://localhost:4175',label=process.argv[2]||'baseline';
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Use a simple capture label');
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result??r;}
const spots=JSON.parse(fs.readFileSync('data/photo-spots.json')).spots.filter(s=>s.id.startsWith('p9d9b-')),reports=[];
for(const hour of [9,17.8,23])for(const source of spots){
 const spot={...source,time:hour,weather:'clear',restoration:'restored'};
 await cmd({do:'eval',js:`
 g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=true;
 g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.terrainState.restore([]);g.stone.mass.clear();
 g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;
 const c=g.engine.getRenderingCanvas();c.style.width='2560px';c.style.height='1440px';g.engine.resize();
 w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.version++;
 g.game.applySpot(${JSON.stringify(spot)});g.clock.pinHour=${hour};
 const frame=()=>new Promise(r=>requestAnimationFrame(r));for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();for(let i=0;i<180;i++)await frame();
 w.botShotWidth=1280;return true;`});
 const id=source.id+'-h'+String(hour).replace('.','-');
 const shot=await cmd({do:'shot',dir:'dune-casters-light-matrix-'+label,name:id,hud:false});
 const state=await cmd({do:'eval',js:`return {output:[g.engine.getRenderWidth(),g.engine.getRenderHeight()],internal:[g.post.post.width,g.post.post.height],renderScale:g.post.post.renderScale,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,bodies:g.shaped.slots.filter(s=>s.state!==0).map(s=>({arch:s.arch,state:s.state,hp:s.hp,glow:s.glow,coreKind:s.rig.kind[0]}))};`});
 reports.push({id,hour,source:source.id,file:shot.file,...state});console.log(id,state.gpuErrors,state.late.length);
 fs.writeFileSync('docs/phase-9/dune-casters/latest-grade-light-matrix-'+label+'.json',JSON.stringify({date:new Date().toISOString(),reports,note:'Actual2560x1440 native,1280px review images. Frozen diagnostic poses, clear weather at9/17.8/23h after integrated D1b grade. Tests static warm/warning/frozen material visibility; no storm or D3 surf-speed acceptance. Human aesthetics remain unassessed.'},null,2)+'\n');
}
if(reports.some(r=>r.gpuErrors||r.late.length))process.exitCode=1;
