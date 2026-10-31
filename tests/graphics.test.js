import { describe, it, expect } from 'vitest';
import { graphics, PRESETS, PRESET_NAMES, setPreset, setGraphic, isCustom, needsRestart, boot, freezeBoot, GRASS_LEVELS, SHADOW_LEVELS, TREE_LEVELS, apply, bindGraphics } from '../src/core/graphics.js';

describe('graphics presets', () => {
  it('every preset sets every setting, and lower presets never cost more than higher ones', () => {
    const keys = Object.keys(PRESETS.high);
    for (const p of PRESET_NAMES) expect(Object.keys(PRESETS[p]).sort()).toEqual(keys.sort());
    for (let i = 1; i < PRESET_NAMES.length; i++) expect(PRESETS[PRESET_NAMES[i]].renderScale).toBeGreaterThanOrEqual(PRESETS[PRESET_NAMES[i - 1]].renderScale);
    const verts = (rings) => rings.reduce((s, [, n, b, seg]) => s + n * n * b * (seg + 1) * 2, 0);
    expect(verts(GRASS_LEVELS.low)).toBeLessThan(verts(GRASS_LEVELS.medium)); expect(verts(GRASS_LEVELS.medium)).toBeLessThan(verts(GRASS_LEVELS.high));
    expect(SHADOW_LEVELS.low.size).toBeLessThan(SHADOW_LEVELS.high.size); expect(TREE_LEVELS.low.far).toBeLessThan(TREE_LEVELS.high.far);
  });
  it('a preset is applied whole; one change makes it custom; a boot setting asks for a restart', () => {
    freezeBoot();
    setPreset('medium');
    expect(graphics.preset).toBe('medium'); expect(isCustom()).toBe(false); expect(graphics.renderScale).toBe(PRESETS.medium.renderScale);
    setGraphic('bloom', !PRESETS.medium.bloom);
    expect(isCustom()).toBe(true); expect(graphics.preset).toBe('medium');
    setPreset(boot.names.grass === 'high' ? 'high' : boot.names.grass);
    expect(needsRestart()).toBe(false);
    setGraphic('grass', boot.names.grass === 'low' ? 'high' : 'low');
    expect(needsRestart()).toBe(true);
  });
  it('pushes the live settings into the game: render scale, its floor, the frame target and the toggles', () => {
    const set = {}, g = { params: { v: { renderScale: 0, targetMs: 0 }, version: 0 }, setToggle: (k, on) => { set[k] = on; }, dynamicResMin: (m) => { g.min = m; } };
    bindGraphics(g); setPreset('low');
    expect(g.params.v.renderScale).toBe(PRESETS.low.renderScale); expect(g.min).toBe(PRESETS.low.minScale);
    expect(set.postAo).toBe(false); expect(set.postSharpen).toBe(false);
    setPreset('ultra'); apply();
    expect(set.postAo).toBe(true); expect(g.params.v.renderScale).toBe(1);
  });
});
