// The Sow (world/sow.js; data/quests/ember.json; docs/phase-11/ember-design.md §4.3, §5 — the Ember chapter's slice).
// Six families, six elders. None believes the mountain ("the mountain's business"); each believes its own land. The proof:
//   Aled    the trough by the fold runs warm          Crystallize on it: the ice flashes off in steam
//   Bethan  the cistern sunk, cracked at the waterline   looked at (a clue)
//   Huw     a crack across the threshing floor          looked at (it breathes a wisp of steam)
//   Ffion   dead hens in the still air of the byre      looked at
//   Gwil    the well's bucket comes up hot              Draw it (interact): it steams
//   Mari    the bottom terrace's soil warm              Crystallize on it: the frost won't hold
// Found, the sign is something the Wraith can show (`ember:sign-<id>`): the elder's talk offers it, and the elder walks to it
// with the Wraith and sees it (`ember:<id>-believes`). Believing is not going: each elder will not be the first to run while
// the neighbours sit tight (NEED: families already on the road); they talk over the walls. Ready (`ember:<id>-ready`), the
// elder asks: help load the harvest (the hours go: the clock, §6) or leave it (one of them stays with it — a holdout). Aled
// goes only on a promise to come back for his flock. The lie ("it goes tonight") sends a family running at once; at the next
// dawn, with the mountain still standing, every family still home hears of it (`ember:lie-found`) and wants two more
// neighbours gone. The bodies show it all (§5): the door shut, bundles by it once they believe, the cart loaded, then the
// family down the road to the coast and the door left open.
// The mountain's own sign, the new steam (§3): three fissures high on the north-west flank, steaming; Crystallize on one and
// the ice flashes to steam at once (`ember:steam-read`).

import { SOW_FARMS, SOW_SIGNS, FISSURES, CAMP, sowPoint } from '../world/sow.js';
import { createPlume } from '../render/plume.js';

/** Families that must already be on the road before this one will go. */
export const NEED = { aled: 1, bethan: 0, huw: 1, ffion: 0, gwil: 2, mari: 1 };
const LIE_COST = 2;
/** The road out: south up the valley's head to the headland above the sea (the camp). */
const ROAD = [[760, -2420], [735, -2560], [722, -2618]];
const WALK = 1.25;

/** Whether a family is ready to go (pure: tested). */
export function readyToGo(id, flags, onRoad, stage = 0) {
  if (!flags.has(`ember:${id}-believes`)) return false;
  // (As the mountain swells the farmers talk, and need one neighbour fewer at each stage past Waking: systems/emberClock.js.)
  // (Word travels: a Seer carried off her mountain by force costs the Wraith a neighbour with every family: systems/ashChapel.js.)
  const need = Math.max(0, NEED[id] + (flags.has('ember:lie-found') ? LIE_COST : 0) + (flags.has('ember:seer-forced') ? 1 : 0) - Math.max(0, stage - 1));
  return onRoad >= need;
}

