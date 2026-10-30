# Open world (#962)

A secondary mode, like the boss fights (#934) and the rogue-lite run (#797): a huge generated hex
map, a hero marble the player walks, and a troop that follows it and fights on its own. The core of
the game stays Abalone. Owner request of 2026-10-30, pending Decision #962. It sits beside the
A-light Explore (#720 to #725), which it does not touch.

## 1. The mode

- **Entry**: "Open world" in the mode menu, for everyone, no flag (#1000). A click rolls a random
  seed; `?openworld=<seed>` fixes it (tests, sharing a world). Leave returns to where the player
  came from.
- **Delta to Abalone**: none to the move, the push or the legality (`rules.md`). The mode adds a
  map, obstacles and an automatic troop whose only attack is a legal Abalone push (pillar 1).
- **Not now**: HP, damage, levels, items, economy, real-time fights (each needs a Decision, #313).

## 2. The map

- **Cells**: the axial hex grid, cut into **chunks** of 16 x 16 cells (a parallelogram tiles the
  axial grid with no gap). The world is 64 x 64 chunks (1024 x 1024 cells) and a chunk is
  generated only when the hero is within 2 chunks of it.
- **Seed**: a chunk comes from the world seed and its coordinates alone (engine splitmix64), so
  the same seed always gives the same world, in any order of visit. Saving a world is its seed.
- **Relief**: every cell has a height 0 to 3 from smooth value noise. The renderer lifts the cell
  column to `0.2 + 0.2 * height` (water to 0.08) and lights it. The height itself never changes a
  move or a push: it only picks the terrain, and a terrain that blocks is an obstacle.
- **Terrain**: from height and a second noise (moisture), one look per cell: **lakes** (water,
  height 0), sand, grass, rock, **mountains** (peaks, height 3). Forests (**trees**, on grass in a
  forest noise, about half its cells) and ruined **walls** (segments of 3 to 6 cells along one of
  three axes, one per 24-cell square at most, laid on land) come on top.
- **Obstacles**: blocked cells the hero, the troop and the enemies cannot enter: water, mountains,
  trees, walls, and scattered boulders (about 6 % of the open cells). A push into an obstacle is
  refused, as a push into a friendly marble is in `rules.md`.
- **Style**: low-poly and faceted, as the bay: flat-shaded hex columns, coolant-blue lakes that glow
  a little, dark faceted spires for the mountains, teal wire pines, grey boulders, black gantry
  walls. The props are meshes made in Blender (`client/models/openworld.glb`, a few faces each,
  packed with meshopt); the ground is one instanced hex prism per terrain.
- **Spawn**: a clearing of radius 3 around the start cell has no obstacle and no enemy, and every
  cell of the clearing reaches the clearing's edge, so the hero is never boxed in.

## 3. Enemies

Basic enemies only. A group is 1 to 3 loose black marbles in a line on passable cells, placed by
the seed (about one group per 400 cells), none within 8 cells of the spawn, and a group stays
inside one chunk, so no two groups share a cell. They hold their
ground and have no behaviour of their own: they react only when pushed. A marble pushed onto an
obstacle is a refused push; pushed onto no cell (the edge of the world) it is out for good.

## 4. The hero and the troop

- **Hero**: one glass marble, moved one cell at a time (click a neighbour, or the arrow keys, as
  in the hub, section 3.5 of `game-design.md`).
- **Troop**: 6 marbles at the start. After each hero step each troop marble takes the place of the
  one before it in the trail, and the first takes the cell the hero left. No decision of the player.
- **Automatic attack**: after its step, the troop attacks when a line of 2 or 3 of its marbles,
  hero included, is next to a smaller line of enemy marbles along that line's axis and the push is
  legal under `rules.md`. It then plays that push. Several are legal: the one that ejects the most
  enemies, then the lowest cell index, so the result is deterministic and testable.
- **Animation**: the push is drawn as a short lunge of the pushing line (about 400 ms, as the
  board's push), the pushed marbles slide one cell, an ejected one falls. Reduced motion: no
  lunge, the marbles jump.
- **Loss**: the hero ejected ends the walk (the world is kept, the hero starts again at the spawn,
  the troop at 6). A troop marble ejected is lost.

## 5. Saving

The world (seed), the hero and troop cells, and the enemy groups beaten are saved in IndexedDB
after every hero step, and loaded when the mode opens.

## 6. Tests

Engine (`abalone-core`): the same seed gives the same chunk in any order; the spawn clearing is
connected; a chunk has no marble on an obstacle; the troop's attack is a legal push and the choice
is deterministic. Client: unit tests at 100 %, and an e2e that walks a few cells, meets a group,
watches the troop push, reloads and is still there (under 15 s). Every slice is checked in Chrome
with the Playwright MCP before its PR, with a screenshot.
