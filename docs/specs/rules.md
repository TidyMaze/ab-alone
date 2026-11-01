---
id: rules
type: architecture-design
status: draft
title: "AB-ALONE rules spec"
parent: goal
references: [game-design, architecture]
---

# AB-ALONE rules spec

Status: draft v1, for issue #59. Spec only, no code. Companion to `SPEC.md` section 2, `game-design.md` and `tech.md`.

How to read this file:
- **FINAL**: decided. Changing it needs a Decision issue.
- **TUNE**: starting value, to be tuned by playtest.
- **OPEN**: conflicts between docs, or no source at all. Listed in section 13. Nothing marked OPEN may be tested as final.
- **PROPOSAL**: a rule written here to make the spec complete. It is not in a source. Owners confirm or replace it.

Section 12 holds the numbered examples. Each one is a block of precondition, action and expected result, with coordinates, so it can become a unit test.

## 1. Board

**FINAL.** Axial coordinates `(q, r)`. A cell exists if and only if `max(|q|, |r|, |q+r|) <= 4`. The board has 61 cells.

Six directions (pointy-top axial convention):

| Name | Vector | Name | Vector |
|---|---|---|---|
| E | (+1, 0) | W | (-1, 0) |
| NE | (+1, -1) | SW | (-1, +1) |
| NW | (0, -1) | SE | (0, +1) |

The three lines (axes) are: E-W (r constant), NE-SW (q+r constant), NW-SE (q constant).

Cells per row (r is the row, q the column range):

| r | q range | cells |
|---|---|---|
| -4 | 0 to 4 | 5 |
| -3 | -1 to 4 | 6 |
| -2 | -2 to 4 | 7 |
| -1 | -3 to 4 | 8 |
| 0 | -4 to 4 | 9 |
| 1 | -4 to 3 | 8 |
| 2 | -4 to 2 | 7 |
| 3 | -4 to 1 | 6 |
| 4 | -4 to 0 | 5 |

- Black sits at r > 0 (the bottom of a diagram), White at r < 0 (the top). The orientation is for reading only, the rules do not depend on it.
- **Cell name**: `(q,r)` with no space, for example `(-3,2)`. The same string is used in code, logs and tests.
- **Rim**: cells with `max(|q|, |r|, |q+r|) = 4`.
- **Point reflection** `(q,r) -> (-q,-r)` maps Black's side onto White's side. Used for mirrored layouts and for the Echo boss (section 10.3).
- **Move notation**: the selected cells, then `>` and the direction, for example `(-1,2)(0,2)>E`. A single marble is `(0,0)>SE`. Used in logs, tests and examples. **PROPOSAL** (tech.md section 3 asks for a human format without defining it).

## 2. Start layouts

### 2.1 Standard layout (FINAL)

Black, 14 cells at the bottom: rows of 5, 6, and the middle 3 of the third row.

- r=4: (-4,4) (-3,4) (-2,4) (-1,4) (0,4)
- r=3: (-4,3) (-3,3) (-2,3) (-1,3) (0,3) (1,3)
- r=2: (-2,2) (-1,2) (0,2)

White, 14 cells at the top, point reflection of Black:

- r=-4: (0,-4) (1,-4) (2,-4) (3,-4) (4,-4)
- r=-3: (-1,-3) (0,-3) (1,-3) (2,-3) (3,-3) (4,-3)
- r=-2: (0,-2) (1,-2) (2,-2)

### 2.2 Belgian daisy layout (FINAL)

**FINAL**, checked in #69 against three diagrams that agree cell for cell:
- Wikipedia, "Abalone (board game)", file `Abalone_belgian.svg`.
- abalonegames.com (Abalone S.A.), Rules > Rule variations > Belgian Daisy, author: Belgian Federation of Abalone.
- playstrategy.org/variant/abalone, Belgian daisy diagram.

Each side has two flowers of 7 cells: a centre cell and its six neighbours. One flower is near the bottom, one near the top. Black is at bottom left and top right, White at bottom right and top left.

Black:
- Flower A, centre (-3,3): (-4,4) (-3,4) (-4,3) (-3,3) (-2,3) (-3,2) (-2,2)
- Flower B, centre (3,-3): (2,-2) (3,-2) (2,-3) (3,-3) (4,-3) (3,-4) (4,-4)

White, the left-right mirror of Black, `(q,r) -> (-q-r,r)`:
- Flower C, centre (0,3): (-1,4) (0,4) (-1,3) (0,3) (1,3) (0,2) (1,2)
- Flower D, centre (0,-3): (-1,-2) (0,-2) (-1,-3) (0,-3) (1,-3) (0,-4) (1,-4)

Unlike the standard layout, the point reflection `(q,r) -> (-q,-r)` keeps colours here: it maps flower A onto B and C onto D.

### 2.3 Who moves first (OPEN-3)

Black moves first. **PROPOSAL.** No source sets it.

## 3. Groups

