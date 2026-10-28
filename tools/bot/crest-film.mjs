import fs from 'node:fs';
const base='http://127.0.0.1:4176';
async function cmd(body){
 const {id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();
 const reply=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=240000')).json();
 if(!reply.ok)throw new Error(reply.error);
 return reply.result??reply;
}
const read=name=>JSON.parse(fs.readFileSync('docs/phase-9/relaxation/'+name+'.json')).candidates;
const cases=[{name:'seif500',...read('crest-cpu-candidates')[0],span:32},
 {name:'transverse500',...read('crest-cpu-candidates-transverse')[0],span:32},
 {name:'transverse2000',...read('crest-cpu-candidates-transverse')[6],span:64}];
const reports=[];
for(const source of cases){
 const spot={...source,id:'crest-film-'+source.name,biome:'dunes',restoration:'restored',hidePlayer:true,time:17.8,weather:'clear',wet:0,puddle:0,rain:0};
 await cmd({do:'eval',js:`
  g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=false;g.clock.pinHour=17.8;
  g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;
  g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();
  g.terrainState.relaxation.enabled=false;g.terrainState.restore([]);g.stone.mass.clear();
  g.game.applySpot(${JSON.stringify(spot)});
  for(let i=0;i<600&&!g.game.worldSettled();i++)await new Promise(r=>requestAnimationFrame(r));
  return true;`});
 const p=source.camera.pos,t=source.target;
 const film=await cmd({do:'film',name:source.name,dir:'d2-crest-motion-interior',seconds:4,fps:60,size:[1280,720],warm:120,
  js:`const x=${p[0]}+(Math.max(0,i)/239-.5)*${source.span};cam.at(x,${p[1]},${p[2]},${t[0]},${t[1]},${t[2]},${source.camera.fov});`});
 const stats=await cmd({do:'eval',js:'return {gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};'});
 reports.push({name:source.name,source,film,...stats});
 fs.writeFileSync('docs/phase-9/relaxation/crest-motion-film-interior.json',JSON.stringify({date:new Date().toISOString(),reports,note:'Camera-only lateral sweeps of actual CPU-selected crests, 240 frames each at 1280x720 native. Presentation/morph review; no D3 traversal or 1440p performance acceptance. Warm frames hold the first pose. Original 2km forest-occluded view retained separately.'},null,2)+'\n');
 console.log(JSON.stringify(reports.at(-1)));
 if(stats.gpuErrors||stats.late.length||film.failed)throw new Error('Film capture failed GPU/frame gate');
}
