# Test strategy, rule examples, property tests and e2e: implementation spec (role `qa-automation`)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, still open). Source of truth:
the validated French gameplay spec (`docs/specs/rpg/plan.fr.md`, the same text as the approved plan
apart from its status header). A section number like "§6.4" points to that gameplay spec. This file
adds no game rule: it says how every rule is proved, by which test, at which level, in which phase.
What the gameplay spec gets wrong or leaves open for testing is listed under "Feedback on the
gameplay spec"; it is never fixed silently here.

Tags, as in `rules.md`: **FINAL** (decided by #313's four choices, by an existing spec or decision
cited next to it, or a measured fact of the repo), **TUNE** (starting value, adjusted after measuring),
**PROPOSAL** (proposed here, an owner or the named role confirms). Every number carries one. In the
rule examples (section Q3 to Q9), coordinates and stats written in a **Given** are example data
(PROPOSAL as a whole); a number in a **Then** follows from the Given and from the constants it names,
and carries the tag of those constants.

---

## 0. Scope

**In scope (this role writes it or owns its content):**

- The **test strategy** of the RPG: which test level proves which gameplay point, the traceability
  from each §-point to a test id, and the phase exit gates of §25 written as concrete tests.
- The **Given/When/Then examples** of `rules.md` §10.5 "RPG combat", with exact coordinates, expected
  effects and error names, so each one becomes one scenario file with no interpretation left.
- The **property test catalog**: the invariants of combat, world, progression, loot, saves and
  netcode, their generators (seeded, integer, no external crate by default), their case counts and
  their failure report.
- The **cross-cutting test suites** that are not part of one feature PR: the Weighted = Classic
  suite, the random fight invariant suite, the hash coverage test, golden logs per phase, the
  negative data fixtures, the phase exit e2e specs.
- The **e2e scenario catalog**: one entry per player-visible point, with the page contract it reads
  (data attributes and `window.__*` hooks).

**Out of scope (named in "Dependencies" of each section):**

- The CI shape (jobs, levels L1/L2/L3, shards, nightly workflows, size budgets): `devops-build`. This
  file uses its levels (devops-build.md §2.1) and asks for nothing outside them.
- The rules code, the scenario runner and parser, the hash function, the push predicate:
  `combat-engineer`. The core board, region mask and scan order: `combat-engineer` (core part,
  alias `engine-programmer`).
- Feature unit tests: written by the role that writes the feature, in the same PR, test commit first
  (CONTRIBUTING §11). This file gives them their acceptance examples; it does not write them.
- The bot ladder, its gates and the balance reading: `ai-engineer` (runner) and `qa-balance`
  (reading, playtests). Balance numbers are never asserted by the tests of this file.
- Browser test hooks in `client/src/main.ts` and the feature e2e specs: `client-engineer`. The shared
  e2e helpers `client/e2e/rpg.ts`: `devops-build` (D10).

### 0.1 Role slugs

This file uses the canonical list of `lead-game-designer.md` §2.2, plus its own slug.

| Slug | Owns (as used here) | Aliases in peer files |
|---|---|---|
| `qa-automation` | This file: strategy, rule examples, property suites, cross-cutting suites, phase exit e2e | none (distinct from `qa-balance`) |
| `lead-game-designer` | `rules.md` §10.5 text, rule arbitration, deviation register | `game-designer` |
| `combat-engineer` | `abalone-rpg` and the push predicate in `abalone-core`, scenario runner, hash, golden logs | `gameplay-programmer`, `engine-programmer`, `combat-engine` |
| `class-designer` | Class kits and abilities as data | `combat-designer` |
| `progression-designer` | Stats, `g(L)`, XP, Paths, active tree | `systems-designer`, `stats-progression` |
| `world-designer` | Map, tiles, biomes, stitching, generation | `level-designer`, `world-programmer` |
| `encounter-boss-designer` | Monsters, packs, intents, bosses | `dungeons-bosses` |
| `narrative-quest-designer` | Quests, Codex, tutorial | |
| `economy-designer` | Items, loot, merchants, gathering, crafting | `items-loot` |
| `ux-designer` | Previews, Edge danger display, page attributes naming | |
| `client-engineer` | Three.js scenes, hooks, feature e2e | `client-programmer`, `client-ui` |
| `ai-engineer` | Search on combat state, player bot, RPG ladder | `ai-programmer` |
| `network-engineer` | Group lockstep, commit-reveal, fake transport | `network-programmer` |
| `pvp-br-designer` | Arenas, normalization, battle royale | |
| `tech-lead` | Crates, data format, loader, determinism rules | |
| `devops-build` | CI shape, levels, nightly, e2e harness | |
| `qa-balance` | Ladder runs, playtests, telemetry reading | `qa-engineer` |

---

## 1. Inputs read

- The gameplay spec, every section (§0 to §26, "Fichiers critiques", "Vérification").
- `SPEC.md`, `CONTRIBUTING.md` (§1 rules 8, 12, 16, 17; §5 Definition of Done; §6.4 merge gate and
  screenshot rule; §6.7 bug flow; §11 testing; §13 local checks and what CI runs), `AGENTS.md`.
- `docs/specs/rules.md` (format of the 40 numbered examples, notation `(q,r)` and `cells>DIR`, tags,
  §5 sumito, §9 end of game, §10 mode deltas), `docs/specs/tech.md` §3 and §10 (property tests,
  perft, golden games, cross-target determinism, fake transport, renderer smoke),
  `docs/specs/boss-balance.md` (ladder, fixtures, telemetry), `docs/specs/game-design.md` §7,
  `docs/specs/multiplayer.md`, `docs/specs/ui.md`, `docs/specs/world.md` §5 and §8 (glyph plus
  colour, reduced motion), `docs/specs/mcp.md`.
- Code: `crates/abalone-core/src/{board,moves,game,search}.rs`, `encounter/{fixture,ladder,telemetry,
  hull}.rs`, `tests/boss_fixtures.rs`, `tests/fixtures/*.txt`; `client/playwright.config.ts`,
  `client/package.json`, `client/e2e/*.spec.ts` (hook style), `client/src/main.ts` (hooks
  `__cellToScreen`, `__plies`, `__history`, `__fight`, `__legal`, `__preview`, `__armies`).
- Peer role files under `docs/specs/rpg/roles/`: `lead-game-designer.md` (§2.2 slugs, §4 pillars as
  invariants, §7 rule arbitration, §9.3 example list R1 to R18), `gameplay-programmer.md` (§4 API,
  §4.6 hash, §4.7 scenario notation, §9 integer damage, §10 Edge danger, §12 ejection limits),
  `devops-build.md` (§2 check levels, D3 to D5, D10 e2e harness), `ux-designer.md` (A.1 Edge danger
  definition, A.4 cases).

### 1.1 Facts from the repo that shape this spec

| # | Fact | Consequence for testing |
|---|---|---|
| T1 | 306 Rust `#[test]` functions today (FINAL, counted 2026-10-25), no `proptest` and no other test dependency in any `Cargo.toml` (FINAL). | Property tests are seeded loops over a hand-written generator (section Q1), unless `tech-lead` adds a crate. |
| T2 | splitmix64 exists twice: `encounter/hull.rs` `mix` and `encounter/ladder.rs` `mix` (FINAL). | One shared seeded generator before the RPG suites multiply copies (Task QA-03). |
| T3 | `game.rs` hashes positions with `DefaultHasher` over a `HashMap` board scanned `q` outer, `r` inner (FINAL). | No classic hash may be reused as a golden value; RPG golden hashes start from `combat-engineer`'s stable hash (§24.1). |
| T4 | Boss wins are replayed from text fixtures by `tests/boss_fixtures.rs` (FINAL, 4 bosses, no Ballast Mind). | The RPG boss fixture of §25 R8 extends this pattern, it does not invent a new one (section Q14). |
| T5 | e2e drives the page by clicks at `window.__cellToScreen(q, r)` and reads `#hud` text and `body[data-*]` attributes; hooks ship in the production build (the nightly live run uses them) (FINAL). | RPG e2e keeps the same style: real clicks for the flow under test, hooks for setup and for reading state (section Q16). |
| T6 | Rust coverage gate 100 % lines and regions (FINAL, CONTRIBUTING §11); `#[ignore]` tests do not count for coverage (FINAL, devops-build D4). | Every slow suite keeps a fast twin at L1 that covers the same code. |
| T7 | Client unit tests (vitest) and `tsc` are not in CI (FINAL, CONTRIBUTING §11). | Rule logic must never live only in TypeScript; client tests guard display logic only. |
| T8 | e2e on CI: 4 shards, one worker each, 960x540 software WebGL, 60 s per test, one retry (FINAL, `playwright.config.ts`). | Each RPG e2e test sets up by hook and stays under 30 s locally (TUNE); no real-time waiting (clock control, reduced motion). |

---

## 2. Conventions

### 2.1 Test levels (what proves what)

| Id | Level | Proves | Written by | Runs at (devops-build §2.1) |
|---|---|---|---|---|
| U | Unit | One function, every branch | Feature role, same PR | L1 |
| S | Scenario (`.scn` file) | One rule from a position and a list of actions (§1 pillar 4) | Feature role for its rules; `qa-automation` converts every `rules.md` §10.5 example | L1 |
| P | Property (seeded loop) | An invariant over many generated states | `qa-automation` (catalog, generators, suites); feature role adds the property its PR needs | L1 fast tier, L3 deep tier |
| G | Golden log | A recorded fight replays to a pinned hash | `combat-engineer` (files), `qa-automation` (coverage per format and phase) | L1 native, L2 wasm32 |
| I | Integrity (data) | Every data file obeys the design invariants (§24.3) | Each content role for its rules; `qa-automation` adds one negative fixture per rule | L1 |
| X | Integration | Two crates or two peers together (wasm bridge, fake transport) | `network-engineer`, `client-engineer`; scenarios from `qa-automation` | L1 |
| V | Client unit (vitest) | Pure client modules (text of the preview, announce-on-change) | `client-engineer` | local only (T7) |
| E | e2e (Playwright, Chromium) | A player flow in a real browser | `client-engineer` per feature; `qa-automation` per phase exit | L2, nightly live |
| B | Ladder | Balance gates | `ai-engineer`, `qa-balance` | L3, not in this file |

Rule (PROPOSAL): **a gameplay point is tested at the lowest level that can see it.** A rule is an S
test, never an E test; an E test proves wiring and display, and reads the engine's answer instead of
recomputing it.

### 2.2 Who writes which test

Strict TDD (CONTRIBUTING §11, FINAL) means a test for new code lands in the PR of that code, red
first. So:

- The **acceptance examples** of this file (Q3 to Q9) are the red tests of the feature PRs. The
  feature role copies the example into a `.scn` file in its first commit.
- `qa-automation` opens its **own** PRs only for tests over code that is already on `main`:
  property suites, golden coverage, hash coverage, negative fixtures, phase exit e2e. Such a PR adds
  tests and test helpers only; if a test finds a bug, the bug gets a `bug` issue first and the PR
  waits (CONTRIBUTING §6.7, FINAL).

### 2.3 Rule examples: pin rules, not tuning

A TUNE number changes in playtest; a rule example must not break when it does (PROPOSAL):

- Every stat an example depends on is written in its **Given**. Defaults of a unit not stated:
  level 1, HP 100 (max 100), ATQ 10, PUI 10, ARM 0, RES 0, VIT 10, Weight 1, `class=none` (no trait,
  no squad bonus), no status (PROPOSAL, scenario defaults owned by `combat-engineer`).
