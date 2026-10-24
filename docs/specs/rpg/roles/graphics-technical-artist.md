# Rendering, world map, transition and VFX: implementation spec (graphics-technical-artist)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, still open). Source of truth:
the validated French gameplay plan (`je-veux-qu-on-am-liore-whimsical-sloth.md`, to land as
`docs/specs/rpg/plan.fr.md`), cited below as "§x.y". This file does not change that plan: what it gets
wrong or leaves open for rendering is listed in [Feedback on the gameplay spec](#feedback-on-the-gameplay-spec).
No code yet: strict TDD and 100 % coverage apply from R1 (CONTRIBUTING section 11).

Tags, as in `rules.md`: **FINAL** (decided by #313's validated choices, by an existing spec, or by a
standard such as WCAG), **TUNE** (a starting value, set by playtests or by the perf harness),
**PROPOSAL** (proposed here, an owner confirms). Every number carries one. A number copied from the
gameplay plan keeps its tag there (the plan says "everything is PROPOSAL and every number is TUNE
unless stated"). A number derived by maths from another number carries the tag of its source and the
word "derived".

Validated decisions this file treats as FINAL: science-fantasy setting; Diablo-like P2P with a party
of 4 at most; hero plus squad; an ejected hero dies and the fight is lost; deterministic combat; the
weighted push (`n > m` AND strictly greater total Weight); at most 1 ejection per action. For the
renderer, "deterministic combat" means one more FINAL rule from tech.md §5.2: **the renderer never
feeds back into the engine**, and visual randomness uses its own seeded RNG, never the engine's.

---

## Scope

In scope (this role owns the code, the shaders, the procedural assets and their tests):

- **The world map renderer** (§4.1, §4.2, §24.5 `world.ts`): instanced tiles, biome looks on the map,
  the exploration fog, procedural props, markers, the hero ball rolling from tile to tile, the full
  map view (key M).
- **The tile-to-board transition** (§4.5, "the signature moment of the game") and its reverse.
- **The board renderer for RPG fights** (§24.5): moving the current one-mesh-per-object board to
  instanced layers that scale to any region (radius 3 to 8, multi-tile unions of §4.6), the terrain
  decals and their glyphs (§5.1), the rendering primitives of the marble layers (HP arc, Weight
  pips, top-slot glyph, shield arc), tells and countdown ticks, the multi-tile camera framing.
- **The glyph atlas pipeline**: one signed-distance-field atlas generated in the repo, used by
  terrain, statuses, intents, tiers, rarities, markers, emotes and damage numbers.
- **VFX**: the effects timeline that turns the engine's `Effects` list into animation tracks, death
  and crumble, Shock, damage numbers, ability VFX kits, terrain changes, loot, harvest, beacons,
  day and night; the photosensitivity flash guard; the clear-board and reduced-motion variants.
- **The performance budget**: per-layer budgets, instance capacities, the stress scene and the
  Playwright perf harness, asset size per biome.

Out of scope (see "Dependencies" in each section): what the layers mean and their priority, the
glyph meanings and labels, the HUD and the action bar logic (`ux-designer`); colours as art
decisions, glyph silhouettes as art, materials as art (`art-director`, who owns art.md); the rules,
the `Effects` list and the dry-run previews (`combat-engineer`); the board region and terrain layer in
the engine (`engine-engineer`, `level-designer`); world data, A*, tile content, patrols and fog flags
(`world-engineer`, `level-designer`); the scene shell, input, picking wiring and the WASM bridge
plumbing (`client-engineer`); sounds (`audio-designer`); P2P (`network-engineer`).

Role slugs used below, the same roster as the sibling role specs: `lead-game-designer`,
`combat-designer`, `combat-engineer` (crate `abalone-rpg`, `apply_action`, `Effects`),
`engine-engineer` (crate `abalone-core`: region, terrain, weighted push), `level-designer` (world,
biomes, cells, board generation), `world-engineer` (crate `abalone-world`), `encounter-boss-designer`,
`ai-engineer` (intents), `ux-designer`, `art-director`, `audio-designer`, `client-engineer`,
`network-engineer`, `economy-designer`, `narrative-quest-designer`, `qa-engineer`, `tech-lead`.

## Inputs read

- The gameplay plan, whole file, §0 to §26, and its "Fichiers critiques" and "Vérification".
- `SPEC.md`, `CONTRIBUTING.md` (sections 6.4, 11, 13), `AGENTS.md`.
- `docs/specs/world.md` §5 (palette, materials, light, fog, marble looks, tell marks, ejection), §6
  (diegetic HUD), §7 (audio twins), §8 (accessibility: colourblind, clear board, photosensitivity,
  reduced motion, UI scale).
- `docs/specs/art.md` (direction on one page, asset table and budget, "made by" rules: procedural,
  generated, hand-made; never a download).
- `docs/specs/tech.md` §3 (`Effects` as the only engine-to-renderer channel), §5 (renderer,
  `WebGPURenderer` with WebGL2 fallback, TSL), §5.1 (post chain, tiers, flash limiter), §5.2 (effects
  timeline boundaries), §5.3 (MSDF text and DOM mirror), §5.5 (performance budget), §9 (download
  budget).
- `docs/specs/ui.md` §1 (no effect over a cell, a marble or a legal target), §5 (board framing), §6
  (motion), §7 (contrast).
- `docs/specs/game-design.md`, `rules.md`, `boss-balance.md` (Hull and Ballast Mind geometry).
- Sibling role specs, for alignment: `ux-designer.md` (marble layers L0 to L3, glyph catalog, unfold
  constraints, animation budget), `level-designer.md` (tiling formula, inverse `tile_of`, region and
  terrain layer, R2 cell set), `combat-designer.md` (the `Effects` contract).
- Code: `client/src/main.ts` (scene, one `Mesh` per disc, marble, ring and tick, rebuilt on every
  `refresh()`), `board.ts` (`RADIUS = 4`, `CELLS` of 61, `cellIndex` by linear search, `axialTo3D`),
  `camera.ts` (`DIST_MAX = 18`, `framing`), `quality.ts` (tiers `low`/`high`, `fogSettings` in board
  radii, `drawDue`), `eject.ts` (800 ms tumble, 400 ms fade, pose functions), `slide.ts` (200 ms),
  `ghost.ts`, `hull.ts` (crack ticks), `chaplain.ts`, `choir.ts`, `scripts/gen-assets.mjs` (seeded
  PNG generator, zlib only), `vite.config.ts` (coverage include list: pure modules only),
  `e2e/fog.spec.ts` (pixel-diff pattern, `window.__cellToScreen` hook); `crates/abalone-core/src/
  board.rs` (`MAX_RADIUS = 5`, `HashMap` cells, `void`, `cracks`).

---

## 0. Shared design: how the renderer is built

Everything below rests on four rules (PROPOSAL, from tech.md §3 and §5.2 which are FINAL):

1. **Pure maths, thin glue.** Every layout, pose, timeline and budget decision is a pure TypeScript
   function in `client/src/rpg/render/` or `client/src/rpg/world/` (no three.js import, no DOM),
   unit tested with vitest at 100 % and listed in the `coverage.include` of `vite.config.ts`. The
   three.js glue lives in `client/src/rpg/scene/` (the folder `ux-designer` already names) and is
   tested by Playwright, like `main.ts` today (`vite.config.ts` comment: "The Three.js scene and the
   DOM wiring ... need a real browser").
2. **The renderer reads, never writes.** Inputs are a read-only `CombatView` / `WorldView` snapshot
   (versioned JSON from the bridge, §24.4) plus the ordered `Effects` list of the last action. The
   renderer never diffs two states to guess what happened (tech.md §3, FINAL).
3. **Instanced layers, allocated once.** Each visual layer is one `InstancedMesh` (or one
   `InstancedBufferGeometry`) with a fixed capacity, filled from typed arrays computed by a pure
   function. Nothing is created per move: `refresh()` today builds new `Mesh` objects on every move
   (`main.ts`, `marbles.clear()`), which will not scale (see Feedback G10).
4. **Timelines are data.** An animation is a list of tracks `{ startMs, durationMs, kind, params }`
   with a pose function `poseAt(track, t)`, like `eject.ts` and `slide.ts` today. Skip jumps every
   track to its end; fast-forward (resume, reconnect catch-up, tech.md §5.2) applies the snapshot with
   no track at all.

### 0.1 Coordinates

- **One coordinate system for the world and the board** (PROPOSAL). A world unit is one cell spacing.
  A combat cell `(x, y)` (axial) sits at `axialTo3D(x, y)` of `board.ts` (pointy-top, FINAL today).
  The tile `(Q, R)` is centred on its board centre `M(Q, R) = Q·(9, −4) + R·(4, 5)` (§4.1, TUNE there),
  so its 3D centre is `axialTo3D(9Q + 4R, −4Q + 5R)`. Two neighbour tiles are √61 ≈ 7.81 units apart
  (TUNE, derived from §4.1).
- **Floating anchor** (PROPOSAL). The scene root of the world is offset by `−center(T0)`, where `T0` is
  the hero's tile out of a fight, or the anchor tile of the fight (the first tile of the union, as
  `level-designer` proposes for combat coordinates). So the board of a one-tile fight is drawn at the
  origin, `axialTo3D` keeps working unchanged, and the camera code of `camera.ts` keeps its target at
  `(0, 0, 0)`. The farthest tile of a radius-60 world is about 469 units away (TUNE, derived from §4.1),
  well inside float32 precision for positions, so no per-frame re-centering is needed: only the root
  offset changes when `T0` changes.

### 0.2 The tile outline (a finding, see Feedback G1)

The radius-4 board outline has its corners at 0°, 60°, ... (cell `(4, 0)` lies on +x). The tile
lattice of §4.1 has its neighbours at 26.33° + k·60° (`(9, −4)` lies at `atan2(2√3, 7)` = 26.33°,
TUNE, derived). The regular hexagon that tiles the plane on that lattice (its Voronoi cell) has its
corners at neighbour ± 30°, that is at −3.67° (mod 60°), a circumradius of √61/√3 ≈ 4.51 units and
exactly the area of the 61 cells (lattice determinant 61). So:

- a world tile is drawn as that **regular hexagon, turned −3.67°** against the board outline (PROPOSAL);
- the 61 cells of the board fill the same area, with a jagged rim that pokes out of the hexagon by at
  most about 0.07 units at the corners (TUNE, derived);
- the unfold (section 3) turns the board by +3.67° while it opens, so the world hex lands on the board.

`level-designer` (section 4 of its spec) quotes a 26.3° turn; that is the angle of the neighbour
direction, not of the outline: modulo the 60° symmetry of a hexagon the outline only differs by 3.67°.
To settle in R4 with `level-designer` (Open question Q1).

### 0.3 Budget summary (details in section 12)

| Item | Value | Tag |
|---|---|---|
| Frame rate | 60 fps at 1080p, integrated GPU, full tier; 30 fps floor, reduced tier, WebGL2 laptop | FINAL (tech.md §5.5) |
| CPU main thread per frame | under 8 ms, of which the renderer's own work under 3 ms | 8 ms FINAL (tech.md §5.5); 3 ms TUNE |
| GPU per frame | under 10 ms | FINAL (tech.md §5.5) |
| Draw calls | under 150; target 40 on a board, 30 on the world map | 150 FINAL (tech.md §5.5); 40 and 30 TUNE |
| Triangles per frame | under 300,000 | TUNE |
| Memory | under 500 MB; GPU textures under 64 MB | 500 MB FINAL (tech.md §5.5); 64 MB TUNE |
| Initial download | under 5 MB gzipped | FINAL (tech.md §9, art.md §2) |
| Art per biome pack | 3 MB at most, lazy loaded | FINAL for decks (art.md §2), extended to biomes: PROPOSAL |

---

## 1. World map renderer (§4.1, §4.2, §4.3, §24.5)

### 1.1 What the player sees (§4.1, §4.3, §5.2)

A low hex relief seen from above at an angle: each tile a hex prism tinted by its biome, a few
procedural props per tile (petrified trunks, salt crusts, ice slabs, basalt), markers for its content,
the hero ball, the packs as small shell marbles, the other party members. Unseen tiles are dark.

### 1.2 Implementation

**Tile window, not the whole world** (PROPOSAL). The world has 10,981 tiles (TUNE, derived from
radius 60, §4.1: `3·60·61 + 1`). The 3D view only draws the tiles within a window of radius 12 tiles
around `T0` (TUNE): 469 tiles (TUNE, derived), one `InstancedMesh` of hex prisms, one draw call. When
the hero changes tile, the window is refilled (469 matrices and colours, well under 1 ms, TUNE). The
camera never sees past the window because the scene fog (`quality.ts` linear fog) closes at 8 tiles
(TUNE) from the camera target.

- Pure module `client/src/rpg/world/tiles.ts`:
  - `tileCenter(Q, R): Vec3` (section 0.1);
  - `tileHexCorners(): Vec2[6]` (the −3.67° hexagon of section 0.2);
  - `tilesInWindow(center: Tile, radius: number): Tile[]` in the fixed order of §24.1 (r ascending,
    then q), so the instance index of a tile is stable for a given window;
  - `fillTileInstances(tiles, view: WorldView, out: { matrix: Float32Array; color: Float32Array })`:
    the prism height comes from the biome (plains 0.10, forest 0.15, marsh 0.05, dunes 0.20, ridges
    0.60, tundra 0.25, shore 0.05, caldera 0.40, glassland 0.30, the Well 0.10 units; all TUNE), the
    colour from the biome palette (section 9) times the fog factor (1.1.3).
- Scene glue `client/src/rpg/scene/world.ts` (the `world.ts` of §24.5): owns the meshes, calls the
  pure fill functions, uploads only the changed ranges (`addUpdateRange`).

**Fog of exploration** (§4.2: unseen tiles dark, revealed in a radius of 3, TUNE there). Three states
per tile, read from the world state (`world-engineer` owns the `discovered` flag and the reveal):

| State | Look | Tag |
|---|---|---|
| Never seen | near-black `#0b0d0f` top, edge outline kept at 3:1 against the dark so the grid reads | colour FINAL (world.md §5); 3:1 FINAL (world.md §5) |
| Seen, out of sight | biome colour at 45 % luminance, no props animated, no markers but static ones (Beacons, outposts) | 45 % TUNE |
| In sight (radius 3 of the hero) | full biome colour, props, markers, packs | radius 3 TUNE (§4.2) |

`fogFactor(state): number` is pure; the edge outline is a second instanced layer of hex rings (one draw
call) shared with the aggro ring and the path preview of `ux-designer`.

**Props** (PROPOSAL). Procedural geometry built once at start, no download (art.md §2 "procedural"
first): per biome 2 to 4 prop kinds (TUNE), each a low-poly mesh made in code (jittered icosahedron
rocks, tapered cylinders for petrified trunks, hexagonal prisms for crystals, flat slabs for ice and
salt). Placement `scatterProps(tileSeed, biome): PropSpot[]` is pure, 0 to 3 props per tile (TUNE),
seeded from the tile seed of §4.1 through the client's own visual RNG (mulberry32, as in
`gen-assets.mjs`), so every player sees the same props (P2P party, §4.7) without touching the engine
RNG. Props never stand on a tile's centre, where the hero and markers go (keep-out radius 1.5 units,
TUNE). One `InstancedMesh` per prop kind in the window: at most 8 draw calls (TUNE).

