# Assets and third-party code

Every third-party asset and its licence (BRIEF §3). Everything ships from the repository or the
bundle. There are no runtime CDN fetches; Babylon's GLSL compiler download paths are explicitly
emptied in `src/main.js`.

## Art assets (textures, HDRIs, meshes, audio)

_None yet._ Everything on screen in Phase 0 is procedural: the terrain, sky, stars, noise and capsule.

## Runtime code

| Package | Version | Licence | Use |
|---|---|---|---|
| @babylonjs/core | 9.29.0 | Apache-2.0 | WebGPU engine (bundled by Vite) |

## Build, test and tooling (not shipped)

| Package | Version | Licence | Use |
|---|---|---|---|
| vite | 8.3.2 | MIT | dev server and bundler |
| vitest | 5.0.3 | MIT | logic tests |
| playwright | 1.63.0 | Apache-2.0 | photo-spot capture, heap profile, overlay check |
| fake-indexeddb | 6.2.5 | Apache-2.0 | IndexedDB in save tests |
| source-map-js | 1.2.2 | BSD-3-Clause | resolving heap-profile frames (transitive dependency of Vite) |
