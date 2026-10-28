import fs from 'node:fs';
const base='http://127.0.0.1:4178';
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result??r;}
const data=JSON.parse(fs.readFileSync('data/photo-spots.json')).spots;
const id=process.argv[2]||'scout';
const close=data.find(s=>s.id==='p9s1-close-noon'),mid=data.find(s=>s.id==='p9s1-star-mid'),wall=data.find(s=>s.id==='p9d0-canyon-floor');
const far={id:'far',biome:'dunes',hidePlayer:true,player:[2732.5,-111.658],camera:{mode:'free',pos:[2732.5,467.997,-111.658],yaw:-2.617994,pitch:-.01,fov:.55}};
const far4={id:'far4',biome:'dunes',hidePlayer:true,player:[3000,-2700],camera:{mode:'free',pos:[3000,1000,-2700],yaw:-.099669,pitch:.18,fov:.8}};
const views=id==='scout'?[['close',close],['mid',mid],['far',far],['far4',far4],['wall',wall]]:[['close',close],['mid',mid],['far',far]];
const reports=[];console.log('cold',await cmd({do:'eval',js:'return {gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};'}));
for(const [name,source]of views)for(const time of (id==='scout'?[12]:[12,17.8,23]))for(const restored of (id==='scout'?['restored']:['stilled','restored'])){
 const spot={...source,id:'p9d1b-'+name+'-'+time+'-'+restored,biome:'dunes',hidePlayer:true,time,weather:'clear',restoration:restored};
 const state=await cmd({do:'eval',js:`
 g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=true;g.game.killShaped();g.game.setPlayerVisible(false);
 g.frost.restoreCrystals([],g.clock.simTime);g.terrainState.restore([]);g.stone.mass.clear();
 const c=g.engine.getRenderingCanvas();c.style.width='1280px';c.style.height='720px';g.engine.resize();w.params.v.dynamicRes=0;w.params.v.renderScale=1;w.params.version++;
 // Opposite Frost/meadow states expose any accidental inheritance of their restoration.
 g.ws.restoration.frost='${restored==='restored'?'stilled':'restored'}';g.ws.restoration.meadow=g.ws.restoration.frost;
 g.game.applySpot(${JSON.stringify(spot)});g.restoration.snap=true;g.clock.pinHour=${time};
 const frame=()=>new Promise(r=>requestAnimationFrame(r));
 for(let i=0;i<600&&(!g.game.worldSettled()||!g.game.stateSettled());i++)await frame();for(let i=0;i<240;i++)await frame();g.restoration.snap=true;for(let i=0;i<60;i++)await frame();
 return {camera:g.camera.position.asArray(),size:[g.engine.getRenderWidth(),g.engine.getRenderHeight()],biome:g.ws.biome,restoration:{...g.restoration},grade:Array.from(g.post.post.grade),wind:g.wind.strength,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`});
 const shot=await cmd({do:'shot',name:spot.id,dir:'dune-grade-'+id,hud:false});const r={name:spot.id,file:shot.file,...state};reports.push(r);console.log(r);
 fs.mkdirSync('docs/phase-9/dune-grade',{recursive:true});fs.writeFileSync('docs/phase-9/dune-grade/'+id+'.json',JSON.stringify({date:new Date().toISOString(),reports,note:'All render dimensions are recorded. Far/far4 are candidate views only; distance/readability requires image and range review before acceptance. Opposite Frost restoration is deliberate to detect desert-state inheritance.'},null,2)+'\n');
}
if(reports.some(r=>r.gpuErrors||r.late.length))process.exitCode=1;
