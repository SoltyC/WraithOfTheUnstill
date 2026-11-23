// People travel (docs/direction.md M3b "travel"; docs/storyline.md: Wenna is the thread, meadow → dunes). After the Bellwether is
// released, Wenna leaves Hearn for the dunes, and Doran goes with her if he came back down from the manor (fate moved, where
// dunes: systems/doran.js). It happens out of sight: the move (flag `travel:wenna-south`) is made only when the Wraith is far
// from both Hearn and the Wellhouse camp, and a day has turned since the release or the Wraith has been in the dunes. Then
// Hearn's Wenna (and Doran) are gone, and they stand at the camp (meadow.json `meadow-wenna-south`, `meadow-doran-south`).

/** @param {any} g  shared boot context */
export function addTravelSystem(g) {
  const { chapter, loop, controller, clock } = g;
  const flags = chapter.graph.flags, vars = chapter.graph.vars;
  const HEARN = [93, 926], CAMP = [1800, 700];
  const find = (id) => g.npcs?.find((n) => n.id === id) || null;
  let acc = 0;
  loop.add({ name: 'travel', update: () => {
    acc += clock.dt; if (acc < 0.5) { apply(); return; } acc = 0;
    const p = controller.pos, dH = Math.hypot(p.x - HEARN[0], p.z - HEARN[1]), dC = Math.hypot(p.x - CAMP[0], p.z - CAMP[1]);
    if (flags.has('meadow:bellwether-released')) {
      if (vars['travel.releaseDay'] === undefined) vars['travel.releaseDay'] = vars.days || 0;
      if (dC < 900) flags.add('travel:seen-dunes');
      const ready = (vars.days || 0) > vars['travel.releaseDay'] || flags.has('travel:seen-dunes');
      if (!flags.has('travel:wenna-south') && ready && dH > 400 && dC > 300) flags.add('travel:wenna-south');
    }
    apply();
  } });
  /** Who stands where (every frame, after the village's own brains: systems/villagers.js). */
  function apply() {
    const south = flags.has('travel:wenna-south'), doranSouth = south && flags.has('where:doran:dunes');
    const wH = find('meadow-wenna'), wS = find('meadow-wenna-south'), dS = find('meadow-doran-south');
    if (wH && south) wH.hide = true;
    if (wS) wS.hide = !south;
    if (dS) dS.hide = !doranSouth;
  }
}
