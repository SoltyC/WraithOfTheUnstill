// Draws the Phase 9 dune plan over the baked world map (docs/phase-9/world-map.png, 1 px = 8 m,
// world (0, 0) at pixel (512, 512), +z north): ravines, the camp, the three instruments, the rift,
// the Walker's glass track and the side-quest sites. Writes docs/phase-9/figures/erg-plan.svg (it
// links the map image, so open it from that folder) — `tools/world/renderFigures.mjs` turns it into
// erg-plan.png. Positions are the design's (docs/phase-9/dunes-design.md), in world metres.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');
const CROP = { x0: 600, y0: 236, w: 412, h: 368 }, S = 3;
const P = (x, z) => [((512 + x / 8) - CROP.x0) * S, ((512 - z / 8) - CROP.y0) * S];
const pts = (list) => list.map(([x, z]) => P(x, z).map((v) => v.toFixed(1)).join(',')).join(' ');
const C = {
  ink: '#2b211a', paper: '#f6efe0', canyon: '#a3482a', slot: '#7a2a16', wadi: '#3f7fae', rift: '#1e1410',
  track: '#2f9fb8', gold: '#e2a21b', frost: '#7cc4e4', route: '#b8432f', erg: '#f6efe0',
};

const out = [];
const add = (s) => out.push(s);
const label = (x, z, text, { dx = 8, dy = -8, size = 15, anchor = 'start', weight = 600, color = C.ink } = {}) => {
  const [px, py] = P(x, z);
  add(`<text x="${(px + dx).toFixed(1)}" y="${(py + dy).toFixed(1)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}" stroke="${C.paper}" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${text}</text>`);
};
const dot = (x, z, r, fill, stroke = C.ink) => { const [px, py] = P(x, z); add(`<circle cx="${px}" cy="${py}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`); };
const square = (x, z, r, fill) => { const [px, py] = P(x, z); add(`<rect x="${px - r}" y="${py - r}" width="${2 * r}" height="${2 * r}" fill="${fill}" stroke="${C.ink}" stroke-width="2"/>`); };
const line = (list, stroke, width, extra = '') => add(`<polyline points="${pts(list)}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`);
const badge = (x, z, n, fill) => { const [px, py] = P(x, z); add(`<circle cx="${px}" cy="${py}" r="13" fill="${fill}" stroke="${C.paper}" stroke-width="3"/><text x="${px}" y="${py + 5}" font-size="14" font-weight="800" text-anchor="middle" fill="#fff">${n}</text>`); };

const W = CROP.w * S, H = CROP.h * S;
add(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H + 120}" viewBox="0 0 ${W} ${H + 120}" font-family="Georgia, 'Times New Roman', serif">`);
add(`<rect width="${W}" height="${H + 120}" fill="${C.paper}"/>`);
add(`<image xlink:href="../world-map.png" x="${-CROP.x0 * S}" y="${-CROP.y0 * S}" width="${1024 * S}" height="${1024 * S}" image-rendering="pixelated" opacity="0.92"/>`);
add(`<rect width="${W}" height="${H}" fill="#fff" opacity="0.18"/>`);

// The grown erg (D0) and the cold erg strip.
const erg = [[1500, 1560], [2500, 1600], [3300, 1450], [3400, 600], [3200, -150], [2600, -420], [1700, -380], [1450, 0], [1500, 700], [1480, 1300]];
add(`<polygon points="${pts(erg)}" fill="none" stroke="${C.ink}" stroke-width="2.5" stroke-dasharray="10 7" opacity="0.8"/>`);
const cold = [[1550, 1620], [2600, 1660], [2650, 1980], [1600, 1960]];
add(`<polygon points="${pts(cold)}" fill="${C.frost}" opacity="0.35" stroke="${C.frost}" stroke-width="2"/>`);
label(2100, 1830, 'COLD ERG — snow in the lee hollows', { size: 14, anchor: 'middle', dx: 0 });
label(3150, -330, 'grown erg (D0)', { size: 13, anchor: 'end', dx: 0, weight: 500 });

// Escarpment lip and foot.
line([[1130, 1500], [1160, 1150], [1150, 850], [1180, 500], [1200, 150], [1230, -250]], C.ink, 2, 'stroke-dasharray="2 6"');
label(1180, 600, 'escarpment lip', { size: 12, anchor: 'end', dx: -6, weight: 500 });

