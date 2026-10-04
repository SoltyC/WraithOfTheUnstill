// In-game text UI (BRIEF §12): subtitles with at most one choice, the interaction glyph projected
// onto the thing in reach, and quiet notices (journal, Echo, lore). DOM is built once; per frame
// only the glyph's transform changes, and text is rewritten only when the chapter's line changes.

import './hud.css';

export function createHud() {
  const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.append(e); return e; };
  const sub = el('div', 'subtitles', document.body);
  const who = el('div', 'who', sub), line = el('div', 'line', sub), opts = el('div', 'options', sub);
  const glyph = el('div', 'glyph', document.body);
  el('div', 'mark', glyph);
  const label = el('div', 'label', glyph);
  const notices = el('div', 'notices', document.body);
  let ver = -1, glyphKey = null, glyphOn = false, gx = 0, gy = 0;

  const self = {
    /** Choice picked by a click (index), consumed by the chapter system. */
    clicked: -1,
    /** Show the chapter's current line (redraws only when `v` changed). */
    subtitles(cur, v) {
      if (v === ver) return;
      ver = v;
      if (!cur) { sub.classList.remove('on'); return; }
      who.textContent = cur.name || '';
      opts.replaceChildren();
      if (cur.options) {
        line.textContent = '';
        cur.options.forEach((t, i) => {
          const b = el('button', null, opts);
          const k = el('span', 'key', b); k.textContent = String(i + 1);
          b.append(t);
          b.onclick = () => { self.clicked = i; };
        });
      } else {
        line.textContent = cur.text;
        line.classList.toggle('narration', !cur.speaker);
      }
      sub.classList.add('on');
    },
    /** The glyph at screen (x, y) px for target { verb, name }, or hidden (on = false). */
    glyph(on, x, y, target) {
      if (on !== glyphOn) { glyph.classList.toggle('on', on); glyphOn = on; }
      if (!on) return;
      const rx = Math.round(x), ry = Math.round(y);
      if (rx !== gx || ry !== gy) { gx = rx; gy = ry; glyph.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -100%)`; }
      if (target !== glyphKey) {
        glyphKey = target; label.innerHTML = '';
        const b = el('b', null, label); b.textContent = 'E';
        label.append(target.verb + (target.name ? ' · ' + target.name : ''));
      }
    },
    /** A notice: kind (small caps), title, optional subtitle; fades after `secs`. */
    notice(kind, title, subText, secs = 6) {
      const n = el('div', 'notice', notices);
      el('div', 'kind', n).textContent = kind;
      el('div', 'title', n).textContent = title;
      if (subText) el('div', 'sub', n).textContent = subText;
      el('div', 'rule', n);
      requestAnimationFrame(() => n.classList.add('on'));
      setTimeout(() => { n.classList.remove('on'); setTimeout(() => n.remove(), 1300); }, secs * 1000);
    },
  };
  return self;
}
