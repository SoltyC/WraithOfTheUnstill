// The diagrams for docs/phase-9/dunes-design.md: ravine sections and features, the sand grammar,
// the three instrument sites and the quest shape. Writes SVGs to docs/phase-9/figures/;
// `tools/world/renderFigures.mjs` turns them into PNGs. Drawn to the design's dimensions (metres),
// with the Wraith (1.8 m) for scale where it shows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../docs/phase-9/figures/');
const C = {
  paper: '#f6efe0', ink: '#2b211a', soft: '#6d5d4e', sky: '#d9e8ef', sand: '#ecd29b', sandDark: '#d4b273',
  rock: ['#c8693e', '#e3a774', '#b4532f', '#ebc58f', '#a9472a', '#d98b55'], bed: '#4d3d35', shade: '#5e6f9a',
  frost: '#8fcbe6', water: '#3f7fae', beam: '#f2b81b', glass: '#3fa7bf', red: '#b8432f', gold: '#e2a21b', green: '#5c8a4a',
};
const FONT = `font-family="Georgia, 'Times New Roman', serif"`;

function svgDoc(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${FONT}>
<defs>
<pattern id="strata" patternUnits="userSpaceOnUse" width="40" height="64">
<rect width="40" height="64" fill="${C.rock[0]}"/><rect y="9" width="40" height="7" fill="${C.rock[1]}"/><rect y="20" width="40" height="12" fill="${C.rock[2]}"/>
<rect y="35" width="40" height="5" fill="${C.rock[3]}"/><rect y="44" width="40" height="9" fill="${C.rock[5]}"/><rect y="56" width="40" height="4" fill="${C.rock[4]}"/>
</pattern>
<pattern id="hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="${C.ink}" stroke-width="1.2" opacity="0.5"/></pattern>
<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.ink}"/></marker>
<marker id="arrRed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.red}"/></marker>
<marker id="arrGold" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.beam}"/></marker>
${defs}
</defs>
<rect width="${w}" height="${h}" fill="${C.paper}"/>
${body}
</svg>
`;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function T(x, y, s, { size = 14, weight = 400, anchor = 'start', color = C.ink, italic = false } = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}"${italic ? ' font-style="italic"' : ''}>${esc(s)}</text>`;
}
/** Several lines of text. */
const TL = (x, y, lines, o = {}) => lines.map((l, i) => T(x, y + i * ((o.size || 14) + 4), l, o)).join('');
const poly = (p, fill, extra = '') => `<polygon points="${p.map((q) => q.join(',')).join(' ')}" fill="${fill}" ${extra}/>`;
const pl = (p, stroke, w = 2, extra = '') => `<polyline points="${p.map((q) => q.join(',')).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
/** A dimension line with arrowheads at both ends and a label beside it. */
function dim(x1, y1, x2, y2, label, { side = 'right', color = C.ink } = {}) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, vert = Math.abs(x2 - x1) < Math.abs(y2 - y1);
  const tx = vert ? mx + (side === 'right' ? 8 : -8) : mx, ty = vert ? my + 5 : my - 8;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5" marker-start="url(#arr)" marker-end="url(#arr)"/>` +
    T(tx, ty, label, { size: 13, weight: 700, anchor: vert ? (side === 'right' ? 'start' : 'end') : 'middle', color });
}
/** The Wraith, standing, `px` pixels per metre (1.8 m tall), feet at (x, y). */
function wraith(x, y, px, label = true) {
  const h = 1.8 * px, w = 0.7 * px;
  return `<path d="M${x - w / 2},${y} L${x},${y - h * 0.85} L${x + w / 2},${y} Z" fill="#3a3f55"/><circle cx="${x}" cy="${y - h * 0.88}" r="${Math.max(1.5, h * 0.1)}" fill="#3a3f55"/>` +
    (label ? `<line x1="${x}" y1="${y - h - 4}" x2="${x + 18}" y2="${y - h - 26}" stroke="${C.ink}" stroke-width="1"/>` + T(x + 20, y - h - 28, 'the Wraith, 1.8 m', { size: 12, italic: true }) : '');
}
const sun = (x, y, r = 14) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.beam}" stroke="#c98a00" stroke-width="2"/>` +
  [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = i * Math.PI / 4; return `<line x1="${x + Math.cos(a) * (r + 4)}" y1="${y + Math.sin(a) * (r + 4)}" x2="${x + Math.cos(a) * (r + 10)}" y2="${y + Math.sin(a) * (r + 10)}" stroke="#c98a00" stroke-width="2"/>`; }).join('');
const panel = (x, y, w, h, title, sub) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fffaf0" stroke="${C.ink}" stroke-width="1.5" rx="6"/>` +
  T(x + 16, y + 28, title, { size: 19, weight: 700 }) + (sub ? T(x + 16, y + 48, sub, { size: 13, color: C.soft, italic: true }) : '');
const write = (name, svg) => { fs.writeFileSync(dir + name + '.svg', svg); console.log('wrote', name + '.svg'); };

