import {describe,it,expect} from 'vitest';
import {createSandSurfSound} from '../src/audio/sandSurfSound.js';
function fixture(){
 const nodes=[],param=()=>({value:0,setTargetAtTime(v,t,c){this.target=v;this.seconds=c;}});
 const ctx={currentTime:0,createBufferSource(){const n={connect(){},start(){this.started=true;}};nodes.push(n);return n;},
 createBiquadFilter(){const n={Q:param(),frequency:param(),connect(){}};nodes.push(n);return n;},
 createGain(){const n={gain:param(),connect(){}};nodes.push(n);return n;}};
 return {sound:createSandSurfSound(ctx,{},{}),nodes};
}
describe('fixed continuous sand-surf friction sound',()=>{
 it('creates its nodes once and keeps eased targets bounded through sustained updates',()=>{
  const {sound:s,nodes}=fixture();expect(nodes).toHaveLength(6);
  s.active=true;s.speed=32;s.grip=1;
  for(let i=0;i<1000;i++)s.update();
  expect(nodes).toHaveLength(6);expect(s.hissLevel).toBeCloseTo(.12);expect(s.rushLevel).toBeCloseTo(.08);
  expect(nodes[4].gain.seconds).toBeGreaterThan(0);expect(nodes[5].gain.seconds).toBeGreaterThan(0);
  s.speed=1e6;s.grip=1e6;s.update();expect(s.hissLevel).toBeCloseTo(.12);expect(s.rushLevel).toBeCloseTo(.08);
 });
 it('makes speed and carve load audible, darkens wet grain and preserves a quieter wet rush',()=>{
  const {sound:s}=fixture();s.active=true;s.speed=8;s.update();const slow=s.rushLevel,lowHz=s.hissHz;
  s.speed=32;s.update();expect(s.rushLevel).toBeGreaterThan(slow);expect(s.hissHz).toBeGreaterThan(lowHz);
  const straight=s.hissLevel;s.grip=1;s.update();expect(s.hissLevel).toBeGreaterThan(straight);
  const dry=s.rushLevel,dryHz=s.hissHz;s.wet=1;s.update();
  expect(s.hissLevel).toBe(0);expect(s.rushLevel).toBeGreaterThan(0);expect(s.rushLevel).toBeLessThan(dry);expect(s.hissHz).toBeLessThan(dryHz);
 });
 it('fades to silence without contact, below grain speed or on a frozen crust',()=>{
  const {sound:s,nodes}=fixture();s.active=true;s.speed=32;s.frozen=1;s.update();expect(s.hissLevel+s.rushLevel).toBe(0);
  s.frozen=0;s.active=false;s.update();expect(s.hissLevel+s.rushLevel).toBe(0);
  s.active=true;s.speed=0;s.update();expect(s.hissLevel+s.rushLevel).toBe(0);
  expect(nodes[4].gain.seconds).toBe(.09);expect(nodes[5].gain.seconds).toBe(.12);
 });
});
