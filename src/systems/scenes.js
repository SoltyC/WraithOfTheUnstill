// Directed scenes at runtime (game/scenes.js; played through the director, systems/director.js, which keeps the letterbox, the
// depth of field on each beat's subject, the cut resets, the blends from and back into play, and the subtitles).
//   play(variant, opt)  compiles the variant's beats into live shots (each works its camera out from its subjects every frame)
//                       and plays them. While its first beat holds on the Wraith where it is (`local`), the world is loaded
//                       where the rest will film — the streaming focus moved there (systems/world.js `streamFocus`), its
//                       buildings seated, the pieces of any building that will come down made (systems/destruction.js) — so a
//                       cut to a place a kilometre off shows it whole, not loading.
//   busy                one scene at a time; a scene asked for while another plays waits its turn, or is dropped if stale.
// Subjects: { wraith }, { npc: id }, { npcs: [ids] } (the middle of those still standing), { site: id, up }, { point: [x, z] or
// [x, y, z] }, { crater }, { front: flow }, { camp }, plus whatever the owner adds (opt.subjects: name → () → [x, y, z]).

import { evalBeat, sceneSpots } from '../game/scenes.js';
import { PIT } from '../world/crater.js';
import { CAMP } from '../world/sow.js';

/** @param {any} g  shared boot context */
export function addSceneSystem(g) {
  const { loop, controller, clock } = g;
  const queue = [];
  let playing = null;
  const groundAt = (x, z) => {
    const G = g.ground; G.qx = x; G.qz = z;
    if (G.covers()) { G.sample(); return G.h; }
    const O = g.streamer?.overview, n = g.streamer?.overviewN; if (!O) return 0;
    const u = (x + 4096) / 8 - 0.5, v = (4096 - z) / 8 - 0.5, i = Math.max(0, Math.min(n - 2, Math.floor(u))), j = Math.max(0, Math.min(n - 2, Math.floor(v))), fu = u - i, fv = v - j;
    const H = (a, b) => O[b * n + a] / 32 - 128;
    return (H(i, j) * (1 - fu) + H(i + 1, j) * fu) * (1 - fv) + (H(i, j + 1) * (1 - fu) + H(i + 1, j + 1) * fu) * fv;
  };
  const npc = (id) => (g.npcs || []).find((n) => n.id === id);
  /** A building between the camera and its subject (world/solids.js line of sight). */
  // Walls (solids) and, out in the country, the trees' crowns and the shrubs (render/trees.js sightClear) between the camera
  // and what it films: either swings the camera round (game/scenes.js).
  const blocked = (c, l) => {
    const S = g.solids;
    if (S?.segBlocked) { S.ax = c[0]; S.ay = c[1]; S.az = c[2]; S.bx = l[0]; S.by = l[1]; S.bz = l[2]; if (S.segBlocked()) return true; }
    return !!(g.trees?.sightClear && !g.trees.sightClear(c[0], c[2], l[0], l[2]));
  };
  function resolver(extra) {
    const tmp = [0, 0, 0];
    return (s) => {
      if (!s) return [controller.pos.x, controller.pos.y, controller.pos.z];
      if (s.wraith) return [controller.pos.x, controller.pos.y, controller.pos.z];
      if (s.npc) { const n = npc(s.npc); if (n && !n.hide) return [n.x, groundAt(n.x, n.z), n.z]; return [controller.pos.x, controller.pos.y, controller.pos.z]; }
      if (s.npcs) {
        let x = 0, z = 0, k = 0;
        for (const id of s.npcs) { const n = npc(id); if (n && !n.hide) { x += n.x; z += n.z; k++; } }
        // (Gone from sight — in at the door, or taken — the shot holds where they were last, not jumping to the fallback.)
        if (!k) return s._last ? s._last.slice() : s.fallback ? resolver(extra)(s.fallback) : [controller.pos.x, controller.pos.y, controller.pos.z];
        s._last = [x / k, groundAt(x / k, z / k), z / k];
        return s._last.slice();
      }
      if (s.site) {
        const q = g.archSites.find((q) => q.id === s.site), a = q ? q.at : [controller.pos.x, controller.pos.z];
        return [a[0], groundAt(a[0], a[1]) + (s.up || 0), a[1]];
      }
      if (s.point) { const p = s.point; return p.length === 3 ? p.slice() : [p[0], groundAt(p[0], p[1]) + (s.up || 0), p[1]]; }
      if (s.crater) return [PIT.x, (g.volcano?.level ?? 730) + (s.up || 0), PIT.z];
      if (s.camp) return [CAMP.at[0], groundAt(CAMP.at[0], CAMP.at[1]), CAMP.at[1]];
      if (s.custom && extra?.[s.custom]) return extra[s.custom](tmp).slice();
      return [controller.pos.x, controller.pos.y, controller.pos.z];
    };
  }

  function start(item) {
    const { variant, opt } = item, resolve = resolver(opt.subjects);
    playing = item;
    // The world where it will film: streamed, seated, made.
    const spots = sceneSpots(variant, resolve);
    if (spots.length) { let x = 0, z = 0; for (const p of spots) { x += p[0]; z += p[2]; } g.streamFocus = { x: x / spots.length, z: z / spots.length }; }
    for (const id of variant.prepare || []) g.destruction?.prepare(id);
    // Its people kept shown and simulated the whole scene, wherever the camera is (systems/npcs.js warm): placed for it out of
    // sight, they would otherwise appear only as the camera cut to them — a robe settling, a body turning, on camera.
    const warm = new Set();
    for (const b of variant.beats) for (const s of [b.subject, b.target]) for (const id of s?.npcs || (s?.npc ? [s.npc] : [])) warm.add(id);
    for (const id of variant.people || []) warm.add(id);
    const warmed = (g.npcs || []).filter((n) => warm.has(n.id));
    for (const n of warmed) n.warm = true;
    for (const b of variant.beats) { b._swing = undefined; if (b.subject) b.subject._last = undefined; if (b.target) b.target._last = undefined; }   // (each play chooses its swings afresh)
    const shots = variant.beats.map((b) => ({
      dur: b.dur, dof: b.dof ?? 0, maxBlur: b.maxBlur,   // (off unless a beat asks: a wide shot with a metre of focus blurs the whole frame)
      blur: b.blur ?? 0.35, subs: b.subs, wraith: b.wraith,
      eval: (u, time, out) => evalBeat(b, u, time, resolve, groundAt, out, blocked),
      onCut: b.onCut,
    }));
    g.director.play(shots, { id: variant.id, skippable: opt.skippable, blendIn: opt.blendIn ?? 0.8, blendOut: opt.blendOut ?? 1.2, onEnd: () => { playing = null; g.streamFocus = null; for (const n of warmed) n.warm = false; opt.onEnd?.(); } });
  }
  const S = g.scenes = {
    groundAt,
    get busy() { return !!playing || g.director?.active; },
    /** The variant playing (its id), or null. */
    get current() { return playing ? playing.variant : null; },
    /** Play a scene variant now, or when the one playing ends (dropped if not begun within `stale` s). */
    play(variant, opt = {}) { if (!variant) return; const item = { variant, opt, at: clock.simTime }; if (S.busy) queue.push(item); else start(item); },
    resolver,
  };
  loop.add({ name: 'scenes', update: () => {
    if (!S.busy && queue.length) {
      const item = queue.shift();
      if (clock.simTime - item.at < (item.opt.stale ?? 20)) start(item);
    }
  } });
}
