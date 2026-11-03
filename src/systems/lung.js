// The Lung and the descent (Phase 10 U2; game/lung.js is the air, world/kelp.js the forest and the column, docs/phase-10/
// u2-design.md the rules). Each frame:
//  - the air: drained under the water, shown on the body (the cowl light, the robe's life, the bubbles from the chest) and in the
//    swim (a spent body sinks and its strokes up weaken);
//  - the kelp: drawn round the camera under the Sounding, parted round the body; the first pass through it tears the Lung (a
//    frond snags towards the chest, a hiss, a stream of silver bubbles);
//  - put out (the air gone): dark, then awake on the ledge among the kelp roots (after the tear) or afloat at the surface;
//  - the intake's column: after the tear it refills the Lung, then turns and takes the body down; bubbles fill the screen and the
//    Wraith wakes in Ebbhold's undercroft. Before the tear it is an upwelling that lifts the body away.
// Until F10 builds Morrow as the fen's guide, the Lung is taken from her pile of brass at the jetty's end.
// Saved as chapter flags: ebb:lung, ebb:torn, ebb:through.

import { createLung, stepLung, fit, tear, putOut, whirlFlow, lungFromFlags, WHIRL } from '../game/lung.js';
import { kelpContact, inColumn, COLUMN, LEDGE, CANOPY_MID } from '../world/kelp.js';
import { SOUNDING } from '../world/sounding.js';
import { jettyPoint, JETTY } from '../world/jetty.js';

const RANK = { none: 0, fitted: 1, torn: 2, woke: 3, whirl: 4, through: 5 };

