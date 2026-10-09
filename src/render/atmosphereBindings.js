// Binds the atmosphere's textures and buffers to a ShaderMaterial that includes ATMO_MATERIAL_WGSL.
export function bindAtmosphere(mat, atmo) {
  mat.setTexture('transmittanceLut', atmo.transmittanceLut);
  mat.setTexture('skyViewSun', atmo.skyViewSun);
  mat.setTexture('skyViewMoon', atmo.skyViewMoon);
  mat.setTexture('aerialLut', atmo.aerialLut);
  mat.setTexture('canopyTex', atmo.canopyTex);
  mat.setStorageBuffer('atmoParams', atmo.atmoParams);
  mat.setStorageBuffer('atmoLight', atmo.atmoLight);
}
