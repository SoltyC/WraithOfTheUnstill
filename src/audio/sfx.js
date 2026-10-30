// Procedural sound (BRIEF §13; a combat-and-world foundation pulled forward from Phase 7 so the
// fight is not mute). WebAudio, no samples yet: every sound is shaped noise and an oscillator.
// A fixed pool of voices is built once (looping noise → filter → gain, oscillator → gain, both →
// stereo pan); a sound re-envelopes the next voice, so nothing is created per sound. Sounds are
// placed in the world (distance falloff, panned by the camera's right). A wind bed follows the
// wind field: the stilled steppe is silent, the release brings the wind back. The context starts
// on the first key or pointer press (browser autoplay rules).

import { createSandSurfSound } from './sandSurfSound.js';

export const SFX = { THUD: 0, CRUNCH: 1, SHATTER: 2, WHOOSH: 3, CHIME: 4, BOOM: 5, RUMBLE: 6, STEP: 7, SHARD: 8, CHARGE: 9, THUNDER: 10, FLOW_UP: 11, FLOW_DOWN: 12, SWISH: 13, CLANG: 14, TOLL: 15 };
const VOICES = 20;

export function createSfx() {
  /** @type {AudioContext|null} */
  let ac = null;
  let humOsc = null, humOsc2 = null, humGain = null, humGain2 = null;
  let master = null, windGain = null, windFilter = null, hissGain = null, hissFilter = null, rainGain = null, rainLowGain = null;
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
    master = ac.createGain(); master.gain.value = 0.7 * self.volume;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    const nb = noiseBuffer(ac, 2.5);
    self.sandSound = createSandSurfSound(ac, nb, master);
    for (let i = 0; i < VOICES; i++) {
      const src = ac.createBufferSource(); src.buffer = nb; src.loop = true; src.loopStart = Math.random() * 2;
      const filt = ac.createBiquadFilter(); const ng = ac.createGain(); ng.gain.value = 0;
      const osc = ac.createOscillator(); const og = ac.createGain(); og.gain.value = 0;
      const pan = ac.createStereoPanner();
      src.connect(filt); filt.connect(ng); ng.connect(pan); osc.connect(og); og.connect(pan); pan.connect(master);
      src.start(0, Math.random() * 2); osc.start();
      voices.push({ filt, ng, osc, og, pan });
    }
    // The Bell-mace's hum: a quiet sine that rises two octaves with the height stored in the bell, and a steady overtone once the cap is reached.
    humOsc = ac.createOscillator(); humOsc.type = 'sine'; humOsc.frequency.value = 110; humGain = ac.createGain(); humGain.gain.value = 0;
    humOsc2 = ac.createOscillator(); humOsc2.type = 'triangle'; humOsc2.frequency.value = 330; humGain2 = ac.createGain(); humGain2.gain.value = 0;
    humOsc.connect(humGain); humGain.connect(master); humOsc2.connect(humGain2); humGain2.connect(master); humOsc.start(); humOsc2.start();
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
    // Rain bed: a bright patter on leaves and ground (band-passed noise) over a low drumming wash.
    const rs = ac.createBufferSource(); rs.buffer = nb; rs.loop = true;
    const rf = ac.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 3400; rf.Q.value = 0.45;
    rainGain = ac.createGain(); rainGain.gain.value = 0;
    rs.connect(rf); rf.connect(rainGain); rainGain.connect(master); rs.start(0, 0.7);
    const rl = ac.createBufferSource(); rl.buffer = nb; rl.loop = true;
    const rlf = ac.createBiquadFilter(); rlf.type = 'lowpass'; rlf.frequency.value = 700; rlf.Q.value = 0.5;
    rainLowGain = ac.createGain(); rainLowGain.gain.value = 0;
    rl.connect(rlf); rlf.connect(rainLowGain); rainLowGain.connect(master); rl.start(0, 1.7);
  }

  /** Thunder (dist m, gain 0..1, pan -1..1): a crack when near, a rolling rumble whose length grows
   *  and whose pitch drops with distance, and a sub-bass thump. Three pooled voices. */
  function thunder(dist, gain, pan) {
    const t = ac.currentTime, near = 1 / (1 + dist / 700);
    const roll = 2.2 + Math.min(dist, 6000) / 1000;
    const vs = [voices[next], voices[(next + 1) % VOICES], voices[(next + 2) % VOICES]]; next = (next + 3) % VOICES;
    for (const v of vs) {
      v.ng.gain.cancelScheduledValues(t); v.og.gain.cancelScheduledValues(t); v.filt.frequency.cancelScheduledValues(t); v.osc.frequency.cancelScheduledValues(t);
      v.ng.gain.setValueAtTime(0, t); v.og.gain.setValueAtTime(0, t); v.pan.pan.setValueAtTime(pan, t);
    }
    // Rumble: low-passed noise rolling in irregular swells.
    const [r, c, b] = vs;
    r.filt.type = 'lowpass'; r.filt.Q.setValueAtTime(0.7, t);
    r.filt.frequency.setValueAtTime(900 * near + 160, t); r.filt.frequency.exponentialRampToValueAtTime(70, t + roll);
    let at = 0.04 + 0.5 * (1 - near);
    r.ng.gain.setValueAtTime(0.0001, t); r.ng.gain.linearRampToValueAtTime(0.9 * gain, t + at);
    for (let k = 1; at < roll - 0.6; k++) {
      at += 0.25 + 0.5 * Math.random();
      r.ng.gain.linearRampToValueAtTime(gain * (0.9 - 0.7 * at / roll) * (0.55 + 0.45 * Math.random()), t + at);
    }
    r.ng.gain.exponentialRampToValueAtTime(0.001, t + roll);
    // The crack (only close enough to carry): a hard noise burst.
    if (dist < 2200) {
      c.filt.type = 'bandpass'; c.filt.Q.setValueAtTime(0.9, t); c.filt.frequency.setValueAtTime(1800, t); c.filt.frequency.exponentialRampToValueAtTime(380, t + 0.35);
      c.ng.gain.setValueAtTime(0.0001, t); c.ng.gain.linearRampToValueAtTime(1.2 * gain * near, t + 0.004); c.ng.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    }
    b.osc.type = 'sine'; b.osc.frequency.setValueAtTime(62, t); b.osc.frequency.exponentialRampToValueAtTime(26, t + roll * 0.8);
    b.og.gain.setValueAtTime(0.0001, t); b.og.gain.linearRampToValueAtTime(0.75 * gain, t + 0.12); b.og.gain.exponentialRampToValueAtTime(0.001, t + roll * 0.9);
  }

  const self = {
    enabled: true,
    sandSound: null, sandActive: false, sandSpeed: 0, sandGrip: 0, sandWet: 0, sandFrozen: 0, sandAvalanche: 0,
    /** Listener (fields): camera position and its right vector (horizontal). */
    lx: 0.5, ly: 0.5, lz: 0.5, rx: 1.5 - 0.5, rz: 0.5 - 0.5,
    /** Sound position and loudness (fields) for the next play(). `tone` (0..2) picks the Flow cue's pitch. */
    x: 0.5, y: 0.5, z: 0.5, gain: 1.5 - 0.5, tone: 0,
    /** The Bell-mace's hum (fields, applied by update()): level 0..1, pitch 0..1 of the stored height, and whether it is at the cap. */
    hum: 0.5 - 0.5, humPitch: 0.5 - 0.5, humCap: false,
    /** Continuous levels (fields, 0..1), applied by update(): wind, ribbon hiss, rain. thunderDist: metres of the next THUNDER. */
    wind: 0.5 - 0.5, hiss: 0.5 - 0.5, rain: 0.5 - 0.5, shelter: 0.5 - 0.5, rainBed: 0.5 - 0.5, time: 0.5, thunderDist: 1000.5,

    /** Effects volume 0..1 (settings). */
    setVolume(v) { this.volume = v; if (master) master.gain.value = 0.7 * v; },
    volume: 1,
    /** The shared AudioContext (null until unlocked); music plays through it too. */
    context() { return ac; },

    /** Start (or resume) the audio context: call from a user gesture. */
    unlock() { if (this.enabled) init(); },

    play(kind) {
      if (!ac || ac.state !== 'running' || !this.enabled) return;
      // Thunder is heard everywhere at once: the owner has set `gain` and (in x, y, z, relative to the listener) its bearing.
      if (kind === SFX.THUNDER) { thunder(this.thunderDist, this.gain, Math.max(-1, Math.min(1, ((this.x - this.lx) * this.rx + (this.z - this.lz) * this.rz) / (Math.hypot(this.x - this.lx, this.z - this.lz) + 1e-3) * 0.7))); return; }
      const dx = this.x - this.lx, dy = this.y - this.ly, dz = this.z - this.lz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const far = kind === SFX.BOOM || kind === SFX.RUMBLE || kind === SFX.CHARGE ? 40 : 10;
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
        case SFX.CRUNCH:    // snow crushed / chipped: a rapid train of grain-breaks
        case SFX.STEP: {
          const step = kind === SFX.STEP;
          v.filt.type = 'bandpass'; q.setValueAtTime(step ? 0.9 : 1.3, t); f.setValueAtTime((step ? 1300 : 2100) * (0.85 + 0.3 * r), t);
          f.linearRampToValueAtTime((step ? 900 : 1500) * (0.85 + 0.3 * r), t + 0.1);
          const peak = (step ? 0.24 : 0.5) * g, grains = step ? 4 : 6;
          let at = t;
          for (let k = 0; k < grains; k++) {
            const a = peak * (0.45 + 0.55 * Math.random()) * (1 - k / (grains + 1));
            ng.setValueAtTime(0.0001, at); ng.linearRampToValueAtTime(a, at + 0.002); ng.exponentialRampToValueAtTime(0.002, at + 0.012 + 0.01 * Math.random());
            at += 0.011 + 0.014 * Math.random();
          }
          ng.setValueAtTime(0, at + 0.02);
          break;
        }
        case SFX.SHATTER:   // ice breaking: a bright crash, then shards ringing and tinkling down
          v.filt.type = 'highpass'; q.setValueAtTime(0.7, t); f.setValueAtTime(2600, t); f.exponentialRampToValueAtTime(5200, t + 0.4);
          ng.linearRampToValueAtTime(0.9 * g, t + 0.003); ng.exponentialRampToValueAtTime(0.001, t + 0.55);
          v.osc.type = 'triangle'; of.setValueAtTime(2600 + 900 * r, t); of.exponentialRampToValueAtTime(1500 + 500 * r, t + 0.5);
          og.linearRampToValueAtTime(0.28 * g, t + 0.003); og.exponentialRampToValueAtTime(0.001, t + 0.6);
          // Scattered pings on the next voices: shards landing over half a second.
          for (let k = 0; k < 3; k++) {
            const w = voices[next]; next = (next + 1) % VOICES;
            const at = t + 0.06 + k * 0.09 + 0.08 * Math.random(), fr = 3200 + 2600 * Math.random();
            w.ng.gain.cancelScheduledValues(t); w.og.gain.cancelScheduledValues(t); w.osc.frequency.cancelScheduledValues(t);
            w.ng.gain.setValueAtTime(0, t); w.og.gain.setValueAtTime(0, t);
            w.pan.pan.setValueAtTime(Math.max(-1, Math.min(1, pan + (Math.random() - 0.5) * 0.6)), t);
            w.osc.type = 'sine'; w.osc.frequency.setValueAtTime(fr, at);
            w.og.gain.setValueAtTime(0.0001, at); w.og.gain.linearRampToValueAtTime(0.14 * g, at + 0.002); w.og.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
          }
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
        case SFX.FLOW_UP: { // a tier gained: a soft rising tone, warmer each tier, with a breath of air under it
          const base = 330 * (this.tone === 0 ? 1 : this.tone === 1 ? 1.25 : 1.5);
          v.osc.type = 'sine'; of.setValueAtTime(base, t); of.exponentialRampToValueAtTime(base * 1.5, t + 0.5);
          og.linearRampToValueAtTime(0.16 * g, t + 0.06); og.exponentialRampToValueAtTime(0.001, t + 1.1);
          v.filt.type = 'bandpass'; q.setValueAtTime(0.9, t); f.setValueAtTime(900, t); f.exponentialRampToValueAtTime(3200, t + 0.5);
          ng.linearRampToValueAtTime(0.07 * g, t + 0.15); ng.exponentialRampToValueAtTime(0.001, t + 0.7);
          break;
        }
        case SFX.FLOW_DOWN: // a tier lost: the same tone sinking, and the air going out of it
          v.osc.type = 'sine'; of.setValueAtTime(330, t); of.exponentialRampToValueAtTime(190, t + 0.6);
          og.linearRampToValueAtTime(0.1 * g, t + 0.04); og.exponentialRampToValueAtTime(0.001, t + 0.7);
          v.filt.type = 'lowpass'; q.setValueAtTime(0.6, t); f.setValueAtTime(1400, t); f.exponentialRampToValueAtTime(240, t + 0.6);
          ng.linearRampToValueAtTime(0.06 * g, t + 0.05); ng.exponentialRampToValueAtTime(0.001, t + 0.6);
          break;
        case SFX.BOOM:      // a colossal footfall, a slam: felt more than heard
          v.osc.type = 'sine'; of.setValueAtTime(78, t); of.exponentialRampToValueAtTime(30, t + 0.7);
          og.linearRampToValueAtTime(1.0 * g, t + 0.01); og.exponentialRampToValueAtTime(0.001, t + 0.9);
          v.filt.type = 'lowpass'; q.setValueAtTime(0.7, t); f.setValueAtTime(700, t); f.exponentialRampToValueAtTime(120, t + 0.8);
          ng.linearRampToValueAtTime(0.9 * g, t + 0.01); ng.exponentialRampToValueAtTime(0.001, t + 0.9);
          break;
        case SFX.CHARGE:    // the Warden gathering its barrage: a glassy whine rising over three seconds under a growing hiss
          v.osc.type = 'triangle'; of.setValueAtTime(220, t); of.exponentialRampToValueAtTime(1320, t + 2.9);
          og.linearRampToValueAtTime(0.06 * g, t + 0.4); og.linearRampToValueAtTime(0.42 * g, t + 2.85); og.exponentialRampToValueAtTime(0.001, t + 3.1);
          v.filt.type = 'bandpass'; q.setValueAtTime(2.5, t); f.setValueAtTime(600, t); f.exponentialRampToValueAtTime(4800, t + 2.9);
          ng.linearRampToValueAtTime(0.05 * g, t + 0.5); ng.linearRampToValueAtTime(0.5 * g, t + 2.85); ng.exponentialRampToValueAtTime(0.001, t + 3.1);
          break;
        case SFX.SWISH:     // a weapon through the air: quick, airy; tone 0 a heavy low rush, 1 a light bright cut
          v.filt.type = 'bandpass'; q.setValueAtTime(1.6, t);
          f.setValueAtTime(this.tone === 0 ? 260 : 900, t); f.exponentialRampToValueAtTime(this.tone === 0 ? 1500 : 4200, t + 0.16);
          ng.linearRampToValueAtTime(0.55 * g, t + 0.035); ng.exponentialRampToValueAtTime(0.001, t + (this.tone === 0 ? 0.3 : 0.17));
          break;
        case SFX.CLANG:     // a blade glancing off armour: a short metallic ping
          v.osc.type = 'triangle'; of.setValueAtTime(1500 + 700 * r, t); of.exponentialRampToValueAtTime(1100 + 400 * r, t + 0.25);
          og.linearRampToValueAtTime(0.3 * g, t + 0.002); og.exponentialRampToValueAtTime(0.001, t + 0.3);
          v.filt.type = 'highpass'; q.setValueAtTime(0.8, t); f.setValueAtTime(3000, t);
          ng.linearRampToValueAtTime(0.4 * g, t + 0.002); ng.exponentialRampToValueAtTime(0.001, t + 0.08);
          break;
        case SFX.TOLL: {    // the Bell-mace's blow: a bronze bell struck, louder and longer the further it fell (tone 0..1 = stored height / 20 m)
          const u = this.tone, base = 262 - 110 * u, ring = 0.9 + 3.2 * u;
          v.osc.type = 'sine'; of.setValueAtTime(base, t);
          og.linearRampToValueAtTime(0.7 * g, t + 0.004); og.exponentialRampToValueAtTime(0.001, t + ring);
          v.filt.type = 'lowpass'; q.setValueAtTime(0.7, t); f.setValueAtTime(2200, t); f.exponentialRampToValueAtTime(260, t + 0.25);
          ng.linearRampToValueAtTime(0.5 * g, t + 0.003); ng.exponentialRampToValueAtTime(0.001, t + 0.3);
          // Upper partials of a cast bell (a minor third, a twelfth, a bright strike tone) on the next voices, dying faster.
          const ratios = [2.4, 3.0, 5.43];
          for (let k = 0; k < 3; k++) {
            const w = voices[next]; next = (next + 1) % VOICES;
            w.ng.gain.cancelScheduledValues(t); w.og.gain.cancelScheduledValues(t); w.osc.frequency.cancelScheduledValues(t);
            w.ng.gain.setValueAtTime(0, t); w.og.gain.setValueAtTime(0, t);
            w.pan.pan.setValueAtTime(pan, t);
            w.osc.type = 'sine'; w.osc.frequency.setValueAtTime(base * ratios[k], t);
            w.og.gain.linearRampToValueAtTime((0.3 - 0.07 * k) * g, t + 0.003); w.og.gain.exponentialRampToValueAtTime(0.001, t + ring * (0.7 - 0.18 * k));
          }
          break;
        }
        case SFX.RUMBLE:    // the shockwave rolling past
          v.filt.type = 'lowpass'; q.setValueAtTime(0.6, t); f.setValueAtTime(260, t); f.linearRampToValueAtTime(900, t + 0.6); f.exponentialRampToValueAtTime(120, t + 3);
          ng.linearRampToValueAtTime(1.0 * g, t + 0.35); ng.exponentialRampToValueAtTime(0.001, t + 3.2);
          v.osc.type = 'sine'; of.setValueAtTime(42, t); of.linearRampToValueAtTime(30, t + 3);
          og.linearRampToValueAtTime(0.8 * g, t + 0.2); og.exponentialRampToValueAtTime(0.001, t + 3);
          break;
      }
    },

    /** Continuous layers: wind (gusting), the Ribbon's hiss and the rain. */
    update() {
      if (!ac || ac.state !== 'running') return;
      const sand = this.sandSound;
      sand.active = this.enabled && this.sandActive; sand.speed = this.sandSpeed;
      sand.grip = this.sandGrip; sand.wet = this.sandWet; sand.frozen = this.sandFrozen; sand.avalanche = this.sandAvalanche;
      sand.update();
      const t = ac.currentTime, gust = 0.7 + 0.3 * Math.sin(this.time * 0.9) * Math.sin(this.time * 0.37 + 1.1);
      windGain.gain.setTargetAtTime(Math.min(0.5, this.wind * 0.32 * gust), t, 0.3);
      windFilter.frequency.setTargetAtTime(260 + 900 * this.wind * gust, t, 0.3);
      hissGain.gain.setTargetAtTime(this.hiss * 0.18, t, 0.04);
      humGain.gain.setTargetAtTime(this.hum * 0.07, t, 0.06);
      humOsc.frequency.setTargetAtTime(110 * Math.pow(4, this.humPitch), t, 0.05);              // two octaves, 110 to 440 Hz
      humOsc2.frequency.setTargetAtTime(110 * Math.pow(4, this.humPitch) * 1.5, t, 0.05);      // a fifth above
      humGain2.gain.setTargetAtTime(this.humCap ? this.hum * 0.05 : 0, t, 0.08);               // the steady overtone: more height adds nothing
      // Under a roof the patter is gone and a muffled drumming remains (the low bed lifts).
      rainGain.gain.setTargetAtTime(this.rain * 0.2 * (1 - this.shelter), t, 0.4);
      rainLowGain.gain.setTargetAtTime((this.rain * this.rain * 0.28) * (1 + 1.2 * this.shelter) + this.shelter * this.rainBed * 0.1, t, 0.4);
    },
  };
  return self;
}
