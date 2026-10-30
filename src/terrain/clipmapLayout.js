// Shared clipmap storage geometry (rendering, compute and CPU diagnostics).
export const CLIPMAP_N = 256;
export const CLIPMAP_LEVELS = 12;

// 256 cells per level side (512 sharpened far dunes a little for +1–2 ms on every frame, meadow included:
// the analytic crest normals carry the crests instead; DECISIONS.md 2026-10-30). Shadow coverage uses
// its own 256-cell grid, sampling the central subset of each level.
export const CLIPMAP_SHADOW_N = 256;
