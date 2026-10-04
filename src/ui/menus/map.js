// The parchment map (BRIEF §11): hand-drawn look, revealed by exploring, no minimap. The land is
// drawn from the baked overview heights (8 m) as ink: hill shading in sepia washes, contours every
// 100 m (every 500 m heavier), and the places the Wraith has found, lettered. Unexplored land is
// bare parchment. Exploration is a 64 × 64 grid of 125 m cells over the continent, saved as base64.

const N = 64, CELL = 8192 / N, REVEAL = 260;
/** Frost chapter view: world x/z bounds. */
const VIEW = { x0: -3700, x1: 4100, z0: 600, z1: 4000 };

export function createMap() {
  const explored = new Uint8Array(N * N);
  let heights = null, base = null, loading = null;

  function cellOf(x, z) { const i = Math.floor((x + 4096) / CELL), j = Math.floor((4096 - z) / CELL); return i >= 0 && j >= 0 && i < N && j < N ? j * N + i : -1; }

  async function loadHeights() {
    const m = await (await fetch('world/manifest.json')).json();
    const buf = await (await fetch('world/' + (m.height.overview.file || 'height_overview.u16'))).arrayBuffer();
    heights = { data: new Uint16Array(buf), n: m.height.overview.size, texel: m.height.overview.texel };
  }
  function h(x, z) {
    const n = heights.n, i = Math.min(n - 1, Math.max(0, Math.floor((x + 4096) / heights.texel))), j = Math.min(n - 1, Math.max(0, Math.floor((4096 - z) / heights.texel)));
    return heights.data[j * n + i] / 32 - 128;
  }

  /** The land itself, drawn once: sepia hill shading and contour lines. */
  function drawBase(W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    const sx = (VIEW.x1 - VIEW.x0) / W, sz = (VIEW.z1 - VIEW.z0) / H;
    const hs = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) hs[y * W + x] = h(VIEW.x0 + x * sx, VIEW.z1 - y * sz);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const k = y * W + x, v = hs[k];
      const dx = (hs[k + 1] - hs[k - 1]) / (2 * sx), dz = (hs[k - W] - hs[k + W]) / (2 * sz);
      // Light from the north-west, as on old maps.
      const shade = Math.max(0, Math.min(1, 0.55 - (dx * -0.7 + dz * 0.7) * 1.4));
      const slope = Math.min(1, Math.hypot(dx, dz) * 1.6);
      let ink = (1 - shade) * 0.55 * slope + slope * 0.12;
      // Contours: 100 m, heavier every 500 m.
      const c100 = Math.abs(((v + 50) % 100) - 50), c500 = Math.abs(((v + 250) % 500) - 250);
      const px = Math.max(0.6, Math.hypot(dx * sx, dz * sz));
      if (c500 < px * 1.1) ink = Math.max(ink, 0.75); else if (c100 < px * 0.7) ink = Math.max(ink, 0.38);
      // Water and low ground: a faint wash.
      if (v < 2) ink = Math.max(ink, 0.18);
      const o = k * 4;
      d[o] = 58; d[o + 1] = 38; d[o + 2] = 18; d[o + 3] = Math.round(Math.min(1, ink) * 230);
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  const self = {
    explored,
    /** Reveal around the Wraith (called a few times a second). */
    reveal(x, z) {
      for (let dz = -REVEAL; dz <= REVEAL; dz += CELL / 2) for (let dx = -REVEAL; dx <= REVEAL; dx += CELL / 2) {
        if (dx * dx + dz * dz > REVEAL * REVEAL) continue;
        const c = cellOf(x + dx, z + dz);
        if (c >= 0) explored[c] = 1;
      }
    },
    serialize() { let s = ''; for (let i = 0; i < explored.length; i += 8) { let b = 0; for (let k = 0; k < 8; k++) b |= explored[i + k] << k; s += String.fromCharCode(b); } return btoa(s); },
    restore(str) {
      explored.fill(0);
      if (!str) return;
      const s = atob(str);
      for (let i = 0; i < s.length; i++) { const b = s.charCodeAt(i); for (let k = 0; k < 8; k++) explored[i * 8 + k] = (b >> k) & 1; }
    },
    /**
     * Draw the map into canvas `cv`: land where explored (soft edges), the places found, the
     * Wraith. marks: [{ x, z, name, kind: 'shrine'|'shrine-lit'|'camp'|'monastery'|'warden'|'place' }].
     */
    async draw(cv, marks, px, pz, yaw) {
      const W = 1540, H = Math.round(W * (VIEW.z1 - VIEW.z0) / (VIEW.x1 - VIEW.x0));
      cv.width = W; cv.height = H;
      if (!heights) { loading ||= loadHeights(); await loading; }
      base ||= drawBase(W, H);
      const g = cv.getContext('2d');
      g.clearRect(0, 0, W, H);
      // Fog of war: a soft mask of explored cells.
      const mask = document.createElement('canvas'); mask.width = W; mask.height = H;
      const mg = mask.getContext('2d');
      const toX = (x) => (x - VIEW.x0) / (VIEW.x1 - VIEW.x0) * W, toY = (z) => (VIEW.z1 - z) / (VIEW.z1 - VIEW.z0) * H;
      mg.filter = 'blur(10px)';
      mg.fillStyle = '#000';
      const cw = CELL / (VIEW.x1 - VIEW.x0) * W;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (!explored[j * N + i]) continue;
        const x = -4096 + i * CELL, z = 4096 - j * CELL;
        mg.beginPath(); mg.arc(toX(x + CELL / 2), toY(z - CELL / 2), cw * 0.85, 0, Math.PI * 2); mg.fill();
      }
      g.drawImage(base, 0, 0);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-over';
      // Places.
      g.textAlign = 'center';
      for (const m of marks) {
        const x = toX(m.x), y = toY(m.z);
        if (x < 0 || y < 0 || x > W || y > H) continue;
        if (!explored[cellOf(m.x, m.z)]) continue;
        g.strokeStyle = '#3a2614'; g.fillStyle = '#3a2614'; g.lineWidth = 1.6;
        if (m.kind.startsWith('shrine')) {
          g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.strokeRect(-6, -6, 12, 12);
          if (m.kind === 'shrine-lit') { g.fillStyle = '#2f5a73'; g.fillRect(-3, -3, 6, 6); }
          g.restore();
        } else if (m.kind === 'monastery') {
          g.beginPath(); g.moveTo(x - 10, y + 7); g.lineTo(x, y - 9); g.lineTo(x + 10, y + 7); g.closePath(); g.stroke();
          g.beginPath(); g.arc(x, y + 1, 2.5, 0, Math.PI * 2); g.fill();
        } else if (m.kind === 'camp') {
          for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x + k * 9 - 5, y + 6); g.lineTo(x + k * 9, y - 5); g.lineTo(x + k * 9 + 5, y + 6); g.stroke(); }
        } else if (m.kind === 'warden') {
          g.beginPath(); g.ellipse(x, y, 16, 7, -0.3, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.ellipse(x, y, 9, 3.5, -0.3, 0, Math.PI * 2); g.stroke();
        } else { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
        if (m.name) { g.font = 'italic 19px "IM Fell English", serif'; g.fillStyle = '#3a2614'; g.fillText(m.name, x, y - 14); }
      }
      // The Wraith: a small hooded mark pointing where it faces.
      const wx = toX(px), wy = toY(pz);
      g.save(); g.translate(wx, wy); g.rotate(yaw);
      g.fillStyle = '#1d2a33'; g.beginPath(); g.moveTo(0, -11); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill();
      g.restore();
      // Compass rose, lower right.
      g.save(); g.translate(W - 70, H - 70); g.strokeStyle = '#3a2614'; g.lineWidth = 1.2;
      g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(0, -42); g.lineTo(6, 0); g.lineTo(0, 42); g.lineTo(-6, 0); g.closePath(); g.stroke();
      g.font = '18px "IM Fell English", serif'; g.fillStyle = '#3a2614'; g.fillText('N', 0, -48);
      g.restore();
    },
  };
  return self;
}
