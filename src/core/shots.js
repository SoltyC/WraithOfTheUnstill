// Gate screenshots on the target GPU (BRIEF §3: capture every gate screenshot on the target).
// Open  /?shots=p2-&capture=1&res=2560x1440  in Chrome on the target while `npm run preview`
// runs: every photo spot whose id starts with the prefix is loaded in turn (one fresh page per
// spot, so terrain-state trails never leak between shots), rendered once settled, read from the
// canvas and POSTed to the preview server → screenshots/<dir>/<id>.png (&dir=phase-02 default).
//
// Robustness: a progress line shows which spot is loading; each spot has a watchdog
// (&shotTimeout=<s>, default 240): a spot that errors or never settles is reloaded once, then
// skipped and listed at the end. Every event is also POSTed to the preview server, which prints
// it in its terminal and appends it to screenshots/<dir>/shots-log.txt.

import spotsFile from '../../data/photo-spots.json';

function go(qs) { const u = new URL(location.href); u.search = qs.toString(); location.replace(u.href); }

function ids(prefix) { return spotsFile.spots.filter((s) => s.id.startsWith(prefix)).map((s) => s.id); }

function panel(text) {
  let el = document.querySelector('.bench-panel');
  if (!el) { el = document.createElement('div'); el.className = 'bench-panel'; document.body.append(el); }
  el.textContent = text;
}

/** Log a line to the preview server's terminal and the shots log (best effort). */
function report(qs, line) {
  const dir = qs.get('dir') || 'phase-02';
  console.log('[shots] ' + line);
  try { fetch(`/__wraith/shot-log?dir=${encodeURIComponent(dir)}`, { method: 'POST', body: line }); } catch { /* ignore */ }
}

/** Move on to the next spot (or finish), carrying the skipped list. */
function next(qs, list, k) {
  qs.delete('retry');
  if (k + 1 < list.length) {
    qs.set('spot', list[k + 1]); qs.set('shotIndex', String(k + 1));
    go(qs);
    return;
  }
  const skipped = qs.get('skipped');
  const msg = `Shots done: ${list.length - (skipped ? skipped.split(',').length : 0)}/${list.length} spot(s) (${qs.get('shots')}*) → screenshots/${qs.get('dir') || 'phase-02'}/` + (skipped ? `. SKIPPED (failed twice): ${skipped}` : '.');
  report(qs, msg);
  panel(msg);
}

let watchdog = 0;
let failed = false;

/** Give up on this spot: reload it once, then skip it. */
function fail(qs, reason) {
  if (failed) return;
  failed = true;
  clearTimeout(watchdog);
  const list = ids(qs.get('shots')), k = Number(qs.get('shotIndex') || 0), id = qs.get('spot');
  if (qs.get('retry') !== '1') {
    report(qs, `${id}: ${reason} — reloading once`);
    qs.set('retry', '1');
    go(qs);
    return;
  }
  report(qs, `${id}: ${reason} — SKIPPED`);
  const s = qs.get('skipped');
  qs.set('skipped', s ? s + ',' + id : id);
  next(qs, list, k);
}

/** Called before booting: with ?shots= but no spot yet, jump to the first spot. Returns true if
 *  redirecting. Otherwise arms the watchdog and the error hooks for this spot. */
export function shotsRedirect(qs) {
  const prefix = qs.get('shots');
  const list = ids(prefix);
  if (!list.length) { panel(`No photo spots start with "${prefix}".`); return true; }
  if (!qs.get('spot')) {
    qs.set('spot', list[0]); qs.set('shotIndex', '0');
    go(qs);
    return true;
  }
  const k = Number(qs.get('shotIndex') || 0);
  panel(`Shot ${k + 1}/${list.length}: ${qs.get('spot')}${qs.get('retry') === '1' ? ' (retry)' : ''} — loading…`);
  const limit = Number(qs.get('shotTimeout') || 240) * 1000;
  watchdog = setTimeout(() => fail(qs, `not ready after ${limit / 1000} s`), limit);
  window.addEventListener('error', (e) => fail(qs, 'error: ' + (e.message || e.error)));
  window.addEventListener('unhandledrejection', (e) => fail(qs, 'unhandled rejection: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
  return false;
}

/** Boot failed (main.js catch): retry or skip this spot. */
export function shotsBootFailed(qs, err) { fail(qs, 'boot failed: ' + String(err && (err.stack || err.message) || err).slice(0, 400)); }

/** Called once the spot is captureReady: grab, upload, go to the next spot. */
export async function shotsTake(engine, qs) {
  if (failed) return;
  clearTimeout(watchdog);
  const list = ids(qs.get('shots'));
  const k = Number(qs.get('shotIndex') || 0), id = qs.get('spot');
  const dir = qs.get('dir') || 'phase-02';
  // Grab right after a rendered frame, before the next one.
  await new Promise((r) => requestAnimationFrame(() => r()));
  const canvas = engine.getRenderingCanvas();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  let msg;
  try {
    const res = await fetch(`/__wraith/shot?dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(id)}`, { method: 'POST', body: blob });
    msg = res.ok ? 'saved ' + (await res.json()).file : 'server did not save (HTTP ' + res.status + ')';
  } catch (e) { msg = 'could not reach server: ' + e.message; }
  window.__wraith.shotResult = msg;
  report(qs, `${k + 1}/${list.length} ${id}: ${msg}`);
  next(qs, list, k);
}
