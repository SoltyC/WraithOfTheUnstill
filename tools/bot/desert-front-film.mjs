import fs from 'node:fs';
import {checkFilmQaRuntime,verifyFrontFilm} from './desert-front-film-qa.mjs';
checkFilmQaRuntime();
const base='http://localhost:4181';
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=240000')).json();if(!r.ok)throw new Error(JSON.stringify(r));return r.result??r;}
await cmd({do:'eval',js:`
 if(w.gpuStats.gpuErrors)throw new Error(JSON.stringify(w.gpuStats.gpuErrorMessages));const frame=()=>new Promise(r=>requestAnimationFrame(r));g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=true;g.clock.pinHour=13;w.params.v.timeOfDay=13;w.params.v.renderScale=1;w.params.v.dynamicRes=0;w.params.version++;
 const c=g.engine.getRenderingCanvas();c.style.width='2560px';c.style.height='1440px';g.engine.resize();g.engine.setSize(2560,1440);g.ws.restoration.frost=g.ws.restoration.meadow=g.ws.restoration.dunes='restored';g.restoration.snap=true;g.ws.weatherOverride='clear';g.ws.wetForce=0;g.ws.puddleForce=0;g.game.teleport(2400,900);
 for(let i=0;i<600&&(!g.game.worldSettled()||!g.game.stateSettled());i++)await frame();for(let i=0;i<180;i++)await frame();g.game.killShaped();g.game.setPlayerVisible(true);g.arm.setFree(true);g.arm.freePos.x=2406;g.arm.freePos.y=g.controller.pos.y+2.5;g.arm.freePos.z=900;g.arm.yaw=-Math.PI/2;g.arm.pitch=.035;g.arm.fov=.9;
 g.restoration.snap=true;g.weather.snap=true;const f=g.sandstorm;f.enabled=true;f.target=1;f.active=false;f.strength=0;f.anchorX=2400;f.anchorZ=900;f.baseY=g.controller.pos.y;f.dirX=1;f.dirZ=0;f.dt=0;f.snap=true;f.update();f.age=67;f.update();g.post.heat.on=true;g.atmosphere.alwaysSnap=true;
 // Settle at the actual incoming pose, not the previous inside-storm exposure from a benchmark.
 for(let i=0;i<180;i++)await frame();g.restoration.snap=true;g.weather.snap=true;for(let i=0;i<90;i++)await frame();
 g.atmosphere.alwaysSnap=false;g.clock.frozen=false;return true;
`});
const film=await cmd({do:'film',name:'front-arrival',dir:'d6-front-prototype',seconds:12,fps:60,size:[2560,1440],warm:120,js:'cam.off();'});
const final=await cmd({do:'eval',js:`const result={age:g.sandstorm.age,localDensity:g.atmosphere.sandStorm,gpuErrors:w.gpuStats.gpuErrors,gpuMessages:w.gpuStats.gpuErrorMessages,late:w.gpuStats.late};g.sandstorm.enabled=false;g.sandstorm.target=0;g.sandstorm.snap=true;g.post.heat.on=true;g.atmosphere.alwaysSnap=false;return result;`});
fs.writeFileSync('docs/phase-9/storm-front/film.json',JSON.stringify({date:new Date().toISOString(),film,...final,note:'Native1440p/fixed60 12second arrival, incoming pose67 exposure settled while frozen first, then normal SH/exposure easing and2s warm gives age about69→81.12once-per-second actual canvas samples test a fixed640x640near-ground strip away from the Wraith (RGB>=253), including frame0. This is not whole-frame opaque clipping or real-time performance. No streak/wind/erasure/audio/shelter consumers yet; normal storm capability remains false.'},null,2)+'\n');console.log(film,final);
verifyFrontFilm();
if(final.gpuErrors||final.late.length||film.frames!==720||film.failed)throw new Error('Arrival film verification failed');
