import fs from 'node:fs';
const base='http://localhost:4180',label=process.argv[2]||'first',faces=JSON.parse(fs.readFileSync('docs/phase-9/sand-surf/slipfaces.json')).faces;
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Use a simple label');
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=240000')).json();if(!r.ok)throw new Error(r.error);return r.result??r;}
const reports=[];
for(const face of faces){
 let setup,film,stats;
 try{
  setup=await cmd({do:'eval',js:`
   const frame=()=>new Promise(r=>requestAnimationFrame(r));g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;
   g.clock.frozen=false;g.clock.pinHour=16.2;w.params.v.refillRate=0;w.params.version++;
   g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;g.ws.weatherOverride='clear';g.ws.wetForce=0;g.weather.snap=true;
   g.arm.setFree(false);g.game.wraithHeld=false;g.controller.hold=false;g.game.setPlayerVisible(true);g.game.teleport(${face.x},${face.z});
   for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
   g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.combat.health=10000;g.combat.dying=0;
   const ts=g.terrainState;ts.relaxation.enabled=false;ts.restore([]);g.stone.mass.clear();for(let i=0;i<120;i++)await frame();
   const c=g.controller,s=c.surf;c.glide.active=false;c.yaw=${face.heading};c.vel.x=0;c.vel.y=0;c.vel.z=0;s.active=false;s.exiting=false;s.speed=0;s.turnRate=0;s.lean=0;s.blend=0;s.sandUnlocked=true;
   g.arm.yaw=${face.heading};g.arm.pitch=.22;g.arm.zoomTarget=8;g.arm.zoom=8;g.arm.armLen=8;g.arm.snap(c.pos);
   ts.relaxation.enabled=true;w.faceFilm={active:0,grounded:0,peak:0,materials:new Uint32Array(16),samples:[]};
   g.ground.qx=c.pos.x;g.ground.qz=c.pos.z;g.ground.sampleNormal();
   if(c.hold)throw new Error('Teleport still held');return {start:[c.pos.x,c.pos.y,c.pos.z],normal:[g.ground.nx,g.ground.ny,g.ground.nz],heading:c.yaw};
  `});
  film=await cmd({do:'film',name:face.name,dir:'d3-slipfaces-'+label,seconds:12,fps:60,size:[1280,720],warm:120,js:`
   cam.off();
   if(i===0){inject('Traverse',true);inject('MoveForward',true);}
   if(i===180)inject('MoveRight',true);if(i===240)inject('MoveRight',false);
   if(i===420)inject('MoveLeft',true);if(i===480)inject('MoveLeft',false);
   const c=g.controller,s=c.surf,I=w.faceFilm,p=c.pos;
   if(i>=0){if(s.active)I.active++;if(c.grounded)I.grounded++;I.peak=Math.max(I.peak,s.speed);I.materials[s.material]++;
    if(i%60===0)I.samples.push({i,pos:[p.x,p.y,p.z],speed:s.speed,lean:s.lean,grounded:c.grounded,material:s.material});}
  `});
  stats=await cmd({do:'eval',js:'return {...w.faceFilm,materials:Array.from(w.faceFilm.materials),gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,collisionErrors:g.terrainState.collision.errors};'});
 }finally{await cmd({do:'eval',js:"w.inject('Traverse',false);w.inject('MoveForward',false);w.inject('MoveRight',false);w.inject('MoveLeft',false);g.terrainState.relaxation.enabled=false;g.controller.surf.sandUnlocked=false;g.combat.health=100;g.ws.wetForce=-1;return true;"});}
 reports.push({face,setup,film,...stats});console.log(reports.at(-1));
 fs.writeFileSync('docs/phase-9/sand-surf/slipface-films-'+label+'.json',JSON.stringify({date:new Date().toISOString(),reports,note:'Three distinct CPU-selected slip-face starts, normal Traverse/forward plus right180–240/left420–480 inputs from rest, actual runtime spring-arm camera.12s/fixed60Hz/native720p each. Temporary sand grant/D2 restored off. Silent capture; sound is reviewed separately. Capture success is not human feel, sustained performance, whole D3 or terrain-sheet acceptance.'},null,2)+'\n');
}
if(reports.some(r=>r.film.frames!==720||r.film.failed||r.gpuErrors||r.late.length||r.collisionErrors||r.active<650))process.exitCode=1;