**Markers** (§4.3, §4.4, §16, §18, §22). Content glyphs float over their tile: pack tier (colour and
glyph, §4.4), node kind, NPC `!` and `?` (§16), Beacon, dungeon entrance, chest, puzzle, event, world
boss. All come from the glyph atlas (section 5) in one billboard layer (one draw call, capacity 512,
TUNE). Which glyph means what is `ux-designer`'s catalog; this role draws them.

**Packs on the map** (§4.3 "visible, patrols over 3 tiles"). A pack is drawn as 1 to 3 small shell
marbles (scale 0.6, TUNE) at the position given by the world state; the elite gets a larger leader
marble (scale 0.8, TUNE). The renderer interpolates between two positions given by `world-engineer`
(it never invents a patrol, see Feedback G9).

### 1.3 Dependencies

- `world-engineer`: `WorldView` JSON (tiles in the window: biome id, content kind, discovered state,
  tile seed; packs with positions; party members), `tile_of` and the reveal radius.
- `level-designer`: the tiling formula and its inverse (`tile_of`), the 10 biome ids, the outline
  question (Q1).
- `art-director`: biome map colours and prop silhouettes (section 9).
- `ux-designer`: marker glyph meanings, path preview, aggro ring, tier ramp.
- `client-engineer`: scene shell, pointer picking (a ray on the plane `y = 0` to a world point, then
  `tile_of`: no raycast against instances is needed).

### 1.4 Tests

Unit (`tiles.test.ts`, `props.test.ts`, `fog.test.ts`):
- Given tile `(1, 0)`, When `tileCenter`, Then `x = 7` and `z = −2√3` (TUNE, derived from §4.1).
- Given the six neighbours of `(0, 0)`, Then each centre is √61 from the origin and the six are 60°
  apart.
- Given `tileHexCorners()`, Then the hexagon's area equals 61 × the area of one cell hexagon, to 1e-9.
- Given a window of radius 12 around `(5, −3)`, Then it holds 469 tiles, in r-then-q order, and none
  outside the world radius 60 (window clipped at the world edge: fewer tiles, never an error).
- Given the same tile seed twice, Then `scatterProps` returns the same spots; Given two different seeds,
  Then the lists differ (property over 1,000 seeds: same seed same list, no prop within 1.5 of centre).
- Given a tile "never seen", Then `fogFactor` is 0 and the outline stays on; "seen" 0.45; "in sight" 1.
- Given a window refill, Then only the instances whose tile changed are in the update ranges.

E2e (R4, `e2e/world.spec.ts`): load `?world=seed42&at=0,0`; `document.body.dataset.tiles` is `469`;
`window.__perf().calls` on the world view is under 30 (TUNE); walking one tile east keeps 469 and
moves the root offset; screenshot for the PR (CONTRIBUTING 6.4).

### 1.5 Risks and open points

- The 26.33° lattice makes rows of tiles look diagonal on screen: the default world camera azimuth
  should follow the lattice (rotated 26.33°, TUNE) so zone borders read naturally. Playtest.
- WebGL2 fallback: instanced colour and matrices are in core three.js, no risk; custom per-instance
  attributes in TSL (`instancedBufferAttribute`) must be checked on both backends in the R1 spike
  (GTA-02).
- The fog look (state 1) must not be confused with night (section 10): night lowers the light, never
  the 3:1 outline.

---

## 2. Hero travel on the map (§4.2, §4.4, §21)

### 2.1 Implementation

- **Roll** (§4.2: one tile per step, step time 300 ms × biome cost, TUNE there; Élan −20 % at level 20,
  −35 % at level 40, TUNE there). Pure `client/src/rpg/world/travel.ts`:
  `stepTrack(from: Tile, to: Tile, durationMs, kind: 'roll' | 'slide'): Track` and
  `ballPose(track, t): { pos, rot }`. The ball moves at constant speed along the path (linear inside a
  path, eased only at the first start and the last stop, 80 ms, TUNE) and rolls without sliding
  (rotation = distance / radius, as `eject.ts` does). The step time comes from `world-engineer` (the
  renderer does not recompute biome costs).
- **Ice on the map** (§4.2: "on glisse d'une tuile de plus"): the extra tile is a `slide` track: the
  ball keeps its rotation and glides, so the player sees it is not walking (PROPOSAL).
- **Beacon teleport** (§4.2): the ball shrinks into motes (16 particles, TUNE) at the start Beacon in
  300 ms, the camera cuts, the ball reforms at the target in 300 ms (TUNE). Reduced motion: a 200 ms
  fade out and in (TUNE). Full HP refill at a Beacon (§4.2) shows as the HP arc filling in 300 ms
  (TUNE).
- **Out-of-combat HP** (§4.2, 5 % per second, TUNE there): the HP arc of section 4 is also drawn
  under the world ball, filled by the value the world state gives each frame (no own timer).
- **Party members** (§4.7, up to 4, FINAL): other heroes are the same glass marble with their slot
  glyph engraved (world.md §5 battle royale slot glyphs, FINAL: "never colour alone").
- **Hub presence** (§21, best effort): other players' balls in the hub use the same marble, emotes and
  pings are atlas glyphs over the ball for 2 s (TUNE); a ping on a tile is one bone-white ring that
  grows and fades in 1 s, once (TUNE), never a flash.

### 2.2 Dependencies

`world-engineer` (path, per-step duration, Beacon events, HP value), `ux-designer` (path dots, emote
set), `network-engineer` (party positions, presence), `client-engineer` (world camera follow).

### 2.3 Tests

Unit: Given a step of 300 ms between `(0,0)` and `(1,0)`, When `ballPose` at 150 ms on a 3-step path,
Then the ball is halfway and its rotation equals the travelled distance / 0.36 (marble radius, FINAL
today in `main.ts`). Given a `slide` track, Then the rotation does not change. Given reduced motion,
Then the Beacon track is a fade of 200 ms. Given 2 party members, Then 2 extra marbles with 2 distinct
glyphs.

E2e (R4): click a tile 3 steps away on plains; after 900 ms + one frame (TUNE, from §4.2)
`document.body.dataset.heroTile` equals the target; screenshot.

