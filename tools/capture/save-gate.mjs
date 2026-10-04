// Phase 7 gate, automated part (BRIEF §17): leave marks in the world, save, reload the page,
// load, and check every mark is where it was left.
//   Session 1: at the start (A) press a crater, a trail and an ice formation, and release a
//   Warden there; walk away to B (450 m) so A's page is evicted to the worker; press a crater at
//   B (its page stays resident); save.
//   Session 2 (a fresh page, same browser profile): load; check B's crater, the formation and the
//   rested Warden; go back to A; check its crater and trail (the evicted path).
//   node tools/capture/save-gate.mjs [--width=320 --height=180] [--skip-build]
// Exit code 0 on pass. Software rendering is slow: allow about an hour.

import { startServer, launchBrowser, openGame, parseArgs } from './harness.mjs';

const args = parseArgs();
const W = +(args.width || 320), H = +(args.height || 180);
const server = await startServer({ skipBuild: !!args['skip-build'] });
const browser = await launchBrowser(args);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let ok = true;
const check = (name, pass, detail) => { log(pass ? 'PASS' : 'FAIL', name, detail ?? ''); if (!pass) ok = false; };
const QUERY = 'snapshot=1&title=0';

const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = n; const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
/** Wait for the world to settle, reporting what it still waits on once a minute. */
async function settled(page) {
  for (let k = 0; k < 120; k++) {
    const st = await page.evaluate(() => {
      const w = window.__wraith, g = w.game, c = g.controller.pos;
      return { ok: g.worldSettled(), pendingNear: g.streamer.pendingNear(c.x, c.z), arrived: g.streamer.arrived.length, pages: w.terrainState.pendingPages, brushes: w.terrainState.pendingBrushes, stats: w.terrainState.stats, pos: [c.x, c.y, c.z] };
    });
    if (st.ok) return;
    if (k > 0) log('waiting to settle', JSON.stringify(st));
    await page.waitForTimeout(k === 0 ? 5000 : 60000);
  }
  throw new Error('world never settled');
}
const goTo = async (page, x, z) => { await page.evaluate(([x, z]) => window.__wraith.game.teleport(x, z), [x, z]); await frames(page, 5); await settled(page); await frames(page, 20); };
const probe = (page, p) => page.evaluate(async (p) => window.__wraith.terrainState.debugProbe(p.x, p.z), p);
const stamp = (page, p, w, d) => page.evaluate(([p, w, d]) => { const ts = window.__wraith.terrainState; ts.bx = p.x; ts.bz = p.z; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = w; ts.bd = d; ts.bc = 0.9; ts.stamp(); }, [p, w, d]);
const near = (a, b, tol) => a !== null && b !== null && a !== undefined && b !== undefined && Math.abs(a - b) <= tol;

