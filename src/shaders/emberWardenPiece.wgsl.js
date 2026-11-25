// The Ember Warden's sculpted segments (tools/models/ember_warden.py; game/emberWarden/titan.js): the Shaped's piece
// path (the baked normal and occlusion, the scans laid over it in the segment's own frame), with its material: basalt
// crust (the lava-crust scan, retinted near-black), ash settled on what faces up and on the plates' crowns (the baked
// convexity), the cracks between the plates (the sculpt's feature mask) lit by the heat in the record's glow —
// dark red, orange, white — the plates themselves incandescent at the top of it. Obsidian (glow 2: bound by Frost) is
// black glass with the sky in it. The shackles on the rock (no piece: the clod) are obsidian too. A struck segment
// flares (kind's fraction).

import { shapedPieceFragmentWGSL } from './shaped.wgsl.js';

const DECL = /* wgsl */ `
var pieceMask: texture_2d<f32>;
var pieceMaskSampler: sampler;
`;

const MATERIAL = /* wgsl */ `
  var kind = i32(floor(fragmentInputs.vKind + 0.02));
  let hurt = clamp((fragmentInputs.vKind - f32(kind)) / 0.45, 0.0, 1.0);
  let ex = max(exposure, 1e-6);
  let gl = fragmentInputs.vGlow;
  let heat = clamp(gl, 0.0, 1.0);
  let obs = gl > 1.5 || kind == 21;
  // The baked mask: R convexity (0.5 flat), G cavity, B the cracks.
  let mk = select(vec4f(0.5, 1.0, 0.0, 1.0), textureSample(pieceMask, pieceMaskSampler, fragmentInputs.vAtlas), isPiece);
  let conv = mk.x; let cav = mk.y; let crack = mk.z;
  let H = normalize(L + V);
  let occ = pieceAO * mix(0.55, 1.0, cav);
  var col = vec3f(0.0);
  // (White only in the cracks' cores at the top of it; the plates' own glow stays yellow-orange — a whole white arm read
  // as a ghost.)
  let hc = mix(mix(vec3f(0.55, 0.06, 0.01), vec3f(1.0, 0.32, 0.05), smoothstep(0.2, 0.6, heat)), vec3f(1.0, 0.6, 0.2), smoothstep(0.7, 1.0, heat));
  let hcCore = mix(hc, vec3f(1.0, 0.9, 0.7), smoothstep(0.85, 1.0, heat));
  if (obs) {
    let F = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
    let R = reflect(-V, N);
    let refl = atmoSky(normalize(vec3f(R.x, max(R.y, 0.02), R.z)));
    col = vec3f(0.016, 0.015, 0.018) * (key * max(nl, 0.0) * vis / PI + sky * occ);
    col = col * (1.0 - F) + refl * (0.2 + 0.8 * F) * occ;
    col += key * pow(max(dot(N, H), 0.0), 160.0) * 2.0 * vis;
    col += vec3f(0.5, 0.06, 0.01) * crack * 0.04 / ex;
  } else {
    // Basalt: the scan's grain on a near-black crust; heat glazes it darker before it glows.
    var albedo = vec3f(0.06, 0.055, 0.052);
    if (isPiece) { albedo = albedo * clamp(pieceScan.albedo / max(matMean(pieceLayer), vec3f(0.02)), vec3f(0.5), vec3f(1.6)); }
    // Ash on what faces up and on the plates' crowns, not in the cracks; burnt off where it is hot.
    let ash = smoothstep(0.2, 0.7, N.y + 0.6 * (conv - 0.5)) * (1.0 - crack) * (1.0 - smoothstep(0.3, 0.7, heat));
    albedo = mix(albedo, vec3f(0.2, 0.195, 0.19), ash * 0.6);
    albedo *= 1.0 - 0.3 * heat;
    let diff = clamp((nl + 0.15) / 1.15, 0.0, 1.0);
    col = albedo * (key * diff * vis / PI + sky * occ);
    col += key * pow(max(dot(N, H), 0.0), 24.0) * 0.025 * vis * (1.0 - ash);
    // The glow: the cracks (always a little, the heat in the deep of them), then the plates' skin when white-hot.
    let k = (0.06 + 1.1 * heat * heat) * 0.7 / ex;
    // (The crack mask runs wide — the slabs' edges are in it: the colour stays the heat's; white only in the narrow core.)
    col += mix(hc, hcCore, smoothstep(0.75, 1.0, crack)) * crack * crack * (0.06 + 0.94 * heat) * k;
    col += hc * heat * heat * heat * 0.1 * (1.0 - cav * 0.5) * k;
  }
  if (hurt > 0.001) { col += vec3f(1.0, 0.55, 0.2) * hurt * (0.15 + 0.85 * crack) * 0.4 / ex; }
`;

const s0 = shapedPieceFragmentWGSL;
const a = s0.indexOf('  var kind = i32(floor(fragmentInputs.vKind + 0.02));');
const b = s0.indexOf('  col = atmoApply(');
const d = s0.indexOf('var pieceAtlasSampler: sampler;');
if (a < 0 || b < a || d < 0) throw new Error('emberWardenPiece.wgsl: the Shaped piece shader changed shape');
const dEnd = d + 'var pieceAtlasSampler: sampler;'.length;
export const emberWardenPieceFragmentWGSL = s0.slice(0, dEnd) + DECL + s0.slice(dEnd, a) + MATERIAL + s0.slice(b);
