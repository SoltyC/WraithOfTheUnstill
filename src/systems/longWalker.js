// The Long Walker in play (Phase 9 D10; docs/gameplay-design.md §5.1 "bring it home", dunes-design.md
// §4.3–4.4). The body is game/walker/walker.js, its back a moving floor (game/walker/deck.js); this is
// the director:
//   • the track — glass prints along its old circuit lead to the star megadune where it lies buried
//     (world/glassKit.js; the compass points at the next print);
//   • the waking — touching the brake stone in its forecourt: it heaves out of the dune, and the Wraith
//     catches its motion: Stone (and with it sand-surf) is lent;
//   • the pursuit — it walks its circuit at 5 m/s. It never attacks: its footfalls throw sand and hurt
//     what they land on, Skitters ride the dust of its wake. The gait is the telegraph: each lifted
//     foot's landing spot is ringed in dust while it swings;
//   • the stumble — a foot that lands wrong (on a Ridge or into a Bloom's pit, on Frost-bound sand, or
//     on ground that changed under it while it swung) buckles: it kneels for 13 s, the leg a ramp of
//     ruin plates and the flank a stair of them up to its back (a checkpoint);
//   • its back — the court walks with it (the calm). A Shard or a Gust against a glyph pillar turns it
//     to that side. It shakes now and then (brace against stone). Steered at the rift, it balks,
//     shakes the Wraith off and goes back to its circuit;
//   • home — near the camp's dry well it kneels and waits. It lies down only when the well's glass
//     eye is lit: turn the two mirror-stones on its roof so the low sun goes mirror → mirror → shaft;
//   • the release — it lowers its head into the shaft and lies down, a dune range by the oasis; the
//     erg is restored (the wind, the streaming crests, the moving dunes); Stone is the Wraith's.
//
// Flags (saved with the quests): dunes:walker-woke, dunes:walker-boarded, dunes:walker-released; its
// place is saved with the entities (boot/game.js). Dev: ?walker=wake | walk | kneel | ride | home | release.

import { createWalker, WK, WEV, MODE, PILLARS, MIRRORS, ROOF_Y, WELL_LOCAL, BRAKE_LOCAL, walkerTuning, SIDE, HIP_Z, DECK_X, DECK_Z } from '../game/walker/walker.js';
import { createDeck } from '../game/walker/deck.js';
import { WALKER_SEAT, CAMP_WELL, CAMP_GATE_YAW, CIRCUIT, circuitTarget, trackPrints, nextPrint } from '../game/walker/route.js';
import { hasSpawnRoom } from '../game/shaped/spawnRoom.js';
import { worldState } from '../game/worldState.js';
import { BRUSH } from '../shaders/terrainState.wgsl.js';

export const FLAG = { WOKE: 'dunes:walker-woke', BOARDED: 'dunes:walker-boarded', RELEASED: 'dunes:walker-released' };

export const walkerSys = {
  near: 300, far: 3200,          // m: the near (finer) view within, drawn within, culled beyond
  padR: 2.8,                     // m: a foot's pad (the stumble checks and the crush)
  ridgeH: 0.6, pitH: 0.6,        // m of Stone's mass under the pad that trips it
  groundDelta: 0.9,              // m the ground changed under a lifted foot
  freezeLife: 40,                // s a Frost binding counts
  crushR: 3.4, crushDamage: 30, crushShove: 9,
  shakeEvery: [26, 38], shakeWarn: 1.6, shakeTime: 2.6, shakeKick: 3.4, braceR: 1.7, brace: 0.25,
  balkKick: 15,                  // m/s the balk throws its rider out over the side
  skitterEvery: [38, 55], skitterNear: 170,
  steerIdle: 30,                 // s without a rider before a steered Walker returns to its circuit
  sunLow: [0.02, 0.36],          // sin(elevation) of a sun low enough to throw into the shaft
  mirrorTol: 0.42,               // rad: a mirror-stone turned within this of true
  litHold: 2.5,                  // s the eye must stay lit before it lies down
  restHour: 17.7,                // waiting by its well: the evening
};

const TAU = Math.PI * 2;

