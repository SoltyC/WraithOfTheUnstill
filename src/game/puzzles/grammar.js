// The sand grammar's runtime (docs/phase-9/dunes-design.md §3): the rules every dune puzzle is built
// from, as plain numbers with no scene. A site (src/game/puzzles/<site>.js) wires these to its stones,
// and tests and the bot solvers can drive them without a GPU.
//   G4 frost patches that thaw in sun and keep in shade (frostPatches, sunlit)
//   G6 one ray in plan, up to 6 bounces, off mirrors and through ice lenses (traceBeam)
//   G1, G2, G3 sand moved between bowls by chutes that open and freeze (sandClock)
//   G7 a phrase of booms, each started before the last fades (phrase, boomPitch)
// Nothing here allocates once a site is built: it runs every frame while the Wraith is at a site.

export const GRAMMAR = {
  thawSun: 60,          // s a frost patch lasts in sun (G4)
  thawShade: 600,       // s in shade
  shadeStep: 6,         // m between height samples along the sun ray
  shadeReach: 240,      // m: the ray stops here
  shadeBias: 0.6,       // m: the ground under the point does not shade it
  maxBounces: 6,        // G6
  lensMelt: 20,         // s a beam takes to melt an ice lens
  boomFade: 6,          // s a boom lasts: the next must start before it ends (G7)
  flowRate: 0.25,       // bowl fills per second through an open chute
};

/** Is (x, y, z) in the sun? Marches toward it over heightAt(x, z); sunY ≤ 0 is night (no sun). */
export function sunlit(x, y, z, sx, sy, sz, heightAt) {
  if (sy <= 0) return false;
  const G = GRAMMAR, h = Math.hypot(sx, sz) || 1e-6, dx = sx / h, dz = sz / h, rise = sy / h;
  for (let d = G.shadeStep; d <= G.shadeReach; d += G.shadeStep) {
    if (heightAt(x + dx * d, z + dz * d) > y + G.shadeBias + rise * d) return false;
  }
  return true;
}

/** A fixed pool of frozen patches (G3, G4). `life` runs 1 → 0: the crust darkens as it goes. */
export function frostPatches(max = 16) {
  const x = new Float64Array(max), z = new Float64Array(max), r = new Float64Array(max), life = new Float64Array(max);
  const shade = new Uint8Array(max);
  let next = 0;
  return {
    x, z, r, life, shade, max,
    /** Freeze a round of ground; reuses the oldest slot when full. Returns the slot. */
    add(px, pz, pr) {
      let k = -1;
      for (let i = 0; i < max; i++) if (life[i] > 0 && Math.hypot(px - x[i], pz - z[i]) < 0.5 * (pr + r[i])) { k = i; break; }
      if (k < 0) { k = next; next = (next + 1) % max; }
      x[k] = px; z[k] = pz; r[k] = pr; life[k] = 1; return k;
    },
    /** True while any live patch covers (px, pz). */
    holds(px, pz, pr = 0) {
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) continue;
        const dx = px - x[i], dz = pz - z[i], R = r[i] + pr;
        if (dx * dx + dz * dz < R * R) return true;
      }
      return false;
    },
    /** Age every patch. `shade[k]` is set by the owner, at its own rate (sunlit() is not per-frame work). */
    update(dt) {
      const G = GRAMMAR;
      for (let i = 0; i < max; i++) if (life[i] > 0) life[i] = Math.max(0, life[i] - dt / (shade[i] ? G.thawShade : G.thawSun));
    },
    clear() { life.fill(0); },
  };
}


/**
 * One light ray in plan (G6). `site.parts` is a fixed list of round parts:
 *   { kind: 'mirror', x, z, r, yaw } turns the ray about its face normal (yaw) — only from the front;
 *   { kind: 'lens', x, z, r, bend, on } bends it by `bend` rad while on;
 *   { kind: 'block', x, z, r, on } stops it while on (a sandfall, a door);
 *   { kind: 'glyph', x, z, r } is a target: the ray stops there, and that part's `lit` goes true.
 * Writes the points to `out` ([x0, z0, x1, z1, …]); returns how many, and sets site.hit to the last part
 * reached (or null). Each part's `lit` says the ray reached it.
 */
