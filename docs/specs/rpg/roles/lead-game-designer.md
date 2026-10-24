# Lead game design: implementation spec (role `lead-game-designer`)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, pending). Source of truth:
the validated French gameplay spec (`docs/specs/rpg/plan.fr.md`, same text as the approved plan
apart from its status header). Section numbers like "§6.4" point to that gameplay spec. This file
does not change the gameplay spec: it says how the lead game designer turns the pillars, the
glossary and the cross-role rulings into spec text, tests and Tasks, and it lists what is
contradictory or missing (section 12). No code yet: TDD applies from R1 (CONTRIBUTING section 11).

Tags, as in `rules.md`: **FINAL** (decided), **TUNE** (starting value, set by the bot ladder and
playtests), **PROPOSAL** (proposed here, an owner confirms). Every number below carries one. A
number copied from the gameplay spec keeps the tag it has there: the gameplay spec says "everything
is PROPOSAL and every number is TUNE unless stated", so most copied numbers are TUNE. The seven
validated decisions (section 4.0) are FINAL.

---

## 0. Scope

The lead game designer owns the **coherence** of the game, not one content area:

- the revised pillars (§1) and the list of locked decisions, written as testable invariants;
- the glossary (§6.0), the canonical English names, the code identifiers and the name collisions;
- the game loops (§3) and their time budgets;
- the rules that tie Abalone to the RPG: the weighted push (§6.4), the ejection limits (§6.10),
  hero death (§6.6), turn units, durations and cooldowns (§6.3), victory and anti-stalling (§6.7),
  the stacking order of damage modifiers (§6.5), written as rules text and Given/When/Then
  examples for `rules.md` §10.5;
- the spec deltas to `SPEC.md`, `game-design.md` and `rules.md` (§0, conflict list of "Contexte");
- the index file `docs/specs/rpg/README.md` (§0, PR 1) and the roadmap file
  `docs/specs/rpg/roadmap.md` (§0, PR 4, §25);
- arbitration between roles: a register of rulings (section 11) when two role specs disagree;
- the coherence tooling: classic equivalence tests, the scenario runner that turns spec examples
  into tests, the constants registry with tags, the name collision lint.

Out of scope (each item is a dependency, see the slug table in 2.2): the engine code of the combat
(`combat-engineer`), class kits (`class-designer`), stats, XP and talent trees
(`progression-designer`), map and biomes (`world-designer`), monsters and bosses
(`encounter-boss-designer`), lore and quests (`narrative-quest-designer`), items and economy
(`economy-designer`), screens and previews (`ux-designer`, `client-engineer`), search and bots
(`ai-engineer`), P2P (`network-engineer`), PvP and battle royale (`pvp-br-designer`), crates, data
format and determinism plumbing (`tech-lead`).

---

## 1. Inputs read

- Gameplay spec, every section; in detail §0, §1, §3, §4.1, §4.6, §5.1, §6 (all), §7.1, §8 (all
  ability sheets, for the coherence checks), §9.1, §10, §11, §18, §19, §20, §24, §25, §26, and the
  "Vérification" list.
- `SPEC.md` (§1 pitch, §2 core rules "modes add rules, they never fork the engine", §4 phases, §6
  out of scope).
- `docs/specs/game-design.md` (§1 pillars, §3.5 hub, §4 progression, §5 anti-stalling, §9
  testability checklist).
