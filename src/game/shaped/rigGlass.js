// D9b layouts use the shared fixed chunk record and existing rise/fall hand-off.
// The Whirler's live spiral is posed by duneCaster.js; its core remains targetable at chest height.
export function buildGlassRig(sh, count, seed, opt) {
  const bone=new Uint8Array(count),index=new Uint8Array(count),kind=new Uint8Array(count);
  const off=new Float32Array(count*3),size=new Float32Array(count*3),cseed=new Float32Array(count),rise=new Float32Array(count);
  const whirl=opt.variant==='whirler';
  for(let c=0;c<count;c++){
    const o=c*3, h=((c*73+seed)%997)/997;
    cseed[c]=seed+c*13.7;rise[c]=0.1+h*0.6;
    if(whirl){
      bone[c]=0;index[c]=0;kind[c]=c<8?16:11;
      off[o]=(h-.5)*.35;off[o+1]=.2;off[o+2]=.12;
      size[o]=c<8?.32:.16;size[o+1]=c<8?.6:.09;size[o+2]=c<8?.22:.65;
    }else if(c<40){
      // Two long articulated legs, made from stone at one side and fused glass at the other.
      const leg=c%2,part=Math.floor(c/2)%2,f=(Math.floor(c/4)+.5)/10;
      bone[c]=part?4:3;index[c]=leg;kind[c]=leg?15:12;
      off[o]=(h-.5)*.16;off[o+1]=(h-.5)*.12;off[o+2]=(part?sh.legs[leg].lower:sh.legs[leg].upper)*f;
      size[o]=.24;size[o+1]=.22;size[o+2]=.42;
    }else if(c<80){
      bone[c]=0;index[c]=(c-40)%2;const a=c*2.399963;
      kind[c]=c%3?15:12;off[o]=Math.cos(a)*.32;off[o+1]=Math.sin(a)*.28;off[o+2]=sh.spacing*.5;
      size[o]=.38+h*.2;size[o+1]=.4;size[o+2]=.55;
    }else{
      bone[c]=1;kind[c]=c%4?15:8;
      off[o]=(h-.5)*.38;off[o+1]=.1+(c-80)*.025;off[o+2]=.35;
      size[o]=.22;size[o+1]=.42;size[o+2]=.3;
    }
  }
  return {count,bone,index,kind,off,size,cseed,rise,needed:count,plate0:0,plate1:0,seam0:0,seam1:0};
}
