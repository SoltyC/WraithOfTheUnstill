// Photo spots (BRIEF §12.1): named camera bookmarks with time and weather. The dev overlay
// lists them; the Playwright capture script loads `?spot=<id>&capture=1` for reproducible shots.

import spotData from '../../data/photo-spots.json';
import { params, setParam } from '../core/params.js';
import { worldState } from '../game/worldState.js';

/** @typedef {{ id: string, biome: string, label: string, time: number, weather: string, player?: number[],
 *   camera: { mode: 'follow', yaw: number, pitch: number, dist: number, fov?: number } | { mode: 'free', pos: number[], yaw: number, pitch: number, fov: number } }} PhotoSpot */

/** @type {PhotoSpot[]} */
export const photoSpots = spotData.spots;

export function findSpot(id) { return photoSpots.find((s) => s.id === id) || null; }

/**
 * Apply a spot to the world. `game` supplies the player controller and camera.
 * @param {PhotoSpot} spot
 * @param {{ controller: import('../character/capsuleController.js').CapsuleController, arm: import('../camera/springArm.js').SpringArmCamera }} game
 */
export function applySpot(spot, game) {
  setParam('timeOfDay', spot.time);
  worldState.weather = spot.weather;
  const { controller, arm } = game;
  if (spot.player) {
    controller.god = false;
    controller.teleport(spot.player[0], spot.player[1]);
    controller.yaw = spot.camera.yaw;
  }
  const c = spot.camera;
  if (c.mode === 'free') {
    arm.setPose(c.pos[0], c.pos[1], c.pos[2], c.yaw, c.pitch, c.fov);
  } else {
    arm.setFree(false);
    arm.yaw = c.yaw;
    arm.pitch = c.pitch;
    arm.zoomTarget = c.dist;
    arm.snap(controller.pos);
  }
}

/** Serialise the current view as a free-camera spot (copied from the overlay). */
export function currentViewAsSpot(id, arm, controller) {
  const p = arm.camera.position;
  const r = (n) => Math.round(n * 1000) / 1000;
  return {
    id, biome: worldState.biome, label: id, time: r(params.v.timeOfDay), weather: worldState.weather,
    player: [r(controller.pos.x), r(controller.pos.z)],
    camera: { mode: 'free', pos: [r(p.x), r(p.y), r(p.z)], yaw: r(arm.yaw), pitch: r(arm.pitch), fov: r(arm.fov) },
  };
}
