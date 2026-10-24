# Classes, abilities and the Five Paths: implementation spec (role `combat-designer`)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, pending). Source of truth:
the validated French gameplay spec (`docs/specs/rpg/plan.fr.md`, same text as the approved plan).
Section numbers like "§8.2" point to that gameplay spec. This file adds no rule of its own on top of
it except where marked PROPOSAL: it says how to build the class kits, the 80 abilities, their ranks
and variants, the class resources and the passive tree, and it lists what is missing or
contradictory (section 16). No code yet: TDD applies from R1 (CONTRIBUTING section 11).

**Tags**, as in `rules.md`: **FINAL** (decided), **TUNE** (starting value, set by the bot ladder and
playtests), **PROPOSAL** (proposed here, an owner confirms). Every number carries one. Short forms
used inside tables and lists:

- `[F]` FINAL, `[T]` TUNE, `[P]` PROPOSAL (a number proposed here; it becomes TUNE once accepted).
- A number copied from the gameplay spec keeps the spec's tag. The spec says "everything is
  PROPOSAL and every number is TUNE unless stated", so copied numbers are `[T]` unless the spec says
  FINAL (for example the hero death rule of §6.6, or "at most 1 ejection per action" of §6.10).
- When a whole table is copied from one spec section, its header line gives the tag once, and only
  the cells proposed here carry `[P]`.

---

## 0. Scope

In scope (this role owns the data, the rules of use and the tests):

- The 8 launch classes (§8.0 to §8.8): weight, multipliers, resource, trait, squad bonus, the 2
  branches, the 10 abilities each (80 abilities in total), their counterplay line.
- Ability ranks R1, R2 and R3, and the 160 R3 variants (§10, §8.0 "Rangs").
- The ability data format: how an ability is written with the 12 primitives of §6.10, its
  targeting, keywords (Éjecteur, Escouade, Finisseur, Canalisation), tell and counter (§6.10,
  §24.3).
- Class resources and their gain, spend, decay and reset rules (§8, §6.1, §6.3, §7.1).
- The active tree (§10): budget of 20 points, tiers, costs 1/1/2, equipment of 4 + 1 abilities.
- The passive tree, the Five Paths (§9): 99 points, keystones, runes, secondary Path, shards, gates,
  shard cap, respec, and the combat effects of every keystone and rune.
- The class rotation data used by the player bot (§24.2, "script de rotation par classe").
- The class side of PvP balance (§19 "Équilibrage"): control durations, Guard, counters.
- The class side of item hooks (§12): Aspects, set bonuses and "+1 rank" affixes are applied as
  ability patches through the same pipeline as ranks.

Out of scope (see "Dependencies" in each section): the combat engine itself (turn loop, weighted
push, damage formula, statuses and their timers, terrain, the interpreter of primitives, ejection
limits, victory), stats growth and XP, monsters and bosses, the world, items and loot tables,
consumables content, the client rendering, P2P sync, PvP formats.

**Role slugs** used for dependencies (assumed names; sibling specs use the same set, the lead maps
them to the real roles):

| Slug | Owns |
|---|---|
| `combat-engine` | `abalone-rpg` core: `CombatState`, `apply_action`, weighted push, damage formula, statuses and durations, terrain layer, interpreter of the 12 primitives, ejection limits, victory, Edge danger computation |
| `stats-progression` | Hero base stats, `g(L)`, class multipliers applied to stats, XP curve, level to point grants |
| `encounter-boss-designer` | Monsters, packs, elite affixes, bosses, monster AI decision layer |
| `ai-engineer` | Search on the combat state, node budgets, the RPG player bot runner, the RPG bot ladder |
| `world-generator` | World map, biome terrain tables, multi-tile boards, biome global rules data |
| `items-loot` | Items, Aspects, sets, affixes, gems, consumables content (with `gathering-crafting`) |
| `economy-merchants` | Gold, respec costs, the Path Master NPC |
| `client-ui` / `ux-designer` | Rendering, action bar, gauges, ability cards, tree windows, Playwright e2e of the client |
| `netcode` | Group P2P lockstep, commit-reveal seeds, action log |
| `pvp-br-designer` | Arenas, normalized template, battle royale |
| `tech-lead` | Crates, data format (RON or JSON), loader, determinism rules, WASM bridge, MCP |
| `narrative-quest-designer` | Lineage lore, the level-5 lineage trial quest, ability flavour text |

Sibling specs call this role `class-designer`: same owner.

---

## 1. Inputs read

- Gameplay spec, every section; in detail §1, §5.1, §5.2, §6 (all), §7, §8 (all), §9, §10, §11,
  §12 (Aspects, sets, affixes), §15.4, §18, §19, §24, §25, §26.
