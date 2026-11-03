// The cinematic director (Phase 10 U6; game/director.js is the timeline): plays a list of shots on the game camera — letterboxed,
// the Wraith's controls held, depth of field pulled to each shot's focus, camera motion blur on, the temporal history reset on
// every cut. Runs just before the atmosphere (it and the shadows read the camera when they update). Time comes from the game
// clock, or from seek() (a fixed-step film; later the audio clock).
//
// Into and out of play without a jump (inertialization, cutscene-research.md §7): a cutscene may begin from wherever the player's
// camera is (blendIn: the difference to the first shot's camera decays to nothing over that many seconds), and end back into
// the player's camera the same way (blendOut). The letterbox slides in and out.
//
// A shot may also set: grade ('past' | 'held' | 'present', or [from, to] across the shot), light ({ fill, beam } on Ebbhold's
// light, or [from, to]), freeze (the crowd and the Drowned held still: time stopped), shake (m), slug (a rough cut's caption
// card: { text, dim }), subs ([{ t, d, who, text }] subtitles), wraith (false: the Wraith not in the shot; or { path: [[x, y, z,
// yaw], ...] } moved along it), sefa ({ path: [[x, y, z], ...] local, run along it over the shot, or one point; yaw; reach:
// [x, y, z] her hand raised to it}), wave ({ front: x or [from, to] local, t: s or [from, to] — the wave's own time: a constant
// holds it }), robes ({ rise: [from, to] s into their rise, or omitted: afloat } the robes on the Sounding), leave (out of the
// city on this cut), morrow ({ f: m along the jetty, yaw, cut: [from, to] the knife along the seam } her at its end), hour (the time of day from this cut), key ({ at: [x, y, z] local, r, c: [r, g, b], i } a light for the shot), look ({ id: one of the Drowned, y: height on them, w: 0..1 } the camera turned to follow them), and onCut(g)
// for anything else.

import { shotAt, evalShot, totalLength } from '../game/director.js';
import { hallAlive, bakehouseBehind } from '../game/crowds.js';
import { CUTSCENES, build } from '../game/cutscenes.js';
import { GRADES, mixGrades } from '../post/grades.js';
import { releaseShots } from '../game/release.js';
import { EBB_ORIGIN } from '../world/ebbhold.js';
import { SOUNDING } from '../world/sounding.js';

/** The farthest a blend carries the camera (m); beyond it a blend becomes a cut. */
const BLEND_MAX = 25;

