// Calm after peaks (docs/gameplay-design.md §4.2, Left 4 Dead's relax phase): after an encounter clears, a Warden is released
// or the Wraith re-forms from a death, no encounter may rise within `radius` m of that spot for `secs` s. Story-forced
// waves (an encounter's later waves, the Warden's own summons) are exempt: only a NEW rising asks `holds`. Data-driven: the
// numbers are `calmTuning`. Allocation-free: a ring of four spots in typed arrays.

export const calmTuning = { radius: 120, secs: 60 };
const N = 4;

/** @param {{ simTime: number }} clock */
export function createCalm(clock) {
  const x = new Float64Array(N), z = new Float64Array(N), until = new Float64Array(N).fill(-1);
  let head = 0;
  return {
    /** A peak ended at (px, pz): the quiet starts now. */
    note(px, pz) { x[head] = px; z[head] = pz; until[head] = clock.simTime + calmTuning.secs; head = (head + 1) % N; },
    /** Is a new rising at (px, pz) held back? */
    holds(px, pz) {
      const r2 = calmTuning.radius * calmTuning.radius;
      for (let k = 0; k < N; k++) if (until[k] > clock.simTime && (x[k] - px) * (x[k] - px) + (z[k] - pz) * (z[k] - pz) < r2) return true;
      return false;
    },
    /** Seconds of quiet left at (px, pz) (0 = none). */
    left(px, pz) {
      const r2 = calmTuning.radius * calmTuning.radius; let m = 0;
      for (let k = 0; k < N; k++) if (until[k] > clock.simTime && (x[k] - px) * (x[k] - px) + (z[k] - pz) * (z[k] - pz) < r2) m = Math.max(m, until[k] - clock.simTime);
      return m;
    },
    reset() { until.fill(-1); },
  };
}
