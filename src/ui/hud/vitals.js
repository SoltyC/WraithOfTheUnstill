// Health and focus on screen (user, 2026-10-31, "a minimalistic health bar despite the brief"): a thin
// line low on the left — health warm ivory, each health thread a notch in it, focus a fainter cold
// hairline under it. It shows when something changes (a blow, a cast, a drink) and fades out again
// once both are full and nothing has changed for a while. The body still carries them too (the cowl
// light, the hand-light). Writes the DOM only when a value moves.

export function createVitals() {
  const el = (tag, cls, parent) => { const e = document.createElement(tag); e.className = cls; parent.append(e); return e; };
  const root = el('div', 'vitals', document.body);
  const hp = el('div', 'vbar hp', root), hpFill = el('i', 'fill', hp), hpLoss = el('i', 'loss', hp), notches = el('div', 'notches', hp);
  const fo = el('div', 'vbar focus', root), foFill = el('i', 'fill', fo);
  let shownH = -1, shownF = -1, shownMax = -1, shownOn = null, idle = 0, loss = 1, lossShown = -1, low = null;
  return {
    /** Per frame: health and its max, focus and its max, health segments (base + threads), dt, whether the bar is wanted. */
    update(health, maxHealth, focus, maxFocus, segments, dt, wanted) {
      const h = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0, f = maxFocus > 0 ? Math.max(0, Math.min(1, focus / maxFocus)) : 0;
      const changed = Math.abs(h - shownH) > 0.002 || Math.abs(f - shownF) > 0.004;
      idle = changed ? 0 : idle + dt;
      const on = wanted && (h < 0.999 || f < 0.999 || idle < 4);
      if (on !== shownOn) { shownOn = on; root.classList.toggle('on', on); }
      if (Math.abs(h - shownH) > 0.002) { if (h < shownH) loss = Math.max(loss, shownH); shownH = h; hpFill.style.transform = 'scaleX(' + h.toFixed(4) + ')'; }
      // The lost part lingers a moment, then drains to the new value.
      loss += (h - loss) * Math.min(1, dt * (loss > h + 0.001 ? 2.2 : 50));
      if (Math.abs(loss - lossShown) > 0.002) { lossShown = loss; hpLoss.style.transform = 'scaleX(' + Math.max(h, loss).toFixed(4) + ')'; }
      if (Math.abs(f - shownF) > 0.004) { shownF = f; foFill.style.transform = 'scaleX(' + f.toFixed(4) + ')'; }
      if (segments !== shownMax) {
        shownMax = segments; notches.replaceChildren();
        for (let k = 1; k < segments; k++) { const n = document.createElement('i'); n.style.left = (k / segments * 100).toFixed(2) + '%'; notches.append(n); }
      }
      const isLow = h < 0.3;
      if (isLow !== low) { low = isLow; root.classList.toggle('low', isLow); }
    },
  };
}
