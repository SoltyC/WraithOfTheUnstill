// The Warden fight (user design 2026-10-09), as a director over the Warden, its pillars and its
// spikes. In order:
//   WARD    — when it wakes, six pillars rise out of the snow round the arena, an ice crystal on
//             each. While any crystal stands, the Warden is healed through it and its seams stay
//             sealed. The Wraith climbs the pillars and breaks the crystals at the top.
//   OPEN    — the ward breaks (it rears and bellows): its seams open — freeze them, break them —
//             and Sweep and Ribbon chip it down.
//   FRENZY  — at 30 % it calls the Shaped up out of the snow round the arena: brutes, and at most
//             two seers over the whole fight (one at a time — they are strong).
// Throughout, every fifteen seconds it stops, gathers and sheds a barrage of spikes that only
// stone can stop. Dying resets all of it: the Warden lies dormant where it was first found, the
// pillars sink, the crystals return. Pure logic over injected parts (tested in Node).

import { W, WARDEN_FIGHT } from './warden.js';

export const FIGHT = { IDLE: 0, WARD: 1, OPEN: 2, FRENZY: 3, DONE: 4 };
export const fightTuning = {
  riseTime: 4.5,            // s for the pillars to rise
  crystalHits: 3,           // strikes to break a crystal (1 if it starts cracked)
  healPerCrystal: 1.5,      // health per second per standing crystal
  barrageEvery: 25,         // s, start to start (was 15: the user found the fight too hard, 2026-10-09)
  firstBarrage: 20,         // s after the pillars stand
  aimedEvery: 0.27,         // s between aimed spikes while it sheds
  wildPerSecond: 24,
  wildRadius: 46,           // m round it the wild spikes land within
  frenzyAt: 30,             // health at which it calls up the Shaped
  summonDelay: 1.2,         // s into the roar the Shaped begin to rise
  seerMax: 2, seerGap: 18,  // seers over the whole fight; s before the second rises
  summonR: 30,              // m from the centre they rise at
  reach: 2.6,               // m from a crystal the Wraith can strike it (on the pillar's top)
};
/** Events this frame (bit flags) for the owner's notices and sound. */
export const EV = { RISE: 1, CRYSTAL_HIT: 2, CRYSTAL_BROKEN: 4, WARD_BROKEN: 8, CHARGE: 16, BARRAGE: 32, SUMMON: 64, RESET: 128, RELEASED: 256 };

/**
 * @param {{ warden: any, spikes: any, pillars: { up: Float64Array }, count: number,
 *   spawn: (name: string, x: number, z: number) => number, alive: (slot: number) => boolean, kill: (slot: number) => void,
 *   ground: { qx: number, qz: number, h: number, sample: () => void } }} ctx
 */
