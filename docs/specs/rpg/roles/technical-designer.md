# Data formats, validation and content tools: implementation spec (role `technical-designer`)

Status: role draft v0, PROPOSAL. Written for the RPG pivot (Decision #313, still open). Spec only, no
code: strict TDD applies from R1 (CONTRIBUTING section 11). Source of truth: the validated French
gameplay spec (`docs/specs/rpg/plan.fr.md` in the repo, same text as the approved plan). Section
numbers like "§6.10" point to that gameplay spec. This file adds no game rule on top of it: it says
how the content becomes data, how the data is checked, and which tools content authors use. What is
missing or contradictory in the gameplay spec is listed in section 27, never fixed here.

**Tags**, as in `rules.md`: **FINAL** (decided), **TUNE** (start value, set by playtests or
measurement), **PROPOSAL** (proposed here, an owner confirms). Every number carries one. A number
copied from the gameplay spec keeps its tag there: the gameplay spec says "everything is PROPOSAL and
every number is TUNE unless stated", so most copied numbers are TUNE. Section numbers, issue numbers,
ids, example coordinates and example test values are references, not tuning numbers, and carry no
tag.

**Role slugs used for dependencies.** The sibling role files use different names for the same jobs;
the lead agent maps them to the real roster.

| Slug here | Owns | Also called in other role files |
|---|---|---|
| `technical-designer` (this file) | Data file formats, the `abalone-data` crate, loader, ids, integrity tests, content hash, scenario format, content CLI | `data-tools`, part of `tech-lead`, part of `content-designer` |
| `tech-lead` | Crate graph, dependency policy, WASM size budget, bridge conventions, CI | `tech-lead` |
| `engine-core` | `abalone-core`: board mask, terrain layer, weighted push | `engine-engineer` |
| `combat-engine` | `abalone-rpg`: `CombatState`, `apply_action`, primitive interpreter, statuses, damage, victory | `combat-engineer` |
| `class-designer` | Classes, abilities, traits, Fragments, the numbers in `data/classes/` | `content-designer` (classes part) |
| `stats-progression` | Stat formulas, `g(L)`, XP curve, talent rules at runtime, hero save file | `progression-talents` |
| `encounter-boss-designer` | Monsters, packs, formats, bosses, dungeon difficulty | `dungeons-bosses` |
| `narrative-quest-designer` | Quests, text, factions, Codex, puzzles, tutorial | `quest-designer`, `narrative-designer` |
| `world-generator` | Map, tiles, biome placement, dungeon maps, events, UTC seeds | `world-generation`, `world-engineer` |
| `items-loot` | Item rolls, loot tables content, inventory, merchants, prices | `loot-economy`, `economy-merchants` |
| `gathering-crafting` | Nodes, tools, refining, recipes, consumables content | `gathering-crafting` |
| `ai-engineer` | Search, monster AI, player bot, bot ladder | `ai-engineer`, `qa-balance` |
| `ux-designer` | What the player reads: cards, previews, glyph legend | `ux-designer` |
| `client-engineer` | TypeScript client, bridge plumbing, IndexedDB, Playwright | `client-ui` |
| `network-p2p` | Party sessions, signed logs, commit-reveal | `netcode`, `network-engineer` |
| `pvp-br-designer` | Arenas, normalization templates, battle royale | `pvp-br` |
| `art-audio` | Glyph list, palettes, sounds | `art-director` |

---

## 1. Scope

In scope (this role owns the format, the code that reads it, and the checks):

- The `data/` folder (§1 pillar 6, §24.3): file layout, the authoring format, units, ids, text keys.
- The crate that holds every content definition type and loads the embedded files (`abalone-data`).
- The schema of the content languages: the ability language (§6.10, §6.11), passives (traits, runes,
  aspects, set bonuses, biome rules), patches (ranks, aspects, affixes), resources (§8), terrain
  (§5.1), and the generic shapes the other content uses (items, recipes, loot tables, quests,
  dungeons, templates).
- Validation: the integrity test harness and its rule catalog (§24.3), including the point-budget
  proofs (§9.1, §10) and the per-ability rules (counter, Ejector, mass control, cost).
- Determinism of the data (§24.1): integers only, fixed order, the content hash.
- Content tools: the scenario text format for rules tests (§1 pillar 4), the `abalone-content` CLI,
  the content view on the WASM bridge (§24.4), id aliases for saves (§6.12, §24.5).

Out of scope (each section lists the owner in "Dependencies"): what the numbers are (designers),
how the engine executes an effect (`combat-engine`), runtime talent and save logic
(`stats-progression`), loot and craft rolls (`items-loot`, `gathering-crafting`), rendering
(`client-engineer`, `ux-designer`), networking (`network-p2p`).

---

## 2. Inputs read

- Gameplay spec, whole file §0 to §26, in detail §1, §4.1 to §4.3, §5, §6 (all), §7, §8, §9, §10,
  §11, §12, §13, §14, §15, §16, §17, §19, §20, §24, §25, §26.
- `SPEC.md` §2, §3, §6. `CONTRIBUTING.md` §1 (rules 16, 17), §5, §11, §13.
- `docs/specs/tech.md` §1 to §4 (no_std core, `Ruleset`, `Effects`, bridge contract, 500 KB budget),
  §7, §8 (persistence, `savegame.ts` format), §10 (property tests, golden games).
- `docs/specs/rules.md` §11 (numbers index, the FINAL/TUNE convention), §12 (example format).
- `docs/specs/mcp.md` §4.3 (generic boss object: stable `kind` strings, never renamed).
- `docs/specs/world.md` §5, §8 (glyph plus colour, never colour alone).
- Sibling role files in `docs/specs/rpg/roles/`: `encounter-boss-designer.md` (sections 2, 3.1,
  10.1, 19: RON examples, `data/monsters/`, `data/bosses/`), `narrative-quest-designer.md` (sections
  4.2, 4.7, 10.2, 17, 18: quest RON format, puzzle text format, text keys, save sections),
  `ux-designer.md` (glyph ids per terrain and status, the combat view).
- Code: `crates/abalone-core/src/board.rs` (`HashMap` cells, `MAX_RADIUS = 5`),
  `encounter/fixture.rs` (text format: header lines, `q,r` joined by `;`), `encounter/telemetry.rs`
  (hand-written JSON line), `encounter/hull.rs` (`mix`, splitmix64), `crates/abalone-wasm/src/lib.rs`
  (flat integer arrays, decision #74), `crates/abalone-cli` (lib plus thin `main`), every
  `Cargo.toml`, `scripts/verify.sh`, `client/src/savegame.ts` (versioned JSON, drop on unknown
  version), `client/src/daily.ts` (`hash32`, UTC day).

**Facts from the code that shape this spec.**

1. **No external crate in the engine.** `abalone-core` and `abalone-cli` have no dependency at all;
   `abalone-wasm` has only `wasm-bindgen`. JSON is written by hand (`telemetry.rs`), fixtures are a
   tiny text format parsed by hand (`fixture.rs`). Adding `serde` and a RON parser is a real policy
   change: it goes to `tech-lead` as a question (Q2) with a measured size (section 4.5).
2. **The bridge speaks flat integer arrays** (decision #74, header of `abalone-wasm/src/lib.rs`).
   §24.4 asks for "JSON versionné". Section 24 keeps integer arrays for hot paths and adds JSON only
   for the content view, which is read once (feedback F19).
3. **`Board` iterates a `HashMap`** (§24.1 says so too). The data crate never uses one, and a clippy
   rule enforces it (section 5.3).
4. **Coverage is 100 % lines and regions** (`scripts/verify.sh`). Derived serde code may report
   regions: the first PR measures it (section 4.6).
5. **The existing text formats work.** `fixture.rs` and the puzzle format of the narrative role use
   one header per line and cells as `q,r` joined by `;`. The scenario format of section 22 reuses
   that style instead of inventing a grid syntax.

---

## 3. Conventions used by every section

### 3.1 Units (§24.1)

| Quantity | Stored as | Field suffix | Example | Tag |
|---|---|---|---|---|
| Percentage, multiplier | basis points, 10 000 bp = 100 % | `_bp` | ×1.3 is `13000`, −50 % is `-5000` | FINAL (§24.1 "points de base") |
| Duration, cooldown, tell | whole turns, `u8` | `turns`, `cooldown`, `tell` | `2` | FINAL (§6.3) |
| Weight | `u8`, range 1 to 5 | `weight` | `3` | FINAL proposed (§6.4) |
| Range, radius | cells, `u8` | `range`, `radius` | `4` | FINAL (§6.10) |
| Resource amount | integer in the resource's own unit | `cost`, `gain` | Rage `25`, grains `2` | FINAL (§8) |
| Stat values | integer | none | HP `120` | FINAL (§24.1) |
| VIT | tenths of VIT ("dVIT") | `_dvit` | base `100` = 10 VIT | PROPOSAL (feedback F4) |
| Real time (world only) | milliseconds or seconds, integer | `_ms`, `_s` | step `300` ms | FINAL (§4.2 unit) |
| Probability weight | integer weight, no implied total | `weight` | `55`, `15` | PROPOSAL |

No float appears in any data file or any def type (§24.1, FINAL). A field typed as an integer makes
the parser refuse `1.5`, so the rule is enforced by the types, not by a lint.

### 3.2 Rule of thumb: FINAL rules in code, TUNE numbers in data (PROPOSAL)

A FINAL rule of the gameplay spec (weighted push, one ejection per action, the hero dies when
ejected, durations count the bearer's turns) is code in `abalone-core` or `abalone-rpg`, with its own
unit test. A TUNE number (a cost, a ratio, a share, a threshold) is data. A designer changes balance
with a data PR and no code; a data PR can never change a FINAL rule. Clamps that make a rule safe
(Weight 1 to 5, at most 3 targets for a mass hard control) stay as code constants **and** as
integrity checks on the data, so a bad number fails `cargo test` before it reaches the engine.

### 3.3 Files

| Path | Content | Field owner |
|---|---|---|
| `data/classes/<class>.ron` | One class: `ClassDef`, its resources, its trait, its squad bonus, its 10 abilities (§8) | `class-designer` |
| `data/statuses.ron` | Statuses, keywords, control categories (§6.11) | `class-designer` with `combat-engine` |
| `data/terrain.ron` | The 16 cell types of §5.1 (Normal plus 15 special types): parameters, glyph | `world-generator` |
| `data/biomes.ron` | The 10 biomes and the hub (§5.2): levels, terrain shares, global rule, resources, families, affinity, travel cost | `world-generator` |
| `data/world.ron` | World generation parameters (§4.1 to §4.4, §4.8) | `world-generator` |
| `data/monsters/*.ron`, `data/encounters/*.ron`, `data/bosses/<id>.ron`, `data/mythic/*.ron` | As in `encounter-boss-designer.md` section 2 | `encounter-boss-designer` |
| `data/talents/paths.ron`, `data/talents/shards.ron`, `data/talents/rules.ron` | The Five Paths, shards, budget rules (§9, §10) | `stats-progression` |
| `data/progression.ron` | XP constants, level unlocks, rest bonus (§11) | `stats-progression` |
| `data/stats.ron` | Hero base stats at level 1, stat list (§7) | `stats-progression` |
| `data/items/{bases,rarities,affixes,aspects,uniques,sets,gems}.ron` | Items (§12) | `items-loot` |
| `data/loot/*.ron` | Loot tables (§12, §17, §20) | `items-loot` |
| `data/merchants.ron`, `data/currencies.ron` | §13 | `items-loot` |
| `data/gathering/{nodes,tools}.ron`, `data/crafting/{stations,refining,recipes,consumables}.ron` | §14, §15 | `gathering-crafting` |
| `data/quests/*.ron`, `data/puzzles/*.txt`, `data/factions.ron`, ... | As in `narrative-quest-designer.md` sections 4.1, 10.2, 12, 13 | `narrative-quest-designer` |
| `data/dungeons/<id>.ron` | Dungeon plans (§17) | `world-generator` with `encounter-boss-designer` |
| `data/templates.ron` | PvP level 100 and BR level 20 templates (§19, §20) | `pvp-br-designer` |
| `data/aliases.ron` | Renamed ids, for saves (section 6.3) | `technical-designer` |
| `data/text/en.json` | Every player-facing string, flat key to text (section 6.4) | `narrative-quest-designer` |

One file per class (and per boss, per dungeon, per quest zone) on purpose: two designers working on
two classes never touch the same file, so their PRs do not conflict (CONTRIBUTING rule 16).

---

## 4. Data folder, format, crate and loader (§1 pillar 6, §24.3)

§1 pillar 6: classes, abilities, runes, items, biomes, monsters, quests and recipes are data files,
the engine stays generic. §24.3: folder `data/`, RON or JSON, embedded with `include_str!`,
integrity tests.

### 4.1 Format: RON for authored data, JSON at the edges (PROPOSAL)

| Data | Format | Why |
|---|---|---|
| Authored content (`data/**/*.ron`) | RON | Comments allowed, enums read as written (`Push(dist: 1)`), trailing commas, the sibling role files already write RON examples |
| Text (`data/text/<lang>.json`) | JSON, one flat object | The client imports it natively (Vite JSON import), no RON parser in TypeScript |
| Hand-written boards and recorded games (`*.txt`) | The existing text format of `fixture.rs` | Already in the repo, diff-friendly, one move per line |
| Saves, exports, bridge content view | JSON with a `version` field | Same convention as `savegame.ts` and `tech.md` §8 |

### 4.2 Crate `abalone-data` (PROPOSAL)

```
crates/abalone-data/
  Cargo.toml          serde (derive) and ron, exact versions pinned (CONTRIBUTING: exact versions)
  clippy.toml         disallowed-types: HashMap, HashSet (section 5.3)
  src/lib.rs          Content, load(), content()
  src/files.rs        the embedded file list: [(path, include_str!(...)); N]
  src/error.rs        DataError { file, line, col, message }
  src/id.rs           Id<T>, Registry<T>
  src/units.rs        Bp, Turns, Weight newtypes with checked ranges
  src/ability.rs      AbilityDef, Effect, Targeting, Sel, Cond, Trigger, Passive, Patch (section 8)
  src/status.rs       StatusDef, Category, Clock (section 9)
  src/class.rs        ClassDef, ResourceDef, SquadDef (section 10)
  src/terrain.rs      TerrainDef (section 11)
  src/biome.rs, world.rs
  src/monster.rs, boss.rs, format.rs, dungeon.rs     (fields from encounter-boss-designer)
  src/talent.rs, progression.rs, stats.rs
  src/item.rs, loot.rs, merchant.rs
  src/craft.rs, gather.rs
  src/quest.rs        (fields from narrative-quest-designer)
  src/template.rs
  src/validate/       one module per rule family, section 7
  tests/content.rs    the integrity test on the real data
```

**Why one crate below the others.** Combat (`abalone-rpg`) needs abilities, statuses, terrain,
classes, runes and item aspects. The world (`abalone-world`) needs items, recipes, quests, biomes and
talents. Runes change combat but §24.2 puts talent validation in `abalone-world`: if each crate owned
its def types, `abalone-rpg` would have to depend on `abalone-world` or the other way round (feedback
F20). With every def type in `abalone-data`:

```
abalone-core  (no serde, no data, classic Abalone stays untouched)
     ^
abalone-data  (def types + loader + validation; no game logic, no core dependency)
     ^              ^
abalone-rpg ---> (uses data + core)
     ^
abalone-world    (uses data + rpg)
     ^
abalone-wasm, abalone-content (CLI), abalone-cli
```

`abalone-data` does not depend on `abalone-core`: cells are plain `(i32, i32)` pairs, converted by
the consumers. `abalone-core` stays serde-free (`tech.md` §3, the classic tables of §21 keep their
engine). The sibling specs that place `MonsterDef` or `QuestDef` in their own crate keep owning the
fields; only the type moves (open question Q3).

**Def types are plain data.** `#[derive(Deserialize, Clone, Debug, PartialEq, Eq)]`, no methods with
game logic. Lookup helpers (`Registry::get`) are the only code next to them. Behaviour lives in the
consumer crates.

### 4.3 Loader

```rust
pub struct Content {
    pub classes: Registry<ClassDef>,
    pub abilities: Registry<AbilityDef>,
    pub statuses: Registry<StatusDef>,
    pub terrain: Registry<TerrainDef>,
    // ... one registry per kind
    pub hash: u64,                       // section 5.4
}

pub fn load(files: &[(&'static str, &'static str)]) -> Result<Content, Vec<DataError>>;
pub fn content() -> &'static Content;   // OnceLock over load(files::ALL), expect()s: tests prove it loads
```

- `files::ALL` lists every file with `include_str!("../../../data/...")`. A test walks `data/` with
  `std::fs` (test only) and fails if a file is not listed or a listed file is missing. Nobody can
  add a file and forget to embed it.
- Each file is parsed on its own; a file holds a list of one kind (`[Ability(...), Ability(...)]`)
  or one top-level struct (`ClassFile(class: ..., resources: [...], abilities: [...])`).
- All parse errors are collected, not only the first: `DataError { file: "data/classes/warrior.ron",
  line: 41, col: 13, message: "unknown variant `Pusj`, expected one of ..." }` (positions come from
  the RON parser).
- After parsing, every registry is sorted by id (byte order) and duplicate ids are errors.
  Cross-references are resolved by the validator (section 7), not by the parser, so one run reports
  every broken reference.
- `content()` runs once per process (one per Web Worker in the browser). It never fails in production
  because `tests/content.rs` loads and validates the exact same embedded bytes.

### 4.4 Dependencies

`tech-lead` (accept `serde` and `ron`, exact versions, crate graph, Q1, Q2), `combat-engine` and
`stats-progression` and `world-generator` (consume `Content`), every designer role (writes the files).

### 4.5 Tests (strict TDD)

- **Given** a file `[Ability(id: "a", ...)]` with one field misspelled, **When** `load` runs, **Then**
  it returns one `DataError` with the file name, line and column of the field.
- **Given** two files with the same ability id, **Then** one error "duplicate id `a`" naming both
  files.
- **Given** abilities `b` then `a`, **Then** `abilities.ids()` is `["a", "b"]` (sorted, §24.1).
- **Given** the real embedded files, **When** `load(files::ALL)` runs, **Then** it succeeds (the guard
  of `content()`).
- **Given** a file in `data/` missing from `files::ALL`, **Then** the listing test fails and names it.
- **Given** `1.5` in an integer field, **Then** a parse error (no float sneaks in).

### 4.6 Risks

- **WASM size.** `serde` plus `ron` add code; the data itself adds bytes. Budget (TUNE): parser plus
  embedded data at most 150 KB gzipped at R1, at most 400 KB at R9, inside the `tech.md` §4 budget
  for the engine. The first PR (task TD-02) reports the measured size. Fallback if over budget
  (PROPOSAL): a test-time converter writes a compact binary next to the RON and only the binary is
  embedded; not done unless the measure demands it (KISS).
- **Parse time** at worker start: at most 30 ms on the reference machine of `tech.md` §5.5 (TUNE),
  measured in TD-24 with the full content.
- **Coverage of derived code.** If `cargo llvm-cov` reports uncovered regions inside
  `#[derive(Deserialize)]`, the def files are pure declarations and can be excluded by file name with
  a one-line reason, which CONTRIBUTING §11 allows for generated code. TD-02 measures it first; the
  exclusion needs a reviewer's OK (open question Q4).

---

## 5. Determinism of the data (§24.1)

§24.1: integers only, basis points, a fixed multiply-then-floor order, fixed order everywhere, never
iterate a `HashMap`, the state hash covers everything, combat seeds by commit-reveal.

### 5.1 Integers

- Every numeric field is `u8`, `u16`, `u32`, `i8`, `i16` or `i32` (FINAL, §24.1). Percentages are bp.
- Conversions of the gameplay spec's formulas (exact, no rounding needed, FINAL as arithmetic):
  - `g(L) = 1 + 0.09 × (L − 1)` is `g_bp(L) = 10000 + 900 × (L − 1)`; `g_bp(100) = 99100`.
  - `K = 100 × g(L)` (§6.5) is `K(L) = 100 + 9 × (L − 1)`: an integer at every level.
- Conversions that need a rounding rule (PROPOSAL, feedback F4; owner `stats-progression`):
  - VIT `+0.1` per level (§7.2): stored in dVIT, `vit_dvit(L) = 100 + (L − 1)`; the integer VIT shown
    and used for initiative is `vit_dvit / 10` (floor).
  - XP `C(n) × XP_ref(n)` with `C(n) = 4 + n/3` (§11): `XP(n) = ⌊(12 + n) × (50 + 10n) / 3⌋`.
    Example: `XP(1) = ⌊13 × 60 / 3⌋ = 260`.
  - Mana Shield "2 HP = 1 mana" (§8.5): mana paid `= ⌈damage / 2⌉`.
  - World speed `+0.5 %` per VIT (§7.1): `50` bp per VIT.

### 5.2 Fixed order

- Registries are `Vec<T>` sorted by id, looked up by binary search. `Id<T>` is the index (`u16`, at
  most 65 535 entries per kind, PROPOSAL), valid only inside one `Content`.
- Lists inside a def keep file order (an ability's `effects` run in the order written, §6.10).
- Maps inside a def are `Vec<(K, V)>` or `BTreeMap`, never `HashMap`.

### 5.3 Enforcement

- `crates/abalone-data/clippy.toml` (and the same in `abalone-rpg`, `abalone-world`):
  `disallowed-types = ["std::collections::HashMap", "std::collections::HashSet"]` (PROPOSAL). Clippy
  already runs with `-D warnings` in `scripts/verify.sh`, so a `HashMap` fails the check.
- `#![deny(clippy::float_arithmetic)]` at the top of the three crates (PROPOSAL).

### 5.4 Content hash (PROPOSAL)

Two peers with different data compute different combats from the same log, yet §24.1's state hash
would not notice it (feedback F21).

- `Content::hash` is FNV-1a 64-bit over, for each embedded file in path order: the path bytes, a
  `0` byte, the file bytes, a `0` byte. Any byte change gives a new hash, comments included
  (conservative on purpose: both peers normally run the same deployed build).
- `.gitattributes` gets `data/** text eol=lf` so a Windows checkout never changes the bytes.
- Uses (each owned by the named role, this role provides the value):
  - `combat-engine`: the combat state hash starts from `Content::hash`, so "same log = same hash"
    (§25 R1) also proves the same data.
  - `network-p2p`: the party `Hello` carries the content hash; a peer with another hash cannot join a
    combat (it can still see presence). The message names the two build ids (PROPOSAL).
  - `stats-progression` and `combat-engine`: the combat save (§6.12, store `combat`) stores it; a
    resume with another hash is refused (section 25.3).
  - The bridge exposes `content_hash()` (section 24) and Copy diagnostics prints it.

### 5.5 Dependencies, tests, risks

**Dependencies.** `combat-engine` (state hash seed), `network-p2p` (handshake field), `client-engineer`
(diagnostics), `tech-lead` (clippy config, `.gitattributes`).

**Tests.**
- **Given** the real files, **When** `load` runs twice, **Then** the two `hash` values are equal
  (pure).
- **Given** the real files plus one changed space in one file, **Then** the hash differs.
- **Given** files `b.ron` then `a.ron` in the list, **Then** the hash equals the one for `a.ron` then
  `b.ron` (sorted by path before hashing).
- Cross-target: the native test and the `wasm-pack test --node` test print the same hash for the
  same build (property already used for golden games, `tech.md` §10).
- Unit: `g_bp(1) = 10000`, `g_bp(100) = 99100`, `K(1) = 100`, `K(100) = 991`, `XP(1) = 260`,
  `vit_dvit(1) = 100`, `vit_dvit(100) = 199`.

**Risks.** A deploy window where two peers run different builds blocks group combat: acceptable, the
message tells both to reload (TUNE: revisit if the counters of `netcounters.ts` show it often).

---

## 6. Ids, aliases and text keys (§16 "Données", §24.5, §26 Q5)

### 6.1 Ids (PROPOSAL)

- Format: lowercase ASCII, digits and `_`, dot-separated segments: `^[a-z0-9_]+(\.[a-z0-9_]+)*$`, at
  most 64 characters (PROPOSAL).
- English, even when the French name differs: `warrior.charge`, `guardian.anchor`, `status.frozen`.
  The player-facing name is a text key, so a French build changes text, not ids.
- Unique per kind. A reference field is typed (`ability: AbilityRef`), so no global prefix is
  required; the sibling conventions (`npc.colony.ilse`, `lumen.zone.04`, `mat.glassflax`) all fit.
- Class content uses the class id as first segment: `warrior.charge`, `warrior.rage`,
  `warrior.trait`.

### 6.2 Stability (PROPOSAL)

- An id that shipped in a release is never reused for another thing.
- Saves, signed logs, MCP outputs (§24.6) and the content view store string ids, never `Id<T>`
  indexes (indexes change when content is added).
- Removing content is allowed; loaders drop unknown ids with one notice (same rule as `savegame.ts`
  and `narrative-quest-designer.md` section 18).

### 6.3 Aliases

`data/aliases.ron`: `[Alias(kind: Ability, old: "warrior.rush", new: "warrior.charge")]`. Save
loaders call `content().resolve(kind, id)`, which follows at most one alias (no chains, checked by the
validator). An alias whose `new` id does not exist is an integrity error.

### 6.4 Text keys

- Every def with player-facing text has derived keys, never a free text field:
  `<kind>.<id>.name`, `.desc`, and for abilities also `.counter`, `.r3a`, `.r3b`. Example:
  `ability.warrior.charge.counter`.
- `data/text/en.json` holds them: `{ "ability.warrior.charge.name": "Charge", ... }`. English only in
  v1 (repo convention); a French file uses the same keys (§26 Q5, owner `narrative-quest-designer`).
- The text is not embedded in WASM: the client imports the JSON, the Rust tests read it with
  `include_str!` under `#[cfg(test)]` to validate it. The engine never needs text.

### 6.5 Dependencies, tests, risks

**Dependencies.** `narrative-quest-designer` (writes the text, length budgets of its section 17.3),
`stats-progression` and every save owner (use `resolve`), `client-engineer` (imports the JSON).

**Tests.**
- **Given** id `Warrior.Charge`, **Then** an integrity issue "bad id format".
- **Given** an ability `warrior.charge` and no key `ability.warrior.charge.counter` in `en.json`,
  **Then** an issue "missing text key" (this is how §24.3 "every ability has a counter" is checked).
- **Given** an alias `a -> b` and an alias `b -> c`, **Then** an issue "alias chain".
- **Given** a save holding `warrior.rush` and the alias above, **When** `resolve(Ability,
  "warrior.rush")` runs, **Then** it returns the id of `warrior.charge`.
- **Given** an unused key in `en.json`, **Then** a warning in the CLI report, not a test failure
  (PROPOSAL, KISS).

**Risks.** Text in a separate JSON can drift from the build; the integrity test runs on the same
commit, so both always ship together.

---

## 7. The integrity harness and its rule catalog (§24.3)

§24.3 lists: every reference exists; point budgets are right; no cost above the maximum resource;
every ability has a counter; every Ejector has a tell or is an ultimate; every mass control hits 3
targets at most.

### 7.1 Harness

```rust
pub struct Issue { pub rule: &'static str, pub file: &'static str, pub id: String, pub message: String }
pub fn validate(content: &Content, text: &TextKeys) -> Vec<Issue>;   // every issue, sorted by (file, id, rule)
```

- One module per rule family in `src/validate/`, each a pure `fn(&Content, &mut Vec<Issue>)`.
- `tests/content.rs::embedded_content_is_valid` asserts `validate(...)` is empty and prints every
  issue on failure. This is the gate: a data PR that breaks a rule fails `cargo test`, hence the
  `rust` CI check.
- Each rule has a passing and a failing unit test on a tiny inline RON content (TDD: the failing
  case is written first).
- Content marked `draft: true` (a zone or a class still being written) skips the "completeness"
  rules only (counts, all ranks present), never the safety rules (PROPOSAL).

### 7.2 Rule catalog

Rule ids are stable strings used in messages and in the CLI. "Safety" rules protect a FINAL game
rule; "completeness" rules check that content is whole.

| Rule id | Kind | Checks | Source |
|---|---|---|---|
| `id.format`, `id.unique` | safety | Section 6.1 | §24.1, §16 |
| `ref.exists` | safety | Every typed reference resolves (ability, status, terrain, class, resource, item, recipe, loot table, monster, quest, NPC, glyph, text key) | §24.3 |
| `num.range` | safety | Weight 1 to 5; bp within the field's declared range; durations at least 1; cooldown at most 20 (PROPOSAL) | §6.4, §6.11 |
| `ability.cost_max` | safety | Every cost is at most the resource's max (base max, without Surcharge) | §24.3 |
| `ability.counter` | completeness | Every class ability and every monster major ability has a `.counter` text key | §24.3, §6.10 |
| `ability.ejector` | safety | `Ejector` tag implies `slot: Ultimate` or `tell >= 1`; a multi-removal effect implies a terrain effect with `tell >= 2` | §6.10, §24.3 |
| `ability.no_eject_without_tag` | safety | No effect of an ability without `Ejector` has `eject: true` | §6.10 rule 3 |
| `ability.mass_control` | safety | An effect that applies a status of category `Hard` to more than one ball has `max_targets <= 3` | §6.10 |
| `ability.hook_known` | safety | Every `Hook(id)` names a hook the engine registers (section 8.6) | section 8.6 |
| `ability.bonus_step` | safety | A `BonusStep` effect is the only way to grant a Step; self-moves (`Dash`, `Blink`) are tagged `SelfMove` | §6.3 |
| `class.shape` | completeness | 2 branches, 4 abilities each (slots 1 to 4 and 5 to 8) plus 1 ultimate each: 10 abilities | §8.0, §10 |
| `class.tiers` | safety | Slots 1, 2, 5, 6 are tier 1; 3, 4, 7, 8 tier 2; ultimates tier 3 | §8.0 |
| `ability.ranks` | completeness | R2 is `EffectBp` or `CooldownMinus1`; R3 has exactly 2 variants A and B | §10 |
| `haste.not_ult` | safety | No patch from Haste or items lowers an ultimate's cooldown, except patches that name the ultimate (Chasseur ultime rune) | §7.1 |
| `status.category` | safety | Every control status has a DR category | §6.11 |
| `glyph.exists` | completeness | Every terrain, status, rarity and map marker names a glyph id from the art list | §5.1, §12, `world.md` §8 |
| `talent.budget` | safety | Passive total is 99, active total is 20, and the level schedule is feasible (section 14) | §9.1, §10 |
| `weights.sum` | safety | Tile content shares sum to exactly 10 000 bp; each biome's terrain shares sum to at most 10 000 bp | §4.3, §5.2 |
| `item.weight_cap` | safety | `+Weight` affixes only on the `ballast` slot, value 1; no other item source of permanent Weight | §7.1, §12 |
| `item.rank_affix` | safety | A `+1 rank` affix names an ability of the item's class | §12 |
| `graph.acyclic` | safety | Quest prerequisites and recipe inputs form no cycle | §15, §16 |
| `graph.reachable` | completeness | Every quest is reachable from a new hero; every recipe input is gatherable, droppable or buyable | §15, §16 |
| `alias.chain` | safety | Section 6.3 | section 6.3 |
| `text.exists` | completeness | Every derived text key exists in `en.json` | §16, §26 Q5 |

The sibling roles add their own rules in the same harness, in their own module (quests:
`narrative-quest-designer.md` 4.7; monsters and bosses: `encounter-boss-designer.md` 19). This role
reviews that they use `Issue` and the shared graph helpers.

### 7.3 Dependencies, tests, risks

**Dependencies.** `class-designer` (content that must pass), `art-audio` (the glyph id list, as data:
`data/glyphs.ron` with ids only, PROPOSAL), every designer role (their own rules).

**Tests.** One failing and one passing case per rule id, for example:
- **Given** an ability with `tags: [Ejector]`, `slot: S3`, `tell: 0`, **Then** one issue
  `ability.ejector`.
- **Given** the same with `tell: 1`, **Then** no issue.
- **Given** Nova de givre with `max_targets: 4`, **Then** `ability.mass_control`.
- **Given** an ability costing 120 Rage and Rage max 100, **Then** `ability.cost_max`.
- **Given** an affix `+1 Weight` allowed on `ring`, **Then** `item.weight_cap`.

**Risks.** The gameplay spec's own content fails some rules today (abilities without a counter,
runes without numbers: feedback F2, F10). The class files can only pass once `classes.md` and
`talents.md` fill those in; until then those classes are `draft: true`.

---

## 8. The ability language (§6.10, §6.3, §8)

§6.10: targeting (Self, Adjacent, Target, Line, Zone, Group, Board), 12 effect primitives, ejection
limits, mass controls at 3 balls, resolution order, the ability sheet, channelling. §6.3: Action,
Quick Action, Preparation; cooldown N; one bonus Step per turn; atomic resolution.

### 8.1 `AbilityDef`

```rust
pub struct AbilityDef {
    pub id: String,                 // "warrior.charge"
    pub owner: Owner,               // Class("warrior") | Monster | Item | Consumable
    pub slot: Slot,                 // S1..S8 | Ultimate | None (monsters, consumables)
    pub kind: Kind,                 // Action | Quick | Prepare
    pub cost: Vec<Cost>,            // [Res("warrior.rage", 25)], [HpBp(1000)], [Res(..,60), AllCombo]
    pub cooldown: u8,               // own turns (§6.3)
    pub once_per_combat: bool,      // Paradoxe, Arrêt du temps
    pub once_per_turn: bool,        // Pacte de sang
    pub range: u8,                  // cells; 0 for Self
    pub from: Origin,               // Hero (default, §6.9) | Squad ("Escouade") | Caster (monsters)
    pub target: Targeting,
    pub max_targets: Option<u8>,    // §6.10 mass control cap, Halo "3 au plus"
    pub tags: Vec<Tag>,             // Ejector, Channel, SelfMove, Finisher, Generator, Element(Fire)...
    pub tell: u8,                   // turns between cast and effect, 0 = immediate
    pub effects: Vec<Effect>,       // run in order (§6.10 resolution order applies inside each)
    pub r2: Upgrade,                // EffectBp(2500) | CooldownMinus1   (§10)
    pub r3: [Vec<Patch>; 2],        // variants A and B (§10)
}

pub enum Targeting { Caster, Adjacent, Target { ball: bool, cell: bool }, Line, Zone { radius: u8 },
                     Group, Board, Edge { sides: u8 } }
```

`Edge { sides }` is the one targeting added for Séisme ("2 côtés du bord, au choix"). All other
shapes are the seven of §6.10.

### 8.2 Selectors, conditions, amounts

```rust
pub enum Sel {            // who an effect touches, evaluated when the effect runs
    Caster, Hero, Target, TargetCell, Hit,           // Hit = the ball the Line or Target reached
    Ahead,                                           // the cell just after a Dash (Charge)
    Area { radius: u8, side: Side }, Adjacent { side: Side },
    AllOf { side: Side }, Corpse, GraveyardEntry { cause: Cause },
    PinnedBall,                                      // Écrasement: the ball the blocked file presses
    Chosen { from: Box<Sel>, max: u8 },              // caster picks, §6.10 "choisies par le lanceur"
}
pub enum Cond { TargetIsolated, TargetHpBelowBp(u16), TargetHas(StatusRef), TargetIsHero,
                TargetIsBoss, TargetDied, HeroInGroup, OnTerrain(TerrainRef), CombosAtLeast(u8),
                BallAhead { side: Side }, FileBlocked, Not(Box<Cond>) }
pub enum Amount { Flat(u32), Ratio { stat: Stat, bp: u32 }, PerCombo { stat: Stat, bp: u32 },
                  MaxHpBp(u32), OriginMaxHpBp(u32), DamageDealtBp(u32), HpAtTurnStart(Clock) }
```

### 8.3 The 12 primitives (§6.10), one enum family each

| §6.10 primitive | Variant(s) | Notes |
|---|---|---|
| Dégâts | `Damage { to: Sel, kind: Physical\|Magic\|Pure, amount: Amount, bonus: Vec<(Cond, i32 bp)>, shock: bool }` | `shock: true` marks Choc-type damage (§6.5 Élan +50 %, Titan +100 %) |
| Soin | `Heal { to, amount, overflow_shield_cap_bp: Option<u16> }` | Lumière accumulée: `Some(1000)` |
| Bouclier | `Shield { to, amount, turns, pay_with: Option<(ResourceRef, u8)> }` | Bouclier de mana: `pay_with: ("mage.mana", 2)` = 2 HP per mana |
| Déplacement forcé | `Move { who: Sel, how: Push { dist, away_from: Origin } \| Pull { dist } \| Teleport { to: CellSel } \| Swap { with: Sel } \| Slide { dir } \| Dash { max } \| Return { to: PrevTurnStart(Clock) }, eject: bool }` | `eject` is false unless the ability is an Ejector (rule `ability.no_eject_without_tag`). `Dash` and `Teleport` on the caster are self-moves, not bonus Steps (§6.3) |
| Modif de stat | `StatMod { to, stat: Stat, delta: Delta, turns: Duration }` | `Delta::Bp(i32)` or `Delta::Flat(i32)` or `Delta::Set(i32)` (Titan: Weight 5) |
| Statut | `Status { to, status: StatusRef, turns: Duration }` | Durations per section 9 |
| Terrain | `Terrain { cells: CellSel, set: TerrainRef \| Slope { dir }, turns: Duration }` | Mur de boucliers, Source, Sol verglacé, Prison d'os |
| Invocation | `Summon { what: MonsterRef \| Rock, at: CellSel }` | Monsters (Invocateur) |
| Réanimation | `Revive { from: Corpse \| Graveyard { cause }, at: CellSel, hp: Amount, count: u8 }` | Revenant numbers live in the class file (section 10) |
| Marque | `Mark { on: Sel \| CellSel, fires: Trigger, effects: Vec<Effect>, turns: Duration }` | Mine temporelle, Météore, Marque de mort, Interposition, Déjà-vu, Effondrement |
| Ressource | `Resource { to, res: ResourceRef, delta: i16, steal: bool }` | +20 Rage on Charge |
| Tour | `Turn(BonusStep { to } \| Restrict { entity, only_move: bool, freeze_clocks: bool } \| NextPush(PushMod) \| Cooldowns { to, delta: i8, pick: All \| Shortest, skip_ultimate: bool })` | See 8.5 |

Control flow, not a primitive: `If { cond: Cond, then: Vec<Effect>, otherwise: Vec<Effect> }`.
Escape hatch: `Hook(&'static str)` (section 8.6).

Two effect variants are added to the Mark family because the gameplay spec's damage-routing abilities
need them and none of the 12 covers them (feedback F1): `Redirect { to: Sel }` (Interposition) and
`Share { with: Sel, bp: u16, reduce_bp: u16 }` (Lien vital: 5000 bp each; Martyr: all to the hero,
reduced 5000 bp).

### 8.4 Passives, triggers and patches

Traits, runes, keystones, shards, item affixes, aspects, set bonuses, biome rules, Mythic affixes,
weather and night all reuse the same pieces:

```rust
pub struct Passive { pub when: Trigger, pub cond: Option<Cond>, pub effects: Vec<Effect>,
                     pub limit: Limit, pub scope: Scope }
pub enum Trigger { Always, TurnStart, TurnEnd, PushDone { lead: Lead }, DamageTaken, DamageDealt,
                   Loss { side: Side, revenants: bool }, AllyBelowHpBp(u16), Cast(Kind),
                   WouldBeEjected, TargetedByEnemyAbility, MovedByEnemy, Placement, EveryNTurns(u8) }
pub enum Limit { None, OncePerTurn, OncePerCombat, OncePerCombatPerBall, EveryNTurns(u8), Stacks(u8) }
pub enum Scope { Hero, Squad, AlliesAdjacentToHero, Allies, Board }

pub struct Patch { pub ability: AbilitySel, pub op: PatchOp }   // AbilitySel: Id | Slot(Ultimate) | Class(..)
pub enum PatchOp { CostAdd(i16), CostSet(u16), CooldownAdd(i8), CooldownSet(u8), RangeAdd(i8),
                   DurationAdd(i8), ScaleBp(i32), Pierce(u8), AddEffect(Effect), SetFlag(Flag) }
```

- `Trigger::Always` with a `StatMod { turns: Permanent }` is a static bonus (Sentinelle +15 % ARM and
  RES for `AlliesAdjacentToHero`, a ring's +ATQ).
- Patches serve R2 and R3 (§10), Aspects (§12: Coque du Monolithe `DurationAdd(1)` on
  `guardian.anchor`; Noyau de la Fournaise `Pierce(1)` on `mage.fire_bolt`; Faux du Puits
  `CooldownSet(0)` plus `CostSet(50)`), affixes (`+1 range` for one ability), set bonuses (Ancre du
  Ballast 2 pieces: `CostAdd(-20)` on `guardian.fortress`), runes (Chasseur ultime:
  `CooldownAdd(-1)` on `Slot(Ultimate)`).
- Order of patch application is fixed (PROPOSAL): ranks, then aspect, then set bonuses, then
  affixes, then runes; inside a group by id. A cooldown never goes below 0 and a cost never below 0.
  Haste is applied last by `combat-engine` (§7.1 cap −2 turns, never on ultimates).

### 8.5 Abilities that change a rule, and how they are written (§8)

The point of this table is the §1 pillar 4 claim "each ability is written with the primitives of
section 6.10". It is true for most abilities; these are the ones that need care.

| Ability (§) | Encoding | Engine work (`combat-engine`) |
|---|---|---|
| Percée (§8.2) | `Turn(NextPush(PushMod { equal_count: true, .. }))` | Push legality reads the turn's `PushMod` |
| Bélier (§8.1) | `NextPush(PushMod { weight_bonus: 2, needs_hero_in_group: true, .. })` | same |
| Écrasement (§8.2) | Target `Group`, `If { cond: FileBlocked, then: [Damage { to: PinnedBall, amount: Ratio(Atk, 15000) }] }` | Selector `PinnedBall`, condition `FileBlocked` |
| Avalanche (§8.2) | `Hook("avalanche")` | A 4-ball inline Move is a new move shape: move generation, not an effect |
| Titan (§8.2) | `StatMod { stat: Weight, delta: Set(5), turns: 2 }`, `Status(immovable, 2)`, passive shock `+10000` bp for 2 turns | none new |
| Instant suspendu (§8.7 trait) | `Passive { when: WouldBeEjected, limit: OncePerCombat, effects: [Hook("cancel_ejection"), Status(stasis, 1)] }` | A replacement hook inside push resolution |
| Retour (§8.7) | `Move { how: Return { to: PrevTurnStart(Bearer) } }`, refund on failure (`Cost::refund_on_fail: true`) | Reads the history the engine keeps (§8.7) |
| Rembobiner (§8.7) | `Heal { amount: HpAtTurnStart(CasterPrev), only_if_higher }` | History |
| Déjà-vu (§8.7) | `Kind::Prepare`, `Mark { fires: MovedByEnemy, effects: [Move { how: Return { to: EnemyTurnStart } }] }` at enemy turn end | none new |
| Paradoxe (§8.7) | `Hook("paradox")` | Board-wide rewind with the "nearest free cell, fixed order" relocation |
| Arrêt du temps (§8.7) | `If { TargetIsBoss, then: [Cooldowns { delta: 2 }], otherwise: [Restrict { only_move, freeze_clocks }] }` | none new |
| Sablier, Lenteur (§8.7) | `Cooldowns { pick: Shortest, delta: -1, skip_ultimate }`; `Status(blinded, 1)` + `If { TargetIsHero, [Cooldowns { delta: 1 }] }` | none new |
| Pont (§8.8) | `Hook("bridge")` | The only ability that grows the board mask (`engine-core`) |
| Rotation (§8.8) | `Hook("rotate7")` | Rotates 7 cells with balls, terrain and slopes |
| Danse des lames (§8.3) | `Hook("blade_dance")` | A path of up to 4 jumps chosen by the caster |
| Armée des morts (§8.6) | `Revive { count: 3 }` + `Passive` overriding the Revenant cap for 3 turns (`Limit`) | Cap override flag |
| Résonance reactions (§8.5) | `ClassDef::reactions: [(StateA, StateB, Vec<Effect>)]` | Fires on state application |
| Surchauffe (§8.5), Paradoxe grains rule (§8.7) | `ResourceDef::cost_rules` (section 10) | Cost rules |

### 8.6 Hooks (PROPOSAL)

A hook is a named Rust function in `abalone-rpg/src/hooks/` with its own tests; data refers to it by
name. Launch hooks: `avalanche`, `cancel_ejection`, `paradox`, `bridge`, `rotate7`, `blade_dance`
(6, PROPOSAL). Cap: at most 10 hooks for the 8 launch classes (TUNE); the CLI prints the count so a
growing list is visible in review. Every hook name in data must be registered (`ability.hook_known`).

### 8.7 Ejection limits and mass controls as data checks (§6.10)

- The engine enforces "at most one ejection per action" (FINAL proposed, code). Data cannot ask for
  more: `Move { eject: true }` is only legal in an `Ejector` ability; a multi-removal is only
  expressible as a `Terrain` effect turning cells into Gulf with `tell >= 2` (Séisme: `tell: 2`).
- Hard controls: statuses of category `Hard` (section 9) reaching more than one ball need
  `max_targets <= 3` (FINAL proposed in §6.10, checked by `ability.mass_control`).

### 8.8 Example: the two R1 Warrior abilities (§25 R1, §8.2)

```ron
// data/classes/warrior.ron (excerpt). Numbers copied from §8.2: all TUNE.
Ability(
    id: "warrior.charge", owner: Class("warrior"), slot: S1, kind: Action,
    cost: [Res("warrior.rage", 0)], cooldown: 2, range: 2, target: Line,
    tags: [SelfMove, Element(Physical)],
    effects: [
        Move(who: Caster, how: Dash(max: 2), eject: false),
        If(cond: BallAhead(side: Enemy),
           then: [Damage(to: Ahead, kind: Physical, amount: Ratio(stat: Atk, bp: 10000), shock: true)],
           otherwise: []),
        Resource(to: Caster, res: "warrior.rage", delta: 20, steal: false),
    ],
    r2: CooldownMinus1,
    r3: [ [SetFlag(PassThroughOneEnemy)],
          [AddEffect(Status(to: Ahead, status: "status.stunned", turns: (turns: 1, clock: Bearer)))] ],
),
Ability(
    id: "warrior.cleaver", owner: Class("warrior"), slot: S2, kind: Action,
    cost: [Res("warrior.rage", 25)], cooldown: 1, range: 1, target: Adjacent, tags: [],
    effects: [ Damage(to: Target, kind: Physical, amount: Ratio(stat: Atk, bp: 12000),
                      bonus: [(TargetIsolated, 5000)], shock: false) ],
    r2: EffectBp(2500), r3: [ [], [] ],   // draft: variants come from classes.md
),
```

(`BallAhead` and `Ahead` are the condition and selector Charge needs: "if an enemy is just after".
R3 variant A "traverse 1 ennemi" and B "Étourdit 1 tour" are the §10 example. Cleaver is Fendoir;
ids are English, section 6.1.)

### 8.9 Dependencies

`combat-engine` (interprets every variant; owns the semantics, this role owns the shape),
`class-designer` (writes the 80 abilities and their counters), `encounter-boss-designer` (monster
abilities use the same types), `ux-designer` (the ability card reads these fields, §6.10 "fiche"),
`ai-engineer` (the player bot reads `kind`, `cost`, `cooldown`, `target` to enumerate actions).

### 8.10 Tests

- Parse: one RON example per variant round-trips into the expected Rust value (unit, one per
  variant, written first).
- **Given** the R1 Warrior file, **When** validated, **Then** no issue; **When** Charge's
  `eject` is set to `true`, **Then** `ability.no_eject_without_tag`.
- **Given** Séisme du Lest (`slot: Ultimate`, `tags: [Ejector]`, `tell: 0`), **Then** no issue
  (§24.3 allows an ultimate); **Given** Effondrement (`slot: S7`, `tags: [Ejector]`, `tell: 1`),
  **Then** no issue; **Given** Effondrement with `tell: 0`, **Then** `ability.ejector`.
- **Given** patches R2 `CooldownMinus1` and an Aspect `CooldownAdd(-1)` on an ability with
  cooldown 1, **Then** the patched cooldown is 0, never negative.
- **Given** the patch order rule, **When** a set bonus `CostAdd(-20)` and an affix `CostAdd(-10)`
  apply to Forteresse (cost 80), **Then** cost 50, the same whatever the order of the item list.
- Rules behaviour (does Charge stop before a ball, is the Shock dealt) is tested in `abalone-rpg`
  with scenario files (section 22), not here.

### 8.11 Risks

- **Language creep.** Each new ability tempts a new variant. Rule (PROPOSAL): a new variant needs two
  abilities that use it; a single use is a hook. Reviewed by this role.
- **Semantics split.** The shape lives here, the meaning in `combat-engine`: a variant with no engine
  test is dead weight. TD-11's done checklist requires one scenario per variant.

---

## 9. Statuses, keywords, durations and clocks (§6.3, §6.11)

### 9.1 `StatusDef`

```rust
pub struct StatusDef {
    pub id: String,                 // "status.frozen"
    pub category: Option<Category>, // Hard | Mobility | Cast (§6.11 DR table)
    pub flags: Vec<Flag>,           // Immovable, Uneject, Untargetable, NoAct, NoSelfMove, NoSelect,
                                    // NoAbility, NoLeadPush, Taunt
    pub stat_mods: Vec<(Stat, Delta)>,  // Frozen: ARM +3000 bp
    pub dot: Option<Amount>,        // Bleed, Poison, Burn: damage at turn start
    pub heal_taken_bp: Option<i16>, // Poison: -5000
    pub includes: Vec<StatusRef>,   // Frozen includes Stunned; Stasis includes Immovable
    pub fatigue_turns: u8,          // Inéjectable: Lassitude 2
    pub glyph: GlyphRef,
}
```

The statuses and the 2 keywords of §6.11 are data rows (one per status, so Bleed, Poison, Burn,
Heavy and Light are separate rows); each flag is a FINAL engine behaviour with one
unit test in `combat-engine`. DR: "after a control, immune to its category for 2 turns" (TUNE, §6.11)
is a number in `data/statuses.ron` (`dr_turns: 2`). Tenacity threshold 50 and −1 turn (TUNE, §7.1)
also live there.

### 9.2 Duration clocks (PROPOSAL, feedback F28, F29)

§6.3 defines a status duration on the **bearer's** turns. Terrain, marks and board rules have no
bearer. Every `Duration` in data names its clock:

```rust
pub struct Duration { pub turns: u8, pub clock: Clock }
pub enum Clock { Bearer, Caster, Round, Permanent }
```

| Effect | Clock (PROPOSAL) | Why |
|---|---|---|
| Statuses (Frozen, Rooted, Marked...) | `Bearer` | §6.3, FINAL |
| Terrain from an ability (Mur de boucliers, Source, Sol verglacé, Pont) | `Caster` | The caster's own turns are what the caster can plan |
| Marks with a tell (Météore, Mine temporelle) | `Caster` | §8.5 "au début de ton tour suivant" |
| Board rules (Marée every 6 turns, Brèche, Usure) | `Round` | No owner; a Round is defined in §6.0 |
| Static bonuses | `Permanent` | |

### 9.3 Dependencies, tests, risks

**Dependencies.** `combat-engine` (flag semantics, clocks), `class-designer` (values),
`ux-designer` and `art-audio` (glyphs).

**Tests.**
- **Given** `status.frozen` with `includes: [status.stunned]` and `status.stunned` with `includes:
  [status.frozen]`, **Then** an issue `status.cycle` (includes must be acyclic).
- **Given** a status with flag `NoAct` and no category, **Then** `status.category`.
- **Given** a `Terrain` effect with `clock: Bearer`, **Then** an issue (no bearer for a cell).

**Risks.** The Mage "Gelé" state and the "Gelé" status share a name (feedback F24): two ids are
needed (`mage.state.chilled` and `status.frozen`) until the owners say whether one implies the other.

---

## 10. Classes, resources, traits and squads (§8, §6.9)

### 10.1 `ClassDef` and `ResourceDef`

```rust
pub struct ClassDef {
    pub id: String, pub role: Role, pub difficulty: u8,          // 1..3 stars (§8.0)
    pub weight: u8,                                              // §8.0: 3, 3, 1, 2, 1, 2, 1, 2
    pub mult: StatMult,                                          // hp_bp, atk_bp, pow_bp, arm_bp, res_bp, vit_add_dvit
    pub resources: Vec<ResourceRef>,                             // Assassin: energy + combo
    pub r#trait: Vec<Passive>,
    pub squad: Vec<Passive>,                                     // Fragment bonuses (§6.9, §8)
    pub branches: [Branch; 2],                                   // ids of 4 abilities + 1 ultimate each
    pub affinity: Vec<BiomeRef>,                                 // §5.2
    pub revenant: Option<RevenantDef>,                           // Necromancer only (§8.6)
    pub reactions: Vec<Reaction>,                                // Mage only (§8.5)
    pub draft: bool,
}
pub struct ResourceDef {
    pub id: String, pub min: i16, pub max: i16, pub start: i16, pub per_turn: i16,
    pub gains: Vec<(Trigger, i16)>,             // Rage: (PushDone, 15), (Loss{Enemy}, 25) ...
    pub idle_loss: Option<(Trigger, i16)>,      // Rage: -10 on a turn without push
    pub cost_rules: Vec<CostRule>,              // SameTurnExtraBp(5000) | Overspend { above: 4, next_turn: -2 }
                                                // | NoAbilityBonus(1)
}
pub struct RevenantDef { pub hp_origin_bp: u16, pub hp_pow_bp: u16, pub decay_bp: u16, pub cap: u8 }
```

Copied values (TUNE, §8): Rempart 0 to 100, start 0, +5 per turn, +10 per ally damaged or pushed;
Rage 0 to 100, +15 per push, +10 on losing 10 % max HP in one hit, +25 per Perte, −10 per turn
without push; Energy 0 to 100, +30 per turn; combo 0 to 5; Faith 0 to 100, start 50, +15; Mana 0 to
150, start 100, +10; Essence 0 to 100, start 0, +20 per Perte, +5 per turn; grains 0 to 6, start 2,
+1, +1 more with no ability; Strata 0 to 100, +10, +5 per ally on a special cell. Revenant: 4000 bp
of origin max HP plus 2000 bp of PUI, decay 1000 bp per turn, cap 3 (all TUNE, §8.6). Fragments:
4000 bp HP, 5000 bp ATQ, 5000 bp ARM and RES, Weight 1 (TUNE, §6.9), stored once in
`data/stats.ron` as the default squad, class `squad` passives add on top.

### 10.2 Dependencies, tests, risks

**Dependencies.** `class-designer` (fills the 8 files), `stats-progression` (`StatMult` use, §7.2),
`combat-engine` (resource gains as triggers, cost rules), `encounter-boss-designer` (monsters have no
class but may have a resource: same `ResourceDef`).

**Tests.**
- **Given** the Warrior file, **When** validated, **Then** `class.shape` passes only when both
  branches hold 4 abilities and 1 ultimate (R1 runs it as `draft: true` with 2 abilities).
- **Given** a resource with `start: 120` and `max: 100`, **Then** `num.range`.
- **Given** Assassinat costing `[Res(energy, 60), AllCombo]` and combo max 5, **Then** no
  `ability.cost_max` issue; with `Res(combo, 6)`, **Then** an issue.
- **Given** the 4 R2 classes, **Then** every `affinity` biome exists (`ref.exists`).

**Risks.** "Rempart ne baisse jamais" (§8.1) read literally forbids paying costs in Rempart
(feedback F8). The schema supports both readings (`idle_loss: None` and costs allowed); the owner
picks.

---

## 11. Terrain catalog and biomes (§5.1, §5.2, §4.2)

### 11.1 `TerrainDef`

The behaviour of each cell type is code (§5.1 "une règle par type", FINAL per row); data holds the
numbers and the glyph:

```ron
Terrain(id: "terrain.lava", rule: Lava, params: (end_turn_damage_max_hp_bp: 1000), glyph: "glyph.flame"),
Terrain(id: "terrain.mud", rule: Mud, params: (weight_add: 1, no_broadside: true), glyph: "glyph.thick_waves"),
Terrain(id: "terrain.thicket", rule: Thicket, params: (min_distance: 2, damage_bp: -5000), glyph: "glyph.leaves"),
```

`rule` is a closed enum, one variant per §5.1 row (16 rows: Normal, Rock, Gulf, Ice, Mud, Thicket,
Height, Slope, Lava, Water, Quicksand, Vent, Sanctuary, Corruption, Crystal, Brambles; Normal has no
parameters). A rule without its params, or params of another rule, is a parse error (typed per variant).

### 11.2 `BiomeDef`

```ron
Biome(
    id: "biome.ash_sylvan", levels: (10, 20),
    terrain: [("terrain.rock", 1000), ("terrain.thicket", 2000), ("terrain.brambles", 500)],
    rules: [Passive(when: Always, effects: [StatMod(to: AllOf(Any), stat: Range, delta: Flat(-1),
                                                     turns: (turns: 0, clock: Permanent))])],
    travel_cost_bp: 12000, slide: false,
    resources: ["node.ash_wood", "node.herbs", "node.chitin"],
    families: ["family.mantis", "family.weaver"], affinity: ["assassin"], palette: "palette.sylvan",
),
```

Biome global rules (§5.2: range −1, poison +1 turn, resource −10 % except fire, Brûlure +50 %, the
Tide, leaving Corruption on death, Darkness) are `Passive` rows with `scope: Board`; the Tide, the
irregular edge and the Collapses are `Hook`s owned by `world-generator` and `combat-engine`
(time-based board changes, not effects). Travel cost per biome (§4.2, TUNE): Plains 10 000, Forest
12 000, Swamp 15 000, Mountain 15 000, Ice 8 000 plus one slide tile.

### 11.3 Dependencies, tests, risks

**Dependencies.** `world-generator` (values, the board generator reads `terrain` shares),
`engine-core` (terrain layer), `combat-engine` (rules), `art-audio` (glyphs and palettes).

**Tests.**
- **Given** Tourbières with Mud 2500, Water 1500, Gulf 300, **Then** sum 4300 ≤ 10 000, no issue;
  **Given** shares summing to 10 001, **Then** `weights.sum`.
- **Given** a biome whose `levels` is `(20, 15)`, **Then** `num.range`.
- **Given** `terrain.lava` without `glyph`, **Then** a parse error; with an unknown glyph id,
  **Then** `glyph.exists`.

**Risks.** "Le Puits: un mélange" (§5.2) has no shares (feedback F7): it stays `draft` until set.

---

## 12. Monsters, formats, bosses and dungeons: format conventions (§5.3, §6.8, §17, §18)

The fields belong to `encounter-boss-designer` (its sections 3, 5, 10) and `world-generator`
(dungeon maps). This role gives the common rules so these files load and validate like the rest:

- Types move into `abalone-data` (`monster.rs`, `format.rs`, `boss.rs`, `dungeon.rs`); multipliers in
  bp, threat in half-points as the sibling proposes.
- Monster abilities are `AbilityDef { owner: Monster }`: the same §8 checks apply (Ejector needs a
  tell, mass control ≤ 3, a counter for major abilities).
- Combat formats (§6.8): one `FormatDef` per row, `board: Radius(u8) | Tiles(Vec<(i32, i32)>)`,
  `squad: u8`, `threat_half: u16`, `rout: Rout::Count(u8) | Rout::GroupBp(4000)` (§6.8 "40 %, rounded
  up", TUNE).
- Dungeon plan (§17, PROPOSAL): `Dungeon(id, level, biome, tiles: [(q, r)], rooms: [Room(tiles: [...],
  kind: Combat(format) | Event | Chest(loot) | Trap | Puzzle(pool), variants: [...])], beacon_room,
  boss)`. Seeded variation picks one variant per room (`world-generator`).
- Boss files: `release: bool`; rule `boss.fixture` (sibling section 19): a released boss needs
  `tests/fixtures/rpg/<id>.txt`. The check reads the file list at test time.

**Dependencies.** `encounter-boss-designer`, `world-generator`, `ai-engineer` (fixtures).

**Tests.** **Given** a dungeon room tile outside the dungeon's `tiles`, **Then** `ref.exists`.
**Given** a released boss without a fixture file, **Then** `boss.fixture`. **Given** the BR format
with `players: 5` and the BR template with `players: 6`, **Then** an issue `format.mismatch` (feedback
F17 shows the gameplay spec has this exact conflict).

**Risks.** Two owners per file family; this role reviews structure, never numbers.

---

## 13. Stats: ids and units (§7)

`data/stats.ron` (owner `stats-progression`): the stat list with ids (`hp`, `atk`, `pow`, `arm`,
`res`, `weight`, `vit`, `haste`, `tenacity`, `lifesteal`, `luck`, `yield`, plus `range` for modifiers),
the hero base at level 1 (HP 120, ATQ 12, PUI 12, ARM 20, RES 20, VIT 10 = 100 dVIT, TUNE §7.2), the
Ballast rule (−3 VIT per Weight above the class base, TUNE §7.1, stored as −30 dVIT) and the item
Weight cap (+1, TUNE §7.1). A `Stat` is a closed enum so a typo in data is a parse error.

**Tests.** **Given** `StatMod { stat: Weight, delta: Flat(3) }` on an item affix, **Then**
`item.weight_cap`. **Given** the hero base, **Then** `vit_dvit(1) = 100`.

**Dependencies.** `stats-progression` (formulas), `ux-designer` (stat names are text keys
`stat.<id>.name`).

---

## 14. Talent data and budget proofs (§9, §10)

### 14.1 Format (fields owned by `stats-progression`)

```ron
TalentRules(
    passive: (first_level: 2, last_level: 100, keystone_ranks: 5, rune_ranks: 5, max_per_row: 2,
              row_gates: [0, 8, 16], secondary_gate: 20, secondary_runes: 2,
              shard_rows: 3, shard_ranks: 6, shard_cap: (base: 1, per_levels: 16, max: 6),
              reset_free_below: 20, reset_gold_per_level: 10),
    active: (every_levels: 5, first_level: 5, rank_costs: [1, 1, 2], slots: 4, ultimates: 1,
             tier2: (level: 15, branch_points: 2), ultimate: (level: 30, branch_points: 4)),
)
Path(id: "path.precision", keystones: [...4 ids], rows: [[...3], [...3], [...3]])
Rune(id: "rune.coup_de_grace", ranks: [Passive(...), ...5])   // or one Passive plus ScaleBp per rank
Shard(id: "shard.offense.adaptive", row: Offense, per_rank: StatMod(...))
```

All numbers TUNE (§9.1, §10), copied as written.

### 14.2 Budget proofs as tests (`talent.budget`)

The gameplay spec's "Vérification" section claims the budgets hold. The validator recomputes them
from data on every build:

1. **Passive total.** `keystone_ranks + 3 rows × max_per_row × rune_ranks + secondary_runes ×
   rune_ranks + shard_rows × 3 × shard_ranks` must equal `last_level − first_level + 1`:
   `5 + 30 + 10 + 54 = 99` (verified, matches §9.1).
2. **Never stuck.** For every level L from 2 to 100: points owned `L − 1` ≤ points spendable at L,
   where spendable = 45 (keystone, main runes, secondary, ignoring gates that are reached by
   spending) + 9 × `min(6, 1 + ⌊L/16⌋)`. Worst case L = 15: 14 ≤ 54; L = 100: 99 ≤ 99 (verified).
   The test simulates a greedy spender that respects `row_gates` and `secondary_gate`, so gate order
   is proven too, not only the totals.
3. **Active total.** `(100 − 5) / 5 + 1 = 20` points; 5 abilities × `1 + 1 + 2` = 20 (verified,
   matches §10).
4. **Ultimate at 30.** At level 30 a branch can hold 4 points before the ultimate and the ultimate
   costs 1, total 5 ≤ 6 owned (verified, §10 example: Charge, Fendoir, Percée, Charge R2).
5. **R3 needs 2 points at once.** The validator checks that banking a point is allowed by the rules
   (`allow_unspent: true`), since the §10 example spends levels 40 and 45 on one R3.
6. **Path content shape.** 5 paths × 4 keystones × 3 rows × 3 runes; secondary picks 2 runes from 2
   different rows; shards 3 rows × 3.

### 14.3 Dependencies, tests, risks

**Dependencies.** `stats-progression` (runtime validation of a hero's allocation, §24.2, in
`abalone-world`; it reuses the same `TalentRules`), `class-designer` (rune numbers).

**Tests.** **Given** `shard_ranks: 5`, **Then** `talent.budget` (total 90, not 99). **Given**
`shard_cap.per_levels: 8`, **Then** total still 99, never-stuck holds. **Given** `rank_costs: [1, 2,
2]`, **Then** active total 25 ≠ 20: issue. **Given** `ultimate.branch_points: 6`, **Then** issue
"ultimate unreachable at level 30".

**Risks.** Most runes have no numbers in §9.2 ("plus de dégâts", "Hâte"): the paths stay `draft`
until `talents.md` gives them (feedback F10).

---

## 15. Progression data (§11)

`data/progression.ron` (owner `stats-progression`): XP constants for `XP(n)` (section 5.1), grey gap
6 levels, +1000 bp XP per level above, cap +4000 bp, rest bonus +10 000 bp up to 15 000 bp of a
level (1.5 levels), the XP source targets (4000, 4000, 1000, 1000 bp), all TUNE (§11). The unlock
table of §11 is a list of `Unlock(level: 8, what: Dungeon("dungeon.ballast_holds"))`, one row per
line of the table, so the UI, the quest prerequisites and the tests read one source.

**Tests.** **Given** two unlock rows for the ultimate at levels 30 and 25, **Then** an issue
"duplicate unlock". **Given** the unlock table, **Then** the ultimate unlock level equals
`active.ultimate.level` of `TalentRules` (cross-file consistency). **Given** XP source targets
summing to 9 000, **Then** `weights.sum`.

**Dependencies.** `stats-progression`, `narrative-quest-designer` (quest XP shares).

---

## 16. Items, affixes, aspects, sets, gems, loot tables (§12)

### 16.1 Definitions (fields owned by `items-loot`)

```ron
ItemBase(id: "base.core.ash_blade", slot: Core, class: Some("warrior"),
         stats: [(Atk, 8)], value: 10),                    // stats × g(iLvl) at roll time (§12)
Rarity(id: "rarity.rare", affixes: (3, 4), value_factor: 4, glyph: "glyph.rarity_rare"),
Affix(id: "affix.haste", stat: Haste, per_ilvl_bp: (min: 50, max: 100), slots: [Ring, Amulet, Halo],
      min_rarity: Magic, weight: 10),
Aspect(id: "aspect.monolith_shell", slots: [Shell], class: "guardian",
       patch: Patch(ability: Id("guardian.anchor"), op: DurationAdd(1))),
Unique(id: "unique.x", base: "base...", fixed: [...], passives: [...]),
Set(id: "set.ballast_anchor", class: "guardian", pieces: [...4 ids],
    bonuses: [(2, [Patch(...)]), (4, [Passive(...)])]),
Gem(id: "gem.ruby", qualities: 5, by_slot: [(Core, StatMod(...)), (Shell, StatMod(...))]),
```

Copied values (TUNE, §12, §13.3): 10 slots plus 5 tool slots; rarity value factors 1, 2, 4, 10, 15,
12; affix counts 1 to 2 (Magic), 3 to 4 (Rare), 3 plus one Aspect (Legendary); gem qualities 5;
inventory 40; bank tabs 4.

### 16.2 Loot tables

```ron
LootTable(id: "loot.skirmish.lumen", rolls: 1,
          entries: [(weight: 60, Gold(min: 2, max: 6)), (weight: 30, Material("mat.glassflax", 1)),
                    (weight: 10, Item(slot_any: true, rarity: Roll("rarity_table.world")))]),
```

Rolls are done by `items-loot` with the seed `(save, combat id)` (§12); the table is data. Nested
tables allowed, cycles refused (`graph.acyclic`).

### 16.3 Item instance format (save and trade, §12, §13.4)

JSON, owned with `items-loot`; string ids only (section 6.2):

```json
{ "b": "base.core.ash_blade", "i": 34, "r": "rarity.rare",
  "a": [["affix.haste", 25], ["affix.atk", 412]], "x": null, "g": ["gem.ruby:3"], "s": 2,
  "d": 87, "bound": false }
```

`b` base, `i` iLvl, `r` rarity, `a` rolled affixes with their final integer value, `x` aspect id,
`g` socketed gems with quality, `s` sockets, `d` durability (0 to 100, TUNE), `bound` (§12 bound on
equip). An item never stores derived stats: they are recomputed from data, so a balance patch
changes old items too (PROPOSAL, a design choice for `items-loot`).

### 16.4 Dependencies, tests, risks

**Dependencies.** `items-loot` (all values, rolls), `class-designer` (aspects name abilities),
`network-p2p` (trade window carries this JSON, §13.4), `ux-designer` (rarity glyphs).

**Tests.**
- **Given** an aspect patching `mage.fire_bolt` on a Guardian-only slot set, **Then** an issue
  "aspect class mismatch".
- **Given** an affix `+Weight` on `Ring`, **Then** `item.weight_cap`.
- **Given** a loot table entry pointing at itself, **Then** `graph.acyclic`.
- **Given** an item JSON with an unknown affix id, **When** loaded, **Then** the affix is dropped and
  the item kept (one notice), never a crash.
- **Given** a set with bonuses at 2 and 5 pieces and 4 pieces listed, **Then** `num.range`.

**Risks.** Items whose stats recompute from data may change value after a patch: acceptable for a
local, unranked game; ranked PvP uses templates (section 20).

---

## 17. Merchants, prices, currencies (§13)

`data/currencies.ron`: the 6 currencies of §13.1 (Gold, Lueur, Glass Shards, Reputation Marks per
faction, Honor, Breach Tokens). `data/merchants.ron`: one row per §13.2 merchant with `services:
[Buy(stock), Sell, Repair, Recycle, Socket, Reset, Gamble(cost), Travel]` and a stock source
`Fixed([ids]) | Table(loot id) | DailyRotation(table, size)`. Price constants (TUNE, §13.3): resale
2000 bp, buyback 10 items. The price formula `base(slot) × rarity × iLvl` is code in `items-loot`;
`ItemBase::value` is its `base` (feedback F15: two different "base" values).

**Tests.** **Given** a merchant selling an item id that does not exist, **Then** `ref.exists`.
**Given** a `DailyRotation` larger than its table, **Then** an issue.

**Dependencies.** `items-loot`, `world-generator` (UTC daily seed: the Rust port of `hash32` from
`client/src/daily.ts`, cross-tested on shared vectors, §13.2 "même fonction").

---

## 18. Gathering, refining, crafting, consumables (§14, §15)

Fields owned by `gathering-crafting`:

```ron
Node(id: "node.iron", profession: Mining, tier: 1, tool_tier: 1, yields: [(weight: 90, "mat.iron_ore", 1, 3),
     (weight: 10, "gem.raw_ruby", 1, 1)], respawn_s: (600, 1800), rich_bp: 500, rich_mult: 3),
Station(id: "station.foundry", kind: Refining),
Recipe(id: "recipe.steel", station: "station.foundry", profession: Smithing, level: 20,
       inputs: [("mat.iron_ingot", 1), ("mat.flux", 1), ("mat.coal", 1)], output: ("mat.steel", 1), xp: 10),
Consumable(id: "consumable.heal_potion", effects: [Heal(to: Hero, amount: MaxHpBp(3000))]),
```

Copied values (TUNE, §14, §15): professions 0 to 100, tiers at 0, 20, 40, 60, 80; nodes 0 to 3 per
tile; respawn 10 to 30 minutes; rich veins ×3; channel 3 s; consumables 1 per turn, 3 per combat;
Potion 3000 bp, Tonic +30, Liquid Ballast +1 Weight for 2 turns. Consumables use the ability
language (§15.4 "en Action rapide"), so the same checks apply (Bomb: no ejection).

**Tests.** **Given** steel needing iron ingot and iron ingot needing steel, **Then**
`graph.acyclic`. **Given** a recipe input that no node, loot table or merchant provides, **Then**
`graph.reachable`. **Given** a T3 recipe whose inputs are T4, **Then** an issue "tier inversion"
(PROPOSAL rule). **Given** the Bomb with `eject: true`, **Then** `ability.no_eject_without_tag`.

**Dependencies.** `gathering-crafting`, `items-loot`, `narrative-quest-designer` (profession orders).

**Risks.** Antidote and Oil have no effect numbers (§15.4, feedback F16): `draft`.

---

## 19. Quests (§16)

The format, state machine and quest rules are `narrative-quest-designer.md` sections 4.2 to 4.7.
This role provides: the `QuestDef` type in `abalone-data/src/quest.rs` (fields as the sibling wrote
them), loading of `data/quests/*.ron`, the shared graph helpers (`graph.acyclic`,
`graph.reachable`, used by quests and recipes), text key derivation (`quest.<id>.title`, `.desc`,
`.obj.<n>`), and the alias rule for quest ids in saves.

**Tests.** **Given** quest A requiring B and B requiring A, **Then** `graph.acyclic` names both.
**Given** a quest requiring level 120, **Then** unreachable. **Given** an objective `Defeat`
pointing at a monster family id that does not exist, **Then** `ref.exists`.

**Dependencies.** `narrative-quest-designer` (all fields and quest rules).

---

## 20. PvP and battle royale templates (§19, §20)

`data/templates.ron` (owner `pvp-br-designer`): `Template(id: "template.arena", level: 100, gear_bp:
..., abilities: Free, ultimate: true)` and `Template(id: "template.br", level: 20, gear_bp: 0,
abilities: PickTier1(2), ultimate: false)`, values TUNE (§19, §20). In ranked play the hero sheet is
rebuilt from the template, class data, chosen Paths and abilities only; equipment is ignored, which is
what makes normalization work without a server (§19).

**Tests.** **Given** the arena template, **When** built for each class, **Then** stats depend only on
class and level (property: two heroes with different items give equal template stats). **Given** a BR
template allowing an ultimate, **Then** an issue (§20 "pas d'ultime au départ").

**Dependencies.** `pvp-br-designer`, `stats-progression`. **Risks.** "gabarit de niveau 100" gives no
gear level (feedback F18).

---

## 21. World parameters and events (§4.1 to §4.4, §4.8, §22)

`data/world.ron` (owner `world-generator`): radius 60, 10 zones plus hub, board radius 4 per tile and
the stitching vectors `(9, −4)` and `(4, 5)` (FINAL as geometry, §4.1), tile content weights (§4.3:
55, 15, 3, 15, 2, 3, 1 plus dungeon, event, boss rows), aggro 1 and 2 tiles, fog radius 3, step 300
ms, Momentum −2000 bp at 20 and −3500 bp at 40, out-of-combat regen 500 bp per second, Beacon travel
1 Lueur, day cycle 40 minutes, night +1000 bp stats and +1000 bp XP, weather modifiers (all TUNE
unless marked). Events (§22) are `Event(id, kind, duration_s: (300, 600), zone, ...)` rows.

**Tests.** **Given** the tile content weights, **Then** they sum to exactly 10 000 (`weights.sum`).
Today §4.3 sums to 94 % plus unquantified rows (feedback F6): the file cannot pass until the rows are
set. **Given** the stitching vectors, **Then** the property "two neighbour tiles give boards that
touch without overlap" holds for every neighbour (test owned by `world-generator`, vectors read from
data).

**Dependencies.** `world-generator`.

---

## 22. Scenario format: rules as data (§1 pillar 4, §25 R1)

§1 pillar 4: "a rule is described by a starting position and a list of actions". The gameplay spec's
"Vérification" section asks for Given/When/Then examples in `rules.md` §10.5 (weighted push, Shock,
Ice slide, seams, hero ejection and Edge danger, revival, flight, Isolation, durations, cooldowns,
bonus Step). A scenario file turns each example into a test with no Rust to write.

### 22.1 Format (PROPOSAL)

Same style as `encounter/fixture.rs`: one header per line, cells `q,r`, groups joined by `;`.

```text
scenario: two Fragments cannot push a lone Guardian (§6.4 example 3)
rules: weighted
board: radius 4
unit: A.hero warrior level=1 at 0,0
unit: A.f1 fragment at -2,0
unit: A.f2 fragment at -1,0
unit: B.hero guardian level=1 at 1,0
turn: A
do: move -2,0;-1,0 E
expect: illegal push_weight
```

```text
scenario: a pushed hero off the edge dies and the fight is lost (§6.6)
rules: weighted
board: radius 3
unit: A.hero warrior level=1 at 0,0
unit: A.f1 fragment at -1,0
unit: B.hero assassin level=1 at 1,0 weight=1
unit: B.f1 fragment at 2,0
turn: A
do: move -1,0;0,0 E
expect: lost B.f1 ejected
do: ...
expect: outcome A
```

| Line | Meaning |
|---|---|
| `rules:` | `classic` or `weighted` (§6.4 rule switch, `engine-core`) |
| `board:` | `radius N`, `tiles q,r;q,r` (stitched, §4.6), `void q,r;...` |
| `terrain:` | `q,r <terrain id> [dir=E] [turns=N]` |
| `unit:` | `<side>.<name> <class or monster or fragment> [level=] [hp=] [weight=] [status=id:turns] at q,r` |
| `resource:` | `<side> <resource id> <amount>` |
| `turn:` | entity to play |
| `do:` | `move <cells> <dir>`, `step <cell> <dir>`, `cast <ability id> [at q,r] [dir=] [pick=q,r;...]`, `prepare <ability id>`, `flee`, `end` |
| `expect:` | `legal`, `illegal <reason>`, `at <unit> q,r`, `hp <unit> N`, `status <unit> <id> <turns>`, `lost <unit> died\|ejected`, `cooldown <unit> <ability> N`, `outcome <side>\|draw\|running`, `hash <hex>` |

Units are named so expectations read well; names map to unit ids in file order (fixed order, §24.1).
`<reason>` values are the engine's stable refusal codes (`push_weight`, `push_count`,
`push_blocked`, `no_bonus_step_left`, `on_cooldown`, `not_enough_resource`, ...), owned by
`combat-engine` and listed in its spec.

### 22.2 Implementation

- Parser: `abalone-rpg/src/scenario.rs` (pure, `&str -> Result<Scenario, ScenarioError { line,
  message }>`), because it builds a `CombatState`. Runner: `run(&Scenario) -> Vec<Failure>` with the
  line of each failed `expect`.
- Files: `crates/abalone-rpg/tests/scenarios/<topic>/<name>.txt`; one integration test walks the
  folder (file list checked like `files::ALL`) and runs each file.
- `rules.md` §10.5 examples and scenario files hold the same cases; the docs PR copies the text, and
  the scenario header cites the example number.
- Property hook for §6.4's invariant ("all Weights 1 = classic"): a scenario with `rules: weighted`
  and no `weight=` override must give the same legality as `rules: classic`; the runner can run a
  file under both and compare (`compare: classic` header, PROPOSAL).

### 22.3 Dependencies, tests, risks

**Dependencies.** `combat-engine` (refusal codes, `apply_action`, the semantics of each `expect`),
`engine-core` (classic and weighted push), `class-designer` and `encounter-boss-designer` (write
scenarios for their abilities), `ux-designer` (no UI).

**Tests.**
- Parser: **Given** `unit: A.hero warrior at 9,9` on a radius 4 board, **Then** an error naming the
  line "cell off the board". **Given** two units on one cell, **Then** an error. **Given** an unknown
  ability id in `cast`, **Then** an error. **Given** an `expect` before any `do`, **Then** it checks
  the start state (allowed).
- Runner: **Given** the 6 weighted push examples of §6.4 as files, **Then** all pass once the engine
  implements §6.4 (R1 done criterion "Poids 1 = classique" is the property; these are the examples).
- **Given** an `expect: hp B.hero 97` that the engine computes as 96, **Then** the failure message
  names the file, the line and both values.

**Risks.** The format grows with every new rule. Rule (PROPOSAL): a new line kind needs two scenarios
that use it.

---

## 23. Content CLI `abalone-content` (content tools)

### 23.1 What it does (PROPOSAL)

A small binary, built like `abalone-cli` (library with all logic, a 5-line `main.rs`), crate
`crates/abalone-content`, native only (never in WASM).

| Command | Output | Use |
|---|---|---|
| `abalone-content check` | Every parse error and integrity issue, one per line, `file:line rule message`, exit code 1 if any | Fast feedback for content authors without running the whole test suite |
| `abalone-content board <scenario or puzzle file>` | ASCII hex board with units, terrain glyph letters and coordinates | Review a scenario or a puzzle in a PR description |
| `abalone-content table <name>` | A Markdown table generated from data: `stats` (Guardian versus Assassin at levels 1, 50, 100, required by §7.2), `abilities` (class, slot, kind, cost, cooldown, range, tags), `budgets` (section 14), `hooks` (section 8.6), `loot <id>` (expected value per roll) | Specs and PRs show the real numbers |

### 23.2 Docs that cannot drift (PROPOSAL)

`docs/specs/rpg/stats.md` and `docs/specs/rpg/classes.md` keep the generated tables between marker
comments (`<!-- table:stats -->` ... `<!-- /table -->`). A test runs the generator and fails if the
committed table differs, with the command to regenerate it. Numbers then have one source: the data.
Only for tables, never for prose.

### 23.3 Dependencies, tests, risks

**Dependencies.** `stats-progression` (stat formulas for `table stats`), `tech-lead` (new crate in
the workspace), docs owners (accept markers).

**Tests.** `run(args, out)` tested like `abalone_cli::run` with in-memory writers: **Given** valid
content, **When** `check`, **Then** exit 0 and the line "0 issues". **Given** content with one
issue, **Then** exit 1 and the issue line. **Given** the scenario of 22.1, **When** `board`, **Then**
the golden ASCII output. **Given** `table stats`, **Then** a golden Markdown table (HP at level 1:
Guardian `120 × 1.3 = 156`, Assassin `120 × 0.8 = 96`).

**Risks.** Tools are code: 100 % coverage applies (CONTRIBUTING §11 "engine, client, networking,
tools"). Keep three commands only (KISS).

---

## 24. Content view on the WASM bridge (§24.4)

§24.4: functions for the world and the combat, in versioned JSON. The bridge today returns flat
integer arrays (decision #74). PROPOSAL: keep integer arrays for every per-move call; add one JSON
call for static content, read once:

```rust
#[wasm_bindgen] pub fn content_hash() -> String;              // 16 hex digits
#[wasm_bindgen] pub fn content_view() -> String;              // JSON below
```

```json
{ "version": 1, "hash": "9f3c...", "abilities": [{ "id": "warrior.charge", "class": "warrior",
  "slot": 1, "kind": "action", "cost": [["warrior.rage", 0]], "cooldown": 2, "range": 2,
  "target": "line", "tags": ["self_move"], "tell": 0 }],
  "statuses": [{ "id": "status.frozen", "glyph": "glyph.snowflake", "category": "hard" }],
  "terrain": [{ "id": "terrain.mud", "glyph": "glyph.thick_waves" }],
  "resources": [{ "id": "warrior.rage", "min": 0, "max": 100 }] }
```

- The UI (action bar, ability card, glyph legend) reads names from `en.json` with the derived keys
  and numbers from this view; it never hard-codes a cost or a cooldown.
- Numbers that depend on hero stats (damage of a cast) come from the combat engine's preview, not
  from this view (owner `combat-engine`).
- TS types: a hand-written `client/src/content.ts` interface plus a contract test: Rust writes a
  golden JSON in its test, vitest decodes the same file (`client/src/content.test.ts`). KISS: no
  type-generation crate (`tech.md` §4 lists `tsify`/`ts-rs`; open question Q6).
- `version` changes only on a breaking shape change; `hash` changes with any data change.

**Dependencies.** `tech-lead` (bridge policy, decision #74 versus §24.4, feedback F19),
`client-engineer` (decoder, worker plumbing), `ux-designer` (what the card shows).

**Tests.** Rust: **Given** the R1 content, **Then** `content_view()` equals the golden file.
Vitest: the golden file decodes; a file with `version: 2` is refused. **e2e (Playwright, with
`client-engineer`)**: in the R1 fight, the action bar shows "Charge" and "Cleaver" (text from
`en.json`) with cost and cooldown equal to `data/classes/warrior.ron`; the test reads the expected
values from `window.__content` (a debug hook like `window.__cellToScreen`), so a data change never
breaks the e2e. A UI PR includes a screenshot (CONTRIBUTING §6.4).

---

## 25. Save formats: versions, ids, combat resume (§6.12, §24.5)

### 25.1 Shared conventions (PROPOSAL)

All saves follow `tech.md` §8 and `savegame.ts`:

- JSON, top-level `version` integer; a save of an unknown version is migrated if a migration exists,
  else dropped with a notice, never shown half-loaded.
- Ids are strings resolved through `content().resolve` (aliases, section 6.3); unknown ids are
  dropped, not fatal.
- Stores (§24.5): `hero` (owner `stats-progression`, with sections from other roles, e.g. quests,
  items), `combat` (owner `combat-engine`). Export and import reuse the `gamefile.ts` rules (1 MiB
  max, TUNE as there).

### 25.2 Migrations

Each owner writes `migrate_vN_to_vN1(json) -> json` next to its save code, one test per step with a
golden old save. This role provides nothing but the convention and reviews that ids in saves are
strings.

### 25.3 Combat resume (§6.12)

The `combat` save holds `version`, `content_hash`, the combat seed, the format, the starting units
and the action log (the state is replayed, the engine stays the judge, like `savegame.ts`). If
`content_hash` differs from the running build (a deploy happened between reload and resume), the
combat cannot be replayed safely: PROPOSAL, the fight is dropped and counts as a flight without the
durability loss (owner decision, Q7).

**Tests (owners: `combat-engine`, `stats-progression`; this role checks the convention).** **Given** a
`combat` save with another `content_hash`, **When** loaded, **Then** it is dropped with the notice.
**Given** a `hero` save whose class id was renamed with an alias, **Then** the hero loads with the new
id. **e2e:** reload the page during the R4 fight, the fight resumes at the same action (§25 R4
criterion "recharger la page", owner `client-engineer`).

---

## 26. MCP (§24.6)

The MCP server (#163, `mcp.md`) will need abilities in `legal_moves` and `get_state`. This role's
part: ability ids, status ids and terrain ids are the stable strings of section 6, the same rule as
`mcp.md` §4.3 ("kind values are stable once published"); `content_view()` gives the MCP server the
same static data the client reads. The MCP change itself is a separate issue (§24.6), not a task
here.

---

## 27. Feedback on the gameplay spec

Contradictions and gaps found while writing this role. The gameplay spec is not modified here.

- **F1. "12 primitives, entirely in data" (§6.10, §1 pillar 4) does not cover every ability.**
  Avalanche (a 4-ball move shape), Paradoxe (board rewind with relocation), Pont (grows the board),
  Rotation (rotates 7 cells), Danse des lames (multi-jump path) and Instant suspendu (cancels an
  ejection) are engine features, and Interposition, Lien vital, Martyr (damage routing) need
  effects that are none of the 12. Proposal: 2 extra Mark-family effects and 6 named hooks (sections
  8.3, 8.6).
- **F2. §24.3 "every ability has a counter" fails on the spec's own content.** §8 gives a "Contre"
  line only for some abilities (for example none for Fendoir, Coup de bouclier, Épines, Bélier,
  Chaîne d'ancre, Tourbillon, Peau de fer, Écrasement, Exécution, Entaille, Éventration, Lame
  empoisonnée, Croc-en-jambe, Rayon de soin, Trait de feu, Siphon, Mine temporelle, Soulèvement).
  `classes.md` must add them or the integrity test cannot pass.
- **F3. "Every threat is announced one turn ahead" (§1 pillar 2) versus "Ejector = ultimate or
  tell" (§6.10, §24.3).** Séisme du Lest is an Ejector ultimate with no tell; the rule exempts
  ultimates from pillar 2. Pick one: ultimates show a tell through the visible full resource (as
  Avalanche's counter says), or every Ejector gets `tell >= 1`.
- **F4. Non-integer numbers against §24.1 "integers only".** VIT +0.1 per level (§7.2), `C(n) = 4 +
  n/3` (§11), Mana Shield "2 HP = 1 mana" (§8.5), +0.5 % world speed per VIT (§7.1), "environ +2 %"
  per shard rank (§9.2). Each needs a rounding rule; proposals in section 5.1.
- **F5. Haste rule wording (§7.1).** "Par tranche de 25: −1 tour sur les recharges de 3 tours ou plus
  (au moins 1 tour)": is "au moins 1 tour" the minimum cooldown after reduction or the minimum
  reduction? The patch order (section 8.4) needs the answer.
- **F6. Tile content shares do not sum to 100 % (§4.3).** 55 + 15 + 3 + 15 + 2 + 3 + 1 = 94 %, plus
  "rare" and "changes over time" rows with no number. A generator needs weights that sum exactly.
- **F7. "Le Puits: un mélange" (§5.2)** has no terrain shares; "Éboulements" has no rate.
- **F8. "Rempart ne baisse jamais" (§8.1)** while every Guardian ability costs Rempart. Means "no
  decay per turn"?
- **F9. Shard list overlaps (§9.2).** "Force adaptative" appears in the Offensive and Flexible rows
  and Haste in Offensive while runes also give Haste: 9 distinct shard ids are needed for the 54-point
  budget (3 rows × 3 shards × 6 ranks); are the two "Force adaptative" the same stat in two slots?
- **F10. Runes without numbers (§9.2).** Most runes say "plus de dégâts", "Hâte", "Ténacité",
  "ressource maximale augmentée" with no value; the data cannot be complete until `talents.md`.
- **F11. Ranks R2 and R3 (§10)** say "+25 % or −1 cooldown depending on the ability" without saying
  which for each of the 80 abilities, and give R3 variants for Charge only.
- **F12. "+1 rank for an ability" affix (§12)** versus R3 being a choice between two variants: does an
  item rank reaching R3 pick a variant? Does it count toward the 20-point budget (§10) or the tier
  gates?
- **F13. Weight cap scope (§7.1, §12, §15.4).** "Items give +1 Weight at most in total": is Liquid
  Ballast (a consumable, +1 Weight for 2 turns) or the Ambre-scorie gem (on the Ballast slot) inside
  that cap? The validator must know whether the cap is per item source or per hero.
- **F14. Gear Score (§12)** "average of the items": average of iLvl? Of value? Undefined.
- **F15. Two "base(emplacement)" (§12, §13.3).** Stats use `base(slot) × g(iLvl)` and value uses
  `base(slot) × rarity × iLvl`: these are two different bases; the data needs both.
- **F16. Consumables without effects (§15.4).** Antidote "—" and Oil "ajoute un élément aux
  attaques" (elements have no resistances, §6.5, so the effect is only reactions and biome bonuses).
- **F17. Battle royale player count.** §6.8 says 5 players (héros + 9 against "5 joueurs"), §20 says 6
  players. The format data needs one number.
- **F18. Arena template gear (§19).** "Gabarit de niveau 100, stats fixes" gives no gear level, while
  §7.2 says gear adds up to about +120 % at end game: with or without template gear?
- **F19. Bridge format.** §24.4 "JSON versionné" conflicts with decision #74 (flat integer arrays, the
  header of `abalone-wasm/src/lib.rs`). This spec keeps arrays for per-move calls and uses JSON only
  for the static content view; the Decision should say so.
- **F20. Crate split (§24.2).** Talent validation lives in `abalone-world`, but runes and keystones
  change combat in `abalone-rpg`; item aspects too. Def types need a crate below both (section 4.2).
- **F21. The state hash (§24.1) does not cover the data.** Two peers with different `data/` produce
  different combats with equal-looking logs. Add the content hash (section 5.4).
- **F22. No home for the data format.** §0 lists 13 spec files; none describes the data format,
  the units or the integrity rules. Proposal: a "Data and content" section in the `tech.md` update of
  docs PR 4 (task TD-01).
- **F23. Which statuses count for mass control (§6.10).** "Contrôle dur en zone (Étourdi, Gelé)" while
  the DR table puts Stase in Hard too and leaves Provocation in no category: is a zone Taunt a mass
  control with DR?
- **F24. Name clash "Gelé".** The Mage's Résonance state "Gelé" (§8.5) and the status "Gelé"
  (Stunned + 30 % ARM, §6.11) share a name, like "Brûlé" (state) and "Brûlure" (damage over time).
  Does Nova de givre's Gelé also count as the reaction state? Ids must differ.
- **F25. Elements are never assigned (§6.5).** Weather (lightning +25 %, fire −25 %), Water (Wet:
  lightning +50 %), Dunes ("sauf les capacités de feu"), Caldera (Burn +50 %) all key on an element
  tag, but §8 tags no ability with an element. Every ability needs an `Element` tag (or none).
- **F26. Variable and multiple costs (§8.3, §8.6, §24.3).** Finishers consume "all combo points",
  Assassinat costs Energy and combo points, Pacte de sang costs HP. "No cost above the max resource"
  needs a definition for these (the schema lists costs; the check runs per cost).
- **F27. Surchauffe (§8.5).** "Each spell cast in the same turn costs +50 %": cumulative (+50 %, then
  +100 %) or flat? And does "spell" mean any ability, a Quick Action, a consumable?
- **F28. Durations without a bearer (§6.3).** Status durations count the bearer's turns, but terrain
  from abilities (Mur de boucliers 2 tours, Source 3, Sol verglacé 3, Pont 2) has no bearer. Whose
  turns? (proposal: the caster's, section 9.2).
- **F29. Board timers in multi-entity fights (§5.2, §6.7).** "Tous les 6 tours" (Tide), "à partir du
  tour 20 de chaque entité" (Usure), "tour 30" (Breach): in a 4-player group fight each entity has
  its own count. Breach and Tide need one shared clock (proposal: Rounds).
- **F30. Daily seed "même fonction que `daily.ts`" (§13.2).** World logic is Rust; the function must
  exist twice (TS and Rust) with shared test vectors, or move to the engine.

---

## 28. Open questions

1. RON for authored data, JSON for text, saves and the content view: accepted? (section 4.1)
2. Accept `serde` and `ron` as the first external crates below the bridge, with the measured WASM
   size of TD-02? (`tech-lead`, section 4.6)
3. All def types in one `abalone-data` crate, the sibling roles keeping field ownership? (section 4.2,
   F20)
4. If serde derives report uncovered regions, accept a file-name exclusion for pure declaration
   files? (section 4.6)
5. Hooks as an escape hatch, capped at 10 for the 8 launch classes? (section 8.6, F1)
6. TS types for the content view: hand-written plus a golden contract test, or a generator crate
   (`tsify`/`ts-rs`, `tech.md` §4)? (section 24)
7. A combat save from another data build: dropped as a flight without penalty? (section 25.3)
8. Duration clocks: Bearer for statuses, Caster for ability terrain and marks, Round for board rules?
   (section 9.2, F28, F29)
9. Patch order: ranks, aspect, sets, affixes, runes, then Haste? (section 8.4, F5)
10. Generated spec tables between markers in `stats.md` and `classes.md`, checked by a test? (23.2)
11. Ids in English even for French-named content? (section 6.1)
12. Content hash mismatch in a party: refuse the combat with a "reload" message? (section 5.4)
13. Do items store only rolled values and recompute stats from data after a patch? (section 16.3)

---

## 29. Tasks (one PR each)

Phases from §25. Code tasks follow CONTRIBUTING §11 (test commit before implementation commit,
100 % line and region coverage, e2e when a player sees the change, a screenshot when the UI changes)
and rule 17 (one thing per PR). Data files with content are written by their owner roles in their own
tasks; the tasks below give them the schema, the loader and the checks.

### R0: spec

**TD-01. Data and content chapter in `tech.md`**
Outcome: the repo spec describes the data folder, the units, the ids, the integrity rules and the
content hash, so R1 code has a reference.
- [ ] Section added to the `tech.md` update of docs PR 4 (§0), from sections 3 to 7 of this file.
- [ ] The crate graph of section 4.2 and the `HashMap`/float bans written.
- [ ] Open questions Q1 to Q5 linked to the Decision #313 thread.
- [ ] No code.

### R1: minimal combat

**TD-02. `abalone-data` crate and RON loader**
Outcome: `abalone_data::content()` loads the embedded `data/` files into sorted registries and
reports every parse error with file, line and column.
- [ ] Crate added to the workspace, `serde` and `ron` at exact versions, `clippy.toml` bans
      `HashMap`/`HashSet`, `float_arithmetic` denied.
- [ ] `files::ALL`, the "every file listed" test, `.gitattributes` `eol=lf`.
- [ ] Tests of section 4.5; coverage 100 % (or the exclusion of Q4 accepted in review).
- [ ] WASM size before and after written in the PR (section 4.6).

**TD-03. Integrity harness**
Outcome: `cargo test` fails with a readable list when any data file breaks a rule.
- [ ] `Issue`, `validate()`, `tests/content.rs::embedded_content_is_valid`.
- [ ] Rules `id.format`, `id.unique`, `ref.exists`, `num.range`, `text.exists`, each with a failing
      and a passing test.
- [ ] `draft: true` skips completeness rules only (tested).

**TD-04. Content hash**
Outcome: one 64-bit hash names the data set, the same on native and WASM.
- [ ] `Content::hash` (FNV-1a over sorted paths and bytes), tests of section 5.5.
- [ ] `content_hash()` on the bridge.
- [ ] Hand-off note to `combat-engine` (state hash seed) and `network-p2p` (handshake) in the issue.

**TD-05. Text keys file and check**
Outcome: every player-facing name comes from `data/text/en.json` and a missing key fails the tests.
- [ ] `data/text/en.json`, derived key rules of section 6.4, `text.exists` rule.
- [ ] CLI-free warning list for unused keys (printed by the test, not failing).

**TD-06. Ability and class schema v1, Warrior R1 data**
Outcome: the Warrior class, Rage, the default Fragment squad and Charge and Cleaver exist as data and
pass every R1 rule.
- [ ] Types for the variants R1 uses (Damage, Move with Dash, Resource, If, Turn.NextPush), `ClassDef`,
      `ResourceDef`, `data/stats.ron` (hero base, Fragments).
- [ ] Rules `ability.cost_max`, `ability.counter`, `ability.ejector`, `ability.no_eject_without_tag`.
- [ ] `data/classes/warrior.ron` (`draft: true`), reviewed by `class-designer`.
- [ ] Section 8.10 tests.

**TD-07. Scenario format and runner**
Outcome: a rules example written as a text file runs as a `cargo test`, starting with the 6 weighted
push examples of §6.4.
- [ ] `abalone-rpg/src/scenario.rs` parser and runner, folder walk test.
- [ ] Section 22.3 tests; 6 files under `tests/scenarios/push/`.
- [ ] Blocked until `combat-engine` has `apply_action` and refusal codes (dependency named in the
      issue).

**TD-08. Content view on the bridge**
Outcome: the R1 action bar reads names, costs and cooldowns from data, never from client code.
- [ ] `content_view()` JSON, golden file, `client/src/content.ts` decoder and contract test.
- [ ] e2e of section 24 with `window.__content`; screenshot in the PR.

### R2: four classes, statuses, six terrain types

**TD-09. Status and keyword schema**
Outcome: the statuses and keywords of §6.11 are data with DR categories and duration clocks.
- [ ] `StatusDef`, `Duration { turns, clock }`, `data/statuses.ron` (values from `class-designer`).
- [ ] Rules `status.category`, `status.cycle`, `ability.mass_control`; section 9.3 tests.

**TD-10. Terrain catalog schema**
Outcome: the 6 R2 terrain types load with typed parameters and a glyph each.
- [ ] `TerrainDef` with per-rule params, `data/terrain.ron` (6 rows), `data/glyphs.ron` ids.
- [ ] Rule `glyph.exists`; section 11.3 tests (terrain part).

**TD-11. Ability language v2**
Outcome: every primitive, trigger, passive and patch of section 8 parses and validates, with the hook
registry.
- [ ] All `Effect`, `Sel`, `Cond`, `Amount`, `Trigger`, `Passive`, `Patch` variants; patch order.
- [ ] Rules `ability.hook_known`, `ability.bonus_step`, `ability.ranks`, `haste.not_ult`.
- [ ] One scenario per new variant requested from `combat-engine` (listed in the PR).

**TD-12. Class schema for the R2 classes**
Outcome: Guardian, Warrior, Mage and Healer files validate, including traits, reactions and resource
cost rules.
- [ ] `class.shape`, `class.tiers` rules; `CostRule` variants (Surchauffe pending F27).
- [ ] Validation passes on the 4 files written by `class-designer` (or names their missing parts).

**TD-13. `abalone-content` CLI: `check` and `board`**
Outcome: a content author gets every issue and an ASCII view of a scenario in one command.
- [ ] Crate `abalone-content` (lib plus thin main), golden tests of section 23.3.
- [ ] Documented in CONTRIBUTING §13 (one line).

### R3: progression

**TD-14. Talent data and budget proofs**
Outcome: the 99 and 20 point budgets, the gates and the shard cap are proven from data on every build.
- [ ] `TalentRules`, `Path`, `Rune`, `Shard` types, `data/talents/*.ron` shape for 2 Paths.
- [ ] `talent.budget` with the greedy level simulation; section 14.3 tests.

**TD-15. Progression data and the generated stats table**
Outcome: XP constants and level unlocks are data, and the §7.2 stats table is generated.
- [ ] `data/progression.ron`, unlock cross-check with `TalentRules`.
- [ ] `abalone-content table stats`, marker check on `docs/specs/rpg/stats.md` (if Q10 accepted).

**TD-16. Id aliases for saves**
Outcome: a renamed id still loads from an old hero save.
- [ ] `data/aliases.ron`, `Content::resolve`, rule `alias.chain`; section 6.5 tests.

### R4: world v1

**TD-17. Biome and world parameter schema**
Outcome: the 3 v1 biomes and the world parameters load and their weights are checked.
- [ ] `BiomeDef`, `data/biomes.ron` (3 rows), `data/world.ron`; rule `weights.sum`.
- [ ] Section 11.3 and 21 tests.

### R5: loot, inventory, merchants

**TD-18. Item schema**
Outcome: bases, rarities, affixes, aspects, uniques, sets and gems load and obey the item rules.
- [ ] Types and files shape; rules `item.weight_cap`, `item.rank_affix`, aspect class match.
- [ ] Item instance JSON decode with unknown-id drop; section 16.4 tests.

**TD-19. Loot table schema**
Outcome: loot tables load, nest without cycles, and their expected value is printable.
- [ ] `LootTable`, `graph.acyclic` shared helper, `abalone-content table loot <id>`.

**TD-20. Merchant and currency data**
Outcome: the merchants of §13.2 and the currencies of §13.1 are data that references real items.
- [ ] `data/currencies.ron`, `data/merchants.ron` shape, section 17 tests.

### R6: quests

**TD-21. Quest schema integration and graph checks**
Outcome: `data/quests/*.ron` loads through `abalone-data` and its prerequisite graph is checked.
- [ ] `QuestDef` moved or defined in `abalone-data` with `narrative-quest-designer`.
- [ ] `graph.reachable` helper; section 19 tests.

### R7: gathering and crafting

**TD-22. Gathering, refining, recipe and consumable schemas**
Outcome: every recipe input is obtainable and no recipe loops.
- [ ] Types and file shapes of section 18; consumables use `AbilityDef`.
- [ ] Rules `graph.acyclic`, `graph.reachable`, tier inversion; section 18 tests.

### R8: dungeons and bosses

**TD-23. Dungeon plan schema and boss release check**
Outcome: dungeon plans load and a released boss without a winning fixture fails the tests.
- [ ] `Dungeon`, `Room`, `FormatDef` types; rule `boss.fixture`; section 12 tests.

### R9: full world

**TD-24. Full-content budget check**
Outcome: the size and the parse time of the full content are measured and kept under budget.
- [ ] Test or CI report of embedded size (TUNE 400 KB gzipped) and parse time (TUNE 30 ms).
- [ ] Hook count printed (cap 10, TUNE).

### R10: multiplayer

**TD-25. PvP and BR template data**
Outcome: ranked arenas and the battle royale build heroes from templates that ignore equipment.
- [ ] `Template` type, `data/templates.ron`, section 20 tests (stats independent of items).

Total: 25 tasks (TD-01 to TD-25).
