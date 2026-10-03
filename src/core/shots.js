// Gate screenshots on the target GPU (BRIEF §3: capture every gate screenshot on the target).
// Open  /?shots=p2-&capture=1&res=2560x1440  in Chrome on the target while `npm run preview`
// runs: every photo spot whose id starts with the prefix is loaded in turn (one fresh page per
// spot, so terrain-state trails never leak between shots), rendered once settled, read from the
// canvas and POSTed to the preview server → screenshots/<dir>/<id>.png (&dir=phase-02 default).

import spotsFile from '../../data/photo-spots.json';

function go(qs) { const u = new URL(location.href); u.search = qs.toString(); location.replace(u.href); }

function ids(prefix) { return spotsFile.spots.filter((s) => s.id.startsWith(prefix)).map((s) => s.id); }

/** Called before booting: with ?shots= but no spot yet, jump to the first spot. Returns true if redirecting. */
export function shotsRedirect(qs) {
  const prefix = qs.get('shots');
  if (!prefix || qs.get('spot')) return false;
  const list = ids(prefix);
  if (!list.length) return false;
  qs.set('spot', list[0]); qs.set('shotIndex', '0');
  go(qs);
  return true;
}

function panel(text) {
  let el = document.querySelector('.bench-panel');
  if (!el) { el = document.createElement('div'); el.className = 'bench-panel'; document.body.append(el); }
  el.textContent = text;
}

/** Called once the spot is captureReady: grab, upload, go to the next spot. */
export async function shotsTake(engine, qs) {
  const prefix = qs.get('shots'), list = ids(prefix);
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
  if (k + 1 < list.length) {
    qs.set('spot', list[k + 1]); qs.set('shotIndex', String(k + 1));
    go(qs);
  } else {
    panel(`Shots done: ${list.length} spot(s) (${prefix}*) → screenshots/${dir}/. Last: ${msg}`);
  }
}
