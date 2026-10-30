import {describe,it,expect} from 'vitest';
import {createSandstormFront,SANDSTORM_SPEED,SANDSTORM_AHEAD,SANDSTORM_HEIGHT} from '../src/world/sandstormFront.js';
const sample=(f,x,y,z)=>{f.qx=x;f.qy=y;f.qz=z;f.sample();return f.density;};
describe('world-anchored storm front geometry',()=>{
  it('stays dormant until explicitly enabled and retains one fixed block',()=>{
    const f=createSandstormFront(),block=f.block;f.target=1;f.dt=1;
    for(let i=0;i<1000;i++)f.update();
    expect(f.block).toBe(block);expect(f.active).toBe(false);expect(sample(f,0,0,0)).toBe(0);
  });
  it('arrives from upwind at a fixed world anchor, with a readable leading face and finite tail',()=>{
    const f=createSandstormFront();f.enabled=true;f.target=1;f.snap=true;f.anchorX=2400;f.anchorZ=900;f.baseY=100;f.update();
    expect(f.plane).toBe(2400-SANDSTORM_AHEAD);expect(sample(f,2400,100,900)).toBe(0);
    expect(sample(f,1000,100,900)).toBe(0);expect(sample(f,-1000,100,900)).toBe(1);
    // Querying from another camera does not move or restart the world plane.
    const plane=f.plane;sample(f,-500,500,700);expect(f.plane).toBe(plane);
    f.dt=1;for(let i=0;i<100;i++)f.update();expect(f.plane).toBe(plane+100*SANDSTORM_SPEED);
    expect(sample(f,2400,100,900)).toBeGreaterThan(.99);
    expect(sample(f,-4000,100,900)).toBe(0);
    expect(sample(f,2400,100+SANDSTORM_HEIGHT,900)).toBeCloseTo(Math.exp(-1),6);
  });
  it('does not turn/reanchor mid-storm, pauses with dt0 and fades out before rearming',()=>{
    const f=createSandstormFront();f.enabled=true;f.target=1;f.dirX=3;f.dirZ=4;f.snap=true;f.update();
    const plane=f.plane,dx=f.block[0],dz=f.block[1];f.anchorX=8000;f.dirX=-1;f.dirZ=0;f.dt=0;f.update();
    expect(f.plane).toBe(plane);expect(f.block[0]).toBe(dx);expect(f.block[1]).toBe(dz);
    f.enabled=false;f.dt=1;for(let i=0;i<120;i++)f.update();expect(f.active).toBe(false);expect(f.strength).toBe(0);
    f.enabled=true;f.snap=true;f.dt=0;f.update();expect(f.block[0]).toBe(-1);expect(f.startPlane).toBe(-8000-SANDSTORM_AHEAD);
  });
  it('bounds density through billows/height and rejects invalid startup inputs',()=>{
    const f=createSandstormFront();f.enabled=true;f.target=2;f.snap=true;f.dirX=NaN;f.dirZ=Infinity;f.anchorX=NaN;f.baseY=Infinity;f.dt=NaN;f.update();
    expect(Array.from(f.block).every(Number.isFinite)).toBe(true);
    for(let x=-8000;x<8000;x+=79)for(let y=-50;y<1200;y+=131){const d=sample(f,x,y,x*.7);expect(d).toBeGreaterThanOrEqual(0);expect(d).toBeLessThanOrEqual(1);}
  });
});
