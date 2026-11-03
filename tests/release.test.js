import { describe, it, expect } from 'vitest';
import { releaseShots } from '../src/game/release.js';
import { totalLength } from '../src/game/director.js';

const rec = (id, kind = 'named') => ({ id, kind, at: [39, 0, 54.85], path: [[38, 0, 52, 0], [38.5, 0, 53.4, 0]] });

describe('the release, rough cut', () => {
  it('runs about three minutes, in the document\'s order, with no record', () => {
    const { shots } = releaseShots();
    const L = totalLength(shots);
    expect(L).toBeGreaterThan(160); expect(L).toBeLessThan(220);
    expect(shots.some((s) => s.slug && /No names/.test(s.slug.text))).toBe(true);
    expect(shots[0].grade).toEqual(['present', 'past']);
  });
  it('replays each name said from the named person\'s eyes, the Wraith moving along its record', () => {
    const { shots } = releaseShots({ record: [rec('hanne'), rec('teodor')] });
    const replays = shots.filter((s) => s.record && s.wraith && s.wraith.path);
    expect(replays.length).toBe(2);
    expect(replays[0].subs.some((q) => q.text === 'Don’t.')).toBe(true);
    expect(shots.some((s) => s.slug && /No names/.test(s.slug.text))).toBe(false);
  });
  it('shows twelve in full and the rest as a run of names', () => {
    const ids = ['hanne', 'ysolde', 'teodor', 'ise', 'liese', 'brannoc', 'oda', 'pell', 'wyn', 'corran', 'maudry', 'aldo', 'fenna', 'hesk'];
    const { shots } = releaseShots({ record: ids.map((i) => rec(i)) });
    expect(shots.filter((s) => s.record && s.wraith && s.wraith.path).length).toBe(12);
    expect(shots.some((s) => s.slug && /Fenna/.test(s.slug.text))).toBe(true);
  });
  it('uses the held hands when nobody was named', () => {
    const { shots } = releaseShots({ record: [rec('orla', 'held')] });
    expect(shots.filter((s) => s.record && s.wraith && s.wraith.path).length).toBe(1);
  });
  it('replays only the walk up to them, not from wherever the Wraith was before a jump', () => {
    const r = { id: 'hanne', kind: 'named', at: [39, 0, 54.85], path: [[-80, 0, 0, 0], [-79, 0, 0, 0], [36, 0, 52, 0], [37, 0, 53, 0], [38, 0, 53.6, 0]] };
    const { shots } = releaseShots({ record: [r] });
    const P = shots.find((s) => s.record).wraith.path;
    expect(P.length).toBe(3);
    for (let k = 1; k < P.length; k++) expect(Math.hypot(P[k][0] - P[k - 1][0], P[k][2] - P[k - 1][2])).toBeLessThan(3);
  });
});
