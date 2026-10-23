// World lights (PLAN.md V5/V6, Q5): fires, candles, braziers, lanterns, windows, the moon under a
// fallen roof — registered once by the systems that own them, which move them and set their level.
// Each frame every lit one near the camera is binned into the world-light grid (render/lightGrid.js:
// 64 x 64 cells of 4 m around the camera, <= 8 lights per cell, <= 512 lights, faded over the grid's
// last 32 m) and the grid is uploaded in one storage-buffer write. The verbs' four slots are not
// touched (game/bending). Allocation-free per frame.

import { LightGrid } from '../render/lightGrid.js';

/** Flicker per kind: depth, two rates (rad/s). */
const FLICKER = { fire: [0.22, 7.1, 12.7], candle: [0.08, 9.3, 15.1], lamp: [0.04, 5.3, 8.1], bounce: [0, 0, 0] };

/** Night 0 (day) … 1 (night) from the hour, eased across dawn and dusk. */
export function nightAt(tod) {
  const s = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return tod < 12 ? 1 - s(5.5, 7.5, tod) : s(17.4, 19.4, tod);
}

/** Street and door lanterns ('lamp') reach this much further than their nominal radius: the shader's
 *  falloff ((1 - d/r)^2 over 1 + 0.35 d^2) is tight, and a lantern should pool across the cobbles. */
export const LAMP_REACH = 1.45;

/** Kinds of village plot with lit windows that spill light into the street. */
const SPILL_KINDS = new Set(['house', 'house2', 'shop', 'workshop', 'chapel', 'hall']);
export const SPILL_SHARE = 0.6, SPILL_MAX = 150;

/** Integer hash of a plot seed -> 0..1 (deterministic, order independent). */
export function hash01(n) {
  let h = (Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 0..1 how far into the small hours the village is (windows go dark after 23:30, back at dawn). */
export function lateNight(tod) {
  const s = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return tod >= 12 ? s(23.5, 24.5, tod) : 1 - s(3.5, 4.5, tod);
}

/** Which village sites throw window light into the street: ~60 % of the lived-in plots, chosen by plot
 *  seed. Returns [{ site, fx, fz, phase, hour }] — fx, fz the unit outward direction, hour 0..1 the
 *  late-night threshold at which this house's lamp goes out. At most SPILL_MAX. */
export function planWindowSpill(sites) {
  const out = [];
  for (let i = 0; i < sites.length && out.length < SPILL_MAX; i++) {
    const pl = sites[i].plot;
    if (!pl || !SPILL_KINDS.has(pl.kind) || !(hash01(pl.seed) < SPILL_SHARE)) continue;
    out.push({ site: i, fx: Math.sin(sites[i].facing), fz: Math.cos(sites[i].facing), out: pl.d / 2 + 0.2, phase: hash01(pl.seed + 7) * 6.28, hour: hash01(pl.seed + 31) });
  }
  return out;
}

/** Level of a house's window light: the night factor, dimmed to nothing once its own hour comes late. */
export function spillLevel(night, tod, hour) {
  const k = lateNight(tod) * 0.6, e = 0.08;
  return night * (1 - Math.min(1, Math.max(0, (k - hour * 0.6) / e)));
}

/** Write every lit light of `list` into `grid` (pure: the system and the tests share it). */
export function fillLightGrid(grid, list, camX, camZ, t) {
  grid.begin(camX, camZ);
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (!(l.level > 0)) continue;
    const f = FLICKER[l.kind] || FLICKER.lamp;
    const flick = 1 - f[0] + f[0] * (0.55 + 0.25 * Math.sin(t * f[1] + l.phase) + 0.2 * Math.sin(t * f[2] + l.phase * 2.3));
    grid.add(l.x, l.y, l.z, l.kind === 'lamp' ? l.radius * LAMP_REACH : l.radius, l.color[0], l.color[1], l.color[2], l.intensity * l.level * flick);
  }
}

/** @param {any} g  shared boot context */
export function addLightSystem(g) {
  const { loop, camera, clock, params } = g;
  const buffer = g.content.clipmap.lightGrid;
  const grid = new LightGrid();
  const list = [];
  g.worldLights = {
    /** 0 by day … 1 at night (this frame). */
    night: 0,
    /** The grid last uploaded (dev overlay / tests). */
    grid,
    /** Register { x, y, z, radius, color: [r, g, b], intensity, kind ('fire' | 'candle' | 'lamp' |
     *  'bounce') }; returns the record — its owner moves it and sets `level` (0 = off). */
    add(l) { const r = { level: 1, phase: list.length * 1.7, ...l }; list.push(r); return r; },
  };
  loop.add({ name: 'lights', update: () => {
    g.worldLights.night = nightAt(params.v.timeOfDay);
    fillLightGrid(grid, list, camera.position.x, camera.position.z, clock.simTime);
    buffer.update(grid.data);
  } });
}
