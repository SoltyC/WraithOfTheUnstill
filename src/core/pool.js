// Fixed-capacity object pool. Objects are created up front; acquire/release never allocate.
// Used for every transient (particles, splats, projectiles, decals, audio voices).

export class Pool {
  /**
   * @template T
   * @param {() => T} create  factory, called `capacity` times at construction only
   * @param {number} capacity
   * @param {(obj: T) => void} [reset] called on release
   */
  constructor(create, capacity, reset) {
    this.capacity = capacity;
    this.reset = reset || null;
    /** @type {T[]} */
    this.items = new Array(capacity);
    /** Stack of free indices. */
    this.free = new Int32Array(capacity);
    /** 1 when the slot is in use. Guards against double release. */
    this.live = new Uint8Array(capacity);
    for (let i = 0; i < capacity; i++) {
      const o = create();
      o.__poolIndex = i;
      this.items[i] = o;
      this.free[i] = capacity - 1 - i;
    }
    this.freeCount = capacity;
  }

  get used() { return this.capacity - this.freeCount; }

  /** @returns the object, or null when the pool is exhausted (callers must tolerate this). */
  acquire() {
    if (this.freeCount === 0) return null;
    const i = this.free[--this.freeCount];
    this.live[i] = 1;
    return this.items[i];
  }

  release(obj) {
    const i = obj.__poolIndex;
    if (i === undefined || this.items[i] !== obj) throw new Error('Pool.release: foreign object');
    if (this.live[i] === 0) throw new Error('Pool.release: double release');
    this.live[i] = 0;
    if (this.reset) this.reset(obj);
    this.free[this.freeCount++] = i;
  }

  /** Visit every live object without allocating. */
  forEachLive(fn) {
    for (let i = 0; i < this.capacity; i++) if (this.live[i] === 1) fn(this.items[i]);
  }
}
