// Terrain state runtime (BRIEF §4.3): the GPU fine window and coarse page atlas, their scrolling,
// slot allocation, eviction with serialisation, reload with closed-form healing, and live
// healing. Addressing lives in layout.js, closed-form healing in healing.js (run on
// state.worker.js), compute passes in shaders/terrainState.wgsl.js.
//
// Per frame (update): the snapped window origin follows px/pz. Outgoing strips are downsampled
// into the pages beneath them (only pages holding a slot — every page anything wrote to does);
// incoming strips are filled from the coarse record (or rest). One band of the window and one
// resident page heal. All jobs go to the GPU in one params write.
//
// Writers (Phase 2 onward) splat brushes into the fine window and must claim the pages under
// them (claimRect) so their marks survive scrolling out. Phase 1 has a debug stamp only.

import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { ComputeShader } from '@babylonjs/core/Compute/computeShader.js';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader.js';
import {
  FINE_N, FINE_PER_M, RATIO, PAGE_N, PAGE_M, PAGES, SLOTS, NO_SLOT, COARSE_PER_M, WORLD_HALF,
  windowOrigin, windowDifference, pageOriginCoarse,
} from './layout.js';
import {
  stateScrollOutWGSL, stateScrollInWGSL, stateBrushWGSL, stateHealFineWGSL, stateHealCoarseWGSL, PARAM_WORDS, MAX_BRUSHES, MAX_IN,
  SCROLL_OUT_BINDINGS, SCROLL_IN_BINDINGS, BRUSH_BINDINGS, HEAL_FINE_BINDINGS, HEAL_COARSE_BINDINGS,
} from '../../shaders/terrainState.wgsl.js';

const PLANE_BYTES = PAGE_N * PAGE_N * 4;
const FREE_RESERVE = 6;            // slots kept free by evicting far pages early
const KEEP_RADIUS = PAGE_M * 2.5;  // m: pages nearer than this to the player are never evicted
const RELOAD_MARGIN = PAGE_M;      // m beyond the window edge: stored pages reload before it arrives
const HEAL_BANDS = 16;

// Params word offsets (StateParams in terrainState.wgsl.js).
const P_ORIGIN = 0, P_OUT = 4, P_IN = 12, P_HEAL = P_IN + MAX_IN * 4, P_HEALDT = P_HEAL + 4, P_SLOT = P_HEALDT + 4, P_COUNTS = P_SLOT + 4;
const P_BRUSH = P_COUNTS + 4, P_BDIR = P_BRUSH + MAX_BRUSHES * 4, P_BRECT = P_BDIR + MAX_BRUSHES * 4;
const QUEUE = 8192; // pending brushes (8 fields each), drained MAX_BRUSHES per frame

/**
 * @param {import('@babylonjs/core').WebGPUEngine} engine
 * @param {{ surface: StorageBuffer, base: string }} opts
 */
