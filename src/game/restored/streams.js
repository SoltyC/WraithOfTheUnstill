// Streams: the rising air a restored biome gives back (docs/gameplay-design.md §7). A stream is a line laid along a
// windward face (data/restored.json `streams`): within `width` m of it the air climbs at up to `rise` m/s, in full up to
// 0.6 × `top` m over the ground and gone by 1.2 × `top`. It is the wind's, so it breathes with it: the owner passes
// k (the field's speed over its mean, 0.4 to 1.5) and a gust front doubles the climb a lull halves. It is the land's,
// so it follows the restoration of its biome and is nothing while that biome is stilled. Allocation-free per call.

const MEAN_WIND = 0.5, K_MIN = 0.4, K_MAX = 1.5;

/** The field's speed as a stream's factor (1 at the mean wind). */
export function windFactor(speed) { const k = speed / MEAN_WIND; return k < K_MIN ? K_MIN : k > K_MAX ? K_MAX : k; }

export class Streams {
  /**
   * @param {{ id: string, biome: string, pts: number[][], width: number, rise: number, top: number }[]} list
   * @param {Record<string, number>} restore  the biomes' restoration 0..1 (read live: `restoration.frost`, `.meadow`)
   */
  constructor(list, restore) {
    this.list = list; this.restore = restore;
    this.n = list.length;
    // Segments as flat arrays per stream: ax, az, bx, bz, length-squared.
    this.seg = list.map((s) => {
      const out = new Float64Array((s.pts.length - 1) * 5);
      for (let i = 0; i + 1 < s.pts.length; i++) {
        const [ax, az] = s.pts[i], [bx, bz] = s.pts[i + 1], o = i * 5;
        out[o] = ax; out[o + 1] = az; out[o + 2] = bx; out[o + 3] = bz; out[o + 4] = (bx - ax) * (bx - ax) + (bz - az) * (bz - az);
      }
      return out;
    });
    /** Out: the stream that gave the most at the last query (-1 none), and its share 0..1 of its full rise there. */
    this.best = -1; this.share = 0.5 - 0.5; this.total = 0.5 - 0.5;
  }

  /** Distance from (x, z) to stream `i`'s line. */
  distance(i, x, z) {
    const s = this.seg[i]; let best = 1e18;
    for (let o = 0; o < s.length; o += 5) {
      const dx = s[o + 2] - s[o], dz = s[o + 3] - s[o + 1];
      let t = s[o + 4] > 0 ? ((x - s[o]) * dx + (z - s[o + 1]) * dz) / s[o + 4] : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = s[o] + dx * t - x, ez = s[o + 1] + dz * t - z, d = ex * ex + ez * ez;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /** The rise (m/s) at (x, z), `above` m over the ground, in wind factor k. Sets `best` and `share`. */
  rise(x, above, z, k) {
    let total = 0; this.best = -1; this.share = 0; this.total = 0;
    for (let i = 0; i < this.n; i++) {
      const s = this.list[i], r = this.restore[s.biome];
      if (!(r > 0.02)) continue;
      const u = this.distance(i, x, z) / s.width;
      if (u >= 1) continue;
      const a = 1 - u * u, across = a * a;
      const h0 = s.top * 0.6, h1 = s.top * 1.2, v = above <= h0 ? 0 : above >= h1 ? 1 : (above - h0) / (h1 - h0), up = 1 - v * v * (3 - 2 * v);
      const share = across * up * r;
      if (share > this.share) { this.share = share; this.best = i; }
      total += s.rise * share * k;
    }
    this.total = total;
    return total;
  }
}
