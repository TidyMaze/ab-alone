---
id: world
type: architecture-design
status: draft
title: "World, lore, art and audio"
parent: goal
---

# World, lore, art and audio

Status: draft v0, for issue #19. Spec only, no code. Everything here is original work inspired by
the mood of 2000s sci-fi horror. No names, characters or plot are taken from any existing IP.

## 1. Setting

**CSV Ballast** is a 2.1 km ore hauler (CSV = Cargo Salvage Vessel), drifting over **Hollow**, a
dead moon with no atmosphere. Power is at 11%. Gravity works only on inhabited decks. The ship
is old, patched, and mostly dark.

Five decks, bottom to top, each one an encounter zone (and a board look, see section 5):

| Deck | Place | Mood | Gameplay role |
|---|---|---|---|
| 1. Mess | Crew canteen, tables with worn Abalone boards | Warm light, dead warm | Tutorial, hot-seat table |
| 2. Cargo | Ore bays, gantry cranes, frozen slag | Wide, echoing, cold | PvP tables, first boss |
| 3. Furnace | Smelters, pipes, heat vents | Orange glow, steam | Battle royale arenas |
| 4. Chapel | Improvised shrine built by the crew | Candles, wire, whispers | Mid-game boss |
| 5. Bridge | Command deck, the ship mind's core | Cold white, clean, wrong | Final boss |

The player is **the Tally-holder**: the last crew member still carrying a valid ledger token. No
name, no face, no voice line. You are alone.

## 2. Lore

Written as facts the player can piece together, not as a story told in order.

- **What happened.** Ballast mined a vein of **slag-glass** on Hollow. Slag-glass remembers heat:
  it fuses to anything warm that touches it for long. Crew who handled it started to harden from
  the skin inward. They did not die. They shelled up, rounded off, and kept moving.
- **Why marbles.** The shelled crew lost limbs and edges over weeks and ended as dense black
  spheres with a faint inner pulse. The slag-glass in the player's own cargo-suit visor is the
  only thing keeping you glass-clear instead of black: your light is the last warm thing aboard.
- **Why the game of pushing.** The crew played Abalone in the mess for years. After the first
  hardening, the captain ordered all disputes settled on a board "so nobody else gets hurt". The
  ship mind enforced it. Pushing a marble off the board is the old airlock cycle in miniature:
  whoever is ejected is gone for good. The mind kept the rule when the captain stopped
  answering.
- **The ship mind: TALLY.** The ledger intelligence that counted cargo, rations and crew. It does
  not hate you. It counts. It wants the books to balance: 14 and 14, six out, a winner. It
  keeps the ship running only for matches. It speaks rarely, in short accounting phrases
  ("Mess: one remaining."). It is the final boss and also the only thing that can open the
  docking clamp.
- **What the player wants.** The docking clamp release. Tally grants it only to a winner who
  has beaten the five "seats" (the senior crew, see section 3).
- **Tone.** Cosmic dread, grief, bureaucracy. Never gore for its own sake: the horror is that the
  crew is still there and still polite about the rules.

## 3. Boss lore slots