- Abilities used only to trigger a rule are **test abilities** from a test-only content pack
  `data/test/` (PROPOSAL, `tech-lead` decides its path), loaded by the scenario runner and never by
  the game: `test.pure40` (Action, CD 0, cost 0, range 9, Pure damage 40), `test.freeze1` (Action,
  Status Gelé 1 turn), `test.cd1` (Action, CD 1, no effect), `test.haste` (Quick, grants a bonus
  Step), `test.shove` (Action, adjacent, forced move 1 cell away from the caster, no Éjecteur),
  `test.pull` (Action, in line, range 3, pulls the first ball of the line 1 cell toward the caster,
  no Éjecteur),
  `test.quake` (Action, Éjecteur, every enemy within 1 recoils 1 cell away from the caster),
  `test.unejectable` (Quick, Inéjectable 1 turn), `test.raise` (Action, raises a Graveyard entry as
  a Revenant on a chosen empty cell), `test.kill` (Action, Pure damage 999). Every number in this
  list is PROPOSAL test data.
- Examples that test a **class rule** (Élan, Rage gain, Percée) name the class and state its numbers
  in the Given, with the source section.
- The tuning numbers themselves (class multipliers, costs, cooldowns) are checked by **snapshot
  tests** over the data files (section Q11), which a tuning PR updates on purpose.

### 2.4 Example layout conventions

- Board radius 4 (61 cells, FINAL `rules.md` §1) unless the example says otherwise. Notation of
  `rules.md` §1 and of `gameplay-programmer.md` §4.7: `(q,r)`, `move (q,r)(q,r)>E`, `step #id>DIR`,
  `cast <ability> @(q,r)` or `#id`, `end`, `flee`.
- Two entities unless said: **P** (player, camp 0, active first) and **E** (enemy, camp 1).
- **Parking cells**: a hero or pack leader not listed stands on its parking cell and plays no role:
  P at `(-3,3)`, E at `(3,-3)` (PROPOSAL). Neither cell is adjacent to row `r = 0`, where most
  examples happen. Entities move their parked unit to satisfy the mandatory Mouvement (§6.3) when the
  example needs a filler move: `move (-3,3)>W` for P, `move (3,-3)>E` for E.
- Rout threshold 6 (the §6.8 boss value, TUNE) unless said, so a single Loss never ends an example.
- `#id` numbers are fixed per example; `P` units get ids 1 to 9, `E` units 11 to 19.
- Expected effects use the `Effect` names of `gameplay-programmer.md` §4.3 and the error names of
  §4.2 and `lead-game-designer.md` §7.1 (`NotStrongEnough`, `TooLight`, `PushBlocked`, ...).

### 2.5 Property test conventions

- Generator: one splitmix64 stream per case, seed = `base_seed + case_index` (PROPOSAL). No clock, no
  `HashMap` iteration, no float (§24.1).
- Failure report (PROPOSAL): the test prints the case seed, the generated setup as `.scn` text and
  the action log in notation, so the failure is pasted as a new scenario file and becomes a
  permanent regression test (the bug issue links it).
- Minimizer (PROPOSAL, KISS): on failure, replay prefixes of the log and report the shortest failing
  prefix. No structural shrinking.
- Case counts: fast tier at L1 must run under 20 s in the instrumented debug build (TUNE,
  devops-build §2.1); deep tier at L3 as `#[ignore]` tests.

---

## 3. Strategy overview and traceability

### 3.1 Test files this role creates (by phase)

| Path | Content | Phase |
|---|---|---|
| `crates/abalone-core/src/seed.rs` | Shared splitmix64 (`seed::next`, `seed::below`), used by hull, ladder and every test generator | R1 |
| `crates/abalone-core/tests/weighted_classic.rs` | P1, P2: Weighted with every Weight 1 equals Classic | R1 |
| `crates/abalone-rpg/tests/common/gen.rs` | Random `CombatSetup` and random legal action driver | R1 |
| `crates/abalone-rpg/tests/invariants.rs` | P3 to P18 over random fights | R1, grows per phase |
| `crates/abalone-rpg/tests/hash_coverage.rs` | P9: every state field changes the hash | R1 |
| `crates/abalone-rpg/tests/scenarios/r<NN>-<slug>.scn` | Every `rules.md` §10.5 example | R1, R2, R9 |
| `crates/abalone-rpg/tests/scenario_index.rs` | Every §10.5 id has a file, every file has an id | R1 |
| `data/test/*` and `tests/bad-data/*` | Test abilities; one broken file per integrity rule | R1, R2 |
| `crates/abalone-world/tests/invariants.rs` | W1 to W7 | R4 |
| `crates/abalone-world/tests/progression.rs` | G1 to G4, scripted 1 to 30 | R3 |
| `crates/abalone-world/tests/loot.rs`, `save.rs` | L1 to L3, S1 to S3 | R3, R5 |
| `crates/abalone-rpg/tests/rpg_boss_fixtures.rs` | One RPG win per boss | R8 |
| `client/e2e/rpg-r<N>.spec.ts` | Phase exit e2e | R1, R4 to R10 |

### 3.2 Phase exit gates (§25) as tests

| Phase | §25 exit criterion | Test that proves it | Tag |
|---|---|---|---|
| R0 | Decision closed, specs merged | Docs only; the §10.5 example list complete (QA-01) | FINAL (§25) |
| R1 | Playable in the browser | `rpg-r1.spec.ts` E1 to E6 green on `main` | PROPOSAL |
| R1 | "Poids 1 = classique" green | `weighted_classic.rs` P1 (L1 and L3 tiers) | FINAL (§6.4) |
| R1 | Determinism: same log = same hash | P8 at L1, golden logs native and wasm32 (devops-build D3) | FINAL (§25) |
| R1 | e2e green | Whole suite, classic specs unchanged and green | FINAL (§25) |
| R2 | Each class beats the reference pack on the ladder | Ladder (`ai-engineer`, `qa-balance`), plus S examples of the 4 kits and P suites with R2 content | PROPOSAL (threshold is a gap, Feedback F13) |
| R3 | Level 1 to 30 in a scripted test | `progression.rs` "scripted 1 to 30" (section Q12) | PROPOSAL |
| R4 | Walk, fight, come back, reload | `rpg-r4.spec.ts` | PROPOSAL |
| R5 | Kill, find, sell, equip loop | `rpg-r5.spec.ts` plus L1 to L3 | PROPOSAL |
| R6 | One chain done end to end | Quest scripted test plus `rpg-r6.spec.ts` | PROPOSAL |
| R7 | Craft an item from gathered materials | Scripted test plus `rpg-r7.spec.ts` | PROPOSAL |
| R8 | One RPG win fixture per boss | `rpg_boss_fixtures.rs` | FINAL (§25, §18) |
| R9 | 8 classes pass the ladder | Ladder; plus "every ability id has a scenario" gate (QA-20) | PROPOSAL |
| R10 | 2-tab e2e in group and arena | `rpg-r10.spec.ts` plus in-process 4-peer test N1 | PROPOSAL |

### 3.3 Classic regression gate (§1 pillar 1, §21 Mess)

The classic tables stay playable (§1 pillar 1). Guard (FINAL as a rule): every existing Rust test,
the 4 boss fixtures and every existing e2e spec stay green and unchanged through R1 to R10. A PR that
must edit an existing classic test says why in its body and links the Decision that allowed it.

---

## Q1. Shared seeded generator and random drivers (§24.1, §1 pillar 4)

**Gameplay points.** §24.1 "Entiers uniquement … Ordre fixe partout"; §1 pillar 4 "Chaque règle est
testable"; §4.1 `hash(graine_monde, q, r)`; §12 loot seed `(sauvegarde, id du combat)`.

**Implementation.**

- `abalone_core::seed` (public, production code): `pub fn next(state: &mut u64) -> u64` (one
  splitmix64 step, the constant `0x9E37_79B9_7F4A_7C15` FINAL as in `hull.rs`), `pub fn below(state:
  &mut u64, n: u64) -> u64` (`next % n`, PROPOSAL: modulo bias accepted for tests and content rolls,
  documented). `hull.rs` and `ladder.rs` call it; their two private copies are deleted. The world
  hash of §4.1 and the loot roll of §12 reuse it (`world-designer`, `economy-designer` decide).
- `crates/abalone-rpg/tests/common/gen.rs` (test only):
  - `gen_setup(seed, phase) -> CombatSetup`: board radius 3 or 4 (§6.8 skirmish and elite), 1 or 2
    entities per camp, 2 to 8 units per entity (TUNE), random Weights 1 to 5, random HP 1 to max,
    terrain drawn from the catalog **enabled at `phase`** (R1: none; R2: the 6 types of §25 R2; R9:
    all of §5.1), statuses drawn from the catalog enabled at `phase`.
  - `drive(setup, seed, cap) -> (CombatState, Vec<Action>, Vec<Effects>)`: at each step, list
    `legal_actions`, pick one with `seed::below`, apply it; stop at an outcome or after `cap` actions
    (200, TUNE).
  - `to_scn(setup, log) -> String`: the failure report of 2.5.
- The same `gen_setup` feeds the ladder's random openings only if `ai-engineer` wants it (no
  obligation).

**Dependencies.** `combat-engineer` (`CombatSetup`, `legal_actions`, `apply_action`, notation
printer), `tech-lead` (agrees that no `proptest` is added; open question O1), `ai-engineer` (ladder
moves to `seed::next`).

**Tests.**
- Given seed 0, When `seed::next` runs 3 times, Then it returns the 3 values recorded from the current
  `hull.rs` `mix` chain (FINAL as method: the reference is the existing function, so the move does
  not change any boss fixture).
- Given the existing boss fixtures, When `cargo test` runs after the move, Then the 4 fixtures still
  replay to a win (classic regression gate, section 3.3).
- Given `gen_setup(s, R1)` for 1 000 seeds (TUNE), Then every setup passes `CombatSetup` validation
  (the generator never builds an illegal setup).

**Risks.** A generator that only builds "easy" states proves little: `gen_setup` must reach rim
contact, Weight ties and full groups. Mitigation: a coverage counter in the suite asserts that, over
the fast tier, at least one ejection, one `TooLight` refusal and one hero death happened (TUNE
minimums, the assertion fails if the generator drifts).

**Tags.** splitmix64 constant FINAL; case counts and sizes TUNE; API names PROPOSAL.

---

## Q2. Weighted push equals Classic when every Weight is 1 (§1 pillar 1, §6.4, §25 R1)

**Gameplay points.** §1 pillar 1 "Si tous les Poids valent 1, on retrouve exactement l'Abalone
classique : c'est un invariant testé"; §6.4 "Un test de propriété le vérifie (même perft, mêmes
parties aléatoires)"; §24.2 `Classic` or `Weighted` push rule; §25 R1 exit.

**Implementation** (file `crates/abalone-core/tests/weighted_classic.rs`, written by this role once
`combat-engineer`'s `PushRule` switch is on `main`; tiers fixed by devops-build D4):

- **P1a, perft.** `perft(board, player, depth, rule)` counts leaves. Before the push predicate PR
  merges, the current engine's counts are recorded (FINAL as method: the reference is today's
  `legal_moves`) for: the standard start, the Belgian daisy, and 3 hand positions (sumito at the rim,
  push blocked by own marble, broadside next to an opponent: `rules.md` Examples 17, 19, 7). The test
  asserts `perft(Classic) == perft(Weighted, all w = 1) == pinned` at depth 1 to 2 at L1 and depth 3
  to 4 at L3 (TUNE, devops-build D4 measures).
- **P1b, random positions.** 1 000 positions at L1, 50 000 at L3 (TUNE): 1 to 14 marbles per side
  placed by `seed::below` on distinct cells of the radius 4 board. For each, the **sorted** legal
  move lists of both rules are equal, and for every move `apply` gives the same board and the same
  ejection flag.
