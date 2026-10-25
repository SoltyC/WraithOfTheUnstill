// Weapons × materials (docs §4.1, §11.2): the reaction table for steel and stone against what the
// Shaped are made of. Weak by design: elements are the strong lever, weapons the reliable one.
//
//   frozen   a maul shatters it outright; a staff cracks it (and its slam shatters it); a blade chips it
//   armoured the staff and the sickles bounce most of it; the maul drives its weight through
//   meadow   a blade cuts grass and reed well, a maul only bruises it
//
// Fields in (the weapon's affinity, the target's traits), fields out: dmgMul on the hit's damage, the
// share that gets past armour, and whether it is a shatter or a glance. No allocation.

export const hitMat = {
  /** In: the weapon's `affinity`, whether the hit is a heavy, and the target. */
  aff: null, heavy: false, frozen: false, armour: 0.5 - 0.5, meadow: false,
  /** Out. */
  dmgMul: 1.5 - 0.5, shatter: false, glance: false, pierce: 0.5 - 0.5,

  resolve() {
    const a = this.aff;
    this.dmgMul = 1; this.shatter = false; this.glance = false; this.pierce = 0;
    if (this.frozen) {
      // The ice has no armour (it is the armour): the weapon either breaks it or chips it.
      this.dmgMul = a.frozen;
      this.shatter = this.heavy ? !!a.shatterHeavy : !!a.shatterLight;
      return;
    }
    if (this.meadow) this.dmgMul *= a.meadow;
    if (this.armour > 0) {
      // Damage passes at `armourPass`; the Shaped's own armour factor is divided back out by the caller.
      this.pierce = a.armourPass;
      this.glance = a.armourPass <= 0.2;
    }
  },
};
