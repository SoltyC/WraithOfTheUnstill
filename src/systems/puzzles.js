// The dunes' Silent Instruments in the world (docs/phase-9/dunes-design.md §4.2): one pool of moving chunks
// (game/puzzles/props.js) drawn only near a site, and each site's machine (game/puzzles/<site>.js) fed from
// the world: Crystallize and Gust through the terrain brush, the sun, the Wraith's Interact.

import { BRUSH } from '../shaders/terrainState.wgsl.js';
import { CHUNK } from '../game/shaped/rig.js';
import { createProps } from '../game/puzzles/props.js';
import { createSunGate, STAGE, EV, SG, SUN_SITE, LAYOUT } from '../game/puzzles/sunGate.js';
import { addHourglassSite, buildHourglass } from './puzzleHourglass.js';
import { addSingingSite, buildSinging } from './puzzleSinging.js';
import { addSideSites, buildSides } from './puzzleSides.js';

const SHOW_R = 260;      // m: the pool draws within this of a site
const MOTES = 64;        // light along a beam
const FALL = 18;         // chunks in a running sandfall
const EYE_Y = 11.5;      // m above the ground: the gate's eye, in the lintel's slot

/** The pool and its one view: while the world is built, so its pipelines warm with the rest. */
export async function addPuzzleBody(g) {
  const { scene, atmosphere, bindShadows, shadows } = g;
  const props = g.puzzleProps = createProps(1040);
  buildSunGate(g, props);
  buildHourglass(g, props);
  buildSinging(g, props);
  buildSides(g, props);
  props.write();
  const { createShapedView } = await import('../render/shapedView.js');
  const view = createShapedView(scene, atmosphere, props.chunks, { name: 'puzzleProps', subdivisions: 2 });
  bindShadows(view.material, shadows);
  shadows.addCaster(view.mesh, view.makeShadowMaterial, 1);
  view.freeze();
  g.puzzleView = view;
}

/** The Sun Gate's moving parts: built once, seated when the Wraith first comes near. */
function buildSunGate(g, P) {
  const { RUIN, GLASS, POD, WATER, ICE, SAND, SANDSTONE } = CHUNK;
  const mirror = () => {
    const m = P.group();
    P.add(m, 0, 0.55, -0.25, 0.8, 1.1, 0.6, SANDSTONE, { glow: 0 });
    P.add(m, 0, 1.8, -0.3, 2.9, 2.7, 0.45, RUIN, { glow: 0 });
    P.add(m, 0, 1.8, -0.02, 2.2, 1.9, 0.16, GLASS, { glow: 0 });
    return m;
  };
  const dot = () => { const d = P.group(); P.add(d, 0, 0, 0, 0.8, 0.8, 0.8, POD); return d; };
  const water = P.group(); P.add(water, 0, 0, 0, 5.2, 0.28, 5.2, WATER, { glow: 0 });
  const lens = P.group(); P.add(lens, 0, 0.5, 0, 3.4, 1.5, 3.4, ICE, { glow: 0 });
  const eye = P.group(); P.add(eye, 0, 0, 0, 1.8, 1.8, 0.7, GLASS, { glow: 0 }); P.add(eye, 0, 0, 0, 1, 1, 0.8, POD);
  const fall = [];
  for (let k = 0; k < FALL; k++) { const f = P.group(); P.add(f, 0, 0, 0, 0.8, 1.5, 0.8, SAND, { glow: 0 }); fall.push(f); }
  const column = P.group();
  for (let k = 0; k < 5; k++) P.add(column, Math.sin(k * 2.1) * 0.15, 0.8 + k * 1.5, Math.cos(k * 1.7) * 0.15, 2.2 - k * 0.1, 2.1, 2.2 - k * 0.1, ICE, { glow: 0 });
  const motes = [];
  for (let k = 0; k < MOTES; k++) { const m = P.group(); P.add(m, 0, 0, 0, 0.26, 0.26, 1.5, POD, { glow: 0.8 }); motes.push(m); }
  g.sunGateParts = { m1: mirror(), m2: mirror(), water, lens, eye, fall, column, motes, g1: dot(), g2: dot() };
}

