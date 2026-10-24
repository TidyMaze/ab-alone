# Playtests, telemetry, balance targets and bot ladders: implementation spec (role `playtest-balance-analyst`)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, still open). Source of truth:
the validated French gameplay spec (the approved plan, same text as `docs/specs/rpg/plan.fr.md`).
A section number like "§6.4" points to that gameplay spec. This file adds no game rule: it says how
we measure whether the rules and numbers of the gameplay spec reach their goals, and what a phase
must show before it closes. What the gameplay spec gets wrong or leaves open is listed under
"Feedback on the gameplay spec" (section 5), never fixed here.

**Tags**, as in `rules.md`: **FINAL** (decided, by the gameplay spec or an existing FINAL spec),
**TUNE** (a starting value, set by the bot ladder and playtests), **PROPOSAL** (proposed here, an
owner confirms). Every number below carries one. A number quoted from the gameplay spec keeps the
tag the gameplay spec gives it (TUNE unless it says otherwise). A gate band in this file is always
TUNE: changing it is a balance change, reviewed like one (section 4.1).

---

## 0. Scope

**In this role**

- The **tuning loop**: how a TUNE number is measured, changed and recorded (one knob at a time,
  before and after tables, `game-design.md` §8 method step 3).
- The **RPG bot ladder as a measuring instrument**: the bot tiers, the scenario matrix per roadmap
  phase, the gates (bands of acceptable values) in data, the aggregation, the report and its exit
  code. The player bot itself and the fight driver are `ai-engineer`'s.
- The **fight telemetry record**: one integer-only record per fight, built from the combat
  `Effects`, the same code in the ladder (native) and in the browser (WASM).
