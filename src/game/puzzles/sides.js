// The dunes' five side sites (docs/phase-9/dunes-design.md §5): each a small machine in world coordinates
// (x, z), driven by the same brushes and Interact as the instruments. systems/puzzleSides.js wires them.

import { GRAMMAR } from './grammar.js';

const near = (ax, az, bx, bz, r) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz < r * r; };

/** 1. The Mirage Map (salt pan): at noon a cairn shows a bearing; two cross where the cistern lies. */
export const MIRAGE = {
  cairns: [[1890, 120], [2000, 135]], cross: [1945, 205], noon: [10.5, 14], digR: 8, digs: 4,
};
export function createMirage() {
  return {
    bearings: [false, false], digs: 0, found: false,
    isNoon(h) { return h >= MIRAGE.noon[0] && h <= MIRAGE.noon[1]; },
    /** At cairn k, hour h. True when a bearing was taken. */
    take(k, h) { if (!this.isNoon(h) || this.bearings[k]) return false; this.bearings[k] = true; return true; },
    crossed() { return this.bearings[0] && this.bearings[1]; },
    /** A plough at (x, z). True on the frame the cistern is uncovered. */
    plough(x, z) {
      if (this.found || !this.crossed() || !near(x, z, MIRAGE.cross[0], MIRAGE.cross[1], MIRAGE.digR)) return false;
      if (++this.digs >= MIRAGE.digs) { this.found = true; return true; }
      return false;
    },
  };
}

/** 2. The Frozen Falls: two sandfalls between hoodoos. Frozen, each is a stair for about 60 s of sun. */
export const FALLS = {
  /** The hoodoos' tops (x, z, y) come from data/world/ravines.json; the falls stand beside them. */
  low: [1595.95, 109.67, 108.35], high: [1607.94, 88.21, 111.06], foot: [1578, 122, 96.2], freezeR: 8,
};
export function createFalls() {
  return {
    life: [0, 0], reached: false,
    freeze(x, z) {
      const F = FALLS;
      if (near(x, z, (F.foot[0] + F.low[0]) / 2, (F.foot[1] + F.low[1]) / 2, F.freezeR * 1.6)) this.life[0] = GRAMMAR.thawSun;
      if (near(x, z, (F.low[0] + F.high[0]) / 2, (F.low[1] + F.high[1]) / 2, F.freezeR * 1.6)) this.life[1] = GRAMMAR.thawSun;
    },
    update(dt, shade) {
      for (let k = 0; k < 2; k++) if (this.life[k] > 0) this.life[k] = Math.max(0, this.life[k] - dt / (shade ? 10 : 1));
    },
    /** The Wraith at (x, y, z): true on the frame it stands at the window. */
    arrive(x, y, z) {
      if (this.reached || y < FALLS.high[2] - 1 || !near(x, z, FALLS.high[0], FALLS.high[1], 3.5)) return false;
      this.reached = true; return true;
    },
  };
}

/** 3. The Glass Battle: stand where each blow came from, and give its element back. */
export const ANY = 'any', FROST = 'frost', STONE = 'stone';
export const GLASS = [
  { at: [2634, 825], from: [9, 0], el: FROST },
  { at: [2762, 707], from: [0, -9], el: FROST },
  { at: [2595, 629], from: [-9, 0], el: FROST },
  { at: [2535, 459], from: [0, 9], el: STONE },
  { at: [2680, 560], from: [-7, -7], el: ANY },
];
export function createGlassBattle() {
  return {
    done: [false, false, false, false, false], heard: false,
    count() { let n = 0; for (let i = 0; i < 5; i++) n += this.done[i] ? 1 : 0; return n; },
    /** The Wraith at (px, pz) casts `el` at (x, z). Returns the formation it woke, or -1. */
    cast(el, x, z, px, pz) {
      if (!this.heard) return -1;
      for (let i = 0; i < 5; i++) {
        const G = GLASS[i];
        if (this.done[i] || (G.el !== ANY && G.el !== el) || !near(x, z, G.at[0], G.at[1], 16)) continue;
        if (!near(px, pz, G.at[0] + G.from[0], G.at[1] + G.from[1], 4.5)) continue;
        this.done[i] = true; return i;
      }
      return -1;
    },
  };
}