Five slots, one per deck. Names and mapping agreed with the design spec (#53, section 7, #15).

| Slot | Deck | Boss | Role | Lore hook |
|---|---|---|---|---|
| B1 Gatekeeper | 1 Mess | The Echo (#46) | Teaching boss | The last card-player of the mess, who answers every move with its mirror. Its tell shows in the move preview, so it teaches the tell habit. |
| B2 Hull | 2 Cargo | The Hull (#43) | Environment boss | The loadmaster fused to the ship's frame. The board crumbles as the hull he guards fails. |
| B3 Choir | 3 Furnace | The Choir (#44) | Multi-army boss | The shift crew that sang the end of each watch in the heat. Three sub-armies take turns, like voices. |
| B4 Converter | 4 Chapel | The Chaplain (#45) | Conversion boss | The ship's chaplain, who believed the shell was grace. Three adjacent shells flip one of your marbles. |
| B5 Mind | 5 Bridge | The Ballast Mind (#47) | Final boss | Tally itself, playing through a shell army built from the crew's last orders. Reuses Hull, Chaplain and Echo hooks. |

Naming: SPEC.md's "The Marker" was too close to a well-known horror franchise. Renamed **The
Chaplain** (decided in #19, applied in #45, #15 and #53). SPEC.md still needs the one-word
change, done in the PR that touches it.

Tells: every boss tell is a steady shape or glyph plus a sound twin, never flash, flicker or
color alone (section 8).

## 4. How lore is delivered

No cutscenes, no forced dialogue, no quest log.

- **Environment.** Props tell the story: unfinished games left on mess tables, scratch counters
  on walls, shelled marbles frozen mid-push in cargo bays. Each deck has 3 to 5 "scenes".
- **Lore terminals.** Short text logs on in-world screens (max 120 words). Optional. Two per deck
  (`client/src/lore.ts`, #510). The room's console screen shows its deck's first entry, wrapped and paged
  for the UI scale (`client/src/terminal.ts`, #511): a page turn every 8 s, drawn once the web fonts are in.
  The reader (#512): a click on the screen or the T key frames the camera on it (`client/src/camera.ts`); a
  click on the screen or the right arrow turns the page, the left arrow goes back; Esc, a click off the
  screen or a click past the last page leaves, back to the view the player had. The ids read are saved
  locally (`client/src/lorestore.ts`), for the log archive (#513): Logs, in the settings menu (ui.md section 4),
  lists the entries read, in ship order, then the audio logs collected, and a press on one reopens it in the reader. The game goes on while the
  player reads. Rolling onto a hub terminal room (#524) opens that room's own entry in the reader; leaving it puts
  the player back on the hub on the same cell.
- **Audio logs.** Short ambient recordings (max 60 s), collectable, replayable from an archive.
  Optional. One per deck (`client/src/audiologs.ts`, #515): a synthesized recording (room tone,
  footsteps, machinery, the Choir's hum) with a timed transcript. No voice acting (section 11):
  the words exist only in the transcript. The player (#516): while reading the deck console, Play log plays
  the log of the deck of the entry shown (an entry reopened from the archive may be another deck's) on the voice bus, music and ambience ducked under it (section 7, Mix); Skip log stops it
  at any time, on the console or off it, and the game goes on meanwhile. The transcript shows line by line,
  over the button (ui.md section 4), on by default; the Transcript toggle beside Sound in the settings menu hides it, saved
  locally. Collectable (#517): a recorder prop lies on the cargo crate of the room (`client/src/room.ts`); a click on it
  plays the deck's log too. Any log heard, from the recorder or Play log, is saved collected (`client/src/lorestore.ts`):
  the log archive lists the logs collected after the entries read, and a press on one replays it.
- **Tally.** One-line announcements at match start and end. Never explains itself.
- **Boss arenas.** Each boss board carries one lore object the player can inspect before the
  fight.
- **Rule.** Skipping all lore must never block progress or make the game unplayable. Lore
  rewards curiosity, it never gates.

## 5. Art direction

The one-page summary of sections 5 to 8, with the asset list, its size budget and how each asset
is made in the repo, is [art.md](art.md).

**Palette.** Near-black base (#0b0d0f), rust (#7a3b1d), oxidized steel (#4a5258), sodium orange
(#d9822b) for hazard and furnace, a single cold cyan (#7fd6e8) for the player's inner light.
Red is reserved for danger (breach, ejection warning). Nothing saturated outside these.

**Materials.** Brushed and pitted steel, oil stains, welded patches, taped cables, condensation,
dust. PBR textures, no emissive surfaces except lights, screens and marbles.

**Lighting.** Low-key. Mostly one hard source per deck (practical lamp, vent glow, screen), plus
a dim cyan fill from the player marbles. Soft contact shadows ground the marbles onto the cells
and frame (#459), disabled under low quality tier and automation to save software WebGL. Flicker
is slow and rare (see photosensitivity, section 8). Shadows stay readable: cells and marbles must
stay legible in every lighting state.

**Fog.** Volumetric or screen-space haze, denser at the edges of the board, never over the cells.
Clear-board mode removes it.

**Marble looks per faction.**

| Faction | Look | Silhouette cue |
|---|---|---|
| Player | Smoked glass, cyan inner light that dims with each lost marble | Smooth, glowing core |
| Shelled (enemy) | Matte black organic shell, ridged like a scarab, faint heat pulse | Ridged, no core |
| Boss variants | Same shell with one accent (rust crown, candle wax, wire wrap) | Added silhouette |
| Flipped (by The Chaplain) | Player glass slowly shelling over: black ridges creep from the base up, the cyan core dims but stays visible until the flip completes | Half glass, half ridged |
| Battle royale slots | Shell tint per player (six Okabe-Ito tints, 3:1 on the deck in every colour vision, #501) plus an engraved near-black glyph, 3:1 on its tint and repeated beside the seat's name on the HUD plate (#558), never color alone | Unique glyph each: disc, triangle, square, cross, star, diamond |

**Board look per deck.**

| Deck | Board | Fog | Props |
|---|---|---|---|
| Mess | Worn laminate, coffee rings, scratches | Light | Trays, cups, lamp overhead |
| Cargo | Steel plate with ore dust | Medium, low | Gantry shadow, chains |
| Furnace | Blackened steel, glowing cell edges | Steam | Pipes, vents, heat shimmer |
| Chapel | Wood and wire, wax drips | Candle smoke | Candles, hanging cloth |
| Bridge | Polished white-grey panel, thin cell lines | Almost none | Clean, wrong, too tidy |

**Tell marks.** Boss tells use engraved glyphs and steady ring outlines on the cell or marble
(pale bone-white, 3:1 against the surface), never a halo or glow alone: a black halo is lost on
a matte black shell. The Chaplain's tell is a ring outline on the marbles about to flip plus a
glyph on the three boss marbles in contact. A tell on a cell is pale bone-white or near-black,
whichever reads 3:1 on that surface: The Hull's crack is near-black on the light deck (#355).

**Ejection.** A marble pushed off the board rolls one cell out over the rim with the line that
pushes it, in 200 ms (the sharp inhale of section 7). Then the void takes it (the thud): it falls,
tumbles, stretches along the pull and fades out in 600 ms (the vacuum silence), 800 ms in all,
never more than 1.5 s. It only ever fades, never brightens, so it cannot flash (section 8). A click
or a key ends it at once, and it never holds the next move. Reduced motion: a plain 400 ms fade one
cell out, where the push left it.

Rules never change with the look: cell size, contrast and edge clarity stay constant
(contrast 3:1 minimum between cell edge and surface).

## 6. Diegetic HUD rules

1. No flat overlay for game-critical info while a match runs.
2. Turn owner: the board rim lights in the player's color: the half of the rim at that side's
   end (where its marbles start), cyan for the glass, sodium for the shell, so the turn reads by
   place too, never color alone (section 8). It switches at once, keeps in clear-board mode and
   goes out when the game is over (#300).
3. Ejected count: tally marks scratched on the board frame, one slot per marble to lose. 1v1
   and bosses: 6 slots per side. Battle royale (10 marbles, out at 0, #49) and the Choir fight
   (10 marbles): the frame shows **marbles left** instead, as a row of notches per player that
   go dark, so it scales to 6 players (a compact arc per seat on the arena rim). In the Choir
   the boss row has one notch per boss marble (12). Each side's row sits on the right side of
   the rim at its own end (near right for the side that starts near, far right for the other),
   clear of the phase notches: a dark groove per slot, a bone-white mark in it (#389).
4. Boss phase notches and tell countdown: notches scratched on the arena frame, one per boss
   marble left until the next phase, one per ejection for The Alien (#621), lit while remaining,
   extinguished as they go, and a steady glyph marks the next-phase threshold. They sit on the near side of the rim, where no marble
   hides them: a dark groove each, filled bone-white while lit (#356). The tell countdown is a
   count of engraved ticks next to the telegraphed move. Flat fallback exists but is never the
   only copy of this info.
5. Selection and legal directions: ghost marbles and arrow glyphs on the board surface.
6. Menus and settings: a terminal screen in the scene, not a floating panel.
7. Tally speaks for system notices, short text on a panel for the same notice.
8. Always provide a **flat HUD fallback** in accessibility options (section 8).
9. Anything diegetic must also be readable at 720p and at 200% UI scale.

## 7. Audio direction

- **Ambience.** Bed per deck: low hum, creaks, distant metal, wet dripping. Low-frequency heavy.
  Silence is a tool: dead air before a boss phase change.
- **Push sounds.** Weight first: dull glass-on-steel knock for a plain move, a grinding scrape
  for a sumito push, pitch dropping with push size (1, 2, 3 marbles).
- **Ejection.** A sharp inhale (air leaving) on the 200 ms push over the rim, a muffled thud as
  the void takes the marble, then vacuum silence while it falls, for the 600 ms of the void
  (section 5). Once it is gone, a distinct low "toll" for the player's loss (glass), a dry
  "clack" for the enemy's (shell). Synthesized in code (filtered noise and sines), no audio file.
- **Tells.** Every boss tell has its sound twin (sections 3 and 8), synthesized the same way and
  played when the tell appears or changes, never on a tell that stays the same: a low creak of the
  frame for The Hull's crack countdown, a small high bell for The Chaplain's flip tell, two hummed
  voices a fifth apart for The Choir's next army.
- **Music.** No melodic loops. Drone and texture layers, 2 to 3 tension layers driven by game
  state (marbles in danger, boss phase). Boss themes are a slow pulse that speeds up per phase.
  Today two drone layers of steady low sines under the hum (#439), through the music bus: the
  tension level is one step per player marble on the rim that one push could eject (by the weighted
  rule in The Unstable Core, #761) and per boss
  phase after the first, at most 2; level 1 brings in the first layer, level 2 both, each
  crossfading over about a second.
- **Voice.** Tally and a few crew logs only. Flat, tired, human.
- **Mix.** Four sliders: music, ambience, effects, voice (#438), each the gain of its bus into one
  master gain, 0 to 100 %, at 100 % by default and saved locally. The hum is ambience, the
  tension drones music, the knock, the ejection and the tells effects, the audio logs voice (#516).
  A Sound off saved by the old toggle sets every slider to 0. With every slider at 0 no audio
  context is made. The game is fully playable on mute: every audio cue has a visual twin (the
  ejection animation for the ejection sound, the tells on the board for their sounds, the transcript for an
  audio log).
- **Spatial.** Positional audio in the hub, stereo is enough on the board.

## 8. Accessibility

- **Colorblind.** Three palettes (protan, deutan, tritan) plus a high-contrast one, chosen in the
  settings menu and saved locally (#381). Factions differ by silhouette and glyph, never by color alone.
- **Clear-board mode.** Disables fog, bloom, grain, vignette, flicker, props over the board.
  It never removes a boss tell, a preview ghost or a phase notch.
- **Boss tells survive every mode.** Each tell is a steady shape or glyph plus a sound twin, not
  a flash, flicker or color alone. Photosensitivity safe mode, colorblind palettes, the horror
  slider and clear-board mode never remove one (#42).
- **Photosensitivity safe mode.** No flashes above 3 per second, no strobing, no full-screen
  white, lower flicker amplitude. Default on until the player picks otherwise.
- **Horror intensity slider** (0 to 3), per player and local, never changes gameplay information. 0: no jump scares, no shell close-ups, calm audio.
  3: full dread. Applies to visuals, audio stingers and lore text tone.
- **Reduced motion.** Cuts camera sway and the ejection tumble and stretch: a plain fade instead
  (section 5).
- **UI scale** 100% to 200%, subtitles for all audio logs, remappable inputs.
- All options reachable from the first screen, before any horror content, and saved locally.

## 9. References (titles only, to look at)

- Games: *Dead Space* (mood, diegetic UI), *Alien: Isolation* (restraint), *SOMA* (dread of the
  mundane), *Returnal* (alien ruin look), *Hollow Knight* and *Dark Souls* (environmental lore),
  *Obra Dinn* (deduction from scenes), *Inscryption* (board game as horror).
- Film: *Alien* (1979), *Solaris* (1972), *Sunshine* (2007), *Moon* (2009), *Annihilation*.
- Visuals: Zdzislaw Beksinski, H. R. Giger, Simon Stalenhag, Tsutomu Nihei (*Blame!*), Junji Ito
  (*Uzumaki*).
- Sound: Tim Hecker, Eliane Radigue, Ben Frost, Mica Levi (*Under the Skin* score), Kevin
  Martin (The Bug).

## 10. Feature issues

| Feature | Issue |
|---|---|
| Lore terminals | #20 |
| Audio log system | #21 |
| Diegetic HUD | #22 |
| Ejection VFX and decompression audio | #24 |
| Faction marble looks | #26 |
| Deck board themes | #28 |
| Adaptive audio and music | #30 |
| Accessibility options pack | #32 |
| Boss tell glyphs and diegetic phase notches | #62 |

## 11. Open questions

Resolved by the design review on #51 (answers recorded here):

- The Marker is renamed The Chaplain, slot table locked with the design mapping (section 3).
- Voice acting: out, text and ambient audio only.
- Online players get a cosmetic glyph (6 distinct ones for battle royale), no chat.
- The horror slider is per player and local, never changes gameplay information.
- Lore tie-in: in boss fights a draw counts as a loss for you, Tally "keeps the books".

Still open:

1. Audio assets: original recordings, licensed, or procedurally generated (budget)?
2. Photosensitivity safe mode on by default: confirm.
3. Tech review (#54) asks for an audio and asset pipeline section: who owns it?
