// System and post-process toggles. Each entry can be flipped from the dev overlay for A/B.
// Systems check `toggles.on.<key>`; `onChange` lets a system react (e.g. detach a mesh).

/** @typedef {{ key: string, label: string, group: 'System'|'Post'|'Debug', on: boolean, onChange?: (on: boolean) => void }} ToggleDef */

/** @type {ToggleDef[]} */
export const toggleDefs = [];
export const toggles = { on: /** @type {Record<string, boolean>} */ ({}) };

/** @param {ToggleDef} def */
export function registerToggle(def) {
  const existing = toggleDefs.find((d) => d.key === def.key);
  if (existing) { existing.onChange = def.onChange; return; }
  toggleDefs.push(def);
  toggles.on[def.key] = def.on;
}

export function setToggle(key, on) {
  toggles.on[key] = on;
  const d = toggleDefs.find((t) => t.key === key);
  if (d && d.onChange) d.onChange(on);
}
