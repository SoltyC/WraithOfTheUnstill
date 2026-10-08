// The compass (user decision 2026-10-08): the one persistent element of the HUD, kept as quiet as
// the BRIEF's "no HUD by default" allows — a slim engraved strip of ink on a soft dark band at the
// top, fading to a whisper when the Wraith stands still and looks at nothing new, hidden in
// cinematics, menus and captures. Switchable (Settings: Always / Fade / Off).
//
// It shows the camera's heading (N E S W, the intermediate points, a tick every 5°), the places
// the Wraith knows (a small icon each), the goals of its quests (diamonds; the tracked one filled
// and gold, with its name and distance beneath; one pinned to the edge with an arrow when it is
// off to the side), and a world waypoint over the tracked goal when it is in view. Drawing is a
// 2D canvas redrawn only when something visible changed.

import { angleDiff, compassPoint, formatDistance } from '../../game/nav.js';

const TAU = Math.PI * 2;
const SPAN = (150 * Math.PI) / 180;          // the heading window shown (±75°)
const INK = '#ece4d2', DIM = 'rgba(236,228,210,0.55)', GOLD = '#f2dca0', COLD = '#a9cbea';
const FONT = '"IM Fell English", "Iowan Old Style", Georgia, serif';

export function createCompass() {
  const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.append(e); return e; };
  const root = el('div', 'compass', document.body);
  const cv = el('canvas', null, root);
  const label = el('div', 'compass-label', root);
  const activity = el('div', 'compass-activity', root);
  const waypoint = el('div', 'waypoint', document.body);
  el('div', 'mark', waypoint);
  const wpName = el('div', 'name', waypoint), wpDist = el('div', 'dist', waypoint);
  const g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let last = { heading: -9, sig: '', alpha: -1, w: 0 };
  let quiet = 0, lastHeading = 0, lastX = 0, lastZ = 0, lastTracked = '';
  let labelText = '', activityText = '', wpOn = false, wpKey = '', wpx = -999, wpy = -999;

  function size() {
    const w = Math.min(window.innerWidth * 0.5, 760), h = 48;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    if (Math.round(w) !== W || last.w !== dpr) {
      W = Math.round(w); H = h; last.w = dpr; last.sig = '';
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    }
  }
  /** Heading-relative x on the strip for a bearing offset `rel` (rad), or null when outside the window. */
  const xOf = (rel) => (Math.abs(rel) <= SPAN / 2 ? W / 2 + (rel / SPAN) * W : null);

  function icon(kind, x, y, s, col, filled) {
    g.save(); g.translate(x, y); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.4; g.lineJoin = 'round';
    g.beginPath();
    switch (kind) {
      case 'diamond': g.moveTo(0, -s); g.lineTo(s * 0.8, 0); g.lineTo(0, s); g.lineTo(-s * 0.8, 0); g.closePath(); break;
      case 'tents': g.moveTo(-s, s * 0.7); g.lineTo(-s * 0.3, -s * 0.8); g.lineTo(s * 0.3, s * 0.7); g.moveTo(-s * 0.1, s * 0.7); g.lineTo(s * 0.5, -s * 0.5); g.lineTo(s, s * 0.7); break;
      case 'arch': g.moveTo(-s * 0.9, s * 0.8); g.lineTo(-s * 0.9, -s * 0.2); g.arc(0, -s * 0.2, s * 0.9, Math.PI, 0); g.lineTo(s * 0.9, s * 0.8); break;
      case 'ring': g.ellipse(0, 0, s, s * 0.55, 0, 0, TAU); g.moveTo(s * 0.45, 0); g.ellipse(0, 0, s * 0.45, s * 0.25, 0, 0, TAU); break;
      case 'drop': g.moveTo(0, -s); g.quadraticCurveTo(s * 0.9, s * 0.2, 0, s * 0.9); g.quadraticCurveTo(-s * 0.9, s * 0.2, 0, -s); break;
      case 'stone': g.moveTo(-s * 0.35, s * 0.8); g.lineTo(-s * 0.45, -s * 0.2); g.lineTo(0, -s); g.lineTo(s * 0.45, -s * 0.1); g.lineTo(s * 0.35, s * 0.8); g.closePath(); break;
      case 'spark': g.moveTo(0, -s); g.lineTo(s * 0.18, -s * 0.18); g.lineTo(s, 0); g.lineTo(s * 0.18, s * 0.18); g.lineTo(0, s); g.lineTo(-s * 0.18, s * 0.18); g.lineTo(-s, 0); g.lineTo(-s * 0.18, -s * 0.18); g.closePath(); break;
      case 'claw': g.moveTo(-s * 0.7, s * 0.8); g.quadraticCurveTo(-s * 0.7, -s * 0.2, -s * 0.2, -s); g.moveTo(0, s * 0.8); g.quadraticCurveTo(0, -s * 0.2, s * 0.4, -s); g.moveTo(s * 0.7, s * 0.8); g.quadraticCurveTo(s * 0.8, -s * 0.2, s * 1.0, -s * 0.6); break;
      default: g.arc(0, 0, s * 0.6, 0, TAU);
    }
    if (filled) g.fill(); else g.stroke();
    g.restore();
  }

  function draw(nav, heading, alpha) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const mid = 24;
    // Hairline, ticks, letters.
    g.lineWidth = 1; g.strokeStyle = 'rgba(214,190,140,0.5)';
    g.beginPath(); g.moveTo(0, mid + 12.5); g.lineTo(W, mid + 12.5); g.stroke();
    const bAt = (deg) => angleDiff((deg * Math.PI) / 180, heading);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 5) {
      const x = xOf(bAt(d));
      if (x === null) continue;
      const major = d % 90 === 0, mid45 = d % 45 === 0, t15 = d % 15 === 0;
      const len = major ? 11 : mid45 ? 8 : t15 ? 6 : 3.5;
      g.strokeStyle = major ? INK : t15 ? 'rgba(236,228,210,0.8)' : 'rgba(236,228,210,0.45)';
      g.beginPath(); g.moveTo(x, mid + 12.5); g.lineTo(x, mid + 12.5 - len); g.stroke();
      if (major) {
        g.fillStyle = d === 0 ? GOLD : INK; g.font = `22px ${FONT}`;
        g.fillText(d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : 'W', x, mid - 2);
      } else if (mid45) {
        g.fillStyle = DIM; g.font = `14px ${FONT}`;
        g.fillText(d === 45 ? 'NE' : d === 135 ? 'SE' : d === 225 ? 'SW' : 'NW', x, mid + 1);
      } else if (d % 30 === 0) {
        g.fillStyle = 'rgba(236,228,210,0.38)'; g.font = `11px ${FONT}`;
        g.fillText(String(d), x, mid + 1);
      }
    }
    // Known places.
    for (const p of nav.places) {
      if (!p.known) continue;
      const x = xOf(p.rel); if (x === null) continue;
      const a = p.visited ? 0.4 : 0.85;
      g.globalAlpha = a;
      icon(p.icon, x, mid - 12, 5.5, p.visited ? DIM : COLD, false);
      g.globalAlpha = 1;
    }
    // Goals: the tracked one gold and filled; others hollow; optional ones dim.
    let edge = null;
    for (const q of nav.goals) {
      const isT = q.id === nav.tracked, x = xOf(q.rel);
      if (x === null) { if (isT) edge = q; continue; }
      g.globalAlpha = isT ? 1 : q.optional ? 0.45 : 0.75;
      icon('diamond', x, mid - 12, isT ? 7.5 : 5.5, isT ? GOLD : INK, isT);
      if (isT) { g.shadowColor = 'rgba(242,220,160,0.8)'; g.shadowBlur = 8; icon('diamond', x, mid - 12, 7.5, GOLD, true); g.shadowBlur = 0; }
      g.globalAlpha = 1;
    }
    if (edge) {
      const left = edge.rel < 0, x = left ? 12 : W - 12;
      g.fillStyle = GOLD; g.beginPath();
      if (left) { g.moveTo(x - 6, mid - 12); g.lineTo(x + 5, mid - 19); g.lineTo(x + 5, mid - 5); } else { g.moveTo(x + 6, mid - 12); g.lineTo(x - 5, mid - 19); g.lineTo(x - 5, mid - 5); }
      g.closePath(); g.fill();
    }
    // The heading mark: a small downward notch at the centre.
    g.fillStyle = GOLD; g.beginPath(); g.moveTo(W / 2 - 5, 1); g.lineTo(W / 2 + 5, 1); g.lineTo(W / 2, 8); g.closePath(); g.fill();
    g.globalAlpha = 1;
  }

  return {
    /** 'fade' | 'always' | 'off' (Settings). */
    mode: 'fade',
    /** Set by the owner: hide for cinematics, menus, captures. */
    hidden: false,
    /**
     * Per frame. `nav` is the navigation registry (already updated), `heading` the camera heading
     * (rad), (px, pz) the player, `dt` real seconds, `waypointOn` whether a world marker may show
     * and `project(x, y, z)` → [sx, sy] | null for it.
     */
    update(nav, heading, px, pz, dt, project) {
      const show = !this.hidden && this.mode !== 'off';
      root.classList.toggle('on', show);
      if (!show) { waypoint.classList.remove('on'); wpOn = false; return; }
      size();
      // Activity: turning, moving or a changed goal wakes it; it fades after 4 s.
      const moved = Math.abs(angleDiff(heading, lastHeading)) > 0.004 || (px - lastX) ** 2 + (pz - lastZ) ** 2 > 0.04;
      lastHeading = heading; lastX = px; lastZ = pz;
      const tg = nav.trackedGoal, tkey = tg ? tg.id : '';
      if (moved || tkey !== lastTracked) quiet = 0; else quiet += dt;
      lastTracked = tkey;
      const target = this.mode === 'always' ? 1 : quiet < 4 ? 1 : 0.38;
      const a = last.alpha < 0 ? target : last.alpha + (target - last.alpha) * Math.min(1, dt * 3);
      if (Math.abs(a - last.alpha) > 0.01) { root.style.opacity = a.toFixed(2); last.alpha = a; }
      // Redraw when something visible changed (heading to 0.1°, the goal/place signature).
      let sig = '';
      for (const p of nav.places) if (p.known) sig += p.id + (p.visited ? 'v' : '') + Math.round(p.rel * 400) + ',';
      for (const q of nav.goals) sig += q.id + Math.round(q.rel * 400) + (q.id === nav.tracked ? 't' : '') + ',';
      if (Math.abs(angleDiff(heading, last.heading)) > 0.0017 || sig !== last.sig) { last.heading = heading; last.sig = sig; draw(nav, heading, a); }
      // The caption under the strip: heading, and the tracked goal with its distance.
      const text = tg ? `${tg.name}  ·  ${formatDistance(tg.dist)}` : '';
      if (text !== labelText) { labelText = text; label.textContent = text; label.classList.toggle('on', text !== ''); }
      const deg = Math.round(((heading % TAU) + TAU) % TAU * 180 / Math.PI) % 360;
      const act = `${compassPoint(heading)} ${deg}°`;
      if (act !== activityText) { activityText = act; activity.textContent = act; }
      // The world waypoint over the tracked goal (in view, not too near).
      let on = false;
      if (tg && tg.dist > 22 && project) {
        const sp = project(tg.x, tg.y + 6, tg.z);
        if (sp !== null && sp[0] > 24 && sp[0] < window.innerWidth - 24 && sp[1] > 24 && sp[1] < window.innerHeight - 24) {
          on = true;
          const rx = Math.round(sp[0]), ry = Math.round(sp[1]);
          if (rx !== wpx || ry !== wpy) { wpx = rx; wpy = ry; waypoint.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`; }
          const key = tg.name + '|' + formatDistance(tg.dist);
          if (key !== wpKey) { wpKey = key; wpName.textContent = tg.name; wpDist.textContent = formatDistance(tg.dist); }
        }
      }
      if (on !== wpOn) { wpOn = on; waypoint.classList.toggle('on', on); }
    },
  };
}
