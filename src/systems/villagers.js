// The people of Hearn and the fire night (data/quests/meadow.json, docs/village/plan-fire-quest.md).
//
// What this system does, in play order:
//  1. The north road: when the Wraith is near the road head (or the village) the quest "The Burning
//     Night" starts and the clock is pinned at 22:00 (core/clock.js pinTime) until the quest is done.
//     Wenna, a young woman with a lantern, stands at the road head. Talking to her sets
//     `meadow:guide-lead`; she then runs ahead along the north street to the square, stopping and
//     turning back whenever the Wraith falls more than ~22 m behind (game/villagers.js leadStep).
//  2. Arrival (`meadow:arrived`): the raid. This system ignites the 14 burning plots (village.firePlots,
//     the child's house first, one every 0.35 s) through the fire system's interface (below). The
//     villagers panic: buckets from the well, callers at the burning houses, the rest run to the
//     square and cower. Marit calls at Ebb's house; Ebb runs inside and cowers.
//  3. Ebb: the Wraith stands near him for a moment (or talks to him) and he follows, out of the door,
//     waiting if left behind; led past 12 m from the house to Marit he is handed over
//     (`meadow:ebb-saved`).
//  4. All fires out (`meadow:fires-out`) and Ebb saved: Hild thanks the Wraith and, when she has
//     spoken, sets `meadow:stair-open`. The gate across the stair foot (an invisible solid, see
//     world/solids.js addGate) is on until that flag; Doran stands at it and steps aside when it opens.
//
// Interface with the fire system (src/systems/villageFire.js, built separately; all optional — with
// no g.villageFire the raid has no fires and `meadow:fires-out` is set 3 s after arriving):
//   g.villageFire.ignite(plotId)            set that plot's building burning (idempotent)
//   g.villageFire.counts                    { burning, out }   buildings now burning / put out
//   g.villageFire.events                    array of { type: 'ignited' | 'out', plot: plotId }, appended
//                                           (read with a cursor; a shorter array than before = cleared)
//   g.villageFire.isBurning?(plotId)        optional, preferred over the events when present
// The fires are out when every plot has been lit and counts.burning is 0 (a building that burns
// down counts as no longer burning). The "(k/N)" on the task line is N − burning.
//
// Villagers are made on demand (the first time the Wraith is within 420 m of the road head or the
// square): 6 named + 10 others, each a full Veiled figure with a dyed robe.

import { pinTime, unpinTime } from '../core/clock.js';
import { LEAD, CHILD, makePath, pathAt, projectOnPath, newGuide, leadStep, newChild, childStep, stepToward, ringSlots, frontOf, nearestFirst, stairDir } from '../game/villagers.js';

const QUEST = 'meadow-the-burning-night';
const NIGHT_HOUR = 22;
const TINTS = { 'meadow-wenna': null, 'meadow-marit': [2.0, 1.2, 0.8], 'meadow-ebb': null, 'meadow-hild': null, 'meadow-corin': [1.3, 1.5, 1.0], 'meadow-doran': [1.2, 1.2, 1.7] };

