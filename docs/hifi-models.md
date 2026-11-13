# High-fidelity models (branch `claude/hifi-models`, 2026-11-13)

The user, 2026-11-13: bosses and creatures should look high fidelity, not low poly; "we want custom
3D models". This doc records the free ways to make them, the pipeline built for the pilot (the Long
Walker), and what comes next.

## Why things looked low poly

Every creature was a cluster of procedural icosphere "chunks" (`render/shapedView.js`). The lesser
Shaped used subdivision 1 (20 triangles a chunk) with deliberately flat facets (`shaders/shaped.wgsl.js`);
the Long Walker used subdivision 3. There were no authored meshes, no baked normal maps and no glTF
anywhere. BRIEF §3/§8 and DECISIONS.md ("no imported meshes") made it so. **Those rules need amending
by the user before this branch merges** (see "Decisions" below).

## Free ways to get custom models (researched 2026-11-13)

| Route | Cost | Fit | Notes |
|---|---|---|---|
| **Blender scripted sculpts (this branch)** | free (Blender 5.2, already installed) | rock, ice, stone, bark, root bodies; armour plates; anything the Shaped are made of | Claude writes seeded Python sculptors; Blender meshes, decimates, unwraps, bakes. Deterministic, reviewable as code, no licence questions. Weak at faces, hands and anatomy. |
| **Hand sculpting in Blender** | free; the user's or an artist's time | hero bosses, faces, the Wraith's hands | Same bake pipeline: drop a `.blend` sculpt in, run the bake. The highest ceiling. |
| **CC0 scanned models** (Poly Haven models, ambientCG, Smithsonian Open Access 3D) | free, CC0 | rocks, ruins, props, kit pieces | "Scans look sick" (user, 2026-10-09). Rock scans would suit the Walker and Warden chunks directly. Quixel Megascans is free **only inside Unreal**: not usable here. |
| **Open-weight AI image→3D** (TRELLIS.2 (MIT), Hunyuan3D (Tencent community licence; excludes EU/UK/KR)) | free weights, but 16–24 GB VRAM for TRELLIS.2 (the 3060 has 12 GB) | props at most | BRIEF bans AI-generated character meshes. Topology and UVs need cleanup; licence varies by model. Not used. |
| **Rigging/animation** | free (Blender; Mixamo is free but its licence and rigs suit humans only) | bosses | Our bosses keep procedural IK/gait (BRIEF §8); a sculpted body can be skinned to the existing bones. |

Tools for the web build, all free: `gltfpack`/meshoptimizer (MIT) for compression and LODs,
KTX-Software (Apache-2.0) for BC7/ASTC textures (PLAN Q1 already plans KTX2).

## The pipeline (pilot: the Long Walker)

1. `tools/models/walker_pieces.py`, run headless in Blender 5.2 from WSL:

   ```
   B="/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
   "$B" -b --factory-startup --python "$(wslpath -w tools/models/walker_pieces.py)" -- "<windows out dir>" 4096
   ```

   It sculpts 25 pieces in five families (sandstone hide masses with strata ledges, joints and tafoni;
   chipped carved ruin plates; bedded sandstone blocks; drifted sand; twisted thorns) at 200–330k
   triangles each. It decimates each one to a game mesh (LOD0 500–3,200 triangles, LOD1 a third of
   that, with the same UVs) and packs all pieces into one atlas at an even texel density. On the GPU
   (OptiX) it bakes the high sculpt onto the low mesh: an object-space normal and AO. About 5 minutes
   in total. `quick` as a third argument runs a smoke test with one coarse piece per family.
2. Outputs, vendored in `data/models/`:
   - `walker-pieces.glb`: plain glTF, so it opens in Blender.
   - `walker-pieces.webp` (4K) and `walker-pieces-2k.webp`: RG holds the octahedral normal (game frame),
     B the AO. Lossless, because chroma subsampling would wreck packed data.
3. In the game:
   - `render/glb.js` is a 60-line GLB reader with no dependency.
   - `render/shapedPieces.js` maps chunk kinds to families and picks a variant by the chunk's seed,
     so neighbours differ.
   - `render/shapedView.js` builds the merged mesh from pieces (the other kinds keep the clod).
   - `shaders/shaped.wgsl.js` gained a piece variant. It decodes the baked normal, takes it through
     the chunk's scale and rotation, and lays the vendored scans (cliff-strata, sandstone-smooth,
     stone-pale, sand-fine) over it biplanar in the chunk's own frame, so the detail rides with the
     body. AO goes on the ambient and part of the key.
   - The non-piece shaders compile to the same code as before.
4. Presets: High and Ultra use LOD0 with the 4K atlas near and LOD1 far. Medium uses the 2K atlas. Low
   uses LOD1 near and the old clods far.
5. `?pieces=0` shows the old clods for before/after shots (`tools/bot/walker-look.mjs <tag>`).

## Decisions for the user

- Amend BRIEF §3/§8 and DECISIONS "no imported meshes": authored, baked meshes allowed for
  creatures and bosses (procedural motion stays). People too?
- The Warden and the Bellwether are off limits without an explicit go-ahead. Their chunk renderers
  could take the same pieces (ice/snow, turf/drystone/root).
- Who sculpts hero pieces that scripts do badly (faces, hands, the Listener)?

## Results (2026-11-13, RTX 3060, Windows Chrome; GPU apps closed)

Shots: `screenshots/walker-pieces/walker-before-*.png` (procedural clods) and `walker-hifi4-*.png` (pieces), from
the same four cameras (`tools/bot/walker-look.mjs`). No facets anywhere. The legs and hull read as
weathered bedded sandstone: ledges, joints, tafoni, chipped ruin plates.

GPU frame time, Walker drawn minus culled (`tools/bot/walker-perf.mjs 60`, median of 2×240 frames, 0 GPU errors):

| Preset | Old clods | Pieces |
|---|---|---|
| High (0.8 scale) | ~0.5 ms | ~1.9 ms (+1.4) |
| Low (0.5 scale) | ~0.07 ms | ~0.33 ms (+0.25) |

The cost is per pixel, not per triangle: LOD1 from 90 m changed nothing, and taking the scans off saved
~0.35 ms. The rest is the piece path's extra pixel work over the Walker's heavily overlapping masses.

Open issues:
- **Cost:** a depth prepass for the Walker, culling the hull masses buried under the deck, and no
  scans beyond ~150 m. Target: within +0.5 ms on High.
- **The belly:** the sand discs under the hull stack like shingles. Each rim's sun shadow draws a
  dark crescent on the next. The sculpts are fine; the layout is the problem (walker.js `buildChunks`
  belly row), and the noisy clods used to hide it. Re-space them, or give the belly hide pieces.
- **Atlas size:** 7.3 MB (4K) + 3.6 MB (2K) lossless WebP. KTX2/BC7 (PLAN Q1) would roughly halve the
  download and cut VRAM to ¼.
