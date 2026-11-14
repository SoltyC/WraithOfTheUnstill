// Highland meadow ground (PLAN.md Phase 8 M2; art bar: screenshots/reference/forest-ruins-target
// .webp). The scanned layers (src/materials) under procedural ones, chosen by the land:
//   turf          short green ground cover — the meadow's base, under the grass
//   grass-ground  dry grass, roots and dirt — on convex rises, wind-worn and thin
//   soil          bare compact earth — steeper banks, hollows that hold water, worn ground
//   rock-mossy    striated stone with moss and lichen — where it is too steep for soil
//   forest floor, forest litter, moss — under the crowns (the canopy map)
// Each layer is sampled top-down (planar) at a near scale and, far off, a second coarser scale
// (no visible repeat at any distance), blended by the layers' own height maps so stones and turf
// interlock instead of cross-fading. Large-scale variation (patches of greener and yellower turf,
// darker damp swales) breaks the field up the way real hillsides read from a distance. Uses
// matDpx/matDpy from the top of the clipmap fragment (the meadow branch is non-uniform).
// The wet and flattened terrain state darkens and flattens the ground (footprints, the surf's
// groove).


/** The meadow's colour field, shared by the turf (MEADOW_WGSL) and the grass blades (shaders/grass.wgsl.js)
 *  so the field reads as one sward where the blades thin out over the ground: a saturated spring green
 *  (the meadow reference, screenshots/reference/meadow-target.jpg) in broad swathes of lighter,
 *  yellower grass and deeper green. Self-contained value noise: the same on both. */
export const MEADOW_TINT_WGSL = /* wgsl */ `
fn mtHash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn mtNoise(p: vec2f) -> f32 {
  let i = floor(p); let f = p - i; let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mtHash(i), mtHash(i + vec2f(1.0, 0.0)), u.x), mix(mtHash(i + vec2f(0.0, 1.0)), mtHash(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn meadowTint(p: vec2f) -> vec3f {
  let n = mtNoise(p * 0.011 + 3.7) * 0.6 + mtNoise(p * 0.047 + 11.3) * 0.3 + mtNoise(p * 0.19) * 0.1;
  // (realism plan A3: stronger — a real sward runs from deep blue-green in its lush hollows to warm,
  // drier drifts; the even lime read as a game's)
  var t = mix(vec3f(1.0), vec3f(1.22, 1.12, 0.68), smoothstep(0.52, 0.85, n));
  t *= mix(vec3f(1.0), vec3f(0.66, 0.8, 0.84), smoothstep(0.48, 0.14, n));
  return t;
}
`;

