# Progress

Session handoff log. Update at the end of every session (see BRIEF §0).

## Current state

- **Phase:** 7 (RPG layer), **in progress** — built and pushed, awaiting the user's play-through on T (see "Phase 7 open"). Phase 6 is closed (accepted by the user, 2026-10-04, on the MacBook re-shoot and the T bench), on condition that `src/main.js` is cut down first. Phase 5 is closed: the user said to fix the last issues and move on if good (2026-10-04); they were fixed and judged good on the target shots. Phase 4 is closed (accepted by the user, 2026-10-03). Phase 3 is closed (accepted 2026-10-03). Phase 2 is closed (accepted 2026-10-03). Phase 1 is closed under the user's ruling (2026-10-03). Phase 0 is closed (2026-10-02).
- **Phase 7 built** (commits 9ed68f1 …; DECISIONS.md "Phase 7"):
  - **`src/main.js` split** (1101 → ~190 lines): `src/boot/` (engine, world, actors, game facade) and `src/systems/` (one module per concern, same run order).
  - **Save v2** (`src/game/save/`): quest graph state and world flags, Echoes, shrines, lore, the explored map, ice formations, the Warden (dormant / rested where it lay down), forced weather, time, restoration, and the **dirty coarse terrain pages** — the window is written down into its pages, resident pages read back one per frame, evicted pages copied from the worker; a load hands them back to the worker's page store and they stream in as the Wraith approaches. v1 → v2 migration. `tools/capture/save-gate.mjs` automates the gate (marks → save → new page → load → check).
  - **The frost chapter** (`data/quests/frost.json`, **draft for the user's review**): 3 main quests (The Empty Robe → The Held Snow → First Snow), 4 side quests (A Trail in the Snow, The Sleeping Spring, The Stones Remember, The Slow Songs), 5 named Veiled, 4 Echoes with visible effects (`game/echoes.js`), 4 lore fragments. Runtime in `game/chapter.js` (quest graph, talk tables, one-choice dialogue) and `systems/chapter.js` (facts, events from the world, Interact, subtitles, notices).
  - **The Veiled** (`character/veiled.js`, `systems/npcs.js`): five archetypes (staff-bearer, elder, child, lantern-keeper, monk) on the Wraith's own robe/cloth/gait, each simulated in a scaled copy of the world so a child's feet plant exactly; dyed robes, hunch, breathing, posture shifts, turning toward the Wraith, LOD (full < 60 m, ⅓ rate < 260 m, hidden beyond). An ambient pilgrim walks the camp–shrine path leaving footprints. The lost child's trail is pressed into the snow a stretch at a time.
  - **Architecture** (`world/architecture.js`, `render/architecture.js`, `shaders/architecture.wgsl.js`): procedural Shaper stone — the monastery on the summit (plinth, the hall with its bier and half-fallen roof, a 14-column cloister with broken and fallen columns, the bell arch, steles), five shrines (glyph altar, five carved stones; their glyphs wake with a cold light once rested at), the pilgrims' camp (felt tents lit from within at night, fire, lantern post, sleds, windbreak), the frozen spring and the watching stone. One static draw; seated on known ground (anchor patches); collision (`world/solids.js`: walls and columns block, plinths are floors).
  - **The Warden lives in its arena** in play (dormant until the Wraith comes within 45 m), and lies where it was released after a load.
  - **Music:** the user's nine cues (`assets/audio/music/` → `data/audio/music/*.m4a`), directed by `systems/audio.js` (release > fight > title > waking > shrine > camp lyre; stingers for the Warden waking, death, an Echo); streamed, crossfaded loops, ducked under dialogue.
  - **Screens** (`ui/menus/`, `ui/hud/`): title over the living world (Continue / Begin / Settings), loading screen with lines of the world, parchment codex — pause, journal (journeys, lore, Echoes), the map (drawn from the real heights in ink, revealed as explored), shrine (rest until dawn/midday/dusk/night, travel between rested shrines), save/load pages, settings (music, sounds, subtitle size). Subtitles low and centred, the interaction glyph at the thing in reach, quiet notices. Fonts: Cormorant Garamond and IM Fell English (OFL, bundled).
  - **Photo spots:** `p7-monastery-approach`, `p7-monastery-hall`, `p7-camp-dusk`, `p7-shrine-noon`.
- **Phase 7 open:**
  - **The gate (only the user can play it):** on T, `npm run build && npm run preview`, open `http://localhost:4173/`, Begin, play from waking in the monastery hall to the Warden's release (the quests lead there), save on a codex page, close the tab, reopen, Continue — every trail, crater and ice formation should be where it was left, the Warden lying in the land.
  - **Gate shots on T:** `?shots=p7-&dir=phase-07&capture=1&res=2560x1440`.
  - **Story review:** every line in `data/quests/frost.json` is a draft.
  - Not done yet: props in the Veiled's hands (staff, lantern body — the lantern's light is there), a point light from the camp fire on the terrain, NPC dialogue barks, the Echo upgrade choice at shrines (Echoes are granted by quests), map sketches of creatures in the journal, sound-effect samples (deferred by the user).