// Ravines. Canyon trunk along the escarpment foot, with side galleries.
line([[1470, 1380], [1500, 1150], [1470, 950], [1520, 700], [1490, 450], [1540, 200], [1520, -50]], C.canyon, 15, 'opacity="0.9"');
line([[1500, 1150], [1600, 1180], [1660, 1120]], C.canyon, 9);
line([[1470, 950], [1380, 920]], C.canyon, 9);
line([[1540, 200], [1660, 150], [1720, 60]], C.canyon, 9);
label(1470, 1300, 'THE RED GALLERIES', { dx: -14, anchor: 'end' });
label(1470, 1300, 'canyon, 30–80 m walls', { dx: -14, dy: 10, anchor: 'end', size: 12, weight: 500 });
// Slot canyons.
line([[1490, 450], [1580, 480], [1640, 430], [1720, 470], [1790, 420]], C.slot, 5);
label(1800, 410, 'the Needle — slot canyon', { size: 13, dy: 30, dx: -40 });
line([[1520, 700], [1590, 650], [1640, 690]], C.slot, 4);
// Wadis: braided dry beds from the meadow's rivers.
const wadi = (list) => line(list, C.wadi, 4, 'stroke-dasharray="1 0" opacity="0.85"');
wadi([[1200, 280], [1450, 260], [1800, 240], [2200, 230], [2600, 300], [3000, 330]]);
wadi([[1450, 260], [1700, 300], [2050, 330], [2400, 290]]);
wadi([[1800, 240], [2000, 160], [2300, 180], [2600, 300]]);
label(2450, 140, 'THE DRY BRAIDS — wadis', { color: C.wadi, anchor: 'middle', dx: 0, dy: 26 });
// Aqueduct along the north braid.
line([[1300, 330], [1700, 330], [2050, 360]], C.ink, 2, 'stroke-dasharray="3 5"');
label(1330, 340, 'aqueduct', { size: 11, weight: 500, dy: -8, dx: 0 });
// The rift.
line([[2120, 1480], [2180, 1200], [2230, 950], [2290, 700], [2330, 480], [2380, 300]], C.rift, 7);
line([[2120, 1480], [2180, 1200], [2230, 950], [2290, 700], [2330, 480], [2380, 300]], '#5a3a2a', 2);
label(2140, 1380, 'THE STRIDE — the rift', { dx: -14, anchor: 'end' });
label(2140, 1380, '1.2 km long, 15–40 m wide, ~60 m deep', { dx: -14, dy: 10, anchor: 'end', size: 12, weight: 500 });

// The playa, the camp and the quicksand lock.
const [cx, cy] = P(1880, 760);
add(`<ellipse cx="${cx}" cy="${cy}" rx="${(260 / 8) * S}" ry="${(150 / 8) * S}" fill="#fbf4e2" stroke="${C.ink}" stroke-width="1.5" opacity="0.85"/>`);
label(1880, 915, 'quicksand pans (Frost lock)', { size: 11, weight: 500, anchor: 'middle', dx: 0, dy: -6 });
square(1800, 700, 9, C.gold);
label(1800, 700, 'WELLHOUSE camp + oasis', { dx: 16, dy: 22 });

// Dry Stair road.
line([[125, 950], [700, 930], [1150, 880], [1300, 900], [1500, 860], [1800, 700]], C.route, 3, 'stroke-dasharray="9 6"');
label(1250, 900, 'the Dry Stair', { color: C.route, dy: -12 });

// The Walker and its glass track (lit in three thirds by the instruments).
const track = [[2436, 1124], [2650, 1060], [2860, 900], [2900, 700], [2780, 520], [2560, 470], [2420, 620], [2380, 860], [2436, 1124]];
line(track, C.track, 4, 'stroke-dasharray="2 9"');
dot(2436, 1124, 12, '#e8d3a6');
label(2436, 1124, 'THE LONG WALKER', { dx: 0, dy: -20, anchor: 'middle' });
label(2436, 1124, 'buried in a star megadune', { dx: 0, dy: 26, anchor: 'middle', size: 12, weight: 500 });
label(2900, 700, 'glass footprints', { color: C.track, size: 13, dx: 14 });
// Steering home: the two ways round the rift.
line([[2436, 1124], [2300, 1520], [2050, 1570], [1900, 1100], [1830, 760]], C.gold, 3, 'stroke-dasharray="12 6" opacity="0.95"');
line([[2436, 1124], [2500, 600], [2430, 190], [2150, 420], [1850, 700]], C.gold, 3, 'stroke-dasharray="12 6" opacity="0.95"');
label(2560, 380, 'steer it home — north or south round the rift', { color: '#8a5c00', size: 12, dy: 18 });

