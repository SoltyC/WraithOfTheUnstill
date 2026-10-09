// Ambient barks (BRIEF §11: NPCs speak little, and their words should matter): as the Wraith
// passes within a few metres of a Veiled who is not in conversation, they may say one short line
// — the first entry of data/quests/frost.json `barks.<npc>` whose condition holds (the quest
// graph's own conditions), a line from it in turn. One per NPC every two minutes or so; never
// during dialogue, a fight, a surf or a capture. Shown as a quiet line (hud.bark), not a subtitle.

const RANGE = 6.5, COOLDOWN = 120, GLOBAL_GAP = 20;

/** @param {any} g  shared boot context */
export function addBarksSystem(g) {
  const { loop, chapter, hud, controller, clock, capture } = g;
  const data = chapter.data.barks || {};
  const graph = chapter.graph, facts = chapter.facts;
  const next = new Map(), turn = new Map();
  let lastAny = -1e9;
  loop.add({ name: 'barks', update: () => {
    if (capture || chapter.talking || controller.surf.active || (clock.frame & 7) !== 0) return;
    if (g.encounters) for (const id in g.encounters) if (g.encounters[id].wave >= 0) return;
    const t = clock.realTime ?? performance.now() / 1000;
    if (t - lastAny < GLOBAL_GAP) return;
    const p = controller.pos;
    for (const n of g.npcs || []) {
      const list = data[n.id]; if (!list || !n.view || !n.view.mesh.isEnabled()) continue;
      const dx = n.x - p.x, dz = n.z - p.z;
      if (dx * dx + dz * dz > RANGE * RANGE) continue;
      if ((next.get(n.id) || 0) > t) continue;
      const entry = list.find((e) => !e.when || graph.test(e.when, facts));
      if (!entry) continue;
      const k = turn.get(n.id) || 0;
      hud.bark(n.name, entry.lines[k % entry.lines.length]);
      turn.set(n.id, k + 1); next.set(n.id, t + COOLDOWN); lastAny = t;
      break;
    }
  } });
}
