# Storm cloak response — 29 October

User correction: the player's cloak must visibly react to storm wind. Existing `systems/wraith.js` already samples the shared wind at the player and feeds the existing Wraith Verlet cloth. The missing part was convincing gust variation: the storm added almost constant forward pressure. That bent the robe but left the short mantle comparatively quiet. Earlier storm captures did not establish the full cloth-feel gate.

## Change

Keep the existing garment topology, pins, body/ground collisions, gravity, tethers and cloth solver. Add short advected bands and bounded lateral turbulence **inside the shared CPU/GPU storm field**, so cloth, airborne sand, vegetation and water/SSR consume the same gusts. Forward storm gain ranges.55–2.15, with mean near the original constant1, rather than simply increasing average wind. Lateral contribution is bounded at.18of the storm scale. Density and biome gates still mask the contribution. No new renderer resources or per-frame particle arrays.

CPU phases use f32 intermediate rounding to follow WGSL. The first new-field oracle had1mismatch with max.000203614, failing the unchanged.0002bound; it is retained as `cloak-parity-first.json`. Corrected `wind-parity.json` has5166samples, max.000151156,0mismatches/non-finite/GPU/late errors; storm-off and zero-gate GPU wind remain bitwise identical to pinned2224f79. Prior constant-wind evidence is retained as `wind-parity-before-gusts.json`.

## Response and regression coverage

`cloak-before.json` / `cloak-after.json` run the actual Wraith and shared wind on an identical12s standing-pose timeline, excluding3s settling. The clear-weather series is exactly unchanged. Mean free-mantle hem particle speed rises from.01808to.14496m/s, about8.0times; lower-robe mean rises from.10898to.52778m/s, about4.8times. Mean horizontal force stays near its old level (8.37→8.15m/s²). No non-finite cloth coordinates. The maximum local constraint ratio rises from1.201to1.324under the stronger transient load; this is recorded, not a claim that all body contacts or visual stretching are accepted. `cloak-response.json` stores the compact comparison.

The new physical regression requires visible free-hem travel in both the actual mantle and robe under the shared storm gusts; it fails against the prior constant-storm source and passes now. The old garment range helper incorrectly indexed construction order as garment ID; it now locates the real garment by ID, so the mantle spawn assertion tests the mantle. Existing spawn/run/stop checks pass. **810tests and production build pass** on this prototype branch. No source change to the main game's storm-disabled renderer is needed by this slice.

## Actual player capture and cost

Two close-up8s native1440p/fixed60 films, clear and inside storm, each480/480frames with0failed/GPU/late errors. The real player is not held (`wasHeld=false`, `held=false`); the existing cloth simulation receives the shared field. Prior-frame actual cloth force/hem probes are recorded every6frames,80samples per film. No manual cloth force or pose animation is used. Both use the same camera/restored clear weather; global wind time is not rewound, so this is a visual comparison, not an identical-phase pixel oracle. Eight decoded native near-ground samples per film are positive with0RGB>=253. This crop QA does not establish raw-HDR or full-body clipping.

`screenshots/d6-storm-cloak/cloak-comparison.mp4`: left clear, right storm; native central crops presented1280x590/60fps, independently decoded480frames. The wider1280x720encode and full native frames are retained. Two sampled mantle extremes are in `cloak-contact.png`. Review shows the mantle lifting/folding and the lower robe streaming downwind; a full moving/turning/body-penetration/shelter/human-art matrix remains NOT ASSESSED. Wider-scene terrain art is outside this cloak review.

`cloak-perf.json`: three240-frame clear/storm pairs with live simulation at1440p/.7,239GPU samples each. Whole storm activation adds+.046807,+.071152,+.067535ms; on means10.4306–10.4687ms. All0steady LUT rebuilds/GPU errors/late pipelines. Includes volume/lighting/grains/wind/cloth activity, not isolated gust cost or sustained combined D12 performance. Tests are not an allocation signoff.

## Verdict and remaining work

Keep the response improvement in the dormant `codex/desert-storm` prototype. It supports Learn by reading and movement/restoration sensation in the0–10s loop: the body now visibly answers the same wind the sand shows. No new progression, Flow reward, HUD or verb. Treadmill/dominance/opportunity-cost/fetch/forced-resonance/gate-without-warning/reskinned-Warden smells are clear by visual scope; full storm scope mismatch remains present. Bare-core fun, full-world emptiness, human cloth feel/art, running/turning/climbing/gliding/swimming in strong gusts, body-penetration/shelter, allocations and full-world performance are NOT ASSESSED.

Normal storms stay disabled. Real spatial erasure/re-rippling, audio and Ridge shelter remain required; shelter must attenuate the same shared wind rather than fake only the cloak. D2/D3/D9b and the other handoff tasks remain open. Main remains805tests through its independent Stone-healing fix; this storm slice is unintegrated.
