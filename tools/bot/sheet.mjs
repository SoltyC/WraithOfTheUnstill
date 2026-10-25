#!/usr/bin/env node
// Contact sheet of film frames, to look at a move in one image:
//   node tools/bot/sheet.mjs <frames dir> <out.jpg> <i,j,k,...|from:to:step> [cols=4] [cellWidth=480]
import { launchBrowser } from '../capture/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
const [, , dir, out, spec = '0:60:6', colsA = '4', wA = '480'] = process.argv;
const idx = spec.includes(':') ? (() => { const [a, b, s] = spec.split(':').map(Number); const r = []; for (let i = a; i < b; i += s || 1) r.push(i); return r; })() : spec.split(',').map(Number);
const cols = +colsA, w = +wA;
const imgs = idx.map((i) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, 'f' + String(i).padStart(6, '0') + '.jpg')).toString('base64'));
const html = `<body style="margin:0;background:#111"><div style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:2px">${imgs.map((s, k) => `<div style="position:relative"><img src="${s}" width="${w}"><span style="position:absolute;left:4px;top:2px;color:#ff0;font:12px monospace">${idx[k]}</span></div>`).join('')}</div>`;
const b = await launchBrowser({});
const page = await b.newPage({ viewport: { width: cols * (w + 2), height: 200 } });
await page.setContent(html);
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 88 });
await b.close();
console.log(out);
