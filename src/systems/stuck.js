// The stuck layer (docs/direction.md §2.2 layer 4, M3b): the goal is shown, the way is found — but a player who has been at a
// place a long while without getting anywhere hears one more piece from a person who would plausibly be there or call out.
// Data: data/quests/stuck.json, keyed by quest/step: after (s), near (m from the step's goal; none = anywhere), by (who says
// it), lines (one more piece each, never the answer). Time counts only while the step is the active one and the Wraith is
// near its goal; each line is said once (vars `stuck:<quest>/<step>` count them, saved), the next after another `after`.
// The bot reads g.stuck.log (when and what fired).

import stuckData from '../../data/quests/stuck.json';

/** @param {any} g  shared boot context */
export function addStuckSystem(g) {
  const { chapter, loop, controller, clock, hud, capture } = g;
  const graph = chapter.graph, vars = graph.vars;
  const entries = Object.entries(stuckData).filter(([k]) => k.includes('/'));
  const timers = new Map();
  const log = [];
  const goalPos = (goal, out) => {
    if (!goal) return false;
    if (goal.at) { out[0] = goal.at[0]; out[1] = goal.at[1]; return true; }
    if (goal.poi) { const p = chapter.table[goal.poi]; if (!p) return false; out[0] = p.pos[0]; out[1] = p.pos[1]; return true; }
    if (goal.npc) { const n = g.npcs?.find((m) => m.id === goal.npc); if (!n) return false; out[0] = n.x; out[1] = n.z; return true; }
    if (goal.dynamic) { const d = g.navDynamic?.[goal.dynamic]?.(); if (!d) return false; out[0] = d.x; out[1] = d.z; return true; }
    return false;
  };
  const at = [0, 0];
  let acc = 0;
  loop.add({ name: 'stuck', update: () => {
    acc += clock.dt; if (acc < 0.5) return;
    const dt = acc; acc = 0;
    if (capture || chapter.talking) return;
    const p = controller.pos;
    for (const [key, e] of entries) {
      const [qid, sid] = key.split('/'), q = graph.quests[qid], def = graph.byId.get(qid);
      if (!q || !def || q.state !== 'active') { timers.delete(key); continue; }
      const step = def.steps[q.step];
      if (!step || step.id !== sid) { timers.delete(key); continue; }
      const said = vars['stuck:' + key] || 0;
      if (said >= e.lines.length) continue;
      if (e.near !== undefined) { if (!goalPos(step.goal, at) || Math.hypot(p.x - at[0], p.z - at[1]) > e.near) continue; }
      const t = (timers.get(key) || 0) + dt;
      if (t < e.after) { timers.set(key, t); continue; }
      timers.set(key, 0);
      vars['stuck:' + key] = said + 1;
      hud.bark(e.by, e.lines[said], 6);
      log.push({ t: clock.simTime, key, line: e.lines[said] });
    }
  } });
  g.stuck = { log, entries: entries.map(([k]) => k) };
}
