# Level design: implementation spec (role `level-designer`)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, pending). Source of truth:
the validated French gameplay spec (`docs/specs/rpg/plan.fr.md`, same text as the approved plan).
Section numbers like "§5.1" point to that gameplay spec. This file adds no game rule of its own on top
of it: it says how to build the hex world, the biomes, the cell types, board generation, dungeons and
multi-tile fights, and lists what is missing or contradictory (section 21). No code yet: TDD applies
from R1 (CONTRIBUTING section 11).

Tags, as in `rules.md`: **FINAL** (decided), **TUNE** (starting value, set by playtests and the bot
ladder), **PROPOSAL** (proposed here, an owner confirms). Every number below carries one. A number
copied from the gameplay spec keeps its tag there: the gameplay spec says "everything is PROPOSAL and
every number is TUNE unless stated", so most copied numbers are TUNE. Validated decisions of #313
(science-fantasy, Diablo-like P2P with a party of 4 at most, hero plus squad, an ejected hero dies and
the fight is lost, deterministic combat, weighted push `n > m` AND strictly greater total Weight, at
most 1 ejection per action) are FINAL here.

---

## 0. Scope

In scope (this role owns the data, the pure functions and their tests):

- The board **region** (the cell mask of §24.2) and the **terrain layer** in `abalone-core`, including
  removing the `MAX_RADIUS` scans (§24.1, §24.2).
- The **hex world**: coordinates, the tile-to-board tiling, tile seeds, zones, biomes and tile levels
  (§4.1, §5.2, §26 Q3).
- **Tile content** rolls and authored landmarks: packs on the map, nodes, chests, puzzles, NPCs,
  outposts, Beacons, dungeon entrances, boss lairs, event anchors (§4.3, §4.2, §17, §18, §22).
- **World travel**: A*, step time, ice slide on the map, fog, discovery percentage, out-of-combat HP
  regeneration, Beacon activation and travel (§4.2).
- **Engagement on the map**: pack patrol, aggro radius, which tile unfolds (§4.4, §4.5).
- The **cell catalog** of §5.1 (16 kinds) and the exact rule of each cell, written as pure functions
  that `combat-engine` calls at its hook points.
- **Biome tables** and **biome global rules** (§5.2).
- **Board generation** from a tile: region, terrain, constraints, start zones, formations geometry
  (§4.5, §6.1, §6.8).
- **Multi-tile fights**: stitched unions, anchor coordinates, start zones on tiles (§4.6, §6.8, §18).
- **Anti-stalling geometry**: Breach rings on any region, the "edge" for flight (§6.7).
- **Dungeon maps**: plan format, seeded variations, rooms, mid Beacon, boss arenas (§17).
- **Day, night and weather schedules** (§4.8, v2).
- **Symmetric boards** for PvP and battle royale (§4.5, §19, §20).

Out of scope (see "Dependencies" in each section): the turn structure, weighted push, damage,
statuses, abilities (`combat-engine`, `class-designer`); monsters, packs composition, bosses and their
mechanics, Mythic difficulty math (`encounter-boss-designer`); loot and currencies (`loot-economy`);
gathering node content (`gathering-crafting`); quests, puzzles content, tutorial lessons
(`narrative-quest-designer`); rendering, camera, HUD (`client-ui`, `ux-designer`); P2P sync
(`netcode`); arenas and battle royale rules (`pvp-br-designer`).

Other role files name this role `world-generator` or `world-generation`: it is the same role.

Role slugs used for dependencies (assumed names, the lead maps them to the real roles):

| Slug | Owns |
|---|---|
| `combat-engine` | `abalone-rpg`: `CombatState`, units and occupants, `apply_action`, weighted push, Shock, damage, statuses, turn and round structure, ejection allowance, victory, state hash |
| `class-designer` | Classes, abilities (including the terrain-making ones), Fragments |
| `stats-progression` | Hero stats, `g(L)`, VIT, levels, Élan unlock, hero save |
| `encounter-boss-designer` | Monsters, pack composition, threat, elites, bosses, boss arenas content, Mythic affixes and keys |
| `ai-engineer` | Search on the combat state, node budgets, bot ladder |
| `loot-economy` | Chest content, Lueur cost of Beacon travel, durability |
| `gathering-crafting` | Node types, yields, node respawn timers |
| `narrative-quest-designer` | Quests, puzzles (`puzzle.rs`), tutorial camp lessons, NPC roles, events content, Codex |
| `ux-designer` | Glyph catalog, previews, readability rules |
| `client-ui` | World scene, board decals, camera, unfold animation, Playwright e2e of the client |
| `netcode` | Party, lockstep, commit-reveal seeds, party position on the map |
| `pvp-br-designer` | Duels, arenas, battle royale seats and rules |
| `art-audio` | Biome palettes, cell decal art, tile meshes |
| `tech-lead` | Crate layout, data format (RON or JSON), shared `rng` module, WASM bridge conventions |

---

## 1. Inputs read

- Gameplay spec, every section; in detail §1, §2, §4 (all), §5 (all), §6.1 to §6.12, §8 (terrain
  abilities: Mur de boucliers, Source, Mur de flammes, Sol verglacé, Zéro absolu, Prison d'os, all of
  the Géomancien), §11, §14, §17, §18, §19, §20, §22, §24, §25, §26.
- `SPEC.md` (§2 core rules, §4 phase 5 hub), `CONTRIBUTING.md` (sections 6, 11, 13),
  `docs/specs/rules.md` (§1 board and directions, §2 layouts, §4 and §5 moves and sumito, §8 edge
  cases, §10.3 hooks, §10.4 battle royale and OPEN-5), `docs/specs/world.md` (§1 decks, §5 palette,
  glyph and contrast rules, §8 accessibility), `docs/specs/game-design.md` (§3.5 hub, §5
  anti-stalling, §7 bosses), `docs/specs/tech.md` (§3 crate, §7 AI), `docs/specs/boss-balance.md`.
- The other role files already written: `encounter-boss-designer.md` (tile level, Hull triangle,
  flower raid, group budgets), `narrative-quest-designer.md` (tutorial camp of 7 tiles, puzzle tiles),
  `ux-designer.md` (terrain decals, ice slide preview, world readability, F16 placement gap).
- Code: `crates/abalone-core/src/board.rs` (`Board`, `HashMap` storage, `with_radius`, `void`,
  `cracks`, `converted`, `MAX_RADIUS = 5`), `moves.rs` (`legal_moves`, `apply`, `Direction`),
  `game.rs` (history, repetition), `search.rs`, `encounter/*.rs` (`hull.rs` splitmix64 `mix`,
  `ballast.rs` radius 5 and void pillars, `choir.rs` radius 3), `crates/abalone-wasm/src/lib.rs`
  (`cells()` in r then q order, radius 4 only), `client/src/daily.ts` (UTC seed).

What the code tells this spec:

1. `Board` stores cells in a `HashMap`, but **never iterates it**: every scan in `moves.rs`,
   `game.rs`, `search.rs` and `encounter/*.rs` loops over `-MAX_RADIUS..=MAX_RADIUS` (q outer, r inner)
   and calls `get`. The scan order is therefore already deterministic. The real blocker for radius 8
   and multi-tile unions is the hard `MAX_RADIUS` bound in about 25 scan loops (feedback F27).
2. The move order of `legal_moves` decides search tie-breaks, so the classic boss fixtures
   (`tests/boss_fixtures.rs`), the ladder and the daily challenge depend on it. The region refactor
   must keep the classic scan order (q ascending, then r ascending) bit for bit.
3. `Board::void` removes a cell for good. The RPG needs timed Gouffres (Effondrement, Marée, Séisme,
   Brèche) and a Gouffre that a Pont can fill, so the RPG Gouffre is a terrain kind, not a removal
   (feedback F9). `void` stays for the classic modes.
4. There is no perft test today. §6.4 asks for "même perft": the region PR adds one.
5. The WASM bridge already lists cells in r then q order for radius 4. The RPG bridge reuses that
   order, which is also the canonical order of §24.1.

---

## 2. Conventions used by every section

- **Integers only** (§24.1, FINAL). Percentages and shares are basis points (bp, 10 000 = 100 %).
  Multiply in the order written, floor after each step unless "round" is written; "round" means round
  half up: `(a × b + 5 000) / 10 000`.
- **Two orders, kept apart** (PROPOSAL):
  - *Canonical order* for every RPG rule and every generator pick: r ascending, then q ascending
    (§24.1, §6.10). Written `canon`.
  - *Classic scan order* (q ascending, then r ascending) only inside `legal_moves` and the classic
    search, so classic outputs never change (section 1, point 2).
- **Seeds** (PROPOSAL): `mix` is the splitmix64 finaliser of `encounter/hull.rs`, moved to a shared
  `abalone-core/src/rng.rs` (`tech-lead`, also asked by `encounter-boss-designer`).
  `h(a, b, ...) = mix(... mix(mix(a) ^ b) ...)`; a signed coordinate enters as
  `((q as u32 as u64) << 32) | (r as u32 as u64)`. Never `HashMap` iteration, never a clock inside a
  fight, never a float in world generation (world generation is shared by every peer).
- **Data** (§1 pillar 6, §24.3): all content is data under `data/`, loaded with `include_str!`.
  Examples are RON; if `tech-lead` picks JSON the fields stay the same.
- **Coordinates**: axial `(q, r)` with the directions of `rules.md` §1 (E, NE, NW, W, SW, SE, FINAL).
  World tiles use the same convention at their own scale (§4.1, FINAL).
- **Files** (new unless noted):

| File | Content |
|---|---|
| `crates/abalone-core/src/region.rs` | `Region` (dense cell mask), `coords()`, `canon()`, `boundary()`, `peel()`, `rot60()`, `reflect()` |
| `crates/abalone-core/src/terrain.rs` | `CellKind`, `TerrainCell`, `TerrainMap`, Roc and Gouffre predicates, Pente Weight modifier, `slide()` |
| `crates/abalone-core/src/rng.rs` | `mix`, `h` (moved from `encounter/hull.rs`, `tech-lead`) |
| `crates/abalone-core/src/board.rs` (changed) | `Board` backed by a `Region`, no `MAX_RADIUS` |
| `crates/abalone-rpg/src/terrain_rules.rs` | Cell rules that touch units (Lava, Water, Sanctuary, Corruption, Quicksand, Vent, Brambles, Thicket, Height, Crystal, Mud) as pure functions returning effects |
| `crates/abalone-world/src/tiling.rs` | Tile to combat coordinates, `tile_of`, tile seed, tile unions |
| `crates/abalone-world/src/map.rs` | World generation: zones, biomes, levels, ring positions |
| `crates/abalone-world/src/content.rs` | Tile content rolls, landmarks, spacing rules |
| `crates/abalone-world/src/travel.rs` | A*, step time, ice slide, fog, discovery, regen, Beacons |
| `crates/abalone-world/src/engage.rs` | Patrol, aggro, fight request |
| `crates/abalone-world/src/boardgen.rs` | `BoardSpec` from a tile or a tile union |
| `crates/abalone-world/src/zones.rs` | Start zones and formations geometry |
| `crates/abalone-world/src/dungeon.rs` | Dungeon plans, instance generation, run state |
| `crates/abalone-world/src/sky.rs` | Day, night and weather schedule (v2) |
| `crates/abalone-world/src/save.rs` (tile part) | World flags: discovered, cleared, opened, activated |
| `data/terrain/cells.ron` | The 16 cell kinds |
| `data/biomes/<id>.ron` | One file per biome: shares, global rules, step cost |
| `data/world/world.ron` | World version, seed, radius, zones, hub, landmarks |
| `data/world/content.ron` | Tile content weights and spacing rules |
| `data/formats/*.ron` | Board radius, zone sizes, formations per combat format |
| `data/dungeons/<id>.ron` | One plan per dungeon |

---

## 3. Board region and terrain layer in `abalone-core` (§24.1, §24.2, §5.1)

### 3.1 `Region`

**Implementation.**