// ───────────────────────── ravine sections ─────────────────────────
function ravineSections() {
  const W = 1640, H = 1080, out = [];
  out.push(T(24, 40, 'Ravines in section — the four types, to scale (except where marked)', { size: 24, weight: 700 }));
  out.push(T(24, 64, 'Sandstone strata are triplanar bands by height, so they line up across a canyon. Shade on the floor is a puzzle rule (frozen sand lasts there).', { size: 14, color: C.soft }));

  // 1. Canyon: 2.4 px/m.
  {
    const ox = 20, oy = 84, s = 2.4, rim = oy + 130, floor = rim + 80 * s;
    out.push(panel(ox, oy, 800, 480, '1 · The Red Galleries — canyon', 'walls 30–80 m in steps, floor 40–120 m; 2.4 px = 1 m'));
    out.push(`<rect x="${ox + 2}" y="${oy + 56}" width="796" height="${420}" fill="${C.sky}"/>`);
    const prof = [[ox + 2, rim], [ox + 140, rim], [ox + 150, rim + 30], [ox + 175, rim + 34], [ox + 182, rim + 70], [ox + 205, rim + 74], [ox + 212, rim + 120], [ox + 236, rim + 124], [ox + 245, floor],
      [ox + 560, floor], [ox + 585, floor - 40], [ox + 572, floor - 70], [ox + 600, rim + 50], [ox + 606, rim + 64], [ox + 640, rim + 64], [ox + 652, rim + 64], [ox + 640, rim + 20], [ox + 648, rim + 10], [ox + 798, rim + 10]];
    out.push(poly([...prof, [ox + 798, oy + 478], [ox + 2, oy + 478]], 'url(#strata)', `stroke="${C.ink}" stroke-width="2"`));
    // Shade: the sun is high in the west-south-west; the left wall shades the floor below it.
    out.push(poly([[ox + 245, floor], [ox + 150, rim + 30], [ox + 140, rim], [ox + 400, floor]], C.shade, 'opacity="0.28"'));
    out.push(sun(ox + 70, oy + 90));
    out.push(`<line x1="${ox + 84}" y1="${oy + 100}" x2="${ox + 400}" y2="${floor}" stroke="${C.beam}" stroke-width="2" stroke-dasharray="6 5"/>`);
    out.push(T(ox + 270, floor - 10, 'shade: frozen sand lasts here', { size: 12, italic: true, color: '#2e3a66' }));
    // Sand floor with drift ramp up the right wall's foot.
    out.push(poly([[ox + 245, floor], [ox + 560, floor], [ox + 585, floor - 40], [ox + 520, floor - 8], [ox + 245, floor - 5]], C.sand, `stroke="${C.sandDark}" stroke-width="1.5"`));
    // Rim dune spilling a sandfall.
    out.push(poly([[ox + 652, rim + 10], [ox + 700, rim - 40], [ox + 798, rim + 10]], C.sand, `stroke="${C.sandDark}" stroke-width="1.5"`));
    out.push(`<path d="M${ox + 650},${rim + 12} C${ox + 630},${rim + 60} ${ox + 618},${floor - 120} ${ox + 612},${floor - 44}" fill="none" stroke="${C.sandDark}" stroke-width="7" stroke-dasharray="3 4"/>`);
    out.push(TL(ox + 660, rim + 60, ['sandfall from a rim', 'dune (streams once', 'restored)'], { size: 12 }));
    // Shaper stair zig-zag on the left steps.
    out.push(pl([[ox + 150, rim + 30], [ox + 168, rim + 30], [ox + 168, rim + 34]], C.ink, 2));
    out.push(pl([[ox + 182, rim + 70], [ox + 196, rim + 70], [ox + 196, rim + 74]], C.ink, 2));
    out.push(TL(ox + 18, rim + 150, ['ledges every 8–15 m:', 'Shaper stairs, drift', 'ramps and frozen', 'sandfalls are the', 'ways up (walls are', 'not climbable)'], { size: 12 }));
    out.push(dim(ox + 270, rim, ox + 270, floor, '80 m (30–80)', { side: 'right' }));
    out.push(`<line x1="${ox + 140}" y1="${rim}" x2="${ox + 300}" y2="${rim}" stroke="${C.ink}" stroke-dasharray="3 4"/>`);
    out.push(dim(ox + 245, floor + 26, ox + 560, floor + 26, '40–120 m floor of sand (real terrain state)'));
    out.push(wraith(ox + 470, floor - 4, s * 1.4));
    out.push(T(ox + 470, floor + 62, 'Wraith drawn ×1.4 for visibility', { size: 11, italic: true, color: C.soft, anchor: 'middle' }));
  }

  // 2. Slot canyon: 8 px/m.
  {
    const ox = 830, oy = 84, s = 8, top = oy + 90, bottom = top + 40 * s;
    out.push(panel(ox, oy, 790, 480, '2 · The Needle — slot canyon', '2–6 m wide, 20–40 m deep; 8 px = 1 m'));
    out.push(`<rect x="${ox + 2}" y="${oy + 56}" width="786" height="${bottom - oy - 56}" fill="${C.sky}"/>`);
    const cx = ox + 330;
    const L = [[cx - 40, top], [cx - 20, top + 40], [cx - 34, top + 90], [cx - 6, top + 140], [cx - 26, top + 200], [cx - 4, top + 250], [cx - 22, top + 290], [cx - 16, bottom]];
    const R = [[cx + 34, top], [cx + 30, top + 50], [cx + 44, top + 100], [cx + 20, top + 150], [cx + 38, top + 210], [cx + 18, top + 260], [cx + 30, top + 300], [cx + 16, bottom]];
    const curve = (p) => 'M' + p.map((q) => q.join(',')).join(' L');
    out.push(`<path d="${curve(L)} L${ox + 2},${bottom} L${ox + 2},${top} Z" fill="url(#strata)" stroke="${C.ink}" stroke-width="2"/>`);
    out.push(`<path d="${curve(R)} L${ox + 560},${bottom} L${ox + 560},${top} Z" fill="url(#strata)" stroke="${C.ink}" stroke-width="2"/>`);
    // Light shaft.
    out.push(poly([[cx - 30, top], [cx + 26, top], [cx + 10, bottom], [cx - 12, bottom]], C.beam, 'opacity="0.35"'));
    out.push(T(cx + 70, top + 30, 'light shaft at noon (god-ray card,', { size: 12 }) + T(cx + 70, top + 46, 'faded by sun angle)', { size: 12 }));
    out.push(`<line x1="${cx + 66}" y1="${top + 34}" x2="${cx + 10}" y2="${top + 60}" stroke="${C.ink}" stroke-width="1"/>`);
    // Sand floor.
    out.push(poly([[cx - 16, bottom], [cx + 16, bottom], [cx + 16, bottom - 8], [cx - 16, bottom - 6]], C.sand));
    out.push(wraith(cx, bottom - 6, s, false));
    out.push(T(cx + 40, bottom - 4, '← the Wraith, 1.8 m (to scale)', { size: 12, italic: true }));
    // Bake trench vs kit walls.
    out.push(`<rect x="${cx - 44}" y="${top}" width="${80}" height="${bottom - top}" fill="none" stroke="${C.red}" stroke-width="2" stroke-dasharray="7 5"/>`);
    out.push(TL(ox + 580, top + 120, ['RED DASH: the trench', 'the bake cuts (~10 m)', '', 'STRATA INSIDE IT:', 'slot-wall mesh kit,', 'curved, undercut,', 'polished; CPU solids', 'give collision.', '', 'The floor stays', 'terrain: sand you', 'can surf.'], { size: 12 }));
    out.push(dim(ox + 120, top, ox + 120, bottom, '40 m (20–40)', { side: 'right' }));
    out.push(dim(cx - 16, bottom + 24, cx + 16, bottom + 24, '4 m (2–6)'));
  }

  // 3. Wadi: 4 px/m across, ×5 vertical.
  {
    const ox = 20, oy = 580, sx = 4.2, sz = 21, base = oy + 140, depth = 8 * sz;
    out.push(panel(ox, oy, 800, 480, '3 · The Dry Braids — wadi', '30–150 m wide, 3–8 m deep; 4.2 px = 1 m across, VERTICAL ×5'));
    out.push(`<rect x="${ox + 2}" y="${oy + 56}" width="796" height="${420}" fill="${C.sky}"/>`);
    const bed = base + depth;
    const prof = [[ox + 2, base], [ox + 90, base], [ox + 100, bed - 10], [ox + 140, bed], [ox + 190, bed - 6], [ox + 230, bed - 40], [ox + 270, bed - 38], [ox + 300, bed], [ox + 360, bed - 4],
      [ox + 400, bed - 46], [ox + 460, bed - 44], [ox + 500, bed], [ox + 560, bed - 2], [ox + 620, bed - 60], [ox + 700, base - 4], [ox + 798, base - 8]];
    out.push(poly([...prof, [ox + 798, oy + 478], [ox + 2, oy + 478]], C.sandDark, `stroke="${C.ink}" stroke-width="2"`));
    out.push(poly([...prof.slice(1, 15).map(([x, y]) => [x, y + 6]), [ox + 620, bed + 40], [ox + 100, bed + 40]], '#cdb48a', 'opacity="0.7"'));
    // Gravel bars and restored water.
    for (const [x0, x1] of [[ox + 230, ox + 270], [ox + 400, ox + 460]]) out.push(T((x0 + x1) / 2, bed - 52, 'gravel bar', { size: 11, anchor: 'middle', italic: true }));
    for (const [x0, x1] of [[ox + 112, ox + 210], [ox + 290, ox + 380], [ox + 486, ox + 580]]) out.push(`<rect x="${x0}" y="${bed - 12}" width="${x1 - x0}" height="10" fill="${C.water}" opacity="0.75" stroke="${C.water}" stroke-dasharray="5 3"/>`);
    out.push(T(ox + 300, bed + 64, 'blue: thin braided sheets of water at dusk, once restored (the Flood Garden is fed from these)', { size: 12, italic: true, anchor: 'middle', color: C.water }));
    out.push(T(ox + 60, base - 20, 'cut bank (outer bend)', { size: 12 }));
    out.push(T(ox + 650, base - 30, 'gentle inner bank', { size: 12 }));
    out.push(dim(ox + 50, base, ox + 50, bed, '8 m', { side: 'right' }));
    out.push(dim(ox + 90, oy + 92, ox + 700, oy + 92, '150 m (30–150)'));
    out.push(T(ox + 40, oy + 450, 'Use: fast, flat surf lines across the basin; the aqueduct ruins follow the north braid.', { size: 13 }));
  }

  // 4. The rift: 4.6 px/m.
  {
    const ox = 830, oy = 580, s = 4.6, top = oy + 120, bot = top + 60 * s;
    out.push(panel(ox, oy, 790, 480, '4 · The Stride — the rift', '15–40 m wide, ~60 m deep, sheer; 4.6 px = 1 m'));
    out.push(`<rect x="${ox + 2}" y="${oy + 56}" width="786" height="${top - oy - 56}" fill="${C.sky}"/>`);
    out.push(`<rect x="${ox + 2}" y="${top}" width="786" height="${oy + 478 - top}" fill="#1d1512"/>`);
    const cx = ox + 400, half = 20 * s;
    const left = [[ox + 2, top], [cx - half, top], [cx - half + 14, top + 40], [cx - half + 6, top + 90], [cx - half + 30, top + 150], [cx - half + 22, top + 210], [cx - 20, bot - 4], [cx - 10, bot]];
    const right = [[cx + 8, bot], [cx + 22, bot - 10], [cx + half - 30, top + 200], [cx + half - 12, top + 140], [cx + half - 24, top + 80], [cx + half - 6, top + 30], [cx + half, top], [ox + 788, top]];
    out.push(poly([...left, [cx - 10, oy + 478], [ox + 2, oy + 478]], 'url(#strata)', `stroke="${C.ink}" stroke-width="2"`));
    out.push(poly([...right, [ox + 788, oy + 478], [cx + 8, oy + 478]], 'url(#strata)', `stroke="${C.ink}" stroke-width="2"`));
    out.push(poly([[ox + 2, top + 120], [cx - half + 28, top + 120], [cx - half + 22, top + 210], [cx - 20, bot - 4], [cx - 10, oy + 478], [ox + 2, oy + 478]], C.bed, 'opacity="0.85"'));
    out.push(poly([[cx + half - 22, top + 120], [ox + 788, top + 120], [ox + 788, oy + 478], [cx + 8, oy + 478], [cx + 22, bot - 10], [cx + half - 30, top + 200]], C.bed, 'opacity="0.85"'));
    out.push(T(ox + 90, top + 250, 'bedrock under the sandstone', { size: 12, color: '#f0e2cc' }));
    // Glass seams.
    for (const [x, y] of [[cx - half + 8, top + 100], [cx + half - 16, top + 170], [cx - half + 26, top + 190]]) out.push(pl([[x, y], [x + 8, y + 14], [x + 2, y + 26]], C.glass, 3));
    out.push(T(cx + half + 16, top + 176, 'glass seams where the Walker\'s', { size: 12 }) + T(cx + half + 16, top + 192, 'step split the rock (pinpoint glints)', { size: 12 }));
    // Fallen span wedged part way down.
    out.push(poly([[cx - half + 14, top + 60], [cx + half - 14, top + 74], [cx + half - 18, top + 88], [cx - half + 12, top + 76]], C.rock[3], `stroke="${C.ink}" stroke-width="1.5"`));
    out.push(T(cx + half + 16, top + 70, 'a fallen span (some reach a ledge)', { size: 12 }));
    // Glide arc and Ridge/ice bridge.
    out.push(`<path d="M${cx - half - 60},${top - 8} Q${cx},${top - 70} ${cx + half + 70},${top - 4}" fill="none" stroke="${C.red}" stroke-width="2.5" stroke-dasharray="8 6" marker-end="url(#arrRed)"/>`);
    out.push(T(cx, top - 50, 'glide across', { size: 13, weight: 700, color: C.red, anchor: 'middle' }));
    out.push(`<line x1="${cx - half}" y1="${top + 2}" x2="${cx + half}" y2="${top + 2}" stroke="${C.frost}" stroke-width="6" stroke-dasharray="10 5"/>`);
    out.push(T(cx, top + 22, 'Ridge or ice bridge, once known', { size: 12, anchor: 'middle', color: '#1f6d8f', weight: 700 }));
    out.push(dim(ox + 60, top, ox + 60, bot, '60 m', { side: 'right' }));
    out.push(dim(cx - half, oy + 90, cx + half, oy + 90, '40 m (15–40)'));
    out.push(T(ox + 20, oy + 466, 'No floor on foot: falling in means a long fall to a shrine. The Walker must be steered round either end.', { size: 12, italic: true }));
  }
  write('ravine-sections', svgDoc(W, H, out.join('\n')));
}

