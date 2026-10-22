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

/** Write every lit light of `list` into `grid` (pure: the system and the tests share it). */
export function fillLightGrid(grid, list, camX, camZ, t) {
  grid.begin(camX, camZ);
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (!(l.level > 0)) continue;
    const f = FLICKER[l.kind] || FLICKER.lamp;
    const flick = 1 - f[0] + f[0] * (0.55 + 0.25 * Math.sin(t * f[1] + l.phase) + 0.2 * Math.sin(t * f[2] + l.phase * 2.3));
    grid.add(l.x, l.y, l.z, l.radius, l.color[0], l.color[1], l.color[2], l.intensity * l.level * flick);
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
