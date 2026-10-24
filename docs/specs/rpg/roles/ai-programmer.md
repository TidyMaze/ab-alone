# Monster AI, player bot, hook-aware search and RPG bot ladder: implementation spec (role `ai-programmer`)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, still open). Source of truth:
the validated French gameplay spec (`docs/specs/rpg/plan.fr.md`, the same text as the approved plan
plus a status header). A section number like "§5.3" points to that gameplay spec. This file adds no
game rule of its own: it says how to build the AI side, and it lists every gap or contradiction it
found (section 22). Where a rule is missing, this file writes a PROPOSAL and flags it there. No code
yet: strict TDD applies from R1 (CONTRIBUTING section 11).

Tags, as in `rules.md`: **FINAL** (decided: by the four choices of #313, by the validated decisions
of the pivot, or by an existing FINAL spec), **TUNE** (a starting value, set by the bot ladder and
playtests), **PROPOSAL** (proposed here or in the gameplay spec, an owner confirms). Every number
below carries one. A number copied from the gameplay spec keeps its status there ("everything is
PROPOSAL and every number is TUNE unless stated"). Values inside Given/When/Then examples
(coordinates, HP of a test unit, a test budget) are test data, not rules, and carry no tag.

---

## 0. Scope

The ai-programmer owns every piece of code that **chooses** an action instead of a human:

- The **generic search**: `search.rs` moved onto a trait, so the same negamax runs on the classic
  `Game`, on a classic boss `Encounter` (hooks inside the tree) and on the RPG `CombatState`
  (§24.2: "On adapte `search.rs` à un trait d'état de combat qui voit le terrain, les statuts et les
  hooks").
- The **combat evaluation**: an integer score of a `CombatState` for one camp.
- The **monster AI** (§5.3): the fixed turn order Action, Mouvement, Action rapide; the priority
  list interpreter; the "3 best targets" heuristic; the alpha-beta Mouvement with a node budget; the
  choice and commit of intentions; the picks the AI must make (Éjecteur choice, mass control
  targets, zone centres).
- The **player bot** (§24.2, §18, §25 R1): the same agent driven by a class rotation script; it plays
  the ladder, records fixtures and golden logs, and plays a dropped party member's entity (R10).
- The **RPG bot ladder** (§18, §25 R2, R8, R9): the runner `examples/rpg_ladder.rs`, its telemetry
  records, its gates contract, its fixtures writer.
- **Battle royale bots** (§20 "des bots remplissent les places vides").
- **Budgets and AI performance** in the browser (node budgets per context, the cost per node).
- Two small tools that reuse the search: the hook-aware player for the **classic** boss ladder
  (boss-balance.md §6 follow-up, cited by §24.2) and the **puzzle prover** for Énigme data (§4.3,
  §16).

Out of scope (each section lists them under **Dependencies**): the combat rules and `apply_action`
(`gameplay-programmer`); the board region, terrain storage and push geometry (`engine-programmer`);
the content of priority lists, archetypes, intents rules and bosses (`encounter-boss-designer`); the
class rotation files (`class-designer`); the WASM glue, the worker and the e2e specs
(`client-programmer`); the nightly workflow (`devops-build`); P2P lockstep (`network-programmer`);
the gate thresholds and the reading of ladder reports (`qa-engineer`).

### 0.1 Role slugs used for dependencies

Same table as `gameplay-programmer.md` §0.1, so the files cross-read. Peer files sometimes call this
role `ai-engineer`.

| Slug | Owns | Aliases in peer role files |
|---|---|---|
| `gameplay-programmer` | Crate `abalone-rpg` rules layer: `CombatState`, `apply_action`, `legal_actions`, `preview`, `edge_danger`, `replay`, `state_hash`, notation | `combat-engine`, `combat-engineer` |
| `engine-programmer` | Crate `abalone-core`: region mask, occupancy, terrain storage, weighted push, fixed scan order | `engine-engineer` |
| `ai-programmer` | This file | `ai-engineer` |
| `encounter-boss-designer` | Monsters, archetypes, priority lists, intents rules, bosses, reference packs, release flags | `dungeons-bosses` |
| `class-designer` | Class kits, rotation files `data/rotations/<class>.ron` | `combat-designer`, `content-designer` |
| `progression-designer` | Stats, `g(L)`, normalised templates | `systems-designer`, `stats-progression` |
| `world-programmer` | Crate `abalone-world`, tile to board, formations, pack placement | `level-designer`, `world-generator` |
| `network-programmer` | Lockstep, signed log, takeover, BR rounds transport | `network-engineer`, `netcode` |
| `client-programmer` | WASM bridge glue, bot worker, three.js, Playwright e2e | `client-engineer`, `client-ui` |
| `ux-designer` | Intent display, "pack thinking" indicator, pacing | |
| `tech-lead` | Crate layout, data format and loader, lints, MCP | `technical-designer`, `data-tools` |
| `devops-build` | CI jobs, nightly ladder workflow, coverage | |
| `pvp-br-designer` | Arena and battle royale rules and templates | `pvp-br` |
| `narrative-quest-designer` | Puzzles (Énigme) data and module | `quest-designer` |
| `qa-engineer` | Gate thresholds, ladder reading, playtests | `qa-balance` |
| `lead-game-designer` | Pillars, arbitration on #313 | `game-designer` |

---

## 1. Inputs read

- Gameplay spec, the whole file; in detail §1 (pillars 2, 3, 4, 6), §4.4, §4.6, §4.7, §5.1, §5.3,
  §6.0 to §6.12, §8.0 to §8.8 (what each kit asks of an AI), §11 (tutorial), §16 (Énigme), §17,
  §18, §19, §20, §24.1, §24.2, §24.4, §24.5, §25, §26.
- `docs/specs/boss-balance.md` (the ladder method, "pro-level player", "winnable", fixtures, the
  follow-ups of §6), `docs/specs/game-design.md` §7 and §8 (boss roster and calibration),
  `docs/specs/tech.md` §7 (AI and bosses) and §3, `docs/specs/rules.md` §10.4 (battle royale bots).
- `CONTRIBUTING.md` §6.4 (PR, screenshot), §11 (strict TDD, 100 % lines and regions), §13 (checks).
- Peer role files: `gameplay-programmer.md` (API of §4, Edge danger §10.5, monsters §19, tasks),
  `encounter-boss-designer.md` (§8 monster AI and intention, §10 bosses, §18 release gate),
  `combat-designer.md` §12 (rotations), `devops-build.md` D11 (nightly ladder),
  `network-programmer.md` §3, §8, §10 (determinism needs, AI cost, takeover),
  `narrative-quest-designer.md` §10 (puzzles), `lead-game-designer.md` §2.2 (role slugs).
- Code: `crates/abalone-core/src/search.rs`, `encounter.rs`, `encounter/ladder.rs`,
  `encounter/fixture.rs`, `encounter/telemetry.rs`, `game.rs` (public API), `moves.rs`
  (`legal_moves`, `apply`), `board.rs` (public API), `examples/ladder.rs`,
  `crates/abalone-wasm/src/lib.rs` (`best_move`, encounters), `client/src/bot.ts`, `bot.worker.ts`.

### 1.1 Facts from the code that shape this spec

1. `search.rs` is a negamax with alpha-beta, iterative deepening up to `MAX_DEPTH = 12` plies, a
   **node budget** (never a clock), move ordering "ejections first, then static score" with a
   stable sort (ties keep the generation order). It is concrete on a private `Node { board,
   to_move, ejected }`, two sides that strictly alternate, and a win at N ejections.
2. Hooks reach the tree through one callback, `Step = &dyn Fn(&Board, Player, &Move, Board) ->
   (Board, [u8; 2])`. Only the Chaplain uses it in the ladder (`chaplain_step`, proved equal to the
   encounter). boss-balance.md §6: "The Hull cracks and the Ballast Mind hooks are not in the
   player tree yet."
3. The evaluation scans `for q in -MAX_RADIUS..=MAX_RADIUS { for r in ... }` (q-major order) and
   uses `centre_distance` from `(0, 0)`. Both break on a region mask (battle royale radius 8,
   stitched boards) and the q-major order differs from the r-then-q order §24.1 asks for.
4. There is no transposition table, no killer move and no history heuristic, although tech.md §7
   lists them. There is no randomness in the search; the ladder's randomness is only the seeded
   opening (`OPENING_RANDOM_MOVES = 2`, `mix` = splitmix64).
5. The ladder player is the plain search plus two root filters: "never repeat a seen position"
   (`Game::seen_after`) and "never leave a marble to flip" (the Chaplain tell), with a fallback to
   the unfiltered search. The same pattern (strict filter, then fallback) is kept for the RPG bot.
6. `ladder.rs` runs one boss per `Arena` enum branch, `PLY_CAP = 300`, 10 seeds per cell in
   parallel threads (`examples/ladder.rs`), JSON lines through `telemetry.rs`, fixtures as text
   through `fixture.rs`. The RPG ladder copies this shape.
7. The browser runs the search in `bot.worker.ts`: the page sends the move history and a node
   budget, the worker replays it into its own wasm `Engine` and answers one move. The RPG AI uses
   the same worker with a new request kind (section 17).
8. The combat state of `gameplay-programmer` is cloned by `apply_action` (pure, no undo token in
   R1). One search node therefore costs one full state clone plus the rules: far more than a
   classic `Board` clone. Budgets must be measured, not guessed (section 17).

---

## 2. Conventions used by every section

- **Points.** Evaluation scores are `i32` in **points**: 100 points = one Fragment at full HP, the
  same scale as the classic "centi-marble" (`DEFAULT_WEIGHTS.marbles = 100`) (PROPOSAL). Every sum
  uses saturating integer arithmetic; no float anywhere in the AI (FINAL, §24.1 and #313 choice 4).
- **Node.** One node = one call of the state's `play` inside the search. For the combat, one `play`
  is one whole **entity turn** (section 5) (PROPOSAL). Budgets count nodes, never milliseconds
  (FINAL, §5.3 "jamais en temps").
- **Ply.** One entity turn in the tree (PROPOSAL).
- **Determinism.** The AI is a pure function `(state, config) -> actions`: no clock, no thread, no
  `HashMap`/`HashSet`, no RNG (FINAL, §24.1). The ladder's seed only picks opening Mouvements and
  setup variants, outside the AI (PROPOSAL, as today).
- **Fixed order.** Candidate lists are built in the engine's order (cells r then q, units by id);
  every sort is stable; every tie is broken by that order (FINAL, §24.1 "Ordre fixe partout").
- **Data.** Tunable AI numbers live in `data/ai/*.ron` (or JSON, `tech-lead` picks), loaded with
  the content; the code has defaults equal to the data for unit tests (PROPOSAL, §1 pillar 6).

---

## 3. Module layout and ownership

The generic search stays in `abalone-core` (the classic game and the classic bosses use it); the
combat AI lives in `abalone-rpg` as §24.2 says ("L'IA des monstres", "Le bot joueur" in the new
crate). tech.md §7 mentions a sibling crate `abalone-ai`: not needed (KISS, feedback AIF-17).

| File | Content | First phase |
|---|---|---|
| `abalone-core/src/search.rs` | Generic negamax over `SearchState`, camps, budget, iterative deepening; classic `Node` impl; `search`, `search_with`, `search_hooked`, `position_score` keep their signatures | R1 |
| `abalone-core/src/encounter/ladder.rs` | Classic player uses the `Encounter` as a `SearchState` (hooks in the tree) | R1 |
| `abalone-rpg/src/ai/mod.rs` | `AiConfig`, `plan_turn(state, entity, config) -> TurnPlan` | R1 |
| `abalone-rpg/src/ai/node.rs` | `CombatNode`: `SearchState` impl for `CombatState` (one ply = one entity turn) | R1 |
| `abalone-rpg/src/ai/eval.rs` | `EvalWeights`, `evaluate(state, camp)`, cheap geometric helpers | R1 |
| `abalone-rpg/src/ai/rules.rs` | `Rule`, `Cond`, `Selector`: one interpreter for monster priority lists and class rotations | R1 |
| `abalone-rpg/src/ai/targets.rs` | Candidate targets, the "3 best" ranking, preview scoring | R1 |
| `abalone-rpg/src/ai/monster.rs` | Monster turn: intent or Action, Mouvement, Quick action, next intent | R1 (no intent), R2 |
| `abalone-rpg/src/ai/bot.rs` | Player bot turn: pre-move modifiers, Action, Mouvement, Quick, safety filters | R1 |
| `abalone-rpg/src/ai/intent.rs` | Choosing, committing and resolving intentions | R2 |
| `abalone-rpg/src/ai/picks.rs` | Éjecteur choice, mass control picks, zone centres, bounce order | R2 |
| `abalone-rpg/src/ai/placement.rs` | Formation and hero swap choice | R4 |
| `abalone-rpg/src/ai/boss.rs` | Boss move policies (search, mirror, armies, region filter), phase profiles | R8 |
| `abalone-rpg/src/ai/royale.rs` | Battle royale bot order | R10 |
| `abalone-rpg/src/ladder/{mod,arena,record,fixture,gates}.rs` | RPG ladder runner, telemetry record, fixture text, gates | R1 |
| `abalone-rpg/examples/rpg_ladder.rs` | CLI of the ladder, same env switches as `examples/ladder.rs` | R1 |
| `abalone-rpg/examples/ai_bench.rs` | Node cost and turn time per format, printed, never a test gate | R1 |
| `abalone-world/src/puzzle_prove.rs` | Puzzle prover over the classic `SearchState` | R6 |

**Dependencies.** `tech-lead` (crate layout approval, data loader, `disallowed_types` lint),
`gameplay-programmer` (crate `abalone-rpg` exists, GP-01).

---

## 4. Generic search over a trait: the hook-aware search (§24.2, §5.3, boss-balance.md §6)

### 4.1 The trait (PROPOSAL)

```rust
/// A position the search can explore. Two camps; a camp may play twice in a row.
pub trait SearchState: Clone {
    type Move: Clone + PartialEq;
    /// Camp to move, 0 or 1. `evaluate` scores for this camp.
    fn camp(&self) -> u8;
    /// Legal moves in the engine's fixed order. Empty: the camp passes (see `pass`).
    fn moves(&self) -> Vec<Self::Move>;
    /// The position after `mv`, every hook, tell and turn-end effect included.
    fn play(&self, mv: &Self::Move) -> Self;
    /// The position after a pass, when `moves` is empty and the game goes on. `None`: no pass
    /// (the classic game scores a side with no move statically, as today).
    fn pass(&self) -> Option<Self>;
    /// `Some` once the game is over.
    fn terminal(&self) -> Option<Terminal>;
    /// Static score for `camp()`, in points.
    fn evaluate(&self) -> i32;
    /// `true` for a move that changes material at once (ejection, Loss, kill): searched first.
    fn decisive(&self, mv: &Self::Move, child: &Self) -> bool;
}
pub enum Terminal { Won(u8), Draw }
pub struct SearchConfig { pub budget: u32, pub max_depth: u32, pub draw_score: i32 }
pub struct SearchResult<M> { pub mv: M, pub depth: u32, pub nodes: u32, pub score: i32 }
pub fn negamax_search<S: SearchState>(root: &S, cfg: &SearchConfig, allow: &dyn Fn(&S::Move) -> bool)
    -> Option<SearchResult<S::Move>>;
```

### 4.2 Algorithm (the current one, generalised)

- Iterative deepening from depth 1 to `max_depth` (12, TUNE, the current `MAX_DEPTH`); the answer is
  the last finished iteration; the previous best is searched first (`rotate_right`, as today).
- **Camps that do not alternate.** For a child whose `camp()` equals the parent's, the child score is
  used as is and the window `(alpha, beta)` is passed unchanged; for a child of the other camp, the
  score is negated and the window becomes `(-beta, -alpha)` (PROPOSAL). With strict alternation this
  is exactly the current negamax. It covers the group frieze of §6.2 when a camp has two entities in
  a row (section 15).
- Terminal scores: `Won(c)` gives `WIN - ply` for camp `c` and `ply - WIN` for the other
  (`WIN = 1_000_000`, FINAL in code today); `Draw` gives `draw_score` for the camp to move (the
  caller sets it, section 6.4).
- Children ordering: decisive first, then the static score of the child for the mover, stable sort
  (FINAL, current behaviour: "ejections first, then the best static score").
- A node with no move and a pass: one child, the pass. With no move and no pass: static score
  (current behaviour).
- Budget: one node per `play` or `pass` and per root visit, never above `budget` (FINAL, current
  test `the_node_budget_is_respected`). Budget 0 returns the best-ordered move (current behaviour).

### 4.3 Implementors

| Implementor | `play` | Phase |
|---|---|---|
| Classic `Node` (private, today's) | `moves::apply`, then the optional `Step` | R1 |
| `EncounterNode` (classic boss) | `Encounter::play` on a clone: the boss hook fires inside the tree, removals credited | R1 |
| `CombatNode` (RPG, section 5) | One entity turn through `apply_action` | R1 |
| Puzzle node (section 20) | `moves::apply`, solo or duel | R6 |

`search`, `search_with`, `search_hooked`, `position_score` and `best_move` keep their signatures and
results: they build a classic `Node` and call `negamax_search` (PROPOSAL, no behaviour change).

### 4.4 Dependencies

`engine-programmer` (the region mask replaces `MAX_RADIUS` loops in `evaluate`; the fixed scan
order changes `legal_moves` order, see risks), `client-programmer` (the wasm `best_move` and
`evaluate` keep their outputs; vitest of `bot.ts` unchanged).

### 4.5 Tests

- **No behaviour change (golden).** Before the refactor, a test table records
  `search(game, 3000)` (move, depth, nodes, score) for 30 positions: the start, 9 positions after
  1 to 9 seeded random moves, and 20 positions from the stored fixtures (`tests/fixtures/*.txt`) at
  plies 10, 20, ... After the refactor the table is equal. Every existing test of `search.rs`,
  `ladder.rs` and `boss_fixtures.rs` stays green unchanged.
- **Same camp twice.** Given a toy `SearchState` (a 6-leaf tree where camp 0 plays twice), When
  searched with an unlimited budget, Then the result equals a brute-force max-max-min by hand.
- **Pass.** Given a toy state where camp 1 has no move and `pass` exists, Then the search goes
  through the pass and returns camp 0's best line, `nodes` counting the pass.
- **Draw score.** Given a toy terminal `Draw` at depth 1 and `draw_score = -500`, Then the root
  avoids it when a move scoring -100 exists.
- **Budget property.** For budgets 0, 1, 2, 10, 100, 1000 on 20 seeded states of each implementor,
  `nodes <= budget` and the move is legal.

### 4.6 Risks

- The fixed scan order of `engine-programmer` (r then q) changes `legal_moves` order, so ties in
  the classic search break differently: the golden table and the classic ladder numbers move. The
  golden table is recorded **after** the scan order change lands, or both changes ship in one
  PR with the new table (PROPOSAL; feedback AIF-18).
- A generic trait could slow the classic search (monomorphised, so no virtual call; the
  `Vec<Move>` allocation is the same as today). `examples/ai_bench.rs` prints the classic
  nodes per second before and after.

---

## 5. The combat as a search state: what a ply is (§5.3, §6.2, §6.3, §4.6)

### 5.1 One ply = one entity turn (PROPOSAL)

A combat turn holds up to one Mouvement, one Action, one Action rapide and Steps, in free order
(§6.3). Searching every ordering of every ability on every target would explode (gameplay-programmer
§4.4 warns about `legal_actions` size). §5.3 already narrows it: the Action and the Action rapide
are chosen by a priority list, only the **Mouvement** is searched. So:

- **Root.** The planner (sections 7 and 12) first applies the actions it chose before the move
  (intent, Action, pre-move modifiers) on the real state, then calls the search. The root moves are
  the active entity's legal Mouvements (`gameplay-programmer::legal_moves(state)`), each followed
  in `play` by `EndTurn` (turn-end effects, the next entity's turn start). If the entity has no
  legal Mouvement, the only child is `EndTurn` (the pass of §6.3).
- **Deeper plies.** For the entity to move inside the tree, `play(mv)` = (1) its **committed
  intent** resolved if it has one (deterministic, no branching, section 9), (2) the Mouvement `mv`,
  (3) `EndTurn`. Players' and monsters' Actions and Quick actions other than committed intents are
  **not** simulated inside the tree (PROPOSAL, approximation; the evaluation's threat terms stand in
  for them, section 6).
- **What the tree sees for free.** Everything `apply_action` does on `EndTurn` and turn start:
  terrain rules (Lava, Quicksand, Vents, Sanctuary, Corruption), damage over time, status
  durations, Preparations that fire during the turn, tells and delayed effects that fire (Météore,
  Mine temporelle, Effondrement, Séisme), Breach rings, Tide, boss hooks, Résilient Hearts, victory.
  This is the "hook-aware" property of §24.2: no AI-side copy of a rule exists.
- `camp()` = the camp of the active entity; `terminal()` reads `CombatState.outcome`.
- `decisive(mv, child)`: the child has a new `Loss`, a unit removed, or an entity left.

### 5.2 Why not search the abilities

- Branching: a skirmish has about 20 to 40 Mouvements per entity (radius 3, 4 to 7 balls; TUNE
  estimate); one ability with 10 targets, cast before or after the move, multiplies that by 20.
- Readability (§1 pillar 2): monsters that follow a visible priority list and an announced intent
  are predictable; a monster that searches its abilities is not.
- The player bot casts abilities by rotation, like a human who knows the class (§24.2).

### 5.3 Multi-tile boards (§4.6)

Nothing special: the region is one union of cells and `legal_moves` covers it. The root filter of a
boss may restrict moves to a region (section 14.3) to keep raids inside the budget.

### 5.4 Dependencies

`gameplay-programmer`: `legal_moves(state) -> Vec<Action>` in the core's fixed order (and equal to
`abalone-core::legal_moves` order on a classic-equivalent state, for the property of 6.6); `EndTurn`
always legal after a Mouvement; `apply_action` refusing never happens for a listed move;
`repetition_count(state)` (for the bot filter, section 12); `Effects` flags or a cheap way to know a
child is decisive (count of `graveyard` entries and `units` on board is enough).

### 5.5 Tests

- Given the R1 skirmish start and the pack to move, When `CombatNode::moves` is called, Then it
  equals `legal_moves(state)` (Mouvements only), and `play(m)` equals `apply_action(Move m)` then
  `apply_action(EndTurn)` on the same state (same `state_hash`).
- Given a pack whose only units are Frozen (no legal Mouvement), Then `moves` is empty and
  `pass` equals `apply_action(EndTurn)`.
- Given a Lava cell under a monster and the monster's Mouvement keeping it there, Then the child's
  monster HP is 10 % lower (the rule ran inside `play`, no AI code for Lava).
- Given a committed monster intent on the hero and a depth-2 search from the player's turn, Then the
  child for the player's move that leaves the intent's range scores higher than the one that stays
  (the intent resolved inside the tree).

### 5.6 Risks

- Simulating only Mouvements makes the tree blind to the opponent's abilities: a pack walks next to
  a Warrior with full Rage. Answer: threat terms in the evaluation (6.2), TUNE by the ladder.
- State clone cost (section 17). If too slow, `gameplay-programmer` adds an undo token or a lighter
  `apply_move_and_end_turn` fast path (performance follow-up, tech.md §3 "undo token").

---

## 6. Combat evaluation (§6.4 to §6.7, §6.6 Edge danger, §1 pillar 2)

### 6.1 Formula

`evaluate(state, camp) = Σ terms(own entities) − Σ terms(enemy entities)`, every term in points,
for the camp `camp` (PROPOSAL). A camp's terms:

| Term | Value | Tag |
|---|---|---|
| Unit value `V(u)` | `base(u) × (hp + min(shield, hp_max / 2)) / hp_max`, floor | PROPOSAL |
| `base(u)`: Fragment | 100 | TUNE |
| `base(u)`: monster | 100 × threat / 2 (Sbire 50, Normal 100, Champion 200, Élite 400, from `encounter-boss-designer` half-point threats 1, 2, 4, 8) | TUNE |
| `base(u)`: pack leader bonus | +150 (its death routs the pack, §6.7) | TUNE |
| `base(u)`: hero | 800 | TUNE |
| `base(u)`: boss Heart | 1 500 | TUNE |
| `base(u)`: Revenant, summon | 40 | TUNE |
| Rout pressure | `−600 / margin` for each entity with a rout threshold, `margin = rout_at − losses ≥ 1` | TUNE |
| Hero Edge danger | −2 500 when an enemy legal Mouvement can eject the hero before its entity plays again | TUNE |
| Hero low | −800 when hero HP < 35 % of max (one Guard-capped hit, §6.5, can finish it) | TUNE |
| Unit on the edge, exposed | −V(u) / 2 for a non-hero unit that an enemy line could push off (cheap check 6.3) | TUNE |
| Edge distance | +4 × min(edge_distance, 3) per unit, hero ×3 | TUNE |
| Cohesion | +2 per adjacent own pair (the classic weight) | TUNE |
| Isolation | −30 per isolated own unit, −120 for an isolated hero (§6.5 +25 % taken) | TUNE |
| Told zone | unit inside an enemy cell tell that fires before its entity plays again: −V(u) if the tell ejects, else −min(V(u), forecast damage in points) | PROPOSAL |
| Terrain | per `TerrainId`, from `data/ai/terrain.ron` (Lava −20, Quicksand −40, second turn −V(u), Corruption −10, Sanctuary +10, Hauteur +5 for a hero) | TUNE |
| Resources | +60 when the ultimate is ready and affordable; +resource × 20 / resource_max | TUNE |
| Statuses | per `StatusId`, from `data/ai/status.ron` (own Stunned −30, Frozen −30, Anchored on the edge +40) | TUNE |

- `edge_distance(cell)`: steps to the nearest cell outside the region or Gouffre, precomputed once
  per region (from `engine-programmer`'s region; cached in the AI, not hashed). It replaces the
  classic `centre_distance`, which assumes a disc around `(0, 0)` and breaks on stitched boards and
  on the Hull (PROPOSAL).
- Weights form a struct `EvalWeights` (like `search::Weights`), one profile per archetype and per
  boss phase in `data/ai/profiles.ron` (PROPOSAL): e.g. Rôdeur: isolation term on enemies ×2;
  Brute: rout pressure ×1.5; Lanceur: edge distance ×2 (all TUNE). The mapping archetype → profile is
  `encounter-boss-designer`'s data.

### 6.2 Threat terms (what the tree does not simulate)

- Enemy intents already committed are resolved inside the tree (5.1), so no term.
- Enemy ready abilities: for each enemy entity, `max_ready_damage` = the highest forecast damage of
  one of its ready, affordable single-target abilities on the own unit with the lowest
  `V(u) − damage` in range of its caster; subtract `min(V(u), damage points) / 2` (PROPOSAL, TUNE
  factor 1/2). Computed only at leaves of depth ≥ 1, once per enemy entity (cost bound: one
  formula call per enemy ability, no preview).

### 6.3 Cheap geometric checks

- `hero_ejectable(state, hero, enemy)`: the R1 threat set of `edge_danger` (gameplay-programmer
  §10.5: legal Mouvements only), but without cloning: for each direction `d` in which the hero can
  leave the region (at most 6), take the enemy runs of length 2 or 3 behind the hero along `-d`
  and call the core push predicate (`n > m`, strictly greater Weight, empty or outside cell after
  the run, FINAL §6.4) with the combat Weights (Mud, Slope, statuses). Ice runs follow the same
  walk as `edge_danger` step 1 (PROPOSAL).
- `exposed_on_edge(unit)`: same check for a non-hero unit (PROPOSAL).
- One ejection per action (FINAL, §6.10) is honoured because the check stops at the first unit
  that leaves; Unejectable and Inamovible make it false (FINAL, §6.11).

### 6.4 Draw score (§6.7)

| Context | `draw_score` for the AI's camp | Tag |
|---|---|---|
| Monster pack in a skirmish or elite fight | −2 000 (a pack never plays for the 60-turn draw: it would deny XP for no fun) | PROPOSAL |
| Boss | +WIN / 2 (a draw against a boss is a player loss, FINAL existing) | PROPOSAL |
| Player bot against a boss | −WIN / 2 (a draw is a loss) | FINAL (existing rule) value PROPOSAL |
| Player bot against a pack | −2 000 (a retreat gives no XP) | PROPOSAL |
| Battle royale bot | not used (no tree, section 16) | — |

### 6.5 Dependencies

`gameplay-programmer` (public damage forecast `forecast(state, caster, ability, target) -> i32`
without a clone, the push predicate with combat Weights, `edge_danger` for the property test, tell
list with cells and kind), `engine-programmer` (region, `edge_distance` helper or region iteration),
`encounter-boss-designer` (threat values, archetype → profile mapping), `class-designer` (which
abilities count as "ready damage"), `qa-engineer` (weights tuning through the ladder).

### 6.6 Tests

- **Term tests.** One Given/When/Then per row of 6.1: e.g. Given a Fragment at 24 of 48 HP and no
  shield, Then `V = 50`; Given a hero isolated, Then its isolation term is −120 and a Fragment's −30.
- **Symmetry.** For 200 seeded R1 states, `evaluate(s, 0) == -evaluate(s, 1)` in a 2-camp fight.
- **Edge check soundness and completeness.** For 1 000 seeded R1 states (TUNE), `hero_ejectable`
  is `true` exactly when `gameplay-programmer::edge_danger` returns `Could` for that hero with the
  R1 threat set (property).
- **Classic AI invariant (PROPOSAL).** Given a combat built from a classic position (every Weight 1,
  HP 10 000 so nobody dies by Choc within the depth, no ability, no terrain, 2 entities) and the
  profile `CLASSIC` (unit value 100, no HP term, cohesion 2, edge distance replaced by the classic
  centre term), When the combat search runs with budget B, Then it picks the same Mouvement as
  `search_with(game, B, DEFAULT_WEIGHTS)` for 50 seeded positions. It proves the adapter, the
  move order and the camp logic against the shipped search.
- **Draw score.** Given a skirmish one Mouvement away from the 60-turn draw (no-Loss counter at
  59), When the pack can draw or lose a Sbire, Then it loses the Sbire.

### 6.7 Risks

- `forecast` needs the damage formula outside `apply_action`; if `gameplay-programmer` cannot expose
  it cheaply, the threat term uses `atk × ratio` without defence (rougher, still deterministic).
- Too many terms make tuning slow: the ladder changes one knob at a time (boss-balance method).

---

## 7. Monster turn planner: Action, Mouvement, Action rapide (§5.3, §6.3)

### 7.1 API

```rust
pub struct AiConfig {
    pub budget: u32,               // nodes for the Mouvement search
    pub profile: EvalWeights,
    pub rules: Vec<Rule>,          // priority list (monsters) or rotation (player bot)
    pub draw_score: i32,
    pub kind: AiKind,              // Monster, PlayerBot { opening: u32, seed: u64 }, Boss(BossPolicy)
}
pub struct TurnPlan { pub actions: Vec<Action>, pub nodes: u32, pub depth: u32, pub score: i32 }
pub fn plan_turn(state: &CombatState, config: &AiConfig) -> TurnPlan;
```

`plan_turn` plans the whole turn of the active entity and returns the actions in order, ending with
`SetIntent` (monsters, R2) and `EndTurn`. Every action is checked by `apply_action` while planning,
so the plan is legal by construction. The caller (ladder, worker, network peer) applies them one by
one; the client animates them one by one (`ux-designer` pacing).

### 7.2 Monster order (FINAL order from §5.3, details PROPOSAL)

1. **Action.** If the entity has a committed intent: resolve it (section 9). Else: the first rule of
   the priority list whose ability is an Action, is castable and has a target (section 8).
2. **Mouvement.** `negamax_search(CombatNode(state after 1), budget)`. If no legal Mouvement, none.
3. **Action after the move** (PROPOSAL, feedback AIF-3): if step 1 cast nothing, the priority list
   is tried again on the state after the move, **non-major abilities only** (majors go through an
   intent). Without it a melee monster that walks into range wastes its Action every time.
4. **Action rapide.** The first rule whose ability is Rapide or a Préparation, castable, with a
   target, on the state after 3.
5. **Next intent** (R2, section 9): `SetIntent` chosen on the state after 4.
6. `EndTurn`.

A pack is one entity: one Action and one Quick action per turn for the whole pack (§6.3, read by
`gameplay-programmer` §19, its F51). The caster of a rule is the pack unit chosen by the target
step (section 8).

### 7.3 Dependencies

`gameplay-programmer` (`apply_action`, `preview`, `Action::SetIntent`, slot rules),
`encounter-boss-designer` (priority lists, majors, budgets per format), `ux-designer` (actions shown
one by one, "pack thinking" indicator while the worker searches), `client-programmer` (worker).

### 7.4 Tests

- **Order.** Given a Brute pack with one Action rule that fires, Then `actions` = `[Ability,
  Move, EndTurn]`; Given the rule only fires after moving, Then `[Move, Ability, EndTurn]`; Given a
  Quick rule, Then the Quick ability comes after the Action and the Move.
- **Legal by construction.** For 500 seeded R1 states (TUNE), applying `plan_turn(...).actions`
  in order never returns an `ActionError`, and the last action ends the turn.
- **Determinism.** The same state and config give the same `TurnPlan` twice, and on wasm32 (the
  golden plans of section 21).
- **Budget.** `plan.nodes <= config.budget` for budgets 0, 1, 50, 300.
- **Zero budget.** With budget 0 the pack still plays a legal Mouvement (the best-ordered one).

### 7.5 Risks

- The pack's single Action slot makes big packs weak per unit: by design (§6.3), watched by the
  ladder.

---

## 8. Priority lists, rotations and target selection (§5.3 "3 meilleures cibles", §6.10, §6.11)

### 8.1 One rule format for monsters and classes (PROPOSAL)

`encounter-boss-designer` writes `(ability, when: Cond, target: Selector)`; `class-designer` writes
`(cast, when: [Cond...])`. One interpreter reads the union:

```rust
pub struct Rule { pub ability: AbilityId, pub when: Vec<Cond>, pub target: Selector }
// when: all conditions hold. target: default `Best` when absent.
pub enum Cond {
    Always, ResourceAtLeast(i32), SelfHpBelow(u16), AllyHpBelow(u16), HeroHpBelow(u16),
    EnemyInRange, EnemyAdjacent, AdjacentEnemyHpBelow(u16), EnemyInLine(u8),
    EnemyOnEdgeInPushReach, EqualCountPushEjects, OwnHeroInDanger,
    TurnModulo(u8, u8), PhaseAtLeast(u8), FirstTurn, NotFirstTurn,
}
pub enum Selector {
    Best, Hero, Isolated, LowestHp, LowestHpAlly, NearestEdge, Densest, SelfUnit, AllyInDanger,
}
```

- Basis points (`u16`) for every HP threshold (FINAL, §24.1 "points de base").
- The closed enums are extended only by a PR in this crate with one unit test per variant; data
  naming an unknown variant fails the integrity test (PROPOSAL, `tech-lead` loader).

### 8.2 Choosing the target: "the 3 best targets" (§5.3)

For a rule whose conditions hold:

1. **Candidates**: every legal pick of that ability for the entity, from
   `gameplay-programmer::legal_actions(state)` filtered by ability (each candidate is a full
   `Action::Ability { ability, picks }`, caster included). Provocation, Stase, Fumigène and range are
   enforced by the engine, so an illegal target never appears (FINAL, §6.11 is the engine's).
2. **Rank** by the selector key (cheap, no preview): `Hero` = enemy hero first, then distance;
   `Isolated` = isolated enemies first, then lowest HP; `LowestHp` = HP ascending; `NearestEdge` =
   `edge_distance` ascending; `Densest` = number of enemies in the zone, descending; `Best` = forecast
   damage descending. Ties: the engine's candidate order.
3. Keep the **top 3** (TUNE, §5.3).
4. **Preview** each of the 3 (`gameplay-programmer::preview`) and score the resulting state with
   `evaluate` for the entity's camp; cast the best; ties keep the rank.
5. The rule is cast even if the preview score is lower than not casting (PROPOSAL): the list is the
   designer's intent, like a WoW rotation; a bad rule is fixed in data, not hidden by the AI.

Cost bound: at most 3 previews per rule that fires, at most 3 rules fire per turn (Action, after-move
Action, Quick) (PROPOSAL): 9 previews, no search.

### 8.3 Conditions that need the engine

- `EnemyOnEdgeInPushReach`: `exposed_on_edge` (6.3) is true for an enemy unit reachable by a legal
  Mouvement of this entity.
- `EqualCountPushEjects` (Percée): a legal equal-count push (`n = m`, Weight strictly greater) ejects
  an enemy. Asked to the engine as "legal Mouvements if the modifier were active"
  (`gameplay-programmer::legal_moves_with(state, PushModifier)`, cited by `systems-designer` §5).
- `OwnHeroInDanger`: `hero_ejectable` for the own hero against any enemy entity that plays before
  the next own turn.

### 8.4 Dependencies

`encounter-boss-designer` and `class-designer` (agree on the union format of 8.1; their data),
`gameplay-programmer` (`legal_actions` per ability, `preview`, `legal_moves_with`), `tech-lead`
(loader, unknown-variant error).

### 8.5 Tests

- One unit test per `Cond` and per `Selector` (true and false case each).
- **Top 3.** Given 5 legal targets of Coup de masse ranked by `Hero` then distance, Then exactly 3
  previews run (counted by a test hook) and the cast target is the best previewed one.
- **Provocation.** Given a Gardien Provocation in range of a Brute whose rule targets `Hero`, Then
  the only candidate is the Gardien and it is the cast target (engine filter, AI respects it).
- **Silenced.** Given the pack's caster Silenced, Then no rule of that caster fires and the turn is
  `[Move, EndTurn]`.
- **Unknown variant.** Given a rotation file with `when: [Sometimes]`, Then the loader fails naming
  the file and the line.

---

## 9. Intentions (§5.3, §1 pillar 2, §4.4)

### 9.1 What the AI decides (rules are `encounter-boss-designer` §8.3)

- **Choose.** At step 5 of 7.2: the first rule of the priority list whose ability is **major**
  (data flag), castable at the start of the next own turn if nothing moves (cooldown ready then,
  resource then), with a target; target chosen by 8.2 on the current state. `fires_in` = 1, or 2 for
  a boss ability that can remove more than one ball (FINAL, §1 pillar 2 and §6.10 rule 2).
- **Commit.** `Action::SetIntent { unit, ability, target }` (gameplay-programmer §19), hashed and
  public.
- **Resolve.** At step 1 of the next turn, the planner sends the intent's `Action::Ability` as
  committed. Unit targets follow the unit; if the engine refuses it (dead, out of range,
  untargetable), the intent fizzles (`encounter-boss-designer` rule) and the planner uses only
  non-major rules this turn.
- **In the tree.** A committed intent is resolved inside `play` (5.1) with the same function, so
  the player bot and the monster AI both see it.

### 9.2 Ambush and fight start (§4.4, PROPOSAL, feedback AIF-6)

In an ambush the pack plays first (§4.4). An intent committed at fight start would fire before the
player ever played, against pillar 2 ("annoncée un tour à l'avance"). Proposal: no intent exists at
fight start; the first monster turn casts non-major abilities only and commits its first intent at
its end.

### 9.3 Dependencies

`encounter-boss-designer` (major flag, fizzle rule, boss `fires_in`), `gameplay-programmer`
(`SetIntent`, intent in the hash, refusal when broken), `ux-designer` and `client-programmer`
(intent glyph and line to the target, e2e).

### 9.4 Tests

- Given a Brute with Coup de masse (major) ready next turn and the hero in range, When the pack's
  turn is planned, Then the last two actions are `SetIntent { Coup de masse, hero }` and `EndTurn`.
- Given that intent and the hero stepping out of range, When the next pack turn is planned, Then
  the plan holds no major ability (fizzle) and may hold a non-major one.
- Given an ambush fight start, Then the pack's first plan holds no major ability.
- Given a player bot facing a committed Météore zone on its hero's cell, When its turn is planned
  with budget 600, Then its Mouvement takes the hero out of the zone (the tree resolved the intent).
- E2E (Playwright, `client-programmer` writes it, R2): on the R2 test fight, after the pack's first
  turn the intent glyph is over the Brute and names the hero before the player's first click.

---

## 10. Picks the AI must choose (§6.10, §6.11, §8)

- **Éjecteur choice** (§6.10 rule 1: "son lanceur choisit laquelle"): eject the candidate with the
  highest `V(u)`; a hero always first (it wins the fight, FINAL hero rule); ties by unit id
  (PROPOSAL). The player bot uses the same rule.
- **Mass hard control** (§6.10: 3 balls at most, chosen by the caster): the 3 enemies with the
  highest `V(u)` among the legal ones, hero first (PROPOSAL, TUNE). Enumerated by the engine as
  combinations of at most 6 candidates (gameplay-programmer §4.4); the AI takes the first
  combination of its sorted choice instead of enumerating all (no preview per combination).
- **Zone centre** (`Densest`): the centre covering the most enemies, then the most enemy `V`, then
  cell order (PROPOSAL).
- **Bounces and ordered picks** (Chaîne d'éclairs, Danse des lames): greedy, each next target the
  highest `V` reachable, ties by cell order (PROPOSAL); the engine caps enumeration at 64 sequences
  (gameplay-programmer, TUNE).
- **Direction picks** (Secousse, Rotation, Séisme sides): every legal direction previewed, best
  evaluated (at most 6 or 2 × 6 previews, PROPOSAL).
- **Pre-move modifiers** (Percée, Bélier, Avalanche, Cri de guerre, Croc-en-jambe, Titan): used only
  by the player bot (12.2) and by monsters whose data lists them, as a rule tagged `pre_move`
  (PROPOSAL): cast before the Mouvement search only if `legal_moves_with(modifier)` holds a decisive
  Mouvement that plain `legal_moves` does not.

**Dependencies.** `gameplay-programmer` (`Picks`, pick enumeration, `legal_moves_with`),
`class-designer` (which abilities are `pre_move`), `encounter-boss-designer` (monster pick data).

**Tests.** Given Séisme du Lest able to eject a Fragment and the enemy hero, Then the pick is the
hero. Given Nova de givre with 5 adjacent enemies including the hero, Then the 3 picks are the hero
and the two highest `V`. Given Percée castable and an equal-count push that ejects, Then the plan is
`[Percée, Move(push), ...]`; Given no such push, Then Percée is not cast.

---

## 11. Placement and formation (§6.1)

- The player bot and AI packs that own a placement choice pick one of the 3 formations (Ligne,
  Coin, Flèche, FINAL list §6.1) and, for the bot, a hero swap with a starting Fragment
  (PROPOSAL): for each formation and each swap (1 + number of Fragments), apply `Action::Place` on a
  clone and score with `evaluate`; best wins, ties by formation order then unit id. No search
  (placement has no move yet).
- Monster packs placed by `world-programmer`'s generator (no choice) skip this.

**Dependencies.** `world-programmer` (formations as data, placement zones), `gameplay-programmer`
(`Action::Place`).

**Tests.** Given a board where Ligne leaves the hero on the edge and Coin does not, Then the bot
picks Coin. Same state twice, same choice.

---

## 12. Player bot (§24.2, §18, §25 R1)

### 12.1 What it is (§24.2: "le même agent, avec un script de rotation par classe")

`plan_turn` with `AiKind::PlayerBot`, the class rotation as `rules`, the profile `PLAYER` and the
safety filters of 12.3. It is used by: the RPG ladder (section 18), the golden logs of
`network-programmer` NP-01, the party takeover (section 15) and the R2 to R9 exit criteria.

### 12.2 Turn order (PROPOSAL, feedback AIF-4)

1. **Pre-move modifiers** (10): a `pre_move` rule fires only if it unlocks a decisive Mouvement.
2. **Action** by rotation, if a rule fires now.
3. **Mouvement** by search (budget from the ladder cell).
4. **Action** by rotation if none was cast at 2 (same as 7.2 step 3, majors allowed: a player has
   no intents).
5. **Action rapide** by rotation.
6. `EndTurn`.

### 12.3 Safety filters (the "pro player" of boss-balance.md §1, adapted)

At the root, first with the strict filter, then without it if no move passes (FINAL pattern from
`ladder.rs`):

- **No repetition**: the state after the move and `EndTurn` has a repetition count of 1 (a draw is a
  loss against a boss, a waste against a pack).
- **Hero safe**: after the move and `EndTurn`, `hero_ejectable` is false for the own hero against
  every enemy entity that plays before the next own turn ("reads the tells", Edge danger is public,
  §6.6).

### 12.4 Opening variety (ladder only)

`opening` random Mouvements (1, TUNE; the classic ladder uses 2) picked by
`mix(seed ^ mix(turn))` among the moves that pass the strict filter. Outside the ladder `opening` is
0: the takeover bot and golden logs are fully deterministic without a seed (PROPOSAL).

### 12.5 Dependencies

`class-designer` (rotations for the 8 classes; the Warrior in R1), `gameplay-programmer`
(`repetition_count`), `network-programmer` (takeover calls `plan_turn` for a seat), `qa-engineer`.

### 12.6 Tests

- Given the R1 Warrior and a Fendoir rule with an adjacent enemy, Then the plan casts Fendoir before
  the Mouvement; Given no adjacent enemy before but one after, Then after.
- Given a position where the best-scored Mouvement leaves the hero ejectable and another does not,
  Then the bot plays the other; Given every Mouvement leaves it ejectable, Then the search's best.
- Given a Mouvement that would repeat a seen state, Then it is not played while another exists.
- Given `opening = 1` and seed 3, Then the first Mouvement equals the recorded one; with seed 4 it
  differs on at least one of 10 test states.

### 12.7 Risks

- The rotation cannot express every good play (Charge then push, Clignement then Trait de feu).
  Accepted: the bot proves "winnable", not "optimal"; a human plays better than it (boss-balance
  §1 logic).

---

## 13. Archetypes, elite affixes, tutorial monsters (§5.3, §11)

| Source | AI side (PROPOSAL) |
|---|---|
| Archetype (Brute, Rôdeur, Lanceur, Chaman, Bâtisseur, Explosif, Porteur, Invocateur) | An `EvalWeights` profile and a priority list in data; no code per archetype |
| Affix Écho (mirror Mouvements) | `MovePolicy::Mirror` (14.2) for the elite's entity |
| Affix Pilier (Inamovible, does not move) | The engine forbids its moves; nothing in the AI |
| Affixes Grappin, Téléporteur, Bouclier, Invocateur, Explosif, Vampirique | Abilities in the priority list or passives in the engine |
| Tutorial monsters, levels 1 to 4 (§11: "sans aucune capacité") | Empty priority list, budget 30 nodes (TUNE): pure Abalone with HP and Weight |

**Tests.** Given the tutorial pack, Then every plan is `[Move, EndTurn]`. Given a Rôdeur profile and
an isolated Fragment next to a grouped one, Then the Rôdeur's single-target rule picks the isolated
one (selector `Isolated`) and its Mouvement scores the isolation term double.

---

## 14. Bosses: phases, move policies, multi-tile (§18, §4.6, §17)

### 14.1 Phases (§18: "les phases se déclenchent sur un pourcentage de PV")

The engine owns the phase counter (`HpBelow` passives, gameplay-programmer §19). The AI reads
`state.entity_phase` and switches to that phase's `rules` and `profile` from the boss data
(PROPOSAL).

### 14.2 Move policies (`BossPolicy`, data, PROPOSAL)

| Policy | Mouvement choice | Boss |
|---|---|---|
| `Search` | negamax with the boss budget | default, the Hull, the Chaplain |
| `Mirror { fallback }` | the mirror of the last Mouvement of the entity it watches, if legal; else `fallback` (search). Only the Mouvement is copied, never an ability (§18 FINAL wording) | The Echo, the elite affix Écho |
| `Armies { order }` | root filter: only units of the army whose round it is (the Choir) | The Choir |
| `Region { radius }` | root filter: only groups with a unit within `radius` of a player hero (raids, 3 to 7 tiles) | The Ballast Mind, world bosses |

- "The entity it watches" in a group fight: the last player entity that played (PROPOSAL, feedback
  AIF-11).
- The Chaplain's conversion of Fragments and the Hull's collapse are engine effects: the tree sees
  them through `play` (5.1); the AI has no per-boss step function any more (contrast with
  `chaplain_step` today).
- Boss tells with `fires_in = 2` (multi-removal) are intents (section 9) chosen by the phase's
  rules.

### 14.3 Multi-tile budget

Raid boards have up to 7 tiles (427 cells; 7 tiles TUNE, §6.8 and §17); `Region { radius: 3 }` (TUNE) keeps the root
branching near a skirmish's. Deeper plies use the same filter for the boss entity and every move for
players (PROPOSAL).

### 14.4 Dependencies

`encounter-boss-designer` (boss data: phases, rules, profiles, policy, budgets), `gameplay-programmer`
(phase counter, Résilient Heart, conversion effect), `world-programmer` (stitched regions).

### 14.5 Tests

- Given the Echo boss and the player's last Mouvement `(-1,0)(0,0)>E`, Then the boss Mouvement is its
  point mirror when legal; Given it is illegal, Then the search's move.
- Given the Choir in its army-2 round, Then every root move uses army-2 units only.
- Given a 3-tile Hull fight, Then `Region` restricts root moves to groups near heroes and the plan
  stays within budget.
- Given a boss Heart crossing 70 % HP during the player's turn, Then the boss's next plan uses the
  phase-2 rules (a phase-2-only ability appears).
- E2E (R8, `client-programmer`): in the Cales du Ballast, The Echo answers a player Mouvement with
  its mirror on screen (`window.__lastBossMove` equals the mirror).

---

## 15. Group fights and takeover (§6.2, §4.7, R10)

- **Frieze.** J1, M1, J2, M2 (§6.2): camps alternate, so 4.2's negamax applies directly. When an
  entity leaves (hero dead, rout), two entities of one camp can play in a row; 4.2 handles it.
- **Which pack targets whom** (PROPOSAL, feedback AIF-10): in pack `Mi`'s evaluation the units of
  player `Ji` weigh ×1.25 (TUNE) on the enemy side, so each pack presses "its" player and packs do not
  all focus one hero.
- **Who computes the pack turn.** Every peer runs `plan_turn` for every pack, sending nothing (the
  choice of `network-programmer` §8). This needs the AI to be bit-identical on every peer: integer
  only, same budget from the setup (never adapted to the device), same data hash (FINAL by §24.1).
  Alternative in Open question Q1.
- **Takeover** (network-programmer §10.2, NP-11): a stalled seat's entity is played by
  `plan_turn(state, AiConfig::player_bot(class, budget = 300 TUNE, opening = 0))` on every peer.

**Dependencies.** `network-programmer` (lockstep, takeover), `encounter-boss-designer` (group pack
data), `gameplay-programmer` (frieze).

**Tests.** Given a 2-player group fight where J1's hero dies, Then the frieze is M1, J2, M2 and a
search from M2 still returns a legal move and respects the budget. Given 4 packs and 4 players and
budget 300 each, Then the 4 pack plans equal those of a second run (determinism) and the property
"no peer diverges" of `network-programmer` §8.6 holds with bots on every seat.

---

## 16. Battle royale bots (§20, rules.md §10.4)

- **Contract (FINAL, rules.md §10.4):** a bot's order is a pure function of the round-start state
  and the seed, computed before the reveal, blind to human orders.
- **Order** (§20: at most 1 Mouvement, 1 Action, 1 Action rapide): no alpha-beta with 6 players
  (tech.md §7 already says alpha-beta does not apply cleanly).
- **Algorithm "paranoid greedy"** (PROPOSAL): candidates = own Mouvements in engine order, plus
  "no Mouvement"; for each, apply it on a clone with every other player passing, then the rotation's
  Action and Quick; score = `evaluate` − the worst single-opponent reply (each opponent's legal
  Mouvements that eject or damage us, applied on the clone, worst one taken). Budget 2 000 nodes
  (TUNE) counted per `apply_action`; candidates beyond the budget are skipped in order. The seed
  breaks only exact score ties (`mix(seed ^ round)`), as rules.md §10.4 allows.
- Normalised hero (§20: level 20 template, 2 tier-1 abilities): the bot picks the first two of its
  class rotation's tier-1 abilities (PROPOSAL).
- The anti-kingmaking check of rules.md §10.4 (1 000 bot games) uses this bot; the measure belongs to
  `pvp-br-designer` and `qa-engineer`.

**Dependencies.** `pvp-br-designer` (BR templates, chests), `gameplay-programmer` (`round.rs`
resolution), `network-programmer` (lobby fill), `class-designer` (rotations).

**Tests.** Same state and seed, same order. Given a bot whose hero is on the rim with an opponent
able to eject it, Then its order moves the hero away. Given two candidates with equal scores, Then
the seed picks one and a second run picks the same. E2E (R10, `client-programmer`): a BR lobby with
one human fills the 5 empty seats with bots and the first round resolves.

---

## 17. Budgets, performance and the browser (§5.3, §24.5, tech.md §7)

### 17.1 Node budgets

| Context | Budget (nodes) | Tag |
|---|---|---|
| Tutorial pack (levels 1 to 4) | 30 | TUNE |
| Skirmish pack | 300 | TUNE (same as `encounter-boss-designer` §8.1) |
| Elite pack | 600 | TUNE (same) |
| Dungeon room pack | 600 | TUNE (same) |
| Boss | per boss data, default 1 500 | TUNE |
| World boss, raid boss | per boss data, at most 3 000 | TUNE |
| Takeover bot | 300 | TUNE |
| Battle royale bot | 2 000 (`apply_action` calls) | TUNE |
| Ladder player bot | 4×, 1× and 0.5× the opponent budget; "pro level" = 10× | FINAL (boss-balance.md §1 definition) |

Budgets come from data and the `CombatSetup`, never from the device (FINAL, network determinism):
a slow phone takes longer, it never searches less.

### 17.2 Time targets (measured, never enforced in tests)

- One pack turn of a skirmish (300 nodes) in WASM on the reference low-end phone: ≤ 150 ms (TUNE),
  so 4 packs ≤ 0.6 s, inside `network-programmer`'s 2 s for 4 packs (TUNE there).
- Native cost per combat node on the CI runner for the R1 skirmish: ≤ 50 µs (TUNE). Printed by
  `examples/ai_bench.rs` in every AI PR description; a regression of more than 2× (TUNE) needs a
  written reason in the PR.
- If R1 measures miss the targets: first lower the budgets (data), then ask `gameplay-programmer`
  for a cheaper `play` (undo token or a move-and-end-turn fast path), then add a fixed-size
  transposition table (always-replace, keyed by `state_hash`, cleared per search, size 4 096 entries,
  all TUNE) (PROPOSAL, in that order, KISS).

### 17.3 Browser

- The RPG AI runs in the existing bot worker (`bot.worker.ts`): new request kind
  `{ kind: "rpg_turn", setup, log, nodes }`, answer `{ actions: string[] }` in the canonical action
  text (gameplay-programmer §4.7). The worker replays the log, calls `plan_turn` through the bridge
  and returns the actions (PROPOSAL; glue and tests by `client-programmer`).
- Bridge function (Rust side, this role): `abalone_wasm::CombatEngine::plan_turn(nodes) -> String`
  (JSON array of action texts) next to `apply`, `view`, `preview` (PROPOSAL, bridge layout by
  `tech-lead`).
- The page shows "pack thinking" while the worker works and plays the returned actions one by one
  (`ux-designer`).

**Dependencies.** `client-programmer` (worker message, bridge glue, e2e), `tech-lead` (bridge
layout), `ux-designer` (indicator, pacing), `qa-engineer` (reference phone), `network-programmer`.

**Tests.** Rust: `plan_turn` through the bridge on a golden state returns the same actions as native
(wasm-bindgen test or vitest on the built package). E2E (Playwright, R1): in the R1 fight, after the
player ends a turn, the pack plays a legal turn and the active side returns to the player within 3 s
on the CI browser (TUNE); `window.__lastAiPlan` lists the actions.

---

## 18. RPG bot ladder, telemetry, fixtures, gates (§18, §25 R1, R2, R8, R9, boss-balance.md)

### 18.1 Cells

A cell = (class, level, opponent, player budget). `data/ladder/cells.ron` lists them (PROPOSAL):

```ron
[
  (class: "class.warrior", level: 1, opponent: "pack.r1.reference", budgets_x: [4, 1, 0.5]),
  (class: "class.warrior", level: 8, opponent: "boss.echo",         budgets_x: [10]),
]
```

- Seeds per cell: 10 (FINAL, boss-balance.md method). Seed `i` builds the attempt: board terrain and
  pack variant from `world-programmer` / `encounter-boss-designer` builders when they exist (R4+),
  the fixed reference setup before; the player bot's `opening` (12.4).
- Turn cap: 400 entity turns per attempt (TUNE), then a loss `turn_cap`.
- Opponent budget: from the opponent's data; player budget = multiple × that.

### 18.2 Runner

`cargo run --release --example rpg_ladder [-- <opponent ids>]`, the same env switches as
`examples/ladder.rs` (`LADDER_NODES`, `LADDER_X`, `LADDER_JSONL`, `LADDER_FIXTURES`), plus
`LADDER_GOLDEN=<dir>` (writes golden logs in `network-programmer`'s JSON format) and
`LADDER_GATES=<file>` (PROPOSAL). Seeds of a cell run in parallel threads (as today).
Output contract asked by `devops-build` D11 (accepted here):
- a Markdown table `| class | level | opponent | budget | wins | median turns | max phase | deaths |`;
- `ladder.jsonl`, one attempt per line;
- exit code 0 when every row is inside its gate, 1 when a row is outside, 2 on a crash.

### 18.3 Telemetry record

`RpgAttemptRecord` extends `AttemptRecord` (fields of `encounter-boss-designer` §18, PROPOSAL):
`class`, `level`, `opponent`, `seed`, `attempt`, `player_budget`, `opponent_budget`, `result`,
`turns`, `max_phase`, `death` (`hero_ejected`, `hero_killed`, `rout`, `draw`, `enrage`, `conversion`,
`mirror`, `turn_cap`, `stuck`), `hero_hp_end_bp`, `losses_taken`, `losses_inflicted`,
`heart_hp_bp` (bosses), `casts` (count per ability id, sorted by id). Encoded as one JSON line with
the same hand-written encoder style as `telemetry.rs` (or `serde` if `tech-lead` approves it for
`abalone-rpg`). The death cause comes from the last `EntityLeft` / `CombatEnded` effect, never from
board diffs.

### 18.4 Fixtures

Text, same style as `encounter/fixture.rs` (FINAL style), extended (PROPOSAL, agreed with
`encounter-boss-designer` §18):

```text
fixture: rpg 1
rules_version: 1
opponent: pack.r1.reference
class: class.warrior
level: 1
seed: 3
player_budget: 3000
opponent_budget: 300
setup: {"v":1,...}
actions:
cast warrior.cleaver @(1,0)
move (-1,0)(0,0)>E
end
move (2,-3)(2,-2)>SW
end
```

- `setup:` is the canonical `CombatSetup` JSON on one line (gameplay-programmer §5,
  network-programmer canonical JSON); `actions:` holds **both** sides' actions, so replay never
  searches (FINAL principle of boss-balance.md §4).
- `Fixture::replay` calls `gameplay-programmer::replay(setup, log)` and returns the outcome; a
  fixture whose `rules_version` differs from the crate's fails with a named error (re-record).
- Fixtures live in `crates/abalone-rpg/tests/fixtures/<opponent>.txt`; `tests/rpg_fixtures.rs`
  replays each and asserts a player win.

### 18.5 Gates

`data/ladder/gates.ron` (thresholds owned by `encounter-boss-designer` and `qa-engineer`; format
here, PROPOSAL):

```ron
[
  (opponent: "pack.*",   budget_x: 1,  min_wins: 9, max_wins: 10),
  (opponent: "boss.*",   budget_x: 10, min_wins: 7, max_wins: 9),
]
```

- Values: packs 9 to 10 of 10 at 1× (PROPOSAL, TUNE); bosses 7 to 9 of 10 at 10× (FINAL in
  boss-balance.md for classic bosses, PROPOSAL for RPG bosses).
- The release gate of §18 (a released boss has a winning fixture) is `encounter-boss-designer`'s
  integrity test; this ladder only produces the fixtures (`LADDER_FIXTURES`).

### 18.6 Phase criteria served

| Phase | Criterion (§25) | Ladder cells |
|---|---|---|
| R1 | "Avec le bot joueur"; "même log = même hash" | Warrior L1 vs `pack.r1.reference`; golden logs |
| R2 | "Chaque classe bat la meute de référence sur l'échelle de bots" | Gardien, Guerrier, Mage, Guérisseur vs their reference pack |
| R8 | "Une fixture de victoire RPG par boss" | each converted boss at 10× |
| R9 | "Les 8 classes passent l'échelle de bots" | 8 classes × the zone reference packs × bosses |

### 18.7 Dependencies

`encounter-boss-designer` (reference packs, boss data, gates, release flags), `class-designer`
(rotations), `devops-build` (nightly job D11), `qa-engineer` (reads reports, files balance tasks),
`network-programmer` (golden log format), `gameplay-programmer` (`replay`, canonical text, setup
JSON).

### 18.8 Tests

- A tiny ladder (2 seeds, 6 turns cap) runs in a unit test and aggregates 2 records (as
  `a_tiny_ladder_runs_two_seeds_and_aggregates`).
- Same seed, same record (twice).
- Fixture text round trip; every parse error named (as `fixture.rs` tests); a refused action fails
  the replay with its index; a wrong `rules_version` is refused.
- Gates: a report with one row below its gate gives exit code 1 and names the row; a row above
  `max_wins` too (a boss won 10 of 10 is a balance bug, boss-balance.md §1).
- Golden log written by `LADDER_GOLDEN` replays to its stored hash (the NP-01 native test).

### 18.9 Risks

- RPG nodes cost more than classic nodes: a 10× boss budget (15 000 nodes for a 1 500 boss) × 400
  turns may not fit the 60 min nightly (devops D11). Answer: lower boss budgets, matrix by class
  (devops D11), the Ballast Mind excluded from nightly until measured (as today).
- A gate that flips on one seed: rates over 10 seeds, one issue at a time (devops D11 rule).

---

## 19. Classic mode: hook-aware player for every classic boss (boss-balance.md §6, §24.2)

boss-balance.md §6: "The Hull cracks and the Ballast Mind hooks are not in the player tree yet."
With the trait of section 4, an `EncounterNode` (clone of `Encounter`, `play` = `Encounter::play`)
puts every hook in the tree with no per-boss step (PROPOSAL):

- The ladder player uses `EncounterNode` for every boss; `chaplain_step` is deleted once
  `EncounterNode` gives the same results on the existing test `the_chaplain_step_is_what_the_encounter_does_to_the_board`.
- The seed problem stays: the Chaplain's flip-cost roll uses the encounter seed, which the player
  does not know (boss-balance.md: "the player search passes 0"). `EncounterNode` runs with seed 0
  for the player side, the same blindness as today (FINAL existing behaviour, documented).
- The boss-balance.md tables for the Hull and the Chaplain are re-run and updated in the same PR;
  fixtures are untouched (replay does not search).
- Cost: `Encounter` clones the game history (up to 300 plies); if a node costs more than 2× the
  `chaplain_step` node (TUNE), the history is shared with an `Rc` slice or the encounter gets a
  lighter clone (PROPOSAL, measured by `ai_bench`).

**Dependencies.** `encounter-boss-designer` (owners of classic boss tuning, read the new table),
`qa-engineer`.

**Tests.** Given the Hull one move before a crack fires on a Black marble's cell, When the player
search runs with budget 2 000, Then the chosen move takes the marble off the crack (the old
hook-blind search does not; asserted as a difference). Existing ladder and fixture tests stay green.

---

## 20. Puzzle prover (§4.3 "Énigme", §16)

`narrative-quest-designer` §10 defines puzzles on the classic engine (`solo` and `duel`) and asks
that a `solo` puzzle has no solution shorter than the cap minus 1. This role gives the prover:

- `prove(puzzle) -> Proof { shortest: Option<u8>, line: Vec<Move> }` (PROPOSAL): iterative deepening
  depth-first over the puzzle node (`solo`: Black only; `duel`: Black, then White's deterministic
  reply `search(board, budget)` as one forced child), pruned when the remaining moves cannot reach
  the goal (`eject N` needs N more ejections, at most one per move, FINAL rules.md §5).
- Limit: cap ≤ 4 moves and 2 000 000 nodes per puzzle (TUNE); above, the integrity test only replays
  the stored solution.

**Dependencies.** `narrative-quest-designer` (puzzle format, module `abalone-world/src/puzzle.rs`),
`world-programmer` (crate).

**Tests.** Given a solo "eject 1 in 2" puzzle with a known 1-move solution, Then
`shortest = Some(1)` and the integrity test flags it as too short. Given a duel puzzle whose
stored line fails against the deterministic reply, Then `prove` finds no line of that length.

---

## 21. Determinism and the test strategy (§24.1, §1 pillar 4, §25 R1)

| Level | What | Where |
|---|---|---|
| Unit | every function and branch of `ai/` and `ladder/`, one test per `Cond`, `Selector`, policy | next to the code |
| Golden | classic search table (4.5); 20 golden AI plans (state hash → actions) recorded once (TUNE count) | `abalone-core` tests, `abalone-rpg/tests/ai_golden.rs` |
| Property (seeded loops) | plans are legal (500 states); budget respected; Edge check equals `edge_danger` (1 000 states); classic AI invariant (50 positions); symmetry of eval (200 states) | `abalone-rpg/tests/ai_properties.rs` |
| Cross-target | the golden AI plans give the same actions on wasm32 | `client-programmer` vitest on the built package |
| Ladder | tiny ladder in unit tests; full ladder nightly (devops D11) | `ladder/`, `examples/rpg_ladder.rs` |
| E2E (Playwright) | pack plays in the browser (R1), intent glyph (R2), Echo mirror (R8), BR bots fill seats (R10) | `client/e2e/`, written by `client-programmer` with this role |

Coverage: 100 % lines and regions (FINAL, CONTRIBUTING §11); `examples/*.rs` are excluded from
coverage like `examples/ladder.rs` today (PROPOSAL, `devops-build` confirms).

Determinism rules for the AI (FINAL by #313 choice 4, details PROPOSAL): no float; no `HashMap`; no
clock; no RNG inside `plan_turn`; budgets from data; stable sorts only; the transposition table, if
ever added, has a fixed size and an always-replace rule and is cleared per call.

---

## 22. Feedback on the gameplay spec

Each item: where, what is wrong or missing, and the PROPOSAL used in this file. The gameplay spec is
not modified; these go to #313 as one comment (Task AI-00).

- **AIF-1 (§5.3, §6.2, §20): alpha-beta is a two-player algorithm.** §5.3 says "Alpha-bêta sur
  l'état du combat"; the group frieze (§6.2) has up to 8 entities and battle royale 6 players.
  Proposal: negamax over **camps** (two camps, a camp may play twice in a row, section 4.2); battle
  royale uses a greedy "paranoid" bot, not alpha-beta (section 16). tech.md §7 already says
  alpha-beta does not fit N players.
- **AIF-2 (§5.3): "3 meilleures cibles selon une heuristique" has no heuristic.** Proposal: each
  selector ranks (section 8.2), the top 3 are previewed, the best preview wins.
- **AIF-3 (§5.3 vs §6.3): the fixed monster order wastes melee Actions.** "Action, then Mouvement,
  then Action rapide" means a monster that walks into range can never hit that turn. Proposal: a
  second Action attempt after the Mouvement, non-major abilities only (7.2 step 3).
- **AIF-4 (§24.2): the player bot's order is unspecified.** A rotation script cannot say that
  Percée, Bélier, Avalanche, Titan or Cri de guerre must come before the push, or that Charge moves
  the hero first. Proposal: the order of 12.2 with `pre_move` rules.
- **AIF-5 (§5.3): node budgets have no values.** "Un budget en nœuds" only. Proposal: table 17.1,
  and budgets never depend on the device (lockstep needs the same AI on every peer).
- **AIF-6 (§4.4 vs §1 pillar 2): an ambush can break "annoncée un tour à l'avance".** The pack plays
  first; a major ability cast on that first turn was never told. Proposal: no intent at fight start,
  first monster turn non-major only (9.2).
- **AIF-7 (§6.7): what the AI aims for in a draw is unstated.** A losing pack that kites to the
  60-turn draw denies XP and is no fun. Proposal: packs score a draw as −2 000 points, below losing a
  unit (6.4).
- **AIF-8 (§18): the release sentence is inverted.** "Un boss ne sort que s'il a gagné une échelle
  de bots RPG" reads as "the boss wins"; boss-balance.md means the **player bot** beats the boss.
  Proposal wording: "a boss ships only when the RPG player bot beats it on the ladder".
- **AIF-9 (§18, §25 R2): the gates are incomplete.** §18 says a boss is blocked "tant qu'ils n'ont
  pas de fixture de victoire" (fixture only?), boss-balance.md says fixture **and** 7 of 10 at 10×;
  §25 R2 "chaque classe bat la meute de référence" gives no rate, budget or reference pack.
  Proposal: section 18.5 (packs 9 to 10 of 10 at 1×, bosses 7 to 9 of 10 at 10× plus a fixture).
- **AIF-10 (§6.2): one pack per player, but whom does each pack attack?** Without a rule four packs
  may all focus the weakest hero. Proposal: pack `Mi` weighs player `Ji`'s units ×1.25 (section 15).
- **AIF-11 (§5.3 affix Écho, §18 The Echo): whose Mouvement is mirrored in a group fight?**
  Proposal: the last player entity that played (14.2).
- **AIF-12 (§4.7): who computes the monster turns in a group is unstated.** "Aucun pair n'a
  autorité" and "chaque pair valide chaque action" leave two designs: every peer runs the AI (4×
  cost per peer, needs bit-identical AI) or the pack's own player signs the AI actions in the log
  (cheaper, but that player could make its pack play badly). This file follows
  `network-programmer` (every peer computes); Open question Q1.
- **AIF-13 (§6.8, §18): the boss fight's win condition decides whether phases are reachable.** The
  boss row of §6.8 says rout threshold 6 "ou le boss"; §18 gives the Heart HP phases. If the boss
  camp can be routed by 6 Losses of its reinforcements before the Heart reaches 35 %, the last
  phase is never played again: the exact problem of boss-balance.md §5. The ladder needs one win
  condition per boss (Heart at 0, or rout, or both). Owner: `encounter-boss-designer`.
- **AIF-14 (§18, boss-balance.md §3): the pro-level budget does not fit RPG nodes.** 10× the boss
  budget was already 1.5 M nodes per move for the classic Ballast Mind; an RPG node costs more. The
  raid boss needs a budget that a 60 min nightly can run, or the ladder plays it at a lower multiple
  (section 18.9).
- **AIF-15 (§1 pillar 2 "Tout l'état du combat est public"): the AI's knowledge equals the player's.**
  Not a problem, but the spec should say the AI never reads hidden data (there is none) and the
  player bot reads Edge danger and intents like a human. Proposal: write it in `rpg/combat.md`.
- **AIF-16 (§11 vs §5.3): tutorial monsters must have no ability.** §5.3 gives every archetype 1 or
  2 abilities; §11 says tutorial fights have none. Proposal: tutorial packs use an empty priority
  list (section 13).
- **AIF-17 (§24.2 vs tech.md §7): where the AI lives.** §24.2 puts the monster AI and the bot in
  `abalone-rpg`; tech.md §7 says `abalone-core` or a crate `abalone-ai`; tech.md also lists a
  Zobrist table, killer and history heuristics that the code does not have, a "time-boxed casual
  AI" (`budget_ms`) that contradicts §5.3 "jamais en temps", and "bosses use a seeded RNG" which
  contradicts #313 choice 4 (no randomness in combat). Proposal: tech.md §7 is updated in the R0
  docs PR 4 (`tech-lead`): generic search in `abalone-core`, combat AI in `abalone-rpg`, nodes only,
  no RNG in combat AI.
- **AIF-18 (§24.1): the scan order change moves classic AI results.** "r croissant, puis q
  croissant" differs from the q-major loops of `search.rs` today; classic ties and the classic
  ladder numbers will change when the order changes. The spec should say classic AI results are
  allowed to change once (re-measured), fixtures are not (they replay moves).
- **AIF-19 (§8.7): the Chronomancer's history makes AI states heavier.** Retour and Paradoxe read
  "the start of the previous turn" of each entity, so every node clones two snapshots. Not a rule
  problem; a cost the R9 budgets must absorb (Task AI-17).
- **AIF-20 (§16, §4.3): puzzles have no solvability rule.** "Éjecte en 3 coups" puzzles need a proof
  that they are solvable and not trivially shorter; the spec leaves it out. Proposal: the prover of
  section 20, used by the integrity test.

---

## 23. Open questions

- **Q1.** Group PvE: does every peer run every pack's AI (current `network-programmer` choice), or
  does the pack's own player sign its pack's AI actions into the log?
- **Q2.** Node budgets of table 17.1 and the reference low-end phone for the 150 ms target: who picks
  the device (`qa-engineer`)?
- **Q3.** Ladder gates: packs 9 to 10 of 10 at 1×, bosses 7 to 9 of 10 at 10× plus a fixture: do
  the owners accept these for the RPG?
- **Q4.** Should a pack ever play for a draw (section 6.4 says never)?
- **Q5.** Do packs in a group fight prefer their own player's units (section 15)?
- **Q6.** Battle royale bots: is "paranoid greedy" strong enough to keep empty seats interesting, or
  should bots be deliberately weaker (lower budget)?
- **Q7.** An RPG Hint button (the player bot's suggested turn as a ghost, like #192): wanted, and from
  which phase? Not in the gameplay spec.
- **Q8.** May a monster cast a non-major Action after its Mouvement (section 7.2 step 3)?
- **Q9.** The Ballast Mind raid: which budget multiple can the nightly ladder afford, or is it
  measured by hand only?

---

## 24. Tasks (one PR each)

Every Task follows CONTRIBUTING: its own issue, branch `<issue>-<slug>`, a failing test commit before
the code commit, 100 % lines and regions, `scripts/verify.sh` green, a draft PR. Every Task except
AI-00 waits for Decision #313 and the R0 docs PRs. A Task with a player-visible change lists its
Playwright case and needs a screenshot in the PR (CONTRIBUTING §6.4); the e2e file is written with
`client-programmer`.

### R0

**AI-00. AI notes for the R0 docs and feedback on #313.**
Outcome: the RPG docs say how monsters and the player bot choose actions, and AIF-1 to AIF-20 are
raised on #313.
- [ ] A short "Monster AI and player bot" section handed to the owner of `rpg/dungeons-bosses.md`
      (docs PR 3): turn order, intents, budgets in nodes, the ladder gates
- [ ] AIF-1 to AIF-20 posted as one comment on #313 (no decision taken alone)
- [ ] Docs only, no code

### R1: minimal combat

**AI-01. Generic search over a `SearchState` trait.**
Outcome: `search.rs` runs on any `SearchState` with camps that may repeat, and the classic search
gives exactly the same results as before.
- [ ] Trait, `Terminal`, `SearchConfig`, `negamax_search` (section 4)
- [ ] Classic `Node` implements it; `search`, `search_with`, `search_hooked`, `position_score`
      unchanged in signature and results
- [ ] Golden table of 30 positions recorded before the change and equal after
- [ ] Toy-state tests: same camp twice, pass, draw score, budget property
- [ ] `ai_bench` prints classic nodes per second before and after

**AI-02. Classic boss encounters searched with their hooks.**
Outcome: the classic ladder player sees every boss hook in its tree, and boss-balance.md shows the
re-measured numbers.
- [ ] `EncounterNode` implements `SearchState` with `Encounter::play`
- [ ] Ladder player uses it for every boss; `chaplain_step` removed after the equality test
- [ ] Hull crack test (section 19); existing ladder and fixture tests green
- [ ] boss-balance.md tables for the Hull and the Chaplain re-run and updated

**AI-03. The combat as a search state.**
Outcome: the search explores RPG combats one entity turn per ply, with every engine rule and told
effect inside the tree.
- [ ] `CombatNode` (section 5): Mouvement plus `EndTurn` per ply, pass, terminal, decisive
- [ ] Tests of 5.5 (equality with `apply_action`, pass, Lava inside the tree)
- [ ] Depends on `gameplay-programmer` GP-01 to GP-07

**AI-04. Combat evaluation v1.**
Outcome: a combat position gets an integer score for a camp, with hero safety, rout pressure and
Abalone shape terms.
- [ ] `EvalWeights`, R1 terms of 6.1 (unit value, rout, Edge danger, hero low, edge distance,
      cohesion, isolation), draw scores of 6.4, `data/ai/profiles.ron` defaults
- [ ] `hero_ejectable` and `exposed_on_edge` (6.3); property equal to `edge_danger` on 1 000 states
- [ ] Classic AI invariant on 50 positions; eval symmetry on 200 states

**AI-05. Monster turn planner v1 and the rule interpreter.**
Outcome: an AI pack plays a whole legal turn (Action, Mouvement, Quick action) from its priority list
within its node budget.
- [ ] `AiConfig`, `TurnPlan`, `plan_turn` for monsters (7.2 steps 1 to 4 and 6, no intent yet)
- [ ] `Rule`, `Cond`, `Selector` R1 subset; top-3 preview choice (8.2)
- [ ] Tests of 7.4 and 8.5 (order, legal by construction on 500 states, determinism, budget)

**AI-06. Player bot v1 (Warrior).**
Outcome: a bot plays the R1 Warrior and its squad with the Warrior rotation, never repeats a position
and keeps its hero out of Edge danger when it can.
- [ ] `AiKind::PlayerBot`, turn order of 12.2, safety filters of 12.3 with fallback, seeded opening
- [ ] Reads `data/rotations/warrior.ron` (`class-designer`)
- [ ] Tests of 12.6

**AI-07. RPG ladder v1, telemetry, fixtures, golden logs.**
Outcome: `cargo run --release --example rpg_ladder` plays the Warrior against the R1 reference pack
over 10 seeds, writes JSON lines, fixtures and golden logs, and exits by its gates.
- [ ] `ladder/` module, `examples/rpg_ladder.rs`, env switches of 18.2, exit codes 0, 1, 2
- [ ] `RpgAttemptRecord` and JSON line; fixture format of 18.4 with replay and `rules_version`
- [ ] Gates file format and check; `LADDER_GOLDEN` writes `network-programmer` golden logs
- [ ] Tiny ladder unit test; first R1 fixture `pack.r1.reference.txt` replays to a win

**AI-08. The pack plays in the browser.**
Outcome: in the R1 fight the pack's turn is planned in the bot worker and played on screen.
- [ ] `CombatEngine::plan_turn(nodes)` on the bridge; same actions native and wasm on golden states
- [ ] Worker request `rpg_turn` with `client-programmer`; `window.__lastAiPlan` test hook
- [ ] `ai_bench` numbers for the R1 skirmish in the PR (17.2)
- [ ] Playwright: after the player ends a turn the pack plays a legal turn and the player is active
      again within 3 s; screenshot in the PR

### R2: four classes, statuses, terrain

**AI-09. Intentions.**
Outcome: monsters announce their next major ability and its target one turn ahead, cast it as told
or let it fizzle, and the search sees committed intents.
- [ ] Choose, commit, resolve (9.1); no intent at fight start (9.2)
- [ ] Intents resolved inside `CombatNode::play`
- [ ] Tests of 9.4; Playwright intent glyph case with `client-programmer`, screenshot

**AI-10. Evaluation v2: statuses, terrain, tells, threats.**
Outcome: the AI avoids harmful terrain and told zones, values shields and statuses, and fears ready
enemy abilities.
- [ ] Terms "told zone", terrain, statuses, resources, threat of 6.2; `data/ai/terrain.ron`,
      `data/ai/status.ron`
- [ ] One test per term; Météore dodge test

**AI-11. Full conditions and selectors, four class rotations on the ladder.**
Outcome: the Gardien, Guerrier, Mage and Guérisseur bots each beat their reference pack inside the
gate on the ladder (R2 exit criterion).
- [ ] Every `Cond` and `Selector` of 8.1, one test each; unknown variant error
- [ ] Ladder cells for the 4 classes; fixtures recorded; report attached to the PR

**AI-12. AI picks: Éjecteur choice, mass control, zones, directions, pre-move modifiers.**
Outcome: when an ability asks the caster to choose, the AI and the bot choose by a written,
deterministic rule.
- [ ] Rules of section 10; `pre_move` rules for the bot and monsters
- [ ] Tests of section 10

### R4: world v1

**AI-13. Placement and formation choice.**
Outcome: the player bot and packs with a choice pick a formation and hero swap by evaluation.
- [ ] Section 11; integration with `world-programmer` formations
- [ ] Tests of section 11; ladder setups use placement from this Task on

### R6: quests

**AI-14. Puzzle prover.**
Outcome: every short puzzle is proven solvable within its cap and not trivially shorter.
- [ ] `prove` (section 20) over the classic `SearchState`
- [ ] Used by `narrative-quest-designer`'s puzzle integrity test; tests of section 20

### R8: dungeons and bosses

**AI-15. Boss AI: phases and move policies.**
Outcome: converted bosses switch rules and profiles by HP phase and choose Mouvements by their
policy (search, mirror, armies, region).
- [ ] `BossPolicy` of 14.2, phase switch of 14.1, region filter of 14.3
- [ ] Tests of 14.5; Playwright Echo mirror case with `client-programmer`, screenshot

**AI-16. Boss cells on the ladder and their fixtures.**
Outcome: each converted boss is played at 10× on the ladder and a winning RPG fixture is recorded
for each one that is inside its gate.
- [ ] Ladder cells for The Echo, The Hull, The Chaplain, The Choir (and the Ballast Mind at the
      affordable multiple, Q9)
- [ ] Fixtures in `tests/fixtures/`, replay test; report attached to the PR for
      `encounter-boss-designer`'s release flags

### R9: full world

**AI-17. Eight classes on the ladder and heavy states.**
Outcome: the 8 class bots pass the ladder gates, within the nightly time limit.
- [ ] Rotation support for Necromancer, Chronomancer, Geomancer, Assassin mechanics (Revenants,
      history snapshots, terrain edits, combo points)
- [ ] `ai_bench` on the heaviest states; budgets adjusted in data if needed (17.2 order)
- [ ] Ladder cells for 8 classes; nightly matrix by class with `devops-build`

### R10: multiplayer

**AI-18. Group fights and the takeover bot.**
Outcome: AI packs play group fights by camp with a preference for their own player, and a stalled
party member's entity is played by the player bot identically on every peer.
- [ ] Group frieze tests of section 15; pack target preference
- [ ] `plan_turn` for a seat with `opening = 0`; `network-programmer` NP-11 property with bots on
      every seat

**AI-19. Battle royale bots.**
Outcome: empty battle royale seats are filled by bots whose orders depend only on the round-start
state and the seed.
- [ ] `royale.rs` paranoid greedy order (section 16), budget, seeded tie-break
- [ ] Tests of section 16; Playwright lobby fill case with `client-programmer`, screenshot
