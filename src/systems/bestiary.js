// Bestiary capture (game/bestiary.js): the first time a creature of a kind stands whole near the
// Wraith (risen, not falling), its form is sketched into the quest variables (`sketch:<id>`,
// saved). The Warden is sketched when first seen within reach.

import { takeSketch } from '../game/bestiary.js';
import { CHUNKS_PER } from '../game/shaped/shaped.js';

/** @param {any} g  shared boot context */
export function addBestiarySystem(g) {
  const { loop, chapter, shaped, shapedMod, warden, controller, clock, hud, capture } = g;
  const vars = chapter.graph.vars, S = shapedMod.S;
  const note = (name) => { if (!capture) hud.notice('Journal', 'A sketch: ' + name, null, 4); };
  loop.add({ name: 'bestiary', update: () => {
    if ((clock.frame & 31) !== 0) return;
    const p = controller.pos;
    for (let i = 0; i < shaped.slots.length; i++) {
      const s = shaped.slots[i];
      if (!s.arch || vars['sketch:' + s.arch]) continue;
      if (s.state !== S.STALK && s.state !== S.TELEGRAPH && s.state !== S.RECOVER) continue;
      const b = s.body, dx = b.x - p.x, dz = b.z - p.z;
      if (dx * dx + dz * dz > 40 * 40) continue;
      vars['sketch:' + s.arch] = takeSketch(shaped.chunks, i * CHUNKS_PER, CHUNKS_PER, b.x, b.y, b.z, b.heading);
      note(s.arch === 'denmother' ? 'the den mother' : 'a ' + s.arch);
    }
    if (!vars['sketch:warden'] && warden.active) {
      const b = warden.body, dx = b.x - p.x, dz = b.z - p.z;
      if (dx * dx + dz * dz < 90 * 90) { vars['sketch:warden'] = takeSketch(warden.chunks, 0, warden.chunks.length / 16 | 0, b.x, b.y, b.z, b.heading); note('the Warden'); }
    }
  } });
}
