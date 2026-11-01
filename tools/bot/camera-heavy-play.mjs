#!/usr/bin/env node
// F in play: each element's Heavy pressed twice while fighting, running, jumping, gliding, surfing and locked on.
// After each press the camera is measured: does it still answer the mouse, and does its view match the arm?
//   tools/bot/play.sh "" "^&gale=1^&stone=1"   then   node tools/bot/camera-heavy-play.mjs [x z]
import { bot, js } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [x = 1900, z = 900] = process.argv.slice(2).map(Number);
const CASES = {
  still: [], run: ['MoveForward'], jump: ['Jump'], 'run+jump': ['MoveForward', 'Jump'], glide: ['MoveForward', 'Jump', 'Traverse'], surf: ['MoveForward', 'Traverse'], lock: [],
};
for (const enemies of process.env.FIGHT ? [true] : [false, true]) for (const [name, keys] of Object.entries(CASES)) for (const el of ['frost', 'gale', 'stone']) {
  await bot('teleport', { x, z });
  for (let i = 0; i < 30; i++) { await sleep(300); if (await js('return g.game.worldSettled()&&g.controller.grounded')) break; }
  const r = await js(`const frame=()=>new Promise(r=>requestAnimationFrame(r));const wait=async n=>{for(let i=0;i<n;i++)await frame()};
    const a=g.arm,c=g.camera,inp=g.input,KEYS=${JSON.stringify(keys)},p=g.controller.pos;
    g.elements.select(${JSON.stringify(el)});g.combat.focus=100;g.combat.health=g.combat.maxHealth;g.combat.lock=-1;
    if(${enemies})for(const k of [0,1,2])g.shaped.spawn('skitter',p.x+Math.sin(k*2+a.yaw)*7,p.z+Math.cos(k*2+a.yaw)*7);
    await wait(${enemies}?170:10);
    g.combat.focus=100;if(${JSON.stringify(name)}==='lock'){w.inject('LockOn',true);await frame();await frame();w.inject('LockOn',false);await wait(10);}
    /** Mouse answer: pixels fed for 12 frames against the yaw moved (a share of what the mouse should give). */
    const mouse=async()=>{const y0=a.yaw;for(let i=0;i<12;i++){inp.mouseDX+=8;await frame();}const got=a.yaw-y0;for(let i=0;i<12;i++){inp.mouseDX-=8;await frame();}return +(got/(12*8*0.0022)).toFixed(2);};
    const view=()=>{const m=c.getViewMatrix().m,e=Math.abs(Math.atan2(m[2],m[10])-a.yaw);return +Math.min(e%(2*Math.PI),2*Math.PI-e%(2*Math.PI)).toFixed(3);};
    const state=()=>({mouse:0,view:view(),roll:+a.roll.toFixed(2),len:+a.armLen.toFixed(1),free:a.free,lock:g.combat.lock,surf:g.controller.surf.active,glide:g.controller.glide.active,hold:g.controller.hold,scripted:g.controller.scripted});
    const press=async()=>{w.inject('Heavy',true);await frame();await frame();w.inject('Heavy',false);};
    for(const k of KEYS)w.inject(k,true);
    await wait(25);
    const out={};
    let s=state();s.mouse=await mouse();out.before=s;
    await press();await wait(20);s=state();s.mouse=await mouse();out.first=s;
    await press();await wait(20);s=state();s.mouse=await mouse();out.second=s;
    for(const k of KEYS)w.inject(k,false);
    if(g.combat.lock>=0)g.combat.lock=-1;
    for(let i=0;i<8;i++)if(g.shaped.isLive(i))g.shaped.damage(i,1e6,true,0,0);
    return out;`);
  const f = (s) => `mouse ${s.mouse} view ${s.view} roll ${s.roll} len ${s.len} ${['free', 'surf', 'glide', 'hold', 'scripted'].filter((k) => s[k]).join(',')}${s.lock >= 0 ? ' LOCK' : ''}`;
  console.log(`${enemies ? 'fight' : 'empty'} ${name.padEnd(8)} ${el.padEnd(5)} | ${f(r.before)} | ${f(r.first)} | ${f(r.second)}`);
}
