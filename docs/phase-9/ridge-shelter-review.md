# Ridge shelter prototype checkpoint — 29 October

Local Ridge shelter now derives from actual GPU terrain state, independently of D2 relaxation. Normal storms remain disabled. This checkpoint does not implement storm terrain erasure or complete the full handoff.

## Shared field

A 129x129 half-metre GPU snapshot reads the actual fine-window depression/displacement channels. A fixed staging/readback pool publishes only current generations. Existing worker collision base heights are added without Stone mass, avoiding double-counting the GPU Ridge. A bounded 33x33 one-metre obstruction field traces up to14m upwind. Four fixed CPU/staging slots, one output and one job buffer are created once; there is no per-vertex terrain ray march. Readback cadence is at most5Hz, including frozen photo clocks, and the pass is warmed at startup.

Both CPU and GPU wind consume the exact published field through the shared wind block. Near grains use their height above actual terrain, so air above the wall stays exposed. Their recycled-column positions retain open-air advection; shelter controls local opacity/stretch instead of slowing all grains outside the sheltered region. This is not a full particle fluid simulation. Cloth uses the existing ground-reference wind and existing solver. Audio receives raw speed plus the same exposure, avoiding double attenuation. Water/SSR also use the same ground-reference field. The post parameter block expands to1240floats; shared wind expands to283vec4s. No new material texture binding is required.

The field covers32m around the player, with a2m edge fade. Outside/missing/expired coverage is open air. Upwind obstruction includes real terrain, not a fabricated wall or CPU shape proxy. The chosen one-metre representative wind height and .12 minimum exposure are provisional art/feel tuning. Half-metre height sampling may alias narrow relief. D2 changes fine2 to signed relaxation remainder; future integration must explicitly include that channel and coalesce snapshot services. This branch does not enable or waive D2's gates.

Review identified two races before commit: a pending startup/teleport read could publish an old position/direction before any field existed, and explicit disposal allowed subsequent update calls to use destroyed buffers. Pending results now validate current position/direction/age and base-patch revision before publication, wind validates coverage before consuming it, and disposed owners ignore updates. Restore increments generation and invalidates the field. These checks are distinct from serial ordering of asynchronous reads.

## Evidence

841tests and production build pass. Unit coverage includes windward/lee/end behavior, reversing direction, high air, missing coverage, healed terrain, raw-speed semantics and obsolete pending reads. `tools/bot/ridge-shelter-smoke.mjs` stamps the actual RIDGE brush and matching existing Stone collision shape, then uses actual terrain page collection, save-worker codec and restore without IndexedDB writes. GPU crest rises to about3.99m. Before the stamp exposure is1; behind it exposure is.12, windward and beyond the ends remain1. Embodied audio receives.12. A reload invalidates and rebuilds shelter from the saved GPU terrain. This does not fix or certify saved Stone CPU-shape collision parity.

`shelter-wind-parity.json` compares10,874CPU/GPU wind samples including the actual published Ridge field. Max error.000190379 passes the unchanged.0002bound; zero mismatches/non-finite/errors/late pipelines. Dormant/zero-biome cases remain bit-identical to pinned2224f79. Above-wall exposure is included. Diagnostic kernels are not a rendered graphics signoff.

Three runtime off/on240-frame pairs at actual2560x1440 output and1792x1008 internal have mean GPU deltas-.00416,+.00724,+.01504ms. On means11.395–11.407ms. CPU field rebuild mean .81–.85ms, maximum1.0ms in that run, at5Hz; on rAF p99 is13.8–14.2ms. Zero GPU/readback/late errors. Both cases include expanded uniforms, so the dormant upload cost against the prior bundle is not isolated. These short measurements do not pass sustained D12 or allocation gates; mapAsync and readback views retain API-required allocations. No full-world/human/perceptual signoff.

## Remaining

Real storm erosion/re-rippling across live pages, evicted pages, wet/frozen marks, collision and saves remains unimplemented. Long-session exposure-history compaction is open. A rendered shelter/cloth moving-body review, storm audio listening, thin/moving/healing Ridge matrix, saved collision parity, combined performance and full-world D12 remain open. Normal storm capability stays false.

Design: the existing Ridge can shelter the body, linking the existing verb to readable wind/sand/audio without a HUD or new reward. It supports the0–10s reading/movement loop; bare-core fun and human feel remain NOT ASSESSED. Full-world scope mismatch remains until erosion, migration and other D6 consumers are complete. No claim of full handoff completion.
