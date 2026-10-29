// The wind field (PLAN.md Phase 8 M1). One deterministic function of place and time, evaluated
// identically on the CPU (cloth, sound, glide) and on the GPU (grass, trees, ground cover, motes:
// shaders/wind.wgsl.js), so what the cloth feels is what the grass shows. It is:
//   base      the prevailing wind: climatology direction at the player (eased) × strength
//             (weather × restoration — 0 while stilled — plus the Warden's gusts)
//   fronts    wide gust bands moving downwind at FRONT_SPEED (two families with different spacing
//             and a slow wander along them), their height set by the weather's gustiness
//   eddies    small, slow turbulence
//   bursts    up to MAX_BURSTS injected local gusts (the Gale verbs; anything else may inject):
//             an expanding ring from a point that pushes outward and dies away
// The owner (systems/environment.js) sets the inputs once per frame; the uniform block (`block`,
// 9 × vec4) is shared by reference with every material that declares `windField`.
// Allocation-free.

import {sampleSandstorm,SANDSTORM_GUST} from './sandstormFront.js';
export const WIND_VECTORS=9;

export const FRONT_SPEED = 8;     // m/s
export const MAX_BURSTS = 4;
const BURST_SPEED = 14, BURST_LIFE = 2.2, BURST_WIDTH = 5;

/** Smooth front profile of a phase (radians): sharp-ish rises, long tails. Mirrors the WGSL. */
function front(ph) { const s = 0.5 + 0.5 * Math.sin(ph); return s * s * s * s; } // inlined (tiny)

export function createWind(stormFront=null) {
  // [0] dir x, dir z, base strength, time; [1] gustiness, front speed, -, -; [2..5] bursts:
  // x, z, start time, strength (strength 0 = none). [6..8] world-front block.
  // Wind remains a 2D ground-reference field, shared by cloth and water.
  const block = new Array(WIND_VECTORS*4).fill(0);
  block[0] = 1; block[5] = FRONT_SPEED;
  let next = 0;
  const w = {
    block,stormFront,stormWeight:0.5-0.5,stormOffset:24,
    qx:0.5,qy:0.5,qz:0.5,density:0.5-0.5,signedDistance:0.5-0.5,
    /** Owner inputs, set each frame before update(). */
    dirX: 1, dirZ: 0, strength: 0.5 - 0.5, gustiness: 0.5 - 0.5, time: 0.5,
    update() {
      const l = Math.sqrt(this.dirX * this.dirX + this.dirZ * this.dirZ) || 1;
      block[0] = this.dirX / l; block[1] = this.dirZ / l; block[2] = this.strength; block[3] = this.time;
      block[4] = this.gustiness;
      if(this.stormFront){const f=this.stormFront.block;for(let i=0;i<12;i++)block[24+i]=f[i];
        block[27]=Math.fround(f[3]*Math.max(0,Math.min(1,this.stormWeight)));
      }else block[27]=0;
      for (let i = 0; i < MAX_BURSTS; i++) { const o = 8 + i * 4; if (block[o + 3] > 0 && this.time - block[o + 2] > BURST_LIFE) block[o + 3] = 0; }
    },
    /** A local gust: an expanding ring from (x, z) pushing outward (the Gale's Gust, the Warden). */
    burst(x, z, strength) {
      const o = 8 + next * 4; next = (next + 1) % MAX_BURSTS;
      block[o] = x; block[o + 1] = z; block[o + 2] = this.time; block[o + 3] = strength;
    },
    /** Out fields of sample(): the wind at the queried point — direction (unit) and speed factor. */
    sx: 0.5, sz: 0.5, outX: 0.5, outZ: 0.5, speed: 0.5,
    /** The wind at (sx, sz) now: outX, outZ (unit direction) and speed (≈ strength × gusts). */
    sample() { fieldAt(block, this); },
  };
  return w;
}

