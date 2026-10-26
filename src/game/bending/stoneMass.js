// Stone's terrain mass, CPU side (docs/phase-9/plan.md D4). Ridge and Bloom write the terrain state
// through the GPU brush programs RIDGE and CRATER (shaders/terrainState.wgsl.js); the GPU copy
// reaches the CPU only as a readback, so each stamp is ALSO recorded here, as the same closed-form
// shape, and the ground query (world/patchGround.js `mass`) adds it to the collision height at once.
// The profile constants below are interpolated into the WGSL, so the two cannot drift apart.
//
//   offset(x, z) = max over shapes of displaced(x, z) − max over shapes of depression(x, z)
//
// exactly what the clipmap draws (displaced mass up, depression down; both channels combine by max
// within a brush program), decayed at the material's healing rate (healing.js DECAY; the GPU heals
// both channels at that rate × ts.healScale).
//
// Allocation-free: a ring of shapes in typed arrays, a per-frame decay factor each.

export const MASS_MAX = 256;

/** Ridge: a crest of half-width CREST (in footprint half-widths d, 0..1.9) and a shallow trench on
 *  both flanks that supplies the mass (the crest and trench cross-section areas are equal). */
export const CREST = 0.68;
export const RIDGE_END = 1.9;                 // the brush reaches 1.9 half-widths
const TWO_OVER_PI = 2 / Math.PI;
/** Trench depth ÷ crest height that conserves mass: crest area (16/15)·CREST, trench 2·(1.9−CREST)·2/π. */
export const TRENCH_RATIO = (CREST * 16 / 15) / (2 * (RIDGE_END - CREST) * TWO_OVER_PI);

/** Crater (Bloom): a pit of radius BOWL (a squared parabola, steepest at ~40 degrees for the depth used) and a rim bump over [RIM0, RIM1], in footprint radii. */
export const BOWL = 0.42, RIM0 = 0.32, RIM1 = 0.82;

export const crestAt = (d) => { if (d >= CREST) return 0; const u = d / CREST; const w = 1 - u * u; return w * w; };
export const trenchAt = (d) => (d <= CREST || d >= RIDGE_END ? 0 : Math.sin(Math.PI * (d - CREST) / (RIDGE_END - CREST)));
export const bowlAt = (d) => { if (d >= BOWL) return 0; const u = d / BOWL, w = 1 - u * u; return w * w; };
export const rimAt = (d) => (d <= RIM0 || d >= RIM1 ? 0 : Math.sin(Math.PI * (d - RIM0) / (RIM1 - RIM0)));

/** Rim height ÷ bowl depth that conserves mass (volumes of revolution, integrated numerically). */
export const RIM_RATIO = (() => {
  let vb = 0, vr = 0;
  const n = 4000, h = 2 / n;
  for (let i = 0; i < n; i++) { const d = (i + 0.5) * h; vb += bowlAt(d) * d * h; vr += rimAt(d) * d * h; }
  return vb / vr;
})();

const RIDGE = 0, CRATER = 1;