export const MEADOW_WGSL = /* wgsl */ `
${MEADOW_TINT_WGSL}
struct MeadowSurf { albedo: vec3f, N: vec3f, rough: f32, ao: f32, rock: f32, wetK: f32 };

// Top-down sample of one layer (planar xz), normal into world space (x → +x, y → +z).
fn mdPlanar(layer: i32, p: vec2f, k: f32, N: vec3f) -> MatS {
  let uv = p * k;
  let dx = vec2f(matDpx.x, matDpx.z) * k; let dy = vec2f(matDpy.x, matDpy.z) * k;
  var s: MatS;
  let a = textureSampleGrad(matAlb, matAlbSampler, uv, layer, dx, dy);
  let n = textureSampleGrad(matNrm, matNrmSampler, uv, layer, dx, dy);
  let hg = textureSampleGrad(matHgt, matHgtSampler, uv, layer, dx, dy);
  s.albedo = a.rgb; s.rough = n.z; s.ao = hg.y; s.h = hg.x;
  let t = matTs(n);
  // Tangent frame from the surface normal and world x (a terrain is never vertical here).
  let T = normalize(vec3f(1.0, 0.0, 0.0) - N * N.x);
  let B = cross(T, N);
  s.N = normalize(T * t.x - B * t.y + N * t.z);
  return s;
}
// Near + far samples of a layer, faded by the pixel's footprint (the far one breaks the repeat).
fn mdLayer(layer: i32, p: vec2f, kNear: f32, N: vec3f, fp: f32, base: vec3f, keepHue: f32) -> MatS {
  let w = smoothstep(0.012, 0.06, fp / kNear * 0.5);
  // Only the scale(s) that show are sampled (explicit gradients: branching is safe).
  if (w < 0.002) {
    var s = mdPlanar(layer, p, kNear, N);
    s.albedo = matRetint(s, layer, base, keepHue);
    return s;
  }
  let far = mdPlanar(layer, p + vec2f(17.3, -9.1), kNear * 0.19, N);
  if (w > 0.998) {
    var s = far;
    s.albedo = matRetint(far, layer, base, keepHue);
    return s;
  }
  let near = mdPlanar(layer, p, kNear, N);
  var s: MatS;
  s.albedo = mix(matRetint(near, layer, base, keepHue), matRetint(far, layer, base, keepHue), w);
  s.N = normalize(mix(near.N, far.N, w));
  s.rough = mix(near.rough, far.rough, w); s.ao = mix(near.ao, far.ao, w); s.h = mix(near.h, far.h, w);
  return s;
}

fn meadowSurface(wp: vec3f, Ng: vec3f, Nc: vec3f, fp: f32, state: vec4f, canopy: f32, vil: vec4f) -> MeadowSurf {
  var o: MeadowSurf;
  let slope = 1.0 - Nc.y;
  let p = wp.xz;
  // Landform masks: rises (wind-worn, thin grass), hollows (damp, dark soil), steepness (rock).
  let n1 = noised(p * 0.011).x; let n2 = noised(p * 0.043 + 7.0).x; let n3 = noised(p * 0.17 + 3.0).x;
  let rise = smoothstep(0.1, 0.6, n1 * 0.6 + n2 * 0.4);
  let damp = smoothstep(0.25, 0.7, -n1 * 0.7 - n2 * 0.3);
  // Under a full canopy the forest floor covers the turf entirely: the meadow layers are skipped.
  let wF0 = smoothstep(0.18, 0.62, canopy + 0.12 * n3 + 0.08 * n2);
  let k = 6.0;
  var th = 0.5;
  if (wF0 < 0.995) {
    // Layers (art-directed bases; each scan keeps its own detail).
    // Height-blended weights: the layer whose texel stands higher wins near the boundary. A layer
    // whose landform mask is ~0 here is not sampled at all (turf wins outright there).
    var wT = 1.0;
    var wD = rise * 0.4 + 0.12 * smoothstep(0.3, 0.8, n3);   // thin wind-worn grass on the rises (was 0.8: the meadow read yellow)
    var wS = max(damp * 0.7, smoothstep(0.32, 0.5, slope)) + state.y * 0.8; // wet state: bared, muddy
    let turf = mdLayer(MAT_TURF, p, 0.42, Ng, fp, vec3f(0.085, 0.15, 0.035) * meadowTint(p), 0.35);
    var dry = turf; var soil = turf;
    if (wD > 0.04) { dry = mdLayer(MAT_GRASS_GROUND, p + vec2f(31.0, 5.0), 0.38, Ng, fp, vec3f(0.19, 0.2, 0.085), 0.6); } else { wD = 0.0; }
    if (wS > 0.04) { soil = mdLayer(MAT_SOIL, p + vec2f(-13.0, 41.0), 0.33, Ng, fp, vec3f(0.12, 0.09, 0.06), 0.6); } else { wS = 0.0; }
    wT *= 0.6 + turf.h; wD *= 0.6 + dry.h; wS *= 0.6 + soil.h;
    wT = pow(wT, k); wD = pow(wD, k); wS = pow(wS, k);
    let ws = max(wT + wD + wS, 1e-5);
    wT /= ws; wD /= ws; wS /= ws;
    o.albedo = turf.albedo * wT + dry.albedo * wD + soil.albedo * wS;
    o.N = normalize(turf.N * wT + dry.N * wD + soil.N * wS);
    o.rough = 0.85;
    o.ao = turf.ao * wT + dry.ao * wD + soil.ao * wS;

    th = turf.h * wT + dry.h * wD + soil.h * wS;
  }
  // Forest floor under the crowns (canopyAt): the turf gives way to a floor of old leaves, needles
  // and twigs, moss on the damp and shaded ground and around the roots, the edges ragged (the
  // layers' heights decide where the litter ends and the turf begins).
  if (wF0 > 0.001) {
    let ff = mdLayer(MAT_FOREST_FLOOR, p + vec2f(7.0, -23.0), 0.36, Ng, fp, vec3f(0.11, 0.085, 0.06), 0.7);
    let lt = mdLayer(MAT_FOREST_LITTER, p + vec2f(-29.0, 11.0), 0.45, Ng, fp, vec3f(0.15, 0.1, 0.06), 0.75);
    let ms = mdLayer(MAT_MOSS, p + vec2f(3.0, 37.0), 0.5, Ng, fp, vec3f(0.07, 0.1, 0.035), 0.6);
    let n4 = noised(p * 0.09 + 13.0).x;
    var wf = 1.0 * (0.6 + ff.h);
    var wl = smoothstep(-0.2, 0.5, n4) * (0.6 + lt.h);
    var wm = (damp * 0.8 + smoothstep(0.55, 1.0, canopy) * 0.5 + smoothstep(0.2, 0.7, -n4) * 0.4) * (0.6 + ms.h);
    wf = pow(wf, k); wl = pow(wl, k); wm = pow(wm, k);
    let wsF = max(wf + wl + wm, 1e-5);
    wf /= wsF; wl /= wsF; wm /= wsF;
    let fa = ff.albedo * wf + lt.albedo * wl + ms.albedo * wm;
    let fN = normalize(ff.N * wf + lt.N * wl + ms.N * wm);
    let fao = ff.ao * wf + lt.ao * wl + ms.ao * wm;
    // Height-blend the floor against the turf at its edge too.
    let fh = ff.h * wf + lt.h * wl + ms.h * wm;
    let wF = clamp(wF0 + (fh - th) * 0.6 * wF0 * (1.0 - wF0) * 4.0, 0.0, 1.0);
    if (wF0 >= 0.995) { o.albedo = fa; o.N = fN; o.ao = fao; o.rough = 0.85; }
    else { o.albedo = mix(o.albedo, fa, wF); o.N = normalize(mix(o.N, fN, wF)); o.ao = mix(o.ao, fao, wF); }
  }
  // Rock: steep faces (biplanar there: cliffs are not top-down).
  o.rock = smoothstep(0.55, 0.7, slope + 0.08 * n3);
  if (o.rock > 0.001) {
    let rk = 0.22;
    let r = matBiplanarG(MAT_ROCK_MOSSY, wp * rk, Ng, 1.0, matDpx * rk, matDpy * rk);
    let ra = matRetint(r, MAT_ROCK_MOSSY, vec3f(0.16, 0.16, 0.14), 0.75);
    // Moss settles on the upward lips of the rock.
    let mossy = smoothstep(0.35, 0.8, r.N.y + 0.2 * n3);
    let rc = mix(ra, vec3f(0.07, 0.1, 0.035), mossy * 0.6);
    o.albedo = mix(o.albedo, rc, o.rock);
    o.N = normalize(mix(o.N, r.N, o.rock));
    o.ao = mix(o.ao, r.ao, o.rock);
  }
  // Large-scale life: greener and yellower swathes, darker damp ground.
  let hueN = noised(p * 0.006 + 31.0).x;
  o.albedo *= mix(vec3f(1.0), vec3f(1.04, 1.02, 0.9), smoothstep(0.1, 0.7, hueN));
  o.albedo *= mix(vec3f(1.0), vec3f(0.8, 0.88, 0.85), damp * 0.6);
  // The village's ground (villageAt: r paved, g earth, b yard, a cobble variant): the scanned cobbles,
  // flags and earth over the turf, height-blended so stones stand proud of the soil at their worn edge
  // (an earth ring baked round them) instead of fading. The terrain state below still sits on top.
  if (vil.x + vil.y + vil.z > 0.01) {
    let wetN = noised(p * 0.23 + 51.0).x;
    let rP = vil.x;
    let rE = vil.y * (1.0 - rP);
    let yd = vil.z * (1.0 - rP);
    var base = o.albedo; var baseN = o.N; var baseAo = o.ao; var baseH = th; var baseR = o.rough;
    // Earth: the packed street and the worn yards (a yard is only part-way to bare earth).
    let eW = max(rE, yd * 0.55);
    var ea = base; var eh = th;
    if (eW > 0.01 || (rP > 0.01 && rP < 0.98)) {
      let e = mdLayer(MAT_EARTH, p + vec2f(5.0, 19.0), 0.5, Ng, fp, vec3f(0.17, 0.125, 0.082), 0.6);
      ea = e.albedo; eh = e.h;
      let aE = clamp(eW + (e.h - th) * 1.1 * eW * (1.0 - eW) * 4.0, 0.0, 1.0);
      base = mix(base, e.albedo, aE); baseN = normalize(mix(baseN, e.N, aE)); baseAo = mix(baseAo, e.ao, aE);
      baseH = mix(th, e.h, aE); baseR = mix(baseR, e.rough, aE);
      // Ruts and a damp sheen along the middle of the packed earth, darker where the road is most worn.
      let inner = smoothstep(0.7, 1.0, rE);
      base *= 1.0 - inner * (0.1 + 0.12 * smoothstep(0.1, 0.8, wetN));
      baseR = mix(baseR, 0.5, inner * smoothstep(0.35, 0.9, wetN) * 0.5);
    }
    if (rP > 0.01) {
      // Cobble variant ramp t: 0 mossy, 1 setts, 2 river cobbles, 3 flagstone; two neighbours blended by height.
      let t = clamp(vil.w * 3.0, 0.0, 2.999);
      let lo = i32(floor(t)); let ft = t - f32(lo);
      let kSet = 0.83; let kFlag = 0.5; // tile 1.2 m for cobbles, 2 m for flags
      var a0: MatS; var a1: MatS;
      let l0 = select(select(MAT_COBBLE_MOSSY, MAT_COBBLE_SETTS, lo == 1), MAT_COBBLE_RIVER, lo == 2);
      let l1 = select(select(MAT_COBBLE_SETTS, MAT_COBBLE_RIVER, lo == 1), MAT_FLAGSTONE, lo == 2);
      let k0 = select(kSet, kFlag, lo == 3); let k1 = select(kSet, kFlag, lo >= 2);
      let tint0 = select(vec3f(0.27, 0.27, 0.24), vec3f(0.29, 0.27, 0.23), lo == 1); // lifted a third: unlit streets read at night
      let tint1 = select(select(vec3f(0.29, 0.27, 0.23), vec3f(0.27, 0.26, 0.22), lo == 1), vec3f(0.38, 0.36, 0.31), lo == 2);
      var w0 = 1.0 - ft; var w1 = ft;
      if (w1 > 0.02) { a1 = mdLayer(l1, p + vec2f(11.0, 3.0), k1, Ng, fp, tint1, 0.75); } else { w1 = 0.0; }
      if (w0 > 0.02) { a0 = mdLayer(l0, p + vec2f(11.0, 3.0), k0, Ng, fp, tint0, 0.75); } else { w0 = 0.0; }
      if (w1 > 0.0) { w1 = pow(w1 * (0.6 + a1.h), 6.0); }
      if (w0 > 0.0) { w0 = pow(w0 * (0.6 + a0.h), 6.0); }
      let wn = max(w0 + w1, 1e-5); w0 /= wn; w1 /= wn;
      var c: MatS;
      c.albedo = a0.albedo * w0 + a1.albedo * w1; c.N = normalize(a0.N * w0 + a1.N * w1 + vec3f(0.0, 1e-3, 0.0));
      c.ao = a0.ao * w0 + a1.ao * w1; c.h = a0.h * w0 + a1.h * w1; c.rough = a0.rough * w0 + a1.rough * w1;
      if (w0 <= 0.0) { c.albedo = a1.albedo; c.N = a1.N; c.ao = a1.ao; c.h = a1.h; c.rough = a1.rough; }
      if (w1 <= 0.0) { c.albedo = a0.albedo; c.N = a0.N; c.ao = a0.ao; c.h = a0.h; c.rough = a0.rough; }
      // Wear: soil dust in the low joints and moss in the damp near the border; a faint grime overall.
      let edge = 1.0 - smoothstep(0.55, 1.0, rP);
      c.albedo = mix(c.albedo, ea, edge * (1.0 - smoothstep(0.25, 0.6, c.h)) * 0.75);
      c.albedo *= 0.9 + 0.2 * noised(p * 0.6 + 2.0).x;
      c.rough = mix(c.rough, 0.5, smoothstep(0.4, 0.8, wetN) * 0.25 * (1.0 - c.h));
      // Stones over soil at the edge: the cobble's height against what lies beneath it.
      let aP = clamp(rP + (c.h - baseH) * 1.3 * rP * (1.0 - rP) * 4.0, 0.0, 1.0);
      base = mix(base, c.albedo, aP); baseN = normalize(mix(baseN, c.N, aP)); baseAo = mix(baseAo, c.ao, aP); baseR = mix(baseR, c.rough, aP);
    }
    o.albedo = base; o.N = baseN; o.ao = baseAo; o.rough = baseR;
  }
  // Terrain state: trampled/flattened ground is darker and smoother; wet ground glossier.
  o.albedo *= 1.0 - 0.18 * state.x - 0.25 * state.y;
  o.rough = mix(o.rough, 0.45, state.y * 0.6);
  // Rain (wetParams: x wetness, y puddle fill): the ground darkens and turns glossy; where it lies flat
  // in a hollow (low noise) water stands — dark, mirror-smooth, level. The wet state (footprints) joins.
  let wet = clamp(max(uniforms.wetParams.x, state.y), 0.0, 1.0);
  if (wet > 0.002) {
    let hol = 0.5 + 0.5 * (0.6 * noised(p * 0.11 + 17.0).x + 0.3 * noised(p * 0.43 + 3.0).x + 0.1 * noised(p * 1.7).x);
    let lvl = smoothstep(0.975, 0.995, Ng.y);
    let pud = smoothstep(1.0 - uniforms.wetParams.y * 0.62, 1.0 - uniforms.wetParams.y * 0.62 + 0.1, 1.0 - hol) * lvl * uniforms.wetParams.y;
    // Wet earth and stone go much darker than wet grass; cobbles keep their colour but deepen.
    o.albedo *= mix(1.0, 0.68, wet);
    o.albedo = mix(o.albedo, o.albedo * vec3f(0.55, 0.6, 0.62), pud);
    o.rough = mix(o.rough, 0.3, wet * 0.8);
    o.rough = mix(o.rough, 0.035, pud);
    o.N = normalize(mix(o.N, vec3f(0.0, 1.0, 0.0), pud * 0.92));
    o.wetK = clamp(pud + wet * 0.3, 0.0, 1.0);
  }
  return o;
}

// Wave-sorted pebbles (the lake margin): warped Voronoi cells of ~8.5 cm, each holding one
// rounded, slightly elongated stone of its own size, tone and lie (limestone pale and buff, grey and
// dark grits), silt in the gaps. Out: albedo, cover; the stones' domes tilt *N. Past ~5 cm a pixel
// the average.
fn mdPebbles(p: vec2f, fp: f32, N: ptr<function, vec3f>) -> vec4f {
  let avg = vec3f(0.2, 0.185, 0.16);
  let k = 1.0 - smoothstep(0.02, 0.07, fp);
  if (k <= 0.0) { return vec4f(avg, 0.5); }
  let C = 0.11;
  let q = p / C + 0.4 * vec2f(noised(p * 2.3).x, noised(p * 2.3 + 7.0).x);
  let qi = floor(q);
  var d1 = 9.0; var h1 = vec3f(0.0); var o1 = vec2f(0.0);
  for (var j = -1; j <= 1; j++) { for (var i = -1; i <= 1; i++) {
    let c = qi + vec2f(f32(i), f32(j));
    let h = fract(sin(vec3f(dot(c, vec2f(127.1, 311.7)), dot(c, vec2f(269.5, 183.3)), dot(c, vec2f(419.2, 371.9)))) * 43758.5453);
    let o = q - c - (0.2 + 0.6 * h.xy);
    let d = dot(o, o);
    if (d < d1) { d1 = d; h1 = h; o1 = o; }
  } }
  let a = h1.x * 6.2831853; let ca = cos(a); let sa = sin(a);
  let ro = vec2f(o1.x * ca - o1.y * sa, o1.x * sa + o1.y * ca);
  let r = 0.2 + 0.36 * h1.z * h1.z + 0.06 * h1.x;
  let e = length(vec2f(ro.x * 0.72, ro.y)) / r;
  let cover = smoothstep(1.0, 0.86, e) * step(0.12, fract(h1.y * 7.31));
  let t = h1.y;
  var tone = mix(vec3f(0.36, 0.34, 0.3), vec3f(0.3, 0.25, 0.18), smoothstep(0.3, 0.5, t));
  tone = mix(tone, vec3f(0.19, 0.19, 0.185), smoothstep(0.6, 0.7, t));
  tone = mix(tone, vec3f(0.085, 0.08, 0.075), smoothstep(0.88, 0.95, t));
  tone *= 0.85 + 0.3 * (noised(p * 60.0 + h1.xy * 9.0).x * 0.5 + 0.5);
  // A low dome: steepest a little in from the rim, flat on top (the rim itself fades with cover).
  let sl = o1 / (r * C * 9.0) * 0.55 * smoothstep(1.0, 0.75, e) * k * select(0.0, 1.0, cover > 0.0);
  *N = normalize(*N + vec3f(sl.x, 0.0, sl.y));
  return vec4f(mix(avg, tone, k), mix(0.5, cover, k));
}

// The water's edge and the bed beneath it (realism plan W1/W4). e: how far under the water's level
// the ground lies (m; negative above it). Above the line the bank is wet (capillary rise, splash),
// darker and a little glossy to ~0.5 m; the lapping keeps a strip of washed pebbles and mud bare
// right at the line; under the water the turf gives way to the bed: wave-sorted pebbles in the
// margin, soft olive silt beyond (a stone here and there), dark weed beds in patches from ~0.5 m
// down. Everything wet is darker (water fills the pores: a wet stone loses ~40 % of its albedo).
fn meadowWaterEdge(s: MeadowSurf, wp: vec3f, e: f32, Ng: vec3f, fp: f32) -> MeadowSurf {
  var o = s;
  if (e < -0.75) { return o; }
  let p = wp.xz;
  let n1 = noised(p * 0.7 + 5.0).x; let n2 = noised(p * 0.21 + 11.0).x;
  let bare = smoothstep(-0.2 + 0.08 * n1, 0.03, e);
  let wet = smoothstep(-0.6 + 0.15 * n1, -0.04, e);
  if (bare > 0.001) {
    let si = mdLayer(MAT_SOIL, p + vec2f(-23.0, 9.0), 0.5, Ng, fp, vec3f(0.12, 0.105, 0.075), 0.4);
    var ba = si.albedo; var bN = si.N; var bao = si.ao;
    // Weed beds (and an algal film on the silt) from half a metre down, in patches.
    let wW = smoothstep(0.45, 1.1, e) * smoothstep(0.05, 0.45, noised(p * 0.09 + 3.0).x + 0.25 * n1) * (1.0 - smoothstep(4.0, 7.0, e));
    if (wW > 0.01) {
      let wd = mdLayer(MAT_MOSS, p + vec2f(19.0, 31.0), 0.8, Ng, fp, vec3f(0.04, 0.06, 0.022), 0.5);
      let k = clamp(wW * (0.7 + wd.h - si.h) * 1.4, 0.0, 1.0);
      ba = mix(ba, wd.albedo, k); bN = normalize(mix(bN, wd.N, k)); bao = mix(bao, wd.ao, k);
    }
    ba = mix(ba, ba * vec3f(0.85, 0.95, 0.7), smoothstep(0.2, 1.0, e) * 0.6);   // the green-brown film
    // Pebbles: thick in the wave-washed margin, in drifts along it, sparse out on the silt.
    let n3 = noised(p * 0.9 + 21.0).x;
  let zone = (1.0 - smoothstep(0.15, 0.55, e + 0.25 * n2)) * smoothstep(-0.35, 0.35, n2 + 0.45 * n3);
    let dens = max(zone, 0.12 * (1.0 - smoothstep(1.0, 2.5, e)));
    var pN = bN;
    let pb = mdPebbles(p, fp, &pN);
    let pk = clamp(pb.a * smoothstep(0.0, 0.35, dens - 0.35 * (1.0 - pb.a) + 0.15 * n1), 0.0, 1.0);
    ba = mix(ba, pb.rgb * mix(vec3f(1.0), vec3f(0.85, 0.92, 0.72), smoothstep(0.3, 1.2, e) * 0.7), pk);
    bN = normalize(mix(bN, pN, pk)); bao = mix(bao, 1.0, pk * 0.5);
    o.albedo = mix(o.albedo, ba, bare);
    o.N = normalize(mix(o.N, bN, bare));
    o.ao = mix(o.ao, bao, bare);
    o.rough = mix(o.rough, 0.8, bare);
    o.rock = mix(o.rock, 1.0, bare);       // no grass sheen on the bed
  }
  o.albedo *= mix(1.0, 0.6, wet);
  // Gloss on the wet bank only (under the water the surface does the reflecting).
  o.wetK = max(o.wetK, wet * 0.32 * (1.0 - smoothstep(-0.02, 0.02, e)));
  return o;
}

// Lit colour of the meadow ground (linear HDR): Lambert with the key light, the live-sky SH
// (warmer than the frost's, the green bounce of the field under it), a soft sheen at grazing.
fn meadowLight(s: MeadowSurf, N: vec3f, V: vec3f, L: vec3f, key: vec3f, vis: f32, skyScale: f32, canopy: f32) -> vec3f {
  let nl = dot(N, L);
  let diff = clamp(nl, 0.0, 1.0);
  let sky = shIrradiance(N) * skyScale * s.ao * vec3f(0.98, 1.0, 0.96) * canopySky(canopy);
  // The shared BRDF (shaders/brdf.wgsl.js, realism plan R1): wet ground goes glossy; the sky's
  // reflection loses what the crowns hide.
  // Turf is grass seen from afar: rough, and its highlight masked like the blades' (aggregateMask);
  // bare rock and soil keep the scan's roughness and the full lobe.
  let turf = (1.0 - s.rock) * (1.0 - s.wetK);
  let rough = mix(mix(s.rough, max(s.rough, 0.75), turf), 0.15, s.wetK);
  let f0 = vec3f(mix(0.04, 0.02, s.wetK));
  var col = s.albedo * diffuseEnergy(f0, rough, N, V) * (key * diff * vis / PI + sky + canopyFill(canopy, N) * s.ao);
  col += key * vis * brdfSunSpec(N, V, L, rough, f0) * mix(1.0, aggregateMask(V, L, N), turf);
  col += skySpec(N, V, rough, f0, s.ao) * skyScale * canopySky(canopy);
  return col;
}
`;