/** The field at (x, z) from a block into o.outX/outZ/speed (tests, cold paths). */
export function sampleInto(b, x, z, o) { o.sx = x; o.sz = z; fieldAt(b, o); }

/** The field at (o.sx, o.sz) into o.outX/outZ/speed (mirrors windField() in the WGSL). Takes no
 *  doubles as arguments (they box when the call is not inlined: the hot path allocated). */
function fieldAt(b, o) {
  const x = o.sx, z = o.sz;
  const dx = b[0], dz = b[1], base = b[2], t = b[3], gu = b[4], c = b[5];
  const along = x * dx + z * dz, across = -x * dz + z * dx;
  // Two families of fronts, each wandering a little along its length.
  const f1 = front((along - c * t) * 0.045 + Math.sin(across * 0.013 + t * 0.05) * 1.2);
  const f2 = front((along - c * 1.2 * t) * 0.11 + 1.7 + Math.sin(across * 0.031 - t * 0.07) * 0.9);
  const eddy = 0.12 * Math.sin(x * 0.21 + t * 1.3) * Math.sin(z * 0.17 - t * 1.1);
  const g = 0.55 + gu * (0.9 * f1 + 0.5 * f2) + eddy;
  let vx = dx * base * g, vz = dz * base * g;
  if(b.length>=36&&b[27]>0){
    o.block=b;o.stormOffset=24;o.qx=x;o.qy=b[28];o.qz=z;sampleSandstorm(o);
    const sdX=b[24],sdZ=b[25],a=Math.fround(Math.fround(x*sdX)+Math.fround(z*sdZ)),cross=Math.fround(Math.fround(-x*sdZ)+Math.fround(z*sdX)),st=Math.fround(t);
    // Short advected storm bands: mean push stays near the original, with strong gusts
    // and a bounded crosswind. Cloth, grains and waves all sample these same pulses.
    // Round the short-wave phases like WGSL: large world coordinates otherwise put
    // cloth and GPU grains on different parts of a sharp pulse.
    const phase1=Math.fround(Math.fround(a*Math.fround(.21))-Math.fround(st*Math.fround(2.4)));
    const phase2=Math.fround(Math.fround(a*Math.fround(.43))-Math.fround(st*Math.fround(4.1)));
    const p1=front(Math.fround(phase1+Math.fround(Math.fround(Math.sin(Math.fround(cross*Math.fround(.07))))*Math.fround(.8))));
    const p2=front(Math.fround(phase2+Math.fround(1.7)));
    const lateralPhase=Math.fround(Math.fround(Math.fround(a*Math.fround(.17))-Math.fround(st*Math.fround(3.2)))+Math.fround(cross*Math.fround(.11)));
    const gain=.55+1.05*p1+.55*p2,lateral=.18*Math.sin(lateralPhase)*(.4+.6*p1);
    const push=base*SANDSTORM_GUST*o.density;
    vx+=push*(sdX*gain-sdZ*lateral);vz+=push*(sdZ*gain+sdX*lateral);
  }else{o.density=0;o.signedDistance=0;}
  for (let i = 0; i < 4; i++) {
    const k = 8 + i * 4, s = b[k + 3]; if (s <= 0) continue;
    const age = t - b[k + 2]; if (age < 0 || age > BURST_LIFE) continue;
    const rx = x - b[k], rz = z - b[k + 1], d = Math.sqrt(rx * rx + rz * rz);
    const q = (d - BURST_SPEED * age) / BURST_WIDTH, ring = Math.exp(-q * q);
    const fade = (1 - age / BURST_LIFE) * (1 - age / BURST_LIFE) / (1 + d * 0.02);
    const m = s * ring * fade / Math.max(d, 0.5);
    vx += rx * m; vz += rz * m;
  }
  const sp = Math.sqrt(vx * vx + vz * vz);
  if (sp > 1e-5) { o.outX = vx / sp; o.outZ = vz / sp; } else { o.outX = dx; o.outZ = dz; }
  o.speed = sp;
}
