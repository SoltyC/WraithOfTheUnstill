// Debug view of the wind field (PLAN.md M1 acceptance): a small map of the field around the player
// — speed as brightness, direction as ticks, the player at the centre, north up — redrawn a few
// times a second while its overlay toggle is on. Dev only: never shown in captures or by default.

const N = 32, CELL = 6, PX = 6; // 32 × 32 samples, 6 m apart (192 m across), 6 px each

/** @param {any} g  shared boot context (wind, controller, registerToggle) */
export function addWindView(g) {
  const { wind, controller, registerToggle, loop } = g;
  if (!wind || !registerToggle) return;
  let cv = null, ctx = null, acc = 0;
  const sp = new Float32Array(N * N), dx = new Float32Array(N * N), dz = new Float32Array(N * N);
  const show = (on) => {
    if (on && !cv) {
      cv = document.createElement('canvas'); cv.width = N * PX; cv.height = N * PX;
      Object.assign(cv.style, { position: 'fixed', right: '12px', bottom: '12px', zIndex: 9999, border: '1px solid #fff5', imageRendering: 'pixelated' });
      ctx = cv.getContext('2d');
      document.body.appendChild(cv);
    }
    if (cv) cv.style.display = on ? 'block' : 'none';
  };
  registerToggle({ key: 'windField', label: 'wind field (map)', group: 'World', on: false, onChange: show });
  g.windView = { show };
  loop.add({ name: 'windView', update: () => {
    if (!cv || cv.style.display === 'none') return;
    acc += g.clock.realDt; if (acc < 0.2) return; acc = 0;
    const p = controller.pos;
    // Speeds first; colour by this map's own range (fronts and bursts stand out at any strength).
    let lo = Infinity, hi = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      wind.sx = p.x + (i - N / 2) * CELL; wind.sz = p.z + (N / 2 - j) * CELL; wind.sample();
      const k = j * N + i; sp[k] = wind.speed; dx[k] = wind.outX; dz[k] = wind.outZ;
      if (wind.speed < lo) lo = wind.speed; if (wind.speed > hi) hi = wind.speed;
    }
    const span = Math.max(hi - lo, 1e-3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, v = (sp[k] - lo) / span;
      ctx.fillStyle = `rgb(${Math.round(20 + 225 * v)},${Math.round(50 + 170 * v)},${Math.round(110 + 60 * v)})`;
      ctx.fillRect(i * PX, j * PX, PX, PX);
      if ((i & 3) === 2 && (j & 3) === 2) {
        const cx = i * PX + PX / 2, cy = j * PX + PX / 2;
        ctx.strokeStyle = '#000c'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx[k] * 10, cy - dz[k] * 10); ctx.stroke();
      }
    }
    ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.fillText(`${lo.toFixed(2)}–${hi.toFixed(2)}`, 4, 12);
    ctx.fillStyle = '#f33'; ctx.fillRect(N * PX / 2 - 2, N * PX / 2 - 2, 4, 4);
  } });
}