/** @param {any} g  shared boot context */
export function addVillagerSystem(g) {
  const { loop, chapter, controller, hud, music, capture } = g;
  const V = chapter.data.village, village = g.village, api = g.npcApi;
  if (!V || !village || !api || capture) return;
  const graph = chapter.graph, flags = graph.flags, table = chapter.table, clock = g.clock;
  const plots = new Map(village.plots.map((p) => [p.id, p]));
  const M = V.market, road = table['meadow-road'].pos;
  const pos = (id) => table[id].pos;
  const ebbPlot = plots.get(V.childPlot), well = plots.get(V.wellPlot).at;
  const motherPos = pos('meadow-mother'), hallFront = pos('meadow-hall');
  const ebbDoor = frontOf(ebbPlot, 1.6);
  const fireIds = V.firePlots.filter((id) => plots.has(id)), N = fireIds.length;
  const wp = controller.pos;
  const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

  // The north street, run backwards: road head → square.
  const lists = V.guidePath.map((id) => village.roads.find((r) => r.id === id).pts.map((p) => p));
  if (V.guideReverse) for (const l of lists) l.reverse(); // each street runs square → north in the data; the guide goes the other way
  const path = makePath(lists);
  const guide = newGuide(path);
  const child = newChild(ebbPlot.at[0], ebbPlot.at[1]);
  child.mode = 'idle';
  const route = (g.routes || []).find((r) => r.id === 'manor-stair');
  const foot = table['stair-foot'].pos, sdir = route ? stairDir(route.points) : [0.77, 0.64];
  const srt = [sdir[1], -sdir[0]]; // across the stair

  // ── People ────────────────────────────────────────────────────────────────────────────────────
  const N_ = {}; // by id
  let spawned = false, restart = true, phase = 'calm', raidClock = 0;
  let seed = 11;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const slots = ringSlots(M[0], M[1], 7.5, V.folk.length, 0.4);
  const postOf = (f) => {
    const p = plots.get(f.post.plot), q = frontOf(p, f.post.out ?? 1.4);
    return [q[0], q[1], p.kind === 'stall' ? p.facing + Math.PI : p.facing];
  };

  function ensure() {
    if (spawned) return;
    if (dist(wp.x, wp.z, road[0], road[1]) > 420 && dist(wp.x, wp.z, M[0], M[1]) > 420) return;
    spawned = true;
    for (const d of chapter.data.npcs) if (d.lazy) {
      const n = api.make(d.id, d.name, d.archetype, api.place(d.home), { tint: TINTS[d.id] || undefined, interact: true });
      n.v = { nextShout: 3 + rnd() * 6 }; N_[d.id] = n;
    }
    V.folk.forEach((f, i) => {
      const post = postOf(f);
      const n = api.make(f.id, f.name, f.archetype, [post[0], post[1]], { tint: f.tint, interact: !!chapter.data.talk?.[f.id] });
      n.v = { role: f.role, post, slot: slots[i], k: i, delay: 0.3 + rnd() * 2.6, b: 0, bt: 0, nextShout: rnd() * 8, yawPost: post[2] };
      n.yaw = post[2]; n.brain = folkBrain; N_[f.id] = n;
    });
    N_['meadow-wenna'].brain = wennaBrain; N_['meadow-marit'].brain = maritBrain; N_['meadow-ebb'].brain = ebbBrain;
    N_['meadow-hild'].brain = hildBrain; N_['meadow-corin'].brain = corinBrain; N_['meadow-doran'].brain = doranBrain;
    restart = true;
  }

  // ── Small helpers ─────────────────────────────────────────────────────────────────────────────
  const dW = (n) => dist(wp.x, wp.z, n.x, n.z);
  const halt = (n) => { n.vx = 0; n.vz = 0; };
  const hunchTo = (n, target, dt) => { const h = n.hunch ?? n.A.hunch; n.hunch = h + (target - h) * Math.min(1, dt * 2.5); };
  let lastShout = -1e9;
  /** One short spoken line, from a figure near the Wraith, never over a conversation or too often. */
  function shout(n, key, every) {
    const t = clock.simTime;
    if (t < n.v.nextShout) return;
    n.v.nextShout = t + every * (0.8 + rnd() * 0.5);
    if (chapter.talking || dW(n) > 26 || t - lastShout < 3.2) return;
    const lines = V.shouts[key]; if (!lines) return;
    n.v.said = (n.v.said || 0) + 1;
    hud.bark(n.name, lines[(n.v.said + (n.v.k || 0)) % lines.length], 4);
    lastShout = t;
  }
  /** Walk to (tx, tz); standing there, face `yaw` (or the Wraith when `look`). Returns true on arrival. */
  function goStand(n, tx, tz, top, dt, yaw) {
    const d = dist(n.x, n.z, tx, tz);
    if (d > 0.5) { stepToward(n, tx, tz, 0, top, dt); return false; }
    halt(n); if (yaw !== undefined) n.yaw = yaw;
    return true;
  }

  // ── Fires: the burning set and the fire system ────────────────────────────────────────────────
  const lit = new Set(), outSet = new Set();
  let cursor = 0, queue = [], igniteT = 0, relightT = -1, burnCache = [], burnT = 0, doneT = 0, fallbackT = 0;
  const plotXZ = (id) => plots.get(id).at;
  function readEvents() {
    const vf = g.villageFire; if (!vf || !Array.isArray(vf.events)) return;
    if (vf.events.length < cursor) cursor = 0;
    for (; cursor < vf.events.length; cursor++) {
      const e = vf.events[cursor];
      if (e.type === 'ignited') { lit.add(e.plot); outSet.delete(e.plot); } else if (e.type === 'out') outSet.add(e.plot);
    }
  }
  function burningNow() {
    const vf = g.villageFire; burnCache.length = 0;
    for (const id of fireIds) {
      if (typeof vf?.isBurning === 'function' ? vf.isBurning(id) : (lit.has(id) && !outSet.has(id))) burnCache.push(id);
    }
    return burnCache;
  }
  function burningCount() { const vf = g.villageFire; return vf?.counts ? vf.counts.burning : burningNow().length; }
  function startRaid() {
    flags.add('meadow:raid');
    queue = nearestFirst(village.plots, fireIds, M[0], M[1]);
    queue.splice(queue.indexOf(V.childPlot), 1); queue.unshift(V.childPlot); // the child's house first
    igniteT = 0.6;
  }
  function fireTick(dt) {
    if (flags.has('meadow:arrived') && !flags.has('meadow:raid')) startRaid();
    const vf = g.villageFire;
    if (queue.length) {
      igniteT -= dt;
      if (igniteT <= 0) {
        if (vf) vf.ignite(queue.shift()); else queue.shift();
        igniteT = 0.35;
        if (!queue.length) flags.add('meadow:raid-lit');
      }
    }
    if (!vf) {
      if (flags.has('meadow:raid-lit') && !flags.has('meadow:fires-out')) { fallbackT += dt; if (fallbackT > 3) fires_out(); }
      return;
    }
    readEvents();
    // A load in the middle of the raid: if the fire system did not bring its fires back, light them again.
    if (relightT >= 0) {
      relightT -= dt;
      if (relightT < 0 && flags.has('meadow:raid') && !flags.has('meadow:fires-out') && vf.counts && vf.counts.burning + vf.counts.out === 0) {
        queue = [...fireIds]; igniteT = 0.2; flags.delete('meadow:raid-lit');
      }
    }
    if (flags.has('meadow:raid-lit') && !flags.has('meadow:fires-out')) {
      const c = vf.counts, litAll = lit.size >= N || (c && c.burning + c.out >= N);
      if (litAll && burningCount() === 0) { doneT += dt; if (doneT > 1.2) fires_out(); } else doneT = 0;
    }
  }
  function fires_out() {
    flags.add('meadow:fires-out'); chapter.raise('meadow:fires-out');
    hud.notice('Hearn', 'The fires are out', flags.has('meadow:ebb-saved') ? 'Talk to Elder Hild at the hall.' : 'Ebb is still in his house.', 6);
  }

  // ── Wenna: the guide ──────────────────────────────────────────────────────────────────────────
  function wennaBrain(n, dt) {
    if (restart) {
      restart = false;
      if (flags.has('meadow:arrived')) guide.s = path.length;
      else if (flags.has('meadow:guide-lead')) guide.s = Math.min(path.length, projectOnPath(path, wp.x, wp.z) + 6);
      else guide.s = 0;
      const p = pathAt(path, guide.s); guide.x = p[0]; guide.z = p[1]; guide.yaw = p[2]; guide.speed = 0;
      api.put(n, guide.x, guide.z);
    }
    const q = graph.quests[QUEST];
    if (!flags.has('meadow:guide-lead')) {
      // The Wraith came into the village first (the hub): she is already at the square.
      if (q.state === 'active' && dist(wp.x, wp.z, V.market[0], V.market[1]) < 170 && dist(wp.x, wp.z, road[0], road[1]) > 260) {
        guide.s = path.length - 4; const p = pathAt(path, guide.s); guide.x = p[0]; guide.z = p[1]; api.put(n, guide.x, guide.z);
      }
      halt(n); guide.vx = 0; guide.vz = 0;
      if (dW(n) < 14) n.yaw = Math.atan2(wp.x - n.x, wp.z - n.z);
      n.noLook = true; n.hunch = undefined;
    } else if (!flags.has('meadow:arrived')) {
      leadStep(guide, wp.x, wp.z, dt, path);
      n.x = guide.x; n.z = guide.z; n.vx = guide.vx; n.vz = guide.vz; n.yaw = guide.yaw; n.noLook = true;
      hunchTo(n, 0.02, dt);
      if (guide.waiting) shout(n, 'guideWait', 7); else if (guide.speed > 1) shout(n, 'guideLead', 11);
      if (guide.arrived) arrive(n);
    } else {
      halt(n); n.noLook = false;
      if (phase === 'raid') { n.noLook = true; n.yaw = Math.atan2(plotXZ(V.childPlot)[0] - n.x, plotXZ(V.childPlot)[1] - n.z); }
    }
  }
  function arrive(n) {
    flags.add('meadow:arrived'); chapter.raise('meadow:arrived');
    halt(n); n.v.nextShout = 0;
    hud.bark(n.name, V.shouts.guideArrive[0], 5);
    hud.notice('Hearn', 'The village is burning', 'The Shaped came down from the hill at dusk.', 7);
    music.sting?.('echo');
    startRaid();
  }

  // ── Marit, Hild, Corin, Doran ─────────────────────────────────────────────────────────────────
  function maritBrain(n, dt) {
    if (!flags.has('meadow:raid')) { goStand(n, motherPos[0], motherPos[1], 1.5, dt); n.noLook = false; return; }
    goStand(n, motherPos[0], motherPos[1], 3.2, dt);
    if (!flags.has('meadow:ebb-saved')) {
      n.noLook = true; n.yaw = Math.atan2(ebbPlot.at[0] - n.x, ebbPlot.at[1] - n.z); hunchTo(n, 0.2, dt);
      shout(n, 'marit', 8);
    } else { n.noLook = false; hunchTo(n, n.A.hunch, dt); }
  }
  function hildBrain(n, dt) {
    goStand(n, hallFront[0], hallFront[1], 1.5, dt);
    n.noLook = false;
    if (phase === 'raid' && dW(n) > 12) { n.noLook = true; n.yaw = Math.atan2(M[0] - n.x, M[1] - n.z); }
  }
  const corinA = [M[0] + 10, M[1] - 9], corinB = [M[0] + 2, M[1] - 14];
  function corinBrain(n, dt) {
    const v = n.v;
    if (phase !== 'raid') { n.noLook = false; goStand(n, corinA[0], corinA[1], 1.5, dt); return; }
    const to = v.leg ? corinB : corinA;
    if (v.pause > 0) { v.pause -= dt; halt(n); n.noLook = true; n.yaw = Math.atan2(foot[0] - n.x, foot[1] - n.z); }
    else if (goStand(n, to[0], to[1], 1.7, dt)) { v.leg = !v.leg; v.pause = 3; }
    else n.noLook = true;
    shout(n, 'corin', 9);
  }
  const doorSpot = [foot[0] - sdir[0] * 1.8 + srt[0] * 2.2, foot[1] - sdir[1] * 1.8 + srt[1] * 2.2];
  const asideSpot = [foot[0] - sdir[0] * 1.8 + srt[0] * 7.0, foot[1] - sdir[1] * 1.8 + srt[1] * 7.0];
  function doranBrain(n, dt) {
    const open = flags.has('meadow:stair-open'), s = open ? asideSpot : doorSpot;
    goStand(n, s[0], s[1], 1.6, dt, Math.atan2(sdir[0], sdir[1]) + (open ? 1.4 : 0));
    n.noLook = !open && dW(n) > 14; n.hunch = undefined;
  }

  // ── Ebb ───────────────────────────────────────────────────────────────────────────────────────
  function ebbBrain(n, dt) {
    const st = child;
    if (n.v.fresh === undefined || n.v.loadId !== loadId) {
      n.v.fresh = true; n.v.loadId = loadId;
      if (flags.has('meadow:ebb-saved') || flags.has('meadow:stair-open')) { st.mode = 'home'; st.saved = true; st.x = motherPos[0] + 1.1; st.z = motherPos[1] + 0.6; }
      else if (flags.has('meadow:ebb-follow')) {
        st.mode = 'follow'; const b = controller.yaw + Math.PI;
        st.x = wp.x + Math.sin(b) * 2.5; st.z = wp.z + Math.cos(b) * 2.5;
      } else if (flags.has('meadow:raid')) { st.mode = 'cower'; st.x = ebbPlot.at[0]; st.z = ebbPlot.at[1]; }
      else { st.mode = 'idle'; st.x = ebbDoor[0]; st.z = ebbDoor[1]; }
      st.out = false; st.dwell = 0; api.put(n, st.x, st.z);
    }
    childStep(st, { wx: wp.x, wz: wp.z, follow: flags.has('meadow:ebb-follow'), house: ebbPlot.at, door: ebbDoor, mother: motherPos, raid: flags.has('meadow:raid') }, dt);
    n.x = st.x; n.z = st.z; n.vx = st.vx; n.vz = st.vz; n.yaw = st.yaw; n.hunch = st.hunch;
    n.noLook = st.mode === 'cower' || st.mode === 'hide' || st.mode === 'follow';
    if (st.mode === 'cower' && st.dwell > CHILD.dwell && !chapter.talking && !flags.has('meadow:ebb-follow')) { st.dwell = -4; chapter.talk(n.id); }
    if (st.out && !flags.has('meadow:ebb-out')) { flags.add('meadow:ebb-out'); hud.notice('The Burning Night', 'Ebb is out of the house', 'Lead him to his mother, Marit, in the square.', 6); }
    if (st.saved && !flags.has('meadow:ebb-saved')) {
      flags.add('meadow:ebb-saved'); chapter.raise('meadow:ebb-saved');
      hud.notice('The Burning Night', 'Ebb is safe', 'He is with his mother.', 6);
      const m = N_['meadow-marit']; if (m) hud.bark(m.name, 'Ebb! Oh, Ebb! Come here!', 5);
      if (flags.has('meadow:fires-out')) hud.notice('Hearn', 'Talk to Elder Hild', 'She is at the hall.', 6);
    }
  }
  let loadId = 0;
  { const prev = g.navSync; g.navSync = () => { prev?.(); restart = true; loadId++; relightT = 1.5; cursor = 0; lit.clear(); outSet.clear(); queue.length = 0; doneT = 0; if (spawned) { guide.arrived = false; } }; }

  // ── The others: calm at their posts; on the fire night buckets, callers, and those who cower ──
  function folkBrain(n, dt) {
    const v = n.v;
    if (phase === 'after') {
      n.noLook = false; hunchTo(n, n.A.hunch, dt); goStand(n, v.slot[0], v.slot[1], 1.8, dt, Math.atan2(M[0] - v.slot[0], M[1] - v.slot[1]));
      return;
    }
    if (phase !== 'raid' || raidClock < v.delay) {
      n.noLook = false; hunchTo(n, n.A.hunch, dt); goStand(n, v.post[0], v.post[1], 1.5, dt, v.yawPost);
      return;
    }
    const burn = burningNow();
    let role = v.role;
    if (!burn.length && role !== 'huddle') role = 'huddle';
    if (role === 'huddle') {
      const arrived = goStand(n, v.slot[0], v.slot[1], 3.6, dt, Math.atan2(M[0] - v.slot[0], M[1] - v.slot[1]));
      n.noLook = arrived;
      if (arrived) { hunchTo(n, 0.55, dt); shout(n, 'huddle', 14); } else hunchTo(n, 0.2, dt);
    } else if (role === 'caller') {
      const f = plotXZ(burn[v.k % burn.length]), ux = M[0] - f[0], uz = M[1] - f[1], l = Math.hypot(ux, uz) || 1;
      const px = -uz / l, pz = ux / l, sway = Math.sin(clock.simTime * 0.9 + v.k) * 1.3;
      const tx = f[0] + ux / l * 9 + px * sway, tz = f[1] + uz / l * 9 + pz * sway;
      goStand(n, tx, tz, 3.4, dt);
      n.noLook = true; n.yaw = Math.atan2(f[0] - n.x, f[1] - n.z); hunchTo(n, 0.15, dt);
      shout(n, 'caller', 7);
    } else { // bucket: the well, then toward a burning house, then back
      const f = plotXZ(burn[(v.k + v.b) % burn.length]);
      n.noLook = true; hunchTo(n, 0.1, dt);
      if (v.bt > 0) { v.bt -= dt; halt(n); n.yaw = Math.atan2((v.b % 2 ? f[0] : well[0]) - n.x, (v.b % 2 ? f[1] : well[1]) - n.z); if (v.bt <= 0) v.b++; }
      else if (v.b % 2 === 0) { if (goStand(n, well[0] + 1.2, well[1] + 1.2, 3.2, dt)) { v.bt = 1.2; } }
      else {
        const ux = well[0] - f[0], uz = well[1] - f[1], l = Math.hypot(ux, uz) || 1;
        if (goStand(n, f[0] + ux / l * 7, f[1] + uz / l * 7, 3.0, dt)) { v.bt = 1.0; shout(n, 'bucket', 6); }
      }
    }
  }

  // ── Navigation goals (dynamic quest goals) ────────────────────────────────────────────────────
  const goals = { guide: { x: 0, z: 0, name: 'Wenna' }, fire: { x: 0, z: 0, name: 'A burning house' }, ebb: { x: 0, z: 0, name: 'Ebb' }, one: { x: 0, z: 0, name: '' } };
  const at = (id, o) => { const n = N_[id]; if (!n) { const p = id === 'meadow-wenna' ? road : M; o.x = p[0]; o.z = p[1]; } else { o.x = n.x; o.z = n.z; } return o; };
  g.navDynamic['meadow-guide'] = () => at('meadow-wenna', goals.guide);
  g.navDynamic['meadow-marit'] = () => at('meadow-marit', Object.assign(goals.one, { name: 'Marit' }));
  g.navDynamic['meadow-hild'] = () => at('meadow-hild', Object.assign(goals.one, { name: 'Elder Hild' }));
  g.navDynamic['meadow-corin'] = () => at('meadow-corin', Object.assign(goals.one, { name: 'Corin' }));
  g.navDynamic['meadow-fire'] = () => {
    let best = 1e18, bx = null;
    for (const id of burningNow()) { const p = plotXZ(id), d = dist(p[0], p[1], wp.x, wp.z); if (d < best) { best = d; bx = p; } }
    if (!bx) return null;
    goals.fire.x = bx[0]; goals.fire.z = bx[1]; return goals.fire;
  };
  g.navDynamic['meadow-ebb'] = () => {
    if (flags.has('meadow:ebb-follow') && !flags.has('meadow:ebb-saved')) { goals.ebb.x = motherPos[0]; goals.ebb.z = motherPos[1]; goals.ebb.name = 'Marit'; }
    else { goals.ebb.x = ebbPlot.at[0]; goals.ebb.z = ebbPlot.at[1]; goals.ebb.name = 'Ebb'; }
    return goals.ebb;
  };

  // ── The stair gate and the night ──────────────────────────────────────────────────────────────
  let gate = null, pinned = false;
  function gateTick() {
    if (!gate && g.solids?.addGate) {
      gate = g.solids.addGate(foot[0] + sdir[0] * 4.0, foot[1] + sdir[1] * 4.0, 15, 1.0, Math.atan2(sdir[0], sdir[1]));
      g.stairGate = gate;
    }
    if (gate) gate.on = !flags.has('meadow:stair-open');
  }

  loop.add({ name: 'villagers', update: () => {
    const dt = clock.dt;
    ensure();
    const q = graph.quests[QUEST];
    const want = q.state === 'active';
    if (want !== pinned) { pinned = want; if (want) pinTime(NIGHT_HOUR); else unpinTime(); }
    phase = !flags.has('meadow:arrived') || flags.has('meadow:stair-open') ? 'calm' : !flags.has('meadow:fires-out') ? 'raid' : 'after';
    raidClock = phase === 'raid' ? raidClock + dt : 0;
    gateTick();
    fireTick(dt);
    // The task line: Ebb, the guide, the fires.
    let text = '', alarm = false;
    if (flags.has('meadow:ebb-follow') && !flags.has('meadow:ebb-saved')) {
      text = child.waiting ? 'Ebb has stopped. Go back for him.' : 'Lead Ebb to his mother, Marit'; alarm = child.waiting;
    } else if (flags.has('meadow:guide-lead') && !flags.has('meadow:arrived')) {
      text = guide.waiting ? 'Wenna has stopped. Catch up with her.' : 'Follow Wenna to Hearn'; alarm = guide.waiting;
    } else if (phase === 'raid' && flags.has('meadow:raid-lit') && !flags.has('meadow:fires-out')) {
      text = `Put out the fires (${Math.max(0, N - burningCount())}/${N})`;
    }
    hud.line('meadow', text, alarm);
  } });

  g.meadowFire = { get phase() { return phase; }, fireIds, N, guide, child, path };
}

export { LEAD, CHILD };
