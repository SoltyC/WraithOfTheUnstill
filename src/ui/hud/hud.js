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
  // A passing NPC's ambient line (systems/barks.js): low, small, italic, fading on its own.
  const barkEl = el('div', 'bark', document.body);
  let barkTimer = 0;
  // One quiet line under the compass for what is happening now (a challenge's clock, the child
  // waiting, the flame guttering); the owner calls line() each frame — it redraws only on change.
  const taskEl = el('div', 'task-line', document.body);
  let taskText = '', taskAlarm = false, taskOwner = null;
  let ver = -1, glyphKey = null, glyphOn = false, gx = 0, gy = 0;

  const held = [], live = [];
  /** Fade a notice out and drop it (idempotent). */
  const fade = (n) => {
    const i = live.indexOf(n); if (i < 0) return;
    live.splice(i, 1); n.classList.remove('on'); setTimeout(() => n.remove(), 1300);
  };
  const q = new URLSearchParams(location.search);
  const titleUp = !(q.get('title') === '0' || q.get('capture') === '1' || q.get('shots') || q.get('bench'));
  const capture = q.get('capture') === '1';
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
      if (capture) return; // photo spots and gate shots show the world only
      if (self.hold) { held.push([kind, title, subText, secs]); return; }
      // Quiet by design (BRIEF §12): the same notice twice is one; at most two at once — a newer
      // one sends the oldest away early.
      for (const o of live) if (o.dataset.key === kind + '|' + title) return;
      while (live.length >= 2) fade(live[0]);
      const n = el('div', 'notice', notices);
      n.dataset.key = kind + '|' + title;
      live.push(n);
      el('div', 'kind', n).textContent = kind;
      el('div', 'title', n).textContent = title;
      if (subText) el('div', 'sub', n).textContent = subText;
      el('div', 'rule', n);
      requestAnimationFrame(() => n.classList.add('on'));
      setTimeout(() => fade(n), secs * 1000);
    },
    /** An ambient line from a passing NPC: "Name — line", for `secs`. */
    bark(name, text, secs = 5) {
      if (capture) return;
      barkEl.textContent = '';
      const b = el('b', null, barkEl); b.textContent = name;
      barkEl.append(' ' + text);
      barkEl.classList.add('on');
      clearTimeout(barkTimer);
      barkTimer = setTimeout(() => barkEl.classList.remove('on'), secs * 1000);
    },
    /** The task line: `owner` claims it while it has something to say (text '' releases it). */
    line(owner, text, alarm = false) {
      if (taskOwner !== null && taskOwner !== owner) { if (!text) return; }
      taskOwner = text ? owner : null;
      if (text === taskText && alarm === taskAlarm) return;
      taskText = text; taskAlarm = alarm;
      taskEl.textContent = text; taskEl.classList.toggle('on', !!text); taskEl.classList.toggle('alarm', alarm);
    },
    /** True while the title is up: notices wait, then show together when play begins. */
    hold: titleUp,
    release() { self.hold = false; for (const n of held.splice(0)) self.notice(n[0], n[1], n[2], n[3]); },
  };
  return self;
}
