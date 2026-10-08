// Music (BRIEF §13, deviated from by the user 2026-10-08, DECISIONS.md): the title, the waking,
// shrines, the Warden fight and its release, death, an Echo found, a pilgrim's lyre at the camp —
// and now a travelling score for the frost and plains (day, dusk, night, storm, height, the Run) so exploring is never
// bare. The wind still sits under it all; the score is quiet and slow, never a fight cue. Tracks are the user's own (assets/audio/music, encoded
// by tools/audio/encode-music.sh to data/audio/music/*.m4a).
//
// Beds (long cues) stream from media elements into the WebAudio graph (decoding all of them would
// hold ~330 MB of PCM); a looping bed has two elements and crossfades from its loop end back to
// its loop start. Stingers are short and decoded once. The director (systems/audio.js) sets
// `want` to the bed that should play each frame and calls sting(); update() eases gains with
// scheduled ramps only when a target changes, so idle frames do no work and allocate nothing.

/** Bed cues. loop: [start, end] s (crossfaded over xfade s) or null (plays once). */
export const BEDS = {
  title: { file: 'title', loop: [0, 196], xfade: 5, gain: 0.9, fadeIn: 2.5, fadeOut: 3 },
  waking: { file: 'waking', loop: null, gain: 0.85, fadeIn: 1.5, fadeOut: 4 },
  shrine: { file: 'shrine', loop: [1.5, 173], xfade: 5, gain: 0.7, fadeIn: 4, fadeOut: 4 },
  fight: { file: 'warden-fight', loop: [5, 178], xfade: 3, gain: 0.85, fadeIn: 2, fadeOut: 1.5 },
  release: { file: 'release', loop: null, gain: 1, fadeIn: 0.3, fadeOut: 6 },
  // The travelling score (whole-file loops: loop [0, 0] reads the length once loaded).
  'plains-wanderer': { file: 'plains-wanderer', loop: [0, 0], xfade: 6, gain: 0.6, fadeIn: 6, fadeOut: 6 },
  'plains-dusk': { file: 'plains-dusk', loop: [0, 0], xfade: 6, gain: 0.6, fadeIn: 6, fadeOut: 6 },
  'plains-herd': { file: 'plains-herd', loop: [0, 0], xfade: 4, gain: 0.65, fadeIn: 3, fadeOut: 4 },
  'frost-highlands': { file: 'frost-highlands', loop: [0, 0], xfade: 6, gain: 0.6, fadeIn: 6, fadeOut: 6 },
  'frost-blizzard': { file: 'frost-blizzard', loop: [0, 0], xfade: 6, gain: 0.65, fadeIn: 5, fadeOut: 6 },
  'frost-ice-caves': { file: 'frost-ice-caves', loop: [0, 0], xfade: 6, gain: 0.55, fadeIn: 6, fadeOut: 6 },
  camp: { file: 'camp-lyre', loop: [0, 170], xfade: 4, gain: 0.8, fadeIn: 3, fadeOut: 3, spatial: true },
};
/** Stingers: short, decoded, played over whatever bed is on. */
export const STINGS = { wake: 'warden-wake', death: 'death', echo: 'echo' };

const BASE = 'audio/music/';

/**
 * @param {{ context: () => AudioContext|null }} audio  shares the sfx context (one per page)
 */
