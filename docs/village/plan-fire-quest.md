# Quest: "The Night the Hearths Went Wrong" (working title) - gameplay plan

## Findings: what exists
- Fire: render/fire.js, 8 slots x 112 stateless quads, set per frame in systems/architecture.js (slot 0 hearth, 1-3 braziers, rest built fires). Fire = (x,y,z,size; 0 = out). Size, wind lean already supported. Cheap to raise to 16 slots (1792 quads); needs only FIRES const + uniform array.
- Lights: lights.js picks the nearest 12 world lights by distance, fades at edge. Fire kind flickers. A burning village therefore auto-degrades gracefully; no extension needed if we register ONE light per burning building and let the picker choose.
- Terrain state has wetness/transform channels and BRUSH.WET/FREEZE; no SCORCH brush yet (transform id would carry "char"). reactions.js: grass+ember "burns, spreads downwind, leaves ash" already specified as a row, brush null.
- Frost verbs: Sweep (wet slush), Ribbon (held stream, wetness 0.9), Crystallize (ice). Gale: Gust (lane, wind.burst), Vortex (held column, pulls), Updraft (column). The meadow chapter has Gale; Frost carries over from the frost chapter.
- Quests: JSON graph, conditions on flags/vars/events/night/near; actions setFlag/addVar/encounter/say/echo. Tobin escort (npcs.js tobinTick) = a follow-the-Wraith child with wait-if-too-far, home radius, flag+event. Reusable pattern.
- NPCs: ARCHETYPES incl. child (scale 0.62); procedural idle, walkTo(); no flee/cower/run animation yet (gait is driven by velocity, so running just needs higher speed; cower = hunch + no gait).
- Houses: 6x5 m, floor platform inside, 1.1 m door gap, one window, roof is camera-only blocker (cam:true), walls solid. So the Wraith can walk in. Chimney, bed, table inside = good hiding spots. Camera indoors is the open risk (see below).
- Time: params.timeOfDay settable (photo spots use setParam); clock advances it. No "hold time" hook; add a quest lock.

## Quest beats
1. Approach: from the road the horizon is orange; the sky bruises, smoke column leans downwind, church-bell-like clanging (the mill bell). Embers drift over the path. Music stings low and grieving, not alarmed (BRIEF §2: beautiful first). Time locked ~23:00.
2. Arrival: the green is quiet-lit by burning thatch; ten stricken villagers. Elder (Maren-type archetype) at the well: "The hearths turned on us. Water will not reach the roofs; your ice will." Teaches Ribbon on a small first fire (market stall).
3. Triage (free order): 6 fires across houses/mill/market. Villagers pile up: tasks below.
4. The trapped child: a parent (archetype pilgrim) points at hub-house-3 repeatedly and screams the child's name. Interior rescue (below).
5. Mill: the sails alight, drive-turning fast; Gust/Updraft to pull flames off; optional.
6. Last embers: all fires out -> dawn does NOT come yet; the embers cool, the night is still, villagers gather at the green. Quest reveals the stair/hill (hook to the boss).
7. Aftermath: gratitude, gifts (lantern/robe tint, echo), char stays.

