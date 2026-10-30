// Whirler AI, material posing and a bounded six-devil pool. No new render pipeline/draw.
// Numeric state IDs match shaped.js; importing that owner would create a cycle.
import { BRUSH } from '../../shaders/terrainState.wgsl.js';
export const DEVIL_COUNT=6, DEVIL_CHUNKS=16;
const CLOUDS=6,CLOUD_LIFE=3.5,CLOUD_R=1.8;   // radius m (3.6 m across)
export function createDuneCaster(ts,ground,whirls=new Float32Array(16*8)) {
  const cloudX=new Float64Array(CLOUDS),cloudZ=new Float64Array(CLOUDS),cloudAge=new Float64Array(CLOUDS).fill(-1),cloudPuff=new Float64Array(CLOUDS);
  let cloudNext=0;
  const x=new Float64Array(DEVIL_COUNT),z=new Float64Array(DEVIL_COUNT),vx=new Float64Array(DEVIL_COUNT),vz=new Float64Array(DEVIL_COUNT);
  const age=new Float64Array(DEVIL_COUNT),tick=new Float64Array(DEVIL_COUNT),owner=new Int8Array(DEVIL_COUNT).fill(-1),hit=new Uint8Array(DEVIL_COUNT);
  let next=0;
  return {
    dt:0.5,
    /** A dust cloud where a blast or devil struck (events only: rare, not the per-frame path). */
    cloud(cx,cz){const c=cloudNext;cloudNext=(cloudNext+1)%CLOUDS;cloudX[c]=cx;cloudZ[c]=cz;cloudAge[c]=0;cloudPuff[c]=0;},
    reset(){cloudAge.fill(-1);},
    think(s,P){
      const dt=this.dt;
      const b=s.body,dx=P.px-b.x,dz=P.pz-b.z,d=Math.sqrt(dx*dx+dz*dz)||1;
      s.reverse=Math.max(0,s.reverse-dt);b.wantVx=0;b.wantVz=0;
      if(s.state===7){b.frozen=true;s.glow=0;if(s.t>=s.frozenFor){b.frozen=false;s.state=2;s.t=0;s.cool=1;}return;}
      if(s.reverse>0){s.glow=0;return;}
      if(s.state===6){s.glow=0;if(s.t>=.5){s.state=2;s.t=0;s.cool=1;}return;}
      s.spin+=dt*(s.state===3?9:4);
      s.glow+=( (s.state===3?1:0)-s.glow)*Math.min(1,dt*5);
      if(s.state===1){if(s.t>=1.8){s.state=2;s.t=0;}return;}
      if(s.state===2){
        const radial=Math.max(-2,Math.min(2,(d-9)*.8));
        b.wantVx=dx/d*radial-dz/d*.7;b.wantVz=dz/d*radial+dx/d*.7;
        s.cool-=dt;if(s.cool<=0&&d<23){s.state=3;s.t=0;}
      }else if(s.state===3&&s.t>=1.05){
        // A visible tightening spiral precedes three aimed sand clots and one small devil.
        const lead=d/16,tx=P.px+P.pvx*lead,tz=P.pz+P.pvz*lead;
        ground.qx=tx;ground.qz=tz;ground.sample();
        P.sx=b.x;P.sy=b.y+1.4;P.sz=b.z;P.ty=ground.h+.9;P.shotSpeed=16;P.shotDmg=8;
        for(let k=-1;k<=1;k++){P.tx=tx-dz/d*k*.9;P.tz=tz+dx/d*k*.9;P.shotKind=11;P.shoot();}
        const k=next;next=(next+1)%DEVIL_COUNT;
        x[k]=b.x+dx/d*1.5;z[k]=b.z+dz/d*1.5;vx[k]=dx/d*4;vz[k]=dz/d*4;
        age[k]=0;tick[k]=0;owner[k]=s.idx;hit[k]=0;
        s.state=5;s.t=0;
      }else if(s.state===5&&s.t>=.85){s.state=2;s.t=0;s.cool=2.8;}
    },
    step(P,out,base){
      const dt=this.dt;
      // Dust clouds (the user's choice, 2026-10-30): a blast or a devil that hits leaves a cloud of dust
      // where it struck, ~3.5 m across for ~3.5 s. The veil is the Wraith standing in one: step out and
      // the air clears. Each cloud is drawn as a few sand-dust bursts at its spot while it hangs.
      let blind=0;
      for(let c=0;c<CLOUDS;c++){
        if(cloudAge[c]<0)continue;
        cloudAge[c]+=dt;
        if(cloudAge[c]>CLOUD_LIFE){cloudAge[c]=-1;continue;}
        const life=Math.min(1,cloudAge[c]*6,(CLOUD_LIFE-cloudAge[c])/1.2);
        const dx=P.px-cloudX[c],dz=P.pz-cloudZ[c],d=Math.sqrt(dx*dx+dz*dz);
        const inside=1-Math.min(1,Math.max(0,(d-CLOUD_R*.55)/(CLOUD_R*.45)));
        if(inside*life>blind)blind=inside*life;
        cloudPuff[c]-=dt;
        if(cloudPuff[c]<=0&&P.dustFx&&cloudAge[c]<CLOUD_LIFE-.8){
          // A ring of puffs round the cloud and one in it, every 0.6 s: a hanging cloud you can see to step out of.
          cloudPuff[c]=.6;const f=P.dustFx;f.time=P.time;f.dx=1;f.dz=0;f.halfLength=.6;f.depth=1;f.kind=0;
          f.x=cloudX[c];f.z=cloudZ[c];f.width=CLOUD_R;f.emit();
          for(let q=0;q<3;q++){const a=q*2.094+cloudAge[c]*1.7;f.x=cloudX[c]+Math.cos(a)*CLOUD_R*.7;f.z=cloudZ[c]+Math.sin(a)*CLOUD_R*.7;f.width=CLOUD_R*.75;f.emit();}
        }
      }
      P.blind=blind;
      for(let i=0;i<8;i++){
        const s=P.slots[i],o=i*8,b=s.body;
        whirls[o+3]=0;
        if(s.arch!=='whirler'||s.state===0||s.state===7||s.state===8)continue;
        whirls[o]=b.x;whirls[o+1]=b.y;whirls[o+2]=b.z;whirls[o+3]=s.state===1?Math.min(1,s.t/1.8):1;
        whirls[o+4]=s.spin;whirls[o+5]=2.95;whirls[o+6]=.38;whirls[o+7]=s.state===3?1:0;
      }
      for(let k=0;k<DEVIL_COUNT;k++){
        const s=owner[k]>=0?P.slots[owner[k]]:null;
        if(s&&(s.state===0||s.state===7||s.state===8||s.reverse>0))owner[k]=-1;
        age[k]+=dt;
        if(age[k]>5.3)owner[k]=-1;
        if(owner[k]>=0){
          // First .8 s stays in place as a readable warning; a jump/dodge escapes the low swirl.
          if(age[k]>.8){x[k]+=vx[k]*dt;z[k]+=vz[k]*dt;}
          ground.qx=x[k];ground.qz=z[k];ground.sample();
          tick[k]-=dt;
          if(tick[k]<=0&&age[k]>.8){
            tick[k]=.12;ts.bx=x[k];ts.bz=z[k];ts.bdx=vx[k]*.25;ts.bdz=vz[k]*.25;
            ts.bl=.12;ts.bw=.48;ts.bd=.045;ts.bc=.2;ts.bk=BRUSH.PLOUGH;ts.bwet=0;ts.bbias=0;ts.bberm=.9;ts.stamp();
          }
          const dx=P.px-x[k],dz=P.pz-z[k];
          if(age[k]>.8&&!hit[k]&&P.pgrounded&&dx*dx+dz*dz<1){P.hits++;P.hitDamage+=9;P.dustCloud(x[k],z[k]);hit[k]=1;}
        }
        const w=(8+k)*8;
        whirls[w]=x[k];whirls[w+1]=ground.h;whirls[w+2]=z[k];whirls[w+3]=owner[k]<0?0:Math.min(1,age[k]*4,(5.3-age[k])*2);
        whirls[w+4]=age[k]*7;whirls[w+5]=1.7;whirls[w+6]=.32;whirls[w+7]=age[k]<.8?1:0;
        const xx=x[k],zz=z[k],yy=ground.h,t=age[k];
        for(let c=0;c<DEVIL_CHUNKS;c++){
          const o=(base+k*DEVIL_CHUNKS+c)*16;
          if(owner[k]<0){out[o+15]=0;continue;}
          const a=t*7+c*2.399963,h=c/DEVIL_CHUNKS,r=.22+h*.4,ca=Math.cos(a),sa=Math.sin(a);
          out[o]=xx+ca*r;out[o+1]=yy+.12+h*1.5;out[o+2]=zz+sa*r;
          out[o+3]=.16;out[o+4]=ca;out[o+5]=0;out[o+6]=sa;out[o+7]=.1;
          out[o+8]=0;out[o+9]=1;out[o+10]=0;out[o+11]=.4;out[o+12]=k*89+c*17;out[o+13]=11;out[o+14]=age[k]<.8?.8:0;out[o+15]=1;
        }
      }
    },
  };
}
export function writeWhirler(s,out,rec){
  if(s.arch!=='whirler')return;
  const rise=s.renderRise;
  const b=s.body,st=s.st;
  for(let c=0;c<s.rig.count;c++){
    const o=(rec+c)*16;
    const h=c<8?.9+c*.1:Math.floor((c-8)/3)/29*2.8+.15;
    const a=s.spin+h*6+((c-8)%3)*2.094395,r=c<8?.16:(s.state===7?.18+h*.05:(.25+h*.16)*(s.state===3?.78:1));
    const ca=Math.cos(a),sa=Math.sin(a);
    out[o]=b.x+ca*r;out[o+1]=b.y+h-(1-rise)*2.8;out[o+2]=b.z+sa*r;
    out[o+4]=ca;out[o+5]=0;out[o+6]=sa;out[o+8]=0;out[o+9]=1;out[o+10]=0;
    if(c>=8&&s.state===7){out[o+3]=.52;out[o+7]=.3;out[o+11]=.65;}
    st.poseSize[c*3]=out[o+3];st.poseSize[c*3+1]=out[o+7];st.poseSize[c*3+2]=out[o+11];
    // Preserve the exact posed positions and frames for the existing debris simulation.
    st.dx[c]=out[o];st.dy[c]=out[o+1];st.dz[c]=out[o+2];
    st.fwd[c*3]=out[o+4];st.fwd[c*3+1]=0;st.fwd[c*3+2]=out[o+6];st.up[c*3]=0;st.up[c*3+1]=1;st.up[c*3+2]=0;
  }
}
