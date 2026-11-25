// The Ember Warden in the crater (docs/phase-11/ember-warden.md; its body game/emberWarden/titan.js): half sunk in the
// lava lake, out from the vent's middle toward the bench the Wraith comes down to, its hands on the vent. Before the
// eruption it holds, and strains more with each of the mountain's stages: the breath heaves it, it shudders, the heat in
// its arms pulses, now and then a strain runs through it and the lake bursts round its hands. The fight
// (game/emberWarden/fight.js) poses it from the eruption on.

import { createTitan, EW_KIND } from '../game/emberWarden/titan.js';
import { createEmberFight, EWF, ARM } from '../game/emberWarden/fight.js';
import { createArmDeck } from '../game/emberWarden/armDeck.js';
import { PIT } from '../world/crater.js';
import { graphics } from '../core/graphics.js';
import { LEDGE } from '../world/crater.js';
import { wardenLetsGo, craterLooksIn } from '../game/emberScenes.js';

/** Where it stands: out from the vent's middle toward the bench (world/crater.js PIT.bench: atan2(dz, dx)). */
const OUT = 34;
export const WARDEN_AT = (() => {
  const a = PIT.bench.a, x = PIT.x + Math.cos(a) * OUT, z = PIT.z + Math.sin(a) * OUT;
  return { x, z, yaw: Math.atan2(Math.cos(a), Math.sin(a)) };
})();

