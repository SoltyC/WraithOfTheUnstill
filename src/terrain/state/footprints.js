// Footprint writer (BRIEF §4.3 writers, Phase 2 stand-in until the Wraith's planted feet in
// Phase 3): alternating left/right prints along the direction of travel, each a short swept
// capsule pressed into the terrain state with a berm. Also stamps scripted trails for photo
// spots (the Phase 2 gate shots show trails with no character in frame).

const STRIDE = 0.36;     // m between prints (one foot to the other)
const SIDE = 0.10;       // m from the path centre line to each foot
const HALF_LEN = 0.115;  // m: print half length (heel to toe ≈ 0.34 m with the radius)
const HALF_W = 0.055;    // m: print half width
const DEPTH = 0.055;     // m: snow depth of a step
const PACK = 0.85;       // compaction of the print floor

function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

/**
 * @param {ReturnType<typeof import('./terrainState.js').createTerrainState>} ts
 * @param {{ v: number }} depthScale  live 'Deformation depth' art control
 */
export function createFootprints(ts, depthScale = { v: 1 }) {
  let side = 1, acc = 0, lastX = NaN, lastZ = NaN, n = 0;
  function print(x, z, dx, dz) {
    n++;
    const jitter = (hash(n) - 0.5) * 0.12;           // a few degrees of toe-out variation
    const c = Math.cos(jitter), s = Math.sin(jitter);
    const fx = dx * c - dz * s, fz = dx * s + dz * c;
    ts.bx = x - dz * SIDE * side; ts.bz = z + dx * SIDE * side;
    ts.bdx = fx; ts.bdz = fz; ts.bl = HALF_LEN; ts.bw = HALF_W;
    ts.bd = DEPTH * depthScale.v * (0.85 + 0.3 * hash(n + 0.5)); ts.bc = PACK;
    ts.stamp();
    side = -side;
  }
  return {
    /** Owner fields: player position and grounded flag, set before update(). */
    px: 0.5, pz: 0.5, grounded: false, enabled: true,
    update() {
      if (!this.enabled || !this.grounded) { lastX = NaN; return; }
      if (Number.isNaN(lastX)) { lastX = this.px; lastZ = this.pz; acc = 0; return; }
      const dx = this.px - lastX, dz = this.pz - lastZ;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1e-4) return;
      if (d > 3) { lastX = this.px; lastZ = this.pz; acc = 0; return; } // teleport, not a step
      acc += d;
      if (acc >= STRIDE) { acc -= STRIDE; print(this.px, this.pz, dx / d, dz / d); }
      lastX = this.px; lastZ = this.pz;
    },
    /** Owner fields for stampFoot(): a planted foot's centre and facing (from the gait). */
    ex: 0.5, ez: 0.5, edx: 0.5, edz: 0.5,
    /** Stamp one footprint exactly where a foot planted (the Wraith's footfall events). */
    stampFoot() {
      if (!this.enabled) return;
      n++;
      ts.bx = this.ex; ts.bz = this.ez; ts.bdx = this.edx; ts.bdz = this.edz; ts.bl = HALF_LEN; ts.bw = HALF_W;
      ts.bd = DEPTH * depthScale.v * (0.85 + 0.3 * hash(n + 0.5)); ts.bc = PACK;
      ts.stamp();
    },
    /** Stamp a walked trail along a polyline [[x, z], ...] (photo spots; allocation is fine). */
    stampTrail(points) {
      for (let k = 1; k < points.length; k++) {
        const [ax, az] = points[k - 1], [bx, bz] = points[k];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1e-3) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        for (let t = 0; t < len; t += STRIDE) {
          // A slight wander so the line is walked, not ruled.
          const w = Math.sin((k * 7.1 + t) * 0.9) * 0.04;
          print(ax + dx * t - dz * w, az + dz * t + dx * w, dx, dz);
        }
      }
    },
  };
}