- `docs/specs/rules.md` §5 (sumito, one ejection per move), §7 (pass rule), §10 intro ("a mode
  never changes a move or a push", changed by Decision #313), §12 (Given/When/Then format).
- `docs/specs/game-design.md` §1 (pillars, replaced by §1 of the gameplay spec), §5 (anti-stalling).
- `docs/specs/tech.md` §3 (pure core, `Effects` as the only engine to renderer channel, `Ruleset`
  hooks), §10 (CI, coverage).
- `docs/specs/boss-balance.md` (ladder method: 7 to 9 wins of 10, never 10 of 10), `mcp.md` §4
  (`legal_moves`, `get_state`).
- `CONTRIBUTING.md` §5 (Ready and Done), §11 (strict TDD, 100 % line and region coverage, Playwright).
- Sibling role specs in `docs/specs/rpg/roles/` (`encounter-boss-designer.md` §17 "Interactions
  with class kits", `ux-designer.md` §4 action bar and §7 gauges) to stay consistent.
- Code: `crates/abalone-core/src/moves.rs` (`Move { cells, dir }`, `MoveError::NotStrongEnough`,
  `legal_moves` scans `-MAX_RADIUS..=MAX_RADIUS`), `board.rs` (`HashMap` cells, `MAX_RADIUS = 5`),
  `game.rs` (`history`, repetition), `search.rs` (node budget), `encounter/telemetry.rs`.

What the code tells this spec:

1. `apply` returns `(Board, bool)`: one ejection flag per move. The RPG keeps "at most 1 ejection
   per action" (§6.10, FINAL proposed) so every class rule here is written to need no more than
   one ejection per action, except terrain with a tell of 2 or more (Séisme, Pont, §6.10 rule 2).
2. `MoveError::NotStrongEnough` already exists. Push modifiers (Percée, Bélier, Avalanche, Titan)
   are written as **inputs to the push rule** (`PushContext`), never as a second move generator, so
   `combat-engine` keeps one validator.
3. `game.rs` keeps a move history, not position snapshots. The Chronomancer (§8.7) needs positions
   at the start of past entity turns: section 3.6 asks `combat-engine` for a bounded snapshot ring.

---

## 2. Conventions used by every section

- **Integers only** (§24.1, FINAL). Ratios and percentages are basis points (bp, 10 000 = 100 %).
  Multiply in the order written, floor after each multiplication. Resources are integers.
- **Ids.** Every content id is an English, lowercase, dotted string: `class.warden`,
  `ability.warrior.cleave`, `path.precision.keystone.lethal_tempo`. Display names come from i18n
  keys (French names of the gameplay spec are the `fr` strings). This also removes the name
  collisions listed in section 16 (F25).
- **English names used below** (PROPOSAL, display only): Gardien = Warden, Guerrier = Warrior,
  Assassin = Assassin, Guérisseur = Healer, Mage = Mage, Nécromancien = Necromancer, Chronomancien
  = Chronomancer, Géomancien = Geomancer. Resources: Rempart = Bulwark, Rage, Énergie = Energy (+
  combo points), Foi = Faith, Mana (+ Overheat), Essence, Grains de sable = Sand, Strates = Strata.
  Paths: Précision = Precision, Domination, Sorcellerie = Sorcery, Volonté = Resolve, Inspiration.
- **Data** (§1 pillar 6, §24.3): everything below is data under `data/`, loaded with `include_str!`
  (`tech-lead` owns the loader). Examples are RON; if `tech-lead` picks JSON the fields stay the
  same.
- **Files** (all new):

| File | Content |
|---|---|
| `data/classes/<class>.ron` | `ClassDef`: weight, multipliers, resource, trait, squad bonus, branches |
| `data/abilities/<class>.ron` | 10 `AbilityDef` per class, with R2 and the two R3 variants |
| `data/paths/<path>.ron`, `data/paths/shards.ron` | Keystones, runes, shards, per-rank values |
| `data/rotations/<class>.ron` | Player bot priority list per class (consumed by `ai-engineer`) |
| `crates/abalone-rpg/src/kit/mod.rs` | `ClassDef`, `ResourceDef`, `TraitDef`, `SquadBonus` |
| `crates/abalone-rpg/src/kit/ability.rs` | `AbilityDef`, `Targeting`, `Keyword`, `Cost`, `Duration`, `RankUp`, `Variant`, `Patch` |
| `crates/abalone-rpg/src/kit/compile.rs` | `Loadout` + items → `CompiledKit` (patched abilities, passives) |
| `crates/abalone-rpg/src/kit/resource.rs` | `ResourceState`: gain, spend, decay, combo, overheat, sand debt |
| `crates/abalone-rpg/src/kit/cast.rs` | `can_cast`, `legal_casts`, cost and cooldown bookkeeping |
| `crates/abalone-rpg/src/kit/trigger.rs` | Event-driven passives: traits, keystones, runes, set bonuses |
| `crates/abalone-rpg/src/kit/special/*.rs` | One file per native mechanic (section 3.6) |
| `crates/abalone-world/src/talents/active.rs` | Active tree validation (§10) |
| `crates/abalone-world/src/talents/passive.rs` | Five Paths validation (§9) |
| `crates/abalone-rpg/tests/kits/<class>.rs` | One scenario test per ability, rank and variant |
| `crates/abalone-rpg/tests/scenarios/kits/<class>/<ability>.ron` | Scenario files (section 2.1) |
| `crates/abalone-rpg/tests/kit_integrity.rs` | Content integrity (section 14) |
| `crates/abalone-world/tests/talents.rs` | Budget and gate tests |

### 2.1 Scenario format (shared by every test below)

Every rule is "a start position and a list of actions" (§1 pillar 4). Scenario files make the 240
ability tests (80 abilities × R1, R2 and the R3 variants counted per variant) cheap to write:

```ron
Scenario(
  name: "warrior cleave on an isolated ball",
  board: Radius(3),
  terrain: [],                                   // (q, r, kind, turns)
  units: [
    Unit(id: 1, entity: 0, kind: Hero(class: "class.warrior", level: 1), at: (0, 0)),
    Unit(id: 2, entity: 1, kind: Monster("monster.drifter_shell", Normal, level: 1), at: (1, 0)),
  ],
  resources: [(entity: 0, value: 25)],
  loadout: (entity: 0, abilities: [("ability.warrior.cleave", rank: 1, variant: None)]),
  actions: [ Cast(entity: 0, ability: "ability.warrior.cleave", target: Unit(2)) ],
  expect: [ Hp(unit: 2, eq: 58), Resource(entity: 0, eq: 0), Cooldown(entity: 0,   // 84 − 26, illustrative
            ability: "ability.warrior.cleave", eq: 1) ],
)
```

The runner (`kits/runner.rs`, shared helper) builds the `CombatState` through `combat-engine`'s
test builder, applies actions with `apply_action`, and checks each expectation. A failing
expectation prints the unit, the expected and the actual value. Expected numbers depend on the
damage formula order of §6.5 (owned by `combat-engine`), so the worked numbers in this file are
**illustrative** until that order is merged; the tests pin them then.

### 2.2 Coverage and test levels

- Unit: every function of `kit/` and `talents/`, every branch (`can_cast` error variants, every
  `Patch` kind, every resource rule).
- Scenario: one file per ability at R1, one per R2, one per R3 variant (80 + 80 + 160 = 320
  scenario files at R9; 40 at R2, 160 at R3 for the 4 first classes). PROPOSAL.
- Property: (a) every generated `legal_casts` entry is accepted by `apply_action`; (b) no ability
  cast ejects more than 1 ball unless it is terrain with a tell of 2 or more (FINAL rule of §6.10,
  checked on random positions); (c) no resource ever leaves `[min, max]`; (d) compiling a kit twice
  gives the same `CompiledKit` hash.
- Integrity: section 14.
- Ladder: each class beats the reference pack (R2, R9 exit criteria of §25), run by `ai-engineer`.
- Playwright e2e (player-facing): section 15 lists one flow per class and per tree window.
- Coverage gate: 100 % line and region on `kit/` and `talents/` (CONTRIBUTING §11, FINAL).

---

## 3. The ability language as data (§6.3, §6.10, §6.11, §8.0 "Lire une capacité")

### 3.1 `AbilityDef`

```rust
pub struct AbilityDef {
    pub id: AbilityId,               // "ability.warrior.cleave"
    pub class: ClassId,
    pub branch: Branch,              // A or B (Bastion/Represailles, Assaut/Brute, ...)
    pub slot: u8,                    // 1..=8 as numbered in §8, or 0 for the branch ultimate
    pub ultimate: bool,
    pub kind: Kind,                  // Action | Quick | Prepare  (§6.3)
    pub cost: Cost,                  // main resource, plus combo for finishers
    pub cooldown: u8,                // entity turns (§6.3 "Recharge N")
    pub once_per_fight: bool,        // Paradoxe, Arrêt du temps
    pub range: Range,                // Self_ | Adjacent | Cells(u8) | Board
    pub origin: Origin,              // Hero (default, §6.9) | Squad (keyword "Escouade")
    pub targeting: Targeting,        // see 3.2
    pub keywords: Vec<Keyword>,      // Ejector, Finisher, Generator(u8), Channel, MassHardControl
    pub element: Option<Element>,    // Fire, Frost, Lightning, Shadow, Light, Time (§6.5 tags)
    pub tell: Option<u8>,            // turns before the effect resolves (Météore 1, Séisme 2)
    pub effects: Vec<EffectSpec>,    // in resolution order
    pub counter_key: String,         // i18n key, required (§6.10, §24.3)
    pub rank2: RankUp,               // EffectBp(2500) | CooldownMinus1 | CostMinus(u8) (see 6.2)
    pub variants: [Variant; 2],      // R3 A and B: id + Vec<Patch> + description key
}
```

- `kind` decides the slot (§6.3): Action uses the Action slot, Quick uses the Quick action slot,
  Prepare uses the Quick action slot and arms a reaction. **An ultimate uses the slot of its kind**
  (PROPOSAL, fixes F3: Titan and Martyr are typed Rapide while §6.3 says "Action ... ou l'ultime").
- `cost.combo` is only used by Assassin finishers (Assassinat costs 60 Energy **and** 5 combo, §8.3).
- `origin = Squad`: range is measured from any own ball (§6.9). No ability of §8 carries the
  keyword (F14); it is kept for Aspects and v2 classes.

### 3.2 Targeting (§6.10 "Ciblage")

```rust
pub enum Targeting {
    Self_,                                   // the hero
    Unit { side: Side, filter: Vec<Filter> },// a ball within range (no line of sight, §6.10)
    Cell { filter: CellFilter },             // a cell within range (empty, any, special, dépouille)
    Line { side: Side, stop: Stop },         // along one of the 6 directions from the hero
    Area { radius: u8, center: Center },     // Center::Hero or Center::Cell(range)
    Group,                                   // 1 to 3 aligned balls (rarely used)
    Board,                                   // whole board
    Cells { count: u8, shape: Shape },       // Shape::Line (aligned) | Shape::Any
    Entity,                                  // an enemy entity (Arrêt du temps)
}
pub enum Side { Ally, Enemy, Any }
pub enum Stop { FirstBall, FullLine }        // FullLine: Secousse (F17)
```

`Side::Ally` means **any ball of the caster's camp**, including another player's balls in a group
fight (PROPOSAL, F9). Heroes of another entity are valid ally targets except where an ability says
"own" (Hâte, section 8.7).

`legal_casts(state, entity) -> Vec<Cast>` enumerates, for each equipped and ready ability, every
legal target in the fixed order (cells by `r` then `q`, units by id, §24.1). Used by the client
(highlight), the bot, MCP (§24.6) and the Edge danger alert (section 3.7).

### 3.3 Effects: the 12 primitives (§6.10) and their parameters

| # | Primitive | `EffectSpec` variant and fields |
|---|---|---|
| 1 | Damage | `Damage { kind: Physical|Magical|Pure, base, ratio_bp, stat: Atk|Pow|TargetMaxHp|OriginMaxHp, bonus_if: Vec<(Cond, bp)> }` |
| 2 | Heal | `Heal { base, ratio_bp, stat, overflow: Discard|ShieldCap(bp) }` |
| 3 | Shield | `Shield { base, ratio_bp, stat, turns }` |
| 4 | Forced move | `Move { how: Push|Pull|Teleport|Swap|Slide|Recoil|Return(Snapshot), cells: u8, dir: DirRule }` |
| 5 | Stat mod | `StatMod { stat, delta_bp_or_flat, duration }` (Weight is a stat, bounded 1..=5) |
| 6 | Status | `Status { id, duration }` (§6.11 list) |
| 7 | Terrain | `Terrain { kind, cells: Shape, duration, only_empty: bool }` |
| 8 | Summon | `Summon { def, at }` (none in the 80; kept for v2 Artificer) |
| 9 | Raise | `Raise { from: Remains|Ejected|AnyEntry, hp_bp, at: OnRemains|EdgeWithin(u8)|Nearest }` |
| 10 | Mark | `Mark { cell_or_unit, fires: OnCasterTurnStart|OnEnemyTurnEnd|OnEvent(Event), then: Vec<EffectSpec> }` |
| 11 | Resource | `Resource { who: Caster|Target, delta, steal: bool }` |
| 12 | Turn | `Turn { BonusStep | RestrictTurn{only_move: bool, freeze_timers: bool} | Cooldowns{delta, which} | PushRule(PushMod) | Prepare(Trigger) }` |

`Cond` (used by `bonus_if` and by "if" clauses): `TargetIsolated`, `TargetHpBelow(bp)`,
`TargetHasStatus(id)`, `TargetIsHero`, `TargetOnEdge`, `TargetKilled`, `CasterHpBelow(bp)`,
`CasterHpAbove(bp)`, `HeroInGroup`. Small closed set, one test each.

**Native mechanics** (section 3.6) are effects that change a core rule (push, history, board shape).
They are filed under the closest primitive so the "12 primitives" count of §6.10 holds, and each one
is a named Rust function with its own tests (F2 asks the owners to accept this mapping).

### 3.4 Durations (§6.3 "Durées", §6.11)

```rust
pub enum Duration {
    BearerTurns(u8),        // "N tours": until the end of the bearer's N-th turn
    UntilCasterNextTurn,    // "jusqu'à ton prochain tour": ends at the start of the caster's next turn
    ThisTurn,               // "ce tour" (Percée, Bélier, Avalanche)
}
```

**Rule for statuses applied to a ball during its own entity's turn** (PROPOSAL, fixes F1, the most
important gap of this file): the turn in which the status is applied does not count.
`BearerTurns(n)` stores `applied_on_own_turn: bool`; the end-of-turn decrement of §6.3 step 2 skips
it once. Without this rule, every self buff of "1 tour" (Forteresse, Aube, Cri de guerre, Peau de
fer at 2 turns loses half) expires before the opponent plays. Enemy statuses are unchanged: a Gelé
"1 tour" applied during my turn ends at the end of the target's next turn, as §6.3 says.

### 3.5 Cast validation (`kit/cast.rs`) (§6.3, §6.11, §7.1)

`can_cast(state, entity, ability, target) -> Result<(), CastError>`, checked in this fixed order
(each a unit test):

1. `NotEquipped`, `OncePerFightUsed`, `OnCooldown`.
2. `SlotUsed` (Action or Quick action already spent this turn; Prepare also needs fewer than 2
   armed, §6.3 "2 armées au maximum").
3. `HeroCannot` (hero Stunned, Frozen, in Stase or Silenced, §6.11; a Rooted hero can still cast).
4. `NotEnoughResource` (cost after Overheat, Grêle de lames, Surcharge, set bonuses; combo for
   finishers).
5. `OutOfRange`, `BadTarget` (filters, Fumigène zones, Taunt forcing, Stase untargetable,
   Insaisissable dodge is **not** a cast error, it is resolved by the engine).
6. `NoEffect` for abilities that require a change (Retour onto an occupied cell refunds instead,
   §8.7; Transfert needs 2 movable allies).

On success the engine pays the cost, sets the cooldown, marks the slot, then interprets `effects`.

**Cooldowns.** `cooldown_after = max(min_cd, base − rank2_cd − haste_steps)` where
`haste_steps = min(2, haste / 25)` applies only if `base − rank2_cd ≥ 3` and never on ultimates
(§7.1). `min_cd = 1` when Haste applies, else 0 (§7.1 "au moins 1 tour"). Order: base, R2, R3
patches, item patches, then Haste. All [P] except the Haste numbers (25, −2, ≥3) which are [T] §7.1.

**Silence and consumables.** Silence blocks abilities and Preparations, not consumables (§6.11
says "aucune capacité"; consumables are not abilities). PROPOSAL.

### 3.6 Native mechanics (`kit/special/*.rs`)

Each is a pure function `fn(&CombatState, &Cast) -> Result<Vec<Delta>, CastError>` reviewed by
`combat-engine`, with its own unit tests. Mapping to the 12 primitives in brackets.

| File | Used by | What it changes | Needs from `combat-engine` |
|---|---|---|---|
| `push_mod.rs` [Turn] | Percée, Bélier, Avalanche, Titan, Croc-en-jambe, Cri de guerre, Roc inébranlable, Bourreau du bord | Adds a `PushMod` to the entity's `PushContext` for this turn or a duration | `PushContext { allow_equal_count, extra_push_weight, max_group: 3|4, resist_bonus }` read by the weighted push rule |
| `crush.rs` [Damage] | Écrasement | Damage on a blocked file without moving it | `push_shape(group, dir)` returning the file and the blocker kind |
| `history.rs` [Forced move] | Retour, Rembobiner, Paradoxe, Déjà-vu | Reads positions or HP at the start of a past entity turn | A ring of `Snapshot { entity_turn, positions: Vec<(UnitId, Coord)>, hp: Vec<(UnitId, u32)> }`, last 2 turns per entity, included in the state hash |
| `redirect.rs` [Status] | Interposition, Lien vital, Martyr, Retour de souffrance, Bouclier de mana | Damage routing before HP loss | A damage pipeline hook, order fixed in section 3.8 |
| `rotate.rs` [Terrain + Forced move] | Rotation | Rotates 7 cells by 60° with balls, terrain, slope directions | Terrain layer API `rotate_hex(center, steps)` |
| `bridge.rs` [Terrain] | Pont | Adds a temporary cell beyond the edge or fills a Gouffre | Board region mask (§24.2) with temporary cells |
| `time_stop.rs` [Turn] | Arrêt du temps, Lenteur | Restricts a turn, freezes or adds cooldowns | `TurnRestriction` on the entity, cooldown write access |
| `raise.rs` [Raise] | Relever les morts, Rappel du vide, Armée des morts, Peste | Graveyard to Revenant | Graveyard API (§6.6), Revenant flags (no Loss, no Remains) |
| `blade_dance.rs` [Forced move + Damage] | Danse des lames, Assassinat, Pas de l'ombre | Teleport chains next to targets | `free_neighbours(cell)` in fixed order |
| `resonance.rs` [Status] | Mage trait | Element states and reactions | Status add hook (section 8.5) |
| `suspend.rs` [Status] | Chronomancer trait "Instant suspendu" | Cancels an ejection once per fight | An "ejection about to happen" hook in the push resolution (section 8.7) |

### 3.7 Edge danger and push modifiers (§6.6 alert)

The alert is computed by `combat-engine` with `legal_moves` (§6.6). Push modifiers change which
pushes are legal, so a Warrior with Percée ready and affordable threatens more cells than
`legal_moves` alone shows. PROPOSAL (F11): `AbilityDef` with a `Turn::PushRule` effect exposes
`push_threat() -> Option<PushMod>`; the alert also runs the push rule with each castable modifier of
the opposing entities. Damage abilities are ignored (the alert is about ejection).

### 3.8 Damage routing order (§6.5, §6.6, §8.4, §8.5)

When a ball would take damage after the §6.5 formula, the engine applies, in this fixed order
(PROPOSAL, F10):

1. **Insaisissable dodge** (single-target ability only, §6.11).
2. **Interposition** retarget (Prepare, the hero takes the hit instead).
3. **Martyr** redirect to the Healer hero at −50 % (`[T]` §8.4).
4. **Lien vital** split 50/50 (`[T]`), floor to the linked ally, remainder to the hit ball.
5. **Marked** (+X %), **Retour de souffrance** reflection computed on the final amount.
6. **Hero Guard** (35 % of max HP per ability, `[T]` §6.5) per hero receiving damage.
7. **Shields**, oldest first.
8. **Bouclier de mana** (2 HP = 1 mana, `[T]` §8.5), then HP.
9. **Lifesteal** and **Siphon** heal on the damage actually dealt (after shields, before mana).

Usure (§6.7) reduces heals, not shields (PROPOSAL). Each step is one unit test plus one combined
scenario (Martyr + Lien vital + Guard on the same hit).

### Dependencies (section 3)

`combat-engine` (interpreter, `PushContext`, snapshot ring, damage hooks, statuses with the
duration rule of 3.4), `tech-lead` (loader, RON vs JSON, id format), `client-ui` (targeting from
`legal_casts`), `ai-engineer` (`legal_casts` in search), MCP owner via `tech-lead` (§24.6).

### Tests (section 3)

- Given an `AbilityDef` with no `counter_key`, When the integrity test runs, Then it fails naming
  the id.
- Given a Warrior who already used his Action, When he casts Fendoir, Then `CastError::SlotUsed`.
- Given Titan (kind Quick, ultimate), When the Warrior casts it then Fendoir in the same turn, Then
  both are accepted (ultimate uses its kind's slot).
- Given Forteresse cast on the Warden's turn (all allies Inéjectable 1 turn), When the enemy pushes
  an allied ball to the edge during its next turn, Then the push that would eject is illegal; When
  the Warden's next turn ends, Then Inéjectable is gone and Lassitude (2 turns) is present.
- Given Haste 50 and an ability with base cooldown 4 and R2 −1, Then cooldown after cast is 1;
  Given Haste 50 and base 2, Then 2 (Haste needs ≥ 3).
- Property: random positions, every `legal_casts` entry applies without error.

### Risks and open points (section 3)

- The native mechanics are where bugs live; each gets its own file and 100 % coverage.
- Snapshot ring size: 2 turns per entity is enough for every ability (Retour reads the previous
  turn, Rembobiner "ton tour précédent", Paradoxe "ton tour précédent"). PROPOSAL.

---

## 4. Class model and resources (§8.0, §6.1, §6.3, §7.1)

### 4.1 `ClassDef`

```ron
Class(
  id: "class.warrior",
  weight: 3,                                         // [T] §8.0
  multipliers: (hp: 11500, atk: 13000),              // bp, [T] §8.0; missing = 10000
  vit_flat: 0,                                       // Assassin +5, Chronomancer +3 [T]
  resource: "resource.rage",
  trait_: "trait.warrior.momentum",
  squad: [ StatMod(stat: Atk, bp: 1000) ],           // Fragments +10 % ATQ [T] §8.2
  branches: (a: "branch.warrior.assault", b: "branch.warrior.brute"),
  affinity_biomes: ["biome.iron_ridges", "biome.caldera"],   // §5.2
  difficulty: 1,
)
```

Class multipliers are applied by `stats-progression` (it owns the stat builder); this role owns the
numbers in `data/classes/`.

### 4.2 `ResourceDef` and `ResourceState`

```ron
Resource(
  id: "resource.rage", min: 0, max: 100, start: 0,
  per_turn: 0,
  gains: [
    (on: PushSucceeded,              amount: 15),     // [T] §8.2
    (on: HeroLostHpInOneHit(1000),   amount: 10),     // ≥ 10 % max HP in one hit [T]
    (on: LossInflicted,              amount: 25),     // [T]
    (on: TurnEndedWithoutPush,       amount: -10),    // [T]
  ],
  scaling: Percent,          // Percent | Charges (Sand: VIT, affinity and rune % never apply)
)
```

- **Turn gain** happens at "Début du tour" step 1 (§6.3), then cooldowns −1 (step 2).
- **Gain multipliers** (Percent resources only): `gain = floor(amount × (10 000 + vit_bp +
  affinity_bp + rune_bp − biome_malus_bp) / 10 000)`. `vit_bp = 100 × floor((VIT − 10) / 2)` when
  VIT > 10 (`[T]` §7.1); `affinity_bp = 1000` on an affinity biome (`[T]` §5.2). Only **positive
  gains** are scaled; spends and decays are not (PROPOSAL).
- **Reset** (§6.1 "remises à zéro"): at fight end the resource returns to `start`, not to 0
  (PROPOSAL, F6: the Healer starts at 50 and the Mage at 100).
- **Missing start values** (F5): Rage 0, Energy 100, Strata 30. All `[P]`.

| Class | Resource | Min..Max | Start | Per turn | Event gains (all `[T]` from §8 unless `[P]`) |
|---|---|---|---|---|---|
| Warden | Bulwark | 0..100 | 0 | +5 | +10 per allied ball damaged or pushed, **max +30 per enemy action** `[P]` (F7); never decays |
| Warrior | Rage | 0..100 | 0 `[P]` | 0 | +15 per successful push; +10 if the hero loses ≥ 10 % max HP in one hit; +25 per Loss inflicted; −10 at end of a turn with no push |
| Assassin | Energy + combo | 0..100, combo 0..5 | 100 `[P]`, combo 0 | +30 (unscaled, "fixe") | combo from generators; finishers spend all combo |
| Healer | Faith | 0..100 | 50 | +15 | none |
| Mage | Mana | 0..150 | 100 | +10 | Overheat: each spell after the first in the same turn costs +50 % per previous spell (cumulative, `[P]` reading of §8.5) |
| Necromancer | Essence | 0..100 | 0 | +5 | +20 per Loss on the board (any camp, not Revenants); +10 per own Fragment lost (squad trait); Pacte de sang +20 |
| Chronomancer | Sand | 0..6 charges | 2 | +1 | +1 more if no ability was cast this turn (Preparations count as abilities, consumables do not `[P]`); "Debt": spending more than 4 in one turn gives −2 at the next turn start |
| Geomancer | Strata | 0..100 | 30 `[P]` | +10 | +5 per own ball on a special cell at turn start (special = any terrain other than Normal, section 8.8) |

**Pacte de sang** (Necromancer, §8.6) is an innate Quick action, not one of the 10 abilities and not
in a bar slot (F8). Data: `innate: ["ability.necromancer.blood_pact"]` on the class. It costs 10 %
max HP (`[T]`), is refused when the hero has 10 % HP or less (PROPOSAL: a self-kill would lose the
fight), and is not reduced by the Guard (self cost, not damage).

### Dependencies (section 4)

`stats-progression` (stat builder applies multipliers), `combat-engine` (events `PushSucceeded`,
`LossInflicted`, `HeroLostHpInOneHit`, `TurnEndedWithoutPush`, special-cell query), `world-generator`
(affinity biome of the board), `client-ui` / `ux-designer` (gauges, section 7 of `ux-designer.md`).

### Tests (section 4)

- Given a Warrior with Rage 0, When his Move pushes an enemy file, Then Rage is 15; When his next
  turn ends without a push, Then Rage is 5.
- Given a Warden at Bulwark 0 and an enemy push that moves 3 allied balls and Shocks them, Then
  Bulwark is 30 (cap per enemy action), not 60.
- Given a Mage with 100 mana who cast Trait de feu (20), When she casts Clignement (25) in the same
  turn, Then it costs 37 (25 × 1.5, floor) and mana is 43.
- Given a Chronomancer who spent 6 sand this turn, When her next turn starts, Then she gains +1 and
  loses 2 (sand = 0, floor at min).
- Given an Assassin with VIT 20, When her turn starts, Then Energy gain is exactly 30 (unscaled).
- Given a Necromancer at 9 % HP, When she uses Pacte de sang, Then `CastError::HeroCannot`.
- Given a fight that ends, Then each resource equals its `start`.

### Risks (section 4)

- Bulwark starts at 0 and the cheapest Warden ability costs 15: the Warden casts nothing on turn 1
  unless ambushed. Kept as written (`[T]` §8.1); the R2 ladder decides (risk R-1).
- Assassin: Energy +30 fixed and max 100 makes Surcharge (section 13) give a free ability almost
  every turn (risk R-6).

---

## 5. Weighted push and the class push modifiers (§6.4, §8.1, §8.2, §8.3, §9.2)

The weighted push rule itself (`n > m` AND strictly greater total Weight AND free cell after the
file, FINAL validated decision) belongs to `combat-engine`. This role owns the **modifiers** a class
or a rune feeds into it, through one value:

```rust
pub struct PushMod {
    pub allow_equal_count: bool,   // Percée: n = m allowed, Weight must still be strictly greater
    pub extra_push_weight: u8,     // Bélier +2, counted on the pushing group only
    pub max_group: u8,             // 3, or 4 with Avalanche (file still at most 3)
    pub shock_bp: u32,             // Élan +50 %, Avalanche ×2, Titan +100 %, Bélier B
    pub resist_weight: u8,         // Roc inébranlable +2, counted only when resisting
    pub requires_hero_in_group: bool,
    pub expires: Duration,         // ThisTurn for Percée, Bélier, Avalanche; BearerTurns(2) for Titan
    pub uses: Option<u8>,          // Some(1): "ta prochaine poussée" (Percée, Bélier)
}
```

| Source | Modifier (numbers `[T]` from the spec section in the first column) |
|---|---|
| Percée §8.2 | `allow_equal_count`, `uses = 1`, `ThisTurn` |
| Bélier §8.1 | `extra_push_weight = 2`, `requires_hero_in_group`, `uses = 1`, `ThisTurn` |
| Avalanche §8.2 | `max_group = 4` (inline only), file ≤ 3, `shock_bp = 20 000` (×2), `ThisTurn`, at most 1 ejection (FINAL §6.10) |
| Titan §8.2 | hero Weight set to 5, hero Inamovible, `shock_bp = +10 000` on balls the hero pushes, `BearerTurns(2)` |
| Élan trait §8.2 | `shock_bp = +5 000` when the hero is the head of the group, permanent |
| Croc-en-jambe §8.3 | target Weight −2 (min 1) for 1 turn (a `StatMod`, not a `PushMod`) |
| Cri de guerre §8.2 | enemies in radius 2 Weight −1 for 1 turn (`StatMod`) |
| Peau de fer §8.2, Glyphe de pierre §8.8 | Weight +1 for 2 turns (`StatMod`) |
| Roc inébranlable §9.2 | `resist_weight = 2` (`floor(2 × (5 + r) / 10)` by rank, section 13.3) |
| Bourreau du bord §9.2 | hero Weight +1 per ejection caused, max +2, cap 5 |

Rules (PROPOSAL unless marked):

- Weight is always clamped to 1..=5 (`[T]` §6.11), after all mods, per ball.
- **Lest vs VIT** (§7.1, −3 VIT per Weight above class base) applies only to Weight from items, never
  to combat buffs (F20). Otherwise Titan would make the Warrior slow for the next fight's
  initiative.
- Percée and Avalanche do not stack into "4 against 4": Avalanche caps the file at 3 (§8.2).
- **Écrasement** is an Action, not the Move (F12): the hero must be in an inline group that
  satisfies `n > m` (or `n = m` with Percée) and the Weight rule, and the cell after the file must be
  blocked (own-camp ball of the target, Roc, Inamovible ball; not off-board). Nothing moves. The
  **last ball of the file** (the one pressed against the blocker) takes 150 % ATQ (`[T]`), physical.
- **Charge** (§8.2) is a self-move: no push, no Élan, no Rage from "push" (it gives its own +20).
  Its Choc is a 100 % ATQ physical hit (`[T]`).
- Shock: the `shock_bp` values multiply the §6.5 Shock (100 % head, 50 % others) in the fixed order
  Élan, Titan, Avalanche, item affixes. Example: Warrior L1 heading an Avalanche: 100 % × 1.5 × 2 =
  300 % ATQ on the first ball (illustrative).

### Dependencies (section 5)

`combat-engine` (push validator reads `PushContext`; `MoveError::NotStrongEnough` reused; Shock
multipliers), `ux-designer` (preview "2 contre 2 · Poids 4 contre 2 · Percée").

### Tests (section 5)

From §6.4, each as a scenario (and the six cases also go into `rules.md` §10.5 via `combat-engine`):

- Given Warrior (W3) + Fragment (W1) inline against two Fragments (W2), When Percée is active and
  the group pushes, Then the push is legal (2 = 2, 4 > 2) and Percée is consumed; When a second
  push is tried in the same turn (impossible: one Move) — instead, Given Percée cast and no push this
  turn, Then at the next turn start Percée is gone.
- Given Warrior + Fragment against a Warden alone on Mud (W 3 + 1 = 4), When Bélier is active (+2),
  Then 2 > 1 and 3 + 1 + 2 = 6 > 4: legal.
- Given Bélier active and a group of 3 Fragments without the hero, Then the bonus does not apply.
- Given Avalanche, When a 4-ball inline group pushes a file of 3 with the last on the edge, Then the
  last ball is ejected, the others shift, the first ball of the file takes Shock ×2.
- Given Écrasement on a file of 1 against a Roc, Then nothing moves and the enemy loses 150 % ATQ
  after mitigation; Given the cell after the file is off-board, Then `CastError::BadTarget`.
- Given Titan active and an enemy group of 3 Fragments (W3) against the Warrior hero (W5,
  Inamovible), Then the push is illegal (Inamovible).

### Risks (section 5)

- Avalanche makes `legal_moves` generate 4-ball groups: `combat-engine` must keep this behind the
  `max_group` flag so `Classic` perft stays identical (FINAL invariant §6.4).

---

## 6. Ranks, variants and the active tree (§10, §8.0 "Déblocage" and "Rangs")

### 6.1 Points and gates (validation in `abalone-world/src/talents/active.rs`)

```rust
pub struct ActiveTree { pub class: ClassId, pub learned: Vec<(AbilityId, Rank, Option<VariantId>)> }
pub enum Rank { R1, R2, R3 }
pub struct Equipped { pub slots: [Option<AbilityId>; 4], pub ultimate: Option<AbilityId> }
fn validate_active(tree: &ActiveTree, eq: &Equipped, level: u8) -> Result<(), TalentError>
```

| Rule | Value | Tag |
|---|---|---|
| Points available | `floor(level / 5)`, so 20 at level 100 | `[T]` §10 |
| Cost R1, R2, R3 | 1, 1, 2 (an ability at R3 has cost 4 in total) | `[T]` §10 |
| Tier 1 (abilities 1, 2, 5, 6) | level ≥ 5 | `[T]` §8.0 |
| Tier 2 (abilities 3, 4, 7, 8) | level ≥ 15 **and** ≥ 2 points in that branch, counted on the **other** abilities of the branch | level and 2 `[T]`; the counting rule `[P]` (F13) |
| Ultimate | level ≥ 30 **and** ≥ 4 points in that branch, counted on the branch's non-ultimate abilities | `[T]` / counting `[P]` |
| R2 needs R1, R3 needs R2 | — | `[P]` |
| Variant | exactly one of A or B when R3; switch for free at the hub | `[T]` §10 |
| Equipment | 4 non-ultimate slots + 1 ultimate slot, only learned abilities, no duplicate, changed out of combat only | `[T]` §10 |
| Reset (all points) | paid, at the hub; price owned by `economy-merchants` | `[T]` §10 |

`TalentError`: `NotEnoughPoints`, `TierLocked{needed_level, needed_branch_points}`,
`RankOrder`, `VariantMissing`, `VariantOnLowRank`, `WrongClass`, `NotLearned`,
`DuplicateEquip`, `UltimateInNormalSlot`. One test per variant.

Check of the §10 Warrior example (it must pass as a fixture): levels 5, 10, 15 Charge, Fendoir,
Percée (Assault = 3, Percée is tier 2 and sees 2 other points); 20 Charge R2 (Assault = 4); 25
Tourbillon (Brute 1); 30 Avalanche (sees 4 points in Assault); 35 Fendoir R2; 40 and 45 Charge R3.
Total at 45: 9 points = `floor(45/5)`.

### 6.2 R2 "Amélioration" per ability

§10 allows "+25 % of effect **or** −1 turn of cooldown". This role picks one per ability (tables in
section 8). Rules:

- `EffectBp(2500)`: every numeric magnitude of the ability's effects (damage and heal ratios,
  shield amounts, flat damage, percentages like "Marked +20 %") is multiplied by 1.25, floor in bp.
  Durations, ranges, Weight deltas, cell counts and caps (3 targets, 1 ejection) are **not**
  numeric magnitudes and never scale. PROPOSAL.
- `CooldownMinus1`: base cooldown −1, never below 0. Only for base cooldown ≥ 1.
- **Exception** (F15): the two once-per-fight Chronomancer ultimates have no number to scale and a
  cooldown that does not matter. Their R2 is `CostMinus(1)` (6 to 5 sand). PROPOSAL, needs owner OK.

### 6.3 R3 "Variante"

A variant is a list of `Patch` applied after R2:

```rust
pub enum Patch {
    SetCost(u16), AddCooldown(i8), SetRange(Range), ScaleEffect{index: u8, bp: u32},
    SetDuration{index: u8, turns: u8}, AddEffect(EffectSpec), ReplaceEffect{index: u8, with: EffectSpec},
    AddKeyword(Keyword), SetTargetCount(u8), SetCondThreshold{index: u8, bp: u32},
}
```

Constraints checked by integrity tests (section 14): a variant never adds an ejection without the
Éjecteur keyword and a tell or ultimate status; never raises a hard control above 3 targets; never
adds a second bonus Step per turn; never makes a cost exceed the resource max.

### 6.4 Compilation (`kit/compile.rs`)

`compile(class, active_tree, equipped, passive_loadout, items) -> CompiledKit` in this fixed order:
base `AbilityDef` → R2 → R3 variant → item Aspects → set bonuses → item "+1 rank" (section 10) →
keystone and rune patches (for example Grêle de lames, Chasseur ultime). The compiled kit is part of
the fight setup and its hash goes into the combat state hash (§24.1). Pure, no I/O.

### Dependencies (section 6)

`stats-progression` (level and point grants), `client-ui` (active tree window, equip screen),
`economy-merchants` (reset price), `items-loot` (Aspects, "+1 rank" affix).

### Tests (section 6)

- Given a level-14 Warrior with Charge and Fendoir, When he learns Percée, Then `TierLocked{15, 2}`.
- Given a level-30 Warrior with Assault points Charge R1, Fendoir R1, Percée R1 (3), When he learns
  Avalanche, Then `TierLocked` (needs 4); with Charge R2, Then OK.
- Given Charge at R1, When R3 is learned, Then `RankOrder`.
- Given R3 without a variant, Then `VariantMissing`.
- Given the §10 example, Then valid at every level from 5 to 45.
- Property: for every level, the maximum spend of 5 abilities at R3 is exactly 20 and reachable
  only at level 100.

---

## 7. Controls, Fragments, hero protection (§6.6, §6.9, §6.11, §7.1, §19)

### 7.1 Controls used by kits

| Rule | Value | Tag |
|---|---|---|
| Mass hard control cap (Stunned, Frozen) | 3 balls, chosen by the caster | `[T]` §6.10 (FINAL proposed) |
| Diminishing returns | immunity to the whole category for 2 turns after a control | `[T]` §6.11 |
| Categories | Hard: Stunned, Frozen, Stase applied by an opponent; Mobility: Rooted; Cast: Silence, Blinded | `[T]` §6.11 |
| Taunt (Provocation) | category **Cast** | `[P]` (F16: Taunt is in no category) |
| Tenacity | ≥ 50: controls of 2 turns or more last 1 turn less | `[T]` §7.1 |
| PvP | controls last 1 turn less, minimum 1 | `[T]` §19 |
| Order | PvP reduction first, then Tenacity if the result is still ≥ 2 | `[P]` |
| Self Stase | Stase on an own ball is not a control (no immunity) | `[T]` §6.11 "quand un adversaire la pose" |

Abilities with a hard mass control carry `MassHardControl`; the integrity test checks their target
count ≤ 3. In the 80: Nova de givre and Zéro absolu (Charge variant B and the Vapour reaction are
single target).

### 7.2 Fragments and squad bonuses (§6.9)

Fragments: 40 % HP, 50 % ATQ, 50 % ARM and RES, Weight 1, no POW, no ability (`[T]` §6.9). The
class `squad` list adds `StatMod`s. Only 3 classes have one in §8 (F18). Proposed for the others:

| Class | Squad bonus | Tag |
|---|---|---|
| Warden | Fragments +20 % HP | `[T]` §8.1 |
| Warrior | Fragments +10 % ATQ | `[T]` §8.2 |
| Assassin | Fragments +15 % damage on Isolated balls | `[P]` |
| Healer | Fragments +15 % heals and shields received | `[P]` |
| Mage | Fragments +10 % RES | `[P]` |
| Necromancer | Fragments −20 % HP, each lost Fragment +10 Essence | `[T]` §8.6 |
| Chronomancer | Fragments +10 % ARM | `[P]` |
| Geomancer | Fragments ignore Mud's "no broadside" rule | `[P]` |

### 7.3 Hero protection answers (§6.6)

The hero dies when ejected or at 0 HP and its entity loses at once (FINAL, validated decision).
§6.6 lists the class answers; this role guarantees each one works with a scenario test that starts
with the hero one push away from ejection:

| Answer | Class | How it saves the hero |
|---|---|---|
| Ancrage | Warden | hero Anchored = Inamovible: the file cannot be pushed |
| Forteresse | Warden | all allies Inéjectable 1 turn |
| Interposition | Warden | redirects one enemy ability (not pushes) to the Warden hero |
| Transfert | Healer | swaps the hero with an ally away from the edge |
| Aube | Healer | Inéjectable 1 turn |
| Instant suspendu | Chronomancer | once per fight, the ejection fails and the ball is in Stase |
| Stase | Chronomancer | hero Inamovible (but cannot act: costs the next turn's actions) |
| Pont | Geomancer | a temporary cell beyond the edge; the hero must leave it before it expires |
| Insaisissable | Assassin | Inamovible until the Assassin's next turn |

Note: Interposition does not protect against ejection by a Move; this is expected (it is a damage
answer). Hero Guard (35 % of max HP per ability, `[T]` §6.5) is enforced by `combat-engine`; kits
only mark which effects come from "one ability" (one cast = one Guard bucket per hero, DoT ticks are
separate buckets, PROPOSAL F10).

### Dependencies (section 7)

`combat-engine` (DR timers, Tenacity, PvP flag, Guard bucket), `stats-progression` (Fragment stat
builder), `pvp-br-designer` (PvP flag in the ruleset).

### Tests (section 7)

- Given Nova de givre with 4 adjacent enemies, When cast, Then exactly 3 chosen by the caster are
  Frozen and the fourth is not.
- Given an enemy Frozen by Nova this turn, When a Vapour reaction would Stun it, Then it is blocked
  by the Hard immunity.
- Given PvP and Tenacity 50 and Zéro absolu B (Frozen 2 turns), Then Frozen lasts 1 turn (PvP −1 →
  1, Tenacity does not apply below 2).
- One scenario per row of the 7.3 table: hero on the edge, enemy push ready, answer cast, push
  illegal or ejection cancelled.

---

## 8. The 8 classes and the 80 abilities (§8.0 to §8.8, §10)

How to read the tables:

- **Table A** copies the spec: kind (A = Action, Q = Quick, P = Prepare), cost, cooldown (CD),
  range, and gives the effect as primitives (section 3.3). Spec numbers are `[T]`; numbers that the
  spec does not give and that this role fills in carry `[P]`.
- **Table B** gives R2 (section 6.2), the two R3 variants (section 6.3) and the counterplay line.
  Every R2 and R3 entry is PROPOSAL (`[P]`) except Charge A and B, which §10 gives (`[T]`).
  Counter: **S** = written in the spec, **P** = proposed here (F4: 60 of the 80 abilities have no
  counter in §8, while §6.10 and §24.3 require one).
- Ultimates are rows **U-A** (branch A) and **U-B** (branch B).
- Damage is physical when the ratio is ATQ and magical when it is PUI, unless written otherwise.
- "Ally" means any ball of the caster's camp (section 3.2).

### 8.1 Warden (Gardien, lineage of the Anchor)

Class (`[T]` §8.0, §8.1): Weight 3; HP ×1.3, ARM and RES ×1.5, ATQ ×0.8; resource Bulwark
(section 4.2); difficulty 1.

**Trait "Sentinelle"**: allies adjacent to the hero get +15 % ARM and RES (`[T]`). Implementation:
an aura `StatMod` recomputed after every elementary effect (§6.3 atomic resolution) from adjacency;
not a status, so not purgeable. Squad: +20 % HP.

Table A (spec numbers `[T]` §8.1):

| # | Id | FR | Kind | Cost | CD | Range | Effect as primitives |
|---|---|---|---|---|---|---|---|
| 1 | `warden.anchor` | Ancrage | Q | 20 | 3 | 2 | Status Anchored on an ally, `UntilCasterNextTurn` |
| 2 | `warden.taunt` | Provocation | A | 20 | 3 | radius 2 around hero | Status Taunt on every enemy in the area, 1 turn |
| 3 | `warden.interpose` | Interposition | P | 25 | 3 | 2 | Prepare: next enemy ability targeting the chosen ally retargets to the hero (redirect step 2) |
| 4 | `warden.shield_wall` | Mur de boucliers | A | 30 | 4 | 3 | Terrain Roc on 3 aligned empty cells, 2 turns, owner = caster (F19) |
| U-A | `warden.fortress` | Forteresse | A | 80 | 8 | board | Status Inéjectable on every ally ball, 1 turn, then Lassitude 2 turns |
| 5 | `warden.shield_bash` | Coup de bouclier | A | 15 | 1 | adjacent | Damage 80 % ATQ; Recoil 1 away from hero if the cell is free, never off-board |
| 6 | `warden.thorns` | Épines | Q | 20 | 3 | self | Mark on hero, 2 turns: when an enemy group's head pushes an allied file adjacent to the hero, the head takes 60 % PUI |
| 7 | `warden.ram` | Bélier | Q | 30 | 3 | self | PushRule: +2 push Weight, hero in group, next push this turn |
| 8 | `warden.anchor_chain` | Chaîne d'ancre | A | 25 | 3 | line 3 | Pull the first enemy ball on the line 1 cell toward the hero |
| U-B | `warden.ballast_quake` | Séisme du Lest | A | 80 | 8 | radius 2 | Damage 100 % ATQ to enemies; Recoil 1 away from the hero; **Éjecteur**, at most 1 ejection chosen by the caster |

Table B:

| # | R2 | R3 A | R3 B | Counter |
|---|---|---|---|---|
| 1 | CD −1 | range 3 `[P]` | also Anchors the hero if adjacent to the target `[P]` | S: go around the ball, or hit it with magic damage |
| 2 | CD −1 | radius 3 `[P]` | hero gains a shield of 10 % max HP per taunted enemy, max 3 `[P]` | S: use area abilities |
| 3 | CD −1 | redirected damage −30 % `[P]` | when it fires, the protected ally is Anchored `UntilCasterNextTurn` `[P]` | S: bait it with a small ability |
| 4 | CD −1 | 3 turns `[P]` | 4 cells `[P]` | S: wait it out, or use another axis |
| U-A | CD −1 | also +20 % ARM and RES for 1 turn `[P]` | lasts 2 turns but only on balls adjacent to the hero `[P]` | S: win by damage, not ejection |
| 5 | +25 % | target Blinded 1 turn `[P]` | recoil 2 cells if both free `[P]` | P: stand with an ally behind you: the recoil fails |
| 6 | +25 % | 3 turns `[P]` | also triggers on enemy abilities that damage those allies `[P]` | P: push files that are not next to the Warden hero |
| 7 | CD −1 | +3 push Weight `[P]` | the push Shock +50 % `[P]` | P: stack Weight (Mud, Peau de fer) beyond +2 |
| 8 | CD −1 | pull 2 cells `[P]` | range 5, target Rooted 1 turn `[P]` | P: keep a ball between you and the Warden on that axis |
| U-B | CD −1 | radius 3, 70 % ATQ `[P]` | radius 1, 150 % ATQ `[P]` | S: do not stick to the hero near the edge |

Specifics (PROPOSAL):

- **Mur de boucliers "Roc allié"** (F19): a Roc is neutral in §5.1. Proposed: same rules as Roc for
  everyone; "allié" only sets the owner for duration ticking and colour.
- **Recoil direction** for Séisme du Lest (F21): a ball on one of the 6 axes from the hero recoils
  along it; an off-axis ball recoils in the direction among the 6 that increases its distance to
  the hero most, ties broken in the fixed order E, NE, NW, W, SW, SE. Resolution order for recoil
  areas: **farthest first** (so near balls can move into freed cells), which overrides the §6.10
  "nearest first" for this effect family only (F22).
- **Épines** fires on the push's head ball after the push resolves (it is not a Preparation, so it
  can fire many times in one enemy turn, once per push).

Tests (Given/When/Then, one scenario each, plus one per R2 and variant):

- Given an ally Anchored by Ancrage on the edge, When an enemy 3-ball group pushes it, Then the push
  is illegal (Inamovible blocks like a Roc); When the Warden's next turn starts, Then Anchored is
  gone.
- Given Interposition armed on Fragment F and an enemy casting a single-target ability on F, Then
  the Warden hero takes the damage (after Guard) and the Preparation is consumed.
- Given Séisme du Lest with two enemies on the edge in radius 2, When cast, Then the caster picks
  one to eject, the other stays on its last cell and takes a Shock (§6.10 rule 1).
- Given Mur de boucliers on a line with an occupied cell, Then `BadTarget` (3 empty cells required).
- Given Bulwark 0, an enemy push moving 2 allied balls and Shocking 2, Then Bulwark +30 (cap).

Dependencies: `combat-engine` (Inamovible, Inéjectable + Lassitude, Taunt targeting, recoil,
terrain owner), `client-ui` (Sentinelle aura glyph).

Risks: Forteresse plus Aube (Healer) in a group chain 2 turns of immunity; Inéjectable "ne se
cumule pas" and Lassitude (`[T]` §6.11) stop the chain, test it.

### 8.2 Warrior (Guerrier, lineage of the Ram)

Class (`[T]`): Weight 3; HP ×1.15, ATQ ×1.3; resource Rage. **Trait "Élan"**: +50 % Shock when the
hero heads the push (section 5). Squad: +10 % ATQ.

Table A (spec numbers `[T]` §8.2):

| # | Id | FR | Kind | Cost | CD | Range | Effect as primitives |
|---|---|---|---|---|---|---|---|
| 1 | `warrior.charge` | Charge | A | 0 | 2 | line, 2 empty cells | Move hero (Teleport-like slide) up to 2 empty cells; if an enemy is right after, Damage 100 % ATQ (Shock-type, no push); Resource +20 |
| 2 | `warrior.cleave` | Fendoir | A | 25 | 1 | adjacent | Damage 120 % ATQ, +50 % if target Isolated |
| 3 | `warrior.breakthrough` | Percée | Q | 30 | 3 | self | PushRule allow_equal_count, next push this turn |
| 4 | `warrior.war_cry` | Cri de guerre | Q | 20 | 4 | radius 2 | StatMod allies ATQ +20 % 2 turns; StatMod enemies Weight −1, 1 turn |
| U-A | `warrior.avalanche` | Avalanche | A | 100 | 8 | self | PushRule max_group 4 inline, file ≤ 3, Shock ×2, this turn |
| 5 | `warrior.whirlwind` | Tourbillon | A | 40 | 3 | adjacent, all | Damage 70 % ATQ to each adjacent enemy |
| 6 | `warrior.iron_skin` | Peau de fer | Q | 30 | 4 | self | Shield 30 % hero max HP, 2 turns; StatMod Weight +1, 2 turns |
| 7 | `warrior.crush` | Écrasement | A | 35 | 3 | inline group with hero | Native `crush`: 150 % ATQ on the pressed ball, nothing moves (section 5) |
| 8 | `warrior.execute` | Exécution | A | 50 | 4 | adjacent | Damage 200 % ATQ, only on a target under 30 % HP; if it dies, Resource +25 |
| U-B | `warrior.titan` | Titan | Q | 100 | 9 | self | Hero Weight 5, Inamovible, pushed balls take Shock +100 %, 2 turns |

Table B:

| # | R2 | R3 A | R3 B | Counter |
|---|---|---|---|---|
| 1 | CD −1 | crosses 1 enemy ball to the empty cell behind it, hitting it (`[T]` §10 "traverse 1 ennemi") | the hit enemy is Stunned 1 turn (`[T]` §10) | S: keep one empty cell between you and the Warrior |
| 2 | +25 % | the ball behind the target takes 50 % ATQ `[P]` | Bleed 20 % ATQ, 2 turns `[P]` | P: keep allies adjacent (no Isolation bonus) |
| 3 | CD −1 | the push also gets +1 Weight `[P]` | cost 15 `[P]` | S: add Weight (Mud, Ancrage) |
| 4 | CD −1 | ATQ +30 % `[P]` | radius 3 `[P]` | P: stay outside radius 2 of the Warrior hero |
| U-A | CD −1 | cost 80 `[P]` | Shock ×3 `[P]` | S: Rage is visible; when full, stay away from the edge |
| 5 | +25 % | hero heals 10 % of damage dealt `[P]` | each hit enemy −1 Weight, 1 turn `[P]` | P: never leave 2 or more balls next to the hero |
| 6 | CD −1 | shield 45 %, no Weight `[P]` | Weight +2, shield 15 % `[P]` | P: damage it with magic after the shield, or wait 2 turns |
| 7 | +25 % | Stun 1 turn if the blocker is a Roc `[P]` | all balls of the file take 50 % ATQ `[P]` | P: do not stand with your back to a Roc or your own ball |
| 8 | CD −1 | threshold 40 % `[P]` | range: line 2 `[P]` | P: heal or shield balls under 30 % |
| U-B | CD −1 | 3 turns `[P]` | adjacent own Fragments +1 Weight during Titan `[P]` | S: go around him and hit his squad |

Specifics:

- **Rage decay** is applied at "Fin du tour" before durations (PROPOSAL) and only if no Move of the
  turn pushed an enemy. Charge's Choc is not a push.
- **Cri de guerre** −1 Weight on enemies lasts 1 enemy turn (duration rule 3.4: enemy statuses tick
  normally), so the Warrior's squad push must come **this** turn: it applies before the Move if cast
  first (§6.3 free order).
- **Exécution threshold** uses `hp × 10 000 < max_hp × 3 000` (integers).

Tests:

- Given Rage 0 and a successful push that causes a Loss, Then Rage = 15 + 25 = 40.
- Given Charge with an enemy two empty cells away then a third cell, When cast, Then the hero ends
  adjacent to the enemy, the enemy is not moved and loses 100 % ATQ after mitigation, Rage +20.
- Given Charge R3 A with an enemy on the first cell and an empty cell behind it, Then the hero ends
  behind the enemy and hits it once.
- Given Fendoir on an Isolated Normal monster level 1 (ARM 14), Warrior level 1 ATQ 15, Then damage
  = floor(floor(floor(15 × 1.2) × 100 / 114) × 1.75) = 26 (illustrative, isolation 25 % + Fendoir
  50 %; pinned once `combat-engine` merges the order).
- Given Exécution on a target at exactly 30 % HP, Then `BadTarget` (strictly under).
- Given Titan, When an enemy targets the hero with Chaîne d'ancre, Then nothing moves.

Dependencies: `combat-engine` (push events, Shock multipliers, `PushContext`), `ai-engineer`
(Warrior rotation is the R1 bot), `ux-designer` (Rage gauge and "full Rage" warning, Avalanche
counter relies on it).

Risks: Avalanche plus Bélier-like items could give a 4-ball group +2 Weight and break any defence;
items never add `extra_push_weight` (`items-loot` constraint, PROPOSAL).

### 8.3 Assassin (Assassin, lineage of the Shard)

Class (`[T]`): Weight 1; ATQ ×1.4, HP ×0.8, VIT +5; Energy 0..100, +30 per turn (unscaled), combo
0..5. **Trait "Opportuniste"**: +30 % damage on Isolated balls (`[T]`), stacks additively with the
§6.5 Isolation +25 % in Σbonus. Squad: section 7.2.

**Combo**: `Generator(n)` adds n (cap 5); `Finisher` spends all combo after computing the effect.
Combo resets to 0 at fight end. **Lame empoisonnée charges** count one per ability cast that deals
damage, applied to every target of that cast (PROPOSAL, F23: "attaque" is undefined).

Table A (spec numbers `[T]` §8.3):

| # | Id | FR | Kind | Cost | CD | Range | Effect as primitives |
|---|---|---|---|---|---|---|---|
| 1 | `assassin.slash` | Entaille | A | 25 | 0 | adjacent | Damage 90 % ATQ; Status Bleed 20 % ATQ 2 turns; Generator 1 |
| 2 | `assassin.shadow_step` | Pas de l'ombre | Q | 30 | 2 | 3 | Teleport hero to an empty cell adjacent to an enemy; Generator 1 |
| 3 | `assassin.eviscerate` | Éventration | A | 35 | 1 | adjacent `[P]` | Finisher: Damage 50 % ATQ × combo; if target dies, combo = 2 |
| 4 | `assassin.poisoned_blade` | Lame empoisonnée | Q | 20 | 3 | self | Mark hero: next 3 damaging casts apply Poison 20 % PUI 3 turns |
| U-A | `assassin.blade_dance` | Danse des lames | A | 60 | 8 | 3 | Native `blade_dance`: up to 4 enemies within 3, each 120 % ATQ, hero ends adjacent to the last |
| 5 | `assassin.trip` | Croc-en-jambe | Q | 25 | 3 | adjacent | StatMod Weight −2 (min 1), 1 turn |
| 6 | `assassin.elusive` | Insaisissable | Q | 30 | 4 | self | Status Insaisissable `UntilCasterNextTurn` |
| 7 | `assassin.smoke` | Fumigène | A | 40 | 4 | 3 `[P]` | Terrain-like zone radius 1, 2 turns: allies inside cannot be targeted from range ≥ 2 |
| 8 | `assassin.death_mark` | Marque de mort | Q | 20 | 4 | 4 | Status Marked +20 %, 3 turns; if it dies, Resource +50 |
| U-B | `assassin.assassinate` | Assassinat | A | 60 + 5 combo | 9 | 5 | Teleport adjacent to target; Damage 300 % ATQ (400 % Isolated), Guard applies on heroes; on kill, hero Insaisissable 1 turn |

Table B:

| # | R2 | R3 A | R3 B | Counter |
|---|---|---|---|---|
| 1 | +25 % | Generator 2 on an Isolated target `[P]` | Bleed 30 % ATQ, 3 turns `[P]` | P: stay in Formation, cleanse the Bleed |
| 2 | CD −1 | range 4 `[P]` | the next Entaille this turn costs 0 `[P]` | S: stay in Formation, no empty cell around |
| 3 | +25 % | at 5 combo, ignores 30 % of ARM `[P]` | on kill, combo = 3 `[P]` | P: shield the target when the combo gauge is high |
| 4 | CD −1 | 5 charges `[P]` | Poison scales 15 % ATQ instead of PUI `[P]` | P: Purification, Antidote |
| U-A | CD −1 | 5 targets at 100 % `[P]` | Generator 1 per hit `[P]` | P: no empty cells near your balls (Formation) |
| 5 | CD −1 | range 2 `[P]` | also Blinded 1 turn `[P]` | P: keep Weight buffs ready, stay 2 cells away |
| 6 | CD −1 | also Generator 1 `[P]` | may target an adjacent ally instead `[P]` | P: bait the dodge with a cheap single-target ability, use areas |
| 7 | CD −1 | 3 turns `[P]` | radius 2, 1 turn `[P]` | P: walk in and hit from range 1, or use area abilities |
| 8 | CD −1 | +30 % `[P]` | on kill, Pas de l'ombre cooldown reset `[P]` | P: shield or swap the marked ball |
| U-B | CD −1 | range 7 `[P]` | the hero returns to its start cell after the hit `[P]` | S: keep your hero in Formation |

Specifics:

- **Danse des lames path** (F24): the caster picks up to 4 distinct enemy targets in order; for each
  the hero teleports to a free neighbour of the target (lowest in the fixed cell order), strikes,
  goes on. If a target has no free neighbour it is skipped. Not a bonus Step, never pushes (§6.3).
- **Insaisissable** "ne peut pas se déplacer d'elle-même": the hero cannot be part of a Move or use a
  self-move ability while Insaisissable. It can still cast non-movement abilities.
- **Assassinat** needs a free neighbour of the target, else `BadTarget` (that is the written counter).
- **Weight 1 hero**: the Assassin hero is the easiest to eject (§8.3 says so). The R2 ladder must show
  that the Edge danger alert plus Insaisissable keep the class above the win floor (risk R-2).

Tests:

- Given combo 4, When Entaille hits, Then combo 5; When Entaille hits again, Then combo stays 5.
- Given combo 5, When Éventration kills its target, Then combo = 2 and Energy paid 35.
- Given Lame empoisonnée and Danse des lames hitting 4 targets, Then all 4 are Poisoned and 2
  charges remain.
- Given Assassinat on an enemy hero at full HP (400 % would deal 70 %), Then the hero loses exactly
  35 % max HP (Guard).
- Given Fumigène covering ally A, When an enemy casts a range-3 single-target ability on A, Then
  `BadTarget`; from range 1, Then allowed.
- Given Insaisissable, When the next single-target ability hits the hero, Then no damage and the
  dodge is consumed; When an area ability hits, Then normal damage.

Dependencies: `combat-engine` (teleport, free neighbour order, untargetable zones, dodge),
`ux-designer` (combo pips), `ai-engineer` (combo-aware rotation).

### 8.4 Healer (Guérisseur, lineage of the Glow)

Class (`[T]`): Weight 2; PUI ×1.3, RES ×1.2; Faith 0..100, start 50, +15 per turn.
**Accumulated light**: overheal becomes a shield, capped at 10 % of the target's max HP (`[T]`).
**Trait "Grâce"**: the first time each ally drops below 25 % HP in a fight, it gets a shield of
50 % PUI (`[T]`; "first time" is per ally per fight, PROPOSAL). Squad: section 7.2.

Table A (spec numbers `[T]` §8.4):

| # | Id | FR | Kind | Cost | CD | Range | Effect as primitives |
|---|---|---|---|---|---|---|---|
| 1 | `healer.healing_ray` | Rayon de soin | A | 20 | 0 | 4 | Heal 100 % PUI, overflow ShieldCap(1000) |
| 2 | `healer.aegis` | Égide | Q | 25 | 2 | 4 | Shield 80 % PUI, 2 turns |
| 3 | `healer.spring` | Source | A | 35 | 4 | 3 | Terrain Sanctuary on an empty cell, 3 turns; Mark: at the end of each caster turn, Heal 50 % PUI on that cell and its neighbours (allies) |
| 4 | `healer.purify` | Purification | Q | 15 | 2 | 3 | Remove all negative statuses from one ally |
| U-A | `healer.dawn` | Aube | A | 80 | 8 | board | Heal all allies 150 % PUI; purify; Inéjectable 1 turn + Lassitude |
| 5 | `healer.transfer` | Transfert | Q | 25 | 3 | 3 | Swap two allies, both within range 3 `[P]` |
| 6 | `healer.dazzle` | Éblouissement | A | 30 | 3 | 3 | Status Blinded 1 turn |
| 7 | `healer.life_link` | Lien vital | Q | 20 | 4 | 3 `[P]` | Link 2 allies 3 turns: damage split 50/50 (redirect step 4) |
| 8 | `healer.repulse` | Halo de répulsion | A | 35 | 4 | adjacent | Recoil 1 on up to 3 adjacent enemies, never off-board |
| U-B | `healer.martyr` | Martyr | Q | 60 | 9 | self | 2 turns: the hero takes all damage dealt to allies, −50 %; hero Anchored |

Table B:

| # | R2 | R3 A | R3 B | Counter |
|---|---|---|---|---|
| 1 | +25 % | also removes 1 negative status `[P]` | a second ally within 2 of the target gets 50 % `[P]` | P: Poison halves heals; burst one ball past the heal |
| 2 | CD −1 | +1 Weight while the shield holds `[P]` | 2 targets at 50 % each `[P]` | P: break it with many small hits, or wait 2 turns |
| 3 | CD −1 | 4 turns `[P]` | the cell also gives +5 Faith per turn to the hero if adjacent `[P]` | P: push allies off the Sanctuary, or occupy it |
| 4 | CD −1 | purified ally immune to that control category 1 turn `[P]` | radius 1 around the target `[P]` | P: apply the control after the cleanse (watch the CD) |
| U-A | CD −1 | heal 200 %, no Inéjectable `[P]` | also a shield 50 % PUI `[P]` | P: wait out the 1 turn, then strike during Lassitude |
| 5 | CD −1 | range 4 `[P]` | swap an ally with an enemy adjacent to the hero `[P]` | S: CD is visible; threaten two edges at once |
| 6 | CD −1 | also 60 % PUI damage `[P]` | radius 1, at most 3 targets `[P]` | P: lead pushes with another ball |
| 7 | CD −1 | 4 turns `[P]` | heals are also shared `[P]` | P: Isolation damage on both, or area damage that hits both |
| 8 | CD −1 | recoil 2 cells `[P]` | also 50 % PUI damage `[P]` | P: attack from range 2 |
| U-B | CD −1 | reduction 60 % `[P]` | 1 turn, hero heals 30 % of damage taken `[P]` | S: hit hard during it (Guard still applies) |

Specifics:

- **Lumière accumulée vs rune "Surplus de soins"** (F26): both turn overheal into a shield. They
  stack additively on the cap (10 % + rune %), one shield.
- **Source vs Sanctuary** (F27): §5.1 says a Sanctuary heals 5 % max HP and +5 resource to an ally
  that ends its turn on it; Source adds 50 % PUI on the cell **and** its neighbours. Proposed: Source
  creates a real Sanctuary (the §5.1 rule applies) plus a Mark that heals the neighbours at the end
  of the caster's turn. Heals use the Healer's PUI at cast time (snapshot, PROPOSAL).
- **Transfert** swaps positions; Inamovible allies cannot be swapped; a swap is not a push, no Shock.
  Variant B moves an enemy: never off-board (no ejection), it is a forced move without Éjecteur.

Tests:

- Given an ally at 95/100 HP and Rayon de soin for 20, Then HP 100 and a shield of 10 (cap 10 %).
- Given an ally falling from 30 % to 20 %, Then Grâce shield 50 % PUI; falling again later, Then no
  second shield.
- Given Martyr and Lien vital on two allies, When an enemy deals 100 to ally A, Then the Martyr hero
  takes 50 (redirect step 3 before link), A and B take 0.
- Given Transfert of the hero on the edge with a Fragment in the centre, Then positions swap and the
  Edge danger glyph disappears from the hero.
- Given Usure at −30 %, When Rayon de soin heals 100, Then 70 is healed.

Dependencies: `combat-engine` (redirect hooks, Usure, Poison heal halving), `world-generator`
(Sanctuary terrain rule shared with biomes), `ux-designer` (shield bars, link glyph).

### 8.5 Mage (Mage, lineage of the Furnace)

Class (`[T]`): Weight 1; PUI ×1.4, HP ×0.85; Mana 0..150, start 100, +10 per turn; Overheat
(section 4.2).

**Trait "Résonance"** (`kit/special/resonance.rs`): Mage spells put element states on the target.
Two different states on the same ball trigger a reaction at once and both states are consumed
(PROPOSAL). Reactions (`[T]` §8.5): Burned + Chilled = **Vapour**: Stunned 1 turn (DR applies);
Chilled + Charged = **Shatter**: the triggering hit ×1.5 and Weight −1 (1 turn `[P]`);
Burned + Charged = **Explosion**: 60 % PUI magic in radius 1 (enemies only `[P]`).

**Fix for the Vapour dead end** (F28): §8.5 uses "Gelé" both as the reaction state and as the hard
control. A target Frozen by the Mage is immune to Hard controls for 2 turns (§6.11), so Vapour's
Stun could never land. Proposed: the frost **state** is "Chilled" (Givré), a harmless tag; Gelé
(the control) also applies Chilled; Lance de glace applies Chilled. Burn state = the Brûlure status;
Charged = a tag from Chaîne d'éclairs. Needs an owner decision.

Table A (spec numbers `[T]` §8.5):

| # | Id | FR | Kind | Cost | CD | Range | Effect as primitives |
|---|---|---|---|---|---|---|---|
| 1 | `mage.fire_bolt` | Trait de feu | A | 20 | 0 | line 5 | Damage 100 % PUI; Status Burn 20 % PUI 2 turns; element Fire |
| 2 | `mage.blink` | Clignement | Q | 25 | 3 | 3 | Teleport hero to an empty cell |
| 3 | `mage.chain_lightning` | Chaîne d'éclairs | A | 35 | 2 | 4 | Damage 80 % PUI, then 2 bounces to adjacent enemies (−25 % each, never the same ball twice, first free in fixed order `[P]`); Charged on each |
| 4 | `mage.flame_wall` | Mur de flammes | A | 40 | 4 | 4 | Terrain Lava on 3 aligned cells (any non-Roc, non-Gouffre cell), 3 turns; Fire |
| U-A | `mage.meteor` | Météore | A | 100 | 8 | 6 | Mark radius 1, tell 1: at the caster's next turn start, Damage 250 % PUI and Recoil 1 outward; **Éjecteur**, at most 1 ejection |
| 5 | `mage.ice_lance` | Lance de glace | A | 25 | 1 | 4 | Damage 120 % PUI, +50 % on Frozen; applies Chilled `[P]` |
| 6 | `mage.mana_shield` | Bouclier de mana | Q | 0 | 4 | self | Status 2 turns: damage paid in mana, 2 HP = 1 mana (redirect step 8) |
| 7 | `mage.frost_nova` | Nova de givre | A | 35 | 3 | adjacent | Status Frozen 1 turn on up to 3 adjacent enemies (MassHardControl) |
| 8 | `mage.black_ice` | Sol verglacé | A | 30 | 3 | 4, radius 1 | Terrain Ice on empty cells of the area, 3 turns |
| U-B | `mage.absolute_zero` | Zéro absolu | A | 100 | 9 | radius 3 | Frozen 1 turn on up to 3 enemies in radius 3; Ice on empty cells in radius 2, 2 turns |

Table B:

| # | R2 | R3 A | R3 B | Counter |
|---|---|---|---|---|
| 1 | +25 % | Burn 3 turns `[P]` | +40 % on an already Burned target `[P]` | P: put a ball or Roc on the line; Water puts out Burn |
| 2 | CD −1 | range 4 `[P]` | leaves Ice on the departure cell, 2 turns `[P]` | P: keep pressure near the edges she can reach |
| 3 | +25 % | 3 bounces `[P]` | no decay on bounces `[P]` | P: spread out (no adjacent chain), Water halves nothing here |
| 4 | CD −1 | 4 cells `[P]` | a ball pushed into the wall is Burned `[P]` | P: go around, or wait 3 turns |
| U-A | CD −1 | radius 2, 200 % `[P]` | leaves Lava 2 turns on the area `[P]` | S: leave the area |
| 5 | +25 % | pierces 1 ball `[P]` | a Frozen target also Weight −1, 1 turn `[P]` | P: Purify Frozen before the lance |
| 6 | CD −1 | 3 HP = 1 mana `[P]` | 3 turns `[P]` | P: drain her mana first, then burst |
| 7 | CD −1 | also 60 % PUI damage `[P]` | radius 2, still 3 targets max `[P]` | P: do not group next to the Mage hero |
| 8 | CD −1 | 4 turns `[P]` | occupied cells too `[P]` | P: do not stand in line with an Ice patch and the edge |
| U-B | CD −1 | Ice radius 3 `[P]` | Frozen 2 turns (Tenacity and PvP reduce it) `[P]` | P: keep Tenacity, spread beyond radius 3 |

Specifics:

- **Météore recoil from the centre cell** (F21): the centre ball recoils away from the caster's hero
  (same off-axis rule as Séisme du Lest); other balls along the centre-to-ball axis.
- **Sol verglacé combo**: pushing a ball onto Ice so it slides off is a Move, so the ejection is
  allowed (§8.5); still at most 1 per action (§5.1 Ice).
- **Overheat** counts spells cast this turn, including a Prepare (none in the Mage kit) and
  excluding consumables.
- Friendly fire (F29): damage abilities hit enemies only unless written "les boules"; forced moves
  of Météore hit every ball in the area (spec wording "les boules"). PROPOSAL, needs confirmation.

Tests:

- Given an enemy Burned by Trait de feu, When Lance de glace hits it, Then Vapour: Stunned 1 turn,
  both states removed (needs F28).
- Given an enemy Charged and Chilled, Then Shatter: the triggering hit ×1.5 and Weight −1.
- Given Mana 100, Bouclier de mana, and a hit of 50, Then mana −25 and HP unchanged; with mana 10,
  Then mana 0 and HP −30.
- Given Météore marked on 3 enemies, two on the edge, Then at the Mage's next turn start, damage to
  all three, one ejection chosen by the caster.
- Given Sol verglacé and a push that slides an enemy across 3 Ice cells to the edge, Then it is
  ejected by the Move and a second sliding ball stops at the edge.

Dependencies: `combat-engine` (element tags, reaction hook, Ice slide, Lava), `world-generator`
(Water and Ice terrain rules), `ux-designer` (reaction preview, §7 of `ux-designer.md`).

### 8.6 Necromancer (Nécromancien, lineage of the Ossuary)

Class (`[T]`): Weight 2; PUI ×1.25; Essence 0..100, start 0, +5 per turn, +20 per Loss on the
board; innate Pacte de sang (section 4.2). **Trait "Moisson"**: each Loss on the board heals the
hero 5 % max HP (`[T]`). Squad "Serviteurs d'os": Fragments −20 % HP, +10 Essence per lost Fragment.

**Revenant** (`[T]` §8.6, §6.6): ally of the Necromancer; HP = 40 % of its original max HP + 20 % of
the hero's PUI; original Weight; no ability ("a raised boss keeps one", see
`encounter-boss-designer` §17); Decay −10 % max HP per own turn; at most 3 at once; each Graveyard
entry raised once; a Revenant leaves no Remains, is not a Loss, gives no Essence and no Moisson.
Revenants belong to the Necromancer's entity and move with its Move. **Heroes are never raisable**
(PROPOSAL, F30): a hero's death ends its entity, and raising an enemy hero would make the Chaplain
rule ("never a hero") inconsistent.

