// Quest graph (BRIEF §11): data-driven quests with states, steps, triggers and conditions, kept in
// plain data files (data/quests/*.json). The graph never reads the game directly: the game feeds
// it a small facts object each tick (where the Wraith is, what was just said or done, world
// flags), and the graph answers with actions to perform (set flags, give Echoes, journal lines,
// unlock shrines, request an autosave). Its whole state is plain JSON, so a save stores it as is.
//
// Quest definition:
//   { id, kind: 'main'|'side', title, summary,
//     start?: Condition,                 // when it becomes active (omitted: active from the start)
//     steps: [{ id, journal, when: Condition, actions?: Action[], goal?: Goal }],
//     optional?: [{ id, journal, when: Condition, actions?: Action[], goal?: Goal }],  // in parallel
//     onDone?: Action[] }
// Goal (what the navigation system points at): { poi: 'id' } | { at: [x, z] } | { dynamic: 'name' },
//   plus an optional label and radius (m, default 30: the goal counts as reached inside it).
// Condition (all keys optional, all must hold):
//   { flag: 'name' | ['a', 'b'],          // world flags set
//     notFlag: 'name' | [...],
//     quest: 'id', questStep: 'stepId',   // another quest done / this step of it reached
//     near: { poi: 'id' | x, z, r },      // the Wraith within r m of a POI or point
//     var: { name, gte?, lte?, eq? },     // a numeric world variable (counts, times)
//     event: 'name',                      // an event raised this tick (talk:<npc>, shrine:<id>, …)
//     restored: 'frost',                  // a biome restored
//     night: true | false,                // time of day
//     any: [Condition, …], not: Condition }
// Action:
//   { setFlag: 'name' } | { clearFlag } | { echo: 'id' } | { journal: 'text' } | { lore: 'id' }
//   | { shrine: 'id' } | { autosave: true } | { startQuest: 'id' } | { say: 'dialogue id' }
//   | { reveal: 'poi id' | [ids] } (the places become known: compass, map) | { track: 'goal id' }
//   | { setVar: { name, value } } | { addVar: { name, by } } | { encounter: 'id' } | { robe: 'id' }

/** @typedef {{ state: 'locked'|'active'|'done', step: number }} QuestState */

export class QuestGraph {
  /**
   * @param {any[]} defs  quest definitions (validated)
   * @param {Record<string, {pos: number[]}>} pois  POI table by id (x = pos[0], z = pos[1])
   */
  constructor(defs, pois) {
    validateQuests(defs);
    this.defs = defs;
    this.byId = new Map(defs.map((d) => [d.id, d]));
    this.pois = pois;
    /** @type {Record<string, QuestState>} */
    this.quests = {};
    /** World flags (persistent). */
    this.flags = new Set();
    for (const d of defs) this.quests[d.id] = { state: 'locked', step: 0, opt: [] };
    /** Numeric world variables (kill counts, gates passed, best times): persistent. */
    this.vars = {};
    /** Reused result array of tick(). */
    this.out = [];
  }

  /** Plain-data snapshot for the save (BRIEF §4.5). */
  serialize() {
    return { quests: structuredClone(this.quests), flags: [...this.flags].sort(), vars: { ...this.vars } };
  }

  /** Restore from a save; unknown quests are ignored, new ones stay locked (forward compatible). */
  restore(data) {
    for (const id in this.quests) this.quests[id] = { state: 'locked', step: 0, opt: [] };
    this.flags = new Set(data?.flags || []);
    this.vars = { ...(data?.vars || {}) };
    for (const id in data?.quests || {}) {
      if (!this.quests[id]) continue;
      const q = data.quests[id], def = this.byId.get(id), known = new Set((def.optional || []).map((o) => o.id));
      this.quests[id] = { state: q.state, step: Math.min(Math.max(0, q.step | 0), def.steps.length), opt: (q.opt || []).filter((o) => known.has(o)) };
    }
  }

  /**
   * Advance the graph against this tick's facts; returns the actions to perform, in order.
   * Facts: { x, z, events: Set<string>, restored: Set<string>, night: boolean }.
   * A step completes at most once per tick per quest, so chained steps take one tick each.
   * Allocation-free when nothing changes (the returned array is reused: copy it to keep it).
   */
  tick(facts) {
    const out = this.out;
    out.length = 0;
    for (let i = 0; i < this.defs.length; i++) {
      const d = this.defs[i];
      const q = this.quests[d.id];
      if (q.state === 'locked') {
        if (!d.start || this.test(d.start, facts)) {
          q.state = 'active'; q.step = 0;
          out.push({ questStarted: d.id });
        } else continue;
      }
      if (q.state !== 'active') continue;
      if (d.optional) {
        for (let k = 0; k < d.optional.length; k++) {
          const o = d.optional[k];
          if (q.opt.includes(o.id) || !this.test(o.when, facts)) continue;
          q.opt.push(o.id);
          if (o.actions) for (let m = 0; m < o.actions.length; m++) out.push(this.perform(o.actions[m]));
          out.push({ optionalDone: d.id, id: o.id });
        }
      }
      const s = d.steps[q.step];
      if (!s || !this.test(s.when, facts)) continue;
      if (s.actions) for (let k = 0; k < s.actions.length; k++) out.push(this.perform(s.actions[k]));
      out.push({ stepDone: d.id, step: s.id });
      q.step++;
      if (q.step >= d.steps.length) {
        q.state = 'done';
        if (d.onDone) for (let k = 0; k < d.onDone.length; k++) out.push(this.perform(d.onDone[k]));
        out.push({ questDone: d.id });
      }
    }
    return out;
  }

