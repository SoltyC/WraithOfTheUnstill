// A published, bounded ground-reference wind shadow, derived from actual terrain heights.
// The CPU and every GPU consumer use the same immutable revision. Missing/stale coverage is open air.
export const SHELTER_N=33,SHELTER_STEP=1,SHELTER_FLOATS=1092,SHELTER_VECTORS=273;
export const SHELTER_OFFSET=36,SHELTER_DATA=40;
// Hot query: receiver coordinates are owner fields, so numeric arguments do not box.
export function sampleShelterInto(b,o){
  let height=0;
  if(b.length>=SHELTER_DATA+SHELTER_FLOATS&&b[39]>0){
    const u=(o.sx-b[36])/b[38],v=(o.sz-b[37])/b[38];
    if(u>=0&&v>=0&&u<=32&&v<=32){
      const i=Math.min(31,Math.floor(u)),j=Math.min(31,Math.floor(v)),fx=u-i,fz=v-j,k=40+j*33+i;
      const a=b[k]+(b[k+1]-b[k])*fx,c=b[k+33]+(b[k+34]-b[k+33])*fx;
      const edge=Math.min(u,v,32-u,32-v),q=Math.max(0,Math.min(1,edge/2));height=(a+(c-a)*fz)*q*q*(3-2*q);
    }
  }
  o.shelterHeight=height;const q=Math.max(0,Math.min(1,(height-.7)/.8));o.exposure=1-.88*q*q*(3-2*q);
}
// Cold diagnostic convenience only; production wind uses the owner query above.
export function sampleShelterHeight(b,x,z){const o={sx:x,sz:z,shelterHeight:0,exposure:1};sampleShelterInto(b,o);return o.shelterHeight;}
export function shelterExposure(height,receiverHeight=1){
  const q=Math.max(0,Math.min(1,(height-receiverHeight+.3)/.8));return 1-.88*q*q*(3-2*q);
}
// Generate direct accesses, avoiding a by-value copy of a large WGSL array argument.
export function shelterWGSL(name,info,values){return `
fn ${name}Height(p:vec2f)->f32{
 let H=${info};if(H.w<=0.0){return 0.0;}let uv=(p-H.xy)/H.z;
 if(any(uv<vec2f(0.0))||any(uv>vec2f(32.0))){return 0.0;}
 let a=min(vec2u(floor(uv)),vec2u(31u));let f=uv-vec2f(a);let k=a.y*33u+a.x;
 let k1=k+1u;let k2=k+33u;let k3=k+34u;
 let h=mix(mix(${values('k')},${values('k1')},f.x),mix(${values('k2')},${values('k3')},f.x),f.y);
 let q=clamp(min(min(uv.x,uv.y),min(32.0-uv.x,32.0-uv.y))*.5,0.0,1.0);
 return h*q*q*(3.0-2.0*q);
}
fn ${name}(p:vec2f,h:f32)->f32{let q=clamp((${name}Height(p)-h+.3)/.8,0.0,1.0);return 1.0-.88*q*q*(3.0-2.0*q);}
`;}
// Reused output and work arrays. Heights arrive from the terrain-state snapshot plus the
// existing worker collision base; no Stone-shape proxy, invented wall or random cover.
export function createShelterField(){
 const data=new Float32Array(SHELTER_FLOATS);
 return {data,originX:0,originZ:0,step:1,enabled:false,time:-Infinity,revision:0,
  heights:null,valid:null,n:129,gridX:0,gridZ:0,gridStep:.5,dx:1,dz:0,
  qx:0.5,qz:0.5,
  heightAt(){
   const u=(this.qx-this.gridX)/this.gridStep,v=(this.qz-this.gridZ)/this.gridStep,n=this.n;
   if(u<0||v<0||u>=n-1||v>=n-1)return NaN;
   const i=Math.floor(u),j=Math.floor(v),fx=u-i,fz=v-j,k=j*n+i,d=this.heights,a=this.valid;
   if(!a[k]||!a[k+1]||!a[k+n]||!a[k+n+1])return NaN;
   return (d[k]+(d[k+1]-d[k])*fx)*(1-fz)+(d[k+n]+(d[k+n+1]-d[k+n])*fx)*fz;
  },
  rebuild(){
   const l=Math.hypot(this.dx,this.dz);if(l<1e-6){this.enabled=false;return;}
   const dx=this.dx/l,dz=this.dz/l;
   this.originX=this.gridX+16;this.originZ=this.gridZ+16;
   for(let j=0;j<33;j++)for(let i=0;i<33;i++){
    const x=this.originX+i,z=this.originZ+j;this.qx=x;this.qz=z;const base=this.heightAt();let block=0,valid=Number.isFinite(base);
    if(valid)for(let d=.5;d<=14;d+=.5){this.qx=x-dx*d;this.qz=z-dz*d;const y=this.heightAt();if(!Number.isFinite(y)){valid=false;break;}block=Math.max(block,(y-base)/(1+d*.12)-d*.05);}
    data[j*33+i]=valid?block:0;
   }
   this.enabled=true;this.revision++;
  },
 };
}

// A pending read must still belong to the current receiver, even before any field exists.
// Checking only field.enabled leaves startup/teleport reads able to publish obsolete cover.
export function shelterSnapshotCurrent(owner,slot){
 return owner.enabled&&owner.time>=slot.time&&owner.time-slot.time<=.75
  &&Math.abs(owner.px-slot.x-32)<=12&&Math.abs(owner.pz-slot.z-32)<=12
  &&slot.dx*owner.dx+slot.dz*owner.dz>=.98;
}