Table A (spec numbers `[T]` §8.6):

| # | Id | FR | Kind | Cost | CD | Range | Effect as primitives |
|---|---|---|---|---|---|---|---|
| 1 | `necro.siphon` | Siphon | A | 20 | 1 | 4 | Damage 80 % PUI; hero heals 50 % of damage dealt; Resource +10 |
| 2 | `necro.raise_dead` | Relever les morts | A | 30 | 2 | 3 | Raise from Remains on its cell, if free |
| 3 | `necro.void_recall` | Rappel du vide | A | 45 | 4 | edge within 3 | Raise an **ejected** entry on an empty edge cell within 3 of the hero |
| 4 | `necro.corpse_explosion` | Explosion de cadavre | A | 25 | 2 | 4 | Consume a Remains: Damage 30 % of its original max HP in radius 1 (magical `[P]`, F31), Recoil 1 without ejection |
| U-A | `necro.army_of_the_dead` | Armée des morts | A | 100 | 10 | board | Raise up to 3 Graveyard entries at 60 % HP; cap of 3 ignored 3 turns, then extra Revenants crumble |
| 5 | `necro.withering` | Décrépitude | A | 25 | 3 | 4, radius 1 | StatMod Weight −1 and ATQ −20 %, 2 turns, enemies in area |
| 6 | `necro.sacrifice` | Sacrifice | Q | 0 | 3 | any own Revenant | Destroy it: Resource +40; hero Shield = its remaining HP |
| 7 | `necro.suffering` | Retour de souffrance | Q | 20 | 4 | 4 | Status 2 turns: the target takes 50 % of the damage it deals (Pure `[P]`) |
| 8 | `necro.bone_prison` | Prison d'os | A | 30 | 4 | 3 | Terrain Roc on the empty neighbours of the target, 2 turns |
| U-B | `necro.plague` | Peste | A | 80 | 8 | board | Poison 15 % PUI 3 turns on every enemy; each enemy that dies during it rises as a Revenant (cap 3) |

