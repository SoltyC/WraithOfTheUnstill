import { describe, it, expect } from 'vitest';
import { ARCHETYPES } from '../src/game/shaped/archetypes.js';
import { buildRig, CHUNK } from '../src/game/shaped/rig.js';
import { CHUNKS_PER } from '../src/game/shaped/shaped.js';

const MEADOW = { sedgerunner: ['sedge', 'flank'], hedgewarden: ['turf', 'advance'], chanter: ['reed', 'ranged'] };
const rigOf = (k) => { const A = ARCHETYPES[k]; return buildRig(A.shape, Math.min(CHUNKS_PER, A.chunks), 1234 + k.length * 77, A.rig); };

describe('meadow archetypes', () => {
  for (const k in MEADOW) {
    it(`${k}: material, variant, role and a body that reaches the ground`, () => {
      const A = ARCHETYPES[k], sh = A.shape;
      expect(A.material).toBe('meadow');
      expect(A.variant).toBe(MEADOW[k][0]);
      expect(A.role).toBe(MEADOW[k][1]);
      expect(A.chunks).toBeLessThanOrEqual(CHUNKS_PER);
      for (const leg of sh.legs) {
        expect(leg.upper + leg.lower).toBeGreaterThanOrEqual(sh.hip);
        expect(leg.at).toBeLessThan(sh.spine);
      }
      expect(sh.legs.some((l) => l.group === 0) && sh.legs.some((l) => l.group === 1)).toBe(true);
    });
    it(`${k}: rig builds without NaN inside its chunk budget`, () => {
      const r = rigOf(k), A = ARCHETYPES[k];
      expect(r.count).toBe(A.chunks);
      expect(r.needed).toBeLessThanOrEqual(r.count);
      for (const a of [r.off, r.size, r.cseed, r.rise]) for (const x of a) expect(Number.isFinite(x)).toBe(true);
      for (let c = 0; c < r.count; c++) expect(r.kind[c]).toBeGreaterThanOrEqual(CHUNK.SEDGE);
      expect(r.kind.includes(CHUNK.POD)).toBe(true);
    });
  }
  it('frost archetypes stay frost', () => {
    for (const k of ['hound', 'brute', 'seer', 'denmother']) { expect(ARCHETYPES[k].material).toBeUndefined(); expect(ARCHETYPES[k].variant).toBeUndefined(); }
  });
  it('silhouette details exist: awn ruff, standing stone, bell petals', () => {
    const cnt = (k, kind) => rigOf(k).kind.filter((x) => x === kind).length;
    expect(cnt('sedgerunner', CHUNK.AWN)).toBeGreaterThanOrEqual(8);
    expect(cnt('hedgewarden', CHUNK.STONE)).toBeGreaterThanOrEqual(5);
    expect(cnt('hedgewarden', CHUNK.ROOT)).toBeGreaterThanOrEqual(6);
    expect(cnt('chanter', CHUNK.REED)).toBeGreaterThanOrEqual(14);
  });
});

describe('frost rigs unchanged', () => {
  // Checksums taken before the meadow variants were added.
  const want = {
    hound: [80, 19.639805132406764, 147.50772059336305, 43337.37788772583, 31.486339569091797, 538],
    brute: [96, 54.7740038856864, 422.51015044003725, 46954.26779836416, 35.71143141016364, 430],
    seer: [64, 67.22641023085453, 159.36579489707947, 25989.396317362785, 24.29063005372882, 373],
    denmother: [96, 101.03430944494903, 554.200252071023, 47291.47100830078, 37.019488560035825, 544],
  };
  for (const k in want) {
    it(k, () => {
      const r = rigOf(k);
      let so = 0, ss = 0, sc = 0, sr = 0, sk = 0;
      for (let i = 0; i < r.off.length; i++) { so += r.off[i] * (i % 7 + 1); ss += r.size[i] * (i % 5 + 1); }
      for (let i = 0; i < r.count; i++) { sc += r.cseed[i]; sr += r.rise[i]; sk += r.kind[i] * (i + 1); }
      const got = [r.count, so, ss, sc, sr, sk];
      got.forEach((g, i) => expect(g).toBeCloseTo(want[k][i], 6));
    });
  }
});
