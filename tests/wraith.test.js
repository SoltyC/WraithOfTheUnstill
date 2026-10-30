import { describe, it, expect } from 'vitest';
import { Wraith } from '../src/character/wraith/wraith.js';
import {createWind} from '../src/world/wind.js';
import {createSandstormFront} from '../src/world/sandstormFront.js';

function setup(h = 0) {
  const ground = { qx: 0, qz: 0, h: 0, H: h, sample() { this.h = this.H; } };
  return { w: new Wraith(ground), ground };
}
function frame(w, x, y, z, vx, vz, dt = 1 / 60) {
  w.bx = x; w.by = y; w.bz = z; w.vx = vx; w.vz = vz; if (vx || vz) w.yaw = Math.atan2(vx, vz); w.grounded = true; w.dt = dt; w.time += dt;
  w.update();
}
function range(w, id) {
  const g = w.garments.find(g=>g.id===id), p = w.cloth.p; let mn = Infinity, mx = -Infinity;
  for (let k = 0; k < g.rows * g.cols; k++) { const y = p[(g.start + k) * 3 + 1]; mn = Math.min(mn, y); mx = Math.max(mx, y); }
  return [mn, mx];
}

describe('Wraith cloth', () => {
  it('streams and flaps the free mantle and robe under shared storm gusts',()=>{
    const {w}=setup(0),f=createSandstormFront();f.enabled=true;f.target=1;f.snap=true;f.anchorX=2400;f.anchorZ=900;f.update();f.age=95;f.update();
    const wind=createWind(f);wind.stormWeight=1;wind.strength=1;wind.dirX=1;wind.dirZ=0;wind.gustiness=.545;
    const groups=[0,1].map(id=>w.garments.find(g=>g.id===id)),lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];
    for(let i=0;i<720;i++){
      wind.time=i/60;wind.update();wind.sx=2400;wind.sz=900;wind.sample();w.windX=wind.outX;w.windZ=wind.outZ;w.windStrength=wind.speed*.9;
      w.bx=w.by=w.bz=0;w.vx=w.vz=0;w.yaw=0;w.dt=1/60;w.time=i/60;w.update();
      if(i<180)continue;
      for(let j=0;j<2;j++){const g=groups[j];let x=0;for(let k=0;k<g.cols;k++)x+=w.cloth.p[(g.start+(g.rows-1)*g.cols+k)*3];x/=g.cols;lo[j]=Math.min(lo[j],x);hi[j]=Math.max(hi[j],x);}
    }
    expect(hi[0]-lo[0]).toBeGreaterThan(.2);expect(hi[1]-lo[1]).toBeGreaterThan(.04);
    for(let i=0;i<w.cloth.n*3;i++)expect(Number.isFinite(w.cloth.p[i])).toBe(true);
  });

  it('hangs correctly after a purely vertical spawn jump (same x/z)', () => {
    const { w, ground } = setup(0);
    for (let i = 0; i < 5; i++) frame(w, -220, 0, 580, 0, 0, 0);
    ground.H = 228.39;
    for (let i = 0; i < 30; i++) frame(w, -220, 228.39, 580, 0, 0, 0);
    const [lo, hi] = range(w, 0);
    expect(lo - 228.39).toBeLessThan(0.15);   // the hem reaches the snow
    expect(hi - 228.39).toBeLessThan(1.5);    // the top sits at the shoulders
    const [mlo] = range(w, 1);
    expect(mlo - 228.39).toBeLessThan(1.0);   // the mantle hangs down the back
  });

  it('stays sane while running and stopping (no NaN, no flipping, bounded stretch)', () => {
    const { w } = setup(0);
    let x = 0;
    for (let i = 0; i < 600; i++) {
      const v = i < 400 ? 5.2 : 0;
      x += v / 60; frame(w, x, 0, 0, v, 0);
      const [lo, hi] = range(w, 0);
      expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
      expect(hi).toBeLessThan(1.6);
    }
    const [lo] = range(w, 0);
    expect(lo).toBeLessThan(0.2);
  });
});