```rust
pub struct Region {
    q0: i32, r0: i32, w: u32, h: u32, // bounding box with a 1-cell margin (for Pont, §8.8)
    inside: Vec<bool>,                // row-major: index = (r - r0) * w + (q - q0)
    count: u32,
}
impl Region {
    pub fn hex(radius: u32) -> Self;                  // any radius, 0 to 8 tested
    pub fn from_cells(cells: &[(i32, i32)]) -> Self;  // unions, dungeon rooms
    pub fn contains(&self, c: (i32, i32)) -> bool;
    pub fn add(&mut self, c: (i32, i32)) -> bool;     // only next to the region (Pont)
    pub fn remove(&mut self, c: (i32, i32));
    pub fn coords(&self) -> impl Iterator<Item = (i32, i32)>; // classic order: q, then r
    pub fn canon(&self) -> impl Iterator<Item = (i32, i32)>;  // canonical: r, then q
    pub fn boundary(&self) -> Vec<(i32, i32)>;        // cells with a neighbour outside, canon order
    pub fn peel(&self, layer: u32) -> Vec<(i32, i32)>;// cells at distance `layer` from the outside
    pub fn len(&self) -> u32;
}
pub fn rot60(c: (i32, i32), k: u8) -> (i32, i32);    // (q, r) -> (-r, q + r), k times
pub fn reflect(c: (i32, i32)) -> (i32, i32);          // (q, r) -> (-q, -r)
pub fn dist(a: (i32, i32), b: (i32, i32)) -> u32;     // hex distance
```

- A dense `Vec` over a bounding box is the simplest structure that is fast (`get` is one index), has a
  fixed iteration order and supports arbitrary masks (radius 8, flower of 7 tiles: 427 cells in a
  box of about 29 × 29, PROPOSAL). No `HashMap`, no `BTreeMap`.
- `add` is limited to a cell adjacent to the region, so a margin of 1 is enough (Pont "ajoute une case
  au-delà du bord", §8.8). A second `add` beyond an added cell is refused (PROPOSAL).

**`Board` change.** `Board { region: Region, cells: Vec<Cell>, cracks, converted }`. `with_radius`
loses its `MAX_RADIUS` limit. `void` calls `region.remove`. Every scan
`for q in -MAX_RADIUS..=MAX_RADIUS { for r in ... }` in `moves.rs`, `game.rs`, `search.rs` and
`encounter/*.rs` becomes `for (q, r) in board.coords()`, which yields the same cells in the same
order. `MAX_RADIUS` is deleted; `ballast.rs` drops its compile-time assert.

**Dependencies.** `combat-engine` builds occupants (camp and unit id per cell, §24.2) on top of
`Region`; `tech-lead` reviews the API; `ai-engineer` checks search speed.

**Tests (strict TDD).**

- Given `Region::hex(r)` for r in 0..=8, Then `len` is `3r(r+1)+1` (1, 7, 19, 37, 61, 91, 127, 169,
  217) and every cell satisfies `max(|q|,|r|,|q+r|) <= r`.
- Given `Board::with_radius(r)` for r in 0..=5, Then it equals the old board cell for cell (golden
  list kept in the test).
- Given the classic standard start, When `legal_moves` runs, Then the list is identical, element for
  element, to a golden list recorded before the refactor (classic order kept).
- New perft (§6.4): perft(1..=3) from the standard and Belgian daisy starts, golden counts recorded
  before the refactor and unchanged after.
- Every `tests/boss_fixtures.rs` fixture replays to the same result; the ladder with seeds 0..20 gives
  the same report (golden).
- `canon()` is r then q; `boundary()` of `hex(4)` is the 24 rim cells; `peel(1)` of `hex(4)` is the 18
  cells at radius 3; `add` refuses a cell at distance 2 from the region.
- `rot60` six times is the identity; `reflect` twice is the identity.

**Risks.** Search speed: a dense `Vec` is faster than the `HashMap`, but `coords()` must stay an
allocation-free iterator (benchmark the Ballast Mind at 150 000 nodes before and after, budget: no
slower, PROPOSAL). The refactor touches many files: it is one mechanical PR with no behaviour change,
nothing else in it.

**Tags.** Margin 1 cell: PROPOSAL. Classic scan order kept: PROPOSAL. Region sizes: FINAL (geometry).

### 3.2 Terrain layer

**Implementation.**

```rust
pub enum CellKind { Normal, Rock, Chasm, Ice, Mud, Thicket, Height, Slope, Lava, Water,
                    Quicksand, Vent, Sanctuary, Corruption, Crystal, Brambles }
pub enum Clock { Owner(u8), Round }                // whose turns count down a timer
pub struct Layer { pub kind: CellKind, pub dir: Option<Direction>, pub owner: Option<u8> }
pub struct Timed { pub layer: Layer, pub left: u8, pub clock: Clock }
pub struct TerrainCell {
    pub base: Layer,            // from generation, permanent unless a rule says so
    pub overlay: Option<Timed>, // from an ability or a timed rule; hides the base until it expires
    pub counter: Option<u8>,    // Vent countdown, Quicksand and tells use the unit side
}
pub struct TerrainMap { cells: Vec<TerrainCell> }  // same indexing as the Region
```

- One overlay at most per cell; a new overlay replaces the old one (PROPOSAL, keeps the rule
  readable). When an overlay expires, the base shows again: Mur de flammes on Ice for 3 turns gives
  Lava, then Ice again.
- A **Pont** on a Gouffre is an overlay `Normal` for 2 turns over base `Chasm`. A Pont beyond the
  edge is `region.add(c)` with base `Chasm` and the same overlay; when it expires the cell is still
  `Chasm`, so the ball on it is ejected (§8.8) and the cell is removed at the end of that effect.
- `owner` is the camp id of the entity that made the cell (Sanctuary from Source, allied Rocs of Mur
  de boucliers); `None` for generated terrain.
- `Clock::Owner(entity)` ticks at the end of that entity's turn (ability terrain, like statuses,
  §6.3); `Clock::Round` ticks at the end of each round (neutral terrain: Vent, Tide, Éboulement,
  Breach) (PROPOSAL, feedback F13).
- `TerrainMap::hash_into(&mut H)` feeds every cell in canonical order into the state hash (§24.1,
  `combat-engine` owns the hash).

**Dependencies.** `combat-engine` (calls the ticks at end of turn and end of round, includes the map
in the state and the hash), `class-designer` (abilities that write overlays), `ux-designer` and
`client-ui` (decals, timer ticks).

**Tests.** Given an Ice base and a Lava overlay for 3 owner turns, When the owner ends 3 turns, Then
the cell reads Ice. Given a Round clock, When an entity that is not the owner ends a turn, Then the
timer does not move. Given a Pont beyond the edge with a ball on it, When the overlay expires, Then
the cell reads Chasm and the region loses the cell after the ejection. Given two equal maps built in a
different order, Then their hashes are equal; Given one timer differs, Then the hashes differ.

**Risks.** A second overlay type (two timed effects on one cell) may be wanted later; the "replace"
rule keeps it simple now.

**Tags.** One overlay per cell: PROPOSAL. Clock split: PROPOSAL.

---

## 4. Hex world and tiling (§4.1)

**Implementation (`tiling.rs`).**

- World tiles: axial `(Q, R)`, same convention as the board (§4.1, FINAL). The continent is
  `Region::hex(60)` at world scale: 10 981 tiles (§4.1 says "about 11 000", TUNE radius, §26 Q3).
- **Tile to combat coordinates** (§4.1, TUNE until the Decision): the centre of tile `(Q, R)` is
  `M(Q, R) = Q·(9, −4) + R·(4, 5)`. Radius-4 hexagons on that lattice tile the plane with no gap and no
  overlap (the lattice determinant is 61, the size of one hexagon; checked by a script for this
  spec on a 401 × 401 window).
- **Inverse** `tile_of(x, y)`: `Q* = floor((5x − 4y) / 61)`, `R* = floor((4x + 9y) / 61)`; the tile is
  the one of `(Q*, R*)`, `(Q*+1, R*)`, `(Q*, R*+1)`, `(Q*+1, R*+1)` whose centre is at distance 4 or
  less (exactly one is, checked by the same script).
- **Tile seed** (§4.1): `tile_seed = h(world_seed, coord(Q, R))` with `h` and `coord` of section 2.
- **Global terrain**: every combat cell `(x, y)` of the plane belongs to exactly one tile. Its base
  terrain is the terrain the generator gives that cell on that tile (section 13). So a radius-3 board
  is the middle of its tile, a radius-5 board takes its outer ring (30 cells, 5 from each neighbour)
  from the 6 neighbour tiles, and a union of tiles is just their cells (PROPOSAL, feedback F4).
- **Anchor coordinates** (PROPOSAL): a fight on tiles `T0, T1, ...` uses combat coordinates relative
  to `M(T0)`, so a one-tile fight is the usual board centred on `(0,0)` and every `rules.md` example
  holds unchanged.
- **Rendering note** for `client-ui`: the tile lattice is rotated by about 26.3° against the cell grid
  (tile neighbour `(1,0)` sits at `(9,−4)`, which points 26.3° above east in the pointy-top layout).
  A world drawn with regular hexes does not line up with the seams of the boards; the unfold of §4.5
  must turn by that angle, or the world mesh must use the true "superhex" outline (feedback F5).

**Dependencies.** `client-ui` (world mesh, unfold rotation), `art-audio` (tile outline).

**Tests.** Given the six tile neighbours, Then their centres are `(9,−4)`, `(4,5)`, `(−5,9)`, `(−9,4)`,
`(−4,−5)`, `(5,−9)`, each at distance 9. Property: for every cell of a 201 × 201 window, `tile_of`
returns exactly one tile and the cell is within 4 of its centre. Given tiles `(0,0)` and `(1,0)`, Then
cells `(4,0)` and `(5,0)` are neighbours and belong to different tiles. Golden vector: `tile_seed` of
`(0,0)`, `(1,−1)`, `(−60,60)` for the pinned world seed.

**Risks.** Any change to the lattice or to `h` reshuffles every board in the world: the world seed and
the formula are versioned (section 9).

**Tags.** Radius 60: TUNE (§4.1). Lattice `(9,−4)`, `(4,5)`: TUNE in §4.1, FINAL once the Decision
closes (it is pure geometry). Global terrain and anchor coordinates: PROPOSAL.

---

## 5. World map: zones, biomes, levels (§4.1, §5.2, §26 Q3)

**Implementation (`map.rs`).**

- **Ring position.** Each tile has `(k, p)`: `k = dist(tile, (0,0))`, `p` its index on ring `k` in the
  standard walk (start at `k·SW = (−k, k)`, then `k` steps along each direction E, NE, NW, W, SW, SE).
  `p` is in `[0, 6k)`. Computed once by that walk into a dense table.
- **Zones** (PROPOSAL layout, all ring radii TUNE):
  - Le Puits (85-100) is the core: `k ≤ 19`. "Le cœur du gisement" Terres Vitrifiées (70-85) rings it:
    `20 ≤ k ≤ 27`.
  - The 8 other zones share the outer ring `k ≥ 28` as 8 sectors in level order, counter-clockwise from
    the south: Lumen (sector 0, south), Sylve, Tourbières, Dunes, Crêtes, Toundra, Littoral, Caldeira
    (sector 7). Sector: `s = (8 · p') / (6k)` with integer division.
  - **Jitter** for organic borders: `j = tile_seed mod 3 − 1` on `k` and `(tile_seed >> 8) mod 3 − 1` on
    `p` before the tests above.
  - **Smoothing**: one pass in canonical order; a tile with fewer than 2 of its 6 neighbours in its own
    zone takes the most frequent zone among its neighbours (ties: lowest zone index).
  - A prototype of this exact rule (script for this spec) gives zones of 1 075 to 1 139 tiles, each
    contiguous.
- **Hub** (§2, §21): the Ballast landed on the south rim, inside Lumen. Hub = the 7 tiles of the flower
  centred on `(−36, 57)` (ring 57, middle of sector 0, PROPOSAL). Hub tiles have biome `Ballast`.
- **Tile level** (§5.2 bands, feedback F22): outer sectors: `level = lo + (hi − lo) × (p' − p_start) /
  (p_end − p_start)` (progress along the sector, counter-clockwise); inner rings: by depth, `level =
  lo + (hi − lo) × (k_out − k) / (k_out − k_in)`. Integer floor. The overlapping bands of §5.2 are kept
  as written (Sylve 10-20 then Tourbières 15-25): the overlap only exists across a border.
- **Open zones** (PROPOSAL, §26 Q3): `world.ron` pins the full radius-60 world from R4, with
  `open: true` only for the zones of the current phase (R4: Lumen, Sylve, Tourbières). Closed zones are
  impassable for A* and drawn as "unstable glass" (`client-ui`). The world never moves when a zone
  opens, so saved tile flags stay valid.
