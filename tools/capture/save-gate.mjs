// Phase 7 gate, automated part (BRIEF §17): leave marks in the world — a trail beside the player,
// a crater far enough away that its page is evicted to the worker, an ice formation, a released
// Warden — save, reload the page, load, and check every mark is where it was left.
//   node tools/capture/save-gate.mjs [--width=320 --height=180]
// Exit code 0 on pass. Software rendering is slow: allow tens of minutes.

import { startServer, launchBrowser, openGame, parseArgs } from './harness.mjs';

const args = parseArgs();
const W = +(args.width || 320), H = +(args.height || 180);
const server = await startServer({ skipBuild: !!args['skip-build'] });
const browser = await launchBrowser(args);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let ok = true;
const check = (name, pass, detail) => { log(pass ? 'PASS' : 'FAIL', name, detail ?? ''); if (!pass) ok = false; };

const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = n; const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
/** Wait for the world to settle, reporting what it still waits on once a minute. */
async function settled(page) {
  for (let k = 0; k < 120; k++) {
    const st = await page.evaluate(() => {
      const w = window.__wraith, g = w.game, c = g.controller.pos;
      return { ok: g.worldSettled(), pendingNear: g.streamer.pendingNear(c.x, c.z), arrived: g.streamer.arrived.length, pages: w.terrainState.pendingPages, brushes: w.terrainState.pendingBrushes, stats: w.terrainState.stats, pos: [c.x, c.y, c.z] };
    });
    if (st.ok) return;
    log('waiting to settle', JSON.stringify(st));
    await page.waitForTimeout(60000);
  }
  throw new Error('world never settled');
}

try {
  // Session 1: make marks and save.
  // One browser context for both sessions: the save lives in its IndexedDB.
  let { page, context } = await openGame(browser, server.url, 'snapshot=1&title=0', { width: W, height: H });
  page.on('console', (m) => log('console', m.type(), m.text().slice(0, 300)));
  page.on('pageerror', (e) => log('pageerror', e.message));
  log('booted');
  const marks = await page.evaluate(() => {
    const w = window.__wraith, ts = w.terrainState, c = w.game.controller.pos;
    const near = { x: c.x + 6, z: c.z + 3 }, far = { x: c.x + 230, z: c.z - 40 };
    for (const p of [near, far]) {
      ts.bx = p.x; ts.bz = p.z; ts.bdx = 1; ts.bdz = 0; ts.bl = 0; ts.bw = 1.4; ts.bd = 0.5; ts.bc = 0.9;
      ts.stamp();
    }
    for (let k = 0; k < 12; k++) { ts.bx = c.x - 4 + k * 0.6; ts.bz = c.z - 5; ts.bdx = 1; ts.bdz = 0; ts.bl = 0.3; ts.bw = 0.25; ts.bd = 0.12; ts.bc = 0.8; ts.stamp(); }
    const f = w.frost; f.tx = c.x - 5; f.ty = c.y; f.tz = c.z + 6; f.castCrystal = true;
    w.game.spawnWarden();
    return { near, far, trail: { x: c.x - 1, z: c.z - 5 } };
  });
  log('marks queued');
  await frames(page, 30);
  log('30 frames');
  await page.evaluate(() => { const w = window.__wraith; w.game.releaseWarden(); });
  await frames(page, 10);
  await page.evaluate(() => window.__wraith.warden.finishRelease());
  await frames(page, 10);
  // Walk the window away from the far crater? It is already outside the fine window (85 m), so
  // it lives only in its coarse page. Evict it to the worker to cover that path too.
  await page.evaluate(() => window.__wraith.terrainState.debugEvictFar());
  await frames(page, 10);
  log('saving');
  const before = await page.evaluate(async (m) => {
    const w = window.__wraith;
    const ok = await w.game.saves.save('slot1');
    const ts = w.terrainState;
    const probe = async (p) => (await ts.debugProbe(p.x, p.z));
    return { ok, near: await probe(m.near), trail: await probe(m.trail), crystals: w.frost.serializeCrystals(0).length, warden: { state: w.warden.state, x: w.warden.body.x, z: w.warden.body.z }, err: String(w.game.saves.lastError || '') };
  }, marks);
  log('saved', JSON.stringify(before));
  check('save succeeded', before.ok, before.err);
  await page.close();

  // Session 2: a fresh page, load the slot.
  page = await context.newPage();
  page.on('pageerror', (e) => log('pageerror', e.message));
  await page.goto(server.url + '?snapshot=1&title=0');
  await page.waitForFunction(() => window.__wraith && (window.__wraith.ready || window.__wraith.error), null, { timeout: 3600000, polling: 500 });
  log('rebooted');
  const pre = await page.evaluate(async (m) => (await window.__wraith.terrainState.debugProbe(m.near.x, m.near.z)), marks);
  await page.evaluate(() => window.__wraith.game.saves.load('slot1'));
  await frames(page, 5);
  await settled(page);
  await frames(page, 30);
  const after = await page.evaluate(async (m) => {
    const w = window.__wraith, ts = w.terrainState;
    const probe = async (p) => (await ts.debugProbe(p.x, p.z));
    // The far crater: walk the player there so its page reloads from the worker.
    return { near: await probe(m.near), trail: await probe(m.trail), crystals: w.frost.serializeCrystals(0).length, warden: { active: w.warden.active, state: w.warden.state, x: w.warden.body.x, z: w.warden.body.z } };
  }, marks);
  log('loaded', JSON.stringify(after), 'fresh page before load:', JSON.stringify(pre));
  const near = (a, b, tol) => a !== null && b !== null && Math.abs(a - b) <= tol;
  check('fresh page starts without the marks', !pre || !(pre.coarse > 0.05), JSON.stringify(pre));
  check('crater beside the player persists', near(after.near.coarse, before.near.coarse, 0.02), `${before.near.coarse} → ${after.near.coarse}`);
  check('trail persists', near(after.trail.coarse, before.trail.coarse, 0.02), `${before.trail.coarse} → ${after.trail.coarse}`);
  check('ice formation persists', after.crystals === before.crystals && before.crystals > 1, `${before.crystals} → ${after.crystals}`);
  check('Warden rests where it was released', after.warden.active && after.warden.state === 5 && Math.hypot(after.warden.x - before.warden.x, after.warden.z - before.warden.z) < 3, JSON.stringify(after.warden));
  // The far crater: teleport there and probe once its page has come back.
  await page.evaluate((m) => window.__wraith.game.teleport(m.far.x - 10, m.far.z), marks);
  await frames(page, 5);
  await settled(page);
  await frames(page, 20);
  const far = await page.evaluate(async (m) => (await window.__wraith.terrainState.debugProbe(m.far.x, m.far.z)), marks);
  check('far crater (evicted page) persists', far && far.coarse > 0.1, JSON.stringify(far));
} catch (e) {
  console.error(e); ok = false;
} finally {
  await browser.close(); await server.close();
}
log(ok ? 'GATE PASS' : 'GATE FAIL');
process.exit(ok ? 0 : 1);
