// The Veiled in the world (BRIEF §8.2): the chapter's named NPCs at their places, and an ambient
// pilgrim walking the path between the camp and the shrine below the cliffs. Each is a full robe
// figure (the Wraith's cloth, gait and body; character/veiled.js) with procedural idle life:
// breathing, a posture shift every few seconds (a corrective step), turning toward the Wraith when
// it comes near, cloth in the wind, footprints where its feet plant.
//
// Cloth on the GPU (render/clothGpu.js, docs/direction.md M0): every shown figure steps every frame.
// The CPU runs only its gait, body, colliders and pins (~0.03 ms); one compute dispatch solves every
// robe. (On the CPU a robe cost ~0.5 ms a step, so only three background figures could step a frame,
// each a 1/40 s step after up to 0.35 s unseen: in the burning village the robes crawled and snapped
// about once a second.) Hidden beyond 260 m, or until the ground there is known (anchor patches keep it
// known around the camp and the other places).

import { createWraithView } from '../render/wraith.js';
import { createClothGpu } from '../render/clothGpu.js';
import { createCostumeView } from '../render/costume.js';
import { Wraith } from '../character/wraith/wraith.js';
import { fitHoodUnderHat, fitShawl } from '../character/wraith/garments.js';
import { ARCHETYPES, scaledGround } from '../character/veiled.js';
import { LAP } from '../world/jetty.js';
import { COSTUMES } from '../game/costumes.js';

const NEAR = 60, FAR = 260, TALK_R = 3.2, LOOK_R = 9;
/** Solver iterations: full near the camera, fewer far off (where a robe is a few pixels). */
const ITER_NEAR = 6, ITER_FAR = 4;

