---
id: stalker
type: feature-design
status: draft
title: "The Stalker: a boss under a fog"
parent: game-design
depends-on: [rules]
---

# The Stalker: a boss under a fog (#1111)

One topic: Stalker stops being a Game modes entry (#998, #1001, `game-design.md` section 3.8) and becomes the 14th boss
of the roster. Owner request, 2026-10-31: Stalker is an opponent, not a way to play. This spec decides what kind of boss
it is, its goal, tell, phases, medal, daily slot and ladder row, what becomes of the fog rules and of the saved game, and
the order of the tasks. It changes no move or push rule (`rules.md`, pillar 1). Contrast, 3:1 and lighting are not part
of it.

## 1. Decision: a Rust `Encounter`

| Option | Cost | Verdict |
|---|---|---|
| **A. Rust `Encounter`** (`encounter/stalker.rs`, a `BOSSES` line in `abalone-wasm/src/encounter.rs`) | Port `visibleCells`, `seenBoard`, `seenMoves` and the blocker test of `client/src/stalker.ts` (97 lines) to Rust; an engine version bump; one ladder row | **Chosen** |
| B. Plain engine under the client fog, shown as a boss | Every list that reads `boss_ids()` needs a client special case: the Boss fight and Fight together lists, the daily pick (section 7.6), the medal room, the goal sheet, the ladder, the MCP; the fog stays outside the position, so a peer or an agent cannot check it | Rejected |

Reasons for A: a boss in this repo is what `boss_ids()` lists, so the list, the daily, the medal, the boss bar, the
goal text, the co-op fight and the MCP come for free and stay in one place (the wasm bridge). The fog is a pure function
of the board and the phase: the engine can answer "what does the player see" and "does a hidden marble refuse this move"
for every peer, the same way, and the ladder can play it. The cost is one Rust file (about 150 lines with tests) and a
bump of `engine_version` 15 to 16 (the daily pick of the days after it ships changes, as for every new boss). The
shipped TypeScript fog is deleted once the Rust one is wired (task 4), not kept twice.

## 2. The boss

- **Concept**: the Chapel's night watch (Chapel deck look). It sees the whole ship; you see only what is close to you.
- **Board and sides**: standard radius 4 board, 14 marbles each on the standard layout, standard Abalone for both
  sides. No `Board` flag, no hook (`special` and `hook` do nothing), no mark on the board.
- **Win and loss**: first to eject **6** wins (`rules.md` section 10.3), as the other bosses. Anti-stalling is unchanged
  (`game-design.md` section 5: threefold repetition, the 100-ply no-ejection cap). **A draw is a loss** for the player,
  as for every boss; it was a draw in the mode.
- **Goal text** (`goal` of the `BOSSES` line, read before the first move): "The stalker sees your whole army. You see its
  marbles only near your own, and a move may be stopped by one you cannot see. Eject 6 to win; lose 6 or draw to lose."
- **Name and id**: "The Stalker", `stalker`.
- **Lore slot**: Extra, deck 4 Chapel, "any time, boss menu" (a new row of the section 7 table). Play order: last (14th)
  in `BOSSES`, so the medal room and the lists add it at the end.

## 3. The fog rules (kept, now the boss's rules)

All of the old section 3.8 is kept as shipped (#998), moved here, with the sight set by the phase.

| Item | Rule |
|---|---|
| Sight | A cell is **visible** when it is within hex distance `sight` of one of the player's marbles (its own among them). `sight` is 3 in P1, 2 in P2, 1 in P3 (TUNE, section 8). P2 starts after **3** ejections credited to you, P3 after **5**, as the Echo and the Pulsar. 2 is the value shipped by #998 |
| Fog | Boss marbles outside the visible set are not drawn; off-range cells are drawn dark, the board outline stays |
| Moves offered | The moves of the board as you see it: hidden cells read as empty; a move blocked by a visible marble is not offered |
| Hidden blocker | A move offered but refused by the real board because of a hidden boss marble is **not played**: the engine returns the refusal and the blocking cells, nothing changes (no ply, no repetition count, no 100-ply count). That marble is **revealed** (drawn and counted as visible) until your next played move. You play again |
| Boss's last move | Its destination cells are ringed for one turn, only those in the visible set |
| Public | Ejection counters, the score, the end of the fight, the phase and `sight` |
| The boss | Sees and searches the whole board. It plays standard Abalone: the rule is a view rule, so its search needs no model of it (#930; the unit test is that its reply equals the plain search of the same budget on the same position) |
| Evaluation bar, Hint, Auto-play | Off, as in every boss fight (fair play, #164); no Stalker-specific line |
| Co-op (Fight together) | The team is one side: the visible set is the union of the sight of every marble of the side, the same for both peers. The peers still hold the full state; the fog is a view, not an anti-cheat (as the old section 3.8 said) |

Edge cases (each a unit test): a sight of 1 with a lone marble far from the boss; a move the visible set offers that
two hidden marbles block (both cells are returned and both are revealed); a sumito where the pushed line is visible
but the marble behind it is not (the engine decides, the refusal reveals it); a refusal on the first move of a fight; a
revealed marble across a phase change (cleared at the next played move whatever the phase); an ejection that brings the
phase up (the next offer uses the new `sight`); no boss marble in the visible set (all hidden).

## 4. Tell, boss bar, goal sheet

- **Tell**: the fog is the tell, and the one thing to read ahead is the sight. The HUD line reads "Sight 3 · narrows to 2
  after N more ejections" (P3: "Sight 1"). Reading it is the lesson: you cannot see a boss you do not scout, so you keep
  a scout marble forward.
- **MCP `tell`** (`mcp.md` table): `kind: "sight"`, no cells, the range and the ejections before it narrows in `text`.
  `marks` `kind: "last"` on the ringed cells. The state an agent reads is the seen board, never the full one, or an
  agent would play the whole board while a player cannot.
- **Boss bar and phases**: the generic bar, three phases, the phase name is the sight ("Sight 3", "Sight 2", "Sight 1").
  The HUD note "Stalker: the bot is not fogged" is dropped: "The stalker sees your whole army" is in the goal text.
- **Revealed marble and last-move ring**: the existing look of #998 (pale ring, the dark veil), unchanged.

## 5. Medal, daily, roster, ladder

- **Medal**: the standard boss medal (#791), the fewest player turns of a win, in the medal room last (14 entries; the
  reader must still fit, a screenshot is in the acceptance of task 4).
- **Daily**: the Stalker joins `boss_ids()`, so it is a possible daily boss (`boss_ids()[seed mod 14]`; the pick of the
  days after it ships changes, section 7.6). The daily card is unchanged. Determinism: the boss search is node-limited
  and seeded (section 8); the fog has no randomness, so a Retry, the daily, a replayed game and every peer see the same.
- **Roster**: 14 bosses. The Ballast Mind does **not** borrow it: the Stalker is a view rule, not a one-shot hook
  (section 7 rule: add the mechanic "when it fits as a one-shot hook").
- **Node budget**: 3000 (about depth 3, as the Hull and the Pulsar). TUNE.
- **Ladder**: a `LadderBoss::Stalker` row in `ladder.rs`. The pro-level player of `boss-balance.md` section 1 plays it
  under the same fog: it searches the seen board (hidden marbles read as empty), and on a refusal it reveals the
  blockers and picks the next best move. Target: **7 to 9 of 10** at 10x the budget, never 10 of 10. Numbers go to
  `boss-balance.md` section 3 in task 3.

## 6. The saved game (#1009 kept)

- A Stalker fight is saved after every move, like the local game it replaces, in the same store key, as
  `{ version, mode: 'local', boss: 'stalker', seed, moves }` (additive fields). On load the page builds
  `new Encounter('stalker', seed)`, replays the moves, and the fog is back at once, the revealed set empty (it is only
  kept until the next move). It is deleted once the fight is over. Other boss fights are still not saved: out of scope.
- A legacy save `{ stalker: true }` (a plain game vs the bot, #1009) has no seed and no boss: it is **deleted at load**,
  never shown half-done (the `LocalSaves.load` rule). The mode lived for one day; no migration.

## 7. Removal of the Game modes entry

- The `#stalker` button (`client/index.html`), its handler, the `stalker` flag of the local game, the `stalker` input of
  `autoPlayState`, the "Stalker: the bot is not fogged" note and the TypeScript fog of `client/src/stalker.ts` go. The
  Game modes menu is back to its 13 entries (#1108 fit, `bun run layout:check`). The Boss fight and Fight together
  lists get the Stalker from `boss_ids()`, no code of their own.
- `game-design.md` section 3.8 keeps one line pointing here; part 2 of #783 (the online flag) is replaced by Fight
  together, which gets the fog for free (section 3).

## 8. Calibrate

Knobs, one at a time: sight per phase (3, 2, 1), phase ejections (3, 5), node budget (3000). Fail if the pro-level
player wins 10 of 10 or fewer than 7 of 10 at 10x, if most fights end with no hidden-blocker refusal (nobody meets the
rule), or if more than 50 % of the deaths fall in one phase (`game-design.md` section 8).

## 9. Implementation tasks (User Stories, one PR each, in build order)

Each: unit tests first with 100 % coverage (lines and regions for Rust), e2e under 15 s, screenshot for the UI. The lead
creates the issues after this spec merges.

1. **Core.** As a player I fight a Stalker boss whose fog the engine knows, because the fog must be the same for every
   peer and for the AI. *Context:* `crates/abalone-core/src/encounter/stalker.rs`: `sight(phase)`, `visible`,
   `seen_board`, `seen_moves`, `blockers(board, mv)`, `stalker_boss()` (phase ejections 3 and 5, budget 3000, no hook),
   and `play` refusing a hidden blocker without changing the state. *Expected:* the edge cases of section 3 pass; the
   boss reply equals the plain search of the same budget.
2. **Bridge.** As a client I can start `stalker` from `boss_ids()` and read its fog, because the lists, the daily and the
   MCP read the bridge. *Context:* a `BOSSES` line (goal of section 2), `Encounter.sight()`, `.seen_board()`,
   `.seen_moves()`, the refusal with its cells, `engine_version` 15 to 16, the MCP `tell` and `marks` of section 4.
   *Expected:* `boss_ids()` has 14 entries, `stalker` among them.
3. **Ladder.** As the game designer I can measure the Stalker, because a boss without a ladder row is untuned. *Context:*
   `LadderBoss::Stalker` with the fogged pro-level player (section 5); numbers in `boss-balance.md`. *Expected:* 7 to 9
   of 10 at 10x, or a follow-up tuning issue naming the one knob changed.
4. **Fight UI.** As a player I fight the Stalker from the Boss fight and Fight together lists under its fog, because it is
   a boss now. *Context:* the client draws the veil, the rings and the revealed marbles from the wasm getters (the
   existing look), the sight line and the boss bar of section 4, the medal, the daily; `stalker.ts` and its fog tests
   are deleted. *Expected:* a boss-menu e2e under 15 s from a loaded fight; screenshots of P1, a refusal and the medal
   room with 14 entries.
5. **Save.** As a player I reload during a Stalker fight and come back under the fog, because #1009 must hold for the
   boss. *Context:* section 6. *Expected:* round-trip unit test, legacy `stalker: true` save deleted, an e2e from the
   game-file hook.
6. **Remove the entry.** As a player I see a Game modes menu without Stalker, because Stalker is an opponent, not a way
   to play. *Context:* section 7, ends the #1108 class of overflow. *Expected:* 13 entries, `layout:check` green, no
   `#stalker` reference left (grep the e2e specs too: a removed text once broke 59 specs unseen).
