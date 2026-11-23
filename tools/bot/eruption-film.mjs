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
  // The mountain breaks: from the plain to the south-west at dusk, a time-lapse of the first minutes.
  wide: { tp: [1330, -2470], hour: 18.6, seconds: 26, setup: `g.chapter.graph.flags.add('ember:warned');g.chapter.graph.vars['ember:day']=4;`, rate: 5,
    cam: `const u=t/26,x=1300+70*u,z=-2470+40*u,y=gy(x,z)+190-30*u;cam.at(x,y,z,2330,780+40*u,-2170,0.58);` },
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
  // (ffmpeg on the Windows side now and then fails on the network path: once more after a moment.)
  const enc = () => execFileSync(FFMPEG, ['-v', 'error', '-y', '-framerate', String(FPS), '-i', win(`${dir}/f%06d.jpg`), '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', win(out)]);
  try { enc(); } catch { await sleep(3000); enc(); }
  console.log('  →', out, (fs.statSync(out).size / 1e6).toFixed(1), 'MB');
}
execSync('tools/bot/play.sh stop');