/** @param {any} g  shared boot context */
export function addLungSystem(g) {
  const { loop, controller, arm, chapter, hud, clock, ground, capture } = g;
  const flags = chapter.graph.flags;
  const L = g.lung = createLung();
  const groundAt = (x, z) => { ground.qx = x; ground.qz = z; ground.sample(); return ground.h; };
  const tmp = new Array(7), flow = [0, 0, 0];
  const kelp = g.kelp, uw = g.underwaterFx;

  // The pile of brass at the jetty's end: the Lung (Morrow fits it, F10; for now it is taken).
  const pile = jettyPoint(JETTY.len - 2.1, JETTY.half - 0.5, 0.3);
  const take = { kind: 'lung', verb: 'Put on', name: 'Morrow’s Lung', x: pile[0], y: pile[1], z: pile[2], r: 2.6, h: 0.6, hy: 2.2, hidden: true,
    onUse: () => {
      fit(L); flags.add('ebb:lung');
      hud.notice('The Lung', 'Shaper work', '“You’ve air to get down and come back. No more. Don’t stop to look.”', 7);
    } };
  if (g.interactables) g.interactables.push(take);

  // The dark: a full-screen veil for being put out and for the cut (the bubbles fill the frame first).
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:40;background:#000;transition:none';
  if (!capture) document.body.append(veil);
  let veilA = 0;
  const setVeil = (a, color) => { if (color) veil.style.background = color; if (Math.abs(a - veilA) > 0.004 || a === 0 || a === 1) { veilA = a; veil.style.opacity = a.toFixed(3); } };

  /** A sequence running: 'out' (put out → wake), 'taken' (the column's cut). t its clock; where: where to wake. */
  const seq = { kind: '', t: 0, where: '', moved: false };
  let snagT = -1, snagX = 0, snagY = 0, snagZ = 0, puff = 0, wasStage = '', ventY = -100, ventOk = false, kelpShown = true, columnLight = null;

  function wakeAt(where) {
    if (where === 'ledge') {
      // (The game's own deferred move: it holds the body until the ground there is resident, then sets it on the floor. The CPU
      // ground reads true only near the body, so a height asked for from far off is wrong.)
      g.requestTeleport(LEDGE.x, LEDGE.z);
      controller.yaw = LEDGE.yaw; arm.yaw = LEDGE.yaw; arm.pitch = 0.32;
      return;
    } else {
      // Afloat over where it went out.
      controller.teleport(controller.pos.x, controller.pos.z, (controller.waterLevel || 1.41) - 1.0);
    }
    controller.swimming = true;
    arm.snap(controller.pos);
    if (g.post) g.post.post.resetHistory = true;
    if (g.atmosphere) g.atmosphere.snapExposure = true;
  }

  // Playtest and bot: ?lung=fitted (the Lung on), torn, or ledge (torn and put out: wake on the ledge once the world is ready).
  let test = g.qs?.get('lung') || '';
  if (test === 'fitted' || test === 'torn' || test === 'ledge') { flags.add('ebb:lung'); if (test !== 'fitted') flags.add('ebb:torn'); }
  if (test === 'torn') { L.stage = 'torn'; }

  loop.add({ name: 'lung', update: () => {
    const dt = Math.min(clock.dt, 0.1), P = controller.pos, cam = g.camera.position;
    if (test === 'ledge' && !controller.hold && clock.frame > 30) { test = ''; L.stage = 'woke'; L.air = 1; wakeAt('ledge'); }
    // What the save says (a load, or flags raised elsewhere) moves the stage on, never back.
    // (Only a fresh state takes the saved stage; in play the stages move on by themselves, and a torn Lung is not yet put out.)
    const want = lungFromFlags(flags);
    if (L.stage === 'none' && want !== 'none') L.stage = want;
    else if (want === 'through' && RANK[L.stage] < RANK.whirl) L.stage = 'through';
    const city = g.ebbhold?.active;
    // The pile: offered while there's no Lung, near the jetty's end.
    take.hidden = L.stage !== 'none' || city || Math.hypot(P.x - pile[0], P.z - pile[2]) > 8;
    const inPit = Math.hypot(P.x - SOUNDING.x, P.z - SOUNDING.z) < SOUNDING.r + 4;
    const under = controller.submerged && !city;
    const chest = g.wraithView?.wraith?.body?.chest;
    const cx = chest ? chest[0] : P.x, cy = chest ? chest[1] : P.y + 1, cz = chest ? chest[2] : P.z;

    // The vent under the column: the floor's height there, once the ground is resident.
    if (!ventOk) { ground.qx = COLUMN.x; ground.qz = COLUMN.z; const h = groundAt(COLUMN.x, COLUMN.z); if (h > -200 && h < -40) { ventY = h; ventOk = true; } }

    // The tear: the first pass through the kelp with the Lung on (or below the canopy's middle: it did pass through it).
    if (L.stage === 'fitted' && under && inPit && seq.kind === '') {
      const touch = cy < -40 ? kelpContact(cx, cy, cz, groundAt, tmp) : -1;
      if (touch >= 0 || cy < CANOPY_MID) {
        tear(L); flags.add('ebb:torn');
        snagT = 0; snagX = cx; snagY = cy; snagZ = cz;
        if (g.sfx) { const s = g.sfx; s.x = cx; s.y = cy; s.z = cz; s.gain = 1.1; s.play(g.SFX.SWISH); }
        if (uw) uw.emit(cx, cy, cz, 40, 0.002, 0.012, 0.35);
        hud.notice('The Lung', 'Torn', 'It caught on the kelp. The air is going.', 5);
      }
    }

    // Once it has the body, the whirlpool holds it well above the plume's top and a little wide of it.
    const held = L.stage === 'whirl' && P.y < -20 && Math.hypot(P.x - COLUMN.x, P.z - COLUMN.z) < COLUMN.r * 1.8;
    const inCol = !city && (inColumn(P.x, P.y, P.z) || held);
    const ev = seq.kind === '' && !city ? stepLung(L, dt, { under, inColumn: inCol, speed: Math.hypot(controller.vel.x, controller.vel.y, controller.vel.z), atVent: P.y < ventY + WHIRL.ventClear }) : '';
    if (ev === 'refill' && L.back !== 'through') hud.notice('The Lung', '…', 'Air. It fills the Lung, and the light comes back.', 5);
    if (ev === 'out') { seq.kind = 'out'; seq.t = 0; seq.moved = false; seq.where = ''; }
    if (ev === 'taken' && seq.kind === '') { seq.kind = 'taken'; seq.t = 0; seq.moved = false; }

    // On the body (the cowl light in systems/creatures.js reads g.lung.light; the robe's life here).
    if (g.wraithView) g.wraithView.wraith.life = city ? 1 : L.life;
    // The swim: the drift, the strokes, and the column's flow.
    controller.rise = city ? 0.25 : L.rise; controller.strokeMul = city ? 1 : L.stage === 'whirl' ? 0.6 : L.stroke;
    controller.pullX = 0; controller.pullZ = 0; controller.currentY = 0;
    if (inCol) {
      const dx = P.x - COLUMN.x, dz = P.z - COLUMN.z;
      if (L.stage === 'whirl') { whirlFlow(dx, dz, L.spin, flow); controller.pullX = flow[0]; controller.pullZ = flow[2]; controller.currentY = flow[1]; }
      else if (L.stage === 'fitted' || L.stage === 'none') {
        // Before the tear the column is an upwelling: it lifts the body up and out of it.
        const r = Math.max(0.5, Math.hypot(dx, dz));
        controller.currentY = 1.8; controller.pullX = dx / r * 0.9; controller.pullZ = dz / r * 0.9;
      }
    }

    // Bubbles from the chest: the Lung's breath out in puffs; torn, a stream.
    if (uw && under && seq.kind === '') {
      if (L.stream) {
        let k = L.bubbles * dt;
        while (k > 0) { if (Math.random() < k) uw.emit(cx, cy + 0.05, cz, 1, 0.0015, 0.007, 0.12); k -= 1; }
      } else if (L.bubbles > 0) {
        puff -= dt * L.bubbles / 6;
        if (puff <= 0) { puff = 1; uw.emit(cx, cy + 0.1, cz, 6, 0.0015, 0.006, 0.2); }
      }
    }

    // The snag: the frond pulled in to the chest, then let go as the Lung tears free.
    if (snagT >= 0) {
      snagT += dt;
      const s = snagT < 0.35 ? snagT / 0.35 : Math.max(0, 1 - (snagT - 0.35) / 1.4);
      kelp?.snag(snagX, snagY, snagZ, s);
      if (snagT > 2) { snagT = -1; kelp?.snag(0, 0, 0, 0); }
    }

    // Sequences.
    if (seq.kind === 'out') {
      seq.t += clock.realDt;
      // The light gone, the robe hangs; then dark, the move, a still moment, and waking.
      if (seq.t < 1.6) setVeil(seq.t / 1.6, '#000');
      else if (!seq.moved) { seq.moved = true; seq.where = putOut(L); wakeAt(seq.where); setVeil(1); }
      else if (seq.t < 2.6 || g.pendingTp?.active) { setVeil(1); if (g.pendingTp?.active) seq.t = Math.min(seq.t, 2.6); }
      else if (seq.t < 4.4) setVeil(1 - (seq.t - 2.6) / 1.8);
      else {
        setVeil(0); seq.kind = '';
        if (seq.where === 'ledge') hud.notice('The Sounding', '…', 'Still lit. Barely. Below, something is glowing.', 6);
      }
    } else if (seq.kind === 'taken') {
      seq.t += clock.realDt;
      // Bubbles fill the screen (a flood of them round the eye), turning white; then the undercroft, in air.
      if (seq.t < 1.5 && uw) uw.emit(cam.x, cam.y - 0.5, cam.z, 28, 0.006, 0.045, 3.2);
      if (seq.t < 1.5) setVeil(Math.max(0, (seq.t - 0.4) / 1.1), '#d8ecf0');
      else if (!seq.moved) {
        seq.moved = true; setVeil(1, '#000');
        L.stage = 'through'; L.air = 1; flags.add('ebb:through');
        controller.pullX = 0; controller.pullZ = 0; controller.currentY = 0;
        g.ebbhold?.enter('undercroft');
      } else if (seq.t < 3.2) setVeil(1);
      else if (seq.t < 5.6) setVeil(1 - (seq.t - 3.2) / 2.4);
      else {
        setVeil(0); seq.kind = '';
        hud.notice('Ebbhold', 'The undercroft', 'Air, and black sand. The Lung is finished. The tunnel runs one way.', 7);
      }
    }
    if (L.stage !== wasStage) { wasStage = L.stage; chapter.raise?.('ebb:lung:' + L.stage); }

    // The kelp and the column, drawn while the camera is under the Sounding.
    const camUnder = !city && cam.y < (controller.waterLevel || 1.41) - 0.1 && Math.hypot(cam.x - SOUNDING.x, cam.z - SOUNDING.z) < SOUNDING.r + 10;
    if (kelp) {
      const on = camUnder && cam.y < -6;
      kelp.on = on; kelp.time = clock.simTime; kelp.cx = cam.x; kelp.cz = cam.z;
      kelp.body(cx, cy - 0.3, cz);
      kelp.update(clock.realDt);
      // Drawn only when it shows (and for the first frames, so its pipeline is built at load).
      const draw = on || clock.frame < 90;
      if (draw !== kelpShown) { kelpShown = draw; kelp.mesh.setEnabled(draw); g.engine.snapshotRenderingReset(); }
    }
    // The eye opens with the depth (exposure up to 2 stops at the floor), eased.
    if (g.atmosphere) {
      const dep = camUnder ? Math.max(0, (controller.waterLevel || 1.41) - cam.y) : 0;
      const want = Math.pow(2, 2 * Math.min(1, Math.max(0, (dep - 15) / 75)));
      const a = g.atmosphere.eyeOpen || 1;
      g.atmosphere.eyeOpen = a + (want - a) * Math.min(1, clock.realDt * 0.8);
    }
    if (uw) uw.column(camUnder && Math.hypot(cam.x - COLUMN.x, cam.z - COLUMN.z) < 110 && ventOk, COLUMN.x, COLUMN.z, ventY + 0.5, COLUMN.top, COLUMN.r, L.spin);
    // The glow at the vent (the city's lamps through its intake): a light in the world's grid, and one up the column.
    if (!columnLight && g.worldLights && ventOk) {
      // (Strong: lamps are tuned for a few metres; this one must reach the kelp 25 m round and the ledge.)
      columnLight = [g.worldLights.add({ x: COLUMN.x, y: ventY + 3, z: COLUMN.z, radius: 32, color: [0.45, 0.85, 1], intensity: 140, kind: 'held' }),
        g.worldLights.add({ x: COLUMN.x, y: ventY + 20, z: COLUMN.z, radius: 26, color: [0.5, 0.85, 1], intensity: 45, kind: 'held' })];
    }
    if (columnLight) { const lv = camUnder ? 1 + 0.5 * L.spin : 0; columnLight[0].level = lv; columnLight[1].level = lv; }
  } });
  return L;
}
