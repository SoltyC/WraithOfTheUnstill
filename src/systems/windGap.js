// The Wind Gap on the Western Edge (world/windGap.js; docs/direction.md M1, the meadow's second piece, "The Wind Gap").
// Until the Bellwether is released the sea wind comes up the gap in fits, on a cycle:
//   calm   (5.5–7 s)  nothing;
//   inhale (2.6 s)    the air is drawn toward the sea: grass laid seaward down the gully, dust and leaves streaming out;
//   blast  (1.6 s)    a wall of wind up the gully: grass flattened landward, dust thrown; anyone in it and not sheltered by a
//                     stone (a solid between them and the sea, the fight's own test) is thrown landward and hurt a little.
// The Bellwether's gale is the same thing on the forecourt: inhale, then the wall; only stone shelters.
// Senna, Maud's apprentice, crouches behind the last stone by the lip. Spoken to, she follows the Wraith up the gap stone to
// stone, moving only in a calm and only when the Wraith is ahead of her; at the top she is safe (meadow:senna-safe).

import { GAP, gapStones } from '../world/windGap.js';
import { BRUSH } from '../shaders/terrainState.wgsl.js';
import { manorWorld, MANOR } from '../world/manor.js';

export const GUST = { calm: [5.5, 7], inhale: 2.6, blast: 1.6, shove: 11, lift: 4, damage: 8, near: 230, run: 3.8 };

/** Where a point lies on the gap: t along A → B (0..1 inside), and its distance across. */
export function gapCoords(x, z) {
  const dx = GAP.b[0] - GAP.a[0], dz = GAP.b[1] - GAP.a[1], L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
  const t = ((x - GAP.a[0]) * dx + (z - GAP.a[1]) * dz) / L2, across = ((x - GAP.a[0]) * -dz + (z - GAP.a[1]) * dx) / L;
  return { t, across };
}

