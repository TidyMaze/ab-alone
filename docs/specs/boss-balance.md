# Boss balance: can a strong player win? (#170)

Measured with the bot ladder of #173 (`cargo run --release --example ladder`), 10 seeds per boss,
300 plies at most, a draw counts as a loss. Everything is node-limited and seeded, so a run gives
the same numbers on every machine.

## 1. Definitions

- **Pro-level player**: the alpha-beta search of `search.rs` with at least **10 times the boss node
  budget**. It plays two random opening moves (seeded, so the seeds differ), then it plays like
  someone who knows the PvE rules: it never repeats a position it has already seen (a draw is a
  loss), and it never plays a move that leaves one of its marbles to flip when the Chaplain tell
  shows it (the tell is read on hover, Decision #154). When no move is left under those two
  constraints it plays the plain search move. Against the Chaplain the search sees the boss hooks
  inside the tree (#207): each ply goes through the same flip rule as `Encounter::play`, the
  converted marks follow the moves, and the phase is read from the board. It still ignores the seed
  of the P3 void pushes and the ejections the hook credits (P3 is never reached). The other bosses
  are searched with the standard rules only.
- **Winnable**: a recorded winning game replays through the `Encounter` API (fixtures, section 4)
  **and** the pro-level player wins at least 7 of 10 seeds. The target after tuning is 7 to 9 of
  10, never 10 of 10.
- Phase numbers below are 1-based (P1 is the first phase).

## 2. Results

Before = bosses as on `main` (e25ec9a). The player budget is in nodes per move.

| Boss | Boss budget | Player budget | Wins /10 | Median plies | Highest phase | Deaths |
|---|---|---|---|---|---|---|
| The Echo | 400 | 4000 (10x) | **8** | 108 | P2 | draw 2 |
| The Hull | 3000 | 30000 (10x) | **7** | 93.5 | P2 | push 2, rim 1 |
| The Choir | 1500 | 15000 (10x) | **10** | 57.5 | P3 | none |
| The Chaplain | 2000 | 20000 (10x) | **0** | 148 | P1 | conversion 5, draw 5 |
| The Ballast Mind | 150000 | 150000 (1x only) | **0** | 100 | P1 | draw 10 |

Table 2 is the state on `main` before #207 (the Chaplain row changes in section 3). The reasons
are per boss, section 3.

For comparison, the same ladder with the plain search as the player (no repetition rule, no tell):

| Boss | Player budget | Wins /10 | Deaths |
|---|---|---|---|
| The Echo | 4x, 1x, 0.5x (PR #173) | 0, 1, 0 | 27 draws in 29 losses |
| The Echo | 10x | 6 | draw 4 |
| The Hull | 10x | 9 | push 1 |
| The Choir | 10x | 10 | none |
| The Chaplain | 10x | 0 | conversion 3, draw 7 |
| The Ballast Mind | 1x | 0 | draw 10, median 51 plies, P1 |

## 3. Per boss

### The Echo: winnable, no change

The draws were not the mirror. Replaying the drawn seed shows a 4-ply cycle: the player search
moves one marble back and forth, and the boss free move (400 nodes) moves one back and forth too,
until the third repetition. The mirror is already off by then, because the position stopped being
symmetric. A player who never repeats a position wins 8 of 10 (the two draws left are the
100-ply no-ejection cap). The fix is on the player side, not in the boss.

Tried on the boss with the plain-search player, none of them helped, so none is kept:
the boss falls one move behind after N plies without ejection (N = 30, 50, 70: 6 of 10 each),
the boss never mirrors into a repeated position (6 of 10), an aggressive free move with more
centre weight (3 to 4 of 10, worse). A lower free-move budget helped but moves with the player
budget in a chaotic way (budget 200: 9 of 10 at 10x, budget 300: 3 of 10 at 10x, 7 of 10 at 4000
nodes), so it is not a stable knob.

### The Hull: winnable, no change

7 of 10 with the pro-level player, 9 of 10 with the plain search. The rim cracks force contact,
so the game does not stall. Too easy for a human is out of scope (follow-up, section 6).

### The Choir: winnable, no change

10 of 10, P3 reached in 3 seeds. The win at 10 ejections is already on `main` (#182, #184).
Decision #131 has two comments: the owner decision (10 ejections, because a win at 8 ends the fight
at the very moment P3 starts, so P3 would never be played) and a later lead-agent comment that
says 8. The code, rules.md and game-design.md follow the owner decision, and so does this PR.
If the owners want 8, they change it in #131 first.

### The Chaplain: 0 of 10 before #207, 7 of 10 after the rule change (last subsection)

Plain Abalone against a 2000-node search is a stall: draws, not losses. On top of that the search
does not see flips, so the bot loses marbles to conversions even when it reads the tell on the
move it plays (the boss move that follows can create the contact). One knob at a time, 10x
(20000 nodes), 10 seeds:

| Knob | Wins /10 | Deaths |
|---|---|---|
| none | 0 | conversion 5, draw 5 |
| flip threshold 4 | 1 | draw 9 |
| flip-back threshold 2 | 0 | conversion 6, draw 4 |
| boss budget 300 | 0 | push 1, conversion 5, draw 4 |
| boss budget 60 | 0 | push 1, conversion 7, draw 2 |
| flip threshold 4 and budget 300 | 0 | draw 10 |
| boss search weights centre 20, flip 3 | 0 | conversion 5, draw 5 |
| boss search weights centre 20, flip 4 | 3 | push 1, draw 5, ply cap 1 |
| boss search weights centre 20 and ejected 150, flip 4 | 0 | push 1, draw 9 |

The budget row is the telling one: a 60-node boss, close to random, still wins by conversion or
draw. The limit is the player model, not the boss strength. No single knob, and none of the two
combinations tried, gets to 7 of 10, so nothing is changed: a handicap picked on these numbers
would make the boss weaker for humans without proving it winnable. These runs used slightly
different fallback rules of the player (the repetition and flip filters were relaxed one at a time
in the first runs, in one step in the final code), so read them as indicative.

What would settle it: a player search that sees the hooks (flip and crack) inside the tree, then
re-run this table. The most promising knob from the data is the aggression weight with the flip
threshold at 4 (3 of 10).

#### Hook-aware player (#207)

The player search now simulates the Chaplain flips (`chaplain_step` in `ladder.rs`, proved equal
to the encounter on a played game). Same ladder, 10x (20000 nodes), 10 seeds, `LADDER_X=10 cargo
run --release --example ladder -- chaplain`. Every row is the hook-aware player, one change at a
time on the boss:

| Boss change | Wins /10 | Median plies | Deaths |
|---|---|---|---|
| none, hook-blind player (section 2) | 0 | 148 | conversion 5, draw 5 |
| none, hook-aware player | 0 | 82 | push 3, conversion 5, draw 2 |
| flip threshold 4 | 0 | 142 | push 8, draw 2 |
| flip-back threshold 2 | 0 | 142 | push 1, conversion 2, draw 7 |
| boss budget 300 (player 3000) | 0 | 143 | push 1, draw 9 |
| boss search centre weight 20 | 0 | 125 | push 1, conversion 7, draw 2 |
| boss search centre weight 20 and flip threshold 4 | 1 | 191 | draw 9 |

Second round (owner decision on #207: weaken the Chaplain until it is beatable), same command with
the player fixed at 20000 nodes (`LADDER_NODES=20000`) while the boss budget moves. The knobs were
temporary env switches, not kept in the code. Output lines (`boss | player budget | wins | median
plies | max phase | deaths`):

| Boss change | Output line |
|---|---|
| none (re-run) | `chaplain \| 20000 \| 0/10 \| 82 \| 0 \| push 3, conversion 5, draw 2` |
| boss budget 100, centre weight 20 | `chaplain \| 20000 \| 0/10 \| 58 \| 0 \| push 1, conversion 8, draw 1` |
| at most 1 flip per boss turn | `chaplain \| 20000 \| 0/10 \| 86 \| 0 \| conversion 6, draw 4` |
| flip threshold 4, centre 20, boss budget 150 | `chaplain \| 20000 \| 1/10 \| 209 \| 1 \| push 1, draw 8` |
| same, player allowed one repetition | `chaplain \| 20000 \| 1/10 \| 196.5 \| 1 \| push 1, draw 8` |
| flip threshold 4, centre 20, boss budget 60 | `chaplain \| 20000 \| 1/10 \| 197.5 \| 1 \| draw 9` |

Reading: two regimes and nothing between them. With the flip threshold at 3 the boss corners the
player and converts it (5 to 8 conversion deaths) whatever its budget or weights. With the
threshold at 4 the boss stops converting but also stops engaging, so 8 or 9 games hit the 300 ply
cap as draws, and a draw is a loss. The best state is 1 of 10, far from 7. The alternative player
that may repeat a position once does not change it (1 of 10 as well), so "never repeat" is not what
blocks the win. "Flip only after contact" is already how the rule works (a flip needs 3 boss
neighbours), so there is no separate knob. Not measured in the 60 minute time box (a run costs 2 to
9 minutes): budget 600, centre 40, threshold 3 with one flip per turn and a low budget, a lower
ejection weight for the boss.

#### Rule change: a flip costs the boss (#207, owner decision)

No number got past 1 of 10, so the rule changed (rules.md 10.3, game-design.md 7.3). Variant B:
after a boss turn that flips marbles, the boss loses one marble per flip (removed, credited to the
player as an ejection, the same rule the chain phase already had). Variant A (a skipped boss turn)
and C (a two-turn tell) were not built: B reached the target. Each row is a run of
`LADDER_NODES=20000` (the 10x of the unchanged boss budget 2000, so the player is the same in every
row), `... -- chaplain`, hook-aware pro player, 10 seeds. Output lines:

| Variant of B | Output line |
|---|---|
| every flip costs, boss budget 2000 | `chaplain \| 20000 \| 10/10 \| 46 \| 0 \|` |
| every flip costs, threshold 3, centre 20, budget 150 | `chaplain \| 20000 \| 10/10 \| 37 \| 0 \|` |
| every flip costs, threshold 4, centre 20, budget 150 | `chaplain \| 20000 \| 10/10 \| 87 \| 1 \|` |
| cost paid but not credited as an ejection | `chaplain \| 20000 \| 0/10 \| 189.5 \| 2 \| conversion 1, draw 6, boss_stuck 3` |
| same, centre 20, budget 150 | `chaplain \| 20000 \| 0/10 \| 151 \| 2 \| draw 4, boss_stuck 6` |
| cost only when a turn flips 2 or more | `chaplain \| 20000 \| 0/10 \| 75 \| 0 \| push 3, conversion 6, draw 1` |
| same, centre 20, budget 150 | `chaplain \| 20000 \| 1/10 \| 152 \| 0 \| conversion 4, draw 5` |
| cost 1 turn in 2 | `chaplain \| 20000 \| 5/10 \| 84 \| 0 \| conversion 3, draw 2` |
| cost 1 turn in 2, centre 20, budget 150 | `chaplain \| 20000 \| 5/10 \| 51 \| 0 \| conversion 4, draw 1` |
| cost 3 turns in 4, centre 20, budget 150 | `chaplain \| 20000 \| 10/10 \| 41.5 \| 0 \|` |
| **cost 3 turns in 4, boss unchanged (kept)** | `chaplain \| 20000 \| 7/10 \| 57.5 \| 1 \| conversion 2, draw 1` |

Kept: the cost is rolled per boss turn from the encounter seed (`CHAPLAIN_FREE_FLIP_ODDS = 4`, so
1 turn in 4 is free), credited as an ejection, and certain from P3 on. The last row is also the
command of the section, `LADDER_X=10 cargo run --release --example ladder -- chaplain`, run on
the final code. A sure cost swings to 10 of 10 (the boss pays for contact it cannot see: its search
does not see its own hooks), a cost that is not credited or only on double flips stays at 0 or 1
of 10, and the 3 in 4 roll sits at 7 of 10. The boss budget, weights and thresholds are unchanged.
The tell still shows the flip one ply ahead; the cost is not in the tell. The player search does
not know the roll (it passes seed 0), so it plays as if the boss always or never pays: the pro
player is slightly blind to this rule, a human sees the outcome. One seed list of 10 is small:
7 of 10 is a point estimate, not a rate.

Recorded win: `tests/fixtures/chaplain.txt` (seed 0, 92 moves).

### The Ballast Mind: NOT measured at pro level, 0 of 10 at 1x

The ladder now plays it (`LadderBoss::Ballast`). Pro level is 10x the boss budget, 1.5 million
nodes per player move: about 24 s per move natively (the budget comment in `ballast.rs` measures
150000 nodes at 2.4 s), so one 300-ply game is about an hour and ten seeds do not fit the 45
minute time box of this task. It was measured at 1x (150000 nodes, a depth 5 mirror match): 0 of 10,
every game a draw, all by the 100-ply no-ejection cap, no ejection at all, so only P1 was seen.
The plain-search player does the same faster (draws by repetition around ply 51).

Nothing is changed, for two reasons. A run costs 25 minutes, so a knob cannot be tuned inside the
time box. And section 5 applies in full: the player wins at 6 ejections, which is exactly when P2
would start, so the Hull cracks, the flips and the Echo of this boss are never played. The boss as
shipped is plain Abalone at depth 5 on a pillar board. Measure it again after the phase decision
(section 6), at 10x, on a machine that can spare an hour. Candidate knobs from `game-design.md`
section 7.5: the boss budget (40000 nodes finishes depth 4) and the boss marbles (16).

## 4. Recorded wins

`crates/abalone-core/tests/fixtures/<boss>.txt`, replayed by
`crates/abalone-core/tests/boss_fixtures.rs` through `Fixture::replay` (the `Encounter` API, and
the `Choir` API for the Choir), asserting a player win. Format: boss id, seed, the budgets it was
recorded with, then one move per line (cells `q,r` joined by `;`, a space, the direction), both
sides in order. The replay does not search, so it is deterministic and fast.

| Boss | Seed | Player budget | Moves |
|---|---|---|---|
| echo | 0 | 4000 | 126 |
| hull | 0 | 30000 | 90 |
| choir | 0 | 15000 | 50 |
| chaplain | 0 | 20000 | 92 |

No fixture for the Ballast Mind: no winning game was found (section 3).

To record again after a rule change:
`LADDER_X=10 LADDER_FIXTURES=<dir> cargo run --release --example ladder -- echo hull choir`
(`LADDER_NODES` sets the budget in nodes, `LADDER_JSONL` writes every attempt).

## 5. Finding: phases that a win at 6 ejections never reaches

A player wins at 6 ejections, so the boss is left with 14 minus 6 = 8 marbles (16 minus 6 = 10 for
the Ballast Mind) unless conversions made it grow. The phase thresholds of section 7 of
`game-design.md` then read:

- The Echo P3 (5 left) and the Hull P3 (5 left): never played. The highest phase in the table is P2.
- The Chaplain P2 (8 left): starts at the moment of the sixth ejection, so it is never fought.
- The Ballast Mind P2 (10 left): same, and P3 (5 left) after it. The final exam would only ever be
  plain Abalone, without Hull cracks, Chaplain flips or Echo, unless conversions inflate the boss.
- The Choir was the same case and is fixed by #131 (win at 10).

This is out of scope here (rule 4 of CONTRIBUTING.md): it needs a decision per boss.

## 6. Follow-ups

- Decision: the unreachable phases of section 5 (win threshold per boss, or thresholds moved).
- The Chaplain wins 7 of 10 after the flip cost of #207 (section 3). The
  Hull cracks and the Ballast Mind hooks are not in the player tree yet.
- The Hull (7 of 10 at 10x, 9 with the plain search) and the Choir (10 of 10) may be too easy for
  a strong human: tuning them is out of scope of #170.
