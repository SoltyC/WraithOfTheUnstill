// Procedural sound (BRIEF §13; a combat-and-world foundation pulled forward from Phase 7 so the
// fight is not mute). WebAudio, no samples yet: every sound is shaped noise and an oscillator.
// A fixed pool of voices is built once (looping noise → filter → gain, oscillator → gain, both →
// stereo pan); a sound re-envelopes the next voice, so nothing is created per sound. Sounds are
// placed in the world (distance falloff, panned by the camera's right). A wind bed follows the
// wind field: the stilled steppe is silent, the release brings the wind back. The context starts
// on the first key or pointer press (browser autoplay rules).

export const SFX = { THUD: 0, CRUNCH: 1, SHATTER: 2, WHOOSH: 3, CHIME: 4, BOOM: 5, RUMBLE: 6, STEP: 7, SHARD: 8 };
const VOICES = 20;

export function createSfx() {
  /** @type {AudioContext|null} */
  let ac = null;
  let master = null, windGain = null, windFilter = null, hissGain = null, hissFilter = null;
  const voices = [];
  let next = 0;

  function noiseBuffer(ctx, seconds) {
    const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.2; }
    return buf;
  }

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ac = new Ctx();
    master = ac.createGain(); master.gain.value = 0.7;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    const nb = noiseBuffer(ac, 2.5);
    for (let i = 0; i < VOICES; i++) {
      const src = ac.createBufferSource(); src.buffer = nb; src.loop = true; src.loopStart = Math.random() * 2;
      const filt = ac.createBiquadFilter(); const ng = ac.createGain(); ng.gain.value = 0;
      const osc = ac.createOscillator(); const og = ac.createGain(); og.gain.value = 0;
      const pan = ac.createStereoPanner();
      src.connect(filt); filt.connect(ng); ng.connect(pan); osc.connect(og); og.connect(pan); pan.connect(master);
      src.start(0, Math.random() * 2); osc.start();
      voices.push({ filt, ng, osc, og, pan });
    }
    // Wind bed: low rushing noise, gusting.
    const ws = ac.createBufferSource(); ws.buffer = nb; ws.loop = true;
    windFilter = ac.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 400; windFilter.Q.value = 0.7;
    windGain = ac.createGain(); windGain.gain.value = 0;
    ws.connect(windFilter); windFilter.connect(windGain); windGain.connect(master); ws.start();
    // Ribbon hiss: a bright stream while the Ribbon flows.
    const hs = ac.createBufferSource(); hs.buffer = nb; hs.loop = true;
    hissFilter = ac.createBiquadFilter(); hissFilter.type = 'bandpass'; hissFilter.frequency.value = 3200; hissFilter.Q.value = 1.4;
    hissGain = ac.createGain(); hissGain.gain.value = 0;
    hs.connect(hissFilter); hissFilter.connect(hissGain); hissGain.connect(master); hs.start(0, 1.1);
  }

  const self = {
    enabled: true,
    /** Listener (fields): camera position and its right vector (horizontal). */
    lx: 0.5, ly: 0.5, lz: 0.5, rx: 1.5 - 0.5, rz: 0.5 - 0.5,
    /** Sound position and loudness (fields) for the next play(). */
    x: 0.5, y: 0.5, z: 0.5, gain: 1.5 - 0.5,
    /** Continuous levels (fields, 0..1), applied by update(): wind, ribbon hiss. */
    wind: 0.5 - 0.5, hiss: 0.5 - 0.5, time: 0.5,

    /** Start (or resume) the audio context: call from a user gesture. */
    unlock() { if (this.enabled) init(); },

    play(kind) {
      if (!ac || ac.state !== 'running' || !this.enabled) return;
      const dx = this.x - this.lx, dy = this.y - this.ly, dz = this.z - this.lz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const far = kind === SFX.BOOM || kind === SFX.RUMBLE ? 40 : 10;
      const g = this.gain / (1 + d / far);
      if (g < 0.01) return;
      const v = voices[next]; next = (next + 1) % VOICES;
      const t = ac.currentTime;
      const pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * this.rx + dz * this.rz) / d)) * 0.8 : 0;
      v.pan.pan.setValueAtTime(pan, t);
      const ng = v.ng.gain, og = v.og.gain, f = v.filt.frequency, q = v.filt.Q, of = v.osc.frequency;
      ng.cancelScheduledValues(t); og.cancelScheduledValues(t); f.cancelScheduledValues(t); of.cancelScheduledValues(t);
      ng.setValueAtTime(0, t); og.setValueAtTime(0, t);
      const r = Math.random();
      switch (kind) {
        case SFX.THUD:      // a body blow: a dull low knock and packed snow
          v.filt.type = 'lowpass'; q.setValueAtTime(0.8, t); f.setValueAtTime(1400, t); f.exponentialRampToValueAtTime(180, t + 0.18);
          ng.linearRampToValueAtTime(0.8 * g, t + 0.005); ng.exponentialRampToValueAtTime(0.001, t + 0.22);
          v.osc.type = 'sine'; of.setValueAtTime(150 + 30 * r, t); of.exponentialRampToValueAtTime(48, t + 0.16);
          og.linearRampToValueAtTime(0.75 * g, t + 0.004); og.exponentialRampToValueAtTime(0.001, t + 0.2);
          break;
        case SFX.CRUNCH:    // snow crushed / chipped
        case SFX.STEP:
          v.filt.type = 'bandpass'; q.setValueAtTime(kind === SFX.STEP ? 0.9 : 1.3, t); f.setValueAtTime((kind === SFX.STEP ? 1300 : 2100) * (0.85 + 0.3 * r), t);
          ng.linearRampToValueAtTime((kind === SFX.STEP ? 0.22 : 0.5) * g, t + 0.004); ng.exponentialRampToValueAtTime(0.001, t + (kind === SFX.STEP ? 0.07 : 0.12));
          break;
        case SFX.SHATTER:   // ice breaking: a bright crash and ringing shards
          v.filt.type = 'highpass'; q.setValueAtTime(0.7, t); f.setValueAtTime(2600, t);
          ng.linearRampToValueAtTime(0.9 * g, t + 0.003); ng.exponentialRampToValueAtTime(0.001, t + 0.55);
          v.osc.type = 'triangle'; of.setValueAtTime(2600 + 900 * r, t); of.exponentialRampToValueAtTime(1500 + 500 * r, t + 0.5);
          og.linearRampToValueAtTime(0.28 * g, t + 0.003); og.exponentialRampToValueAtTime(0.001, t + 0.6);
          break;
        case SFX.WHOOSH:    // a sweep of slush through the air
        case SFX.SHARD:
          v.filt.type = 'bandpass'; q.setValueAtTime(kind === SFX.SHARD ? 4 : 1.2, t);
          f.setValueAtTime(kind === SFX.SHARD ? 1800 : 380, t); f.exponentialRampToValueAtTime(kind === SFX.SHARD ? 5200 : 2400, t + 0.3);
          ng.linearRampToValueAtTime(0.6 * g, t + 0.1); ng.exponentialRampToValueAtTime(0.001, t + 0.42);
          break;
        case SFX.CHIME:     // a formation crystallising: glassy partials
          v.osc.type = 'sine'; of.setValueAtTime(1180 + 240 * r, t); of.linearRampToValueAtTime(1240 + 240 * r, t + 1.2);
          og.linearRampToValueAtTime(0.32 * g, t + 0.01); og.exponentialRampToValueAtTime(0.001, t + 1.4);
          v.filt.type = 'highpass'; q.setValueAtTime(0.7, t); f.setValueAtTime(5000, t);
          ng.linearRampToValueAtTime(0.25 * g, t + 0.01); ng.exponentialRampToValueAtTime(0.001, t + 0.35);
          break;
        case SFX.BOOM:      // a colossal footfall, a slam: felt more than heard
          v.osc.type = 'sine'; of.setValueAtTime(78, t); of.exponentialRampToValueAtTime(30, t + 0.7);
          og.linearRampToValueAtTime(1.0 * g, t + 0.01); og.exponentialRampToValueAtTime(0.001, t + 0.9);
          v.filt.type = 'lowpass'; q.setValueAtTime(0.7, t); f.setValueAtTime(700, t); f.exponentialRampToValueAtTime(120, t + 0.8);
          ng.linearRampToValueAtTime(0.9 * g, t + 0.01); ng.exponentialRampToValueAtTime(0.001, t + 0.9);
          break;
        case SFX.RUMBLE:    // the shockwave rolling past
          v.filt.type = 'lowpass'; q.setValueAtTime(0.6, t); f.setValueAtTime(260, t); f.linearRampToValueAtTime(900, t + 0.6); f.exponentialRampToValueAtTime(120, t + 3);
          ng.linearRampToValueAtTime(1.0 * g, t + 0.35); ng.exponentialRampToValueAtTime(0.001, t + 3.2);
          v.osc.type = 'sine'; of.setValueAtTime(42, t); of.linearRampToValueAtTime(30, t + 3);
          og.linearRampToValueAtTime(0.8 * g, t + 0.2); og.exponentialRampToValueAtTime(0.001, t + 3);
          break;
      }
    },

    /** Continuous layers: wind (gusting) and the Ribbon's hiss. */
    update() {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime, gust = 0.7 + 0.3 * Math.sin(this.time * 0.9) * Math.sin(this.time * 0.37 + 1.1);
      windGain.gain.setTargetAtTime(Math.min(0.5, this.wind * 0.32 * gust), t, 0.3);
      windFilter.frequency.setTargetAtTime(260 + 900 * this.wind * gust, t, 0.3);
      hissGain.gain.setTargetAtTime(this.hiss * 0.18, t, 0.04);
    },
  };
  return self;
}
