// The Lung's sounds (Phase 10 U2; systems/lung.js drives them through sfx): built once at audio unlock, no sample files, no nodes
// made per update (the breath's bubbles reuse a small pool of oscillators).
//  - the tear: a hiss of air escaping through water — band-passed noise, its level chopped into bubbling by a fast flutter;
//  - the breath: a few bubbles let out of the Lung — short sine blips whose pitch rises as each bubble forms and lets go;
//  - the whirlpool: a deep churning rumble that swells and rises as it spins up, its filter swept round with the turn.
export function createLungSound(ctx, noise, output) {
  // The hiss.
  const hs = ctx.createBufferSource(); hs.buffer = noise; hs.loop = true;
  const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 2600; hf.Q.value = 1.4;
  const hg = ctx.createGain(); hg.gain.value = 0;
  // Its flutter: a square LFO at ~13 Hz on a second gain (the hiss breaks into bubbles).
  const fl = ctx.createOscillator(); fl.type = 'square'; fl.frequency.value = 13;
  const flDepth = ctx.createGain(); flDepth.gain.value = 0.35;
  const fg = ctx.createGain(); fg.gain.value = 0.65;
  fl.connect(flDepth); flDepth.connect(fg.gain);
  hs.connect(hf); hf.connect(fg); fg.connect(hg); hg.connect(output);
  hs.start(0, 0.83); fl.start();
  // The whirl.
  const ws = ctx.createBufferSource(); ws.buffer = noise; ws.loop = true;
  const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 160; wf.Q.value = 3;
  const wg = ctx.createGain(); wg.gain.value = 0;
  const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 38;
  const sg = ctx.createGain(); sg.gain.value = 0;
  ws.connect(wf); wf.connect(wg); wg.connect(output); sub.connect(sg); sg.connect(output);
  ws.start(0, 1.91); sub.start();
  // The breath's bubbles: a pool of sine voices, each gated by its own gain.
  const POOL = 6, pool = [];
  for (let i = 0; i < POOL; i++) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 400;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(output); o.start(); pool.push({ o, g });
  }
  let next = 0, phase = 0;
  return {
    /** Inputs: the tear's stream 0..1, the whirl's spin 0..1 (−1: not in it), under the water. */
    stream: 0, spin: -1, under: false,
    /** A breath out: n bubbles over a quarter second, quieter and lower as the Lung empties (air 0..1). */
    puff(n = 4, air = 1) {
      const t0 = ctx.currentTime;
      for (let k = 0; k < n; k++) {
        const v = pool[next]; next = (next + 1) % POOL;
        const t = t0 + k * (0.04 + 0.05 * Math.random()), f0 = 260 + 380 * Math.random() * (0.6 + 0.4 * air), dur = 0.05 + 0.04 * Math.random();
        v.o.frequency.cancelScheduledValues(t); v.o.frequency.setValueAtTime(f0, t); v.o.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + dur);
        v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(0, t); v.g.gain.linearRampToValueAtTime(0.05 * (0.4 + 0.6 * air), t + 0.006); v.g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      }
    },
    update(dt) {
      const t = ctx.currentTime;
      const s = this.under ? Math.max(0, Math.min(1, this.stream)) : 0;
      hg.gain.setTargetAtTime(0.09 * s, t, s > 0 ? 0.03 : 0.25);
      hf.frequency.setTargetAtTime(1800 + 1600 * s, t, 0.2);
      fl.frequency.setTargetAtTime(9 + 8 * s + 3 * Math.sin(t * 2.3), t, 0.1);
      const w = this.spin >= 0 && this.under ? 0.25 + 0.75 * Math.min(1, this.spin) : 0;
      phase += (dt || 0) * (0.6 + 3.5 * Math.max(0, this.spin));
      wg.gain.setTargetAtTime(0.22 * w, t, w > 0 ? 0.4 : 0.6);
      sg.gain.setTargetAtTime(0.12 * w * w, t, 0.5);
      wf.frequency.setTargetAtTime((120 + 260 * w) * (1 + 0.35 * Math.sin(phase * 6.2832)), t, 0.05);
      sub.frequency.setTargetAtTime(34 + 18 * w, t, 0.4);
    },
  };
}
