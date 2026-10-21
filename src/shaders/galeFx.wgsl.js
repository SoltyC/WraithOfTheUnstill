// Gale FX (the wind verbs): the gust's lance, the vortex's column, the updraft's pillar. Stateless
// GPU particles like the fire: every quad is a hashed seed with a looping life, animated in the
// vertex shader from the clock and a small uniform block (src/game/bending/gale.js writeFx), so
// nothing is uploaded per frame but twelve vec4. Wind is shown by what it carries: pale streaks
// (additive, alpha 0) and debris (snow sparkle, or grass and petals on the meadow; alpha-blended,
// lit by the sky and the sun like the fire's smoke). A verb whose strength is 0 culls its quads.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';

export const GUSTS = 3, DRAFTS = 2;
export const PER_GUST = 90;     // 30 wind lines, 60 flecks
export const PER_VORTEX = 140;  // 110 debris, 30 spiral lines
export const PER_DRAFT = 100;   // 40 streaks, 30 debris, 30 ring puff
export const GALE_COUNT = GUSTS * PER_GUST + PER_VORTEX + DRAFTS * PER_DRAFT;
const V0 = GUSTS * PER_GUST, U0 = V0 + PER_VORTEX;

export const galeFxVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // x = particle id, yz = quad corner (−1..1)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform gale: array<vec4f, 12>;     // see gale.js writeFx
uniform galeT: vec4f;               // x = time (s), yz = wind direction (x, z), w = meadow 0..1 at the caster
varying vUv: vec2f;
varying vAlpha: f32;
varying vKind: f32;
varying vSeed: f32;
varying vWorldPos: vec3f;

fn gh(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967295.0;
}

