import { describe,it,expect } from 'vitest';
import { Surf,surfTuning } from '../src/character/surf.js';
import { CapsuleController } from '../src/character/capsuleController.js';
import { sandSurfTuning } from '../src/character/sandSurfTuning.js';
const dt=1/120;
function make(material,unlocked=true){
 const s=new Surf();s.material=material;s.sandUnlocked=unlocked;s.selectSurface();
 s.want=true;s.grounded=true;s.throttle=1;s.engage(0,0,0);return s;
}
function run(s,seconds,ny=1,nz=0){for(let i=0;i<seconds/dt;i++)s.step(dt,0,ny,nz);return s;}
describe('shared sand-surf controller',()=>{
 it('keeps sand locked until explicitly lent/granted and preserves snow access',()=>{
  const snow=make(0,false);expect(snow.active).toBe(true);expect(snow.tuning).toBe(surfTuning);
  for(const material of [1,6]){
   const locked=make(material,false);expect(locked.canSurf).toBe(false);expect(locked.active).toBe(false);
   const lent=make(material,true);expect(lent.active).toBe(true);expect(lent.tuning).toBe(sandSurfTuning);
  }
  for(const material of [2,3,4,5,7,255])expect(make(material).active).toBe(false);
 });
 it('cruises below snow on flat ground but carries more speed down a slip face',()=>{
  const snow=run(make(0),30),sand=run(make(1),30);
  expect(sand.speed).toBeLessThan(snow.speed-2);expect(sand.speed).toBeGreaterThan(12);
  const ny=Math.SQRT1_2,nz=Math.SQRT1_2;
  const snowDown=run(make(0),40,ny,nz),sandDown=run(make(1),40,ny,nz);
  expect(sandDown.speed).toBeGreaterThan(snowDown.speed+3);
  expect(sandDown.speed).toBeLessThanOrEqual(sandSurfTuning.maxSpeed);
 });
 it('loses more speed uphill and has less sideways grip and lean at the same entry speed',()=>{
  const snow=make(0),sand=make(1);snow.speed=sand.speed=20;
  run(snow,5,Math.sqrt(.75),-.5);run(sand,5,Math.sqrt(.75),-.5);
  expect(sand.speed).toBeLessThan(snow.speed);
  const a=make(0),b=make(1);a.speed=b.speed=20;a.steer=b.steer=1;
  run(a,.5);run(b,.5);
  expect(Math.abs(b.latAccel)).toBeLessThan(Math.abs(a.latAccel));
  expect(Math.abs(b.lean)).toBeLessThan(Math.abs(a.lean));
  expect(Math.abs(b.lean)).toBeLessThanOrEqual(sandSurfTuning.maxLean);
 });
 it('eases a fast sand-to-snow handoff instead of snapping to the lower speed cap',()=>{
  const s=make(1);s.speed=31;run(s,2,Math.SQRT1_2,Math.SQRT1_2);const before=s.speed;
  s.material=0;s.selectSurface();s.engage(s.vx,s.vz,s.heading);s.step(dt,0,1,0);
  expect(s.active).toBe(true);expect(s.speed).toBeGreaterThan(surfTuning.maxSpeed);
  expect(before-s.speed).toBeLessThan(.1);run(s,10);
  expect(s.speed).toBeLessThanOrEqual(surfTuning.maxSpeed);
 });
 it('carries glide momentum through the real capsule landing instead of restoring stale surf speed',()=>{
  const ground={qx:0,qz:0,h:0,nx:0,ny:1,nz:0,sample(){this.h=0;},sampleNormal(){this.nx=0;this.ny=1;this.nz=0;}};
  const c=new CapsuleController(ground);c.teleport(0,0);c.pos.y=.005;c.grounded=false;c.vel.y=-2;c.vel.z=30;
  c.surf.want=true;c.surf.canSurf=true;c.surf.active=true;c.surf.speed=15;c.surf.heading=0;
  c.glide.want=true;c.glide.active=true;c.glide.speed=30;c.glide.heading=0;c.glide.vy=-2;
  c.dt=1/60;c.update();
  expect(c.grounded).toBe(true);expect(c.glide.active).toBe(false);expect(c.surf.active).toBe(true);
  expect(Math.hypot(c.vel.x,c.vel.z)).toBeGreaterThan(29);
 });
 it('brakes out smoothly on an unsupported surface without switching controllers',()=>{
  const s=run(make(1),10),same=s;const before=s.speed;
  s.material=2;s.selectSurface();s.engage(s.vx,s.vz,s.heading);s.step(dt,0,1,0);
  expect(s).toBe(same);expect(s.exiting).toBe(true);expect(before-s.speed).toBeLessThan(.2);
  run(s,5);expect(s.active).toBe(false);expect(s.blend).toBeLessThan(.01);
 });
});
