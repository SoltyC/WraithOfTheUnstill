// Small, documented adjustments to Babylon internals for the zero-allocation frame loop.
// Each touches a private field; re-verify on Babylon upgrades (tools/capture/heap-profile.mjs
// will show the allocation return if one breaks).

import { RenderingGroup } from '@babylonjs/core/Rendering/renderingGroup.js';

/**
 * Render opaque meshes of the given groups in creation order without sorting.
 * Babylon 9 always sorts opaque sub-meshes (a null comparator falls back to painter sort), and
 * Array.prototype.sort with a comparator allocates. `_RenderSorted` skips sorting when passed
 * a null comparator, so route the group's opaque pass through it.
 * @param {import('@babylonjs/core').Scene} scene
 * @param {number[]} groupIds
 */
export function renderOpaqueUnsorted(scene, groupIds) {
  for (const id of groupIds) {
    const group = scene.renderingManager.getRenderingGroup(id);
    group._renderOpaque = function (subMeshes) {
      RenderingGroup._RenderSorted(subMeshes, null, this._scene.activeCamera, false, this.disableDepthPrePass);
    };
  }
}