- **FINAL.** A group is 1 to 3 own marbles.
- **FINAL.** The marbles of a group lie on one axis and are contiguous, with no gap.
- A pair is any two adjacent own marbles. A triangle or a bend is not a group.
- Selecting a fourth marble, a marble with a gap, or a marble off the axis is refused. Nothing is played, the selection is undone.
- Only own marbles can be selected.

## 4. Moves

**FINAL.** One move per turn: one group, one direction.

### 4.1 Inline move

The direction is along the group's axis, either way. For a single marble, every move is a plain move in any of the six directions.

- The leading cell is the cell next to the front marble, in the move direction.
- Leading cell empty and on board: legal. Every marble moves one step, the trailing marble enters the vacated cell.
- Leading cell holds an opponent: sumito, see section 5.
- Leading cell is own marble, or off board with no opponent to push: illegal.

### 4.2 Broadside move

The direction is not parallel to the axis of a 2 or 3 group. Every marble moves one step in that direction.

- Legal if and only if every target cell is on the board and empty.
- A broadside never pushes and never ejects. Target cells held by an own marble or an opponent make the move illegal.

## 5. Sumito

Inline move, direction `d`, group of `n` own marbles. Let the opponent run be the maximal contiguous run of opponent marbles starting at the leading cell and going in `d`. Let `m` be its length.

**FINAL.** The push is legal if and only if:
1. `n > m`. So 2v1, 3v1 and 3v2 are legal. 1v1, 2v2 and 3v3 are illegal.
2. The cell just after the run, in direction `d`, is empty or off the board. An own marble there blocks the push.

**FINAL.** On a legal push, the group and the run each shift one step in `d`. If the cell after the run is off the board, the last marble of the run leaves the board: it is ejected for the mover. At most one marble can be ejected by one move.

## 6. Ejection and win

- **FINAL.** An ejected marble is removed for good.
- **FINAL.** A player's ejected count is the number of opponent marbles that player has ejected (plus the boss rules in section 10.3).
- **FINAL.** The first player whose ejected count reaches 6 wins. The ply that makes the sixth ejection ends the game at once.
- Removals by something other than a move (breach, boss hooks) are in sections 10.3 and 10.4.

## 7. Turn order

