// Screens (BRIEF §12): the title over the living world, and a parchment codex for pause, journal,
// map, shrine (rest, travel, Echoes), saves and settings. The world pauses beneath any codex page.
// Keys: Esc pause/back, J journal, M map. Pointer lock is released while a page is open.

import './menus.css';
import { createMap } from './map.js';
import { releaseAll } from '../../input/actions.js';

const SETTINGS_KEY = 'wraith-settings';
const REST = [['Dawn', 6.2], ['Midday', 12.5], ['Dusk', 18.2], ['Night', 23]];

export function createMenus(g) {
  const { chapter, game, clock, input, music, sfx, params, controller, arm } = g;
  const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; if (parent) parent.append(e); return e; };
  const map = createMap();
  const settings = { music: 0.8, sfx: 1, subtitles: 1, compass: 'fade' };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* private window */ }
  const applySettings = () => {
    music.volume = settings.music; sfx.setVolume(settings.sfx);
    if (g.compass) g.compass.mode = settings.compass;
    document.documentElement.style.setProperty('--sub-scale', String(settings.subtitles));
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  };
  applySettings();

  const veil = el('div', 'codex-veil', document.body);
  const sheet = el('div', 'parchment', veil);
  let page = null, shrine = null, wasFrozen = false;

  let openedAt = 0;
  function open(name, arg) {
    openedAt = performance.now();
    releaseAll();
    if (!page) { wasFrozen = clock.frozen; clock.frozen = true; input.gameHasFocus = false; document.exitPointerLock?.(); }
    page = name; shrine = name === 'shrine' ? arg : shrine;
    sheet.replaceChildren();
    PAGES[name](arg);
    veil.classList.add('on');
  }
  function close() {
    if (!page) return;
    page = null; shrine = null;
    veil.classList.remove('on');
    clock.frozen = wasFrozen; input.gameHasFocus = true; releaseAll();
    g.canvas?.focus();
  }
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

  function journal(tab = 'quests') {
    head('Journal', 'What the Wraith has carried');
    tabs([['quests', 'Journeys'], ['lore', 'Lore'], ['echoes', 'Echoes']], tab, (k) => open('journal', k));
    el('div', 'codex-rule', sheet);
    const j = chapter.journal();
    if (tab === 'quests') {
      const active = (k) => j.quests.filter((q) => q.kind === k && !q.done), done = j.quests.filter((q) => q.done);
      listPage([['Journeys', active('main')], ['Errands', active('side')], ['Finished', done]], (pg, q) => {
        el('h2', null, pg, q.title); el('div', 'summary', pg, q.summary);
        q.lines.forEach((line, i) => el('p', i < q.lines.length - 1 || q.done ? 'past' : null, pg, line));
      }, 'Nothing yet. The robe is still learning to move.');
    } else if (tab === 'lore') {
      listPage([['Fragments', j.lore]], (pg, l) => { el('h2', null, pg, l.title); el('p', null, pg, l.text); }, 'No fragments found.');
    } else {
      listPage([['Echoes', j.echoes.map((e) => ({ ...e, title: e.name }))]], (pg, e) => {
        el('h2', null, pg, e.name); el('p', 'summary', pg, e.text); el('p', 'echo-effect', pg, e.effect);
      }, 'No Echoes yet. They wait at shrines, and with those who kept the Shapers’ things.');
    }
    foot([['J', 'close'], ['M', 'map'], ['Esc', 'back']]);
  }

  async function mapPage() {
    head('The Frost Steppe', 'Drawn as walked');
    const wrap = el('div', 'codex-map', sheet), cv = el('canvas', null, wrap);
    const marks = [];
    const T = chapter.table;
    marks.push({ x: T.monastery.pos[0], z: T.monastery.pos[1], name: 'The Monastery', kind: 'monastery' });
    marks.push({ x: T['camp-frost'].pos[0], z: T['camp-frost'].pos[1], name: 'The Pilgrims’ Fire', kind: 'camp' });
    marks.push({ x: T['spring-frost'].pos[0], z: T['spring-frost'].pos[1], name: 'The Sleeping Spring', kind: 'place' });
    marks.push({ x: T['varo-rise'].pos[0], z: T['varo-rise'].pos[1], name: 'The Watching Stone', kind: 'place' });
    marks.push({ x: T['warden-frost'].pos[0], z: T['warden-frost'].pos[1], name: g.ws.restoration.frost === 'restored' ? 'Where It Lay Down' : 'The Held Snow', kind: 'warden' });
    for (let k = 1; k <= 5; k++) { const id = 'shrine-frost-' + k, p = T[id]; marks.push({ x: p.pos[0], z: p.pos[1], name: null, kind: chapter.shrines.has(id) ? 'shrine-lit' : 'shrine' }); }
    foot([['M', 'close'], ['J', 'journal'], ['Esc', 'back']]);
    await map.draw(cv, marks, controller.pos.x, controller.pos.z, arm.yaw);
  }

  function pause() {
    head('The Wraith of the Unstill', 'Held still, for a moment');
    const body = el('div', 'codex-body', sheet);
    actions(body, [
      ['Resume', close],
      ['Journal', () => open('journal')],
      ['Map', () => open('map')],
      ['Save', () => open('saves', 'save')],
      ['Load', () => open('saves', 'load')],
      ['Settings', () => open('settings')],
    ]);
    const pg = el('div', 'codex-page', body);
    const active = chapter.journal().quests.filter((q) => !q.done && q.kind === 'main')[0];
    if (active) { el('h2', null, pg, active.title); el('p', null, pg, active.lines[active.lines.length - 1]); }
    foot([['Esc', 'resume'], ['J', 'journal'], ['M', 'map']]);
  }

  async function saves(mode) {
    head(mode === 'save' ? 'Save' : 'Load', mode === 'save' ? 'Set the world down where it is' : 'Return to a held moment');
    const body = el('div', 'codex-body', sheet);
    const list = await game.saves.list().catch(() => []);
    const by = Object.fromEntries(list.map((r) => [r.slot, r]));
    const label = (slot) => {
      const r = by[slot]; if (!r) return 'Empty';
      const d = new Date(r.updatedAt), t = r.summary?.timeOfDay ?? 0;
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')} in the world`;
    };
    const slots = mode === 'save' ? ['slot1', 'slot2', 'slot3'] : ['auto', 'slot1', 'slot2', 'slot3'];
    actions(body, slots.map((s) => [
      (s === 'auto' ? 'Autosave' : 'Page ' + s.slice(4)),
      async () => {
        if (mode === 'save') { await game.saves.save(s); open('saves', 'save'); }
        else { close(); await loadSlot(s); }
      },
      mode === 'load' && !by[s], label(s),
    ]));
    foot([['Esc', 'back']]);
  }

  function settingsPage() {
    head('Settings');
    const body = el('div', 'codex-page', sheet);
    const row = (label, key, min, max, step, fmt) => {
      const r = el('label', 'codex-setting', body);
      el('span', null, r, label);
      const i = el('input', null, r); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = settings[key];
      const o = el('output', null, r, fmt(settings[key]));
      i.oninput = () => { settings[key] = +i.value; o.textContent = fmt(+i.value); applySettings(); };
    };
    const pct = (v) => Math.round(v * 100) + '%';
    row('Music', 'music', 0, 1, 0.05, pct);
    row('Sounds', 'sfx', 0, 1, 0.05, pct);
    row('Subtitle size', 'subtitles', 0.8, 1.5, 0.05, pct);
    const cr = el('div', 'codex-setting', body); el('span', null, cr, 'Compass');
    const cw = el('div', 'codex-actions', cr);
    const MODES = [['fade', 'Fades when idle'], ['always', 'Always shown'], ['off', 'Hidden']];
    const cb = el('button', null, cw, MODES.find((m) => m[0] === settings.compass)[1]);
    cb.onclick = () => { const i = MODES.findIndex((m) => m[0] === settings.compass); settings.compass = MODES[(i + 1) % 3][0]; cb.textContent = MODES[(i + 1) % 3][1]; applySettings(); };
    foot([['Esc', 'back']]);
  }

  function shrinePage(t) {
    head('Shrine', 'The stones are warm under the frost');
    const body = el('div', 'codex-body', sheet);
    const left = el('div', null, body);
    el('div', 'codex-sub', left, 'Rest until');
    actions(left, REST.map(([name, tod]) => [name, () => { params.v.timeOfDay = tod; params.version++; g.weather.snap = true; g.post.post.resetHistory = true; close(); }]));
    const right = el('div', 'codex-page', body);
    // Echoes carried: attune them here (their effect from now on).
    const carried = [...chapter.echoes].sort();
    if (carried.length) {
      el('h2', null, right, 'Echoes');
      for (const id of carried) {
        const e = chapter.data.echoes[id];
        if (chapter.attuned(id)) { const p = el('p', 'past', right, e.name + ' \u2014 attuned. '); el('span', 'echo-effect', p, e.effect); }
        else {
          el('p', null, right, e.name + ': ' + e.text);
          actions(right, [['Attune', () => { chapter.attune(id); open('shrine', t); }, false, e.effect]]);
        }
      }
    }
    el('h2', null, right, 'Travel');
    const dest = [...chapter.shrines].filter((id) => id !== t.id).sort();
    if (!dest.length) el('p', 'codex-empty', right, 'Rest at other shrines, and the stones will carry you between them.');
    actions(right, dest.map((id) => ['Shrine ' + id.split('-').pop(), () => {
      const p = chapter.table[id].pos;
      close(); game.teleport(p[0] + 5, p[1] + 5);
    }]));
    foot([['Esc', 'leave']]);
  }

  const PAGES = { journal, map: mapPage, pause, saves, settings: settingsPage, shrine: shrinePage };

  async function loadSlot(slot) {
    const s = await game.saves.load(slot);
    if (s) { map.restore(s.journal.map); g.musicState.waking = false; g.musicState.title = false; }
    return s;
  }

  // Keys while a page is open (the game's input is off then).
  window.addEventListener('keydown', (e) => {
    if (title.classList.contains('on')) return;
    if (!page) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      // The Esc that released the pointer (and opened this page) must not close it again.
      if (performance.now() - openedAt < 400) return;
      page === 'pause' ? close() : open('pause');
    }
    else if (e.code === 'KeyJ') page === 'journal' ? close() : open('journal');
    else if (e.code === 'KeyM') page === 'map' ? close() : open('map');
  });
  // Losing pointer lock in play (Esc) opens the pause page.
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && !page && started && !title.classList.contains('on') && !chapter.talking) open('pause');
  });

  // ---- Title screen.
  const title = el('div', 'title-screen', document.body);
  el('div', 'mark', title);
  const nm = el('div', 'name', title); el('small', null, nm, 'A Shaper’s robe, waking'); nm.append('The Wraith', el('br'), 'of the Unstill');
  const titleActions = el('div', null, title);
  let started = false;
  async function showTitle() {
    title.classList.add('on'); g.musicState.title = true; input.gameHasFocus = false; // the world keeps living behind it
    const list = await game.saves.list().catch(() => []);
    titleActions.replaceChildren();
    const begin = () => { title.classList.remove('on'); g.musicState.title = false; input.gameHasFocus = true; started = true; g.canvas?.focus(); };
    actions(titleActions, [
      ['Continue', async () => { begin(); await loadSlot(list[0].slot); }, !list.length],
      ['Begin', () => { begin(); g.musicState.waking = true; }],
      ['Settings', () => { open('settings'); }],
    ]);
  }

  return {
    map, settings, open, close, showTitle, loadSlot,
    get open_() { return page; },
    /** Per frame: keys in play, fog of war. */
    update() {
      if (!page && started && input.gameHasFocus) {
        if (input.pressed[g.Action.Pause]) open('pause');
        else if (input.pressed[g.Action.Journal]) open('journal');
        else if (input.pressed[g.Action.Map]) open('map');
      }
      if (clock.frame % 20 === 0) map.reveal(controller.pos.x, controller.pos.z);
    },
    get started() { return started; }, set started(v) { started = v; },
  };
}
