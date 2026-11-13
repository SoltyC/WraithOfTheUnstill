# The meadow overhaul (target: `screenshots/reference/meadow-target.jpg`, user 2026-11-13)

The user: "WE WANT THIS KIND OF VISUALS... it's tricky to do with our architecture and I want you to
figure out how." The reference comes from a solo developer's custom engine:
- cluster LOD (virtual geometry), with voxels for the far representation and no impostors
- screen-space plus voxel GI, with no ray tracing
- proxies with no instance data for the very far

We are on Babylon 9 / WebGPU in a browser, Low must hold 60 fps on an Iris Xe, and WebGPU has no
mesh shaders or bindless. So we keep the *ideas* and pick browser-sized techniques for each.

## The gap, read against our own shots (`screenshots/meadow-baseline/`)

| # | The reference | Us now | Cost to the look |
|---|---|---|---|
| 1 | A hill forested to the skyline: thousands of trees, a continuous canopy with a broken top, pale rock outcrops through it | Trees stop at 365 m (`LOD_OUT`, High). Every hill behind the village is bare smooth green terrain. | The biggest gap: half the frame |
| 2 | Crowns with volume: bright sunlit tops, dark interiors, clumped silhouettes | Leaf cards lit almost flat: the inner-crown darkening is 0.68–1.0 by facing and height only. Crowns read as bright brush strokes. | High: every tree |
| 3 | Dense, fine, saturated green grass, colour patches, wind waves, small flowers sprinkled through it | Tall yellow-olive blades, sparse at mid range. Past ~60 m the ground texture shows through. | High: the lower half of the frame |
| 4 | A deep blue sky, soft cumulus with shaded bellies | Pale haze-blue sky, wispy cloud layer | Medium |
| 5 | Crisp midday light, shadows coloured by sky, bounce light under trees | Good sun shadows; shade lit by the SH sky only | Medium (GI) |

## The plan (each step measured with `tools/bot/preset-perf.mjs` on High and Low)

**M1: crown volume (cheap, every tree).** The generator knows each leaf cluster's place in its
crown. It will bake a per-vertex **crown depth** (0 on the hull, 1 at the core), computed against
the crown's convex hull or its ellipsoid fit, plus a **crown-centre normal**. The leaf shader
uses them for:
- self-occlusion: AO and sky visibility falling to about 0.25 at the core
- direct light attenuated by the depth along the sun (an exponential through the crown ellipsoid,
  so the sunlit side glows and the far side darkens)
- spherised normals for a soft mass

No new geometry: the "volume" look of the reference's trees is mostly this.

**M2: the far forest: impostors from 365 m to ~2.5 km.**
- At load, render octahedral impostors from the generator's variants (8 per species, 8×8 views,
  256² per view: albedo, normal, depth). This was planned in PLAN Q4 and is the browser-sized
  stand-in for the reference's voxels.
- A compute pass places them from the same placement function the near trees use (the same groves,
  so nothing pops at 365 m), into fixed storage slots.
- One vertex-pulled quad draw, with empty slots collapsed as the Shaped view does. That is a fixed
  draw, which suits snapshot rendering.
- A dithered cross-fade into the near trees. They cast shadows only in the far cascade.
- Budget: ~40k instances (High), 15k (Low).

**M3: the canopy shell beyond ~2.5 km** (the reference's "proxies without instance data"). The
clipmap terrain shader reads the same forest density and lifts the ground into a lumpy canopy
heightfield, with crown-sized noise, dark gaps and sunlit tops. Free in vertex cost, so far
hills stay forested to the horizon.

**M4: grass to the reference.**
- A greener palette, with patchy colour and height fields (clover, fescue, seed heads).
- Density weighted to the mid range.
- A far grass layer in the terrain shader that continues the blades' colour and wind shimmer
  where the blades end, so the ground never shows through.
- Small flowers sprinkled as noise, not only in drifts.

**M5: sky and light.**
- Clear-weather Mie haze lowered for a deep blue.
- Cumulus: the existing cloud layer reshaped into puffy cells with shaded bellies (the cloud noise
  from `shaders/post/fog.wgsl.js`, a new density profile).
- Under trees, a cheap bounce: green-tinted fill from the canopy map, already half there
  (`canopyFill`).

**M6: rock outcrops** on the meadow's slopes: limestone pieces from the Blender sculpt pipeline
(`tools/models/`, as the Walker's), placed by slope and by the forest's gaps.

**Not doing:**
- Real virtual geometry. WebGPU has no mesh shaders, and Babylon's frame graph is CPU-bound per
  draw (see the perf-main-thread note). Fixed vertex-pulled draws give us most of the benefit.
- Voxel GI. Too heavy for Iris Xe; revisit as a High/Ultra-only extra.

Order: M1 → M2 → M4 → M5 → M3 → M6. The user reviews after M2 (the hill shot) and after M4 (the
meadow shot) at the reference's framing.
