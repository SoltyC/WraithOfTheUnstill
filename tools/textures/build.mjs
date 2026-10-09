// Scanned PBR materials → packed WebP sets for the game (BRIEF §3: CC0, vendored; DECISIONS.md
// "Scans first"). For each entry in data/materials/sources.json: download the 2K diffuse, GL normal,
// ARM (AO/rough/metal) and displacement JPGs from Poly Haven into a cache outside the repository
// (~/.cache/wraith-textures), then pack them in a headless browser canvas into three opaque WebPs (data/textures/):
//   <id>.alb.webp  albedo (sRGB)                      size²
//   <id>.nrm.webp  normal x, normal y, roughness       size²   (z is rebuilt in the shader)
//   <id>.hgt.webp  height, ambient occlusion, −         size/2²
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
async function download(m) {
  const files = await (await fetch('https://api.polyhaven.com/files/' + m.asset)).json();
  const res = SRC.size >= 2048 ? '2k' : '1k';
  const pick = { diff: 'Diffuse', nrm: 'nor_gl', arm: 'arm', disp: 'Displacement' };
  const out = {};
  for (const k in pick) {
    const url = files[pick[k]][res].jpg.url;
    const f = path.join(CACHE, m.asset + '_' + k + '_' + res + '.jpg');
    await fetchTo(url, f); out[k] = f;
  }
  return out;
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
  const res = await page.evaluate(async ({ diff, nrm, arm, disp, size }) => {
    const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const [D, N, A, H] = await Promise.all([load(diff), load(nrm), load(arm), load(disp)]);
    const read = (img, s) => { const c = new OffscreenCanvas(s, s), x = c.getContext('2d'); x.drawImage(img, 0, 0, s, s); return x.getImageData(0, 0, s, s); };
    const enc = async (data, s) => {
      const c = new OffscreenCanvas(s, s); c.getContext('2d').putImageData(data, 0, 0);
      const b = await c.convertToBlob({ type: 'image/webp', quality: 0.9 });
      const u8 = new Uint8Array(await b.arrayBuffer()); let s2 = ''; for (let i = 0; i < u8.length; i += 0x8000) s2 += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s2);
    };
    const alb = read(D, size);
    const n = read(N, size), a = read(A, size), nrmOut = new ImageData(size, size);
    for (let i = 0; i < n.data.length; i += 4) { nrmOut.data[i] = n.data[i]; nrmOut.data[i + 1] = n.data[i + 1]; nrmOut.data[i + 2] = a.data[i + 1]; nrmOut.data[i + 3] = 255; }
    const h2 = size / 2, h = read(H, h2), a2 = read(A, h2), hgtOut = new ImageData(h2, h2);
    for (let i = 0; i < h.data.length; i += 4) { hgtOut.data[i] = h.data[i]; hgtOut.data[i + 1] = a2.data[i]; hgtOut.data[i + 2] = 0; hgtOut.data[i + 3] = 255; }
    return { alb: await enc(alb, size), nrm: await enc(nrmOut, size), hgt: await enc(hgtOut, h2) };
  }, { diff: b64(f.diff), nrm: b64(f.nrm), arm: b64(f.arm), disp: b64(f.disp), size: SRC.size });
  for (const k of ['alb', 'nrm', 'hgt']) fs.writeFileSync(path.join(OUT, `${m.id}.${k}.webp`), Buffer.from(res[k], 'base64'));
  const kb = ['alb', 'nrm', 'hgt'].map((k) => (fs.statSync(path.join(OUT, `${m.id}.${k}.webp`)).size / 1024).toFixed(0)).join(' / ');
  console.log(m.id, '←', m.asset, kb, 'KB');
}
await browser.close();
