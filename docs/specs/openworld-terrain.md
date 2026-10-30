# Open world terrain (#962, tasks #983, #984, #987, #988)

One topic: how the generated map of the Open world gets large landmarks and fine detail, regions with
their own look, a taller relief and an easier walk. It builds on `openworld.md` section 2 (the map) and
changes no rule of Abalone (`rules.md`). Owner requests of 2026-10-30: "ajoute des biomes / variations dans
la map, procedural toujours, plusieurs niveaux de cartes de terrain pour avoir du detail micro et macro",
"diminue le nombre d'obstacles/arbres, le deplacement est souvent difficile", "augmente le relief".

Four tasks change the same lines and every world of every seed, so they go **one after the other**
(section 7). Each pins the world with the digest test of #981 and updates its value on purpose.

## 1. Today

- `cell(seed, q, r)` in `crates/abalone-core/src/world.rs`: height 0 to 3 from
  `0.65 * noise(.., 12) + 0.35 * noise(.., 5)` (thresholds 0.32, 0.50, 0.64), a `dry` noise (scale 9) picks sand
  or rock over grass, forests are `noise(.., 7) > 0.55` and half their grass is a tree, a boulder stands on
  6 % of the open cells, a wall segment per 24-cell square. `noise` is value noise with a smooth blend
  between the corners of a lattice of `scale` cells.
- The chunk bytes are 2 per cell: height, terrain code. The client column is `topOf = 0.2 + 0.2 * height`.
- Seen from afar the map is fine static: one scale everywhere, no landmark.

## 2. Levels of noise (#983)

A **field** is a weighted sum of value noise at three scales, each from the seed, its own salt and the cell,
so any order of visit gives the same world:

| Level | Scale (cells) | Gives |
|---|---|---|
| macro | 128 | continents and seas, climate regions |
| meso | 40 | ranges, big lakes, plateaus, forest patches |
| micro | 8 | local bumps, ragged borders |

- `field(seed, salt, q, r, weights)` replaces the one-off `noise` calls: `w_macro * noise(.., 128) +
  w_meso * noise(.., 40) + w_micro * noise(.., 8)`, weights summing to 1. First values: height 0.50, 0.35,
  0.15; moisture 0.45, 0.35, 0.20; temperature 0.55, 0.30, 0.15 (section 4). The salts are 30 and up (the
  enemy draws use 12 to 21); the existing ones keep their meaning until their code is replaced.
