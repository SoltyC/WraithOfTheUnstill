// Save/load boundary for the shared front and its exposure journal. The journal is captured
// after terrain readbacks, and its watermark must cover every captured page timestamp.
import {createSandstormFront} from './sandstormFront.js';
import {validateStormExposure} from './stormExposure.js';
const FIELDS=['anchorX','anchorZ','baseY','dirX','dirZ','age','strength','startPlane','target'];
function applyFront(front,f){
  for(const k of FIELDS)front[k]=f[k];front.enabled=f.enabled;front.active=f.active;front.snap=false;front.dt=0;
  const len=Math.hypot(f.dirX,f.dirZ);front.block[0]=f.dirX/len;front.block[1]=f.dirZ/len;front.block[4]=f.baseY;front.update();
}
export function validateStormState(s){
  if(!s||s.version!==1||!s.front)throw new Error('Invalid saved storm state');
  const f=s.front;
  if(typeof f.enabled!=='boolean'||typeof f.active!=='boolean')throw new Error('Invalid saved storm flags');
  for(const k of FIELDS)if(!Number.isFinite(f[k]))throw new Error('Invalid saved storm '+k);
  if(f.age<0||f.strength<0||f.strength>1||f.target<0||f.target>1||Math.hypot(f.dirX,f.dirZ)<1e-6)throw new Error('Invalid saved storm parameters');
  validateStormExposure(s.exposure);
  // Validate that a load reproduces the actual recorded field, including a fading front.
  const check=createSandstormFront();applyFront(check,f);
  const values=s.exposure.samples;
  if(values.length&&values.at(-9)>0)for(let i=0;i<12;i++)if(check.block[i]!==values[values.length-12+i])throw new Error('Saved storm front and exposure disagree');
  return s;
}
export function captureStormState(front,exposure){
  if(!front.active&&!front.enabled&&!exposure.hasStorm)return null;
  exposure.seal();
  const f={enabled:front.enabled,active:front.active};for(const k of FIELDS)f[k]=front[k];
  return validateStormState({version:1,front:f,exposure:exposure.snapshot()});
}
export function restoreStormState(s,front,exposure,shift,now){
  if(s!==null)validateStormState(s);
  if(!Number.isFinite(shift)||!Number.isFinite(now))throw new Error('Invalid storm restore clock');
  if(s===null){
    exposure.restore({version:1,through:now,samples:[]});front.enabled=false;front.active=false;front.target=0;front.strength=0;front.age=0;front.snap=false;front.dt=0;front.block.fill(0);return;
  }
  if(Math.abs(s.exposure.through+shift-now)>1e-6)throw new Error('Storm capture watermark does not match save clock');
  exposure.restore(s.exposure,shift);
  applyFront(front,s.front);
}