/** @param {any} g  shared boot context */
export function addNpcSystems(g) {
  const { loop, scene, atmosphere, ground, content, shadows, bindShadows, camera, controller, clock, params, weather, restoration, footprints, engine, chapter, streamer, capture } = g;
  const data = chapter.data, table = chapter.table;
  const npcs = g.npcs = [];
  // One GPU solver for every Veiled (they all share the Wraith's garments).
  const flat = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
  // (128 slots: every figure in the world holds one from creation — the Ember chapter's 26 filled the old 64, and the meadow's
  // last-made folk fell back to the CPU cloth at 0.7 ms each. A slot is 2 × N × 32 bytes: 128 ≈ 25 MB.)
  const clothGpu = g.clothGpu ??= createClothGpu(engine, new Wraith(flat), 128);
  const sim = [0, 0, 0];
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  function place(ref) { const p = table[ref.poi].pos; return [p[0] + (ref.dx || 0), p[1] + (ref.dz || 0)]; }

  /** @param {{ tint?: number[], interact?: boolean, ground?: any }} [opt]  tint: dyed robe (multiplier); interact: a Speak target (default: when named);
   *  ground: its own ground ({ qx, qz, h, sample(), covers() }: a sealed interior's floors), used instead of the terrain and the world's solids, and no footprints */
  function makeNpc(id, name, archetype, home, opt = {}) {
    const A = ARCHETYPES[archetype];
    const xf = { ox: home[0], oy: 0, oz: home[1], s: A.scale };
    const view = createWraithView(scene, atmosphere, ground, content.clipmap, { veiled: true, name: 'veiled-' + id, tint: opt.costume?.tint || opt.tint || A.tint, sleeveCut: opt.sleeveCut || 0, costume: opt.costume || null, simGround: opt.ground ? scaledGround(opt.ground, xf, null) : scaledGround(ground, xf, g.solids || null), xform: xf, clothGpu });
    bindShadows(view.material, shadows); bindShadows(view.fur.material, shadows); bindShadows(view.fx.material, shadows);
    shadows.addCaster(view.mesh, view.makeShadowMaterial, 1);
    view.freeze();
    view.cowlLight = 0;
    view.handLight = A.lantern ? 1 : 0; view.handLightR = 0;
    if (A.lantern) { view.handGlow = [1.2, 0.72, 0.32]; view.handGlowSize = 0.11; }
    view.setEnabled(false);
    const w = view.wraith;
    if (opt.costume?.hat) fitHoodUnderHat(w.garments);
    if (opt.costume) { w.overArms = 1; if (opt.costume.shawl) fitShawl(w.garments); }   // the shawl rides outside the sleeves (the basket arm is held out: it poked through)
    w.body.hunch = A.hunch; w.body.breath = A.breath;
    const n = {
      id, name, archetype, A, view, xf, home, x: home[0], z: home[1], y: 0, yaw: rnd() * 6.28,
      shown: false, placed: false, shiftT: A.shift[0] + rnd() * (A.shift[1] - A.shift[0]), offX: 0.5 - 0.5, offZ: 0.5 - 0.5,
      lod: 0.5 - 0.5, path: null, pathT: 0.5 - 0.5, at: null, vx: 0.5 - 0.5, vz: 0.5 - 0.5,
      brain: null, hunch: undefined, noLook: false, gnd: opt.ground || null, hide: false, frozen: false,
      target: (opt.interact ?? !!name) ? { kind: 'npc', id, verb: 'Speak', name, x: 0.5, y: 0.5, z: 0.5, r: TALK_R, h: 0.25, hidden: true } : null,
    };
    if (n.target) g.interactables.push(n.target);
    // A costume's stiff parts (render/costume.js): a hat on the head, a basket on the left arm (it swings from the hand).
    if (opt.costume) {
      const cv = g.costumes ??= createCostumeView(scene, atmosphere, content.clipmap, shadows, bindShadows);
      n.costume = { hat: opt.costume.hat ? cv.alloc('hat') : null, basket: opt.costume.basket ? cv.alloc('basket') : null,
        seed: opt.costume.seed ?? rnd(), sw: [0, 0, 0, 0], hand: null, hv: [0, 0, 0] };
    }
    npcs.push(n);
    return n;
  }

  // A costume from the data: a people's name (game/costumes.js), or { base, ...overrides } (one family's dyes, no basket).
  const costumeOf = (c) => !c ? null : typeof c === 'string' ? COSTUMES[c] || null : COSTUMES[c.base] ? { ...COSTUMES[c.base], ...c, base: undefined } : null;
  for (const d of data.npcs) if (!d.lazy) { const cos = costumeOf(d.costume); makeNpc(d.id, d.name, d.archetype, place(d.home), cos ? { costume: cos } : d.tint ? { tint: d.tint } : {}); }
  // The costume gate (docs/people-and-cutscenes.md §1.3, ?costume=sow): one costumed villager beside the Wraith's start, for the
  // judging shots (tools/bot/costume-gate.mjs moves and poses it through g.costumeGate).
  { const cg = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('costume');
    if (cg && COSTUMES[cg]) { const p0 = controller.pos; g.costumeGate = makeNpc('costume-' + cg, null, 'pilgrim', [p0.x + 2, p0.z + 2], { costume: COSTUMES[cg], interact: false }); } }
  // Ambient pilgrim: walks from the fire across the frozen tarn to the shrine on its far shore, and back.
  const camp = table['camp-frost'].pos, shrine = table['shrine-frost-3'].pos;
  const walker = makeNpc('pilgrim-1', null, 'pilgrim', [camp[0] - 6, camp[1] - 6]);
  walker.path = [[camp[0] - 6, camp[1] - 6], [camp[0] - 70, camp[1] - 24], [(camp[0] + shrine[0]) / 2, (camp[1] + shrine[1]) / 2 - 8], [shrine[0] + 24, shrine[1] + 6], [shrine[0] + 9, shrine[1] + 8]];
  walker.pathLen = 0;
  for (let k = 1; k < walker.path.length; k++) walker.pathLen += Math.hypot(walker.path[k][0] - walker.path[k - 1][0], walker.path[k][1] - walker.path[k - 1][1]);
  walker.pathT = rnd() * walker.pathLen * 2;

  // Keep the ground known where they live (anchor patches 1…).
  const anchors = [camp, table['spring-frost'].pos, table['varo-rise'].pos, table.monastery.pos, [(camp[0] + shrine[0]) / 2, (camp[1] + shrine[1]) / 2]];
  if (!capture) anchors.forEach((p) => streamer.addAnchor(p[0], p[1]));

  /** Where an NPC should be now (quest state moves some: the lost child). */
  const tobinLost = place(data.npcs.find((d) => d.id === 'tobin').lost);
  function station(n) {
    if (n.id === 'tobin') {
      const fl = chapter.graph.flags;
      // He has wandered off before the Wraith ever reaches the camp: never at the fire until he has been found.
      if (!fl.has('tobin-found')) return tobinLost;
      // Let him listen: he stays at the spring until the steppe moves again.
      if (fl.has('tobin-listened') && !chapter.facts.restored.has('frost')) return tobinLost;
    }
    return n.home;
  }

  // The escort ("A Trail in the Snow", user request 2026-10-09): led home, Tobin follows a few
  // steps behind the Wraith at a child's pace; too far ahead and he stops and waits. At the fire he
  // is home (a flag and an event for the quest) and walks back to his place.
  const FOLLOW = { gap: 2.6, run: 2.6, wait: 24, home: 14 };
  const campPos = table['camp-frost'].pos;
  let tobinWaiting = false;
  /** Move n toward (tx, tz), stopping `gap` short, at up to `top` m/s; returns its speed. */
  function walkTo(n, tx, tz, gap, top, dt) {
    const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
    if (d <= gap + 0.05) { n.vx = 0; n.vz = 0; return 0; }
    const sp = Math.min(top, (d - gap) * 1.4), ux = dx / d, uz = dz / d;
    n.vx = ux * sp; n.vz = uz * sp; n.x += n.vx * dt; n.z += n.vz * dt; n.yaw = Math.atan2(ux, uz);
    return sp;
  }
  let tobinStart = true;
  // Every load re-places him (systems chain navSync on load: game.js apply).
  { const prev = g.navSync; g.navSync = () => { prev?.(); tobinStart = true; }; }
  function tobinTick(n, dt) {
    const fl = chapter.graph.flags, p = controller.pos;
    if (fl.has('escorting') && !fl.has('tobin-home')) {
      // A load mid-escort (any load, not only the first): he was following the Wraith when the
      // save was made, so once the load's teleport has landed he stands just behind it — never
      // left at the fire (which would end the escort at once) or far behind.
      if (tobinStart && !(g.pendingTp && g.pendingTp.active)) {
        tobinStart = false;
        const back = controller.yaw + Math.PI, bx = p.x + Math.sin(back) * 2.5, bz = p.z + Math.cos(back) * 2.5;
        if (Math.hypot(n.x - p.x, n.z - p.z) > FOLLOW.wait * 0.8 || Math.hypot(n.x - campPos[0], n.z - campPos[1]) < FOLLOW.home + 4) {
          n.x = bx; n.z = bz; n.xf.ox = n.x; n.xf.oz = n.z; n.placed = false;
        }
      }
      if (tobinStart) { n.vx = 0; n.vz = 0; n.at = null; return true; }
      const d = Math.hypot(p.x - n.x, p.z - n.z);
      tobinWaiting = d > FOLLOW.wait;
      if (tobinWaiting) { n.vx = 0; n.vz = 0; n.yaw = Math.atan2(p.x - n.x, p.z - n.z); }
      else walkTo(n, p.x, p.z, FOLLOW.gap, FOLLOW.run, dt);
      if (Math.hypot(n.x - campPos[0], n.z - campPos[1]) < FOLLOW.home) {
        fl.add('tobin-home'); fl.delete('escorting'); chapter.raise('tobin:home');
        if (!capture) g.hud.notice('A Trail in the Snow', 'Tobin is home', 'Maren is by the fire.', 5);
      }
      n.at = null;
      return true;
    }
    tobinWaiting = false;
    if (fl.has('tobin-home') && Math.hypot(n.x - n.home[0], n.z - n.home[1]) > 0.6) {
      walkTo(n, n.home[0], n.home[1], 0, 1.2, dt);
      if (Math.hypot(n.x - n.home[0], n.z - n.home[1]) <= 0.65) n.at = n.home;
      return true;
    }
    n.vx = 0; n.vz = 0;
    return false;
  }

  /** Point along the walker's path (ping-pong), into out[0..1], heading into out[2]. */
  function pathPoint(n, t, out) {
    const L = n.pathLen, P = n.path;
    let u = t % (2 * L); const back = u > L; if (back) u = 2 * L - u;
    for (let k = 1; k < P.length; k++) {
      const ax = P[k - 1][0], az = P[k - 1][1], bx = P[k][0], bz = P[k][1], l = Math.hypot(bx - ax, bz - az);
      if (u <= l || k === P.length - 1) {
        const f = Math.min(1, u / l);
        out[0] = ax + (bx - ax) * f; out[1] = az + (bz - az) * f;
        out[2] = back ? Math.atan2(ax - bx, az - bz) : Math.atan2(bx - ax, bz - az);
        return out;
      }
      u -= l;
    }
    return out;
  }
  const pp = [0, 0, 0];
  let frame = 0;

  // The lost child's trail (side quest "A Trail in the Snow"): small prints wandering from the
  // fire to the frozen spring, pressed into the snow a stretch at a time as the Wraith comes
  // within reach of them (terrain writes only land inside the fine window). Each stretch done is a
  // world flag, so a reload never presses it twice (the prints themselves are in the saved pages).
  const spring = place(data.npcs.find((d) => d.id === 'tobin').lost);
  const SEGS = 12, segPts = [], segFlag = [];
  for (let k = 0; k < SEGS; k++) {
    const pts = [];
    for (let q = 0; q <= 4; q++) {
      const t = (k + q / 4) / SEGS;
      const wob = Math.sin(t * 23) * 6 + Math.sin(t * 57 + 1) * 2.5;
      const dx = spring[0] - (camp[0] - 4), dz = spring[1] - (camp[1] + 5), L = Math.hypot(dx, dz);
      pts.push([camp[0] - 4 + dx * t - dz / L * wob, camp[1] + 5 + dz * t + dx / L * wob]);
    }
    segPts.push(pts); segFlag.push('tobin-trail-' + k);
  }
  function pressTrail() {
    const q = chapter.graph.quests['trail-in-snow'];
    if (!q || q.state !== 'active' || chapter.graph.flags.has('tobin-found')) return;
    const p = controller.pos;
    for (let k = 0; k < SEGS; k++) {
      if (chapter.graph.flags.has(segFlag[k])) continue;
      const a = segPts[k][0], b = segPts[k][4];
      const dx = (a[0] + b[0]) / 2 - p.x, dz = (a[1] + b[1]) / 2 - p.z;
      if (dx * dx + dz * dz > 30 * 30) continue;
      footprints.size = 0.62; footprints.stampTrail(segPts[k]); footprints.size = 1;
      chapter.graph.flags.add(segFlag[k]);
    }
  }

  // For systems that drive their own people (systems/villagers.js): make an NPC late, walk, re-place.
  g.npcApi = {
    make: makeNpc, walkTo, place,
    /** Put n at (x, z) now (out of sight or not: the caller decides), keeping its sim origin in step. */
    put(n, x, z) { n.x = x; n.z = z; n.xf.ox = x; n.xf.oz = z; n.placed = false; n.at = [x, z]; n.vx = 0; n.vz = 0; },
  };

  /** A carried prop to its hand (world): a staff planted beside the right, a lantern hanging from the left, a held thing between
   *  both, a thing lengthwise across the lap, its far end in the left, a blade in the right fist. */
  function placeProp(prop, n, w, xf) {
    const b = w.body, sites = g.architecture.sites, o = prop.index * 4, kind = prop.kind;
    const k = kind === 'lantern' || kind === 'lap' ? 0 : 3;
    const hx = xf.ox + (b.ha[k] - xf.ox) * xf.s, hy = xf.oy + (b.ha[k + 1] - xf.oy) * xf.s, hz = xf.oz + (b.ha[k + 2] - xf.oz) * xf.s;
    if (kind === 'held') {
      // In both hands: between them, a little out from the body.
      sites[o] = xf.ox + ((b.ha[0] + b.ha[3]) * 0.5 - xf.ox) * xf.s + b.f[0] * 0.04; sites[o + 1] = xf.oy + ((b.ha[1] + b.ha[4]) * 0.5 - xf.oy) * xf.s;
      sites[o + 2] = xf.oz + ((b.ha[2] + b.ha[5]) * 0.5 - xf.oz) * xf.s + b.f[2] * 0.04;
    } else if (kind === 'lap') {
      // Lengthwise out from the lap, cradled on the left hand and forearm: its middle over the hand, a little to the right and up
      // (so the arm is under it, not along its side). (Sized for Morrow's Lung: world/jetty.js LAP.)
      const fx = Math.sin(n.yaw), fz = Math.cos(n.yaw);
      sites[o] = hx - fx * LAP[0] + fz * LAP[1]; sites[o + 1] = hy + LAP[2]; sites[o + 2] = hz - fz * LAP[0] - fx * LAP[1];
    }
    else if (kind === 'lantern' || kind === 'blade') { sites[o] = hx; sites[o + 1] = hy - 0.02; sites[o + 2] = hz; }
    else if (kind === 'earL' || kind === 'earR') {
      // On the hood, either side of the head (the Listener's bronze ears): along the head's own right, so they turn with it.
      const h = b.head, sd = (kind === 'earR' ? 1 : -1) * 0.13, r = b.hr, u = b.hu;
      sites[o] = xf.ox + (h[0] + r[0] * sd + u[0] * 0.02 - xf.ox) * xf.s; sites[o + 1] = xf.oy + (h[1] + r[1] * sd + u[1] * 0.02 - xf.oy) * xf.s;
      sites[o + 2] = xf.oz + (h[2] + r[2] * sd + u[2] * 0.02 - xf.oz) * xf.s;
    }
    else { ground.qx = hx; ground.qz = hz; ground.sample(); sites[o] = hx; sites[o + 1] = ground.h - 0.05; sites[o + 2] = hz; }
    // A prop that comes and goes with the figure's work (the Lung's gash and slump, world/jetty.js: n.gash its progress).
    sites[o + 3] = !prop.show || prop.show(n.gash ?? 0) ? 1 : 0;
  }

  function hideCostume(n) { const c = n.costume, cv = g.costumes; if (c.hat) cv.hide(c.hat); if (c.basket) cv.hide(c.basket); c.hand = null; }
  /** The hat on the head (tipped back a little), the basket hanging from the left hand: a damped pendulum that lags the hand. */
  function placeCostume(n, w, xf, dt) {
    const c = n.costume, cv = g.costumes, b = w.body, s = xf.s;
    const W = (v, k) => xf[k === 0 ? 'ox' : k === 1 ? 'oy' : 'oz'] + (v - xf[k === 0 ? 'ox' : k === 1 ? 'oy' : 'oz']) * s;
    if (c.hat) {
      const t = 0.1, ct = Math.cos(t), st = Math.sin(t), r = b.hr, u = b.hu, f = b.hf;
      const ux = u[0] * ct - f[0] * st, uy = u[1] * ct - f[1] * st, uz = u[2] * ct - f[2] * st;
      const fx = f[0] * ct + u[0] * st, fy = f[1] * ct + u[1] * st, fz = f[2] * ct + u[2] * st;
      const h = b.head, ly = 0.072, lz = -0.006;
      cv.place(c.hat, r[0] * s, r[1] * s, r[2] * s, ux * s, uy * s, uz * s, fx * s, fy * s, fz * s,
        W(h[0] + u[0] * ly + f[0] * lz, 0), W(h[1] + u[1] * ly + f[1] * lz, 1), W(h[2] + u[2] * ly + f[2] * lz, 2), true, c.seed, w.ash || 0);
    }
    if (c.basket) {
      const hx = W(b.ha[0], 0), hy = W(b.ha[1], 1), hz = W(b.ha[2], 2), sw = c.sw;
      // The hand's acceleration drives the swing (a fresh figure starts hanging still).
      if (!c.hand || dt > 0.25) { c.hand = [hx, hy, hz]; c.hv[0] = c.hv[1] = c.hv[2] = 0; sw[0] = sw[1] = sw[2] = sw[3] = 0; }
      const h = Math.max(dt, 1e-4), vx = (hx - c.hand[0]) / h, vz = (hz - c.hand[2]) / h;
      const ax = (vx - c.hv[0]) / h, az = (vz - c.hv[2]) / h;
      c.hand[0] = hx; c.hand[1] = hy; c.hand[2] = hz; c.hv[0] = vx; c.hv[2] = vz;
      const L = 0.26 * s, k = 9.81 / L, damp = 4.5, n2 = Math.max(1, Math.ceil(dt * 240)), sd = dt / n2;
      const fax = Math.max(-30, Math.min(30, ax)), faz = Math.max(-30, Math.min(30, az));
      for (let i = 0; i < n2; i++) {
        sw[2] += (-k * sw[0] - damp * sw[2] - fax / L) * sd; sw[3] += (-k * sw[1] - damp * sw[3] - faz / L) * sd;
        sw[0] = Math.max(-0.45, Math.min(0.45, sw[0] + sw[2] * sd)); sw[1] = Math.max(-0.45, Math.min(0.45, sw[1] + sw[3] * sd));
      }
      // Up along the hang line (from the basket to the grip), forward the body's, right from them.
      let ux = -sw[0], uy = 1, uz = -sw[1]; { const l = Math.hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l; }
      let fx = b.f[0], fy = 0, fz = b.f[2]; { const d = fx * ux + fy * uy + fz * uz; fx -= ux * d; fy -= uy * d; fz -= uz * d; const l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l; }
      const rx = uy * fz - uz * fy, ry = uz * fx - ux * fz, rz = ux * fy - uy * fx;
      cv.place(c.basket, rx * s, ry * s, rz * s, ux * s, uy * s, uz * s, fx * s, fy * s, fz * s, hx, hy, hz, true, c.seed, w.ash || 0);
    }
  }

  loop.add({ name: 'npcs', update: () => {
    frame++;
    const cp = camera.position, p = controller.pos, dt = clock.dt;
    const wind = params.v.windStrength * weather.wind * (0.04 + 0.96 * restoration.value);
    let changed = false;
    for (let i = 0, N = npcs.length; i < N; i++) {
      const n = npcs[i], w = n.view.wraith, xf = n.xf;
      if (n.frozen && n.shown) continue;   // held in time (a cutscene's frozen crowd): not moved, not simulated, still drawn
      // Station (and the walker's path).
      if (n.path) {
        n.pathT += dt * 1.05;
        pathPoint(n, n.pathT, pp);
        n.x = pp[0]; n.z = pp[1]; n.yaw = pp[2];
      } else if (n.brain) {
        n.brain(n, dt); // a system drives it (systems/villagers.js): sets x, z, vx, vz, yaw, hunch
      } else if (n.id === 'tobin' && tobinTick(n, dt)) {
        // walking with the Wraith (or home)
      } else {
        const st = station(n);
        if (n.at !== st) {
          // Moved by the story: re-home out of sight (a figure never pops in view).
          const dx = st[0] - cp.x, dz = st[1] - cp.z, sx = n.x - cp.x, sz = n.z - cp.z;
          if (!n.at || ((dx * dx + dz * dz > 90 * 90) && (sx * sx + sz * sz > 90 * 90))) { n.at = st; n.x = st[0]; n.z = st[1]; xf.ox = st[0]; xf.oz = st[1]; n.placed = false; }
        }
      }
      const dcx = n.x - cp.x, dcz = n.z - cp.z, dc = Math.sqrt(dcx * dcx + dcz * dcz);
      n.dc = dc;
      const gd = n.gnd || ground;
      gd.qx = n.x; gd.qz = n.z;
      const known = gd.covers();
      // (Boolean: `known && …` is undefined far off, and Babylon's setEnabled(undefined) leaves a mesh drawn — every distant figure
      // whose ground was known drew its cloth and shadow from across the world.)
      const show = !!(known && (dc < FAR || n.warm) && !n.hide);   // (warm: a cutscene is about to cut to them)
      if (show !== n.shown) {
        n.shown = show; n.view.setEnabled(show); changed = true; if (!show) n.placed = false; else n.fresh = true;
        const prop = g.props?.[n.id];
        if (prop && !show) {
          g.architecture.sites[prop.index * 4 + 3] = 0;
          if (prop.also) for (let a = 0; a < prop.also.length; a++) g.architecture.sites[prop.also[a].index * 4 + 3] = 0;
        }
      }
      if (n.target) n.target.hidden = !show;
      if (!show) { if (n.costume) hideCostume(n); continue; }
      gd.sample(); n.y = gd.h;
      if (g.solids && !n.gnd) { const so = g.solids; so.qx = n.x; so.qz = n.z; so.qh = n.y; so.floorAnyQ(); n.y = so.h; }
      if (n.lift === n.lift && n.lift > n.y) n.y = n.lift;   // (a step its brain knows of: a raised threshold — systems/eruption.js)
      if (!n.placed) { xf.oy = n.y; n.placed = true; }
      // Idle life: shift weight now and then (a small corrective step), turn toward the Wraith.
      if (!n.path && !n.vx && !n.vz && !n.noLook) {
        n.shiftT -= dt;
        if (n.shiftT <= 0) { n.shiftT = n.A.shift[0] + rnd() * (n.A.shift[1] - n.A.shift[0]); n.offX = (rnd() - 0.5) * 0.16; n.offZ = (rnd() - 0.5) * 0.16; }
        const tx = p.x - n.x, tz = p.z - n.z;
        if (tx * tx + tz * tz < LOOK_R * LOOK_R) n.yaw = Math.atan2(tx, tz);
      }
      // Every shown figure every frame (the time since its last update: a frame, or a while hidden).
      n.lod += dt;
      const step = n.lod; n.lod = 0;
      { const wr = n.view.wraith, cl = wr.cloth;
        cl.iterations = dc < NEAR || n.warm ? ITER_NEAR : ITER_FAR;
        // (CPU fallback only, when the GPU solver is full: the old background step.)
        if (!wr.gpu) wr.maxSteps = 1; }
      // Inputs in simulation space.
      sim[0] = xf.ox + (n.x + n.offX - xf.ox) / xf.s; sim[2] = xf.oz + (n.z + n.offZ - xf.oz) / xf.s; sim[1] = xf.oy + (n.y - xf.oy) / xf.s;
      w.bx = sim[0]; w.by = sim[1]; w.bz = sim[2];
      w.vx = n.path ? Math.sin(n.yaw) * 1.05 / xf.s : (n.vx || 0) / xf.s; w.vz = n.path ? Math.cos(n.yaw) * 1.05 / xf.s : (n.vz || 0) / xf.s;
      if (n.hunch !== undefined) w.body.hunch = n.hunch;
      // Shown again (hidden, unsimulated, while far: a cut to them), or back in close after a long while unsimulated: settle the
      // cloth on the body where it is now. Its robe was still in the pose it was last drawn in, and a body that had moved less
      // than its own teleport threshold since flung it out for the first second of the shot.
      if (n.fresh || (step > 0.75 && dc < 30)) { w.teleport(); n.fresh = false; }
      // (A giant's time runs slower: its archetype's timeK, 1/√scale — or its robe flaps at a doll's speed.)
      const tk = n.A.timeK ?? 1;
      if (n.lookYaw !== undefined) { w.body.lookYaw = n.lookYaw; w.body.lookPitch = n.lookPitch; }
      w.yaw = n.yaw; w.grounded = true; w.dt = Math.min(step, 0.1) * tk; w.time = clock.simTime * tk;
      if (g.wind) { g.wind.sx = n.x; g.wind.sz = n.z; g.wind.sample(); w.windStrength = g.wind.speed * 0.9; w.windX = g.wind.outX; w.windZ = g.wind.outZ; }
      else { w.windStrength = wind; w.windX = g.wraithView.wraith.windX; w.windZ = g.wraithView.wraith.windZ; }
      if (n.gnd) w.windStrength = 0.12;   // a sealed interior: only the stir of their own moving
      // Carrying the basket: the left hand holds it out from the hip, the arm a little away from the body (its weight).
      if (n.costume?.basket) { const b = w.body; b.ikW[0] = 1; b.ikT[0] = -0.33; b.ikT[1] = -0.06; b.ikT[2] = 0.05; }
      n.view.time = clock.simTime;
      n.view.update();
      if (n.costume) placeCostume(n, w, xf, step);
      // Footprints where the feet planted (world space), sized to the figure.
      const gt = w.gait, ev = gt.ev;
      if (dc < 70 && !n.gnd) for (let e = 0; e < gt.evCount; e++) {
        const o = e * 7;
        footprints.ex = xf.ox + (ev[o] - xf.ox) * xf.s; footprints.ez = xf.oz + (ev[o + 2] - xf.oz) * xf.s;
        footprints.edx = ev[o + 3]; footprints.edz = ev[o + 4]; footprints.size = xf.s;
        footprints.stampFoot();
      }
      footprints.size = 1;
      // What they carry: a staff planted beside the right hand, a lantern hanging from the left.
      const prop = g.props?.[n.id];
      if (prop) {
        placeProp(prop, n, w, xf);
        if (prop.also) for (let a = 0; a < prop.also.length; a++) placeProp(prop.also[a], n, w, xf);
      }
      if (n.target) { const h = w.body.head; n.target.x = xf.ox + (h[0] - xf.ox) * xf.s; n.target.y = xf.oy + (h[1] - xf.oy) * xf.s; n.target.z = xf.oz + (h[2] - xf.oz) * xf.s; }
    }
    clothGpu.dispatch();
    g.costumes?.update();
    if (!capture && frame % 15 === 0) pressTrail();
    if (!capture) g.hud.line('tobin', chapter.graph.flags.has('escorting') ? (tobinWaiting ? 'Tobin has stopped. Go back for him.' : 'Lead Tobin home to the fire') : '', tobinWaiting);
    if (changed) engine.snapshotRenderingReset();
  } });
}
