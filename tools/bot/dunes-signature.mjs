#!/usr/bin/env node
// The gate's two moving shots in film mode (plan.md D12): the signature frame, a sand-surf carve down a slip face
// at golden hour with the wake avalanching; and the Long Walker waking. Frames in screenshots/phase-09-gate-film/frames/.
//   tools/bot/play.sh "p9-walker-buried" "^&stone=1"   then   node tools/bot/dunes-signature.mjs
import fs from 'node:fs';
import { bot, js } from './client.mjs';

const face = JSON.parse(fs.readFileSync('docs/phase-9/sand-surf/slipfaces.json')).faces[0];
const dir = 'phase-09-gate-film'; // no slashes: the frame sink keeps only [a-z0-9-]
// The Walker first: the brake stone, from the side, as it heaves up.
await bot('teleport', { x: 2436 + 60, z: 1124 + 40 }); await new Promise((r) => setTimeout(r, 4000));
await js(`g.params.v.timeOfDay=17;g.params.version++;return 1;`);
console.log('walker film', JSON.stringify(await bot('film', { name: 'walker-waking', dir, seconds: 12, fps: 30, size: [1920, 1080], warm: 30, js: `
  if (i === 0) { const t = g.interactables.find((q) => q.id === 'walker-brake'); t.hidden = false; t.onUse(); }
  const a = 0.9 + i * 0.0012; cam.at(2436 + Math.sin(a) * 95, 190, 1124 + Math.cos(a) * 95, 2436, 168, 1124, 0.8);` })).slice(0, 160));
await js(`
  const frame=()=>new Promise(r=>requestAnimationFrame(r));g.toggles.on.snapshot=false;g.engine.snapshotRendering=false;
  g.clock.frozen=false;g.clock.pinHour=17.6;w.params.v.refillRate=0;w.params.version++;
  g.ws.restoration.dunes='restored';g.restoration.snap=true;g.ws.weatherOverride='clear';g.weather.snap=true;
  g.arm.setFree(false);g.game.wraithHeld=false;g.controller.hold=false;g.game.setPlayerVisible(true);g.game.teleport(${face.x},${face.z});
  for(let i=0;i<600&&!g.game.worldSettled();i++)await frame();
  g.game.killShaped();g.combat.health=10000;for(let i=0;i<60;i++)await frame();
  const c=g.controller,s=c.surf;c.glide.active=false;c.yaw=${face.heading};c.vel.x=0;c.vel.y=0;c.vel.z=0;s.active=false;
  g.arm.yaw=${face.heading}+0.6;g.arm.pitch=.2;g.arm.zoomTarget=9;g.arm.zoom=9;g.arm.armLen=9;g.arm.snap(c.pos);return 1;`);
console.log('surf film', JSON.stringify(await bot('film', { name: 'signature', dir, seconds: 9, fps: 30, size: [1920, 1080], warm: 60, js: `
  cam.off(); if (i === 0) { inject('Traverse', true); inject('MoveForward', true); }
  if (i === 70) inject('MoveRight', true); if (i === 110) inject('MoveRight', false);
  if (i === 170) inject('MoveLeft', true); if (i === 210) inject('MoveLeft', false);` })).slice(0, 160));
await js(`for (const k of ['Traverse','MoveForward','MoveRight','MoveLeft']) w.inject(k,false); g.clock.pinHour=null; return 1;`);