/** @param {any} g  shared boot context */
export function addDirectorSystem(g) {
  const { loop, camera, controller, clock, post, bars } = g;
  const cam = new Float64Array(8), at = { i: 0, u: 0, cut: false };
  let shots = null, t = 0, len = 0, manual = false, lastI = -1, onEnd = null, barsShown = -1, barsK = 0;
  // Blends: the difference (camera xyz, look-at xyz, fov) carried at the start or the end, and how long it takes to die away.
  const off = new Float64Array(7), cur = new Float64Array(7), last = new Float64Array(7);   // last: the director's last camera
  let blendIn = 0, blendOut = 0, outT = -1, outWant = false;
  const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);
  // The grade and the city's light as they were before the cutscene (restored after), and the frozen clock.
  const gradeSaved = new Float32Array(16), base = { fill: 0, beam: 0 };
  let frozenAt = -1, wraithShown = true, presentNeeded = false, resnap = 0;
  // The hour as it was held (or not) before a shot set its own; given back at the end, the day running on from the shot's.
  let pinSaved = null, hourHeld = false;
  GRADES.present = { g0: [0, 0, 0], g1: [1, 1, 1], g2: [1, 1, 1] };
  // The overlay: a rough cut's caption cards and the subtitles (DOM in play; drawn into a film's frames by drawOverlay).
  const ov = typeof document !== 'undefined' ? document.createElement('div') : null;
  const slugEl = ov ? document.createElement('div') : null, subEl = ov ? document.createElement('div') : null;
  if (ov) {
    ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;display:none';
    slugEl.style.cssText = 'position:absolute;left:12%;right:12%;top:50%;transform:translateY(-50%);text-align:center;color:#d8d2c4;font:500 22px/1.5 Georgia,serif;letter-spacing:0.02em';
    subEl.style.cssText = 'position:absolute;left:10%;right:10%;bottom:15%;text-align:center;color:#f1ece0;font:400 22px/1.4 Georgia,serif;text-shadow:0 1px 3px #000';
    ov.append(slugEl, subEl); document.body.append(ov);
  }
  const shownText = { slug: '', dim: 0, sub: '' };
  /** This frame's slug and subtitle → shownText (and the DOM when it changes). */
  function overlayFor(sh, u, ts) {
    let slug = '', dim = 0, sub = '';
    // (A card with no words is still a card: black, or the shot dimmed.)
    if (sh.slug) { slug = sh.slug.text || ' '; dim = sh.slug.dim ?? 0.75; }
    if (sh.subs) for (const q of sh.subs) if (ts >= q.t && ts < q.t + (q.d || 3)) sub = (q.who ? q.who + ': ' : '') + q.text;
    if (ov && (slug !== shownText.slug || sub !== shownText.sub || dim !== shownText.dim)) {
      ov.style.display = slug || sub ? 'block' : 'none';   // (' ': a wordless card)
      ov.style.background = slug ? 'rgba(6,7,8,' + dim + ')' : 'transparent';
      slugEl.textContent = slug; subEl.textContent = sub;
    }
    shownText.slug = slug; shownText.dim = dim; shownText.sub = sub;
  }
  /** The shot's grade at u into the post chain's grade (blended), and the city's light. */
  function lookFor(sh, u) {
    const G = post.post.grade;
    if (sh.grade) {
      const a = Array.isArray(sh.grade) ? sh.grade[0] : sh.grade, b = Array.isArray(sh.grade) ? sh.grade[1] : sh.grade, e = smoother(u);
      if (a === 'present' && b === 'present') g.regradeWanted = true;
      else {
        mixGrades(G, a, b, e);
        // 'present' is whatever the world's grade was: blend toward it rather than toward neutral.
        if (a === 'present' || b === 'present') { const w = a === 'present' ? 1 - e : e; for (let i = 0; i < 12; i++) G[i] += (gradeSaved[i] - G[i]) * w; }
        G[3] = 1;
      }
      post.post.gradeDirty = true;
    } else if (presentNeeded) { g.regradeWanted = true; presentNeeded = false; }   // the world's own grade, wherever the shot is
    if (sh.grade) presentNeeded = true;   // a shot without a grade is the present: back to it on the next that has none
    const v = g.ebbholdView;
    if (v && sh.light) {
      const L0 = Array.isArray(sh.light) ? sh.light[0] : sh.light, L1 = Array.isArray(sh.light) ? sh.light[1] : sh.light, e = smoother(u);
      v.params.y = base.fill * ((L0.fill ?? 1) + ((L1.fill ?? 1) - (L0.fill ?? 1)) * e);
      v.params.z = base.beam * ((L0.beam ?? 1) + ((L1.beam ?? 1) - (L0.beam ?? 1)) * e);
    } else if (v) { v.params.y = base.fill; v.params.z = base.beam; }
  }
  function setFrozen(on) {
    for (const p of g.drowned ? g.drowned.people : []) if (p.npc) p.npc.frozen = on;
    if (g.sefa) g.sefa.freeze(on);
  }
  const lerp2 = (v, u) => (Array.isArray(v) ? v[0] + (v[1] - v[0]) * u : v);
  /** Sefa through the shot: along her path (running when it moves), or standing; her hand raised. */
  function sefaFor(sh, u, cut) {
    const S = g.sefa;
    if (!S) return;
    const q = sh.sefa;
    if (!q) { if (cut && !sh.freeze) S.show(false); return; }   // (held in time, she stays where she was, out of shot)
    if (cut) S.show(true);
    if (sh.freeze && !cut) return;
    const P = q.path, n = P.length - 1;
    let x = P[0][0], y = P[0][1], z = P[0][2], vx = 0, vz = 0, yaw = q.yaw ?? 0;
    if (n > 0) {
      const qq = Math.min(n - 1e-6, u * n), k = Math.floor(qq), f = qq - k, A = P[k], B = P[k + 1];
      x = A[0] + (B[0] - A[0]) * f; y = A[1] + (B[1] - A[1]) * f; z = A[2] + (B[2] - A[2]) * f;
      vx = (B[0] - A[0]) * n / sh.dur; vz = (B[2] - A[2]) * n / sh.dur;
      if (q.yaw === undefined) yaw = Math.atan2(vx, vz);
    }
    S.set(x, y, z, yaw, vx, vz);
    S.reachTo(q.reach || null);
  }
  /** Who a shot is about (one of the Drowned: followed, lit, or the one in a record shot), or null. */
  const aboutId = (q) => (q ? (q.look && q.look.id) || (q.key && q.key.on !== 'sefa' && q.key.on) || q.record || null : null);
  const atWarm = { i: 0, u: 0, cut: false };
  /** The people the shots of the next moments are about are kept shown and simulated wherever the camera is (systems/npcs.js
   *  warm): cut to while hidden far off, a robe was in its last-drawn pose and settled on camera, flailing for half a second. */
  function warmAhead() {
    if (!g.drowned) return;
    const a = aboutId(shots[at.i]);
    shotAt(shots, Math.min(len - 1e-3, t + 1.5), 0, atWarm);
    const b = aboutId(shots[atWarm.i]);
    const P = g.drowned.people;
    for (let k = 0; k < P.length; k++) if (P[k].npc) P[k].npc.warm = P[k].d.id === a || P[k].d.id === b;
  }
  /** The game camera's pose now → cur (position, a look-at 10 m ahead, fov). */
  function camNow() {
    const p = camera.position, r = camera.rotation, cp = Math.cos(r.x);
    cur[0] = p.x; cur[1] = p.y; cur[2] = p.z;
    cur[3] = p.x + Math.sin(r.y) * cp * 10; cur[4] = p.y - Math.sin(r.x) * 10; cur[5] = p.z + Math.cos(r.y) * cp * 10; cur[6] = camera.fov;
  }
  function place(c) {
    for (let k = 0; k < 7; k++) last[k] = c[k];
    const dx = c[3] - c[0], dy = c[4] - c[1], dz = c[5] - c[2];
    camera.position.set(c[0], c[1], c[2]);
    camera.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0);
    camera.fov = c[6];
  }
  const d = g.director = {
    active: false,
    /** Play a shot list. opt: { onEnd, letterbox (default true), blendIn (s from the player's camera; 0: a cut), blendOut (s back). } */
    play(list, opt = {}) {
      shots = list; t = 0; len = totalLength(list); lastI = -1; manual = false; onEnd = opt.onEnd || null;
      d.letterbox = opt.letterbox !== false; d.active = true; controller.hold = true;
      blendIn = opt.blendIn || 0; blendOut = opt.blendOut || 0; outT = -1;
      gradeSaved.set(post.post.grade); frozenAt = -1; pinSaved = clock.pinHour; hourHeld = false;
      if (g.ebbholdView) { base.fill = g.ebbholdView.params.y; base.beam = g.ebbholdView.params.z; }
      if (blendIn > 0) {
        // The first shot's opening camera, against the camera as it is now: that difference decays away.
        evalShot(list[0], 0, 0, cam); camNow();
        for (let k = 0; k < 6; k++) off[k] = cur[k] - cam[k];
        off[6] = cur[6] - cam[6];
        if (Math.hypot(off[0], off[1], off[2]) > BLEND_MAX) blendIn = 0;   // too far: a cut
      }
    },
    /** Play a cutscene by name (data/cutscenes, or 'release': the Listener's, built from the player's record). */
    playCutscene(name, opt = {}) {
      if (name === 'release') { const b = releaseShots({ record: g.chapter?.graph.vars['ebb.record'] || [] }); d.play(b.shots, { ...b.opt, ...opt }); return true; }
      const cs = CUTSCENES[name];
      if (!cs) { console.warn('no cutscene', name); return false; }
      const b = build(cs);
      d.play(b.shots, { ...b.opt, ...opt });
      return true;
    },
    /** Hold the timeline at time s (s): a film drives it frame by frame. hold false: jump there and play on. */
    seek(s, hold = true) { manual = hold; t = s; },
    stop() {
      if (!d.active) return;
      d.active = false; shots = null; controller.hold = false; post.taa.dofOn = false; post.taa.blur = 0;
      if (g.crowd) g.crowd.show(false);
      if (g.drowned) for (const p of g.drowned.people) if (p.npc) p.npc.warm = false;   // (no longer kept for a shot)
      // Back to the world as it was: its grade, the city's light, everyone moving, the Wraith seen, no captions.
      if (hourHeld) { clock.pinHour = pinSaved; hourHeld = false; }
      g.regradeWanted = true;   // the world's own grade here (the cutscene may have ended somewhere else)
      if (g.ebbholdView) { g.ebbholdView.params.y = base.fill; g.ebbholdView.params.z = base.beam; }
      setFrozen(false); frozenAt = -1;
      if (g.sefa) g.sefa.show(false);
      if (g.wave) g.wave.set(0, 0, false);
      if (g.drift) g.drift.set(false, 0, 0);
      if (g.morrow) g.morrow.show(false);
      if (!wraithShown && g.game) { g.game.setPlayerVisible(true); wraithShown = true; }
      overlayFor({}, 0, 0);
      // Out: blended (the last shot's camera, as it was last placed, is held as the difference to the player's, dying away), or a cut.
      if (blendOut > 0) { for (let k = 0; k < 7; k++) off[k] = last[k]; outT = 0; outWant = true; }
      else post.post.resetHistory = true;
      if (g.arm) { g.arm.setFree(false); g.arm.snap(controller.pos); }
      const f = onEnd; onEnd = null; f?.();
    },
    get time() { return t; },
    /** Seconds into the blend back out (-1: none). */
    get outBlend() { return outT; },
    get outOff() { return off; },
    letterbox: true,
    /** Draw this frame's caption card and subtitle onto a 2D canvas (a film's frames: the DOM isn't in them). */
    drawOverlay(ctx, W, H) {
      if (shownText.slug) {
        ctx.fillStyle = 'rgba(6,7,8,' + shownText.dim + ')'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#d8d2c4'; ctx.font = '500 ' + Math.round(H * 0.03) + 'px Georgia, serif'; ctx.textAlign = 'center';
        wrapText(ctx, shownText.slug, W / 2, H * 0.47, W * 0.72, H * 0.045);
      }
      if (shownText.sub) {
        ctx.fillStyle = '#f1ece0'; ctx.font = Math.round(H * 0.032) + 'px Georgia, serif'; ctx.textAlign = 'center';
        ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(shownText.sub, W / 2, H * 0.85); ctx.shadowBlur = 0;
      }
    },
    /** The cutscenes' crowds (game/crowds.js), for shot lists. */
    crowds: { hallAlive, bakehouseBehind },
  };
  const sys = { name: 'director', update: () => {
    if (g.crowd) g.crowd.update(frozenAt >= 0 ? frozenAt : clock.simTime);
    const b = d.active && d.letterbox ? 1 : 0;
    barsK += (b - barsK) * Math.min(1, clock.realDt * (blendIn > 0 || blendOut > 0 ? 3 : 60));
    const shown = Math.round(barsK * 100);
    if (bars && shown !== barsShown) { barsShown = shown; const e = smoother(Math.min(1, Math.max(0, barsK))); bars[0].style.transform = bars[1].style.transform = 'scaleY(' + e.toFixed(3) + ')'; }
    if (!d.active) {
      // Blending back out: the player's camera (already placed this frame) plus the held difference, dying away.
      if (outT >= 0) {
        if (outWant) {
          camNow(); for (let k = 0; k < 7; k++) off[k] -= cur[k]; outWant = false;
          // Too far to travel (it would fly through the stone between): a cut instead.
          if (Math.hypot(off[0], off[1], off[2]) > BLEND_MAX) { outT = -1; post.post.resetHistory = true; return; }
        }
        outT += clock.dt;
        const w = 1 - smoother(Math.min(1, outT / blendOut));
        camNow();
        for (let k = 0; k < 7; k++) cur[k] += off[k] * w;
        place(cur);
        if (outT >= blendOut) outT = -1;
      }
      return;
    }
    if (!manual) t += clock.dt;
    if (t >= len && !manual) { d.stop(); return; }
    shotAt(shots, t, 0, at);
    const sh = shots[at.i];
    warmAhead();
    if (at.i !== lastI) {
      // A cut resets the temporal history; the opening of a blended start is not a cut.
      if (!(lastI < 0 && blendIn > 0)) { post.post.resetHistory = true; if (g.atmosphere) g.atmosphere.snapExposure = true; }
      lastI = at.i;
      // A shot's crowd (render/crowd.js): placed on its cut; a shot without one shows none.
      if (g.crowd) { if (sh.crowd) { g.crowd.set(sh.crowd); g.crowd.show(true); } else g.crowd.show(false); }
      // Time held still, or running again.
      if (sh.freeze) { if (frozenAt < 0) frozenAt = clock.simTime; setFrozen(true); } else { frozenAt = -1; setFrozen(false); }
      // The Wraith in the shot or not.
      const want = sh.wraith !== false;
      if (want !== wraithShown && g.game) { g.game.setPlayerVisible(want); wraithShown = want; }
      sh.onCut?.(g);
      // Out of the city (the release ends on the Sounding: the city's own exit puts the Wraith on the rim), and the hour.
      if ((sh.leave && g.ebbhold && g.ebbhold.active) || (sh.enter && g.ebbhold && !g.ebbhold.active)) { g.regradeWanted = true; resnap = 2; }
      if (sh.leave && g.ebbhold && g.ebbhold.active) g.ebbhold.exit();
      if (sh.enter && g.ebbhold && !g.ebbhold.active) { g.ebbhold.enter(sh.enter); controller.hold = true; }
      if (sh.hour !== undefined && g.params) { g.params.v.timeOfDay = sh.hour; g.params.version++; clock.pinHour = sh.hour; hourHeld = true; }
      sefaFor(sh, at.u, true);
    }
    sefaFor(sh, at.u, false);
    if (g.morrow) { if (sh.morrow) g.morrow.show(true, sh.morrow.f, sh.morrow.yaw ?? null, lerp2(sh.morrow.cut ?? 0, at.u)); else if (g.morrow.st.on) g.morrow.show(false); }
    if (g.drift) {
      if (sh.robes) { const lv = g.water && g.water.levelAt ? g.water.levelAt(SOUNDING.x, SOUNDING.z) : 1.41; g.drift.set(true, Number.isFinite(lv) && lv > -50 ? lv : 1.41, clock.simTime, sh.robes.rise ? lerp2(sh.robes.rise, at.u) : null); }
      else g.drift.set(false, 0, 0);
    }
    if (g.wave) { if (sh.wave) g.wave.set(lerp2(sh.wave.front, at.u), lerp2(sh.wave.t ?? 0, at.u), true); else g.wave.set(0, 0, false); }
    // A cut in or out of the city: once the world has graded the new place, that is the 'present' to blend toward.
    if (resnap > 0 && --resnap === 0) gradeSaved.set(post.post.grade);
    lookFor(sh, at.u);
    overlayFor(sh, at.u, at.u * sh.dur);
    // The Wraith moved along a path through the shot (a replay of its own record).
    if (sh.wraith && sh.wraith.path) {
      const P = sh.wraith.path, n = P.length - 1, q = Math.min(n - 1e-6, at.u * n), k = Math.floor(q), f = q - k, A = P[k], B = P[Math.min(n, k + 1)];
      controller.pos.x = A[0] + (B[0] - A[0]) * f; controller.pos.y = A[1] + (B[1] - A[1]) * f; controller.pos.z = A[2] + (B[2] - A[2]) * f;
      let dy = B[3] - A[3]; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI; controller.yaw = A[3] + dy * f;
    }
    evalShot(sh, at.u, t, cam);
    // The camera turned to follow one of the Drowned (a pan: where it stands stays the shot's).
    if (sh.look && g.drowned) {
      const P = g.drowned.people, w = sh.look.w ?? 1, O = EBB_ORIGIN;
      let p = null;
      for (let k = 0; k < P.length; k++) if (P[k].d.id === sh.look.id) p = P[k];
      if (p) {
        cam[3] += (p.x + O.x - cam[3]) * w; cam[4] += (p.y + O.y + (sh.look.y ?? 1.2) - cam[4]) * w; cam[5] += (p.z + O.z - cam[5]) * w;
        // Placed off them, too (the camera goes with them).
        const F = sh.look.from;
        if (F) { cam[0] = p.x + O.x + F[0]; cam[1] = p.y + O.y + F[1]; cam[2] = p.z + O.z + F[2]; cam[7] = Math.hypot(cam[3] - cam[0], cam[4] - cam[1], cam[5] - cam[2]); }
      }
    }
    if (at.i === 0 && blendIn > 0 && t < blendIn) {
      const w = 1 - smoother(t / blendIn);
      for (let k = 0; k < 7; k++) cam[k] += off[k] * w;
    }
    if (sh.shake) {
      // (From shakeAt on, if given: a shudder partway through.)
      const on = sh.shakeAt === undefined ? 1 : Math.min(1, Math.max(0, (at.u - sh.shakeAt) / 0.06));
      const a = sh.shake * (1 - at.u * 0.5) * on, tt = t * 23;
      cam[0] += a * Math.sin(tt * 1.3); cam[1] += a * Math.sin(tt * 1.7 + 1); cam[3] += a * 2 * Math.sin(tt * 1.1 + 2); cam[4] += a * 2 * Math.sin(tt * 0.9 + 3);
    }
    place(cam);
    // A key light for the shot (the fourth spell slot: the verbs clear theirs each frame, before this): { at: local, r, c, i }.
    if (sh.key) {
      const L = g.content.clipmap.spellLights, K = sh.key;
      // (on: one of the Drowned, or 'sefa': the light goes with them, at an offset)
      let bx = EBB_ORIGIN.x, by = EBB_ORIGIN.y, bz = EBB_ORIGIN.z;
      if (K.on === 'sefa' && g.sefa) { bx += g.sefa.st.x; by += g.sefa.st.y; bz += g.sefa.st.z; }
      else if (K.on && g.drowned) { const P = g.drowned.people; for (let k = 0; k < P.length; k++) if (P[k].d.id === K.on) { bx += P[k].x; by += P[k].y; bz += P[k].z; } }
      L[24] = K.at[0] + bx; L[25] = K.at[1] + by; L[26] = K.at[2] + bz; L[27] = K.r ?? 12;
      L[28] = K.c ? K.c[0] : 1; L[29] = K.c ? K.c[1] : 0.75; L[30] = K.c ? K.c[2] : 0.5; L[31] = K.i ?? 8;
    }
    const taa = post.taa;
    taa.dofOn = (sh.dof ?? 0) > 0; taa.focus = cam[7]; taa.focusRange = sh.dof || 1; taa.farBlur = 1; taa.maxBlur = sh.maxBlur ?? 9;
    taa.blur = sh.blur ?? 0.5;
  } };
  const S = loop.systems, k = S.findIndex((q) => q.name === 'atmosphere');
  S.splice(k < 0 ? S.length : k, 0, sys);
  // Before the Wraith is simulated and drawn: where a shot's path puts it this frame (the director runs after the Wraith, so on a
  // cut its first frame showed it still in the last shot's place — an empty room, then a figure from nowhere).
  const atPre = { i: 0, u: 0, cut: false };
  const pre = { name: 'directorPath', update: () => {
    if (!d.active) return;
    const tn = manual ? t : t + clock.dt;
    if (tn >= len) return;
    shotAt(shots, tn, 0, atPre);
    const sh = shots[atPre.i];
    if (!sh.wraith || !sh.wraith.path) return;
    const P = sh.wraith.path, n = P.length - 1, q = Math.min(n - 1e-6, atPre.u * n), k = Math.floor(q), f = q - k, A = P[k], B = P[Math.min(n, k + 1)];
    controller.pos.x = A[0] + (B[0] - A[0]) * f; controller.pos.y = A[1] + (B[1] - A[1]) * f; controller.pos.z = A[2] + (B[2] - A[2]) * f;
  } };
  const kp = S.findIndex((q) => q.name === 'player');
  S.splice(kp < 0 ? 0 : kp, 0, pre);
  return d;
}

/** Centred text broken onto lines no wider than maxW. */
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  const y0 = y - (lines.length - 1) * lh / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, y0 + i * lh));
}
