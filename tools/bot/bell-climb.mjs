// Bot: the Bellwether's second phase: walk to the neck, grip (hold Traverse), climb (W), open each
// valve (Primary) — logging focus, shakes, falls and the release.
import { bot, js } from './client.mjs';
const t0 = Date.now(), T = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's';
const say = (...a) => console.log(T(), ...a);
const logs = (s) => { for (const l of s.log || []) if (!/BARK/.test(l)) say('  |', l); };
const cl = () => js(`const c=g.bellClimb,b=g.bellwether,f=g.bellFight;return {mode:c.mode,climbing:c.climbing,s:+(c.s||0).toFixed(2),th:+(c.th||0).toFixed(2),near:c.nearValve,fell:c.fell,y:+g.controller.pos.y.toFixed(1),focus:+g.combat.focus.toFixed(0),health:+g.combat.health.toFixed(0),valves:Array.from(b.valves.open),phase:f.phase,state:b.state,shakeWarn:f.shakeWarn,base:[b.base.x,b.base.z]}`);
let c = await cl(); say('start', JSON.stringify(c));
for (let attempt = 0; attempt < 6; attempt++) {
  c = await cl();
  if (c.phase === 4) break;
  // Walk to the base of the neck (as close as the ground allows), then grip and climb.
  await bot('walkTo', { x: 308, z: 974, arrive: 2, timeout: 20 });   // round the fountain basin
  const w = await bot('walkTo', { x: c.base[0], z: c.base[1], arrive: 3, timeout: 40 });
  say('at neck base?', JSON.stringify(w.walk), 'pos', w.pos);
  await js(`const b=g.bellwether,p=g.controller.pos;g.arm.yaw=Math.atan2(b.base.x-p.x,b.base.z-p.z);return 1`);
  for (let k = 0; k < 120; k++) {
    await bot('hold', { keys: ['Traverse', 'MoveForward'], ms: 600 });
    c = await cl();
    if (k % 4 === 0 || c.near >= 0) say(`climb s ${c.s} th ${c.th} y ${c.y} | focus ${c.focus} health ${c.health} | near ${c.near} valves ${c.valves} | state ${c.state}${c.shakeWarn ? ' SHAKE!' : ''}${c.climbing ? '' : ' (not gripping, fell ' + c.fell + ')'}`);
    if (c.near >= 0 && c.climbing) { await bot('hold', { keys: ['Traverse', 'Primary'], ms: 250 }); c = await cl(); say('  strike: valves', c.valves, 'phase', c.phase); }
    if (c.phase === 4) break;
    if (!c.climbing && k > 2) { say('  off the neck'); break; }
    if (c.focus < 8) { say('  focus out'); }
  }
}
const s = await bot('wait', { ms: 8000 }); logs(s);
c = await cl(); say('END', JSON.stringify(c), 'quests', JSON.stringify(s.quests));