// The three instruments (main quest hub) and the side sites.
badge(1480, 1060, 'A', C.canyon); label(1480, 1060, 'Sun Gate', { dx: 16 });
badge(1700, 450, 'B', C.slot); label(1700, 450, 'Hourglass', { dx: -16, anchor: 'end', dy: -14 });
badge(2760, 760, 'C', C.gold); label(2760, 760, 'Singing Dunes', { dx: 16 });
[[2700, 840], [2830, 720], [2660, 640]].forEach(([x, z]) => { const [px, py] = P(x, z); add(`<path d="M${px - 9},${py + 7} L${px},${py - 9} L${px + 9},${py + 7} Z" fill="#c98f3e" stroke="${C.ink}" stroke-width="1.5"/>`); });
badge(1990, 180, '1', C.route); label(1990, 180, 'Mirage Map', { dx: 16, dy: 18 });
badge(1640, 120, '2', C.route); label(1640, 120, 'Frozen Falls (hoodoos)', { dx: -16, anchor: 'end', dy: 22 });
badge(2600, 470, '3', C.route); label(2600, 470, 'Glass Battle', { dx: 16, dy: 22 });
badge(2980, 1160, '4', C.route); label(2980, 1160, 'Buried Door (Sunken Temple)', { dx: -10, dy: -18 });
badge(1600, 640, '5', C.route); label(1600, 640, 'Flood Garden', { dx: -16, anchor: 'end', dy: 6 });

// Shrines and the Hearn marker.
for (const [x, z] of [[2820, 1028], [1572, 356], [3812, 420], [1604, 1508], [3044, 260]]) { const [px, py] = P(x, z); add(`<rect x="${px - 5}" y="${py - 5}" width="10" height="10" fill="#fff" stroke="${C.ink}" stroke-width="1.5" transform="rotate(45 ${px} ${py})"/>`); }
square(125, 950, 7, '#f4e04d');

// Scale bar and legend.
const [sx, sy] = [30, H - 30];
add(`<rect x="${sx}" y="${sy - 8}" width="${(1000 / 8) * S}" height="8" fill="${C.ink}"/><text x="${sx}" y="${sy - 14}" font-size="13" fill="${C.ink}" stroke="${C.paper}" stroke-width="3" paint-order="stroke">1 km</text>`);
const L = [
  [C.canyon, 'canyon (30–80 m)', 15], [C.slot, 'slot canyon (2–6 m wide)', 5], [C.wadi, 'wadi (dry braided bed)', 4], [C.rift, 'the rift', 7],
  [C.track, 'glass track', 4], [C.gold, 'Walker steering routes', 3], [C.route, 'Dry Stair road', 3],
];
add(`<rect x="0" y="${H}" width="${W}" height="120" fill="${C.paper}"/>`);
L.forEach(([c, t, w], i) => {
  const x = 24 + (i % 4) * 300, y = H + 32 + Math.floor(i / 4) * 30;
  add(`<line x1="${x}" y1="${y}" x2="${x + 40}" y2="${y}" stroke="${c}" stroke-width="${Math.min(w, 10)}" stroke-linecap="round"/><text x="${x + 52}" y="${y + 5}" font-size="14" fill="${C.ink}">${t}</text>`);
});
add(`<text x="24" y="${H + 104}" font-size="13" fill="${C.ink}">A B C — the three instruments (main quest hub, any order) · 1–5 — side sites · ◇ shrines · seed-1 bake under the plan; 1 px of the base map = 8 m</text>`);
add('</svg>');

const file = path.join(root, 'docs/phase-9/figures/erg-plan.svg');
fs.writeFileSync(file, out.join('\n') + '\n');
console.log('wrote', path.relative(root, file));
