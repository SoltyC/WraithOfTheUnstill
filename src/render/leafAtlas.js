// Leaf atlas (PLAN.md M4): the clusters a tree's leaf cards show, drawn at load on a canvas — a
// twig and its leaves, each leaf shaped, veined and coloured on its own, so a crown of cards reads
// as foliage, not sprites. Rows: pine (needle sprays), oak (lobed leaves), birch (small serrated
// leaves); four variants each. Alpha cut-out (the shader alpha-tests); mipmapped on the GPU.
// Deterministic (seeded).

export const ATLAS = { size: 2048, cols: 4, rows: 4, cell: 512 };

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(1)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`;

function twig(x, ctx, R, x0, y0, x1, y1, w, col) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0);
  const mx = (x0 + x1) / 2 + (R() - 0.5) * 30, my = (y0 + y1) / 2 + (R() - 0.5) * 30;
  ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
}

/** One broad leaf (oak-ish lobes or a birch oval) at (x, y), pointing along angle a. */
function leaf(ctx, R, x, y, a, len, wid, kind, hue) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  const L = len, W = wid;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const n = kind === 'oak' ? 5 : 9;
  // One side then the other: lobes for oak, fine serrations for birch.
  for (const s of [1, -1]) {
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1), r = Math.sin(Math.PI * Math.pow(t, 0.8)) * W;
      const lobe = kind === 'oak' ? (0.65 + 0.35 * Math.abs(Math.sin(k * 1.6))) : (1 + (k % 2 ? 0.06 : -0.04));
      ctx.lineTo(t * L, s * r * lobe);
    }
    ctx.lineTo(L, 0);
  }
  ctx.closePath();
  const l0 = 0.15 + R() * 0.12, sat = 0.32 + R() * 0.16;
  const g = ctx.createLinearGradient(0, -W, 0, W);
  g.addColorStop(0, hsl(hue + R() * 8, sat, l0 + 0.06)); g.addColorStop(0.5, hsl(hue, sat, l0)); g.addColorStop(1, hsl(hue - 6, sat * 0.9, l0 - 0.05));
  ctx.fillStyle = g; ctx.fill();
  // Midrib and veins, darker.
  ctx.strokeStyle = hsl(hue - 4, sat * 0.8, l0 - 0.1, 0.7); ctx.lineWidth = Math.max(1, W * 0.08);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.95, 0); ctx.stroke();
  ctx.lineWidth = Math.max(0.6, W * 0.04);
  for (let k = 1; k < 6; k++) { const t = k / 6; ctx.beginPath(); ctx.moveTo(t * L, 0); ctx.lineTo(t * L + L * 0.12, W * 0.55); ctx.moveTo(t * L, 0); ctx.lineTo(t * L + L * 0.12, -W * 0.55); ctx.stroke(); }
  ctx.restore();
}

/** Draw the atlas onto an OffscreenCanvas and return it. */
export function drawLeafAtlas() {
  const { size, cell } = ATLAS;
  const cv = new OffscreenCanvas(size, size), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
    const R = rng(row * 97 + col * 13 + 5);
    ctx.save();
    ctx.translate(col * cell, row * cell);
    ctx.beginPath(); ctx.rect(4, 4, cell - 8, cell - 8); ctx.clip();
    // The card's base is at the bottom centre (where it attaches): twigs run upward and out.
    const bx = cell * 0.5, by = cell * 0.92;
    if (row === 0) {
      // Pine: a twig with sprays of needles, dense near the tip, dark blue-green.
      const tips = 5 + Math.floor(R() * 3);
      for (let t = 0; t < tips; t++) {
        const ang = -Math.PI / 2 + (t - (tips - 1) / 2) * 0.32 + (R() - 0.5) * 0.15;
        const len = cell * (0.55 + R() * 0.3), ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
        twig(null, ctx, R, bx, by, ex, ey, 5, hsl(25, 0.35, 0.18));
        const needles = 70 + Math.floor(R() * 40);
        for (let k = 0; k < needles; k++) {
          const f = 0.15 + 0.85 * (k / needles), px = bx + (ex - bx) * f, py = by + (ey - by) * f;
          const na = ang + (k % 2 ? 1 : -1) * (0.55 + R() * 0.35), nl = cell * (0.06 + 0.05 * R()) * (0.6 + 0.4 * f);
          ctx.strokeStyle = hsl(140 + R() * 18, 0.3 + R() * 0.15, 0.13 + R() * 0.1);
          ctx.lineWidth = 2 + R() * 1.2;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); ctx.stroke();
        }
      }
    } else {
      const kind = row === 1 ? 'oak' : 'birch';
      const hueBase = kind === 'oak' ? 96 : 86;
      // A branching twig, leaves along it (alternate), a few turning yellow.
      const tips = kind === 'oak' ? 6 : 8;
      for (let t = 0; t < tips; t++) {
        const ang = -Math.PI / 2 + (t - (tips - 1) / 2) * (kind === 'oak' ? 0.45 : 0.32) + (R() - 0.5) * 0.2;
        const len = cell * (0.5 + R() * 0.3), ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
        twig(null, ctx, R, bx, by, ex, ey, kind === 'oak' ? 5 : 3, hsl(28, 0.3, 0.2));
        const nL = kind === 'oak' ? 11 : 17;
        for (let k = 0; k < nL; k++) {
          const f = 0.2 + 0.8 * (k / nL), px = bx + (ex - bx) * f, py = by + (ey - by) * f;
          const la = ang + (k % 2 ? 1 : -1) * (0.6 + R() * 0.5);
          const ll = cell * (kind === 'oak' ? 0.16 + 0.07 * R() : 0.085 + 0.035 * R());
          const turned = R() < 0.025;
          leaf(ctx, R, px, py, la, ll, ll * (kind === 'oak' ? 0.42 : 0.36), kind, turned ? 62 : hueBase + (R() - 0.5) * 12);
        }
      }
    }
    ctx.restore();
  }
  return cv;
}
