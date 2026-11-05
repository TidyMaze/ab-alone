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
- **The Hollow Survey (canon, #1174).** The survey office that charted Hollow before the crew arrived. Its
  paperwork outlived it: Tally treats every rogue-lite run as an open **audit** of the books and every
  Trainer run as the crew's **drill**. The drill is held at **table zero** of the Mess, the table nobody
  sat at, with **crew attached: 6** (the Trainer's pool of 6 marbles, #1159). Tally's lines are short,
  optional and never gate anything. Rogue-lite run over: "Run voided. Audit reopened." (lost) or
  "Reconciled: 14." (won, with the army left). Trainer wave start: "Drill: wave 5. Opponents: five.
  Seated." Trainer result: "Wave 7 filed. Best on record: 9." No new rule, no HP, no damage: the lines
  only name what the player already sees. Open world with every lair beaten (#1175): "Variance noted. Clamp: open. Crew attached: 6."
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
  the player back on the hub on the same cell. The Mess's Medal room (#812) opens the same reader on a list of
  every boss with its medal and best turns, or Not beaten.
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
- **Lore of the story** (`client/src/lorelogs.ts`, #1589, section 12): 15 boss entries, one per boss of the roster, of 200 characters at most, and 12 logs of the
  Open world, of 320 at most (openworld.md section 12). A boss win shows that boss's entry in a sheet over the dock (`#lore`, the audio log transcript's family: it lets every
  press through, and Retry and leaving stay in the dock), a win again shows the same entry. Every entry is filed in the log archive when it is shown or read, after the
  terminals and in the order of the roster then of the logs, and the archive reopens it in the terminal reader (a log of the world and the Medal room have no audio log, so
  no Play log). Each entry has a stage, and none holds a secret word of a later one.
- **Tally.** One-line announcements at match start and end. Never explains itself.
- **Boss arenas.** Each boss board carries one lore object the player can inspect before the
  fight.
- **Rule.** Skipping all lore must never block progress or make the game unplayable. Lore
  rewards curiosity, it never gates.

## 5. Art direction

The one-page summary of sections 5 to 8, with the asset list, its size budget and how each asset
is made in the repo, is [art.md](art.md).

**Palette.** Near-black base (#0b0d0f), rust (#7a3b1d), oxidized steel (#4a5258), sodium orange
(#d9822b) for hazard and furnace, a single cold cyan (#7fd6e8) for the player's accents (the ring and the ghost marble, `main.ts` `pal.core`), not an inner light.
Red is reserved for danger (breach, ejection warning). Nothing saturated outside these.

**Materials.** Brushed and pitted steel, oil stains, welded patches, taped cables, condensation,
dust. PBR textures, no emissive surfaces except lights, screens and marbles.

**Lighting.** Low-key. Mostly one hard source per deck (practical lamp, vent glow, screen), plus
the rim's cold cyan on the player's turn (`frame.ts` `RIM_LIGHT`), no light on the marbles. Soft contact shadows ground the marbles onto the cells
and frame (#459), disabled under low quality tier and automation to save software WebGL. Flicker
is slow and rare (see photosensitivity, section 8). Shadows stay readable: cells and marbles must
stay legible in every lighting state.

**Fog.** Volumetric or screen-space haze, denser at the edges of the board, never over the cells.
Clear-board mode removes it.

**Marble looks per faction.**

| Faction | Look | Silhouette cue |
|---|---|---|
| Player | Opaque glass skin, no core inside (#885) | Smooth |
| Shelled (enemy) | Matte black organic shell, ridged like a scarab, faint heat pulse | Ridged, no core |
| Boss variants | Same shell with one accent (rust crown, candle wax, wire wrap) | Added silhouette |
| Flipped (by The Chaplain) | Player glass slowly shelling over: black ridges creep from the base up until the flip completes | Half glass, half ridged |
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
  tension drones music, the knock, the ejection, the tells and the pick of a rogue-lite map node (#1468) effects, the audio logs voice (#516).
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

## 12. The story (#1583)

The answer to the game, written once. Every writer reads this section before writing a line of lore, and **no line, spec or
screenshot may state a fact of a stage before the player can reach it** (the ladder below). This repository is public: a player
who reads this section spoils the game, and the text is here on purpose, because the secret words are checked against it.

### 12.1 The story in ten lines

1. Slag-glass remembers heat. It holds a warm person, shell outside and person inside, awake and slowing. It is a hold, not a death.
2. Cold lets go. The only cold the crew could reach was the airlock and Hollow's night.
3. The captain learned this first. A shell will not walk to an airlock. It obeys one thing, the board's count.
4. So the last order was the game: "so nobody else gets hurt". An ejected marble leaves the glass and wakes on the moon.
5. Tally was ordered to run the game and cannot push a crewmate. It needs a clear hand.
6. The ledger's old words change meaning. "Cargo" means to be delivered. "Gone for good" means gone from the glass. Draws are
   booked as losses because a draw delivers nobody. "Crew clear: one" means one hand free to push.
7. The player is ledger line 0412 ("Claim 0412" already exists), the first one delivered. They woke clear in the dust, and the cold
   took their memory. The visor is a cooled shard of the vein.
8. Towns are the delivered, dazed and quiet. The shelled play hard because the glass fears the cold. The Chaplain preaches against delivery.
9. The turn: pushing them into the void was always a rescue.
10. The last seat on the bridge is Tally itself. It lists itself as cargo and cannot deliver itself.

Sections 1 to 3 stay true at every stage: they are what the player believes until the ladder changes it.

### 12.2 The reveal ladder

Triggers are named by story moment, not by place: one `TRIGGERS` table binds each moment to today's events (a boss id, a Hub room) and
can be re-pointed at towers and dungeons if Decision #1513 passes.

| # | Player believes | Learns | Trigger (main / optional) | Delivered |
|---|---|---|---|---|
| 1 | The shelled are infected, Tally is a warden, ejected means dead | The premise | First launch | Cold open (#1523) |
| 2 | Tally is cruel | The rule was protective | First boss beaten / 3 wins in any mode | Boss victory line, Mess terminals |
| 3 | Ejected means dead | The ejected breathe | First town or Medal room visited / one ejected crewmate met in a rogue-lite event | Tally HUD line |
| 4 | The shell is a disease | Cold lets go | The Hull beaten / night survived in the Open world, dungeon act 3 | Cargo audio log, Tally line |
| 5 | I am the last clear survivor | I was delivered first, line 0412 | The Chaplain beaten / a lost run (optional extra line) | Lost-run summary, Chaplain line |
| 6 | Tally wants me beaten | Tally cannot push, it needs me | The Ballast Mind fight starts | Boss line |
| 7 | Winning opens the clamp | The last seat is Tally | Ballast Mind beaten / five towers (#1546) | Ending line |

**Secret words.** Withheld until stage 4: the cold and the word "delivered" (`deliver`, `cold`). Until stage 5: line 0412 (`0412`). Until
stage 6: Tally's limit (`cannot push`). Until stage 7: Tally as cargo. A line of stage *n* holds no secret word of a stage after *n*.
The main line uses only the main-column triggers, so skipping optional content never blocks the ending.

### 12.3 Delivery

- Short lines only: a Tally HUD line at match start, a boss victory or defeat line, a note under a terminal (the existing "Appended by
  TALLY" device), a lost-run summary line. Nothing blocks a move.
- Saved in one local key, `ab-alone.story`, no server (#1584, section 12.6).
- A player who only plays the bot table gets stages 2 to 4 from wins there, then one hint pointing at the world. Online games count wins
  too, and lines stay local, never sent to the opponent. After stage 7, old lines gain a reread twist, and Reset story is in the
  settings menu.
- **Lore entries** (`client/src/lorelogs.ts`, #1589): every entry carries its `stage` as data, a boss entry holds only what its stage
  reveals and stands alone (a player beats the bosses in any order, so it never reads as if an earlier stage had happened), and a world
  log of stage 1 to 3 may carry the hint of a reread: it holds no secret word of a later stage and reads differently once the player knows.
  The first five bosses follow the ladder (The Echo 2, The Hull 4, The Chaplain 5, The Ballast Mind 7, The Choir 3); the other ten stay at stage 3 or below.

### 12.4 The tested rule

`story.ts` holds the data and pure functions (section 12.6). The unit tests (`story.test.ts`, `main.story.test.ts`) check that stages are strictly ordered; every stage has a trigger emitted by a real call site; a
main-line-only run reaches stage 7; no line of stage *n* holds a secret word of a later stage; a corrupt save falls back to stage 1; every
line fits the HUD; every `lore.ts` and `audiologs.ts` entry carries a stage tag. The entries of `lorelogs.ts` are already under the
secret-word rule (`lorelogs.test.ts`).

### 12.5 Towns and towers

This amends #1516: **towns hold the delivered** (dazed, quiet, clear of the shell), and **the shelled stay in towers and dungeons**.

### 12.6 The stage store (#1584)

`client/src/story.ts` holds the data and the pure functions. The `TRIGGERS` table binds each moment of the ladder to the events of today,
so it can be re-pointed at towers later; `main.ts` fires the events through one `storyEvent` helper.

| Stage | Main trigger (the event) | Fired from |
|---|---|---|
| 2 | the first boss beaten (`won`, any boss) | the win of a boss fight, once per game |
| 3 | the Medal room first visited (`room`, `medal-room`), or a second boss beaten (`won`, 2 different bosses) | the reader opening the Medal room, a boss win |
| 4 | The Hull beaten (`won`, `hull`) | the win of a boss fight |
| 5 | The Chaplain beaten (`won`, `chaplain`) | the win of a boss fight |
| 6 | The Ballast Mind's fight starts (`start`, `ballast`) | the start of a boss fight |
| 7 | The Ballast Mind beaten (`won`, `ballast`) | the win of a boss fight |

- **Optional trigger.** Stage 2 also comes from 3 wins in any mode (`win`, counted once per finished game against a boss, a bot or an online
  opponent; a hot-seat game and a spectator count none; a replay counts none). An optional trigger counts for its own stage only. The
  other optional triggers of the ladder (an ejected crewmate of the rogue-lite, a night survived, a dungeon act 3, a lost run, five towers) are
  not bound: the game has no event for them yet.
- **The stage** is the longest unbroken run of fired moments from stage 2 up. Every moment is recorded when it happens, even out of order:
  a Chaplain win before The Hull counts as soon as stages 2 to 4 are reached. The main line alone reaches stage 7.
- **The save** is the JSON `{"moments": [...], "wins": n}` in `ab-alone.story`, through the same store as the log archive. A corrupt save is a
  new player's, stage 1. A player who played before the story keeps what he earned: at load the medals fire the matching boss moments (a boss
  with a medal was started and won). Two medals reach stage 3 the same way, so nobody is stuck for not opening the Medal room.
- **The gate.** A boss is never locked here (#1527 decides locking). Its lore entry above the current stage is held back: the win screen shows
  the sealed line in place of the entry, the same for every such boss, in Tally's register and with no secret word ("Ledger: sealed",
  "Seat: empty. The entry is held. Tally enters it when the count allows."); `body[data-lore]` reads `sealed`. The stage is computed after
  the win is recorded, so beating The Hull at stage 3 shows its entry. The entry is filed as read either way. The log archive lists only the
  entries whose stage is reached, terminals and logs of the world too (a log is gated when read from the archive, never when found), so a held
  entry appears when its stage is reached.
- **Tally's line.** After the first boss win, stage 2, the bot table's line at the start of a match reads "Mess: one seat filled. The other is
  counted. It was never an enemy." No other line changes.
- **Old text.** `lore.ts` and `audiologs.ts` entries carry a `stage` (all 1). Four lines broke the rule of 12.4 and were reworded, with the
  same meaning: the chapel sermon ("a coat against the night"), the night loader's log ("A wide, dim bay.", "That is the night air."), the
  bridge log ("A clean, steady hum.") and the first-visit line of the Open world ("Claim: unworked." before stage 5, openworld.md section 7).