- **P1c, random games.** 200 games of up to 200 plies at L1, 10 000 at L3 (TUNE): both rules play the
  same seeded move index each ply; boards, ejection counts and outcomes are equal at every ply.
- **P2, Weighted refines Classic** (PROPOSAL, a stronger safety net): over the same random positions
  with random Weights 1 to 5 and `equal_count = false`, every push legal under `Weighted` is legal
  under `Classic`; raising one resisting Weight never makes an illegal push legal; raising one pushing
  Weight never makes a legal push illegal (monotonicity).
- **P2b, exhaustive predicate** (the lead's table, `lead-game-designer.md` §4.1): for `n` in 1..=4,
  `m` in 0..=3, `w_push = n`, `w_resist = m`, `equal_count = false`: `strong_enough(Weighted) ==
  strong_enough(Classic)`. 16 cases (FINAL arithmetic, 4 × 4), a unit test in the predicate PR.

**Dependencies.** `combat-engineer` (the `PushRule` switch and a weight-aware `legal_moves` over the
core board), `devops-build` (L3 job), `lead-game-designer` (predicate definition §7.1).

**Tests (of the suite itself).**
- Given a temporary change where Weighted compares `>=` instead of `>`, When P1b runs, Then it fails
  and prints a position with a 1 vs 1 push (manual check in the PR, then reverted).
- Given the standard start, Then depth 1 counts are equal for both rules and equal to the pinned
  value.

**Risks.** If `combat-engineer` changes the core scan order to "r then q" (§24.1), legal move lists
change order, not content: the suite compares sorted lists, so it stays valid. Perft depth 3 in the
instrumented build may exceed 20 s (TUNE): then depth 3 moves to L3.

**Tags.** Equality FINAL (§6.4); depths and counts TUNE; P2 PROPOSAL.

---

## Q3. Rule examples: weighted push (§6.4) for `rules.md` §10.5

**Gameplay points.** §6.4 conditions 1 to 3, its 6 examples, Percée (§8.2), Unmovable (§6.11), allied
balls block (§6.2); §0 "Vérification": "la poussée pondérée (6 cas)".

**Implementation.** The ids R1 to R18 are the ids of `lead-game-designer.md` §9.3 (same meaning); this
file gives their exact layout and adds R19 onward. Each becomes
`crates/abalone-rpg/tests/scenarios/rNN-<slug>.scn` (`gameplay-programmer.md` §4.7 format, or the
RON form if `tech-lead` picks it, open question O2). Weights are written `w`.

**R1 (1 vs 1 is illegal, even with more Weight).**
**Given** P hero `#1` at `(-1,0)` w3; E Fragment `#11` at `(0,0)` w1. P active.
**When** P plays `move (-1,0)>E`.
**Then** refused `NotStrongEnough` (count: 1 is not more than 1). State hash unchanged.

**R2 (2 vs 1, Weight 4 vs 3: legal).**
**Given** P hero `#1` at `(-1,0)` w3, P Fragment `#2` at `(-2,0)` w1; E hero `#11` at `(0,0)` w3.
**When** P plays `move (-2,0)(-1,0)>E`.
**Then** legal. `#11` at `(1,0)`, `#1` at `(0,0)`, `#2` at `(-1,0)`. Effect `Pushed n=2 m=1 wf=4 wa=3`.
`#11` takes the Choc of `#1` (ATQ 10, isolated +25 %, ARM 0): HP 100 → 88 (follows from §6.5 TUNE
values: 100 % Choc, Isolation +25 %).

**R3 (Weight defends).**
**Given** P Fragments `#2` `(-2,0)` and `#3` `(-1,0)`, w1 each; E hero `#11` at `(0,0)` w3.
**When** P plays `move (-2,0)(-1,0)>E`.
**Then** refused `TooLight` (2 is not more than 3).

**R4 (3 vs 2 with all Weights 1: classic).**
**Given** P Fragments `(-3,0)(-2,0)(-1,0)` w1; E Fragments `#11` `(0,0)` and `#12` `(1,0)` w1; `(2,0)`
empty.
**When** P plays `move (-3,0)(-2,0)(-1,0)>E`.
**Then** legal. E at `(1,0)(2,0)`, P at `(-2,0)(-1,0)(0,0)`. Choc: `#11` (now `(1,0)`, first ball of the
run, one adjacent ally) takes 100 % of ATQ 10 with Formation −10 %: HP 100 → 91; `#12` takes 50 %
(raw 5) with Formation −10 %: HP 100 → 96 (TUNE values of §6.5).

**R5 (Mud adds Weight).**
**Given** P Fragments `(-3,0)(-2,0)(-1,0)` w1; E hero `#11` at `(0,0)` w3 on Mud.
**When** P plays `move (-3,0)(-2,0)(-1,0)>E`.
**Then** refused `TooLight` (3 is not more than 3 + 1).

**R6 (Percée allows equal count, not equal Weight).**
**Given** P hero `#1` at `(-1,0)` w3 with Percée active this turn (§8.2), P Fragment `#2` at `(-2,0)`
w1; E Fragments `(0,0)(1,0)` w1; `(2,0)` empty.
**When** P plays `move (-2,0)(-1,0)>E`.
**Then** legal at 2 against 2 (Weight 4 > 2). E at `(1,0)(2,0)`. Effect `Pushed n=2 m=2 wf=4 wa=2`.

**R7 (all Weights 1: classic Example 17 unchanged).**
**Given** the position of `rules.md` Example 17 as P and E Fragments, all w1: P `(0,0)(1,0)(2,0)`,
E `(3,0)(4,0)`.
**When** P plays `move (0,0)(1,0)(2,0)>E`.
**Then** the same result as Example 17: E's ball from `(4,0)` is ejected (`Ejected`, E Losses +1), P at
`(1,0)(2,0)(3,0)`, E at `(4,0)`.

**R19 (a Rock behind the run blocks).**
**Given** P Fragments `(-1,0)(0,0)`; E Fragment `#11` at `(1,0)`; Rock at `(2,0)`.
**When** P plays `move (-1,0)(0,0)>E`.
**Then** refused `PushBlocked`.

**R20 (nothing enters a Rock).**
**Given** P Fragment `#2` at `(0,0)`; Rock at `(1,0)`.
**When** P plays `move (0,0)>E`.
**Then** refused (target cell is a Rock; error name owned by `combat-engineer`).

**R21 (an Unmovable ball in the run blocks).**
**Given** P Fragments `(-3,0)(-2,0)(-1,0)` w1; E Fragments `#11` `(0,0)` w1 and `#12` `(1,0)` w1, `#12`
Ancré (Unmovable).
**When** P plays `move (-3,0)(-2,0)(-1,0)>E`.
**Then** refused `PushBlocked` (§6.4 condition 3, §6.11 Inamovible).

**R22 (an allied ball of another entity blocks, and never pushes with you).**
**Given** a group fight: P1 Fragments `(-1,0)(0,0)`; E Fragment `#11` at `(1,0)`; P2 (same camp as P1)
Fragment `#21` at `(2,0)`. P1 active.
**When** P1 plays `move (-1,0)(0,0)>E`.
**Then** refused `PushBlocked` (§6.2).
**And Given** P1 Fragment `#1` at `(0,0)` and P2 Fragment `#21` at `(1,0)`, P1 active. **When** P1
plays `move (0,0)(1,0)>W`. **Then** refused: a group holds only the active entity's own balls (§6.0,
§6.2 "Elles ne poussent jamais avec toi").

**R23 (Slope down helps the pusher).**
**Given** P Fragments `(-1,0)(0,0)` w1, Slope on `(0,0)` pointing E (the cell of the group's front
ball, PROPOSAL `lead-game-designer.md` G7); E Brute `#11` at `(1,0)` w2.
**When** P plays `move (-1,0)(0,0)>E`.
**Then** legal (2 > 1; Weight 2 + 1 = 3 > 2).

**R24 (Slope up hinders the pusher).**
**Given** the R23 layout with the Slope pointing W and E `#11` w1.
**When** P plays `move (-1,0)(0,0)>E`.
**Then** refused `TooLight` (Weight max(1, 2 − 1) = 1 is not more than 1).

**R25 (a broadside never pushes).**
**Given** P Fragments `(-1,0)(0,0)`; E Fragment at `(0,1)`.
**When** P plays `move (-1,0)(0,0)>SE`.
**Then** refused (classic `rules.md` §4.2, FINAL). No Choc.

**R26 (Mud forbids a broadside).**
**Given** P Fragments `(-1,0)(0,0)`, `(0,0)` on Mud; `(-1,1)` and `(0,1)` empty.
**When** P plays `move (-1,0)(0,0)>SE`.
**Then** refused (a ball on Mud makes no side move, §5.1).

**Dependencies.** `combat-engineer` (runner, error names, Percée flag), `lead-game-designer` (adopts
the exact layouts in §10.5), `class-designer` (Percée data).

**Risks.** R22's second half depends on how the UI and the engine name a selection refusal; the
scenario asserts only "refused".

**Tags.** Rules FINAL where §6.4 says so (conditions 1 to 3, the 6 examples); Slope cell choice and
error names PROPOSAL; HP results TUNE (they follow §6.5 percentages).

---

## Q4. Rule examples: terrain (§5.1, §6.10 rule 3, §4.6)

**Gameplay points.** §5.1 Ice, Chasm, Lava, Quicksand; §6.10 "Une seule éjection par action", "Règle
d'or des déplacements forcés"; §4.6 stitched boards; §0 "Vérification": Ice "dont la limite d'une
éjection", "la couture entre deux plateaux".

**R8 (Ice slide: one ejection per action, the next ball stops on the rim).**
**Given** Ice on `(1,0)(2,0)(3,0)(4,0)`. P Fragments `(-3,0)(-2,0)(-1,0)` w1; E Fragments `#11`
`(0,0)` and `#12` `(1,0)` w1; E hero parked.
**When** P plays `move (-3,0)(-2,0)(-1,0)>E`.
**Then** the push puts `#12` on `(2,0)` and `#11` on `(1,0)`, both on Ice. Front first: `#12` slides
`(3,0)`, `(4,0)`, then off the board: ejected (`Slid`, `Ejected`, E Losses +1). `#11` slides to
`(4,0)` and stops on the rim (`Blocked at_edge=true`): the action already ejected once. P at
`(-2,0)(-1,0)(0,0)`. `#11` takes the push Choc after the slide (PROPOSAL order, Feedback F6).

**R27 (Ice and a non-Éjecteur ability: never off the board).**
**Given** Ice on `(2,0)(3,0)(4,0)`. P hero `#1` at `(0,0)`; E Fragment `#11` at `(1,0)`.
**When** P plays `cast test.shove #11` (away from `#1`, so E).
**Then** `#11` enters `(2,0)`, slides to `(4,0)` and stops there (`Blocked at_edge=true`), takes a Choc
(§6.10 rule 3), and is not ejected. E Losses unchanged.

**R28 (a voluntary group does not slide; a single ball does).**
**Given** Ice on `(1,0)(2,0)(3,0)` with `(4,0)` Normal and empty, and Ice on `(1,1)(2,1)`. P Fragment
`#2` at `(0,0)`; P pair `#3` at `(-1,1)` and `#4` at `(0,1)`.
**When** P plays `move (-1,1)(0,1)>E`.
**Then** the pair ends on `(0,1)(1,1)` and does not slide (§5.1 "Groupes").
**When**, in a fresh copy of the Given, P plays `move (0,0)>E`.
**Then** `#2` enters `(1,0)` and slides to `(4,0)`, the first non-Ice free cell.

**R29 (Chasm inside the board ejects).**
**Given** P Fragments `(-1,0)(0,0)`; E Fragment `#11` at `(1,0)`; Chasm at `(2,0)`.
**When** P plays `move (-1,0)(0,0)>E`.
**Then** legal; `#11` is ejected into the Chasm (`Ejected`, E Losses +1, a Graveyard entry with cause
ejection); P at `(0,0)(1,0)`.

