// Climbing the Warden and the release's knockdown (the two ways something other than the
// controller owns the Wraith's body). The climb system runs before the player system: while
// gripping, the climb owns the Wraith. `g.knockCtl` exposes the knockdown step and the pose
// override to the Wraith, Warden-spot and cinematic code.

/** @param {any} g  shared boot context */
export function addClimbSystem(g) {
  const { loop, input, Action, climb, controller, arm, combat, combatTuning, warden, wraithView, sfx, SFX, clock, knock, releaseCam, terrainState, BRUSH_PLOUGH, capture } = g;

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
      if (warden.active && warden.shockR > 0 && !knock.active && !climb.climbing && combat.dying === 0 && !controller.god) {
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
      w.climbing = climb.climbing; w.climbBlend = climb.blend; w.gripOn = climb.climbing;
      if (climb.climbing) {
        for (let i = 0; i < 12; i++) w.grip[i] = climb.holds[i];
        w.feetFree = climb.feetFree;
        w.cpx = climb.x; w.cpy = climb.y; w.cpz = climb.z; w.climbPhase = climb.phase;
        w.cr[0] = climb.rx; w.cr[1] = climb.ry; w.cr[2] = climb.rz; w.cu[0] = climb.ux; w.cu[1] = climb.uy; w.cu[2] = climb.uz;
        w.cf[0] = climb.fx; w.cf[1] = climb.fy; w.cf[2] = climb.fz;
      }
    },
  };
  g.knockCtl = knockCtl;

  loop.add({ name: 'climb', update: () => {
    const inp = input, A = Action, d = inp.down;
    climb.grip = d[A.Traverse] === 1 && !controller.surf.active && !arm.free && combat.dying === 0;
    climb.mx = d[A.MoveRight] - d[A.MoveLeft]; climb.mz = d[A.MoveForward] - d[A.MoveBack];
    climb.crx = Math.cos(arm.yaw); climb.crz = -Math.sin(arm.yaw);
    climb.px = controller.pos.x; climb.py = controller.pos.y; climb.pz = controller.pos.z;
    climb.dt = clock.dt;
    const was = climb.climbing;
    climb.update();
    // The camera's pivot stands off the climbed surface, so the Wraith is seen against it.
    const push = climb.climbing ? 1.6 : 0;
    arm.pushX = -climb.fx * push; arm.pushY = -climb.fy * push; arm.pushZ = -climb.fz * push;
    if (climb.grabbed) {
      // A hand bites into the crust: a puff of snow knocked loose, a small jolt.
      sfx.x = climb.gx; sfx.y = climb.gy; sfx.z = climb.gz; sfx.gain = 0.8; sfx.play(SFX.CRUNCH);
      for (let q = 0; q < 10; q++) {
        const a = q * 0.618 * Math.PI * 2;
        wraithView.ex = climb.gx; wraithView.ey = climb.gy; wraithView.ez = climb.gz;
        wraithView.evx = -climb.fx * 0.8 + Math.cos(a) * 0.5; wraithView.evy = -0.4 + (q % 3) * 0.3; wraithView.evz = -climb.fz * 0.8 + Math.sin(a) * 0.5;
        wraithView.esize = 0.03 + 0.015 * (q % 3); wraithView.emit();
      }
      arm.shake += 0.0035;
    }
    if (climb.climbing) {
      // Held to the surface: the feet point sits below the pelvis along the climb.
      controller.hold = true;
      controller.pos.x = climb.x - climb.ux * 0.85; controller.pos.y = climb.y - climb.uy * 0.85; controller.pos.z = climb.z - climb.uz * 0.85;
      controller.vel.x = climb.vx; controller.vel.y = climb.vy; controller.vel.z = climb.vz;
      controller.grounded = false;
      // Strike or freeze a back joint within reach (the verbs, at hand).
      if (climb.nearJoint >= 0) {
        if (inp.pressed[A.Primary] && warden.strikeJoint(climb.nearJoint)) combat.breakJoint();
        if (inp.pressed[A.Heavy] && combat.spend(combatTuning.costCrystal)) { warden.freezeJoint(climb.nearJoint); arm.shake += 0.01; }
      }
    } else if (was && climb.fell === 4) {
      // Over the capital: the Wraith stands on the pillar's top.
      controller.hold = false; controller.grounded = true;
      controller.pos.x = climb.topX; controller.pos.y = climb.topY; controller.pos.z = climb.topZ;
      controller.vel.x = 0; controller.vel.y = 0; controller.vel.z = 0;
      sfx.x = climb.topX; sfx.y = climb.topY; sfx.z = climb.topZ; sfx.gain = 0.7; sfx.play(SFX.STEP);
    } else if (was) {
      // Off the Warden: real momentum from here (thrown, dropped or slipped).
      controller.hold = false; controller.grounded = false;
      controller.vel.x = climb.vx; controller.vel.y = climb.vy; controller.vel.z = climb.vz;
      if (climb.fell === 1) arm.shake += 0.03;
    }
    knockCtl.dt = clock.dt; knockCtl.step();
  } });
}