  /** Apply the graph's own side of an action (flags), and hand it on to the game. */
  perform(a) {
    if (a.setFlag) this.flags.add(a.setFlag);
    if (a.clearFlag) this.flags.delete(a.clearFlag);
    if (a.setVar) this.vars[a.setVar.name] = a.setVar.value;
    if (a.addVar) this.vars[a.addVar.name] = (this.vars[a.addVar.name] || 0) + a.addVar.by;
    if (a.reveal) for (const id of Array.isArray(a.reveal) ? a.reveal : [a.reveal]) this.flags.add('known:' + id);
    if (a.startQuest) { const q = this.quests[a.startQuest]; if (q && q.state === 'locked') { q.state = 'active'; q.step = 0; } }
    return a;
  }

  /** Evaluate a condition against the facts and the graph's own state. */
  test(c, f) {
    if (!c) return true;
    if (c.flag !== undefined && !this.allFlags(c.flag)) return false;
    if (c.notFlag !== undefined && this.anyFlag(c.notFlag)) return false;
    if (c.quest !== undefined) {
      const q = this.quests[c.quest];
      if (!q) return false;
      if (c.questStep !== undefined) {
        const k = this.stepIndex(c.quest, c.questStep);
        if (k < 0 || (q.state !== 'done' && q.step <= k)) return false;
      } else if (q.state !== 'done') return false;
    }
    if (c.near) {
      let px = c.near.x, pz = c.near.z;
      if (c.near.poi) { const poi = this.pois[c.near.poi]; if (!poi) return false; px = poi.pos[0]; pz = poi.pos[1]; }
      const dx = f.x - px, dz = f.z - pz;
      if (dx * dx + dz * dz > c.near.r * c.near.r) return false;
    }
    if (c.var) {
      const v = this.vars[c.var.name] || 0;
      if (c.var.gte !== undefined && v < c.var.gte) return false;
      if (c.var.lte !== undefined && v > c.var.lte) return false;
      if (c.var.eq !== undefined && v !== c.var.eq) return false;
    }
    if (c.event !== undefined && !(f.events && f.events.has(c.event))) return false;
    if (c.restored !== undefined && !(f.restored && f.restored.has(c.restored))) return false;
    if (c.night !== undefined && !!f.night !== c.night) return false;
    if (c.any) {
      let ok = false;
      for (let k = 0; k < c.any.length && !ok; k++) ok = this.test(c.any[k], f);
      if (!ok) return false;
    }
    if (c.not && this.test(c.not, f)) return false;
    return true;
  }

  allFlags(v) {
    if (typeof v === 'string') return this.flags.has(v);
    for (let i = 0; i < v.length; i++) if (!this.flags.has(v[i])) return false;
    return true;
  }
  anyFlag(v) {
    if (typeof v === 'string') return this.flags.has(v);
    for (let i = 0; i < v.length; i++) if (this.flags.has(v[i])) return true;
    return false;
  }
  stepIndex(quest, stepId) {
    const steps = this.byId.get(quest).steps;
    for (let i = 0; i < steps.length; i++) if (steps[i].id === stepId) return i;
    return -1;
  }

  /** Goals of the active quests: { quest, kind, title, step, optional, goal } (the navigation system resolves them). */
  goals() {
    const out = [];
    for (const d of this.defs) {
      const q = this.quests[d.id];
      if (q.state !== 'active') continue;
      const s = d.steps[q.step];
      if (s && s.goal) out.push({ quest: d.id, kind: d.kind, title: d.title, step: s.id, optional: false, goal: s.goal });
      for (const o of d.optional || []) if (o.goal && !q.opt.includes(o.id)) out.push({ quest: d.id, kind: d.kind, title: d.title, step: o.id, optional: true, goal: o.goal });
    }
    return out;
  }

