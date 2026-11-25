#!/usr/bin/env node
// The Ember's eruption on film (docs/phase-11/ember-design.md §7; the destruction system): fixed-step frames at 60 fps
// (src/core/bot.js film mode: every frame exactly 1/60 s of game time, whatever the live frame rate), encoded with ffmpeg.
//   node tools/bot/eruption-film.mjs [scene,scene,...]      scenes: crater, wide, farm, cinderhold, chapel
// Needs `npm run preview` on :4173. Writes screenshots/ember-film/<scene>.mp4.
import fs from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import { bot, js } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FFMPEG = '/mnt/c/ffmpeg/bin/ffmpeg.exe', win = (p) => execSync(`wslpath -w "${p}"`).toString().trim();
const SIZE = [1920, 1080], FPS = 60;
// (Camera helpers inside the page: the ground under a point; an eased 0..1.)
const H = `const gy=(x,z)=>{const G=g.ground;G.qx=x;G.qz=z;if(G.covers()){G.sample();return G.h;}const O=g.streamer.overview,u=(x+4096)/8-0.5,v=(4096-z)/8-0.5,i=Math.floor(u),j=Math.floor(v);return O[j*1024+i]/32-128;};const ease=(u)=>u<0?0:u>1?1:u*u*(3-2*u);`;

