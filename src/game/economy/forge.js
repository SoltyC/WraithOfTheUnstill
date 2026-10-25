// The forge (docs §11.3): the smith raises a weapon one tier for marks and materials; from tier 3 a
// weapon takes an infusion. Pure over the inventory. Weapons are hand-found, never rolled: the forge
// only ever deepens what the Wraith already owns.

import { FORGE_COST, TIER_INFO, maxTier, hasTiers } from '../weapons/tiers.js';
import { MATERIALS } from './items.js';

/** The elements a weapon may be infused with (the ones whose verbs exist; see game/elements.js). */
export const INFUSIONS = ['frost', 'gale'];

/**
 * Where a weapon stands at the forge: { tier, next, info, cost, block }. `block` is why the next
 * tier cannot be forged now ('max' | 'marks' | 'materials'), or null.
 */
export function forgeStatus(inv, id) {
  const tier = inv.tier(id);
  if (tier < 0 || !hasTiers(id)) return null;
  if (tier >= maxTier) return { tier, next: null, info: null, cost: null, block: 'max' };
  const next = tier + 1, cost = FORGE_COST[next];
  const block = inv.marks < cost.marks ? 'marks' : !inv.hasMaterials(cost.mats) ? 'materials' : null;
  return { tier, next, info: TIER_INFO[id][next], cost, block };
}

/** Forge the next tier. Returns null on success, else the reason. */
export function forge(inv, id) {
  const s = forgeStatus(inv, id);
  if (!s) return 'none';
  if (s.block) return s.block;
  inv.spendMarks(s.cost.marks); inv.takeMaterials(s.cost.mats); inv.upgrade(id);
  return null;
}

/** Cost as a line: "70 marks, 2 rime cores". */
export function costLine(cost) {
  const parts = [cost.marks + ' marks'];
  for (const id in cost.mats) parts.push(cost.mats[id] + ' ' + MATERIALS[id].name.toLowerCase() + (cost.mats[id] > 1 ? 's' : ''));
  return parts.join(', ');
}

/** Set a weapon's infusion (tier 3+, a known element, or null to clear). */
export function infuse(inv, id, element) {
  if (element !== null && !INFUSIONS.includes(element)) return false;
  if (inv.tier(id) < 3) return false;
  return inv.infuse(id, element);
}
