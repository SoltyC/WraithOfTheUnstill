// "The Flock in the Barley": once Dunn has asked, five Sedgerunners lie hidden in two flocks in his
// barley (game/shaped/behaviours.js 'flush': motionless until the Wraith comes within ~9 m, then the whole
// flock breaks at once). Break them all and the field is clear (`meadow:side-flock-cleared`).

const FLAG = 'meadow:side-flock-cleared';
/** Offsets from the field's centre (m): a flock of three in the north, two in the south (spawned together they flush together). */
const FLOCKS = [[[-14, 14], [-9, 19], [-18, 20]], [[16, -14], [20, -9]]];

export function addFlock(ctx) {
  const { g, flags } = ctx, { chapter, hud, music, shaped, shapedMod, capture } = g;
  const place = ctx.table['side-barley'];
  if (!place) return { tick() {} };
  const slots = [];
  let spawned = false;
  return {
    sync() { slots.length = 0; spawned = false; },
    tick() {
      if (flags.has(FLAG)) return;
      const step = ctx.stepOf('meadow-side-flock');
      if (!spawned) {
        // They lie down when the Wraith is told and comes within sight of the field (so none are spawned for nothing).
        if (!step || step === 'ask' || ctx.away('side-barley') > 90) return;
        spawned = true;
        for (const flock of FLOCKS) for (const [dx, dz] of flock) {
          const k = shaped.spawn('sedgerunner', place.pos[0] + dx, place.pos[1] + dz);
          if (k >= 0) slots.push(k);
        }
        if (!capture) hud.notice('The barley', 'Something lies in it', 'Walk through. They break when you come close.', 5);
        return;
      }
      for (let i = slots.length - 1; i >= 0; i--) {
        const s = shaped.slots[slots[i]].state;
        if (s === shapedMod.S.EMPTY || s === shapedMod.S.FALLING) slots.splice(i, 1);
      }
      if (slots.length > 0) {
        // The Wraith gave up and left (or fell and was re-formed far away): the flock goes back to ground and lies down again next time.
        if (ctx.away('side-barley') > 160) { for (const k of slots) shaped.damage(k, 1e9, false, 0, 0); slots.length = 0; spawned = false; }
        return;
      }
      flags.add(FLAG); chapter.raise('encounter:side-flock:clear'); music.sting('echo');
      if (!capture) hud.notice('Quiet', 'The barley is clear', 'Tell Dunn.', 5);
    },
  };
}
