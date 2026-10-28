import fs from 'node:fs';
const base='http://localhost:4180',label=process.argv[2]||'wake';
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Use a simple label');
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const reply=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=240000')).json();if(!reply.ok)throw new Error(reply.error);return reply.result??reply;}
await cmd({do:'eval',js:` const frame=()=>new Promise(r=>requestAnimationFrame(r));
 g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=false;g.clock.pinHour=16.2;
 const canvas=g.engine.getRenderingCanvas();canvas.style.width='2560px';canvas.style.height='1440px';g.engine.resize();
 w.params.v.dynamicRes=0;w.params.v.renderScale=.7;w.params.v.refillRate=0;w.params.version++;
 g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;g.ws.weatherOverride='clear';
 g.arm.setFree(false);g.game.wraithHeld=false;g.controller.hold=false;g.game.setPlayerVisible(true);
 g.game.teleport(1900,900);for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
 g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.combat.health=10000;g.combat.dying=0;
 const ts=g.terrainState,r=ts.relaxation;r.enabled=false;ts.restore([]);g.stone.mass.clear();
 for(let i=0;i<120;i++)await frame();
 const sf=g.controller.surf;
 sf.active=false;sf.exiting=false;sf.speed=0;sf.turnRate=0;sf.lean=0;sf.blend=0;
 g.controller.glide.active=false;g.controller.yaw=0;
 g.controller.vel.x=0;g.controller.vel.y=0;g.controller.vel.z=0;
 sf.sandUnlocked=true;g.arm.yaw=0;g.arm.pitch=.25;

 r.enabled=true;w.sandFilm={active:0,grounded:0,peak:0,samples:[]};return true;`});
let film,stats;
try {
 film=await cmd({do:'film',name:'sand-surf',dir:'d3-surf-'+label,seconds:8,fps:60,size:[1280,720],warm:120,js:`
  if(i===0){inject('Traverse',true);inject('MoveForward',true);}
  if(i===180)inject('MoveRight',true);if(i===240)inject('MoveRight',false);
  const c=g.controller,s=c.surf,p=c.pos,I=w.sandFilm;
  if(i>=0){if(s.active)I.active++;if(c.grounded)I.grounded++;I.peak=Math.max(I.peak,s.speed);if(i%60===0)I.samples.push({i,speed:s.speed,pos:[p.x,p.y,p.z]});}
  const hx=Math.sin(c.yaw),hz=Math.cos(c.yaw);
  cam.at(p.x-hx*8,p.y+3.2,p.z-hz*8,p.x+hx*8,p.y+1,p.z+hz*8,.9);
 `});
 stats=await cmd({do:'eval',js:'return {...w.sandFilm,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,collisionErrors:g.terrainState.collision.errors};'});
} finally {
 await cmd({do:'eval',js:"w.inject('Traverse',false);w.inject('MoveForward',false);w.inject('MoveRight',false);g.terrainState.relaxation.enabled=false;g.controller.surf.sandUnlocked=false;g.combat.health=100;return true;"});
}
fs.writeFileSync('docs/phase-9/sand-surf/film-'+label+'.json',JSON.stringify({date:new Date().toISOString(),film,...stats,note:'Input-driven eight-second carve from rest, one right input. Fixed 60Hz native720p diagnostic film; not a real-time performance measurement or three-slip-face/human feel acceptance. Temporary sand grant and D2 solver restored off afterward.'},null,2)+'\n');console.log(film,stats);
if(stats.gpuErrors||stats.late.length||stats.collisionErrors)process.exitCode=1;
