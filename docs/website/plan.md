# The website: plan (2026-11-04)

A promotional site for *The Wraith of the Unstill*: 3D, in the game's own style, interactive for the person deciding whether to play.
Built from what the game already is: the same renderers, the same snow, the same robe. Research (a subagent, 2026-11-04: the
reference sites, scroll storytelling, Babylon + WebGPU on Cloudflare Pages) is summarised in §6; the game's own footage and gate
shots were reviewed for what it shows today (§1).

**The idea in one line: the visitor's scroll and cursor write into the world, the way the game's verbs do. "The ground itself is the
canvas" (BRIEF §2.1) is the pitch, and the site proves it in the first three seconds.**

---

## 1. What the game shows today (from its films and gate shots)

- **The frost steppe:** a robed, faceless Wraith in snow at dawn, noon, dusk and night; surf tracks and footprints that stay;
  the monastery; the Frost Warden (a stone mammoth) wide in the snow.
- **The meadow:** the pilgrims' village (timber-framed houses, lit windows at night, smoke), grass that waves and parts, flowers,
  forest light shafts, the lake; the Bellwether's manor and its release; glide and gale.
- **The Glass Dunes:** golden erg, the storm wall arriving, the colonnade at sunset, sand-surf, the Long Walker.
- **The Mirefen:** the still mirror at dawn, the skim's wake, the dive into the Sounding (shafts of light, the robe sinking), the
  drowned city of Ebbhold (its colossal hall, the causeway, the statues), the Listener in its well.
