# Rogue-lite run (#797)

A secondary mode, like the boss fights (#934): a branching run of fights where the army is the deck.
The core of the game stays Abalone 1v1. Owner request of 2026-10-28, rules from feature #797.

## 1. The mode

- **Run**: 3 acts, each a branching map of nodes the player walks through, top to bottom. An act
  has 3 rows of nodes then its boss: 12 nodes on a path through a run, the bosses included.
- **Nodes** (section 7): fight (the bot), elite (a stronger bot, a better reward), rest (marbles
  back up to 14), event (a short text choice with a gain and a cost), boss (a boss of the roster
  at the act's strength, ends the act). No shop and no currency.
- **Army**: the run's progress is the number of marbles the player brings, 14 at the start. A
  fight starts with the army's marbles on the standard layout, the missing ones taken from the
  back row first; the bot has its 14. Marbles ejected in a fight are lost for the run. A won fight
  that does not end the run offers a reward (section 6): a marble or a special marble (Heavy,
  Anchor, Spark), placed before the next fights.
- **End**: the run is lost when a fight is lost (a draw is a loss) or the army is below 4 marbles,
  and won by beating the act 3 boss. The bot wins a fight once the army is down to 3 marbles, so a
  fight never goes on after the run is lost; the army wins at the usual 6 ejections.
- **Meta**: unlocks only, between runs (#801): other special marble types and starting armies,
  never power. Every run starts from zero.
- **Determinism**: the map comes from a run seed (engine splitmix64), so a run can be replayed and
  shared.

## 2. The map

Generated in the engine from the seed (`abalone-core` `run::run_map`, `run_map` on the bridge).
A row has 2 to 4 nodes, the boss row one. The first row of an act is fights; each node of the
two rows after it is a fight, an elite, an event or a rest (2, 1, 2 and 1 chances in 6), its own
draw from the seed and its index in the map, apart from the links: the map's shape is the one of
slice 1, so a run saved before the kinds still walks its map. Between two rows the links are a walk from the
first pair of nodes to the last that steps one row, the other or both at random: every node leads
on, every node of the next row is reached, and no two paths cross. A boss leads to every node of the
next act's first row.

The map screen shows the acts from the top, each node named by its kind (Fight, Elite, Rest,
Event, Boss), the links under the nodes, the path taken in the
accent colour, and enables only the nodes the player may pick: the first row of act 1, then the
links of the last node.

## 3. Saving

The run (seed, army, its special marbles, the nodes picked, the special marbles placed on the fight
on and its moves, a reward waiting to be picked, and an event waiting for its choice) is saved in IndexedDB after
every pick and move, next to the local game, and resumed on load, the fight replayed. A run over is
deleted. Starting another mode abandons the run.

## 4. Slices

1. #798: this spec, the map, the army carried between fights, the run end, the save. Fight and boss
   nodes only; a boss node is a fight against the bot in this slice.
2. #799: special marbles (section 5), and rewards that add them. Part 1 is the engine; part 2 adds
   the placement and reward screens, their looks and the README line.
3. #800: elites, rest, events and act bosses (section 7).
4. #801: unlocks between runs and the run summary.

## 5. Special marbles (#799)

Three special marble types, Heavy, Anchor and Spark, exist only on a board with the **rogue-lite
flag** (Decision #935: a mode may change push weights or legality inside its own fight, behind a
flag). The army's fight has it (`run::army_game`). Without the flag a special marble cannot be
placed (`PlaceError::NotRogueLite`), and every other mode plays bit for bit as before: a digest of
seeded plain games recorded before this change still matches, and on random positions the flag
alone changes no legal move, no board and no credit. Every rule below is a pure function of the
board, in the engine (`moves::apply_for`, `run::carry_specials`), so the bot's search and every
peer see the same result, and `engine_version` is unchanged (no game of another mode changes).

- **A special marble** is a mark on a Black or White marble: it moves with it, in a move, a push or
  a burst, and is gone with it. Any side may hold them; the army's are placed before the fight's
  first move (`Game::place_special`, refused after it with `PlaceError::Started`, and on a cell
  with no marble with `PlaceError::NoMarble`). A marble is one type at most: placing another type
  on it replaces the first. The marks are part of the position (repetition sees them).
- **Heavy**: weighs 2 in a push, on either side, through the engine's weighted push (the rule of
  The Unstable Core's charged marbles): a push needs a strictly heavier pushing group. A lone Heavy
  pushes 1 plain marble; Heavy + 1 (3) pushes 2 plain, not 3 (a tie); Heavy + 2 (4) pushes 3; 2
  plain cannot push a lone Heavy (2 against 2), 3 can. A Heavy never loses weight.
- **Anchor**: never leaves the board. A push that would throw it off is illegal (absent from the
  legal moves, `MoveError::PushBlocked`, like a core of The Overseer); it is still pushed along the
  board, and it shields only itself (a plain marble in front of it in the pushed line still goes
  off). A burst does not throw it off either: it stays.
- **Spark**: when a push throws it off, it bursts from its last cell: each marble on one of the (up
  to 6) neighbour cells moves one cell straight away from that cell. A marble whose cell away holds
  a marble stays; one whose cell away is off the board goes off (an Anchor stays). A Spark thrown
  off by a burst does not burst (no chain). No two neighbours aim at the same cell, so the order,
  by cell (`q` then `r`), changes nothing. The Spark's last cell is a rim cell: at most 4 of its
  neighbours are on the board, the one behind it in the pushed line included (the pusher there
  moves back when the cell behind it is free). Only a marble on a corner can go off, when the Spark
  leaves from the rim cell next to it.
- **Credits**: every marble that leaves the board counts as an ejection for the opponent of its
  colour, so a burst credits the side that ejected the Spark with each opponent marble it throws
  off, and the other side with each of the pusher's own. When both sides reach their count on the
  same ply, the pusher wins.
- **No legal move**: a side to move with no legal move (every move of it would push an Anchor off,
  or it is locked in) loses the fight. The engine has no pass. Only with the flag: plain modes keep
  their rule.
- **The bot** plays these rules in its search: Heavy weights and Anchors in its legal moves, a
  burst's ejections in its score, and a side with no legal move as a loss.
- **Bridge**: `Engine::place_special(q, r, kind)` and `Engine::specials()` (records `[q, r, kind]`,
  `1` Heavy, `2` Anchor, `3` Spark).

## 6. Special marbles on screen (#961)

- **The army's special marbles** are some of its marbles, counted by type with the run, and never
  more than the army: when the army falls below its count, the Sparks go first, then the Anchors,
  then the Heavies. One placed on a fight's board and thrown off is lost for the run.
- **Placement**: a fight of an army that holds special marbles opens on the placement screen,
  beside the board (over its far half when the window is held upright), so the army's marbles stay
  free. The player picks a type, then presses one of the army's marbles: it becomes that type
  (`Engine::place_special`), a second press with the same type takes it back; once none of the
  type is left, it is put down. **A fight holds at most 3 of each type** (the cap of #799's open question 2,
  which keeps the bot's search affordable), and no more than the army holds. The first move starts
  the fight and closes the screen; the placements are saved with the run, so a reload replays them.
- **Reward**: after a won fight that does not end the run, the reward screen offers 3 of: one more
  marble (only below 14) and the three special types (only while the army has a plain marble to
  make special). The offers are a pure function of the run seed and the node won (its index in the
  map, a 32-bit hash), so a run replays them. A special reward makes one plain marble of the army
  special.
- **Looks**: a glyph on the marble, facing the default view, its own shape and colour, both 3:1
  on the player's glass and the enemy's shell, never the colour alone: Heavy a steel square, Anchor
  a blue triangle pointing down, Spark a yellow star. The placement and reward buttons show the same glyphs.
- **The Spark's burst**: a ring in the Spark's colour grows from its last cell and fades
  (450 ms, the Unstable Core's burst), and the page keeps drawing while it plays (#848). Reduced
  motion: no ring.

## 7. Elites, rests, events and act bosses (#800)

- **Elite**: a fight against the bot on the army's board, the bot searching twice the positions of a
  fight's (`ELITE_BUDGET`). Won, the army gets up to 2 marbles back (never above 14) before the
  reward screen, whose line says so.
- **Rest**: no fight; the army is back up to 14 marbles at once, and the run line says it rested.
- **Event**: no fight; the event screen shows one of 5 events, picked by the run seed and the node
  (a 32-bit hash, as the reward offers), with a trade and Leave. The trade is offered only when the
  army can pay it (no fewer than 4 marbles after, no more special marbles than marbles, a special
  marble to give) and gains something; Leave changes nothing.

  | Event | Gain | Cost |
  |---|---|---|
  | Scrap forge | a Heavy | 2 marbles |
  | Mooring clamps | an Anchor | 2 marbles |
  | Live wiring | a Spark | 1 marble |
  | Salvage drone | 2 Sparks | 3 marbles |
  | Cryo pods | 3 marbles (up to 14) | a special marble, the Sparks first, then the Anchors, then the Heavies |

- **Act boss**: a boss of the roster (the bridge's `boss_ids`), dealt by the run seed, a new one each
  act, played as from the boss menu (`Encounter`, its deck, view and rules, its own layout: the army
  count and the special marbles stay off its board) at its act's strength: the boss's search budget
  at 50 %, 100 % and 200 % (the difficulty setting's easy, normal and hard) for acts 1, 2 and 3,
  whatever the setting. Its seed comes from the run seed and the node. Lost (a draw too), the run is
  lost; won, the army loses the marbles the boss ejected and the run goes on (the reward screen), or
  is won after act 3. A boss fight is saved and resumed like the others; one saved before #800 (an
  army fight on the boss node then) does not replay on the boss's board and starts over. The deal
  follows the roster's order and length: a boss added to or moved in the roster deals the bosses of
  a saved run again.
