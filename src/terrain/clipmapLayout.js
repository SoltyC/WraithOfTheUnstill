// Shared clipmap storage geometry (rendering, compute and CPU diagnostics).
export const CLIPMAP_N = 512;
export const CLIPMAP_LEVELS = 11;

// Shadow coverage uses its original 256-cell grid, sampling the central subset of each level.
export const CLIPMAP_SHADOW_N = 256;
