// Robes in play (game/robes.js): earned when their deed is done — the den cleared, gold on the
// Run, every brazier lit — with a quiet notice; the worn one dresses the Wraith and lends its one
// modest property. The journal's Robes page changes the worn robe (the `robe` quest variable).

import { ROBES, wornRobe, robeMods } from '../game/robes.js';
import { BRAZIERS } from '../world/architecture.js';

/** @param {any} g  shared boot context */
export function addRobesSystem(g) {
  const { loop, chapter, hud, combat, controller, wraithView, clock, capture } = g;
  const flags = chapter.graph.flags, vars = chapter.graph.vars;
  const earned = {
    'rime-hide': () => flags.has('cleared:den'),
    runner: () => typeof vars['run.best'] === 'number' && vars['run.best'] <= 34,
    ember: () => (vars.braziers || 0) >= BRAZIERS.length,
  };
  let wornId = null;
  function apply() {
    const r = wornRobe(flags, vars);
    if (r.id === wornId) return;
    wornId = r.id;
    wraithView.setRobe(r);
    const m = robeMods(r);
    combat.shapedDamageMul = m.shapedDamage;
    controller.surf.speedMul = m.surfSpeed;
    if (g.flame) g.flame.lifeMul = m.flameLife;
  }
  g.wearRobe = (id) => { vars.robe = id; apply(); };
  loop.add({ name: 'robes', update: () => {
    if ((clock.frame & 15) !== 0) return;
    for (const r of ROBES) {
      const f = earned[r.id];
      if (!f || flags.has('robe:' + r.id) || !f()) continue;
      flags.add('robe:' + r.id);
      if (!capture) hud.notice('A robe', r.name, 'Wear it from the journal (J).', 7);
    }
    apply();
  } });
}
