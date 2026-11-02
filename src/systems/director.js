// The cinematic director (Phase 10 U6; game/director.js is the timeline): plays a list of shots on the game camera — letterboxed,
// the Wraith's controls held, depth of field pulled to each shot's focus, camera motion blur on, the temporal history reset on
// every cut. Runs just before the atmosphere (it and the shadows read the camera when they update). Time comes from the game
// clock, or from seek() (a fixed-step film; later the audio clock).

import { shotAt, evalShot, totalLength } from '../game/director.js';

/** @param {any} g  shared boot context */
export function addDirectorSystem(g) {
  const { loop, camera, controller, clock, post, bars } = g;
  const cam = new Float64Array(8), at = { i: 0, u: 0, cut: false };
  let shots = null, t = 0, len = 0, manual = false, lastI = -1, onEnd = null, barsShown = -1;
  const d = g.director = {
    active: false,
    /** Play a shot list. opt: { onEnd, letterbox (default true) }. */
    play(list, opt = {}) {
      shots = list; t = 0; len = totalLength(list); lastI = -1; manual = false; onEnd = opt.onEnd || null;
      d.letterbox = opt.letterbox !== false; d.active = true; controller.hold = true;
    },
    /** Hold the timeline at time s (s): a film drives it frame by frame. */
    seek(s) { manual = true; t = s; },
    stop() {
      if (!d.active) return;
      d.active = false; shots = null; controller.hold = false; post.taa.dofOn = false; post.taa.blur = 0;
      if (g.arm) { g.arm.setFree(false); g.arm.snap(controller.pos); }
      post.post.resetHistory = true;
      const f = onEnd; onEnd = null; f?.();
    },
    get time() { return t; },
    letterbox: true,
  };
  const sys = { name: 'director', update: () => {
    const b = d.active && d.letterbox ? 1 : 0, shown = b * 100;
    if (bars && shown !== barsShown) { barsShown = shown; bars[0].style.transform = bars[1].style.transform = 'scaleY(' + b + ')'; }
    if (!d.active) return;
    if (!manual) t += clock.dt;
    if (t >= len && !manual) { d.stop(); return; }
    shotAt(shots, t, 0, at);
    const sh = shots[at.i];
    if (at.i !== lastI) { lastI = at.i; post.post.resetHistory = true; if (g.atmosphere) g.atmosphere.snapExposure = true; }
    evalShot(sh, at.u, t, cam);
    const dx = cam[3] - cam[0], dy = cam[4] - cam[1], dz = cam[5] - cam[2];
    camera.position.set(cam[0], cam[1], cam[2]);
    camera.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0);
    camera.fov = cam[6];
    const taa = post.taa;
    taa.dofOn = (sh.dof ?? 0) > 0; taa.focus = cam[7]; taa.focusRange = sh.dof || 1; taa.farBlur = 1; taa.maxBlur = sh.maxBlur ?? 9;
    taa.blur = sh.blur ?? 0.5;
  } };
  const S = loop.systems, k = S.findIndex((q) => q.name === 'atmosphere');
  S.splice(k < 0 ? S.length : k, 0, sys);
  return d;
}
