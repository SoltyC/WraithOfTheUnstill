// Quest rewards (docs §11.4, §11.6): quest data pays through actions — { marks }, { give }, { item },
// { thread }, { flask } — and this module applies one to the inventory. `backPay` tallies what a
// save made before the economy existed would already have earned for the steps it finished, so an
// old save is not poorer than a new one.

import { MATERIALS, CONSUMABLES } from './items.js';

/** Apply one reward action to the inventory; returns a short line for the notice, or null if it was not a reward. */
export function applyReward(inv, a) {
  if (a.marks) { inv.addMarks(a.marks); return a.marks + ' marks'; }
  if (a.give) {
    const parts = [];
    for (const id in a.give) if (MATERIALS[id] && inv.addMaterial(id, a.give[id])) parts.push(a.give[id] + ' ' + MATERIALS[id].name.toLowerCase());
    return parts.join(', ') || null;
  }
  if (a.item) {
    const parts = [];
    for (const id in a.item) if (CONSUMABLES[id]) { const k = inv.addItem(id, a.item[id]); if (k) parts.push(k + ' ' + CONSUMABLES[id].name.toLowerCase()); }
    return parts.join(', ') || null;
  }
  if (a.thread) return inv.addThread() ? 'a health thread' : null;
  if (a.flask) { inv.growFlask(a.flask); return 'a deeper flask'; }
  return null;
}

export const isReward = (a) => !!(a.marks || a.give || a.item || a.thread || a.flask);

/**
 * The rewards of every step a quest save has finished (and of finished quests' onDone). Step
 * actions that are rewards only; a quest's `state` 'done' means all its steps ran.
 * @param {any[]} defs  quest definitions
 * @param {Record<string, { state: string, step: number, opt?: string[] }>} quests  saved quest state
 * @returns {any[]} reward actions
 */
export function backPay(defs, quests) {
  const out = [];
  for (const d of defs) {
    const q = quests[d.id];
    if (!q || q.state === 'locked') continue;
    const n = q.state === 'done' ? d.steps.length : Math.min(q.step | 0, d.steps.length);
    for (let i = 0; i < n; i++) for (const a of d.steps[i].actions || []) if (isReward(a)) out.push(a);
    for (const o of d.optional || []) if ((q.opt || []).includes(o.id)) for (const a of o.actions || []) if (isReward(a)) out.push(a);
    if (q.state === 'done') for (const a of d.onDone || []) if (isReward(a)) out.push(a);
  }
  return out;
}
