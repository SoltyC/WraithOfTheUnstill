// Saved world-space storm exposure. Fixed storage while playing; snapshots allocate only
// on save/restore. A piecewise-linear density timeline is shared by live job grids, collision
// and the page worker, so returning to a page cannot substitute the current weather for history.
import {sampleSandstorm,SANDSTORM_SPEED} from './sandstormFront.js';
export const EXPOSURE_STEP=.25,EXPOSURE_CAPACITY=65536,EXPOSURE_STRIDE=13;

function validBlock(b,k=0){
  for(let i=0;i<12;i++)if(!Number.isFinite(b[k+i]))throw new Error('Invalid storm exposure front');
  if(b[k+3]<0||b[k+3]>1)throw new Error('Invalid storm exposure strength');
  if(b[k+3]>0&&(!(b[k+5]>0)||!(b[k+6]>0)||!(b[k+7]>0)||Math.abs(Math.hypot(b[k],b[k+1])-1)>.001))throw new Error('Invalid storm exposure geometry');
}
export function validateStormExposure(s,capacity=EXPOSURE_CAPACITY){
  if(!s||s.version!==1||!Number.isFinite(s.through)||!Array.isArray(s.samples)||s.samples.length%13||s.samples.length/13>capacity)throw new Error('Invalid storm exposure snapshot');
  let prev=-Infinity;
  for(let k=0;k<s.samples.length;k+=13){const t=s.samples[k];if(!Number.isFinite(t)||t<prev||t>s.through)throw new Error('Invalid storm exposure time');validBlock(s.samples,k+1);prev=t;}
  if(s.samples.length&&s.samples.at(-9)>0&&prev!==s.through)throw new Error('Active storm exposure lacks capture watermark');
  return s;
}