- **Data** `data/world/world.ron`:

```ron
World(
  version: 1, seed: 0x00AB_A10E, radius: 60,
  hub: (centre: (-36, 57), shape: Flower),
  rings: (core: 19, inner: 27),
  zones: [
    (id: "lumen",      biome: "lumen",      levels: (1, 10),   place: Sector(0), open: true),
    (id: "sylve",      biome: "sylve",      levels: (10, 20),  place: Sector(1), open: true),
    (id: "tourbieres", biome: "tourbieres", levels: (15, 25),  place: Sector(2), open: true),
    (id: "dunes",      biome: "dunes",      levels: (20, 35),  place: Sector(3), open: false),
    (id: "cretes",     biome: "cretes",     levels: (30, 45),  place: Sector(4), open: false),
    (id: "toundra",    biome: "toundra",    levels: (40, 55),  place: Sector(5), open: false),
    (id: "littoral",   biome: "littoral",   levels: (45, 60),  place: Sector(6), open: false),
    (id: "caldeira",   biome: "caldeira",   levels: (55, 70),  place: Sector(7), open: false),
    (id: "vitrifiees", biome: "vitrifiees", levels: (70, 85),  place: Inner,     open: false),
    (id: "puits",      biome: "puits",      levels: (85, 100), place: Core,      open: false),
  ],
)
```

**Dependencies.** `encounter-boss-designer` (monster level from `tile.level`), `narrative-quest-
designer` (zone quests, discovery titles), `client-ui` (map, closed zone look), `stats-progression`
(level bands).

**Tests.** On the pinned world: every zone is contiguous (BFS); zone sizes are within ±10 % of
`(10 981 − 7 − core − inner) / 8` for sectors (TUNE); zone `i` touches zone `i+1` for i in 0..7, and
Caldeira touches Terres Vitrifiées, which touches Le Puits; the hub touches only Lumen; every tile of a
zone has a level inside its band; two neighbour tiles of the same zone differ by at most 2 levels
(TUNE). Golden: a hash of the full `(biome, level)` map, so any change is a visible, versioned
choice. No float anywhere in `map.rs` (a test greps the module source for `f32` and `f64`, PROPOSAL).

**Risks.** Every outer zone touches the inner ring, so a level-10 hero can walk into level-70 land:
that is the Diablo and WoW rule (red level glyph, §4.4), but a soft wall may be wanted (open question).
The ring layout is a proposal: an owner may prefer a hand-drawn macro map; the zone record already
allows `place: Sites([...])` later without changing the rest.

**Tags.** Ring radii 19 and 27, jitter ±1, smoothing threshold 2, hub centre: PROPOSAL, TUNE. Zone order
and bands: TUNE (§5.2). `open` flag: PROPOSAL.

---

## 6. Tile content and landmarks (§4.3, §4.2, §11, §17, §18, §22)

**Implementation (`content.rs`).** `content(tile) = landmark(tile).unwrap_or(roll(tile))`.

- **Landmarks** (authored or placed by a deterministic rule, never rolled):
  - Hub flower (7 tiles), and the tutorial camp (7 tiles, from `narrative-quest-designer` 15.1) next
    to it in Lumen.
  - **Outposts** (§21): 2 per zone (PROPOSAL, TUNE), each 1 tile with an NPC, a Beacon, a refining
    station and a contract board; placed at `place: Progress(bp)` along the zone (25 % and 75 %,
    TUNE).
  - **Beacons** (§4.2): one per outpost, one on the first tile of each zone border crossed by the main
    route, then a greedy cover in canonical order so that every open tile is within 15 tiles of a
    Beacon (PROPOSAL, TUNE: about 20 to 30 Beacons on the full world).
  - **Dungeon entrances** (§17): one tile per dungeon, at the tile of its zone whose level is closest to
    the dungeon level (ties: canonical order). Les Cales du Ballast (level 8) and Le Pont de Tally (raid)
    open from the hub (feedback F21).
  - **Boss lairs** (§4.3 "boss de zone ou rare nommé"): one zone boss per zone (PROPOSAL) at the deepest
    tile of the zone; its arena shape comes from `encounter-boss-designer` (section 15). Rare named
    spawn tiles: a pool of 3 per zone (PROPOSAL), picked by `h(world_seed, zone, "rare", i)` among
    empty tiles.
  - **Event anchors** (§22): every rolled Empty tile with no landmark within 3 tiles is an anchor; the
    event schedule (`encounter-boss-designer`, `narrative-quest-designer`) picks among them by UTC seed.
- **Rolled content**, weights in bp per biome in `data/world/content.ron` (default from §4.3, TUNE):

| Content | Weight (bp) | Note |
|---|---|---|
| Pack | 1 500 | patrol of 3 tiles, aggro 1 (§4.4) |
| Elite or Champion | 300 | aggro 2 (§4.4) |
| Gathering node tile | 1 500 | `1 + tile_seed mod 3` nodes (§4.3 "1 à 3"), types from `gathering-crafting` |
| NPC | 200 | quest giver from the zone pool (`narrative-quest-designer`) |
| Chest or cache | 300 | trapped if `h(tile_seed, "trap") mod 10 000 < 2 500` (PROPOSAL, TUNE): opening starts a skirmish |
| Puzzle | 100 | puzzle id from the zone pool, no repeat until the pool is used (`narrative-quest-designer` 10.3) |
| Empty | remainder (6 100) | §4.3 says 55 %; the table sums to 94 % (feedback F1) |

  Roll: `x = h(tile_seed, "content") mod 10 000`, then the cumulative table in the order above.
- **Spacing rules** (PROPOSAL, TUNE), applied in canonical order of tiles (first tile wins, so the
  result is deterministic):
  - no Pack or Elite within 3 tiles of the hub, an outpost, a Beacon or a dungeon entrance (safe
    zones);
  - no Pack or Elite within 4 tiles of an earlier Pack or Elite (patrols and aggro rings never overlap,
    so "no pack joins a fight in progress", §4.4, holds by construction);
  - a demoted roll becomes Empty.
- **Static or timed**: packs, nodes, chests, puzzles are static per tile; events and rare named spawns
  are timed by their owners.

**Dependencies.** `encounter-boss-designer` (pack and elite composition from the tile, zone bosses,
rare named, event schedule), `gathering-crafting` (node types and rich veins), `loot-economy` (chest
loot), `narrative-quest-designer` (NPC roles, puzzle pools, tutorial camp), `client-ui` (markers).

**Tests.** On the pinned world: shares of each rolled kind per open zone are within ±1.5 points of the
weights (TUNE); no two packs within 4 tiles; no pack within 3 tiles of a safe landmark; every open tile
within 15 tiles of a Beacon; each dungeon entrance level is within 3 of the dungeon level; the same
seed gives the same content table (golden hash). Given a chest tile whose trap hash is below 2 500, When
opened, Then a skirmish request is returned (unit, `engage.rs`).

**Risks.** 15 % packs on 11 000 tiles is 1 650 packs: content variety rests on `encounter-boss-
designer` families. The spacing rule lowers the real pack share below 15 %; the test measures it.

**Tags.** All weights and distances: TUNE. Landmark rules: PROPOSAL.

---

## 7. World travel (§4.2)

**Implementation (`travel.rs`).**

- **Step time** (§4.2): `step_ms = 300 × cost_bp / 10 000`, then speed modifiers. Costs (bp):

| Biome | Cost (bp) | Source |
|---|---|---|
| Lumen (plains), Terres Vitrifiées, hub, ship interior | 10 000 | §4.2 plains; others PROPOSAL |
| Sylve (forest) | 12 000 | §4.2 |
| Tourbières (marsh), Crêtes (mountain), Le Puits | 15 000 | §4.2; Puits PROPOSAL |
| Toundra (ice) | 8 000, plus a slide | §4.2 |
| Dunes, Caldeira | 13 000 | PROPOSAL (feedback F2) |
| Littoral | 11 000 | PROPOSAL |

- **Speed modifiers** (PROPOSAL, feedback F3): `ms = step_ms × (10 000 − elan_bp) / 10 000 × 10 000 /
  (10 000 + speed_bp)`, floored, minimum 100 ms (TUNE). `elan_bp` is 2 000 from level 20 and 3 500 from
  level 40 (§4.2, TUNE). `speed_bp = 50 × VIT` (§7.1, "+0,5 % par point", TUNE) plus rune bonuses
  (Bottes magiques, Chasseur implacable: values from `stats-progression`).
- **Ice slide on the map** (PROPOSAL, feedback F2): entering a Toundra tile `T` in direction `d` carries
  the ball on to `T + d` in the same step if `T + d` is open, on the continent and not a landmark;
  otherwise the ball stays on `T`. One extra tile only, no chain. Aggro is checked on both tiles.
- **A*** on tiles: edge cost = `ms` of the step (with the slide folded in: the edge from `S` into an ice
  tile `T` leads to the slide end); heuristic `dist × 100 ms` (the floor, so admissible). Ties broken by
  canonical order of the tile. Closed zones and off-continent tiles are walls. Packs are not avoided
  (an ambush is the point of §4.4, PROPOSAL).
- **Fog** (§4.2): a tile is discovered when it is within 3 tiles of the ball after any step (TUNE).
  Discovery per zone = `100 × discovered / tiles` (integer percent, §4.2 map key M).
- **HP out of combat** (§4.2): `hp += floor(max_hp × 500 × elapsed_ms / 10 000 000)`, the remainder kept
  in milli-HP so that nothing is lost between frames; full HP on an activated Beacon or the hub
  (TUNE 5 %/s).
- **Beacons** (§4.2): activated by stepping on them; travel from the map to any activated Beacon costs 1
  Lueur (`loot-economy`), instant, then the ball stands on the Beacon. Defeat respawn: last activated
  Beacon (§6.12).
- The functions are pure: `path(map, flags, from, to, speed) -> Path { tiles, ms_per_step }`;
  `discover(flags, at) -> Vec<TileId>`; the client drives time.

**Dependencies.** `stats-progression` (VIT, Élan unlock, hero HP), `loot-economy` (Lueur), `client-ui`
(path preview, keyboard steps from `ux-designer` F13, map), `netcode` (party position: who drives the
ball in a party, §4.7).

**Tests.** Given a straight path of 4 Lumen tiles and no modifier, Then 4 steps of 300 ms. Given
level 40 and VIT 20, Then a Lumen step is `300 × 6 500 / 10 000 = 195`, then `195 × 10 000 / 11 000 =
177` ms. Given an ice tile with an open tile beyond, When entered, Then the ball ends one tile further
and both tiles are discovered and aggro-checked. Given a closed zone between two points, Then A* goes
around it or returns no path. Property: on 1 000 random pairs, A* cost equals a Dijkstra reference.
Given 2 s out of combat at 1 000 max HP, Then +100 HP. e2e (R4, with `client-ui`): click a tile 5
tiles away, the ball arrives, `data-path-steps="5"`, the zone percentage increases.

**Risks.** Real-time world steps run on the local clock: fine out of combat (no rule depends on it),
but a party must agree on the party position (`netcode`).

**Tags.** Costs marked §4.2: TUNE; the others, slide rule, speed stacking, minimum 100 ms: PROPOSAL,
TUNE. Reveal radius 3: TUNE.

---

## 8. Engagement on the map (§4.4, §4.5)

**Implementation (`engage.rs`).**

- **Patrol** (§4.4 "patrouille sur 3 tuiles"): a pack's path is its home tile plus 2 steps in direction
  `DIRS[h(tile_seed, "patrol") mod 6]`, shortened if a step leaves open land; it ping-pongs
  `0, 1, 2, 1` with one step every 4 s (TUNE) of local time. Position is a pure function of
  `(tile_seed, now_ms)`, so a reload shows the pack in the same place.
- **Aggro** (§4.4): after each step of the ball (including a slide tile), a pack at distance ≤ 1 (≤ 2 for
  an elite) engages: ambush, the pack plays first.
- **Player engage** (§4.4): clicking a pack sets `target = pack`; the target's aggro is ignored while the
  ball walks to it; when adjacent, the fight starts and the player plays first. Other packs' aggro
  still applies on the way.