/** @param {any} g  shared boot context */
export async function addEmberWardenSystem(g) {
  const { scene, atmosphere, shadows, bindShadows, loop, clock, controller, engine, chapter, hud, sfx, SFX, arm, capture } = g;
  const flags = chapter.graph.flags, has = (f) => flags.has(f);
  const say = (t, s, x, secs = 7) => { if (!capture && hud) hud.notice(t, s, x, secs); };
  if (!chapter?.table?.['ash-annick']) return;   // (the Ember chapter's world)
  const titan = createTitan(WARDEN_AT);
  const { createShapedView } = await import('../render/shapedView.js');
  // Its sculpted segments (tools/models/ember_warden.py → data/models/ember-warden.*): the normal and occlusion atlas and
  // the mask (the cracks the heat lights).
  const { loadPieces } = await import('../render/shapedPieces.js');
  const set = await loadPieces(scene, 'ember-warden', { mask: true, atlas: graphics.preset === 'low' || graphics.preset === 'medium' ? '-2k' : '' });
  const view = createShapedView(scene, atmosphere, titan.chunks, { subdivisions: 2, name: 'emberWarden', pieceShader: 'emberWardenPiece',
    pieces: { set, kinds: titan.kinds, seeds: titan.seeds, lod: 0, matLib: g.matLib } });
  bindShadows(view.material, shadows);
  shadows.addCaster(view.mesh, view.makeShadowMaterial, 1);
  view.freeze();
  const EW = g.emberWarden = { titan, view, kind: EW_KIND, pose: null };
  // (Drawn a while from the start, so its pipelines are made while the loading screen is up; then by distance.)
  let drawn = 0;
  const setOn = (on) => {
    if (view.mesh.isEnabled()) drawn++;
    if (!on && drawn < 30) return;
    if (view.mesh.isEnabled() !== on) { view.setEnabled(on); engine.snapshotRenderingReset(); }
  };

  // The hold: breathing, straining by the stage, strains running through it now and then.
  let strainT = 8, strain = 0, strainAge = 99;
  function hold(dt) {
    const st = g.ember?.stage ?? 0, k = Math.min(1, st / 4);
    const t = titan.time;
    titan.holdHands();
    titan.lean = 0.26 + 0.03 * Math.sin(t * 0.9) + 0.06 * strain;
    titan.headDown = 0.5 + 0.1 * strain;
    titan.twist = 0.03 * Math.sin(t * 0.21);
    titan.heave = 0.6 * Math.sin(t * (Math.PI * 2 / 7)) + 1.2 * strain;
    titan.shudder = 0.15 + 0.6 * k + strain;
    // Its hands press down: a strain drives them a little into the lava.
    for (let i = 0; i < 2; i++) titan.hand[i][1] -= 1.5 * strain;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.3 + (st > 3 ? Math.sin(t * 5) : 0));
    titan.heat[0] = titan.heat[1] = 0.12 + 0.1 * k + 0.06 * pulse + 0.3 * strain;
    titan.bodyHeat = 0.08 + 0.08 * k + 0.15 * strain;
    titan.heart = 0.45 + 0.3 * k + 0.25 * pulse;
    titan.poleOut[0] = titan.poleOut[1] = 1.1;
    // Strains: more often as the mountain wakes.
    strainT -= dt;
    // (Each strain swells and eases over four seconds — a jump in one frame read as a spasm.)
    if (strainT < 0) { strainT = (22 - 14 * k) * (0.6 + 0.8 * Math.random()); strainAge = 0; }
    strainAge += dt;
    strain = strainAge < 4 ? Math.sin(Math.PI * strainAge / 4) ** 2 : 0;
  }

  // ── The fight (game/emberWarden/fight.js) ─────────────────────────────────────────────────────────────────────────
  const fwd = [Math.sin(WARDEN_AT.yaw), Math.cos(WARDEN_AT.yaw)], rgt = [Math.cos(WARDEN_AT.yaw), -Math.sin(WARDEN_AT.yaw)];
  const groundAt = (x, z) => { const G = g.ground; G.qx = x; G.qz = z; if (G.covers()) { G.sample(); return G.h; } return -1e4; };
  titan.holdHands();
  const fight = EW.fight = createEmberFight({
    vent: [titan.hand[0].slice(), titan.hand[1].slice()],
    // A free fist waits out in front of it, to its own side.
    home: [-1, 1].map((sd) => [WARDEN_AT.x + fwd[0] * 40 + rgt[0] * sd * 26, WARDEN_AT.z + fwd[1] * 40 + rgt[1] * sd * 26]),
    // Its reach: in front of it, out to its arms' length, on rock (not the lava).
    reach: (x, z) => {
      const dx = x - WARDEN_AT.x, dz = z - WARDEN_AT.z, d = Math.hypot(dx, dz);
      return d > 28 && d < 92 && (dx * fwd[0] + dz * fwd[1]) / d > -0.25 && groundAt(x, z) > (g.volcano?.level ?? 736) + 1;
    },
    ground: groundAt,
  });
  // (Its fists' places on the vent follow the lake as it rises.)
  const ventHands = [titan.hand[0].slice(), titan.hand[1].slice()];
  const deck = createArmDeck(titan);
  let prevDeck = null, deckMine = false;
  // Its heart: reached over a bound arm's shoulder (both bound: held). Give the fire back.
  const heart = { kind: 'ember', id: 'ember-warden-heart', verb: 'Give back the fire', name: 'Its heart', x: 0, y: 0, z: 0, r: 9, h: 3, hidden: true,
    onUse: () => { if (fight.give()) { release(); fight.clear(); } } };
  g.interactables.push(heart);
  // State kept in the save: which arms are bound, and the release.
  const FLAG = { L: 'ember:warden-bound-left', R: 'ember:warden-bound-right', DONE: 'ember:warden-released', WOKE: 'ember:warden-woke' };
  let restored = false, wasDying = false, crystalSeen = false, soak = [0, 0];
  const sweepSeen = new Uint32Array(8);
  function restore() {
    restored = true;
    if (has(FLAG.DONE)) { fight.phase = EWF.DONE; titan.settleAll(); g.elements?.unlock('ember'); return; }
    if (!has(FLAG.WOKE)) return;
    fight.wake();
    for (const [i, f] of [[1, FLAG.R], [0, FLAG.L]]) if (has(f)) { fight.arms[i].state = ARM.BOUND; fight.arms[i].bound = 1; titan.bound[i] = 1; }
    if (has(FLAG.R) && has(FLAG.L)) fight.phase = fight.checkpoint = EWF.HELD;
    else if (has(FLAG.R) || has(FLAG.L)) { fight.phase = fight.checkpoint = EWF.TWO; for (const a of fight.arms) if (a.state === ARM.HOLD) a.state = ARM.HOVER; }
    if (fight.phase === EWF.TWO || fight.phase === EWF.HELD) g.volcano && (g.volcano.add = 5);
  }
  function hurtWraith(k, nx, nz) {
    const co = g.combat; if (!co || co.dying > 0 || controller.god) return;
    co.hurtRaw ? co.hurtRaw(co.maxHealth * k) : (co.health -= co.maxHealth * k);   // (through combat: a fist can kill — health set by hand never dies)
    controller.vel.x = nx * 14; controller.vel.z = nz * 14; controller.vel.y = 7;
    co.shake = Math.max(co.shake || 0, 0.08);
  }
  function burst(x, y, z, n, col, up = 6) {
    const D = g.ruinDust; if (!D) return;
    // (Low, quick and dark: rock dust thrown out from the blow, settling in a few seconds — big slow puffs lay over the
    // view as flat brown sheets.)
    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, sp = 6 + 12 * Math.random(); D.spawn(x + Math.cos(a) * 3, y + 0.8, z + Math.sin(a) * 3, Math.cos(a) * sp, up * (0.3 + 0.7 * Math.random()), Math.sin(a) * sp, 2.2 + 2.8 * Math.random(), col[0], col[1], col[2], 2.2 + 2.2 * Math.random()); }
  }
  const play = (k, gain, x, y, z) => { if (k === undefined || !sfx) return; sfx.x = x; sfx.y = y; sfx.z = z; sfx.gain = gain; sfx.play(k); };
  function onEvents() {
    for (const ev of fight.events) {
      if (ev.e === 'wake') {
        flags.add(FLAG.WOKE); chapter.raise?.('ember:warden-woke');
        if (arm) arm.shake += 0.15;
        play(SFX.BOOM, 1.4, WARDEN_AT.x, titan.lake, WARDEN_AT.z);
        say('The Ember Warden', 'The hold breaks', 'One arm tears off the vent. It is looking for what moves.', 7);
      } else if (ev.e === 'raise') {
        play(SFX.WHOOSH, 1.0, ev.x, ev.y + 30, ev.z);
      } else if (ev.e === 'impact') {
        if (arm) arm.shake += ev.hit ? 0.2 : Math.max(0, 0.12 - ev.d * 0.002);
        play(SFX.BOOM, 1.2, ev.x, ev.y, ev.z);
        burst(ev.x, ev.y, ev.z, 28, [0.12, 0.11, 0.105], 5);
        if (ev.hit) { const p = controller.pos, dx = p.x - ev.x, dz = p.z - ev.z, l = Math.hypot(dx, dz) || 1; hurtWraith(0.45, dx / l, dz / l); }
      } else if (ev.e === 'steam') {
        const h = fight.arms[ev.arm].hand; burst(h[0], h[1] + 4, h[2], 12, [0.7, 0.7, 0.69], 12);
        play(SFX.SPLASH, 0.9, h[0], h[1], h[2]);
      } else if (ev.e === 'freeze') {
        const h = fight.arms[ev.arm].hand; burst(h[0], h[1] + 2, h[2], 6, [0.55, 0.57, 0.6], 8);
      } else if (ev.e === 'bound') {
        flags.add(ev.arm ? FLAG.R : FLAG.L); titan.bound[ev.arm] = 1;
        const h = fight.arms[ev.arm].hand; burst(h[0], h[1] + 2, h[2], 16, [0.5, 0.52, 0.56], 10);
        play(SFX.TOLL, 1.2, h[0], h[1], h[2]);
        if (arm) arm.shake += 0.1;
        say('The Ember Warden', 'Bound', ev.arm === 1 && !has(FLAG.L) ? 'The fist is black glass to the wrist, held to the rock. It tears at it, and its other hand slips off the vent.' : 'Both fists held. It hangs between them, breathing.', 7);
        g.game?.saves?.requestAutosave?.();
      } else if (ev.e === 'surge') {
        if (g.volcano) g.volcano.add = 5;
        if (arm) arm.shake += 0.12;
      } else if (ev.e === 'reset') {
        // (A death: the fight from its start — the arms unbound, the lake down, its saved progress gone.)
        for (const f of [FLAG.WOKE, FLAG.L, FLAG.R]) flags.delete(f);
        titan.bound[0] = titan.bound[1] = 0;
        if (g.volcano) g.volcano.add = 0;
      } else if (ev.e === 'held') {
        chapter.raise?.('ember:warden-held');
      }
    }
  }
  // ── The release (docs/phase-11/ember-release.md, the user's 45 s cut): the fire given back, it blazes, breaks its
  // shackles, rises with its arms to the sky — and falls apart: hands, forearms, arms, head, its body last, into the vent,
  // and plugs it. The column draws down into the crater, the lake crusts over, the flows go black from the vent down, the
  // ash parts. The timeline runs here (also unseen, or skipped: the scene's end jumps it to its end).
  const REL = { LEN: 45, BURST: 5.5, RISE: [6, 14], APART0: 14, APART: [0, 0.6, 1.6, 2.2, 3.4, 4.0, 5.5, 7.2], STOP: 22, QUELL: [22, 33], COOL: [30, 41], OPEN: [34, 45] };
  // (Loosening order, by chunk: the hands, the forearms, the upper arms, the head, the torso.)
  const order = (() => { const at = (p, sd) => { for (let c = 0; c < titan.count; c++) if (titan.part[c] === p && (sd === 0 || titan.side[c] === sd)) return c; return -1; };
    return [at(5, -1), at(5, 1), at(4, -1), at(4, 1), at(3, -1), at(3, 1), at(2, 0), at(0, 0)]; })();
  titan.restAt = [PIT.x + (WARDEN_AT.x - PIT.x) * 0.35, PIT.z + (WARDEN_AT.z - PIT.z) * 0.35];
  let relT = -1, burstDone = false, stopped = false, loosed = 0;
  const ramp = (r, [a, b]) => Math.max(0, Math.min(1, (r - a) / (b - a)));
  const ease = (u) => u * u * (3 - 2 * u);
  const raised = [[0, 0, 0], [0, 0, 0]];
  function release() {
    flags.add(FLAG.DONE); flags.add('ember:learned'); chapter.raise?.('ember:warden-released');
    g.elements?.unlock('ember');
    for (let i = 0; i < 2; i++) for (let k = 0; k < 3; k++) raised[i][k] = fight.arms[i].hand[k];
    relT = 0; burstDone = stopped = false; loosed = 0;
    play(SFX.TOLL, 1.5, controller.pos.x, controller.pos.y, controller.pos.z);
    // Its scene; the Wraith set down on the bench meanwhile (the arm it stood on goes).
    const chest = (out) => { const P = titan.bones.P[3]; out[0] = P[0]; out[1] = P[1] - 4; out[2] = P[2]; return out; };
    const body = (out) => { out[0] = (titan.x + titan.restAt[0]) / 2; out[1] = titan.lake + 20; out[2] = (titan.z + titan.restAt[1]) / 2; return out; };
    if (g.scenes && !capture) {
      g.scenes.play(wardenLetsGo({ facing: WARDEN_AT.yaw, ledge: LEDGE, crater: PIT }), { stale: 4, skippable: true, subjects: { chest, titan: body }, onEnd: releaseEnd });
      setTimeout(() => g.requestTeleport?.(LEDGE.x, LEDGE.z), 1200);
    } else g.requestTeleport?.(LEDGE.x, LEDGE.z);
    g.game?.saves?.requestAutosave?.();
  }
  /** The release's end (its scene over, or skipped): everything it does, done. */
  function releaseEnd() {
    if (relT < 0) return;
    relT = -1;
    for (const c of order) if (c >= 0 && !titan.loose[c]) titan.loosen(c, 0, 0, 0, 0);
    titan.settleAll();
    const E = g.eruption;
    if (E) { E.stop?.(); E.finish?.(); }
    if (g.ws) g.ws.restoration.ember = 'restored';   // (the Waste breathes: systems/volcano.js, the embers in systems/environment.js)
    say('The Ember Warden', 'It gives itself to the mountain', 'It came apart into the vent and closed it. The fire is under it now, and the mountain is quiet.', 10);
    g.game?.saves?.requestAutosave?.();
  }
  /** The release, at r s: its pose, its coming apart, and what it does to the mountain. */
  function releasePose(t, r, dt) {
    const E = g.eruption;
    // The give: the heart floods, the cracks blaze through it; it lifts its head.
    const give = ramp(r, [0, 5]), rise = ease(ramp(r, REL.RISE));
    t.heart = 1;
    t.bodyHeat = 0.15 + 0.5 * give;   // (to orange: at full heat the cracks burn white and it reads as a lit net)
    t.lean = 0.42 - 0.55 * rise + 0.02 * Math.sin(t.time * 1.4);
    t.headDown = 0.75 - 0.6 * give - 0.5 * rise;
    t.twist *= Math.exp(-dt);
    t.heave = 14 * rise + 0.6 * Math.sin(t.time * 2.3) * (1 - rise);
    t.shudder = 0.8 + 0.6 * give;
    // The shackles burst.
    if (r >= REL.BURST && !burstDone) {
      burstDone = true;
      for (let i = 0; i < 2; i++) { const h = fight.arms[i].hand; burst(h[0], h[1] + 2, h[2], 40, [0.06, 0.06, 0.08], 14); burst(h[0], h[1] + 3, h[2], 14, [0.55, 0.57, 0.6], 18); play(SFX.SHATTER, 1.3, h[0], h[1], h[2]); }
      play(SFX.BOOM, 1.2, titan.x, titan.lake + 20, titan.z);
      if (arm) arm.shake += 0.12;
    }
    const free = r >= REL.BURST ? 1 : 0;
    // Its hands up to the sky (from where the Frost held them).
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1, S = titan.bones.S[i];
      const up = [S[0] + t.rgt[0] * sd * 18 + t.fwd[0] * 6, S[1] + 38, S[2] + t.rgt[2] * sd * 18 + t.fwd[2] * 6];
      const u = ease(ramp(r, [REL.BURST, 13]));
      for (let k = 0; k < 3; k++) t.hand[i][k] = raised[i][k] + (up[k] - raised[i][k]) * u;
      t.bound[i] = free ? 0 : 1;
      t.heat[i] = free ? 0.35 + 0.3 * give : 0;
      t.poleOut[i] = 1.1;
    }
    // It comes apart, piece by piece, into the vent.
    const A = REL.APART;
    while (loosed < order.length && r >= REL.APART0 + A[loosed]) {
      const c = order[loosed++]; if (c < 0) continue;
      const o = c * 16, x = t.chunks[o], y = t.chunks[o + 1], z = t.chunks[o + 2];
      const tx = t.restAt[0] + (Math.random() - 0.5) * 40, tz = t.restAt[1] + (Math.random() - 0.5) * 40;
      const fall = Math.sqrt(2 * Math.max(4, y - t.lake) / 15.7) + 0.5;
      const torso = loosed === order.length;
      t.loosen(c, (tx - x) / fall, torso ? 1 : 5, (tz - z) / fall, torso ? 0.12 : 0.35 + 0.4 * Math.random());
      t.looseHeat[c] = 0.7;
      burst(x, y, z, 3, [1, 0.45, 0.15], 4);
      play(SFX.CRUNCH, 1.1, x, y, z);
    }
    if (t.landed >= 0) {
      const c = t.landed, o = c * 16, x = t.chunks[o], y = t.lake, z = t.chunks[o + 2];
      burst(x, y + 2, z, 12, [1, 0.42, 0.12], 22); burst(x, y + 4, z, 5, [0.2, 0.18, 0.17], 16);   // (few: the falling pieces must read, not a dust cloud)
      play(SFX.BOOM, 1.4, x, y, z); play(SFX.RUMBLE, 1.2, x, y, z);
      if (arm) arm.shake += 0.1;
    }
    // The loose pieces cool as the vent closes; the ones still on it blaze.
    const q = ramp(r, REL.QUELL);
    for (let c = 0; c < t.count; c++) if (t.loose[c]) t.looseHeat[c] = Math.min(t.looseHeat[c], 1 - 0.95 * q);
    // The vent closed: the eruption stops; then the column draws down, the lake crusts, the flows go black, the ash parts.
    if (r >= REL.STOP && !stopped) { stopped = true; E?.stop?.(); play(SFX.TOLL, 1.4, PIT.x, titan.lake, PIT.z); }
    if (E && E.stopT) { E.quell = q; E.cool = ease(ramp(r, REL.COOL)); E.open = ease(ramp(r, REL.OPEN)); }
  }
  /** Frost on its fists: a formation cast at one, a Sweep through one, the Ribbon's stream held on one. */
  function frostHits(dt) {
    const fr = g.frost; if (!fr) return;
    const ev = fr.crystalEvent && !crystalSeen; crystalSeen = !!fr.crystalEvent;
    for (let i = 0; i < 2; i++) {
      const a = fight.arms[i]; if (a.state !== ARM.REST) { soak[i] = 0; continue; }
      const h = a.hand;
      if (ev && Math.hypot(fr.crystalX - h[0], fr.crystalZ - h[2]) < 12) fight.freeze(i);
      for (let q = 0; q < 4; q++) {
        if (!fr.sweepActive[q] || fr.sweepHW[q] <= 0.05 || sweepSeen[q * 2 + i] === fr.sweepId[q]) continue;
        if (Math.hypot(h[0] - fr.sweepFX[q], h[2] - fr.sweepFZ[q]) < 9 + fr.sweepHW[q]) { sweepSeen[q * 2 + i] = fr.sweepId[q]; fight.freeze(i); }
      }
      // The Ribbon: a second and a half of it on the fist counts as one freezing.
      const R = fr.ribbonNodes; let on = false;
      if (R) for (let n = 0; n < R.length; n += 4) if (R[n + 3] > 0.05 && Math.hypot(R[n] - h[0], R[n + 2] - h[2]) < 9 && Math.abs(R[n + 1] - h[1]) < 10) { on = true; break; }
      soak[i] = on ? soak[i] + dt : Math.max(0, soak[i] - dt * 0.5);
      if (soak[i] > 1.5) { soak[i] = 0; fight.freeze(i); }
    }
  }
  /** The fight's pose on the titan. */
  function fightPose(t, dt) {
    const p = controller.pos;
    // It turns its shoulders toward the Wraith (a little), leans over the vent, breathes harder.
    const want = Math.atan2(p.x - WARDEN_AT.x, p.z - WARDEN_AT.z) - WARDEN_AT.yaw;
    const wrap = (x) => ((x + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const held = fight.phase === EWF.HELD;
    t.twist += (Math.max(-0.4, Math.min(0.4, wrap(want))) * (held ? 0.2 : 1) - t.twist) * Math.min(1, dt * 0.8);
    t.lean = (held ? 0.42 : 0.3) + 0.03 * Math.sin(t.time * (held ? 1.6 : 1.1));
    t.headDown = held ? 0.75 : 0.42;
    t.heave = (held ? 1.2 : 0.8) * Math.sin(t.time * (Math.PI * 2 / (held ? 3.2 : 5)));
    t.shudder = held ? 0.8 : 0.4;
    for (let i = 0; i < 2; i++) {
      const a = fight.arms[i];
      const src = a.state === ARM.HOLD ? ventHands[i] : a.hand;
      for (let k = 0; k < 3; k++) t.hand[i][k] = src[k];
      t.heat[i] = a.state === ARM.BOUND ? 0 : a.heat;
      t.bound[i] = a.state === ARM.BOUND ? 1 : 0;
      t.poleOut[i] = 1.1;
    }
    t.bodyHeat = held ? 0.1 : 0.2;
    t.heart = held ? 0.9 + 0.1 * Math.sin(t.time * 2) : 0.6;
  }

  loop.add({ name: 'emberWarden', update: () => {
    const dt = clock.dt;
    const d = Math.hypot(controller.pos.x - PIT.x, controller.pos.z - PIT.z), cam = g.camera?.position;
    const dc = cam ? Math.hypot(cam.x - PIT.x, cam.z - PIT.z) : d;
    const near = Math.min(d, dc) < 1800 || !!g.scenes?.busy && g.streamFocus && Math.hypot(g.streamFocus.x - PIT.x, g.streamFocus.z - PIT.z) < 400;
    titan.lake = g.volcano?.level ?? 736;
    // (A load: at boot, or a save loaded in play — released or not, whatever it was before.)
    if (g.npcs && (!restored || (has(FLAG.DONE) && fight.phase !== EWF.DONE && relT < 0))) restore();
    if (!has(FLAG.DONE) && titan.anyLoose && relT < 0) { titan.loose.fill(0); titan.anyLoose = false; if (fight.phase === EWF.DONE) fight.phase = fight.checkpoint = EWF.IDLE; }
    setOn(near);
    if (!view.mesh.isEnabled()) return;
    // Woken by the eruption, with the Wraith down in the caldera near it.
    const p = controller.pos, dw = Math.hypot(p.x - WARDEN_AT.x, p.z - WARDEN_AT.z);
    const erupting = !!g.eruption?.on || !!g.eruption?.stopT || has('ember:erupted');
    if (fight.phase === EWF.IDLE && erupting && dw < 115 && p.y > titan.lake && !(g.combat && g.combat.dying > 0)) { fight.wake(); onEvents(); fight.clear(); }
    // (Its hands' places on the vent ride the lake.)
    titan.holdHands(); for (let i = 0; i < 2; i++) for (let k = 0; k < 3; k++) ventHands[i][k] = titan.hand[i][k];
    // A death in the fight resets all of it (every frame, so the next death is seen too).
    const co = g.combat, dying = !!co && co.dying > 0;
    if (dying && !wasDying && fight.phase !== EWF.IDLE && fight.phase !== EWF.DONE) { fight.reset(); onEvents(); fight.clear(); }
    wasDying = dying;
    if (fight.phase !== EWF.IDLE && fight.phase !== EWF.DONE) {
      frostHits(dt);
      fight.update(dt, p.x, p.y, p.z, controller.vel.x, controller.vel.z, dw < 110 && !dying);
      onEvents(); fight.clear();
      fightPose(titan, dt);
    } else if (fight.phase === EWF.DONE) {
      fight.clear();
      if (relT >= 0) { relT += dt; releasePose(titan, relT, dt); if (relT >= REL.LEN && !g.scenes?.busy) releaseEnd(); }
      else { titan.bound[0] = titan.bound[1] = 0; titan.heart = 0; }
    } else if (EW.pose) EW.pose(titan, dt); else hold(dt);
    // The crater scene: the first time the Wraith comes to the rim before the eruption, it looks in.
    if (!has('ember:scene:crater') && !erupting && (g.ember?.stage ?? 0) >= 1 && g.scenes && !g.scenes.busy && !capture && !g.chapter?.talking) {
      const dp = Math.hypot(p.x - PIT.x, p.z - PIT.z);
      if (dp < 150 && p.y > titan.lake + 6) {
        flags.add('ember:scene:crater');
        const titanAt = (out) => { out[0] = titan.x; out[1] = titan.lake + 14; out[2] = titan.z; return out; };
        const handsAt = (out) => { const h = titan.hand; out[0] = (h[0][0] + h[1][0]) / 2; out[1] = titan.lake + 3; out[2] = (h[0][2] + h[1][2]) / 2; return out; };
        const headAt = (out) => { const P = titan.bones.P[5]; out[0] = P[0]; out[1] = P[1] - 3; out[2] = P[2]; return out; };
        g.scenes.play(craterLooksIn({ facing: WARDEN_AT.yaw }), { stale: 4, subjects: { titan: titanAt, hands: handsAt, head: headAt } });
      }
    }
    // The bound arms are footing; its heart's place over the chest.
    deck.arms[0] = titan.bound[0] > 0.5; deck.arms[1] = titan.bound[1] > 0.5;
    deck.on = deck.arms[0] || deck.arms[1];
    const wantDeck = deck.on && dw < 200;
    if (wantDeck && !deckMine) { prevDeck = controller.deck; controller.deck = deck; if (g.wraithGround) g.wraithGround.deck = deck; deckMine = true; }
    else if (!wantDeck && deckMine) { controller.deck = prevDeck; if (g.wraithGround) g.wraithGround.deck = prevDeck; deckMine = false; }
    const P3 = titan.bones.P[3];
    heart.x = P3[0]; heart.y = P3[1] + 2; heart.z = P3[2]; heart.hidden = fight.phase !== EWF.HELD;
    titan.update(dt);
    if (titan.nbrDirty) { view.updateNeighbours(); titan.nbrDirty = false; }
    view.update();
  } });
}