Table B:

| # | R2 | R3 A | R3 B | Counter |
|---|---|---|---|---|
| 1 | +25 % | the heal goes to a chosen Revenant or ally instead `[P]` | +20 Essence on an Isolated target `[P]` | P: Poison or Usure cut the heal; burst the hero |
| 2 | CD −1 | Revenant at 60 % HP `[P]` | range 5 `[P]` | P: stand on your dead (occupy the Remains cell) |
| 3 | CD −1 | edge cell within 5 `[P]` | the Revenant arrives with a shield 20 % PUI `[P]` | P: guard the edge cells near the hero |
| 4 | +25 % | Poison 20 % PUI 2 turns instead of the recoil `[P]` | radius 2 at 20 % `[P]` | P: occupy or move away from Remains; consume them first |
| U-A | CD −1 | Revenants at 80 % HP `[P]` | 4 entries `[P]` | P: eject (not kill) to deny Remains, push Revenants off during the 3 turns |
| 5 | CD −1 | ATQ −30 % `[P]` | also PUI −20 % `[P]` | P: Purification; fight outside radius 1 of the mark |
| 6 | CD −1 | the Revenant explodes for 30 % of its max HP in radius 1, no recoil `[P]` | +60 Essence, no shield `[P]` | P: kill Revenants first so there is nothing to sacrifice |
| 7 | CD −1 | 75 % `[P]` | 3 turns `[P]` | P: do not attack with the cursed ball, Purify |
| 8 | CD −1 | 3 turns `[P]` | range 5 `[P]` | P: keep allies adjacent (occupied cells stay open) |
| U-B | CD −1 | 20 % PUI `[P]` | 4 turns `[P]` | P: Antidote and Purification; spread the kills after it ends |

