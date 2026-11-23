// The old kiln flue in the forest (world/flue.js; docs/direction.md M1, "The Cold Forge"). Three vents choked with turf: the
// Wraith pulls each clear by hand. When the last comes free the flue breathes — warm air out of the vents, Garrow's forge in
// Hearn draws again — and far off on the hill the Bellwether's bell answers once (the Warden notices the player). State is
// the flags `meadow:flue-<i>` and `meadow:flue-clear` (saved with the quests).

import { manorWorld, MANOR } from '../world/manor.js';
import { FLUE_VENTS } from '../world/flue.js';

/** @param {any} g  shared boot context */
export function addFlueSystem(g) {
  const { chapter, hud, loop, sfx, SFX, music, capture } = g;
  const flags = chapter.graph.flags;
  const place = chapter.table['meadow-flue'];
  if (!place || !g.archSites) return;
  const idx = FLUE_VENTS.map((_, i) => g.archSites.findIndex((s) => s.id === 'flue-turf-' + i));
  const base = g.archSites.findIndex((s) => s.id === 'flue-vents');
  const targets = FLUE_VENTS.map(([dx, dz, r, h], i) => {
    const t = { kind: 'flue', id: 'flue-' + i, verb: 'Pull', name: 'Turf', x: place.pos[0] + dx, y: 0, z: place.pos[1] + dz, r: r + 1.9, h: 0.4, hy: 3.5, hidden: true, onUse: () => pull(i) };
    g.interactables.push(t);
    return t;
  });
  const cleared = (i) => flags.has('meadow:flue-' + i);
  function apply() { idx.forEach((k, i) => { if (k >= 0) g.archSites[k].hidden = cleared(i); }); }
  function pull(i) {
    if (cleared(i)) return;
    flags.add('meadow:flue-' + i); apply();
    const t = targets[i];
    sfx.x = t.x; sfx.y = t.y; sfx.z = t.z; sfx.gain = 0.6; sfx.play(SFX.CRUNCH);
    const left = FLUE_VENTS.filter((_, k) => !cleared(k)).length;
    if (left > 0) { if (!capture) hud.notice('The old flue', 'The turf comes away', left === 1 ? 'Air stirs in the open mouth. One vent is still sealed.' : `Air stirs in the open mouth. ${left} vents are still sealed.`, 5); return; }
    flags.add('meadow:flue-clear'); chapter.raise('meadow:flue-clear');
    // The flue breathes; the bell on the hill answers once.
    const [mx, mz] = manorWorld(0, -26);
    sfx.x = mx; sfx.y = MANOR.y + 30; sfx.z = mz; sfx.gain = 0.9; sfx.play(SFX.TOLL);
    music.sting('echo');
    if (!capture) hud.notice('The old flue', 'It breathes', 'Warm air rises out of all three vents. Far off on the hill, the bell rings once.', 8);
  }
  apply();
  { const prev = g.navSync; g.navSync = () => { prev?.(); apply(); }; }
  let acc = 0;
  loop.add({ name: 'flue', update: () => {
    acc += g.clock.dt; if (acc < 0.25) return; acc = 0;
    // On the collars, once the site is seated (the vents' seat, from the drawn site block).
    const y0 = base >= 0 ? g.architecture.sites[base * 4 + 1] : NaN;
    targets.forEach((t, i) => { t.hidden = cleared(i) || !(y0 === y0); if (y0 === y0) t.y = y0 + FLUE_VENTS[i][3] - 0.3; });
  } });
}