const SCENES = {
  // The lava lake at night, from the ledge: over the Wraith's shoulder, out over the lip, down onto the crust.
  crater: { spot: 'e1-crater', hour: 21.4, seconds: 16, setup: `g.volcano.forceStage=4;`,
    cam: `const u=ease(t/16),dx=0.71,dz=0.70,L=[2286,-2214],y0=gy(L[0],L[1]);
      const x=L[0]+dx*(-8+26*u),z=L[1]+dz*(-8+26*u),y=y0+3+5*u;
      cam.at(x,y,z,2350+dx*(4+14*u),727+1,-2150+dz*(4+14*u),0.8-0.08*u);` },
  // The Ember Warden holding (systems/emberWarden.js), at Fire: from the bench, round it and in.
  'warden-hold': { spot: 'e1-crater', hour: 16.5, seconds: +(process.env.SECS || 16), setup: `g.chapter.graph.flags.add('ember:warned');g.chapter.graph.vars['ember:day']=3;g.volcano.forceStage=4;`,
    cam: `const u=ease(t/16),a=-2.36+${+(process.env.CA||0.5)}-1.0*u,r=${+(process.env.CR||104)}-30*u,x=2350+Math.cos(a)*r,z=-2150+Math.sin(a)*r,y=Math.max(gy(x,z),g.volcano.level)+8+6*u;cam.at(x,y,z,2321.7,g.volcano.level+16,-2178.2,0.95);` },
  // The Ember Warden from the rim above the bench, looking down into the crater (the crater scene's establishing shot).
  'warden-rim': { spot: 'e1-crater', hour: 16.5, seconds: +(process.env.SECS || 10), setup: `g.chapter.graph.flags.add('ember:warned');g.chapter.graph.vars['ember:day']=3;g.volcano.forceStage=4;`,
    cam: `const u=ease(t/10),a=-2.36+0.35-0.5*u,r=175,x=2350+Math.cos(a)*r,z=-2150+Math.sin(a)*r,y=g.volcano.level+75;cam.at(x,y,z,2326,g.volcano.level+12,-2174,0.75);` },
  // The Ember Warden, three-quarters from the front at its chest's height (a look at the whole figure).
  'warden-34': { spot: 'e1-crater', hour: 16.5, seconds: +(process.env.SECS || 10), setup: `g.chapter.graph.flags.add('ember:warned');g.chapter.graph.vars['ember:day']=3;g.volcano.forceStage=4;`,
    cam: `const u=ease(t/10),a=-2.36+${+(process.env.CA||0.7)}-0.2*u,r=${+(process.env.CR||150)},x=2350+Math.cos(a)*r,z=-2150+Math.sin(a)*r,y=g.volcano.level+${+(process.env.CY||30)};cam.at(x,y,z,2321,g.volcano.level+22,-2176,0.62);` },
  // The Ember Warden's fight, played (systems/emberWarden.js): the Wraith on the bench runs from a rising fist between two
  // places, and casts Crystallize at a resting fist in its dark beat; the camera behind it and above, toward the titan.
  'warden-fight': { spot: 'e1-crater', hour: 15, seconds: +(process.env.SECS || 70),
    setup: `const F=g.chapter.graph.flags;F.add('ember:warned');F.add('ember:scene-played');g.chapter.graph.vars['ember:erupt-t']=60;g.chapter.graph.vars['ember:day']=4;g.elements?.select?.('frost');`,
    cam: `const W=w._wf||(w._wf={goal:0,cast:0,cx:NaN,stage:0,wp:null,k:0,iT:0});const F=g.emberWarden.fight,p=g.controller.pos,T=g.emberWarden.titan;
      const spot=(k)=>{const a=-2.36+(k?0.12:0);return [2350+Math.cos(a)*104,-2150+Math.sin(a)*104];};
      const go=(x,z,arrive)=>{const d=Math.hypot(x-p.x,z-p.z);if(d>arrive){g.arm.yaw=Math.atan2(x-p.x,z-p.z);inject('MoveForward',true);return false;}inject('MoveForward',false);return true;};
      if(W.stage===0&&F.phase===3){W.stage=1;const B=T.bones,H=B.H[1],Wr=B.W[1],dx=H[0]-Wr[0],dz=H[2]-Wr[2],l=Math.hypot(dx,dz)||1,px=-dz/l,pz=dx/l;
        const sd=((p.x-H[0])*px+(p.z-H[2])*pz)>0?1:-1;W.wp=[[H[0]+px*sd*11,H[2]+pz*sd*11],[H[0]+px*sd*2,H[2]+pz*sd*2]];
        const chain=[H,Wr,B.E[1],B.S[1],B.P[3]];for(let c=0;c<chain.length-1;c++)for(let u=0.2;u<=1.001;u+=0.2)W.wp.push([chain[c][0]+(chain[c+1][0]-chain[c][0])*u,chain[c][2]+(chain[c+1][2]-chain[c][2])*u]);}
      if(W.stage===0){
        for(const a of F.arms){if(a.state===1&&Math.hypot(a.mark[0]-p.x,a.mark[2]-p.z)<14){const o=spot(W.goal);if(Math.hypot(o[0]-p.x,o[1]-p.z)<6)W.goal=1-W.goal;}}
        const G=spot(W.goal);
        if(go(G[0],G[1],1.5)){W.cast-=1/30;for(const a of F.arms){const h=a.hand,d=Math.hypot(h[0]-p.x,h[2]-p.z);if(a.state===3&&a.heat<0.33&&d>6&&d<26&&W.cast<=0){g.arm.yaw=Math.atan2(h[0]-p.x,h[2]-p.z);g.arm.pitch=-0.25;g.frost.castCrystal=true;W.cast=1.3;}}}
      }else if(W.stage===1){const q=W.wp[W.k];if(go(q[0],q[1],1.3)){W.k++;if(W.k>=W.wp.length){W.stage=2;}}}
      else if(W.stage===2){W.iT++;inject('Interact',W.iT%6<3);if(F.phase===4){inject('Interact',false);W.stage=3;}}
      if(g.scenes?.busy)return;
      const ty=Math.atan2(T.x-p.x,T.z-p.z),far=W.stage>=1?13:24,bx=p.x-Math.sin(ty)*far+Math.cos(ty)*(W.stage>=1?5:9),bz=p.z-Math.cos(ty)*far-Math.sin(ty)*(W.stage>=1?5:9),by=p.y+(W.stage>=1?7:11);
      if(isNaN(W.cx)){W.cx=bx;W.cy=by;W.cz=bz;}W.cx+=(bx-W.cx)*0.05;W.cy+=(by-W.cy)*0.05;W.cz+=(bz-W.cz)*0.05;
      cam.at(W.cx,W.cy,W.cz,p.x+(T.x-p.x)*0.45,p.y+(W.stage>=1?6:14),p.z+(T.z-p.z)*0.45,0.95);` },
  // The Ember Warden released (its scene, game/emberScenes.js wardenLetsGo): both arms bound, the fire given back.
  'warden-release': { spot: 'e1-crater', hour: 15, seconds: +(process.env.SECS || 26),
    setup: `const F=g.chapter.graph.flags;F.add('ember:warned');F.add('ember:scene-played');F.add('ember:scene:crater');g.chapter.graph.vars['ember:erupt-t']=60;g.chapter.graph.vars['ember:day']=4;
      const W=g.emberWarden;setTimeout(()=>{const Fi=W.fight;if(Fi.phase===0)Fi.wake();for(const a of Fi.arms){a.state=6;a.bound=1;}Fi.phase=3;Fi.clear();setTimeout(()=>g.interactables.find(t=>t.id==='ember-warden-heart').onUse(),3000);},1500);`,
    cam: '' },
  // Ember's verbs (systems/emberBending.js) on the steppe's snow: three Flares, a Stream swept across, a Fuse; then on the
  // dunes' sand (EMBER_SPOT=dunes) the Fuse's glass.
  'ember-verbs': { spot: 'e1-chapel', tp: process.env.EMBER_SPOT === 'dunes' ? [2440, 1140] : process.env.EMBER_SPOT === 'ash' ? [1700, -2300] : [100, 1740], hour: 15.5, seconds: +(process.env.SECS || 14),
    setup: `g.elements.unlock('ember');g.elements.select('ember');w._ev={t0:-1};`,
    cam: `const p=g.controller.pos;const E=w._ev;const tt=t;
      const tap=(at)=>{if(Math.abs(tt-at)<0.02)inject('Bend',true);if(Math.abs(tt-at-0.08)<0.02)inject('Bend',false);};
      tap(0.5);tap(1.7);tap(2.9);
      if(tt>4&&tt<7.5){inject('Bend',true);g.arm.yaw=-1.2+0.5*Math.sin((tt-4)*0.9);}else if(tt>=7.5&&tt<7.6)inject('Bend',false);
      if(Math.abs(tt-9)<0.02)inject('Heavy',true);if(Math.abs(tt-9.1)<0.02)inject('Heavy',false);
      if(Math.abs(tt-11.2)<0.02)inject('Heavy',true);if(Math.abs(tt-11.3)<0.02)inject('Heavy',false);
      if(tt<4)g.arm.yaw=-1.2;
      const fy=g.arm.yaw,sx=Math.sin(fy),sz=Math.cos(fy);
      cam.at(p.x-sz*9-sx*4,p.y+4.5,p.z+sx*9-sz*4,p.x+sx*6,p.y+0.5,p.z+sz*6,0.9);` },
  // The crater scene (game/emberScenes.js craterLooksIn): the Wraith comes to the rim at Breathing; the scene plays on its own.
  'warden-crater': { tp: [2276, -2223], hour: 16, seconds: +(process.env.SECS || 24), setup: `g.chapter.graph.flags.add('ember:warned');g.chapter.graph.vars['ember:day']=1;`, cam: '' },
  // The restored Waste (the Ember Warden released): the crust's seams breathing round the crater, embers on the wind.
  'waste-restored': { tp: [2200, -2120], hour: +(process.env.HOUR || 18.8), seconds: +(process.env.SECS || 14), setup: `g.ws.restoration.ember='restored';g.chapter.graph.flags.add('ember:warned');`,
    cam: process.env.VIEW === 'crater' ? `const y=g.volcano.level;cam.at(2350+150,y+130,-2150+60,2350,y,-2150,0.8);` : `const p=g.controller.pos,u=ease(t/14),a=-2.6+0.5*u;cam.at(p.x+Math.cos(a)*9,p.y+2.2,p.z+Math.sin(a)*9,p.x+Math.cos(a)*-60,p.y-6,p.z+Math.sin(a)*-60,0.9);` },
  // A look from above (LOOK=x,z,height): the ground round a place, for laying out a site.
  'look': { spot: 'e1-chapel', tp: (process.env.LOOK || '1450,1050').split(',').slice(0, 2).map(Number), hour: 11, seconds: 2,
    cam: `const L=[${process.env.LOOK || '1450,1050,260'}];const y=gy(L[0],L[1]);cam.at(L[0]+1,y+L[2],L[1]+L[2]*0.35,L[0],y,L[1],0.9);` },
  // The glass-readers' camp under the Sun Gate (docs/phase-9/dunes-choice.md), at eye height.
  'gate-camp': { spot: 'e1-chapel', tp: [1490, 1010], hour: 9.5, seconds: 3,
    cam: `const c=[1496,992],x=c[0]+14,z=c[1]+16,y=gy(x,z)+3.2;cam.at(x,y,z,c[0],gy(c[0],c[1])+1.4,c[1],0.85);` },
  // The Long Walker brought home to the Sun Gate (docs/phase-9/dunes-choice.md): it walks in, kneels by the cistern on the
  // rim, lies down (its own release camera from then on).
  'walker-gate': { spot: 'p9-walker-walk', hour: 17.6, seconds: +(process.env.SECS || 50), cam: '',
    setup: `g.requestTeleport(1700,1060);setTimeout(()=>{g.controller.god=true;const W=g.walker;W.placeWalking(1760,1000,-Math.PI/2);W.mode=1;W.targetYaw=-Math.PI/2;
      const iv=setInterval(()=>{if(W.state===7){clearInterval(iv);setTimeout(()=>g.walkerHome.release(),4000);}},500);},6000);` },
  // The mountain breaks: from the plain to the south-west at dusk, a time-lapse of the first minutes.
  wide: { tp: [1330, -2470], hour: 18.6, seconds: 26, setup: `g.chapter.graph.flags.add('ember:warned');g.chapter.graph.vars['ember:day']=4;`, rate: 5,
    cam: `const u=t/26,x=1300+70*u,z=-2470+40*u,y=gy(x,z)+190-30*u;cam.at(x,y,z,2330,780+40*u,-2170,0.58);` },
  // The village that stayed (game/emberScenes.js): the Wraith far off on the south flank; the lava comes for Gwil's farm
  // and the scene cuts to them on its own (the director drives the camera: no cam script).
  stayed: { tp: [1330, -2470], hour: 15, seconds: 56, at: 272, rate: 1, prepare: ['sow-gwil-farm'], cam: '' },
  // The same, after the lie was found out (another family lied to and gone): they stand at their door already watching it.
  'stayed-lie': { tp: [1330, -2470], hour: 15, seconds: 30, at: 272, rate: 1, prepare: ['sow-gwil-farm'], cam: '',
    setup: `const F=g.chapter.graph.flags;F.add('ember:lied');F.add('ember:ffion-lied');F.add('ember:lie-found');` },
  // The Fire stage (the day before): the valley and the mountain as the eruption's lava and bombs are made, unseen.
  'fire-stage': { tp: [1000, -1640], hour: 13, seconds: 24, setup: `g.chapter.graph.flags.add('ember:warned');g.chapter.graph.vars['ember:day']=3;`,
    cam: `const u=t/24,x=1040-60*u,z=-1620,y=gy(x,z)+22;cam.at(x,y,z,2350,900,-2150,0.8);` },
  // After: the Sow under the ash, the flows cooled black, the trees grey, the mountain still smoking (the day after).
  after: { tp: [1000, -1640], hour: 10.5, seconds: 24,
    setup: `const F=g.chapter.graph.flags;F.add('ember:warned');F.add('ember:erupted');g.chapter.graph.vars['ember:day']=5;`,
    cam: `const u=ease(t/24),x=1040-120*u,z=-1620-60*u,y=gy(x,z)+22+8*u;cam.at(x,y,z,2350,900,-2150,0.8);` },
  // The village that left, watching (game/emberScenes.js villageWatched): Gwil's family got out and are at the camp; the
  // lava comes for their farm and the scene cuts to them at the headland (the director drives the camera).
  watched: { tp: [1330, -2470], hour: 15, seconds: 44, at: 280, rate: 1, prepare: ['sow-gwil-farm'], cam: '',
    setup: `const F=g.chapter.graph.flags;F.add('ember:gwil-go');for(const n of g.npcs)if(/^ember-(gwil|sian)$/.test(n.id)){n.x=724+Math.random()*4;n.z=-2632+Math.random()*4;n.hide=false;}` },
  // The Cinder Shrine, still (no scene: the warning already given).
  'shrine': { tp: [990, -1300], hour: 15, seconds: 2, setup: "g.chapter.graph.flags.add('ember:scene:warning');", cam: `const x=990-14,z=-1322+18,y=gy(x,z)+5;cam.at(x,y,z,990,gy(990,-1322)+1,-1322,0.95);` },
  // The warning (game/emberScenes.js warningArrives): the Wraith reaches the Cinder Shrine; Cole comes down the mountain.
  'warning': { tp: [1000, -1290], hour: 15, seconds: 26, cam: '' },
  // The camp on the coast (game/emberScenes.js campCount): after it, at dusk; some lost (Gwil's, two masters, one of the faithful).
  'camp-count': { tp: [700, -2600], hour: 18, seconds: 56, cam: '',
    setup: `const F=g.chapter.graph.flags;for(const f of ['ember:erupted','ember:after','ember:aled-go','ember:huw-go','ember:ffion-go','ember:mari-go','ember:fled-cinderhold','ember:lost-cinderhold','ember:fled-chapel','ember:lost-chapel'])F.add(f);
      const dead=/^ember-(gwil|sian|orrin|vell|brannoc)$/, at=/^ember-(aled|nia|huw|elin|ffion|dai|mari|rhys|teg|bron|wyn|ifor|gethin|annick|edda|corwen|lio|ysolt)$/;
      for(const n of g.npcs){if(dead.test(n.id)){n.dead=true;n.hide=true;F.add('ember:dead:'+n.id);}else if(at.test(n.id)){n.x=705+Math.random()*30;n.z=-2660+Math.random()*30;n.hide=false;}}` },
  // Cinderhold that went (the guild's vote): its people at the headland camp watching the winding tower go.
  'cinder-watched': { tp: [1330, -2470], hour: 15, seconds: 54, at: 35, rate: 1, prepare: ['cin-town'], cam: '',
    setup: `for(const n of g.npcs)if(/^ember-(orrin|teg|vell|bron|wyn|ifor|gethin)$/.test(n.id)){n.x=722+Math.random()*6;n.z=-2634+Math.random()*6;n.hide=false;}` },
  // The Ash Chapel that stayed (game/emberScenes.js chapelStayed): the faithful before the door as the cloud comes.
  'chapel-stayed': { tp: [1330, -2470], hour: 15, seconds: 64, at: 5, rate: 1, prepare: ['ash-chapel'], cam: '' },
  // The Ash Chapel that went: the faithful at the camp watching the cloud take it.
  'chapel-watched': { tp: [1330, -2470], hour: 15, seconds: 60, at: 5, rate: 1, prepare: ['ash-chapel'], cam: '',
    setup: `for(const n of g.npcs)if(/^ember-(annick|edda|corwen|lio|ysolt|brannoc)$/.test(n.id)){n.x=722+Math.random()*6;n.z=-2634+Math.random()*6;n.hide=false;}` },
  // Cinderhold that stayed (game/emberScenes.js townStayed): the Wraith far off; the guild gathers at its hall; the town goes.
  // Cinderhold's guild hall from the yard, before anything (a still look at its front).
  'cinder-hall': { tp: [1877, -1995], hour: 15, seconds: 3, setup: process.env.NOARCH ? "for(const s of g.archSites)if(s.id==='cin-town')s.hidden=true;" : '', cam: `const x=1877-6,z=-1980.8-14,y=gy(x,z)+3;cam.at(x,y,z,1877,gy(1877,-1980.8)+2,-1980.8,0.9);` },
  'cinder-stayed': { tp: [1330, -2470], hour: 15, seconds: 66, at: 30, rate: 1, prepare: ['cin-town'], cam: '' },
  // The survivors' camp on the headland: every group got out (the Sow's six, Cinderhold, the chapel); in along the road at dusk.
  camp: { tp: [690, -2650], hour: 16.6, seconds: 26,
    setup: `const F=g.chapter.graph.flags;for(const id of ['aled','bethan','huw','ffion','gwil','mari'])F.add('ember:'+id+'-go');F.add('ember:fled-cinderhold');F.add('ember:fled-chapel');F.add('ember:after');F.add('ember:erupted');g.chapter.graph.vars['ember:day']=5;`,
    cam: `const u=ease(t/26),x=662+28*u,z=-2662+6*u,y=gy(x,z)+14-10*u;cam.at(x,y,z,770,gy(770,-2632)+3+6*(1-u),-2632,0.8);` },
  // The blast and the bombs: from the south-west flank, the summit going up and the rock coming down round the camera.
  bombs: { tp: [2060, -2590], hour: 17.8, seconds: 28, setup: `g.chapter.graph.flags.add('ember:warned');g.chapter.graph.vars['ember:day']=4;`, rate: 1,
    cam: `const u=ease(t/28),x=2050+25*u,z=-2600+20*u,y=gy(x,z)+55+25*u;cam.at(x,y,z,2330,800+120*u,-2180,0.85);` },
  // Gwil's farm as the lava comes: the tower goes over in the dark at noon.
  farm: { tp: [700, -2150], hour: 13, seconds: 30, at: 296, rate: 1, prepare: ['sow-gwil-farm', 'sow-gwil-door', 'sow-gwil-cart', 'sow-gwil-load', 'sow-gwil-bundles'],
    cam: `const u=ease(t/30),x=698+10*u,z=-2152+6*u,y=gy(x,z)+5+3*u;cam.at(x,y,z,734,gy(734,-2110)+6,-2108,0.82);` },
  // Cinderhold: the flow comes down into the town; the engine tower and the bell tower go.
  cinderhold: { tp: [1945, -2075], hour: 12.5, seconds: 28, at: 100, rate: 1, prepare: ['cin-town', 'cin-cage'],
    cam: `const u=ease(t/28),x=1948-8*u,z=-2082+6*u,y=gy(x,z)+13-2*u;cam.at(x,y,z,1935,gy(1935,-2030)+9,-2028,0.95);` },
  // The Ash Chapel: the bell rings on its own; the surge comes over the rim; the faithful are kept by the ash.
  chapel: { tp: [2160, -2340], hour: 11, seconds: 34, at: 24, rate: 1, prepare: ['ash-chapel'],
    cam: `const u=ease(t/34),x=2158+6*u,z=-2346+5*u,y=gy(2170,-2330)+11-3*u;cam.at(x,y,z,2186,gy(2186,-2320)+4,-2318,0.95);` },
};