- **Which tile unfolds** (PROPOSAL, feedback F24): the tile under the ball at the trigger. The pack's
  composition still comes from its home tile seed (`encounter-boss-designer`), so the same pack is the
  same fight and the same tile is the same board (§4.5).
- **Fight request** returned to the combat layer: `{ tile, format, pack_id, initiative: Pack | Player,
  weather, night }` (section 18 for the last two).
- **Cleared packs** (feedback F35): a cleared pack stays cleared for 10 min of real time (TUNE), then
  respawns at its home tile; resting at a Beacon does not reset it (PROPOSAL).

**Dependencies.** `encounter-boss-designer` (pack id, elite flag, format choice), `combat-engine`
(initiative), `client-ui` (aggro rings), `netcode` (in a party, the party leader's clock drives patrols,
§4.7).

**Tests.** Given a pack home tile and `now = 0, 4 000, 8 000, 12 000` ms, Then positions `0, 1, 2, 1`.
Given the ball steps to distance 1 of a normal pack, Then an ambush request with `initiative: Pack`;
at distance 2 of a normal pack, Then nothing; of an elite, Then an ambush. Given the player clicked the
pack, When the ball reaches distance 1, Then `initiative: Player`. Given a pack cleared at `t`, Then it
is absent until `t + 600 000` ms.

**Risks.** A fast ball can step past a patrol between two checks (real time): aggro is checked against
the pack position at the arrival time of each step, which is enough at 100 ms minimum per step.

**Tags.** Aggro 1 and 2: TUNE (§4.4). Patrol period 4 s, respawn 10 min: PROPOSAL, TUNE.

---

## 9. World state and saves (§4.1 flags, §4.7, §14)

**Implementation (`save.rs`, tile part).**

```rust
pub struct WorldFlags {
    pub world_version: u32,
    pub discovered: BitVec,                // one bit per tile, canonical index (about 1.4 KB)
    pub beacons: BitVec,                   // activated
    pub opened: BitVec,                    // chests, puzzle first solves
    pub cleared: Vec<(TileId, u64)>,       // sorted by tile, respawn time (ms, UTC)
    pub harvested: Vec<(TileId, u8, u64)>, // tile, node index, respawn time (§14: 10 to 30 min)
}
```

- Stored in the hero save (IndexedDB store `hero`, §24.5) by `stats-progression`; this role owns the
  type, its versioned JSON and its tests.
- **World version policy** (PROPOSAL): `world_version` changes only when the lattice, `h`, the zone
  rule or the world seed change. A save with an older version keeps its hero and drops the tile flags,
  with a notice (`client-ui`). Opening a zone (`open: true`) is not a version change.

**Dependencies.** `stats-progression` (hero save), `gathering-crafting` (respawn timers),
`narrative-quest-designer` (discovery events for quests and titles).

**Tests.** Round trip JSON for a full flags value. Given a save of version 1 and world version 2, Then
the flags reset and the hero stays. Given a node harvested with respawn at `t`, Then it is available
again at `t` and not before. The bit vectors survive 10 981 tiles (size test).

**Tags.** Layout: PROPOSAL. Respawn times: owned by `gathering-crafting` (TUNE §14).

---

## 10. Cell catalog (§5.1)

**Implementation.** `data/terrain/cells.ron`, one record per kind:

```ron
Cell(id: "ice", kind: Ice, glyph: "snowflake", blocks_move: false, ejects: false,
     blocks_line: false, directional: false, timer: None, params: { })
```

| Kind | blocks_move | ejects | blocks_line | directional | Params (bp or turns) |
|---|---|---|---|---|---|
| Normal | no | no | no | no | none |
| Rock | yes | no | yes | no | none |
| Chasm | yes (as off-board) | yes | no | no | none |
| Ice | no | no | no | no | none |
| Mud | no | no | no | no | `weight: +1` |
| Thicket | no | no | no | no | `ranged_bp: −5 000`, `min_range: 2` |
| Height | no | no | no | no | `range: +1`, `damage_bp: +2 000` |
| Slope | no | no | no | yes | `with: +1`, `against: −1` |
| Lava | no | no | no | no | `hp_bp: 1 000` |
| Water | no | no | no | no | `shock_bp: 5 000`, `wet_turns: 1` |
| Quicksand | no | yes (rule) | no | no | `turns_to_sink: 2` |
| Vent | no | yes (rule) | no | yes | `countdown: 3` |
| Sanctuary | no | no | no | no | `heal_bp: 500`, `resource: 5` |
| Corruption | no | no | no | no | `armor_bp: −1 000` per stack, `max: 3` |
| Crystal | no | no | no | no | `bounces: 1` |
| Brambles | no | no | no | no | `hp_bp: 500` |

- Every kind has a glyph (§5.1, FINAL rule: "un glyphe obligatoire"); the glyph ids are the ones of
  §5.1 and the art is `art-audio` and `ux-designer`'s.

**Tests (integrity, §24.3).** Every kind of `CellKind` has exactly one record and a glyph; every
`directional` kind is Slope or Vent; every biome share and every ability that writes terrain names an
existing kind; no two kinds share a glyph.

**Tags.** Params copied from §5.1: TUNE. Vent countdown 3, Water `wet_turns` 1: PROPOSAL, TUNE.

---

## 11. Cell rules (§5.1, §6.4, §6.10)

Each rule is a pure function. The board-only ones live in `abalone-core/src/terrain.rs` (they need no
units); the ones that touch HP, statuses or resources live in `abalone-rpg/src/terrain_rules.rs` and
return effect lists that `combat-engine` applies at its hook points (start of turn, end of turn, on
enter, on push, on damage). This role writes and tests the functions; `combat-engine` wires them.

### 11.1 Rock and Chasm (Roc, Gouffre)

**Rule.**
- Rock: no ball may enter it or be pushed into it; a Rock right behind the opposing file makes the push
  illegal, like an own ball (§5.1, §6.4 condition 3); it stops "in line" abilities (§5.1).
- Chasm: for every movement rule it is **off-board**: a move into it is illegal (as `rules.md` §4.1 and
  §4.2), a ball pushed or slid into it is ejected (§5.1). It stays in the region for timers and Pont
  (section 3.2).

**API.** `terrain::blocks(map, c) -> bool`, `terrain::ejects(region, map, c) -> bool` (outside the
region or Chasm).

**Tests (Given/When/Then, radius 4, Black pushes).**
- Given Black `(−1,0)(0,0)`, White `(1,0)`, Rock on `(2,0)`, When `(−1,0)(0,0)>E`, Then illegal.
- Given Black `(−1,0)(0,0)`, White `(1,0)`, Chasm on `(2,0)`, When `(−1,0)(0,0)>E`, Then legal, White
  ejected, one ejection.
- Given Black `(0,0)`, Chasm on `(1,0)`, When `(0,0)>E`, Then illegal (moving into a Chasm).
- Given Black `(0,0)(0,1)` and Rock on `(1,0)`, When the broadside `(0,0)(0,1)>E`, Then illegal.

### 11.2 Ice (Glace) and the slide resolver

**Rule (§5.1, §6.10 rule 1 and 3).** A ball slides when it *enters* an Ice cell and it is either a
pushed ball or a single ball that moved alone. A group of 2 or 3 that moved on its own does not slide
(§5.1). Sliding: while the next cell in the same direction is free Ice, go on; stop on the first
non-Ice cell if it is free; stop just before a Rock or a ball. Balls slide one at a time, front ball
first. If the next cell ejects (off-board or Chasm): the ball is ejected only if the action still has
an ejection to spend; otherwise it stops where it is ("au bord").

**API (`abalone-core`).**

```rust
pub struct Allowance(pub u8);            // 1 for a Movement or an Éjecteur, 0 otherwise,
                                         // u8::MAX for terrain with a tell of 2 turns or more
pub enum Slide { Stop((i32, i32)), Ejected }
pub fn slide(region: &Region, map: &TerrainMap, occupied: &dyn Fn((i32,i32)) -> bool,
             from: (i32, i32), dir: Direction, allow: &mut Allowance) -> Slide;
pub fn slide_all(region, map, occupied, movers: &[(i32,i32)], dir, allow) -> Vec<Slide>;
// movers sorted front first; occupancy is updated after each slide
```

**Interpretations** (PROPOSAL, feedback F10):
- A lone ball that pushes (possible with Percée at 1 against 1, §8.2) "moved alone": it slides.
- "Stops at the last cell of the board" (§6.10 rule 3, non-Éjecteur) means the last non-ejecting cell
  of its path, also before an interior Chasm.
- The classic sumito ejection (the last ball of the file leaves the board) spends the allowance before
  any slide.

**Tests (radius 4).**
- Given Black `(−1,0)(0,0)`, White `(1,0)`, Ice on `(2,0)(3,0)`, When `(−1,0)(0,0)>E`, Then White
  slides to `(4,0)` (first non-Ice, free); Black ends on `(0,0)(1,0)` and does not slide.
- Given Ice on `(2,0)(3,0)(4,0)`, same push, Then White is ejected (allowance 1).
- Given Black `(−2,0)(−1,0)(0,0)`, White `(1,0)(2,0)`, Ice on `(2,0)(3,0)(4,0)`, When pushing E, Then the
  front White (on `(3,0)`) slides out and is ejected; the second White (on `(2,0)`) slides and stops on
  `(4,0)`: one ejection in the action.
