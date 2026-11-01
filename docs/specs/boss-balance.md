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
| The Ballast Mind | 100 (#833; 3000 with #824, was 150000) | 1000 (10x) | **15 of 20** (#1209: an effect every 2 boss turns and the boss wins at 12 too, 7 of 20 at 1x; was 3 of 20 and 1 of 20 after #1197, see section 3) | 147.5 | P2 | rim ejection 3, draw 2 |
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

### The Ballast Mind: the phase follows the ejections inside the tree (#1115), no change on the ladder

Audit #930 row 5: the effects borrowed from the Hull, Pulsar, Magnetizer and Chaplain were read
(`hook` runs their own code, the Chaplain conversion is a loss credit, the Magnetizer polarity is
carried, each with a test), but the effect due this turn took the phase of the root. A move that
ejects a third (fifth) marble reaches P2 (P3) before the effect answers it, so the pulse is force 3
(infinite) and not 2. `ballast_search` now uses `search_phased` and takes the highest of the root
phase and the one the player's credits reach (`tree_phase`, P2 at 3, P3 at 5). No rule, knob or
`engine_version` change. Only the ply that fires the effect looks at it: the boss reply fires at its
root ply (the boss's own moves credit nothing to the player), so the boss reply is unchanged, and
the ladder player search (the effect answers its move) is the one that reads it. Deeper boss plies
still fire no effect (the tree does not know which turn they are, out of scope).

Best-move change, measured on 3000 random positions (4 to 9 marbles each, 4 random plies, player
to move with 2 or 4 ejections, a pulse due on the boss reply), same search before and after:

| Search budget | Positions where the best move changed |
|---|---|
| 100 (boss, and the 1x player) | 0 of 3000 |
| 300 | 8 of 3000 |
| 1000 (the 10x player) | 8 of 3000 |

So the change shows only above the 100 nodes the boss uses: the boss reply is identical at the
shipped budget. The test `the_phase_reached_in_the_tree_changes_the_best_move` uses a built
position at 1000 nodes (seed 119 after two plies since #1209, which moved the effect to ply 4; seed 5
after four plies since #1197, which moved the picks; it was 20709). Ladder,
`LADDER_X=<x> LADDER_SEEDS=20 cargo run --release --example ladder -- ballast`, run alone, main
4c1477c before:

| Player budget | Wins /20 before | Wins /20 after | Median plies before / after | Deaths after |
|---|---|---|---|---|
| 100 (1x) | 0 | 0 | 112 / 112 | rim ejection 18, draw 2 |
| 1000 (10x) | 1 | 1 | 127 / 127 | rim ejection 13, draw 6 |

Identical rows: the run is deterministic, not rerun. The #833 target (14 to 18 of 20 at 10x) is
still not met, the owner's call.

### The Ballast Mind: the Swarm's wave is its fifth effect (#1197), not tuned

The pick went from 4 to 5 effects (`engine_version` 18), nothing else changed, no tuning. Same method
(`LADDER_X=1` and `LADDER_X=10`, `LADDER_SEEDS=20 cargo run --release --example ladder -- ballast`,
seeds 0 to 19, 300 plies at most), before (`origin/main` at the time) and after:

| Player | Before | After |
|---|---|---|
| 1x | `100 \| 0/20 \| 112 \| 2 \| rim_ejection 18, draw 2` | `100 \| 1/20 \| 120 \| 2 \| push 1, rim_ejection 14, draw 4` |
| 10x | `1000 \| 1/20 \| 127 \| 2 \| rim_ejection 13, draw 6` | `1000 \| 3/20 \| 174 \| 2 \| rim_ejection 10, draw 7` |

Reading: the wave adds a marble or two to the boss on the rim, away from the player, and it hurts the
player a little less than the pulse or the crack: 1 and 3 of 20 against 0 and 1, within the noise of 20
seeds. The target of #833 (14 to 18 of 20 at 10x) is still out of reach, the owner's call.

### The Ballast Mind: tuned to 15 of 20 at 10x (#1209)

Target of #833: the pro player (10x) wins 14 to 18 of 20, the 1x player fewer. Same method as above,
`LADDER_X=1` and `LADDER_X=10`, `LADDER_SEEDS=20 cargo run --release --example ladder -- ballast`,
seeds 0 to 19, 300 plies at most, after #1197 (the Swarm's wave is the fifth effect). The owner left
the choice of the effect knobs, or a rule change, to the agents (2026-11-01).

**Adopted:** `BALLAST_EVERY` 3 to 2 (an effect every 2 boss turns) and the boss wins at 12 ejections
too, as the player (6 before; `BALLAST_WIN_EJECTIONS` is now both sides' count). The player's 12
(Decision #482), the phases (3, 5), the pulse forces (2, 3, infinite, shared with the Pulsar) and the
boss budget (100) are unchanged. `engine_version` 19.

| Player | Before (main at 2521db8, #1197) | After (#1209) |
|---|---|---|
| 1x | `100 \| 1/20 \| 120 \| 2 \| push 1, rim_ejection 14, draw 4` | `100 \| 7/20 \| 124 \| 2 \| rim_ejection 11, draw 2` |
| 10x | `1000 \| 3/20 \| 174 \| 2 \| rim_ejection 10, draw 7` | `1000 \| 15/20 \| 147.5 \| 2 \| rim_ejection 3, draw 2` |

Repeated on 40 seeds (0 to 39): 1x `14/40` (`rim_ejection 22, draw 3, push 1`), 10x `31/40`
(`rim_ejection 5, draw 4`), the same rates.

**Why the player lost.** A local probe replayed the 20 games at 10x and split every lost marble by
its cause (the boss's push, the player's push, the effect of that ply). Before:

| Cause | Player marbles lost | Boss marbles lost |
|---|---|---|
| the Pulsar's pulse (P1, P2, P3) | 16, 17, 34 (67) | 14, 18, 32 (64) |
| the Hull tick (a cracked cell vanishes) | 3 | 25 |
| the Magnetizer's polarity | 7 | 6 |
| the Chaplain's conversion check | 0 (net) | 0 (net) |
| the Swarm's wave | 0 | 114 marbles gained |
| a push | 14 (the boss's) | 49 (the player's) |

The "rim ejection" deaths are these effect losses: two thirds of the player's lost marbles are
pulses, and a pulse ejects both sides alike (67 against 64), the infinite P3 pulse most of all. With
the boss winning at 6 and the player at 12, an effect that hurts both sides the same is a win for the
boss: it reaches 6 first. The other losses were draws (7 of 20, repetition or the 100-ply cap) in the
games where few effects fired. After, the pulses still eject both sides alike (P3: 80 against 81)
and the same count of 12 makes them fair.

**Tries** (10x unless said, "win" is the player's count, "boss win" the boss's):

| win | boss win | every | phases | pulse forces | Output line |
|---|---|---|---|---|---|
| 12 | 6 | 3 | 3, 5 | 2, 3, inf | `1000 \| 3/20 \| 174 \| 2 \| rim_ejection 10, draw 7` (before) |
| 12 | 6 | 2 | 3, 5 | 2, 3, inf | `1000 \| 3/20 \| 114 \| 2 \| rim_ejection 15, draw 2` |
| 12 | 6 | 3 | 3, 5 | 2, 3, 4 | `1000 \| 3/20 \| 177 \| 2 \| rim_ejection 10, draw 7` |
| 9 | 6 | 3 | 3, 5 | 2, 3, inf | `1000 \| 6/20 \| 171 \| 2 \| rim_ejection 7, draw 7` |
| 8 | 6 | 3 | 3, 5 | 2, 3, inf | `1000 \| 9/20 \| 167.5 \| 2 \| rim_ejection 5, draw 6` |
| 8 | 6 | 3 | 3, 5 | 2, 3, 4 | `1000 \| 9/20 \| 167.5 \| 2 \| rim_ejection 5, draw 6` |
| 8 | 6 | 2 | 3, 5 | 2, 3, inf | `1000 \| 8/20 \| 104.5 \| 2 \| rim_ejection 10, draw 2` |
| 7 | 6 | 2 | 3, 5 | 2, 3, inf | `1000 \| 11/20 \| 102.5 \| 2 \| rim_ejection 7, draw 2` |
| 6 | 6 | 2 | 3, 5 | 2, 3, inf | `1000 \| 13/20 \| 98 \| 2 \| rim_ejection 5, draw 2` |
| 8 | 8 | 2 | 3, 5 | 2, 3, inf | `1000 \| 13/20 \| 104.5 \| 2 \| rim_ejection 5, draw 2` |
| 9 | 8 | 2 | 3, 5 | 2, 3, inf | `1000 \| 13/20 \| 106.5 \| 2 \| rim_ejection 5, draw 2` |
| 10 | 8 | 2 | 3, 5 | 2, 3, inf | `1000 \| 11/20 \| 109.5 \| 2 \| rim_ejection 7, draw 2` |
| 12 | 8 | 3 | 3, 5 | 2, 3, inf | `1000 \| 5/20 \| 188.5 \| 2 \| rim_ejection 8, draw 7` |
| 12 | 8 | 2 | 3, 5 | 2, 3, inf | `1000 \| 7/20 \| 125.5 \| 2 \| rim_ejection 11, draw 2` |
| 12 | 10 | 3 | 3, 5 | 2, 3, inf | `1000 \| 11/20 \| 188 \| 2 \| rim_ejection 2, draw 7` |
| 12 | 10 | 1 | 3, 5 | 2, 3, inf | `1000 \| 12/20 \| 84.5 \| 2 \| rim_ejection 8` |
| 12 | 10 | 2 | 3, 5 | 2, 3, inf | `1000 \| 13/20 \| 143.5 \| 2 \| rim_ejection 5, draw 2` |
| 12 | 10 | 2 | 3, 5 | 2, 3, 4 | `1000 \| 11/20 \| 144 \| 2 \| rim_ejection 5, draw 4` |
| 12 | 10 | 2 | 4, 8 | 2, 3, inf | `1000 \| 14/20 \| 152 \| 2 \| rim_ejection 3, draw 3` |
| 12 | 11 | 2 | 3, 5 | 2, 3, inf | `1000 \| 15/20 \| 147.5 \| 2 \| rim_ejection 3, draw 2` |
| 12 | 12 | 3 | 3, 5 | 2, 3, inf | `1000 \| 11/20 \| 189 \| 2 \| rim_ejection 2, draw 7` |
| **12** | **12** | **2** | **3, 5** | **2, 3, inf** | `1000 \| 15/20 \| 147.5 \| 2 \| rim_ejection 3, draw 2` (kept; 1x `100 \| 7/20`) |

Reading: no effect knob alone moves the 10x result off 3 of 20 (`BALLAST_EVERY` 2 trades draws for
rim ejections, a weaker P3 pulse changes nothing), because each effect hurts both sides and the boss
needs half as many ejections. Lowering the player's count helps (9 of 20 at 8) but breaks Decision
#482 and stalls at 13 of 20. Raising the boss's count is what moves it: 10 gives 13 of 20, 11 and 12
give 15 of 20 (no game is decided between 11 and 12). With an effect every 3 turns, 7 of 20 games
stay draws, so `BALLAST_EVERY` 2 is needed too (11 against 15 of 20). Kept: both at 12, the simplest
rule (the same count for both sides, 4 marbles left of 16) and inside the target, with the 1x player
at 7 of 20, fewer than the pro, as wanted. The tell is unchanged: an effect is still announced one turn
ahead, now every other boss turn.

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
line with credits, so the boss leaves a line only when the train is about to pass. The unit test
`a_train_five_turns_out_does_not_stop_the_boss_from_winning_but_one_about_to_pass_does` is the
position the old root filter misses. Node budget 3000, the Hull's. `LADDER_SEEDS=20`, seeds 0 to 19,
300 plies at most, `cargo run --release --example ladder -- railyard` (player at 1x = 3000 nodes,
10x = 30000):

| | Player | Wins /20 | Median plies | Deaths |
|---|---|---|---|---|
| Before (root filter) | 1x | 2 | 69 | rim_ejection 18 |
| After (train in the tree) | 1x | 4 | 79 | rim_ejection 16 |
| Before (root filter) | 10x | 1 | 85 | rim_ejection 19 |
| After (train in the tree) | 10x | 4 | 69 | rim_ejection 16 |

Reading: the pro player wins as often at 10x as at 1x (4 of 20), so the extra search does not help
it against the trains; the boss is still far above the owner target of 14 to 18 of 20 at 10x.
Nothing was tuned here, the knob (budget or train lead) is the owner's.

Reply time through wasm (nodejs release build, 6 seeds of up to 80 plies, boss replies, a loaded
machine, ms, average / 95th percentile / maximum): The Rail Yard 111 / 142 / 253 after, 85 / 113 / 148
before; measured in the same run, the Hull 120 / 171 / 210 and the Pulsar 133 / 191 / 254. Within the
other bosses'. No rule change, `engine_version` unchanged.

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

### The Echo and the Hull "ignore the rule" tests (#1116), not tuned

Both AIs were already audited as modelled (#930). Each rule now has a test that builds a position where the plain
search plays a different move from the boss AI, and asserts the boss AI plays the rule:

| Boss | Rule | Test | Plain search | Boss AI |
|---|---|---|---|---|
| The Echo | free mirror bonus, both ways | `the_boss_search_sees_the_bonus_it_gives_away` (`echo.rs`) | takes the west push, which hands the player a mirror push that ejects a boss marble | takes the south push, which gives no mirror |
| The Hull | cracks vanish a cell with its marble | `the_hull_moves_its_marble_off_a_crack_about_to_vanish` (`hull.rs`) | leaves its marble on the crack | moves it off |
| The Hull | same, against the player | `the_hull_pushes_a_player_marble_onto_an_announced_crack` (`hull.rs`, #1116) | plays another move | pushes a Black marble onto a crack when Black has one other marble on a crack and saves only one |

No gap was found, so no AI code changed. Not tested: the Echo's P2 older-move bonus in the search tree (the step
test `the_step_remembers_an_illegal_mirror_and_plays_an_older_one_in_p2` covers `echo_step`, but no position was
found where it changes the boss move).

Ladder, `LADDER_X=<1|10> LADDER_SEEDS=20 cargo run --release --example ladder -- <echo|hull>`, seeds 0 to 19, 300
plies at most, run alone on `main` at 2a0f7cb. Nothing tuned.

| Boss | Player budget | Wins /20 | Median plies | Highest phase | Deaths |
|---|---|---|---|---|---|
| The Echo (boss 100) | 100 (1x) | 14 | 104 | P1 | push 3, draw 3 |
| The Echo (boss 100) | 1000 (10x) | 16 | 81.5 | P1 | draw 4 |
| The Hull (boss 3000) | 3000 (1x) | 6 | 95 | P2 | push 12, rim_ejection 2 |
| The Hull (boss 3000) | 30000 (10x) | 12 | 99.5 | P2 | push 4, rim_ejection 4 |

The Hull rows equal those of #823. The Echo at 10x (16 of 20) is above the 7 to 9 of 10 target; the owner decides.

### The ladder plays the Magnetizer, Pulsar, Assembly Line, Unstable Core (#912) and the Overseer (#1117): "before" rows, not tuned

`LadderBoss` gains `Magnetizer`, `Pulsar`, `Assembly` and `Unstable` (the Overseer was already in it), so
`LadderBoss::ALL` plays 15 bosses. Each boss replies through its own move (`magnetizer_move`,
`pulsar_move`, `assembly_move`, `unstable_move`) at its node budget 3000. The other rows are unchanged. The
rows below are the "before" numbers for the boss AI tasks (#913 to #916): the phase is frozen at the root
of the tree for the Pulsar, Assembly Line and Unstable Core, and the Magnetizer assigns no polarity ahead.
Command: `LADDER_X=<1|10> LADDER_SEEDS=20 cargo run --release --example ladder -- <boss>`, seeds 0 to 19,
300 plies at most, one run at a time, main at the commit of #912.

| Boss | Player | Wins /20 | Median plies | Highest phase | Deaths |
|---|---|---|---|---|---|
| Magnetizer | 1x (3000) | 7 | 176 | P2 | push 4, rim_ejection 3, draw 6 |
| Magnetizer | 10x (30000) | 16 | 141 | P2 | draw 4 |
| Pulsar | 1x | 2 | 137 | P2 | push 10, rim_ejection 7, draw 1 |
| Pulsar | 10x | 4 | 123.5 | P2 | push 5, rim_ejection 10, draw 1 |
| Assembly Line | 1x | 0 | 111.5 | P1 | push 3, rim_ejection 17 |
| Assembly Line | 10x | 0 | 88 | P2 | rim_ejection 20 |
| Unstable Core | 1x | 0 | 27 | P2 | rim_ejection 17, draw 3 |
| Unstable Core | 10x | 0 | 27 | P1 | rim_ejection 20 |
| Overseer (#1117) | 1x | 0 | 79 | P2 | push 16, rim_ejection 4 |
| Overseer (#1117) | 10x | 2 | 79 | P2 | push 13, rim_ejection 4, draw 1 |

Reading: against the owner target of 14 to 18 of 20 at 10x only the Magnetizer is inside (16). The Pulsar
is far below (4), the Assembly Line and the Unstable Core win nothing (the Unstable Core ends in 27 plies by
rim ejection). The Overseer is the plain-search player's row: it does not see the incinerators or the clock,
so the neurotoxin ends the fight at ply 79 (the 40th turn) as in the 10 seed row of #828; 20 seeds give 0 and
2 wins. The Rail Yard rows are in its own section above. Nothing was tuned, the knobs are the owner's.
Run times, one machine: 25 s to 66 s at 1x, 104 s to 578 s at 10x.

### The Pulsar's search follows its phase in the tree (#913), not tuned

Until #913 `pulsar_move` pulsed every player ply of the tree at the phase of the root. Now `pulsar_step` takes the
phase from `Encounter::phase_after` (shared by #914 to #916): the player's ejections at the root plus the boss marbles
missing from the tree board, never below the root phase. It holds for a boss whose marbles leave the board only by
ejection (no conversion, no brood). The step reads the board at the **start** of the player ply, as `Encounter::play`
takes the tell (so the force) at the start of the turn: a push that ejects the 3rd boss marble still gets a P1 pulse
that turn, the next pulse is P2 (unit test `the_tree_step_fires_the_p2_force_once_a_third_ejection_is_credited`).
Seed 0 for the next pulsar stays. Not changed: rules, knobs, `PULSAR_NODE_BUDGET` (3000), `engine_version`.

Where the phase changes the best move: unit test `the_phase_reached_in_the_tree_changes_the_best_move`, a built
position at 2 ejections where a Black pair can push a lone boss marble off the rim before a pulse, at the shipped
3000 nodes. The old search (root phase) moves a pair E, the new one moves the lone marble off the rim. 5 of 101
random positions of that kind gave two different moves. A pulse two player plies deep needs a tree of 4 plies.

Ladder, `LADDER_X=<1|10> LADDER_SEEDS=20 cargo run --release --example ladder -- pulsar`, seeds 0 to 19, 300 plies
at most, one run at a time, before (#912 rows above) and after:

| Player | Wins /20 before | Wins /20 after | Median plies before / after | Highest phase | Deaths after |
|---|---|---|---|---|---|
| 1x (3000) | 2 | **2** | 137 / 137 | P2 | push 10, rim_ejection 7, draw 1 |
| 10x (30000) | 4 | **4** | 123.5 / 123.5 | P2 | push 5, rim_ejection 10, draw 1 |

Reading: no change on the ladder. In these games a 3rd or 5th ejection rarely falls inside a 4-ply tree with a pulse
due after it, and no boss reply of the 6 timed games below changed. Nothing was tuned, the Pulsar stays far below the
14 to 18 of 20 target at 10x; the knobs are the owner's.

Reply time through wasm (nodejs release build, 6 seeds of 80 plies, the player plays its auto-play move, boss
replies only, ms, average / 95th percentile / max), the old build timed on the same positions in the same run:
the Pulsar 143 / 191 / 423 after, 128 / 173 / 362 before (about 12 % more: `phase_after` counts the boss marbles of
two boards on each player ply of the tree); measured alone in the same session, the Hull 118 / 161 / 322.

### The Pulsar: the ladder player reads the pulses (#1231), 18 of 20 at 10x, not tuned

Target (#753, #833): the pro player (10x) wins 14 to 18 of 20, the 1x player fewer. Method of #1209: a local
probe (not committed) replays the 20 ladder games at 10x and splits every lost marble by cause, then the ladder
reruns, `LADDER_X=<1|10> LADDER_SEEDS=<20|40> cargo run --release --example ladder -- pulsar`, seeds from 0, 300
plies at most, one run at a time.

**Why the player lost.** The boss search sees the pulses (#675, #913), the ladder player did not: it searched the
standard rules only, as the Ballast Mind's player before #834. Before, at 10x, 20 games, 497 pulses fired:

| Cause | Player marbles lost | Boss marbles lost |
|---|---|---|
| a pulse (P1, P2, P3) | 41, 10, 2 (53) | 1, 2, 4 (7) |
| a push (the other side's) | 52 | 54 |

The pushes are even. The pulses decide the fight: the boss keeps its marbles out of them and the player walks
into them. The "rim ejection" deaths are those pulses.

**Change, ladder only:** `player_move` plays `pulsar_search` against the Pulsar, the boss reply's own search
(`pulsar.rs`) with the player's budget: every player ply of its tree goes through the hook, at the phase it reaches,
with seed 0 for the next pulsar, so it reads the tell as the HUD shows it (the pulsar, the turns left, the force). Unit
test `the_player_reads_the_pulse_of_the_pulsar`: with a pulse due at the end of the turn, the plain search pushes a
lone boss marble off the rim and loses 2 of its own to the pulse; the reading player loses none. No rule or knob
changed, `PULSAR_NODE_BUDGET` stays 3000, `engine_version` unchanged, no text changed.

After, at 10x, 20 games, 478 pulses fired: the pulses eject 10 player marbles (3, 7, 0) against 47 boss ones
(15, 26, 6), the pushes 45 against 71. The pulses now eject mostly boss marbles, the counter of game-design.md 7.10.

| Player | Before (main at adb99ad) | After (#1231) | After, 40 seeds |
|---|---|---|---|
| 1x | `3000 \| 2/20 \| 137 \| 2 \| push 10, rim_ejection 7, draw 1` | `3000 \| 10/20 \| 171.5 \| 2 \| push 5, draw 5` | `3000 \| 14/40 \| 159.5 \| 2 \| push 14, draw 12` |
| 10x | `30000 \| 4/20 \| 123.5 \| 2 \| push 5, rim_ejection 10, draw 1` | `30000 \| 18/20 \| 112 \| 2 \| push 1, draw 1` | `30000 \| 29/40 \| 115 \| 2 \| push 5, rim_ejection 1, draw 5` |

**Tries:** none on the boss's knobs (budget, weights, `PULSAR_FORCE`, the cadence, the phase thresholds). The
reading player alone lands inside the target: 18 of 20 at 10x on seeds 0 to 19, the top of the range, and 29 of 40
(14.5 of 20) on seeds 0 to 39, the middle of it; the 1x player wins fewer, 10 of 20 and 14 of 40. A knob that weakens
the boss further would push the 20-seed row past 18, one that strengthens it would change play and `engine_version`
for a rate already on target, so nothing was tuned. `PULSAR_FORCE` is also shared with the Ballast Mind's borrowed
pulse (#1209), a reason more to leave it.

### The Assembly Line's search follows its phase in the tree (#914), not tuned

Until #914 `assembly_move` ran the belts on every player ply of the tree at the phase of the root. Now
`assembly_step` takes the phase from `Encounter::phase_after` (#913): the player's ejections at the root plus the boss
marbles missing from the tree board, never below the root phase, so a belt that carries the 3rd boss marble off opens
the side belts for the next player ply of the tree, and the 5th adds the presses. As for the Pulsar, the step reads
the board at the **start** of the player ply, because `Encounter::play` takes the phase (`tell`) before the move: the
ply that ejects the 3rd marble still belts at P1, the next one at P2 (unit test
`the_tree_step_runs_three_belts_once_a_third_ejection_is_credited`). The belts' state carried on the board is
unchanged. Seed 0 for the strike slots stays. Not changed: rules, knobs, `ASSEMBLY_NODE_BUDGET` (3000),
`engine_version`.

Where the phase changes the best move: unit test `the_phase_reached_in_the_tree_changes_the_best_move`, a built
position at 2 ejections with the boss marble on the centre belt's falling end, at the shipped 3000 nodes. The old
search (root phase) steps that marble off the belt, the new one moves a pair E. 2 of 4000 random positions of that kind
gave two different moves.

Ladder, `LADDER_X=<1|10> LADDER_SEEDS=20 cargo run --release --example ladder -- assembly`, seeds 0 to 19, 300 plies
at most, one run at a time, before (#912 rows above) and after:

| Player | Wins /20 before | Wins /20 after | Median plies before / after | Highest phase | Deaths after |
|---|---|---|---|---|---|
| 1x (3000) | 0 | **0** | 111.5 / 111.5 | P1 | push 3, rim_ejection 17 |
| 10x (30000) | 0 | **0** | 88 / 88 | P2 | rim_ejection 20 |

Reading: no change on the ladder, every game identical. A 3rd or 5th ejection rarely falls inside a 4-ply tree, and no
boss reply of the 240 timed below changed. Nothing was tuned, the Assembly Line stays far below the 14 to 18 of 20
target at 10x; the knobs are the owner's.

Reply time through wasm (nodejs release build, 6 seeds of 80 plies, the player plays its auto-play move, boss replies
only, ms, average / 95th percentile / max), the old build timed on the same positions in the same run: the Assembly Line
143 / 245 / 375 after, 136 / 229 / 402 before (240 replies each, about 5 % more: `phase_after` counts the boss marbles
of two boards on each player ply of the tree).

### The Magnetizer's search plays its assignment turns in the tree (#916), not tuned

Until #916 the tree of `magnetizer_move` carried the polarities and settled every ply, but it never ran the
assignment hook: the boss did not see the announced marble take its sign. The hook's id (`special(ply, phase)`) needs
the ply, and the board holds no turn clock (an announce on the board says the next hook assigns, not whether it
announces the next one). So `magnetizer_move` puts the root ply on a board field that only the tree uses
(`Board::magnetizer_ply`, as the Choir's turn order, #825), and `magnetizer_step` adds 1 per ply: no `search.rs`
change. After a boss ply the step runs the hook with the special of that ply, in the phase from
`Encounter::phase_after` of the board at the **start** of the ply (the encounter takes the tell before the move,
as for the Pulsar, #913), with seed 0 for the picks, then settles again (seed 0). It also carries the announce with
the moves. A hook with nothing to assign or announce is skipped (same board). Not changed: rules, knobs,
`MAGNETIZER_NODE_BUDGET` (3000), `engine_version`.

Unit tests: `the_tree_sees_the_assignment_at_the_start_of_turn_3_and_avoids_its_repulsion` (turn 2 of P1, the
announced marble next to an opposite boss pole on the rim: the old search moves another marble and loses the pole to
the repulsion, the new one moves the pole off the rim; 1 of 600 random positions of that kind gave two moves) and
`a_third_ejection_in_the_tree_switches_the_cadence_from_3_to_2` (root at 2 ejections, boss ply 4 of the tree
announces turn 4 only once a third boss marble is gone).

Ladder, `LADDER_X=<1|10> LADDER_SEEDS=20 cargo run --release --example ladder -- magnetizer`, seeds 0 to 19, 300
plies at most, before (#912 rows above) and after. Output lines after:
`magnetizer | 3000 | 2/20 | 165 | 2 | push 3, rim_ejection 13, draw 2` and
`magnetizer | 30000 | 7/20 | 173 | 2 | rim_ejection 10, draw 2, ply_cap 1`.

| Player | Wins /20 before | Wins /20 after | Median plies before / after | Deaths after |
|---|---|---|---|---|
| 1x (3000) | 7 | **2** | 176 / 165 | push 3, rim_ejection 13, draw 2 |
| 10x (30000) | 16 | **7** | 141 / 173 | rim_ejection 10, draw 2, ply_cap 1 |

Reading: the boss gets much stronger. It now sees the announced marble take its sign one ply ahead, as in the unit
test above; the games were not traced one by one. Most of the player's losses are rim ejections (13 at 1x, 10 at
10x). The 10x player drops from 16 of 20 (inside the owner target of 14 to 18) to 7, outside it. Nothing was tuned;
the knobs (rhythm, phase ejections, node budget) are the owner's.

Reply time through wasm (nodejs release build, 6 seeds of 80 plies, the player plays its auto-play move, boss
replies only, ms, average / 95th percentile / max), the old build timed on the same positions in the same run, on a
machine shared with other builds: 187 / 485 / 652 after, 140 / 341 / 448 before; a second run 293 / 987 / 1499
after, 220 / 734 / 1177 before. About a third more in both runs: the step carries the announce, computes
`phase_after` after each boss ply and runs the hook with a second settle.

### The Assembly Line: the ladder player reads the belts (#1228), 18 of 20 at 10x, not tuned

Target of #753 and #833: the pro player (10x) wins 14 to 18 of 20, the 1x player fewer. Method:
`LADDER_X=<1|10> LADDER_SEEDS=20 cargo run --release --example ladder -- assembly`, seeds 0 to 19,
300 plies at most, one run at a time, main after #914 (the boss's phase inside its tree).

**Why the player lost.** A local probe replayed the ladder games and split every lost marble by its
cause: a push of the other side, a belt that carries it off its end, a press. Before, 10x (20 games,
all lost):

| Cause | Player marbles lost | Boss marbles lost |
|---|---|---|
| a belt carries it off | 85 | 4 |
| a press strikes it | 0 | 0 |
| a push | 35 (the boss's) | 31 (the player's) |

At 1x: belts 78 and 1, pushes 43 and 25, no strike. The "rim ejection" deaths are these belt falls.
The boss search runs the belts on every player ply of its tree, the ladder player did not: it played
the plain search, as the Ballast Mind's player before #834, and walked onto the belts' ends.

**Adopted: the ladder player reads the belts.** `player_move` plays `assembly_search` against the
Assembly Line, the boss's own hooked search (`assembly_step` on every player ply of the tree, the
belts and the announced strikes stored on the board, seed 0 for the strikes still to come), as it
does for the Ballast Mind. The player in the game sees the same: the chevrons, the reversal counter
and the blinking slot. Unit test `the_player_reads_the_belts_of_the_assembly_line`: a marble on the
falling end of the centre belt, which the plain search leaves there. No rule, knob or boss change,
`engine_version` unchanged.

| Player | Before (main at ba8a292, #914) | After (#1228) |
|---|---|---|
| 1x (3000) | `3000 \| 0/20 \| 111.5 \| 1 \| push 3, rim_ejection 17` | `3000 \| 10/20 \| 158 \| 2 \| push 4, rim_ejection 1, draw 5` |
| 10x (30000) | `30000 \| 0/20 \| 88 \| 2 \| rim_ejection 20` | `30000 \| 18/20 \| 91 \| 2 \| push 1, rim_ejection 1` |

Repeated on 40 seeds (0 to 39): 10x `30000 \| 36/40 \| 95 \| 2 \| push 1, rim_ejection 2, draw 1`, 1x
`3000 \| 19/40 \| 157 \| 2 \| push 8, rim_ejection 3, draw 10`, the same rates. After, 10x on 40 seeds,
the player lost 69 marbles to pushes, 23 to belts and 6 to presses, the boss 161, 75 and 7: the
belts now work for the side that reads them, as the "Turn it against the boss" line says.

Reading: one change, in the measuring player only, takes the 10x row from 0 to 18 of 20, the top of
the target, and 1x to 10 of 20, fewer as wanted. No knob was tried: none is needed to reach the
target, and each one (the reversal, the strike rhythm, the phases, the budget) changes play, the
fixture and its e2e test. If the owner wants the 10x row nearer the middle of the target, a boss
knob is the next step.

### The Overseer, the Rail Yard and the Magnetizer: the ladder player reads their hooks (#1230, #1232, #1237)

Target of #753 and #833: the pro player (10x) wins 14 to 18 of 20, the 1x player fewer. Method:
`LADDER_X=<1|10> LADDER_SEEDS=20 cargo run --release --example ladder -- <boss>`, seeds 0 to 19, 300 plies at
most, one ladder run at a time, main after #1228.

**The fix, for all three.** As #1228 found for the Assembly Line, `player_move` ran the plain search against these
three bosses: it never saw a core burn, a train pass or a repulsion. It now plays the boss's own hooked search, as
it does for the Ballast Mind: `overseer_search` (every ply of the tree burns in the phase its credits give; no clock
for the player, the boss keeps its neurotoxin clock), `railyard_search` (every player ply counts the trains down, a
pass ejects its line) and `magnetizer_search` (every ply settles, the assignments run after the boss plies). The
player in the game sees the same: the vents, the train ghosts and countdowns, the glyphs and the announce diamond.
Unit tests, each a position where the plain search loses or misses what the hook does:
`the_player_reads_the_incinerators_of_the_overseer` (the 6th ejection is a core one push from a vent),
`the_player_reads_the_trains_of_the_rail_yard` (a marble on the row a train passes at the end of the turn) and
`the_player_reads_the_polarities_of_the_magnetizer` (the announced boss marble takes its − next to the player's +,
whose repulsion throws the marble behind it off the rim).

| Boss | Player | Before | After the fix |
|---|---|---|---|
| Overseer | 1x (3000) | `3000 \| 0/20 \| 79 \| 2 \| push 16, rim_ejection 4` (#1117) | `3000 \| 1/20 \| 79 \| 2 \| push 13, rim_ejection 6` |
| Overseer | 10x (30000) | `30000 \| 2/20 \| 79 \| 2 \| push 13, rim_ejection 4, draw 1` (#1117) | `30000 \| 9/20 \| 77 \| 2 \| push 9, rim_ejection 1, draw 1` |
| Rail Yard | 1x (3000) | `3000 \| 4/20 \| 79 \| rim_ejection 16` (#827) | `3000 \| 10/20 \| 104 \| 2 \| push 1, rim_ejection 8, draw 1` |
| Rail Yard | 10x (30000) | `30000 \| 4/20 \| 69 \| rim_ejection 16` (#827) | `30000 \| 16/20 \| 84 \| 2 \| rim_ejection 3, draw 1` |
| Magnetizer | 1x (3000) | `3000 \| 2/20 \| 165 \| 2 \| push 3, rim_ejection 13, draw 2` (#916) | `3000 \| 5/20 \| 226.5 \| 2 \| push 12, draw 3` |
| Magnetizer | 10x (30000) | `30000 \| 7/20 \| 173 \| 2 \| rim_ejection 10, draw 2, ply_cap 1` (#916) | `30000 \| 12/20 \| 169 \| 2 \| push 2, rim_ejection 2, draw 3, ply_cap 1` |

**The Rail Yard: on target, not tuned.** 16 of 20 at 10x, 10 of 20 at 1x, fewer as wanted. Repeated on 40 seeds
(0 to 39) at 10x: `30000 | 36/40 | 77 | 2 | rim_ejection 3, draw 1`, the top of the target (seeds 20 to 39 won all
20). No knob was tried; if the owner wants the 10x row nearer the middle, the train lead (5) is the next step.

**The Overseer: 9 of 20 at 10x, no knob reaches the target, not tuned.** A local probe replayed the 20 ladder games
at 10x and split the credits by cause. After the fix, 10 of the 11 losses end at ply 79, the neurotoxin, with 4 or 5
of the 6 ejections made (seed 7 is a draw at ply 38). Over the 20 games the player burnt 67 cores, the boss 2; boss
marbles burnt 9, pushed off 18; player marbles burnt 6, pushed off 11. So the player now learns the counter (the spec
gate "fewer than 2 cores burnt" is far away), but the last one or two cores end jammed: two cores side by side on
the line of a vent with a boss marble behind them (seed 4, ply 79: cores on `(-2, -1)` and `(-1, -1)`, the vent on
`(-3, -1)`, the player's marble on `(0, -1)` and boss marbles beyond), which only a 3-marble push frees, too deep for
a 4-ply tree whose weights do not value a core near a vent. The three knobs of section 7.11, each tried alone at 10x
on the same 20 seeds (the probe prints the ladder's own games):

| Knob | Wins /20 at 10x | What the probe shows |
|---|---|---|
| shipped (40 turns, P2 at 2, P3 at 4, 3000 nodes) | 9 | 10 losses at the clock with 3 to 5 credits |
| clock 45 turns | 9 | the same 9 games won, the 11 others stall the same way to ply 89 |
| phases at 2 and 5 (P3 later) | 9 | the same stall at 4 or 5 credits, in P2 too: not the P3 plug |
| node budget 1500 (player 15000) | 9 | 11 losses at the clock with 3 to 5 credits |
| node budget 6000 (player 60000) | 8 | 12 losses at the clock with 3 to 5 credits |

Reading: the fix takes the 10x row from 2 to 9 of 20 and leaves 1x at 1, but no knob moves it further: more turns do
not unjam a core, and a weaker or stronger boss comes with a weaker or stronger player. No Overseer knob was
changed. Reaching 14 of 20 needs a rule or a layout change (for example a core that a vent pulls
in from one cell away, or cores starting one cell nearer their vents), which is the owner's call: a separate issue.

**The Magnetizer: tuned to 15 of 20 at 10x, rhythm 3, 3, 2, `engine_version` 20.** The probe split every marble
lost after the fix, 10x, 20 games (12 won): the player lost 37 to boss pushes, 0 to repulsions on its own plies and
22 to repulsions on boss plies (the assignment at the start of its turn, or a boss move); the boss lost 87 to pushes,
10 to repulsions set off by the player, 1 on its own plies. Two losses (seeds 5 and 19) came from repulsions, two
from pushes, four were long games (3 draws, 1 at the ply cap). The assignment rhythm is the knob that acts on those
repulsions; the phase ejections (3, 5) and the budget (3000) were left. Tries at 10x, 20 seeds:

| `MAGNETIZER_ASSIGN_EVERY` | Wins /20 at 10x | Player marbles lost: push / repulsion on boss plies | Losses |
|---|---|---|---|
| 3, 2, 1 (shipped) | 12 | 37 / 22 | push 2, rim_ejection 2, draw 3, ply_cap 1 |
| 3, 2, 2 | 12 | 37 / 16 | push 2, draw 4, ply_cap 2 |
| **3, 3, 2 (adopted)** | **15** | 36 / 14 | draw 2, ply_cap 3 |

Adopted rows: 10x `30000 | 15/20 | 168 | 2 | draw 2, ply_cap 3` (probe, median computed from its plies), 1x
`3000 | 8/20 | 219.5 | 2 | push 8, draw 4` (ladder), fewer as wanted. P1 is unchanged (turns 3, 6, 9), so the e2e
fixture, which ends on entering P2, is unchanged; P2 now keeps the P1 rhythm and P3 assigns on the even turns. The
P3 change alone (3, 2, 2) does not move the row: the P2 cadence is what costs the player. The 5 losses left are long
games and none is lost to a repulsion. The HUD never reads "Polarity every turn" any more (the client's
`polarityText` follows the same table). The unit test of #916 `a_third_ejection_in_the_tree_switches_the_cadence_from_3_to_2`
is now `a_fifth_ejection_in_the_tree_switches_the_cadence_from_3_to_2`, at the P2 to P3 switch, since P1 and P2 share
their cadence. Not repeated on 40 seeds: 15 is inside the target and a 10x run of this boss
takes about 30 minutes.

### The Unstable Core: the pro reads the charges, P2 after 1 ejection, P3 after 2, a shockwave every 4 turns (#1229)

Target of #753 and #833: the pro (10x) wins 14 to 18 of 20, the 1x player fewer. Before: 0 of 20 at 1x and
at 10x (section above, #912). Method of #1209: count the player's lost marbles by cause with a probe, boss
knobs first, a rule change only if the knobs cannot. Commands: `LADDER_X=<1|10> LADDER_SEEDS=20 cargo run
--release --example ladder -- unstable`, seeds 0 to 19, 300 plies at most. The ladder is node-counted, so the
numbers do not depend on the load of the machine (it was 20 to 30 during these runs, other agents working;
the runs were still one ladder at a time).

**Why the player lost.** A local probe replayed the 20 games at 10x and split every lost marble by its cause
(not committed):

| Cause | Player marbles lost | Boss marbles lost |
|---|---|---|
| overload (4 charges) | **116** | 26 |
| a push | 3 | 12 |

The ladder player searched with the plain search (`search_with`): it did not see the charges, so it left
marbles on the energy cells until they blew (6 of its marbles in 27 plies, the boss wins at 6). The boss
search sees the overloads (`unstable_move`, `search_hooked`), so it won 20 of 20. This is the player's
blindness, not a boss knob: a real player reads the pips over every marble. As for the Ballast Mind (#834)
the ladder pro now plays the same hooked search as the boss with its own larger budget
(`unstable_search`, used by `unstable_move` too; unit test
`the_player_search_sees_the_overload_the_plain_search_walks_into`, ladder test
`the_player_reads_the_charges_of_the_unstable_core`, red before). Rules and boss unchanged by this step:

| Player | Before (plain search) | The pro reads the charges |
|---|---|---|
| 1x (3000) | `0/20 \| 27 \| 2 \| rim_ejection 17, draw 3` | `0/20 \| 34 \| 2 \| rim_ejection 1, draw 19` |
| 10x (30000) | `0/20 \| 27 \| 1 \| rim_ejection 20` | `6/20 \| 48 \| 2 \| draw 14` |

Now the losses are draws: 14 of 20 at 10x, 19 of 20 at 1x. Neither side ejects, the fight
stalls with nothing forcing a trade (the draw cause, repetition or the 100 ply cap,
was not split). The
levers that force one are the phases (P2 collapses the core, P3 shoves wedges).

**Tries** (10x, 20 seeds, the pro reads the charges; `ejections` = P2 and P3 thresholds, `shock` = player
turns between two shockwaves, announced the turn before; `T_*` were temporary environment overrides, removed):

| ejections | shock | other | Output line |
|---|---|---|---|
| 3, 5 | 3 | (before this change) | `30000 \| 6/20 \| 48 \| 2 \| draw 14` |
| 3, 5 | 3 | boss budget 1000 (pro 10000) | `10000 \| 3/20 \| 47 \| 2 \| draw 17` |
| 2, 4 | 3 | | `30000 \| 6/20 \| 49 \| 2 \| rim_ejection 1, draw 13` |
| 2, 3 | 3 | | `30000 \| 9/20 \| 47 \| 2 \| draw 11` |
| 1, 3 | 3 | | `30000 \| 9/20 \| 111 \| 2 \| draw 11` |
| 1, 3 | 2 | | `30000 \| 8/20 \| 111 \| 2 \| push 1, draw 11` |
| 1, 3 | 3 | overload at 3 | `30000 \| 0/20 \| 39 \| 0 \| draw 20` |
| 1, 2 | 3 | | `30000 \| 19/20 \| 56 \| 2 \| draw 1` (1x: `3000 \| 12/20 \| 106 \| 2 \| rim_ejection 7, draw 1`) |
| 1, 2 | 5 | | `30000 \| 19/20 \| 88.5 \| 2 \| draw 1` |
| **1, 2** | **4** | | `30000 \| 18/20 \| 79 \| 2 \| draw 2` (kept) |

Repeated on 40 seeds (0 to 39) for the kept row: `30000 \| 37/40 \| 92 \| 2 \| draw 3`, 18.5 of 20, a little
above the 20 seed value and just over the band. 1x of the kept row: `3000 \| 8/20 \| 106 \| 2 \| rim_ejection 10,
draw 2`. The committed build (no override) gives the same two lines, 18 of 20 at 10x and 8 of 20 at 1x.

Reading: the boss budget does not help (a weaker boss is a weaker pro, the pro is 10 times the boss). An
overload at 3 stalls everybody (20 draws, the phase column stays at 0, the first phase). What moves the result is the
number of ejections that start the collapse and the shockwaves: with P3 at 2 the board is shaken from the
first trade and the draws almost disappear (11 to 2). The 3 values of the shock rhythm (3, 4, 5) give 19, 18
and 19 of 20: the rhythm is inside the noise of 20 seeds, 4 is kept because it is the one inside the band
and the 1x pro (8 of 20) stays well below the 10x pro. A rule change was not needed.

**Adopted:** `UNSTABLE_PHASE_EJECTIONS` `[3, 5]` to `[1, 2]`, `SHOCK_EVERY` 3 to 4 (the wedge is announced one
turn ahead, at the tick before the last), the pro ladder player reads the charges. Overload (4), the node
budget (3000) and the weighted rule are unchanged. `engine_version` 20. The fixtures of the core tests, the
client harness and `client/e2e/unstable.spec.ts` are the 17-ply fight (overloads on plies 8 and 10, the core
collapses on ply 11, the shockwave is announced on ply 15 and hits on ply 17). No text of the client or of the
MCP changed (they read the engine's tell), so no new screenshot.
