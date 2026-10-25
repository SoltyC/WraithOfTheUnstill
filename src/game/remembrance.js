// Remembrance (docs/gameplay-design.md §6): the journal page of observations, never tasks. Each entry
// (data/remembrance.json) is unlocked once, by one trigger, into the quest-graph flag `rem:<id>` (so it
// saves with the world). `remember(id)` is the one call every reaction hangs off (systems/remembrance.js
// toasts it, sounds it, reveals places). Pure: no game state is read here, so it is unit-tested
// (tests/remembrance.test.js). Allocation-free once built.

import data from '../../data/remembrance.json';

export const GROUPS = data.groups;
export const ENTRIES = data.entries;
export const flagOf = (id) => 'rem:' + id;

/** Problems in an entry list (empty when sound): unique ids, a known group, exactly one trigger, text. */
export function checkEntries(entries = ENTRIES, groups = GROUPS) {
  const bad = [], ids = new Set(), known = new Set(groups.map((g) => g[0]));
  for (const e of entries) {
    if (ids.has(e.id)) bad.push('duplicate ' + e.id);
    ids.add(e.id);
    if (!known.has(e.group)) bad.push(e.id + ': group ' + e.group);
    if (!!e.on === !!e.has) bad.push(e.id + ': needs exactly one of on / has');
    if (!e.title || !e.text || e.text.length < 40 || e.text.length > 330) bad.push(e.id + ': title or text');
  }
  return bad;
}

/**
 * @param {{ entries?: any[], flags: Set<string>, resolve?: (has: string) => (() => boolean), onRemember?: (e: any, ctx?: any) => void }} o
 *   resolve: makes the check for a `has` state once (the system builds closures over the game, so a poll allocates nothing).
 */
export function createRemembrance({ entries = ENTRIES, flags, resolve, onRemember }) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const byEvent = new Map(), polled = [];
  for (const e of entries) {
    if (e.on) { if (!byEvent.has(e.on)) byEvent.set(e.on, []); byEvent.get(e.on).push(e); }
    else polled.push({ e, flag: flagOf(e.id), test: resolve ? resolve(e.has) : () => false });
  }
  const cells = new Map(entries.filter((e) => e.cell).map((e) => [e.cell[0] + ':' + e.cell[1], e]));
  const self = {
    byId, entries, cells,
    has: (id) => flags.has(flagOf(id)),
    /** Unlock an entry. True the first time; false if it is already remembered or unknown. `ctx` goes to onRemember (silent, x, z, site). */
    remember(id, ctx) {
      const e = byId.get(id);
      if (!e || flags.has(flagOf(id))) return false;
      flags.add(flagOf(id));
      onRemember?.(e, ctx);
      return true;
    },
    /** A world event (nook:<id>, talk:<npc>, cast:<surface>:<element>, react:shatter). */
    event(name, ctx) {
      const list = byEvent.get(name);
      if (list === undefined) return;
      for (let i = 0; i < list.length; i++) self.remember(list[i].id, ctx);
    },
    /** Check the polled states (a few times a second). `ctx` as in remember: { silent: true } after a load. */
    poll(ctx) {
      for (let i = 0; i < polled.length; i++) { const p = polled[i]; if (!flags.has(p.flag) && p.test()) self.remember(p.e.id, ctx); }
    },
    /** Remembered entries in file order. */
    list() { return entries.filter((e) => flags.has(flagOf(e.id))); },
    get count() { let n = 0; for (const e of entries) if (flags.has(flagOf(e.id))) n++; return n; },
    /** The entry filling a reaction cell (surface, element), or undefined. */
    cell(surface, element) { return cells.get(surface + ':' + element); },
  };
  return self;
}
