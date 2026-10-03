// World tools section of the dev overlay: teleport, photo spots, weather override,
// stilled/restored, free camera, god mode, spawn (later phases), and save/load slots.

import poiData from '../../../data/world/pois.json';
import { photoSpots, currentViewAsSpot } from '../photoSpots.js';
import { worldState, WEATHER_STATES, BIOMES } from '../../game/worldState.js';

/** @param {any} game @param {Function} el */
export function buildWorldTools(game, el) {
  const root = el('div');
  const h = (t) => root.append(el('h3', null, t));

  // Teleport.
  h('Teleport');
  const poiSel = el('select');
  for (const p of poiData.pois) poiSel.append(el('option', { value: p.id }, p.id + ' (' + p.biome + ')'));
  root.append(el('div', { class: 'row' }, poiSel, el('button', {
    onclick: () => { const p = poiData.pois.find((x) => x.id === poiSel.value); game.teleport(p.pos[0], p.pos[1]); },
  }, 'Go')));

  // Photo spots.
  h('Photo spots');
  const spotSel = el('select');
  for (const s of photoSpots) spotSel.append(el('option', { value: s.id }, s.id));
  const copyNote = el('span', { class: 'note' });
  root.append(
    el('div', { class: 'row' }, spotSel, el('button', { onclick: () => game.applySpot(photoSpots.find((s) => s.id === spotSel.value)) }, 'Go')),
    el('div', { class: 'row' }, el('button', {
      onclick: async () => {
        const json = JSON.stringify(currentViewAsSpot('new-spot', game.arm, game.controller));
        console.log('[photo-spot]', json);
        try { await navigator.clipboard.writeText(json); copyNote.textContent = 'copied'; } catch { copyNote.textContent = 'logged to console'; }
      },
    }, 'Copy view as spot'), copyNote),
  );

  // Weather and restoration (state only until Phase 6 / Phase 5 give them visuals).
  h('Weather & restoration');
  const wSel = el('select', { onchange: (e) => { worldState.weather = e.target.value; } });
  for (const w of WEATHER_STATES[worldState.biome]) wSel.append(el('option', { value: w }, w));
  root.append(el('div', { class: 'row' }, el('label', null, 'Weather (' + worldState.biome + ')'), wSel));
  const restRow = el('div', { class: 'toggles' });
  for (const b of BIOMES) {
    const cb = el('input', { type: 'checkbox', checked: worldState.restoration[b] === 'restored', onchange: (e) => { worldState.restoration[b] = e.target.checked ? 'restored' : 'stilled'; } });
    restRow.append(el('label', { class: 'toggle' }, cb, b + ' restored'));
  }
  root.append(restRow, el('div', { class: 'note' }, 'Weather and restoration are world state only until Phases 5–6 render them.'));

  // Camera and player.
  h('Camera & player');
  const free = el('input', { type: 'checkbox', onchange: (e) => game.setFreeCam(e.target.checked) });
  const god = el('input', { type: 'checkbox', onchange: (e) => game.setGod(e.target.checked) });
  const pos = el('div', { class: 'note' });
  root.append(el('div', { class: 'toggles' }, el('label', { class: 'toggle' }, free, 'free camera'), el('label', { class: 'toggle' }, god, 'god mode')), pos,
    el('div', { class: 'note' }, 'Free cam: WASD, R/Q up/down, Shift fast. God mode: fly, no collision.'));

  // Spawn a Shaped a few metres in front of the player (it rises out of the ground).
  h('Spawn');
  const archSel = el('select', null, ...(game.shapedArchetypes || []).map((n) => el('option', { value: n }, n)));
  root.append(el('div', { class: 'row' }, archSel,
    el('button', { onclick: () => game.spawnShaped && game.spawnShaped(archSel.value, 1) }, 'Spawn'),
    el('button', { onclick: () => game.spawnShaped && game.spawnShaped(archSel.value, 3) }, '×3'),
    el('button', { onclick: () => game.killShaped && game.killShaped() }, 'Kill all'),
    el('button', { onclick: () => game.spawnWarden && game.spawnWarden() }, 'Warden'),
    el('button', { onclick: () => game.releaseWarden && game.releaseWarden() }, 'Release')));

  // Save slots.
  h('Save');
  const saveNote = el('span', { class: 'note' });
  const slotBtn = (label, fn) => el('button', { onclick: async () => { saveNote.textContent = '…'; try { saveNote.textContent = await fn(); } catch (e) { saveNote.textContent = 'error: ' + e.message; } } }, label);
  root.append(el('div', { class: 'btns' },
    slotBtn('Save slot1', async () => ((await game.saves.save('slot1')) ? 'saved slot1' : 'save failed')),
    slotBtn('Load slot1', async () => ((await game.saves.load('slot1')) ? 'loaded slot1' : 'slot1 empty')),
    slotBtn('List', async () => (await game.saves.list()).map((s) => s.slot).join(', ') || 'no saves'),
  ), saveNote);

  game.overlayWorldRefresh = () => {
    free.checked = game.arm.free;
    god.checked = game.controller.god;
    const p = game.controller.pos;
    pos.textContent = 'player ' + p.x.toFixed(1) + ', ' + p.y.toFixed(1) + ', ' + p.z.toFixed(1) + '   cam yaw ' + game.arm.yaw.toFixed(2) + ' pitch ' + game.arm.pitch.toFixed(2);
  };
  return root;
}
