// A biome's chapter at runtime (BRIEF §11): its quest graph, NPC talk tables, dialogue and the
// effects of quest actions (Echoes, lore, shrines, autosaves, spoken lines). Data lives in
// data/quests/<biome>.json; this module holds no story.
//
// Each frame the game sets the facts (player x/z, night) and raises events since the last frame
// (talk:<npc>, shrine:<id>, crystal, warden:released …); tick() runs the graph and applies what it
// returns. Dialogue is a queue of lines shown as subtitles, at most one choice deep (§11).

import { QuestGraph } from './quests/questGraph.js';

/**
 * @param {{ data: any, pois: any[], hooks: { echo?: Function, lore?: Function, shrine?: Function,
 *           autosave?: Function, journal?: Function, questStarted?: Function, questDone?: Function } }} opts
 */
export function createChapter({ data, pois, hooks = {} }) {
  const table = {};
  for (const p of pois) table[p.id] = p;
  for (const id in data.places || {}) table[id] = { id, kind: 'place', ...data.places[id] };
  const graph = new QuestGraph(data.quests, table);
  const facts = { x: 0.5, z: 0.5, night: false, events: new Set(), restored: new Set() };
  /** Unlocked Echoes, lore and shrines (progression; saved). */
  const echoes = new Set(), lore = new Set(), shrines = new Set();
  /** Dialogue now playing: { id, speaker, lines, i, choice, t }, or null; and waiting lines. */
  let line = null;
  const queue = [];

  function effect(a) {
    if (a.echo && !echoes.has(a.echo)) { echoes.add(a.echo); hooks.echo?.(a.echo, data.echoes?.[a.echo]); }
    if (a.lore && !lore.has(a.lore)) { lore.add(a.lore); hooks.lore?.(a.lore, data.lore?.[a.lore]); }
    if (a.shrine && !shrines.has(a.shrine)) { shrines.add(a.shrine); graph.flags.add(a.shrine); hooks.shrine?.(a.shrine); }
    if (a.autosave) hooks.autosave?.();
    if (a.journal) hooks.journal?.(a.journal);
    if (a.say) self.say(a.say);
    if (a.questStarted) hooks.questStarted?.(graph.byId.get(a.questStarted));
    if (a.questDone) hooks.questDone?.(graph.byId.get(a.questDone));
  }
  function run(actions) { if (actions) for (const a of actions) effect(graph.perform(a)); }

  const self = {
    data, graph, facts, echoes, lore, shrines, table,
    /** Bumped whenever the line on screen changes (the subtitles UI redraws only then). */
    ver: 0,
    /** Raise an event for the next tick. */
    raise(e) { facts.events.add(e); },
    /** Advance quests on this frame's facts and events, then forget the events. */
    tick() {
      const out = graph.tick(facts);
      for (let i = 0; i < out.length; i++) effect(out[i]);
      if (facts.events.size) facts.events.clear();
    },
    /** Talk to an NPC: the first entry of its table whose condition holds plays. */
    talk(npc) {
      const list = data.talk?.[npc];
      if (!list) return false;
      this.raise('talk:' + npc);
      for (const t of list) if (graph.test(t.when, facts)) { this.say(t.say); return true; }
      return false;
    },
    /** Queue a dialogue by id (subtitles; `then` actions run after its last line or choice). */
    say(id) {
      const d = data.dialogue?.[id];
      if (!d) { console.warn('[chapter] no dialogue', id); return; }
      if (line && line.id === id) return;
      queue.push(id);
      if (!line) this.next();
    },
    next() {
      const id = queue.shift();
      line = id ? { id, d: data.dialogue[id], i: 0, t: 0, choosing: false } : null;
      this.ver++;
    },
    /** The line on screen: { speaker, text, choice? } or null (read by the subtitles UI). */
    get current() {
      if (!line) return null;
      const d = line.d;
      if (line.choosing) return { speaker: d.speaker, name: speakerName(d.speaker), text: null, options: d.choice.options.map((o) => o.text) };
      return { speaker: d.speaker, name: speakerName(d.speaker), text: d.lines[line.i] };
    },
    /** Seconds a line stays up unless advanced. */
    lineSeconds(text) { return 1.8 + 0.058 * text.length; },
    /** Advance dialogue time; `advance` = the player pressed Interact; `pick` = choice index or −1. */
    updateDialogue(dt, advance, pick) {
      if (!line) return;
      const d = line.d;
      if (line.choosing) {
        if (pick >= 0 && pick < d.choice.options.length) { run(d.choice.options[pick].then); run(d.then); this.next(); }
        return;
      }
      line.t += dt;
      if (advance || line.t > this.lineSeconds(d.lines[line.i])) {
        line.i++; line.t = 0; this.ver++;
        if (line.i >= d.lines.length) {
          if (d.choice) { line.choosing = true; this.ver++; }
          else { run(d.then); this.next(); }
        }
      }
    },
    get talking() { return line !== null; },
    /** Save/load (quests and flags go through the graph; progression here). */
    serialize() { return graph.serialize(); },
    restore(q) { graph.restore(q); line = null; queue.length = 0; },
    collect(s) {
      s.progression.echoes = [...echoes].sort(); s.progression.shrines = [...shrines].sort(); s.journal.lore = [...lore].sort();
    },
    apply(s) {
      echoes.clear(); lore.clear(); shrines.clear();
      for (const e of s.progression.echoes) { echoes.add(e); hooks.echo?.(e, data.echoes?.[e], true); }
      for (const l of s.journal.lore) lore.add(l);
      for (const sh of s.progression.shrines) shrines.add(sh);
    },
    /** Journal view: quests with lines reached, lore found. */
    journal() {
      return { quests: graph.journal(), lore: [...lore].map((id) => ({ id, ...data.lore[id] })), echoes: [...echoes].map((id) => ({ id, ...data.echoes[id] })) };
    },
  };
  function speakerName(id) { if (!id) return ''; const n = data.npcs.find((x) => x.id === id); return n ? n.name : id; }
  return self;
}
