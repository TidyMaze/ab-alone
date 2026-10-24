# Economy: implementation spec (role `economy-designer`)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, still open). Source of
truth: the validated gameplay plan (`docs/specs/rpg/plan.fr.md`, French; cited below as "§x.y").
This file does not change that plan: what it gets wrong or leaves open is listed under
[Feedback on the gameplay spec](#feedback-on-the-gameplay-spec). Nothing here is decided until an
owner closes #313 and the R0 docs PRs merge.

Tags, as in `rules.md`: **FINAL** (decided by #313's four choices, by an existing spec, or written
as decided in the plan), **TUNE** (a starting value, set in playtest or by the economy simulation of
E19), **PROPOSAL** (proposed here, an owner confirms). Every number in this file carries one; a
table whose caption says "all TUNE" tags every number in it. Section numbers, ids, issue numbers,
example coordinates and test inputs are references, not tuning numbers, and carry no tag.

## Scope

In scope (this role owns the design, the data, the pure logic and its tests):

- Currencies: gold, Glimmer (Lueur), Slivers (Éclats de verre), faction Marks, Honor, Breach
  Tokens; earning and spending rules, the gold curve, sinks and faucets.
- Items: slots, bases, rarities, iLvl, affixes, the stat budget of gear, Aspects, Uniques, Sets,
  gems and sockets, durability, binding, Gear Score.
- Loot: tables per source, personal loot, seeds, smart loot, bad-luck protection, world tiers.
- Inventory, material bag, stash, buyback, overflow.
- Merchants: services, stock, prices, the traveling merchant, the Gambler, quartermasters.
- Gathering (5 professions, nodes, tools), refining (5 stations), crafting (7 professions),
  consumables and meals, Colony orders (the item side).
- P2P trades between players and the item side of inspection.
- The economy simulation that guards the balance.

Out of scope (see "Dependencies" in each section): combat rules and the effect of a consumable or
an Aspect in a fight, the hero stat formula, XP and levels, talent trees and rune effects, the
world map and where nodes and chests sit, quests and reputation ranks, boss design, the P2P
transport, rendering and window layouts.

**Role slugs used for dependencies** (assumed names, the lead agent maps them to the real roles):

| Slug | Owns |
|---|---|
| `game-designer` | Rules text, arbitration of numbers across roles, `rules.md` delta |
| `combat-engineer` | Crate `abalone-rpg`: `CombatState`, `apply_action`, consumable and Aspect application, the end-of-fight report |
| `class-designer` | Classes, abilities, Fragments, Aspect and Set effect content |
| `progression-designer` | Hero stat formula, `g(L)`, XP curve, levels, the two talent trees, rune effects, resets |
| `world-engineer` | Crate `abalone-world` map: tiles, tile content, node and chest placement, Beacons, outposts, UTC day and week helpers |
| `encounter-boss-designer` | Packs, threat, elites, rare named, dungeons, Mythic keys, world bosses, raids |
| `narrative-quest-designer` | Quest engine and `Grant`, Colony order board, factions and reputation ranks, Codex, titles |
| `pvp-br-designer` | Arenas, template hero, battle royale rules |
| `network-engineer` | Party channel, signed messages, commit-reveal |
| `client-engineer` | WASM bridge plumbing, IndexedDB stores, windows wiring, test hooks |
| `ux-designer` | Window layouts, tooltips, compare view, rarity glyphs, accessibility |
| `art-director` | Item icons, rarity colours and glyph artwork |
| `tech-lead` | Crate layout, data format and loader, shared hash and RNG, save envelope and versioning, lints |
| `qa-engineer` | Simulation harness, bot ladder runs, e2e infrastructure |

The sibling role files use other slugs for this role: `loot-economy`
(`encounter-boss-designer.md`), `items-loot`, `economy-merchants` and `gathering-crafting`
(`narrative-quest-designer.md`). All of them mean `economy-designer`.

## Inputs read

- The gameplay plan, all of it; in detail §3, §4.2, §4.3, §4.4, §5.2, §5.3, §6.1, §6.7, §6.12,
  §7, §9 (economic runes), §10 (resets), §11, §12, §13, §14, §15, §16 (rewards), §17, §18, §19,
  §20, §21, §22, §23, §24, §25, §26.
- `SPEC.md` (§3 stack, §6 out of scope: accounts and ranking), `CONTRIBUTING.md` (§6.4, §11 strict
  TDD and coverage, §13 checks), `docs/specs/tech.md` (§1 principles, §3 determinism, §4 bridge and
  the 500 KB gzip budget, §6 signed messages and trust model, §8 persistence), 
  `docs/specs/multiplayer.md` (§3 cheating: no authority without a server),
  `docs/specs/game-design.md` (§1 pillars, §4 "no stat grind", the conflict the plan lists),
  `docs/specs/world.md` (§6 diegetic menus, §8 colour plus glyph).
- Sibling role specs: `narrative-quest-designer.md` (§6 `Grant`, §12 reputation and Marks),
  `encounter-boss-designer.md` (threat, fled balls, Mythic, world bosses, raid lockout),
  `ux-designer.md` (glyph and window conventions).
- Code: `client/src/daily.ts` (`utcDay`, `hash32`: FNV-1a plus murmur3 finaliser, integer only),
  `client/src/savegame.ts` (`KeyStore`, versioned save, decode-or-drop), `client/src/idb.ts`
  (database `ab-alone`, store `game`), `client/src/moverecord.ts` (Ed25519 via Web Crypto,
  base64url, `GENESIS`, hash chain), `client/src/session.ts` (signed wire messages),
  `crates/abalone-core/src/encounter.rs` (seed mixing `seed ^ ply * 0x9E37...`),
  `crates/abalone-core/src/game.rs` (`DefaultHasher`, not a stable cross-version hash), the
  workspace `Cargo.toml` (no `abalone-world` crate yet, no `serde` dependency yet).

Facts from the code that shape this spec:

1. There is no data folder, no `abalone-world` crate and no `serde` yet. Every economy task below
   starts after `tech-lead` lands the crate skeleton and the data loader (dependency of ECO-02).
2. `game.rs` hashes with `DefaultHasher`. Its output is not promised stable across Rust releases,
   so no loot or craft seed may use it. The economy uses one stable hash (E0.3).
3. The client already has a pure, integer-only `hash32` and a UTC day function (`daily.ts`). The
   traveling merchant (§13.2) must use "the same function", so the Rust side ports it with shared
   test vectors.
4. The client already signs and verifies Ed25519 messages (`moverecord.ts`). P2P trades (§13.4)
   reuse those helpers; no new crypto.
5. Saves follow one pattern: a versioned JSON value in IndexedDB, decoded or dropped, never shown
   half-done (`savegame.ts`). The economy part of the hero save follows the same pattern.

---

## E0. Shared design: module layout, reducer, seeds, data (§24.1, §24.2, §24.3, §24.4)

### E0.1 Where the code lives

All economy logic is pure Rust in the crate `abalone-world` (§24.2 puts "le butin, l'artisanat"
there), module `economy`:

| File | Content |
|---|---|
| `economy/mod.rs` | `EconomySave`, `EconOp`, `EconEvent`, `EconError`, `apply(save, op, ctx, data)` |
| `economy/rng.rs` | `seed_of`, `Rng` (SplitMix64), `pick_weighted` (unless `tech-lead` ships a shared one) |
| `economy/currency.rs` | `Currency`, `Wallet` |
| `economy/item.rs` | `Slot`, `Rarity`, `ItemInstance`, `validate_item` |
| `economy/affix.rs` | affix pools, `roll_affixes`, affix value maths |
| `economy/gear.rs` | `gear_stats(equipped) -> GearStats`, caps, Gear Score |
| `economy/loot.rs` | `LootSource`, `FightReport`, `fight_loot`, `chest_loot`, `quest_choices` |
| `economy/inventory.rs` | `Inventory`, `Stash`, `MaterialBag`, equip, bind, overflow |
| `economy/price.rs` | `gold_unit`, `item_value`, sell, buy, repair and service prices |
| `economy/vendor.rs` | `VendorDef`, stock, daily traveling stock, buyback |
| `economy/durability.rs` | wear rules, broken state |
| `economy/gems.rs` | sockets, gem effects, Crucible |
| `economy/gather.rs` | node readiness, channel time, yield, luck, profession XP |
| `economy/craft.rs` | refining, crafting, iLvl band, Catalyst, Glimmer |
| `economy/trade.rs` | `TradeSession` state machine, offer digest |
| `economy/sim.rs` (test only) | economy simulation (E19) |

Data (`data/`, format chosen by `tech-lead`; examples below in RON like the sibling specs),
loaded with `include_str!` (§24.3):
`items/bases.ron`, `items/affixes.ron`, `items/aspects.ron`, `items/uniques.ron`,
`items/sets.ron`, `items/gems.ron`, `loot/tables.ron`, `materials.ron`, `nodes.ron`,
`recipes/refine.ron`, `recipes/craft.ron`, `consumables.ron`, `vendors.ron`, `orders.ron`.

### E0.2 One reducer

Every economy change is one pure call (PROPOSAL):

```rust
pub fn apply(save: &EconomySave, op: &EconOp, ctx: &EconCtx, data: &EconData)
    -> Result<(EconomySave, Vec<EconEvent>), EconError>;
```

- `EconOp`: `ClaimLoot(LootGrant)`, `Equip{bag, slot}`, `Unequip{slot}`, `MoveItem{from, to}`,
  `Sell{bag}`, `Buy{vendor, line, qty}`, `Buyback{index}`, `Repair{slot: Option<Slot>}`,
  `Salvage{bag}`, `OpenSocket{item}`, `SetGem{item, socket, gem}`, `RemoveGem{item, socket}`,
  `Fuse{gem}`, `Gamble{slot}`, `Learn{schematic}`, `Refine{recipe, times}`,
  `Craft{recipe, glimmer, catalyst, gem}`, `StartHarvest{tile, node}`, `FinishHarvest{tile,
  node}`, `Wear(WearCause)`, `PayService(Service)`, `BuyStashTab`, `BuyBag`, `TradeApply(..)`.
- `EconCtx`: `data_version`, `now_ms`, `utc_day`, `utc_week`, `hero_level`, `class`, `realm`,
  `world_tier`, `location` (hub, outpost id or tile), `runes` (ranks of Trader, Prospector,
  Artisan, Triumph, First Strike, Ration Delivery), `bag_free` is derived, never passed.
- `EconEvent` is the only channel to the UI, like `Effects` for the board (tech.md §3):
  `GoldChanged{delta}`, `CurrencyChanged`, `ItemAdded{uid, to}`, `ItemRemoved`, `ItemBound`,
  `ItemBroken`, `ItemRepaired`, `MaterialChanged`, `RecipeLearned`, `ProfessionUp`,
  `OverflowAdded`, `AutoSold{uid, gold}`.
- An `Err` changes nothing (the save is returned untouched by the caller). Errors:
  `NotEnoughCurrency`, `BagFull`, `NotFound`, `Bound`, `LevelTooLow`, `WrongClass`,
  `ProfessionTooLow`, `NoStation`, `NodeNotReady`, `NotSocketable`, `Realm`, `Invalid`.

The WASM bridge (§24.4, versioned JSON, `client-engineer` wires it):
`econ_apply(save, op, ctx) -> {v:1, save, events} | {v:1, error}`,
`econ_loot(save, report, ctx) -> {v:1, grant}`, `econ_stock(vendor, ctx)`,
`econ_item_view(item, ctx)` (the tooltip numbers, so the client never recomputes a stat), and
`econ_validate_item(item)`.

### E0.3 Seeds and randomness (§1 pillar 2, §12, §15.3, §24.1)

Randomness only in loot, crafting, gathering and generation (FINAL, #313 choice 4).

- **Stable hash** (PROPOSAL): `h64(bytes)` = FNV-1a 64 bit then the SplitMix64 finaliser. The
  32-bit `hash32` of `daily.ts` is ported as `hash32` with the same test vectors in Rust and TS
  (`hash32("ab-alone daily 2026-10-24")` pinned in both suites).
- **Seed** (PROPOSAL): `seed_of(save_seed, stream, a, b) = h64(le(save_seed) ++ le(stream) ++
  le(a) ++ le(b))`. `stream` is a fixed tag: `LOOT=1, CRAFT=2, HARVEST=3, GAMBLE=4, VENDOR_DAY=5,
  BR_CHEST=6, NODE_RESPAWN=7, CHEST=8, QUEST=9, SALVAGE=10` (PROPOSAL).
- **`save_seed`**: 64 bits drawn once at hero creation with `crypto.getRandomValues` (generation,
  not combat; allowed by choice 4). Stored in the hero save.
- **Counters** in the save, incremented and saved in the same `apply` as the roll they feed:
  `fight_seq` (the "id du combat" of §12, incremented when a fight **starts**, so a reload before
  the end gives the same loot), `craft_seq`, `harvest_seq`, `gamble_seq`. A reload never re-rolls.
- **Rng**: SplitMix64 (PROPOSAL; tiny, well known, integer only). `below(n)` uses the high 64 bits
  of a 128-bit product (no modulo bias). `pick_weighted(&[(T, u32)])` walks a `Vec` in data order;
  no `HashMap` anywhere in `economy` (§24.1; `tech-lead` adds a `disallowed-types` clippy lint).
- All amounts are integers; percentages are basis points (bp, 10 000 = 100 %); multiply in a fixed
  order, floor once at the end (§24.1).

### E0.4 Save (§24.2 "la sauvegarde, versionnée", §24.5 stores `hero` and `combat`)

`EconomySave` is a field of the hero save (envelope and version by `tech-lead`), stored in the
IndexedDB store `hero` (§24.5). The stash is shared by the heroes of one **realm** and lives in a
store `stash`, key = realm (PROPOSAL, E8).

```rust
pub struct EconomySave {
    pub save_seed: u64,
    pub counters: Counters,                 // fight_seq, craft_seq, harvest_seq, gamble_seq
    pub wallet: Wallet,
    pub bag: Vec<Option<Stack>>,             // 40 slots (+ bag upgrades, E8)
    pub overflow: Vec<ItemInstance>,         // Rare+ that did not fit (E8)
    pub materials: BTreeMap<MatId, u32>,     // unlimited material bag (§12)
    pub equipped: BTreeMap<Slot, ItemInstance>,
    pub tools: BTreeMap<Profession, ItemInstance>,
    pub professions: BTreeMap<Profession, ProfLevel>, // level 0..=100 and xp
    pub recipes: BTreeSet<RecipeId>,
    pub nodes: BTreeMap<NodeKey, u64>,       // (q, r, index) -> ready_at_ms
    pub chests: BTreeMap<(i32, i32), u32>,   // tile -> utc day number opened
    pub buyback: Vec<(ItemInstance, u64)>,   // last 10, with the price paid
    pub pity: Pity,                          // rolls since the last Legendary
    pub weekly: BTreeMap<WeeklyKey, u32>,    // first-win, world boss, raid flags, by utc week
    pub meal: Option<(MealId, u8)>,          // fights left
    pub pending_trade: Option<PendingTrade>,
    pub trade_log: Vec<TradeDigest>,         // last 50
}
```

Decode or drop, like `savegame.ts`: a hero save whose economy part does not validate (an item
`validate_item` refuses, an unknown id) keeps the hero and quarantines the bad item in a list
shown as "unreadable item" (PROPOSAL; never silently delete a player's item).

### Dependencies (E0)

`tech-lead` (crate `abalone-world`, data loader, `serde`, shared hash and RNG, clippy lint, save
envelope), `client-engineer` (bridge, stores `hero` and `stash`, `crypto.getRandomValues` at hero
creation), `world-engineer` (UTC day and ISO week helpers, shared with the daily).

### Tests (E0)

- Given the string `ab-alone daily 2026-10-24`, When `hash32` runs in Rust and in TS, Then both
  return the same pinned value.
- Given `save_seed = 1`, stream `LOOT`, `a = 7`, `b = 0`, Then `seed_of` returns a pinned `u64`;
  changing any input changes it.
- Property: `pick_weighted` never returns an entry of weight 0; over 10 000 seeds the counts
  follow the weights within 3 % (TUNE) (a test of the picker, not of balance).
- Given a save and an op that fails, Then `apply` returns `Err` and the save the caller keeps is
  byte-equal to the input.
- Determinism: the same save, op and ctx serialised twice give byte-identical JSON.

### Risks (E0)

- WASM size: data files compiled in grow the bundle (tech.md §4: 500 KB gzip for core plus AI).
  Mitigation: compact data, measure in CI; split a world WASM module if needed (`tech-lead`).
- A reducer with many ops grows big. Mitigation: one file per family, `apply` only dispatches.

---

## E1. Currencies (§13.1, §4.2, §9.1, §10, §19, §20)

### Implementation

```rust
pub enum Currency { Gold, Glimmer, Slivers, Marks(FactionId), Honor, BreachTokens }
pub struct Wallet { gold: u64, glimmer: u32, slivers: u32, marks: BTreeMap<FactionId, u32>,
                    honor: u32, breach: u32 }
```

| Currency (English, PROPOSAL) | French (§13.1) | Earned | Spent | Tradeable (PROPOSAL) |
|---|---|---|---|---|
| Gold | Or | Fights, chests, quests, sales | Everywhere (E9) | Yes, in a P2P trade |
| Glimmer | Lueur | Fissure nodes (§14), quests, chests, Luck rolls | Beacon travel 1 per jump (§4.2, TUNE), crafting iLvl floor (§15.3) | Yes, as a material |
| Slivers | Éclats de verre | Elites and bosses from hero level 50 (TUNE), Mythic chests | The Gambler (E18) | No |
| Marks | Marques de réputation | Contracts, bounty chests, orders (`narrative-quest-designer` §6.1) | Faction quartermasters (E15) | No |
| Honor | Honneur | Arenas (E17) | PvP quartermaster | No |
| Breach Tokens | Jetons de Brèche | Battle royale (E17) | BR quartermaster | No |

- Adds saturate (`saturating_add`); a spend that would go below 0 is `NotEnoughCurrency`.
- No caps in v1 (PROPOSAL, KISS); the simulation of E19 watches inflation instead.
- Glimmer is a material id `mat.lueur` in the material bag, not a wallet field, so it trades and
  crafts like a material (PROPOSAL); `Wallet` exposes it read-only for the UI.
- Starting wallet: 0 gold, 5 Glimmer from the tutorial (TUNE), so the first Beacon jump at level 5
  does not need gathering (feedback F8).

### Dependencies

`narrative-quest-designer` (Marks amounts, the `Grant` fields `gold`, `lueur`, `marks`),
`world-engineer` (Beacon travel calls `PayService(Travel)`), `pvp-br-designer` (Honor and Token
amounts), `progression-designer` (Paths reset and active tree reset call `PayService(Reset)`).

### Tests

- Given 10 gold, When a service costs 11, Then `NotEnoughCurrency` and 10 gold stay.
- Given `u64::MAX - 1` gold, When 5 gold are added, Then gold is `u64::MAX`.
- Given 1 Glimmer and a Beacon jump, Then 0 Glimmer; Given 0, Then `NotEnoughCurrency`.
- Given a P2P offer with Honor, Then `validate_offer` refuses it (non-tradeable currency).

### Risks

Without caps, Honor and Tokens can be farmed against a friend (self-declared results, §19).
Accepted: they buy cosmetics only (E17).

---

## E2. Items: slots, bases, rarities, iLvl, Gear Score (§12, §7.1, §8.0)

### Implementation

**Slots** (§12: 10 hero slots, FINAL in the plan's table; English names PROPOSAL):

| Slot id | French | Implicit stat (bp of the level-1 hero stat, scaled by `g(iLvl)`, all TUNE) | Sockets max (TUNE) | Who can equip (PROPOSAL) |
|---|---|---|---|---|
| `core` | Noyau | ATQ 2000 (physical core) or PUI 2000 (magic core) | 2 | Class core type only |
| `relic` | Relique | Shield: ARM 1500; Orb, Grimoire, Hourglass: PUI 1000 | 1 | Class relic type only |
| `shell` | Coque | PV 1500, ARM 1000, RES 1000 | 3 | Any |
| `keel` | Lest | ARM 800, RES 800; may roll the +1 Weight affix | 1 | Any |
| `halo` | Halo | RES 1000 | 1 | Any |
| `amulet` | Amulette | none, +1 affix instead | 1 | Any |
| `ring1`, `ring2` | Anneaux | none, +1 affix instead | 1 | Any |
| `banner` | Étendard | Fragment PV 1000 and Fragment ATQ 1000 (bp of the Fragment's own stat) | 0 | Any |
| `talisman` | Talisman | none, out-of-combat affixes only | 1 | Any |

Tools (§12, §14) have 5 separate slots, one per gathering profession (E11).

**Core and relic types per class** (PROPOSAL, `class-designer` confirms; §12 lists 4 relic
types for 8 classes):

| Class | Core type | Relic type |
|---|---|---|
| Guardian (Gardien) | Anchor mace, physical | Shield |
| Warrior (Guerrier) | Ram hammer, physical | Shield |
| Assassin | Glass blades, physical | Hourglass |
| Healer (Guérisseur) | Lantern staff, magic | Grimoire |
| Mage | Furnace rod, magic | Orb |
| Necromancer | Ossuary scythe, magic | Grimoire |
| Chronomancer | Sand rod, magic | Hourglass |
| Geomancer | Strata maul, magic | Orb |

**Base** (`items/bases.ron`): `BaseDef { id, slot, core_type | relic_type, implicit:
[(Stat, bp)], price_base, tier_min }`. One base per slot and core or relic type (KISS, PROPOSAL):
about 20 bases, the look changes by tier through `art-director`, not by base.

**Rarities** (§12, colour **and** glyph, FINAL in the plan):

| Rarity | Affixes | Extra | Price factor (§13.3, TUNE) | Drop from iLvl (TUNE) |
|---|---|---|---|---|
| Common | 0 | — | 1 | 1 |
| Magic | 1 or 2 | — | 2 | 1 |
| Rare | 3 or 4 | — | 4 | 5 |
| Legendary | 3 | 1 Aspect (E4) | 10 | 10 |
| Unique | fixed list | fixed effect (E4) | 15 | 30 |
| Set | 2 | set bonuses at 2 and 4 pieces (E4) | 12 | 90 |

Jewelry (amulet, rings) rolls one more affix than the row (PROPOSAL, instead of an implicit).

**Instance**:

```rust
pub struct ItemInstance {
    pub uid: u64,                      // seed_of(save_seed, stream, counter, index): unique per hero
    pub base: BaseId, pub rarity: Rarity, pub ilvl: u8,
    pub affixes: Vec<RolledAffix>,      // (AffixId, roll_bp 0..=10000), sorted by AffixId
    pub aspect: Option<AspectId>, pub unique: Option<UniqueId>, pub set: Option<SetId>,
    pub sockets: Vec<Option<GemId>>,
    pub durability: u8,                 // 0..=100 (E6)
    pub bound: bool,                    // set on first equip (E8)
    pub flags: ItemFlags,               // QUEST, TEMPORARY, TEMPLATE: never tradeable
}
```

The stored roll is a quality `roll_bp`, never the stat value: the value is derived by data, so a
data fix re-balances old items without a migration (PROPOSAL).

**iLvl** (§12): the level of the monster that drops it, or of the recipe (E13), plus the world
tier bonus (E18). Range 1 to 120 (PROPOSAL, feedback F30).

**Level requirement** (PROPOSAL, gap F17): `required_level = min(100, iLvl)`. `Equip` refuses with
`LevelTooLow` below it. Crafted items use the same rule.

**Gear Score** (§12 "la moyenne des objets", PROPOSAL reading): `floor(sum of iLvl of the 10 hero
slots / 10)`, an empty or broken slot counts 0.

### Dependencies

`class-designer` (core and relic types), `progression-designer` (`g(L)` in bp, hero level-1
stats), `art-director` (rarity colours and glyphs, icons per slot and tier), `ux-designer`
(tooltip, compare view).

### Tests

- Given a Warrior and a magic core, When `Equip`, Then `WrongClass`.
- Given a level 9 hero and an iLvl 10 item, Then `LevelTooLow`; at level 10, Then equipped.
- Given 10 equipped items of iLvl 40, one of them broken, Then Gear Score 36.
- Property: for every base and rarity, `roll_item` returns an item `validate_item` accepts
  (generator and validator agree, 10 000 seeds).
- `validate_item` refuses: an unknown base, 5 affixes on a Rare, a duplicate affix, a roll above
  10 000, 3 sockets on a ring, a Weight affix off the keel, an iLvl of 121.

### Risks

Twenty bases look poor next to Diablo. Accepted for v1: affixes, Aspects and looks carry the
variety; more bases are data only.

---

## E3. Affixes and the gear stat budget (§12, §7.1, §7.2)

### Implementation

**Value of an affix or implicit** (PROPOSAL): with `ref` the level-1 hero stat of §7.2 (PV 120,
ATQ 12, PUI 12, ARM 20, RES 20, FINAL in the plan as base numbers) and
`g_bp(L) = 10000 + 900 × (L − 1)` (the plan's `g`, in bp):

`amount_bp = lo + (hi − lo) × roll_bp / 10000`, then
`value = max(1, ref × g_bp(iLvl) × amount_bp / 100 000 000)` (u64, one floor).

Example: an ATQ affix 300 to 700 rolled at 5000 bp on iLvl 50 gives 500 bp, then
`12 × 54100 × 500 / 10^8 = 3` ATQ.

**Affix pool** (`items/affixes.ron`; all ranges TUNE; slots PROPOSAL):

| Affix (§12) | Range | Slots | Weight in pool (TUNE) | Note |
|---|---|---|---|---|
| PV | 300 to 800 bp of ref | all but core, talisman | 100 | |
| ATQ, PUI | 300 to 700 bp | core, relic, amulet, rings, banner | 100 each | |
| ARM, RES | 300 to 800 bp | shell, keel, halo, relic, rings | 100 each | |
| VIT | +1 to +3 flat | keel excluded, all combat slots | 60 | §7.1 Ballast rule still applies |
| Haste | +4 to +10 flat | halo, amulet, rings, relic | 60 | §7.1 cap −2 turns, never ultimates |
| Tenacity | +8 to +20 flat | shell, keel, halo | 50 | §7.1 threshold 50 |
| Lifesteal | 100 to 300 bp | core, rings | 40 | Total cap 1500 bp (PROPOSAL) |
| +% damage on Isolated | 300 to 800 bp | core, amulet | 40 | |
| +% Shock | 500 to 1000 bp | core, keel, shell | 40 | |
| +resource per turn | +2 to +5 (resources 0 to 100 or 150) | relic, halo | 30 | Not for the Chronomancer (feedback F16) |
| +1 range, one named ability | +1 | halo, amulet | 10, Rare+ only | Max +1 per ability from all items |
| +1 rank, one named ability | R1 to R2 only | amulet | 5, Rare+ only | Never unlocks R1, never gives R3 (feedback F14) |
| Terrain immunity, one type | Lava, Brambles, Corruption, Mud | shell, keel | 10, Rare+ only | Never Chasm, Ice, Quicksand, Vent (feedback F15) |
| +1 Weight | +1 | keel only | 5, Rare+ only | §7.1: +1 in total from items (PROPOSAL in the plan) |
| Gathering bonus | yield 500 to 1500 bp or speed 300 to 800 bp | talisman, tools | 100 | Out of combat |
| Gold find | 300 to 1000 bp | talisman | 60 | Out of combat |
| Move speed in the world | 200 to 600 bp | talisman | 60 | Out of combat |

- No two affixes of the same family on one item. A family absent from the slot's pool cannot roll.
- Affix count picks uniformly inside the rarity's range (E2).
- Class smart roll (PROPOSAL): on a magic core or relic, ATQ is replaced by PUI and back, so a
  rolled item is never useless for the class that uses that base.

**Gear stats** (`gear.rs`): `gear_stats(equipped, data) -> GearStats { flat: StatBlock, bp:
StatBlock, weight: u8, haste, tenacity, lifesteal_bp, isolated_bp, shock_bp, range: Vec<(AbilityId,
u8)>, rank: Vec<AbilityId>, immunities, gather, gold_find_bp, magic_find_bp, set_bonuses,
aspects }`. Broken items (durability 0) give nothing. Caps are applied here: Weight `min(1, sum)`,
lifesteal `min(1500, sum)`, range `min(1)` per ability. The hero stat formula that adds gear to
the class and level is `progression-designer`'s; this module only returns the gear block.

**Budget target** (§7.2 "de +0 % au niveau 1 jusqu'à environ +120 % en fin de jeu"): since items
and hero stats both scale by `g`, the ramp comes from rarity, affix count, gems and set bonuses,
not from iLvl (feedback F1). Integrity test bounds (TUNE), per primary stat, in bp of the hero
base at the same level:

| Kit | Expected gear bonus on the main stat (TUNE) |
|---|---|
| Starting kit (one Common core) | 1500 to 2500 |
| Level 30, all Magic at average rolls | 2500 to 4500 |
| Level 60, all Rare at average rolls, 2 gems | 4500 to 7500 |
| Level 100, best possible (Legendary, Set 4, Perfect gems, max rolls) | 10 000 to 13 000 |

### Dependencies

`progression-designer` (stat formula, `g_bp`, Fragment derivation: do Fragments derive from gear
too, §6.9?), `class-designer` (ability ids for range and rank affixes, resource scales),
`combat-engineer` (reads `GearStats` at fight start: immunities, Shock, Isolated, lifesteal),
`game-designer` (the +1 Weight cap and the immunity list touch `rules.md`).

### Tests

- Given ATQ 300 to 700, roll 5000, iLvl 50, Then value 3 (example above). Given iLvl 1, Then 1
  (the `max(1, ..)` floor).
- Given two keels each with +1 Weight (one traded in), Then `gear_stats.weight = 1`.
- Given an item with durability 0, Then it adds nothing and `GearScore` counts it 0.
- Given the four kits above built from data, Then each bonus is inside its band (the budget test;
  it fails when data drifts).
- Given the Chronomancer, Then no rolled relic or halo has `+resource per turn`.

### Risks

Flat VIT, Haste and Tenacity do not scale with level while their thresholds are fixed (§7.1):
endgame players hit the Haste cap early. Accepted, the cap is the design (§7.1).

---

## E4. Legendary Aspects, Uniques, Sets (§12)

### Implementation

- **Aspect** (`items/aspects.ron`): `AspectDef { id, class, ability, slots, patch: AbilityPatch }`.
  `AbilityPatch` is a data delta on the ability's fields (duration +1, pierce 1, cooldown 0 and
  cost 50, ...): the format and its application are `combat-engineer`'s, the content
  `class-designer`'s (§12 examples: Monolith Shell, Furnace Core, Cracked Hourglass, Scythe of the
  Well). The economy owns: which Aspects can drop where, and that an Aspect is active only for its
  class (otherwise the item keeps its 3 affixes and shows the Aspect greyed). No Aspect
  extraction in v1 (PROPOSAL, KISS).
- **Smart loot** for Legendaries (PROPOSAL): the Aspect is of the hero's class with 8500 bp
  (TUNE), of another class otherwise, which gives P2P trades a purpose.
- **Unique** (`items/uniques.ron`): `UniqueDef { id, base, affixes: [(AffixId, lo, hi)], patch,
  sources }`. One copy of a given Unique equipped at a time (PROPOSAL). A Unique drops only from
  its `sources` (boss tables) or, at 10 % of its weight, anywhere at its iLvl (TUNE).
- **Set** (`items/sets.ron`): `SetDef { id, class, pieces: [BaseId; 4], bonus2: Patch, bonus4:
  Patch }`. 2 sets per class (§12, FINAL in the plan's numbers), so 16 sets of 4 pieces
  (PROPOSAL: 4 pieces, the smallest number that gives a 4-piece bonus, feedback F29). Pieces among
  shell, halo, keel, relic, banner. Example from §12: Ballast Anchor (Guardian), 2: Fortress costs
  20 Bulwark less; 4: each enemy push blocked by Anchoring gives 15 Bulwark (numbers TUNE).

### Dependencies

`class-designer` (Aspect, Unique and Set effects, one Aspect per ability at least: 80 Aspects at
R9, PROPOSAL), `combat-engineer` (`AbilityPatch` format, applying patches at fight start),
`encounter-boss-designer` (Unique sources in boss tables).

### Tests

- Given a Mage wearing a Furnace Core, Then `gear_stats.aspects` holds it; Given a Warrior, Then it
  is listed inactive.
- Given two copies of one Unique, When the second is equipped, Then `Invalid` (one at a time).
- Given 3 pieces of a set, Then `bonus2` only; 4 pieces, Then both.
- Integrity: every Aspect points at an existing ability of its class; every Set lists 4 bases of
  distinct slots; every Unique has a source.

### Risks

80 Aspects plus 16 sets is a lot of content for `class-designer`. Mitigation: R9 ships one Aspect
per ultimate and 1 set per class first; the rest is data.

---

## E5. Gems, sockets, Jeweler, Crucible (§12, §13.2)

### Implementation

**Gem effect by host** (PROPOSAL; §12 gives "Rubis: PV ou ATQ" and similar pairs):

| Gem | In a core | In shell, relic, halo, keel, talisman | In amulet or ring |
|---|---|---|---|
| Ruby | ATQ | PV | PV |
| Sapphire | PUI | RES | RES |
| Emerald | VIT | VIT | VIT |
| Topaz | gold find | gold find | magic find |
| Diamond | all five stats at 1/3 | ARM | all five stats at 1/3 |
| Skull | lifesteal | lifesteal at 1/2 | lifesteal at 1/2 |
| Slag Amber | — | keel only, see below | — |

Quality (§12: 5 qualities, Chipped to Perfect; values all TUNE):

| Quality | Stat bp of ref (scaled by the host's `g(iLvl)`) | VIT | Gold or magic find bp | Lifesteal bp |
|---|---|---|---|---|
| Chipped | 150 | 1 | 200 | 50 |
| Flawed | 250 | 1 | 300 | 75 |
| Normal | 350 | 2 | 400 | 100 |
| Flawless | 450 | 2 | 500 | 150 |
| Perfect | 600 | 3 | 600 | 200 |

- **Slag Amber** (§12 "Unique, sur le Lest", effect missing, feedback F13). PROPOSAL: enemy effects
  that lower the hero's Weight (Lightened, Trip, Decay, Shatter) lower it by 1 less. One quality
  only, drops from the Well (zone 10). `game-designer` confirms.
- **Sockets on drop**: each of the slot's max sockets appears with 2500 bp (TUNE).
- **Jeweler** (§13.2): `OpenSocket` costs `2 × G(iLvl) × (n + 1)` gold, n = sockets already there
  (TUNE), up to the max. `RemoveGem` returns the gem and costs `2 × G(iLvl)` (PROPOSAL: the gem is
  kept, feedback F39). `SetGem` is free.
- **Crucible** (§12): `Fuse` takes 3 gems of the same type and quality, gives 1 of the next quality,
  costs `20 × 4^q` gold, q = 0 for Chipped (TUNE: 20, 80, 320, 1280).
- Gems are materials (`mat.gem.ruby.2`), stacked in the material bag, tradeable.
- Cut gems come from the Lapidary refining step (E12): a raw gem of tier T cuts to quality T.

### Dependencies

`game-designer` (Slag Amber), `world-engineer` (Well zone tables), `ux-designer` (socket view).

### Tests

- Given a core iLvl 50 with a Perfect Ruby, Then +`12 × 54100 × 600 / 10^8 = 3` ATQ.
- Given 3 Flawed Sapphires and 80 gold, When `Fuse`, Then 1 Normal Sapphire and 0 gold.
- Given 2 Flawed and 1 Chipped, Then `Invalid`.
- Given a ring with 1 socket, When `OpenSocket`, Then `NotSocketable`.
- Given a Slag Amber in a shell, Then `Invalid`.

### Risks

Topaz magic find stacks with the talisman and world tiers. Mitigation: total magic find capped at
5000 bp (E7).

---

## E6. Durability and repair (§12, §6.7, §6.12, §13.2)

### Implementation

- Max durability 100 for every item (TUNE, gap F7). Tools have no durability (PROPOSAL, KISS).
- `Wear(cause)` on every equipped item at fight end (PROPOSAL reading of §12 and §6.12, which
  overlap, feedback F6):

| Cause | Loss (all TUNE) | Source |
|---|---|---|
| Fight won or drawn | 1 point | §12 "−1 par combat" |
| Flee | 5 points (5 %) | §6.7 |
| Defeat in the world (hero death) | 10 points (10 %), instead of the 1 | §12, §6.12 |
| Defeat against a dungeon boss, retry | 1 point (PROPOSAL, not 10) | protects the < 5 s retry of pillar 3 |

- At 0 an item is **Broken**: it stays equipped, gives no stat, no Aspect, no set count (PROPOSAL,
  as in WoW). `EconEvent::ItemBroken` drives a warning.
- **Repair** at the Blacksmith (hub) and every outpost merchant (PROPOSAL): cost
  `floor(value × missing / 100 / 5)` gold (TUNE: a full repair from 0 costs 20 % of the value,
  the same as the sell price). `Repair{slot: None}` repairs all equipped items.
- Hardcore heroes wear the same way.

### Dependencies

`combat-engineer` (fight outcome in the report), `encounter-boss-designer` (which defeats are a
"retry"), `ux-designer` (broken glyph, repair-all button).

### Tests

- Given a rare core (value 2000) at 90 durability, When `Repair`, Then 40 gold paid and 100.
- Given a defeat in the world, Then every equipped item loses 10, not 11.
- Given 3 dungeon boss retries, Then each item lost 3.
- Given a broken shell, Then `gear_stats` has no shell PV.

### Risks

Repair is the main gold sink; a too-cheap repair inflates gold. E19 measures it.

---

## E7. Loot: sources, tables, personal loot, pity (§12, §4.3, §4.4, §5.3, §6.1, §6.7, §17, §18, §22, §23)

### Implementation

**The fight report** (produced by `combat-engineer`, with the source from
`encounter-boss-designer`):

```rust
pub struct FightReport {
    pub fight_seq: u32, pub source: LootSource, pub outcome: Outcome, pub zone_level: u8,
    pub monsters: Vec<Foe { level: u8, rarity: MonsterRarity, family: Family, killed: bool }>,
}
pub enum LootSource { Skirmish, Elite, DungeonRoom, DungeonBoss{dungeon, mode, key: u8},
    RareNamed(id), WorldBoss(id), RaidBoss(id), Chest(tile), Puzzle(id), BountyChest, Event(id) }
```

`fight_loot(save, report, ctx, data) -> LootGrant { gold, items, materials, slivers, carcass }`,
seed `seed_of(save_seed, LOOT, fight_seq, 0)`. `ClaimLoot` puts it in the save.

**Rules** (all PROPOSAL; numbers TUNE):

- **Only a victory gives loot** (§6.1). Flee and defeat give nothing (§6.7, §6.12). A draw in a
  skirmish gives nothing (§6.7 "sans XP", PROPOSAL: no loot either).
- **Personal loot** (§12, FINAL in the plan): each peer of a party rolls its own grant from its own
  save. No peer sees or validates another's loot.
- **Threat share**: gold and item chances scale by `killed threat / encounter threat budget`, a
  monster that fled counts half (answers `encounter-boss-designer` Q8).
- **Grey monsters** (§4.4, 6 levels or more below the hero): gold ×2500 bp, no item roll,
  materials kept (feedback F24).
- **iLvl** = monster level (§12) + world tier bonus; boss chests + 2.

**Gold per source**, in gold units `G(L) = g_bp(L) / 1000` (L1: 10, L50: 54, L100: 99), rolled in
75 % to 125 % (all TUNE):

| Source | Gold | Item rolls (chance each) | Rarity table |
|---|---|---|---|
| Skirmish | 1 G | 1 at 3000 bp | Base |
| Elite or Champion | 3 G | 2 at 10000 bp | Elite |
| Dungeon room | 1.5 G | 1 at 5000 bp | Base |
| Dungeon boss chest | 10 G | 2 items (§17, FINAL in the plan) | Boss |
| Rare named | 4 G | 1 guaranteed Rare + 1 at 10000 bp | Elite |
| Tile chest (§4.3) | 2 G | 1 at 10000 bp | Base; trapped chests (1000 bp) roll Elite after the fight |
| Bounty chest (§16, 5 of 5) | 5 G | 1 at 10000 bp | Elite |
| World boss, first kill of the ISO week | 15 G | 2 items, 1 at least Legendary, 5 Slivers | Boss |
| World boss, later kills | 5 G | 1 at 5000 bp | Elite |
| Raid boss, once per boss per ISO week (`encounter-boss-designer` lockout) | 20 G | 2 items | Boss |

**Rarity tables** (weights in bp, all TUNE; a rarity below its "drop from iLvl" of E2 moves its
weight to Rare, Set also needs world tier Hell or more):

| Table | Common | Magic | Rare | Legendary | Unique | Set |
|---|---|---|---|---|---|---|
| Base | 5500 | 3000 | 1250 | 200 | 40 | 10 |
| Elite | 0 | 6000 | 3400 | 500 | 80 | 20 |
| Boss | 0 | 0 | 8200 | 1500 | 250 | 50 |

- **Magic find** (Topaz, talisman, world tier): Rare and better weights × `(10000 + mf) / 10000`,
  `mf` capped at 5000 bp (PROPOSAL).
- **Pity** (bad-luck protection, PROPOSAL): from hero level 10, after 30 item rolls in a row with
  no Legendary (TUNE), the next item roll is a Legendary. Counter in `save.pity`.
- **Slot pick**: uniform over the 10 hero slots (rings twice). Core and relic follow the hero's
  class with 8500 bp (TUNE).
- **Materials**: each killed monster of family Beetle or Crab (§14 Décorticage) leaves a
  **Carcass** node on the tile for 5 minutes (TUNE): `carcass = Some(tile, count)`. Each fight also
  rolls 1 reagent or herb at 2000 bp (TUNE).
- **Slivers**: from hero level 50 (TUNE): Elite 1, Boss 5 to 10, Mythic chest `10 + key` (TUNE).
- **Chests** (§4.3): one opening per tile per UTC day per hero (PROPOSAL, gap F27), seed
  `seed_of(save_seed, CHEST, tile, day)`.
- **Quest choice of 3** (§16; `narrative-quest-designer` §6.1 `Choice3`):
  `quest_choices(save, quest_id, ctx)`, seed `seed_of(save_seed, QUEST, quest_id, 0)`, 3 items of
  3 distinct slots, rarity floor Magic, iLvl = quest level.
- **Puzzle** fixed reward (§4.3): 5 G and 1 Glimmer, first solve only (PROPOSAL, matching the
  quest designer's "first solve" rule).
- **Treasure map** (§22): a Luck drop (E11) item `TREASURE_MAP{tile}`; `world-engineer` picks the
  tile; opening the cache rolls the Elite table with 2 items.
- **Rune hooks** (§9.2; effects are `progression-designer`'s, amounts here, at rank 5, linear by
  rank, all TUNE): Triumph +0.2 G per Loss inflicted; First Strike +1000 bp fight gold.

### Dependencies

`combat-engineer` (the report), `encounter-boss-designer` (sources, threat budget, lockouts,
Mythic keys), `world-engineer` (tiles, chest and treasure map placement, carcass node display),
`narrative-quest-designer` (Choice3, bounty chest, puzzle), `progression-designer` (runes),
`qa-engineer` (drop-rate simulation in E19).

### Tests

- Given save_seed S and fight_seq 12 and a fixed report, Then `fight_loot` returns a pinned grant
  (golden JSON); a second call returns the same bytes.
- Given the same report and fight_seq 13, Then a different grant (seed moves).
- Given an outcome Fled or Lost, Then an empty grant.
- Given a level 20 hero and a level 14 skirmish, Then gold is 25 % and no item.
- Given 30 rolls without a Legendary at level 10, Then roll 31 is Legendary; at level 9, Then not.
- Given a party of 2 with save seeds S1 and S2 in the same fight, Then two different grants and no
  message carries either (personal loot).
- Given a chest opened on day D, Then `Invalid` on day D and a new roll on day D + 1.

### Risks

- Loot is computed and saved on the player's machine: anyone can edit a save (§13.4, accepted).
  Determinism is about reproducibility and the absence of re-rolls by reload, not anti-cheat.
- Rare named respawn every 30 min (§5.3): a guaranteed Rare every 30 min per rare, farmable.
  E19 checks it against the gold curve.

---

## E8. Inventory, material bag, stash, binding, overflow (§12, §13.2)

### Implementation

- **Bag**: 40 slots (§12, TUNE). A slot holds one item or a stack of one consumable (20 per stack,
  TUNE). **Bag upgrades** sold by the Quartermaster store (§13.2 "sacs", feedback F5): 2 upgrades of
  +5 slots, 500 and 5000 gold (PROPOSAL, TUNE).
- **Material bag**: unlimited (§12), `BTreeMap<MatId, u32>`: raw and refined materials, reagents,
  herbs, gems, schematics, Glimmer.
- **Stash** (§12 "coffre au hub, avec 4 onglets"): 4 tabs of 40 (TUNE), tab 1 free, tabs 2 to 4
  bought from the Banker for 1000, 5000 and 25 000 gold (TUNE). Reachable at the hub only. Shared by
  the heroes of one realm (PROPOSAL).
- **Realm** (PROPOSAL, gap F35): `(Softcore | Hardcore, Eternal | Season(n))`. Stash, trades and
  mail stay inside one realm. A dead Hardcore hero loses bag and equipped items; the Hardcore
  stash stays.
- **Bind on equip** (§12, FINAL in the plan): `Equip` sets `bound = true` forever. Materials stay
  tradeable. Items flagged QUEST, TEMPORARY or TEMPLATE are never tradeable.
- **Overflow** (PROPOSAL): when the bag is full, a Common or Magic drop is sold at once at the sell
  price (`EconEvent::AutoSold`); a Rare or better goes to `overflow`, claimed later from the bag
  window. Nothing Rare+ is ever lost.

### Dependencies

`client-engineer` (stores `hero` and `stash`), `ux-designer` (bag, stash, overflow views; drag
and keyboard moves), `progression-designer` (Hardcore death hook).

### Tests

- Given a full bag and a Magic drop, Then gold rises by its sell price and the bag is unchanged.
- Given a full bag and a Legendary drop, Then `overflow` has it.
- Given an unequipped item that was equipped once, Then `bound` is still true.
- Given a stash tab 2 not bought, When an item moves to it, Then `Invalid`; after `BuyStashTab` with
  1000 gold, Then it works.
- Given a Hardcore hero and a Softcore stash, When a move, Then `Realm`.
- e2e (R5, Playwright, Chromium): open the bag with `I`, drag an item to the shell slot, the hero
  sheet shows the new PV; reload the page and it is still equipped. Screenshot in the PR.

### Risks

Auto-selling Commons can surprise. Mitigation: a single notice line per fight, and the 10-entry
buyback (E10) holds them.

---

## E9. Gold curve, prices, sinks (§13.3, §9.1, §10, §4.2)

### Implementation

- **Gold unit** `G(L) = floor(g_bp(L) / 1000)` (PROPOSAL; 10 at L1, 54 at L50, 99 at L100): every
  gold amount of every role is written in `G` of a level, so the curve follows stats.
- **Item value** (§13.3, formula FINAL in the plan): `value = price_base(slot) × rarity_factor ×
  iLvl`. `price_base` (TUNE): core 10, shell 10, relic 8, amulet 8, banner 8, keel 6, halo 6,
  ring 6, talisman 5. A separate table from the stat bases (feedback F2).
- **Sell** 20 % of value (§13.3, TUNE); **buy** from a vendor at 100 % of value (TUNE). Trader rune
  (§9.2 Négociant, values in the plan): sell × 11000 / 10000, buy × 9000 / 10000.
- **Buyback** (§13.3): the last 10 items sold, bought back at the price they were sold for.
- **Materials** sell price by tier (TUNE): raw T1 to T5: 1, 3, 8, 20, 50 gold; refined: the sum of
  its raw inputs' sell prices × 12000 / 10000 (refining adds value, PROPOSAL). Vendors never sell
  raw harvested materials (PROPOSAL, so no buy-refine-sell loop).

**Sinks** (§13.3 list; all TUNE):

| Sink | Cost | Owner of the trigger |
|---|---|---|
| Repair | E6 | economy |
| Paths reset (§9.1) | free before level 20, then `10 × level` gold (the plan's numbers) | `progression-designer` |
| Active tree reset (§10, price missing) | `5 × level` gold (PROPOSAL); variant swap free (§10) | `progression-designer` |
| Beacon travel (§4.2) | 1 Glimmer (not gold, feedback F28) | `world-engineer` |
| Crafting fee (§13.3) | 10 % of the output value, at least 1 | economy |
| Sockets (§13.3) | E5 | economy |
| Stash tabs, bag upgrades | E8 | economy |
| Gambler | Slivers (E18) | economy |
| Consumables, reagents | E10 | economy |

**Faucets**: fight gold (E7), item sales, material sales, quests (`narrative-quest-designer`
table, to be expressed in `G` units: feedback to that role, PROPOSAL mapping: Main step 10 G, Zone
5 G, Side 4 G, Daily 3 G, Weekly 10 G, Bounty 2 G, Profession order 4 G).

**Target** (TUNE, checked by E19): at every level, sinks take 40 % to 70 % of gold income for a
player who repairs and buys consumables; net gold per hour of play stays within 20 G(L) to
60 G(L).

### Dependencies

`progression-designer` (reset triggers, `g_bp`), `narrative-quest-designer` (quest gold in `G`
units), `world-engineer` (travel), `qa-engineer` (E19).

### Tests

- Given a Rare core iLvl 50, Then value 2000, sell 400, sell with Trader rank 5 = 440, buy 2000,
  buy with Trader = 1800.
- Given a level 19 hero, Then a Paths reset costs 0; level 20, Then 200.
- Given an item sold for 400, When `Buyback{0}` with 399 gold, Then `NotEnoughCurrency`.
- Given 11 items sold, Then the buyback holds the last 10.
- Integrity: for every recipe whose inputs are all sold by a vendor, `sell(output) < Σ buy(inputs) +
  fee` (no gold loop); for every craftable item, salvaging it gives no more of any material than
  the recipe used (no material loop).

### Risks

The `G` unit couples all gold to `g(L)`; if `progression-designer` changes `g`, every price moves.
That is the intent; the integrity tests catch shifts.

---

## E10. Merchants (§13.2, §21)

### Implementation

`vendors.ron`: `VendorDef { id, name_key, location: Hub(room) | Outpost(id) | Roaming, services:
Vec<Service>, stock: Vec<StockLine> }`. Every vendor with `Sell` buys any item (PROPOSAL, KISS).

| Vendor (§13.2) | Where (§21, PROPOSAL) | Services | Stock (TUNE prices) |
|---|---|---|---|
| Quartermaster store (Intendance) | Hold; a copy in every outpost | Buy, Sell, Buyback, Repair | Healing potion 1 G, Tonic 1 G, Antidote 0.5 G, Bomb 2 G, reagents 5 × T gold each, T1 tools 2 G, bag upgrades |
| Blacksmith (Forgeron) | Hold | Buy, Sell, Buyback, Repair, Salvage | Common and Magic gear of the hero level, 6 lines refreshed per UTC day |
| Jeweler (Joaillier) | Hold | OpenSocket, RemoveGem, Fuse (Crucible) | Chipped gems 1 G each |
| Alchemist | Furnace | Buy, Sell | Potions, oils, Alchemy and Cooking schematics up to T2 |
| Paths Master (Maître des Voies) | Chapel | Resets (E9) | — |
| Gambler (Parieur) | Hold | Gamble (E18) | — |
| Traveling merchant (itinérant) | One outpost a day | Buy | 6 lines a day: T3+ schematics, Rare gear at 3 × value, rare reagents |
| Faction quartermasters | Faction home (`narrative-quest-designer` §3.4) | Buy for Marks | E15 |
| PvP and BR quartermaster | Launch bay | Buy for Honor or Tokens | E17 |
| Beacon keeper | Every Beacon | Travel (1 Glimmer) | — |
| Banker | Hold | Stash tabs | E8 |

- **Daily stock** (Blacksmith lines, traveling merchant): seed `hash32("ab-alone merchant " +
  utc_day)` (the `daily.ts` function, §13.2 "même fonction"), the same for every player in the
  world (PROPOSAL; personal stock would add nothing). The traveling merchant's outpost =
  `outposts[seed % len]`.
- Prices of consumables are in `G` of the hero level (TUNE): a level 60 potion costs more than a
  level 5 one because the % heal is worth more.
- Diegetic: the merchant window is a terminal in the scene (world.md §6 rule 6); layout is
  `ux-designer`'s.

### Dependencies

`world-engineer` (outposts, rooms, UTC day), `narrative-quest-designer` (faction homes, NPC
names), `ux-designer` and `client-engineer` (merchant window), `art-director`.

### Tests

- Given day `2026-10-25`, Then the traveling merchant's outpost and 6 lines are pinned; Given the
  next day, Then they change.
- Given a level 60 hero, Then a healing potion costs 1 G = `G(60)` = 63 gold.
- Given a sale to the Jeweler, Then `Invalid` (no Sell service).
- e2e (R5): walk into the Hold, open the Quartermaster store, buy a potion, sell an item, buy it
  back; the gold counter matches each step. Screenshot in the PR.

### Risks

A shared daily stock means a guide can list it; harmless.

---

## E11. Gathering (§14, §5.2, §4.3)

### Implementation

**Professions** (§14, FINAL in the plan's list): Mining (pickaxe), Herbalism (sickle; Glimmer on
Fissures), Logging (axe), Shelling (Décorticage, knife), Fishing (rod). Levels 0 to 100.

**Tiers** (§14): T1 at profession 0, T2 at 20, T3 at 40, T4 at 60, T5 at 80 (the plan's numbers,
TUNE). A node of tier T needs profession level ≥ the T threshold (`ProfessionTooLow`). Tool tier
does not gate (PROPOSAL, as in New World); it speeds up.

**Material ladder** (PROPOSAL; bold names come from §5.2 or §14, the others fill the gaps of
feedback F10, F11, F12; `narrative-quest-designer` may rename):

| Family (station) | Profession | T1 (zones 1 to 2) | T2 (3 to 4) | T3 (5 to 6) | T4 (7 to 8) | T5 (9 to 10) |
|---|---|---|---|---|---|---|
| Ore (Foundry) | Mining | **Iron** | Coal (Dunes, Crests) | **Starglass** | **Orichalcum** | **Mother-slag** |
| Precious ore (Foundry) | Mining | — | **Silver**, **Gold** | — | — | — |
| Stone (Lapidary) | Mining | **Stone** | **Silica** | Crest granite | **Obsidian** | Mother crystal |
| Raw gem (Lapidary) | Mining (Luck) | Chipped | Flawed | Normal | Flawless | **Perfect** (the Well) |
| Wood (Sawmill) | Logging | **Softwood** | **Ashwood** | Frostpine | Saltwood (driftwood) | Vitrified wood |
| Fibre (Weavery) | Herbalism | **Glassflax** | Soot reed | Frost flax | **Seaweed** | Essence thread (**Essences**) |
| Hide (Tannery) | Shelling | **Chitin** | Scarab chitin | **Thick chitin** | Ballast-crab shell | Vitrified shell |
| Herbs (Alchemy, no refining) | Herbalism | **Glowflower**, herbs | **Mushrooms**, **Peat**, rare herbs | Frost moss | **Sulphur** | — |
| Fish (Cooking) | Fishing | Pond fish | — | Under-ice fish | **Fish**, **Pearls**, **Salt** | Abyss fish |
| Glimmer | Herbalism on Fissures | 1 to 2 per harvest in every zone | | | | |

**Nodes** (`nodes.ron`): `NodeDef { id, profession, tier, biomes: [(BiomeId, weight)], yield: (lo,
hi), xp, luck_table }`. `world-engineer` places 0 to 3 nodes per tile (§14) from the tile seed and
these weights; the economy reads `(tile, index) -> NodeDef`.

- **Respawn** per player (§14: 10 to 30 real minutes, TUNE): `ready_at = now + (10 + seed %
  21) min`, seed `seed_of(save_seed, NODE_RESPAWN, tile, index ++ harvest_seq)`. A node absent from
  `save.nodes` is ready. Entries past `ready_at` are pruned on save.
- **Rich vein** (§14, ×3, "rare"): 500 bp of nodes (TUNE), from the tile seed (`world-engineer`).
- **Channel** (§14: 3 s base, TUNE): `ms = max(1000, 3000 × (10000 − tool_speed_bp − 15 ×
  prof_level) / 10000)` (PROPOSAL). `StartHarvest` stores the start time; `FinishHarvest` at
  `start + ms` or later gives the yield; an aggro (`world-engineer`) or a move cancels (no op is
  sent, nothing changes).
- **Yield**: `floor(roll(lo..=hi) × (10000 + tool_yield_bp + talisman + Prospector) / 10000)`, ×3
  on a rich vein. Prospector rune rank 5: +2000 bp (TUNE).
- **Luck** (§14 "Chance"): `300 bp + tool_luck_bp` (TUNE) for one pick in the node's luck table:
  raw gem of the node tier, a schematic of that profession tier, 1 to 3 Glimmer ("Lueur pure"),
  a trophy (a sellable curiosity worth 5 G, TUNE).
- **Profession XP**: `prof_xp(n → n + 1) = 40 + 8n` (TUNE); a harvest gives `10 × T` XP, halved if
  the node tier is below the profession's tier band (TUNE). **Hero XP**: a harvest gives
  `XP_required(L) × 20 / 10000` (TUNE, a share `progression-designer` books in "exploration").
- **Carcass** nodes (E7) use Shelling and the family tier.
- **Fishing**: "Shoal" nodes on Water and coast tiles, the same channel (no mini-game in v1).
- **Tools** (§14): T1 to T5, made by Engineering (E13), `ToolStats { tier, speed_bp, yield_bp,
  luck_bp, no_aggro: bool }`; T1 tools sold by the Quartermaster store; "no aggro while
  harvesting" only on T4 and T5 tools (PROPOSAL).
- **Lodes** (§14, v2): a rich vein may open a radius-2 puzzle board; success = yield ×5 (the plan's
  number, TUNE). Board and rules are `encounter-boss-designer`'s and `narrative-quest-designer`'s
  puzzle engine; economy only multiplies the yield.

### Dependencies

`world-engineer` (node placement, rich veins, Fissures, aggro interrupt, the harvest click and
channel bar), `progression-designer` (hero XP share, Prospector rune), `encounter-boss-designer`
(carcass families, Lodes v2), `narrative-quest-designer` (names, Gather objectives),
`ux-designer` (channel bar, profession panel).

### Tests

- Given Mining 19 and a T2 node, Then `ProfessionTooLow`; Mining 20, Then the channel starts.
- Given profession 0 and no tool, Then 3000 ms; profession 100 and a tool at 2000 bp, Then 1950 ms;
  never below 1000.
- Given a node harvested at t, Then `NodeNotReady` until its pinned `ready_at`, then ready.
- Given the same save and harvest_seq, Then the same yield and Luck result (reload never re-rolls).
- Given a rich vein, Then the yield is ×3.
- e2e (R7): click a node next to the hero ball, see the channel bar, the material appears in the
  bag, the node shows as harvested; reload, it is still harvested. Screenshot in the PR.

### Risks

The world (§4.1) has about 11 000 tiles × up to 3 nodes; `save.nodes` holds only harvested nodes
still on cooldown, so it stays small.

---

## E12. Refining (§15.1)

### Implementation

**Stations** (§15.1, 5, FINAL in the plan's list): Foundry (ore to ingot), Tannery (chitin to plate),
Weavery (fibre to cloth), Sawmill (wood to plank), Lapidary (stone to block, raw gem to cut gem).
The hub has all 5 (the Furnace room, §21). Each outpost has 1, the one its biome's resources need
(PROPOSAL, §21 "une station de raffinage").

**Recipe rule** (§15.1): tier T output = refined T − 1 + raw T + reagent. T1 has no lower input
(PROPOSAL reading, feedback F10):

| Tier | Inputs (all counts TUNE) | Example (Foundry) |
|---|---|---|
| T1 | 4 raw T1 | Iron ingot = 4 Iron |
| T2 | 2 refined T1 + 4 raw T2 + 1 reagent | Steel = 2 Iron ingot + 4 Coal + 1 Flux (the plan's "Acier", feedback F10) |
| T3 | 2 refined T2 + 6 raw T3 + 2 reagent | Starglass ingot = 2 Steel + 6 Starglass + 2 Flux |
| T4 | 2 refined T3 + 8 raw T4 + 3 reagent | |
| T5 | 2 refined T4 + 10 raw T5 + 4 reagent | |

Reagents (§15.1): Flux (Foundry), Tannin (Tannery), Solvent (Weavery), Oil (Sawmill), Sand
(Lapidary, "Sablon"). Bought at the Quartermaster store (E10) or found by Luck.

`Refine{recipe, times}` refines a batch; it needs the station at `ctx.location`, the materials and
no profession level (PROPOSAL: refining has no profession in §15.1; it gives XP to the crafting
profession that uses the output: 5 × T per unit, TUNE).

### Dependencies

`world-engineer` (station locations), `narrative-quest-designer` (Craft and Gather objectives,
orders), `ux-designer` (station window).

### Tests

- Given 8 Iron at the Foundry, When `Refine{iron_ingot, 2}`, Then 2 ingots and 0 Iron.
- Given 7 Iron, When `times = 2`, Then `NotEnoughCurrency` (materials) and nothing changes.
- Given an outpost with only a Sawmill, When a Foundry recipe, Then `NoStation`.
- Integrity: every refine recipe's inputs exist, tiers rise by exactly 1, every family has T1 to T5.

### Risks

A five-family, five-tier ladder is 25 refined materials plus precious lines: big for R7. R7 ships
T1 and T2 of all 5 families (ECO-16); T3 to T5 are data in R9.

---

## E13. Crafting (§15.2, §15.3)

### Implementation

**Professions** (§15.2, 7, FINAL in the plan's list), levels 0 to 100:

| Profession | Makes (§15.2) |
|---|---|
| Forge | Physical cores, keels |
| Arcane workshop | Magic cores, relics |
| Armoury | Shells, halos |
| Jewelcrafting | Rings, amulets, gem cutting at higher yield |
| Engineering | Tools, banners, traps, bombs |
| Alchemy | Potions, oils, elixirs, Catalysts |
| Cooking | Meals |

**Recipe** (`recipes/craft.ron`): `CraftDef { id, profession, req_level, tier, inputs: [(MatId,
u32)], output: Gear{base, rarity: Magic | Rare | Legendary(aspect)} | Consumable(id, n) |
Material(id, n) | Tool(stats), xp, learn: Level | Schematic | Faction(id, rank) }`.

- **Learning** (§15.3): by level (known at `req_level`), by schematic (`Learn` consumes a schematic
  material; schematics trade), or at a faction quartermaster (E15).
- **iLvl band** (§15.3 "une fourchette", PROPOSAL): tier T covers `lo = 20T − 19` to `top = 20T`.
  `reach = clamp(prof_level − req_level + 5, 0, 19)`, `hi = lo + reach`. The iLvl rolls uniformly
  in `[lo', hi]` where `lo' = min(hi, lo + glimmer_spent + artisan)`.
- **Glimmer** (§15.3 "remonte l'iLvl minimum"): each Glimmer spent raises `lo'` by 1, at most
  `hi − lo`.
- **Artisan** rune (§9.2): +3 to `lo'` at rank 5 (TUNE).
- **Catalyst** (§15.3 "garantit un affixe"): one Catalyst per craft names one affix family; the item
  has it, the other affixes roll. Catalysts are Alchemy recipes made from salvage residue (E10).
- **Gem at creation** (§15.3): the craft may consume one gem; the item gets 1 socket filled, free of
  the Jeweler fee.
- **Rarity**: crafted gear is Magic (2 affixes) at T1 and T2, Rare (3 affixes) from T3 (PROPOSAL);
  loot Rares can reach 4 affixes, which keeps loot worth chasing (§15.3 "l'artisanat donne le
  contrôle, le butin la chance").
- **Named craftables** (§15.3): T5 Legendary recipes with a fixed Aspect that need one boss
  component (`mat.boss.<boss_id>`, from that boss's table at 2500 bp, TUNE).
- **Fee**: 10 % of the output value (E9).
- **Seed** (§15.3 "graine de la sauvegarde"): `seed_of(save_seed, CRAFT, craft_seq, 0)`, with
  `craft_seq` incremented in the same `apply` (feedback F40).
- **XP**: `20 × T` per gear craft, `5 × T` per consumable (TUNE); the curve of E11.
- **Salvage** (§13.2 Blacksmith "recycler"): an item gives refined materials of its tier and slot
  family: Common 1, Magic 2, Rare 3, Legendary or Unique or Set 5 (TUNE), plus Residue from Rare
  and Bright residue from Legendary, Unique, Set. Seed `SALVAGE`.

### Dependencies

`progression-designer` (Artisan rune), `class-designer` (Aspects of named craftables),
`encounter-boss-designer` (boss components), `world-engineer` (stations), `ux-designer` (craft
window with the iLvl band preview), `narrative-quest-designer` (Craft objectives).

### Tests

- Given Armoury 20, a T1 recipe at req 0 and no Glimmer, Then `hi = 1 + 19 = 20` and iLvl in 1..=20.
- Given Armoury 0 and a req 0 T1 recipe, Then `hi = 6`; with 3 Glimmer, Then iLvl in 4..=6.
- Given 10 Glimmer and `hi − lo = 5`, Then only 5 are spent.
- Given a Catalyst "Tenacity" on a shell, Then the item has Tenacity, rolled in range.
- Given the same save and craft_seq, Then the same item (golden JSON); the next craft differs.
- Given a craft without the station, Then `NoStation`; without the recipe, Then `NotFound`.
- e2e (R7, the R7 exit criterion "fabriquer un objet à partir de matériaux récoltés"): harvest
  Iron and Glassflax with test hooks for the clock, refine at the Foundry, craft a T1 keel at the
  Forge, equip it. Screenshot in the PR.

### Risks

Crafted Rares with a chosen affix can beat loot for most of the game. E19 compares a crafter's and
a looter's kit at level 60.

---

## E14. Consumables and meals (§15.4, §6.3, §9.2)

### Implementation

`consumables.ron`: `ConsumableDef { id, effect: CombatEffectRef, stack: 20, price_g_bp, recipe }`.
The economy owns the item, the stack, the price and the recipe; the effect in a fight is
`combat-engineer`'s (an Action rapide, §6.3), the numbers below come from §15.4:

| Consumable | Effect (§15.4) | Recipe (PROPOSAL, TUNE counts) |
|---|---|---|
| Healing potion | heals 30 % max HP | Alchemy 0: 2 Glowflower |
| Tonic | +30 resource (feedback F16 for the Chronomancer) | Alchemy 10: 2 herbs + 1 Peat |
| Antidote | removes Poison, Bleed, Burn (PROPOSAL, §15.4 gives "—") | Alchemy 5: 1 Mushroom |
| Oil (Fire, Frost, Lightning) | adds the element tag to attacks for 3 turns (TUNE) | Alchemy 20: 1 Sulphur or Frost moss or Salt + 1 Oil |
| Bomb | radius 1 damage 100 % ATQ physical (TUNE), push 1 without ejection | Engineering 10: 1 Iron ingot + 1 Coal |
| Liquid ballast | +1 Weight for 2 turns (a status, not the item cap of §7.1) | Alchemy 30: 1 Steel + 1 Silica |

- One tier per consumable (PROPOSAL): the effects are % based, so tiers would add nothing
  (feedback F22).
- **Per fight**: 1 per turn, at most 3 per fight (§15.4, the plan's numbers). The counter is in the
  combat state (`combat-engineer`); the economy removes the item when the fight report lists it.
- **Ration Delivery** rune (§9.2, "un consommable gratuit par combat"): the first consumable used in
  a fight is not removed from the bag; it still counts in the 3 (PROPOSAL, feedback F22).
- **Clever Hunter** rune (§9.2, "recharge plus courte des consommables"): consumables have no
  cooldown (§15.4); PROPOSAL: it raises the per-fight cap to 4 (feedback F22).
- **Meals** (Cooking, §15.2 "bonus pour les N prochains combats"): +1000 bp of one stat for the next
  3 fights (TUNE, N = 3 PROPOSAL); one meal at a time, a new one replaces it; `save.meal` counts
  down in `ClaimLoot` and on defeat.

### Dependencies

`combat-engineer` (effects, per-fight cap, the report lists consumables used), `progression-designer`
(runes), `game-designer` (Bomb numbers), `class-designer` (resource scales).

### Tests

- Given a fight report with 2 potions used and Ration Delivery, Then 1 potion leaves the bag.
- Given a meal with 3 fights and 3 victories, Then `meal = None`.
- Given 20 potions in a stack and a 21st, Then a second stack in a new bag slot.

### Risks

None beyond the rune wording.

---

## E15. Colony orders and faction quartermasters (§15.5, §13.5, §13.1)

### Implementation

- **Orders** (§15.5): `OrderDef { id, profession, wants: [(MatId | ItemBaseId, n)], reward: { gold_g:
  4, prof_xp, rep: ("colony", 150), marks: 1 } }` (rewards TUNE, from the quest designer's table).
  The board, the daily pick and the Deliver objective are `narrative-quest-designer`'s; the
  economy ships `orders.ron` and the `Deliver` op that removes the materials atomically.
- **Faction quartermasters** (§13.5 "débloquent des recettes, des cosmétiques, de l'Élan et des
  titres"): `StockLine { cost: Marks(faction, n), rank_min, item }`. Content per faction (PROPOSAL):
  Colony: crafting schematics T3 to T5 (10 to 40 Marks, TUNE); Quiet Vitrified: gathering tools and
  Luck talismans; Order of the Ledger: Mythic key rerolls, cosmetic banners; Ballast Strippers:
  PvP cosmetics. Momentum and titles are granted by the rank itself (`narrative-quest-designer`),
  not bought.

### Dependencies

`narrative-quest-designer` (ranks, board, Grant, Marks amounts), `progression-designer` (Momentum).

### Tests

- Given Colony rank Friendly and a line needing Honored, Then `Invalid`.
- Given an order wanting 5 Steel and 5 in the bag, When delivered, Then 0 Steel and the Grant
  follows (integration test with the quest engine in R7).

---

## E16. P2P trades and inspection (§13.4, §21)

### Implementation

**Where** (PROPOSAL, gap F31): only between members of one party (the party channel of
`network-engineer`), in the hub or out of combat, same realm (E8). Tradeable: unbound items,
materials (Glimmer and gems included), gold. Not: Slivers, Marks, Honor, Tokens, flagged items.

**Messages** (JSON on the party channel, signatures with `moverecord.ts` helpers, Ed25519):

| Message | Fields | Signed |
|---|---|---|
| `trade_open` | `trade` (random 128-bit id), `from`, `to` | no |
| `trade_offer` | `trade`, `rev`, `items: [ItemInstance]`, `mats: [[id, n]]`, `gold` | no |
| `trade_lock` | `trade`, `rev_a`, `rev_b`, `digest` | no |
| `trade_sign` | `trade`, `digest`, `pub`, `sig` over `["trade", trade, digest]` | yes |
| `trade_cancel` | `trade` | no |

`digest = SHA-256(canonical JSON of [offer_a, offer_b])`, canonical = keys sorted, the economy's
own serialiser (PROPOSAL, `tech-lead`).

**State machine** (`trade.rs`, pure): `Open → Locked(digest) → SignedBySelf → Done | Cancelled`.

1. Any new offer moves both sides back to Open (the "double confirmation" of §13.4: lock, then
   sign).
2. On `trade_lock` from both with the same digest, each peer checks: its own offer is in its save;
   every incoming item passes `validate_item`, is unbound and unflagged, has a uid absent from its
   save; the bag has room; gold and materials are owned.
3. Before sending `trade_sign`, a peer stores `pending_trade` (both offers, the digest, its own
   signature) in its save.
4. A peer that holds both valid signatures runs `EconOp::TradeApply`: removes its offer, adds the
   other's (uids kept, `bound = false`), clears `pending_trade`, appends the digest and both
   signatures to `trade_log`.
5. A `pending_trade` with only its own signature is resent at the next contact with that key; the
   player can drop it only while the other signature never arrived (then nothing was applied on
   this side).

**Inspection** (§21, §13.4 "auto-déclaré, non vérifié"): a peer shares its equipped items;
the receiver runs `validate_item` on each and shows "self-declared, unverified" on all, plus
"impossible item" when validation fails.

### Dependencies

`network-engineer` (party channel, message routing, key binding to seats), `client-engineer`
(trade window wiring, Web Crypto), `ux-designer` (trade window: two columns, lock and confirm
states, the unverified label), `tech-lead` (canonical JSON).

### Tests

- Given two `TradeSession`s fed the same messages, Then both reach Done with the same digest.
- Given a new offer after lock, Then both sides are back to Open and an old `trade_sign` is refused
  (digest mismatch).
- Given an incoming bound item, a flagged item, an item with 5 affixes on a Rare, or a uid already
  owned, Then the lock is refused with the reason.
- Given A signed and B's signature lost, Then A has `pending_trade` and nothing applied; on resend,
  Then Done.
- Given Hardcore and Softcore heroes, Then `trade_open` is refused (`Realm`).
- e2e (R10, two browser tabs, Playwright): A offers an unbound ring and 100 gold, B offers 5 Steel,
  both lock and confirm; each tab shows the other's goods; reload both, still there. Screenshot in
  the PR.

### Risks

- Duplication: an edited save can offer the same item twice to two friends (§13.4, accepted in the
  plan). The uid check stops only a naive copy into the same save.
- Two-generals: if the last signature is lost, one side has applied and the other not until the
  resend. Accepted: `pending_trade` repairs it on the next contact.

---

## E17. PvP and battle royale economy (§19, §20)

### Implementation

- **Honor** (§19, PROPOSAL, TUNE): ranked or free arena win 30, loss 10, draw 15; duels give 0
  (§19 "sans enjeu"). Each peer computes its own Honor from the signed match log (self-declared).
- **Breach Tokens** (§20, PROPOSAL, TUNE): `5 × (7 − place)` for 6 players (1st 30, 6th 5).
- **Quartermaster** (§19, §20): cosmetics (board skins, marble skins, banners) 200 to 2000 Honor or
  Tokens, titles; "template items" are cosmetic skins of the template kit with no stats (PROPOSAL,
  feedback F19); no Momentum for Honor (feedback F20).
- **Gear in PvP**: ranked arenas and BR ignore `gear_stats` (§19, §20 normalised, FINAL in the
  plan); free arenas use it. No durability loss in arenas, duels or BR (PROPOSAL).
- **BR loot in the match** (§20): chests on board cells, generated at match start from the shared
  match seed `seed_of(match_seed, BR_CHEST, cell, 0)` (`match_seed` from commit-reveal), so every
  peer sees the same chests (feedback F36: not the personal seed of §12). Content table (TUNE):
  consumable 5000 bp, temporary stat item (+1000 bp of one stat for the match) 3000 bp, ultimate
  scroll (the class ultimate for the match) 2000 bp. Items are TEMPORARY: they never enter the
  inventory and vanish at the end.

### Dependencies

`pvp-br-designer` (formats, template hero, chest cells and pickup rule), `network-engineer`
(match seed), `combat-engineer` (temporary items as effects in the BR state).

### Tests

- Given match seed M and cell (2, −3), Then a pinned chest content on every peer.
- Given a free arena win, Then +30 Honor and no durability loss.
- Given a ranked arena, Then the fight uses no `GearStats`.

---

## E18. Endgame economy: world tiers, Mythic, Gambler, seasons, Hardcore (§23, §17, §13.2, §11)

### Implementation

**World tiers** (§23, "chaque niveau augmente les stats, le butin et l'iLvl"; all TUNE):

| Tier | iLvl bonus | Gold | Magic find | Sets drop |
|---|---|---|---|---|
| Normal | +0 | 10000 bp | +0 | no |
| Nightmare (level 50) | +5 | 12500 bp | +500 | no |
| Hell (level 70) | +10 | 15000 bp | +1000 | yes |
| Torment (level 100) | +15 | 20000 bp | +2000 | yes |

**Mythic** (§17): chest of 2 items, iLvl `100 + tier bonus + min(5, key / 4)`, capped at 120
(PROPOSAL); Legendary weight `2000 + 250 × key` bp (TUNE); Slivers `10 + key`; the "budget de
tours" kept raises the key (`encounter-boss-designer`). First win of the ISO week per dungeon:
+1 item at least Rare (PROPOSAL, §17 "bonus de première victoire").

**Gambler** (§13.2, Kadala): from hero level 50 (PROPOSAL). `Gamble{slot}` costs Slivers: core or
relic 75, shell 50, others 25 (TUNE). Item iLvl = hero level + tier bonus; rarity weights: Rare
9000, Legendary 900, Unique 100 (TUNE); smart class pick for core and relic; seed `GAMBLE`,
`gamble_seq`.

**Seasons** (§23, 3 months; §26 Q4, PROPOSAL for v2): a season hero lives in realm `Season(n)` with
its own stash; at the season end its items move to the Eternal stash of the same mode as a
read-only "season tab".

**Hardcore** (§11): the realm rule of E8.

### Dependencies

`encounter-boss-designer` (Mythic keys and weekly flags), `world-engineer` (tier unlock dungeons,
ISO week), `progression-designer` (tier unlocks by level), `game-designer` (§26 Q9: are world
tiers a difficulty slider?).

### Tests

- Given Torment and a level 100 boss, Then chest iLvl 117 and gold × 2.
- Given key 20, Then iLvl 120 (cap) and Legendary weight 7000.
- Given 74 Slivers and a core gamble, Then `NotEnoughCurrency`.
- Given the same save and gamble_seq, Then the same item.

---

## E19. Economy simulation and the balance guard (§24.3, §25, §11)

### Implementation

`economy/sim.rs`, test only, deterministic: a scripted hero plays the plan's pace (§11: level 10 at
1 h 30, 30 at 12 h, 60 at 45 h, 100 at about 110 h, the plan's TUNE targets) with an assumed fight
rate of 15 fights per hour (TUNE), sells non-upgrades, repairs, buys 2 potions per hour, resets
Paths twice, crafts when the recipe beats the equipped item. It reports per level band: gold
income, sinks, net gold, Legendaries found, Gear Score, gear bonus on the main stat.

Guard assertions (all TUNE): net gold per hour in `[20 G(L), 60 G(L)]`; sinks 40 % to 70 % of
income; first Legendary by level 20 at the latest; Gear Score within 5 of the hero level from level
20; the E3 kit bands hold. The run writes one CSV line per level to `target/econ-sim.csv` for
`qa-engineer` to chart (never committed).

### Dependencies

`qa-engineer` (harness conventions, charts), `progression-designer` (XP curve), all the sources
above.

### Tests

The simulation is a test: it fails when a guard fails. Its seed is fixed; a second run gives the
same CSV bytes.

### Risks

A script is not a player. The guards are for drift, playtest decides the numbers.

---

## Feedback on the gameplay spec

One line each, section cited. None of these change the plan; an owner or the role named answers.

- **F1** (§7.2, §12) "+0 % at level 1" cannot hold: item stats are `base × g(iLvl)`, so any level-1
  item gives more than 0; and since gear and hero both scale by `g`, the ramp to "+120 %" must come
  from rarity, affix count, gems and sets, not iLvl. This spec reads it that way (E3).
- **F2** (§12, §13.3) The symbol `base(emplacement)` is used for both stats and price; they need two
  tables.
- **F3** (§9, §13.1, §8.3) "Éclats" names three things: the passive tree shards, the currency "Éclats
  de verre" and the Assassin lineage "de l'Éclat". This spec calls the currency "Slivers".
- **F4** (§12) The slot "Lest" clashes in English with the ship "Ballast", the Ballast Mind and the
  "Pilleurs de lest"; this spec calls the slot "Keel".
- **F5** (§12, §13.2) The Quartermaster store sells "sacs" but the inventory is a fixed 40 slots;
  bags are not defined.
- **F6** (§12, §6.12, pillar 3) Durability −10 % per death plus instant boss retries breaks gear
  after 10 tries, against "retry in under 5 s"; and §12 "−10 % à chaque mort" and §6.12 "défaite:
  −10 %" may be counted twice.
- **F7** (§12) "−1 par combat" has no maximum durability and no rule for an item at 0.
- **F8** (§4.2, §25) Beacon travel costs Glimmer from R4, but currencies arrive in R5 and Fissures
  in R7.
- **F9** (§25 R7, §15.1, §15.2) R7 says "4 stations" while §15.1 lists 5 refining stations and
  §15.2 7 crafting professions; which 4 is not said.
- **F10** (§15.1) The rule "refined T−1 + raw T + reagent" and the example "Acier = Lingot de fer +
  Flux + Charbon" disagree: coal is in no biome list, and T1 has no lower refined input.
- **F11** (§5.2, §14) The biome resource lists do not cover 5 tiers for wood (zones 1 and 2 only),
  fibre, hide or stone; "Essences" and "Tourbe" have no use; this spec fills the gaps (E11).
- **F12** (§14, §5.2) The ore ladder puts Silver at T2, but §5.2 puts Silver in the Iron Crests
  (levels 30 to 45, T3 zone); Iron is in zones 1 and 5.
- **F13** (§12) The gem "Ambre-scorie: Unique, sur le Lest" has no effect.
- **F14** (§12, §10) The affix "+1 rang" meets the R3 variant (2 points, a choice); what it gives on
  an R2 ability is unsaid, and it bends the "exactly 20 points" budget.
- **F15** (§12, §6.10) The affix "Immunité à un type de case" would allow immunity to Chasm, Ice or
  Quicksand, which removes ejection sources; the list must exclude them.
- **F16** (§12, §15.4, §8.7) "+ressource par tour" and the Tonic "+30 de ressource" do not fit the
  Chronomancer (grains 0 to 6).
- **F17** (§12, §13.4) No level requirement to equip: a traded iLvl 60 item would fit a level 10
  hero.
- **F18** (§12, §13.4) Bind on equip is defined, but not whether quest rewards, template items and
  BR items can be traded; this spec flags them never tradeable.
- **F19** (§19) "Objets de gabarit" bought with Honor contradict fixed template stats in ranked
  play; this spec makes them cosmetic.
- **F20** (§19, §4.2, §11) Momentum ("Élan") has three sources: levels 20 and 40, a level-10 quest,
  and Honor.
- **F21** (§13.1, §13.5) Marks amounts and quartermaster prices are absent (the quest designer
  proposed amounts).
- **F22** (§15.4, §9.2) Consumables have no cooldown, yet the rune "Chasseur ingénieux" shortens it;
  "Livraison de rations" does not say whether the free item counts in the 3; % effects make
  consumable tiers pointless.
- **F23** (§15.2) Meals: N fights is not given, nor whether meals stack.
- **F24** (§4.4, §11) Grey monsters give no XP, but gold and loot are not addressed: farming low
  zones is open.
- **F25** (§6.7) Flee gives "no reward" even after kills; and fled pack balls (encounter designer
  Q8) are unaddressed for loot.
- **F26** (§12, §17, §23) Personal loot uses `(sauvegarde, id du combat)`, but "id du combat" is not
  defined; a counter in the save is needed so a reload does not re-roll.
- **F27** (§4.3, §22) Chests and caches have no respawn rule; the puzzle "fixed reward" has no
  amount.
- **F28** (§13.3, §4.2) "Voyages" is listed as a gold sink, but travel costs Glimmer.
- **F29** (§12) Set size is not given (2- and 4-piece bonuses need at least 4 pieces).
- **F30** (§23, §12) World tiers raise iLvl but no max iLvl is given; items above 100 need a
  level requirement rule.
- **F31** (§13.4) Trades: where (party only, hub room?), and whether gold and currencies trade.
- **F32** (§7.1, §8.7) "Hâte" is both a stat (§7.1) and a Chronomancer ability (§8.7 #5).
- **F33** (§12) Gear Score "moyenne des objets": average of what (iLvl?), and do empty slots count?
- **F34** (§13.1, §13.2) Slivers ("Éclats de verre") have no source.
- **F35** (§11, §23) Hardcore and seasons have no economy rule: can a Hardcore hero trade with a
  Softcore one, is the stash shared?
- **F36** (§12, §20) "Tous les tirages utilisent la graine (sauvegarde, id du combat)" contradicts
  BR chests on a shared board, which must use the shared match seed.
- **F37** (§13.2) The Jeweler "retrait de gemmes": is the gem kept or destroyed?
- **F38** (§12 Topaz, §23) Magic find from gems and tiers has no cap.
- **F39** (§13.2, §21) Outposts have "un marchand": which services (repair at least)?
- **F40** (§15.3) "Le tirage utilise la graine de la sauvegarde": without a craft counter, every
  craft from one save gives the same roll.
- **F41** (§13.4, §6.1) In a party, personal loot is fine, but quests "partagées" may grant Choice3
  items: does each member roll its own 3? (This spec: yes, each from its own save.)
- **F42** (sibling specs) The role spec files use three slugs for this role (`loot-economy`,
  `items-loot`, `economy-merchants`); the lead should fix one roster.

## Open questions

1. Level requirement to equip: `min(100, iLvl)`, or a softer rule? (F17)
2. Durability on dungeon boss retries: 1 point (this spec) or 10 %? (F6)
3. Trades: party only, gold included? (F31)
4. Realms: separate Hardcore and season stashes and no cross-realm trades? (F35)
5. Slag Amber effect: "enemy Weight loss reduced by 1"? (F13)
6. Bags: 2 upgrades of +5 slots, or no bags? (F5)
7. Template items: cosmetic only? (F19)
8. Resource ladder names for the gaps of F11: who names them, this role or `narrative-quest-designer`?
9. R7: which 4 stations first? This spec proposes all 5 refining stations at T1 and T2 plus 4
   crafting professions (Forge, Armoury, Alchemy, Engineering). (F9)
10. Data format: RON or JSON (§24.3)? Owned by `tech-lead`.
11. Shared hash and RNG: one module for all crates, owned by `tech-lead`, or local to `economy`?
12. Max iLvl with world tiers: 120? (F30)
13. Target Legendary rate: first Legendary by level 20, about 1 per hour at level 100?
14. Do Fragments derive from the hero's stats with gear, or without (§6.9)? (`progression-designer`)
15. Stash shared by all heroes of a realm in one browser: confirm (no accounts, SPEC §6)?

---

## Tasks

One Task = one PR from `main`, strict TDD (test commit first), 100 % line and region coverage, a
screenshot in every UI PR (CONTRIBUTING §6.4). Phases from §25. Every Task depends on the
`tech-lead` skeleton of the `abalone-world` crate and the data loader unless it says otherwise.

### ECO-01 Spec: items, economy, gathering and crafting docs (R0)
Outcome: `docs/specs/rpg/items.md`, `rpg/economy.md` and `rpg/gathering-crafting.md` exist in
English from this role spec, with the feedback answered.
- [ ] `rpg/items.md`: E2 to E6, E8, E14
- [ ] `rpg/economy.md`: E1, E7, E9, E10, E15 to E18
- [ ] `rpg/gathering-crafting.md`: E11 to E13
- [ ] Feedback F1 to F42 each answered by an owner or linked to an issue
- [ ] Docs-only PR, read by @TidyMaze (plan §0, PR 4)

### ECO-02 Stable hash, seeds and the economy RNG (R5)
Outcome: `seed_of`, `hash32` (same vectors as `daily.ts`), SplitMix64 and `pick_weighted` exist,
integer only, with pinned values.
- [ ] Test vectors shared with `client/src/daily.test.ts`
- [ ] Stream tags enum, counters struct
- [ ] Property test of `pick_weighted`; no `HashMap` (lint)
- [ ] Skipped if `tech-lead` ships a shared module first (then only the stream tags)

### ECO-03 Wallet and currencies (R5)
Outcome: gold and the other currencies can be earned and spent with saturating, refused-if-short
rules.
- [ ] `currency.rs`, `Wallet`, `Currency`
- [ ] Glimmer as material `mat.lueur`, read through the wallet
- [ ] Serde round trip in the economy save

### ECO-04 Item model, bases, rarities and `validate_item` (R5)
Outcome: items exist as data and instances, and any malformed item is refused with a reason.
- [ ] `item.rs`, `items/bases.ron` (about 20 bases), slots, class core and relic types
- [ ] Level requirement, Gear Score
- [ ] Integrity tests of the data

### ECO-05 Affixes, item generation and gear stats (R5)
Outcome: `roll_item` makes valid items and `gear_stats` returns the gear block with every cap.
- [ ] `affix.rs`, `items/affixes.ron`, value maths in bp
- [ ] Property: generator and validator agree on 10 000 seeds
- [ ] `gear.rs` with the Weight, lifesteal and range caps; broken items excluded
- [ ] The E3 kit budget test (Common, Magic, Rare kits; Legendary kit added in ECO-22)

### ECO-06 Inventory, binding, stash and overflow (R5)
Outcome: items move between bag, equipment and stash tab 1, bind on equip, and nothing Rare+ is
lost on a full bag.
- [ ] `inventory.rs`, `EconOp::{Equip, Unequip, MoveItem}`, realm field
- [ ] Overflow and auto-sell of Common and Magic
- [ ] `EconEvent`s for each change

### ECO-07 Fight loot and personal seeds (R5)
Outcome: a won fight returns a pinned, reproducible grant of gold, items and materials from the
fight report.
- [ ] `loot.rs`, `loot/tables.ron` (Base and Elite tables), `FightReport` contract agreed with
      `combat-engineer`
- [ ] `fight_seq` rule, grey rule, threat share, pity counter, chests once per UTC day
- [ ] Golden JSON tests

### ECO-08 Prices, durability, repair and the reducer bridge (R5)
Outcome: items have values, wear and repair, and the client can run any economy op through one
WASM call.
- [ ] `price.rs` (`G(L)`, value, sell, buy, repair), `durability.rs`
- [ ] `economy::apply` dispatch and errors
- [ ] `abalone-wasm`: `econ_apply`, `econ_loot`, `econ_item_view`, `econ_validate_item` with JSON
      version 1, bridge tests

### ECO-09 Merchants: store, Blacksmith, buyback, salvage (R5)
Outcome: the Quartermaster store and the Blacksmith buy, sell, buy back, repair and salvage at the
hub.
- [ ] `vendor.rs`, `vendors.ron`, daily Blacksmith lines from `hash32`
- [ ] Buyback of 10, salvage outputs, Trader rune hook
- [ ] Stash tabs and Banker, bag upgrades

### ECO-10 Bag and hero sheet window (R5)
Outcome: a player opens the bag with `I`, equips an item and sees the stat change, and it survives
a reload.
- [ ] Client wiring of `econ_apply`, store `hero` economy part, store `stash`
- [ ] Tooltips from `econ_item_view`, rarity colour plus glyph
- [ ] Playwright e2e, screenshot in the PR

### ECO-11 Merchant window and the R5 loop (R5)
Outcome: the R5 exit criterion "tuer, trouver, vendre, s'équiper" passes end to end in Chromium.
- [ ] Merchant terminal window (buy, sell, buyback, repair)
- [ ] e2e: win a scripted skirmish (test hook), loot, sell at the store, buy, equip; screenshot

### ECO-12 Gold curve, sinks and the economy simulation (R5)
Outcome: a deterministic simulation guards gold income, sinks and gear progression on every test
run.
- [ ] `sim.rs` with the E19 guards, CSV output to `target/`
- [ ] Reset fee and Beacon Glimmer hooks (`PayService`) wired for `progression-designer` and
      `world-engineer`
- [ ] No-loop integrity tests (vendor inputs, salvage)

### ECO-13 Materials ladder and node data (R7)
Outcome: every material, tier and node exists as data and passes integrity tests.
- [ ] `materials.ron` (T1 and T2 of the 5 families first), `nodes.ron` with biome weights
- [ ] Integrity: every node's materials exist, every family has its tiers in order

### ECO-14 Harvesting logic and tools (R7)
Outcome: a node can be harvested with the right profession level, gives a reproducible yield and
Luck roll, and respawns per player.
- [ ] `gather.rs`: readiness, channel time, yield, Luck, profession XP, hero XP hook
- [ ] Carcass nodes from fight loot, T1 tools at the store
- [ ] Clock passed in, never read

### ECO-15 Harvest interaction in the world (R7)
Outcome: a player clicks a node, sees the channel, gets the material, and the node stays harvested
after a reload.
- [ ] Wiring with `world-engineer`'s click and aggro interrupt
- [ ] Playwright e2e with a test clock, screenshot

### ECO-16 Refining stations (R7)
Outcome: raw materials refine into T1 and T2 refined materials at the right station.
- [ ] `craft.rs` refine part, `recipes/refine.ron`, reagents at the store
- [ ] `NoStation`, batch refine, integrity of the tier rule

### ECO-17 Crafting and the iLvl band (R7)
Outcome: Forge, Armoury, Alchemy and Engineering craft items in a seeded iLvl band, with Glimmer,
Catalysts, gems and a fee.
- [ ] `recipes/craft.ron`, `Learn`, `craft_seq`, Artisan hook
- [ ] Golden tests of the band and the Catalyst

### ECO-18 Consumables and meals (R7)
Outcome: potions, tonics, antidotes, oils, bombs, liquid ballast and meals exist, are crafted and
bought, and leave the bag when a fight uses them.
- [ ] `consumables.ron`, stacks of 20, report hook with `combat-engineer`
- [ ] Ration Delivery and meal countdown

### ECO-19 Craft and refine window, the R7 loop (R7)
Outcome: the R7 exit criterion "fabriquer un objet à partir de matériaux récoltés" passes end to
end.
- [ ] Station terminal window with the iLvl band preview
- [ ] e2e: harvest, refine, craft, equip; screenshot

### ECO-20 Colony orders, item side (R7)
Outcome: an order removes the wanted materials atomically and returns its reward to the quest
engine.
- [ ] `orders.ron`, `Deliver` op, integration test with `narrative-quest-designer`'s board

### ECO-21 Dungeon, boss, rare and world boss loot (R8)
Outcome: dungeon chests, boss tables, rare named, world boss weekly caches and raid lockouts give
their loot once per rule.
- [ ] Boss table, weekly flags by ISO week, boss components for named crafts
- [ ] Tests at the week boundary

### ECO-22 Legendaries, Aspects and Uniques (R9)
Outcome: Legendaries drop with a class Aspect that changes an ability, and Uniques drop from their
sources.
- [ ] `aspects.ron`, `uniques.ron`, `AbilityPatch` contract with `combat-engineer`
- [ ] Smart Aspect pick, inactive off-class Aspects, one Unique at a time
- [ ] E3 Legendary kit budget band

### ECO-23 Sets (R9)
Outcome: 16 four-piece sets give their 2- and 4-piece bonuses.
- [ ] `sets.ron`, set count in `gear_stats`, broken pieces excluded

### ECO-24 Gems, sockets, Jeweler and Crucible (R9)
Outcome: gems socket, unsocket and fuse with their gold costs, and their effect depends on the
host slot.
- [ ] `gems.rs`, `gems.ron`, Lapidary cutting, Slag Amber once confirmed
- [ ] Jeweler window, screenshot

### ECO-25 World tiers, Mythic chests, Gambler, traveling merchant (R9)
Outcome: endgame loot scales by world tier and key, the Gambler sells mystery items for Slivers,
and the traveling merchant moves daily.
- [ ] Tier table, Mythic chest, Slivers sources, `Gamble`, daily merchant
- [ ] e2e of the Gambler, screenshot

### ECO-26 Faction quartermasters (R9)
Outcome: Marks buy rank-gated recipes and cosmetics from each faction.
- [ ] Stock lines with `rank_min`, integration with reputation ranks

### ECO-27 Trade state machine and item validation for peers (R10)
Outcome: two pure `TradeSession`s reach the same signed result or refuse with a reason.
- [ ] `trade.rs`, canonical digest, `pending_trade`, `trade_log`
- [ ] All refusal cases of E16

### ECO-28 Trade and inspect windows over the party channel (R10)
Outcome: two players in a party trade items, materials and gold with a double confirmation, and
inspection shows "self-declared, unverified".
- [ ] Message wiring with `network-engineer`, Web Crypto signatures
- [ ] Two-tab Playwright e2e, screenshot

### ECO-29 Honor, Breach Tokens, quartermaster and BR chests (R10)
Outcome: arenas and the battle royale pay their currencies, and BR chests are the same on every
peer.
- [ ] Amounts from the signed match result, cosmetic stock
- [ ] Shared-seed chest generation with `pvp-br-designer`
