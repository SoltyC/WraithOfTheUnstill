// Climbing the Warden and the release's knockdown (the two ways something other than the
// controller owns the Wraith's body). The climb system runs before the player system: while
// gripping, the climb owns the Wraith. `g.knockCtl` exposes the knockdown step and the pose
// override to the Wraith, Warden-spot and cinematic code.

/** @param {any} g  shared boot context */
export function addClimbSystem(g) {
  const { loop, input, Action, climb, bellClimb, bellwether, controller, arm, combat, combatTuning, warden, wraithView, sfx, SFX, clock, knock, releaseCam, terrainState, BRUSH_PLOUGH, capture } = g;

  /** The climb that has the Wraith: the Warden's, or the Bellwether's neck (see pickClimb). Both expose the same fields. */
  let cl = climb;
  g.activeClimb = cl;
  const NECK_NEAR = 70;   // m from the neck's base within which a grip is meant for the Bellwether

  const knockCtl = {
    /** Warden time of the knockdown hit (−1: none yet), for the release camera. */
    hitT: -1,
    /** Last frame's shockwave radius (−1: no wave). */
    prevShockR: -1,
    /** Shockwave → knockdown; while down the knockdown owns the Wraith's position. Fields: dt. */
    dt: 0.5 - 0.5,
    step() {
      const dt = knockCtl.dt;
      const p = controller.pos;
      if (warden.active && warden.shockR > 0 && !knock.active && !cl.climbing && combat.dying === 0 && !controller.god) {
        const dx = p.x - warden.shockX, dz = p.z - warden.shockZ, d = Math.hypot(dx, dz);
        if (knockCtl.prevShockR >= 0 && knockCtl.prevShockR < d && warden.shockR >= d && d < 70) {
          knock.hx = p.x; knock.hy = p.y; knock.hz = p.z; knock.hdx = dx / (d || 1); knock.hdz = dz / (d || 1);
          knock.hit(); knockCtl.hitT = warden.t;
          sfx.x = p.x; sfx.y = p.y + 1; sfx.z = p.z; sfx.gain = 1.6; sfx.play(SFX.RUMBLE); sfx.play(SFX.WHOOSH);
          arm.shake += 0.07; if (!capture) clock.hitStop = Math.max(clock.hitStop, 0.09);
        }
      }
      knockCtl.prevShockR = warden.active ? warden.shockR : -1;
      const was = knock.active;
      knock.dt = dt; knock.hold = releaseCam.active || releaseCam.hold; knock.update();
      if (knock.active) {
        controller.hold = true; controller.grounded = false;
        p.x = knock.footX; p.y = knock.footY; p.z = knock.footZ;
        controller.vel.x = knock.vx; controller.vel.y = knock.vy; controller.vel.z = knock.vz;
        if (knock.landed) {
          sfx.x = knock.x; sfx.y = knock.y; sfx.z = knock.z; sfx.gain = 1.2; sfx.play(SFX.THUD); sfx.play(SFX.CRUNCH);
          // A thump in the snow: powder from under it.
          for (let q = 0; q < 26; q++) {
            const a = q * 0.2417 * Math.PI * 2;
            wraithView.ex = knock.x + Math.cos(a) * 0.3; wraithView.ey = knock.y - 0.1; wraithView.ez = knock.z + Math.sin(a) * 0.3;
            wraithView.evx = Math.cos(a) * 2.2 + knock.vx * 0.3; wraithView.evy = 1 + (q % 5) * 0.4; wraithView.evz = Math.sin(a) * 2.2 + knock.vz * 0.3;
            wraithView.esize = 0.08 + 0.02 * (q % 4); wraithView.emit();
          }
          arm.shake += 0.02;
        }
        if (knock.sliding) {
          // Its back ploughs a furrow through the snow.
          const sp = Math.hypot(knock.vx, knock.vz) || 1;
          terrainState.bx = knock.x; terrainState.bz = knock.z; terrainState.bdx = knock.vx / sp; terrainState.bdz = knock.vz / sp;
          terrainState.bl = 0.3; terrainState.bw = 0.42; terrainState.bd = 0.12; terrainState.bc = 0.6;
          terrainState.bk = BRUSH_PLOUGH; terrainState.bwet = 0; terrainState.bbias = 0; terrainState.bberm = 0.8;
          terrainState.stamp();
        }
      } else if (was) {
        // On its feet again, facing back toward where it was thrown from.
        controller.hold = false; controller.grounded = true;
        controller.vel.x = 0; controller.vel.y = 0; controller.vel.z = 0;
        controller.yaw = Math.atan2(-knock.dx, -knock.dz);
      }
    },
    /** The Wraith's pose override from the climb or the knockdown (shared with the captures). */
    feedOverride(w) {
      if (knock.active) {
        w.climbing = true; w.knocked = true; w.climbBlend = 1; w.gripOn = false;
        w.cpx = knock.x; w.cpy = knock.y; w.cpz = knock.z; w.climbPhase = clock.simTime * 6;
        w.cr[0] = knock.rx; w.cr[1] = knock.ry; w.cr[2] = knock.rz; w.cu[0] = knock.ux; w.cu[1] = knock.uy; w.cu[2] = knock.uz;
        w.cf[0] = knock.fx; w.cf[1] = knock.fy; w.cf[2] = knock.fz;
        return;
      }
      w.knocked = false;
      // A climb that was let go of still eases its pose out (blend), so the active one is the last to have gripped.
      const c = cl;
      w.climbing = c.climbing; w.climbBlend = c.blend; w.gripOn = c.climbing;
      if (c.climbing) {
        for (let i = 0; i < 12; i++) w.grip[i] = c.holds[i];
        w.feetFree = c.feetFree;
        w.cpx = c.x; w.cpy = c.y; w.cpz = c.z; w.climbPhase = c.phase;
        w.cr[0] = c.rx; w.cr[1] = c.ry; w.cr[2] = c.rz; w.cu[0] = c.ux; w.cu[1] = c.uy; w.cu[2] = c.uz;
        w.cf[0] = c.fx; w.cf[1] = c.fy; w.cf[2] = c.fz;
      }
    },
  };
  g.knockCtl = knockCtl;

  loop.add({ name: 'climb', update: () => {
    const inp = input, A = Action, d = inp.down;
    const wantGrip = d[A.Traverse] === 1 && !controller.surf.active && !arm.free && combat.dying === 0 && !g.bellCine;
    const mx = d[A.MoveRight] - d[A.MoveLeft], mz = d[A.MoveForward] - d[A.MoveBack];
    const crx = Math.cos(arm.yaw), crz = -Math.sin(arm.yaw);
    const px = controller.pos.x, py = controller.pos.y, pz = controller.pos.z;
    // Whichever climb is gripping keeps the Wraith; a new grip goes to the Bellwether's neck within reach of its base,
    // otherwise to the Warden (they are in different biomes, so the choice is never close).
    const bb = bellwether.base, bdx = px - bb.x, bdz = pz - bb.z;
    const bell = bellClimb.climbing || (!climb.climbing && bdx * bdx + bdz * bdz < NECK_NEAR * NECK_NEAR);
    climb.grip = wantGrip && !bell; bellClimb.grip = wantGrip && bell;
    for (const c of [climb, bellClimb]) { c.mx = mx; c.mz = mz; c.crx = crx; c.crz = crz; c.px = px; c.py = py; c.pz = pz; c.dt = clock.dt; }
    const prev = cl, was = prev.climbing;
    climb.update(); bellClimb.update();
    cl = bellClimb.climbing ? bellClimb : climb.climbing ? climb : prev;
    g.activeClimb = cl;
    const climb_ = cl;
    // The camera's pivot stands off the climbed surface, so the Wraith is seen against it.
    const push = climb_.climbing ? 1.6 : 0;
    arm.pushX = -climb_.fx * push; arm.pushY = -climb_.fy * push; arm.pushZ = -climb_.fz * push;
    if (climb_.grabbed) {
      // A hand bites into the crust: a puff of snow knocked loose, a small jolt.
      sfx.x = climb_.gx; sfx.y = climb_.gy; sfx.z = climb_.gz; sfx.gain = 0.8; sfx.play(SFX.CRUNCH);
      for (let q = 0; q < 10; q++) {
        const a = q * 0.618 * Math.PI * 2;
        wraithView.ex = climb_.gx; wraithView.ey = climb_.gy; wraithView.ez = climb_.gz;
        wraithView.evx = -climb_.fx * 0.8 + Math.cos(a) * 0.5; wraithView.evy = -0.4 + (q % 3) * 0.3; wraithView.evz = -climb_.fz * 0.8 + Math.sin(a) * 0.5;
        wraithView.esize = 0.03 + 0.015 * (q % 3); wraithView.emit();
      }
      arm.shake += 0.0035;
    }
    if (climb_.climbing) {
      // Held to the surface: the feet point sits below the pelvis along the climb.
      controller.hold = true;
      controller.pos.x = climb_.x - climb_.ux * 0.85; controller.pos.y = climb_.y - climb_.uy * 0.85; controller.pos.z = climb_.z - climb_.uz * 0.85;
      controller.vel.x = climb_.vx; controller.vel.y = climb_.vy; controller.vel.z = climb_.vz;
      controller.grounded = false;
      // Strike or freeze a back joint within reach (the verbs, at hand) — the Warden's; the neck's valves are the fight's (bellwetherFight.js).
      if (climb_ === climb && climb.nearJoint >= 0) {
        if (inp.pressed[A.Primary] && warden.strikeJoint(climb.nearJoint)) combat.breakJoint();
        if (inp.pressed[A.Heavy] && combat.spend(combatTuning.costCrystal)) { warden.freezeJoint(climb.nearJoint); arm.shake += 0.01; }
      }
    } else if (was && climb_.fell === 4) {
      // Over the capital: the Wraith stands on the pillar's top.
      controller.hold = false; controller.grounded = true;
      controller.pos.x = climb_.topX; controller.pos.y = climb_.topY; controller.pos.z = climb_.topZ;
      controller.vel.x = 0; controller.vel.y = 0; controller.vel.z = 0;
      sfx.x = climb_.topX; sfx.y = climb_.topY; sfx.z = climb_.topZ; sfx.gain = 0.7; sfx.play(SFX.STEP);
    } else if (was) {
      // Off the Warden (or the neck): real momentum from here (thrown, dropped or slipped).
      controller.hold = false; controller.grounded = false;
      controller.vel.x = climb_.vx; controller.vel.y = climb_.vy; controller.vel.z = climb_.vz;
      if (climb_.fell === 1) arm.shake += 0.03;
    }
    knockCtl.dt = clock.dt; knockCtl.step();
  } });
}
