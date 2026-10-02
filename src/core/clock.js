// World clock. Real frame dt is clamped; world time of day advances by params.
import { params } from './params.js';

export const clock = {
  /** Seconds of simulation since boot (paused when frozen). */
  simTime: 0.5,
  /** Simulation dt of the current frame in seconds (clamped; 0 when frozen). */
  dt: 0.5,
  /** When true (photo-spot captures), simulation does not advance. */
  frozen: false,
  frame: 0,
  /** Real elapsed seconds since the previous frame; written by the loop before advanceClock(). */
  realDt: 0.5,
};

const MAX_DT = 1 / 15;

/** Advance by clock.realDt (a field, not an argument: see core/loop.js). */
export function advanceClock() {
  clock.frame++;
  const r = clock.realDt;
  const dt = r > MAX_DT ? MAX_DT : r < 0 ? 0 : r;
  clock.dt = clock.frozen ? 0 : dt;
  clock.simTime += clock.dt;
  const p = params.v;
  if (p.timeScale > 0 && !clock.frozen) {
    // A full day takes dayLengthMin real minutes.
    p.timeOfDay = (p.timeOfDay + (clock.dt * 24) / (p.dayLengthMin * 60)) % 24;
    params.version++;
  }
}
