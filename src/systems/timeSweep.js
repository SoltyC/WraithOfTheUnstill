// Resting at a shrine: the sun runs on to the chosen hour and the light sweeps across the land (dunes-design
// §8b), not a fade or a cut. Forward only, so a rest always passes time.

const SECONDS = 5;

export function addTimeSweep(g) {
  const { loop, params, clock } = g;
  let from = 0, by = 0, t = -1;
  /** Run the clock on to `hour` (0..24). */
  g.sweepTime = (hour) => { from = params.v.timeOfDay; by = (hour - from + 24) % 24; t = 0; };
  loop.add({ name: 'timeSweep', update: () => {
    if (t < 0) return;
    t = Math.min(1, t + clock.realDt / SECONDS);
    const e = t * t * (3 - 2 * t);
    params.v.timeOfDay = (from + by * e) % 24; params.version++;
    if (t >= 1) t = -1;
  } });
}