const want = (process.argv[2] || Object.keys(SCENES).join(',')).split(',');
fs.mkdirSync('screenshots/ember-film', { recursive: true });
for (const name of want) {
  const S = SCENES[name];
  // (A fresh frames folder: a shorter take than the last would otherwise keep the old take's tail.)
  fs.rmSync(`screenshots/ember-film/frames/${name}`, { recursive: true, force: true });
  execSync(`tools/bot/play.sh ${S.spot || 'e1-chapel'} "^&gfx=high"`, { stdio: 'inherit' });
  await sleep(6000);
  if (S.spot) await bot('spot', { id: S.spot });
  await js(`g.params.v.timeOfDay=${S.hour};g.params.version++;g.params.v.dynamicRes=0;return 1`);
  if (S.tp) { await js(`g.requestTeleport(${S.tp[0]},${S.tp[1]});return 1`); for (let i = 0; i < 40; i++) { await sleep(500); if (await js(`return !g.controller.hold`)) break; } await sleep(4000); }
  if (S.prepare) { await js(`${S.prepare.map((id) => `g.destruction.prepare('${id}');`).join('')}return 1`); await sleep(6000); }
  if (S.at !== undefined) {
    await js(`g.chapter.graph.flags.add('ember:warned');g.chapter.graph.vars['ember:erupt-t']=${S.at};g.chapter.graph.vars['ember:day']=4;return 1`);
    await sleep(300);
  }
  if (S.setup) await js(`${S.setup}return 1`);
  if (S.rate) await js(`if(g.eruption)g.eruption.rate=${S.rate};return 1`);
  const r = await bot('film', { name, dir: 'ember-film', seconds: S.seconds, fps: FPS, size: SIZE, quality: 0.95, warm: 40, js: `${H}${S.cam}` }, 1800000);
  console.log(name, JSON.stringify(r));
  const dir = `screenshots/ember-film/frames/${name}`, out = `screenshots/ember-film/${name}.mp4`;
  // (A frame now and then never lands on the network path: its neighbour stands in, so the take is not cut short there.)
  { const have = fs.readdirSync(dir).filter((f) => /^f\d{6}\.jpg$/.test(f)).sort(), last = have.length ? +have[have.length - 1].slice(1, 7) : -1; let prev = null, filled = 0;
    for (let i = 0; i <= last; i++) { const f = `${dir}/f${String(i).padStart(6, '0')}.jpg`; if (fs.existsSync(f)) prev = f; else if (prev) { fs.copyFileSync(prev, f); filled++; } }
    if (filled) console.log('  (filled', filled, 'missing frames)'); }
  // (ffmpeg on the Windows side now and then fails on the network path: once more after a moment.)
  const enc = () => execFileSync(FFMPEG, ['-v', 'error', '-y', '-framerate', String(FPS), '-i', win(`${dir}/f%06d.jpg`), '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', win(out)]);
  try { enc(); } catch { await sleep(3000); enc(); }
  console.log('  →', out, (fs.statSync(out).size / 1e6).toFixed(1), 'MB');
}
execSync('tools/bot/play.sh stop');
