// Ground-cover atlas (PLAN.md Phase 8 M4c; art bar: screenshots/reference/forest-ruins-target.webp):
// the small things a forest floor and a meadow are made of, drawn at load on a canvas, each shaped,
// veined and coloured on its own so no two read as stamps. Deterministic (seeded). Alpha cut-out.
// Cells (4 × 4, row-major from the top-left; GC_* below):
//   0 fallen oak leaves (a drift, browns to rust and ochre)   1 fallen birch and mixed leaves
//   2 needle litter with a cone and scales                   3 a fallen twig
//   4 fern frond                                             5 fern frond, younger, finer
//   6 daisy head (top view)                                  7 buttercup head
//   8 bellflower spray                                       9 clover patch with heads
//  10 plantain rosette                                      11 flower stem (side view, leaves)
//  12 wood sorrel / small round leaves                      13 moss cushion
//  14 dead bracken frond (brown)                            15 pebbles and grit

export const GC_ATLAS = { size: 2048, cols: 4, cell: 512 };
export const GC = {
  LEAVES_OAK: 0, LEAVES_MIXED: 1, NEEDLES: 2, TWIG: 3, FERN: 4, FERN_YOUNG: 5, DAISY: 6, BUTTERCUP: 7,
  BELL: 8, CLOVER: 9, PLANTAIN: 10, STEM: 11, SORREL: 12, MOSS: 13, BRACKEN: 14, PEBBLES: 15,
};

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(1)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`;

/** A broad leaf at (x, y) pointing along a: lobed (oak), toothed oval (birch) or plain lanceolate. */
function leafShape(ctx, R, x, y, a, L, W, kind, h, s, l, curl = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(0, 0);
  const n = kind === 'oak' ? 7 : kind === 'birch' ? 11 : 8;
  for (const sd of [1, -1]) {
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      let r = Math.sin(Math.PI * Math.pow(t, kind === 'lance' ? 1.1 : 0.75)) * W;
      if (kind === 'oak') r *= 0.62 + 0.38 * Math.abs(Math.sin(k * 1.9 + 0.4));
      else if (kind === 'birch') r *= k % 2 ? 1.05 : 0.95;
      ctx.lineTo(t * L, sd * r * (sd > 0 ? 1 : 1 - curl));
    }
    ctx.lineTo(L, 0);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -W, L * 0.3, W);
  g.addColorStop(0, hsl(h + 4, s, l + 0.07)); g.addColorStop(0.55, hsl(h, s, l)); g.addColorStop(1, hsl(h - 6, s * 0.85, Math.max(0.03, l - 0.08)));
  ctx.fillStyle = g; ctx.fill();
  // Edge darkening (dry leaves curl and brown at the rim), spots.
  ctx.strokeStyle = hsl(h - 8, s * 0.7, Math.max(0.03, l - 0.12), 0.6); ctx.lineWidth = Math.max(1, W * 0.06); ctx.stroke();
  for (let k = 0; k < 4; k++) {
    if (R() < 0.5) continue;
    ctx.fillStyle = hsl(h - 10, s * 0.6, Math.max(0.02, l - 0.12), 0.45);
    ctx.beginPath(); ctx.ellipse(L * (0.2 + 0.6 * R()), (R() - 0.5) * W, W * 0.12 * (0.5 + R()), W * 0.09 * (0.5 + R()), R() * 3, 0, 6.283); ctx.fill();
  }
  // Midrib and veins.
  ctx.strokeStyle = hsl(h + 6, s * 0.6, Math.min(0.9, l + 0.08), 0.4); ctx.lineWidth = Math.max(1, W * 0.06);
  ctx.beginPath(); ctx.moveTo(-L * 0.12, 0); ctx.lineTo(L * 0.96, 0); ctx.stroke();
  ctx.lineWidth = Math.max(0.6, W * 0.035);
  for (let k = 1; k < 7; k++) {
    const t = k / 7.5;
    ctx.beginPath(); ctx.moveTo(t * L, 0); ctx.lineTo(t * L + L * 0.13, W * 0.62); ctx.moveTo(t * L, 0); ctx.lineTo(t * L + L * 0.13, -W * 0.62); ctx.stroke();
  }
  ctx.restore();
}

function stroke(ctx, pts, w, col) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
}

/** A bending stalk from (x0, y0) along a, length L, curving by bend; returns the points. */
function stalk(x0, y0, a, L, bend, n = 12) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, aa = a + bend * t * t;
    const x = i ? p[p.length - 2] + Math.cos(aa) * L / n : x0, y = i ? p[p.length - 1] + Math.sin(aa) * L / n : y0;
    p.push(x, y);
  }
  return p;
}

function drawCell(ctx, id, C, R) {
  const cx = C / 2, cy = C / 2;
  switch (id) {
    case 0: case 1: { // a drift of fallen leaves
      const n = id === 0 ? 30 : 42;
      for (let k = 0; k < n; k++) {
        // Lower leaves first (darker, older), the top layer fresher.
        const age = 1 - k / n;
        const x = C * (0.16 + 0.68 * R()), y = C * (0.16 + 0.68 * R()), a = R() * 6.283;
        const oak = id === 0 ? R() < 0.8 : R() < 0.25;
        const L = oak ? C * (0.15 + 0.08 * R()) : C * (0.08 + 0.05 * R());
        const hue = 16 + 32 * R(), sat = 0.4 + 0.3 * R(), lig = (0.2 + 0.2 * R()) * (1 - 0.35 * age);
        const green = R() < 0.12; // a few still green-yellow
        leafShape(ctx, R, x - Math.cos(a) * L / 2, y - Math.sin(a) * L / 2, a, L, L * (oak ? 0.36 : 0.42), oak ? 'oak' : 'birch',
          green ? 62 + 20 * R() : hue, green ? 0.45 : sat, green ? 0.25 : lig, R() * 0.6);
      }
      break;
    }
    case 2: { // needles, a cone, scales
      for (let k = 0; k < 420; k++) {
        const x = C * (0.08 + 0.84 * R()), y = C * (0.08 + 0.84 * R()), a = R() * 6.283, L = C * (0.03 + 0.04 * R());
        const dry = R();
        stroke(ctx, [x, y, x + Math.cos(a) * L, y + Math.sin(a) * L], 1.6 + R() * 1.2, hsl(dry < 0.8 ? 22 + 14 * R() : 80 + 20 * R(), 0.45, 0.12 + 0.16 * R()));
      }
      // A cone: overlapping scales in a spiral.
      ctx.save(); ctx.translate(C * 0.62, C * 0.4); ctx.rotate(0.7);
      for (let k = 0; k < 40; k++) {
        const t = k / 40, ax = (t - 0.5) * C * 0.26, w = Math.sin(Math.PI * Math.min(1, t * 1.15)) * C * 0.06;
        ctx.fillStyle = hsl(24 + 8 * R(), 0.4, 0.13 + 0.1 * R());
        ctx.beginPath(); ctx.ellipse(ax, (k % 2 ? 1 : -1) * w * 0.4, C * 0.025, w * 0.6 + 2, 0.4, 0, 6.283); ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 3: { // a fallen twig with side shoots, lichen
      const main = stalk(C * 0.06, C * 0.6, -0.25, C * 0.9, 0.3);
      stroke(ctx, main, C * 0.028, hsl(25, 0.2, 0.17));
      stroke(ctx, main, C * 0.012, hsl(28, 0.18, 0.27));
      for (let k = 0; k < 6; k++) {
        const i = 4 + Math.floor(R() * 16) * 2; if (i >= main.length) continue;
        const sd = R() < 0.5 ? -1 : 1;
        stroke(ctx, stalk(main[i], main[i + 1], -0.25 + sd * (0.6 + 0.4 * R()), C * (0.12 + 0.16 * R()), sd * 0.3, 6), C * 0.012, hsl(25, 0.2, 0.19));
      }
      for (let k = 0; k < 30; k++) {
        const i = Math.floor(R() * (main.length / 2)) * 2;
        ctx.fillStyle = hsl(80 + 30 * R(), 0.25, 0.45 + 0.15 * R(), 0.8);
        ctx.beginPath(); ctx.arc(main[i] + (R() - 0.5) * 10, main[i + 1] + (R() - 0.5) * 10, 2 + 3 * R(), 0, 6.283); ctx.fill();
      }
      break;
    }
    case 4: case 5: case 14: { // fern frond (rachis from the bottom up; pinnae with lobed pinnules)
      const young = id === 5, dead = id === 14;
      const base = [C * 0.5, C * 0.98];
      const rach = stalk(base[0], base[1], -Math.PI / 2, C * 0.94, young ? 0.25 : 0.12, 24);
      const hue = dead ? 26 : 98 + 10 * R(), sat = dead ? 0.45 : 0.42, lig = dead ? 0.2 : 0.2;
      const pairs = young ? 13 : 16;
      for (let k = 2; k < pairs; k++) {
        const t = k / pairs, i = Math.floor(t * 24) * 2, px = rach[i], py = rach[i + 1];
        const len = C * 0.36 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.08)) * (1 - 0.15 * t);
        for (const sd of [-1, 1]) {
          const a = -Math.PI / 2 + sd * (1.15 - 0.35 * t);
          const pin = stalk(px, py, a, len, -sd * 0.25, 10);
          stroke(ctx, pin, 1.5, hsl(hue - 5, sat, lig - 0.04));
          // Pinnules: small rounded lobes along each pinna.
          const tone = (k % 2 ? 0.03 : -0.02);
          for (let j = 1; j < 10; j++) {
            const q = j * 2, s2 = (1 - j / 11) * len * 0.075 + 2;
            for (const sd2 of [-1, 1]) {
              const aa = a + sd2 * 1.2;
              ctx.fillStyle = hsl(hue + (R() - 0.5) * 8, sat + (R() - 0.5) * 0.08, lig + tone + 0.06 * (1 - j / 10) + (R() - 0.3) * 0.04 + (dead ? 0.03 * R() : 0));
              ctx.beginPath(); ctx.ellipse(pin[q] + Math.cos(aa) * s2 * 0.75, pin[q + 1] + Math.sin(aa) * s2 * 0.75, s2, s2 * 0.42, aa, 0, 6.283); ctx.fill();
            }
          }
        }
      }
      stroke(ctx, rach, young ? 3 : 4, hsl(dead ? 22 : 80, 0.35, 0.17));
      break;
    }
    case 6: { // daisy: white rays, yellow disc
      const r = C * 0.42;
      for (let k = 0; k < 22; k++) {
        const a = k / 22 * 6.283 + R() * 0.1, rr = r * (0.85 + 0.15 * R());
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
        const g = ctx.createLinearGradient(0, 0, rr, 0);
        g.addColorStop(0, hsl(60, 0.2, 0.78)); g.addColorStop(1, hsl(330, 0.25 * R(), 0.92));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(rr * 0.55, 0, rr * 0.48, r * 0.08, 0, 0, 6.283); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = hsl(46, 0.85, 0.45); ctx.beginPath(); ctx.arc(cx, cy, r * 0.27, 0, 6.283); ctx.fill();
      for (let k = 0; k < 80; k++) { const a = R() * 6.283, d = Math.sqrt(R()) * r * 0.25; ctx.fillStyle = hsl(40, 0.8, 0.3 + 0.2 * R()); ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 4, 4); }
      break;
    }
    case 7: { // buttercup: five glossy cupped petals
      const r = C * 0.4;
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * 6.283 + 0.3;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
        const g = ctx.createRadialGradient(r * 0.5, 0, 2, r * 0.5, 0, r * 0.55);
        g.addColorStop(0, hsl(54, 1, 0.68)); g.addColorStop(0.7, hsl(50, 0.95, 0.5)); g.addColorStop(1, hsl(44, 0.9, 0.38));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(r * 0.52, 0, r * 0.5, r * 0.42, 0, 0, 6.283); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = hsl(70, 0.6, 0.35); ctx.beginPath(); ctx.arc(cx, cy, r * 0.16, 0, 6.283); ctx.fill();
      for (let k = 0; k < 24; k++) { const a = R() * 6.283; ctx.fillStyle = hsl(48, 0.9, 0.55); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2, 3, 0, 6.283); ctx.fill(); }
      break;
    }
    case 8: { // bellflower spray: nodding violet bells on a curved stem
      const st = stalk(C * 0.5, C * 0.98, -Math.PI / 2, C * 0.85, 0.9, 16);
      stroke(ctx, st, 4, hsl(95, 0.35, 0.25));
      for (let k = 0; k < 5; k++) {
        const i = 10 + k * 4; if (i + 1 >= st.length) break;
        const bx = st[i] + (k % 2 ? 1 : -1) * C * 0.1, by = st[i + 1] + C * 0.06;
        stroke(ctx, [st[i], st[i + 1], bx, by - C * 0.03], 2.5, hsl(95, 0.35, 0.25));
        const g = ctx.createLinearGradient(bx, by - C * 0.06, bx, by + C * 0.08);
        g.addColorStop(0, hsl(262, 0.45, 0.32)); g.addColorStop(1, hsl(255, 0.55, 0.55));
        ctx.fillStyle = g; ctx.beginPath();
        ctx.moveTo(bx - C * 0.025, by - C * 0.05); ctx.quadraticCurveTo(bx - C * 0.06, by + C * 0.05, bx - C * 0.05, by + C * 0.075);
        ctx.lineTo(bx + C * 0.05, by + C * 0.075); ctx.quadraticCurveTo(bx + C * 0.06, by + C * 0.05, bx + C * 0.025, by - C * 0.05); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 9: { // clover: trifoliate leaves with pale chevrons, a couple of pink heads
      for (let k = 0; k < 14; k++) {
        const x = C * (0.15 + 0.7 * R()), y = C * (0.15 + 0.7 * R()), s = C * (0.05 + 0.035 * R()), rot = R() * 6.283;
        for (let j = 0; j < 3; j++) {
          const a = rot + j * 2.094;
          ctx.save(); ctx.translate(x + Math.cos(a) * s, y + Math.sin(a) * s); ctx.rotate(a + Math.PI / 2);
          ctx.fillStyle = hsl(100 + 10 * R(), 0.45, 0.22 + 0.06 * R());
          ctx.beginPath(); ctx.moveTo(0, s); ctx.bezierCurveTo(-s * 1.2, s * 0.2, -s * 0.8, -s * 0.9, 0, -s * 0.6); ctx.bezierCurveTo(s * 0.8, -s * 0.9, s * 1.2, s * 0.2, 0, s); ctx.fill();
          ctx.strokeStyle = hsl(90, 0.25, 0.48, 0.55); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.1); ctx.lineTo(0, s * 0.2); ctx.lineTo(s * 0.4, -s * 0.1); ctx.stroke();
          ctx.restore();
        }
      }
      for (let k = 0; k < 2; k++) {
        const x = C * (0.3 + 0.4 * R()), y = C * (0.3 + 0.4 * R());
        for (let j = 0; j < 40; j++) { const a = R() * 6.283, d = Math.sqrt(R()) * C * 0.06; ctx.fillStyle = hsl(330 + 15 * R(), 0.45, 0.55 + 0.2 * R()); ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, 5, 3, a, 0, 6.283); ctx.fill(); }
      }
      break;
    }
    case 10: { // plantain rosette: ribbed lanceolate leaves from the centre
      const n = 9;
      for (let k = 0; k < n; k++) {
        const a = k / n * 6.283 + R() * 0.3, L = C * (0.32 + 0.12 * R());
        leafShape(ctx, R, cx, cy, a, L, L * 0.24, 'lance', 92 + 12 * R(), 0.4, 0.2 + 0.06 * R());
      }
      break;
    }
    case 11: { // flower stem (side view): stalk with a few narrow leaves
      const st = stalk(C * 0.5, C * 1.0, -Math.PI / 2, C * 0.96, (R() - 0.5) * 0.3, 16);
      stroke(ctx, st, 5, hsl(92, 0.38, 0.23));
      for (let k = 0; k < 4; k++) {
        const i = 6 + k * 6; if (i + 1 >= st.length) break;
        const sd = k % 2 ? 1 : -1;
        leafShape(ctx, R, st[i], st[i + 1], -Math.PI / 2 + sd * 0.7, C * (0.16 - k * 0.025), C * 0.03, 'lance', 95, 0.4, 0.22);
      }
      break;
    }
    case 12: { // wood sorrel: clusters of three heart leaflets, small, light green
      for (let k = 0; k < 20; k++) {
        const x = C * (0.12 + 0.76 * R()), y = C * (0.12 + 0.76 * R()), s = C * (0.035 + 0.02 * R()), rot = R() * 6.283;
        for (let j = 0; j < 3; j++) {
          const a = rot + j * 2.094;
          ctx.save(); ctx.translate(x + Math.cos(a) * s * 0.9, y + Math.sin(a) * s * 0.9); ctx.rotate(a - Math.PI / 2);
          ctx.fillStyle = hsl(88 + 8 * R(), 0.5, 0.3 + 0.08 * R());
          ctx.beginPath(); ctx.moveTo(0, -s * 0.9); ctx.bezierCurveTo(-s * 1.3, -s * 0.2, -s * 0.6, s * 1.0, 0, s * 0.45); ctx.bezierCurveTo(s * 0.6, s * 1.0, s * 1.3, -s * 0.2, 0, -s * 0.9); ctx.fill();
          ctx.restore();
        }
      }
      break;
    }
    case 13: { // moss cushion: dense stippled dome, lighter tips
      for (let k = 0; k < 2600; k++) {
        const a = R() * 6.283, d = Math.pow(R(), 0.7) * C * 0.44;
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.9, e = 1 - d / (C * 0.44);
        ctx.fillStyle = hsl(78 + 18 * R(), 0.5, 0.12 + 0.2 * e * R() + 0.04);
        ctx.fillRect(x, y, 3 + 3 * R(), 3 + 3 * R());
      }
      break;
    }
    case 15: { // pebbles and grit
      for (let k = 0; k < 26; k++) {
        const x = C * (0.1 + 0.8 * R()), y = C * (0.1 + 0.8 * R()), rx = C * (0.02 + 0.05 * R()), ry = rx * (0.6 + 0.4 * R());
        const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.3, 1, x, y, rx);
        const l = 0.2 + 0.18 * R();
        g.addColorStop(0, hsl(30 + 20 * R(), 0.08, l + 0.12)); g.addColorStop(1, hsl(30, 0.08, l - 0.12));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, R() * 3, 0, 6.283); ctx.fill();
      }
      break;
    }
    default: break;
  }
}

/** Draw the ground-cover atlas onto an OffscreenCanvas and return it. */
export function drawGroundAtlas() {
  const { size, cell, cols } = GC_ATLAS;
  const cv = new OffscreenCanvas(size, size), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  for (let id = 0; id < cols * cols; id++) {
    const col = id % cols, row = Math.floor(id / cols);
    ctx.save(); ctx.translate(col * cell, row * cell);
    ctx.beginPath(); ctx.rect(3, 3, cell - 6, cell - 6); ctx.clip();
    drawCell(ctx, id, cell, rng(id * 7919 + 17));
    ctx.restore();
  }
  return cv;
}
