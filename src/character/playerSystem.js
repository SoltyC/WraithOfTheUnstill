// Player system: maps actions to the capsule controller and the camera, and syncs the capsule
// mesh. Phase 3 swaps the capsule view for the Wraith; the controller interface stays.

import { input, Action } from '../input/actions.js';
import { clock } from '../core/clock.js';
import { angleDelta } from '../core/scratch.js';

/** Surf steering feel: mouse pixels → steer (fraction of carve grip), and how fast it recentres. */
const SURF_STEER_PER_PX = 0.0032, SURF_STEER_RETURN = 2.6, SURF_KEY_STEER = 0.75;
/** Camera while surfing: follows the heading (1/s), banks with the lean, widens. */
const SURF_CAM_FOLLOW = 3.2, SURF_CAM_BANK = 0.32, SURF_EXTRA_FOV = 0.1;

/**
 * @param {{ controller: import('./capsuleController.js').CapsuleController, arm: import('../camera/springArm.js').SpringArmCamera,
 *           capsule: import('@babylonjs/core').Mesh, playerPos: import('@babylonjs/core').Vector4, bodyParams: import('@babylonjs/core').Vector4,
 *           capsuleHalfHeight: number }} ctx
 */
export function createPlayerSystem(ctx) {
  const { controller, arm, capsule, playerPos, bodyParams, capsuleHalfHeight, material } = ctx;
  let steerAcc = 0;
  return {
    name: 'player',
    update() {
      const dt = clock.dt;
      const d = input.down;
      const mx = d[Action.MoveRight] - d[Action.MoveLeft];
      const mz = d[Action.MoveForward] - d[Action.MoveBack];
      const sf = controller.surf;
      // While surfing the mouse steers the carve (horizontal) instead of orbiting the camera.
      const surfing = sf.active && !arm.free;
      arm.look(surfing ? 0 : input.mouseDX, input.mouseDY, input.wheel);

      if (controller.scripted || controller.hold) {
        // A scripted run (photo spots) drives the controller; the camera holds.
        arm.dt = dt;
        arm.update(controller.pos, controller.vel, 0, 0, 0, false);
      } else if (arm.free) {
        // Free camera owns movement keys; the player stands still.
        controller.wishX = 0; controller.wishZ = 0; controller.wishUp = 0;
        arm.dt = dt;
        arm.update(controller.pos, controller.vel, mx, mz, d[Action.FreeCamUp] - d[Action.FreeCamDown], d[Action.FreeCamFast] === 1);
      } else {
        // Snow-surf (hold traversal) where the ground underfoot is snow.
        sf.want = d[Action.Traverse] === 1;
        if (material) { material.mqx = controller.pos.x; material.mqz = controller.pos.z; material.sampleMaterial(); sf.canSurf = material.mat === 0; }
        else sf.canSurf = true;
        if (surfing) {
          steerAcc += input.mouseDX * SURF_STEER_PER_PX;
          steerAcc *= Math.exp(-dt * SURF_STEER_RETURN);
          steerAcc = Math.max(-1.2, Math.min(1.2, steerAcc));
          sf.steer = steerAcc + mx * SURF_KEY_STEER;
          sf.throttle = mz;
        } else { steerAcc = 0; sf.steer = 0; sf.throttle = 0; }
        controller.wishX = mx;
        controller.wishZ = mz;
        controller.wishUp = d[Action.Jump] - d[Action.Dodge];
        controller.cameraYaw = arm.yaw;
        if (input.pressed[Action.Jump]) controller.jumpRequested = true;
        controller.dt = dt;
        controller.update();
        // Camera: follows the carve's heading, banks into the lean, widens with the rush.
        const b = sf.blend;
        if (sf.active) arm.yaw += angleDelta(arm.yaw, sf.heading) * (1 - Math.exp(-dt * SURF_CAM_FOLLOW)) * b;
        arm.rollTarget = -sf.lean * SURF_CAM_BANK * b;
        arm.extraFov = SURF_EXTRA_FOV * b;
        // Hard carves rattle the camera a little (grip beyond ~70 %).
        arm.shakeHold = sf.active ? Math.max(0, Math.abs(sf.latAccel) - 10.5) * 0.0012 : 0;
        arm.dt = dt;
        arm.update(controller.pos, controller.vel, 0, 0, 0, false);
      }

      const p = controller.pos;
      capsule.position.set(p.x, p.y + capsuleHalfHeight, p.z);
      capsule.rotation.y = controller.yaw;
      playerPos.x = p.x; playerPos.y = p.y; playerPos.z = p.z;
      bodyParams.z = clock.simTime;
    },
  };
}
