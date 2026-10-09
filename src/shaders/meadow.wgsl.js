// Highland meadow ground (PLAN.md Phase 8 M2; art bar: screenshots/reference/forest-ruins-target
// .webp). The scanned layers (src/materials) under procedural ones, chosen by the land:
//   turf          short green ground cover — the meadow's base, under the grass
//   grass-ground  dry grass, roots and dirt — on convex rises, wind-worn and thin
//   soil          bare compact earth — steeper banks, hollows that hold water, worn ground
//   rock-mossy    striated stone with moss and lichen — where it is too steep for soil
// Each layer is sampled top-down (planar) at a near scale and, far off, a second coarser scale
// (no visible repeat at any distance), blended by the layers' own height maps so stones and turf
// interlock instead of cross-fading. Large-scale variation (patches of greener and yellower turf,
// darker damp swales) breaks the field up the way real hillsides read from a distance. Uses
// matDpx/matDpy from the top of the clipmap fragment (the meadow branch is non-uniform).
// The wet and flattened terrain state darkens and flattens the ground (footprints, the surf's
// groove).

export const MEADOW_WGSL = /* wgsl */ `
struct MeadowSurf { albedo: vec3f, N: vec3f, rough: f32, ao: f32, rock: f32 };

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
  let near = mdPlanar(layer, p, kNear, N);
  let far = mdPlanar(layer, p + vec2f(17.3, -9.1), kNear * 0.19, N);
  let w = smoothstep(0.012, 0.06, fp / kNear * 0.5);
  var s: MatS;
  s.albedo = mix(matRetint(near, layer, base, keepHue), matRetint(far, layer, base, keepHue), w);
  s.N = normalize(mix(near.N, far.N, w));
  s.rough = mix(near.rough, far.rough, w); s.ao = mix(near.ao, far.ao, w); s.h = mix(near.h, far.h, w);
  return s;
}

fn meadowSurface(wp: vec3f, Ng: vec3f, Nc: vec3f, fp: f32, state: vec4f) -> MeadowSurf {
  var o: MeadowSurf;
  let slope = 1.0 - Nc.y;
  let p = wp.xz;
  // Landform masks: rises (wind-worn, thin grass), hollows (damp, dark soil), steepness (rock).
  let n1 = noised(p * 0.011).x; let n2 = noised(p * 0.043 + 7.0).x; let n3 = noised(p * 0.17 + 3.0).x;
  let rise = smoothstep(0.1, 0.6, n1 * 0.6 + n2 * 0.4);
  let damp = smoothstep(0.25, 0.7, -n1 * 0.7 - n2 * 0.3);
  // Layers (art-directed bases; each scan keeps its own detail).
  let turf = mdLayer(MAT_TURF, p, 0.42, Ng, fp, vec3f(0.095, 0.12, 0.055), 0.35);
  let dry = mdLayer(MAT_GRASS_GROUND, p + vec2f(31.0, 5.0), 0.38, Ng, fp, vec3f(0.24, 0.21, 0.12), 0.6);
  let soil = mdLayer(MAT_SOIL, p + vec2f(-13.0, 41.0), 0.33, Ng, fp, vec3f(0.12, 0.09, 0.06), 0.6);
  // Height-blended weights: the layer whose texel stands higher wins near the boundary.
  var wT = 1.0;
  var wD = rise * 0.8 + 0.25 * smoothstep(0.2, 0.7, n3);
  var wS = max(damp * 0.7, smoothstep(0.32, 0.5, slope)) + state.y * 0.8; // wet state: bared, muddy
  wT *= 0.6 + turf.h; wD *= 0.6 + dry.h; wS *= 0.6 + soil.h;
  let k = 6.0;
  wT = pow(wT, k); wD = pow(wD, k); wS = pow(wS, k);
  let ws = max(wT + wD + wS, 1e-5);
  wT /= ws; wD /= ws; wS /= ws;
  o.albedo = turf.albedo * wT + dry.albedo * wD + soil.albedo * wS;
  o.N = normalize(turf.N * wT + dry.N * wD + soil.N * wS);
  o.rough = 0.85;
  o.ao = turf.ao * wT + dry.ao * wD + soil.ao * wS;
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
  o.albedo *= mix(vec3f(1.0), vec3f(1.08, 1.04, 0.82), smoothstep(0.1, 0.7, hueN));
  o.albedo *= mix(vec3f(1.0), vec3f(0.8, 0.88, 0.85), damp * 0.6);
  // Terrain state: trampled/flattened ground is darker and smoother; wet ground glossier.
  o.albedo *= 1.0 - 0.18 * state.x - 0.25 * state.y;
  o.rough = mix(o.rough, 0.45, state.y * 0.6);
  return o;
}

// Lit colour of the meadow ground (linear HDR): Lambert with the key light, the live-sky SH
// (warmer than the frost's, the green bounce of the field under it), a soft sheen at grazing.
fn meadowLight(s: MeadowSurf, N: vec3f, V: vec3f, L: vec3f, key: vec3f, vis: f32, skyScale: f32) -> vec3f {
  let nl = dot(N, L);
  let diff = clamp(nl, 0.0, 1.0);
  let sky = shIrradiance(N) * skyScale * s.ao * vec3f(0.98, 1.0, 0.96);
  var col = s.albedo * (key * diff * vis / PI + sky);
  let H = normalize(L + V);
  let nh = max(dot(N, H), 0.0);
  let F = 0.04 + 0.96 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  col += key * pow(nh, mix(8.0, 60.0, 1.0 - s.rough)) * F * 0.15 * clamp(nl, 0.0, 1.0) * vis;
  return col;
}
`;
