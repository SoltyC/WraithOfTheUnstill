import fs from 'node:fs';
const base='http://localhost:4181';
const js=`
 const frame=()=>new Promise(r=>requestAnimationFrame(r)),f=g.sandstorm,s=g.sandStreaks;
 g.clock.frozen=true;f.enabled=true;f.target=1;f.active=false;f.strength=0;f.snap=true;f.update();f.age=95;f.update();s.on=true;
 for(let i=0;i<90;i++)await frame();const initial=s.travel.asArray(),age=f.age;
 for(let i=0;i<90;i++)await frame();const paused=s.travel.asArray();g.clock.frozen=false;
 for(let i=0;i<120;i++)await frame();g.clock.frozen=true;const moving=s.travel.asArray(),movedAge=f.age;
 for(let i=0;i<90;i++)await frame();const held=s.travel.asArray();
 f.enabled=false;f.target=0;f.snap=true;f.update();
 return {initial,paused,moving,held,age,movedAge,pausedExact:initial.every((v,i)=>v===paused[i]),heldExact:moving.every((v,i)=>v===held[i]),motion:Math.hypot(moving[0]-paused[0],moving[1]-paused[1]),fall:moving[2]-paused[2],gpuErrors:w.gpuStats.gpuErrors,gpuMessages:w.gpuStats.gpuErrorMessages,late:w.gpuStats.late};`;
const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(JSON.stringify(r));const report=r.result;fs.writeFileSync('docs/phase-9/storm-front/streak-motion.json',JSON.stringify({date:new Date().toISOString(),...report,note:'Live owner-integrated travel pause/release/pause smoke check. Zero dt holds all travel components exactly; real simulation advances wind travel and fall continuously. No human motion/readability or allocation acceptance.'},null,2)+'\n');console.log(report);if(!report.pausedExact||!report.heldExact||report.motion<=0||report.fall<=0||report.movedAge<=report.age||report.gpuErrors||report.late.length)process.exitCode=1;