export function addPuzzleSystem(g) {
  const { loop, controller, chapter, hud, sfx, SFX, terrainState: ts, ground, clock, engine, capture, camera, qs } = g;
  const P = g.puzzleProps, view = g.puzzleView, flags = chapter.graph.flags;
  const gate = g.sunGate = createSunGate(), X = g.sunGateParts;
  const FLAG = ['dunes:sg-teach', 'dunes:sg-combine', 'dunes:sg-twist'];
  const SOLVED = 'dunes:instrument-sun';
  gate.restore(flags.has(SOLVED) ? STAGE.DONE : flags.has(FLAG[1]) ? STAGE.TWIST : flags.has(FLAG[0]) ? STAGE.COMBINE : STAGE.TEACH);
  if (qs?.get('sungate')) gate.restore(Number(qs.get('sungate')));

  const wx = (u) => SUN_SITE[0] + u, wz = (v) => SUN_SITE[1] + v;
  const groundAt = (x, z) => { ground.qx = x; ground.qz = z; ground.sample(); return ground.h; };
  const tell = (title, sub, text, secs = 8) => { if (!capture) hud.notice(title, sub, text, secs); };
  const chime = (k, gain = 1) => { const p = controller.pos; sfx.x = p.x; sfx.y = p.y; sfx.z = p.z; sfx.gain = gain; sfx.play(k); };

  // Crystallize and Gust, wherever they are cast, come through the terrain brush.
  if (ts) {
    const stamp = ts.stamp.bind(ts);
    ts.stamp = function () {
      if (ts.bk === BRUSH.FREEZE) { gate.freeze(ts.bx - SUN_SITE[0], ts.bz - SUN_SITE[1]); hourglass.freeze(ts.bx, ts.bz); singing.freeze(ts.bx, ts.bz); }
      else if (ts.bk === BRUSH.PLOUGH) hourglass.plough(ts.bx, ts.bz);
      else if (ts.bk === BRUSH.FLATTEN && Math.hypot(ts.bx - wx(LAYOUT.fall[0]), ts.bz - wz(LAYOUT.fall[1])) < SG.freezeR) gate.gust();
      sides.brush(ts.bk, ts.bx, ts.bz);
      return stamp();
    };
  }

  // Interact: the two mirrors, the frozen column.
  const target = (id, verb, name, p, onUse, y = 1.6) => {
    const t = { kind: 'puzzle', id, verb, name, x: wx(p[0]), y: 0, z: wz(p[1]), r: 3.2, h: 2.6, hy: y, hidden: true, onUse };
    g.interactables?.push(t); return t;
  };
  const turned = (k) => () => { gate.turn(k); chime(SFX.CLANG, 0.5); };
  const t1 = target('sg-mirror-1', 'Turn', 'Mirror-stone', LAYOUT.m1, turned(0));
  const t2 = target('sg-mirror-2', 'Turn', 'Mirror-stone', LAYOUT.m2, turned(1));
  const tc = target('sg-column', 'Strike', 'Frozen sand', LAYOUT.fall, () => { if (gate.strike()) { chime(SFX.SHATTER, 1.2); tell('The fall', 'It shatters', 'The eye stands clear. The sand will come again.', 5); } });

  const hourglass = addHourglassSite(g, P, tell, chime), singing = addSingingSite(g, P, tell, chime), sides = addSideSites(g, P, tell, chime);
  let seated = false, shown = true, frames = 0, phase = 0;
  const h = {};
  function seat() {
    for (const k of Object.keys(LAYOUT)) h[k] = groundAt(wx(LAYOUT[k][0]), wz(LAYOUT[k][1]));
    t1.y = h.m1; t2.y = h.m2; tc.y = h.fall;
    P.pose(X.m1, wx(LAYOUT.m1[0]), h.m1 + 1, wz(LAYOUT.m1[1]), 0);
    P.pose(X.water, wx(LAYOUT.basin[0]), h.basin + 0.3, wz(LAYOUT.basin[1]), 0);
    P.pose(X.g1, wx(LAYOUT.g1[0]), h.g1 + 2.4, wz(LAYOUT.g1[1]) + 0.55, 0);
    P.pose(X.g2, wx(LAYOUT.g2[0]), h.g2 + 2.4, wz(LAYOUT.g2[1]) + 0.55, 0);
    P.pose(X.lens, wx(LAYOUT.basin[0]), h.basin + 0.3, wz(LAYOUT.basin[1]), 0);
    P.pose(X.eye, wx(LAYOUT.eye[0]), h.eye + EYE_Y, wz(LAYOUT.eye[1]), 0);
    P.pose(X.column, wx(LAYOUT.fall[0]), h.fall, wz(LAYOUT.fall[1]), 0);
    seated = true;
  }
  const lerpLift = (cur, to, dt) => cur + (to - cur) * Math.min(1, dt * 1.5);
  let m2Lift = 0, waterLift = 0;

  loop.add({ name: 'puzzles', update: () => {
    const dt = clock.dt, c = camera.position;
    const dx = c.x - wx(0), dz = c.z - wz(20), near = dx * dx + dz * dz < SHOW_R * SHOW_R;
    const nearHour = hourglass.update(dt, c), nearSing = singing.update(dt, c), nearSide = sides.update(dt, c);
    frames++;
    // Drawn during loading (its pipelines warm), then only near a site.
    const want = near || nearHour || nearSing || nearSide || frames < 30 || capture;
    if (want !== shown) { shown = want; view.mesh.setEnabled(want); engine.snapshotRenderingReset(); }
    t1.hidden = t2.hidden = tc.hidden = true;
    if (!near) { if ((nearHour || nearSing || nearSide) && P.write()) view.update(); return; }
    if (!seated) seat();
    const sun = g.env.env.sunDir, ev = gate.update(dt, sun.x, sun.y);
    if (ev & EV.STAGE) {
      flags.add(FLAG[gate.stage - 1]);
      if (gate.stage === STAGE.COMBINE) { chime(SFX.CHIME); tell('The Sun Gate', 'The stone drinks the light', 'Water rises in the basin, and a second mirror from the sand.'); }
      else if (gate.stage === STAGE.TWIST) { chime(SFX.CHIME); tell('The Sun Gate', 'Sand wakes overhead', 'The spout begins to pour across the gate\'s eye.'); }
      else if (gate.stage === STAGE.DONE) { flags.add(SOLVED); chapter.raise('instrument:sun'); chime(SFX.TOLL, 1.4); tell('The Sun Gate', 'Ice bends the sun', 'The sun takes the ice back.', 10); }
    }
    if (ev & EV.LENS_MELT) tell('The Sun Gate', 'The lens is gone', 'The sun took it back.', 4);
    t1.hidden = gate.stage === STAGE.DONE;
    t2.hidden = gate.stage === STAGE.DONE || gate.stage < STAGE.COMBINE;
    tc.hidden = gate.frozen <= 0;

    P.pose(X.m1, wx(LAYOUT.m1[0]), h.m1 + 1, wz(LAYOUT.m1[1]), gate.m1.yaw);
    m2Lift = lerpLift(m2Lift, gate.stage >= STAGE.COMBINE ? 1 : 0, dt);
    P.pose(X.m2, wx(LAYOUT.m2[0]), h.m2 + 1 - 4.4 * (1 - m2Lift), wz(LAYOUT.m2[1]), gate.m2.yaw);
    waterLift = lerpLift(waterLift, gate.stage >= STAGE.COMBINE ? 1 : 0, dt);
    P.show(X.water, waterLift > 0.05); P.scale(X.water, waterLift);
    P.show(X.lens, gate.lens.on);
    P.glow(X.g1, gate.g1.lit || gate.stage >= STAGE.COMBINE ? 1.3 : 0.05);
    P.glow(X.g2, gate.g2.lit || gate.stage >= STAGE.TWIST ? 1.3 : 0.05);
    P.glow(X.eye, gate.eye.lit || gate.stage === STAGE.DONE ? 1.6 : 0.1);
    P.show(X.column, gate.frozen > 0);
    // The running fall: clods sliding down from the spout.
    phase = (phase + dt * 1.6) % 1;
    const run = gate.fall.on && gate.frozen <= 0;
    for (let k = 0; k < FALL; k++) {
      const t = (k + phase) / FALL, f = X.fall[k];
      P.show(f, run);
      P.pose(f, wx(LAYOUT.fall[0]) + Math.sin(k * 5.1) * (0.2 + 0.5 * t), h.fall + 7.2 * (1 - t), wz(LAYOUT.fall[1]) + Math.cos(k * 3.3) * (0.2 + 0.5 * t), 0);
    }
    motes();
    if (P.write()) view.update();
  } });

  // Light along the path (the ray is in plan: it runs at mirror height).
  let flow = 0;
  function motes() {
    const n = gate.points >> 1, path = gate.path;
    let len = 0;
    for (let i = 1; i < n; i++) len += Math.hypot(path[i * 2] - path[i * 2 - 2], path[i * 2 + 1] - path[i * 2 - 1]);
    flow = (flow + clock.dt * 2.4) % 3;
    const step = Math.max(2.4, len / MOTES);
    const y = h.m1 + 2.8, eyeY = h.eye + EYE_Y;
    let seg = 1, walked = 0;
    for (let k = 0; k < MOTES; k++) {
      const m = X.motes[k];
      let at = (k + flow / 3) * step;
      if (n < 2 || at >= len) { P.show(m, false); continue; }
      seg = 1; walked = 0;
      for (; seg < n; seg++) {
        const sl = Math.hypot(path[seg * 2] - path[seg * 2 - 2], path[seg * 2 + 1] - path[seg * 2 - 1]);
        if (at <= walked + sl) {
          const f = (at - walked) / (sl || 1), ax = path[seg * 2 - 2], az = path[seg * 2 - 1], bx = path[seg * 2], bz = path[seg * 2 + 1];
          // The leg that ends at the eye climbs to it; past the gate the light runs on at that height.
          const toEye = az < LAYOUT.eye[1] && bz >= LAYOUT.eye[1] - 2.5 && Math.abs(ax - LAYOUT.eye[0]) < 3;
          const beyond = az >= LAYOUT.eye[1] - 2.5;
          const my = beyond ? eyeY : toEye ? y + (eyeY - y) * f : y;
          P.show(m, true);
          P.pose(m, wx(ax + (bx - ax) * f), my, wz(az + (bz - az) * f), Math.atan2(bx - ax, bz - az));
          break;
        }
        walked += sl;
      }
    }
  }
}
