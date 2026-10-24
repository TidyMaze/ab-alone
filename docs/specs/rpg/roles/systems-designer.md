# Systems design: implementation spec (role `systems-designer`)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, still open). Source of truth:
the validated French gameplay spec (the approved plan, same text as `docs/specs/rpg/plan.fr.md`).
Section numbers like "§6.4" point to that gameplay spec. This file adds no rule on top of it: it says
how to build the systems part (stats, formulas, weighted push, statuses, talent budgets, XP curve),
and lists what is missing or contradictory in [Feedback on the gameplay spec](#18-feedback-on-the-gameplay-spec).
No code yet: strict TDD applies from R1 (CONTRIBUTING section 11).

**Tags**, as in `rules.md`: **FINAL** (decided: by the four choices of #313, by an existing FINAL
rule, or by the validated rules of the task brief: weighted push `n > m` AND strictly greater total
Weight, at most 1 ejection per action, ejected hero = death and lost fight, deterministic combat),
**TUNE** (start value, set by the bot ladder and playtests), **PROPOSAL** (proposed here, an owner
confirms). Every number below carries one. A number copied from the gameplay spec keeps its tag
there: the gameplay spec says "everything is PROPOSAL and every number is TUNE unless stated", so most
copied numbers are TUNE. Coordinates, ids, section numbers and the computed results inside test
examples are references, not tuning numbers, and carry no tag.

---

## 0. Scope

In scope (this role owns the formulas, the data shapes, the validation and their tests):

- The stat model: stat list, storage types, level growth `g(L)`, class multipliers, the stat sheet
  pipeline, VIT and the Weight-for-Speed trade (§7.1, §7.2, §8.0).
- Derived stat blocks: Fragments (§6.9), Revenants (§8.6), the hero base that monster stats start
  from (§5.3), normalized PvP and BR templates (§19, §20).
- Weighted push: effective Weight, the push verdict, the classic-equivalence invariant (§6.4, §5.1
  Boue and Pente, §6.11 keywords, push-changing abilities of §8).
- Damage: types, the formula, `K(L)`, the bonus bucket, Choc, Isolement, Formation, level gap, the
  hero Guard, explicit multipliers, shields, mana shield, lifesteal, DoTs, % max HP damage (§6.5, §5.1,
  §4.8).
- Healing: the heal pipeline, Usure, Poison, overheal (§6.5, §6.7, §6.11, §8.4).
- Turn timers: status durations, cooldowns, Hâte (§6.3, §7.1).
- Statuses and keywords: data model, stacking, expiry clocks, diminishing returns, Ténacité,
  Lassitude, PvP shortening (§6.11, §19).
- Resource pools: storage, clamps, the generic gain pipeline (VIT, biome affinity, Dunes) (§6.3,
  §7.1, §5.2). Each class's own resource rules belong to `class-designer`.
- Talent budgets: passive tree (99 points, gates, shard cap, rune rank scaling, respec cost) and
  active tree (20 points, ranks 1/1/2, gates, equip rules) (§9, §10).
- XP: the curve, level-up, kill XP, level bands and XP gap factors, the XP source budget, rested XP,
  the level cap, the unlock table (§11, §4.4).
- World-side stat formulas: Élan, VIT world speed, out-of-combat regen (§4.2).

Out of scope (see "Dependencies" in each section): the turn loop and `apply_action`, the terrain
layer, the 12 effect primitives, ejection limits, victory (`combat-engine`); board mask and occupants
(`engine-core`); every class kit and ability text (`class-designer`); monster archetypes, rarities,
affixes and bosses (`encounter-boss-designer`); items, iLvl tables, loot (`items-loot`); gold sinks
and prices (`economy`); quests (`narrative-quest-designer`); rendering and windows (`client-ui`,
`ux-designer`); the bot ladder (`ai-engineer`, `qa-balance`).

**Role slugs used for dependencies** (assumed names, the lead agent maps them to the real roster;
sibling role specs call this role `stats-progression` or `progression-talents`):

| Slug | Owns |
|---|---|
| `combat-engine` | Crate `abalone-rpg`: `CombatState`, `apply_action`, turn structure, terrain layer, primitives interpreter, ejection limits, victory, state hash |
| `engine-core` | Crate `abalone-core`: board mask, occupants per cell, wiring the push verdict into `legal_moves` and `apply` |
| `class-designer` | Classes, abilities, traits, class resources, Fragments' class bonuses, Revenant rules |
| `encounter-boss-designer` | Monster archetypes, rarities, affixes, packs, bosses, world tiers |
| `narrative-quest-designer` | Quests, quest XP fractions, tutorial lessons |
| `world-generator` | World map, tiles, tile level, travel, Beacons, day and night |
| `items-loot` | Item slots, iLvl, affixes, gems, Gear Score, item rank affix |
| `economy` | Gold prices and sinks (respec prices are proposed here, priced there) |
| `ai-engineer` | Search on the combat state, monster AI, the RPG player bot |
| `qa-balance` | The RPG bot ladder, balance sims, pacing reports |
| `pvp-br-designer` | Arenas, normalization use, battle royale |
| `netcode` | P2P lockstep, signed logs, commit-reveal seeds |
| `client-ui` | Three.js scenes, HUD, windows, WASM plumbing on the client, Playwright e2e of the client |
| `ux-designer` | What the previews, pips, bars and timers show and how |
| `tech-lead` | Crate layout, data format (RON or JSON), determinism rules, the WASM bridge, MCP |

---

## 1. Inputs read

- Gameplay spec, whole file; in detail §1, §4.2, §4.4, §4.8, §5.1, §5.2, §5.3, §6 (all), §7, §8
  (all class numbers that touch Weight, damage, durations, cooldowns and resources), §9, §10, §11,
  §12, §15.4, §19, §20, §24, §25, §26.
- `docs/specs/rules.md` §1 (axial coordinates), §3 to §6 (groups, moves, sumito, one ejection per
  move), §9 (draws), §10.3 and §10.4 (PvE, BR), §11 (numbers index).
- `docs/specs/game-design.md` §1 (pillars that the pivot replaces), §4 ("no stat grind"), §5
  (anti-stalling).
- `docs/specs/tech.md` §3 (crate `abalone-core`), §7 (node-limited AI), §8 (persistence), §10 (CI).
- `docs/specs/boss-balance.md` (ladder method, the definition of "winnable").
- `CONTRIBUTING.md` §6.4 (UI PR screenshot), §11 (strict TDD, 100 % line and region coverage), §13.
- Sibling role specs in this folder: `encounter-boss-designer.md` (monster stat builder that calls
  this role's `hero_base`, level bands), `narrative-quest-designer.md` (quest XP in basis points of
  `xp_required`), `ux-designer.md` (previews and pips).
- Code: `crates/abalone-core/src/board.rs` (`Board` on a std `HashMap`, `Cell::{Empty,Black,White}`,
  `void`, `MAX_RADIUS = 5`), `moves.rs` (`apply`, the `n as i32 <= run` check, `legal_moves` scan
  order), `game.rs` (history, repetition), `search.rs` (alpha-beta, node budget),
  `encounter/hull.rs` (splitmix64 `mix`), `encounter/ladder.rs`, `encounter/telemetry.rs`. No
  `proptest` or other dev dependency exists in the workspace.

What the code tells this spec:

1. The sumito test is one line in `moves::apply`: `if n as i32 <= run { NotStrongEnough }`. The
   weighted push replaces exactly that line with a call to a pure verdict function, so the classic
   path stays byte-for-byte the same (section 5).
2. `abalone-core` has no dependencies. The property test "Weight 1 = classic" uses a seeded
   splitmix64 (already in `encounter/hull.rs`) for random playouts plus a perft count, not a new
   crate (KISS).
3. `Board` iterates a `HashMap`; nothing in this role's code iterates it: every collection here is a
   `Vec` sorted by id or a fixed-size array (§24.1).

---

## 2. Conventions used by every section

- **Integers only** (§24.1, FINAL). Stats are `i32`. Percentages are basis points (bp, 10 000 =
  100 %). Intermediate products use `i64`. Every multiplication is followed by a floor, in the order
  written. No float anywhere in the rules.
- **Helpers** (`crates/abalone-rpg/src/num.rs`, owned here):
  - `mul_bp(x: i32, bp: i32) -> i32` = `floor(x × bp / 10 000)` (floor toward minus infinity, via
    `i64::div_euclid`).
  - `scale(x, num, den) -> i32` = `floor(x × num / den)`.
  - `bonus(x, bucket_bp) -> i32` = `mul_bp(x, 10 000 + bucket_bp)`.
  - `clamp_bp(bp, lo, hi)`.
- **Wording rule for data authors** (PROPOSAL): an effect written "+X %" or "−X %" adds `X × 100` bp
  to a **bucket** (summed, then applied once). An effect written "× N" or "doubled" is an **explicit
  multiplier**, applied after the bucket, in data order. "X % of the ATQ" is a **ratio**.
- **Data** (§1 pillar 6, §24.3): every number of this role lives under `data/systems/` and is loaded
  with `include_str!`. Examples are RON; if `tech-lead` picks JSON, the fields stay the same.
- **Files** (all new):

| File | Content | Phase |
|---|---|---|
| `crates/abalone-core/src/weight.rs` | `PushRule`, `Pusher`, `Pushed`, `Behind`, `PushCtx`, `push_verdict()` | R1 |
| `crates/abalone-rpg/src/num.rs` | Integer and bp helpers | R1 |
| `crates/abalone-rpg/src/stats.rs` | `Stat`, `StatBlock`, `g_bp`, `k_of`, `hero_base`, `class_block`, `fragment_block`, `revenant_block`, sheet pipeline | R1 |
| `crates/abalone-rpg/src/weight_eff.rs` | `effective_weight()` from sheet, terrain and statuses | R1, R2 |
| `crates/abalone-rpg/src/damage.rs` | `DamageSpec`, `Hit`, `compute_hit()`, `shock_hits()`, position and level modifiers, Guard | R1 |
| `crates/abalone-rpg/src/heal.rs` | `HealSpec`, `compute_heal()`, Usure, overheal, shields, mana shield, lifesteal | R2 |
| `crates/abalone-rpg/src/status.rs` | `StatusKind`, `Status`, `Expiry`, `StatusSet`, DR immunity, Ténacité, Lassitude | R2 |
| `crates/abalone-rpg/src/cooldown.rs` | `Cooldowns`, `effective_cd()`, Hâte, cooldown operations | R1 |
| `crates/abalone-rpg/src/resource.rs` | `ResourcePool` (centi-units), `gain()`, `spend()` | R1 |
| `crates/abalone-rpg/src/modifiers.rs` | Collects bucket entries from terrain, biome, weather, statuses | R2 |
| `crates/abalone-world/src/progression/xp.rs` | `xp_required`, `apply_xp`, `kill_xp`, `level_band`, `xp_gap_bp`, rested pool | R3 |
| `crates/abalone-world/src/progression/passive.rs` | `PassiveAlloc`, `validate_passive()`, `shard_cap()`, `rune_value()`, respec cost | R3 |
| `crates/abalone-world/src/progression/active.rs` | `ActiveAlloc`, `validate_active()`, rank costs, equip rules | R3 |
| `crates/abalone-world/src/progression/template.rs` | PvP L100 and BR L20 templates | R10 |
| `data/systems/stats.ron` | Hero base, growth, class multipliers, Fragment and Revenant ratios | R1 |
| `data/systems/combat.ron` | Damage constants, Choc ratios, Guard, bucket clamp, Usure, DR, Ténacité | R1, R2 |
| `data/systems/statuses.ron` | Status table (category, flags, default magnitudes) | R2 |
| `data/systems/progression.ron` | XP curve constants, kill XP, gap factors, rested, unlock table | R3 |
| `data/systems/passive.ron` | Budget, gates, shard table, rune rank scaling | R3 |
| `data/systems/active.ron` | Budget, rank costs, gates | R3 |

---

## 3. Stat model (§7.1, §7.2, §8.0)

### 3.1 Stat list and storage

**Implementation.**

```rust
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum Stat { Hp, Atk, Pow, Arm, Res, Vit, Haste, Tenacity, LifestealBp, PenBp }

pub struct StatBlock {           // one per Unit, plain fields, no map
    pub max_hp: i32, pub atk: i32, pub pow: i32, pub arm: i32, pub res: i32,
    pub vit: i32,                // whole points
    pub haste: i32, pub tenacity: i32, pub lifesteal_bp: i32, pub pen_bp: i32,
    pub weight: u8,              // sheet Weight, 1..=5
    pub level: u8,               // 1..=100, used by K and the level gap
}
```

- POI (Weight) is a `u8` in 1..=5 (§6.4, TUNE range, FINAL as a rule once validated). It never grows
  with level (§7.2, TUNE).
- Chance and Rendement (§7.1, §14) are tool stats outside combat: `items-loot` and gathering own
  them; they are not in `StatBlock`.
- VIT is stored in whole points (PROPOSAL). The "+0.1 VIT per level" of §7.2 becomes
  `vit(L) = 10 + floor((L − 1) / 10)`: 10 at L1, 19 at L100 (§7.2 gives 19.9; see F23).

### 3.2 Level growth `g(L)` and `K(L)` (§7.2, §6.5)

**Implementation.**

- `g_bp(L) = 10 000 + 900 × (L − 1) = 9 100 + 900 × L` (§7.2, TUNE: the 0.09 slope). `g_bp(1) =
  10 000`, `g_bp(100) = 99 100` (×9.91).
- `K(L) = 100 × g(L) = 91 + 9 × L` (§6.5, TUNE: the 100). It is exact in integers: `K(1) = 100`,
  `K(50) = 541`, `K(100) = 991`.
- Hero base at level 1 (§7.2, TUNE): HP 120, ATQ 12, PUI 12, ARM 20, RES 20, VIT 10.
- `hero_base(L).stat = floor(base × g_bp(L) / 10 000)` for HP, ATQ, PUI, ARM, RES. This is the
  "naked" block that `encounter-boss-designer` multiplies by archetype and rarity (§5.3).

### 3.3 Class multipliers (§8.0)

Copied from §8.0 (all TUNE); a missing cell is 10 000 bp. Weight is the class base (TUNE).

| Class | HP | ATQ | PUI | ARM | RES | VIT add | Weight |
|---|---|---|---|---|---|---|---|
| Gardien | 13 000 | 8 000 | — | 15 000 | 15 000 | — | 3 |
| Guerrier | 11 500 | 13 000 | — | — | — | — | 3 |
| Assassin | 8 000 | 14 000 | — | — | — | +5 | 1 |
| Guérisseur | — | — | 13 000 | — | 12 000 | — | 2 |
| Mage | 8 500 | — | 14 000 | — | — | — | 1 |
| Nécromancien | — | — | 12 500 | — | — | — | 2 |
| Chronomancien | — | — | 12 000 | — | — | +3 | 1 |
| Géomancien | — | — | 11 500 | 12 000 | — | — | 2 |

`class_block(class, L).stat = floor(base × g_bp(L) × class_bp / 10^8)`: one product in `i64`, one
floor (PROPOSAL: a single floor keeps level 1 values closest to the reals).

### 3.4 The stat sheet pipeline (§7.1, §7.2, §9.2, §12)

Fixed order, one function `sheet(hero, data) -> StatBlock` (PROPOSAL):

1. **Naked and class**: section 3.3.
2. **Flat gear**: + the sum of item stats and socketed gems (`items-loot` computes each item's
   `base(slot) × g(iLvl)`, §12; this step only adds).
3. **Passive % bucket**: shards, stat runes, set bonuses, the affinity rune "Connaissance du terrain"
   (+5 % on its biome, TUNE) are summed per stat in bp, then `bonus(x, bucket)` once.
4. **Lest trade**: Weight = class base + item Weight (capped at +1 in total, §7.1, TUNE); VIT −=
   3 × (Weight − class base) (§7.1, TUNE). Only sheet Weight counts, never combat buffs (PROPOSAL,
   F24).
5. **Clamps**: Weight 1..=5; every other stat ≥ 0; `max_hp ≥ 1`.

In combat, `combat-engine` reads the sheet once at fight start (snapshot, PROPOSAL) and applies
combat modifiers on top with `modifiers.rs` (section 6.4): statuses, terrain, auras. Gear "+0 % at
level 1 to about +120 % at the end" (§7.2, TUNE) is a budget for `items-loot`: a full Rare set at
iLvl L adds 100 % to 140 % of `hero_base(L)` on HP, ATQ or PUI, ARM and RES (PROPOSAL, test below).

### 3.5 Reference table: every class at levels 1, 50, 100 (§7.2 asks for Gardien vs Assassin)

Computed with sections 3.2 and 3.3, no gear, no passives. These are the unit-test oracle.

| Class | Level | HP | ATQ | PUI | ARM | RES | VIT | Weight |
|---|---|---|---|---|---|---|---|---|
| Gardien | 1 | 156 | 9 | 12 | 30 | 30 | 10 | 3 |
| Gardien | 50 | 843 | 51 | 64 | 162 | 162 | 14 | 3 |
| Gardien | 100 | 1 545 | 94 | 118 | 297 | 297 | 19 | 3 |
| Assassin | 1 | 96 | 16 | 12 | 20 | 20 | 15 | 1 |
| Assassin | 50 | 519 | 89 | 64 | 108 | 108 | 19 | 1 |
| Assassin | 100 | 951 | 165 | 118 | 198 | 198 | 24 | 1 |
| Guerrier | 1 / 50 / 100 | 138 / 746 / 1 367 | 15 / 83 / 153 | 12 / 64 / 118 | 20 / 108 / 198 | 20 / 108 / 198 | 10 / 14 / 19 | 3 |
| Guérisseur | 1 / 50 / 100 | 120 / 649 / 1 189 | 12 / 64 / 118 | 15 / 83 / 153 | 20 / 108 / 198 | 24 / 129 / 237 | 10 / 14 / 19 | 2 |
| Mage | 1 / 50 / 100 | 102 / 551 / 1 010 | 12 / 64 / 118 | 16 / 89 / 165 | 20 / 108 / 198 | 20 / 108 / 198 | 10 / 14 / 19 | 1 |
| Nécromancien | 1 / 50 / 100 | 120 / 649 / 1 189 | 12 / 64 / 118 | 15 / 80 / 147 | 20 / 108 / 198 | 20 / 108 / 198 | 10 / 14 / 19 | 2 |
| Chronomancien | 1 / 50 / 100 | 120 / 649 / 1 189 | 12 / 64 / 118 | 14 / 76 / 141 | 20 / 108 / 198 | 20 / 108 / 198 | 13 / 17 / 22 | 1 |
| Géomancien | 1 / 50 / 100 | 120 / 649 / 1 189 | 12 / 64 / 118 | 13 / 73 / 135 | 24 / 129 / 237 | 20 / 108 / 198 | 10 / 14 / 19 | 2 |

### 3.6 VIT effects (§7.1, §6.1, §6.2, §4.2)

- **Initiative**: highest hero VIT; ties broken by the fight seed (§6.1, FINAL as written there).
  In a camp, entity order by VIT, then by entity id (PROPOSAL, deterministic).
- **Resource gain**: `+100 bp × floor(max(0, VIT − 10) / 2)` in the resource gain bucket (§7.1,
  TUNE). Section 10.
- **World speed**: `+50 bp` per VIT point above 10 (§7.1 says "per point", PROPOSAL: above 10, F23).
  Section 15.

### Dependencies (section 3)

`combat-engine` (snapshot at fight start, `Unit` holds a `StatBlock`), `items-loot` (flat item stats,
Lest Weight affix capped at +1, gear budget), `class-designer` (class list and Weight confirmed),
`encounter-boss-designer` (calls `hero_base(L)`; its archetype and rarity order is
`floor(floor(hero_base × arch) × rarity)`, matching section 3.2).

### Tests (section 3)

- Table test: `g_bp(1) = 10 000`, `g_bp(2) = 10 900`, `g_bp(100) = 99 100`; `K(1) = 100`,
  `K(100) = 991`.
- Table test: every row of the section 3.5 table (24 classes × levels).
- Given a Guerrier L1 with a Lest item of Weight +1, When `sheet` runs, Then Weight 4 and VIT 7.
- Given two Lest-like items of +1 Weight each, Then Weight is class base + 1 (cap) and VIT −3 once.
- Given a passive bucket of +1 200 bp ATQ on a Guerrier L1, Then ATQ `floor(15 × 1.12) = 16`.
- Property: for every class and L in 1..99, every stat at L+1 ≥ stat at L.
- Property: `sheet` is pure (same input, same block), and every field is within its clamp.
- Data integrity: every class has a row, every multiplier is in 5 000..20 000 bp (PROPOSAL bounds),
  every Weight in 1..=3 for classes.
- Gear budget (with `items-loot`, R5): a generated full Rare set at iLvl L adds 10 000 to 14 000 bp of
  `hero_base(L)` per primary stat, for L in {10, 50, 100}.
- No e2e here; the hero sheet window e2e is in section 17.

### Risks (section 3)

- The plan's own level 1 numbers are small, so floors cost up to 10 % (Gardien ATQ 9.6 → 9). Fine for
  TUNE; a "stats × 10" fixed point is possible later without changing formulas.
- Gear ARM grows faster than `K` at high level (a geared L100 Gardien takes about 60 % of damage,
  versus 77 % naked at L1). §6.5's "the reduction stays the same from 1 to 100" only holds naked
  (F26).

---

## 4. Derived stat blocks (§6.9, §8.6, §5.3, §4.8)

### 4.1 Fragments (§6.9)

**Implementation.** `fragment_block(hero_sheet, class, banner) -> StatBlock`:

- HP 4 000 bp, ATQ 5 000 bp, ARM 5 000 bp, RES 5 000 bp of the **hero sheet** (after gear and
  passives, PROPOSAL, F27), PUI 0, Weight 1, level = hero level, VIT = hero VIT (unused, for the
  hash). All TUNE from §6.9.
- Then the class squad bonus (`class-designer`, §8: Gardien +2 000 bp HP, Guerrier +1 000 bp ATQ,
  Nécromancien −2 000 bp HP, TUNE) and the Étendard bonus (`items-loot`, §12) in one bucket per stat.
- Fragments never have Hâte, Ténacité, lifesteal or penetration (PROPOSAL).

### 4.2 Revenants (§6.6, §8.6)

**Implementation.** `revenant_block(entry: &GraveEntry, necro_pow: i32, bp: i32) -> StatBlock`
where `GraveEntry` holds the original `StatBlock` (§6.6 stores "stats d'origine"):

- `max_hp = mul_bp(orig.max_hp, bp) + mul_bp(necro_pow, 2 000)` with `bp = 4 000` (Relever, Rappel)
  or `6 000` (Armée des morts) (§8.6, TUNE).
- ATQ, ARM, RES, level, Weight: the original values (PROPOSAL, F28). PUI 0, no abilities (a boss keeps
  one: `class-designer`, `encounter-boss-designer`).
- Decay: `mul_bp(max_hp, 1 000)` Pure damage at the end of each Necromancer turn (§8.6, TUNE), not
  Guard-capped, not a Perte.

### 4.3 Monsters (§5.3, §4.8)

This role provides `hero_base(L)` (section 3.2) and the level band (section 13.4). The archetype,
rarity, affix, night (+1 000 bp stats, §4.8 TUNE) and world tier multipliers are applied by
`encounter-boss-designer` in its builder. Shared test: a level 1 Normal Brute has HP 109, ATQ 9,
ARM 14 (their section 3.1, same numbers here).

### Dependencies (section 4)

`class-designer` (squad bonuses, Revenant caps, Sacrifice uses the Revenant's HP), `items-loot`
(Étendard), `combat-engine` (Cimetière entries keep the original `StatBlock`),
`encounter-boss-designer` (monster builder).

### Tests (section 4)

- Given a Guerrier L1 hero sheet (HP 138, ATQ 15, ARM 20, RES 20), When `fragment_block` runs with
  the Guerrier squad bonus, Then HP 55, ATQ `floor(7 × 1.1) = 7`, ARM 10, RES 10, PUI 0, Weight 1.
- Given a Gardien L1 hero (HP 156), Then Fragment HP `floor(62 × 1.2) = 74`.
- Given a dead Normal Brute L1 (max HP 109) and a Necromancer with PUI 15, When raised at 4 000 bp,
  Then max HP `43 + 3 = 46`, Weight 2.
- Given that Revenant, When the Necromancer ends a turn, Then it loses 4 HP.

---

## 5. Weighted push (§6.4)

### 5.1 The rule (FINAL, validated)

A group of `n` aligned balls pushes an opposing run of `m` balls if and only if:

1. `n > m` (classic, FINAL). Only an ability that says so allows `n = m` (Percée; F4 on Avalanche).
2. The total effective Weight of the group is **strictly greater** than the total effective Weight
   of the run (FINAL).
3. The cell after the run is empty or off the board. A ball of the pusher's camp, a Roc, or an
   Inamovible ball there makes the push illegal (FINAL in classic for own balls; Roc and Inamovible
   from §5.1 and §6.11).

Plus the keyword rules that touch a push (§6.11, §8):

- A run that contains an Inamovible ball cannot be pushed (it blocks like a Roc).
- A push that would eject an Inéjectable ball is illegal.
- An Aveuglé ball cannot be the head (front ball) of a pushing group.
- A group never exceeds 3 balls; Avalanche allows 4, inline only, against a run of at most 3.
- A broadside move never pushes (FINAL, `rules.md` §4.2).
- At most one ejection per action (FINAL): a push ejects at most the last ball of the run, as in
  classic.

**Definition of the run** (PROPOSAL, F6): the maximal contiguous line of balls, starting at the
leading cell, that belong to camps **not allied** to the pusher. Balls of several enemy entities can
form one run (needed for BR and group fights). An allied ball at the leading cell makes the move
illegal (§6.2: allies block, never push with you); an allied ball after the run is a block.

### 5.2 Effective Weight of one ball

`effective_weight(sheet_weight, terrain, statuses) -> u8` in `weight_eff.rs`:

1. Start at the sheet Weight (section 3.4: class base or archetype, items, elite leader +1, Massif
   +1, all clamped already).
2. Add terrain: Boue +1 (§5.1, TUNE).
3. Add status deltas: Alourdi +1/+2, Allégé −1/−2 (§6.11), Glyphe de pierre +1, Peau de fer +1,
   Lest liquide +1, Cri de guerre −1, Décrépitude −1, Croc-en-jambe −2, Bris −1, Bourreau du bord
   +1/+2 (§8, §9.2, §15.4; all TUNE, owned by their authors as data).
4. Clamp to 1..=5 (§6.11, TUNE range).
5. Overrides win last: Titan sets 5 (§8.2, TUNE).

Group-level bonuses are **not** ball Weight; they are added in the verdict (section 5.3):

- Pente: +1 to the pushing total along the slope, −1 against (§5.1, TUNE). The slope that counts is
  the one of the **head ball's cell** (PROPOSAL, F5). The pushing total never drops below 1.
- Bélier: +2 to the pushing total when the hero is in the group (§8.1, TUNE).
- Roc inébranlable: +2 per affected hero to the **resisting** total only, outside the 1..=5 clamp
  (§9.2, TUNE; clamp reading is PROPOSAL, F7).

### 5.3 The verdict function (in `abalone-core`, no RPG types)

```rust
pub enum PushRule { Classic, Weighted }
pub struct Pusher { pub weight: u8, pub can_lead: bool }
pub struct Pushed { pub weight: u8, pub resist_bonus: u8, pub immovable: bool, pub unejectable: bool }
pub enum Behind { Empty, OffBoard, Blocked }
pub struct PushCtx { pub allow_equal: bool, pub max_run: u8, pub group_bonus: i8 }
pub enum PushError { NotStrongEnough, RunTooLong, BlindHead, Immovable, PushBlocked,
                     TooLight, WouldEjectUnejectable }
pub fn push_verdict(rule: PushRule, group: &[Pusher], run: &[Pushed], behind: Behind,
                    ctx: &PushCtx) -> Result<bool /* ejects */, PushError>
```

`group` is ordered head first; `run` is ordered from the leading cell outward. Checks run in this
fixed order, so the first failing check names the error (PROPOSAL; the preview shows it):

1. `run.len() > ctx.max_run` → `RunTooLong` (`max_run` 3 in classic, 3 for Avalanche).
2. Count: `n > m`, or `n == m && ctx.allow_equal` → else `NotStrongEnough`.
3. `!group[0].can_lead` → `BlindHead` (Weighted only).
4. Any `run[i].immovable` → `Immovable` (Weighted only).
5. `behind == Blocked` → `PushBlocked`.
6. Weighted only: `att = max(1, Σ group.weight + ctx.group_bonus)`,
   `def = Σ (run.weight + run.resist_bonus)`; `att <= def` → `TooLight`.
7. `behind == OffBoard` and the last run ball is `unejectable` → `WouldEjectUnejectable`.
8. Return `Ok(behind == OffBoard)`.

**Wiring** (`engine-core`): `moves::apply` gets a generic twin `apply_with(board, player, mv, oracle)`
where the oracle answers per cell: weight, flags, ally or enemy, obstacle. `apply` becomes
`apply_with(.., &ClassicOracle)`, which reproduces today's behaviour exactly. `legal_moves_with` is the
same scan with the oracle. The RPG oracle (terrain, occupants, statuses) is built by `combat-engine`.

### 5.4 The invariant (FINAL proposed in §6.4)

With `PushRule::Weighted`, every Weight 1, no bonus and no flag, the verdict equals `Classic`:
`Σatt = n`, `Σdef = m`, so check 6 is the same as check 2. Tested three ways (section 5.7).

### 5.5 Preview data (§6.4 "2 contre 1 · Poids 4 contre 3")

`push_preview(...) -> PushPreview { n, m, att_weight, def_weight, legal, ejects, error }`, a pure
function over the same inputs; `combat-engine` exposes it to WASM as JSON:
`{"n":2,"m":1,"att":4,"def":3,"legal":true,"ejects":false,"error":null}`. The text and its
translation belong to `ux-designer` and `client-ui`.

### 5.6 Examples (for `rules.md` §10.5; Weight in brackets)

| # | Given | When | Then |
|---|---|---|---|
| W1 | Guerrier [3] alone vs Fragment [1] | push | illegal, `NotStrongEnough` (1 is not > 1) |
| W2 | Guerrier [3] + Fragment [1] vs Gardien [3] | push | legal (2 > 1, 4 > 3) |
| W3 | 2 Fragments [2] vs Gardien [3] | push | illegal, `TooLight` (2 ≤ 3) |
| W4 | 3 Fragments [3] vs 2 Fragments [2] | push | legal (classic 3v2) |
| W5 | 3 Fragments [3] vs Guerrier on Boue [4] | push | illegal, `TooLight` |
| W6 | Percée: Guerrier + Fragment [4] vs 2 Fragments [2] | push | legal at 2v2 |
| W7 | 3 Fragments [3], head on a Pente pointing against the push, vs 2 Fragments [2] | push | illegal, `TooLight` (3 − 1 = 2 ≤ 2) |
| W8 | 2 Fragments [2], head on a Pente along the push, vs Gardien [3] | push | illegal (2 + 1 = 3 ≤ 3) |
| W9 | Bélier: Gardien hero [3] + Fragment [1] vs Guerrier [3] + Fragment [1] | push 2v2 without Percée | illegal, `NotStrongEnough` (Bélier adds Weight, not count) |
| W10 | 3 Fragments [3] vs Fragment + Ancré Fragment [2] | push | illegal, `Immovable` |
| W11 | 2 balls vs an Inéjectable ball on the rim, nothing behind | push | illegal, `WouldEjectUnejectable` |
| W12 | Aveuglé head + 2 Fragments vs 1 Fragment | push | illegal, `BlindHead` |
| W13 | Avalanche: 4 Fragments [4] vs 3 Fragments [3] at the rim | push | legal, ejects 1 |
| W14 | Roc inébranlable Gardien hero [3, resists as 5] vs 3 Fragments [3] | push 3v1 | illegal, `TooLight` (3 ≤ 5) |
| W15 | Titan Guerrier hero hit by Croc-en-jambe (−2) | `effective_weight` | 5 (the override wins) |

### 5.7 Tests (section 5)

- Unit, `weight.rs`: one test per row W1 to W14 on `push_verdict`, and one per error in the order of
  section 5.3 (two failing checks at once report the first).
- Property 1 (exhaustive small): for every `n` in 1..=3, `m` in 0..=4, `behind` in 3 values, Weighted
  with weights 1 == Classic.
- Property 2 (perft, `engine-core` wiring PR): `legal_moves_with(Weighted, all 1)` equals
  `legal_moves` from the standard and Belgian daisy starts, perft to depth 3 equal node counts.
- Property 3 (playouts): 200 seeded random games (splitmix64, fixed seeds), 200 plies each, same move
  list and same final board under both rules.
- Unit, `weight_eff.rs`: Boue + Alourdi +2 on Weight 3 → 5 (clamp); Allégé −2 on Weight 1 → 1;
  Titan with Croc-en-jambe → 5.
- Integration (`combat-engine`): W2, W5, W7 and W11 as full `apply_action` scenarios.
- e2e (Playwright, `client-ui` task, R1): select Guerrier + Fragment facing a Gardien, hover the push
  direction, Then the preview reads "2 vs 1 · Weight 4 vs 3" and the pips show 3, 1 and 3.

### Dependencies (section 5)

`engine-core` (`apply_with`, oracle, occupants, Roc as obstacle), `combat-engine` (RPG oracle,
`apply_action`, Écrasement, Instant suspendu and Pont exceptions), `class-designer` (Percée, Bélier,
Avalanche, Titan, Roc inébranlable as data), `ai-engineer` (search uses `legal_moves_with`),
`ux-designer` (preview text, pips).

### Risks (section 5)

- Weight 1 Assassins and Mages are pushed by any 2v1; that is the stated trade (§8.3), watch the
  ladder for hero ejections in 3 turns (§26 Q10).
- Performance: the oracle call per candidate push adds a few array reads; the search budget is in
  nodes, so this costs depth, not determinism.

---

## 6. Damage (§6.5)

### 6.1 Types and the formula

- Physical (ARM), Magical (RES), Pure (never reduced) (§6.5, TUNE as a design, FINAL once #313
  closes). Elements are tags only, no resistance per element (§6.5).
- `damage = max(1, floor((Base + Ratio × Stat) × K / (K + Defense) × (1 + Σbonus)))` (§6.5), with
  `K = K(attacker level)` (section 3.2).

### 6.2 The pipeline (one function, fixed stages)

`compute_hit(spec: &DamageSpec, attacker: &UnitView, target: &UnitView, ctx: &HitCtx) -> Hit`

| Stage | What | Rule |
|---|---|---|
| S1 raw | `Base + mul_bp(stat_eff, ratio_bp)` | `stat_eff` = attacker's current ATQ or PUI after combat modifiers |
| S2 defense | `def_eff = mul_bp(def, 10 000 − pen_bp)` | `pen_bp` capped at 4 000 (PROPOSAL, F34); Pure skips S2 and S3 |
| S3 mitigation | `scale(raw, K, K + def_eff)` | `i64` |
| S4 bucket | `bonus(x, clamp_bp(Σ, −8 000, +20 000))` | the bucket, section 6.3; clamp PROPOSAL, F11 |
| S5 explicit | each "× N" in data order, floor each | Bris ×1.5, Avalanche Choc ×2 |
| S6 minimum | `max(1, x)` | only for a hit that lands (not a dodge) |
| S7 share | Lien vital 50/50, Martyr redirect −50 % | `class-designer` callbacks; each share continues alone |
| S8 Guard | for a hero hit by an enemy action: `min(x, cap − taken)` | section 6.6 |
| S9 shields | absorb, earliest expiry first, then oldest | section 7.3 |
| S10 mana shield | 2 HP = 1 mana while mana lasts | §8.5 |
| S11 HP | subtract; at 0 the ball dies at once (§6.3 atomic) | `combat-engine` checks victory |
| S12 after | lifesteal, Rage, Rempart, Retour de souffrance | section 6.7 |

`Hit { amount_pre_guard, amount, guard_capped, absorbed, hp_lost, killed }` feeds the damage preview
(§1 pillar 2) and the log.

### 6.3 The bucket (§6.5, §5.1, §5.2, §4.8, §6.11, §8, §9)

Every entry is bp, summed once (all TUNE from the plan unless tagged):

| Source | Entry | Applies to |
|---|---|---|
| Isolement: target has no allied ball adjacent | +2 500 | all direct damage |
| Formation: per allied ball adjacent to the target | −1 000 each, at most −3 000 | all direct damage |
| Level gap: attacker level − target level | ±500 per level, capped ±2 500; 0 in normalized PvP | all direct damage |
| Marqué | +X (status magnitude) | all direct damage |
| Fourré: ability cast from 2 or more cells onto a ball on Fourré | −5 000 | abilities |
| Hauteur: ability cast from a Hauteur cell | +2 000 | abilities, not Choc (PROPOSAL, F35) |
| Weather: rain | Foudre +2 500, Feu −2 500 | tagged abilities (§4.8, v2) |
| Mouillé target and Foudre tag | +5 000 | tagged abilities |
| Class traits and abilities | Opportuniste +3 000 on Isolée, Fendoir +5 000 on Isolée, Élan +5 000 on Choc, Titan +10 000 on Choc | per `class-designer` data |
| Runes and keystones | Pression du bord +1 500, Trophées +100 per Perte (max +1 000), etc. | per data |
| Items | "+% vs Isolée", "+% Choc" | per `items-loot` data |

- Allied = same camp: own balls, Fragments, Revenants, other players' balls of the camp (PROPOSAL).
  Dépouilles and Rocs never count.
- Position is read **when the hit resolves** (after the move for a Choc, §6.5 "the displacement is
  resolved first").
- Isolement and Formation exclude each other by definition (0 allies vs 1 or more).

### 6.4 Combat modifiers on stats (`modifiers.rs`)

Effective ATQ, PUI, ARM, RES = `bonus(sheet, Σ stat bucket)` with entries: Gelé ARM +3 000,
Sentinelle ARM/RES +1 500, Glyphe ARM +3 000, Vitrification ARM/RES −1 000 per stack (max 3),
Répercussion ARM/RES +5 000, Roc inébranlable ARM/RES +2 000 on the rim, Cri de guerre ATQ +2 000,
Décrépitude ATQ −2 000, Tempo mortel ATQ/PUI +500 per stack (all TUNE from §5.1, §8, §9). Clamp the
bucket at −9 000 (PROPOSAL) so no stat reaches 0.

### 6.5 Choc (§6.5)

`shock_hits(head: &UnitView, run_after_move: &[UnitView], ctx) -> Vec<Hit>`:

- After the push is resolved, the first ball of the run takes a Physical hit with ratio 10 000 of
  the **head** ball's ATQ; every other run ball takes ratio 5 000 (§6.5, TUNE). K from the head's
  level.
- An ejected ball takes no Choc; a broadside makes no Choc (§6.5, FINAL as written).
- A ball stopped at the rim by a non-Éjecteur effect (§6.10 rule 3) takes a Choc of ratio 5 000 of
  the **source unit's** ATQ, or 500 bp of its own max HP as Pure when the source is terrain
  (PROPOSAL, F29).
- Hits resolve in the §6.10 order (closest first, then r, then q), atomically.

### 6.6 Guard of the hero (§6.5, §6.6)

- One enemy **action** (an ability use, a Movement and its Choc, a consumable) removes at most
  `mul_bp(hero.max_hp, 3 500)` from a hero, after stage S7 (§6.5, TUNE 35 %). The cap counts shield
  absorption too (PROPOSAL: "after reductions" = before shields).
- Per action, per hero: `combat-engine` keeps `taken: i32` for the action in progress and passes it
  as `ctx.guard_taken`.
- A Choc is covered (PROPOSAL, F10). Terrain (Lave, Ronces, Sables, Évent), DoT ticks and self costs
  (Pacte de sang) are not actions of an enemy, so not capped (PROPOSAL).
- Ejection is not damage: the Guard never saves an ejected hero (FINAL, #313 choice 3).

### 6.7 After-hit effects

- Lifesteal: the attacker's hero heals `mul_bp(hp_lost + absorbed, lifesteal_bp)` through the heal
  pipeline (section 7). Only the hero's own hits (PROPOSAL). Siphon 5 000 bp (§8.6) is the same path.
- Retour de souffrance (§8.6): the reflected 50 % is a new Pure hit with no after-effects (no chain,
  PROPOSAL).

### 6.8 DoTs and % max HP damage

- Saignement is Physical, Poison and Brûlure are Magical (PROPOSAL, F33). The tick amount is computed
  **once at application** through S1 to S5 (attacker side only: no position entries), stored in the
  status, then each tick goes through S9 to S11 (§6.11, PROPOSAL).
- Caldeira Brûlure +5 000 (§5.2) is a bucket entry at application.
- % max HP effects (Lave 1 000, Ronces 500, Pacte de sang 1 000, Décrépitude of Revenants 1 000,
  Explosif's burst, Résilient boss 2 500) are Pure, no bucket, no minimum, not Guard-capped unless
  they come from an enemy ability (PROPOSAL, F33).

### 6.9 Pacing check (TUNE, the main risk of this section)

Same-level numbers with the plan's values (no gear, Guerrier vs a Normal Brute, §5.3):

| Level | Fendoir (120 % ATQ) on Brute | Hits to kill Brute | Hero Choc (Élan) | Fragment Choc on Brute | Brute Choc on Guerrier | Hits to kill Guerrier |
|---|---|---|---|---|---|---|
| 1 | 15 | 8 | 19 | 6 (19 hits) | 7 | 20 |
| 50 | 86 | 7 | 108 | 36 (17 hits) | 40 | 19 |
| 100 | 160 | 7 | 201 | 66 (17 hits) | 75 | 19 |

An Elite Brute (HP ×3, other stats ×1.5) takes 33 to 36 Fendoirs at every level. With a rout at 3 Pertes
and 2 to 4 minute fights (§6.8), HP almost never decides a skirmish: ejection does. That may be the
intent ("the spirit of Abalone"), but §1 pillar 3 promises that stats matter a little. Proposal: keep
the plan's numbers in R1, put `hp_scale_bp` (start 10 000) and every ability `Base` in data, and set
the R1 ladder target "a same-level hero kills a Normal in 3 to 4 of its own turns, a Fragment dies in
4 to 6 enemy hits, a hero in 8 to 12" (PROPOSAL, TUNE). See F8.

### Dependencies (section 6)

`combat-engine` (calls `compute_hit`, order of effects, atomic death, action id for the Guard),
`class-designer` (ratios, `Base`, share and redirect callbacks, Écrasement 150 %), `items-loot`
(lifesteal, penetration, "+%" affixes), `encounter-boss-designer` (Résilient 25 %, Explosif),
`world-generator` (weather, v2), `ux-designer` (damage preview), `qa-balance` (pacing targets).

### Tests (section 6)

Unit, `damage.rs` (Given/When/Then, all at level 1, K = 100):

- Given a Guerrier (ATQ 15) and a Normal Brute (ARM 14) with one adjacent ally, When Fendoir (12 000)
  hits, Then raw 18, mitigated 15, bucket −1 000, damage 13.
- Same, Brute Isolée, Then bucket +2 500 + 5 000 = +7 500, damage 26.
- Given a Guerrier hero leading a 2-ball push into one Brute that ends Isolée, Then Choc 15 → 13 →
  bucket +5 000 (Élan) + 2 500 → 22.
- Given a 2-ball run of Brutes, Then the second ball takes ratio 5 000: raw 7, mitigated 6, bucket
  +5 000 (Élan) − 1 000 (Formation: the first run ball is adjacent), damage 8.
- Given an Assassin (ATQ 16) Assassinat at 40 000 on an Isolée Mage hero (ARM 20, HP 102), Then raw
  64, mitigated 53, bucket +5 500, 82 before Guard, Guard cap 35, damage 35, `guard_capped` true.
- Given a Fragment Choc of raw 3 on a Gardien L10 (ARM 54) in full Formation, Then damage 1 (minimum).
- Given a L5 attacker and a L1 target, Then level entry +2 000; L10 vs L1, Then +2 500 (cap).
- Given a bucket of Fourré −5 000, Formation −3 000 and level −2 500, Then clamp −8 000.
- Given Bris (×1.5) on a 20-damage hit, Then 30 (explicit stage after the bucket).
- Given a shield of 10 and a hit of 25, Then absorbed 10, HP lost 15.
- Given two enemy abilities in one action hitting the same hero (Chaîne d'éclairs bounces), Then their
  sum is capped at 35 %.
- Given a Pure hit, Then ARM and RES are ignored.
- Property: damage is monotonic in the attacker's stat and anti-monotonic in the defense.
- Property: same inputs, same `Hit` (pure); no stage reads a `HashMap`.
- e2e (Playwright, `client-ui` task, R1): hovering Fendoir on a Brute shows the same number as the
  `Hit` of the WASM preview, and after casting, the HP ring drops by that number.

### Risks (section 6)

- Pacing (6.9).
- Guard plus Formation can make heroes very hard to kill by damage; the stated main
  threat is ejection, which the Guard does not touch (FINAL choice).

---

## 7. Healing, shields and the heal pipeline (§6.5, §6.7, §6.11, §8.4)

### 7.1 Pipeline

`compute_heal(spec, healer, target, ctx) -> Heal`:

1. `raw = Base + mul_bp(PUI, ratio)` or `mul_bp(target.max_hp, pct)`.
2. Heal bucket (Revitalisation and similar, TUNE), clamp at −10 000 (PROPOSAL).
3. Usure: `× (10 000 − usure_bp)`, `usure_bp = min(8 000, 1 000 × (t − T0 + 1))` when `t ≥ T0`;
   `t` is the **receiving** entity's turn count (PROPOSAL, F31); `T0 = 20`, or 12 in a skirmish
   (§6.7, TUNE).
4. Poison: `/ 2` (§6.11, TUNE).
5. `healed = min(missing_hp, x)`; no minimum of 1.
6. Overheal `x − healed` becomes a shield when the source allows it (Lumière accumulée up to
   1 000 bp of max HP, §8.4; Surplus de soins rune) (TUNE).

### 7.2 Max HP changes

When max HP rises or falls (Poigne de l'immortel, Croissance excessive), current HP moves by the same
delta, never below 1 (PROPOSAL).

### 7.3 Shields

- Each shield is a status instance (`Bouclier`, section 9) with an amount and an expiry. Several
  shields coexist and add up; damage drains the one that expires first, ties by oldest (PROPOSAL,
  F15). Total shield is capped at `max_hp` (PROPOSAL, TUNE).
- Mana shield (§8.5): after shields, each 2 HP of damage costs 1 mana (TUNE); an odd last point goes
  to HP (PROPOSAL).

### Dependencies (section 7)

`class-designer` (heal ratios, Grâce, Martyr, Lien vital, Sacrifice shield), `combat-engine` (turn
counters for Usure), `ux-designer` (heal preview, Usure indicator).

### Tests (section 7)

- Given a receiving entity at turn 22 of a dungeon fight and a heal of 100, Then 70; poisoned, Then 35.
- Given turn 12 of a skirmish, Then −1 000; turn 19, Then −8 000 (cap).
- Given a hero missing 10 HP healed for 40 with Lumière accumulée and max HP 156, Then healed 10,
  shield 15 (cap `mul_bp(156, 1 000) = 15`).
- Given shields 10 (expires in 1) and 20 (expires in 2), When 15 damage, Then first shield gone, second
  at 15.
- Given max HP 100 at 40 HP, When max HP rises by 20, Then 60 / 120.

---

## 8. Turn timers: durations, cooldowns, Hâte (§6.3, §7.1)

### 8.1 Expiry clocks

```rust
pub enum Expiry {
    BearerTurns(u8),          // "N tours": N of the bearer entity's turns
    UntilTurnStart(EntityId), // "jusqu'à ton prochain tour": removed at that entity's next turn start
    ThisTurn,                 // "ce tour" (Bélier, Percée)
    Charges(u8),              // consumed by uses (Lame empoisonnée 3, Insaisissable 1 dodge)
    Combat,                   // until the end of the fight (souls, Trophées)
}
```

- `BearerTurns(N)` decrements at step 2 of the bearer entity's end of turn (§6.3). A status applied
  **during its bearer entity's own turn** is not decremented at the end of that turn (PROPOSAL, F2):
  "N turns" always means "N of your next turns". So an enemy Gelé 1 skips exactly one of your turns
  (§6.3, FINAL as written), and a self-cast Peau de fer 2 covers the next two enemy turns.
- The bearer is the **entity** that owns the ball (a Fragment's bearer is its hero's entity).
- Terrain timers (Mur de flammes 3, Pont 2) use the caster entity's turns with the same rule
  (PROPOSAL; `combat-engine` owns the terrain layer).

### 8.2 Duration pipeline for controls (§6.11, §5.2, §19)

`final = base + biome` (Toundra Gelé +1, Tourbières Poison +1, TUNE) → Ténacité (−1 if ≥ 2 and
`tenacity ≥ 50`, TUNE) → PvP (−1, §19, TUNE) → `max(1, final)` (PROPOSAL order, F13). Only for
controls (Étourdi, Gelé, Enraciné, Silence, Aveuglé, Stase from an enemy) and for Poison's biome rule.

### 8.3 Cooldowns

- On use, `cd_left = effective_cd + 1`; at step 2 of the owner's turn start, every `cd_left > 0`
  decrements; usable iff `cd_left == 0` (PROPOSAL, F1). Result: "Recharge N" blocks exactly the next
  N own turns, and CD 0 means once per turn (§6.3, as written).
- The HUD shows `cd_left` as "ready in K of your turns" (for `ux-designer`).
- `effective_cd(base, r2_cd, haste, is_ult)`:
  1. `cd = base − (1 if the R2 upgrade is the cooldown one)` (§10, TUNE).
  2. If `!is_ult && cd ≥ 3`: `cd = max(1, cd − min(2, haste / 25))` (§7.1, TUNE: 25, cap 2).
  3. Ultimate-only reductions (rune Chasseur ultime −1, §9.2) apply after, `max(1, …)`.
- Operations for abilities (data verbs, `class-designer` uses them): `AddCd(+1)` on every `cd_left >
  0` (Lenteur), `ReduceShortest(1)` on the smallest non-ult `cd_left > 0`, ties by slot (Sablier),
  `FreezeTimers(next turn)` (Arrêt du temps: skip the next start decrement and duration decrement of
  the target entity), `AddAll(+2)` (Arrêt du temps on a boss) (all TUNE from §8.7).

### Dependencies (section 8)

`combat-engine` (turn steps call `on_turn_start`, `on_turn_end`), `class-designer` (durations and CDs
in data, the verbs), `encounter-boss-designer` (boss timers use the same clocks), `ux-designer`
(countdown display).

### Tests (section 8)

- Given CD 2 used at own turn 1, Then blocked at turns 2 and 3, usable at turn 4.
- Given CD 0 used at turn 1, Then refused again at turn 1, usable at turn 2.
- Given an enemy Gelé 1 applied during the enemy turn, Then the target skips its next turn and the
  status is gone after it.
- Given a self-cast `BearerTurns(2)` at own turn 1, Then active through turns 2 and 3's enemy turns
  and removed at the end of own turn 3.
- Given Ancrage `UntilTurnStart(caster)`, Then removed at the caster's next turn start, not before.
- Given Hâte 49 and base CD 3, Then 2; Hâte 50, Then 1; Hâte 100, Then 1 (cap −2); CD 2, Then 2; an
  ultimate CD 8 with Hâte 100, Then 8.
- Given a 3-turn stun in PvP on a target with Ténacité 50, Then 3 → 2 → 1.
- Given a 1-turn stun with Ténacité 50, Then 1 (only ≥ 2 shortens).
- Given Lenteur on a hero with cooldowns [0, 2, 3], Then [0, 3, 4].

---

## 9. Statuses and keywords (§6.11)

### 9.1 Data model

```rust
pub enum StatusKind { Ancre, Stase, Insaisissable, Enracine, Etourdi, Gele, Silence, Aveugle,
    Provocation, Saignement, Poison, Brulure, Alourdi, Allege, Marque, Bouclier, Inejectable,
    Lassitude, Vitrification, Mouille, Charge, Brule /* Mage states */, Immunity(CcCategory) }
pub enum CcCategory { Hard, Mobility, Cast }
pub struct Status { kind: StatusKind, expiry: Expiry, magnitude: i32, stacks: u8,
                    source: EntityId, applied_turn: (EntityId, u16), seq: u32 }
pub struct StatusSet(Vec<Status>);  // sorted by (kind, source, seq); part of the state hash
```

`statuses.ron` holds, per kind: category, flags (`immovable`, `untargetable`, `no_act`, `no_self_move`,
`no_select`, `no_lead`, `no_cast`), stacking mode, default magnitude. Flags feed the push oracle
(section 5) and `combat-engine`'s legality checks.

### 9.2 Table (effects from §6.11; flags derived here)

| Status | Flags | Magnitude | CC category |
|---|---|---|---|
| Ancré | immovable | — | none |
| Stase | immovable, untargetable, no_act | — | Hard when set by an enemy |
| Insaisissable | immovable, no_self_move, dodge 1 single-target ability (Charges 1) | — | none |
| Enraciné | no_self_move | — | Mobility |
| Étourdi | no_select, no_cast | — | Hard |
| Gelé | Étourdi + ARM +3 000 | 3 000 (TUNE) | Hard |
| Silence | hero casts nothing | — | Cast |
| Aveuglé | no_lead | — | Cast |
| Provocation | forces enemy single-target abilities in range | — | none (PROPOSAL, F14) |
| Saignement, Poison, Brûlure | tick at bearer turn start; Poison halves heals | tick amount | none |
| Alourdi, Allégé | Weight ±1 or ±2 | ±1, ±2 | none |
| Marqué | bucket +X | X (e.g. 2 000, TUNE) | none |
| Bouclier | absorbs | amount | none |
| Inéjectable | unejectable | — | none |
| Lassitude | cannot gain Inéjectable | 2 turns (TUNE) | none |
| Vitrification | ARM/RES −1 000 per stack | stacks 1..=3 (TUNE) | none |

### 9.3 Stacking (PROPOSAL, F15)

- Default: one instance per kind on a ball. Re-applying keeps `max(duration)` and `max(magnitude)`.
- DoTs: one instance per (kind, source entity); a new application from the same source refreshes.
- Shields: every instance kept (section 7.3).
- Vitrification: stacks +1 per application, max 3; −1 per turn spent off Corruption (§5.1).
- Inéjectable: never stacks; on expiry, Lassitude 2 (§6.11).

### 9.4 Diminishing returns and Ténacité (§6.11)

- When a control of category C **expires or is cleansed**, the ball gains `Immunity(C)` for 2 of its
  entity's turns (§6.11, TUNE 2; start at expiry is PROPOSAL, F14).
- While immune, any status of category C is refused, including a Mage reaction's Étourdi (§6.11).
- Stase cast on an ally sets no immunity (§6.11).
- Ténacité: section 8.2. Inébranlable rune: ignores the first control of the fight (`class-designer`
  data, uses `Charges(1)`).

### 9.5 Mass controls (§6.10)

A hard control on a zone affects at most 3 balls chosen by the caster (§6.10, TUNE). `status.rs`
exposes `apply_to_targets(kind, targets: &[UnitId]) -> Result<..>` which refuses more than 3 for a
Hard category; the choice comes from the action input.

### Dependencies (section 9)

`combat-engine` (flags in legality, state hash, Insaisissable dodge, Provocation targeting),
`class-designer` (who applies what), `ux-designer` (status glyphs and timers), `encounter-boss-designer`
(boss Inéjectable, Résilient).

### Tests (section 9)

- Given an Étourdi 1 that expires, When a Gelé is applied next turn, Then refused (Hard immunity);
  after 2 of the bearer's turns, Then accepted.
- Given immunity Hard, When Vapeur triggers, Then no Étourdi, the reaction's damage still applies.
- Given Poison 2 from source A and Poison 3 from source B, Then two instances; from A again with 1,
  Then A keeps 2.
- Given Inéjectable expiring, Then Lassitude 2; When Forteresse is cast during Lassitude, Then that
  ball does not gain Inéjectable.
- Given a Hard zone control with 4 targets, Then `Err(TooManyTargets)`.
- Given Vitrification 3, When a fourth stack lands, Then 3.
- Property: `StatusSet` stays sorted after any sequence of apply and expire; its hash is order-free.

---

## 10. Resource pools (§6.3, §7.1, §5.2, §8)

**Implementation.**

```rust
pub struct ResourcePool { kind: ResourceKind, cur_c: i32, max_c: i32, charges: bool }
```

- Stored in **centi-units** (`cur_c = 100 × shown value`), PROPOSAL (F12): +10 % of +5 Rempart gives
  +550 centi, not a floored 5. The HUD shows `cur_c / 100`. Costs are whole units × 100.
- `gain(base, tags, ctx)`: `base × 100` then the gain bucket: VIT (section 3.6), biome affinity +1 000
  (§5.2), Dunes −1 000 unless the gain comes from a Fire-tagged ability (§5.2), runes. Charge-based
  pools (Grains de sable, combo points) ignore the bucket (`charges: true`, PROPOSAL).
- `spend(cost)` fails when `cur_c < cost × 100`. Mage Surchauffe +5 000 per spell already cast in the
  turn is a cost bucket (`class-designer` data).
- Clamp to `0..=max_c`; Surcharge raises `max_c` by 3 000 bp (§9.2, TUNE).
- Integrity: no ability costs more than its pool's max (§24.3).

**Dependencies.** `class-designer` (each class's gain events and starts), `combat-engine` (turn start
gain, §6.3 step 1), `ux-designer` (bar).

**Tests.** Given Rempart at 0 with VIT 14 (+200 bp) and affinity (+1 000), When +5 per turn, Then
`cur_c = 560`, shown 5; after two turns 1 120, shown 11. Given Grains 2, When +1 with affinity, Then 3.
Given Mana 150 max with Surcharge, Then 195. Given a cost above the pool, Then `Err`.

---

## 11. Passive tree: the Five Paths (§9)

### 11.1 Data and allocation

```rust
pub struct PathDef { id: PathId, keystones: [KeystoneId; 4], rows: [[RuneId; 3]; 3] }
pub struct ShardDef { id: ShardId, row: ShardRow /* Offense, Flex, Defense */, per_rank: StatEntry }
pub struct PassiveAlloc {
    primary: Option<PathId>, keystone: Option<(KeystoneId, u8)>, runes: Vec<(RuneId, u8)>,
    secondary: Option<PathId>, secondary_runes: Vec<(RuneId, u8)>, shards: [[u8; 3]; 3],
}
```

### 11.2 Budget and rules (§9.1)

- Points at level L: `max(0, L − 1)`: 99 at L100 (TUNE as content, FINAL as arithmetic: 5 + 30 + 10 +
  54 = 99, checked). Unspent points are allowed (banked).
- Keystone: one, rank 0..=5; ranks of runes 0..=5 (TUNE).
- Primary rows: at most 2 runes per row (TUNE). Gates (TUNE): row 1 needs keystone rank ≥ 1; row 2
  needs 8 points in keystone + row 1; row 3 needs 16 points in keystone + rows 1 and 2 (counting the
  rows above only is PROPOSAL, F19).
- Secondary path: another path, opens at 20 points in the primary (TUNE), 2 runes from 2 different
  rows, no keystone.
- Shards: 3 rows × 3 shards, rank `≤ shard_cap(L) = min(6, 1 + floor(L / 16))` (TUNE).
- Checked: at every L from 2 to 100 the spendable maximum `45 + 9 × shard_cap(L)` is ≥ `L − 1`, and
  equals 99 at L100. Note: 20 points in the primary need level 21, but §11 unlocks the secondary at
  level 20 (F19).
- Spend anywhere out of combat; removing points only through a respec (PROPOSAL).
- Respec at the Path Master: free below level 20, then `10 × level` gold (§9.1, TUNE); changing the
  primary resets everything at the same price (§9.1). The price is applied by `economy`.

`validate_passive(alloc, level, data) -> Result<(), PassiveError>` returns the first broken rule in
the order above.

### 11.3 Values per rank (PROPOSAL, F18)

- **Runes**: the value written in §9.2 is the rank 5 value; rank r gives `floor(V × r / 5)`.
- **Keystones**: rank 1 unlocks at 6 000 bp of the written value, +1 000 bp per extra rank (rank 5 =
  100 %).
- **Stat runes** (TUNE, per rank): Légende: Hâte +5 Hâte; Légende: Lignée +100 bp lifesteal; Légende:
  Ténacité +10; Transcendance +5 Hâte; Perspicacité cosmique +5 Hâte; Célérité +1 VIT.
- **Shards** (per rank; §9.2 "about +2 %", TUNE): Force adaptative +200 bp on the higher of ATQ and
  PUI (ties: ATQ); Hâte +5; Pénétration +200 bp; VIT +1; PV with level `+100 + L` bp; PV +200 bp;
  Ténacité +10; ARM and RES +200 bp each.

So full Hâte runes (3 × 25) plus the Hâte shard (30) exceed the cap of 50; the cap holds (section 8.3).

### Dependencies (section 11)

`class-designer` or the talent content author (rune and keystone effects as data), `economy` (respec
gold), `client-ui` and `ux-designer` (Paths window), `combat-engine` (keystone hooks), `items-loot`
(nothing; items never grant passive points, §16 "never talent points from quests" applies too).

### Tests (section 11)

- Given level 2 and 1 point in a keystone, Then valid; 2 points, Then `NotEnoughPoints`.
- Given 8 points in keystone 5 + row 1 rank 3, Then row 2 opens; with 7, Then `RowLocked(2)`.
- Given 3 runes in row 1, Then `TooManyInRow`.
- Given level 21 with 20 points in the primary, Then the secondary opens; level 20, Then impossible.
- Given a secondary with 2 runes in the same row, Then `SecondarySameRow`.
- Given level 15 and a shard at rank 2, Then `ShardAboveCap` (cap 1); level 16, Then valid.
- Given level 100 and a full tree, Then 99 points spent, valid.
- Exhaustive: for L in 2..=100, `max_spendable(L) ≥ L − 1`.
- Respec cost: L19 → 0, L20 → 200, L100 → 1 000.
- Data integrity: 5 paths, 4 keystones each, 3 rows of 3, 9 shards, every rank value present.
- e2e (Playwright, `client-ui` task, R3): open the Paths window at level 2, spend 1 point in a
  keystone, Then "0 points left" and row 1 unlocks; screenshot in the PR (CONTRIBUTING §6.4).

---

## 12. Active tree (§10, §8.0)

### 12.1 Data and allocation

```rust
pub struct Branch { id: BranchId, tier1: [AbilityId; 2], tier2: [AbilityId; 2], ult: AbilityId }
pub struct ClassTree { class: ClassId, branches: [Branch; 2] }
pub enum Rank { R1, R2, R3(Variant) }   // cumulative cost 1, 2, 4
pub enum Variant { A, B }
pub struct ActiveAlloc { ranks: Vec<(AbilityId, Rank)>, slots: [Option<AbilityId>; 4], ult_slot: Option<AbilityId> }
```

### 12.2 Rules (§10, all TUNE unless tagged)

- Points at level L: `floor(L / 5)`: 20 at L100 (FINAL as arithmetic: 5 × 4 = 20). Unspent points are
  banked (PROPOSAL; the §10 example banks the L40 point for Charge R3 at L45).
- Rank costs: R1 1, R2 1, R3 2. R2 needs R1, R3 needs R2.
- Tier 1 (abilities 1, 2, 5, 6): level ≥ 5. Tier 2 (3, 4, 7, 8): level ≥ 15 and 2 points in tier 1 of
  the same branch. Ultimate: level ≥ 30 and 4 points in tiers 1 and 2 of its branch. Points count
  every rank (PROPOSAL, F19).
- R2 kind is data per ability: `Effect25` (every effect magnitude ×1.25, floor; never durations,
  ranges, counts or ejection limits) or `CdMinus1` (only when base CD ≥ 1) (PROPOSAL).
- R3 variant: chosen when bought, switched for free at the hub (§10).
- Equip: 4 non-ultimate slots and 1 ultimate slot, distinct, only unlocked abilities; changes only out
  of combat (§10).
- Item "+1 rank" affix (§12): lifts an R1 ability to R2 in combat; never unlocks, never creates R3
  (PROPOSAL, F20).
- Respec at the hub: same price as section 11.2 (PROPOSAL, `economy` prices).

### 12.3 Check of the §10 Warrior example

L5 Charge (1), L10 Fendoir (2), L15 Percée (3; Assault tier 1 has 2 points ✓), L20 Charge R2 (4), L25
Tourbillon (5), L30 Avalanche (6; Assault has Charge 2 + Fendoir 1 + Percée 1 = 4 ✓), L35 Fendoir R2
(7), L45 Charge R3 (9: the L40 point waits). Valid at each step.

### Dependencies (section 12)

`class-designer` (branches, R2 kinds, R3 variants as data), `items-loot` (rank affix), `economy`
(respec), `client-ui` and `ux-designer` (tree window, action bar), `combat-engine` (reads equipped
abilities and ranks at fight start).

### Tests (section 12)

- Each step of the section 12.3 example validates; Avalanche at L29, Then `LevelTooLow`; at L30 with 3
  Assault points, Then `BranchPointsTooLow`.
- R3 without R2, Then `RankOrder`; R3 at L40 with 7 points spent, Then `NotEnoughPoints`.
- Five abilities at R3 at L100, Then exactly 20 points, valid.
- Equipping a locked ability, a duplicate, or a non-ultimate in the ultimate slot, Then errors.
- `CdMinus1` on a CD 0 ability, Then data integrity failure.
- Rank affix on R1, Then effective R2; on R2, Then R2.
- e2e (Playwright, `client-ui` task, R3): at level 5 unlock Charge, equip it in slot 1, Then the action
  bar shows it on key 1.

---

## 13. XP and levels (§11, §4.4)

### 13.1 The curve (§11, TUNE)

`xp_required(n) = floor((12 + n) × (50 + 10 n) / 3)` for n in 1..=99 (the plan's `(4 + n/3) × (50 +
10n)` with one floor, PROPOSAL F22).

| n → n+1 | 1 | 2 | 4 | 9 | 19 | 29 | 49 | 59 | 79 | 99 |
|---|---|---|---|---|---|---|---|---|---|---|
| XP | 260 | 326 | 480 | 980 | 2 480 | 4 646 | 10 980 | 15 146 | 25 480 | 38 480 |

Cumulative: L10 5 298, L30 58 960, L60 346 120, L100 1 394 778.

### 13.2 Kill XP (PROPOSAL, F21)

- `kill_xp(monster) = floor(threat_half × (200 + 13 × L_mob) / 20) × gap_bp / 10 000`, with
  `threat_half` the encounter budget unit (Sbire 1, Normal 2, Champion 4, Elite 8, §5.3) (TUNE).
- Fit: at 8 skirmish-sized fights per hour (threat 6) and combat = 40 % of XP (§11), the time to reach
  L10, L30, L60, L100 is 1.6 h, 11.2 h, 41.3 h, 111.2 h, against §11's 1.5, 12, 45, 110 (TUNE: the 8
  fights per hour is an assumption for `qa-balance` to measure in R4).
- Only monsters that are defeated give XP: killed, ejected, or fled after their leader died (PROPOSAL).
  Summons, Revenants and fled players give none. Draw, flight, defeat: 0 (§6.7, §6.12).
- Group: each member gets `floor(Σ kill_xp of all packs / party size)` (PROPOSAL: equals the solo
  rate, since one pack spawns per player, §6.2).

### 13.3 Other sources, as basis points of `xp_required` (§11 shares, TUNE)

Every non-kill source grants `mul_bp(xp_required(L_src), bp)` where `L_src` = the content level
clamped to the hero level. Owners set the bp, this role checks the share:

| Source | Share target | Owner of the bp |
|---|---|---|
| Combat | about 40 % | this role (13.2) |
| Quests | about 40 % | `narrative-quest-designer` (already in bp of `xp_required`) |
| Exploration | about 10 % | `world-generator` and `narrative-quest-designer` (10 000 bp at 100 % of a zone) |
| Dungeons and events | about 10 % | `encounter-boss-designer` |
| Gathering, crafting | "a little" hero XP | gathering owner |

### 13.4 Level band and XP gap (§4.4, §11)

- `level_band(delta = L_mob − L_hero)`: Grey ≤ −6, Green −5..−3, Yellow −2..+2, Orange +3..+4, Red ≥ +5
  (same table as `encounter-boss-designer` 3.3; ends TUNE, middle PROPOSAL).
- `xp_gap_bp(delta)`: `≤ −6 → 0` (§11, TUNE); `−5..−1 → 10 000 + 1 000 × delta` (PROPOSAL, F21);
  `≥ 0 → 10 000 + min(4 000, 1 000 × delta)` (§11, TUNE).

### 13.5 Level-up, cap, rested, hardcore

- `apply_xp(hero, amount) -> Vec<LevelUp>`: adds, loops over several levels, grants passive and active
  points (sections 11, 12) and the unlock flags of `progression.ron` (the §11 table, data).
- Cap 100: XP beyond is discarded and the bar shows "max" (PROPOSAL).
- Rested (§11): offline or at the hub, the pool grows by 500 bp of `xp_required(L)` per real hour, up to
  15 000 bp (1.5 levels, TUNE); while it lasts, kill XP is doubled and the bonus drains the pool
  (PROPOSAL rate, F21). Quests get no rested bonus (as `narrative-quest-designer`). Time comes from the
  save timestamps (local save; cheating only cheats yourself, §13.4).
- Hardcore (§11): a flag in the hero save; `combat-engine` and the save owner apply permadeath. No
  formula here.

### Dependencies (section 13)

`encounter-boss-designer` (threat units, level band display), `narrative-quest-designer` (quest bp),
`world-generator` (exploration grants, hub and Beacon presence for rested), `client-ui` (XP bar,
level-up), `qa-balance` (fights per hour, time-to-level reports), save owner (`tech-lead`).

### Tests (section 13)

- Table test of `xp_required` for the section 13.1 columns; cumulative at L10, L30, L60, L100.
- Given a level 1 hero and a level 1 Normal (2 half-points), Then 21 XP; level 3 Normal, Then
  `floor(2 × 239 / 20) = 23`, × 1.2 = 27; level 1 hero vs level 7 monster, Then capped at +40 %.
- Given a level 10 hero and a level 4 monster (delta −6), Then 0; level 5 (−5), Then 50 %.
- Given 259 XP at level 1 and +2 XP, Then level 2 with 1 XP over and 1 passive point.
- Given 1 000 000 XP granted at level 1, Then a single call reaches the right level and grants all
  points (multi-level).
- Given level 100, Then XP stays 0 and points stay 99 and 20.
- Given a rested pool of 50 and a kill of 30, Then 60 XP and pool 20.
- Sim (R9, `qa-balance` runs it): the pacing model above lands within ±10 % of §11's four targets.
- e2e (Playwright, `client-ui` task, R3): win the tutorial fight, Then the XP bar grows by the
  `kill_xp` shown in the end banner.

---

## 14. Normalized templates (§19, §20)

**Implementation** (`template.rs`, PROPOSAL values, F30):

- **Ranked arena**: level 100 class block × gear template +8 000 bp on HP, ATQ, PUI, ARM, RES (TUNE);
  Hâte, Ténacité, lifesteal, penetration 0 from gear; Weight = class base; VIT = `vit(100)` + class add;
  the player's own passive tree (99 points) and active tree (20 points) and variants count (§19). No
  Aspects or uniques. Level gap entry is 0.
- **BR**: level 20 class block, no gear, passive tree off (PROPOSAL), 2 tier-1 abilities at R1, no
  ultimate (found in chests, §20). Every player has the same template (§20).
- PvP control shortening: section 8.2.

**Dependencies.** `pvp-br-designer` (when a template applies), `items-loot` (gear ignored),
`netcode` (signed builds).

**Tests.** Given any real gear, When the arena template is built, Then stats equal the template table;
two players of the same class and build get equal sheets. Given BR, Then L20 stats and 2 abilities.

---

## 15. World-side formulas (§4.2)

- Step time: `300 ms × biome_cost_bp / 10 000`, then `× (10 000 − elan_bp) / 10 000`, then
  `× 10 000 / (10 000 + speed_bp)` (§4.2, TUNE): Élan 2 000 at L20, 3 500 at L40; `speed_bp` = VIT
  (section 3.6) + runes (Chasseur implacable, Bottes magiques). Glace 8 000 bp plus a slide is
  `world-generator`'s.
- Out of combat regen: `mul_bp(max_hp, 500)` per whole second (§4.2, TUNE); full on a Beacon or at the
  hub.

**Dependencies.** `world-generator` (calls them), `client-ui` (animation timing).

**Tests.** Plains L1 VIT 10 → 300 ms; Swamp L40 VIT 14 → `450 × 0.65 = 292`, `/ 1.02 = 286 ms`. Regen
of a 156 HP hero → 7 per second.

---

## 16. Data integrity tests (§24.3, this role's data)

One test file per data file (`crates/abalone-rpg/tests/systems_data.rs`,
`crates/abalone-world/tests/progression_data.rs`):

- Every class has multipliers and a Weight in 1..=3; every status kind in `statuses.ron` exists in
  the enum and back.
- Passive: 99 points exactly fill the tree; every rune and shard has rank values; gates are increasing.
- Active: every class has 2 branches of 2 + 2 + 1; rank costs sum to 4; 5 × 4 = 20; every R2 kind is
  legal for its CD; every R3 has two variants.
- No ability cost above its pool's max (with `class-designer` data).
- Every Hard control in data declares at most 3 targets (§6.10).
- XP table is strictly increasing; `kill_xp` is monotonic in level.

---

## 17. WASM and UI surface (§24.4, §24.5, §24.6)

Pure functions this role exports for `combat-engine` and `tech-lead` to bind (JSON, versioned):

| Function | Returns |
|---|---|
| `stat_sheet(hero)` | the `StatBlock`, plus each bucket's entries for the tooltip |
| `push_preview(state, move)` | section 5.5 |
| `damage_preview(state, action)` | list of `Hit` per target, Guard flag, kills |
| `xp_state(hero)` | level, XP, `xp_required`, rested pool |
| `validate_passive`, `validate_active` | `{ok, error}` for the windows |

e2e owners: `client-ui` (one Playwright test per window or preview, screenshots in UI PRs). MCP
(#163) adds Weight and abilities to `legal_moves` later (§24.6), separate issue.

---

## 18. Feedback on the gameplay spec

Contradictions and gaps found while building this role. The gameplay spec is not modified; each item
has a PROPOSAL in the section cited.

- **F1 (cooldowns).** §6.3 says "Recharge N = unavailable during your next N turns" and "cooldowns go
  down by 1 at turn start". Stored as N, that blocks only N − 1 turns and makes CD 1 equal CD 0.
  Proposal: store N + 1 (section 8.3).
- **F2 (durations).** §6.3 defines "N turns" by the bearer's N-th turn, but says nothing about a status
  applied during the bearer's own turn (self-buffs, buffs on your own Fragments): read literally, a
  "1 turn" self-buff ends the same turn. Also §8 uses a second clock, "until your next turn". Proposal:
  section 8.1.
- **F3 (Titan).** §8.2 Titan makes the hero Inamovible, but §6.11 Inamovible forbids moving itself,
  while Titan's text has the hero pushing. Needs "cannot be moved by others" as a separate keyword.
- **F4 (Avalanche).** §6.4 lists Avalanche among abilities that push "at equal numbers", but §8.2
  Avalanche is 4 against at most 3, never equal. The Weight condition for Avalanche is not stated
  (assumed to apply).
- **F5 (Pente).** §5.1 does not say which cell's slope counts (head, contact, every pusher) nor what
  "minimum 1" bounds. Proposal: the head's cell, total ≥ 1.
- **F6 (run and blockers).** §6.4 "une boule de son camp" is ambiguous (pusher's or pushed camp's), and
  the run is undefined when balls of several enemy entities touch (BR, group fights). Proposal:
  section 5.1.
- **F7 (Roc inébranlable).** "+2 Weight to resist" vs "Weight bounded 1 to 5": does it break the cap?
- **F8 (pacing).** With §5.3, §6.5 and §7.2 numbers, a same-level Normal Brute needs 7 to 8 Fendoirs,
  an Elite 33 to 36, a Fragment Choc about 17 to 19 hits (section 6.9). Damage barely matters in 2 to
  4 minute fights; no ability has a `Base` value.
- **F9 (Elite HP).** §5.3 "Élite ×1.5" and "PV ×3": ×3 total or ×4.5? (aligned with
  `encounter-boss-designer`: ×3 total).
- **F10 (Guard scope).** §6.5 caps "one ability"; a Movement's Choc (doubled by Avalanche, +100 % by
  Titan), DoT ticks and terrain are not covered.
- **F11 (bucket).** `(1 + Σbonus)` has no floor: Fourré −50 % + Formation −30 % + level −25 % is −105 %.
  Additive vs multiplicative is not said for "×1.5" (Bris) or "doubled" (Avalanche).
- **F12 (resource rounding).** Percentage gains on small integer resources vanish (+10 % of +5 = 0);
  no rule for charge resources (Grains, combo points).
- **F13 (Ténacité and duration order).** §7.1 sets a 50 threshold, §6.11 none; the order of biome +1,
  Ténacité −1 and PvP −1 is not given.
- **F14 (diminishing returns).** The 2-turn immunity start (on application or on expiry) is not given;
  Provocation has no category.
- **F15 (stacking).** No rule for the same status twice, DoTs from several sources, or several shields.
- **F16 (Hâte units).** Shards are "about +2 % per rank", which means nothing for Hâte, VIT or
  Ténacité (flat stats). The Hâte cap "−2 turns in total" does not say whether R2 and runes count.
- **F17 (shard "PV with level").** No value.
- **F18 (rune values).** Ranks 1 to 5 exist for every rune and keystone, but no per-rank value.
- **F19 (tree gates).** The secondary path needs 20 points in the primary, reachable at level 21, but
  §11 unlocks it at level 20. "Points in the path/branch" does not say whether the gated row's own
  points or higher ranks count.
- **F20 (rank affix).** An item "+1 rank" on an ability needs a variant choice at R3; undefined.
- **F21 (XP).** No kill XP formula; no XP factor for monsters 1 to 5 levels below; no rested accrual
  rate; no rule at level 100. Proposals in section 13.
- **F22 (curve rounding).** `C(n) = 4 + n/3` is not an integer; rounding not given.
- **F23 (VIT).** "+0.1 per level" vs integer stats; "+0.5 % world speed per point" (all points or above
  10?); "+1 % resource per 2 VIT above 10" (bands).
- **F24 (Lest).** "Each Weight point above the class base costs 3 VIT": sheet Weight only, or also
  combat buffs (Glyphe, Boue)?
- **F25 (§6.4 vs §6.11 on Inéjectable).** A push that would eject an Inéjectable ball is illegal for a
  Movement; for an effect, §6.10 rule 3 already stops balls at the rim. Consistent, but worth one
  example in `rules.md`.
- **F26 (K claim).** "The reduction stays the same from level 1 to 100" holds only without gear.
- **F27 (Fragments).** Derived from the hero's naked or final (geared) stats?
- **F28 (Revenants).** Only HP is defined; ATQ, ARM, RES and level (for K) are not.
- **F29 (Choc on a rim stop).** §6.10 rule 3 says the ball stopped at the rim "takes a Choc", but a
  Choc is defined from a pushing head's ATQ; there is none for an ability or terrain.
- **F30 (templates).** PvP template stats are "fixed" with no values; BR does not say whether the
  passive tree applies.
- **F31 (Usure).** "Turn 20 of each entity": the healer's or the receiver's count? Do overheal shields
  count as heals?
- **F32 (shields).** Only Lumière accumulée has a cap; no global shield cap.
- **F33 (damage types).** Saignement, Poison, Brûlure and % max HP damage (Lave, Ronces, Pacte,
  Décrépitude, Explosif) have no type; Guard and bucket rules for them are not given.
- **F34 (penetration).** A shard and a rune give "Pénétration", which the formula does not contain.
- **F35 (Hauteur and Fourré).** Written for "abilities" only; Choc not addressed.
- **Checked OK:** passive 5 + 30 + 10 + 54 = 99 and the shard cap keeps spendable ≥ available at every
  level; active 20 points = 5 × 4, ultimate reachable at level 30 with 4 branch points; the six §6.4
  examples hold under section 5.3; the §10 Warrior example is valid (with the L40 point banked).

---

## 19. Open questions

1. Status duration when applied during the bearer's own turn: does the current turn count (F2)?
2. Should damage, not only ejection, decide a skirmish? Which TTK targets for the R1 ladder (F8)?
3. Elite HP: ×3 total or ×4.5 (F9)?
4. Titan: new keyword "cannot be moved by others", or drop Inamovible (F3)?
5. Roc inébranlable: may the resist bonus exceed Weight 5 (F7)?
6. Which cell's Pente counts in a push (F5)?
7. Does the Guard cap a Movement's Choc (F10)?
8. Resources in centi-units: accepted (F12)?
9. Kill XP formula `(200 + 13 L) / 20` per half-threat and the 8 fights per hour assumption (F21)?
10. XP for monsters 1 to 5 levels below: −10 % per level (F21)?
11. Rested XP rate: 5 % of a level per real hour (F21)?
12. Arena template gear level: +80 % (F30)?
13. BR: passive tree on or off (F30)?
14. Item "+1 rank": R1 → R2 only (F20)?
15. Fragments from geared or naked hero stats (F27)?
16. A run made of balls of several enemy entities: one run (F6)?
17. Secondary path at level 20 or 21 (F19)?

---

## 20. Tasks (one PR each)

Phases from §25. Every code task: strict TDD (failing test first), 100 % line and region coverage,
`Closes #<task>`, draft PR. Docs tasks feed the R0 docs PRs of §0 (the lead may merge them into those
four PRs).

**T1. Spec: `rpg/stats.md` and the weighted push examples of `rules.md` §10.5** (R0)
- Outcome: the stat model, damage, statuses, timers and weighted push rules of this file are written
  as the reviewed `rpg/stats.md`, with W1 to W14 as `rules.md` examples.
- Done: [ ] sections 2 to 10 moved, FINAL/TUNE/PROPOSAL tags kept; [ ] W1 to W14 with coordinates;
  [ ] F1 to F35 answered or listed as OPEN; [ ] part of docs PR 1.

**T2. Spec: `rpg/progression.md` and the budget part of `rpg/talents.md`** (R0)
- Outcome: XP curve, kill XP, level bands, rested, passive and active budgets and gates are written as
  reviewed specs.
- Done: [ ] sections 11 to 15; [ ] the checked arithmetic; [ ] part of docs PR 2.

**T3. Weighted push verdict in `abalone-core`** (R1)
- Outcome: `push_verdict` decides any push under Classic or Weighted rules, and Weighted with Weight 1
  provably equals Classic.
- Done: [ ] `weight.rs` with the 8 ordered checks; [ ] W1 to W14 unit tests; [ ] exhaustive small
  property; [ ] 100 % coverage; [ ] no change to `apply` behaviour.

**T4. `apply_with` and `legal_moves_with` (with `engine-core`)** (R1)
- Outcome: the move generator takes a push oracle, the classic one reproduces today's moves.
- Done: [ ] `apply` = `apply_with(ClassicOracle)`; [ ] perft depth 3 equal from 2 layouts; [ ] 200
  seeded playouts equal; [ ] existing tests green unchanged.

**T5. Stat block and level growth** (R1)
- Outcome: `hero_base`, `class_block`, `fragment_block` and `sheet` produce the section 3.5 table from
  `data/systems/stats.ron`.
- Done: [ ] `num.rs`, `stats.rs`; [ ] 8 classes in data; [ ] table and monotonic property tests;
  [ ] data integrity test.

**T6. Damage formula, Choc, position modifiers and Guard** (R1)
- Outcome: `compute_hit` and `shock_hits` give the section 6 examples, with the bucket clamp and the
  35 % Guard per action.
- Done: [ ] stages S1 to S11 (S7 as a no-op hook); [ ] every section 6 Given/When/Then; [ ] purity
  property; [ ] `combat.ron` constants.

**T7. Cooldowns and resource pools** (R1)
- Outcome: cooldowns block exactly N own turns and resources gain in centi-units with the VIT bucket.
- Done: [ ] `cooldown.rs` (N + 1 model, Hâte, verbs); [ ] `resource.rs`; [ ] section 8.3 and 10 tests.

**T8. Effective Weight from terrain and statuses** (R1 for Boue and sheet Weight, R2 for statuses)
- Outcome: each ball's push Weight is computed in one place and feeds the RPG oracle.
- Done: [ ] `weight_eff.rs` (clamp, override); [ ] Pente and Bélier as group bonus, Roc inébranlable
  as resist bonus; [ ] unit tests of section 5.7.

**T9. Status engine** (R2)
- Outcome: statuses apply, stack, expire on the right clock and respect diminishing returns, Ténacité,
  Lassitude and the 3-target cap.
- Done: [ ] `status.rs` and `statuses.ron`; [ ] all section 8 and 9 tests; [ ] sorted set hash property.

**T10. Heal pipeline, shields, DoTs, lifesteal** (R2)
- Outcome: heals, shields, mana shield, DoT ticks and lifesteal follow sections 6.7, 6.8 and 7.
- Done: [ ] `heal.rs`; [ ] Usure and Poison tests; [ ] shield order; [ ] DoT snapshot tests.

**T11. Combat modifiers from terrain, biome and statuses** (R2)
- Outcome: `modifiers.rs` turns the 6 R2 cell types, statuses and biome rules into bucket entries.
- Done: [ ] Fourré, Hauteur, Lave, Ronces, Corruption, Eau entries; [ ] Gelé, Sentinelle, Vitrification
  stat entries; [ ] one test per entry.

**T12. XP curve and level-up** (R3)
- Outcome: heroes gain XP from kills with gap factors, level up to 100 and receive their points.
- Done: [ ] `xp.rs`, `progression.ron`; [ ] section 13 tests; [ ] unlock table as data.

**T13. Passive tree validation** (R3)
- Outcome: any passive allocation is accepted or refused with the first broken rule, and respec cost
  is computed.
- Done: [ ] `passive.rs`, `passive.ron` with 2 paths for R3; [ ] section 11 tests; [ ] exhaustive
  spendable check.

**T14. Active tree validation and equip rules** (R3)
- Outcome: any active allocation and loadout is accepted or refused per section 12.
- Done: [ ] `active.rs`, `active.ron`; [ ] Warrior example test; [ ] equip errors; [ ] rank affix rule.

**T15. Scripted level 1 to 30 progression test** (R3, exit criterion of §25)
- Outcome: a scripted run of fights and quest grants takes a Guerrier from level 1 to 30 with valid
  trees at every level-up.
- Done: [ ] integration test in `abalone-world`; [ ] validates both trees after each level; [ ] ends at
  level 30 with 6 active and 29 passive points.

**T16. World formulas: travel speed, regen, rested pool** (R4)
- Outcome: step time, out-of-combat regen and rested accrual follow sections 13.5 and 15.
- Done: [ ] functions and tests; [ ] used by `world-generator`'s travel.

**T17. Gear in the stat sheet** (R5)
- Outcome: items add flat stats, the Lest Weight cap and the VIT trade, Hâte, Ténacité, lifesteal and
  penetration.
- Done: [ ] sheet steps 2 and 4; [ ] gear budget test with `items-loot`; [ ] section 3 Lest tests.

**T18. Full progression data and pacing sim** (R9)
- Outcome: 5 paths with rank values and 8 class trees are in data, and the time-to-level sim lands
  within ±10 % of §11.
- Done: [ ] data integrity green; [ ] sim report attached to the PR; [ ] level 80 shard rank 6 test.

**T19. Night and weather modifiers** (R9, v2 content of §4.8)
- Outcome: night and weather add their bucket entries from the UTC clock state given by
  `world-generator`.
- Done: [ ] entries and tests; [ ] same UTC input gives the same modifiers.

**T20. Normalized PvP and BR templates** (R10)
- Outcome: arena and BR heroes are built from fixed templates, whatever the save holds.
- Done: [ ] `template.rs`; [ ] PvP control −1; [ ] tests of section 14.
