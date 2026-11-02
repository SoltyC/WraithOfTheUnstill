// One uniform buffer shared by reference between materials: written once, bound by every draw. An array set on a material
// is copied into that material's own uniforms for each draw (architecture 23 KB, wind 4.5 KB). Storage buffers would do the same
// job, but materials already sit at the core limit of 8 per stage (the only limit a weak GPU promises), and this takes none.

/** @param {Float32Array} data  @param {string} label  @returns {{ getBuffer(): any, update(from?: Float32Array): void }} what ShaderMaterial.setUniformBuffer takes */
export function createSharedBlock(engine, data, label) {
  const buffer = engine.createUniformBuffer(data, label);
  return { getBuffer: () => buffer, update(from = data) { engine.updateUniformBuffer(buffer, from); } };
}
