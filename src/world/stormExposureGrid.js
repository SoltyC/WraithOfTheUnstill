// Canonical8m ground-transport grid for CPU collision, live GPU jobs and worker reloads.
// Values are float32 density-seconds, bilinearly interpolated. A lazy fixed world-node cache
// advances only over newly committed timeline segments. Historical capture queries stay cold.
export const EXPOSURE_CELL=8,EXPOSURE_HALF=4096,EXPOSURE_N=1025;
export class StormExposureGrid {
  constructor(history,biomeA=null){
    this.history=history;this.biomeA=biomeA;this.revision=history.revision;
    this.indices=new Int32Array(EXPOSURE_N*EXPOSURE_N).fill(-1);this.prefix=new Float64Array(EXPOSURE_N*EXPOSURE_N);
    this.qx=0.0;this.qz=0.0;this.from=0.0;this.to=0.0;this.value=0.0;
    this.node=0;this.at=0.0;this.nodeValue=0.0;this.nodes=new Int32Array(4);this.values=new Float64Array(4);
    this.originX=0;this.originZ=0;this.columns=0;this.rows=0;this.output=null;
  }
  sampleNode(){
    const h=this.history,k=this.node,n=h.count,t=this.at;
    if(!Number.isInteger(k)||k<0||k>=this.indices.length||!Number.isFinite(t)||t>h.time+1e-7)throw new Error('Invalid storm exposure grid query');
    if(this.revision!==h.revision){this.indices.fill(-1);this.revision=h.revision;}
    if(!n||t<=h.times[0]||!h.hasStorm){this.nodeValue=0;return;}
    const row=Math.floor(k/EXPOSURE_N),col=k-row*EXPOSURE_N;
    h.qx=col*8-4096;h.qz=4096-row*8;
    let value=0;
    if(t===h.time){
      let i=this.indices[k],sum=i<0?0:this.prefix[k];
      if(i<0)i=0;
      let t0=h.times[i],d0=h._density(i);
      for(let j=i+1;j<n;j++){const t1=h.times[j],d1=h._density(j);sum+=(d0+d1)*.5*(t1-t0);t0=t1;d0=d1;}
      this.prefix[k]=sum;this.indices[k]=n-1;value=sum;
      if(h.tailTime>t0)value+=(d0+h._density(n))*.5*(h.tailTime-t0);
    }else{h.from=h.times[0];h.to=t;h.integrate();value=h.value;}
    if(this.biomeA){
      // Same half-texel convention as the renderer's raw8m Dunes sampler.
      const x=col-.5,z=row-.5,ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
      const ax=Math.max(0,Math.min(1023,ix)),az=Math.max(0,Math.min(1023,iz)),bx=Math.max(0,Math.min(1023,ix+1)),bz=Math.max(0,Math.min(1023,iz+1)),b=this.biomeA;
      const v00=b[(az*1024+ax)*4+3],v10=b[(az*1024+bx)*4+3],v01=b[(bz*1024+ax)*4+3],v11=b[(bz*1024+bx)*4+3];
      value*=((v00+(v10-v00)*fx)*(1-fz)+(v01+(v11-v01)*fx)*fz)/255;
    }
    this.nodeValue=Math.fround(value);
  }
  sample(){
    if(!Number.isFinite(this.qx)||!Number.isFinite(this.qz)||!Number.isFinite(this.from)||!Number.isFinite(this.to)||this.to<this.from||this.to>this.history.time+1e-7)throw new Error('Invalid storm exposure interval');
    if(Math.abs(this.qx)>4096||Math.abs(this.qz)>4096){this.value=0;return;}
    const x=(this.qx+4096)/8,z=(4096-this.qz)/8,ix=Math.min(1023,Math.floor(x)),iz=Math.min(1023,Math.floor(z)),fx=x-ix,fz=z-iz;
    this.nodes[0]=iz*1025+ix;this.nodes[1]=this.nodes[0]+1;this.nodes[2]=this.nodes[0]+1025;this.nodes[3]=this.nodes[2]+1;
    for(let i=0;i<4;i++){this.node=this.nodes[i];this.at=this.from;this.sampleNode();const start=this.nodeValue;this.at=this.to;this.sampleNode();this.values[i]=Math.fround(Math.max(0,this.nodeValue-start));}
    const v=this.values;this.value=(v[0]+(v[1]-v[0])*fx)*(1-fz)+(v[2]+(v[3]-v[2])*fx)*fz;
  }
  // Owner supplies a world-node origin (north-west), dimensions and reusable output array.
  // This is the exact interval field uploaded to GPU healing jobs; no per-texel ray march.
  fill(){
    if(!this.output||this.output.length<this.columns*this.rows||this.originX%8||this.originZ%8)throw new Error('Invalid storm exposure job grid');
    for(let j=0;j<this.rows;j++)for(let i=0;i<this.columns;i++){
      this.qx=this.originX+i*8;this.qz=this.originZ-j*8;this.sample();this.output[j*this.columns+i]=this.value;
    }
  }
}
