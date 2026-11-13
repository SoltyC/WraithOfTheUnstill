// Sculpted chunk pieces (docs/hifi-models.md): authored meshes that replace the procedural clod
// for some chunk kinds. Built offline in Blender by tools/models/walker_pieces.py — a high-poly
// sculpt per piece, decimated to the game mesh, its detail baked into one atlas (RG octahedral
// object-space normal, B occlusion) — and shipped as data/models/<set>.glb + <set>.webp.
// Each chunk of a sculpted kind takes one variant of its family, picked by its seed, so the
// pieces do not repeat side by side. Loaded once at boot.

import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { CHUNK } from '../game/shaped/rig.js';
import { parseGlb } from './glb.js';

/** Chunk kind → piece family (kinds not listed keep the procedural clod). */
export const PIECE_FAMILY = {
  [CHUNK.DUNEHIDE]: 'hide',
  [CHUNK.RUIN]: 'ruin',
  [CHUNK.SANDSTONE]: 'sandstone',
  [CHUNK.SAND]: 'sand',
  [CHUNK.THORN]: 'thorn',
};

const hash = (s) => { let x = Math.imul((s * 1000) | 0, 0x27d4eb2d); x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); return (x ^ (x >>> 13)) >>> 0; };

/**
 * Load a piece set. @param {any} scene @param {string} set  e.g. 'walker-pieces'
 * @param {{ atlas?: string }} [opt]  atlas file suffix ('' = full, '-2k' = half)
 */
export async function loadPieces(scene, set, opt = {}) {
  const base = import.meta.env.BASE_URL + 'models/';
  const buf = await (await fetch(base + set + '.glb')).arrayBuffer();
  const meshes = parseGlb(buf);
  // Shadow LODs (tools/models/shadow_lod.py: LOD2, about a tenth; never drawn in colour), if the set has them.
  try {
    const r = await fetch(base + set + '-shadow.glb');
    if (r.ok) for (const [k, m] of parseGlb(await r.arrayBuffer())) meshes.set(k, m);
  } catch { /* optional */ }
  /** family → lod → variants */
  const fam = {};
  for (const [name, m] of meshes) {
    const r = /^([a-z]+)_(\d+)_lod(\d)$/.exec(name);
    if (!r) continue;
    const f = (fam[r[1]] ||= [[], [], []]);
    f[+r[3]][+r[2]] = m;
  }
  const atlas = await new Promise((res, rej) => {
    const t = new Texture(base + set + (opt.atlas ?? '') + '.webp', scene, {
      noMipmap: false, invertY: false, samplingMode: Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
      onLoad: () => res(t), onError: (m, e) => rej(e || new Error(m)),
    });
  });
  atlas.wrapU = atlas.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  atlas.anisotropicFilteringLevel = 8;
  return {
    atlas,
    /** The piece for a chunk of `kind` with `seed`, at `lod` (0 near, 1 far/Low, 2 shadow), or null. */
    pick(kind, seed, lod) {
      const f = fam[PIECE_FAMILY[Math.floor(kind + 0.02)]];
      if (!f) return null;
      const list = f[lod].length ? f[lod] : f[lod === 2 && f[1].length ? 1 : 0];
      return list[hash(seed) % list.length] || null;
    },
  };
}
