# Combat rules layer: implementation spec (role `gameplay-programmer`)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, still open). Source of truth:
the validated French gameplay spec (`docs/specs/rpg/plan.fr.md`, the same text as the approved
plan). A section number like "§6.4" points to that gameplay spec. This file adds no game rule of its
own on top of it: it says how to build the combat rules layer, and lists every gap or contradiction
it found (section 22). Where a rule is missing, this file writes a PROPOSAL and flags it there. No
code yet: strict TDD applies from R1 (CONTRIBUTING section 11).

Tags, as in `rules.md`: **FINAL** (decided: by #313's four choices, by the validated decisions of the
pivot, or by an existing FINAL spec), **TUNE** (a starting value, set by the bot ladder and playtests),
**PROPOSAL** (proposed here or in the gameplay spec, an owner confirms). Every rule number below
carries one. A number copied from the gameplay spec keeps its status there: the gameplay spec says
"everything is PROPOSAL and every number is TUNE unless stated", so most copied numbers are TUNE.
Values inside Given/When/Then examples (coordinates, HP of a test unit) are test data, not rules,
and carry no tag.

---

## 0. Scope

The gameplay-programmer owns the **combat rules layer**: the pure Rust code in the new crate
`abalone-rpg` that turns a combat state and one action into the next state and an `Effects` list.

In scope (this role writes the code and its tests):

- Combat state model: units, entities, camps, the turn frieze, slots, counters (§6.0, §6.2).
- The turn: start, action phase, end; the three slots; the mandatory Mouvement; Steps and the bonus
  Step; cooldowns; status durations; atomic resolution (§6.3).
- `apply_action`, `legal_actions`, `preview`, `edge_danger`, the `Effects` list, the combat view
  (§24.2, §6.6, §1 pillar 2).
- The weighted push **as seen from the combat**: the Weight of each unit, push modifiers (Percée,
  Bélier, Avalanche, Titan, Écrasement), the Choc after the push (§6.4, §6.5). The push geometry
  itself lives in `abalone-core` (`engine-programmer`).
- Damage and healing: the integer formula, Choc, position modifiers, the Guard, the damage pipeline
  (§6.5).
- Death, ejection, the hero rule, Corpses (Dépouilles), the Graveyard, Revenants (§6.6).
- Victory, rout, leader death, flight, the anti-stalling rules (§6.7, §6.8 thresholds).
- The interpreter of the ability language: targeting, the 12 primitives, ejection limits, mass
  control cap, resolution order, channelling (§6.10).
- Statuses, keywords, diminishing returns, Tenacity (§6.11).
- Preparations (§6.3).
- Triggers for passives: class traits (§8), rune keystones (§9), elite affixes (§5.3), item Aspects
  (§12): the dispatch, not the content.
- Terrain **rules** at turn start and turn end, and biome global modifiers inside a combat (§5.1,
  §5.2, §4.8, §17 Mythic affixes).
- Combat-level engine support for each class mechanic of §8 (resources, combo points, Overheat,
  reactions, history snapshots, Revenants, terrain edits).
- Determinism of the combat layer: integer math, fixed order, stable state hash, action log replay
  (§24.1).
- Test tooling for rules: the scenario text format (pillar 4), invariant tests.

Out of scope (each section lists them under **Dependencies**): the board region, the terrain
storage and the push geometry in `abalone-core`; the monster AI and the player bot; P2P transport,
lockstep and commit-reveal; the client, rendering and the WASM glue; all content data (classes,
abilities, monsters, runes, items, biomes); hero stats and level growth; the world map; loot and
XP.

### 0.1 Role slugs used for dependencies

Assumed names; the lead maps them to the real roster. Peer role files already use other names for
the same roles: the alias column lists them so the files can be cross-read.

| Slug | Owns | Aliases in peer role files |
|---|---|---|
| `gameplay-programmer` | This file: crate `abalone-rpg` rules layer | `combat-engine`, `combat-engineer` |
| `engine-programmer` | Crate `abalone-core`: region mask, occupancy by unit id, terrain layer storage, weighted push and Ice slide geometry, fixed scan order | `engine-engineer` |
| `ai-programmer` | Monster AI, search on the combat state, player bot, RPG bot ladder | `ai-engineer` |
| `network-programmer` | Group lockstep, signed action log, commit-reveal seeds, BR rounds transport | `netcode`, `network-engineer`, `network-p2p` |
| `client-programmer` | WASM bridge glue, three.js scenes, IndexedDB stores, Playwright e2e | `client-ui`, `client-engineer` |
| `ux-designer` | Readability, previews, action bar, Edge danger display | |
| `game-designer` | Rule wording in `rpg/combat.md`, numbers, sign-off on PROPOSALs | |
| `class-designer` | Class kits, abilities, traits as data | `content-designer` |
| `progression-designer` | Hero stats, `g(L)`, Fragments stats, talents, runes as data | `stats-progression`, `progression-talents` |
| `encounter-boss-designer` | Monsters, packs, intents, bosses as data | `dungeons-bosses` |
| `world-programmer` | Crate `abalone-world`, tile to board, terrain generation, formations | `world-generator`, `world-generation`, `world-engineer` |
| `tech-lead` | Crate layout, data format (RON or JSON), data loader, integrity CI, MCP | `data-tools` |
| `items-designer` | Items, Aspects, consumables as data | `items-loot`, `loot-economy` |
| `pvp-br-designer` | Arenas, normalisation templates, battle royale | `pvp-br` |
| `narrative-quest-designer` | Quests that read combat `Effects` | `quest-designer` |
| `qa-engineer` | Playtest plans, e2e plans | `qa-balance` |

---

## 1. Inputs read

- Gameplay spec, the whole file; in detail §1, §4.2, §4.4, §4.6, §4.7, §4.8, §5.1, §5.2, §5.3, §6
  (all of it), §7.1, §8.0 to §8.8, §9, §10, §12, §15.4, §17, §18, §19, §20, §24, §25, §26.
- `docs/specs/rules.md` sections 1 to 13 (board, sumito, ejection, turn order, end of game, mode
  deltas, the 40 examples, OPEN items).
- `docs/specs/game-design.md` §1 (pillars), §3.3 (boss structure), §5 (anti-stalling), §6 (battle
  royale).
- `docs/specs/tech.md` §3 (core API, `Effects`, `Ruleset`), §4 (bridge), §6 (P2P trust model), §7
  (AI, bosses, determinism), §8 (persistence, `savegame.ts` format), §10 (testing).
- `docs/specs/boss-balance.md`, `docs/specs/multiplayer.md`, `docs/specs/mcp.md` (headers and
  the parts about the engine API).
- `CONTRIBUTING.md` §6.4 (PR, screenshot), §11 (strict TDD, 100 % lines and regions), §13 (checks).
- Peer role files already written: `encounter-boss-designer.md`, `ux-designer.md`,
  `narrative-quest-designer.md` (what they expect from this role).
- Code: `crates/abalone-core/src/board.rs`, `moves.rs`, `game.rs`, `search.rs`, `encounter.rs`,
  `encounter/fixture.rs`, `encounter/ladder.rs`, `encounter/telemetry.rs`, `lib.rs`, `Cargo.toml`;
  `crates/abalone-wasm/src/lib.rs` (encodings header); `client/src` file list (`savegame.ts`,
  `ghost.ts`, `eject.ts`, `slide.ts`, `session.ts`, `p2p.ts`).

### 1.1 Facts from the code that shape this spec

1. `Board` stores `HashMap<(i32, i32), Cell>` where `Cell` is `Empty | Black | White`. There is no
   unit identity, no third side, no terrain. The RPG layer needs a unit id per occupied cell
   (`engine-programmer`, §24.2).
2. No code iterates the `HashMap`: every scan is `for q in -MAX_RADIUS..=MAX_RADIUS { for r in ... }`,
   so **q-major** order. §24.1 asks for "r ascending, then q ascending". The two orders differ: the
   RPG layer must use one helper for the fixed order, never a hand-written double loop.
3. `game.rs::position_hash` uses `std::collections::hash_map::DefaultHasher`. Its output is not
   guaranteed stable across Rust releases, so two peers built with different toolchains can
   disagree. The combat hash must use an in-crate stable hash (section 4.6).
4. `moves::apply` returns `(Board, bool)`. There is **no `Effects` type** in the code, although
   tech.md §3 describes one and §24.2 calls it "the current render contract". The client infers
   animations from flat arrays (`eject.ts`, `slide.ts`, `ghost.ts` replays the move). `Effects` is
   new work, owned here.
5. `MAX_RADIUS = 5` bounds every scan. Battle royale (radius 8) and stitched multi-tile boards need
   the region mask of §24.2 (`engine-programmer`) before this layer can run on them.
6. `abalone-core` has **no dependency** at all (no `serde`, no `proptest`). Adding `serde` and
   `serde_json` to the new crate is a `tech-lead` call (section 4.8).
7. Boss hooks today are `fn(&Board, u8, u64) -> Board` run after a ply, with removals credited by
   diffing boards (`credit_removals`). The RPG layer replaces diffing with explicit effects: every
   removal is an `Effect`, never inferred.
8. `encounter/fixture.rs` stores a game as a small text format (header lines, then one move per
   line). The scenario format of section 4.7 follows the same style.
9. `search.rs` is negamax on `Game` with a node budget and an optional `Step` callback. The RPG AI
   (`ai-programmer`) needs a trait over the combat state; this layer exposes `legal_actions` and
   `apply_action` for it (section 4.4).

---

## 2. Conventions used by every section

- **Own turn.** "Turn" in a duration or a cooldown always means a turn of one named entity. This
  file writes `T(E, n)` for the n-th turn of entity `E`, counted from 1 (PROPOSAL).
- **Round.** A round ends when every entity in the frieze that is still on the board has played once
  (§6.0). `round` counts from 1 (PROPOSAL).
- **Fixed cell order.** `r` ascending, then `q` ascending (§24.1, PROPOSAL until the Decision). One
  function `cells_in_order(region)` from `abalone-core` gives it; this crate never loops on raw
  coordinates.
- **Fixed unit order.** Units live in a `Vec<Unit>` sorted by `UnitId`; entities in a `Vec<Entity>`
  sorted by `EntityId` (§24.1). New units (Revenants, summons) get the next free id, never a reused
  one (PROPOSAL).
