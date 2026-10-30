// Continuous grain friction: two looping noise beds, built once at audio unlock.
// Hiss carries individual grains/carve load; low rush carries speed/weight. No event voices,
// sample files, per-update nodes or music changes. The singing sand: a slip face avalanching under a
// carve booms — a low, steady drone near 95 Hz with its harmonics, swelling slowly and dying away
// (real booming dunes hum 70–105 Hz for as long as the sand flows), driven by the wake's avalanche level.
export function createSandSurfSound(ctx, noise, output) {
  const hissSource = ctx.createBufferSource(), rushSource = ctx.createBufferSource();
  hissSource.buffer = noise; rushSource.buffer = noise;
  hissSource.loop = true; rushSource.loop = true;
  const hissFilter = ctx.createBiquadFilter(), rushFilter = ctx.createBiquadFilter();
  hissFilter.type = 'bandpass'; hissFilter.Q.value = .65;
  rushFilter.type = 'lowpass'; rushFilter.Q.value = .55;
  const hissGain = ctx.createGain(), rushGain = ctx.createGain();
  hissGain.gain.value = 0; rushGain.gain.value = 0;
  hissSource.connect(hissFilter); hissFilter.connect(hissGain); hissGain.connect(output);
  rushSource.connect(rushFilter); rushFilter.connect(rushGain); rushGain.connect(output);
  hissSource.start(0, .31); rushSource.start(0, 1.37);
  // The boom: two close sines (a slow beat) and the second and third harmonics, through a low-pass,
  // with a little of the rush noise for the grain in it.
  const boomGain = ctx.createGain(); boomGain.gain.value = 0;
  const boomFilter = ctx.createBiquadFilter(); boomFilter.type = 'lowpass'; boomFilter.frequency.value = 420; boomFilter.Q.value = 0.7;
  boomFilter.connect(boomGain); boomGain.connect(output);
  const boomOsc = [[95, 1], [96.3, 0.8], [190.5, 0.35], [286, 0.16]].map(([f, a]) => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.value = a;
    o.connect(g); g.connect(boomFilter); o.start(); return o;
  });
  return {
    active: false, speed: 0, grip: 0, wet: 0, frozen: 0, avalanche: 0,
    boomLevel: 0,
    // Published control targets; WebAudio applies the eased envelopes.
    hissLevel: 0, rushLevel: 0, hissHz: 1400, rushHz: 180,
    update() {
      const speed = Math.max(0, Math.min(1, (this.speed - 1) / 31));
      const grip = Math.max(0, Math.min(1, this.grip));
      const wet = Math.max(0, Math.min(1, this.wet));
      const crust = Math.max(0, 1 - Math.max(0, this.frozen) * 2);
      const contact = this.active ? crust : 0;
      this.hissLevel = contact * speed * (.075 + .045 * grip) * (1 - wet) * (1 - wet);
      this.rushLevel = contact * speed * speed * (.065 + .015 * grip) * (1 - .7 * wet);
      this.hissHz = (1400 + 2400 * speed + 600 * grip) * (1 - .55 * wet);
      this.rushHz = 180 + 520 * speed;
      const t = ctx.currentTime;
      hissGain.gain.setTargetAtTime(this.hissLevel, t, this.hissLevel > 0 ? .045 : .09);
      rushGain.gain.setTargetAtTime(this.rushLevel, t, this.rushLevel > 0 ? .075 : .12);
      hissFilter.frequency.setTargetAtTime(this.hissHz, t, .06);
      rushFilter.frequency.setTargetAtTime(this.rushHz, t, .08);
      // The boom swells over a second or so and fades over a few (it outlasts the carve a little).
      const av = Math.max(0, Math.min(1, this.avalanche)) * crust * (1 - wet);
      this.boomLevel = av * av * 0.14;
      boomGain.gain.setTargetAtTime(this.boomLevel, t, this.boomLevel > boomGain.gain.value ? 0.6 : 1.2);
      const pitch = 92 + 8 * av;
      boomOsc[0].frequency.setTargetAtTime(pitch, t, 0.8); boomOsc[1].frequency.setTargetAtTime(pitch * 1.0137, t, 0.8);
      boomOsc[2].frequency.setTargetAtTime(pitch * 2.005, t, 0.8); boomOsc[3].frequency.setTargetAtTime(pitch * 3.01, t, 0.8);
    },
  };
}
