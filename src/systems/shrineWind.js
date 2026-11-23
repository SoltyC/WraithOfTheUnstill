// The way from a shrine (docs/direction.md M4: "each rested shrine shows the direction of the nearest unreleased Warden as wind
// and motes"). While the Wraith is near a shrine it has rested at, a ripple of wind runs out of the shrine through the grass
// toward the nearest held Warden (g.wayDir, systems/chapter.js), again and again: the land leans the way to go. The one line of
// text is the shrine's notice (chapter.js wayOn).

/** @param {any} g  shared boot context */
export function addShrineWindSystem(g) {
  const { chapter, loop, controller, clock } = g;
  const shrines = (g.pois || []).filter((p) => p.kind === 'shrine');
  let t = 0, d = 0, cur = null;
  loop.add({ name: 'shrineWind', update: () => {
    if (!g.wind || !g.wayDir) return;
    t += clock.dt; if (t < 0.18) return; t = 0;
    const p = controller.pos;
    if (!cur || Math.hypot(p.x - cur.pos[0], p.z - cur.pos[1]) > 45) {
      cur = null;
      for (const s of shrines) if (chapter.shrines.has(s.id) && Math.hypot(p.x - s.pos[0], p.z - s.pos[1]) < 40) { cur = s; break; }
      d = 0;
      if (!cur) return;
    }
    const w = g.wayDir(cur.pos[0], cur.pos[1]); if (!w) return;
    // A wave running out from the shrine, 4 m a step, 48 m long, then again.
    d += 4; if (d > 48) d = 4;
    g.wind.burst(cur.pos[0] + w.dx * d, cur.pos[1] + w.dz * d, 1.1);
  } });
}
