---
id: boss-balance
type: architecture-design
status: draft
title: "Boss balance: can a strong player win? (#170)"
parent: game-design
---

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
| The Choir | 1500 | 15000 (10x) | **10** | 118 | P3 | none |
| The Chaplain | 2000 | 20000 (10x) | **20 of 20** (conversions move its health, #810, see section 3) | 32.5 | P2 | none |
| The Ballast Mind | 100 (#833; 3000 with #824, was 150000) | 1000 (10x) | **1 of 20** (reading ladder player #834, 0 of 20 at 1x; the player has 16 marbles since #838; below the target, no boss-only knob reaches it, see section 3) | 133 | P2 | rim ejection 14, draw 5 |
| The Stalker | 3000 | 30000 (10x) | **9** (fogged pro player #1120, see section 3) | 185 | P2 | draw 1 |

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

### The Echo rework (#859): bonus mirrors both ways, not winnable by the ladder, not tuned (tuned in #951, below)

New rules (game-design.md section 7.4): the mirror of each move is a free bonus move for the other
side, both ways, P2 at 3 ejections echoes one older never-echoed move, no P3; each bonus ply counts
for the 100-ply no-ejection cap and the repetitions. The boss search plays the bonus mirrors in its
tree (`echo_step`); the node budget stays 400. The ladder pro also searches with `echo_step`, and
reads the ghost: a move after which the bonus mirrors make a draw is not played.

| Player budget | Before wins /10 | After wins /10 | Median plies after | Highest phase after | Deaths after |
|---|---|---|---|---|---|
| 400 (1x) | 2 (median 165, push 1, draw 7) | 0 | 58 | P2 | draw 10 |
| 4000 (10x) | 8 (median 107, draw 2) | 0 | 51 | P2 | draw 10 |
| 4000 (10x), 40 seeds | | 2 of 40 | 51 | P2 | draw 38 |

Before is `main` at 68d7792 (the old Echo: the mirror of the player move as its reply, else its
search). Plies count the main moves. Every lost game after is a draw at the 100-ply no-ejection cap
(about 50 main moves, each followed by a bonus): every move a side makes is copied for the other
side, so the board stays near point-symmetric and neither side wins a marble. The pro at 10x wins 2 of
40 seeds. Far below the 7 to 9 of 10 target; nothing is tuned here (#859), the rule is the owner's.
The knobs left are the cap (bonus plies counted or not), the boss budget, or the opt-out.

Reply time through wasm (nodejs release build, 6 seeds of up to 80 plies, the player side plays its
auto-play search, boss replies only, ms): The Echo 61 average, 108 at the 95th percentile, 125 at most
(400 nodes; before the rework 42 / 93 / 111); measured in the same run, the Hull 244 / 368 / 772 and the
Pulsar 272 / 408 / 532.

### The Hull: winnable, no change

7 of 10 with the pro-level player, 9 of 10 with the plain search. The rim cracks force contact,
so the game does not stall. Too easy for a human is out of scope (follow-up, section 6).

### The Hull plays its cracks (#823): same win rate, not tuned

The boss search (`hull_move`) runs the crack timers on every player ply of its tree (the due cells
vanish with their marbles, each side credited with the other's losses), so it pushes player marbles
onto announced cracks and keeps its own off them. It does not guess where the next crack falls (the
seed). Node budget (3000) unchanged, no rule change, `engine_version` unchanged. The pro player is
the same as before (it does not read the cracks). Command: `LADDER_X=<1|10> LADDER_SEEDS=20 cargo
run --release --example ladder -- hull`, seeds 0 to 19, 300 plies at most.

| Player budget | Wins /20 before | Wins /20 now | Median plies before | Median plies now | Highest phase now | Deaths now |
|---|---|---|---|---|---|---|
| 3000 (1x) | 4 | **6** | 93 | 95 | P3 | push 12, rim_ejection 2 |
| 30000 (10x) | 14 | **12** | 82 | 99.5 | P3 | push 4, rim_ejection 4 |

Within the noise of 20 seeds: the pro player ignores the cracks and the cracks are few, so the
boss rarely gains from them. Nothing was tuned, the owner decides.

Reply time through wasm (release build in Node, 6 seeds of 80 plies, boss replies, a loaded
machine, ms): The Hull 157 average, 232 at the 95th percentile, 442 at most (3000 nodes, was 84 / 118 / 159
on an idle machine); measured in the same run, the Magnetizer 198 / 385 / 503 and the Pulsar
641 / 1259 / 2167 on that load.

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

Recorded win: `tests/fixtures/chaplain.txt` (seed 10040, 97 moves, see section 4).

**Rework #748:** the Chaplain rows of section 3 before "Reworked Chaplain" measure the old rules (threshold 3, a flip costs the boss a marble, three phases). The new Chaplain (threshold 4 for both sides, a martyr at 4 ejections, a wiped side loses, no cost per flip) is measured in the last subsection of section 3 (#753): the pro player wins 19 of 20 at 10x, far above the 7 to 9 of 10 target.

### Reworked Chaplain (#748), measured in #753: too easy

Command: `LADDER_X=10 LADDER_SEEDS=20 cargo run --release --example ladder -- chaplain` (and
`LADDER_X=1` for the boss budget), seeds 0 to 19, 300 plies at most, the hook-aware pro player of
section 1, no rule or knob changed.

| Player budget | Wins /20 | Median plies | Highest phase | Deaths |
|---|---|---|---|---|
| 2000 (1x) | 16 | 79 | P1 | draw 4 |
| 20000 (10x) | **19** | 55 | P1 | boss_stuck 1 |

Result: 95 % at 10x, **outside the 7 to 9 of 10 target** (too easy). Every win wipes the boss
(0 boss marbles left, the player holds 22 to 27 of the 28 marbles) in phase 1: P2 and the
martyr are never reached.
Nothing was tuned here, the owner decides (knobs of game-design.md section 7.3). The pro player
still simulates only phase 1 in its search (`chaplain_step` ignores P2 and the martyr); since the
games end in phase 1 it does not change these numbers, but a harder boss that reaches P2 would
need it first.

### The Chaplain's conversions move its health (#810): even easier, not tuned

The rule: +1 player credit per boss marble converted to the player, -1 per player marble converted
to the boss (never below 0), the boss's health is 6 minus the credit, P2 starts the first time the
credit reaches 4 and never goes back (game-design.md section 7.3). Same command and seeds as the
subsection above (`LADDER_X=10 LADDER_SEEDS=20 cargo run --release --example ladder -- chaplain`,
and `LADDER_X=1`), seeds 0 to 19, 300 plies at most, the hook-aware pro player. Nothing was tuned,
the owner decides.

| Player budget | Wins /20 before | Wins /20 now | Median plies before | Median plies now | Highest phase now | Deaths now |
|---|---|---|---|---|---|---|
| 2000 (1x) | 16 | **20** | 79 | 42 | P2 | none |
| 20000 (10x) | 19 | **20** | 55 | 32.5 | P2 | none |

The pro player still searches without the credit (`chaplain_step` moves the board, not the
ejection count), so it never plays for the health: the boss's own conversions of its marbles to the
player now count for it, and it reaches P2 and wins at 6 credit faster. Far above the 7 to 9 of 10
target.

### The Chaplain plays its conversion rule (#811): now too hard, not tuned

The boss search (`chaplain_move`) runs the conversion hook on every ply of its tree, both sides,
credits the health swing of each flip (+1 / -1, #810) and counts the marbles at 3 foes around them
(weight 20 centi-marbles, `CHAPLAIN_THREAT_WEIGHT`, a chance for a foe marble, a danger for its
own). Node budget (2000) and martyr unchanged, no rule change, `engine_version` unchanged. The pro
player is the same as before (it reads the hooks, not the health swing). Same command and seeds as
the subsections above (`LADDER_X=10 LADDER_SEEDS=20 cargo run --release --example ladder --
chaplain`, and `LADDER_X=1`), seeds 0 to 19, 300 plies at most.

| Player budget | Wins /20 before | Wins /20 now | Median plies before | Median plies now | Highest phase now | Deaths now |
|---|---|---|---|---|---|---|
| 2000 (1x) | 20 | **0** | 42 | 159 | P2 | draw 15, ply_cap 5 |
| 20000 (10x) | 20 | **10** | 32.5 | 216 | P2 | conversion 2, draw 2, ply_cap 6 |

The pro player no longer wipes the boss by conversion in a few dozen plies: the boss avoids the
conversions it can see and takes the ones it can. 10 of 20 at 10x is **below the 7 to 9 of 10
target** (too hard now, from 20 of 20 too easy), and 1x never wins. Nothing was tuned: the threat
weight and the budget are the knobs, the owner decides.

Reply time through wasm (release build in Node, 6 seeds of 80 plies, boss replies, an idle-ish
machine, ms): The Chaplain 196 average, 404 at the 95th percentile, 458 at most (2000 nodes); the
Hull 84 / 118 / 159 (3000 nodes), the Pulsar 140 / 222 / 455, the Magnetizer 102 / 142 / 183.

### The Ballast Mind: its AI plays the borrowed effects (#824), 0 of 20 at 1x and 10x

Before (main at 66f47f4): the reply was the plain `boss_search` at 150000 nodes (2.4 s native), 0 of
10 at 1x, every game a draw, no run at 10x. Now `ballast_move` (`search_hooked`) runs the Hull tick on
every player ply of its tree and, at its own ply, the effect due this turn (the crack, pulse,
polarity or conversion check the seed of that ply picks, the same code the encounter fires). The
deeper boss plies of the tree fire none: the tree does not know which turn they are. The budget
is the other bosses' 3000 nodes. The ladder player is unchanged (plain search, it does not see the
hooks), `LADDER_SEEDS=20`:

| Player budget | Wins /20 | Median plies | Highest phase | Deaths |
|---|---|---|---|---|
| 3000 (1x) | **0** | 96 | P2 | rim ejection 19, draw 1 |
| 30000 (10x) | **0** | 101 | P1 | rim ejection 19, draw 1 |

The games now end on the boss's side (the pulses and cracks eject player marbles that the ladder
player does not read), no more draws. Nothing is tuned further here: the budget, the effect period
and the player tree are the knobs, the owner decides. Reply time through wasm (release build in
Node, 6 seeds of 80 plies, load average 8, ms, average / 95th percentile / max): The Ballast Mind
128 / 219 / 408, the Chaplain 204 / 415 / 451, the Hull 89 / 121 / 200, the Pulsar 125 / 167 / 204,
the Magnetizer 101 / 142 / 178.

### The Ballast Mind after #824: the ladder player reads its effects (#834), tuned in #833

Target of #833: the pro player (10x, 20 seeds) wins 14 to 18 of 20, the 1x player fewer. Method:
`LADDER_X=10 LADDER_SEEDS=20 cargo run --release --example ladder -- ballast` (`LADDER_X=1` for
the 1x line), seeds 0 to 19, 300 plies at most. The player budget is the multiple of the boss
budget, so it moves with it. Output lines (`player budget | wins | median plies | max phase |
deaths`).

**Result: no boss-only knob reaches the target.** The best of them is adopted, `BALLAST_NODE_BUDGET`
3000 to 100, and the pro player wins 2 of 20 at 10x, 1 of 20 at 1x. No rule change, `engine_version`
unchanged.

#### Step 1: the plain-search ladder player (before #834)

| Variant | Output line |
|---|---|
| main (hooked search, nodes 3000), 1x | `3000 \| 0/20 \| 96 \| 2 \| rim_ejection 19, draw 1` |
| main, 10x | `30000 \| 0/20 \| 101 \| 1 \| rim_ejection 19, draw 1` |
| plain boss search (before #824), nodes 3000, 1x | `3000 \| 3/20 \| 96 \| 2 \| rim_ejection 17` |
| plain boss search, nodes 3000, 10x | `30000 \| 0/20 \| 96 \| 2 \| rim_ejection 15, draw 5` |
| nodes 1000, 10x | `10000 \| 0/20 \| 114 \| 2 \| rim_ejection 15, draw 5` |
| nodes 300, 10x | `3000 \| 0/20 \| 99 \| 2 \| rim_ejection 16, draw 4` |
| nodes 100, 10x | `1000 \| 0/20 \| 90 \| 2 \| rim_ejection 16, draw 4` |
| nodes 30, 10x | `300 \| 1/20 \| 90 \| 2 \| rim_ejection 15, draw 4` |
| weight `ejected` 0, 10x | `30000 \| 0/20 \| 101 \| 1 \| rim_ejection 19, draw 1` |
| no borrowed effect (`BALLAST_EVERY` 100000), 10x | `30000 \| 0/20 \| 100 \| 0 \| draw 20` |
| `BALLAST_EVERY` 6, 10x | `30000 \| 0/20 \| 127.5 \| 0 \| rim_ejection 6, draw 14` |
| `BALLAST_EVERY` 12, 10x | `30000 \| 0/20 \| 129.5 \| 0 \| rim_ejection 5, draw 14, ply_cap 1` |

Reading: #824 did not make the boss harder at 10x (the plain boss search was already 0 of 20),
it took 1x from 3 to 0 of 20. Nothing moved the result because the measuring player did not read
the hooks: it died to cracks and pulses it could not see.

#### Step 2: the ladder player reads the effects (#834)

`player_move` plays `search_hooked` with the Ballast step against the Ballast Mind (as it does for
the Chaplain, #811): the Hull tick after each of its plies, and the effect due on the boss reply
(the player reads it one turn ahead in the HUD, `ballast_search` in `ballast.rs`, shared with the
boss reply). Boss still at nodes 3000: 1x `3000 \| 2/20 \| 152.5 \| 2 \| rim_ejection 12, draw 6`,
10x `30000 \| 1/20 \| 150 \| 2 \| rim_ejection 13, draw 6` (reading only the Hull tick: 10x
0 of 20, median 134 plies).

#### Step 3: boss-only knobs against the reading player, 10x

| Knob | Output line (10x) |
|---|---|
| none: nodes 3000, `DEFAULT_WEIGHTS` | `30000 \| 1/20 \| 150 \| 2 \| rim_ejection 13, draw 6` |
| nodes 1000 | `10000 \| 0/20 \| 141 \| 2 \| rim_ejection 15, draw 5` |
| nodes 300 | `3000 \| 1/20 \| 132 \| 2 \| rim_ejection 12, draw 7` |
| **nodes 100 (kept)** | `1000 \| 2/20 \| 117 \| 2 \| rim_ejection 9, draw 9` |
| nodes 30 | `300 \| 2/20 \| 102 \| 2 \| push 1, rim_ejection 10, draw 7` |
| centre 0, cohesion 0 | `30000 \| 0/20 \| 212 \| 2 \| rim_ejection 2, draw 15, ply_cap 3` |
| centre -3, cohesion 0 | `30000 \| 2/20 \| 90 \| 2 \| rim_ejection 15, draw 3` |
| marbles 0, ejected 10 | `30000 \| 1/20 \| 125.5 \| 2 \| rim_ejection 15, draw 4` |
| marbles 30, ejected 15 | `30000 \| 1/20 \| 150 \| 2 \| rim_ejection 13, draw 6` |

At 1x with the reading player: nodes 300 `300 \| 1/20 \| 102 \| 2 \| rim_ejection 14, draw 5`, nodes 100
(kept) `100 \| 1/20 \| 90 \| 2 \| rim_ejection 15, draw 4`: fewer wins than at 10x, as wanted.

Reading: the result sits between 0 and 2 of 20 for every knob, so the differences are noise on 20
seeds, not a rate. A boss that barely searches (30 nodes, about depth 1) beats the 10x player as
often as the 3000 node one, so the boss strength is not what decides the games: the player loses
marbles to the pulses and cracks beyond the one effect it reads (its tree knows the tick and the
next effect only) and the rest are draws. Kept, because it is the best measured (tied with 30 nodes
and the centre -3 weight) and the simplest single constant: `BALLAST_NODE_BUDGET = 100`, which also
makes the boss reply about 30 times cheaper than the 3000 nodes of the other bosses. The target
needs a stronger or smarter ladder player (reading effects beyond the next one) or a change of the
effects themselves (`BALLAST_EVERY`, forces, a rule change, the owner's call), not a boss knob.

### The Ballast Mind: the player starts with 16 marbles (#838), not tuned

The player went from 14 to 16 marbles, as many as the boss (the back-row corners `(-5, 5)` and
`(0, 5)`, the mirror of the boss start), `engine_version` 10. Win thresholds and the boss unchanged,
no retune. Same method as above, `LADDER_X=1` and `LADDER_X=10`, `LADDER_SEEDS=20 cargo run --release
--example ladder -- ballast`, seeds 0 to 19, 300 plies at most:

| Player | Output line, 14 marbles (#833, #834) | Output line, 16 marbles (#838) |
|---|---|---|
| 1x | `100 \| 1/20 \| 90 \| 2 \| rim_ejection 15, draw 4` | `100 \| 0/20 \| 112 \| 2 \| rim_ejection 18, draw 2` |
| 10x | `1000 \| 2/20 \| 117 \| 2 \| rim_ejection 9, draw 9` | `1000 \| 1/20 \| 133 \| 2 \| rim_ejection 14, draw 5` |

Reading: two more marbles for the player did not raise the win rate (0 and 1 of 20, the 14 marble
figures were 1 and 2 of 20): the differences are noise on 20 seeds, as in the knob table above, and
the games still end on rim ejections by the borrowed effects the ladder player reads only one turn
ahead. The target of #833 (14 to 18 of 20 at 10x) still needs a stronger or smarter ladder player or a
change of the effects, the owner's call.

#### Earlier: NOT measured at pro level, 0 of 10 at 1x

#### Attempt to measure it cheaply (#208): no result, the machine was too loaded

New option `LADDER_SEEDS=<n>` plays n seeds per cell instead of 10 (one thread per seed, so it
also caps the cores). Method: `nice -n 19`, at most 2 threads, a kill at 25 minutes (12 for the
calibration run), the Ballast Mind only. A cell prints its line only when all its seeds end, so a
killed run leaves no partial line. The machine was shared with other agents (load average 55 to
77 on 10 cores), and a nice 19 process gets almost nothing of it.

| multiplier | seeds | wins | median plies | max phase | deaths | time per game |
|---|---|---|---|---|---|---|
| 3x (450000 nodes) | 2 | not measured | - | - | - | over 25 min, killed, no line |
| 1x (150000 nodes, calibration) | 1 | not measured | - | - | - | over 12 min, killed, no line (2.4 s per move unloaded, so about 8 min expected) |

Commands: `LADDER_X=3 LADDER_SEEDS=2 nice -n 19 target/release/examples/ladder ballast` and
`LADDER_X=1 LADDER_SEEDS=1 nice -n 19 target/release/examples/ladder ballast`.

Estimate to plan the next run, not a measurement: at 1x every game is a draw at the 100-ply cap
(50 player moves), so a 10x game is about 50 moves x 24 s = 20 minutes plus the boss moves,
not an hour (the hour assumed the 300-ply cap). Two seeds at 10x then take about 25 minutes on
2 free cores. Next step: run `LADDER_X=10 LADDER_SEEDS=2` on an idle machine, then 3x and 5x for the
trend. The boss is not changed here (rule 17); if it is unbeatable at 10x, tuning is a separate task.

Earlier measurement, 1x:

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

### The Alien: the bot ladder cannot calibrate it, humans judge it (#646, #667)

The ladder now plays it (`LadderBoss::Alien`, through `alien_move`, so the boss keeps off its own
eggs). `cargo run --release --example alien_sim` plays the ladder player against it, 50 seeds,
then replays each game through the encounter to count the eggs crushed (by either side) and
hatched and to follow the Alien's marbles. `ALIEN_X` sets the player budget in boss budgets
(default 10, the pro level), `ALIEN_SEEDS` the seed count (default 50). The player search does not
see the eggs (the hooks are not in its tree, like the Hull cracks), so every crush is a side effect
of its plain Abalone. Boss budget 3000 nodes, rules as on `main` (44e7108):

| Player budget | Wins /50 | Median plies | Median eggs crushed | Median hatched | Median Alien peak | Fights where the count only goes up |
|---|---|---|---|---|---|---|
| 30000 (10x) | **50** | 75 | 2 | 17 | 20.5 | 0 |
| 3000 (1x) | **50** | 92 | 2 | 21 | 25 | 0 |

The Alien's marbles over time (median of the fights still on; 8 at ply 0):

| Player budget | ply 20 | ply 40 | ply 60 | ply 80 | ply 100 |
|---|---|---|---|---|---|
| 30000 (10x) | 11 | 14 | 18 (46 on) | 23 (15 on) | 29 (2 on) |
| 3000 (1x) | 11 | 15 | 19 (49 on) | 23 (39 on) | 27 (16 on) |

The Calibrate rule of `game-design.md` section 7.7 holds: the median is 2 eggs crushed at both
budgets, and every fight has its count drop (each of the 6 ejections). But the player wins every
fight at 10x and at 1x, so the Alien is far outside the 7 to 9 of 10 of the other bosses
(section 1). #667 tried one knob at a time (a scratch build, nothing kept), seeds 0 to n-1:

| Knob changed | Player budget | Wins |
|---|---|---|
| start 11 marbles (its back two rows) | 10x | 20/20 |
| start 12 (and the centre of its third row) | 10x | 20/20 |
| start 14 (the standard layout) | 10x | 20/20 |
| start 11, an egg every boss turn and cap 6 (three knobs, a probe) | 10x | 20/20 |
| start 11 | 1x | 46/50 |
| start 12 | 1x | 48/50 |
| an egg every boss turn | 1x | 20/20 |
| egg cap 5 | 1x | 20/20 |
| hatch after 3 turns in every phase | 1x | 20/20 |
| boss budget 10000 | 1x | 20/20 |

Only the start marbles move anything, and only at 1x: the 6 losses are push deaths in long fights
where the brood reached 30 to 39 marbles. A faster brood does not help the boss, because a hatch
lands on a random cell and is one more target (the three-knob probe ends sooner, median 53 plies).
The 10x player beats this boss search even on the full 14-marble layout, so no knob of section 7.7
brings it inside. Owner decision on #667: the Alien stays as it is, the bot ladder cannot calibrate
it, and humans judge its difficulty.

### The Alien after #826: its search plays the eggs, not tuned

The root filter `spares_eggs` is replaced by an `alien_step` on every ply of the tree (crush, count
down, hatch; the lay is a seeded pick, left out) and an egg weight of 50 in the evaluation
(`ALIEN_EGG_WEIGHT`, TUNE). Node budget 3000, no rule change. Ladder player unchanged,
`ALIEN_X=1 ALIEN_SEEDS=20 cargo run --release --example alien_sim`, seeds 0 to 19:

| | Wins /20 | Median plies | Median eggs crushed | Median hatched | Median Alien peak |
|---|---|---|---|---|---|
| Before (main d5b9cab) | 20 | 86 | 2 | 20 | 22.5 |
| After | 20 | 93 | 2 | 21.5 | 23.5 |

The bot still loses every fight to the pro-budget ladder player (as in #667); the fights last a
little longer. No further tuning.

### The Overseer: its AI plays the neurotoxin clock and its phases (#828), not tuned

Before (the ladder row only, 402b79f): the boss search burned on every ply but kept the phase of
the root and ignored the 40-turn clock. After: the phase is recomputed in the tree from the
ejections credited so far (`search_phased`), and a leaf at the player's last turn scores as a boss
win. The node budget stays 3000 (the Hull's), no rule changes, `engine_version` unchanged.

Ladder (`LadderBoss::Overseer`, 10 seeds, the plain-search player: it does not see the
incinerators or the clock, so the ladder cannot calibrate this boss, as for the Alien):

| Player budget | Before wins /10 | After wins /10 | Median plies | Deaths after |
|---|---|---|---|---|
| 3000 (1x) | 0 | 0 | 79 | push 7, rim ejection 3 |
| 30000 (10x) | 1 | 1 | 79 | push 6, rim ejection 2, draw 1 |

79 plies is the 40th player turn: the neurotoxin ends nearly every fight, before and after. The
clock only changes a reply in the last turns, and the fight is lost to it anyway for this player.
Nothing was tuned. `cargo run --release --example overseer_sim` plays the player that sees the
incinerators.

Reply time through wasm (release build in Node, 6 seeds of 80 plies, boss replies, a loaded
machine, ms): The Overseer 315 average, 679 at the 95th percentile, 7382 at most (3000 nodes);
measured in the same run, the Hull 746 / 2026 / 41282 and the Pulsar 986 / 4812 / 24050.

### The Choir plays its army cycle in the whole tree (#825): the ladder drops, not tuned

The boss search (`boss_move`) used to filter only the root move to the army in turn; deeper plies
let the boss move any army. Now every boss ply of the tree is limited to the army whose turn it is
at that ply (`search_turns`): Alto, Tenor, Bass, the armies removed at P2 and P3 skipped, the last
army's two moves of P3 two boss plies, the removal of the weakest army and the army marks following
every ply (a tie goes to the first army in the tree: it does not know the fight seed). The army in
turn at the root still gives the weights. Node budget (1500) unchanged, no rule change,
`engine_version` unchanged. Command: `LADDER_X=<1|10> LADDER_SEEDS=20 cargo run --release
--example ladder -- choir`, seeds 0 to 19, 300 plies at most.

| Player budget | Wins /20 before | Wins /20 now | Median plies before | Median plies now | Highest phase now | Deaths now |
|---|---|---|---|---|---|---|
| 1500 (1x) | 0 | **2** | 198 | 277 | P2 | push 7, draw 11 |
| 15000 (10x) | 20 | **8** | 121 | 150.5 | P2 | push 6, draw 6 |

The pro player (10x) wins 8 of 20 instead of 20 of 20: the boss now sees that only one army answers
each turn, so it no longer plans with moves it cannot play. Nothing was tuned, the owner decides.

Reply time through wasm (nodejs release build, 6 seeds of 80 plies, boss replies, ms, average / 95th
percentile / max): The Choir 53 / 74 / 104 (before 62 / 92 / 163); measured in the same run, the Hull
117 / 158 / 197 and the Pulsar 127 / 170 / 250. The node budget is fixed, so the nodes per reply stay
within 1500.

### The Echo tuned (#951): 100 nodes, winnable again at pro level

**Cause.** Replaying the 10 ladder games of #949 (1x): every loss is a draw at the 100-ply
no-ejection cap, none by repetition, and no position is ever seen a third time. In 7 of 10 games the
board is point-symmetric after 49 of the 51 main moves: each move's mirror is played for the other
side, so every move of both searches scores 0, and both sides shuffle their back marbles until the
cap (51 main moves, each with its bonus). In the other games the symmetry breaks, but the 400-node
boss reads two plies and still holds them to the cap. Measured one at a time (player 400 nodes, 10
seeds): seeing a bonus win at once in the tree (`search.rs`) gives the same 10 games, 0 of 10; boss
budget 1600: 0; 400: 0; 200: 7; 100: 8.

**Change.** `ECHO_NODE_BUDGET` 400 to 100 (one ply). Two engine bugs found on the way are fixed,
each with its test: the search sees a win a step gives the side to move at its own node, not one
ply later; `Game::replace_board` runs the repetition check again. Both reach every hooked boss.
Neither moves the Echo's ladder, nor two hooked bosses re-measured at 10x on `main` 77453ae
before and after (seeds 0 to 9): the Ballast Mind 1 of 10 both (median 136, rim ejection 6, draw
3), the Hull 5 of 10 both (median 85.5, push 3, rim ejection 2). The other hooked bosses are not
re-measured.
No rule of #859 changes; nothing depends on the player's bonus being forced (#958 will make it an
offer, measure again then). `engine_version` 12 (boss replies change).

| Player budget | Before wins /10 (400-node boss) | After wins /10 (100-node boss) | After /20 | Median plies after | Deaths after (10 seeds) |
|---|---|---|---|---|---|
| 100 (1x of the new budget) | | 1 | | 152.5 | push 5, draw 4 |
| 400 (1x of the old budget, the #949 player) | 0 | **8** | 10 | 113 | draw 1, ply cap 1 |
| 1000 (10x, pro level) | | **7** | 9 | 104 | draw 3 |
| 4000 (10x of the old budget) | 0 | 7 | 10 | 102 | draw 3 |

Command: `LADDER_X=<1|10> cargo run --release --example ladder -- echo` (`LADDER_NODES=<400|4000>`
for the old budgets, `LADDER_SEEDS=20` for 20 seeds), seeds 0 to 9 (0 to 19), 300 plies at most.
The pro level wins 7 of 10, the target; on 20 seeds it is 9 of 20, so it sits at the low edge. At
equal budgets (1x) the player wins 1 of 10: a one-ply player against a one-ply boss.

What is left: in the lost games the symmetry breaks and the player leads (up to 5 to 2), but
cannot finish before the cap. Tried on the boss and not kept (player 400 nodes, 20 seeds): a boss
that only steps toward the centre while the board is symmetric breaks the lock (10 to 13 of 20 at
50 to 200 nodes, 0 of 20 at 400), a boss that likes contact with the player's marbles (9 to 13 of
20 at 50 to 200 nodes, 0 to 4 of 20 at 400). Neither beats the budget alone by more than one seed.

Reply time (native release build, 6 seeds of up to 80 plies, the ladder player at 1000 nodes,
boss replies only, 208 replies, ms): 100 nodes 2.9 average, 4.7 at the 95th percentile, 13.9 at
most; 400 nodes on the same positions 71.0 / 137.8 / 162.6.

### The Dual Room rework (#955): side-4 rooms, a void and a bridge, not tuned

#955 joined `LadderBoss::Dual` to the ladder (its player search reads the returns through the
boss's own hook, `dual_step`) and reworked the boss (game-design.md section 7.15): two radius 3
rooms split by a void that ejects, 8 player and 5 boss marbles per room, a bridge at the 5th
ejection. Budget unchanged (3000 nodes), no knob tuned. Before: the ladder added on #944's board
(two radius 4 rooms, a wall, 7 + 5 marbles per room). 10 seeds, 300 plies at most.

| Player budget | Before wins /10 | Before P3 /10 | After wins /10 | After P3 /10 | After median plies | Deaths after |
|---|---|---|---|---|---|---|
| 12000 (4x) | 4 | 5 | 10 | 10 | 59 | none |
| 3000 (1x) | 0 (10 draws) | 0 | 8 | 9 | 107.5 | push 1, draw 1 |
| 1500 (0.5x) | 0 (10 draws) | 0 | 8 | 9 | 105.5 | push 1, draw 1 |

Before, the rooms were too wide to reach the boss: most fights drew by repetition. After, the
boss starts near the void and the player pushes it in: P3 is reached in 28 of 30 fights (the
section 7.15 calibration rule holds), but the boss is too easy: 10 of 10 at 4x and 8 of 10 even at
0.5x, **outside the 7 to 9 of 10 target** (section 1). Not tuned here; the owner's knobs are the
start layout and the phase ejections, follow-up #982.

Re-run on main after #951 (its search sees a bonus win at its own node, `dual_step` included):
the same table, row for row.

Reply time (release build, native, 6 seeds of 80 plies, boss replies, ms): before 226 average,
314 at the 95th percentile, 339 at most; after 228 / 312 / 383.

### The Echo's offered bonus (#958): the player's free move is an option

**Change.** The player's bonus is offered, not played (game-design.md section 7.4): taken by
playing it, declined by any other move. The Echo's own bonus stays automatic. The boss search is
unchanged (its tree assumes the player takes every free move). The ladder pro takes a free move
only when it ejects a boss marble and is safe, else it searches its own move, which declines the
offer. `engine_version` 14.

**Which pro.** Three policies measured at 10x (1000 nodes), seeds 0 to 9 (0 to 19), 300 plies at
most: taking every safe free move 6 of 10 (13 of 20, median 160.5 plies, draws 4): a quiet free
move gives the Echo its mirrored board back, the lock of #951; never taking one 7 of 10 (16 of
20, median 85); taking only the ejecting ones 7 of 10 (16 of 20, median 85), kept. Re-measured
after the pro checks a free move's repetition with itself still to move and never plays a quiet
free move as its own (review of #996): the same numbers, row for row.

| Player budget | Before wins /10 (#951, forced bonus) | After wins /10 (offered bonus) | After /20 | Median plies after | Deaths after (10 seeds) |
|---|---|---|---|---|---|
| 100 (1x) | 1 | 6 | | 107 | push 1, draw 3 |
| 400 (the #949 player) | 8 | 7 | | 87 | draw 3 |
| 1000 (10x, pro level) | **7** | **7** | 16 | 85 | draw 3 |

Command: `LADDER_X=<1|10> cargo run --release --example ladder -- echo` (`LADDER_NODES=400`,
`LADDER_SEEDS=20`). The pro level wins 7 of 10, inside the 7 to 9 target, and 16 of 20 (9 of 20
before). The equal-budget player (1x) wins 6 of 10 instead of 1: declining the free move breaks
the symmetric lock. The fixture is recorded again (section 4).

### The Dual Room: the boss search drops the pull to the centre, 8 of 10 at 10x (#982)

Cause: the search's `centre` weight scores the distance to `(0, 0)`, the middle of the board. On
the Dual Room's board that cell is the middle of the void, so the boss's search rewards marbles on
the void's edge, the cells where one push ejects them. The board position decided, not the search
(the rework section of #955 above: 8 of 10 even at 0.5x). Fix: the boss searches with `DUAL_WEIGHTS`, the plain
weights with `centre` 0 (`dual.rs`). No rule changed, the start layout and the budget (3000) too;
`engine_version` 15, the boss plays other replies. The ladder player keeps the plain weights.
10 seeds, 300 plies at most.

| Player budget | Before wins /10 | Before P3 /10 | After wins /10 | After P3 /10 | After median plies | Deaths after |
|---|---|---|---|---|---|---|
| 30000 (10x) | 10 (median 54) | 10 | **8** | 10 | 59 | draw 2 |
| 12000 (4x) | 10 | 10 | 7 | 10 | 60 | push 1, draw 2 |
| 3000 (1x) | 8 | 9 | 2 | 6 | 189 | push 3, draw 5 |
| 1500 (0.5x) | 8 | 9 | 2 | 6 | 167.5 | push 3, draw 5 |

Result: 8 of 10 at 10x, **inside the 7 to 9 of 10 target**, and the wins now fall with the
player's budget. Tried first, the knob of #982: the boss's 5 marbles one row further from the
void (`r = 2..3`), plain weights: 10 of 10 at 10x (median 53), no change. Screened at 4x: `centre` 0
7 of 10; `centre` 3 and `cohesion` 10, 10 of 10; `centre` 0 and `cohesion` 10, 7 of 10, the same
one row back 9 of 10. So the pull to the void decides, the layout and the cohesion do not. The 4x
and 1x columns before are the rework section of #955 above.

### The Swarm (#795): 2 ejections win for the boss, arrivals 1, 1, 2, gate met

#795 joined `LadderBoss::Swarm` to the ladder (game-design.md section 7.14). Its player search
lands the announced wave on every player ply of its tree and sees the evac after the 30th boss
reply as a win (`Swarm::player_search`); the boss search lands the next wave the same way, with its
own weights (ejections 150, centre 20) and the Choir's budget, 1500 nodes. Gate proposed in #795:
the pro (10x) wins 7 to 9 of 10, and a scripted turtle (it never pushes and never moves a marble
away from the centre, `turtle_move`) loses at least 8 of 10. 10 seeds, 30 turns.

**Before** (the boss wins only when every player marble is gone, arrivals 1, 2, 3): the gate is
not met, both halves. A compact group on its own side is out of reach of a swarm that lands on the
far rim, gets one move a reply and must eject all 11. Every knob of section 7.14 tried then (boss
weights, budget 6000, 40 turns, arrivals 2, 2, 3 / 2, 3, 4 / 3, 4, 5, start 8 or 6 marbles, and
combinations; temporary code, not kept) left the turtle 10 of 10, with 1 to 11 marbles left.

**Decided** (the lead, 2026-10-30, #795): the boss wins once it has ejected N of the player's
marbles, N a calibration knob (`SWARM_EJECTIONS`) tuned with the arrivals (`SWARM_ARRIVALS`) only.
Tried (temporary env override, not kept), 10 seeds each:

| Arrivals P1, P2, P3 | N | Turtle wins /10 | Pro 10x wins /10 | Pro marbles left when won |
|---|---|---|---|---|
| 1, 2, 3 | all (before) | 10 | 10 | |
| 1, 2, 3 | 6 | 10 | | |
| 1, 2, 3 | 4 | 9 | | |
| 1, 2, 3 | 3 | 6 | 6 | 8 to 10 |
| 1, 2, 3 | 2 | 2 | 6 | 9 to 10 |
| **1, 1, 2** | **2** | **0** | **9** | 10 to 11 |
| 1, 1, 2 | 3 | 4 | 10 | 9 to 11 |
| 1, 1, 2 | 4 | 8 | 10 | 8 to 11 |
| 1, 2, 2 | 2 | 2 | 6 | 10 |
| 1, 2, 2 | 3 | 6 | 6 | 9 to 10 |
| 1, 2, 2 | 4 | 9 | 7 | 8 to 10 |
| 1, 1, 1 | 2 | 1 | 10 | 10 to 11 |
| 1, 1, 1 | 3 | 5 | 10 | 9 to 11 |
| 1, 1, 1 | 4 | 8 | 10 | 8 to 11 |

The grid stopped once a row met both halves (arrivals 2, 2, 3 and 2, 3, 4 not run). **Adopted:
N = 2, arrivals 1, 1, 2** (turns 1 to 24 one marble, turns 25 to 30 two). After, the constants in
the code:

| Player | Wins /10 | Median plies | Player marbles left | Deaths |
|---|---|---|---|---|
| Ladder pro, 15000 nodes (10x) | **9** (gate 7 to 9) | 60 | 10 to 11 when won (median 10), 9 in the loss | push 1 |
| Ladder player, 1500 nodes (1x) | 10 | 60 | 10 to 11 | none |
| Scripted turtle | **0** (gate: at most 2) | lost on turns 14 to 28 | 9 | 2 ejections, all 10 |

**Gate met**, both halves. The equal-budget player (1x) wins 10 of 10 too: it reads the waves as
well, and the gate is set on the pro and the turtle only.

Command: `LADDER_X=<1|10> cargo run --release --example ladder -- swarm` and
`cargo run --release --example swarm_sim` (the turtle; it exits 1 while the turtle wins more than
2 of 10).

Reply time (release build, native, the turtle's 10 fights, 237 boss replies, the 10 seeds on all
cores, ms): 82 average, 135 at the 95th percentile, 182 at most (1500 nodes). Before the rule, on
another run: 232 / 446 / 600. The Dual Room measured 228 / 312 / 383 at 3000 nodes.

## 4. Recorded wins

`crates/abalone-core/tests/fixtures/<boss>.txt`, replayed by
`crates/abalone-core/tests/boss_fixtures.rs` through `Fixture::replay` (the `Encounter` API, and
the `Choir` API for the Choir), asserting a player win. Format: boss id, seed, the budgets it was
recorded with, then one move per line (cells `q,r` joined by `;`, a space, the direction), both
sides in order. The replay does not search, so it is deterministic and fast.

| Boss | Seed | Player budget | Moves |
|---|---|---|---|
| echo | 0 (10x, the first won seed against the 100-node boss, recorded again for #958) | 1000 | 87 |
| hull | 0 | 30000 | 89 |
| choir | 0 | 15000 | 93 |
| chaplain | 10040 | 0 (a player taking the move with the most ejections or conversions, a random boss: it reaches P2 and the martyr, which the wasm and e2e tests read; recorded again for #810) | 97 |
| chaplain-ladder | 0 | 20000 (10x, the ladder pro player, #753, recorded again for #810) | 44 |
| dual-ladder | 0 | 30000 (10x, the ladder pro player, #982; `dual.txt` stays the bridge game the wasm, client and e2e tests read) | 51 |
| swarm | 0 | 15000 (10x, the ladder pro player, #795, recorded again for the 2-ejection win) | 60 |

No fixture for the Ballast Mind: no winning game was found (section 3).

To record again after a rule change:
`LADDER_X=10 LADDER_FIXTURES=<dir> cargo run --release --example ladder -- echo hull choir`
(`dual-ladder.txt`: `LADDER_SEEDS=1 LADDER_X=10 LADDER_FIXTURES=<dir> ... -- dual`, then renamed)
(`LADDER_NODES` sets the budget in nodes, `LADDER_JSONL` writes every attempt).

## 5. Finding: phases that a win at 6 ejections never reaches

A player wins at 6 ejections, so the boss is left with 14 minus 6 = 8 marbles (16 minus 6 = 10 for
the Ballast Mind) unless conversions made it grow. The phase thresholds of section 7 of
`game-design.md` then read:

- The Hull P3 (5 left): never played. The highest phase in the table is P2. The Echo has no P3 since #859.
- The Chaplain (#748) has P2 at the 4th ejection, but the pro player wipes the boss by conversion before it (section 3).
- The Choir was reworked in #747 (standard board, 6 ejections, armies removed at 3 and 5): re-measured at 10x, 10 of 10 won, median 118 plies, P3 reached. The text above about Decision #131 (10 ejections) is history.
- The Ballast Mind is fixed by Decision #482 (win at 12 ejections, 4 boss marbles left); since #749 its
  phases come from the ejections (3 and 5), so P2 and P3 are reached and fought.

## 6. Follow-ups

- Decision: unreachable phases for Echo and Hull (win threshold per boss, or thresholds moved).
- The Chaplain wins 19 of 20 at 10x after the rework (section 3, #753): too easy, an owner decision. The
  Hull cracks and the Ballast Mind hooks are not in the player tree yet.
- The Hull (7 of 10 at 10x, 9 with the plain search) and the Choir (10 of 10) may be too easy for
  a strong human: tuning them is out of scope of #170.

### The Chaplain after its AI plays the conversion rule (#811), tuned in #821

#811 made the boss search play the conversion rule (threat weight 20, budget 2000). Measured by
#811: 0 of 20 at 1x, 10 of 20 at 10x, many draws and ply caps, below the owner target of 14 to 18
of 20 at 10x. One knob at a time, `LADDER_X=10 LADDER_SEEDS=20 cargo run --release --example ladder
-- chaplain`, seeds 0 to 19, 300 plies at most, hook-aware pro player (the player budget is 10x the
boss budget, so it moves with the boss budget). Output lines (`player budget | wins | median plies
| max phase | deaths`):

| Knob | Output line (10x) |
|---|---|
| none: threat 20, nodes 2000 (#811) | `20000 \| 10/20 \| n/a \| n/a \| many draws and ply caps` |
| threat 10 | `20000 \| 11/20 \| 243.5 \| 1 \| draw 2, ply_cap 7` |
| threat 5 | `20000 \| 4/20 \| 300 \| 1 \| ply_cap 16` |
| nodes 1000 | `10000 \| 12/20 \| 156 \| 1 \| push 2, draw 3, ply_cap 3` |
| nodes 500 | `5000 \| 7/20 \| 235.5 \| 1 \| push 1, conversion 1, draw 7, ply_cap 4` |
| **nodes 300 (kept)** | `3000 \| 18/20 \| 104 \| 1 \| ply_cap 2` |

Reading: a lower threat weight makes the boss passive (ply caps 7 then 16), so it is not the knob.
The budget is not monotonic on 20 seeds (7 of 20 at 500, 12 at 1000), so 18 of 20 at 300 is a
point estimate, not a rate. Kept: `CHAPLAIN_NODE_BUDGET = 300`, threat weight unchanged at 20.
At 1x (the player has the boss's own 300 nodes) the same command with `LADDER_X=1` gives
`300 \| 6/20 \| 87.5 \| 1 \| conversion 11, draw 3`, fewer than at 10x as wanted. The boss replies in
a seventh of the time it did (300 nodes against 2000), within the other bosses'. No rule change,
`engine_version` unchanged.

### The Rail Yard: its AI plays the train countdown (#827), not tuned

The ladder now plays it (`LadderBoss::RailYard`). `railyard_move` no longer avoids every announced
line at the root: each player ply of the search tree counts the trains down and a pass ejects its
line with credits, so the boss leaves a line only when the train is about to pass. Ladder, 10 seeds,
player at 1x (3000 nodes); the 10x cell did not finish in 550 s on one machine, so it is not measured.

| | Wins /10 | Median plies | Deaths |
|---|---|---|---|
| Before (root filter) | 0 | 76.5 | rim_ejection 10 |
| After (train in the tree) | 2 | 66 | rim_ejection 8 |

No tuning: no constant changed.

### The Stalker (#1120): the fogged pro player, on target, not tuned

`LadderBoss::Stalker` plays `stalker_start(seed)` (boss budget 3000, phases at 3 and 5 ejections, sight 3/2/1). The
boss replies with `Encounter::boss_search` (plain search, it sees everything). The pro player is the one of section 1
under the same fog: its random opening moves come from the offered moves (`seen_moves`), its search runs on the seen
board (hidden boss marbles read as empty cells, ejection counts kept), and when the engine refuses a move for a hidden
blocker the blockers are revealed and it searches again on the board as it now sees it (a refusal costs no ply). It
keeps the repetition check of the other rows. Command: `LADDER_X=10 cargo run --release -p abalone-core --example
ladder stalker`, 10 seeds, run alone on one machine (8 min 45 s wall).

| Player budget | Wins /10 | Median plies | Highest phase | Deaths |
|---|---|---|---|---|
| 30000 (10x) | **9** | 185 | P2 | draw 1 |

Result: 9 of 10 at 10x, inside the 7 to 9 target, so no knob changed (budget 3000, sight and phase ejections stay).
Not measured: the 1x and 0.5x cells, more seeds, the plain (unfogged) player for comparison. The ladder `replay` of a
stored Stalker game does not replay a refused move (the refusals are not stored), so no fixture is written for it.

### The Chaplain's search follows its phase in the tree (#1112), not tuned

Until #1112 `chaplain_move` kept the phase of the root for the whole tree. Now `chaplain_step` gets the
ejections credited before each ply (`search_signed` passes them, as `search_phased` does for the other hooked
bosses) and takes the highest of the root phase and the phase those credits reach (`tree_phase`, P2 at 4). The
phase only matters from P2, when the boss turn announces and explodes the martyr, so a tree that crosses 4 sees the
blast. A heal inside the tree does not take the phase back (the root phase latches, as in `Encounter`). The ladder
pro player is unchanged (it reads the hooks at phase 0, not the health swing). Not changed: rules, knobs,
`engine_version`.

Where the phase changes the best move: unit test `the_phase_reached_in_the_tree_changes_the_best_move`. It is a built
position (3 ejections, martyr already announced, White to move) at a raised budget of 2000 nodes. At the shipped 300
nodes the tree is too shallow to reach the blast (4 plies): 0 of about 3000 random positions with a martyr and 3
ejections gave a different move there (release build, same 3000 seeds, not a ladder). seeds 96, 148 and 268
differed at 2000 nodes (the test uses seed 96; the run was stopped after three, the rate is not measured).

Ladder row, `LADDER_X=10 LADDER_SEEDS=20 cargo run --release --example ladder -- chaplain` and `LADDER_X=1`, seeds 0
to 19, 300 plies at most, run alone, before (`main`, 1d2b364) and after:

| Player budget | Wins /20 before | Wins /20 after | Median plies before / after | Highest phase | Deaths after |
|---|---|---|---|---|---|
| 300 (1x) | 5 | **5** | 94 / 94 | P2 | conversion 9, draw 6 |
| 3000 (10x) | 17 | **17** | 103 / 103 | P2 | draw 1, ply_cap 2 |

Reading: no change on the ladder, as the shallow tree predicts, so no knob moved. The earlier rows of this section
(18 of 20 and 6 of 20 in #821) were taken on older code; 17 and 5 are the numbers of `main` today. Not done: a
ladder at a higher boss budget, more than 20 seeds.
