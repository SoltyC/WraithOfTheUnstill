import fs from 'node:fs';
const base='http://localhost:4181';
async function cmd(body){const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify(body)})).json();const r=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!r.ok)throw new Error(JSON.stringify(r));return r.result;}
const reports=[];
for(const hour of [18,1])for(const on of [false,true]){
const report=await cmd({do:'eval',js:`
g.clock.pinHour=${hour};w.params.v.timeOfDay=${hour};w.params.version++;
const f=g.sandstorm;f.enabled=${on};f.target=${on?1:0};f.active=false;f.strength=0;f.snap=true;f.update();if(${on}){f.age=95;f.update();}
for(let i=0;i<180;i++)await new Promise(r=>requestAnimationFrame(r));
const d=w.gpuStats.device,read=async b=>{const rb=d.createBuffer({size:b.getBuffer().capacity,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),e=d.createCommandEncoder();e.copyBufferToBuffer(b.getBuffer().underlyingResource,0,rb,0,rb.size);d.queue.submit([e.finish()]);await rb.mapAsync(GPUMapMode.READ);const out=Array.from(new Float32Array(rb.getMappedRange()));rb.unmap();rb.destroy();return out;};
return {hour:${hour},on:${on},env:{night:g.env.env.night,skylight:g.env.env.envMisc.w},params:await read(g.atmosphere.atmoParams),light:await read(g.atmosphere.atmoLight),gpuErrors:w.gpuStats.gpuErrors,late:w.gpuStats.late};`});
report.shot=await cmd({do:'shot',name:'light-hour-'+hour+'-'+(on?'on':'off'),dir:'d6-storm-wind',hud:false});reports.push(report);console.log(report);}
fs.writeFileSync('docs/phase-9/storm-front/night-light-probe.json',JSON.stringify({date:new Date().toISOString(),reports},null,2)+'\n');