- **Scale**: the widest zoom sees about 21 chunks (about 340 cells) across, so the macro level must repeat well
  inside that: at 256 cells one feature filled the view and the far view read as a plain (measured in #983).
- **Spawn land**: the macro level of the elevation is offset per seed by one of 16 offsets (up to 4096 cells,
  searched once per seed): the first whose cells (the spawn, the corners of the ring of radius 4, twelve cells on
  radius 8 and twelve on radius 32) are all land, heights 2 to 6, else the one with fewest that are not. No
  fade near the spawn: a fade widens the flat area the far view shows.
- Value noise of several levels bunches around 0.5, so **thresholds are measured, not guessed**: a test
  computes the histogram of a field over a window of chunks and the constants are the quantiles that give the
  target shares below. The constants carry a comment saying so.
- **Eight heights**, 0 to 7 (a `u8` already, `Cell.height`). Target share of the cells per level:
  8, 10, 12, 16, 18, 16, 12, 8 %. Levels 0 and 1 are water (18 %), 2 is a sandy shore, 3 and 4 are the biome's
  low ground, 5 and 6 the uplands (rock), 7 is a peak (8 %, blocked). Peaks and water are the large
  obstacles, so the macro and meso levels must make them come in masses, not in dust.
- **Cost**: each lattice node is hashed once per chunk and each cell interpolates from the chunk's tables, as
  #981 did for the old noise. Budget: one chunk at most 20 us native, the 4096 chunks at most 3 times the
  figure #981 reports (about 27 ms), measured in the PR with the timing example that #981 adds (`crates/abalone-core/examples/world_timing.rs`).
- **Client**: until #988 the visible column must not change, so `topOf` maps the eight levels onto today's
  scale (`0.2 + 0.2 * level * 3 / 7`) in #983. #988 replaces it.

## 3. Fewer obstacles (#987)

Smallest task, first in the order. Only constants of `cell`:

- A forest cell is a tree one time in four (`unit(.., 6) < 0.25`, was 0.5).
- Boulders: 20 per mille of the open cells (`BOULDER_PER_MILLE = 20`, was 60).
- Water, peaks and walls unchanged.
- **Test**: in the 5 x 5 chunks around the spawn, for 8 seeds, a flood fill over the six neighbours from the
  spawn reaches at least 90 % of the open cells, and the blocked share is under the old bound; the existing
  share test is tightened to the measured figures (blocked 10 to 35 %, boulders at most 2 %).
- `openworld.md` section 2 states "about 6 %" and "about half": updated in the same PR (or in the pending
  spec PR #969 if it is still open).

## 4. Biomes (#984)

A biome is a region with its own ground, trees and boulders. Two slow fields and the height decide it.

- **Temperature** `T` and **moisture** `M`: `field` of section 2, with `T` lowered uphill
  (`T -= 0.04 * (height - 3)`). Each threshold is moved by `(micro - 0.5) * 0.08` so a border is ragged, not a
  straight line.
- **Table** (thresholds measured, target shares of the land):

| Biome | Condition | Land share |
|---|---|---|
| Tundra | `T < t_cold` | 15 % |
| Desert | `T > t_hot` and `M < m_mid` | 15 % |
| Badlands | `T > t_hot` and `M >= m_mid` | 10 % |
| Forest | otherwise and `M >= m_wet` | 25 % |
| Meadow | otherwise | 35 % |

- **What a biome changes**: the ground tint of the low ground (levels 3 and 4), and the density of the
  obstacles per open cell. Water, shore (level 2), uplands and peaks keep their terrain in every biome.

| Biome | Ground tint | Tree | Boulder (per mille) |
|---|---|---|---|
| Meadow | green | 2 % | 15 |
| Forest | deep green | 25 % | 15 |
| Tundra | snow white | 4 % | 25 |
| Desert | warm sand | none | 30 |
| Badlands | dark red rock | none | 45 |

  The averages stay near #987's figures: the blocked share test of #987 still holds (a tolerance of 20 %).
- **No new `Terrain`**: the tint is a colour, not a terrain. The ground and the props are tinted per
  instance, `LOOK[ground] x BIOME_TINT[biome]`, the same mechanism as the water's per-cell colour (`setColorAt`),
  so no new mesh.
- **Chunk bytes**: 3 per cell, `height, terrain, biome` (the biome code is the table's order, `u8`).
  `world_chunk` returns `3 * 256` bytes, `parseChunk` reads a `biome` into `Tile`. Enemies are untouched.
- **Spawn**: the clearing is Meadow.
- **Tests**: every biome appears in a 16 x 16 chunk window of several seeds; the shares are within 5 points
  of the table; two cells of the same biome and the same height have the same terrain unless an obstacle
  stands on one; the spawn clearing is Meadow and open; the order of visit does not matter.

## 5. Relief (#988)

Client only, after #983 (it needs the eight heights).

- `topOf(level) = 0.2 + STEP * level`, water at 0.08. **`STEP = 0.5`** (a peak at 3.7), kept on screenshots of
  seed 7 at STEP 0.3, 0.4 and 0.5, closest and widest: 0.3 reads flat (the cliff faces are thin), 0.4 shows short
  faces, 0.5 shows the rock plateaus and the peak cluster standing clear of the grass with tall side faces, and no
  cell hidden behind a peak at close zoom. Props, marbles and the troop stand on `topOf`; the mountains (1.2 to 2.0
  high) read as spires on the taller columns, so their scale is unchanged.
- **Finding**: on seed 7 no two passable cells differ by 2 levels or more within 45 cells of the spawn: the steepest
  step a hero can walk is one level. The tall faces are peaks (blocked, level 7) against rock (level 6), 22 cells out
  at (-8, 22) and (-8, 23). The e2e test steps onto a cell one level up, (4, 0).
- **Camera**: it follows the hero's column top with an ease, `y += (target - y) * (1 - exp(-dt / 0.12))`, so a
  step up or down a cliff does not jump. A gap within 0.01 snaps; reduced motion jumps at once. The mode draws
  every frame of the ease and none after it settles. At STEP 0.5 a 3-level step (a gap of 1.5) is 0.010 from the top
  after 0.6 s, on the top within 0.67 s.
- **Pick**: a click is the nearest hit of the ray among the hero's cell and its six neighbours, each tested
  against its own top plane `y = topOf(cell)` and kept only if the hit point lies in that cell (`cellAtPoint` of the
  hit is the candidate). No hit, no move: the hero's own cell comes back and the roll does nothing. A lower cell
  hidden behind a higher ring cell cannot be clicked at its top centre: the test covers all six neighbours above the
  ring's level and the two in front below it.
- **Cost**: the build is unchanged: a rebuild at the widest zoom takes a median 38.6 ms on main and 38.8 ms with this
  task (35 rebuilds each, in node, a synthetic world of every terrain and height).
- Cost: no per-frame work added; a rebuild does not get slower.

## 6. Shared rules

- **Order independence and determinism**: a chunk comes from the seed and its coordinates alone.
- **Spawn**: radius 3 open grass, reachable, no enemy within 8 (`openworld.md` section 2).
- **World version**: each task changes every world. Once the save of #968 stores a seed, it also stores a
  `WORLD_VERSION` (a constant bumped by each terrain task), so an old save is told apart, not misread.
- **Memory and speed** follow #981: bounded chunk caches (512 chunks, radius 10), no per-frame allocation, a
  rebuild under about 40 ms at the widest zoom.

## 7. Order of work and conflicts

One task at a time, each branched from `main` after the previous merged (CONTRIBUTING rules 15 and 16):

| Order | Task | Lines it touches |
|---|---|---|
| 1 | #987 fewer obstacles | the constants of `cell`, `world.rs` tests, the digest |
| 2 | #983 noise levels, eight heights | `cell` (the elevation and thresholds), a `field` helper, `topOf` mapping, the digest |
| 3 | #988 relief | `topOf`, `pick`, the camera follow in `openworldview.ts`; no engine file |
| 4 | #984 biomes | `cell`, the chunk bytes (`world.rs`, `abalone-wasm/src/world.rs`, `parseChunk`, `Tile`), instance colours in `OpenWorldView.build` |

#988 can run beside #983 only if it waits for the eight heights, so it is kept after it. Nothing here runs
beside the zoom group (#976 to #981) while that group is open: it touches `openworldview.ts` and `world.rs`.

## 8. Open choices

- **Biome tint per instance colour** (recommended) or one mesh per ground and biome (more draw calls).
- **Biome as a third byte** (recommended, simple) or packed in the terrain byte (less memory, harder to read).
- **Rivers, swamps and more biomes**: not now; each needs its own task once these four are in.
