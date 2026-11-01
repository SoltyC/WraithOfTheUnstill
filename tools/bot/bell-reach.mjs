// Bot: the whole Bellwether fight through real input only (no teleport, no onUse, no setting state): that the
// chimneys can be reached (a rough Q Gust from the forecourt; another from up on the neck) and that all three
// valves open, steering by the climb's own hints. The climb here is the one that used to leave valve 0 shut.
//   tools/bot/play.sh p8-bell-fight "^&bell=fight"
//   node tools/bot/bell-reach.mjs                 (WRAITH_URL for another port)
import { bot, js } from './client.mjs';
const t0 = Date.now(), T = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's';
const say = (...a) => console.log(T(), ...a);
const key = (k, on) => js(`w.inject('${k}',${on});return 1`);
const info = () => js(`const f=g.bellFight,b=g.bellwether,c=g.bellClimb,p=g.controller.pos;return {ph:f.phase,vents:Array.from(f.vents),open:Array.from(b.valves.open),pos:[+p.x.toFixed(1),+p.y.toFixed(1),+p.z.toFixed(1)],fo:+g.combat.focus.toFixed(0),hp:+g.combat.health.toFixed(0),st:b.state,mode:c.mode,s:+c.s.toFixed(2),th:+c.th.toFixed(2),near:c.nearValve,way:c.valveWay,hint:f.hint,el:g.elements.active,base:[b.base.x,b.base.z],vb:!!g.verbBlock,rel:g.chapter.graph.flags.has('meadow:bellwether-released')}`);
const results = {};
const check = (name, ok, extra = '') => { results[name] = !!ok; say(ok ? 'PASS' : 'FAIL', name, extra); };

let a = await info();
for (let k = 0; k < 40 && (a.ph !== 1 || a.st === 1); k++) { await bot('wait', { ms: 500 }); a = await info(); }
say('awake', JSON.stringify(a));
const vents = await js(`const f=g.bellFight,o=[];for(let k=0;k<3;k++){const q=f.ventPos(k,{});o.push([q.x,q.y,q.z])}return o`);

// ── What the report describes: a click at a chimney does nothing, but now it says what does ─────────
await bot('aim', { x: vents[1][0], y: vents[1][1], z: vents[1][2] });
await bot('press', { key: 'Primary' }); await bot('wait', { ms: 200 });
a = await info();
check('a click at a chimney strips nothing and names the key', a.vents[1] === 3 && /Tap Q/.test(a.hint), a.hint);

// ── From the forecourt: rough aim, off by the width of the Wraith in the view ──────────────────────
for (let i = 0; i < 6; i++) {
  a = await info(); if (a.vents[1] <= 0) break;
  if (a.fo < 15) { await bot('wait', { ms: 2000 }); continue; }
  await bot('aim', { x: vents[1][0] + 6, y: vents[1][1] - 4, z: vents[1][2] - 6 });   // about 8 degrees off, as a player would be
  await bot('press', { key: 'Bend' }); await bot('wait', { ms: 500 });
}
a = await info();
check('a rough Gust from the forecourt strips a chimney', a.vents[1] <= 0, 'vents ' + a.vents);
await bot('wait', { ms: 2500 });

// ── To the neck on foot, grip, up it ───────────────────────────────────────────────────────────────
async function mount() {
  await bot('walkTo', { x: 288, z: 960, arrive: 2, timeout: 20 });
  a = await info();
  await bot('walkTo', { x: a.base[0] + 7, z: a.base[1] + 3, arrive: 2, timeout: 20 });
  await js(`const b=g.bellwether,p=g.controller.pos;g.arm.yaw=Math.atan2(b.base.x-p.x,b.base.z-p.z);return 1`);
  await key('Traverse', true);
  for (let k = 0; k < 20; k++) { await bot('wait', { ms: 150 }); a = await info(); if (a.mode) break; }
  say('gripped', a.mode, 's', a.s, 'th', a.th, 'at', a.pos);
}
await mount();
check('walked to the neck and gripped it', a.mode === 1);

// ── The other two chimneys from up on the neck ─────────────────────────────────────────────────────
await key('MoveForward', true);
for (let k = 0; k < 60 && a.s < 7; k++) { await bot('wait', { ms: 300 }); a = await info(); }
await key('MoveForward', false);
say('on the neck', 's', a.s, 'y', a.pos[1]);
for (const v of [0, 2]) for (let i = 0; i < 10; i++) {
  a = await info(); if (a.vents[v] <= 0) break;
  if (a.fo < 15) { await bot('wait', { ms: 2000 }); continue; }
  await bot('aim', { x: vents[v][0], y: vents[v][1], z: vents[v][2] });
  await bot('press', { key: 'Bend' }); await bot('wait', { ms: 500 });
}
a = await info();
check('Gusts from the neck strip the rest (the neck rears)', a.ph === 2 || a.ph === 3, 'vents ' + a.vents + ' phase ' + a.ph);

// ── The valves: only the hint's way (W, S, A or D), as a player would read it ──────────────────────
let held = null, side = 'MoveRight', stall = 0, lastTh = a.th, order = [], lastLog = 0;
const hold = async (k) => { if (k !== held) { if (held) await key(held, false); if (k) await key(k, true); held = k; } };
for (let i = 0; i < 700; i++) {
  await bot('wait', { ms: 200 });
  a = await info();
  if (a.ph === 4) break;
  if (!a.mode) { await hold(null); await key('Traverse', false); say('off the neck; again'); await bot('wait', { ms: 2500 }); await mount(); continue; }
  if (Date.now() - lastLog > 4000) { lastLog = Date.now(); say(JSON.stringify({ s: a.s, th: a.th, y: a.pos[1], way: a.way, near: a.near, fo: a.fo, st: a.st, open: a.open, hint: a.hint })); }
  if (a.near >= 0) {
    await hold(null); const k = a.near;
    await bot('press', { key: 'Primary' }); await bot('wait', { ms: 150 }); a = await info();
    if (a.open[k]) { order.push(k); say('valve', k, 'open at s', a.s, 'th', a.th, 'open', a.open); }
    continue;
  }
  if (a.way === 3) {
    // Round: if a flank's end stops the Wraith, the other key.
    if (Math.abs(a.th - lastTh) < 0.01 && held === side && a.st !== 5) { if (++stall > 15) { side = side === 'MoveRight' ? 'MoveLeft' : 'MoveRight'; stall = 0; } } else stall = 0;
    await hold(side);
  } else await hold(a.way === 2 ? 'MoveBack' : 'MoveForward');
  lastTh = a.th;
}
await hold(null); await key('Traverse', false); await bot('release');
check('all three valves opened by strikes', order.length === 3 && new Set(order).size === 3, 'order ' + order);
await bot('wait', { ms: 1000 });
a = await info();
check('the Bellwether is released', a.rel && a.ph === 4);
check('no verb is left blocked', !a.vb);
await bot('shot', { name: 'bell-reach-end' });
const failed = Object.keys(results).filter((k) => !results[k]);
say(failed.length ? 'FAILED: ' + failed.join('; ') : 'ALL PASS', JSON.stringify(a));
process.exit(failed.length ? 1 : 0);
