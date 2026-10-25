// Weapons section of the dev overlay (docs §11.2, "tuning by data"): the carried weapon, a live
// readout of the machine and the swing, buttons to give every weapon, and a slider for every
// number of the weapon in hand (reach, damage, timings, stagger, hit-stop ...) and for the shared
// tuning (hit-stop and shake scale, damage scale, bleed tick).

import { weaponDefs, weaponFeel } from '../../game/weapons/defs.js';
import { weaponTuning } from '../../game/weapons/weapons.js';

const NAMES = ['idle', 'windup', 'loaded', 'active', 'recover', 'charge'];

/** @param {any} g shared boot context @param {Function} el */
export function buildWeaponTools(g, el) {
  const root = el('div'), inv = g.inventory, wp = g.weapons;
  const read = el('div', { class: 'note' }, '');
  root.append(el('h3', null, 'Weapons'), read);
  const btns = el('div', { class: 'btns' });
  for (const id of Object.keys(weaponDefs)) btns.append(el('button', { onclick: () => { inv.give(id); inv.equip(id); } }, 'Give ' + id));
  btns.append(el('button', { onclick: () => { Object.assign(wp.stats, { swings: 0, heavies: 0, hits: 0, damage: 0, shatters: 0, glances: 0 }); } }, 'Reset stats'));
  root.append(btns);
  const sliders = el('div');
  const slider = (host, label, obj, key) => {
    const v = obj[key];
    const num = el('span', { class: 'num' }, String(v));
    const r = el('input', { type: 'range', min: Math.min(0, v * 3), max: Math.max(1, Math.abs(v) * 3), step: Math.abs(v) >= 5 ? 0.5 : 0.01, value: v });
    r.addEventListener('input', () => { obj[key] = parseFloat(r.value); num.textContent = r.value; });
    host.append(el('div', { class: 'row' }, el('label', null, label), r, num));
  };
  const build = () => {
    sliders.replaceChildren();
    const d = inv.def; if (!d) return;
    const section = (title, o) => { sliders.append(el('h4', null, title)); for (const k in o) if (typeof o[k] === 'number') slider(sliders, k, o, k); };
    d.combo.forEach((a, i) => section(d.id + ' hit ' + (i + 1), a));
    section(d.id + ' heavy', d.heavy);
    section(d.id + ' affinity', d.affinity);
  };
  let shown = '';
  root.append(sliders);
  const shared = el('div'); root.append(el('h4', null, 'shared'), shared);
  for (const k in weaponTuning) slider(shared, k, weaponTuning, k);
  for (const k of ['buffer', 'chainKeep', 'holdAt', 'swapTime', 'assistRange', 'assistCone', 'turnRate']) slider(shared, k, weaponFeel, k);
  setInterval(() => {
    const m = wp.machine, d = inv.def, s = wp.stats;
    read.textContent = (d ? d.name : '-') + '  tier ' + wp.tier + '  phase ' + NAMES[m.phase] + '  hit ' + (m.combo + 1) + (m.heavy ? ' heavy x' + m.power.toFixed(2) : '') + '\n'
      + 'swings ' + s.swings + '  heavies ' + s.heavies + '  hits ' + s.hits + '  damage ' + s.damage.toFixed(0) + '  shatters ' + s.shatters + '  glances ' + s.glances;
    if (d && d.id !== shown) { shown = d.id; build(); }
  }, 250);
  return root;
}