Specifics:

- **Armée des morts placement** (F32): entries with Remains rise on their Remains if free; ejected
  entries and blocked ones rise on the nearest empty cell to the hero in the fixed order. Entries are
  chosen by the caster. After 3 turns, extra Revenants crumble by lowest current HP, then lowest id.
- **Explosion de cadavre** consumes the Remains but not the Graveyard entry: an entry whose Remains
  is gone can still be raised by Armée des morts (entries, not Remains) but not by Relever les morts.
- **Peste** death raises do not need Remains; they still count the "once per entry" rule.
- **Décrépitude name clash** (F25): ability id `necro.withering`; the Revenant rule is "Decay".

Tests:

- Given an enemy Fragment killed (0 HP) next to the hero, Then a Remains, Essence +20, hero heals 5 %.
- Given Relever les morts on that Remains, Then a Revenant with HP 40 % of original + 20 % PUI;
  When it later dies, Then no Remains, no Essence, no Loss for anyone.
- Given an entry already raised once, When Rappel du vide targets it, Then `BadTarget`.
- Given 3 Revenants, When Relever les morts is cast, Then `BadTarget` (cap 3).
- Given Armée des morts with 2 Revenants, raising 3, Then 5 Revenants; at the end of the caster's
  3rd turn after, Then 2 crumble (lowest HP first).
- Given Sacrifice on a Revenant at 37 HP, Then Essence +40 and hero Shield 37.

Dependencies: `combat-engine` (Graveyard, Remains, Revenant flags, rout counting), 
`encounter-boss-designer` (raised bosses and elites), `ux-designer` (Revenant counter 0..3).

Risks: §26 Q7 (endless fights with Revenants). The 60-turn no-Loss draw (§6.7) counts only Losses,
and Revenant deaths are not Losses, so a Necromancer can stall; the R9 ladder checks fight length
(risk R-4).

### 8.7 Chronomancer (Chronomancien, lineage of the Hourglass)

Class (`[T]`): Weight 1; PUI ×1.2, VIT +3; Sand 0..6 charges, start 2, +1 per turn, +1 more if no
ability was cast. **Debt** (spec name "Paradoxe", renamed to avoid the clash with the ultimate, F25):
spending more than 4 sand in one turn gives −2 at the next turn start (`[T]`). Sand never uses
percentage scaling (VIT, affinity, runes in % give nothing, F33). Squad: section 7.2.

**Trait "Instant suspendu"** (`kit/special/suspend.rs`), once per fight (`[T]`): when an allied ball
would be ejected by a push, the push **fails**: nothing moves, the pushing entity's Move is spent,
and the ball is put in Stase 1 turn on its cell (PROPOSAL for "la poussée échoue", F34). It does not
trigger on terrain removals (Breach, Tide, Séisme) nor on Éjecteur abilities (PROPOSAL: "poussée"
only). The search (`ai-engineer`) must see it, so it lives inside `apply_action`. It is public: the
Edge danger alert shows that the trait is still available.

**History** (`kit/special/history.rs`): reads the snapshot ring (section 3.6).

Table A (spec numbers `[T]` §8.7):

| # | Id | FR | Kind | Cost | CD | Range | Effect as primitives |
|---|---|---|---|---|---|---|---|
| 1 | `chrono.time_mine` | Mine temporelle | Q | 1 | 2 | 4 | Mark a cell, fires at the caster's next turn start: Damage 150 % PUI to the ball on it |
| 2 | `chrono.rewind_step` | Retour | A | 2 | 2 | 4 | Return a ball to its cell at the start of its entity's previous turn, if free; else fail and refund |
| 3 | `chrono.rewind_wounds` | Rembobiner les blessures | Q | 1 | 3 | 4 | Set an ally's HP to its HP at the start of the caster's previous turn, if higher |
| 4 | `chrono.deja_vu` | Déjà-vu | P | 2 | 4 | 4 `[P]` | Prepare on an ally: if moved by the opponent (not ejected), returns to its origin at the end of that turn if free |
| U-A | `chrono.paradox` | Paradoxe | A | 6 | 10 | board | Once per fight: every ball returns to its position at the start of the caster's previous turn; HP, Losses, cooldowns unchanged; new balls stay or shift to the nearest free cell |
| 5 | `chrono.quicken` | Hâte | Q | 2 | 3 | 3 | Turn BonusStep for an own ball (counts in the 1 per turn limit) |
| 6 | `chrono.slow` | Lenteur | A | 2 | 3 | 4 | Status Blinded 1 turn; if the target is a hero, its cooldowns +1 |
| 7 | `chrono.stasis` | Stase | A | 3 | 4 | 4 | Status Stase 1 turn on any ball |
| 8 | `chrono.hourglass` | Sablier | Q | 1 | 3 | self | The hero's shortest cooldown −1 (not the ultimate) |
| U-B | `chrono.time_stop` | Arrêt du temps | A | 6 | 10 | an enemy entity | Once per fight: at that entity's next turn, only its Move; its durations and cooldowns do not tick; against a boss: +2 to all its cooldowns instead |

Table B:

| # | R2 | R3 A | R3 B | Counter |
|---|---|---|---|---|
| 1 | +25 % | radius 1 at 100 % `[P]` | the ball hit is also Blinded 1 turn `[P]` | P: the tell is visible: leave the cell |
| 2 | CD −1 | cost 1 `[P]` | an enemy returned takes 80 % PUI `[P]` | S: occupy its old cell |
| 3 | CD −1 | also removes statuses gained since that snapshot `[P]` | range 6 `[P]` | P: kill in one turn, not over two |
| 4 | CD −1 | two allies `[P]` | if it fires, the mover's head ball takes 100 % PUI `[P]` | P: eject instead of moving, or occupy the origin cell |
| U-A | Cost −1 (F15) | only enemy balls return `[P]` | only allied balls return `[P]` | S: it also undoes the caster's progress |
| 5 | CD −1 | range 5 `[P]` | the ally also gets +20 % ATQ 1 turn `[P]` | P: the step cannot push: keep the edge cells covered |
| 6 | CD −1 | also Weight −1, 1 turn `[P]` | cost 1 `[P]` | P: lead pushes with another ball |
| 7 | CD −1 | range 6 `[P]` | cost 2 `[P]` | P: a Stase ally cannot act either: punish the lost tempo |
| 8 | CD −1 | −2 `[P]` | may target the hero of another allied entity `[P]` | P: track the visible cooldowns; pressure early |
| U-B | Cost −1 (F15) | also the entity's ultimate cooldown +2 `[P]` | targets 2 entities in a group fight, cost 6 kept `[P]` | S: watch the sand gauge; prepare when it reaches 6 |

Specifics:

- **Debt and ultimates**: both ultimates cost 6 > 4, so each one triggers Debt. Kept on purpose
  (`[T]` §8.7) but flagged (F35).
- **Retour edge cases** (F36): if the old cell is now a Gouffre, Roc or off the board (Pont expired),
  the effect fails and refunds. Retour never ejects. Aspect "Sablier fêlé" (§12) only changes the
  occupied-cell case.
- **Paradoxe conflicts**: balls return simultaneously; a ball whose old cell is now Roc, Gouffre or
  occupied by a ball created since shifts to the nearest free cell (fixed order). Dead or ejected
  balls stay dead (Losses unchanged). Terrain does not revert. Nobody is ejected by Paradoxe.
- **Hâte targets own balls only** (F37): "une entité ne déplace que ses propres boules" (§6.0).
- **Stase on an own hero**: the hero cannot act until the end of its next turn (duration rule 3.4):
  its entity can still Move other balls. This is the price of the protection.
- **Arrêt du temps vs Stunned**: a restricted entity can still Move; durations frozen include its
  own buffs and debuffs.

Tests:

- Given an enemy pushed from (0,1) to (0,2) during its previous turn, When Retour targets it, Then it
  is back on (0,1); Given (0,1) occupied, Then fail and 2 sand refunded, cooldown not set.
- Given Instant suspendu unused and an enemy push that would eject an allied Fragment, Then no ball
  moves, the enemy's Move is spent, the Fragment is in Stase 1 turn; a second such push later ejects.
- Given 6 sand and Paradoxe, Then all balls return, HP and Losses are unchanged, and at the next turn
  start sand = 0 + 1 − 2 → 0.
- Given Arrêt du temps on a pack, When the pack's turn comes, Then only its Move is legal and its
  statuses keep their remaining turns.
- Given Hâte already used this turn and a rune giving a bonus Step, Then only one bonus Step (§6.3).

Dependencies: `combat-engine` (snapshot ring in the hash, turn restriction, Prepare triggers, ejection
hook), `ai-engineer` (search sees Instant suspendu and history), `encounter-boss-designer` (boss
cooldowns, §17 of its spec).

Risks: Paradoxe and Retour make the state depend on history: the state hash must include the
snapshot ring or replays diverge (risk R-3).

### 8.8 Geomancer (Géomancien, lineage of the Stratum)

Class (`[T]`): Weight 2; PUI ×1.15, ARM ×1.2; Strata 0..100, start 30 `[P]`, +10 per turn, +5 per own
ball on a special cell at turn start. **Special cell** = any terrain type other than Normal (Roc and
Gouffre cannot hold a ball, so they never count) (PROPOSAL).

**Trait "Marche-pierre"**: the hero ignores **negative** terrain effects. Proposed closed list (F38):
Lava damage, Quicksand root and suction, Corruption stacks, Brambles damage, Mud's broadside ban,
Ice slide (optional: the hero chooses to slide or stop, PROPOSAL). Not ignored: Gouffre (ejection is
not a terrain "effect"), Mud's +1 Weight (positive), Fourré, Hauteur, Eau.

Table A (spec numbers `[T]` §8.8):