- **Phase 6 built** (commits 3bee69a …; DECISIONS.md "Phase 6"):
  - **Post chain** (`src/post/`, `src/shaders/post/`): the camera renders into an HDR target (rgba16f + sampleable reverse-Z depth); compute passes follow and one display pass draws to the swapchain. MSAA is off (TAA replaces it).
    - SSAO (½ res, depth only) → SSR on ice/wet slush (½ res; reflective pixels marked in the scene alpha by the frost clipmap) → weather volumes (¼ res: raymarched clouds, light-shaft ratio through the shadow cascades) → compose (AO, SSR, clouds, analytic weather fog) → frame-metered exposure → **TAA** (Halton jitter, depth reprojection, Catmull-Rom history, variance + min/max clip) → DOF (release cinematic only) → bloom (6-level compute chain) → display (AgX or ACES, CAS sharpen, 32³ LUT grade, grain, dither).
    - Every pass has a toggle in the overlay (Systems & post). `?tonemap=agx` starts with AgX; `?postDebug=1|2|3` flags non-finite inputs / shows the raw scene / the composed frame.
  - **Grading:** the stilled/restored grade moved into a procedural LUT (`post/grades.js`), with cold shadow tint and warm highlights when restored.
  - **Eye adaptation:** a histogram meter of the real frame corrects the analytic exposure within −1 … +0.75 stop (replaces the fixed frost-albedo compensation); overcast and snow sit ~0.5 stop lower on purpose.
  - **Weather** (`world/weather.js`): clear, overcast, snowfall, blizzard, eased over ~40 s. A stilled steppe has only clear and a still overcast. It drives cloud cover (clouds, sun dimming, overcast sky in the IBL), weather fog and light shafts, falling snow (`render/snowfall.js`, 16k GPU flakes, blizzard streaks), wind (cloth, spindrift, sound) and snow refill of tracks (×(1+5·snow)). Overlay: weather select with "auto (cycle)".
  - **Fix:** the aerial-perspective LUT was looked up vertically mirrored since Phase 1 (DECISIONS.md).
  - **Photo spots:** `p6-{clear,overcast,snowfall,blizzard}-{dawn,noon,dusk,night}` (the gate matrix), `p6-vista-clear`, `p6-vista-overcast`, `p6-shafts-snowfall`, `p6-stilled-golden`, `p6-restored-golden`.
  - **Bench:** `?bench=weather` — each weather walking with an orbiting camera, a live clear→blizzard transition, and the Shaped pack in a blizzard.
  - **Tests:** 102 (weather state machine added). `npm run alloc`: the weather update is allocation-free.