- Black moves first (**OPEN-3**, see 2.3).
- **FINAL.** Strict alternation. A move from the side not to move is refused.
- **FINAL (#1301, owner decision).** The side to move has at least one marble but no legal move: its turn passes. The other side moves next, nothing on the board changes, and no ply is added to the move list: the rule decides it, so every peer passes alike and no message carries it. This holds in every mode and for every player (humans, bots, bosses, online peers). The HUD says so ("Black has no move: turn passed").
- **FINAL (#1301).** When the side to move next has no legal move either, the game ends in a draw (draw reason "blocked"), or under the mode's own draw rule: a PvE draw is a loss for the player (section 9), a Trainer draw a clear. Two passes in a row never happen.
- A side with no marble left keeps its own rule: it has lost (section 10.3).
- The search (bots, bosses, the ladder) scores a blocked position as that pass, never as a static leaf.

## 8. Edge cases

Each case points to its example in section 12.

| Case | Expected result | Example |
|---|---|---|
| Push where the cell behind the run is an own marble | Illegal | 19 |
| Push where the cell behind the run is off the board | Legal, last run marble ejected | 17, 18 |
| Push where the cell behind the run is empty | Legal, run shifts, no ejection | 15, 16, 20 |
| Far own marble behind a non-adjacent gap | Does not block the push | 21 |
| Move into an empty cell next to an opponent | Plain move, no push | 22 |
| Broadside onto an own marble | Illegal | 6 |
| Broadside onto an opponent | Illegal, broadside never pushes | 7 |
| Broadside off the board | Illegal | 8 |
| Inline move off the board with no opponent | Illegal | 12 |
| Select 4 marbles in a line | Refused | 9 |
| Select a triangle | Refused | 10 |
| Select 2 or 3 marbles with a gap | Refused | 11 |
| Push 1v1 | Illegal | 13 |
| Push 2v2 | Illegal | 14 |
| Single marble, any of 6 directions, empty cell | Legal | 1, 2 |
| Selecting an opponent marble | Refused | (section 3) |
| Move by the side not to move | Refused | 24 |
| Two ejections in one move | Cannot happen (section 5) | (section 5) |
| Sixth ejection | Win at once | 23 |
| Position occurs for the 3rd time | Draw | 26 |
| Position occurs for the 2nd time | Game goes on | 27 |
| 100th ply with no ejection | Draw | 28 |
| 99th ply with no ejection | Game goes on | 29 |
| Ejection | No-ejection counter resets to 0 | 30 |
| Side to move has marbles but no legal move | Its turn passes (section 7) | (section 7) |
| Neither side has a legal move | Draw (section 7) | (section 7) |

## 9. End of game

- **FINAL.** Win: 6 ejections (section 6), against every boss.
- **FINAL.** Threefold repetition: the same position (board, side to move, mode state) occurs for the third time. The game is a draw. Mode state is part of the position identity (game-design section 5).
- **FINAL (decided for this spec).** 100 plies in a row with no ejection: the game is a draw. The counter counts plies since the last ejection by either side and resets on each ejection. **OPEN-1**: game-design.md section 5.2 says the 100-ply end is decided by ejections, then centrality, then draw. See section 13.
- **TUNE.** HUD warning 10 plies before the 100-ply draw.
- **FINAL (#1301).** Neither side has a legal move: the game is a draw (section 7).
- **FINAL.** Draw offers do not exist.
- **FINAL.** Repetition and the 100-ply rule apply in hot-seat, online 1v1 and PvE. In battle royale they do not apply (game-design section 5.3: the breach ends stalling).
- **FINAL.** PvE: a draw counts as a loss for the player.
- **OPEN-12.** Resign is not defined in any source. Not in v1 unless an owner decides.

## 10. Mode deltas

Every mode uses the engine of sections 1 to 9. A mode adds rules, it never changes a move or a push.

### 10.1 Hot-seat

- Two players, one screen.
- Layout: standard (FINAL), Belgian daisy (FINAL).
- Undo of the last move before confirm: a UI rule, not a game rule. **FINAL.**
- Win and draw: sections 6 and 9.

### 10.2 Online 1v1

- Same rules as hot-seat.
- **FINAL.** No clock in v1. A timeout claim is planned for later: the slow side loses if it does not move within a 10 s grace after the other side's claim. **TUNE** for 10 s.
- **FINAL.** Rematch swaps colours.
- **FINAL.** No draw offers. Draws come only from sections 9 rules.
- **FINAL.** Every peer validates every move. A peer that sends an illegal move is dropped from the game (tech.md section 6).
- **FINAL.** A state hash mismatch after a move pauses the game and shows the divergence.
- Disconnect: the seat and keypair are kept for a grace period of 60 s to reconnect to the same room (**TUNE**, tech.md section 6). After the grace period, the result is **OPEN-11**.

### 10.3 Souls-like PvE

Player (Black, 14 marbles on the standard layout unless the boss says otherwise) against one boss. Win: 6 boss marbles ejected. Loss: 6 player marbles ejected, or a draw (**FINAL**).

Boss rule hooks run inside `apply`, so the AI search sees them. A hook removing a marble counts toward the ejected count of the side that loses the marble's opponent. For example, a player marble removed by a hook raises the boss's ejected count. **PROPOSAL, OPEN-13.**

Phases trigger when the boss's marble count reaches a threshold (The Hull, The Echo, The Alien: when the player's ejections reach one, game-design section 7.7), shown on the HUD as notches. **TUNE** for every threshold below.

Hooks, from game-design section 7 (starting values):

- **Hull** (#43): one cell cracks at a time, picked by the seeded PRNG, and vanishes 2 player turns later; a marble on it is removed. Boss search depth 3. Phases by the player's ejections: P1 a rim cell every 4 turns, P2 (3 ejections) a cell off the rim every 4 turns, P3 (5 ejections) any cell every 2 turns.
- **Choir** (#44, #747): the standard board. The boss has 3 armies of 6 marbles (Alto, Tenor, Bass) in triangles, the player the standard 14. Each boss turn only one army moves, in a fixed cycle. Phase: after 3 ejections the army with the fewest marbles is removed (a tie by the fight seed), the other two alternate. Phase: after 5 ejections the weakest of the two is removed too and the last army moves twice each boss turn. Removed marbles are not ejections; the player wins at 6 ejections, the boss at 6.
- **Chaplain** (#45, #748): at the end of every ply, a marble touching 4 or more marbles of the other side changes side, for both sides. A flip is not an ejection and costs nothing. Phase after 4 player ejections, once: the boss turn that follows announces a martyr (the boss marble touching the most player marbles, the seed breaking a tie); at the end of the next boss turn it explodes if it is still a boss marble: every adjacent player marble flips, the martyr is removed and counts as a player ejection. No third phase.
- **Echo** (#46): after each player move, the boss plays the point reflection of that move if it is legal, otherwise its AI picks a move. Mirrored moves go through the normal validator. The phases (3 and 5 ejections) change nothing of this rule.
- **Ballast Mind** (#47, #749): radius 5 board, 6 symmetric void pillars. Boss 16 marbles, player 16 (#838). Boss search depth 5. Phases by the player's ejections: P2 after 3, P3 after 5. Each side wins at 12 ejections (#1209). Every 2 turns, at the end of the boss turn, it borrows one effect of another boss, picked by the seeded PRNG: the Hull's crack (P1 rim, P2 inner, P3 any cell), the Pulsar's pulse (random direction, force 2, 3, infinite), the Magnetizer's polarity (one marble, then the settle) or the Chaplain's conversion check (threshold 4, no martyr). The Hull's timers tick on every player turn.

### 10.4 Battle royale

- **FINAL.** 3 to 6 players. **TUNE** for the default of 6, with bots filling empty seats.
- **FINAL.** Arena: hex radius 8, 217 cells.
- **FINAL (#610, owner request, lead decision).** The arena has a hole of radius 1 in its centre: the centre cell and its 6 neighbours are void from round 1 (`royale::start`), so 210 cells are left to play on. A void cell is off the board, so a push onto the hole ejects, credited as any push. Nobody can sit in the centre where nothing can move them.
- **TUNE.** 10 marbles per player (game-design open question Q3).
- **FINAL (OPEN-5, lead decision on #494).** Start position (`royale::start`): 6 wedges of 10 cells, one centred on each rim side. Wedge 0 sits on the bottom side (r = 8, Black's side as in section 2.1), in rows of 3, 4 and 3 from the rim inwards, symmetric about the middle of the side. Wedge `k` is wedge 0 turned `k` times by 60 degrees about the centre, `(q,r) -> (-r,q+r)` (clockwise on screen, E goes to SE). With 6 seats the start is 6-fold symmetric.

  | Wedge | Cells |
  |---|---|
  | 0 (bottom) | (-5,8) (-4,8) (-3,8) (-5,7) (-4,7) (-3,7) (-2,7) (-4,6) (-3,6) (-2,6) |
  | 1 (bottom left) | (-8,3) (-8,4) (-8,5) (-7,2) (-7,3) (-7,4) (-7,5) (-6,2) (-6,3) (-6,4) |
  | 2 (top left) | (-3,-5) (-4,-4) (-5,-3) (-2,-5) (-3,-4) (-4,-3) (-5,-2) (-2,-4) (-3,-3) (-4,-2) |
  | 3 (top) | (5,-8) (4,-8) (3,-8) (5,-7) (4,-7) (3,-7) (2,-7) (4,-6) (3,-6) (2,-6) |
  | 4 (top right) | (8,-3) (8,-4) (8,-5) (7,-2) (7,-3) (7,-4) (7,-5) (6,-2) (6,-3) (6,-4) |
  | 5 (bottom right) | (3,5) (4,4) (5,3) (2,5) (3,4) (4,3) (5,2) (2,4) (3,3) (4,2) |

  Seats `s0 ... s(N-1)` take the wedges in this order: 3 seats `0, 2, 4` (alternating), 4 seats `0, 1, 3, 4` (the two empty wedges are opposite), 5 seats `0` to `4`, 6 seats `0` to `5`. Seat colours in seat order: Black, White, then seats 3 to 6. Fewer than 3 or more than 6 seats is refused.

**Round structure (FINAL, game-design option C):** all players commit at once, then reveal, then the round resolves.

1. **Commit**: each peer broadcasts a signed hash of its order and nonce.
2. **Reveal**: each peer broadcasts order and nonce. A missing or bad reveal counts as a hold, and the sender is flagged.
3. **Resolve**: orders are applied one by one in the initiative order. Each order is validated at its turn, against the state produced by the orders before it.
4. An order that is illegal at its turn **fizzles**: it counts as a pass. The player loses tempo only. **FINAL.**
5. **Round timer**: 15 s (**TUNE**) to commit, counted on each peer from the coordinator's round-start message as it reached that peer (**FINAL**, OPEN-2 resolved in #504, tech.md section 6).

**Initiative order (FINAL, OPEN-10, lead decision on #495).** Seats in list order `s0 ... s(N-1)`. Round `k` (starting at 1) starts at seat `s((k-1) mod N)` and goes round the list. Every player leads once every N rounds.

**Same-cell conflict (FINAL, OPEN-9, lead decision on #495).** Two orders target one cell. The one resolved first takes it. The second is validated at its turn, so if it is now illegal, it fizzles.

**Resolution (FINAL, `royale::resolve_round`).** The function is pure: the same state and the same set of orders give the same state, hash and log in whatever order the orders are listed. At most one order per seat; an order for a seat the game does not have, or a second order for one seat, is refused. A seat with no order holds. At its turn, a seat with no marble left is out and its order is ignored, even if it lost its last marble earlier in the same round. Each move makes its seat the last toucher of every marble it shifts (its own group and the run it pushes), and an ejection is credited to that seat. The round log lists every seat in initiative order with its outcome (applied, fizzled with the reason, held, or out) and the seat whose marble its move ejected, if any.

**Hull breach (TUNE for every number):**

| Ring (radius) | Cracks at round | Void at round |
|---|---|---|
| 8 | 12 | 13 |
| 7 | 18 | 19 |
| 6 | 24 | 25 |
| 5 | 30 | 31 |
| 4 | 36 | 37 |
| 3 | 42 | 43 |
| 2 | 45 | 46 |

- Rounds 1 to 11: safe.
- **FINAL (OPEN-6, lead decision on #496, ring 2 last since #610).** After radius 3, a ring cracks every 3 rounds down to ring 2, the last ring around the hole: its void at round 46 ends every game, with no round cap.
- **FINAL (`royale::resolve_round`, #496).** The breach runs at the end of a round, after every order. First the cracked cells go void (`Board::void`) with their marbles, then the ring the table schedules for that round cracks. The cracked cells are in `board().cracks()`, each with 1 round left, for the whole next round: the warning. A void cell is off the board, so a push onto it ejects.
- A marble on a cracked cell is not safe. It is removed when the ring goes void.
- Cracks glow and show a countdown.

**Blocked seat (FINAL, #1301).** A seat with marbles but no legal move holds: its turn in the initiative order is skipped, as for any hold. The bots hold by rule, and the player's Hold (or the round timer online) holds for it.

**Elimination.** **FINAL.** At 0 marbles a player is out. Its marbles vanish at once. Eliminated players spectate.

**Win.** **FINAL.** The game is over when at most one player has marbles; `resolve_round` then refuses any further round. The last player with marbles wins. **FINAL (OPEN-7 tie, lead decision on #496):** when a void takes the last marbles of every player left, they are ranked by the marbles each held before it, then by ejections credited (the void's own credits included); a tie still standing goes to the player first in that round's initiative order (lead decision on #641), so a game always has exactly one winner (`Royale::winners`).

**Placement and points (FINAL, OPEN-7, lead decision on #497, `Royale::standings`).** The order of elimination sets the places: the seat left with marbles is first, then the others from the last out to the first out. Pushes resolve one by one and eject one marble each, so only a void puts several seats out at once; those are ranked by the tie rule above (marbles lost to that void, then ejections credited), and a tie still standing shares the place, the next seat skipping the shared places (1, 2, 2, 4). Only first place takes the initiative tie-break (#641): the winner is first alone and the others of its tie share second. Each seat scores its place's points, the same for every seat of a shared place, plus 1 per ejection credited by the end of the game. N players take the first N - 1 values of 10, 6, 4, 2, 1, then 0 for last:

| Players | Places 1 to N |
|---|---|
| 3 | 10, 6, 0 |
| 4 | 10, 6, 4, 0 |
| 5 | 10, 6, 4, 2, 0 |
| 6 | 10, 6, 4, 2, 1, 0 |

**Credit rule (FINAL).** The last player whose move touched a marble gets the ejection. **FINAL (OPEN-8, #496):** a marble removed by the breach is credited to its last toucher, and to nobody when no move touched it or its last toucher is its owner.

**Sumito (FINAL).** Section 5 applies against any opponent. The opponent run may mix colours: every marble that is not the mover's counts toward `m`, and only a marble of the mover blocks the push (lead decision on #493, literal reading of section 5 rule 2). So 3 marbles push a White marble then a seat 3 marble (3v2), and 2 cannot (2v2).

**Bots (FINAL).** A bot's order is a pure function of the round-start state and the seed, computed before the reveal. A bot cannot see human orders. Built in #498 (`royale::bot::order(state, seat, seed)`), with no pull toward the centre since #610: it ejects a marble if it can (off the rim or into the hole), else it plays the move that best keeps its marbles off cracked cells and edge cells (next to the rim or the hole) and pushes opponent marbles onto them, the seed breaking ties, and holds when no move beats staying put.

**Anti-kingmaking check (TUNE).** In 10 000 bot games, the final-two leader loses to a dying third player in under 1 game in 5, measured against option A as a baseline. `cargo run --release --example royale_sim` measures it (#498). The dying third is the seat of the last three with the worst place, so two of them going out in the same void are ranked by the breach tie rule (#547). It also counts the games whose first place is shared, which must be none since the initiative tie-break (#610, #641).

## 11. Numbers index

Every number in this spec is tagged FINAL or TUNE where it appears. The FINAL numbers are: board radius 4 (61 cells), 6 directions, group size 1 to 3, 6 ejections to win, 3 repetitions for a draw, 100 plies for a draw (decided), BR 3 to 6 players, BR radius 8 (217 cells), BR placement points. The TUNE numbers are: BR round timer, BR marbles per player, the breach schedule, hook intervals and thresholds, boss depths, the 10 s clock grace, the 60 s disconnect grace, and the HUD warning at 10 plies.

## 12. Examples

Each example below is a numbered block with a precondition, an action and an expected result. "Only the marbles listed exist" unless the example says otherwise. Ejected counts are given where they matter.

**Example 1 (single marble, SE).**
**Given** Black `(0,0)`, White `(4,-4)`. Black to move.
**When** Black moves `(0,0)>SE`.
**Then** the move is legal. Black is at `(0,1)`. Turn passes to White.

**Example 2 (single marble, NE).**
**Given** Black `(0,0)`, White `(4,-4)`. Black to move.
**When** Black moves `(0,0)>NE`.
**Then** the move is legal. Black is at `(1,-1)`.

**Example 3 (inline pair, E, empty cells).**
**Given** Black `(-1,2)(0,2)`, White `(4,-4)`.
**When** Black moves `(-1,2)(0,2)>E`.
**Then** the move is legal. Black is at `(0,2)(1,2)`.

**Example 4 (inline trio, E).**
**Given** Black `(-2,2)(-1,2)(0,2)`, White `(4,-4)`.
**When** Black moves `(-2,2)(-1,2)(0,2)>E`.
**Then** the move is legal. Black is at `(-1,2)(0,2)(1,2)`.

**Example 5 (broadside pair, SE, empty targets).**
**Given** Black `(-1,2)(0,2)`, White `(4,-4)`. Cells `(-1,3)` and `(0,3)` are empty.
**When** Black moves `(-1,2)(0,2)>SE`.
**Then** the move is legal. Black is at `(-1,3)(0,3)`. The move is broadside, since SE is not on the E-W axis.

**Example 6 (broadside onto own marble).**
**Given** Black `(-1,2)(0,2)(0,3)`, White `(4,-4)`.
**When** Black moves `(-1,2)(0,2)>SE`.
**Then** the move is illegal, because `(0,3)` holds an own marble. Position unchanged.

**Example 7 (broadside onto opponent).**
**Given** Black `(-1,2)(0,2)`, White `(0,3)`.
**When** Black moves `(-1,2)(0,2)>SE`.
**Then** the move is illegal, because a broadside never pushes. Position unchanged.

**Example 8 (broadside off the board).**
**Given** Black `(0,-4)(1,-4)`, White `(4,-4)`.
**When** Black moves `(0,-4)(1,-4)>NW`.
**Then** the move is illegal: the targets `(0,-5)` and `(1,-5)` are off the board.

**Example 9 (select 4 in a line).**
**Given** Black `(-4,1)(-3,1)(-2,1)(-1,1)`, White `(4,-4)`.
**When** Black selects all four marbles on the E-W axis.
**Then** the selection is refused. A group is at most 3 marbles.

**Example 10 (select a triangle).**
**Given** Black `(0,0)(1,0)(0,1)`, White `(4,-4)`.
**When** Black selects all three marbles.
**Then** the selection is refused. The three marbles are not on one axis.

**Example 11 (select with a gap).**
**Given** Black `(-1,2)(1,2)`, White `(4,-4)`. Cell `(0,2)` is empty.
**When** Black selects `(-1,2)` and `(1,2)`.
**Then** the selection is refused. The marbles are not contiguous.

**Example 12 (inline move off the board, no opponent).**
**Given** Black `(4,0)`, White `(-4,4)`.
**When** Black moves `(4,0)>E`.
**Then** the move is illegal. The target `(5,0)` is off the board and there is no opponent to push.

**Example 13 (push 1v1 is illegal).**
**Given** Black `(0,0)`, White `(1,0)`. Cell `(2,0)` is empty.
**When** Black moves `(0,0)>E`.
**Then** the move is illegal. One marble cannot push one marble.

**Example 14 (push 2v2 is illegal).**
**Given** Black `(0,0)(1,0)`, White `(2,0)(3,0)`. Cell `(4,0)` is empty.
**When** Black moves `(0,0)(1,0)>E`.
**Then** the move is illegal. The group is not strictly larger than the run.

**Example 15 (push 2v1 into an empty cell).**
**Given** Black `(0,0)(1,0)`, White `(2,0)`. Cell `(3,0)` is empty.
**When** Black moves `(0,0)(1,0)>E`.
**Then** the move is legal. Black is at `(1,0)(2,0)`, White is at `(3,0)`. No ejection.

**Example 16 (push 3v2 into an empty cell).**
**Given** Black `(-1,0)(0,0)(1,0)`, White `(2,0)(3,0)`. Cell `(4,0)` is empty.
**When** Black moves `(-1,0)(0,0)(1,0)>E`.
**Then** the move is legal. Black is at `(0,0)(1,0)(2,0)`, White is at `(3,0)(4,0)`. No ejection.

**Example 17 (push 3v2 ejects one marble at the rim).**
**Given** Black `(0,0)(1,0)(2,0)`, White `(3,0)(4,0)`.
**When** Black moves `(0,0)(1,0)(2,0)>E`.
**Then** the move is legal. The White marble at `(4,0)` is pushed to `(5,0)` and ejected. Black's ejected count rises by 1. Black is at `(1,0)(2,0)(3,0)`, White is at `(4,0)`.

**Example 18 (push 2v1 ejects at the rim).**
**Given** Black `(2,0)(3,0)`, White `(4,0)`.
**When** Black moves `(2,0)(3,0)>E`.
**Then** the move is legal. White's only marble is ejected. Black is at `(3,0)(4,0)`. Black's ejected count rises by 1.

**Example 19 (push blocked by own marble behind).**
**Given** Black `(0,0)(1,0)(3,0)`, White `(2,0)`.
**When** Black moves `(0,0)(1,0)>E`.
**Then** the move is illegal. The cell behind the run, `(3,0)`, holds an own marble.

**Example 20 (push along NE into an empty cell).**
**Given** Black `(0,0)(1,-1)`, White `(2,-2)`. Cell `(3,-3)` is empty.
**When** Black moves `(0,0)(1,-1)>NE`.
**Then** the move is legal. Black is at `(1,-1)(2,-2)`, White is at `(3,-3)`.

**Example 21 (a far own marble does not block a push).**
**Given** Black `(-1,0)(0,0)(1,0)(4,0)`, White `(2,0)`. Cell `(3,0)` is empty.
**When** Black moves `(-1,0)(0,0)(1,0)>E`.
**Then** the move is legal. Black is at `(0,0)(1,0)(2,0)(4,0)`, White is at `(3,0)`. The own marble at `(4,0)` is not part of the push.

**Example 22 (a plain move next to an opponent is not a push).**
**Given** Black `(0,0)(1,0)`, White `(3,0)`. Cell `(2,0)` is empty.
**When** Black moves `(0,0)(1,0)>E`.
**Then** the move is legal. Black is at `(1,0)(2,0)`. White is unchanged. No push happens because the leading cell was empty.

**Example 23 (sixth ejection wins).**
**Given** Black `(2,0)(3,0)`, White `(4,0)`. Black's ejected count is 5.
**When** Black moves `(2,0)(3,0)>E`.
**Then** the ejection makes Black's count 6. Black wins at once. The game is over.

**Example 24 (move out of turn).**
**Given** the standard start layout (section 2.1), Black to move.
**When** White moves `(4,-4)>W`.
**Then** the move is refused, because it is not White's turn. Black still to move.

**Example 25 (turn passes after a move).**
**Given** Black `(0,0)`, White `(4,-4)`. Black to move.
**When** Black moves `(0,0)>SE`, then White moves `(4,-4)>W`.
**Then** Black is at `(0,1)`, White is at `(3,-4)`. Black is to move.

**Example 26 (threefold repetition is a draw).**
**Given** Black `(0,0)`, White `(4,-4)`. Black to move. This is position P0, occurrence 1.
**When** the plies are: Black `(0,0)>SE`, White `(4,-4)>W`, Black `(0,1)>NW`, White `(3,-4)>E`, and the same four plies again.
**Then** P0 occurs for the second time after 4 plies (the game goes on, see example 27) and for the third time after 8 plies. The game is a draw immediately after the 8th ply.

**Example 27 (second occurrence does not end the game).**
**Given** the position of example 26 after 4 plies, P0 at occurrence 2.
**When** Black plays `(0,0)>SE`.
**Then** the move is legal. The game continues. No draw.

**Example 28 (100th ply with no ejection is a draw).**
**Given** Black `(0,0)`, White `(4,-4)`. Black to move. The no-ejection counter is 99.
**When** Black moves `(0,0)>SE`.
**Then** the counter reaches 100. The game is a draw.

**Example 29 (99th ply does not end the game).**
**Given** Black `(0,0)`, White `(4,-4)`. Black to move. The no-ejection counter is 98.
**When** Black moves `(0,0)>SE`.
**Then** the counter is 99. The game continues.

**Example 30 (an ejection resets the counter).**
**Given** Black `(2,0)(3,0)`, White `(4,0)`. Black's ejected count is 0. The no-ejection counter is 99.
**When** Black moves `(2,0)(3,0)>E`.
**Then** White's marble is ejected. The counter resets to 0. Black's ejected count is 1. The game continues.

**Example 31 (standard start has 14 and 14 marbles, all cells valid).**
**Given** the standard layout of section 2.1.
**When** the cells are counted and checked against section 1.
**Then** Black has 14 cells, White has 14 cells, all 28 cells are on the board, and no cell is in both lists.

**Example 32 (Belgian daisy start has 14 and 14 marbles).**
**Given** the Belgian daisy layout of section 2.2.
**When** the cells are counted and checked against section 1.
**Then** Black has 14 cells, White has 14 cells, all 28 cells are on the board, and no cell is in both lists.

**Example 33 (Hull: a marble on a vanishing cell is removed).**
**Given** PvE, Hull boss, phase 1. Black `(4,-3)`, White boss marbles elsewhere. The cell `(4,-3)` vanishes at the end of this ply.
**When** the ply ends.
**Then** the Black marble is removed. The boss's ejected count rises by 1. (PROPOSAL, OPEN-13.)

**Example 34 (Chaplain: 3 boss neighbours flip a marble).**
**Given** PvE, Chaplain boss. Black `(0,0)`. White boss marbles `(1,0)(1,-1)(0,-1)`. These are the three neighbours of `(0,0)` held by the boss.
**When** the boss turn ends.
**Then** the marble at `(0,0)` becomes a boss marble. Black's on-board count drops by 1, White's rises by 1. No ejection.

**Example 35 (Chaplain: 2 boss neighbours do not flip).**
**Given** PvE, Chaplain boss. Black `(0,0)`. White boss marbles `(1,0)(1,-1)`.
**When** the boss turn ends.
**Then** nothing flips. The marble at `(0,0)` stays Black.

**Example 36 (Echo: point reflection of a move).**
**Given** PvE, Echo boss, phase 1. Black `(0,2)`, White `(0,-2)`. Cells `(0,3)` and `(0,-3)` are empty.
**When** Black moves `(0,2)>SE`.
**Then** the move is legal and Black is at `(0,3)`. The Echo plays the mirror, `(0,-2)>NW`, which is legal because `(0,-3)` is empty. White is at `(0,-3)`.

**Example 37 (battle royale: a fizzled order).**
**Given** battle royale, 3 players in seat order P1, P2, P3. Round 1. P1 `(0,0)`, P2 `(2,0)`, P3 `(-5,0)`.
**When** P1 orders `(0,0)>E`, P2 orders `(2,0)>W`, P3 holds. Round 1 initiative: P1, P2, P3.
**Then** P1's move is legal: P1 is at `(1,0)`. P2's order targets `(1,0)`, now a single own marble of P1, so the push is 1v1 and illegal. P2's order fizzles and counts as a pass. P2 stays at `(2,0)`.

**Example 38 (battle royale: initiative rotates).**
**Given** battle royale, seats P1, P2, P3.
**When** the initiative order is computed for rounds 2 and 4.
**Then** round 2 is P2, P3, P1. Round 4 is P1, P2, P3.

**Example 39 (battle royale: a marble on the outer ring is removed).**
**Given** battle royale. The radius 8 ring cracked at round 12. P1 has a marble at `(8,0)`.
**When** round 13 resolves.
**Then** the ring is void. The marble at `(8,0)` is removed. Its last toucher gets the credit, unless it is P1 or nobody touched it (OPEN-8, FINAL). TUNE for the round numbers.

**Example 40 (battle royale: credit goes to the last toucher).**
**Given** battle royale, P1 `(0,0)(1,0)(2,0)`, P2 `(3,0)(4,0)`, P3 elsewhere. Round 1, P1 orders `(0,0)(1,0)(2,0)>E`, P2 holds.
**When** round 1 resolves.
**Then** the push is legal (3v2 at the rim). P2's marble at `(4,0)` is ejected. P1, the last player whose move touched it, gets the ejection credit (FINAL credit rule, game-design section 6).

## 13. Open conflicts

These are raised in the PR body. Owners decide. Nothing here was picked silently.

- **OPEN-1. Draw at 100 plies.** The task decision says draw. game-design.md section 5.2 says the 100-ply end is decided by ejections, then centrality, then draw. Pick one, then update the other doc.
- **OPEN-2. Battle royale round timer.** Resolved in #504: 15 s (TUNE) from the coordinator's round-start message, section 10.4 is FINAL.
- **OPEN-3. Who moves first.** No source. PROPOSAL: Black.
- **OPEN-4. Belgian daisy coordinates.** Resolved in #69: checked against three diagrams, section 2.2 is FINAL.
- **OPEN-5. Battle royale wedge coordinates.** Resolved in #494: section 10.4 is FINAL.
- **OPEN-6. Battle royale rings below radius 3.** Resolved in #496: a ring every 3 rounds down to the centre cell, down to ring 2 since the hole of #610 (section 10.4, FINAL).
- **OPEN-7. Battle royale ties and placement tables.** Resolved: the tie at breach end in #496, the places, shared places and tables for 3 to 6 players in #497 (section 10.4, FINAL).
- **OPEN-8. Credit for breach ejections.** Resolved in #496: last toucher if any and not the owner, else nobody (section 10.4, FINAL).
- **OPEN-9. Same-cell conflict in battle royale.** Resolved in #495: first in initiative wins, the second fizzles (section 10.4, FINAL).
- **OPEN-10. Initiative formula.** Resolved in #495: rotate by round (section 10.4, FINAL).
- **OPEN-11. Online 1v1 after the 60 s grace.** Forfeit or wait? Not defined.
- **OPEN-12. Resign.** Not defined.
- **OPEN-13. Credit for boss-hook removals in PvE.** PROPOSAL: a player marble removed by a hook raises the boss's ejected count, and the reverse.

Also to check: SPEC.md section 2 still says "Draw / anti-stalling rule: open question". It should point to this file once an owner accepts it.

## 14. Done checklist (issue #59)

- Board, cell naming, notation, both start layouts as coordinate lists: section 1 and 2.
- Core rules: sections 3 to 7.
- Edge cases with expected results: section 8, examples in section 12.
- End of game: section 9 (draw decision applied, conflict OPEN-1).
- Mode deltas: section 10.
- At least 30 numbered examples: section 12 has 40.
- Every number marked FINAL or TUNE: sections 9, 10 and 11.
- Consistency with game-design.md and tech.md: conflicts in section 13.
- No code: this is a spec only.
