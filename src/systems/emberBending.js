// Ember in the world (game/bending/ember.js: the verbs; systems/bending.js: the input): its flames in the fire renderer's
// last eight slots (render/fire.js), their light in the world's light grid (people, walls, the snow), what it burns —
// the Shaped in a Flare's cone, under the Stream, in the Fuse's core (a frozen one thaws in a burst of steam, and is
// struck harder) — the steam off snow and ice, and its sounds.

import { createEmberBending, flareTuning, streamTuning, fuseTuning, inFlare, streamDist } from '../game/bending/ember.js';

const SLOT0 = 64, SLOTS = 8;

/** @param {any} g  shared boot context */
export function addEmberBendingSystem(g) {
  const { loop, clock, controller, shaped, combat, sfx, SFX, terrainState, ground } = g;
  if (!terrainState || !ground) return;
  const eb = g.emberBend = createEmberBending({ ts: terrainState, ground });
  if (combat) combat.emberBend = eb;
  const F = g.fire?.fires, FX = g.fire?.fireX, FL = g.fire?.fireL;
  const ground1 = (x, z) => { ground.qx = x; ground.qz = z; ground.sample(); return ground.h; };
  let light = null, light2 = null;
  const lights = () => {
    if (!light && g.worldLights) {
      light = g.worldLights.add({ x: 0, y: 0, z: 0, radius: 14, color: [1, 0.45, 0.14], intensity: 40, kind: 'fire', level: 0 });
      light2 = g.worldLights.add({ x: 0, y: 0, z: 0, radius: 18, color: [1, 0.5, 0.18], intensity: 60, kind: 'fire', level: 0 });
    }
  };
  const seen = new Uint32Array(64);   // (a Flare / Fuse strikes each Shaped once: its id per slot)
  const seenFuse = new Uint32Array(64);
  const play = (k, gain, x, y, z) => { if (k === undefined || !sfx) return; sfx.x = x; sfx.y = y; sfx.z = z; sfx.gain = gain; sfx.play(k); };
  const steam = (x, y, z, n) => {
    const D = g.ruinDust; if (!D) return;
    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, sp = 1 + 2 * Math.random(); D.spawn(x + Math.cos(a), y + 0.5, z + Math.sin(a), Math.cos(a) * sp, 3 + 3 * Math.random(), Math.sin(a) * sp, 1.6 + 1.6 * Math.random(), 0.78, 0.79, 0.8, 2 + 2 * Math.random()); }
  };
  /** Burn Shaped i: thaw a frozen one (steam, a harder blow). */
  function burn(i, dmg, dx, dz) {
    if (!shaped || !shaped.isLive(i)) return;
    let k = 1;
    if (shaped.isFrozen(i)) { shaped.thaw(i); k = 1.35; const b = shaped.slots[i].body; steam(b.sx[1], b.sy[1], b.sz[1], 10); }
    shaped.chip?.(i, dx, dz, 6);
    shaped.damage(i, dmg * k * (eb.power || 1), true, dx * 2, dz * 2);
  }
  let streamSnd = 0, chargeSnd = false;
  // (Flame amount kept low: the renderer's fire is made for night; at its full amount, in daylight, it burns white.)
  function fire(slot, x, y, z, size, flame, smoke, dx = 0, dz = 0, half = 0) {
    if (!F) return;
    const o = (SLOT0 + slot) * 4;
    F[o] = x; F[o + 1] = y; F[o + 2] = z; F[o + 3] = size;
    FX[o] = smoke; FX[o + 1] = flame; FX[o + 2] = 0.55; FX[o + 3] = 0.6;   // (half the particles: fewer tongues stacked)
    FL[o] = dx; FL[o + 1] = dz; FL[o + 2] = half; FL[o + 3] = -1;   // (−1: a verb's flame — the fire shader's daylight palette)
  }

  loop.add({ name: 'emberBending', update: () => {
    const dt = clock.dt, p = controller.pos;
    lights();
    for (let s = 0; s < SLOTS; s++) if (F) F[(SLOT0 + s) * 4 + 3] = 0;
    let lx = 0, ly = 0, lz = 0, lv = 0, l2x = 0, l2y = 0, l2z = 0, l2v = 0;
    // ── Flare: three tongues out along the cone, flaring and gone in half a second.
    if (eb.flareEvent) { play(SFX.WHOOSH, 1.0, p.x, p.y + 1, p.z); play(SFX.BOOM, 0.35, p.x + eb.flareDX * 4, p.y, p.z + eb.flareDZ * 4); }
    if (eb.flareT < flareTuning.life) {
      const u = eb.flareT / flareTuning.life, e = Math.sin(Math.PI * Math.min(1, u * 1.3));
      for (let k = 0; k < 3; k++) {
        const a = (k - 1) * flareTuning.halfAngle * 0.6, ca = Math.cos(a), sa = Math.sin(a), d = flareTuning.range * (0.35 + 0.55 * u) * (k === 1 ? 1 : 0.8);
        const dx = eb.flareDX * ca - eb.flareDZ * sa, dz = eb.flareDX * sa + eb.flareDZ * ca, x = eb.flareX + dx * d, z = eb.flareZ + dz * d;
        fire(k, x, ground1(x, z) + 0.2, z, (1.3 + 0.7 * (k === 1)) * e, 1, 0.6);
      }
      lx = eb.flareX + eb.flareDX * 4; lz = eb.flareZ + eb.flareDZ * 4; ly = p.y + 1.5; lv = e;
      // Burns what is in the cone (once each).
      if (shaped) for (let i = 0; i < shaped.slots.length; i++) {
        if (!shaped.isLive(i) || seen[i] === eb.flareId) continue;
        const b = shaped.slots[i].body;
        if (inFlare(eb.flareX, eb.flareZ, eb.flareDX, eb.flareDZ, b.sx[1], b.sz[1], flareTuning.range * (eb.power || 1) + 1)) { seen[i] = eb.flareId; burn(i, flareTuning.damage, eb.flareDX, eb.flareDZ); }
      }
    }
    // ── Stream: a jet of flame along the aim, four tongues on it; it burns what it plays on.
    const ss = eb.streamStrength;
    if (ss > 0.01) {
      const len = eb.streamLen, flick = 0.9 + 0.2 * Math.sin(clock.simTime * 17);
      // At the hand, a tongue leaning out along the aim; out where it comes down, a line of fire on the ground along it
      // (the renderer's flame line: tongues along it), and a short one in the air between.
      const hx = p.x + eb.streamDX * 1.2, hz = p.z + eb.streamDZ * 1.2;
      fire(3, hx, p.y + 0.9, hz, 0.55 * ss * flick, 1, 0.2, eb.streamDX, eb.streamDZ, 0.8 * ss);
      const mx = p.x + eb.streamDX * len * 0.4, mz = p.z + eb.streamDZ * len * 0.4;
      fire(4, mx, (p.y + 1 + ground1(mx, mz)) * 0.5, mz, 0.6 * ss * flick, 1, 0.2, eb.streamDX, eb.streamDZ, len * 0.18);
      const gx = p.x + eb.streamDX * len * 0.75, gz = p.z + eb.streamDZ * len * 0.75;
      fire(5, gx, ground1(gx, gz) + 0.15, gz, 0.9 * ss * flick, 1, 0.8, eb.streamDX, eb.streamDZ, len * 0.26);
      l2x = p.x + eb.streamDX * len * 0.7; l2z = p.z + eb.streamDZ * len * 0.7; l2y = p.y + 1; l2v = ss;
      if (shaped) for (let i = 0; i < shaped.slots.length; i++) {
        if (!shaped.isLive(i)) continue;
        const b = shaped.slots[i].body;
        if (streamDist(p.x, p.z, eb.streamDX, eb.streamDZ, len, b.sx[1], b.sz[1]) < 1.8) burn(i, streamTuning.dps * dt * ss, eb.streamDX, eb.streamDZ);
      }
      streamSnd -= dt;
      if (streamSnd <= 0 && ss > 0.5) { streamSnd = 0.32; play(SFX.WHOOSH, 0.45 * ss, p.x + eb.streamDX * 4, p.y + 1, p.z + eb.streamDZ * 4); }
      if (Math.random() < dt * 6 * ss) steam(p.x + eb.streamDX * len, ground1(p.x + eb.streamDX * len, p.z + eb.streamDZ * len), p.z + eb.streamDZ * len, 1);
    }
    // ── Fuse: a white-hot core gathering at the aim, then the burst.
    const fp = eb.fusePhase;
    if (fp === 1) {
      const u = Math.min(1, eb.fuseT / fuseTuning.charge);
      fire(7, eb.fuseX, eb.fuseY + 0.4, eb.fuseZ, 0.4 + 0.6 * u, 1, 0.2);
      lx = eb.fuseX; ly = eb.fuseY + 1; lz = eb.fuseZ; lv = Math.max(lv, 0.4 + 0.6 * u);
      if (!chargeSnd) { chargeSnd = true; play(SFX.WHOOSH, 0.7, eb.fuseX, eb.fuseY, eb.fuseZ); }
    } else if (fp === 2) {
      chargeSnd = false;
      const u = eb.fuseT / fuseTuning.life, e = u < 0.2 ? u / 0.2 : Math.max(0, 1 - (u - 0.2) / 0.8);
      fire(7, eb.fuseX, eb.fuseY + 0.2, eb.fuseZ, 2.6 * e, u < 0.5 ? 1 : 0.3, 1.2);
      lx = eb.fuseX; ly = eb.fuseY + 1.5; lz = eb.fuseZ; lv = Math.max(lv, e * 1.6);
    } else chargeSnd = false;
    if (eb.fuseEvent) {
      play(SFX.BOOM, 1.0, eb.fuseX, eb.fuseY, eb.fuseZ); play(SFX.SHATTER, 0.5, eb.fuseX, eb.fuseY, eb.fuseZ);
      steam(eb.fuseX, eb.fuseY, eb.fuseZ, 18);
      if (g.arm) g.arm.shake += 0.03;
      if (shaped) for (let i = 0; i < shaped.slots.length; i++) {
        if (!shaped.isLive(i) || seenFuse[i] === eb.fuseId) continue;
        const b = shaped.slots[i].body, dx = b.sx[1] - eb.fuseX, dz = b.sz[1] - eb.fuseZ, d = Math.hypot(dx, dz);
        if (d < fuseTuning.radius + 1.2) { seenFuse[i] = eb.fuseId; burn(i, fuseTuning.damage, dx / (d || 1), dz / (d || 1)); }
      }
    }
    if (light) { light.x = lx; light.y = ly; light.z = lz; light.level = lv; }
    if (light2) { light2.x = l2x; light2.y = l2y; light2.z = l2z; light2.level = l2v; }
  } });
}