/** @param {any} g  shared boot context */
export function addSowSystem(g) {
  const { chapter, loop, controller, clock, hud, capture, sfx, SFX, scene, atmosphere, params } = g;
  if (!chapter.table['sow-aled'] || !g.archSites) return;
  const flags = chapter.graph.flags;
  const has = (f) => flags.has(f);
  const siteIdx = (id) => g.archSites.findIndex((s) => s.id === id);
  const fams = SOW_FARMS.map((farm) => {
    const id = farm.id, kinId = chapter.data.npcs.find((n) => n.home?.poi === `sow-${id}-yard`)?.id;
    return {
      id, farm, kinId, sign: sowPoint(farm, ...SOW_SIGNS[id]), door: chapter.table[`sow-${id}-door`].pos, yard: chapter.table[`sow-${id}-yard`].pos,
      cart: sowPoint(farm, 0, 12.9), gate: sowPoint(farm, 0, 12),
      site: {
        door: siteIdx(`sow-${id}-door`),
        bundles: siteIdx(`sow-${id}-bundles`),
        cart: siteIdx(`sow-${id}-cart`),
        load: siteIdx(`sow-${id}-load`),
        camp: siteIdx('emb-camp-' + id),
      },
      elder: null, kin: null, leg: 0, hidden: false, t: 0,
    };
  });
  const byId = Object.fromEntries(fams.map((f) => [f.id, f]));
  const going = (f) => has(`ember:${f.id}-go`) || has(`ember:${f.id}-lied`);
  const onRoad = () => fams.filter(going).length;
  const decided = (f) => going(f) || (f.id === 'aled' && has('ember:aled-stays'));
  const say = (title, sub, text, secs = 6) => { if (!capture) hud.notice(title, sub, text, secs); };

  // Steam: a few small plumes (render/plume.js at a few hundredths of the volcano's): a constant wisp at Huw's crack and the
  // three fissures; a burst where a sign is read with a verb. Only drawn near.
  const vents = [];
  function vent(x, z, opt) {
    const p = createPlume(scene, atmosphere, { count: opt.count || 48, name: 'steam' });
    p.scale = opt.scale || 0.03; p.steam = 1; p.height = opt.height || 9; p.strength = 0; p.dark = 0; p.x = x; p.z = z; p.y = NaN;
    p.freeze(); p.mesh.setEnabled(false);
    const v = { p, x, z, base: opt.base || 0, burst: 0, y: NaN };
    vents.push(v); return v;
  }
  const crackVent = vent(byId.huw.sign[0], byId.huw.sign[1], { base: 0.1, height: 3, scale: 0.01, count: 16 });
  const aledVent = vent(byId.aled.sign[0], byId.aled.sign[1], { height: 6, scale: 0.02, count: 32 });
  const mariVent = vent(byId.mari.sign[0], byId.mari.sign[1], { height: 5, scale: 0.02, count: 32 });
  const gwilVent = vent(byId.gwil.sign[0], byId.gwil.sign[1], { height: 5, scale: 0.014, count: 24 });
  const fissVents = FISSURES.map(([x, z], k) => vent(x, z, { base: 0.55, height: 22 + k * 4, scale: 0.05, count: 64 }));

  // Gwil's well: Draw the bucket.
  const draw = { kind: 'sow', id: 'sow-gwil-well', verb: 'Draw', name: 'The well bucket', x: byId.gwil.sign[0], y: 0, z: byId.gwil.sign[1], r: 2.6, h: 1.2, hidden: false,
    onUse: () => { gwilVent.burst = 1; chime(SFX.SPLASH || SFX.THUD, 0.7, byId.gwil.sign); if (!has('ember:sign-gwil')) { flags.add('ember:sign-gwil'); say("Gwil's Well", 'The bucket comes up hot', 'Steam pours off the water. The rope is warm in the hand.', 7); } } };
  g.interactables.push(draw);
  function chime(k, gain, at) { if (k === undefined) return; sfx.x = at[0]; sfx.y = controller.pos.y; sfx.z = at[1]; sfx.gain = gain; sfx.play(k); }

  // Crystallize on a sign or a fissure.
  let wasCrystal = false;
  function crystal() {
    const fr = g.frost; if (!fr) return;
    const ev = fr.crystalEvent && !wasCrystal; wasCrystal = !!fr.crystalEvent;
    if (!ev) return;
    const near = (p, r) => Math.hypot(fr.crystalX - p[0], fr.crystalZ - p[1]) < r;
    if (near(byId.aled.sign, 4.5)) { aledVent.burst = 1; if (!has('ember:sign-aled')) { flags.add('ember:sign-aled'); say("Aled's Fold", 'The ice will not hold', 'It flashes off the trough in a cloud of steam. The water underneath is warm as blood.', 7); } }
    if (near(byId.mari.sign, 6)) { mariVent.burst = 1; if (!has('ember:sign-mari')) { flags.add('ember:sign-mari'); say("Mari's Terraces", 'The frost will not hold', 'It steams off the soil as it lands. Under the vines, the ground is warm.', 7); } }
    FISSURES.forEach((f, k) => {
      if (!near(f, 8)) return;
      fissVents[k].burst = 1.6;
      if (!has('ember:steam-read')) {
        flags.add('ember:steam-read'); chapter.raise('ember:steam-read');
        chime(SFX.WHOOSH, 1.2, f);
        say('The New Steam', 'The ground is heating', 'The ice flashes to steam before it can settle. The rock under it is too hot to hold frost. This is new: none of the old maps show steam here.', 9);
      }
    });
  }

  // The families' brains.
  function goTo(n, tx, tz, dt, sp = WALK) {
    const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
    if (d < 0.25) { n.vx = 0; n.vz = 0; return d; }
    const s = Math.min(sp, d * 2.5);
    n.vx = dx / d * s; n.vz = dz / d * s; n.x += n.vx * dt; n.z += n.vz * dt; n.yaw = Math.atan2(dx, dz);
    return d;
  }
  function leaveBrain(f, n, dt, lag) {
    // Out of the gate, up the coast road to the headland camp (world/sow.js CAMP), to the family's place round the fire.
    // Out of the Wraith's sight they walk on quicker (no one is watching), so a family is there when the Wraith arrives.
    // (lag: the elder's second, a step behind and to the side, then beside them at the fire.)
    // (Their own clearing's fire — world/refugeeKit.js: its first two places, the elder's and the kin's — or the middle's.)
    const plot = f.site.camp >= 0 ? g.archSites[f.site.camp] : null, ps = plot?.slots?.[lag ? 1 : 0];
    const k0 = fams.indexOf(f), a = k0 / fams.length * Math.PI * 2 + 0.3, r = 6.5;
    const slot = ps ? [plot.at[0] + ps.x, plot.at[1] + ps.z]
      : [CAMP.at[0] + Math.cos(a) * r + (lag ? Math.sin(a) * 1.3 : 0), CAMP.at[1] + Math.sin(a) * r - (lag ? Math.cos(a) * 1.3 : 0)];
    const pts = [f.gate, ...ROAD, slot];
    n.leg ??= 0;
    const k = Math.min(n.leg, pts.length - 1), last = k === pts.length - 1;
    const pd = Math.hypot(controller.pos.x - n.x, controller.pos.z - n.z);
    const off = lag && !last ? [Math.sin(n.yaw + 1.6) * 0.9 - Math.sin(n.yaw) * 1.6, Math.cos(n.yaw + 1.6) * 0.9 - Math.cos(n.yaw) * 1.6] : [0, 0];
    const d = goTo(n, pts[k][0] + off[0], pts[k][1] + off[1], dt, pd > 120 ? WALK * 6 : WALK * 1.1);
    if (!last && d < 1.8) n.leg++;
    n.hide = false;
    if (last && d < 0.4) {
      // At the camp: by the fire, facing it, looking up when the Wraith comes.
      n.yaw = ps ? ps.yaw : Math.atan2(CAMP.at[0] - n.x, CAMP.at[1] - n.z); n.noLook = false; n.hunch = 0.35; n.gone = true;
    } else { n.noLook = true; n.hunch = 0.2; }
    return Math.hypot(f.farm.at[0] - n.x, f.farm.at[1] - n.z) > 60;
  }
  function elderBrain(f) {
    return (n, dt) => {
      f.elder = n;
      const stays = f.id === 'aled' && has('ember:aled-stays');
      if (going(f) && !stays) { f.hidden = leaveBrain(f, n, dt, false); return; }
      n.hide = false; n.noLook = false;
      if (has(`ember:${f.id}-showing`) && !has(`ember:${f.id}-believes`)) {
        // To the sign with the Wraith; at it, and with the Wraith there, they see it.
        const d = goTo(n, f.sign[0] + (f.door[0] - f.sign[0]) * 0.12, f.sign[1] + (f.door[1] - f.sign[1]) * 0.12, dt);
        n.noLook = d > 1;
        const pd = Math.hypot(controller.pos.x - f.sign[0], controller.pos.z - f.sign[1]);
        if (d < 1.2 && pd < 12) {
          flags.add(`ember:${f.id}-believes`); chapter.raise(`ember:${f.id}-believes`);
          if (f.id === 'aled') aledVent.burst = 1; if (f.id === 'mari') mariVent.burst = 1; if (f.id === 'gwil') gwilVent.burst = 1;
          chapter.say(`ember.${f.id}.shown`);
        }
        return;
      }
      // At home: by the door, or (believing) by the bundles, looking up at the mountain now and then.
      goTo(n, f.door[0], f.door[1], dt);
      n.hunch = has(`ember:${f.id}-believes`) ? 0.3 : 0.15;
    };
  }
  function kinBrain(f) {
    let wp = 0, wt = 0;
    return (n, dt) => {
      f.kin = n;
      const stays = has(`ember:${f.id}-light`);
      // (Aled staying sends Nia down the road alone.)
      const alone = f.id === 'aled' && has('ember:aled-stays');
      if ((going(f) && !stays) || alone) { leaveBrain(f, n, dt, !alone); return; }
      // Working the yard: between the yard, the rack and the gate; packing (to and from the door) once they believe.
      n.hide = false;
      const pts = has(`ember:${f.id}-believes`) && !stays ? [f.door, f.cart] : [f.yard, sowPoint(f.farm, -3, -5.8), sowPoint(f.farm, 9, 6.5)];
      wt -= dt;
      const t = pts[wp % pts.length], d = goTo(n, t[0], t[1], dt, 1.0);
      n.noLook = d > 0.5; n.hunch = 0.25;
      if (d < 0.5 && wt <= 0) { wt = 3 + (wp % 3) * 2; wp++; }
    };
  }
  let brainsSet = false;
  function setBrains() {
    if (brainsSet || !g.npcs) return;
    for (const f of fams) {
      const e = g.npcs.find((n) => n.id === 'ember-' + f.id), k = g.npcs.find((n) => n.id === f.kinId);
      if (e) e.brain = elderBrain(f);
      if (k) k.brain = kinBrain(f);
    }
    brainsSet = true;
  }

  // The lie found out: the next dawn after it, the mountain still standing.
  let lieHour = null, lastHour = params.v.timeOfDay;
  // Loading the harvest costs the afternoon.
  const loaded = new Set();

  // The headland's sites are built once. The road and the eruption decide which clearings are occupied.
  const campSite = siteIdx('emb-camp');
  const coldSite = siteIdx('emb-camp-empty');
  const lookoutSite = siteIdx('emb-camp-lookout');
  const otherCamps = ['cinderhold', 'chapel'].map((id) => ({ id, site: siteIdx('emb-camp-' + id) }));
  // The camp wears the grass away where people sleep, cook and walk (render/clearance.js): only the clearings in use.
  const campIdx = g.archSites.map((st, i) => (st.trample ? i : -1)).filter((i) => i >= 0);
  let campShown = '';
  g.clearance?.addSource({
    near(cx, cz, R, cb) {
      for (const i of campIdx) {
        const st = g.archSites[i];
        if (st.hidden || Math.hypot(st.at[0] - cx, st.at[1] - cz) > R + 40) continue;
        for (const [x, z, r] of st.trample) cb(x, z, r, r, 0);
      }
    },
  });
  let acc = 0;
  loop.add({ name: 'sow', update: () => {
    setBrains();
    crystal();
    const dt = clock.dt, p = controller.pos;
    acc += dt;
    if (acc > 0.2) {
      acc = 0;
      const road = onRoad();
      const sites = g.archSites;
      let occupied = false;
      chapter.graph.vars['ember:sow-road'] = road;   // (read by Cinderhold's purse: systems/cinderhold.js)
      for (const f of fams) {
        if (!has(`ember:${f.id}-ready`) && !going(f) && readyToGo(f.id, flags, road, g.ember?.stage || 0)) { flags.add(`ember:${f.id}-ready`); }
        if (has(`ember:${f.id}-load`) && !loaded.has(f.id)) {
          loaded.add(f.id);
          if (g.sweepTime) g.sweepTime((params.v.timeOfDay + 2) % 24);
          chapter.graph.vars['ember:hours'] = (chapter.graph.vars['ember:hours'] || 0) + 2;
          say(f.farm.id[0].toUpperCase() + f.farm.id.slice(1), 'The cart is loaded', 'Two hours gone. The mountain did not wait for them.', 6);
        }
        // The farm shows it.
        const gone = going(f) && !(f.id === 'aled' && has('ember:aled-stays'));
        if (f.site.door >= 0) sites[f.site.door].hidden = gone;
        if (f.site.bundles >= 0) sites[f.site.bundles].hidden = !(has(`ember:${f.id}-believes`) || has(`ember:${f.id}-lied`)) || f.hidden;
        if (f.site.load >= 0) sites[f.site.load].hidden = !has(`ember:${f.id}-load`) || f.hidden;
        if (f.site.cart >= 0) sites[f.site.cart].hidden = gone && f.hidden;
        // (Its clearing: whenever any of the household went — Aled holding the fold does not take Nia's place at the camp.)
        const fled = going(f);
        if (f.site.camp >= 0) sites[f.site.camp].hidden = !fled;
        occupied ||= fled;
      }
      for (const { id, site } of otherCamps) {
        const fled = has('ember:fled-' + id);
        if (site >= 0) sites[site].hidden = !fled;
        occupied ||= fled;
      }
      if (campSite >= 0) sites[campSite].hidden = !occupied;
      if (lookoutSite >= 0) sites[lookoutSite].hidden = !occupied;
      if (coldSite >= 0) sites[coldSite].hidden = occupied || !has('ember:after');
      // (Re-stamp the worn ground when the clearings in use change.)
      const shown = campIdx.map((i) => (sites[i].hidden ? 0 : 1)).join('');
      if (shown !== campShown) { campShown = shown; g.clearance?.invalidate(); }
      const all = fams.every(decided);
      const n = fams.filter(decided).length;
      chapter.graph.vars['ember:sow-decided'] = n;
      if (all && !has('ember:sow-all')) {
        flags.add('ember:sow-all'); chapter.raise('ember:sow-all');
        const holdouts = fams.filter((f) => has(`ember:${f.id}-light`)).length + (has('ember:aled-stays') ? 1 : 0);
        say('The Sow', 'The valley empties', holdouts ? `The farms stand open. ${holdouts === 1 ? 'One stayed' : holdouts + ' stayed'} behind.` : 'The farms stand open, every one. The carts are on the coast road.', 8);
      }
      // The lie found out at dawn.
      const h = params.v.timeOfDay;
      if (has('ember:lied') && lieHour === null) lieHour = h;
      if (lieHour !== null && !has('ember:lie-found') && ((lastHour < 6 && h >= 6) || (lastHour > h && h >= 6))) {
        flags.add('ember:lie-found');
        say('The Sow', 'The night passed', 'The mountain still stands. Word goes over the walls: the thing from the north lied.', 8);
      }
      lastHour = h;
      // Steam heights from the ground (once known).
      for (const v of vents) if (!(v.y === v.y) && g.ground) { g.ground.qx = v.x; g.ground.qz = v.z; if (g.ground.covers()) { g.ground.sample(); v.y = g.ground.h; } }
    }
    // Steam: drawn only near.
    for (const v of vents) {
      const d = Math.hypot(p.x - v.x, p.z - v.z);
      v.burst = Math.max(0, v.burst - dt * 0.12);
      const on = d < 320 && v.y === v.y && (v.base > 0 || v.burst > 0.01);
      if (v.p.mesh.isEnabled() !== on) v.p.mesh.setEnabled(on);
      if (!on) continue;
      v.p.y = v.y - 0.3; v.p.time = clock.simTime; v.p.strength = Math.min(1, v.base + v.burst);
      if (g.wind) { g.wind.sx = v.x; g.wind.sz = v.z; g.wind.sample(); v.p.windX = g.wind.outX; v.p.windZ = g.wind.outZ; }
      v.p.update();
    }
  } });
  g.sow = { fams, onRoad, readyToGo: (id) => readyToGo(id, flags, onRoad(), g.ember?.stage || 0), vents };
}