- **Integer math.** Stats are `i32`. Percentages are basis points (`bp`, 10 000 = 100 %). Products are
  computed in `i64`, in the order written in section 9.1, with one floor at the end of each formula
  (§24.1). No `f32` or `f64` anywhere in the crate (FINAL, #313 choice 4).
- **No randomness in combat** (FINAL, #313 choice 4). The combat seed only exists for tie-breaks the
  spec assigns to it (PvP initiative, §6.1) and for content generated before the fight. No RNG
  object lives in `CombatState`.
- **One action.** "Action" in the ejection limit (§6.10) means: one Mouvement, one Step, one
  ability cast, one consumable use, or one terrain event from one source, together with every
  effect it triggers (PROPOSAL, see Feedback F12).
- **Elementary effect.** One primitive applied to one target (one unit or one cell). State checks
  (0 HP removal, victory) run after each one (§6.3, PROPOSAL for the definition, see Feedback F5).

---

## 3. Crate layout and ownership

New crate `crates/abalone-rpg`, a workspace member, depending on `abalone-core` only (and on
`serde`, `serde_json` if `tech-lead` agrees, section 4.8). No I/O, no clock, no threads, no global
state (tech.md §3, FINAL).

| File | Content | First phase |
|---|---|---|
| `lib.rs` | Public re-exports, `RULES_VERSION` | R1 |
| `ids.rs` | `UnitId(u16)`, `EntityId(u8)`, `CampId(u8)`, `AbilityId(u16)`, `StatusId(u8)`, `TerrainId(u8)` | R1 |
| `setup.rs` | `CombatSetup` (input), validation, `CombatState::new` | R1 |
| `state.rs` | `Unit`, `Entity`, `CombatState`, accessors | R1 |
| `action.rs` | `Action`, `Picks`, `ActionError` | R1 |
| `effects.rs` | `Effect`, `Effects` | R1 |
| `turn.rs` | Frieze, turn start and end, slots, mandatory Mouvement | R1 |
| `apply.rs` | `apply_action`, `legal_actions`, atomic resolution loop | R1 |
| `push.rs` | Weight of a unit, push modifiers, the call to the core push, Choc | R1 |
| `formula.rs` | Damage and heal formulas, `g(L)`, position modifiers | R1 |
| `pipeline.rs` | Damage pipeline (redirect, link, Guard, shields, lifesteal, reflect) | R1 (Guard), R2 (rest) |
| `victory.rs` | Losses, rout, hero death, leader death, camps, outcome | R1 |
| `antistall.rs` | No-Loss draw, Attrition (Usure), Breach (Brèche) | R1 (draw), R2 (rest) |
| `edge.rs` | Edge danger | R1 |
| `preview.rs` | Dry run of an action | R1 |
| `view.rs` | `CombatView` for the bridge (ux-designer's contract) | R1 |
| `hash.rs` | Canonical byte encoding, FNV-1a 64 | R1 |
| `notation.rs`, `scenario.rs` | Text notation, scenario files (pillar 4) | R1 |
| `ability.rs` | `AbilityDef` (data), resolved abilities, costs, cooldowns | R1 |
| `target.rs` | Targeting kinds, ranges, picks, resolution order | R1 (single), R2 (rest) |
| `prim/*.rs` | One file per primitive (section 12.3) | R1 (damage, displace self), R2, R9 |
| `eject.rs` | Ejection budget, Éjecteur rule, Unejectable, Instant suspendu | R2 |
| `status.rs` | Status catalog, durations, diminishing returns, Tenacity | R2 |
| `prep.rs` | Preparations | R2 |
| `trigger.rs` | Passive triggers (traits, keystones, affixes, Aspects) | R2 |
| `terrain_rules.rs` | Turn-phase terrain rules, biome modifiers | R2, R4, R9 |
| `resource.rs` | Resource engine (gain, events, decay, caps, debts) | R1 |
| `graveyard.rs` | Corpses, Graveyard, Revenants | R1 (Graveyard), R9 (Revenants) |
| `history.rs` | Turn-start snapshots for the Chronomancer | R9 |
| `round.rs` | Battle royale order resolution with RPG orders | R10 |

**Dependencies.** `tech-lead` (crate creation, workspace, dependency approval, data format),
`engine-programmer` (core API listed in section 8.5).

---

## 4. Shared API and data contracts (§24.2, §24.4, §24.1, §1 pillar 4)

### 4.1 Core types (Rust sketch, PROPOSAL)

```rust
pub struct Unit {
    pub id: UnitId,
    pub entity: EntityId,
    pub kind: UnitKind,            // Hero, Fragment, Monster, Leader, Revenant, Summon, BossHeart, Npc
    pub origin: Option<GraveRef>,  // a Revenant: the Graveyard entry it came from
    pub cell: Option<Axial>,       // None once removed (dead, ejected, left)
    pub level: u8,
    pub base: Stats,               // at combat start; Fragments are derived before (progression-designer)
    pub hp: i32,
    pub hp_max: i32,
    pub weight_base: u8,           // 1..=5
    pub shields: Vec<Shield>,      // instances, see 9.4
    pub statuses: Vec<StatusInst>, // sorted by StatusId then source
    pub dr: [u8; 3],               // diminishing returns: carrier turns left per category
    pub channel: Option<Channel>,
    pub states: ElementStates,     // Mage reactions: Burnt, Frozen, Charged
    pub flags: UnitFlags,          // grace_used, suspended_used, ...
}

pub struct Entity {
    pub id: EntityId,
    pub camp: CampId,
    pub kind: EntityKind,          // Player { seat }, Pack, Boss
    pub hero: Option<UnitId>,      // the hero, or the pack leader
    pub resources: Vec<ResourceState>, // main resource, then combo points or sand debt
    pub abilities: Vec<ResolvedAbility>, // 4 + 1 slots, ranks and Aspects already applied
    pub ready_at: Vec<u32>,        // per ability: first own turn it is usable again (7.4)
    pub preparations: Vec<Armed>,  // at most 2, in arming order
    pub consumables: Vec<(ConsumableId, u8)>,
    pub consumables_used: u8,
    pub turn: u32,                 // own turns started
    pub slots: Slots,              // reset at turn start
    pub losses: u8,
    pub rout_at: Option<u8>,       // None in battle royale
    pub snapshots: [Option<Snapshot>; 2], // R9, Chronomancer
    pub status: EntityStatus,      // OnBoard, Left(ExitReason)
    pub intent: Option<Intent>,    // monsters and bosses, set by the AI (encounter-boss-designer)
    pub passives: Vec<PassiveRef>, // traits, keystones, affixes
}

pub struct CombatState {
    pub rules: CombatRules,        // format, pvp flag, biome and weather modifiers, thresholds
    pub region: Region,            // abalone-core, the cells of the board
    pub terrain: TerrainLayer,     // abalone-core storage, rules here
    pub units: Vec<Unit>,
    pub entities: Vec<Entity>,
    pub frieze: Vec<EntityId>,     // fixed at combat start (6.3)
    pub active: usize,             // index in frieze
    pub round: u32,
    pub phase: Phase,              // Placement, Turn, Over
    pub corpses: Vec<Corpse>,      // one per cell at most (10.3)
    pub graveyard: Vec<GraveEntry>,
    pub tells: Vec<Tell>,          // marks, delayed effects, terrain countdowns
    pub counters: Counters,        // turns without Loss, Breach progress
    pub outcome: Option<Outcome>,
}
```

- Every field above is in the canonical encoding and so in the state hash (§24.1: "board, terrain
  and durations, HP, statuses, cooldowns, resources, Graveyard, Preparations"). Derived values are
  not: Edge danger, Isolation, previews (PROPOSAL).
- `Unit.cell = None` for a unit that left the board; the unit stays in `units` so ids never move.

### 4.2 Actions

```rust
pub enum Action {
    Place { formation: FormationId, swap_hero_with: Option<UnitId> }, // placement phase only
    Move { cells: Vec<Axial>, dir: Direction },        // 1..=3 cells, 4 with Avalanche
    Step { unit: UnitId, dir: Direction },             // the bonus Step (7.6)
    Ability { ability: AbilityId, picks: Picks },
    Consumable { item: ConsumableId, picks: Picks },
    Flee,                                              // starts the flight channel (11.5)
    EndTurn,
}
pub struct Picks {
    pub cells: Vec<Axial>,   // targets in the order the ability reads them
    pub units: Vec<UnitId>,  // chosen units (mass control, ejection choice, bounce targets)
    pub dir: Option<Direction>, // perpendicular direction (Secousse), rotation sense (Rotation)
    pub variant: Option<u8>,    // reserved: free choices written in the ability data
}
```

`ActionError` names every refusal: `NotYourTurn`, `SlotSpent`, `MustMoveFirst` (EndTurn while a
legal Mouvement exists, 7.3), `NotEnoughResource`, `OnCooldown`, `BadTarget`, `OutOfRange`,
`Silenced`, `Stunned`, `Move(MoveError)`, `TooManyPicks`, `StepCapReached`, `GameOver`, and so on.
A refused action never changes the state (FINAL, rules.md section 7 spirit).

### 4.3 Effects (the render and quest contract)

```rust
pub enum Effect {
    TurnStarted { entity: EntityId, round: u32, turn: u32 },
    TurnEnded { entity: EntityId },
    ResourceChanged { entity: EntityId, res: ResourceId, from: i32, to: i32, cause: Cause },
    CooldownStarted { entity: EntityId, ability: AbilityId, turns: u32 },
    AbilityCast { entity: EntityId, caster: UnitId, ability: AbilityId, picks: Picks },
    Moved { unit: UnitId, from: Axial, to: Axial, how: MoveHow }, // Mouvement, Step, Self, Forced, Teleport, Swap, Rewind
    Pushed { group: Vec<UnitId>, run: Vec<UnitId>, dir: Direction, n: u8, m: u8, weight_for: u8, weight_against: u8 },
    Slid { unit: UnitId, path: Vec<Axial> },
    Blocked { unit: UnitId, at_edge: bool },         // a non-Ejector stopped on the last cell (12.4)
    Ejected { unit: UnitId, from: Axial, dir: Direction, credit: Option<EntityId> },
    Damaged { unit: UnitId, source: SourceRef, kind: DamageKind, amount: i32, absorbed: i32, guard_capped: bool },
    Healed { unit: UnitId, amount: i32, to_shield: i32 },
    ShieldChanged { unit: UnitId, total: i32 },
    StatusApplied { unit: UnitId, status: StatusId, turns: u8, stacks: u8 },
    StatusRefused { unit: UnitId, status: StatusId, why: Refusal }, // DR, keyword, Stase
    StatusEnded { unit: UnitId, status: StatusId },
    Reaction { unit: UnitId, reaction: ReactionId },
    TerrainChanged { cell: Axial, from: TerrainId, to: TerrainId, turns: Option<u8> },
    CellAdded { cell: Axial, turns: u8 },             // Pont
    CellVoided { cell: Axial, turns: Option<u8> },    // Breach, Tide, Effondrement, Séisme
    TellPlaced { tell: TellId, cells: Vec<Axial>, fires: FireAt },
    TellFired { tell: TellId },
    Died { unit: UnitId, cell: Axial, corpse: bool },
    Loss { entity: EntityId, unit: UnitId, cause: LossCause, credit: Option<EntityId> },
    Raised { unit: UnitId, entry: GraveRef, cell: Axial },
    Summoned { unit: UnitId, cell: Axial },
    Armed { entity: EntityId, prep: AbilityId },
    PrepFired { entity: EntityId, prep: AbilityId },
    ChannelStarted { unit: UnitId, what: ChannelKind },
    ChannelBroken { unit: UnitId },
    EntityLeft { entity: EntityId, why: ExitReason }, // Routed, HeroDead, Fled, LeaderDead, Eliminated
    CombatEnded { outcome: Outcome },
}
```

- Order of the list = order of resolution. The renderer plays it as a timeline and never diffs
  states (tech.md §3, FINAL).
- `narrative-quest-designer` reads `Loss`, `Died`, `EntityLeft`, `CombatEnded` (their file, quest
  events). `ux-designer` reads everything through the view and the preview.
- The list is part of the contract version (`RULES_VERSION`), not of the state hash.

### 4.4 Functions

```rust
pub fn new_combat(setup: &CombatSetup) -> Result<(CombatState, Effects), SetupError>;
pub fn apply_action(s: &CombatState, a: &Action) -> Result<(CombatState, Effects), ActionError>;
pub fn legal_actions(s: &CombatState) -> Vec<Action>;          // for the active entity
pub fn legal_moves(s: &CombatState) -> Vec<Action>;            // Move only, cheap (AI, Edge danger)
pub fn preview(s: &CombatState, a: &Action) -> Result<Preview, ActionError>;
pub fn edge_danger(s: &CombatState) -> Vec<(UnitId, Danger)>;  // every hero on the board
pub fn view(s: &CombatState) -> CombatView;                    // ux-designer's contract, version 1
pub fn state_hash(s: &CombatState) -> u64;
pub fn replay(setup: &CombatSetup, log: &[Action]) -> Result<(CombatState, Vec<Effects>), (usize, ActionError)>;
```

- `apply_action` is pure: it clones, applies, returns. `ai-programmer` may later ask for an undo
  token (tech.md §3); that is a performance follow-up, not R1.
- `legal_actions` enumerates targets for every castable ability. Zone abilities enumerate centre
  cells; "choose up to 3" picks enumerate combinations of at most 6 candidates (C(6,3) = 20,
  PROPOSAL); ordered multi-picks (Danse des lames) are capped at 64 enumerated sequences in fixed
  order (TUNE). The AI owns pruning (section 19).
- `Preview` = `{ effects, outcome: Option<Outcome>, hero_danger_after: Danger }`. It runs the full
  `apply_action` path, Preparations and victory included (ux-designer P2).

### 4.5 Turn plan for the AI and the network

A turn is a sequence of actions ending with `EndTurn`. The signed log of `network-programmer` holds
one record per action, not per turn, so a reload mid-turn resumes exactly (§6.12). PROPOSAL.

### 4.6 Stable hash (§24.1)

- Canonical encoding: a byte vector written field by field in declaration order, integers little
  endian, vectors prefixed by their length, enums by a one-byte tag. The same function is the
  serialisation behind `state_hash` and the binary save if one is ever needed.
- Hash: FNV-1a 64 over that encoding (PROPOSAL). Simple, no dependency, the same on native and
  wasm32. Collisions are not a security concern: peers compare full logs on mismatch.
- Rule: no `std::collections::HashMap` or `HashSet` in `abalone-rpg` at all; a clippy
  `disallowed_types` entry enforces it (PROPOSAL, `tech-lead`).

### 4.7 Text notation and scenario files (§1 pillar 4)

One line per action:

| Action | Text |
|---|---|
| Move | `move (-1,0)(0,0)>E` (rules.md notation, FINAL there) |
| Step | `step #4>SE` (`#4` is a unit id) |
| Ability | `cast warrior.cleaver @(1,0)`, `cast mage.nova #7 #9 #12`, `cast geo.quake ^NE` |
| Consumable | `use potion.heal @#1` |
| Flee, EndTurn | `flee`, `end` |

A scenario file (`crates/abalone-rpg/tests/scenarios/*.scn`) is one rule as Given/When/Then:

```text
scenario: weighted push, 2 vs 1, Weight 4 vs 3
board: radius 3
terrain: (2,0) mud
entity P camp=0 player class=warrior rout=3
entity E camp=1 player class=guardian rout=3
unit #1 P hero  w=3 hp=120 atk=12 pow=12 arm=20 res=20 lvl=1 at (0,0)
unit #2 P frag  w=1 hp=48  atk=6  arm=10 res=10 lvl=1 at (-1,0)
unit #3 E hero  w=3 hp=156 atk=10 arm=30 res=30 lvl=1 at (1,0)
active: P
when: move (-1,0)(0,0)>E
then: #3 at (2,0)
then: effect Pushed n=2 m=1 wf=4 wa=3
```

- `scenario.rs` parses it, builds a `CombatSetup`, runs the actions, checks each `then:` line.
  Every Given/When/Then example of this file and of `rules.md` §10.5 becomes one `.scn` file
  (PROPOSAL). `game-designer` can add rules without writing Rust.
- The `then:` vocabulary: `#id at (q,r)`, `#id hp=N`, `#id gone`, `#id has frozen=1`,
  `effect <Name> k=v...`, `refused <ActionError>`, `outcome <...>`, `hash=<hex>`.

### 4.8 Data format

Ability, status, terrain and passive definitions are data (§1 pillar 6, §24.3). This crate defines
the Rust types and their `serde` derive; `tech-lead` picks RON or JSON and owns the loader and the
`include_str!` bundling. This file writes JSON below because the bridge, the MCP server and the
client already speak JSON (PROPOSAL).

### 4.9 Dependencies, tests, risks for section 4

- **Dependencies.** `tech-lead` (serde, disallowed types lint, data format), `client-programmer`
  (wasm glue exposing the functions of 4.4 as versioned JSON, §24.4), `network-programmer` (log
  record = one `Action`, hash comparison), `ux-designer` (view fields, preview), `ai-programmer`
  (`legal_actions` cost, undo token later).
- **Tests.** Unit: every `ActionError` variant has one refusing test. Property (seeded loop, no
  external crate unless `tech-lead` adds `proptest`): for 500 random legal action sequences (TUNE),
  `replay(setup, log)` gives the same `state_hash` as the live run; the encoding of a state decodes
  back to an equal state (if a decoder is needed for resume, section 5.5); `apply_action` never
  panics on any action from `legal_actions`. Cross-target: one golden log replayed natively and in
  wasm32 gives the same hash (tech.md §10, `client-programmer` runs the wasm side).
- **Risks.** `legal_actions` size with abilities (branching factor) slows the AI: keep `legal_moves`
  separate and cheap. JSON size of `CombatView` on 7-tile raids (427 cells): send terrain as a sparse
  list (ux-designer already does).

---

## 5. Combat setup, start and end (§6.1, §4.2, §4.4, §6.8, §6.9, §6.12)

### 5.1 `CombatSetup` (input, built by `world-programmer` or `encounter-boss-designer` data)

```json
{
  "v": 1,
  "format": "skirmish",
  "region": { "tiles": [[0, 0]], "radius": 3 },
  "terrain": [{ "cell": [1, -2], "kind": "rock" }],
  "modifiers": ["biome.ash_sylvan", "night"],
  "pvp": false,
  "first_camp": 0,
  "seed": "commit-reveal hex, PvP only",
  "entities": [
    { "id": 0, "camp": 0, "kind": "player", "seat": 0, "rout_at": 3,
      "resource": "rage", "abilities": ["warrior.charge#2A", "warrior.cleaver#1"],
      "passives": ["trait.warrior.momentum"], "consumables": [],
      "units": [{ "kind": "hero", "level": 1, "stats": {}, "weight": 3, "hp": 120, "cell": [0, 2] }] }
  ]
}
```

- Stats arrive final (class, level, items, runes applied) from `progression-designer`; Fragments
  arrive with their derived stats (§6.9: 40 % HP, 50 % ATQ, 50 % ARM and RES, Weight 1, no PUI, all
  TUNE there). This layer does not compute them (PROPOSAL: one owner per formula).
- `hp` of the hero may be below `hp_max`: the world carries HP between fights (§4.2).
- Validation (`SetupError`): every unit on a region cell, no two units on one cell, no unit on a Roc
  or Gouffre, Weight in 1..=5 (FINAL range, §6.4), at most one hero per player entity, every
  ability id resolves, every entity has a camp, at most 4 player entities (FINAL, #313 choice 2),
  rout threshold present unless the format is battle royale.

### 5.2 Placement (§6.1)

- Phase `Placement`. Each player entity sends one `Place` action: a formation id (Ligne, Coin,
  Flèche: 3, TUNE) and an optional swap of the hero with one Fragment. The formation's cells are data
  from `world-programmer` (subsets of the standard placement, §6.1); this layer checks the swap
  target is an own Fragment and applies it.
- Monster entities are placed by the setup. When every player entity has placed (or the client
  timer fired and sent a default `Place`: 20 s in PvP, TUNE, `client-programmer`), the phase becomes
  `Turn` and `T(first, 1)` starts.
- Pionnier (§9, keystone): two terrain changes on the own half during placement. Encoded as
  `Place { .., terrain: [(cell, kind); <=2] }` in R3 (PROPOSAL).

### 5.3 Initiative (§6.1, §4.4)

- PvE: `first_camp` from the setup: the engaging camp plays first; an ambush makes the pack camp
  first (§4.4). This layer only reads the field.
- PvP: highest hero VIT first; tie broken by the combat seed: `seed_bit = seed & 1` picks the lower
  or higher seat (PROPOSAL; the seed comes from commit-reveal, `network-programmer`).
- The frieze is built once (section 6) and never re-sorted when VIT changes in combat (PROPOSAL).

### 5.4 End of combat (§6.1, §6.12, §4.2)

`Outcome` gives, per entity: `Won`, `Lost`, `Fled`, `Retreated` (skirmish draw), plus the hero's HP
at the end, the list of Losses inflicted and suffered (unit kind, monster id, cause), turns played,
and `durability_events` (`Flee` 5 %, `Defeat` 10 %, TUNE, §6.7, §6.12; applied by
`items-designer`). XP, loot, resets of cooldowns and resources, and the return of lost Fragments are
the world's job: a new combat always starts from a fresh `CombatSetup` (PROPOSAL; "resources reset
to zero" in §6.1 means "reset to the class start value", see Feedback F21).

### 5.5 Resume after reload (§6.12)

- The save is `{ "v": 1, "setup": CombatSetup, "actions": [Action...], "hash": "hex" }`, written
  after each action in the IndexedDB store `combat` (`client-programmer`, same model as
  `savegame.ts`). Resume = `replay`; a replay error or a hash mismatch deletes the save, like
  `savegame.ts` (FINAL there for local games, PROPOSAL here).
- Boss retry in under 5 s (§1 pillar 3, TUNE): `new_combat` from the same setup and seed. Budget for
  this layer: under 50 ms for a 14 vs 14 setup in wasm (TUNE).

### 5.6 Dependencies, tests, risks

- **Dependencies.** `world-programmer` (region, terrain, formations, setup), `encounter-boss-designer`
  (pack setups, `first_camp` on ambush), `progression-designer` (final stats, Fragments),
  `client-programmer` (placement timer, IndexedDB), `network-programmer` (seed).
- **Tests.**
  - Given a setup with two units on `(0,0)`, When `new_combat`, Then `SetupError::CellTaken((0,0))`.
  - Given a hero at 70/120 HP from the world, When the combat starts, Then the view shows `hp=70`.
  - Given placement with a swap of the hero `#1` and Fragment `#3`, When `Place`, Then their cells
    are exchanged and `Effect::Moved { how: Placement }` lists both.
  - Given PvP heroes with VIT 13 and 13 and seed bit 1, When the frieze is built, Then the seat with
    the higher index plays first; with bit 0, the lower.
  - Given a recorded log of 40 actions, When the page reloads (unit: `replay`), Then the hash equals
    the live one. E2E (R4, `client-programmer`): reload mid-fight, the board shows the same HP and
    turn.
- **Risks.** A save written mid-turn while a Preparation fires during another entity's turn: the log
  holds only player actions, triggered effects are recomputed, so replay is exact by construction.

---

## 6. Turn order: solo, group, frieze (§6.2)

- **Solo:** two entities, strict alternation (FINAL, rules.md section 7 and §6.2).
- **Group:** one pack per player (§6.2). Frieze (PROPOSAL, completes §6.2):
  1. Sort each camp's entities by VIT of their hero or leader, descending; tie by `EntityId`
     ascending (Feedback F16: no tie rule outside PvP).
  2. Interleave camps starting with the first camp: A1, B1, A2, B2, … If a camp has more entities,
     its extra ones go at the end in their order.
  3. An entity that left the board is skipped; the frieze never changes otherwise.
- **Allied units** (another entity, same camp) block a push like own units and never push with you
  (§6.2). This is a rule of the push run: the run is the contiguous units of **opposing** camps; an
  allied unit right after the run makes the push illegal (`engine-programmer` implements it with a
  `camp_of(unit)` callback; this layer passes it).
- **Battle royale and multi-camp:** a run may mix units of several opposing camps (PROPOSAL, rules.md
  §10.4 says sumito applies "against any opponent"; Feedback F31).
- Each entity owns its resources, cooldowns and durations; they move on its own turns only (§6.2,
  FINAL there as written).

**Dependencies.** `engine-programmer` (run built from a camp callback), `network-programmer` (same
frieze on every peer: it is part of the state hash), `ux-designer` (frieze display).

**Tests.**
- Given camps A (heroes VIT 12, 15) and B (leaders VIT 11, 11, ids 3 and 2), first camp A, When the
  frieze is built, Then it is `A(15), B(id 2), A(12), B(id 3)`.
- Given the frieze A1, B1, A2, B2 and A2 left the board, When B1 ends its turn, Then B2 is active.
- Given an allied unit of another entity right behind a 1-unit enemy run, When a 2-unit push is
  tried, Then `refused Move(PushBlocked)`.

**Risks.** Group fights with 8 entities: a round is 8 turns; durations and anti-stall counters must
be read per entity or per round with care (sections 7.5 and 11.6).

---

## 7. Structure of a turn (§6.3)

### 7.1 Phases

```text
start_turn(E):
  0. snapshot (R9 only, section 17.7)
  1. resource gain (section 16.1)
  2. cooldowns: nothing to do, ready_at is absolute (7.4)
  3. start-of-turn effects, in this order (PROPOSAL):
     a. tells that fire "at the start of E's turn" (Météore, Mine temporelle, Séisme), in placing order
     b. damage over time on E's units (Bleed, Poison, Burn), units in id order
     c. terrain: Quicksand (root, then suck), Vent countdowns owned by E, Revenant decay is at end
     d. channels of E's units that complete now (Flee)
  4. slots open: Move, Action, Quick; bonus Step closed unless a source opens it
action phase: any order, each slot at most once, Move mandatory if a legal one exists
end_turn(E):
  1. end-of-turn terrain on E's units: Lava, Sanctuary, Corruption (cells in fixed order)
  2. other end-of-turn effects: Revenant decay, "turn without push" resource decay
  3. statuses carried by E's units tick (7.5); terrain created by E ticks (16.2)
  4. victory and anti-stall check (section 11)
  5. advance the frieze; a new round starts when the frieze wraps
```

Every step runs elementary effects through the atomic loop (7.7). A step that ends the combat
stops the rest.

### 7.2 Slots

`Slots { moved: bool, action: bool, quick: bool, step: StepSlot }` with `StepSlot = Closed | Open |
Used`. Each slot is used once (§6.3, FINAL as written). An ultimate uses the Action slot (§6.3); a
Preparation, a consumable and a Quick ability use the Quick slot (§6.3). Pacte de sang uses the
Quick slot (§8.6, "Rapide, once per turn").

### 7.3 Mandatory Mouvement (§6.3)

- `EndTurn` is refused with `MustMoveFirst` while `moved == false` and `legal_moves(state)` is not
  empty (zugzwang kept, §6.3).
- If no legal Mouvement exists, `EndTurn` is accepted and `Effect::TurnEnded` carries
  `passed_move: true`.
- `Flee` replaces the Mouvement: it sets `moved = true` (§6.7).
- An Action can change what is legal: the check is done when `EndTurn` is sent, on the current
  state (PROPOSAL).

### 7.4 Cooldowns as absolute turns (§6.3 "Recharge N")

§6.3 says "unavailable for your N next turns" and also "cooldowns go down by 1 at turn start". Read
literally together, a cooldown set to N at cast and decremented at the next turn start is
unavailable for only N - 1 turns (Feedback F1). Implementation that keeps the stated meaning:

- At cast during `T(E, t)`: `ready_at[a] = t + N' + 1` where `N'` is N after Haste (below).
- Usable during `T(E, t)` iff `t >= ready_at[a]`. CD 0 gives `t + 1`: usable every turn, once per
  turn by the slot rule.
- Displayed remaining turns = `max(0, ready_at - (current own turn))`, computed in `view`.
- Haste (stat, §7.1): `N' = N - min(2, haste / 25)` if `N >= 3` and the ability is not an ultimate,
  floored at 1; otherwise `N' = N` (25, 2, 3, 1 are TUNE in §7.1).
- "+1 turn to cooldowns" (Lenteur, §8.7): `ready_at += 1` for every ability with `ready_at > t`
  (PROPOSAL: only abilities already on cooldown, Feedback F27).
- Sablier (§8.7): the non-ultimate ability with the smallest `ready_at - t > 0` gets `ready_at -= 1`;
  tie by slot order (PROPOSAL).
- Arrêt du temps on a non-boss (§8.7): during the frozen turn, `ready_at += 1` for all abilities on
  cooldown at its end (no decrease); against a boss, `ready_at += 2` once (§8.7).
- Chasseur ultime (§9): `-1` on the ultimate's N at cast (rune, not Haste: no conflict with the
  Haste rule).

### 7.5 Status durations (§6.3 "Durées")

- A status "N turns" lasts until the end of the N-th turn of the entity that **carries** it (§6.3).
- Each `StatusInst` has `turns_left: u8` and `fresh: bool`. `fresh` is set when the status is applied
  while its carrier's entity is the active one. At the carrier's end of turn: if `fresh`, clear it;
  else `turns_left -= 1`; at 0 the status ends (`StatusEnded`).
- This answers a gap of §6.3: without `fresh`, a 1-turn status put on an own unit (Glyphe de pierre,
  Peau de fer) or on the active entity by a Preparation would end at once (Feedback F2).
- Durations written "until your next turn" (Ancrage, Insaisissable, §8.1, §8.3) are a separate kind,
  `UntilTurnStart(caster_entity)`: removed at step 0 of the caster entity's next turn (PROPOSAL).
- Arrêt du temps: the frozen turn skips step 3 of `end_turn` for that entity (§8.7).

### 7.6 Steps and the bonus Step (§6.3, §6.0)

- A Step moves one own unit one cell; it never pushes, never leaves the region, never enters a Roc,
  an occupied cell or a Gouffre (§6.0, FINAL as written).
- `Action::Step` is legal only if `slots.step == Open` (a source opened it this turn). It sets
  `Used`. A second source in the same turn does nothing: at most one bonus Step per turn from all
  sources (§6.3). An ability whose only effect is a bonus Step (Hâte, §8.7) is refused when the slot
  is already `Open` or `Used` (PROPOSAL, avoids a wasted cast).
- A slot opened in a turn closes at the end of that turn (PROPOSAL).
- Rooted, Stunned, Frozen, Stase, Unmovable and Insaisissable units cannot Step (§6.11). Exception:
  a unit Rooted **by Quicksand** may leave the Quicksand cell with a Step or with a one-unit
  Mouvement that does not push (§5.1 "it can always leave with a Step"; the Mouvement part is a
  PROPOSAL, Feedback F7).
- A Step onto Ice slides (§5.1 "moves by itself"), and the slide stops on the last region cell: a
  Step never ejects (PROPOSAL, follows "never off the board").
- Self-moves by an ability (Charge, Clignement, Pas de l'ombre, Danse des lames) are not Steps, never
  push, never leave the region (§6.3). Teleports and swaps never slide on Ice; a walking self-move
  (Charge) slides on Ice and stops on the last cell (PROPOSAL, Feedback F18).

### 7.7 Atomic resolution (§6.3 "Résolution atomique")

```text
resolve(queue of elementary effects):
  while let Some(e) = queue.pop_front():
     apply e, push its Effect
     if a unit reached 0 HP: remove it now (section 10.1), push Died and Loss, queue its death triggers
     if a hero died or was ejected, or a rout threshold is reached: run victory (section 11);
        if the combat is over: drop the rest of the queue, push CombatEnded, return
     queue triggered effects (Preparations, reactions, passives) after the current effect's siblings
```

- 1 vs 1 tie (§6.3): when **one** elementary effect kills or ejects both heroes (only possible with
  a split, like Lien vital, or a terrain event hitting two cells at once), the active entity's camp
  loses (§6.3, FINAL as written there). Multi-target abilities resolve one target at a time
  (section 12.6), so the first hero to die ends the combat (Feedback F5).
- Trigger depth: a triggered effect may trigger others, at most 3 levels deep in one action
  (PROPOSAL, TUNE; Feedback F13). Preparations never trigger from a Preparation (§6.3).

### 7.8 Dependencies, tests, risks

- **Dependencies.** `game-designer` (sign-off on F1, F2, F7, F13), `ux-designer` (slot display, end
  turn key), `ai-programmer` (turn plans), `class-designer` (abilities that open a Step).
- **Tests (unit, `turn.rs`, `apply.rs`, scenario files).**
  - Cooldown. Given Fendoir (CD 1) cast in `T(P, 3)`, When P's turns 4 and 5 start, Then in
    turn 4 `cast warrior.cleaver` is `refused OnCooldown` and in turn 5 it is legal.
  - CD 0. Given Rayon de soin (CD 0) cast in `T(P, 3)`, Then a second cast in turn 3 is
    `refused SlotSpent` and a cast in turn 4 is legal.
  - Haste. Given Mur de boucliers (CD 4) and Haste 50, When cast in turn 2, Then `ready_at = 5`
    (N' = 2). Given Haste 75, Then still `ready_at = 5` (cap 2).
  - Duration. Given P freezes enemy unit `#7` ("Gelé 1 turn") during `T(P, 2)`, When E plays
    `T(E, 2)`, Then `#7` cannot be in a Mouvement group and is not an ability source; When E's turn
    ends, Then `StatusEnded { #7, frozen }` (§6.3 "a 1-turn Frozen costs a turn").
  - Fresh. Given P casts Glyphe de pierre (2 turns) on its own Fragment in `T(P, 4)`, Then the status
    is still there in `T(P, 5)` and `T(P, 6)` and ends at the end of `T(P, 6)`.
  - Mandatory move. Given P has a legal Mouvement and has not moved, When `end`, Then
    `refused MustMoveFirst`. Given every P unit Stunned, When `end`, Then accepted with
    `passed_move: true`.
  - Free order. Given P, When `cast warrior.cleaver @(1,0)`, then `move ...`, then
    `cast warrior.breach`, then `end`, Then all four are accepted.
  - Bonus Step cap. Given Jeu de jambes opened the Step and the Chronomancer's ally casts Hâte on
    the same entity, Then Hâte is `refused StepCapReached`.
  - Atomic. Given P's Tourbillon hits three adjacent enemy units, the second one being the enemy
    hero with 5 HP, When cast, Then the third unit takes no damage and `CombatEnded` follows the
    second `Damaged` and `Died`.
- **Risks.** The free order plus the mandatory Mouvement plus Preparations firing in the opponent's
  turn make the AI tree large (`ai-programmer`). The `fresh` flag must be in the hash.

---

## 8. Mouvement and the weighted push, as seen from the combat (§6.4, §4.6, §5.1)

### 8.1 What `abalone-core` does (engine-programmer) and what this layer does

| Concern | Owner |
|---|---|
| Group shape (1 to 3 on one axis; 4 with Avalanche), inline and broadside, the run, the cell after the run, Rocs and Unmovable units blocking, off-region ejection, Ice slide order and the one-ejection stop, Mud forbidding broadside, multi-tile seams | `engine-programmer` |
| The Weight of each unit, the push bonuses, which units may be selected, the push modifiers of abilities, the Choc after the push, the Loss and credit of an ejection, Unejectable and Instant suspendu | `gameplay-programmer` |

### 8.2 Weight of a unit

```text
weight(u) = clamp(u.weight_base + Σ status deltas (Alourdi/Allégé ±1 or ±2, Cri de guerre -1,
                  Glyphe +1, Peau de fer +1, Décrépitude -1, Bris -1, Croc-en-jambe -2,
                  Lest liquide +1, Bourreau du bord +1 per ejection max +2)
                  + terrain (Mud +1), 1, 5)
weight(u) = 5 if Titan is active (override, §8.2)
resist_weight(u) = weight(u) + 2 if Roc inébranlable (keystone, §9), not clamped
```

- Clamp 1..5 (FINAL range in §6.4, §6.11).
- `resist_weight` is used only when `u` is in the run being pushed (§9 "to resist, not to push").
  Not clamping it is a PROPOSAL (Feedback F15).
- All numbers above are TUNE in their source sections.

### 8.3 Push bonuses (group side)

`push_weight = Σ weight(group) + slope + Bélier + Avalanche`, with:

- Slope (§5.1): +1 if the cell of the group's **front unit** has a Slope pointing along the push
  direction, -1 if it points against it, 0 otherwise; the total never drops below 1 (§5.1 "minimum
  1"). Which cell counts is not in §5.1 (Feedback F14): the front unit's cell is a PROPOSAL.
- Bélier (§8.1): +2 if the hero is in the group, for the next push of this turn (TUNE).
- Percée (§8.2): the push is legal with `n = m` while the Weight stays strictly greater. Passed to the
  core as `PushRules { allow_equal_count: true }` (one push only).
- Avalanche (§8.2): `PushRules { max_group: 4, inline_only: true, max_run: 3, shock_bp: 20000 }` for
  this turn's Mouvement.
- Écrasement (§8.2): an ability, not a Mouvement: section 17.2.

### 8.4 After the push

1. The core returns `PushOutcome { moved: [(UnitId, from, to)], slid: [(UnitId, path)],
   ejected: Option<UnitId>, run: [UnitId] }`.
2. This layer turns an ejection into a Loss (section 10.2), unless the unit is Unejectable (the core
   already refused that push, 8.5) or Instant suspendu catches it (section 10.2).
3. Choc (section 9.2) on the run units still on the board, first unit 100 %, the others 50 % (TUNE).
4. Resource events: Rage +15 per successful push (TUNE), Guardian's Rempart +10 per allied unit
   pushed (TUNE), keystone counters (Tempo mortel).
5. Channels of moved units break (section 12.8). Preparations watching moves fire (Déjà-vu, at end
   of the opposing turn).

### 8.5 The core API this layer needs (contract handed to `engine-programmer`)

```rust
pub struct PushRules { pub max_group: u8, pub allow_equal_count: bool, pub max_run: u8, pub inline_only: bool }
pub trait PushWorld {
    fn region(&self) -> &Region;
    fn occupant(&self, c: Axial) -> Option<UnitId>;
    fn camp(&self, u: UnitId) -> CampId;
    fn selectable(&self, u: UnitId) -> bool;        // not Stunned, Frozen, Stase, Unmovable, Insaisissable, Rooted
    fn push_weight(&self, group: &[UnitId], dir: Direction) -> u8;
    fn resist_weight(&self, run: &[UnitId]) -> u8;
    fn unmovable(&self, u: UnitId) -> bool;          // blocks like a Roc (§6.11)
    fn unejectable(&self, u: UnitId) -> bool;        // a push that would eject it is illegal (§6.11)
    fn can_lead(&self, u: UnitId) -> bool;           // false when Blinded (§6.11)
    fn terrain(&self, c: Axial) -> TerrainKind;      // Roc, Gouffre, Ice, Mud, Slope(dir), ...
}
pub fn legal_moves(w: &impl PushWorld, mover_camp: CampId, units: &[UnitId], rules: PushRules) -> Vec<Move>;
pub fn resolve_move(w: &impl PushWorld, mover_camp: CampId, mv: &Move, rules: PushRules) -> Result<PushOutcome, MoveError>;
```

Invariant (FINAL proposed, §6.4, §1 pillar 1): with every Weight 1, no terrain, `PushRules` default,
`legal_moves` and `resolve_move` equal the classic `moves::legal_moves` and `moves::apply`. The core
test is `engine-programmer`'s; this layer adds the combat-level twin (8.6).

### 8.6 Tests

- All six examples of §6.4 as scenario files (Warrior alone vs Fragment illegal; Warrior + Fragment
  vs Guardian legal 2 > 1 and 4 > 3; two Fragments vs Guardian illegal; three vs two Fragments legal;
  three Fragments vs a Warrior on Mud illegal, 3 vs 4; Percée Warrior + Fragment vs two Fragments
  legal at 2 vs 2, Weight 4 vs 2).
- Combat-level equivalence (R1 exit criterion, §25): Given a setup with 14 vs 14 units on the
  standard layout, every Weight 1, HP 1 000 000, ATQ 0, no ability, rout at 6, When 200 seeded random
  games of 120 plies (TUNE) are played through `apply_action` (Move then EndTurn) and through
  `Game::play`, Then after every ply the occupied cells by camp and the ejection counts are equal.
  (HP is huge so the Choc floor of 1 damage never kills, section 9.1.)
- Slope. Given a single Fragment pushing nothing, When it moves, Then no slope effect. Given a
  2-unit group whose front unit stands on Slope E pushing E against one unit of Weight 2, Then
  `push_weight = 3 > 2`, legal. Against a Slope pointing W: `push_weight = max(1, 1) = 1`, illegal.
- Roc inébranlable. Given an enemy hero Weight 3 with the keystone, When three Fragments push it,
  Then `refused Move(NotStrongEnough)` (3 vs 5).
- Choc after ejection. Given a run of 2 at the rim pushed by 3, When the push ejects the last unit,
  Then only the first unit gets a Choc at 100 %.

### 8.7 Risks

- Weight changes mid-turn (Cri de guerre then Mouvement) change `legal_moves`: the AI and the Edge
  danger alert must recompute after each action.
- The Avalanche 4-unit group is the only change to group size (FINAL rules.md: 1 to 3). It needs a
  `rules.md` delta in R0 (Feedback F24).

---

## 9. Damage and healing (§6.5, §7.1)

### 9.1 Integer damage formula (§6.5, §24.1)

§6.5: `Damage = max(1, floor((Base + Ratio × Stat) × K / (K + Defense) × (1 + Σbonus)))`,
`K = 100 × g(attacker level)`, `g(L) = 1 + 0.09 × (L - 1)` (TUNE). In integers (PROPOSAL, fixed
order):

```text
g_bp(L)  = 10000 + 900 × (L - 1)                        // g in basis points; 900 is TUNE (0.09)
raw      = Base + floor(Ratio_bp × Stat / 10000)          // first floor
// K / (K + Def) = (g_bp / 100) / (g_bp / 100 + Def) = g_bp / (g_bp + 100 × Def)
num      = raw × g_bp × (10000 + Σbonus_bp)               // i64
den      = (g_bp + 100 × Def) × 10000                     // i64, Def after penetration, >= 0
damage   = max(1, floor(num / den))                       // second and last floor
Pure     : Def = 0 and the K factor is 1: damage = max(1, floor(raw × (10000 + Σbonus_bp) / 10000))
```

- `i64` bounds: `raw` under 10^5, `g_bp` under 10^5, `10000 + Σ` under 10^5 for every sum this file
  allows, so `num` stays under 10^15 (safe in `i64`).
- A negative factor (`Σbonus_bp <= -10000`) gives `max(1, …) = 1`: damage is never 0 or negative
  (§6.5, as written).
- Penetration (§9 rune shards, Impact soudain): subtracts flat Defense first, floor 0 (PROPOSAL).
- All bonuses of §6.5, §5.1, §8, §9 enter `Σbonus_bp` **additively** (PROPOSAL). Texts written as a
  multiplier ("×1.5" for Bris, "Choc doubled" for Avalanche, "+100 %" for Titan) become `+5000`,
  `+10000`, `+10000` bp. Feedback F6 lists the cases where the additive reading differs from a
  product.

`Σbonus_bp` terms (all TUNE in their source):

| Term | bp | Source |
|---|---|---|
| Isolation: the target has no adjacent unit of its own camp | +2500 | §6.5 |
| Formation: per adjacent unit of the target's camp, max 3 | -1000 each, min -3000 | §6.5 |
| Level gap: (attacker level - target level) × 500, clamp ±2500; 0 when `rules.pvp` | ±500 per level | §6.5 |
| Marked | +X | §6.11 |
| Thicket: target on Fourré and the ability's origin at distance >= 2 | -5000 | §5.1 |
| Height: ability cast from a Hauteur cell | +2000 | §5.1 |
| Élan: Warrior hero leads the push (Choc only) | +5000 | §8.2 |
| Avalanche (Choc) / Titan (Choc on units it pushes) | +10000 | §8.2 |
| Opportuniste (Assassin, isolated target) | +3000 | §8.3 |
| Weather, night, biome (Burn +50 %, lightning +25 %, fire -25 %) | as listed | §4.8, §5.2 |
| Ability-specific conditions (Fendoir isolated +50 %, Lance de glace on Frozen +50 %) | as listed | §8 |
| Passives (keystones, runes, Aspects, affixes) | data | §9, §12, §5.3 |

Worked example (also a scenario file): Warrior hero (level 1, ATQ 12) leads a 2-unit push; the first
unit of the run is a Brute (level 1, ARM 14) that has no ally next to it after the push. Choc =
100 % ATQ (`raw = 12`), `Σ = +5000 (Élan) + 2500 (Isolation) = 7500`,
`num = 12 × 10000 × 17500 = 2 100 000 000`, `den = (10000 + 1400) × 10000 = 114 000 000`,
damage = floor(18.42) = **18**.

### 9.2 Choc (§6.5)

- After the displacement of a push, the first run unit still on the board takes physical damage
  with `Ratio 10000 bp of the group's lead unit ATQ`; every other run unit still on the board takes
  `5000 bp` (100 % and 50 %, TUNE). The lead unit is the front unit of the group in the push
  direction.
- An ejected unit takes no Choc; a broadside move never Chocs (§6.5, as written).
- Water: the Choc **received** is halved: `Σbonus -5000` (§5.1; additive reading, Feedback F6).
- Source of the Choc for credit and triggers: the mover entity, kind `Choc` (section 10.4).
- Choc from an ability (Charge "Choc of 100 % ATQ without push", edge Choc of section 12.4): same
  formula, `Ratio` from the ability data, lead unit = the caster.

### 9.3 Healing formula (PROPOSAL, §6.5 gives none)

```text
raw   = Base + floor(Ratio_bp × Stat / 10000)                 // Stat = PUI of the healer, or % of target max HP
heal  = floor(raw × (10000 + Σheal_bp) × (10000 - attrition_bp) × poison_bp / 10^12)
        // poison_bp = 5000 if the target is Poisoned, else 10000 (§6.11); attrition from 11.6
over  = max(0, hp + heal - hp_max)                             // overheal
```

Overheal becomes a shield only with a source that says so (Lumière accumulée, cap 10 % of max HP,
§8.4; Surplus de soins rune, §9). Lifesteal and Siphon heal through the same formula with
`raw = floor(rate_bp × dealt / 10000)` (PROPOSAL: Attrition and Poison reduce them too).

### 9.4 Damage pipeline (PROPOSAL: §6.5 gives the pieces, not their order; Feedback F8)

For one elementary damage effect from source `S` on target `T`:

1. **Targeting checks** (before anything): Stase targets are refused at cast; Insaisissable dodges
   the first single-target ability on it (the status is consumed, `StatusEnded`); Provocation is a
   legality rule at cast (12.2).
2. **Redirect before computing:** an armed Interposition on `T` retargets a single-target ability
   to the Guardian hero (§8.1). The new target's Defense and modifiers are used.
3. **Compute** the amount with 9.1 on the final target.
4. **Lien vital** (§8.4): if `T` is linked, split `floor(amount / 2)` to `T` and the rest to the
   partner; each half continues at step 5 on its unit; a split is never split again.
5. **Martyr** (§8.4): if `T` is an ally of an active Martyr, the amount becomes
   `floor(amount × 5000 / 10000)` and moves to the Martyr hero (50 %, TUNE).
6. **Shields** absorb: instances in `shields` ordered by soonest expiry, then oldest first.
7. **Guard** (§6.5): if `T` is a hero, its HP loss from the current **action** is capped at
   `floor(3500 × hp_max / 10000)` (35 %, TUNE) across all elementary effects of that action. The
   cap counts HP lost, after shields (PROPOSAL: "after reductions"). Damage-over-time ticks and
   terrain ticks are each their own action (PROPOSAL). Feedback F8 asks whether Choc and
   Mouvements count; this file applies the Guard to every action, Mouvement included.
8. **Mana shield** (§8.5): the remaining HP loss is paid in mana at 2 HP for 1 mana (TUNE),
   `ceil(loss / 2)` mana; what the mana cannot pay hits HP.
9. **HP loss**, then the atomic check (7.7).
10. **After-effects**, in this order: lifesteal and Siphon for `S` (on `dealt = shield absorbed +
    mana paid + HP lost`, PROPOSAL); Retour de souffrance (§8.6): if `S` is cursed, `S` takes
    `floor(dealt × 5000 / 10000)` Pure damage that triggers nothing (TUNE 50 %); resource events
    (Rempart +10 per allied unit damaged; Rage +10 when the Warrior hero loses >= 10 % of max HP in
    one elementary effect; TUNE); passives (`on_damage_taken`, `on_damage_dealt`, Grâce under 25 %
    once per unit, Conquérant stacks, Vampirique affix); Mage reactions (17.5).

### 9.5 Dependencies

`progression-designer` (`g(L)` and stat values; the formula code is here so the order is fixed in
one place), `class-designer` (ratios), `game-designer` (pipeline order sign-off, F6, F8),
`ux-designer` (`guard_capped` in previews).

### 9.6 Tests

- Formula table test: 20 hand-computed rows (levels 1, 50, 100; Def 0, 20, 500; Σ -9000, 0,
  +12000) with the expected integer, including the worked example (18) and the floor of 1.
- Property: for every level 1..=100 and Def = 100 × (g_bp / 10000) (that is Def = K), the reduction
  factor is exactly one half, within one point of floor (the "same reduction from level 1 to 100"
  promise of §6.5).
- Guard. Given a hero with 120 max HP and no shield, When one ability deals 60, Then HP loss = 42
  and `guard_capped: true`. Given a test ability with two Damage effects of 30 each on the same
  hero, Then the total HP loss of the action is still 42.
- Guard and shield. Given a hero 120 HP with a 20 shield, When an ability deals 70, Then the shield
  absorbs 20, HP loss = 42 (cap), the remaining 8 is lost (`absorbed=20`).
- Lien vital. Given two linked allies, When one takes 31, Then it loses 15 and its partner 16.
- Mana shield. Given a Mage with 9 mana under Bouclier de mana, When it would lose 22 HP, Then mana
  goes to 0 (9 paid = 18 HP) and HP drops by 4.
- Heal with Poison and Attrition 30 %: Given raw 100, Then heal = floor(100 × 7000 × 5000 / 10^8) =
  35.
- Water halves Choc: Given the worked example with the Brute on Eau, Then `Σ = 2500` and damage =
  floor(12 × 10000 × 12500 / 114 000 000) = 13.

### 9.7 Risks

The additive stacking can make a big pile of bonuses dominate (Assassin: Opportuniste + Isolation +
Marked + Fendoir conditions). `qa-engineer` and the bot ladder watch the damage distribution; the
formula stays, the numbers move (TUNE).

---

## 10. Death, ejection, the hero, the Graveyard, Revenants, Edge danger (§6.6)

### 10.1 Death at 0 HP (§6.6)

- At 0 HP the unit is removed at once: `cell = None`, `Died { corpse: true }` (the 400 ms crumble is
  the renderer's, §6.6).
- A Corpse (`Dépouille`) stays on the cell and blocks nothing (§6.6). **One Corpse per cell**: a new
  Corpse replaces the older one on the same cell; the older entry stays in the Graveyard
  (PROPOSAL, Feedback F22).
- A Revenant or a summon leaves no Corpse (§6.6).
- Vitrified Lands (§5.2): the dead unit's cell becomes Corruption (terrain effect, source = biome).
- Explosive archetype (§5.3): on death at 0 HP (not on ejection, PROPOSAL), queue a knockback of 1
  cell on each neighbour, no ejection (a non-Éjecteur displacement, 12.4).

### 10.2 Ejection (§6.6, FINAL: an ejected unit dies; an ejected hero dies)

- An ejected unit is removed at once whatever its HP (FINAL, #313 choice 3). `Ejected`, then
  `Loss { cause: Ejection }`, no Corpse.
- An ejected or 0-HP hero ends its entity at once (FINAL, #313 choice 3): `EntityLeft { HeroDead }`.
- **Unejectable** (§6.11): a Mouvement that would eject it is illegal (core, 8.5); an ability or
  terrain effect that would eject it stops it on the last region cell (PROPOSAL, Feedback F11). A
  cell that becomes a Gouffre under an Unejectable unit (Breach, Tide, Séisme, Effondrement, Pont
  expiry, Quicksand suction) moves the unit to the nearest free non-hazard region cell, ties by
  fixed cell order (PROPOSAL, F11).
- **Résilient** boss Heart (§18): instead of the ejection, loses 25 % of max HP (TUNE) and goes to
  the centre cell, or the nearest free cell to it in fixed order; no Loss (PROPOSAL; data from
  `encounter-boss-designer`).
- **Instant suspendu** (Chronomancer trait, §8.7): once per combat (FINAL as written), the first time
  a unit of the Chronomancer's entity would be ejected, the ejection fails: for a Mouvement, the
  whole push resolves as blocked (nothing moves, the slot is spent, no Choc); for an ability or
  terrain, the unit stays on its cell. The unit gets Stase 1 turn on its cell. Automatic, no choice
  (§6.3 spirit of automatic reactions; Feedback F23 suggests a hero-only option).

### 10.3 Losses, Graveyard, credit (§6.6, §6.7)

- **Loss**: a death or an ejection of a unit of an entity (§6.6), except Revenants (§6.6) and summons
  (PROPOSAL, Feedback F22). Units removed by a rout, by a hero's death or by a leader's death are not
  Losses and leave no Corpse (PROPOSAL, F22).
- **Graveyard** entry: `{ unit, entity, camp, kind, base stats, weight_base, cause, round, turn,
  raised: bool, cell_at_loss }` (§6.6). Revenants are not entered (they cannot be raised again,
  §6.6).
- **Credit** (who inflicted the Loss; needed by Rage, Triomphe, Trophées, Bourreau du bord,
  Moisson noire, quests): PROPOSAL, Feedback F25:
  - Mouvement push or ejection: the mover entity.
  - Ability, consumable, Mark, Preparation: the caster entity.
  - Damage over time: the entity that applied it.
  - Terrain created by an ability (Pont, Effondrement, Séisme, Mur de flammes Lava): its creator.
  - Biome terrain, Breach, Tide, Rockfall: nobody (`credit: None`).
  - Ice slide after a push: the mover. Death by Ronces after a push: the mover.

### 10.4 Revenants (§6.6, §8.6), R9

- `Revive` primitive (12.3): the entry must have `raised == false` (once per entry, §6.6); sets it to
  `true`. The Revenant is a new unit (new id), `kind: Revenant`, entity = the Necromancer, Weight =
  original `weight_base`, `hp_max = floor(4000 × origin hp_max / 10000) + floor(2000 × hero PUI /
  10000)` (40 % and 20 %, TUNE), no abilities (a raised boss keeps one: the ability id comes with the
  entry, `encounter-boss-designer`).
- Decay: at the end of the Necromancer's turns, loses `floor(1000 × hp_max / 10000)` (10 %, TUNE)
  as Pure, untriggering damage (PROPOSAL: end of the owner's turn, Feedback F26).
- Cap: 3 Revenants at once (TUNE). A raise that would make 4 is refused at cast
  (`refused RevenantCap`, PROPOSAL F26). Armée des morts ignores the cap for 3 turns, then the extra
  Revenants crumble, newest first (PROPOSAL).
- A Revenant's removal: no Corpse, no Loss, no Essence, no Moisson, resets no counter (§6.6).
- Score rule: raising never gives the Loss back (§6.6).
- Heroes cannot be raised (PROPOSAL: a dead hero ends its entity, and a Revenant hero would carry its
  abilities; Feedback F26).

### 10.5 Edge danger (§6.6, R1)

Definition (from ux-designer A.1, implemented here): for each hero on the board,

- `Will`: a told terrain effect ejects it before its entity plays again and no own turn comes in
  between (Quicksand second start pending, a Vent at 1 pointing off, a Pont expiring, a Breach or
  Tide ring on its cell, a Séisme side).
- `Could`: some opposing entity `X` that plays before the hero's entity next turn (frieze order)
  has a threat action that ejects it.
- `None` otherwise.

Threat set by phase: **R1** every legal Mouvement of `X`; **R2** plus each affordable, ready push
modifier of `X` combined with one Mouvement (Percée, Bélier, Cri de guerre, Croc-en-jambe, Avalanche,
Titan), plus every ready, affordable Éjecteur ability on each legal target (PROPOSAL, ux-designer).

Algorithm (keeps it cheap):

1. Directions `d` for which the hero could leave the region: from the hero's cell, walking along `d`
   over cells that are Ice or hold units, the first free non-Ice cell is outside the region or a
   Gouffre (at most 3 run cells plus Ice).
2. For each such `d`, only `X`'s Mouvements whose push line contains the hero cell and goes along `d`
   are applied on a clone through `apply_action` (so Unejectable, Instant suspendu and the one
   ejection limit are honoured).
3. `edge_danger` returns `(hero, Danger, witness: Option<Action>)`; the witness feeds the inspect
   panel (ux-designer `edgeDangerWitness`).

Derived, not hashed; recomputed by `view` after every action (PROPOSAL).

### 10.6 Dependencies

`engine-programmer` (core push on clones, Gouffre cells), `ux-designer` (glyph, witness, tests A.4
1 to 6), `class-designer` (Instant suspendu, Revenant numbers), `encounter-boss-designer`
(Résilient, raised boss ability), `narrative-quest-designer` (`Loss` with `credit`).

### 10.7 Tests

- Hero ejected. Given a radius-3 board, P's Guardian hero `#1` (Weight 3) on the rim at `(3,0)`,
  E's Warrior hero `#5` (Weight 3) at `(1,0)` and E's Fragment `#6` (Weight 1) at `(2,0)`, E to move,
  When `move (1,0)(2,0)>E`, Then the push is legal (`2 > 1` and `4 > 3`), `#1` is ejected,
  `Loss { P, #1, Ejection, credit E }`, `EntityLeft { P, HeroDead }`, `CombatEnded` (E's camp
  wins), even though P's hero had full HP.
- Hero at 0 HP. Given P's hero with 3 HP isolated, When E's Fendoir hits for 3 or more, Then
  `Died`, `EntityLeft { HeroDead }`, and the combat ends even if P has 13 units left.
- Corpse. Given a Fragment dies at 0 HP on `(0,1)`, Then a Corpse is on `(0,1)` and a unit can move
  onto `(0,1)`; the Graveyard has one entry with `cause = Death`.
- One raise per entry (R9). Given an entry raised once and its Revenant destroyed, When Relever les
  morts targets the same entry, Then `refused BadTarget`.
- Revenant gives no Loss (R9). Given a Revenant ejected, Then no `Loss`, the Necromancer gains no
  Essence, the no-Loss counter is not reset.
- Instant suspendu (R9). Given the Chronomancer's Fragment at the rim and a legal 2 vs 1 push that
  ejects it, When played, Then nothing moves, no Choc, `StatusApplied { stase, 1 }`; the second time
  the same push ejects.
- Edge danger, the six cases of ux-designer A.4 (Guardian vs two Fragments `None`; vs three Fragments
  `None` (3 vs 3 Weight); vs Warrior + Fragment `Could`; Ice run `Could`; Quicksand second start
  `Will`; Forteresse `None`), plus: all Weights 1 and the classic start: `None` for every hero.
- Perf (wasm, `client-programmer` measures): `edge_danger` on a radius-4 board with 28 units under
  5 ms (TUNE).

### 10.8 Risks

"Hero ejected = death" makes the alert and the preview the main readability tools. A wrong `None`
is a design bug: the property test "for every legal Mouvement of the next opposing entity, if it
ejects the hero then `edge_danger` was `Could` or `Will`" runs on 1000 seeded positions (TUNE).

---

## 11. Victory, defeat, flight, anti-stalling (§6.7, §6.8)

### 11.1 Exits of an entity

| Exit | When | Units | Losses |
|---|---|---|---|
| `HeroDead` | its hero dies or is ejected (FINAL) | all removed, no Corpse | the hero's Loss only |
| `Routed` | `losses >= rout_at` (§6.7) | all removed, no Corpse | none for the removal |
| `LeaderDead` | a pack leader dies or is ejected (§6.7 "the rest flees") | all removed | the leader's Loss only |
| `Fled` | the flight channel completes (11.5) | all removed | none |
| `Eliminated` | battle royale: no unit left (§20) | — | — |

- Rout thresholds (§6.8, TUNE): skirmish 3, elite 4, dungeon room 5, boss / PvP / arena 6, battle
  royale none. Group: `ceil(4000 × units / 10000)` per entity (40 %, TUNE). They arrive in
  `CombatSetup.entities[].rout_at`; this layer computes the group value only when the setup says
  `"rout_at": "group"` (PROPOSAL).
- The camp check runs after every exit: a camp with no entity on the board has lost; when only one
  camp is left, the combat ends (§6.7).

### 11.2 Outcome per entity (PROPOSAL, Feedback F20)

- Camp left on the board: its entities still on the board get `Won`; its entities that left with
  `HeroDead` or `Routed` get `Lost` (in a group fight a player can lose while the group wins).
- `Fled` entities get `Fled`.
- Draw (11.6): `Retreated` in a skirmish, `Lost` for players against a boss (FINAL existing,
  rules.md §9 and §6.7), `Draw` in PvP.

### 11.3 1 vs 1 simultaneous death

See 7.7 (§6.3, FINAL as written there; definition of "same effect" PROPOSAL, F5).

### 11.4 Special objectives (§6.7), R6 and R8

`CombatRules.objective`: `Escort { npc: UnitId, exit: Vec<Axial> }` (the NPC on an exit cell at the
end of the escort entity's turn wins; its death or ejection loses), `Survive { rounds }`,
`Hold { cells, rounds }` (a camp holds a cell when one of its units stands on it at the end of a
round). Checked at end-of-turn step 4. Data from `encounter-boss-designer` and
`narrative-quest-designer`.

### 11.5 Flight (§6.7)

- `Flee` is legal when: the format is not boss, PvP or battle royale (§6.7); it is the start of the
  action phase (no slot used yet, PROPOSAL); the hero stands on a rim cell (a cell with a neighbour
  outside the region); no enemy unit is adjacent to the hero; the hero is not Stunned, Frozen or in
  Stase (PROPOSAL).
- It sets `moved = true` and starts `Channel { Flee }` on the hero (1 turn, TUNE).
- At step 3d of the entity's next turn start, if the channel is intact: `EntityLeft { Fled }`.
- The channel breaks when the hero's cell changes for any reason (push, pull, swap, teleport, slide,
  rewind) or the hero dies (§6.7, §6.10).
- Outcome: `Fled`, no reward, durability -5 % (TUNE, `items-designer`).

### 11.6 Anti-stalling (§6.7)

| Rule | Implementation | Numbers |
|---|---|---|
| Threefold repetition (§6.7) | Key = hash of the state **without** `round`, own turn counters, snapshots and anti-stall counters, with cooldowns as remaining turns instead of `ready_at`. Third occurrence: draw | 3 (FINAL, rules.md §9) |
| No-Loss draw (§6.7) | `counters.since_loss` counts entity turns since the last Loss; at the threshold: draw. The unit of the counter is data (`EntityTurns` or `Rounds`) so owners can switch (Feedback F9) | 60 entity turns (TUNE) |
| Attrition, Usure (§6.7) | Heals received by units of entity `E` during `T(E, t)` and later: `attrition_bp = min(8000, 1000 × (t - start + 1))` for `t >= start` | start 20, skirmish 12; 10 %, cap 80 % (TUNE) |
| Breach (§6.7, §18 enrage) | Counted in rounds (PROPOSAL, F10). At round `b`: ring 1 cracks (tell 2 rounds), void at the end of round `b + 2`; then a new ring every 5 rounds; stop before the region would drop under 19 cells per tile. Ring k = region cells at distance k from the nearest non-region cell (works on stitched masks) | start 30, skirmish 18; tell 2; every 5; 19 cells (TUNE) |

- Breach voiding ejects every unit on the ring (terrain with a tell of 2 or more may eject several,
  §6.10, FINAL proposed), `credit: None`; Unejectable units are moved inward (10.2).
- The boss enrage moves `b` earlier (data `breach_start`, `encounter-boss-designer`, §18).
- The HUD warning before the draw is `client-programmer`'s; the view exposes the counters
  (ux-designer `counters`).

### 11.7 Dependencies

`encounter-boss-designer` (thresholds, objectives, enrage), `world-programmer` (rim, region masks),
`items-designer` (durability), `ux-designer` (counters and warnings), `game-designer` (F9, F10, F20).

### 11.8 Tests

- Rout. Given a skirmish (P rout at 3) with P at 2 Losses, When a Fragment of P is ejected, Then
  `Loss`, then `EntityLeft { P, Routed }`, then all P units vanish with no Corpse, then
  `CombatEnded`.
- Leader. Given a pack whose leader `#9` has 4 HP, When P kills it, Then `Loss { pack, #9 }`,
  `EntityLeft { pack, LeaderDead }` and the other pack units vanish without Loss.
- Group outcome. Given a duo P1 + P2 vs two packs, When P2's hero dies and later both packs rout,
  Then P1 `Won`, P2 `Lost`.
- Flight. Given P's hero on the rim, no adjacent enemy, When `flee` then `end`, and E does not touch
  the hero, Then at P's next turn start `EntityLeft { P, Fled }`, outcome `Fled`. Given E pushes
  the hero one cell during its turn, Then `ChannelBroken` and P plays normally.
- Flight refused. Given an enemy adjacent to P's hero, When `flee`, Then `refused FleeBlocked`; in a
  boss format, `refused FleeForbidden`.
- No-Loss draw. Given the counter at 59, When an entity ends its turn with no Loss, Then the draw;
  at 58 the game goes on; a Loss resets it to 0 (mirrors rules.md examples 28 to 30).
- Attrition. Given a skirmish, `T(P, 12)`, When P's unit is healed 100, Then it gets 90; at
  `T(P, 19)` it gets 20 (cap 80 %).
- Breach. Given a radius-3 skirmish at the end of round 17, When round 18 starts, Then the rim
  (18 cells) gets `TellPlaced` firing at the end of round 20; at that moment every unit on it is
  ejected (several in one event) and the region has 19 cells; no further ring (19-cell floor).
- Repetition. Given a 1 vs 1 where both entities only shuffle single units back and forth, with no
  push, no ability and no resource change, When the same repetition key occurs a third time, Then
  `Draw(Repetition)`; at the second occurrence the combat goes on.

### 11.9 Risks

The no-Loss draw at 60 entity turns lands on the same turn as the Breach start in a 1 vs 1 boss or
PvP fight, and after 7.5 rounds in a full group (F9). Until an owner decides, the data default is
the gameplay spec's (60 entity turns), and the bot ladder reports how many fights end by this draw.

---

## 12. The ability language (§6.10)

### 12.1 Ability data (one JSON object per ability, PROPOSAL)

```json
{
  "id": "warrior.cleaver",
  "class": "warrior",
  "slot": "action",                       // action | quick | preparation | ultimate
  "cost": [{ "res": "rage", "amount": 25 }],
  "cooldown": 1,
  "once_per_combat": false,
  "range": 1,
  "origin": "hero",                       // hero | squad (any own unit, §6.9)
  "target": { "kind": "adjacent", "filter": "enemy" },
  "keywords": ["physical"],               // ejector, channel, squad, fire, frost, lightning, shadow, light, time
  "tell": 0,                              // turns before the effects fire; 0 = at once
  "effects": [
    { "op": "damage", "kind": "physical", "ratio_bp": 12000, "stat": "atk",
      "if": [{ "cond": "target_isolated", "bp": 5000 }] }
  ],
  "counterplay": "counter.warrior.cleaver",
  "ranks": { "r2": { "effects[0].ratio_bp": 15000 }, "r3a": {}, "r3b": {} }
}
```

- `ranks` patches are applied by `progression-designer`'s resolver before the combat (section 18);
  the combat only sees resolved abilities (PROPOSAL).
- Costs: a list (Assassinat costs Energy **and** 5 combo points, §8.3). `"amount": "all"` consumes
  every combo point (finishers, §8.3).
- Overheat (§8.5) is a cost modifier of the Mage entity (17.5), not a field.

### 12.2 Targeting (§6.10, §6.9, §5.1, §5.2)

| Kind | Pick | Rule |
|---|---|---|
| `self` | none | the origin unit |
| `adjacent` | 1 cell | at distance 1 from the origin |
| `target` | 1 cell or unit | hex distance <= range, no line of sight (§6.10) |
| `line` | 1 direction | from the origin along one of 6 directions (3 axes), stops at the first unit or obstacle (Roc), max range; a Crystal cell where it stops makes it go on once from the next cell (§5.1, PROPOSAL F29) |
| `zone` | 1 centre | radius r around a cell within range |
| `group` | 1 to 3 units | aligned, contiguous (rules.md section 3) |
| `board` | none | the whole region |
| `empty_cells` | n cells | free cells (Mur de boucliers: 3 aligned; Sables: 3 any) |
| `corpse` / `grave` | cell or entry | Relever les morts, Rappel du vide, Explosion de cadavre |

- **Origin**: the hero, except for abilities with the keyword `squad` (§6.9) and for monster
  abilities (each monster unit casts its own, PROPOSAL).
- **Range modifiers**: `+1` from Hauteur, `-1` in Sylve de Cendre, in the Puits darkness (except from
  a Sanctuary) and in a sandstorm (§5.1, §5.2, §4.8, TUNE); never below 1 for `target`, `line`,
  `zone` centres; `self` and `adjacent` are not affected (PROPOSAL, F30).
- **Filters**: `enemy`, `ally`, `any`, `own`, `hero`, `not_hero`, `fragment`, `revenant`, plus
  conditions (`hp_below_bp`, `isolated`, `on_rim`).
- **Untargetable**: Stase units (§6.11); allies inside a Fumigène zone for single-target abilities
  whose origin is at distance >= 2 (§8.3, PROPOSAL: single-target only).
- **Provocation** (§6.11): when the casting unit is provoked and the provoking unit is a legal target
  of a single-target ability, any other single target is refused (`refused MustTargetTaunter`).
- **Interposition**, **Insaisissable**: section 9.4.

### 12.3 The 12 primitives (§6.10)

Each primitive is one function `fn apply(ctx: &mut Ctx, p: &Params, target: Target) -> Vec<Effect>`
in `prim/<name>.rs`. Parameters below are the data fields (PROPOSAL); every class mechanic of §8 is
mapped in section 17.

| # | Primitive | Params | Notes |
|---|---|---|---|
| 1 | Damage | `kind` (physical, magic, pure), `base`, `ratio_bp`, `stat` (atk, pow, origin_hp_max, combo), `if[]`, `per_combo_bp` | 9.1 and 9.4; Écrasement uses target `blocked_push_line` (17.2) |
| 2 | Heal | `base`, `ratio_bp`, `stat`, `pct_max_hp_bp`, `to_snapshot` (Rembobiner), `cleanse` (Purification, Aube) | 9.3 |
| 3 | Shield | `ratio_bp`, `stat` or `pct_max_hp_bp`, `turns` | instances, 9.4 step 6 |
| 4 | Forced displacement | `mode` (push, pull, teleport, swap, slide, self_line, perpendicular, rewind, rotate), `distance`, `dir` (away, toward, outward, pick, axis), `ejector`, `stop_before_unit` | 12.4 |
| 5 | Stat change | `stat` (atk, pow, arm, res, vit, weight, range, dmg_taken_bp, push_weight_next), `delta` or `delta_bp`, `turns` | a status instance of kind `StatMod` |
| 6 | Status | `status`, `turns`, `magnitude`, `max_targets` | section 13 |
| 7 | Terrain | `set` (kind), `turns`, `cells` (target, line3, ring6, zone, empty_only), `op` (rotate, bridge, void_after) | section 16; creator recorded |
| 8 | Summon | `template`, `cell`, `turns` | R9 and v2 classes |
| 9 | Revive | `from` (corpse, grave_ejected, grave_any), `count`, `hp_pct_bp`, `pow_ratio_bp`, `cap_override_turns` | 10.4 |
| 10 | Mark | `fires` (caster_next_turn_start, end_of_next_opposing_turn, on_event), `effects[]`, `visible` | a `Tell` in the state |
| 11 | Resource | `res`, `gain`, `steal`, `refund` | section 16.1 |
| 12 | Turn | `bonus_step`, `restrict_next_turn` (move_only), `cooldown_shift`, `freeze_clock`, `push_rules` (Percée, Avalanche) | the own-Mouvement modifiers are a PROPOSAL (F28) |

### 12.4 Ejection limits (§6.10, FINAL: at most 1 ejection per action)

- `Ctx.ejections_left = 1` at the start of every action (FINAL, validated decision; extends rules.md
  §5).
- Exception: a terrain event whose tell was at least 2 turns (Breach, Tide, Séisme, Vent, a Pont
  that expires) gets `ejections_left = u8::MAX` (§6.10).
- A displacement **without** `ejector` never takes a unit out of the region, also through an Ice
  slide it starts (§6.10 rule 3). The unit stops on the last region cell and takes an **edge Choc**:
  physical, `5000 bp` of the caster's ATQ (PROPOSAL, TUNE; §6.10 names a Choc without a value,
  Feedback F17). A unit already on the last cell does not move and takes the edge Choc.
- A displacement with `ejector` may eject while `ejections_left > 0`. When several units would leave
  in one action, the caster chooses one in `Picks.units` at cast for an immediate ability (§6.10).
  For a delayed one (Météore at the caster's next turn start), the default is the first candidate in
  resolution order (PROPOSAL, F19). The others stop on the last cell with an edge Choc.
- Displacements never push other units: a destination cell held by a unit or a Roc means no move and
  no Choc (PROPOSAL, F17), except the Explosive and Halo de répulsion knockbacks which also follow
  this rule.
- **Order of a multi-unit knockback**: farthest from the origin first, then the fixed order, so that
  inner units can move into cells the outer ones vacate (PROPOSAL, F18; contradicts the
  nearest-first order of §6.10 for this case only).
- **"Away from the origin"** for a unit not on one of the 6 axes from the origin: the direction whose
  step maximises the hex distance to the origin; ties broken by the fixed direction order E, SE,
  SW, W, NW, NE (PROPOSAL, F19). The centre unit of a zone has no "outward" direction and does not
  move (PROPOSAL, F19).

### 12.5 Mass control cap (§6.10)

A hard control (Stunned, Frozen) on a zone or several targets hits at most 3 units (TUNE), chosen by
the caster in `Picks.units`; without picks (AI default), the first 3 in resolution order. Integrity
check (12.7): `max_targets <= 3` on any hard-control effect.

### 12.6 Resolution order of multi-target effects (§6.10)

Nearest to the origin first, then `r` ascending, then `q` ascending (§6.10). Each target is one
elementary effect (7.7). Bounces (Chaîne d'éclairs) pick the next target among units adjacent to the
previous one: `Picks.units` in order, else the first enemy in fixed order not hit yet (PROPOSAL).

### 12.7 Integrity checks of ability data (this role's part of §24.3)

`ability::validate(&AbilityDef, &ClassDef) -> Vec<DataError>`, called by `tech-lead`'s loader test:

- `counterplay` present and non-empty (§6.10, §24.3);
- `ejector` implies `slot == ultimate` or `tell >= 1` (§24.3);
- every hard-control effect has `max_targets <= 3` (§6.10);
- every cost `<=` the resource max of the class (§24.3);
- every primitive parameter in range (Weight deltas within ±2, turns 1..=10, ratios 0..=50000,
  TUNE bounds);
- a `preparation` slot ability has an `on_event` trigger;
- `once_per_combat` abilities have a cooldown (consistency only, PROPOSAL).

### 12.8 Channelling (§6.10)

`Channel { kind, completes_at: TurnRef }` on the channelling unit. Broken when its cell changes for
any reason other than the channel itself, or when it dies (§6.10, as written). Boss channels (§18)
use the same struct (`encounter-boss-designer`).

### 12.9 Dependencies, tests, risks

- **Dependencies.** `class-designer` (every ability as data, counterplay texts), `tech-lead` (loader),
  `encounter-boss-designer` (monster and boss abilities), `ux-designer` (picks UI: choose 3, choose
  the ejected unit), `ai-programmer` (enumerating picks).
- **Tests.** One unit test per primitive parameter value (100 % coverage forces it). Scenario files:
  - Non-Éjecteur at the edge. Given a Guardian's Coup de bouclier on an enemy at the rim, When cast,
    Then the target does not move, takes the hit and an edge Choc, and is not ejected.
  - Two would-be ejections. Given Séisme du Lest with two enemies on the rim within radius 2, When
    cast with `Picks.units = [#8]`, Then `#8` is ejected, the other stays on the last cell with an
    edge Choc.
  - Ice slide from an ability. Given Halo de répulsion pushes an enemy onto an Ice run reaching the
    edge, Then the enemy slides to the last cell and stops (no Éjecteur).
  - Ice slide from a Mouvement. Given Sol verglacé and a 2 vs 1 push onto Ice toward the edge, Then
    the pushed unit slides off and is ejected (a Mouvement may eject, §8.5 combo).
  - Breach multi-ejection. Given 3 units on a ring that goes void, Then 3 `Ejected` in one event.
  - Mass control. Given Nova de givre with 5 adjacent enemies and picks `#2 #4 #6`, Then exactly
    those 3 are Frozen; with 4 picks, `refused TooManyPicks`.
  - Order. Given a zone hitting units at `(0,1)`, `(2,-1)` and `(1,0)` from origin `(0,0)`, Then the
    order is `(1,0)` (distance 1, `r = 0`), `(0,1)` (distance 1, `r = 1`), then `(2,-1)`
    (distance 2).
  - Knockback order. Given a Guardian hero at `(0,0)` on a radius-4 board casting Séisme du Lest
    with enemies at `(1,0)` and `(2,0)`, When the knockback resolves, Then `(2,0)` moves to `(3,0)`
    first and `(1,0)` then moves to `(2,0)` (with nearest-first, `(1,0)` would be blocked).
  - Integrity: an Éjecteur non-ultimate with `tell 0` fails `validate`.
- **Risks.** The language will grow with every class. Rule: a new mechanic first tries an existing
  primitive with a new parameter; a 13th primitive needs a Decision (§6.10 says 12).

---

## 13. Statuses and keywords (§6.11), R2

### 13.1 Model

```rust
pub struct StatusInst {
    pub id: StatusId,
    pub source: EntityId,      // who applied it (credit, refresh rule)
    pub turns_left: u8,        // carrier turns (7.5); 255 = until removed
    pub fresh: bool,
    pub magnitude: i32,        // bp for Marked, HP for DoT ticks, delta for Weight
    pub stacks: u8,            // Vitrification 1..=3, combo-like counters
    pub kind: Duration,        // CarrierTurns | UntilTurnStart(EntityId) | WhileOnTerrain
}
```

Rules (PROPOSAL unless tagged):

- **Same status, same source:** reapplying refreshes `turns_left = max(old, new)` and
  `magnitude = max(old, new)`; no stacking, except statuses with `stacks` (Vitrification max 3,
  TUNE). Same status from two sources: two instances (two Bleeds from two entities tick both).
  Feedback F32: §6.11 gives no stacking rule.
- **Damage over time** (Bleed, Poison, Burn): the tick amount is computed **at application** with the
  9.1 formula (the applier's stat, the carrier's Defense at that moment) and stored in `magnitude`.
  Each tick at the carrier's turn start is one action of its own, Pure (already reduced), credited to
  the applier. Feedback F33: §6.11 does not say when DoTs are computed or which type they are.
- Biome changes at application: Tourbières Poison +1 turn, Toundra Frozen +1 turn, Caldeira Burn
  +50 % magnitude (§5.2, TUNE).

### 13.2 Catalog and engine hooks

| Status or keyword | Engine hook | Category (DR) |
|---|---|---|
| Unmovable (Inamovible) | `selectable = false`, `unmovable = true` in `PushWorld`; every displacement and rewind skips it | — |
| Unejectable (Inéjectable) | `unejectable = true`; ability and terrain: stop on the last cell (10.2); not stackable; when it ends, `Lassitude` 2 carrier turns (TUNE) blocks a new one | — |
| Ancré | = Unmovable | — |
| Stase | Unmovable, untargetable, cannot act (not selectable, no cast, no Preparation fire) | Hard when an opponent applies it |
| Insaisissable | Unmovable, dodges the next single-target ability (consumed), cannot move by itself, can cast | — |
| Enraciné (Rooted) | not selectable in a Mouvement, no Step; can be pushed; Quicksand exception (7.6) | Mobility |
| Étourdi (Stunned) | not selectable, cannot cast; its Preparations do not fire; a stunned hero means no ability for the entity | Hard |
| Gelé (Frozen) | Stunned + ARM `+3000 bp` (TUNE) | Hard |
| Silence | the hero casts no ability (Mouvement and consumables allowed, PROPOSAL) | Cast |
| Aveuglé (Blinded) | `can_lead = false` | Cast |
| Provocation | 12.2 | — |
| Saignement, Poison, Brûlure | DoT at the carrier's turn start; Poison halves heals received (9.3) | — |
| Alourdi, Allégé | Weight ±1 or ±2, clamp 1..5 (8.2) | — |
| Marqué | `Σbonus_bp + magnitude` on damage taken | — |
| Bouclier | a shield instance (9.4) | — |
| Mouillé (Wet), Vitrification, Chargé, Lassitude | not in the §6.11 table but used by §5.1, §8.5, §6.11: added to the catalog (Feedback F34) | — |

### 13.3 Diminishing returns (§6.11)

- Categories Hard, Mobility, Cast (§6.11). `dr[cat]` holds immune carrier turns.
- Immunity starts **when the control ends** and lasts 2 carrier turns (TUNE; the start point is a
  PROPOSAL, Feedback F3). While `dr[cat] > 0`, a new control of that category is refused
  (`StatusRefused { why: Diminished }`).
- A control of a category already active on the target is refused, not refreshed (PROPOSAL).
- Stase applied by an ally is not a control (§6.11).
- Terrain roots (Quicksand) ignore DR and give none (PROPOSAL).
- An elemental reaction that would Stun is blocked by the immunity (§6.11, as written).

### 13.4 Tenacity and PvP

- PvP: controls last 1 turn less, minimum 1 (§19, TUNE). Then Tenacity: if `tenacity >= 50`
  (TUNE) and the duration is still >= 2, minus 1 (§7.1, §6.11). Order PvP then Tenacity, floor 1
  (PROPOSAL).
- Inébranlable rune: the first control of the combat is ignored (`StatusRefused { why: Rune }`).

### 13.5 Dependencies, tests, risks

- **Dependencies.** `class-designer` (status magnitudes), `game-designer` (F3, F32, F33, F34),
  `ux-designer` (status glyphs need the full catalog), `encounter-boss-designer` (boss immunities).
- **Tests.**
  - DR. Given an enemy Stunned 1 turn by P, When the Stun ends at the end of `T(E, 3)` and P tries a
    Freeze during `T(P, 4)`, Then `StatusRefused { Diminished }`; in `T(P, 6)` (after `T(E, 5)`
    ends) the Freeze lands.
  - Stase from an ally is not a control. Given the Chronomancer puts its own Fragment in Stase, Then
    no DR is set.
  - Frozen ARM. Given Frozen on a unit with ARM 20, Then the damage formula uses ARM 26.
  - Unejectable push. Given Forteresse on all P units, When E tries a 2 vs 1 push that would eject a
    P Fragment, Then `refused Move(Unejectable)`; a 2 vs 1 push that moves it one cell inward is
    legal.
  - Lassitude. Given a unit whose Unejectable just ended, When Aube tries to give it Unejectable in
    the next turn, Then refused for that unit only; others get it.
  - Tenacity. Given tenacity 50 and a 2-turn Stun in PvE, Then 1 turn. Given PvP and a 2-turn Stun
    and tenacity 50, Then 1 turn (floor 1).
  - Blinded. Given a Blinded unit at the front of a group, When that push is tried, Then
    `refused Move(BlindedLead)`; the same group moving the other way (the Blinded unit at the back)
    is legal.
  - DoT snapshot. Given a Bleed of 20 % ATQ applied when the carrier had ARM 20, When its ARM rises
    before the tick, Then the tick is unchanged.
- **Risks.** A status catalog that grows per class: every new status needs a glyph (ux-designer) and
  a hook here; the catalog is data, the hooks are a closed enum (PROPOSAL).

---

## 14. Preparations (§6.3), R2

### 14.1 Model

```rust
pub struct Armed { pub ability: AbilityId, pub unit_target: Option<UnitId>, pub armed_round: u32 }
```

- Arming uses the Quick slot, pays the cost and starts the cooldown at once (§6.3, PROPOSAL for the
  timing).
- At most 2 armed per entity (§6.3, TUNE). A third is refused (`refused TooManyPreparations`).
- Public: in the view, with their target (§6.3).
- Each fires at most once, then is removed. A Preparation not fired by the **start of its owner's
  next turn** expires (PROPOSAL, Feedback F35: §6.3 gives no lifetime).
- It fires only during an opposing entity's turn (§6.3), in arming order (§6.3), automatically.
- It does not fire while its source unit (the hero) is Stunned, Frozen, in Stase or Silenced
  (PROPOSAL, F35).
- An effect whose `cause` chain contains a Preparation never fires a Preparation (§6.3, FINAL as
  written).

### 14.2 Trigger events (data field `on_event`)

| Event | Timing in the atomic loop | Used by |
|---|---|---|
| `enemy_targets(unit)` | before the targeted effect is computed (redirect) | Interposition (§8.1) |
| `moved_by_enemy(unit)` | recorded at once; the effect runs at the end of that opposing turn | Déjà-vu (§8.7) |
| `pushed(unit)`, `damaged(unit)`, `enters(cell)` | after the triggering effect | future abilities, runes |

### 14.3 Tests

- Interposition. Given the Guardian armed Interposition on Fragment `#3`, When E's Fendoir targets
  `#3`, Then the damage is computed on the Guardian hero, `PrepFired`, and the Preparation is gone.
- Zone not redirected. Given the same, When E's zone ability hits `#3`, Then `#3` takes it
  (Interposition watches single-target abilities, PROPOSAL).
- No chain. Given P armed Interposition on `#3` and then a test Preparation "when P's hero is
  targeted by an enemy ability, gain a shield", When E's Fendoir targets `#3` and Interposition
  redirects it to P's hero, Then the second Preparation does not fire (the hero was targeted by a
  Preparation effect, §6.3).
- Order. Given two Preparations armed in order A then B that both watch `#3`, When `#3` is targeted,
  Then A fires first; B fires only if its condition still holds after A.
- Expiry. Given a Preparation not fired during E's turn, When P's next turn starts, Then it is gone
  and its cooldown keeps running.
- Stunned owner. Given P's hero Stunned during E's turn, When the trigger happens, Then nothing fires.

---

## 15. Passive triggers: traits, keystones, affixes, Aspects (§8, §9, §5.3, §12), R2 to R9

### 15.1 Model

```rust
pub struct Passive {
    pub id: PassiveId,
    pub on: Trigger,          // see list
    pub when: Vec<Cond>,      // filters: own unit, ally, hero only, hp below, isolated, every_n_turns(n), once_per_combat
    pub effects: Vec<EffectDef>, // the 12 primitives, same interpreter
    pub stacks: Option<StackDef>, // Conquérant, Tempo mortel, Trophées, Bourreau du bord
}
```

Triggers (closed enum, PROPOSAL): `CombatStart`, `TurnStart`, `TurnEnd`, `PushDone`, `Pushed`,
`DamageDealt`, `DamageTaken`, `HealReceived`, `Loss` (any camp), `LossInflicted`, `EjectionCaused`,
`AbilityCast`, `ControlApplied`, `HpBelow(bp)`, `AllyHpBelow(bp)`, `WouldBeEjected`, `Died`,
`Moved`. Dispatch order: entities by id, then passives in list order; depth cap of 7.7.

### 15.2 Examples of mapping

Data owned by `class-designer`, `progression-designer`, `encounter-boss-designer`, `items-designer`.

| Passive | Trigger + effect |
|---|---|
| Sentinelle (Guardian) | aura: `StatMod` ARM and RES +1500 bp on adjacent allies, recomputed per effect (aura = condition on adjacency, no instance) |
| Élan (Warrior) | `PushDone` with the hero leading: Choc `+5000 bp` (applied inside 9.2, flag) |
| Grâce (Healer) | `AllyHpBelow(2500)` once per unit: Shield 50 % PUI |
| Moisson (Necromancer) | `Loss`: heal the hero 5 % max HP |
| Instant suspendu (Chronomancer) | `WouldBeEjected`, once per combat (10.2) |
| Marche-pierre (Geomancer) | the hero ignores negative terrain effects (a flag read by 16.2) |
| Bourreau du bord (keystone) | `EjectionCaused`: hero Weight +1 (max +2, clamp 5), +20 resource |
| Comète arcanique (keystone) | `DamageDealt` by an ability: Mark on the cell, fires next own turn start, radius 1 |
| Givrant (affix) | `Moved`: Terrain Ice on the vacated cell for 2 turns (TUNE) |
| Explosif (archetype, affix) | `Died` at 0 HP: knockback neighbours 1 cell, no ejection |
| Aspect "Coque du Monolithe" | not a passive: patches Ancrage duration +1 in the resolver (section 18) |

### 15.3 Tests

One scenario per trigger kind (coverage), plus: Moisson heals on an enemy Loss and on an own Loss,
not on a Revenant's removal; Bourreau du bord stops at +2; Grâce fires once per unit per combat;
depth cap: a test passive that re-triggers itself stops after 3 levels with no panic.

### 15.4 Risks

Auras recomputed after every elementary effect cost time on big boards; cache per action, never
store them in the state (they are derived, PROPOSAL).

---

## 16. Resources, terrain rules, biome and world modifiers (§8, §7.1, §5.1, §5.2, §4.8, §17)

### 16.1 Resource engine

```rust
pub struct ResourceDef {
    pub id: ResourceId, pub min: i32, pub max: i32, pub start: i32,
    pub per_turn: i32, pub per_turn_fixed: bool,          // Assassin Energy: "fixed", no % modifiers
    pub on: Vec<(ResEvent, i32)>,                          // PushDone +15, LossAnywhere +20, ...
    pub decay: Vec<(ResCond, i32)>,                        // TurnWithoutPush -10
    pub debt: Option<DebtDef>,                             // Paradox: spend > 4 in a turn, -2 next turn
}
```

- Per-turn gain at step 1 of turn start (§6.3): `gain = per_turn × (10000 + vit_bp + affinity_bp +
  biome_bp) / 10000`, floored, unless `per_turn_fixed`. `vit_bp = 100 × floor((VIT - 10) / 2)` for
  VIT above 10 (§7.1, TUNE); affinity `+1000` on its biome (§5.2, TUNE). With floor, a gain of
  1 (sand grains) never benefits from a +x % modifier (Feedback F36).
- Event gains apply at once, in the atomic loop; clamp to `[min, max]` after each change.
- Decay conditions are checked at end-of-turn step 2.
- Class values (all TUNE, §8): Rempart 0..100, start 0, +5/turn, +10 per allied unit damaged or
  pushed, never decreases. Rage 0..100, +15 per successful push, +10 per big hit taken by the hero,
  +25 per Loss inflicted, -10 per own turn without a push. Energy 0..100, +30/turn fixed; combo
  points 0..5. Foi 0..100, start 50, +15/turn. Mana 0..150, start 100, +10/turn. Essence 0..100,
  start 0, +20 per Loss anywhere (Revenants excluded), +5/turn, +10 per own Fragment lost. Grains
  0..6, start 2, +1/turn, +1 more at the next turn start if no ability was cast this turn
  (PROPOSAL timing), debt -2 if more than 4 were spent in one turn. Strates 0..100, +10/turn, +5 per
  own unit on a special cell at turn start.
- Tonique (+30, §15.4), Présence d'esprit (+15 on a Loss inflicted), Sanctuary (+5) are `Resource`
  primitive effects.

### 16.2 Terrain rules (§5.1)

Storage, Roc blocking, Gouffre, Ice slide, Mud broadside and seams are `engine-programmer`'s. This
layer runs the rules that act in turns. Terrain durations tick at the end of the **creator
entity's** turns (with the `fresh` rule of 7.5); biome and world terrain counts **rounds**
(PROPOSAL, Feedback F10).

| Cell | When | Effect here | Credit |
|---|---|---|---|
| Fourré | damage calc | `-5000 bp` if origin distance >= 2 | — |
| Hauteur | cast | range +1, `+2000 bp` | — |
| Pente | push | 8.3 | — |
| Lave | end of the turn of the unit's entity | Pure damage 10 % max HP (TUNE) | creator or none |
| Eau | entering, and turn start on it | Wet until the end of the carrier's next turn (PROPOSAL, F34); Burn removed; Choc received `-5000 bp` | — |
| Sables mouvants | start of the turn of the unit's entity | 1st: Rooted (terrain root) and a `Will`-type tell; 2nd in a row: ejected (one action per cell) | creator or none |
| Évent | end of each round, countdown N | at 0: the unit on it is pushed 1 cell along the engraved direction (may eject: tell >= 2); the countdown restarts at N (PROPOSAL, F37) | none |
| Sanctuaire | end of the turn of the unit's entity | heal 5 % max HP and +5 resource for units of the owner camp, any camp when neutral (PROPOSAL, F38) | — |
| Corruption | end of the unit's entity turn | +1 Vitrification (max 3), each `-1000 bp` ARM and RES; -1 per own turn ended elsewhere | — |
| Cristal | line targeting | 12.2 | — |
| Ronces | a unit is pushed into it | Pure damage 5 % max HP | the pusher |
| Gouffre (temporary) | creation | units on it are ejected (budget per 12.4) | creator or none |

The Geomancer's Marche-pierre skips the negative rows (Lava, Quicksand, Corruption, Ronces, Mud
Weight, Thicket) for the hero only (§8.8).

### 16.3 Biome, weather, night, Mythic (§5.2, §4.8, §17)

`CombatRules.modifiers: Vec<ModifierId>` from the setup. Each modifier is data that the engine
reads at fixed hook points:

| Modifier | Hook | Value |
|---|---|---|
| Sylve de Cendre | range | -1 (TUNE) |
| Tourbières | Poison duration | +1 turn (TUNE) |
| Dunes | per-turn resource | -1000 bp, except fire (meaning unclear, F39) |
| Crêtes | generation only (`world-programmer`) | — |
| Toundra | Frozen duration | +1 turn (TUNE) |
| Littoral, Tide | round schedule | every 6 rounds, 5 sea-side rim cells become Gouffre for 2 rounds, tell 2 (TUNE) |
| Caldeira | Burn magnitude | +5000 bp (TUNE) |
| Terres Vitrifiées | `Died` | the cell becomes Corruption |
| Le Puits | range; schedule | darkness -1 except from a Sanctuary; Rockfall: a cell becomes Roc, tell 1 (frequency missing, F39) |
| Night (v2) | setup stats | monsters +10 % (TUNE), applied by the setup builder |
| Rain, sandstorm (v2) | damage tag, range | lightning +2500, fire -2500; range -1 (TUNE) |
| Mythic affixes | per affix | Sanguin: a death creates an enemy-owned Sanctuary; the others are not defined yet (F40) |

### 16.4 Dependencies, tests, risks

- **Dependencies.** `engine-programmer` (terrain layer, temporary Gouffre, region growth for Pont),
  `world-programmer` (biome modifiers, Tide sea side, terrain generation), `class-designer`
  (resource numbers), `encounter-boss-designer` (Mythic affix data), `game-designer` (F10, F34 to
  F40).
- **Tests.**
  - Lava. Given P's Fragment (40 HP max) ends P's turn on Lava, Then it loses 4; an E unit on Lava
    at the end of P's turn loses nothing.
  - Quicksand. Given P's unit starts `T(P, 5)` on Quicksand, Then Rooted and a tell; if it starts
    `T(P, 6)` there too, Then ejected (`Loss`); if it Stepped out in turn 5, Then nothing.
  - Two Quicksand ejections in one turn start: Given two P units on two Quicksand cells for the
    second start, Then both are ejected (two sources, two actions).
  - Vent. Given a Vent at 1 pointing off-board under an E unit, When the round ends, Then the unit
    is ejected and the countdown restarts.
  - Rage decay. Given P's Warrior did not push in `T(P, 3)`, Then Rage -10 at its end; with a push,
    +15 and no decay.
  - VIT. Given VIT 14 and Foi +15/turn, Then +15 × 10200 / 10000 = 15 (floor); VIT 30: +15 × 11000
    / 10000 = 16.
  - Tide (R9). Given Littoral at round 6, Then 5 sea-side cells crack (tell), void at the end of
    round 8, back to normal at the end of round 10.
- **Risks.** Round-based biome clocks and entity-based ability clocks side by side are confusing on
  screen: the view gives every countdown in the unit it uses (ux-designer).

---

## 17. Engine support for the class mechanics (§8.0 to §8.8)

Content (numbers, texts) is `class-designer`'s. This table is the contract: each mechanic, the
primitive or hook that runs it, and the phase.

### 17.1 Overview

| Class | Mechanic | Implementation | Phase |
|---|---|---|---|
| Guardian | Ancrage | Status Ancré, `UntilTurnStart(caster)` | R2 |
| Guardian | Provocation zone | Status Provocation, max targets none (not a hard control) | R2 |
| Guardian | Interposition | Preparation `enemy_targets` (14) | R2 |
| Guardian | Mur de boucliers | Terrain Roc on 3 aligned empty cells, 2 turns, `owner` = camp (meaning of "allied Roc", F41) | R2 |
| Guardian | Forteresse | Status Unejectable on all own units, Lassitude after | R2 |
| Guardian | Coup de bouclier, Chaîne d'ancre | Damage + Displacement (push 1 / pull 1, no ejector) | R2 |
| Guardian | Épines | Status on the hero: `Pushed` passive on adjacent allied runs, Damage 60 % PUI to the lead unit | R2 |
| Guardian | Bélier | StatMod `push_weight_next` +2 if the hero is in the group | R2 |
| Guardian | Séisme du Lest | Damage zone r2 + Displacement away, ejector, picks 1 | R2 |
| Warrior | Charge | Displacement `self_line` up to 2 empty cells, then Damage Choc on the next enemy (no push), Resource +20 | R1 |
| Warrior | Fendoir | Damage 120 % ATQ, +5000 bp if isolated | R1 |
| Warrior | Percée, Avalanche | Turn `push_rules` (8.3) | R2 |
| Warrior | Cri de guerre | StatMod ATQ +20 % allies r2, Weight -1 enemies r2 | R2 |
| Warrior | Tourbillon, Exécution | Damage per adjacent enemy; Damage with `hp_below_bp 3000`, `on kill` Resource +25 | R2 |
| Warrior | Peau de fer | Shield 30 % max HP + Weight +1, 2 turns | R2 |
| Warrior | Écrasement | 17.2 | R2 |
| Warrior | Titan | Status: Weight override 5, Unmovable, Choc +10000 bp on units it pushes, 2 turns | R2 |
| Assassin | Combo points | secondary resource 0..5; `"amount": "all"` finishers; refund on kill | R9 |
| Assassin | Pas de l'ombre, Danse des lames, Assassinat | Displacement `teleport` with destination filter "adjacent to an enemy"; Danse: ordered picks of up to 4 targets, the hero ends adjacent to the last | R9 |
| Assassin | Insaisissable, Fumigène, Croc-en-jambe, Marque de mort | Statuses; Fumigène = Terrain-like zone flag for 2 turns (12.2) | R9 |
| Assassin | Lame empoisonnée | Status with `charges: 3` adding Poison on the next 3 Damage effects | R9 |
| Healer | Lumière accumulée, Grâce | passives (9.3, 15.2) | R2 |
| Healer | Source | Terrain Sanctuary 3 turns + Mark "end of turn heal 50 % PUI r1" | R2 |
| Healer | Purification, Aube | Heal `cleanse` (negative statuses = flag in the catalog) + Unejectable | R2 |
| Healer | Transfert | Displacement `swap` of two allies (no slide) | R2 |
| Healer | Lien vital, Martyr | Statuses read by the pipeline (9.4) | R2 |
| Healer | Halo de répulsion | Displacement push 1, max 3 adjacent enemies, farthest first | R2 |
| Mage | Overheat, reactions | 17.5 | R2 |
| Mage | Clignement | Displacement `teleport` self to an empty cell in range | R2 |
| Mage | Mur de flammes, Sol verglacé, Zéro absolu | Terrain (Lava 3, Ice 3; Ice 2) + Status Frozen max 3 | R2 |
| Mage | Météore | Mark at caster's next turn start: Damage zone r1 + Displacement outward, ejector, default pick (12.4) | R2 |
| Mage | Bouclier de mana | Status read by the pipeline (9.4) | R2 |
| Necromancer | Essence, Pacte de sang, Moisson, Serviteurs d'os | resource events, Quick ability, passives | R9 |
| Necromancer | Relever, Rappel du vide, Armée des morts, Peste | Revive primitive (10.4); Peste = Status Poison + passive "on death while poisoned: Revive in place" within the cap | R9 |
| Necromancer | Explosion de cadavre | consumes a Corpse; Damage = 30 % of the origin's max HP, r1; knockback no ejection | R9 |
| Necromancer | Sacrifice, Retour de souffrance, Prison d'os, Décrépitude | destroy own Revenant + Shield; Status (9.4 step 10); Terrain Roc ring on empty neighbours; StatMod | R9 |
| Chronomancer | all | 17.7 | R9 |
| Geomancer | all | 17.8 | R9 |

### 17.2 Écrasement (§8.2)

Target kind `blocked_push_line`: a legal-shaped own group (1 to 3, inline, `n > m`, push Weight
strictly greater) whose run is followed by a Roc, an own or allied unit, or an Unmovable unit, which
is the only reason the push is illegal. Nothing moves. The "stuck" unit is the **last unit of the
run**, the one against the blocker (PROPOSAL, F42); it takes 150 % ATQ of the hero (TUNE). The
Mouvement slot is not used (it is an Action).

### 17.3 Charge (§8.2), R1

The hero moves along one direction up to 2 empty cells (stops early at a unit, a Roc, the region
edge or a Gouffre); if the next cell after its final cell holds an enemy, that enemy takes a Choc of
100 % ATQ (TUNE) without moving. Rage +20 (TUNE). The hero entering Ice slides and stops on the last
cell (7.6). Not a Step (§6.3).

### 17.4 Avalanche (§8.2)

`push_rules = { max_group: 4, inline_only: true, max_run: 3, shock_bp: +10000 }` for the Mouvement of
this turn; still `n > m` and Weight strictly greater; still at most 1 ejection (§8.2). Engine support
for a 4-unit group is `engine-programmer`'s (F24).

### 17.5 Mage: Overheat and Résonance (§8.5)

- Overheat: `spells_cast_this_turn` on the entity; the cost of a spell is
  `base × (10000 + 5000 × spells_cast_this_turn) / 10000`, rounded up (PROPOSAL; §8.5 "+50 % per
  spell in the same turn", cumulative reading).
- Element states (`Burnt`, `Chilled`, `Charged`) are markers set by spells with the matching
  keyword, separate from the Burn DoT and the Frozen control, lasting 2 carrier turns (PROPOSAL,
  Feedback F4). When a second, different state lands, the reaction fires at once and both states
  are consumed:
  - Burnt + Chilled = Vapeur: Stun 1 turn (a Hard control: DR applies, §8.5).
  - Chilled + Charged = Bris: the triggering hit gets `+5000 bp`, then Weight -1 for 1 turn.
  - Burnt + Charged = Explosion: Damage 60 % PUI magic in radius 1 around the unit (a triggered
    effect, depth 1).
- Feedback F4: if "Gelé" in §8.5 is the Frozen control of §6.11, Vapeur is almost always blocked by
  DR (the target was just hard-controlled). Separate markers fix it; owners decide.

### 17.6 Necromancer (§8.6)

See 10.3, 10.4, 16.1. Peste (§8.6): enemies that die while carrying its Poison rise in place as
Revenants, within the cap of 3, in death order (PROPOSAL); they leave no Corpse because they rise at
once.

### 17.7 Chronomancer (§8.7): history snapshots

- `Snapshot { positions: Vec<(UnitId, Axial)>, hp: Vec<(UnitId, i32)> }` of **every unit on the
  board**, taken at step 0 of each turn start of the entity; each entity keeps its last 2 (only for
  entities whose kit reads history, plus every entity when a Chronomancer is in the fight: the
  Retour target's entity, PROPOSAL). Part of the hash.
- "The previous turn of entity X" = the most recent turn start of X that is not the current turn
  (PROPOSAL; Feedback F43: ambiguous when X is not the active entity).
- **Retour**: the target goes back to its cell in X's previous snapshot if that cell is free and
  enterable; otherwise the cast is refused before paying (PROPOSAL: §8.7 says "the effect fails and
  the grains are returned"; a refused cast is the same for the player and simpler, F44).
- **Rembobiner les blessures**: `hp = max(hp, snapshot hp)` from the caster's previous turn start.
- **Déjà-vu**: Preparation `moved_by_enemy`, at the end of that opposing turn the unit goes back to
  its cell from before the move, if free.
- **Paradoxe** (board rewind) algorithm, deterministic:
  1. For every unit on the board with a position in the caster's previous snapshot: target = that
     cell. Units created since (Revenants, summons) have no target.
  2. A unit is **stuck** if it is Unmovable or Stase, or its target is not an enterable region cell
     now (Roc, Gouffre, gone). Stuck units keep their cell.
  3. Repeat until stable: a unit whose target is the current cell of a stuck unit becomes stuck.
  4. All non-stuck units move at once to their targets (targets are distinct: they came from one
     snapshot).
  5. A unit with no target whose cell is now taken by a moved unit goes to the nearest free
     enterable cell, ties by fixed order (§8.7, as written).
  6. HP, Losses, cooldowns do not change (§8.7). No unit is ejected (PROPOSAL). Channels of moved
     units break.
- **Arrêt du temps**: Turn primitive `restrict_next_turn(move_only)` + `freeze_clock` on the target
  entity's next turn (7.4, 7.5); does the entity still gain its resource that turn? Not said:
  PROPOSAL yes (F45). Against a boss: `ready_at += 2` instead (§8.7).
- **Stase, Hâte, Sablier, Lenteur, Mine temporelle**: Status, Turn `bonus_step`, Turn
  `cooldown_shift`, Status Blinded + `cooldown_shift +1` on a hero, Mark.

### 17.8 Geomancer (§8.8): terrain edits

- Soulèvement, Sables, Pente, Prison d'os-like rings, Rempart tellurique: Terrain primitive with
  `cells` selectors; a Roc never appears under a unit: occupied cells are skipped (PROPOSAL, F46).
- **Pont**: Terrain `op: bridge` on a Gouffre or on a cell just outside the region and adjacent to it;
  the region grows by that cell for 2 turns (`engine-programmer`: region growth). At expiry, a unit
  on it is ejected (terrain with a visible countdown of 2: may eject several, §6.10), credit the
  creator.
- **Secousse**: Displacement `perpendicular` with `Picks.dir`, each unit on the line moves 1 cell if
  free, no ejection.
- **Effondrement**: Mark firing at the end of the next opposing turn (in a group: the next turn of
  any opposing entity, PROPOSAL F47), Terrain Gouffre 3 turns on the cell; ejector, 1 cell so 1
  ejection.
- **Rotation**: `op: rotate` on the 7 cells around a centre whose 6 neighbours are in the region and
  hold no Unmovable unit (§8.8); units, terrain and Slope directions turn 60°; the sense is chosen by
  `Picks.dir` (clockwise or counter-clockwise, PROPOSAL F48); never ejects. One elementary effect
  (Displacement and Terrain at once, atomic).
- **Séisme**: Mark at the start of the caster's 2nd next turn: 2 chosen rim sides (9 cells, TUNE)
  become Gouffre for 2 turns; tell >= 2 so several ejections are allowed (§8.8).

### 17.9 Dependencies, tests, risks

- **Dependencies.** `class-designer` (every number and text), `engine-programmer` (4-unit group, region
  growth, rotation of terrain), `ux-designer` (picks for Danse des lames, Rotation sense, Secousse
  direction), `ai-programmer` (enumeration of these picks).
- **Tests.** One scenario per row of 17.1 at the phase listed, with the counterplay of §8 as a second
  scenario where it is mechanical (Retour refused when the old cell is occupied; Percée refused
  against Mud + Ancrage Weight; Pas de l'ombre with no empty cell adjacent to an enemy: no legal
  target). Paradoxe: Given three units A, B, C where A's old cell is now held by B, which is
  Unmovable, Then A is stuck, C (no conflict) moves back, B stays.
- **Risks.** The Chronomancer and the Geomancer touch the board itself: they are R9 on purpose, after
  the board API is stable.

---

## 18. Ranks, variants, Aspects, consumables, tutorial (§10, §12, §15.4, §11)

- **Ranks and variants** (§10): R2 "+25 % effect or -1 turn of cooldown", R3 variant A or B (TUNE
  costs 1/1/2 are `progression-designer`'s). The resolver (`progression-designer`, crate
  `abalone-world`) applies the patches of `ranks` to the `AbilityDef` and gives this crate
  `ResolvedAbility`. "+25 % effect" must be written per ability as concrete patches (which fields),
  not computed here (PROPOSAL, F49).
- **Aspects and set bonuses** (§12): either patches of the same kind (Ancrage +1 turn, Trait de feu
  goes through 1 unit, Relever les morts CD 0 and cost 50) or passives (Ancre du Ballast 4 pieces:
  `+15` Rempart when an enemy push is blocked by an Ancré unit, needs the event `PushBlockedBy(unit)`
  from the core). Resolved before the combat.
- **Grimoire descellé** (§9): once per combat, swap an equipped ability for an unlocked one: an
  `Action::SwapAbility` (Quick slot? not said, PROPOSAL: no slot, start of the turn only, F50).
- **Consumables** (§15.4): `Action::Consumable` uses the Quick slot; at most 1 per turn (by the slot)
  and 3 per combat (TUNE, `consumables_used`). Effects are primitives: potion Heal 30 % max HP,
  Tonique Resource +30, Antidote cleanse Poison, Huile adds an element keyword to the next attacks
  (Status with charges), Bombe Damage r1 + knockback, Lest liquide Weight +1 for 2 turns.
  Livraison de rations (§9): one free consumable (does not count in the 3, PROPOSAL).
- **Tutorial levels 1 to 4** (§11): a setup with no ability and `rules.tutorial = true` (nothing
  special in the engine: an entity with no ability simply has none).

**Tests.** Consumable cap: the 4th use is `refused ConsumableCap`; two in one turn:
`refused SlotSpent`. A resolved R2 ability has the patched value in `view`.

---

## 19. Monsters and bosses: what the combat layer offers (§5.3, §18), R1 and R8

- **Monster turn order** (§5.3): Action, then Mouvement, then Quick action. The engine allows any
  order; the AI (`ai-programmer`) sends them in that order. Each pack entity has one Action and one
  Quick per turn for the whole pack (§6.3); a monster ability's origin is the casting monster
  (PROPOSAL, F51: confirm a 5-monster pack casts only one Action per turn).
- **Intent** (§5.3): `Entity.intent = Some(Intent { ability, caster, target })` set by an
  `Action::SetIntent` at the end of the pack's turn (AI only; PROPOSAL), hashed, public. Binding
  rule (cast next turn on the same target, or re-target when it moved) is
  `encounter-boss-designer`'s; the engine checks it when the setup says `intent: binding`.
- **Boss hooks** (§18):
  - HP phases: passive `HpBelow(bp)` on the Heart with effects (summons, new abilities via
    `GrantAbility`, terrain) and `EntityPhase` counter in the state.
  - Heart Unejectable or Résilient (10.2).
  - Enrage: `rules.breach_start` override.
  - Native mechanics: boss channel (12.8), marked zones (Mark), cells to hold (objective `Hold` with
    a per-round Damage to the group when not held), bomb ball (Mark on a unit with a countdown,
    ejected before 0 = defused), totem (unit kind with no Mouvement), frontal shield (needs a
    **facing** per unit, not in the model: F52), linked units to kill in the same turn (passive
    `Died` + condition), conversion of Fragments (The Chaplain; not one of the 12 primitives: F53),
    mirror Mouvements (The Echo: the AI sends the mirrored Mouvement; legality is the engine's),
    armies (The Choir: subsets of the boss entity's units, Mouvement restricted per round; a
    `selectable` filter from boss data).
  - Arrêt du temps against a boss: `ready_at += 2` (17.7).
- **Retry** (§6.12, §18): same setup, same seed, same result for the same actions; the boss uses no
  randomness in combat (FINAL #313 choice 4). `encounter/telemetry.rs` keeps the attempt record
  (`encounter-boss-designer`).

**Dependencies.** `ai-programmer` (AI order, intents, search trait over `CombatState`),
`encounter-boss-designer` (all boss data, F51 to F53).

**Tests.** A pack entity that sends two Actions in one turn is `refused SlotSpent`; a binding intent
broken by the AI is refused; a Résilient Heart ejected loses 25 % and reappears at the centre; an
`HpBelow(7000)` phase fires exactly once when the Heart crosses 70 %.

---

## 20. Group, PvP and battle royale rules in the combat (§4.7, §6.2, §19, §20), R10

- **Group**: section 6 (frieze), 11.1 (40 % rout), 11.2 (outcome per entity). No pair has authority
  (§4.7, FINAL `SPEC.md` §3): every peer runs `apply_action` on every logged action and compares
  `state_hash` (`network-programmer`). Preparations fire on every peer identically because they are
  automatic (§6.3).
- **PvP** (§19): `rules.pvp = true` turns off the level gap (9.1), shortens controls (13.4), sets the
  initiative rule (5.3), forbids Flee (11.5). Normalised stats arrive in the setup
  (`pvp-br-designer`, `progression-designer`). The 60 s turn reminder and the claim are
  `network-programmer`'s and `client-programmer`'s.
- **Battle royale** (§20): one round = every player sends one order; orders resolve in initiative
  order (rules.md §10.4, FINAL there). An RPG order = up to 1 Mouvement, 1 Action, 1 Quick action
  **in the order the player listed** (PROPOSAL, F54). Each part is validated when it resolves; an
  illegal part fizzles alone, the other parts still resolve (PROPOSAL, F54). The mandatory Mouvement
  does not apply in battle royale (PROPOSAL, F54: §20 says "at most"). `round.rs::resolve_round(state,
  orders) -> (state, effects)` is pure and depends only on the round-start state and the orders
  (rules.md §10.4 bots rule). Elimination: hero dead or no unit left (§20); its units vanish at once.
  Loot chests on cells: an `on_move_end(cell)` hook that grants a temporary item (data
  `pvp-br-designer`).

**Dependencies.** `network-programmer` (lockstep, commit-reveal, hash comparison), `pvp-br-designer`
(templates, chests, BR wedges), `client-programmer` (two-tab e2e).

**Tests.** Two peers in-process (integration, `network-programmer` harness) apply the same 300-action
group log and agree on the hash after every action; a PvP setup has no level-gap term; a BR order
whose Action became illegal fizzles while its Mouvement still resolves.

---

## 21. Determinism and the test strategy (§24.1, §1 pillar 4, §25 R1 criteria)

### 21.1 Determinism rules for `abalone-rpg` (FINAL by #313 choice 4, details PROPOSAL)

- No float, no `HashMap`/`HashSet`, no clock, no RNG, no thread, no `unsafe` (lint-enforced where
  clippy can).
- Every iteration over cells uses the core's fixed order helper; over units and entities, the sorted
  `Vec`.
- Every tie has a written rule in this file (initiative, frieze, resolution order, picks defaults,
  nearest free cell, direction ties).
- `state_hash` covers every field of 4.1; derived values are excluded and listed.
- The action log, not the state, is what peers exchange and what a save stores.

### 21.2 Test levels for this role (CONTRIBUTING §11)

| Level | What | Where |
|---|---|---|
| Unit | every function and branch, one refusing test per `ActionError` | next to the code |
| Scenario | every Given/When/Then of this file, of `rules.md` §10.5 and of `rpg/combat.md` | `tests/scenarios/*.scn` |
| Property (seeded loops) | Weight-1 equals classic (8.6); replay equals live (4.9); at most 1 ejection per non-terrain action; no unit on two cells; units on board + Graveyard + left = units created; a refused action leaves the hash unchanged; Edge danger soundness (10.8) | `tests/properties.rs` |
| Integration | the same logs through `abalone-wasm` (wasm32) give the same hashes | `client-programmer` CI job |
| E2E (Playwright) | handed to `client-programmer`, listed per Task below when a player sees the result | `client/e2e/` |

Coverage: 100 % lines and regions (CONTRIBUTING §11, FINAL). The scenario parser counts as
production code and is covered by its own unit tests.

### 21.3 E2E cases this role hands over (the player sees them)

- R1: a full skirmish Warrior vs pack played in the browser until victory; the Choc number shown in
  the preview equals the engine's (`window.__lastPreview`); the Edge danger glyph appears when the
  fixture puts the hero in danger (`body[data-edge-danger]`); hero ejected shows the defeat banner;
  reload mid-fight restores the same turn (R4).
- R2: a Frozen unit cannot be selected; a cooldown shows the right remaining turns after two turns;
  a Preparation fires during the enemy turn and shows in the log.
- R8: boss phase at 70 % shows; retry starts in under 5 s with the same board.
- R10: two tabs, group fight, same hash after 20 actions (`network-programmer` harness).

---

## 22. Feedback on the gameplay spec

Contradictions and gaps found while writing this file. The gameplay spec is not changed here; each
item has the PROPOSAL this file uses until an owner decides. Most important first.

**Contradictions**

- **F9. No-Loss draw vs Breach.** §6.7 sets the draw at 60 entity turns without a Loss and the
  Breach at turn 30 of each entity. In a 1 vs 1 (boss, PvP, arena) 60 entity turns = 30 rounds: the
  draw fires on the very turn the Breach starts, so the Breach never acts in a fight with no Loss. In
  a 4-player group (8 entities), 60 entity turns = 7.5 rounds: a draw long before Attrition or the
  Breach. PROPOSAL: count the draw in rounds and put it after the Breach has had room (for example
  45 rounds, TUNE); data field so it can move without code.
- **F1. Cooldown meaning.** §6.3 "unavailable for your N next turns" and "cooldowns go down by 1 at
  turn start" give N - 1 lost turns when applied literally. PROPOSAL: absolute `ready_at = t + N + 1`
  (7.4).
- **F4. Vapeur is dead on arrival.** §8.5 Vapeur needs "Gelé" + "Brûlé"; if "Gelé" is the Frozen
  hard control (§6.11), the target is already controlled or DR-immune, and §6.11 says the reaction's
  Stun is blocked by DR. PROPOSAL: element states are markers separate from the Frozen control
  (17.5).
- **F24. Avalanche breaks two FINAL rules on paper.** A 4-unit group contradicts rules.md section 3
  (1 to 3, FINAL), and §6.4 lists Avalanche among the "equal count" pushes although it pushes 4 vs at
  most 3. Needs an explicit rules.md delta in R0.
- **F18. Knockback order.** §6.10 resolves multi-target effects nearest first, which blocks every
  outward knockback where two units are in line (the inner one cannot move into the outer one's
  cell). PROPOSAL: farthest first for outward displacements. Also: which self-moves slide on Ice
  (teleports, swaps, Charge) is not said; PROPOSAL in 7.6.
- **F55. §24.1 diagnosis of the `HashMap`.** The code never iterates the `HashMap`; scans are
  q-major double loops (not r then q, as §24.1 wants), and the real cross-build risk is
  `DefaultHasher` in `position_hash` (not stable across Rust releases). PROPOSAL: in-crate FNV-1a and
  a fixed-order helper (4.6, 21.1).
- **F56. `Effects` does not exist.** §24.2 calls `Effects` "the current render contract"; the code
  returns `(Board, bool)` and the client replays moves. `Effects` is new work (4.3).
- **F61. "Equal count" list.** See F24 (§6.4 names Avalanche as an equal-count push).
- **F21. "Resources reset to zero" (§6.1)** vs class start values (Foi 50, Mana 100, Grains 2).
  PROPOSAL: reset to the class start value.

**Gaps in the turn and status rules**

- **F2. Statuses applied during the carrier's own turn** tick at that turn's end and a 1-turn status
  vanishes at once. PROPOSAL: `fresh` flag (7.5).
- **F3. When does DR immunity start?** At application or at the end of the control. PROPOSAL: at the
  end (13.3).
- **F5. "Same effect" for the 1 vs 1 tie (§6.3)** is undefined; with per-target resolution the tie
  can only happen with a split or a terrain event. PROPOSAL: elementary effect = one primitive on one
  target (section 2, 7.7). Group fights with several heroes per camp have no tie rule at all.
- **F7. Quicksand exit.** §5.1 says a Rooted unit "can always leave with a Step", but a Step needs a
  bonus source most kits lack. PROPOSAL: a single-unit, non-pushing Mouvement also works (7.6).
- **F8. Guard scope and the damage pipeline order.** "One ability" (§6.5): does the Guard apply to
  Mouvement Choc, DoT ticks, terrain, Preparations? And the order of shields, Guard, Mana shield,
  Lien vital, Martyr, Interposition, lifesteal, reflect is not given. PROPOSAL: 9.4, Guard per
  action including Mouvements. Note: with 3 slots per turn, a full-HP hero can still die in one
  enemy turn (3 × 35 % = 105 %); confirm it is intended (F60).
- **F10. Whose turns count** for terrain durations (Mur de boucliers, Pont, Sol verglacé), Vents,
  Tide, Rockfall, the Breach start ("turn 30 of each entity": entities in a group have different
  counts once some leave). PROPOSAL: creator's turns for ability terrain, rounds for world terrain
  and the Breach (16.2, 11.6).
- **F11. Unejectable outside Mouvements.** "A push or effect that would eject it is illegal": for a
  multi-target ability, a terrain void or the Breach, "illegal" has no meaning. PROPOSAL: the unit
  stops on the last cell, or moves to the nearest free cell when its cell becomes a Gouffre (10.2).
- **F12. "One action" and triggered effects.** Do Preparations, reactions and death triggers share
  the triggering action's ejection budget? PROPOSAL: yes (section 2).
- **F13. Trigger chains.** Only Preparations have an anti-chain rule. PROPOSAL: depth cap 3 for every
  trigger (7.7).
- **F16. VIT ties outside PvP** and the frieze when camps have different sizes. PROPOSAL in 6.
- **F20. Per-player result in a group** when a hero dies but the group wins. PROPOSAL: that player
  loses (11.2).
- **F32. Status stacking** (same status twice, two sources) is not defined. PROPOSAL in 13.1.
- **F33. Damage over time**: computed when (application or tick), of which type, credited to whom.
  PROPOSAL: snapshot at application, Pure tick, applier credited (13.1).
- **F34. Statuses used but not in the §6.11 table**: Mouillé (and its duration), Chargé, Brûlé as an
  element state, Vitrification, Lassitude. PROPOSAL: added to the catalog (13.2).
- **F35. Preparation lifetime** and whether a Stunned or Silenced owner still fires them. PROPOSAL:
  expire at the owner's next turn start; no fire while the hero is controlled (14.1).
- **F60. Hero burst.** See F8.
- **F62. Pacte de sang** can kill the own hero (10 % max HP), which loses the fight. PROPOSAL: refused
  when the hero has 10 % max HP or less.

**Gaps in the push, damage and displacement rules**

- **F6. Additive bonuses vs "×" wording.** §6.5 sums every bonus in `(1 + Σbonus)`, but §8 writes
  some as multipliers (Bris ×1.5, Avalanche Choc doubled, Water halves the Choc). Additive and
  multiplicative readings differ when they combine. PROPOSAL: all additive (9.1).
- **F14. Which Slope cell counts** for the push (group front, any unit of the group, the run?).
  PROPOSAL: the group's front unit cell (8.3).
- **F15. Roc inébranlable** "+2 to resist": inside or outside the 1..5 clamp. PROPOSAL: outside.
- **F17. Forced displacement details.** The "Choc" of a non-Éjecteur unit stopped at the edge has no
  value; a 1-cell knockback into an occupied cell is undefined (push the chain, stop, damage?).
  PROPOSAL: edge Choc 50 % of the caster's ATQ (TUNE); no chain pushes, a blocked unit does not move
  (12.4).
- **F19. Direction "away from" the origin** is ambiguous for units off the 6 axes, and undefined for
  the centre unit of a zone (Météore). The Éjecteur choice for delayed effects (resolved at the
  caster's next turn start) is not said. PROPOSAL in 12.4.
- **F25. Credit for Losses** (who inflicted it: terrain, DoT, Ice slide, Ronces) is needed by Rage,
  Triomphe, Trophées, Bourreau du bord, quests. PROPOSAL in 10.3.
- **F29. Crystal** with a unit standing on it. PROPOSAL in 12.2.
- **F30. Range -1 modifiers** on range-1 abilities. PROPOSAL: floor 1, adjacent and self unaffected.
- **F31. Mixed-camp runs** in battle royale (one run with units of two opponents). PROPOSAL: allowed.
- **F42. Écrasement**: which unit is "stuck", and must the push be otherwise legal. PROPOSAL in 17.2.
- **F46. A Roc created on an occupied cell** (Rempart tellurique, Prison d'os). PROPOSAL: skipped.

**Gaps in death, Revenants and outcomes**

- **F22. Corpses and Losses.** Several Corpses on one cell; summons as Losses; units removed by a
  rout or by a hero's or leader's death (Loss? Corpse? Essence?). PROPOSAL: one Corpse per cell,
  newest wins; summons and removals give no Loss and no Corpse (10.1, 10.3).
- **F23. Instant suspendu** fires on the first allied ejection, even of a Fragment. PROPOSAL: keep
  automatic as written; owners may prefer "hero only".
- **F26. Revenants**: decay timing, raising a 4th (refused or oldest crumbles), raising a hero.
  PROPOSAL in 10.4. Naming: the curse "Décrépitude" (§8.6 ability 5) and the Revenant's
  "Décrépitude" (decay) share a name; ids must differ.

**Gaps in class mechanics**

- **F27. Lenteur "+1 turn to cooldowns"**: all abilities or only those on cooldown. PROPOSAL: on
  cooldown only.
- **F28. The Turn primitive** (§6.10: "a bonus Step, or restrict the opposing turn") does not cover
  own-Mouvement modifiers (Percée, Avalanche) nor cooldown shifts (Sablier, Lenteur). PROPOSAL:
  extend its parameters rather than add a 13th primitive.
- **F36. Percent gains on small resources** (+1 % per 2 VIT, affinity +10 %, Dunes -10 %) round to 0
  on sand grains (gain 1). PROPOSAL: accept (documented), or keep a remainder per entity (owners).
- **F37. Vent** after it fires: restarts, stays at 0, or disappears. PROPOSAL: restarts at N.
- **F38. Sanctuary "ally"** for a neutral biome Sanctuary. PROPOSAL: owner camp, or any unit when
  neutral.
- **F39. Dunes "-10 % except for fire abilities"** (a resource gain is not tied to an ability) and the
  Puits Rockfall frequency are not defined.
- **F40. Mythic affixes** Fortifié, Tyrannique, Volcanique, Explosif, Verglacé, Nécrotique,
  Tectonique have names only (§17).
- **F41. "Allied Roc"** (Mur de boucliers): can allies pass through it? PROPOSAL: a normal Roc that
  records its owner (for credit only).
- **F43. "Previous turn of its entity"** (Retour) when the target's entity is not the active one.
  PROPOSAL in 17.7.
- **F44. Retour "fails and grains are returned"** vs a simple refusal at cast. PROPOSAL: refused at
  cast (same result, simpler).
- **F45. Arrêt du temps**: does the frozen entity gain its resource that turn? PROPOSAL: yes.
- **F47. Effondrement in a group**: "the next opposing turn" when several opposing entities play.
  PROPOSAL: the next turn of any opposing entity.
- **F48. Rotation**: clockwise or counter-clockwise. PROPOSAL: the caster chooses.
- **F49. R2 "+25 % effect"** must be written per ability (which number grows). PROPOSAL: explicit
  patches in the data (section 18).
- **F50. Grimoire descellé**: when and with which slot the swap happens. PROPOSAL: start of turn, no
  slot.
- **F58. Name collisions**: the Chronomancer ability "Hâte" and the stat "Hâte"; "Décrépitude" (F26).
  Data ids must be distinct.

**Gaps for monsters, bosses, multiplayer**

- **F51. Monster abilities per turn**: one Action and one Quick for the whole pack (§6.3) or per
  monster (§5.3 "each monster has 1 or 2 abilities")? PROPOSAL: per entity, as §6.3 says.
- **F52. Frontal shield (§18)** needs a facing per unit; nothing in §6 defines facing.
- **F53. Conversion (The Chaplain, §18)** changes a unit's entity: none of the 12 primitives does that.
  PROPOSAL: a boss-only Status "Converted" that moves control, or a Decision to allow it as a
  Revive-like parameter.
- **F54. Battle royale orders (§20)**: order of the 3 parts inside one order, partial fizzle, and the
  mandatory Mouvement ("at most 1 Mouvement"). PROPOSAL in 20.
- **F57. Repetition with counters in the state** (§6.7: the state includes HP, cooldowns, resources)
  can never repeat if absolute counters are included. PROPOSAL: the repetition key of 11.6.
- **F59. R2 "6 cell types"** (§25) are not named. PROPOSAL: Roc, Gouffre, Glace, Boue, Lave, Fourré
  (the R4 biomes then add Ronces, Eau).
- **F63. Battle royale elimination** "or no unit left" (§20) can never happen while the hero lives
  (the hero is a unit); harmless, but the rule reads as if Fragments alone could survive.

---

## 23. Open questions (for owners, beyond the PROPOSALs above)

1. RON or JSON for `data/`, and may `abalone-rpg` depend on `serde`, `serde_json` and `proptest`
   (`tech-lead`)? This file assumes JSON and seeded loops without `proptest`.
2. Does the Guard apply to Mouvement Choc (F8)? It changes how fast a hero dies to pushes.
3. The no-Loss draw: entity turns or rounds, and which value (F9)?
4. Keep threefold repetition in RPG combats at all, given Attrition and the Breach (F57)?
5. Element states separate from the Frozen control (F4)?
6. Should `abalone-rpg` expose an undo token from R1 for the AI, or is clone-and-apply fast enough
   within the node budgets (`ai-programmer`)?
7. Are bosses allowed engine features outside the 12 primitives (facing, conversion, armies), or must
   each become a primitive parameter (F52, F53)?
8. In a group fight, does a player whose hero died get the group's loot and XP when the group wins
   (F20; affects `items-designer` and `progression-designer`)?
9. Snapshots for history abilities: keep them for every entity (simple, more hash bytes) or only
   when a Chronomancer is in the fight (17.7)?
10. Should `legal_actions` enumerate ordered multi-picks (Danse des lames) fully, or should the AI
    build them itself (4.4)?

---

## 24. Tasks (one PR each)

Every Task follows CONTRIBUTING: its own issue, branch `<issue>-<slug>`, a failing test commit before
the code commit, 100 % lines and regions, `scripts/verify.sh` green, a draft PR. Every Task except
GP-00 waits for Decision #313 and the R0 docs PRs. Rust-only Tasks have no UI screenshot; the
Playwright cases listed are run by the paired `client-programmer` Task.

### R0

**GP-00. Engine examples for the RPG combat docs.**
Outcome: the Given/When/Then examples of this file are in the R0 docs PR as numbered examples, and
the Feedback items are raised on #313.
- [ ] Examples for turn, slots, cooldown, durations, Step, push, Choc, Guard, ejection, rout,
      flight, anti-stall written in rules.md style with coordinates
- [ ] F1 to F63 posted as one comment on #313 (no decision taken alone)
- [ ] Docs only, no code; links to this file

### R1: minimal combat

**GP-01. Crate `abalone-rpg`, ids and state model.**
Outcome: the workspace has an `abalone-rpg` crate with `Unit`, `Entity`, `CombatState` and a stable
`state_hash`.
- [ ] Crate added to the workspace, `abalone-core` dependency only (plus approved crates)
- [ ] Types of 4.1 (R1 fields), canonical encoding, FNV-1a 64 `state_hash`
- [ ] Clippy `disallowed_types` for `HashMap` and `HashSet` in the crate
- [ ] Tests: hash changes when any hashed field changes; equal states give equal hashes

**GP-02. Combat setup and `new_combat`.**
Outcome: a `CombatSetup` JSON builds a valid combat state or a named `SetupError`.
- [ ] `CombatSetup` type and JSON (v1), validation rules of 5.1
- [ ] One test per `SetupError`; hero HP below max kept
- [ ] Uses the core region API (radius board until the mask lands)

**GP-03. Turn loop, solo frieze, slots, mandatory Mouvement.**
Outcome: two entities alternate, each with one Move, one Action, one Quick slot, and `EndTurn` is
refused while a legal Mouvement is unused.
- [ ] `turn.rs` phases of 7.1 (R1 steps), `Slots`, `EndTurn`, `passed_move`
- [ ] `Effect::TurnStarted`, `TurnEnded`; `ActionError::{NotYourTurn, SlotSpent, MustMoveFirst}`
- [ ] Scenarios: free order, mandatory move, pass when no move exists

**GP-04. Mouvement through the weighted push.**
Outcome: a Mouvement is resolved by the core weighted push with Weights from the combat, and an
ejection becomes a Loss.
- [ ] `push.rs` `PushWorld` impl, Weight of 8.2 (base and Mud only in R1), `Pushed`, `Ejected`, `Loss`
- [ ] The six §6.4 examples as scenarios (Percée one waits for GP-19)
- [ ] Combat-level "all Weights 1 = classic" property (8.6), the R1 exit test
- [ ] Depends on `engine-programmer`'s weighted push Task

**GP-05. Damage formula and Choc.**
Outcome: pushes deal the integer Choc of §6.5 with Isolation, Formation and level gap.
- [ ] `formula.rs` of 9.1, table test of 20 rows, worked example = 18
- [ ] Choc of 9.2 after the push; no Choc on ejected units or broadsides
- [ ] Property: Def = K halves the damage at every level

**GP-06. Death, Corpses, Graveyard, atomic loop, Guard.**
Outcome: a unit at 0 HP disappears at once, leaves a Corpse, enters the Graveyard, and a hero never
loses more than 35 % of max HP to one action.
- [ ] Atomic loop of 7.7 (no triggers yet), `Died`, Corpse rule, Graveyard entries
- [ ] Guard per action (9.4 step 7)
- [ ] Scenarios: Tourbillon-like multi-hit stops at victory; Guard capped 42 of 60

**GP-07. Victory: hero death, rout, leader death, no-Loss draw.**
Outcome: a combat ends with an `Outcome` per entity when a hero dies or is ejected, a rout threshold
is reached, a leader dies, or the no-Loss counter runs out.
- [ ] `victory.rs` exits of 11.1, outcome of 11.2, 1 vs 1 tie of 7.7
- [ ] No-Loss counter as data (unit and value), repetition key of 11.6
- [ ] Scenarios: hero ejected at full HP loses; rout at 3; leader death; draw at 60, not at 59

**GP-08. Resource engine and Rage.**
Outcome: entities gain, spend and lose resources by data rules, and the Warrior's Rage follows §8.2.
- [ ] `resource.rs` of 16.1 (per turn, events, decay, clamp, VIT bonus)
- [ ] Rage: +15 per push, +10 big hit, +25 per Loss inflicted, -10 per turn without push
- [ ] `ResourceChanged` effects; tests for each event and the clamp

**GP-09. Ability casting with the Damage primitive.**
Outcome: a player casts a data-defined single-target ability (Fendoir) that pays its cost, starts its
cooldown and deals damage.
- [ ] `ability.rs` types (JSON v1 of 12.1), `ResolvedAbility`, costs, `ready_at` cooldowns (7.4)
- [ ] Targeting `self`, `adjacent`, `target`; range from the hero
- [ ] `prim/damage.rs` with conditions (isolated +50 %)
- [ ] Scenarios: CD 1 and CD 0 examples of 7.8; out of range; not enough Rage

**GP-10. Self displacement and Charge.**
Outcome: the Warrior's Charge moves the hero up to 2 empty cells and Chocs the enemy behind without
pushing it.
- [ ] `prim/displace.rs` mode `self_line` (no push, no ejection, stops at units, Rocs, edge)
- [ ] Choc from an ability (9.2), Rage +20
- [ ] Scenarios: full charge, blocked after 1 cell, no enemy behind

**GP-11. Edge danger and preview.**
Outcome: `edge_danger` and `preview` tell, before confirm, what an action does and which heroes can be
ejected next turn.
- [ ] `edge.rs` (R1 threat set, witness), `preview.rs` (full path, outcome, hero danger after)
- [ ] ux-designer cases A.4 1, 2, 5 (R1 subset) and the soundness property of 10.8
- [ ] Hands e2e to `client-programmer`: glyph shown in the fixture

**GP-12. Notation, scenario files, replay, determinism.**
Outcome: rules are tested from text files, and the same setup and log always give the same hash.
- [ ] `notation.rs`, `scenario.rs` (4.7), all earlier scenarios moved to `.scn` files
- [ ] `replay`, properties of 21.2 (replay = live, refused action keeps the hash)
- [ ] A golden log for the cross-target check (`client-programmer` runs wasm32)

**GP-13. Combat JSON contract v1 (view, actions, effects).**
Outcome: the bridge can ask the engine for a `CombatView`, legal actions and effects as versioned JSON.
- [ ] `view.rs` (ux-designer's `CombatView` v1 fields for R1), JSON of `Action` and `Effect`
- [ ] Round-trip tests; `RULES_VERSION` in every payload
- [ ] Paired with `client-programmer`'s wasm glue and the R1 e2e (play a skirmish to victory)

### R2: four classes, statuses, six cell types

**GP-14. Status engine.**
Outcome: statuses apply, tick on the carrier's turns, stack by rule, and respect diminishing returns
and Tenacity.
- [ ] `status.rs` (13.1, 13.2 R2 rows), `fresh`, `UntilTurnStart`, DoT snapshot
- [ ] DR of 13.3, Tenacity and PvP of 13.4
- [ ] Scenarios of 13.5 (DR, Frozen ARM, Blinded lead, DoT snapshot)

**GP-15. Unmovable, Unejectable, Lassitude.**
Outcome: keywords block pushes and ejections as §6.11 says, inside Mouvements, abilities and terrain.
- [ ] `PushWorld` callbacks `unmovable`, `unejectable`, `selectable`, `can_lead`
- [ ] Ability and terrain stop rule (10.2), Lassitude 2 turns
- [ ] Scenarios: Forteresse push refused, inward push legal, Lassitude refusal

**GP-16. Full damage pipeline, Heal and Shield.**
Outcome: damage goes through redirects, links, shields, Guard, Mana shield, lifesteal and reflect in
the fixed order of 9.4, and heals follow 9.3.
- [ ] `pipeline.rs` steps 1 to 10; `prim/heal.rs`, `prim/shield.rs`
- [ ] Tests of 9.6 (link split, mana shield, heal with Poison and Attrition)

**GP-17. Forced displacement and the ejection budget.**
Outcome: abilities push, pull, teleport and swap units, and an action never ejects more than one unit
unless it is told terrain.
- [ ] Modes push, pull, teleport, swap; `eject.rs` budget, Éjecteur picks, edge Choc, no chains
- [ ] Knockback farthest first, "away" direction rule (12.4)
- [ ] Scenarios of 12.9 (edge, two would-be ejections, Ice slide from ability vs Mouvement)

**GP-18. Zone, line, group and board targeting.**
Outcome: multi-target abilities pick their targets by the §6.10 kinds and resolve them in the fixed
order with the mass control cap.
- [ ] `target.rs` kinds of 12.2, range modifiers, filters, untargetable rules
- [ ] Resolution order 12.6, mass control cap 12.5, Provocation and Insaisissable
- [ ] Scenarios: order, Nova picks, taunt forces the target

**GP-19. Stat change, Resource and Turn primitives; Warrior push kit.**
Outcome: abilities change stats and Weight, grant the one bonus Step per turn, and modify the own
Mouvement (Percée, Bélier, Avalanche, Titan, Écrasement).
- [ ] `prim/stat.rs`, `prim/resource.rs`, `prim/turn.rs`; `Action::Step` and the Step cap (7.6)
- [ ] `PushRules` from abilities (8.3, 17.2 to 17.4); Écrasement target kind
- [ ] The Percée example of §6.4; Avalanche 4 vs 3 with one ejection; Step cap refusal
- [ ] Depends on `engine-programmer`'s 4-unit group support

**GP-20. Mark primitive, tells and channelling.**
Outcome: delayed effects are placed as public tells and fire at their turn, and channels break when the
unit moves.
- [ ] `prim/mark.rs`, `Tell` in the state, `TellPlaced`, `TellFired`; `Channel`, `ChannelBroken`
- [ ] Scenarios: Météore fires at the caster's next turn start; a moved channeller loses its channel

**GP-21. Preparations.**
Outcome: Preparations arm in the Quick slot, fire automatically in the opposing turn, in order, at
most 2, never chained.
- [ ] `prep.rs` of 14.1, events of 14.2, expiry, controlled-owner rule
- [ ] Scenarios of 14.3 (Interposition, no chain, order, expiry, stunned owner)

**GP-22. Passive triggers for the R2 classes.**
Outcome: class traits run from data through one trigger dispatcher with a depth cap.
- [ ] `trigger.rs` (15.1), auras, stacks, depth cap 3
- [ ] Traits of Guardian, Warrior, Healer, Mage (Sentinelle, Élan, Grâce, Lumière accumulée)
- [ ] One scenario per trigger kind used in R2

**GP-23. Terrain primitive and the six R2 cell types.**
Outcome: abilities create timed cells and the six R2 cell types act in the turn as §5.1 says.
- [ ] `prim/terrain.rs` (set, cells selectors, owner, creator's turns)
- [ ] `terrain_rules.rs` for Roc, Gouffre, Glace, Boue, Lave, Fourré (proposal F59)
- [ ] Scenarios: Lava at end of own turn only, Mud Weight, Thicket -50 %, temporary Gouffre ejects

**GP-24. Mage Overheat and elemental reactions.**
Outcome: the Mage's second spell of a turn costs more and two different element states on one unit
react.
- [ ] Overheat cost (17.5), element markers, three reactions, DR on Vapeur
- [ ] Scenarios: each reaction once; Vapeur refused under DR

**GP-25. Attrition, Breach and Flight.**
Outcome: long fights end by Attrition and the Breach on any region shape, and a player can flee a
normal fight.
- [ ] Attrition on heals (11.6), Breach rings on masks with tell 2 and the 19-cell floor
- [ ] Flee of 11.5 (conditions, channel, exit, refusals)
- [ ] Scenarios of 11.8 (Breach, Attrition, flight, flight refused)

**GP-26. Edge danger, R2 threat set.**
Outcome: the alert also sees push modifiers and Éjecteur abilities the opponent can use next turn.
- [ ] Threat set R2 of 10.5; ux-designer cases A.4 3, 4, 6
- [ ] Perf check of the clone count (`client-programmer` measures in wasm)

**GP-27. Ability data validators.**
Outcome: `ability::validate` rejects data that breaks the §24.3 rules.
- [ ] Checks of 12.7, one failing fixture per check
- [ ] Called by `tech-lead`'s data integrity test over `data/`

### R3: progression

**GP-28. Resolved abilities, keystones and placement terrain.**
Outcome: ranks, variants and Aspects arrive resolved, and the R3 keystones run through triggers.
- [ ] `ResolvedAbility` intake from `progression-designer`'s resolver; view shows patched values
- [ ] Triggers missing for the 2 R3 Voies (data from `progression-designer`)
- [ ] Pionnier terrain in `Place`, Grimoire swap action (F50 proposal)

### R4: world v1

**GP-29. Placement, initiative and the combat outcome for the world.**
Outcome: a combat started from a world tile places by formation, plays in the right order and returns
an outcome the world can apply.
- [ ] `Place` action (5.2), `first_camp` and ambush, HP carried in, `Outcome` of 5.4
- [ ] Scenarios: swap hero and Fragment; ambush order; outcome lists Losses for quests

**GP-30. Resume from the action log.**
Outcome: a combat reloaded from its saved setup and log resumes at the same state, or the save is
dropped.
- [ ] Save record of 5.5, replay check, hash check, version check
- [ ] Unit tests for every bad record; e2e handed to `client-programmer` (reload mid-fight)

**GP-31. Biome modifiers for the three R4 biomes.**
Outcome: the R4 biomes' global rules and their extra cell types act in combat.
- [ ] Modifier hooks of 16.3 used by the chosen biomes (Sylve range -1, Tourbières Poison +1)
- [ ] Ronces and Eau (Wet) cell rules
- [ ] Scenarios per modifier

### R7: crafting

**GP-32. Consumables in combat.**
Outcome: a hero uses at most one consumable per turn and three per combat, each one a primitive.
- [ ] `Action::Consumable`, cap 3, the six consumables of §15.4 as data
- [ ] Scenarios: 4th use refused; two in a turn refused

### R8: bosses

**GP-33. Boss hooks in the combat.**
Outcome: bosses get HP phases, a Résilient or Unejectable Heart, enrage, intents and special objectives
from data.
- [ ] `HpBelow` phases, Résilient, `breach_start`, `SetIntent` and binding check, objectives of 11.4
- [ ] Stitched multi-tile region test for rings and seams (with `world-programmer`)
- [ ] Retry from the same setup under 50 ms of engine time (TUNE)

### R9: all classes, all biomes

**GP-34. Assassin support.**
Outcome: combo points, teleports to an enemy, Danse des lames, Insaisissable and Fumigène work from
data.
- [ ] Secondary resource, finishers, teleport filters, ordered picks, Fumigène zone flag
- [ ] One scenario per Assassin ability and its counterplay

**GP-35. Necromancer support.**
Outcome: Corpses and Graveyard entries can be raised once as Revenants that decay, cap at 3 and never
count as Losses.
- [ ] Revive primitive (10.4), Revenant rules, Essence events, Peste, Explosion de cadavre, Sacrifice
- [ ] Scenarios of 10.7 (one raise per entry, Revenant gives no Loss), cap refusal

**GP-36. Chronomancer support.**
Outcome: history snapshots power Retour, Rembobiner, Déjà-vu, Paradoxe, Arrêt du temps and Instant
suspendu.
- [ ] `history.rs` snapshots in the hash, Paradoxe algorithm of 17.7, cooldown shifts, sand debt
- [ ] Scenarios: Paradoxe stuck chain, Retour refused, Instant suspendu once

**GP-37. Geomancer support.**
Outcome: the Geomancer creates, removes and rotates cells, builds a Pont and calls a Séisme.
- [ ] Terrain ops rotate, bridge (region growth), void after a tell; Secousse; Strates gain
- [ ] Depends on `engine-programmer` region growth and rotation
- [ ] Scenarios: Rotation with a Slope, Pont expiry ejects, Séisme multi-ejection

**GP-38. Remaining cell types and the ten biomes.**
Outcome: every §5.1 cell type and every §5.2 global rule acts in combat.
- [ ] Pente, Hauteur, Sables, Évent, Sanctuaire, Corruption, Cristal rules (16.2)
- [ ] Tide, Rockfall, darkness, Vitrified death, Caldeira, Toundra, Dunes modifiers
- [ ] One scenario per cell and per biome rule

### R10: multiplayer

**GP-39. Group fights.**
Outcome: up to 4 players and 4 packs share one board with the frieze, allied blocking, 40 % rout and
a result per player.
- [ ] Frieze of 6, camp callback in the push, group rout, outcome of 11.2
- [ ] Two in-process peers agree on the hash over a 300-action log (`network-programmer` harness)
- [ ] E2E handed over: two tabs, same hash after 20 actions

**GP-40. PvP rules.**
Outcome: duels and arenas use the seed initiative, no level gap, shorter controls and no flight.
- [ ] `rules.pvp` hooks (5.3, 9.1, 13.4, 11.5)
- [ ] Scenarios for each hook

**GP-41. Battle royale rounds with RPG orders.**
Outcome: a battle royale round resolves every player's order in initiative order, part by part, with
fizzles.
- [ ] `round.rs::resolve_round`, partial fizzle, no mandatory Mouvement, chests on cells
- [ ] Order-independence property of the inputs (the result depends only on the state and orders)
- [ ] Scenario: Action fizzles, Mouvement still resolves

Total: 42 Tasks (GP-00 to GP-41).