## Fire system (new `systems/villageFire.js`)
Per building b: state {OUT=0, IGNITE, BURN, SMOULDER, DEAD}, heat 0..1, hp 0..1 (structure), fuel. Rules:
- IGNITE: ember seeds from a burning neighbour within 9 m, scaled by wind alignment (wind field via g.wind.sample); heat climbs; at 0.3 flame size 0.5.
- BURN: size = 0.6 + heat*1.6 (roof fire anchored high via per-building offsets, 1-3 flames per building, so a building takes 1-3 of the 16 slots by size). Structure hp drains slowly (a house lasts ~4 min, mill 6). Hp 0 = DEAD (permanent char, roof visual sinks - cheap: set site lift/sink). Gentle failure: only fires that nobody touches kill the building; the child and villagers are never harmed by it dying (see below).
- SMOULDER: heat <0.15; one thin smoke plume (fire slot size 0.15, no light); reignites only if wind-fanned or embers land again.
- OUT: no flame, steam puff for 2 s.
Budget: visible set = nearest 16 flame slots by distance, rest of fires keep simulating (heat/spread are scalar). Lights: one world light per building (kind 'fire', radius 14-22, level=heat); the picker already chooses the 12 nearest, fading. Max 6 buildings + 4 props (stalls, haystack, well-cart) = 10 registered.
Smoke: add a fire-slot flag via size sign or a 5th float in the slot to render only smoke, taller and wind-leaning. A tall smoke pillar needs larger size scale for the smoke particles in fire.wgsl (+ a new smoke-only mode).
Heat damage to Wraith: within 3 m of a burning wall, Focus drain and a mild health tick (0.5/s, capped never kills: floors at 25%, then "you pull back" and the Wraith is knocked 2 m out). Cloth singes: robe cloth wind flutter + warning bark.
Spread with wind: spread probability *= 0.4 + 1.2*max(0, dot(windDir, toNeighbour)). Gust spreads flame downwind (a mistake that teaches); Vortex/Updraft over a fire pull the smoke and heat up and away (heat decay x3, no spreading while held) = the "wind verb that helps" the user hinted.

## Extinguish rules per verb
- Ribbon on a burning building: heat -= 0.35/s on the hit point's building (+ wetness stamp on the ground: grass won't reignite). Main verb. Costs Focus; narrower than needed, so rhythm = sweep ribbon across roof.
- Sweep (slush): burst; heat -0.25 once per cast per building within the front; good for small fires/stalls; long cooldown.
- Crystallize: ice shell over a burning prop/doorway: sets building to SMOULDER immediately but ice melts in 20 s => burns again if heat was high; good to buy time.
- Gust: pushes flames downwind; heat +0.1 on neighbours downwind (feeds spread); but it clears smoke from a doorway for 3 s (interior legibility).
- Vortex held at a fire: draws smoke up, heat decay x3, blocks spread; Updraft: lifts embers (no spreading for 4 s). Neither extinguishes alone: Ribbon+Updraft = CROSS "updraftRibbon" already a TODO in CROSS: water rains down on the whole roof, heat -0.6/s over radius 5 (a "rain" combo, expensive). Make this the discovery moment.
- Ember not required; Frost does the work (thematic: ice vs fire, melancholy).
Add rows to reactions.js: grass/ember burns, thatch/frost+tide extinguish, plank/ember ignite.

