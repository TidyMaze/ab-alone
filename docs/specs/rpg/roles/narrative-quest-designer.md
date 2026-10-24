# RPG implementation spec: narrative and quest design

Status: role draft v0, by the narrative-quest-designer, for the RPG pivot (Decision #313, still open).
Spec only, no code. Source of truth: the validated gameplay plan (`docs/specs/rpg/plan.fr.md`, the
French plan, cited below as "§N"). This file never overrides it: where the plan is silent or
contradicts itself, the point goes to "Feedback on the gameplay spec" and a PROPOSAL fills the gap.

**Tags.** Every number carries **FINAL** (decided), **TUNE** (start value, playtest decides) or
**PROPOSAL** (proposed here, an owner confirms). A number quoted from the plan keeps the plan's tag:
everything in the plan is TUNE unless it says FINAL. Section numbers, ids, example coordinates and
issue numbers are references, not tuning numbers, and carry no tag.

**Role slugs used for dependencies** (assumed names, the lead agent maps them to the real roles):
`combat-engine` (abalone-rpg crate, effects, encounters), `class-designer` (classes, abilities),
`progression-talents` (XP, levels, trees, hero save), `world-generation` (abalone-world map, tiles,
discovery, events, Beacons), `items-loot` (items, loot rolls, inventory), `economy-merchants` (gold,
currencies, vendors), `gathering-crafting`, `dungeons-bosses`, `pvp-br`, `network-p2p`
(party channel, signed logs), `client-ui` (windows, HUD, map, Three.js), `art-audio`, `data-tools`
(data folder, loader, integrity test harness), `qa-balance` (bot ladder, sims).

## Contents

1. Scope
2. Inputs read
3. Lore: setting delta, Tally, lineages, factions (§2, §8, §13.5, §17, §18, §21)
4. Quest engine (§16, §24.2, §24.3)
5. Quest types and content plan (§16, §15.5, §17, §22)
6. Quest rewards and the XP share (§11, §16)
7. Journal, tracker, map markers, Tally notices (§16, §24.5, `world.md` §6)
8. Party quests (§16 "En groupe", §4.7, §6.2)
9. Daily, weekly contracts and bounties (§16, §21)
10. Puzzles (Énigme) (§4.3, §16, §22)
11. World events, exploration, secrets: the quest side (§22, §16)
12. Factions and reputation (§13.1, §13.5, §11)
13. Codex (§22, §21, §23)
14. Titles (§16, §13.5, §23)
15. Tutorial, levels 1 to 4 (§11)
16. Lineage trial and class quests (§11, §16, §8)
17. Text, tone and localisation (§2, §16, §26 Q5)
18. Save data (§16, §24.2, §24.5)
19. Feedback on the gameplay spec
20. Open questions
21. Tasks

---

## 1. Scope

In scope (this role owns the design, the data and the pure logic):
- The lore delta: what slag-glass is now, the lineages, Tally's arc, the Colony and the factions, the
  boss lore hooks moved to the dungeons.
- Quests: types, data format, the state machine, objectives, rewards (the quest side only), the
  journal, the tracker, map markers, sharing in a party.
- Daily and weekly contracts, bounties, puzzles, the quest side of world events and exploration.
- Factions and reputation ranks.
- The Codex and titles.
- The tutorial (levels 1 to 4) and the lineage trial (level 5), plus class quest chains.
- Text: Tally lines, NPC lines, quest text, length budgets, string keys.

Out of scope (dependencies only): combat rules and encounter execution (`combat-engine`), XP curve
and talent validation (`progression-talents`), map, discovery and event spawning
(`world-generation`), item rolls and inventory (`items-loot`), prices and vendors
(`economy-merchants`), boss design (`dungeons-bosses`), rendering and windows (`client-ui`),
networking (`network-p2p`).

## 2. Inputs read

- The gameplay plan, all of it, with a focus on §2, §3, §4.3, §4.7, §5.2, §6.2, §6.6, §6.7, §6.12,
  §8 (lineage headers), §10, §11, §13, §15.5, §16, §17, §18, §21, §22, §23, §24, §25, §26.
- `SPEC.md` (§1 pitch, §4 phase 5, §6 scope), `CONTRIBUTING.md` (§5, §6.4, §11, §13).
- `docs/specs/world.md` (all: setting, lore, boss slots, lore delivery, HUD rules, accessibility),
  `docs/specs/game-design.md` (§1 pillars, §3.5 hub, §4 progression and codex, §7 bosses, §7.6
  daily seed), `docs/specs/rules.md` §10, `docs/specs/tech.md` §8 (persistence, save format),
  `docs/specs/art.md` (text assets row), `docs/specs/ui.md` (end banner lines),
  `docs/specs/boss-balance.md` §1.
- Code: `client/src/daily.ts` (`utcDay`, `hash32`, the UTC seed), `client/src/endbanner.ts` (Tally's
  end lines), `client/src/savegame.ts` and `idb.ts` (versioned save, `KeyStore`),
  `crates/abalone-core/src/encounter.rs`, `encounter/fixture.rs` (the text format of a recorded
  game), `encounter/telemetry.rs` (attempt records), `search.rs` (node-budget search),
  `crates/abalone-wasm/src/lib.rs` (`boss_ids`, JSON-free bridge today). `abalone-core` has no
  dependency at all today.
- Issues: #313 (the Decision), #20 (lore terminals), #21 (audio logs), #294 (Tally start line),
  #50 and #6 (hub).

---

## 3. Lore: setting delta, Tally, lineages, factions

### 3.1 Setting delta (§2, delta of `world.md` §1 to §3)

What changes, written as facts for `world.md` (the update itself is in PR 3 or 4 of §0):

| Fact | `world.md` today | RPG (PROPOSAL wording, content from §2) |
|---|---|---|
| Where the ship is | Drifting over Hollow | Stranded on the surface; its decks are the hub (§21) |
| Hollow | Dead moon, no atmosphere | Terraformed by the glass in pockets: vitrified craters, petrified forests, salt seas (the 10 zones, §5.2) |
| Slag-glass | Fuses to anything warm, shells the crew | Also **remembers** what it touched; a survivor who stays clear can draw on one memory: a lineage (§2) |
| The player | The Tally-holder, nameless, alone | Still the Tally-holder, still nameless and voiceless; now carries a lineage. "The last glass still clear" (§2) |
| Survivors | None, only shells | The Colony: half-vitrified miners who were here before the Ballast (§2) |
| Tally | Counts, wants the books to balance, final boss | Gives the main quest, then is the final raid (§2, §17) |

Reconciling "shelled crew" with "glass gives powers" (PROPOSAL): slag-glass takes **everything** from
a body it fully covers (a shell: no will, only the habit of pushing), and gives **one memory** to a
body it only touches (a clear glass). A lineage is that one memory. A Fragment (§6.9) is a chip of
the hero's own clear glass, which is why it shares the hero's stats and dies with the fight.

Why the hero is clear (PROPOSAL, keeps `world.md` §2): the visor glass of the cargo suit is the
first piece of slag-glass that touched the player, and it holds the memory of the lineage. It is
also the ledger token: Tally reads it.

### 3.2 Tally's arc (§2, §16, §17)

Tally stays the ledger mind: flat, short, never explains itself (`world.md` §2, §4). The main quest
is an **audit**: Tally lists five "seats" (the senior crew) that were never struck from the books.
Each seat is a boss. When the five are struck, Tally opens the Bridge, and the twist lands: to
balance the books, the last clear asset must be converted too. The raid on Tally's Bridge (§17) is
the closing entry.

The five seats (PROPOSAL, see feedback F4: the plan says "the 5 existing bosses", but the fifth
existing boss is Tally itself):

| Seat | Boss | Dungeon (§17) | Level (§17, TUNE) | Lore hook (PROPOSAL) |
|---|---|---|---|---|
| 1 | The Echo | The Ballast Holds | 8 | The last card-player of the mess, who hid below decks; still answers every move with its mirror |
| 2 | The Hull | The Starglass Mine | 38 | The loadmaster, fused to the frame of the mine lift he guarded; the shaft falls apart as he fails |
| 3 | The Choir | The Singing Furnace | 50 | The furnace shift, three voices, who walked into the caldera to keep the heat |
| 4 | The Chaplain | The Glass Chapel | 65 | The chaplain, who built a shrine at the heart of the vein and calls the shell grace |
| 5 | The Abyss Walker (new boss, §17) | The Ballast Pit | 80 | **The captain**, who "stopped answering" (`world.md` §2): he walked down into the Well |
| Closing entry | The Ballast Mind (Tally) | Tally's Bridge (raid) | 95 to 100 | Tally itself |

The two other new bosses (the Weaver Queen, level 15, TUNE; the Drowned Counter, level 22, TUNE) are
zone-chain finales of zones 2 and 3, not seats. The Drowned Counter keeps a ledger of its own: it is
where the player first reads that Tally counts the colonists as "assets" (the foreshadowing).

Tally line examples (style guide in 17.2):
- Prologue: "Line 1: one survivor, clear. Unaccounted."
- Seat struck: "Line 212: seat two struck. Four remain open."
- Foreshadowing: "Line 640: colonists carried as assets."
- Twist: "Closing entry: one clear asset. Convert."

### 3.3 Lineages (§2, §8)

One lineage per class, data in `data/lineages.ron` (format in 4.2). English names (PROPOSAL; French
names from §8 in brackets):

| Class | Lineage | Memory (§2, §8) | One-line origin (§8, translated) | Mentor NPC (PROPOSAL) |
|---|---|---|---|---|
| Guardian | Anchor (Ancre) | The ship's ballast | The glass fused with the ship's ballast | Bosun Hask, Ballast Hold |
| Warrior | Ram (Bélier) | The rock face | The miners of the cutting face | Foreman Ilse, Lumen camp |
| Assassin | Shard (Éclat) | The cutting edge | Sharp glass | "Nobody", Ash Grove |
| Healer | Lantern (Lueur) | Inner light | The light inside | Sister Oda, Ballast Chapel |
| Mage | Furnace (Fournaise) | Heat | The glass remembers heat | Smelter Varo, Furnace deck |
| Necromancer | Ossuary (Ossuaire) | The dead | The glass remembers the dead | The Gravekeeper, Soot Bogs |
| Chronomancer | Hourglass (Sablier) | Time | The glass remembers time | Clockwright Pell, Glass Dunes |
| Geomancer | Stratum (Strate) | Rock | The glass remembers rock | Surveyor Bram, Iron Ridges |
| v2 Puppeteer | Thread (Fil) | (v2) | (v2) | (v2) |

The Healer's lineage is "Lantern" in English and not "Glow", because Lueur is also a currency and a
resource (feedback F27).

### 3.4 Factions (§13.5)

| Faction (English, PROPOSAL) | French (§13.5) | Theme (§13.5) | Home (PROPOSAL) |
|---|---|---|---|
| The Colony | La Colonie | Crafting | Every outpost; quartermaster in the Hold |
| The Quiet Vitrified | Les Vitrifiés pacifiques | Lore, gathering | Vitrified Lands outposts |
| The Order of the Ledger | L'Ordre du Registre | Dailies, dungeons | The Bridge antechamber |
| The Ballast Strippers | Les Pilleurs de lest | PvP, battle royale | The Launch Bay |

The Order of the Ledger serves the ledger, not Tally (PROPOSAL): after the twist its dailies stay, its
lines change ("The books outlive their keeper."). No faction is opposed to another in v1 (PROPOSAL,
KISS; feedback F12).

### 3.5 Implementation of the lore

Lore is data and text, never code paths:
- `data/lineages.ron`, `data/factions.ron`, `data/npcs.ron`, `data/text/en/*.ron` (section 17).
- The `world.md` delta (3.1, 3.2 table, boss hooks) lands in the R0 docs PR that updates `world.md`.

**Dependencies.** `game-director` or the owner who writes the R0 docs PRs (world.md update);
`dungeons-bosses` (the Abyss Walker is the captain; seat order = dungeon levels); `class-designer`
(lineage names match class ids); `art-audio` (faction looks, NPC marbles).

**Tests.** Integrity tests (section 4.7): every class id has exactly one lineage; every lineage
mentor is an NPC; every faction has a home NPC.

**Risks.** The "alone" premise against a party of 4 and a Colony (feedback F7). The seat list
depends on F4.

---

## 4. Quest engine (§16, §24.2, §24.3)

### 4.1 Where it lives

- Crate `abalone-world` (§24.2), module `quest/`:
  - `quest/def.rs`: data types (`QuestDef`, `Step`, `Objective`, `Reward`, `Prereq`).
  - `quest/log.rs`: the per-hero state `QuestLog` and the pure transitions.
  - `quest/event.rs`: `WorldEvent`, the one input type.
  - `quest/contracts.rs`: dailies, weeklies, bounties (section 9).
  - `quest/markers.rs`: map markers (section 7.3).
- Data: `data/quests/<zone>.ron` (one file per zone), `data/quests/main.ron`,
  `data/quests/class.ron`, `data/quests/contracts.ron`, loaded with `include_str!` (§24.3).
- No I/O, no clock, no randomness inside: the day key and every seed come in as arguments.

### 4.2 Data format (§16 "Format d'une quête")

The plan gives `id, level, prerequisites, steps[objectives], rewards`. Full format (PROPOSAL), in RON
(§24.3 allows RON or JSON; RON reads better for hand-written enums):

```ron
Quest(
    id: "lumen.zone.04",
    kind: Zone,                       // Main | Zone | Side | Class | Daily | Weekly | Exploration
                                      // | Profession | Puzzle | Escort | Tutorial | Trial
    zone: "lumen",
    level: 4,                         // quest level, drives XP and the grey rule
    giver: "npc.colony.ilse",
    turn_in: "npc.colony.ilse",       // same NPC most of the time
    prereqs: [Level(3), Done("lumen.zone.03")],
    steps: [
        Step(objectives: [Defeat(target: Monster("shell.wanderer"), n: 4)]),
        Step(objectives: [Gather(item: "mat.glassflax", n: 3), Talk(npc: "npc.colony.oda")]),
    ],
    rewards: Rewards(
        xp_bp: 2500,                  // basis points of XP_required(level), section 6
        gold: 20,
        rep: [("colony", 250)],
        marks: [],
        items: Choice3,               // None | Choice3 | Fixed("item.id")
        lueur: 0,
        recipes: [], title: None, codex: [],
    ),
    share: true,
    text: "q.lumen.zone.04",          // string key, section 17
)
```

`Prereq` (PROPOSAL): `Level(u8)`, `Done(QuestId)`, `Class(ClassId)`, `Rank(FactionId, Rank)`,
`Trial` (lineage trial done).

`Objective` (the §16 primitives, one variant each):

| §16 primitive | Variant | Counts on |
|---|---|---|
| Vaincre(monstre, n) | `Defeat { target: Monster(id) \| Archetype(id) \| Rarity(Elite \| Boss), zone: Option<ZoneId>, n }` | `WorldEvent::Loss` |
| Atteindre(tuile) | `Reach { tile: (q, r) }` | `Reached` |
| Récolter(objet, n) | `Gather { item, n }` | `Gathered` |
| Fabriquer(objet, n) | `Craft { item, n }` | `Crafted` |
| Livrer(objet, PNJ) | `Deliver { item, n, npc }` | checked at turn-in against the inventory, then consumed |
| Parler(PNJ) | `Talk { npc }` | `Talked` |
| Énigme(id) | `Puzzle { id }` | `PuzzleSolved` |
| Escorter(id) | `Escort { encounter }` | `EncounterWon` |
| Survivre(n tours) | `Survive { encounter }` (the encounter data holds n) | `EncounterWon` |
| Contrôler(cases, n tours) | `Hold { encounter }` (the encounter data holds cells and n) | `EncounterWon` |
| (exploration, §16 table) | `Discover { zone, pct_bp }` | `Discovered` |

Why Survive and Hold point at an encounter: §6.7 makes "survive N turns" and "hold cells" combat
objectives. The turn count and the cells are encounter data owned by `combat-engine`; the quest only
waits for that encounter's win.

### 4.3 State machine (§24.2 "les quêtes, sous forme de machine à états")

```rust
pub struct QuestLog {
    pub quests: BTreeMap<QuestId, QuestState>,   // BTreeMap: fixed order (§24.1)
    pub tracked: Vec<QuestId>,                  // at most TRACKED_MAX, section 7.2
}
pub enum QuestState {
    Active { step: u8, counts: Vec<u16> },      // one count per objective of the step
    Ready,                                      // last step done, waiting for turn-in
    Done { times: u32, period: Option<Period> },// period of the last completion (dailies)
}
// A quest absent from the map was never accepted (or was abandoned).
```

Transitions, all pure, all `fn(&Defs, &QuestLog, ...) -> Result<QuestLog, QuestError>`:

| Function | Rule |
|---|---|
| `available(defs, log, hero, period)` | Quests whose prereqs hold, not active, not `Done` (or `Done` in an older period for Daily and Weekly) |
| `accept(defs, log, id, hero, period)` | Fails with `JournalFull` at 25 active (§16, TUNE), `NotAvailable`, `AlreadyActive`. Starts at step 0, counts 0 |
| `abandon(log, id)` | Removes the entry. Progress is lost (PROPOSAL, KISS). Main quest steps can be abandoned and taken again |
| `on_event(defs, log, event)` | Walks active quests in id order; every matching objective of the current step adds, capped at `n`. A step whose counts are all full moves to the next step; after the last step the quest is `Ready`. Returns the new log plus `Vec<Notice>` (section 7.4) |
| `turn_in(defs, log, id, inventory, choice)` | Needs `Ready` (and the `Deliver` items in the inventory). Returns the new log and a `Grant` (section 6) |

Rules (PROPOSAL):
- One event can advance several quests (WoW style). Order never matters for the result, because each
  quest only reads the event, but the walk is in id order anyway (§24.1).
- Objectives within a step are parallel; steps are in sequence.
- `Talk` and `Reach` of a step that is not current do not count (no pre-completion).
- Counts start at acceptance: kills or gathers before acceptance never count (KISS, no inventory scan).
- **No failed state.** An `EncounterLost` (escort marble died, survive lost) leaves the objective at
  0, the quest stays active, the player retries by entering the encounter again (feedback F11).
- A `Deliver` objective reads the inventory at turn-in only; the items are removed in the same
  transition as the `Grant` (atomic, items-loot gives `Inventory::take`).

### 4.4 The event contract (`WorldEvent`)

One enum, produced by other roles, consumed by quests, the Codex (13), reputation (12) and titles
(14). PROPOSAL:

```rust
pub enum WorldEvent {
    Loss { monster: MonsterId, archetype: ArchetypeId, rarity: Rarity, zone: ZoneId, level: u8 },
    EncounterWon { encounter: EncounterId },
    EncounterLost { encounter: EncounterId },
    Engaged { monster: MonsterId },             // first sight for the bestiary
    Reached { tile: (i32, i32) },
    Discovered { zone: ZoneId, pct_bp: u16 },
    Gathered { item: ItemId, n: u16 },
    Crafted { item: ItemId, n: u16 },
    Talked { npc: NpcId },
    PuzzleSolved { puzzle: PuzzleId, moves: u8 },
    LoreFound { entry: CodexId },               // terminal, audio log, lore object
    BossWon { boss: BossId, turns: u16, attempt: u32 },
    LevelReached { level: u8 },
}
```

Producers: `combat-engine` (Loss, EncounterWon or Lost, Engaged; from the combat `Effects`, only
monster Losses, never Revenants, §6.6), `world-generation` (Reached, Discovered, LoreFound),
`gathering-crafting` (Gathered, Crafted), `client-ui` (Talked), puzzle module (PuzzleSolved),
`dungeons-bosses` (BossWon), `progression-talents` (LevelReached).

### 4.5 API across the WASM bridge (§24.4)

JSON, versioned like the save file (`{"v": 1, ...}`), three calls (PROPOSAL):
- `quest_view(hero_json, period) -> json`: available, active (with objective lines and counts),
  ready, tracked, markers.
- `quest_act(hero_json, action_json, period) -> json`: `accept`, `abandon`, `track`, `turn_in`; returns
  the new hero JSON, notices and the grant.
- `world_event(hero_json, event_json) -> json`: the hero after the event (quests, Codex, reputation,
  titles), plus notices.

The client never computes quest state; it renders what the bridge returns (same rule as the moves
today: "the engine is the only judge", tech.md §8).

### 4.6 Tests (strict TDD, 100 % line and region coverage on `quest/`)

Given/When/Then examples (each one a unit test, written before the code):

- **Accept.** Given a level 3 hero and `lumen.zone.04` (needs Level 3 and `lumen.zone.03` done), when
  `lumen.zone.03` is `Done` and the hero accepts, then the state is `Active { step: 0, counts: [0] }`.
- **Prereq.** Same, `lumen.zone.03` not done: `NotAvailable`.
- **Journal full.** Given 25 active quests, when the hero accepts a 26th, then `JournalFull` and the log
  is unchanged.
- **Count and cap.** Given step 0 `Defeat(shell.wanderer, 4)` at 3, when two `Loss(shell.wanderer)`
  arrive, then the quest is on step 1 with counts `[0, 0]` (the 5th kill is not carried over).
- **Ready.** Given the last step with one objective left at n−1, when the event arrives, then `Ready`.
- **Two quests, one event.** Given two active quests both needing `Loss(shell.wanderer)`, one event
  advances both.
- **Before acceptance.** Given a Loss before `accept`, then the count stays 0.
- **Deliver.** Given `Ready` and an inventory with 4 of 5 steel ingots, when turning in, then
  `MissingItems` and nothing is consumed; with 5, the items are consumed and the grant returned.
- **Escort lost.** Given an active `Escort(enc.lumen.convoy)`, when `EncounterLost(enc.lumen.convoy)`,
  then the quest is still active with count 0.
- **Revenant.** Given an active `Defeat`, when a raised monster disappears (no Loss event per §6.6),
  then nothing counts (combat-engine never emits a Loss for it; the quest test pins the contract by
  feeding no event, the combat-engine test pins the emission).
- **Daily period.** Given a daily `Done` in period D, when `available` is asked in period D, it is not
  listed; in period D+1 it is.
- **Determinism.** The same event list from the same log gives the same log and the same notices
  (property test over random event lists).
- **JSON.** Round trip of `QuestLog` through the bridge format; an unknown quest id in a save is
  dropped with a notice, never a crash (section 18).

### 4.7 Data integrity tests (§24.3)

Run on the real `data/` files, in `cargo test`:
- every referenced id exists (NPC, monster, archetype, item, zone, tile inside the world, encounter,
  puzzle, faction, recipe, title, Codex entry);
- prereqs form a graph with no cycle, and every quest is reachable from a level 1 hero with no quest
  done (walk the graph with levels);
- the main quest is one chain (each step has exactly one main successor);
- every quest level sits in its zone's level band (§5.2), main quest excepted;
- zone chains hold 8 to 15 quests (§16, TUNE) once a zone is complete (the test skips zones marked
  `draft`);
- no quest needs more than 25 active quests at once to progress (the main chain plus one zone chain
  stay under the cap);
- text keys exist and fit their length budget (section 17.3);
- XP share per zone sits in its target band (section 6.2).

**Dependencies.** `data-tools` (loader, `include_str!` harness, the RON or JSON choice and its crate,
serde stays out of `abalone-core`); `progression-talents` (the `abalone-world` crate and hero save,
the `XP_required` function); `combat-engine`, `world-generation`, `gathering-crafting`,
`dungeons-bosses` (event producers); `items-loot` (`Inventory::take`); `client-ui` (`Talked`).

**Risks.** The event contract touches 6 roles: it must be agreed in one issue before R3 code. A RON
crate adds WASM size (measure in the first PR).

---

## 5. Quest types and content plan (§16, §15.5, §17, §22)

| §16 type | Kind | Where given | Repeat | Journal slot | Content plan (PROPOSAL, counts TUNE) | Phase |
|---|---|---|---|---|---|---|
| Main | `Main` | Tally (terminals, Bridge) | Once | Yes | Prologue + 5 acts, about 40 steps over levels 1 to 100 | R6 (to seat 1), R8 (seats 2 to 4), R9 (seat 5, raid) |
| Zone | `Zone` | Zone NPCs | Once | Yes | 8 to 15 per zone (§16) | R6 zones 1 to 3, R9 zones 4 to 10 |
| Side | `Side` | NPCs, places | Once | Yes | 3 to 6 per zone | R6 zones 1 to 3, R9 |
| Class | `Class` | Lineage mentor | Once | Yes | Trial (level 5) + chain of 3 from level 30 | R3 (trials of R2 classes), R9 |
| Daily, weekly | `Daily`, `Weekly` | Contract boards | Per period | Yes | Pools of 10 dailies and 4 weeklies per board | R6 |
| Bounty | (bounty board) | Zone board | Per day | No | 5 per zone per day out of a pool of 12 | R6 |
| Exploration | `Exploration` | Auto when the zone is entered | Once | No | 1 per zone | R4 (zone 1), R9 |
| Profession | `Profession` | Colony board (§15.5) | Daily | Yes | Pool of 10 per profession | R7 |
| Puzzle | `Puzzle` | Puzzle tile | Once per puzzle | No | 8 per zone | R6 |
| Escort | `Escort` | NPC | Once | Yes | 1 or 2 per zone (inside the zone chain) | R6 |
| World event | (event) | Auto on the event tiles | Per event | No | 3 event kinds (§22) | R9 |
| Tutorial | `Tutorial` | Lumen camp | Once | Yes | 7 lessons, section 15 | R3 |

All counts above: **TUNE**. Zone chains end on a named fight (an elite, a champion or a zone boss),
side quests use the places of the zone (puzzles, chests, outposts).

**Tests.** The integrity tests of 4.7 count each kind per zone against this table (as soft bounds,
skipped for `draft` zones).

**Dependencies.** `world-generation` (NPC and outpost tiles, puzzle tiles, events), `dungeons-bosses`
(dungeon entrances in chains), `gathering-crafting` (profession orders).

**Risk.** Content volume: 10 zones x (8 to 15 + 3 to 6) is 110 to 210 quests. R6 only needs zones 1
to 3 (about 40 to 60 quests).

---

## 6. Quest rewards and the XP share (§11, §16)

### 6.1 The grant

`turn_in` returns a `Grant`; the quest engine never writes XP, gold or items itself:

```rust
pub struct Grant {
    pub xp: u32, pub gold: u32, pub lueur: u32,
    pub rep: Vec<(FactionId, i32)>, pub marks: Vec<(FactionId, u32)>,
    pub items: ItemGrant,          // None | Choice3 { seed, choice } | Fixed(ItemId)
    pub recipes: Vec<RecipeId>, pub title: Option<TitleId>, pub codex: Vec<CodexId>,
}
```

- **XP** = `XP_required(quest.level) x xp_bp / 10000`, rounded down (integers, §24.1). `XP_required`
  is the §11 curve, owned by `progression-talents`.
- **Grey quest** (PROPOSAL, same rule as monsters, §4.4 and §11): hero level >= quest level + 6
  (TUNE, the plan's grey gap) gives 0 XP; gold, reputation and items stay.
- **Rested XP** does not apply to quests (PROPOSAL, as in WoW).
- **Item choice of 3** (§16): the seed is `(save seed, quest id)` so a reload never re-rolls (§12
  personal loot). The roll itself is `items-loot`'s.
- **Never a talent point** (§16, FINAL in the plan's words "jamais").

Start values (all **TUNE**; xp_bp in basis points of `XP_required(level)`):

| Kind | xp_bp | Gold | Reputation | Marks |
|---|---|---|---|---|
| Main step | 5000 | 10 x level | Order 250 | 0 |
| Zone | 2500 | 5 x level | Zone faction 250 | 0 |
| Side | 1500 | 4 x level | 150 | 0 |
| Class step | 5000 | 0 | 0 | 0 |
| Daily | 1000 | 3 x level | Board faction 150 | 1 |
| Weekly | 4000 | 10 x level | Board faction 500 | 5 |
| Bounty (each) | 500 | 2 x level | 0 | 0 |
| Bounty chest (5 of 5) | 2000 | 10 x level | Order 100 | 1 |
| Exploration (100 %) | 10000 | 0 | Quiet Vitrified 500 | 0 |
| Puzzle | 1000 | 5 x level | 0 | 0 |
| Profession order | 500 | 4 x level | Colony 150 | 1 |
| Tutorial lesson | see 15.4 | 0 | 0 | 0 |

Gold numbers are placeholders for `economy-merchants`, who owns the gold curve.

### 6.2 The 40 % share (§11 "Quêtes : environ 40 %")

Integrity test (PROPOSAL): for each zone, `sum(xp of the zone's once-only quests + main steps whose
level falls in the band) / sum(XP_required(n) for n in the band)` sits in 35 % to 45 % (TUNE). The
band of zone i is `[start level of zone i, start level of zone i+1)`, with the start levels of §5.2
(1, 10, 15, 20, 30, 40, 45, 55, 70, 85). Dailies, bounties and puzzles stay out of the ratio
(repeatable or optional).

Check of the start values on zone 1 (levels 1 to 9, `XP_required` from §11 as reals): 260 + 327 +
400 + 480 + 567 + 660 + 760 + 867 + 980 = about 5300 XP. 40 % is about 2120 XP. With 7 tutorial
lessons (15.4), 10 zone quests at 2500 bp of about level 6 (about 165 XP each) and 3 main steps at
5000 bp (about 330 each) the zone gives about 1470 + 1650 + 990 = 4110, too much once the tutorial
counts: so tutorial lessons count in the band and the zone 1 chain is set at 8 quests in R6. The
test is the guard; the numbers move.

**Tests.** Grant arithmetic (integer floor), grey rule at the boundary (level + 5 gives XP, + 6 gives
0), Choice3 seed is stable across two calls, share test per zone.

**Dependencies.** `progression-talents` (`XP_required`, rested XP, applying XP), `items-loot`
(Choice3 roll, Fixed items), `economy-merchants` (gold curve, marks prices), `qa-balance` (the R3
scripted 1 to 30 run uses these quests).

---

## 7. Journal, tracker, map markers, Tally notices (§16 "Interface", §24.5)

### 7.1 Journal (§16: 25 active quests, changes `world.md` §4)

- Window "Journal" (key J, PROPOSAL; §24.5 lists the window, not its key). Lore framing: the
  Tally-holder's **ledger**; each quest is an "entry" with a number.
- Lists active quests grouped: Main first, then the current zone, then other zones by level, then
  contracts. Each row: glyph of the kind, title, level (color **and** a glyph for grey, green,
  yellow, orange, red, as §4.4), objective lines with counts ("Shells struck: 3/4").
- Actions: track or untrack, abandon (with a confirm), show on map.
- **Cap: 25 active** (§16, TUNE). Dailies and weeklies take a slot (PROPOSAL); bounties, puzzles,
  exploration and events do not.
- Opens only outside combat (`world.md` §6 forbids flat overlays during a match; the hub and the world
  map are not a match).
- View model: `client/src/journal.ts`, pure, from `quest_view` JSON; vitest unit tests.

### 7.2 Tracker (§16 "un suivi des quêtes à l'écran")

- Up to 5 tracked quests (PROPOSAL, TUNE) on the world screen, top right, at most 3 objective lines
  each.
- New quests auto-track while fewer than 5 are tracked (PROPOSAL).
- **In combat** the tracker hides. The only quest info on the board is the combat objective of the
  encounter (Survive, Hold, Escort), drawn by `client-ui` as engraved ticks on the board frame
  (`world.md` §6.4 style), with the flat HUD fallback (`world.md` §6.8).

### 7.3 Map markers (§16: `!` and `?`, always a glyph as well as a color)

Pure function `markers(defs, log, npcs, hero, period) -> Vec<Marker { tile, kind }>`:

| Kind | Glyph | Color (with `world.md` palette) | When |
|---|---|---|---|
| Available | `!` | sodium orange | A quest of this NPC is available, not grey |
| Available, grey | `!` with a down chevron | steel grey | Only grey quests |
| Repeatable | `!` inside a ring | cold cyan | A daily or weekly is available |
| Ready | `?` | sodium orange | A quest to turn in here is `Ready` |
| In progress | hollow `?` | steel grey | A quest to turn in here is active, not ready |

One marker per NPC: the highest of Ready, Available, Repeatable, In progress, grey (PROPOSAL order).
Bounties, puzzles and events get their own glyphs from `world-generation` and `client-ui`.

### 7.4 Notices and Tally lines

`on_event` and `turn_in` return `Notice { kind, quest, args }`: `Accepted`, `Progress(i, n)`,
`StepDone`, `Ready`, `TurnedIn`. The client shows one short line, in Tally's voice for main and
contract quests ("Entry 012: 3 of 4.", "Entry 012 balanced."), plain for others. Screen readers hear
each notice once (same rule as #294).

**Tests.**
- Rust: `markers` table cases (one test per row, plus the priority order).
- Vitest: `journal.ts` grouping and order, cap message at 25, abandon confirm.
- Playwright e2e (player-facing): talk to the Lumen NPC with `!`, accept, the tracker shows "0/4",
  win a skirmish against 4 shells, the tracker shows "4/4" and the marker turns to `?`, turn in, the
  journal is empty and the reward shows. Screenshot in the PR (CONTRIBUTING §6.4).

**Dependencies.** `client-ui` (windows, tracker, frame ticks, map layer, key bindings), `art-audio`
(glyphs, notice sound twin), `world-generation` (NPC tiles on the map).

**Risks.** 25 entries with 3 lines each must stay readable at 200 % UI scale (`world.md` §6.9).

---

## 8. Party quests (§16 "En groupe", §4.7, §6.2)

Rules (PROPOSAL where the plan is silent):
- **Share.** A player sends `quest_share { quest_id }` on the party channel. Each receiver runs
  `available`; if the quest is available it shows a prompt, else nothing ("not available" stays
  local). Progress is never synced: each peer keeps its own log (§4.7: world state is local).
- **Combat credit.** "A combat objective counts for every member present" (§16). Present = the
  member's entity was still on the board (not routed, not dead, not fled, §6.7) when the Loss
  happened. Every peer derives the same Loss list from the signed combat log; each peer feeds its
  own hero the Losses it was present for. Losses of every pack count, not only the member's own pack
  (§6.2 spawns one pack per player).
- `EncounterWon` (escort, survive, hold, boss) counts for every entity still on the board at the win.
- Gather, Craft, Deliver, Talk, Reach, Puzzle stay personal.
- No authority: a peer can forge its own log. Party quests are between friends (§13.4).

**Tests.** Given a 2-player fight log where P2's hero dies at turn 6 and a shell is lost at turn 8,
when credit is computed, then P1 gets the Loss and P2 does not. Given the same log on both peers,
both compute the same credit (pure function `credited_losses(log, entity)`). e2e (R10): two tabs in a
party, P1 shares a quest, P2 accepts, both win a fight, both trackers count.

**Dependencies.** `network-p2p` (party channel message, signed combat log), `combat-engine`
(`credited_losses` input: the per-turn presence of each entity).

---

## 9. Daily, weekly contracts and bounties (§16, §21)

### 9.1 Period keys (PROPOSAL)

- **Day**: the UTC date `YYYY-MM-DD`, from `utcDay` of `client/src/daily.ts`. The client passes it to
  the bridge; Rust never reads a clock.
- **Week**: Monday 00:00 UTC; key `W<n>` with `n = floor((days since 1970-01-01 + 3) / 7)` (1970-01-01
  is a Thursday). The same key serves Mythic+ weekly affixes (§17) if `dungeons-bosses` agrees.
- **Seed**: the FNV-1a plus murmur3 `hash32` of `daily.ts`, ported to Rust as `period_seed(text)`,
  pinned by the same test vector as the TS test (`ab-alone daily 2026-10-24`), so the repo keeps one
  seed algorithm.

### 9.2 Contracts (dailies and weeklies)

- Each contract board (hub, each outpost, §21) has a pool in `data/quests/contracts.ron`.
- Offered: 3 dailies (TUNE) and 1 weekly (TUNE) per board, picked by a partial Fisher-Yates over the
  pool sorted by id, driven by a splitmix64 stream seeded with
  `period_seed("ab-alone contracts <board> <day>")` (or `<week>`).
- Each offered contract can be done once per period. A daily accepted on day D and finished on day
  D+1 still counts (PROPOSAL, kind to players).
- The device clock can be moved to farm dailies: accepted limit of a local save (§13.4).

### 9.3 Bounties (§16 "Primes : 5 objectifs par zone, puis un coffre")

- Per zone per day: 5 bounties (§16, TUNE) picked from a zone pool of 12 (TUNE) with
  `period_seed("ab-alone bounties <zone> <day>")`.
- A bounty is one objective (Defeat an elite at a tile, finish an event, solve a puzzle, clear a
  chest guard). They live on a zone bounty board (map layer), not in the journal.
- 5 of 5 gives the bounty chest (items-loot roll, seed `(save seed, zone, day)`).

**Tests.** `period_seed` equals the TS vector; the same day gives the same 3 contracts; two boards
give independent picks; a pool smaller than 3 offers the whole pool; week key at the boundary
(Sunday 23:59 and Monday 00:00 UTC); bounties: 5 distinct picks, chest only at 5 of 5. e2e: the
board shows 3 contracts with a fixed `Date` in Playwright (same technique as `daily.spec.ts`).

**Dependencies.** `world-generation` (board tiles, bounty targets), `items-loot` (chest),
`dungeons-bosses` (shared week key), `client-ui` (board window).

---

## 10. Puzzles (Énigme) (§4.3, §16, §22)

### 10.1 Rules (PROPOSAL: the plan names the puzzle, not its rules, feedback F14)

- **Classic Abalone rules** (`abalone-core` only, every Weight 1, no HP, no abilities). The puzzle is
  the pure game, so it teaches Abalone and can ship before the RPG combat crate.
- The player is Black and moves first. Two modes:
  - `solo`: White never moves. Goals like "eject 2 in 3 moves".
  - `duel`: White replies with `search.rs` at a fixed node budget (deterministic, never a clock).
    Goals like "save the marble at q,r for 3 moves" or "eject 1 in 3 moves against replies".
- Goals: `eject N` (N white marbles out within the move cap) or `save q,r` (the black marble that
  starts on q,r is still on the board after the move cap, and the player made the cap of moves).
- Retry is free and instant. A hint shows the next move of the stored solution as a ghost (reuses
  the Hint button of #192, PROPOSAL).

### 10.2 Format

Text, same style as `encounter/fixture.rs` (one header per line, cells `q,r` joined by `;`):

```text
id: lumen.p01
mode: solo
goal: eject 1
moves: 3
radius: 4
void: 0,4;1,3
black: -2,0;-1,0;0,0
white: 3,0;4,0
budget: 0
solution:
-2,0;-1,0;0,0 E
-1,0;0,0;1,0 E
```

File: `data/puzzles/<zone>.txt`, one puzzle per block, blocks split by a blank line.

### 10.3 Engine

- Module `abalone-world/src/puzzle.rs`: `parse`, `Puzzle::start() -> Game`, `play(mv) -> Status
  { Running, Solved, Failed }`, `Failed` once the move cap is spent without the goal.
- Integrity test: each puzzle's stored solution replays to `Solved` within the cap (in `duel`, against
  the deterministic replies); a `solo` puzzle is also checked by a breadth-first search to have no
  solution shorter than the cap minus 1 (PROPOSAL, TUNE: not trivially short).
- Puzzle tiles: `world-generation` picks a puzzle id for each puzzle tile from the zone pool, without
  repetition until the pool is used up. Reward on the first solve of a puzzle id only; a repeat tile
  gives gold only (PROPOSAL).
- Pool: 8 puzzles per zone (TUNE); the 1 % of §4.3 gives about 110 puzzle tiles over 10 zones (feedback
  F15).

**Tests.** Parse errors name the line; `solo` White never moves; `duel` reply equals
`search(board, budget)`; `eject 1` solved on the first ejection even before the cap; `Failed` after
the cap; `save` fails when the marble is ejected at the last reply. e2e: walk onto a puzzle tile,
solve `lumen.p01` with the stored moves, see "Solved", the Codex lists it.

**Dependencies.** `world-generation` (puzzle tiles and their cleared flag), `client-ui` (the small
board view; reuses the classic board renderer), `gathering-crafting` (rich-vein mini-game of §14 v2
can reuse this module).

---

## 11. World events, exploration, secrets: the quest side (§22, §16)

- **World events** (§22: defend a convoy, purge a Fissure, hunt a rare; 5 to 10 min, UTC seed).
  `world-generation` spawns them; this role defines `EventDef { id, kind, objectives, rewards }` in
  `data/events.ron`. Entering an event tile joins it (no journal slot). The window is real time; a
  fight started before the window ends still counts when it ends (PROPOSAL, feedback F19).
- **Exploration** (§16): one `Exploration` quest per zone, auto-started on entering the zone,
  objective `Discover { zone, pct_bp: 10000 }`, reward: title "Surveyor of <zone>" and the XP of 6.1.
  The percentage counts only tiles the generator marks as discoverable (feedback F20).
- **Secrets** (§22): hidden chests and treasure maps are `items-loot` and `world-generation`; this
  role gives each secret a Codex entry (Lore) and its text.

**Tests.** Event join on tile entry; event credit when the fight ends after the window; exploration
done at exactly 10000 bp, not at 9999.

**Dependencies.** `world-generation` (event schedule, discovery %, secrets), `items-loot`.

---

## 12. Factions and reputation (§13.1, §13.5, §11)

### 12.1 Ranks (§13.5 names the ranks, not the thresholds: feedback F12)

| Rank | Cumulative reputation (PROPOSAL, TUNE) |
|---|---|
| Neutral | 0 |
| Friendly | 3000 |
| Honored | 9000 |
| Revered | 21000 |
| Exalted | 42000 |

- Reputation never drops in v1 (PROPOSAL, KISS), so `rank(rep)` is a pure lookup.
- Level gate (reading §11 "40: reputations at Honored"): a faction rank above Friendly needs hero level
  40 (TUNE); reputation still accrues and the rank shows once the level is reached (PROPOSAL, feedback
  F12).
- **Marks** (§13.1: one currency per faction): given only by contracts, bounty chests and profession
  orders (table 6.1); spent at quartermasters (`economy-merchants`).

### 12.2 Code and data

- `abalone-world/src/reputation.rs`: `Reputation { by_faction: BTreeMap<FactionId, u32> }`,
  `add(grant)`, `rank(faction)`, `rank_up` notices.
- `data/factions.ron`: id, name key, theme, home NPC, rank rewards (ids of recipes, cosmetics, titles
  owned by other roles, referenced here).

**Tests.** Thresholds at the boundary (8999 Friendly, 9000 Honored); level gate (level 39 at 9000
shows Friendly); rank-up notice once; Exalted title granted once.

**Dependencies.** `economy-merchants` (marks, quartermaster stock), `progression-talents` (Momentum
unlocks, §11), `pvp-br` (Strippers rep from PvP and BR), `dungeons-bosses` (Order rep from dungeons).

---

## 13. Codex (§22, §21 Archives, §23)

### 13.1 Content (§22: bestiary, flora, lore, solved puzzles, replayable bosses)

| Category | Unlock (PROPOSAL) | Shows |
|---|---|---|
| Bestiary | `Engaged` (first fight against the monster) | Name, glyph, archetype, zone, lore line (≤ 40 words), its counter line, kills count |
| Flora | `Gathered` (first gather of a resource) | Name, tier, zones, lore line |
| Lore | `LoreFound` (terminal #20, audio log #21, boss arena object, lineage story, secret) | The text (≤ 120 words, `world.md` §4) or transcript |
| Puzzles | `PuzzleSolved` | The puzzle, best move count, replay of the player's solve |
| Bosses | `BossWon` | Attempts, best turns, the winning move list, a **Replay** and a **Fight again** button |

- Stats in the bestiary are not gated: combat state is public anyway (§1 pillar 2).
- "Fight again" from the Codex starts the RPG fight of that boss with the same seed, no loot, no XP
  (PROPOSAL, feedback F22). The classic bosses stay at the Mess tables (§21), untouched.
- Completion: per category and in total, `unlocked / total` in basis points (§23 "Codex à
  compléter"). A complete category gives a title (section 14).
- Lore never gates progress (`world.md` §4): no quest, level or unlock needs a Codex entry.

### 13.2 Code and data

- `abalone-world/src/codex.rs`: `Codex { unlocked: BTreeSet<CodexId>, kills: BTreeMap<MonsterId,
  u32>, puzzles: BTreeMap<PuzzleId, u8>, bosses: BTreeMap<BossId, BossRecord> }`, `on_event`,
  `completion(category)`.
- `data/codex/*.ron`: `Entry(id, category, unlock, text)`. Bestiary and flora entries can be built
  from the monster and resource data plus a text key, to avoid duplicate lists (PROPOSAL).
- Boss records reuse the attempt data of `encounter/telemetry.rs` (§6.12).
- Window "Codex" in the Ballast Archives and from the menu (`client-ui`), `client/src/codex.ts` view
  model.

**Tests.** First `Engaged` unlocks once; kills count every Loss; puzzle best keeps the minimum;
completion bp with 0 entries in a category is 0, not a division by zero; integrity: every entry has a
reachable unlock source (monster exists in some zone, resource is gatherable, terminal placed on a
tile). e2e: fight a shell, open the Codex, see its bestiary entry; solve a puzzle, see it in Puzzles.

**Dependencies.** `world-generation` (terminal and lore object placement), `dungeons-bosses` (boss
records, fight again), `client-ui` (Archives room, Codex window, replay viewer), `art-audio` (#21
audio logs).

---

## 14. Titles (§16, §13.5, §23)

- `data/titles.ron`: `Title(id, text, source)`; sources: quest grant, reputation Exalted, Codex category
  complete, exploration 100 %, class chain, main quest, PvP and BR (`pvp-br` adds its own).
- Hero save keeps `titles: BTreeSet<TitleId>` and `title: Option<TitleId>` (the shown one).
- Shown under the hero's name on inspect and in the hub (`client-ui`); never a stat.

**Tests.** A title is granted once; an unknown title id in a save is dropped; integrity: every title
has exactly one source.

---

## 15. Tutorial, levels 1 to 4 (§11)

### 15.1 Where

§11 says "the island of Lumen", §5.2 says zone 1 "Lumen Plains" is the tutorial zone (feedback F1).
PROPOSAL: the tutorial is the **Lumen camp**, a small fenced area of 7 tiles (TUNE) at the edge of the
Lumen Plains; the player leaves it at level 5 after the lineage trial. No separate island.

The class is picked at hero creation (§7.2: Weight depends on the class from level 1), but abilities
stay locked until the trial (§11).

### 15.2 Lessons (§11: select, push, sumito, eject, Formation, Isolation; plus one PROPOSAL)

Each lesson is a `Tutorial` quest with a **fixed** board (not tile-generated), a fixed seed and a
fixed enemy script, data in `data/tutorial/lessons.ron` (board in the puzzle text format of 10.2 plus
units).

| # | Lesson | Board and setup (PROPOSAL) | Goal (detected from combat `Effects`) | Tally line (PROPOSAL) |
|---|---|---|---|---|
| 1 | Select and roll | Radius 3, hero alone, 1 marked cell | Hero ends a Move on the marked cell | "Line 1: one survivor, clear. Unaccounted." |
| 2 | Line up | Hero + 2 Fragments, 3 marked cells | A 3-marble inline Move, then a broadside Move | "Line 2: three in a row. Noted." |
| 3 | Push (sumito) | 2 Fragments vs 1 shell (Weight 1) | One push with n > m; the preview shows "2 vs 1 · Weight 2 vs 1" | "Line 3: one shell displaced." |
| 4 | Out | 3 Fragments, shell on the rim | One enemy ejected | "Line 4: one shell written off." |
| 5 | Formation | Hero + 4 Fragments vs 2 shells that telegraph a hit | End 2 turns with every own marble next to an ally | "Line 5: grouped assets depreciate slower." |
| 6 | Isolation | 1 isolated shell | Deal damage that carries the Isolation bonus | "Line 6: a lone shell, a cheap entry." |
| 7 | Edge danger (PROPOSAL, feedback F3) | Hero on the rim, Danger glyph on | End the turn with no Danger glyph on the hero | "Line 7: the holder on the edge. Do not." |
| 8 | First skirmish | Normal skirmish, threat 6 (§6.8), fixed seed | Win | "Line 8: books balanced. Carry on." |

- Monsters in lessons 1 to 7 have Weight 1 (classic Abalone feel), lesson 8 uses the zone 1 roster.
- Each lesson shows one short instruction (≤ 20 words, TUNE) on the board frame and a scripted ghost
  of the expected move (the lesson's own solution, not the engine search).
- A lesson cannot be lost except lesson 8 and lesson 7 (the hero can die). On defeat the hero
  restarts the lesson at once (PROPOSAL, feedback F2: Beacons unlock at level 5).
- Passive points of levels 2 to 4 (§11) can be spent, but the Path effects are off in lessons 1 to 7
  (PROPOSAL, feedback F31: "pure Abalone").

### 15.3 Goal detection

`abalone-world/src/tutorial.rs`: `lesson_goal(def, effects_so_far, state) -> bool`, pure. It needs
from `combat-engine` effect tags: `Moved { units, inline }`, `Pushed { n, m, weight_for, weight_against
}`, `Ejected { unit }`, `Damaged { unit, mods: [Isolation, Formation(k), ...] }`, `EdgeDanger { unit,
on }`.

### 15.4 Numbers

XP from level 1 to 5 is about 1467 (§11 curve, as reals). Lessons give, in xp_bp of `XP_required(1)`:
lessons 1 to 7: 3000 each (about 78 XP each, TUNE), lesson 8: 10000 (TUNE). The rest comes from the
first zone quests and kills inside the camp. Target time levels 1 to 5: 20 min (PROPOSAL, TUNE, inside
the §11 "level 10 in 1 h 30").

### 15.5 Skip

A second hero can skip lessons 1 to 7 if another hero on this device finished the tutorial
(PROPOSAL); lesson 8 and the trial stay.

**Tests.** One unit test per lesson goal (true on the right effect, false on a near miss: a 2-marble
inline move for lesson 2, a broadside "push" for lesson 3, a damage without Isolation for lesson 6).
Playwright e2e: new hero, play lessons 1 to 4 with scripted moves, see each Tally line and the level
counter; a second spec covers 5 to 8. Screenshots in the PR.

**Dependencies.** `combat-engine` (fixed-board encounters, effect tags, Danger glyph), `client-ui`
(frame text, scripted ghost), `progression-talents` (hero creation, levels 2 to 4 passive points,
skip flag), `world-generation` (the camp tiles).

**Risks.** Lessons 5 and 6 depend on Formation and Isolation existing in combat (R1 does not list
them; R2 has statuses): the tutorial task must wait for them (phase R3).

---

## 16. Lineage trial and class quests (§11, §16, §8)

- **Trial** (§11 "at level 5, the lineage trial gives the first ability"): a `Trial` quest from the
  lineage mentor, prereq `Level(5)`. Step 1: pick one tier-1 ability (§8.0: abilities 1, 2, 5 or 6)
  with the level 5 active point. Step 2: a fixed fight against a "memory" of the lineage (a glass
  echo) that is only won with that ability's mechanic (one board per tier-1 ability, so 4 per class,
  TUNE). Reward: the trial flag (`Prereq::Trial`), the lineage title "of the <Lineage>", Beacons
  start (§11 level 5).
- PROPOSAL: the active tree accepts its first point only once the trial flag is set, so the trial is
  the place where the first ability arrives (feedback F32).
- **Class chain** (§16 "a cosmetic variant of the ultimate and a title"): 3 quests from level 30
  (TUNE), one per ultimate plus a finale; rewards: the cosmetic variant of each ultimate (2 per class)
  and the lineage title "Keeper of the <Lineage>" (PROPOSAL, feedback F21).

**Tests.** Trial not available at level 4; the point cannot be spent before the trial (contract test
with `progression-talents`); each trial board is won by the scripted solution with the chosen ability
and lost by the scripted no-ability line (the board really teaches the ability). e2e: a level 5
Warrior takes the trial, picks Charge, wins, the ability bar shows Charge.

**Dependencies.** `class-designer` (one trial board per tier-1 ability, its scripted solution),
`progression-talents` (active point gate), `art-audio` (ultimate cosmetic variants), `combat-engine`.

**Risk.** 8 classes x 4 boards = 32 trial boards. R3 needs only the R2 classes (4 x 4 = 16, TUNE).

---

## 17. Text, tone and localisation (§2, §16, §26 Q5)

### 17.1 String keys

All player-facing text is a key into `data/text/<lang>/*.ron` (`"q.lumen.zone.04.title": "..."`).
English only in v1 (repo convention); French needs Q5 (§26) answered before R6 content lands
(feedback F24). Text never lives in Rust or TS logic, except the existing classic-table lines of
`endbanner.ts` and #294, which stay.

### 17.2 Tone (§16 "Tally speaks in ledger lines, the colonists with weariness"; `world.md` §2)

- **Tally**: "Line N:" or "Entry N:" prefix, then at most 12 words (TUNE). Accounting words only
  (line, entry, carried, surplus, deficit, struck, balanced, asset, written off). Never explains,
  never jokes, never threatens directly. Present tense.
- **Colonists**: tired, polite, short; one concrete detail (a tool, a ration, a name). No exposition
  dumps.
- **Quest text**: what to do in the first sentence; flavour after.
- **Horror slider** (`world.md` §8): quest text never changes with it (gameplay information);
  optional flavour lines tagged `dread: 2` or more hide below that setting (PROPOSAL, feedback F25).

### 17.3 Length budgets (all TUNE)

| Text | Budget |
|---|---|
| Tally line | 12 words |
| Quest title | 6 words |
| Quest description | 60 words |
| Objective line | 8 words, plus the count |
| NPC line | 25 words |
| Codex bestiary or flora line | 40 words |
| Lore terminal, Codex lore | 120 words (FINAL, `world.md` §4) |
| Tutorial instruction | 20 words |

**Tests.** The integrity test counts words per key against the budget by key prefix; every key used
in data exists in `en`; no key is unused (warning list, not a failure, PROPOSAL).

**Dependencies.** `client-ui` (text rendering, one font), `art-audio` (audio log transcripts).

---

## 18. Save data (§16 "L'état est rangé dans la sauvegarde du héros", §24.5)

This role owns these sections of the hero save; `progression-talents` owns the file, its version
and IndexedDB store `hero` (§24.5).

```json
{
  "quests": { "lumen.zone.04": { "s": "active", "step": 1, "c": [3, 0] },
              "lumen.zone.03": { "s": "done", "n": 1 },
              "lumen.daily.02": { "s": "done", "n": 4, "p": "2026-10-24" } },
  "tracked": ["lumen.zone.04"],
  "rep": { "colony": 3400 },
  "codex": { "u": ["beast.shell_wanderer"], "k": { "shell.wanderer": 12 }, "p": { "lumen.p01": 3 }, "b": {} },
  "titles": { "owned": ["of_the_ram"], "shown": "of_the_ram" },
  "flags": { "trial": true, "tutorial": true }
}
```

- Unknown quest, Codex, title or faction ids (content removed by a later build) are dropped on load,
  with one notice; never a crash, never a half-loaded hero (same rule as `savegame.ts`).
- A changed quest definition (fewer objectives) resets that quest to step 0 (PROPOSAL).

**Tests.** Round trip; unknown ids dropped; counts longer than the step's objectives reset the quest;
the save of a hero mid-quest reloads to the same tracker (e2e: reload the page, tracker still "3/4",
§4 R4 criterion "recharger la page").

**Dependencies.** `progression-talents` (hero save, version, migration), `client-ui` (IndexedDB).

---

## 19. Feedback on the gameplay spec

Contradictions and gaps found while writing this role. The plan is not modified here.

- **F1.** §11 puts the tutorial on "l'île de Lumen"; §5.2 makes zone 1 "Plaines de Lumen" (levels 1 to
  10) the tutorial zone, on the continent of §4.1. Island or zone?
- **F2.** §6.12 sends a defeated hero to "the last Beacon", but §11 unlocks Beacons at level 5: a
  defeat during the tutorial (levels 1 to 4) has no respawn point.
- **F3.** The tutorial (§11) teaches select, push, sumito, eject, Formation, Isolation, but not the
  riskiest rule of the game: an ejected hero dies and the fight is lost, with the "Danger du bord"
  alert (§6.6). Nor the Weight pips, although tutorial fights have Weight.
- **F4.** §16 says the main quest finds "the 5 seats (the existing bosses)", but one of the 5 existing
  bosses is The Ballast Mind, which is Tally itself, the quest giver and the final raid (§2, §17). Only
  4 seats are left; a 5th is needed (this file proposes the Abyss Walker as the lost captain).
- **F5.** The player's goal is missing. `world.md` §2: Tally grants the docking clamp release. On a
  terraformed world with a Colony, why does the hero do Tally's audit, and what is won after the raid?
- **F6.** `world.md` §1 has the Ballast "drifting over Hollow"; §2 of the plan has it "stranded on the
  surface". The plan's conflict list only names the atmosphere line.
- **F7.** `world.md` §1 "You are alone", nameless, voiceless, against a party of 4 heroes, a Colony, 4
  factions, merchants and other players at the hub. Not in the conflict list. The "last glass still
  clear" line (§2) conflicts with 4 clear heroes in a party.
- **F8.** `world.md` §4 "Tally never explains itself, one-line announcements" and "lore never gates"
  against Tally as the main quest giver and a lineage trial that gives the first ability (§11).
  Neither is in the conflict list.
- **F9.** Boss lore hooks are tied to ship decks (`world.md` §3: Echo in the Mess, Hull fused to the
  ship's frame, Choir in the Furnace deck, Chaplain in the Chapel deck). §17 moves them to the Holds,
  a Starglass Mine, a caldera and the Vitrified Lands. The hooks need rewriting; not in the conflict
  list.
- **F10.** §16 "a combat objective counts for every member present": "present" is undefined (hero
  dead mid-fight? fled?), and with one pack per player (§6.2) it is unclear whether other packs' kills
  count.
- **F11.** No quest failure rule: an escort marble that dies, a "survive N turns" that is lost (§6.7,
  §16).
- **F12.** Reputation (§13.5): no rank thresholds, no reputation sources or amounts, no Mark earn rate
  (§13.1). §11 "40: reputations at Honored" is ambiguous (a level gate on ranks? a Momentum
  requirement?). "Réputation trouble" for the Ballast Strippers is undefined (opposed factions?).
- **F13.** The Order of the Ledger is "Tally's faithful" and gives dailies and dungeons (§13.5); its
  fate after Tally turns into the final boss is not said.
- **F14.** Puzzles (§4.3, §16): no rules. Does the opponent reply? Classic rules or weighted, with HP?
  What is the "fixed reward"? Repeatable? Hint?
- **F15.** Puzzle tiles are 1 % of about 11 000 tiles (§4.1, §4.3): about 110 puzzles. No source is
  given (hand-made or generated) and each needs a proven solution.
- **F16.** §11 wants about 40 % of XP from quests, but no quest XP numbers exist, the zone level bands
  overlap (§5.2: 10-20, 15-25, 20-35...), and the grey rule for quests is not stated.
- **F17.** Dailies and weeklies (§16): "week" is undefined (ISO, Monday UTC?), the number of contracts
  per board is undefined, and whether they take one of the 25 journal slots is not said.
- **F18.** Bounties (§16): refresh cadence undefined (per day, per zone visit?).
- **F19.** World events last 5 to 10 real minutes (§22), fights are turn based and last 2 to 15 minutes
  (§6.8): what happens when a fight runs past the event window? And with local world state (§4.7),
  is the event the same for a party?
- **F20.** Exploration quest "discover 100 % of a zone" (§16) with about 1100 tiles a zone and tiles
  that may never be reachable (Rock clusters, sea, the tide of §5.2 zone 7): the generator must
  guarantee every counted tile can be revealed.
- **F21.** Class quest (§16): "a cosmetic variant of the ultimate", but each class has 2 ultimates
  (§8, §10). One variant or two? From which level (ultimates come at 30)?
- **F22.** Codex "bosses you can replay" (§22): the classic Mess boss or the RPG boss? With loot and
  XP? `game-design.md` §4 had "each boss win stores a move list, replayable in the codex", which is a
  replay viewer, not a new fight.
- **F23.** Journal of 25 and an on-screen tracker (§16) against `world.md` §6.1 (no flat overlay during
  a match). The conflict list names §6 only for the combat bar; the tracker in combat and combat
  objectives (survive N turns) need a diegetic home.
- **F24.** §26 Q5 (languages) is open, but quest and lore text is the biggest text volume of the game:
  it must be answered before R6 content, or every string is written twice.
- **F25.** `world.md` §8: the horror slider "applies to lore text tone". Do quest texts need variants?
- **F26.** §15.5 profession orders ("5 steel ingots") versus the §16 primitives: Fabriquer(item, n)
  or Livrer(item, NPC)? The two differ (craft after acceptance versus hand in from the bag).
- **F27.** Name clash on "Lueur": a currency (§13.1), the Healer's lineage "lignée de la Lueur" (§8.4),
  a resource "Fleur-lueur" (§5.2) and the Sorcery keystone "Lucine: une Lueur compagne" (§9.2).
- **F28.** §4.3 lists "Énigme" as tile content with a fixed reward; §16 lists it as a quest type stored
  in the Codex. One system or two?
- **F29.** "Les Cales du Ballast" (§17, level 8) is a dungeon inside the hub ship, but §5.2 row H says
  the hub has no combat except duels and the arena. Where is its entrance tile?
- **F30.** §11 "10: quest for Momentum" against §4.2 "Momentum at level 20 and 40": does the quest
  unlock Momentum, or only start a chain that pays off at 20?
- **F31.** §11 says tutorial fights are "pure Abalone, with HP and Weight", but the same table gives the
  first passive point and the choice of Path at level 2: Path effects would apply during the
  tutorial.
- **F32.** §11 "the lineage trial gives the first ability" against §10 "1 active point at level 5":
  is the ability gated by the quest (power behind content) or only by the level?
- **F33.** `world.md` §3 says the five seats include B5 Mind, and Tally grants the release "to a winner
  who has beaten the five seats": already circular before the pivot (Tally is a seat and the judge).
  The RPG plan inherits it (see F4).

## 20. Open questions

1. Seat 5: the Abyss Walker as the lost captain (this file), or another boss? (F4)
2. What does the hero win at the end of the main quest: the clamp release, the Colony's freedom, a new
   game plus? (F5)
3. Is the tutorial a camp on the Lumen Plains, or a separate island? (F1)
4. Is the "Danger du bord" lesson (lesson 7) accepted into the tutorial? (F3)
5. Puzzle rules: classic rules with `solo` and `duel` modes, as proposed? (F14)
6. Puzzle supply: 8 hand-made puzzles per zone with repeats, or a generator later? (F15)
7. Reputation thresholds 3000/9000/21000/42000 and the level 40 gate above Friendly? (F12)
8. Do dailies and weeklies take a journal slot? (F17)
9. Is the first ability gated by the lineage trial? (F32)
10. Party credit: "present" means "entity on the board when the Loss happens"? (F10)
11. Languages: English only in v1, French later with the same keys? (F24)
12. Codex "Fight again": RPG version with no loot and no XP? (F22)
13. RON or JSON for hand-written data, and which crate? (`data-tools`)
14. Can a hero skip the tutorial lessons once another hero on the device has done them? (15.5)
15. The Healer's lineage renamed "Lantern" in English to avoid the Lueur clash? (F27)

---

## 21. Tasks

One PR each, smallest first inside a phase. Phases from §25. "Code" tasks follow CONTRIBUTING §11
(TDD commit order, 100 % line and region coverage, e2e when a player sees it, screenshot when the UI
changes).

### R0: spec

**T1. Spec: `rpg/quests.md` (quests, journal, contracts, puzzles, Codex, factions, titles, tutorial)**
- Outcome: the quest and narrative design of this file lands as the English spec `docs/specs/rpg/quests.md`, part of docs PR 3 of §0.
- Done:
  - [ ] Sections 4 to 18 of this file, rewritten as spec text with every number tagged.
  - [ ] Open questions 1 to 15 answered by an owner or listed as OPEN-n.
  - [ ] Feedback F1 to F33 posted on the Decision (#313) or its follow-up issue.

**T2. Spec: lore delta in `world.md` (setting, Tally arc, lineages, factions, boss hooks)**
- Outcome: `world.md` §1 to §4 say what the RPG world is (stranded ship, terraformed pockets, lineages, Colony, factions, Tally's arc, relocated boss hooks).
- Done:
  - [ ] Section 3 of this file merged into `world.md`, the "no quest log" rule of §4 replaced.
  - [ ] "Lore never gates" kept and restated for quests (quest progress never needs reading).
  - [ ] Conflicts F6 to F9 resolved in the text.

### R1: combat minimal

**T3. Tally end lines for an RPG fight (hero dead, rout, flee, win)**
- Outcome: the end banner of an RPG fight shows one Tally ledger line for each end (hero dead, rout, flee, victory).
- Done:
  - [ ] Lines as data in a pure module next to `endbanner.ts`, proposed on the issue first.
  - [ ] Vitest unit tests for each end; classic lines unchanged.
  - [ ] e2e: the R1 fight shows the line on hero death; screenshot.

### R3: progression

**T4. Quest engine core: data types, `QuestLog`, accept, abandon, `on_event`, turn-in**
- Outcome: `abalone-world` can run a quest from acceptance to turn-in from data, as a pure state machine.
- Done:
  - [ ] Types of 4.2 and 4.3, `Defeat`, `Talk`, `Reach` objectives only.
  - [ ] Unit tests of 4.6 for these three objectives, journal cap 25, determinism property test.
  - [ ] 100 % line and region coverage.

**T5. `WorldEvent` contract and the quest integrity test harness**
- Outcome: one agreed `WorldEvent` enum exists and `cargo test` checks every quest data file for references, cycles and reachability.
- Done:
  - [ ] Enum of 4.4, agreed in an issue with the producer roles.
  - [ ] Integrity tests of 4.7 (references, no cycle, reachability, level band).
  - [ ] One sample quest file passes, a broken fixture fails with a clear message.

**T6. Quest grant: XP, gold, reputation, grey rule**
- Outcome: turning in a quest returns a `Grant` with integer XP from `XP_required`, gold and reputation, and grey quests give no XP.
- Done:
  - [ ] Grant arithmetic of 6.1, grey boundary tests.
  - [ ] Applied to the hero by `progression-talents`' API (contract test).

**T7. Lineage and NPC data with integrity tests**
- Outcome: the 8 lineages and their mentors exist as data, checked against the class list.
- Done:
  - [ ] `data/lineages.ron`, `data/npcs.ron` (mentors and Lumen camp NPCs), text keys in `en`.
  - [ ] Integrity: one lineage per class, mentors exist.

**T8. Tutorial lesson engine (lesson data and goal detection)**
- Outcome: the 8 lessons of 15.2 exist as data and `lesson_goal` says when each one is done from combat effects.
- Done:
  - [ ] `data/tutorial/lessons.ron`, `tutorial.rs`, one passing and one near-miss test per lesson.
  - [ ] Restart on defeat; Path effects off in lessons 1 to 7.

**T9. Tutorial in the browser: lessons 1 to 8 from a new hero**
- Outcome: a new hero plays the Lumen camp lessons with Tally lines, frame instructions and scripted ghosts, and reaches level 5.
- Done:
  - [ ] Client flow and frame text, vitest for the pure parts.
  - [ ] Playwright: lessons 1 to 4 in one spec, 5 to 8 in another; screenshots.

**T10. Lineage trial (level 5) for the R2 classes**
- Outcome: at level 5 a Guardian, Warrior, Mage or Healer takes the trial, picks a tier-1 ability and wins a board that teaches it.
- Done:
  - [ ] Trial quests and 16 boards (4 classes x 4 abilities), each with a scripted win and a scripted no-ability loss test.
  - [ ] Active point gated by the trial flag (contract test).
  - [ ] e2e: Warrior trial with Charge; screenshot.

### R4: world v1

**T11. Map markers (`!`, `?`) and NPC placement on the world map**
- Outcome: quest givers on the map show a glyph and color marker that follows the quest state.
- Done:
  - [ ] `markers` pure function and its table tests (7.3).
  - [ ] Client layer; e2e: marker turns from `!` to `?`; screenshot.

**T12. Exploration quest for zone 1**
- Outcome: entering the Lumen Plains starts an exploration quest that completes at 100 % discovered and grants a title.
- Done:
  - [ ] `Discover` objective, title grant, tests at 9999 and 10000 bp.
  - [ ] Depends on `world-generation` discovery events.

### R6: quests

**T13. Remaining objectives: Gather, Craft, Deliver, Puzzle, Escort, Survive, Hold**
- Outcome: every §16 objective primitive counts or checks correctly, and a lost encounter leaves the quest active.
- Done:
  - [ ] One test per variant, Deliver atomic consume, EncounterLost keeps the quest.

**T14. Quest state in the hero save and the WASM bridge**
- Outcome: quest, reputation, Codex and title state save with the hero and survive a page reload.
- Done:
  - [ ] JSON sections of 18, round trip, unknown ids dropped.
  - [ ] Bridge calls `quest_view`, `quest_act`, `world_event` (4.5).
  - [ ] e2e: reload mid-quest, tracker unchanged.

**T15. Journal window**
- Outcome: the player opens the ledger journal outside combat, sees active quests grouped and can track, abandon and locate them.
- Done:
  - [ ] `journal.ts` view model with vitest; cap message at 25.
  - [ ] e2e: accept, see it in the journal, abandon; screenshot.

**T16. Quest tracker and notices**
- Outcome: up to 5 tracked quests show on the world screen with live counts and Tally notices, hidden in combat.
- Done:
  - [ ] Tracker and notices, screen reader once per notice.
  - [ ] e2e: count goes 0/4 to 4/4 after a fight; screenshot.

**T17. Item choice of 3 on turn-in**
- Outcome: a quest that rewards an item offers 3 seeded items, the pick goes to the inventory, and a reload shows the same 3.
- Done:
  - [ ] Seed `(save seed, quest id)`, contract with `items-loot`.
  - [ ] e2e: pick one, reload before picking shows the same 3; screenshot.

**T18. Factions and reputation**
- Outcome: quests raise reputation with the 4 factions, ranks show with their thresholds and the level 40 gate.
- Done:
  - [ ] `reputation.rs`, `data/factions.ron`, boundary tests of 12.1.
  - [ ] Rank shown on the hero sheet (screenshot).

**T19. Main quest: prologue to seat 1 (The Echo)**
- Outcome: the main quest runs from the Lumen camp to the Ballast Bridge and the Holds, ending when The Echo is struck.
- Done:
  - [ ] Main quest data to seat 1, Tally lines, integrity green.
  - [ ] Scripted test: a hero completes the chain with scripted events.
  - [ ] e2e: accept from Tally, reach the Bridge; screenshot.

**T20. Zone 1 chain: Lumen Plains**
- Outcome: the Lumen Plains has its zone chain of 8 quests (TUNE) plus side quests and one escort.
- Done:
  - [ ] Data and text, XP share test of 6.2 green for zone 1.
  - [ ] e2e: first quest of the chain end to end.

**T21. Zone 2 chain: Ash Grove (finale: the Weaver Queen)**
- Outcome: the Ash Grove has its zone chain and side quests, ending on the Weaver Queen.
- Done:
  - [ ] Data and text, integrity and share tests green.

**T22. Zone 3 chain: Soot Bogs (finale: the Drowned Counter)**
- Outcome: the Soot Bogs has its zone chain and side quests, ending on the Drowned Counter and its ledger foreshadowing.
- Done:
  - [ ] Data and text, integrity and share tests green.

**T23. Period seed and daily and weekly contracts**
- Outcome: contract boards offer 3 dailies and 1 weekly picked from the UTC day and week, the same for every player.
- Done:
  - [ ] `period_seed` in Rust pinned by the `daily.ts` vector; week key boundary tests.
  - [ ] Contract pools for the hub and zone 1 to 3 outposts.
  - [ ] e2e with a fixed date; screenshot.

**T24. Bounties per zone**
- Outcome: each zone shows 5 daily bounties and a chest at 5 of 5.
- Done:
  - [ ] Picks, chest grant, tests of 9.3.
  - [ ] e2e: bounty board with a fixed date; screenshot.

**T25. Puzzle engine and format**
- Outcome: puzzles load from text, play with classic rules in `solo` or `duel`, and every stored puzzle is proven solvable.
- Done:
  - [ ] `puzzle.rs`, parse errors, the tests of 10.3, the integrity test with BFS for `solo`.

**T26. Puzzle tiles and the first 24 puzzles**
- Outcome: puzzle tiles in zones 1 to 3 open a puzzle board, a solve grants the reward once and enters the Codex.
- Done:
  - [ ] 8 puzzles per zone for zones 1 to 3 (TUNE), all proven.
  - [ ] e2e: solve `lumen.p01`; screenshot.

**T27. Codex engine**
- Outcome: the Codex unlocks bestiary, flora, lore, puzzle and boss entries from world events and reports completion.
- Done:
  - [ ] `codex.rs`, data, integrity (every entry reachable), tests of 13.2.

**T28. Codex window in the Archives**
- Outcome: the player reads Codex entries by category in the Ballast Archives, with completion and puzzle replays.
- Done:
  - [ ] `codex.ts` view model, window, replay of a solved puzzle.
  - [ ] e2e: fight a shell, see its entry; screenshot.

### R7: gathering and crafting

**T29. Profession orders on the Colony board**
- Outcome: the Colony board offers profession orders that the player completes by handing in crafted goods.
- Done:
  - [ ] Order pools per profession, `Deliver` hand-in, Colony reputation and marks.
  - [ ] e2e: hand in 5 steel ingots; screenshot.

### R8: dungeons and bosses

**T30. Main quest: seats 2 to 4 and boss Codex entries**
- Outcome: the main quest continues through the Starglass Mine, the Singing Furnace and the Glass Chapel, and each boss win fills its Codex entry with Fight again.
- Done:
  - [ ] Main quest data, relocated boss lore text, `BossWon` handling.
  - [ ] Codex Fight again (no loot, no XP) wired to `dungeons-bosses`; e2e.

### R9: full world

**T31. Zone chains 4 to 10 (one PR per zone, 7 Tasks)**
- Outcome: each remaining zone gets its zone chain, side quests, contracts, bounties, puzzles and exploration quest.
- Done (per zone):
  - [ ] Data and text, integrity and XP share tests green for the zone.

**T32. Class chains for the 8 lineages**
- Outcome: from level 30 every lineage has a 3-quest chain giving both ultimate cosmetics and its title.
- Done:
  - [ ] Data, rewards wired to `art-audio` cosmetics, trials for the 4 R9 classes (16 boards).

**T33. World events: the quest side**
- Outcome: convoy, Fissure and rare-hunt events grant their rewards to a hero who takes part, including a fight that ends after the window.
- Done:
  - [ ] `data/events.ron`, join on tile, grace rule tests.

**T34. Main quest finale: seat 5 and Tally's Bridge**
- Outcome: the main quest ends with the Abyss Walker and the raid on Tally, with the twist lines and the closing title.
- Done:
  - [ ] Data and text, Order of the Ledger line change after the raid.

**T35. Titles and Codex completion titles**
- Outcome: every title source grants its title once and the hero can show one title.
- Done:
  - [ ] `data/titles.ron`, integrity (one source each), hero sheet picker; screenshot.

### R10: multiplayer

**T36. Party quest sharing and combat credit**
- Outcome: party members share quests and each member present at a kill gets the credit, computed alike on every peer.
- Done:
  - [ ] `quest_share` message, `credited_losses`, the tests of section 8.
  - [ ] e2e with two tabs: share, accept, fight, both trackers count.