export function createFight(ctx) {
  const { warden, spikes, pillars, spawn, alive, kill, ground } = ctx;
  const T = fightTuning;
  const N = ctx.count;   // the arena's pillars (the first `count` of the pillar arrays)
  const crystal = new Float64Array(8);     // strikes left per crystal (0 broken)
  const slots = new Int16Array(8).fill(-1); // Shaped it called up
  let seed = 31;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const self = {
    phase: FIGHT.IDLE, t: 0.5 - 0.5, ev: 0,
    /** Seconds to the next barrage (counts while it fights). */
    barrageIn: T.firstBarrage,
    crystal,
    /** Consequences from the quests (set by the owner before the fight): a crystal starts
     *  cracked (Tobin listened at the spring); the den's brood is gone (fewer Shaped). */
    crackedCrystal: -1, denCleared: false,
    /** Seers called so far, and when the next may come. */
    seers: 0, brutes: 0, seerT: 0.5 - 0.5, summonT: -1.5 + 0.5, summoned: false,
    /** The Wraith (fields in). */
    px: 0.5, py: 0.5, pz: 0.5, dt: 0.5,
    _aimT: 0.5 - 0.5, _wild: 0.5 - 0.5,
    /** Crystals still standing. */
    get standing() { let n = 0; for (let k = 0; k < N; k++) if (crystal[k] > 0) n++; return n; },
    /** The fight is on (pillars up or rising, not yet released). */
    get active() { return this.phase !== FIGHT.IDLE && this.phase !== FIGHT.DONE; },

    /** Strike crystal k (the Wraith on its pillar's top): true if it was struck. */
    strike(k) {
      if (this.phase !== FIGHT.WARD || crystal[k] <= 0 || pillars.up[k] < 1) return false;
      crystal[k]--;
      this.ev |= EV.CRYSTAL_HIT;
      if (crystal[k] <= 0) {
        this.ev |= EV.CRYSTAL_BROKEN;
        if (this.standing === 0) {
          this.phase = FIGHT.OPEN; this.t = 0;
          warden.ward = false; warden.roar();
          this.ev |= EV.WARD_BROKEN;
        }
      }
      return true;
    },
    /** Which crystal the Wraith at (x, y, z) can strike (standing on its pillar), or −1. */
    reachable(x, y, z, cx, cy, cz) {
      // cx/cy/cz: the crystals' positions (arrays), by pillar.
      if (this.phase !== FIGHT.WARD) return -1;
      for (let k = 0; k < N; k++) {
        if (crystal[k] <= 0 || pillars.up[k] < 1) continue;
        const dx = x - cx[k], dz = z - cz[k];
        if (dx * dx + dz * dz < T.reach * T.reach && y > cy[k] - 1.2 && y < cy[k] + 2.5) return k;
      }
      return -1;
    },

    /** Back to the start: the Warden dormant where it was first found, pillars down, crystals whole. */
    reset() {
      for (let k = 0; k < slots.length; k++) { if (slots[k] >= 0 && alive(slots[k])) kill(slots[k]); slots[k] = -1; }
      warden.place(warden.homeX, warden.homeZ, this.homeHeading);
      for (let k = 0; k < N; k++) { pillars.up[k] = 0; crystal[k] = 0; }
      spikes.clear();
      this.phase = FIGHT.IDLE; this.t = 0; this.barrageIn = T.firstBarrage;
      this.seers = 0; this.brutes = 0; this.seerT = 0; this.summonT = -1; this.summoned = false;
      this.ev |= EV.RESET;
    },
    /** The Warden's resting heading (set by the owner when it first places it). */
    homeHeading: 0.5 - 0.5,

    update() {
      const dt = this.dt;
      this.ev = 0;
      const ws = warden.active ? warden.state : -1;
      if (ws === W.RESTED || ws === W.RELEASE) {
        if (this.phase !== FIGHT.DONE && this.phase !== FIGHT.IDLE) { this.phase = FIGHT.DONE; this.ev |= EV.RELEASED; }
        // The pillars go back into the land as it lies down.
        for (let k = 0; k < N; k++) pillars.up[k] = Math.max(0, pillars.up[k] - dt / 12);
        return;
      }
      if (this.phase === FIGHT.DONE) return;
      this.t += dt;
      if (this.phase === FIGHT.IDLE) {
        if (ws !== W.DORMANT && ws >= 0) {
          // It wakes: the pillars rise, each crystal whole (one cracked, if the child listened).
          this.phase = FIGHT.WARD; this.t = 0;
          for (let k = 0; k < N; k++) crystal[k] = k === this.crackedCrystal ? 1 : T.crystalHits;
          warden.ward = true;
          this.ev |= EV.RISE;
        }
        return;
      }
      // Pillars rising (staggered a little).
      for (let k = 0; k < N; k++) pillars.up[k] = Math.min(1, Math.max(pillars.up[k], (this.t - 0.25 * k) / T.riseTime));
      // Healed through the standing crystals.
      if (this.phase === FIGHT.WARD) warden.hp = Math.min(WARDEN_FIGHT.hp, warden.hp + T.healPerCrystal * this.standing * dt);
      // The barrage.
      const risen = pillars.up[N - 1] >= 1;
      if (risen) {
        // Fifteen seconds start to start (the clock runs through the barrage itself).
        this.barrageIn -= dt;
        if (this.barrageIn <= 0 && ws !== W.CHARGE && ws !== W.BARRAGE && warden.charge()) { this.barrageIn = T.barrageEvery; this.ev |= EV.CHARGE; }
      }
      if (ws === W.BARRAGE) {
        if (warden.t <= dt) { this.ev |= EV.BARRAGE; this._aimT = 0; this._wild = 0; }
        fire(this, dt);
      }
      // Frenzy: it calls the Shaped.
      if (this.phase === FIGHT.OPEN && warden.hp <= T.frenzyAt && ws !== W.CHARGE && ws !== W.BARRAGE) {
        this.phase = FIGHT.FRENZY; this.summonT = 0; warden.roar();
      }
      if (this.phase === FIGHT.FRENZY) summon(this, dt);
    },
  };

  /** While it sheds: an aimed spike at the Wraith every so often, wild ones all round. */
  function fire(F, dt) {
    const b = warden.body;
    F._aimT -= dt;
    if (F._aimT <= 0) {
      F._aimT += T.aimedEvery;
      const i = 1 + Math.floor(rnd() * 3);
      spikes.fx0 = b.sx[i]; spikes.fy0 = b.sy[i] + 7.5; spikes.fz0 = b.sz[i];
      spikes.px = F.px; spikes.py = F.py; spikes.pz = F.pz;
      spikes.fireAimed();
    }
    F._wild += T.wildPerSecond * dt;
    while (F._wild >= 1) {
      F._wild -= 1;
      const i = 1 + Math.floor(rnd() * 4), a = rnd() * Math.PI * 2, r = 8 + Math.sqrt(rnd()) * (T.wildRadius - 8);
      spikes.fx0 = b.sx[i] + (rnd() - 0.5) * 3; spikes.fy0 = b.sy[i] + 7 + rnd() * 1.5; spikes.fz0 = b.sz[i] + (rnd() - 0.5) * 3;
      spikes.tx = b.x + Math.cos(a) * r; spikes.tz = b.z + Math.sin(a) * r;
      ground.qx = spikes.tx; ground.qz = spikes.tz; ground.sample(); spikes.ty = ground.h;
      spikes.fireWild();
    }
  }

  /** The Shaped rise round the arena's edge, on the Wraith's side: brutes (one at a time if the
   *  den is cleared), hounds unless the den's brood is gone, one seer — a second after the first falls. */
  function summon(F, dt) {
    if (F.summonT >= 0) {
      F.summonT += dt;
      if (!F.summoned && F.summonT >= T.summonDelay) {
        F.summoned = true; F.ev |= EV.SUMMON;
        add(F, 'brute', -0.5); if (!F.denCleared) { add(F, 'brute', 0.5); add(F, 'hound', -0.9); add(F, 'hound', 0.9); }
        add(F, 'seer', 0); F.seers = 1;
      }
    }
    if (!F.summoned) return;
    // A second brute once the first falls (when the den was cleared and only one came).
    if (F.denCleared && F.brutes === 1 && countAlive('brute') === 0) { add(F, 'brute', 0.3); F.brutes = 2; }
    // The second seer, a while after the first falls.
    if (F.seers < T.seerMax && countAlive('seer') === 0) {
      F.seerT += dt;
      if (F.seerT >= T.seerGap) { add(F, 'seer', 0.4); F.seers++; F.seerT = 0; }
    }
  }
  const kinds = new Array(8).fill('');
  function countAlive(name) { let n = 0; for (let k = 0; k < slots.length; k++) if (slots[k] >= 0 && kinds[k] === name && alive(slots[k])) n++; return n; }
  function add(F, name, side) {
    const a = Math.atan2(F.pz - warden.homeZ, F.px - warden.homeX) + side;
    const x = warden.homeX + Math.cos(a) * T.summonR, z = warden.homeZ + Math.sin(a) * T.summonR;
    const s = spawn(name, x, z);
    if (s < 0) return;
    for (let k = 0; k < slots.length; k++) if (slots[k] < 0 || !alive(slots[k])) { slots[k] = s; kinds[k] = name; break; }
    if (name === 'brute') F.brutes++;
  }

  return self;
}
