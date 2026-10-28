import fs from 'node:fs';
const base='http://127.0.0.1:4175';
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=240000')).json();if(!r.ok)throw new Error(r.error);return r.result??r;}
await cmd({do:'eval',js:`g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=false;g.game.wraithHeld=false;g.controller.hold=false;g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.game.teleport(1900,900);for(let i=0;i<600&&!g.game.worldSettled();i++)await new Promise(r=>requestAnimationFrame(r));g.game.setPlayerVisible(false);g.combat.health=10000;g.combat.dying=0;w.filmCaster=g.shaped.spawn('whirler',1900,905);g.arm.setFree(true);return true;`});
const film=await cmd({do:'film',name:'whirler',dir:'dunecasterfilm',seconds:7,fps:60,size:[1280,720],warm:120,js:`
const s=g.shaped.slots[w.filmCaster];
if(i===0){s.state=3;s.t=0;s.cool=0;}
if(i===240)g.shaped.freeze(w.filmCaster,3);
if(i===330)g.shaped.damage(w.filmCaster,1000,true,0,0);
cam.at(1903,g.controller.pos.y+2.2,898,1900,g.controller.pos.y+1.4,905,0.82);
`});
const stats=await cmd({do:'eval',js:`g.combat.health=100;return {gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`});
fs.writeFileSync('docs/phase-9/dune-casters/film.json',JSON.stringify({date:new Date().toISOString(),film,...stats,note:'Scripted presentation: live volley/devil, then direct freeze and shatter at fixed times. This demonstrates motion and debris, not an input-driven combat win.'},null,2)+'\n');console.log(film,stats);
