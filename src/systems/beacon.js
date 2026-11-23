// The Lake Beacon (world/beacon.js, game/beacon.js; docs/direction.md M1, the meadow's third piece). The Bellwether's own neck
// climb (game/bellwether/neckClimb.js) on a still stone tube: hold the traverse at its foot to grip, W/S along it, A/D round it;
// a shut shutter within reach is struck open with the primary attack — the three valves on the Bellwether's neck, met first here.
// systems/climb.js hands a grip near the beacon's foot to this climb (g.beaconClimb). The shutters are the flags
// `meadow:beacon-<k>`; all three open is `meadow:beacon-open`; once Ketil lights it (`meadow:beacon-lit`) it burns at night.

import { createNeckClimb, VALVE_WAY } from '../game/bellwether/neckClimb.js';
import { createBeaconTube, BEACON_DIMS, BEACON } from '../game/beacon.js';
import { manorWorld, MANOR } from '../world/manor.js';

const HINT = ['', 'A shut shutter above you: climb (W).', 'A shut shutter below you: climb down (S).', 'A shut shutter round the column: hold A or D.'];

/** @param {any} g  shared boot context */
export function addBeaconSystem(g) {
  const { chapter, loop, input, Action, hud, sfx, SFX, capture, controller } = g;
  const flags = chapter.graph.flags;
  const place = chapter.table['meadow-beacon'];
  if (!place || !g.archSites) return;
  const col = g.archSites.findIndex((s) => s.id === 'beacon-column');
  const shut = [0, 1, 2].map((k) => g.archSites.findIndex((s) => s.id === 'beacon-shutter-' + k));
  let tube = null, lamp = null;
  const isOpen = (k) => flags.has('meadow:beacon-' + k);
  function apply() {
    shut.forEach((i, k) => { if (i >= 0) g.archSites[i].hidden = isOpen(k); if (tube) tube.valves.open[k] = isOpen(k) ? 1 : 0; });
  }
  function build(y) {
    tube = createBeaconTube(place.pos[0], y, place.pos[1]);
    const c = createNeckClimb({ bell: tube, dims: BEACON_DIMS, tuning: { thMax: 3.0 } });
    c.spend = (v) => (g.combat ? g.combat.spend(v) : true);
    g.beaconClimb = c; g.beaconTube = tube;
    apply();
    if (g.worldLights) { tube.neckEval(BEACON.segs, 0, 0); lamp = g.worldLights.add({ x: tube.sc[0], y: tube.sc[1] + 1.4, z: tube.sc[2], radius: 26, color: [1, 0.62, 0.28], intensity: 2.6, kind: 'fire', level: 0 }); }
  }
  function strike(k) {
    flags.add('meadow:beacon-' + k); apply();
    sfx.x = tube.valves.x[k]; sfx.y = tube.valves.y[k]; sfx.z = tube.valves.z[k]; sfx.gain = 1.1; sfx.play(SFX.CLANG);
    if (g.arm) g.arm.shake += 0.01;
    const left = [0, 1, 2].filter((q) => !isOpen(q)).length;
    if (left === 0) { flags.add('meadow:beacon-open'); chapter.raise('meadow:beacon-open'); const [mx, mz] = manorWorld(0, -26); sfx.x = mx; sfx.y = MANOR.y + 30; sfx.z = mz; sfx.gain = 0.9; sfx.play(SFX.TOLL);   /* the bell on the hill answers once */
      if (!capture) hud.notice('The Lake Beacon', 'All three shutters open', 'The light has a way out again. Far off on the hill, the bell rings once.', 7); }
    else if (!capture) hud.notice('The Lake Beacon', 'A shutter swings open', left + (left === 1 ? ' is still shut.' : ' are still shut.'), 4);
  }
  { const prev = g.navSync; g.navSync = () => { prev?.(); apply(); }; }
  loop.add({ name: 'beacon', update: () => {
    if (!tube) { const y = col >= 0 ? g.architecture.sites[col * 4 + 1] : NaN; if (y === y && g.architecture.sites[col * 4 + 3] > 0.5) build(y); return; }
    const c = g.beaconClimb;
    if (c.climbing) {
      if (c.nearValve >= 0 && input.pressed[Action.Primary]) strike(c.nearValve);
      if (!capture) hud.line('beacon', c.nearValve >= 0 ? 'Strike to open the shutter.' : flags.has('meadow:beacon-open') ? '' : HINT[c.valveWay] || 'Climb the beacon and open its shutters.');
    } else if (!capture) hud.line('beacon', '');
    // Lit by Ketil: it burns from dusk.
    if (lamp) lamp.level = flags.has('meadow:beacon-lit') ? g.worldLights.night : 0;
    void controller; void VALVE_WAY;
  } });
}