/** @param {any} g  shared boot context */
export function addWindGapSystem(g) {
  const { chapter, loop, controller, clock, sfx, SFX, combat, arm, wraithView, ground, capture, hud } = g;
  const flags = chapter.graph.flags;
  const stones = gapStones();
  const W = GAP.wind, mid = [(GAP.a[0] + GAP.b[0]) / 2, (GAP.a[1] + GAP.b[1]) / 2];
  // Where Senna waits behind each stone (its lee: landward of it), and the top.
  const lee = stones.map(([x, z]) => [x + W[0] * 1.3, z + W[1] * 1.3]);
  const top = [GAP.a[0] + W[0] * 4, GAP.a[1] + W[1] * 4];
  let seed = 5; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let phase = 'calm', t = 0, calmFor = 6, fxT = 0;
  const ts = g.terrainState;
  function flatten(x, z, dx, dz, halfLen, halfW, depth, comp) {
    if (!ts) return;
    ts.bx = x; ts.bz = z; ts.bdx = dx; ts.bdz = dz; ts.bl = halfLen; ts.bw = halfW; ts.bd = depth; ts.bc = comp;
    ts.bk = BRUSH.FLATTEN; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.6; ts.stamp();
  }
  function dust(x, z, vx, vz, n, up) {
    for (let q = 0; q < n; q++) {
      const px = x + (rnd() - 0.5) * 8, pz = z + (rnd() - 0.5) * 8;
      ground.qx = px; ground.qz = pz; ground.sample();
      wraithView.ex = px; wraithView.ey = ground.h + 0.2 + rnd() * up; wraithView.ez = pz;
      wraithView.evx = vx * (0.7 + 0.6 * rnd()); wraithView.evy = 0.3 + rnd(); wraithView.evz = vz * (0.7 + 0.6 * rnd());
      wraithView.esize = 0.05 + 0.1 * rnd(); wraithView.emit();
    }
  }
  /** A point somewhere down the gully (t along it, a spread across). */
  const along = (k) => { const s = rnd(); return [GAP.a[0] + (GAP.b[0] - GAP.a[0]) * s + (rnd() - 0.5) * 2 * GAP.half * 0.6 * k, GAP.a[1] + (GAP.b[1] - GAP.a[1]) * s]; };
  const blk = g.losBlocker;
  /** A stone between (x, z) and the sea. */
  function sheltered(x, z) {
    if (!blk || !g.solids) return false;
    blk.solids = g.solids; blk.body = false;
    const y = controller.pos.y + 1.0;
    blk.ax = x; blk.ay = y; blk.az = z; blk.bx = x - W[0] * 9; blk.by = y; blk.bz = z - W[1] * 9;
    return blk.segBlocked();
  }
  function blastHit() {
    const p = controller.pos, c = gapCoords(p.x, p.z);
    if (c.t < -0.08 || c.t > 1.12 || Math.abs(c.across) > GAP.half || controller.god || sheltered(p.x, p.z)) return;
    controller.vel.x += W[0] * GUST.shove; controller.vel.z += W[1] * GUST.shove; controller.vel.y = Math.max(controller.vel.y, GUST.lift); controller.grounded = false;
    combat?.hurtRaw?.(GUST.damage);
    sfx.x = p.x; sfx.y = p.y + 1; sfx.z = p.z; sfx.gain = 1.2; sfx.play(SFX.THUD);
    if (arm) arm.shake += 0.04;
    if (!capture && !flags.has('meadow:gap-hint')) { flags.add('meadow:gap-hint'); hud.notice('The Wind Gap', 'Thrown by the wind', 'When the grass leans toward the sea, get behind a stone.', 6); }
  }

  // Senna: behind the last stone until found; then up the gap with the Wraith, stone to stone.
  let senna = null, at = lee.length - 1, moving = false;
  function sennaBrain(n, dt) {
    const safe = flags.has('meadow:senna-safe');
    if (safe) {
      // Home to Hearn: walks off landward and is gone once out of sight (Maud has her back).
      n.noLook = true; n.hunch = 0.05;
      const dx = W[0], dz = W[1];
      n.vx = dx * 1.6; n.vz = dz * 1.6; n.x += n.vx * dt; n.z += n.vz * dt; n.yaw = Math.atan2(dx, dz);
      const pd = Math.hypot(controller.pos.x - n.x, controller.pos.z - n.z);
      if (pd > 70) n.hide = true;
      return;
    }
    const found = flags.has('meadow:senna-found');
    let tx = at >= 0 ? lee[at][0] : top[0], tz = at >= 0 ? lee[at][1] : top[1];
    if (found && !moving && phase === 'calm' && t < calmFor - 0.5) {
      // Go on to the next stone landward when the Wraith is ahead (nearer the top) and the calm will last the run.
      const me = gapCoords(n.x, n.z), wr = gapCoords(controller.pos.x, controller.pos.z);
      const nx = at > 0 ? lee[at - 1] : top, run = Math.hypot(nx[0] - n.x, nx[1] - n.z) / GUST.run;
      const still = released() ? 99 : calmFor - t;
      if (wr.t < me.t - 0.02 && run < still - 0.3) { moving = true; at -= 1; }
    }
    if (moving) { tx = at >= 0 ? lee[at][0] : top[0]; tz = at >= 0 ? lee[at][1] : top[1]; }
    const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
    if (d > 0.3) {
      const sp = Math.min(GUST.run, d * 3);
      n.vx = dx / d * sp; n.vz = dz / d * sp; n.x += n.vx * dt; n.z += n.vz * dt; n.yaw = Math.atan2(dx, dz); n.hunch = 0.15; n.noLook = true;
    } else {
      n.vx = 0; n.vz = 0; moving = false;
      // Crouched in the lee, looking to the Wraith once it has come.
      n.hunch = found ? 0.35 : 0.6; n.noLook = !found;
      if (!found) n.yaw = Math.atan2(-W[0], -W[1]);
      if (at < 0 && !flags.has('meadow:senna-safe')) {
        flags.add('meadow:senna-safe'); chapter.raise('meadow:senna-safe');
        // The bell on the hill answers once.
        const [mx, mz] = manorWorld(0, -26); sfx.x = mx; sfx.y = MANOR.y + 30; sfx.z = mz; sfx.gain = 0.9; sfx.play(SFX.TOLL);
        if (!capture) hud.notice('The Wind Gap', 'Out of the gap', 'Senna is safe. Far off on the hill, the bell rings once.', 6);
      }
    }
  }
  const released = () => flags.has('meadow:bellwether-released');

  loop.add({ name: 'windGap', update: () => {
    const dt = clock.dt, p = controller.pos;
    if (!senna) { senna = g.npcs?.find((n) => n.id === 'meadow-senna') || null; if (senna) { senna.x = lee[at][0]; senna.z = lee[at][1]; senna.xf.ox = senna.x; senna.xf.oz = senna.z; senna.placed = false; senna.brain = sennaBrain; } }
    if (senna && flags.has('meadow:senna-safe') && senna.hide === false && Math.hypot(p.x - senna.x, p.z - senna.z) > 300) senna.hide = true;
    const near = Math.hypot(p.x - mid[0], p.z - mid[1]) < GUST.near;
    // Healed with the bell: once it is released the gap only breathes like any hill.
    if (!near || released()) { phase = 'calm'; t = 0; return; }
    t += dt;
    if (phase === 'calm' && t >= calmFor) { phase = 'inhale'; t = 0; sfx.x = mid[0]; sfx.y = p.y + 2; sfx.z = mid[1]; sfx.gain = 0.5; sfx.play(SFX.WHOOSH); }
    else if (phase === 'inhale' && t >= GUST.inhale) { phase = 'blast'; t = 0; sfx.x = mid[0]; sfx.y = p.y + 2; sfx.z = mid[1]; sfx.gain = 1.3; sfx.play(SFX.RUMBLE); blastHit(); }
    else if (phase === 'blast' && t >= GUST.blast) { phase = 'calm'; t = 0; calmFor = GUST.calm[0] + rnd() * (GUST.calm[1] - GUST.calm[0]); }
    // What it looks like: drawn seaward, then thrown landward.
    fxT += dt;
    if (fxT > 0.1 && phase !== 'calm') {
      fxT = 0;
      if (phase === 'inhale') { const [x, z] = along(1); flatten(x, z, -W[0], -W[1], 4, 4, 0.02, 0.5); dust(x, z, -W[0] * 7, -W[1] * 7, 3, 1.5); }
      else {
        for (let q = 0; q < 2; q++) { const [x, z] = along(1); flatten(x, z, W[0], W[1], 6, 5, 0.04, 0.85); dust(x, z, W[0] * 20, W[1] * 20, 6, 2); }
        if (g.wind) { const [x, z] = along(0.5); g.wind.burst(x, z, 2.2); }
      }
    }
  } });
  g.windGap = { get phase() { return phase; }, get t() { return t; }, sheltered, stones, lee, get sennaAt() { return at; } };
}
