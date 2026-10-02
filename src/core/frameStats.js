// Frame-time statistics: a fixed ring of recent frame times plus throttled percentile
// summaries. `push` runs every frame and never allocates; `summarize` sorts a pre-allocated copy.

export const FRAME_HISTORY = 600;

export class FrameStats {
  constructor(capacity = FRAME_HISTORY) {
    this.capacity = capacity;
    this.ms = new Float32Array(capacity);
    this.sorted = new Float32Array(capacity);
    this.head = 0; // next write index
    this.count = 0;
    // Summary, refreshed by summarize().
    this.avgMs = 0;
    this.medianMs = 0;
    this.p99Ms = 0;
    this.maxMs = 0;
    this.fps = 0;
    this.low1Fps = 0;
    /** Frames slower than median + 4 ms (BRIEF §3 hitch rule) within the window. */
    this.hitches = 0;
  }

  push(ms) {
    this.ms[this.head] = ms;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** Value `i` frames ago (0 = most recent). */
  ago(i) {
    return this.ms[(this.head - 1 - i + this.capacity * 2) % this.capacity];
  }

  summarize() {
    const n = this.count;
    if (n === 0) return;
    let sum = 0;
    let max = 0;
    for (let i = 0; i < n; i++) {
      const v = this.ms[i];
      this.sorted[i] = v;
      sum += v;
      if (v > max) max = v;
    }
    const view = this.sorted.subarray(0, n); // subarray allocates a view: call only when throttled
    view.sort();
    this.avgMs = sum / n;
    this.medianMs = view[n >> 1];
    this.p99Ms = view[Math.min(n - 1, Math.floor(n * 0.99))];
    this.maxMs = max;
    this.fps = 1000 / this.avgMs;
    this.low1Fps = 1000 / this.p99Ms;
    const limit = this.medianMs + 4;
    let h = 0;
    for (let i = 0; i < n; i++) if (this.ms[i] > limit) h++;
    this.hitches = h;
  }
}