/** Its body, deck and view (before the player system: the Wraith rides this frame's pose). @param {any} g */
export async function addLongWalkerBody(g) {
  const { scene, atmosphere, shadows, bindShadows, ground, loop, clock, controller, engine, capture } = g;
  const walker = createWalker({ ground });
  const deck = createDeck(walker);
  controller.deck = deck;
  if (g.wraithGround) g.wraithGround.deck = deck;
  const { createShapedView } = await import('../render/shapedView.js');
  // Near and far views (as the Bellwether's): near, the finer clod gives its slabs flat faces and chipped edges.
  const view = createShapedView(scene, atmosphere, walker.chunks, { name: 'longWalker', subdivisions: 3 });
  bindShadows(view.material, shadows);
  shadows.addCaster(view.mesh, view.makeShadowMaterial, 1);
  view.freeze();
  const far = createShapedView(scene, atmosphere, walker.chunks, { name: 'longWalkerFar', subdivisions: 1 });
  bindShadows(far.material, shadows);
  shadows.addCaster(far.mesh, far.makeShadowMaterial, 2, 2);
  far.freeze();
  g.walker = walker; g.walkerDeck = deck; g.walkerView = view; g.walkerFar = far; g.walkerSys = walkerSys;
  const drawn = new Map();
  const setOn = (mesh, on) => {
    // Culled only after it has drawn for a while (pipelines are made while the loading screen is up).
    if (mesh.isEnabled()) drawn.set(mesh, (drawn.get(mesh) || 0) + 1);
    if (!on && (drawn.get(mesh) || 0) < 30) return;
    if (mesh.isEnabled() !== on) { mesh.setEnabled(on); engine.snapshotRenderingReset(); }
  };
  loop.add({ name: 'walkerBody', update: () => {
    if (!g.walkerPlaced) { deck.on = false; return; }
    walker.dt = clock.dt; walker.update();
    deck.on = walker.state !== WK.BURIED;
    deck.refY = controller.pos.y;
    // Drawn from afar (the erg's landmark): the near view within `near`, the far one beyond.
    const c = g.camera.position, d2 = (walker.x - c.x) ** 2 + (walker.z - c.z) ** 2;
    const shown = d2 < walkerSys.far * walkerSys.far || capture, near = d2 < walkerSys.near * walkerSys.near;
    setOn(view.mesh, shown && near); setOn(far.mesh, shown && !near);
    if (view.mesh.isEnabled()) view.update();
    if (far.mesh.isEnabled()) far.update();
  } });
}

