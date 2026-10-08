// The frost chapter in play (BRIEF §11–12): feeds the quest graph its facts and events, finds the
// interactable in reach (an NPC, a shrine) and draws the glyph at it, starts conversations and
// shrine rests on Interact, plays dialogue as subtitles (ducking the music), and turns quest
// actions into effects: Echoes (applied, with a stinger and a notice), lore and journal notices,
// shrines unlocked, autosaves.

import frostData from '../../data/quests/frost.json';
import { createChapter } from '../game/chapter.js';
import { applyEcho } from '../game/echoes.js';
import { surfTuning } from '../character/surf.js';
import { createHud } from '../ui/hud/hud.js';

/** @param {any} g  shared boot context */
export function addChapterSystem(g) {
  const { loop, controller, scene, input, Action, params, ws, warden, wardenMod, frost, music, game, clock, capture } = g;
  g.surfTuning = surfTuning;
  const hud = g.hud = createHud();
  const chapter = g.chapter = createChapter({
    data: frostData, pois: g.pois,
    hooks: {
      // An Echo found is carried; it takes effect once attuned at a shrine (BRIEF §11).
      echo: (id, e, loading) => {
        if (loading) { if (chapter.graph.flags.has('attuned:' + id)) applyEcho(g, id); return; }
        music.sting('echo'); hud.notice('Echo found', e?.name || id, 'Attune it at a shrine.', 8);
      },
      lore: (id, l) => hud.notice('Lore', l?.title || id, null, 6),
      shrine: () => {},
      autosave: () => { if (!capture) game.saves.requestAutosave(); },
      encounter: (id) => g.startEncounter?.(id),
      questStarted: (q) => hud.notice(q.kind === 'main' ? 'Journey' : 'Errand', q.title, q.summary, 7),
      questDone: (q) => { if (q.kind === 'side') music.sting('echo'); hud.notice('Completed', q.title, null, 6); },
    },
  });
  /** Attune a carried Echo (at a shrine): its effect from now on; remembered as a world flag. */
  chapter.attune = (id) => {
    if (!chapter.echoes.has(id) || chapter.graph.flags.has('attuned:' + id)) return false;
    chapter.graph.flags.add('attuned:' + id);
    applyEcho(g, id);
    const e = frostData.echoes[id];
    music.sting('echo'); hud.notice('Attuned', e?.name || id, e?.effect, 7);
    return true;
  };
  chapter.attuned = (id) => chapter.graph.flags.has('attuned:' + id);
  // Saves: the chapter is the quest graph and the progression (save v2).
  game.places = Object.fromEntries(g.pois.filter((p) => p.biome === 'frost' && ['camp', 'spring', 'overlook', 'den', 'monastery'].includes(p.kind)).map((p) => [p.id, { pos: p.pos }]));
  g.quests = chapter;
  g.progress = chapter;

  /** Things the Wraith can use: shrines (always), NPCs (added by the NPC system). */
  const targets = g.interactables = [];
  for (const p of g.pois) if (p.kind === 'shrine' && p.biome === 'frost') targets.push({ kind: 'shrine', id: p.id, verb: 'Rest', name: 'Shrine', x: p.pos[0], y: p.h, z: p.pos[1], r: 4.5, h: 1.4 });
  let near = null;
  // The Warden's weak points, shown while it fights: four seams, the one to work next pulsing, and one line saying what to do.
  const wp = document.createElement('div'); wp.className = 'warden-pips';
  const pipEls = [0, 1, 2, 3].map(() => { const e = document.createElement('i'); wp.append(e); return e; });
  const hintEl = document.createElement('div'); hintEl.className = 'hint'; wp.append(hintEl);
  document.body.append(wp);
  let pipKey = '', lastRem = 4;
  function target() {
    let best = -1, bd = 1e18;
    for (let k = 0; k < 4; k++) {
      if (warden.joint[k] === 2 || !warden.exposed(k)) continue;
      const d = (warden.jx[k] - controller.pos.x) ** 2 + (warden.jz[k] - controller.pos.z) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  g.wardenTarget = target;
  function wardenHud(fighting) {
    const t = fighting ? target() : -1;
    const key = fighting ? [0, 1, 2, 3].map((k) => warden.joint[k] + (k === t ? 'x' : warden.exposed(k) ? 'o' : 's')).join('') : '';
    if (key === pipKey) return;
    pipKey = key;
    wp.classList.toggle('on', fighting);
    for (let k = 0; k < 4; k++) {
      const st = warden.joint[k];
      pipEls[k].className = (st === 2 ? 'broken' : st === 1 ? 'frozen' : 'liquid') + (k === t ? ' next' : '') + (!warden.exposed(k) && st !== 2 ? ' sealed' : '');
      pipEls[k].title = warden.jointName(k);
    }
    if (t < 0) hintEl.textContent = '';
    else hintEl.textContent = warden.joint[t] === 1 ? 'Frozen: Sweep through the ' + warden.jointName(t) : 'Crystallize (F) beside the ' + warden.jointName(t) + ', then Sweep through the ice';
  }
  let lastWarden = -1, wasCrystal = false;
  const vp = [0, 0];

  /** World point → screen px through the camera's view-projection (no allocation). */
  function project(x, y, z) {
    const m = scene.getTransformMatrix().m;
    const cx = x * m[0] + y * m[4] + z * m[8] + m[12], cy = x * m[1] + y * m[5] + z * m[9] + m[13], w = x * m[3] + y * m[7] + z * m[11] + m[15];
    if (w <= 0.01) return false;
    vp[0] = (cx / w * 0.5 + 0.5) * window.innerWidth; vp[1] = (1 - (cy / w * 0.5 + 0.5)) * window.innerHeight;
    return true;
  }

  /** Use a shrine: the stones remember (unlock, quest event, save). The shrine menu opens from here (UI). */
  function useShrine(t) {
    chapter.raise('shrine:' + t.id);
    chapter.graph.flags.add(t.id);
    // Death re-forms at the last shrine rested at (BRIEF §2.3).
    g.nav?.visit(t.id);
    const k = +t.id.slice(t.id.lastIndexOf('-') + 1);
    chapter.graph.vars.lastShrine = k;
    g.setRespawn?.(t);
    if (!chapter.shrines.has(t.id)) { chapter.shrines.add(t.id); hud.notice('Shrine', 'The stones remember', 'Rested. The way back here is open.', 6); }
    else hud.notice('Shrine', 'Rested', null, 3);
    if (!capture) game.saves.requestAutosave();
    g.openShrine?.(t);
  }

  loop.add({ name: 'chapter', update: () => {
    const p = controller.pos, f = chapter.facts;
    f.x = p.x; f.z = p.z;
    const tod = params.v.timeOfDay;
    f.night = tod < 5.5 || tod > 19.5;
    if (ws.restoration.frost === 'restored') { if (!f.restored.has('frost')) f.restored.add('frost'); }
    else if (f.restored.size) f.restored.clear();
    // Events from the world.
    const wst = warden.active ? warden.state : -1;
    if (wst === wardenMod.W.RELEASE && lastWarden !== wardenMod.W.RELEASE && lastWarden >= 0) chapter.raise('warden:released');
    // The first time it wakes: one quiet line on how to break it (then never again).
    if (wst === wardenMod.W.AWAKE && lastWarden === wardenMod.W.DORMANT && !chapter.graph.flags.has('hint:warden') && !capture) {
      chapter.graph.flags.add('hint:warden');
      hud.notice('The Held Snow', 'Its knees are water, held still', 'F: Crystallize beside a knee · then click: Sweep through the ice · when both knees break it sags, and its shoulder and hip seams open to reach', 12);
    }
    lastWarden = wst;
    const fighting = wst >= 1 && wst !== wardenMod.W.RELEASE && wst !== wardenMod.W.RESTED && !capture;
    wardenHud(fighting);
    const rem = warden.active ? warden.remaining : 4;
    if (rem < lastRem && rem > 0 && !capture) {
      const k = target();
      hud.notice('The Held Snow', rem === 3 || rem === 2 ? (rem === 2 && !warden.exposed(2) ? 'The other knee' : 'It buckles') : 'The last seam opens',
        rem <= 2 && k >= 2 ? 'It sags onto its forelegs. The ' + warden.jointName(k) + ' is low enough to reach.' : 'Freeze the next seam, then Sweep through it.', 7);
    }
    lastRem = rem;
    if (frost.crystalEvent && !wasCrystal) chapter.raise('crystal');
    wasCrystal = frost.crystalEvent;
    chapter.tick();
    if (capture) return; // captures show the world only

    // Dialogue: Interact advances a line; 1/2 or a click picks a choice.
    const talking = chapter.talking;
    let pick = hud.clicked; hud.clicked = -1;
    if (input.pressed[Action.Element1]) pick = 0; else if (input.pressed[Action.Element2]) pick = 1;
    chapter.updateDialogue(clock.realDt, talking && input.pressed[Action.Interact], pick);
    hud.subtitles(chapter.current, chapter.ver);
    music.duck += ((chapter.talking ? 1 : 0) - music.duck) * Math.min(1, clock.realDt * 3);

    // Interactables: the nearest in reach, if none is talking.
    near = null;
    if (!talking && !controller.surf.active) {
      let best = 1e9;
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (t.hidden) continue;
        const dx = t.x - p.x, dz = t.z - p.z, d = dx * dx + dz * dz;
        if (d < t.r * t.r && d < best) { best = d; near = t; }
      }
    }
    if (near && project(near.x, near.y + near.h, near.z)) hud.glyph(true, vp[0], vp[1], near);
    else hud.glyph(false, 0, 0, null);
    if (near && !talking && input.pressed[Action.Interact]) {
      if (near.kind === 'npc') { chapter.talk(near.id); near.onTalk?.(); }
      else if (near.kind === 'shrine') useShrine(near);
      else near.onUse?.(near);
    }
  } });
}
