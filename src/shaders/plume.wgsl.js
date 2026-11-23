// The volcano's plume (render/plume.js): PLUME_COUNT soft puffs rising out of the crater in a column that widens and leans
// downwind, every motion in the vertex shader (a puff's seed fixes its lane round the column; its age climbs it, looping).
// Lit as a sphere of ash (a pseudo-normal over the quad: lit on the sun's side, the sky's colour from above, darker
// underneath), thicker and darker low down, paler and thinner as it spreads; at night the crater's glow lights its base from
// below. Premultiplied alpha, no depth write, then the aerial perspective, so from far off it sits in the haze like the hills.
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';

export const PLUME_COUNT = 900;

export const plumeVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = puff index, yz = the quad's corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform plumeA: vec4f;              // xyz = the crater's centre (world), w = time (s)
uniform plumeB: vec4f;              // xy = the wind's direction (x, z), z = the column's height (m), w = strength 0..1 (0: none)
varying vUv: vec2f;
varying vAge: f32;
varying vSeed: f32;
varying vH: f32;
varying vR: vec3f;
varying vU: vec3f;
varying vF: vec3f;
varying vWorldPos: vec3f;
varying vRad: vec3f;

fn h1(x: f32) -> f32 { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let i = vertexInputs.position.x;
  let c = vertexInputs.position.yz;
  let t = uniforms.plumeA.w;
  let H = uniforms.plumeB.z;
  // Age: each puff climbs the column in 110–150 s and starts again; the seeds spread them along it.
  // (plumeC.z: the scale, 0 → 1 — a steam vent is the same column at a few hundredths of the size, and quicker.)
  let sc = select(uniforms.plumeC.z, 1.0, uniforms.plumeC.z <= 0.0);
  // (An eruption column — kilometres high — goes up far faster than a sleeping mountain's plume: tens of metres a second.)
  let period = (110.0 + 40.0 * h1(i * 3.1)) * max(sc, 0.035) * mix(1.0, 0.45, smoothstep(1500.0, 3600.0, H));
  let age = fract(h1(i) + t / period);
  // Rising slower as it goes (the column decelerates and spreads).
  let k = 1.0 - pow(1.0 - age, 1.7);
  let y = k * H;
  // Its lane round the column, wandering; the column widens with height and leans downwind (more and more as it slows).
  let a = h1(i * 7.7) * 6.2831853 + 0.6 * sin(t * 0.05 + i);
  let spread = 35.0 * sc + 0.28 * y;
  let rr = spread * sqrt(h1(i * 5.3));
  let lean = pow(y / max(H, 1.0), 2.0) * H * 0.55;
  var p = uniforms.plumeA.xyz + vec3f(cos(a) * rr + uniforms.plumeB.x * lean, y, sin(a) * rr + uniforms.plumeB.y * lean);
  // A slow churn: the column boils.
  p += vec3f(sin(t * 0.07 / max(sc, 0.035) + i * 1.3), 0.0, cos(t * 0.06 / max(sc, 0.035) + i * 0.7)) * (8.0 * sc + 0.05 * y);
  // (A puff's size: the column's own scale over its count — the more of them, the smaller each, the finer the boil.)
  let size = (34.0 * sc + 0.26 * y) * (0.7 + 0.6 * h1(i * 9.1));
  // Turned to the camera.
  let f = normalize(uniforms.cameraPosition - p);
  let r = normalize(cross(vec3f(0.0, 1.0, 0.0), f));
  let u = cross(f, r);
  let rot = h1(i * 2.3) * 6.2831853 + t * 0.01 * (h1(i * 4.4) - 0.5);
  let cr = vec2f(c.x * cos(rot) - c.y * sin(rot), c.x * sin(rot) + c.y * cos(rot));
  let wp = p + (r * cr.x + u * cr.y) * size;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (uniforms.plumeB.w < 0.01) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = c;
  vertexOutputs.vAge = age;
  vertexOutputs.vSeed = h1(i * 1.7);
  vertexOutputs.vH = y / max(H, 1.0);
  vertexOutputs.vR = r; vertexOutputs.vU = u; vertexOutputs.vF = f;
  vertexOutputs.vWorldPos = wp;
  // Where the puff sits across the column (−1..1 round its axis): the far side from the sun is in the column's own shadow.
  vertexOutputs.vRad = vec3f(cos(a), 0.0, sin(a)) * sqrt(h1(i * 5.3));
}
`;

export const plumeFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform plumeB: vec4f;
uniform plumeD: vec4f;              // x = lightning in the column 0..1, yzw = where (world)
uniform plumeC: vec4f;              // x = the crater's glow 0..1 (night), y = the plume's darkness 0..1, z = scale (0: 1), w = steam 0..1 (white)
varying vUv: vec2f;
varying vAge: f32;
varying vSeed: f32;
varying vH: f32;
varying vR: vec3f;
varying vU: vec3f;
varying vF: vec3f;
varying vWorldPos: vec3f;
varying vRad: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let uv = fragmentInputs.vUv;
  // A billow: round, its edge broken by noise (two octaves, turning with the puff's seed).
  let q = uv * 1.7 + vec2f(fragmentInputs.vSeed * 17.0, fragmentInputs.vSeed * 5.0);
  let n = noised(q).x * 0.6 + noised(q * 2.3 + 4.0).x * 0.3;
  // Cauliflower: knots of finer billows inside the puff, their folds shadowed.
  let f1 = noised(q * 4.1 + 9.0);
  let f2 = noised(q * 8.7 + 2.0);
  let fine = f1.x * 0.5 + f2.x * 0.25;
  let r2 = dot(uv, uv);
  let d = r2 + 0.5 * n + 0.26 * fine;
  if (d > 1.0) { discard; }
  let soft = (1.0 - smoothstep(0.78, 1.0, d)) * (0.75 + 0.25 * smoothstep(-0.5, 0.4, fine));
  let fold = 0.35 + 0.65 * smoothstep(-0.6, 0.5, fine + n * 0.5);
  // Fade in at the vent, out as it thins at the top.
  let age = fragmentInputs.vAge;
  let life = smoothstep(0.0, 0.04, age) * (1.0 - smoothstep(0.65, 1.0, age));
  let dens = mix(0.97, 0.3, pow(fragmentInputs.vH, 0.9));
  var a = soft * life * dens * uniforms.plumeB.w;
  // (The column's own puffs are tens of metres across: from a few hundred metres off, its low part would stand up as
  // one smooth wall in front of everything. Close to it, the low puffs thin out; a steam vent (small scale) is untouched.)
  let camD = length(uniforms.cameraPosition - fragmentInputs.vWorldPos);
  if (uniforms.plumeC.z <= 0.0 || uniforms.plumeC.z >= 0.5) { a *= mix(smoothstep(40.0, 220.0, camD), 1.0, smoothstep(0.04, 0.2, fragmentInputs.vH)); }
  // A sphere's normal over the quad, in the world.
  let z = sqrt(max(0.0, 1.0 - min(r2, 1.0)));
  // Cauliflower: the sphere's normal bent by the fine billows' slopes — each knot lit on its sun side, shadowed in its folds.
  let bump = (f1.yz * 0.5 * 4.1 + f2.yz * 0.25 * 8.7) * 0.11;
  let Nb = vec2f(uv.x - bump.x, uv.y - bump.y);
  let N = normalize(fragmentInputs.vR * Nb.x + fragmentInputs.vU * Nb.y + fragmentInputs.vF * z);
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let sky = shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w;
  // Ash: grey-brown, near black where the eruption's column is thick; the steam vent white.
  let ash = mix(mix(vec3f(0.13, 0.13, 0.135), vec3f(0.4, 0.4, 0.41), fragmentInputs.vH) * (1.0 - 0.72 * uniforms.plumeC.y), vec3f(0.78, 0.79, 0.8), uniforms.plumeC.w);
  // The column's own shadow: puffs on its far side from the sun get little of it (more so the denser the column).
  let side = dot(fragmentInputs.vRad, vec3f(L.x, 0.0, L.z));
  let selfSh = mix(1.0, smoothstep(-0.9, 0.5, side) * 0.85 + 0.15, 0.4 + 0.5 * uniforms.plumeC.y);
  let lit = clamp(dot(N, L) * 0.75 + 0.25, 0.0, 1.0) * selfSh;
  // (A thick column is lit only on its skin and greyed by its own scattering: the low sun's gold, toned down.)
  let keyA = mix(key, vec3f(dot(key, vec3f(0.3, 0.5, 0.2))), 0.45 * uniforms.plumeC.y) * mix(1.0, 0.7, uniforms.plumeC.y);
  var col = ash * fold * (keyA * lit / PI + sky * (0.35 + 0.35 * N.y) * mix(1.0, 0.6, uniforms.plumeC.y));
  // Light through the thin edges when the sun is behind it.
  col += key * ash * 0.6 * pow(clamp(dot(-fragmentInputs.vF, L), 0.0, 1.0), 4.0) * (1.0 - soft);
  // The crater's glow from below, strongest at the base.
  let ex = uniforms.fogParams.z * atmoExposure();
  // (Only the low column and its undersides: the glow lighting the whole lower plume read as a tan haze by day.)
  let under = clamp(-N.y + 0.15, 0.0, 1.0);
  let glow = uniforms.plumeC.x * (exp(-fragmentInputs.vH * 16.0) * (0.35 + 0.65 * under) + 0.25 * exp(-fragmentInputs.vH * 5.0) * under * under);
  col += vec3f(1.0, 0.32, 0.06) * glow * 0.22 * (0.5 + 0.5 * fold) / max(ex, 1e-6);
  // Lightning inside the column: the ash round the bolt lit blue-white through itself (a few hundred metres of it).
  let fd = length(fragmentInputs.vWorldPos - uniforms.plumeD.yzw);
  col += vec3f(0.75, 0.82, 1.0) * uniforms.plumeD.x * exp(-fd / 170.0) * (0.4 + 0.6 * fold) * 2.6 / max(ex, 1e-6);
  // (The ember area's grade warms the shadows: a thick ash column, near black, would come out brown. Cooled ahead of it.)
  col *= mix(vec3f(1.0), vec3f(0.78, 0.9, 1.16), uniforms.plumeC.y * (1.0 - uniforms.plumeC.w));
  let camPos = uniforms.cameraPosition;
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - fragmentInputs.vWorldPos) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(col, ex) * a, a);
}
`;
