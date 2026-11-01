// The side sites in the world (machines: game/puzzles/sides.js; the pool and brush hook: systems/puzzles.js).

import { BRUSH } from '../shaders/terrainState.wgsl.js';
import { CHUNK } from '../game/shaped/rig.js';
import { trackPrints } from '../game/walker/route.js';
import { MIRAGE, createMirage, FALLS, createFalls, GLASS, createGlassBattle, DOOR, createBuriedDoor, FLOOD, createFloodGarden } from '../game/puzzles/sides.js';

const SHOW_R = 260, FALL_N = 12;
const TRACK = ['dunes:instrument-sun', 'dunes:instrument-clock', 'dunes:instrument-song'];

export function buildSides(g, P) {
  const { ICE, WATER, SAND, RUIN, POD, SEDGE } = CHUNK;
  const X = g.sideParts = {};
  X.ghost = P.group(); P.add(X.ghost, 0, 7, 0, 30, 9, 30, RUIN, { glow: 0 }); P.add(X.ghost, 0, 12.6, 0, 3, 3, 3, RUIN, { glow: 0 });
  X.dome = P.group(MIRAGE.cross[0], 0, MIRAGE.cross[1]); P.add(X.dome, 0, 1.4, 0, 9, 3.4, 9, RUIN, { glow: 0 });
  X.ramps = [];
  for (let r = 0; r < 2; r++) { const q = []; for (let k = 0; k < FALL_N; k++) { const c = P.group(); P.add(c, 0, 0, 0, 2.6, 1.1, 2.6, ICE, { glow: 0 }); q.push(c); } X.ramps.push(q); }
  X.falls = [];
  for (let r = 0; r < 2; r++) { const q = []; for (let k = 0; k < FALL_N; k++) { const c = P.group(); P.add(c, 0, 0, 0, 0.9, 1.3, 0.9, SAND, { glow: 0 }); q.push(c); } X.falls.push(q); }
  X.glints = GLASS.map((G) => { const c = P.group(G.at[0] + G.from[0], 0, G.at[1] + G.from[1]); P.add(c, 0, 0.5, 0, 0.5, 0.5, 0.5, POD); return c; });
  X.water = FLOOD.cisterns.map((c) => { const q = P.group(FLOOD.site[0] + c[0], 0, FLOOD.site[1] + c[1]); P.add(q, 0, 0, 0, 5.2, 0.5, 5.2, WATER, { glow: 0 }); return q; });
  X.bloom = FLOOD.cisterns.map((c) => { const q = P.group(FLOOD.site[0] + c[0], 0, FLOOD.site[1] + c[1]); for (let k = 0; k < 6; k++) { const a = k * 1.05; P.add(q, Math.cos(a) * 4.2, 0.5, Math.sin(a) * 4.2, 0.5, 1.2, 0.5, SEDGE, { glow: 0 }); } return q; });
  // The glass track: a third of its prints lights for each instrument solved, and shows at dusk (§4.2).
  X.prints = trackPrints().map((t) => { const q = P.group(t[0], 0, t[1]); P.add(q, 0, 0.6, 0, 1.1, 0.5, 1.1, POD); return q; });
  X.iceDam = P.group(FLOOD.site[0] + FLOOD.gates[1].at[0], 0, FLOOD.site[1] + FLOOD.gates[1].at[1]); P.add(X.iceDam, 0, 0.6, 0, 5, 1.6, 2, ICE, { glow: 0 });
}

