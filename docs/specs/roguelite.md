---
id: roguelite
type: feature-design
status: draft
title: "Rogue-lite run"
parent: game-design
depends-on: [rules]
---

# Rogue-lite run (#797)

A secondary mode, like the boss fights (#934): a branching run of fights where the army is the deck.
The core of the game stays Abalone 1v1. Owner request of 2026-10-28, rules from feature #797.

## 1. The mode

- **Run**: 3 acts, each a branching map of nodes the player walks through, top to bottom. An act
  has 3 rows of nodes then its boss: 12 nodes on a path through a run, the bosses included.
- **Nodes** (section 7): fight (the bot), elite (a stronger bot, a better reward), rest (marbles
  back up to 14, or a special marble upgraded, section 10), event (a short text choice with a gain and a cost), treasure (a relic, section 9),
  boss (a boss of the roster at the act's strength, ends the act). No shop and no currency.
- **Army**: the run's progress is the number of marbles the player brings, 14 at the start. A
  fight starts with the army's marbles on the standard layout, the missing ones taken from the
  back row first; the bot has its 14 against an elite, 10 against a fight node (#1145): its
  standard layout without the 4 marbles of its front row (`FIGHT_FOES`). Marbles ejected in a fight are lost for the run. A won fight
  that does not end the run offers a reward (section 6): a marble or a special marble (Heavy,
  Anchor, Spark), placed before the next fights.
- **End**: the run is lost when a fight is lost (a draw is a loss) or the army is below 4 marbles,
  and won by beating the act 3 boss. The bot wins a fight once the army is down to 3 marbles, so a
  fight never goes on after the run is lost; the army wins at the usual 6 ejections, also against the 10 marbles of a fight node (4 are left).
- **Meta**: unlocks only, between runs (section 8, #801): other special marble types and starting
  armies, never power. Every run starts from zero.
- **Determinism**: the map comes from a run seed (engine splitmix64), so a run can be replayed and
  shared.

## 2. The map

Generated in the engine from the seed (`abalone-core` `run::run_map`, `run_map` on the bridge).
A row has 2 to 4 nodes, the boss row one. The first row of an act is fights; each node of the
two rows after it is a fight, an elite, an event, a treasure or a rest (2, 1, 1, 1 and 1 chances in
6), its own draw from the seed and its index in the map, apart from the links: the map's shape is the
one of slice 1, so a run saved before the kinds still walks its map. The treasure (#1457) took the
place of a second event in the draw: a run saved before it keeps its other kinds. Between two rows the links are a walk from the
first pair of nodes to the last that steps one row, the other or both at random: every node leads
on, every node of the next row is reached, and no two paths cross. A boss leads to every node of the
next act's first row.

The map screen shows the acts from the top, each node named by its kind (Fight, Elite, Rest,
Event, Treasure, Boss), the links under the nodes, the path taken in the
accent colour, and enables only the nodes the player may pick: the first row of act 1, then the
links of the last node.

## 3. Saving

The run (seed, army, its special marbles, its relics, the nodes picked, the special marbles placed on
the fight on and its moves, a reward waiting to be picked, an event or a rest site waiting for its
choice, and a relic offer waiting to be taken) is saved in IndexedDB after
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
  or it is locked in) passes its turn, as in every mode (rules.md section 7, #1301): it no longer
  loses the fight.
- **The bot** plays these rules in its search: Heavy weights and Anchors in its legal moves, a
  burst's ejections in its score, and a side with no legal move as a pass.
- **Bridge**: `Engine::place_special(q, r, kind)` and `Engine::specials()` (records `[q, r, kind]`,
  `1` Heavy, `2` Anchor, `3` Spark, and the upgraded `4` Heavy+, `5` Anchor+, `6` Spark+ of section
  10).

## 6. Special marbles on screen (#961)

- **The army's special marbles** are some of its marbles, counted by type with the run, and never
  more than the army: when the army falls below its count, the Sparks go first, then the Anchors,
  then the Heavies (the upgraded ones after them, section 10). One placed on a fight's board and thrown off is lost for the run.
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
- **Rest**: no fight; a rest site (section 10): Rest brings the army back up to 14 marbles, and the
  run line says it rested.
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

## 8. Unlocks and the run summary (#801)

Only variety carries over between runs, never power (Decision #934): every starting army has 14
marbles, and an unlock only widens what a run may hold.

- **Progress**: the most acts won in one run (an act boss beaten, 0 to 3), kept in localStorage
  (`ab-alone.roguelite`) next to the boss medals, recorded as soon as an act boss is beaten, so a
  run abandoned afterwards still counts its acts. A run keeps the progress it started with
  (`best`), so its rewards and events replay; a run saved before #801 has everything unlocked.
- **Unlocks**:

  | Acts won in one run | Special marble type in rewards and events | Starting army (14 marbles) |
  |---|---|---|
  | 0 | Heavy | Standard (14 plain) |
  | 1 | Anchor | Bulwark (12 plain, 2 Anchors) |
  | 2 | Spark | Volatile (12 plain, 2 Sparks) |
  | 3 (a run won) | | Ironclad (12 plain, 2 Heavies) |

  A locked type is never a reward offer, and an event that gains it is never dealt.
- **Start**: before the first pick, the map shows the types in the rewards (the locked ones with
  the acts that unlock them) and a button per starting army, the locked ones disabled with what
  unlocks them. The Standard army is picked by default; the choice is saved with the run.
- **Summary**: a run over shows, in place of the map, its line (won or lost, the marbles left), the
  path taken act by act, the fights won and lost (the run's last fight lost when it is lost), the
  army at the end with its special marbles, the unlocks this run earned (or No new unlock), and New
  run.

## 9. Relics (#1457)

A relic is a passive effect for the rest of the run (Slay the Spire's relics). The run holds each
relic at most once, in the order taken, and starts with none: only variety carries between runs
(Decision #934).

- **Sources**: a won elite gives one relic, on top of its marbles and its reward; an act boss beaten
  (not the last, which wins the run) offers 3 to pick 1 from; a **Treasure** node (section 2) holds
  one, with no fight. The relic screen comes before the reward screen and must be taken; the map
  waits for it. The relics offered are dealt from those the run does not hold by the run seed and
  the node (a 32-bit hash, as the reward offers), so a reload offers the same ones; with none left, a
  treasure is empty and an elite or a boss gives none.
- **The 12 relics** and where each acts:

  | Code | Relic | Rule | Where |
  |---|---|---|---|
  | 0 | Gyroscope | once per fight, your first push of a tie (2 against 2, for example) goes through | engine: a push |
  | 1 | Hull plating | the first marble you lose in each fight comes back after it | the end of a fight |
  | 2 | Salvage magnet | a won elite gives 1 more marble back (3, up to 14) | the end of an elite |
  | 3 | Jammer | the bot searches 25 % fewer positions in fights and elites, not against a boss | the bot's budget |
  | 4 | Detonator | your Sparks burst 2 cells | engine: a Spark's burst |
  | 5 | Bunks | a rest also makes a plain marble a Heavy | a rest |
  | 6 | Lucky coin | rewards offer 4 choices | the reward screen |
  | 7 | Bargain | an event trade costs 1 marble less | an event |
  | 8 | Saboteur | the bot has 1 marble fewer in fights and elites (9 and 13) | a fight's board |
  | 9 | Dampener | act bosses play at 75 % of their act's strength (38, 75 and 150 %) | an act boss |
  | 10 | War chest | an act boss beaten gives 2 marbles back (up to 14) | the end of a boss |
  | 11 | Quartermaster | a fight holds 4 of each special marble type | the placement |

  The issue's "rest heals up to 15" does not fit the 14 cells of the army's layout: Bunks gives a
  Heavy instead.
- **In the engine**: the Gyroscope and the Detonator act inside a fight, so the bot plays them in
  its search. The army's relics are set on its fight's board before the first move
  (`Game::set_relics`, `Engine::set_relics(mask)`, bit `code` per relic), behind the rogue-lite
  flag like the special marbles (refused without it, `PlaceError::NotRogueLite`), and part of the
  position. The Gyroscope lets the first push of the army (Black) that ties in weight through and
  is spent by it; a push strong enough without it keeps it. With the Detonator, a burst of the
  army's Spark slides each neighbour up to 2 cells away (a Spark+ 3, section 10): it stops before a marble, goes off past the
  rim, and an Anchor stops on the rim; the enemy's Sparks burst 1 cell. Every other mode plays bit
  for bit as before (section 5's digest).
- **On screen**: the relic bar, in the HUD on the map and in every fight of the run, shows a glyph
  per relic (a line icon in the accent colour), its name and rule as its tooltip on hover, and
  under it once it has the focus (a tap or Tab). The relic screen shows a button per relic offered,
  its glyph, name and rule: "Treasure · a chest holds a relic", "Elite beaten · take its relic" or
  "Boss beaten · pick a relic".
- **Saving**: the relics and a waiting offer are saved with the run; a run saved before the relics
  has none.
- **Later relics** plug in by a code: the shop (#1459) sells relics the run does not hold, the
  commanders (#1464) start with one, and boss relics (#1467) join a boss's offer.

## 10. The rest site (#1458)

A rest that always heals is no choice: as Slay the Spire's campfire (rest or smith), a rest node offers
two actions, and the map waits until one is picked.

- **Rest**: the army is back up to 14 marbles, as before (section 7), and with Bunks a plain marble
  becomes a Heavy (section 9).
- **Upgrade**: one special marble of the army, of the type the player picks (a button per plain type
  the army holds), becomes its upgraded type; the army keeps its count. With no plain special marble
  left (none at all, or all upgraded) Upgrade is disabled and says why: "no special marble left to
  upgrade". No upgrade of an upgraded marble.
- **The upgraded types**, each one rule in the engine, behind the rogue-lite flag like the plain ones
  (section 5), so the bot plays them in its search and every other mode plays bit for bit as before
  (section 5's digest still matches):

  | Code | Type | Rule |
  |---|---|---|
  | 4 | Heavy+ | weighs 3 in a push, on either side: a lone Heavy+ pushes 2 plain marbles, not 3 (a tie); 3 plain cannot push it |
  | 5 | Anchor+ | an Anchor (never leaves the board) that also keeps the marble in front of it in a pushed line from going off: the push is illegal (`MoveError::PushBlocked`). In the pushing group, or in a burst, it shields only itself |
  | 6 | Spark+ | its burst pushes each neighbour up to 2 cells away (section 9's slide) |

  **Spark+ and the Detonator** add up: the Detonator pushes the army's Sparks 1 cell further, so the
  army's Spark+ bursts 3 cells; the enemy's Spark+ bursts 2.
- **In the run**: the army counts its upgraded special marbles apart from the plain ones (`specials`
  holds 6 counts, by code less 1). An upgraded type is a type of its own in the placement (its own
  button, its own cap of 3), in the run line and in the summary ("1 Heavy+"). When the army falls
  below its count or an event takes a special marble, the plain ones go first (Sparks, Anchors, then
  Heavies), then the upgraded ones in the same order. Rewards and events give plain types only.
- **Looks**: an upgraded type keeps its type's glyph and colour, with a `+` on it in the shell's
  near-black, 3:1 on every glyph colour (they are 3:1 on the shell), on the board and on the buttons.
- **Determinism and saving**: the choice is the player's, nothing is drawn. A rest site waiting is
  saved with the run and resumed on load. A run saved before this change (3 counts, no rest flag) loads
  with no upgraded marble and no rest site waiting.