// Debris kind: 1 snow sparkle, 4 snow clump; meadow: 2 grass, 3 petal.
fn debrisKind(h: f32, meadow: bool) -> f32 {
  if (meadow) { return select(2.0, 3.0, h < 0.2); }
  return select(4.0, 1.0, h < 0.7);
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let id = u32(vertexInputs.position.x + 0.5);
  let corner = vertexInputs.position.yz;
  let t = uniforms.galeT.x;
  let meadow = uniforms.galeT.w > 0.5;
  let h1 = gh(id * 8u + 1u); let h2 = gh(id * 8u + 2u); let h3 = gh(id * 8u + 3u); let h4 = gh(id * 8u + 4u);
  let h5 = gh(id * 8u + 5u); let h6 = gh(id * 8u + 6u); let h7 = gh(id * 8u + 7u);
  let up = vec3f(0.0, 1.0, 0.0);
  var p = vec3f(0.0, -1000.0, 0.0);
  var sx = 0.05; var sy = 0.05;       // half extents (billboard: x/y; line: along/across)
  var rot = 0.0;
  var isLine = false;
  var axisDir = up;
  var alpha = 0.0; var kind = 0.0;

  if (id < ${V0}u) {
    // ---- Gust: wind lines streaming along the lane behind the front, flecks thrown up from the ground.
    let g = id / ${PER_GUST}u; let k = id % ${PER_GUST}u;
    let G = uniforms.gale[g]; let D = uniforms.gale[3u + g];
    let S = G.w;
    let dir3 = vec3f(D.x, 0.0, D.y);
    let perp = vec3f(-D.y, 0.0, D.x);
    let dist = D.w; let hw = D.z;
    let front = vec3f(G.x, G.y, G.z);
    if (k < 30u) {
      let lm = max(min(dist, 9.0), 0.01);
      let u = fract(h1 + t * 0.9);
      let s = u * lm;
      let lat = (h2 * 2.0 - 1.0) * hw * (0.7 + 0.5 * u);
      p = front - dir3 * s + perp * lat + up * (0.25 + h3 * 1.3 + 0.08 * sin(t * 3.0 + h4 * 6.28));
      isLine = true; axisDir = dir3;
      sx = 0.6 + 0.9 * h4; sy = 0.025 + 0.015 * h5;
      alpha = S * 0.28 * pow(max(1.0 - u, 0.0), 1.5) * smoothstep(0.0, 0.08, u) * (0.5 + 0.5 * h5);
      if (s > dist) { alpha = 0.0; }
      kind = 0.0;
    } else {
      let lf = max(min(dist, 7.0), 0.01);
      let u = fract(h1 + t * 0.55);
      let s = u * lf * 0.9 - 0.4;
      let lat = (h2 * 2.0 - 1.0) * hw;
      let lift = (0.25 + 1.1 * h3) * sin(clamp(u * 1.15, 0.0, 1.0) * 3.14159) * (1.0 - 0.5 * u);
      p = front - dir3 * s + perp * lat + up * (0.08 + lift);
      kind = debrisKind(h7, meadow);
      sx = select(0.015 + 0.015 * h4, 0.03 + 0.03 * h4, kind > 1.5 && kind < 2.5);
      sy = select(sx, sx * 0.5, kind > 1.5 && kind < 2.5);
      if (kind > 2.5 && kind < 3.5) { sx = 0.04; sy = 0.03; }
      rot = h5 * 6.28 + t * (3.0 + 5.0 * h6);
      alpha = S * smoothstep(0.0, 0.05, u) * (1.0 - u * u) * 0.9;
      if (h6 > pow(max(1.0 - u, 0.0), 1.2) + 0.1) { alpha = 0.0; } // thins behind the front
      if (s > dist) { alpha = 0.0; }
    }
  } else if (id < ${U0}u) {
    // ---- Vortex: debris orbiting the axis, rising in a helix and falling back at the rim.
    let k = id - ${V0}u;
    let V = uniforms.gale[6]; let VR = uniforms.gale[7];
    let S = V.w; let R = VR.x;
    let H = 2.5 * S;
    if (k < 110u) {
      let u = fract(t * (0.09 + 0.07 * h1) + h2);
      let r0 = R * (0.35 + 0.55 * h3);
      let yTop = H * (0.35 + 0.65 * h4);
      var r = r0; var y = 0.0;
      if (u < 0.75) {
        let v = u / 0.75;
        r = r0 * (0.7 + 0.3 * v); y = yTop * v;
      } else {
        let f = (u - 0.75) / 0.25;
        r = r0 * (1.0 + 0.5 * f); y = yTop * (1.0 - f * f);
      }
      let a = h1 * 6.28 + t * (1.8 + 1.4 * h5);
      p = vec3f(V.x + cos(a) * r, V.y + 0.1 + y, V.z + sin(a) * r);
      kind = debrisKind(h7, meadow);
      sx = select(0.015 + 0.015 * h4, 0.03 + 0.03 * h4, kind > 1.5 && kind < 2.5);
      sy = select(sx, sx * 0.5, kind > 1.5 && kind < 2.5);
      if (kind > 2.5 && kind < 3.5) { sx = 0.04; sy = 0.03; }
      rot = h5 * 6.28 + t * (2.0 + 5.0 * h6);
      alpha = smoothstep(0.0, 0.08, S) * smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.92, 1.0, u)) * 0.85;
      if (h6 > 0.3 + 0.7 * S) { alpha = 0.0; }
    } else {
      // A faint spiral line, tangent to its orbit.
      let yn = fract(h3 + t * 0.15);
      let a = h1 * 6.28 + t * (1.6 + 0.6 * h2);
      let r = R * (0.5 + 0.6 * h4) * (0.8 + 0.4 * yn);
      p = vec3f(V.x + cos(a) * r, V.y + 0.15 + yn * H * 1.1, V.z + sin(a) * r);
      isLine = true; axisDir = normalize(vec3f(-sin(a), 0.12, cos(a)));
      sx = 0.3 + 0.25 * h5; sy = 0.025 + 0.015 * h5;
      alpha = S * 0.15 * sin(3.14159 * yn);
      kind = 0.0;
    }
  } else {
    // ---- Updraft: streaks rushing up the column, debris spat out at the top, a ring puff at the start.
    let j = id - ${U0}u;
    let d = j / ${PER_DRAFT}u; let k = j % ${PER_DRAFT}u;
    let U = uniforms.gale[8u + d]; let UR = uniforms.gale[10u + d];
    let S = U.w; let R = UR.x; let H = UR.y; let age = UR.z;
    let base = U.xyz;
    if (k < 40u) {
      // Short soft streaks, densest low (u squared) and fading with height; the last few are broad heat-shimmer wisps.
      let wisp = k >= 34u;
      let rn = h2;
      let u = fract(t * (0.45 + 0.4 * h3) + h4);
      let a = h1 * 6.28 + u * 0.8;
      let yy = 0.1 + u * u * min(H, 14.0) * 0.5;
      p = base + vec3f(cos(a) * R * 0.85 * rn, yy, sin(a) * R * 0.85 * rn);
      isLine = true; axisDir = up;
      sx = select(0.2 + 0.4 * h5, 0.9 + 0.6 * h5, wisp);
      sy = select(0.02 + 0.02 * h5, 0.1 + 0.08 * h5, wisp);
      let fade = 1.0 - smoothstep(0.35, 1.0, u);
      alpha = S * select(0.2, 0.07, wisp) * (1.0 - rn * rn) * smoothstep(0.0, 0.08, u) * fade;
      kind = 0.0;
    } else if (k < 70u) {
      let u = fract(t * (0.11 + 0.08 * h1) + h2);
      let a = h3 * 6.28 + t * 1.5;
      var r = 0.0; var y = 0.0;
      if (u < 0.72) {
        let v = u / 0.72;
        r = R * 0.5 * h4 * (0.4 + 0.6 * v); y = H * 0.92 * pow(v, 1.2);
      } else {
        let f = (u - 0.72) / 0.28;
        r = R * 0.5 * h4 + R * (0.6 + 1.4 * h5) * f;
        y = H * 0.92 + (2.0 * h5 + 0.5) * f - (3.0 + 2.0 * h5) * f * f;
      }
      p = base + vec3f(cos(a) * r, 0.1 + y, sin(a) * r);
      kind = debrisKind(h7, meadow);
      sx = select(0.015 + 0.015 * h4, 0.03 + 0.03 * h4, kind > 1.5 && kind < 2.5);
      sy = select(sx, sx * 0.5, kind > 1.5 && kind < 2.5);
      if (kind > 2.5 && kind < 3.5) { sx = 0.04; sy = 0.03; }
      rot = h5 * 6.28 + t * (3.0 + 5.0 * h6);
      alpha = S * smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.85, 1.0, u)) * 0.8;
    } else {
      // The ring puff: thrown radially outward over the first 0.4 s.
      let u = age / 0.4;
      if (u < 1.0) {
        let e = 1.0 - (1.0 - u) * (1.0 - u);
        let a = h1 * 6.28;
        let r = R * (0.15 + 1.15 * h2) * e;
        p = base + vec3f(cos(a) * r, 0.1 + 0.5 * h3 * sin(u * 3.14159), sin(a) * r);
        var kd = 5.0;
        if (meadow) { kd = select(5.0, 2.0, h7 < 0.5); } else { kd = select(5.0, 1.0, h7 < 0.35); }
        kind = kd;
        sx = 0.05 + 0.05 * h4 + 0.05 * u; sy = sx;
        if (kd > 1.5 && kd < 2.5) { sx = 0.03 + 0.03 * h4; sy = sx * 0.5; }
        if (kd < 1.5) { sx = 0.02; sy = 0.02; }
        rot = h5 * 6.28 + t * (3.0 + 5.0 * h6);
        alpha = (1.0 - u) * 0.7 * min(1.0, S * 6.0);
        if (kd > 4.5) { alpha *= 0.6; }
      }
    }
    if (S <= 0.0) { alpha = 0.0; }
  }

  let toCam = normalize(uniforms.cameraPosition - p);
  var wp = p;
  if (isLine) {
    let wd = cross(axisDir, toCam);
    let wdn = wd / max(length(wd), 1e-4);
    wp = p + axisDir * corner.x * sx + wdn * corner.y * sy;
  } else {
    let ax = normalize(cross(vec3f(0.0, 1.0, 0.0), toCam));
    let ay = normalize(cross(toCam, ax));
    let q = vec2f(corner.x * sx, corner.y * sy);
    let cr = cos(rot); let sr = sin(rot);
    let q2 = vec2f(cr * q.x - sr * q.y, sr * q.x + cr * q.y);
    wp = p + ax * q2.x + ay * q2.y;
  }
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (alpha < 0.002) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vUv = corner;
  vertexOutputs.vAlpha = alpha;
  vertexOutputs.vKind = kind;
  vertexOutputs.vSeed = h6;
  vertexOutputs.vWorldPos = p;
}
`;

export const galeFxFragmentWGSL = /* wgsl */ `
${ENV_DECL}
uniform galeT: vec4f;
varying vUv: vec2f;
varying vAlpha: f32;
varying vKind: f32;
varying vSeed: f32;
varying vWorldPos: vec3f;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let uv = fragmentInputs.vUv;
  let kind = fragmentInputs.vKind;
  let seed = fragmentInputs.vSeed;
  let ex = uniforms.fogParams.z * atmoExposure();
  let wp = fragmentInputs.vWorldPos;
  let t = uniforms.galeT.x;
  var outc = vec4f(0.0);
  if (kind < 0.5) {
    // A wind line: pale silver, fading in and out along its length, a soft thin core across it.
    let along = pow(max(1.0 - abs(uv.x), 0.0), 1.5);
    let across = exp(-uv.y * uv.y * 4.5);
    let a = along * across * fragmentInputs.vAlpha;
    if (a <= 0.001) { discard; }
    let lit = vec3f(0.8, 0.88, 1.0) * a * 5.0 / max(ex, 1e-6);
    outc = vec4f(displayTransform(lit, ex), 0.0);
  } else {
    var d = 0.0;
    var albedo = vec3f(0.92, 0.95, 1.0);
    var glint = 0.0;
    if (kind < 1.5) {
      // Snow sparkle: a tiny disc that twinkles.
      d = smoothstep(1.0, 0.3, dot(uv, uv));
      glint = pow(max(sin(t * 9.0 + seed * 60.0), 0.0), 12.0);
    } else if (kind < 2.5) {
      // A grass blade or straw: a pointed leaf.
      let w = max(1.0 - uv.x * uv.x, 0.05);
      d = smoothstep(1.0, 0.7, abs(uv.y) / w) * smoothstep(1.0, 0.8, abs(uv.x));
      albedo = mix(vec3f(0.26, 0.4, 0.11), vec3f(0.62, 0.54, 0.26), seed);
    } else if (kind < 3.5) {
      // A pale petal.
      d = smoothstep(1.0, 0.6, length(vec2f(uv.x * 0.9, uv.y)));
      albedo = mix(vec3f(0.95, 0.88, 0.9), vec3f(0.98, 0.95, 0.85), seed);
    } else {
      // A clump of powder, or a puff of dust.
      let r = length(uv);
      let n = noised(uv * 1.7 + wp.xz * 0.9 + vec2f(t * 0.1)).x;
      d = smoothstep(1.0, 0.2, r + 0.3 * n);
      if (kind > 4.5) { albedo = select(vec3f(0.9, 0.94, 1.0), vec3f(0.5, 0.45, 0.35), uniforms.galeT.w > 0.5); }
    }
    if (d <= 0.001) { discard; }
    let sky = shIrradiance(vec3f(0.0, 1.0, 0.0)) * uniforms.envMisc.w;
    let cosT = dot(normalize(wp - uniforms.cameraPosition), uniforms.keyDir);
    let phase = 0.3 + 1.6 * pow(max(cosT, 0.0), 4.0);
    let col = albedo * (sky + atmoKeyColor() * max(uniforms.keyDir.y + 0.1, 0.0) * phase / PI);
    let a = d * fragmentInputs.vAlpha;
    var lit = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(uniforms.cameraPosition - wp) * 0.001);
    lit += vec3f(1.0, 1.0, 1.05) * glint * 1.5 / max(ex, 1e-6);
    outc = vec4f(displayTransform(lit, ex) * a, a);
  }
  fragmentOutputs.color = outc;
}
`;
