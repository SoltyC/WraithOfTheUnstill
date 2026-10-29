// Low desert dust: convection lifts it by day; a small settled residue preserves clear nights.
// Quantize only the LUT density key, so slow solar/border changes do not rebuild static LUTs
// every frame. Owner fields avoid floating-point arguments in the per-frame path.
export function createDesertAerosol() {
  return {on:true,weight:0,restored:0,wet:0,sunY:1,density:0,quantized:0,
    update(){
      let day=Math.max(0,Math.min(1,(this.sunY+.12)/.32));day=day*day*(3-2*day);
      const weight=Math.max(0,Math.min(1,this.weight)),restored=Math.max(0,Math.min(1,this.restored)),wet=Math.max(0,Math.min(1,this.wet));
      this.density=this.on?weight*(.04+.76*day)*(.55+.45*restored)*(1-.8*wet):0;
      this.quantized=Math.round(this.density*64)/64;
    },
  };
}
