// The cinematic director (Phase 10 U6; game/director.js is the timeline): plays a list of shots on the game camera — letterboxed,
// the Wraith's controls held, depth of field pulled to each shot's focus, camera motion blur on, the temporal history reset on
// every cut. Runs just before the atmosphere (it and the shadows read the camera when they update). Time comes from the game
// clock, or from seek() (a fixed-step film; later the audio clock).
//
// Into and out of play without a jump (inertialization, cutscene-research.md §7): a cutscene may begin from wherever the player's
// camera is (blendIn: the difference to the first shot's camera decays to nothing over that many seconds), and end back into
// the player's camera the same way (blendOut). The letterbox slides in and out.

import { shotAt, evalShot, totalLength } from '../game/director.js';
import { hallAlive, bakehouseBehind } from '../game/crowds.js';
import { CUTSCENES, build } from '../game/cutscenes.js';

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
      if (blendIn > 0) {
        // The first shot's opening camera, against the camera as it is now: that difference decays away.
        evalShot(list[0], 0, 0, cam); camNow();
        for (let k = 0; k < 6; k++) off[k] = cur[k] - cam[k];
        off[6] = cur[6] - cam[6];
        if (Math.hypot(off[0], off[1], off[2]) > BLEND_MAX) blendIn = 0;   // too far: a cut
      }
    },
    /** Play a cutscene by name (data/cutscenes). */
    playCutscene(name, opt = {}) {
      const cs = CUTSCENES[name];
      if (!cs) { console.warn('no cutscene', name); return false; }
      const b = build(cs);
      d.play(b.shots, { ...b.opt, ...opt });
      return true;
    },
    /** Hold the timeline at time s (s): a film drives it frame by frame. */
    seek(s) { manual = true; t = s; },
    stop() {
      if (!d.active) return;
      d.active = false; shots = null; controller.hold = false; post.taa.dofOn = false; post.taa.blur = 0;
      if (g.crowd) g.crowd.show(false);
      // Out: blended (the last shot's camera, as it was last placed, is held as the difference to the player's, dying away), or a cut.
      if (blendOut > 0) { for (let k = 0; k < 7; k++) off[k] = last[k]; outT = 0; outWant = true; }
      if (g.arm) { g.arm.setFree(false); g.arm.snap(controller.pos); }
      else post.post.resetHistory = true;
      const f = onEnd; onEnd = null; f?.();
    },
    get time() { return t; },
    /** Seconds into the blend back out (-1: none). */
    get outBlend() { return outT; },
    get outOff() { return off; },
    letterbox: true,
    /** The cutscenes' crowds (game/crowds.js), for shot lists. */
    crowds: { hallAlive, bakehouseBehind },
  };
  const sys = { name: 'director', update: () => {
    if (g.crowd) g.crowd.update(clock.simTime);
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
    if (at.i !== lastI) {
      // A cut resets the temporal history; the opening of a blended start is not a cut.
      if (!(lastI < 0 && blendIn > 0)) { post.post.resetHistory = true; if (g.atmosphere) g.atmosphere.snapExposure = true; }
      lastI = at.i;
      // A shot's crowd (render/crowd.js): placed on its cut; a shot without one shows none.
      if (g.crowd) { if (sh.crowd) { g.crowd.set(sh.crowd); g.crowd.show(true); } else g.crowd.show(false); }
    }
    evalShot(sh, at.u, t, cam);
    if (at.i === 0 && blendIn > 0 && t < blendIn) {
      const w = 1 - smoother(t / blendIn);
      for (let k = 0; k < 7; k++) cam[k] += off[k] * w;
    }
    place(cam);
    const taa = post.taa;
    taa.dofOn = (sh.dof ?? 0) > 0; taa.focus = cam[7]; taa.focusRange = sh.dof || 1; taa.farBlur = 1; taa.maxBlur = sh.maxBlur ?? 9;
    taa.blur = sh.blur ?? 0.5;
  } };
  const S = loop.systems, k = S.findIndex((q) => q.name === 'atmosphere');
  S.splice(k < 0 ? S.length : k, 0, sys);
  return d;
}