// ───────────────────────── ravine features (plan view) ─────────────────────────
function ravineFeatures() {
  const W = 1640, H = 860, out = [];
  out.push(T(24, 40, 'Ravines from above — what fills each one, and what it is for', { size: 24, weight: 700 }));
  const pw = 395, ph = 760, py = 70;
  const panels = [
    ['The Red Galleries', 'canyon'], ['The Needle', 'slot canyon'], ['The Dry Braids', 'wadis'], ['The Stride', 'the rift'],
  ];
  panels.forEach(([t, s], i) => out.push(panel(20 + i * (pw + 10), py, pw, ph, t, s)));
  const key = (x, y, color, text, shape = 'dot') => (shape === 'dot' ? `<circle cx="${x}" cy="${y - 4}" r="6" fill="${color}" stroke="${C.ink}"/>` : `<rect x="${x - 6}" y="${y - 10}" width="12" height="12" fill="${color}" stroke="${C.ink}"/>`) + T(x + 14, y, text, { size: 13 });

  // Canyon plan.
  {
    const ox = 20, cx = ox + 200;
    out.push(`<path d="M${cx - 50},${py + 70} C${cx - 80},${py + 200} ${cx - 10},${py + 260} ${cx - 60},${py + 380} S${cx - 30},${py + 520} ${cx - 70},${py + 560} L${cx + 40},${py + 560} C${cx + 70},${py + 500} ${cx + 30},${py + 400} ${cx + 60},${py + 380} S${cx + 10},${py + 200} ${cx + 50},${py + 70} Z" fill="${C.sand}" stroke="${C.rock[2]}" stroke-width="10"/>`);
    out.push(`<path d="M${cx + 55},${py + 210} C${cx + 110},${py + 200} ${cx + 140},${py + 230} ${cx + 165},${py + 210}" fill="none" stroke="${C.rock[2]}" stroke-width="34" opacity="0.55"/>`);
    out.push(T(cx + 70, py + 186, 'side gallery: Sun Gate', { size: 12, weight: 700 }));
    out.push(`<path d="M${cx - 30},${py + 300} a26,18 0 0 1 52,0" fill="none" stroke="${C.rock[4]}" stroke-width="8"/>`);
    out.push(T(cx + 34, py + 304, 'arch', { size: 12 }));
    for (const [x, y] of [[cx - 30, py + 520], [cx - 5, py + 540], [cx + 20, py + 515], [cx, py + 495]]) out.push(`<circle cx="${x}" cy="${y}" r="8" fill="${C.rock[4]}" stroke="${C.ink}"/>`);
    out.push(T(cx + 34, py + 528, 'hoodoos (Frozen Falls)', { size: 12 }));
    for (const y of [py + 130, py + 260, py + 430]) out.push(`<path d="M${cx + 48},${y} l12,-6 l0,12 z" fill="${C.sandDark}" stroke="${C.ink}"/>`);
    out.push(T(cx + 64, py + 134, 'sandfalls off the rim', { size: 12 }));
    out.push(pl([[cx - 64, py + 380], [cx - 90, py + 372], [cx - 110, py + 380], [cx - 130, py + 370]], C.ink, 2, 'stroke-dasharray="3 3"'));
    out.push(T(ox + 18, py + 360, 'Shaper stair', { size: 12 }));
    out.push(TL(ox + 18, py + 610, ['• the natural north–south route along', '  the escarpment foot', '• alcoves and overhangs = shade (G4)', '• 3 side galleries, each a site', '• map: hatched rims; no compass', '  pointing into side galleries'], { size: 13 }));
  }
  // Slot plan.
  {
    const ox = 425, cx = ox + 200;
    const pts = [];
    for (let i = 0; i <= 40; i++) { const y = py + 80 + i * 12; pts.push([cx + Math.sin(i * 0.45) * 60 + Math.sin(i * 1.3) * 10, y]); }
    out.push(pl(pts, C.rock[2], 28, 'opacity="0.35"'));
    out.push(pl(pts, C.sand, 9));
    for (const i of [7, 14, 21, 28, 35]) { const [x, y] = pts[i]; out.push(`<circle cx="${x}" cy="${y}" r="16" fill="${C.beam}" opacity="0.45"/>`); }
    out.push(T(cx + 70, py + 170, 'light shafts at the bends', { size: 12 }));
    for (const i of [10, 20, 30]) { const [x, y] = pts[i]; out.push(`<line x1="${x - 26}" y1="${y}" x2="${x + 26}" y2="${y}" stroke="${C.red}" stroke-width="2" stroke-dasharray="4 3"/>`); }
    out.push(T(cx + 70, py + 330, 'portal cells (red): each bend', { size: 12, color: C.red }) + T(cx + 70, py + 346, 'culls the next', { size: 12, color: C.red }));
    const [hx, hy] = pts[24];
    out.push(`<rect x="${hx - 22}" y="${hy - 14}" width="44" height="28" fill="${C.gold}" stroke="${C.ink}" rx="4"/>` + T(hx - 30, hy + 5, 'Hourglass', { size: 12, weight: 700, anchor: 'end' }));
    out.push(`<path d="M${pts[40][0]},${pts[40][1]} l0,18" stroke="${C.ink}" stroke-width="2" marker-end="url(#arr)"/>` + T(pts[40][0] + 10, pts[40][1] + 16, 'opens into the Galleries', { size: 12 }));
    out.push(TL(ox + 18, py + 610, ['• a sand-surf run down its floor', '  (walls are collision, floor is sand)', '• 250–350 m long, 2–6 m wide', '• the Hourglass sits at a widening', '• flash-flood lore (and real water', '  in the side slot after the release)'], { size: 13 }));
  }
  // Wadi plan.
  {
    const ox = 830;
    const strand = (dy, ph1) => { const p = []; for (let i = 0; i <= 30; i++) { const x = ox + 30 + i * 11.5; p.push([x, py + 160 + dy + Math.sin(i * 0.35 + ph1) * 26]); } return p; };
    for (const [dy, ph1] of [[0, 0], [40, 1.6], [90, 3.1], [130, 0.8]]) out.push(pl(strand(dy, ph1), C.water, 5, 'opacity="0.8"'));
    for (const [x, y] of [[ox + 120, py + 210], [ox + 230, py + 250], [ox + 300, py + 200], [ox + 180, py + 300]]) out.push(`<ellipse cx="${x}" cy="${y}" rx="34" ry="11" fill="#d8ccb4" stroke="${C.soft}"/>`);
    out.push(T(ox + 30, py + 110, 'braided channels split and rejoin', { size: 12 }));
    out.push(T(ox + 30, py + 360, 'grey: gravel bars; blue: channels', { size: 12 }));
    out.push(pl([[ox + 30, py + 420], [ox + 370, py + 420]], C.ink, 2, 'stroke-dasharray="3 5"'));
    for (let x = ox + 40; x < ox + 370; x += 40) out.push(`<rect x="${x}" y="${py + 412}" width="8" height="16" fill="${C.rock[3]}" stroke="${C.ink}"/>`);
    out.push(T(ox + 30, py + 450, 'aqueduct arches follow the north braid', { size: 12 }));
    out.push(TL(ox + 18, py + 610, ['• dry: cracked mud, pale bars — fast', '  flat surf lines across the basin', '• restored: thin sheets of water at', '  dusk, flowers after (D8)', '• the south steering route for the', '  Walker crosses them'], { size: 13 }));
  }
  // Rift plan.
  {
    const ox = 1235, cx = ox + 200;
    const edge = (sgn) => { const p = []; for (let i = 0; i <= 24; i++) p.push([cx + sgn * (14 + (i % 3) * 5) + i * 1.5, py + 80 + i * 21]); return p; };
    const L = edge(-1), R = edge(1);
    out.push(poly([...L, ...R.reverse()], '#1d1512'));
    out.push(`<rect x="${cx - 40}" y="${py + 160}" width="96" height="14" fill="${C.sand}" stroke="${C.ink}"/>` + T(cx + 64, py + 172, 'land bridge', { size: 12 }));
    out.push(`<rect x="${cx - 26}" y="${py + 420}" width="80" height="14" fill="${C.sand}" stroke="${C.ink}"/>` + T(cx + 64, py + 432, 'land bridge', { size: 12 }));
    out.push(`<rect x="${cx - 30}" y="${py + 300}" width="72" height="8" fill="${C.rock[3]}" stroke="${C.ink}" transform="rotate(-8 ${cx} ${py + 304})"/>` + T(cx + 64, py + 306, 'fallen span', { size: 12 }));
    out.push(`<path d="M${cx - 120},${py + 250} Q${cx},${py + 210} ${cx + 120},${py + 250}" fill="none" stroke="${C.red}" stroke-width="2.5" stroke-dasharray="8 6" marker-end="url(#arrRed)"/>` + T(cx - 120, py + 236, 'glide', { size: 12, color: C.red, weight: 700 }));
    out.push(`<path d="M${cx + 120},${py + 90} C${cx + 60},${py + 40} ${cx - 120},${py + 60} ${cx - 140},${py + 140}" fill="none" stroke="${C.gold}" stroke-width="3" stroke-dasharray="10 6" marker-end="url(#arrGold)"/>`);
    out.push(T(cx - 150, py + 100, 'Walker: round', { size: 12, color: '#8a5c00', weight: 700 }) + T(cx - 150, py + 116, 'the north end', { size: 12, color: '#8a5c00', weight: 700 }));
    out.push(TL(ox + 18, py + 610, ['• one long barrier, readable from', '  the Walker\'s back', '• steering into it makes the Walker', '  balk and shake you off', '• crossing on foot: glide, the bridges,', '  later Ridge or an ice bridge'], { size: 13 }));
  }
  write('ravine-features', svgDoc(W, H, out.join('\n')));
}

