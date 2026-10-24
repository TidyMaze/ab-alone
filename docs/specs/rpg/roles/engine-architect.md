# Engine architecture: implementation spec (role `engine-architect`)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, still open). Source of truth:
the validated French gameplay spec (`docs/specs/rpg/plan.fr.md`, the same text as the approved plan).
A section number like "§6.4" points to that gameplay spec. This file adds no game rule of its own: it
says how to build the engine foundations the rules run on, and it lists every gap or contradiction it
found (section 19). Where the gameplay spec is silent on something the engine must decide, this file
writes a PROPOSAL and flags it there. No code yet: strict TDD applies from R1 (CONTRIBUTING section 11).

**Tags**, as in `rules.md`: **FINAL** (decided: by the four choices of #313, by an existing FINAL spec,
or by pure geometry and well-known constants), **TUNE** (a starting value, set by measurement or
playtest), **PROPOSAL** (proposed here, an owner confirms). Every number below carries one. Values
inside Given/When/Then examples (coordinates, ids, a unit's HP) are test data, not rules, and carry no
tag.

---

## 0. Scope

The engine-architect owns the **foundations every RPG crate stands on**: the generalised board of
`abalone-core`, determinism, hashing and seeds, the crate layout of `abalone-rpg` and `abalone-world`,
and the save format.

In scope (this role writes the code and its tests):

1. **Generalised `abalone-core`** (§24.2): the cell `Region` (any mask, no `MAX_RADIUS`), the terrain
   layer storage, the occupancy layer (unit id per cell), the unit traits the push needs (entity,
   camp, Weight, keywords), the generic Mouvement and push engine (`Classic` and `Weighted`), the Ice
   slide and forced-displacement geometry, the geometry helpers of the ability language (distance,
   lines, disks, resolution order, rotation, reflection, rims and depth rings), the tile lattice.
2. **Determinism kit** (§24.1): integer math helpers, the canonical binary encoding, the stable state
   hash, the seed derivation and the one RNG used outside combat, and the lints that keep floats,
   `HashMap` and the RNG out of rules code.
3. **Crate architecture** (§24.2, §24.3, §24.4): creation of `abalone-rpg` and `abalone-world`, their
   module boundaries and owners, the dependency policy, the data bundle loader and its version hash,
   the version constants every bridge and save carries.
4. **Hashes of a combat** (§24.1, §6.7, §4.7): the framework for `state_hash` (sync) and
   `position_key` (repetition), the combat id, the action log and its replay check.
5. **Save format** (§6.12, §24.5, §11, §13.4): the hero save envelope and its migrations, the combat
   save and resume-by-replay, export and import, world-version handling.
6. **Time inputs** (§4.2, §4.8, §13.2, §17, §18, §20, §22): pure UTC helpers; no crate reads a clock.

Out of scope (each section lists them under **Dependencies**): the turn structure, damage, statuses,
abilities, victory and the combat `Effects` list (`combat-engineer`); the content of the cell catalog
rules (what Lava does), world generation, biomes, tile content and travel (`world-designer`); monster
and boss content and AI decisions (`encounter-boss-designer`, `ai-engineer`); classes and abilities as
data (`class-designer`); stats, XP and talent trees (`progression-designer`); items and economy
(`economy-designer`); quests (`narrative-quest-designer`); P2P transport, signing, commit-reveal
(`network-engineer`); the WASM glue, IndexedDB calls, scenes and Playwright (`client-engineer`);
readability (`ux-designer`).

### 0.1 Role slugs

This file uses the canonical list proposed by `lead-game-designer` (its section 2.2). The peer role
files on disk map onto it as follows:

| Canonical slug | Peer file on disk | Other aliases seen |
|---|---|---|
| `lead-game-designer` | `lead-game-designer.md` | `game-designer` |
| `combat-engineer` | `gameplay-programmer.md` | `combat-engine`, `gameplay-programmer` |
| `class-designer` | `combat-designer.md` | `content-designer` |
| `progression-designer` | `systems-designer.md` | `stats-progression`, `progression-talents` |
| `world-designer` | `level-designer.md` | `world-generator`, `world-generation`, `world-engineer`, `world-programmer` |
| `encounter-boss-designer` | `encounter-boss-designer.md` | `dungeons-bosses` |
| `narrative-quest-designer` | `narrative-quest-designer.md` | `quest-designer` |
| `economy-designer` | `economy-designer.md` | `items-loot`, `loot-economy`, `gathering-crafting` |
| `ux-designer` | `ux-designer.md` | |
| `client-engineer` | (none yet) | `client-ui`, `client-programmer` |
| `ai-engineer` | (none yet) | `ai-programmer` |
| `network-engineer` | (none yet) | `netcode`, `network-programmer` |
| `pvp-br-designer` | (none yet) | `pvp-br` |
| `qa-balance` | (none yet) | `qa-engineer` |
| `engine-architect` | this file | `engine-programmer`, `engine-core`, `engine-engineer`, and the "crates, determinism, shared hash and RNG, save envelope" part of `tech-lead` |

Peer files ask `tech-lead` for: crate creation, `serde`, the data loader and format, the shared hash
and RNG, the clippy lints, the save envelope, canonical encodings. This file answers all of them. The
WASM bridge glue and the MCP server stay with `client-engineer` and whoever the lead names for #163.

---

## 1. Inputs read

- Gameplay spec, the whole file; in detail §1, §4 (all), §5.1, §5.2, §6.0 to §6.12, §8.2 (Percée,
  Avalanche, Titan), §8.6 (Revenants), §8.7 (history), §8.8 (Pont, Rotation, Séisme), §11 (Hardcore),
  §12 (loot seed), §13.4 (falsifiable saves), §15.3 (craft seed), §17 (weekly seed), §18, §20, §22,
  §24 (all), §25, §26.
- `SPEC.md`, `CONTRIBUTING.md` (§6.4, §11, §13), `docs/specs/tech.md` (§3 core API, §4 bridge, §6
  P2P, §7 AI determinism, §8 persistence and `savegame.ts` format, §9.1 offline app, §10 testing),
  `docs/specs/rules.md` (§1 board, §5 sumito, §9 end of game, §10.3, §10.4), `docs/specs/mcp.md`
  (§3 notation), `docs/specs/boss-balance.md` (§5, §6), `docs/specs/multiplayer.md`.
- Peer role files: `gameplay-programmer.md` (its core contract, section 8.5, and its hash proposal,
  section 4.6), `level-designer.md` (its `Region` and terrain proposal, sections 3 and 4),
  `lead-game-designer.md` (slugs, LGD-05 perft, LGD-06 equivalence), `economy-designer.md` (seeds,
  save part), `systems-designer.md`, `combat-designer.md`, `encounter-boss-designer.md`,
  `narrative-quest-designer.md`, `ux-designer.md` (headers and what they ask of this role).
- Code: `crates/abalone-core/src/board.rs`, `moves.rs`, `game.rs`, `search.rs`, `encounter.rs`,
  `encounter/hull.rs` (`mix`), `Cargo.toml` files; `crates/abalone-wasm/src/lib.rs` (encodings
  header); `client/src/savegame.ts`, `daily.ts`, `idb.ts`.

### 1.1 Facts from the code that shape this spec

1. `Board` stores `HashMap<(i32, i32), Cell>` but **no code iterates the map**: every scan is a
   `for q in -MAX_RADIUS..=MAX_RADIUS { for r in ... }` loop calling `get`. The current order is
   deterministic (q-major). What blocks radius 8 and multi-tile boards is `MAX_RADIUS = 5`, not the
   `HashMap`.
2. The q-major order of `moves::legal_moves` decides search tie-breaks. The recorded boss fixtures
   (`tests/boss_fixtures.rs`), the ladder and the daily challenge replay against it. Any change of that
   order can change a boss move and break a fixture.
3. `Cell` is `Empty | Black | White`: no unit identity, no third side, no terrain. `Board::void` removes
   a cell for good.
4. `game::position_hash` uses `std::collections::hash_map::DefaultHasher`. Its algorithm is not
   guaranteed stable across Rust releases. Today every peer runs the same WASM build, so it works, but
   a combat hash compared between peers must not rely on it.
5. `encounter/hull.rs` already has the SplitMix64 step `mix(seed)`; `encounter.rs` mixes seeds with
   `seed ^ ply * 0x9E37_79B9_7F4A_7C15`. These are the only seeded functions in the code.
6. `abalone-core` has no dependency at all: no `serde`, no `proptest`.
7. The WASM bridge already lists cells row by row, `r` ascending then `q` ascending: the canonical
   order of §24.1.
8. `savegame.ts` stores `{version, mode, layout, bot, moves}` and replays the moves on load; a save
   that fails to decode or replay is deleted. `daily.ts` derives the daily seed with a 32-bit FNV-1a
   plus the murmur3 finaliser over `"ab-alone daily YYYY-MM-DD"`.
9. `moves::apply` returns `(Board, bool)`; there is no `Effects` type in the code (tech.md §3 describes
   one). The RPG `Effects` list is new work (`combat-engineer`).

---

## 2. Conventions used by every section

- **Coordinates.** Axial `(q, r)` as `(i32, i32)`, the type the code already uses, aliased
  `pub type Axial = (i32, i32)` (PROPOSAL: no new struct, no conversion churn). Directions and the
  move notation are those of `rules.md` §1 (FINAL there).
- **Canonical cell order.** `r` ascending, then `q` ascending (§24.1). Every RPG rule, generator and
  encoding uses it through `Region::canon()`; no RPG code writes its own double loop (PROPOSAL).
- **Classic order kept.** The classic engine (`board.rs`, `moves.rs`, `game.rs`, `search.rs`,
  `encounter/`) keeps its q-major order bit for bit (PROPOSAL, fact 2).
- **Integer math.** No `f32`/`f64` in any rule, generator or save code (FINAL, #313 choice 4 and
  §24.1). Percentages are basis points (bp, 10 000 = 100 %, FINAL §24.1). Products in `i64`, floor
  with `div_euclid` (section 4.1).
- **No clock, no thread, no global state, no I/O** in `abalone-core`, `abalone-rpg`, `abalone-world`
  (FINAL, tech.md §3). Time comes in as an argument `now_ms: u64` (section 16).
- **No randomness in combat** (FINAL, #313 choice 4). The RNG of section 4.4 is for loot, crafting
  and world generation only, and a lint keeps it out of combat code (section 3.4).

---

## 3. Crate architecture (§24.2, §24.3, §24.4, §1 pillar 6)

### 3.1 Workspace layout

```text
crates/
  abalone-core/    rules geometry, classic engine (unchanged), det kit, region, terrain, arena, push
  abalone-rpg/     combat (combat-engineer): CombatState, apply_action, effects, abilities, AI hooks
  abalone-world/   world, progression, quests, economy, save (several owners, see 3.3)
  abalone-wasm/    bridge (client-engineer), one module for classic + RPG
  abalone-cli/     unchanged; later a `rpg` subcommand for ladders (ai-engineer)
data/              content as JSON files, bundled with include_str! (section 3.5)
```

Dependency graph (FINAL once the Decision closes, it is the §24.2 split):
`abalone-core` <- `abalone-rpg` <- `abalone-world` <- `abalone-wasm`, `abalone-cli`. No cycle: the
world crate builds a `CombatSetup` and reads a `CombatReport`; the combat crate never knows the world.

### 3.2 Dependency policy

| Crate | Allowed runtime dependencies | Why |
|---|---|---|
| `abalone-core` | none | Stays the tiny, `no_std`-friendly judge (tech.md §3). Canonical encoding is hand-written (section 5), no `serde` |
| `abalone-rpg` | `serde` (derive), `serde_json` | Ability, status, monster data (§24.3) |
| `abalone-world` | `serde` (derive), `serde_json` | Data and saves |
| dev only | none new | Property tests use seeded loops with the `det` RNG, not `proptest` (KISS) |

All PROPOSAL. Versions pinned exactly in `Cargo.toml` (CONTRIBUTING habit). A new dependency needs a
line in this table, through a docs PR.

### 3.3 Module ownership in the new crates

`abalone-rpg` (layout written by `combat-engineer`, `gameplay-programmer.md` section 3): this role
creates the crate and owns `lib.rs` (re-exports, `RULES_VERSION`), `hash.rs` (the glue from
`CombatState` to the `det` encoder, section 13) and `log.rs` (section 14). Everything else is
`combat-engineer`'s.

`abalone-world`:

| Module | Owner | Phase |
|---|---|---|
| `lib.rs`, `ids.rs` (string ids to dense ids), `data.rs` (bundle loader, `DATA_VERSION`) | `engine-architect` | R1 |
| `save/` (`envelope.rs`, `hero.rs`, `combat.rs`, `migrate.rs`) | `engine-architect` (envelope), each section by its owner | R3, R4 |
| `time.rs` (UTC helpers) | `engine-architect` | R4 |
| `map.rs`, `content.rs`, `travel.rs`, `engage.rs`, `boardgen.rs`, `zones.rs`, `dungeon.rs`, `sky.rs` | `world-designer` | R4+ |
| `progression/` | `progression-designer` | R3 |
| `quest/`, `puzzle.rs`, `codex.rs`, `reputation.rs`, `tutorial.rs` | `narrative-quest-designer` | R6 |
| `economy/` | `economy-designer` | R5, R7 |

The tile lattice (`tile_centre`, `tile_of`, unions) is pure geometry and lives in
`abalone-core/src/tiling.rs` (section 8), not in `abalone-world/src/tiling.rs` as `level-designer.md`
proposes: the combat region of a multi-tile fight is built from it, and `abalone-rpg` must not depend
on the world crate. The world-specific parts (tile seed, world radius) stay in the world crate
(`world-designer`). PROPOSAL, open question Q1.

### 3.4 Lints and guards (determinism by construction)

| Guard | Where | How |
|---|---|---|
| No float arithmetic | `abalone-rpg`, `abalone-world`, new core modules | `#![deny(clippy::float_arithmetic)]` at crate root; core new modules get `#[deny(...)]` on the module |
| No `HashMap`/`HashSet` | `abalone-rpg`, `abalone-world` | per-crate `clippy.toml` with `disallowed-types = ["std::collections::HashMap", "std::collections::HashSet"]`. Use `Vec` sorted by id or `BTreeMap` |
| No RNG in combat | `abalone-rpg` | its `clippy.toml` also disallows `abalone_core::det::Rng` |
| No `usize` in encodings | `det::Enc` | the encoder has no `usize` method; lengths go through `len(u32)` that panics above `u32::MAX` |
| No wrapping surprises | all rule code | stat math in `i64` with `saturating_*` or proven bounds; release builds wrap silently while debug builds panic, so an overflow would split native tests from the WASM build |
| No unstable order | all rule code | sort only by a total key ending with an id; never `sort_unstable_by` on a partial key |

All PROPOSAL. The existing `board.rs` `HashMap` is in `abalone-core`, which has no such `clippy.toml`,
so the classic code is untouched.

### 3.5 Data bundle (§24.3)

- **Format: JSON** (PROPOSAL, gameplay spec leaves RON or JSON open). One parser for data, saves, the
  bridge and the MCP server; the client and peer role files already speak JSON.
- **Layout.** `data/<kind>/<id>.json`, one object per file, `id` equal to the file stem (lowercase
  `a-z0-9_.`). Kinds: `classes`, `abilities`, `statuses`, `runes`, `cells`, `biomes`, `monsters`,
  `bosses`, `items`, `recipes`, `quests`, `dungeons`, `formats`, `world`.
- **Loading.** No build script (KISS): a hand-kept `const FILES: &[(&str, &str)] =
  &[("abilities/warrior.charge", include_str!(...)), ...]` per crate, sorted by path; a unit test
  lists `data/` with `std::fs` (tests may do I/O) and fails if a file is missing from `FILES` or
  extra. PROPOSAL.
- **Dense ids.** At load, string ids are sorted and numbered (`AbilityId(u16)` = rank in sorted
  order). Ids in saves stay **strings** so adding content never shifts a save (PROPOSAL).
- **`DATA_VERSION`** = `fnv1a64` of every `(path, text)` pair of `FILES` in order (section 4.3). It
  goes into every combat setup, every save and the bridge `hello` (sections 13 to 15).
- **Integrity tests** (§24.3): this role writes the harness (`data::check_all() -> Vec<Problem>`);
  each content owner writes its checks (references, budgets, counterplay text, Ejector has tell...).

### 3.6 Version constants

| Constant | Meaning | Start | Tag |
|---|---|---|---|
| `RULES_VERSION: u32` (in `abalone-rpg`) | Bumped by hand when a rule change can change the outcome of a replay with the same data | 1 | FINAL start value, PROPOSAL mechanism |
| `DATA_VERSION: u64` | Hash of the bundled data (3.5) | computed | PROPOSAL |
| `HERO_SAVE_VERSION: u32` | Hero save schema (section 15) | 1 | FINAL start value |
| `COMBAT_SAVE_VERSION: u32` | Combat save schema | 1 | FINAL start value |
| `WORLD_VERSION: u32` | World generation formula plus world seed (§4.7 "graine de version") | 1 | FINAL start value |
| `BRIDGE_VERSION: u32` | JSON shapes of the RPG bridge (client-engineer) | 1 | FINAL start value |

### 3.7 Dependencies, tests, risks (section 3)

- **Dependencies.** `combat-engineer` (agrees to the module split of 3.3), `world-designer` (tiling
  location, Q1), every content owner (their data kinds and integrity checks), `client-engineer` (the
  WASM size report, bridge version), `lead-game-designer` (JSON vs RON).
- **Tests.**
  - Given a workspace with the two new crates, When `scripts/verify.sh` runs, Then fmt, clippy with the
    new lints and coverage at 100 % lines and regions pass on an empty crate with one tested function.
  - Given a module of `abalone-rpg` that writes `let x = 1.5_f64 * 2.0;`, When clippy runs, Then it
    fails (lint smoke test, done once by hand in the PR and noted in its description; a failing build
    cannot be committed).
  - Given `data/` with a file not listed in `FILES`, When `cargo test`, Then the bundle test fails
    naming the path.
  - Given the bundle, When `DATA_VERSION` is computed twice, Then equal; Given one byte changed in one
    file, Then different.
- **Risks.**
  - **Coverage of `serde` derives.** `cargo llvm-cov` attributes derive-generated code to the derive
    line; uncovered error branches could fail the 100 % region gate. The skeleton PR (EA-03) proves
    it on one derived struct with a round-trip test. If regions are missed, the fallback is
    `--ignore-filename-regex` on files named `*_dto.rs` holding only derived types, with the one-line
    comment CONTRIBUTING §11 asks for (owner accepts).
  - **WASM size.** `serde_json` plus the data bundle grow the module (tech.md §4 budget: 500 KB
    gzipped, TUNE there). The skeleton PR records the size before and after; data text compresses
    well.

---

## 4. Determinism kit `abalone-core/src/det.rs` (§24.1, §4.1, §12, §15.3)

### 4.1 Integer helpers

```rust
pub const BP: i64 = 10_000;                       // FINAL (§24.1)
pub fn div_floor(a: i64, b: i64) -> i64;          // a.div_euclid(b), b > 0
pub fn mul_bp(x: i64, bp: i64) -> i64;            // div_floor(x * bp, BP)
pub fn clamp_i32(x: i64) -> i32;                  // saturate into i32
```

`/` in Rust truncates toward zero; the spec's `⌊ ⌋` is a floor. With a negative bonus the two differ,
so rule code uses `div_floor` only (PROPOSAL). The damage formula, its order of operations and `g(L)`
in bp are `combat-engineer`'s and `progression-designer`'s; they call these helpers.

### 4.2 Seeds

```rust
pub fn mix(x: u64) -> u64;                        // SplitMix64 step, moved from encounter/hull.rs
pub fn h(parts: &[u64]) -> u64;                   // fold: acc = mix(acc ^ p), acc starts at 0
pub fn coord(c: Axial) -> u64;                    // ((q as u32 as u64) << 32) | (r as u32 as u64)
pub fn h_str(s: &str) -> u64;                     // mix(fnv1a64(s.as_bytes()))
pub fn seed_of(parent: u64, stream: Stream, a: u64, b: u64) -> u64; // h(&[parent, stream as u64, a, b])
#[repr(u16)] pub enum Stream { World = 1, Tile = 2, Terrain = 3, Pack = 4, Loot = 5, Chest = 6,
    Craft = 7, Node = 8, Merchant = 9, Quest = 10, Daily = 11, Event = 12, Dungeon = 13,
    WeekAffix = 14, WorldBoss = 15, BrSchedule = 16, Trap = 17 }
```

- `mix` keeps the exact constants of `hull.rs` (0x9E37_79B9_7F4A_7C15, 0xBF58_476D_1CE4_E5B9,
  0x94D0_49BB_1331_11EB; FINAL, SplitMix64). `hull.rs` then calls `det::mix`: a move, no behaviour
  change, guarded by the boss fixtures.
- `h` is the fold `level-designer.md` section 2 already uses; `h_str` gives a string the same entry
  point (their `h(tile_seed, "trap")` becomes `h(&[tile_seed, h_str("trap")])`). `economy-designer.md`
  E0.3 proposes "FNV-1a then mix" over bytes: `seed_of` covers it with fixed-size integers, which
  avoids building byte strings. One derivation for the whole game (PROPOSAL).
- **Stream registry.** Codes are append-only and never reused (FINAL once shipped: changing one
  reshuffles a world or a loot table). A new stream is one line in this enum, owned by this role.

### 4.3 Byte hash

`fnv1a64(bytes) -> u64`: offset basis 0xcbf2_9ce4_8422_2325, prime 0x100_0000_01b3 (FINAL, the
published FNV-1a 64 constants). Used for canonical encodings (state hash, setup hash, data version)
and strings. Not a security hash: peers compare full logs on a mismatch (tech.md §6), saves are
falsifiable anyway (§13.4).

### 4.4 RNG (outside combat only)

```rust
pub struct Rng { state: u64 }                     // SplitMix64
impl Rng {
    pub fn new(seed: u64) -> Self;
    pub fn next_u64(&mut self) -> u64;            // state += 0x9E37...; return mix-finaliser(state)
    pub fn below(&mut self, n: u64) -> u64;       // ((next as u128 * n as u128) >> 64), n > 0
    pub fn chance_bp(&mut self, bp: u32) -> bool; // below(10_000) < bp
    pub fn pick_weighted(&mut self, w: &[u32]) -> usize; // first index whose prefix sum > below(total)
}
```

`below` uses the multiply-high method without rejection: its bias is under 2^-40 for any `n` the game
uses and it never loops (PROPOSAL). `pick_weighted` with a total of 0 panics in tests and is refused by
the data integrity checks before it can run.

### 4.5 Dependencies, tests, risks (section 4)

- **Dependencies.** `economy-designer` (drops its own `economy/rng.rs`), `world-designer` (uses `h`,
  `coord`, `Stream`), `encounter-boss-designer` (affix week seed), `network-engineer` (combat seed
  only feeds the PvP tie-break, section 14.3), `client-engineer` (a TypeScript twin of `h` only if the
  client ever needs a seed without the engine; PROPOSAL: never, ask the engine).
- **Tests.**
  - Golden vectors: `mix(0)`, `mix(1)`, `h(&[])`, `h(&[1, 2])`, `fnv1a64(b"")` = 0xcbf29ce484222325,
    `fnv1a64(b"a")` = 0xaf63dc4c8601ec8c (published FNV test vector), `seed_of(1, Loot, 7, 0)`, each
    pinned in the test.
  - Given `hull.rs` calling `det::mix`, When `tests/boss_fixtures.rs` runs, Then every fixture result
    is unchanged.
  - Given `div_floor(-7, 2)`, Then `-4`; Given `mul_bp(-1, 5_000)`, Then `-1`; Given `mul_bp(3,
    3_333)`, Then `0`.
  - Property: for 10 000 seeds (TUNE), `below(n) < n` for `n` in {1, 2, 3, 7, 10 000, u64::MAX};
    `pick_weighted` never returns an index of weight 0; counts over 100 000 draws of `[1, 3]` land
    within 1 % (TUNE) of 25 % and 75 %.
  - Given the same seed, Then two `Rng` give the same 1 000 values; given seeds 1 and 2, different.
- **Risks.** A change in any formula here reshuffles every world and loot table: the module carries
  `WORLD_VERSION` semantics (section 15.4) and golden vectors guard it.

---

## 5. Canonical encoding `abalone-core/src/canon.rs` (§24.1)

```rust
pub struct Enc { bytes: Vec<u8> }
impl Enc {
    pub fn new(tag: &[u8; 4], version: u32) -> Self;      // domain tag, e.g. b"ABcs" + RULES_VERSION
    pub fn u8(&mut self, v: u8); pub fn u16(..); pub fn u32(..); pub fn u64(..);
    pub fn i8(..); pub fn i32(..); pub fn i64(..); pub fn bool(..);
    pub fn len(&mut self, n: usize);                      // as u32, panics above u32::MAX
    pub fn str(&mut self, s: &str);                       // len then UTF-8 bytes
    pub fn opt<T: Canon>(&mut self, v: &Option<T>);       // 0, or 1 then the value
    pub fn seq<T: Canon>(&mut self, v: &[T]);             // len then each
    pub fn finish(self) -> Vec<u8>;
    pub fn hash(self) -> u64;                             // fnv1a64 of the bytes
}
pub trait Canon { fn canon(&self, e: &mut Enc); }
```

- Little-endian integers, a one-byte tag per enum variant (declared order), no padding, no `usize`
  (FINAL once the first golden vector ships: it is the wire and hash format).
- **Exhaustive destructuring rule** (PROPOSAL): every `impl Canon for S` starts with
  `let S { a, b, c } = self;` listing every field. Adding a field to `S` without encoding it fails to
  compile (unused binding under `-D warnings`), so the hash can never silently miss a field. A field
  left out on purpose is bound as `c: _` with a comment saying why.
- This role writes `Canon` for core types: `Direction`, `Move`, `Region`, `TerrainMap`, `Arena`,
  `UnitTraits`. `combat-engineer` writes it for combat types, `network-engineer` signs records encoded
  with it (the canonical bytes, not JSON, are what a signature covers; this answers
  `economy-designer.md`'s "canonical JSON" for trades, PROPOSAL).

**Dependencies.** `combat-engineer`, `network-engineer`, `economy-designer` (trade records).

**Tests.**
- Given `Enc::new(b"TEST", 1)` then `u16(0x0102)`, Then bytes are `54 45 53 54 01 00 00 00 02 01`.
- Given two `Region`s built from the same cells in different insertion orders, Then their encodings
  are equal.
- Given `opt(None)` and `opt(Some(0u8))`, Then encodings differ (no ambiguity between absent and zero).
- Cross-target golden: one encoded `Arena` with its `fnv1a64`, pinned in a Rust test; the same bytes
  and hash checked through the WASM build in a vitest test (`client-engineer`). Native and WASM must
  agree (R1 exit criterion, §25, made explicit in feedback F18).

**Risks.** Encoding is hand-written per type: the destructuring rule makes omissions a compile error,
not a review catch.

---

## 6. `Region`: any board shape (§24.2, §4.1, §4.6, §6.7, §6.8, §8.8, §20)

**Implementation (`abalone-core/src/region.rs`).** The API follows `level-designer.md` section 3.1 so
both files describe one type:

```rust
pub struct Region { q0: i32, r0: i32, w: u32, h: u32, inside: Vec<bool>, count: u32 }
impl Region {
    pub fn hex(radius: u32) -> Self;                 // FINAL geometry: 3r(r+1)+1 cells
    pub fn from_cells(cells: &[Axial]) -> Self;      // unions, rooms
    pub fn contains(&self, c: Axial) -> bool;
    pub fn index(&self, c: Axial) -> Option<usize>;  // dense index for the layers
    pub fn slots(&self) -> usize;                    // w * h, the length of every layer Vec
    pub fn add(&mut self, c: Axial) -> bool;         // only next to the region (Pont), margin 1
    pub fn remove(&mut self, c: Axial);
    pub fn canon(&self) -> impl Iterator<Item = Axial> + '_; // r then q, no allocation
    pub fn len(&self) -> u32;
    pub fn depth(&self, c: Axial) -> Option<u32>;    // 0 on a cell with a neighbour outside
    pub fn layer(&self, d: u32) -> Vec<Axial>;       // cells of depth d, canon order ("peel")
    pub fn max_depth(&self) -> u32;
    pub fn core_cells(&self) -> Vec<Axial>;          // cells of max depth, canon order
}
```

- Dense `Vec<bool>` over a bounding box with a **1-cell margin** (PROPOSAL, `level-designer.md`):
  `get` is one index, iteration order is fixed, any mask works. Sizes: radius 8 = 217 cells in a
  19 × 19 box; a 7-tile flower = 427 cells in about 29 × 29 (TUNE estimate). `add` grows the box when
  a Pont lands in the margin, so a second Pont beyond the first still works (PROPOSAL; the spec does
  not forbid it, feedback F14).
- `depth` is a breadth-first search from the outside, computed once per change, stored in a
  `Vec<u8>` cache inside the region. On a hexagon of radius R, `depth = R - distance(centre)`.
- **The classic `Board` is not changed** (PROPOSAL, differs from §24.2 wording and from
  `level-designer.md` 3.1, feedback F2, open question Q2). Reasons: the RPG needs unit ids and N
  camps anyway (section 9), so a new occupancy layer is needed whatever happens to `Board`; the
  classic modes stay byte-identical with zero risk to the fixtures; and the classic battle royale that
  needed radius 8 is replaced by the RPG one (§20), which runs on `Arena`. `MAX_RADIUS` stays as it is
  for the classic code only.

**Dependencies.** `world-designer` (generates regions, terrain, start zones), `combat-engineer` (holds
an `Arena` in `CombatState`), `ai-engineer` (speed of `canon()` in search).

**Tests.**
- Given `Region::hex(r)` for r in 0..=8, Then `len` is 1, 7, 19, 37, 61, 91, 127, 169, 217 and every
  cell has `max(|q|, |r|, |q+r|) <= r`.
- Given `hex(4)`, Then `canon()` starts `(0,-4), (1,-4)` and ends `(-1,4), (0,4)`, and index order
  matches the 61-byte bridge encoding of `abalone-wasm` cell for cell.
- Given `hex(4)`, Then `layer(0)` is the 24 rim cells, `layer(1)` the 18 cells at radius 3,
  `max_depth()` is 4 and `core_cells()` is `[(0,0)]`.
- Given `hex(4)`, When `add((5,0))`, Then true and `contains((5,0))`; When `add((7,0))`, Then false.
  When `add((6,0))` after `(5,0)`, Then true (box grew).
- Given `from_cells` of two touching hexagons, Then `len` is 122 and `depth` of a seam cell is the
  same as in the middle of a tile at the same distance from the outside.
- Given `remove((0,0))` on `hex(4)`, Then `depth` of its six neighbours is 0 (a hole is an outside).

**Risks.** `depth` treats an interior hole (a removed cell) as outside; Gouffres are terrain, not
removals (section 7), so they do not change depth. Whether the Breach should peel around holes is a
rule question, feedback F5.

**Tags.** Hex sizes FINAL (geometry). Margin 1 and growth on `add`: PROPOSAL. Board untouched:
PROPOSAL.

---

## 7. Terrain layer storage (§5.1, §5.2, §6.10 "Terrain", §6.7 Breach)

**Implementation (`abalone-core/src/terrain.rs`).** Storage and timers only; what a cell does to a
unit is `combat-engineer`'s and `world-designer`'s (`abalone-rpg/src/terrain_rules.rs`). The types
follow `level-designer.md` 3.2:

```rust
#[repr(u8)] pub enum CellKind { Normal, Rock, Chasm, Ice, Mud, Thicket, Height, Slope, Lava, Water,
    Quicksand, Vent, Sanctuary, Corruption, Crystal, Brambles }      // 16 kinds of §5.1
pub struct Layer { pub kind: CellKind, pub dir: Option<Direction>, pub owner: Option<u8> } // owner = camp
pub enum Clock { Owner(u8), Round }                                 // whose turns tick it
pub struct Timed { pub layer: Layer, pub left: u8, pub clock: Clock }
pub struct TerrainCell { pub base: Layer, pub overlay: Option<Timed>, pub counter: Option<u8> }
pub struct TerrainMap { cells: Vec<TerrainCell> }                   // indexed like the Region
impl TerrainMap {
    pub fn kind(&self, r: &Region, c: Axial) -> Option<CellKind>;   // overlay if any, else base
    pub fn set_base(..); pub fn set_overlay(.., t: Timed);          // replaces any overlay
    pub fn tick(&mut self, clock: Clock) -> Vec<Axial>;            // cells whose overlay expired, canon order
}
```

Engine predicates used by the push (section 10), FINAL as the §5.1 rule texts:

| Predicate | True when | Source |
|---|---|---|
| `open(c)` | in region and kind is not `Chasm` | §5.1 Gouffre: a cell you fall out of |
| `enterable(c)` | `open(c)` and kind is not `Rock` | §5.1 Roc: nothing enters |
| `blocks_push(c)` | kind is `Rock` | §5.1 Roc: "comme une boule alliée" |
| `mud(c)` | kind is `Mud` | §5.1 Boue |
| `slope(c)` | `Some(dir)` when kind is `Slope` | §5.1 Pente |
| `ice(c)` | kind is `Ice` | §5.1 Glace |

- A timed Gouffre (Effondrement, Séisme, Marée, Brèche) is an overlay of kind `Chasm`; a Pont on a
  Gouffre is an overlay `Normal` over a base `Chasm`; a Pont beyond the edge is `region.add(c)` with
  base `Chasm` plus that overlay (PROPOSAL, `level-designer.md`). When it expires the unit on it is
  ejected by `combat-engineer` and the cell is removed with `region.remove` at the end of that effect.
- R1 needs no terrain beyond `Normal`; the type ships in R2 with the push changes.

**Dependencies.** `world-designer` (catalog data, generation, the clock split), `combat-engineer`
(ticks, terrain primitive, rules of each kind), `class-designer` (abilities that write overlays),
`ux-designer` (timers shown).

**Tests.**
- Given an Ice base and a Lava overlay of 3 `Owner(1)` turns, When `tick(Owner(1))` three times,
  Then `kind` reads Ice and the third call returns that cell; When `tick(Owner(2))`, Then nothing
  changes.
- Given a `Chasm` overlay on a Normal cell, Then `open` is false; after expiry, true.
- Given two maps built by setting cells in different orders, Then equal encodings (section 5).

**Tags.** 16 kinds: FINAL (§5.1 list). One overlay per cell, clock split: PROPOSAL.

---

## 8. Tile lattice (§4.1, §4.5, §4.6)

**Implementation (`abalone-core/src/tiling.rs`).**

```rust
pub const TILE_RADIUS: u32 = 4;                       // FINAL in §4.1 ("rayon 4")
pub fn tile_centre(t: Axial) -> Axial;                // q·(9,−4) + r·(4,5)
pub fn tile_of(c: Axial) -> Axial;                    // the one tile whose centre is within 4
pub fn tiles_region(tiles: &[Axial], anchor: Axial) -> Region; // union, coords relative to tile_centre(anchor)
pub fn to_local(c: Axial, anchor: Axial) -> Axial; pub fn to_global(c: Axial, anchor: Axial) -> Axial;
```

- Lattice `(9,−4)`, `(4,5)`: determinant 61, the size of a radius-4 hexagon, so the hexagons tile the
  plane with no gap and no overlap (FINAL geometry; TUNE in §4.1 only because the whole spec is).
- `tile_of`: `Q* = div_floor(5x − 4y, 61)`, `R* = div_floor(4x + 9y, 61)`; check the four candidates
  `(Q*..=Q*+1, R*..=R*+1)` and return the one at hex distance 4 or less (`level-designer.md` 4). The
  test below proves exactly one exists over a large window.
- **Anchor coordinates** (PROPOSAL, same as `level-designer.md`): a fight uses coordinates relative to
  the centre of its first tile, so a one-tile fight is centred on `(0,0)` and every `rules.md` example
  holds unchanged.
- Tile seed, world radius and which terrain a radius-5 board takes from neighbour tiles are
  `world-designer`'s (feedback F4).

**Tests.**
- Given the six tile neighbours, Then centres are `(9,−4)`, `(4,5)`, `(−5,9)`, `(−9,4)`, `(−4,−5)`,
  `(5,−9)`, each at hex distance 9.
- Property: for every cell of a 201 × 201 window (TUNE), `tile_of` returns one tile and the cell is
  within 4 of its centre; `tile_of(tile_centre(t)) == t` for every `t` within world radius 60 (TUNE
  §4.1).
- Given tiles `(0,0)` and `(1,0)` with anchor `(0,0)`, Then `tiles_region` has 122 cells, `(4,0)`
  belongs to tile `(0,0)`, `(5,0)` to tile `(1,0)`, and the two cells are neighbours: a Mouvement across
  the seam needs no special rule (§4.6).

**Tags.** As above.

---

## 9. Occupancy and units in the core: `Arena` (§24.2, §6.0, §6.2, §6.11)

§24.2: "Chaque case connaît son occupant : camp et id d'unité."

**Implementation (`abalone-core/src/arena.rs`).**

```rust
pub struct UnitId(pub u16); pub struct EntityId(pub u8); pub struct CampId(pub u8);
pub struct UnitTraits {
    pub entity: EntityId, pub camp: CampId,
    pub weight: i8,        // Weight before terrain: base + statuses, unclamped (combat-engineer computes)
    pub resist_bonus: u8,  // added only when resisting (Roc inébranlable +2, §9.2), not clamped
    pub flags: u8,         // SELECTABLE, CAN_LEAD, UNMOVABLE, UNEJECTABLE (bit set)
}
pub struct Arena {
    pub region: Region,
    pub terrain: TerrainMap,           // added in R2 (EA-09); R1 boards are all Normal
    occ: Vec<Option<UnitId>>,          // per region slot
    pos: Vec<Option<Axial>>,           // per UnitId, None once off the board
}
impl Arena {
    pub fn occupant(&self, c: Axial) -> Option<UnitId>;
    pub fn pos(&self, u: UnitId) -> Option<Axial>;
    pub fn place(&mut self, u: UnitId, c: Axial);   // panics on an occupied or closed cell (setup bug)
    pub fn lift(&mut self, u: UnitId);              // death, ejection, rout
    pub fn relocate(&mut self, u: UnitId, to: Axial); // teleport (free, enterable cell only)
    pub fn swap(&mut self, a: UnitId, b: UnitId);   // Transfert
    pub fn units_in_canon(&self) -> Vec<UnitId>;   // by cell, canon order
}
```

- **One source of truth for positions.** `occ` and `pos` are updated together by the only mutators
  above; an invariant check runs in every test helper. `combat-engineer`'s `Unit` should read
  `arena.pos(u)` instead of keeping its own `cell` field (PROPOSAL; `gameplay-programmer.md` 4.1 has
  `Unit.cell`: two copies of one fact can disagree, open question Q6).
- `UnitTraits` is a plain table (`&[UnitTraits]` indexed by `UnitId`) that `combat-engineer` rebuilds
  from statuses before each Mouvement and each displacement. A table, not the trait object of
  `gameplay-programmer.md` 8.5: same information, no dynamic dispatch, encodable, and the AI can cache
  it (PROPOSAL; the functions of 8.5 map one to one onto fields, see section 10).
- Effective Weight in the core: `w(u, c) = clamp(traits.weight + (mud(c) ? 1 : 0), 1, 5)` (§6.4 range
  1..5 FINAL there; Mud +1 §5.1; Titan's "Poids 5" arrives as `weight = 5`). Clamp after terrain:
  PROPOSAL, feedback F9.
- Sizes: `UnitId(u16)` (raids of 4 players with Revenants and summons stay far below 65 535),
  `EntityId(u8)`, `CampId(u8)`: PROPOSAL, aligned with `gameplay-programmer.md` 3.

**Dependencies.** `combat-engineer` (fills traits from statuses and keywords, owns units and
entities), `ai-engineer` (clone cost), `world-designer` (start positions into `place`).

**Tests.**
- Given `place(#1, (0,0))`, Then `occupant((0,0)) == Some(#1)` and `pos(#1) == Some((0,0))`; When
  `lift(#1)`, Then both are `None`.
- Given `place` on an occupied cell, Then panic (`#[should_panic]`).
- Given `swap(#1, #2)`, Then their cells are exchanged and the invariant holds.
- Given traits `weight = 6` on a Normal cell, Then `w = 5`; `weight = 0` on Mud, Then `w = 1`;
  `weight = 4` on Mud, Then `w = 5`.

---

## 10. Generic Mouvement and weighted push (§6.4, §6.2, §6.11, §5.1, §8.2, §4.6, §6.10)

### 10.1 API (`abalone-core/src/push.rs`)

```rust
pub enum PushRule { Classic, Weighted }
pub struct PushRules {
    pub rule: PushRule,
    pub max_group: u8,          // 3; 4 with Avalanche (§8.2), inline only then
    pub allow_equal_count: bool,// Percée (§8.2): n = m allowed if Weight strictly greater
    pub bonus_weight: u8,       // Bélier +2 (§8.1) and similar, added to the pushing side
}
pub struct Mover<'a> { pub arena: &'a Arena, pub traits: &'a [UnitTraits], pub entity: EntityId }
pub fn strong_enough(rule: PushRule, n: u8, m: u8, w_push: u32, w_resist: u32, equal: bool) -> bool;
pub fn legal_moves(m: &Mover, rules: &PushRules) -> Vec<Move>;             // canonical order
pub fn resolve(m: &Mover, mv: &Move, rules: &PushRules) -> Result<Outcome, MoveError>;
pub struct Outcome {
    pub arena: Arena,                                  // after the Mouvement and any slide
    pub moved: Vec<(UnitId, Axial, Axial)>,            // group then run, front first
    pub push: Option<PushInfo>,                        // n, m, w_push, w_resist, run units
    pub slides: Vec<(UnitId, Vec<Axial>)>,             // section 11
    pub ejected: Option<(UnitId, Axial, Direction)>,   // at most one (§6.10 limit 1)
    pub stopped_at_edge: Vec<UnitId>,                  // slides stopped by the one-ejection limit
}
```

`Move` is the existing `moves::Move` (cells and direction), so the notation and the bridge record of
8 integers stay as they are; Avalanche's 4th cell needs a wider record (`client-engineer`, R2).

### 10.2 Predicate (§6.4, FINAL proposed by the spec)

```text
Classic:  n > m
Weighted: (n > m, or n = m when allow_equal_count) and w_push > w_resist
w_push   = max(1, Σ w(u, cell(u)) over the group + slope + bonus_weight)
w_resist = Σ (w(u, cell(u)) + resist_bonus(u)) over the run
slope    = +1 if the front unit's cell is a Slope pointing along the push, −1 if against, else 0
```

- Invariant (§6.4, §1 pillar 1): with every `weight = 1`, no `resist_bonus`, Normal terrain and
  `bonus_weight = 0`, `w_push = n` and `w_resist = m`, so `Weighted == Classic`. Proven exhaustively
  here for `strong_enough`, and at board level by `lead-game-designer`'s LGD-05 and LGD-06 (perft,
  random positions, random games), which this role's API must pass.
- Which cell's Slope counts is a gap (§5.1, feedback F9): the front unit's cell is a PROPOSAL shared
  with `gameplay-programmer.md` 8.3.

### 10.3 Legality checks, in this order (each a `MoveError`)

| # | Check | Error | Source |
|---|---|---|---|
| 1 | 1 to `max_group` cells, all distinct | `EmptySelection`, `TooManyMarbles` | rules.md §3, §8.2 Avalanche |
| 2 | every cell holds a unit of `m.entity` with `SELECTABLE` | `NotOwnMarble`, `NotSelectable` | §6.0 "une entité ne déplace que ses propres boules", §6.11 |
| 3 | cells on one axis with no gap | `NotALine` | rules.md §3 |
| 4 | a group of 4 moves inline only | `NotInline` | §8.2 Avalanche |
| 5 | broadside: no group unit on Mud | `MudBroadside` | §5.1 Boue; "any member" is PROPOSAL, feedback F12 |
| 6 | broadside: each target cell `enterable` and empty | `Blocked`, `OffBoard` | rules.md §4.2 |
| 7 | inline, lead cell holds no unit: it must be `enterable` | `Blocked` (Rock), `OffBoard` (outside or Gouffre) | rules.md §4.1, §5.1 |
| 8 | inline, lead cell holds a unit of the mover's camp (own or allied entity) | `Blocked` | rules.md §4.1 (own), §6.2 (allied) |
| 9 | inline, lead cell holds another camp's unit: the run = the contiguous units whose camp is not the mover's | | §6.4; mixed enemy camps PROPOSAL, feedback F8 |
| 10 | no run unit `UNMOVABLE` | `PushBlocked` | §6.11 Inamovible |
| 11 | front unit of the group has `CAN_LEAD` | `CannotLead` | §6.11 Aveuglé |
| 12 | `strong_enough` | `NotStrongEnough` | §6.4 |
| 13 | cell after the run: empty and `enterable` (the run shifts), or not `open` (the last run unit is ejected); a unit of the mover's camp (any entity), a Rock or an `UNMOVABLE` unit there is illegal | `PushBlocked` | §6.4 condition 3, §6.2 allied units |
| 14 | the push would eject an `UNEJECTABLE` unit | `Unejectable` | §6.11 Inéjectable |
| 15 | a slide (section 11) would eject an `UNEJECTABLE` unit | `Unejectable` | PROPOSAL, feedback F16 |

A refused move returns the error and changes nothing (FINAL, rules.md §7 spirit). The order fixes
which error the UI shows when several apply (PROPOSAL).

### 10.4 Forced displacement helper (§6.10 "Déplacement forcé", limits 1 and 3)

```rust
pub enum EjectPolicy { Never, Allowed }               // Allowed only for Éjecteur effects and terrain with a 2-turn tell
pub fn shove(a: &Arena, u: UnitId, dir: Direction, cells: u8, p: EjectPolicy) -> ShoveOutcome;
pub struct ShoveOutcome { pub arena: Arena, pub path: Vec<Axial>, pub ejected: bool, pub stopped_at_edge: bool, pub blocked: bool }
```

- Moves one unit up to `cells` steps; stops before an occupied or non-`enterable` cell (`blocked`);
  at a non-`open` cell: ejects under `Allowed`, else stops on the last cell (`stopped_at_edge`, the
  Choc is `combat-engineer`'s, §6.10 limit 3). Entering Ice triggers the slide of section 11 with the
  same policy.
- Pull (Chaîne d'ancre) is a `shove` toward the hero; recoil (Coup de bouclier, Halo) is `shove(1)`.
  Choosing the one ejected unit among several (§6.10 limit 1) is `combat-engineer`'s loop over
  targets; this helper reports, it does not budget.

### 10.5 Generation order and speed

`legal_moves` scans the entity's units in canonical cell order, axes E, NE, SE, sizes 1 to
`max_group`, directions in `Direction::ALL` order, and keeps the moves `resolve` accepts (same scheme
as `moves::legal_moves`). Canonical, not classic, order: the RPG search has no fixture to preserve
(PROPOSAL). A cheaper pre-filter (skip a direction blocked at the first cell) is allowed if a test
proves equal output.

### 10.6 Dependencies, tests, risks (section 10)

- **Dependencies.** `combat-engineer` (traits from statuses, Choc, Losses, resource events,
  Instant suspendu turning an ejection into Stase), `lead-game-designer` (LGD-05, LGD-06),
  `ai-engineer` (move order and speed), `ux-designer` (preview reads `PushInfo` "2 contre 1 · Poids 4
  contre 3", §6.4), `client-engineer` (Avalanche record).
- **Tests (each §6.4 example is one test, board coordinates as in rules.md).**
  - Exhaustive: for `n` in 1..=4, `m` in 0..=3, `equal` in {false, true}, Weights 1:
    `strong_enough(Weighted, n, m, n, m, false) == strong_enough(Classic, n, m, n, m, false)`.
  - Given Warrior #1 (weight 3) at `(0,0)` and an enemy Fragment #9 (weight 1) at `(1,0)`, When
    `(0,0)>E`, Then `NotStrongEnough` (1 is not more than 1).
  - Given Warrior (3) at `(0,0)`, Fragment (1) at `(-1,0)`, enemy Guardian (3) at `(1,0)`, When
    `(-1,0)(0,0)>E`, Then legal, Guardian at `(2,0)`, `PushInfo { n: 2, m: 1, w_push: 4, w_resist: 3 }`.
  - Given two Fragments vs a lone Guardian, Then `NotStrongEnough` (2 vs 3).
  - Given three Fragments vs two Fragments with an empty cell behind, Then legal.
  - Given three Fragments vs a Warrior (3) standing on Mud, Then `NotStrongEnough` (3 vs 4).
  - Given `allow_equal_count`, Warrior + Fragment vs two Fragments, Then legal (2 vs 2, Weight 4 vs 2).
  - Given an allied unit of another entity of the mover's camp right after the run, Then
    `PushBlocked`; Given it in the group's selection, Then `NotOwnMarble`.
  - Given a Rock right after the run, Then `PushBlocked`; Given a Chasm right after it, Then the last
    run unit is ejected; Given that unit `UNEJECTABLE`, Then `Unejectable`.
  - Given a front unit without `CAN_LEAD`, When it heads a push, Then `CannotLead`; When it moves
    inline into an empty cell, Then legal.
  - Given a broadside pair with one unit on Mud, Then `MudBroadside`.
  - Given a group of 4 with `max_group = 4`, inline, vs a run of 3 with an empty cell behind and
    Weights 1, Then legal; broadside, Then `NotInline`.
  - Given two tiles stitched (section 8), When a pair pushes one enemy across the seam, Then it moves
    like anywhere else (§4.6).
  - Property: for 1 000 seeded random arenas (TUNE), every move from `legal_moves` resolves, conserves
    units (on board + ejected), ejects at most one, and `resolve` never panics on random malformed
    moves.
- **Risks.** Weight and flags change mid-turn (Cri de guerre then Mouvement): callers must rebuild
  `traits` before each call; a stale table is the likeliest bug. Debug assertion: `traits.len()`
  equals the unit count.

---

## 11. Ice slide (§5.1 Glace, §6.10 limits 1 and 3, §8.5 Sol verglacé)

**Implementation (`abalone-core/src/slide.rs`, called by `resolve` and `shove`).**

```text
slide_all(arena, units_front_first, dir, budget) :
  for u in units_front_first:                        # §5.1 "en commençant par celle de devant"
    if u did not end its displacement on Ice: continue
    loop:
      next = cell(u) + dir
      if not open(next):                              # off region or Chasm
        if budget.can_eject(u): eject u; budget.spent = true; break
        else: stopped_at_edge.push(u); break          # §6.10 limit 1 and 3: stop on the last cell
      if not enterable(next) or occupied(next): break # stop just before a Rock or a unit
      move u to next
      if not ice(next): break                         # stop on the first non-Ice cell
```

- Who slides (§5.1, FINAL there): a unit that is pushed, or a single unit that moves on its own; a
  voluntary group of 2 to 4 does not.
- Budget: a Mouvement has one ejection for the whole action, shared by the push and every slide; a
  non-Éjecteur effect has none (`EjectPolicy::Never`).
- Three cases the spec leaves open, PROPOSAL each (feedback F16): a unit of the **mover's own entity**
  never slides itself off the board on its own Mouvement (it stops on the last cell, as a classic
  move can never leave the board); a slide after a **Pas** (§6.3, "jamais hors du plateau") never
  ejects; a slide that would eject an `UNEJECTABLE` unit makes the Mouvement illegal (10.3 row 15).

**Dependencies.** `combat-engineer` (Choc and Ronces on a slide, if any, feedback F16),
`class-designer` (Sol verglacé, Zéro absolu), `ux-designer` (slide preview path).

**Tests.**
- Given Ice on `(2,0)`, `(3,0)` and Normal `(4,0)`, an enemy at `(1,0)` pushed E by a pair, Then it
  slides to `(4,0)`, `slides = [(#9, [(2,0),(3,0),(4,0)])]`.
- Given Ice up to the rim `(4,0)`, Then the pushed unit is ejected; Given a run of 2 both ending on
  Ice towards the rim, Then the front one is ejected and the second stops on `(4,0)` with
  `stopped_at_edge`.
- Given a unit `(0,0)` stepping alone onto Ice `(1,0)` with a unit on `(3,0)` and Ice on `(2,0)`,
  Then it stops on `(2,0)`.
- Given a pair moving inline onto Ice, Then no slide.
- Given a non-Éjecteur `shove` onto Ice toward the rim, Then the unit stops on the rim cell,
  `stopped_at_edge`.

---

## 12. Geometry for the ability language (§6.10, §6.7, §8.8, §4.5, §18)

**Implementation (`abalone-core/src/geom.rs`).** Pure functions over `Region` and `Arena`:

| Function | Use | Source |
|---|---|---|
| `dist(a, b) -> u32` | Range "à portée hexagonale, sans ligne de vue" | §6.10 Cible |
| `neighbours(c) -> [Axial; 6]` | Adjacency, Isolation, Formation | §6.5 |
| `ray(arena, from, dir) -> Vec<Axial>` | "En ligne": cells until the first unit or obstacle, the stop cell included | §6.10, §5.1 Roc stops projectiles |
| `ray_bounce(arena, from, dir) -> Vec<Axial>` | Crystal: one restart on the next cell of the axis | §5.1 Cristal |
| `disk(region, c, r)`, `ring(region, c, r)` | Zone, rings | §6.10 Zone |
| `order_from(origin, cells) -> Vec<Axial>` | Sort by (distance to origin, r, q) | §6.10 resolution order (FINAL proposed there) |
| `rot60_about(centre, c, k)`, `rotate_hex(arena, centre, k) -> Result<Arena, RotateError>` | Rotation of 7 cells: units, terrain and Slope directions turn | §8.8 Rotation |
| `reflect_about(centre, c)` | Point-symmetric PvP starts | §4.5 |
| `is_outer_rim(region, c)` | A neighbour outside the region | §6.7 Fuite (PROPOSAL, F6) |
| `is_edge(arena, c)` | A neighbour not `open` (outside or Gouffre) | §6.6 Danger du bord, §9.2 "Pression du bord" (PROPOSAL, F6) |
| `nearest_free(arena, c) -> Option<Axial>` | "Case libre la plus proche", order of `order_from` | §8.7 Paradoxe, §12 Sablier fêlé, §18 Résilient |

- `rotate_hex` refuses when the centre lacks one of its 6 neighbours in the region or a unit of the 7
  is `UNMOVABLE` (§8.8, FINAL there); no unit leaves the board, so no ejection (§8.8).
- Edge danger itself (§6.6) is `combat-engineer`'s: it runs `legal_moves` of each enemy entity and
  checks `Outcome.ejected`. A helper `ejecting_moves(mover, rules) -> Vec<(Move, UnitId)>` is offered
  here so the check stays one call (PROPOSAL).

**Tests.** One Given/When/Then per function, for example: Given a unit at `(3,0)` and a Rock at
`(2,0)`, When `ray(from (0,0), E)`, Then `[(1,0), (2,0)]`; Given a Crystal on `(2,0)` and nothing
else on the axis, Then `ray_bounce` goes on from `(3,0)` once; Given origin `(0,0)` and cells `(1,0)`,
`(0,-1)`, `(-1,1)`, Then `order_from` gives `(0,-1), (-1,1), (1,0)` (same distance, then r, then q);
Given a centre on the rim, Then `rotate_hex` is `Err(NotInside)`; six rotations are the identity.

**Tags.** Functions follow FINAL-proposed rules of §6.10; the two edge predicates are PROPOSAL.

---

## 13. Combat hashes: `state_hash` and `position_key` (§24.1, §4.7, §6.7)

**Implementation (`abalone-rpg/src/hash.rs`, glue owned here, fields owned by `combat-engineer`).**

- `state_hash(s) = Enc::new(b"ABcs", RULES_VERSION)` + `DATA_VERSION` + every field of `CombatState`
  through `Canon` (section 5), then `fnv1a64`. It covers "plateau, terrain et durées, PV, statuts,
  recharges, ressources, Cimetière, Préparations" (§24.1, FINAL there) because it covers every field
  by construction. Used by peers after every action (tech.md §6, a mismatch pauses the fight), by
  saves and by replays.
- `position_key(s)`: the same encoding **without** the fields that grow every turn, for the triple
  repetition of §6.7 ("l'état compte aussi les PV, les recharges et les ressources"). PROPOSAL list,
  feedback F7:
  - excluded: round number, each entity's turn count, the 60-turn no-Loss counter, the Usure and
    Brèche progress counters, Chronomancer snapshots, the `Effects` history;
  - included as **relative** values: cooldowns as turns left (not the absolute `ready_at` turn of
    `gameplay-programmer.md` 7.4), status durations as turns left, terrain timers as turns left.
  Without this split the key changes every turn and the repetition rule can never fire.
- Derived values (Edge danger, Isolation, previews) are never hashed (PROPOSAL, same as
  `gameplay-programmer.md` 4.1).

**Dependencies.** `combat-engineer` (implements `Canon` for its types, keeps relative timers
derivable), `network-engineer` (compares `state_hash` per record).

**Tests.**
- Given two states equal field by field built in different orders, Then equal `state_hash`.
- Mutation test: for each of a list of setters (one per field: a unit's HP, a status, a cooldown, a
  resource, a terrain timer, a Graveyard entry, a Preparation, the active entity, ...), Given a state,
  When that one field changes, Then `state_hash` changes. The list is checked against the struct by the
  destructuring rule (section 5).
- Given a fight where both sides shuffle back and forth for 4 rounds with nothing else changing, Then
  `position_key` repeats and the round-2 and round-4 keys are equal while `state_hash` differs.
- Golden: one R1 scenario's final `state_hash`, pinned natively and checked through WASM
  (`client-engineer`).

---

## 14. Setup id, action log, replay (§6.12, §4.7, §12, §6.1)

### 14.1 Setup hash and combat id

- `setup_hash = Enc(b"ABsu", RULES_VERSION)` + `DATA_VERSION` + the canonical `CombatSetup`
  (`combat-engineer`'s type: format, region and terrain, units with stats, entities, seats, tile and
  anchor), then `fnv1a64`. Two peers with the same setup share the same id; any difference (a hero
  stat, a tile) gives a different id before the first action.
- **Combat id** = `setup_hash` (PROPOSAL). §12 "graine `(sauvegarde, id du combat)`" then becomes
  `seed_of(save_seed, Loot, setup_hash, fight_seq)` where `fight_seq` is a per-hero counter in the
  hero save (PROPOSAL, `economy-designer`): without it, fighting the same pack on the same tile twice
  gives the same id and the same loot (feedback F11).

### 14.2 Log and replay (`abalone-rpg/src/log.rs`)

```rust
pub struct CombatLog { pub setup: CombatSetup, pub actions: Vec<Action>, pub hashes: Vec<u64> } // state_hash after each action
pub fn replay(log: &CombatLog) -> Result<CombatState, ReplayError>; // ReplayError { at, kind: Refused | HashMismatch }
```

- One record per action, not per turn (`gameplay-programmer.md` 4.5), so a reload mid-turn resumes
  exactly (§6.12). The P2P signed record (`network-engineer`) carries the same action bytes and hash.
- §25 R1 exit criterion "même log = même hash": `replay` of a recorded log gives the recorded hashes,
  natively **and** in WASM (feedback F18).

### 14.3 What the combat seed is for (§4.7, §6.1, §6.12)

Combat has no randomness (FINAL). The commit-reveal seed of §4.7 is consumed only by the PvP
initiative tie-break (§6.1) and goes into the setup. The boss retry "même graine" (§6.12) is then
simply "the same setup". PROPOSAL, feedback F10.

**Tests.**
- Given an R1 scenario played by the bot for 30 actions (TUNE), When `replay`, Then every hash
  matches; When one action is changed, Then `ReplayError { at, kind: Refused or HashMismatch }` at that
  index.
- Given two setups differing only by one Fragment's HP, Then different `setup_hash`.
- Given the same log, Then `replay` run twice gives equal states (no hidden state).

---

## 15. Save format (§6.12, §24.5, §11, §13.4, §4.2, §4.7)

### 15.1 Principles (PROPOSAL)

- The engine is the only judge, as for `savegame.ts`: the client stores and passes opaque JSON text;
  `abalone-world::save` decodes, validates and migrates it.
- **A hero save is never deleted by the engine.** Unlike a local classic game, it holds hours of
  progress. A save that does not decode is kept untouched in the store `quarantine` and the page
  offers "export the damaged save" (bug report). The local classic game keeps its decode-or-drop rule.
- **A save from a newer version is refused, not migrated**: the page is an older cached build (the
  offline app keeps old versions, tech.md §9.1). The save stays untouched and the page asks to reload.
- 64-bit values are **hex strings** in JSON (`"0123456789abcdef"`): a JavaScript number loses
  precision above 2^53.
- Saves are falsifiable (§13.4, FINAL there): no checksum, no signature. Validation catches
  corruption and impossible values, not cheating.

### 15.2 IndexedDB layout (`client-engineer` performs the calls)

Database `ab-alone` (existing), version bumped once to add stores (PROPOSAL):

| Store | Key | Value |
|---|---|---|
| `game` (existing) | `local` | classic local game, unchanged |
| `hero` | hero id | hero save JSON text (15.3) |
| `combat` | hero id | combat save JSON text (15.4), deleted when the fight ends |
| `quarantine` | `<store>:<key>:<utc ms>` | the raw text of a save that failed to decode |

Hero slots: the spec mentions character creation and Hardcore (§11) but not how many heroes. PROPOSAL:
the key format allows several; R3 ships one slot, more is a later UI task (open question Q4).

### 15.3 Hero save

```json
{
  "format": "ab-alone/hero", "version": 1,
  "rules": 1, "data": "9f3c0a1b2c3d4e5f", "world": 1,
  "id": "h-5d1e6a20c3b94f17", "created": "2026-11-02T18:04:11Z",
  "seed": "0123456789abcdef", "hardcore": false, "fight_seq": 12,
  "sections": {
    "hero": {}, "progress": {}, "talents": {}, "world": {}, "quests": {},
    "inventory": {}, "economy": {}, "crafting": {}, "reputation": {}, "codex": {}
  }
}
```

- Envelope fields (this role): `format`, `version`, `rules`, `data`, `world`, `id` (random 64 bits at
  creation, `crypto.getRandomValues`, outside the engine), `created`, `seed` (`save_seed` of
  `economy-designer`, drawn the same way), `hardcore` (§11), `fight_seq` (14.1).
- **Section registry** (PROPOSAL): each section is one Rust type with `serde` derive, owned by one
  role, decoded by `save::hero::decode` in a fixed order; a section validator can refuse the save.

| Section | Owner | Content (theirs to define) |
|---|---|---|
| `hero` | `progression-designer` | class, level, XP, rested pool, HP between fights (§4.2) |
| `talents` | `progression-designer` | Paths, active tree, equipped abilities |
| `world` | `world-designer` | discovered tiles, cleared, activated Beacons, position |
| `quests` | `narrative-quest-designer` | active and finished quests |
| `inventory`, `economy`, `crafting` | `economy-designer` | items, currencies, professions, recipes |
| `reputation`, `codex` | `narrative-quest-designer` | factions, Codex |

- Sets are encoded as **sorted arrays** (tiles, recipe ids), never as JSON objects keyed by a string
  of coordinates, so the text is canonical and small. 11 000 tiles of discovery fit in a bitset
  encoded as base64 (`world-designer` decides; size note in risks).
- **Migration.** `migrate.rs` holds `fn v1_to_v2(serde_json::Value) -> Result<Value, MigrateError>`
  and so on, chained; a test per step with a golden v1 file under `tests/saves/`. A section owner who
  changes a field writes the step in the same PR (PROPOSAL).

### 15.4 World version (§4.7 "graine de version")

When `world` in the save differs from `WORLD_VERSION`, the map has changed: the `world` section (tile
flags, nodes, position) is reset, the hero is placed at the hub, everything else is kept, and a notice
says so (PROPOSAL, feedback F13). A world change is therefore a deliberate, versioned event.

### 15.5 Combat save (§6.12)

```json
{ "format": "ab-alone/combat", "version": 1, "rules": 1, "data": "9f3c0a1b2c3d4e5f",
  "hero": "h-5d1e6a20c3b94f17", "setup": {}, "actions": [], "hash": "a1b2c3d4e5f60718" }
```

- Written after every action (§6.12, FINAL there) by the client, built by the engine. `setup` and
  `actions` use the JSON form of `combat-engineer`'s types; `hash` is the last `state_hash`.
- **Resume** = `replay` (14.2) then compare `hash`. Equal: the fight resumes at that action. Not
  equal, refused action, or `rules`/`data` different from the running build: the fight is **abandoned
  as a retreat** (no reward, no durability loss, the hero's HP as at the fight start, the pack back to
  full) and the save is deleted (PROPOSAL, feedback F15). A combat save never blocks the hero save.
- Online fights resume through the log catch-up (#226, `network-engineer`); the local combat save is
  the fallback when no peer is left.
- Size: about 1 000 actions for a long boss fight (TUNE estimate: 60 turns × 4 entities × 4 actions)
  at about 40 bytes each in JSON: about 40 KB rewritten per action. Fine for IndexedDB; measured in
  EA-17.

### 15.6 Export and import

Same model as `gamefile.ts` (tech.md §8): Export downloads `ab-alone-hero-<YYYY-MM-DD>.json`, the
hero save text as stored. Import runs `decode` (with migration); a good file replaces the slot after a
confirm, a bad one is refused with a short note that never quotes the file. 4 MiB cap (TUNE).

### 15.7 Dependencies, tests, risks (section 15)

- **Dependencies.** Every section owner above; `client-engineer` (IndexedDB stores, version bump,
  export and import UI, quarantine notice, Playwright reload e2e); `network-engineer` (online
  resume); `ux-designer` (notices: world reset, abandoned fight, newer save).
- **Tests.**
  - Given a v1 hero save golden file, When `decode`, Then every section equals the expected value;
    When `encode(decode(x))`, Then `x` byte for byte (canonical text).
  - Given a save with `"version": 2` on a v1 build, Then `Err(Newer)` and the input is untouched.
  - Given a save with an unknown section key, Then `Err(UnknownSection)` (not silently dropped).
  - Given `"world": 0` and `WORLD_VERSION = 1`, Then the decoded save has an empty `world` section,
    the hub position, and a `WorldReset` notice; other sections are unchanged.
  - Given a combat save whose last action is refused on replay, Then `Abandon` with the setup's start
    HP; Given a matching one, Then `Resume` at the right action.
  - Given a seed `"ffffffffffffffff"`, Then it round-trips exactly (no 2^53 loss).
  - e2e (`client-engineer`, R4): Given a fight in progress after 3 actions, When the page reloads,
    Then the board shows the same units, HP and active entity; Given a hero, When reloaded, Then the
    same tile and level are shown.
- **Risks.** Sections owned by many roles drift in style: the registry and the canonical-text test
  apply to all. A full rewrite per action is the simplest thing; if it is slow on mobile, append-only
  records are the follow-up.

---

## 16. Time inputs (§4.2, §4.8, §13.2, §17, §18, §20, §22)

**Implementation (`abalone-world/src/time.rs`)**, all pure functions of `now_ms: u64` (UTC epoch ms):

| Function | Value | Source |
|---|---|---|
| `day_index(ms)` | `ms / 86_400_000` | §13.2, §16 daily |
| `utc_day(ms) -> String` | `YYYY-MM-DD`, same string as `daily.ts::utcDay` | §13.2 "même fonction que daily.ts" |
| `hash32(text) -> u32` | port of `daily.ts::hash32` (FNV-1a 32 plus murmur3 finaliser) | same |
| `iso_week(ms) -> (i32, u8)` | ISO year and week, Monday 00:00 UTC | §17 weekly affixes |
| `slot(ms, period_ms) -> u64` | `ms / period_ms`: 3-hour world bosses (10 800 000 ms, TUNE §18) | §18, §22 |
| `day_phase(ms) -> u32` | `ms % 2_400_000` (40-minute cycle, TUNE §4.8) | §4.8 |

No function reads the clock: the client passes `Date.now()`. Durations in the world (step time, regen)
are integer milliseconds (`world-designer`).

**Tests.** Golden vectors shared with `daily.test.ts`: `utc_day(0) = "1970-01-01"`,
`hash32("ab-alone daily 2026-10-25")` equal in Rust and TypeScript; `iso_week` of 2026-01-01 is
(2026, 1) and of 2027-01-01 is (2026, 53); `slot(10_799_999, 10_800_000) = 0`, `slot(10_800_000, ...)
= 1`.

**Dependencies.** `world-designer`, `economy-designer`, `encounter-boss-designer`, `pvp-br-designer`
(callers), `client-engineer` (passes the time).

---

## 17. Bridge contract versions (§24.4)

The glue is `client-engineer`'s. This role fixes the envelope so every JSON crossing the bridge says
what it is: `{"v": BRIDGE_VERSION, "rules": RULES_VERSION, "data": DATA_VERSION, ...}` on the first
call (`hello()`), and plain payloads after. Peers exchange `hello` in their `Hello` message
(`network-engineer`): two peers with different `rules` or `data` cannot share a fight and are told to
reload (PROPOSAL, tech.md §6 drops a cheater the same way).

**Tests.** Given the bridge `hello()`, Then it parses and carries the three constants; Given a peer
`Hello` with another `data`, Then the party join is refused with a reason (`network-engineer`'s test,
this role provides the constants).

---

## 18. Performance and size budgets

| Budget | Value | Tag |
|---|---|---|
| `legal_moves` on an R1 skirmish (radius 3, 6 vs 6 units) | under 20 µs native release | TUNE |
| Search speed, Weighted all-1 on the standard 14 vs 14 start | at least 70 % of classic nodes per second | TUNE |
| `state_hash` of a raid state (427 cells, 40 units) | under 50 µs native release | TUNE |
| WASM module | report size per PR that adds a crate; tech.md budget 500 KB gzipped | TUNE (tech.md) |

Measured by a `#[ignore]` bench test run by hand and noted in the PR (no bench framework: KISS). The
AI is `ai-engineer`'s; this role keeps the core cheap to clone (`Vec`s, no `Box<dyn>`).

---

## 19. Feedback on the gameplay spec

Contradictions and gaps found while specifying the engine. The gameplay spec is not modified; each
item names the proposal this file uses until an owner decides.

- **F1 (§24.1, fact 1).** "Board stocke ses cases dans une HashMap std, dont l'ordre de parcours
  change": the code never iterates the map; all scans use fixed q-major loops. The real blocker is
  `MAX_RADIUS`. Also, the canonical "r then q" order differs from the classic q-major order: moving the
  classic engine to it would change boss tie-breaks and break the recorded fixtures. Proposal: classic
  order kept for classic code, canonical order for RPG code.
- **F2 (§24.2).** "`Board` passe à une région de cases arbitraire": not needed. The RPG needs unit ids
  and N camps, which `Board`/`Cell` cannot hold, so a new `Arena` is needed anyway; the classic modes
  can stay untouched. Proposal: new `Region` + `Arena`, classic `Board` unchanged (conflicts with
  `level-designer.md` 3.1, open question Q2).
- **F3 (§5.1 Gouffre).** "Déjà dans le moteur : `Board::void`": `void` is permanent, but Effondrement
  (3 turns), Séisme and Marée (2 turns), the Brèche and the Pont need timed or fillable Gouffres.
  Proposal: Gouffre is a terrain kind (overlay with a timer), `void` stays for classic bosses.
- **F4 (§4.1 vs §6.8, §19, §20).** "1 case du monde = 1 plateau" holds for radius 3 and 4 only. Radius
  5 boards (trio elite and dungeon, duo boss, 2v2 arena) overlap the 6 neighbour tiles, and radius 8
  (battle royale) is not a tile shape at all. The spec does not say which terrain those cells take.
  Proposal: the global-terrain rule of `level-designer.md` (each cell takes its own tile's terrain).
- **F5 (§6.7 Brèche).** "L'anneau extérieur ... jusqu'au rayon 2" has no meaning on a multi-tile union
  (no single centre or radius) nor around interior holes. Proposal: peel by depth from the outside
  (`Region::layer`), stopping when the remaining cells have depth at least `max_depth − 2`; on a
  hexagon this is exactly "down to radius 2".
- **F6 (§6.6, §6.7, §9.2).** "Bord" is used for the Fuite ("sur le bord"), the Danger du bord and the
  rune "boules du bord", never defined when Gouffres sit inside the board. Proposal: Fuite uses the
  outer rim (neighbour outside the region); the alert and the rune use the edge (neighbour not open,
  Gouffre included).
- **F7 (§6.7 triple répétition).** The state "compte aussi les PV, les recharges et les ressources",
  but the spec does not list what is left out: with turn counters, absolute cooldowns or the no-Loss
  counter in the state, no position can ever repeat. Proposal: `position_key` (section 13) without
  monotonic counters and with relative timers.
- **F8 (§6.4 "file adverse").** With more than two camps (battle royale, 6 players) a run can mix two
  enemy camps; undefined. Proposal: the run is the contiguous units whose camp is not the mover's,
  mixed allowed; a unit of the mover's camp (any entity) after the run blocks.
- **F9 (§6.4, §5.1 Pente and Boue).** Not stated: which cell's Slope counts for a group (proposal: the
  front unit's), whether the Mud +1 is added before or after the 1..5 clamp (proposal: after, then
  clamp), and whether "minimum 1" applies to the group total (proposal: yes).
- **F10 (§4.7, §6.12).** The combat seed is drawn by commit-reveal, but combat has no randomness and
  the board comes from the tile seed. Only the PvP initiative tie-break (§6.1) consumes it; "même
  graine" for a boss retry is then just "same setup". The spec should say so.
- **F11 (§12).** "Graine `(sauvegarde, id du combat)`": "id du combat" is undefined. If it is derived
  from the fight's content, refighting the same pack gives the same loot. Proposal: combat id =
  `setup_hash`, plus a per-hero `fight_seq` in the loot seed.
- **F12 (§5.1 Boue).** "Aucun mouvement de côté" does not say for which unit of a group. Proposal: a
  broadside is illegal if any unit of the group stands on Mud.
- **F13 (§4.7).** A world built from "une graine de version" changes when the version changes, but
  each player's world state (tiles, nodes, chests) is stored by tile. Nothing says what happens to an
  old save. Proposal: reset the `world` section, keep the hero (section 15.4).
- **F14 (§8.8 Pont).** "Ajoute une case au-delà du bord": can a Pont extend a previous Pont, and does
  the added cell change the Brèche depth or the Fuite rim? Proposal: chaining allowed (region grows),
  added cells take part in everything like any cell while they exist.
- **F15 (§6.12).** Resume after reload replays the log, but a game update between save and reload
  (new rules or data) can make the replay differ. Proposal: the fight is abandoned as a penalty-free
  retreat (section 15.5).
- **F16 (§5.1 Glace).** Open cases: a unit's own voluntary single Mouvement sliding itself off the
  board; a slide after a Pas ("jamais hors du plateau"); an Inéjectable unit sliding toward the edge
  (illegal move or stop?); whether a slide that ends against a unit or a Rock deals a Choc, and whether
  sliding into Ronces counts as "poussée dans la case". Proposals in section 11; the Choc and Ronces
  questions go to `combat-engineer`.
- **F17 (§24.2 Effects).** "`apply_action` ... renvoie des `Effects` (le contrat de rendu actuel)":
  there is no `Effects` type in the code; the client infers animations from flat arrays. It is new
  work (`combat-engineer`), not a reuse.
- **F18 (§25 R1).** "Déterminisme vérifié (même log = même hash)" should say "on native and on WASM":
  peers run the WASM build, the tests run natively, and the two must agree.
- **F19 (§24.3).** RON or JSON is left open. Proposal: JSON (one parser for data, saves, bridge, MCP).
- **F20 (§11, §6.12).** Hardcore (permadeath) is a character-creation option, but the number of
  heroes per browser is never given, and the boss retry "on recommence aussitôt" is not stated for a
  Hardcore hero. Proposal for the engine: the save keys allow several heroes; the Hardcore rule is
  `progression-designer`'s.
- **F21 (§4.7, §13.4).** In a group fight every peer's hero comes from a falsifiable local save, and
  the spec does not say how the peers agree on the `CombatSetup`. Proposal: each peer sends its own
  hero snapshot signed (`network-engineer`), the setup sorts them by seat, and `setup_hash` is compared
  before the first action.
- **F22 (§24.1 "les unités sont dans un Vec trié par id").** Fine, but new units (Revenants, summons)
  need a rule for their id. Proposal: the next free id, never a reused one (same as
  `gameplay-programmer.md` 2).
- **F23 (§6.4 vs §8.2).** §6.4 says "on reste à 3 boules par groupe", while Avalanche (§8.2) makes a
  group of 4. It also changes the FINAL group size of `rules.md` §3. Proposal: `max_group` is 3 except
  for the one Mouvement Avalanche grants; the R0 `rules.md` delta names the exception.
- **F24 (§8.2 Écrasement).** "Pousse une file contre un obstacle ... rien ne bouge" needs the run of an
  illegal push. The engine offers `push::run_of(mover, mv) -> Option<RunInfo>` (the run and what
  blocks it) so the ability does not re-implement the scan (PROPOSAL, `combat-engineer` uses it).

---

## 20. Open questions

- **Q1.** Where does the tile lattice live: `abalone-core/src/tiling.rs` (this file) or
  `abalone-world/src/tiling.rs` (`level-designer.md`)? The combat crate needs it without the world.
- **Q2.** Refactor the classic `Board` onto `Region` (`level-designer.md` 3.1) or leave it untouched
  (this file)? The overlap on `Region` and terrain storage between `world-designer` and this role, and
  on the push predicate with `combat-engineer` (lead table), needs one owner each.
- **Q3.** JSON or RON for `data/` (§24.3)?
- **Q4.** How many hero slots per browser, and when (R3 ships one)?
- **Q5.** Is the coverage exclusion of `serde`-derived files acceptable if the derives leave regions
  uncovered (section 3.7)?
- **Q6.** Single source of truth for unit positions: `Arena.pos` only, or also `Unit.cell` in
  `CombatState`?
- **Q7.** Should the classic `position_hash` move from `DefaultHasher` to `fnv1a64` too (no rule
  change, all hash values change, no fixture stores a hash)?
- **Q8.** An Inéjectable unit pushed or slid toward the edge: illegal move (this file) or stop on the
  last cell?
- **Q9.** Is FNV-1a 64 enough for desync detection, or do the owners want a 128-bit hash for the
  signed log (collisions are not a security issue here, section 4.3)?
- **Q10.** A combat save that cannot resume after an update: penalty-free retreat (this file) or the
  normal defeat of §6.12?

---

## 21. Tasks

One Task = one PR, strict TDD, 100 % lines and regions, `scripts/verify.sh` green. "Phase" is the
roadmap phase of §25. Tasks marked "no UI" need no screenshot (CONTRIBUTING §6.4).

**EA-00. Spec: engine delta in `tech.md`** (R0)
- Outcome: `tech.md` §3 and §8 describe the RPG crates, the determinism kit, the hashes and the save
  format, as part of §0 docs PR 4.
- Done: [ ] §3 crate graph and dependency policy; [ ] determinism rules and lints; [ ] §8 hero and
  combat saves, stores, versions; [ ] feedback F1 to F24 raised on the Decision #313 thread by the
  lead; [ ] docs-only PR merged by @TidyMaze.

**EA-01. Determinism kit `det.rs`** (R1)
- Outcome: `abalone-core` has `mix`, `h`, `coord`, `h_str`, `seed_of`, `Stream`, `Rng`, `fnv1a64`,
  `div_floor`, `mul_bp`, and `hull.rs` uses the shared `mix`.
- Done: [ ] golden vectors pinned; [ ] property tests of `below` and `pick_weighted`; [ ] boss
  fixtures unchanged; [ ] no UI.

**EA-02. Canonical encoder `canon.rs`** (R1)
- Outcome: `Enc` and the `Canon` trait exist with the exhaustive destructuring rule, implemented for
  `Direction` and `Move`.
- Done: [ ] byte-level golden test; [ ] `opt` and `seq` unambiguity tests; [ ] rule written in the
  module docs; [ ] no UI.

**EA-03. Crate skeletons and lints** (R1)
- Outcome: `abalone-rpg` and `abalone-world` are workspace members with `RULES_VERSION`, the float,
  `HashMap` and RNG lints, `serde` and `serde_json` pinned, and the coverage gate proven on one derived
  type.
- Done: [ ] `scripts/verify.sh` green with both crates; [ ] lint smoke test noted in the PR; [ ] WASM
  size before and after noted; [ ] serde coverage result noted (exclusion only with owner OK, Q5).

**EA-04. Data bundle loader and `DATA_VERSION`** (R1)
- Outcome: `abalone-world::data` (and the `abalone-rpg` twin for combat data) load `data/` JSON from a
  sorted `FILES` list, give dense ids and `DATA_VERSION`, and run the integrity harness.
- Done: [ ] missing or extra file test; [ ] id rule test; [ ] version stable and sensitive tests;
  [ ] `check_all` harness with one sample check; [ ] no UI.

**EA-05. `Region`** (R1)
- Outcome: `abalone-core` has `Region` (hex, from_cells, contains, index, add, remove, canon, depth,
  layer, core_cells).
- Done: [ ] hex sizes 0 to 8; [ ] canon order equals the bridge order; [ ] depth and layers on hex
  and a 2-tile union; [ ] `add` growth; [ ] classic code untouched; [ ] no UI.

**EA-06. `Arena` and `UnitTraits`** (R1)
- Outcome: `abalone-core` has `Arena` with occupancy by `UnitId`, positions, traits table and the
  effective Weight with clamp.
- Done: [ ] mutator and invariant tests; [ ] Weight clamp tests; [ ] `Canon` for `Arena` with a
  cross-target golden hash handed to `client-engineer`; [ ] no UI.

**EA-07. Generic Mouvement and weighted push** (R1)
- Outcome: `push::legal_moves`, `push::resolve` and `strong_enough` implement Classic and Weighted with
  `max_group`, `allow_equal_count` and `bonus_weight`, allied blocking and the four flags, on Normal
  terrain.
- Done: [ ] the six §6.4 examples; [ ] every row of 10.3 that needs no terrain has a refusing test;
  [ ] exhaustive predicate equivalence; [ ] random arena property test; [ ] `run_of` helper (F24);
  [ ] API ready for LGD-06; [ ] no UI.

**EA-08. Combat hash glue, setup hash, log and replay** (R1)
- Outcome: `abalone-rpg` has `state_hash`, `setup_hash` and `replay(CombatLog)` over
  `combat-engineer`'s types, and the R1 determinism check runs natively and in WASM.
- Done: [ ] mutation test over every `CombatState` field; [ ] replay of a bot log matches every hash;
  [ ] altered log fails at the right index; [ ] same golden hash in a vitest through WASM
  (`client-engineer`); [ ] no UI.

**EA-09. Terrain layer storage** (R2)
- Outcome: `abalone-core` has `CellKind`, `TerrainMap` with overlays and clocks, and the predicates
  `open`, `enterable`, `blocks_push`, `mud`, `slope`, `ice`.
- Done: [ ] overlay and tick tests; [ ] `Canon` order-independence; [ ] `Arena` carries the map;
  [ ] no UI.

**EA-10. Terrain-aware push** (R2)
- Outcome: `resolve` and `legal_moves` handle Rock, Gouffre, Mud (+1 Weight, no broadside) and Slope.
- Done: [ ] rows 5 to 7 and 13 of 10.3 with terrain; [ ] Mud example of §6.4; [ ] Slope along and
  against; [ ] Weighted all-1 on Normal terrain still equals Classic (LGD-06 rerun); [ ] no UI.

**EA-11. Ice slide and `shove`** (R2)
- Outcome: pushed units and single movers slide on Ice front first under one shared ejection budget,
  and `shove` gives forced displacement with `EjectPolicy`.
- Done: [ ] the five tests of section 11; [ ] the F16 proposals tested as written; [ ] `Outcome.slides`
  and `stopped_at_edge` filled; [ ] no UI.

**EA-12. Geometry helpers** (R2)
- Outcome: `geom.rs` gives `dist`, `neighbours`, `ray`, `ray_bounce`, `disk`, `ring`, `order_from`,
  `reflect_about`, `is_outer_rim`, `is_edge`, `nearest_free`, `ejecting_moves`.
- Done: [ ] one Given/When/Then per function; [ ] `order_from` matches §6.10 order; [ ] no UI.

**EA-13. `position_key` for repetition** (R2)
- Outcome: the triple repetition of §6.7 runs on a key without monotonic counters and with relative
  timers.
- Done: [ ] shuffle test repeats the key while `state_hash` differs; [ ] excluded-field list in the
  module docs; [ ] `combat-engineer` wired the draw; [ ] no UI.

**EA-14. Avalanche group of 4** (R2)
- Outcome: `max_group = 4` works inline only, end to end through the bridge record.
- Done: [ ] 4 vs 3 legal, broadside refused; [ ] bridge record widened with a version bump
  (`client-engineer`); [ ] Playwright check of the Warrior ultimate with a screenshot in the PR.

**EA-15. Hero save envelope, registry, migrations** (R3)
- Outcome: `abalone-world::save::hero` decodes, validates, migrates and encodes the hero save in
  canonical text, with quarantine and newer-version refusal.
- Done: [ ] golden v1 file round-trip byte for byte; [ ] newer, unknown section, bad hex tests;
  [ ] migration chain with one sample step; [ ] export and import format; [ ] e2e reload of a hero
  (`client-engineer`) with a screenshot.

**EA-16. Combat save and resume** (R4)
- Outcome: a fight in progress survives a page reload by replay, or is abandoned as a retreat when it
  cannot be replayed.
- Done: [ ] resume and abandon tests; [ ] size and write time measured on a long log; [ ] e2e reload
  mid-fight (`client-engineer`) with a screenshot.

**EA-17. Tile lattice** (R4)
- Outcome: `tiling.rs` gives `tile_centre`, `tile_of`, `tiles_region`, `to_local`, `to_global`.
- Done: [ ] neighbour centres test; [ ] 201 × 201 window property; [ ] world-radius round trip;
  [ ] Q1 settled before merge; [ ] no UI.

**EA-18. Time helpers** (R4)
- Outcome: `abalone-world::time` gives `day_index`, `utc_day`, `hash32`, `iso_week`, `slot`,
  `day_phase`, equal to `daily.ts` where they overlap.
- Done: [ ] golden vectors shared with `daily.test.ts`; [ ] ISO week edge years; [ ] no UI.

**EA-19. World version reset** (R4)
- Outcome: a hero save from an older `WORLD_VERSION` loads with its `world` section reset and a notice.
- Done: [ ] decode test; [ ] notice shown in the client (`client-engineer`, `ux-designer`) with a
  screenshot.

**EA-20. Multi-tile regions and seams** (R8)
- Outcome: fights on 2, 3 and 7 tiles run on stitched regions with depth-based Breach layers and
  core cells.
- Done: [ ] seam push and slide tests; [ ] Breach layers on a 3-tile union (F5 proposal);
  [ ] `core_cells` of a flower; [ ] The Hull multi-tile scenario passes (`encounter-boss-designer`).

**EA-21. Region edits: Pont and Rotation** (R9)
- Outcome: `Region::add` and `rotate_hex` serve the Géomancien's Pont and Rotation, units, terrain and
  Slope directions included.
- Done: [ ] Pont beyond the edge, chained, expiry ejection hook; [ ] rotation refusals and identity
  after six; [ ] no UI beyond the class's own PR.

**EA-22. N-camp arenas: battle royale and 2v2** (R10)
- Outcome: the generic engine runs radius 8 with 3 to 6 camps (rules.md §10.4; mixed-camp runs, F8) and radius 5 with
  4 entities in 2 camps, with point-symmetric starts.
- Done: [ ] mixed run tests; [ ] symmetric start helper tests; [ ] `resolve_round` support for
  `pvp-br-designer`'s order validation; [ ] two-tab e2e owned by `client-engineer`.
