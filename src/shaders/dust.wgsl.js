// Dust (render/dust.js): the cloud a collapse throws up — puffs in a ring of records (written when spawned), every motion
// in the vertex shader: a puff bursts out at its own speed, slows in the air (drag), rises a little while it is warm,
// spreads and thins over its life; heavy grit sinks. Lit like the plume (a sphere's normal over the quad, the key from its
// side, the sky above, darker underneath), billowed by noise, its colour the stuff it came from (lime and plaster pale,
// stone and basalt grey, ash and soot dark). Premultiplied, no depth write, the aerial perspective over it.
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';

export const DUST_COUNT = 16384;   // (a surge's cloud is thousands of billows at once: render/dust.js, systems/eruption.js)

export const dustVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = puff, yz = the quad's corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform dustT: vec4f;               // x = time (s)
var<storage, read> dustRec: array<vec4f>;   // per puff: (x, y, z, birth), (vx, vy, vz, size), (r, g, b, life)
varying vUv: vec2f;
varying vAge: f32;
varying vCol: vec3f;
varying vSeed: f32;
varying vR: vec3f;
varying vU: vec3f;
varying vF: vec3f;
varying vWorldPos: vec3f;
varying vSurge: f32;

fn dh(x: f32) -> f32 { return fract(sin(x * 91.7 + 13.1) * 43758.5453); }

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let i = u32(vertexInputs.position.x + 0.5);
  let c = vertexInputs.position.yz;
  let a = dustRec[i * 3u]; let b = dustRec[i * 3u + 1u]; let k = dustRec[i * 3u + 2u];
  let age = uniforms.dustT.x - a.w;
  // (A negative life: a flake of ash falling from a crumbling cast — systems/eruption.js: dropped, not lifted.)
  let flake = k.w < 0.0;
  let life = max(abs(k.w), 0.1);
  let u = age / life;
  // (A negative size: a surge's billow — systems/eruption.js — which rolls on with the cloud's front, swells and climbs
  // as it goes, and stays thick: the pyroclastic cloud, not a building's dust.)
  let surge = b.w < 0.0;
  let sz0 = abs(b.w);
  let alive = !(age < 0.0 || u >= 1.0 || sz0 <= 0.0);
  let ageC = clamp(age, 0.0, life);
  // Out at its burst speed, slowed by the air; rising while warm, then drifting down a little; a slow curl.
  let drag = select(select(1.3, 0.2, surge), 2.5, flake);
  let s = (1.0 - exp(-ageC * drag)) / drag;
  let fi = f32(i);
  let rise = select(0.55 * (1.0 - exp(-ageC * 0.35)) * 3.0 - 0.04 * ageC, 45.0 * (1.0 - exp(-ageC * 0.09)) * (0.5 + 1.0 * dh(fi * 5.3)), surge);
  var p = a.xyz + b.xyz * s + vec3f(0.0, select(rise, -min(4.9 * ageC * ageC, b.y * 0.0 + 2.2), flake), 0.0);
  p += vec3f(sin(ageC * 0.4 + fi), 0.0, cos(ageC * 0.33 + fi * 1.7)) * select(0.25, 0.6, surge) * ageC;
  let grow = select(select(0.5 + 1.25 * sqrt(clamp(u, 0.0, 1.0)), 0.75 + 2.6 * sqrt(clamp(u, 0.0, 1.0)), surge), 1.0, flake);
  let size = sz0 * grow * (0.8 + 0.4 * dh(fi * 3.1));
  let f = normalize(uniforms.cameraPosition - p);
  let r = normalize(cross(vec3f(0.0, 1.0, 0.0), f));
  let up = cross(f, r);
  let rot = dh(fi * 2.3) * 6.2831853 + ageC * 0.08 * (dh(fi * 4.4) - 0.5);
  let cr = vec2f(c.x * cos(rot) - c.y * sin(rot), c.x * sin(rot) + c.y * cos(rot));
  // (Drawn a little toward the camera, and shrunk to cover the same on screen: a puff low over the ground is not sliced flat
  // by it — seen from above, a cut puff reads as a pale disc lying on the ground, not a cloud.)
  let dist = length(uniforms.cameraPosition - p);
  let off = select(min(size * 0.85, dist * 0.45), 0.0, flake);
  let wp = p + f * off + (r * cr.x + up * cr.y) * size * (dist - off) / max(dist, 1e-3);
  vertexOutputs.position = select(vec4f(0.0, 0.0, -2.0, 1.0), uniforms.viewProjection * vec4f(wp, 1.0), alive);
  vertexOutputs.vUv = c; vertexOutputs.vCol = k.rgb;
  vertexOutputs.vAge = clamp(u, 0.0, 1.0); vertexOutputs.vSeed = dh(fi * 1.7);
  vertexOutputs.vR = r; vertexOutputs.vU = up; vertexOutputs.vF = f;
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vSurge = select(select(0.0, 1.0, surge), 2.0, flake);
}
`;

export const dustFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform dustT: vec4f;               // y = the lava's glow on it (0..1, the eruption)
varying vUv: vec2f;
varying vAge: f32;
varying vCol: vec3f;
varying vSeed: f32;
varying vR: vec3f;
varying vU: vec3f;
varying vF: vec3f;
varying vWorldPos: vec3f;
varying vSurge: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let uv = fragmentInputs.vUv;
  let q = uv * 1.6 + vec2f(fragmentInputs.vSeed * 17.0, fragmentInputs.vSeed * 5.0);
  let n = noised(q).x * 0.6 + noised(q * 2.3 + 4.0).x * 0.3;
  let fine = noised(q * 4.3 + 9.0).x * 0.5 + noised(q * 9.1 + 2.0).x * 0.25;
  let r2 = dot(uv, uv);
  let d = r2 + 0.55 * n + 0.22 * fine;
  if (d > 1.0) { discard; }
  let u = fragmentInputs.vAge;
  let soft = (1.0 - smoothstep(0.45, 1.0, d)) * (0.55 + 0.45 * smoothstep(-0.5, 0.4, fine));
  // Thick as it bursts, thinning as it spreads.
  // (A surge's billow stays dense most of its life: the cloud is a wall, it thins only as it settles.)
  var a = select(soft * smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.35, 1.0, u)) * mix(0.6, 0.18, u),
                 soft * smoothstep(0.0, 0.03, u) * (1.0 - smoothstep(0.55, 1.0, u)) * mix(0.95, 0.5, u), fragmentInputs.vSurge > 0.5);
  if (fragmentInputs.vSurge > 1.5) { a = soft * (1.0 - smoothstep(0.7, 1.0, u)); }   // (a flake: solid, gone as it lands)
  let z = sqrt(max(0.0, 1.0 - min(r2, 1.0)));
  let N = normalize(fragmentInputs.vR * uv.x + fragmentInputs.vU * uv.y + fragmentInputs.vF * z);
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let sky = shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w;
  let fold = 0.4 + 0.6 * smoothstep(-0.6, 0.5, fine + n * 0.5);
  let lit = clamp(dot(N, L) * 0.8 + 0.3, 0.0, 1.0);
  var col = fragmentInputs.vCol * fold * (key * lit / PI + sky * (0.3 + 0.7 * max(N.y, 0.0)));
  col += key * fragmentInputs.vCol * 0.5 * pow(clamp(dot(-fragmentInputs.vF, L), 0.0, 1.0), 4.0) * (1.0 - soft);
  let ex = uniforms.fogParams.z * atmoExposure();
  // Lit from below by the lava (the eruption).
  // (Not a surge's billows: the cloud is lit by the lava only where the lava is, not everywhere.)
  // (Reflected off the dust itself: in proportion to its colour — 2.6 × plaster's ≈ 1 — so dark ash takes little of it.)
  col += vec3f(1.0, 0.32, 0.07) * min(fragmentInputs.vCol * 2.6, vec3f(1.0)) * uniforms.dustT.y * clamp(-N.y + 0.4, 0.0, 1.0) * 0.04 / max(ex, 1e-6) * (1.0 - 0.5 * min(fragmentInputs.vSurge, 1.0));
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - fragmentInputs.vWorldPos) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(col, ex) * a, a);
}
`;
