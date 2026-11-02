// The crowd (render/crowd.js): many robed figures in one draw, their cloth baked (render/crowdBake.worker.js) and played back
// here — each vertex reads its particle at the two baked frames around its figure's time and blends them (15 fps baked, smooth
// at any frame rate), then is turned, scaled and placed by its figure. The fragment shader is the robe's own (shaders/cloth.wgsl.js)
// with the dye per figure, so the crowd and the heroes are one cloth.

import { clothFragmentWGSL } from './cloth.wgsl.js';

export const CROWD_CLIPS = 8;

export const crowdVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = particle id, yz = garment uv
attribute crowd: f32;               // the figure
uniform viewProjection: mat4x4f;
uniform crowdTime: vec4f;           // x = seconds, y = particles per figure
uniform crowdClips: array<vec4f, ${CROWD_CLIPS}>;   // first frame, frames, period (s), walking speed (m/s)
var<storage, read> crowdBake: array<vec4u>;          // per frame per particle: pos.xy, pos.z + garment·occ, normal.xy, normal.z + thin (halves)
var<storage, read> crowdFigs: array<vec4f>;          // per figure: (x, y, z, yaw), (scale, clip, time offset, walk range m), (dye rgb, shown)
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vUv: vec2f;
varying vGarment: f32;
varying vThin: f32;
varying vOcc: f32;
varying vTint: vec3f;

fn bakeAt(f: u32, i: u32, n: u32, pos: ptr<function, vec4f>, nrm: ptr<function, vec4f>) {
  let q = crowdBake[f * n + i];
  let a = unpack2x16float(q.x); let b = unpack2x16float(q.y); let c = unpack2x16float(q.z); let d = unpack2x16float(q.w);
  *pos = vec4f(a.x, a.y, b.x, b.y); *nrm = vec4f(c.x, c.y, d.x, d.y);
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let fi = u32(vertexInputs.crowd + 0.5);
  let A = crowdFigs[fi * 3u]; let B = crowdFigs[fi * 3u + 1u]; let C = crowdFigs[fi * 3u + 2u];
  let clip = uniforms.crowdClips[u32(B.y + 0.5)];
  let n = u32(uniforms.crowdTime.y + 0.5);
  let i = u32(vertexInputs.position.x + 0.5);
  let t = uniforms.crowdTime.x + B.z;
  let tau = t - clip.z * floor(t / clip.z);
  let ff = tau * 15.0;
  let f0 = u32(ff) % u32(clip.y); let f1 = (f0 + 1u) % u32(clip.y); let u = fract(ff);
  var p0: vec4f; var n0: vec4f; var p1: vec4f; var n1: vec4f;
  bakeAt(u32(clip.x) + f0, i, n, &p0, &n0);
  bakeAt(u32(clip.x) + f1, i, n, &p1, &n1);
  let lp = mix(p0.xyz, p1.xyz, u) * B.x;
  let ln = normalize(mix(n0.xyz, n1.xyz, u));
  // Walkers go along their facing over B.w metres and start again; they fade in and out at the ends (scale from the feet).
  var walk = 0.0; var fade = 1.0;
  if (B.w > 0.0) {
    let s = (t * clip.w) - B.w * floor(t * clip.w / B.w);
    walk = s - B.w * 0.5;
    fade = smoothstep(0.0, 1.5, s) * smoothstep(B.w, B.w - 1.5, s);
  }
  let cs = cos(A.w); let sn = sin(A.w);
  let r = vec3f(lp.x * cs + lp.z * sn, lp.y, -lp.x * sn + lp.z * cs) * fade * C.w;
  let wp = A.xyz + vec3f(sn, 0.0, cs) * walk + r;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vNormal = vec3f(ln.x * cs + ln.z * sn, ln.y, -ln.x * sn + ln.z * cs);
  vertexOutputs.vUv = vertexInputs.position.yz;
  let g = floor(p0.w + 0.001);
  vertexOutputs.vGarment = g;
  vertexOutputs.vOcc = clamp((mix(p0.w, p1.w, u) - g) / 0.98, 0.0, 1.0);
  vertexOutputs.vThin = n0.w;
  vertexOutputs.vTint = C.xyz;
}
`;

/** The robe's fragment shader with the dye per figure. */
export const crowdFragmentWGSL = clothFragmentWGSL
  .replace('uniform clothTint: vec4f;', 'varying vTint: vec3f;\nuniform clothTint: vec4f;')
  .replace('albedo *= uniforms.clothTint.rgb;', 'albedo *= fragmentInputs.vTint;');
