// World streaming (BRIEF §4.2, §14): owns the world worker, the GPU storage buffers the terrain
// shader reads, the tile residency state, and collision patches.
//
// Per frame (update): pick the nearest missing 2 m tile around the player's predicted position
// (pos + velocity × lookahead) and request it (≤ MAX_IN_FLIGHT); upload at most one arrived tile
// (128 KB writeBuffer, well under the ~1 ms budget); request new collision patches when the player
// nears a patch edge. Allocation-free on the frame path; worker messages arrive between frames.

import { StorageBuffer } from '@babylonjs/core/Buffers/storageBuffer.js';
import { streaming } from '../core/streaming.js';

const MAX_IN_FLIGHT = 4;
const LOOKAHEAD_S = 2.5;
const DETAIL_RADIUS = 1400;    // m: keep 2 m tiles resident within this of the predicted position
const FINE = { n: 193, step: 0.25, refresh: 10 };  // 48 m patch, refresh when 10 m off-centre
const COARSE = { n: 129, step: 2, refresh: 64 };    // 256 m patch

// Tile states.
const NONE = 0, REQUESTED = 1, ARRIVED = 2, RESIDENT = 3;

export class WorldStreamer {
  /**
   * @param {any} engine
   * @param {import('./patchGround.js').PatchGround} ground
   */
  constructor(engine, ground) {
    this.engine = engine;
    this.ground = ground;
    this.worker = new Worker(new URL('./world.worker.js', import.meta.url), { type: 'module' });
    this.manifest = null;
    this.tiles = 0;
    // Material query (sampleMaterial): inputs mqx/mqz, output mat.
    this.surfaceData = null; this.surfaceN = 0; this.surfaceTexel = 4;
    this.mqx = 0.5; this.mqz = 0.5; this.mat = 0;
    this.state = null;
    this.arrived = [];          // queue of { tx, tz, data } awaiting GPU upload
    this.inFlight = 0;
    this.fineCx = 1e9; this.fineCz = 1e9; this.coarseCx = 1e9; this.coarseCz = 1e9;
    this.finePending = false; this.coarsePending = false;
    this.patchId = 0;
    this.residentCount = 0;
    /** Bumped on every tile upload; patches remember the version they were computed at. */
    this.residencyVersion = 0;
    this.buffers = null;
    // Focus inputs (fields, not arguments: no doubles cross call boundaries on the frame path).
    this.px = 0.5; this.pz = 0.5; this.vx = 0.5 - 0.5; this.vz = 0.5 - 0.5;
    this._initResolve = null;
    this.worker.onmessage = (e) => this._onMessage(e.data);
  }

  /** Load the world: resolves once GPU buffers exist (no height tiles yet). */
  init(base = '/world/') {
    return new Promise((resolve, reject) => {
      this._initResolve = resolve;
      this._initReject = reject;
      this.worker.postMessage({ type: 'init', base });
    });
  }

  _onMessage(m) {
    if (m.type === 'error') { console.error('[world worker]', m.message); this._initReject?.(new Error(m.message)); return; }
    if (m.type === 'init') return this._onInit(m);
    if (m.type === 'tile') {
      this.inFlight--;
      this.state[m.tz * this.tiles + m.tx] = ARRIVED;
      this.arrived.push(m);
      return;
    }
    if (m.type === 'patch') {
      const fine = m.n === FINE.n;
      this.ground.install(m, fine);
      if (fine) this.finePending = false; else this.coarsePending = false;
    }
  }

  _onInit(m) {
    const e = this.engine;
    this.manifest = m.manifest;
    this.tiles = m.manifest.height.tiles;
    this.state = new Uint8Array(this.tiles * this.tiles);
    const T = m.manifest.height.tile;
    const u32 = (u8) => new Uint32Array(u8.buffer, u8.byteOffset, u8.byteLength >> 2);
    const sb = (bytes, label) => { const b = new StorageBuffer(e, bytes.byteLength, undefined, label); b.update(bytes); return b; };
    // Heights: tile-major (tile index × T² u16), two u16 per u32.
    const heights = new StorageBuffer(e, this.tiles * this.tiles * T * T * 2, undefined, 'world-heights');
    const resident = new Uint32Array(this.tiles * this.tiles);
    this.buffers = {
      heights,
      overview: sb(new Uint8Array(m.overview.buffer), 'world-overview'),
      biomeA: sb(u32(m.biomeA), 'world-biomeA'),
      biomeB: sb(u32(m.biomeB), 'world-biomeB'),
      wind: sb(this._widenRG8(m.wind), 'world-wind'),
      surface: sb(u32(m.surface), 'world-surface'),
      hydro: sb(u32(m.hydro), 'world-hydro'),
      resident: sb(resident, 'world-resident'),
      residentData: resident,
    };
    // CPU copy of the surface material map (byte 0 of rgba8, row 0 = north) for gameplay queries.
    this.surfaceData = m.surface;
    this.surfaceN = m.manifest.surface.size; this.surfaceTexel = m.manifest.surface.texel;
    // CPU copy of the wind climatology (RG8, row 0 = north) for weather consumers.
    this.windData = m.wind; this.windN = m.manifest.wind.size; this.windTexel = m.manifest.wind.texel;
    this._initResolve(this);
  }

