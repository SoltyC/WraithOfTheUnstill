# Ember aftermath handoff

Branch **codex/ember-aftermath**, based on **7a73a77**.

## Changes

- **src/world/refugeeKit.js** builds the seeded tarp shelters, branch lean-tos, loaded farm carts, handcarts, barrows, bundles, tripod cookfires, bedding, washing lines, wattle pens and lookout. Props are built in separable pieces. The layout and individual sites expose the same standing, sitting, crouching, lying and watching slots in their respective local frames.
- **src/world/sow.js** installs the shelter plots on their own terrain seats and keeps the shared fire at emb-camp. The existing vegetation exclusions make a clearing around the plots. The generic layout uses a 45 m radius. In the game the cliff lip lies south of the plots, so the lookout is at [750, −2731] within a 98 m site radius and faces the crater.
- **src/systems/architecture.js** applies the road's narrow tree clearance and uses the existing nearby flame slots for the headland. Point lights and flames switch off when their source sites are hidden.
- **src/systems/sow.js** reveals the farm plots on departure, including exits through the lie branch, and reads the two external evacuation flags. The warm middle and lookout appear with the first occupied plot. The cold ring and abandoned bundle appear in the empty aftermath.
- **data/quests/ember.json** gives six elders and six kin a camp voice. A personal lie takes priority, followed by a neighbour staying, a personally shown sign, the exposed tithe or word of the lie, then the ordinary survivor line.
- **data/remembrance.json** gives each of the six households, Cinderhold and the Ash Chapel a pair of single-trigger fate entries.
- **tests/refugeeKit.test.js** checks seeded geometry, layouts, directions, clearances, fixture and slot bounds, triangle budgets, dialogue priority and journal data. **tests/sow.test.js** checks the actual headland sites and cliff lookout anchor alongside the existing farm checks.

## Tests and build

All **1,259 tests** across **148 files** passed. The full Vitest suite used a two-worker cap for the final checkpoints after the unchanged canyon geometry test intermittently hit its default timeout under heavier parallel load. `npm run build` succeeded. Vite emitted its ineffective dynamic-import notices for pipelineCache.js and gpuInstrument.js.

## Triangle counts

Counts are from the architecture Builder's index buffer, divided by three.

| Groups | Twelve people per group | In-game visible sites |
| ---: | ---: | ---: |
| 0 | 300 | 300 |
| 1 | 4,300 | 4,120 |
| 4 | 16,006 | 13,268 |
| 8 | 28,926 | 25,976 |

The twelve-person fixtures take the first 1, 4 or 8 communities in Sow, town and chapel order. The in-game counts use Aled alone, then Aled, Ffion, Mari and the chapel, then every community. The site builder allocates **26,276 triangles** for the complete in-game camp including the hidden cold variant. At 30 people in all eight groups the default-seed fixture builds **37,330 triangles** against a 40,000-triangle cap.

## Game captures and frame timing

The game ran through the bot in headless Chrome on the Radeon RX 9070. The captures use 2560 × 1440 High, with the preset’s 0.8 render scale and dynamic resolution disabled. The game showed the expected set of sites for 0, 4 and 8 groups. From the cleared road at about 100 m, the roofs and carts are visible as a group across the rise. The close view shows the sacks, upturned chair and lit tripod fire.

- [Four groups](ember-aftermath-captures/camp-four.jpg) and [eight groups](ember-aftermath-captures/camp-eight.jpg) from the same camera.
- [Empty camp](ember-aftermath-captures/camp-zero.jpg), [road approach](ember-aftermath-captures/camp-road.jpg), [camp details](ember-aftermath-captures/camp-cart-and-tarp.jpg) and [cliff lookout](ember-aftermath-captures/camp-lookout.jpg).

Presented frame intervals from 400 frames per sample after settling.

| View | Median | p95 | Mean FPS |
| --- | ---: | ---: | ---: |
| Eight groups, ground level | 9.0 ms | 10.9 ms | 110.3 |
| Eight groups, overview | 8.7 ms | 10.0 ms | 114.5 |
| Empty camp, same ground view | 9.2 ms | 10.7 ms | 108.5 |
| Eight groups, repeated ground view | 9.1 ms | 10.6 ms | 110.0 |

The final populated samples met the 11.1 ms p95 target. Earlier runs varied, including in the empty camp, while another headless game session was active. The smoke and flame slot check returned seven active slots in the full camp and zero in the empty camp. Aled’s camp line played through the running chapter dialogue system.

## Protected-file integration

**src/systems/eruption.js** owns the missing producer. At the existing end-of-eruption block, publish `ember:after` alongside `ember:erupted` and before raising the completion event. Resolve the outcome once per original community using its pre-departure roster and the recorded live evacuation and death state. The camp and text consume these exact flags:

| Community | Escaped | Stayed |
| --- | --- | --- |
| Sow households | `ember:<id>-go` | `ember:<id>-stays` |
| Cinderhold | `ember:fled-cinderhold` | `ember:lost-cinderhold` |
| Ash Chapel | `ember:fled-chapel` | `ember:lost-chapel` |

A successful last rescue or a lie-only exit also needs the household's canonical -go flag for the journal. Preserve -lied for the lie response. If a household has mixed fates, publish a single household outcome and preserve the individual deaths on `ember:dead:<npc>`. Resolve the Aled/Nia split expressly because `ember:aled-stays` already means Aled held the fold while Nia took the road. Keep the established `ember:lost:<place>` and `ember:erupted` flags for their current consumers. For a completed older save, recover the aftermath flag and community outcomes in the existing eruption restore path from whatever saved fate evidence is available.

The checkpoint has the end-of-eruption event, death flags and place-loss flags. The new terminal flags were supplied by the test driver for the captured layouts. NPC occupation of the supplied people slots remains part of the chapter integration.

## Open points

- The tall grass still hides some low bedding and ground bundles from particular close views. The coastal cliff is separate from the main circle of plots.
- The Aled holdout needs an explicit mixed-household choice at integration. Under the current flags the journal uses the household trigger directly, and the site reveal follows that same household-level decision.