- The **local telemetry store and export** in the client (IndexedDB store, export file, report tool
  that reads exported files). Local only, nothing leaves the browser unless the player exports it
  (decision #36, `tech.md` §8 and §10).
- The **balance targets**: one table of measurable targets per fight format, class, level gap,
  boss, PvP and progression pacing, each tagged.
- The **human playtest protocol**: who, when, what script, what questionnaire, what is measured,
  how results become Tasks.
- The **pacing model** of §11 (hours to reach a level) as a pure, testable calculation.

**Out of this role** (see "Dependencies" in each section)

- The combat rules, `apply_action`, `Effects`, the state hash (`combat-engineer`).
- The player bot, the monster AI, the search on the combat state, node budgets, the fight driver
  (`ai-engineer`).
- The content of packs, bosses, classes, items, quests (`encounter-boss-designer`,
  `class-designer`, `economy-designer`, `narrative-quest-designer`).
- The nightly workflow that runs the ladder and opens issues (`devops-build`, its section D11).
- The economy simulation (`economy-designer`): this role only provides the telemetry events it
  reads from human sessions.
- Screens and buttons (`ux-designer` for placement and wording, `client-engineer` for scenes).

**Role slugs** used for dependencies. Canonical names from `lead-game-designer.md` §2, plus the
files that exist in `docs/specs/rpg/roles/`:

| Slug | Owns (for this file) | Aliases in peer role files |
|---|---|---|
| `lead-game-designer` | Pillars, fight-length bands in rounds, skill-over-stats definition, arbitration | `game-designer` |
| `combat-engineer` | `abalone-rpg` combat: `CombatState`, `Action`, `apply_action`, `Effects`, state hash, Edge danger computation | `combat-engine`, `gameplay-programmer` |
| `ai-engineer` | Player bot, monster AI, search on the combat state, node budgets, the fight driver used by the ladder | `ai-programmer` |
| `class-designer` | Classes, abilities, rotations in data | `combat-designer` |
| `progression-designer` | Stats, `g(L)`, XP curve, XP rewards, Paths, active tree | `systems-designer`, `stats-progression` |
| `encounter-boss-designer` | Packs, reference packs, threat, bosses, boss fixtures, release flag | `dungeons-bosses` |
| `world-designer` | Biomes, terrain tables, tile seeds, multi-tile boards | `level-designer`, `world-generator` |
| `economy-designer` | Items, loot, gold, crafting, economy simulation | `items-loot` |
| `narrative-quest-designer` | Quests, tutorial content | `quest-designer` |
| `pvp-br-designer` | Duels, arenas, the level 100 template, battle royale | `pvp-br` |
| `network-engineer` | Group lockstep, commit-reveal seeds | `network-programmer` |
| `ux-designer` | Wording and placement of the export button, Edge danger display | |
| `client-engineer` | IndexedDB setup, scenes, Playwright harness | `client-ui` |
| `tech-lead` | Crate layout, data format (RON or JSON), loader, dependency approvals | `technical-designer` |
| `devops-build` | CI and nightly workflows, artifacts, issue opening | |

Peer files call this role `qa-balance` or `qa-engineer`: same owner.

---

## 1. Inputs read

- Gameplay spec, the whole file; in detail the tag rule of the "Contexte", §1 (pillars 2, 3, 4),
  §3, §4.2, §4.4, §4.8, §5.2, §5.3, §6.1 to §6.8, §6.12, §7, §8.0, §8.6, §8.7, §9, §10, §11, §12,
  §13, §17, §18, §19, §20, §23, §24, §25, §26.
- `docs/specs/game-design.md` §3.3 (souls-like PvE, retry), §5 (anti-stalling), §7 (boss roster and
  calibration knobs), §8 (boss calibration: targets, telemetry per attempt, method).
- `docs/specs/boss-balance.md` (ladder method, "pro-level player" = 10x the boss budget, "winnable"
  = 7 to 9 of 10 plus a replayable fixture, section 5 unreachable phases, section 6 follow-ups).
- `docs/specs/tech.md` §7 (AI, node budgets), §8 (persistence, export, "telemetry stays local"),
  §10 (CI, observability, local logger and counters, Copy diagnostics).
- `docs/specs/rules.md` §9 (draw rules), §12 (Given/When/Then format).
- `CONTRIBUTING.md` §5 (Done), §6.4 (PR, screenshots), §6.7 (bugs first), §11 (strict TDD,
  100 % lines and regions), §13 (local checks, e2e).
- Code: `crates/abalone-core/src/encounter/telemetry.rs` (`AttemptRecord`, `DeathCause`,
  `summarize`, `death_counts`, JSON line by hand), `encounter/ladder.rs` (`play_attempt`,
  `run_ladder`, `player_budgets` = 4x, 1x, 0.5x, `PLY_CAP` 300, `OPENING_RANDOM_MOVES` 2, seeded
  `mix`), `encounter/fixture.rs` (text fixture, replay without search), `examples/ladder.rs`
  (`LADDER_X`, `LADDER_NODES`, `LADDER_JSONL`, `LADDER_FIXTURES`, seeds in parallel threads),
  `tests/boss_fixtures.rs`, `search.rs` (node-limited `search_with`, `search_hooked`), `game.rs`
  (history, `seen_after`, draw limits), `client/src/diagnostics.ts`, `logger.ts`, `netcounters.ts`,
  `idb.ts`, `savegame.ts`, `daily.ts` (attempt counter), `.github/workflows/nightly.yml` (live e2e
  only, no ladder).
- Peer role files of `docs/specs/rpg/roles/`, to align slugs and contracts: `lead-game-designer.md`
  (§4.3 skill over stats, §6 fight-length bands, LGD-11, LGD-12, LGD-13), `encounter-boss-designer.md`
  (§18 release gate, RPG boss telemetry, T7 reference packs, T14), `devops-build.md` (D11 nightly
  ladder job and its exit-code contract), `combat-designer.md` (risks sent to the ladder),
  `economy-designer.md` (what it expects from `qa-engineer`).

---

## 2. Principles of measurement

1. **Measurements are deterministic.** A ladder run is a pure function of the code, the data, the
   seeds and the node budgets. Never a clock (FINAL, `game-design.md` §8 step 2, §24.1). The report
   is byte-identical on two runs; wall-clock run times go to a separate, non-gating section.
2. **Integers only in records and gates.** Rates are counts out of N, percentages are basis points
   (bp, 10 000 = 100 %), medians are the lower median (an integer). No `f64` in the record, the
   aggregation or the gates (PROPOSAL; `telemetry.rs` uses `f64` today, the RPG code does not need
   to).
3. **One aggregator for bots and humans.** The ladder and the human playtest exports produce the same
   `FightRecord` and go through the same `aggregate` function. A metric that only humans produce
   (seconds per turn) lives in the client envelope, never in the record.
4. **One knob at a time** (FINAL, `game-design.md` §8 step 3). A tuning PR changes one TUNE value (or
   one gate band) and carries the before and after ladder rows, like `boss-balance.md` §3.
5. **Bands, not points.** Every gate is a closed range `[min, max]`. A single seed list is small
   (`boss-balance.md`: "7 of 10 is a point estimate, not a rate"): a value outside its band two
   nightly runs in a row opens a tuning issue; one run outside only shows in the report (PROPOSAL,
   same rule as `lead-game-designer.md` §6).
6. **Bugs before balance** (FINAL, AGENTS rule 4). A ladder or playtest finding that is a rule
   breach (two ejections from one action, a replay hash mismatch, a hero ejected by a push with no
   Edge danger shown) is a `bug` issue, not a tuning issue.
7. **Local only** (FINAL, decision #36, `game-design.md` §8). No telemetry is sent anywhere. The
   player exports a file and attaches it to a GitHub issue if they want.

---

## 3. Module and file map

| Path | What | Owner | Phase |
|---|---|---|---|
| `crates/abalone-rpg/src/telemetry.rs` | `FightMeta`, `FightRecord`, `EndCause`, `Tally` (folds `Effects` into a record), `to_json_line`, `from_json_line` | this role | R1 |
| `crates/abalone-balance/` (new crate, `publish = false`, not built for wasm) | Aggregation, gates, report, pacing model, playtest report reader | this role | R1 |
| `crates/abalone-balance/src/aggregate.rs` | `CellKey`, `CellStats`, `aggregate(records)` | this role | R1 |
| `crates/abalone-balance/src/gates.rs` | `Gate`, `Metric`, `evaluate(gates, stats) -> Vec<Verdict>` | this role | R1 |
| `crates/abalone-balance/src/report.rs` | Markdown table, JSONL, exit code | this role | R1 |
| `crates/abalone-balance/src/pacing.rs` | Hours-to-level model (§11) | this role | R3 |
| `crates/abalone-balance/examples/rpg_ladder.rs` | Glue: loads scenarios and gates, calls the `ai-engineer` driver per seed, aggregates, prints, exits 0/1/2 | this role (driver from `ai-engineer`; see open question O1) | R1 |
| `crates/abalone-balance/examples/playtest_report.rs` | Reads exported playtest files, prints the same report plus human-only metrics | this role | R1 |
| `data/ladder/scenarios.ron` | Scenario matrix | this role (packs from `encounter-boss-designer`, builds from `class-designer`) | R1, grows per phase |
| `data/ladder/gates.ron` | Gate bands, each with its tag and phase | this role | R1, grows per phase |
| `data/balance/pacing.ron` | Assumptions of the pacing model | this role (XP numbers from `progression-designer`) | R3 |
| `client/src/rpg/telemetry.ts` | IndexedDB store `telemetry`, envelope, export, clear | this role (store setup with `client-engineer`) | R1 |
| `docs/specs/rpg/balance.md` | Targets table, ladder method, latest measured values | this role | R0 |
| `docs/specs/rpg/playtest.md` | Human playtest protocol, scripts per phase, questionnaire | this role | R0 |

The data format (RON or JSON) is `tech-lead`'s call (§24.3). Examples below use RON; the same
fields work in JSON.

---

## 4. Gameplay points, one by one

### 4.1 The tuning loop (Contexte: "TUNE : valeur de départ, à régler en playtest"; §18 "un réglage par l'échelle de bots … puis par des playtests")

**Gameplay points.** Every number is TUNE unless said otherwise (Contexte). Bosses keep the grid of
`game-design.md` §3.3 and §7, tuned by the bot ladder then playtests (§18).

**Implementation.**

- A TUNE number lives once, in data (`tech-lead`'s constants registry, `lead-game-designer.md`
  LGD-08). This role never hardcodes a balance value in code.
- A tuning change is one PR (Task "Tune <id>"), with:
  1. the id of the value and its old and new value;
  2. the ladder rows of the affected scenarios, before and after (same seeds, same budgets), pasted
     from the `rpg_ladder` Markdown output;
  3. when the change came from a playtest, the playtest issue link.
- `docs/specs/rpg/balance.md` keeps a section "Latest measured values": one row per gate, updated by
  each tuning PR and by each phase exit review.
- Two nightly runs in a row outside a band: `devops-build`'s job opens one issue (D11). The analyst
  reads it, decides bug or tuning (principle 6), and opens the Task.

**Dependencies.** `tech-lead` (constants registry), `devops-build` (nightly job and issue),
`lead-game-designer` (signs off band changes that touch a pillar).

**Tests.** None in code for the loop itself; the gates file has its own tests (section 4.3).

**Risks.** Tuning by bot only finds what the bot plays. A gate that passes with a bot can fail with
humans (section 4.16 adds the human half). A TUNE value tuned in R2 for 4 classes may break when
R9 adds 4: the R9 phase re-runs every older scenario (section 4.3 keeps them in the matrix).

### 4.2 Bot tiers and the ladder runner contract (§18 point 2, §24.2 "le bot joueur … spécifié dès R1")

**Gameplay points.** "Un boss ne sort que s'il a gagné une échelle de bots RPG. Le bot joueur utilise
les capacités de sa classe" (§18). "Le bot joueur, pour l'échelle d'équilibrage : le même agent, avec
un script de rotation par classe" (§24.2).

**Implementation.**

- **Bot tiers**, relative to `B`, the node budget of the enemy side of the scenario (the pack AI or
  the boss budget, set by `encounter-boss-designer`):

  | Tier | Player budget | Use | Tag |
  |---|---|---|---|
  | `Random` | 0: a seeded uniform pick among legal actions, no search | Floor: the content must beat it | PROPOSAL |
  | `Weak` | 0.5 × B | A beginner | PROPOSAL (kept from `ladder.rs` `player_budgets`) |
  | `Default` | 1 × B | A player who knows the rules | PROPOSAL (kept from `ladder.rs`) |
  | `Strong` | 4 × B | A good player | PROPOSAL (kept from `ladder.rs`) |
  | `Pro` | 10 × B | The "pro-level player" of `boss-balance.md` §1, bosses only | FINAL (existing method), multiplier TUNE |

- The tiers differ only by node budget; the rotation script and the "never repeat a position, read
  the tells" filters of `boss-balance.md` §1 stay the same for every tier above `Random` (PROPOSAL).
- **Contract asked from `ai-engineer`** (PROPOSAL):

  ```rust
  /// One seeded fight of `scenario`, the player side played by `tier`. Pure and node-limited.
  pub fn play_fight(scenario: &Scenario, seed: u64, tier: BotTier) -> FightLog;
  pub struct FightLog {
      pub meta: FightMeta,          // section 4.4
      pub actions: Vec<Action>,     // both sides, in order (combat-engineer's Action)
      pub record: FightRecord,      // built by telemetry::Tally while playing
  }
  ```

  The driver feeds every `(state_before, action, effects)` to `telemetry::Tally` (section 4.4), so
  the bot and the browser fill the record with the same code.
- **Seeds.** Seed `i` of a scenario gives the combat seed `mix(fnv1a(scenario.id) ^ i)` (`mix` is
  the splitmix64 of `ladder.rs`; FNV-1a 64 on the id bytes). The tile seed, hence the terrain, comes
  from that combat seed when the scenario does not pin a tile (§4.5: "la même tuile donne le même
  plateau"). The player bot plays `opening_random_actions` seeded random legal actions first
  (default 2, kept from `OPENING_RANDOM_MOVES`, PROPOSAL), so seeds give different fights.
- **Turn cap.** A fight longer than `turn_cap` entity turns stops and records `EndCause::TurnCap`
  as a loss (like `PLY_CAP`). Default 160 entity turns (TUNE): above the 60-turn no-Loss draw
  (§6.7) and the Breach reaching radius 2, so a cap hit means a stall bug, gated at 0 (section 4.6).

**Dependencies.** `ai-engineer` (`play_fight`, rotation scripts executor, `Random` tier),
`class-designer` (rotation scripts per class in data), `encounter-boss-designer` (B per pack and
boss), `combat-engineer` (`Action`, `Effects`, state hash).

**Tests (strict TDD, in `abalone-balance`).**

- Given scenario id `"r1.warrior.ref_skirmish"` and seed index 3, When the combat seed is derived
  twice, Then both are equal; and seed indexes 0 to 99 give 100 distinct combat seeds (pinned
  values for 0 and 1).
- Given `B = 2000`, Then the tiers give 0, 1000, 2000, 8000, 20000 nodes.
- Given a stub driver that returns a fixed `FightLog`, When the runner plays a cell of 3 seeds,
  Then it calls the driver with seeds in order and aggregates 3 records.

**Risks.**

- **The ladder measures the script, not the class** (Feedback F15). A weak rotation script makes a
  good class look weak. Mitigation: each class has a `Weak`-vs-`Strong` spread gate (section 4.8)
  and the class balance is cross-checked by human playtests (section 4.16) before any class nerf.
- **Runtime.** The RPG turn (Movement + Action + Quick action, free order, §6.3) has a far larger
  branching factor than an Abalone ply. Section 4.3 gives a run-time budget; `ai-engineer` owns the
  speed.

### 4.3 Scenario matrix and gates in data (§25 exit criteria R1, R2, R8, R9, R10; §18)

**Gameplay points.** R1: "Avec le bot joueur … déterminisme vérifié (même log = même hash)". R2:
"Chaque classe bat la meute de référence sur l'échelle de bots". R8: "Une fixture de victoire RPG
par boss". R9: "Les 8 classes passent l'échelle de bots". R10: arenas and groups.

**Implementation.**

- `data/ladder/scenarios.ron`, one entry per scenario:

  ```ron
  Scenario(
      id: "r1.warrior.ref_skirmish",
      since: R1,                       // phase that adds it; never removed later
      format: Skirmish,                // §6.8
      party: [Hero(class: "warrior", level: 1, build: "r1_default")],
      enemy: Pack(id: "lumen_ref_skirmish", level: 1),   // or Boss(id), or Hero(...) for PvP
      biome: "lumen",
      tile: None,                      // None: tile seed from the combat seed
      modifiers: (night: false, weather: None),          // §4.8 pinned (Feedback F13)
      seeds: 20,
      tiers: [Random, Weak, Default, Strong],
      turn_cap: 160,
      opening_random_actions: 2,
  )
  ```

- `data/ladder/gates.ron`, one entry per gate:

  ```ron
  Gate(
      id: "r1.skirmish.default.wins",
      scenario: "r1.warrior.ref_skirmish",
      tier: Default,
      metric: Wins,                    // section 4.5 lists the metrics
      min: 17, max: 20,                // closed band, in the metric's unit
      tag: Tune,
      since: R1,
  )
  ```

- **Run-time budget** (TUNE): the nightly matrix must finish in 45 min on the 4-vCPU runner
  (`devops-build` D11 gives 60 min). Each scenario prints its wall time in the non-gating section.
  When the matrix grows past 45 min, split by phase into a weekly job (PvP matrix first, section
  4.14), never cut seeds below 10.
- **Seeds per cell** (TUNE): 20 for packs, 10 for bosses (kept from `boss-balance.md`), 20 per
  ordered pair in PvP.
- The full matrix per phase is in section 7 (Tasks). Old scenarios stay: R9 re-runs R1 and R2 cells.

**Dependencies.** `encounter-boss-designer` (reference packs, T7; bosses and release flag),
`class-designer` (build ids per class and level), `world-designer` (biome ids, pinned tiles for
multi-tile fights), `tech-lead` (loader and format), `devops-build` (job time limit).

**Tests.**

- Integrity (in `abalone-balance`): every gate names an existing scenario and a tier the scenario
  runs; `min <= max`; a `Wins` gate has `max <= seeds`; every scenario id is unique; every pack,
  boss, class, build and biome id exists in the content data. Given a gate on scenario `"nope"`,
  Then the test fails naming `"nope"`.
- Given a gates file with a gate whose `since` is R9 and a run tagged R2, Then the gate is skipped
  and listed as "not yet active".

**Risks.** Content ids change while the matrix references them: the integrity test catches it in
the content PR, which then updates the scenario (the content author's job, the test names the line).

### 4.4 The fight telemetry record (§6.12 "le compteur d'essais et la télémétrie réutilisent `encounter/telemetry.rs`"; §18; `game-design.md` §8 "Telemetry per attempt")

**Gameplay points.** §6.12: boss retries count attempts and keep telemetry, reusing
`encounter/telemetry.rs`. `game-design.md` §8: per attempt, "boss, seed, attempt number, result,
phase reached, cause of death (tell id or plain loss), marbles left, duration, move list. Local
only."

**Implementation.** `crates/abalone-rpg/src/telemetry.rs`, pure and integer-only. It reuses the
*approach* of `encounter/telemetry.rs` (pure data, one JSON line, stable ids, the caller decides
where it goes); the classic types stay for the classic bosses of the Mess (Feedback F3).

```rust
pub const RECORD_VERSION: u32 = 1;

pub enum FightKind { Skirmish, Elite, Room, Boss, Duel, Arena, Royale, Puzzle }
pub enum Ending { Won, Lost, Draw, Fled }

/// Why the fight ended, from the player side. Stable snake_case ids in JSON.
pub enum EndCause {
    EnemyRouted, EnemyHeroKilled, EnemyHeroEjected, LeaderKilled, ObjectiveDone, // wins
    HeroKilled, HeroEjected, Routed, ObjectiveFailed,                            // losses
    DrawRepetition, DrawNoLoss,                                                  // §6.7 draws
    Fled,                                                                        // §6.7 flight
    TurnCap, Stuck,                                                              // ladder only
}

pub struct FightMeta {
    pub kind: FightKind,
    pub content: String,       // pack, boss, arena or puzzle id
    pub biome: String,
    pub tile: (i32, i32),
    pub seed: u64,             // combat seed (after commit-reveal online)
    pub attempt: u32,          // boss: attempt number on this boss; else 1
    pub party: u8,             // 1 to 4 (§4.7, FINAL)
    pub class: String,
    pub hero_level: u8,
    pub enemy_level: u8,
    pub world_tier: u8,        // §23, 0 = Normal
    pub night: bool,           // §4.8
    pub weather: Option<String>,
    pub tier: Option<BotTier>, // ladder only; None for a human
}

pub struct FightRecord {
    pub v: u32,
    pub meta: FightMeta,
    pub ending: Ending,
    pub cause: EndCause,
    pub rounds: u32,                 // §6.0 Round
    pub entity_turns: u32,           // turns of the player entity
    pub hero_hp_start_bp: u16,       // HP / max HP at the first turn, in bp
    pub hero_hp_end_bp: u16,         // 0 when the hero died
    pub hero_death_round: Option<u32>,
    pub losses_taken: u8,            // §6.6 Perte, player entity
    pub losses_dealt: u8,
    pub ejections: [u8; 3],          // balls removed from the board by source: Movement, ability, terrain
    pub edge_alerts: u16,            // player turns that started with Edge danger on the hero (§6.6)
    pub hero_ejected_after_alert: Option<bool>, // Some when cause is HeroEjected
    pub attrition_reached: bool,     // §6.7 Usure
    pub breach_reached: bool,        // §6.7 Brèche
    pub max_phase: u8,               // bosses: highest phase, 0-based like `telemetry.rs`
    pub boss_hp_end_bp: Option<u16>, // bosses: Heart HP left
    pub abilities: Vec<(String, u16)>, // uses per ability id, sorted by id
    pub consumables: u8,
    pub revenants_raised: u8,        // §8.6, for the stall check (§26 Q7)
    pub final_hash: u64,             // combat-engineer's state hash after the last action
}

pub struct Tally { /* running counters */ }
impl Tally {
    pub fn new(meta: FightMeta, start: &CombatState) -> Self;
    pub fn observe(&mut self, before: &CombatState, action: &Action, effects: &Effects);
    pub fn finish(self, end: &CombatState) -> FightRecord;
}
impl FightRecord {
    pub fn to_json_line(&self) -> String;                      // fixed key order, one line
    pub fn from_json_line(line: &str) -> Result<Self, String>; // for the report tools
}
```

- **Where the numbers come from.** Only from `Effects` and the combat state, never from the UI:
  `Effects` already lists damage, removals (with cause death or ejection), status changes, turn
  boundaries (`combat-engineer`'s render contract). `edge_alerts` reads the Edge danger flag that
  `combat-engineer` computes with `legal_moves` (§6.6).
- **Boss records.** A boss fight is a `FightRecord` with `kind: Boss`, `attempt`, `max_phase`,
  `boss_hp_end_bp`; `EndCause` gets one variant `BossMechanic(String)` for a loss whose last
  removal came from a named boss mechanic (`"conversion"`, `"mirror"`, `"rim_crack"`; ids from
  `encounter-boss-designer`). This merges `encounter-boss-designer.md` §18's RPG record into one type
  (PROPOSAL, open question O2).
- **JSON.** With `serde` (if `tech-lead` adds it for §24.3 data) derive with a fixed field order;
  without it, hand-written like `AttemptRecord::to_json_line`. Ids are ASCII snake_case content ids
  (`tech-lead` naming rule), so no escaping. Size: about 500 bytes per record (TUNE).
- **Determinism.** No float, no clock, no `HashMap` iteration (§24.1); `abilities` is sorted by id.

**Dependencies.** `combat-engineer` (`CombatState`, `Action`, `Effects` with removal causes and
sources, Edge danger flag, state hash, Round and entity-turn boundaries), `encounter-boss-designer`
(mechanic ids, phase index), `tech-lead` (serde decision).

**Tests (strict TDD, 100 % lines and regions).**

- Given a hand-built `Effects` list "player Movement ejects 1 enemy ball, then enemy ability kills
  the hero", When folded by `Tally` and finished, Then `ejections == [1, 0, 0]`, `losses_dealt == 1`,
  `ending == Lost`, `cause == HeroKilled`, `hero_hp_end_bp == 0`, `hero_death_round == Some(1)`.
- Given the hero ejected by an enemy Movement on a turn where the player turn started with Edge
  danger, Then `cause == HeroEjected` and `hero_ejected_after_alert == Some(true)`.
- Given a fight that reaches entity turn 12 of a skirmish (Usure starts, §6.7), Then
  `attrition_reached`.
- Given the same `FightRecord`, Then `from_json_line(to_json_line(r)) == r` and the line is pinned
  byte for byte for one won and one lost record (like `a_lost_attempt_encodes_as_one_json_line`).
- Given two `observe` orders of abilities `["shield_bash", "anchor"]`, Then `abilities` is sorted
  `anchor, shield_bash`.
- Given `RECORD_VERSION + 1` in a line, Then `from_json_line` returns an error naming the version.
- Property: for 200 seeded random fights from `ai-engineer`'s random driver, `losses_taken` and
  `losses_dealt` equal the Losses counted by `combat-engineer`'s rout logic, and the record of a
  replayed log equals the record of the played fight.

**Risks.** If `Effects` does not carry the source of a removal (Movement, ability, terrain), the
ejection split is impossible. This is a contract request to `combat-engineer`, needed in R1 anyway
for the one-ejection-per-action rule (§6.10).

### 4.5 Aggregation, metrics and the report (§18, §25 R1)

**Gameplay points.** The ladder must tell whether content "bat la meute", "passe l'échelle", and
the boss gate of §18; the R1 exit needs "déterminisme vérifié (même log = même hash)".

**Implementation** (`crates/abalone-balance`).

- `aggregate(records: &[FightRecord]) -> Vec<(CellKey, CellStats)>`, `CellKey = (scenario id,
  tier)` (humans: `tier = None`, scenario = content id), cells sorted by key.
- **Metrics** (enum `Metric`, one unit each):

  | Metric | Unit | Definition |
  |---|---|---|
  | `Wins`, `Draws`, `Fled` | count of N | Endings |
  | `WinSpread(low: Tier)` | count | `Wins(this tier) − Wins(low tier)`, same scenario |
  | `RoundsMedian`, `RoundsP90` | rounds | Lower median; nearest-rank 90th percentile, all endings |
  | `HeroHpEndMedianBp` | bp | Over won fights only |
  | `LossesTakenMedian` | count | Over won fights only |
  | `HeroEjectedShareBp` | bp | Losses with `HeroEjected` over all losses |
  | `EarlyHeroDeaths(round)` | count | Fights where the hero died at or before `round` |
  | `UnansweredAlertShareBp` | bp | Hero ejections with `hero_ejected_after_alert == Some(true)` over all hero ejections |
  | `AlertlessPushEjections` | count | Hero ejected by an enemy Movement while the Edge danger flag was off in the state just before that enemy turn began |
  | `AttritionShareBp`, `BreachShareBp` | bp | Fights that reached Usure, Brèche |
  | `TurnCaps` | count | `EndCause::TurnCap` |
  | `ReplayMismatches` | count | Fights whose replayed action log ends on another `final_hash` |
  | `BossMaxPhase` | phase | Highest phase reached, any fight of the cell |
  | `PhaseDeathShareBp(phase)` | bp | Boss losses in that phase over all boss losses |

- **Report** (`report.rs`): a Markdown table per phase, columns `scenario | tier | n | W/L/D/F |
  rounds med/p90 | HP left | top cause | gates`, then the list of failing gates with value and band,
  then a "Run times (not gated)" section. Plus `ladder.jsonl` (every record) and, for each cell, the
  action log of its first loss as a fixture text (for repro, format of `encounter-boss-designer`
  T14). Exit code: 0 all active gates pass, 1 a gate fails, 2 a crash or an invalid data file
  (contract of `devops-build` D11, FINAL there once merged).
- **Replay check** (§25 R1): the runner replays every fight's action log through `apply_action`
  (no search) and compares `final_hash`; mismatches feed `ReplayMismatches`, gated at 0 (FINAL
  proposed: determinism is a locked decision, #313 choice 4).

**Dependencies.** `combat-engineer` (replay and state hash), `devops-build` (exit codes, artifact
upload, step summary).

**Tests.**

- Given records with rounds `[10, 20, 30, 41]`, Then `RoundsMedian == 20` (lower median, pinned)
  and `RoundsP90 == 41`; given `[]`, Then every metric is 0 and the cell is reported as "no data".
- Given 3 won and 1 lost record, Then `HeroHpEndMedianBp` ignores the lost one.
- Given a gate `Wins [17, 20]` and 16 wins, Then the verdict fails with value 16 and the exit code
  is 1; given only passing gates, Then 0; given a malformed gates file, Then 2.
- Given the same input records twice, Then the Markdown output is byte-identical (pinned snapshot
  of a 2-cell report).
- Given a stub log whose replay ends on another hash, Then `ReplayMismatches == 1`.

**Risks.** A metric nobody reads is noise: each metric above is used by at least one gate or one
section of this file. New metrics need a gate or a playtest question that reads them (PROPOSAL).

### 4.6 Fight formats: length, difficulty and anti-stall (§3, §6.7, §6.8)

**Gameplay points.** §6.8 target durations: skirmish 2 to 4 min, elite 4 to 6, dungeon room 4 to 7,
boss/PvP/arena 8 to 15, BR 15 to 25. §6.7 anti-stall: draw after 60 entity turns without a Loss,
Usure from turn 20 (12 in skirmish), Brèche from turn 30 (18 in skirmish), a skirmish draw is a
retreat with no XP, a boss draw is a loss (FINAL existing).

**Implementation.** The ladder cannot measure minutes (Feedback F6). It measures rounds against the
bands of `lead-game-designer.md` §6 (10 s per player turn, TUNE), and the human playtest measures
seconds per player turn to check that assumption (section 4.16). Targets per format (all TUNE, all
for the `Default` tier at equal level unless said):

| Format | Rounds (median) | `Default` wins | `Random` wins | Hero HP left (median of wins) | Attrition share | Breach share | Draws | Turn caps |
|---|---|---|---|---|---|---|---|---|
| Skirmish | 6 to 12 | 17 to 20 of 20 | 0 to 4 of 20 | 4 000 to 8 000 bp | ≤ 2 000 bp | ≤ 500 bp | ≤ 1 of 20 | 0 |
| Elite | 10 to 18 | 12 to 18 of 20 | 0 to 2 of 20 | 2 500 to 7 000 bp | ≤ 3 000 bp | ≤ 1 000 bp | ≤ 1 of 20 | 0 |
| Dungeon room | 10 to 20 | 14 to 19 of 20 | 0 to 2 of 20 | 3 000 to 7 500 bp | ≤ 3 000 bp | ≤ 1 000 bp | ≤ 1 of 20 | 0 |
| Boss | 20 to 40 | 0 to 6 of 10 | 0 of 10 | report only | report only | report only | counted as losses | 0 |

- Skirmishes are the bread and butter (15 % of tiles, §4.3): a player who knows the rules should
  almost always win, but pay in HP and Fragments. The `Default` band allows 20 of 20 for packs, not
  for bosses (`boss-balance.md`: "never 10 of 10" is a boss rule).
- `Random` wins must stay low: the pack is a real threat (the "random, then depth 1 to 5" step of
  `game-design.md` §8 method 1).
- `TurnCaps == 0` (FINAL proposed): a fight that outlives Breach plus the no-Loss draw is a stall
  bug (principle 6).

**Dependencies.** `lead-game-designer` (round bands), `encounter-boss-designer` (threat budgets, the
knob for these targets), `combat-engineer` (Usure and Brèche flags in `Effects`).

**Tests.** Gates file integrity covers these rows; a `Given` per format in the gates test: Given
the R1 gates file, Then it contains a `RoundsMedian` gate `[6, 12]` and a `TurnCaps` gate `[0, 0]`
for the reference skirmish.

**Risks.**

- HP left is weak signal because the hero regains 5 % of max HP per second out of combat (§4.2): full
  in 20 s (Feedback F17). Kept as a difficulty signal inside one fight, not as a cost.
- The 10 s per turn is a guess: if R1 playtests measure 20 s, every round band halves
  (`lead-game-designer` re-derives them, this role measures).

### 4.7 Weighted push and the exposed hero (§6.4, §6.6, §26 Q10)

**Gameplay points.** §6.4: push needs `n > m` and strictly greater total Weight; "Le Poids sert
surtout à se défendre". §6.6 (FINAL, owner choice): an ejected hero dies and the entity loses; the
Edge danger alert, the Guard and class answers keep it readable. §26 Q10: "On vérifie en playtest que
les parties ne se résument pas à éjecter le héros en 3 tours. Si c'est le cas, on règle d'abord la
Formation et l'alerte, et on ne revient pas sur la règle."

**Implementation.** Q10 gets measurable criteria (all TUNE, PROPOSAL):

| Gate | Scenarios | Band | Reads |
|---|---|---|---|
| `EarlyHeroDeaths(4)` | Every PvE scenario, `Default` | ≤ 1 of 20 | "éjecter le héros en 3 tours": a hero dead by round 4 |
| `EarlyHeroDeaths(4)` | PvP mirror matrix (section 4.14) | ≤ 2 of 20 per pair | Same, in PvP where it matters most |
| `HeroEjectedShareBp` | PvE losses, `Default` and `Weak` | 2 000 to 6 000 bp | The hero is a real risk (not 0) without being the only way to lose |
| `AlertlessPushEjections` | Every scenario, every tier | 0 | Bug gate: §6.6 promises the alert before any push ejection |
| `UnansweredAlertShareBp` | Human playtests only | ≤ 4 000 bp | From `game-design.md` §8: more than 40 % of deaths right after an unanswered tell means the tell is not readable |

- `AlertlessPushEjections` definition: the hero is ejected by an enemy Movement, and the Edge danger
  flag was off in the state just before that enemy turn began. (The "unanswered" alert of the human
  metric is different: the flag was on at the start of the player's own last turn, the player saw
  it and did not answer it.) The alert is computed "dès qu'une poussée
  adverse légale pourrait l'éjecter au prochain tour" (§6.6), so with full information this count is
  0 by construction; a non-zero count is a `bug` in the alert or in the push rules. Ability
  ejections (Éjecteur) are excluded: they have their own tell or are ultimates (§6.10).
- If Q10 gates fail, the tuning order is the one of §26 Q10: Formation numbers first, then the
  alert, never the rule (FINAL there).
- Weighted-push equivalence with classic (Weight 1 = classic, §6.4 invariant) is a property test of
  `combat-engineer` and `lead-game-designer` LGD-06, not a ladder metric. This role adds one ladder
  check: the classic bosses of the Mess re-run on their old fixtures after the push refactor, with
  the same results (`boss_fixtures.rs` stays green; `level-designer` asks the same).

**Dependencies.** `combat-engineer` (Edge danger flag, removal causes), `pvp-br-designer` (PvP
template), `ux-designer` (alert display, for the human metric), `lead-game-designer` (order of fixes).

**Tests.**

- Given a log where the hero is ejected by a Movement and the alert was on, Then
  `AlertlessPushEjections == 0`; with the alert off, Then 1 and the gate verdict fails.
- Given an Éjecteur ability ejection with the alert off, Then it does not count.
- Given 20 PvP records with hero deaths at rounds `[2, 3, 9, …]`, Then `EarlyHeroDeaths(4) == 2`.

**Risks.** A light hero (Weight 1 Assassin, Mage, Chronomancer; §8.0) is easier to eject by design:
the per-class split of these gates will show it. A band per class may be needed (R9, TUNE).

### 4.8 Class balance (§8.0, §8.6, §25 R2 and R9, §26 Q7)

**Gameplay points.** 8 classes with difficulty stars (§8.0). R2: "Chaque classe bat la meute de
référence". R9: "Les 8 classes passent l'échelle de bots". §26 Q7: is the Revenant limit enough
against fights that never end? "À vérifier en playtest".

**Implementation.** Gates per class against the same reference pack (PROPOSAL, all TUNE):

| Gate | Band | Why |
|---|---|---|
| `Wins`, `Default`, each class | 16 to 20 of 20 | "bat la meute" made measurable |
| `Wins` spread between classes, `Default` | every class within ±2 of the class mean (of 20) | No class far above or below |
| `RoundsMedian`, each class | within ±25 % of the class mean | No class trivially fast or grindy |
| `WinSpread(Weak)` for `Strong`, each class | ≥ 2 | Skill matters for every class |
| `WinSpread(Weak)`, ★★★ classes | report only, expected ≥ the ★ classes | Stars mean "skill pays more" (§8.0), checked, not gated |
| Necromancer `Draws` | ≤ 1 of 20 | §26 Q7: no endless fights from Revenants |
| Necromancer `RoundsMedian` | ≤ 125 % of the class mean | §26 Q7 |
| Necromancer `revenants_raised` median | report only | Shows whether the Q7 loop is played at all |

- The class mean is computed in the same run, over the classes active in that phase (4 in R2, 8 in
  R9). The spread gate is a derived gate: `Metric::ClassSpread { scenario_family }`.
- R2 reference pack per class level: from `encounter-boss-designer` T7 (heavy archetypes included).

**Dependencies.** `class-designer` (rotation scripts, builds per phase), `encounter-boss-designer`
(reference packs), `ai-engineer` (rotation executor, Revenant actions in the bot).

**Tests.** Given 4 classes with `Default` wins `[18, 17, 17, 12]`, Then the class mean is 16
(integer division of 64 by 4) and the spread gate fails for the class at 12 only (outside 14 to 18).
Given a Necromancer cell with 2 draws out of 20, Then the Q7 gate fails.

**Risks.** See section 4.2 (script quality). Also, R2 has 4 classes with 2 abilities each in R1 and
a partial kit in R2: early class gates are about the kit shipped, not the final class.

### 4.9 Level gap, colour bands and "skill over stats" (§1 pillar 3, §4.4, §6.5, §11)

**Gameplay points.** Pillar 3: "La compétence compte plus que les stats". §4.4: monster level
colours grey (6 or more below, no XP), green, yellow, orange, red (5 or more above). §6.5: ±5 % damage
per level of gap, capped at ±25 %, off in normalized PvP. §11: +10 % XP per level above, +40 % max.

**Implementation.**

- **Level-gap curve** (R3): one scenario family per class, hero at level L, pack at L + d for
  d in {−6, −3, 0, +3, +5}, L in {10, 30} (TUNE), `Default` tier. Gates (TUNE):
  - `Default` wins are non-increasing in d (FINAL proposed: a higher pack is never easier; a
    property, not a band);
  - d = −3 (green): 19 to 20 of 20; d = +5 (red): 0 to 8 of 20.
- **Skill over stats**: `lead-game-designer.md` §4.3 defines it; this role runs it (LGD-13): the
  `Strong` tier with a hero 5 levels below the reference pack wins at least 10 of 20 (TUNE, LGD).
- Report the curve at both L values side by side: `g(L)` growth per level is
  `1 + 0.09 / g(L)`, about +9 % at level 1, +5 % at level 10, +1.6 % at level 50 (computed from
  §7.2). The same colour band is then much harder at low level than at high level (Feedback F14).

**Dependencies.** `progression-designer` (`g(L)`, stats per level), `encounter-boss-designer`
(packs at any level), `lead-game-designer` (LGD-13 definition).

**Tests.** Given `Default` wins `[20, 20, 18, 12, 14]` for d = −6, −3, 0, +3, +5, Then the
monotonic check fails at d = +5 (14 is 2 above 12, past the 1-win tolerance) and names the pair;
given `[20, 20, 18, 12, 13]`, Then it passes (within the tolerance).

**Risks.** Monotonicity can fail by seed noise at 20 seeds when two levels are close; the property
then allows a tolerance of 1 win (TUNE).

### 4.10 Monsters and threat budgets (§5.3, §6.8)

**Gameplay points.** Rarity factors and threat (Minion 0.5, Normal 1, Champion 2, Elite 4); budgets
skirmish 6, elite 12, room 14; §6.8 "menace 6 (4 à 7 boules)".

**Implementation.** The ladder checks that equal threat means roughly equal difficulty (TUNE,
PROPOSAL): for each format, `encounter-boss-designer` provides 3 packs of the same threat built
differently (many minions, a few normals, one champion plus minions). Gate: their `Default` wins
are within ±3 of 20 of each other, and their `RoundsMedian` within ±30 %. An archetype that
breaks this (an Explosive pack, a Carrier with Weight 2) gets its threat value tuned, one knob at a
time.

**Dependencies.** `encounter-boss-designer` (pack variants, threat values, archetype multipliers).

**Tests.** Given three cells with wins `[18, 14, 19]`, Then the threat-parity gate fails (19 − 14 >
3) and lists the three packs.

**Risks.** The threat sums of §5.3 and the ball counts of §6.8 disagree (Feedback F8); this gate
measures whichever rule `encounter-boss-designer` settles.

### 4.11 Boss calibration (§18, §6.12, `game-design.md` §8)

**Gameplay points.** §18: the boss grid (tell, placement answer, visible phases, tuning by the
nightly ladder then playtests); phases now trigger on Heart HP percent; "Un boss ne sort que s'il a
gagné une échelle de bots RPG … restent bloqués tant qu'ils n'ont pas de fixture de victoire".
§6.12: retry in under 5 s with the same seed; attempts and telemetry reuse `telemetry.rs`.

**Implementation.**

- **Bot gates per released boss** (TUNE, method of `boss-balance.md` §1 kept): `Pro` wins 7 to 9 of
  10, `Default` wins 0 to 6 of 10, `Random` 0 of 10, each of the 4 R2 classes at the boss's nominal
  level (open question O7), plus a replayable winning fixture (the release gate itself is
  `encounter-boss-designer`'s L1 test).
- **Phase reach** (fixes `boss-balance.md` §5 for the RPG): `BossMaxPhase` of the `Pro` cell must be
  the last phase (TUNE, PROPOSAL): a phase that a winning bot never sees is the bug of §5 again.
  `PhaseDeathShareBp(p) ≤ 5 000 bp` for every phase but the last of the final boss (from
  `game-design.md` §8).
- **Human targets** (kept from `game-design.md` §8 as TUNE, open question O6): first win between
  attempt 3 and 10 (median across testers); at most 20 % of testers quit before their first win; at
  most 40 % of deaths right after an unanswered tell or Edge alert; attempt length band (conflict,
  Feedback F5); retry under 5 s (FINAL, §1 pillar 3; measured by `encounter-boss-designer`'s e2e).
- **Quit before first win** from exported data: a tester's last record on a boss is a loss and no
  later record on that boss is a win, at export time (PROPOSAL; the observer confirms in the session
  notes).
- **Anti-skill-wall** (kept from `game-design.md` §8 step 5): a playtester who knows Abalone but
  never saw the boss loses attempt 1 or 2 and names the cause from the loss screen (questionnaire
  item, section 4.16).

**Dependencies.** `encounter-boss-designer` (boss data, phases, release flag, fixtures, mechanic ids),
`ai-engineer` (`Pro` budget fits the nightly time; the Ballast Mind is excluded until it does,
`devops-build` D11), `ux-designer` (loss screen cause line).

**Tests.** Given a boss cell where `Pro` wins 10 of 10, Then the gate fails ("never 10 of 10").
Given human records of one tester `[lost, lost, lost, won]` on a boss, Then "first win attempt" is
4; given `[lost, lost]`, Then the tester counts as "quit before first win".

**Risks.** Stats and gear change the difficulty of a boss for humans (a player can come back 5
levels higher). Human targets only hold when testers fight at the nominal level: the playtest script
pins the level with a test save (section 4.16).

### 4.12 Progression pacing (§3, §11, §25 R3)

**Gameplay points.** §11 curve `XP(n → n+1) = C(n) × XP_ref(n)`, `C(n) = 4 + n/3`,
`XP_ref(n) = 50 + 10n`; targets: level 10 in 1 h 30, 30 in 12 h, 60 in 45 h, 100 in about 110 h;
XP sources: fights 40 %, quests 40 %, exploration 10 %, dungeons and events 10 %; rest bonus +100 %
up to 1.5 levels. §3: the 30 to 60 min loop.

**Implementation.**

- `crates/abalone-balance/src/pacing.rs`, pure integer model:

  ```rust
  pub struct PacingInputs {           // data/balance/pacing.ron
      pub xp_curve: Vec<u64>,         // XP for n -> n+1, n = 1..99, from progression-designer's data
      pub bands: Vec<Band>,           // level band -> XP per hour by source, assumed
  }
  pub struct Band { pub from: u8, pub to: u8, pub xp_per_hour: [u32; 4] } // fights, quests, explore, dungeons
  pub fn minutes_to_level(inputs: &PacingInputs, level: u8) -> u32;
  pub fn required_xp_per_hour(inputs: &PacingInputs, targets: &[(u8, u32)]) -> Vec<(u8, u8, u32)>;
  ```

- The model reads the curve from `progression-designer`'s data, never re-implements it. With the §11
  formula as written (n/3 not rounded, Feedback F7), cumulative XP is about 5 300 at level 10,
  59 000 at 30, 346 000 at 60 and 1 395 000 at 100. To hit the time targets, the XP per hour must
  be about 3 500 (levels 1 to 10), 5 100 (10 to 30), 8 700 (30 to 60) and 16 100 (60 to 100):
  a ×4.6 rise. The gameplay spec gives no XP per fight, quest or tile, so `progression-designer`
  must set rewards that grow at that rate; this model checks it.
- Gates (TUNE): `minutes_to_level` within ±20 % of each §11 target, under the bands of
  `pacing.ron`. Human check from R3 on: session events (section 4.13) give XP per hour and the share
  per source; target shares 40/40/10/10 ±10 points (TUNE).

**Dependencies.** `progression-designer` (curve, rounding, XP rewards per source),
`narrative-quest-designer` (quest XP), `world-designer` (exploration XP, travel time from §4.2),
`lead-game-designer` (§26 Q2: 110 h or 60 h).

**Tests.** Given a 3-level toy curve `[100, 200, 300]` and one band of 600 XP/h, Then
`minutes_to_level(4) == 60`. Given the §11 curve and the band rates above, Then levels 10, 30, 60,
100 land within ±20 % of 90, 720, 2 700, 6 600 minutes (pinned). Given a band with 0 XP/h, Then an
error names the band (no division by zero).

**Risks.** The model is only as good as its XP-per-hour assumptions; the R3 human sessions replace
assumptions band by band. The rest bonus (+100 %, up to 1.5 levels) depends on offline time: the
model takes a "rested share" input (TUNE, default 0).

### 4.13 Session events for economy, loot and pacing (§11, §12, §13, §14, §15)

**Gameplay points.** XP shares (§11), loot rarity and iLvl (§12), gold sinks listed in §13.3, gathering
and crafting yields (§14, §15).

**Implementation.** Next to fight records, the client stores small session events (PROPOSAL), each
`{t_ms, kind, data}` with integer data and content ids:

| Event | Data | Read by |
|---|---|---|
| `session_start`, `session_end` | build commit, hero level | All |
| `xp` | amount, source (`fight`, `quest`, `explore`, `dungeon`, `event`, `craft`, `gather`), rested part | Pacing (4.12) |
| `level_up` | new level | Pacing |
| `gold` | signed amount, source or sink id (ids owned by `economy-designer`) | `economy-designer` |
| `loot` | slot, rarity, iLvl | `economy-designer` |
| `gather`, `craft` | node or recipe id, yield, quality | `economy-designer` |
| `death_world` | biome, tile, returned to beacon | Section 4.16 R4 |
| `zone_enter` | zone id | Pacing, exploration |

The aggregation is in `playtest_report` (section 4.15): XP per hour per band and per source, gold in
and out per hour per band (the sink/faucet ratio), drops per rarity per hour. The targets of the
economy are `economy-designer`'s; this role reports them against its numbers.

**Dependencies.** `economy-designer` (source and sink ids, targets, its own simulation),
`progression-designer`, `client-engineer` (call sites in the world loop).

**Tests.** Given events `xp 100 fight`, `xp 300 quest` in a 60-minute session, Then the report shows
400 XP per hour and shares 2 500 / 7 500 bp. Given an unknown source id, Then it is counted under
`other` and listed (no crash).

**Risks.** Event call sites spread across the client; keep them to one `track(event)` function so a
missing call is one grep away.

### 4.14 Groups, PvP and battle royale (§6.2, §6.8 group table, §19, §20, §26 Q10)

**Gameplay points.** Groups face one pack per player, each at its solo threat, with fewer Fragments
per player (§6.8). PvP arenas use a normalized level 100 template (§19); controls last 1 turn less;
initiative by speed, then the commit-reveal seed (§6.1). BR: everyone normalized at level 20 (§20).

**Implementation** (R10, TUNE):

- **Group fairness**: duo, trio and quatuor scenarios of the reference skirmish, all members played by
  `Default` bots of the same class mix. Gate: the group win count is within −3 to +2 of 20 of the solo
  `Default` win count (group may be a bit harder, never trivial). Feedback F10 explains why it may fail.
- **PvP mirror matrix** (weekly job, PROPOSAL): every ordered class pair on the level 100 template,
  20 seeds each, `Default` vs `Default`. Gates: each class's overall win share 4 500 to 5 500 bp; any
  pair 3 500 to 6 500 bp; the side with initiative wins at most 6 000 bp over the whole matrix;
  `EarlyHeroDeaths(4) ≤ 2` of 20 per pair (section 4.7); `RoundsMedian` 20 to 40 (arena band).
- **BR**: bot-filled lobbies of 6 (§20), report only at first: average placement by class within
  ±0.5 place of 3.5 (TUNE), a gate once 100 lobbies run in the weekly job.
- The local Elo of §19 is not balance data (self-declared, "non vérifiée"); human PvP data comes from
  playtest exports only.

**Dependencies.** `pvp-br-designer` (template, arenas, BR rules), `network-engineer` (none for the
ladder: it runs locally, but group fights need the same turn order code path), `ai-engineer` (bots
that play allies and PvP opponents).

**Tests.** Given 8 classes and a matrix where class A wins 60 % overall, Then its gate fails. Given an
initiative side winning 13 of 20 in every pair, Then the initiative gate fails (6 500 > 6 000).

**Risks.** 64 ordered pairs × 20 seeds = 1 280 arena fights of 20 to 40 rounds: the weekly job may
still be long; the run-time rule of section 4.3 applies (split by class row).

### 4.15 Local telemetry store, export and report tool (§6.12, §24.5 "Sauvegarde", `tech.md` §8 and §10)

**Gameplay points.** §6.12: attempts and telemetry; §24.5: IndexedDB stores `hero` and `combat`,
export and import "même modèle que `savegame.ts`". `tech.md` §8: "Telemetry … stays local by default".
`game-design.md` §8: the player exports a JSON file and attaches it to an issue; no prefilled form in
v1.

**Implementation.**

- `client/src/rpg/telemetry.ts`:
  - IndexedDB store `telemetry` in the RPG database (next to `hero` and `combat`; database name and
    upgrade owned by `client-engineer`), auto-increment keys, entries
    `{t_ms, kind: 'fight' | 'event', data}`. `fight.data` is the WASM `FightRecord` JSON plus the
    client envelope `{wall_ms, turn_ms_median, turn_ms_p90}` (wall clock allowed here: reporting,
    not rules, §24.1).
  - Written once at the end of each fight (from the WASM `telemetry_record()` call), and in small
    batches for session events: never on the per-action hot path.
  - Ring cap 5 000 entries (TUNE): the oldest are dropped first. About 2.5 MB at most.
  - On by default, local only (PROPOSAL, open question O3); a "Clear playtest log" action.
  - **Export playtest log**: downloads `ab-alone-playtest-YYYY-MM-DD.json` (local date, like
    `gamefile.ts`): `{v: 1, build, tester, entries: [...]}`, one entry per line (like Copy
    diagnostics). `tester` is an optional 4-character code the tester types, never a name.
  - The export holds no private key, no peer id, no room id: group fights record `party` only.
- `crates/abalone-balance/examples/playtest_report.rs`: reads one or more exported files (16 MiB
  each at most, TUNE), parses the fight records with `FightRecord::from_json_line`, aggregates them
  with the ladder's `aggregate`, and adds human-only metrics: median seconds per player turn, first
  boss win attempt per tester, quit before first win, unanswered alert share, XP and gold per hour.
  Same Markdown style as the ladder. JSON parsing needs `serde_json` in this dev-only crate
  (`tech-lead` approves).

**Dependencies.** `client-engineer` (DB setup, the WASM call), `ux-designer` (button place and
wording, in the settings panel next to Copy diagnostics), `combat-engineer` (WASM export of the
record), `tech-lead` (`serde_json` in a dev crate), `devops-build` (none: the tool is not in CI).

**Tests.**

- Unit (vitest, `telemetry.test.ts`): Given 5 001 entries written, Then 5 000 remain and the first
  one is gone. Given an export, Then the file name follows the local date and the JSON has `v: 1`,
  `build`, and one line per entry. Given a fight record with a peer id field injected by mistake, Then
  the export scrubs it (same rule as `logger.ts` `scrub`).
- Rust (`playtest_report`): Given two files from the same tester code, Then their records merge into
  one tester. Given a file with `v: 2`, Then the tool exits 2 naming the file.
- **Playwright e2e** (player-facing, CONTRIBUTING §11): Given the R1 test fight driven by the e2e
  hook, When the fight ends and the player clicks "Export playtest log", Then a download happens whose
  JSON has one `fight` entry with `ending` set; When the page reloads, Then the entry is still in the
  store. Screenshot of the settings panel with the button in the PR (CONTRIBUTING §6.4).

**Risks.**

- Browsers can clear storage (`tech.md` §8): playtesters export right after the session (script).
- A tester may paste an export into a public issue: the file holds no personal data by construction,
  and the playtest doc says so (open question O9).

### 4.16 Human playtest protocol (`game-design.md` §8 steps 4 and 5, §25 phase exits, §26 Q7 and Q10)

**Gameplay points.** "Tuned by playtest" everywhere; §26 Q7 and Q10 "À vérifier en playtest";
`game-design.md` §8: 5 humans per boss, a mix of Abalone players and non-players, recorded moves,
death heatmap.

**Implementation** (`docs/specs/rpg/playtest.md`):

- **When**: one round before the exit of R1, R2, R3, R4, R8 and R10 (TUNE), on the build that is a
  candidate for the exit. Not every phase needs one: R5, R6, R7 and R9 use session events from the
  next round.
- **Who**: 5 testers per round (FINAL for bosses in `game-design.md` §8; TUNE elsewhere), at least 2
  Abalone players and 2 non-players. Owners may test but count at most 1 of the 5.
- **Build**: `main` deployed on Pages, RPG entry behind the flag chosen by `client-engineer` (open
  question O8); the tester notes the build commit shown in Copy diagnostics.
- **Session**: 30 to 45 minutes (TUNE), a written script per phase, an observer who writes notes and
  does not help except for a blocking bug. No video, no audio, no name.

  | Round | Script | Measured |
  |---|---|---|
  | R1 | 3 reference skirmishes as Warrior level 1, no tutorial, then the push quiz | Seconds per player turn; wins; push quiz; Edge alert noticed |
  | R2 | One skirmish with each of the 4 classes | Class preference; perceived fairness per class; ability use counts |
  | R3 | Tutorial island levels 1 to 4 (§11) to the lineage trial | Minutes per level; which lesson failed (select, push, sumito, eject, Formation, Isolation) |
  | R4 | Walk, fight 5 packs, die once, return to the Beacon, reload | Fights per hour; time walking; recovery after death; reload worked |
  | R8 | The Echo at nominal level from a test save, up to 15 attempts | Attempt of first win; quit; deaths per phase; unanswered tells; cause named |
  | R10 | 2 testers in duo, then a 1v1 arena on the template | Hero deaths by round 4; perceived counterplay |

- **Questionnaire** (5-point scale, TUNE wording by `ux-designer`):
  1. I could predict whether a push was legal before trying it.
  2. When my hero was at risk at the edge, I saw it in time.
  3. My losses felt like my mistakes.
  4. I knew what the enemy would do next turn.
  5. I want to play another fight.
  6. (R8) I could say why I lost each attempt.
  Plus two free-text questions: "What confused you?" and "What did you do most?".
- **Push quiz** (R1, R2): the 6 weighted-push examples of §6.4 as 6 pictures; the tester says legal
  or illegal. Gate (TUNE): at least 4 of 5 testers get 5 of 6 or more. A fail goes to `ux-designer`
  (the preview, §6.4 "L'aperçu affiche le compte") before any rule change.
- **Round gates** (TUNE): median of items 1 to 4 at least 3.5 of 5; no item with 2 or more testers at
  1 of 5 without a filed issue.
- **Data flow**: each tester exports the playtest log; the observer posts the session notes, the
  questionnaire answers and the export file as comments on the round's playtest issue (CONTRIBUTING:
  talk only through issues). The analyst runs `playtest_report` on the files, posts the table and the
  comparison with the targets, files `bug` issues first, then tuning Tasks (one knob each).

**Dependencies.** `ux-designer` (questionnaire wording, quiz pictures), `narrative-quest-designer` (R3
tutorial content), `encounter-boss-designer` (R8 test save at the nominal level), `client-engineer`
(test saves, flag), owners (recruiting testers).

**Tests.** The protocol is a doc; its data path is tested by section 4.15. One Playwright e2e checks
the test save used in R8 loads the hero at the nominal level (owned by `encounter-boss-designer`'s
boss e2e, listed here as a need).

**Risks.** 5 testers per round over 6 rounds is 30 sessions: owners may not find them. Then the round
runs with fewer and its gates are read as indicative, written in the report (PROPOSAL).

### 4.17 Determinism checks of measurement (§24.1, §25 R1)

**Gameplay points.** §24.1 integers only, fixed order, the state hash covers everything; §25 R1
"déterminisme vérifié (même log = même hash)".

**Implementation.** Three checks, all in the ladder run (FINAL proposed, since determinism is locked
by #313 choice 4):

1. Replay hash (section 4.5, `ReplayMismatches == 0`).
2. Run twice: a small fixed cell (the R1 reference skirmish, 3 seeds, `Default`) runs twice in the same
   process; the two `ladder.jsonl` outputs are byte-identical (unit test, fast budget).
3. Cross-target: the `final_hash` of 3 pinned fight logs is the same natively and in
   `wasm-pack test --node` (shared fixture; the test itself is `combat-engineer`'s or `devops-build`'s
   cross-target job, this role provides the logs from the ladder).

**Dependencies.** `combat-engineer` (hash), `devops-build` (cross-target job).

**Tests.** As listed; Given a driver stub that injects a different action on the second run, Then
check 2 fails and prints the first differing line.

**Risks.** Thread order of parallel seeds must not leak into the output: records are sorted by
(scenario, tier, seed) before writing (PROPOSAL, already how `examples/ladder.rs` joins threads in
order).

### 4.18 Biomes, terrain and world modifiers (§5.1, §5.2, §4.8)

**Gameplay points.** Biome terrain shares and global rules (§5.2), affinity +10 % resource, night
+10 % monster stats and weather (§4.8, v2).

**Implementation** (R4 for 3 biomes, R9 for 10, TUNE):

- One scenario per biome with the same class and a level-matched reference pack. Gate: `Default`
  wins within ±3 of 20 of the Plains row, except where `world-designer` declares a biome harder on
  purpose (then its own band).
- Affinity check: an affine class on its biome wins at most +2 of 20 more than off its biome (the
  +10 % resource must not decide fights).
- Terrain sanity: `TurnCaps == 0` and `ReplayMismatches == 0` on every biome (terrain rules are the
  most likely place for a stall or an order bug: Ice slides, Vents, Quicksand).
- Night and weather (§4.8, v2): two scenario variants (night on, rain) on one biome, report only.

**Dependencies.** `world-designer` (biome tables, declared difficulty), `class-designer` (affinity),
`combat-engineer` (terrain rules).

**Tests.** Given a Plains row at 18 and a Marsh row at 14, Then the biome gate fails (14 < 15).

**Risks.** Terrain is seeded per tile: 20 seeds give 20 terrains, which is the point, but a rare
terrain bug may show on one seed only; the report lists the seeds of every non-win for repro.

---

## 5. Feedback on the gameplay spec

Contradictions and gaps found while writing this file. The gameplay spec is not modified; each item
asks an owner or another role to decide.

- **F1 (§18, stale).** "Ce n'est pas encore prouvé pour The Chaplain et The Ballast Mind (0 sur 10
  dans `boss-balance.md`)". Since #207, `boss-balance.md` §3 records the Chaplain at 7 of 10 with the
  pro player and a stored win (`tests/fixtures/chaplain.txt`). Only the Ballast Mind has no fixture.
- **F2 (§18).** "L'échelle de bots qui tourne chaque nuit en CI" (inherited from `game-design.md` §8):
  no workflow runs any ladder today; `nightly.yml` runs the live e2e only. Needs `devops-build` D11.
- **F3 (§6.12).** "La télémétrie réutilise `encounter/telemetry.rs`": its types are classic-only
  (plies, Black and White, marbles, `DeathCause` with `mirror`, `rim_ejection`); an RPG fight needs
  rounds, HP, the hero, Losses, abilities. Only the approach (pure record, JSON line, local) can be
  reused; the classic module stays for the Mess bosses.
- **F4 (§25 R2, R9).** "Chaque classe bat la meute de référence" and "les 8 classes passent l'échelle"
  give no win rate, no bot strength and no seed count, so the exit cannot be checked. Section 4.8
  proposes them.
- **F5 (§6.8 vs `game-design.md` §8).** Boss attempt length: 8 to 15 min in §6.8, 5 to 12 min in
  `game-design.md` §8. One must win.
- **F6 (§6.8).** Target durations are in minutes, but the engine has no clock and the ladder must
  never use one (§24.1, `game-design.md` §8). The spec needs rounds per format, or a seconds-per-turn
  assumption (`lead-game-designer` proposes 10 s).
- **F7 (§11).** The XP curve has no matching rewards: no XP per fight, quest, tile or dungeon, so the
  time targets (1 h 30, 12 h, 45 h, 110 h) cannot be checked. From the curve, the XP per hour must
  rise about ×4.6 between levels 1 to 10 and 60 to 100. Also `n/3` is not an integer and §24.1 asks
  integers: the rounding (floor gives 1 376 760 total XP instead of 1 394 800) is not stated.
- **F8 (§5.3 vs §6.8).** A skirmish is "menace 6 (4 à 7 boules)", but a Minion costs 0.5, so threat 6
  allows 12 balls; it is not said whether the pack leader counts. Elite rarity says "×1,5" and "PV ×3":
  whether HP is ×1.5 then ×3 (×4.5) or ×3 in total is ambiguous.
- **F9 (§6.2 vs §4.4 and §11).** In a group, a pack's level is "max(zone minimum, player level)", so a
  high player never meets a grey or green pack in a group, while solo colour bands and the "no XP from
  grey" rule assume packs below the player exist. The solo rule for a pack's level is not stated at all
  (zone band? tile seed?).
- **F10 (§6.8 group table).** "Chaque meute à sa menace solo" while each player brings fewer Fragments
  (skirmish: hero + 3 or + 4 in a group against hero + 5 solo), so a group fight is harder per player
  than solo unless allies' help outweighs it. The intent (harder, equal, easier) is not stated, so the
  group gate of section 4.14 has no target from the spec.
- **F11 (§26 Q7 and Q10).** Both are left "à vérifier en playtest" with no measurable criterion
  ("éjecter le héros en 3 tours", "combats qui ne finissent jamais"). Sections 4.7 and 4.8 propose
  criteria; an owner confirms.
- **F12 (§1 pillar 3).** "La compétence compte plus que les stats" has no test. `lead-game-designer`
  §4.3 proposes one; this role runs it (section 4.9).
- **F13 (§4.8 with §6.12 and §24.1).** Night (+10 % monster stats) and weather (lightning +25 %, range
  −1) change combat numbers by UTC time. The spec does not say whether these flags are part of the
  combat state and the hash. Without it, a boss retry "avec la même graine" (§6.12) can play
  differently after nightfall, and a replay can diverge. They must be pinned in the fight state and
  in every record.
- **F14 (§6.5 with §7.2).** The ±5 % per level gap modifier stacks on stat growth `g(L)`, whose step
  per level falls from +9 % at level 1 to +1.6 % at level 50. The same colour (say red, +5 levels) is
  then a much bigger wall at level 10 than at level 80. Not a contradiction, but the colour bands of
  §4.4 do not mean the same difficulty across levels.
- **F15 (§24.2).** The player bot is "le même agent, avec un script de rotation par classe": class
  balance measured by a scripted rotation measures the script. The R2 and R9 exits rest on it; the spec
  should accept human data as the tie-breaker before a class change (section 4.8).
- **F16 (§18 vs `game-design.md` §8 method 1).** §18 keeps "the grid" but not which ladder criterion:
  `game-design.md` §8 says "beaten by depth N and not by depth N minus 2", `boss-balance.md` uses "pro
  player at 10x wins 7 to 9 of 10". This file uses the second (section 4.11).
- **F17 (§4.2).** Out of combat the hero regains 5 % of max HP per second, so full HP in 20 s: HP that
  "restent ceux de la fin du combat précédent" matter only for an ambush within seconds. If HP
  carry-over is meant as a cost between fights, the regen is too fast; if not, the sentence adds UI
  for nothing.
- **F18 (§6.12, game-design §8).** Telemetry is specified for boss attempts only; nothing says what
  is recorded for world fights, PvP or the session (XP, gold), nor that it stays local and has no
  personal data. Section 4.15 proposes it.

---

## 6. Open questions

- **O1.** Who owns the `rpg_ladder` example: `ai-engineer` (as `devops-build` D11 assumes) or this
  role? Proposal: `ai-engineer` owns `play_fight` and the bots, this role owns the example glue, the
  data, the aggregation, the report and the exit codes.
- **O2.** One `FightRecord` for every fight, bosses included (merging `encounter-boss-designer`'s RPG
  boss record), or two types?
- **O3.** Local telemetry on by default (local only, export on demand), or opt-in at first launch?
- **O4.** Label for tuning issues opened by the nightly ladder: a new `balance` label, or `bug` as
  `devops-build` assumes (its Q6)?
- **O5.** Seeds per cell (20 packs, 10 bosses) and the PvP matrix weekly rather than nightly: accepted?
- **O6.** Do the human boss targets of `game-design.md` §8 (first win at attempt 3 to 10, quit at most
  20 %, phase share at most 50 %, unanswered tells at most 40 %) carry over to RPG bosses, and which
  attempt length (5 to 12 or 8 to 15 min)?
- **O7.** At what hero level and gear is an RPG boss calibrated: the dungeon's nominal level with a
  template, or the Heroic level (§17)?
- **O8.** Which build do playtesters use: `main` on Pages behind a flag, or a preview deploy?
- **O9.** May testers attach their export files to public issues, or should they send them to an
  owner (no personal data by construction, but testers may not want their play public)?
- **O10.** Do balance gates ever block a release (like the boss release gate), or only report (the
  nightly health report)? `devops-build` asks the same.

---

## 7. Tasks

One Task per PR. Phases from §25. "Done" also includes CONTRIBUTING §5 (Definition of Done): strict
TDD with the test commit first, 100 % lines and regions in Rust, local checks green, one e2e run for
player-facing changes with a screenshot in the PR.

**PBA-01. Balance targets and playtest protocol docs** (R0)
Outcome: `docs/specs/rpg/balance.md` and `docs/specs/rpg/playtest.md` state every target, gate band,
metric and the human protocol, each number tagged.
- [ ] `balance.md`: principles (section 2), bot tiers, metrics table, targets per format, class, level
      gap, boss, PvP, pacing, with tags
- [ ] `playtest.md`: when, who, scripts per round, questionnaire, push quiz, data flow, privacy note
- [ ] Feedback items F1 to F18 listed for the owners in the Decision #313 thread (by the lead agent)
- [ ] Docs-only PR, draft, merged by an owner with the admin bypass

**PBA-02. Fight telemetry record** (R1)
Outcome: every RPG fight can produce one integer-only `FightRecord` as one JSON line, built from
`Effects`.
- [ ] `crates/abalone-rpg/src/telemetry.rs`: `FightMeta`, `FightRecord`, `EndCause`, `Ending`, `Tally`
- [ ] JSON line with fixed key order, round trip, version check
- [ ] Unit tests of section 4.4 (ejection split, hero causes, Usure flag, sorted abilities, pinned lines)
- [ ] Needs `combat-engineer`'s `Effects` with removal source and Edge danger flag merged first

**PBA-03. Balance crate: aggregation, gates and report** (R1)
Outcome: a list of records turns into a byte-stable Markdown report with gate verdicts and an exit code.
- [ ] New crate `crates/abalone-balance` (`publish = false`, not in the wasm build), approved by
      `tech-lead`
- [ ] `aggregate.rs` with every metric of section 4.5 (integers, lower median, nearest-rank p90)
- [ ] `gates.rs`: `Gate`, `Metric`, `evaluate`, derived gates (`WinSpread`, class spread)
- [ ] `report.rs`: Markdown, JSONL, run-time section not gated, exit codes 0/1/2
- [ ] Tests of section 4.5, including the byte-identical snapshot

**PBA-04. Scenario and gate data with integrity tests** (R1)
Outcome: the ladder matrix and its gates live in data and a bad reference fails `cargo test`.
- [ ] `data/ladder/scenarios.ron` and `data/ladder/gates.ron` schemas and loader (with `tech-lead`'s
      loader)
- [ ] Seed derivation (`mix(fnv1a(id) ^ i)`) with pinned values
- [ ] Integrity tests of section 4.3 (ids exist, bands valid, `since` handling)
- [ ] R1 rows: reference skirmish, tiers `Random`, `Weak`, `Default`, `Strong`, gates of sections 4.6
      and 4.7

**PBA-05. R1 ladder run and determinism checks** (R1)
Outcome: `cargo run --release -p abalone-balance --example rpg_ladder` plays the R1 matrix, checks
replay hashes and prints the first measured table.
- [ ] `examples/rpg_ladder.rs` glue on `ai-engineer`'s `play_fight` (O1 settled)
- [ ] Replay check, run-twice check, first-loss fixture per cell
- [ ] `AlertlessPushEjections` and `TurnCaps` gates at 0
- [ ] First measured R1 table pasted in the PR and in `balance.md` "Latest measured values"
- [ ] Handed to `devops-build` for the nightly job (D11)

**PBA-06. Client telemetry store and export** (R1)
Outcome: a player can export a playtest log of their RPG fights from the settings panel, and it
survives a reload.
- [ ] `client/src/rpg/telemetry.ts`: store `telemetry`, envelope with turn timings, ring cap, clear,
      export file, scrub
- [ ] Vitest unit tests of section 4.15
- [ ] Playwright e2e: fight, export, reload; screenshot of the settings panel in the PR
- [ ] Button wording and place agreed with `ux-designer`

**PBA-07. Playtest report tool and R1 playtest round** (R1)
Outcome: exported playtest files produce the same report as the ladder plus human metrics, and the R1
round is reported.
- [ ] `examples/playtest_report.rs` (seconds per turn, quiz, alert share), `serde_json` approved
- [ ] Rust tests of section 4.15 (merge by tester, version error)
- [ ] R1 round run with 5 testers, results posted on the round issue, `balance.md` updated with the
      measured seconds per turn (feeds `lead-game-designer` LGD-12)

**PBA-08. R2 class ladder and anti-stall gates** (R2)
Outcome: the 4 R2 classes are measured against their reference packs and the R2 exit criterion is a
gate.
- [ ] Scenarios for Guardian, Warrior, Mage, Healer against `encounter-boss-designer`'s T7 packs
- [ ] Class gates of section 4.8, format gates of section 4.6 for elite and room if packs exist
- [ ] Threat-parity scenarios of section 4.10
- [ ] R2 playtest round (4 classes, push quiz again), report posted
- [ ] Before and after table for every tuning made to pass

**PBA-09. Pacing model and session events** (R3)
Outcome: the time to reach levels 10, 30, 60 and 100 is computed from data and checked against §11.
- [ ] `pacing.rs` and `data/balance/pacing.ron` with tests of section 4.12
- [ ] Session events `xp`, `level_up`, `zone_enter`, `session_start`/`end` via one `track()` in the
      client, with unit tests
- [ ] `playtest_report` shows XP per hour per band and per source
- [ ] R3 playtest round (tutorial levels 1 to 4), minutes per level reported

**PBA-10. Level-gap curve and skill-over-stats benchmark** (R3)
Outcome: the colour bands of §4.4 and pillar 3 have measured values at levels 10 and 30.
- [ ] Scenario family d in {−6, −3, 0, +3, +5}, L in {10, 30}
- [ ] Monotonic gate with a 1-win tolerance, green and red bands
- [ ] Skill-over-stats scenario with `lead-game-designer` (LGD-13)
- [ ] Result table in the PR and in `balance.md`

**PBA-11. World session metrics and R4 playtest** (R4)
Outcome: fights per hour, walking time, deaths and returns are measured in the first world build.
- [ ] Events `death_world`, fights per hour in `playtest_report`
- [ ] Biome scenarios for the 3 R4 biomes and the affinity check (section 4.18)
- [ ] R4 playtest round (walk, fight, die, return, reload), report posted

**PBA-12. Economy and loot events** (R5)
Outcome: gold in and out, drops per rarity and gathering yields per hour come out of playtest exports
for `economy-designer`.
- [ ] Event schema for `gold`, `loot`, `gather`, `craft` (ids from `economy-designer`); `gold` and
      `loot` wired in R5; `gather` and `craft` call sites are added by the R7 crafting Task through the
      same `track()`
- [ ] `playtest_report` sections for gold per hour, sink/faucet ratio, drops per rarity
- [ ] Unit tests with unknown ids counted as `other`

**PBA-13. RPG boss ladder and boss calibration report** (R8)
Outcome: every released RPG boss is measured with the `Pro` tier, its phases are all reached, and the
R8 boss playtest is reported.
- [ ] Boss scenarios per released boss, 4 classes, `Random`, `Default`, `Pro`
- [ ] Gates of section 4.11 (7 to 9 of 10, last phase reached, phase death share)
- [ ] Human metrics: first win attempt, quit, unanswered tells, anti-skill-wall item
- [ ] R8 playtest round on The Echo at nominal level, report posted
- [ ] Ballast Mind excluded until `ai-engineer` gives a budget that fits the nightly time (noted in the
      report)

**PBA-14. 8-class ladder and Revenant stall check** (R9)
Outcome: the 8 classes pass the class gates and §26 Q7 has a measured answer.
- [ ] Scenarios for Assassin, Necromancer, Chronomancer, Geomancer; all R1 to R8 scenarios re-run
- [ ] Necromancer draw and length gates, `revenants_raised` reported
- [ ] Biome scenarios for the 10 biomes (section 4.18)
- [ ] Matrix split by phase if the run passes 45 min

**PBA-15. PvP mirror matrix and hero exposure in PvP** (R10)
Outcome: class pairs on the level 100 template, initiative and early hero deaths are measured weekly.
- [ ] Arena scenarios on `pvp-br-designer`'s template, 64 ordered pairs, 20 seeds
- [ ] Gates of section 4.14 and `EarlyHeroDeaths(4)` per pair (§26 Q10)
- [ ] Weekly job handed to `devops-build`
- [ ] R10 playtest round (duo and 1v1 arena), report posted

**PBA-16. Group fairness and battle royale report** (R10)
Outcome: duo, trio and quatuor fights are measured against solo, and BR placements by class are
reported.
- [ ] Group scenarios of the reference skirmish with allied `Default` bots
- [ ] Group gate (−3 to +2 of 20 against solo), result discussed against Feedback F10
- [ ] BR bot lobbies, average placement by class, report only until 100 lobbies
