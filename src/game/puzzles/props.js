// The moving parts of the dune puzzles: one pool of Shaped chunks (render/shapedView.js: one draw, no new
// pipeline), in rigid groups that move as one: a mirror's disc, a door, the sand in a bowl. A group is
// rewritten only when it changes, so a still site costs nothing here. Allocation only while a site is built.

import { CHUNK_FLOATS } from '../shaped/rig.js';

export function createProps(max) {
  const chunks = new Float32Array(max * CHUNK_FLOATS);
  const parts = [], groups = [];
  const P = {
    chunks, max, count: 0,
    /** A new rigid group at (x, y, z), turned by yaw. Returns its id. */
    group(x = 0, y = 0, z = 0, yaw = 0) {
      groups.push({ x, y, z, yaw, scale: 1, on: true, glow: 0, dirty: true, from: parts.length, to: parts.length });
      return groups.length - 1;
    },
    /** A chunk in group `g` (local position, whole sizes). */
    add(g, x, y, z, sx, sy, sz, kind, o = {}) {
      if (parts.length >= max) throw new Error('puzzle props: pool full');
      groups[g].to = parts.length + 1;
      parts.push({ x, y, z, sx, sy, sz, kind, seed: o.seed ?? parts.length * 3.7, glow: o.glow ?? -1, f: o.f || [0, 0, 1], u: o.u || [0, 1, 0] });
      P.count = parts.length;
    },
    /** Move a group. */
    pose(g, x, y, z, yaw) {
      const G = groups[g];
      if (G.x === x && G.y === y && G.z === z && G.yaw === yaw) return;
      G.x = x; G.y = y; G.z = z; G.yaw = yaw; G.dirty = true;
    },
    /** Height scale from the group's foot (sand in a bowl, a column rising). */
    scale(g, s) { const G = groups[g]; if (G.scale !== s) { G.scale = s; G.dirty = true; } },
    show(g, on) { const G = groups[g]; if (G.on !== on) { G.on = on; G.dirty = true; } },
    /** Glow for the group's chunks that take it (made with glow: -1, the default). */
    glow(g, v) { const G = groups[g]; if (Math.abs(G.glow - v) > 0.004) { G.glow = v; G.dirty = true; } },
    group_(g) { return groups[g]; },
    /** Rewrite what changed. True when anything did. */
    write() {
      let any = false;
      for (let i = 0; i < groups.length; i++) {
        const G = groups[i];
        if (!G.dirty) continue;
        G.dirty = false; any = true;
        const c = Math.cos(G.yaw), s = Math.sin(G.yaw);
        for (let k = G.from; k < G.to; k++) {
          const p = parts[k], o = k * CHUNK_FLOATS, f = p.f, u = p.u;
          chunks[o] = G.x + p.x * c + p.z * s; chunks[o + 1] = G.y + p.y * G.scale; chunks[o + 2] = G.z - p.x * s + p.z * c;
          chunks[o + 3] = p.sx; chunks[o + 7] = p.sy * G.scale; chunks[o + 11] = p.sz;
          chunks[o + 4] = f[0] * c + f[2] * s; chunks[o + 5] = f[1]; chunks[o + 6] = f[2] * c - f[0] * s;
          chunks[o + 8] = u[0] * c + u[2] * s; chunks[o + 9] = u[1]; chunks[o + 10] = u[2] * c - u[0] * s;
          chunks[o + 12] = p.seed; chunks[o + 13] = p.kind; chunks[o + 14] = p.glow < 0 ? G.glow : p.glow; chunks[o + 15] = G.on ? 1 : 0;
        }
      }
      return any;
    },
  };
  return P;
}