try {
  // ---- Session 1. One browser context for both sessions: the save lives in its IndexedDB.
  let { page, context } = await openGame(browser, server.url, QUERY, { width: W, height: H });
  page.on('pageerror', (e) => log('pageerror', e.message));
  log('booted');
  const A = await page.evaluate(() => { const c = window.__wraith.game.controller.pos; return { x: c.x, z: c.z }; });
  const M = { craterA: { x: A.x + 6, z: A.z + 3 }, trailA: { x: A.x - 1, z: A.z - 5 }, B: { x: A.x, z: A.z - 450 } };
  M.craterB = { x: M.B.x + 5, z: M.B.z + 2 };
  await stamp(page, M.craterA, 1.4, 0.5);
  await page.evaluate((A) => {
    const w = window.__wraith, ts = w.terrainState;
    for (let k = 0; k < 12; k++) { ts.bx = A.x - 4 + k * 0.6; ts.bz = A.z - 5; ts.bdx = 1; ts.bdz = 0; ts.bl = 0.3; ts.bw = 0.25; ts.bd = 0.12; ts.bc = 0.8; ts.stamp(); }
    const f = w.frost, c = w.game.controller.pos; f.tx = A.x - 5; f.ty = c.y; f.tz = A.z + 6; f.castCrystal = true;
    w.game.spawnWarden();
  }, A);
  await frames(page, 30);
  await page.evaluate(() => window.__wraith.game.releaseWarden());
  await frames(page, 10);
  await page.evaluate(() => window.__wraith.warden.finishRelease());
  await frames(page, 10);
  const atA = { crater: await probe(page, M.craterA), trail: await probe(page, M.trailA) };
  log('marks at A', JSON.stringify(atA));
  // Walk away: A's page leaves the window (its marks go down into the page) and is evicted.
  await goTo(page, M.B.x, M.B.z);
  await stamp(page, M.craterB, 1.2, 0.45);
  await frames(page, 20);
  await page.evaluate(() => window.__wraith.terrainState.debugEvictFar());
  await frames(page, 20);
  const before = await page.evaluate(async (M) => {
    const w = window.__wraith, ok = await w.game.saves.save('slot1');
    return { ok, err: String(w.game.saves.lastError || ''), craterB: await w.terrainState.debugProbe(M.craterB.x, M.craterB.z), stats: w.terrainState.stats,
      crystals: w.frost.serializeCrystals(0).length, warden: { state: w.warden.state, x: w.warden.body.x, z: w.warden.body.z } };
  }, M);
  log('saved', JSON.stringify(before));
  check('save succeeded', before.ok, before.err);
  check('page A was evicted before saving', before.stats.stored >= 1, JSON.stringify(before.stats));
  await page.close();

  // ---- Session 2: a fresh page; load the slot.
  page = await context.newPage();
  page.on('pageerror', (e) => log('pageerror', e.message));
  await page.goto(server.url + '?' + QUERY);
  await page.waitForFunction(() => window.__wraith && (window.__wraith.ready || window.__wraith.error), null, { timeout: 3600000, polling: 500 });
  log('rebooted');
  const fresh = await probe(page, M.craterA);
  check('a fresh page starts without the marks', !fresh || !(fresh.coarse > 0.05), JSON.stringify(fresh));
  await page.evaluate(() => window.__wraith.game.saves.load('slot1'));
  await frames(page, 5);
  await settled(page);
  await frames(page, 30);
  const after = await page.evaluate(async (M) => {
    const w = window.__wraith;
    return { craterB: await w.terrainState.debugProbe(M.craterB.x, M.craterB.z), crystals: w.frost.serializeCrystals(0).length,
      warden: { active: w.warden.active, state: w.warden.state, x: w.warden.body.x, z: w.warden.body.z }, pos: [w.game.controller.pos.x, w.game.controller.pos.z] };
  }, M);
  log('loaded', JSON.stringify(after));
  check('the Wraith is back where it was saved', Math.hypot(after.pos[0] - M.B.x, after.pos[1] - M.B.z) < 3, JSON.stringify(after.pos));
  check('crater at B (resident page) persists', near(after.craterB.coarse, before.craterB.coarse, 0.02), `${before.craterB.coarse} → ${after.craterB.coarse}`);
  check('ice formation persists', after.crystals === before.crystals && before.crystals > 1, `${before.crystals} → ${after.crystals}`);
  check('the Warden rests where it was released', after.warden.active && after.warden.state === 5 && Math.hypot(after.warden.x - before.warden.x, after.warden.z - before.warden.z) < 3, JSON.stringify(after.warden));
  // Back to A: its page comes back from the saved store (the evicted path).
  await goTo(page, A.x, A.z);
  const backA = { crater: await probe(page, M.craterA), trail: await probe(page, M.trailA) };
  log('back at A', JSON.stringify(backA));
  check('crater at A (evicted page) persists', near(backA.crater.coarse, atA.crater.fine, 0.05), `${atA.crater.fine} → ${backA.crater.coarse}`);
  check('trail at A persists', backA.trail.coarse > 0.04, `${atA.trail.fine} → ${backA.trail.coarse}`);
} catch (e) {
  console.error(e); ok = false;
} finally {
  await browser.close(); await server.close();
}
log(ok ? 'GATE PASS' : 'GATE FAIL');
process.exit(ok ? 0 : 1);
