import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile),reports=[];
for(const mix of ['whirler:1','glasssworn:1','whirler:1,glasssworn:1,skitter:2']){
 const {stdout}=await run(process.execPath,['tools/bot/dune-fight.mjs','frost',mix],{env:{...process.env,WRAITH_URL:'http://127.0.0.1:4175',TIMEOUT:'60',MODE:'mixed'},timeout:180000});
 const r=JSON.parse(stdout.trim());reports.push(r);console.log(r);
 fs.mkdirSync('docs/phase-9/dune-casters',{recursive:true});fs.writeFileSync('docs/phase-9/dune-casters/frost-lock-fights.json',JSON.stringify({date:new Date().toISOString(),reports},null,2)+'\n');
}
if(reports.some(r=>r.hp<=0||r.gpuErrors||r.late.length||r.killed.split('/')[0]!==r.killed.split('/')[1]))process.exitCode=1;
