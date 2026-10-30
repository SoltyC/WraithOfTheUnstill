import { describe,it,expect } from 'vitest';
import { createShaped,S,MAX_SHAPED } from '../src/game/shaped/shaped.js';
import { createStoneHits } from '../src/game/combat/stoneHits.js';
import { combatTuning } from '../src/game/combat/combat.js';
import { world,target } from './weaponWorld.js';
function setup(){
  const ts={count:0,stamp(){this.count++;}},ground={qx:0,qz:0,h:0,sample(){this.h=0;}},fx={emit(){}};
  const shaped=createShaped({ts,ground,fx});shaped.px=0;shaped.pz=9;shaped.pvx=0;shaped.pvz=0;
  const step=n=>{for(let k=0;k<n;k++){shaped.dt=1/60;shaped.time+=shaped.dt;shaped.update();}};
  return {shaped,step,ts};
}
describe('Whirler and Glass-sworn material answers',()=>{
  it('frozen glass accepts Shard after rejecting the same real hit while warm',()=>{
    const {shaped,step}=setup(),i=shaped.spawn('glasssworn',0,0);step(100);const s=shaped.slots[i],b=s.body;
    const stone={shardOn:[1],shardPhase:[1],shardId:[1],shardX:[b.sx[1]],shardY:[b.sy[1]],shardZ:[b.sz[1]],shardWet:[0],shardDmg:[1],shardDX:[0],shardDZ:[1],shardHit(){this.hits++;},hits:0,bloomEvent:false,mass:{count:0}};
    const h=createStoneHits({shaped,stone,strike(i,d,dx,dz,heavy){shaped.damage(i,d,heavy,dx,dz);},flow:null,FLOW_EVENT:{},tuning:combatTuning,maxShaped:8});
    const hp=s.hp;h.hit(i,b.sx[1],b.sz[1],1/60);expect(s.hp).toBe(hp);expect(stone.hits).toBe(1);
    shaped.freeze(i,3);stone.shardId[0]++;h.hit(i,b.sx[1],b.sz[1],1/60);expect(s.hp).toBe(hp-combatTuning.shardDamage);expect(stone.hits).toBe(2);
  });
  it('starting Frost plus staff reaches the glass body and can shatter it',()=>{
    const w=world(),i=target(w,'glasssworn'),s=w.shaped.slots[i];
    const hp=s.hp;w.weapons.strike(i,w.weapons.def.combo[0],0,1,1);const warm=hp-s.hp;
    w.shaped.freeze(i,3);w.weapons.onStart();const hp1=s.hp;w.weapons.strike(i,w.weapons.def.combo[0],0,1,1);expect(hp1-s.hp).toBeGreaterThan(warm*2);
    for(let k=0;k<12&&w.shaped.isLive(i);k++){w.weapons.onStart();w.weapons.strike(i,w.weapons.def.combo[0],0,1,1);}
    expect(s.state).toBe(S.FALLING);expect(w.shaped.shattered).toBeGreaterThan(0);
  });
  it('starting staff also damages an existing frozen armoured den mother',()=>{
    const w=world(),i=target(w,'denmother');w.shaped.freeze(i,3);const hp=w.shaped.slots[i].hp;w.weapons.strike(i,w.weapons.def.combo[0],0,1,1);expect(w.shaped.slots[i].hp).toBeLessThan(hp);
  });
  it('holds a frozen spiral still, cancels its warning, and hands posed chunks to shatter debris',()=>{
    const {shaped,step}=setup(),i=shaped.spawn('whirler',0,0);step(120);const s=shaped.slots[i];
    s.state=S.TELEGRAPH;s.t=.3;step(1);shaped.freeze(i,3);step(1);const spin=s.spin;step(20);expect(s.spin).toBe(spin);expect(s.state).toBe(S.FROZEN);
    const o=i*96*16,xyz=Array.from(shaped.chunks.slice(o,o+3));shaped.damage(i,1e9,true,0,0);expect(Array.from(s.st.dx).every(Number.isFinite)).toBe(true);
    expect([s.st.dx[0],s.st.dy[0],s.st.dz[0]]).toEqual(xyz);expect(s.state).toBe(S.FALLING);
    const width=shaped.chunks[(i*96+8)*16+3];step(1);expect(shaped.chunks[(i*96+8)*16+3]).toBeCloseTo(width,5);expect(shaped.chunks[(i*96+8)*16+14]).toBe(2);
  });
  it('a real combat Vortex reverses and pins the Whirler without requiring a kill',()=>{
    const w=world('staff',{},null,{gale:true}),i=target(w,'whirler',5),s=w.shaped.slots[i];
    s.spin=10;w.gale.x=0;w.gale.z=0;w.gale.tx=s.body.sx[1];w.gale.tz=s.body.sz[1];w.gale.ty=0;w.gale.vortexHeld=true;w.gale.dt=1/60;for(let k=0;k<60;k++)w.gale.update();
    w.combat.dt=1/60;w.shaped.dt=1/60;w.combat.update();expect(s.reverse).toBeGreaterThan(0);expect(s.spin).toBeLessThan(10);expect(w.shaped.isPinned(i)).toBe(true);
  });
  it('eight mixed bodies stay bounded and finite through volleys, devils, freeze and collapse',()=>{
    const {shaped,step,ts}=setup();for(let i=0;i<MAX_SHAPED;i++)shaped.spawn(i%2?'glasssworn':'whirler',(i%4-1.5)*4,-Math.floor(i/4)*5);
    expect(shaped.spawn('whirler',0,0)).toBe(-1);const buffer=shaped.chunks;step(900);
    expect(shaped.chunks).toBe(buffer);expect(Array.from(buffer).every(Number.isFinite)).toBe(true);expect(ts.count).toBeGreaterThan(30);
    for(let i=0;i<8;i++){shaped.freeze(i,3);shaped.damage(i,1e9,true,0,0);}step(250);
    expect(shaped.alive).toBe(0);expect(Array.from(buffer).every(Number.isFinite)).toBe(true);
  });
  it('freezing the caster clears its active devil dust and a dodge avoids the sand veil',()=>{
    const {shaped,step}=setup(),i=shaped.spawn('whirler',0,0);step(120);const s=shaped.slots[i];s.state=S.TELEGRAPH;s.t=1.1;step(2);
    expect(shaped.whirls[8*8+3]).toBeGreaterThan(0);shaped.freeze(i,3);step(1);expect(shaped.whirls[3]).toBe(0);expect(shaped.whirls[8*8+3]).toBe(0);
    shaped.pdodging=true;shaped.pz=0;shaped.sx=0;shaped.sy=1;shaped.sz=1;shaped.tx=0;shaped.ty=1;shaped.tz=0;shaped.shotSpeed=10;shaped.shotDmg=8;shaped.shotKind=11;shaped.shoot();step(6);expect(shaped.blind).toBe(0);
  });
  it('a sand blast leaves a dust cloud that veils only while the Wraith stands in it; the shared shot stays ice',()=>{
    const {shaped,step}=setup();shaped.pz=0;shaped.sx=0;shaped.sy=1;shaped.sz=1;shaped.tx=0;shaped.ty=1;shaped.tz=0;shaped.shotSpeed=10;shaped.shotDmg=8;shaped.shotKind=11;shaped.shoot();
    expect(shaped.shotKind).toBe(1);step(12);expect(shaped.blind).toBeGreaterThan(.5);
    shaped.px=4;step(2);expect(shaped.blind).toBe(0);          // stepped out of the cloud: clear air
    shaped.px=0;step(2);expect(shaped.blind).toBeGreaterThan(.5);  // back in, still hanging
    step(240);expect(shaped.blind).toBe(0);                    // settled after ~3.5 s
  });
});
