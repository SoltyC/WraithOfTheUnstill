# The look: what makes Elden Ring beautiful, and what it means for us (2026-11-13)

The user, 2026-11-13: "research what makes Elden Ring look good, like its atmospheric effects and
lighting, and how we can make an aesthetic which looks great here." Sources at the end. Most of
this comes from FromSoftware's own CEDEC talks (2022: the atmosphere; 2022: the character models;
2025: environment layout).

## What FromSoftware actually does

**1. Art direction beats fidelity.** Early Elden Ring was built from real-world references: low
saturation, natural. The team found it had no identity, every area felt alike, and weather changed
only the amount of cloud. Two concepts fixed it:
- **Painterly visuals:** colours no Earth landscape has, and strong composed framing.
- **Varied looks:** every region and dungeon distinct, and big weather changes.

By 2026 it is technically dated next to Crimson Desert and others, yet still reads as AAA because
the fidelity is controlled shot by shot (Akiman).

**2. The sky and the fog are the two main levers.** The sky fills much of the frame, and the fog sets
the colour and gradient of everything else. Both are art-directed, not physical:
- **A key colour per region:** Limgrave green and gold (even the air leans green), Caelid saturated
  red, Raya Lucaria cyan, Farum Azula drained, underground purple and starry. Saturated regions are
  deliberately mixed with desaturated ones so neither becomes monotonous.
- **Colour by direction:** one colour toward the sun, another away, and blends between. Kept subtle,
  because big shifts look wrong. Left and right of the frame differ, which adds information.
- **The sky darkened behind a landmark:** the Erdtree was lost against a yellow sky, so the sky is
  darker in its direction.
- **Environment light from a desaturated sky:** a painted saturated sky would tint every surface,
  and Limgrave looked like permanent dusk. The ambient light is captured from a neutral sky.
- **Presets per time of day:** 4 periods, 7 in places, and up to ~8 weathers per area, each moving
  the sky colour and the fog's density and distribution.

**3. Near is crisp, far is deep.** The fog's sun and anti-sun light is zero within 150 m of the
camera. Contrast stays high where you fight and read the ground, and the haze builds only in the
distance. This is the depth cue, and it also aids readability.

**4. Volumetric fog does the composing.**
- **Light shafts** are an artist favourite: they add diagonals for free and break up dull cliffs.
  They need a strong difference between sunlit and shaded air to read.
- **Placed fog volumes** (3D Perlin noise from three octaves, a colour of their own or synced to the
  global fog, fitted to the terrain by a height map) add vertical layering that global fog cannot:
  a bank under a bridge arch, mist on a lake, a storm inside a castle.
- **Technique:** single scattering (Rayleigh + Mie approximations); raymarched at low resolution
  near, analytic far; bilateral upsampling; edge pixels re-marched to stop holes round foliage.

**5. Painted elements where the tech falls short.**
- **Cloud cards:** billboard clouds hide a dull far cliff, because the volumetric texture lacked
  the resolution.
- **Glow:** a per-material emissive "glow" is used instead of bloom, for control.
- **Landmarks:** some landmark effects ignore exposure (the Erdtree keeps a constant brightness).
  Physically wrong, artistically right.

