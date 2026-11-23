// The Veiled's cloth solver (character/wraith/clothGpu.js): one workgroup per figure, the same
// Verlet as character/wraith/cloth.js (integrate with frame damping and air drag, distance
// constraints, one-sided tethers, capsule colliders twice an iteration, the ground for the hem),
// then the packing the cloth vertex shader reads (shaders/cloth.wgsl.js: pos + garment/occlusion,
// normal + thinness). Constraints run colour by colour (no particle twice in a colour), so each
// colour is solved in parallel in place: Gauss-Seidel between colours, as near the CPU's sweep as
// a GPU gets. Positions are relative to a per-figure origin the CPU moves with the body.

/** @param {{ N: number, nPins: number, colors: number }} topo */
export function clothSolveWGSL(topo) {
  return /* wgsl */ `
struct Part {
  w: f32, ground: u32, mask: u32, garment: u32,
  flip: f32, thin: f32, layerTop: f32, tetherA: i32,
  tetherL: f32, nA: u32, nB: u32, nU: u32,
  nV: u32, pin: i32, pad0: f32, pad1: f32,
};
struct Con { a: u32, b: u32, r: f32, k: f32 };

@group(0) @binding(0) var<storage, read> part: array<Part>;
@group(0) @binding(1) var<storage, read> cons: array<Con>;
@group(0) @binding(2) var<storage, read> ranges: array<u32>;
@group(0) @binding(3) var<storage, read> jobs: array<vec4f>;
@group(0) @binding(4) var<storage, read> pins: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> state: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> outv: array<vec4f>;

const N: u32 = ${topo.N}u;
const NP: u32 = ${topo.nPins}u;
const COLORS: u32 = ${topo.colors}u;
const WG: u32 = 256u;
const JOBV: u32 = 48u;
const GN: u32 = 5u;

fn sync() { storageBarrier(); workgroupBarrier(); }

fn heightAt(G: u32, f: u32) -> f32 { let v = jobs[G + 1u + f / 4u]; return v[f % 4u]; }

/** Ground under (x, z) (origin-relative): bilinear over the job's grid, clamped to its edge. */
fn groundAt(G: u32, x: f32, z: f32) -> f32 {
  let gh = jobs[G];
  let last = f32(GN - 1u);
  let fx = clamp((x - gh.x) / gh.z, 0.0, last);
  let fz = clamp((z - gh.y) / gh.z, 0.0, last);
  let i0 = min(u32(fx), GN - 2u);
  let j0 = min(u32(fz), GN - 2u);
  let tx = fx - f32(i0);
  let tz = fz - f32(j0);
  let h00 = heightAt(G, j0 * GN + i0);
  let h10 = heightAt(G, j0 * GN + i0 + 1u);
  let h01 = heightAt(G, (j0 + 1u) * GN + i0);
  let h11 = heightAt(G, (j0 + 1u) * GN + i0 + 1u);
  return mix(mix(h00, h10, tx), mix(h01, h11, tx), tz);
}

fn collide(J: u32, colN: u32, flatMask: u32, o: u32, mask: u32) {
  var p = state[o].xyz;
  for (var k = 0u; k < colN; k++) {
    let bit = 1u << k;
    if ((mask & bit) == 0u) { continue; }
    let A = jobs[J + 6u + k * 2u];
    let B = jobs[J + 7u + k * 2u];
    let a = A.xyz;
    let e = B.xyz - a;
    let r = A.w;
    let kk = B.w;
    var ee = dot(e, e);
    if (ee == 0.0) { ee = 1e-9; }
    let m = a + e * 0.5;
    let br = sqrt(ee) * 0.5 + r;
    var d = p - m;
    if (dot(d, d) > br * br) { continue; }
    let t = clamp(dot(p - a, e) / ee, 0.0, 1.0);
    d = p - (a + e * t);
    let d2 = dot(d, d);
    if (d2 >= r * r) { continue; }
    if ((flatMask & bit) != 0u) {
      let hh = d.x * d.x + d.z * d.z;
      if (hh < 1e-10) { continue; }
      let lim = r * r - d.y * d.y;
      if (lim <= 0.0) { continue; }
      let sc = (sqrt(lim / hh) - 1.0) * kk;
      p.x += d.x * sc;
      p.z += d.z * sc;
      continue;
    }
    var dl = sqrt(d2);
    if (dl == 0.0) { dl = 1e-6; }
    p += d * ((r - dl) / dl * kk);
  }
  state[o] = vec4f(p, 0.0);
}

@compute @workgroup_size(256)
fn main(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_index) li: u32) {
  let J = wid.x * JOBV;
  let j0 = jobs[J];
  let slot = u32(j0.x + 0.5);
  let steps = u32(j0.y + 0.5);
  let iters = u32(j0.z + 0.5);
  let dt = j0.w;
  let j1 = jobs[J + 1u];
  let j2 = jobs[J + 2u];
  let j3 = jobs[J + 3u];
  let j4 = jobs[J + 4u];
  let j5 = jobs[J + 5u];
  let fv = j2.xyz;
  let carry = j3.xyz;
  let acc = j4.xyz;
  let colN = u32(j5.x + 0.5);
  let flatMask = u32(j5.y + 0.5);
  let G = J + 36u;
  let onGround = jobs[G].w > 0.5;
  let S = slot * N * 2u;
  let PB = wid.x * NP;
  let keep = exp(-j2.w * dt);
  let air = exp(-j3.w * dt);
  let vmax = j4.w * dt;
  let fvd = fv * dt;

  // Into this frame's origin.
  for (var i = li; i < N; i += WG) {
    let o = S + i * 2u;
    state[o] = vec4f(state[o].xyz + j1.xyz, 0.0);
    state[o + 1u] = vec4f(state[o + 1u].xyz + j1.xyz, 0.0);
  }
  sync();

  for (var s = 0u; s < steps; s++) {
    let first = s == 0u;
    // Integrate (pinned particles take the CPU's place: previous = current, current = pin).
    for (var i = li; i < N; i += WG) {
      let P = part[i];
      let o = S + i * 2u;
      let x = state[o].xyz;
      if (P.w == 0.0) {
        state[o + 1u] = vec4f(x, 0.0);
        state[o] = vec4f(pins[PB + u32(P.pin)].xyz, 0.0);
        continue;
      }
      var q = state[o + 1u].xyz;
      var rr = 1.0;
      if (first) { q -= carry * dt; rr = j1.w; }
      var v = (fvd + ((x - q) * rr - fvd) * keep) * air;
      let v2 = dot(v, v);
      if (v2 > vmax * vmax) { v *= vmax / sqrt(v2); }
      state[o] = vec4f(x + v + acc * dt * dt, 0.0);
      state[o + 1u] = vec4f(x, 0.0);
    }
    sync();
    for (var it = 0u; it < iters; it++) {
      for (var c = 0u; c < COLORS; c++) {
        let a1 = ranges[c + 1u];
        for (var k = ranges[c] + li; k < a1; k += WG) {
          let C = cons[k];
          let wa = part[C.a].w;
          let wb = part[C.b].w;
          let ws = wa + wb;
          if (ws == 0.0) { continue; }
          let oa = S + C.a * 2u;
          let ob = S + C.b * 2u;
          let pa = state[oa].xyz;
          let pb = state[ob].xyz;
          let d3 = pb - pa;
          let d = length(d3);
          if (d < 1e-9) { continue; }
          let sc = ((d - C.r) / (d * ws)) * C.k;
          state[oa] = vec4f(pa + d3 * (sc * wa), 0.0);
          state[ob] = vec4f(pb - d3 * (sc * wb), 0.0);
        }
        sync();
      }
      // Tethers (anchored on pinned particles: none moves in this pass but its own).
      for (var i = li; i < N; i += WG) {
        let P = part[i];
        if (P.tetherA < 0) { continue; }
        let o = S + i * 2u;
        let pa = state[S + u32(P.tetherA) * 2u].xyz;
        let d3 = state[o].xyz - pa;
        let d2 = dot(d3, d3);
        let L = P.tetherL;
        if (d2 > L * L) { state[o] = vec4f(pa + d3 * (L / sqrt(d2)), 0.0); }
      }
      sync();
      if (it == (iters >> 1u) || it == iters - 1u) {
        for (var i = li; i < N; i += WG) {
          let P = part[i];
          if (P.w == 0.0) { continue; }
          collide(J, colN, flatMask, S + i * 2u, P.mask);
        }
        sync();
      }
    }
    // The hem on the ground: lifted out, and it drags instead of skating.
    if (onGround) {
      for (var i = li; i < N; i += WG) {
        let P = part[i];
        if (P.ground == 0u || P.w == 0.0) { continue; }
        let o = S + i * 2u;
        var p = state[o].xyz;
        let floor = groundAt(G, p.x, p.z) + 0.015;
        if (p.y < floor) {
          var q = state[o + 1u].xyz;
          p.y = floor;
          q.x += (p.x - q.x) * 0.15;
          q.z += (p.z - q.z) * 0.15;
          q.y = floor;
          state[o] = vec4f(p, 0.0);
          state[o + 1u] = vec4f(q, 0.0);
        }
      }
      sync();
    }
  }

  // Pack for the renderer: world position, garment + 0.98·fold occlusion; normal, thinness.
  let bodyP = jobs[G + 8u].xyz;
  let bodyU = jobs[G + 9u].xyz;
  let ob = jobs[G + 10u];
  for (var i = li; i < N; i += WG) {
    let P = part[i];
    let p = state[S + i * 2u].xyz;
    let a = state[S + P.nA * 2u].xyz;
    let b = state[S + P.nB * 2u].xyz;
    let u = state[S + P.nU * 2u].xyz;
    let v = state[S + P.nV * 2u].xyz;
    var n = cross(a - b, u - v);
    var nl = length(n);
    if (nl == 0.0) { nl = 1.0; }
    n = n / (nl * P.flip);
    let cav = dot((a + b + u + v) * 0.25 - p, n);
    var occ = 1.0 - min(0.55, max(0.0, cav * 22.0));
    if (P.layerTop > -1e8) {
      let h = dot(p - bodyP, bodyU);
      occ *= 1.0 - 0.55 * clamp((h - P.layerTop + 0.12) / 0.14, 0.0, 1.0);
    }
    let o = S + i * 2u;
    outv[o] = vec4f(ob.xyz + p * ob.w, f32(P.garment) + 0.98 * occ);
    outv[o + 1u] = vec4f(n, P.thin);
  }
}
`;
}
