// Cutscenes as data (data/cutscenes/*.json; Phase 10 U6): shot lists in a space's own coordinates (Ebbhold's local metres), their
// crowds by name (game/crowds.js). build() turns one into the director's shot list in world space. Pure (tests/director.test.js).

import { EBB_ORIGIN } from '../world/ebbhold.js';
import * as CROWDS from './crowds.js';

const files = import.meta.glob('../../data/cutscenes/*.json', { eager: true, import: 'default' });
export const CUTSCENES = Object.fromEntries(Object.entries(files).map(([path, v]) => [path.split('/').pop().replace('.json', ''), v]));

const ORIGINS = { ebbhold: EBB_ORIGIN, world: { x: 0, y: 0, z: 0 } };

/** The director's shots for a cutscene (world space, crowds placed) and its play options. */
export function build(cs) {
  const O = ORIGINS[cs.space || 'world'];
  const w = (v) => [v[0] + O.x, v[1] + O.y, v[2] + O.z];
  const shots = cs.shots.map((s) => ({ ...s, keys: s.keys.map((k) => ({ ...k, p: w(k.p), at: w(k.at) })), crowd: s.crowd ? CROWDS[s.crowd]() : null }));
  return { shots, opt: { blendIn: cs.blendIn || 0, blendOut: cs.blendOut || 0, letterbox: cs.letterbox !== false } };
}
