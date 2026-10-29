// Desert heat controls. Refraction samples the composed scene immediately before temporal
// reconstruction, sharing TAA's existing sampler/targets instead of a full-frame copy pass.
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
export function createHeatModel() {
  return {
    on: true, debug: false, hour: 12, time: 0, weight: 0, restored: 0, wet: 0, cover: 0,
    maxPixels: 1.25, strength: 0, data: new Float32Array([0,0,1.25,0,90,250,.035,.18]),
    update() {
      const sun=Math.max(0,Math.cos((this.hour-13)*Math.PI/12));
      const dry=1-Math.max(0,Math.min(1,this.wet));
      this.strength=this.on?sun*sun*dry*dry*Math.max(0,Math.min(1,this.weight))
        *Math.max(0,Math.min(1,this.restored))*(1-.8*Math.max(0,Math.min(1,this.cover))):0;
      this.data[0]=this.strength;this.data[1]=this.time;this.data[2]=Math.max(0,Math.min(3,this.maxPixels));this.data[3]=this.debug?1:0;
    },
  };
}
export function createHeat(post,scene,surface) {
  const heat=createHeatModel();
  heat.buffer=new StorageBuffer(scene.getEngine(),32,undefined,'desert-heat');heat.buffer.update(heat.data);heat.surface=surface;
  post.onParams(()=>{heat.update();heat.buffer.update(heat.data);});
  return heat;
}
