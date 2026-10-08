// The title's camera (user decision 2026-10-08): a slow bird's-eye orbit over the frost mountains
// while the title is up, and on Begin / Continue one continuous swoop from that height down into
// the monastery to the Wraith, ending exactly on the follow camera's own pose so there is no cut.
// The camera never goes under the ground: every frame the ground under it and ahead of it is
// sampled and the path is lifted (fast up, slow down) to keep clear of it.

const ORBIT = { radius: 700, height: 1400, speed: 0.016, fov: 0.82, pitchLook: 700 };
const DIVE_SECONDS = 13;
const CLEAR = 14;

const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const wrap = (a) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;

/** @param {any} g  shared boot context */
export function addTitleCamSystem(g) {
  const { loop, arm, camera, controller, ground, streamer, post, pendingTp, clock } = g;
  const mon = g.pois.find((p) => p.id === 'monastery');
  const C = { x: mon.pos[0], z: mon.pos[1] };
  /** 'off' | 'orbit' | 'wait' | 'dive' */
  let mode = 'off', t = 0, a0 = 0.6, homeYaw = 0, lift = 0, diveT = 0, waited = 0, done = null;
  const S = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 0 }, E = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 0 };
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 0 };
  const ZERO = { x: 0, y: 0, z: 0 };
  // Cinematic dressing for the swoop: letterbox bars, a place card, a depth of field that tightens on
  // the Wraith, and a fade up from black at the very start.
  const mk = (cls, parent = document.body) => { const e = document.createElement('div'); e.className = cls; parent.append(e); return e; };
  const bars = mk('intro-bars'); mk('b top', bars); mk('b bottom', bars);
  const card = mk('intro-card'); const cardKicker = mk('kicker', card), cardName = mk('name', card); mk('rule', card);
  const black = mk('intro-black');
  let cardShown = false, cardSpec = null;

  function floorAt(x, z) {
    ground.qx = x; ground.qz = z;
    if (!ground.covers()) return -Infinity;
    ground.sample();
    return ground.h;
  }
  /** Lift needed over the planned height: the highest ground under here and 30 / 90 / 180 m ahead. */
  function need(x, y, z, dx, dz) {
    let top = floorAt(x, z);
    for (let k = 1; k <= 3; k++) { const d = k === 1 ? 30 : k === 2 ? 90 : 180; const f = floorAt(x + dx * d, z + dz * d); if (f > top) top = f; }
    return top === -Infinity ? 0 : Math.max(0, top + CLEAR - y);
  }
  function applyLift(dt, wanted) {
    lift += (wanted - lift) * (wanted > lift ? Math.min(1, dt * 6) : Math.min(1, dt * 0.6));
  }

  function orbitPose(time) {
    const a = a0 + ORBIT.speed * time, R = ORBIT.radius + 90 * Math.sin(time * 0.045);
    pose.x = C.x + Math.sin(a) * R; pose.z = C.z + Math.cos(a) * R;
    pose.y = ORBIT.height + 70 * Math.sin(time * 0.06);
    lookAt(C.x + Math.sin(time * 0.03) * 60, ORBIT.pitchLook, C.z + Math.cos(time * 0.026) * 60);
    pose.fov = ORBIT.fov;
  }
  function lookAt(tx, ty, tz) {
    const dx = tx - pose.x, dz = tz - pose.z, h = Math.sqrt(dx * dx + dz * dz);
    pose.yaw = Math.atan2(dx, dz); pose.pitch = Math.atan2(pose.y - ty, h);
  }
  function put(p) { arm.setPose(p.x, p.y + lift, p.z, p.yaw, p.pitch, p.fov); }

  /** The follow camera's pose at the Wraith (what the game will show after the dive). */
  function followPose(out) {
    arm.free = false; arm.hold = false;
    arm.yaw = homeYaw; arm.pitch = 0.2;
    arm.snap(controller.pos);
    arm.dt = 0;
    arm.update(controller.pos, ZERO, 0, 0, 0, false);
    out.x = camera.position.x; out.y = camera.position.y; out.z = camera.position.z;
    out.yaw = arm.yaw; out.pitch = arm.pitch; out.fov = arm.fov;
  }

  function bezier(s, out) {
    // Start high and away, glide toward the monastery keeping height, then come down onto the end.
    const dx = E.x - S.x, dz = E.z - S.z, dist = Math.sqrt(dx * dx + dz * dz) || 1;
    const p1x = S.x + dx * 0.45, p1z = S.z + dz * 0.45, p1y = S.y * 0.9 + E.y * 0.1;
    const p2x = E.x - dx * 0.12, p2z = E.z - dz * 0.12, p2y = E.y + 30 + dist * 0.07;
    const u = 1 - s, b0 = u * u * u, b1 = 3 * u * u * s, b2 = 3 * u * s * s, b3 = s * s * s;
    out.x = b0 * S.x + b1 * p1x + b2 * p2x + b3 * E.x;
    out.y = b0 * S.y + b1 * p1y + b2 * p2y + b3 * E.y;
    out.z = b0 * S.z + b1 * p1z + b2 * p2z + b3 * E.z;
  }

  const self = g.titleCam = {
    get active() { return mode !== 'off'; },
    /** Tests only: run the camera faster than real time. */
    timeScale: 1,
    /** Depth of field for the cinematic (read by the cinematic system's post settings). */
    dof: false, focus: 50, focusRange: 50,
    /** Start the orbit (the title is up). */
    start() {
      homeYaw = arm.yaw;
      mode = 'orbit'; t = 0; lift = 0;
      black.classList.add('show'); requestAnimationFrame(() => requestAnimationFrame(() => black.classList.remove('show')));
      orbitPose(0); put(pose);
      post.post.resetHistory = true;
    },
    /** Swoop down to the Wraith; resolves when the follow camera has taken over. */
    dive(card) {
      if (mode === 'off') return Promise.resolve();
      cardSpec = card || null;
      mode = 'wait'; waited = 0;
      return new Promise((resolve) => { done = resolve; });
    },
  };

  loop.add({ name: 'titleCam', update: () => {
    if (mode === 'off') return;
    const dt = clock.realDt * self.timeScale;
    if (mode === 'orbit') {
      t += dt;
      orbitPose(t);
      const sx = Math.sin(pose.yaw), sz = Math.cos(pose.yaw);
      applyLift(dt, need(pose.x, pose.y, pose.z, sx, sz));
      put(pose);
      S.x = pose.x; S.y = pose.y + lift; S.z = pose.z; S.yaw = pose.yaw; S.pitch = pose.pitch; S.fov = pose.fov;
      return;
    }
    if (mode === 'wait') {
      // Hold the orbit until the ground round the Wraith is resident (a loaded game teleports first).
      waited += dt; t += dt;
      orbitPose(t); put(pose);
      S.x = pose.x; S.y = pose.y + lift; S.z = pose.z; S.yaw = pose.yaw; S.pitch = pose.pitch; S.fov = pose.fov;
      const ready = !pendingTp.active && streamer.arrived.length === 0 && streamer.pendingNear(controller.pos.x, controller.pos.z) === 0;
      if (!ready && waited < 6) return;
      followPose(E);
      arm.setPose(S.x, S.y, S.z, S.yaw, S.pitch, S.fov);
      mode = 'dive'; diveT = 0;
      bars.classList.add('on');
      return;
    }
    // Dive.
    diveT += dt;
    const k = Math.min(1, diveT / DIVE_SECONDS), s = smoother(k);
    bezier(s, pose);
    // Look at the Wraith most of the way, easing into the follow camera's own angles at the end.
    const tx = controller.pos.x, ty = controller.pos.y + 1.2, tz = controller.pos.z;
    lookAt(tx, ty, tz);
    const w = smoother(Math.min(1, Math.max(0, (k - 0.62) / 0.38)));
    const w0 = smoother(Math.min(1, k / 0.18));                     // ease out of the orbit's own aim
    const yawLook = pose.yaw, pitchLook = pose.pitch;
    pose.yaw = S.yaw + wrap(yawLook - S.yaw) * w0;
    pose.pitch = S.pitch + (pitchLook - S.pitch) * w0;
    pose.yaw = pose.yaw + wrap(E.yaw - pose.yaw) * w;
    pose.pitch = pose.pitch + (E.pitch - pose.pitch) * w;
    pose.fov = S.fov + (E.fov - S.fov) * s;
    const sx = Math.sin(pose.yaw), sz = Math.cos(pose.yaw);
    const wanted = need(pose.x, pose.y, pose.z, sx, sz) * (1 - w);   // over the last stretch the follow camera's own collision rules
    applyLift(dt, wanted);
    put(pose);
    // Depth of field: focus on the Wraith, loose at height, tight as the camera arrives.
    const dxw = tx - pose.x, dyw = ty - pose.y - lift, dzw = tz - pose.z;
    self.focus = Math.sqrt(dxw * dxw + dyw * dyw + dzw * dzw);
    self.focusRange = Math.max(10, self.focus * (0.9 - 0.45 * w));
    self.dof = k < 0.985;
    if (cardSpec && !cardShown && k > 0.5) { cardKicker.textContent = cardSpec.kicker; cardName.textContent = cardSpec.name; card.classList.add('on'); cardShown = true; }
    if (cardShown && k > 0.9) { card.classList.remove('on'); cardShown = false; cardSpec = null; }
    if (k > 0.92) bars.classList.remove('on');
    if (k >= 1) {
      self.dof = false;
      mode = 'off'; lift = 0;
      arm.setFree(false); arm.yaw = E.yaw; arm.pitch = E.pitch; arm.snap(controller.pos);
      post.post.resetHistory = true;
      const r = done; done = null; r?.();
    }
  } });
}
