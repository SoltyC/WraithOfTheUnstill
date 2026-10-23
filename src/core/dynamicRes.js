// Dynamic render resolution controller (pure: no engine access, driven by time and samples).
// Every scale change resizes the post targets, resets TAA history and the render snapshot, so
// changes are rare (>= 1.5 s apart) and stepped (0.05). The Quality slider is the maximum.
//
// Input is GPU frame time (core/gpuTimer.js) when the device has timestamp queries; otherwise the
// presented frame time, which is capped by the display refresh, so that mode only reacts to
// sustained overshoot of max(target, refresh floor) + 3 ms and never chases the vsync floor.

export const MIN_SCALE = 0.6;   // below this the robe and faces go soft (user, 2026-10-24)
export const STEP = 0.05;
export const WINDOW = 30;
export const MIN_SAMPLES = 15;
const DOWN_FACTOR = 1.05, DOWN_HOLD_S = 1;
const UP_FACTOR = 0.87, UP_HOLD_S = 3;   // was 0.8: at 14 ms that needed < 11.2 ms to climb back, so a busy scene left it low for good
const MIN_INTERVAL_S = 1.5;
const FALLBACK_MARGIN_MS = 3;

const grid = (s) => Math.round(Math.round(s / STEP + 1e-9) * STEP * 1000) / 1000;

export class DynamicRes {
  constructor() {
    this.scale = 1;
    this.buf = new Float32Array(WINDOW);
    this.n = 0; this.head = 0;
    this.overSince = -1; this.underSince = -1;
    this.lastChange = -Infinity;
    this._sorted = new Float32Array(WINDOW);
  }

  /** Start (or restart) at `scale`, e.g. when the controller is switched on. */
  reset(scale, now = 0) {
    this.scale = scale;
    this._clearWindow();
    this.lastChange = now;
  }

  _clearWindow() { this.n = 0; this.head = 0; this.overSince = -1; this.underSince = -1; }

  push(ms) {
    if (!(ms >= 0) || !isFinite(ms)) return;
    this.buf[this.head] = ms;
    this.head = (this.head + 1) % WINDOW;
    if (this.n < WINDOW) this.n++;
  }

  _sortedWindow() {
    const a = this._sorted.subarray(0, this.n);
    a.set(this.buf.subarray(0, this.n)); // before the ring wraps, the first n slots are the samples
    return a.sort();
  }

  /** Median of the last <= WINDOW samples (0 when empty). */
  median() {
    if (this.n === 0) return 0;
    const a = this._sortedWindow();
    return a[this.n >> 1];
  }

  /**
   * @param {number} now seconds (monotonic)
   * @param {number} max upper bound (the Quality slider)
   * @param {number} targetMs
   * @param {boolean} gpuTimed false: samples are presented frame times (fallback rules)
   * @returns {number} the scale to render at (changes at most once per 1.5 s, in 0.05 steps)
   */
  update(now, max, targetMs, gpuTimed = true) {
    max = Math.min(1, Math.max(MIN_SCALE, max));
    if (this.scale > max) { this._commit(now, max); return this.scale; } // slider lowered: follow at once
    if (this.n < MIN_SAMPLES) return this.scale;
    const med = this.median();
    let tgt = targetMs, margin = 0;
    if (!gpuTimed) {
      tgt = Math.max(targetMs, this._sortedWindow()[0]); // refresh floor
      margin = FALLBACK_MARGIN_MS;
    }
    const over = med > tgt * DOWN_FACTOR + margin && this.scale > MIN_SCALE;
    const under = med < tgt * UP_FACTOR && this.scale < max;
    this.overSince = over ? (this.overSince < 0 ? now : this.overSince) : -1;
    this.underSince = under ? (this.underSince < 0 ? now : this.underSince) : -1;
    if (now - this.lastChange < MIN_INTERVAL_S) return this.scale;
    if (over && now - this.overSince >= DOWN_HOLD_S) {
      this._commit(now, Math.max(MIN_SCALE, Math.min(grid(this.scale - STEP), this.scale - 0.01)));
    } else if (under && now - this.underSince >= UP_HOLD_S) {
      this._commit(now, Math.min(max, Math.max(grid(this.scale + STEP), this.scale + 0.01)));
    }
    return this.scale;
  }

  _commit(now, scale) {
    this.scale = scale;
    this.lastChange = now;
    this._clearWindow(); // old samples were taken at another resolution
  }
}
