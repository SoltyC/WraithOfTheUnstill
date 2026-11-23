// The story state (docs/storyline.md §4): what the branching story reads. Kept in the quest graph's
// flags and vars, so the save already stores it and every quest condition can already test it:
//   fate      flag `fate:<person>:<dead|gone|moved>` (none: alive, where they belong), var `at:<person>` unused;
//             a person's place when moved: flag `where:<person>:<place>`.
//   word      var `word:<community>`: what a settlement has heard of the Wraith, −2 feared … +2 revered (0 unknown/uneasy).
//   knowledge flag `know:<id>`: what the Wraith has learned of the truth.
//   held      flag `held:<warden>:<released|kept>`; how: flag `held:<warden>:<detail>`.
//   order     var `order:<biome>`: 1 for the first biome restored, 2 the second …; var `day:<biome>` the day it was.
//   community var `pop:<community>` (people living there), flag `moved:<community>:<place>`.
// No meter is ever shown (storyline §2 rule 4): the world reads this, never a HUD.

export const FATES = ['dead', 'gone', 'moved'];
/** Settlements whose word the story tracks (the Ember villages are added in Phase 11). */
export const COMMUNITIES = ['frost-camp', 'hearn', 'wellhouse', 'sun-gate', 'fen', 'ebbhold-survivors', 'cinderhold', 'ash-chapel', 'the-sow', 'steamhaven'];
export const WORD = { feared: -2, uneasy: -1, unknown: 0, trusted: 1, revered: 2 };

/** @param {{ flags: Set<string>, vars: Record<string, any> }} graph  the quest graph (its state is the save) */
export function createStory(graph) {
  const flags = graph.flags, vars = graph.vars;
  const self = {
    /** Set a person's fate (state ∈ FATES, or 'alive' to clear) and, optionally, where they are now. */
    fate(person, state, where) {
      for (const f of FATES) flags.delete(`fate:${person}:${f}`);
      if (state !== 'alive') {
        if (!FATES.includes(state)) throw new Error('story: unknown fate ' + state);
        flags.add(`fate:${person}:${state}`);
      }
      if (where !== undefined) {
        for (const f of [...flags]) if (f.startsWith(`where:${person}:`)) flags.delete(f);
        if (where) flags.add(`where:${person}:${where}`);
      }
    },
    /** 'alive' | 'dead' | 'gone' | 'moved'. */
    fateOf(person) { for (const f of FATES) if (flags.has(`fate:${person}:${f}`)) return f; return 'alive'; },
    whereOf(person) { for (const f of flags) if (f.startsWith(`where:${person}:`)) return f.slice(person.length + 7); return null; },
    /** Change a community's word of the Wraith by `by` (clamped −2…+2); returns the new value. */
    word(community, by) {
      if (!COMMUNITIES.includes(community)) throw new Error('story: unknown community ' + community);
      const k = 'word:' + community, v = Math.max(-2, Math.min(2, (vars[k] || 0) + by));
      vars[k] = v; return v;
    },
    wordOf(community) { return vars['word:' + community] || 0; },
    /** Word travels: refugees and pilgrims carry `from`'s opinion to `to`, pulling it part of the way. */
    carryWord(from, to, k = 0.5) {
      const a = self.wordOf(from), b = self.wordOf(to), v = Math.round(b + (a - b) * k);
      vars['word:' + to] = Math.max(-2, Math.min(2, v)); return vars['word:' + to];
    },
    know(id) { flags.add('know:' + id); },
    knows(id) { return flags.has('know:' + id); },
    held(warden, how) { flags.add(`held:${warden}:${how}`); },
    heldOf(warden) { return flags.has(`held:${warden}:released`) ? 'released' : flags.has(`held:${warden}:kept`) ? 'kept' : 'held'; },
    /** Record a biome's restoration in order (idempotent). Returns its place in the order. */
    restored(biome, day) {
      const k = 'order:' + biome;
      if (!vars[k]) { let n = 0; for (const key in vars) if (key.startsWith('order:')) n++; vars[k] = n + 1; vars['day:' + biome] = day ?? 0; }
      return vars[k];
    },
    orderOf(biome) { return vars['order:' + biome] || 0; },
    /** Everything, for the dev overlay and the bot (plain data). */
    snapshot() {
      const s = { fates: {}, where: {}, word: {}, know: [], held: {}, order: {}, pop: {}, moved: {} };
      for (const f of flags) {
        const p = f.split(':');
        if (p[0] === 'fate') s.fates[p[1]] = p[2];
        else if (p[0] === 'where') s.where[p[1]] = p.slice(2).join(':');
        else if (p[0] === 'know') s.know.push(p.slice(1).join(':'));
        else if (p[0] === 'held') (s.held[p[1]] ||= []).push(p.slice(2).join(':'));
        else if (p[0] === 'moved') s.moved[p[1]] = p.slice(2).join(':');
      }
      for (const k in vars) {
        const [a, b] = k.split(':');
        if (a === 'word') s.word[b] = vars[k];
        else if (a === 'order') s.order[b] = vars[k];
        else if (a === 'pop') s.pop[b] = vars[k];
      }
      s.know.sort();
      return s;
    },
  };
  return self;
}
