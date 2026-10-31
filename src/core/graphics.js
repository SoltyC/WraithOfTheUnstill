// Graphics profiles (user, 2026-10-31): Low, Medium, High and Ultra, chosen in Settings (the title
// screen's and the pause menu's). Measured on the 3060 (docs/perf/graphics-costs.json): at render
// scale 0.7 most of a frame does not scale with resolution — shadows, trees, grass, rocks and the
// terrain itself — so the presets thin geometry and shadows as well as resolution.
//
// Two kinds of setting:
//   • live — render scale and its floor, the dynamic-resolution target, post effects, particles,
//     rocks: applied the moment they change (apply());
//   • boot — shadow map size, grass rings, tree counts and distance: read once while the world is
//     built (`boot`), so they take effect on the next start (Settings says so and offers it).
//
// Stored in localStorage ('wraith-graphics'): { preset, ...overrides }. With nothing stored, the first
// start picks from the GPU: integrated graphics start on Low, others on High (detectPreset()).

const KEY = 'wraith-graphics';

/** Every setting, per preset. Keys marked boot take effect on restart. */
export const PRESETS = {
  low: {
    renderScale: 0.5, minScale: 0.45, targetMs: 15.5,
    shadows: 'low', grass: 'low', trees: 'low',
    ao: false, ssr: false, bloom: false, shafts: false, clouds: true, heat: false, mirage: false, sharpen: false,
    particles: false, rocks: true,
  },
  medium: {
    renderScale: 0.67, minScale: 0.55, targetMs: 15.5,
    shadows: 'medium', grass: 'medium', trees: 'medium',
    ao: true, ssr: false, bloom: true, shafts: false, clouds: true, heat: true, mirage: false, sharpen: false,
    particles: true, rocks: true,
  },
  high: {
    renderScale: 0.8, minScale: 0.6, targetMs: 15,
    shadows: 'high', grass: 'high', trees: 'high',
    ao: true, ssr: true, bloom: true, shafts: true, clouds: true, heat: true, mirage: true, sharpen: true,
    particles: true, rocks: true,
  },
  ultra: {
    renderScale: 1, minScale: 0.7, targetMs: 15,
    shadows: 'high', grass: 'high', trees: 'high',
    ao: true, ssr: true, bloom: true, shafts: true, clouds: true, heat: true, mirage: true, sharpen: true,
    particles: true, rocks: true,
  },
};
export const PRESET_NAMES = ['low', 'medium', 'high', 'ultra'];
/** Settings read while the world is built: a change applies on the next start. */
export const BOOT_KEYS = ['shadows', 'grass', 'trees'];

/** What the boot levels mean (read by the renderers). */
export const SHADOW_LEVELS = { low: { size: 1024, treeCascades: 1 }, medium: { size: 1536, treeCascades: 2 }, high: { size: 2048, treeCascades: 3 } };
/** Grass rings: [cell (m), clumps across, blades per clump, segments] (shaders/grass.wgsl.js). */
export const GRASS_LEVELS = {
  low: [[0.3, 80, 3, 2], [1.0, 70, 2, 1]],
  medium: [[0.22, 100, 4, 3], [0.66, 100, 3, 2], [2.0, 90, 2, 1]],
  high: [[0.22, 110, 6, 4], [0.66, 110, 4, 2], [2.0, 110, 3, 1]],
};
/** Trees: instance budgets per variant (near, far, the shadow-only middle) and the placement radius scale. */
export const TREE_LEVELS = { low: { near: 50, far: 110, mid: 60, radius: 0.6 }, medium: { near: 70, far: 180, mid: 110, radius: 0.8 }, high: { near: 90, far: 260, mid: 160, radius: 1 } };

function read() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && typeof s === 'object' ? s : null; } catch { return null; }
}
function write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window */ } }

/** The stored choice, or null on a first start. */
const stored = read();
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

/** The current settings (a preset plus any overrides). */
export const graphics = { preset: 'high', ...PRESETS.high };
function resolve(s) {
  const preset = s && PRESET_NAMES.includes(s.preset) ? s.preset : 'high';
  Object.assign(graphics, PRESETS[preset], s || {}, { preset });
}
resolve(stored);
// A URL can force a preset for one session (?gfx=low): bots, benchmarks, the playtest page.
if (PRESET_NAMES.includes(q.get('gfx') || '')) resolve({ preset: q.get('gfx') });

