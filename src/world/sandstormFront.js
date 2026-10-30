// World-anchored leading/trailing storm faces. Owner inputs, one fixed GPU block and scalar
// sampling outputs; no particles, terrain writes, renderer resources or per-frame allocations.
// WGSL twin: shaders/sandstormFront.wgsl.js. Kept dormant until D6 consumers pass review.
export const SANDSTORM_SPEED=32, SANDSTORM_AHEAD=2400, SANDSTORM_DEPTH=5000;
export const SANDSTORM_GUST=1.7;
export const SANDSTORM_WIDTH=140, SANDSTORM_HEIGHT=450, SANDSTORM_SIGMA=.015;
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};

export function createSandstormFront(){
  const block=new Float32Array(12);
  return {
    block,enabled:false,target:0.0,dt:0.0,snap:false,startInside:false,startAhead:0,
    anchorX:0.0,anchorZ:0.0,baseY:0.0,dirX:1.0,dirZ:0.0,
    active:false,age:0.0,strength:0.0,startPlane:0.0,plane:0.0,
    qx:0.0,qy:0.0,qz:0.0,density:0.0,signedDistance:0.0,
    update(){
      const dt=Number.isFinite(this.dt)?Math.max(0,Math.min(1,this.dt)):0;
      const target=this.enabled&&Number.isFinite(this.target)?Math.max(0,Math.min(1,this.target)):0;
      if(target>0&&!this.active){
        let dx=this.dirX,dz=this.dirZ,len=Math.hypot(dx,dz);
        if(!Number.isFinite(len)||len<1e-6){dx=1;dz=0;len=1;}
        block[0]=dx/len;block[1]=dz/len;
        const x=Number.isFinite(this.anchorX)?this.anchorX:0,z=Number.isFinite(this.anchorZ)?this.anchorZ:0;
        // Normally the leading face forms 2.4 km upwind and rolls in; a forced storm (photo spots, the
        // dev overlay) starts inside it (the face 600 m downwind), or arriving (startAhead m upwind).
        this.startPlane=x*block[0]+z*block[1]+(this.startAhead>0?-this.startAhead:this.startInside?600:-SANDSTORM_AHEAD);
        block[4]=Number.isFinite(this.baseY)?this.baseY:0;
        this.age=0;this.active=true;
      }
      if(!this.active){block[3]=0;this.snap=false;return;}
      this.age+=dt;this.plane=this.startPlane+this.age*SANDSTORM_SPEED;
      this.strength=this.snap?target:this.strength+(target-this.strength)*(1-Math.exp(-dt/8));
      this.snap=false;
      if(target===0&&this.strength<1e-5){this.active=false;this.strength=0;}
      block[2]=this.plane;block[3]=this.strength;
      block[5]=SANDSTORM_HEIGHT;block[6]=SANDSTORM_WIDTH;block[7]=SANDSTORM_DEPTH;
      block[8]=this.age;block[9]=SANDSTORM_SIGMA;block[10]=0;block[11]=0;
    },
    stormOffset:0,
    sample(){sampleSandstorm(this);},
  };
}

// Owner-field sampler is shared by the front and wind, without numeric call arguments or
// per-query objects. Wind uses the same packed layout at offset24.
export function sampleSandstorm(o){
  const b=o.block,k=o.stormOffset||0;
  if(!(b[k+3]>0)){o.density=0;o.signedDistance=0;return;}
  const across=-o.qx*b[k+1]+o.qz*b[k+0],q=o.qx*b[k+0]+o.qz*b[k+1]-b[k+2];
  const roll=45*Math.sin(across*.018+b[k+8]*.22)+20*Math.sin(across*.049-o.qy*.02+b[k+8]*.31);
  const lead=1-smooth((q-roll+b[k+6])/(2*b[k+6]));
  const tail=smooth((q+b[k+7]+b[k+6])/(2*b[k+6]));
  o.signedDistance=q-roll;
  o.density=b[k+3]*lead*tail*Math.exp(-Math.max(0,o.qy-b[k+4])/b[k+5]);
}
