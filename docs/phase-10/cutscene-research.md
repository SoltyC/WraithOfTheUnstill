# Making cutscenes that look professional (research, 2026-11-01)

Question from the user: how do we make and animate the most professional, detailed cutscenes with our setup, avoiding low-quality, choppy animation?

**Setup checked:** Babylon 9.29 on WebGPU; our own procedural body (`character/wraith/body.js`: chest, head, shoulders, elbows, hands) with live CPU cloth; no Babylon skeletons on people; `resetHistory` and depth of field in the post chain; no motion blur; Blender 4.2 on the Windows machine.

**How far to trust this:** the GDC talks are behind a paywall, so what's here comes from their public descriptions and coverage. Most mocap and tool comparisons are vendor blogs. None of the costs or quality levels have been measured on our game: the spike below does that.

---

## What makes animation look cheap

| Symptom | Cause | Answer |
|---|---|---|
| Stiff, puppet-like movement | Keyed by code | Real human performance |
| Stepping, stutter in the motion | Poses sampled at a low fixed rate with no interpolation | Smooth curves, evaluated every rendered frame |
| Lifeless cloth | Baked with too few frames, or stiff | Live cloth on heroes, interpolated bakes on crowds |
| Pops between poses | Cross-fades | Inertial blending |
| Hitches at the worst moment | Late pipelines, streaming, loading on a cut | Warm everything, pre-roll every shot |
| Ghost image at a cut | Temporal history carried across it | Reset on the cut frame; settled lighting |
| Crisp, strobing fast motion | No motion blur | Velocity-based motion blur |
| Video-game cameras | Mathematically perfect paths | Hand-placed camera with weight |

## Our big advantage

**Nobody in this game has a face, or fingers.** Faces and lip sync are where real-time cutscenes fall apart soonest. Veils, hoods and wrapped hands remove that whole problem. All the performance is in **posture, weight, timing and cloth**, which is what capture is good at. Robes also hide small retargeting errors. It's the same reason hooded characters age so well.

---

## Recommendations

### 1. Get real human movement (the biggest single gain)

Hand-keyed code won't reach the bar, and it's what would look choppy.

- **Record a person acting each role with a phone,** then convert with AI video mocap. Reviews put Move AI at the top for quality, especially with several cameras; Rokoko Vision has a free tier and FBX export, and is the cheap place to start. One performer at a time: this is reported as the current limit, so film people separately and stage them together.
- **Clean it up in Cascadeur.** Its unbaking turns captured motion into editable keys, and AutoPhysics fixes weight. Reviews agree that raw AI capture is blocking, and needs polish. Export FBX, DAE or USD.
- **Performance matters more than the tool.** Naughty Dog shoots 3–9 takes of a scene. Do the same: a few takes, and choose.

**Note:** BRIEF §8 says characters are "procedural and cloth-driven only". This is a change to it, so it needs the user's approval. It affects cutscenes and the Drowned's loops only: gameplay stays procedural.

### 2. Play the capture through our own body

No need to move to Babylon skeletons.

- A small converter takes the cleaned clip to a compact file of our body's joints (root, chest, head, shoulders, elbows, hands, feet).
- **At run time the joints are evaluated on a smooth curve every rendered frame,** never stepped. This is the single most important defence against choppiness. A 30 fps source played on a curve still moves smoothly at 60 and above.
- Feet stay planted by our existing foot logic, and still write the terrain state.
- The live cloth, pins and colliders work on top with no changes, so a mocap body gets our robe for free. It goes through the same kind of path as `feedOverride`.

### 3. Hero cloth live; crowd cloth baked

- **Heroes (5–8 per shot): the real live cloth.** It's the game's best-looking feature. Budget it: at about 4.4 ms for the Wraith's cloth in the meadow, 8 full robes won't fit as they stand. Reduce detail at distance, and use a fixed step so that a shot plays the same each time.
- **Crowds and the floating robes: vertex animation textures (VAT),** which play baked motion on the GPU and suit cloth and crowds. Babylon has `VertexAnimationBaker` and `BakedVertexAnimationManager`, and the baked crowd can be instanced.
- **Trap: Babylon's docs warn that baked playback isn't interpolated,** so it looks less smooth than skeletal animation. It's the main route to choppy crowds. **Answer:** use our own WGSL and blend between two frames in the vertex shader. A 30 fps bake then plays smoothly.
- **Bake our own cloth, not a separate simulation.** `cloth.js` is plain JS, so Node can run it offline and write the VAT, and the crowd will match the heroes exactly. No extra tools. **OpenVAT** for Blender is the alternative, for anything simulated in Blender.

### 4. Build real shots

