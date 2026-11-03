# Multiplayer: the plan (2026-11-04)

The user asked for a plan to bring multiplayer in, on Cloudflare (which they already use). Nothing in BRIEF.md or PLAN.md asked for
multiplayer before this: it is a new direction, so this plan starts with what kind of multiplayer the game should have, then how.

**Recommendation in one line:** drop-in **co-op for 2 to 4 Wraiths in the host's world**, the host's browser running the world, a
**Cloudflare Durable Object per room** relaying messages over WebSockets, the game itself served from **Cloudflare Pages**. Start
with a spike: two browsers that see each other's Wraith move.

---

## 1. What kind of multiplayer (design review, per `.claude/skills/wraith-design`)

**The feature in one sentence:** another player's Wraith beside yours in your world — moving, bending, fighting and releasing with you.

- **Pillar:** 1 (moving is the joy: surfing, gliding and skimming in company, racing a line together) and 2 (the world remembers and
  answers: the same snow scored by two Wraiths, a Ridge one raised and the other climbed). **Competitive play serves no pillar** —
  cut. A shared hub of strangers (MMO-like) works against pillar 4 (quiet, never empty) — cut.
- **Loop layer:** session (play together for an evening); campaign only through the host's save.
- **Aesthetic:** fellowship: two robes on the snow, one Warden, two hands.

### What it does to the game, honestly

