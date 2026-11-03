// Bot: the Lung and the descent (Phase 10 U2, docs/phase-10/u2-design.md) through real input. Put on the Lung at the jetty's end,
// walk off it, dive down the aim, tear the Lung on the kelp, stroke for the surface (it must fall short), wake on the ledge, swim
// to the column, hold against its pull, and be taken into the undercroft. Measures what the design review asks for.
//   tools/bot/play.sh u2-jetty
//   node tools/bot/lung-descent.mjs [shotsDir]
import { bot, js } from './client.mjs';
const dir = process.argv[2] || 'phase-10-u2';
const t0 = Date.now(), T = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';
const say = (...a) => console.log(T(), ...a);
const key = (k, on) => js(`w.inject('${k}',${on});return 1`);
const info = () => js(`const L=g.lung,p=g.controller.pos,c=g.camera.position;return {st:L.stage,air:+L.air.toFixed(3),light:+L.light.toFixed(2),spin:+L.spin.toFixed(2),
  p:[+p.x.toFixed(1),+p.y.toFixed(1),+p.z.toFixed(1)],cam:+c.y.toFixed(1),sub:g.controller.submerged,swim:g.controller.swimming,city:!!g.ebbhold.active,
  kelp:g.kelp.shown,gpuErr:w.gpuStats.gpuErrors,late:w.gpuStats.late.length,flags:['ebb:lung','ebb:torn','ebb:through'].filter(f=>g.chapter.graph.flags.has(f))}`);
const results = {}, M = {};
const check = (name, ok, extra = '') => { results[name] = !!ok; say(ok ? 'PASS' : 'FAIL', name, extra); };
const shot = (name) => bot('shot', { name, dir, hud: false }).catch((e) => say('shot failed', name, e.message));

let a = await info();
say('start', JSON.stringify(a));
const REC = process.env.REC === '1';
if (REC) say('recording', JSON.stringify(await bot('recStart', { fps: 60, mbps: 20 })));
for (let k = 0; k < 30 && a.p[1] < 2; k++) { await bot('wait', { ms: 500 }); a = await info(); }

// ── The jetty: put on the Lung ──────────────────────────────────────────────────────────────────────
await bot('look', { yaw: -Math.PI / 2, pitch: 0.2 });
await bot('press', { key: 'Interact' }); await bot('wait', { ms: 500 });
a = await info();
check('the Lung is put on at the pile of brass', a.st === 'fitted' && a.flags.includes('ebb:lung'), a.st);
await shot('u2-01-jetty');

// ── Off the end and down ───────────────────────────────────────────────────────────────────────────
await key('MoveForward', true);
for (let k = 0; k < 40 && !a.swim; k++) { await bot('wait', { ms: 250 }); a = await info(); }
check('walked off the jetty into the Sounding', a.swim, JSON.stringify(a.p));
await bot('look', { pitch: 1.15 });
const tDive = Date.now();
let shots = new Set(), tTear = 0, tearY = 0;
for (let k = 0; k < 400; k++) {
  await bot('wait', { ms: 250 }); a = await info();
  await js('g.arm.pitch=1.15;return 1');
  for (const [y, n] of [[-12, 'u2-02-going-down'], [-35, 'u2-03-deep'], [-55, 'u2-04-canopy']]) if (a.p[1] < y && !shots.has(n)) { shots.add(n); await shot(n); }
  if (a.st === 'torn') { tTear = (Date.now() - tDive) / 1000; tearY = a.p[1]; break; }
}
M.tearAfterS = tTear; M.tearY = tearY; M.airAtTear = a.air;
check('the Lung tore in the kelp', a.st === 'torn' && tearY < -40 && tearY > -100, `at y ${tearY}, ${tTear.toFixed(1)} s after the dive`);
await bot('wait', { ms: 400 }); await shot('u2-05-torn');

// ── For the surface: it must fall short ───────────────────────────────────────────────────────────
await key('MoveForward', false);
await bot('look', { pitch: -0.4 });
await key('Jump', true);
let best = a.p[1], sawDark = false;
for (let k = 0; k < 160; k++) {
  await bot('wait', { ms: 250 }); a = await info();
  if (a.st !== 'woke') best = Math.max(best, a.p[1]);
  if (k === 24) await shot('u2-06-for-the-surface');
  if (a.st === 'woke') { sawDark = true; break; }
}
await key('Jump', false);
M.ascentBestY = best;
check('the ascent falls short of the surface and puts the Wraith out', sawDark && best < -10, `best y ${best}`);
for (let k = 0; k < 30; k++) { await bot('wait', { ms: 250 }); a = await info(); }
const geo = await js(`return {ledge:[${'-2800+6+26'},${'-1400-4+15'}],col:[${'-2800+6'},${'-1400-4'}]}`);
const dl = Math.hypot(a.p[0] - geo.ledge[0], a.p[2] - geo.ledge[1]);
check('woke on the ledge among the kelp roots', a.st === 'woke' && dl < 3 && a.p[1] < -90, `at ${a.p}, ${dl.toFixed(1)} m from the ledge`);
await shot('u2-07-ledge');

// ── To the column ───────────────────────────────────────────────────────────────────────────────────
const tSwim = Date.now();
await bot('face', { x: geo.col[0], z: geo.col[1], pitch: 0.15 });
await key('MoveForward', true);
let refilled = false;
for (let k = 0; k < 160; k++) {
  await bot('wait', { ms: 250 }); a = await info();
  await js(`const p=g.controller.pos;g.arm.yaw=Math.atan2(${geo.col[0]}-p.x,${geo.col[1]}-p.z);g.arm.pitch=p.y>-92?0.5:0.05;return 1`);
  if (k === 12) await shot('u2-08-toward-the-column');
  if (a.st === 'whirl') { refilled = true; break; }
  if (a.st !== 'woke') break;
}
M.ledgeToColumnS = (Date.now() - tSwim) / 1000;
check('reached the column from the ledge on the thread of air', refilled, `${M.ledgeToColumnS.toFixed(1)} s, air ${a.air}`);
await key('MoveForward', false);

// ── Held against it: it wins ────────────────────────────────────────────────────────────────────────
await key('Jump', true);
const tWhirl = Date.now();
let maxAir = 0, taken = false;
for (let k = 0; k < 120; k++) {
  await bot('wait', { ms: 250 }); a = await info();
  maxAir = Math.max(maxAir, a.air);
  if (k === 10) await shot('u2-09-refilled');
  if (k === 34) await shot('u2-10-turning');
  if (a.city) { taken = true; break; }
}
await key('Jump', false);
M.whirlToCityS = (Date.now() - tWhirl) / 1000;
check('the column refilled the Lung', maxAir > 0.95, `max air ${maxAir}`);
check('held against the pull, the Wraith is still taken into the undercroft', taken && M.whirlToCityS > 7 && M.whirlToCityS < 20, `${M.whirlToCityS.toFixed(1)} s`);
for (let k = 0; k < 24; k++) await bot('wait', { ms: 250 });
a = await info();
check('in the undercroft, the Lung finished', a.city && a.st === 'through' && a.flags.includes('ebb:through'), a.st);
await shot('u2-11-undercroft');
M.gpuErrors = a.gpuErr; M.latePipelines = a.late;
check('no GPU errors', !a.gpuErr, String(a.gpuErr));
if (REC) say('film', JSON.stringify(await bot('recStop', { name: 'u2-descent', dir })));
console.log(JSON.stringify({ results, M }, null, 1));
