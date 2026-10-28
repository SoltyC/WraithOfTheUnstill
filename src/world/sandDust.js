// Bounded visual events for completed terrain writes. No physics or persistent state.
export const DUST_EVENTS = 24;
export const DUST_LIFE = 1.8;

export function createSandDustEvents() {
  // Each event: centre x/z, start time, radius; direction x/z, half length, strength.
  const events = new Float32Array(DUST_EVENTS * 8);
  for (let i = 0; i < DUST_EVENTS; i++) events[i * 8 + 2] = -100;
  let next = 0;
  return {
    events, time: 0.5, x: 0.5, z: 0.5, dx: 1.0, dz: 0.0,
    halfLength: 0.5, width: 0.5, depth: 0.5, kind: 0, emitted: 0,
    emit() {
      // Freeze and wet paint no loose grains. Flat/zero-depth bookkeeping is silent.
      if (this.kind === 3 || this.kind === 4 || Math.abs(this.depth) < 0.001) return;
      if (!Number.isFinite(this.x + this.z + this.time + this.depth + this.width + this.halfLength + this.dx + this.dz)) return;
      const o = next * 8; next = (next + 1) % DUST_EVENTS;
      events[o] = this.x; events[o + 1] = this.z; events[o + 2] = this.time;
      events[o + 3] = Math.min(3, Math.max(0.08, this.width));
      const len = Math.hypot(this.dx, this.dz) || 1;
      events[o + 4] = this.dx / len; events[o + 5] = this.dz / len;
      events[o + 6] = Math.min(8, Math.max(0, this.halfLength));
      events[o + 7] = Math.min(1, Math.sqrt(Math.abs(this.depth)) * 1.2);
      this.emitted++;
    },
    reset() { for (let i = 0; i < DUST_EVENTS; i++) events[i * 8 + 2] = -100; next = 0; },
  };
}