// ───────────────────────── the sand grammar ─────────────────────────
function sandGrammar() {
  const W = 1500, H = 980, out = [];
  out.push(T(24, 40, 'The sand grammar — every dune puzzle is built from these nine rules', { size: 24, weight: 700 }));
  out.push(T(24, 64, 'G1–G7 need only Frost, so the hub can be solved before the meadow. G8 (Stone) comes with the Walker; G9 (Gale) is always optional.', { size: 14, color: C.soft }));
  const cards = [
    ['G1 Sand flows', ['A face steeper than 34° slides', 'when disturbed; sand fills the', 'lowest place first.'], (x, y) =>
      poly([[x, y + 110], [x + 80, y + 30], [x + 120, y + 30], [x + 240, y + 110]], C.sand, `stroke="${C.sandDark}" stroke-width="2"`) +
      `<path d="M${x + 125},${y + 40} L${x + 190},${y + 95}" stroke="${C.red}" stroke-width="3" marker-end="url(#arrRed)"/>` + T(x + 140, y + 60, '34°', { size: 13, weight: 700 })],
    ['G2 Sand takes the channel', ['Sweep ploughs a channel;', 'flowing sand goes where', 'it is cut.'], (x, y) =>
      `<rect x="${x}" y="${y + 30}" width="240" height="80" fill="${C.sand}"/>` + pl([[x + 20, y + 40], [x + 110, y + 70], [x + 220, y + 100]], C.sandDark, 14) +
      `<path d="M${x + 30},${y + 44} L${x + 200},${y + 96}" stroke="${C.red}" stroke-width="3" marker-end="url(#arrRed)"/>`],
    ['G3 Frost holds sand', ['Frozen sand does not flow,', 'bears weight, stands upright.', 'A frozen sandfall is a pillar.'], (x, y) =>
      `<rect x="${x + 40}" y="${y + 30}" width="22" height="80" fill="${C.frost}" stroke="#1f6d8f" stroke-width="2"/>` + `<path d="M${x + 150},${y + 30} L${x + 150},${y + 110}" stroke="${C.sandDark}" stroke-width="12" stroke-dasharray="3 4"/>` +
      T(x + 51, y + 128, 'frozen', { size: 12, anchor: 'middle' }) + T(x + 150, y + 128, 'running', { size: 12, anchor: 'middle' }) + wraith(x + 75, y + 110, 14, false)],
    ['G4 Sun thaws, shade keeps', ['Frozen sand thaws in ~60 s in', 'sun and lasts in shade.', 'Read the shadows.'], (x, y) =>
      `<rect x="${x}" y="${y + 30}" width="120" height="80" fill="#fff4cf"/><rect x="${x + 120}" y="${y + 30}" width="120" height="80" fill="${C.shade}" opacity="0.35"/>` +
      sun(x + 30, y + 50, 10) + T(x + 60, y + 100, '60 s', { size: 14, weight: 700, anchor: 'middle' }) + T(x + 180, y + 100, 'lasts', { size: 14, weight: 700, anchor: 'middle' }) +
      `<rect x="${x + 50}" y="${y + 60}" width="20" height="20" fill="${C.frost}" opacity="0.5"/><rect x="${x + 170}" y="${y + 60}" width="20" height="20" fill="${C.frost}"/>`],
    ['G5 Wet sand stands', ['Ribbon wets sand: it holds a', '60° face and surfs fast,', 'until it dries.'], (x, y) =>
      poly([[x + 20, y + 110], [x + 80, y + 30], [x + 120, y + 110]], '#b89257', `stroke="${C.water}" stroke-width="3"`) + T(x + 100, y + 60, '60°', { size: 13, weight: 700 }) +
      poly([[x + 140, y + 110], [x + 190, y + 76], [x + 240, y + 110]], C.sand, `stroke="${C.sandDark}" stroke-width="2"`) + T(x + 190, y + 128, 'dry: 34°', { size: 12, anchor: 'middle' })],
    ['G6 Light travels', ['Beams reflect off mirror-stones', 'and glass, light glyphs; ice', 'bends a beam, the beam melts it.'], (x, y) =>
      sun(x + 18, y + 40, 9) + pl([[x + 30, y + 46], [x + 110, y + 96], [x + 160, y + 60], [x + 225, y + 60]], C.beam, 4) +
      `<rect x="${x + 98}" y="${y + 96}" width="26" height="6" fill="${C.glass}" transform="rotate(-20 ${x + 110} ${y + 99})"/>` +
      `<ellipse cx="${x + 160}" cy="${y + 60}" rx="7" ry="16" fill="${C.frost}" stroke="#1f6d8f"/>` + `<circle cx="${x + 232}" cy="${y + 60}" r="9" fill="${C.gold}" stroke="${C.ink}"/>`],
    ['G7 Sand sings', ['A big face booms as it slides;', 'bigger dunes sing lower.', 'A frozen face is silent.'], (x, y) =>
      [[x + 20, 90, 'low'], [x + 100, 60, 'mid'], [x + 175, 40, 'high']].map(([dx, hgt, n]) => poly([[dx, y + 110], [dx + 30, y + 110 - hgt], [dx + 60, y + 110]], n === 'mid' ? C.frost : C.sand, `stroke="${C.sandDark}" stroke-width="2"`) + T(dx + 30, y + 128, n === 'mid' ? 'frozen: silent' : n, { size: 12, anchor: 'middle' })).join('') +
      `<path d="M${x + 60},${y + 30} q8,-8 16,0 M${x + 56},${y + 22} q12,-12 24,0" stroke="${C.ink}" fill="none" stroke-width="2"/>`],
    ['G8 Stone moves ground', ['Ridge raises walls and dams,', 'Shard strikes from range,', 'Bloom digs pits. (Walker)'], (x, y) =>
      `<rect x="${x}" y="${y + 90}" width="240" height="20" fill="${C.sand}"/>` + poly([[x + 40, y + 90], [x + 70, y + 40], [x + 170, y + 40], [x + 200, y + 90]], C.sandDark, `stroke="${C.ink}" stroke-width="2"`) + T(x + 120, y + 72, 'Ridge', { size: 14, weight: 700, anchor: 'middle' })],
    ['G9 Wind strips (optional)', ['Gust strips sand and sets off', 'faces from range; Vortex', 'digs pits. Never required.'], (x, y) =>
      [40, 64, 88].map((dy, i) => `<path d="M${x + 20},${y + dy} q40,-14 80,0 t80,0" fill="none" stroke="${C.soft}" stroke-width="2.5" stroke-dasharray="${i === 1 ? '0' : '6 4'}"/>`).join('')],
  ];
  cards.forEach(([title, lines, pic], i) => {
    const x = 24 + (i % 3) * 492, y = 84 + Math.floor(i / 3) * 296;
    out.push(`<rect x="${x}" y="${y}" width="476" height="282" fill="#fffaf0" stroke="${C.ink}" stroke-width="1.5" rx="6"/>`);
    out.push(T(x + 16, y + 30, title, { size: 19, weight: 700 }));
    out.push(pic(x + 120, y + 50));
    out.push(TL(x + 16, y + 214, lines, { size: 14 }));
  });
  write('sand-grammar', svgDoc(W, H, out.join('\n')));
}

