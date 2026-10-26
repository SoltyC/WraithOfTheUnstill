// Shared by the restored-world bots (tools/bot/restored-*.mjs): set the world as a release leaves it, and a soaring pilot that
// flies a glide course in the page (heads for the next target; when it cannot be reached in still air it works the nearest
// stream up and down its line until it can glide on: the rule the player has to learn). Run the game first:
//   PORT=4176 tools/bot/play.sh p8-meadow-golden   then   WRAITH_URL=http://localhost:4176 node tools/bot/restored-<piece>.mjs
import { bot, js } from './client.mjs';

export { bot, js };
export const T0 = Date.now();
export const say = (...a) => console.log(((Date.now() - T0) / 1000).toFixed(0).padStart(4) + 's', ...a);
export const wait = (ms) => bot('wait', { ms });
export const shot = (name, extra = {}) => bot('shot', { name, dir: 'restored', ...extra });
let bad = 0;
export const ok = (c, m) => { say(c ? 'OK  ' : 'FAIL', m); if (!c) { bad++; process.exitCode = 1; } return c; };
export const quest = (id) => js(`const q=g.chapter.graph.quests['${id}']; return q.state+(q.state==='active'?':'+g.chapter.graph.byId.get('${id}').steps[q.step].id:'')`);
export const vars = () => js(`return g.chapter.graph.vars`);
export const flags = (re) => js(`return [...g.chapter.graph.flags].filter(f=>/${re}/.test(f))`);

/** A restored save: both Wardens released, the fire night over (stair open), the first side errands done, the Gale in hand. */
export async function restoredWorld({ hour = 13, side = true } = {}) {
  await js(`const f=g.chapter.graph.flags; for (const x of ['meadow:guide-lead','meadow:arrived','meadow:raid','meadow:raid-lit','meadow:fires-out','meadow:ebb-saved','meadow:stair-open','meadow:bellwether-woke','meadow:bellwether-released'${side ? ",'meadow:side-glide-thanked','meadow:side-flock-thanked','meadow:side-lamp-thanked'" : ''}]) f.add(x);
    g.ws.restoration.frost='restored'; g.ws.restoration.meadow='restored'; g.restoration.snap = true; g.elements.unlock('gale');
    g.compass.mode='always'; g.params.v.timeOfDay=${hour}; g.params.version++; g.clock.pinHour=null; return 1`);
  await wait(2500);
}
export async function at(x, z, faceX, faceZ, ms = 3500) {
  await bot('teleport', { x, z }); await wait(ms);
  if (faceX !== undefined) await bot('face', { x: faceX, z: faceZ, pitch: 0.1 });
}

/**
 * The soaring pilot, as page code. `targets`: an expression giving the current target { x, y, z, r } (y: the height to pass at),
 * `done`: an expression true when the course is over, `streams`: the list the pilot may work (page expression).
 * Returns { ms, landed, where, reached } when done or when the time is up.
 */