**R30 (Lava ticks at the end of the bearer's own turn only).**
**Given** P Fragment `#2` at `(0,0)` on Lava, HP 100 of 100.
**When** P ends its turn (after the filler move), then E ends its turn.
**Then** after P's turn end `#2` has HP 90 (−10 % of max, TUNE §5.1); after E's turn end still 90.

**R31 (Quicksand: rooted, then swallowed).**
**Given** E Fragment `#11` at `(0,0)` on Quicksand. E's turn starts.
**When** E's turn 1 starts.
**Then** `#11` is Rooted; the tell `TellPlaced` shows on `(0,0)`. `move (0,0)>E` by E is refused
(Rooted); E plays a filler and ends. **When** E's turn 2 starts with `#11` still on `(0,0)`, **Then**
`#11` is ejected (E Losses +1).

**R9 (a push across a seam is an ordinary push).**
**Given** a fight stitched from tiles `(0,0)` and `(1,0)` (§4.6): the region is every cell within
distance 4 of `(0,0)` or of `(9,-4)` (the centre of tile `(1,0)`, §4.1 formula `q·(9,−4) + r·(4,5)`).
P Fragments `(2,0)(3,0)`; E Fragment `#11` at `(4,0)`.
**When** P plays `move (2,0)(3,0)>E`.
**Then** legal; `#11` at `(5,0)` (a cell of tile `(1,0)`: `(5−9, 0+4) = (−4,4)`, distance 4); no
ejection; P at `(3,0)(4,0)`.

**R9b (the same push on one tile ejects).**
**Given** the R9 units on the single tile `(0,0)`.
**When** P plays `move (2,0)(3,0)>E`.
**Then** `#11` is ejected. R9 and R9b together prove that the seam is invisible to the rules.

**Dependencies.** `combat-engineer` (terrain rules, slide order, `Blocked` effect), `world-designer`
(region of a stitched fight), `lead-game-designer` (§10.5 wording).

**Risks.** R28 had to choose a layout where the pair's targets are on Ice to prove "groups do not
slide"; if `combat-engineer` reads §5.1 as "a group member that ends on Ice slides alone", R28 fails:
that is Feedback F7, settled before R2.

**Tags.** One ejection per action FINAL (#313); slide order "front first" FINAL as written in §5.1;
10 % Lava TUNE; tile centre formula FINAL arithmetic of §4.1; Choc after slide PROPOSAL.

---

## Q5. Rule examples: damage, Choc, position, Guard (§6.5)

**Gameplay points.** §6.5 formula, Choc 100 % and 50 %, ejected balls take no Choc, broadside no
Choc, Isolation +25 %, Formation −10 % per ally (cap −30 %), level gap ±5 % (cap ±25 %, off in PvP),
Guard 35 %; §24.1 integers and fixed order.

All results use `gameplay-programmer.md` §9.1 integer formula: `damage = max(1, floor(raw × g_bp ×
(10000 + Σbp) / ((g_bp + 100 × Def) × 10000)))`, level 1 so `g_bp = 10000`.

**R32 (Choc with armour).**
**Given** P hero `#1` at `(-2,0)` w3, P Fragment `#2` at `(-1,0)` w1 ATQ 20 (the front ball, so the
Choc leader); E Brute `#11` at `(0,0)` w2, ARM 25, HP 100, no ally.
**When** P plays `move (-2,0)(-1,0)>E`.
**Then** `#11` at `(1,0)`, isolated: `raw 20`, `Σ +2500`: `20 × 10000 × 12500 / (12500 × 10000)` = 20.
HP 100 → 80.

**R33 (a run of two at the rim: the ejected ball takes no Choc).**
**Given** P Fragments `(0,0)(1,0)(2,0)` ATQ 10; E Fragments `#11` `(3,0)` and `#12` `(4,0)`, HP 50.
**When** P plays `move (0,0)(1,0)(2,0)>E`.
**Then** `#12` ejected (no `Damaged` effect on `#12`); `#11` at `(4,0)`, isolated, takes 100 %:
HP 50 → 38.

**R15 (Isolation +25 %).**
**Given** E Fragment `#11` at `(0,0)` with no adjacent E ball; P hero `#1` at `(-2,0)`.
**When** P plays `cast test.pure40 #11`.
**Then** `#11` takes 50 (40 × 1.25). HP 100 → 50.

**R16 (Formation is capped at −30 %).**
**Given** E Fragment `#11` at `(0,0)` with E Fragments on `(1,0)(0,1)(-1,1)(-1,0)` (4 adjacent allies).
**When** P plays `cast test.pure40 #11`.
**Then** `#11` takes 28 (40 × 0.70). HP 100 → 72.

**R34 (level gap).**
**Given** P hero `#1` level 3; E Fragment `#11` level 1, isolated.
**When** P plays `cast test.pure40 #11`.
**Then** `Σ = +2500 + 1000`: `#11` takes 54. **And** with `rules.pvp = true`, **Then** 50 (gap off,
§6.5).

**R35 (Hero Guard: 35 % of max HP per ability).**
**Given** E hero `#11` HP 120 of 120, one adjacent E ally (Formation −10 %); P casts a test ability
`test.pure60` (Pure 60, test data).
**When** P plays `cast test.pure60 #11`.
**Then** the computed 54 is capped: HP loss 42 (`floor(3500 × 120 / 10000)`), effect `Damaged amount=42
guard_capped=true`. HP 120 → 78.

**R36 (damage is never below 1).**
**Given** E Fragment `#11` ARM 10 000; P Fragment ATQ 1 leads a legal push onto `#11`.
**When** the push resolves.
**Then** `#11` takes exactly 1 Choc damage.

**Dependencies.** `combat-engineer` (formula, Guard scope), `progression-designer` (`g(L)`),
`lead-game-designer` (Guard "per action" ruling, §7.6).

**Risks.** Isolation and Formation are exclusive and exhaustive (a ball has 0 allies or at least 1),
so no ball ever takes unmodified damage: worth knowing when reading balance (Feedback F9, not a
contradiction).

**Tags.** Percentages TUNE (§6.5); formula shape FINAL (§6.5, §24.1 integers); integer order PROPOSAL
(`gameplay-programmer.md` §9.1).

---

## Q6. Rule examples: death, hero, Edge danger, Graveyard, Revenants (§6.6)

**Gameplay points.** §6.6 0 HP removal and Remains, ejection kills, hero death loses the entity at
once (FINAL, #313), Edge danger computed with `legal_moves` and public, Graveyard entries raised once,
Revenants not Losses, score rule; §8.6 Revenant cap 3.

**R10 (an ejected hero dies and the solo fight is lost).**
**Given** P hero `#1` (w1) at `(4,0)`, no other P unit; E Brute `#11` w2 at `(2,0)`, E monster `#12` w1
at `(3,0)`. E active.
**When** E plays `move (2,0)(3,0)>E`.
**Then** legal (2 > 1; 3 > 1). `#1` ejected (`Ejected`, no Choc), `Loss entity=P cause=ejection`,
`EntityLeft P why=HeroDead`, `CombatEnded outcome=lost` for P, in this order. No further effect.

**R11 (Edge danger).**
**Given** the R10 position with P active.
**When** `edge_danger` is computed.
**Then** `#1` is `Could` (E plays before P's next turn and has a legal ejecting Mouvement). **Given**
the same with `#1` at `(0,0)` instead, **Then** `None`.

**R37 (Edge danger respects Weight).**
**Given** P hero `#1` w3 at `(4,0)`; E Fragments `(1,0)(2,0)(3,0)` w1. P active.
**Then** `None` (3 vs 1 but Weight 3 is not more than 3). **Given** E Fragments `(2,0)` w3 and `(3,0)`
w1 instead, **Then** `Could` (2 vs 1, Weight 4 vs 3). (Corrects the wording of `ux-designer.md` A.4
case 2, open question O5.)

**R38 (death at 0 HP leaves Remains; the hero at 0 HP loses too).**
**Given** E Fragment `#11` at `(0,0)` HP 10; E hero `#12` at `(1,-1)` HP 10.
**When** P plays `cast test.kill #11`.
**Then** `Died #11 corpse=true`, a Remains on `(0,0)` that blocks nothing, `Loss entity=E cause=death`.
**When**, on a later P turn, P plays `cast test.kill #12`, **Then** `EntityLeft E why=HeroDead` and the
fight ends.

**R17 (Revenant: raised once, not a Loss, no Remains).**
**Given** E Fragment `#11` was ejected earlier (Graveyard entry `g1`, cause ejection, E Losses 1); P
can cast `test.raise`.
**When** P plays `cast test.raise g1 @(0,0)`.
**Then** a Revenant `#20` of P stands on `(0,0)`; E Losses stay 1 (score rule). **When** P later kills
`#20` with `test.kill`, **Then** no `Loss` effect, no Remains, no resource from it. **When** P plays
`cast test.raise g1 @(0,0)` again, **Then** refused (entry already raised).

**R39 (Revenant cap).**
**Given** P has 3 Revenants on the board and Graveyard entry `g4` not raised.
**When** P plays `cast test.raise g4 @(0,0)`.
**Then** refused (cap 3, §8.6, outside Armée des morts).

**Dependencies.** `combat-engineer` (`edge_danger`, Graveyard), `ux-designer` (A.1 definition),
`class-designer` (Revenant data, R9).

**Risks.** Edge danger in a group (several opposing entities before the hero's turn) is a gap in
§6.6; R11 and R37 are solo. Feedback F5.

**Tags.** Hero death FINAL (#313); Edge danger "Could" semantics PROPOSAL (ux-designer A.1); Revenant
cap 3 TUNE (§8.6).

---

## Q7. Rule examples: turn structure, durations, cooldowns (§6.3)

**Gameplay points.** §6.3 turn start (resource, cooldowns, start effects), free order, mandatory
Mouvement, durations counted on the bearer, "Recharge N", 1 bonus Step per turn, Preparations (2 max,
fire in arming order, never chain), atomic resolution, 1 vs 1 simultaneous death; §0 "Vérification":
durations, cooldowns, bonus Step.

**R12 (Frozen 1 turn skips exactly one turn of the bearer).**
**Given** E Fragment `#11` at `(0,0)`; P active, turn 1.
**When** P plays `cast test.freeze1 #11`, `move (-3,3)>W`, `end`; E tries `move (0,0)>E`.
**Then** refused `Stunned`. E plays `move (3,-3)>E`, `end`: `StatusEnded #11 frozen` at E's turn end.
P plays a filler and ends. **When** E plays `move (0,0)>E` on its turn 2, **Then** legal.

**R13 (Cooldown 1 means every other turn; cooldown 0 means every turn).**
**Given** P has `test.cd1` (CD 1) and `test.pure40` (CD 0).
**When** P casts `test.cd1` on its turn 1, tries it on turn 2, tries it on turn 3.
**Then** turn 1 accepted, turn 2 refused `OnCooldown`, turn 3 accepted. And `test.pure40` is accepted
on turns 1, 2 and 3 (one Action slot per turn, so "once per turn").

**R14 (one bonus Step per turn, all sources).**
**Given** P has a passive granting a bonus Step at turn start (test data) and `test.haste`; P Fragment
`#2` at `(0,0)`.
**When** P plays `cast test.haste #2`, `step #2>E`, `step #2>E`.
**Then** the first Step is accepted, the second is refused `StepCapReached`.

**R40 (the Mouvement is mandatory when one is legal).**
**Given** P has a legal Mouvement.
**When** P plays `end` before any Mouvement.
**Then** refused `MustMoveFirst`. **Given** P has no legal Mouvement (every P ball boxed in), **When**
P plays `end`, **Then** accepted (the Mouvement is passed).

**R41 (free order inside the turn).**
**Given** P can cast `test.pure40` and `test.haste`.
**When** P plays `cast test.pure40 #11`, then a Mouvement, then `cast test.haste #2`, then `end`.
**Then** every action is accepted (§6.3 "Exemple d'ordre libre").

**R42 (Preparations: at most 2, in arming order, never chained).**
**Given** P armed Preparation A (test data: "when an E Mouvement pushes a P ball, `test.shove` the
front ball of the pushing group") then Preparation B (test data: "when an E ball is moved by a forced
displacement, deal Pure 5 to it").
**When** E pushes a P ball with a legal Mouvement.
**Then** A fires (`PrepFired A`) and shoves an E ball; B's condition is met by A's effect, but B does
not fire (a Preparation never fires from another Preparation's effect, §6.3). **When** P tries to arm
a third Preparation while two are armed, **Then** refused.
**And Given** two Preparations whose conditions are both met by the same E Mouvement, armed in the
order C then D, **Then** `PrepFired C` comes before `PrepFired D` (arming order, §6.3).

**R43 (atomic resolution: a dead ball is gone before the next elementary effect).**
**Given** a test ability `test.chain` that hits `#11` then bounces to the nearest E ball adjacent to
the last hit; `#11` HP 10 dies to the first hit; `#12` adjacent to `#11`.
**When** P casts it on `#11`.
**Then** `Died #11` comes before the bounce; the bounce picks `#12` from the state without `#11`.

**R44 (1 vs 1: both heroes die by the same effect, the active entity loses).**
**Given** a test ability `test.nova999` (Pure 999 to every ball within 1 of the caster, the caster
included, test data); P hero `#1` at `(0,0)`, E hero `#11` at `(1,0)`. P active.
**When** P casts it.
**Then** P loses. (OPEN until Feedback F4 defines "the same effect": with checks after each
elementary effect, `#11` and `#1` die in two steps and the first death would decide.)

**Dependencies.** `combat-engineer` (turn engine, slots, Preparations), `lead-game-designer` (G8 to
G12 rulings on durations and simultaneous death).

**Tags.** One bonus Step FINAL as written (§6.3); 2 Preparations TUNE; R44 OPEN.

---

## Q8. Rule examples: victory, flight, anti-stalling (§6.7, §6.8)

**Gameplay points.** §6.7 rout, hero death, leader death, camp defeat, flight (channel 1 turn, start
on the rim with no adjacent enemy, interrupted when moved), draws (repetition, no-Loss count,
skirmish retreat, boss draw is a loss), Usure, Brèche; §6.8 thresholds.

**R45 (rout).**
**Given** E rout threshold 3, E Losses 2; P can eject E Fragment `#11` with one push.
**When** P ejects `#11`.
**Then** `Loss` (E Losses 3), then `EntityLeft E why=Routed`: every E ball is removed at once; the
fight ends (E's camp has no entity left).

**R46 (leader death: the pack flees).**
**Given** E is a pack with leader `#11` (HP 10) and monsters `#12`, `#13`.
**When** P plays `cast test.kill #11`.
**Then** `Died #11`, `EntityLeft E why=LeaderDead`, `#12` and `#13` removed; P wins.

**R18 (flight interrupted by a forced move).**
**Given** a skirmish. P hero `#1` at `(-4,2)` (rim), no E ball adjacent; E hero `#12` at `(-1,2)`
(same row, distance 3, not adjacent); E has `test.pull` (Action, in line, range 3, pulls the first
ball of the line 1 cell toward the caster, no Éjecteur, test data).
**When** P plays `flee` (in place of its Mouvement) and `end` (`ChannelStarted #1 flee`); E plays
`cast test.pull #1`, a filler Mouvement and `end`.
**Then** `#1` moves to `(-3,2)` (`Moved how=Forced`), then `ChannelBroken #1`. At the start of P's next
turn P does not leave the board. (The same example with a shove blocked at the rim, where the hero
does not change cell, waits for Feedback F10.)

**R47 (flight succeeds).**
**Given** P hero `#1` at `(-4,2)` (rim), P Fragment `#2` at `(0,0)`, no E ball within 1 of `#1`; a
skirmish (not boss, PvP or BR).
**When** P plays `flee`, `end`; E plays a filler that does not touch `#1`, `end`; P's next turn starts.
**Then** `EntityLeft P why=Fled` with `#1` and `#2`; the fight ends with outcome `fled`, no XP, no loot.

**R48 (flight is refused next to an enemy, or against a boss).**
**Given** R47 with an E ball adjacent to `#1`. **When** P plays `flee`. **Then** refused. **Given** R47
in a boss fight. **Then** refused.

**R49 (Breach: terrain with a tell of 2 turns may remove several balls).**
**Given** a skirmish (radius 3) where the outer ring cracked with its 2-turn tell (§6.7: skirmish from
turn 18, TUNE); P Fragments `#2` at `(3,0)` and `#3` at `(-3,0)` still on the ring when it turns to
Chasm.
**When** the tell fires.
**Then** both are removed in the same terrain event: P Losses +2 (exception of §6.10 rule 2).

**R50 (no-Loss draw and skirmish retreat).**
**Given** a skirmish whose no-Loss counter is one short of its threshold (§6.7 "60 tours d'entité",
TUNE, Feedback F2).
**When** the next entity turn ends without a Loss.
**Then** `CombatEnded outcome=draw`, both sides retreat, no XP. **Given** a boss fight, **Then** the
same draw is a loss for the player (FINAL, `rules.md` §9).

**Tags.** Thresholds TUNE (§6.7, §6.8); boss draw = loss FINAL; the blocked-shove variant of R18
OPEN (F10).

---

## Q9. Properties of the combat engine (§24.1, §6.3, §6.6, §6.10, §6.11)

**Gameplay points.** §24.1 determinism and "le hash d'état couvre tout"; §6.3 atomic resolution, slots,
bonus Step; §6.6 hero death, Graveyard; §6.10 ejection limits, golden rule, mass control cap;
§6.11 Weight bounds, Lassitude; §1 pillar 2 previews; §6.7 the fight ends.

**Implementation.** `crates/abalone-rpg/tests/invariants.rs`, one driver (`drive` of Q1), every
property checked on every step of every generated fight. Fast tier 200 fights of at most 200 actions
(TUNE); deep tier 20 000 fights (TUNE). Each property names the phase from which its content exists.

| Id | Property | Source | From |
|---|---|---|---|
| P3 | Conservation: units on board + Graveyard + left the board = units at setup + summoned; ids are never reused | §6.6, §24.1 | R1 |
| P4 | At most 1 ball leaves the board per action, unless every extra removal comes from terrain whose tell started at least 2 turns before | §6.10 rules 1, 2 (FINAL #313) | R1 |
| P5 | An ability without the Éjecteur keyword never removes a ball by displacement, slides included | §6.10 rule 3 | R2 |
| P6 | A hard control area effect leaves at most 3 balls newly Stunned or Frozen | §6.10 | R2 |
| P7 | Every action of `legal_actions` is accepted by `apply_action`; a refused action leaves the state hash unchanged; nothing panics | §6.3, pillar 4 | R1 |
| P8 | `replay(setup, log)` gives the live run's hash and the same effect lists | §24.1, §25 R1 | R1 |
| P10 | For every unit on the board, `1 <= hp <= hp_max`; a unit at 0 HP is never on the board after an elementary effect | §6.3, §6.6 | R1 |
| P11 | After a hero dies (0 HP or ejected), its entity has left and plays no further action | §6.6 (FINAL #313) | R1 |
| P12 | Every `Damaged` amount is at least 1 before Guard; a hero's HP loss within one action is at most `floor(3500 × hp_max / 10000)` | §6.5 | R1 |
| P13 | Every unit's effective Weight is within 1 to 5 in every state | §6.4, §6.11 | R1 |
| P14 | Per entity turn: at most 1 Mouvement, 1 Action, 1 Quick Action, 1 bonus Step | §6.3 | R1 |
| P15 | Each Graveyard entry is raised at most once; a Revenant's removal emits no `Loss` | §6.6 | R9 |
| P16 | Liveness: every generated fight ends (outcome set) within 400 rounds (TUNE), via Breach and draws | §6.7 | R2 |
| P17 | Edge danger is sound: `None` means no Mouvement of the next opposing entity ejects the hero (checked exhaustively on the cloned state); `Could` comes with a witness action that does | §6.6 | R1 |
| P18 | `preview(s, a).effects == apply_action(s, a).effects` | §1 pillar 2 | R1 |
| P19 | The frieze (turn order) of a setup is the same whatever the order of units and entities in the setup lists | §6.2, §24.1 | R1 |

- P16 is a measure as much as a test: a failure files a `bug` with the seed, it does not loosen the
  cap (PROPOSAL).
- P17 is the only property with an inner exhaustive search; its fast tier uses radius 3 boards
  (TUNE) to stay within 20 s.

**Hash coverage (P9)** (`hash_coverage.rs`, PROPOSAL):

- A list of mutators, one per field of `CombatState`, `Entity` and `Unit` (for example "add 1 HP to
  unit 1", "advance one cooldown", "arm a Preparation", "add a Graveyard entry", "move the active
  index"). For each, `state_hash(mutated) != state_hash(original)`.
- Compile guard: the test destructures `CombatState { rules, region, terrain, units, entities, frieze,
  active, round, phase, corpses, graveyard, tells, counters, outcome }` **without** `..`; adding a
  field breaks the build until a mutator is added for it.
- Order insensitivity: a state built from a setup whose unit list is shuffled hashes the same (units
  are sorted by id, §24.1).

**Dependencies.** `combat-engineer` (API of `gameplay-programmer.md` §4.4, a `Clone` state, field list),
`devops-build` (deep tier at L3, wasm32 replay), `ux-designer` (preview contract for P18).

**Risks.**
- `legal_actions` may grow large with abilities (§6.10 targets); the driver samples one action, so the
  cost is the enumeration, measured in the R2 PR (TUNE).
- A property that is too permissive (P4's terrain exception) can hide a bug: P4 checks the tell age
  from the `TellPlaced` effect, not from a flag the engine sets.

**Tags.** P4, P11 FINAL (#313); P3, P7, P8, P10, P12 to P14 FINAL as rules of §6 and §24.1; P5, P6
FINAL as written in §6.10; P16 to P19 PROPOSAL; counts TUNE.

---

## Q10. Determinism, golden logs, saves and resume (§24.1, §6.12, §4.7)

**Gameplay points.** §24.1 integers, fixed order, hash covers everything; §6.12 state saved after
every action in IndexedDB store `combat`, resume after reload, catch-up from the move log (#226);
§6.12 boss retry in under 5 s with the same seed; §25 R1 "même log = même hash".

**Implementation.**

- **Golden coverage rule** (PROPOSAL, files owned by `combat-engineer`, devops-build D3): at least one
  golden log per combat format of §6.8 present in the current phase, one per class from R2, one
  stitched fight from R8, one group fight (4 entities) and one arena from R10. This role adds the
  missing logs in its phase PRs by recording a seeded `drive` run (Q1) and pinning its hash.
- **Save round trip S1** (R1, combat store): for every state reached by the fast tier of Q9,
  `decode(encode(s)) == s` and the hash is unchanged (`gameplay-programmer.md` §5.5).
- **Hero save S2** (R3, `abalone-world`): same round trip on random hero saves (level, Paths, active
  tree, inventory from R5), and a saved file of format version N−1 kept under `tests/saves/` loads
  and migrates (PROPOSAL: one file per past version, never deleted).
- **Resume in the browser** (e2e, R4, section Q16 E-R4-4): play actions, read `data-state-hash`,
  reload, the same hash.
- **Retry timing** (§6.12): measured engine side by `ai-engineer`/`client-engineer` in a dedicated
  e2e (devops-build D10 point 6); this role asserts only the state: after "retry" the
  `data-state-hash` equals the hash of the boss fight's initial state (same seed, §6.12).

**Dependencies.** `combat-engineer` (encoding, hash), `tech-lead` (save format and versioning),
`client-engineer` (IndexedDB stores, hooks), `network-engineer` (catch-up from the log).

**Tests.**
- Given a golden log and its pinned hash, When it is replayed natively, Then the hash matches; Given
  a rules change that alters it, Then the PR updates the hash and bumps `RULES_VERSION` in the same
  PR (devops-build D3 risk).
- Given a save of version 1 in `tests/saves/hero-v1.json`, When version 2 ships, Then it loads with
  the documented defaults for new fields.

**Risks.** Golden logs recorded with a bot become stale when the bot changes; record them as **action
lists** (replay never searches), as the boss fixtures do (T4).

**Tags.** Same log same hash FINAL (§25 R1); 5 s TUNE (§6.12 claim); coverage rule PROPOSAL.

---

## Q11. Data integrity and tuning snapshots (§1 pillar 6, §24.3)

**Gameplay points.** §24.3 integrity checks: every reference exists, point budgets, no cost above the
max resource, every ability has a counter, every Éjecteur has a tell or is an ultimate, every mass
control hits at most 3; §1 pillar 6 content is data.

**Implementation.**
- Each content role writes the check for its data (`lead-game-designer.md` §4.6 list).
- This role adds **one negative fixture per rule** under `crates/<crate>/tests/bad-data/<rule>/`: a
  minimal data set that breaks exactly that rule, and a test that asserts the loader or the integrity
  pass fails with the rule's message (PROPOSAL). Without it a check that never fires stays green.
- **Tuning snapshots** (PROPOSAL): `tests/snapshots/<kind>.txt`, a sorted text dump of every
  number of every class, ability, monster and item (one line per value: `id.field = value`). A test
  compares the dump with the file; a tuning PR regenerates it (`UPDATE_SNAPSHOTS=1 cargo test`), so
  every number change shows in the diff and nothing changes by accident.
- **Ability coverage gate** (R9, PROPOSAL): every ability id in `data/` appears in at least one `.scn`
  file (`cast <id>`), checked by a test that scans the scenario folder.

**Dependencies.** `tech-lead` (loader and error format), `devops-build` (D6 pipeline), every content
role (the checks).

**Tests.** Given `bad-data/ejector-no-tell/` (one non-ultimate Éjecteur with `tell: 0`), When the
integrity pass runs, Then it fails naming the ability id. Same pattern for each rule.

**Risks.** Snapshot files churn on every tuning PR; that churn is the point (review sees it), but
two tuning PRs at once conflict (CONTRIBUTING rule 16 already orders them).

**Tags.** The 6 checks FINAL (§24.3); negative fixtures and snapshots PROPOSAL.

---

## Q12. Progression: budgets, curve and the scripted 1 to 30 (§9, §10, §11, §25 R3)

**Gameplay points.** §9.1 99 passive points (5 + 30 + 10 + 54), rows gated at 8 and 16 points, the
secondary Path at 20, shard rank `min(6, 1 + ⌊L/16⌋)`, "available never exceeds spendable"; §10 20
active points, ranks 1/1/2, tiers at levels 5, 15 (2 points), ultimate at 30 (4 points); §11 XP
curve `C(n) × XP_ref(n)`; §25 R3 "Du niveau 1 au niveau 30 en test scripté".

**Implementation** (`crates/abalone-world/tests/progression.rs`, exhaustive where cheap):

- **G1** (exhaustive, L = 1 to 100): passive points available `L − 1` (FINAL arithmetic: 1 point per
  level from level 2) is at most the spendable maximum `45 + 9 × min(6, 1 + ⌊L/16⌋)`; at L = 100 both
  are 99. Checked by the validator itself: a greedy allocator spends every available point legally.
- **G2**: the validator refuses each illegal allocation: a third rune in a row, row 2 below 8 points,
  secondary Path below 20, a shard above its level cap, a second keystone.
- **G3** (exhaustive over the 2 branches of each class): at level 30 a build with the ultimate exists
  (4 points in the branch + 1 for the ultimate = 5 ≤ 6 points, FINAL arithmetic of §10); at level 29
  none does; the §10 Warrior table is a legal sequence step by step.
- **G4**: the XP curve is strictly increasing for n = 1 to 99; the total to 100 is pinned in the
  snapshot (TUNE values).
- **Scripted 1 to 30** (§25 R3 exit, PROPOSAL reading of an unclear criterion, Feedback F14): a test
  hero starts at level 1, the script grants XP only through the real sources (fight results from
  `drive` fights won against level-banded packs, quest completions) until level 30, spending every
  point with a fixed script; it asserts the unlocks of §11 at their level (2, 5, 10, 15, 20, 30) and
  that the save round trip (S2) holds at each level.

**Dependencies.** `progression-designer` (validator, curve), `narrative-quest-designer` (tutorial quests
1 to 4), `combat-engineer` (fights for XP).

**Tags.** 99 and 20 FINAL arithmetic of §9.1 and §10; curve values TUNE; scripted test PROPOSAL.

---

## Q13. World: generation, tiling, movement (§4.1 to §4.5, §5.2)

**Gameplay points.** §4.1 radius 60 (10 981 tiles, FINAL arithmetic `3·60·61 + 1`), tile seed
`hash(graine_monde, q, r)`, tile-to-board tiling `q·(9,−4) + r·(4,5)`; §4.2 A* with biome costs,
fog radius 3; §4.5 same tile same board, no special cell on a start cell, PvP start point-symmetric.

**Implementation** (`crates/abalone-world/tests/invariants.rs`):

| Id | Property | Tier |
|---|---|---|
| W1 | Same world seed, same world: the hash of every tile's biome and content is pinned (golden, devops-build D3 point 4) | L1 |
| W2 | Tiling is a partition: for every combat cell within distance 40 of the origin (TUNE), exactly one tile centre is within distance 4 | L1 |
| W3 | Two adjacent tiles give boards whose cells are adjacent across the seam and never overlap (§4.6) | L1 |
| W4 | `tile_board(seed, q, r, format)` is a pure function: called twice, equal; it never puts a special cell on a start cell of that format (§4.5) | L1 (200 tiles), L3 (10 000) |
| W5 | PvP boards: for every cell `c`, `terrain(c)` and `terrain(−c)` match, with directional cells (Slope, Vent) rotated by 180° (PROPOSAL, Feedback F11) | L1 |
| W6 | A* returns a path whose cost equals Dijkstra's on 500 random 15-tile-radius maps (TUNE) | L1 |
| W7 | Fog: after a step, the set of discovered tiles is the previous set plus every tile within distance 3 of the ball | L1 |

**Dependencies.** `world-designer` (generator, region builder, A*), `pvp-br-designer` (symmetric start
layout).

**Risks.** Ice's world rule ("on glisse d'une tuile de plus", §4.2) changes path cost and end tile:
W6 must use the same cost model as the game, not a plain sum.

**Tags.** Tile count and tiling formula FINAL arithmetic of §4.1; sample sizes TUNE; W5 PROPOSAL.

---

## Q14. Bosses: RPG win fixtures and multi-tile fights (§18, §17, §4.6, §25 R8)

**Gameplay points.** §18 "Un boss ne sort que s'il a gagné une échelle de bots RPG", phases on boss HP
%, the Heart Unejectable or Resilient, intents, enrage; §25 R8 "Une fixture de victoire RPG par
boss"; §4.6 stitched boards; §18 The Hull's middle board collapses in phase 2.

**Implementation.**
- **Fixture format** (PROPOSAL, extends `encounter/fixture.rs` text): header `boss=<id> seed=<n>
  rules=<RULES_VERSION> budgets=<player>/<boss>`, then the `CombatSetup` id or inline `.scn` Given
  block, then one action per line in the notation of `gameplay-programmer.md` §4.7, both sides in
  order. Recorded by `ai-engineer`'s ladder (`LADDER_FIXTURES`, existing pattern).
- `crates/abalone-rpg/tests/rpg_boss_fixtures.rs`: for each boss, replay through `replay` and assert
  `outcome = Won` for the player, twice equal (T4 pattern). A boss without a fixture is not released
  (§18, FINAL as a rule).
- Scenario examples per boss mechanic (one `.scn` each): phase trigger at 70 % and 35 % HP (TUNE), the
  Resilient Heart returns to the centre and loses 25 % max HP, the Echo copies only the Mouvement, the
  Chaplain never converts a hero, The Hull's middle tile becoming Chasm with its tell.

**Dependencies.** `encounter-boss-designer` (boss data, mechanics), `ai-engineer` (ladder and recording),
`combat-engineer` (replay), `qa-balance` (reading).

**Risks.** The Chaplain and the Ballast Mind have no classic win fixture yet (`boss-balance.md` §4);
§18 keeps them blocked: the test lists them as expected-missing until a fixture exists, so the gap
stays visible.

**Tags.** One fixture per boss FINAL (§25 R8); phase percentages TUNE (§18).

---

## Q15. Loot, economy, quests, crafting (§12 to §16, §25 R5 to R7)

**Gameplay points.** §12 personal loot seeded by `(sauvegarde, id du combat)`, item stats
`base × g(iLvl)`, bound when equipped; §13.3 prices; §14 nodes and respawn; §15 recipes and quality
roll from the save seed; §16 quest format and state in the hero save.

**Implementation.**
- **L1** loot determinism: same `(save seed, combat id)` gives the same drops; a different combat id
  gives a different roll in at least 99 % of 1 000 pairs (TUNE).
- **L2** distribution snapshot: 10 000 seeded rolls per drop table (TUNE), counts per rarity written to
  the snapshot file (section Q11); a change shows in review. No statistical threshold in CI (the
  rolls are fixed, so the numbers are exact).
- **L3** price identities: sell price = 20 % of value (TUNE §13.3), buyback holds the last 10 items
  (TUNE), exhaustive over the item kinds in data.
- **Quest machine** (§16): for a random sequence of game events (combat `Effects`, gather, craft,
  talk), the quest state only moves forward, an event applied twice counts once when it carries the
  same event id, and the state survives the save round trip.
- **Scripted R6 chain**: the zone 1 chain from accept to reward, driven by events, asserts every step.
- **Scripted R7 craft**: gather the recipe's inputs from seeded nodes, refine, craft, and get an item
  whose iLvl is inside the recipe's range (§15.3).

**Dependencies.** `economy-designer` (tables, prices, recipes), `narrative-quest-designer` (quest
engine, chains), `combat-engineer` (Effects as quest events).

**Tags.** 20 % and 10 TUNE (§13.3); sample counts TUNE; properties PROPOSAL.

---

## Q16. e2e scenario catalog (§24.5, §25)

**Gameplay points.** §1 pillar 2 previews before confirm; §4.4 level colour and glyph; §4.5 unfold
animation (one frame in reduced motion); §6.6 Edge danger glyph, crumble of 400 ms; §6.12 retry and
resume; §24.5 action bar keys 1 to 4, R, F, Space, Q W E A S D for directions; §25 exits.

**Implementation.** Specs in `client/e2e/rpg-r<N>.spec.ts` with the helpers of devops-build D10
(`startScenario`, `fixedTime`, `calm`, `combat`). Each spec: setup by hook, the flow under test by
real clicks and keys, assertions on `body[data-*]` and the HUD live region. Reduced motion on, clock
installed, so no test waits on an animation (FINAL as a rule of this suite, T8).

Page contract read by the specs (PROPOSAL, agreed with `client-engineer` and `ux-designer`, devops-build
D10): `body[data-combat]` (`none|placing|running|won|lost|draw|fled`), `body[data-entity]`,
`body[data-state-hash]`, `body[data-edge-danger]` (format: open question O5), and the hook
`window.__rpgAct(text)` that plays one action in notation (setup only, never for the flow under test).

| Id | Phase | Given | When | Then |
|---|---|---|---|---|
| E-R1-1 | R1 | Scenario R2 loaded | The player selects `(-2,0)(-1,0)` and hovers E | The preview reads "2 against 1 · Weight 4 against 3" before any confirm; no state change (`data-state-hash` unchanged) |
| E-R1-2 | R1 | Same | The player confirms | `#11` drawn at `(1,0)`, its HP ring shows 88 of 100, `data-state-hash` equals the scenario's expected hash |
| E-R1-3 | R1 | Scenario R11 (hero on the rim) | Page loads | `data-edge-danger` shows the hero in danger; live region contains "Edge danger"; after the player moves the hero inward, the attribute clears |
| E-R1-4 | R1 | Scenario R10, E to play (bot off, E's move by `__rpgAct`) | The push resolves | `data-combat=lost`; the defeat banner shows; the retry control is focused |
| E-R1-5 | R1 | R1 test hero with Fendoir and Percée | Key `1`, click a target, key `Space` after the Mouvement | Fendoir's cooldown shows on the bar; Rage changes by the data value; turn passes (`data-entity` changes) |
| E-R1-6 | R1 | A recorded winning skirmish log | All but the last P action played by `__rpgAct`, the last one by clicks | `data-combat=won`; reward panel visible; hash equals the golden log's |
| E-R2-1 | R2 | A board with every terrain type of R2 | Page loads | Every special cell carries its glyph element (§5.1 "un glyphe obligatoire"); screenshot attached to the PR |
| E-R2-2 | R2 | Mage Nova on 4 adjacent enemies | Cast | The UI asks the player to pick at most 3 (§6.10) |
| E-R3-1 | R3 | Hero at 1 XP from level 2 | Win a fight | Level up shown; the Paths window opens; a point spent; reload; still spent |
| E-R4-1 | R4 | World at a fixed UTC time, hero on a Plains tile | Click a tile 3 steps away | With `page.clock` advanced 900 ms (3 × 300 ms, TUNE §4.2), the ball is on the target; fog cleared within 3 |
| E-R4-2 | R4 | A pack 2 tiles away | Walk into its aggro radius | Ambush: transition, `data-combat=placing`, the pack plays first |
| E-R4-3 | R4 | A lost fight in the world | Defeat | Hero at the last Beacon, full HP after the Beacon heal (§4.2), durability −10 % (TUNE) |
| E-R4-4 | R4 | Mid-fight after 3 actions | Reload the page | `data-combat=running`, `data-state-hash` equal to before the reload (§6.12) |
| E-R5-1 | R5 | A won fight with a fixed loot seed | Loot, open inventory, sell one item, equip another | Gold +20 % of value (TUNE); hero sheet stat changed |
| E-R6-1 | R6 | Zone 1 chain, last step pending | Complete it | Journal marks it done; map marker `?` gone; marker glyph present while it was shown |
| E-R7-1 | R7 | Materials for a recipe gathered (clock advanced past the 3 s channel, TUNE §14) | Refine then craft | The item is in the inventory |
| E-R8-1 | R8 | The Echo fight | Lose, then press retry | `data-combat=placing` again and `data-state-hash` equal to the fight's initial hash (same seed) |
| E-R10-1 | R10 | Two tabs, `?net=hook`, a duo skirmish | Each tab plays its turns | Both tabs show the same `data-state-hash` after every action; frieze order J1, M1, J2, M2 |
| E-R10-2 | R10 | Two tabs, ranked 1v1 arena | Players with different gear | Both heroes show the level 100 template stats (§19) |

- Every Rx exit spec runs the whole classic suite unchanged next to it (section 3.3).
- A spec that changes the UI ships a screenshot in its PR (CONTRIBUTING §6.4, FINAL).
- Group of 3 or 4 (§4.7) is not in the 2-tab exit criterion: it is covered by the in-process test N1
  (Q17) and, if `devops-build` adds the `@multi` entry, by a 4-page spec (Feedback F16).

**Dependencies.** `client-engineer` (hooks, attributes, scenes), `ux-designer` (texts and glyph
names), `devops-build` (helpers, tags, shards), `network-engineer` (hook transport for E-R10).

**Risks.** Each spec costs 20 to 40 s on CI (TUNE, devops-build D10): one exit spec file per phase,
with tests that share one page where the flow allows.

**Tags.** Times and percentages are those of the gameplay spec (TUNE); ids and contract PROPOSAL.

---

## Q17. Netcode, PvP and battle royale (§4.7, §19, §20)

**Gameplay points.** §4.7 group of 4 max, no authority over combat, every peer validates every action
in the signed log, commit-reveal seeds; §19 normalized ranked arena; §20 BR orders resolved in
initiative order, each validated at its turn.

**Implementation** (scenarios for `network-engineer`'s in-memory fake transport, tech.md §10):

| Id | Scenario | Expect |
|---|---|---|
| N1 | 4 peers, one group fight, the transport drops 10 %, duplicates 10 %, reorders within 5 messages (TUNE) | Every peer ends with the same state hash after every action |
| N2 | One peer sends an action that `apply_action` refuses | Every other peer refuses it and flags the sender (as `rules.md` §10.2) |
| N3 | One peer sends a valid action with a wrong post-state hash | Desync detected, fight paused, both logs available |
| N4 | Commit-reveal: a peer reveals a nonce that does not match its commit | Seed draw fails for that peer, the others see the cause |
| N5 | A 5th peer tries to join a group | Refused (party max 4, FINAL #313) |
| N6 | BR: the same round's orders delivered in every permutation of arrival | The same resolved state (resolution follows initiative, not arrival) |
| N7 | Ranked arena: two heroes of the same class and build, different gear | Equal stats at fight start (§19 normalization) |

**Dependencies.** `network-engineer` (fake transport, protocol), `pvp-br-designer` (template, BR
resolver), `combat-engineer` (validation, hash).

**Tags.** Party max 4 FINAL; fault rates TUNE; scenarios PROPOSAL.

---

## Feedback on the gameplay spec

Contradictions and gaps found while writing testable examples. None is fixed here.

- **F1. The state hash is not specified (§24.1, §25 R1).** "Même log = même hash" needs a hash that is
  the same on native and wasm32 and across Rust releases; today's `DefaultHasher` is neither (T3). The
  gameplay spec should name a stable algorithm or delegate it explicitly (`combat-engineer` proposes
  FNV-1a 64).
- **F2. "60 tours d'entité sans Perte" (§6.7) is ambiguous and collides with the Breach.** Counted over
  all entities, it is 30 rounds in solo, the same round the Breach starts (30), and 7.5 rounds in a
  group of 8 entities. Counted per entity, it is 60 rounds. An example cannot be written until the
  unit is fixed (the lead proposes 40 rounds, G14).
- **F3. The hash coverage list of §24.1 is incomplete.** It omits the turn slots used, the active
  entity and frieze, anti-stalling counters, tells, once-per-combat flags (Instant suspendu, Paradoxe),
  Lassitude and diminishing-return timers, Revenant expiry of Armée des morts. A missing field makes
  two different states equal for repetition (§6.7) and for desync checks (§4.7).
- **F4. "Effet élémentaire" vs "meurent par le même effet" (§6.3).** If the state is checked after each
  elementary effect, two heroes never die "by the same effect" unless one elementary effect can hit
  several targets. Define the elementary effect (one primitive on one target, or on all its targets).
  R44 stays OPEN until then.
- **F5. Edge danger "au prochain tour" in groups (§6.6).** With a frieze J1, M1, J2, M2, several opposing
  entities may play before the hero's next turn; "calculé avec `legal_moves`" also ignores Éjecteur
  abilities and ice slides caused by abilities. The threat set must be listed per phase (ux-designer
  A.1 proposes one).
- **F6. Choc timing with Ice (§6.5, §5.1).** "Le déplacement est résolu d'abord" does not say whether
  the slide is part of the displacement, nor which ball is "la première boule de la file" when the
  front ball slid off. R8 assumes: Choc after the slide, on the first run ball still on the board.
- **F7. Ice and groups (§5.1).** "Un groupe de 2 ou 3 qui bouge volontairement ne glisse pas" but a
  pushing group whose members end on Ice is not covered, nor a group of which one member enters Ice.
- **F8. A voluntary single move onto Ice can slide its own ball off the board (§5.1, §6.10).** A
  Mouvement may eject, so stepping onto an Ice run to the rim would eject one's own ball, and a hero
  doing so dies. Classic Abalone forbids moving one's own marble off the board (`rules.md` Example
  12). Say whether such a Mouvement is illegal, or legal with self-ejection.
- **F9. Isolation and Formation are exhaustive (§6.5).** A ball has 0 allies (+25 %) or at least 1
  (−10 % or more): unmodified damage never happens. Not a contradiction, but every balance number
  reads through one of the two.
- **F10. Flight interruption by a blocked forced move (§6.7, §6.10 rule 3).** A non-Éjecteur shove
  toward the rim leaves the hero on its cell and deals a Choc. Is it "poussé ou déplacé"? R18 cannot be
  laid out until this is said.
- **F11. Point-symmetric PvP boards with directional cells (§4.5, §5.1).** Slope and Vent carry a
  direction; a point reflection must also turn it by 180°, and Mud or Ice rows across the centre must
  stay fair. Not said.
- **F12. Quicksand and Éboulements eject or crush with a 1-turn tell (§5.1, §5.2 Le Puits).** §6.10
  allows several removals only for terrain with a tell of at least 2 turns. Several balls swallowed at
  one turn start, from one terrain type, break the "1 ejection per action" rule as written; and a ball
  on a cell that becomes Rock has no rule.
- **F13. R2 exit "chaque classe bat la meute de référence" (§25) has no threshold and no reference
  pack.** `boss-balance.md` uses 7 of 10 seeds at 10× budget; the RPG gate needs its own numbers.
- **F14. R3 exit "du niveau 1 au niveau 30 en test scripté" (§25) does not say what the script does**
  (play fights through a bot, or grant XP). Q12 proposes real XP sources.
- **F15. Tie-breaks are missing wherever a "best" or "order" is chosen.** Within a camp the order "suit
  la VIT du héros" (§6.2) has no tie-break outside PvP; the monster AI "3 meilleures cibles" (§5.3) and
  the Résilient Heart "revient au centre" (§18, centre occupied?) have none. A missing tie-break is a
  desync between peers. One rule for all (fixed cell order, then unit id) would close it.
- **F16. §25 R10 exit tests 2 tabs, but a group is up to 4 (§4.7).** The 3- and 4-player frieze, the
  one-pack-per-player rule (§6.2) and boards of 2 or 3 tiles (§6.8) are not in any exit criterion.
- **F17. Durations applied during the bearer's own turn (§6.3).** "Jusqu'à la fin du N-ième tour de
  l'entité qui le subit": a Frozen 1 applied by a Preparation or a terrain effect **during** the
  bearer's turn ends at the end of that same turn and deprives nothing. Say whether the current turn
  counts.
- **F18. Inéjectable vs terrain removal (§6.11, §6.7 Brèche, §5.2 Marée).** "Une poussée ou un effet qui
  l'éjecterait est illégal": a Breach ring turning to Chasm under an Unejectable ball is not a push
  and cannot be "illegal". Removed, or kept on a void cell?
- **F19. Not every ability is expressible with the 12 primitives (§1 pillar 4, §6.10).** Paradoxe
  (rewind the board), Arrêt du temps (skip the target's slots and timers), Rotation (rotate 7 cells),
  Avalanche (a 4-ball group) and Écrasement (an illegal push turned into damage) need engine rules,
  so an integrity check "every ability uses only the primitives" would fail on them.
- **F20. "Point d'origine" of the multi-target order (§6.10) is undefined** for board-wide effects
  (Peste, Aube, Zéro absolu's freeze picks) and for Zone effects (caster or centre?).
- **F21. "Moins de 5 s" for a boss retry (§1 pillar 3, §6.12) has no reference device.** A browser timing
  on CI software WebGL is not a reliable gate; the claim should be engine-side (defeat to placement
  ready) on a named machine.
- **F22. "Id du combat" for the loot seed (§12) is undefined.** If a retry with the same seed (§6.12)
  reuses the same id, a won retry repeats the same loot; if not, what makes it unique and
  deterministic for replay?

---

## Open questions

- **O1.** Property tests as seeded loops with the shared `abalone_core::seed`, no `proptest` (T1).
  `tech-lead` confirms, or adds `proptest` for every crate at once.
- **O2.** Scenario format: the `.scn` text of `gameplay-programmer.md` §4.7 or the RON of
  `lead-game-designer.md` §4.4. One format for all examples; this file writes the examples in
  Given/When/Then so either works. `tech-lead` decides.
- **O3.** Doc sync: the lead's test reads `rules.md` with `include_str!` to match example ids to
  files, while devops-build D5 forbids tests that parse docs (a docs-only PR skips CI). Proposal: keep
  the sync test, and require that a PR editing §10.5 examples also edits the matching `.scn` file (so
  it is not docs-only and CI runs). `devops-build` and `lead-game-designer` agree?
- **O4.** Test-only content pack `data/test/`: path, and the guarantee that the game never loads it.
  `tech-lead`.
- **O5.** `body[data-edge-danger]`: a count (devops-build D10) or `hero:could` (ux-designer A.4)? One
  contract. Also ux-designer A.4 case 2 reads "Then `could` … : `none`" for 3 Fragments against a w3
  hero; R37 gives the corrected pair of cases.
- **O6.** Should P16 (every fight ends within 400 rounds, TUNE) be a blocking L1 property or a nightly
  report? Proposal: blocking at L3 only.
- **O7.** Who records the golden logs per class (R2) and per format: this role from `drive` runs (Q10),
  or `combat-engineer` with each feature? Proposal: the feature PR adds one, this role fills gaps.
- **O8.** Snapshot tests of tuning numbers (Q11): accepted as the way tuning changes are reviewed?
  `lead-game-designer`, `qa-balance`.
- **O9.** The blocked-shove variant of R18 (flight interrupted when the hero does not change cell)
  needs the F10 ruling before it is written.

---

## Tasks (one PR each)

Each Task is a sub-issue of the RPG Epic (§0). Code Tasks follow strict TDD and the 100 % gate; Tasks
that add tests over code already on `main` say so in their PR body (section 2.2).

### QA-01 (R0) Exact RPG examples for `rules.md` §10.5
- **Outcome:** every §10.5 example has an exact layout, action and expected result with no reading
  left to the implementer.
- **Done:**
  - [ ] R1 to R50 of this file proposed to `lead-game-designer` for §10.5 (docs PR 1, or a follow-up
        docs PR after it merges, rule 16)
  - [ ] Every example tagged; OPEN ones (R44, the blocked-shove variant of R18) point to their
        Feedback item
  - [ ] Feedback F1 to F22 posted as one comment on #313

### QA-02 (R0) RPG test strategy in `tech.md` §10
- **Outcome:** `tech.md` §10 says which level proves which gameplay point and what each phase exit runs.
- **Done:**
  - [ ] Sections 2 and 3 of this file condensed into `tech.md` §10 (after `devops-build`'s DB-00 merges,
        same file, rule 16)
  - [ ] Traceability table §-point to test id
  - [ ] Owner review

### QA-03 (R1) One shared seeded generator
- **Outcome:** `abalone_core::seed` replaces the two private splitmix64 copies and feeds every test
  generator.
- **Done:**
  - [ ] Test first: the 3 recorded values of the current `hull.rs` chain from seed 0
  - [ ] `hull.rs` and `ladder.rs` use `seed::next`; their copies deleted
  - [ ] Boss fixtures and the whole suite green; 100 % coverage

### QA-04 (R1) Weighted equals Classic suite
- **Outcome:** the §6.4 invariant is proved by pinned perft, random positions and random games, fast
  at L1 and deep at L3.
- **Done:**
  - [ ] Perft counts pinned from today's engine before the push predicate change
  - [ ] P1a, P1b, P1c, P2 in `weighted_classic.rs`, L1 under 20 s instrumented, deep tier `#[ignore]`
  - [ ] Manual mutation check (`>=` instead of `>`) recorded in the PR body

### QA-05 (R1) R1 rule scenarios
- **Outcome:** the R1 rules of §10.5 run as scenario files in the required check.
- **Done:**
  - [ ] `.scn` files for R1 to R4, R6, R7, R10, R11, R13, R14, R15, R16, R25, R32 to R38, R40, R41,
        R45, R46 (the R1 content of `lead-game-designer.md` §10.2: no terrain, no status)
  - [ ] Test abilities of section 2.3 in the test pack
  - [ ] `scenario_index.rs`: no example without a file, no file without an example

### QA-06 (R1) Random fight invariant suite
- **Outcome:** P3, P4, P7, P8, P10 to P14, P17 to P19 hold over seeded random R1 fights.
- **Done:**
  - [ ] `gen.rs` (`gen_setup`, `drive`, `to_scn`) and the minimizer
  - [ ] Generator coverage counters (an ejection, a `TooLight`, a hero death in the fast tier)
  - [ ] Fast tier at L1, deep tier `#[ignore]`

### QA-07 (R1) Hash coverage test
- **Outcome:** every field of the combat state changes the state hash, and a new field cannot be added
  without a mutator.
- **Done:**
  - [ ] Destructuring guard without `..`
  - [ ] One mutator per field; order-insensitivity case
  - [ ] Combat save round trip S1 over the fast tier states

### QA-08 (R1) R1 exit e2e
- **Outcome:** the R1 vertical slice is proved in Chromium: preview, push, Edge danger, hero death,
  abilities, a won fight.
- **Done:**
  - [ ] `client/e2e/rpg-r1.spec.ts` with E-R1-1 to E-R1-6
  - [ ] Classic specs unchanged and green; one full local e2e run
  - [ ] Screenshot of the preview and the Edge danger glyph in the PR

### QA-09 (R2) Terrain and status scenarios
- **Outcome:** the R2 terrain types and statuses are proved by scenario files.
- **Done:**
  - [ ] R5, R8, R12, R18, R19 to R21, R23, R24, R26 to R31, R42, R43, R47 to R50
  - [ ] Diminishing returns and Tenacity examples written with `combat-engineer`
  - [ ] Scenario index green

### QA-10 (R2) Ability-aware invariants
- **Outcome:** P5, P6 and P16 hold once abilities, statuses and terrain are generated.
- **Done:**
  - [ ] `gen_setup` enables R2 content
  - [ ] P5, P6 in the fast tier; P16 in the deep tier
  - [ ] Golden log per R2 class and per R2 format

### QA-11 (R2) Negative data fixtures and tuning snapshots
- **Outcome:** each integrity rule of §24.3 is proved to fire, and every tuning number change shows in
  a diff.
- **Done:**
  - [ ] One `bad-data/<rule>/` set per integrity rule, each failing with its message
  - [ ] `tests/snapshots/*.txt` and `UPDATE_SNAPSHOTS=1` regeneration
  - [ ] Ability ids without a scenario listed (report only until R9)

### QA-12 (R3) Progression budgets and the scripted 1 to 30
- **Outcome:** G1 to G4 hold for every level, and a scripted hero reaches level 30 through real XP
  sources.
- **Done:**
  - [ ] Exhaustive G1 to G3; G4 curve snapshot
  - [ ] Scripted 1 to 30 asserting each §11 unlock
  - [ ] Hero save round trip S2 and one kept save per format version

### QA-13 (R3) R3 exit e2e
- **Outcome:** level up, spending a point and reload are proved in the browser.
- **Done:**
  - [ ] `rpg-r3.spec.ts` with E-R3-1
  - [ ] Screenshot of the Paths window in the PR

### QA-14 (R4) World invariants
- **Outcome:** world generation, tiling, start cells, A* and fog are proved by W1 to W7.
- **Done:**
  - [ ] `abalone-world/tests/invariants.rs` W1 to W7 (W5 after F11 is answered)
  - [ ] World golden summary also in the wasm32 test (with `devops-build`)

### QA-15 (R4) R4 exit e2e
- **Outcome:** walk, fight, come back and reload are proved in the browser.
- **Done:**
  - [ ] `rpg-r4.spec.ts` with E-R4-1 to E-R4-4, clock controlled, reduced motion
  - [ ] Screenshot of the world scene in the PR

### QA-16 (R5) Loot and the R5 loop
- **Outcome:** loot is deterministic and its distribution is pinned; the kill, find, sell, equip loop
  works in the browser.
- **Done:**
  - [ ] L1 to L3 in `abalone-world/tests/loot.rs`
  - [ ] `rpg-r5.spec.ts` with E-R5-1

### QA-17 (R6) Quest machine properties and the R6 chain
- **Outcome:** quest state only moves forward and the zone 1 chain completes end to end.
- **Done:**
  - [ ] Forward-only and idempotence properties; quest state in the save round trip
  - [ ] Scripted chain test and `rpg-r6.spec.ts` (E-R6-1)

### QA-18 (R7) Craft from gathered materials
- **Outcome:** an item is crafted from gathered and refined materials, in a test and in the browser.
- **Done:**
  - [ ] Scripted gather, refine, craft test with the iLvl range check
  - [ ] `rpg-r7.spec.ts` (E-R7-1) with the clock advanced past the channel

### QA-19 (R8) RPG boss fixtures and boss mechanics
- **Outcome:** each released boss replays a recorded RPG win, and each boss mechanic has a scenario.
- **Done:**
  - [ ] Fixture format extension and `rpg_boss_fixtures.rs`; missing bosses listed as expected-missing
  - [ ] Seam scenarios R9 and R9b on a stitched region (§4.6, multi-tile fights arrive in R8)
  - [ ] One scenario per boss mechanic (phase at HP %, Resilient Heart, Echo, Chaplain, Hull collapse)
  - [ ] `rpg-r8.spec.ts` (E-R8-1, retry with the same initial hash)

### QA-20 (R9) Every ability has a scenario
- **Outcome:** the 80 class abilities (§8.0, FINAL count of the spec) and every monster ability are
  each exercised by at least one scenario, and the gate blocks a new ability without one.
- **Done:**
  - [ ] Coverage gate of Q11 switched from report to failure
  - [ ] Missing scenarios added with `class-designer` (Revenants R17, R39; Chronomancer history)
  - [ ] P15 in the invariant suite

### QA-21 (R10) Netcode scenarios and the 2-tab exit
- **Outcome:** groups of up to 4 stay in sync under faults, cheating peers are refused, and the
  2-tab group and arena flows work in the browser.
- **Done:**
  - [ ] N1 to N7 on the fake transport (with `network-engineer`)
  - [ ] `rpg-r10.spec.ts` with E-R10-1 and E-R10-2 (`?net=hook`)
  - [ ] Golden logs for a 4-entity group fight and an arena fight
  - [ ] Scenario R22 (an allied entity's ball blocks a push and never joins a group)
