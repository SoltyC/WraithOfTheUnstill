// Lightning (Phase 8 M11): the thunderstorm's strikes. A seeded scheduler (storm intensity sets how
// often) picks a bearing and a distance for each strike; the strike plays a few pulses (a main
// stroke, often a flicker or two) that drive the light's flash, the clouds' glow and the bolt's
// brightness; thunder follows at the speed of sound. Pure and allocation-free: the owner
// (systems/storm.js) feeds the camera and reads the envelopes, the direction of the light and the
// thunder that has come due. Deterministic from the strike index (a session's storm repeats).

export const SOUND_SPEED = 343; // m/s
/** Strike distance range (m): most are far, a few close enough to light the street. */
const D_MIN = 220, D_SPAN = 5800;
/** Seconds the bolt takes to fade, and the pulse table (start s, amplitude) of up to 3 pulses. */
export const BOLT_LIFE = 0.34;
const MAX_THUNDER = 6;

function hash(n) {
  let x = (Math.imul(n | 0, 747796405) + 2891336453) >>> 0;
  x = Math.imul((x >>> ((x >>> 28) + 4)) ^ x, 277803737) >>> 0;
  return (((x >>> 22) ^ x) >>> 0) / 4294967295;
}

/** Seconds from a strike to its thunder at distance d (m). */
export function thunderDelay(d) { return d / SOUND_SPEED; }
/** Loudness 0..1 of the thunder from a strike d metres away (gain; rumble length grows with d). */
export function thunderGain(d) { return 1 / (1 + (d / 900) * (d / 900)); }

