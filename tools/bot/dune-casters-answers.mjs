import fs from 'node:fs';
const base='http://127.0.0.1:4175';
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(r.error);return r.result;}
const result=await ev(`
const frame=()=>new Promise(r=>requestAnimationFrame(r));const frames=async n=>{for(let i=0;i<n;i++)await frame();};
g.clock.frozen=false;g.game.wraithHeld=false;g.controller.hold=false;g.arm.setFree(false);g.game.setPlayerVisible(true);g.game.teleport(1900,900);
for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.combat.health=100;g.combat.focus=100;g.combat.dying=0;g.flow.reset(true);
const i=g.shaped.spawn('glasssworn',1900,906);await frames(120);g.shaped.pin(i,5);g.combat.lock=i;g.controller.hold=true;g.elements.unlock('stone');g.elements.select('stone');
let hitCount=0;const oldHit=g.stone.shardHit;g.stone.shardHit=function(k){hitCount++;return oldHit.call(this,k);};
const hp0=g.shaped.slots[i].hp;const hits=[];
async function shard(){const before=hitCount;w.inject('Bend',true);await frames(5);w.inject('Bend',false);for(let k=0;k<120&&hitCount===before;k++)await frame();hits.push({hits:hitCount,hp:g.shaped.slots[i].hp,frozen:g.shaped.isFrozen(i)});}
let glass;
try{
 await shard();const warmHp=g.shaped.slots[i].hp,warmHit=hitCount;
 g.elements.select('frost');w.inject('Heavy',true);await frames(2);w.inject('Heavy',false);await frames(4);const froze=g.shaped.isFrozen(i);
 g.elements.select('stone');for(let k=0;k<3&&g.shaped.isLive(i);k++)await shard();
 glass={hp0,warmHp,warmHit,froze,hits,killed:!g.shaped.isLive(i),health:g.combat.health,focus:g.combat.focus};
}finally{g.stone.shardHit=oldHit;w.inject('Bend',false);w.inject('Heavy',false);g.controller.hold=false;}
g.game.killShaped();for(const s of g.shaped.slots)s.state=0;g.navSync();g.combat.focus=100;g.combat.dying=0;g.combat.health=100;
const j=g.shaped.spawn('whirler',1900,906);await frames(140);g.combat.lock=j;g.elements.unlock('gale');g.elements.select('gale');
const s=g.shaped.slots[j],spin0=s.spin;w.inject('Bend',true);await frames(180);const vortex={spin0,spin:s.spin,reverse:s.reverse,pinned:g.shaped.isPinned(j),alive:g.shaped.isLive(j),strength:g.gale.vortexStrength};w.inject('Bend',false);
return {glass,vortex,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late,note:'Live input casts with ordinary lock-on. Warm Glass-sworn is pinned only to make the immunity contact oracle repeatable; shardHit counts prove body contact. This is a material-answer oracle, not an unassisted fight.'};
`);
fs.writeFileSync('docs/phase-9/dune-casters/live-answers.json',JSON.stringify({date:new Date().toISOString(),...result},null,2)+'\n');console.log(JSON.stringify(result,null,2));
if(result.gpuErrors||result.late.length||result.glass.warmHit<1||result.glass.warmHp!==result.glass.hp0||!result.glass.froze||!result.glass.killed||!result.vortex.pinned||result.vortex.spin>=result.vortex.spin0)process.exitCode=1;
