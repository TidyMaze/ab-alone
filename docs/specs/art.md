# Art direction

Status: v0, for issue #283. The art and sound direction of [world.md](world.md) and [ui.md](ui.md)
on one page, for whoever makes an asset, then the asset list and its budget (#61). It adds no lore
and no new look: each rule names its source (section numbers), and changes when its source does.

## 1. Direction

- **Brief.** A viewport onto a dim ship deck lit by one practical lamp, a cyan glow where the
  player is, never a web app around a canvas; clarity of play wins over mood (ui.md 1). The
  player is the last warm thing aboard, glass with a cyan light; the crew hardened into black
  shells and still plays by the rules (world.md 2).
- **Tone.** Cosmic dread, grief, bureaucracy. Never gore for its own sake (world.md 2).
- **Palette** (world.md 5, ui.md 2). Near-black `#0b0d0f` base, oxidized steel `#4a5258`, rust
  `#7a3b1d`, sodium orange `#d9822b` for hazard and furnace, one cold cyan `#7fd6e8` for the
  player's light, red `#ff6b5a` for danger only, bone-white `#d8d4c8` for tells (3:1 on the
  surface). Nothing saturated outside it. Dark is the deck; light is only a fallback.
- **Materials** (world.md 5). Brushed, pitted steel, oil stains, welds, taped cables,
  condensation, dust. Nothing emissive but lights, screens and marbles.
- **Marbles** (world.md 5, 8). Player: smoked glass, a cyan core that dims with each marble lost.
  Shell: matte black, ridged like a scarab, a faint heat pulse, no core. Boss: the shell plus one
  accent (rust crown, candle wax, wire wrap). Flipped by The Chaplain: ridges creep up the glass.
  Silhouette before colour. Each marble starts turned its own way and each cell disc is turned by
  its own angle, seeded, so the set never lines up and a game always looks the same.
- **Light** (world.md 5). Low-key: one hard source per deck, a dim cyan fill from the player's
  marbles, slow and rare flicker. Every cell and marble stays legible: cell edge 3:1, each marble
  3:1 on the deck (#344). The deck steel is lit to a mid-tone so the black shell stands out, the
  frame's plate stays dark.
- **Decks** (world.md 1, 3, 5). Mess: warm lamp, worn laminate (hot-seat, The Echo). Cargo: cold,
  steel and ore dust (online, The Hull). Furnace: orange glow, steam (The Choir). Chapel: candles,
  wood and wire (The Chaplain). Bridge: cold white, too clean (The Ballast Mind). Fog thickens
  toward the rim, never over a cell.
- **Type** (ui.md 3). Chakra Petch 600, uppercase, for the turn and the result; IBM Plex Sans for
  the rest. Sizes in rem, nothing under 0.8125rem.
- **HUD** (world.md 6). The board, its rim and its frame carry the game, menus are a terminal in
  the scene, the flat plate is the fallback.
- **Motion** (world.md 5, 8, ui.md 6). Weight and vacuum. A moved marble rolls to its new cell in
  200 ms, without slipping. An ejected marble rolls over the rim in 200 ms, the void takes it in
  600 ms, it only fades. The chrome fades in 160 ms, nothing loops. Reduced motion: a plain fade.
  Never more than 3 flashes a second.
- **Sound** (world.md 7). Low, weight first, silence as a tool. A hum per deck; a knock per move,
  a scrape per sumito, lower for more marbles; an ejection's inhale, thud and silence, then a toll
  for lost glass or a clack for a lost shell. Drones, never a melodic loop. Every cue has a visual
  twin.
- **Voice** (world.md 2, 4, 11). Tally says one short accounting line at the start and the end of a
  match ("Mess: one remaining.") and never explains itself. No voice acting.
- **Never.** A tell shown by a flash, a halo or colour alone (world.md 5, 8); red for a normal
  state, an effect over a cell or a legal target (ui.md 1); a flat overlay as the only copy of
  game information (world.md 6); cutscenes or lore that blocks progress (world.md 4); anything
  taken from an existing work (world.md, header).

## 2. Assets

**Budget** (tech.md 9, #61): initial load under 5 MB gzipped, a deck under 15 MB. At 0b64f5e the
first screen is about 0.6 MB gzipped (JS 258 KB, wasm 41 KB, textures 171 KB, app icons 98 KB).
Art gets 3 MB per deck at most. PNG today; KTX2 textures and glTF with meshopt come with #61.

**Made by**, the first that works: **procedural** (run-time code: geometry, materials, Web Audio;
no file), **generated** (a seeded script in `client/scripts/` like `gen-assets.mjs`: same seed,
same bytes, tested, output committed), **hand-made** (a contributor's own work in a free tool,
source kept out of the Pages artifact). All under the repo's MIT licence; the fonts are SIL OFL
1.1. Never (#283): a download, an online generator, a paid service, a non-commercial licence.

| Assets | Format and budget | Made | Today, issues |
|---|---|---|---|
| Marbles: glass and core, ridged shell, boss accents, flipped look | Materials, geometry; a ridge normal map, 256 px, 64 KB | Procedural, generated | Smoked glass with a cyan core (#291), opacity 0.8 so it reads 3:1 on the deck with no fog (#344, #417), ridged shell `shell-normal.png` 256 px, 10 KB (#293); boss accents and the dimming core: #26 |
| Board: light and textures per deck, frame, rim, backdrop | Data, geometry; textures 512 px, 300 KB a deck; backdrop 30 KB | Procedural, generated | One flat light, one steel set (deck albedo lightened x1.9 for marble contrast, #344), a hexagonal steel frame built in code, plate and rim (#292), the rim lights for the side to move (#300): #290, #28 |
| Props, one lore object per boss arena | glTF, 150 KB each, 1 MB a deck | Procedural, then hand-made | None: #28, #20 |
| Tells, phase notches, tally marks | Geometry; a crack decal, 128 px, 16 KB | Procedural, generated | Chaplain and Choir done, phase notches on the rim (#356), Hull crack `crack-decal.png` 128 px, 2 KB, near-black fissures (bone-white reads under 3:1 on the deck of #344) (#355): #62, #22 |
| Effects: ejection, particles, fog | Code; a particle atlas, 128 px, 16 KB | Procedural, generated | Ejection and fog done (#188, #84) |
| Chrome: plates, icons, fonts, in-scene text | CSS; inline SVG; woff2 100 KB; an MSDF atlas 200 KB | Procedural, hand-made in code, generated | Flat plates, the cog icon only: #287, #297, #22 |
| Sound: ejection, knock, hum, tension layers, tell twins | Web Audio, no file; a recording only when a synth cannot: Opus, 100 KB a cue | Procedural | The ejection only (#189): #289, #288, #30, #62 |
| Text: Tally lines, lore terminals, audio log transcripts | Text data, 20 KB a deck | Hand-written | None: #294, #20, #21 |

## 3. Gaps

From the audit of #283 (2026-10-24, every mode, phone and desktop), by player impact: #286 (the
player wears the shell against the bot and the bosses), #290, #291, the cream plates on a system
in light mode (the proposed quick win of #283), #288, #289, #292, #300, #293, #294, then the
existing #282, #287, #297, #28, #26, #62, #22, #20.