## NPC behaviours (new states in npcs.js: PANIC, COWER, FLEE, CARRIED-FOLLOW)
- PANIC (default): run short loops between the green and a house, calling lines via hud.bark/subtitles: "Not the Weaver's house, she's still-" (calm voices, sorrowful, not shrill).
- Run to safety: when a fire's heat >0.5 within 6 m, villagers flee toward the green (walkTo at 3 m/s).
- Pointer parent: faces the burning house, loops "My Wren!" - bark every 8 s; stops when child is out. Interactable (Speak) gives the clue: where in the house (back room/bed).
- Water-less helpers: 2-3 villagers carry buckets to the well; each bucket delivered = one building -0.1 heat (diegetic, optional help, a slow background help so the village isn't hopeless if the player is slow).
- Child (archetype child): COWER at hiding spot (under table/bed in the house): hunch, no gait, small sobs sfx. When the Wraith enters 3 m and uses Interact/waits 1.5 s: it takes the hand, FOLLOW state like Tobin (walkTo gap 1.6 m, speed 2.8, wait if >12 m). Out of the door and past 12 m from the house, event child:saved, parent runs to it.
- Also: an old man trapped at the mill door, a dog in a pen (dog could use creature system; skip v1).

## Interior rescue
- Which: only hub-house-3 (the porch house, biggest 6.8x5.2 m) for the story rescue; hub-house-1 for a shorter optional rescue (an old woman, who walks). House 2 and 4 are ruin variants = burn but no interior.
- Interior set-up in house(): the floor, bed, table already exist. Add a hiding spot node near bed for the child; and a fire in the rear-right corner (inside flame slot).
- Smoke: interior smoke "fog volume": a screen-space grey/orange vignette + reduced fog distance when within footprint and door open; builds `smoke` 0..1 scalar; Focus drains at smoke*0.8/s; Gust at the door clears it 3 s; Vortex inside draws it up the chimney for 6 s. Effect: reuse post fog uniform (add uniform, ~1 shader line).
- Collapse timing: a "beam falls" scripted at T+90 s after the Wraith enters (or after smoke tick 40 s): a rafter lowers across the door (solid box blocker toggled). Telegraphed: creaking sound, dust, 3 s warning, glow flicker. If you are inside when the door is blocked, Crystallize/Sweep clears it (ice shatters the burning beam: "frost breaks the beam"), or the window wall (the east window at winAt) is a second exit: always two routes.
- Fail states (gentle): if Focus hits 0 or time runs out, the Wraith is ejected: "heat drives you back" through the door, health unchanged, the child still alive; collapse is delayed and the quest asks for another attempt. The child never dies. The cost of delay is the house char (hp lower -> more burnt aftermath), and the parent's grief text.
- Camera indoors: roof blocker exists; add a camera distance clamp (spring arm 2.2 m) and a wall-fade for blockers cam:true. Needs one test: in a 6 m room the third-person camera clips. (Biggest risk.)

## Rewards and aftermath
- Echo: "Fire-Warden Echo" + lore line; village gift: a charred but warm lantern (robes.js: new robe "ashen tint"?), the villagers' standing barks change ('you are the one who stood in the fire').
- Terrain/building char: set transform channel to "char" id over each DEAD/BURNT footprint (BRUSH.PRESS-like write with transform id; ground blackens + ash particles), building `info` char factor: architecture.glow channel already per-site; add a per-site `char` float in sites[o+3 area] or a second info texture; shader multiplies albedo by (1-0.6*char) and adds soot streaks. Burnt buildings stay ruined as a scar until the boss (a lasting memory).
- Night stays until the stair reveals; then dawn on the next shrine rest.

## New vs reused
Reused: fire.js (extend to 16 slots), lights.js, quest graph + frost verbs + Tobin follow pattern, barks, reactions table, wind, hud notices, terrain wet/transform.
New: villageFire.js (state machine, spread, heat damage), fire smoke-only mode, NPC states PANIC/COWER/FLEE, interior smoke fog, collapse beam blocker toggle, camera indoor clamp, char shader factor, quest JSON data/quests/meadow-fire.json, time lock (params.timeOfDay hold while quest active: tiny hook in clock.js).

## Effort (sessions, 1 session = a long working day)
1: fire system + slots + lights + smoke mode + spread + extinguish rules (verbs hooked). 
2: NPC states, parent/child, bucket helpers, quest JSON + dialogue/barks.
3: interior rescue (house changes, smoke fog, beam, camera clamp).
4: char/aftermath render, audio (fire crackle, creaks, bell), polish, tests, perf bench on 3060.
~4 sessions; +1 if the camera needs proper rework.

## Risks
Interior camera (high); GPU budget: meadow already 14-16.5 ms: 16 fire slots each 112 particles at big sizes = overdraw of additive quads (measure; cap at 10 active slots at 1440p); only 12 world lights (a village of 10 fires needs the picker); pathing: NPCs have no navmesh, walkTo goes straight => NPCs walk through walls, need simple waypoints at doors; save: fire state must serialize (flags per building: 5 states) and the child follow state on load (reuse tobinStart); wind from g.wind may be near zero in a stilled meadow => force local spread wind for the quest.

## Questions for the user
1. Tone: do villagers speak (subtitles) or only bark? Is a child ever allowed to be lost (no, I assume)?
2. Is Ribbon-primary right, or should Ember (fire) exist as a verb here? (Plan: Frost only.)
3. Is the fire the Shaped's doing (a boss link, the creature in the manor) or an accident? Decides the final reveal.
4. Permanent char after the quest, or restored when the boss falls?
5. OK to lock time at night for the quest, and does the night remain for the manor?
