// WGSL twin of src/terrain/dunes.js (the dune types of the meso layer). Edit both together;
// tools/capture/parity-check.mjs compares them on the GPU. Included by terrainNoise.wgsl.js.

export const DUNE_TYPES_WGSL = /* wgsl */ `
const DUNE_SEED: u32 = 0x6d65u + 300u;

// LOD fade of a feature with wavelength lambda at grid spacing s (fully present while s ≤ λ/8).
fn tn_lodFade(lambda: f32, s: f32) -> f32 { return 1.0 - smoothstep(lambda / 8.0, lambda / 3.0, s); }

fn tn_transverseH(u: f32, v: f32) -> f32 {
  let S = 0x6d65u;
  let phase = u / 140.0 + 0.9 * tn_fbm(u / 900.0, v / 600.0, 3, S + 1u) + 0.25 * tn_valueNoise(v / 170.0, u / 400.0, S + 2u);
  let p = phase - floor(phase);
  let seg = 0.7 + 0.3 * tn_fbm(v / 260.0, u / 700.0, 3, S + 3u);
  return tn_duneProfile(p) * 22.0 * seg;
}

fn tn_barchanH(u: f32, v: f32) -> f32 {
  let S = DUNE_SEED + 10u;
  let cu = i32(floor(u / 240.0)); let cv = i32(floor(v / 200.0));
  if (tn_hash2(cu, cv, S) < 0.2) { return 0.0; }
  let sc = 0.7 + 0.5 * tn_hash2(cu, cv, S + 1u);
  let a = u - (f32(cu) + 0.5) * 240.0 - (tn_hash2(cu, cv, S + 2u) - 0.5) * 50.0;
  let b = v - (f32(cv) + 0.5) * 200.0 - (tn_hash2(cu, cv, S + 3u) - 0.5) * 40.0;
  let L = 70.0 * sc; let B = 65.0 * sc;
  let e = 1.0 - (b / B) * (b / B);
  if (e <= 0.0) { return 0.0; }
  let q = a - (0.5 * L / (B * B)) * b * b;
  let p = (q + L) / L;
  if (p <= 0.0 || p >= 1.0) { return 0.0; }
  return 11.0 * sc * sqrt(e) * tn_duneProfile(p);
}

fn tn_starH(u: f32, v: f32) -> f32 {
  let S = DUNE_SEED + 20u; let P = 760.0;
  let i0 = i32(floor(u / P - 0.5)); let j0 = i32(floor(v / P - 0.5));
  var best = 0.0;
  for (var dj = 0; dj < 2; dj++) {
    for (var di = 0; di < 2; di++) {
      let ci = i0 + di; let cj = j0 + dj;
      if (tn_hash2(ci, cj, S) < 0.12) { continue; }
      let sc = 0.8 + 0.35 * tn_hash2(ci, cj, S + 1u);
      let a = u - (f32(ci) + 0.5) * P - (tn_hash2(ci, cj, S + 2u) - 0.5) * 200.0;
      let b = v - (f32(cj) + 0.5) * P - (tn_hash2(ci, cj, S + 3u) - 0.5) * 200.0;
      let R = 340.0 * sc;
      let r2 = a * a + b * b;
      if (r2 >= R * R) { continue; }
      var dx = tn_hash2(ci, cj, S + 4u) - 0.5 + 0.01; var dy = tn_hash2(ci, cj, S + 5u) - 0.5;
      let il = 1.0 / sqrt(dx * dx + dy * dy);
      dx = dx * il; dy = dy * il;
      let H = 45.0 + 35.0 * tn_hash2(ci, cj, S + 6u); let wid = 105.0 * sc;
      var m = max(1.0 - sqrt(r2) / (0.5 * R), 0.0);
      for (var k = 0; k < 3; k++) {
        let along = a * dx + b * dy; let lat = -a * dy + b * dx;
        if (along > 0.0) {
          let al = 1.0 - along / R; let tl = 1.0 - abs(lat) / (wid * (1.0 - 0.55 * along / R));
          if (al > 0.0 && tl > 0.0 && al * tl > m) { m = al * tl; }
        }
        let nx = -0.5 * dx - 0.8660254 * dy;
        dy = 0.8660254 * dx - 0.5 * dy; dx = nx;
      }
      if (H * m > best) { best = H * m; }
    }
  }
  return best;
}

fn tn_seifH(u: f32, v: f32) -> f32 {
  let S = DUNE_SEED + 40u;
  let phase = v / 115.0 + 0.55 * tn_fbm(u / 700.0, v / 300.0, 3, S);
  let p = phase - floor(phase);
  let tri = 1.0 - abs(2.0 * p - 1.0);
  let amp = 13.0 * (0.65 + 0.35 * tn_fbm(u / 500.0, v / 250.0, 2, S + 1u));
  return amp * (0.5 * tri * tri * (3.0 - 2.0 * tri) + 0.5 * tri);
}
`;