| # | Id | FR | Kind | Cost | CD | Range | Effect as primitives |
|---|---|---|---|---|---|---|---|
| 1 | `geo.upheaval` | Soulèvement | A | 25 | 2 | 4 | Terrain Roc on an empty cell, 3 turns |
| 2 | `geo.stone_glyph` | Glyphe de pierre | Q | 20 | 3 | 3 | StatMod ally Weight +1 and ARM +30 %, 2 turns |
| 3 | `geo.bridge` | Pont | A | 40 | 4 | 4 | Native `bridge`: fill a Gouffre or add one cell beyond the edge, 2 turns; at expiry, a ball on it is ejected (terrain with tell) |
| 4 | `geo.slope` | Pente | Q | 20 | 2 | 4 | Terrain Slope with a chosen direction on a cell, 3 turns |
| U-A | `geo.telluric_rampart` | Rempart tellurique | A | 90 | 9 | 4 | Terrain Roc on the empty neighbours of a cell (up to 6), 2 turns |
| 5 | `geo.quicksand` | Sables | A | 25 | 3 | 4 | Terrain Quicksand on 3 empty cells, 3 turns (shape: any 3 within range `[P]`, F39) |
| 6 | `geo.tremor` | Secousse | A | 30 | 3 | line 4, full line | Each ball on the line slides 1 cell in the chosen perpendicular direction if free, no ejection |
| 7 | `geo.collapse` | Effondrement | A | 40 | 4 | 4 | Mark a cell; at the end of the next enemy turn it becomes a Gouffre for 3 turns; **Éjecteur** with tell 1 |
| 8 | `geo.rotation` | Rotation | A | 45 | 5 | 3 | Native `rotate`: the 7 cells of a hexagon turn 60° with balls, terrain and slopes; centre needs 6 on-board neighbours, no Inamovible ball |
| U-B | `geo.earthquake` | Séisme | A | 100 | 9 | board edge | Mark two **adjacent** edge sides; at the caster's 2nd next turn start, they become Gouffres for 2 turns; tell 2, Éjecteur (multi-removal allowed, §6.10 rule 2) |

Table B:

| # | R2 | R3 A | R3 B | Counter |
|---|---|---|---|---|
| 1 | CD −1 | 2 cells `[P]` | range 6 `[P]` | P: use another axis; it lasts 3 turns |
| 2 | CD −1 | Weight +2 `[P]` | also RES +30 % `[P]` | P: magic damage, or wait 2 turns |
| 3 | CD −1 | 3 turns `[P]` | 2 cells `[P]` | P: push balls onto the Pont near its expiry (it ejects them) |
| 4 | CD −1 | 2 cells `[P]` | 5 turns `[P]` | P: push across the slope, not against it |
| U-A | CD −1 | 3 turns `[P]` | range 6 `[P]` | P: keep allies adjacent so fewer cells turn to Roc |
| 5 | CD −1 | 4 cells `[P]` | 5 turns `[P]` | P: step off with a Pas (always allowed, §5.1) |
| 6 | CD −1 | slide 2 cells `[P]` | also 60 % PUI damage `[P]` | P: keep allies on both sides of a line to block the slide |
| 7 | CD −1 | Gouffre 5 turns `[P]` | range 6 `[P]` | S: leave the cell |
| 8 | CD −1 | 120° `[P]` | range 5 `[P]` | P: keep an Anchored or Stase ball in the hexagon |
| U-B | CD −1 | Gouffres 3 turns `[P]` | three sides, tell kept at 2 `[P]` | S: leave those two sides in time |

Specifics:

- **Séisme size** (F40): "2 sides (9 cells)" is true only on radius 4 (5 + 5 − 1). On radius 3 it is
  7 cells, on radius 5 it is 11. Proposed: always two adjacent sides including the shared corner.
- **Pont tell** (F41): a ball pushed onto the Pont on its last turn gets less than 2 turns of
  warning, yet §6.10 lists "Pont qui expire" in the ≥ 2-turn terrain exception. Proposed: at expiry
  the Pont ejects only balls that stood on it at the start of the previous turn of their entity;
  others are moved back onto the nearest board cell. Alternative: Pont lasts 3 turns. Owner decides.
- **Secousse targeting** (F17): §6.10 "En ligne" stops at the first ball, but Secousse moves "each
  ball of the line". New `Stop::FullLine` up to range 4.
- **Rotation direction**: chosen by the caster (clockwise or counter-clockwise), part of the target.
- **Effondrement tell** "end of the next enemy turn" is 1 tell turn, allowed because it removes at most
  the one ball on the marked cell (§6.10 rule 1).

Tests:

- Given Rotation on a hexagon with an enemy hero on an outer cell and a Slope, Then after rotation
  the hero, the terrain and the slope direction moved 60°; Given an Anchored ball in it, Then
  `BadTarget`.
- Given Pont beyond the edge and an ally pushed onto it, Then not ejected; at expiry, per F41 rule.
- Given Séisme on radius 4, Then 9 cells are marked; 2 turns later 3 balls on them are all removed
  (multi-removal allowed for tell ≥ 2).
- Given Secousse on a line with 3 balls and one blocked perpendicular cell, Then 2 balls slide and
  the blocked one stays.
- Given the hero on Lava at the end of its turn, Then no damage (Marche-pierre); a Fragment on Lava
  takes 10 % max HP.
- Given 3 own balls on special cells at turn start, Then Strata +10 +15.

Dependencies: `combat-engine` (terrain layer with durations, region mask for Pont), `world-generator`
(terrain catalog §5.1, biome tables, multi-tile boards), `ux-designer` (tells for Séisme,
Effondrement, Pont).

Risks: the Geomancer changes the board shape (Pont, Séisme, Rotation); every board-shape test of
`combat-engine` (perft, region mask) must run with temporary cells (risk R-5).

---

## 9. Biomes and terrain in class kits (§5.1, §5.2, §4.8)

| Rule | Implementation | Tag |
|---|---|---|
| Biome affinity: +10 % resource gained | `affinity_bp = 1000` in the gain formula (section 4.2), from `ClassDef.affinity_biomes` | `[T]` §5.2 |
| Sylve de Cendre: max range −1 | applied to `Range::Cells(n)` only, min 1; Adjacent and Self unchanged | `[T]` / min 1 `[P]` |
| Tourbières: Poison +1 turn | duration patch on Poison statuses applied in that biome | `[T]` |
| Dunes: resource −10 % except fire | `biome_malus_bp = 1000` on per-turn and event gains; abilities tagged Fire keep a 0 malus on **their own** resource gains (only Charge-like gains exist; F42: unclear) | `[T]` / reading `[P]` |
| Toundra: Frozen +1 turn | duration patch on Frozen | `[T]` |
| Caldeira: Burn +50 % | ratio patch on Burn | `[T]` |
| Le Puits: range −1 except on a Sanctuary | as Sylve, skipped if the caster hero is on a Sanctuary | `[T]` |
| Weather (v2): lightning +25 %, fire −25 %, sandstorm range −1 | element tag `Lightning`/`Fire` on `AbilityDef` | `[T]` §4.8 |

Every element-tagged ability is listed in the data (`element` field); integrity test: the Mage's
Fire abilities are Trait de feu, Mur de flammes, Météore; Lightning: Chaîne d'éclairs; Frost: Lance
de glace, Nova de givre, Sol verglacé, Zéro absolu. Other classes have `element: None` unless an
Huile consumable adds one (§15.4, `items-loot`).

Dependencies: `world-generator` (biome of the board, global rules as data), `combat-engine`.
Tests: one scenario per row (for example Given Sylve and Trait de feu at range 5, Then the target at
distance 5 is `OutOfRange`).

---

## 10. Item hooks into abilities (§12, §15.4)

Items are `items-loot`'s domain. This role defines the **patch interface** they use, so ranks,
Aspects and set bonuses go through one pipeline (section 6.4).

| Hook | Patch | Example from §12 | Tag |
|---|---|---|---|
| Aspect | `Vec<Patch>` on one ability | Coque du Monolithe: Ancrage `SetDuration` +1 turn | `[T]` |
| Set 2 pieces | `SetCost` relative | Ancre du Ballast: Forteresse −20 Bulwark | `[T]` |
| Set 4 pieces | a trigger (section 13 trigger format) | each enemy push blocked by Ancrage: +15 Bulwark | `[T]` |
| "+1 range for an ability" | `SetRange(+1)` | — | `[T]` |
| "+1 rank for an ability" | R1 → R2 only; R2 → R3 not allowed by items | — | `[P]` (F43) |

- "Faux du Puits" sets Relever les morts cooldown 0 and cost 50: `SetCost(50)`, `AddCooldown(−2)`.
  50 ≤ 100 max: valid.
- "Noyau de la Fournaise" (Trait de feu pierces 1 ball) duplicates nothing in table B (R3 A of
  Trait de feu is Burn 3 turns, chosen to avoid the overlap).
- Consumables (§15.4) use the Quick action slot, 1 per turn, 3 per fight; they are not abilities
  (no Overheat, no Silence, no Sand bonus loss).

Tests: Given the Monolith Aspect, Then compiled Ancrage lasts until the caster's second next turn
start (`UntilCasterNextTurn` + 1). Given an item "+1 rank" on an ability at R2, Then the compile is
refused with `RankOverflow`.

---

## 11. PvP and the class kits (§19, §6.11)

- Ranked arenas use a level-100 template (`pvp-br-designer`): every player has 99 passive and 20
  active points, so `validate_active` and `validate_passive` run with `level = 100`.
- Controls −1 turn, minimum 1 (section 7.1). Guard applies. DR applies.
- Runes and keystones with world or economy effects (gold, world speed, gathering, crafting, prices)
  are inert in combat and do nothing in PvP.
- **Pionnier** (keystone, changes 2 cells at placement) breaks the point-symmetric PvP start (§4.5);
  proposed: in PvP, the opponent's mirror cells change too (keeps symmetry) (F44).
- Edge danger alert for both sides (public, §6.6).
- Ladder for PvP balance: mirror matches of the 8 classes with the player bot, 28 pairings, win rate
  of any class pair between 35 % and 65 % (`[P]`), run nightly by `ai-engineer`.

---

## 12. Player bot rotations (§24.2 "script de rotation par classe")

`data/rotations/<class>.ron` is a priority list read by `ai-engineer`'s player bot. Format:

```ron
Rotation(class: "class.warrior", rules: [
  (cast: "ability.warrior.avalanche", when: [ResourceAtLeast(100), EnemyOnEdgeInPushReach]),
  (cast: "ability.warrior.breakthrough", when: [EqualCountPushEjects]),
  (cast: "ability.warrior.execute", when: [AdjacentEnemyHpBelow(3000)]),
  (cast: "ability.warrior.cleave", when: [AdjacentEnemy]),
  (cast: "ability.warrior.charge", when: [EnemyInLine(3)]),
])
```

The bot tries each rule in order on the Action and Quick slots, then lets the search pick the Move
(§5.3 order for monsters; for the player bot `ai-engineer` decides Move-first or Action-first).
Conditions are a small closed enum, one unit test each. This role writes and tunes the 8 files; the
ladder (each class beats the reference pack 7 to 9 times of 10, `[T]` `boss-balance.md`) is the
acceptance test of R2 and R9.

---

## 13. The Five Paths: passive tree (§9)

### 13.1 Structure and budget (§9.1), validation in `abalone-world/src/talents/passive.rs`

```rust
pub struct PassiveLoadout {
    pub primary: PathId,
    pub keystone: Option<(KeystoneId, u8)>,          // rank 1..=5
    pub runes: Vec<(RuneId, u8)>,                    // primary runes, rank 1..=5
    pub secondary: Option<PathId>,
    pub secondary_runes: Vec<(RuneId, u8)>,          // 2 runes, 2 different rows, rank 1..=5
    pub shards: [[u8; 3]; 3],                        // [row][shard] rank 0..=6
}
fn validate_passive(l: &PassiveLoadout, level: u8) -> Result<(), PassiveError>
```

| Rule | Value | Tag |
|---|---|---|
| Points | `level − 1` (1 at level 2, 99 at level 100) | `[T]` §9.1 |
| Keystone | 1 of 4 in the primary Path, ranks 1..5, one rank = 1 point | `[T]` |
| Primary runes | 3 rows of 3; at most 2 runes per row; ranks 1..5 | `[T]` |
| Secondary | another Path, no keystone, 2 runes from 2 different rows, ranks 1..5 | `[T]` |
| Shards | 3 rows (Offensive, Flexible, Defensive) × 3 shards, ranks 0..6 | `[T]` |
| Shard rank cap | `min(6, 1 + floor(level / 16))` | `[T]` |
| Row 1 gate | keystone rank ≥ 1 | `[T]` |
| Row 2 gate | ≥ 8 points in the Path **counted on the keystone and row 1 only** | 8 `[T]`, counting `[P]` (F54) |
| Row 3 gate | ≥ 16 points counted on the keystone, row 1 and row 2 | 16 `[T]`, counting `[P]` |
| Secondary gate | ≥ 20 points in the primary Path (keystone + runes) | `[T]` |
| Secondary rows | not gated (any row of the secondary Path) | `[P]` |
| One keystone active | yes | `[T]` |
| Reset | free under level 20, then `10 gold × level`; changing the primary Path resets all | `[T]`, price owned by `economy-merchants` |
| Where | Path Master in the hub | `[T]` |

`PassiveError`: `NotEnoughPoints`, `KeystoneNotInPrimary`, `RowFull`, `RowLocked{row, needed}`,
`SecondaryLocked`, `SecondaryRowsMustDiffer`, `SecondaryIsPrimary`, `RankOutOfRange`,
`ShardCapped{cap}`, `RuneNotInPath`. One test each.

Arithmetic checks (property tests, `[F]` once the numbers are accepted): 5 + 30 + 10 + 54 = 99; at
every level from 2 to 100 the spendable maximum (35 + 10 when primary ≥ 20, + 9 × cap) is ≥ the
points available, so a player can always spend every point; at level 80 the cap reaches 6.

### 13.2 Rank values (F45)

§9.1 says "rank 1 unlocks, ranks 2 to 5 strengthen" but gives one number per keystone and none for
most runes. Proposed uniform rule (PROPOSAL): the table value is the **rank-5 value** `v5`; rank `r`
gives `floor(v5 × (5 + r) / 10)` for scalar parts (60 % at rank 1, 100 % at rank 5). Binary parts
(a bonus Step, a once-per-fight effect, a range +1) are fully on from rank 1. Shards are linear:
`rank × per_rank`.

### 13.3 Trigger format (`kit/trigger.rs`)

Keystones, runes, traits and set bonuses are triggers:

```ron
Trigger(
  id: "path.precision.keystone.lethal_tempo",
  on: TurnEnd,                               // event
  when: [MoveThisTurnPushed],                // conditions (closed enum)
  effect: [Stack(id: "lethal_tempo", max: 4, per_stack: [StatMod(Atk, 500), StatMod(Pow, 500)])],
  reset_when: [TurnEndWithoutPush],
  icd: None,                                 // internal cooldown in own turns
)
```

Events (closed set, each emitted by `combat-engine`): `FightStart`, `Placement`, `TurnStart`,
`TurnEnd`, `MoveDone{pushed, ejected}`, `AbilityCast{id, kind, target_side}`,
`DamageDealt{target, amount, source}`, `DamageTaken{amount, magical}`, `HealDone{overflow}`,
`LossInflicted`, `LossNear{radius}`, `EjectionCaused`, `ControlApplied`, `HpCrossedBelow(bp)`,
`ShieldGained`, `SelfMoved` (teleport, charge). Triggers fire in a fixed order: entity order, then
trigger id order (§24.1).

### 13.4 Path content (§9.2)

All values are `v5` (rank 5). Values copied from §9.2 are `[T]`; every other number is `[P]`.
"Adaptive" = ATQ or PUI, whichever is higher (§9.2 shards). Ids are in the data files; English names
are display proposals.

**Precision (sustained damage and push)**

