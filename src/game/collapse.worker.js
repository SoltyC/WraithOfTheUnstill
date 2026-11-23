// The collapses' physics off the main thread (game/collapse.js, on Rapier): the main thread (systems/destruction.js) starts
// one with its pieces' bounds, the ground under it (a height grid) and when each group meets the cause; each tick the worker
// steps every running collapse and sends back its pieces' transforms and what happened (for the dust). finish: to rest at once.
import { createCollapse, physicsReady } from './collapse.js';

const sims = new Map();
let chain = physicsReady;
self.onmessage = (e) => {
  // (In order, after the engine is ready.)
  chain = chain.then(() => handle(e.data));
};
function handle(m) {
  if (m.cmd === 'start') {
    const c = createCollapse({ frags: m.frags }, { ...m.opt, grid: m.grid });
    if (m.finish) { c.finish(); const xf = c.xf.slice(), heap = c.heap(); self.postMessage({ id: m.id, xf, events: [], done: true, heap, grid: m.grid }, [xf.buffer, heap.h.buffer]); c.dispose(); return; }
    c.grid = m.grid; sims.set(m.id, c);
  } else if (m.cmd === 'tick') {
    for (const [id, c] of sims) {
      c.advance(m.dt);
      const xf = c.xf.slice(), events = c.events.splice(0);
      if (c.done) { const heap = c.heap(); self.postMessage({ id, xf, events, done: true, t: c.t, heap, grid: c.grid }, [xf.buffer, heap.h.buffer]); c.dispose(); sims.delete(id); }
      else self.postMessage({ id, xf, events, done: false, t: c.t }, [xf.buffer]);
    }
  }
}