- **Phase 6 evidence on T (2026-10-04, user's run):**
  - **Shots:** `screenshots/phase-06/` (21, ACES) and `screenshots/phase-06-agx/` (same spots, AgX), all saved in ~3 s each (`shots-log.txt`).
  - **Bench:** `?bench=weather` at 1440p (175 Hz display): GPU frame 12.3–12.6 ms median, p95 ≤ 13.2 ms in every weather, in the live clear→blizzard transition and with the 8-Shaped pack in a blizzard; 0 late pipelines; 785 MB (PERF.md). The pack's presented hitches are 175 Hz pacing, not GPU (as in Phase 5); repeat at 60 Hz for the gate.
  - **Review of the target shots:** time of day reads at every weather (warm low light over blue shadow at dawn and dusk, deep-blue moonlit night with stars, flat white noon); overcast shows its grey deck; the blizzard swallows the peaks while the near ground still reads; stilled vs restored grades differ clearly. **ACES chosen over AgX** (AgX drains the golden hour; DECISIONS.md).
  - **Fixed after the review** (needs a re-shoot): clouds read as vertical streaks (2D density → height-varying density, flat bases, dome tops); overcast and snowfall still threw crisp warm sun shadows at dawn/dusk (the deck now leaves ~4–11 % of the sun); falling flakes read as dark dashes on sunlit snow (lit brighter); the shafts spot framing.
- **MacBook re-shoot (2026-10-04, `screenshots/phase-06-mac/`, look only — not the target):** falling snow now reads as white wind-driven streaks; snowfall haze good; shafts framing better. Still wrong, fixed after it (re-shoot pending): hard warm shadows at overcast/snowfall dawn and dusk (the sun now goes to ~2–4 % and the shadow maps fade under a deck), no clouds at all in the clear sky (coverage threshold lowered), radial streaks across the overcast deck (far-field noise level, capped grazing paths).
- **Second MacBook re-shoot (`dc1a35a`):** overcast and snowfall now give flat, shadowless light at every time of day (fixed). Still: only one wisp of cloud in the clear vista, and step-banded "ladder" streaks across the overcast deck. Fixed after it (re-shoot pending): march steps start at 60 m at the layer entry and grow ×1.12 (equal 440 m steps banded), a 64-frame jitter of the march start, more scattered cloud in clear weather; the post frame index is now relative to the last history reset (captures repeat exactly).
- **Third MacBook re-shoot (`6ce68bd`):** the ladder banding is gone from the overcast deck; the clear vista now has a lit cumulus with soft shading and scattered wisps; overcast and snowfall stay flat and shadowless. The overcast deck still reads as wind-streaked stratus converging toward the horizon (perspective of a 2D-based field) — acceptable, could be richer. **Gate review requested from the user.**
- **Phase 6 open:**
  - Re-shoot on T after the fixes above (`?shots=p6-&dir=phase-06…`) and confirm; a 60 Hz bench for the hitch rule.
  - In motion on T (only the user can judge): falling snow and blizzard streaks, light shafts, TAA on the moving Wraith (no per-object motion vectors), the weather easing.
  - The Wraith's robe bunches strangely at the hem in the snowfall-noon shot (cloth in wind during the walk-in); watch it in motion.
  - Not done: per-position cloud shadows on the ground, real refraction for spell water/crystals, per-object motion vectors for TAA (DECISIONS.md).
  - Software-renderer checks in the cloud session found and fixed: a black outline on far silhouettes (SSAO half-float overflow), overcast/blizzard over-exposure, peaks through a blizzard.
- **Phase 5 built** (commits 653430b … 049ad9b; DECISIONS.md "Phase 5"):
  - **Shaped:** procedural bodies (rope spine, planted feet, two-bone knees) clad in chunk rigs of packed snow, ice shards and a glowing core.
    - Three archetypes: hound, brute (slam), seer (ice shards).
    - Creatures rise out of the snow chunk by chunk and collapse back into a mound.
    - Freezing glazes them; a frozen Shaped shatters.
  - **Combat:** Sweep, Ribbon and Crystallize hit the Shaped, and Shaped attacks land on the Wraith.
    - Focus is spent on verbs, dodge and climbing; dodge (Ctrl) gives immunity; lock-on (Tab).
    - Hit-stop and shake on hits.
    - Health and focus live on the body, not a HUD: the cowl light gutters, frost creeps up the robe, and a cold vignette appears at very low health.
    - Death folds the Wraith into the snow, and it re-forms at the last safe point.
  - **The Frost Warden:** a ~35 m glacier-mammoth. Its four water joints are frozen (Crystallize) and then shattered: the two front knees from the ground, the two on its back by climbing it.
    - Its material is a matte glacier, snow over blue ice. Normals blend across neighbouring chunks so it shades as one mass, with crevice shade where chunks meet.
    - Its footfalls crush craters into the snow.
    - It bucks while climbed.
  - **Climbing (hold RMB on the Warden):**
    - It grips legs and body as parametric surfaces and the climbing pose reaches in turn.
    - Climbing drains focus; the Wraith is thrown off, lets go or slips.
    - The camera stands off the surface and treats the Warden as an occluder.
  - **Release (the last joint breaks):**
    - Light fills the ice along its fractures.
    - The exhale: a ground-hugging powder wave rolls out with a wind gust and a heavy shake.
    - It lies down into a long drift.
    - The grade moves from stilled (cool, flat, still air) to restored (wind, spindrift, warmth).
    - A letterboxed orbit camera follows it all; Jump or E skips it.
  - **Diamond dust:** ice grains hang motionless in stilled air. They twinkle as the camera moves and start drifting and thinning on the release's gust.
  - **Dev tools:** world tools Spawn, ×3, Kill all, Warden and Release; `?bench=fight`.
  - **Tests:** 91 pass (Shaped, combat, climb, release camera).
- **Phase 5 rework after the user's review (2026-10-04)**, which said the climb looked like flying, the release sank and vanished, and combat was bland:
  - **Climb, now hold-to-hold:**
    - Each move is a reach (the lead hand arcs to a new hold), then a pull (the body surges up under it), then a beat.
    - Hands and feet are holds that ride the Warden. The arms use two-bone IK; the feet plant with frog knees, or hang while it heaves.
    - The pelvis hangs on a spring. Each grab gives a puff of snow, a jolt and a crunch.
    - The climb surface is now the visible one (rays leave the outermost chunk).
  - **Release, rebuilt:**
    - Light fills the ice, the Warden rears, then slams onto its chest with a hit-stop and a white flash.
    - A shockwave tears out across the steppe: a powder wall and radial scour grooves.
    - The shockwave throws the Wraith onto its back. It lies through the cinematic and gets up afterwards.
    - The Warden lies down under snow and stays for good, as a ridge with its spires standing.
    - The camera directs three shots (the rearing, the wave, a crane); skipping jumps to the end state.
  - **Combat:**
    - **Hits:** cold-white hit flash and knockback (hounds hop, big ones rock); heavier hit-stops and a camera punch; frozen kills blow apart.
    - **Hounds:** take turns (a lunge token) and spread round the Wraith.
    - **Brutes:** crack the ground where the slam lands; the slam's ring passes under a jump.
    - **The Warden:** spells on its body chip it and make it flinch and turn on you. It stomps (a ground ring), tail-sweeps behind and sheds shard volleys at range, and enrages per broken joint.
    - **Casting:** flashes the hand light.
  - **Sound (pulled forward from Phase 7):** procedural WebAudio covering hits, shatters, slams, stomps, the shockwave, steps, grabs and the three verbs, plus a wind bed. The stilled steppe is silent; the release brings the wind back.
  - **Tests:** 99 pass (knockdown, release camera, hold-to-hold climbing, fight feel).
- **Phase 5 final fixes (2026-10-04):**
  - The Warden's chunks are cut by cleavage planes into angular glacial blocks (it read as snowballs up close).
  - Lain down, its masses spread and flatten under deeper banked drifts.
  - Granular snow crunch and scattered shard pings for the shatter.
- **Phase 5 gate evidence (target T, 2026-10-03):**
  - **Shots:** `screenshots/phase-05/` (`?shots=p5-`):
    - hounds, pack and combat with the HUD hidden;
    - Warden golden and afternoon;
    - climb flank and leg;
    - release rear, wave, thrown and settled;
    - steppe stilled and restored.
  - **Bench:** `?bench=fight` on T at 1440p. The pack (the heaviest view) has a GPU frame of 13.2 ms median and 13.8 ms p95; 0 late pipelines (PERF.md).
- **Phase 5 open (for review / polish):**
  - The Warden still reads as lumpy snowballs up close; silhouette crags could carry more large-scale form.
  - The powder wave is subtle against sunlit snow. It reads best in motion and against shade.
  - A faint brighter disc remains where the release drift sits.
  - Release, climbing and joint fight need a feel check in live play on the PC. Use the world-tools Warden and Release buttons.
  - Diamond dust (stilled air) is subtle by design: it shows against the sky and in shade, flashes as plate crystals mirror the sun, and is invisible on sunlit snow. It needs a look in motion.
  - The pack view has the least perf headroom (p95 16.1–16.5 ms when the PC is loaded; PERF.md).
- **Phase 4 built so far** (commit f74c958; DECISIONS.md "Phase 4"):
  - **Terrain state repack:** word 1 now holds compaction, wetness, frozen and transform (8-bit each). That is one fragment binding, and the snow reads slush, crust and permanent ice from it.
    - Five brush programs: PRESS, PLOUGH, SCORE, FREEZE, WET.
    - Healing uses dithered 8-bit rounding.
    - 48 brushes per frame.
  - **Snow-surf (hold RMB on snow):** a surf model in the controller.
    - Feel: a crest pushes toward cruise; gravity acts along the slope; carving is grip-limited; the lean comes from lateral acceleration; entry and exit ease.
    - On screen: the Wraith's surf stance and lean, the robe whipping back, a banked camera with wider FOV.
    - The wake ploughs a groove with outside-heavy berms; a spray plume and a crest at the feet.
  - **Frost verbs:**
    - Sweep (tap LMB): a slush crescent ploughs a wet channel.
    - Ribbon (hold LMB): a GPU water tube from the hand to the aim, scoring thin wet lines.
    - Crystallize (F): a formation of faceted refractive crystals over permanent ice.
    - Shared: spell lights glow in the snow; the Wraith faces the aim and reaches with its right arm.
  - **Photo spots** can pre-roll a scripted surf run (`surf`); gate spots are `p4-surf-*`.
  - **Tests:** 71 pass, including surf feel targets and every verb writing the state.
- **Phase 4 gate evidence (target T, 2026-10-03):**
  - **Shots:** `screenshots/phase-04/` (`?shots=p4-`).
    - `p4-verbs-noon`: every verb's persistent mark (Sweep channel, Ribbon line, Crystallize formation on ice).
    - `p4-surf-carve-golden`: the wake berm and plume.
    - `p4-surf-field-noon`: a finished run seen from 40 m.
  - **Bench:** `?bench=bend` (PERF.md).
    - Surf costs +1.2 ms over standing in the same view; the verbs cost ~0.
    - 0 late pipelines (no first-cast hitch).
    - Surf p95 is 14.0 ms (60 fps budget 16.7).
  - **Feel:** the user's verdict on the surf is "feels rlly good".
  - Shots and benches were taken by launching Windows Chrome from WSL. The user granted it; method in memory.
- **Phase 4 defects fixed this session:**
  - mouse buttons never registered (Babylon suppresses the compatibility mouse events; input now comes from pointer events);
  - Ribbon made no marks on downhill ground (now a ballistic launch and slope contact);
  - zig-zag stripes in plough berms (a stepped hash; now smooth noise);
  - ghost berms at stamp boundaries;
  - the walk-in hold froze the Wraith outside captures;
  - surf spray PCSS overdraw (p95 18.7 → 14.0 ms).
- **Phase 4 open (polish):**
  - water and crystal refraction against scene colour (approximated);
  - spell-light SSS on non-snow materials;
  - element selection (only frost exists);
  - a curling wave mesh for the wake (spray and berms carry it today);
  - the open snowfield costs 11.6 ms at 1440p standing (frost material); scalability pass in Phase 6.
- **Phase 3 built so far** (details in DECISIONS.md "Phase 3"):
  - **Locomotion:** procedural gait with true foot planting (0 slide in tests) and two-bone knees; the kinematic body (lean, bank, arm swing). Footfall events stamp a footprint and kick up spray on the exact frame of contact.
  - **Cloth:** CPU Verlet with about 3,000 particles: robe, cord and sash, capelet mantle, bell sleeves, deep cowl, wrapped hands and feet.
  - **Shading:** cloth shader (sheen, woven anisotropy, translucency, fold and layer occlusion, torn hems); 24-shell fur at the hood rim and cuffs; the breathing cowl light and fingertip glow.
  - **Captures:** photo spots can walk the Wraith into place (`walk`). Five gate spots: `p3-wraith-*`.
- **Phase 3 defects fixed this session:**
  - robe hung upside down after the spawn's vertical teleport;
  - hem thrown over the waist on stopping (pelvis offset stepped);
  - pelvis rose during the running flight phase;
  - hem kicked to the waist by hard leg colliders.
- **Phase 3 evidence on T:**
  - **Shots:** the third set in `screenshots/phase-03/` (`?shots=p3-&dir=phase-03`, 2026-10-03 18:56) covers walk-noon, run-golden, side-dawn, hood-dusk and night. The user's verdict: "its good".
  - **Bench:** `?bench=1` at 60 Hz gives a walk GPU frame of 7.7 ms median and 10.4 ms max with 0 hitches (PERF.md).
  - **Tests:** gait tests show 0 slide and prints landing on the exact frame (63 tests pass).
  - **Gate:** accepted by the user, 2026-10-03.
- **Phase 3 items carried forward (polish and later phases):**
  - target shots (`?shots=p3-&dir=phase-03`) and review;
  - a perf bench with the Wraith on T;
  - traversal-mode whip (Phase 4 traversal does not exist yet);
  - low-health cowl guttering and frost creep (Phase 7);
  - the hood-dusk close-up still reads slightly back-tilted from a low camera;
  - the Wraith's pipelines are only warmed if it is visible during loading (hidePlayer spots create them late).
- **Phase 2 gate evidence:**
  - shots on T (`screenshots/phase-02/`): dawn, noon, dusk, night, the north face and a trail close-up;
  - flight run 2 at 60 Hz: GPU 7.4 ms median, 14.0 ms max, 0 game-attributable hitches.
  - Polish items carried forward are listed in DECISIONS.md.
- **Gate status (Phase 1): MET under the user's ruling of 2026-10-03** (DECISIONS.md), from four flight runs on T (PERF.md):
  - the gate counts game-attributable hitches only, and there were **0**: CPU ≤ 1.2 ms and GPU ≤ 8.2 ms before every hitch, with no streaming correlation;
  - the GPU frame is ~4.2 ms at 170 Hz and ~6.0 ms at 60 Hz, against a 16.7 ms budget; shadows take 1.4–2.1 ms against 2.7 ms;
  - presentation stalls from outside the game remain: 14 real drops in 45.8k frames at 60 Hz. They are reported separately.
- **Phase 1 gate work in place:** the benchmark (`?bench=flight`) flies the continent at 20 m/s (surf, 12 m up) and 40 m/s (glide, 45 m up), recording presented frames, GPU time per pass category, stream queue depth, tile uploads, late pipelines and the hitch attribution.
- **Built in Phase 1** (BRIEF §17), with details in the session log and DECISIONS.md:
  - **world:** deterministic bake; worker streaming; 12-level clipmap with geomorphing; CPU/GPU height parity (max 0.58 mm);
  - **lighting:** Hillaire atmosphere with day/night, aerial perspective and GPU eye adaptation; 4-cascade CSM;
  - **horizon:** a distant mountain ring;
  - **terrain state:** the two-level architecture (fine window, coarse pages, eviction with closed-form healing on reload).
- **Captures:** clay view, 8 Phase 1 photo spots in `screenshots/phase-01/`.
- **Machines:**
  - **Target T** is this PC: Windows 11, RTX 3060, Chrome. Measure it with the in-page benchmark; the results go to `perf/runs/`.
  - **W** is WSL headless SwiftShader on the same PC, used for captures and allocation profiles.
- **Exact next step:** the user decides on the Phase 6 gate (MacBook look shots + the T bench at 175 Hz, or a final pass on T). If on T:  `git pull && npm run build && npm run preview`, then in Windows Chrome `http://localhost:4173/?shots=p6-&dir=phase-06&capture=1&res=2560x1440` (re-shoot after the overcast-sun / cloud fixes); review the clear vista (scattered cumulus), the overcast vista (no radial streaks), overcast and snowfall at dawn/dusk (no hard shadows); then `?bench=weather&res=2560x1440` with the display at 60 Hz; then ask the user to accept the Phase 6 gate.

## How to run

```
npm install
npm run dev                 # http://127.0.0.1:5173  (F1 or ` = dev overlay)
npm test                    # Vitest logic tests (102)
npm run alloc               # zero-allocation check of hot CPU paths in Node's V8
npm run capture             # build + 1440p photo-spot captures ×2 → screenshots/phase-01/, reproducibility + clipping report
npm run bake                # rebuild data/world/ from the seed (≈25 s); npm run bake:verify checks it is byte-identical
npm run heap                # build + idle-loop heap profile (game vs engine split)
npm run overlay-check       # dev overlay functional check + screenshots
npm run parity              # CPU/GPU height parity over 4096 points (gate: < 1 cm)
npm run build && npm run preview            # then, in Windows Chrome on the target:
#   http://localhost:4173/?bench=1&res=2560x1440        → idle/walk/fly bench, results in perf/runs/
#   http://localhost:4173/?bench=flight&res=2560x1440   → Phase 1 gate flight (surf + glide across the continent)
#   http://localhost:4173/?bench=weather&res=2560x1440  → Phase 6: each weather, a live transition, pack in a blizzard
#   http://localhost:4173/?shots=p6-&dir=phase-06&capture=1&res=2560x1440 → Phase 6 gate shots
#   http://localhost:4173/?shots=p7-&dir=phase-07&capture=1&res=2560x1440 → Phase 7 shots (monastery, hall, camp, shrine)
#   http://localhost:4173/                              → play: title, Begin (add &title=0 to skip the title)
node tools/capture/save-gate.mjs                        # Phase 7: marks → save → new page → load → checks
#   (add &gpuTimer=0 to skip GPU timing)
```

URL options: `?spot=<id>` applies a photo spot. `&capture=1` freezes the clock and skips the
loading fade. `&overlay=1` opens the overlay. `&snapshot=0` disables snapshot rendering. `&res=WxH`
locks the render resolution.

**WSL/Linux without a GPU:** the harness adds the SwiftShader flags automatically (DECISIONS.md).
`WRAITH_CHROME=<chrome or headless_shell>` uses a preinstalled browser build; `WRAITH_OUTDIR=<dir>`
builds and serves a separate output directory; `--query=postDebug=2` appends URL parameters.
The bundled Chromium needs libgbm, libasound and libwayland-server. On this box they were unpacked
without root into `~/.local/wraith-libs/root/usr/lib/x86_64-linux-gnu`, and the harness picks that
up automatically (override with `WRAITH_CHROME_LIBS`). With sudo: `npx playwright install-deps chromium`.

## Session log

### Session — 2026-10-04 — Phase 6 (post, weather and time polish, frost)

**Machine:** a cloud container (4 cores, no GPU) — not T. Headless Chromium 1194 on SwiftShader via
`WRAITH_CHROME=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` (the
bundled Playwright wants a newer build) and `WRAITH_OUTDIR=/tmp/...` so concurrent runs never share
`dist/`. A 480×270 spot takes 11–22 min. No timings were taken; no gate shots were committed.

**Built:** see "Phase 6 built" above.

**Defects found and fixed from the software shots:** a black outline on far silhouettes, bisected
with the new `?postDebug` views to the SSAO upsample: sky AO texels stored their distance as 1e6,
which is ∞ in half float, so every weight at a silhouette was 0 (on the way: a NaN from SSAO taps on
sky, TAA history undershoot needing a min/max clamp, and SSR self-hits landing on sky — all fixed); overcast/blizzard over-exposed; peaks visible through
a blizzard (fog layer too shallow); crisp sun shadows under a snowing deck.

**Environment notes:** in this container one logic test fails (`Math.f16round` needs Node ≥ 24; the
target's Node has it) and `npm run alloc` reports the same three pre-existing controller/spring-arm
failures with and without this session's changes (Node 22 here).

### Session 5 — 2026-10-03 — Phase 2 (Frost Steppe look-dev), in progress

**Built** (commit 4b85253 plus later work; rationale in DECISIONS.md "Phase 2")
- **Snow material** (`src/shaders/snow.wgsl.js`):
  - four-scale wind-stretched detail normals faded by pixel footprint;
  - wrapped diffuse plus blue back-scatter subsurface, and a cold-shifted sky IBL;
  - soft sheen, and stable glints at grazing views;
  - blue ice scoured on steep windward faces; snow-dusted frozen-lake ice;
  - triplanar rock strata, with snow re-accumulating on upward faces.
- **Frost sastrugi** in the render-only micro height layer, on the fine levels only.
- **Sky IBL:** L2 spherical harmonics of the live sky plus a ground bounce, computed in the ambient pass. Eye adaptation compensates for snow's albedo using the frost weight at the camera.
- **PCSS soft shadows** with a receiver-plane bias and white-noise rotation.
- **Deformation:**
  - the clipmap is displaced by the terrain state, its normals come from the state field, and the shadow casters displace too, so trails self-shadow;
  - packed snow, occluded trail floors and chunky berms;
  - a swept-capsule brush with a queue, player footprints, and photo-spot trails.
- **Spindrift ground blow** (GPU, stateless, shadowed).
- **Rock outcrops:** thin-instanced noise-displaced rocks with snow accumulation; they cast shadows.
- **Photo spots:** Phase 2 frost spots at dawn, noon, dusk and night, plus a sunlit trail close-up (`hidePlayer`, `trail`). Compositions were chosen with an offline sun-visibility search over the bake.
- **`?shots=<prefix>`:** in-page gate captures on the target GPU, uploaded to `screenshots/<dir>/` by the preview server.
- **Art controls:** glint intensity, deformation depth and refill rate are wired. Haze default raised to 4.5.

**Defects and open items**
- **Not yet on T:** the gate screenshots and the Phase 2 flight benchmark. The GPU cost of PCSS, the snow material, rocks and spindrift is unmeasured.
- **Live healing is decay only** (no diffusion), and the debug writer stands in for real feet until Phase 3.
- **Rocks:** no collision.
- **Fog:** valley fog is deferred to Phase 6, which also brings frame-metered exposure (the frost compensation is a stand-in).
- **Software-GPU captures are very slow** (10–17 min per 640×360–960×540 spot), so iteration happens at 640×360.

### Session 4 — 2026-10-02 → 03 — Phase 1 (World skeleton)

**Context:** the user approved Phase 1 after reviewing milestone 1 (the bake). They were remote late in the session, so the target flight benchmark couldn't run.

**Built** (commits a719f0a, 650350c, cfef900, f01554f; rationale in DECISIONS.md "Phase 1")
- **Bake** (`tools/bake-world/`, `npm run bake`, `bake:verify`): a deterministic 8 × 8 km continent, byte-identical, about 25 s.
  - Coastline, regions, eroded ranges and the volcano.
  - Hydrology: priority-flood, D8 accumulation, region-aware lakes and rivers.
  - Soft biome weights, surface materials, wind climatology and POIs.
  - Heights: 2 m in 256 tiles, plus an 8 m overview.
- **Streaming and collision** (`src/world/`):
  - the world worker fetches and decodes the bake, streams tiles (velocity-predicted, one upload per frame) and computes collision patches;
  - residency versioning keeps CPU and GPU on identical texels;
  - teleports wait for up-to-date collision.
- **Clipmap** (`src/render/clipmap.js`, `shaders/clipmap*.wgsl.js`):
  - 12 levels × 256², 6.25 cm to 128 m, one thin-instanced draw;
  - compute writes heights and normals only for dirty levels;
  - geomorphing, and covered interiors sink instead of being discarded.
- **Height parity:** macro (Catmull-Rom over 2 m) plus shared per-biome directional meso layers (`terrain/meso.js` ↔ `terrainNoise.wgsl.js`). `npm run parity` measures max 0.577 mm.
- **Atmosphere** (`render/atmosphere.js`, `shaders/atmosphere*.wgsl.js`):
  - Hillaire 2020 LUTs in compute, with sky-view for both sun and moon;
  - aerial-perspective froxels, plus GPU key/ambient and eye adaptation;
  - day and night, with a stylised blue moonlit night.
- **CSM** (`render/shadows.js`, `shaders/shadows.wgsl.js`):
  - 4 cascades, 2048² R32F, texel-snapped, 16-tap PCF, cascade blends;
  - fixed the Y-flipped render-target convention, which caused mirrored false shadows at high sun;
  - one cleared pass per cascade (snapshot rendering had made it two).
- **Distant mountain ring** (`terrain/mountainRing.js`, `render/mountainRing.js`, `world/ring.worker.js`): an impostor range 12–28 km out, built on a worker; far plane 40 km.
- **Terrain state** (`src/terrain/state/`, `shaders/terrainState.wgsl.js`):
  - **fine window:** 4092² at ~2 cm, toroidal and snapped;
  - **coarse pages:** 128 m at 25 cm, 48 slots;
  - **streaming:** strip downsample and refill, decay healing, LRU eviction with GPU readback, serialisation on `state.worker.js`, and closed-form healing on reload;
  - **debug writer:** "stamp trail" toggle (overlay → Terrain); the clay view shows marks;
  - **verified in the browser:** stamp 0.120 m → coarse page 0.119 m → evicted → reloaded after 300 s at 0.041 m (decay plus diffusion as expected);
  - **tests:** 17 in `tests/terrainState.test.js`.
- **Tooling:**
  - the flight benchmark (`?bench=flight`, `src/core/benchFlight.js`);
  - the GPU timer now times every pass (frame, main, shadow, compute);
  - the overlay shows state pages;
  - captures fail on GPU validation errors and wait without timeout;
  - tool outputs default to `screenshots/phase-01/`.

**Verified** (machine W)
- Tests: 52/52. `npm run alloc`: 9/9. `bake:verify`: byte-identical.
- Overlay check: 9/9, no late pipelines. Parity: PASS (0.577 mm).
- Captures: 8 spots, byte-identical across two loads, 0 % clipped.

**Measured performance**
- **Target T:** nothing yet. **The Phase 1 gate (the flight benchmark) has not been run.**
- **Structure:** 12 draws, 2.11M triangles, 678 MB GPU, 20 pipelines, 0 late (PERF.md).
- **The allocation profile was not re-run.** SwiftShader now takes ~3 s per frame, so a valid warm-up isn't feasible on W (PERF.md).

**Screenshots** (`screenshots/phase-01/`, 2560×1440, clay view, machine W): see the table below.

| File | Shot | Mean luma | Clipped |
|---|---|---|---|
| `p1-monastery-golden.png` | Monastery ridge at golden hour: long capsule shadow, ring on the horizon | 112.3 | 0% |
| `p1-meadow-noon.png` | Hub uplands at noon, toward the northern ranges | 127.9 | 0% |
| `p1-dunes-golden.png` | Dune basin at golden hour: dune shadows across the basin | 84.7 | 0% |
| `p1-volcano-dusk.png` | Ash plain toward the volcano at dusk (dark: see defects) | 25.4 | 0% |
| `p1-mire-dawn.png` | Mire lowlands at dawn (dark: see defects) | 25.7 | 0% |
| `p1-coast-noon.png` | South coast dunes at midday: short noon shadow | 158.7 | 0% |
| `p1-frost-night.png` | Frost plateau by moonlight | 119.1 | 0% |
| `p1-vista-continent.png` | Free camera over the continent with the mountain ring | 85.3 | 0% |

Also in the folder: `capture-report.json`, `overlay-open.png`, `overlay-late-pipeline.png`, `overlay-check.json`, `parity-check.json` and `bake-preview.png`. All 8 shots are byte-identical across two fresh loads.

**Unfinished**
- **The Phase 1 gate run on T (flight benchmark).** Until it runs, the gate is not met.
- The allocation profile with the Phase 1 frame. It needs either the real GPU or a lighter profiling mode.
- **Terrain state:**
  - live diffusion; for now resident pages only decay (Phase 2, with real writers);
  - persisting evicted pages into save slots (Phase 2);
  - real writers (Phase 2).
- **Shadows:** PCF only (PCSS/contact hardening comes in Phase 2 with berms); no per-cascade level culling.

**Known defects (clay view)**
- Dusk on dark ash (p1-volcano-dusk, luma ~25) and dawn in the mire (p1-mire-dawn, luma ~26) read very dark. Low key light on dark albedo, and there's no sky IBL yet (Phase 2 look-dev).
- Beyond the bake, the continent's east and north edges fall to the sea as sheer walls (edge falloff); the vista shows them. The ring hides most of this from the ground.
- The sea is a flat dark clay colour until Phase 12.
- The debug stamp writer leaves scalloped grooves (overlapping round stamps). Phase 2 replaces it with swept brushes.
- Carried over from Phase 0: about 1 frame in 570 drops while walking (CPU or compositor side). Re-check it in the flight benchmark.

### Session 3 — 2026-10-02 — Phase 0 (target change and real-GPU measurement)

**Context:** the user retired the 5070 Ti target. This PC (RTX 3060) is now the target, at 1440p / 60 FPS.

**Built**
- `src/core/gpuTimer.js`: GPU main-pass timing through WebGPU timestamp queries.
  - Hooked into the frame-path overrides in `babylonTweaks.js`.
  - It samples every 4th frame and costs nothing when off.
  - The engine requests the `timestamp-query` feature.
- `src/core/bench.js` (`?bench=1`): an in-page benchmark run in the player's own Chrome.
  - Phases: idle, walk with camera orbit, and a fast fly-over.
  - Reports presented and GPU statistics, hitch timelines with neighbouring frames, page events and heap.
  - Shows a styled results panel and POSTs the JSON to the local server.
- `vite.config.js`: dev/preview middleware `POST /__wraith/perf` → `perf/runs/<date>.json`.
- **Fixed:** the game never handled window resizes. `?res=WxH` now locks the render resolution, and render scale applies on top of either mode in one sizing function.

**Measured** (target T, production build, render 2560×1440, 4 runs in `perf/runs/`):
- GPU main pass: idle 1.6, walk 1.8, fly 1.2 ms median; p99 ≤ 2.8 ms.
- Presented FPS is ~170 (display refresh), with 1% lows of ~159.
- The SwiftShader allocation re-verification still shows 264 B/frame, all WebGPU floor (game 0).

**Defects**
- About 0.07% of frames land one refresh late (11.1–11.9 ms at 170 Hz), mostly while moving. It's not caused by the GPU timer, GC or page events. The benchmark now logs neighbouring frames to tell a real drop from a late callback.
- Run 1, windowed, had 15 idle-phase stalls up to 52.6 ms. They didn't reproduce in three fullscreen runs and can't be attributed.

### Session 2 — 2026-10-02 (same day, continuation) — Phase 0

**Built / changed**
- Pushed session 1 to GitHub. The remote is now SSH: `git@github.com:SoltyC/WraithOfTheUnstill.git`. HTTPS had no credentials in WSL.
- `src/render/babylonTweaks.js`, which removed ~850 B/frame of Babylon allocation (rationale in DECISIONS.md):
  - `installFastStages()`: scene stages become real arrays. `for…of` over Babylon's `Object.create(Stage.prototype)` stages allocated 88–168 B per loop (measured in Node).
  - `renderOpaqueUnsorted()` walks the SmartArray directly, with no `slice`.
  - `disableBabylonInstrumentation()`: PerfCounters, PerformanceMonitor and `_measureFps` are off. The overlay computes triangles itself.
  - `installConstantLabelFramePath()`: copies of `_startMainRenderPass` and `flushFramebuffer` with constant labels, version-guarded to 9.29.0.
  - `fastFrozenIsReady()`: avoids the closure-context allocation in `ShaderMaterial.isReady`.
- `tools/capture/heap-profile.mjs`:
  - frame-loop detection survives `_frame` being inlined;
  - `babylonTweaks.js` is counted as engine;
  - full-stack `topStacks`;
  - `--query` and `--out` options.
- `tools/capture/frame-alloc-probe.mjs`: synchronous-warm-up diagnosis of allocation sites (not for gate numbers).

**Measured** (machine W, 20k-frame warm-up; see PERF.md):

| Run | Total | Game | Avoidable engine | WebGPU floor | Browser idle |
|---|---|---|---|---|---|
| Clock running | 265 B/frame | 0 | 0 (29 B later shown to be `writeBuffer`, i.e. API floor) | 224 + 29 | 12 |
| Clock frozen | 236 B/frame | 0 | 0 | 225 | 11 |

Captures are still byte-identical. Tests 34/34, alloc check 9/9, overlay check 8/8.

**Then (same session, after the user accepted the WebGPU floor):**
- Chased the 29 B/frame seen when uniforms change. Profiling a stepped copy of `UniformBuffer._updateOwnerKeyed` and two upload-path overrides showed the bytes always sit at the `queue.writeBuffer` call site. A warm `writeBuffer` to a buffer no pass uses costs nothing; to a buffer in use by bundles it costs ~31 B. Classified as API floor. The experimental overrides were removed.
- Added the design rule "one `writeBuffer` per frame for all per-frame uniforms" (DECISIONS.md).
- `overlay-check.mjs` now also verifies that a live slider change alters the rendered frame (9 checks).
- Final: 265.5 B/frame with the clock running and 236 B/frame frozen, all API floor. **Gate met.**

**Unfinished**
- Target-machine numbers (unchanged from session 1).

### Session 1 — 2026-10-02 — Phase 0

**Built**

- Vite + Babylon.js 9.29 WebGPU boot (`src/main.js`). Without `navigator.gpu` it shows one styled line and stops. All shaders are WGSL; GLSL compiler fetches are disabled.
- GPU instrumentation (`src/core/gpuInstrument.js`), installed before device creation:
  - late-pipeline detector, which arms after warm-up and logs in red with a screen flag;
  - draw counter, including render-bundle replays;
  - GPU memory tally.
- Frame loop (`src/core/loop.js`), clock with time of day (`clock.js`), object pools (`pool.js`), scratch math stacks and helpers (`scratch.js`), tunable params with a change version (`params.js`), and the system/post toggle registry (`systems.js`).
- Action-mapping input layer (`src/input/actions.js`): every BRIEF §7 binding, pointer lock, and edges per frame. Gamepad can slot in later.
- Spring-arm camera (`src/camera/springArm.js`):
  - over-the-shoulder offset with a lagged pivot that lags more under acceleration;
  - eased zoom, and FOV that widens with speed;
  - terrain collision that pulls in fast and releases slowly;
  - free-camera and photo-spot pose modes.
- Capsule controller (`src/character/capsuleController.js`): camera-relative movement, slope limit with sliding, jump, ground snapping, and fixed 120 Hz substeps. The player system is `playerSystem.js`.
- Test heightfield:
  - deterministic integer-hash noise (`src/terrain/noise.js`), the same definition Phase 1 ports to WGSL;
  - rolling field, wind-directional drifts and ridged mountain ring (`testHeightfield.js`);
  - mesh built on a worker as a 640² non-uniform grid (`testTerrainBuild.js`, `testTerrain.worker.js`);
  - collision sampled from that grid in the drawn triangles (`testGround.js`).
- Phase 0 "clay" look (`src/shaders/*.wgsl.js`, `src/render/environment.js`, `testScene.js`):
  - analytic sky with sun and moon, stable point stars, and height fog with aerial perspective;
  - wrapped diffuse with a blue hemispheric ambient, wind-stretched detail normals, cavity, and a player contact blob;
  - ACES display transform with a night exposure lift.
- Dev overlay (`src/ui/overlay/*`), hidden by default and toggled with F1 or `:
  - frame graph with 90/60 FPS and median+4 ms lines;
  - FPS, 1% low, avg/median/p99/max, hitches, draws, triangles, GPU MB, JS heap, stream queue, pipeline count, resolution and adapter;
  - late-pipeline log;
  - system toggles and quality presets;
  - art and world sliders (time of day, time flow, sun azimuth, fog, exposure, wind, glint/deformation/refill placeholders, grading, render scale);
  - teleport to POIs, photo spots (go, and copy current view as a spot);
  - weather override and stilled/restored per biome (state only), free camera, god mode, spawn (disabled until Phase 5), and save/load buttons.
- Photo spots (`data/photo-spots.json`) and POIs (`data/pois.json`).
- Save system skeleton (`src/game/save/*`):
  - versioned schema with a migration table and validation;
  - binary container compressed with deflate-raw, encoded and decoded on a worker;
  - IndexedDB slot store (`auto`, `slot1–3`) with summaries;
  - manager with periodic and requested autosave, collect/apply hooks, and lazy DB and worker.
- Tooling (`tools/`):
  - Playwright harness with build + preview, the SwiftShader recipe and a library-path fallback;
  - photo-spot capture with a byte-identical reproducibility check and clipping/luma report;
  - heap profiler with V8 warm-up by frame count, sourcemap-resolved sites and a game/engine split;
  - overlay functional check;
  - perf run;
  - Node allocation checker for hot paths.
- Logic tests (Vitest, 34): save round-trip, compression, corruption, migrations, validation, the IndexedDB store, the manager and autosave; pool, frame stats, input edges and bindings, math helpers, param versioning; noise and heightfield golden snapshots; grid/mesh collision parity; controller movement, slope limit, jump arc and determinism; photo-spot data validity.

**Screenshots** (`screenshots/phase-00/`, 2560×1440, machine W / SwiftShader)

| File | Spot | Mean luma | Clipped |
|---|---|---|---|
| `p0-start-golden.png` | over the shoulder, 17:24 | 161.9 | 0% |
| `p0-ridge-noon.png` | toward the ridge, 12:00 | 206.4 | 0% |
| `p0-vista-dusk.png` | free cam at 45 m, 18:36 | 108.7 | 0% |
| `p0-dawn.png` | low dawn light, 06:24 | 147.9 | 0% |
| `p0-night.png` | moonlit, 23:30 | 127.0 | 0% |
| `overlay-open.png`, `overlay-late-pipeline.png` | dev overlay clean, then with a deliberate late pipeline flagged | | |

Reports: `capture-report.json`, `overlay-check.json`, `heap-profile.json` (final),
`heap-profile-warm20k.json` (20k-frame warm-up).

**Measured performance:** see PERF.md. There are no target-machine numbers yet. Structure: 3 draws, 832k triangles, ~133 MB GPU at 1440p, 5 pipelines (all during loading), 0 late pipelines.

**Allocation result (the open gate item)**
- Game code: **0 B/frame** in the browser profile after a 20k-frame warm-up (12.5 B/frame after 6k frames: a small not-yet-optimised remainder below the top-15 sites), and 0 scavenges over 2M calls per hot path in `npm run alloc`. Getting there required a calling convention, now documented in DECISIONS.md: no doubles passed to calls, ground queries through fields, systems read `clock.dt`, and an integer params version.
- Babylon engine: **1138 B/frame** in the final run (6000-frame warm-up); 1068 B/frame after 20k frames.
  - About 380 B/frame is the WebGPU API wrapper floor plus Babylon's per-pass label string.
  - About 690 B/frame is Babylon's scene traversal: `for…of` iterators, `slice`, `isReady`, owner-keyed UBO update, and the performance monitor.
  - Freezing materials, an unsorted single group and snapshot rendering already removed the rest.

**Unfinished**
- Zero-allocation gate for the engine side (above).
- No timings from the target machine.
- Overlay sections for systems that don't exist yet are placeholders by design: post toggles (Phase 6), spawn (Phase 5), streaming queue (Phase 1), and weather/restoration visuals.
- Saving terrain pages is wired in the schema and codec, but nothing produces pages until the terrain state exists (Phases 1–2).
- The save worker codec is exercised by the overlay buttons, not by an automated browser test.

**Known defects (visual, all inside the Phase 0 clay view, which Phases 1–2 replace)**
- No shadows (CSM is Phase 1), so noon reads flat and high-key (mean luma 206, nothing clipped).
- Distant ridge peaks still show slight facets from the coarse outer grid spacing (~20–45 m).
- The dusk foreground goes flat lavender: the key light is near zero and there is no sky IBL.
- Close-range detail normals read as soft blotches under a low sun.
- The player is a placeholder capsule (the Wraith is Phase 3). Its contact blob is subtle.
- Golden hour isn't very golden yet; warmth shows mostly in the sky halo and on the capsule.

**Next step:** superseded; see session 2 above and the final "Next step" section below.

## Next step (current)

Start **Phase 3 — The Wraith** (BRIEF §17, §8.1). Carry these rules forward:
- no doubles as call arguments in hot code;
- one params write per system per frame;
- warm every pipeline during loading;
- gate shots and benchmarks run on T via `?shots=` and `?bench=flight` at 60 Hz;
- rebuild after editing `data/photo-spots.json`.