// ───────────────────────── the instruments ─────────────────────────
function instruments() {
  const W = 1640, H = 860, out = [];
  out.push(T(24, 40, 'The Silent Instruments — the three hub sites, laid out', { size: 24, weight: 700 }));
  out.push(T(24, 64, 'Each runs teach → combine → twist in 5–10 minutes, needs only Frost, and lights a third of the Walker\'s glass track.', { size: 14, color: C.soft }));
  const pw = 530, py = 84, ph = 760;
  const step = (x, y, n, color = C.red) => `<circle cx="${x}" cy="${y}" r="12" fill="${color}" stroke="#fff" stroke-width="2"/>` + T(x, y + 5, n, { size: 13, weight: 800, anchor: 'middle', color: '#fff' });

  // A. Sun Gate (plan view of a side gallery).
  {
    const ox = 20;
    out.push(panel(ox, py, pw, ph, 'A · The Sun Gate', 'a side gallery of the Red Galleries, from above'));
    out.push(`<path d="M${ox + 60},${py + 110} L${ox + 470},${py + 110} L${ox + 470},${py + 470} L${ox + 60},${py + 470} Z" fill="${C.sand}" stroke="${C.rock[2]}" stroke-width="16"/>`);
    out.push(`<rect x="${ox + 380}" y="${py + 96}" width="40" height="28" fill="${C.sky}"/>` + T(ox + 400, py + 90, 'east notch (morning)', { size: 12, anchor: 'middle' }));
    out.push(`<rect x="${ox + 46}" y="${py + 340}" width="28" height="40" fill="${C.sky}"/>` + T(ox + 40, py + 395, 'west arch (afternoon)', { size: 12 }));
    // Beam path: notch → mirror 1 → lens → mirror 2 → eye (under sandfall).
    const M1 = [ox + 400, py + 250], LENS = [ox + 260, py + 250], M2 = [ox + 140, py + 250], EYE = [ox + 140, py + 118];
    out.push(pl([[ox + 400, py + 118], M1, LENS, M2, EYE], C.beam, 5, 'opacity="0.9"'));
    out.push(`<rect x="${M1[0] - 18}" y="${M1[1] - 5}" width="36" height="10" fill="${C.glass}" stroke="${C.ink}" transform="rotate(45 ${M1[0]} ${M1[1]})"/>`);
    out.push(`<rect x="${M2[0] - 18}" y="${M2[1] - 5}" width="36" height="10" fill="${C.glass}" stroke="${C.ink}" transform="rotate(-45 ${M2[0]} ${M2[1]})"/>`);
    out.push(`<rect x="${LENS[0] - 34}" y="${LENS[1] - 34}" width="68" height="68" fill="${C.water}" opacity="0.35" stroke="${C.ink}"/>`);
    out.push(`<ellipse cx="${LENS[0]}" cy="${LENS[1]}" rx="8" ry="22" fill="${C.frost}" stroke="#1f6d8f" stroke-width="2"/>`);
    out.push(`<circle cx="${EYE[0]}" cy="${EYE[1] + 8}" r="12" fill="${C.gold}" stroke="${C.ink}" stroke-width="2"/>`);
    out.push(`<path d="M${EYE[0] - 30},${py + 118} L${EYE[0] + 30},${py + 118}" stroke="${C.sandDark}" stroke-width="12" stroke-dasharray="3 4"/>`);
    out.push(`<rect x="${ox + 300}" y="${py + 380}" width="70" height="40" fill="${C.rock[3]}" stroke="${C.ink}"/>` + T(ox + 335, py + 405, 'door', { size: 12, anchor: 'middle' }));
    out.push(pl([[M1[0], M1[1] + 10], [ox + 360, py + 380]], C.beam, 2, 'stroke-dasharray="4 4"'));
    out.push(step(M1[0] + 34, M1[1] - 20, '1') + step(LENS[0], LENS[1] + 52, '2') + step(EYE[0] + 46, EYE[1] + 14, '3'));
    out.push(TL(ox + 20, py + 520, [
      '1 TEACH — strike mirror-stone 1 (turns 45°): the', '   beam lights a glyph and the ledge door opens.',
      '2 COMBINE — Crystallize the basin into an ice lens', '   to bend the beam; it melts in ~20 s, so turn', '   mirror-stone 2 in time.',
      '3 TWIST — a sandfall veils the gate\'s eye: freeze', '   it, shatter it, ~60 s before it re-forms.',
      'PAYOFF — the beam leaves the canyon each day at', '   that hour and points at the Walker.'], { size: 14 }));
  }

  // B. Hourglass (section).
  {
    const ox = 20 + pw + 10;
    out.push(panel(ox, py, pw, ph, 'B · The Hourglass', 'in the Needle slot canyon, in section'));
    const cx = ox + 265;
    out.push(poly([[cx - 140, py + 120], [cx - 40, py + 70], [cx + 60, py + 120]], C.sand, `stroke="${C.sandDark}" stroke-width="2"`) + T(cx + 70, py + 92, 'rim dune: pours forever', { size: 12 }));
    out.push(`<path d="M${cx - 20},${py + 120} L${cx - 20},${py + 150}" stroke="${C.sandDark}" stroke-width="8" stroke-dasharray="3 3"/>`);
    const bowl = (x, y, w) => `<path d="M${x - w},${y} Q${x},${y + 50} ${x + w},${y}" fill="${C.rock[3]}" stroke="${C.ink}" stroke-width="2"/>`;
    out.push(bowl(cx - 20, py + 160, 70) + T(cx + 60, py + 176, 'top bowl', { size: 12 }));
    out.push(`<rect x="${cx - 28}" y="${py + 196}" width="16" height="12" fill="${C.ink}"/>` + T(cx - 60, py + 206, 'sluice', { size: 12, anchor: 'end' }));
    out.push(pl([[cx - 20, py + 208], [cx + 10, py + 260]], C.sandDark, 8));
    out.push(`<circle cx="${cx - 2}" cy="${py + 236}" r="7" fill="${C.frost}" stroke="#1f6d8f" stroke-width="2"/>` + T(cx + 12, py + 236, 'breach: freeze it', { size: 12 }));
    out.push(bowl(cx + 10, py + 280, 90) + T(cx + 110, py + 296, 'middle bowl', { size: 12 }));
    out.push(pl([[cx - 40, py + 296], [cx + 10, py + 302], [cx + 60, py + 296]], C.red, 3, 'stroke-dasharray="5 3"') + T(cx + 10, py + 320, 'Sweep a channel → right', { size: 12, anchor: 'middle', color: C.red, weight: 700 }));
    out.push(pl([[cx - 50, py + 310], [cx - 120, py + 420]], C.sandDark, 8) + pl([[cx + 70, py + 310], [cx + 140, py + 420]], C.sandDark, 8));
    out.push(`<rect x="${cx - 100}" y="${py + 350}" width="22" height="18" fill="${C.frost}" stroke="#1f6d8f" stroke-width="2" transform="rotate(-55 ${cx - 89} ${py + 359})"/>`);
    out.push(T(cx - 150, py + 350, 'freeze the left', { size: 12, anchor: 'end' }) + T(cx - 150, py + 366, 'chute (thaws in sun)', { size: 12, anchor: 'end' }));
    out.push(`<rect x="${cx - 160}" y="${py + 420}" width="80" height="50" fill="none" stroke="${C.ink}" stroke-width="2"/>` + T(cx - 120, py + 490, 'left cradle', { size: 12, anchor: 'middle' }) + T(cx - 120, py + 506, '(pulls door shut)', { size: 12, anchor: 'middle' }));
    out.push(`<rect x="${cx + 100}" y="${py + 420}" width="80" height="50" fill="${C.sand}" stroke="${C.ink}" stroke-width="2"/>` + T(cx + 140, py + 490, 'right cradle', { size: 12, anchor: 'middle' }) + T(cx + 140, py + 506, '(lifts the door)', { size: 12, anchor: 'middle' }));
    out.push(`<rect x="${cx - 20}" y="${py + 400}" width="40" height="90" fill="${C.rock[2]}" stroke="${C.ink}" stroke-width="2"/>` + T(cx, py + 386, 'Needle\'s Eye', { size: 12, anchor: 'middle', weight: 700 }));
    out.push(`<path d="M${cx + 30},${py + 270} q8,-10 16,0 q8,10 16,0" fill="none" stroke="${C.red}" stroke-width="2"/>` + T(cx + 20, py + 256, 'Skitter bulge', { size: 11, color: C.red }));
    out.push(step(cx - 50, py + 236, '1') + step(cx - 70, py + 296, '2') + step(cx - 60, py + 400, '3'));
    out.push(TL(ox + 20, py + 540, [
      '1 TEACH — open the sluice; Crystallize the breach.', '2 COMBINE — Sweep the middle bowl so all the sand', '   goes right.',
      '3 TWIST — the left cradle shuts the door: freeze its', '   chute and fill the right one within ~60 s, or wait', '   for the canyon\'s shadow to keep the frost.',
      'PRESSURE — Skitters spill the bowls; freezing a bowl', '   stops them burrowing. Leaving drains it (reset).'], { size: 14 }));
  }

  // C. Singing Dunes (plan view).
  {
    const ox = 20 + 2 * (pw + 10);
    out.push(panel(ox, py, pw, ph, 'C · The Singing Dunes', 'three star dunes and a resonance ring, from above'));
    const star = (x, y, r, fill, label, above = false) => {
      let d = '';
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; d += (i ? 'L' : 'M') + (x + Math.cos(a) * rr).toFixed(1) + ',' + (y + Math.sin(a) * rr).toFixed(1); }
      return `<path d="${d}Z" fill="${fill}" stroke="${C.sandDark}" stroke-width="2"/>` + T(x, above ? y - r - 10 : y + r + 20, label, { size: 13, weight: 700, anchor: 'middle' });
    };
    const LOW = [ox + 130, py + 200], MID = [ox + 400, py + 230], HIGH = [ox + 250, py + 420];
    out.push(star(...LOW, 80, C.sand, 'LOW (biggest)') + star(...MID, 62, C.frost, 'MIDDLE — freeze first', true) + star(...HIGH, 46, C.sand, 'HIGH'));
    const RING = [ox + 270, py + 290];
    for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; out.push(`<rect x="${RING[0] + Math.cos(a) * 26 - 4}" y="${RING[1] + Math.sin(a) * 26 - 8}" width="8" height="16" fill="${C.rock[4]}" stroke="${C.ink}"/>`); }
    out.push(T(RING[0], RING[1] + 5, 'ring', { size: 11, anchor: 'middle' }));
    out.push(`<path d="M${LOW[0] + 20},${LOW[1] + 50} C${LOW[0] + 80},${HIGH[1] + 20} ${HIGH[0] - 90},${HIGH[1] + 10} ${HIGH[0] - 30},${HIGH[1] - 10}" fill="none" stroke="${C.red}" stroke-width="3" stroke-dasharray="9 5" marker-end="url(#arrRed)"/>`);
    out.push(`<path d="M${HIGH[0] + 40},${HIGH[1] - 10} C${HIGH[0] + 120},${HIGH[1] - 40} ${MID[0] - 20},${MID[1] + 120} ${MID[0]},${MID[1] + 60}" fill="none" stroke="${C.red}" stroke-width="3" stroke-dasharray="9 5" marker-end="url(#arrRed)"/>`);
    out.push(T(ox + 60, py + 380, 'surf off a crest, ride', { size: 12, color: C.red }) + T(ox + 60, py + 396, 'the avalanche, carry', { size: 12, color: C.red }) + T(ox + 60, py + 412, 'speed to the next', { size: 12, color: C.red }));
    out.push(`<path d="M${ox + 420},${py + 380} c20,-30 50,10 30,40 c-20,30 -60,0 -30,-40" fill="none" stroke="${C.soft}" stroke-width="2" stroke-dasharray="4 3"/>` + T(ox + 450, py + 450, 'Whirler', { size: 12, anchor: 'middle' }) + T(ox + 450, py + 466, 'patrol', { size: 12, anchor: 'middle' }));
    out.push(`<rect x="${ox + 30}" y="${py + 490}" width="470" height="36" fill="#fff" stroke="${C.ink}" rx="4"/>` + T(ox + 265, py + 514, 'PHRASE:  LOW  →  HIGH  →  MIDDLE   (each boom ~6 s)', { size: 14, weight: 700, anchor: 'middle' }));
    out.push(TL(ox + 20, py + 560, [
      '1 TEACH — one dune, one boom, one note of light.', '2 COMBINE — play the phrase; ~150 m between dunes,', '   so surf it.',
      '3 TWIST — the middle dune slides in sympathy with', '   the low one: freeze it, then strike the crust', '   when its turn comes.',
      'MASTERY — the whole phrase in one unbroken surf:', '   the Sand-runner\'s robe.'], { size: 14 }));
  }
  write('instruments', svgDoc(W, H, out.join('\n')));
}

