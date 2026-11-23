// Dust (render/dust.js): the cloud a collapse throws up — puffs in a ring of records (written when spawned), every motion
// in the vertex shader: a puff bursts out at its own speed, slows in the air (drag), rises a little while it is warm,
// spreads and thins over its life; heavy grit sinks. Lit like the plume (a sphere's normal over the quad, the key from its
// side, the sky above, darker underneath), billowed by noise, its colour the stuff it came from (lime and plaster pale,
// stone and basalt grey, ash and soot dark). Premultiplied, no depth write, the aerial perspective over it.
import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';

export const DUST_COUNT = 8192;

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

fn dh(x: f32) -> f32 { return fract(sin(x * 91.7 + 13.1) * 43758.5453); }

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let i = u32(vertexInputs.position.x + 0.5);
  let c = vertexInputs.position.yz;
  let a = dustRec[i * 3u]; let b = dustRec[i * 3u + 1u]; let k = dustRec[i * 3u + 2u];
  let age = uniforms.dustT.x - a.w;
  let life = max(k.w, 0.1);
  let u = age / life;
  let alive = !(age < 0.0 || u >= 1.0 || b.w <= 0.0);
  let ageC = clamp(age, 0.0, life);
  // Out at its burst speed, slowed by the air; rising while warm, then drifting down a little; a slow curl.
  let drag = 1.3;
  let s = (1.0 - exp(-ageC * drag)) / drag;
  let fi = f32(i);
  var p = a.xyz + b.xyz * s + vec3f(0.0, 0.55 * (1.0 - exp(-ageC * 0.35)) * 3.0 - 0.04 * ageC, 0.0);
  p += vec3f(sin(ageC * 0.4 + fi), 0.0, cos(ageC * 0.33 + fi * 1.7)) * 0.25 * ageC;
  let size = b.w * (0.5 + 1.25 * sqrt(clamp(u, 0.0, 1.0))) * (0.8 + 0.4 * dh(fi * 3.1));
  let f = normalize(uniforms.cameraPosition - p);
  let r = normalize(cross(vec3f(0.0, 1.0, 0.0), f));
  let up = cross(f, r);
  let rot = dh(fi * 2.3) * 6.2831853 + ageC * 0.08 * (dh(fi * 4.4) - 0.5);
  let cr = vec2f(c.x * cos(rot) - c.y * sin(rot), c.x * sin(rot) + c.y * cos(rot));
  let wp = p + (r * cr.x + up * cr.y) * size;
  vertexOutputs.position = select(vec4f(0.0, 0.0, -2.0, 1.0), uniforms.viewProjection * vec4f(wp, 1.0), alive);
  vertexOutputs.vUv = c; vertexOutputs.vCol = k.rgb;
  vertexOutputs.vAge = clamp(u, 0.0, 1.0); vertexOutputs.vSeed = dh(fi * 1.7);
  vertexOutputs.vR = r; vertexOutputs.vU = up; vertexOutputs.vF = f;
  vertexOutputs.vWorldPos = wp;
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
  let a = soft * smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.35, 1.0, u)) * mix(0.6, 0.18, u);
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
  col += vec3f(1.0, 0.32, 0.07) * uniforms.dustT.y * clamp(-N.y + 0.4, 0.0, 1.0) * 0.04 / max(ex, 1e-6);
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - fragmentInputs.vWorldPos) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(col, ex) * a, a);
}
`;
