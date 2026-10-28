// The Shaped's material chunks (BRIEF §8.3): lumps of packed snow, ice shards and a glowing ice
// core, one record per chunk (written by game/shaped/rig.js): (pos, sx), (fwd, sy), (up, sz),
// (seed, kind, glow, alpha). The vertex shader turns a unit icosphere into an irregular clod
// (shards taper to a point), scales it and hangs it on its bone; facets are flat (screen-space
// derivative normals). Readable telegraphs through material: as `glow` rises the core lights up
// and cracks across the snow glow cold blue (BRIEF §8.3). Kinds 4+ are the meadow's materials
// (sedge, turf, stone, reed, seed-pod, awn, root): same pipeline, lit warm, cores glow seed-amber.

import { ENV_DECL, COMMON_WGSL } from './common.wgsl.js';
import { ATMO_MATERIAL_WGSL } from './atmoMaterial.wgsl.js';
import { SHADOW_RECEIVE_WGSL } from './shadows.wgsl.js';

export const shapedVertexWGSL = /* wgsl */ `
attribute position: vec3f;          // unit icosphere vertex
attribute uv: vec2f;                // x = chunk record index
uniform viewProjection: mat4x4f;
var<storage, read> chunkData: array<vec4f>;
varying vWorldPos: vec3f;
varying vLocal: vec3f;
varying vKind: f32;
varying vGlow: f32;
varying vSeed: f32;

fn hs(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(12.9898, 78.233, 37.719))) * 43758.5453); }

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let ci = u32(vertexInputs.uv.x + 0.5);
  let a = chunkData[ci * 4u]; let b = chunkData[ci * 4u + 1u]; let c = chunkData[ci * 4u + 2u]; let d = chunkData[ci * 4u + 3u];
  let seed = d.x; let kind = d.y;
  var v = vertexInputs.position;
  // An irregular clod: each vertex pushed in or out by a hash of its direction and the seed.
  v *= 0.78 + 0.36 * hs(v * 3.1 + seed);
  if (kind > 0.5 && kind < 1.5) {
    // Shard: a long tapered prism-like lump, pointed toward +y.
    v = vec3f(v.x * (1.0 - 0.75 * max(v.y, 0.0)), v.y, v.z * (1.0 - 0.75 * max(v.y, 0.0)));
  }
  // Meadow kinds (4 sedge, 5 turf, 6 stone, 7 reed, 8 pod, 9 awn, 10 root).
  let mk = i32(floor(kind + 0.02));
  if (mk == 4 || mk == 7) {
    // Bundles pinch toward their ends (sedge a little, reed stalks more).
    let pinch = select(0.3, 0.5, mk == 7);
    v = vec3f(v.x * (1.0 - pinch * abs(v.z)), v.y * (1.0 - pinch * abs(v.z)), v.z);
  } else if (mk == 6 || mk == 12 || mk == 13) {
    // Drystone / sandstone / ruin plate: a slab, cube-ish with chipped corners.
    v = sign(v) * pow(abs(v), vec3f(0.6)) * 0.82 * (0.92 + 0.12 * hs(v * 2.3 + seed));
  } else if (mk == 9 || mk == 14) {
    // Awn / sandstone thorn: a spike tapering to a point trailing backward (-z).
    let t = 1.0 - 0.85 * max(-v.z, 0.0);
    v = vec3f(v.x * t, v.y * t, v.z);
  } else if (mk == 15) {
    v=vec3f(v.x*(1.0-0.5*max(v.y,0.0)),v.y,v.z*(1.0-0.5*max(v.y,0.0)));
  } else if (mk == 10) {
    // Root strand: pointed at the bottom, hanging.
    let t = 1.0 - 0.8 * max(-v.y, 0.0);
    v = vec3f(v.x * t, v.y, v.z * t);
  }
  let local = v * vec3f(a.w, b.w, c.w) * 0.5;
  let f = b.xyz; let u = c.xyz; let r = cross(u, f);
  // A small per-chunk twist so clusters do not line up.
  let tw = (hs(vec3f(seed, 1.0, 2.0)) - 0.5) * 0.8;
  let ct = cos(tw); let st = sin(tw);
  let lx = local.x * ct - local.z * st; let lz = local.x * st + local.z * ct;
  let wp = a.xyz + r * lx + u * local.y + f * lz;
  vertexOutputs.position = uniforms.viewProjection * vec4f(wp, 1.0);
  if (d.w < 0.5) { vertexOutputs.position = vec4f(0.0, 0.0, -2.0, 1.0); }
  vertexOutputs.vWorldPos = wp;
  vertexOutputs.vLocal = v;
  vertexOutputs.vKind = kind;
  vertexOutputs.vGlow = d.z;
  vertexOutputs.vSeed = seed;
}
`;

