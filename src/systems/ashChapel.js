// The Ash Chapel (world/ashChapel.js; data/quests/ember.json; docs/phase-11/ember-design.md §4.2). The faithful believe
// their scripture, not measurements; its last lines (the stele by the door) name three omens and say what to do:
//   the spring sours        taste the sacred spring in its grotto (Interact): warm, yellow, stinking   `ember:omen-spring`
//   the birds fall          the still hollow at the summit's ring: birds dead on the ash (a clue)      `ember:omen-birds`
//   the mountain breathes   by day: the mountain at Breathing (systems/emberClock.js)                  `ember:omen-breath`
// Two omens and the scripture read (`ember:omens-enough`), Nerys (npc ember-edda) can be read its end — go down, and do not look back — and the
// faithful go down by their own path round the north flank (`ember:chapel-doubt`, `ember:path-known`) to the headland camp.
// Annick, the Seer, never goes: she reads the same omens as the calling. The Wraith can leave her, promise to stand with her
// at the spring when it comes (`ember:annick-promise`), or carry her off by force (`ember:seer-forced`): she lives and never
// forgives, and word of it travels (each Sow family not yet gone wants one more neighbour on the road: systems/sow.js).
// Respect (§5): the bell rings the hours, and no one speaks while it rings (`ember:bells`, ~25 s); speak through it and the
// faithful take it ill (`ember:chapel-rude`): Nerys then wants all three omens.

import { CHAPEL_PTS, chapelWorld } from '../world/ashChapel.js';
import { CAMP } from '../world/sow.js';
import { createPlume } from '../render/plume.js';

const PATH = [[2120, -2250], [2020, -2120], [1880, -2080], [1600, -2200], [1250, -2350], [950, -2460], [770, -2560]];
const BELL_SECS = 25;

/** How many omens the faithful need (pure: tested). */
export const omensNeeded = (flags) => (flags.has('ember:chapel-rude') ? 3 : 2);

