import fs from 'node:fs';
const base='http://localhost:4181';
const js=`
 const frame=()=>new Promise(r=>requestAnimationFrame(r)),s=g.windShelter;
 await frame();await w.gpuStats.device.queue.onSubmittedWorkDone();
 s.dispose();const reads=s.reads;s.update();s.update();for(let i=0;i<90;i++)await frame();
 const report={readsBefore:reads,readsAfter:s.reads,fieldEnabled:s.field.enabled,windHeader:g.wind.block[39],gpuErrors:w.gpuStats.gpuErrors,messages:w.gpuStats.gpuErrorMessages,late:w.gpuStats.late};
 if(report.readsAfter!==reads||report.fieldEnabled||report.windHeader!==0||report.gpuErrors||report.late.length)throw new Error(JSON.stringify(report));return report;
`;
const{id}=await(await fetch(base+'/__wraith/bot/cmd',{method:'POST',body:JSON.stringify({do:'eval',js})})).json();
const reply=await(await fetch(base+'/__wraith/bot/reply?id='+id+'&wait=180000')).json();if(!reply.ok)throw new Error(JSON.stringify(reply));
const report={date:new Date().toISOString(),...reply.result,note:'Explicit shelter teardown after submitted work completes, followed by manual updates and90real renderer frames. No reads resume, published field/header open, no GPU/late errors. Does not test device loss or destruction before queued commands submit.'};
fs.writeFileSync('docs/phase-9/storm-front/ridge-shelter-lifecycle.json',JSON.stringify(report,null,2)+'\n');console.log(report);