export class StormExposure {
  constructor(capacity=EXPOSURE_CAPACITY){
    this.capacity=capacity;this.times=new Float64Array(capacity);this.blocks=new Float32Array(capacity*12);
    this.tail=new Float32Array(12);this.tailTime=0.0;this.count=0;this.hasStorm=false;
    this.revision=0;this.time=0.0;this.source=null;this.qx=0.0;this.qz=0.0;this.from=0.0;this.to=0.0;this.value=0.0;
    this._query={block:this.blocks,stormOffset:0,qx:0.0,qy:0.0,qz:0.0,density:0.0,signedDistance:0.0};
  }
  _append(t,b){
    if(this.count>=this.capacity)throw new Error('Storm exposure history capacity exceeded');
    this.times[this.count]=t;this.blocks.set(b,this.count*12);this.count++;
  }
  /** Owner assigns .time and .source (the front's fixed12-float block), then records. */
  record(){
    const t=this.time,b=this.source,n=this.count;
    if(!Number.isFinite(t)||!b||b.length!==12||n&&t<this.tailTime)throw new Error('Invalid storm exposure input');
    validBlock(b);
    if(!n){this._append(t,b);this.tail.set(b);this.tailTime=t;this.hasStorm=b[3]>0;return;}
    let changed=false;for(let i=0;i<12;i++)if(b[i]!==this.tail[i]){changed=true;break;}
    if(t===this.tailTime&&!changed)return;
    const was=this.tail[3]>0,on=b[3]>0;
    // Changes of anchor/shape or a photo/debug front jump are discontinuities, not
    // storms sweeping across all intermediate positions. Preserve both sides at one time.
    let jump=false;
    if(was&&on){
      if(b[0]!==this.tail[0]||b[1]!==this.tail[1]||b[4]!==this.tail[4]||b[5]!==this.tail[5]||b[6]!==this.tail[6]||b[7]!==this.tail[7])jump=true;
      if(changed&&Math.abs(b[2]-this.tail[2]-SANDSTORM_SPEED*(t-this.tailTime))>4)jump=true;
      if(t===this.tailTime&&changed)jump=true;
    }
    const transition=was!==on;
    const need=(transition||jump)?1+(this.tailTime>this.times[n-1]?1:0)+(jump&&t>this.tailTime?1:0):((was||on)&&t-this.times[n-1]>=EXPOSURE_STEP?1:0);
    // Full (hours of storms): forget the oldest half. Only marks left untouched that long would ask
    // about those times, and they have long healed.
    if(n+need>this.capacity-1){const keep=this.count>>1,drop=this.count-keep;this.times.copyWithin(0,drop,this.count);this.blocks.copyWithin(0,drop*12,this.count*12);this.count=keep;this.revision++;}
    if(transition||jump){
      if(this.tailTime>this.times[this.count-1])this._append(this.tailTime,this.tail);
      if(jump&&t>this.tailTime)this._append(t,this.tail);
      this._append(t,b);
    }else if((was||on)&&t-this.times[this.count-1]>=EXPOSURE_STEP)this._append(t,b);
    this.tail.set(b);this.tailTime=t;this.hasStorm=this.hasStorm||on;
  }
  _density(index){
    const q=this._query;
    if(index===this.count){q.block=this.tail;q.stormOffset=0;}else{q.block=this.blocks;q.stormOffset=index*12;}
    q.qx=this.qx;q.qz=this.qz;q.qy=q.block[q.stormOffset+4];sampleSandstorm(q);return q.density;
  }
  /** Ground-reference transport exposure in density-seconds at qx/qz over [from,to].
   *  The aerosol's vertical falloff is not a new terrain-height model. */
  integrate(){
    const start=this.from,end=this.to,n=this.count;
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end>this.time+1e-7)throw new Error('Storm exposure query exceeds history watermark');
    if(!n||end<=this.times[0]||start===end||!this.hasStorm){this.value=0;return;}
    let lo=0,hi=n;
    while(lo<hi){const mid=(lo+hi)>>>1;if(this.times[mid]<=start)lo=mid+1;else hi=mid;}
    let i=Math.max(0,lo-1),t0=this.times[i],d0=this._density(i),sum=0;
    const hasTail=this.tailTime>this.times[n-1],last=hasTail?n:n-1;
    for(let j=i+1;j<=last;j++){
      const t1=j===n?this.tailTime:this.times[j],d1=this._density(j);
      if(t1>t0){const a=Math.max(start,t0),b=Math.min(end,t1);if(b>a){const u=(a-t0)/(t1-t0),v=(b-t0)/(t1-t0);sum+=(d0+(d1-d0)*(u+v)*.5)*(b-a);}}
      t0=t1;d0=d1;if(t0>=end)break;
    }
    this.value=sum;
  }
  // Pin a capture boundary before storing terrain or a new shape's birth exposure. Later
  // samples must not refine the interval containing that already-captured timestamp.
  seal(){
    if(this.count&&this.tailTime>this.times[this.count-1]&&(this.tail[3]>0||this.blocks[(this.count-1)*12+3]>0))this._append(this.tailTime,this.tail);
  }
  snapshot(){
    const tail=this.count&&this.tailTime>this.times[this.count-1],n=this.count+(tail?1:0),samples=new Array(n*13);
    for(let i=0;i<n;i++){const b=i===this.count?this.tail:this.blocks,k=i===this.count?0:i*12,o=i*13;samples[o]=i===this.count?this.tailTime:this.times[i];for(let j=0;j<12;j++)samples[o+1+j]=b[k+j];}
    return {version:1,through:this.time,samples};
  }
  restore(s,shift=0){
    validateStormExposure(s,this.capacity);if(!Number.isFinite(shift))throw new Error('Invalid storm exposure clock shift');
    // Validate before mutating the owner. Keep every saved endpoint committed: moving the
    // capture endpoint back into the mutable tail would rewrite pre-save exposure after load.
    // Saved timestamps shift with terrain page times.
    const total=s.samples.length/13,keys=total;
    this.revision++;this.count=0;this.hasStorm=false;
    for(let k=0;k<keys*13;k+=13){const i=this.count++;this.times[i]=s.samples[k]+shift;for(let j=0;j<12;j++)this.blocks[i*12+j]=s.samples[k+1+j];this.hasStorm=this.hasStorm||this.blocks[i*12+3]>0;}
    this.time=s.through+shift;this.tailTime=total?s.samples[(total-1)*13]+shift:this.time;
    if(total){for(let j=0;j<12;j++)this.tail[j]=s.samples[(total-1)*13+1+j];this.hasStorm=this.hasStorm||this.tail[3]>0;}else this.tail.fill(0);
  }
}
