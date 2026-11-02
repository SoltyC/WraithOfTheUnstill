// The Drowned in play (Phase 10 U5; game/drowned.js is their logic, game/noise.js the Wraith's noise). Inside Ebbhold:
//  - the noise: made each frame from what the Wraith's body does (the quiet walk, Shift, all but silent), shared as g.noise for
//    whatever else listens (the Listener, F9);
//  - the people: twenty Veiled robe figures (systems/npcs.js bodies, on the city's own floors), each at its loop; a noise turns
//    heads, they come, they take hold of the robe and slow it (four hands pin it), and let go once it has been still a while;
//    a dodge shakes them off, loudly;
//  - the register, the stone book on the platform: reading it opens its journal page, where a name can be carried; speaking to
//    one of them says the carried name. The right one, and they put down what they hold and are still for good (saved as
//    `ebb:named:<id>`); the wrong one, and they cry out.

import { PEOPLE, DYE as DYES, newPerson, stepPerson, sayName, shakeOff, ST } from '../game/drowned.js';
import { createNoise, noiseStep, noiseAt } from '../game/noise.js';
import { createEbbholdSolids, EBB_ORIGIN as O } from '../world/ebbhold.js';

const TALK_R = 2.3;

/** @param {any} g  shared boot context */
export function addDrownedSystem(g) {
  const { loop, controller, chapter, hud, clock, capture } = g;
  const city = g.ebbhold, api = g.npcApi;
  if (!city || !api) return null;
  const flags = chapter.graph.flags, vars = chapter.graph.vars;
  const S = createEbbholdSolids(g.ebbholdView ? g.ebbholdView.city : undefined);
  const noise = g.noise = createNoise();
  const people = PEOPLE.map(newPerson);
  let made = false, quietFor = 0;
  const inp = { x: 0, y: 0, z: 0, speed: 0, grounded: true, quiet: false, swimming: false, landed: false, landV: 0, jumped: false, dodged: false, attacked: false };
  let wasGrounded = true, lastVy = 0, lastDodge = 0, lastWalkMul = 1;
  const w = { x: 0, y: 0, z: 0, quietFor: 0 };
  const probe = { x: 0, y: 0, z: 0 }, still0 = { x: 0, y: 0, z: 0 };

  /** Through the city: onto a floor of the person's tier (never off an edge), out of walls, rails and statues. */
  function move(p, nx, nz) {
    S.qx = nx + O.x; S.qz = nz + O.z; S.ref = p.y + O.y + 0.6; S.floorQ();
    const h = S.h - O.y;
    if (h < p.y - 0.9 || h > p.y + 0.75) return;   // a drop, or a wall's top: not a step
    probe.x = nx + O.x; probe.y = h + O.y; probe.z = nz + O.z; still0.x = 0; still0.z = 0;
    S.push(probe, still0);
    p.x = probe.x - O.x; p.z = probe.z - O.z; p.y = h;
  }

  /** One ground per body: the city's floors under it, at its own tier (its feet are the reference). */
  function groundFor(p) {
    return {
      qx: 0.5, qz: 0.5, h: 0.5,
      sample() { S.qx = this.qx; S.qz = this.qz; S.ref = p.y + O.y + 0.6; S.floorQ(); this.h = S.h > -1e3 ? S.h : p.y + O.y; },
      covers() { return true; },
    };
  }

  function make() {
    made = true;
    for (const p of people) {
      const d = p.d;
      const n = api.make('drowned-' + d.id, null, d.arch, [p.x + O.x, p.z + O.z], { tint: DYES[d.dye], interact: false, ground: groundFor(p) });
      n.noLook = true;
      n.brain = (nn) => {
        nn.x = p.x + O.x; nn.z = p.z + O.z; nn.vx = p.vx; nn.vz = p.vz; nn.yaw = p.yaw; nn.hunch = p.hunch;
        nn.offX = p.offX; nn.offZ = p.offZ; nn.hide = !city.active;
      };
      p.npc = n;
      p.target = { kind: 'drowned', id: d.id, verb: 'Listen', name: 'One of the Drowned', x: 0, y: 0, z: 0, r: TALK_R, h: 1.7, hy: 2.5, hidden: true, onUse: () => speak(p) };
      g.interactables.push(p.target);
      if (flags.has('ebb:named:' + d.id)) p.state = ST.STILL;
    }
  }

  function speak(p) {
    const carried = vars['ebb.carry'];
    if (!carried) {
      hud.notice('Ebbhold', '…', 'Its mouth moves, too low to hear. The book on the platform in the Tide Hall holds the city’s names.', 6);
      return;
    }
    const r = sayName(p, carried);
    if (r === 'named') {
      flags.add('ebb:named:' + p.d.id); vars['ebb.carry'] = null;
      chapter.raise?.('ebb:named');
      hud.notice(p.d.name, '…', 'They put down what they were holding, and are still.', 6);
    } else if (r === 'wrong') {
      // Not theirs: a cry the whole room hears.
      noiseAt(noise, p.x, p.y, p.z, 0.8);
      hud.notice('Ebbhold', 'Not that name', 'It cries out.', 4);
    }
  }

  // The register: the stone book on its plinth, in the platform's middle.
  const book = { kind: 'register', verb: 'Read', name: 'The register', x: 130 + O.x, y: 1.2 + O.y, z: O.z, r: 3.2, h: 0.6, hy: 2.5, hidden: true,
    onUse: () => { flags.add('ebb:register-read'); g.openJournal?.('register'); } };
  g.interactables.push(book);

  loop.add({ name: 'drowned', update: () => {
    const active = city.active;
    book.hidden = !active;
    if (!active) {
      if (made) for (const p of people) p.target.hidden = true;
      controller.dragMul = 1;
      return;
    }
    if (!made && !capture) make();
    const dt = Math.min(clock.dt, 0.1), P = controller.pos, V = controller.vel;
    // The noise from the body.
    inp.x = P.x - O.x; inp.y = P.y - O.y; inp.z = P.z - O.z;
    inp.speed = Math.hypot(V.x, V.z); inp.grounded = controller.grounded; inp.quiet = controller.quiet; inp.swimming = controller.swimming;
    inp.landed = controller.grounded && !wasGrounded; inp.landV = -lastVy;
    inp.jumped = !controller.grounded && wasGrounded && V.y > 2;
    inp.dodged = controller.dodgeT > 0 && lastDodge <= 0;
    inp.attacked = controller.walkMul < 1 && lastWalkMul >= 1;
    wasGrounded = controller.grounded; lastVy = V.y; lastDodge = controller.dodgeT; lastWalkMul = controller.walkMul;
    noiseStep(noise, inp, dt);
    quietFor = noise.level < 0.15 ? quietFor + dt : 0;
    w.x = inp.x; w.y = inp.y; w.z = inp.z; w.quietFor = quietFor;
    // The people.
    let holders = 0;
    for (const p of people) {
      if (stepPerson(p, noise, w, dt, move)) {
        p.slot = Math.atan2(p.x - w.x, p.z - w.z);
        if (!flags.has('ebb:held-hint') && !capture) { flags.add('ebb:held-hint'); hud.notice('Ebbhold', 'Hands on the robe', 'They hold on while it moves. Be still, and they let go.', 7); }
      }
      if (inp.dodged) shakeOff(p, w);
      if (p.state === ST.HOLD) holders++;
      const t = p.target;
      if (t) {
        t.hidden = p.state === ST.STILL;
        t.x = p.x + O.x; t.y = p.y + O.y; t.z = p.z + O.z;
        const c = vars['ebb.carry'];
        t.verb = c ? 'Say “' + c + '”' : 'Listen';
      }
    }
    controller.dragMul = holders === 0 ? 1 : holders >= 4 ? 0 : 1 / (1 + 0.9 * holders);
  } });

  return (g.drowned = { people, noise, speak });
}

