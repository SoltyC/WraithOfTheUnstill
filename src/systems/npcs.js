// The Veiled in the world (BRIEF §8.2): the chapter's named NPCs at their places, and an ambient
// pilgrim walking the path between the camp and the shrine below the cliffs. Each is a full robe
// figure (the Wraith's cloth, gait and body; character/veiled.js) with procedural idle life:
// breathing, a posture shift every few seconds (a corrective step), turning toward the Wraith when
// it comes near, cloth in the wind, footprints where its feet plant.
//
// LOD: full rate within 60 m of the camera, every third frame out to 260 m, hidden beyond (or until
// the ground there is known: anchor patches keep it known around the camp and the other places).

import { createWraithView } from '../render/wraith.js';
import { ARCHETYPES, scaledGround } from '../character/veiled.js';

const NEAR = 60, FAR = 260, TALK_R = 3.2, LOOK_R = 9;

/** @param {any} g  shared boot context */
export function addNpcSystems(g) {
  const { loop, scene, atmosphere, ground, content, shadows, bindShadows, camera, controller, clock, params, weather, restoration, footprints, engine, chapter, streamer, capture } = g;
  const data = chapter.data, table = chapter.table;
  const npcs = g.npcs = [];
  const sim = [0, 0, 0];
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  function place(ref) { const p = table[ref.poi].pos; return [p[0] + (ref.dx || 0), p[1] + (ref.dz || 0)]; }

  function makeNpc(id, name, archetype, home) {
    const A = ARCHETYPES[archetype];
    const xf = { ox: home[0], oy: 0, oz: home[1], s: A.scale };
    const view = createWraithView(scene, atmosphere, ground, content.clipmap, { veiled: true, name: 'veiled-' + id, tint: A.tint, simGround: scaledGround(ground, xf), xform: xf });
    bindShadows(view.material, shadows); bindShadows(view.fur.material, shadows); bindShadows(view.fx.material, shadows);
    shadows.addCaster(view.mesh, view.makeShadowMaterial, 1);
    view.freeze();
    view.cowlLight = 0;
    view.handLight = A.lantern ? 1 : 0; view.handLightR = 0;
    if (A.lantern) { view.handGlow = [1.2, 0.72, 0.32]; view.handGlowSize = 0.11; }
    view.setEnabled(false);
    const w = view.wraith;
    w.body.hunch = A.hunch; w.body.breath = A.breath;
    const n = {
      id, name, archetype, A, view, xf, home, x: home[0], z: home[1], y: 0, yaw: rnd() * 6.28,
      shown: false, placed: false, shiftT: A.shift[0] + rnd() * (A.shift[1] - A.shift[0]), offX: 0.5 - 0.5, offZ: 0.5 - 0.5,
      lod: 0.5 - 0.5, path: null, pathT: 0.5 - 0.5, at: null,
      target: name ? { kind: 'npc', id, verb: 'Speak', name, x: 0.5, y: 0.5, z: 0.5, r: TALK_R, h: 0.25, hidden: true } : null,
    };
    if (n.target) g.interactables.push(n.target);
    npcs.push(n);
    return n;
  }

  for (const d of data.npcs) makeNpc(d.id, d.name, d.archetype, place(d.home));
  // Ambient pilgrim: walks between the fire and the shrine below the cliffs, and back.
  const camp = table['camp-frost'].pos, shrine = table['shrine-frost-2'].pos;
  const walker = makeNpc('pilgrim-1', null, 'pilgrim', [camp[0] - 6, camp[1] - 6]);
  walker.path = [[camp[0] - 6, camp[1] - 6], [camp[0] - 160, camp[1] - 70], [(camp[0] + shrine[0]) / 2, (camp[1] + shrine[1]) / 2 + 30], [shrine[0] + 12, shrine[1] + 10]];
  walker.pathLen = 0;
  for (let k = 1; k < walker.path.length; k++) walker.pathLen += Math.hypot(walker.path[k][0] - walker.path[k - 1][0], walker.path[k][1] - walker.path[k - 1][1]);
  walker.pathT = rnd() * walker.pathLen * 2;

  // Keep the ground known where they live (anchor patches 1…).
  const anchors = [camp, table['spring-frost'].pos, table['varo-rise'].pos, table.monastery.pos, [(camp[0] + shrine[0]) / 2, (camp[1] + shrine[1]) / 2]];
  if (!capture) anchors.forEach((p, i) => streamer.setAnchor(1 + i, p[0], p[1]));

  /** Where an NPC should be now (quest state moves some: the lost child). */
  const tobinLost = place(data.npcs.find((d) => d.id === 'tobin').lost);
  function station(n) {
    if (n.id === 'tobin') {
      const q = chapter.graph.quests['trail-in-snow'];
      if (q && q.state === 'active' && !chapter.graph.flags.has('tobin-found')) return tobinLost;
    }
    return n.home;
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

  loop.add({ name: 'npcs', update: () => {
    frame++;
    const cp = camera.position, p = controller.pos, dt = clock.dt;
    const wind = params.v.windStrength * weather.wind * (0.04 + 0.96 * restoration.value);
    let changed = false;
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i], w = n.view.wraith, xf = n.xf;
      // Station (and the walker's path).
      if (n.path) {
        n.pathT += dt * 1.05;
        pathPoint(n, n.pathT, pp);
        n.x = pp[0]; n.z = pp[1]; n.yaw = pp[2];
      } else {
        const st = station(n);
        if (n.at !== st) {
          // Moved by the story: re-home out of sight (a figure never pops in view).
          const dx = st[0] - cp.x, dz = st[1] - cp.z, sx = n.x - cp.x, sz = n.z - cp.z;
          if (!n.at || ((dx * dx + dz * dz > 90 * 90) && (sx * sx + sz * sz > 90 * 90))) { n.at = st; n.x = st[0]; n.z = st[1]; xf.ox = st[0]; xf.oz = st[1]; n.placed = false; }
        }
      }
      const dcx = n.x - cp.x, dcz = n.z - cp.z, dc = Math.sqrt(dcx * dcx + dcz * dcz);
      ground.qx = n.x; ground.qz = n.z;
      const known = ground.covers();
      const show = known && dc < FAR;
      if (show !== n.shown) {
        n.shown = show; n.view.setEnabled(show); changed = true; if (!show) n.placed = false;
        const prop = g.props?.[n.id];
        if (prop && !show) g.architecture.sites[prop.index * 4 + 3] = 0;
      }
      if (n.target) n.target.hidden = !show;
      if (!show) continue;
      ground.sample(); n.y = ground.h;
      if (!n.placed) { xf.oy = n.y; n.placed = true; }
      // Idle life: shift weight now and then (a small corrective step), turn toward the Wraith.
      if (!n.path) {
        n.shiftT -= dt;
        if (n.shiftT <= 0) { n.shiftT = n.A.shift[0] + rnd() * (n.A.shift[1] - n.A.shift[0]); n.offX = (rnd() - 0.5) * 0.16; n.offZ = (rnd() - 0.5) * 0.16; }
        const tx = p.x - n.x, tz = p.z - n.z;
        if (tx * tx + tz * tz < LOOK_R * LOOK_R) n.yaw = Math.atan2(tx, tz);
      }
      // LOD: near every frame; farther every third frame (with the time it missed).
      n.lod += dt;
      if (dc > NEAR && frame % 3 !== i % 3) continue;
      const step = n.lod; n.lod = 0;
      // Inputs in simulation space.
      sim[0] = xf.ox + (n.x + n.offX - xf.ox) / xf.s; sim[2] = xf.oz + (n.z + n.offZ - xf.oz) / xf.s; sim[1] = xf.oy + (n.y - xf.oy) / xf.s;
      w.bx = sim[0]; w.by = sim[1]; w.bz = sim[2];
      w.vx = n.path ? Math.sin(n.yaw) * 1.05 / xf.s : 0; w.vz = n.path ? Math.cos(n.yaw) * 1.05 / xf.s : 0;
      w.yaw = n.yaw; w.grounded = true; w.dt = Math.min(step, 0.1); w.time = clock.simTime;
      w.windStrength = wind; w.windX = g.wraithView.wraith.windX; w.windZ = g.wraithView.wraith.windZ;
      n.view.time = clock.simTime;
      n.view.update();
      // Footprints where the feet planted (world space), sized to the figure.
      const gt = w.gait, ev = gt.ev;
      if (dc < 70) for (let e = 0; e < gt.evCount; e++) {
        const o = e * 7;
        footprints.ex = xf.ox + (ev[o] - xf.ox) * xf.s; footprints.ez = xf.oz + (ev[o + 2] - xf.oz) * xf.s;
        footprints.edx = ev[o + 3]; footprints.edz = ev[o + 4]; footprints.size = xf.s;
        footprints.stampFoot();
      }
      footprints.size = 1;
      // What they carry: a staff planted beside the right hand, a lantern hanging from the left.
      const prop = g.props?.[n.id];
      if (prop) {
        const b = w.body, sites = g.architecture.sites, o = prop.index * 4, k = prop.kind === 'lantern' ? 0 : 3;
        const hx = xf.ox + (b.ha[k] - xf.ox) * xf.s, hy = xf.oy + (b.ha[k + 1] - xf.oy) * xf.s, hz = xf.oz + (b.ha[k + 2] - xf.oz) * xf.s;
        if (prop.kind === 'lantern') { sites[o] = hx; sites[o + 1] = hy - 0.02; sites[o + 2] = hz; }
        else { ground.qx = hx; ground.qz = hz; ground.sample(); sites[o] = hx; sites[o + 1] = ground.h - 0.05; sites[o + 2] = hz; }
        sites[o + 3] = 1;
      }
      if (n.target) { const h = w.body.head; n.target.x = xf.ox + (h[0] - xf.ox) * xf.s; n.target.y = xf.oy + (h[1] - xf.oy) * xf.s; n.target.z = xf.oz + (h[2] - xf.oz) * xf.s; }
    }
    if (!capture && frame % 15 === 0) pressTrail();
    if (changed) engine.snapshotRenderingReset();
  } });
}
