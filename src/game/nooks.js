// The nooks as data (data/nooks.json: placed on the baked world by tools/world/placeNooks.mjs): which of
// them exist, how they join the navigation registry, and which the map shows. A nook is hidden until it
// is found (flag `nook:<id>`): never sensed from afar, absent from the compass and the parchment map.

import nookData from '../../data/nooks.json';

export const NOOKS = nookData.nooks.filter((n) => n.pos);
export const foundFlag = (id) => 'nook:' + id;

/** The nooks as places the navigation registry can hold (kind 'nook': never sensed, known once found). */
export function nookPois() { return NOOKS.map((n) => ({ id: n.id, kind: 'nook', biome: n.biome, pos: n.pos, h: n.h })); }

/** The map marks of the nooks found in one view (`pois`: any places; only kind 'nook' with their flag set are marked). */
export function foundNookMarks(pois, flags, view) {
  const out = [];
  for (const p of pois) if (p.kind === 'nook' && p.biome === view && flags.has(foundFlag(p.id))) out.push({ x: p.pos[0], z: p.pos[1], name: null, kind: 'nook' });
  return out;
}