- `docs/specs/rules.md` (tags, §1 notation, §5 sumito, §9 end of game, §10 intro "a mode never
  changes a move or a push", §11 numbers index, §12 example format, §13 open conflicts).
- `docs/specs/world.md` §1 to §3 (slag-glass, Tally, the five seats), §5 and §8 (glyph plus colour).
- `CONTRIBUTING.md` (§1 rules 16 and 17 KISS, §5 Definitions of Ready and Done, §11 TDD, §13 checks).
- The three role specs already written in this folder (`encounter-boss-designer.md`,
  `narrative-quest-designer.md`, `ux-designer.md`): their feedback and open questions feed the
  arbitration register (section 11).
- Code: `crates/abalone-core/src/board.rs` (`Board` on a `HashMap`, `MAX_RADIUS = 5`, `void`,
  `cracks`), `moves.rs` (`legal_moves` scans q then r, `apply` returns `MoveError::NotStrongEnough`
  and `PushBlocked`), `game.rs` (`WIN_EJECTIONS = 6`, `NO_EJECTION_PLY_LIMIT = 100`,
  `REPETITION_LIMIT = 3`), `search.rs`, `encounter/*.rs`.

What the code tells this spec:

1. **There is no perft function and no pinned perft count today.** The pillar 1 invariant (§1, §6.4:
   "même perft") needs one first. Task LGD-05 adds it to `abalone-core` before any push change.
2. **The sumito check is inline in `apply`.** The weighted rule must not fork it: one pure
   predicate shared by the classic and the RPG paths (section 7.1).
3. **`legal_moves` scans q then r.** §24.1 fixes "r then q" for the RPG. The classic order is kept
   (it only changes the order of a set, and the classic search and fixtures depend on it); the RPG
   uses its own fixed order. Written down so nobody "fixes" the classic order by accident.

---

## 2. Conventions

### 2.1 Units and numbers

- Integers only (§24.1, FINAL). Percentages are basis points (bp, 10 000 = 100 %). Multiply in the
  written order, floor after each multiplication.
- Three clocks, never mixed (PROPOSAL, section 7.2): **entity turn** (one entity's turn),
  **round** (every living entity played once, §6.0), **fight turn index** (the entity turn count of
  one given entity).
- Coordinates and move notation as in `rules.md` §1: `(q,r)`, `(-1,2)(0,2)>E`.

### 2.2 Role slugs (PROPOSAL, the canonical list)

The role specs written so far use different slugs for the same role. As the glossary owner, this
file proposes one canonical list; the aliases map the existing files onto it.

| Canonical slug | Owns | Aliases used in other role files |
|---|---|---|
| `lead-game-designer` | Pillars, glossary, coherence, arbitration, this file | `game-designer`, `game-director` |
| `combat-engineer` | Crate `abalone-rpg` combat: `CombatState`, `apply_action`, damage, statuses, primitives, ejection limits, victory; the push predicate in `abalone-core` | `combat-engine`, `engine-engineer` |
| `class-designer` | Classes, abilities, traits, Fragments | none |
| `progression-designer` | Stats, `g(L)`, XP curve, levels, Paths, active tree | `stats-progression`, `progression-talents` |
| `world-designer` | Map, tiles, biomes, terrain tables, stitching, dungeon maps | `world-generator`, `world-generation`, `world-engineer` |
| `encounter-boss-designer` | Monsters, packs, affixes, AI decision layer, bosses | `dungeons-bosses` |
| `narrative-quest-designer` | Lore, quests, Codex, factions, tutorial content | `quest-designer`, `narrative-designer` |
| `economy-designer` | Items, loot, merchants, currencies, gathering, crafting | `items-loot`, `loot-economy`, `economy-merchants`, `gathering-crafting` |
| `ux-designer` | Readability, previews, Edge danger display, action bar, onboarding | none |
| `client-engineer` | Three.js scenes, WASM plumbing, Playwright e2e | `client-ui` |
| `ai-engineer` | Search on the combat state, player bot, RPG ladder | none |
| `network-engineer` | Group lockstep, commit-reveal seeds, presence | `netcode` |
| `pvp-br-designer` | Duels, arenas, normalization, battle royale | `pvp-br` |
| `tech-lead` | Crates, data format, determinism rules, WASM bridge, MCP | `data-tools` |
| `qa-balance` | Ladder runs, playtests, telemetry reading | `qa-engineer` |
| `art-audio` | Glyphs, palettes, sound cues | `art-director`, `audio-designer` |

---

## 3. Delivery of the pivot (§0, "Contexte")

### 3.1 What the lead writes

| File | Content | Docs PR (§0) |
|---|---|---|
| `docs/specs/rpg/README.md` | Index of the 13 RPG files, locked decisions, revised pillars, glossary, game loops, numbers index, role map | PR 1 |
| `docs/specs/rules.md` | §5 note (weighted push lives in §10.5), new intro of §10, new §10.5 "RPG combat" with the RPG examples (section 9.3) | PR 1 |
| `SPEC.md` | §1 pitch addendum, §4 Phase R, §6 out of scope (ranking moved to a Decision) | PR 4 |
| `docs/specs/game-design.md` | §1 replaced by a pointer to the revised pillars; §3.5 hub; §4 progression | PR 4 |
| `docs/specs/rpg/roadmap.md` | Phases R0 to R10 with exit criteria (section 10) | PR 4 |

The other §0 files belong to the other roles; the lead reviews each one against the glossary and
the pillars (Task LGD-04 gives the checklist).

### 3.2 The Decision issue (#313)

The Decision already exists and is pending. Its body must hold (§0 item 1): the context, the four
validated choices, the revised pillars, the full conflict list. The conflict list of "Contexte" is
incomplete (Feedback G1): the lead adds the conflicts found by the role specs (narrative F6 to F9,
UX F3, this file G2, G3, G18) as a comment on #313, not as a new Decision. **No issue is touched by
this role spec**; the comment is part of Task LGD-01.

### 3.3 Dependencies

`narrative-quest-designer` for `world.md`, `ux-designer` for `world.md` §6 and `ui.md`, `tech-lead`
for `tech.md`. An owner (@TidyMaze) reviews and merges the docs PRs (§0 item 3).

### 3.4 Risks

- §0 PR 1 bundles four files from three roles. CONTRIBUTING rule 17 asks for one thing per PR.
  Proposal (G4): PR 1a README plus `rules.md` delta (lead), PR 1b `combat.md` (`combat-engineer`),
  PR 1c `stats.md` (`progression-designer`), merged in that order.

---

## 4. Pillars as testable invariants (§1)

### 4.0 Locked decisions (FINAL, from the owner's validation)

Written at the top of `rpg/README.md`, each with the test that guards it:

| # | Decision | Guard |
|---|---|---|
| D1 | Science-fantasy universe on the existing lore (§2) | Review checklist LGD-04 (no test) |
| D2 | Diablo-like P2P: shared deterministic world, own instance, party of **4** at most (FINAL), no server (#36) | `party.max` constant pinned (LGD-08); `network-engineer` refuses a 5th peer |
| D3 | Hero plus squad (§6.9) | Scenario examples R9 to R11 |
| D4 | An ejected hero dies and its entity loses at once (§6.6) | Scenario R10; property in LGD-11 |
| D5 | Deterministic combat: no dice in a fight (§1 pillar 2, §24.1) | API shape (no RNG after setup) and "same log, same hash" property (`combat-engineer`, LGD-11) |
| D6 | Weighted push: `n > m` AND strictly greater total Weight (§6.4) | Push predicate unit tests, scenarios R1 to R7, equivalence LGD-06 |
| D7 | At most **1** ejection per action (FINAL), except terrain with a tell of at least **2** turns (FINAL as written in §6.10) | Property in LGD-11 |

### 4.1 Pillar 1: Abalone at the core

**Rule text (PROPOSAL, replaces `rules.md` §10 intro).** "Every mode uses the engine of sections 1
to 9. A classic mode adds rules around a move, it never changes a move or a push. The RPG mode
(section 10.5) is the only exception, and its changes are listed in the deviation register of
`rpg/README.md`: one push condition (Weight), terrain and statuses that forbid or extend a move, and
abilities that say in their text that they bend a push."

**Implementation.**
- **One push predicate, no fork** (`SPEC.md` §2). `abalone-core` gets a pure function, owned by
  `combat-engineer`, specified here:

  ```rust
  pub enum PushRule { Classic, Weighted }
  pub struct PushSides { pub n: u8, pub m: u8, pub w_push: u16, pub w_resist: u16, pub equal_count: bool }
  /// rules.md §5 condition 1, plus gameplay §6.4 condition 2 in Weighted mode.
  pub fn strong_enough(rule: PushRule, s: PushSides) -> bool {
      let count = s.n > s.m || (s.equal_count && s.n == s.m);
      match rule {
          PushRule::Classic => s.n > s.m,
          PushRule::Weighted => count && s.w_push > s.w_resist,
      }
  }
  ```
  `moves::apply` calls it with `Classic`; the RPG push calls it with `Weighted`. `equal_count` is
  set only by an ability that says so (Percée, §8.2).
- **Deviation register** (in `rpg/README.md`, PROPOSAL). Every rule that changes what a Movement
  can do, with its source: Weight (§6.4), Mud no broadside (§5.1), Ice slide (§5.1), Rock (§5.1),
  Unmovable and Unejectable (§6.11), Rooted, Blinded, Stunned (§6.11), Percée equal count (§8.2),
  Avalanche 4-ball group (§8.2), Écrasement (§8.2), Instant suspendu (§8.7), Pont (§8.8). A new
  entry needs an owner's yes on the PR. Data: an ability that bends a push carries
  `bends_push: true`; the integrity test checks that every such ability id is in the register
  (LGD-09).
- **Classic tables untouched** (§1 pillar 1, §21 Mess). The classic `Game`, `encounter/*.rs` and
  their fixtures do not change behaviour. Guard: the pinned perft counts (LGD-05), the existing boss
  fixtures, and an e2e at the Mess (LGD-14).

**Tests.**
- Unit, exhaustive: for `n` in 1..=4, `m` in 0..=3, `w_push = n`, `w_resist = m`,
  `equal_count = false`: `strong_enough(Weighted, s) == strong_enough(Classic, s)`.
- Property (LGD-06): Weighted with every Weight 1, Normal terrain, no status and Movements only
  gives the same perft as Classic at depth 1 to 3 (TUNE: depth 3 if it runs under 10 s in CI) from
  the standard and Belgian daisy layouts, the same legal move set on 1 000 (TUNE) seeded random
  positions, and the same outcome and board hash on 200 (TUNE) seeded random games.

**Dependencies.** `combat-engineer` (predicate and RPG push), `tech-lead` (seeded generator for the
random positions: the splitmix64 `mix` already in `encounter/hull.rs`).

**Risks.** Perft at depth 3 from the opening can be slow in debug builds: run it in a `--release`
test only, or pin depth 2 and run depth 3 nightly.

### 4.2 Pillar 2: readable and deterministic

**Rule text (PROPOSAL, rewording asked by UX F2).** "No dice in a fight. Every threat is visible
before it lands: terrain and boss mechanics are told one turn ahead (two turns when they can remove
several balls), monsters show their intent, heroes show their resource, cooldowns and armed
Preparations. Every state of a fight is public. Every push and every damage shows its preview
before confirm."

Implementation and owners:
- No RNG after setup (`combat-engineer`): `apply_action(&CombatState, &Action) -> Result<(CombatState,
  Effects), ActionError>` takes no seed. The fight seed is used only for the board, the placement
  tie-break and the PvP initiative tie (§6.1). The state hash covers everything listed in §24.1.
- Public state: the list of **hidden** information in the whole game is closed and lives in the
  README: battle royale orders before the reveal (§20), PvP placement during its 20 s (TUNE, §6.1,
  only if `pvp-br-designer` makes it simultaneous, UX F17). Nothing else is hidden.
- Tells: counted in the turns of the tell's owner (section 7.2).
- Previews: `ux-designer` (P1, P2), computed by a dry run in `combat-engineer`.

**Tests.** "Same action log, same hash" property over 200 (TUNE) seeded random R1 fights
(`combat-engineer`, listed in LGD-11 so it is never dropped). Integrity: every `Éjecteur` ability
is an ultimate or has `tell >= 1` (TUNE as a number, FINAL as a rule, §24.3); every terrain effect
that can remove several balls has `tell >= 2` (FINAL, §6.10).

**Risks.** Instant abilities (Fendoir, Trait de feu, Assassinat) are not "told": the reworded pillar
makes them legal by making the resource and the cooldown the tell. An owner must accept the
rewording (open question O2).

### 4.3 Pillar 3: the player and the hero both progress, skill first

**Implementation.**
- **Measure "skill over stats"** (PROPOSAL, measured by `qa-balance` with the `ai-engineer` ladder):
  on the R2 reference skirmish, a player bot two search depths stronger than the default player bot,
  with a hero 5 levels (TUNE) below the pack, wins at least 50 % (TUNE) of 100 seeded fights. If it
  fails, the level gap modifier (§6.5, ±25 % TUNE) is tuned before any skill rule.
- **Retry under 5 s** (§1, FINAL from `game-design.md` §3.3): the boss retry restarts from the same
  seed with full hero HP (G13). `encounter-boss-designer` owns the e2e.
- **Normalized ranked PvP** (§19): `pvp-br-designer` owns the level 100 template; the lead requires
  one test: two heroes of the same class and build, one with gear and one without, have equal stats
  in a ranked arena.
- **No difficulty slider** (kept from `game-design.md` §1 pillar 3, PROPOSAL): world tiers (§23) are
  unlocked content, never a free toggle in a menu (open question O6).

**Dependencies.** `qa-balance`, `ai-engineer`, `pvp-br-designer`, `encounter-boss-designer`.

**Risks.** `g(L)` grows stats about 9 % per level (TUNE): a 10-level gap is about ×1.5 on stats
before the ±25 % cap. Pillar 3 holds only if packs stay inside their zone band (§5.2).

### 4.4 Pillar 4: every rule is testable

**Implementation: the scenario runner** (PROPOSAL, Task LGD-07). Every Given/When/Then example of
`rules.md` §10.5 is also a data file, run by one generic test.

```ron
// crates/abalone-rpg/tests/scenarios/R2.ron
(
    id: "R2",                       // same id as "Example R2" in rules.md §10.5
    source: "gameplay §6.4",
    board: (radius: 4, terrain: []),
    units: [
        (id: 1, side: 0, entity: 0, kind: Hero("warrior"), at: (-1, 0), weight: 3),
        (id: 2, side: 0, entity: 0, kind: Fragment,        at: (-2, 0), weight: 1),
        (id: 3, side: 1, entity: 1, kind: Hero("guardian"), at: (0, 0),  weight: 3),
    ],
    active: 0,
    actions: [Move(cells: [(-2, 0), (-1, 0)], dir: E)],
    expect: Ok([At(3, (1, 0)), At(1, (0, 0)), At(2, (-1, 0))]),
)
```

- `expect` is `Illegal(reason)` or a list of assertions: `At(unit, cell)`, `Hp(unit, n)`,
  `Gone(unit, Death | Ejection)`, `Casualties(entity, n)`, `Outcome(...)`,
  `EdgeDanger(unit, None | Could | Will)`, `Cooldown(unit, ability, n)`.
- Units not given keep the defaults of the R1 test hero (section 10.2). Stats are given only where
  the example needs them.
- **Doc sync test**: the runner reads `docs/specs/rules.md` with `include_str!`, collects every
  `**Example R<n>` id of §10.5, and fails if an id has no scenario file or a scenario id is not in
  the doc. A spec example and its test can no longer drift apart.

**Dependencies.** `combat-engineer` (`apply_action`, `CombatState` builder from a scenario),
`tech-lead` (RON or JSON, open question O9; the fields stay the same).

**Tests.** The runner itself: one passing scenario, one failing scenario reports the id and the first
failed assertion, the doc sync test fails on a missing file and on an orphan file.

**Risks.** The scenario schema must follow `CombatState`. Keep it small: only the fields above; a new
field is added by the PR that needs it.

### 4.5 Pillar 5: alone, together

- Party of **4** at most (FINAL, D2). Emotes and pings only, no free chat (FINAL, existing decision).
- Mood: solo is the default; nothing in the main quest requires a party (rules out a 4-player-only
  story end, see ruling A9).
- **Dependency**: `network-engineer` enforces the cap; `narrative-quest-designer` for the solo
  story end. **Test**: constant `party.max = 4` pinned (LGD-08).

### 4.6 Pillar 6: content is data

The lead owns the **list** of design invariants the integrity tests encode (§24.3); each content PR
implements the checks for its own data. The list (all FINAL as rules, numbers TUNE):

1. Every reference exists (ids).
2. Passive budget 99 points, active budget 20 points, rank costs 1/1/2 (`progression-designer`).
3. No ability cost above its class's max resource (`class-designer`).
4. Every ability has a written counter (`counter` field not empty) (`class-designer`,
   `encounter-boss-designer`).
5. Every `Éjecteur` is an ultimate or has a tell (all ability owners).
6. Every area hard control hits at most **3** balls (TUNE, §6.10).
7. Every ability with `bends_push: true` is in the deviation register (lead, LGD-09).
8. No two content entries share a display name or an id across all content kinds (lead, LGD-09).
9. Every number in `data/rules/constants.ron` carries a tag (lead, LGD-08).

---

## 5. Glossary (§6.0)

### 5.1 Implementation

- The glossary is a table in `rpg/README.md` with five columns: English term (canonical), French term
  of the gameplay spec, code identifier, meaning, tag. English is the repo language; the French
  column lets owners check against the plan.
- Code identifiers are the English term in `PascalCase` for types and variants, `snake_case` for
  data ids. Display strings come from string keys (`narrative-quest-designer` section 17.1), never
  from identifiers.
- §6.0 becomes FINAL once #313 is decided; the entries added here are PROPOSAL until an owner
  accepts them.
- Test (LGD-09): every variant of the enums `Status`, `Keyword`, `Terrain`, `Slot` in
  `abalone-rpg` appears in the code identifier column of the README (read with `include_str!`).

### 5.2 Core terms (the §6.0 list plus the missing ones)

| English (canonical) | French (§) | Code | Meaning | Tag |
|---|---|---|---|---|
| Entity | Entité (§6.0) | `Entity`, `EntityId` | A player (hero, Fragments, Revenants) or an AI pack (leader and monsters). Moves only its own balls | FINAL when #313 closes |
| Side | Camp (§6.0) | `Side` | A group of allied entities | idem |
| Turn | Tour (§6.0) | `Turn` | One entity's turn | idem |
| Round | Round (§6.0) | `Round` | Every living entity has played once | idem |
| Movement | Mouvement (§6.0) | `Action::Move` | The Abalone move: 1 to 3 balls, one direction | idem |
| Step | Pas (§6.0) | `Action::Step` | One ball, one cell, no push, never off the board nor onto an obstacle | idem |
| Bonus Step | Pas bonus (§6.3) | `bonus_step` | An extra Step granted by an effect, 1 per turn at most | PROPOSAL (term) |
| Casualty | Perte (§6.0) | `Casualty` | A ball dead or ejected that counts toward the rout. Not "Loss": it clashes with losing a fight | PROPOSAL (term) |
| Action | Action (§6.3) | `Slot::Action` | The ability slot of a turn | FINAL when #313 closes |
| Quick action | Action rapide (§6.3) | `Slot::Quick` | Quick ability, consumable or Preparation | idem |
| Preparation | Préparation (§6.3) | `AbilityKind::Preparation` | An armed public reaction, fires on its own during the opposing turn | idem |
| Tell | Tell (§6.0) | `Tell` | A threat shown in advance, visible to all | idem |
| Intent | Intention (§6.0) | `Intent` | A monster's next major ability and its target | idem |
| Weight | Poids (§6.4, §7.1) | `weight` | Integer 1 to 5, the second push condition | FINAL (D6) |
| Shock | Choc (§6.5) | `Shock` | Physical damage dealt by a push after the shift | PROPOSAL (term) |
| Isolation | Isolement (§6.5) | `isolated()` | No allied ball adjacent: +25 % damage taken (TUNE) | idem |
| Formation | Formation (§6.5) | `formation_bp()` | −10 % damage taken per adjacent ally, −30 % at most (TUNE) | idem |
| Hero Guard | Garde du héros (§6.5) | `HERO_GUARD_BP` | Cap on HP a hero loses to one action (section 7.6) | idem |
| Edge danger | Danger du bord (§6.6) | `EdgeDanger` | Public flag on a hero that could be ejected before its next turn | idem |
| Remains | Dépouille (§6.6) | `Remains` | What a ball at 0 HP leaves; blocks nothing | idem |
| Graveyard | Cimetière (§6.6) | `Graveyard` | Ordered list of lost balls | idem |
| Revenant | Revenant (§6.6) | `UnitKind::Revenant` | A ball raised by the Necromancer; never a Casualty | idem |
| Rout | Déroute (§6.7) | `rout_threshold` | An entity leaves when its Casualties reach its threshold | idem |
| Flee | Fuite (§6.7) | `Action::Flee` | A 1-turn Channel from the rim, replaces the Movement | idem |
| Attrition | Usure (§6.7) | `attrition` | Healing received drops from a set round | idem |
| Breach | Brèche (§6.7) | `Breach` | Rings of the board crack then turn to Chasm | idem |
| Ejector | Éjecteur (§6.10) | `ejector: true` | Keyword: the only abilities allowed to move a ball off the board | idem |
| Channel | Canalisation (§6.10) | `channel` | Broken when the channeling ball is pushed or moved | idem |
| Unmovable | Inamovible (§6.11) | `Keyword::Unmovable` | Nothing moves it; blocks a push like a Rock | idem |
| Unejectable | Inéjectable (§6.11) | `Keyword::Unejectable` | A push or effect that would eject it is illegal | idem |
| Weariness | Lassitude (§6.11) | `Weariness` | 2 turns (TUNE) without Unejectable after it ends | idem |
| Diminishing returns | Rendements décroissants (§6.11) | `ControlImmunity` | Immunity to a control category for 2 turns (TUNE) | idem |
| Hero | Héros (§6.6) | `UnitKind::Hero` | The world ball; source of abilities; dies when ejected | FINAL (D3, D4) |
| Fragment | Fragment (§6.9) | `UnitKind::Fragment` | A squad ball derived from the hero | FINAL (D3) |
| Squad | Escouade (§6.9) | `squad` | The hero's Fragments | FINAL (D3) |
| Lineage | Lignée (§2, §8) | `class` | A class | PROPOSAL (term) |
| Cooldown | Recharge (§6.3) | `cooldown` | Section 7.2 | PROPOSAL (term) |
| Chasm | Gouffre (§5.1) | `Terrain::Void` (existing `Board::void`) | An empty cell inside the board; a ball pushed in is ejected | idem |
| Paths | Voies (§9) | `paths` | The passive tree | idem |
| Keystone | Clé de voûte (§9) | `keystone` | idem | idem |
| Facets | Éclats (§9.1) | `facets` | The stat rows of the passive tree, renamed (5.3) | PROPOSAL |
| Beacon | Balise (§4.2) | `beacon` | Waypoint | idem |
| Momentum | Élan (§4.2) | `momentum` | Mount speed bonus | idem |
| Glow | Lueur (§13.1) | `glow` | Currency; the Healer lineage is renamed (5.3) | PROPOSAL |
| Slag-glass | Verre-scorie (§2) | none | Existing `world.md` term | FINAL (`world.md`) |

Statuses and terrain keep a one-to-one English name: Anchored, Stasis, Elusive, Rooted, Stunned,
Frozen, Silenced, Blinded, Taunt, Bleed, Poison, Burning, Heavy, Light, Marked, Shield, Wet, Charged,
Vitrified; Normal, Rock, Chasm, Ice, Mud, Thicket, Height, Slope, Lava, Water, Quicksand, Vent,
Sanctuary, Corruption, Crystal, Brambles. The Mage's "Brûlé" state is the Burning status (same thing,
one name), and the "Gelé" state is the Frozen status (PROPOSAL, G24).

### 5.3 Name collisions to resolve (PROPOSAL, all renames in English only)

| Collision (French) | Where | Proposed English names |
|---|---|---|
| Éclats: Fragments (glass shards of the hero), Éclats (passive stat rows), Éclats de verre (currency), lignée de l'Éclat (Assassin) | §6.9, §9.1, §13.1, §8.3 | Fragments; **Facets**; **Shards** (currency); Assassin = **Lineage of the Splinter** |
| Lueur: currency, Healer lineage, Fleur-lueur, Lucine keystone | §13.1, §8.4, §5.2, §9.2 | **Glow** (currency); Healer = **Lineage of the Lantern** (narrative proposal); Glowflower; Lucine |
| Hâte: stat and Chronomancer ability | §7.1, §8.7 | Haste (stat); ability **Quicken** |
| Décrépitude: Revenant decay and Necromancer ability | §8.6 | **Decay** (rule); ability **Wither** |
| Pente: terrain and Geomancer ability | §5.1, §8.8 | Slope (terrain); ability **Tilt** |
| Sables: Quicksand terrain and Geomancer ability | §5.1, §8.8 | Quicksand; ability **Sinkhole** |
| Séisme: Geomancer ultimate and Séisme du Lest (Guardian ultimate) | §8.8, §8.1 | **Fault Line** (Geomancer); **Ballast Quake** (Guardian) |
| Paradoxe: Chronomancer resource penalty and ultimate | §8.7 | Penalty **Overdraw**; ultimate **Paradox** |
| Gardien: class, Resolve keystone, Beacon keeper | §8.1, §9.2, §13.2 | **Guardian** (class); keystone **Warden**; **Beacon Keeper** |
| Coup de bouclier: Guardian ability and Resolve rune | §8.1, §9.2 | Ability **Shield Bash**; rune **Bulwark Strike** |
| Brèche (Breach) and Percée (Warrior) | §6.7, §8.2 | Breach; **Breakthrough** |
| Stase / Insaisissable: status and ability of the same name | §6.11, §8.7, §8.3 | Kept: an ability that only applies its status may share the name (rule written in the README) |

---

## 6. Game loops and time budgets (§3, §6.8)

**Implementation.** The README carries the loop table of §3 and one budget per fight format, in
rounds, so the bot ladder can check it without a clock (PROPOSAL, numbers TUNE):

| Format | Target time (§6.8, TUNE) | Target rounds, solo (TUNE) | Attrition from round (§6.7, TUNE) | Breach from round (§6.7, TUNE) |
|---|---|---|---|---|
| Skirmish | 2 to 4 min | 6 to 12 | 12 | 18 |
| Elite | 4 to 6 min | 10 to 18 | 20 | 30 |
| Dungeon room | 4 to 7 min | 10 to 20 | 20 | 30 |
| Boss, PvP, arena | 8 to 15 min | 20 to 40 | 20 | 30 (boss: enrage may move it earlier, §18) |

Assumption: 10 s (TUNE) per player turn and a near-instant AI turn. The ladder (`qa-balance`)
reports the median rounds per format; outside the band for two ladder runs in a row, the lead opens
a tuning issue.

**Dependencies.** `ai-engineer`, `qa-balance`, `encounter-boss-designer` (threat budgets drive fight
length).

**Tests.** None in code; a ladder report table in the R2 exit review (Task LGD-12).

**Risks.** The 10 s per turn assumption is unknown until R1 playtests; the R1 review measures it.

---

## 7. Abalone and RPG rules the lead arbitrates (§6)

Each subsection gives the rule text for `rules.md` §10.5 and `rpg/combat.md`. `combat-engineer`
implements; the scenarios of 9.3 are the acceptance tests.

### 7.1 Weighted push, exact definition (§6.4)

Inline Movement of a group `G` of `n` balls of entity `E` (side `S`) in direction `d`:

1. **Leading cell** `c0`: next to the front ball of `G` in `d`.
2. **Run** (PROPOSAL, G5): the maximal contiguous line of balls from `c0` in `d` whose side is not
   `S`. Balls of several hostile entities in a row form one run. Remains are not balls. If `c0` is
   empty, the Movement is a plain inline move (`rules.md` §4.1).
3. **Count**: `n > m`, or `n = m` when an active effect says so (Percée). `n` is at most 3, or 4
   during Avalanche (§8.2, deviation register).
4. **Weight of a ball** (PROPOSAL, G6): `clamp(class or monster Weight + item Weight (at most +1) +
   status changes + terrain (Mud +1), 1, 5)`. A "set to 5" effect (Titan) replaces the sum before
   the clamp.
5. **Weight of each side** (PROPOSAL): `W_push = Σ weight(G) + push bonuses` (Slope ±1, Bélier +2),
   floored at 1. `W_resist = Σ weight(run) + resist bonuses` (Roc inébranlable +2 when the hero is
   in the run). Group bonuses are added after the per-ball clamp, so they can go above 5 per ball.
   **Slope** counts on the cell of the group's front ball (PROPOSAL, G7): +1 if `d` is the slope
   direction, −1 if `d` is its opposite, 0 otherwise.
6. **Weight condition**: `W_push > W_resist`.
7. **Behind the run**, the cell after its last ball:
   - empty normal cell: run and group shift one step;
   - off the board or a Chasm: the last ball of the run is ejected (illegal if it is Unejectable;
     see Instant suspendu, G21);
   - a ball of side `S`, an allied ball of another entity, a Rock, or an Unmovable ball: illegal.
   - an Unmovable ball **inside** the run: illegal.
8. A broadside never pushes (FINAL, `rules.md` §4.2). A ball on Mud cannot be part of a broadside
   (§5.1).
9. **Errors**: `NotStrongEnough` (count, existing name kept), `TooLight` (new, Weight), `PushBlocked`
   (existing). The preview shows "2 against 1 · Weight 4 against 3" (§6.4).

**Invariant** (FINAL as proposed in §6.4): with every Weight 1 and no bonus, step 6 is `n > m`,
already required by step 3. Hence Weighted equals Classic (tests in 4.1).

### 7.2 Turn units, durations, cooldowns (§6.3)

Rule text (PROPOSAL, G8, G9):

- **Status duration "N turns"**: until the end of the N-th turn of the entity that bears it (§6.3, as
  written). "Until your next turn" (Ancrage, Insaisissable) is a second form: until the start of the
  caster's next turn. Data: `Duration::SubjectTurns(n)` or `Duration::UntilCasterTurn`.
- **Terrain created by an ability, "N turns"**: counted in the caster's turns, ends at the end of the
  caster's N-th turn (PROPOSAL; §6.3 gives no subject for terrain).
- **Ability tells** ("at the start of your next turn"): caster's turns.
- **Fight and biome clocks** (Attrition, Breach, Tide, enrage, Vent countdown, the no-Casualty draw):
  rounds. In solo with two entities, round `k` is the `k`-th turn of each entity, so §6.7's "turn 30
  of each entity" reads as round 30 with no change.
- **Quicksand**: subject's turns (it reads "starts its turn on").
- **Cooldown N** (G9): after use on own turn `t`, the ability is unavailable on own turns `t+1` to
  `t+N` and available again on turn `t+N+1` (the §6.3 definition wins). Implementation: on use, store
  `N+1`; at the start of each own turn, subtract 1; the ability is ready at 0. The HUD shows the stored
  value after the start-of-turn step, which equals the turns left. CD 0 then means once per turn, as
  written.

**Tests.** Scenarios R12 (Frozen 1 turn skips exactly one turn), R13 (CD 1 ability usable every other
turn, CD 0 once per turn), R14 (bonus Step capped at 1 per turn from two sources).

### 7.3 Ejection limits (§6.10)

Rule text: as §6.10, with three clarifications (PROPOSAL):

1. **Action** = one Movement, one ability, one consumable, one Flee, one Step, or one terrain effect
   from a single source. A Preparation that fires is its own action, so an opposing Movement that
   ejects one ball and triggers a Preparation that ejects another is legal (G10). Accepted because
   Preparations are public and limited to 2 armed (TUNE).
2. A non-Éjecteur forced move toward a Chasm or off the board stops on the last cell before it and
   deals a Shock (G11).
3. An ice slide inherits the action of the push that caused it: a Movement may eject (one ball in
   total), an ability without Éjecteur may not.

**Tests (LGD-11, property).** For every R2 action generated by the random fight driver, the number
of balls leaving the board in the effects is at most 1, unless every extra removal comes from a
terrain effect whose tell started at least 2 turns before.

### 7.4 Hero death and Edge danger (§6.6)

- **Hero death** (FINAL, D4): ejected or at 0 HP, the hero dies and its entity is defeated at once,
  checked after each atomic effect (§6.3).
- **Simultaneous defeat** (PROPOSAL, generalizes §6.3, G12): if one atomic effect leaves two sides
  with no entity, the side of the active entity loses.
- **Edge danger**: the lead accepts the UX definition (`ux-designer.md` A.1) as the rule text, with
  one change: the threat set grows with the content of each phase, never with a speculative
  sequence of two entities (FINAL as a principle, PROPOSAL as a set):
  - R1: every legal Movement of each opposing entity that plays before the hero's entity next turn;
  - R2: plus push modifiers and Éjecteur abilities that entity can pay and has off cooldown;
  - R2: `Will` for told terrain.
  It is computed for heroes only (PROPOSAL). The engine owns it (`combat-engineer`), the UI shows it.
- **Tests.** Scenario R10 (hero on the rim pushed off: hero dies, entity defeated, solo defeat),
  scenario R11 (Edge danger `Could` before that push, `None` after the hero steps inward).

### 7.5 Victory, draws, anti-stalling (§6.7, `rules.md` §9)

Rule text (PROPOSAL):

- The classic rules of `rules.md` §9 stay as they are for every classic mode (Mess tables).
- RPG fights: threefold repetition is a draw (FINAL as in `rules.md` §9, the identity covers the full
  hashed state, §24.1).
- **No-Casualty draw**: 40 rounds (TUNE) without a Casualty (G14). Reason: §6.7's "60 entity turns"
  is 30 rounds in solo, the same round as the Breach (round 30): the draw would fire before the
  Breach can force a Casualty, and in a party of 4 (8 entities) it would fire after 7.5 rounds.
- A draw in a skirmish: both sides retreat, no XP (§6.7). A draw against a boss is a loss (FINAL,
  existing).
- A boss entity has no rout threshold; the fight is won when the Heart dies (ruling A3).

### 7.6 Damage modifiers and the Hero Guard (§6.5)

Order of resolution (PROPOSAL, G15, G16), one place in `abalone-rpg` (`combat-engineer`):

1. `raw = (Base + Ratio × Stat)` then `× K / (K + Defense)` as §6.5.
2. `× (1 + Σbonus)` where `Σbonus` adds every "+X %" or "−X %" of damage dealt or taken (Isolation,
   Formation, level gap, Marked, Height, Thicket, Wet, Opportuniste, runes). `Σbonus` is clamped to
   **−90 % .. +300 %** (TUNE) so a stack of reductions never reaches 0 or below.
3. Multipliers in a fixed order: reactions (Bris ×1.5), then halving effects (Water on Shock, Martyr),
   then damage sharing (Lien vital), each floored.
4. `max(1, ...)` (§6.5).
5. **Hero Guard**: a hero loses at most 35 % (TUNE) of its max HP to **one action** (all hits of one
   ability, or all Shocks of one Movement) (PROPOSAL; §6.5 says "one ability", G16). Damage over time
   ticks are separate sources.
6. Shield absorbs, then HP.

**Tests.** Unit tests per step (`combat-engineer`); scenarios R15 (Isolation +25 %) and R16
(Formation −30 % cap) for `rules.md`.

---

## 8. Universe coherence (§2)

`narrative-quest-designer` owns the lore. The lead checks three things in every RPG docs PR
(review checklist LGD-04): the science-fantasy frame stays on the existing lore (D1), no new free
chat or alliance channel contradicts pillar 5, and every new player-visible meaning has a glyph as
well as a colour (`world.md` §5 and §8). The lead backs the narrative proposals that keep the
glossary clean (Lantern for the Healer lineage, ruling A8).

---

## 9. Spec deltas (§0, "Fichiers critiques")

### 9.1 `SPEC.md`

- §1: keep the pitch, add one paragraph: Hollow terraformed by slag-glass, the Ballast stranded,
  the hero and its lineage, Abalone as the combat system (narrative text from
  `narrative-quest-designer`). Open question §26 Q1 (name) stays open.
- §4: add "Phase R: RPG open world" with a pointer to `rpg/roadmap.md`. Phase 5 (hub as a graph of
  rooms) is marked superseded by R4 and #50 gets the Decision link (§0 item 4).
- §6: "accounts and ranking" stays out of scope; the unverified local rating of §19 needs its own
  Decision (§19).

### 9.2 `game-design.md`

- §1: replaced by "See `rpg/README.md` for the pillars. The classic modes keep pillars 1 to 5 of the
  earlier version, quoted below" (the old text is kept for the Mess tables).
- §3.5: the hub becomes the Ballast of §21, the classic modes live in the Mess.
- §4: "No health, no levels, no buffs" stays true for the classic modes only.

### 9.3 `rules.md`

- §5: one line: "In RPG fights a second condition applies, see 10.5."
- §10 intro: the text of 4.1.
- New §10.5 "RPG combat": the rules of section 7 and the examples below, numbered `R1`, `R2`, ...
  so they never clash with the classic `Example 1` to `Example 40`. Coordinates use the radius 4
  board; only the balls listed exist; Weight is written `w`.

| Id | Given | When | Then |
|---|---|---|---|
| R1 | Warrior hero `(-1,0)` w3; enemy Fragment `(0,0)` w1 | `(-1,0)>E` | Illegal `NotStrongEnough` (1 is not more than 1) |
| R2 | Warrior hero `(-1,0)` w3, own Fragment `(-2,0)` w1; enemy Guardian hero `(0,0)` w3 | `(-2,0)(-1,0)>E` | Legal (2 > 1, 4 > 3). Guardian at `(1,0)`, takes the Shock |
| R3 | Own Fragments `(-2,0)(-1,0)` w1 each; enemy Guardian hero `(0,0)` w3 | `(-2,0)(-1,0)>E` | Illegal `TooLight` (2 is not more than 3) |
| R4 | Own Fragments `(-3,0)(-2,0)(-1,0)`; enemy Fragments `(0,0)(1,0)`, `(2,0)` empty | `(-3,0)(-2,0)(-1,0)>E` | Legal, as in classic Abalone |
| R5 | Own Fragments `(-3,0)(-2,0)(-1,0)`; enemy Warrior hero `(0,0)` w3 on Mud | `(-3,0)(-2,0)(-1,0)>E` | Illegal `TooLight` (3 is not more than 4) |
| R6 | Warrior hero `(-1,0)` w3 with Percée active, own Fragment `(-2,0)`; enemy Fragments `(0,0)(1,0)` | `(-2,0)(-1,0)>E` | Legal at 2 against 2 (Weight 4 > 2) |
| R7 | Every Weight 1, classic Example 17 position | The classic move | Same result as classic Example 17 |
| R8 | Ice on a line of cells up to the rim; a Movement pushes a run of two balls onto it (exact layout written in LGD-02) | The run slides toward the rim | The front ball is ejected, the next one stops on the rim cell (one ejection per action) |
| R9 | Stitched boards of two tiles (§4.6) | A push across the seam | Legal, same as on one board |
| R10 | Enemy Mage hero `(4,0)` w1 on the rim; Brute `(2,0)` w2 and monster `(3,0)` w1 | `(2,0)(3,0)>E` | Hero ejected, hero dies, player entity defeated, solo fight lost |
| R11 | Position of R10 before the push, pack to play next | Edge danger is computed | Hero flag `Could`. Same position with the hero at `(0,0)` instead: `None` |
| R12 | Enemy Frozen for 1 turn | Rounds go on | The frozen entity skips exactly one turn |
| R13 | Fendoir CD 1 used on turn 1 | Turns 2 and 3 | Unavailable on turn 2, available on turn 3 |
| R14 | Two bonus Step sources in one turn | Second bonus Step | Refused |
| R15 | Ball with no adjacent ally | Takes a hit | +25 % damage |
| R16 | Ball with 4 adjacent allies | Takes a hit | −30 % damage (cap) |
| R17 | Necromancer raises a Graveyard entry, the Revenant dies | Raise the same entry again | Refused; the Revenant's death is not a Casualty |
| R18 | Hero on the rim, no adjacent enemy, starts Flee | It is pushed before its next turn | Flee interrupted |

(R8 and R9 need the terrain layer and the stitched mask; their exact layout is written in LGD-02 with
`combat-engineer`. All rows PROPOSAL until #313 closes.)

---

## 10. Roadmap coherence (§25)

### 10.1 Phase exit criteria

The lead writes `rpg/roadmap.md` from §25 and adds, for each phase, the rule that a phase closes only
when its exit criterion is shown in a PR and the previous phase is closed (`SPEC.md` §4: "a phase
starts only when the previous one is playable"). The lead runs a short exit review per phase (a
docs PR with the ladder table and the playtest notes, Task LGD-12 for R1 and R2).

### 10.2 R1 content (arbitration, PROPOSAL, G17)

§25 asks for "a level 1 Warrior with 2 abilities", but §8.0, §10 and §11 unlock the first ability at
level 5 and the second at level 10, and progression arrives in R3. Ruling: R1 uses a **test hero
template** (Warrior, level 1 stats, Weight 3) whose two abilities are granted by the fight data, not
by progression. The two abilities: **Fendoir** (Action, damage, Isolation bonus) and **Percée**
(Quick, the equal-count push, which tests the weighted push the most). Isolation and Formation join R1
because Fendoir reads Isolation and the tutorial teaches both (§11). Monsters: Brute and Rôdeur, as
`encounter-boss-designer` T2 proposes.

### 10.3 Dependencies and risks

All roles; the risk is phase creep (R2 content slipping into R1). The R1 content list above is closed:
anything else goes to R2.

---

## 11. Arbitration register (cross-role rulings, PROPOSAL until an owner confirms on #313)

| # | Question | Raised by | Ruling |
|---|---|---|---|
| A1 | Edge danger scope | UX F1, Q2 | UX A.1 accepted with the phase sets of 7.4; heroes only |
| A2 | Undo and end of turn | UX Q1, Q9, F10 | Each confirmed action commits (no undo inside a turn, signed log). The turn ends on End turn, or by itself when the Movement is played or impossible and both other slots are spent or impossible. End turn is refused while a legal Movement is unplayed (zugzwang, §6.3) |
| A3 | Boss victory | Encounter F7, Q1 | No rout for a boss entity; the fight is won on the Heart's death; shell link as proposed by `encounter-boss-designer` |
| A4 | Tutorial teaches hero death and Weight | Narrative F3, UX F11 | Yes: a lesson "Edge danger" and the Weight pips before level 5 |
| A5 | Intent timing | Encounter F18, UX F5 | Committed at the end of the monster's turn; if the target is gone, the same ability retargets by the fixed order (§6.10), else it fizzles. Both shown in the preview |
| A6 | Tell and timer units | UX F4 | Section 7.2 |
| A7 | Hint and evaluation bar in RPG fights | UX F18 | Hidden in every RPG fight until the search knows abilities (#163) |
| A8 | Lueur naming | Narrative F27 | Glow (currency), Lantern (Healer lineage), section 5.3 |
| A9 | Story end and Tally raid | Narrative F4, Encounter F11, Q3 | The main quest ends on a solo Tally fight ("Le Registre"); the 4-player raid is endgame content (pillar 5) |
| A10 | Role slugs | All role files | Section 2.2 |
| A11 | Data format | Encounter Q12, Narrative Q13 | `tech-lead` decides; the lead's preference is RON for hand-written content (comments allowed) |
| A12 | Monster level in a party | Encounter F6, Q9 | Tile level as in solo, raised to the party's lowest level minus 5 (TUNE) so no pack is grey for the whole party; owner confirms |

---

## 12. Feedback on the gameplay spec

Contradictions and gaps seen from the coherence seat. The gameplay spec is not modified; an owner
decides. Items already raised by another role are listed once, with the reference.

- **G1. Conflict list incomplete ("Contexte").** Missing: `rules.md` §9 (100 plies replaced by
  §6.7), `game-design.md` §3.3 (phases on marble counts, changed by §18), `game-design.md` §5
  (anti-stalling identity), `world.md` §1 to §3 (narrative F6 to F9), `SPEC.md` §2 ("modes never fork
  the engine": the new crates must be shown not to fork the push).
- **G2. Group size (§1 pillar 1, §6.4 vs §8.2).** "On reste à 3 boules par groupe" and "seules
  Percée et Avalanche poussent à nombre égal", but Avalanche is a 4-ball group, not an equal-count
  push, and Écrasement "pushes" against an obstacle. The pillar text must name the deviation register.
- **G3. `rules.md` §10 intro** ("a mode never changes a move or a push") is contradicted by terrain
  (Ice, Mud) and statuses as well as by Weight; the conflict list names only Weight.
- **G4. §0 PR 1 too big.** Four files from three roles in one PR breaks CONTRIBUTING rule 17; split
  proposed in 3.4.
- **G5. "Run" undefined with several entities (§6.4, §6.2).** Condition 3 says "une boule de son
  camp" (whose side?). Mixed runs of two hostile entities and neutral balls (escort NPC, §6.7) are not
  covered. Proposal in 7.1 step 2.
- **G6. Weight clamp order (§6.4, §6.11, §7.1, §9.2).** "Borné entre 1 et 5" is written for
  Heavy/Light only; Mud, Titan (set to 5), Bourreau du bord (+2), Roc inébranlable (+2 to resist),
  item +1, Massif +1 do not say whether they clamp per ball or per group.
- **G7. Slope cell (§5.1).** "Une poussée dans le sens de la pente" does not say which cell's slope
  counts (front ball, leading cell, every ball).
- **G8. Duration subjects (§6.3).** Status durations count in the bearer's turns, but terrain from an
  ability ("Mur de boucliers 2 tours", "Sol verglacé 3 tours"), tells ("au début de ton tour
  suivant") and biome timers ("tous les 6 tours", Tide) have no stated clock; in a party the gap
  between "next turn" readings is up to 7 entity turns.
- **G9. Cooldown mechanism vs definition (§6.3).** "Recharges baissent de 1 au début du tour" plus
  "set to N on use" makes a CD 1 ability available on the very next turn, while the definition says
  "indisponible pendant tes N prochains tours". Proposal in 7.2.
- **G10. Preparations and the one-ejection rule (§6.3, §6.10).** A Movement that ejects and triggers a
  Preparation that ejects gives two ejections in one opposing action window. Not stated whether
  allowed.
- **G11. Chasm vs the golden rule (§6.10 rule 3, §5.1).** "Stops on the last cell of the board" does
  not cover a Chasm inside the board.
- **G12. Simultaneous death beyond 1v1 (§6.3).** Defined for "les deux héros d'un 1 contre 1" only.
- **G13. Hero HP on boss retry (§6.12 vs §4.2).** HP persists between fights, but the retry "same
  seed in under 5 s" does not say whether HP is full. Proposal: full.
- **G14. No-Casualty draw vs Breach (§6.7).** "60 tours d'entité" equals 30 rounds in solo, the round
  the Breach starts (30), so the draw can fire first; in a party of 4 it is 7.5 rounds. Proposal in
  7.5 (40 rounds, counted in rounds).
- **G15. Σbonus floor (§6.5).** Thicket −50 % plus Formation −30 % plus a level gap −25 % gives
  `1 + Σbonus` below 0, so every hit deals 1. Multipliers (Bris ×1.5, Water ÷2, Martyr −50 %, Lien
  vital 50/50) are not placed relative to Σbonus.
- **G16. Hero Guard scope (§6.5, §8.3).** "Une seule capacité" leaves out the Shock of a Movement
  (Élan +50 %, Titan +100 %, Avalanche ×2), multi-hit abilities, and redirections (Interposition,
  Martyr, Lien vital). Proposal: per action.
- **G17. R1 hero level (§25 vs §8.0, §10, §11).** R1 asks for a level 1 Warrior with 2 abilities;
  levels 1 to 4 have no ability and the 2nd comes at level 10. Ruling in 10.2.
- **G18. Pillar 2 vs instant abilities and Éjecteur ultimates without a tell** (UX F2): Séisme du Lest
  and Avalanche eject with no tell. The pillar needs the rewording of 4.2.
- **G19. Quicksand ejection (§5.1 vs §6.10 rule 2).** Quicksand ejects a ball after 2 turns with a
  1-turn tell, and can take several balls at the same time, which rule 2 reserves for tells of 2 turns
  or more. On a hero it is a death from a 1-turn tell. Proposal: Quicksand ejection is a terrain effect
  with a 2-turn tell (the countdown starts when the ball enters), or it roots and damages instead.
- **G20. Flee from the rim (§6.7 vs §6.6).** Fleeing needs the hero on the rim for a full opposing
  turn while channeling: the most lethal spot for a hero whose ejection is death. The rule reads as a
  trap; playtest it in R4 before keeping the rim condition.
- **G21. Instant suspendu (§8.7).** "La poussée échoue" after `legal_moves` said it was legal: is the
  opposing Movement spent, does the run shift without the last ball, does the preview show it? Needed
  before Edge danger (it changes `Could`).
- **G22. Weight 1 heroes (§8.0, §6.4, §6.6).** Assassin, Mage and Chronomancer heroes weigh 1, like a
  Fragment: any pair pushes them. With hero ejection as death, the three ★★★ and ★★ classes carry the
  biggest risk, and tanks (Weight 3) cannot be pushed by three Weight 1 monsters (encounter F21). Not a
  contradiction; the R2 ladder must measure hero death causes per class (§26 Q10).
- **G23. Lest vs temporary Weight (§7.1).** "Chaque point de Poids au-dessus de la base retire 3 VIT":
  do Mud, Titan or Bourreau du bord lower VIT mid-fight, and so the turn order? Proposal: items only.
- **G24. Element states vs statuses (§8.5, §6.11).** "Brûlé" (state) and "Brûlure" (damage over
  time), "Gelé" (state) and Gelé (status) are used as if equal; "Chargé" exists only as a state. The
  glossary needs one name per thing (5.2).
- **G25. Name collisions** (§5.3 of this file): Éclats ×4, Lueur ×4, Hâte, Décrépitude, Pente,
  Sables, Séisme, Paradoxe, Gardien, Coup de bouclier.
- **G26. Pionnier in normalized PvP (§9.2 vs §4.5, §19).** Changing 2 cells on one's own side breaks
  the point-symmetric PvP start that §4.5 requires.
- **G27. Glossary incomplete (§6.0).** Weight, Shock, Isolation, Formation, Guard, Remains,
  Graveyard, Revenant, Rout, Flee, Channel, Ejector, Unmovable, Unejectable, Weariness, Cooldown,
  bonus Step are used as defined terms but are not in §6.0 (completed in 5.2).
- **G28. "No difficulty slider" dropped (§1 vs `game-design.md` §1).** The revised pillar 3 silently
  drops it while §23 adds world tiers (§26 Q9).
- **G29. Perft invariant has no baseline.** §6.4 asks for "même perft", but the engine has no perft
  today (section 1); the invariant needs a pinned classic count first.
- **G30. "Abalone classique" order of scan (§24.1).** The RPG fixes "r then q"; the classic engine
  scans "q then r". Both are fine, but the spec must say the classic order is not changed.

---

## 13. Open questions

- O1. Are the canonical role slugs of 2.2 accepted, and do the existing role files rename theirs?
- O2. Is the pillar 2 rewording of 4.2 accepted (resources and cooldowns as the tell of instant
  abilities)?
- O3. Weight: per-ball clamp, then group bonuses above 5 (7.1)?
- O4. Hero Guard per action, Shock included (7.6, G16)?
- O5. No-Casualty draw at 40 rounds, counted in rounds (7.5, G14)?
- O6. World tiers: unlocked content only, or a free selector once unlocked (§26 Q9, G28)?
- O7. Quicksand: 2-turn tell, or no ejection at all (G19)?
- O8. R1 test hero with Fendoir and Percée, Isolation and Formation in R1 (10.2)?
- O9. RON or JSON for the scenario files and content (`tech-lead`)?
- O10. Name collisions: are the English renames of 5.3 accepted?
- O11. Two Preparation ejections in one opposing action window: allowed (G10)?
- O12. Split of docs PR 1 into three PRs (3.4)?

---

## 14. Tasks (one PR each)

Phases from §25. Every code Task: strict TDD (test commit first), 100 % line and region coverage,
`scripts/verify.sh` green, one e2e run when a player sees it, screenshot in the PR when the UI changes
(CONTRIBUTING 6.4). A Task waits for the Tasks it depends on to be merged. Docs Tasks are merged by
@TidyMaze (docs-only PRs).

| # | Phase | Title | Outcome (one sentence) | Done checklist |
|---|---|---|---|---|
| LGD-01 | R0 | Spec: `rpg/README.md` (index, locked decisions, pillars, glossary, loops, numbers index, role map) | The RPG spec folder has one entry page that every other RPG file and role follows. | Sections 2.2, 4, 5, 6 of this file as spec text; deviation register; hidden-information list; every number tagged; conflict additions (G1) posted on #313; owner review |
| LGD-02 | R0 | Spec: `rules.md` §5 note, §10 intro and §10.5 "RPG combat" | `rules.md` holds the RPG combat rules and the examples R1 to R18 with coordinates. | Section 7 rules text; examples R1 to R18 written in full (R8, R9 with `combat-engineer`); `rules.md` §11 numbers index updated; G5 to G16 answered or listed as OPEN-n |
| LGD-03 | R0 | Spec deltas: `SPEC.md` §1, §4, §6 and `game-design.md` §1, §3.5, §4 | The top-level specs point to the RPG pivot without losing the classic modes. | Section 9.1 and 9.2 applied; classic pillars quoted for the Mess; #50, #6 linked to the Decision in the PR body (comment done by the lead agent) |
| LGD-04 | R0 | Spec: `rpg/roadmap.md` and the RPG review checklist | The roadmap lists R0 to R10 with exit criteria and a review checklist every RPG docs PR follows. | §25 table with exit rules (10.1); R1 content closed (10.2); checklist: glossary terms, tags, glyph plus colour, pillar 5, deviation register |
| LGD-05 | R1 | Classic perft baseline in `abalone-core` | `perft(board, player, depth)` exists and the standard and Belgian daisy counts are pinned. | Pure `perft` fn with unit tests; pinned counts at depths 1 to 3 (depth 3 in a release-only test if slow); counts cross-checked against a published source when one exists, else noted as engine-pinned; coverage 100 % |
| LGD-10 | R1 | Exhaustive push predicate test vs classic | The weighted predicate equals the classic one for all counts when every Weight is 1. | If not already in `combat-engineer`'s PR: exhaustive `n` 1..=4, `m` 0..=3 test; `equal_count` cases; no production code change |
| LGD-06 | R1 | Classic equivalence suite for the weighted push | Weighted with every Weight 1 is proven equal to Classic on perft, random positions and random games. | Needs `combat-engineer`'s push predicate and RPG Movement path merged; perft equality depth 1 to 3; 1 000 random positions; 200 random games with equal outcome and board hash; seeds pinned |
| LGD-07 | R1 | Scenario runner and doc sync for `rules.md` §10.5 | Every `rules.md` RPG example is a data file run by one test, and doc and tests cannot drift. | `tests/scenarios.rs` runner; schema of 4.4; R1 to R7, R10 to R13 as files; doc sync test on ids; failing-scenario message names the id |
| LGD-08 | R1 | Constants registry with tags | Every rules number lives once in `data/rules/constants.ron` with its tag, and FINAL values are pinned. | Loader and integrity test (unique ids, tag present); FINAL pin test (party 4, group 3, Weight 1 to 5, 1 ejection per action, tell 2 for multi-removal); README numbers index generated or checked against it |
| LGD-12 | R1 | R1 exit review (docs) | The R1 phase closes with a written check of its exit criteria and the first measured turn time. | Exit criteria of §25 R1 ticked with links; median seconds per player turn from 5 playtests; median rounds per skirmish from the ladder; tuning issues opened for out-of-band values |
| LGD-09 | R2 | Glossary and naming lint | Code enums, content names and the README glossary stay in sync with no name collision. | Enum variants of `Status`, `Keyword`, `Terrain`, `Slot` found in the README glossary; no two content ids or display keys equal; every `bends_push` ability in the deviation register |
| LGD-11 | R2 | Design invariants property suite | Random R2 fights never break the locked decisions. | Seeded random fight driver (from `ai-engineer` or `combat-engineer`); at most 1 ejection per action except 2-turn-told terrain; hero ejected implies entity defeated; hero Guard cap per action; same log same hash; 200 fights (TUNE) |
| LGD-13 | R3 | Skill-over-stats benchmark on the ladder | A stronger bot with a 5-level handicap wins at least half of the reference skirmishes, or a tuning issue is open. | Ladder entry defined with `qa-balance`; 100 seeded fights; result table in the PR; threshold values tagged TUNE |
| LGD-14 | R4 | Mess non-regression e2e | The classic hot-seat game and a classic boss start from the Mess and play as before the pivot. | Playwright e2e from the hub Mess: scripted classic game reaches the same end as the existing hot-seat e2e; classic boss menu opens; screenshot |

Task ids are stable references used in the text above; the table is sorted by phase, so ids are
not in numeric order.
