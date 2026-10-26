// Flow's owner (game/flow.js): each frame it reads how the Wraith moves, feeds the value, and
// shows it on the body — the hems and the hand-light (render/wraith.js), the wake, the speed
// streaks, a soft cue per tier and the score's lift. No HUD (BRIEF §12).

import { surfTuning } from '../character/surf.js';
import { FLOW_IN } from '../game/flow.js';

const COLOURS = { frost: [0.28, 0.5, 0.8], gale: [0.45, 0.78, 0.55] };

/** @param {any} g  shared boot context */
export function addFlowSystem(g) {
  const { loop, flow, controller, combat, clock, wraithView, streaks, surfWake, music, sfx, SFX } = g;
  const sf = controller.surf, gl = controller.glide, v = controller.vel, n = flow.inp;
  let lastEl = '';
  loop.add({ name: 'flow', update: () => {
    n[FLOW_IN.DT] = clock.dt;
    flow.paused = combat.dying > 0 || controller.scripted || controller.hold || controller.god || g.game.pendingSurf !== null
      || !!(g.chapter && g.chapter.talking) || !!(g.activeClimb && g.activeClimb.mode);
    if (combat.dying > 0 && flow.value > 0) flow.reset(false);
    flow.surfOn = sf.active && !sf.exiting; flow.glideOn = gl.active;
    flow.grounded = controller.grounded; flow.swimming = controller.swimming;
    n[FLOW_IN.SPEED] = Math.sqrt(v.x * v.x + v.z * v.z); n[FLOW_IN.SURF_SPEED] = sf.speed; n[FLOW_IN.GLIDE_SPEED] = gl.speed;
    n[FLOW_IN.GRIP] = Math.abs(sf.latAccel) / surfTuning.latMax;
    n[FLOW_IN.VY] = g.weapons && g.weapons.plunge.falling ? 0 : v.y; n[FLOW_IN.LIFT] = controller.lift;       // (a plunge's 30 m/s is not a hard fall)
    flow.update();
    // A soft cue per tier change, at the Wraith.
    if (flow.tierEvent !== 0) {
      const p = controller.pos;
      sfx.x = p.x; sfx.y = p.y + 1; sfx.z = p.z; sfx.gain = 0.8; sfx.tone = Math.max(0, Math.min(2, flow.tier - (flow.tierEvent > 0 ? 1 : 0)));
      sfx.play(flow.tierEvent > 0 ? SFX.FLOW_UP : SFX.FLOW_DOWN);
    }
    // On the body and in the world.
    const L = flow.show;
    const el = g.elements ? g.elements.active : 'frost';
    if (el !== lastEl) { lastEl = el; const c = COLOURS[el] || COLOURS.frost; wraithView.flowColor = c; }
    wraithView.flowLevel = L; wraithView.wraith.flow = L;
    streaks.flow = L; surfWake.flow = L;
    music.lift = L / 3;
  } });
}
