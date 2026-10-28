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

### The Ballast Mind: NOT measured at pro level, 0 of 10 at 1x

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

## 4. Recorded wins

`crates/abalone-core/tests/fixtures/<boss>.txt`, replayed by
`crates/abalone-core/tests/boss_fixtures.rs` through `Fixture::replay` (the `Encounter` API, and
the `Choir` API for the Choir), asserting a player win. Format: boss id, seed, the budgets it was
recorded with, then one move per line (cells `q,r` joined by `;`, a space, the direction), both
sides in order. The replay does not search, so it is deterministic and fast.

| Boss | Seed | Player budget | Moves |
|---|---|---|---|
| echo | 0 | 4000 | 126 |
| hull | 0 | 30000 | 89 |
| choir | 0 | 15000 | 93 |
| chaplain | 10040 | 0 (a player taking the move with the most ejections or conversions, a random boss: it reaches P2 and the martyr, which the wasm and e2e tests read; recorded again for #810) | 97 |
| chaplain-ladder | 0 | 20000 (10x, the ladder pro player, #753, recorded again for #810) | 44 |

No fixture for the Ballast Mind: no winning game was found (section 3).

To record again after a rule change:
`LADDER_X=10 LADDER_FIXTURES=<dir> cargo run --release --example ladder -- echo hull choir`
(`LADDER_NODES` sets the budget in nodes, `LADDER_JSONL` writes every attempt).

## 5. Finding: phases that a win at 6 ejections never reaches

A player wins at 6 ejections, so the boss is left with 14 minus 6 = 8 marbles (16 minus 6 = 10 for
the Ballast Mind) unless conversions made it grow. The phase thresholds of section 7 of
`game-design.md` then read:

- The Echo P3 (5 left) and the Hull P3 (5 left): never played. The highest phase in the table is P2.
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
