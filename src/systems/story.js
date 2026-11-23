// Owner of the story state (game/story.js, docs/storyline.md §4): `g.story` for the systems and quests
// that write it, and the two things the world records by itself: the days that pass (var `days`, a
// midnight at a time) and the order the biomes are restored in (var `order:<biome>`). Twice a second.

import { createStory } from '../game/story.js';

/** @param {any} g shared boot context */
export function addStorySystem(g) {
  const { loop, chapter, params, clock } = g;
  const graph = chapter.graph, story = g.story = createStory(graph);
  let lastHour = params.v.timeOfDay, acc = 0;
  loop.add({ name: 'story', update: () => {
    acc += clock.dt; if (acc < 0.5) return; acc = 0;
    const h = params.v.timeOfDay;
    if (h < lastHour - 12) graph.vars.days = (graph.vars.days || 0) + 1;   // past midnight (a pinned night never wraps)
    lastHour = h;
    for (const b of chapter.facts.restored) story.restored(b, graph.vars.days || 0);
  } });
  return story;
}