**6. Composition is engineered.** The environment team follows formal composition rules ("logically,
not by intuition") and defines **viewpoints**: places right after a change of surroundings, where
players look, which get the most care. Cerulean Coast's flowers were hand-placed, foreground and
back.

**7. Characters and bosses:**
- High-poly sculpts are baked to game meshes. The Elden Beast's mesh and shader were built together.
- Hand-keyed animation has weight and wind-ups.
- Silhouette and readability come first.
- A small team covers a lot by reuse and kits.

## Where we stand (read from our shots)

The renderer is physically strong:
- Hillaire sky and aerial perspective
- cascaded shadows
- AgX tonemapping
- a per-biome LUT grade
- quarter-resolution fog and shafts
- TAA and SSR
- scanned PBR materials

What it lacks is **direction**. Against the list above:

| Elden Ring rule | Us now (e.g. `screenshots/phase-09-gate/p9g-erg-lip.png`) |
|---|---|
| A region key colour in the sky and the air | The sky is physical. Colour comes only from a gentle LUT grade (deliberately "restrained" in `post/grades.js`), so the sky reads pale grey-blue in every biome. |
| Colour by bearing to the sun | None: haze is one colour all round. |
| Near crisp, far deep | Inverted in places: the valley floor washes to flat grey-white while the foreground grass goes near-black. |
| Placed fog volumes | Only the global weather fog. No mist in valleys, under arches or on lakes. |
| Painted far elements | The far mountain ring is low-detail and smooth. No cloud cards. |
| Landmark against the sky | No landmark on the skyline of most vistas. |
| Viewpoints | Photo spots exist (`data/photo-spots.json`), but they are not treated as composed viewpoints. |

## What I built on this branch

**An art-direction layer over the physical atmosphere** (`render/artDirection.js`,
`shaders/atmoMaterial.wgsl.js`: `atmoArtTint`, and the art branch in `atmoAerial`). It applies
rules 2 and 3 everywhere at once, because every material's sky lookup and aerial perspective goes
through these two functions:
- The sky and the haze take colour by bearing to the sun: warm toward it, cool away, strongest at
  the horizon. Luminance is held, so exposure doesn't move.
- The far haze leans toward the region's key colour:
  - frost: steel blue
  - meadow: Limgrave's green-gold
  - dunes: amber toward the sun, lavender away
- The air within 120–150 m of the camera is kept clear.
- The ambient light still comes from the untinted LUTs (rule 2's neutral environment capture).

Presets come per biome and restoration state, blended by the biome weights as the grades are, and
fade toward night. `?art=0` shows the old look. The before/after shots are in
`screenshots/art-before/` and `screenshots/art-after2/` (`art-after/` is the first, too-timid pass).

## Next, in order of payoff

1. **Placed fog volumes:** low-res raymarched noise boxes fitted to the terrain, coloured or synced
   to the global fog. Use them at viewpoints (valley mist at the meadow lake, a ground blow over the
   erg, frost smoke at the Warden's arena). This is the biggest missing tool.
2. **Fix the near field:** the foreground grass reads black (`p9g-erg-lip`). Its ambient and
   translucency are too low. Elden Ring's near field is the highest-contrast, best-read part of
   the frame; ours is the murkiest.
3. **A landmark per region on the skyline,** with the sky darkened behind it (a third art tint aimed
   at a landmark bearing). Candidates: the Walker on the erg, the monastery on the frost, the bell
   tower over the meadow.
4. **The far ring:** sculpted mountain silhouettes (the same Blender pipeline as the Walker's
   pieces: strata, scree, snow lines baked to normals) and painted cloud cards against them.
5. **Viewpoints:** pick about 3 per region where the land opens up, and compose each one (fog
   volume, light shafts through a gap, landmark, foreground frame). Judge them as shots.
6. **A per-material glow for landmark lights** (the well's eye, braziers, the Bellwether's glyphs),
   exempt from exposure.
7. **Weather per region with real looks:** colour presets per time of day × weather, as FromSoftware
   does, instead of only the cloud amount.

## Sources

- [CEDEC 2022: Elden Ring's atmosphere (4Gamer)](https://www.4gamer.net/games/463/G046388/20220826111/)
- [Same talk (GameMakers)](https://gamemakers.jp/article/2022_10_04_20087/)
- [Same talk (GAME Watch)](https://game.watch.impress.co.jp/docs/kikaku/1434499.html)
- [CEDEC 2022 session page](https://cedec.cesa.or.jp/2022/session/detail/124.html)
- [CEDEC 2022: character models (4Gamer)](https://www.4gamer.net/games/463/G046388/20220827012/)
- [Akiman on Elden Ring's environments (Automaton)](https://automaton-media.com/en/news/this-is-what-it-means-to-be-good-at-art-capcom-veteran-akiman-on-why-elden-rings-environments-stand-out-even-among-higher-fidelity-aaas/)
- [Erdtree reuse and hand placement (TheGamer)](https://www.thegamer.com/shadow-of-the-erdtree-reused-assets-one-trick-to-break-up-the-monotony/)
