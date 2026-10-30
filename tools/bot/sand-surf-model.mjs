// Deterministic CPU controller oracle, not a target-GPU/feel measurement.
import fs from 'node:fs';
import {Surf} from '../../src/character/surf.js';
const reports=[],dt=1/120;
for(const material of [0,1,6])for(const [name,ny,nz] of [['flat',1,0],['slip-face',Math.SQRT1_2,Math.SQRT1_2],['uphill',Math.sqrt(.75),-.5]]){
 const s=new Surf();s.material=material;s.sandUnlocked=true;s.selectSurface();s.want=true;s.grounded=true;s.throttle=1;
 s.enterVX=0;s.enterVZ=0;s.enterFacing=0;s.engageQ();s.dt=dt;s.nx=0;s.ny=ny;s.nz=nz;
 for(let i=0;i<4800;i++)s.stepQ();
 reports.push({material,scenario:name,seconds:40,speed:s.speed,active:s.active,cap:s.tuning.maxSpeed});
}
const s=new Surf();s.material=1;s.sandUnlocked=true;s.selectSurface();s.want=true;s.canSurf=true;s.grounded=true;s.throttle=1;
s.enterVX=0;s.enterVZ=31;s.enterFacing=0;s.engageQ();s.dt=dt;s.nx=0;s.ny=Math.SQRT1_2;s.nz=Math.SQRT1_2;
for(let i=0;i<240;i++)s.stepQ();const before=s.speed;
s.material=0;s.selectSurface();s.ny=1;s.nz=0;s.stepQ();
const transition={before,after:s.speed,oneSubstepDrop:before-s.speed,active:s.active};
const report={date:new Date().toISOString(),reports,transition,note:'40second ideal planes through the same Surf owner-field API used by CapsuleController. Sand is explicitly lent for the oracle. No world/terrain-state/wake/collision latency/graphics/performance/audio or human-feel acceptance.'};
fs.mkdirSync('docs/phase-9/sand-surf',{recursive:true});fs.writeFileSync('docs/phase-9/sand-surf/controller-model.json',JSON.stringify(report,null,2)+'\n');console.log(report);
