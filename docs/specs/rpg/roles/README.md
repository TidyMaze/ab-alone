# RPG pivot: consolidation of the 20 role specs

Status: draft v0, PROPOSAL. Consolidation for the RPG pivot (Decision #313, still open). Source of
truth: the validated French gameplay spec (`je-veux-qu-on-am-liore-whimsical-sloth.md`, to be copied
as `docs/specs/rpg/plan.fr.md`), cited as "§x.y". This file changes neither the gameplay spec nor the
role files: it indexes them, lists where they disagree with a proposed arbitration, merges their
feedback on the gameplay spec, and merges their 492 Tasks into one backlog. Nothing here is decided
until an owner answers on #313.

> **Gameplay spec update, after the role specs (2026-10-25).** `plan.fr.md` now lists *Clair
> Obscur: Expedition 33* as an inspiration, and its new §4.9 adds an Expedition 33-style
> progression. Everything in §4 stays as it was; on top of the open continent come:
>
> - expedition corridors: hand-made, semi-linear, each ending in a boss, with corridor Beacons that
>   respawn packs when you rest;
> - main progression in a prologue plus 3 acts, where the player picks 2 of 3 corridors in free
>   order before the act's final corridor;
> - traversal powers (Float, Breaker, Leap, Dive, Void current) that open continent regions;
> - optional Colossi.
>
> The v1 dungeons become the final corridors of each act and are replayed as instances afterwards.
> The role files predate this change. When their Tasks are picked, revise these files first:
> level-designer, narrative-quest-designer, encounter-boss-designer (5 new corridor bosses),
> technical-designer (corridor and traversal data), engine-architect and network-programmer
> (persistent corridor state, traversal flags in the save), ux-designer and
> graphics-technical-artist (corridor map, act choice screen), playtest-balance-analyst (corridor
> level targets).

Validated decisions that every arbitration below respects (FINAL):

- **D1** science-fantasy universe on the existing lore;
- **D2** Diablo-like P2P: shared deterministic world, own instance, party of 4 at most, no server (#36);
- **D3** a hero and its squad of Fragments;
- **D4** an ejected hero (or a hero at 0 HP) dies and its entity loses the fight at once;
- **D5** deterministic combat: no dice in a fight;
- **D6** weighted push: `n > m` **and** strictly greater total Weight;
- **D7** at most 1 ejection per action (terrain with a tell of at least 2 turns excepted, §6.10).

Role short codes used in this file:

| Code | Role file | Code | Role file |
|---|---|---|---|
| A11Y | [accessibility](accessibility.md) | GPL | [gameplay-programmer](gameplay-programmer.md) |
| AI | [ai-programmer](ai-programmer.md) | GFX | [graphics-technical-artist](graphics-technical-artist.md) |
| ART | [art-director](art-director.md) | LEAD | [lead-game-designer](lead-game-designer.md) |
| CMB | [combat-designer](combat-designer.md) | LVL | [level-designer](level-designer.md) |
| OPS | [devops-build](devops-build.md) | NAR | [narrative-quest-designer](narrative-quest-designer.md) |
| ECO | [economy-designer](economy-designer.md) | NET | [network-programmer](network-programmer.md) |
| ENC | [encounter-boss-designer](encounter-boss-designer.md) | BAL | [playtest-balance-analyst](playtest-balance-analyst.md) |
| ENG | [engine-architect](engine-architect.md) | QA | [qa-automation](qa-automation.md) |
| SND | [sound-designer](sound-designer.md) | SYS | [systems-designer](systems-designer.md) |
| TDS | [technical-designer](technical-designer.md) | UX | [ux-designer](ux-designer.md) |

Three role files number their Tasks `T1`, `T2`, ...; this file prefixes them: `EBD-Tn`
(encounter-boss-designer), `NQD-Tn` (narrative-quest-designer), `SYS-Tn` (systems-designer).

---

## 1. Index of the roles

| Role | Scope (one line) | Tasks |
|---|---|---|
| [accessibility](accessibility.md) | Glyph plus colour redundancy, photosensitivity and flash analyser, clear board, reduced motion, flat HUD fallback | 19 (A11Y-01 to A11Y-19) |
| [ai-programmer](ai-programmer.md) | Hook-aware generic search, combat search state and evaluation, monster turn planner and intents, player bot, RPG ladder runs, puzzle prover | 20 (AI-00 to AI-19) |
| [art-director](art-director.md) | Palette law, looks of heroes, Fragments, monsters, biomes, cell decals, icons, bosses and VFX grammar | 24 (AD-01 to AD-24) |
| [combat-designer](combat-designer.md) | Ability language as data, class resources, the 8 classes and 80 abilities, ranks and variants, the Five Paths content | 43 (CD-01 to CD-43) |
| [devops-build](devops-build.md) | CI pipeline, toolchain pin, determinism lints, cross-target hash checks, WASM and dist budgets, nightly jobs, e2e harness | 17 (DB-00 to DB-16) |
| [economy-designer](economy-designer.md) | Currencies, items, affixes, loot, inventory, merchants, gathering, refining, crafting, P2P trade economy | 29 (ECO-01 to ECO-29) |
| [encounter-boss-designer](encounter-boss-designer.md) | Monster model, packs and threat budgets, elite affixes, boss framework, converted and new bosses, dungeon difficulty, raids | 31 (EBD-T1 to EBD-T31) |
| [engine-architect](engine-architect.md) | Crate graph, determinism kit, canonical encoding, `Region` and `Arena`, generic weighted push, ice slide, hashes, saves | 23 (EA-00 to EA-22) |
| [gameplay-programmer](gameplay-programmer.md) | Combat rules layer in `abalone-rpg`: state, turn, damage, death, victory, primitives, statuses, Preparations, PvP and BR rules | 42 (GP-00 to GP-41) |
| [graphics-technical-artist](graphics-technical-artist.md) | Instanced board renderer on any region, SDF glyph atlas, VFX timeline, world map, unfold, biome looks, perf harness | 24 (GTA-01 to GTA-24) |
| [lead-game-designer](lead-game-designer.md) | Pillars as testable invariants, glossary and names, `rules.md` delta, arbitration register, roadmap, coherence tests | 14 (LGD-01 to LGD-14) |
| [level-designer](level-designer.md) | Cell catalog and terrain rules, world map and tiling, travel, engagement, board generation, start zones, dungeons | 23 (LD-01 to LD-23) |
| [narrative-quest-designer](narrative-quest-designer.md) | Lore delta, quest engine and content, journal and tracker, tutorial, puzzles, Codex, factions, titles | 36 (NQD-T1 to NQD-T36; T31 is 7 PRs) |
| [network-programmer](network-programmer.md) | Party of 4, commit-reveal seeds, combat lockstep, catch-up, takeover, PvP and BR transport, presence, trade transport | 21 (NP-01 to NP-21) |
| [playtest-balance-analyst](playtest-balance-analyst.md) | Telemetry records, balance crate, gates and ladder data, playtest protocol and rounds | 16 (PBA-01 to PBA-16) |
| [qa-automation](qa-automation.md) | Test strategy, exact rule examples, property suites, hash coverage, phase exit e2e | 21 (QA-01 to QA-21) |
| [sound-designer](sound-designer.md) | Procedural audio graph, cue data, voice scheduler, combat, world and boss music, mixer | 20 (SND-01 to SND-20) |
| [systems-designer](systems-designer.md) | Stat model, weighted push rules, damage, heal, statuses, timers, resources, XP, talent trees, PvP templates | 20 (SYS-T1 to SYS-T20) |
| [technical-designer](technical-designer.md) | Data folder and format, `abalone-data` loader, integrity harness, schemas, content hash, content CLI | 25 (TD-01 to TD-25) |
| [ux-designer](ux-designer.md) | Readability, previews, Edge danger alert, action bar, targeting, frieze, windows, world readability | 24 (UX-01 to UX-24) |
| **Total** | | **492** role Tasks, merged into **425** backlog entries (**431** PRs) in section 4 |

---

## 2. Contradictions between roles, with a proposed arbitration

Each row is PROPOSAL until an owner confirms on #313. "Majority" means most role files that take a
side. Rows that touch a validated decision say which one.

### 2.1 Organisation and tooling

| # | Topic | Positions | Proposed arbitration |
|---|---|---|---|
| C1 | **Role roster.** Role files cite 16 slugs from LEAD 2.2 (`combat-engineer`, `class-designer`, `tech-lead`, `client-engineer`, `pvp-br-designer`, ...) that are not the 20 roles of this folder; ECO F42 counts three slugs for itself | LEAD 2.2 table vs the actual 20 files | Map: `combat-engineer` → GPL (rules) and ENG (core push); `class-designer` → CMB; `progression-designer` → SYS; `world-designer` → LVL; `ai-engineer` → AI; `network-engineer` → NET; `tech-lead`, `data-tools` → TDS (data) and ENG (crates); `qa-balance` → BAL; `qa-engineer` → QA; `art-audio` → ART and SND. Two duties have **no role**: client wiring (WASM glue, scenes, windows) goes to GFX with UX; PvP and battle royale design goes to SYS (templates, `rpg/pvp-br.md`) with NET, GPL and LVL. New backlog entries R0-16, R1-58 and R3-24 cover the gaps |
| C2 | **R0 docs packaging.** §0 plans 4 docs PRs; LEAD G4 splits PR 1 in 3; the roles plan about 25 docs Tasks | §0 vs LEAD G4 vs every role's R0 Task | One PR per spec file (27 entries in R0), in the dependency order of section 4, so each stays "one thing" (CONTRIBUTING rule 17). Files shared by several roles (`world.md`, `tech.md`, `ui.md`) are edited by PRs one after the other (rule 16). Owner choice: fewer, larger PRs reduce the merge load on @TidyMaze (docs-only PRs need his admin bypass) |
| C3 | **Data format** | RON: LEAD A11, CMB, ENC, LVL, SYS, NAR, BAL. JSON: ENG F19, GPL Q1, SND (`cues.json`). Split: TDS 4.1 | TDS split: RON for hand-written content in `data/`, JSON for saves, the bridge, text keys and generated files. Needs an owner answer before any R1 data lands (OPS G5) |
| C4 | **Scenario (rule example) format** | LEAD 4.4: RON scenario files. GPL 4.7, QA, OPS D5, TDS TD-07: `.scn` text files | `.scn` text with GPL's notation, one parser in `abalone-rpg`; LEAD's assertion list (`At`, `Hp`, `Gone`, `Outcome`, `EdgeDanger`, ...) becomes the `.scn` assertion vocabulary |
| C5 | **Doc sync test** | LEAD 4.4: a test reads `rules.md` with `include_str!`. OPS D5: docs-only PRs skip CI, tests must not parse docs | QA O3: keep the sync test; a PR that edits an example of `rules.md` §10.5 must also edit its `.scn` file, so it is never docs-only |
| C6 | **Example numbering** | LEAD R1 to R18, QA R1 to R50, SYS W1 to W14, GPL and LVL own examples | One `R` series in `rules.md` §10.5 owned by LEAD; QA's R1 to R50 is the master list, LEAD's 18 rows are mapped first, SYS's W rows and the others are folded in |
| C7 | **Classic `Board` and `Region`** | LVL LD-02: put `Board` on `Region`, delete `MAX_RADIUS`. ENG F2, EA-05: new `Region` and `Arena`, classic `Board` untouched | ENG: the RPG needs unit ids and N camps that `Board` cannot hold, and pillar 1 asks to keep the classic engine intact. LVL keeps the terrain rules and the generator on `Region` |
| C8 | **Push predicate owner and API** | LEAD 4.1 `strong_enough` (by `combat-engineer`); ENG EA-07 `push::resolve`; SYS-T3 `push_verdict`, SYS-T4 `apply_with` oracle | One Task in `abalone-core` (R1-16): ENG writes the code, SYS owns the rule text, LEAD and QA own the equivalence tests. Classic `apply` calls the predicate in `Classic` mode (D6) |
| C9 | **Scan order** | §24.1 "r then q"; LEAD, ENG F1, LVL F27: classic keeps q then r, RPG uses r then q. AI AIF-18 expects classic results to change once; OPS G2 asks for one order | Classic order unchanged (no change to boss fixtures, ladder or `search.rs` ties); the RPG uses the canonical `Region` order. AI-01's golden table must stay equal |
| C10 | **Tile lattice location** | ENG EA-17 `abalone-core/src/tiling.rs`; LVL LD-08 `abalone-world` | `abalone-core`: combat on stitched tiles (R8) needs it without the world crate |
| C11 | **Data loader crate** | TDS TD-02 `abalone-data` crate; ENG EA-04 loader in `abalone-world` plus a twin in `abalone-rpg`; OPS DB-07 its own harness | One `abalone-data` crate below `abalone-rpg` and `abalone-world` (avoids the crate cycle of TDS F20); ENG's `DATA_VERSION` and OPS's file checks merge into it |
| C12 | **Seeded RNG and hash helpers** | ENG EA-01 `det.rs`; QA-03 `abalone_core::seed`; ECO-02 economy RNG; LVL LD-08 moves `rng.rs`; EA-18 `hash32` | One module, EA-01 (R1-04); the others consume it. ECO-02 shrinks to the economy stream tags |
| C13 | **Bridge format** | §24.4 "versioned JSON"; GPL GP-13, ECO-08: JSON v1. TDS F19: keep the flat arrays of #74 for per-move calls | Classic calls keep #74's arrays; every RPG call (combat, world, economy) uses versioned JSON. Needs a Decision that amends #74 for the RPG only |
| C14 | **Ladder ownership and record type** | AI-07: `rpg_ladder` example in `abalone-rpg` with `RpgAttemptRecord`. BAL PBA-03, PBA-05: `abalone-balance` crate with `FightRecord`. ENC EBD-T14: a boss telemetry record | BAL O1 and O2: AI owns `play_fight` and the bots; BAL owns the example, the scenario data, aggregation, gates and report; one `FightRecord` for every fight, bosses included |
| C15 | **Ladder gates** | AI 18.5: packs 9 to 10 of 10 at 1×. CMB CD-17: 7 to 9 of 10 per class. BAL 4.8: 16 to 20 of 20 at `Default`, every class within ±2 of the mean. Bosses: all agree on 7 to 9 of 10 at 10× (`Pro`) plus a fixture | BAL's tables (gate owner), 20 seeds per cell, all values TUNE in `data/ladder/gates.ron` |
| C16 | **Glyph pipeline** | AD-03: polygon shapes feed meshes and SVG. GTA-04: generated SDF atlas. UX-03: `glyphs.ts` catalog | One pipeline: UX owns the catalog (ids, meaning, label), ART owns the polygon shapes, GFX generates the SDF atlas from those shapes (R1-62, then R1-63) |
| C17 | **Palette module** | AD-02 `art/palette.ts` with the palette law; A11Y-03 `a11y/palettes.ts`, contrast and colour-vision checks | One `palette.ts` (ART), the A11Y checks read it (merged in R1-61) |

### 2.2 Combat rules

| # | Topic | Positions | Proposed arbitration |
|---|---|---|---|
| C18 | **R1 Warrior abilities** | LEAD 10.2: Fendoir and Percée. CMB CD-02, CD-05, TDS TD-06, GPL GP-09 and GP-10, NAR NQD-T10: Charge and Fendoir | Charge and Fendoir (majority, and the engine paths are already specified). The equal-count push of Percée is tested in R2 (R2-13) with its §6.4 example. LEAD's "test hero template" for R1 is kept |
| C19 | **Ejections by triggered effects** (D7) | LEAD 7.3 and G10: a firing Preparation is its own action, so two ejections in one opposing action window are legal. GPL F12: Preparations, reactions and death triggers share the triggering action's budget | GPL: shared budget. It reads D7 strictly, keeps the property test simple ("one action, at most one ball off the board") and removes a surprise for the player. Owner confirms (LEAD O11) |
| C20 | **No-Loss draw** | §6.7: 60 entity turns. LEAD G14: 40 rounds. GPL F9: 45 rounds. GP-07 tests "draw at 60"; BAL uses 60 entity turns | Count in rounds, value in data, 40 rounds (TUNE): after the Breach (round 30) has had time to act, and stable in a party of 4. GP-07, BAL and QA R50 follow |
| C21 | **Damage multipliers** | GPL F6: every "×" becomes an additive entry of `Σbonus`. LEAD 7.6 and SYS S5: explicit multipliers in a fixed stage after the bucket | Explicit stage after the bucket (LEAD and SYS): "×1.5" keeps its written meaning |
| C22 | **Bucket clamp** | LEAD 7.6: −90 % to +300 %. SYS S4: −80 % to +200 % | SYS (formula owner), TUNE in `combat.ron` |
| C23 | **Hero Guard scope** | CMB 7: one Guard bucket per cast. LEAD 7.6, SYS 6, GPL 9.4: per action, Shock of a Movement included | Per action, Movement Shock included; damage over time ticks are separate sources. Flag GPL F60 to the owners: 3 slots × 35 % = 105 %, so a full-HP hero can still die in one enemy turn |
| C24 | **Frozen status vs Mage "Gelé" state** | LEAD 5.2 and G24: one name, one thing. CMB F28: a separate "Chilled" state. GPL F4, TDS F24: element markers separate from the Frozen control | Separate element markers (Chilled, Burnt, Charged, Wet) distinct from the Frozen control, so Vapour can land; distinct ids and glyphs |
| C25 | **Status applied during the bearer's own turn** | LEAD 7.2: §6.3 as written (ends at the end of the bearer's N-th turn). CMB F1, GPL F2 (`fresh` flag), SYS F2, QA F17: the application turn does not count | The `fresh` rule: when the bearer is the active entity, the application turn does not count. Keeps "Frozen 1 skips one turn" true and self-buffs useful |
| C26 | **Repetition key phase** | ENG EA-13 (R2) vs GPL GP-07 (R1, repetition key of 11.6) | R1, inside the victory Task (R1-27), with ENG's key without monotonic counters |
| C27 | **Term for a dead or ejected ball** | LEAD 5.2: "Casualty" (to avoid "Loss" vs losing a fight). The 19 other files: "Loss" | "Loss" (used everywhere); the code keeps `Loss` apart from `Outcome::Defeat` |
| C28 | **The six R2 cell types** | GPL F59: Roc, Gouffre, Glace, Boue, Lave, Fourré. LVL F23, GFX GTA-08: Roc, Gouffre, Glace, Boue, Lave, Sanctuaire | Sanctuaire in R2 (the R2 Healer's Source creates one); Fourré moves to R4 with the Sylve biome. SYS-T11 moves its Fourré entry to R4 |

### 2.3 Content, AI and world

| # | Topic | Positions | Proposed arbitration |
|---|---|---|---|
| C29 | **Monster intents: phase and owner** | ENC EBD-T5: R1, `ai.rs` in the encounter scope. AI: planner in R1 without intents (AI-05), intents in R2 (AI-09). UX-10: intents shown in R1 | AI writes the code, ENC writes the data (priority lists, abilities). Intents ship in R1: pillar 2 requires them and the R1 monsters already have abilities. AIF-6 kept: no intent at fight start |
| C30 | **Main quest finale** | NAR NQD-T34: the story ends with the raid on Tally. LEAD A9, ENC EBD-T19 and Q3: a solo fight "Le Registre" ends the story; the 4-player raid is endgame | LEAD A9: pillar 5 ("seul, ensemble") forbids a story end that needs a party. NQD-T34 is rewritten (backlog R9-45) |
| C31 | **Monster level in a group** | §6.2 `max(zone_min, player_level)`. ENC F6 and Q9: tile level as in solo. LEAD A12: tile level raised to the party's lowest level minus 5 | LEAD A12 (no pack grey for the whole party, zone bands kept) |
| C32 | **Opponents' look and sound in PvP and groups** | ART 5.4: own camp cyan, other players "rival glass". A11Y 1.4: own camp glass, opposing camp shell. SND 5.4: listener's camp glass sound, all others shell | Viewer-relative: own camp glass with a cyan core; allied players glass with their seat glyph; opposing players rival glass (bone core) with an opponent glyph (A11Y's shape cue) and the shell sound class (SND). One rule in `world.md` §5 |
| C33 | **Level tier glyphs** | ENC: pips. UX: punctuation. ART Q10: pips with a cracked ring | ART's proposal, as a row of UX's catalog |
| C34 | **Exploration fog naming** | A11Y AF5: "unexplored" (tiles) and "haze" (atmosphere). ART F24: "exploration darkness" | A11Y's two words; clear board removes the haze, never the unexplored state |
| C35 | **English names** (glossary, LEAD owns it) | LEAD 5.3: currency Lueur = Glow, Éclats de verre = Shards, Chronomancer penalty = Overdraw. ECO: Glimmer, Slivers, Lest slot = Keel. CMB F25: penalty = Debt | LEAD's names (Glow, Shards, Overdraw); Keel for the Lest slot (LEAD gives none, it avoids the Ballast clash). One registry in `rpg/README.md`, checked by LGD-09 |
| C36 | **Hint and evaluation bar in RPG fights** | LEAD A7, UX F18: hidden in every RPG fight. AI Q7: an RPG Hint from the player bot | Hidden until the combat search handles abilities; an RPG Hint is a separate Task after R2 (not in this backlog) |
| C37 | **Edge danger e2e contract** | OPS D10: a count on `body`. UX A.4: `hero:could` | UX's format (QA O5) |
| C38 | **Biome art budget** | ART: 3 MB per biome, lazy. GFX GTA-15: 300 KB per biome, tested | 3 MB is the hard budget (art.md rule); 300 KB is GFX's TUNE target in `gen-assets.test.ts` |

---

## 3. Feedback on the gameplay spec

Grouped by theme and deduplicated. Each item cites the gameplay spec sections and the role items that
raised it. The gameplay spec is not modified; LEAD posts this list as one comment on #313 (a lead
agent action, not a PR).

### 3.1 Delivery, conflict list, missing spec files (§0, "Contexte", "Fichiers critiques")

- **Conflict list incomplete.** Missing: `rules.md` §9 (100 plies replaced by §6.7), `game-design.md`
  §3.3 and §5, `SPEC.md` §2 ("modes never fork the engine"), `world.md` §1 to §4 (ship drifting vs
  stranded, "You are alone" vs parties and a Colony, "Tally never explains itself" vs Tally as quest
  giver, boss hooks tied to decks), `world.md` §6.1 for the quest tracker, `SPEC.md` §4 hub as a room
  graph. LEAD G1, G3; NAR F6 to F9, F23; GFX G17.
- **No home for several deltas.** No audio file (`world.md` §7, `tech.md` §5.4: SND F1), no art delta
  (`world.md` §5, art.md: ART F27), no data-format chapter (TDS F22), no accessibility delta
  (`world.md` §8: A11Y AF8, AF9). `rpg/pvp-br.md` is listed in §0 but no role owns it (see C1).
- **PR 1 too big** for CONTRIBUTING rule 17 (LEAD G4; see C2).

### 3.2 Pillars (§1)

- **Pillar 2 vs instant abilities and Ejector ultimates without a tell** (Séisme du Lest, Avalanche,
  Fendoir, Trait de feu, Assassinat). Reword: "every threat is visible: tells for terrain and bosses,
  intents for monsters, ready abilities and resources for heroes". LEAD G18, 4.2; UX F2; TDS F3.
- **An ambush breaks "announced one turn ahead"** (§4.4): the pack plays first. Proposal: no intent at
  fight start, first monster turn non-major only. AI AIF-6; UX F15.
- **Attrition is a hidden rule** (§6.7): it needs a cue at onset. SND F14.
- **"3 balls per group" vs Avalanche** (§1, §6.4, §8.2): Avalanche is a 4-ball group, not an equal-count
  push; only Percée pushes at equal count. Needs a deviation register and a `rules.md` §3 delta.
  LEAD G2; CMB F48; GPL F24, F61; ENG F23; SYS F4.
- **`rules.md` §10 intro** ("a mode never changes a move or a push") is also broken by terrain and
  statuses, not only by Weight. LEAD G3.
- **"No difficulty slider" silently dropped** while §23 adds world tiers (§26 Q9). LEAD G28.
- **Pillar 3 "skill over stats" has no test.** LEAD 4.3; BAL F12.
- **"Même perft" has no baseline, depth or count**: the engine has no perft today. LEAD G29; OPS G9.
- **Pillar 4 "every ability uses the 12 primitives" fails** on Avalanche, Paradoxe, Pont, Rotation,
  Danse des lames, Instant suspendu, Écrasement, damage routing (Interposition, Lien vital, Martyr),
  conversion and facing for bosses. Proposal: named hooks or extra parameters, capped. CMB F2; TDS F1;
  QA F19; GPL F28, F52, F53.

### 3.3 Determinism and architecture (§24)

- **The `HashMap` diagnosis is wrong** (§24.1): the map is never iterated; the real blockers are
  `MAX_RADIUS = 5` and `DefaultHasher` (not stable across Rust releases, length width differs on
  wasm32). Name a stable hash (FNV-1a 64). ENG F1; GPL F55; LVL F27; OPS G3; QA F1.
- **Scan order differs from classic** (§24.1): say the classic order is not changed (see C9). LEAD G30;
  OPS G2; AI AIF-18.
- **Hash coverage list incomplete**: slots used, active entity, frieze, anti-stall counters, tells,
  once-per-fight flags, Lassitude and DR timers, Revenant expiry; and the data set itself (content
  hash). QA F3; TDS F21.
- **"Same log = same hash" must hold on native and wasm32** (§25 R1). OPS G7; ENG F18.
- **Floats and non-integers**: no lint boundary (OPS G4); rounding rules missing for VIT +0.1 per level,
  `C(n) = 4 + n/3`, Mana Shield "2 HP = 1 mana", "+0.5 %" speed, "about +2 %" shards (TDS F4; SYS F22,
  F23; BAL F7).
- **Time is an input** (§4.2, §4.8, §13.2, §16 to §20): every UTC-driven rule must take the time as an
  argument, frozen at fight start and stored in the fight state (night, weather). OPS G11; NET F4;
  LVL F30; BAL F13.
- **What the combat seed drives** is not listed (§4.7, §24.1): only setup, placement tie-break, PvP
  initiative tie and BR chests; the converted Chaplain's 3-in-4 chance must go or be told. ENG F10;
  NET F6.
- **"Id du combat" for the loot seed is undefined** (§12): a retry would repeat the loot. Proposal:
  `setup_hash` plus a per-hero fight counter. ENG F11; ECO F26, F40; NET F22; QA F22.
- **`Effects` does not exist** (§24.2): it is new work and must carry unit ids, from/to of every move,
  amounts, types, statuses, tells and terrain changes. ENG F17; GPL F56; GFX G11.
- **RON or JSON** left open (§24.3; see C3) and **bridge JSON vs #74** (§24.4; see C13). OPS G5;
  ENG F19; TDS F19.
- **Crate split**: talent validation in `abalone-world` while runes change combat in `abalone-rpg`;
  def types need a crate below both (§24.2). TDS F20. **Where the AI lives** and tech.md §7 (Zobrist,
  `budget_ms`, seeded boss RNG) contradict §5.3 and D5. AI AIF-17.
- **Board renderer reuse is understated** (§24.5): the board needs instanced layers and a region model
  even for R1. GFX G10.
- **WASM size budget** not restated for all content in one module (§24.3). OPS G6.

### 3.4 Weighted push, movement and terrain (§6.4, §5.1)

- **"Run" undefined with several entities or camps** (BR, groups, neutral escorts). Proposal: the
  contiguous balls not of the mover's side, mixed allowed. LEAD G5; ENG F8; SYS F6; GPL F31.
- **Weight clamp order** for Mud, Titan, Bourreau du bord, Roc inébranlable, items: per ball, then group
  bonuses above 5. LEAD G6; ENG F9; SYS F7; GPL F15.
- **Which Slope cell counts**: the group's front ball. LEAD G7; ENG F9; SYS F5; GPL F14; LVL F11.
- **Mud broadside** with one ball on Mud: illegal. ENG F12.
- **Ice**: own single Movement sliding itself off the board (self-ejection, a hero would die), groups
  partly on Ice, slide after a Step, Inéjectable sliding, Choc timing after a slide, "last cell" next to
  interior Chasms, which self-moves slide. ENG F16; QA F6 to F8; LVL F10; GPL F18.
- **Titan vs Inamovible**: Inamovible forbids moving oneself, Titan pushes; needs "cannot be moved by
  others". SYS F3.
- **Écrasement**: which ball is stuck, which conditions. CMB F12; GPL F42; ENG F24.
- **Gouffre is permanent in the engine** (`Board::void`) but timed in many effects. ENG F3; LVL F9.
- **Cell gaps**: Évent (N, restart, blocked target), Crystal (floor or obstacle), Water (Wet duration),
  Sanctuary "ally" with no owner, Quicksand exit needs a free Step, Fourré and Hauteur placement in the
  formula. LVL F12, F14 to F18; GPL F7, F37, F38.

### 3.5 Turn structure, durations, cooldowns (§6.3)

- **Cooldown off by one**: "unavailable N turns" plus "down by 1 at turn start" blocks N − 1 turns.
  Store N + 1. LEAD G9; GPL F1; SYS F1.
- **Status applied during the bearer's own turn** ends at once (see C25). CMB F1; GPL F2; SYS F2;
  QA F17.
- **Clocks without a subject**: ability terrain, tells, Vent, Tide, Rockfall, Attrition and Breach in
  groups. Proposal: caster's turns for ability terrain and marks, rounds for board and biome clocks.
  LEAD G8; GPL F10; LVL F13; TDS F28, F29; UX F4.
- **Ultimate slot**: §6.3 puts it in the Action slot, Titan and Martyr are Quick. CMB F3.
- **End of turn and undo**: auto end when slots are spent, no undo, Step vs one-ball Movement.
  UX F10; LEAD A2.
- **"Same effect" tie for simultaneous hero deaths** undefined, and missing beyond 1v1. GPL F5; QA F4;
  LEAD G12.
- **Trigger chains** need a depth cap (Preparations only have one); Preparation lifetime and controlled
  owner. GPL F13, F35.
- **Intent timing**: commit at the end of the monster's turn, retarget or fizzle. ENC F18; UX F5;
  LEAD A5.
- **Previews must include opposing Preparations.** UX F9.

### 3.6 Ejection limits (§6.10)

- **Triggered ejections** (Preparation after an ejecting Movement): see C19. LEAD G10; GPL F12.
- **Chasm inside the board vs the golden rule** ("stops on the last cell"). LEAD G11; LVL F10.
- **1-turn tells that remove several balls**: Quicksand, Rockfall, the classic Hull cracks. Proposal:
  2-turn tells. LEAD G19; QA F12; ENC F24.
- **Pont**: a ball pushed on late gets less than 2 turns of warning. CMB F41.
- **Inéjectable vs non-push removal** (Breach, Tide): stop on the last cell or move to the nearest
  free cell. QA F18; GPL F11; SYS F25.
- **Nearest-first order blocks outward knockbacks**: farthest first for recoil areas. CMB F22;
  GPL F18.
- **"Away from the origin"** and the origin of board-wide effects undefined. CMB F21; GPL F19; QA F20.

### 3.7 Damage and healing (§6.5)

- **`Σbonus` has no floor and multipliers are not placed** (see C21, C22). LEAD G15; SYS F11; GPL F6;
  LVL F18.
- **Hero Guard scope** (see C23). LEAD G16; GPL F8, F60; SYS F10; CMB F10.
- **Damage barely matters at current numbers**: 7 to 8 Fendoirs for a same-level Brute, 33 to 36 for
  an Elite; no ability has a `Base`. SYS F8.
- **Types missing** for DoT and % max HP damage, and **Choc on a rim stop** has no source ATQ. SYS F29,
  F33; GPL F17, F33.
- **Penetration** is used by runes and shards but not in the formula. CMB F50; SYS F34.
- **Isolation and Formation are exhaustive** (every ball has one of the two). QA F9.
- **Order of shields, Guard, Mana shield, Lien vital, Martyr, Interposition, lifesteal, reflect** not
  given. CMB F10; GPL F8.

### 3.8 Death, hero, Edge danger, Revenants (§6.6)

- **Edge danger scope**: `legal_moves` misses ice slides, Ejector abilities, castable push modifiers,
  terrain; "next turn" undefined in groups. Proposal: phase-by-phase threat set, heroes only.
  UX F1; CMB F11; QA F5; LEAD 7.4.
- **The hero's death needs its own presentation** (shown before the defeat banner, distinct sound).
  GFX G14; SND F4.
- **Weight 1 heroes** (Assassin, Mage, Chronomancer) are pushed by any pair, while three Weight 1
  monsters cannot push a Weight 3 tank; the ladder must measure hero death causes per class (§26 Q10).
  LEAD G22; ENC F21.
- **Revenants**: raising a hero (never), Revenant stats, Corpses per cell, summons and Losses.
  CMB F30; SYS F28; GPL F22, F26.
- **Instant suspendu**: is the opposing Movement spent, what the preview shows. LEAD G21; CMB F34;
  GPL F23.
- **Interposition is listed as a hero protection** but moves damage to the hero. CMB F60.
- **Pacte de sang can kill the own hero.** CMB F8; GPL F62.

### 3.9 Victory, anti-stalling, formats (§6.7, §6.8)

- **No-Loss draw vs Breach** (see C20). LEAD G14; GPL F9; QA F2.
- **Repetition can never happen** if absolute counters are in the state. ENG F7; GPL F57.
- **Breach "down to radius 2"** has no meaning on unions or ragged boards: peel by depth. ENG F5;
  LVL F28. **"Edge" vs "rim"** undefined with interior Chasms. ENG F6; LVL F32.
- **Flee from the rim is a trap** for a hero whose ejection is death; playtest in R4. LEAD G20;
  QA F10.
- **Boss victory**: a rout threshold on the boss side lets 6 shells win without the Heart. No rout for
  a boss entity. ENC F7; AI AIF-13; LEAD A3.
- **Battle royale player count**: 5 in §6.8, 6 in §20. Use 6 seats. GFX G15; NET F1; TDS F17.
- **Skirmish threat vs ball count, Elite budget and HP** (×3 total, not ×4.5). ENC F2, F3, F5; SYS F9;
  BAL F8.
- **Group density**: 32 to 44 balls on 61 cells in a quatuor skirmish. ENC F8; LVL F39. **Pack rout
  threshold** in solo undefined. ENC F9. **Group fairness intent** (harder, equal, easier) unstated.
  BAL F10.
- **What a pack aims for in a draw**; fled balls and loot; a hero dead in a winning group. AI AIF-7;
  ECO F25; GPL F20.
- **Hero HP on a boss retry**: full. LEAD G13. **Boss phase on retry**: phase 1. SND F16.
- **Formations** exist only for radius 4 with 14 balls; group start positions undefined. LVL F7, F8;
  UX F16.

### 3.10 Ability language and classes (§6.10, §6.11, §8)

- **Counters missing** for about 60 of 80 abilities, required by §24.3. CMB F4; TDS F2.
- **Start resources** and "reset to zero" vs class start values (Faith 50, Mana 100). CMB F5, F6;
  GPL F21.
- **Elements never assigned** to abilities, while weather, Water, Dunes and Caldera key on them.
  TDS F25; SND F11.
- **Element states vs statuses** (see C24). CMB F28; GPL F4, F34; TDS F24; LEAD G24; ART F28.
- **Negative statuses, mass control categories, Taunt DR** not listed. CMB F16, F62; TDS F23; SYS F14,
  F15.
- **"Ally" in groups, friendly fire.** CMB F9, F29.
- **Per-ability gaps** (ranges, Rage per ball, Écrasement, Lame empoisonnée, Danse des lames, Retour,
  Paradoxe, Rotation, Effondrement, Surchauffe, Sables shape, Séisme size off radius 4, Dunes gain).
  CMB F7, F21 to F24, F33 to F42, F49; GPL F27, F36, F43 to F50; TDS F26, F27.
- **Name collisions**: Éclats ×4, Lueur ×4, Hâte, Décrépitude, Pente, Sables, Séisme, Paradoxe,
  Gardien, Coup de bouclier, Élan, Rempart, Lest, Gelé, monster families vs bosses (Échos, Chœurs).
  LEAD G25; CMB F25; ECO F3, F4, F32; NAR F27; GPL F58; ART F13 (see C35).

### 3.11 Stats and progression (§7, §9, §10, §11)

- **Lest VIT cost and temporary Weight**: items only. LEAD G23; CMB F20; SYS F24.
- **Rune, keystone and shard values missing**; shard overlaps; Haste traps. CMB F45, F53, F56;
  SYS F16 to F18; TDS F9, F10.
- **Tree gates**: does the learned point count; secondary Path at 20 or 21. CMB F13, F54; SYS F19.
- **"+1 rank" affix** vs R3 variants and the 20-point budget. CMB F43; ECO F14; SYS F20; TDS F12.
- **XP sources missing** (kill XP, quests, grey rule, rested rate, level 100). SYS F21; BAL F7; NAR F16.
- **R1 hero level**: no ability before level 5; R1 needs a test template. LEAD G17.
- **Haste wording**, Fragments from geared or naked stats, Revenant level. TDS F5; SYS F27; ECO Q14.
- **Pionnier breaks point-symmetric PvP starts.** LEAD G26; CMB F44.
- **Tutorial gives a passive point at level 2** while fights are "pure Abalone", and the first ability
  is gated by the lineage trial or the level. NAR F31, F32.

### 3.12 World, biomes, travel (§4, §5)

- **Tile outline and board sizes**: the tile lattice is turned against the board; radius 3, 5 and 8
  boards do not match a tile. Proposal: global terrain per combat cell. GFX G1, G4; LVL F4 to F6; ENG F4.
- **Tile content shares sum to 94 %.** LVL F1; TDS F6.
- **Step costs and speed stacking** missing for 5 biomes, the hub and dungeons. LVL F2, F3.
- **Patrols and engagement** (which tile unfolds, patrol function, click-engage); **party movement**
  (one ball or four). GFX G9, G18; LVL F24; NET F2, F3.
- **Darkness, night and sandstorm** must be rule effects with a glyph, never hidden cells. A11Y AF4;
  ART F9, F10; GFX G7.
- **Biome tables incomplete** (Littoral sea side, Le Puits mix and Rockfall, Ballast interior, Dunes
  gain). LVL F19 to F21; TDS F7; GPL F39; ECO F11, F12.
- **Level bands overlap** and tile level is unset. LVL F22; NAR F16; BAL F9.
- **World version changes** break saved tile flags; pin the full world from R4. ENG F13; LVL F36.
- **Hub placement** (tiles or deck scenes); Les Cales inside a hub with "no combat". GFX G17; NAR F29;
  LVL F21.
- **R2 cell list** not named (see C28). GPL F59; LVL F23.
- **Tutorial island vs zone 1.** NAR F1; LVL F26. **Zone borders** soft or gated. LVL F38.
- **Pack respawn, Beacon density, trap rooms, dungeon seed.** LVL F29, F33 to F35.

### 3.13 Monsters, bosses, dungeons (§5.3, §17, §18)

- **Stale boss proof**: the Chaplain is at 7 of 10 with a fixture since #207. ENC F1; BAL F1.
- **Release sentence inverted** ("the boss has won a ladder") and **gates incomplete** (fixture and
  ladder, which one blocks). AI AIF-8, AIF-9; OPS G17; BAL F16.
- **No nightly ladder exists today.** OPS G1; BAL F2. **Classic telemetry types do not fit RPG
  fights.** BAL F3.
- **Alpha-beta is two-player**: negamax over camps, a paranoid greedy bot for BR. AI AIF-1.
- **Monster order wastes melee Actions** (Action before Movement). AI AIF-3. **Target heuristic and node
  budgets have no values.** AI AIF-2, AIF-5. **Tutorial monsters must have no ability.** AI AIF-16.
- **The Hull "3 tiles in a line"** splits in two boards after the middle collapse: a triangle instead.
  ENC F4; LVL F25.
- **Tally**: the 5 seats include Tally; the story end is a 4-player raid (see C30). ENC F11; NAR F4,
  F33.
- **Bosses in groups** (scaling, retry with a changed party). ENC F12; NET F23. **Choir extra Movement**,
  **hard control on a Heart**, **raising a boss**, **Inéjectable Heart vs the status**, **dual phase
  triggers**. ENC F10, F13, F16, F19, F20.
- **Reinforcements vs "no pack joins a fight"**; **Champions in skirmishes**; **new bosses have no
  roadmap phase**; **endgame scaling numbers missing**. ENC F14, F15, F17, F22, F23.
- **Raid budget for the ladder** (Ballast Mind at 10× is beyond a nightly). AI AIF-14.

### 3.14 Items, economy, crafting (§12 to §15)

- **"+0 % at level 1"** cannot hold with `base × g(iLvl)`; two different `base(slot)` (stats, price).
  ECO F1, F2; TDS F15.
- **Durability −10 % per death** breaks gear after 10 boss retries, maybe counted twice; no max, no rule
  at 0. ECO F6, F7.
- **Glow costs Beacon travel in R4** but currencies arrive in R5. ECO F8.
- **"4 stations" in R7** vs 5 refining stations and 7 professions; recipe example and ore tiers
  disagree. ECO F9, F10, F12.
- **Level requirement to equip**, tradeability of quest and template items, template items bought with
  Honor vs fixed ranked stats, Gear Score definition, max iLvl, magic find cap, set size, gem removal,
  bags. ECO F5, F13, F17 to F19, F29, F30, F33, F37, F38; TDS F13, F14.
- **Consumables**: no cooldown while a rune shortens it; free item vs the cap of 3; meal duration.
  CMB F51, F52; ECO F22, F23.
- **Immunity to a cell type** must exclude ejecting cells. ECO F15. **Resource affixes** do not fit the
  Chronomancer. ECO F16.
- **Grey monsters still give gold and loot**; chests without respawn; BR chests need the shared seed.
  ECO F24, F27, F36.
- **Trades**: where, gold and Glow tradeable, atomicity; Hardcore and season realms. ECO F31, F35;
  NET F13.

### 3.15 Quests, narrative, tutorial (§11, §16, §22)

- **The tutorial misses the riskiest rules**: HP and Shock, Weight, hero death by ejection and Edge
  danger. NAR F3; UX F11; LEAD A4.
- **No respawn point in the tutorial** (Beacons at level 5). NAR F2.
- **The player's goal is missing**, and the Order of the Ledger's fate after Tally. NAR F5, F13.
- **No quest failure rule**; "present" undefined for group credit; credit is local. NAR F10, F11; NET F24.
- **Reputation numbers missing**; Marks amounts absent. NAR F12; ECO F21.
- **Puzzles**: rules, supply (about 110 needed), proof of solvability, one system or two (tile and
  quest). NAR F14, F15, F28; AI AIF-20.
- **Dailies and weeklies** ("week" definition), bounty cadence, events longer than fights, exploration
  tiles that cannot be reached, class quest cosmetic with 2 ultimates, Codex "fight again".
  NAR F17 to F22.
- **Languages must be decided before R6 content** (§26 Q5); horror slider and quest text. NAR F24, F25.
- **Profession orders**: Craft or Deliver. NAR F26. **Momentum sources** (levels 20 and 40, a quest,
  Honor). NAR F30; ECO F20.

### 3.16 Interface, art, accessibility, audio (§2, §24.5)

- **Colours outside the palette**: monster tiers (grey, green, yellow, orange, red; thresholds missing),
  Champion blue and Elite yellow, rarity colours, Lava red, Water and Ice cyan. A palette Decision is
  needed: desaturated ramps plus mandatory glyphs. A11Y AF1 to AF3; ART F2 to F5, F8, F23; GFX G5, G6;
  UX F3.
- **No glyph rule for statuses, keywords, element states and the hero.** A11Y AF6; UX F7; ART F7, F12.
- **"On n'anime qu'un seul plan" is ambiguous** (read as a 300 ms cross-fade), and no reduced variant for
  the many board-wide motions. A11Y AF7; ART F11; GFX G2; UX F12.
- **Photosensitivity absent** while the RPG adds many flash sources. A11Y AF8; ART F10.
- **Flat fallback**: `world.md` §6 rule 8 requires it for every game-critical fact, not only the bar;
  some RPG facts have no diegetic home (log, inspect, board rules, tracker). A11Y AF9; UX F6, F8; NAR F23.
- **Camps in groups and PvP** (see C32). A11Y AF10; UX F19; ART F12, F20; SND F2.
- **Hard time limits** (PvP placement 20 s, turn timer, real-time patrols): pause the world in solo
  while a window is open. A11Y AF13.
- **Keys not remappable**, Space clashes with focused buttons, world movement by keyboard missing.
  A11Y AF14; UX F13, F14.
- **Emotes and pings**: list, labels, rate limit. A11Y AF15; SND F21.
- **Edge danger must be steady**, Weight changes need a shape rule, BR radius 8 legibility at 720p.
  A11Y AF16 to AF18; ART F19.
- **HP "ring" around a marble reads like a tell**: a flat arc instead. ART F17.
- **No animation budget per action, no return transition** (fight end, flee, defeat, retry). GFX G3,
  G13; UX F20; SND F19.
- **No audio spec**; "no melodic loops" with 30 to 60 min sessions; tells, Preparations, intents on the
  hero and rarity reveals need sound twins; audio logs vs "no voice acting". SND F1, F5, F6, F8, F18,
  F20, F24.
- **Gear on the board hero, cosmetics scope, Codex visuals, monsters as fauna vs shelled marbles,
  boss arenas moved off their decks.** ART F13 to F16, F21, F22, F25.

### 3.17 Network, PvP, battle royale (§4.7, §19, §20, §21)

- **Whose world decides a group encounter** and **whose clock** at fight start. NET F2, F4.
- **Who computes monster turns online** (every peer, with a node budget). NET F17; AI AIF-12.
- **No AFK or drop rule** in group combat; the PvP timer relies on an unbuilt claim mechanism. NET F7, F8.
- **Ranking needs a persistent identity** (Sybil keys); gated by the §19 Decision. NET F9.
- **Hidden PvP placement and loadouts** (commit-reveal). NET F5; UX F17.
- **BR order resolution, lobbies, shards; hub presence cap** (mesh of about 12). NET F10 to F12; GPL F54,
  F63.
- **Duel invitations have no channel; self-declared stats and level gates; last-revealer bias; void
  fight result.** NET F14 to F16, F18, F21.
- **v2 formats exceed the party size** (contested zones 8 to 16, two-scale BR): mark as spikes.
  NET F19.
- **Arena template gear level** and BR passive tree. SYS F30; TDS F18; ECO F19.

### 3.18 Roadmap and verification (§25, "Vérification")

- **R2 and R9 exits have no threshold** ("every class beats the reference pack"). OPS G16; BAL F4;
  QA F13 (see C15).
- **R3 "scripted 1 to 30"** does not say what the script does. QA F14.
- **R10 "e2e with 2 tabs"** leaves 3 and 4 players and multi-tile groups untested; CI cannot use public
  relays. QA F16; OPS G15.
- **"e2e green" is read on `main`** (e2e runs after merge, #239). OPS G8.
- **Retry under 5 s and unfold 1.2 s** need an engine-side measure on a named machine. OPS G12; QA F21.
- **`main` deploys to Pages**: half-built RPG screens would ship; keep the RPG behind a URL flag until
  R4. OPS G13; BAL O8.
- **MCP** consumes the bridge that changes every phase: a CI job before the bridge changes. OPS G14.
- **R1 needs art prerequisites** (#291 cyan core, #286). ART F26.
- **Boss attempt length** 8 to 15 min (§6.8) vs 5 to 12 min (`game-design.md` §8); targets in minutes
  need rounds or a seconds-per-turn assumption. BAL F5, F6.
- **HP regeneration** of 5 % per second makes HP carry-over meaningless. BAL F17.
- **Telemetry** only specified for bosses; say it is local and has no personal data. BAL F18.

---

## 4. Merged backlog (one PR per entry)

Rules for every entry: a `Task` issue, branch `<issue>-<slug>` from an up-to-date `main`, one PR with
`Closes #<task>`, strict TDD (test commit first), 100 % line and region coverage, local checks green,
one e2e run when a player sees it and a screenshot in the PR for any UI change (CONTRIBUTING §6.4,
§11). Every entry depends on #313 being decided; every R1+ entry also depends on the R0 spec file of
its domain. "From" lists the role Tasks merged into the entry. Dependencies use the ids of this
section; "—" means none beyond the rules above. New entries that no role wrote are marked **(gap)**.

### R0: the spec (docs-only PRs, merged by @TidyMaze)

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R0-01 | `rpg/README.md` | The RPG folder has one entry page with the locked decisions, pillars, glossary and names registry, deviation register, hidden-information list, numbers index and role map. | LEAD | LGD-01 | — |
| R0-02 | `rpg/roadmap.md` and review checklist | Phases R0 to R10 have exit criteria with thresholds, and every RPG docs PR follows one checklist. | LEAD | LGD-04 | R0-01 |
| R0-03 | `rules.md` §5 note, §10 intro, §10.5 "RPG combat" | `rules.md` holds the RPG combat rules and one numbered `R` series of exact examples. | LEAD, QA, SYS, GPL, LVL | LGD-02, QA-01, SYS-T1 (W1 to W14), GP-00, LD-01 (examples) | R0-01 |
| R0-04 | `rpg/combat.md` | The combat rules layer (turn, slots, ability language, statuses, death, victory, Edge danger, monster turn and intents) is written as spec. | GPL, UX, AI | GP-00, UX-01 (Edge danger), AI-00 | R0-03 |
| R0-05 | `rpg/stats.md` | The stat model, damage, heal, statuses and timers are written with their tags. | SYS | SYS-T1 | R0-03 |
| R0-06 | `rpg/classes.md` | The 8 class kits, 80 abilities with ranks, variants and counters are in English. | CMB | CD-01 | R0-04, R0-05 |
| R0-07 | `rpg/talents.md` | The active tree and the Five Paths, with budgets and gates, are in English. | CMB, SYS | CD-01, SYS-T2 (budgets) | R0-06 |
| R0-08 | `rpg/progression.md` | XP curve, kill XP, level bands, rested and unlocks are written. | SYS | SYS-T2 | R0-05 |
| R0-09 | `rpg/open-world.md` | Tiling, world map, travel, engagement, board generation and start zones are written. | LVL | LD-01 | R0-01 |
| R0-10 | `rpg/biomes.md` | The cell catalog (one rule and one glyph each) and the 10 biome tables are written. | LVL | LD-01 | R0-09 |
| R0-11 | `rpg/dungeons-bosses.md` | Monsters, packs, affixes, monster AI and bosses are written, with the ladder gates. | ENC, AI | EBD-T1, AI-00 | R0-04 |
| R0-12 | `rpg/quests.md` | Quests, journal, contracts, puzzles, Codex, factions, titles and tutorial are written. | NAR | NQD-T1 | R0-09 |
| R0-13 | `rpg/items.md` | Slots, bases, rarities, affixes, Aspects, sets, gems, durability and consumables are written. | ECO | ECO-01 | R0-05 |
| R0-14 | `rpg/economy.md` | Currencies, loot, prices, merchants, factions, trades and endgame economy are written. | ECO | ECO-01 | R0-13 |
| R0-15 | `rpg/gathering-crafting.md` | Gathering, refining and crafting are written. | ECO | ECO-01 | R0-13 |
| R0-16 | `rpg/pvp-br.md` **(gap)** | Duels, arenas, normalised templates and the RPG battle royale are written by the roles that implement them. | SYS, NET, GPL, LVL | none (C1) | R0-04 |
| R0-17 | `rpg/balance.md` and `rpg/playtest.md` | Every balance target, gate band and the playtest protocol are written with tags. | BAL | PBA-01 | R0-02 |
| R0-18 | `SPEC.md` and `game-design.md` deltas | The top-level specs point to the pivot without losing the classic modes. | LEAD | LGD-03 | R0-01 |
| R0-19 | `world.md` §1 to §4 lore delta | The setting, Tally's arc, lineages, factions and relocated boss hooks are written. | NAR | NQD-T2 | R0-01 |
| R0-20 | `world.md` §6 and `ui.md` RPG combat HUD | Diegetic vs flat information, layers, previews, frieze, bar and log are written. | UX | UX-01 | R0-19 |
| R0-21 | `world.md` §5, `art.md`, `ui.md` tokens: art direction | The Hollow surface, the palette law, marble looks and asset budgets are written. | ART, GFX | AD-01, GTA-01 (art.md rows) | R0-20 |
| R0-22 | `world.md` §8, `ui.md` §2 and §7, `tech.md` §5.1: accessibility | Redundancy families, photosensitivity, clear board, reduced motion and flat HUD parity are written. | A11Y | A11Y-01 | R0-21 |
| R0-23 | `world.md` §7 audio delta **(gap)** | The RPG sound grammar, buses, music states and mixer are written. | SND | none (SND F1) | R0-22 |
| R0-24 | `tech.md` §3 and §8: engine delta | Crates, determinism kit, hashes and save formats are written. | ENG | EA-00 | R0-01 |
| R0-25 | `tech.md` data and content chapter | The data folder, units, ids, integrity rules and content hash are written. | TDS | TD-01 | R0-24 |
| R0-26 | `tech.md` §5: rendering delta | Instanced layers, glyph atlas, unfold, VFX timeline and per-scene budgets are written. | GFX | GTA-01 | R0-25 |
| R0-27 | `tech.md` §10: CI and test plan | Check levels, tiers, budgets and the traceability table are written. | OPS, QA | DB-00, QA-02 | R0-26 |

### R1: minimal combat (93 entries)

Foundations, CI and data:

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R1-01 | Pin the Rust toolchain | CI and rustup users build with one exact Rust version. | OPS | DB-01 | — |
| R1-02 | CI sees every crate and `data/` | A change under any crate or `data/` reruns the Rust checks, e2e and the WASM build. | OPS | DB-02 | R1-01 |
| R1-03 | Classic perft baseline | `perft` exists and the standard and Belgian daisy counts are pinned before any push change. | LEAD, QA | LGD-05, QA-04 (pins) | — |
| R1-04 | Determinism kit and shared seeded generator | `abalone-core` has one `det.rs` (mix, seeds, streams, FNV-1a, bp maths) used by `hull.rs`, `ladder.rs` and every test generator. | ENG, QA | EA-01, QA-03 | — |
| R1-05 | Canonical encoder | `Enc` and `Canon` give byte-stable encodings for hashing. | ENG | EA-02 | R1-04 |
| R1-06 | Crate skeletons and determinism lints | `abalone-rpg` and `abalone-world` exist with `RULES_VERSION` and lints against `HashMap`, `DefaultHasher`, clocks and floats. | ENG, OPS | EA-03, DB-03, GP-01 (crate) | R1-01 |
| R1-07 | WASM build and size budget on every PR | A PR that breaks the wasm32 build or exceeds 500 KB gzip cannot merge. | OPS | DB-04 | R1-06 |
| R1-08 | `abalone-data` crate and loader | Embedded `data/` files load into sorted registries with file, line and column errors. | TDS, ENG | TD-02, EA-04 | R1-06 |
| R1-09 | Integrity harness | `cargo test` lists every data rule broken, with file and id. | TDS, OPS | TD-03, DB-07 | R1-08 |
| R1-10 | Content hash and `DATA_VERSION` | One 64-bit hash names the data set, equal on native and WASM. | TDS | TD-04, EA-04 | R1-08 |
| R1-11 | Text keys file | Every player-facing name comes from `data/text/en.json`, and a missing key fails. | TDS | TD-05 | R1-09 |
| R1-12 | Supply-chain check | A refused licence or a duplicate major version fails the `rust` job. | OPS | DB-08 | R1-08 |
| R1-13 | Constants registry with tags | Every rules number lives once in data with its tag, and FINAL values are pinned. | LEAD | LGD-08 | R1-09 |
| R1-14 | `Region` in `abalone-core` | Any board shape (hex 0 to 8, unions) exists with canonical order, depth and layers; classic `Board` untouched. | ENG, LVL | EA-05, LD-02 (region part) | R1-05 |
| R1-15 | `Arena`, unit traits, effective Weight | Units have ids, positions and a clamped Weight (sheet and Mud). | ENG, SYS | EA-06, SYS-T8 (R1 part) | R1-14 |
| R1-16 | Push predicate and generic weighted Movement | Classic and Weighted pushes resolve through one predicate, with `n > m` and strictly greater Weight. | ENG, SYS, LEAD | EA-07, SYS-T3, SYS-T4, LGD-10 | R1-03, R1-15 |
| R1-17 | Weighted equals Classic suite | Weighted with every Weight 1 equals Classic on perft, random positions and random games. | QA, LEAD | LGD-06, QA-04 | R1-16 |
| R1-18 | Nightly deep Rust tests | `#[ignore]` tiers run nightly in release mode and a failure opens a `bug`. | OPS | DB-06 | R1-17 |

Combat rules:

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R1-19 | `CombatState`, ids, state hash | `Unit`, `Entity`, `CombatState` exist with a stable FNV-1a state hash. | GPL, ENG | GP-01, EA-08 (hash) | R1-05, R1-06 |
| R1-20 | Combat setup | A `CombatSetup` builds a valid state or a named `SetupError`. | GPL | GP-02 | R1-14, R1-19 |
| R1-21 | Start zones and formations, solo formats | Every solo format has a start zone and three formations. | LVL | LD-03 | R1-14 |
| R1-22 | Turn loop, slots, mandatory Movement | Entities alternate with Move, Action and Quick slots; End turn is refused while a Movement is legal. | GPL | GP-03 | R1-20 |
| R1-23 | Movement through the weighted push | A Movement uses the core push with combat Weights, and an ejection is a Loss. | GPL | GP-04 | R1-16, R1-22 |
| R1-24 | Stat block and level growth | Hero, class and Fragment stat blocks come from data at any level. | SYS | SYS-T5 | R1-08 |
| R1-25 | Damage, Choc, position modifiers, Guard | Hits and Chocs follow §6.5 with Isolation, Formation, level gap, the bucket clamp and the per-action Guard. | SYS, GPL | SYS-T6, GP-05 | R1-23, R1-24 |
| R1-26 | Death, Remains, Graveyard, atomic loop | A unit at 0 HP disappears at once, leaves Remains and enters the Graveyard. | GPL | GP-06 | R1-25 |
| R1-27 | Victory, draws, repetition key | A fight ends on hero death, rout, leader death, the no-Loss draw (rounds) or repetition. | GPL, ENG | GP-07, EA-13 | R1-26 |
| R1-28 | Resource engine and Rage | Resources gain, spend, decay and reset by data, and Rage follows §8.2. | CMB, GPL, SYS | CD-03, GP-08, SYS-T7 (resources) | R1-22 |
| R1-29 | Kit schema v1 and Warrior R1 data | The Warrior, Rage, the squad, Charge and Fendoir exist as data and pass the R1 rules. | CMB, TDS | CD-02, TD-06 | R1-09 |
| R1-30 | Casting: costs, cooldowns, legal casts, Damage primitive | `legal_casts` decides every cast; cooldowns block exactly N own turns. | GPL, CMB, SYS | CD-04, GP-09, SYS-T7 (cooldowns) | R1-28, R1-29 |
| R1-31 | Self displacement and Charge | Charge moves the hero up to 2 cells and Chocs the enemy behind without pushing it. | GPL | GP-10 | R1-30 |
| R1-32 | Warrior R1 kit | Charge, Fendoir, Élan and the squad bonus work as specified. | CMB | CD-05 | R1-31 |
| R1-33 | Edge danger and preview, R1 | Before confirm, the engine says what an action does and which heroes can be ejected next turn. | GPL, UX | GP-11 | R1-23, R1-30 |
| R1-34 | Combat log, setup hash, replay | The same setup and log always replay to the same hashes; an altered log fails at its index. | ENG, GPL | EA-08, GP-12 (replay) | R1-27 |
| R1-35 | Scenario format, runner, doc sync | `.scn` files run as tests, and `rules.md` examples and files cannot drift. | GPL, TDS, LEAD | GP-12 (notation), TD-07, LGD-07 | R0-03, R1-23 |
| R1-36 | R1 rule scenarios | The R1 examples of §10.5 run as scenario files in the required check. | QA | QA-05 | R1-32, R1-35 |
| R1-37 | Hash coverage test | Every combat state field changes the hash, and a new field needs a mutator. | QA | QA-07 | R1-19 |
| R1-38 | Random fight invariant suite | Seeded random R1 fights keep the core invariants (one ejection, hero death, same log same hash). | QA | QA-06 | R1-27 |
| R1-39 | Combat JSON contract v1 | The bridge returns a versioned `CombatView`, legal actions and `Effects`. | GPL | GP-13 | R1-33 |
| R1-40 | Content view on the bridge | The action bar reads names, costs and cooldowns from data. | TDS | TD-08 | R1-29, R1-39 |

Monsters, AI and balance:

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R1-41 | Monster stat builder | Brute and Rôdeur get integer stats at any level and rarity. | ENC | EBD-T2 | R1-24 |
| R1-42 | Skirmish pack generator | A tile seed gives the same pack of 4 to 7 balls inside its threat budget. | ENC | EBD-T3 | R1-21, R1-41 |
| R1-43 | Pack leader, flight and rout | Killing the leader makes the pack flee; half the pack lost routs it. | ENC, GPL | EBD-T4 | R1-27, R1-42 |
| R1-44 | Generic search over `SearchState` | `search.rs` runs on any state with repeating camps, and classic results are unchanged. | AI | AI-01 | — |
| R1-45 | Classic bosses searched with their hooks | The classic ladder player sees every boss hook in its tree. | AI | AI-02 | R1-44 |
| R1-46 | Combat as a search state | The search explores one entity turn per ply with every rule inside the tree. | AI | AI-03 | R1-27, R1-44 |
| R1-47 | Combat evaluation v1 | A position gets an integer score with hero safety, rout pressure and shape terms. | AI | AI-04 | R1-33, R1-46 |
| R1-48 | Monster turn planner and priority lists | A pack plays a legal turn from its data priority list within its node budget. | AI, ENC | AI-05, EBD-T5 (priorities) | R1-42, R1-47 |
| R1-49 | Monster intents | Monsters announce their next major ability and target one turn ahead, cast or fizzle. | AI, ENC | AI-09, EBD-T5 (intents) | R1-48 |
| R1-50 | Player bot v1 and Warrior rotation | A bot plays the R1 Warrior from `warrior.ron` and keeps its hero out of Edge danger when it can. | AI, CMB | AI-06, CD-06 | R1-32, R1-47 |
| R1-51 | Fight telemetry record | Every RPG fight produces one integer-only `FightRecord` JSON line from `Effects`. | BAL | PBA-02 | R1-39 |
| R1-52 | Balance crate | Records become a byte-stable report with gate verdicts and an exit code. | BAL | PBA-03 | R1-51 |
| R1-53 | Ladder scenario and gate data | The ladder matrix and gates live in data and a bad reference fails. | BAL | PBA-04 | R1-09, R1-52 |
| R1-54 | RPG ladder v1 and golden logs | `rpg_ladder` plays the R1 matrix, checks replays and writes fixtures and golden logs. | AI, BAL | AI-07, PBA-05 | R1-50, R1-53 |
| R1-55 | Cross-target golden logs | Every golden log gives the same hash natively, in wasm32 and in three browsers. | NET, OPS | NP-01, DB-05 | R1-07, R1-34, R1-54 |

Client, interface, accessibility, sound:

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R1-56 | Instanced board layers, classic | The current board draws instanced layers with no visible change and about 25 draw calls. | GFX | GTA-02 | — |
| R1-57 | Region-aware board and camera | The board renders any cell mask from radius 3 to 8 and unions. | GFX | GTA-03 | R1-14, R1-56 |
| R1-58 | RPG combat scene wiring and test hooks **(gap)** | The client starts an R1 fight through the bridge (`window.__rpgStart`), plays actions and replays `Effects`, behind the `?rpg` flag if owners decide so. | GFX, UX | GP-13 and DB-09 pairing | R1-39, R1-57 |
| R1-59 | RPG e2e harness and tags | RPG specs start a fixed fight from a scenario with a fixed clock and reduced motion. | OPS | DB-09 | R1-58 |
| R1-60 | Perf harness and stress scenes | CI fails when a scene passes its draw-call or triangle budget. | GFX | GTA-07 | R1-57 |
| R1-61 | Palette module, law and contrast checks | Every client colour comes from one palette, checked for the palette law, contrast and colour-vision distance. | ART, A11Y | AD-02, A11Y-03 | — |
| R1-62 | Glyph catalog and RPG strings | One catalog gives every R1 glyph an id, meaning, label and tone, with integrity tests. | UX | UX-03 | R1-61 |
| R1-63 | Glyph shapes and SDF atlas | Polygon shapes generate one SDF atlas and an instanced glyph layer, crisp at 720p and 200 %. | ART, GFX | AD-03, GTA-04 | R1-62 |
| R1-64 | Hero, Fragment and R1 monster looks | The hero is banded glass with a cyan core, Fragments faceted glass, the 2 monsters crested shells. | ART | AD-04 | #291, R1-57 |
| R1-65 | Marble overlays | Every unit shows camp, HP and shield arcs, Weight pips and the hero mark, one draw call per layer. | GFX, UX, ART | GTA-05, UX-04, AD-05 | R1-58, R1-63 |
| R1-66 | VFX timeline v1 | Shock, numbers, the 400 ms crumble with Remains and the hero ejection play as a skippable timeline before the banner. | GFX, ART | GTA-06, AD-06 | R1-65 |
| R1-67 | The pack plays in the browser | The pack's turn is planned in the bot worker and played on screen within 3 s. | AI | AI-08 | R1-48, R1-58 |
| R1-68 | Keyboard move input, classic board | A full classic game can be played with the keyboard only. | UX | UX-02 | — |
| R1-69 | Push preview line | Hovering a push shows "2 vs 1 · Weight 4 vs 3", and an illegal push says why. | UX | UX-05 | R1-58 |
| R1-70 | Damage, Shock and ejection preview | Before confirm the player sees exact damage, kills and the one ejection from the dry run. | UX | UX-06 | R1-33, R1-58 |
| R1-71 | Edge danger alert | The hero carries a steady Edge danger glyph whenever the next opposing entity could eject it. | UX | UX-07 | R1-33, R1-63 |
| R1-72 | Flat action bar and end of turn | Abilities, Rage, cooldowns, slot lamps and End turn work by mouse, keys and touch. | UX | UX-08 | R1-30, R1-58 |
| R1-73 | Targeting and ability card | Arming, previewing and confirming an ability is one reducer, and each ability has a card with its counter. | UX | UX-09 | R1-40, R1-72 |
| R1-74 | Monster intent display and combat log | Each monster shows its intent and target, and every event goes to a live log. | UX | UX-10 | R1-49, R1-58 |
| R1-75 | Frieze, rout tallies, end banner, retry | The player sees whose turn is next, Losses against thresholds, and an end banner with a Tally line; retry in under 5 s. | UX, NAR | UX-11, NQD-T3 | R1-66 |
| R1-76 | Flat HUD and screen-reader mirror | Every R1 combat fact is readable on flat plates, and the same DOM is the screen-reader mirror when off. | UX, A11Y | UX-12, A11Y-08 | R1-72, R1-74 |
| R1-77 | Accessibility settings store | Safe mode, reduced motion, flat HUD and UI scale join the settings and survive a reload. | A11Y | A11Y-02 | — |
| R1-78 | Redundancy integrity, R1 families | Camp, unit kind, threat, HP and Weight each have a glyph and a label, enforced by a test. | A11Y | A11Y-04 | R1-62 |
| R1-79 | Clear board for RPG fights | Clear board removes haze and particles and keeps every information layer. | A11Y, GFX | A11Y-05 | R1-65, R1-77 |
| R1-80 | Reduced-motion catalogue, R1 | Every R1 animation has a reduced variant from one catalogue. | A11Y | A11Y-06 | R1-66, R1-77 |
| R1-81 | Flash analyser and safe mode | An analyser proves the R1 fight never breaks the 3-flashes rule; safe mode is on at first launch. | A11Y, GFX | A11Y-07 | R1-66, R1-77 |
| R1-82 | Audio graph | One audio graph with buses, a limiter and a master mute; classic sounds unchanged. | SND | SND-01 | — |
| R1-83 | Cue patches as data | Every sound is a data patch checked by an integrity test. | SND | SND-02 | R1-82 |
| R1-84 | Voice scheduler | Cues are merged, capped and varied by a pure seeded scheduler. | SND | SND-03 | R1-83 |
| R1-85 | Combat cue map | Moves, weighted pushes, hits, deaths and ejections sound, glass for my camp and shell for the other. | SND | SND-04 | R1-58, R1-84 |
| R1-86 | Turn, Warrior kit, Edge danger and end cues | The turn, Rage, the 2 abilities, Edge danger, Guard, hero death and end stingers sound. | SND | SND-05 | R1-71, R1-85 |
| R1-87 | Combat music v1 | A drone, pulse and tension layer follow Losses, hero HP, Edge danger and tells. | SND | SND-06 | R1-85 |

Playtest, exit and optional CI:

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R1-88 | Client telemetry store and export | A player exports a local playtest log of RPG fights from the settings. | BAL | PBA-06 | R1-51, R1-58 |
| R1-89 | Playtest report tool and R1 round | Exports give a report with human metrics, and the R1 round with 5 testers is reported. | BAL | PBA-07 | R1-88 |
| R1-90 | R1 exit e2e | Preview, push, Edge danger, hero death, abilities and a won fight are proved in Chromium. | QA | QA-08 | R1-59, R1-67, R1-71, R1-75 |
| R1-91 | R1 exit review | R1 closes with its criteria ticked, the first turn time and the ladder table. | LEAD | LGD-12 | R1-55, R1-89, R1-90 |
| R1-92 | MCP tests on `main` CI (after a Decision) | A bridge change that breaks the MCP server turns `main` red the same day. | OPS | DB-10 | R1-07 |
| R1-93 | Client unit tests and `tsc` in CI (after a Decision) | `bun run test` and `tsc` run on every ready PR. | OPS | DB-11 | — |

### R2: four classes, statuses, six cell types (61 entries)

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R2-01 | Terrain layer and cell catalog | Boards carry terrain with base, overlay and clocks, hashed in canonical order, from typed data with glyph ids. | ENG, LVL, TDS | EA-09, LD-04, TD-10 | R1-15 |
| R2-02 | Terrain-aware push | Rock, Chasm, Mud (+1 Weight, no broadside) and Slope act on pushes; all-1 still equals Classic. | ENG, LVL | EA-10, LD-05 (Rock, Chasm), LD-06 (Mud) | R2-01 |
| R2-03 | Ice slide and shove | Pushed units slide front first under one shared ejection budget; `shove` gives forced moves. | ENG, LVL | EA-11, LD-05 (slide) | R2-02 |
| R2-04 | Geometry helpers | Rays, disks, rings, fixed order and edge helpers exist with one example each. | ENG | EA-12 | R1-14 |
| R2-05 | Avalanche 4-ball group | A 4-ball inline group works for the one Movement Avalanche grants. | ENG | EA-14 | R1-16 |
| R2-06 | Status and keyword schema | Statuses and keywords are data with DR categories and duration clocks. | TDS | TD-09 | R1-09 |
| R2-07 | Status engine | Statuses apply, tick on the right clock (`fresh` rule), stack and respect DR and Tenacity. | GPL, SYS | GP-14, SYS-T9 | R1-22, R2-06 |
| R2-08 | Unmovable, Unejectable, Lassitude | The keywords block pushes and ejections inside Movements, abilities and terrain. | GPL | GP-15 | R2-07 |
| R2-09 | Damage pipeline, heal, shield, DoT, routing | Damage goes through redirects, links, shields, Guard and lifesteal in one fixed order; heals follow §6.5. | GPL, SYS, CMB | GP-16, SYS-T10, CD-09 | R2-07 |
| R2-10 | Combat modifiers from terrain, biome, statuses | Cell, status and biome effects become bucket entries in one place. | SYS | SYS-T11 | R2-01, R2-07 |
| R2-11 | Forced displacement and ejection budget | Abilities push, pull, teleport and swap, and an action never ejects more than one unit (triggers included). | GPL | GP-17 | R2-03, R2-04 |
| R2-12 | Multi-target targeting | Zone, line, group and board targets resolve in the fixed order with the mass control cap. | GPL | GP-18 | R2-04 |
| R2-13 | Stat, Resource, Turn primitives and push modifiers | Abilities change Weight and stats, grant the one bonus Step, and modify the own Movement (Percée, Bélier, Avalanche, Titan, Écrasement). | GPL, CMB | GP-19, CD-07 | R2-05, R2-11 |
| R2-14 | Marks, tells, channels | Delayed effects are public tells that fire on time, and channels break on movement. | GPL | GP-20 | R2-12 |
| R2-15 | Preparations | Preparations arm in the Quick slot and fire in the opposing turn, at most 2, never chained. | GPL | GP-21 | R2-14 |
| R2-16 | Passive triggers, R2 class traits | Class traits run from data through one dispatcher with a depth cap. | GPL | GP-22 | R2-07 |
| R2-17 | Terrain primitive and the six R2 cell rules | Abilities create timed cells; Rock, Chasm, Ice, Mud, Lava and Sanctuary act in the turn. | GPL, LVL | GP-23, LD-06 (Lava, Sanctuary) | R2-02, R2-14 |
| R2-18 | Mage Overheat and reactions | The second spell of a turn costs more and element markers react, separate from Frozen. | GPL, CMB | GP-24, CD-14 | R2-07 |
| R2-19 | Attrition, Breach, Flight | Long fights end by Attrition and the Breach on any region, and a player can flee. | GPL | GP-25 | R2-17 |
| R2-20 | Edge danger, R2 threat set | The alert also sees push modifiers and Ejector abilities the opponent can use. | GPL | GP-26 | R2-13 |
| R2-21 | Ability language v2 schema | Every primitive, trigger, passive and patch parses and validates, with the hook registry. | TDS | TD-11 | R2-06 |
| R2-22 | Class schema for the R2 classes | Guardian, Warrior, Mage and Healer files validate. | TDS | TD-12 | R2-21 |
| R2-23 | Ability data validators | Data that breaks the §24.3 rules is refused, one failing fixture per check. | GPL, TDS | GP-27 | R2-21 |
| R2-24 | Content CLI | An author gets every issue and an ASCII view of a scenario in one command. | TDS | TD-13 | R2-21 |
| R2-25 | Board generator v1 | A seed, a biome table and a format give a valid board, with a fallback. | LVL | LD-07 | R1-21, R2-01 |
| R2-26 | Warrior Brute branch | Tourbillon, Peau de fer, Écrasement, Exécution and Titan work. | CMB | CD-08 | R2-13 |
| R2-27 | Guardian Bastion branch | Rempart, Sentinelle, the Bastion abilities and Forteresse work. | CMB | CD-10 | R2-08, R2-09 |
| R2-28 | Guardian Reprisal branch and Séisme du Lest | Reprisal abilities and the ultimate work, with farthest-first recoil. | CMB | CD-11 | R2-11, R2-27 |
| R2-29 | Healer Restoration branch and Aube | Heals, overheal shield, Grâce, Source and Aube work. | CMB | CD-12 | R2-09 |
| R2-30 | Healer Discipline branch and Martyr | Transfert, Éblouissement, Lien vital, Halo and Martyr work. | CMB | CD-13 | R2-29 |
| R2-31 | Mage Fire and Lightning, Météore | Trait de feu, Clignement, Chaîne d'éclairs, Mur de flammes and Météore work. | CMB | CD-15 | R2-14, R2-18 |
| R2-32 | Mage Frost and Arcane, Zéro absolu | Lance de glace, Bouclier de mana, Nova, Sol verglacé and Zéro absolu work. | CMB | CD-16 | R2-17, R2-18 |
| R2-33 | All 8 monster archetypes | The 8 archetypes fight with their abilities from data, each with a counter. | ENC | EBD-T6 | R2-12 |
| R2-34 | Reference packs per class | Each R2 class has a fixed reference pack, heavy archetypes included. | ENC | EBD-T7 | R2-33 |
| R2-35 | AI evaluation v2 | The AI avoids harmful terrain and told zones and values statuses and threats. | AI | AI-10 | R2-07, R2-17 |
| R2-36 | Full conditions and selectors, 4 class rotations | The four R2 class bots play their rotations with every condition and selector. | AI, CMB | AI-11, CD-17 (rotations) | R2-26 to R2-32, R2-35 |
| R2-37 | AI picks | Ejector choices, mass control, zones, directions and pre-move modifiers follow written rules. | AI | AI-12 | R2-11, R2-13 |
| R2-38 | R2 class ladder and anti-stall gates | Each R2 class is measured against its pack and the R2 exit criterion is a gate; R2 playtest reported. | BAL, CMB | PBA-08, CD-17 (ladder) | R2-34, R2-36 |
| R2-39 | Nightly RPG ladder job | Each night every class is measured and a run below its gate opens an issue. | OPS | DB-12 | R2-38 |
| R2-40 | Terrain and status scenarios | The R2 terrain and status examples run as scenario files. | QA | QA-09 | R2-08, R2-17 |
| R2-41 | Ability-aware and design invariant suites | Random R2 fights never break D4, D5, D7 or the Guard cap. | QA, LEAD | QA-10, LGD-11 | R2-15, R2-19 |
| R2-42 | Negative data fixtures and tuning snapshots | Each integrity rule is proved to fire and every tuning change shows in a diff. | QA | QA-11 | R2-23 |
| R2-43 | Glossary and naming lint | Code enums, content names and the README glossary stay in sync with no collision. | LEAD | LGD-09 | R2-22 |
| R2-44 | Terrain decals, six R2 cells | The six R2 cells render their glyph decal, tint and motion, static in reduced motion. | ART, GFX | AD-07, GTA-08 | R1-63 |
| R2-45 | Tells, countdown ticks, terrain-change tracks | One generic tell layer replaces the Hull-only code; the Hull looks the same. | GFX | GTA-09 | R2-44 |
| R2-46 | Status, keyword and element glyphs and overlays | Every status, keyword and element marker has a unique glyph; Frozen and Stasis change the marble. | ART, A11Y | AD-08, A11Y-10 | R1-63, R2-06 |
| R2-47 | Statuses, intents and Preparations on the board | The top glyph slot, intent lines and armed Preparations render. | GFX | GTA-11 | R2-46 |
| R2-48 | Inspect panel and DR display | Statuses show turns, stacks and immunity windows in an inspect panel. | UX | UX-13 | R2-46 |
| R2-49 | VFX grammar, recipes, flash budget | Every R2 ability plays its primitive's verb in its element's tone and passes the flash analyser. | ART, GFX, A11Y | AD-09, GTA-10, A11Y-11 | R1-81, R2-26 to R2-32 |
| R2-50 | Lineage bands, R2 heroes | The 4 R2 heroes differ by band material and glyph. | ART | AD-10 | R1-64 |
| R2-51 | Composed ability icons | Every R2 ability has a distinct icon generated from its data. | ART | AD-11 | R2-22 |
| R2-52 | Terrain countdowns, ice slide preview, board rules | Timed cells show their turns and an ice slide is previewed cell by cell. | UX | UX-14 | R2-03, R2-44 |
| R2-53 | Multi-pick targeting and Preparations display | Ejector choices, picks up to 3 and armed Preparations are clear. | UX | UX-15 | R2-15 |
| R2-54 | Class gauges and threat range | The 4 R2 resources show, and hovering an enemy hero outlines its reach. | UX | UX-16 | R2-27 to R2-32 |
| R2-55 | Engraved action bar and flat bar setting | The bar is engraved on the frame; the flat bar stays a setting and the phone default. | UX | UX-17 | R1-72 |
| R2-56 | Colourblind and high-contrast palettes | Five palettes switch page and scene and pass their checks. | A11Y | A11Y-09 | R1-61 |
| R2-57 | Flat HUD for R2 families | Every R2 diegetic fact has a flat twin. | A11Y | A11Y-12 | R1-76, R2-55 |
| R2-58 | R2 classes in the browser | The 4 R2 classes and the Edge danger alert are proved by Playwright. | QA, CMB | CD-17 (Playwright) | R2-36, R2-54 |
| R2-59 | Element and R2 class cues | R2 abilities, resources and ultimates have cast and impact cues. | SND | SND-07 | R2-22 |
| R2-60 | Status and reaction cues | Statuses sound on and off, DoTs tick, reactions burst. | SND | SND-08 | R2-07 |
| R2-61 | Terrain and tell sound twins | The R2 cells and every tell have their sound twins. | SND | SND-09 | R2-17 |

### R3: progression (30 entries)

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R3-01 | XP curve and level-up | Heroes gain XP with gap factors, level up to 100 and get their points. | SYS | SYS-T12 | R1-24 |
| R3-02 | Talent data and budget proofs | The 99 and 20 point budgets, gates and the shard cap are proven from data. | TDS | TD-14 | R2-21 |
| R3-03 | Progression data and generated stats table | XP constants and unlocks are data and the §7.2 table is generated. | TDS | TD-15 | R3-02 |
| R3-04 | Passive tree validation | Any passive allocation is accepted or refused with the first broken rule. | SYS, CMB | SYS-T13, CD-22 | R3-02 |
| R3-05 | Active tree validation and equip rules | Any active allocation and loadout is accepted or refused. | SYS, CMB | SYS-T14, CD-18 | R3-02 |
| R3-06 | Ranks, variants and kit compilation | Rank and variant patches compile into a hashed `CompiledKit` that the combat reads resolved. | CMB, GPL | CD-19, GP-28 (resolved abilities) | R3-05 |
| R3-07 | R2 and R3 data: Guardian and Warrior | The 20 abilities have R2 and both variants with scenarios. | CMB | CD-20 | R3-06 |
| R3-08 | R2 and R3 data: Healer and Mage | Same for the Healer and the Mage. | CMB | CD-21 | R3-06 |
| R3-09 | Passive trigger engine and shards | Keystones, runes and shards run from data with rank scaling. | CMB, GPL | CD-23, GP-28 (keystones) | R2-16, R3-04 |
| R3-10 | Precision Path | Its 4 keystones and 9 runes work in combat. | CMB | CD-24 | R3-09 |
| R3-11 | Resolve Path | Its 4 keystones and 9 runes work in combat. | CMB | CD-25 | R3-09 |
| R3-12 | Pionnier placement and Grimoire swap | Pionnier terrain and the Grimoire swap work in combat. | GPL | GP-28 (rest) | R3-09 |
| R3-13 | Hero save envelope and migrations | The hero save decodes, validates, migrates and encodes in canonical text. | ENG | EA-15 | R1-10 |
| R3-14 | Id aliases for saves | A renamed id still loads from an old save. | TDS | TD-16 | R3-13 |
| R3-15 | Monster level and level bands | Monsters take the tile or group level and show a band glyph. | ENC | EBD-T8 | R3-01 |
| R3-16 | Quest engine core | A quest runs from acceptance to turn-in from data as a pure state machine. | NAR | NQD-T4 | R1-08 |
| R3-17 | `WorldEvent` contract and quest integrity | One event enum exists and quest data is checked for references, cycles and reachability. | NAR | NQD-T5 | R3-16 |
| R3-18 | Quest grant | A turn-in grants integer XP, gold and reputation; grey quests give no XP. | NAR, SYS | NQD-T6 | R3-01, R3-16 |
| R3-19 | Lineage and NPC data | The 8 lineages and their mentors are data checked against the class list. | NAR | NQD-T7 | R1-11 |
| R3-20 | Tutorial lesson engine and step machine | The lessons (Weight and Edge danger included) are data, with goal detection and progressive disclosure. | NAR, UX | NQD-T8, UX-18 | R1-39 |
| R3-21 | Tutorial in the browser | A new hero plays the lessons and reaches level 5. | NAR, UX | NQD-T9 | R3-13, R3-20 |
| R3-22 | Lineage trial | At level 5 an R2 class takes the trial and picks a tier-1 ability. | NAR, CMB | NQD-T10 | R3-05, R3-21 |
| R3-23 | Window shell and glyph legend | Every window shares one accessible shell, and `H` opens the legend. | UX | UX-19 | R1-62 |
| R3-24 | Hero sheet, Paths and active tree windows **(gap)** | The player spends points in the Paths and the active tree and reads the hero sheet. | UX, GFX | CD-25 (e2e) | R3-04, R3-05, R3-23 |
| R3-25 | Accessibility at the title screen | A new player meets the settings before character creation, safe mode on. | A11Y | A11Y-13 | R1-77 |
| R3-26 | Progression and tutorial cues | XP, level up, points, trial and tutorial steps have UI cues. | SND | SND-10 | R3-21 |
| R3-27 | Pacing model and session events | Time to levels 10, 30, 60 and 100 is computed and session events are tracked. | BAL | PBA-09 | R3-01 |
| R3-28 | Level-gap curve and skill-over-stats | The tier bands and pillar 3 have measured values at levels 10 and 30. | BAL, LEAD | PBA-10, LGD-13 | R1-54, R3-15 |
| R3-29 | Progression budgets and scripted 1 to 30 | Budgets hold at every level and a scripted hero reaches 30 through real XP sources. | QA, SYS | QA-12, SYS-T15 | R3-04, R3-05, R3-18 |
| R3-30 | R3 exit e2e | Level up, spending a point and reload are proved in the browser. | QA | QA-13 | R3-21, R3-24 |

### R4: world v1 (38 entries)

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R4-01 | Tile lattice | World tiles map to combat cells and back, with stable tile seeds (in `abalone-core`). | ENG, LVL | EA-17, LD-08 | R1-14 |
| R4-02 | Time helpers | UTC day, ISO week, slots and day phase are pure functions equal to `daily.ts`. | ENG | EA-18 | R1-04 |
| R4-03 | Biome and world parameter schema | The 3 v1 biomes and world parameters load and their weights sum. | TDS | TD-17 | R1-09 |
| R4-04 | World map: zones, biomes, levels | The pinned world has 10 zones and the hub, with zones 1 to 3 open. | LVL | LD-09 | R4-01, R4-03 |
| R4-05 | Tile content and landmarks | Every open tile has deterministic content, safe zones and Beacons. | LVL | LD-10 | R4-04 |
| R4-06 | World travel, fog and world formulas | The ball walks by A* with biome step times, ice slides, fog, regen and rested pool. | LVL, SYS | LD-11, SYS-T16 | R4-05 |
| R4-07 | Packs on the map and engagement | Packs patrol as a pure function of time, ambush or get engaged, and name the tile to unfold. | LVL | LD-12 | R4-02, R4-06 |
| R4-08 | Three biomes in fights | Lumen, Sylve and Tourbières tiles unfold into their boards with Fourré, Ronces, Eau and their modifiers. | LVL, GPL | LD-13, GP-31 | R2-25, R4-04 |
| R4-09 | Biome rules in class kits | Affinity, range, duration and damage modifiers apply by biome. | CMB | CD-26 | R4-08 |
| R4-10 | Placement, initiative and world outcome | A fight from a tile places by formation, plays in order and returns an outcome. | GPL | GP-29 | R4-07 |
| R4-11 | AI placement and formation choice | Bots and packs pick a formation by evaluation. | AI | AI-13 | R4-10 |
| R4-12 | Combat save and resume | A fight survives a reload by replay, or becomes a penalty-free retreat. | ENG, GPL | EA-16, GP-30 | R1-34, R3-13 |
| R4-13 | World flags and world version reset | Discovery, Beacons and cleared packs survive a reload; a new world version resets them, keeps the hero. | LVL, ENG | LD-14, EA-19 | R3-13, R4-06 |
| R4-14 | Biome families, 3 biomes | Lumen, Sylve and Tourbières spawn their families from data. | ENC | EBD-T9 | R2-33, R4-04 |
| R4-15 | Elite and Champion formats | Elite tiles spawn one Elite or a Champion pack inside the budget. | ENC | EBD-T10 | R4-14 |
| R4-16 | Elite affixes, stat group | Blindé, Massif, Vampirique and Bouclier work. | ENC | EBD-T11 | R4-15 |
| R4-17 | Elite affixes, behaviour group | The 8 behaviour affixes work with their exclusions. | ENC | EBD-T12 | R4-16 |
| R4-18 | World map renderer | The world draws a tile window with biome tints, unexplored state, props and markers. | GFX, ART | GTA-12, AD-13 | R4-04 |
| R4-19 | Hero travel, packs and Beacons on the map | The hero ball rolls at the step times, slides on ice, teleports at Beacons. | GFX | GTA-13 | R4-06, R4-18 |
| R4-20 | Tile-to-board unfold and fold back | Engaging unfolds the tile in about 1.2 s (a 300 ms cross-fade in reduced motion), skippable, and folds back after. | GFX, ART, UX | GTA-14, AD-15, UX-20 (unfold) | R4-10, R4-19 |
| R4-21 | Three biome looks | The 3 R4 biomes have their palette, textures and light, lazily loaded within budget. | GFX, ART | GTA-15, AD-12 | R4-08 |
| R4-22 | Map view | Key M shows all tiles with fog states, zone borders and markers. | GFX | GTA-16 | R4-18 |
| R4-23 | Monster crests, rarity bands, affix marks, tiers | Every archetype, rarity, leader, affix and level band reads by shape. | ART | AD-14 | R4-17 |
| R4-24 | Minimal hub and outpost looks **(gap for the hub scene)** | The minimal hub reuses the deck looks per room, the Mess keeps the classic tables, outposts show props. | ART, GFX | AD-16 | R4-05 |
| R4-25 | World readability | Path and time, aggro, tier glyphs and % discovered read on the world. | UX | UX-20 | R4-19 |
| R4-26 | World map accessibility | Unexplored tiles, tiers, unfold and camera respect the a11y settings; a flat world panel exists. | A11Y | A11Y-14 | R4-25 |
| R4-27 | Map markers and NPC placement | Quest givers show a glyph and colour marker that follows the quest state. | NAR | NQD-T11 | R3-16, R4-18 |
| R4-28 | Exploration quest, zone 1 | 100 % discovered in Lumen grants a title. | NAR | NQD-T12 | R3-17, R4-06 |
| R4-29 | Biome beds and world steps | Walking through the 3 biomes sounds different, with steps paced by the biome cost. | SND | SND-11 | R4-06 |
| R4-30 | Unfold, engagement and exploration music | The unfold has its sound and the music moves from explore to threat to combat. | SND | SND-12 | R4-20 |
| R4-31 | Hub beds | The hub has room beds and point sources; the Mess keeps its sound. | SND | SND-13 | R4-24 |
| R4-32 | Mixer sliders, mono, captions | The settings have bus sliders, a mono switch and captions. | SND, UX | SND-14 | R1-82 |
| R4-33 | Dist size budget | The Pages build fails above 5 MB gzip. | OPS | DB-13 | — |
| R4-34 | World determinism in wasm32 | The world golden summary hashes the same in wasm32 and natively. | OPS | DB-14 | R1-55, R4-04 |
| R4-35 | World invariants | World generation, tiling, start cells, A* and fog are proved. | QA | QA-14 | R4-07 |
| R4-36 | World session metrics and R4 playtest | Fights per hour, walking time, deaths and returns are measured. | BAL | PBA-11 | R4-20 |
| R4-37 | R4 exit e2e | Walk, fight, come back and reload are proved in the browser. | QA | QA-15 | R4-12, R4-13, R4-20 |
| R4-38 | Mess non-regression e2e | The classic hot-seat and a classic boss start from the Mess and play as before. | LEAD | LGD-14 | R4-24 |

### R5: loot, inventory, merchants, gold (21 entries)

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R5-01 | Economy RNG stream tags | Loot, craft and vendor draws use tagged streams of the shared kit with pinned values. | ECO | ECO-02 (reduced, C12) | R1-04, R4-02 |
| R5-02 | Wallet and currencies | Gold and the other currencies are earned and spent with saturating rules. | ECO | ECO-03 | R5-01 |
| R5-03 | Item schema, bases, rarities | Items exist as data and instances; malformed items are refused with a reason. | ECO, TDS | ECO-04, TD-18 | R1-09 |
| R5-04 | Affixes, generation, gear in the sheet | `roll_item` makes valid items and gear stats feed the hero sheet with every cap. | ECO, SYS | ECO-05, SYS-T17 | R5-03 |
| R5-05 | Inventory, binding, stash | Items move between bag, equipment and stash; nothing Rare+ is lost on a full bag. | ECO | ECO-06 | R5-03 |
| R5-06 | Loot table schema | Loot tables load, nest without cycles, and print their expected value. | TDS | TD-19 | R5-03 |
| R5-07 | Fight loot and personal seeds | A won fight returns a reproducible grant from the fight report and a per-hero fight counter. | ECO | ECO-07 | R1-51, R5-01, R5-06 |
| R5-08 | Prices, durability, repair, economy bridge | Items have values, wear and repair, and the client runs any economy op through one call. | ECO | ECO-08 | R5-05 |
| R5-09 | Merchant and currency data | Merchants and currencies are data that reference real items. | TDS | TD-20 | R5-03 |
| R5-10 | Merchants | The Quartermaster and the Blacksmith buy, sell, buy back, repair and salvage. | ECO | ECO-09 | R5-08, R5-09 |
| R5-11 | Item patches on abilities | Aspects, set bonuses, "+1 range" and "+1 rank" go through the kit compile pipeline. | CMB | CD-27 | R3-06, R5-04 |
| R5-12 | Bag and hero sheet window | A player opens the bag, equips an item, sees the stat change, and it survives a reload. | ECO, UX | ECO-10 | R3-24, R5-08 |
| R5-13 | Merchant window and the R5 loop | "Kill, find, sell, equip" passes end to end in Chromium. | ECO, QA | ECO-11, QA-16 (e2e) | R5-10, R5-12 |
| R5-14 | Gold curve and economy simulation | A deterministic simulation guards income, sinks and gear progression. | ECO | ECO-12 | R5-10 |
| R5-15 | Item and currency icons | Inventory, merchant and loot windows show composed icons with rarity frames. | ART | AD-17 | R5-03 |
| R5-16 | Loot drops and rarity looks | Loot appears where enemies fell and flies to the hero. | GFX | GTA-17 | R5-07 |
| R5-17 | Rarity glyphs, compare, unverified label | Rarity reads by glyph, compares by words, other players' gear is marked self-declared. | UX | UX-21 | R5-12 |
| R5-18 | Rarity and loot accessibility | Rarity reads in every palette and loot beams pass the flash analyser. | A11Y | A11Y-15 | R5-16 |
| R5-19 | Loot and merchant cues | Every loot reveal sounds its rarity; merchant actions have cues. | SND | SND-15 | R5-10 |
| R5-20 | Economy and loot events | Gold, drops per rarity and yields come out of playtest exports. | BAL | PBA-12 | R5-07 |
| R5-21 | Loot determinism tests | Loot is deterministic and its distribution is pinned. | QA | QA-16 (L1 to L3) | R5-07 |

### R6: quests (22 entries)

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R6-01 | Remaining quest objectives | Gather, Craft, Deliver, Puzzle, Escort, Survive and Hold work; a lost encounter keeps the quest. | NAR | NQD-T13 | R3-17 |
| R6-02 | Quest schema in `abalone-data` and graph checks | Quest data loads through the shared loader and its graph is checked. | TDS, NAR | TD-21 | R3-17 |
| R6-03 | Quest state in the save and the bridge | Quest, reputation, Codex and title state survive a reload. | NAR | NQD-T14 | R3-13, R6-02 |
| R6-04 | Journal window | The player sees, tracks, abandons and locates quests. | NAR, UX | NQD-T15 | R3-23, R6-03 |
| R6-05 | Quest tracker, notices and markers | Tracked quests show live counts outside combat; `!` and `?` markers carry a shape. | NAR, UX | NQD-T16, UX-22 | R6-04 |
| R6-06 | Item choice of 3 on turn-in | A reward offers 3 seeded items, the same after a reload. | NAR, ECO | NQD-T17 | R5-04, R6-03 |
| R6-07 | Factions and reputation | Quests raise reputation with 4 factions and ranks show with thresholds. | NAR | NQD-T18 | R6-03 |
| R6-08 | Main quest: prologue to seat 1 | The main quest runs from the Lumen camp to The Echo. | NAR | NQD-T19 | R6-05 |
| R6-09 | Zone 1 chain | The Lumen Plains have their chain, side quests and an escort. | NAR | NQD-T20 | R6-08 |
| R6-10 | Zone 2 chain | The Ash Grove has its chain, ending on the Weaver Queen's foreshadowing. | NAR | NQD-T21 | R6-09 |
| R6-11 | Zone 3 chain | The Soot Bogs have their chain, ending on the Drowned Counter's foreshadowing. | NAR | NQD-T22 | R6-10 |
| R6-12 | Period seed, dailies, weeklies | Boards offer 3 dailies and 1 weekly from the UTC day and week. | NAR | NQD-T23 | R4-02, R6-03 |
| R6-13 | Bounties | Each zone shows 5 daily bounties and a chest at 5 of 5. | NAR | NQD-T24 | R6-12 |
| R6-14 | Puzzle engine and format | Puzzles load from text and play with classic rules in solo or duel. | NAR | NQD-T25 | R1-44 |
| R6-15 | Puzzle prover | Every short puzzle is proven solvable within its cap and not trivially shorter. | AI | AI-14 | R6-14 |
| R6-16 | Puzzle tiles and the first 24 puzzles | Puzzle tiles in zones 1 to 3 open proven puzzles with a one-time reward. | NAR | NQD-T26 | R4-05, R6-15 |
| R6-17 | Codex engine | Codex entries unlock from world events and report completion. | NAR | NQD-T27 | R6-03 |
| R6-18 | Codex window | The player reads Codex entries in the Archives, with puzzle replays. | NAR, UX | NQD-T28 | R3-23, R6-17 |
| R6-19 | Colonists, quest markers, faction emblems | NPCs read as clouded colonists and factions have emblems. | ART | AD-18 | R6-05 |
| R6-20 | Quest marker accessibility | Marker states differ by shape, not colour. | A11Y | A11Y-16 | R6-19 |
| R6-21 | Quest cues and audio log player | Quests, puzzles, Codex and Tally lines have cues; audio logs play with ducking and subtitles. | SND | SND-16 | R6-05 |
| R6-22 | Quest properties and R6 exit | Quest state only moves forward and the zone 1 chain completes end to end. | QA | QA-17 | R6-09 |

### R7: gathering and crafting (13 entries)

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R7-01 | Gathering, refining, recipe, consumable schemas | Every recipe input is obtainable and no recipe loops. | TDS | TD-22 | R5-03 |
| R7-02 | Materials ladder and node data | Every material, tier and node exists as data. | ECO | ECO-13 | R7-01 |
| R7-03 | Harvesting logic and tools | A node is harvested with the right level, gives a reproducible yield, respawns per player. | ECO | ECO-14 | R4-02, R7-02 |
| R7-04 | Harvest interaction in the world | A player clicks a node, sees the channel, gets the material, and it stays harvested. | ECO, LVL | ECO-15 | R4-07, R7-03 |
| R7-05 | Refining stations | Raw materials refine into T1 and T2 at the right station. | ECO | ECO-16 | R7-02 |
| R7-06 | Crafting and the iLvl band | Four professions craft items in a seeded iLvl band. | ECO | ECO-17 | R5-04, R7-05 |
| R7-07 | Consumables and meals | Potions, tonics, bombs, liquid ballast and meals exist, crafted and bought. | ECO | ECO-18 | R7-06 |
| R7-08 | Consumables in combat | A hero uses at most one consumable per turn and three per fight. | GPL | GP-32 | R7-07 |
| R7-09 | Craft and refine window, the R7 loop | "Craft an item from gathered materials" passes end to end. | ECO, QA | ECO-19, QA-18 | R7-04, R7-06 |
| R7-10 | Colony orders, item side | An order removes materials atomically and returns its reward. | ECO | ECO-20 | R6-01, R7-06 |
| R7-11 | Profession orders on the Colony board | The board offers orders completed by handing in goods. | NAR | NQD-T29 | R7-10 |
| R7-12 | Gathering nodes and station looks | Node kinds, rich veins and stations read on the map, with the harvest arc. | ART, GFX | AD-19, GTA-18 | R7-04 |
| R7-13 | Gathering, crafting, consumable cues | Channels, stations and consumables have their sounds. | SND | SND-17 | R7-09 |

### R8: dungeons and bosses (23 entries)

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R8-01 | Multi-tile regions and seams | Fights run on unions of 2 to 7 tiles with depth-based Breach layers and seam pushes. | ENG, LVL | EA-20, LD-15 | R4-01 |
| R8-02 | Dungeon plan schema and release check | Dungeon plans load and a released boss without a winning fixture fails the tests. | TDS | TD-23 | R1-09 |
| R8-03 | Dungeon plans and instances | A plan gives a seeded instance with rooms, a mid Beacon and a boss room. | LVL | LD-16 | R8-01, R8-02 |
| R8-04 | Boss hooks in the combat | Bosses get HP phases, a Resilient or Unejectable Heart, enrage and objectives from data. | GPL | GP-33 | R2-19, R8-01 |
| R8-05 | Boss framework | A data boss with a Heart, shell link, phases and enrage plays to a win or a loss (no rout). | ENC | EBD-T13 | R8-04 |
| R8-06 | RPG boss fixtures and telemetry | A recorded RPG boss win replays to `Won`, and attempts export as `FightRecord`. | ENC, QA, BAL | EBD-T14, QA-19 (fixtures) | R1-51, R8-05 |
| R8-07 | Boss AI: phases and move policies | Bosses switch rules by phase and move by their policy (search, mirror, armies, region). | AI | AI-15 | R8-05 |
| R8-08 | The Echo | The Echo of Les Cales is playable and released with a fixture. | ENC | EBD-T15 | R8-06, R8-07 |
| R8-09 | The Hull | The 3-tile Hull (triangle) with rim cracks told 2 turns ahead is playable and released. | ENC | EBD-T16 | R8-01, R8-07 |
| R8-10 | The Choir | The Choir with armies and dual phase triggers is playable and released. | ENC | EBD-T17 | R8-07 |
| R8-11 | The Chaplain | The Chaplain converts Fragments only, never the hero, and is released. | ENC | EBD-T18 | R8-07 |
| R8-12 | Tally solo, "Le Registre" | The solo Ballast Mind fight exists behind the release gate. | ENC | EBD-T19 | R8-08, R8-09, R8-11 |
| R8-13 | Boss ladder cells and calibration | Every released boss is measured at `Pro` 10×, phases all reached, and the R8 playtest is reported. | AI, BAL | AI-16, PBA-13 | R8-08 to R8-11 |
| R8-14 | Class kits against boss rules | Time stop, Stasis, history abilities and raising behave on bosses as agreed. | CMB | CD-28 | R8-05 |
| R8-15 | Dungeon runs end to end | The player enters Les Cales from the hub, clears rooms, reaches The Echo and can resume. | LVL | LD-17 | R8-03, R8-08 |
| R8-16 | Dungeon, boss and world boss loot | Chests, boss tables and weekly caches give their loot once per rule. | ECO | ECO-21 | R5-07, R8-05 |
| R8-17 | Main quest seats 2 to 4 and boss Codex | The main quest continues through three seats and each win fills its Codex entry. | NAR | NQD-T30 | R6-17, R8-09 to R8-11 |
| R8-18 | Frame on any region | The engraved frame follows stitched tiles and ragged edges. | ART | AD-20 | R8-01 |
| R8-19 | Boss looks and HP-phase bar | Hearts wear their accents and phases read on an engraved HP bar with notches. | ART, UX | AD-21, UX-23 (notches) | R8-05 |
| R8-20 | Multi-tile rendering and camera | Unions render with overview and region zoom, every cell reachable. | GFX, UX | GTA-19, UX-23 (camera) | R8-01 |
| R8-21 | Boss and multi-tile accessibility | Boss phases and tells are flat-readable and the camera cuts in reduced motion. | A11Y | A11Y-17 | R8-20 |
| R8-22 | Boss music and cues | Each boss has phase pulses and a restart at phase 1 on retry. | SND | SND-18 | R8-05 |
| R8-23 | Boss mechanic scenarios and R8 exit | Each boss mechanic has a scenario and each released boss replays a recorded win. | QA | QA-19 | R8-08 to R8-11 |

### R9: full world (54 entries, 60 PRs)

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R9-01 | Region edits: Pont and Rotation | The region grows and rotates for the Geomancer, terrain and Slope directions included. | ENG | EA-21 | R8-01 |
| R9-02 | Slope, Height, Crystal | The static modifier cells work as specified. | LVL, GPL | LD-18, GP-38 (cells) | R2-17 |
| R9-03 | Quicksand, Vent, Corruption | The timed cells work with their tells (2-turn tell for multi-removal). | LVL, GPL | LD-19, GP-38 (cells) | R2-17 |
| R9-04 | Seven remaining biomes | All 10 zones open, each with its terrain table and global rule in fights. | LVL, GPL | LD-20, GP-38 (biomes) | R9-02, R9-03 |
| R9-05 | Biome families, 7 biomes | All 10 biomes spawn their families. | ENC | EBD-T20 | R9-04 |
| R9-06 | Assassin engine support | Combo points, teleports, ordered picks, Elusive and Smoke work from data. | GPL | GP-34 | R2-13 |
| R9-07 | Assassin Blades branch | Entaille to Danse des lames work. | CMB | CD-29 | R9-06 |
| R9-08 | Assassin Shadows branch and Assassinat | Croc-en-jambe to Assassinat work. | CMB | CD-30 | R9-06 |
| R9-09 | Necromancer engine support | Remains and Graveyard entries are raised once as Revenants that decay and are never Losses. | GPL | GP-35 | R2-16 |
| R9-10 | Necromancer Reanimation branch | Siphon to Armée des morts work. | CMB | CD-31 | R9-09 |
| R9-11 | Necromancer Curses branch and Pacte | Décrépitude to Peste and the innate Pacte work. | CMB | CD-32 | R9-09 |
| R9-12 | Chronomancer engine support | History snapshots in the hash power the rewind and time abilities. | GPL | GP-36 | R2-16 |
| R9-13 | Chronomancer Retrochrony branch | Mine temporelle to Paradoxe work. | CMB | CD-33 | R9-12 |
| R9-14 | Chronomancer Acceleration branch | Hâte to Arrêt du temps work. | CMB | CD-34 | R9-12 |
| R9-15 | Geomancer engine support | Cells are created, removed and rotated; Pont and Séisme work. | GPL | GP-37 | R9-01 |
| R9-16 | Geomancer Earth branch | Soulèvement to Rempart tellurique work. | CMB | CD-35 | R9-15 |
| R9-17 | Geomancer Fault branch | Sables to Séisme work. | CMB | CD-36 | R9-15 |
| R9-18 | R2 and R3 data: Assassin and Necromancer | 20 abilities with R2 and variants, with scenarios. | CMB | CD-37 | R9-08, R9-11 |
| R9-19 | R2 and R3 data: Chronomancer and Geomancer | 20 abilities with R2 and variants, with scenarios. | CMB | CD-38 | R9-14, R9-17 |
| R9-20 | Domination Path | Its keystones and runes work. | CMB | CD-39 | R3-09 |
| R9-21 | Sorcery Path | Its keystones and runes work. | CMB | CD-40 | R3-09 |
| R9-22 | Inspiration Path | Its keystones and runes work, life runes wired to gathering and merchants. | CMB, ECO | CD-41 | R3-09, R7-06 |
| R9-23 | Full progression data and pacing sim | 5 Paths and 8 class trees are data, and time to level lands within ±10 % of §11. | SYS | SYS-T18 | R9-20 to R9-22 |
| R9-24 | Eight class rotations and heavy states | The 8 class bots play within the nightly time limit; the 4 new classes are playable in the browser. | AI, CMB | AI-17, CD-42 | R9-18, R9-19 |
| R9-25 | 8-class ladder and Revenant stall check | The 8 classes pass the gates and §26 Q7 has a measured answer. | BAL | PBA-14 | R9-24 |
| R9-26 | Ladder matrix by class | The nightly ladder covers 8 classes and released bosses under its time cap. | OPS | DB-15 | R9-25 |
| R9-27 | Day, night and weather schedule | The UTC sky schedule feeds fights, frozen at the trigger. | LVL | LD-21 | R4-02 |
| R9-28 | Night and weather combat modifiers | Night and weather add bucket entries from the frozen sky state. | SYS | SYS-T19 | R9-27 |
| R9-29 | World tiers, Rifts, night monster modifiers | Monster stats follow tier, Rift level and the night flag. | ENC | EBD-T27 | R9-28 |
| R9-30 | Day, night and weather rendering | World lighting follows the cycle and never breaks legibility. | GFX | GTA-23 | R9-27 |
| R9-31 | La Reine Tisseuse | The Terrier de Cendre boss is playable and released. | ENC | EBD-T21 | R8-05 |
| R9-32 | Le Noyé-qui-compte | The Tourbière boss is playable and released. | ENC | EBD-T22 | R8-05 |
| R9-33 | Le Marcheur d'abîme | The Puits boss (seat 5) is playable and released. | ENC | EBD-T23 | R8-05, R9-01 |
| R9-34 | Heroic and Mythic keys | Dungeons run in Heroic and Mythic +1 to +20 with weekly affixes. | ENC | EBD-T24 | R8-15 |
| R9-35 | World boss schedule | A seeded UTC schedule shows a world boss every 3 hours with a weekly reward. | ENC | EBD-T25 | R4-02, R8-05 |
| R9-36 | Rare named and timed elites | Each zone has 3 rare named monsters that respawn after their kill. | ENC | EBD-T26 | R9-05 |
| R9-37 | Legendaries, Aspects, Uniques | Legendaries drop with a class Aspect that changes an ability. | ECO | ECO-22 | R5-11 |
| R9-38 | Sets | 16 four-piece sets give their bonuses. | ECO | ECO-23 | R5-04 |
| R9-39 | Gems, sockets, Jeweler, Crucible | Gems socket, unsocket and fuse, with a slot-dependent effect. | ECO | ECO-24 | R5-04 |
| R9-40 | World tier loot, Gambler, traveling merchant | Endgame loot scales and the Gambler sells for Shards. | ECO | ECO-25 | R9-29 |
| R9-41 | Faction quartermasters | Marks buy rank-gated recipes and cosmetics. | ECO | ECO-26 | R6-07 |
| R9-42 | Zone chains 4 to 10 (7 PRs, one per zone) | Each remaining zone gets its chain, contracts, bounties, puzzles and exploration quest. | NAR | NQD-T31 | R9-04 |
| R9-43 | Class chains for the 8 lineages | From level 30 every lineage has a 3-quest chain with cosmetics and a title. | NAR | NQD-T32 | R9-24 |
| R9-44 | World events, quest side | Convoy, Fissure and rare-hunt events grant their rewards, with a grace rule. | NAR | NQD-T33 | R9-35 |
| R9-45 | Main quest finale | The story ends with seat 5 and the solo "Le Registre"; the raid stays endgame (C30). | NAR | NQD-T34 (revised) | R8-12, R9-33 |
| R9-46 | Titles | Every title source grants its title once and the hero shows one. | NAR | NQD-T35 | R6-17 |
| R9-47 | Remaining nine cell visuals | Every §5.1 kind renders with its glyph, shape and motion rules. | GFX, ART | GTA-20, AD-22 (decals) | R9-02, R9-03 |
| R9-48 | Seven biome looks and the Well's darkness | All 10 biomes have looks inside the palette, the Well keeps 3:1 cell edges. | GFX, ART | GTA-21, AD-22 (biomes) | R9-04 |
| R9-49 | Four late lineages and Revenants looks | The 4 new heroes have their bands and Revenants read as coreless marbles. | ART | AD-23 | R9-09 |
| R9-50 | VFX for the R9 classes | Raises, rewinds, Rotation, Pont, Séisme and teleports play their recipes. | GFX | GTA-22 | R9-49 |
| R9-51 | Accessibility for late cells, biomes, classes | All cells, biomes and R9 motions meet the glyph, contrast, motion and flash rules. | A11Y | A11Y-18 | R9-47, R9-50 |
| R9-52 | Full world and class sound | Biomes 4 to 10, the 4 new classes, every cell and monster family sound. | SND | SND-19 | R9-04, R9-24 |
| R9-53 | Full-content budget check | Embedded content size and parse time stay under budget. | TDS | TD-24 | R9-23 |
| R9-54 | Every ability has a scenario | The 80 abilities and every monster ability have a scenario, and the gate blocks a new one without. | QA | QA-20 | R9-18, R9-19 |

### R10: multiplayer (43 entries)

| Id | Title | Outcome | Owners | From | Depends on |
|---|---|---|---|---|---|
| R10-01 | N-camp arenas: battle royale and 2v2 | The engine runs radius 8 with 3 to 6 camps and radius 5 with 4 entities, with symmetric starts. | ENG | EA-22 | R8-01 |
| R10-02 | Group start zones | Duo, trio and quatuor fights place every player and pack. | LVL | LD-22 | R1-21 |
| R10-03 | Symmetric boards for PvP and BR | Arena boards are point-symmetric and BR boards 6-fold symmetric, directions turned. | LVL | LD-23 | R2-25 |
| R10-04 | Fault-injecting mesh transport | Net tests drop, duplicate, reorder, delay and partition messages with a seed. | NET | NP-02 | — |
| R10-05 | Generic signed log | The combat log reuses the shipped hash chain, the classic game unchanged. | NET | NP-03 | — |
| R10-06 | Hello v2 with version gate | Peers on different rules, data or world versions refuse each other clearly. | NET | NP-04 | R1-10 |
| R10-07 | Sealed values and the combat seed | One commit-reveal module gives the same unbiasable seed on every peer. | NET | NP-05 | R10-04 |
| R10-08 | Party room of 4 | Players form a party of up to 4 and see who leads and who is connected (D2). | NET, UX | NP-06 | R10-04, R10-06 |
| R10-09 | Group engage handshake | Every member starts the same group fight from the same signed inputs. | NET | NP-08 | R4-07, R10-07, R10-08 |
| R10-10 | Group fight rules | Up to 4 players and 4 packs share a board with the frieze, allied blocking, group rout and a result per player. | GPL | GP-39 | R10-02 |
| R10-11 | Group encounters | A group meets one pack per player and a boss with one squad per player. | ENC | EBD-T28 | R10-10 |
| R10-12 | Combat lockstep session | A party plays turn by turn with signed actions, local monster turns and desync detection. | NET | NP-09 | R10-05, R10-09, R10-10 |
| R10-13 | Online catch-up and reload | A player who drops or reloads mid-fight comes back at the same action. | NET | NP-10 | R10-12 |
| R10-14 | Stall and drop takeover | A stalled member's entity is played by the player bot identically on every peer. | NET, AI | NP-11, AI-18 | R10-12 |
| R10-15 | Party movement, pings, emotes, quest share | Members follow the leader and talk only with pings, emotes and shares. | NET | NP-07 | R10-08 |
| R10-16 | Party quest sharing and credit | Members share quests and each present member gets the credit, alike on every peer. | NAR | NQD-T36 | R10-12, R10-15 |
| R10-17 | PvP rules in the combat | Duels and arenas use seed initiative, no level gap, shorter controls, no flight. | GPL | GP-40 | R2-07 |
| R10-18 | PvP and BR templates | Ranked and BR heroes are built from fixed templates that ignore equipment. | SYS, TDS | SYS-T20, TD-25 | R3-05 |
| R10-19 | Duels and free 1v1 arena | Two players fight with real gear after sealed loadouts and placement. | NET | NP-12 | R10-07, R10-12, R10-17 |
| R10-20 | Ranked normalisation check | Every peer rebuilds the opponent's template hero and refuses an illegal loadout. | NET | NP-13 | R10-18, R10-19 |
| R10-21 | PvP timeout claim | A player can claim a win against a silent opponent past the timer and grace. | NET | NP-15 | R10-14, R10-19 |
| R10-22 | 2v2 arena | Four players play a 2v2 arena with fixed camps. | NET | NP-14 | R10-01, R10-19 |
| R10-23 | PvP kit rules and mirror matrix | Ranked kits validate at level 100 and the class pairs stay in their band, measured weekly. | CMB, BAL | CD-43, PBA-15 | R10-17, R10-18 |
| R10-24 | BR rounds with RPG orders | A BR round resolves every order part by part with fizzles. | GPL | GP-41 | R10-01 |
| R10-25 | BR lobby and seating | Players of a BR slot are seated in shards of 6, bots fill the rest. | NET | NP-16 | R10-07, R10-08 |
| R10-26 | BR rounds online | Sealed orders resolve identically on every peer. | NET | NP-17 | R10-24, R10-25 |
| R10-27 | BR bots | Empty seats are filled by bots whose orders depend only on the round state and seed. | AI | AI-19 | R10-24 |
| R10-28 | Hub presence | Players in a hub area see each other's marbles, emotes and pings, and inspect gear. | NET | NP-18 | R4-24, R10-06 |
| R10-29 | Group, arena and world-boss finders | Players find a party, an arena opponent or a world-boss group. | NET | NP-19 | R10-08, R10-19, R10-28 |
| R10-30 | Trade state machine | Two pure trade sessions reach the same signed result or refuse with a reason. | ECO | ECO-27 | R5-05 |
| R10-31 | P2P trade | Two party members swap items with a double signed confirmation. | NET, ECO | NP-20, ECO-28 | R10-08, R10-30 |
| R10-32 | Honor, Breach Tokens, BR chests | Arenas and the BR pay their currencies; BR chests are the same on every peer. | ECO | ECO-29 | R10-26 |
| R10-33 | Raid wing 1: Les Commis | The first raid boss is playable by 4 players. | ENC | EBD-T29 | R8-10, R10-11 |
| R10-34 | Raid wing 2: L'Auditeur | The second raid boss is playable by 4 players. | ENC | EBD-T30 | R10-33 |
| R10-35 | Raid wing 3: Tally flower | Tally's 7-tile fight is playable by 1 to 4 players and released once won. | ENC | EBD-T31 | R8-12, R10-34 |
| R10-36 | Party, presence, arena and BR rendering | Party balls, presence, the radius-8 BR board and arenas render within budget, viewer-relative (C32). | GFX, ART | GTA-24, AD-24 | R10-08 |
| R10-37 | Group frieze, ally glyphs, pings, PvP timers | Each player's marbles carry their glyph and the frieze shows up to 8 entities. | UX | UX-24 | R10-15 |
| R10-38 | Multiplayer readability | Own, ally and enemy marbles differ by shape; pings are labelled and rate-limited. | A11Y | A11Y-19 | R10-36 |
| R10-39 | Multiplayer audio | Own camp as glass, allies lower and panned, pings, timers and BR sounds. | SND | SND-20 | R10-15 |
| R10-40 | Multi-page e2e entry | Group and arena specs with up to 4 pages run in their own CI entry. | OPS | DB-16 | R10-12 |
| R10-41 | Group fairness and BR report | Duo, trio and quatuor fights are measured against solo; BR placements reported. | BAL | PBA-16 | R10-11, R10-27 |
| R10-42 | Netcode scenarios and 2-tab exit | Groups of up to 4 stay in sync under faults, and the group and arena flows work in 2 tabs. | QA | QA-21 | R10-12, R10-19 |
| R10-43 | Profile key and local rating (blocked by the §19 Decision) | Ranked players keep an unverified local rating from signed match logs. | NET | NP-21 | R10-20 |

### Backlog size

| Phase | Entries | PRs |
|---|---|---|
| R0 | 27 | 27 |
| R1 | 93 | 93 |
| R2 | 61 | 61 |
| R3 | 30 | 30 |
| R4 | 38 | 38 |
| R5 | 21 | 21 |
| R6 | 22 | 22 |
| R7 | 13 | 13 |
| R8 | 23 | 23 |
| R9 | 54 | 60 |
| R10 | 43 | 43 |
| **Total** | **425** | **431** |

492 role Tasks merged into 425 entries; 4 entries are new (gaps: R0-16, R0-23, R1-58, R3-24, plus
the hub scene noted in R4-24). With at most 4 Tasks in progress (AGENTS.md rule 7), R1 alone is about
23 rounds of 4 PRs: R1 is the phase to protect from scope creep (LEAD 10.3).
