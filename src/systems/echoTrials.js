// Echo stones (side quest "Echoes of the Shapers", user request 2026-10-09: quests that are
// gameplay). Each hidden stone, listened to, remembers one Shaper's gesture and asks for it back —
// a different feat at each stone, built from the verbs and the surf:
//   1  three marks of glossy ice round it: Crystallize on each before the echo fades
//   2  hold the Ribbon on its face
//   3  surf a whole circle round it
//   4  three drifts piled round it: Sweep through each
//   5  it is guarded: break the Shaped that rise round it
//   6  a mark far across the snow: reach it with the Ribbon from the stone's foot
// Done, the stone lights and counts (`stones`); failed (time, or walking off), it can be tried again.

import { BRUSH } from '../shaders/terrainState.wgsl.js';

const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
const KIND = ['crystal', 'ribbon', 'circle', 'sweep', 'guard', 'reach'];
const TIME = { crystal: 35, ribbon: 20, circle: 30, sweep: 30, guard: 999, reach: 20 };
const WHAT = {
  crystal: 'Crystallize (F) on each mark of ice',
  ribbon: 'Hold the Ribbon on the stone',
  circle: 'Surf a whole circle round the stone',
  sweep: 'Sweep through each drift',
  guard: 'Break what rises to guard it',
  reach: 'From the stone\'s foot, reach the far mark with the Ribbon',
};

