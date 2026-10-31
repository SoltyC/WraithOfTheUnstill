// Screens (BRIEF §12): the title over the living world, and a parchment codex for pause, journal,
// map, shrine (rest, travel, Echoes), saves and settings. The world pauses beneath any codex page.
// Keys: Esc pause/back, J journal, M map. Pointer lock is released while a page is open.

import './menus.css';
import { createMap } from './map.js';
import { releaseAll } from '../../input/actions.js';
import { ownedRobes, wornRobe } from '../../game/robes.js';
import { BEASTS, sketchSvg } from '../../game/bestiary.js';
import { createEconomyPages } from './trade.js';
import { el, createCodex } from './codex.js';
import { remembranceTab } from './remembrance.js';
import { foundNookMarks } from '../../game/nooks.js';

const SETTINGS_KEY = 'wraith-settings';
const REST = [['Dawn', 6.2], ['Midday', 12.5], ['Dusk', 18.2], ['Night', 23]];

export function createMenus(g) {
  const { chapter, game, clock, input, music, sfx, params, controller, arm } = g;
  const map = createMap();
  const settings = { music: 0.8, sfx: 1, subtitles: 1, compass: 'fade', healthBar: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* private window */ }
  const applySettings = () => {
    music.volume = settings.music; sfx.setVolume(settings.sfx);
    if (g.compass) g.compass.mode = settings.compass;
    g.healthBarOn = settings.healthBar !== false;
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
    page = name; shrine = name === 'shrine' ? arg : shrine; if (name === 'map' && arg !== 'keep') mapView = null;
    sheet.replaceChildren();
    PAGES[name](arg);
    veil.classList.add('on');
  }
  function close() {
    if (!page) return;
    if (g.graphics && title.classList.contains('on')) profileEl.textContent = 'Graphics · ' + (g.graphics.isCustom() ? 'Custom' : g.graphics.graphics.preset);
    page = null; shrine = null;
    veil.classList.remove('on');
    clock.frozen = wasFrozen; input.gameHasFocus = !title.classList.contains('on'); releaseAll();
    g.canvas?.focus();
  }
  const { head, foot, actions, listPage, tabs } = createCodex(sheet);

  function journal(tab = 'quests') {
    head('Journal', 'What the Wraith has carried');
    tabs([['quests', 'Journeys'], ['inventory', 'Inventory'], ['robes', 'Robes'], ['echoes', 'Echoes'], ['lore', 'Lore'], ['beasts', 'Bestiary'], ['remembrance', 'Remembrance']], tab, (k) => open('journal', k));
    el('div', 'codex-rule', sheet);
    const j = chapter.journal();
    if (tab === 'quests') {
      const active = (k) => j.quests.filter((q) => q.kind === k && !q.done), done = j.quests.filter((q) => q.done);
      listPage([['Journeys', active('main')], ['Errands', active('side')], ['Finished', done]], (pg, q) => {
        el('h2', null, pg, q.title); el('div', 'summary', pg, q.summary);
        q.lines.forEach((line, i) => el('p', i < q.lines.length - 1 || q.done ? 'past' : null, pg, line));
        // Which errand the compass follows: this one, from here.
        if (!q.done && g.nav && g.nav.goals.some((x) => x.quest === q.id)) {
          const on = g.nav.trackedGoal && g.nav.trackedGoal.quest === q.id, b = el('button', 'robe-wear', pg, on ? 'Followed on the compass' : 'Follow on the compass');
          if (on) b.disabled = true; else b.onclick = () => { g.nav.trackQuest(q.id); open('journal'); };
        }
      }, 'Nothing yet. The robe is still learning to move.');
    } else if (tab === 'lore') {
      listPage([['Fragments', j.lore]], (pg, l) => { el('h2', null, pg, l.title); el('p', null, pg, l.text); }, 'No fragments found.');
    } else if (tab === 'beasts') {
      const vars = chapter.graph.vars;
      listPage([['Seen', BEASTS.filter((b) => vars['sketch:' + b.id]).map((b) => ({ ...b, title: b.name }))]], (pg, b) => {
        el('h2', null, pg, b.name);
        const fig = el('div', 'sketch-plate', pg);
        fig.innerHTML = sketchSvg(vars['sketch:' + b.id]);
        el('p', null, pg, b.text);
      }, 'Nothing sketched yet. The Shaped rise out of the snow; look at them long enough to draw.');
    } else if (tab === 'inventory' || tab === 'arms' || tab === 'pouch') {
      econ.inventoryTab(sheet, () => open('journal', 'inventory'));
    } else if (tab === 'remembrance') {
      remembranceTab({ el, listPage, rem: g.remembrance, elements: g.elements });
    } else if (tab === 'robes') {
      const flags = chapter.graph.flags, vars = chapter.graph.vars;
      const worn = wornRobe(flags, vars).id;
      listPage([['Robes', ownedRobes(flags).map((r) => ({ ...r, title: r.name, done: false }))]], (pg, r) => {
        el('h2', null, pg, r.name); el('div', 'summary', pg, r.how); el('p', null, pg, r.text);
        if (r.effect) el('p', 'echo-effect', pg, r.effect);
        if (r.defence) el('p', null, pg, 'Armour: turns aside ' + Math.round(r.defence * 100) + '% of a blow.');
        const b = el('button', 'robe-wear', pg, r.id === worn ? 'Worn' : 'Wear');
        if (r.id === worn) b.disabled = true; else b.onclick = () => { g.wearRobe?.(r.id); open('journal', 'robes'); };
      }, 'Only the robe it woke in.');
    } else {
      listPage([['Echoes', j.echoes.map((e) => ({ ...e, title: e.name }))]], (pg, e) => {
        el('h2', null, pg, e.name); el('p', 'summary', pg, e.text); el('p', 'echo-effect', pg, e.effect);
      }, 'No Echoes yet. They wait at shrines, and with those who kept the Shapers’ things.');
    }
    foot([['J', 'close'], ['I', 'inventory'], ['M', 'map'], ['Esc', 'back']]);
  }

  let mapView = null;
  async function mapPage() {
    // The view follows where the Wraith is (the frost steppe or the meadow), and can be switched.
    const view = mapView || (g.ws.biome === 'meadow' ? 'meadow' : 'frost');
    head(view === 'meadow' ? 'The Meadow of Hearn' : 'The Frost Steppe', 'Drawn as walked');
    const wrap = el('div', 'codex-map', sheet), cv = el('canvas', null, wrap);
    const marks = [];
    const T = chapter.table;
    if (view === 'frost') {
      marks.push({ x: T.monastery.pos[0], z: T.monastery.pos[1], name: 'The Monastery', kind: 'monastery' });
      marks.push({ x: T['camp-frost'].pos[0], z: T['camp-frost'].pos[1], name: 'The Pilgrims’ Fire', kind: 'camp' });
      marks.push({ x: T['spring-frost'].pos[0], z: T['spring-frost'].pos[1], name: 'The Sleeping Spring', kind: 'place' });
      marks.push({ x: T['varo-rise'].pos[0], z: T['varo-rise'].pos[1], name: 'The Watching Stone', kind: 'place' });
      marks.push({ x: T['warden-frost'].pos[0], z: T['warden-frost'].pos[1], name: g.ws.restoration.frost === 'restored' ? 'Where It Lay Down' : 'The Held Snow', kind: 'warden' });
    } else {
      const mp = T['meadow-market'].pos;
      marks.push({ x: mp[0], z: mp[1], name: 'Hearn', kind: 'camp' });
      marks.push({ x: T.manor.pos[0], z: T.manor.pos[1], name: g.ws.restoration.meadow === 'restored' ? 'Where It Lay Down' : 'The Manor', kind: 'warden' });
      // The places of the errands, once the Wraith has been near them (the same "known" the compass keeps).
      for (const id of ['side-fen-lamp', 'side-stone-ring', 'side-barley', 'side-edge', 'side-echo-shore']) if (chapter.graph.flags.has('known:' + id)) marks.push({ x: T[id].pos[0], z: T[id].pos[1], name: T[id].name, kind: 'place' });
    }
    const dr = g.economy && g.economy.drop;
    if (dr && dr.active) marks.push({ x: dr.x, z: dr.z, name: dr.marks + ' marks', kind: 'place' });
    // The nooks found (a nook not yet found is not on the map).
    marks.push(...foundNookMarks(g.pois, chapter.graph.flags, view));
    for (const p of g.pois) if (p.kind === 'shrine' && p.biome === view) marks.push({ x: p.pos[0], z: p.pos[1], name: null, kind: chapter.shrines.has(p.id) ? 'shrine-lit' : 'shrine' });
    foot([['M', 'close'], ['J', 'journal'], ['Esc', 'back']]);
    const sw = el('div', 'codex-actions', sheet);
    const other = view === 'frost' ? 'meadow' : 'frost';
    el('button', null, sw, other === 'meadow' ? 'The Meadow' : 'The Frost Steppe').onclick = () => { mapView = other; open('map', 'keep'); };
    await map.draw(cv, marks, controller.pos.x, controller.pos.z, arm.yaw, view);
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

  function settingsPage(section = 'graphics') {
    head('Settings', section === 'graphics' ? 'Presets for the hardware; each setting can be changed alone' : null);
    const wrap = el('div', 'settings', sheet);
    const nav = el('div', 'codex-list', wrap), body = el('div', 'codex-page', wrap);
    for (const [k, label] of [['graphics', 'Graphics'], ['interface', 'Interface'], ['sound', 'Sound'], ['controls', 'Controls']]) {
      const b = el('button', k === section ? 'on' : null, nav, label); b.onclick = () => open('settings', k);
    }
    const row = (label, hint) => { const r = el('div', 'codex-setting', body); el('span', null, r, label); const c = el('div', null, r); const o = el('output', null, r); if (hint) el('div', 'hint', r, hint); return { c, o }; };
    const slider = (label, get, set, min, max, step, fmt, hint) => {
      const { c, o } = row(label, hint);
      const i = el('input', null, c); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get(); o.textContent = fmt(get());
      i.oninput = () => { set(+i.value); o.textContent = fmt(+i.value); };
    };
    const toggle = (label, get, set, hint) => {
      const { c } = row(label, hint);
      const b = el('button', 'switch' + (get() ? ' on' : ''), c); b.setAttribute('aria-pressed', String(get()));
      b.onclick = () => { set(!get()); b.classList.toggle('on', get()); b.setAttribute('aria-pressed', String(get())); after(); };
    };
    const choice = (label, opts, get, set, hint) => {
      const { c } = row(label, hint);
      const sg = el('div', 'seg', c);
      for (const [v, t] of opts) { const b = el('button', get() === v ? 'on' : null, sg, t); b.onclick = () => { set(v); for (const x of sg.children) x.classList.remove('on'); b.classList.add('on'); after(); }; }
    };
    const pct = (v) => Math.round(v * 100) + '%';
    let after = () => {};
    if (section === 'graphics') {
      const G = g.graphics, gr = G.graphics;
      el('h3', null, body, 'Preset');
      const { c } = row(G.isCustom() ? 'Custom' : 'Preset', 'Low runs on integrated graphics; Ultra renders at full resolution.');
      const sg = el('div', 'seg', c);
      for (const name of G.PRESET_NAMES) { const b = el('button', gr.preset === name && !G.isCustom() ? 'on' : null, sg, name); b.onclick = () => { G.setPreset(name); open('settings', 'graphics'); }; }
      el('h3', null, body, 'Image');
      slider('Resolution', () => gr.renderScale, (v) => G.setGraphic('renderScale', v), 0.45, 1, 0.05, pct, 'The most it renders at; it steps down by itself to hold the frame rate.');
      slider('Frame target', () => 1000 / gr.targetMs, (v) => G.setGraphic('targetMs', 1000 / v), 30, 90, 5, (v) => Math.round(v) + ' fps');
      choice('Shadows', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => gr.shadows, (v) => G.setGraphic('shadows', v), 'Map detail and which trees cast. On restart.');
      choice('Grass', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => gr.grass, (v) => G.setGraphic('grass', v), 'Blades and how far they reach. On restart.');
      choice('Trees', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => gr.trees, (v) => G.setGraphic('trees', v), 'How many, and how far. On restart.');
      el('h3', null, body, 'Effects');
      toggle('Ambient occlusion', () => gr.ao, (v) => G.setGraphic('ao', v));
      toggle('Reflections', () => gr.ssr, (v) => G.setGraphic('ssr', v), 'On ice and wet ground.');
      toggle('Bloom', () => gr.bloom, (v) => G.setGraphic('bloom', v));
      toggle('Light shafts', () => gr.shafts, (v) => G.setGraphic('shafts', v));
      toggle('Clouds and weather fog', () => gr.clouds, (v) => G.setGraphic('clouds', v));
      toggle('Heat shimmer', () => gr.heat, (v) => G.setGraphic('heat', v));
      toggle('Mirage', () => gr.mirage, (v) => G.setGraphic('mirage', v));
      toggle('Sharpening', () => gr.sharpen, (v) => G.setGraphic('sharpen', v));
      toggle('Drifting snow and sand', () => gr.particles, (v) => G.setGraphic('particles', v), 'Spindrift and the grains off dune crests.');
      const rs = el('div', 'restart', body);
      after = () => {
        rs.replaceChildren();
        if (!G.needsRestart()) return;
        rs.append('Some changes apply when the game starts again.');
        const b = el('button', null, rs, 'Restart now'); b.onclick = async () => { if (started) await game.saves.save('auto').catch(() => {}); location.reload(); };
      };
      after();
    } else if (section === 'interface') {
      el('h3', null, body, 'On screen');
      toggle('Health bar', () => settings.healthBar, (v) => { settings.healthBar = v; applySettings(); }, 'A thin bar over the compass. Off: health shows only on the robe.');
      choice('Compass', [['fade', 'Fades'], ['always', 'Always'], ['off', 'Hidden']], () => settings.compass, (v) => { settings.compass = v; applySettings(); });
      slider('Subtitle size', () => settings.subtitles, (v) => { settings.subtitles = v; applySettings(); }, 0.8, 1.5, 0.05, pct);
    } else if (section === 'sound') {
      el('h3', null, body, 'Volume');
      slider('Music', () => settings.music, (v) => { settings.music = v; applySettings(); }, 0, 1, 0.05, pct);
      slider('Sounds', () => settings.sfx, (v) => { settings.sfx = v; applySettings(); }, 0, 1, 0.05, pct);
    } else {
      el('h3', null, body, 'Keys');
      const k = el('div', 'keys', body);
      for (const [a, b] of [['W A S D, mouse', 'Move, look'], ['Space', 'Jump; a stroke when swimming'], ['Ctrl', 'Dodge'], ['Right mouse (hold)', 'Surf; glide in the air; grip to climb'],
        ['1 – 3', 'Frost, Gale, Stone'], ['Q (tap / hold), F', 'The element\'s three verbs'], ['Left mouse', 'Weapon'], ['X', 'Swap weapon'], ['R / C', 'Use the marked item / move the mark'],
        ['E', 'Interact'], ['T', 'Follow another goal on the compass'], ['I', 'Inventory'], ['J', 'Journal'], ['M', 'Map'], ['Esc', 'Pause']]) { el('b', null, k, a); el('span', null, k, b); }
    }
    foot([['Esc', 'back']]);
  }

  function shrinePage(t) {
    head('Shrine', t.id.includes('meadow') ? 'The stones are warm in the grass' : 'The stones are warm under the frost');
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
    actions(right, dest.map((id) => [chapter.data.names?.[id] || 'Shrine ' + id.split('-').pop(), () => {
      const p = chapter.table[id].pos;
      close(); game.teleport(p[0] + 5, p[1] + 5);
    }]));
    foot([['Esc', 'leave']]);
  }

  const econ = createEconomyPages({ g, el, head, foot, tabs, listPage, sheet, open });
  const PAGES = { journal, map: mapPage, pause, saves, settings: settingsPage, shrine: shrinePage, trade: econ.trade, forge: econ.forge };
  // The talk interaction opens a trader's stall, or the smith's forge (data: { trade: 'corin' }).
  g.openTrade = (id) => open(id === 'garrow' ? 'forge' : 'trade', id === 'garrow' ? { id } : { id, tab: 'buy' });

  async function loadSlot(slot) {
    const s = await game.saves.load(slot);
    if (s) { map.restore(s.journal.map); g.musicState.waking = false; g.musicState.title = false; }
    return s;
  }

  // Keys while a page is open (the game's input is off then).
  window.addEventListener('keydown', (e) => {
    if (!page) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      // The Esc that released the pointer (and opened this page) must not close it again.
      if (performance.now() - openedAt < 400) return;
      close();
    }
    else if (title.classList.contains('on')) return;
    else if (e.code === 'KeyJ') page === 'journal' ? close() : open('journal');
    else if (e.code === 'KeyM') page === 'map' ? close() : open('map');
  });
  // I: the inventory (the journal's Inventory tab), in play or from another page.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyI' || title.classList.contains('on') || !started || chapter.talking) return;
    if (page === 'journal') close();
    else if (page || input.gameHasFocus) open('journal', 'inventory');
  });
  // Losing pointer lock in play (Esc) opens the pause page.
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && !page && started && !title.classList.contains('on') && !chapter.talking) open('pause');
  });

  // ---- Title screen.
  const title = el('div', 'title-screen', document.body);
  el('div', 'bar top', title); el('div', 'bar bottom', title);
  const card = el('div', 'card', title);
  el('div', 'mark', card);
  const nm = el('div', 'name', card); el('small', null, nm, 'A Shaper’s robe, waking'); nm.append('The Wraith', el('br'), 'of the Unstill');
  el('div', 'rule', card);
  const titleActions = el('div', 'menu', card);
  el('div', 'credit', title, 'Frost Steppe · Chapter One');
  const profileEl = el('div', 'profile', title);
  let started = false;
  async function showTitle() {
    title.classList.add('on'); g.musicState.title = true; input.gameHasFocus = false; // the world keeps living behind it
    g.hud.hold = true;                       // no quest notices over the title
    g.titleCam?.start();                     // the slow bird's-eye orbit over the frost mountains
    const G = g.graphics;
    if (G) profileEl.textContent = 'Graphics · ' + (G.isCustom() ? 'Custom' : G.graphics.preset);
    const list = await game.saves.list().catch(() => []);
    titleActions.replaceChildren();
    // Begin / Continue: the title lifts, the camera swoops from the heights down to the Wraith in the
    // monastery, and only then does play (and the HUD) begin.
    const begin = async (pre, card) => {
      title.classList.remove('on'); title.classList.add('leaving'); g.musicState.title = false;
      if (pre) await pre();
      await g.titleCam?.dive(card);
      title.classList.remove('leaving');
      input.gameHasFocus = true; started = true; g.hud.release(); g.canvas?.focus();
    };
    actions(titleActions, [
      ['Continue', () => begin(() => loadSlot(list[0].slot)), !list.length],
      ['Begin', () => { g.musicState.waking = true; begin(null, { kicker: 'The Frost Steppe', name: 'The Shapers’ Monastery' }); }],
      ['Settings', () => { open('settings', 'graphics'); }],
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
