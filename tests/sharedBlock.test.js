// Data shared by many draws lives in one buffer, never in each material's uniforms (render/sharedBlock.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSharedBlock } from '../src/render/sharedBlock.js';
import { WIND_DECL } from '../src/shaders/wind.wgsl.js';
import { archVertexWGSL, archFragmentWGSL } from '../src/shaders/architecture.wgsl.js';

describe('shared blocks', () => {
  const engine = () => ({ writes: [], createUniformBuffer(d, label) { return { d, label }; }, updateUniformBuffer(b, d) { this.writes.push([b, d]); } });
  it('writes its own data to its own buffer, or the data it is given', () => {
    const e = engine(), a = new Float32Array(4), b = new Float32Array(4), s = createSharedBlock(e, a, 'x');
    s.update(); s.update(b);
    expect(e.writes[0]).toEqual([s.getBuffer(), a]);
    expect(e.writes[1][1]).toBe(b);
  });
  it('wind and sites take no storage slot: materials sit at the core limit of 8 a stage', () => {
    for (const code of [WIND_DECL, archVertexWGSL, archFragmentWGSL]) expect(code).not.toMatch(/var<storage[^>]*>\s+(windBlock|archSites)/);
    expect(WIND_DECL).toMatch(/var<uniform> windBlock/);
    expect(archVertexWGSL).toMatch(/var<uniform> archSites/);
  });
  it('no material copies the wind or the sites per draw', () => {
    for (const f of ['trees', 'grass', 'groundcover', 'motes', 'water', 'sandDust', 'sandStreaks', 'architecture']) {
      expect(readFileSync(`src/render/${f}.js`, 'utf8'), f).not.toMatch(/setArray4\('(windField|sites|siteGlow|siteChar)'/);
    }
  });
});
