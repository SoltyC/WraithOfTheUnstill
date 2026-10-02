// Binds cascaded shadow maps and their data to a receiving ShaderMaterial (SHADOW_RECEIVE_WGSL).
export function bindShadows(mat, shadows) {
  for (let c = 0; c < shadows.maps.length; c++) mat.setTexture('shadowMap' + c, shadows.maps[c]);
  mat.setStorageBuffer('shadowData', shadows.shadowData);
}
