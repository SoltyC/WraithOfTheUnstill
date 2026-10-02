// Player system: maps actions to the capsule controller and the camera, and syncs the capsule
// mesh. Phase 3 swaps the capsule view for the Wraith; the controller interface stays.

import { input, Action } from '../input/actions.js';
import { clock } from '../core/clock.js';

/**
 * @param {{ controller: import('./capsuleController.js').CapsuleController, arm: import('../camera/springArm.js').SpringArmCamera,
 *           capsule: import('@babylonjs/core').Mesh, playerPos: import('@babylonjs/core').Vector4, bodyParams: import('@babylonjs/core').Vector4,
 *           capsuleHalfHeight: number }} ctx
 */
export function createPlayerSystem(ctx) {
  const { controller, arm, capsule, playerPos, bodyParams, capsuleHalfHeight } = ctx;
  return {
    name: 'player',
    update() {
      const dt = clock.dt;
      const d = input.down;
      const mx = d[Action.MoveRight] - d[Action.MoveLeft];
      const mz = d[Action.MoveForward] - d[Action.MoveBack];
      arm.look(input.mouseDX, input.mouseDY, input.wheel);

      if (arm.free) {
        // Free camera owns movement keys; the player stands still.
        controller.wishX = 0; controller.wishZ = 0; controller.wishUp = 0;
        arm.dt = dt;
        arm.update(controller.pos, controller.vel, mx, mz, d[Action.FreeCamUp] - d[Action.FreeCamDown], d[Action.FreeCamFast] === 1);
      } else {
        controller.wishX = mx;
        controller.wishZ = mz;
        controller.wishUp = d[Action.Jump] - d[Action.Dodge];
        controller.cameraYaw = arm.yaw;
        if (input.pressed[Action.Jump]) controller.jumpRequested = true;
        controller.dt = dt;
        controller.update();
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