/** @param {any} g  shared boot context */
export function addAshChapelSystem(g) {
  const { chapter, loop, controller, clock, hud, capture, sfx, SFX, params, scene, atmosphere } = g;
  if (!chapter.table['ash-annick'] || !g.archSites) return;
  const flags = chapter.graph.flags, vars = chapter.graph.vars, has = (f) => flags.has(f);
  const W = (k) => chapelWorld(CHAPEL_PTS[k]);
  const say = (t, s, x, secs = 7) => { if (!capture) hud.notice(t, s, x, secs); };
  const spring = W('spring');

  // The spring: taste it.
  const taste = { kind: 'ember', id: 'ash-spring', verb: 'Taste', name: 'The sacred spring', x: spring[0] - 1.4, y: 0, z: spring[1], r: 2.8, h: 0.8, hidden: false,
    onUse: () => {
      steam.burst = 1;
      if (!has('ember:omen-spring')) { flags.add('ember:omen-spring'); say('The sacred spring', 'The spring has soured', 'Warm, and yellow under the crust, and it stinks of rotten eggs. The faithful drink from this every morning.', 8); }
    } };
  g.interactables.push(taste);
  // Its breath: a faint wisp always, more when stirred.
  const p = createPlume(scene, atmosphere, { count: 20, name: 'steam' });
  p.scale = 0.012; p.steam = 1; p.height = 3; p.strength = 0; p.freeze(); p.mesh.setEnabled(false);
  const steam = { burst: 0, y: NaN };

  // The bell: the hours.
  let lastHour = params.v.timeOfDay, bellT = 0;
  function ring() {
    bellT = BELL_SECS; flags.add('ember:bells');
    const [x, z] = W('bell'), d = Math.hypot(controller.pos.x - x, controller.pos.z - z);
    if (d < 400) { sfx.x = x; sfx.y = controller.pos.y + 2; sfx.z = z; sfx.gain = 0.8; sfx.play(SFX.TOLL); }
  }

  // The faithful.
  const FAITHFUL = ['edda', 'corwen', 'lio', 'ysolt', 'brannoc'];
  function goTo(n, tx, tz, dt, sp) {
    const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
    if (d < 0.25) { n.vx = 0; n.vz = 0; return d; }
    const s = Math.min(sp, d * 2.5);
    n.vx = dx / d * s; n.vz = dz / d * s; n.x += n.vx * dt; n.z += n.vz * dt; n.yaw = Math.atan2(dx, dz);
    return d;
  }
  function down(n, dt, k, slow) {
    const a = 3.6 + k * 0.42, slot = [CAMP.at[0] + Math.cos(a) * 9, CAMP.at[1] + Math.sin(a) * 9];
    const route = [...PATH, slot], pd = Math.hypot(controller.pos.x - n.x, controller.pos.z - n.z);
    n.leg ??= 0;
    const last = n.leg >= route.length - 1, [tx, tz] = route[Math.min(n.leg, route.length - 1)];
    const d = goTo(n, tx, tz, dt, pd > 120 ? 9 : slow ? 0.9 : 1.4);
    if (!last && d < 2) n.leg++;
    n.hide = false;
    if (last && d < 0.4) { n.yaw = Math.atan2(CAMP.at[0] - n.x, CAMP.at[1] - n.z); n.noLook = !!slow; n.hunch = slow ? 0.55 : 0.35; } else { n.noLook = true; n.hunch = slow ? 0.5 : 0.25; }
  }
  function brain(id, k) {
    const home = chapter.table['ash-' + id].pos;
    let t = 0;
    return (n, dt) => {
      if (id === 'annick') {
        if (has('ember:seer-forced')) return down(n, dt, 6, true);
        // With a promise, or alone: at the spring.
        const at = has('ember:chapel-doubt') ? [spring[0] - 7, spring[1] + 3.5] : home;   // (clear of the spring's Taste)
        const d = goTo(n, at[0], at[1], dt, 0.8); n.noLook = d > 0.5; n.hunch = 0.2; n.hide = false;
        return;
      }
      if (has('ember:chapel-doubt')) return down(n, dt, k, false);
      // At their work; still while the bell rings, turned to it.
      t += dt;
      if (bellT > 0) { const [bx, bz] = W('bell'); n.vx = 0; n.vz = 0; n.yaw = Math.atan2(bx - n.x, bz - n.z); n.noLook = true; n.hunch = 0.4; return; }
      const d = goTo(n, home[0] + Math.sin(t * 0.09 + k) * 1.4, home[1] + Math.cos(t * 0.07 + k * 2) * 1.2, dt, 0.5);
      n.noLook = d > 0.6; n.hunch = 0.25; n.hide = false;
    };
  }
  let set = false, acc = 0;
  loop.add({ name: 'ashChapel', update: () => {
    const dt = clock.dt;
    if (!set && g.npcs) {
      ['annick', ...FAITHFUL].forEach((id, k) => { const n = g.npcs.find((q) => q.id === 'ember-' + id); if (n) n.brain = brain(id, k); });
      set = true;
    }
    // The bell, on the hour.
    const h = params.v.timeOfDay;
    if (Math.floor(h) !== Math.floor(lastHour) && Math.abs(h - lastHour) < 2) ring();
    lastHour = h;
    if (bellT > 0) { bellT -= dt; if (bellT <= 0) flags.delete('ember:bells'); }
    // The spring's breath.
    if (!(steam.y === steam.y) && g.ground) { g.ground.qx = taste.x; g.ground.qz = taste.z; if (g.ground.covers()) { g.ground.sample(); steam.y = g.ground.h; taste.y = steam.y + 0.6; } }
    steam.burst = Math.max(0, steam.burst - dt * 0.15);
    const near = Math.hypot(controller.pos.x - taste.x, controller.pos.z - taste.z) < 250 && steam.y === steam.y;
    if (p.mesh.isEnabled() !== near) p.mesh.setEnabled(near);
    if (near) { p.x = taste.x; p.y = steam.y + 0.3; p.z = taste.z; p.time = clock.simTime; p.strength = 0.12 + 0.6 * steam.burst; p.update(); }
    acc += dt; if (acc < 0.25) return; acc = 0;
    // The omens.
    if (!has('ember:omen-breath') && (vars['ember:stage'] || 0) >= 3) flags.add('ember:omen-breath');
    const n = ['ember:omen-spring', 'ember:omen-birds', 'ember:omen-breath'].filter(has).length;
    vars['ember:omens'] = n;
    if (n >= omensNeeded(flags)) flags.add('ember:omens-enough'); else flags.delete('ember:omens-enough');
    if (has('ember:chapel-doubt') && !has('ember:chapel-decided')) { flags.add('ember:chapel-decided'); chapter.raise('ember:chapel-decided'); say('The Ash Chapel', 'The faithful go down', 'By their own path round the north flank, the one only they know in the ash. The Seer stays.', 8); }
  } });
  g.ashChapel = { ring, get bell() { return bellT; } };
}