/** 4. The Buried Door: every clear pushes sand onto the next. Door, then vent, then stair. */
export const DOOR = { spots: [[2921, 1140], [2909, 1130], [2899, 1144]], r: 6 }; // door, vent, stair
export function createBuriedDoor() {
  return {
    clear: [false, false, false], open: false,
    /** A Ridge at (x, z). Returns the spot it cleared, or -1. */
    ridge(x, z) {
      if (this.open) return -1;
      for (let k = 0; k < 3; k++) {
        if (this.clear[k] || !near(x, z, DOOR.spots[k][0], DOOR.spots[k][1], DOOR.r)) continue;
        this.clear[k] = true;
        if (k < 2) this.clear[k + 1] = false; // the sand goes on to the next
        this.open = this.clear[0] && this.clear[1] && this.clear[2];
        return k;
      }
      return -1;
    },
  };
}

/** 5. The Flood Garden: at dusk, after the release, the wadi runs for about 90 s. Four cisterns; three need a way. */
export const FLOOD = {
  site: [1559, 626], window: [17.5, 19.5], run: 90, slump: 10, rate: 0.024,
  /** Gates, site-local: how each is made to hold. */
  gates: [{ at: [-14, -8], need: 'ridge' }, { at: [2, 10], need: 'ice' }, { at: [16, -6], need: 'channel' }],
  cisterns: [[-22, 4], [-8, 18], [8, 22], [26, 6]], r: 7,
};
export function createFloodGarden() {
  const G = FLOOD.gates;
  return {
    open: [false, false, false], wetT: 0, cutLife: 0, level: [0, 0, 0, 0], t: -1, done: false,
    /** A brush at site-local (u, v): 'ridge', 'ice', 'plough' or 'wet'. */
    brush(kind, u, v) {
      const at = (k) => near(u, v, G[k].at[0], G[k].at[1], FLOOD.r);
      if (kind === 'ridge' && at(0)) this.open[0] = true;
      else if (kind === 'ice' && at(1)) { this.open[1] = true; this.iceLife = GRAMMAR.thawSun; }
      else if (kind === 'wet' && at(2)) this.wetT = 30;
      else if (kind === 'plough' && at(2)) { this.open[2] = true; this.cutLife = this.wetT > 0 ? 1e9 : FLOOD.slump; }
    },
    /** h: the hour. Runs the flood when the dusk comes; a run that falls short leaves room for the next. */
    update(dt, h) {
      if (this.done) return 0;
      if (this.wetT > 0) this.wetT -= dt;
      if (this.open[1] && (this.iceLife -= dt) <= 0) this.open[1] = false;
      if (this.open[2] && (this.cutLife -= dt) <= 0) this.open[2] = false; // cut in dry sand it slumps (G5)
      const dusk = h >= FLOOD.window[0] && h <= FLOOD.window[1];
      if (this.t === -1 && dusk) this.t = 0;
      if (this.t >= 0) {
        this.t += dt;
        const gateOf = [-1, 0, 1, 2];
        for (let c = 0; c < 4; c++) if (gateOf[c] < 0 || this.open[gateOf[c]]) this.level[c] = Math.min(1, this.level[c] + FLOOD.rate * dt);
        if (this.level[0] >= 1 && this.level[1] >= 1 && this.level[2] >= 1 && this.level[3] >= 1) { this.done = true; return 1; }
        if (this.t > FLOOD.run) { this.t = dusk ? -2 : -1; this.level.fill(0); return -1; }
      } else if (this.t < -1 && !dusk) this.t = -1;
      return 0;
    },
  };
}
