# Encounter and boss design: implementation spec (role `encounter-boss-designer`)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, pending). Source of truth:
the validated French gameplay spec (`docs/specs/rpg/plan.fr.md`, same text as the approved plan).
Section numbers like "§5.3" point to that gameplay spec. This file adds no rule of its own on top of
it: it says how to build the monster and boss parts, and lists what is missing or contradictory
(section 20). No code yet: TDD applies from R1 (CONTRIBUTING section 11).

Tags, as in `rules.md`: **FINAL** (decided), **TUNE** (starting value, set by the bot ladder and
playtests), **PROPOSAL** (proposed here, an owner confirms). Every number below carries one. A number
copied from the gameplay spec keeps its tag there: the gameplay spec says "everything is PROPOSAL and
every number is TUNE unless stated", so most copied numbers are TUNE.

---

## 0. Scope

In scope (this role owns the data, the rules and the tests):

- Monsters: archetypes, rarities, stat builder, monster abilities, biome families (§5.2, §5.3).
- Encounter composition: threat budgets, pack generator, pack leader, pack rout and flight (§5.3,
  §6.7, §6.8, §4.3, §4.4).
- Elite affixes (§5.3), dungeon difficulties and Mythic affixes (§17).
- Monster AI decision layer: priority lists, target choice, intention (§5.3, pillar 2 of §1). The
  search itself (alpha-beta on the combat state) belongs to `ai-engineer`.
- Boss framework: Heart ball, Résilient and Inéjectable hearts, phases on HP, reinforcements, enrage,
  native Abalone mechanics (§18, §6.6, §6.7).
- The 5 converted bosses, the 3 new dungeon bosses, world bosses, rare named monsters, raids (§17,
  §18, §22, §23).
- Boss release gate, RPG boss fixtures, boss telemetry and retry (§18, §6.12).

Out of scope (see "Dependencies" in each section): the combat engine (push, damage, statuses,
terrain, turn structure), classes and their abilities, stats and XP curves, world map and dungeon
maps, loot tables, quests, client rendering, P2P sync, PvP and battle royale.

Role slugs used for dependencies (assumed names, the lead maps them to the real roles):

| Slug | Owns |
|---|---|
| `combat-engine` | `abalone-rpg` core: `CombatState`, `apply_action`, weighted push, damage formula, statuses, terrain layer, the 12 primitives, ejection limits, victory |
| `class-designer` | Classes, class abilities, Fragments, traits |
| `stats-progression` | Hero base stats, `g(L)`, XP curve, level bands, talents |
| `world-generator` | World map, tiles, tile level, biome terrain tables, multi-tile stitching, dungeon maps, patrols |
| `ai-engineer` | Search on the combat state, node budgets in WASM, the RPG player bot, the RPG bot ladder |
| `loot-economy` | Loot tables, iLvl, rewards, currencies |
| `quest-designer` | Quest objectives that point at monsters and bosses |
| `client-ui` | Rendering, HUD, intention glyphs, boss HP bar, Playwright e2e of the client |
| `netcode` | Group P2P lockstep, commit-reveal seeds |
| `pvp-br-designer` | Arenas, battle royale |
| `tech-lead` | Crates, data format (RON or JSON), determinism rules, WASM bridge, MCP |

---

## 1. Inputs read

- Gameplay spec, every section; in detail §1, §4.3 to §4.8, §5, §6 (all), §7.2, §8.6, §8.7, §11,
  §16, §17, §18, §22, §23, §24, §25, §26.
- `docs/specs/game-design.md` §3.3 (boss structure), §5 (anti-stalling), §7 (boss roster), §8
  (calibration).
