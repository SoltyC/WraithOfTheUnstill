// Sand of the erg (Phase 9 D1a; BRIEF §5: granular sheen, rare quartz glints, sharp ripple
// self-shadowing, wet-to-dry colour shift). Evaluated only where the dunes' weight is up, by the
// clipmap fragment after the meadow (it reuses mdPlanar and the material library).
//   albedo   CC0 scans (Poly Haven aerial_beach_01 rippled, dense_sand fine), retinted to a warm base,
//            two scales each so nothing repeats; ripple troughs gather darker heavy minerals
//   normals  three scales (broad swell, mid grain, fine grain) blended by pixel footprint and slope,
//            plus procedural decimetre ripples in the wind frame (ENE) that are horizon-mapped from
//            their own analytic height, so a low sun rakes them. Strongest on the stoss slope and in
//            the interdunes, gone on the slip face (avalanched sand is smooth)
//   sheen    a warm grazing back-scatter; quartz glints: world-space cells, a stable hash, gated hard
//   state    compacted: a shade darker, fine grain; frozen: pale, crisp; wet: darker, cooler, tighter
//   rain     individual drops dot the dry sand (dimple, rim), spread, merge, then the whole surface
//            goes dark with a glossy film while it still rains (world/sandRain.js is the curve)
//   light    a cool sky fill in the shadow side of the slip faces (blue shadows on warm sand)
import { SAND_RAIN_WGSL } from '../world/sandRain.js';

