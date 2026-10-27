// Flow section of the dev overlay (docs §3 "tuning by data"): a live readout (value, tier, time at
// each tier, chains) and a slider for every number in flowTuning, plus a force-to-tier button row.

import { flowTuning } from '../../game/flow.js';

/** @param {any} g shared boot context @param {Function} el */
export function buildFlowTools(g, el) {
  const root = el('div'), flow = g.flow;
  const read = el('div', { class: 'note' }, '');
  root.append(el('h3', null, 'Flow'), read);
  const btns = el('div', { class: 'btns' });
  for (const t of [0, 1, 2, 3]) btns.append(el('button', { onclick: () => flow.setValue(t) }, 'Set ' + t));
  btns.append(el('button', { onclick: () => flow.reset(true) }, 'Reset stats'));
  root.append(btns);
  // Elements (testing): grant an element before its Warden's release (Stone: the dune Warden, later).
  if (g.elements) {
    const eb = el('div', { class: 'btns' });
    for (const e of ['gale', 'stone']) eb.append(el('button', { onclick: () => { g.elements.unlock(e); g.elements.select(e); } }, 'Grant ' + e));
    root.append(el('h3', null, 'Elements'), eb);
  }
  for (const k in flowTuning) {
    const v = flowTuning[k];
    if (typeof v !== 'number') continue;
    const num = el('span', { class: 'num' }, String(v));
    const r = el('input', { type: 'range', min: 0, max: Math.max(1, Math.abs(v) * 3), step: Math.abs(v) >= 5 ? 0.5 : 0.01, value: v });
    r.addEventListener('input', () => { flowTuning[k] = parseFloat(r.value); num.textContent = r.value; });
    root.append(el('div', { class: 'row' }, el('label', null, k), r, num));
  }
  const t = flow.timeAt, c = flow.counts;
  setInterval(() => {
    read.textContent = 'value ' + flow.value.toFixed(2) + '  tier ' + flow.tier + '  streak ' + flow.streak + '\n'
      + 'seconds at tier 0-3: ' + t[0].toFixed(0) + ' / ' + t[1].toFixed(0) + ' / ' + t[2].toFixed(0) + ' / ' + t[3].toFixed(0)
      + '\nchains ' + c[8] + '  blows ' + c[9] + '  falls ' + c[10] + '  shatters ' + c[2] + '  strips ' + c[3] + '  near ' + c[5];
  }, 250);
  return root;
}
