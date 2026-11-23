// The survivors' camp alive (world/refugeeKit.js lays the clearings; systems/sow.js reveals each when its people arrive). The
// named families walk there themselves (systems/sow.js leaveBrain, to their own clearing's fire); everyone else who got out —
// Cinderhold's miners and their families, the chapel's faithful, the farms' children — is drawn by the crowd (render/crowd.js):
// one robed figure in each place the kit left for people (its slots: by a fire, under a shelter, at a cart, on the cliff
// watching the mountain), in the colours of where they came from. Shown when the Wraith is near and no cutscene has the crowd.

import { CROWD_MAX } from '../render/crowd.js';
import { CAMP } from '../world/sow.js';

const NEAR = 420;                                       // m from the camp's middle: the crowd is placed and shown
/** Robes by where they came from (dye multiplies the robe's cloth): farm browns and greens, the town's soot, the chapel's pale. */
const DYES = {
  farm: [[1.3, 1.05, 0.75], [0.95, 1.05, 0.7], [1.2, 0.8, 0.6], [1.0, 0.9, 0.75]],
  cinderhold: [[0.55, 0.52, 0.5], [0.7, 0.62, 0.55], [0.48, 0.5, 0.55], [0.8, 0.7, 0.6]],
  chapel: [[1.5, 1.45, 1.35], [1.3, 1.25, 1.2], [1.45, 1.35, 1.2]],
};
/** The kit's poses to the crowd's motions, and how far a figure is set into the ground to read as sitting or crouched. */
const POSE = { stand: ['stand', 0], watch: ['stand', 0], sit: ['rock', 0.55], crouch: ['knead', 0.35] };

/** @param {any} g  shared boot context */
export function addCampLifeSystem(g) {
  const { loop, clock, camera } = g;
  const camps = g.archSites.map((s, i) => ({ s, i })).filter(({ s }) => /^emb-camp(-|$)/.test(s.id) && s.slots && s.id !== 'emb-camp-empty');
  let shownKey = '', mine = false, acc = 0;
  const hash = (a) => { const x = Math.sin(a * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const groundAt = (x, z) => g.scenes?.groundAt(x, z) ?? 0;

  /** The figures for the clearings in use: every slot but the named families' own two, up to the crowd's limit. */
  function figures() {
    const list = [];
    for (const { s } of camps) {
      if (s.hidden) continue;
      const id = s.id.replace(/^emb-camp-?/, '') || 'middle';
      const from = id === 'cinderhold' || id === 'chapel' ? id : 'farm';
      const dyes = DYES[from];
      // A farm's first two places (by its fire) are the elder's and the kin's: they walk there themselves.
      const skip = from === 'farm' && id !== 'middle' && id !== 'lookout' ? 2 : 0;
      s.slots.forEach((sl, k) => {
        if (k < skip || !POSE[sl.pose]) return;
        const x = s.at[0] + sl.x, z = s.at[1] + sl.z, [motion, sink] = POSE[sl.pose];
        const h = hash(x * 0.37 + z * 1.13);
        // (A farm's extra places are its children: small.)
        const child = from === 'farm' && id !== 'lookout' && h < 0.55;
        list.push({ x, y: groundAt(x, z) - sink * (child ? 0.7 : 1), z, yaw: sl.yaw, scale: child ? 0.68 + 0.08 * h : 0.92 + 0.12 * h,
          motion, t: h * 9, dye: dyes[Math.floor(h * 7.7) % dyes.length], pri: sl.pose === 'watch' ? 0 : from === 'farm' ? 2 : 1 });
      });
    }
    // Over the limit: the watchers at the cliff first, then the town and the chapel (no one else stands for them), then the farms.
    list.sort((a, b) => a.pri - b.pri);
    return list.slice(0, CROWD_MAX);
  }

  loop.add({ name: 'campLife', update: () => {
    const C = g.crowd;
    if (!C || !C.ready) return;
    if (g.director?.active) { mine = false; shownKey = ''; return; }   // a cutscene has the crowd
    if (mine) C.update(clock.simTime);
    acc += clock.dt;
    if (acc < 0.5) return;
    acc = 0;
    const near = Math.hypot(camera.position.x - CAMP.at[0], camera.position.z - CAMP.at[1]) < NEAR;
    // (Re-seated every few seconds while near: the 2 m ground under a figure may arrive after it was first placed.)
    const key = near ? camps.map(({ s }) => (s.hidden ? 0 : 1)).join('') + ':' + Math.floor(clock.simTime / 4) : '';
    if (key === shownKey) return;
    shownKey = key;
    if (!near || !key.split(':')[0].includes('1')) { if (mine) { C.show(false); mine = false; } return; }
    C.set(figures()); C.show(true); mine = true;
  } });
}