- Given a Shield Bash recoil (no Éjecteur, allowance 0) onto Ice towards the rim, Then the ball stops on
  the rim cell (the Shock is `combat-engine`'s).
- Given Black `(0,0)` alone moving E onto Ice `(1,0)(2,0)` and a White on `(3,0)`, Then Black stops on
  `(2,0)`.
- Given Black `(0,0)(0,1)` moving broadside E onto Ice `(1,0)(1,1)`, Then nothing slides.
- Property: a slide never crosses a ball, never ends on a Rock, and ejects at most `allowance` balls.

### 11.3 Mud and Slope (Boue, Pente): Weight modifiers

**Rule.** Mud: +1 Weight for the ball on it (pushing and resisting), clamped to 1..5 (§6.11); a ball
on Mud cannot take part in a broadside (§5.1). Slope: the cell has a direction; a push along it counts
+1 Weight for the pushing group, against it −1, minimum 1 (§5.1); a Slope turns with its cell (§8.8
Rotation).

**Interpretation** (PROPOSAL, feedback F11): the Slope that counts is the one under the **front ball of
the pushing group** (the one in contact). "Along" = same direction as the push; "against" = the opposite
direction; the 4 other directions count 0. Clamp: the group total never drops below 1.

**API.** `terrain::weight_bonus(map, c) -> i8` (Mud), `terrain::slope_bonus(map, front, dir) -> i8`;
`combat-engine` adds them inside the weighted push (§6.4).

**Tests.**
- §6.4 example: Given three Fragments (Weight 1 each) against a lone Warrior (Weight 3) on Mud, Then
  illegal (3 against 4).
- Given Warrior (3) and Fragment (1) against a Guardian (3), the front pusher on a Slope pointing
  against the push, Then 3 against 3: illegal; with the Slope along, Then 5 against 3: legal.
- Given a Slope pointing NE and a push E, Then bonus 0.
- Given a group of 2 with one ball on Mud, When a broadside, Then illegal; When an inline move, Then
  legal.
- Invariant (§6.4): with no Mud and no Slope on the board, the bonuses are 0 (property over random
  boards).

### 11.4 Thicket and Height (Fourré, Hauteur): range and damage

**Rule.** Thicket: −50 % damage from abilities cast from 2 cells or more at the ball on it. Height:
abilities cast from it get +1 range and +20 % damage (§5.1).

**Interpretation** (PROPOSAL, feedback F18): both are entries of `Σbonus` in the damage formula of §6.5
(additive), so Height plus Thicket gives −30 %. Range counts from the hero (§6.9), so Height helps only
when the hero (or an "Escouade" caster) stands on it.

**API.** `terrain_rules::range_bonus(map, caster_cell) -> i8`, `terrain_rules::damage_bonus_bp(map,
caster_cell, target_cell, distance) -> i32`.

**Tests.** Given the caster on Height and the target on Thicket at distance 3, Then the bonus is
`+2 000 − 5 000 = −3 000` bp. Given the target on Thicket at distance 1, Then 0 from the Thicket. Given
Height and a range-4 ability, Then range 5; with the Sylve rule (−1) too, Then 4.

### 11.5 Lava, Sanctuary, Corruption: end of turn

**Rule (§5.1).** At the end of the turn of the ball's entity: Lava, −10 % max HP; Sanctuary, an ally
heals 5 % max HP and its entity gains +5 resource; Corruption, +1 Vitrification stack (−10 % ARM and RES
each, at most 3), −1 stack per turn ended elsewhere.

**Interpretation** (PROPOSAL, feedback F17): a generated Sanctuary (`owner: None`) heals any ball; an
ability Sanctuary heals only the owner's camp; a Mythic "Sanguin" Sanctuary is owned by the monsters.

**API.** `terrain_rules::end_of_turn(map, units_of_entity) -> Vec<Effect>`, effects in canonical order
of cells.

**Tests.** Given a 200 max HP ball on Lava, When its entity ends its turn, Then −20 HP; When another
entity ends its turn, Then nothing. Given an owned Sanctuary and an enemy ball on it, Then no heal.
Given 3 stacks, When it ends again on Corruption, Then still 3; When it ends elsewhere, Then 2.

### 11.6 Water (Eau)

**Rule (§5.1).** On Water: the Shock received is halved; the ball becomes Wet (lightning +50 %); its
Burn goes out.

**Interpretation** (PROPOSAL, feedback F16): Wet is applied when the ball enters Water or starts a turn
on it and lasts until the end of its next turn after it leaves; Burn goes out on entering.

**Tests.** Given a ball on Water pushed with a 40 Shock, Then it takes 20 (before ARM, order from
`combat-engine`). Given a Burnt ball pushed onto Water, Then the Burn is gone and Wet is set.

### 11.7 Quicksand (Sables mouvants)

**Rule (§5.1).** A ball that starts its turn on Quicksand is Rooted; it may still leave with a Step; if
it starts 2 turns in a row on Quicksand it is ejected; the tell shows after the first.

**Interpretation** (PROPOSAL, feedback F14): the exit "Step" is the Movement slot used as one ball,
one cell, no push (Rooted forbids every other voluntary move). The sink counter lives on the unit
(`combat-engine`), reset when the turn starts elsewhere. The ejection is a terrain removal with a 1-turn
tell, one ball, so it fits §6.10 rule 1.

**Tests.** Given a ball that starts its turn on Quicksand, Then it is Rooted, a tell "sinks next turn"
is public, and its only voluntary move is a 1-cell Step without push. Given it starts its next turn
there, Then it is ejected (a Perte, or the hero's death, §6.6). Given it was pushed off in between, Then
the counter resets.

### 11.8 Vent (Évent)

**Rule (§5.1).** A visible countdown of N turns; at zero, the ball on it is pushed 1 cell in the
engraved direction; terrain with a tell of 2 turns or more, so the ejection is allowed.

**Interpretation** (PROPOSAL, feedback F12): N = 3 rounds (`Clock::Round`), the countdown restarts at N
after it fires; it moves only the ball on it (no chain push): if the target cell holds a ball or a Rock,
nothing moves; if it ejects, the ball is ejected; if it is Ice, the ball slides with an unlimited
allowance (tell of 2 or more).

**Tests.** Given a Vent pointing E with counter 1 and a ball on it, When the round ends, Then the ball
moves 1 cell E and the counter is 3. Given the cell E is the rim edge, Then the ball is ejected. Given
a ball E of it, Then nothing moves.

### 11.9 Crystal (Cristal)

**Rule (§5.1).** An "in line" ability that touches a Crystal goes on once to the next cell of the axis.

**Interpretation** (PROPOSAL, feedback F15): a Crystal is a floor cell. If the ball hit by an in-line
ability stands on a Crystal, the same effect applies once more to the first ball or obstacle after it
on the axis, measured from the Crystal; a second Crystal does not bounce again.

**Tests.** Given Trait de feu along E hitting a ball on a Crystal at `(2,0)` and another ball at
`(4,0)`, Then both are hit. Given the second ball also on a Crystal, Then no third hit.

### 11.10 Brambles (Ronces)

**Rule (§5.1).** A ball pushed into the cell takes 5 % of its max HP. **Interpretation** (PROPOSAL):
only a pushed ball (not a ball that moved on its own), and only on the cell where it stops (a slide only
crosses Ice).

**Tests.** Given a 300 max HP ball pushed onto Brambles, Then −15 HP; Given a ball that steps onto it,
Then nothing.

### 11.11 Dependencies, risks, tags (whole section 11)

**Dependencies.** `combat-engine` (hook points, ejection allowance, Shock, statuses Wet, Rooted, Burn,
Vitrification, unit counters), `class-designer` (terrain abilities: Sol verglacé, Mur de flammes,
Source, Mur de boucliers, Prison d'os, Géomancien kit), `ux-designer` (ice slide and terrain previews).

**Risks.** Terrain makes the preview harder (a push can slide and eject): the preview must be a dry run
of the same functions, never a second implementation (`ux-designer` P2). Many cells in one board hurt
readability: generation caps the special share (section 13).

**Tags.** Rules quoted from §5.1: TUNE numbers, rule text PROPOSAL until the Decision. Interpretations:
PROPOSAL.

---

## 12. Biome tables and global rules (§5.2)

**Implementation.** `data/biomes/<id>.ron`:

```ron
Biome(
  id: "tourbieres", levels: (15, 25), step_cost_bp: 15000,
  shares: [ (Mud, 2500), (Water, 1500), (Chasm, 300) ],      // bp of candidate cells
  directional: [],                                            // kinds that need a direction
  rules: [ PoisonExtraTurns(1) ],
  affinity: ["necromancer"],                                  // class-designer reads it
  palette: "tourbieres",                                      // art-audio
)
```

| Biome | Shares (bp) | Global rule (data) |
|---|---|---|
| Lumen | Thicket 1 000, Rock 500 | none |
| Sylve | Rock 1 000, Thicket 2 000, Brambles 500 | `RangeDelta(−1)` |
| Tourbières | Mud 2 500, Water 1 500, Chasm 300 | `PoisonExtraTurns(1)` |
| Dunes | Quicksand 1 000, Slope 1 500, Rock 500 | `ResourceGainBp(−1 000, except: Fire)` |
| Crêtes | Rock 1 500, Slope 2 500, Height 1 000 | `RaggedEdge(0..=4)` |
| Toundra | Ice 3 000, Rock 500 | `FrozenExtraTurns(1)` |
| Littoral | Water 3 000 | `Tide(every: 6, lasts: 2, tell: 2)` |
| Caldeira | Lava 1 500, Vent 500, Rock 1 000 | `BurnBp(+5 000)` |
| Terres Vitrifiées | Corruption 2 000, Chasm 800, Crystal 1 000 | `DeathLeaves(Corruption)` |
| Le Puits | Rock 800, Chasm 400, Ice 500, Lava 500, Corruption 500, Crystal 300, Quicksand 300, Sanctuary 200 (PROPOSAL, feedback F20) | `RangeDelta(−1, except_on: Sanctuary)`, `Rockfall(every: 4, tell: 1)` |
| Ballast (hub, ship interior) | Rock 800, Vent 300, Chasm 200 (PROPOSAL, feedback F21) | none |

**Board-side rules owned here** (pure functions in `abalone-world/src/boardgen.rs` at generation, and
`abalone-rpg/src/terrain_rules.rs` during the fight):

- **RaggedEdge** (Crêtes): `n = tile_seed mod 5` rim cells become Chasm at generation, picked in the
  seeded shuffle of rim cells that are not start cells and not adjacent to one (section 13 V4).
- **Tide** (Littoral): every 6 rounds the "sea side" of the rim (one side of `R + 1` cells: 5 on radius
  4, 4 on radius 3) becomes Chasm for 2 rounds, with a tell 2 rounds ahead; balls on it when it opens
  are removed (terrain with a tell of 2 or more, multi-removal allowed, §6.10 rule 2). Sea side
  (PROPOSAL, feedback F19): the side facing the nearest continent rim tile from the fight's anchor tile
  (ties: side index order E, NE, NW, W, SW, SE); one fixed side per board.
- **Rockfall** (Le Puits): every 4 rounds (TUNE), one empty cell is announced 1 round ahead and becomes
  a permanent Rock; the cell is `h(fight_seed, round) mod` (empty non-start-zone cells, canonical
  order); if a ball stands on it when it falls, the rockfall fizzles (PROPOSAL, no hidden ejection,
  pillar 2). The pick is seeded but public one round ahead, like the Hull cracks.
- **DeathLeaves(Corruption)** (Terres Vitrifiées): a ball that dies at 0 HP turns its cell into a
  permanent Corruption base (on top of the Remains, §6.6); an ejected ball leaves nothing.
- Stat-side rules (`RangeDelta`, `PoisonExtraTurns`, `FrozenExtraTurns`, `BurnBp`, `ResourceGainBp`) are
  data read by `combat-engine`; this role only guarantees they exist and are well formed.
- Mythic terrain affixes (§17: Volcanique, Verglacé, Tectonique) reuse the same records:
  `inject(spec, kind, share)` adds shares at generation; their rules are `encounter-boss-designer`'s.

**Dependencies.** `combat-engine` (stat-side rules, round clock), `class-designer` (affinity),
`encounter-boss-designer` (Mythic affixes, monster families per biome), `gathering-crafting`
(resources per biome), `art-audio` (palettes), `netcode` (fight seed for Rockfall).

**Tests.** Integrity: shares of a biome sum to ≤ 4 000 bp (cap, section 13); every rule names a known
kind. Given a Littoral fight, When round 4 ends, Then the 5 sea-side cells show a tell; When round 6
ends, Then they are Chasm and the balls on them are gone (2 removed in one effect is legal); When round
8 ends, Then they are back. Given a Crêtes tile with `tile_seed mod 5 = 3`, Then exactly 3 rim Chasms,
none on or next to a start cell. Given Le Puits round 4 and an empty cell picked, When a ball moves onto
it before the round ends, Then the rockfall fizzles. Given a death at 0 HP in Terres Vitrifiées, Then
the cell is Corruption; Given an ejection there, Then nothing changes.

**Risks.** Tide and Rockfall timers in group fights depend on the round clock: in a quartet a round is
8 entity turns, so "every 6 rounds" is slow; tuning per format may be needed.

**Tags.** Shares and global rules quoted from §5.2: TUNE. Le Puits mix, Ballast table, sea-side rule,
Rockfall cadence and fizzle, cap 4 000 bp: PROPOSAL, TUNE.

---

## 13. Board generation from a tile (§4.5, §6.8)

**Implementation (`boardgen.rs`).**

```rust
pub struct BoardSpec {
    pub region: Region,               // anchor coordinates
    pub terrain: TerrainMap,
    pub zones: Zones,                 // start cells per seat (section 14)
    pub rules: Vec<BiomeRule>,        // per tile of the union, tagged by tile
    pub sea_side: Option<Direction>,
    pub symmetry: Symmetry,           // None | Point | Rot6
}
pub fn board_for(world: &World, tiles: &[TileId], format: &Format, party: u8,
                 symmetry: Symmetry) -> BoardSpec;
```

Steps, all deterministic:

1. **Region**: `hex(format.radius)` around the anchor, or the union of the tiles (section 15).
2. **Zones**: start cells for every seat (section 14).
3. **Base terrain per cell**: for each tile touched, `candidates = cells of that tile in the region,
   minus every start cell`; for each kind of the tile's biome in table order,
   `count = round(share × |candidates| / 10 000)`; the cells are the first `count` of a Fisher-Yates
   shuffle of the remaining candidates (canonical order, RNG `h(tile_seed, "terrain", attempt, i)`);
   directional kinds draw `dir = DIRS[h(...) mod 6]`; Vents start at a counter of 3.
4. **Biome edits**: RaggedEdge (section 12).
5. **Symmetry** (PvP, BR, section 19): pick only on canonical representatives, mirror the rest.
6. **Validate**:
   - V1 (FINAL, §4.5): no special cell on a start cell.
   - V2 (PROPOSAL): the non-Rock, non-Chasm cells form one connected component.
   - V3 (PROPOSAL): every start cell has a non-Rock, non-Chasm neighbour that is not a start cell of
     another seat.
   - V4 (PROPOSAL, TUNE): no Vent, Quicksand or Chasm adjacent to a start cell (no terrain kill before
     the first turn of an ambush).
   - V5 (PROPOSAL, TUNE): special cells ≤ 40 % of candidates.
7. **Retry**: on a failed check, `attempt += 1`, up to 16 (TUNE); then the **fallback** keeps only the
   kinds that never block or eject (no Rock, Chasm, Vent, Quicksand), which always passes V2 to V4.

"Same tile, same board" (§4.5) holds per `(tile, format, party size)`, because the start zones depend
on them (feedback F6). Radius 3 boards take the middle of the tile; radius 5 boards take the 6
neighbours' cells for the outer ring (section 4).

**Example** (TUNE numbers): Lumen, skirmish radius 3: 37 cells, 2 × 9 start cells, 19 candidates;
Thicket `round(1 000 × 19 / 10 000) = 2`, Rock `round(500 × 19 / 10 000) = 1`.

**Dependencies.** `combat-engine` (`CombatState::new(spec, units)`), `encounter-boss-designer` (format
per encounter, pack size never above the zone, multi-tile arenas), `netcode` (fight seed only for
Rockfall, never for the base terrain), `client-ui` (unfold, decals), `pvp-br-designer` (symmetry).

**Tests.** Given the same tile, format and party size twice, Then identical `BoardSpec` (and identical
JSON). Property over 10 000 tile seeds per biome and format: V1 to V5 hold; the fallback rate is under
1 % (TUNE, reported as a metric). Given Lumen skirmish, Then exactly 2 Thickets and 1 Rock (the example
above). Given two peers (native test and WASM test), Then the same JSON. Given the fallback, Then no
Rock, Chasm, Vent or Quicksand. Golden: one `BoardSpec` per biome for a pinned tile.

**Risks.** Small boards round small shares to 0 or 1: the round-half-up rule keeps every listed kind
visible on radius 4. Validation retries are cheap (37 to 427 cells).

**Tags.** Steps and checks: PROPOSAL. 16 attempts, 40 % cap, round half up: PROPOSAL, TUNE.

---

## 14. Start zones and formations (§6.1, §6.8)

**Implementation (`zones.rs`, `data/formats/*.ron`).**

- **Back-rows rule** (PROPOSAL): the player side of a hexagon of radius R is filled row by row from the
  back row `r = R` towards the centre; the last partial row takes the cells closest to the row's
  middle, ties to the lower q. With R = 4 and 14 cells this is exactly the standard Black layout of
  `rules.md` §2.1 (5 + 6 + the middle 3 of r = 2): the test pins it. The enemy side is the point
  reflection (§4.5).
- **Zone sizes** (cells available, TUNE): skirmish (radius 3) 9; elite and dungeon room (radius 4) 14;
  boss, PvP, arena (radius 4) 14; the zone is larger than the ball count so formations have a choice.
- **Formations** (§6.1: Line, Corner, Arrow): ordered cell lists, slot 0 is the hero's default; the
  first `balls` slots are used. Each is a subset of the zone. Hero slot not on the rim (PROPOSAL: a hero
  on the back row starts one push from death). Example for skirmish (6 balls, zone r = 3 and r = 2):

| Formation | Hero | Fragments |
|---|---|---|
| Line | `(−1,2)` | `(−3,2) (−2,2) (0,2) (1,2) (−1,3)` |
| Corner | `(−1,2)` | `(−2,2) (0,2) (−2,3) (−1,3) (0,3)` |
| Arrow | `(−1,2)` | `(−2,3) (−1,3) (−3,3) (0,3) (0,2)` |

- **Hero swap** (§6.1): the hero may swap with any Fragment slot that is not on the rim.
- **14-ball formats**: every formation fills the whole zone, so only the hero slot differs (feedback
  F7); the 7 interior cells of the standard layout are the hero's choices.
- **Group fights on one board** (§6.8, PROPOSAL): the zone is grown by the back-rows rule to the sum of
  the players' balls; it is cut into seats by sorting cells by `2q + r` (screen x), then r, and slicing
  in seat order (remainder to the first seats); each seat fills its slice front-to-back with the hero
  on the most central non-rim cell; no formation choice in group fights. Packs mirror the slices.
- **Battle royale** (§20): seat zones on radius 8 come from `pvp-br-designer` (OPEN-5 in `rules.md`);
  this module offers `side_zone(radius, side, n)` (the `n` middle cells of one rim side and the row
  inside it, PROPOSAL) and `rot60` for the 6 seats.

**Dependencies.** `combat-engine` (placement phase, 20 s PvP timer, initiative), `ux-designer`
(placement UI, F16), `encounter-boss-designer` (pack ball counts ≤ zone size, boss start layouts),
`pvp-br-designer` (BR seats, arena layouts).

**Tests.** Given radius 4 and 14 cells, Then the back-rows zone equals `rules.md` §2.1 Black. Given
radius 3 and 9 cells, Then rows r = 3 and r = 2 exactly. Every formation is a subset of its zone, has
distinct cells, has at least the format's ball count, and its hero slot is not on the rim. Given a duo
skirmish on radius 4 (5 balls each), Then two disjoint slices of 5, left and right, each hero off the
rim, packs mirrored. Integrity: for every format and party size of §6.8, zone size ≥ balls, and the
enemy zone ≥ the pack's maximum balls (from `encounter-boss-designer` data).

**Risks.** The quatuor skirmish on radius 4 (16 player balls, 4 packs) overfills the board (feedback
F39, same as `encounter-boss-designer` F8).

**Tags.** Back-rows rule, formations, hero off the rim, group slicing: PROPOSAL. Zone sizes: TUNE.

---

## 15. Multi-tile fights (§4.6, §6.8, §18)

**Implementation.**

- **Shapes** (data, `encounter-boss-designer` picks per boss and party size):
  `Shape::Hex(radius)` or `Shape::Tiles(Vec<(i32, i32)>)` with tile offsets relative to the lair tile,
  e.g. `[(0,0),(1,0),(0,1)]` (triangle, the Hull proposal of `encounter-boss-designer`), the flower
  `[(0,0)] + 6 neighbours` (427 cells), a line `[(−1,0),(0,0),(1,0)]`.
- **Union** (§4.6, FINAL "aucune règle spéciale"): `Region::from_cells` of every tile's 61 cells in
  anchor coordinates. Seams have no rule: neighbours across a seam are neighbours; pushes, steps,
  broadsides and ranges work across them; a ball pushed out of the union is ejected.
- **Terrain**: each tile keeps its own biome and seed (a seam can be a biome border).
- **Gated tiles**: a tile whose cells start as Rock overlays (the flower centre until phase 3) or become
  Chasm (a collapsing tile) is just terrain: `tile_cells(shape, i)` gives the cells, the boss mechanic
  (`encounter-boss-designer`) writes the overlays with a tell of 2 or more.
- **Start zones on tiles**: `tile_zone(tile_index, facing, n)` = the back-rows rule on that tile's
  hexagon, rotated by `rot60` so that "back" faces `facing`.
- **Connectivity**: every shape must be connected (each tile adjacent to another); a shape whose
  collapse plan would split the union is flagged by a test (the line of 3 with the middle collapsing,
  feedback F25).

**Dependencies.** `encounter-boss-designer` (shapes, collapse and gate mechanics, the 5 converted
bosses), `combat-engine` (union boards everywhere, no radius assumption), `ai-engineer` (node budgets on
183 and 427 cells), `client-ui` (overview camera, zoom, §4.6), `netcode` (4 peers in raids).

**Tests.**
- Seam push: Given tiles `(0,0)` and `(1,0)`, Black `(3,0)(4,0)`, White `(5,0)`, When `(3,0)(4,0)>E`,
  Then legal and White ends on `(6,0)` (on one radius-4 board, `(5,0)` would be off-board and the push
  an ejection).
- Seam ejection: Given the same union, Black `(0,2)(0,3)`, White `(0,4)`, When `(0,2)(0,3)>SE`, Then
  White is ejected (`(0,5)` belongs to tile `(0,1)`, which is not in the union).
- Union sizes: triangle 183 cells, flower 427 cells, line of 3 183 cells.
- Given the flower with the centre gated as Rock, Then the 6 petals are connected only around the
  centre (connectivity test still passes through the petals' shared edges).
- Range across a seam equals the hex distance in anchor coordinates.

**Risks.** Search cost on 427 cells. Concave unions make "the edge" long: more ejection spots than a
hexagon of the same size; the Edge Danger alert must cover every boundary cell.

**Tags.** Seam rule: FINAL (§4.6, after the Decision). Shapes: owned by `encounter-boss-designer`.
Union sizes: FINAL (geometry).

---

## 16. Anti-stalling geometry: Breach and the edge (§6.7)

**Implementation.**

- **Breach rings** (§6.7: outer ring, tell 2, then Chasm, a new ring every 5 turns "jusqu'au rayon 2"):
  ring `k` is `region.peel(k)`, the cells at distance `k` from the outside of the region. This equals
  the radius rings on a hexagon and generalises to unions and to boards with interior Chasms
  (PROPOSAL, feedback F28). The Breach stops before a peel would leave fewer than 19 cells per tile of
  the union (19 = the radius-2 hexagon), so radius 4 peels 2 rings, radius 3 peels 1, a flower peels 2
  rings of its outline (PROPOSAL). Timing is `combat-engine`'s.
- **The edge for flight** (§6.7 "commencer son tour sur le bord"): a cell of `region.boundary()`, i.e.
  with a neighbour outside the region; interior Chasms do not make an edge (PROPOSAL, feedback F32).

**Tests.** Given `hex(4)`, Then `peel(0)` is 24 cells, `peel(1)` 18, `peel(2)` 12, and the Breach stops
after 2 rings with 19 cells left. Given `hex(3)`, Then it stops after 1 ring. Given a cell next to an
interior Chasm only, Then it is not an edge cell.

**Dependencies.** `combat-engine` (Breach schedule, flight), `pvp-br-designer` (BR uses its own ring
table, `rules.md` §10.4).

**Tags.** Peel rule, 19-cell floor, edge definition: PROPOSAL.

---

## 17. Dungeons (§17)

**Implementation (`dungeon.rs`, `data/dungeons/<id>.ron`).**

- **Plan** (§17 "plans faits à la main, avec des variations par graine"): a small hex map of 15 to 40
  tiles (TUNE) in dungeon-local axial coordinates, grouped in rooms. Fixed: the entrance, the room graph,
  the mid-dungeon Beacon (§17), the boss room shape. Variable: each room's kind from a weighted list, and
  every tile's terrain seed.

```ron
Dungeon(
  id: "cales_du_ballast", level: 8, biome: "ballast", entrance_landmark: Hub,
  rooms: [
    (id: "sas",     tiles: [(0,0)],             kinds: [(Combat, 1)]),
    (id: "soute1",  tiles: [(1,0),(1,-1)],      kinds: [(Combat, 3), (Chest, 1), (Puzzle, 1)]),
    (id: "coursive",tiles: [(2,-1),(3,-1)],     kinds: [(Trap, 1), (Event, 1)], beacon: true),
    (id: "soute2",  tiles: [(3,0),(4,-1)],      kinds: [(Combat, 2), (Chest, 1)]),
    (id: "boss",    tiles: [(5,-1)],            kinds: [(Boss("echo"), 1)]),
  ],
  links: [("sas","soute1"), ("soute1","coursive"), ("coursive","soute2"), ("soute2","boss")],
)
```

- **Instance seed** (PROPOSAL, feedback F29): solo, `h(save_seed, dungeon_id, run_index)`; in a party,
  the seed is drawn by commit-reveal at the entrance (`netcode`); Mythic, `h(world_seed, dungeon_id,
  key_level, iso_week)` so everyone faces the same weekly run. A boss retry keeps the same seed (§6.12).
- **Rooms**: a room triggers when the ball enters its first tile; Combat and Trap rooms unfold the
  trigger tile (format "salle de donjon", radius 4); the Boss room uses its shape (section 15). Trap
  (PROPOSAL, feedback F34): a combat room whose board starts with the Breach already telegraphed (tell
  on turn 1). Event and Puzzle rooms use `narrative-quest-designer` content. A cleared room stays
  cleared for the run.
- **Movement inside**: the same travel functions as the world (section 7), with the dungeon biome cost,
  fog inside the instance, no patrols (rooms are static).
- **Run state**: `DungeonRun { id, seed, difficulty, cleared: BitVec, beacon_reached: bool, retries }`,
  saved in the `combat` store with the fight (§6.12) so a reload resumes.
- **The v1 dungeons** (§17): Les Cales du Ballast (8, Ballast, The Echo), Le Terrier de Cendre (15,
  Sylve), La Tourbière Engloutie (22, Tourbières), La Mine de Verre-étoile (38, Crêtes, The Hull, 3
  tiles), La Fournaise Chantante (50, Caldeira, The Choir), La Chapelle de Verre (65, Terres
  Vitrifiées, The Chaplain), Le Gouffre du Lest (80, Le Puits), Le Pont de Tally (95-100, Ballast, raid,
  flower): one plan file each, written with `encounter-boss-designer`.

**Dependencies.** `encounter-boss-designer` (room encounters, bosses, difficulty, turn budget, Mythic
affixes), `narrative-quest-designer` (events, puzzles, lore objects), `loot-economy` (end chest),
`netcode` (party seed), `client-ui` (instance scene).

**Tests.** Integrity: every plan has 15 to 40 tiles, connected links, one entrance, one boss room, one
Beacon room, room tiles disjoint and adjacent within a room. Given the same seed twice, Then the same
room kinds and the same boards. Given 1 000 seeds, Then every room kind of a list appears (weights
respected within ±3 points, TUNE). Given a party of 3, Then the boss room uses the trio shape. Given a
reload mid-run, Then cleared rooms stay cleared and the ball is on the last tile. e2e (R8, with
`client-ui`): enter Les Cales from the hub, clear the first room, reach the mid Beacon, reload, resume.

**Risks.** 8 hand plans plus variations is content work; the format keeps each plan under 60 lines.

**Tags.** 15 to 40 tiles: TUNE (§17). Seeds, trap rule, room trigger: PROPOSAL.

---

## 18. Day, night and weather (§4.8, v2)

**Implementation (`sky.rs`).**

- **Cycle** (§4.8): 40 min of UTC time, `phase = (unix_ms / 60 000) mod 40`; night is minutes 30 to 39
  (PROPOSAL, TUNE, feedback F30), the same for everyone.
- **Weather per zone**: one slot every 10 min (TUNE): `weather = table[h(world_seed, zone, unix_ms /
  600 000) mod Σweights]`, tables per biome in data (rain in Sylve, Tourbières, Littoral; sandstorm in
  Dunes; clear elsewhere, PROPOSAL).
- **Frozen in fights** (PROPOSAL, feedback F30): the fight request carries `night` and `weather` read at
  the trigger; in a party the values are part of the commit-reveal of the fight; nothing changes during
  a fight (deterministic combat).
- Effects (night +10 % monster stats, rain lightning +25 % and fire −25 %, sandstorm range −1) are data
  read by `combat-engine` and `encounter-boss-designer`.

**Tests.** Given unix minute 1 830 (minute 30 of a cycle), Then night. Given the same zone and slot,
Then the same weather on two peers. Given a fight started at minute 29, When minute 30 passes, Then the
fight still reads day.

**Dependencies.** `combat-engine`, `encounter-boss-designer`, `client-ui` (sky, map icons).

**Tags.** 40 min: TUNE (§4.8). Night window, slot length, tables, freeze: PROPOSAL.

---

## 19. Symmetric boards for PvP and battle royale (§4.5, §19, §20)

**Implementation.** `Symmetry::Point` (§4.5: "réflexion par rapport à un point", 1v1 and 2v2 arenas):
the generator picks terrain on the canonical representatives (cells with `(r, q) <` their reflection in
canonical order, and the centre), then copies to `reflect(c)`; a directional cell's direction is
reversed (the reflection turns it by 180°). `Symmetry::Rot6` (PROPOSAL, battle royale with 6 seats):
pick on one sixth (a wedge of the ring walk), copy with `rot60` k times, directions turned by k × 60°.
Arena boards are not world tiles: their seed is the match seed (commit-reveal, `netcode`), their biome is
chosen by `pvp-br-designer`.

**Tests.** Property over 1 000 seeds: for every cell `c`, `kind(c) == kind(reflect(c))` and a Slope at
`c` pointing d has its twin pointing `−d` (Point); the same under `rot60` (Rot6). Given 3, 4 or 5 BR
players, Then the board is still Rot6 (seats use a subset of the 6 wedges, `pvp-br-designer`).

**Dependencies.** `pvp-br-designer` (formats, seats, normalisation), `netcode` (match seed).

**Risks.** With 3 to 5 BR players, 6-fold symmetry leaves empty wedges: fair but not balanced; the seat
choice is `pvp-br-designer`'s.

**Tags.** Point symmetry: TUNE (§4.5). Rot6: PROPOSAL.

---

## 20. WASM bridge and data integrity (§24.3, §24.4)

**WASM functions** (JSON, versioned `{ "v": 1, ... }`, PROPOSAL; conventions are `tech-lead`'s):

| Function | Returns |
|---|---|
| `world_info()` | version, radius, zones with bands, open flags, hub, Beacons |
| `world_tile(q, r)` | biome, level, content kind, landmark id |
| `world_path(from, to, speed_json)` | tiles and `ms` per step |
| `world_patrol(tile, now_ms)` | pack position |
| `board_for_tile(q, r, format, party)` | `BoardSpec` JSON: `region` (cells, r then q), `terrain` (kind, dir, timer, overlay), `zones`, `rules`, `sea_side` |
| `dungeon_start(id, seed, difficulty)` | instance map and room kinds |

**Integrity tests** (§24.3), in `abalone-world/tests/integrity.rs`: every biome kind exists in
`cells.ron`; every zone names a biome; every dungeon names a biome and a boss known to
`encounter-boss-designer` data; biome share sums ≤ 4 000 bp; formation sizes ≥ ball counts for every
format of §6.8; every landmark is on an open or planned zone tile; the world golden hash matches its
version.

**Dependencies.** `tech-lead` (bridge conventions), `client-ui` (consumer).

---

## 21. Feedback on the gameplay spec

Contradictions and gaps found while writing this spec. The gameplay spec is not modified; each item
needs an answer from an owner, in #313 or a follow-up Decision.

- **F1 (§4.3).** The content shares sum to 94 % (55 + 15 + 3 + 15 + 2 + 3 + 1) plus "rare" and "changes
  over time" rows; Empty is not defined as the remainder. Proposed: Empty is the remainder of the rolled
  table, landmarks are not rolled (section 6).
- **F2 (§4.2).** Step costs exist for 5 terrain classes only; Dunes, Littoral, Caldeira, Terres
  Vitrifiées, Le Puits, the hub and dungeon interiors have none. "Glace: on glisse d'une tuile de plus"
  is not defined on the map (direction, chain, blocked tile).
- **F3 (§4.2, §7.1, §9.2).** Speed sources (Élan −20 % and −35 %, VIT +0.5 % per point, Chasseur
  implacable, Bottes magiques) have no stacking rule and no floor.
- **F4 (§4.1 vs §6.8).** The tiling uses radius-4 boards, but formats use radius 3, 5 and 8. Nothing says
  where a radius-5 or radius-8 board takes its outer cells (they lie on neighbour tiles) nor which part
  of the tile a radius-3 board uses. Proposed: global terrain per combat cell (section 4).
- **F5 (§4.1, §4.5).** The tile lattice is rotated about 26.3° against the cell grid: a world drawn with
  regular hexes will not line up with the board seams, and the unfold animation must turn. Not
  mentioned.
- **F6 (§4.5).** "La même tuile donne le même plateau" cannot hold across formats and party sizes,
  since start zones (where no special cell may be) depend on them. Proposed: same `(tile, format, party
  size)`, same board.
- **F7 (§6.1).** Formations are "subsets of the standard placement", which exists only for radius 4 and
  14 balls; at 14 balls (boss, PvP) every formation is the whole set; radius 3, 5 and 8 have no standard
  placement (same as `ux-designer` F16). Proposed: the back-rows rule (section 14).
- **F8 (§6.2, §6.8).** Start positions for several players and several packs on one board are not
  defined. Proposed: slices of the grown zone (section 14).
- **F9 (§5.1).** "Gouffre: déjà dans le moteur, `Board::void`": `void` is permanent, but Effondrement,
  Marée, Séisme and the Brèche make timed or late Gouffres and Pont fills one. The Gouffre must be a
  terrain kind (section 3.2).
- **F10 (§5.1 Glace, §6.10 rule 3).** "La dernière case du plateau" is ambiguous with interior Gouffres;
  whether a lone pusher (Percée 1 against 1) slides is not said; the order between the classic sumito
  ejection and the slides is not said.
- **F11 (§5.1 Pente).** Which cell's Slope counts (the pusher's front cell, any group cell, the file's)
  and what the 4 other directions do are not defined.
- **F12 (§5.1 Évent).** N is not given, nor whether the countdown restarts, nor what happens when the
  target cell holds a ball or a Rock, nor whose turns count.
- **F13 (§5.1, §5.2, §6.7).** Neutral terrain timers (Évent, Marée, Éboulement, Brèche "à partir du tour
  30 de chaque entité") have no clock in group fights, where entities do not share turns. Proposed:
  rounds for neutral terrain, owner turns for ability terrain.
- **F14 (§5.1 Sables mouvants).** "Enracinée" forbids voluntary moves, yet the ball "can still leave
  with a Pas", and a turn has no free Pas (bonus Steps come from abilities only, §6.3).
- **F15 (§5.1 Cristal).** Is a Crystal a floor or an obstacle? "Une capacité qui touche un Cristal"
  does not say how a floor cell holding a ball is "touched".
- **F16 (§5.1 Eau).** Mouillé has no duration; when the Brûlure goes out (on entering, at end of turn)
  is not said.
- **F17 (§5.1 Sanctuaire).** "Un allié" of whom, for a Sanctuary generated by the biome (no owner)?
- **F18 (§5.1 Fourré, Hauteur, §6.5).** Their ±% are not placed in the damage formula: additive in
  `Σbonus` or multiplicative.
- **F19 (§5.2 Littoral).** "Le côté mer du bord (5 cases)" fits radius 4 only, and which side is the sea
  on an inland tile is not said.
- **F20 (§5.2 Le Puits).** "Un mélange" has no shares; Éboulement has no cadence, no rule for an
  occupied cell, no duration.
- **F21 (§5.2, §17, §21).** Les Cales du Ballast ("intérieur du vaisseau") and Le Pont de Tally (raid on
  the Ballast) have no terrain table, and row H says "pas de combat" at the Ballast except duels and the
  arena, which contradicts the final raid on the Bridge.
- **F22 (§5.2).** Level bands overlap (10-20, 15-25, 20-35, ...) and nothing says how a tile's level is
  set inside its zone, though monster level and XP depend on it.
- **F23 (§25 R2).** "6 types de cases" are not named. The R2 classes already create Roc (Mur de
  boucliers), Glace (Sol verglacé), Lave (Mur de flammes) and Sanctuaire (Source), and the R4 biomes need
  Fourré, Ronces, Boue, Eau and Gouffre. Proposed: R2 = Roc, Gouffre, Glace, Boue, Lave, Sanctuaire; R4
  adds Fourré, Ronces, Eau.
- **F24 (§4.4, §4.5).** Which tile unfolds (the ball's or the pack's, which patrols), how a patrol
  moves, and how a click-engage reaches the pack without triggering its aggro are not defined.
- **F25 (§4.6, §18).** The Hull on "3 tuiles en ligne" whose middle board collapses leaves two tiles that
  do not touch, so migration "à travers les coutures" is impossible after the collapse (same as
  `encounter-boss-designer` F4).
- **F26 (§11 vs §4.1).** "L'île de Lumen" vs a single continent with Lumen as zone 1 (same as
  `narrative-quest-designer` F1).
- **F27 (§24.1).** The claim that `Board`'s `HashMap` makes scan order vary is not true in the current
  code (the map is never iterated); the real blocker is `MAX_RADIUS = 5` in about 25 scan loops. Also,
  the canonical "r then q" order differs from the classic scan order "q then r"; changing the classic
  order would change search tie-breaks, boss fixtures and the ladder.
- **F28 (§6.7).** The Brèche "anneau extérieur ... jusqu'au rayon 2" is undefined on multi-tile unions,
  on radius 3 and on boards with a ragged edge. Proposed: peel layers (section 16).
- **F29 (§17).** "Variations par graine": which seed (save, party commit-reveal, week for Mythic) is not
  said; a party must share it.
- **F30 (§4.8).** The night length inside the 40 min cycle is not given, and nothing says the weather
  and night are frozen during a fight (determinism needs it).
- **F31 (§4.5, §20).** Battle royale with 6 players needs 6-fold rotation symmetry, not point
  reflection; directional cells (Pente, Évent) must turn with the symmetry.
- **F32 (§6.7 Fuite).** "Sur le bord" is undefined next to interior Gouffres and on unions.
- **F33 (§4.2).** Beacon count and density are not given.
- **F34 (§17).** "Piège" and "événement" rooms have no definition.
- **F35 (§4.1, §4.3).** The "nettoyée" flag has no respawn rule for packs (nodes have one in §14, rare
  named in §5.3).
- **F36 (§4.1, §25 R4, §26 Q3).** R4 ships 3 biomes on a world planned at radius 60; if the world size
  changes later, every saved tile flag breaks. Proposed: pin the full world from R4, open zones by data.
- **F37 (§5.2 Crêtes).** "0 à 4 cases du bord sont des Gouffres" does not say how it interacts with start
  cells on the back row.
- **F38 (§4.4, §5.2).** Zone borders put low-level zones next to high-level ones (any layout with 10
  bands on one continent does); the spec does not say whether borders are soft (level glyph only) or
  gated.
- **F39 (§6.8).** The quatuor skirmish on radius 4 places 16 player balls and 4 packs of 4 to 7 balls:
  32 to 44 balls on 61 cells (52 % to 72 %, classic Abalone is 46 %), with little room for terrain
  (same as `encounter-boss-designer` F8).

---

## 22. Open questions

1. Does `level-designer` own `Region` and the terrain layer in `abalone-core`, with `combat-engine`
   building occupants and the weighted push on top? (The lead confirms the split.)
2. World layout: concentric core (Le Puits, Terres Vitrifiées) with 8 outer sectors and the hub on the
   south rim, or a hand-drawn macro map?
3. Are the new terrain tables for the Ballast interior and Le Puits mix accepted?
4. R4 world: the full radius-60 world pinned with zones 4 to 10 closed, or a smaller v1 world?
5. Pack respawn after clearing: 10 min real time, or on leaving the zone?
6. Fight board = the tile under the ball at the trigger?
7. Neutral terrain timers count in rounds, ability terrain in the owner's turns?
8. Is the plain-board fallback after 16 failed generations acceptable?
9. Keep the classic scan order inside `legal_moves` and use "r then q" only for RPG rules?
10. World version policy: drop tile flags on a world change, or write migrations?
11. Group fights: no formation choice, fixed slices?
12. Hero never placed on the rim at the start?
13. Zone borders: soft (level glyph only) or gated?
14. In a party, who drives the ball on the map and whose clock drives patrols (`netcode`, §4.7)?

---

## 23. Tasks (one PR each)

IDs `LD-nn`. Every code task: failing test first, 100 % line and region coverage, `cargo llvm-cov`
gate, one e2e run when a player sees it, screenshot in the PR when the UI changes (CONTRIBUTING 6.4).
Client rendering is `client-ui`'s; the e2e lines below are written with them.

### LD-01 Spec: world, biomes and board generation docs (R0)

Outcome: `docs/specs/rpg/open-world.md` and `docs/specs/rpg/biomes.md` carry the cell catalog, the
biome tables, the tiling and the board generation rules of this file (docs PR 3 of §0).

- [ ] Cell catalog with one rule and one glyph per kind, interpretations marked PROPOSAL.
- [ ] Biome tables, global rules, tiling formulas, generation steps and checks.
- [ ] Given/When/Then examples for Roc, Gouffre, Glace (one ejection), Pente, seams for `rules.md`
      §10.5 (shared with `combat-engine`).
- [ ] Feedback items F1 to F39 linked from the Decision #313 thread.

### LD-02 Board region without `MAX_RADIUS` (R1)

Outcome: `Board` sits on a dense `Region` of any shape and size, and every classic result is unchanged.

- [ ] `region.rs` with `hex`, `from_cells`, `contains`, `add`, `remove`, `coords`, `canon`,
      `boundary`, `peel`, `rot60`, `reflect`, `dist`.
- [ ] Every `-MAX_RADIUS..=MAX_RADIUS` scan replaced by `coords()`; `MAX_RADIUS` deleted.
- [ ] New perft tests and a golden `legal_moves` list, recorded before the change, still green.
- [ ] Boss fixtures and a seeded ladder report unchanged; Ballast Mind search not slower.

### LD-03 Start zones and formations for solo formats (R1)

Outcome: every solo format of §6.8 has a start zone and three formations, so R1 can place a Warrior and
his squad.

- [ ] `zones.rs` back-rows rule; radius 4 and 14 cells equals `rules.md` §2.1 Black.
- [ ] `data/formats/*.ron` for skirmish, elite, dungeon room, boss (zones and formations).
- [ ] Integrity: subsets, sizes, hero off the rim, enemy zone mirrored.

### LD-04 Terrain layer and cell catalog (R2)

Outcome: boards carry terrain with base, overlay and timers, hashed in canonical order.

- [ ] `terrain.rs` types, overlay replace and expiry, `Clock::Owner` and `Clock::Round`.
- [ ] `data/terrain/cells.ron` with the 16 kinds and their glyph ids, integrity tests.
- [ ] `hash_into` covered by equal and unequal map tests.

### LD-05 Rock, Chasm and the ice slide (R2)

Outcome: Roc, Gouffre and Glace follow §5.1 with at most one ejection per action.

- [ ] `blocks`, `ejects`, `slide`, `slide_all` with the `Allowance`.
- [ ] The Given/When/Then cases of sections 11.1 and 11.2, plus the slide property test.
- [ ] Wired by `combat-engine` (their PR), tested here as pure functions.

### LD-06 Mud, Lava and Sanctuary rules (R2)

Outcome: the rest of the R2 six cell types (F23) work in a fight.

- [ ] Mud Weight bonus and broadside ban; Lava and Sanctuary end-of-turn effects with owner rule.
- [ ] The cases of sections 11.3 and 11.5 (Mud and end-of-turn parts).
- [ ] Weight invariant: no Mud and no Slope means bonus 0.

### LD-07 Board generator v1 (R2)

Outcome: a pure generator turns a seed, a biome table and a format into a valid `BoardSpec`.

- [ ] `boardgen.rs` steps 1 to 7 on a single hexagon, with checks V1 to V5 and the fallback.
- [ ] Property test over 10 000 seeds; fallback rate reported.
- [ ] Native and WASM JSON equal for a pinned seed.

### LD-08 Tiling and tile seeds (R4)

Outcome: world tiles map to combat cells and back, with stable seeds.

- [ ] `tiling.rs`: `M`, `tile_of`, `tile_seed`, anchor coordinates, unions of tiles.
- [ ] Tiling property tests and golden seeds.
- [ ] `rng.rs` moved from `encounter/hull.rs` if `tech-lead` has not done it.

### LD-09 World map: zones, biomes, levels (R4)

Outcome: the pinned radius-60 world with 10 zones and the hub, Lumen, Sylve and Tourbières open.

- [ ] `map.rs` ring walk, sectors, jitter, smoothing, tile levels; `data/world/world.ron`.
- [ ] Contiguity, size, adjacency, level tests and the golden map hash.
- [ ] No float in the module.

### LD-10 Tile content and landmarks (R4)

Outcome: every open tile has deterministic content, safe zones and Beacons.

- [ ] `content.rs` roll table, landmarks (hub, camp, outposts, Beacons, dungeon entrances, lairs).
- [ ] Spacing rules and share tests on the pinned world.
- [ ] `data/world/content.ron`.

### LD-11 World travel and fog (R4)

Outcome: the ball walks the world by A* with biome step times, ice slides, fog and discovery.

- [ ] `travel.rs`: costs, speed formula, slide, A* with Dijkstra property test.
- [ ] Discovery and zone percentage; out-of-combat regeneration; Beacon activation and travel.
- [ ] e2e with `client-ui`: click-walk 5 tiles, `data-path-steps`, zone percentage rises.

### LD-12 Packs on the map and engagement (R4)

Outcome: packs patrol, ambush or get engaged, and a fight request names the tile to unfold.

- [ ] `engage.rs`: patrol positions, aggro 1 and 2, click-engage, cleared respawn.
- [ ] Fight request `{ tile, format, pack, initiative }`.
- [ ] e2e with `client-ui`: walk next to a pack, the tile unfolds, the pack plays first.

### LD-13 Three biomes in fights (R4)

Outcome: Lumen, Sylve and Tourbières tiles unfold into their own boards.

- [ ] Thicket, Brambles and Water rules (sections 11.4, 11.6, 11.10).
- [ ] Biome files for the three zones with `RangeDelta` and `PoisonExtraTurns` data.
- [ ] `board_for_tile` across the WASM bridge; golden board per biome.

### LD-14 World flags in the hero save (R4)

Outcome: discovery, Beacons, cleared packs, opened chests and harvested nodes survive a reload.

- [ ] `WorldFlags` type, versioned JSON, round trip.
- [ ] World version policy test (flags reset, hero kept).
- [ ] e2e with `client-ui`: discover tiles, reload, the fog stays lifted.

### LD-15 Multi-tile unions (R8)

Outcome: a fight can run on any connected union of tiles, seams with no rule.

- [ ] `Shape`, union regions in anchor coordinates, per-tile terrain, `tile_zone` with facing.
- [ ] Seam push and seam ejection tests, union sizes, connectivity check for collapse plans.
- [ ] Breach peel rule and edge definition (section 16).

### LD-16 Dungeon plans and instances (R8)

Outcome: a dungeon plan file gives a seeded instance with rooms, a mid Beacon and a boss room.

- [ ] `dungeon.rs` plan format, integrity tests, instance seed rules, room kinds by weight.
- [ ] Les Cales du Ballast plan with the Ballast terrain table.
- [ ] Room triggers, run state saved and resumed.

### LD-17 Dungeon runs end to end (R8)

Outcome: the player enters Les Cales from the hub, clears rooms, reaches The Echo and can resume.

- [ ] In-instance travel and fog, trap room (Breach told from turn 1), boss room shape per party size.
- [ ] The remaining 7 plans (with `encounter-boss-designer`).
- [ ] e2e with `client-ui`: enter, clear a room, mid Beacon, reload, resume.

### LD-18 Static modifier cells: Slope, Height, Crystal (R9)

Outcome: Pente, Hauteur and Cristal work as in section 11.

- [ ] Slope bonus on the front pusher, rotation with Rotation (§8.8).
- [ ] Height range and damage, Crystal single bounce.
- [ ] The Given/When/Then cases of sections 11.3, 11.4 and 11.9.

### LD-19 Timed cells: Quicksand, Vent, Corruption (R9)

Outcome: Sables mouvants, Évent and Corruption work with their tells.

- [ ] Quicksand root, exit Step, sink with tell; Vent countdown and push; Corruption stacks.
- [ ] The cases of sections 11.5, 11.7 and 11.8.

### LD-20 The seven remaining biomes (R9)

Outcome: all 10 zones open, each with its terrain and global rule.

- [ ] Biome files for Dunes, Crêtes, Toundra, Littoral, Caldeira, Terres Vitrifiées, Le Puits.
- [ ] RaggedEdge, Tide, Rockfall, DeathLeaves rules with tests; `inject` for Mythic terrain affixes.
- [ ] `open: true` for every zone; world golden hash unchanged (no version bump).

### LD-21 Day, night and weather (R9, v2)

Outcome: the UTC sky schedule feeds fights, frozen at the trigger.

- [ ] `sky.rs` cycle, night window, weather slots and tables.
- [ ] Freeze test; same values on two peers.

### LD-22 Group start zones (R10)

Outcome: duo, trio and quatuor fights place every player and pack.

- [ ] Grown zones, slices by screen x, heroes off the rim, packs mirrored.
- [ ] Integrity over every group format of §6.8 (fails loudly on overfull formats, F39).

### LD-23 Symmetric boards for PvP and battle royale (R10)

Outcome: arena boards are point-symmetric and battle royale boards 6-fold symmetric.

- [ ] `Symmetry::Point` and `Symmetry::Rot6` in the generator, directions turned.
- [ ] `side_zone` helper for `pvp-br-designer`; symmetry property tests.
- [ ] e2e with `client-ui` and `pvp-br-designer`: a two-tab arena shows mirrored terrain.