/** @param {any} g  shared boot context */
export function addEchoTrialSystem(g) {
  const { loop, controller, chapter, nav, hud, music, frost, shaped, shapedMod, terrainState: ts, clock, capture } = g;
  const graph = chapter.graph, flags = graph.flags, vars = graph.vars;
  const targets = g.interactables;
  const stones = [];
  for (const pl of nav.places) {
    if (pl.kind !== 'echo-stone') continue;
    const n = +pl.id.slice(pl.id.lastIndexOf('-') + 1);
    const t = { kind: 'stone', id: pl.id, verb: 'Listen', name: 'Echo stone', x: pl.x, y: pl.y, z: pl.z, r: 3.6, h: 1.2, hidden: true, place: pl, n,
      trial: KIND[(n - 1) % KIND.length], onUse: () => listen(t) };
    stones.push(t); targets.push(t);
  }

  /** The trial under way: its stone, clock, marks (x, z, done) and progress. */
  const cur = { t: null, left: 0, mx: new Float64Array(3), mz: new Float64Array(3), done: new Uint8Array(3), n: 0, acc: 0, slots: [], lastA: 0, wasSurf: false };

  function listen(t) {
    if (flags.has('echoed:' + t.id)) { hud.notice('Echo stone', 'Quiet now', null, 3); return; }
    if (cur.t === t) return;
    if (!flags.has('visited:' + t.id)) {
      nav.visit(t.id); flags.add('visited:' + t.id);
      chapter.do({ lore: 'lore-' + t.id });
    }
    chapter.raise('use:' + t.id);
    start(t);
    music.sting('echo');
    if (!capture) hud.notice('Echo stone', 'It remembers a gesture', WHAT[t.trial] + '.', 6);
  }

  function start(t) {
    cur.t = t; cur.left = TIME[t.trial]; cur.n = 0; cur.acc = 0; cur.done.fill(0); cur.slots.length = 0; cur.wasSurf = false;
    const face = t.n * 0.9;
    // Marks round the stone (written into the snow, so they read where they are).
    const count = t.trial === 'reach' ? 1 : 3;
    for (let k = 0; k < count; k++) {
      const a = face + k / 3 * Math.PI * 2, r = t.trial === 'reach' ? 10 : t.trial === 'sweep' ? 6.5 : 7.5;
      cur.mx[k] = t.x + Math.sin(a) * r; cur.mz[k] = t.z + Math.cos(a) * r;
      if (t.trial === 'crystal' || t.trial === 'reach') {
        ts.bx = cur.mx[k]; ts.bz = cur.mz[k]; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = 1.2; ts.bd = 0; ts.bc = 0.6;
        ts.bk = BRUSH.FREEZE; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0; ts.stamp();
        ts.bk = BRUSH.SCORE; ts.bw = 0.15; ts.bl = 0.9; ts.bd = 0.08; ts.bc = 0.3; ts.stamp();
      } else if (t.trial === 'sweep') {
        ts.bx = cur.mx[k]; ts.bz = cur.mz[k]; ts.bdx = 1; ts.bdz = 0; ts.bl = 0.6; ts.bw = 0.9; ts.bd = 0.55; ts.bc = 0;
        ts.bk = BRUSH.MOUND; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0; ts.stamp();
      }
    }
    if (t.trial === 'guard') {
      const p = controller.pos, base = Math.atan2(p.x - t.x, p.z - t.z);
      for (const [name, a, r] of [['seer', Math.PI, 12], ['hound', 0.9, 9], ['hound', -0.9, 9]]) {
        const k = shaped.spawn(name, t.x + Math.sin(base + a) * r, t.z + Math.cos(base + a) * r);
        if (k >= 0) cur.slots.push(k);
      }
    }
    if (t.trial === 'circle') { const p = controller.pos; cur.lastA = Math.atan2(p.x - t.x, p.z - t.z); }
  }

  function succeed() {
    const t = cur.t;
    flags.add('echoed:' + t.id); flags.add('lit:' + t.id); flags.add('used:' + t.id);
    vars.stones = (vars.stones || 0) + 1;
    chapter.raise('echo:' + t.id);
    music.sting('echo');
    if (!capture) hud.notice('The echo answers', vars.stones + ' of 6 stones', null, 5);
    cur.t = null; hud.line('echo', '');
  }
  function fail(why) {
    for (const k of cur.slots) shaped.damage(k, 1e9, false, 0, 0);
    if (!capture) hud.notice('Echo stone', 'The echo fades', why, 4);
    cur.t = null; hud.line('echo', '');
  }

  function tick(dt) {
    const t = cur.t; if (!t) return;
    const p = controller.pos;
    if (dist2(p.x, p.z, t.x, t.z) > 70 * 70) { fail('Listen again, and stay near.'); return; }
    if (combat().dying > 0) { fail('Listen again.'); return; }
    cur.left -= dt;
    if (cur.left <= 0) { fail('Listen again; it will wait.'); return; }
    let need = 3;
    switch (t.trial) {
      case 'crystal':
        if (frost.crystalEvent) for (let k = 0; k < 3; k++) if (!cur.done[k] && dist2(frost.crystalX, frost.crystalZ, cur.mx[k], cur.mz[k]) < 2.4 * 2.4) { cur.done[k] = 1; cur.n++; }
        break;
      case 'sweep':
        for (let q = 0; q < frost.sweepActive.length; q++) {
          if (!frost.sweepActive[q]) continue;
          for (let k = 0; k < 3; k++) if (!cur.done[k] && dist2(frost.sweepFX[q], frost.sweepFZ[q], cur.mx[k], cur.mz[k]) < (frost.sweepHW[q] + 0.9) ** 2) { cur.done[k] = 1; cur.n++; }
        }
        break;
      case 'ribbon': case 'reach': {
        need = t.trial === 'ribbon' ? 3 : 1;
        const tx = t.trial === 'ribbon' ? t.x : cur.mx[0], tz = t.trial === 'ribbon' ? t.z : cur.mz[0], rr = t.trial === 'ribbon' ? 1.4 : 1.8;
        let touch = false;
        // (The far mark counts only from the stone's foot: walking up to it is not the gesture.)
        const atFoot = t.trial === 'ribbon' || dist2(p.x, p.z, t.x, t.z) < 3 * 3;
        if (frost.ribbonHeld && atFoot) { const n = frost.ribbonNodes; for (let k = 0; k < n.length; k += 4) if (n[k + 3] > 0.05 && dist2(n[k], n[k + 2], tx, tz) < rr * rr) { touch = true; break; } }
        if (touch) { cur.acc += dt; if (t.trial === 'reach') cur.n = 1; }
        if (t.trial === 'ribbon') cur.n = Math.min(3, Math.floor(cur.acc));
        break;
      }
      case 'circle': {
        need = 1;
        const surf = controller.surf.active, a = Math.atan2(p.x - t.x, p.z - t.z), d2 = dist2(p.x, p.z, t.x, t.z);
        let da = a - cur.lastA; da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
        cur.lastA = a;
        // Only surfing, and within 35 m of it, counts; turning back unwinds.
        if (surf && d2 < 35 * 35) cur.acc += da;
        if (Math.abs(cur.acc) >= Math.PI * 2) cur.n = 1;
        break;
      }
      case 'guard': {
        need = 1;
        for (let i = cur.slots.length - 1; i >= 0; i--) { const s = shaped.slots[cur.slots[i]].state; if (s === shapedMod.S.EMPTY || s === shapedMod.S.FALLING) cur.slots.splice(i, 1); }
        if (cur.slots.length === 0) cur.n = 1;
        break;
      }
    }
    if (cur.n >= need) { succeed(); return; }
    if (!capture) {
      const prog = t.trial === 'circle' ? Math.round(Math.abs(cur.acc) / (Math.PI * 2) * 100) + '%' : t.trial === 'guard' ? cur.slots.length + ' left' : t.trial === 'reach' ? '' : cur.n + ' of ' + need;
      hud.line('echo', WHAT[t.trial] + (prog ? ' · ' + prog : '') + (t.trial === 'guard' ? '' : ' · ' + Math.ceil(cur.left) + ' s'), cur.left < 6);
    }
  }
  const combat = () => g.combat;

  // Stones nearest-first hint: the closest not yet answered, within sensing of the quest's compass.
  const hint = { x: 0.5, z: 0.5, name: 'An Echo Stone' };
  g.navDynamic['stone-hint'] = () => {
    let best = 1e18, b = null;
    for (const t of stones) { if (flags.has('echoed:' + t.id)) continue; const d = dist2(t.x, t.z, nav.px, nav.pz); if (d < best) { best = d; b = t; } }
    if (!b || best > 700 * 700) return null;
    hint.x = b.x; hint.z = b.z; return hint;
  };

  loop.add({ name: 'echoTrials', update: () => {
    for (const t of stones) t.hidden = !t.place.known;
    tick(clock.dt);
  } });
}