  /** Bake surface material id at (mqx, mqz) → mat (fields, not arguments: no boxing). 0 = snow. */
  sampleMaterial() {
    const d = this.surfaceData;
    if (!d) { this.mat = 255; return; }
    const N = this.surfaceN, half = this.manifest.worldSize / 2;
    const col = Math.min(N - 1, Math.max(0, Math.floor((this.mqx + half) / this.surfaceTexel)));
    const row = Math.min(N - 1, Math.max(0, Math.floor((half - this.mqz) / this.surfaceTexel)));
    this.mat = d[(row * N + col) * 4];
  }

  /** Prevailing wind direction at (mqx, mqz) → windX, windZ (unit; fields, not arguments). */
  sampleWind() {
    const d = this.windData;
    if (!d) { this.windX = 1; this.windZ = 0; return; }
    const N = this.windN, half = this.manifest.worldSize / 2;
    const col = Math.min(N - 1, Math.max(0, Math.floor((this.mqx + half) / this.windTexel)));
    const row = Math.min(N - 1, Math.max(0, Math.floor((half - this.mqz) / this.windTexel)));
    const x = (d[(row * N + col) * 2] - 128) / 127, z = (d[(row * N + col) * 2 + 1] - 128) / 127;
    const l = Math.sqrt(x * x + z * z);
    if (l > 1e-4) { this.windX = x / l; this.windZ = z / l; } else { this.windX = 1; this.windZ = 0; }
  }

  /** RG8 → one u32 per texel (rg in the low bytes) so the shader can unpack4x8unorm it. */
  _widenRG8(rg) {
    const n = rg.length >> 1, out = new Uint32Array(n);
    for (let i = 0; i < n; i++) out[i] = rg[2 * i] | (rg[2 * i + 1] << 8);
    return out;
  }

  /** Number of tiles still needed within the detail radius (for loading screens). */
  pendingNear(x, z) {
    let k = 0;
    const T = this.tiles, size = this.manifest.height.tile * this.manifest.height.texel, half = this.manifest.worldSize / 2;
    for (let tz = 0; tz < T; tz++) for (let tx = 0; tx < T; tx++) {
      const cx = -half + (tx + 0.5) * size, cz = half - (tz + 0.5) * size;
      if (Math.abs(cx - x) < DETAIL_RADIUS && Math.abs(cz - z) < DETAIL_RADIUS && this.state[tz * T + tx] !== RESIDENT) k++;
    }
    return k;
  }

  /** Per-frame update. Set px/pz (focus position) and vx/vz (its velocity) first. */
  update() {
    if (this.manifest === null) return;
    const px = this.px, pz = this.pz, vx = this.vx, vz = this.vz;
    const T = this.tiles, size = this.manifest.height.tile * this.manifest.height.texel, half = this.manifest.worldSize / 2;
    const ax = px + vx * LOOKAHEAD_S, az = pz + vz * LOOKAHEAD_S;
    // 1. Request the nearest missing tiles (two candidates per frame max).
    for (let pass = 0; pass < 2 && this.inFlight < MAX_IN_FLIGHT; pass++) {
      let best = -1, bestD = DETAIL_RADIUS;
      for (let tz = 0; tz < T; tz++) for (let tx = 0; tx < T; tx++) {
        const k = tz * T + tx;
        if (this.state[k] !== NONE) continue;
        const cx = -half + (tx + 0.5) * size, cz = half - (tz + 0.5) * size;
        // Chebyshev distance from the predicted point to the tile's nearest edge.
        const dx = Math.abs(cx - ax) - size * 0.5, dz = Math.abs(cz - az) - size * 0.5;
        const d = dx > dz ? dx : dz;
        if (d < bestD) { bestD = d; best = k; }
      }
      if (best < 0) break;
      this.state[best] = REQUESTED;
      this.inFlight++;
      this.worker.postMessage({ type: 'tile', tx: best % T, tz: (best / T) | 0 });
    }
    // 2. Upload one arrived tile.
    if (this.arrived.length > 0) {
      const m = this.arrived.shift();
      const k = m.tz * T + m.tx;
      const bytes = m.data.byteLength;
      this.buffers.heights.update(m.data, k * bytes, bytes);
      this.buffers.residentData[k] = 1;
      this.buffers.resident.update(this.buffers.residentData);
      this.state[k] = RESIDENT;
      this.residentCount++;
      this.residencyVersion++;
      this.worker.postMessage({ type: 'resident', tx: m.tx, tz: m.tz });
      // Patches computed before this tile became resident may differ slightly: refresh them.
      this.fineCx = 1e9; this.coarseCx = 1e9;
    }
    // 3. Collision patches.
    if (!this.finePending && (Math.abs(px - this.fineCx) > FINE.refresh || Math.abs(pz - this.fineCz) > FINE.refresh)) {
      this.finePending = true;
      this.fineCx = ax * 0.3 + px * 0.7; this.fineCz = az * 0.3 + pz * 0.7;
      this.worker.postMessage({ type: 'patch', id: ++this.patchId, version: this.residencyVersion, cx: this.fineCx, cz: this.fineCz, n: FINE.n, step: FINE.step });
    }
    if (!this.coarsePending && (Math.abs(px - this.coarseCx) > COARSE.refresh || Math.abs(pz - this.coarseCz) > COARSE.refresh)) {
      this.coarsePending = true;
      this.coarseCx = ax; this.coarseCz = az;
      this.worker.postMessage({ type: 'patch', id: ++this.patchId, version: this.residencyVersion, cx: ax, cz: az, n: COARSE.n, step: COARSE.step });
    }
    streaming.queueDepth = this.inFlight + this.arrived.length;
  }
}
