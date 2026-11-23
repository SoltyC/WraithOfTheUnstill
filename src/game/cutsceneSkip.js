// A cutscene becomes skippable once the player has watched it in full.
export const SKIP_HOLD_SECONDS = 0.8;

/** Can the Wraith leave this cutscene early? */
export function canSkipCutscene(flags, id) {
  return !!id && id !== 'release' && !!flags?.has('seen:' + id);
}

/** Keep the cutscene in the player's viewing history when it finishes. */
export function markCutsceneSeen(flags, id) {
  if (id) flags?.add('seen:' + id);
}

/** Complete any shots the Wraith hasn't reached yet, then hand control back. */
export function finishCutscene(shotCount, lastCut, cut, end) {
  for (let i = lastCut + 1; i < shotCount; i++) cut(i);
  end();
}
