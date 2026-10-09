// Ground cover (PLAN.md Phase 8 M4c; art bar: screenshots/reference/forest-ruins-target.webp — the
// floor is never bare). Stateless like the grass: one static mesh whose vertices only carry (item,
// card, vertex); the vertex shader picks what grows in the item's world cell and builds it from
// cards on the ground-cover atlas (render/groundAtlas.js):
//   under the crowns (canopyAt)  drifts of fallen leaves, needle litter, twigs, ferns, sorrel, moss
//   at the forest's edge         bracken, ferns
//   in the open meadow           flower clumps (daisy, buttercup, bellflower), clover, plantain,
//                                pebbles on worn ground
// in noise patches, so kinds gather the way plants do. Ferns and flowers lean away from the Wraith
// (the grass's push trail). Items shrink away toward the ring's edge; the ground's own forest-floor
// and turf scans carry on beyond it.

import { ENV_DECL, COMMON_WGSL, SPELL_LIGHT_DECL, SPELL_LIGHT_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';
import { FIELD_WGSL } from './grass.wgsl.js';
import { GC } from '../render/groundAtlas.js';

/** Ring: cell (m), grid (cells per side); cards per item; segments per card. */
export const GC_RING = { cell: 0.6, n: 84, cards: 8, seg: 4 };
export const gcVertsPerCard = (seg) => (seg + 1) * 2;

const ATLAS_UV = /* wgsl */ `
fn gcUv(uv: vec2f, cell: f32) -> vec2f {
  let c = floor(cell + 0.5);
  let col = c - 4.0 * floor(c / 4.0); let row = floor(c / 4.0);
  return vec2f((col + 0.01 + uv.x * 0.98) / 4.0, (row + 0.99 - uv.y * 0.98) / 4.0);
}
`;

export const gcVertexWGSL = /* wgsl */ `
attribute position: vec3f;           // x = item, y = card, z = vertex in card (row*2 + side)
uniform viewProjection: mat4x4f;
uniform cameraPosition: vec3f;
uniform levels: array<vec4f,16>;
uniform gcParams: vec4f;             // x = time, y = wind strength, z = cell (m), w = grid
uniform grassPush: array<vec4f,8>;
var<storage, read> levelData: array<vec4f>;
var<storage, read> biomeA: array<u32>;
var<storage, read> windMap: array<u32>;
var canopyTex: texture_2d<f32>;
var canopyTexSampler: sampler;
varying vUv: vec2f;
varying vCell: f32;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vTint: vec3f;                // x = hue shift, y = value, z = translucency
varying vAo: f32;

${FIELD_WGSL}

fn gcCanopy(p: vec2f) -> f32 { return textureSampleLevel(canopyTex, canopyTexSampler, (p + 4096.0) / 8192.0, 0.0).r; }

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let item = u32(vertexInputs.position.x + 0.5);
  let card = u32(vertexInputs.position.y + 0.5);
  let vtx = u32(vertexInputs.position.z + 0.5);
  let cell = uniforms.gcParams.z; let n = u32(uniforms.gcParams.w);
  let cam = uniforms.cameraPosition;
  let c0 = vec2i(floor(cam.xz / cell)) - vec2i(i32(n / 2u));
  let gx = c0.x + i32(item % n); let gz = c0.y + i32(item / n);
  let h1 = gh2(gx, gz, 101u); let h2 = gh2(gx, gz, 102u); let h3 = gh2(gx, gz, 103u); let h4 = gh2(gx, gz, 104u);
  let root = vec2f((f32(gx) + 0.15 + 0.7 * h1) * cell, (f32(gz) + 0.15 + 0.7 * h2) * cell);
  let half = f32(n) * 0.5 * cell;
  let dc = max(abs(root.x - cam.x), abs(root.y - cam.z));
  let edge = 1.0 - smoothstep(half * 0.7, half * 0.96, dc);

  // What grows here.
  let mw = gMeadow(root.x, root.y);
  let canopy = gcCanopy(root);
  let forest = smoothstep(0.15, 0.55, canopy);
  let rim = forest * (1.0 - forest) * 4.0;               // the forest's edge
  let open = (1.0 - forest) * smoothstep(0.5, 0.8, mw);
  let gy = gGround(root.x, root.y);
  let gyx = gGround(root.x + 0.6, root.y); let gyz = gGround(root.x, root.y + 0.6);
  let slope = length(vec2f(gyx - gy, gyz - gy)) / 0.6;
  let pFern = vn(root * 0.07 + 11.0); let pFlower = vn(root * 0.05 + 23.0); let pClover = vn(root * 0.09 + 37.0);
  let pine = smoothstep(290.0, 360.0, gy);
  var w = array<f32, 9>(
    forest * 1.4,                                          // 0 leaf drift / needles
    forest * 0.12,                                         // 1 twig
    (forest * 0.5 + rim * 0.5) * smoothstep(0.35, 0.65, pFern), // 2 fern
    forest * 0.22 * smoothstep(0.4, 0.7, pClover),         // 3 sorrel
    forest * 0.18 * smoothstep(0.5, 0.75, 1.0 - pFern),    // 4 moss
    rim * 0.35,                                            // 5 bracken (the forest's edge)
    open * 0.95 * smoothstep(0.38, 0.62, pFlower),         // 6 flowers
    open * 0.4 * smoothstep(0.4, 0.7, pClover),            // 7 clover / plantain
    open * 0.012 + smoothstep(0.4, 0.65, slope) * 0.2 * (1.0 - forest), // 8 pebbles (worn, steeper ground)
  );
  var sum = 0.0;
  for (var i = 0; i < 9; i++) { w[i] *= step(0.3, mw); sum += w[i]; }
  // Empty weight: the meadow's ground cover is patchy, the forest floor full.
  let r = h3 * (sum + 0.55 + 0.6 * (1.0 - forest));
  var kind = -1;
  var acc = 0.0;
  for (var i = 0; i < 9; i++) { acc += w[i]; if (kind < 0 && r < acc) { kind = i; } }
  if (slope > 1.2) { kind = -1; }

  // The card: base, along (spine direction per segment), across, size, atlas cell, curve.
  let S = 4.0;
  let row = f32(vtx / 2u); let side = select(-1.0, 1.0, (vtx & 1u) == 1u);
  let t = row / S;
  let hk = gh2(gx, gz, 200u + card * 13u); let hk2 = gh2(gx, gz, 201u + card * 13u); let hk3 = gh2(gx, gz, 202u + card * 13u);
  var used = false;
  var p = vec3f(0.0);
  var nrm = vec3f(0.0, 1.0, 0.0);
  var cellId = 0.0;
  var tint = vec3f(0.0, 1.0, 0.0);
  var ao = 1.0;
  var flex = 0.0;                                         // how much the push and the wind move it
  let up = vec3f(0.0, 1.0, 0.0);
  let gN = normalize(vec3f(gy - gyx, 0.6, gy - gyz));
  if (kind == 0 || kind == 1 || kind == 3 || kind == 4 || kind == 7 || kind == 8) {
    // Flat cards on the ground (following its slope), slightly curled at the edges.
    var cards = 3u; var size = 0.55 + 0.3 * hk; var spread = 0.3;
    if (kind == 0) { cellId = select(select(${GC.LEAVES_OAK}.0, ${GC.LEAVES_MIXED}.0, h4 < 0.4), ${GC.NEEDLES}.0, h4 < pine * 0.9); }
    if (kind == 1) { cards = 2u; cellId = select(${GC.TWIG}.0, ${GC.LEAVES_MIXED}.0, card == 1u); size = select(0.8 + 0.4 * hk, 0.5, card == 1u); }
    if (kind == 3) { cards = 2u; cellId = ${GC.SORREL}.0; size = 0.4 + 0.15 * hk; }
    if (kind == 4) { cards = 1u; cellId = ${GC.MOSS}.0; size = 0.5 + 0.3 * hk; spread = 0.1; }
    if (kind == 7) { cards = 2u; cellId = select(${GC.CLOVER}.0, ${GC.PLANTAIN}.0, h4 < 0.35); size = select(0.45 + 0.2 * hk, 0.3 + 0.12 * hk, h4 < 0.35); }
    if (kind == 8) { cards = 1u; cellId = ${GC.PEBBLES}.0; size = 0.45 + 0.25 * hk; }
    if (card < cards) {
      used = true;
      let yaw = hk2 * 6.2831853;
      let fwd = vec3f(cos(yaw), 0.0, sin(yaw)); let rgt = vec3f(-sin(yaw), 0.0, cos(yaw));
      let off = (vec2f(hk3, gh2(gx, gz, 203u + card * 13u)) - 0.5) * spread * 2.0;
      let base = vec2f(root.x + off.x, root.y + off.y);
      let along = (t - 0.5) * size; let acr = side * 0.5 * size;
      let q = base + fwd.xz * along + rgt.xz * acr;
      // Height on the ground plane through the item (its slope), lifted a little per card, the
      // edges curled (leaves) or a rosette's tips raised (plantain).
      let lift = 0.012 + f32(card) * 0.006 + select(0.0, 0.05, kind == 7 && h4 < 0.35) * (abs(t - 0.5) * 2.0 + abs(side)) * 0.5;
      let curl = (abs(t - 0.5) * 2.0) * (abs(t - 0.5) * 2.0) * 0.03 * f32(kind == 0);
      let y = gy + dot(q - root, vec2f(gyx - gy, gyz - gy) / 0.6) + lift + curl;
      p = vec3f(q.x, y, q.y);
      nrm = normalize(gN + vec3f((hk - 0.5) * 0.2, 0.0, (hk2 - 0.5) * 0.2));
      tint = vec3f((hk3 - 0.5) * 0.08, 0.85 + 0.3 * hk, 0.15);
      ao = select(0.9, 0.75, card == 0u);
    }
  } else if (kind == 2 || kind == 5) {
    // Fern / bracken: fronds radiating from the crown, arching up and over.
    let fronds = select(7u, 5u, kind == 5);
    if (card < fronds) {
      used = true;
      cellId = select(select(${GC.FERN}.0, ${GC.FERN_YOUNG}.0, hk < 0.3), ${GC.BRACKEN}.0, kind == 5 && h4 < 0.6);
      let L = (0.75 + 0.7 * h4) * (0.8 + 0.4 * hk) * select(1.0, 1.25, kind == 5);
      let yaw = (f32(card) + hk2 * 0.6) / f32(fronds) * 6.2831853 + h1 * 6.28;
      let dir = vec3f(cos(yaw), 0.0, sin(yaw));
      let rise = 0.55 + 0.3 * hk3;
      // Spine: out along dir, up then over (the tip droops).
      let sp = dir * L * t * 0.85 + up * L * (sin(t * 2.6) * rise * 0.6 - t * t * 0.2);
      let tan = normalize(dir * 0.85 + up * L * (cos(t * 2.6) * 2.6 * rise * 0.6 - 2.0 * t * 0.2) / L);
      let acrossV = normalize(cross(tan, up) + vec3f(1e-4, 0.0, 0.0));
      let W = L * 0.42 * (1.0 - 0.1 * t);
      p = vec3f(root.x, gy, root.y) + sp + acrossV * side * W * 0.5;
      nrm = normalize(cross(acrossV, tan) * select(1.0, -1.0, cross(acrossV, tan).y < 0.0) + up * 0.3);
      tint = vec3f((hk3 - 0.5) * 0.06, 0.95 + 0.25 * hk, 0.6);
      ao = mix(0.55, 1.0, smoothstep(0.0, 0.5, t));
      flex = t * t * L;
    }
  } else if (kind == 6) {
    // Flower clump: up to four stems (vertical cards) with heads (small cards facing up and out).
    let stems = 2u + u32(h4 * 3.0);
    let species = floor(pFlower * 7.0 + h4 * 1.5) % 3.0;  // patches of one kind
    let si = card / 2u;
    if (si < stems) {
      used = true;
      let hs = gh2(gx, gz, 300u + si * 7u); let hs2 = gh2(gx, gz, 301u + si * 7u); let hs3 = gh2(gx, gz, 302u + si * 7u);
      let base = root + (vec2f(hs, hs2) - 0.5) * 0.35;
      let H = 0.38 + 0.4 * hs3;                           // above the meadow grass
      let yaw = hs * 6.2831853;
      let fwd = vec3f(cos(yaw), 0.0, sin(yaw));
      let lean = vec3f(sin(hs2 * 6.0), 0.0, cos(hs2 * 6.0)) * 0.12;
      let bgy = gGround(base.x, base.y);
      if (species > 1.5) {
        // Bellflower: the whole spray on one card.
        if ((card & 1u) == 0u) {
          cellId = ${GC.BELL}.0;
          p = vec3f(base.x, bgy, base.y) + (up + lean * t) * H * 1.3 * t + fwd * side * 0.16;
          nrm = normalize(cross(fwd, up) + up * 0.3);
        } else { used = false; }
      } else if ((card & 1u) == 0u) {
        cellId = ${GC.STEM}.0;
        p = vec3f(base.x, bgy, base.y) + (up + lean * t) * H * t + fwd * side * 0.035;
        nrm = normalize(cross(fwd, up) + up * 0.3);
      } else {
        cellId = select(${GC.DAISY}.0, ${GC.BUTTERCUP}.0, species > 0.5);
        let hsz = select(0.1, 0.075, species > 0.5) * (0.8 + 0.4 * hs);
        let top = vec3f(base.x, bgy, base.y) + (up + lean) * H;
        // Face up, tilted a little to the stem's lean.
        let ax = normalize(fwd + up * 0.25); let az = normalize(cross(ax, up));
        p = top + ax * (t - 0.5) * hsz * 2.0 + az * side * hsz;
        nrm = normalize(up + lean * 2.0);
      }
      tint = vec3f((hs3 - 0.5) * 0.04, 0.9 + 0.2 * hs, 0.6);
      ao = mix(0.6, 1.0, t);
      flex = select(H, H * t, (card & 1u) == 0u);
    }
  }
  if (!used || kind < 0 || edge <= 0.0) {
    vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0);
    vertexOutputs.vUv = vec2f(0.0); vertexOutputs.vCell = 0.0; vertexOutputs.vWorldPos = vec3f(0.0);
    vertexOutputs.vNormal = vec3f(0.0, 1.0, 0.0); vertexOutputs.vTint = vec3f(0.0); vertexOutputs.vAo = 0.0;
    return vertexOutputs;
  }
  // Shrink toward the ring's edge (about the item's root).
  p = vec3f(root.x, gy, root.y) + (p - vec3f(root.x, gy, root.y)) * edge;
  // Wind and the Wraith's push move the upright things (ferns, flowers).
  if (flex > 0.0) {
    let wd = gWind(root.x, root.y);
    let tm = uniforms.gcParams.x;
    let sway = sin(tm * 1.7 + dot(root, wd) * 0.3 + h1 * 6.28) * 0.06 * uniforms.gcParams.y;
    var pv = vec2f(0.0);
    for (var i = 0u; i < 8u; i++) {
      let P = uniforms.grassPush[i];
      if (P.w <= 0.0) { continue; }
      let dv = root - P.xz; let d = length(dv);
      if (d < 1.1 && abs(gy - P.y) < 2.5) { let k = 1.0 - d / 1.1; pv += dv / max(d, 0.05) * k * P.w; }
    }
    let pl = length(pv); if (pl > 1.0) { pv /= pl; }
    let mv = (wd * sway + pv * 0.7) * flex;
    p += vec3f(mv.x, -length(mv) * 0.3, mv.y);
  }
  vertexOutputs.position = uniforms.viewProjection * vec4f(p, 1.0);
  vertexOutputs.vUv = vec2f(side * 0.5 + 0.5, t);
  vertexOutputs.vCell = cellId;
  vertexOutputs.vWorldPos = p;
  vertexOutputs.vNormal = nrm;
  vertexOutputs.vTint = tint;
  vertexOutputs.vAo = ao;
}
`;

export const gcFragmentWGSL = /* wgsl */ `
${ENV_DECL}
${SPELL_LIGHT_DECL}
var gcAtlas: texture_2d<f32>;
var gcAtlasSampler: sampler;
varying vUv: vec2f;
varying vCell: f32;
varying vWorldPos: vec3f;
varying vNormal: vec3f;
varying vTint: vec3f;
varying vAo: f32;
${COMMON_WGSL}
${SPELL_LIGHT_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}
${ATLAS_UV}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let a = textureSample(gcAtlas, gcAtlasSampler, gcUv(fragmentInputs.vUv, fragmentInputs.vCell));
  if (a.a < 0.5) { discard; }
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  var N = normalize(fragmentInputs.vNormal);
  if (dot(N, V) < 0.0) { N = -N; }
  N = normalize(vec3f(N.x, max(N.y, 0.2), N.z));
  let tn = fragmentInputs.vTint;
  var albedo = a.rgb * tn.y;
  albedo = albedo * (1.0 + vec3f(tn.x, tn.x * 0.4, -tn.x));
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let vis = shadowVisibilityFast(wp, camPos);
  let canopy = canopyAt(wp.xz);
  let ao = fragmentInputs.vAo;
  let diff = clamp((dot(N, L) + 0.25) / 1.25, 0.0, 1.0);
  let sky = shIrradiance(N) * uniforms.envMisc.w * ao * canopySky(canopy);
  var col = albedo * (key * diff * vis / PI + sky + canopyFill(canopy, N) * ao);
  // Light through thin leaves and petals toward the sun.
  let back = pow(clamp(dot(-V, L), 0.0, 1.0), 3.0) * tn.z;
  col += key * albedo * vec3f(1.0, 1.15, 0.7) * back * vis * 0.4;
  let ex = uniforms.fogParams.z * atmoExposure();
  col += spellLit(wp, N, albedo, 0.3, ex);
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  fragmentOutputs.color = vec4f(displayTransform(col, ex), 0.0);
}
`;