  /** Journal view: active and finished quests with the lines reached so far. */
  journal() {
    const out = [];
    for (const d of this.defs) {
      const q = this.quests[d.id];
      if (q.state === 'locked') continue;
      out.push({ id: d.id, kind: d.kind, title: d.title, summary: d.summary, done: q.state === 'done',
        lines: d.steps.slice(0, q.state === 'done' ? d.steps.length : q.step + 1).map((s) => s.journal),
        optional: (d.optional || []).map((o) => ({ id: o.id, line: o.journal, done: q.opt.includes(o.id) })) });
    }
    return out;
  }
}

const CONDITION_KEYS = new Set(['flag', 'notFlag', 'quest', 'questStep', 'near', 'event', 'restored', 'night', 'any', 'not', 'var']);
const ACTION_KEYS = new Set(['setFlag', 'clearFlag', 'echo', 'journal', 'lore', 'shrine', 'autosave', 'startQuest', 'say', 'reveal', 'track', 'setVar', 'addVar', 'encounter', 'robe']);

/** Throws on the first malformed quest, naming its path (catches data typos at load and in tests). */
export function validateQuests(defs) {
  const fail = (p, m) => { throw new Error(`quest data ${p}: ${m}`); };
  const ids = new Set();
  const cond = (c, p) => {
    if (c === undefined) return;
    if (typeof c !== 'object' || c === null) fail(p, 'condition must be an object');
    for (const k in c) if (!CONDITION_KEYS.has(k)) fail(p, `unknown condition key "${k}"`);
    if (c.near && !(c.near.r > 0) ) fail(p + '.near', 'needs r > 0');
    if (c.questStep !== undefined && c.quest === undefined) fail(p, 'questStep needs quest');
    if (c.var && (typeof c.var.name !== 'string' || (c.var.gte === undefined && c.var.lte === undefined && c.var.eq === undefined))) fail(p + '.var', 'needs name and gte, lte or eq');
    for (const [i, k] of (c.any || []).entries()) cond(k, `${p}.any[${i}]`);
    if (c.not) cond(c.not, p + '.not');
  };
  const acts = (a, p) => {
    for (const [i, x] of (a || []).entries()) {
      const keys = Object.keys(x);
      if (keys.length !== 1 || !ACTION_KEYS.has(keys[0])) fail(`${p}[${i}]`, `action must have exactly one of ${[...ACTION_KEYS].join(', ')}`);
    }
  };
  for (const [i, d] of defs.entries()) {
    const p = `[${i}] ${d.id}`;
    if (typeof d.id !== 'string' || !d.id) fail(p, 'id');
    if (ids.has(d.id)) fail(p, 'duplicate id');
    ids.add(d.id);
    if (d.kind !== 'main' && d.kind !== 'side') fail(p, 'kind must be main or side');
    if (!Array.isArray(d.steps) || d.steps.length === 0) fail(p, 'needs steps');
    cond(d.start, p + '.start');
    const sids = new Set();
    const goalOk = (g, path) => { if (g && !(g.poi || g.at || g.dynamic)) fail(path, 'goal needs poi, at or dynamic'); };
    for (const [j, s] of d.steps.entries()) {
      if (!s.id || sids.has(s.id)) fail(`${p}.steps[${j}]`, 'step id missing or duplicate');
      sids.add(s.id);
      if (typeof s.journal !== 'string') fail(`${p}.steps[${j}]`, 'journal line');
      cond(s.when, `${p}.steps[${j}].when`);
      acts(s.actions, `${p}.steps[${j}].actions`);
      goalOk(s.goal, `${p}.steps[${j}].goal`);
    }
    for (const [j, o] of (d.optional || []).entries()) {
      if (!o.id || sids.has(o.id)) fail(`${p}.optional[${j}]`, 'optional id missing or duplicate');
      sids.add(o.id);
      if (typeof o.journal !== 'string') fail(`${p}.optional[${j}]`, 'journal line');
      cond(o.when, `${p}.optional[${j}].when`);
      acts(o.actions, `${p}.optional[${j}].actions`);
      goalOk(o.goal, `${p}.optional[${j}].goal`);
    }
    acts(d.onDone, p + '.onDone');
  }
  // Cross-references: quest conditions and startQuest must name real quests.
  const refs = (c, p) => {
    if (!c) return;
    if (c.quest !== undefined && !ids.has(c.quest)) fail(p, `unknown quest "${c.quest}"`);
    if (c.quest !== undefined && c.questStep !== undefined && !defs.find((d) => d.id === c.quest).steps.some((s) => s.id === c.questStep)) fail(p, `unknown step "${c.questStep}"`);
    for (const k of c.any || []) refs(k, p);
    if (c.not) refs(c.not, p);
  };
  for (const d of defs) {
    refs(d.start, d.id + '.start');
    for (const s of d.steps) { refs(s.when, `${d.id}.${s.id}`); for (const a of s.actions || []) if (a.startQuest && !ids.has(a.startQuest)) fail(d.id, `startQuest "${a.startQuest}"`); }
  }
  return defs;
}
