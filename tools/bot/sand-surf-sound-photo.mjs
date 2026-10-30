import fs from 'node:fs';
const label=process.argv[2]||'trial',base='http://localhost:4180';
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Use a simple label');
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
const result=await ev(`
 const frame=()=>new Promise(r=>requestAnimationFrame(r));g.clock.frozen=false;
 g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;g.ws.weatherOverride='clear';g.ws.wetForce=0;g.weather.snap=true;
 g.game.wraithHeld=false;g.game.teleport(1900,900);for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();for(let i=0;i<120;i++)await frame();
 g.game.killShaped();g.combat.health=10000;g.sfx.unlock();await g.sfx.context().resume();g.controller.surf.sandUnlocked=true;
 w.inject('Traverse',true);w.inject('MoveForward',true);
 try{
  for(let i=0;i<90;i++)await frame();const sound=g.sfx.sandSound;
  if(!sound||!g.controller.surf.active||sound.hissLevel+sound.rushLevel<=0)throw new Error('No actual audible surf contact');
  const before={active:g.sfx.sandActive,hiss:sound.hissLevel,rush:sound.rushLevel};
  g.clock.frozen=true;for(let i=0;i<4;i++)await frame();
  return {before,after:{active:g.sfx.sandActive,hiss:sound.hissLevel,rush:sound.rushLevel},gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};
 }finally{g.clock.frozen=false;g.combat.health=100;g.ws.wetForce=-1;g.controller.surf.sandUnlocked=false;w.inject('Traverse',false);w.inject('MoveForward',false);}
`);
fs.writeFileSync('docs/phase-9/sand-surf/sound-photo-'+label+'.json',JSON.stringify({date:new Date().toISOString(),...result,note:'Actual normal inputs create active sand contact, then freeze photo clock for4rAF frames. Targets should go to0 via regular mixer update; this is not a recorded output-tail measurement.'},null,2)+'\n');console.log(result);
if(result.after.active||result.after.hiss+result.after.rush>0||result.gpuErrors||result.late.length)process.exitCode=1;
