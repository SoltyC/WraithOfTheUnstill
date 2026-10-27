// D2 granular reference. Each undirected edge exchanges equal/opposite signed height from
// one immutable iteration. Eight neighbours × 1/16 keeps the Jacobi step monotone. Tile edges
// are closed: processing overlapping tiles later transports mass across previous boundaries.
export const DRY_REPOSE = Math.tan(34 * Math.PI / 180);
export const WET_REPOSE = Math.tan(60 * Math.PI / 180);
export const RELAX_RATE = 1 / 16;
export const RELAX_TILE = 128;
export const RELAX_ITERATIONS = 32;
export const RELAX_LIFETIME = 30;
const DX = [1, 0, 1, -1], DZ = [0, 1, 1, 1];
export const isSand = (m) => m === 1 || m === 6;

/** Pure CPU oracle; heights are signed deformation, base is undeformed terrain height. */
export function createRelaxationGrid(n, spacing) {
  const count = n * n, height = new Float64Array(count), base = new Float64Array(count);
  const wet = new Float64Array(count), frozen = new Uint8Array(count), material = new Uint8Array(count).fill(1);
  const next = new Float64Array(count);
  return { n, spacing, height, base, wet, frozen, material,
    run(iterations = 1) {
      for (let pass = 0; pass < iterations; pass++) {
        next.set(height);
        for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
          const i = z * n + x;
          if (!isSand(material[i]) || frozen[i]) continue;
          for (let d = 0; d < 4; d++) {
            const xx = x + DX[d], zz = z + DZ[d];
            if (xx < 0 || xx >= n || zz >= n) continue;
            const j = zz * n + xx;
            if (!isSand(material[j]) || frozen[j]) continue;
            if (Math.abs(height[i]) + Math.abs(height[j]) < 1e-6) continue;
            const slope = DRY_REPOSE + (WET_REPOSE - DRY_REPOSE) * Math.max(wet[i], wet[j]);
            const limit = slope * spacing * (d < 2 ? 1 : Math.SQRT2);
            const dh = base[i] + height[i] - base[j] - height[j];
            const flow = Math.sign(dh) * Math.max(0, Math.abs(dh) - limit) * RELAX_RATE;
            next[i] -= flow; next[j] += flow;
          }
        }
        height.set(next);
      }
    },
  };
}

/** Fixed storage dirty scheduler. One bounded tile per frame, alternating half-tile origins
 * so closed tile boundaries do not become permanent seams. TTL is refreshed by actual writes.
 */
export function createRelaxationQueue(capacity = 64) {
  const xs = new Int32Array(capacity), zs = new Int32Array(capacity), until = new Float64Array(capacity);
  const generations = new Uint32Array(capacity);
  let serial = 0;
  let cursor = 0, evict = 0, wakeX = NaN, wakeZ = NaN;
  const q = { x: 0, z: 0, now: 0.5, pending: 0, capacity, slot: 0, generation: 0,
    // GPU results may arrive after a fresh brush, slot reuse or save restore.
    retire(slot, generation) {
      if (generation !== 0 && generations[slot] === generation) until[slot] = 0;
    },
    // Revisit old deformation as the player approaches, even without a new brush. Limit the
    // neighbourhood to 25 tiles so a full-window reload cannot evict every recent writer.
    wake(x, z) {
      const stride = RELAX_TILE / 2;
      const xx = Math.floor(x / stride), zz = Math.floor(z / stride);
      if (xx === wakeX && zz === wakeZ) return;
      wakeX = xx; wakeZ = zz;
      q.mark(xx * stride - RELAX_TILE, zz * stride - RELAX_TILE,
        xx * stride + RELAX_TILE, zz * stride + RELAX_TILE);
    },
    mark(x0, z0, x1, z1) {
      const stride = RELAX_TILE / 2;
      for (let z = Math.floor(z0 / stride); z <= Math.floor(z1 / stride); z++) {
        for (let x = Math.floor(x0 / stride); x <= Math.floor(x1 / stride); x++) {
          let slot = -1;
          for (let k = 0; k < capacity; k++) {
            if (until[k] > q.now && xs[k] === x && zs[k] === z) { slot = k; break; }
          }
          if (slot < 0) {
            for (let k = 0; k < capacity; k++) if (until[k] <= q.now) { slot = k; break; }
          }
          if (slot < 0) { slot = evict; evict = (evict + 1) % capacity; }
          // Reserve two GPU tag bits. After a billion tags, disable retirement rather
          // than wrap tags and risk confusing an old result with a new job.
          // A fresh write to the same tile also invalidates an older empty readback.
          serial = Math.min(serial + 1, 0x40000000);
          generations[slot] = serial < 0x40000000 ? serial : 0;
          xs[slot] = x; zs[slot] = z; until[slot] = q.now + RELAX_LIFETIME;
        }
      }
    },
    take(x0, z0, x1, z1) {
      q.pending = 0;
      for (let k = 0; k < capacity; k++) if (until[k] > q.now) q.pending++;
      for (let k = 0; k < capacity; k++) {
        const i = (cursor + k) % capacity;
        if (until[i] <= q.now) continue;
        const x = xs[i] * RELAX_TILE / 2 - RELAX_TILE / 4;
        const z = zs[i] * RELAX_TILE / 2 - RELAX_TILE / 4;
        if (x < x0 || z < z0 || x + RELAX_TILE > x1 || z + RELAX_TILE > z1) { until[i] = 0; continue; }
        q.x = x; q.z = z; q.slot = i; q.generation = generations[i];
        cursor = (i + 1) % capacity; return true;
      }
      return false;
    },
    reset() { until.fill(0); cursor = 0; evict = 0; wakeX = NaN; wakeZ = NaN; q.pending = 0; },
  };
  return q;
}

/** Cheaper coarse oracle: disjoint pairs settle directly to their shared repose. Alternating
 * horizontal/vertical parity phases propagate the result without racing adjacent writes.
 */
export function projectTalusPairs(grid,vertical,phase,rowStart=0,rowCount=grid.n) {
  const {n,height,base,wet,frozen,material,spacing}=grid;
  for(let z=rowStart+(vertical?phase:0);z<Math.min(n,rowStart+rowCount);z+=vertical?2:1){
    for(let x=vertical?0:phase;x<n;x+=vertical?1:2){
      const xx=x+(vertical?0:1),zz=z+(vertical?1:0);
      if(xx>=n||zz>=n)continue;
      const i=z*n+x,j=zz*n+xx;
      if(frozen[i]||frozen[j]||!isSand(material[i])||!isSand(material[j]))continue;
      if(Math.abs(height[i])+Math.abs(height[j])<1e-6)continue;
      const limit=(DRY_REPOSE+(WET_REPOSE-DRY_REPOSE)*Math.max(wet[i],wet[j]))*spacing;
      const dh=(height[i]-height[j])+(base[i]-base[j]);
      const flow=Math.sign(dh)*Math.max(0,Math.abs(dh)-limit)*0.5;
      height[i]-=flow;height[j]+=flow;
    }
  }
}