export function createMusic(audio) {
  let ac = null, bus = null, duckGain = null;
  const beds = {};      // id → { def, els: [a, b], gains: [g, g], cur, xfading, playing, target, pan }
  const stings = {};    // id → AudioBuffer
  let ready = false;

  function init() {
    ac = audio.context();
    if (!ac) return false;
    bus = ac.createGain(); bus.gain.value = self.volume;
    duckGain = ac.createGain(); duckGain.gain.value = 1;
    bus.connect(duckGain); duckGain.connect(ac.destination);
    for (const id in BEDS) {
      const def = BEDS[id];
      const n = def.loop ? 2 : 1, els = [], gains = [];
      let out = bus, pan = null;
      if (def.spatial) {
        pan = ac.createPanner(); pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse';
        pan.refDistance = 8; pan.rolloffFactor = 1.4; pan.maxDistance = 200;
        pan.connect(bus); out = pan;
      }
      for (let k = 0; k < n; k++) {
        const el = new Audio();
        el.src = BASE + def.file + '.m4a'; el.preload = id === 'title' ? 'auto' : 'metadata'; el.crossOrigin = 'anonymous';
        const src = ac.createMediaElementSource(el), g = ac.createGain(); g.gain.value = 0;
        src.connect(g); g.connect(out);
        els.push(el); gains.push(g);
      }
      beds[id] = { def, els, gains, cur: 0, prev: 0, xfading: false, playing: false, pan, done: false, stopAt: 0 };
    }
    for (const id in STINGS) {
      fetch(BASE + STINGS[id] + '.m4a').then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((buf) => { stings[id] = buf; }, (e) => console.warn('[music]', id, e));
    }
    ready = true;
    return true;
  }

  function startEl(b, k, at, fadeIn) {
    const el = b.els[k], g = b.gains[k].gain, t = ac.currentTime;
    el.currentTime = at;
    el.play().catch(() => {});
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(b.def.gain, t + fadeIn);
  }
  function fadeEl(b, k, secs) {
    const g = b.gains[k].gain, t = ac.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + secs);
  }

  const self = {
    enabled: true,
    /** The bed that should play now (id in BEDS) or null; set by the director every frame. */
    want: null,
    /** Master music volume (settings) and dialogue ducking (0 none … 1 full duck), fields. */
    volume: 0.8, duck: 0.5 - 0.5,
    /** Listener and the spatial bed's source (the camp fire), fields. */
    lx: 0.5, ly: 0.5, lz: 0.5, fx: 0.5 - 0.5, fz: 1.5 - 0.5, sx: 0.5, sy: 0.5, sz: 0.5,
    /** Bed currently audible (for the dev overlay and tests). */
    current: null,
    /** One-shot beds that finished since `want` last changed (the director moves on). */
    finished: null,

    /** Start the graph (from a user gesture, after the sfx context exists). */
    unlock() { if (!ready && this.enabled) init(); },

    /** Play a stinger over the bed. */
    sting(id) {
      if (!ready || !this.enabled || !stings[id] || ac.state !== 'running') return;
      const s = ac.createBufferSource(); s.buffer = stings[id];
      const g = ac.createGain(); g.gain.value = 0.9;
      s.connect(g); g.connect(bus); s.start();
    },

    /** Restart a one-shot bed the next time it is wanted (a new release, a new game). */
    rearm(id) { if (beds[id]) beds[id].done = false; },

    update() {
      if (!ready || !this.enabled) return;
      const want = this.want;
      for (const id in beds) {
        const b = beds[id], def = b.def, on = id === want && !b.done;
        if (on && !b.playing) { b.playing = true; b.cur = 0; b.xfading = false; startEl(b, 0, def.loop ? def.loop[0] : 0, def.fadeIn); }
        else if (!on && b.playing) {
          b.playing = false;
          // The fight and the release take over quickly: whatever played gives way in 1.5 s.
          const out = want === 'fight' || want === 'release' ? Math.min(def.fadeOut, 1.5) : def.fadeOut;
          for (let k = 0; k < b.els.length; k++) fadeEl(b, k, out);
          b.stopAt = ac.currentTime + out + 0.1;
        }
        if (!b.playing) {
          if (b.stopAt > 0 && ac.currentTime > b.stopAt) { for (let k = 0; k < b.els.length; k++) b.els[k].pause(); b.stopAt = 0; }
          continue;
        }
        const el = b.els[b.cur];
        if (def.loop) {
          // Crossfade back to the loop start before the end (equal-length linear ramps).
          const end = def.loop[1] || (el.duration > 0 ? el.duration : 1e9);
          if (!b.xfading && el.currentTime >= end - def.xfade) {
            const o = 1 - b.cur;
            startEl(b, o, def.loop[0], def.xfade); fadeEl(b, b.cur, def.xfade);
            b.xfading = true; b.prev = b.cur; b.cur = o;
          } else if (b.xfading && b.els[b.prev].currentTime >= (def.loop[1] || b.els[b.prev].duration || 1e9) - 0.05) { b.els[b.prev].pause(); b.xfading = false; }
        } else if (el.ended || (el.duration > 0 && el.currentTime >= el.duration - 0.05)) {
          b.playing = false; b.done = true; this.finished = id;
        }
        if (b.pan) {
          const p = b.pan;
          p.positionX.value = this.sx; p.positionY.value = this.sy; p.positionZ.value = this.sz;
        }
      }
      if (beds.camp && beds.camp.pan) {
        const L = ac.listener;
        if (L.positionX) {
          L.positionX.value = this.lx; L.positionY.value = this.ly; L.positionZ.value = this.lz;
          L.forwardX.value = this.fx; L.forwardY.value = 0; L.forwardZ.value = this.fz;
        }
      }
      this.current = null;
      for (const id in beds) if (beds[id].playing) this.current = id;
      bus.gain.value = this.volume;
      duckGain.gain.value = 1 - 0.55 * this.duck;
    },
  };
  return self;
}