export const shapedFragmentWGSL = /* wgsl */ `
${ENV_DECL}
varying vWorldPos: vec3f;
varying vLocal: vec3f;
varying vKind: f32;
varying vGlow: f32;
varying vSeed: f32;
${COMMON_WGSL}
${ATMO_MATERIAL_WGSL}
${SHADOW_RECEIVE_WGSL}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wp = fragmentInputs.vWorldPos;
  let camPos = uniforms.cameraPosition;
  let V = normalize(camPos - wp);
  // Flat facets.
  var N = normalize(cross(dpdx(wp), dpdy(wp)));
  if (dot(N, V) < 0.0) { N = -N; }
  let L = uniforms.keyDir;
  let key = atmoKeyColor();
  let vis = shadowVisibility(wp, N, camPos, fragmentInputs.position.xy);
  let nl = dot(N, L);
  let nv = clamp(dot(N, V), 0.0, 1.0);
  let sky = shIrradiance(N) * uniforms.envMisc.w;
  let exposure = uniforms.fogParams.z * atmoExposure();
  // Glow channel: telegraph 0..1, +2 when the creature is frozen solid.
  let frozen = fragmentInputs.vGlow > 1.5;
  var kind = i32(floor(fragmentInputs.vKind + 0.02));
  let hurt = clamp((fragmentInputs.vKind - f32(kind)) / 0.45, 0.0, 1.0);
  if (frozen && (kind == 0 || kind == 3)) { kind = 1; } // glazed over: all ice (a frozen joint too)
  let cold = vec3f(0.62, 0.86, 1.32) / 0.84;
  var col = vec3f(0.0);
  let meadow = kind >= 4;
  if (meadow) {
    // Meadow materials (variant by chunk kind): lit by the plain sky (no frost tint).
    let lv = fragmentInputs.vLocal; let sd = fragmentInputs.vSeed;
    let up = clamp(N.y, 0.0, 1.0);
    let under = mix(0.5, 1.0, smoothstep(-0.9, 0.4, lv.y));
    var albedo = vec3f(0.4);
    var trans = 0.0;
    if (kind == 4 || kind == 9) {
      // Plaited sedge / awn: fibrous stripes along the strand, straw-green into dry gold.
      let n = noised(vec2f(lv.x * 3.0 + sd, lv.y * 2.0)).x;
      let fib = 0.5 + 0.5 * sin((lv.x + lv.y * 0.5) * 38.0 + sd * 3.0 + n * 2.0);
      let dry = clamp(fract(sd * 0.137) * 1.4 - 0.2 + n * 0.25, 0.0, 1.0);
      albedo = mix(vec3f(0.30, 0.38, 0.13), vec3f(0.70, 0.55, 0.24), dry) * (0.72 + 0.4 * fib);
      if (kind == 9) { albedo = mix(albedo, vec3f(0.80, 0.68, 0.34), 0.5); }
      trans = 0.25;
    } else if (kind == 5) {
      // Turf sod: grass on top (by up-facing), soil on the sides, darker undersides.
      let tuft = noised(wp.xz * 11.0 + vec2f(sd, 0.0)).x;
      let grass = vec3f(0.19, 0.34, 0.09) * (0.8 + 0.3 * tuft);
      let soil = vec3f(0.19, 0.12, 0.07) * (0.8 + 0.25 * noised(wp.xz * 7.0 + wp.y * 5.0 + vec2f(sd, 3.0)).x);
      albedo = mix(soil, grass, smoothstep(0.35, 0.75, N.y + 0.15 * tuft));
      trans = 0.12 * up;
    } else if (kind == 6) {
      // Drystone: grey slab, lichen blotches pale yellow-green, most on the up-facing sides.
      let st = 0.9 + 0.2 * noised(lv.xy * 6.0 + vec2f(sd, 1.0)).x;
      let lich = smoothstep(0.1, 0.45, noised(wp.xz * 3.5 + wp.y * 2.0 + vec2f(sd, 5.0)).x + 0.25 * up);
      albedo = mix(vec3f(0.40, 0.40, 0.38) * st, vec3f(0.50, 0.54, 0.28), lich * 0.7);
    } else if (kind == 7) {
      // Reed: pale tan stalks, fine stripes and nodes along the bundle.
      let fib = 0.5 + 0.5 * sin((lv.x + lv.y) * 46.0 + sd * 2.0);
      let node = smoothstep(0.85, 1.0, sin(lv.z * 9.0 + sd));
      albedo = mix(vec3f(0.58, 0.48, 0.30), vec3f(0.74, 0.66, 0.45), fib) * (1.0 - 0.25 * node);
      trans = 0.2;
    } else if (kind == 8) {
      // Seed-pod husk around the amber light.
      albedo = vec3f(0.50, 0.27, 0.09);
      trans = 0.3;
    } else if (kind == 11) {
      // Packed sand: warm, fine-grained, drifted in faint ripples; paler on top where the wind has dried it.
      let gr = noised(wp.xz * 14.0 + vec2f(sd, 0.0)).x;
      let rip = 0.5 + 0.5 * sin(lv.y * 14.0 + gr * 3.0 + sd);
      albedo = mix(vec3f(0.60, 0.45, 0.27), vec3f(0.78, 0.63, 0.40), clamp(up * 0.7 + 0.25 * gr + 0.15 * rip, 0.0, 1.0));
      trans = 0.18 * up;
    } else if (kind == 12 || kind == 14) {
      // Sandstone: banded strata (rust, buff, cream), the bands wandering with the stone; thorns are the darker ends.
      let wob = noised(vec2f(lv.x * 2.5 + sd, lv.z * 2.5)).x;
      let band = 0.5 + 0.5 * sin((lv.y + wob * 0.35) * 13.0 + sd * 0.7);
      let thin = 0.5 + 0.5 * sin((lv.y + wob * 0.2) * 41.0 + sd);
      albedo = mix(vec3f(0.50, 0.27, 0.15), vec3f(0.80, 0.62, 0.40), band) * (0.88 + 0.16 * thin);
      if (kind == 14) { albedo = albedo * 0.82; }
    } else if (kind == 13) {
      // Ruin plate: pale carved limestone, dark incised lines (a stepped glyph band and edge rules), wind-polished, rust streaks.
      let g = lv.xz * 5.0 + vec2f(sd, 0.0);
      let cell = abs(fract(g) - 0.5);
      let step = smoothstep(0.42, 0.48, max(cell.x, cell.y)) * (1.0 - smoothstep(0.0, 0.2, abs(lv.z) - 0.55));
      let edge = smoothstep(0.78, 0.92, max(abs(lv.x), abs(lv.z)));
      let wear = noised(wp.xz * 6.0 + vec2f(sd, 2.0)).x;
      var stone = mix(vec3f(0.62, 0.55, 0.43), vec3f(0.74, 0.68, 0.55), 0.5 + 0.5 * wear);
      stone = mix(stone, vec3f(0.55, 0.33, 0.20), clamp(0.35 * (0.5 - wear) + 0.2 * (1.0 - up) - 0.05, 0.0, 0.4));
      albedo = stone * (1.0 - 0.45 * max(step, edge * 0.7));
    } else {
      // Root: thin, dark, ropy.
      albedo = vec3f(0.11, 0.075, 0.045) * (0.7 + 0.6 * (0.5 + 0.5 * sin(lv.y * 30.0 + sd)));
    }
    let diff = clamp((nl + 0.25) / 1.25, 0.0, 1.0);
    col = albedo * (key * (diff * vis + trans * pow(1.0 - nv, 2.0)) / PI + sky * under);
    if(kind==15){
      // Dense amber glass: absorption through thickness, atmospheric reflection and sharp facets.
      // This is an opaque solid in the shared shadow-casting path; no scene-copy refraction pass.
      let R=reflect(-V,N);let F=0.045+0.955*pow(1.0-nv,5.0);
      let reflected=atmoSky(normalize(vec3f(R.x,max(R.y,0.02),R.z)));
      let absorb=exp(-vec3f(0.8,1.5,2.8)*(0.35+0.65*(1.0-nv)));
      let T=refract(-V,N,1.0/1.46);
      let transmitted=atmoSky(normalize(vec3f(T.x,max(abs(T.y),0.02),T.z)));
      col=mix(absorb*(transmitted*0.3+sky*0.18+key*max(nl,0.0)*vis/PI*.12),reflected,F*.85);
      col+=key*pow(max(dot(N,normalize(L+V)),0.0),160.0)*vis*1.4;
    }
    if (frozen) {
      // Crystallize: an icy glaze over the meadow (cold tint, sky in the facets, edge glints).
      let F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
      let R = reflect(-V, N);
      let Hf = normalize(L + V);
      let ice = vec3f(0.42, 0.68, 0.82) * (key * clamp(nl * 0.5 + 0.5, 0.0, 1.0) * vis / PI + sky * cold);
      col = mix(col, ice, 0.6) + atmoSky(normalize(vec3f(R.x, max(R.y, 0.02), R.z))) * max(F, 0.1) * 0.6;
      col += key * pow(max(dot(N, Hf), 0.0), 120.0) * 2.0 * vis;
    }
  } else if (kind == 3) {
    // A water joint: liquid held in the body by the Warden's stillness — churning, glossy, lit
    // from within (the target: freeze it, then break it).
    let t = fragmentInputs.vGlow * 3.0;               // the joint's pulse (the Warden's clock)
    let churn = noised(fragmentInputs.vLocal.xz * 2.5 + vec2f(t * 0.7, -t * 0.5)).x;
    let F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
    let R = reflect(-V, normalize(N + vec3f(churn * 0.3, 0.0, churn * 0.3)));
    col = atmoSky(normalize(vec3f(R.x, max(R.y, 0.02), R.z))) * F + vec3f(0.1, 0.3, 0.4) * sky * cold;
    let H = normalize(L + V);
    col += key * pow(max(dot(N, H), 0.0), 200.0) * 4.0 * vis;
    col += vec3f(0.3, 0.75, 1.0) * (0.55 + 0.25 * churn) * (0.6 + 0.4 * fragmentInputs.vGlow) / max(exposure, 1e-6) * 0.5;
  } else if (kind == 0) {
    // Packed rime: denser and greyer-blue than the fresh snow it rose from (so it reads against
    // it), wrapped diffuse, a cold subsurface glow in shade, undersides and crevices darker.
    let grain = noised(wp.xz * 9.0 + vec2f(fragmentInputs.vSeed, 0.0)).x;
    let albedo = vec3f(0.55, 0.63, 0.74) * (0.9 + 0.1 * grain);
    let under = mix(0.45, 1.0, smoothstep(-0.9, 0.4, fragmentInputs.vLocal.y));
    let diff = clamp((nl + 0.3) / 1.3, 0.0, 1.0);
    let sss = vec3f(0.38, 0.62, 1.0) * (0.14 * (1.0 - vis * clamp(nl, 0.0, 1.0)) + 0.06 * pow(1.0 - nv, 2.0));
    col = albedo * (key * (diff * vis + sss) / PI + sky * cold * under);
    // Icy rim: the silhouette catches the sky (separates the creature from the snowfield).
    col += sky * cold * vec3f(0.5, 0.7, 0.9) * pow(1.0 - nv, 3.0) * 0.6;
  } else {
    // Ice (shards, core): glossy, sky in its facets, cyan through its body.
    let F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
    let R = reflect(-V, N);
    let refl = atmoSky(normalize(vec3f(R.x, max(R.y, 0.02), R.z)));
    var body = select(vec3f(0.3, 0.52, 0.62), vec3f(0.12, 0.24, 0.34), kind == 2);
    if (frozen && kind != 2) { body = vec3f(0.42, 0.68, 0.82); }    // glazed: bright, clear cyan
    col = body * (key * clamp(nl * 0.5 + 0.5, 0.0, 1.0) * vis / PI + sky * cold) * (1.0 - F) + refl * max(F, select(0.0, 0.12, frozen));
    let H = normalize(L + V);
    col += key * pow(max(dot(N, H), 0.0), 300.0) * 5.0 * vis;
    if (frozen) {
      // Glazed ice: glints on every facet edge and a pale inner light.
      col += key * pow(max(dot(N, H), 0.0), 40.0) * 0.6 * vis;
      col += vec3f(0.4, 0.7, 1.0) * 0.05 / max(exposure, 1e-6) * (0.4 + 0.6 * nv);
    }
  }
  // Telegraph: the core lights from within and cracks glow across the snow (display-referred).
  // A faint living light in the core at all times; the telegraph floods it.
  let isPod = kind == 2 || kind == 8;
  let g = max(fragmentInputs.vGlow - select(0.0, 2.0, frozen), select(0.0, 0.18, isPod));
  if (g > 0.001) {
    let glowCol = select(vec3f(0.45, 0.78, 1.0), vec3f(1.0, 0.62, 0.22), meadow); // seed-amber
    if (isPod) { col += glowCol * g * 0.9 / max(exposure, 1e-6); }
    else {
      let n = noised(fragmentInputs.vLocal.xz * 5.0 + fragmentInputs.vLocal.y * 3.0 + vec2f(fragmentInputs.vSeed)).x;
      let crack = 1.0 - smoothstep(0.0, 0.08, abs(n));
      col += glowCol * g * crack * 0.6 / max(exposure, 1e-6);
    }
  }
  if(frozen && kind==15){
    let crackNoise=noised(fragmentInputs.vLocal.xz*4.0+fragmentInputs.vLocal.y*2.0+vec2f(fragmentInputs.vSeed)).x;
    let vein=1.0-smoothstep(0.01,0.07,abs(crackNoise));
    col+=vec3f(0.55,0.8,1.0)*vein*0.12/max(exposure,1e-6);
  }
  // Hurt flash (kind's fraction): the struck body whitens and its rim burns cold for an instant.
  if (hurt > 0.001) {
    col = mix(col, select(vec3f(0.85, 0.93, 1.0), vec3f(1.0, 0.9, 0.72), meadow) * (sky + key * 0.25), hurt * 0.55);
    col += select(vec3f(0.5, 0.8, 1.0), vec3f(1.0, 0.68, 0.3), meadow) * hurt * (0.25 + 0.75 * pow(1.0 - nv, 2.0)) * 0.35 / max(exposure, 1e-6);
  }
  col = atmoApply(col, fragmentInputs.position.xy * uniforms.screenInfo.zw, length(camPos - wp) * 0.001);
  var outc = displayTransform(col, exposure);
  fragmentOutputs.color = vec4f(outc, 0.0); // alpha: SSR weight (none)
}
`;
