// Persistent storm sound, driven by the same local gust speed/direction as cloth and sand.
// Shares the SFX wind's noise source. Six nodes created at unlock, none while playing.
export function createStormWind(ctx,destination,source){
  const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=180;low.Q.value=.55;
  const grit=ctx.createBiquadFilter();grit.type='bandpass';grit.frequency.value=2100;grit.Q.value=.55;
  const ceiling=ctx.createBiquadFilter();ceiling.type='lowpass';ceiling.frequency.value=6200;ceiling.Q.value=.5;
  const lowGain=ctx.createGain(),gritGain=ctx.createGain(),pan=ctx.createStereoPanner();lowGain.gain.value=0;gritGain.gain.value=0;
  source.connect(low);low.connect(lowGain);lowGain.connect(pan);
  source.connect(grit);grit.connect(ceiling);ceiling.connect(gritGain);gritGain.connect(pan);pan.connect(destination);
  return {
    density:0.0,speed:0.0,exposure:1.0,wet:0.0,dx:1.0,dz:0.0,rightX:1.0,rightZ:0.0,time:0.0,on:true,
    lowTarget:0.0,gritTarget:0.0,panTarget:0.0,
    update(){
      const density=this.on?Math.max(0,Math.min(1,this.density)):0,speed=Math.max(0,this.speed),exposure=Math.max(0,Math.min(1,this.exposure));
      // Soft response preserves strong gust variation, rather than clipping all speeds>1.
      const rush=speed/(.8+speed),energy=Math.sqrt(speed/(1+speed));
      this.lowTarget=density*(.2+.8*exposure)*energy*.25;
      this.gritTarget=density*exposure*(1-Math.max(0,Math.min(1,this.wet)))*rush*rush*.18;
      // The sound arrives from upwind; a wind blowing right is heard from the left.
      this.panTarget=-Math.max(-1,Math.min(1,this.dx*this.rightX+this.dz*this.rightZ))*.45;
      lowGain.gain.setTargetAtTime(this.lowTarget,this.time,.08);gritGain.gain.setTargetAtTime(this.gritTarget,this.time,.06);
      low.frequency.setTargetAtTime(130+320*rush,this.time,.12);grit.frequency.setTargetAtTime(1600+2100*rush,this.time,.1);
      pan.pan.setTargetAtTime(this.panTarget,this.time,.1);
    },
    // Fixed references for diagnostics/offline renders, not a per-frame graph builder.
    nodes:{low,grit,ceiling,lowGain,gritGain,pan},
  };
}
