// The lake waves' FFT (realism plan W2; shaders/waterFFT.wgsl.js): the spectrum buffer and the
// three cascades' slope textures. Created with the post chain (its SSR reads the textures) and
// stepped by render/water.js each frame the water is drawn: one evolve pass, a row and a column
// transform (3 × 64² — a few hundredths of a millisecond).

import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ComputeShader } from '@babylonjs/core/Compute/computeShader.js';
import { FFT_N, WAVE_H0, WAVE_LOOP, waveSpectrumCS, waveFftCS } from '../shaders/waterFFT.wgsl.js';

export function createWaterWaves(scene) {
  const engine = scene.getEngine();
  const N = FFT_N;
  const tex = [0, 1, 2].map((c) => {
    const t = new RawTexture(null, N, N, Constants.TEXTUREFORMAT_RGBA, scene, false, false,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_HALF_FLOAT, Constants.TEXTURE_CREATIONFLAG_STORAGE);
    t.name = 'wave-cascade-' + c;
    t.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE; t.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
    return t;
  });
  const h0 = new StorageBuffer(engine, WAVE_H0.byteLength, undefined, 'wave-h0');
  h0.update(WAVE_H0);
  const spec = new StorageBuffer(engine, 3 * N * N * 16, undefined, 'wave-spectrum');
  const params = new Float32Array(4);
  const pBuf = new StorageBuffer(engine, 16, undefined, 'wave-params');
  const pass = (name, code, bind) => {
    const map = {}; bind.forEach(([n], k) => { map[n] = { group: 0, binding: k }; });
    const cs = new ComputeShader(name, engine, { computeSource: code }, { bindingsMapping: map });
    for (const [n, kind, v] of bind) kind === 'buffer' ? cs.setStorageBuffer(n, v) : cs.setStorageTexture(n, v);
    return cs;
  };
  const csSpec = pass('waveSpectrum', waveSpectrumCS, [['h0', 'buffer', h0], ['spec', 'buffer', spec], ['P', 'buffer', pBuf]]);
  const csRows = pass('waveFftRows', waveFftCS(true), [['spec', 'buffer', spec]]);
  const csCols = pass('waveFftCols', waveFftCS(false), [['spec', 'buffer', spec], ['out0', 'tex', tex[0]], ['out1', 'tex', tex[1]], ['out2', 'tex', tex[2]]]);
  let lastT = -1;
  return {
    tex,
    /** Evolve to time t (s); false while a pipeline compiles. */
    update(t) {
      if (t === lastT) return true;
      lastT = t;
      params[0] = t % WAVE_LOOP;
      pBuf.update(params);
      if (!csSpec.dispatch(N / 8, N / 8, 3)) return false;
      if (!csRows.dispatch(N, 3, 1)) return false;
      return csCols.dispatch(N, 3, 1);
    },
  };
}
