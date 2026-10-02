// Dev overlay (BRIEF §12.1). Hidden by default; F1 or ` toggles it.
// Sections: performance (frame graph, 1% low, draws, triangles, GPU memory, JS heap, streaming
// queue), late-pipeline log, toggles, quality presets, art sliders, world tools, photo spots.
//
// Text stats refresh on a throttled interval (4 Hz) — the only place strings are built, and
// only while the overlay is open. The graph redraws every frame while open (no allocation).

import './overlay.css';
import { frameStats } from '../../core/loop.js';
import { clock } from '../../core/clock.js';
import { gpuStats, onLatePipeline } from '../../core/gpuInstrument.js';
import { paramDefs, params, qualityPresets, setParam } from '../../core/params.js';
import { toggleDefs, toggles, setToggle } from '../../core/systems.js';
import { input, Action, releasePointer } from '../../input/actions.js';
import { FrameGraph } from './frameGraph.js';
import { buildWorldTools } from './worldTools.js';

const STAT_INTERVAL = 0.25;

/** Tiny DOM helper. */
export function el(tag, props, ...children) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    if (k === 'class') e.className = props[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]);
    else if (k in e) e[k] = props[k];
    else e.setAttribute(k, props[k]);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

const MB = 1 / (1024 * 1024);

export class DevOverlay {
  /** @param {any} game */
  constructor(game) {
    this.game = game;
    this.open = false;
    this.acc = 0;
    this.root = el('div', { class: 'dev', id: 'dev-overlay' });
    this.flag = el('div', { class: 'late-flag', id: 'late-flag' });
    document.body.append(this.root, this.flag);
    /** @type {Record<string, HTMLElement>} */
    this.v = {};
    this._buildStats();
    this._buildLate();
    this._buildToggles();
    this._buildArt();
    this.root.append(buildWorldTools(game, el));
    this.sliderRefresh = [];
    this.root.addEventListener('focusin', (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') input.gameHasFocus = false; });
    this.root.addEventListener('focusout', () => { input.gameHasFocus = true; });
    onLatePipeline(() => this._refreshLate());
    this.enabled = true;
  }

  _stat(grid, key, label) {
    const v = el('span', { class: 'v' }, '–');
    grid.append(el('span', { class: 'k' }, label), v);
    this.v[key] = v;
  }

  _buildStats() {
    const canvas = el('canvas', { class: 'graph' });
    this.graph = new FrameGraph(canvas, frameStats);
    const grid = el('div', { class: 'stat-grid' });
    this._stat(grid, 'fps', 'fps');
    this._stat(grid, 'low', '1% low');
    this._stat(grid, 'avg', 'avg ms');
    this._stat(grid, 'med', 'median');
    this._stat(grid, 'p99', 'p99 ms');
    this._stat(grid, 'max', 'max ms');
    this._stat(grid, 'hitch', 'hitches');
    this._stat(grid, 'draws', 'draws');
    this._stat(grid, 'tris', 'tris');
    this._stat(grid, 'gpu', 'GPU MB');
    this._stat(grid, 'heap', 'heap MB');
    this._stat(grid, 'stream', 'stream q');
    this._stat(grid, 'pipes', 'pipelines');
    this._stat(grid, 'res', 'res');
    this.adapter = el('div', { class: 'note' }, '');
    this.root.append(el('h3', null, 'Performance'), canvas, grid, this.adapter);
  }

  _buildLate() {
    this.lateBox = el('div', { class: 'ok' }, 'none — clean');
    this.root.append(el('h3', null, 'Late pipelines'), this.lateBox);
  }

  _refreshLate() {
    const n = gpuStats.late.length;
    if (n === 0) { this.lateBox.className = 'ok'; this.lateBox.textContent = gpuStats.armed ? 'none — clean' : 'detector arms when loading ends'; this.flag.classList.remove('on'); return; }
    this.lateBox.className = 'late';
    let s = '';
    const from = Math.max(0, n - 8);
    for (let i = from; i < n; i++) { const e = gpuStats.late[i]; s += (e.t / 1000).toFixed(2) + 's ' + e.kind + ' ' + e.label + '\n'; }
    this.lateBox.textContent = n + ' late pipeline(s):\n' + s;
    this.flag.textContent = 'LATE PIPELINES: ' + n;
    this.flag.classList.add('on');
  }

  _buildToggles() {
    const box = el('div', { class: 'toggles' });
    this.toggleBox = box;
    this.root.append(el('h3', null, 'Systems & post'), box);
    const presets = el('div', { class: 'btns' });
    for (const name in qualityPresets) {
      presets.append(el('button', { onclick: () => { const p = qualityPresets[name]; for (const k in p) setParam(k, p[k]); this._syncSliders(); } }, name));
    }
    this.root.append(el('h3', null, 'Quality preset'), presets);
  }

  /** Rebuild toggle checkboxes (systems register toggles during boot). */
  refreshToggles() {
    this.toggleBox.textContent = '';
    for (const d of toggleDefs) {
      const cb = el('input', { type: 'checkbox', checked: toggles.on[d.key], onchange: (e) => setToggle(d.key, e.target.checked) });
      this.toggleBox.append(el('label', { class: 'toggle', title: d.group }, cb, d.label));
    }
  }

  _buildArt() {
    const groups = {};
    this.sliders = [];
    for (const d of paramDefs) {
      if (!groups[d.group]) {
        groups[d.group] = el('div');
        this.root.append(el('h3', null, d.group), groups[d.group]);
      }
      const num = el('span', { class: 'num' }, String(d.value));
      const r = el('input', { type: 'range', min: d.min, max: d.max, step: d.step, value: d.value });
      r.addEventListener('input', () => { setParam(d.key, parseFloat(r.value)); num.textContent = r.value; });
      groups[d.group].append(el('div', { class: 'row' }, el('label', null, d.label), r, num));
      this.sliders.push({ d, r, num });
    }
  }

  _syncSliders() {
    for (const s of this.sliders) {
      const v = params.v[s.d.key];
      if (parseFloat(s.r.value) !== v) { s.r.value = String(v); s.num.textContent = v.toFixed(2); }
    }
  }

  toggle(force) {
    this.open = force !== undefined ? force : !this.open;
    this.root.classList.toggle('open', this.open);
    if (this.open) { releasePointer(); this.graph.resize(); this._refreshText(); }
    input.gameHasFocus = true;
  }

  /** Late system: runs after render every frame. */
  update() {
    const dt = clock.realDt;
    if (input.pressed[Action.DevOverlay]) this.toggle();
    if (!this.open) return;
    this.graph.draw();
    this.acc += dt > 0 ? dt : 1 / 60;
    if (this.acc >= STAT_INTERVAL) { this.acc = 0; this._refreshText(); }
  }

  _refreshText() {
    frameStats.summarize();
    const s = frameStats, v = this.v, g = this.game;
    v.fps.textContent = s.fps.toFixed(1);
    v.low.textContent = s.low1Fps.toFixed(1);
    v.low.className = 'v ' + (s.low1Fps >= 60 ? 'good' : 'bad');
    v.avg.textContent = s.avgMs.toFixed(2);
    v.med.textContent = s.medianMs.toFixed(2);
    v.p99.textContent = s.p99Ms.toFixed(2);
    v.max.textContent = s.maxMs.toFixed(1);
    v.hitch.textContent = String(s.hitches);
    v.hitch.className = 'v ' + (s.hitches === 0 ? 'good' : 'bad');
    v.draws.textContent = String(gpuStats.drawCallsLastFrame);
    // Babylon's perf counters are disabled (babylonTweaks): sum enabled meshes' index counts.
    let idx = 0;
    const meshes = g.scene.meshes;
    for (let i = 0; i < meshes.length; i++) if (meshes[i].isEnabled() && meshes[i].isVisible) idx += meshes[i].getTotalIndices();
    v.tris.textContent = (idx / 3 / 1000).toFixed(0) + 'k';
    v.gpu.textContent = ((gpuStats.bufferBytes + gpuStats.textureBytes) * MB).toFixed(0);
    const mem = performance.memory;
    v.heap.textContent = mem ? (mem.usedJSHeapSize * MB).toFixed(1) + '/' + (mem.jsHeapSizeLimit * MB).toFixed(0) : 'n/a';
    v.stream.textContent = String(g.streaming.queueDepth);
    v.pipes.textContent = String(gpuStats.pipelinesTotal);
    v.res.textContent = g.engine.getRenderWidth() + '×' + g.engine.getRenderHeight();
    this.adapter.textContent = gpuStats.adapterInfo;
    this._refreshLate();
    this._syncSliders();
    if (g.overlayWorldRefresh) g.overlayWorldRefresh();
  }
}
