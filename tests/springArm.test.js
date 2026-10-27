import { expect, it } from 'vitest';
import { SpringArmCamera, armTuning } from '../src/camera/springArm.js';

it('preserves a free-camera lens when the deferred player teleport finishes', () => {
  const arm = new SpringArmCamera({}, {});
  arm.free = true; arm.fov = 0.7;
  arm.snap({ x: 10, y: 20, z: 30 });
  expect(arm.fov).toBe(0.7);
  arm.setFree(false); arm.snap({ x: 40, y: 50, z: 60 });
  expect(arm.fov).toBe(armTuning.baseFov);
});
