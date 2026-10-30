import fs from 'node:fs';
const base='http://localhost:4181';
async function ev(js){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(JSON.stringify(r));return r.result;}
const result=await ev(`
const frame=()=>new Promise(r=>requestAnimationFrame(r)),s=g.sandStreaks,reports=[];
if(w.gpuStats.gpuErrors)throw new Error(JSON.stringify(w.gpuStats.gpuErrorMessages));
for(let repeat=0;repeat<2;repeat++)for(const snapshot of [false,true])for(const [width,height,scale,on]of [[1280,720,1,false],[2560,1440,.7,true],[1280,720,1,false]]){
 g.toggles.on.snapshot=snapshot;g.engine.snapshotRendering=snapshot;s.on=on;w.params.v.renderScale=scale;w.params.v.dynamicRes=0;w.params.version++;
 const canvas=g.engine.getRenderingCanvas();canvas.style.width=width+'px';canvas.style.height=height+'px';g.engine.resize();g.engine.setSize(width,height);
 for(let i=0;i<90;i++)await frame();const first=g.scene.getFrameId(),draws=s.drawnFrames;
 const tx=s.travel.x,tz=s.travel.y,tf=s.travel.z;
 for(let i=0;i<90;i++)await frame();
 const report={repeat,snapshot,on,output:[canvas.width,canvas.height],internal:[g.post.post.width,g.post.post.height],sceneFrames:g.scene.getFrameId()-first,draws:s.drawnFrames-draws,pausedTravelUnchanged:s.travel.x===tx&&s.travel.y===tz&&s.travel.z===tf,targetBuilds:s.targetBuilds,colorRefs:s.target.texture._references,depthRefs:s.target.depthStencilTexture._references,textureBytes:w.gpuStats.textureBytes,gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late.length};
 if(report.sceneFrames<85||report.gpuErrors||report.late||!report.pausedTravelUnchanged||report.colorRefs!==2||report.depthRefs!==2||(on?report.draws<85:report.draws!==0))throw new Error(JSON.stringify(report));reports.push(report);
}
g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;
return {reports,gpuErrors:w.gpuStats.gpuErrors,gpuMessages:w.gpuStats.gpuErrorMessages,late:w.gpuStats.late};
`);
const small=result.reports.filter(r=>r.output[0]===1280);if(new Set(small.map(r=>r.textureBytes)).size!==1)throw new Error('Texture memory did not return to baseline '+JSON.stringify(small));
fs.writeFileSync('docs/phase-9/storm-front/streak-lifecycle.json',JSON.stringify({date:new Date().toISOString(),...result,note:'Two repeated snapshot-off/on resize and grain-off/on cycles. Actual rendered frame advances, inactive draw skip, fixed paused travel, shared color/depth reference counts and same-size GPU texture bytes. Default storm capability remains false. No full allocation/distant-streaming/sustained D12 acceptance.'},null,2)+'\n');console.log(result);