// ───────────────────────── quest shape ─────────────────────────
function questShape() {
  const W = 1640, H = 760, out = [];
  out.push(T(24, 40, 'Quest shape — the frost (built) against the dunes (planned)', { size: 24, weight: 700 }));
  const box = (x, y, w, t, sub, fill = '#fff', stroke = C.ink) => `<rect x="${x}" y="${y}" width="${w}" height="54" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` + T(x + w / 2, y + 23, t, { size: 14, weight: 700, anchor: 'middle' }) + T(x + w / 2, y + 42, sub, { size: 12, anchor: 'middle', color: C.soft });
  const arrow = (x1, y1, x2, y2, color = C.ink) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2" marker-end="url(#${color === C.red ? 'arrRed' : 'arr'})"/>`;
  // Frost column.
  out.push(panel(20, 60, 460, 680, 'Frost — one line', 'verbs: go · fight · talk · climb · race · carry'));
  const fr = [['The Empty Robe', 'talk · gestures · race'], ['The Pilgrims\' Fire', 'go · FIGHT · talk'], ['The Watching Stone', 'go · FIGHT · talk · climb'], ['The Held Snow', 'Warden'], ['First Snow', 'go · talk · ring']];
  fr.forEach(([t, s], i) => { out.push(box(110, 130 + i * 100, 280, t, s, i === 3 ? '#e6eef5' : '#fff')); if (i) out.push(arrow(250, 130 + i * 100 - 46, 250, 130 + i * 100 - 2)); });
  out.push(T(250, 650, 'sides: follow tracks + escort · find a den + fight ·', { size: 12, anchor: 'middle', color: C.soft }) + T(250, 668, 'find 6 stones · carry a flame · a timed race', { size: 12, anchor: 'middle', color: C.soft }));
  // Dunes.
  out.push(panel(500, 60, 1120, 680, 'Dunes — a hub of puzzles', 'verbs: read · freeze · cut · trigger · bend light · sing · steer'));
  out.push(box(560, 130, 240, 'Into the Erg', 'Dry Stair (G1) or cold erg (G3)', '#fff'));
  out.push(box(840, 130, 240, 'Wellhouse', 'free the sled (G2)', '#fff'));
  out.push(arrow(800, 157, 838, 157));
  out.push(box(1120, 130, 300, 'The Silent Instruments', 'Sarai: "a light, a clock, a song"', '#fff4d6'));
  out.push(arrow(1080, 157, 1118, 157));
  const inst = [['A · Sun Gate', 'light G6 G3 G4', 590], ['B · Hourglass', 'sand flow G1 G2 G3', 880], ['C · Singing Dunes', 'sound G7 G1 G3', 1170]];
  for (const [t, s, x] of inst) { out.push(box(x, 260, 240, t, s, '#fff4d6', C.gold)); out.push(arrow(1270, 186, x + 120, 258, C.ink)); }
  out.push(T(1290, 360, 'any order · each lights a third', { size: 13, italic: true }) + T(1290, 378, 'of the glass track · Frost only', { size: 13, italic: true }));
  out.push(box(880, 380, 240, 'Follow the Glass', 'the Long Walker (§5.1)', '#e6eef5'));
  for (const [, , x] of inst) out.push(arrow(x + 120, 316, 1000, 378));
  out.push(box(880, 480, 240, 'The Well Rises', 'light the well (G6 on its back)', '#e6eef5'));
  out.push(arrow(1000, 436, 1000, 478));
  out.push(T(1000, 556, 'release: the wadis run at dusk', { size: 12, anchor: 'middle', italic: true }));
  // Side sites.
  const sides = [['1 Mirage Map', 'reading · Frost', 560, 600], ['2 Frozen Falls', 'G3 G4 · Frost', 760, 600], ['3 Glass Battle', 're-enact · + Stone', 960, 600], ['4 Buried Door', 'G1 G8 · Stone', 1160, 600], ['5 Flood Garden', 'water · after release', 1360, 600]];
  for (const [t, s, x, y] of sides) out.push(box(x, y, 180, t, s, '#fbeeee', C.red));
  out.push(T(1060, 690, 'side sites open from Wellhouse; 3 and 4 need Stone (lent at the waking), 5 needs the release', { size: 13, anchor: 'middle', color: C.red }));
  out.push(T(1060, 712, 'fights: none as a goal — Skitters and a Whirler press inside B and C', { size: 13, anchor: 'middle', color: C.soft, italic: true }));
  write('quest-shape', svgDoc(W, H, out.join('\n')));
}

ravineSections();
ravineFeatures();
sandGrammar();
instruments();
questShape();
