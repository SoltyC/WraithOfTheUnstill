// The codex's building blocks (BRIEF §12): the parchment page's header, key line, action list,
// two-column list page and tabs, over a sheet element. Shared by the screens (menus.js, trade.js)
// and the page-shot harness (tools/capture/economy-pages.html).

/** Make an element: tag, class, parent, text. */
export const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; if (parent) parent.append(e); return e; };

/** @param {HTMLElement} sheet */
export function createCodex(sheet) {
  function head(title, sub) {
    const h = el('div', 'codex-head', sheet);
    el('div', 'codex-title', h, title);
    if (sub) el('div', 'codex-sub', h, sub);
    el('div', 'codex-rule', sheet);
  }
  function foot(keys) {
    const f = el('div', 'codex-foot', sheet);
    for (const [k, t] of keys) { const s = el('span', null, f); el('b', null, s, k); s.append(t); }
  }
  function actions(parent, list) {
    const a = el('div', 'codex-actions', parent);
    for (const [label, fn, disabled, note] of list) {
      const b = el('button', null, a, label);
      if (disabled) b.disabled = true; else b.onclick = fn;
      if (note) el('div', 'note', a, note);
    }
    return a;
  }
  /** Two columns: a list on the left, the page for the chosen item on the right. */
  function listPage(groups, render, empty) {
    const body = el('div', 'codex-body', sheet);
    const list = el('div', 'codex-list', body), pg = el('div', 'codex-page', body);
    let first = null;
    for (const [group, items] of groups) {
      if (!items.length) continue;
      el('div', 'group', list, group);
      for (const it of items) {
        const b = el('button', it.done ? 'done' : null, list, it.title);
        b.onclick = () => { for (const x of list.querySelectorAll('button')) x.classList.remove('on'); b.classList.add('on'); pg.replaceChildren(); render(pg, it); };
        first ||= b;
      }
    }
    if (first) first.click(); else el('div', 'codex-empty', pg, empty);
  }
  function tabs(names, current, go) {
    const t = el('div', 'codex-tabs', sheet);
    for (const [k, label] of names) { const b = el('button', k === current ? 'on' : null, t, label); b.onclick = () => go(k); }
  }
  return { head, foot, actions, listPage, tabs };
}
