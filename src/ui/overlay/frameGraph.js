// Frame-time graph drawn on a 2D canvas. One bar per frame, newest at the right, with guide
// lines at the 90 FPS budget (11.1 ms) and the 60 FPS floor (16.7 ms). Allocation-free.

const BUDGET_MS = 1000 / 90;
const FLOOR_MS = 1000 / 60;
const SCALE_MS = 40; // top of the graph

export class FrameGraph {
  /** @param {HTMLCanvasElement} canvas @param {import('../../core/frameStats.js').FrameStats} stats */
  constructor(canvas, stats) {
    this.canvas = canvas;
    this.stats = stats;
    this.ctx = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width * dpr));
    this.h = Math.max(1, Math.round(r.height * dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
  }

  draw() {
    if (this.w === 0) this.resize();
    const { ctx, w, h, stats } = this;
    ctx.clearRect(0, 0, w, h);
    const n = Math.min(stats.count, w >> 1);
    const bw = 2;
    for (let i = 0; i < n; i++) {
      const ms = stats.ago(i);
      const bh = Math.min(h, (ms / SCALE_MS) * h);
      ctx.fillStyle = ms > FLOOR_MS ? '#ff5a4f' : ms > BUDGET_MS ? '#e8c46a' : '#6fb3e8';
      ctx.fillRect(w - (i + 1) * bw, h - bh, bw - 0.5, bh);
    }
    ctx.fillStyle = 'rgba(232,196,106,0.55)';
    ctx.fillRect(0, h - (BUDGET_MS / SCALE_MS) * h, w, 1);
    ctx.fillStyle = 'rgba(255,90,79,0.55)';
    ctx.fillRect(0, h - (FLOOR_MS / SCALE_MS) * h, w, 1);
    // Median + 4 ms hitch line.
    if (stats.medianMs > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(0, h - ((stats.medianMs + 4) / SCALE_MS) * h, w, 1);
    }
  }
}
