// The mountain's clock (docs/phase-11/ember-design.md §6): stages, not a countdown on screen. From Cole's warning
// (`ember:warned`) the mountain wakes, and each dawn after it goes on one stage:
//   1 Waking     steam on the flank, a tremor now and then            the time to make friends
//   2 Swelling   the plume darker and higher, tremors more often       the farmers start to talk (each wants one neighbour fewer)
//   3 Breathing  a tall dark plume, the crater glowing by day           the omens are undeniable (one fewer again)
//   4 Fire       the plume black, the crater lit day and night, the ground shaking often
//   5 Eruption   the day after Fire: the hold breaks (systems/eruption.js)
// Everyone in the Waste feels it: the tremors, the plume.
// The Wraith can buy time at a cost to itself (§6, the quiet choice; user 2026-11-22: permanent): at the summit it lends its
// own motion to the Warden's hold — one health thread given up for good (`ember:threads-given`), the cowl light a little
// dimmer for the rest of the game — and the mountain is held back one stage. Interact once to hear what it costs, again to give.
// State: vars `ember:day` (dawns since the warning), `ember:threads-given`; `ember:stage` = 1 + day − given, 1…5 (once 5, it stays).

import { CRATER } from './volcano.js';
import { LEDGE } from '../world/crater.js';

export const STAGES = [
  null,
  { name: 'Waking', plume: 550, strength: 0.5, dark: 0.1, glow: 0.2, tremor: 95, shake: 0.012 },
  { name: 'Swelling', plume: 850, strength: 0.75, dark: 0.35, glow: 0.3, tremor: 60, shake: 0.018 },
  { name: 'Breathing', plume: 1150, strength: 0.95, dark: 0.65, glow: 0.55, tremor: 40, shake: 0.026 },
  { name: 'Fire', plume: 1500, strength: 1, dark: 0.9, glow: 0.9, tremor: 22, shake: 0.04 },
  { name: 'Eruption', plume: 3600, strength: 1, dark: 1, glow: 1, tremor: 6, shake: 0.06 },   // (systems/eruption.js runs it)
];
const NOTES = [null,
  ['The mountain', 'Waking', 'Steam on the flank where there was none. Now and then, the ground shivers.'],
  ['The mountain', 'Swelling', 'The plume stands higher and darker. In the night, ash fell on the farms.'],
  ['The mountain', 'Breathing', 'The plume is a wall. The crater glows in daylight. No one in the Waste can call it nothing now.'],
  ['The mountain', 'Fire', 'Fire in the crater, day and night. The ground hardly stops shaking.'],
  null];   // (the eruption announces itself: systems/eruption.js)

/** The stage from days since the warning and threads given (pure: tested). */
export function emberStage(warned, day, given) { return warned ? Math.max(1, Math.min(5, 1 + day - given)) : 0; }

/** @param {any} g  shared boot context */
export function addEmberClockSystem(g) {
  const { chapter, loop, clock, params, controller, hud, capture, sfx, SFX, arm } = g;
  const flags = chapter.graph.flags, vars = chapter.graph.vars;
  const E = g.ember = { stage: 0, cowl: 1, def: null };
  let lastHour = params.v.timeOfDay, tremorT = 30, shownStage = -1, offerT = 0;

  // The summit: lend the Warden the Wraith's motion (on the ledge over the lake, world/crater.js).
  const gift = { kind: 'ember', id: 'ember-gift', verb: 'Lend it your motion', name: 'The summit', x: LEDGE.x, y: 0, z: LEDGE.z, r: 9, h: 1.2, hidden: true,
    onUse: () => {
      if (offerT <= 0) {
        offerT = 7;
        if (!capture) hud.notice('The summit', 'The Warden is straining under you', 'You could lend it some of your own motion: one thread of your health, given up for good. It would hold the mountain back a day. Do it again to give.', 7);
        return;
      }
      offerT = 0;
      vars['ember:threads-given'] = (vars['ember:threads-given'] || 0) + 1;
      g.economy?.syncHealth?.();
      sfx.x = controller.pos.x; sfx.y = controller.pos.y; sfx.z = controller.pos.z; sfx.gain = 1; sfx.play(SFX.TOLL);
      if (arm) arm.shake += 0.05;
      if (!capture) hud.notice('The summit', 'A thread given', 'Something goes out of you and down into the rock. The ground under you is quieter. You are less than you were.', 8);
    } };
  g.interactables.push(gift);

  loop.add({ name: 'emberClock', update: () => {
    const dt = clock.dt, warned = flags.has('ember:warned');
    // Dawns since the warning.
    const h = params.v.timeOfDay;
    if (warned && ((lastHour < 6 && h >= 6) || (lastHour > h && h >= 6))) vars['ember:day'] = (vars['ember:day'] || 0) + 1;
    lastHour = h;
    const given = vars['ember:threads-given'] || 0;
    // (Once the mountain has broken, nothing holds it back again.)
    const st = flags.has('ember:erupting') || flags.has('ember:erupted') ? 5 : emberStage(warned, vars['ember:day'] || 0, given);
    vars['ember:stage'] = st; E.stage = st; E.def = STAGES[st];
    E.cowl = Math.max(0.45, 1 - 0.12 * given);
    if (st !== shownStage) {
      if (shownStage >= 0 && st > 0 && NOTES[st] && !capture) hud.notice(...NOTES[st], 8);
      shownStage = st;
    }
    offerT = Math.max(0, offerT - dt);
    // The gift: on the summit, once the mountain is waking, while there is a stage to hold back.
    if (!(gift.y > 0) && g.ground) { g.ground.qx = gift.x; g.ground.qz = gift.z; if (g.ground.covers()) { g.ground.sample(); gift.y = g.ground.h + 0.5; } }
    // (Only while a thread would really hold it back: past Fire's cap a day more or less changes nothing.)
    const raw = 1 + (vars['ember:day'] || 0) - given;
    gift.hidden = !(st >= 1 && gift.y > 0 && raw > 1 && raw <= 4);
    // Tremors: felt across the Waste, stronger near the cone.
    if (st > 0) {
      tremorT -= dt;
      if (tremorT <= 0) {
        const S = STAGES[st]; tremorT = S.tremor * (0.7 + 0.6 * Math.random());
        const d = Math.hypot(controller.pos.x - CRATER.x, controller.pos.z - CRATER.z), k = 1 - Math.min(1, Math.max(0, (d - 800) / 2600));
        if (k > 0.05) {
          if (arm) arm.shake += S.shake * k;
          sfx.x = controller.pos.x; sfx.y = controller.pos.y - 6; sfx.z = controller.pos.z; sfx.gain = 0.5 + 0.6 * k * st / 4; sfx.play(SFX.RUMBLE);
        }
      }
    }
  } });
}