/** The settings the world is built with (boot keys): what the renderers read while they are made.
 *  Filled from the current choice; main.js calls freezeBoot() after detectPreset(), before the world. */
export const boot = { shadows: SHADOW_LEVELS.high, grass: GRASS_LEVELS.high, trees: TREE_LEVELS.high, names: { shadows: 'high', grass: 'high', trees: 'high' } };
export function freezeBoot() {
  if (Object.isFrozen(boot)) return;
  boot.shadows = SHADOW_LEVELS[graphics.shadows] || SHADOW_LEVELS.high;
  boot.grass = GRASS_LEVELS[graphics.grass] || GRASS_LEVELS.high;
  boot.trees = TREE_LEVELS[graphics.trees] || TREE_LEVELS.high;
  boot.names = { shadows: graphics.shadows, grass: graphics.grass, trees: graphics.trees };
  Object.freeze(boot);
}

/** True once a boot setting differs from what this session was built with (a restart applies it). */
export function needsRestart() { return BOOT_KEYS.some((k) => graphics[k] !== boot.names[k]); }

/** Pick a preset from the GPU on a first start (nothing stored, no ?gfx): integrated graphics → Low. */
export async function detectPreset() {
  if (stored || q.get('gfx')) return graphics.preset;
  let preset = 'high';
  try {
    const ad = await navigator.gpu?.requestAdapter?.({ powerPreference: 'high-performance' });
    const info = ad ? (ad.info || (ad.requestAdapterInfo ? await ad.requestAdapterInfo() : null)) : null;
    const s = info ? [info.vendor, info.architecture, info.device, info.description].join(' ').toLowerCase() : '';
    const integrated = /intel/.test(s) && !/arc|dg2|alchemist|battlemage/.test(s) || /apple/.test(s) && /m1\b|m2\b/.test(s) || /amd|ati/.test(s) && /radeon\(tm\) graphics|vega \d|integrated|rdna2? .*apu/.test(s);
    if (!ad) preset = 'low'; else if (integrated) preset = 'low';
  } catch { /* keep high */ }
  setPreset(preset);
  return preset;
}

/** Choose a preset (drops overrides). */
export function setPreset(name) {
  if (!PRESET_NAMES.includes(name)) return;
  for (const k of Object.keys(graphics)) delete graphics[k];
  Object.assign(graphics, PRESETS[name], { preset: name });
  write({ preset: name });
  apply();
}
/** Change one setting (the preset stays as the base; the label becomes Custom when it differs). */
export function setGraphic(key, value) {
  graphics[key] = value;
  const s = { preset: graphics.preset };
  for (const k of Object.keys(PRESETS.high)) if (graphics[k] !== PRESETS[graphics.preset][k]) s[k] = graphics[k];
  write(s);
  apply();
}
/** Custom when any setting differs from its preset. */
export function isCustom() { return Object.keys(PRESETS.high).some((k) => graphics[k] !== PRESETS[graphics.preset][k]); }

let target = null;
/** Bind the live levers (the game's context): then apply() pushes the settings into the running game. */
export function bindGraphics(g) { target = g; apply(); }

/** Push the live settings into the game. */
export function apply() {
  const g = target;
  if (!g) return;
  const P = g.params;
  if (P) { P.v.renderScale = graphics.renderScale; P.v.targetMs = graphics.targetMs; P.version++; }
  if (g.dynamicResMin) g.dynamicResMin(graphics.minScale);
  const T = g.setToggle;
  if (T) {
    T('postAo', graphics.ao); T('postSsr', graphics.ssr); T('postBloom', graphics.bloom); T('postShafts', graphics.shafts);
    T('postClouds', graphics.clouds); T('postHeat', graphics.heat); T('postMirage', graphics.mirage); T('postSharpen', graphics.sharpen);
    T('crestDust', graphics.particles); T('spindrift', graphics.particles);
  }
}
