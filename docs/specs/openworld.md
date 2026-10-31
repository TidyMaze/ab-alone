---
id: openworld
type: feature-design
status: draft
title: "Open world"
parent: game-design
depends-on: [rules]
---

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
- **Loaded chunks** (the view, #976, #1046): the view draws a square of chunks around a centre chunk, `reach` chunks each
  side. The reach is the ground in view in cells (the hex distance to the farthest corner of the screen), rounded up to
  chunks, plus one chunk of margin, and never more than 10 (441 chunks). The centre is kept while the square still covers
  the hero's hex ball of that radius (every cell within the radius of the hero's cell): it is re-centred on the hero's chunk
  only when it no longer does. So a hero that paces along a chunk line rebuilds no chunk: a step only moves the props
  that switch between detailed and plain, the cells within the detail radius of the old or the new hero cell (#1034,
  #1054), and the others keep their instances. The rule holds at every zoom and turn, so the edge of the loaded chunks never shows on screen.
- **Seed**: a chunk comes from the world seed and its coordinates alone (engine splitmix64), so
  the same seed always gives the same world, in any order of visit. Saving a world is its seed.
- **Relief**: every cell has a height 0 to 7 from three levels of smooth value noise (macro, meso,
  micro, see [openworld-terrain.md](openworld-terrain.md) section 2). The renderer lifts the cell
  column to `0.2 + STEP * height` with `STEP = 0.5` (water to 0.08, see [openworld-terrain.md](openworld-terrain.md)
  section 5), and lights it. The height itself never changes a
  move or a push: it only picks the terrain, and a terrain that blocks is an obstacle.
- **Terrain**: from height and a second noise (moisture), one look per cell: **lakes** (water,
  heights 0 and 1), sand (the shore, height 2), grass, rock, **mountains** (peaks, height 7). Forests
  (**trees**) and ruined **walls** (segments of 3 to 6 cells along one of
  three axes, one per 24-cell square at most, laid on land) come on top.
- **Biomes** (#984): meadow, forest, tundra (snow), desert and badlands, from a temperature and the moisture; each sets the
  colour of the low ground and the density of its trees and boulders (see [openworld-terrain.md](openworld-terrain.md) section 4).
- **Obstacles**: blocked cells the hero, the troop and the enemies cannot enter: water, mountains,
  trees, walls, and scattered boulders (about 2 % of the open cells). A push into an obstacle is
  refused, as a push into a friendly marble is in `rules.md`.
- **Breakable obstacles** (#1147): the hero breaks a small isolated obstacle by rolling into it. Only a **boulder**, or a
  **tree with no tree on its six neighbours**, is breakable (`breakable` in `openworld.ts`). Buildings (walls), mountains,
  water and forests (a tree beside a tree) stay in the way, and so does any cell an enemy stands on. The move that would have
  been refused goes through and the cell becomes plain ground of its terrain (a boulder leaves rock, a tree grass); only the
  hero breaks, the troop and the enemies treat an obstacle as blocked until it is broken, and a push into one is still refused
  by the engine. The break plays shards of the prop's colour, thrown outward and falling, gone within 0.7 s, drawn by the
  particle pool (`openworld-animation.md` section 6, no per-frame allocation); under reduced motion the prop fades in place in
  0.3 s. None past the roll zoom. A broken cell stays broken: the set is kept in the world's save (`broken: [[q, r], ...]`,
  section 5) and applied on top of every chunk read, so generation stays a pure function of the seed. `body[data-openworld-broken]`
  counts them.
- **Style**: low-poly and faceted, as the bay: flat-shaded hex columns, coolant-blue lakes that glow
  a little, dark faceted spires for the mountains, teal wire pines, grey boulders, black gantry
  walls. The props are meshes made in Blender (`client/models/openworld.glb`, a few faces each,
  packed with meshopt); the ground is one instanced hex prism per terrain.
- **Spawn**: a clearing of radius 3 around the start cell has no obstacle and no enemy, and every
  cell of the clearing reaches the clearing's edge, so the hero is never boxed in. The clearing is
  grass at height 3, and the world's macro level is offset per seed so that the start and the cells around it
  are land, not sea nor peaks (see [openworld-terrain.md](openworld-terrain.md) section 2).

The levels of noise, the biomes, the relief and the obstacle density are specified in
[openworld-terrain.md](openworld-terrain.md).

## 3. Enemies

Basic enemies only. A group is 1 to 3 loose black marbles in a line on passable cells, placed by
the seed (about one group per 400 cells), none within 8 cells of the spawn, and a group stays
inside one chunk, so no two groups share a cell. They hold their
ground and have no behaviour of their own: they react only when pushed. A pushed enemy is
ejected when the cell beyond the line is water or off the world (the edge of the world): the last
enemy of the line falls, the others shift one cell. A push into a tree, boulder, wall or peak, or
into a marble (troop or enemy), is refused. Enemies never push, so nothing ejects the hero yet.

## 4. The hero and the troop

- **Hero**: one glass marble, moved one cell at a time (click a neighbour, or the arrow keys, as
  in the hub, section 3.5 of `game-design.md`). A held arrow keeps walking: the first cell is taken on the
  keydown, then one cell per glide (140 ms) while the arrow is held, whatever the system's key repeat (#1059).
- **Steering** (#1137): a held direction (arrow, stick) is an *intent*, an angle on the ground. Each step takes the cell of
  that direction when the hero can enter it. When it cannot (a rock, a tree, water, a wall, a cliff, an enemy), the hero takes
  the free one of the two neighbours 60 degrees to the side that the intent follows best; if both follow it equally, the lower
  direction index (E, W, NE, SW, NW, SE). It never steps back or to a cell 120 degrees off. When no side is free, it leans and
  stops as before (#1040). Only legal steps: the same `Hero.step` rules. Not built yet: the setting to turn it off and the HUD
  line for the mode, and the tap-to-walk destination (A*), each its own piece.
- **Troop**: 6 marbles at the start. After each hero step each troop marble takes the place of the
  one before it in the trail, and the first takes the cell the hero left. No decision of the player.
- **Automatic attack**: after its step, the troop attacks when a line of 2 or 3 of its marbles,
  hero included, is next to a smaller line of enemy marbles along that line's axis and the push is
  legal under `rules.md`. It then plays that push. The enemy line is the run of enemies right in
  front of the pushing line, 1 or 2 marbles and fewer than the pushing line (2 pushes 1, 3 pushes
  1 or 2). The push is refused when the cell beyond the enemy run is a tree, boulder, wall or peak,
  or holds a marble; it ejects the last enemy when that cell is water or off the world, and
  otherwise every enemy of the run shifts one cell. Several pushes can be legal: the one that
  ejects the most enemies, then the lowest `(r, q)` of the back marble of the pushing line, then
  the lowest direction index (E, W, NE, SW, NW, SE), so the result is deterministic and testable.
  The rule is built in `crates/abalone-core/src/worldfight.rs` (`best_push`, `apply_push`).
- **Client state** (`client/src/openworldfight.ts`): the enemies are the generated ones of the seed
  with an overlay. `removed` holds the cells of generated enemies a push moved away or ejected, `added`
  the cells of enemies that now stand where no generated one starts, `beaten` counts the ejected ones.
  The current enemies of a cell are its generated ones not removed, plus the added ones. The hero is
  blocked by the current enemies (not by the generated ones of its own chunk), the view draws them,
  and a push redraws them. The overlay is plain data: `toJSON` and `FightState.fromJSON` (the save).
  A new entry starts a fresh overlay.
- **Bridge**: `world_push(seed, troop, enemies)` (`crates/abalone-wasm/src/world.rs`, encoding in
  `crates/abalone-wasm/src/lib.rs`) plays the push after each step on the hero and the troop, with the
  enemies within 10 cells of the hero. Its answer is empty when no push is legal.
- **Data attributes** of `body`, next to `openworldAt` and `openworldTroop`: `openworldEnemies` (the
  enemies drawn in the loaded chunks), `openworldBeaten` (the ejected enemies) and `openworldPush`
  (the pushes played, one more at each push).
- **Animation** (#967): the state is final at once (hero, troop, enemies, data attributes); only what is drawn
  is animated, from the old cells to the new ones, in this order (`OpenWorldView.playPush` and `tick`):
  1. **Lunge** (0 to 400 ms): each marble of the pushing line moves from its old cell to its new one, the
     hero's mesh with it when it is in the line. The ease goes a tenth of a cell past the new cell at 80 % of
     the lunge, then settles back on it. The camera follows the hero's drawn place.
  2. **Slide** (160 to 410 ms): each pushed enemy slides one cell along the push, starting at the contact
     (40 % of the lunge).
  3. **Fall** (160 to 410 ms slide, then 410 to 710 ms sinking): an ejected enemy slides into the water cell
     (or past the edge), then drops 0.6 below the ground while it shrinks to nothing. It has its own mesh
     (`ejected`), shown only while it falls.
  - **Reduced motion** (the page's `reduced()`): no animation at all, the marbles jump as before.
  - **Snap**: a step, a click, a zoom, a resize or a fixture first ends the animation on its final cells.
    Leaving the mode cancels it. While it runs the mode draws every frame, and the body carries
    `openworldAnim="1"` (removed when it ends).
  - The times are the normal speed; `window.__openworldSlow` (a webdriver check) multiplies them.
- **Loss** (deferred, not built): the hero ejected ends the walk (the world is kept, the hero
  starts again at the spawn, the troop at 6). It cannot happen yet, because enemies never push;
  it is specified here for when they do. A troop marble ejected is lost, with the same deferral.

## 5. Saving

The world (seed), the hero and troop cells, and the enemy groups beaten are saved in IndexedDB, in the game store of the
`ab-alone` database next to the local game and the run (`client/src/openworldsave.ts`, #968). No library: the `idb.ts` store.

**What is saved.** One record per seed, under the key `openworld:<seed>`:
`{ version, seed, hero: [q, r], troop: [[q, r], ...], fight: { removed, added, beaten }, broken: [[q, r], ...], savedAt }`, where `fight` is the
`FightState` of `openworldfight.ts` (the generated enemies a push moved away, the enemies on other cells, the beaten count).
The last world played is kept apart under `openworld:last` (`{ seed }`).

**When.** After each hero step and each push, the final state (not the animation), written at most once a frame: the frame
loop flushes it. The world is saved once more when the mode is left, and when another world is entered over it. A write
does not wait for the game: a storage that fails (a private window, blocked or full storage) is no game error, the save is
just not counted. The page counts the stored saves in `body[data-openworld-saved]`, which the e2e test polls.

**Which world opens.** The menu entry (`#openworld`) resumes the last world played when it has a valid save, else rolls a
new random seed. `?openworld=<n>` opens that seed, resuming its own save if it has one. `?openworld=new` opens a new random
seed and starts it fresh. There is no visible "New world" control yet (a follow-up). The push count of a session
(`openworldPush`) is not saved: it starts at 0 after a reload.

**Versions and garbage.** A record whose `version` is not the `WORLD_VERSION` of the bridge (`world_version()`,
openworld-terrain.md section 6) is not loaded: its cells would mean something else. A record that does not decode (a wrong
shape, cells that are not integers, more troop marbles than the troop holds, another seed under the key) is not loaded
either (a bad `fight` makes a bad record). Both are deleted, and the world starts on the spawn.

## 6. Tests

Engine (`abalone-core`): the same seed gives the same chunk in any order; the spawn clearing is
connected; a chunk has no marble on an obstacle; the troop's attack is a legal push and the choice
is deterministic. Client: unit tests at 100 %, and an e2e that walks a few cells, meets a group,
watches the troop push, reloads and is still there (under 15 s). Every slice is checked in Chrome
with the Playwright MCP before its PR, with a screenshot.

Test hooks, on a webdriver page only: `window.__openworldFixture({ hero, troop, enemies })` puts the
hero, the troop and the enemies of the loaded square (the generated ones are hidden), and
`window.__openworldEnemies()` gives the enemies near the hero. The e2e push test uses them.