/** The director. @param {any} g */
export function addLongWalkerSystem(g) {
  const { loop, walker: W, walkerDeck: deck, controller, clock, chapter, hud, music, combat, shaped, shapedMod, sfx, SFX, arm, terrainState: ts, ground, streamer, qs, capture, input, Action, params } = g;
  if (!W) return;
  const S = walkerSys, T = walkerTuning;
  const flags = chapter.graph.flags;
  const dev = qs ? qs.get('walker') : null;
  const spotId = (qs && qs.get('spot')) || '';
  const prints = trackPrints();
  const v3 = [0, 0, 0], tgt = [0, 0];
  let seed = 7311;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // Per-frame helpers take their numbers through fields (doubles passed as arguments are boxed when
  // V8 does not inline the call): F[0..3] a sound's x, y, z, gain; F[4..9] a dust burst's x, z, width,
  // half-length, direction x, z; W.io the body's point queries.
  const F = new Float64Array(10), io = W.io;
  const sound = (k) => { sfx.x = F[0]; sfx.y = F[1]; sfx.z = F[2]; sfx.gain = F[3]; sfx.play(k); };
  const soundW = (gain, k) => { F[0] = W.x; F[1] = W.y; F[2] = W.z; F[3] = gain; sound(k); };
  const dust = g.sandDust ? g.sandDust.bursts : null;
  function burst() {
    if (!dust) return;
    dust.time = clock.simTime; dust.x = F[4]; dust.z = F[5]; dust.width = F[6]; dust.halfLength = F[7]; dust.dx = F[8]; dust.dz = F[9]; dust.depth = 1; dust.kind = 0; dust.emit();
  }
  /** A burst at (x, z) w wide, len long, along (1, 0). */
  const at = () => { F[8] = 1; F[9] = 0; burst(); };
  /** Body-local (io[0..2]) → world (io[3..5]). */
  const local3 = () => W.toWorldQ();

  // ── The well, the anchor ─────────────────────────────────────────────────────────────────────
  let wellSet = false;
  function setWell() {
    ground.qx = CAMP_WELL[0]; ground.qz = CAMP_WELL[1];
    if (ground.covers && !ground.covers()) return;
    ground.sample(); W.setWell(CAMP_WELL[0], ground.h - 0.4, CAMP_WELL[1], CAMP_GATE_YAW); wellSet = true;
  }
  /** The ground is kept known round it by anchor patch 1 (re-centred when it has walked 40 m): AN[0..1] the
   *  centre, AN[2..3] the point wanted (fields, not arguments: it runs every frame). */
  const AN = new Float64Array([NaN, NaN, 0, 0]);
  function anchor() {
    const x = AN[2], z = AN[3];
    if ((x - AN[0]) * (x - AN[0]) + (z - AN[1]) * (z - AN[1]) < 40 * 40) return;
    AN[0] = Math.round(x); AN[1] = Math.round(z); streamer.setAnchor(1, AN[0], AN[1]);
  }

  // ── Placement (boot, load, dev) ──────────────────────────────────────────────────────────────
  /** A saved place ({ x, z, yaw, mode }) from a load, or null. */
  let saved = null, placed = false;
  const seatYaw = Math.atan2(CIRCUIT[1][0] - CIRCUIT[0][0], CIRCUIT[1][1] - CIRCUIT[0][1]);
  const pose = [0, 0, 0];
  function restSpot() {
    // Where it lies at rest: where it knelt (saved), else its kneeling place by the gate.
    if (saved) return { x: saved.x, z: saved.z, yaw: saved.yaw };
    W.setWell(CAMP_WELL[0], W.wellY, CAMP_WELL[1], CAMP_GATE_YAW); W.homePose(1, pose);
    return { x: pose[0], z: pose[1], yaw: pose[2] };
  }
  function tryPlace() {
    const released = flags.has(FLAG.RELEASED), woke = flags.has(FLAG.WOKE);
    let x = WALKER_SEAT[0], z = WALKER_SEAT[1], yaw = seatYaw;
    if (!wellSet) setWell();
    if (released && !wellSet) { AN[2] = CAMP_WELL[0]; AN[3] = CAMP_WELL[1]; anchor(); return false; }
    if (released) { const r = restSpot(); x = r.x; z = r.z; yaw = r.yaw; }
    else if (woke && saved) { x = saved.x; z = saved.z; yaw = saved.yaw; }
    AN[2] = x; AN[3] = z; anchor();
    ground.qx = x; ground.qz = z;
    if (ground.covers && !ground.covers()) return false;
    if (released) W.placeRested(x, z, yaw);
    else if (woke) { W.placeWalking(x, z, yaw); if (saved && saved.mode === MODE.STEER) { W.mode = MODE.STEER; W.targetYaw = yaw; } }
    else W.placeBuried(x, z, yaw);
    placed = true; g.walkerPlaced = true;
    return true;
  }

  // ── Frost bindings (the brush FREEZE, wherever it is cast): remembered for the stumble checks ──
  const FZ = 48, fzX = new Float64Array(FZ), fzZ = new Float64Array(FZ), fzR = new Float64Array(FZ), fzT = new Float64Array(FZ).fill(-1e9);
  let fzN = 0;
  if (ts && !ts._walkerWrapped) {
    const stamp = ts.stamp.bind(ts);
    ts.stamp = function () { if (ts.bk === BRUSH.FREEZE) { const k = fzN++ % FZ; fzX[k] = ts.bx; fzZ[k] = ts.bz; fzR[k] = Math.max(0.6, ts.bw) + Math.max(0, ts.bl || 0); fzT[k] = clock.simTime; } return stamp(); };
    ts._walkerWrapped = true;
  }

  // ── Why a foot landed wrong ('' when it did not) ──────────────────────────────────────────────
  const mass = g.stoneMass;
  /** (x, z, y) in L3. */
  const L3 = new Float64Array(3);
  function landedWrong() {
    const x = L3[0], z = L3[1], y = L3[2];
    if (mass && mass.count > 0) {
      for (let q = 0; q < 5; q++) {
        const a = q * TAU / 4, r = q === 4 ? 0 : S.padR * 0.7;
        mass.qx = x + Math.cos(a) * r; mass.qz = z + Math.sin(a) * r; mass.heightQ(); const h = mass.h;
        if (h > S.ridgeH) return 'ridge';
        if (h < -S.pitH) return 'pit';
      }
    }
    for (let k = 0; k < FZ; k++) {
      if (clock.simTime - fzT[k] > S.freezeLife) continue;
      const ddx = x - fzX[k], ddz = z - fzZ[k], rr = fzR[k] + S.padR;
      if (ddx * ddx + ddz * ddz < rr * rr) return 'frost';
    }
    ground.qx = x; ground.qz = z; ground.sample();
    const pdx = x - controller.pos.x, pdz = z - controller.pos.z;
    if (Math.abs(ground.h - y) > S.groundDelta && pdx * pdx + pdz * pdz < 30 * 30) return 'ground';
    return '';
  }

  // ── Interactables: the brake stone; the mirror-stones; waiting for the evening by its well ──────
  const targets = g.interactables;
  const brake = { kind: 'walker', id: 'walker-brake', verb: 'Touch', name: 'Brake stone', x: 0, y: 0, z: 0, r: 3.6, h: 2.6, hidden: true, onUse: () => wake() };
  const mirrors = [0, 1].map((k) => ({ kind: 'walker', id: 'walker-mirror-' + k, verb: 'Turn', name: 'Mirror-stone', x: 0, y: 0, z: 0, r: 2.3, h: 2.4, hy: 1.6, hidden: true, onUse: () => turnMirror(k) }));
  const wait = { kind: 'walker', id: 'walker-wait', verb: 'Wait for dusk', name: 'Its well', x: 0, y: 0, z: 0, r: 2.8, h: 1.2, hy: 1.6, hidden: true, onUse: () => waitDusk() };
  if (targets) targets.push(brake, ...mirrors, wait);

  /** The direction to the sun (render/environment.js), or null. */
  const sun = () => (g.env && g.env.env ? g.env.env.sunDir : null);
  const told = new Set();
  const tell = (key, title, sub, text, secs = 8) => { if (capture || told.has(key)) return; told.add(key); hud.notice(title, sub, text, secs); };

  function wake() {
    if (W.state !== WK.BURIED) return;
    W.wake(); flags.add(FLAG.WOKE); chapter.raise('walker:woke');
    // The Wraith catches its motion: Stone, and with it the sand, are lent.
    const fresh = g.elements && !g.elements.unlocked.has('stone');
    g.elements?.unlock('stone'); g.elements?.select('stone');
    music.sting?.('wake');
    soundW(2.4, SFX.RUMBLE);
    tell('wake', 'The Long Walker', 'It wakes', (fresh ? 'Its stride moves in the sand round you: you can bend it (Stone, key 3), and ride it (hold the traverse key on sand). ' : '') + 'Follow it.', 10);
  }
  function turnMirror(k) {
    if (W.state !== WK.HOME) return;
    W.mirrorYaw[k] = (W.mirrorYaw[k] + Math.PI / 4) % TAU;
    io[0] = MIRRORS[k][0]; io[1] = ROOF_Y + 2.5; io[2] = MIRRORS[k][1]; local3();
    F[0] = io[3]; F[1] = io[4]; F[2] = io[5]; F[3] = 1.0; sound(SFX.CLANG);
    const sd = sun(), sy = sd ? sd.y : 0.5;
    if (sy > S.sunLow[1]) tell('high', 'The mirror-stones', 'The sun stands too high', 'Its light falls past them onto the stone. The low sun of evening would reach in — or wait by the well on its back.', 9);
    else if (sy < S.sunLow[0]) tell('dark', 'The mirror-stones', 'No sun to catch', 'Wait for the evening by the well on its back.', 7);
  }
  function waitDusk() {
    params.v.timeOfDay = S.restHour; params.version++;
    if (g.weather) g.weather.snap = true;
    if (g.post) g.post.post.resetHistory = true;
    tell('waited', 'Its well', 'Evening', 'The low sun comes in level across the oasis.', 5);
  }

  // ── The release ──────────────────────────────────────────────────────────────────────────────
  let litT = 0, released = false;
  function startRelease() {
    released = true;
    W.release();
    flags.add(FLAG.RELEASED); chapter.raise('walker:released');
    worldState.restoration.dunes = 'restored';
    g.elements?.unlock('stone');
    g.calm?.note(controller.pos.x, controller.pos.z);
    musicOver = 'release'; musicUntil = clock.simTime + 50; music.rearm?.('release');
    hud.notice('The Long Walker', 'It lies down', 'It has come home. The wind returns to the erg; the dunes stream and walk again. Stone is yours, and the sand.', 10);
  }

  // ── Music: the pursuit's bed while it is chased; the release bed after ──────────────────────
  let musicOver = null, musicUntil = 0;
  { const d = Object.getOwnPropertyDescriptor(music, 'want'); let own = music.want;
    const get = d && d.get ? d.get : () => own, set = d && d.set ? d.set : (v) => { own = v; };
    Object.defineProperty(music, 'want', { configurable: true, get: () => (musicOver !== null ? musicOver : get()), set }); }

  // ── Save hooks ───────────────────────────────────────────────────────────────────────────────
  g.longWalker = {
    walker: W,
    serialize() { return placed && W.isAwake() ? { x: W.x, z: W.z, yaw: W.yaw, mode: W.mode === MODE.STEER ? MODE.STEER : MODE.CIRCUIT } : (placed && W.state === WK.RESTED ? { x: W.x, z: W.z, yaw: W.yaw, mode: 0 } : null); },
    restore(s) { saved = s && Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.yaw) ? s : null; placed = false; g.walkerPlaced = false; released = flags.has(FLAG.RELEASED); },
    get riding() { return deck.riding; },
  };

  // ── Compass: the next glass print; then the Walker; then the well ──────────────────────────
  if (g.navDynamic) {
    const goal = { x: 0, z: 0, name: '' };
    g.navDynamic['walker'] = () => {
      if (flags.has(FLAG.RELEASED)) return null;
      const p = controller.pos;
      if (flags.has(FLAG.BOARDED)) { goal.x = CAMP_WELL[0]; goal.z = CAMP_WELL[1]; goal.name = 'The dry well'; return goal; }
      if (flags.has(FLAG.WOKE)) { goal.x = W.x; goal.z = W.z; goal.name = 'The Long Walker'; return goal; }
      const pr = nextPrint(prints, p);
      if (pr) { goal.x = pr[0]; goal.z = pr[1]; goal.name = 'Glass footprint'; }
      else { goal.x = WALKER_SEAT[0]; goal.z = WALKER_SEAT[1]; goal.name = 'The star dune'; }
      return goal;
    };
  }

  // ── Frame ────────────────────────────────────────────────────────────────────────────────────
  let moundT = 0, devDone = false, circT = 0, shakeT = 20, warnT = -1, kickT = 0, balkT = -1, skitT = 30, offT = 0, ringT = 0, wakeFx = 0;
  let wasRiding = false, wasDying = false, shrineX = NaN, shrineZ = NaN, checkX = NaN, checkZ = NaN, glyphT0 = 0, glyphT1 = 0;
  const seen = new Uint32Array(64), gustSeen = new Uint32Array(8), ringed = new Uint8Array(6);
  const hasDust = (k) => W.swing[k] > 0.04 && W.swing[k] < 0.97;

  function devHooks() {
    devDone = true;
    if (!dev && !spotId.startsWith('p9-walker')) return;
    const mode = dev || spotId.replace('p9-walker-', '');
    if (mode === 'release') { flags.add(FLAG.WOKE); flags.add(FLAG.BOARDED); flags.add(FLAG.RELEASED); worldState.restoration.dunes = 'restored'; placed = false; g.walkerPlaced = false; return; }
    if (mode === 'buried') return;
    flags.add(FLAG.WOKE); g.elements?.unlock('stone');
    if (mode === 'wake') { flags.delete(FLAG.WOKE); return; }
    if (mode === 'home') {
      flags.add(FLAG.BOARDED);
      // 150 m out east of the camp, facing it: it turns home and walks to its kneeling place.
      saved = { x: CAMP_WELL[0] + 150, z: CAMP_WELL[1] - 20, yaw: -Math.PI / 2, mode: MODE.STEER };
    }
    placed = false; g.walkerPlaced = false;
  }

  loop.add({ name: 'longWalker', update: () => {
    const dt = clock.dt, p = controller.pos;
    if (!devDone) devHooks();
    if (!placed) { if (!tryPlace()) return; afterPlace(); }
    if (!wellSet) setWell();
    AN[2] = W.x + Math.sin(W.yaw) * 25; AN[3] = W.z + Math.cos(W.yaw) * 25; anchor();
    const ev = W.ev;
    const wdx = W.x - p.x, wdz = W.z - p.z, dist = Math.sqrt(wdx * wdx + wdz * wdz);
    const riding = deck.riding;

    // Where it walks: its circuit (refreshed now and then).
    circT -= dt;
    if (circT <= 0) { circT = 0.5; circuitTarget(W.x, W.z, tgt); W.circuitX = tgt[0]; W.circuitZ = tgt[1]; }

    // The brake stone (buried): a glyph that breathes, brighter as the Wraith comes near.
    brake.hidden = W.state !== WK.BURIED;
    if (W.state === WK.BURIED) {
      const c = Math.cos(W.yaw), s = Math.sin(W.yaw);
      brake.x = W.x + s * BRAKE_LOCAL[1]; brake.z = W.z + c * BRAKE_LOCAL[1];
      ground.qx = brake.x; ground.qz = brake.z; ground.sample(); brake.y = ground.h;
      const bdx = brake.x - p.x, bdz = brake.z - p.z;
      W.brake = 0.25 + 0.5 * Math.max(0, 1 - Math.sqrt(bdx * bdx + bdz * bdz) / 60) * (0.6 + 0.4 * Math.sin(clock.simTime * 2.2));
    }

    // The waking: dust pours off the mound, the ground shudders.
    if (W.state === WK.WAKING) {
      wakeFx -= dt;
      if (wakeFx <= 0) {
        wakeFx = 0.22;
        const a = rnd() * TAU, r = 18 + 10 * rnd();
        F[4] = W.x + Math.cos(a) * r; F[5] = W.z + Math.sin(a) * r; F[6] = 5 + 4 * rnd(); F[7] = 4; F[8] = Math.cos(a); F[9] = Math.sin(a); burst();
        if (dist < 300) arm.shake += 0.012 * Math.max(0, 1 - dist / 300);
        if (rnd() < 0.3) soundW(1.8, SFX.RUMBLE);
      }
    }
    if (ev & WEV.WOKEN) tell('woken', 'The Long Walker', 'It walks its old circuit', 'It does not fight. Bring it down: change the ground where a foot will land — a Ridge under it, a Bloom\'s pit, or sand bound hard with Frost. Each lifted foot shows where it will come down.', 12);

    // Footfalls: the sand thrown, the ground shaken; a foot that lands wrong buckles.
    for (let i = 0; i < W.landN; i++) {
      const k = W.landLeg[i], x = W.landX[i], y = W.landY[i], z = W.landZ[i];
      const ldx = x - p.x, ldz = z - p.z, d = Math.sqrt(ldx * ldx + ldz * ldz);
      if (d < 600) {
        F[4] = x; F[5] = z; F[6] = 5.5; F[7] = 3; at(); F[6] = 3.5; F[7] = 6; F[8] = Math.sin(W.yaw); F[9] = Math.cos(W.yaw); burst();
        F[0] = x; F[1] = y; F[2] = z; F[3] = Math.max(0.2, 1.6 - d / 260); sound(SFX.BOOM);
        if (d < 160) arm.shake += 0.03 * (1 - d / 160);
        // A footprint pressed into the sand, and its rim thrown up (the sand round it slumps).
        if (d < 40 && ts) { ts.bx = x; ts.bz = z; ts.bdx = Math.sin(W.yaw); ts.bdz = Math.cos(W.yaw); ts.bl = 1.2; ts.bw = 2.6; ts.bd = 0.7; ts.bc = 0.6; ts.bk = BRUSH.PLOUGH; ts.bwet = 0; ts.bbias = 0; ts.bberm = 1.2; ts.stamp(); }
        // Crushed: the Wraith under the foot is hurt and thrown.
        if (d < S.crushR && !riding && p.y < y + 3 && combat && combat.dying === 0 && !controller.god) {
          combat.hurtRaw(S.crushDamage);
          const ox = (p.x - x) / (d || 1), oz = (p.z - z) / (d || 1);
          controller.vel.x += ox * S.crushShove; controller.vel.z += oz * S.crushShove; controller.vel.y = Math.max(controller.vel.y, 6); controller.grounded = false;
          F[0] = p.x; F[1] = p.y; F[2] = p.z; F[3] = 1.4; sound(SFX.THUD);
        }
      }
      if (W.state === WK.WALK) {
        L3[0] = x; L3[1] = z; L3[2] = y; const why = landedWrong();
        if (why && W.stumble(k)) {
          checkX = W.x + (W.R[0] * SIDE[k]) * 40; checkZ = W.z + (W.R[2] * SIDE[k]) * 40;
          F[0] = x; F[1] = y; F[2] = z; F[3] = 2.2; sound(SFX.CRUNCH); soundW(2.0, SFX.RUMBLE);
          for (let q = 0; q < 6; q++) { F[4] = x + (rnd() - 0.5) * 10; F[5] = z + (rnd() - 0.5) * 10; F[6] = 6; F[7] = 5; at(); }
          arm.shake += 0.06;
          tell('stumble', 'The Long Walker', why === 'frost' ? 'Its foot slips on the bound sand' : why === 'ridge' ? 'Its foot comes down on the ridge' : why === 'pit' ? 'Its foot drops into the pit' : 'The ground gives under its foot',
            'It kneels. Its leg and flank are plated with ruin stone — climb onto its back before it rises.', 9);
        }
      }
    }
    if (ev & WEV.RISE_WARN && dist < 400) soundW(1.8, SFX.RUMBLE);

    // The telegraph: where each lifted foot will come down the sand feels it — a dotted ring pressed in
    // as it lifts (the terrain state, within its window round the Wraith; the landing ploughs it away)
    // and dust lifting off round the ring while it swings.
    for (let k = 0; k < 6; k++) {
      if (W.swing[k] === 0) { ringed[k] = 0; continue; }
      if (ringed[k] || !hasDust(k) || W.state !== WK.WALK || !ts) continue;
      ringed[k] = 1;
      const rx = W.tx[k] - p.x, rz = W.tz[k] - p.z;
      if (Math.abs(rx) > 36 || Math.abs(rz) > 36) continue;
      for (let q = 0; q < 12; q++) {
        const b = q * TAU / 12;
        ts.bx = W.tx[k] + Math.cos(b) * S.padR; ts.bz = W.tz[k] + Math.sin(b) * S.padR; ts.bdx = -Math.sin(b); ts.bdz = Math.cos(b);
        ts.bl = 0.25; ts.bw = 0.32; ts.bd = 0.14; ts.bc = 0.5; ts.bk = BRUSH.PRESS; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0.6; ts.stamp();
      }
    }
    ringT -= dt;
    if (ringT <= 0 && dist < 260 && W.state === WK.WALK) {
      ringT = 0.2;
      for (let k = 0; k < 6; k++) {
        if (!hasDust(k)) continue;
        const a = clock.simTime * 2.1 + k;
        for (let q = 0; q < 4; q++) { const b = a + q * TAU / 4; F[4] = W.tx[k] + Math.cos(b) * S.padR; F[5] = W.tz[k] + Math.sin(b) * S.padR; F[6] = 2.0; F[7] = 1.0; F[8] = -Math.sin(b); F[9] = Math.cos(b); burst(); }
      }
    }

    // On its back.
    if (riding && !wasRiding) {
      if (!flags.has(FLAG.BOARDED)) { flags.add(FLAG.BOARDED); chapter.raise('walker:boarded'); if (!capture) g.game?.saves?.requestAutosave(); }
      tell('board', 'The Long Walker', 'On its back', 'Strike a glyph pillar with a Shard (or a Gust) to turn it toward that side. Bring it home to the dry well at the Wellhouse — west, round the Stride.', 11);
    }
    wasRiding = riding;
    if (riding) offT = 0; else offT += dt;
    if (W.mode === MODE.STEER && offT > S.steerIdle) W.toCircuit();

    // Steering: a Shard or a Gust against a glyph pillar turns it toward that pillar's side.
    if (W.state === WK.WALK || W.state === WK.RISE) {
      const st = g.stone, gl = g.gale;
      for (let k = 0; k < 2; k++) {
        io[0] = PILLARS[k][0]; io[1] = 3.2; io[2] = PILLARS[k][1]; local3(); v3[0] = io[3]; v3[1] = io[4]; v3[2] = io[5];
        let hit = false;
        if (st && st.shardOn) for (let q = 0; q < st.shardOn.length && q < 64; q++) {
          if (!st.shardOn[q] || seen[q] === st.shardId[q]) continue;
          const dx = st.shardX[q] - v3[0], dz = st.shardZ[q] - v3[2], dy = st.shardY[q] - v3[1];
          // (A Shard is a plate torn from the sand under the thrower: from its back it flies far below the pillar, so only its line counts.)
          if (dx * dx + dz * dz < 1.8 * 1.8 && (riding || Math.abs(dy) < 3.8)) { seen[q] = st.shardId[q]; hit = true; }
        }
        if (gl && gl.gustActive) for (let q = 0; q < gl.gustActive.length && q < 8; q++) {
          if (!gl.gustActive[q] || gustSeen[q] === gl.gustId[q]) continue;
          const dx = gl.gustFX[q] - v3[0], dz = gl.gustFZ[q] - v3[2];
          if (dx * dx + dz * dz < (gl.gustHW[q] + 1.2) ** 2) { gustSeen[q] = gl.gustId[q]; hit = true; }
        }
        if (hit) {
          W.steer(k === 0 ? -1 : 1);
          if (k === 0) glyphT0 = 1.6; else glyphT1 = 1.6;
          F[0] = v3[0]; F[1] = v3[1] + 3; F[2] = v3[2]; F[3] = 1.5; sound(SFX.TOLL); F[3] = 1.0; sound(SFX.CHIME);
          tell('steer', 'The Long Walker', 'The pillar sings', 'It turns toward the side you struck.', 5);
        }
      }
    }
    glyphT0 = Math.max(0, glyphT0 - dt); glyphT1 = Math.max(0, glyphT1 - dt);
    W.glyph0 = 0.15 + glyphT0 * 0.8; W.glyph1 = 0.15 + glyphT1 * 0.8;

    // It shakes now and then while carried: a groan and sand pouring off the walls, then the court
    // rocks; stone at hand (a wall, a pillar, the well) is something to brace against.
    if (W.state === WK.WALK && riding) {
      shakeT -= dt;
      if (shakeT <= 0 && warnT < 0) { warnT = S.shakeWarn; soundW(1.6, SFX.RUMBLE); }
    }
    if (warnT >= 0) {
      warnT -= dt;
      if (rnd() < 0.35) { io[0] = (rnd() < 0.5 ? -1 : 1) * DECK_X; io[1] = 2.4; io[2] = (rnd() - 0.5) * 2 * DECK_Z; local3(); F[4] = io[3]; F[5] = io[5]; F[6] = 1.6; F[7] = 3; at(); }
      if (warnT < 0) { W.shakeAmp = 0.065; W.shakeT = S.shakeTime; shakeT = S.shakeEvery[0] + rnd() * (S.shakeEvery[1] - S.shakeEvery[0]); kickT = 0.2; tell('shake', 'The Long Walker', 'It shakes', 'Keep close to stone — a wall, a pillar, the well — and it cannot throw you.', 6); }
    }
    if (W.shakeT > 0 && riding && controller.grounded && W.state !== WK.BALK) {
      kickT -= dt;
      if (kickT <= 0) {
        kickT = 0.45;
        const R = W.R, low = R[1] > 0 ? -1 : 1;      // the side rolled down
        const k = braced() ? S.brace : 1;
        controller.vel.x += R[0] * low * S.shakeKick * k; controller.vel.z += R[2] * low * S.shakeKick * k;
      }
    }
    // Balking at the rift: it throws everyone off and goes back to its circuit.
    if (ev & WEV.BALK) { balkT = 0.5; soundW(2.2, SFX.RUMBLE); tell('balk', 'The Long Walker', 'It will not cross the Stride', 'It shakes you off and turns back to its circuit. Stumble it again; turn it sooner, round the rift\'s end.', 9); }
    if (balkT >= 0) {
      balkT -= dt;
      if (balkT < 0 && riding) {
        // Thrown clear over the nearer side: the deck lets it through for a moment (its walls would catch it).
        io[0] = p.x; io[1] = p.y; io[2] = p.z; W.toLocalQ();
        const s = io[3] >= 0 ? 1 : -1;
        deck.ghostT = 1.2; deck.riding = false;
        controller.vel.x = W.R[0] * s * S.balkKick; controller.vel.z = W.R[2] * s * S.balkKick; controller.vel.y = 9; controller.grounded = false;
        arm.shake += 0.05;
      }
    }

    // Skitters ride the dust of its wake while it is chased (not while it is ridden).
    if (W.state === WK.WALK && !riding && dist < S.skitterNear && dist > 35) {
      skitT -= dt;
      if (skitT <= 0) {
        skitT = S.skitterEvery[0] + rnd() * (S.skitterEvery[1] - S.skitterEvery[0]);
        const E = shapedMod.S.EMPTY;
        if (hasSpawnRoom(shaped, E, 2) && !g.calm?.holds(p.x, p.z)) {
          const bx = W.x - Math.sin(W.yaw) * 30, bz = W.z - Math.cos(W.yaw) * 30;
          for (let q = 0; q < 2; q++) shaped.spawn('skitter', bx + Math.cos(W.yaw) * (q ? 9 : -9), bz - Math.sin(W.yaw) * (q ? 9 : -9));
        }
      }
    }

    // Home: kneeling by the well; the mirror-stones; the light into the shaft; the release.
    const home = W.state === WK.HOME;
    if (ev & WEV.HOME) tell('home', 'The Long Walker', 'It kneels by the dry well', 'It will not lie down while the shaft is dark. Turn the two mirror-stones on its roof so the low sun goes from one to the other and down into the well.', 12);
    for (let k = 0; k < 2; k++) {
      const m = mirrors[k]; m.hidden = !home || !riding;
      io[0] = MIRRORS[k][0]; io[1] = ROOF_Y; io[2] = MIRRORS[k][1]; local3(); m.x = io[3]; m.y = io[4]; m.z = io[5];
    }
    const sdn = sun();
    wait.hidden = !home || !riding || (sdn !== null && sdn.y > S.sunLow[0] && sdn.y < S.sunLow[1]);
    io[0] = WELL_LOCAL[0]; io[1] = 0; io[2] = WELL_LOCAL[1]; local3(); wait.x = io[3]; wait.y = io[4]; wait.z = io[5];
    let lit0 = false, lit1 = false;
    if (home && !released && sdn !== null) {
      const sd = sdn, low = sd.y > S.sunLow[0] && sd.y < S.sunLow[1];
      const sl = Math.sqrt(sd.x * sd.x + sd.z * sd.z) || 1;
      io[0] = MIRRORS[0][0]; io[1] = 0; io[2] = MIRRORS[0][1]; local3(); const m0x = io[3], m0z = io[5];
      io[0] = MIRRORS[1][0]; io[1] = 0; io[2] = MIRRORS[1][1]; local3(); const m1x = io[3], m1z = io[5];
      // Mirror 0 turns the sun toward mirror 1 (its face halfway between them); mirror 1 sends it down the well.
      let ax2 = m1x - m0x, az2 = m1z - m0z, al = Math.sqrt(ax2 * ax2 + az2 * az2) || 1; ax2 /= al; az2 /= al;
      let bx2 = W.wellX - m1x, bz2 = W.wellZ - m1z; const bl = Math.sqrt(bx2 * bx2 + bz2 * bz2) || 1; bx2 /= bl; bz2 /= bl;
      F[4] = sd.x / sl + ax2; F[5] = sd.z / sl + az2; lit0 = low && facing(0);
      F[4] = bx2 - ax2; F[5] = bz2 - az2; lit1 = lit0 && facing(1);
    }
    W.beam0 = lit0 ? 1 : 0; W.beam1 = lit1 ? 1 : 0;
    if (lit0 && !told.has('lit0')) { tell('lit0', 'The mirror-stones', 'The first catches the sun', 'Turn the second to send it down into the well.', 6); }
    litT = lit1 ? litT + dt : 0;
    W.wellEye += ((lit1 || released ? 1.2 : 0) - W.wellEye) * Math.min(1, dt * 2);
    if (litT > S.litHold && !released) startRelease();
    if (ev & WEV.RESTED && !capture) g.game?.saves?.requestAutosave();
    // Lying down it becomes a dune range: sand heaped along its flanks and over its court (the terrain
    // state, within its window round the Wraith; the relaxation slumps the heaps to the sand's repose).
    if (W.state === WK.RELEASE && W.t > 5 && W.t < 15 && ts) {
      moundT -= dt;
      if (moundT <= 0) {
        moundT = 0.2;
        const side = rnd() < 0.5 ? -1 : 1, onTop = rnd() < 0.3;
        io[0] = onTop ? (rnd() - 0.5) * 16 : side * (15 + 5 * rnd()); io[1] = 0; io[2] = (rnd() - 0.5) * 40; local3();
        v3[0] = io[3]; v3[2] = io[5];
        if (Math.abs(v3[0] - p.x) < 36 && Math.abs(v3[2] - p.z) < 36) {
          ts.bx = v3[0]; ts.bz = v3[2]; ts.bdx = Math.sin(W.yaw); ts.bdz = Math.cos(W.yaw); ts.bl = 4; ts.bw = onTop ? 4 : 5.5; ts.bd = onTop ? 1.2 : 1.8; ts.bc = 0.5;
          ts.bk = BRUSH.MOUND; ts.bwet = 0; ts.bbias = 0; ts.bberm = 0; ts.stamp();
          if (rnd() < 0.4) { F[4] = v3[0]; F[5] = v3[2]; F[6] = 5; F[7] = 3; at(); }
        }
      }
    }

    // Dying near it: back by the last place it knelt (a checkpoint), not the far shrine.
    const dying = combat && combat.dying > 0;
    if (dying && !wasDying && W.isAwake() && dist < 600 && Number.isFinite(checkX)) {
      shrineX = combat.shrineX; shrineZ = combat.shrineZ; combat.shrineX = checkX; combat.shrineZ = checkZ;
    }
    if (!dying && wasDying && Number.isFinite(shrineX)) { combat.shrineX = shrineX; combat.shrineZ = shrineZ; shrineX = NaN; }
    wasDying = dying;

    // Music.
    if (musicOver === 'release' && clock.simTime > musicUntil) musicOver = null;
    else if (musicOver !== 'release') musicOver = W.isAwake() && !riding && dist < 260 && W.state !== WK.HOME && !(combat && combat.dying > 0) ? 'fight' : null;
  } });

  function afterPlace() {
    released = flags.has(FLAG.RELEASED);
    if (released) W.wellEye = 1.2;
  }
  /** Mirror k's face points within the tolerance of the horizontal direction (F[4], F[5]). */
  function facing(k) {
    const dx = F[4], dz = F[5];
    const a = W.mirrorYaw[k], R = W.R;
    const nx = R[0] * Math.sin(a) + R[6] * Math.cos(a), nz = R[2] * Math.sin(a) + R[8] * Math.cos(a);
    const want = Math.atan2(dx, dz), have = Math.atan2(nx, nz);
    let d = want - have; d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
    return Math.abs(d) < S.mirrorTol;
  }
  /** Within reach of stone on its back (a wall, a pillar, the well, a pier): braced against a shake. */
  function braced() {
    const p = controller.pos;
    io[0] = p.x; io[1] = p.y; io[2] = p.z; W.toLocalQ();
    for (let i = 1; i < W.nBox; i++) {
      if (!W.bon[i] || W.by1[i] < 0.8 || W.by0[i] > io[4] + 1) continue;
      const dx = Math.abs(io[3] - W.bx[i]) - W.bhx[i], dz = Math.abs(io[5] - W.bz[i]) - W.bhz[i];
      if (Math.max(dx, dz) < S.braceR) return true;
    }
    return false;
  }
  void HIP_Z; void input; void Action;
}