export const pilot = ({ targets, done, streams = 'g.streams.list.filter(s => g.restoration[s.biome] > 0.5)', maxMs = 150000, launch = true, log = false }) => `
  const w = window.__wraith, inj = (k, d) => w.inject(k, d), c = g.controller, gl = c.glide, st = g.streams;
  const RATIO = 7.2 * 0.92, sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const lines = ${streams};
  const t0 = performance.now(); let soar = null, dir = 1, flown = false, reached = 0, last = null, lt = 0, frame = 0, turned = 0; const trace = [];
  const groundAt = (x, z) => { g.ground.qx = x; g.ground.qz = z; g.ground.sample(); return g.ground.h; };
  const distTo = (s, x, z) => st.distance(st.list.indexOf(s), x, z);
  ${launch ? `inj('MoveForward', true); await sleep(250);` : `inj('Traverse', true);`}
  while (performance.now() - t0 < ${maxMs}) {
    await new Promise(r => requestAnimationFrame(r));
    const p = c.pos, T = ${targets}; if (${done}) break;
    if (!T) break;
    const gh = groundAt(p.x, p.z), agl = p.y - gh;
    // On snow a held Traverse is the surf: hold it only once the feet are off the ground.
    if (${launch}) inj('Traverse', !c.grounded && !c.swimming);
    if (gl.active) flown = true;
    if (flown && !gl.active && c.grounded) break;
    let tx = T.x, tz = T.z, dive = false, flare = false;
    const dist = Math.hypot(T.x - p.x, T.z - p.z), reach = (p.y - (T.y - T.r * 0.6)) * RATIO / 1.15;
    if (gl.active && dist > reach && lines.length) {
      let best = null, bc = 1e9;
      for (const s of lines) {
        const d = distTo(s, p.x, p.z); let ed = 1e9; for (const q of s.pts) ed = Math.min(ed, Math.hypot(q[0] - T.x, q[1] - T.z));
        if (d < agl * RATIO * 0.75 + 40 && d + ed < bc) { bc = d + ed; best = s; }
      }
      if (best) {
        // Work the line's middle two thirds, offset downhill off the face; turn at either end with room to turn (hysteresis).
        soar = best; const P = best.pts, a = P[0], b = P[P.length - 1];
        const e = dir > 0 ? [a[0] + (b[0] - a[0]) * 0.8, a[1] + (b[1] - a[1]) * 0.8] : [a[0] + (b[0] - a[0]) * 0.2, a[1] + (b[1] - a[1]) * 0.2];
        const gx = groundAt(e[0] + 10, e[1]) - groundAt(e[0] - 10, e[1]), gz = groundAt(e[0], e[1] + 10) - groundAt(e[0], e[1] - 10), gm = Math.hypot(gx, gz) || 1;
        tx = e[0] - gx / gm * 28; tz = e[1] - gz / gm * 28;
        if ((Math.hypot(tx - p.x, tz - p.z) < 70 || agl < 22) && performance.now() - turned > 3500) { dir = -dir; turned = performance.now(); }
        flare = false;
      }
    } else { soar = null; dive = (p.y - T.y) > dist / RATIO * 1.5; }
    // Terrain avoidance: close to the ground the pilot turns downhill (a ridge pilot never flies at the face).
    if (gl.active && agl < 16) { const gx = groundAt(p.x + 10, p.z) - groundAt(p.x - 10, p.z), gz = groundAt(p.x, p.z + 10) - groundAt(p.x, p.z - 10), gm = Math.hypot(gx, gz) || 1; tx = p.x - gx / gm * 60; tz = p.z - gz / gm * 60; }
    const want = Math.atan2(tx - p.x, tz - p.z), have = gl.active ? gl.heading : c.yaw;
    let d = want - have; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
    // The keys bank the robe at a fixed 0.75: pulse them for a finer line (duty = how far off the heading is).
    const duty = Math.min(1, Math.abs(d) / 0.35), on = (frame++ % 5) < Math.round(duty * 5);
    inj('MoveLeft', gl.active && d < 0 && on); inj('MoveRight', gl.active && d > 0 && on);
    inj('MoveForward', ${launch ? '!gl.active || dive' : 'dive'}); inj('MoveBack', flare);
    if (gl.active) g.arm.yaw = want;
    ${launch ? `inj('Jump', !flown && c.grounded && (Math.floor((performance.now() - t0) / 400) % 3 === 0));` : ''}
    last = [Math.round(p.x), Math.round(p.y), Math.round(p.z)];
    ${log ? `if (performance.now() - lt > 1000) { lt = performance.now(); trace.push([Math.round((lt - t0) / 1000), ...last, Math.round(agl), +gl.rise.toFixed(1), +st.total.toFixed(1), +g.wind.speed.toFixed(2), +gl.speed.toFixed(1), +gl.vy.toFixed(1), soar && soar.id.slice(-4), Math.round(Math.hypot(T.x - p.x, T.z - p.z)), Math.round(T.y), gl.active ? 1 : 0]); }` : ''}
  }
  for (const k of ['MoveForward','MoveBack','MoveLeft','MoveRight','Traverse','Jump']) inj(k, false);
  const q = c.pos;
  return { ms: Math.round(performance.now() - t0), landed: c.grounded, at: [Math.round(q.x), Math.round(q.y), Math.round(q.z)], soar: soar && soar.id, trace };
`;
export const endBot = () => { if (bad) say(bad + ' check(s) failed'); };
