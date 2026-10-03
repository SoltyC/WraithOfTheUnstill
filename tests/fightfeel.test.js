import { describe, it, expect } from 'vitest';
import { createShaped, S } from '../src/game/shaped/shaped.js';
import { createWarden, W } from '../src/game/warden/warden.js';

const flat = { qx: 0, qz: 0, h: 0, sample() { this.h = 0; } };
const ts = { stamp() { this.bk = 0; } };
const fx = { n: 0, emit() { this.n++; } };

function pack(names) {
  const sh = createShaped({ ts, fx, ground: flat });
  sh.px = 0; sh.pz = 0; sh.pvx = 0; sh.pvz = 0;
  const ids = names.map((n, k) => sh.spawn(n, Math.cos(k * 2.1) * 5, Math.sin(k * 2.1) * 5));
  const step = (sec, each) => { for (let t = 0; t < sec; t += 1 / 60) { if (each) each(); sh.dt = 1 / 60; sh.time += 1 / 60; sh.update(); } };
  step(3);
  return { sh, ids, step };
}

describe('the fight reads', () => {
  it('a hit flashes the creature and knocks it back along the blow', () => {
    const { sh, ids, step } = pack(['hound']);
    const s = sh.slots[ids[0]], x0 = s.body.x, z0 = s.body.z;
    const dx = x0 / Math.hypot(x0, z0), dz = z0 / Math.hypot(x0, z0);
    sh.damage(ids[0], 5, true, dx * 3, dz * 3);
    expect(s.hurt).toBe(1);
    step(0.15);
    expect((s.body.x - x0) * dx + (s.body.z - z0) * dz).toBeGreaterThan(0.3);
  });
  it('a pack takes turns: only one hound lunges at a time', () => {
    const { sh, step } = pack(['hound', 'hound', 'hound', 'hound']);
    let maxTele = 0;
    step(8, () => {
      let n = 0; for (const s of sh.slots) if (s.arch === 'hound' && (s.state === S.TELEGRAPH || s.state === S.LUNGE)) n++;
      maxTele = Math.max(maxTele, n);
    });
    expect(maxTele).toBe(1);
  });
  it('a shattering kill blows the frozen body apart', () => {
    const { sh, ids } = pack(['hound']);
    sh.freeze(ids[0], 3);
    sh.damage(ids[0], 1e3, true, 0, 0);
    expect(sh.shattered).toBe(1);
    const st = sh.slots[ids[0]].st;
    let fast = 0; for (let c = 0; c < st.rig.count; c++) if (Math.hypot(st.dvx[c], st.dvz[c]) > 3) fast++;
    expect(fast).toBeGreaterThan(st.rig.count * 0.5);
  });
  it("a brute's slam passes under a jump", () => {
    for (const grounded of [true, false]) {
      const { sh, step } = pack(['brute']);
      const b = sh.slots[0].body;
      let hits = 0;
      step(10, () => { sh.px = b.x + Math.sin(b.heading) * 2; sh.pz = b.z + Math.cos(b.heading) * 2; sh.pgrounded = grounded; hits += sh.hits; });
      if (grounded) expect(hits).toBeGreaterThan(0); else expect(hits).toBe(0);
    }
  });
});

describe('the Warden fights back', () => {
  function warden() {
    const w = createWarden({ ts, fx, ground: flat });
    w.place(0, 0, 0); w.dt = 1 / 60; w.px = 0; w.pz = -60;
    for (let k = 0; k < 30; k++) w.update();
    return w;
  }
  it('a spell on its body makes it flinch, chips it and wakes it', () => {
    const w = warden(), n0 = fx.n;
    w.hx = w.body.kx[0]; w.hy = w.body.ky[0]; w.hz = w.body.kz[0]; w.hdx = 1; w.hdz = 0;
    w.bodyHit();
    expect(w.hurt).toBe(1);
    expect(fx.n - n0).toBeGreaterThan(10);
    expect(w.state).toBe(W.AWAKE);
  });
  it("its stomp's ground ring hits a grounded Wraith, not a jumping one", () => {
    for (const grounded of [true, false]) {
      const w = warden();
      w.state = W.AWAKE; w.cool = 0;
      // Out beyond the left front foot: clear of the foot itself, inside the ring's reach.
      const l = 0, ox = w.body.fx[l] - w.body.sx[1], oz = w.body.fz[l] - w.body.sz[1], ol = Math.hypot(ox, oz);
      w.px = w.body.fx[l] + ox / ol * 7.5; w.pz = w.body.fz[l] + oz / ol * 7.5;
      let hits = 0, stomped = false;
      for (let k = 0; k < 60 * 5; k++) { w.pgrounded = grounded; w.dt = 1 / 60; w.update(); hits += w.hits; if (w.state === W.STOMP) stomped = true; }
      expect(stomped).toBe(true);
      if (grounded) expect(hits).toBeGreaterThan(0); else expect(hits).toBe(0);
    }
  });
});