| Area | Effect | Answer |
|---|---|---|
| **The story** (Ebbhold, the betrayal, the names, the count) | The twist is personal: *"They were alive, and I killed them."* Two players can say names; the record replays from the namer's view. | **One story per world, the host's.** Guests' names count and appear in the record and the count (from their eyes, their robe). The release cutscene plays for everyone at once. The jetty scene speaks to the host's Wraith; guests stand by. |
| **Difficulty** | Fixed difficulty, no world tier (user rule): two Wraiths make every fight easier. | **Keep it fixed** (the rule). Two Wraiths are two sources of noise: the Listener and the Drowned hear both, so stealth gets harder by itself. |
| **The Wardens** | Their fights are state machines run on one machine. | The host runs them; guests' verbs reach them through the host. **The Frost and Meadow fights are off limits (user rule): in co-op they need sync changes, so they stay host-only until the user says otherwise** (guests watch from the arena's edge). The Long Walker and the Listener are built for co-op from the start. |
| **Max 8 active Shaped** (BRIEF) | Unchanged, shared. | The host's director spawns as now. |
| **Every verb writes the terrain state** (BRIEF) | Each player's verbs must write everyone's terrain. | Event-sourced terrain (§3.3): the brush stamps are the messages. |
| **No HUD beyond the compass** | Where is my companion? | The compass shows them (a small mark, like an NPC's). Nothing else. |
| **Saves** | Whose world? | The host's save is the world. A guest keeps their own Wraith (elements, weapons, inventory) in a separate companion slot and brings it in. |

### Smells

| Smell | Verdict |
|---|---|
| Bare core is not fun | **NOT ASSESSED.** Test: two players surf the same slope and glide off the same ridge. If being together adds nothing in 5 minutes, stop. |
| Dominant strategy | **Present (risk):** two players freezing and shattering everything. Mitigation: fixed difficulty stands; materials and noise do the balancing (§above). Measure Warden time solo against co-op. |
| Complexity over depth | **Risk:** syncing every system. Fix: the phases below; each ends playable. |
| Graphics without play | Clear. |
| Scope mismatch | **Present:** this touches every system. Fix: a spike first, and a go/no-go after it. |

**Verdict: change** (from "multiplayer" to **co-op in the host's world, 2–4 players**). Keep the story single, the difficulty fixed,
and the frost and meadow fights host-only.

---

## 2. Architecture on Cloudflare

```
 Player browsers (the game, static)              Cloudflare
 ┌──────────────┐   WebSocket (binary)   ┌──────────────────────────────┐
 │ Host: runs   │◄──────────────────────►│ Worker  /api/room/*           │
 │ the world    │                        │   create / join by code       │
 └──────────────┘                        │ Durable Object: one per room  │
 ┌──────────────┐   WebSocket (binary)   │   relays messages, holds the  │
 │ Guest: runs  │◄──────────────────────►│   room's members, the host,   │
 │ its Wraith   │                        │   the last world snapshot ref │
 └──────────────┘                        └──────────────────────────────┘
         ▲                                 R2: world snapshots on join (large)
         └── Pages: the game build (vite build → dist/)
```

- **Pages** serves the game (`npm run build` → `dist/`, as today). The repo has no Cloudflare config yet (`wrangler.toml` etc.); the
  spike adds it. **Need from the user:** which Cloudflare account and domain, and whether the game is already on Pages.
- **Worker** (`/api/room`): makes a room (a short code), and upgrades a join to a WebSocket into that room's Durable Object.
- **Durable Object per room:** the relay. It doesn't run the game. It keeps who is in the room and who hosts, forwards each message to
  the others, and sends a joiner the host's latest world snapshot (or its R2 key). The WebSocket Hibernation API keeps it cheap while
  nothing is sent. A location hint near the host keeps the hop short.
- **R2:** world snapshots for joining (the host's terrain pages can be megabytes: uploaded once per join, fetched by the guest).
- **Later, optional:** Cloudflare Realtime (WebRTC, with its TURN) for peer-to-peer data between players, if the relay's latency is felt;
  and voice. Not in the first phases.
- **Pricing and limits** (Durable Objects, R2, Workers) change: check the current plan before the spike. A room is small (2–4
  players, tens of messages a second).

### Why host-authoritative, not a server simulation

The world runs in the browser (GPU terrain, the Shaped and Warden AI, cloth). Rewriting it to run on a server is a different game.
The host's browser already runs everything; the others run their own Wraith and render the host's world. Friends playing together
do not need anti-cheat; the Durable Object only checks room membership and rate.

---

## 3. What is synced, and how

### 3.1 Wraiths (presence)

- **Each player owns their Wraith's movement** (client-authoritative: no input lag for your own body).
- A **snapshot** at 20 Hz: position, velocity, yaw, state (walk, surf, glide, skim, swim, climb, knocked), the surf and glide inputs
  (lean, spread), cast gesture, health and focus as shown on the body, the robe and its dyes. About 48 bytes.
- **Others' Wraiths are simulated locally** from interpolated snapshots (100 ms buffer), through the same robe system as an NPC
  (`systems/npcs.js` already drives bodies from outside: the cloth, the gait and the hood follow). The cloth itself is never sent.
- Teleports (shrines, spots) are flagged so the cloth settles instead of flailing (`teleport()`, as in the cutscene fixes).

### 3.2 Verbs

- A cast is an **event**: element, verb, aim, power, time. Every client plays the cast's visuals locally (frost, gale, stone, tide FX
  all run from small blocks already). Effects on the world go through the host (§3.3, §3.4).

### 3.3 Terrain (event-sourced)

- The terrain state is written on the GPU by **brush stamps** (`terrainState.stamp()`: about a dozen numbers each). **The stamps are
  the messages:** each client sends its own stamps; everyone applies everyone's. Footprints too.
- On join the guest loads the host's **terrain pages** (the save's `terrainPages`, through R2), then applies the stamps since.
- GPU results can differ slightly between machines; the host's pages are the truth, and a guest can be re-synced from them.
  NOT MEASURED: how far two GPUs drift over an hour.

### 3.4 The world (host-authoritative)

- **Host owns:** time of day and weather, the Shaped (positions at 10 Hz, events for spawns, hits, deaths, reactions), the Wardens'
  fight states, quests and flags, the Drowned and the record, cutscene starts (with a start time, so all play in step).
- **Guests send:** their hits (verb events land on the host, which runs combat once), interactions (talk, say a name, open a door).
- Health, focus and death are per player. Death: back at the last shrine, as now.

### 3.5 Code rules (BRIEF §14)

- **Zero allocation in the frame loop:** a binary protocol (fixed message layouts, one preallocated `DataView` per direction, ring
  buffers for snapshots), no JSON per frame. The net layer is a system like the others (`systems/net.js`), with `game/net/` for the
  pure parts (codec, interpolation, the stamp log), all unit-tested in Node.
- **No late pipelines:** remote Wraiths are made at load (hidden), like the Drowned.
- **Performance:** each companion is one more robe simulation and view: measure on the laptop's Low preset; cap at 4 players.

---

## 4. Phases

| Phase | Work | Sessions | Checkpoint (the user) |
|---|---|---|---|
| **MP0 spike** | Pages deploy; Worker + Durable Object relay; room codes; two browsers see each other's Wraith walk and surf in the meadow (snapshots, interpolation). | 1–2 | **Play with a friend for 10 minutes: go/no-go.** |
| **MP1 presence** | All traversal states; robes and dyes; the compass mark; join, leave and reconnect mid-session; a minimal dark join menu (a code). | 2 | moving together feels good |
| **MP2 shared world** | Stamps sent and applied; terrain pages on join (R2); time and weather from the host; others' casts drawn. | 2–3 | the same scored snow on both screens |
| **MP3 combat** | The Shaped run by the host; guests' hits through it; per-player health, focus, death. | 2–3 | a fight together |
| **MP4 Wardens and story** | The Long Walker and the Listener in co-op; cutscenes in step; the record and the count with guests' names. Frost and Meadow fights only with the user's say-so. | 3+ | a release together |
| **MP5 hardening** | Bot tests with two pages; latency and loss injected; perf on Low; reconnect under load. | 1–2 | |

**Testing:** the bot drives one page today; MP0 adds a second page (a second Chrome profile or tab) so the bot can play both sides.
Unit tests for the codec, the interpolation and the stamp log.

## 5. Decisions for the user

1. **How many players:** 2 (simplest, the feeling of a companion) or up to 4?
2. **The story in co-op:** may guests join the Ebbhold chapter and the release (as above), or is that chapter solo only?
3. **The Frost and Meadow Warden fights:** stay host-only in co-op (no change to them), or may they be changed for co-op later?
4. **Difficulty:** stays fixed (your rule) in co-op?
5. **Cloudflare:** which account and domain; is the game on Pages already; which plan (Durable Objects and R2 limits).