export function addSideSites(g, P, tell, chime) {
  const { chapter, ground, sfx, SFX, controller, clock, params, terrainState: ts, qs } = g;
  const X = g.sideParts, flags = chapter.graph.flags, F = {
    crossed: 'dunes:mirage-crossed', found: 'dunes:mirage-found', reached: 'dunes:falls-reached', heard: 'dunes:glass-heard', glass: 'dunes:glass-done', door: 'dunes:door-open', full: 'dunes:garden-full', heap: 'dunes:door-heaped',
  };
  const S = g.sideSites = { mirage: createMirage(), falls: createFalls(), glass: createGlassBattle(), door: createBuriedDoor(), flood: createFloodGarden() };
  const restore = () => {
    S.mirage.bearings.fill(flags.has(F.crossed)); S.mirage.found = flags.has(F.found); S.mirage.digs = 0;
    S.falls.reached = flags.has(F.reached);
    S.glass.done.fill(flags.has(F.glass));
    S.door.open = flags.has(F.door); S.door.clear.fill(S.door.open);
    S.flood.done = flags.has(F.full);
  };
  restore(); g.puzzleRestores.push(restore);
  const groundAt = (x, z) => { ground.qx = x; ground.qz = z; ground.sample(); return ground.h; };
  const seatGroup = (q, y) => { const G = P.group_(q); P.pose(q, G.x, y, G.z, 0); };

  // The falls' stairs: a ramp each, on while frozen (world/solids.js).
  const R = [[FALLS.foot, FALLS.low], [FALLS.low, FALLS.high]];
  /** After the sandfalls refill the list, every frame. */
  g.addPuzzleRamps = (rp) => {
    for (let k = 0; k < 2; k++) {
      const a = R[k][0], b = R[k][1], i = rp.n++;
      rp.x0[i] = a[0]; rp.z0[i] = a[1]; rp.y0[i] = a[2]; rp.x1[i] = b[0]; rp.z1[i] = b[1]; rp.y1[i] = b[2];
      rp.hw[i] = 1.7; rp.steps[i] = Math.max(4, Math.ceil(Math.abs(b[2] - a[2]) / 0.4)); rp.on[i] = S.falls.life[k] > 0 ? 1 : 0;
    }
  };

  // The cairns' bearings.
  const cairns = MIRAGE.cairns.map((c, k) => {
    const t = { kind: 'puzzle', id: 'mirage-cairn-' + k, verb: 'Take a bearing', name: 'Cairn', x: c[0], y: 0, z: c[1], r: 3.5, h: 3, hy: 1.4, hidden: true, onUse: () => {
      const h = params.v.timeOfDay;
      if (S.mirage.take(k, h)) {
        chime(SFX.CHIME, 0.8);
        if (S.mirage.crossed()) { flags.add(F.crossed); tell('The Mirage Map', 'The two lines cross', 'The dome stands on neither. It lies where they meet.', 8); }
        else tell('The Mirage Map', 'One line drawn', 'It runs on past the shimmer. It wants a second, from the other cairn.', 6);
      } else if (!S.mirage.isNoon(h)) tell('The cairn', 'Nothing shimmers', 'The dome only shows when the sun is high.', 5);
    } };
    g.interactables?.push(t); return t;
  });

  P.show(X.ghost, false); P.show(X.dome, false); P.show(X.iceDam, false);
  for (const q of [...X.ramps.flat(), ...X.water, ...X.bloom, ...X.prints]) P.show(q, false);
  const seated = { mirage: false, falls: false, glass: false, door: false, flood: false };
  const dist2 = (c, x, z) => (c.x - x) ** 2 + (c.z - z) ** 2;
  const within = (c, x, z, r) => dist2(c, x, z) < r * r;
  let ghostOn = false, phase = 0;

  function mound(x, z, r, d, kind) {
    ts.bx = x; ts.bz = z; ts.bdx = 1; ts.bdz = 0; ts.bl = r * 0.6; ts.bw = r; ts.bd = d; ts.bc = 0.5; ts.bk = kind; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0; ts.stamp();
  }
  let stamping = false;
  return {
    /** Every terrain brush, wherever it was cast. */
    brush(bk, x, z) {
      if (stamping) return;
      const p = controller.pos, m = S.mirage, u = x - FLOOD.site[0], v = z - FLOOD.site[1];
      if (bk === BRUSH.PLOUGH) {
        if (m.plough(x, z)) { flags.add(F.found); chapter.raise('mirage:found'); chime(SFX.TOLL, 1.2); tell('The Mirage Map', 'The sand gives up a dome', 'The cistern, where nothing showed but the lines.', 8); }
        S.flood.brush('plough', u, v);
      } else if (bk === BRUSH.FREEZE) { S.falls.freeze(x, z); S.flood.brush('ice', u, v); glass('frost', x, z, p); }
      else if (bk === BRUSH.WET) { S.flood.brush('wet', u, v); glass('water', x, z, p); }
      else if (bk === BRUSH.RIDGE || bk === BRUSH.CRATER) {
        S.flood.brush('ridge', u, v); glass('stone', x, z, p);
        const k = S.door.ridge(x, z);
        if (k >= 0) {
          stamping = true;
          mound(DOOR.spots[k][0], DOOR.spots[k][1], DOOR.r, 1.3, BRUSH.PLOUGH);
          if (k < 2) mound(DOOR.spots[k + 1][0], DOOR.spots[k + 1][1], DOOR.r, 0.9, BRUSH.MOUND);
          stamping = false;
          chime(SFX.THUD, 1);
          if (S.door.open) { flags.add(F.door); chapter.raise('door:open'); chime(SFX.TOLL, 1.3); tell('The Buried Door', 'Vent, stair and door', 'The Sunken Temple stands open to the air.', 8); }
        }
      } else if (bk === BRUSH.FLATTEN) glass('gale', x, z, p);
    },
    update(dt, c) {
      let any = false;
      for (const t of cairns) t.hidden = true;
      // The Mirage Map.
      if (within(c, 1945, 165, SHOW_R)) {
        any = true;
        if (!seated.mirage) { cairns.forEach((t) => { t.y = groundAt(t.x, t.z); }); seatGroup(X.dome, groundAt(MIRAGE.cross[0], MIRAGE.cross[1]) - 3.4); seated.mirage = true; }
        const noon = S.mirage.isNoon(params.v.timeOfDay);
        let at = -1;
        for (let k = 0; k < 2; k++) { cairns[k].hidden = false; if (within(controller.pos, MIRAGE.cairns[k][0], MIRAGE.cairns[k][1], 26)) at = k; }
        // The dome shows on the line of sight, far beyond where it stands.
        const on = noon && at >= 0 && !S.mirage.found;
        if (on !== ghostOn) { ghostOn = on; P.show(X.ghost, on); }
        if (on) {
          const a = MIRAGE.cairns[at], dx = MIRAGE.cross[0] - a[0], dz = MIRAGE.cross[1] - a[1];
          P.pose(X.ghost, a[0] + dx * 1.5, groundAt(MIRAGE.cross[0], MIRAGE.cross[1]) + 2, a[1] + dz * 1.5, 0);
        }
        P.show(X.dome, S.mirage.found);
        if (S.mirage.found) { const G = P.group_(X.dome); const to = groundAt(G.x, G.z) - 0.4; P.pose(X.dome, G.x, G.y + (to - G.y) * Math.min(1, dt), G.z, 0); }
      }
      // The Frozen Falls.
      if (within(c, FALLS.low[0], FALLS.low[1], SHOW_R)) {
        any = true;
        S.falls.update(dt, false);
        phase = (phase + dt * 1.5) % 1;
        for (let r = 0; r < 2; r++) {
          const [a, b] = R[r], frozen = S.falls.life[r] > 0;
          for (let k = 0; k < FALL_N; k++) {
            const t = (k + 0.5) / FALL_N, u = (k + phase) / FALL_N, ice = X.ramps[r][k], f = X.falls[r][k];
            P.show(ice, frozen); P.show(f, !frozen);
            if (frozen) P.pose(ice, a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t - 0.45, a[1] + (b[1] - a[1]) * t, 0);
            else P.pose(f, b[0] + (a[0] - b[0]) * u, b[2] + (a[2] - b[2]) * u, b[1] + (a[1] - b[1]) * u, 0);
          }
        }
        const p = controller.pos;
        if (S.falls.arrive(p.x, p.y, p.z)) { flags.add(F.reached); chapter.raise('falls:reached'); chime(SFX.TOLL, 1.1); tell('The Sky Window', 'The sky, framed', 'It shows the whole erg, and the line of the glass across it.', 9); }
      }
      // The Glass Battle.
      S.glass.heard = flags.has(F.heard);
      if (S.glass.heard) for (let i = 0; i < 5; i++) {
        const G = GLASS[i], x = G.at[0] + G.from[0], z = G.at[1] + G.from[1];
        if (!within(c, x, z, SHOW_R)) continue;
        any = true;
        if (!seated['g' + i]) { seatGroup(X.glints[i], groundAt(x, z)); seated['g' + i] = true; }
        P.glow(X.glints[i], S.glass.done[i] ? 1.5 : 0.5);
      }
      // The Buried Door: heaped once, when the Wraith first comes with Stone's work to do.
      if (within(c, DOOR.spots[1][0], DOOR.spots[1][1], 36) && ts && flags.has('dunes:walker-woke') && !flags.has(F.heap) && !flags.has(F.door)) {
        stamping = true;
        for (const s of DOOR.spots) mound(s[0], s[1], DOOR.r, 1.4, BRUSH.MOUND);
        stamping = false; flags.add(F.heap);
      }
      // The glass track.
      const dusk = g.env.env.sunDir.y < 0.32;
      for (let k = 0; k < X.prints.length; k++) {
        const q = X.prints[k], G = P.group_(q), lit = dusk && flags.has(TRACK[k % 3]);
        if (!seated['p' + k]) { if (!within(c, G.x, G.z, SHOW_R)) { continue; } P.pose(q, G.x, groundAt(G.x, G.z), G.z, 0); seated['p' + k] = true; }
        P.glow(q, lit ? 1.4 : 0); P.show(q, lit);
        if (lit && within(c, G.x, G.z, SHOW_R)) any = true;
      }
      // The Flood Garden.
      const restored = flags.has('dunes:walker-released') || qs?.get('flood') === '1';
      if (restored && within(c, FLOOD.site[0], FLOOD.site[1], SHOW_R)) {
        any = true;
        if (!seated.flood) {
          X.water.forEach((q, k) => { const G = P.group_(q), y = groundAt(G.x, G.z); P.pose(q, G.x, y + 0.2, G.z, 0); seatGroup(X.bloom[k], y); });
          seatGroup(X.iceDam, groundAt(P.group_(X.iceDam).x, P.group_(X.iceDam).z)); seated.flood = true;
        }
        const r = S.flood.update(dt, params.v.timeOfDay);
        if (r === 1) { flags.add(F.full); chapter.raise('garden:full'); chime(SFX.TOLL, 1.3); tell('The Flood Garden', 'Four cisterns full', 'Water stands in the side canyon, and it will stay.', 8); }
        else if (r === -1) tell('The Flood Garden', 'The water goes on', 'It will run again at the next dusk.', 6);
        for (let k = 0; k < 4; k++) { P.show(X.water[k], S.flood.level[k] > 0.02 || S.flood.done); P.scale(X.water[k], S.flood.done ? 1 : Math.max(0.05, S.flood.level[k])); P.show(X.bloom[k], S.flood.done); }
        P.show(X.iceDam, S.flood.open[1]);
      }
      return any;
    },
  };

  function glass(el, x, z, p) {
    const i = S.glass.cast(el, x, z, p.x, p.z);
    if (i < 0) return;
    chime(SFX.CHIME, 1.1); sfx.gain = 0.8;
    tell('The Glass Battle', S.glass.count() + ' of 5', 'The glass rings. For a moment the blow stands in the air again.', 6);
    if (S.glass.count() === 5) { flags.add(F.glass); chapter.raise('glass:read'); tell('The Glass Battle', 'All five blows read', 'Iven will have felt that.', 8); }
  }
}
