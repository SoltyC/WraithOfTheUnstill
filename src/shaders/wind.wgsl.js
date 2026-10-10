// The wind field on the GPU (world/wind.js is the CPU twin: keep the two in step). Materials that
// declare WIND_DECL get the shared uniform block (render side: mat.setArray4('windField', wind.block)).

export const WIND_DECL = /* wgsl */ `
uniform windField: array<vec4f,6>;  // world/wind.js block: [0] dir, base, time; [1] gustiness, front speed; [2..5] bursts
`;

export const WIND_WGSL = /* wgsl */ `
fn wfFront(ph: f32) -> f32 { let s = 0.5 + 0.5 * sin(ph); return s * s * s * s; }
/** The wind at (x, z): xy = direction (unit), z = speed factor (≈ strength × gusts; 0 when still). */
fn windField(p: vec2f) -> vec3f {
  let W0 = uniforms.windField[0]; let W1 = uniforms.windField[1];
  let d = W0.xy; let base = W0.z; let t = W0.w; let c = W1.y;
  let along = dot(p, d); let across = -p.x * d.y + p.y * d.x;
  let f1 = wfFront((along - c * t) * 0.045 + sin(across * 0.013 + t * 0.05) * 1.2);
  let f2 = wfFront((along - c * 1.2 * t) * 0.11 + 1.7 + sin(across * 0.031 - t * 0.07) * 0.9);
  let eddy = 0.12 * sin(p.x * 0.21 + t * 1.3) * sin(p.y * 0.17 - t * 1.1);
  let g = 0.55 + W1.x * (0.9 * f1 + 0.5 * f2) + eddy;
  var v = d * base * g;
  for (var i = 2u; i < 6u; i++) {
    let B = uniforms.windField[i];
    if (B.w <= 0.0) { continue; }
    let age = t - B.z;
    if (age < 0.0 || age > 2.2) { continue; }
    let r = p - B.xy; let dist = length(r);
    let q = (dist - 14.0 * age) / 5.0;
    let fade = (1.0 - age / 2.2) * (1.0 - age / 2.2) / (1.0 + dist * 0.02);
    v += r * (B.w * exp(-q * q) * fade / max(dist, 0.5));
  }
  let sp = length(v);
  return vec3f(select(d, v / sp, sp > 1e-5), sp);
}
`;
