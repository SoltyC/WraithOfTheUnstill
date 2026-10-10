// Leaf atlas (PLAN.md M4): the clusters a tree's leaf cards show, drawn at load on canvases — a twig
// and its leaves, each leaf shaped, veined, coloured and worn on its own, so a crown of cards reads
// as foliage, not sprites. Two atlases in the same layout:
//   colour  albedo + alpha cut-out (sRGB)
//   surface a height field drawn alongside (each leaf a soft dome along its midrib, the veins pressed
//           in, the blade thinner toward its edges), turned into normals here: rg = normal xy
//           (card space, 0.5 = flat), b = thickness (light through it: veins and the midrib block,
//           the blade glows), a = unused (linear)
// Rows: pine (needle sprays), oak (lobed leaves), birch (small serrated leaves); four variants each.
// Deterministic (seeded).

export const ATLAS = { size: 4096, cols: 4, rows: 4, cell: 1024 };

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(1)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`;
const grey = (v, a = 1) => `rgba(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)},${a})`;

function twigPath(ctx, x0, y0, x1, y1, mx, my) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); }

/** The outline of one broad leaf in its own frame (base at 0, tip at L along +x). */
function leafOutline(ctx, R, L, W, kind) {
  ctx.beginPath(); ctx.moveTo(0, 0);
  const n = kind === 'oak' ? 7 : 13;
  const jit = [];
  for (let k = 1; k <= n; k++) jit.push(0.92 + 0.16 * R());
  for (const s of [1, -1]) {
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1), r = Math.sin(Math.PI * Math.pow(t, 0.75)) * W;
      let lobe;
      if (kind === 'oak') lobe = (0.6 + 0.4 * Math.abs(Math.sin(k * 1.75 + 0.3))) * jit[k - 1];
      else lobe = (k % 2 ? 1.05 : 0.9) * (0.97 + 0.06 * jit[k - 1]);   // fine teeth
      ctx.lineTo(t * L, s * r * lobe);
      if (kind === 'oak') ctx.lineTo((t + 0.5 / (n + 1)) * L, s * r * lobe * 0.72); // the sinus between lobes
    }
    ctx.lineTo(L, 0);
  }
  ctx.closePath();
}

/** One broad leaf at (x, y) pointing along a: colour on c, height on h. */
function leaf(c, h, R, x, y, a, L, W, kind, hue, age) {
  for (const ctx of [c, h]) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); }
  // Colour: a base tone, lighter toward the tip and one side (the blade catches light unevenly),
  // darker and yellower with age, a paler midrib and veins, speckles; some leaves bitten.
  const l0 = 0.2 + R() * 0.12 + age * 0.06, sat = 0.38 + R() * 0.18;
  const hu = hue - age * 22;
  leafOutline(c, R, L, W, kind);
  const g = c.createLinearGradient(0, -W, L * 0.4, W);
  g.addColorStop(0, hsl(hu + 5, sat, l0 + 0.07)); g.addColorStop(0.45, hsl(hu, sat, l0)); g.addColorStop(1, hsl(hu - 7, sat * 0.9, Math.max(0.05, l0 - 0.07)));
  c.fillStyle = g; c.fill();
  const g2 = c.createLinearGradient(0, 0, L, 0);
  g2.addColorStop(0, 'rgba(0,0,0,0.18)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, `rgba(255,255,200,${0.06 + 0.06 * R()})`);
  c.fillStyle = g2; c.fill();
  // Speckle (mottling of the blade).
  c.save(); leafOutline(c, R, L, W, kind); c.clip();
  for (let k = 0; k < 26; k++) {
    c.fillStyle = hsl(hu + (R() - 0.5) * 14, sat * (0.7 + 0.4 * R()), l0 + (R() - 0.5) * 0.08, 0.35);
    c.beginPath(); c.ellipse(L * R(), (R() - 0.5) * W * 1.6, W * (0.05 + 0.08 * R()), W * (0.03 + 0.05 * R()), R() * 3, 0, 6.283); c.fill();
  }
  if (age > 0.6 || R() < 0.12) { // a brown spot or two
    c.fillStyle = hsl(30, 0.45, 0.18, 0.55);
    c.beginPath(); c.ellipse(L * (0.3 + 0.5 * R()), (R() - 0.5) * W, W * 0.12, W * 0.09, 0, 0, 6.283); c.fill();
  }
  c.restore();
  // Veins: midrib, then paired side veins curving toward the tip, then a faint net.
  c.lineCap = 'round';
  c.strokeStyle = hsl(hu + 10, sat * 0.55, Math.min(0.85, l0 + 0.14), 0.75); c.lineWidth = Math.max(1.5, W * 0.07);
  c.beginPath(); c.moveTo(-L * 0.15, 0); c.lineTo(L * 0.97, 0); c.stroke();
  const nv = kind === 'oak' ? 6 : 8;
  c.lineWidth = Math.max(0.8, W * 0.03);
  c.strokeStyle = hsl(hu + 8, sat * 0.5, Math.min(0.8, l0 + 0.09), 0.55);
  for (let k = 1; k <= nv; k++) {
    const t = k / (nv + 1.5);
    for (const sd of [1, -1]) { c.beginPath(); c.moveTo(t * L, 0); c.quadraticCurveTo(t * L + L * 0.08, sd * W * 0.35, t * L + L * 0.16, sd * W * 0.72); c.stroke(); }
  }
  // Height: a dome along the midrib, the blade falling to the edge; veins pressed in.
  leafOutline(h, R, L, W, kind);
  const hg = h.createLinearGradient(0, -W, 0, W);
  hg.addColorStop(0, grey(0.38)); hg.addColorStop(0.5, grey(0.72)); hg.addColorStop(1, grey(0.38));
  h.fillStyle = hg; h.fill();
  h.lineCap = 'round';
  h.strokeStyle = grey(0.5); h.lineWidth = Math.max(2, W * 0.09);
  h.beginPath(); h.moveTo(0, 0); h.lineTo(L * 0.97, 0); h.stroke();
  h.lineWidth = Math.max(1.2, W * 0.04); h.strokeStyle = grey(0.5);
  for (let k = 1; k <= nv; k++) {
    const t = k / (nv + 1.5);
    for (const sd of [1, -1]) { h.beginPath(); h.moveTo(t * L, 0); h.quadraticCurveTo(t * L + L * 0.08, sd * W * 0.35, t * L + L * 0.16, sd * W * 0.72); h.stroke(); }
  }
  for (const ctx of [c, h]) ctx.restore();
}

/** Draw both atlases; returns { color, surface } OffscreenCanvases (surface holds normals). */
export function drawLeafAtlases() {
  const { size, cell } = ATLAS;
  const cv = new OffscreenCanvas(size, size), c = cv.getContext('2d');
  const hv = new OffscreenCanvas(size, size), h = hv.getContext('2d', { willReadFrequently: true });
  c.clearRect(0, 0, size, size);
  h.fillStyle = grey(0); h.fillRect(0, 0, size, size);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
    const R = rng(row * 97 + col * 13 + 5);
    for (const ctx of [c, h]) { ctx.save(); ctx.translate(col * cell, row * cell); ctx.beginPath(); ctx.rect(6, 6, cell - 12, cell - 12); ctx.clip(); }
    const bx = cell * 0.5, by = cell * 0.93;
    if (row === 0) {
      // Pine: twigs with sprays of needles, dense toward the tip; each needle a tapering line with a
      // pale stomatal side; old needles darker near the base; a few brown ones.
      const tips = 5 + Math.floor(R() * 3);
      for (let t = 0; t < tips; t++) {
        const ang = -Math.PI / 2 + (t - (tips - 1) / 2) * 0.3 + (R() - 0.5) * 0.15;
        const len = cell * (0.55 + R() * 0.3), ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
        const mx = (bx + ex) / 2 + (R() - 0.5) * 50, my = (by + ey) / 2 + (R() - 0.5) * 50;
        twigPath(c, bx, by, ex, ey, mx, my); c.strokeStyle = hsl(24, 0.35, 0.16); c.lineWidth = 9; c.lineCap = 'round'; c.stroke();
        twigPath(h, bx, by, ex, ey, mx, my); h.strokeStyle = grey(0.85); h.lineWidth = 9; h.stroke();
        const needles = 150 + Math.floor(R() * 60);
        for (let k = 0; k < needles; k++) {
          const f = 0.12 + 0.88 * (k / needles), px = bx + (ex - bx) * f, py = by + (ey - by) * f;
          const na = ang + (k % 2 ? 1 : -1) * (0.5 + R() * 0.4), nl = cell * (0.07 + 0.05 * R()) * (0.6 + 0.4 * f);
          const brown = R() < 0.03, lig = 0.12 + 0.1 * R() + 0.06 * f;
          const qx = px + Math.cos(na) * nl, qy = py + Math.sin(na) * nl;
          c.strokeStyle = brown ? hsl(32, 0.5, 0.28) : hsl(138 + R() * 20, 0.32 + R() * 0.15, lig); c.lineWidth = 3.4 + R() * 1.6;
          c.beginPath(); c.moveTo(px, py); c.lineTo(qx, qy); c.stroke();
          c.strokeStyle = hsl(150, 0.2, lig + 0.12, 0.5); c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(px + 1, py); c.lineTo(qx + 1, qy); c.stroke();
          h.strokeStyle = grey(0.7); h.lineWidth = 3.6; h.beginPath(); h.moveTo(px, py); h.lineTo(qx, qy); h.stroke();
        }
      }
    } else {
      const kind = row === 1 ? 'oak' : 'birch';
      const hueBase = kind === 'oak' ? 96 : 84;
      const tips = kind === 'oak' ? 6 : 8;
      for (let t = 0; t < tips; t++) {
        const ang = -Math.PI / 2 + (t - (tips - 1) / 2) * (kind === 'oak' ? 0.45 : 0.32) + (R() - 0.5) * 0.2;
        const len = cell * (0.5 + R() * 0.3), ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
        const mx = (bx + ex) / 2 + (R() - 0.5) * 50, my = (by + ey) / 2 + (R() - 0.5) * 50;
        const tw = kind === 'oak' ? 9 : 6;
        twigPath(c, bx, by, ex, ey, mx, my); c.strokeStyle = hsl(26, 0.28, 0.19); c.lineWidth = tw; c.lineCap = 'round'; c.stroke();
        twigPath(h, bx, by, ex, ey, mx, my); h.strokeStyle = grey(0.85); h.lineWidth = tw; h.stroke();
        const nL = kind === 'oak' ? 11 : 17;
        for (let k = 0; k < nL; k++) {
          const f = 0.2 + 0.8 * (k / nL);
          // On the curved twig (quadratic at f).
          const px = (1 - f) * (1 - f) * bx + 2 * (1 - f) * f * mx + f * f * ex, py = (1 - f) * (1 - f) * by + 2 * (1 - f) * f * my + f * f * ey;
          const la = ang + (k % 2 ? 1 : -1) * (0.6 + R() * 0.5);
          const ll = cell * (kind === 'oak' ? 0.16 + 0.07 * R() : 0.085 + 0.035 * R());
          const age = R() < 0.06 ? 0.8 + 0.2 * R() : R() * 0.3;
          leaf(c, h, R, px, py, la, ll, ll * (kind === 'oak' ? 0.42 : 0.36), kind, hueBase + (R() - 0.5) * 12, age);
        }
      }
    }
    for (const ctx of [c, h]) ctx.restore();
  }
  // Normals from the height field (Sobel), in card space; thickness from the height and alpha.
  const H = h.getImageData(0, 0, size, size).data, out = new ImageData(size, size), o = out.data;
  const A = c.getImageData(0, 0, size, size).data;
  for (let y = 0; y < size; y++) {
    const y0 = y > 0 ? y - 1 : y, y1 = y < size - 1 ? y + 1 : y;
    for (let x = 0; x < size; x++) {
      const x0 = x > 0 ? x - 1 : x, x1 = x < size - 1 ? x + 1 : x;
      const hx = H[(y * size + x1) * 4] - H[(y * size + x0) * 4], hy = H[(y1 * size + x) * 4] - H[(y0 * size + x) * 4];
      const k = (y * size + x) * 4;
      // Card space: u right, v up (the atlas y runs down: flip hy).
      const nx = -hx / 255 * 3.0, ny = hy / 255 * 3.0, l = Math.sqrt(nx * nx + ny * ny + 1);
      o[k] = Math.round((nx / l * 0.5 + 0.5) * 255); o[k + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
      const hh = H[k] / 255;
      o[k + 2] = Math.round(Math.min(1, Math.max(0, (hh < 0.6 ? 0.25 : 0.25 + (hh - 0.6) * 1.8))) * 255); // veins and twigs thicker
      o[k + 3] = 255; // opaque (a canvas premultiplies: partial alpha would bend the normals)
    }
  }
  const sv = new OffscreenCanvas(size, size); sv.getContext('2d').putImageData(out, 0, 0);
  return { color: cv, surface: sv };
}

/** The colour atlas alone (kept for anything that only needs it). */
export function drawLeafAtlas() { return drawLeafAtlases().color; }
