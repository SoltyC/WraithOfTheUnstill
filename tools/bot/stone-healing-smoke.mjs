import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const base=process.env.WRAITH_URL||'http://localhost:4182';
const js=`
 if(!g.stone.mass.k.healAge)throw new Error('Wrong Stone build');
 g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;g.clock.frozen=true;
 w.params.v.renderScale=.7;w.params.v.dynamicRes=0;w.params.version++;
 const canvas=g.engine.getRenderingCanvas();canvas.style.width='2560px';canvas.style.height='1440px';g.engine.resize();g.engine.setSize(2560,1440);
 const first=g.scene.getFrameId();for(let i=0;i<180;i++)await new Promise(r=>requestAnimationFrame(r));
 const smoke={sceneFrames:g.scene.getFrameId()-first,output:[canvas.width,canvas.height],internal:[g.post.post.width,g.post.post.height],postFloats:g.post.post.params.length,windFloats:g.wind.block.length,stormPresent:!!g.sandstorm,gpuErrors:w.gpuStats.gpuErrors,gpuMessages:w.gpuStats.gpuErrorMessages||[],late:w.gpuStats.late};
 if(smoke.sceneFrames<170||smoke.gpuErrors||smoke.late.length)throw new Error(JSON.stringify(smoke));
 // Disposable browser, stopped/drained. This tests the actual bundled CPU owner with a
 // synthetic collision stamp; it does not claim a rendered Ridge/GPU healing parity test.
 g.engine.stopRenderLoop();await w.gpuStats.device.queue.onSubmittedWorkDone();
 const s=g.stone,m=s.mass,ts=g.terrainState,cx=g.controller.pos.x+100,cz=g.controller.pos.z,rate=Math.LN2/300;
 s.dt=0;s.time=m.time;ts.healScale=1;s.update();m.arg.set([cx,cz,1,0,1,1,1,rate]);m.addRidge();
 s.time+=100;s.update();const aged=m.heightAt(cx,cz);ts.healScale=0;s.update();const zeroAtSameTime=m.heightAt(cx,cz);
 s.time+=200;s.update();const held=m.heightAt(cx,cz);ts.healScale=3;s.update();const changedAtSameTime=m.heightAt(cx,cz);
 s.time+=10;s.update();const resumed=m.heightAt(cx,cz),expected=Math.exp(-rate*130);
 return {smoke,aged,zeroAtSameTime,held,changedAtSameTime,resumed,expected,zeroPreserved:m.healScale===3&&aged===zeroAtSameTime&&aged===held&&aged===changedAtSameTime,error:Math.abs(resumed-expected)};
`;
const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(JSON.stringify(r));const report={date:new Date().toISOString(),revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),...r.result,note:'Fresh main-game1440p/.7 cold smoke, then actual bundled Stone CPU owner isolated with renderer stopped. Synthetic collision stamp only; no new GPU brush, rendered Ridge, resident/evicted healing parity, shelter, allocations or D6 erasure acceptance. This disposable browser intentionally leaves its render loop stopped.'};fs.writeFileSync('docs/phase-9/stone-healing-main-smoke.json',JSON.stringify(report,null,2)+'\n');console.log(report);if(!report.zeroPreserved||report.error>1e-12||report.smoke.postFloats!==128||report.smoke.windFloats!==24||report.smoke.stormPresent)process.exitCode=1;