- **Strongest frames for a site:** the Wraith alone against a huge sky (frost dusk, sastrugi golden, the dawn mirror); motion that
  leaves marks (surf tracks, wakes, grass parting); the light shafts (forest, underwater, Ebbhold's hall).
- **Weakest (keep off the site for now):** close shots of the people (tube sleeves, blank hoods: `docs/phase-10/release-art-audit.md`),
  the older box-built ruins, the blobby Shaped. The site shows what is at the bar.

## 2. The experience: six beats on one live canvas

One fixed full-screen canvas (the game's engine, WebGPU, WebGL2 fallback); tall DOM sections scroll over it carrying the words.
Scroll moves the camera along a spline and scrubs the world's time; the cursor is a verb. Real text stays in the DOM.

| # | Beat | On scroll | The visitor's hands | Built from |
|---|---|---|---|---|
| 0 | **The gate** (loading) | — | Two buttons: *Enter with sound* / *Enter in silence*. Behind them, frost forms on black as the shaders compile. | the frost shader; pipelines warmed here (no late pipelines) |
| 1 | **Stillness** (the hook) | The Wraith stands in falling snow at dusk, the cold light in its cowl. Scrolling, it walks, and its footprints stay. Title in quiet type. | **The cursor writes in the snow**: drag and it scores the drift; the marks stay and slowly heal, as in the game. *"Every mark you make, the world remembers."* | terrain state brushes (`stamp()`), footprints, snowfall, the Wraith's cloth |
| 2 | **The world is stilling** | One meadow, two states: scroll scrubs it from *stilled* (no wind, flat light, desaturated) to *restored* (wind, grass waving, colour, petals). | Move the cursor and the wind follows it through the grass. | restoration grading, grass, wind field, Gust burst |
| 3 | **Four elements** | The camera moves across four grounds: snow, meadow, sand, water. | **One verb each, by hand:** hold for a Crystallize spire; drag for a Gust through grass; click for a Ridge in sand; drag across the mirror for a skim wake. | the real verbs (`game/bending/*`), sand state, the water's ripples and wake |
| 4 | **Not killed. Released.** | The Long Walker's silhouette on the erg, huge; the Frost Warden wide in the snow. A short text on releasing, not killing. | **Hold to release:** the ground heals out from the Warden and motion returns (the restoration wave). | a Warden view (far LOD), restoration |
| 5 | **The water** (a tease, no spoilers) | The dawn mirror; then down through the surface into the Sounding's light shafts; a glimpse of a vast hall below. Stop there. | The mirror ripples where the cursor touches it. | water, underwater FX, Ebbhold hall (one view) |
| 6 | **Play** | The camera settles behind the Wraith on a ridge, the world live and still around it. | **"Play in your browser"**: the game starts in this tab, from this frame. Secondary: newsletter, Discord, trailer. | the game itself |

**Tone rules:** slow camera, long holds, empty space; no busy parallax; the minimal dark UI of the game; one sentence per beat at most.
**No spoilers:** nothing of the Drowned, Morrow's betrayal or the release cutscene. The site ends at the water's surface going down.

## 3. Tiers (everyone gets the same story)

| Tier | Who | What |
|---|---|---|
| **A: live** | WebGPU, a GPU that holds 60 fps at the probe | everything above, real-time |
| **B: reduced live** | WebGL2, or weaker GPUs | the game's Low preset: lower resolution, fewer particles; beats 1–2 and 6 live, 3–5 as video |
| **C: film** | phones in power saving, in-app browsers, failures | a scroll-scrubbed image sequence (the Apple pattern) of the same shots, the same copy |
| **Reduced motion** | `prefers-reduced-motion` | crossfades between still compositions; no smooth scroll, no shake |

Picked by adapter caps and a two-second frame-time probe behind the gate; a quality switch in the corner (Bruno Simon's pattern).

## 4. Build

- **Where:** in this repo, a second entry (`site/index.html`, Vite multi-page), reusing `src/` (the renderers, the cloth, the
  terrain state, the verbs) in a **site mode**: no HUD, no save, no combat, a scripted camera; the game's `?spot` system already
  places the world, the time and the weather for a shot.
- **Scroll:** Lenis driven from the game's own loop, GSAP ScrollTrigger writing progress only (the render loop reads it and damps
  the camera); the canvas fixed, never pinned. SplitText for the line reveals (GSAP is free since 2025).
- **Engine rules kept:** zero allocation per frame, no late pipelines (all warmed at the gate), snapshot rendering, the render loop
  paused when the tab is hidden; presented fps measured, not just GPU time (`PERF.md`).
- **Budget:** HTML, CSS and the poster under ~300 KB at first paint; the engine and beat 1 under ~3 MB before the first live frame
  (the world is procedural: little to download); later beats stream in while the visitor reads.
- **Sound:** the user's music (Suno), off until chosen at the gate, a mute key (M), ducked when the tab is hidden; a sound on each
  beat's change of state.
- **SEO and sharing:** a real `<h1>` and copy in the HTML before the 3D loads; Open Graph and card images (1200×630 key art from
  the gate shots); the trailer behind a click-to-play facade; deep links per beat (`#frost`, `#released`).
- **Hosting: Cloudflare Pages**, the same build; video and image sequences on R2; `_headers` for immutable hashed assets.
- **Analytics** (privacy-light): which tier, how far people scroll, whether they press Play.

## 4b. Built 2026-11-04 (the first version)

The user: anyone may view it, at **solcrisp.org**; music: *The Final Lullaby*; "make the best website likely to attract the most
people". So the first version favours reach and speed over a live game in the page:

- **`site/`** (its own build: `npm run site:build` → `dist-site/`, 21 KB of code and styles, fonts aside): the hero (the fen's
  dawn mirror, the Wraith wading), **the snow you write in** (a self-contained WebGL2 snowfield at dusk, carved by cursor or
  finger and slowly healing, a demo stroke drawn first; works on nearly every device, where the full game needs WebGPU), the four
  lands, the Wardens, the dive as a tease, the trailer (click to play), and **Play free in your browser** (→ play.solcrisp.org).
- Films from the game's own footage, 720p, ~7 MB in all, each loaded only as it comes near and played only on screen; the music
  off until chosen (M), paused with the tab; reduced motion respected; SEO, Open Graph and VideoGame structured data; `_headers`.
- **Hosting:** two Cloudflare Pages projects: `wraith-site` (solcrisp.org) and `wraith-game` (play.solcrisp.org):
  `npm run deploy:site`, `npm run deploy:game` (needs `wrangler login`).
- Checked in Windows Chrome (headless screenshots, `?solo=<section>` for one section alone): every section, desktop and 520 px.
- **Not yet** (the plan's beats 2 and 3 as live verbs, the restoration scrub, the live game in the page): the next versions.

## 5. Phases

| Phase | Work | Sessions | Checkpoint (the user) |
|---|---|---|---|
| **W0 the hook** | Site mode; the gate; beat 1 live (the snow you write in) on Pages; tier detection; poster + fallback. | 1–2 | **the first 10 seconds, on your laptop and phone** |
| **W1 the journey** | Beats 2–4; the camera spline; text reveals; sound. | 2–3 | scroll the whole thing |
| **W2 the water and Play** | Beats 5–6; Play in the tab, from the last frame. | 1–2 | |
| **W3 the film tier and polish** | The image sequence from the same shots; reduced motion; SEO; perf on Low and on a mid-range phone. | 1–2 | the site on three devices |

**Depends on:** the art at the bar for what is shown (the people stay out of close shots until the character pass); a trailer
(beat 6's secondary) can be cut from the game's own films.

## 6. Research (summary of the subagent's report)

- **Closest in tone and craft: Igloo Inc** (igloo.inc; Awwwards Site of the Year 2024): ice and particles, procedural growth so the
  payload stays small, real-time intro instead of video, shaders compiled at load, sound synced to motion.
- **The site is the game: Messenger** (messenger.abeto.co; Awwwards Developer Site of the Year 2025): the strongest call to action
  is "play now, in this tab".
- **Lore made into something you do: ATEN7** (Immersive Garden): drag to move through seasons and years; Three.js, GSAP, Lenis;
  sound marking each change of state. The best template for a mythic, restrained game.
- **Camera over terrain: Explore Primland** (explore.ownprimland.com): a scroll-driven flight over real land in fog; "start without
  audio" beside the entry button.
- **Visitor controls quality: Bruno Simon** (bruno-simon.com): the renderer chosen in options (WebGPU marked best), keyboard, touch
  and gamepad first-class.
- **One canvas for every 3D section: INK Games** (ToyFight; Codrops "One Canvas to Rule Them All").
- **The fallback: Apple AirPods Pro**: scroll-scrubbed image sequences.
- **Craft:** hook with a live frame in three seconds; the loading as part of the world; five to seven beats with breathing room; one
  tactile verb per section; sound opt-in with a mute; three tiers and reduced motion; DOM text for SEO; "Play in your browser" as the
  sticky main action.
- **Tech:** WebGPU is in Chrome, Edge, Safari 26 and Firefox (Windows, Apple Silicon) in 2026; WebGL2 is a needed fallback, chosen
  before any scene is made (Babylon cannot switch an engine). Lenis + ScrollTrigger with the canvas fixed. Pages: 25 MiB per file.
- Not verified by the subagent: the studio game sites it recalled (Sable, Journey, Death Stranding) — as it recalls, mostly static
  pages with a trailer: a game that renders its own world on its own site is rare, and that is the niche.

## 7. Decisions for the user

1. **Play in the browser from the site** (the game is free to play there now), or is the site for wishlists and a later release?
2. **A domain** on your Cloudflare account, and the game's name as it should appear (title, tagline).
3. **The music:** which tracks may the site use?
4. **How much to show:** the four biomes and two Wardens as planned, with the fen as a tease and nothing of Ebbhold's story?
