// Reserve a whole encounter wave before any rising. FALLING bodies still own their slots
// until they finish sinking, so only EMPTY slots are available (as in shaped.spawn).
export function hasSpawnRoom(shaped, empty, needed) {
  let free = 0;
  for (let i = 0; i < shaped.slots.length; i++) {
    if (shaped.slots[i].state === empty && ++free >= needed) return true;
  }
  return needed === 0;
}