### 2.4 Risks

Real-time travel and the automation throttle of `quality.ts` (`drawDue` under `navigator.webdriver`):
travel must be time-based, never frame-based, or e2e runs on CI would walk slower. FINAL constraint
(bug #216 pattern).

---

## 3. Tile-to-board transition: the unfold (§4.5, §4.6, §6.1, §6.12)

### 3.1 The sequence (§4.5: about 1.2 s, TUNE there)

| Phase | Time | What moves | Tag |
|---|---|---|---|
| A. Focus | 0 to 300 ms | the camera dollies from the world view to the board view (`resetView()` of `camera.ts` framed on the region, section 7); the other tiles fade to the fog colour; the fight tile lifts by 0.2 units | times TUNE, 0.2 TUNE |
| B. Unfold | 300 to 900 ms | the tile's top splits into its cells: ring k of the board (k = 0 at the centre) starts at 300 + k × 600 / (R + 1) ms and each disc rises and settles in 250 ms; the whole board turns +3.67° (section 0.2); terrain decals fade in with their disc | 300, 600, 250 TUNE; 3.67° derived |
| C. Arrive | 900 to 1200 ms | the pack's map marbles split into the fight's monsters, which roll to their start cells; the hero stays on its cell and its Fragments shard out of it (lore of §6.9: "éclats de verre du héros") | TUNE |

Then placement (§6.1) starts. An ambush (§4.4, the pack plays first) waits for the end of phase C, as
`ux-designer` requires (its section 6.2).

- **Board smaller than the tile** (skirmish, radius 3, §6.8): only the 37 cells of radius 3 rise
  (TUNE, derived); the outer ring of the tile sinks back into the fog.
- **Board larger than the tile** (radius 5 in a party, §6.8): the outer ring of 30 cells (TUNE,
  derived) rises from the edges of the 6 neighbour tiles, as `level-designer` proposes (global
  terrain); the neighbours do not fade until phase B ends.
- **Multi-tile** (§4.6): every tile of the union unfolds at once, ring order measured from each tile's
  own centre, then the camera overview of section 7.
- **Fold back** (not in the plan, Feedback G3): at the end of a fight, the reverse of phase B and A in
  600 ms (TUNE): the Remains and terrain fade, cells sink, the camera returns. Flee (§6.7) and a
  dungeon room clear use the same fold. Defeat in the world (§6.12, back to the last Beacon) uses the
  Beacon teleport of section 2 instead.
- **Skip** (FINAL by analogy with world.md §5 ejection: "a click or a key ends it at once, and it
  never holds the next move"): any click or key jumps every track to its end.
- **Reduced motion** (§4.5: "en mouvement réduit, on n'anime qu'un seul plan", read here as one cut,
  Feedback G2): a 300 ms cross-fade from the world view to the board view, no camera move, no rising
  discs (300 ms PROPOSAL, same value as `ux-designer` section 6.2).
- **Retry against a boss** (§1 pillar 3 and §6.12: "en moins de 5 s", TUNE there): no unfold; the board
  resets in place with no allocation (section 4.1); renderer share under 500 ms (TUNE).

### 3.2 Implementation

- Pure `client/src/rpg/world/unfold.ts`:
  - `unfoldPlan(input: { region: Cell[]; tiles: Tile[]; anchor: Tile; radius: number; reducedMotion:
    boolean }): Track[]` returns one track per cell (start, duration, from pose on the tile top, to
    pose on the board) plus one camera track and one fade track;
  - `foldPlan(...)`: the reverse plan, 600 ms;
  - `cellPose(track, t)` and `cameraPose(track, t)`, pure, like `trackAt` in `eject.ts`.
- Glue `client/src/rpg/scene/transition.ts`: drives the board layers (section 4) and the world layers
  (section 1) from the plan. The board's instanced buffers exist before the transition starts (built
  during phase A from the fight snapshot), so phase B allocates nothing (FINAL constraint for 60 fps).
- The transition is a pure presentation layer: the fight's state exists (and its hash) before phase A
  starts (tech.md §5.2, FINAL).

### 3.3 Dependencies

`ux-designer` (input rules during the transition, ambush pacing), `combat-engineer` (the initial
`CombatView` snapshot ready before the transition), `level-designer` (cells of the region per format,
global terrain for radius 5, tile outline Q1), `client-engineer` (input skip wiring, camera handover),
`audio-designer` (a sound for the unfold, its visual twin is this animation, world.md §7 FINAL).

### 3.4 Tests

Unit (`unfold.test.ts`):
- Given a radius-4 board on one tile, When `unfoldPlan`, Then 61 cell tracks, ring 0 starts at 300 ms,
  ring 4 at 780 ms, and the last track ends at 1030 ms, under 1200 ms (TUNE values, the test reads the
  constants).
- Given radius 3, Then 37 tracks and the 24 outer cells of the tile get a "sink" track.
- Given radius 5 on tile `(0,0)`, Then the 30 outer cells start from a point inside a neighbour tile's
  hexagon (`tile_of` of the cell is not `(0,0)`).
- Given reduced motion, Then one fade track of 300 ms and no camera move.
- Given skip at any time, Then every pose equals its end pose.
- Property: for every cell, the end pose equals `axialTo3D(cell)` exactly (the board is where the rules
  say it is).

E2e (R4, `e2e/unfold.spec.ts`): walk into a pack; `document.body.dataset.phase` goes `world`,
`unfold`, `placement`; the time from `unfold` to `placement` is under 1.5 s (TUNE margin over 1.2 s);
a key press during `unfold` reaches `placement` within 2 frames; with `reducedMotion: 'reduce'`
(Playwright `emulateMedia`) the phase lasts under 500 ms; screenshots mid-unfold for the PR.

### 3.5 Risks

- "The signature moment" is subjective: ship the plan with TUNE times and a debug slider
  (`?unfoldMs=`), let playtests settle them.
- Monsters "rolling to their start cells" in phase C must not overlap the ambush tell: the first pack
  action waits for phase C (constraint from `ux-designer`).

---

## 4. Board renderer: instanced layers on any region (§24.5, §4.6, §6.8, §24.2)

### 4.1 Implementation

**Region** (§24.2: `Board` becomes an arbitrary cell mask instead of `MAX_RADIUS = 5`). The client
mirror is `client/src/rpg/render/region.ts`, pure:
- `Region.from(cells: Cell[])` keeps the cells in the §24.1 order (r ascending, then q) and an index
  map `key(q, r) → index` (a `Map` on a packed integer key; today `cellIndex` is a linear
  `findIndex` over 61 cells, which is O(n) per lookup and too slow at 427 cells, Feedback G10);
- `bounds(): { center: Vec3; radius: number }` for the camera (section 7) and the fog span
  (`quality.ts` `FOG_SPAN` is in multiples of `RADIUS = 4` today; it becomes a multiple of the region
  radius, PROPOSAL);
- `grow(cell)` / `shrink(cell)` for the Pont of §8.8 (a cell beyond the edge, for 2 turns) and the
  Gouffres of the Breach, Hull and Séisme (a cell becomes a hole).

**Layers and capacities** (all PROPOSAL, capacities TUNE):

| Layer | Geometry | Per-instance data | Capacity | Draw calls |
|---|---|---|---|---|
| Cell discs | the current disc (cylinder r 0.46, h 0.1, FINAL today) | matrix, terrain tint, ring tint | 512 cells | 1 |
| Terrain decals | flat quad, 0.8 of the disc (`ux-designer` 5.1, TUNE) | matrix, glyph id, rotation | 512 | 1 |
| Rocks | low-poly block, hatched normal map (§5.1 "bloc hachuré") | matrix | 512 | 1 |
| Holes (Gouffre) | dark disc with a bone-white outline ring (§5.1 "cercle noir cerclé") | matrix | 512 | 1 |
| Marbles, glass (hero, Fragments, party) | sphere r 0.36 (FINAL today) | matrix, core light (0 to 1), slot glyph | 128 | 1 |
| Marbles, shell (monsters) | same sphere, ridge normal map | matrix, accent id | 128 | 1 |
| Boss and Revenant accents | accent meshes (crown, wax, wire wrap, world.md §5; bone veins for Revenants) | matrix | 64 | 2 |
| HP and shield arcs | flat ring on the disc, cut by a TSL fragment node | matrix, hp fraction, shield fraction | 128 | 1 |
| Weight pips | small studs on the front rim of the disc | matrix (one instance per pip, outline flag) | 640 (5 × 128) | 1 |
| Glyph billboards | camera-facing quad | position, glyph id, tone, scale | 512 | 1 |
| Tell outlines | ring outline on a cell (bone-white, world.md §5) | matrix, style | 512 | 1 |
| Countdown ticks | the engraved tick of `hull.ts` | matrix | 1024 | 1 |
| Remains (Dépouille, §6.6) | a low ring of shards on the disc | matrix, origin tint | 128 | 1 |
| Ghosts (preview, §1 pillar 2) | sphere, 45 % opacity (FINAL today) | matrix, side | 128 | 1 |
| Damage numbers | atlas digits on quads (section 6.3) | position, digit id, tone, scale | 256 | 1 |
| Particles | camera-facing quads, atlas | position, size, frame, alpha | 2,000 | 1 |
| Frame and engraved bar (§24.5) | the board frame mesh | — | 1 | 2 |

Total about 21 draw calls for a board plus the post chain (TUNE), under the 40 target and far under
150 (FINAL, tech.md §5.5). Today a classic board already costs about 61 discs + 28 marbles + rings and
ticks, one draw call each (counted from `main.ts`), so the move to instancing is required even before
any RPG layer.

- Pure fill functions in `client/src/rpg/render/layers.ts`: `fillLayers(view: CombatView, region,
  out: LayerBuffers): LayerCounts`. `LayerBuffers` are preallocated `Float32Array`s; the function
  writes them in the fixed unit order (§24.1: units sorted by id) and returns the instance count per
  layer. It allocates nothing (tested by passing frozen buffers of the right size).
- Units keep a stable instance slot by unit id (`slotOf(id)`), so an animation track can address "unit
  17" across states (needed for slides, deaths, Paradoxe and Retour of §8.7).
- Glue `client/src/rpg/scene/board.ts` uploads the buffers; picking uses the disc layer's `instanceId`
  → region index → cell.
- The classic modes of the Mess (§21: hot-seat, 1v1, daily, classic bosses, "les modes existants
  restent intacts") move to the same layers in GTA-02 with the same look and the same e2e tests; no
  visible change is allowed in that PR (screenshot before and after).

**Marble overlays** (§24.5: HP ring, Weight pips, statuses, intent; layer order and meaning from
`ux-designer` 1.1, L0 to L3):

- **HP arc (L1)**: a flat ring between radius 0.38 and 0.45 on the disc (TUNE), drawn for the fraction
  `hp / hpMax` clockwise from the camera-facing side, the rest dark steel. The cut is one TSL node:
  `angle(uv) < fraction × 2π`, so one geometry serves all units. The shield is a thin outer arc
  (0.45 to 0.47, TUNE) on the same instance (a second fraction attribute). Tones: the arc is the
  side's marble tone (glass pale or shell dark with a bone outline), never red unless the unit is in
  danger, which `ux-designer` signals with the L3 glyph (red is for danger only, ui.md §2 FINAL).
- **Weight pips (L2)**: 1 to 5 studs (§6.4: Weight 1 to 5, FINAL there as a bound) on the front rim
  of the disc, 0.07 apart (TUNE); a temporary change (Alourdi, Allégé, Mud, Titan) is an outlined pip
  (`ux-designer`).
- **Top slot (L3)**: one billboard glyph 0.45 above the marble top (TUNE) with an optional "+N" digit;
  the glyph id comes from `ux-designer`'s `layersOf` (`client/src/rpg/layers.ts`).
- **Hero mark (L0)**: the hero is glass with the cyan core plus an engraved ring band (`ux-designer`
  1.1 PROPOSAL): a second accent mesh instance. Its core light dims with each Loss (world.md §5
  "cyan inner light that dims with each lost marble", FINAL) and goes out when the hero dies.

### 4.2 Dependencies

`engine-engineer` and `level-designer` (the region mask, terrain layer and their JSON in the bridge),
`combat-engineer` (`CombatView`: units with id, kind, side, entity, cell, hp, hpMax, shield, weight,
statuses, marks; remains; tells; intents), `ux-designer` (`layersOf`, priorities, tones),
`art-director` (accent meshes, ridge normal map, hatching), `client-engineer` (picking, selection,
input, the classic-mode wiring in `main.ts`).

### 4.3 Tests

Unit (`region.test.ts`, `layers.test.ts`, `hparc.test.ts`):
- Given the radius-4 region, Then 61 cells in the order of `CELLS` in `board.ts` (the classic board
  keeps its bridge order, FINAL today).
- Given radius 3, 5, 8, Then 37, 91, 217 cells (TUNE, derived from §6.8).
- Given a union of 7 tiles (the Ballast Mind flower, §17, §18), Then 427 cells, no duplicate, and
  `index(key)` is O(1) (a `Map`).
- Given a `CombatView` with 14 units, When `fillLayers` twice with the same view, Then byte-identical
  buffers (determinism of the draw order, §24.1).
- Given a hero at 30 of 120 HP, Then the arc fraction is 0.25; Given 0 shield, Then the shield
  fraction is 0; Given a shield above hpMax, Then it is clamped to 1.
- Given a unit with Weight 3 and Alourdi +1 (§6.11), Then 4 pip instances and 1 outlined.
- Given a unit removed by death, Then its slot is free and the others keep their slots.
- Property: `fillLayers` never writes past `capacity` and returns counts under it; a view over capacity
  throws a clear error naming the layer (a bug, not a silent truncation).

E2e: GTA-02 keeps every existing spec green (`play`, `eject`, `slide`, `ghost`, `boss`, `fog`,
`clear-board`, `phone-layout`, ...) with `window.__perf().calls` under 25 on the classic board (TUNE).
R1 (`e2e/rpg-board.spec.ts`): a seeded skirmish shows `data-units`, HP arcs visible (pixel sample
under a damaged unit differs from a full one), Weight pips count via `window.__layers()` debug hook.

### 4.4 Risks

- Refactoring `main.ts` (1081 lines) touches every mode: do it alone in one PR (GTA-02) with the
  classic look unchanged, before any RPG layer (CONTRIBUTING rule 17, KISS).
- A TSL node for the arc cut must compile on WebGL2 (fallback); spike it in GTA-05 first.
- 128 marbles (TUNE) covers the largest format: battle royale 6 × 10 = 60 (§20, FINAL there as the
  existing spec), raid 4 × 7 heroes and squads + packs (§6.8), plus Revenants (3 max, §8.6).

---

## 5. Glyph atlas (§5.1 "un glyphe obligatoire", §4.4, §6.6, §6.11, §12, §16, world.md §5, §8)

### 5.1 Implementation

- One **signed-distance-field atlas**, single channel (R8), 1024 × 1024 (TUNE), 64 px cells, 256 glyphs
  (TUNE), generated in the repo by `client/scripts/gen-glyphs.mjs` (Node, zlib only, like
  `gen-assets.mjs`: same seed, same bytes, output committed under `client/public/assets/glyphs.png`).
  About 150 KB as PNG (TUNE), inside the art.md row "Chrome ... an MSDF atlas 200 KB" (FINAL budget).
- **Glyphs are built from SDF primitives in code**, not drawn by hand and not rasterized from SVG: each
  glyph is a small composition of exact 2D distance functions (circle, ring, box, rounded segment,
  triangle, arc, union, subtraction, repetition) in `client/scripts/glyph-shapes.mjs`. The generator
  evaluates the distance per texel. No rasterizer library, no download (art.md §2 "never a download").
  Example: snowflake = union of 3 rounded segments at 0°, 60°, 120° plus 6 short barbs; hatched block =
  box minus 3 diagonal stripes; spiral = arc with a growing radius; digits 0 to 9 and `+ − ×` for the
  damage numbers (section 6.3).
- Shader: one TSL node `smoothstep(0.5 − w, 0.5 + w, sdf)` with `w` from screen derivatives, so the
  glyph stays crisp at 720p and at 200 % UI scale (world.md §6 rule 9, FINAL). The same node can draw
  an outline (bone-white 3:1 against the surface, world.md §5 FINAL) by a second threshold.
- `client/src/rpg/render/atlas.ts` (pure): `GLYPH_RECTS: Record<GlyphId, Rect>` read from the JSON the
  generator writes next to the PNG, and `uvOf(id)`. The glyph ids and meanings are `ux-designer`'s
  catalog (`client/src/rpg/glyphs.ts`, its section 1.2); its `shape` field names a recipe of
  `glyph-shapes.mjs` (PROPOSAL).

**Terrain glyphs** (§5.1): hatched block (Rock), black ringed circle (Chasm), snowflake (Ice), thick
waves (Mud), leaves (Thicket), chevron (Height), arrow (Slope), flame (Lava), drops (Water), spiral
(Quicksand), arrow plus digit (Vent), star (Sanctuary), crack (Corruption), lozenge (Crystal), thorns
(Brambles). 15 terrain glyphs (FINAL list from §5.1). Direction glyphs rotate with the cell (§5.1
"la direction tourne avec la case").

### 5.2 Dependencies

`ux-designer` (catalog, meanings, labels, tones, families), `art-director` (silhouettes: approve the
shapes, keep "one glyph per meaning"), `level-designer` (cell type list), `combat-designer` (status and
keyword list of §6.11), `economy-designer` (rarity list, §12), `narrative-quest-designer` (quest
markers, §16).

### 5.3 Tests

Unit (`scripts/gen-glyphs.test.ts`, `atlas.test.ts`):
- Given seed and shapes, When generated twice, Then byte-identical PNG (as `gen-assets.test.ts`).
- Given the snowflake recipe, Then the distance at the centre is inside (< 0.5 normalised) and at a
  corner of the cell is outside.
- Every glyph id of the catalog has a rect; no two rects overlap; every rect is inside the atlas.
- Every glyph's shape covers at least 15 % of its cell (TUNE: readable mass) and two glyphs of the same
  family differ on at least 20 % of their texels (TUNE: "no two glyphs share a shape within a family",
  `ux-designer` 1.2).
- The 15 terrain glyphs of §5.1 exist (integrity test reading the terrain data of `level-designer`).

E2e (R2): `e2e/terrain.spec.ts` screenshots a seeded board with one cell of each R2 type, zoomed
(`page.screenshot` clip), attached to the PR.

### 5.4 Risks

- Hand-tuned SDF shapes may look naive. Mitigation: `art-director` approves the atlas sheet (a
  generated contact sheet PNG in the PR) before R2 merges; a later hand-made atlas can replace the
  file with the same rects (the format does not change).
- 256 glyphs may run out (statuses, elements, rarities, markers, emotes, digits, cells): about 120 are
  listed today (TUNE estimate). A 2048 atlas doubles the cost to about 600 KB: decide at 200.

---

## 6. Combat VFX: the effects timeline (§6.3, §6.5, §6.6, §6.10, §6.11, §8, tech.md §5.2)

### 6.1 Timeline

- Input: the ordered `Effects` list of one action (a Move, an ability, a consumable, a terrain tick,
  §6.10 "une action"), from `combat-engineer`. Output: `Track[]`.
- Pure `client/src/rpg/render/vfx/timeline.ts`: `timeline(effects: Effect[], opts: { reducedMotion;
  clearBoard; safeMode; seed }): Track[]`.
  - **Causal order is sequential**: move and slide, then Shock, then damage numbers, then deaths and
    ejections, then terrain changes, in the order of the list (the engine's order is the resolution
    order of §6.3 "résolution atomique" and §6.10).
  - **Multi-target effects of one stage play together** with a stagger of 60 ms (TUNE) in the list's
    order (which is §6.10's: nearest first, then r, then q).
  - **Compression**: an action's whole timeline stays under 1.5 s (PROPOSAL from `ux-designer` 6.5,
    from the world.md §5 ejection bound of 1.5 s, FINAL there); past it, every track after the first
    is scaled down, and multi-hit chains play at 150 ms per extra hit (TUNE, `ux-designer`).
  - **Never holds input** (world.md §5 FINAL): a new action skips the running timeline to its end.
- Durations (all TUNE unless stated):

| Effect | Visual | Duration | Reduced motion |
|---|---|---|---|
| Move / slide | existing slide | 200 ms (FINAL today, `slide.ts`) | instant |
| Shock (§6.5) | the hit marble jolts 0.05 units along the push, a dust ring on its disc | 150 ms | dust ring only, 150 ms |
| Damage / heal number | section 6.3 | 600 ms, overlaps the next tracks | same, no rise |
| Death at 0 HP (§6.6) | crack then crumble, Remains appear | 400 ms (TUNE, §6.6) | fade 200 ms |
| Ejection | existing tumble | 800 ms (FINAL, world.md §5) | fade 400 ms (FINAL) |
| Teleport (Pas de l'ombre, Clignement, Assassinat, Danse des lames) | dissolve out, dissolve in | 120 + 120 ms | cut |
| Charge, self moves | fast slide | 40 ms per cell | instant |
| Projectile "en ligne" (§6.10) | a mote along the axis, stops at the first ball or obstacle; Crystal (§5.1) bounces it once | 40 ms per cell | a line drawn then faded, 200 ms |
| Zone (rayon r) | ring wave from the centre over the cells | 250 ms | outlines only |
| Chain (Chaîne d'éclairs) | segment from target to target | 150 ms per hop (safe mode: 340 ms per hop) | outlines only |
| Status applied | the L3 glyph scales in | 150 ms | instant |
| Terrain change (§6.10 primitive Terrain) | section 8 | 250 ms | crossfade 150 ms |
| Raise (Revenant, §8.6) | section 6.4 | 300 ms | fade 200 ms |
| Board rewind (Paradoxe, Retour, §8.7) | every moved ball slides back on its own path, a sand-gold ripple from the caster | 400 ms | instant |
| Rotation (Géomancien, §8.8) | the 7 cells and their balls turn 60° about the centre | 400 ms | instant |

**Hero ejected** (FINAL, validated decision: an ejected hero dies and the fight is lost): the ejection
tumble plays in full (800 ms), the cyan core goes out over its last 300 ms (TUNE), then the end
banner. The end banner waits for the timeline (or a skip), so the player always sees why they lost.
Same for a hero at 0 HP (death 400 ms first).

### 6.2 Death and Remains (§6.6)

- Pure `client/src/rpg/render/vfx/death.ts` (`deathTrack`, `shardPoses`): 0 to 150 ms a crack decal
  grows over the marble (atlas crack glyph projected on the sphere, TUNE), 150 to 400 ms the marble
  splits into 12 shards (TUNE) that drop to the disc and settle. The shards that settle are the
  Remains instance (one ring of shards, section 4). Glass and shell marbles crumble in their own
  material (silhouette before colour, art.md §1).
- A Revenant leaves no Remains (§6.6, TUNE there): its death track ends with the shards fading out.
- Terres Vitrifiées (§5.2: a dead ball leaves a Corruption cell): the terrain-change track follows the
  death track.

### 6.3 Damage numbers

- Pure `client/src/rpg/render/vfx/numbers.ts`: `numberGlyphs(amount, kind): GlyphId[]` and
  `numberPose(t)`: rises 0.4 units (TUNE) and fades over 600 ms (TUNE), only fades (never brightens,
  world.md §5 rule for the ejection, applied here, PROPOSAL).
- Kind is never colour alone (world.md §8 FINAL): physical numbers plain, magical with a small ring
  prefix, pure with a diamond prefix, heals with `+`, Shock 100 % larger than Shock 50 % (the two
  values of §6.5, TUNE there). Tones from `ux-designer`.
- The accessible copy is the combat log of `ux-designer` (its 6.3), not these numbers (tech.md §5.3
  FINAL: hidden DOM mirror).
- MSDF text of tech.md §5.3 is kept for longer in-scene text (frame labels); numbers use atlas digits,
  which need no font pipeline (PROPOSAL, Q6).

### 6.4 Ability VFX kits (§6.10: 12 primitives, all data, §1 pillar 6)

80 abilities (§8.0, 8 classes × 10) must not mean 80 bespoke effects (KISS). Each ability gets a VFX
**recipe** from its primitive and its element tag (§6.5: Fire, Frost, Lightning, Shadow, Light, Time are
only synergy tags):

- `client/src/rpg/render/vfx/recipes.ts`: `recipeFor(ability: AbilityDef): Recipe`, default from
  `(targeting, primitive, element)`, optional override by id in `client/src/rpg/render/vfx/
  overrides.json` (PROPOSAL; render data stays in the client, the engine's `data/` stays rules only).
- 9 kits (PROPOSAL): `projectile`, `zone-wave`, `chain`, `self-aura`, `teleport`, `heal-motes`,
  `shield-shell`, `terrain-morph`, `raise`. A kit is a short list of tracks with parameters.
- Element look (PROPOSAL, `art-director` approves): Fire = sodium orange embers; Frost = pale steel-blue
  shards (never the player cyan, Feedback G6); Lightning = bone-white jagged segments; Shadow =
  near-black smoke with a muted violet rim; Light = warm bone glow; Time = sand-gold rings; physical =
  dust in the disc colour.
- Mage reactions (§8.5): Vapeur (steam puff, Stunned glyph), Bris (shards, Weight pip lost), Explosion
  (zone-wave radius 1, sodium).
- Signature moves that get their own recipe (PROPOSAL, short list): Avalanche (4-ball group, §8.2:
  the 4 balls slide together with a heavier dust trail), Titan (§8.2: marble scales 1.15, TUNE),
  Météore (§8.5: tell zone, then a falling body over 400 ms, TUNE), Séisme and Effondrement (§8.8:
  crack decals spreading), Paradoxe (§8.7, board rewind), Armée des morts (§8.6: 3 raises at once).
- **Particles**: CPU-simulated, GPU-instanced quads on both backends (tech.md §5.1 says compute extras
  are WebGPU-only and optional; this pool needs no compute, PROPOSAL). Pool of 2,000 in the full tier,
  500 reduced, 0 in clear board (TUNE); recipes ask for a count and get what the pool gives.
  Randomness: `mulberry32(hash(fightSeed, actionIndex, effectIndex))`, client-side only (tech.md §5.2
  FINAL), so a replay looks the same.
- Clear board (world.md §8 FINAL: never removes a tell, a preview ghost or a phase notch): kits drop
  particles, glows and the wave fill, and keep outlines, glyphs, numbers and the moves themselves.
- No effect may rest over a cell, a marble or a legal target (ui.md §1 FINAL): every kit ends within
  its timeline; only state layers (decals, outlines, glyphs) persist (Feedback G12).

### 6.5 Photosensitivity flash guard (world.md §8 FINAL, tech.md §5.1 FINAL)

- Pure `client/src/rpg/render/vfx/flashguard.ts`: `schedule(tracks, safeMode): Track[]`. A track
  flagged `bright` (an onset that raises the luminance of its area: lightning, explosion, Météore
  impact, Light) counts as a flash. In safe mode (default on, world.md §11 open question 2) at most 3
  bright onsets start in any 1 s window (FINAL, world.md §8); later ones are delayed, then the timeline
  is compressed again (6.1). Outside safe mode the same cap holds for any onset larger than 25 % of the
  screen (TUNE, WCAG 2.3.1 general flash area, PROPOSAL reading).
- Bright onsets never reach full white (`#ffffff`); peak luminance is capped at the bone-white tone
  (PROPOSAL).

### 6.6 Dependencies

`combat-engineer` (the `Effects` list with explicit `from`/`to` for every moved unit, including
rewinds, rotations and teleports; unit ids; effect sources; element tags), `combat-designer` and the
class authors (ability primitives and elements in data), `ux-designer` (time budget, log, number
tones), `audio-designer` (each track has a cue id; the visual is the twin of the sound, world.md §7
FINAL), `art-director` (element looks, crumble look).

### 6.7 Tests

Unit:
- Given `[move, shock, damage, death]`, When `timeline`, Then four tracks in that order, each
  starting when the previous causal stage ends, total under 1.5 s.
- Given three damage effects of one Zone, Then the three start 60 ms apart in the list's order.
- Given 6 chain hops in safe mode, Then no 1 s window holds more than 3 bright onsets (property over
  random timelines of 1 to 20 tracks).
- Given reduced motion, Then the death track is a 200 ms fade and the ejection a 400 ms fade.
- Given clear board, Then no particle track and every outline track kept.
- Given a hero ejection followed by the fight end, Then the `end` marker starts after the ejection
  track ends (800 ms) and a skip moves it to now.
- Given the same effects and seed twice, Then identical tracks (property); Given a different seed, Then
  same tracks except the particle parameters.
- Recipes: every ability id in the class data gets a recipe (integrity test reading the data files);
  an override for an unknown id fails the test.
- `numberGlyphs(1234, 'magic')` gives the ring prefix then `1 2 3 4`.

E2e (R1, `e2e/rpg-fight.spec.ts`): a seeded skirmish where the scripted bot pushes a Fragment off;
`document.body.dataset.ejections` becomes 1; the hero-ejection fixture ends with
`body[data-over]="loss"` only after the ejection (the banner is not visible at +400 ms, visible at
+900 ms, TUNE); a key press at +100 ms shows the banner at once. Screenshot of a mid-Shock frame.

### 6.8 Risks

- The `Effects` list must carry enough data (Feedback G11); without explicit positions the renderer
  would diff states, which tech.md §3 forbids.
- 1.5 s per action with long chains may feel rushed; the cap is a TUNE value with a skip, and the
  combat log always holds the full detail.

---

## 7. Camera for fights of any size (§4.6, §6.8, §20)

### 7.1 Implementation

- Pure `frameRegion(bounds, aspect, fov): { target; distance }` in `client/src/rpg/render/frame.ts`:
  the distance that fits the region's bounding circle in the view (with `framing()` of `camera.ts` for
  a window taller than wide, FINAL today, #227).
- `DIST_MAX` of `camera.ts` (18 today) becomes `max(18, 1.3 × frameRegion(...).distance)` (TUNE), so a
  radius-8 battle royale board (§20) or a 7-tile raid (§17) can be seen whole.
- **Multi-tile** (§4.6: "une vue d'ensemble dézoomée, puis un zoom sur la région où se trouve le groupe
  sélectionné"): overview first (whole union), then on each turn of the local player a 400 ms (TUNE)
  move to `frameRegion` of the cells within 3 of the hero and its selected group (PROPOSAL reading of
  "groupe", Feedback G8); key `Z` toggles the overview (`ux-designer` PROPOSAL). Reduced motion: cuts.
- **Seams** (§4.6: no special rule): never drawn stronger than a cell edge; each tile of the union gets
  a ±4 % luminance tint shift on its discs (TUNE) so the player can tell the tiles apart without
  reading a barrier (PROPOSAL, same intent as `ux-designer` 8).
- **The Hull** (§18: 3 tiles in line, the middle board collapses in phase 2): the existing crack ticks
  of `hull.ts`, generalised as tell ticks (section 8), then the cells sink and become holes (300 ms per
  ring, TUNE).
- **The Ballast Mind** (§17, §18: 7-tile flower, one petal per player, the centre opens in phase 3):
  the centre tile starts as holes covered by a lid mesh that slides open over 1 s (TUNE) when phase 3
  starts (with its tell 2 turns before, §6.10 rule 2).

### 7.2 Dependencies

`level-designer` (unions, anchor), `encounter-boss-designer` (Hull and Ballast Mind phases and tells),
`ux-designer` (overview key, which group to follow), `client-engineer` (camera input).

### 7.3 Tests

Unit: Given the radius-4 board in a 16:9 window, Then `frameRegion` gives a distance within 5 % of
today's `resetView()` distance (13.6, FINAL today) so the classic view does not change. Given radius 8,
Then the whole bounding circle is inside the frustum (every corner cell projects inside [−1, 1]).
Given a 3-tile line, Then the target is the middle tile's centre. Given a portrait window, Then
`framing()` still applies.

E2e (R8): the Hull fixture shows all 183 cells (TUNE, derived: 3 × 61) at the start
(`window.__cellToScreen` inside the viewport for each), then `Z` switches views.

### 7.4 Risks

At radius 8 on a phone held upright, cells shrink under a usable tap size: the overview is for
reading; play happens in the zoomed region. `ux-designer` sets the minimum tap size.

---

## 8. Terrain rendering and changes (§5.1, §5.2, §6.7, §6.10, §8)

### 8.1 Implementation

- **Disc tint plus decal plus shape** per type (PROPOSAL, colours via `art-director`, section 9):

| Cell (§5.1) | Disc | Extra shape | Motion (full tier) |
|---|---|---|---|
| Normal | biome deck texture | — | — |
| Rock | hidden | hatched block 0.5 high (TUNE) | — |
| Chasm | hole, dark well | bone-white outline ring | — |
| Ice | pale steel-blue, roughness 0.15 (TUNE) | — | none |
| Mud | dark brown, roughness 1 | — | — |
| Thicket | dark green-grey | 3 low leaf cards (TUNE) | — |
| Height | raised by 0.08 (TUNE) | — | — |
| Slope | deck, darker downhill half | — | — |
| Lava | sodium orange, emissive | — | glow ±10 % at 0.5 Hz (TUNE), never a flash |
| Water | dark slate | — | ripple normal map, 0.2 Hz (TUNE) |
| Quicksand | sand | — | spiral decal turns 0.1 turn/s (TUNE) |
| Vent | deck | arrow decal + countdown ticks | — |
| Sanctuary | warm bone | — | — |
| Corruption | obsidian with a crack | — | — |
| Crystal | deck | small faceted prism, 0.3 high (TUNE) | — |
| Brambles | deck | thorn cards | — |

  All motion stops in reduced motion and clear board (world.md §8 FINAL: clear board removes flicker).
  The decal (section 5) is always drawn, 0.8 of the disc so the marble never hides it whole
  (`ux-designer` 5.1, TUNE there).
- **Timed terrain** (Mur de boucliers, Mur de flammes, Sol verglacé, Source, Prison d'os, Pont,
  Soulèvement, Rempart tellurique; §8): countdown ticks of the turns left, the `hull.ts` tick model
  (`tickOffsets`, FINAL today) moved to `client/src/rpg/render/ticks.ts`.
- **Tells** (§1 pillar 2, §5.1 Vent, Quicksand, §5.2 Tide, Rockfall, §6.7 Breach, §8 Météore, Mine
  temporelle, Effondrement, Séisme, expiring Pont): bone-white steady outline on each threatened cell
  plus the tick count (world.md §5 FINAL: "engraved glyphs and steady ring outlines ... never a halo
  or glow alone"). One generic tell layer replaces the Hull-specific code path.
- **Terrain change** track (§6.10 primitive Terrain): the disc tint crossfades in 250 ms (TUNE) and the
  shape plays its own entry: Rock rises from the disc, Chasm cracks and the disc falls (as the Hull),
  Ice creeps out from the centre, Lava glows up, Sanctuary blooms. Pont (§8.8): a new disc slides out
  beyond the edge (the region grows, section 4.1); when it expires, the reverse, and the ball on it gets
  the ejection track (§8.8: "la boule qui est dessus est éjectée").
- **Biome global rules made visible** (§5.2): Tide (§5.2 Littoral: the sea side's 5 cells become holes
  for 2 turns, tell 2 turns before) uses the tell layer then the Chasm change; Crêtes de Fer irregular
  rim (0 to 4 holes, §5.2) are holes from the start; the Well's Darkness (§5.2) is a lighting preset
  with a light pool on Sanctuaries, never darker than the 3:1 cell-edge contrast (Feedback G7).

### 8.2 Dependencies

`level-designer` (cell catalog, directions, timers, biome rules), `combat-engineer` (terrain effects
in `Effects`, tells in the view), `art-director` (colours, shapes), `ux-designer` (decal size, tick
reading, previews of terrain changes at 45 % opacity, its 5.1).

### 8.3 Tests

Unit: Given each cell type, Then `terrainLook(type)` returns a disc style, a glyph id and an optional
shape, and every type of the catalog has one (integrity). Given a Slope pointing `NE` (direction code 2,
`board.ts` FINAL), Then the decal rotation is 60°. Given a Vent with 3 turns left, Then 3 ticks.
Given reduced motion, Then `terrainMotion(type)` is none for every type. Given a Pont that expires with a
ball on it, Then the timeline has the region-shrink track and one ejection track.

E2e (R2): one seeded board per R2 type (Rock, Chasm, Ice, Mud, Lava, Sanctuary; `level-designer`
LD-04 to LD-06); a clear-board screenshot and a full screenshot; the fog spec pattern
(`e2e/fog.spec.ts`) checks that a Lava cell's mean colour stays within 10 % (TUNE) over 2 s (no
flash).

### 8.4 Risks

Lava and Water animations on many cells cost fill rate on weak GPUs: in the low tier they are static
(TUNE), in line with tech.md §5.1 ("a feature not in the tier is off").

---

## 9. Biome looks (§2, §5.2, §17, world.md §5)

### 9.1 Implementation

- §2 keeps the art direction ("la direction artistique ne change pas") and lets each biome add its own
  palette "dans ce cadre". Proposed frame (PROPOSAL, `art-director` decides): each biome has 3 colours
  of HSL saturation at most 40 % (TUNE), a lamp colour and direction, an ambient level and a fog colour;
  the player cyan `#7fd6e8`, the danger red `#ff6b5a` and the tell bone-white `#d8d4c8` stay reserved
  (FINAL, world.md §5 and art.md §1).

| # | Biome (§5.2) | Deck base | Accent | Lamp | Tag |
|---|---|---|---|---|---|
| 1 | Plaines de Lumen | `#4d5245` grey-olive | `#a9a27a` straw glass | `#e8dcc0` warm | PROPOSAL |
| 2 | Sylve de Cendre | `#3d3a36` ash | `#6b6157` | `#c9b89a` dim | PROPOSAL |
| 3 | Tourbières de Suie | `#2f3530` peat | `#56604f` | `#9fae8c` sickly | PROPOSAL |
| 4 | Dunes de Verre | `#6b5e48` sand | `#b89a64` | `#f0c890` hot | PROPOSAL |
| 5 | Crêtes de Fer | `#4a5258` steel | `#7a3b1d` rust | `#d8d4c8` | PROPOSAL (world.md colours) |
| 6 | Toundra Blanche | `#8a9096` frost grey | `#b8c0c4` | `#dfe6ea` cold | PROPOSAL |
| 7 | Littoral Mort | `#5c6466` salt | `#8c9a96` | `#c8ccc4` | PROPOSAL |
| 8 | Caldeira | `#2b2220` basalt | `#d9822b` sodium | `#d9822b` | PROPOSAL (world.md colours) |
| 9 | Terres Vitrifiées | `#1c1a1f` obsidian | `#5a4a6a` muted violet | `#a89cb8` | PROPOSAL |
| 10 | Le Puits | `#0b0d0f` base | `#3a3f44` | `#8a8f8c` very dim | PROPOSAL |
| H | Le Ballast, dungeons inside the ship | the 5 deck looks of world.md §5 | | | FINAL (world.md §5) |

- **Textures**: per biome a deck albedo and roughness of 512 px made by `gen-assets.mjs` with
  per-biome parameters (noise scale, tint, scratches), about 300 KB a biome (FINAL row of art.md for a
  deck, extended, PROPOSAL); loaded when the hero enters the zone (lazy, tech.md §9 "lazy loading"
  issue #61). Initial load carries the first biome only.
- **Lighting presets** are data (tech.md §5.1 "Each deck has a lighting preset (data, not code)",
  FINAL), `client/src/rpg/render/biomes.ts`, one hard source and a dim fill per biome.
- A contrast check per biome (unit): cell edge vs disc 3:1 (world.md §5 FINAL), danger red and tell
  bone-white 3:1 on every deck base.

### 9.2 Dependencies

`art-director` (owns the colours and the look, can change every row), `level-designer` (biome ids,
dungeon interiors of §17), `audio-designer` (the hum per biome), `ux-designer` (colourblind palettes,
world.md §8: protan, deutan, tritan and high contrast must each have a biome variant or a global
remap, Feedback G6).

### 9.3 Tests

Unit (`biomes.test.ts`): every biome of the data has a preset; every colour's saturation is at most 40 %
(TUNE); no biome colour is within ΔE 10 (TUNE) of the reserved cyan, red or bone-white; contrast checks
above. `gen-assets.test.ts`: per-biome textures are byte-stable and under 300 KB each.

E2e (R4): three biome fixtures (Lumen, Sylve, Tourbières, the R4 three per `level-designer`), one
screenshot each for the PR; `fog.spec.ts` pattern for the 3:1 edge on each.

### 9.4 Risks

Ten moods inside a tight palette may look samey. That is the art direction's call (art.md §1:
"nothing saturated outside it"); the risk is listed in Feedback G6.

---

## 10. Day, night and weather (§4.8, v2)

- `dayPhase(utcMs) = (utcMs mod 2,400,000) / 2,400,000` (§4.8: a 40 min cycle from UTC, TUNE there),
  pure, the same for everyone. Four lighting keyframes (dawn, day, dusk, night), lerped (PROPOSAL).
- Night lowers the lamp and the ambient, never the cell-edge contrast (world.md §5 FINAL); clear board
  uses flat lighting at any hour (tech.md §5.1 FINAL).
- Weather (§4.8: rain, sandstorm) only on the world view and at the board's rim (fog band of ui.md §5),
  never over a cell (ui.md §1 FINAL). Particle budget shared with section 6.4.
- Dependencies: `world-engineer` (zone weather state), `art-director`. Tests: unit `dayPhase` at 0,
  20 min, 40 min; Given night, Then the edge contrast check still passes. Phase R9 (v2).

---

## 11. Loot, chests, gathering, events (§12, §14, §20, §22)

- **Loot at the end of a fight** (§12, personal loot): each drop is a small glass cache on the cell
  where its enemy fell, with its rarity glyph (section 5) and tone; it flies to the hero in 400 ms
  (TUNE) when the fight ends. Rarity is never colour alone (§12: "une couleur et un glyphe", FINAL
  there). Legendary and above: one slow vertical light shaft for 1 s (TUNE), no flash.
- **Battle royale chests** (§20: on cells, picked by ending a Move there): an instanced chest prop
  (capacity 32, TUNE) and a pickup track of 300 ms (TUNE).
- **Gathering nodes** (§14: 0 to 3 per tile, rich veins ×3): node props on the world tile (section 1
  props layer, one kind per resource family); the 3 s harvest channel (§14, TUNE there) is a bone-white
  arc filling around the hero on the map; an aggro interrupt (§14) breaks it (arc shatters, 200 ms,
  TUNE); a harvested node is drawn spent until it respawns for that player (§14, per-player state from
  `world-engineer`). Rich veins: a slow shimmer at 0.5 Hz, ±10 % (TUNE).
- **Events and world bosses** (§18, §22): a marker glyph and a tile outline in the event's tone; the
  remaining time as ticks on the marker (TUNE).
- Dependencies: `economy-designer` (rarities), `world-engineer` (nodes, events), `ux-designer` (glyphs),
  `audio-designer`. Tests: unit `lootTrack(drops)` order is the drop order; `rarityLook` has a glyph
  for each rarity of §12 (6 rarities, FINAL list there); harvest arc fraction at 1.5 s of 3 s is 0.5.

---

## 12. Performance budget and harness (tech.md §5.5, §24.5)

### 12.1 Budget per scene (all TUNE under the FINAL caps of section 0.3)

| Scene | Draw calls | Triangles | Instances (max) | Notes |
|---|---|---|---|---|
| Classic board (Mess) | 25 | 60 k | 61 cells, 28 marbles | today about 100 calls |
| RPG board radius 4 | 40 | 120 k | 61 cells, 32 marbles | all layers on |
| Battle royale radius 8 | 40 | 200 k | 217 cells, 60 marbles | §20 |
| Raid, 7 tiles | 40 | 250 k | 427 cells, 128 marbles | §17, §18 |
| World view | 30 | 150 k | 469 tiles, 1,400 props, 512 markers | section 1 |
| Map view (M) | 10 | 50 k | 10,981 flat tiles | section 1.2 note |
| Unfold | 60 | 250 k | world + board at once | 1.2 s only |

- Marble geometry: the sphere of 32 × 16 segments (FINAL today) costs about 1,000 triangles; at 128
  marbles that is 128 k. A second, 16 × 8 sphere for distances past 25 units (TUNE) keeps raids under
  budget (one more draw call per marble layer).
- Post chain unchanged (tech.md §5.1 FINAL); the fog span uses the region radius (section 4.1).
- No allocation in the frame loop: layers, tracks and particle pools are preallocated (unit tests pass
  frozen arrays where possible).

### 12.2 Map view (key M, §4.2)

All 10,981 tiles as flat hexes (2 triangles each with an index buffer: about 44 k triangles, TUNE) in
one `InstancedMesh`, an orthographic camera, zone borders as one line mesh, discovery percent per zone
as DOM text (`ux-designer`). The 3D world view pauses while the map is open (PROPOSAL).

### 12.3 Harness

- `client/src/rpg/render/perf.ts` (pure): `perfReport(samples: FrameSample[]): { p50; p95; maxCalls;
  maxTris }` and `withinBudget(report, budget): Breach[]`.
- `window.__perf()` debug hook (same pattern as `window.__cellToScreen`): last frame's
  `renderer.info.render.calls`, `triangles`, frame time, JS heap when the browser exposes it.
- Stress scenes behind URL flags, built from fixtures: `?scene=stress-board` (radius 4, every layer,
  2,000 particles), `?scene=stress-raid` (7 tiles, 128 marbles), `?scene=stress-world` (window full,
  props max).
- `e2e/perf.spec.ts`: **hard gate** on draw calls and triangles (deterministic, CI-safe), **soft
  report** on frame times (CI has no GPU, tech.md §5.5 "reported, soft gate until Phase 1", and bug
  #216: software WebGL). The report goes to the test output and the nightly report.
- The asset size gate of art.md (5 MB initial) extended: `bun run build` output checked by a unit test
  over `dist/` sizes per biome pack (PROPOSAL, `tech-lead`).

### 12.4 Dependencies and risks

`tech-lead` (CI time, nightly report), `qa-engineer` (perf scenes in the nightly), `client-engineer`
(debug hooks). Risk: frame-time numbers from headless CI are meaningless; only call and triangle counts
gate, real frame times come from a manual run on a reference laptop noted in the PR (PROPOSAL).

---

## Feedback on the gameplay spec

Rendering-side contradictions and gaps. The plan is not modified; each item needs an owner's answer
or a change in the R0 docs PRs.

- **G1. Tile outline vs board outline (§4.1, §4.5).** "1 case du monde = 1 tuile" and "la tuile se
  déplie en plateau" assume the world hex and the board match. On the §4.1 lattice the regular tile
  hexagon is turned −3.67° against the board's outline (section 0.2) and the board's rim is jagged
  against it. The plan should say which outline the world draws (proposed: the regular hexagon, the
  unfold turns +3.67°). `level-designer` quotes 26.3°, the neighbour angle, which is not the outline
  turn.
- **G2. "En mouvement réduit, on n'anime qu'un seul plan" (§4.5) is ambiguous**: one camera shot, one
  plane, one layer? Proposed reading: a single cut (a 300 ms cross-fade, no camera move), as
  `ux-designer` proposes too.
- **G3. No return transition (§4.5, §6.1, §6.7, §6.12).** The plan describes the unfold only: nothing
  for the end of a fight, a flee, a defeat (back to a Beacon), entering a dungeon, a dungeon room
  cleared, or a boss retry (which must take under 5 s). Proposed in section 3.
- **G4. Board size vs tile size (§4.5, §6.8).** A skirmish board is radius 3, smaller than its tile;
  party boards are radius 5, larger. "The tile unfolds into the board" needs a rule for the missing or
  extra ring (proposed with `level-designer`: global terrain, the extra ring comes from the
  neighbours).
- **G5. Colour codes that break the palette (§4.4, §5.3, §12).** Monster level tiers grey, green,
  yellow, orange, red; Champion "bleu" and Elite "jaune"; Diablo-like rarity colours. world.md §5 and
  art.md §1 allow nothing saturated outside the palette and keep red for danger only. A palette
  `Decision` is needed (proposed: desaturated ramps plus mandatory glyphs, the colours as a secondary
  cue only).
- **G6. Biome nature colours vs reserved colours (§2, §5.1, §5.2).** Water and Ice are naturally cyan
  and blue, which is the player's reserved light; Lava is naturally red, which is reserved for danger.
  §2 says the biome palettes stay "dans ce cadre" without saying how. Also the colourblind palettes of
  world.md §8 now need 10 biome variants. Proposed in section 9.
- **G7. Darkness and night vs legibility (§4.8, §5.2 Le Puits "Obscurité", §4.8 sandstorm).** A visual
  darkness or a sandstorm would break world.md §5 ("cells and marbles must stay legible in every
  lighting state", FINAL). The plan should state that these are rule effects (range −1) shown by a
  glyph and a mood, never by hiding cells.
- **G8. "Le groupe sélectionné" (§4.6)** can mean the party or the selected marble group. Proposed:
  the local player's hero and selected group, with an overview toggle.
- **G9. Pack patrols are undefined (§4.3 "patrouille sur 3 tuiles", §4.4 aggro).** No timing, path or
  seed is given. In a P2P party the drawn position and the aggro check must be the same on every peer,
  so the patrol must be a pure function of (world seed, pack id, UTC time or party clock), owned by
  `world-engineer`; the renderer only interpolates.
- **G10. "Le plateau réutilise le rendu actuel" (§24.5) understates the work.** The current board
  draws one `Mesh` per disc, marble, ring and tick, rebuilds them on every move, hard-codes
  `RADIUS = 4` and the 61-cell bridge array, and finds cells by linear search. Adding HP arcs, pips,
  statuses, intents, terrain and radius 8 or 7-tile boards needs instanced layers and a region model
  first (GTA-02, GTA-03), even for R1 (a skirmish is radius 3, §6.8).
- **G11. The `Effects` list is not specified for the RPG (§24.2 "renvoie des Effects (le contrat de
  rendu actuel)").** The current contract covers slides, pushes and ejections. The RPG needs per-unit
  ids and explicit from/to for every moved unit (including Paradoxe and Retour rewinds, Rotation,
  teleports, the Pont), Shock and damage amounts with type and element, deaths, raises, terrain
  changes with durations, statuses on and off, tells set and fired, the fight end. Without it the
  renderer would have to diff states, which tech.md §3 forbids.
- **G12. VFX over cells vs ui.md §1 ("no effect may touch a cell, a marble or a legal target").**
  Ability VFX (projectiles, zones, chains) necessarily cross cells. Proposed reading: the rule binds
  persistent effects and chrome; transient action VFX are allowed during their timeline, and only state
  layers persist. To confirm in the R0 docs PR touching ui.md.
- **G13. No time budget for an action's animation (§6.3, §6.6).** Death is 400 ms (§6.6), the ejection
  800 ms (world.md §5), and one action can chain a Shock, a death, an ejection, terrain and an
  elemental reaction, or 4 hits (Danse des lames). The plan sets no cap; `ux-designer` proposes 1.5 s
  with compression and skip, used here.
- **G14. Hero death ends the fight "aussitôt" (§6.3, §6.6).** The rule is instant; the display must
  still show the ejection or the crumble before the defeat banner (section 6.1), or the most important
  event of the fight is never seen.
- **G15. Battle royale player count (§6.8 vs §20).** The §6.8 table says "5 joueurs" for the battle
  royale, §20 says 6 (and the existing spec says 6). Rendering capacity uses 6 × 10 = 60 marbles.
- **G16. Glyph under a marble (§5.1 "un glyphe obligatoire", §6.6 Dépouille).** A terrain glyph or a
  Remains on an occupied cell is hidden by the marble from above; the plan does not say how it stays
  readable. Proposed (with `ux-designer` 5.1): decals at 0.8 of the disc, wider than the marble
  footprint.
- **G17. The hub is not placed (§4.1 "plus le hub", §5.2 row H, §21).** The Ballast is a biome row and
  a set of rooms; whether it is tiles on the world map (drawn by the world renderer) or a separate scene
  (the existing decks) is not said. `SPEC.md` §4 still calls the hub a room graph (#50).
- **G18. Party movement on the map (§4.7).** "The leader manages the group's position on the map":
  does the party walk as one ball, or as 4 balls that follow? It changes what is drawn and synced.
- **G19. The Pont grows the board at run time (§8.8) and Rotation needs 6 neighbours (§8.8).** Both
  are fine for the renderer (section 4.1 `grow`), but the plan's "Board passe à un masque" (§24.2)
  should say the mask can change during a fight, or the client will assume a fixed region.

## Open questions

- **Q1.** World tile outline: the regular hexagon turned −3.67° (and a +3.67° turn in the unfold), or
  the exact jagged 61-cell outline? (`level-designer`, `art-director`)
- **Q2.** Palette `Decision` for level tiers, Champion and Elite, rarities and the 10 biomes, and how
  the colourblind palettes extend to them. (`art-director`, owners)
- **Q3.** Clear-board mode: does it remove all particles (proposed) or only those over the board?
- **Q4.** Should the glyph atlas be generated from SDF primitives in code (proposed), or hand-made in a
  free tool and committed? The atlas format is the same either way.
- **Q5.** Fold-back duration and whether a won fight shows the loot drop before folding (proposed:
  loot 400 ms, then a 600 ms fold).
- **Q6.** Damage numbers from atlas digits (proposed) or the MSDF text of tech.md §5.3?
- **Q7.** Perf gate: is a hard gate on draw calls and triangles in the e2e suite acceptable, with frame
  times only reported? (`tech-lead`)
- **Q8.** Who splits `main.ts` into scenes: this role (GTA-02, the board layers) or `client-engineer`?
  Proposed: GTA-02 here, with `client-engineer` reviewing the wiring, and nothing else in that PR.
- **Q9.** World camera azimuth: follow the 26.33° tile lattice (rows look horizontal) or keep the
  board's 0° (rows look diagonal)?
- **Q10.** Does the hub use the world renderer (tiles) or the existing deck scenes? (G17)

## Tasks

One PR each, in the order of the roadmap (§25). IDs are local to this spec (GTA = graphics technical
artist); the lead agent turns them into `Task` issues. Every code task follows CONTRIBUTING: failing
test first, 100 % coverage of the pure modules (added to `coverage.include`), one e2e run, a screenshot
in the PR for any visible change.

### GTA-01 Rendering delta for tech.md §5 and art.md (R0)
Outcome: tech.md §5 and art.md say how the RPG renders (instanced layers, glyph atlas, unfold, VFX
timeline, budgets per scene, biome packs), with the open questions linked to #313.
- [ ] tech.md §5.5 gains the per-scene table of section 12.1 and the instance capacities.
- [ ] art.md §2 gains rows for the glyph atlas, biome packs and procedural props.
- [ ] Feedback G1 to G19 posted on the R0 Decision or its docs Tasks.
- [ ] Docs-only PR, merged by @TidyMaze (admin bypass).

### GTA-02 Instanced board layers for the classic modes (R1)
Outcome: the current board draws discs, marbles, rings, ticks and ghosts as instanced layers from a
pure fill function, with no visible change and about 25 draw calls.
- [ ] `rpg/render/layers.ts` (pure) and `rpg/scene/board.ts` (glue); `refresh()` reuses buffers.
- [ ] `window.__perf()` hook; every existing e2e spec green on Chromium.
- [ ] Before and after screenshots identical to the eye; `__perf().calls` under 25 (TUNE).
- [ ] TSL per-instance attribute spike checked on WebGPU and WebGL2 (`?backend=webgl`).

### GTA-03 Region-aware board and camera (R1)
Outcome: the board renders any cell mask from the bridge (radius 3 to 8, unions), with the camera
distance and the fog span following the region.
- [ ] `rpg/render/region.ts` with O(1) lookup, `grow`, `shrink`; `frame.ts` `frameRegion`.
- [ ] `camera.ts` `DIST_MAX` and `quality.ts` fog span from the region (classic view unchanged, test).
- [ ] e2e: a radius-3 skirmish fixture and a radius-8 fixture fully in view.

### GTA-04 SDF glyph atlas and billboard layer (R1)
Outcome: one generated SDF atlas and one instanced glyph layer draw every glyph of the catalog, crisp
at 720p and 200 % scale.
- [ ] `scripts/gen-glyphs.mjs`, `glyph-shapes.mjs`, tests (byte-stable, coverage, family distinctness).
- [ ] `rpg/render/atlas.ts`; the R1 glyphs of `ux-designer` (Edge danger, intent, hero, digits).
- [ ] Contact sheet PNG in the PR for `art-director`.

### GTA-05 Marble overlays: HP arc, shield arc, Weight pips, hero mark (R1)
Outcome: every unit shows its HP arc, shield, Weight pips and hero band from the `CombatView`, in one
draw call per layer.
- [ ] TSL arc-cut node on both backends; `hparc.ts` pure fractions.
- [ ] Pips with outlined temporary Weight; hero core dims per Loss and goes out on death.
- [ ] e2e pixel check of a damaged vs full arc; screenshot.

### GTA-06 Combat VFX timeline v1: Shock, numbers, death, hero ejection (R1)
Outcome: an action's `Effects` play as a skippable timeline under 1.5 s, with Shock, damage numbers,
the 400 ms crumble with Remains, and the hero ejection before the defeat banner.
- [ ] `vfx/timeline.ts`, `death.ts`, `numbers.ts`, `flashguard.ts` (pure, 100 %).
- [ ] Reduced-motion and clear-board variants; same effects and seed give the same tracks.
- [ ] e2e: hero-ejection fixture, banner after the ejection, skip on key.

### GTA-07 Perf harness and stress scenes (R1)
Outcome: CI fails when a scene passes its draw-call or triangle budget, and frame times are reported.
- [ ] `rpg/render/perf.ts`, `?scene=stress-board`, `e2e/perf.spec.ts` (hard counts, soft times).
- [ ] Budget table values read from one constants file shared with tech.md.

### GTA-08 Terrain layer: the six R2 cell types (R2)
Outcome: Rock, Chasm, Ice, Mud, Lava and Sanctuary render with their disc, shape, glyph and motion,
static in reduced motion and clear board.
- [ ] `terrainLook` table and integrity test over the cell data.
- [ ] Lava no-flash e2e (colour stays within 10 %, TUNE); screenshots.

### GTA-09 Tells, countdown ticks and terrain changes (R2)
Outcome: one generic tell layer (outline plus ticks) and terrain-change tracks replace the Hull-only
code path, and the Hull boss looks the same.
- [ ] `rpg/render/ticks.ts` from `hull.ts`; terrain-change tracks; ice slide without roll.
- [ ] Existing `boss.spec.ts` green; new e2e for a timed wall.

### GTA-10 Ability VFX kits and particle pool (R2)
Outcome: every ability of the 4 R2 classes plays a recipe from its primitive and element, with a
particle pool that degrades by tier.
- [ ] `vfx/recipes.ts`, `overrides.json`, 9 kits, Mage reactions, signature moves of the 4 classes.
- [ ] Integrity test: every ability id has a recipe; safe-mode flash property test.

### GTA-11 Status, intent and Preparation glyphs on the board (R2)
Outcome: the L3 top slot, intents with their target line, and armed Preparations render from
`ux-designer`'s `layersOf`.
- [ ] Billboard placement, "+N" digit, intent line to the target cell.
- [ ] e2e: a monster intent fixture shows its glyph and line; screenshot.

### GTA-12 World map renderer (R4)
Outcome: the world view draws a 469-tile window with biome tints, exploration fog, procedural props
and markers in under 30 draw calls.
- [ ] `rpg/world/tiles.ts`, `props.ts`, `fog.ts`; `rpg/scene/world.ts`; floating anchor.
- [ ] e2e `world.spec.ts`; screenshot.

### GTA-13 Hero travel, packs and Beacons on the map (R4)
Outcome: the hero ball rolls along the path at the step times of §4.2, slides on ice, teleports at
Beacons, and packs and party balls show where the world state says.
- [ ] `rpg/world/travel.ts` poses; time-based under automation.
- [ ] e2e: walk 3 tiles, `data-hero-tile` matches.

### GTA-14 Tile-to-board unfold and fold back (R4)
Outcome: entering a fight unfolds the tile into the board in about 1.2 s (cross-fade in reduced
motion, skippable), and the board folds back at the end.
- [ ] `rpg/world/unfold.ts` plans and poses for radius 3, 4, 5 and unions; `scene/transition.ts`.
- [ ] e2e phases `world`, `unfold`, `placement`; skip; reduced motion; screenshots.

### GTA-15 Three biome looks (R4)
Outcome: the three R4 biomes have their palette, generated deck textures and lighting preset, loaded
lazily under 300 KB each.
- [ ] `rpg/render/biomes.ts` with palette and contrast tests; `gen-assets.mjs` per-biome parameters.
- [ ] One screenshot per biome.

### GTA-16 Map view (R4)
Outcome: key M shows all tiles flat with fog states, zone borders and markers in under 10 draw calls.
- [ ] Ortho view, one instanced flat-hex layer, zone border lines; the world view paused.
- [ ] e2e: open and close the map; screenshot.

### GTA-17 Loot drops and rarity looks (R5)
Outcome: loot appears where enemies fell with its rarity glyph and flies to the hero at the end of the
fight.
- [ ] `lootTrack`, `rarityLook` with 6 rarities; no-flash shaft.

### GTA-18 Gathering nodes and harvest channel (R7)
Outcome: nodes show on tiles, the 3 s harvest arc fills and breaks on aggro, spent nodes look spent.
- [ ] Node prop kinds; harvest arc; rich-vein shimmer static in reduced motion.

### GTA-19 Multi-tile fights and boss geometry (R8)
Outcome: unions of 2 to 7 tiles render with overview and region zoom, tile tint shifts, the Hull's
middle collapse and the Ballast Mind's opening centre.
- [ ] `frameRegion` on unions, `Z` overview; Hull and flower fixtures in e2e.
- [ ] `stress-raid` under budget in `perf.spec.ts`.

### GTA-20 The remaining nine cell types (R9)
Outcome: Thicket, Height, Slope, Water, Quicksand, Vent, Corruption, Crystal and Brambles render with
glyphs, shapes and their motion rules.
- [ ] `terrainLook` complete; Crystal bounce in the projectile kit.

### GTA-21 The seven remaining biome looks and the Well's darkness (R9)
Outcome: all 10 biomes have looks inside the palette frame, and the Well's darkness keeps 3:1 cell
edges.
- [ ] Palettes, textures, presets, contrast tests for 7 biomes; screenshots.

### GTA-22 VFX for the four R9 classes (R9)
Outcome: Necromancer raises and Revenants, Chronomancer rewinds, Geomancer Rotation, Pont and Séisme,
and Assassin teleports play their recipes.
- [ ] Rewind and rotation tracks from explicit `Effects` positions; Revenant accent; Pont grow and
  shrink.

### GTA-23 Day, night and weather (R9, v2)
Outcome: the world lighting follows the 40 min UTC cycle and zone weather, never below the legibility
rule.
- [ ] `dayPhase`, four keyframes, weather particles at the rim only; contrast test at night.

### GTA-24 Party, presence, arena and battle royale rendering (R10)
Outcome: party balls with slot glyphs, hub presence with emotes and pings, the radius-8 battle royale
board with chests, and arenas render within budget.
- [ ] Slot glyphs, emote bubbles, ping ring; chest prop and pickup; `stress-br` perf scene.
- [ ] Two-tab e2e (`network-engineer` fixture) with a screenshot.
