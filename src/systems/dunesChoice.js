// The dunes' choice, after (docs/phase-9/dunes-choice.md): where the Long Walker lay down, or that it walks on, decides who
// stays in the erg.
//   dunes:home-well  — the well full; the glass-readers leave the Sun Gate west for Hearn (`dunes:gate-left`): their camp
//                      struck, its people gone. Iven, met again, will not speak.
//   dunes:home-gate  — the cistern full; the Wellhouse camp leaves the erg (`dunes:well-left`): Sarai, Hesper, Nadra, Pell
//                      gone (Nadra and Pell to the fen).
//   dunes:home-none  — both camps stay this season, preparing to leave (`dunes:both-warned`); their words say so.
// The camp that leaves goes once the Wraith is far from it (no one vanishes in front of it), or at once on a load.

import { walkerLiesDown } from '../game/dunesScenes.js';
import { CAMP_WELL, GATE_CISTERN } from '../game/walker/route.js';

const GATE_PEOPLE = ['iven', 'orsa', 'kesh', 'adda'];
const WELL_PEOPLE = ['sarai', 'hesper', 'nadra', 'pell'];

/** @param {any} g  shared boot context */
export function addDunesChoiceSystem(g) {
  const { loop, chapter, controller } = g;
  if (!chapter?.table?.wellhouse) return;
  const flags = chapter.graph.flags, has = (f) => flags.has(f);
  const at = (id) => chapter.table[id]?.pos;
  let gone = null;
  const leave = (ids, siteId) => {
    for (const n of g.npcs || []) if (ids.includes(n.id)) n.brain = (q) => { q.hide = true; q.vx = q.vz = 0; };
    const s = siteId ? g.archSites?.find((x) => x.id === siteId) : null;
    if (s && !s.hidden) { s.hidden = true; g.engine?.snapshotRenderingReset?.(); }
  };
  // ── The scene (game/dunesScenes.js): once it has lain down (its own release camera done), or been let go. ──────────
  const npc = (id) => (g.npcs || []).find((n) => n.id === id);
  /** Round a point, facing it. */
  const ring = (ids, c, r) => ids.forEach((id, k) => { const n = npc(id); if (!n) return; const a = (k / ids.length) * Math.PI * 2 + 0.4;
    n.x = c[0] + Math.cos(a) * r; n.z = c[1] + Math.sin(a) * r; n.hide = false;
    n.brain = (q) => { q.vx = q.vz = 0; q.yaw = Math.atan2(c[0] - q.x, c[1] - q.z); q.noLook = true; q.hunch = 0.35; q.hide = false; }; });
  /** Walking out along (dx, dz), one behind another; `back` stops and turns round partway. */
  const walkOut = (ids, from, dx, dz, back) => ids.forEach((id, k) => { const n = npc(id); if (!n) return;
    n.x = from[0] - dx * k * 2.2 + dz * (k % 2 ? 0.8 : -0.8); n.z = from[1] - dz * k * 2.2 - dx * (k % 2 ? 0.8 : -0.8); n.hide = false;
    let t = 0;
    n.brain = (q, dt) => {
      t += dt; q.hide = false;
      if (id === back && t > 9) { q.vx = q.vz = 0; q.yaw = Math.atan2(-dx, -dz); q.noLook = true; q.hunch = 0.3; return; }
      q.vx = dx * 1.25; q.vz = dz * 1.25; q.x += q.vx * dt; q.z += q.vz * dt; q.yaw = Math.atan2(dx, dz); q.noLook = true; q.hunch = 0.3;
    }; });
  function playScene() {
    const outcome = has('dunes:home-gate') ? 'gate' : has('dunes:home-well') ? 'well' : 'none';
    flags.add('dunes:scene:home');
    const W = g.walker, walker = (out) => { out[0] = W.x; out[1] = g.scenes.groundAt(W.x, W.z) + 12; out[2] = W.z; return out; };
    const camp = at('gate-camp') || [1496, 992], well = at('wellhouse') || CAMP_WELL;
    let o;
    if (outcome === 'well') {
      ring(WELL_PEOPLE, CAMP_WELL, 2.8);
      walkOut(GATE_PEOPLE, [camp[0], camp[1] - 6], 0, -1, 'iven');
      o = { stay: WELL_PEOPLE, go: GATE_PEOPLE, back: 'iven', at: { stay: CAMP_WELL, go: camp } };
    } else if (outcome === 'gate') {
      ring(GATE_PEOPLE, GATE_CISTERN, 3.6);
      walkOut(WELL_PEOPLE, [well[0] + 8, well[1] - 30], -1, 0, 'pell');
      o = { stay: GATE_PEOPLE, go: WELL_PEOPLE, back: 'pell', at: { stay: GATE_CISTERN, go: well } };
    } else {
      o = { stay: ['sarai'], go: ['iven'], back: 'iven', at: { stay: well, go: camp } };
    }
    g.scenes.play(walkerLiesDown(outcome, o), { stale: 4, subjects: { walker } });
  }

  loop.add({ name: 'dunesChoice', update: () => {
    if (!g.npcs) return;
    if (!has('dunes:scene:home') && g.scenes && !g.scenes.busy && !g.capture && !g.releaseCam?.hold) {
      const rested = (has('dunes:home-well') || has('dunes:home-gate')) && g.walker?.state === 9;
      if (rested || has('dunes:home-none')) playScene();
    }
    if (has('dunes:home-none') && !has('dunes:both-warned')) flags.add('dunes:both-warned');
    const p = controller.pos;
    const far = (id, r) => { const q = at(id); return !q || Math.hypot(p.x - q[0], p.z - q[1]) > r; };
    if (has('dunes:home-well') && gone !== 'gate' && (g.scenes?.busy !== true) && (has('dunes:gate-left') || far('gate-camp', 260))) {
      flags.add('dunes:gate-left'); leave(GATE_PEOPLE, 'ruin-gate-camp'); gone = 'gate';
    }
    if (has('dunes:home-gate') && gone !== 'well' && (g.scenes?.busy !== true) && (has('dunes:well-left') || far('wellhouse', 260))) {
      flags.add('dunes:well-left'); leave(WELL_PEOPLE, null); gone = 'well';
    }
  } });
}
