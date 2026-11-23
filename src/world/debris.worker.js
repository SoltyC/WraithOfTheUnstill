// Buildings broken off the main thread (world/fracture.js): the site is made again here from the same modules and baked
// heights as the architecture's (systems/architecture.js) and fractured; the pieces go back as transferable arrays. The
// fracture of a whole town is a few hundred milliseconds of work: in the game's thread it would be a hitch.
// Sites known here: the Ember's (the Sow's farms, Cinderhold, the Ash Chapel). Others are broken on the main thread.
import { buildDebris } from './fracture.js';
import { sowSites } from './sow.js';
import { cinderSites } from './cinderhold.js';
import { chapelSites } from './ashChapel.js';
import sowHeights from '../../data/world/sowHeights.json';
import cinderHeights from '../../data/world/cinderHeights.json';
import chapelHeights from '../../data/world/chapelHeights.json';

let sites = null;
const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
self.onmessage = (e) => {
  const m = e.data;
  if (m.cmd === 'init') { sites = [...sowSites(m.overview, sowHeights), ...cinderSites(cinderHeights), ...chapelSites(chapelHeights)]; return; }
  if (m.cmd === 'build') {
    const s = sites && sites.find((q) => q.id === m.id);
    if (!s) { self.postMessage({ id: m.id, error: 'unknown site' }); return; }
    const d = buildDebris(s, m.index, rng(0x5a17 + m.index * 977));
    self.postMessage({ id: m.id, debris: d }, [d.positions.buffer, d.normals.buffer, d.uvs.buffer, d.info.buffer, d.frag.buffer, d.indices.buffer]);
  }
};