export function traceBeam(sx, sz, dx, dz, site, out, reach = 300) {
  const parts = site.parts;
  for (let i = 0; i < parts.length; i++) parts[i].lit = false;
  site.hit = null;
  let n = 0, last = null;
  out[n++] = sx; out[n++] = sz;
  for (let bounce = 0; bounce <= GRAMMAR.maxBounces; bounce++) {
    let best = null, bestT = reach;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p === last || ((p.kind === 'lens' || p.kind === 'block') && !p.on)) continue;
      const ox = p.x - sx, oz = p.z - sz, t = ox * dx + oz * dz;
      if (t <= 0 || t >= bestT) continue;
      const ex = ox - dx * t, ez = oz - dz * t;
      if (ex * ex + ez * ez < p.r * p.r) { best = p; bestT = t; }
    }
    sx += dx * bestT; sz += dz * bestT;
    out[n++] = sx; out[n++] = sz;
    if (!best) return n;
    best.lit = true; site.hit = best; last = best;
    if (best.kind === 'mirror') {
      const nx = Math.sin(best.yaw), nz = Math.cos(best.yaw), dot = dx * nx + dz * nz;
      if (dot >= 0) return n; // the back of the stone
      dx -= 2 * dot * nx; dz -= 2 * dot * nz;
    } else if (best.kind === 'lens') {
      const c = Math.cos(best.bend), s = Math.sin(best.bend), ndx = dx * c + dz * s;
      dz = dz * c - dx * s; dx = ndx;
    } else return n;
  }
  return n;
}

/**
 * Sand moved between bowls (G1–G3): levels in 0..1, chutes that carry it downhill while open.
 *   bowls: [{ id, level, source? (fills without end: Shaper sand never stops), drain? (loses sand while draining) }]
 *   chutes: [{ from, to (bowl index, or -1: lost), open, frozen, weight (share at a split) }]
 * A frozen chute carries nothing. Sand goes down each bowl's open chutes in proportion to their weight, and
 * a bowl takes no more than it has room for: the rest waits above.
 */
export function sandClock(bowls, chutes) {
  return {
    bowls, chutes,
    step(dt) {
      const G = GRAMMAR;
      for (let i = 0; i < bowls.length; i++) {
        const b = bowls[i];
        if (b.source) b.level = 1;
        let sum = 0;
        for (let c = 0; c < chutes.length; c++) { const h = chutes[c]; if (h.from === i && h.open && !h.frozen) sum += h.weight ?? 1; }
        if (sum > 0) {
          const out = Math.min(b.level, G.flowRate * dt);
          for (let c = 0; c < chutes.length; c++) {
            const h = chutes[c];
            if (h.from !== i || !h.open || h.frozen) continue;
            const part = out * (h.weight ?? 1) / sum;
            if (h.to < 0) { if (!b.source) b.level -= part; continue; }
            const to = bowls[h.to], take = Math.min(part, 1 - to.level);
            to.level += take; if (!b.source) b.level -= take;
          }
        }
        if (b.drain) b.level = Math.max(0, b.level - G.flowRate * dt);
      }
    },
  };
}

/** Bigger avalanches boom lower (G7): relative pitch from the sand moved (m³), 0.5..1.5. */
export function boomPitch(volume) {
  return Math.max(0.5, Math.min(1.5, 1.5 - 0.25 * Math.log10(Math.max(1, volume))));
}

/** A phrase of notes (G7). Each must start before the last has faded; a wrong note starts it over. */
export function phrase(notes, fade = GRAMMAR.boomFade) {
  return {
    notes, at: 0, last: -1e9, done: false,
    /** A boom of `note` at time t (s). Returns how far along the phrase now stands. */
    play(note, t) {
      if (this.done) return this.at;
      if (this.at > 0 && t - this.last > fade) this.at = 0;
      if (note === notes[this.at]) { this.at++; this.last = t; if (this.at === notes.length) this.done = true; }
      else if (note === notes[0]) { this.at = 1; this.last = t; }
      else this.at = 0;
      return this.at;
    },
    /** Time passing with no boom: a fade loses the phrase. */
    tick(t) { if (!this.done && this.at > 0 && t - this.last > fade) this.at = 0; },
  };
}