export function createLightning() {
  // Thunder in flight: strike time + delay, distance, bearing.
  const tAt = new Float64Array(MAX_THUNDER), tDist = new Float64Array(MAX_THUNDER), tBear = new Float64Array(MAX_THUNDER);
  let tN = 0;
  const L = {
    /** Owner inputs: storm intensity 0..1, dt (s), camera position (m). */
    storm: 0.5 - 0.5, dt: 0.5 - 0.5, camX: 0.5 - 0.5, camY: 0.5 - 0.5, camZ: 0.5 - 0.5, enabled: true,
    /** Seconds so far, and when the next strike comes (in the same clock). */
    time: 0.5 - 0.5, nextAt: 8.5, count: 0,
    /** The strike now: age (s; < 0 none), ground point (m), the cloud height it starts at, its
     *  distance from the camera and bearing, a seed for the bolt's shape; version rises with each. */
    age: -1.5 + 0.5, gx: 0.5, gz: 0.5, topY: 1500.5, dist: 1000.5, bearing: 0.5, seed: 0, version: 0,
    /** A held strike (captures): the age stays fixed. */
    hold: false,
    /** Pulses of this strike: start (s) and amplitude, n of them. */
    pulses: 1, p1: 0.5, p2: 0.5, a1: 0.5, a2: 0.5,
    /** Outputs: the key light's flash (short), the clouds' glow (longer) and the bolt's brightness,
     *  all 0..1, and the unit direction toward the strike (from the camera, up-biased). */
    flash: 0.5 - 0.5, glow: 0.5 - 0.5, bolt: 0.5 - 0.5, dirX: 0.5, dirY: 0.5, dirZ: 0.5,
    /** Set by the owner: called (distance m, gain 0..1, bearing rad) when thunder reaches the camera. */
    onThunder: null,
    /**
     * Start a strike at bearing b (rad, 0 = +z, toward +x positive) and distance d (m) from the
     * camera now. Fixed pulses keep the double flicker deterministic (n 1..3 from the seed).
     */
    strike(b, d, seed, hold) {
      this.bearing = b; this.dist = d; this.seed = seed;
      this.gx = this.camX + Math.sin(b) * d; this.gz = this.camZ + Math.cos(b) * d;
      this.topY = 950 + 250 * hash(seed + 3);
      const h = hash(seed + 11);
      this.pulses = h < 0.35 ? 1 : h < 0.75 ? 2 : 3;
      this.p1 = 0.07 + 0.07 * hash(seed + 13); this.p2 = this.p1 + 0.08 + 0.1 * hash(seed + 17);
      this.a1 = 0.55 + 0.35 * hash(seed + 19); this.a2 = 0.4 + 0.3 * hash(seed + 23);
      this.age = 0; this.hold = !!hold; this.version++; this.count++;
      if (tN < MAX_THUNDER) { tAt[tN] = this.time + thunderDelay(d); tDist[tN] = d; tBear[tN] = b; tN++; }
      this.shape();
    },
    /** The strike's ground point again for the camera's place now (held strikes follow a settling view). */
    reposition() { this.gx = this.camX + Math.sin(this.bearing) * this.dist; this.gz = this.camZ + Math.cos(this.bearing) * this.dist; this.version++; },
    /** Envelopes at the current age (also called after a held strike's age is set). */
    shape() {
      const a = this.age;
      if (a < 0 || a > 1.4) { this.flash = 0; this.glow = 0; this.bolt = 0; return; }
      // Pulses: instant attack, the key's flash dies fast, the cloud's glow lingers.
      let f = Math.exp(-a / 0.05), g = Math.exp(-a / 0.2);
      let bl = Math.exp(-a / 0.07);
      if (this.pulses > 1 && a >= this.p1) { const q = a - this.p1; f = Math.max(f, this.a1 * Math.exp(-q / 0.05)); g = Math.max(g, 0.9 * this.a1 * Math.exp(-q / 0.2)); bl = Math.max(bl, this.a1 * Math.exp(-q / 0.06)); }
      if (this.pulses > 2 && a >= this.p2) { const q = a - this.p2; f = Math.max(f, this.a2 * Math.exp(-q / 0.05)); g = Math.max(g, 0.9 * this.a2 * Math.exp(-q / 0.2)); bl = Math.max(bl, this.a2 * Math.exp(-q / 0.06)); }
      // Distance: close strikes light the ground hard; far ones are a glow in the cloud.
      const k = 1 / (1 + (this.dist / 1100) * (this.dist / 1100));
      const life = Math.max(0, 1 - a / BOLT_LIFE);
      this.flash = f * k; this.glow = g * (0.25 + 0.75 / (1 + this.dist / 3500)); this.bolt = bl * life;
      // Toward the bolt's middle (up-biased: the light comes from the cloud as much as the ground).
      const dx = this.gx - this.camX, dz = this.gz - this.camZ, dy = this.topY * 0.55 - this.camY;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      this.dirX = dx / l; this.dirY = dy / l; this.dirZ = dz / l;
    },
    update() {
      if (!this.enabled) { this.age = -1; this.shape(); return; }
      this.time += this.dt;
      if (this.storm > 0.3) {
        if (this.age < 0 && this.time >= this.nextAt) {
          const n = this.count + 1;
          const u = hash(n * 5 + 1);
          this.strike((hash(n * 5 + 2) - 0.5) * 6.2832, D_MIN + D_SPAN * u * u, n * 17);
          // The next one: 10..35 s later, sooner the harder it storms.
          this.nextAt = this.time + (12 + 28 * hash(n * 5 + 3)) / (0.5 + this.storm);
        }
      } else this.nextAt = Math.max(this.nextAt, this.time + 8); // a quiet sky: the first strike waits for the storm
      if (this.age >= 0) {
        if (!this.hold) this.age += this.dt;
        if (this.age > 1.4) this.age = -1;
        this.shape();
      }
      // Thunder that has reached the camera.
      for (let i = 0; i < tN; ) {
        if (this.time >= tAt[i]) {
          if (this.onThunder) this.onThunder(tDist[i], thunderGain(tDist[i]), tBear[i]);
          tN--; tAt[i] = tAt[tN]; tDist[i] = tDist[tN]; tBear[i] = tBear[tN];
        } else i++;
      }
    },
    /** Thunder on its way (tests, overlay). */
    thunderPending() { return tN; },
  };
  return L;
}