- `docs/specs/rules.md` §10.3 (PvE hooks, OPEN-13), §11.
- `docs/specs/boss-balance.md` (ladder method, the "winnable" definition, section 5 unreachable
  phases, Chaplain #207 flip cost, fixtures).
- `docs/specs/world.md` §3 (boss lore slots), §5 and §8 (glyph plus colour, never colour alone).
- `docs/specs/tech.md` §7 (bosses are node-limited, seeded), `docs/specs/mcp.md` §4.3 (generic boss
  object: `tell`, `marks`).
- Code: `crates/abalone-core/src/encounter.rs` (`BossDef`, `Encounter`, tell one ply ahead, hook
  credit rule), `encounter/{echo,hull,choir,chaplain,ballast}.rs`, `ladder.rs`, `fixture.rs`,
  `telemetry.rs`, `search.rs` (`search_hooked`, `Step`), `board.rs` (`void`, `cracks`, `converted`,
  `MAX_RADIUS = 5`).

What the code tells this spec:

1. The classic encounter API is built on `Board` cells `Black`/`White` and plies. The RPG has
   entities, HP, terrain and turns made of three slots. The classic bosses must stay playable at the
   Mess tables (§21), so **this spec never changes `encounter/*.rs` behaviour**. The RPG bosses are
   new data plus mechanics in `abalone-rpg`, and the geometry they share with the classic hooks (rim
   cells, flip set, point reflection, splitmix64 `mix`) is proven equal by tests (section 10.9).
2. Boss randomness is already a pure function of `(seed, ply)` (`seed ^ ply * 0x9E37...`). The RPG
   keeps that shape with the entity turn index instead of the ply.
3. Telemetry already has `DeathCause` and a JSON line per attempt. The RPG adds causes, it does not
   fork the format (section 18).

---

## 2. Conventions used by every section

- **Integers only** (§24.1, FINAL). Percentages are basis points (bp, 10 000 = 100 %). Threat is
  stored in **half-points** (Sbire 0.5 becomes 1). Multiply in the order written, floor after each
  multiplication.
- **Seeds**: every random pick in this domain is `mix(hash(parts...))` with the splitmix64 `mix` of
  `encounter/hull.rs` (moved to a shared `rng` module, see `tech-lead`). Never `HashMap` iteration,
  never a clock inside a fight.
- **Data**: all content is data (§1 pillar 6) under `data/` (§24.3), loaded with `include_str!`.
  Examples below are RON; if `tech-lead` picks JSON the fields stay the same.
- **Files** (all new, none in `abalone-core` except the shared `rng` move):

| File | Content |
|---|---|
| `crates/abalone-rpg/src/monster/mod.rs` | `MonsterDef`, `Archetype`, `Rarity`, `monster_stats()` |
| `crates/abalone-rpg/src/monster/affix.rs` | Elite affixes, exclusions, application |
| `crates/abalone-rpg/src/monster/pack.rs` | Threat budget, composition enumeration, `build_pack()` |
| `crates/abalone-rpg/src/monster/ai.rs` | Priority lists, target heuristics, `Intent` commit and resolve |
| `crates/abalone-rpg/src/boss/mod.rs` | `BossDef` (data), `BossState`, heart rules, phases, enrage |
| `crates/abalone-rpg/src/boss/mechanic/*.rs` | One pure mechanic per file: `rim_crack`, `convert`, `mirror`, `armies`, `tile_collapse`, `summon`, `bomb_ball`, `totem`, `linked`, `hold_cells`, `front_shield`, `channel` |
| `crates/abalone-rpg/src/boss/telemetry.rs` | RPG attempt record on top of `encounter/telemetry.rs` |
| `crates/abalone-world/src/spawn.rs` | World boss schedule, rare named respawn, timed elites |
| `crates/abalone-world/src/difficulty.rs` | Heroic, Mythic keys, weekly affixes, world tiers, Rifts |
| `data/monsters/{archetypes,rarities,affixes,families,abilities}.ron` | Monster content |
| `data/encounters/formats.ron` | Threat budgets, ball bounds, node budgets per format |
| `data/bosses/<id>.ron` | One file per boss |
| `data/mythic/affixes.ron`, `data/world_bosses.ron` | Endgame content |
| `crates/abalone-rpg/tests/boss_fixtures.rs`, `tests/fixtures/rpg/<boss>.txt` | Recorded RPG wins |

---

## 3. Monster model (§5.3, §7.2, §6.6)

### 3.1 Data and stat builder

**Implementation.**

```rust
pub struct Archetype { id: ArchId, hp_bp: u32, atk_bp: u32, pow_bp: u32, arm_bp: u32,
                       res_bp: u32, vit_add: i32, weight: u8, abilities: Vec<AbilityId> }
pub enum Rarity { Minion, Normal, Champion, Elite, RareNamed, Heart }
pub struct MonsterDef { family: FamilyId, archetype: ArchId, rarity: Rarity, level: u8,
                        affixes: Vec<AffixId>, leader: bool }
pub fn monster_stats(def: &MonsterDef, base: &HeroBase /* from stats-progression */) -> Stats
```

Order (fixed): `stat = floor(floor(base(L) × arch_bp / 10 000) × rarity_bp / 10 000)`, then affix
modifiers, then world modifiers (section 16). Rules:

- The rarity factor applies to HP, ATQ, PUI, ARM, RES. Never to VIT nor to Weight (PROPOSAL; §5.3
  does not say).
- Elite HP: §5.3 says "PV ×3" and "×1.5". This spec reads it as **HP ×3 total, other stats ×1.5**
  (PROPOSAL, see feedback F3).
- Weight: archetype weight (1 unless listed), +1 for an elite pack leader (§6.6, TUNE), +1 for the
  Massif affix (§5.3, TUNE), clamped to 1..5 (§6.4, FINAL proposed).
- VIT: `base_vit(L) + vit_add` (Rôdeur +5, §5.3 TUNE).

Archetype multipliers (copied from §5.3, all TUNE; missing ones are 10 000 bp):

| Archetype | HP | ATQ | PUI | ARM | RES | VIT | Weight |
|---|---|---|---|---|---|---|---|
| Brute | 13 000 | 11 000 | — | — | — | — | 2 |
| Rôdeur (Prowler) | 8 000 | 13 000 | — | — | — | +5 | 1 |
| Lanceur (Caster) | 7 000 | — | 13 000 | — | — | — | 1 |
| Chaman (Shaman) | — | — | 11 000 | — | 13 000 | — | 1 |
| Bâtisseur (Builder) | — | — | — | 13 000 | — | — | 1 |
| Explosif (Bloater) | 6 000 | — | — | — | — | — | 1 |
| Porteur (Bearer) | — | — | — | 16 000 | — | — | 2 |
| Invocateur (Summoner) | 8 000 | — | 12 000 | — | — | — | 1 |

Rarity factors (§5.3, TUNE): Sbire 5 000, Normal 7 000, Champion 10 000, Elite 15 000 (HP 30 000).
Rare named: 15 000, HP 40 000, 3 fixed affixes (PROPOSAL, §5.3 leaves it blank). Heart: per boss
(section 10).

**Dependencies.** `stats-progression` (`HeroBase` at level L, `g(L)` in bp, VIT unit),
`combat-engine` (`Stats`, `Unit`).

**Tests (unit, TDD).**

- Given a level 1 Brute Normal, When `monster_stats` runs, Then HP 109 (`120 × 1.3 = 156`,
  `156 × 0.7 = 109.2`), ATQ 9 (`13`, then `9.1`), ARM 14, Weight 2.
- Given a level 1 Rôdeur Normal, Then HP 67, ATQ 10, VIT `base_vit(1) + 5`.
- Given a level 1 Brute Elite pack leader with Massif, Then HP 468, ATQ 19, Weight 4.
- Given Weight 5 and Massif, Then Weight stays 5 (clamp).
- Property: for every archetype and rarity, stats at level L+1 are at least stats at level L.
- Property: same `MonsterDef`, same stats (pure).

**Risks.** Normal monsters at ×0.7 are stronger than Fragments (×0.4 HP, ×0.5 ATQ, §6.9): a skirmish
pack has more raw HP than the squad. Fine if abilities carry the player, to check on the R1 ladder.

### 3.2 Archetype abilities (1 or 2 each, §5.3)

All written with the §6.10 primitives, as data in `data/monsters/abilities.ron`. **Major** abilities
show an intention (section 8). Every number TUNE, every ability PROPOSAL.

| Archetype | Ability | Type, cost, CD, range | Effect | Major | Counter |
|---|---|---|---|---|---|
| Brute | Coup de masse | Action, CD 2, adjacent | 110 % ATQ physical | yes | Step away, Formation |
| Rôdeur | Curée | Action, CD 1, adjacent | 100 % ATQ, +50 % on an Isolated ball | yes | Keep balls in Formation |
| Rôdeur | Bond | Quick, CD 3, range 3 | Self move to an empty cell adjacent to an Isolated enemy (not a bonus Step, never pushes, never leaves the board) | no | No Isolated ball |
| Lanceur | Trait | Action, CD 0, in line, range 4 | 80 % PUI magic | no | Break the line with a Roc or a ball |
| Lanceur | Salve | Action, CD 3, zone r1, range 4 | 60 % PUI magic on the zone, cell-targeted | yes | Leave the zone |
| Chaman | Suture | Action, CD 2, range 3 | Heal 60 % PUI on the ally with the lowest HP % | yes | Kill the Chaman first, Poison |
| Chaman | Égide | Quick, CD 3, range 3 | Shield 50 % PUI for 2 turns | no | Magic burst after it expires |
| Bâtisseur | Muraille | Action, CD 3, range 3 | 1 empty cell becomes a Roc for 3 turns, at most 3 alive per Builder | yes | Stand on the marked cell |
| Explosif | Éclatement | Passive, on death | Neighbours take 15 % of their max HP (physical) and are pushed 1 cell away, never ejected | no (passive, glyph always shown) | Kill it away from your balls, or eject it |
| Porteur | Bouclier frontal | Passive | −50 % damage from abilities whose origin is in its 3 front directions (front = direction of its last Movement, at start: toward the player camp) | no (passive, facing glyph) | Hit it from behind |
| Porteur | Garde | Quick, CD 3 | Ancré until its next turn | no | Wait one turn |
| Invocateur | Appel | Action, CD 4 | Summons 1 Sbire of its family on a free adjacent cell, at most 2 summons alive | yes | Kill it, block its free cells |

Summoned balls give no XP and are not Pertes when they die (like Revenants, §6.6). PROPOSAL, against
farming and endless fights.

**Dependencies.** `combat-engine` (primitives, Isolation, Ancré, Roc terrain, facing for the front
shield), `class-designer` (counters must exist in class kits).

**Tests.** One unit test per row (position plus actions), for example: Given a Porteur that last
moved E and a Mage west of it, When Trait de feu hits it from the west (behind), Then full damage;
from the east, Then half. Integrity test: every monster ability has a written counter (§24.3).

### 3.3 Monster level and level colour (§4.4, §6.2, §11)

**Implementation.**

- Solo: `monster.level = tile.level` (tile level comes from `world-generator`).
- Group: `pack.level = max(zone.min_level, player.level)` for the pack of that player (§6.2, TUNE).
- Colour band from `delta = monster.level − hero.level` (§4.4; bands between the ends are PROPOSAL):

| Band | Delta | Glyph | Tag |
|---|---|---|---|
| Grey | ≤ −6 | hollow circle | TUNE (§4.4) |
| Green | −5 to −3 | one dot | PROPOSAL |
| Yellow | −2 to +2 | two dots | PROPOSAL |
| Orange | +3 to +4 | three dots | PROPOSAL |
| Red | ≥ +5 | skull | TUNE (§4.4) |

**Dependencies.** `stats-progression` (XP by band, §11), `world-generator` (tile level),
`client-ui` (glyphs).

**Tests.** Table test of `level_band(delta)` for −10, −6, −5, −3, −2, 0, 2, 3, 4, 5, 10.

**Risk.** In group, `max(zone_min, player_level)` makes packs follow the player, so a group never
meets grey monsters and zone ranges stop meaning anything (feedback F6).

---

## 4. Biome families (§5.2)

**Implementation.** `data/monsters/families.ron`: one family per name of §5.2 (20 families, 2 per
biome), each with `biome`, `archetypes` (weighted roster), `leader_archetype`, `element` tag, glyph.
Proposed mapping (PROPOSAL, weights TUNE):

| Biome | Family | Roster (weight) | Leader |
|---|---|---|---|
| 1 Lumen | Coquilles errantes | Brute 3, Porteur 1 | Brute |
| 1 Lumen | Rôdeurs | Rôdeur 3, Lanceur 1 | Rôdeur |
| 2 Sylve | Mantes | Rôdeur 3, Brute 1 | Rôdeur |
| 2 Sylve | Tisseuses | Bâtisseur 2, Invocateur 1, Lanceur 1 | Invocateur |
| 3 Tourbières | Gonfleurs | Explosif 3, Brute 1 | Brute |
| 3 Tourbières | Noyés | Chaman 1, Brute 2, Lanceur 1 | Chaman |
| 4 Dunes | Scarabées-fouisseurs | Porteur 2, Bâtisseur 2 | Porteur |
| 4 Dunes | Mirages | Lanceur 2, Rôdeur 2 | Lanceur |
| 5 Crêtes | Golems | Brute 2, Porteur 2 | Porteur |
| 5 Crêtes | Harpies | Rôdeur 2, Lanceur 2 | Rôdeur |
| 6 Toundra | Ours-coques | Brute 3, Porteur 1 | Brute |
| 6 Toundra | Spectres de givre | Lanceur 2, Chaman 1, Invocateur 1 | Chaman |
| 7 Littoral | Crabes-lest | Porteur 3, Brute 1 | Porteur |
| 7 Littoral | Sirènes | Chaman 2, Lanceur 2 | Chaman |
| 8 Caldeira | Salamandres | Lanceur 2, Explosif 2 | Lanceur |
| 8 Caldeira | Forgés | Brute 2, Bâtisseur 2 | Bâtisseur |
| 9 Terres Vitrifiées | Vitrifiés | Porteur 1, Brute 1, Chaman 1, Bâtisseur 1 | Chaman |
| 9 Terres Vitrifiées | Échos | Rôdeur 2, Invocateur 2 | Invocateur |
| 10 Puits | Abominations | Brute 2, Explosif 1, Porteur 1 | Brute |
| 10 Puits | Chœurs perdus | Lanceur 1, Chaman 1, Invocateur 2 | Invocateur |

Biome global rules (§5.2) are applied by `combat-engine`; a family only gives flavour, element tag
and roster.

**Dependencies.** `world-generator` (which family patrols which tile), `client-ui` and art (models,
glyphs).

**Tests.** Integrity: every biome 1 to 10 has exactly 2 families (TUNE), every roster archetype
exists, every family has a leader archetype present in its roster.

**Risks.** 20 families is a lot of art. R4 needs only the 3 v1 biomes (6 families).

---

## 5. Encounter composition: threat budgets (§5.3, §6.8, §4.3)

### 5.1 Budget and bounds

| Format | Budget (half-points) | Enemy balls | Leader | Board | Tag |
|---|---|---|---|---|---|
| Escarmouche (skirmish) | 12 (= threat 6, §5.3) | 4 to 7 (§6.8) | the highest rarity | radius 3 | budget and bounds TUNE (§6.8) |
| Élite | 24 (= 12) | 5 to 9 | the Elite, or a Champion of a Champion pack | radius 4 | budget TUNE (§5.3), bounds PROPOSAL |
| Salle de donjon | 28 (= 14) | 6 to 10 | the highest rarity | radius 4 | budget TUNE (§5.3), bounds PROPOSAL |
| Boss | none: the boss file lists every ball | per boss | the Heart | per boss | PROPOSAL |

Threat per ball (§5.3, TUNE): Sbire 1, Normal 2, Champion 4, Elite 8 (half-points). Rarity allowed
per format (PROPOSAL): skirmish = Sbire, Normal, at most 1 Champion; Élite = exactly 1 Elite, or a
Champion pack of 3 or 4 Champions sharing one affix (Diablo blue pack); room = any, at most 1 Elite.

Density cap: player balls plus enemy balls at most 50 % of board cells (PROPOSAL, TUNE). Classic
Abalone is 28 of 61, 46 %.

### 5.2 Generator

**Implementation.** Simple and exhaustive, so it is easy to test:

1. `compositions(format)`: enumerate every multiset of rarities whose threat equals the budget
   exactly and whose ball count is inside the bounds, sorted in a fixed order (Elite count desc,
   Champion desc, Normal desc). The list is small (skirmish: 6 entries) and computed once.
2. `pick = compositions[mix(hash(tile_seed, "pack")) % len]`.
3. For each slot in order, pick an archetype from the family roster with `mix` (weighted), the leader
   slot uses `leader_archetype`.
4. Affixes for Champion and Elite (section 7), with `mix`.
5. Output `PackSpec { family, level, members: Vec<MonsterDef>, leader: usize, aggro: u8 }`, sorted by
   member id. Placement cells are chosen by `world-generator`/`combat-engine` on the enemy half.

The pack comes from the **tile seed**, not the combat seed, so the pack seen on the map is the pack
fought (§4.5 "same tile, same board"). The combat seed (commit-reveal in group) only breaks AI ties.

**Dependencies.** `world-generator` (tile seed, family, placement half), `combat-engine` (`Unit`
spawn), `netcode` (combat seed in group).

**Tests.**

- Given format skirmish, When `compositions` runs, Then it returns exactly
  `[1C+4N, 1C+3N+2S, 1C+2N+4S? no: 7 balls max]`: the test pins the full list, computed by hand:
  `{1C,4N}`, `{1C,3N,2S}`, `{1C,2N,4S}`, `{6N}`, `{5N,2S}` (5 entries; `{4N,4S}` has 8 balls and is
  refused).
- Property: every composition of every format has threat = budget and balls inside the bounds.
- Given the same tile seed twice, Then the same `PackSpec`. Given 1000 seeds, Then every
  composition appears at least once (no dead entry).
- Given a level 3 Lumen skirmish, Then every member has level 3 and the family's archetypes.

**Risks.** Exact-budget enumeration may yield few compositions; variety comes from archetypes and
affixes. If a format has no composition (bad data), the integrity test fails at build time.

---

## 6. Packs in combat: engagement, leader, rout, flight, defeat (§4.4, §6.7, §6.12)

**Implementation.**

- **Aggro radius** stored on `PackSpec.aggro`: 1 tile, 2 for an elite or champion pack (§4.4,
  TUNE). The patrol over 3 tiles (§4.4, TUNE) is run by `world-generator`.
- **Ambush**: when the pack engages, the pack entity takes the first turn (§4.4, TUNE rule
  PROPOSAL). Its first intention is computed at fight start (section 8), so the first threat is
  still announced.
- **No reinforcement** joins a fight (§4.4). Summons (Invocateur, boss reinforcements) are not
  reinforcements: they are intentions announced one turn ahead (PROPOSAL, feedback F17).
- **Leader**: exactly one per pack, glyph crown. When the leader dies (0 HP or ejected), the other
  pack balls flee: they leave the board at the end of the current elementary effect, they are not
  Pertes, they do not enter the Cimetière (§6.7, rule TUNE). The fight is won if no other enemy
  entity stays.
- **Pack rout threshold**: `ceil(balls × 5 000 / 10 000)` Pertes (PROPOSAL, TUNE: §6.8 gives the
  player threshold only, feedback F9). In group, 40 % rounded up (§6.8, TUNE).
- **Rewards of a fled ball**: half the XP, no loot roll (PROPOSAL; `loot-economy`,
  `stats-progression` decide).
- **Defeat in the world** (§6.12): the pack is restored to full HP and to its `PackSpec` (it is
  regenerated from the tile seed, so nothing to store but the "alive" flag).

**Dependencies.** `combat-engine` (rout, leaving the board, Cimetière), `world-generator`
(patrols, aggro trigger), `loot-economy`, `stats-progression`.

**Tests.**

- Given a pack of 5 with its leader at 1 HP, When the hero kills the leader, Then the 4 others leave,
  the player Pertes are unchanged, the Cimetière has 1 entry (the leader), and the fight is won.
- Given a pack of 6 (threshold 3), When the third pack ball is lost, Then the pack is routed.
- Given an ambush, Then the first `Effects` of the fight belong to the pack entity, and the pack
  intention is visible before it.
- Given a defeat, When the player walks back on the tile, Then the pack has full HP and the same
  members.

---

## 7. Elite and Champion affixes (§5.3)

**Implementation.** `data/monsters/affixes.ron`, one entry per affix, built from primitives. Champion:
1 affix; Elite: 2 or 3 (§5.3, TUNE), drawn with `mix` from the allowed list, without exclusions.
Glyph on the ball and a line in the inspect panel (world.md §8: never colour alone).

| Affix | Exact rule | Numbers | Tag |
|---|---|---|---|
| Blindé (Armored) | ARM +50 % | 5 000 bp | TUNE (§5.3) |
| Massif | Weight +1 (clamp 5) | 1 | TUNE (§5.3) |
| Givrant (Frosted) | The cell it leaves by its own Movement becomes Ice for 2 of its turns; at most 4 such cells alive (oldest goes first) | 2, 4 | TUNE |
| Brûlant (Burning) | Same with Lava | 2, 4 | TUNE |
| Vampirique | Heals 25 % of damage it deals | 2 500 bp | TUNE |
| Écho | Its pack's Movement is the point reflection, through the board centre, of the last Movement of the entity it fights, when legal; else the AI move. At most 1 Écho ball per fight | 1 | PROPOSAL |
| Pilier (Pillar) | Inamovible, never moves, never part of a Movement; killed by damage only | — | rule from §5.3 |
| Grappin | Ability, Action, CD 3, in line, range 4, major: pulls the first enemy ball 1 cell toward it, never ejects | 3, 4, 1 | TUNE |
| Bouclier (Shielded) | At the start of its turn, every 3 of its turns, shield of 20 % of its max HP | 3, 2 000 bp | TUNE |
| Invocateur | Gains Appel (section 3.2) if it does not have it | — | PROPOSAL |
| Explosif | Gains Éclatement (section 3.2) | — | PROPOSAL |
| Téléporteur | Quick, CD 3: moves itself to an empty cell within range 3 (no push, never leaves the board) | 3, 3 | TUNE |

Exclusions (PROPOSAL): Pilier excludes Écho, Téléporteur, Massif, Givrant, Brûlant; Givrant excludes
Brûlant.

**Dependencies.** `combat-engine` (Ice, Lava, shield, lifesteal, Inamovible), `client-ui` (affix
glyphs), `class-designer` (Écho must not break class mechanics like Retour).

**Tests.** One per affix (position plus actions). Exclusion property: over 10 000 seeds no elite
has an excluded pair. Givrant: Given an elite that moves from (0,0) to (1,0), Then (0,0) is Ice for
2 of its turns, then Normal. Écho: Given the player played `(−1,0) E`, Then the elite's pack plays
`(1,0) W` when legal.

**Risks.** Écho in a multi-entity fight (whose Movement?): "the entity it fights" means the player
entity whose turn came just before; in group this is ambiguous, hence at most 1 per fight.

---

## 8. Monster AI and intention (§5.3, §1 pillar 2, §24.2)

### 8.1 Turn order of a monster entity (§5.3, FINAL order from the gameplay spec)

1. **Action**: resolve the committed intention if there is one (8.3), else the first rule of the
   priority list that has a legal target.
2. **Movement**: alpha-beta on the combat state, node budget (never time) from
   `data/encounters/formats.ron`: skirmish 300, elite 600, room 600 nodes (TUNE). Search: owned by
   `ai-engineer`.
3. **Quick action**: first Quick rule of the priority list with a legal target.
4. **Commit the next intention** (8.2), at the end of the turn.

### 8.2 Priority lists and targets

```ron
priorities: [
  (ability: "suture", when: AllyHpBelow(5000), target: LowestHpAlly),
  (ability: "curee",  when: Always,            target: Isolated),
  (ability: "coup_de_masse", when: Always,     target: Hero),
]
```

`when` conditions (closed enum, data): `Always`, `AllyHpBelow(bp)`, `EnemyInRange`, `SelfHpBelow(bp)`,
`TurnModulo(n, k)`, `PhaseAtLeast(p)` (bosses). Target selectors: `Hero`, `Isolated`, `LowestHp`,
`LowestHpAlly`, `NearestEdge`, `Densest3` (zone centre covering most enemies). For each rule the AI
scores **the 3 best candidates** of the selector (§5.3) by expected damage after reductions and picks
the best; ties by unit id. No search inside the Action choice (cheap, KISS).

### 8.3 Intention (Slay the Spire style)

```rust
pub struct Intent { unit: UnitId, ability: AbilityId, target: IntentTarget, fires_in: u8 }
pub enum IntentTarget { Unit(UnitId), Cell(Hex), Cells(Vec<Hex>) }
```

- Every **major** ability is cast only through an intention committed at the end of the monster's
  previous turn (or at fight start), so it is visible for at least one full opposing turn (pillar 2,
  FINAL). `fires_in` is 1 for normal abilities, 2 for any boss ability that can remove more than one
  ball (§1 pillar 2, §6.10 rule 2, FINAL from the gameplay spec).
- **Cell-targeted** intentions stay on their cells: leaving the cells dodges them (counter).
- **Unit-targeted** intentions follow the unit. At resolution, if the target is dead, untargetable
  (Stase, Fumigène, Insaisissable dodge) or out of range from the caster's current cell, the
  intention **fizzles** and the monster may only use a non-major ability this turn (PROPOSAL). A
  Provocation in range redirects it to the taunting ball (§6.11).
- A hard control on the caster (Étourdi, Gelé, Stase) cancels its intention; a new one is committed
  at the end of that turn.
- Integrity rule: every ability with damage above 120 % of a stat, a hard control, a forced
  displacement, a terrain change, a summon or the Éjecteur keyword is `major: true` (PROPOSAL, TUNE
  for 120 %).
- Monster abilities with Éjecteur must have `fires_in >= 1` (§6.10 rule 3: "Éjecteur abilities are
  ultimates or have a tell"; monsters have no ultimates).

**Dependencies.** `ai-engineer` (search on `CombatState`, budgets measured in WASM, the eval),
`combat-engine` (ability resolution, Provocation, targetability, `Effects`), `client-ui` (intent
glyph over the caster plus a line to the target, a 1 or 2 counter), `tech-lead` (intent in the state
hash, §24.1: "the hash covers everything").

**Tests.**

- Given a Brute with Coup de masse ready next to the hero at the end of its turn, Then an `Intent`
  on the hero with `fires_in = 1` exists, and it is in the state hash (two states differing only by
  the intent hash differently).
- Given that intent, When the hero steps out of reach on its turn, Then at the Brute's turn the
  intent fizzles and no major ability is cast.
- Given a cell-targeted Salve, When the target ball stays, Then it is hit; When it leaves, Then not.
- Given a Gardien Provocation in range of the Brute, Then the intent resolves on the Gardien.
- Given the same state and seed, Then the same Action, Movement, Quick action and intent
  (determinism, run twice).
- E2E (Playwright, `client-ui` writes it with this role): on the R1 test fight, the intent glyph is
  visible over the Brute and names its target before the player's first click.

**Risks.** Alpha-beta on a multi-entity RPG state is far costlier per node than on a `Board`: the
budgets above may be too slow in WASM (`ai-engineer` measures). The search must see intentions and
terrain timers, or the AI walks into its own tells.

---

## 9. Group encounters (§6.2, §6.8, §17)

**Implementation.**

- One pack per player (§6.2), each built by section 5 with the player's level rule (3.3).
- **Squad-proportional budget** (PROPOSAL, fixes overcrowding, feedback F8):
  `budget_g = floor(solo_budget × squad_g / squad_solo)` half-points, ball bounds scaled the same way
  (floor, minimum 2). Example: elite, quatuor (hero + 4 = 5 balls, solo hero + 8 = 9) gives
  `24 × 5 / 9 = 13` half-points.
- Turn frieze J1, M1, J2, M2 (§6.2) is run by `combat-engine`; a pack AI treats every non-pack
  entity as the opponent (paranoid reduction, `ai-engineer`).
- **Bosses in group** (PROPOSAL, feedback F12): one boss entity with one Heart and **one shell squad
  per player**. Camps alternate J1, B, J2, B, ...; the boss turn after player i moves only squad i
  or the Heart; the Heart acts (Action, Quick action) only on the boss turn that follows J1, so the
  boss cooldowns, phase tells and enrage count **once per round**. Heart HP scales:
  `hp × (10 000 + 7 500 × (players − 1)) / 10 000` (TUNE).

**Dependencies.** `combat-engine` (frieze, entities), `netcode` (seeds, lockstep), `ai-engineer`.

**Tests.** Given a duo elite fight, Then 2 packs, each with budget `floor(24 × 7 / 9) = 18` and its own
leader. Density property: for every format and group size of §6.8, the generated balls stay under the
50 % cap, or the integrity test names the format (it fails today for a quatuor skirmish on radius 4,
see F8). Given a trio boss, Then the Heart acts once per round.

---

## 10. Boss framework (§18, §6.6, §6.7, §6.12, §4.6)

### 10.1 Data

```ron
Boss(
  id: "echo", name: "The Echo", level: 8, release: false,
  board: Tiles([(0,0)]),                // or Radius(4), or a pillar mask
  player_squad: 13,                     // hero + 13
  heart: (archetype: "heart_echo", hp_mult_bp: 100000, atk_bp: 12000, pow_bp: 12000,
          arm_bp: 13000, res_bp: 13000, weight: 3, keyword: Resilient),
  shells: (archetype: "shell", rarity: Normal, count: 13, cells: [...]),
  shell_link_bp: 800,                   // heart loses 8 % max HP per shell Perte
  phases: [(hp_bp: 7000), (hp_bp: 3500)],
  mechanics: [Mirror(delay_by_phase: [0, 1, 0], groups_by_phase: [1, 1, 2])],
  abilities: ["echo_count", "echo_ledger_strike"],
  priorities: [...],
  enrage_turn: 30,                      // breach starts at boss turn 30
  node_budget: 400,
)
```

`BossState` (in `CombatState`, hashed): `phase`, `pending_phase`, `turn`, mechanic states (crack
timers, converted marks, army cycle, collapse countdown), intentions.

### 10.2 The Heart (Boule-Cœur, §18)

- One Heart per boss. Stats: `base(L) × heart multipliers` (above, all TUNE). Weight 3 to 5 (§18,
  TUNE).
- Keyword **Inéjectable (intrinsic)**: a push or effect that would eject it is illegal; unlike the
  §6.11 status it never wears off and has no Lassitude (PROPOSAL, feedback F10).
- Keyword **Résilient**: when ejected, it loses 25 % of its max HP as Pure damage (§18, TUNE) and
  comes back on the centre cell of its home tile, or the nearest free cell (hex distance, then r,
  then q, §6.10 order). The ejection still uses the "1 ejection per action" budget. If the 25 % kills
  it, the boss dies (win).
- Heart hard control (PROPOSAL, feedback F19): Étourdi, Gelé and Stase put on the Heart by the player
  delay its pending intention by 1 turn instead of their normal effect; Provocation does not apply.
- **Victory**: the Heart reaches 0 HP. All shells then vanish (§6.7 leader rule). The boss entity has
  **no rout threshold** (PROPOSAL, feedback F7). **Defeat**: the hero dies (0 HP or ejected, FINAL),
  or the player entity is routed (6 Pertes, §6.8 TUNE), or a draw (draw = loss, FINAL existing).

### 10.3 Shell link (PROPOSAL)

Each shell Perte (death or ejection) deals `shell_link_bp` of the Heart max HP as Pure damage
(8 %, TUNE). This keeps Abalone at the core of a boss fight: ejecting shells is the main way to cut
the Heart down, and it makes the HP phases reachable (it fixes `boss-balance.md` §5: phases a win at
6 ejections never reached).

HP budget check (TUNE, to verify on the ladder), Echo at level 8: base HP 195, Heart ×10 = 1 950.
Expected player damage ~40 per turn over ~30 turns = ~1 200, plus 6 shell Pertes × 8 % = 936. Total
~2 100, just above 1 950: the fight lasts about 30 player turns, inside the 8 to 15 min of §6.8.

### 10.4 Phases on HP (§18)

- Phase `p` starts when Heart HP ≤ `phases[p−1].hp_bp` of max (70 % and 35 %, §18 example, TUNE).
- Optional structural trigger per mechanic (the Choir's wiped army): `phase = max(hp_phase,
  structural_phase)`. Phases never go back, even if the Heart is healed (PROPOSAL).
- **Phase tell**: a phase crossed during any turn becomes `pending_phase` and takes effect at the
  start of the boss's next turn, so it is announced one turn ahead (pillar 2). HUD: HP bar with notches
  at the thresholds, plus the pending phase glyph.

### 10.5 Enrage (§18, §6.7)

At boss turn `enrage_turn` (per boss, TUNE), the Brèche starts (2-turn tell, then the outer ring of
the union of tiles becomes Gouffre, then one ring every 5 boss turns down to radius 2, §6.7 TUNE). It
replaces the default turn 30 of §6.7 for this fight.

### 10.6 Native Abalone mechanics (§18), one pure module each

| Mechanic | Rule (PROPOSAL, numbers TUNE) | Tell |
|---|---|---|
| `channel` | A boss ability with `channel: n` resolves after n boss turns; pushing or moving the caster interrupts it (§6.10) | Channel bar on the caster |
| `marked_zone` | Cells marked now, effect at the boss's next turn | Cells glyph, 1 or 2 |
| `hold_cells` | k cells to occupy with player balls at the end of the boss turn, else every player ball takes X % max HP | Cells glyph, 2 turns |
| `bomb_ball` | A neutral ball (HP, Weight 1) with a countdown; it explodes if not ejected or killed in time | Countdown on the ball |
| `totem` | An Inamovible boss ball with HP; while alive it grants an effect | Link line to the Heart |
| `front_shield` | Same rule as the Porteur, on the Heart | Facing glyph |
| `linked` | 2 boss balls; if only one dies, the other returns to full HP at the end of the round | Chain glyph |
| `rim_crack` | Rim cells of the union crack, void after a lead (Hull) | Crack glyph and counter |
| `convert` | Fragment flips (Chaplain) | Flip preview on hover |
| `mirror` | Movement mirror (Echo) | Ghost of the mirror on hover |
| `armies` | Only the army in turn moves (Choir) | Pale ring on the next army |
| `tile_collapse` | A whole tile becomes Gouffre after a 2-turn tell (Hull P2, raids) | Tile-wide cracks and counter |
| `summon` | Reinforcements on given cells, announced as an intention | Cells glyph, 1 turn |

Each mechanic is a pure function `fn(&CombatState, &MechanicParams, seed) -> Vec<Effect>` called at
fixed points (start or end of a given entity turn), so the boss search sees it (`ai-engineer`, the
`search_hooked` pattern of `search.rs`).

### 10.7 Ejection limits for bosses (§6.10)

A boss ability or mechanic that can remove more than one ball needs a tell of 2 turns or more (rule
2 of §6.10, FINAL proposed). Integrity test on every boss file.

### 10.8 Retry and resume (§6.12)

`EncounterSpec { boss_id, level, seed, party }` rebuilds the fight; Retry rebuilds from it, never
regenerates the dungeon. Target under 5 s from click to an interactive board (FINAL, pillar 3).
Resume after reload (IndexedDB `combat` store) belongs to `combat-engine` and `client-ui`.

### 10.9 Equivalence with the classic hooks

The RPG `rim_crack`, `convert` and `mirror` reuse the geometry of `encounter/hull.rs`,
`chaplain.rs` and `echo.rs`. Property tests: on random classic positions (all Weights 1, no HP, no
terrain), the RPG function picks the same crack cells for the same seed, the same flip set, the same
mirrored move as the classic hook. The classic files are not edited, except the move of `mix` and
`NEIGHBOURS` to a shared module (`tech-lead`).

**Dependencies (whole section).** `combat-engine` (keywords, Pure damage, Gouffre, multi-tile
union, Brèche, victory), `world-generator` (tile stitching §4.6, dungeon maps), `ai-engineer`
(hook-aware search), `client-ui` (HP bar, notches, pending phase, mechanic glyphs), `tech-lead`
(hash, data format).

**Tests (examples).**

- Given an Echo Heart at 1 950 HP and a shell at 1 HP, When the shell dies, Then the Heart has
  `1 950 − 156 = 1 794` HP.
- Given a Résilient Heart on the rim with its centre cell occupied, When a legal push ejects it,
  Then it loses 487 HP and stands on the nearest free cell in the fixed order; the same action
  cannot eject another ball.
- Given an Inéjectable Heart on the rim, Then the push that would eject it is not in `legal_moves`.
- Given a Heart at 71 % taking 2 %, Then `pending_phase = 1` and `phase = 0` until the boss's next
  turn starts.
- Given a Heart healed from 69 % to 75 % in phase 1, Then the phase stays 1.
- Given `enrage_turn = 30`, Then the 2-turn Brèche tell appears at boss turn 30, not 28 nor 31.
- Integrity: every boss with a multi-removal ability has `fires_in >= 2`.

---

## 11. The five converted bosses (§17, §18)

Common rules: section 10. Keep the hook and the tell of each classic boss (§18), add HP, abilities
and HP phases. Every number TUNE, every new rule PROPOSAL. Levels and dungeons from §17 (TUNE).

### 11.1 The Echo: Les Cales du Ballast, level 8

- Board: radius 4, standard layout; hero + 13 against Heart + 13 shells (§6.8 boss row).
- Heart "Le Quartier-maître", Weight 3, **Résilient** (it teaches: ejecting the Heart is a big hit,
  and it comes back). HP ×10.
- Mechanic `mirror` (§18: the Echo copies only the **Movement**): the boss Movement is the point
  reflection through the board centre of the player's last Movement if it is legal under the weighted
  push; else the AI Movement. Its Action and Quick action are its own.
- Phases: P1 mirror the last Movement; P2 (70 %) mirror the previous one; P3 (35 %) try last then
  previous, AI on any illegal mirror (classic phases, now on HP).
- Abilities: "Recompte" (Action, CD 3, in line, range 4, major): 120 % ATQ on the first player ball
  of the line. "Écriture" (Quick, CD 4, P2+): 1 shell gains a Shield of 15 % of the Heart max HP.
- Enrage: boss turn 30. Node budget 400 (classic value, TUNE).
- Tell: the ghost of the mirrored Movement on hover (classic UX) plus intentions.

### 11.2 The Hull: La Mine de Verre-étoile, level 38, 3 tiles

- Board: **3 tiles in a triangle** `(0,0), (1,0), (0,1)` (PROPOSAL, not "in a line", feedback F4):
  pairwise adjacent, so after a tile collapses the two others still touch.
- Player starts on tile A, boss on tile B, tile C empty. Heart "Le Chef de charge", Weight 4,
  **Inéjectable**. Shells 13.
- `rim_crack` on the rim of the union: one cell every 4 boss turns, void 2 boss turns later (classic 8
  plies and 2 plies; the lead becomes 2 boss turns so 2-cell waves stay legal under §6.10 rule 2).
  P2: every 3 boss turns, 2 cells. P3: every 2, 2 cells.
- P2 (70 %): `tile_collapse` of tile A (the player start tile) after a 2-turn tell: all its cells
  become Gouffre; the balls on it are ejected (multi-removal allowed by the 2-turn tell, §6.10).
  Migration is by plain Movements across the seams (§18, §4.6).
- Abilities: "Coup de bélier" (Action, CD 3, adjacent, major): 140 % ATQ, the target recoils 1 cell,
  no ejection. "Rivets" (Action, CD 4, range 4, major): up to 3 empty cells in a line become Roc for
  2 turns.
- Enrage: none of its own (the rim is the enrage); the §6.7 Brèche at turn 30 still applies.
- Node budget 3 000 (classic, TUNE; risk: 183 cells).

### 11.3 The Choir: La Fournaise Chantante, level 50

- Board: radius 4 (PROPOSAL; classic radius 3 with 23 balls would be 62 % dense). Player hero + 9
  (classic 10 balls). Boss: 3 armies of 4 (Alto, Tenor, Bass) plus the Heart "Le Chantre"
  (Weight 3, Inéjectable), which belongs to no army and may join the Movement of the army in turn.
- Mechanic `armies`: only the army in turn (and the Heart) may move, fixed cycle; tell = pale ring on
  the next army (classic).
- Phases: `max(hp_phase, structural_phase)`. Structural: P2 when one army is wiped, P3 when one army
  is left (classic). HP: P2 at 70 %, P3 at 35 %; when an HP threshold starts a phase with no army
  wiped, the army with the fewest balls (ties: Alto, Tenor, Bass) **falls silent**: its balls leave
  the board at the phase start (no Perte, no Cimetière, announced by the pending phase).
- P2: the army in turn gets one extra Movement every 4th boss turn (classic; this is a boss exception
  to "1 Movement per turn", feedback F13). P3: the last army cannot push.
- Abilities: per army, one Action: Alto "Aigu" (in line, range 4, 90 % PUI); Tenor "Contre-chant"
  (pull 1 cell, range 3, major); Bass "Bourdon" (zone r1, Enraciné 1 turn, at most 3 balls, major).
  Heart: "Accord" (Action, CD 4, major, board): every player ball adjacent to 2 or more boss balls
  takes 50 % PUI.
- Win: Heart at 0 HP. The classic "win at 10 ejections" (Decision #131) stays for the classic mode
  only.

### 11.4 The Chaplain: La Chapelle de Verre, level 65

- Board: radius 4, hero + 13 against Heart + 13 shells. Heart "Le Chapelain", Weight 3, **Résilient**.
- Mechanic `convert` (§18: converts only **Fragments**, never a hero; Revenants are not Fragments, so
  never converted, PROPOSAL): at the end of the boss turn, a Fragment with 3 or more adjacent boss
  balls joins the boss entity, keeps its current HP and stats, loses its statuses. Not a Perte
  (classic rule). At the end of a player turn, a converted ball with 3 or more adjacent balls of the
  player camp goes back to its owner.
- Flip cost (#207, kept): on a boss turn that flips, with a 3 in 4 chance seeded per boss turn, the
  boss loses one non-flipped shell per flip; each counts as a shell Perte (shell link).
- P2 (70 %): off-board and Gouffre neighbours count as one boss neighbour. P3 (35 %): one chain wave,
  and the cost is certain (classic, now on HP).
- Abilities: "Onction" (Quick, CD 3, range 3, major): a Fragment counts one more boss neighbour for 2
  turns. "Absolution" (Action, CD 4, range 3): heals the 3 most hurt shells 40 % PUI.
- Tell: flip preview on hover (Decision #154), plus intentions.

### 11.5 The Ballast Mind (Tally): solo "Le Registre" and the raid

- **Solo and duo version** (PROPOSAL, feedback F11): radius 5 with the 6 classic void pillars, hero
  + 13 against Heart "Tally" (Weight 5, Inéjectable) + 15 shells. Level 95. P1 plain; P2 (70 %)
  `rim_crack` plus `convert`; P3 (35 %) adds `mirror` of the previous Movement. This is the main
  quest's end for a solo player.
- **Raid version**: section 15.
- **Release gate**: blocked until a recorded RPG win exists (§18). Node budget 150 000 is the classic
  value and is far too slow for an RPG state in WASM (risk; `ai-engineer`).

**Dependencies (11.x).** As section 10, plus `world-generator` (dungeon interiors of §17, 3-tile
Hull layout), `class-designer` (counters used in the abilities), `quest-designer` (main quest
"5 sièges").

**Tests per boss (one PR each, section 22).**

- Echo: Given the player Movement `(−1,1),(−2,2) SE` in P1, Then the boss Movement is `(1,−1),(2,−2)
  NW` when legal; Given it is illegal under the weighted push (shell Weight too low), Then the AI
  Movement is played and it is legal.
- Hull: Given P2 starts, Then tile A shows the collapse tell for 2 player turns, then its cells are
  Gouffre and every ball on it is gone, Pertes counted per camp, the Heart (on tile B) untouched.
- Choir: Given Heart 69 % with no army wiped, Then at the next boss turn the smallest army leaves
  the board and the cycle has 2 armies.
- Chaplain: Given a Fragment with 3 boss neighbours at boss turn end, Then it flips, Pertes
  unchanged; Given the hero with 3 boss neighbours, Then nothing flips.
- Ballast: Given `release: false` and no fixture, Then the boss is absent from the dungeon list
  (gate test).
- Each: a recorded win fixture replays to `Won` (section 18).
- E2E (Playwright, with `client-ui`): open the Echo fight from the test entry, hover a move, see the
  mirror ghost and the boss HP bar with 2 notches; lose on purpose, press Retry, the board is
  interactive in under 5 s with the same first boss intention.

---

## 12. New dungeon bosses (§17)

PROPOSAL, one task each in R9, every number TUNE.

| Boss | Dungeon, level | Board | Heart | Mechanics | Abilities |
|---|---|---|---|---|---|
| La Reine Tisseuse | Le Terrier de Cendre, 15 | radius 4 | Weight 3, Inéjectable | `bomb_ball` "Cocon": every 4 boss turns a cocoon (HP 15 % hero max, Weight 1) appears on a free cell, 1-turn tell; after 3 turns it hatches 2 Sbires. P2: 2 cocoons at once. P3: the Heart gains Téléporteur | "Toile" (Action, CD 3, zone r1, range 4, major): Enraciné 1 turn, at most 3 balls |
| Le Noyé-qui-compte | La Tourbière Engloutie, 22 | 2 tiles | Weight 4, Résilient | `hold_cells` "Le Compte": every 5 boss turns, 3 cells marked 2 turns ahead must hold player balls at the boss turn end, else every player ball takes 10 % max HP. `channel` "Noyade" (2 turns, interrupted by pushing the Heart): Water on a zone r2 | "Appel des noyés": `summon` 2 Sbires, CD 5 |
| Le Marcheur d'abîme | Le Gouffre du Lest, 80 | 3 tiles | Weight 4, Inéjectable | Region change (§18): at each phase the Heart moves to the next tile (cell announced 2 turns ahead), the old tile gets Éboulements. `linked` "Jumeaux" pair in P2. `front_shield` on the Heart | "Pas de l'abîme" (Action, CD 4, major, Éjecteur, `fires_in` 2): a line of 4 cells becomes Gouffre for 2 turns |

**Dependencies.** `world-generator` (dungeons, Sylve, Tourbière, Puits terrain), `combat-engine`
(Water, Éboulements), art.

**Tests.** As 11.x, one mechanic test and one fixture per boss.

---

## 13. Dungeon difficulty: Heroic, Mythic keys, weekly affixes (§17)

**Implementation** (`abalone-world/src/difficulty.rs`, `data/mythic/affixes.ron`).

- **Normal**: dungeon level (§17).
- **Heroic**: monster level = zone max level, plus 1 affix: the first affix of the current week
  (PROPOSAL, §17 does not say which list, feedback F14).
- **Mythic +k** (k = 1 to 20, §17 TUNE): level 100; monster HP and damage `+ 1 000 bp × k`
  (TUNE); affixes active: 1 from +2, 2 from +4, 3 from +7, 4 from +10 (TUNE). Weekly affixes:
  `mix(hash("mythic", iso_week_utc))` picks an ordered list of 4 from the 8 below, no repeat.
- **Turn budget** per dungeon in its data (`turn_budget`, TUNE). Met: key +1 (§17). Missed: key −1
  (PROPOSAL). Counting: player entity turns summed over every fight of the run (PROPOSAL).

| Affix (§17) | Rule (PROPOSAL, numbers TUNE) |
|---|---|
| Fortifié | Non-boss monsters: HP +20 %, damage +30 % |
| Tyrannique | Boss Hearts: HP +30 %, damage +15 % |
| Volcanique | At the start of each pack turn, 1 cell next to a player ball is marked; it becomes Lava for 2 turns at that pack's next turn |
| Explosif | Every 4 rounds a neutral orb (1 HP, Weight 1) spawns on a free cell; after 3 rounds it deals 10 % max HP to every player ball |
| Verglacé | A monster that dies leaves Ice on its cell for 3 turns |
| Sanguin | A monster that dies leaves a Sanctuaire for monsters for 3 turns (§17) |
| Nécrotique | Monster hits add a stack: −5 % healing received per stack, at most 10, −1 per turn |
| Tectonique | Every 5 rounds, 2 empty cells become Roc for 3 turns, announced 1 round ahead |

**Dependencies.** `world-generator` (dungeon runs), `loot-economy` (key rewards, weekly bonus),
`combat-engine` (terrain).

**Tests.** Given ISO week 2026-W43, Then the same 4 affixes on every run (pinned values). Given key
+7, Then 3 affixes and HP factor 17 000 bp. Each affix: one position test. The weekly pick never
repeats an affix.

---

## 14. World bosses, rare named, timed elites, events (§18, §4.3, §22)

**Implementation** (`abalone-world/src/spawn.rs`, `data/world_bosses.ron`).

- **World boss schedule**: slot `s = floor(unix_utc_seconds / 10 800)` (every 3 h, §18 TUNE).
  `boss = list[mix(hash(world_seed, "wb", s)) % len]`, tile picked the same way among the boss's
  candidate tiles. Active for 45 min of the slot (PROPOSAL, TUNE). Shown on the map with a glyph.
  Same for everyone (UTC plus world seed, no server, §4.7).
- **Weekly reward**: one per world boss per ISO week UTC, flag in the hero save (§18).
- **Group**: up to 4 (§18), section 9 group boss rule; formats from §6.8 group boss row.
- **Roster v1** (PROPOSAL): "Le Léviathan de sel" (Littoral Mort, `hold_cells` with the Marée),
  "Le Colosse de verre" (Crêtes de Fer, `front_shield`, `totem` x2), "La Mère-Scorie" (Terres
  Vitrifiées, `summon`, leaves Corruption). One task builds the schedule plus the first boss.
- **Rare named** (§4.3, §5.3): 3 per zone (TUNE), fixed name, fixed 3 affixes, own loot table;
  respawn 30 min of real time after its kill, per player (§5.3 TUNE), timestamp in the hero save.
- **Timed rare elites** (§22): appear at UTC hours picked by `mix(hash(world_seed, zone, day))`
  (PROPOSAL).
- **Event "hunt a rare"** (§22): reuses rare named data; the event engine is `world-generator`.

**Dependencies.** `world-generator` (map markers, tiles, events), `loot-economy`, `netcode`
(group join), `client-ui` (map glyphs, countdown).

**Tests.** Given UTC `2026-10-24T09:00:00Z` and world seed W, Then a pinned boss and tile; Given
`08:59:59Z`, Then the previous slot. Given a rare killed at t, Then absent at t + 29 min 59 s and
present at t + 30 min. Pure: the clock is a parameter, never read inside.

**Risks.** A device with a wrong clock sees another world boss; acceptable (same as the daily).

---

## 15. Raids (§18, §6.8, §17)

**Implementation** (PROPOSAL; §18 says 3 to 5 bosses per raid, §17 lists one, feedback F11).

"Le Pont de Tally", level 95 to 100, 4 players (raid row of §6.8: 3 to 7 tiles, hero + 6 each):

| Wing | Boss | Tiles | Mechanics |
|---|---|---|---|
| 1 | Les Commis (the clerks) | 3 | `armies` (one army per player) |
| 2 | L'Auditeur | 5 | `convert` plus `rim_crack` |
| 3 | Tally, raid form | 7 (flower) | below |

Tally raid form, flower of 7 tiles (§18): centre tile plus 6 petals. Active petals = number of
players, in a fixed order (PROPOSAL; §18 "one petal per player" leaves 2 of 6 petals unused with 4
players). Each player starts on a petal with one shell squad and one `totem` "Relais" (Inamovible).
The centre tile is all Roc until P3. The Heart sits in the centre. P1: destroy relays (each relay
destroyed: Heart −15 % max HP, TUNE) and shells (shell link). P2 (70 %): `rim_crack` on petal rims and
`convert`. P3 (35 %): the centre opens (Roc to Normal after a 2-turn tell), `mirror` of the last
Movement on the whole union.

Raid lockout: one loot per boss per ISO week, local flag (PROPOSAL; no server, so self-declared,
§13.4).

**Dependencies.** `world-generator` (flower stitching, 7 × 61 = 427 cells), `combat-engine`
(union over `MAX_RADIUS`, §24.2 board mask), `netcode` (4 peers), `ai-engineer` (budget on 427
cells), `loot-economy`.

**Tests.** Given 3 players, Then 3 petals plus centre are in the union and the 3 others are not.
Given all relays destroyed, Then the Heart lost 4 × 15 %. Given P3 pending, Then the centre Rocs
show a 2-turn tell. Two-tab e2e in R10 (with `netcode` and `client-ui`).

---

## 16. Endgame and world modifiers (§23, §4.8)

**Implementation** (`difficulty.rs`). Applied after `monster_stats`, in this order: world tier,
then Rift or Mythic, then night. All PROPOSAL, numbers TUNE (§23 gives none, feedback F15).

| Modifier | HP and damage factor |
|---|---|
| World tier Normal / Cauchemar / Enfer / Tourment | 10 000 / 15 000 / 22 500 / 35 000 bp |
| Rift level R (1 to 100) | `10 000 + 800 × R` bp |
| Night (v2, §4.8) | all monster stats +10 % (§4.8 TUNE) |

Night is decided once at fight start from the UTC time and stored in the `EncounterSpec` (and in the
group commit), so a fight that crosses dusk keeps its value (PROPOSAL, determinism §24.1).

**Dependencies.** `loot-economy` (iLvl per tier), `world-generator` (Rifts as fight sequences),
`netcode` (night flag in the group commit).

**Tests.** Given level 100 Brute Normal in Tourment, Then HP = `floor(base_hp × 35 000 / 10 000)`.
Given a fight started at 19:59:59 UTC in day time, Then the night flag stays off for the whole
fight.

---

## 17. Interactions with class kits (§8.6, §8.7, §6.11)

PROPOSAL, owned here because they decide how bosses behave; `class-designer` confirms.

- **Necromancer, boss raised** (§8.6 "a raised boss keeps one ability"): a Heart never enters the
  Cimetière as raisable (its death ends the fight). "Boss" in §8.6 means Elite, Champion and Rare
  named: raised, they keep their first ability, no affix. Boss shells are raised as Normal monsters.
- **Chronomancer, Arrêt du temps against a boss** (§8.7): "boss" = an entity whose `BossDef` exists.
  +2 to all its cooldowns; pending intentions keep their `fires_in`, so no tell is skipped.
- **Chronomancer, Retour / Paradoxe on a Heart**: allowed; a Résilient or Inéjectable Heart is
  never placed off the board by them (they fail as written).
- **Stase on a Heart**: section 10.2 (delays its intention by 1 turn).
- **Hard controls on monsters**: diminishing returns of §6.11 apply to monsters as to heroes.

**Tests.** One per bullet, position plus actions.

---

## 18. Release gate, RPG ladder, telemetry, retry (§18, §6.12, §24.2)

**Implementation.**

- **Gate** (§18): a boss is listed in a dungeon only if `release: true`; an integrity test fails if
  a released boss has no fixture that replays to `Won`. The Ballast Mind and every new boss start
  with `release: false`.
- **Winnable** (from `boss-balance.md` §1, kept): the RPG player bot (class rotation, `ai-engineer`)
  with 10 times the boss budget wins 7 to 9 seeds of 10 (TUNE, never 10 of 10), for each of the 4
  R2 classes at the boss level, plus a recorded fixture.
- **Fixture format**: the classic header (`boss`, `seed`, `player_budget`, `boss_budget`) plus
  `class`, `level`, then `actions:` with one action per line in the `combat-engine` text notation
  (its `Action` serialization). Replay never searches.
- **Telemetry**: the RPG record extends `AttemptRecord` with `hp_phase`, `heart_hp_bp`, `turns`,
  `class`, `level`, and new causes `hero_ejected`, `hero_killed`, `rout`, `enrage`, `conversion`,
  `mirror`, `draw`. Same JSON-line export (§6.12, `telemetry.rs`).
- **Retry**: section 10.8.

**Dependencies.** `ai-engineer` (player bot, ladder runner, CI nightly), `combat-engine` (action
notation), `client-ui` (Retry button, export).

**Tests.** Gate: a test boss with `release: true` and no fixture makes the integrity test fail with
its id. Fixture round trip: `parse(to_text(f)) == f`. Telemetry: one JSON line per cause, pinned.

---

## 19. Data integrity tests (§24.3)

One test file `crates/abalone-rpg/tests/content_integrity.rs` (with `tech-lead`'s loader):

- every reference exists (family, archetype, ability, affix, mechanic, boss);
- every monster ability has a counter and a type; every major rule of 8.3 holds;
- every Éjecteur monster ability has `fires_in >= 1`, every multi-removal boss ability `>= 2`;
- every mass hard control hits at most 3 balls (§6.10);
- every format has at least one composition, and every format of §6.8 respects the density cap;
- affix exclusions are symmetric;
- released bosses have a winning fixture;
- every glyph id exists in the art list (world.md §8).

---

## 20. Feedback on the gameplay spec

Contradictions and gaps found while writing this role spec. The gameplay spec is not modified; an
owner decides.

- **F1. Stale boss proof (§18).** §18 says the Chaplain and the Ballast Mind are "0 of 10" and stay
  blocked. `boss-balance.md` shows the Chaplain at 7 of 10 after #207, with a recorded fixture
  (`chaplain.txt`). Only the Ballast Mind lacks a fixture.
- **F2. Skirmish ball count (§6.8 vs §5.3).** "Threat 6 (4 to 7 balls)" is not implied by the threat
  table: 12 Sbires are threat 6. A ball-count bound must be a rule (section 5.1 makes it one).
- **F3. Elite stats (§5.3).** "Élite (PV ×3)" and "×1.5": stacked (×4.5 HP) or HP ×3 total? This
  spec reads HP ×3, other stats ×1.5.
- **F4. The Hull "3 tiles in a line" (§18).** When the middle tile collapses, the two end tiles are no
  longer adjacent (only neighbouring tiles touch, §4.1): the fight splits in two boards with no push
  possible between them. Proposed: a triangle of 3 tiles, and the collapse hits the player's start
  tile.
- **F5. Elite budget (§5.3).** "Elite: 12 (1 elite and minions)" = 1 Elite (4) + 16 Sbires: a swarm
  that breaks the density of a radius 4 board. Proposed: a mix of rarities with 5 to 9 balls.
- **F6. Monster level in group (§6.2 vs §4.4, §11).** `max(zone_min, player_level)` makes packs
  track the player, so grey monsters and zone ranges vanish in group. And the solo monster level is
  not defined at all (only zone ranges).
- **F7. Boss victory (§6.8, §18).** The boss row says "14, or the boss" and rout threshold 6. If the
  boss side has a rout threshold, ejecting 6 shells wins without touching the Heart. Proposed: no
  rout for a boss entity, win on Heart death, shell Pertes damage the Heart.
- **F8. Group density (§6.8).** Quatuor skirmish on radius 4: 16 player balls plus 4 packs of 4 to 7
  is up to 44 balls on 61 cells (72 %). Proposed: pack threat proportional to the player's squad,
  and radius 5 for a quatuor skirmish.
- **F9. Pack rout threshold (§6.7, §6.8).** The table gives the player's threshold only. The pack's
  threshold in solo is not defined.
- **F10. Inéjectable Heart vs the status (§6.11, §18).** The status "does not stack, Lassitude 2
  turns", but a Heart must be Inéjectable for the whole fight. A separate intrinsic keyword is
  needed.
- **F11. Raids and Tally (§17, §18, §16).** §18 says raids have 3 to 5 bosses; §17 lists the raid
  "Le Pont de Tally" with one boss. The main quest ends on Tally, but Tally is a 4-player raid: a solo
  player can never finish the story. "One petal per player" on a 7-tile flower leaves petals unused.
  The main quest "find the 5 seats (the existing bosses)" counts Tally, who gives the quest.
- **F12. Bosses in group (§6.2, §6.8, §17).** "One pack per player" defines packs, not bosses. How a
  boss scales with 2 to 4 players (HP, balls, turns) is not written; §17 says "no HP bonus for
  enemies" for packs only.
- **F13. Choir extra Movement (§6.3 vs game-design §7.2).** The classic Choir P2 gives an army a
  free extra move; the RPG turn has 1 Movement only. Needs an explicit boss exception.
- **F14. Heroic affix (§17).** "1 affix": from the elite list or the Mythic list? Which one?
- **F15. Endgame numbers (§23).** World tiers and Rifts "raise stats" with no number; Rift levels go to
  100 like hero levels, the scaling above level 100 is not defined.
- **F16. Phases "plus sur un nombre de boules" (§18).** Read as "no longer on a ball count". The Choir
  phases are structural (an army wiped): they need a dual trigger (HP or structure).
- **F17. "No pack joins a fight" (§4.4) vs reinforcements (§18) and the Invocateur (§5.3).** Needs
  "a reinforcement is always an announced intention" written down.
- **F18. Intention timing (§5.3).** "Monsters always show their intention" but the AI picks its Action
  at its own turn start: the intention must be committed one turn before, with a rule for a target
  that moved, died or became untargetable.
- **F19. Hard control on a boss (§6.11, §8.7).** Only Arrêt du temps has a boss rule. A Stase or a
  Frozen Heart would skip its tells (against pillar 2), or shut the boss down.
- **F20. Raised "boss" (§8.6).** A Heart's death ends the fight, so it can never be raised; the rule
  needs another meaning (elites, rares).
- **F21. Weighted push makes monsters unable to push tank heroes (§6.4, §5.3).** Three Weight 1
  monsters (total 3) cannot push a lone Gardien or Guerrier (Weight 3): "3 > 3" is false. Only packs
  with Brutes or Porteurs threaten tanks. Not a contradiction, but the threat model of packs depends
  on it, and the R2 reference packs must include heavy archetypes.
- **F22. Escarmouche Champions (§4.3, §5.3).** "Élite ou Champion" is one tile type; whether
  Champions appear in plain skirmishes is not said.
- **F23. New bosses have no roadmap phase (§17, §25).** R8 lists "the 5 converted bosses"; the
  Reine Tisseuse, the Noyé-qui-compte and the Marcheur d'abîme are not placed. This spec puts them in
  R9.
- **F24. Ejection lead of terrain hooks (§6.10).** Classic Hull cracks vanish 2 plies (1 round)
  later. With 2 cells per wave in P2, that is a multi-removal with a 1-turn tell, forbidden by rule 2.
  The RPG lead must be 2 boss turns.

---

## 21. Open questions

- Q1. Boss victory: Heart death only, with shell link (proposed), or keep a rout threshold on shells?
- Q2. The Hull: triangle of 3 tiles (proposed) or a line with another collapse rule?
- Q3. Tally: a solo "Registre" version for the main quest (proposed), or is the story's end a group
  raid?
- Q4. Elite HP: ×3 total (proposed) or ×4.5?
- Q5. Pack rout threshold in solo: half the pack (proposed) or the format's player threshold?
- Q6. Group boss scaling: one shell squad per player and one shared Heart acting once per round
  (proposed)?
- Q7. Hard control on a Heart: delay its intention by 1 turn (proposed), immunity, or full effect?
- Q8. Do fled pack balls give XP and loot?
- Q9. Monster level in group: keep `max(zone_min, player_level)` or use the tile level as in solo?
- Q10. Champions in plain skirmishes (at most 1, proposed)?
- Q11. Choir board: radius 4 (proposed, with the classic hook) or the classic radius 3?
- Q12. Data format RON or JSON (`tech-lead`)?

---

## 22. Tasks (one PR each)

Phases from §25. Every code Task: strict TDD (test commit first), 100 % line and region coverage,
`scripts/verify.sh` green, one e2e run when a player sees it, screenshot in the PR when the UI
changes (CONTRIBUTING 6.4). Each Task waits for the Tasks it depends on to be merged.

| # | Phase | Title | Outcome (one sentence) | Done checklist |
|---|---|---|---|---|
| T1 | R0 | Spec: monsters and bosses in `rpg/dungeons-bosses.md` | The English spec of monsters, packs, affixes, AI intention and bosses is merged into PR 3 of §0. | Sections 3 to 19 of this file moved into `docs/specs/rpg/dungeons-bosses.md`; feedback F1 to F24 posted on Decision #313; every number tagged; owner review by @TidyMaze |
| T2 | R1 | Monster stat builder | `monster_stats()` builds integer stats for Brute and Rôdeur at any level and rarity. | `monster/mod.rs` with `Archetype`, `Rarity`, `MonsterDef`; `data/monsters/{archetypes,rarities}.ron` (2 archetypes); tests of 3.1; coverage 100 % |
| T3 | R1 | Skirmish pack generator | A tile seed gives the same skirmish pack of 4 to 7 balls with exact threat 12 half-points. | `pack.rs` enumeration and pick; `formats.ron` (skirmish); composition list pinned; determinism and coverage properties |
| T4 | R1 | Pack leader, flight and rout | Killing the leader makes the pack flee and half the pack lost routs it. | Leader flag and glyph id; flee rule; rout threshold; tests of section 6; e2e: kill the leader in the R1 fight, see the win banner |
| T5 | R1 | Monster AI priorities and intention | Monsters pick their Action from a priority list and announce every major ability one turn ahead. | `ai.rs` priority lists, top-3 targets, `Intent` commit, fizzle, Provocation redirect; intent in the state hash; Coup de masse and Curée data; e2e: intent glyph visible on the R1 fight (with `client-ui`) |
| T6 | R2 | All 8 archetypes and their abilities | The 8 archetypes of §5.3 fight with their 1 or 2 abilities from data. | 6 more archetypes and the abilities of 3.2; one position test per ability; counters present (integrity) |
| T7 | R2 | Reference packs per class | Each of the 4 R2 classes has a fixed reference pack that the ladder runs. | `data/encounters/reference.ron` (heavy archetypes included, F21); seeds pinned; ladder entry handed to `ai-engineer` |
| T8 | R3 | Monster level and level bands | Monsters take the tile or group level and show a level band glyph. | `level_band()` table test; group level rule; data for glyph ids |
| T9 | R4 | Biome families for the 3 v1 biomes | Lumen, Sylve and Tourbières spawn their 6 families from data. | `families.ron` (6 families); integrity tests; generator uses the family roster |
| T10 | R4 | Elite and Champion formats | Elite tiles spawn one Elite or a Champion pack inside the 24 half-point budget. | Elite format compositions; Champion pack rule; elite leader +1 Weight; aggro radius 2 |
| T11 | R4 | Elite affixes, stat group | Blindé, Massif, Vampirique and Bouclier work on elites and champions. | 4 affixes; exclusions; glyph ids; one test each |
| T12 | R4 | Elite affixes, behaviour group | The 8 remaining affixes work, with their exclusions. | Givrant, Brûlant, Écho, Pilier, Grappin, Invocateur, Explosif, Téléporteur; exclusion property over 10 000 seeds |
| T13 | R8 | Boss framework | A data-defined boss with a Heart, shell link, HP phases with a pending tell and an enrage plays to a win or loss. | `boss/mod.rs`, `BossDef` loader, Résilient and intrinsic Inéjectable, victory rules, phase monotonic, enrage, release gate, a test boss; tests of section 10 |
| T14 | R8 | RPG boss fixtures and telemetry | A recorded RPG boss win replays to `Won` and attempts export with RPG causes. | Fixture format with `class`, `level`, `actions`; `boss/telemetry.rs`; round-trip and gate tests |
| T15 | R8 | The Echo, RPG | The Echo boss of Les Cales du Ballast is playable and released with a fixture. | `mirror` mechanic plus classic equivalence property; `echo.ron`; ladder 7 to 9 of 10 recorded; fixture; e2e: mirror ghost, HP notches, Retry under 5 s |
| T16 | R8 | The Hull, RPG | The 3-tile Hull with rim cracks and a tile collapse is playable and released. | `rim_crack` (2-turn lead), `tile_collapse`; triangle layout (needs Q2 answered); equivalence property; fixture; e2e |
| T17 | R8 | The Choir, RPG | The Choir with armies and HP phases is playable and released. | `armies` with dual trigger and silent army; `choir.ron` (needs Q11); fixture; e2e |
| T18 | R8 | The Chaplain, RPG | The Chaplain converts Fragments only, pays its flips, and is released. | `convert` with #207 cost; equivalence property; hero never flips; fixture; e2e |
| T19 | R8 | Tally solo, "Le Registre" | The solo Ballast Mind fight exists behind the release gate. | `ballast.ron` with `release: false`; phases compose `rim_crack`, `convert`, `mirror`; gate test; ladder run documented (needs Q3) |
| T20 | R9 | Biome families for the 7 other biomes | All 10 biomes spawn their 2 families. | 14 families; integrity tests |
| T21 | R9 | La Reine Tisseuse | The Terrier de Cendre boss with cocoons is playable and released. | `bomb_ball`, `summon`; data; fixture; e2e |
| T22 | R9 | Le Noyé-qui-compte | The Tourbière boss with held cells and a channel is playable and released. | `hold_cells`, `channel`; 2 tiles; fixture; e2e |
| T23 | R9 | Le Marcheur d'abîme | The Puits boss with region change and linked balls is playable and released. | Region change, `linked`, `front_shield`; 3 tiles; fixture; e2e |
| T24 | R9 | Heroic and Mythic keys | Dungeons run in Heroic and Mythic +1 to +20 with weekly affixes and a turn budget. | `difficulty.rs`; 8 Mythic affixes; weekly pick pinned; key up and down |
| T25 | R9 | World boss schedule and first world boss | A seeded UTC schedule shows a world boss on the map every 3 hours with a weekly reward. | `spawn.rs` schedule pure in time; weekly flag; "Le Colosse de verre" data and fixture; e2e: map glyph at a pinned clock |
| T26 | R9 | Rare named and timed elites | Each zone has 3 rare named monsters that respawn 30 min after their kill. | Rare data for 10 zones; respawn timer; timed elites schedule |
| T27 | R9 | World tiers, Rifts and night modifiers | Monster stats follow the world tier, the Rift level and the night flag. | Modifier order; night flag stored at fight start; tests of section 16 |
| T28 | R10 | Group encounters | A group meets one pack per player with a squad-proportional budget, and a boss with one squad per player. | Group budget and bounds; density property; group boss rule (needs Q6); two-tab e2e with `netcode` |
| T29 | R10 | Raid wing 1: Les Commis | The first boss of Le Pont de Tally is playable by 4 players. | 3-tile `armies` per player; fixture; two-tab e2e |
| T30 | R10 | Raid wing 2: L'Auditeur | The second raid boss is playable by 4 players. | 5 tiles; `convert` plus `rim_crack`; fixture |
| T31 | R10 | Raid wing 3: Tally flower | Tally's 7-tile flower fight is playable by 1 to 4 players and released once won. | Petals by player count; relays; centre opening tell; fixture; gate |

31 Tasks. Task T1 is docs-only (no TDD); every other Task waits for its `combat-engine` and
`ai-engineer` prerequisites (crate `abalone-rpg`, `CombatState`, search adapter).
