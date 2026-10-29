# D6 terrain erasure — source audit and required contract

Read-only audit29October of `/home/sol/wraith-light`, compared with `/home/sol/wraith-relax`. **Not implemented.** A GPU-only current-density multiplier would make rendering, reloads and collision disagree.

`terrain/state/footprints.js` writes ordinary `ts.stamp()` brushes. `terrainState.js` owns scroll-out/in, brush, fine-heal and coarse-heal dispatches and the existing fine/atlas authority. `shaders/terrainState.wgsl.js` `healTexel()` uses shared material `DECAY`; both fine and coarse passes sample material at each world texel. Live healing currently decays only. Worker `healPlanes()` additionally diffuses depression/displaced height when pages reload.

StateParams words28–31 hold fine heal rect;32fine elapsed×healScale;33coarse elapsed×healScale;34–35unused in this tree. D2 already uses34–35for its own sand-heal/time contract, so do not silently repurpose them.36–39hold coarse slot/origin;40–43counts;44onwardbrushes and page table at812. Fine bands cycle16updates; coarse slots cycle48resident pages. Global environment healScale is refillRate×(1+5snow).

Worker store/reload and saved pages hold only key/savedAt/data. `healPlanes()` has no weather scale, front or integrated exposure history. Thus global variable refill rates already differ on resident/evicted paths. Collision samples world-worker height patches plus the existing `stoneMass.heightAt()` mirror, not the terrain-state buffers. The audited total-age×current-healScale formula and `||1` zero fallback were subsequently fixed in5ccdc95 (main18bd3ba): collision now integrates each shape’s scaled age and preserves zero. See `stone-healing-review.md`. This preparation does not implement spatial erasure, residency/save equivalence or shelter.

D2 is not required for ordinary decay-based marks. It is required before claiming its relaxed sand geometry/collision path; this branch retains the explicit sand slump stub. Reuse the existing front's fixed12-float CPU/WGSL density and existing terrain authority, not a new brush or collision proxy.

Before enabling erasure, specify and test: which height/compaction/flatten channels erase and which wet/frozen/transformed surfaces resist it; the front's sampling height; integrated exposure over each staggered band/page interval; exposure while pages are evicted and across save/reload; and matching Stone/Ridge collision if height channels change. A snapshot/current-density shortcut does not satisfy those contracts. Wind-only re-ripple must also preserve the D1trail-after60s gate. Renderer-only fading or fabricated Ridge shelter is not completion.

Design scope: world remembers and answers; Learn by reading; minute/session persistence loop. Verdict: preserve the canonical state owner and implement measured shared exposure before enabling storm erasure. Bare-core fun, shelter feel, full-world loop and human aesthetics remain NOT ASSESSED. Full D6 scope mismatch remains present.