| Item | Effect at rank 5 | Implementation |
|---|---|---|
| K Press the Attack (Attaque soutenue) | 3 hits on the same ball within 2 own turns: it takes +12 % `[T]` damage for 3 turns `[T]` | counter per target on `DamageDealt`, applies Marked-like `StatMod` |
| K Lethal Tempo (Tempo mortel) | each consecutive own turn with a push: +1 stack, max 4 `[T]`, +5 % `[T]` ATQ and PUI per stack | above example |
| K Conqueror (Conquérant) | +1 stack per damaging cast or Shock, max 6 `[T]`; at 6, heal 8 % `[T]` of damage dealt | `DamageDealt`, heal on the same event |
| K Fleet Footwork (Jeu de jambes) | every 3 own turns `[T]`: the next damaging cast heals the hero 10 % `[T]` of its max HP `[P]` (F45) and gives a bonus Step | `icd: 3`, Turn BonusStep (respects 1 per turn) |
| R1 Overheal (Surplus de soins) | overheal becomes a shield, cap 10 % max HP `[P]` | `HealDone{overflow}` |
| R1 Triumph (Triomphe) | on a Loss inflicted: heal 10 % max HP `[P]`, +gold (`economy-merchants`) | `LossInflicted` |
| R1 Presence of Mind (Présence d'esprit) | on a Loss inflicted: +15 resource `[P]` (Sand: +1 from rank 3 `[P]`) | `LossInflicted` |
| R2 Legend: Haste | +25 Haste `[P]` | stat |
| R2 Legend: Bloodline (Lignée) | +5 % lifesteal `[P]` | stat |
| R2 Legend: Tenacity | +50 Tenacity `[P]` (reaches the 50 threshold only at rank 5) | stat |
| R3 Coup de Grace | +10 % damage on targets under 40 % `[T]` HP | `bonus_if` |
| R3 Cut Down (Abattage) | +10 % damage on targets with more max HP than the hero | `bonus_if` |
| R3 Last Stand (Dernier rempart) | +12 % damage while the hero is under 40 % HP `[P]` | `bonus_if` |

**Domination (burst, ejection, hunt)**

| Item | Effect at rank 5 | Implementation |
|---|---|---|
| K Electrocute (Électrocution) | 3 different sources on the same enemy ball in one own turn (Shock, Action, Quick action) `[T]`: +40 + 30 % adaptive magic damage `[P]`, icd 3 `[P]` | per-turn source set per target |
| K Dark Harvest (Moisson noire) | +15 % damage on targets under 50 % `[T]` HP, +1 % per soul (1 soul per Loss inflicted, kept for the fight `[T]`, max 15 souls `[P]`) | stack, `bonus_if` |
| K Hail of Blades (Grêle de lames) | the first 2 `[T]` abilities of the fight cost 50 % `[T]` less (main resource only, never combo `[P]`, F57) | cost patch with counter |
| K Edge Executioner (Bourreau du bord) | per ejection caused: hero Weight +1, max +2 `[T]` (cap 5), +20 `[T]` resource | `EjectionCaused`; Weight part is `floor(2 × (5 + r) / 10)` |
| R1 Cheap Shot (Coup bas) | +10 % damage on a controlled target `[P]` | `bonus_if` |
| R1 Taste of Blood (Goût du sang) | hitting a hero heals 5 % max HP, once per turn `[P]` | `DamageDealt` |
| R1 Sudden Impact (Impact soudain) | after a self-move this turn, the next damaging cast ignores 15 % of defence `[P]` (F50: "pénétration" is not a §7.1 stat; defined here as % of ARM or RES ignored) | `SelfMoved` |
| R2 Trophies (Trophées) | +1 % `[T]` damage per Loss inflicted this fight, max +10 % `[T]` | stack |
| R2 Watcher (Guetteur) | +1 `[T]` range against Isolated balls (binary) | range patch with condition |
| R2 Edge Pressure (Pression du bord) | +15 % `[T]` damage on balls on the edge | `bonus_if TargetOnEdge` |
| R3 Ultimate Hunter | ultimate cooldown −1 `[T]` (binary; not Haste, so allowed on ultimates) | `AddCooldown(−1)` on the ultimate |
| R3 Ingenious Hunter | +1 consumable use per fight at rank 5 only `[P]` (F51: consumables have no cooldown) | consumable cap |
| R3 Relentless Hunter | +10 % world move speed `[P]` (world only) | `world-generator` |

**Sorcery (resource and abilities)**

| Item | Effect at rank 5 | Implementation |
|---|---|---|
| K Summon Aery (Lucine) | an ability cast on an ally also shields it 15 % PUI; on an enemy, +15 % PUI magic damage `[P]` | `AbilityCast` |
| K Arcane Comet (Comète arcanique) | a damaging ability calls a comet on the target cell: next own turn start, radius 1, 40 % adaptive magic to enemies `[P]`, icd 3 `[P]`; tell visible `[T]` | Mark |
| K Phase Rush (Ruée de phase) | 3 abilities within 2 own turns `[T]`: a bonus Step now, then Insaisissable from the end of this turn until the next turn start (F46) | stack window |
| K Overload (Surcharge) | resource max +30 % `[T]`; when the resource is full, the next ability is free `[T]` (main resource only) | resource def patch |
| R1 Nimbus Cloak (Cape de nimbe) | a bonus Step after casting the ultimate (binary) | `AbilityCast{ultimate}` |
| R1 Manaflow Band (Ruban de mana) | resource max +15 % `[P]` | resource patch |
| R1 Nullifying Orb (Orbe annulant) | once per fight, when one hit removes ≥ 15 % max HP as magic damage: shield 15 % max HP `[P]` | `DamageTaken{magical}` |
| R2 Transcendence | +25 Haste `[P]` | stat |
| R2 Celerity (Célérité) | +5 VIT `[P]` | stat |
| R2 Absolute Focus (Concentration absolue) | +10 % damage while the hero is above 70 % `[T]` HP | `bonus_if` |
| R3 Scorch (Brûlure) | damaging abilities Burn the target 10 % adaptive for 2 turns, once per turn `[P]` | `DamageDealt` |
| R3 Waywalker (Arpenteur) | +10 % ATQ, PUI, ARM, RES while the hero is on a special cell `[P]` | aura |
| R3 Gathering Storm (Tempête grandissante) | PUI +1 % `[T]` per own turn of the fight, max +25 % `[P]` | stack |

**Resolve (tank, Weight, anchoring)**

| Item | Effect at rank 5 | Implementation |
|---|---|---|
| K Grasp of the Undying (Poigne de l'immortel) | every 3 `[T]` own turns, the next hit on an adjacent enemy deals +4 % of the hero's max HP as magic damage, heals 2 % max HP, +1 % max HP until fight end `[P]` | icd 3 |
| K Aftershock (Répercussion) | after the hero applies a control: +50 % `[T]` ARM and RES for 2 `[T]` turns, then a shockwave radius 1, 40 % adaptive magic to enemies `[P]`, icd 4 `[P]` | `ControlApplied` |
| K Guardian (Gardien, F25) | when an adjacent ally takes damage: shield of 8 % of the hero's max HP on it, once per turn `[P]` | `DamageTaken` on neighbours |
| K Unshakable Rock (Roc inébranlable) | +2 `[T]` Weight when resisting a push only; +20 % `[T]` ARM and RES while on the edge | `PushMod.resist_weight`, aura |
| R1 Demolish (Démolition) | +20 % damage against summoned structures (boss totems, Artificer turrets v2) `[P]` (F47: Rocs have no HP) | `bonus_if` |
| R1 Font of Life (Fontaine de vie) | when the hero controls an enemy, allies that hit it this turn heal 2 % max HP `[P]` (F53: no effect text) | `ControlApplied` mark |
| R1 Bulwark Strike (rune "Coup de bouclier", F25) | after the hero gains a shield, its next damaging cast adds 20 % of the current shield as damage `[P]` (F53) | `ShieldGained` |
| R2 Conditioning (Conditionnement) | after 6 `[T]` own turns: +10 % ARM and RES `[P]` | `TurnStart` counter |
| R2 Second Wind (Second souffle) | after taking damage, regen 2 % max HP at each own turn start `[P]` | `DamageTaken` |
| R2 Bone Plating (Plaque d'os) | after 3 hits in one enemy turn, the next 3 hits are −15 % `[P]` | counter |
| R3 Overgrowth (Croissance excessive) | +1 % max HP per Loss within radius 2, max +10 % `[P]` | `LossNear(2)` |
| R3 Revitalize | heals and shields received +10 % `[P]` | stat |
| R3 Unflinching (Inébranlable) | +30 Tenacity `[P]`; the first control of the fight is ignored (binary) | stat + flag |

**Inspiration (utility and life outside combat)**

| Item | Effect at rank 5 | Implementation |
|---|---|---|
| K Glacial Augment (Renforcement glacial) | the hero's controls put Ice under the target if it is a Normal cell, 3 turns at rank 5 (1 at rank 1) `[P]` | `ControlApplied` |
| K Unsealed Spellbook (Grimoire descellé) | once per fight `[T]`, swap one equipped non-ultimate ability for another learned one; it starts on full cooldown (rank 1), half (rank 3), ready (rank 5) `[P]` (F59) | special cast, out of the action slots |
| K First Strike (Premier coup) | if your entity takes the first turn of the fight: +15 % damage during that turn, +10 % gold `[P]` | `FightStart` |
| K Pioneer (Pionnier) | at placement, change 2 `[T]` cells on your side (1 at ranks 1 to 4) among Normal, Fourré, Hauteur, Boue, Eau `[P]`; never on start cells; PvP mirrored (F44) | `Placement` |
| R1 Stealth Step (Pas furtif) | a bonus Step every 4 `[T]` own turns (binary) | icd 4 |
| R1 Magical Footwear (Bottes magiques) | +10 % world move speed `[P]` | world |
| R1 Pocket Hourglass (Sablier de poche) | once per fight `[T]`, a self Stase on the hero (Quick action) | innate cast |
| R2 Prospector, Artisan, Merchant | gathering yield +10 %, craft quality +1 step, buy −10 % and sell +10 % `[T]` | `gathering-crafting`, `economy-merchants` |
| R3 Cosmic Insight (Perspicacité cosmique) | +25 Haste `[P]` | stat |
| R3 Terrain Knowledge (Connaissance du terrain) | +5 % `[T]` stats on an affinity biome | aura |
| R3 Ration Delivery (Livraison de rations) | 1 free consumable per fight `[T]`, outside the 3-per-fight cap `[P]` (F52) | consumable source |

**Shards** (6 ranks, ~+2 % per rank `[T]`; per-rank values `[P]`):

| Row | Shard | Per rank | Rank 6 |
|---|---|---|---|
| Offensive | Adaptive force | +2 % ATQ or PUI (higher) | +12 % |
| Offensive | Haste | +5 Haste | +30 (one Haste step) |
| Offensive | Penetration | ignore 2 % of ARM or RES | 12 % |
| Flexible | Adaptive force | +2 % | +12 % |
| Flexible | VIT | +1 VIT | +6 |
| Flexible | Scaling HP | +(2 × level) bp max HP | +12 % at level 100 |
| Defensive | HP | +2 % max HP | +12 % |
| Defensive | Tenacity | +10 Tenacity | +60 |
| Defensive | ARM and RES | +2 % each | +12 % |

Risk: three Haste runes (Legend: Haste, Transcendence, Cosmic Insight) plus the Haste shard all
feed one stat capped at −2 turns (§7.1): stacking them is a trap choice (F56).

### Dependencies (section 13)

`stats-progression` (stat application of shards, level), `combat-engine` (events of 13.3),
`economy-merchants` (reset price, gold runes), `gathering-crafting` (life runes), `world-generator`
(world speed runes), `client-ui` / `ux-designer` (Paths window).

### Tests (section 13)

- Given level 2 and keystone Lethal Tempo rank 1, Then valid; Given a row-1 rune without keystone,
  Then `RowLocked{1}`.
- Given 7 points on keystone + row 1, When a row-2 rune is added, Then `RowLocked{2, 8}`.
- Given primary Precision with 19 points, When a secondary rune is added, Then `SecondaryLocked`.
- Given level 15 (cap 1), When a shard is at rank 2, Then `ShardCapped{1}`; at level 16, Then cap 2.
- Given level 100 and a full loadout (5 + 30 + 10 + 54), Then valid and 0 points left.
- Property: for every level 2..=100, a greedy spender can always spend all points.
- Given Lethal Tempo rank 5 and pushes on 5 consecutive own turns, Then 4 stacks, ATQ +20 %; a turn
  without push, Then 0 stacks.
- Given Edge Executioner rank 1 and 2 ejections, Then Weight +1 (rank-1 scalar floor(2 × 6 / 10) = 1).
- Given Phase Rush trigger, Then the hero can take its bonus Step this turn, then becomes
  Insaisissable at the end of the turn.

---

## 14. Data integrity tests (§24.3) — `crates/abalone-rpg/tests/kit_integrity.rs`

- 8 classes, each with 2 branches of 4 abilities + 1 ultimate; 80 abilities in total; ids unique.
- Every reference exists (class, resource, trait, ability, path, keystone, rune, shard, status,
  terrain kind, element).
- Every ability has `counter_key`, `kind`, `cost`, `cooldown`, `range`, `targeting`, and an i18n
  string in `fr` and `en`.
- No cost exceeds the resource max (after R2, both variants, known Aspects and set bonuses).
- Every `Ejector` ability is an ultimate or has `tell ≥ 1`; every ability that can remove more than
  one ball is terrain with `tell ≥ 2`; no non-Ejector effect can move a ball off the board.
- Every `MassHardControl` targets at most 3 balls (base, R2, both variants).
- No variant adds a second bonus Step per turn.
- Rank costs are 1/1/2 and the maximum of 5 equipped abilities is 20 points.
- Passive budgets: 5 + 30 + 10 + 54 = 99; rows of 3; 4 keystones per Path; 9 shards.
- Every trigger event is in the closed event set.
- Every class has a rotation file and every ability in it exists.

---

## 15. Playwright e2e (player-facing, CONTRIBUTING §11)

Each flow is added by the Task that makes it visible, with `client-ui` building the UI part. Files
under the existing e2e folder, one per flow:

| Phase | File | Flow (Given/When/Then) |
|---|---|---|
| R1 | `rpg-warrior.spec.ts` | Given the R1 fight, When the player presses `1` (Charge) and clicks a target cell, Then the hero moves and the Rage gauge shows 20; When `2` (Fendoir) on an adjacent enemy, Then its HP ring drops and the ability shows cooldown 1 |
| R2 | `rpg-classes.spec.ts` | For Warden, Warrior, Mage, Healer: pick the class, cast one ability per branch and the ultimate (test resource injected by a debug seed), Then each card shows its cooldown and the gauge text is "Name value of max" |
| R2 | `rpg-edge-danger.spec.ts` | Given the hero on the edge and an enemy Percée ready, Then the Edge danger glyph shows; When Ancrage is cast, Then it disappears |
| R3 | `rpg-active-tree.spec.ts` | Given a level-30 Warrior save, When the player spends points as in the §10 example, Then Avalanche unlocks and can be equipped in the R slot |
| R3 | `rpg-paths.spec.ts` | Given a level-20 save, When the player picks Precision, a keystone and 8 points, Then row 2 unlocks; When a secondary Path is opened, Then it is refused until 20 points |
| R9 | `rpg-classes.spec.ts` (extended) | The 4 new classes, same flow |
| R10 | `rpg-arena.spec.ts` | Two tabs, normalized arena, a control lasts 1 turn less than in PvE |

---

## 16. Feedback on the gameplay spec

Contradictions (C) and gaps (G) found while building this domain. The gameplay spec is not modified;
each item has a proposal used in this file until an owner decides.

| # | Type | Where | Issue | Proposal used here |
|---|---|---|---|---|
| F1 | C | §6.3 durations vs §8 self buffs | A status ticks at the end of every turn of its bearer, so a "1 tour" buff cast on own balls during own turn (Forteresse, Aube, Cri de guerre) expires before the opponent plays | The turn of application does not count when the bearer is the active entity (section 3.4) |
| F2 | G | §6.10 "12 primitives" | Push rule changes (Percée, Avalanche, Bélier, Titan, Écrasement), history (Retour, Paradoxe, Rembobiner), damage redirection (Interposition, Lien vital, Martyr, Bouclier de mana, Retour de souffrance), board shape (Pont, Rotation) do not fit the 12 primitives | Named native mechanics filed under the closest primitive (section 3.6) |
| F3 | C | §6.3 vs §8.2, §8.4 | §6.3 puts "l'ultime" in the Action slot, but Titan and Martyr are typed Rapide | An ultimate uses the slot of its own kind |
| F4 | G | §6.10, §24.3 vs §8 | Every ability needs a written counter; 60 of the 80 have none | Counters proposed in tables B (section 8) |
| F5 | G | §8.2, §8.3, §8.8 | No start value for Rage, Energy, Strata | 0, 100, 30 |
| F6 | C | §6.1 vs §8.4, §8.5 | "Ressources remises à zéro" at fight end, but the Healer starts at 50 and the Mage at 100 | Reset to the class start value |
| F7 | G | §8.1 | "+10 per allied ball damaged or pushed": per ball or per event? A 3-ball push with Shock gives +60 | Per ball, max +30 per enemy action |
| F8 | G | §8.6 | Pacte de sang is a Quick action outside the 4 + 1 bar; can it kill the hero? | Innate class action; refused at ≤ 10 % HP |
| F9 | G | §6.2, §8 | "Allié" is undefined in group fights (own balls only, or the whole camp?) | The whole camp; "own" when an ability moves balls (§6.0) |
| F10 | G | §6.5, §6.6, §8.4, §8.5 | No order between Guard, shields, Martyr, Lien vital, Interposition, Bouclier de mana, lifesteal; Guard scope for DoT ticks | Fixed order in section 3.8; one Guard bucket per cast, DoT ticks separate |
| F11 | G | §6.6 | Edge danger uses `legal_moves`, which ignores push modifiers the opponent can cast this turn (Percée, Bélier, Avalanche, Titan) | Alert also checks castable push modifiers (section 3.7) |
| F12 | G | §8.2 Écrasement | Which ball is "coincée", what conditions apply, does it use the Move? | Action; normal push conditions except the blocked cell; the last ball of the file takes the damage |
| F13 | G | §10 tiers | "2 points dans la branche" / "4 points": does the ability being learned count? | Counted on the other abilities of the branch |
| F14 | G | §6.9 | The keyword "Escouade" exists but no ability of §8 uses it | Kept in the format for Aspects and v2 |
| F15 | G | §10 R2 | "+25 % or −1 turn" has no meaning for the once-per-fight Chronomancer ultimates | R2 = cost −1 sand for those two |
| F16 | G | §6.11 | Provocation (Taunt) is in no diminishing-returns category | Category Cast |
| F17 | C | §6.10 "En ligne" vs §8.8 Secousse | "En ligne" stops at the first ball, Secousse moves every ball of the line | New targeting `FullLine` |
| F18 | G | §6.9 vs §8 | §6.9 promises a class squad bonus; only Warden, Warrior and Necromancer have one | Bonuses proposed for the 5 others (section 7.2) |
| F19 | G | §8.1 Mur de boucliers | A Roc is neutral (§5.1); "Roc allié" has no rule | Same rules as Roc; "allié" = owner for duration and colour |
| F20 | G | §7.1 Lest vs VIT | Does −3 VIT per extra Weight apply to combat buffs (Titan, Peau de fer, Bourreau du bord)? | Items only |
| F21 | G | §8.1 Séisme du Lest, §8.5 Météore | "Recule en s'éloignant" is undefined for off-axis balls and for the centre ball | Direction that increases distance most, fixed tie order |
| F22 | C | §6.10 resolution order vs recoil areas | Nearest first makes near balls bump into farther ones that have not moved yet | Farthest first for recoil areas |
| F23 | G | §8.3 Lame empoisonnée | "3 attaques" undefined (casts, hits, Shocks?) | One charge per damaging cast, all its targets |
| F24 | G | §8.3 Danse des lames | Jump path and landing cells undefined | Caster orders targets, lowest free neighbour in fixed order |
| F25 | G | Names | Collisions: Gardien (class and keystone), Coup de bouclier (ability and rune), Décrépitude (ability and Revenant rule), Paradoxe (Sand rule and ultimate), Hâte (stat and ability), Élan (Warrior trait and mount), Rempart (resource and Rempart tellurique) | English dotted ids; Sand rule renamed "Debt" |
| F26 | G | §8.4 vs §9.2 | Healer's Lumière accumulée and the Surplus de soins rune do the same thing | Caps add up into one shield |
| F27 | C | §5.1 "une règle par type" vs §8.4 Source | Source's Sanctuary heals 50 % PUI on neighbours, unlike the §5.1 Sanctuary | Real Sanctuary plus a separate heal Mark |
| F28 | C | §8.5 Résonance vs §6.11 | "Gelé" is both the reaction state and a hard control; after Gelé the target is immune to Hard controls, so Vapour (a Stun) can never land | Separate "Chilled" state; Lance de glace applies it |
| F29 | G | §8 | Friendly fire is never stated (Météore "les boules", Explosion de cadavre "les boules") | Damage hits enemies only unless stated; forced moves follow the wording |
| F30 | G | §6.6, §8.6 | Can a hero (PvP or group) be raised as a Revenant? | Never |
| F31 | G | §8.6 Explosion de cadavre | Damage type of "30 % des PV max d'origine" | Magical |
| F32 | G | §8.6 Armée des morts | Where entries without Remains appear; which extra Revenants crumble | Remains cell or nearest free to the hero; lowest HP crumble first |
| F33 | G | §7.1, §5.2 vs §8.7 | Percent gain bonuses (VIT, affinity, runes) round to 0 on +1 Sand | Sand ignores percent bonuses; the Chronomancer's affinity bonus is dead (owner may give it another form) |
| F34 | G | §8.7 Instant suspendu | "La poussée échoue": is the pusher's Move spent? Does it apply to terrain or Éjecteur abilities? | Move spent, pushes only |
| F35 | C | §8.7 | Both ultimates cost 6, so each triggers the "more than 4 in one turn" penalty | Kept as written, flagged |
| F36 | G | §8.7 Retour, Paradoxe | Old cell now Gouffre, Roc, gone (Pont) or occupied by a new ball | Fail and refund (Retour); nearest free cell (Paradoxe); never ejects |
| F37 | C | §8.7 Hâte vs §6.0 | A bonus Step on another player's ball contradicts "une entité ne déplace que ses propres boules" | Own balls only |
| F38 | G | §8.8 Marche-pierre | "Effets négatifs du terrain" not listed | Closed list in section 8.8 |
| F39 | G | §8.8 Sables | Shape of the "3 cases vides" | Any 3 empty cells in range |
| F40 | C | §8.8 Séisme | "2 côtés (9 cases)" is only true on radius 4 | Two adjacent sides, size depends on radius |
| F41 | C | §8.8 Pont vs §6.10 rule 2 | A ball pushed onto the Pont late gets less than 2 turns of warning, yet Pont is in the ≥ 2-turn exception | Only balls there since their previous turn are ejected; owner may prefer 3 turns |
| F42 | G | §5.2 Dunes | "Ressource gagnée −10 %, sauf pour les capacités de feu": resources are mostly gained per turn, not by abilities | Malus on all gains; owner to clarify |
| F43 | G | §12 "+1 rang" affix | R3 is a variant choice costing 2 points; what does +1 rank give at R2? | R1 → R2 only |
| F44 | C | §9.2 Pionnier vs §4.5 | Changing 2 cells breaks the point-symmetric PvP start | Mirror the change on the opponent's side in PvP |
| F45 | G | §9.1, §9.2 | Ranks 2 to 5 "renforcent" with no numbers; most runes have no number | Table value = rank 5; rank r = 60 % to 100 % (section 13.2) |
| F46 | C | §9.2 Ruée de phase vs §6.11 | Gives a bonus Step and Insaisissable, which forbids moving oneself | Step first, Insaisissable from the end of the turn |
| F47 | G | §9.2 Démolition | Rocs have no HP; nothing to damage | Targets summoned structures (boss totems, v2 turrets) |
| F48 | C | §6.4 | "Seules les capacités qui le disent poussent à nombre égal : Percée, Avalanche"; Avalanche is 4 against at most 3, not equal | Only Percée allows equal count |
| F49 | G | §8 | Missing ranges: Éventration, Fumigène, Lien vital, Déjà-vu, Écrasement | Adjacent, 3, 3, 4, inline group |
| F50 | G | §9.2 shards | "Pénétration" is not a §7.1 stat | % of ARM or RES ignored |
| F51 | G | §9.2 Chasseur ingénieux | Consumables have no cooldown (§15.4) | +1 consumable use per fight at rank 5 |
| F52 | G | §9.2 Livraison de rations vs §15.4 | Does the free consumable count in the 3-per-fight cap? | Outside the cap |
| F53 | G | §9.2 Volonté row 1 | Fontaine de vie and Coup de bouclier (rune) have no effect text | Effects proposed in section 13.4 |
| F54 | G | §9.1 gates | "8 points dans la Voie": does a row-2 rune count toward its own gate? | Counted on the rows above only |
| F55 | G | §8.3 | Energy "+30 par tour, fixe": immune to VIT and affinity bonuses? | Yes, unscaled |
| F56 | G | §9.2 | Three Haste runes plus a Haste shard feed one stat capped at −2 turns | Flagged as a trap choice; owner may replace two |
| F57 | G | §9.2 Grêle de lames | "Coûtent 50 % de moins" for Assassinat (Energy and 5 combo) | Main resource only |
| F58 | G | §9.2 Surcharge vs §8.3 | With +30 fixed Energy and max 100, the Assassin is full almost every turn: a free ability per turn | Flagged for the ladder; owner may exclude Energy |
| F59 | G | §9.2 Grimoire descellé | Cooldown state of the swapped-in ability | Full, half or ready by rank |
| F60 | C | §6.6 hero answers | Interposition is listed as a hero protection, but it moves damage **to** the hero | It protects allies; listed as such in section 7.3 |
| F61 | G | §8.4 Purification | "Tous les statuts négatifs": includes Lassitude, DR immunity, Vitrification stacks? | Removes §6.11 negative statuses and Vitrification; never Lassitude or DR immunity |
| F62 | G | §6.10, §6.11 | "Statuts négatifs" and "contrôle" are used without a list of which statuses are negative | Negative = Stunned, Frozen, Silence, Blinded, Rooted, Taunt, Bleed, Poison, Burn, Weight down, Marked, element states |

---

## 17. Open questions

1. F1: accept "the application turn does not count" for own-turn statuses, or rewrite every self
   buff as "until your next turn"?
2. F28: accept the separate "Chilled" state for the Mage, or drop Vapour?
3. F41: Pont ejection rule, or lengthen Pont to 3 turns?
4. F45: are spec numbers rank-5 values (this file) or rank-1 values?
5. F2: accept native mechanics under the 12 primitives, or add a 13th "Rule" primitive?
6. Starting resources (F5) and the Warden's empty first turn (risk R-1): keep Bulwark start 0?
7. Should the Assassin, Mage and Chronomancer (Weight 1 heroes) get a passive edge answer, or is
   Insaisissable / Blink / Instant suspendu enough? Decided by the R2 and R9 ladders (§26 Q10).
8. Hardcore mode (§11): any kit difference (for example no Pacte de sang)?
9. Are runes with world or economy effects (Triumph gold, Relentless Hunter, Prospector, Merchant)
   worth a combat point at all, or should they move to a separate "life" budget?
10. Friendly fire (F29): one global rule, or per ability?
11. §26 Q8: same Fragments for every class (this file) or class squads in v2?
12. Who owns active and passive validation code: this role (as written) or `stats-progression`
    (§24.2 puts it in `abalone-world`)?

### Risks (whole domain)

- R-1 Warden turn 1 with Bulwark 0 and costs ≥ 15.
- R-2 Weight-1 heroes ejected in 3 turns in PvP (§26 Q10); first lever is the alert and Formation.
- R-3 History-based abilities need the snapshot ring in the state hash or P2P replays diverge.
- R-4 Necromancer stall: Revenant deaths are not Losses, so the 60-turn no-Loss draw still triggers;
  check average fight length on the ladder.
- R-5 Geomancer board-shape changes stress the region mask and the perft invariant.
- R-6 Surcharge on Energy (F58).
- R-7 320 scenario files are a lot of content; the scenario format (section 2.1) keeps each one
  around 20 lines, and they are split across Tasks by class.

---

## 18. Tasks (one PR each)

Each Task: title, one-sentence outcome, done checklist, roadmap phase (§25). Every code Task also has
the standard checklist of CONTRIBUTING §5 (TDD commit order, 100 % line and region coverage, local
checks, one e2e run, screenshot if the UI changes). Dependencies on other roles are noted; a Task is
Ready only when its dependencies are merged.

### R0: spec

**CD-01. Docs: `rpg/classes.md` and `rpg/talents.md`** (phase R0)
Outcome: the class kits, the 80 abilities with ranks, variants and counters, the active tree and
the Five Paths are in the repo in English, as this role's part of PR 2 of §0.
- [ ] `classes.md`: sections 4, 5, 7, 8, 9, 10, 11 of this file, tables A and B for 8 classes.
- [ ] `talents.md`: sections 6 and 13.
- [ ] Feedback items F1 to F62 answered by an owner or listed as open in the docs.
- [ ] Docs-only PR, merged by @TidyMaze (admin bypass).

### R1: minimal combat (Warrior level 1, 2 abilities)

**CD-02. Kit data schema and loader** (R1)
Outcome: `ClassDef`, `ResourceDef` and `AbilityDef` load from `data/` and the integrity test runs on
the Warrior with Charge and Fendoir.
- [ ] `kit/mod.rs`, `kit/ability.rs` types; `data/classes/warrior.ron`, `data/abilities/warrior.ron`
  (2 abilities).
- [ ] `kit_integrity.rs` with the checks of section 14 that apply to 1 class.
- [ ] Depends on `tech-lead` (loader, RON or JSON).

**CD-03. Class resources: model and Rage** (R1)
Outcome: an entity's resource gains, spends, decays and resets by data, and the Warrior's Rage
follows §8.2 exactly.
- [ ] `kit/resource.rs`: start, max, per-turn, event gains, decay, reset to start.
- [ ] Rage scenarios of section 4 (push +15, Loss +25, hit ≥ 10 % +10, no push −10).
- [ ] Depends on `combat-engine` events (`PushSucceeded`, `LossInflicted`, `TurnEnd`).

**CD-04. Casting: slots, costs, cooldowns, legal casts** (R1)
Outcome: `can_cast` and `legal_casts` decide every cast with the error order of section 3.5.
- [ ] `kit/cast.rs` with every `CastError` variant tested.
- [ ] Cooldown formula with R2 and Haste placeholders (Haste 0 in R1).
- [ ] Property: every `legal_casts` entry applies.

**CD-05. Warrior: Charge, Fendoir, Élan, squad** (R1)
Outcome: the R1 Warrior plays his two abilities, his trait and his squad bonus as specified.
- [ ] Scenarios: Charge (with and without an enemy after), Fendoir (Isolated and not), Élan Shock.
- [ ] Squad +10 % ATQ on Fragments.
- [ ] Playwright `rpg-warrior.spec.ts` (with `client-ui`), screenshot in the PR.

**CD-06. Warrior rotation for the player bot** (R1)
Outcome: the R1 player bot uses Charge and Fendoir through `data/rotations/warrior.ron`.
- [ ] Rotation format and its condition enum, each condition unit-tested.
- [ ] Depends on `ai-engineer` (bot runner).

### R2: 4 classes, statuses, 6 terrain types

**CD-07. Push modifiers and the Warrior's Assault branch** (R2)
Outcome: Percée, Cri de guerre and Avalanche work through `PushMod`, and the Edge danger alert sees
castable modifiers.
- [ ] `kit/special/push_mod.rs`; §6.4 example with Percée; Avalanche 4-ball group.
- [ ] Classic perft unchanged with `max_group = 3`.
- [ ] Depends on `combat-engine` (`PushContext`).

**CD-08. Warrior: Brute branch** (R2)
Outcome: Tourbillon, Peau de fer, Écrasement, Exécution and Titan behave as in section 8.2.
- [ ] `kit/special/crush.rs`; one scenario per ability.

**CD-09. Damage routing pipeline** (R2)
Outcome: Interposition, Lien vital, Martyr, Bouclier de mana, Guard and shields resolve in the fixed
order of section 3.8.
- [ ] `kit/special/redirect.rs`; one test per step and the combined scenario.
- [ ] Depends on `combat-engine` damage hook.

**CD-10. Warden: Bulwark, Sentinelle, Bastion branch, Forteresse** (R2)
Outcome: the Warden's resource, aura, squad bonus and Bastion abilities work, including the
duration rule of section 3.4 for Forteresse.
- [ ] Scenarios for Ancrage, Provocation, Interposition, Mur de boucliers, Forteresse.
- [ ] Depends on CD-09 and on `combat-engine` (duration rule F1, Inamovible, Inéjectable).

**CD-11. Warden: Reprisal branch and Séisme du Lest** (R2)
Outcome: Coup de bouclier, Épines, Bélier, Chaîne d'ancre and Séisme du Lest work, with the recoil
direction and farthest-first order.
- [ ] Recoil rule tests (on-axis, off-axis, tie order).

**CD-12. Healer: Faith, Grâce, Restoration branch, Aube** (R2)
Outcome: heals, overheal shield, Grâce, Source and Aube work.
- [ ] Scenarios incl. Usure and Poison on heals.

**CD-13. Healer: Discipline branch and Martyr** (R2)
Outcome: Transfert, Éblouissement, Lien vital, Halo de répulsion and Martyr work.
- [ ] Hero-protection scenario for Transfert (section 7.3).

**CD-14. Mage: Mana, Overheat, Résonance** (R2)
Outcome: Overheat costs and the three reactions work, with the Chilled state if F28 is accepted.
- [ ] `kit/special/resonance.rs`; DR interplay test.

**CD-15. Mage: Fire and Lightning branch, Météore** (R2)
Outcome: Trait de feu, Clignement, Chaîne d'éclairs, Mur de flammes and Météore work.
- [ ] Météore tell and single ejection.

**CD-16. Mage: Frost and Arcane branch, Zéro absolu** (R2)
Outcome: Lance de glace, Bouclier de mana, Nova de givre, Sol verglacé and Zéro absolu work.
- [ ] Mass control cap 3; Ice slide ejection by Move.

**CD-17. R2 rotations, ladder and browser check** (R2)
Outcome: the 4 R2 classes each beat the reference pack on the bot ladder and are playable in the
browser.
- [ ] Rotations for Warden, Healer, Mage; Warrior updated.
- [ ] Ladder result 7 to 9 of 10 per class (`ai-engineer`, `encounter-boss-designer` reference pack).
- [ ] Playwright `rpg-classes.spec.ts` and `rpg-edge-danger.spec.ts` with `client-ui`.

### R3: progression

**CD-18. Active tree validation** (R3)
Outcome: `validate_active` enforces points, tiers, rank order, variants and equipment.
- [ ] Every `TalentError`; the §10 Warrior example as a fixture.

**CD-19. Ranks and kit compilation** (R3)
Outcome: R2 and R3 patches compile into a `CompiledKit` in the order of section 6.4, hashed in the
fight state.
- [ ] Every `Patch` kind tested; compile determinism property.

**CD-20. R2 and R3 data: Warden and Warrior** (R3)
Outcome: the 20 abilities of the two classes have their R2 and both variants in data with scenarios.
- [ ] 60 scenario files; integrity checks on variants.

**CD-21. R2 and R3 data: Healer and Mage** (R3)
Outcome: same for the Healer and the Mage.
- [ ] 60 scenario files.

**CD-22. Five Paths validation** (R3)
Outcome: `validate_passive` enforces budget, gates, secondary, shard cap and reset rule.
- [ ] Every `PassiveError`; spend-all property for levels 2 to 100.

**CD-23. Passive trigger engine and shards** (R3)
Outcome: keystones, runes and shards run from data through `kit/trigger.rs` with the rank scaling of
section 13.2.
- [ ] Closed event set; fixed firing order; 9 shards.

**CD-24. Precision Path** (R3)
Outcome: the 4 keystones and 9 runes of Precision work in combat.
- [ ] One scenario per keystone and rune at rank 1 and rank 5.

**CD-25. Resolve Path** (R3)
Outcome: the 4 keystones and 9 runes of Resolve work in combat (second R3 Path).
- [ ] Same checklist; Playwright `rpg-active-tree.spec.ts` and `rpg-paths.spec.ts` with `client-ui`.

### R4, R5, R8: world, items, bosses

**CD-26. Biome rules in class kits** (R4)
Outcome: affinity, range, duration and damage modifiers of section 9 apply by biome.
- [ ] One scenario per row of the section 9 table; depends on `world-generator`.

**CD-27. Item patches on abilities** (R5)
Outcome: Aspects, set bonuses, "+1 range" and "+1 rank" go through the compile pipeline.
- [ ] The 4 Aspects and the set of §12 as fixtures; `RankOverflow`; depends on `items-loot`.

**CD-28. Class kits against boss rules** (R8)
Outcome: Arrêt du temps, Stase, Retour, Paradoxe, Instant suspendu and raising behave on bosses as
agreed with `encounter-boss-designer` §17.
- [ ] One test per bullet of that section.

### R9: the 4 other classes and the 3 other Paths

**CD-29. Assassin: Energy, combo, Opportuniste, Blades branch** (R9)
Outcome: Entaille, Pas de l'ombre, Éventration, Lame empoisonnée and Danse des lames work.
- [ ] `kit/special/blade_dance.rs`.

**CD-30. Assassin: Shadows branch and Assassinat** (R9)
Outcome: Croc-en-jambe, Insaisissable, Fumigène, Marque de mort and Assassinat work.
- [ ] Guard on Assassinat; untargetable zone.

**CD-31. Necromancer: Essence, Moisson, Revenants, Reanimation branch** (R9)
Outcome: Siphon, Relever les morts, Rappel du vide, Explosion de cadavre and Armée des morts work
with the Graveyard rules.
- [ ] `kit/special/raise.rs`; once-per-entry and cap-3 tests.

**CD-32. Necromancer: Curses branch, Peste, Pacte de sang** (R9)
Outcome: Décrépitude, Sacrifice, Retour de souffrance, Prison d'os, Peste and the innate Pacte work.
- [ ] Fight-length check on the ladder (risk R-4).

**CD-33. Chronomancer: Sand, Debt, Instant suspendu, Retrochrony branch** (R9)
Outcome: Mine temporelle, Retour, Rembobiner, Déjà-vu and Paradoxe work from the snapshot ring.
- [ ] `kit/special/history.rs`, `suspend.rs`; replay hash test (risk R-3).

**CD-34. Chronomancer: Acceleration branch and Arrêt du temps** (R9)
Outcome: Hâte, Lenteur, Stase, Sablier and Arrêt du temps work.
- [ ] `kit/special/time_stop.rs`.

**CD-35. Geomancer: Strata, Marche-pierre, Earth branch** (R9)
Outcome: Soulèvement, Glyphe de pierre, Pont, Pente and Rempart tellurique work.
- [ ] `kit/special/bridge.rs`; Pont rule per F41 decision.

**CD-36. Geomancer: Fault branch and Séisme** (R9)
Outcome: Sables, Secousse, Effondrement, Rotation and Séisme work.
- [ ] `kit/special/rotate.rs`; multi-removal with tell 2.

**CD-37. R2 and R3 data: Assassin and Necromancer** (R9)
Outcome: 20 abilities with R2 and variants, 60 scenarios.

**CD-38. R2 and R3 data: Chronomancer and Geomancer** (R9)
Outcome: 20 abilities with R2 and variants, 60 scenarios.

**CD-39. Domination Path** (R9)
Outcome: 4 keystones and 9 runes of Domination work.

**CD-40. Sorcery Path** (R9)
Outcome: 4 keystones and 9 runes of Sorcery work.

**CD-41. Inspiration Path** (R9)
Outcome: 4 keystones and 9 runes of Inspiration work (life runes wired with `gathering-crafting`
and `economy-merchants`).

**CD-42. R9 rotations, 8-class ladder and browser check** (R9)
Outcome: the 8 classes pass the bot ladder and the 4 new ones are playable in the browser.
- [ ] Rotations for Assassin, Necromancer, Chronomancer, Geomancer.
- [ ] Playwright `rpg-classes.spec.ts` extended.

### R10: multiplayer

**CD-43. PvP kit rules and mirror ladder** (R10)
Outcome: ranked arenas validate kits at level 100, controls last 1 turn less, Pionnier is mirrored,
and the 28 class pairings stay within the 35 % to 65 % band.
- [ ] Depends on `pvp-br-designer` (template) and `ai-engineer` (mirror ladder).
- [ ] Playwright `rpg-arena.spec.ts` (two tabs) with `client-ui`.

Total: 43 Tasks (1 in R0, 5 in R1, 11 in R2, 8 in R3, 1 in R4, 1 in R5, 1 in R8, 14 in R9, 1 in R10).
