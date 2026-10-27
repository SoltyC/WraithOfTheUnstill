import { describe, expect, it, vi } from 'vitest';

const { passes } = vi.hoisted(() => ({ passes: [] }));
vi.mock('../src/post/post.js', () => ({
  storageTexture: () => ({ dispose: vi.fn() }),
  computePass: (_engine, label) => {
    const pass = { label, dispatch: vi.fn(() => true) };
    passes.push(pass); return pass;
  },
}));
import { createFog } from '../src/post/fog.js';

function setup() {
  passes.length = 0;
  let resize;
  const post = { width: 1280, height: 720, onResize: (fn) => { resize = fn; }, onParams() {} };
  const fog = createFog(post, { getEngine: () => ({}) }, {}, { maps: [] });
  return { fog, haze: passes.find((p) => p.label === 'hazeShafts'), resize: (w, h) => resize(w, h) };
}

describe('dormant haze pipeline warmup', () => {
  it('warms once in open air, including when weather volumes are disabled', () => {
    const { fog, haze } = setup(); fog.on = false;
    fog.run(); fog.run();
    expect(haze.dispatch).toHaveBeenCalledExactlyOnceWith(1, 1, 1);
  });
  it('retries asynchronous compilation until the dispatch succeeds', () => {
    const { fog, haze } = setup();
    haze.dispatch.mockReturnValueOnce(false).mockReturnValueOnce(false);
    fog.run(); fog.run(); fog.run(); fog.run();
    expect(haze.dispatch).toHaveBeenCalledTimes(3);
  });
  it('still renders full-resolution haze when entering a forest', () => {
    const { fog, haze } = setup(); fog.run();
    haze.dispatch.mockClear(); fog.haze.density = 0.0032; fog.run();
    expect(haze.dispatch).toHaveBeenCalledExactlyOnceWith(80, 45, 1);
  });
  it('warms replacement resources after a render-size change', () => {
    const { fog, resize } = setup(); fog.run(); resize(1920, 1080);
    const replacement = passes.at(-1); fog.run(); fog.run();
    expect(replacement.label).toBe('hazeShafts');
    expect(replacement.dispatch).toHaveBeenCalledExactlyOnceWith(1, 1, 1);
  });
});