export function createTerrainState(engine, opts) {
  const sb = (bytes, label) => new StorageBuffer(engine, bytes, undefined, label);
  const fine = [0, 1, 2].map((w) => sb(FINE_N * FINE_N * 4, 'state-fine' + w));
  const atlas = [0, 1, 2].map((w) => sb(SLOTS * PLANE_BYTES, 'state-atlas' + w));
  // Params buffer: the per-frame job block (PARAM_WORDS words, viewed as i32/f32/u32), then the
  // page table (one word per page). Materials bind it too: window origin + page table in one
  // binding (WebGPU allows only 8 storage buffers per shader stage).
  const pBuf = new ArrayBuffer((PARAM_WORDS + PAGES * PAGES) * 4);
  const pi = new Int32Array(pBuf, 0, PARAM_WORDS), pf = new Float32Array(pBuf, 0, PARAM_WORDS), pu = new Uint32Array(pBuf, 0, PARAM_WORDS);
  const tableData = new Uint32Array(pBuf, PARAM_WORDS * 4, PAGES * PAGES).fill(NO_SLOT);
  const params = sb(pBuf.byteLength, 'state-params');
  params.update(new Uint32Array(pBuf));

  const all = { fine0: fine[0], fine1: fine[1], fine2: fine[2], atlas0: atlas[0], atlas1: atlas[1], atlas2: atlas[2], sp: params, surface: opts.surface };
  // Binding i of each pass is names[i] (shaders/terrainState.wgsl.js generates the declarations).
  const mk = (name, code, names) => {
    const mapping = {};
    names.forEach((n, i) => { mapping[n] = { group: 0, binding: i }; });
    const cs = new ComputeShader(name, engine, { computeSource: code }, { bindingsMapping: mapping });
    for (const n of names) cs.setStorageBuffer(n, all[n]);
    return cs;
  };
  const csOut = mk('stateScrollOut', stateScrollOutWGSL, SCROLL_OUT_BINDINGS);
  const csIn = mk('stateScrollIn', stateScrollInWGSL, SCROLL_IN_BINDINGS);
  const csBrush = mk('stateBrush', stateBrushWGSL, BRUSH_BINDINGS);
  const csHealFine = mk('stateHealFine', stateHealFineWGSL, HEAL_FINE_BINDINGS);
  const csHealCoarse = mk('stateHealCoarse', stateHealCoarseWGSL, HEAL_COARSE_BINDINGS);
  const passes = [csOut, csIn, csBrush, csHealFine, csHealCoarse];
  const passRan = new Uint8Array(5);

  // Page bookkeeping (CPU).
  const pageSlot = new Int32Array(PAGES * PAGES).fill(-1);
  const pageStored = new Uint8Array(PAGES * PAGES);   // serialised on the worker
  const pageLoading = new Uint8Array(PAGES * PAGES);
  const slotKey = new Int32Array(SLOTS).fill(-1);
  const slotBusy = new Uint8Array(SLOTS);             // reading back for eviction
  const slotUsed = new Float64Array(SLOTS);           // last time the window overlapped it
  const slotHealed = new Float64Array(SLOTS);
  const bandHealed = new Float64Array(HEAL_BANDS);
  let tableDirty = false, freeSlots = SLOTS, healCursor = 0, bandCursor = 0, warmed = 0;

  const worker = new Worker(new URL('./state.worker.js', import.meta.url), { type: 'module' });
  worker.postMessage({ type: 'init', base: opts.base });
  const arrivals = []; // { key, words } from the worker, uploaded one per frame
  worker.onmessage = (e) => { if (e.data.type === 'page') arrivals.push(e.data); };

  const origin = [NaN, NaN], next = [0, 0];
  const rects = new Array(8).fill(0);
  // Brush queue (ring): x, z, dirX, dirZ, halfLen, halfWidth, depth, compaction.
  const brushQ = new Float64Array(QUEUE * 8);
  let qHead = 0, qCount = 0, brushN = 0;
  const og = [0, 0];

  function setSlot(key, slot) {
    pageSlot[key] = slot;
    tableData[key] = slot < 0 ? NO_SLOT : slot;
    if (slot >= 0) { slotKey[slot] = key; freeSlots--; }
    tableDirty = true;
  }
  function allocSlot(key, now) {
    for (let s = 0; s < SLOTS; s++) {
      if (slotKey[s] < 0 && !slotBusy[s]) { setSlot(key, s); slotUsed[s] = now; slotHealed[s] = now; return s; }
    }
    return -1;
  }
  /** Distance (m) from (x, z) to page key's square. */
  function pageDist(key, x, z) {
    pageOriginCoarse(key, og);
    const x0 = og[0] / COARSE_PER_M, z0 = og[1] / COARSE_PER_M;
    const dx = Math.max(x0 - x, 0, x - (x0 + PAGE_M)), dz = Math.max(z0 - z, 0, z - (z0 + PAGE_M));
    return Math.sqrt(dx * dx + dz * dz);
  }
  function evict(slot, now) {
    const key = slotKey[slot];
    slotBusy[slot] = 1;
    const words = new Uint32Array(3 * PAGE_N * PAGE_N);
    // Each plane reads into its own array: Babylon's read() ignores a view's byteOffset.
    const reads = atlas.map((b, w) => b.read(slot * PLANE_BYTES, PLANE_BYTES).then((v) => {
      words.set(new Uint32Array(v.buffer, v.byteOffset, PAGE_N * PAGE_N), w * PAGE_N * PAGE_N);
    }));
    // Unmap at once: the window is far away, nothing reads the page until it reloads.
    setSlot(key, -1); slotKey[slot] = -1; freeSlots++;
    pageStored[key] = 1; self.stats.stored++;
    Promise.all(reads).then(() => {
      worker.postMessage({ type: 'store', key, time: now, words }, [words.buffer]);
      slotBusy[slot] = 0;
    }, () => { slotBusy[slot] = 0; pageStored[key] = 0; self.stats.stored--; });
  }

  const self = {
    fine, atlas, params,
    /** Owner fields: player position (m) and game time (s), set before update(). */
    px: 0.5, pz: 0.5, time: 0.5,
    /** Healing speed multiplier (the 'Refill rate' art control). */
    healScale: 1.5 - 0.5,
    /** Benchmarks: follow (followX, followZ) instead of the player. */
    followOverride: false, followX: 0.5, followZ: 0.5,
    /** Stats for the dev overlay. */
    stats: { resident: 0, stored: 0, scrolled: 0 },  // pages on the GPU / on the worker; window moves

    /** Claims (allocates slots for) every page under a world-metre rect so writes there persist. */
    claimRect(x0, z0, x1, z1) {
      const px0 = Math.max(0, Math.floor((x0 + WORLD_HALF) / PAGE_M)), px1 = Math.min(PAGES - 1, Math.floor((x1 + WORLD_HALF) / PAGE_M));
      const pz0 = Math.max(0, Math.floor((z0 + WORLD_HALF) / PAGE_M)), pz1 = Math.min(PAGES - 1, Math.floor((z1 + WORLD_HALF) / PAGE_M));
      let ok = true;
      for (let pz = pz0; pz <= pz1; pz++) for (let px = px0; px <= px1; px++) {
        const key = pz * PAGES + px;
        if (pageSlot[key] >= 0) continue;
        // A stored page under a fresh write: its history is dropped (reload would race the write).
        if (pageStored[key]) { pageStored[key] = 0; this.stats.stored--; worker.postMessage({ type: 'drop', key }); }
        if (allocSlot(key, this.time) < 0) ok = false;
      }
      return ok;
    },

    /**
     * Queue a brush (fields, no double arguments): centre (bx, bz), direction (bdx, bdz),
     * half length bl, half width bw, depth bd (m), compaction bc. Round stamp: bl = 0.
     */
    bx: 0.5, bz: 0.5, bdx: 0.5, bdz: 0.5, bl: 0.5, bw: 0.5, bd: 0.5, bc: 0.5,
    stamp() {
      if (qCount >= QUEUE) return;
      const r = this.bl + this.bw * 1.9;
      this.claimRect(this.bx - r, this.bz - r, this.bx + r, this.bz + r);
      const o = ((qHead + qCount) % QUEUE) * 8;
      brushQ[o] = this.bx; brushQ[o + 1] = this.bz; brushQ[o + 2] = this.bdx; brushQ[o + 3] = this.bdz;
      brushQ[o + 4] = this.bl; brushQ[o + 5] = this.bw; brushQ[o + 6] = this.bd; brushQ[o + 7] = this.bc;
      qCount++;
    },
    /** Brushes queued but not yet written to the GPU. */
    get pendingBrushes() { return qCount; },

    /** Debug/test: evict every resident page farther than KEEP_RADIUS from the player now. */
    debugEvictFar() {
      for (let s = 0; s < SLOTS; s++) if (slotKey[s] >= 0 && !slotBusy[s] && pageDist(slotKey[s], this.px, this.pz) > KEEP_RADIUS) evict(s, this.time);
    },
    /** Debug/test: async read of { fine, coarse } depression (m) at world (x, z); null where absent. */
    async debugProbe(x, z) {
      const i = Math.floor(x * FINE_PER_M), j = Math.floor(z * FINE_PER_M);
      const inWin = i >= origin[0] && j >= origin[1] && i < origin[0] + FINE_N && j < origin[1] + FINE_N;
      const half = (w) => { const h = w & 0xffff, e = (h >> 10) & 31, m = h & 1023; return (h & 0x8000 ? -1 : 1) * (e ? (1 + m / 1024) * 2 ** (e - 15) : m * 2 ** -24); };
      let fineV = null, coarseV = null;
      if (inWin) {
        const k = (((j % FINE_N) + FINE_N) % FINE_N) * FINE_N + (((i % FINE_N) + FINE_N) % FINE_N);
        fineV = half(new Uint32Array((await fine[0].read(k * 4, 4)).buffer)[0]);
      }
      const c = Math.floor(x * COARSE_PER_M), d = Math.floor(z * COARSE_PER_M), off = WORLD_HALF * COARSE_PER_M;
      const key = Math.floor((d + off) / PAGE_N) * PAGES + Math.floor((c + off) / PAGE_N);
      const s = pageSlot[key];
      if (s >= 0) {
        const k = (s * PAGE_N + ((d + off) % PAGE_N)) * PAGE_N + ((c + off) % PAGE_N);
        coarseV = half(new Uint32Array((await atlas[0].read(k * 4, 4)).buffer)[0]);
      }
      return { fine: fineV, coarse: coarseV, slot: s, stored: pageStored[key], loading: pageLoading[key] };
    },

    update() {
      const now = this.time;
      windowOrigin(this.px, this.pz, next);
      const moved = next[0] !== origin[0] || next[1] !== origin[1];
      let nOut = 0, nIn = 0;
      if (moved) {
        const first = Number.isNaN(origin[0]);
        if (!first) {
          const n = windowDifference(origin[0], origin[1], next[0], next[1], rects);
          for (let k = 0; k < n; k++) {
            // Coarse rect; skipped if no claimed page lies under it (cheap CPU test).
            const c0 = rects[k * 4] / RATIO, d0 = rects[k * 4 + 1] / RATIO, c1 = rects[k * 4 + 2] / RATIO, d1 = rects[k * 4 + 3] / RATIO;
            if (!anySlot(c0, d0, c1, d1)) continue;
            pi[P_OUT + nOut * 4] = c0; pi[P_OUT + nOut * 4 + 1] = d0; pi[P_OUT + nOut * 4 + 2] = c1; pi[P_OUT + nOut * 4 + 3] = d1;
            nOut++;
          }
        }
        const n = first ? 1 : windowDifference(next[0], next[1], origin[0], origin[1], rects);
        if (first) { rects[0] = next[0]; rects[1] = next[1]; rects[2] = next[0] + FINE_N; rects[3] = next[1] + FINE_N; }
        for (let k = 0; k < n; k++) {
          for (let q = 0; q < 4; q++) pi[P_IN + nIn * 4 + q] = rects[k * 4 + q];
          nIn++;
        }
      }
      // Page arrivals from the worker (one per frame): upload, map, refill the window over it.
      if (arrivals.length > 0 && nIn < MAX_IN) {
        const a = arrivals.shift();
        pageLoading[a.key] = 0;
        if (a.words && pageSlot[a.key] < 0) {
          const s = allocSlot(a.key, now);
          if (s >= 0) {
            for (let w = 0; w < 3; w++) atlas[w].update(new Uint32Array(a.words.buffer, w * PLANE_BYTES, PAGE_N * PAGE_N), s * PLANE_BYTES, PLANE_BYTES);
            // If the window already covers part of the page, refill that part from the record.
            pageOriginCoarse(a.key, og);
            const i0 = Math.max(og[0] * RATIO, next[0]), j0 = Math.max(og[1] * RATIO, next[1]);
            const i1 = Math.min((og[0] + PAGE_N) * RATIO, next[0] + FINE_N), j1 = Math.min((og[1] + PAGE_N) * RATIO, next[1] + FINE_N);
            if (i0 < i1 && j0 < j1) { pi[P_IN + nIn * 4] = i0; pi[P_IN + nIn * 4 + 1] = j0; pi[P_IN + nIn * 4 + 2] = i1; pi[P_IN + nIn * 4 + 3] = j1; nIn++; }
          } else { arrivals.unshift(a); pageLoading[a.key] = 1; }
        }
      }

      // Request reloads of stored pages the window is approaching.
      const reach = FINE_N / FINE_PER_M / 2 + RELOAD_MARGIN;
      const kx0 = Math.max(0, Math.floor((this.px - reach + WORLD_HALF) / PAGE_M)), kx1 = Math.min(PAGES - 1, Math.floor((this.px + reach + WORLD_HALF) / PAGE_M));
      const kz0 = Math.max(0, Math.floor((this.pz - reach + WORLD_HALF) / PAGE_M)), kz1 = Math.min(PAGES - 1, Math.floor((this.pz + reach + WORLD_HALF) / PAGE_M));
      for (let pz = kz0; pz <= kz1; pz++) for (let px = kx0; px <= kx1; px++) {
        const key = pz * PAGES + px;
        if (pageStored[key] && !pageLoading[key] && pageSlot[key] < 0) {
          pageStored[key] = 0; pageLoading[key] = 1; this.stats.stored--;
          worker.postMessage({ type: 'load', key, time: now });
        } else if (pageSlot[key] >= 0) slotUsed[pageSlot[key]] = now;
      }
      // Keep a reserve of free slots: evict the least recently used page outside KEEP_RADIUS.
      if (freeSlots < FREE_RESERVE) {
        let best = -1, bestT = Infinity;
        for (let s = 0; s < SLOTS; s++) {
          if (slotKey[s] < 0 || slotBusy[s]) continue;
          if (slotUsed[s] < bestT && pageDist(slotKey[s], this.px, this.pz) > KEEP_RADIUS) { bestT = slotUsed[s]; best = s; }
        }
        if (best >= 0) evict(best, now);
      }

      // Healing: one band of the window (if any claimed page overlaps it) and one resident page
      // outside the window, each for the time since it last healed.
      let healFine = false;
      const wi = next[0], wj = next[1];
      if (anySlot(wi / RATIO, wj / RATIO, (wi + FINE_N) / RATIO, (wj + FINE_N) / RATIO)) {
        const b = bandCursor, rows = Math.ceil(FINE_N / HEAL_BANDS);
        pi[P_HEAL] = wi; pi[P_HEAL + 1] = wj + b * rows; pi[P_HEAL + 2] = wi + FINE_N; pi[P_HEAL + 3] = Math.min(wj + FINE_N, wj + (b + 1) * rows);
        pf[P_HEALDT] = bandHealed[b] > 0 ? Math.min(now - bandHealed[b], 5) * this.healScale : 0;
        healFine = true;
      } else pf[P_HEALDT] = 0;
      let healSlot = -1;
      for (let k = 0; k < SLOTS; k++) {
        const s = (healCursor + k) % SLOTS;
        if (slotKey[s] >= 0 && !slotBusy[s]) { healSlot = s; break; }
      }
      pi[P_SLOT] = healSlot;
      if (healSlot >= 0) {
        pageOriginCoarse(slotKey[healSlot], og);
        pi[P_SLOT + 1] = og[0]; pi[P_SLOT + 2] = og[1];
        pf[P_HEALDT + 1] = (now - slotHealed[healSlot]) * this.healScale;
      }

      // Brushes: up to MAX_BRUSHES from the queue this frame (only after the window exists).
      brushN = Number.isNaN(origin[0]) && !moved ? 0 : Math.min(qCount, MAX_BRUSHES);
      for (let b = 0; b < brushN; b++) {
        const o = ((qHead + b) % QUEUE) * 8;
        const x = brushQ[o], z = brushQ[o + 1], dx = brushQ[o + 2], dz = brushQ[o + 3], hl = brushQ[o + 4], hw = brushQ[o + 5];
        const r = hl + hw * 1.9;
        pf[P_BRUSH + b * 4] = x; pf[P_BRUSH + b * 4 + 1] = z; pf[P_BRUSH + b * 4 + 2] = hl; pf[P_BRUSH + b * 4 + 3] = brushQ[o + 6];
        pf[P_BDIR + b * 4] = dx; pf[P_BDIR + b * 4 + 1] = dz; pf[P_BDIR + b * 4 + 2] = hw; pf[P_BDIR + b * 4 + 3] = brushQ[o + 7];
        pi[P_BRECT + b * 4] = Math.max(next[0], Math.floor((x - r) * FINE_PER_M)); pi[P_BRECT + b * 4 + 1] = Math.max(next[1], Math.floor((z - r) * FINE_PER_M));
        pi[P_BRECT + b * 4 + 2] = Math.min(next[0] + FINE_N, Math.ceil((x + r) * FINE_PER_M)); pi[P_BRECT + b * 4 + 3] = Math.min(next[1] + FINE_N, Math.ceil((z + r) * FINE_PER_M));
      }
      pi[P_ORIGIN] = next[0]; pi[P_ORIGIN + 1] = next[1];
      pu[P_COUNTS] = nOut; pu[P_COUNTS + 1] = nIn; pu[P_COUNTS + 2] = brushN;

      const warming = warmed < 5;
      if (nOut === 0 && nIn === 0 && brushN === 0 && !healFine && healSlot < 0 && !moved && !warming) return;
      if (tableDirty) { params.update(tableData, PARAM_WORDS * 4, tableData.byteLength); tableDirty = false; }
      params.update(pu, 0, PARAM_WORDS * 4);
      // Dispatch order matters: out (reads the old window) before in (overwrites it).
      let ok = true;
      if (nOut > 0) { ok = csOut.dispatch(maxGroups(P_OUT, nOut), maxGroupsY(P_OUT, nOut), nOut) && ok; passRan[0] |= ok; }
      if (ok && nIn > 0) { ok = csIn.dispatch(maxGroups(P_IN, nIn), maxGroupsY(P_IN, nIn), nIn) && ok; passRan[1] |= ok; }
      if (!ok) return; // pipelines still compiling: retry the whole step next frame
      if (brushN > 0 && csBrush.dispatch(maxGroups(P_BRECT, brushN), maxGroupsY(P_BRECT, brushN), brushN)) { qHead = (qHead + brushN) % QUEUE; qCount -= brushN; passRan[2] = 1; }
      if (healFine && csHealFine.dispatch(Math.ceil(FINE_N / 8), Math.ceil(FINE_N / HEAL_BANDS / 8), 1)) {
        bandHealed[bandCursor] = now; bandCursor = (bandCursor + 1) % HEAL_BANDS; passRan[3] = 1;
      }
      if (healSlot >= 0 && csHealCoarse.dispatch(PAGE_N / 8, PAGE_N / 8, 1)) { slotHealed[healSlot] = now; healCursor = (healSlot + 1) % SLOTS; passRan[4] = 1; }
      if (warming) {
        // Until every pipeline exists (WebGPU creates it on first dispatch), dispatch idle passes
        // as no-ops — their job counts are zero or this frame's dt/slot disables them — so none
        // is created mid-game.
        const idle = [nOut === 0, nIn === 0, brushN === 0, !healFine, healSlot < 0];
        warmed = 0;
        for (let k = 0; k < 5; k++) {
          if (!passRan[k] && idle[k] && passes[k].dispatch(1, 1, 1)) passRan[k] = 1;
          warmed += passRan[k];
        }
      }
      if (moved) { origin[0] = next[0]; origin[1] = next[1]; this.stats.scrolled++; }
      this.stats.resident = SLOTS - freeSlots;
    },
  };

  function anySlot(c0, d0, c1, d1) {
    const off = WORLD_HALF * COARSE_PER_M;
    const px0 = Math.max(0, Math.floor((c0 + off) / PAGE_N)), px1 = Math.min(PAGES - 1, Math.floor((c1 - 1 + off) / PAGE_N));
    const pz0 = Math.max(0, Math.floor((d0 + off) / PAGE_N)), pz1 = Math.min(PAGES - 1, Math.floor((d1 - 1 + off) / PAGE_N));
    for (let pz = pz0; pz <= pz1; pz++) for (let px = px0; px <= px1; px++) if (pageSlot[pz * PAGES + px] >= 0) return true;
    return false;
  }
  function maxGroups(at, n) { let m = 0; for (let k = 0; k < n; k++) m = Math.max(m, pi[at + k * 4 + 2] - pi[at + k * 4]); return Math.max(1, Math.ceil(m / 8)); }
  function maxGroupsY(at, n) { let m = 0; for (let k = 0; k < n; k++) m = Math.max(m, pi[at + k * 4 + 3] - pi[at + k * 4 + 1]); return Math.max(1, Math.ceil(m / 8)); }

  return self;
}