export function createStoneMass() {
  const k = {
    kind: new Uint8Array(MASS_MAX), on: new Uint8Array(MASS_MAX),
    cx: new Float64Array(MASS_MAX), cz: new Float64Array(MASS_MAX), dx: new Float64Array(MASS_MAX), dz: new Float64Array(MASS_MAX),
    hl: new Float64Array(MASS_MAX), hw: new Float64Array(MASS_MAX), H: new Float64Array(MASS_MAX),
    rate: new Float64Array(MASS_MAX), t0: new Float64Array(MASS_MAX), fac: new Float64Array(MASS_MAX),
    reach: new Float64Array(MASS_MAX), frozen: new Uint8Array(MASS_MAX),
  };
  let head = 0;
  const self = {
    /** Shapes alive, the last query's displaced and depression parts, and the clock/heal scale (set by the owner). */
    count: 0, disp: 0, depr: 0, time: 0, healScale: 1,
    /** Shape arrays for cover tests and the Frost combination (read only). */
    k,
    /** Record a ridge segment (capsule from (cx, cz) along (dx, dz), half length hl, footprint half-width hw, height H) → index. */
    addRidge(cx, cz, dx, dz, hl, hw, H, rate) { return put(RIDGE, cx, cz, dx, dz, hl, hw, H, rate); },
    /** Record a crater (centre, footprint radius hw, bowl depth H) → index. */
    addCrater(cx, cz, hw, H, rate) { return put(CRATER, cx, cz, 1, 0, 0, hw, H, rate); },
    /** A later, taller stamp over the same segment (the swell): height H from now on. */
    raise(i, H) { if (k.on[i]) k.H[i] = Math.max(k.H[i], H); },
    /** Frozen shapes do not heal on the CPU either (the Frost combination re-stamps them). */
    freeze(i) { k.frozen[i] = 1; },
    clear() { k.on.fill(0); self.count = 0; head = 0; },
    /** Once per frame: advance the decay factors and retire shapes that have healed away. */
    update(time) {
      self.time = time;
      let n = 0;
      for (let i = 0; i < MASS_MAX; i++) {
        if (!k.on[i]) continue;
        const f = k.frozen[i] ? 1 : Math.exp(-k.rate[i] * Math.max(0, time - k.t0[i]) * self.healScale);
        k.fac[i] = f;
        if (f * k.H[i] < 0.01) { k.on[i] = 0; continue; }
        n++;
      }
      self.count = n;
    },
    /** Signed ground offset (m) at (x, z): displaced mass up, depression down. Sets .disp and .depr. */
    heightAt(x, z) {
      if (self.count === 0) { self.disp = 0; self.depr = 0; return 0; }
      let disp = 0, depr = 0;
      for (let i = 0; i < MASS_MAX; i++) {
        if (!k.on[i]) continue;
        const rx = x - k.cx[i], rz = z - k.cz[i];
        const rr = k.reach[i];
        if (rx > rr || rx < -rr || rz > rr || rz < -rr) continue;
        const hw = k.hw[i], H = k.H[i] * k.fac[i];
        if (k.kind[i] === RIDGE) {
          const along = rx * k.dx[i] + rz * k.dz[i], a = along < -k.hl[i] ? -k.hl[i] : along > k.hl[i] ? k.hl[i] : along;
          const px = rx - k.dx[i] * a, pz = rz - k.dz[i] * a;
          const d = Math.sqrt(px * px + pz * pz) / hw;
          if (d >= RIDGE_END) continue;   // (a flank point within the segment's length has d = its lateral distance)
          const c = H * crestAt(d);
          if (c > disp) disp = c;
          // The trench is a flank (lateral distance, within the segment's length): see RIDGE in terrainState.wgsl.js.
          if ((along <= k.hl[i] + 0.02 && along >= -k.hl[i] - 0.02)) {
            const dp = Math.abs(rx * k.dz[i] - rz * k.dx[i]) / hw;
            const t = H * TRENCH_RATIO * trenchAt(dp);
            if (t > depr) depr = t;
          }
        } else {
          const d = Math.sqrt(rx * rx + rz * rz) / hw;
          if (d >= RIM1) continue;
          const b = H * bowlAt(d), r = H * RIM_RATIO * rimAt(d);
          if (r > disp) disp = r;
          if (b > depr) depr = b;
        }
      }
      self.disp = disp; self.depr = depr;
      return disp - depr;
    },
  };
  function put(kind, cx, cz, dx, dz, hl, hw, H, rate) {
    const i = head; head = (head + 1) % MASS_MAX;
    k.kind[i] = kind; k.on[i] = 1; k.cx[i] = cx; k.cz[i] = cz; k.dx[i] = dx; k.dz[i] = dz; k.hl[i] = hl; k.hw[i] = hw; k.H[i] = H;
    k.rate[i] = rate; k.t0[i] = self.time; k.fac[i] = 1; k.frozen[i] = 0;
    k.reach[i] = hl + hw * (kind === RIDGE ? RIDGE_END : RIM1);
    self.count++;
    return i;
  }
  return self;
}