export const SAND_WGSL = /* wgsl */ `
${SAND_RAIN_WGSL}
struct SandSurf { albedo: vec3f, N: vec3f, rough: f32, ao: f32, wetK: f32, glint: f32, rshade: f32, cool: f32, ripK: f32 };

const SAND_WIND: vec2f = vec2f(0.8631, 0.5077);   // ENE (0.85, 0.5), normalised

// Analytic ripple height (m) in the wind frame: crests across the wind, a gentle stoss and a steeper lee,
// sinuous with defects (the phase is warped, the wavelength drifts).
fn sandRippleH(p: vec2f, amp: f32) -> f32 {
  let u = dot(p, SAND_WIND); let v = dot(p, vec2f(-SAND_WIND.y, SAND_WIND.x));
  let warp = 0.7 * noised(vec2f(v * 2.4, u * 0.55)).x + 0.25 * noised(vec2f(v * 7.0 + 5.0, u * 1.7)).x;
  let ph = u / 0.15 + warp * 1.6 + 0.9 * noised(p * 0.5 + 9.0).x;
  let f = fract(ph);
  let prof = select(1.0 - smoothstep(0.0, 1.0, (f - 0.72) / 0.28), smoothstep(0.0, 1.0, f / 0.72), f < 0.72);
  let a = amp * (0.7 + 0.3 * noised(p * 0.8 + 3.0).x) * mix(0.25, 1.0, smoothstep(-0.55, 0.25, noised(p * 0.21 + 61.0).x));
  return a * (prof - 0.5);
}

// A grid of raindrops: one drop per hashed cell with its own arrival threshold. Returns
// (wet disc 0..1, relief gradient x, y) — a dimple with a faint raised rim.
fn sandDrops(p: vec2f, rw: f32, cell: f32, seed: f32, thr0: f32, sc: f32, fp: f32) -> vec3f {
  let q = p / cell; let c = floor(q); let f = q - c;
  let r1 = hash12(c + seed); let r2 = hash12(c + seed + 13.1); let r3 = hash12(c + seed + 47.3); let r4 = hash12(c + seed + 71.9);
  let thr = thr0 + SR_THR_SPAN * r3;
  if (rw <= thr) { return vec3f(0.0); }
  let grow = smoothstep(thr + 0.02, thr + SR_GROW, rw);
  let r = min((SR_R0 + SR_RVAR * r4) * sc * (1.0 + SR_RGROW * grow), 0.3 * cell);
  let d2 = (f - (0.3 + 0.4 * vec2f(r1, r2))) * cell; let d = length(d2);
  var disc = 1.0 - smoothstep(r * 0.78, r, d);
  // Below the drop's size the pixel averages many drops: use the mean coverage instead of aliasing.
  let lod = smoothstep(0.5 * r, 1.4 * r, fp);
  disc = mix(disc, min(3.14159 * r * r / (cell * cell), 1.0), lod);
  let dep = 0.0007 * sc * (1.0 - lod); let rim = 0.0004 * sc * (1.0 - lod);
  var g = 0.0;
  if (d < r) { g = dep * 2.0 * d / (r * r); }
  let rr = (d - r) / (0.3 * r);
  g += -rim * 2.0 * rr / (0.3 * r) * exp(-rr * rr);
  return vec3f(disc, d2 / max(d, 1e-4) * g);
}

fn sandSurface(wp: vec3f, Ng: vec3f, Nc: vec3f, fp: f32, state: vec4f, L: vec3f) -> SandSurf {
  var o: SandSurf;
  let p = wp.xz;
  let wet0 = uniforms.wetParams.x; let pud = uniforms.wetParams.y;
  // The dune under the foot: the slip face (steep, leeward of the wind) is smooth; the stoss and the
  // flats are rippled. Nc is the smoothed terrain normal.
  let gw = dot(Nc.xz, SAND_WIND) / max(Nc.y, 0.2);          // > 0 faces downwind
  let slip = smoothstep(0.2, 0.55, gw);
  let stoss = smoothstep(0.02, 0.28, -gw);
  let flatK = smoothstep(0.93, 0.99, Nc.y);
  o.ripK = (1.0 - slip) * clamp(0.62 + 0.38 * max(stoss, flatK), 0.0, 1.0);
  o.cool = slip;
  // Compacted sand loses its ripples; frozen sand is firm.
  let comp = clamp(state.x, 0.0, 1.0); let frz = clamp(state.z, 0.0, 1.0);
  o.ripK *= 1.0 - 0.8 * comp;

  // Scans: broad swell, mid grain, fine grain — albedo and normals by footprint and slope.
  let tA = mdPlanar(MAT_SAND_RIPPLED, p, 0.05, Ng);
  let tA2 = mdPlanar(MAT_SAND_RIPPLED, p + vec2f(37.1, -11.7), 0.0177, Ng);
  let wB = (1.0 - smoothstep(0.03, 0.2, fp)) * (1.0 - 0.45 * slip);
  let wC = (1.0 - smoothstep(0.004, 0.025, fp)) * (1.0 - 0.6 * slip) * (1.0 + 0.8 * comp);
  var tB: MatS; var tC: MatS;
  tB.albedo = vec3f(1.0); tB.N = Ng; tB.h = 0.5; tB.ao = 1.0; tC = tB;
  if (wB > 0.01) { tB = mdPlanar(MAT_SAND_FINE, p + vec2f(5.3, 2.1), 0.55, Ng); }
  if (wC > 0.01) { tC = mdPlanar(MAT_SAND_FINE, p + vec2f(-8.7, 19.3), 5.0, Ng); }
  let swell = mix(tA.N, tA2.N, 0.5);
  var N = normalize(Ng + (swell - Ng) * 0.35 + (tB.N - Ng) * wB * 0.9 + (tC.N - Ng) * wC * 1.3);

  // Albedo: a warm dry base, the scans' own variation kept (retinted), large patches of gold and rust.
  let base = vec3f(0.53, 0.36, 0.185);
  let a1 = matRetint(tA, MAT_SAND_RIPPLED, base, 0.55);
  let a2 = matRetint(tA2, MAT_SAND_RIPPLED, base, 0.55);
  var alb = mix(a1, a2, 0.5);
  if (wB > 0.01) { alb *= mix(vec3f(1.0), matRetint(tB, MAT_SAND_FINE, vec3f(1.0), 0.6), wB * 0.7); }
  if (wC > 0.01) { alb *= mix(vec3f(1.0), matRetint(tC, MAT_SAND_FINE, vec3f(1.0), 0.5), wC * 0.6); }
  let nL = noised(p * 0.013 + 71.0).x; let nM = noised(p * 0.09 + 17.0).x;
  alb *= mix(vec3f(1.0), vec3f(1.1, 1.0, 0.8), smoothstep(-0.2, 0.7, nL) * 0.6);
  alb *= mix(vec3f(1.0), vec3f(0.9, 0.96, 1.06), smoothstep(0.3, 0.9, -nM) * 0.5);

  // Decimetre ripples (a sharp relief where the pixel can resolve them), self-shadowed against the sun.
  o.rshade = 1.0;
  let rippleFade = (1.0 - smoothstep(0.035, 0.11, fp)) * o.ripK;
  var rh = 0.0;
  if (rippleFade > 0.02) {
    let amp = 0.009 * rippleFade;
    rh = sandRippleH(p, amp);
    let e = 0.012;
    let gx = (sandRippleH(p + vec2f(e, 0.0), amp) - rh) / e;
    let gz = (sandRippleH(p + vec2f(0.0, e), amp) - rh) / e;
    N = normalize(vec3f(N.x - gx * N.y, N.y, N.z - gz * N.y));
    // Horizon from the analytic height: march toward the sun along the ripple's own profile.
    let ls = vec2f(L.x, L.z); let lh = length(ls);
    let tanE = L.y / max(lh, 1e-4);
    if (tanE < 0.75 && lh > 1e-3) {
      let dir = ls / lh; var occ = 0.0;
      for (var i = 1; i <= 5; i++) {
        let s = 0.022 * f32(i);
        let hh = sandRippleH(p + dir * s, amp);
        occ = max(occ, smoothstep(-0.0006, 0.0006, hh - rh - s * tanE));
      }
      o.rshade = 1.0 - occ * smoothstep(0.02, 0.2, rippleFade);
    }
    // Troughs gather darker heavy minerals; crests are a touch paler.
    alb *= 1.0 + 0.5 * rh / 0.009 * rippleFade * 0.35;
  }

  // State: compacted (darker, fine-grained), frozen (pale, crisp).
  alb *= 1.0 - 0.13 * comp;
  alb = mix(alb, vec3f(0.62, 0.64, 0.66) * (0.8 + 0.4 * dot(tC.albedo, vec3f(0.33))), frz * 0.6);
  o.rough = mix(0.88, 0.7, frz);
  o.ao = clamp(0.45 + 0.9 * tA.ao * tB.ao, 0.0, 1.0);

  // Wetness: the stamped wet state (footprints in a damp, the surf groove) and the rain. Rain first dots
  // the sand with single drops, the drops spread and merge, then the whole surface is dark and cool.
  let rainW = wet0;
  var wl = rainW;
  let dryK = smoothstep(0.0, 0.2, pud - rainW);
  if (dryK > 0.0) {
    let hold = 0.5 * (0.5 + 0.5 * noised(p * 0.35 + 3.0).x) + 0.5 * smoothstep(0.9, 0.99, Nc.y) - 0.35 * (rh / 0.009);
    wl = rainW + dryK * (clamp(hold, 0.0, 1.0) - 0.5) * SR_DRY_HOLD;
  }
  var wetMask = clamp(state.y, 0.0, 1.0);
  if (wl > 0.02 || pud > 0.04) {
    // Dimples outlast the dark: the slow puddle value keeps them faintly for a while.
    let rw = max(wl, 0.8 * pud);
    let d1 = sandDrops(p, rw, SR_CELL_C, 0.0, SR_THR_MIN, 1.0, fp);
    let d2 = sandDrops(p + 3.7, rw, SR_CELL_F, 41.0, SR_THR_MIN + SR_THR_FINE, 0.6, fp);
    let lodK = 1.0 - smoothstep(0.02, 0.07, fp);
    let sp = clamp((wl - SR_SPREAD0) / SR_SPREAD_SPAN, 0.0, 1.0);
    let nb = 0.5 + 0.5 * (0.6 * noised(p * 6.5 + 23.0).x + 0.4 * noised(p * 19.0).x);
    let blotch = smoothstep(0.35, 0.65, nb + (sp - 0.5) * 1.4) * smoothstep(0.0, 0.1, sp);
    let uni = smoothstep(SR_UNI0, SR_UNI1, wl);
    // Wet discs only while the rain-wetness itself still stands (rw includes the slow puddle for relief).
    let live = smoothstep(0.02, 0.08, wl);
    var dots = max(d1.x, d2.x * 0.9) * live;
    wetMask = max(wetMask, max(max(dots, blotch), uni));
    // The relief stays faintly after the dark has gone (rw), and is kept in wet sand.
    let relief = mix(1.0, 0.35, uni) * lodK;
    let g = (d1.yz + d2.yz) * relief;
    N = normalize(vec3f(N.x - g.x * N.y, N.y, N.z - g.y * N.y));
  }
  let wetRain = wetMask * smoothstep(0.0, 0.3, uniforms.wetParams.z + 0.15);
  // Wet: darker, cooler, tighter (the grain and ripples flatten), a glossy film while it still rains.
  alb *= mix(vec3f(1.0), vec3f(SR_WET_DARK * 0.96, SR_WET_DARK * 0.98, SR_WET_DARK * 1.06), wetMask);
  N = normalize(mix(N, Ng, wetMask * 0.35));
  o.rough = mix(o.rough, 0.38, wetMask);
  o.wetK = clamp(wetMask * (0.18 + 0.82 * uniforms.wetParams.z * 1.6) + 0.0 * wetRain, 0.0, 1.0);
  o.rshade = mix(o.rshade, 1.0, wetMask * 0.7);

  // Quartz glints: world-space cells of 4 mm (a stable hash — no crawl under TAA); one cell in ~600 holds a
  // facet; resolved only when the pixel is near the grain size. A rare warm point, never glitter.
  let gc = floor(wp.xz * 250.0 + floor(wp.y * 250.0));
  let gh = hash12(gc + 5.0);
  o.glint = select(0.0, 0.2 + 0.8 * hash12(gc + 91.0), gh > 0.9985) * (1.0 - smoothstep(0.012, 0.03, fp)) * (1.0 - wetMask * 0.8);
  o.albedo = alb;
  o.N = N;
  return o;
}

// Lit sand (linear HDR): Lambert on the ripple-shaded key, the live-sky SH, a cool fill in shadows (the
// sky's blue where the sun cannot reach: slip faces and ripple lees), a warm grazing sheen, glints.
fn sandLight(s: SandSurf, wp: vec3f, V: vec3f, L: vec3f, key: vec3f, vis: f32, skyScale: f32, skyUp: vec3f) -> vec3f {
  let nl = dot(s.N, L);
  let diff = clamp((nl + 0.12) / 1.12, 0.0, 1.0);
  let lit = key * diff * vis * s.rshade / PI;
  let sky = shIrradiance(s.N) * skyScale * s.ao;
  // Where the key does not reach (night side of a slip face): the sky's own blue fills it.
  let shade = 1.0 - clamp(vis * s.rshade * smoothstep(0.0, 0.35, nl), 0.0, 1.0);
  let cool = skyUp * vec3f(0.8, 0.95, 1.25) * shade * (0.7 + 0.4 * s.cool) * s.ao * (0.5 + 0.5 * s.N.y);
  var col = s.albedo * (lit + sky + cool);
  let NV = max(dot(s.N, V), 0.0);
  // Granular sheen: the grain back-scatters warm light at grazing angles.
  col += s.albedo * vec3f(1.0, 0.8, 0.5) * key * pow(1.0 - NV, 4.0) * 0.1 * clamp(nl + 0.3, 0.0, 1.0) * vis * s.rshade * (1.0 - 0.7 * s.wetK) / PI;
  let H = normalize(L + V);
  let nh = max(dot(s.N, H), 0.0);
  col += key * vec3f(1.0, 0.78, 0.5) * pow(nh, 900.0) * s.glint * 6.0 * vis * s.rshade * clamp(nl * 4.0, 0.0, 1.0);
  let F = 0.04 + 0.96 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  col += key * pow(nh, mix(10.0, 260.0, (1.0 - s.rough) * (1.0 - s.rough))) * F * (0.05 + 1.5 * s.wetK) * clamp(nl, 0.0, 1.0) * vis;
  return col;
}
`;