- **A shot-based timeline,** each shot with its own camera, as Epic recommends. Our director should work the same way.
- **Block first.** Naughty Dog blocks pose to pose for timing with a rough camera *before* capture. This is the grey rough cut in the plan.
- **Hand-placed cameras.** It's a craft of its own at Naughty Dog (camera layout artists). Keyframed paths with ease in and out, a little weight, slight drift, real focal lengths, and focus pulls between people.
- **No cuts mid-gesture without a reason:** cut on action, and match poses (shot 2's match cuts depend on this).

### 5. Make the picture hold up in motion

- **Motion blur for cutscenes only.** We have none, and it's what separates film from game footage. The standard is McGuire's tile-based reconstruction: a post-process independent of scene complexity, needing a velocity buffer. A later version reports about 3 ms on hardware of its time, so **measure it.** Per-object velocity for robes is the hard part. Camera-only motion blur is the cheap first step.
- **Cuts:** set `resetHistory` on the cut frame (already done for the Warden's cut). Forum reports from Unreal show the same class of bad first frames around cuts, fixed with warm-up, so:
- **Pre-roll every shot:** run the next shot's cloth and actors for about a second while hidden, so robes arrive settled, not snapping.
- **Depth of field, grade and exposure** switch on the cut, not eased across it.

### 6. Guarantee no stutter

- **The cutscene is a performance gate of its own:** no frame over 20 ms on the 3060, on High. It's a measured test, not a hope.
- All pipelines warm at load (`pipelineCache.js`, 0 late pipelines). Rooms and textures resident before the shot.
- **Sync to the audio clock:** the voice and music run the timeline, so a slow frame never knocks them out.
- Zero per-frame allocations, as everywhere else.

### 7. Moving between play and film

**Inertialization** is the industry standard: instead of cross-fading two poses, it takes the difference at the moment of the switch and decays it smoothly. It's cheap, and it needs only one pose evaluated at a time. Use it from play into the cut, and back out to the walk among the robes.

### Pre-rendered video? No.

It would remove stutter, but it can't show the player's own record (shot 12), it wouldn't match the game's picture on any preset, and it would add a lot of download. Keep it real-time.

---

## No filming: motion generated locally (added 2026-11-01)

The user doesn't want to record video, so motion comes from text, generated on this machine (RTX 3060, 12 GB; 113 GB free on C:). This replaces recommendation 1's phone capture. Everything after that step is unchanged.

**Use NVIDIA Kimodo.** A text-to-motion model trained on 700 hours of optical capture, with text and kinematic controls.
- **Local:** the official version has a low-VRAM mode (`TEXT_ENCODER_DEVICE=cpu`); the `kimodo.cpp` port runs on CPU or Vulkan, with skeleton GLB export.
- **Licence:** code Apache-2.0. The SOMA v1.1 models are under the NVIDIA Open Model License: commercially usable, and NVIDIA claims no ownership of outputs. **Check the licence of any newer version before using it, and avoid the SMPL-X variant:** `kimodo.cpp` lists it under a research licence.
- **Skeleton:** SOMA 77 joints, so a converter maps it to our body's joints.

**Don't use HY-Motion 1.0.** It runs locally, and a ComfyUI plugin claims about 8 GB (the model card says 24–26 GB), but its licence **excludes the EU, the UK and South Korea, including outputs.** A game sold worldwide can't use it.

### Tested on this machine (2026-11-01)

`kimodo.cpp` (commit 75ed52d), SOMA-RP v1.1, Q4_K text encoder, CPU only, built with MinGW in `C:\wraith-tools\kimodo`. 100 diffusion steps.

- **Speed:** 5 s of motion in about 100 s, 8 s in 138 s. Peak memory reported 1.2–1.45 GB.
- **Bridge:** `tools/motion/kimodo_clip.py` → `src/character/performance.js` (Catmull-Rom per rendered frame) → the Wraith's body and live cloth. Filmed with `tools/bot/perform-film.mjs`.

| Prompt | Result |
|---|---|
| Kneading, one plain sentence | Good person and weight; hands too gentle and low |
| Kneading, long and specific | Squats instead |
| Seated, rocking a cradle | Plausible pose; barely moves |
| Sweeping, long or short | Energetic, wrong: reads as shovelling |
| Hauling a wheel; pulling a rope | Erratic, one-armed or flailing |
| A timid walk holding something | Hunched, arms up: wrong |
| **"A person rocks a baby in their arms."** | **Very good** |
| **"A person walks nervously, looking around."** | **Very good** |

**Conclusions:**
- Short sentences beat long ones.
- **Mood, posture, weight and walking are strong. Exact work with a tool or a held object is not:** the model doesn't know where a hand must be.
- Measured on `knead1`: planted feet slide about 0.005 m/s, and nothing jitters.
- **Plan: Kimodo for the body, our hand IK (`Body._reach`) for the hands.** Hands follow an authored path (dough, wheel, broom) while the body keeps the generated weight. Not built yet.

**On the robe:** the pose reads, but `garments.js` was built for the gait. With the arms held forward, the mantle bunches into a flat wedge across the chest, and the open cuff shows no hand. This needs fixing before the spike passes.

**Not tested:** the Q8 text encoder, Vulkan, other seeds, the newer v1.2 models, looping.

---

## Tools

| Tool | For | Cost (check first; from reviews) |
|---|---|---|
| Phone camera | Filming performances | Free |
| Rokoko Vision | Video to mocap, start here | Free tier; about $1/min on a paid plan |
| Move AI | Better capture if Rokoko isn't good enough | Paid |
| Cascadeur | Clean-up and polish | Free tier; Pro about $33/month |
| Blender 4.2 + OpenVAT | Retarget checks; optional baking | Free |

Avoid RADiCAL: reviews say its portal shut down in July 2026.

---

## Prove it first: a 10-second spike

Before building the director, one shot to measure all this.

**Hanne kneading, sunlit, in a grey room, with 3 people working behind her and 30 in the back.**

1. Kimodo generates the kneading from text, several times; the best is chosen.
2. Converter to our body; played on a curve.
3. Hanne in live cloth; the crowd as interpolated baked robes.
4. Camera-only motion blur; a hand-placed camera; one cut.

**What it answers:** does it look like a person? Frame times? Bake size? Is a 30 fps bake smooth? Does the cut hold?

**About 1–2 sessions,** at the start of U6, and it's a user checkpoint: if this one shot doesn't look professional, we change the approach before building anything else.

---

## Sources

- [NVIDIA Kimodo](https://github.com/nv-tlabs/kimodo)
- [kimodo.cpp](https://github.com/localai-org/kimodo.cpp)
- [NVIDIA Open Model License](https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-license/)
- [HY-Motion 1.0 licence](https://raw.githubusercontent.com/Tencent-Hunyuan/HY-Motion-1.0/master/License.txt)
- [Keyframes and Cardboard Props: the cinematic process behind God of War (GDC)](https://gdcvault.com/play/1026025/Keyframes-and-Cardboard-Props-The)
- [Naughty Dog's cinematic process, as described by an animator (PC Gamer)](https://www.pcgamer.com/how-developers-create-cinematics)
- [Uncharted 2's cinematic production process (Game Informer)](https://gameinformer.com/b/news/archive/2010/03/12/behind-the-scenes-uncharted-2s-unique-cinematic-production-process)
- [Naughty Dog camera layout artist role](https://job-boards.greenhouse.io/naughtydog/jobs/5654876004&gh_src=seekorswimcom)
- [Babylon.js baked texture animations](https://doc.babylonjs.com/features/featuresDeepDive/animation/baked_texture_animations)
- [Babylon.js VertexAnimationBaker](https://doc.babylonjs.com/typedoc/classes/_babylonjs_core.VertexAnimationBaker)
- [SideFX: vertex animation textures](https://www.sidefx.com/tutorials/game-tools-vertex-animation-textures/)
- [OpenVAT for Blender](https://extensions.blender.org/add-ons/openvat/)
- [Houdini VAT 3.0 for WGSL](https://forum.babylonjs.com/t/houdini-vertex-animation-textures-vat-3-0-for-wgsl/63640)
- [Best AI video-to-mocap tools (Tato)](https://tato.studio/blog/best-ai-video-to-mocap)
- [AI motion capture for indie developers, 2026](https://www.strayspark.studio/blog/ai-mocap-indie-developers-2026-comparison)
- [Best AI motion capture tools 2026 (Uthana)](https://uthana.com/resources/best-ai-motion-capture-tools)
- [Rokoko Vision](https://www.rokoko.com/products/vision)
- [Cascadeur: cleaning Move AI mocap](https://cascadeur.com/tutor/move-ai-video-mocap)
- [Cascadeur mocap clean-up course](https://cascadeur.com/ru/skill-path/mocapcleanupcourse)
- [What's new in Cascadeur 2024.1](https://3dart.it/en/whats-new-in-cascadeur-2024-1)
- [Inertialization in Gears of War (GDC)](https://gdcvault.com/play/1025165/Inertialization-High-Performance-Animation-Transitions)
- [High Performance Animation in Gears of War 4 (SIGGRAPH)](https://history.siggraph.org/wp-content/uploads/2022/09/2017-Talks-Bollo_High-Performance-Animation-in-Gears-of-War-4.pdf)
- [Half Pound Filter for real-time animation blending](https://arxiv.org/html/2602.21702)
- [NVIDIA motion blur sample, after McGuire et al.](https://docs.nvidia.com/gameworks/content/gameworkslibrary/graphicssamples/d3d_samples/motionblurd3dadvancedsample.htm)
- [A Fast and Stable Feature-Aware Motion Blur Filter (Guertin et al.)](https://research.nvidia.com/sites/default/files/pubs/2013-11_A-Fast-and/Guertin2013MotionBlur-small.pdf)
- [Hybrid MBlur](https://arxiv.org/pdf/2210.06159)
- [Unreal: camera cut track](https://dev.epicgames.com/documentation/unreal-engine/cinematic-camera-cut-track-in-unreal-engine)
- [Unreal: camera-cut flag for temporal effects](https://dev.epicgames.com/documentation/unreal-engine/API/Editor/UnrealEd/FLevelEditorViewportClient/SetIsCameraCut?application_version=5.1)
- [Unreal forum: blurred frames around cuts](https://forums.unrealengine.com/t/movie-render-queue-camera-cuts-blur-temporal-aa/482411)
