// Frost Steppe surface material (BRIEF §5.1 snow, §6.1): wind-packed snow, blue ice scoured
// out on windward slopes, frozen lakes, and rock cliffs with snow accumulated on upward faces.
//
// Snow lighting: wrapped diffuse plus a back-scatter subsurface term, so shadowed and grazing
// snow glows soft blue-white instead of going flat; a broad soft sheen; and view-dependent glints
// from a world-space cell hash (stable: they never crawl), gated hard on a narrow lobe and on
// grazing view, faded once a cell is smaller than a pixel. Kept deliberately subtle.
//
// Detail normals at three scales (grain, wind ripples, drift texture), stretched along the wind
// and faded by pixel footprint so distance never aliases. Rock uses triplanar detail and strata.
//
// Requires COMMON_WGSL (noised, hash12, PI) and ATMO_MATERIAL_WGSL (atmoSky) before it.

export const SNOW_WGSL = /* wgsl */ `
struct FrostSurf {
  albedo: vec3f,
  N: vec3f,          // shading normal (detail applied)
  snow: f32,         // 1 = snow, 0 = rock/ice
  ice: f32,          // blue ice / frozen lake
  rock: f32,
  rough: f32,
  ao: f32,           // ambient occlusion from deformation (trail floors, berm feet)
  Ng: vec3f,         // geometric normal (incl. deformation), for packing smoothing
};

// Height-gradient (d/dx, d/dz) of a noise layer laid out in the wind frame (u along, v across).
fn windLayerGrad(x: f32, z: f32, wind: vec2f, la: f32, lv: f32, amp: f32) -> vec2f {
  let u = x * wind.x + z * wind.y;
  let v = -x * wind.y + z * wind.x;
  let n = noised(vec2f(u / la, v / lv));
  let du = n.y * amp / la; let dv = n.z * amp / lv;
  return vec2f(du * wind.x - dv * wind.y, du * wind.y + dv * wind.x);
}

// Feature of wavelength lambda is kept while the pixel footprint fp is well below it.
fn fpFade(lambda: f32, fp: f32) -> f32 { return 1.0 - smoothstep(lambda * 0.06, lambda * 0.25, fp); }

fn perturb(N: vec3f, g: vec2f) -> vec3f { return normalize(vec3f(N.x - g.x * N.y, N.y, N.z - g.y * N.y)); }

// Triplanar detail gradient for rock (world-space normal perturbation).
fn rockDetail(wp: vec3f, N: vec3f, fp: f32) -> vec3f {
  var w = pow(abs(N), vec3f(4.0));
  w = w / (w.x + w.y + w.z);
  var d = vec3f(0.0);
  for (var k = 0; k < 2; k++) {
    let sc = select(0.45, 2.2, k == 1);
    let a = select(0.06, 0.35, k == 1) * fpFade(sc, fp);
    let nx = noised(wp.zy / sc + 3.1); // plane ⟂ x
    let ny = noised(wp.xz / sc + 7.7); // plane ⟂ y
    let nz = noised(wp.xy / sc + 1.3); // plane ⟂ z
    d += a / sc * (w.x * vec3f(0.0, nx.z, nx.y) + w.y * vec3f(ny.y, 0.0, ny.z) + w.z * vec3f(nz.y, nz.z, 0.0));
  }
  return normalize(N - d);
}

fn frostSurface(wp: vec3f, Ngeo: vec3f, Nc: vec3f, wind: vec2f, lake: f32, fp: f32) -> FrostSurf {
  var o: FrostSurf;
  // Snow detail normals: grain (isotropic), wind ripples, sastrugi, drift texture. The long
  // layers stay gentle and only mildly stretched (strong stretch read as brush strokes).
  var g = vec2f(0.0);
  g += windLayerGrad(wp.x, wp.z, wind, 0.05, 0.05, 0.003 * fpFade(0.05, fp));
  g += windLayerGrad(wp.x, wp.z, wind, 0.18, 0.75, 0.014 * fpFade(0.18, fp));
  g += windLayerGrad(wp.x, wp.z, wind, 2.6, 0.55, 0.05 * fpFade(0.55, fp)); // sastrugi beyond the geometry
  g += windLayerGrad(wp.x, wp.z, wind, 1.8, 3.2, 0.07 * fpFade(1.8, fp));
  g += windLayerGrad(wp.x, wp.z, wind, 8.0, 12.0, 0.16 * fpFade(8.0, fp));
  let Nsnow = perturb(Ngeo, g);
  // Landform masks use the large-scale normal Nc (no micro relief in it).
  let slope = 1.0 - Nc.y;

  // Rock where it is too steep to hold snow. The boundary follows the landform (slope), broken
  // by low-frequency variation; fine edge noise fades with distance so it never aliases into
  // blocks. Snow re-accumulates on the upward faces of the rock's own detail.
  let n1 = noised(wp.xz * 0.02).x; let n2 = noised(wp.xz * 0.11).x * fpFade(9.0, fp);
  let n3 = noised(wp.xz * 0.5).x * fpFade(2.0, fp);
  let rock = smoothstep(0.30, 0.50, slope + n1 * 0.07 + n2 * 0.04 + n3 * 0.02);
  var rockShown = 0.0;
  var Nrock = Ngeo;
  var rockAlb = vec3f(0.1);
  if (rock > 0.001) {
    Nrock = rockDetail(wp, Ngeo, fp);
    let accum = smoothstep(0.62, 0.86, Nrock.y + n2 * 0.08 + n3 * 0.06);
    rockShown = rock * (1.0 - accum);
    // Strata: irregular layers (two incommensurate periods, tilted and warped by landform-scale
    // noise), whose contrast itself comes and goes, so they read as geology, not as stripes.
    let tilt = wp.y + 0.12 * wp.x - 0.07 * wp.z + 9.0 * noised(wp.xz * 0.008).x;
    let s1 = noised(vec2f(tilt / 7.3, 0.37)).x;
    let s2 = noised(vec2f(tilt / 2.9, 5.1)).x * fpFade(6.0, fp);
    let strength = smoothstep(-0.2, 0.6, noised(wp.xz * 0.03 + vec2f(3.0, 1.0)).x);
    let band = (0.6 * s1 + 0.4 * s2) * strength * fpFade(14.0, fp);
    rockAlb = vec3f(0.095, 0.10, 0.11) * (1.0 + 0.22 * band) * (0.9 + 0.2 * n2);
  }

  // Blue ice: scoured out on steep windward slopes (the landform faces into the wind), in
  // patches; and on frozen tarns where the wind strips the snow off in places.
  let windward = -dot(Nc.xz, wind);                // ≈ sin(slope) when facing straight upwind
  let scour = smoothstep(0.22, 0.34, windward) * smoothstep(0.05, 0.45, noised(wp.xz / 25.0).x + 0.35 * noised(wp.xz / 5.0).x * fpFade(5.0, fp));
  let lakeIce = 0.75 * smoothstep(0.5, 0.9, lake) * smoothstep(0.3, 0.65, noised(wp.xz / 9.0).x + 0.3 * noised(wp.xz / 2.0).x * fpFade(2.0, fp));
  let ice = max(scour * (1.0 - rock), lakeIce);
  let lakeShare = lakeIce / max(ice, 1e-3);

  // Wind-packed snow varies slightly in brightness (packed slabs vs loose drift).
  let packed = 0.5 + 0.5 * noised(wp.xz / vec2f(9.0, 4.0)).x;
  let snowAlb = vec3f(0.86, 0.88, 0.92) * (0.93 + 0.07 * packed);
  // Scoured slope ice is glassy blue; lake ice is paler, dusted with snow.
  let iceAlb = mix(vec3f(0.36, 0.50, 0.58), vec3f(0.58, 0.68, 0.74), lakeShare);
  o.rock = rockShown;
  o.ice = ice * (1.0 - rockShown);
  o.snow = (1.0 - rockShown) * (1.0 - o.ice);
  o.albedo = snowAlb * o.snow + iceAlb * o.ice + rockAlb * rockShown;
  // Ice is smooth: only a long-wavelength undulation; rock uses its own detail.
  let Nice = perturb(Nc, windLayerGrad(wp.x, wp.z, wind, 9.0, 9.0, 0.05));
  o.N = normalize(Nsnow * o.snow + Nice * o.ice + Nrock * rockShown);
  o.rough = 0.6 * o.snow + 0.12 * o.ice + 0.8 * rockShown;
  o.ao = 1.0;
  o.Ng = Ngeo;
  return o;
}

// Terrain-state response (BRIEF §5.1): packed snow is darker, smoother and tighter in
// specular; trail floors are occluded (micro-occlusion along the walls); berms of displaced
// mass break into chunky clumps. st = (depression, displaced) in metres; c = compaction 0..1.
fn frostApplyState(o: ptr<function, FrostSurf>, wp: vec3f, st: vec2f, c: f32, fp: f32) {
  if (st.x + st.y + c < 1e-3) { return; }
  let snow = (*o).snow;
  let pack = clamp(c, 0.0, 1.0) * snow;
  (*o).albedo *= 1.0 - 0.10 * pack;
  (*o).rough = mix((*o).rough, 0.32, pack);
  (*o).N = normalize(mix((*o).N, (*o).Ng, pack * 0.7));       // packing irons out the grain
  // Occlusion: deeper floors see less sky; narrow walls darken most.
  (*o).ao = 1.0 - clamp(st.x * 3.0, 0.0, 0.4);
  // Berms: chunky granularity (clumps of a few centimetres) where mass was pushed up.
  let chunk = clamp(st.y * 25.0, 0.0, 1.0) * snow * fpFade(0.05, fp);
  if (chunk > 0.0) {
    let n1 = noised(wp.xz / 0.035 + 11.0); let n2 = noised(wp.xz / 0.09 + 5.0);
    let g = (n1.yz / 0.035 * 0.006 + n2.yz / 0.09 * 0.012) * chunk;
    (*o).N = normalize(vec3f((*o).N.x - g.x, (*o).N.y, (*o).N.z - g.y));
    (*o).ao *= 1.0 - 0.25 * chunk * clamp(0.5 - 0.5 * n1.x, 0.0, 1.0);
  }
}

fn ggxD(nh: f32, a: f32) -> f32 { let a2 = a * a; let d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }

// Lit colour of the frost surface (linear HDR, before aerial perspective).
// key: key-light illuminance colour (sun or moon); vis: shadow visibility; skyScale: the
// skylight art control. Ambient is the live-sky SH IBL, blue-shifted for the cold biome.
fn frostLight(s: FrostSurf, wp: vec3f, Ngeo: vec3f, V: vec3f, L: vec3f, key: vec3f, vis: f32,
              skyScale: f32, fp: f32) -> vec3f {
  let N = s.N;
  let nl = dot(N, L);
  let nv = max(dot(N, V), 1e-3);
  // Wrapped diffuse (snow scatters light past the terminator); rock and ice: plain Lambert.
  let wrap = 0.35 * s.snow;
  let diff = clamp((nl + wrap) / (1.0 + wrap), 0.0, 1.0);
  // Back-scatter subsurface: light entering lit snow nearby re-emerges blue-white in shadow and
  // at grazing angles. Scales with how much key light reaches this drift of ground at all.
  let sunUp = clamp(L.y * 4.0, 0.0, 1.0);
  let sssTint = vec3f(0.38, 0.62, 1.0);
  let sss = sssTint * (0.16 * (1.0 - vis * clamp(nl, 0.0, 1.0)) + 0.06 * pow(1.0 - nv, 2.0)) * sunUp * s.snow;
  // Ambient: live-sky IBL, strongly blue-shifted for the cold biome (BRIEF §5.3), luminance kept.
  let cold = vec3f(0.62, 0.86, 1.32) / 0.84;
  let sky = shIrradiance(N) * cold * skyScale * s.ao;
  var col = s.albedo * (key * (diff * vis / PI) + sky) + key * sss * (1.0 / PI) * s.albedo * s.ao;

  // Specular: soft sheen on snow, sharp sun/moon highlight and sky reflection on ice.
  let H = normalize(L + V);
  let nh = max(dot(N, H), 0.0);
  let a = max(s.rough * s.rough, 0.004);
  let F = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  let spec = ggxD(nh, a) * F * 0.25 / max(nv, 0.2);
  col += key * spec * clamp(nl, 0.0, 1.0) * vis * (0.35 * s.snow + 1.0 * s.ice + 0.15 * s.rock);
  let R = reflect(-V, N);
  let Fv = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  col += atmoSky(normalize(vec3f(R.x, max(R.y, 0.02), R.z))) * Fv * s.ice * 0.6;

  // Glints: one candidate facet per ~1.4 cm world cell (stable hash), a few percent of cells.
  // Each facet has a random tilt; it flashes only when it mirrors the light into the eye, and
  // only toward grazing views. Fades out once cells shrink below a pixel (averaged into sheen).
  let cell = 0.014;
  let gFade = 1.0 - smoothstep(cell * 0.6, cell * 1.6, fp);
  if (gFade > 0.0 && s.snow > 0.5 && nl > 0.0) {
    let c = floor(wp.xz / cell);
    let h0 = hash12(c + vec2f(19.1, 7.3));
    if (h0 < 0.05) {
      let t = vec2f(hash12(c + vec2f(3.7, 11.9)), hash12(c + vec2f(23.3, 5.1))) - 0.5;
      let Nf = normalize(N + vec3f(t.x, 0.0, t.y) * 0.5);
      // A round facet inside the cell (soft disc), so glints read as points, not jagged cells.
      let fc = (wp.xz / cell - c) - (vec2f(hash12(c + vec2f(7.1, 2.9)), hash12(c + vec2f(1.3, 9.7))) * 0.5 + 0.25);
      let disc = 1.0 - smoothstep(0.12, 0.3, length(fc));
      let lobe = smoothstep(0.9965, 0.9992, dot(Nf, H)) * disc;
      let grazing = smoothstep(0.75, 0.25, nv);
      col += key * lobe * grazing * gFade * vis * 1.6 * uniforms.artParams.x;
    }
  }
  return col;
}
`;
