// The release cinematic: when the last joint breaks the camera takes a slow orbit around the
// Warden as it exhales and lies down (letterboxed, skippable), with the slam's white flash and a
// restrained depth of field. `g.feedReleaseCam` is shared with the photo-spot release stepping.

/** @param {any} g  shared boot context */
export function addCinematicSystem(g) {
  const { loop, releaseCam, warden, wardenMod, knock, knockCtl, controller, arm, clock, input, Action, post, bars, flashEl, capture } = g;
  let barsShown = -1, flash = 0, flashShown = -1, releaseWasActive = false;
  /** Release camera inputs from the Warden and the Wraith. */
  function feedReleaseCam(rc) {
    const b = warden.body;
    rc.wt = warden.state === wardenMod.W.RESTED ? 99 : warden.t;
    rc.tx = b.sx[3]; rc.ty = b.sy[3] + 2; rc.tz = b.sz[3];
    rc.hx = b.hx; rc.hy = b.hy; rc.hz = b.hz;
    if (knock.active) { rc.px = knock.x; rc.py = knock.y; rc.pz = knock.z; }
    else { rc.px = controller.pos.x; rc.py = controller.pos.y + 0.9; rc.pz = controller.pos.z; }
    rc.hitT = knockCtl.hitT;
  }
  g.feedReleaseCam = feedReleaseCam;
  /** It lies down where it stands: a Wraith beside or under it would end up inside it, so it is set clear, on the side
   *  it was already on. Wide enough for the chest's slam forward and the drifts along the flanks. */
  const CLEAR = 17;
  function clearOfBody() {
    const b = warden.body, p = controller.pos;
    let near = 0, best = Infinity;
    for (let i = 0; i < b.sx.length; i++) { const d = Math.hypot(p.x - b.sx[i], p.z - b.sz[i]); if (d < best) { best = d; near = i; } }
    if (best >= CLEAR) return;
    let dx = p.x - b.sx[near], dz = p.z - b.sz[near];
    if (Math.hypot(dx, dz) < 0.5) { dx = Math.cos(b.heading); dz = -Math.sin(b.heading); }
    const l = Math.hypot(dx, dz);
    let x = p.x, z = p.z;
    for (let k = 0; k < 12; k++) { // out along that line until every part of the body is far enough
      let m = Infinity;
      for (let i = 0; i < b.sx.length; i++) m = Math.min(m, Math.hypot(x - b.sx[i], z - b.sz[i]));
      if (m >= CLEAR) break;
      x += dx / l * (CLEAR - m + 0.5); z += dz / l * (CLEAR - m + 0.5);
    }
    controller.teleport(x, z);
    controller.vel.x = 0; controller.vel.y = 0; controller.vel.z = 0;
  }
  loop.add({ name: 'releaseCam', update: () => {
    const rc = releaseCam;
    rc.dt = clock.realDt;
    const releasing = warden.active && warden.state === wardenMod.W.RELEASE;
    if (releasing) {
      feedReleaseCam(rc);
      if (!rc.played && !rc.active && !capture) {
        knockCtl.hitT = -1;
        clearOfBody(); // on the cut into the cinematic, unseen
        feedReleaseCam(rc);
        rc.start();
      }
      if (warden.slam && !capture) { clock.hitStop = Math.max(clock.hitStop, 0.22); flash = 0.85; }
    } else if (!rc.active && warden.state !== wardenMod.W.RESTED) rc.played = false;
    const was = rc.active;
    rc.skip = rc.active && (input.pressed[Action.Jump] || input.pressed[Action.Interact]);
    if (rc.skip || rc.active !== releaseWasActive) post.post.resetHistory = true; // camera cuts
    releaseWasActive = rc.active;
    if (rc.skip) {
      // Skipped: straight to the end — lain down in the land, the Wraith on its feet.
      warden.finishRelease(); knock.reset(); knockCtl.dt = 0; knockCtl.step();
    }
    if (rc.active) feedReleaseCam(rc);
    rc.update();
    if (rc.active) arm.setPose(rc.x, rc.y, rc.z, rc.yaw, rc.pitch, rc.fov);
    else if (was) {
      // Back to the Wraith, looking the way the camera last looked.
      arm.setFree(false); arm.yaw = rc.yaw; arm.pitch = 0.2; arm.snap(controller.pos);
    }
    // The cinematic's restrained depth of field: focus on the Warden, the far steppe softens.
    const taa = post.taa;
    const cine = rc.active || (rc.hold && rc.bars > 0.5); // held cinematic frames (captures) too
    const tc = g.titleCam;
    taa.dofOn = cine || (tc && tc.dof);
    if (!cine && tc && tc.dof) { taa.focus = tc.focus; taa.focusRange = tc.focusRange; }
    if (cine) {
      const dx = rc.tx - rc.x, dy = rc.ty - rc.y, dz = rc.tz - rc.z;
      taa.focus = Math.sqrt(dx * dx + dy * dy + dz * dz); taa.focusRange = Math.max(18, taa.focus * 0.55);
    }
    const shown = Math.round(rc.bars * 100);
    if (shown !== barsShown) { barsShown = shown; bars[0].style.transform = bars[1].style.transform = 'scaleY(' + (rc.bars * rc.bars * (3 - 2 * rc.bars)).toFixed(3) + ')'; }
    flash *= Math.exp(-clock.realDt * 4.5);
    const fs = Math.round(flash * 100);
    if (fs !== flashShown) { flashShown = fs; flashEl.style.opacity = (fs / 100).toFixed(2); }
  } });
}
