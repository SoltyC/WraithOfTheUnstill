// Same Surf controller, different traction: lower flat cruise, stronger slip-face pull,
// wider carves and a shallower lean. Borrowed/mastered access is owned by the Walker progression.
export const sandSurfTuning = {
  cruise: 11, boost: 14, push: 7,
  gravity: 9.81 * 1.5, drag: 0.009, friction: 1.1, maxSpeed: 32,
  brake: 10, latMax: 11, carveDrag: 0.055, turnResponse: 5.5,
  minTurnSpeed: 4, leanResponse: 8, maxLean: 0.52, exitSpeed: 5.2,
};
