// Continuous grain friction: two looping noise beds, built once at audio unlock.
// Hiss carries individual grains/carve load; low rush carries speed/weight. No event voices,
// sample files, per-update nodes or music changes. Singing avalanches need actual mass events.
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
  return {
    active: false, speed: 0, grip: 0, wet: 0, frozen: 0,
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
    },
  };
}
