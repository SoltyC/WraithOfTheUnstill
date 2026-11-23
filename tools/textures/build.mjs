// Scanned PBR materials → packed WebP sets for the game (BRIEF §3: CC0, vendored; DECISIONS.md
// "Scans first"). For each entry in data/materials/sources.json: download the 2K diffuse, GL normal,
// ARM (AO/rough/metal) and displacement JPGs from Poly Haven into a cache outside the repository
// (~/.cache/wraith-textures), then pack them in a headless browser canvas into three opaque WebPs (data/textures/):
//   <id>.alb.webp  albedo (sRGB)                      size²
//   <id>.nrm.webp  normal x, normal y, roughness       size²   (z is rebuilt in the shader)
//   <id>.hgt.webp  height, ambient occlusion, emission  size/2²
// Sources: Poly Haven ("source": "polyhaven") or ambientCG ("ambientcg", the 2K JPG zip).
// Opaque on purpose: a canvas stores alpha premultiplied, which would destroy colour where it is low.
// Usage: node tools/textures/build.mjs [id …]   (no ids: all)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/materials/sources.json'), 'utf8'));
const CACHE = path.join(os.homedir(), '.cache/wraith-textures');
const OUT = path.join(ROOT, 'data/textures'); // served at /textures/ (data/ is the public dir)
fs.mkdirSync(CACHE, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

async function fetchTo(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  const r = await fetch(url); if (!r.ok) throw new Error(url + ' → ' + r.status);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
// ambientCG (CC0): one zip per material; Color, NormalGL, Roughness, AmbientOcclusion (absent on some), Displacement, Emission.
async function downloadAcg(m) {
  const dir = path.join(CACHE, 'acg'); fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, m.asset + '.zip');
  await fetchTo(`https://ambientcg.com/get?file=${m.asset}_2K-JPG.zip`, zip);
  const { execFileSync } = await import('node:child_process');
  const ex = path.join(dir, m.asset); fs.mkdirSync(ex, { recursive: true });
  if (!fs.existsSync(path.join(ex, `${m.asset}_2K-JPG_Color.jpg`))) execFileSync('unzip', ['-o', '-q', zip, '*.jpg', '-d', ex]);
  const f = (k) => { const q = path.join(ex, `${m.asset}_2K-JPG_${k}.jpg`); return fs.existsSync(q) ? q : null; };
  return { diff: f('Color'), nrm: f('NormalGL'), rough: f('Roughness'), ao: f('AmbientOcclusion'), disp: f('Displacement'), emit: f('Emission'), roughCh: 0, aoCh: 0 };
}
async function download(m) {
  if (m.source === 'ambientcg') return downloadAcg(m);
  const files = await (await fetch('https://api.polyhaven.com/files/' + m.asset)).json();
  const res = SRC.size >= 2048 ? '2k' : '1k';
  const pick = { diff: 'Diffuse', nrm: 'nor_gl', arm: 'arm', disp: 'Displacement' };
  const out = {};
  for (const k in pick) {
    const url = files[pick[k]][res].jpg.url;
    const f = path.join(CACHE, m.asset + '_' + k + '_' + res + '.jpg');
    await fetchTo(url, f); out[k] = f;
  }
  // ARM: ambient occlusion in red, roughness in green.
  return { diff: out.diff, nrm: out.nrm, rough: out.arm, ao: out.arm, disp: out.disp, emit: null, roughCh: 1, aoCh: 0 };
}

const env = { ...process.env };
const libs = os.homedir() + '/.local/wraith-libs/root/usr/lib/x86_64-linux-gnu';
if (fs.existsSync(libs)) env.LD_LIBRARY_PATH = libs + ':' + (env.LD_LIBRARY_PATH || '');
const browser = await chromium.launch({ env });
const page = await browser.newPage();
const b64 = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');

for (const m of SRC.materials) {
  if (only.length && !only.includes(m.id)) continue;
  const f = await download(m);
  const res = await page.evaluate(async ({ diff, nrm, rough, ao, disp, emit, roughCh, aoCh, size }) => {
    const load = (src) => src ? new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }) : null;
    const [D, N, R, A, H, E] = await Promise.all([load(diff), load(nrm), load(rough), load(ao), load(disp), load(emit)]);
    const read = (img, s) => { const c = new OffscreenCanvas(s, s), x = c.getContext('2d'); x.drawImage(img, 0, 0, s, s); return x.getImageData(0, 0, s, s); };
    const enc = async (data, s) => {
      const c = new OffscreenCanvas(s, s); c.getContext('2d').putImageData(data, 0, 0);
      const b = await c.convertToBlob({ type: 'image/webp', quality: 0.9 });
      const u8 = new Uint8Array(await b.arrayBuffer()); let s2 = ''; for (let i = 0; i < u8.length; i += 0x8000) s2 += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s2);
    };
    const alb = read(D, size);
    const n = read(N, size), r = read(R, size), nrmOut = new ImageData(size, size);
    for (let i = 0; i < n.data.length; i += 4) { nrmOut.data[i] = n.data[i]; nrmOut.data[i + 1] = n.data[i + 1]; nrmOut.data[i + 2] = r.data[i + roughCh]; nrmOut.data[i + 3] = 255; }
    // Height, ambient occlusion (white when the scan has none), emission luminance (0 when none).
    const h2 = size / 2, h = read(H, h2), a2 = A ? read(A, h2) : null, e2 = E ? read(E, h2) : null, hgtOut = new ImageData(h2, h2);
    for (let i = 0; i < h.data.length; i += 4) {
      hgtOut.data[i] = h.data[i]; hgtOut.data[i + 1] = a2 ? a2.data[i + aoCh] : 255;
      hgtOut.data[i + 2] = e2 ? Math.min(255, 0.3 * e2.data[i] + 0.59 * e2.data[i + 1] + 0.11 * e2.data[i + 2]) : 0; hgtOut.data[i + 3] = 255;
    }
    return { alb: await enc(alb, size), nrm: await enc(nrmOut, size), hgt: await enc(hgtOut, h2) };
  }, { diff: b64(f.diff), nrm: b64(f.nrm), rough: b64(f.rough), ao: f.ao && b64(f.ao), disp: b64(f.disp), emit: f.emit && b64(f.emit), roughCh: f.roughCh, aoCh: f.aoCh, size: SRC.size });
  for (const k of ['alb', 'nrm', 'hgt']) fs.writeFileSync(path.join(OUT, `${m.id}.${k}.webp`), Buffer.from(res[k], 'base64'));
  const kb = ['alb', 'nrm', 'hgt'].map((k) => (fs.statSync(path.join(OUT, `${m.id}.${k}.webp`)).size / 1024).toFixed(0)).join(' / ');
  console.log(m.id, '←', m.asset, kb, 'KB');
}
await browser.close();
