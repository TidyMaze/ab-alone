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

- **Run**: 3 acts (a fourth with the three keys of section 22), each a branching map of nodes the player walks through, top to bottom. An act
  has 3 rows of nodes then its boss: 12 nodes on a path through a run, the bosses included.
- **Nodes** (section 7): fight (the bot), elite (a stronger bot, a better reward), rest (marbles
  back up to 14, or a special marble upgraded, section 10), event (a short text with 2 or 3 choices, a gain and a cost, some of them a gamble, section 16),
  unknown ("?", it turns into an event, a fight or a treasure when entered, section 16), treasure (a relic, section 9),
  shop (section 12), boss (a boss of the roster at the act's strength, ends the act). The currencies are the
  scrap of section 12 and the cells of section 15, which live and end with the run.
- **Army**: the run's progress is the number of marbles the player brings, 14 at the start. A
  fight starts with the army's marbles on the standard layout, the missing ones taken from the
  back row first; the bot has its 14 against an elite, 10 against a fight node (#1145): its
  standard layout without the 4 marbles of its front row (`FIGHT_FOES`), and 8 in the first fight of the run (act 1, row 1, `FIRST_FOES`, #1502), or the formation and special marbles of section 14. Marbles ejected in a fight are lost for the run. A won fight
  that does not end the run offers a reward (section 6): a marble or a special marble (Heavy,
  Anchor, Spark, and section 13's Magnet, Shield, Bomb, Medic), placed before the next fights.
- **End**: the run is lost when a fight is lost (a draw is a loss) or the army is below 4 marbles,
  and won by beating the act 3 boss. The bot wins a fight at 6 ejections, or once the army is down to 3 marbles when it started with 9 or fewer (`army_game_against`: the army's count is `army - 3`, at most 6), so a
  fight never goes on after the run is lost; the army wins at the usual 6 ejections, also against the 10 marbles of a fight node (4 are left) and the 8 of the first fight (2 are left).
- **Meta**: unlocks only, between runs (section 8, #801, and the Collector's blueprints of section 15): other special
  marble types, relics, tactics and commanders (section 17), and the runes of section 27 that open hidden branches on the map, never power. Every run starts from zero.
- **Determinism**: the map comes from a run seed (engine splitmix64), so a run can be replayed and
  shared.

## 2. The map

Generated in the engine from the seed (`abalone-core` `run::run_map`, `run_map` on the bridge).
A row has 2 to 4 nodes, the boss row one. The first row of an act is fights; each node of the
two rows after it is a fight, an elite, an unknown, a treasure, a rest or a shop (1 chance in 6 each), its own draw from the seed and its index in the map, apart from the links: the map's shape is the
one of slice 1, so a run saved before the kinds still walks its map. The treasure (#1457) took the
place of a second event in the draw and the shop (#1459) the place of a second fight, and the unknown (#1463) the place of the event: a run saved before them keeps its other kinds. Between two rows the links are a walk from the
first pair of nodes to the last that steps one row, the other or both at random: every node leads
on, every node of the next row is reached, and no two paths cross. A boss leads to every node of the
next act's first row.

**The paced map (#1543).** The map has a version, `MAP_VERSION` (`run::run_map_v`, the bridge's `run_map(seed, runes, version)` and
`run_foes(..., version)`), saved with the run as `map`. A new run is dealt the current one (1); a run saved before has none, which is 0:
the map of every earlier run, frozen (a test holds a digest of its kinds, formations and elites for 50 seeds), so a run in progress keeps
the nodes and the bot's armies it was dealt. Version 1 has the same acts, rows, widths and kinds' draws as 0, and three rules on top,
tested over 2000 seeds:

- **A rest or a shop on the way to each boss**: every node of the row before the last has, among the nodes of the last row it leads to,
  a rest or a shop (one is dealt, a rest or a shop by the seed, in place of what the draw gave, when it had none). So a route never runs
  out of a way to recover before an act boss, and the player still chooses whether to take it.
- **At most one elite a row**: the first elite of a row stays, the others are fights (the formation redrawn for the fight).
- **A fork in each act where a pick closes a branch**: in the first two transitions of an act, two neighbouring nodes lead to nodes none
  of which they share, so taking one leaves the other's way behind. The walk of the links is the one of 0 and is redrawn from its
  own draw only when an act has no such fork, so the other acts do not shift.

The Daily's seed makes one map for everyone, so its map is now the paced one: the Daily of a day that was started before this change
keeps the map it was saved with, and a Daily started after it is dealt version 1, so on the day of the change two players may not have
the same map. From the next day every player is dealt version 1. The MCP server and the run simulator (section 30,
`RUN_SIM_MAP=0` plays the map of before) deal version 1 as well.

The map screen (#1468) is an illustrated map. From the top: the run line, a legend (the icon and name of each kind of node, then
what an open ring and a filled one mean), and the acts one under the other, each under a header (`Act 2 · Tundra`: the biome is named
once it is picked, and for every act of a run that has exits, section 18). A node is a round line icon with its name under it (a
fight's crossed swords, an elite's skull with its archetype under the name, a rest's flame, a treasure's chest, a shop's bag, an
unknown's dashed "?", a boss's horned head, larger). The links are drawn under the nodes, in the band between two rows: each leaves from under the labels of its row (the name and, for an elite,
the archetype and `key` under it) and ends above the icon of the next, so none crosses a label (#1543, a test tests it on the
laid-out page). A boss has no link to the next act: its header and the nodes to pick say where it goes on. A shortcut (section 27) goes
down the gap between two nodes of the row it skips. The nodes a pick may take next have an accent
ring, and the links to them are dashed; the nodes taken are filled with the accent colour, the last of them with a second ring, and the
links taken are thick. Only the nodes that may be picked are enabled: the first row of act 1, then the links of the last node. After a
pick, the plate opens on the act of the first of them (#1569): that act's header at the top of the plate, whole, unless the node would
then fall off the bottom, when the node stands at the bottom (before the first pick the commanders stay in view). Held upright on a
phone the plate sits above the thumb dock and scrolls inside itself (#1477); on a desktop it keeps clear of the toolbar. Every node
button keeps its `aria-label` (`Act 1, elite, The Wall`) and `data-node`, and holds its kind in `data-node-kind`.

A pick has its sound: a short soft rising blip on the effects bus (silent with the effects slider at 0 or before the first gesture; the
page reports it in `data-pick`, `pick` or `none`). The node picked last pops (a 0.35 s scale from 1.4 to 1) each time the map is drawn,
and stays still under the Reduced motion setting. Hovering a node, taken or not, or focusing it with the keyboard, previews it in a small
box under it (`data-tip`): its kind, for an elite its archetype and what it brings (`Elite: The Wall (Anchors)`), the formation of its
army when it is known (not for a run saved before the varied enemies), and its act with its biome once picked. An unknown node shows only
its kind: what it hides stays hidden. The box stays inside the plate (`data-tip-side`), and the node under the pointer is drawn over its
neighbours.

## 3. Saving

The run (seed, army, its special marbles, its relics, its tactics, its scrap, the nodes picked, the special marbles placed on
the fight on and its moves, a reward waiting to be picked, an event, a rest site or a shop waiting for its
choice (with what the shop sold), a relic offer waiting to be taken, the keys taken (section 22), the commander picked (section 17), the ascension level (section 20), the line of what the last event told, and its cells, blueprints and Collector, section 15) is saved in IndexedDB after
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
- **Auto-play** (#1489, ui.md section 4.3) is on offer in every fight of a run: fight, elite and act boss (an act
  boss needs that boss's medal). The bot plays the army's side through the search of its own reply, with the run's
  specials and relics, and never a tactic: tactics stay the player's. The map, rewards, rests, shops and events stay the
  player's too, and Auto-play turns itself off when the fight ends.
  A run that used it is marked (#1542, section 21): see `Auto-play used` there. No rule changes on when it is offered.
- **Bridge**: `Engine::place_special(q, r, kind)` and `Engine::specials()` (records `[q, r, kind]`,
  `1` Heavy, `2` Anchor, `3` Spark, the upgraded `4` Heavy+, `5` Anchor+, `6` Spark+ of section
  10, and `7` Magnet, `8` Shield, `9` Bomb, `10` Medic of section 13).

## 6. Special marbles on screen (#961)

- **The army's special marbles** are some of its marbles, counted by type with the run, and never
  more than the army: when the army falls below its count, the Medics, Bombs, Shields and Magnets go first (section 13), then the Sparks, the Anchors,
  then the Heavies (the upgraded ones after them, section 10). One placed on a fight's board and thrown off is lost for the run.
- **Placement**: a fight of an army that holds special marbles opens on the placement screen,
  beside the board (over its far half when the window is held upright), so the army's marbles stay
  free. The player picks a type, then presses one of the army's marbles: it becomes that type
  (`Engine::place_special`), a second press with the same type takes it back; once none of the
  type is left, it is put down. **A fight holds at most 3 of each type** (the cap of #799's open question 2,
  which keeps the bot's search affordable), and no more than the army holds. The first move starts
  the fight and closes the screen; the placements are saved with the run, so a reload replays them.
- **Reward**: after a won fight that does not end the run, the reward screen offers 3 of: one more
  marble (only below 14) and the special types unlocked (section 8; only while the army has a plain marble to
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
- **Event**: no fight; the event screen shows one of the events, picked by the run seed and the node
  (a 32-bit hash, as the reward offers), with a trade and Leave (since #1463 20 events with 2 or 3 choices, section 16,
  reached from a "?" node). A trade is offered only when the
  army can pay it (no fewer than 4 marbles after, no more special marbles than marbles, a special
  marble to give) and gains something; Leave changes nothing.

  | Event | Gain | Cost |
  |---|---|---|
  | Scrap forge | a Heavy | 2 marbles |
  | Mooring clamps | an Anchor | 2 marbles |
  | Live wiring | a Spark | 1 marble |
  | Salvage drone | 2 Sparks | 3 marbles |
  | Cryo pods | 3 marbles (up to 14) | a special marble, the Sparks first, then the Anchors, then the Heavies |
  | Field manual | a tactic (section 11) | 1 marble |
  | Lodestone | a Magnet (section 13) | 2 marbles |
  | Bulkhead | a Shield | 2 marbles |
  | Unexploded charge | a Bomb | 1 marble |
  | Sick bay | a Medic | 2 marbles |

- **Act boss**: a boss of the roster (the bridge's `boss_ids`), dealt by the run seed, a new one each
  act, played as from the boss menu (`Encounter`, its deck, view and rules, its own layout: the army
  count stays off its board; the army's special marbles, relics and tactics come into the fights of the
  bosses that take them, section 28) at its act's strength: the boss's search budget
  at 50 %, 120 % and 200 % (`ACT_PERCENT`; the difficulty setting's easy, normal and hard are 50, 100 and 200 %) for acts 1, 2 and 3,
  whatever the setting; the act 2 figure is the run simulator's (#1537, section 30). Its seed comes from the run seed and the node. Lost (a draw too), the run is
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

  | Acts won in one run | Special marble type in rewards and events | Commander (14 marbles, section 17) |
  |---|---|---|
  | 0 | Heavy | The Captain (14 plain) |
  | 1 | Anchor, Shield | The Warden (12 plain, 2 Anchors) |
  | 2 | Spark, Medic | The Saboteur (12 plain, 2 Sparks) |
  | 3 (a run won) | Magnet, Bomb | The Juggernaut (14 plain, Bunks) |

  A locked type is never a reward offer, and an event that gains it is never dealt.
- **Start**: before the first pick, the map shows the types in the rewards (the locked ones with
  the acts that unlock them) and a button per commander, the locked ones disabled with what
  unlocks them. The Captain is picked by default; the choice is saved with the run (section 17).
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
- **The 12 relics**, where each acts and what it changes about play (#1539). Four of them change a tactic, the others stay a
  plain effect (below):

  | Code | Relic | Rule | What it changes about play | Where |
  |---|---|---|---|---|
  | 0 | Gyroscope | once per fight, your first push of a tie (2 against 2, for example) goes through | you can plan one push that is a tie, once | engine: a push |
  | 1 | Hull plating | the first marble you lose in each fight comes back after it | your first loss of a fight is free, so you can open with a risk | the end of a fight |
  | 2 | Salvage magnet | a won elite turns a plain marble into its own: an Anchor from The Wall, a Spark from The Artificer, a Heavy from The Brute | you pick the elite for the marble you want, on the map | the end of an elite |
  | 3 | Jammer | a Freeze joins your tactics at the start of each fight and elite, but a win gives half the scrap | you plan a double move in every fight, and shop less | the start of a fight, the end of a win |
  | 4 | Detonator | your Sparks burst 2 cells | you place a Spark where its burst reaches the bot's line | engine: a Spark's burst |
  | 5 | Bunks | a rest also makes a plain marble a Heavy | a rest adds weight to your army as well as marbles | a rest |
  | 6 | Lucky coin | an event shows how each of its gambles turns out before you take it | you take the gambles that pay and leave the others | an event |
  | 7 | Bargain | an event trade costs 1 marble less | you accept trades you would have refused | an event |
  | 8 | Saboteur | the bot has 1 marble fewer in fights and elites (9 and 13) | one marble fewer to push off, in every fight | a fight's board |
  | 9 | Dampener | a Fall back joins your tactics at the start of each act boss fight, but act bosses play at 125 % of their act's strength (63, 150 and 250 %) | you try a move against a boss and take it back, against a boss that is stronger | an act boss |
  | 10 | War chest | an act boss beaten gives 2 marbles back (up to 14) | you go into a boss with a thinner army | the end of a boss |
  | 11 | Quartermaster | a fight holds 4 of each special marble type | you build around one type | the placement |

  The lines of the right column are the ones on the relic cards in the game (`RELICS`, the rule in one line, and the tooltip of the relic bar).

  The issue's "rest heals up to 15" does not fit the 14 cells of the army's layout: Bunks gives a
  Heavy instead.
- **The four reworked (#1539)**: Salvage magnet, Jammer, Lucky coin and Dampener were plus or minus one marble, a quarter of the
  bot's search, one choice or a quarter of a boss's strength, and a run holding the Jammer and the Dampener had 56 % of the budgets
  for nothing. Each now alters a tactic, with the game's own pieces (a tactic of section 11, the elite archetypes of section 14, the
  odds of section 16) and no new engine rule, and none adds a mechanic a boss has. They were chosen as the four that give the most
  different play, one at each place of a run: **the map** (Salvage magnet: which elite to go for), **a fight** (Jammer: a Freeze to
  plan), **an event** (Lucky coin: which gamble to take) and **an act boss** (Dampener: a Fall back to probe with). The other eight
  stay a plain effect on purpose: the Gyroscope, the Detonator, the Quartermaster and the Bunks already change the board or the army,
  and Hull plating, Bargain, Saboteur and War chest are small prices a build can use without choosing between them.
  - **Salvage magnet**: a won elite (not a lost one) of a run with the varied armies (section 14) turns one of the army's plain marbles
    into the special marble of the elite's archetype, The Wall's Anchor, The Artificer's Spark, The Brute's Heavy, whatever the types
    unlocked, and gives no marble more than section 7's 2. With no plain marble left, an elite with no archetype or a run saved before
    the varied armies, it gives nothing more. The elites are named on the map, so the marble is a choice of route.
  - **Jammer**: at the start of a fight or an elite (not an act boss: Freeze is not played there, section 28) a Freeze joins the tactics
    the run holds, one at a time (no second while it holds one) and only while the hand has room (3, section 11). A fight, an elite or
    a boss won gives half the scrap (rounded down after ascension level 5's 70 %). The bot's search is no longer cut. The Freeze takes
    a place in the hand of 3, so the Jammer costs the other tactics a place as well as scrap.
  - **Dampener**: at the start of an act boss fight, also after the bonus room (section 26), a Fall back joins the tactics, on the same
    terms. Reinforce and Fall back are played against a boss (section 28), and a Fall back takes back the player's move and the boss's
    answer: the player probes the boss's tell and takes the move back. The boss plays at 125 % of its act's strength, which multiplies
    with the War banner, the Boss breaker and ascension level 7 as before. Three bosses fight without the build (The Echo, The Choir,
    The Swarm, section 28): the Fall back is handed there too and waits in the hand for the next fight, and the map's tip already says
    which boss ends the act and whether it takes the build.
  - **Lucky coin**: a gamble of an event, whose draw is the run seed's, the node's and the choice's (section 16), reads
    "· Lucky coin: it will pay off" or "· Lucky coin: it will go wrong" after what it gives and costs, on the page and in the MCP
    server. A sure choice says nothing. A reward offers 3 again.
  - **Balance** (the run simulator of section 30, **bot numbers only**, The Captain at level 0, 40 seeds, 0 to 39, the command of
    section 30 with `RUN_SIM_LEVELS=0` and `0` for the commander): the simulator plays no relic but the Warden's Hull plating, so
    it does not see the Freeze, the Fall back, the Salvage magnet's marble, the Lucky coin or the scrap (#1598 is the follow-up that
    would), and it gives no win rate by relic. **The numbers do not cover those four effects.** What it can play is the boss's strength
    (`RUN_SIM_PERCENTS`), the one number of the Dampener that changed:

    | Dampener | act bosses at | act 1 | act 2 | the run |
    |---|---|---|---|---|
    | none (the table of section 30, before and after: the simulator plays none of the four relics) | 50, 120, 200 % | 32/40 | 15/32 | 8/40 (20 %) |
    | before (75 %) | 38, 90, 150 % | 31/40 | 18/31 | 14/40 (35 %) |
    | after (125 %) | 63, 150, 250 % | 30/40 | 16/30 | 10/40 (25 %) |

    With the old Dampener the bot cleared 15 points more runs than with none, so a fight bot had every reason to take it; with the new
    one the gain is 5 points, inside the error of 40 runs (about 7 points), and the Fall back, which only the player plays, is not in
    the number. None of the four is plainly the best pick for a bot that fights, as far as the simulator can say; whether a person
    prefers the Freeze, the Fall back, the elite's marble or the foretold gamble is not measured.
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
- **Later relics** plug in by a code: the shop (section 12) sells relics the run does not hold, the
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

## 11. Tactics (#1460)

A tactic is a one-use play of a fight (Slay the Spire's potions): a way out of a bad fight and a reason to
plan. The run holds up to 3 (`MAX_TACTICS`), starts with none (only variety carries between runs,
Decision #934) and loses one when it is played.

- **The four tactics**, each one rule of the engine (`Game::play_tactic`), behind the rogue-lite flag like
  the special marbles (refused on any other board with `TacticError::NotRogueLite`), so the bot's search and
  every other mode play bit for bit as before (section 5's digest still matches). A tactic is the army's
  (Black) and is played on its turn, before a move; the engine refuses it out of turn or once the fight is
  over.

  | Code | Tactic | Rule | Costs the move |
  |---|---|---|---|
  | 1 | Reinforce | a marble joins the army on the first free cell of its back row, in the order of the standard layout (`(-4, 4)`, `(-3, 4)`, `(-2, 4)`, `(-1, 4)`, `(0, 4)`): a function of the board, so a replay puts it on the same cell. Refused when the back row is full. The bot needs one more ejection to win, up to the usual 6, so the army is still 3 marbles short of losing. The marble is the fight's: if it is thrown off it counts as lost like any other, and one that survives is not kept | no |
  | 2 | Freeze | the bot skips its next turn: after the army's next move the turn passes back to it as the engine passes a blocked side (#1301, `Game::pass_turn`, `passed` says White). Refused while a Freeze waits | no |
  | 3 | Swap | two different marbles of the army trade places, one of them special (two plain marbles are identical): the special mark moves with the marble's cell, a special trades with a special. The turn goes to the bot | yes |
  | 4 | Fall back | the army's last move and the bot's answer are undone: the board, the ejections, the Freeze and the Gyroscope as they were before that move, one turn at a time as far back as the fight goes. A Reinforce or a Swap played before that move stays, one after it goes. Refused before the first move | no |
- **In the move list**: a tactic is a record of the move list, 8 integers `[0, code, q0, r0, q1, r1, 0, 0]`,
  the `0` where a move has its marble count (a Swap names its two cells). `Engine.play` takes it like a move,
  `Engine.tactics` says which can be played now (a mask, bit `code - 1`, used by the HUD), so a saved fight
  replays its tactics, the bot's worker included, and the run's `moves` hold them. The client keeps the
  engine as the only judge: a tactic the engine refuses changes nothing and the tactic is kept.
- **Gained**: a won fight's reward screen (section 6) offers one tactic more, dealt by the run seed and the
  node (a 32-bit hash, as the reward offers) as an extra button after the other offers, which are the same as
  before; taking it replaces the reward. It is not offered with 3 held, and a reward is still there for it
  when no other offer is. The **Field manual** event (section 7, a 6th event) teaches one tactic, dealt the
  same way, for 1 marble; its trade is refused with 3 held. The shop (section 12) sells them.
- **On screen**: in the HUD of an army fight a glyph button per tactic held (a line icon in the accent colour,
  3:1 on the plate in both themes), its name and rule as its tooltip (and its accessible name). A tactic the
  engine cannot play now is disabled and dimmed, all of them during the placement of special marbles and a
  replay, and when the bot is to move. Swap is pressed, then the army's two marbles; pressing Swap again
  cancels, and two marbles that cannot swap say so in the HUD line. Act boss fights (an `Encounter`) play
  Reinforce and Fall back only, in the bosses that take the build (section 28).
- **Saving**: the tactics held are saved with the run (`tactics`, the codes in the order gained); a run saved
  before this change loads with none. A Field manual waiting in a save made before this change may show
  another event, as the pool grew.

## 12. Scrap and the shop (#1459)

A currency turns rewards into choices (Slay the Spire's gold, Dead Cells' cells). Owner decision of 2026-11-02: an
in-run economy is approved for the rogue-lite only, and it lifts the "no economy" line of #313.

- **Scrap**: a won fight earns 10, a won elite 20 and a beaten act boss 30 (`SCRAP`), on top of its marbles
  and reward. A lost fight earns none. The run line, in the HUD and on the map, ends with "N scrap" once the
  run holds some.
- **Lost with the run**: scrap is not carried over. A new run starts with none (only variety carries
  between runs, Decision #934), and the summary of a run over says how much was left ("Scrap left: 40, lost
  with the run").
- **The Shop node** joins the map's draw (section 2) and holds no fight. Picking it opens its screen, the map
  waits until Leave. It sells, at prices dealt by the run seed and the node (a 32-bit hash, as the reward offers),
  so a reload sells the same:

  | Id | For sale | Price | Taken when |
  |---|---|---|---|
  | 0 | one marble | 15 to 20 | the army is below 14 |
  | 1 | a special marble of a type unlocked (section 8), plain | 25 to 35 | the army has a plain marble to make special |
  | 2 | a relic the run does not hold (section 9); none for sale with all 12 held | 60 to 80 | always |
  | 3 | a tactic (section 11) | 30 to 40 | fewer than 3 are held |
  | 5 | one flask charge (section 25) | 20 to 30 | fewer than 4 are held |

  Each item is sold once per shop and leaves it once bought. An item that cannot be taken or paid is disabled and
  says why ("army full", "no plain marble left", "hand full", "not enough scrap").
- **Remove**: one special marble of the army, of the type the player picks (a button per type held, upgraded
  types too), becomes a plain marble again for 20 to 30 scrap, once per shop. The army keeps its count. With no
  special marble the button is disabled: "none to remove".
- **Determinism and saving**: scrap, the shop waiting (`shop`) and the ids it sold (`bought`) are saved with the
  run, so a reload shows the same shop as it was. A run saved before this change loads with no scrap and no shop
  waiting. The rules live in the client with the rest of the run; the bridge only draws the Shop node (kind `6`).
- **Not in this slice**: no way to sell or reroll, and no scrap from events.

## 13. Magnet, Shield, Bomb and Medic (#1461)

Three special types run dry fast, so four more open new plans (Slay the Spire's and Dead Cells' variety). Each
is one rule of the engine behind the rogue-lite flag, like section 5's, so the bot plays them in its search, every
peer sees the same result, and every other mode plays bit for bit as before (section 5's digest still matches). A
Bomb's fuse is part of its mark, so it is part of the position too.

| Code | Type | Rule |
|---|---|---|
| 7 | Magnet | after a move that moved it (in the moving group or pushed along), it pulls one enemy marble two cells away in line, the cell between being free, one cell toward it. The first of the six directions in cell order (`q` then `r` of the direction) with such a marble is the one: nothing else is pulled. The pulled marble keeps its mark and is never thrown off by it |
| 8 | Shield | the first push that would move it fails: the push is legal and costs the move, but nothing moves (the pushing group included, no marble goes off, a Gyroscope is not spent) and every Shield in the pushed line becomes a plain marble. A Shield that walks itself, or is moved by a burst or a pull, keeps its mark. A push that is too weak is still refused |
| 9 | Bomb | its side's third turn after the fight starts (a turn is a move of that side, a tactic is not) ends in a burst: the marble leaves the board where it stands, each marble on a neighbour cell moves one cell straight away as a Spark's burst does, and the Bomb is gone. The fuse (3 at the start) loses one at the end of each of its side's moves, and moves with the marble. The marble gone counts as an ejection for the opponent of its colour, with each marble the burst throws off; a Spark it throws off does not burst (no chain), and the Detonator does not touch it |
| 10 | Medic | when it is thrown off the board, by a push or a burst, it comes back once as a plain marble on the first free cell of its side's back row, in the order of the standard layout (Black `(-4, 4)` to `(0, 4)`, White the opposite cells); the row full, it is lost. A Medic that comes back is no ejection for the opponent |

- **Order in a ply**: the move or push, the Magnets that moved pull (in cell order), an ejected Spark bursts, the
  mover's Bombs burn and burst, the Medics thrown off come back. A Bomb's burst counts as an ejection in
  `credits` and in the ply's `ejected` flag, so the fight, the win test and the bot's score see it.
- **"Adjacent" Magnet**: the issue says it pulls "one adjacent enemy marble one cell toward it when that cell is
  free". A marble next to the Magnet has no free cell between, so the rule is read as the marble two cells away in
  line, the cell between free: after the pull it is adjacent.
- **Bridge**: codes `7` to `10` in `Engine::place_special` and `Engine::specials` (a Bomb is `9` whatever its fuse).
- **In the run**: `Run.specials` holds 10 counts, by code less 1 (the 6 of section 10, then Magnet, Shield, Bomb,
  Medic). The new four are plain types: no upgrade at a rest site (Upgrade does not list them), and the placement,
  its cap of 3 a fight, the reward, the shop (with its removal), the run line and the summary treat them as the
  other types. When the army falls below its count or an event takes a special marble, they go first, in the order
  Medic, Bomb, Shield, Magnet, then section 10's order. A Bomb that burst or a Medic that came back is no longer
  special after the fight: the count follows what is on the board, as for a thrown-off Spark.
- **Unlocks**, by acts won in one run (section 8): Shield with the Anchor (1), Medic with the Spark (2), Magnet and
  Bomb after a run won (3). A locked type is never a reward offer, an event or a shop item. Only variety carries
  over, never power (Decision #934).
- **Events**: Lodestone, Bulkhead, Unexploded charge and Sick bay (the table of section 7).
- **Looks**: a flat glyph on the marble, its own shape and colour, both 3:1 on the player's glass and the enemy's
  shell: Magnet a vermillion horseshoe, Shield an orange shield, Bomb a pink disc, Medic a green cross. The
  placement and reward buttons show the same glyphs.
- **Determinism and saving**: the engine rules are pure functions of the board; the rewards, events and shop are
  dealt by the run seed and the node as before. A run saved before this change (3 or 6 special counts) loads with
  none of the new four. Rewards, events and shop items waiting in such a save are dealt from the larger pool, so
  they may show other offers than before the update.
- **The Bomb's fuse** (#1490): the turns of its side left (3 at the start) are drawn on its glyph as a digit in the
  shell's ink (3:1 on the pink, seven bars, not a font), and the HUD line of the fight says it (`Bomb: 2 turns left`,
  `Bombs: 3, 1 turns left`). The bridge's `Engine.fuses()` gives them (`[q, r, turns]` per Bomb); the page never counts
  turns itself.
- **Cues** (#1490), each read from the engine's own result (`client/src/specialcues.ts`), never a rule of its own:
  - **A Bomb's burst** draws the Spark's ring (section 6) in the Bomb's colour over the cell where it stood. Reduced
    motion: no ring.
  - **A Magnet's pull** slides the pulled marble to its new cell with the move, in the time of a move's slide, rolling the
    way it is pulled. Reduced motion: it jumps, as every move does.
  - **A Medic's return** drops the marble onto its back row cell, the Dual Room's returning marble (`DROP_MS`). Reduced
    motion: it is there at once. When two come back in one ply, the first shows the drop.
  - **A Shield that holds a push** flashes: a ring in the Shield's colour on it. Reduced motion: the ring does not grow, it
    shows in place and fades (the Core's reduced burst).
- **Not in this slice**: no upgraded form of the new four.

## 14. Varied enemy armies (#1462)

Every fight against the same 10 or 14 plain marbles felt the same. A fight or an elite node now deals the bot its own
army: a formation, special marbles of section 5 and 13's types and, for an elite, a named archetype. All of it is a
pure function of the run seed and the node (its index in the map), as the reward offers are, so a run replays and a
reload stands the same army. The army still stands on the standard layout whatever the bot does, and every rule of
the special marbles is the engine's, played by the bot's search like the army's.

- **Formations**: `Formation` in `abalone-core::run`, its code on the bridge. Drawn for each fight and elite, equally
  likely, from its own draw apart from the map's shape and kinds (`run::foes_of`). A bot with fewer marbles than the
  formation holds (10 against a fight, 8 in the first one, one fewer with the Saboteur) loses the marbles nearest the centre first (the
  standard layout, its front row first as before).

  | Code | Formation | Cells (White's half) |
  |---|---|---|
  | 0 | Standard | the standard layout, as before |
  | 1 | Belgian daisy | two flowers (a cell and its six neighbours) on the corners of its back edge, centred `(0, -3)` and `(3, -3)` |
  | 2 | German daisy | two flowers on the corners of its sides, centred `(-3, 0)` and `(3, 0)` |
  | 3 | Snake | a chain of 14 along the back edge, then back along the third row and forward along the fourth |
  | 4 | Wedge | a triangle of 5, 4, 3 and 2 marbles, its point toward the army |

  The Belgian daisy of the rules (section 2.2 of rules.md) is a layout for both sides: its White flowers sit on the
  army's own back edge, so the engine's `Board::belgian_daisy` cannot be the bot's alone. The two daisies here are the
  same flower shape set on the bot's half, one pair on the corners of its back edge, one on the corners of its sides.
  No formation has a cell of the army's standard layout, and none touches it at the start.
- **Special marbles by act**: a **fight** holds `act + 1` special marbles (1, 2, 3 in acts 1 to 3), each of a
  different type: the Heavy, Anchor and Spark in act 1, with the Magnet and Shield in act 2, with the Bomb and Medic in
  act 3. They sit on marbles of the formation drawn from the seed and the node. An **elite** holds `act + 2` of its
  archetype's.
- **Elites**: drawn for each elite node, equally likely, named on the map node (under its kind) and in the fight HUD.

  | Code | Elite | Special marbles | Turn it against the bot |
  |---|---|---|---|
  | 1 | The Wall | Anchors | an Anchor never leaves the board: push the others off, six are enough |
  | 2 | The Artificer | Sparks, then as many Bombs (the odd one a Spark) | a Spark thrown off bursts, and its burst can take the bot's own marbles off; a Bomb bursts after the bot's third turn, whoever stands beside it |
  | 3 | The Brute | Heavies | a Heavy weighs 2: push it with a strictly heavier group, or walk the marbles around it |

  An elite stays a fight against the bot at twice its search budget, its reward and the marbles it gives back are
  section 7's.
- **The HUD** names what the fight holds: `act 1 elite · The Artificer · German daisy`, `act 2 fight · Snake` (the
  Standard formation is not named). The marbles carry their glyphs of section 6 whatever side they are on.
- **Bridge**: `run_map` records carry the node's `formation` and `elite` (7 integers a node, see the crate docs);
  `run_foes(seed, node, less)` returns the bot's army of a node, `less` marbles short (the Saboteur) as `[count,
  formation, q, r, kind, ...]`, and `Engine::with_foes(army, plan)` stands it (`Engine::with_army` stands the plain
  army). `engine_version` is unchanged (no game of another mode changes).
- **Saving**: the run keeps an `enemies` flag, on for a run started after this change. A run saved before it loads with
  the flag off and fights the plain army of section 1 on every node, so a fight in progress replays its moves on the
  board it started on.
- **Only variety**: the enemy's armies change what a fight looks like and asks, never what carries between runs
  (Decision #934).

## 15. The Collector, cells and blueprints (#1470)

Dead Cells' risk of losing what is not banked gives a run a stake beyond itself. Owner decision of 2026-11-02: this second
currency is approved. Only variety carries between runs (Decision #934): a blueprint unlocked widens the pools of the
next runs, it never makes a run stronger than another. Everything lives in the client (`collector.ts`, `roguelite.ts`) and
changes no rule of the engine and no code of the bridge's map: the Collector is a room at the act transition, not a node.

- **Cells**: a won fight earns 2, a won elite 4 and a beaten act boss 6 (`CELLS`), on top of its scrap, marbles and reward.
  A lost fight earns none. The run line ends with "N cells" once the run holds some.
- **Blueprints**: 14, each unlocking one item for good (`BLUEPRINTS`, a stable id each, the list only grows at its end).
  A relic or a tactic is locked until its blueprint is banked, except the ones every run has always had:

  | Ids | Blueprint | Where its item acts |
  |---|---|---|
  | 0 to 5 | the relics Lucky coin, Bargain, Saboteur, Dampener, War chest, Quartermaster (section 9, codes 6 to 11) | the relic screens, treasures and the shop |
  | 6, 7 | the tactics Swap and Fall back (section 11) | the reward, the Field manual and the shop |
  | 8 to 13 | the special marbles Anchor, Spark, Shield, Medic, Magnet, Bomb (sections 8 and 13) | rewards, events and the shop |

  A special marble type is also unlocked by the acts won in one run (section 8): a blueprint banked unlocks it at once,
  whatever the acts won. Gyroscope, Hull plating, Salvage magnet, Jammer, Detonator, Bunks, Reinforce, Freeze and Heavy are
  never locked. The pools the sections 6, 9, 11 and 12 deal from, and the events that gain a special marble (section 7),
  hold the items unlocked and no other; a pool dealt before keeps its order, so a run that has everything unlocked deals what
  it dealt before this change.
- **Drops**: a won elite and a beaten act boss drop one blueprint, in the acts that a Collector follows (acts 1 and 2). It
  is dealt from the blueprints the run's pools do not hold, that it does not carry and has not banked, by the run seed and
  the node (a 32-bit hash, as the reward offers), so a reload drops the same one; none when none is left. A fight drops none.
  The relic and reward screens of that elite or boss name it ("Blueprint found"). The blueprint is **carried** with the run.
- **The Collector** is a room after an act boss that is not the last, once its relic and reward screens are done, when the
  run carries a blueprint (otherwise there is nothing to bank and the map goes on). The map waits until Leave. It lists the
  blueprints carried, each for 5 cells (`COLLECT_COST`; disabled with "not enough cells" when the cells fall short). Banking
  one spends the cells and unlocks it **for the next runs**, in the browser at once (`ab-alone.roguelite.blueprints`, a list of
  ids, next to the acts won of section 8), so a run lost later still keeps it. The run in progress keeps the pools it started
  with, so its offers replay. Blueprints and cells left at Leave wait for the next Collector.
- **Lost**: a run lost, or won, with cells or blueprints not banked loses them; the summary says so ("Cells left: 9, lost with
  the run", "Blueprints lost with the run: ...") and lists the ones banked in its unlocks. There is no Collector after act 3, so
  nothing drops in the last act.
- **Start**: before the first pick the map says how many blueprints are left to bank.
- **Saving**: the run saves `unlocked` (the blueprints banked before it started), `cells`, `carried`, `banked`, `drop` (the
  last drop, id + 1) and `collector` (the room waiting). A run saved before this change loads with its relics and tactics
  unlocked (so it deals what it dealt), its special marbles by its acts, and no cells, blueprint or room. A browser with no
  blueprint record, or an invalid one, has none banked.

## 16. Events with several choices, and unknown nodes (#1463)

Five events repeat after two runs, and an event was one trade or Leave. The mode now holds **20 events** (21 with the cursed chest of section 24), each with 2 or
3 choices, the last one always Leave, and a **"?" node** that hides what it is until the player enters it. Every effect
is built from what the run already has: marbles, special marbles, relics, tactics, scrap and healing. Only the rules
change what a run offers, never what carries between runs (Decision #934). Section 7's event table stays the first 10
events, one trade each.

- **The "?" node**: the bridge's kind `7` (`NodeKind::Unknown`, `run_map`), drawn in the place of the event in the node
  draw (section 2: 1 chance in 6, so no map holds the old event kind any more; code `4` stays for the page). When the
  player enters it, it turns into an **event** 7 times in 10, a **fight** twice, a **treasure** once (`became` in
  `roguelite.ts`), drawn from the run seed and the node as the reward offers are (a 32-bit hash), so a reload and a
  replay see the same. A fight it turns into is a fight node of its act: 10 foes (one fewer with the Saboteur), the
  Standard formation and `act + 1` special marbles of `run::foe_plan`, scrap and rewards as a fight's, the Jammer's
  Freeze and halved scrap. The map names it `?` and `Act 1, unknown` (aria-label); the summary of a run over names what it turned into.
- **Choices**: a choice has a verb, what it gives, and for a **gamble** the odds in 100 (`odds`) and what it gives
  otherwise. A gamble is drawn from the run seed, the node and the choice, never twice differently. A button reads
  `Touch the vein · 50 %: +1 Heavy, otherwise -2 marbles`; a sure choice reads `Chip off a shard · +25 scrap, -1 marble`;
  a tactic shows its name, a relic only that there is one.
- **Effects**: marbles up to 14 or down (the Bargain relic takes 1 marble off any cost, as before); one or two special
  marbles of a type; a special marble given (in the order of section 10: the Medics, Bombs, Shields and Magnets first,
  then the plain ones, then the upgraded); a tactic; a relic the run does not hold, dealt by the seed; scrap, more or
  less; the army healed back to 14. A choice is disabled when it cannot be paid (fewer than 4 marbles after, more
  special marbles than marbles, no special marble to give, short of scrap) or asks for a gain and none can be had (a
  full hand, every relic held, a full army); for a gamble, **both** sides must be payable.
- **Told**: the run keeps one line (`told`) of what the last event gave or cost, `Slag-glass vein: it went wrong, -2
  marbles`, shown on the map until the next node is picked. Leave tells nothing. The line holds no markup.
- **The 20 events** (lore from world.md: Ballast, Hollow, the slag-glass, the shelled crew, the ledger). The first 10
  are section 7's and section 13's, one trade each. A type that is not unlocked (section 8) is never dealt: an event
  that can give it is not in the pool.

  | Event | Choices (besides Leave) |
  |---|---|
  | Slag-glass vein | touch it: 50 % a Heavy, else -2 marbles; chip off a shard: +25 scrap, -1 marble |
  | Ledger terminal | read it: a tactic, -1 marble; call the shelled crew back: +2 marbles, -20 scrap |
  | Shelled crewmate | take it along: +1 marble; crack its shell: +30 scrap (from the story's stage 4 it reads "cool it until the shell lets go", the same trade, world.md section 12.9) |
  | Dice | wager 20 scrap: 50 % +40 scrap, else -20; wager a marble: 40 % a relic, else -1 marble |
  | Cold locker | force the latch: 60 % healed to 14, else -1 marble; strip the compressor: +15 scrap |
  | Airlock | step out: 50 % a relic, else -2 marbles; strip the hatch: +15 scrap |
  | Chapel box | give a special marble: a relic; give 25 scrap: a tactic |
  | Furnace vent | warm yourselves: 70 % +4 marbles, else a special marble fuses and is lost; cast a Heavy: +1 Heavy, -1 marble |
  | Foreman crate | pry it open: 60 % +30 scrap and +1 marble, else -1 marble; sell it sealed: +10 scrap |
  | Ship relay | cut the line: +20 scrap; ask it for the way: 50 % a tactic, else -1 marble |

- **Saving**: a run saved before this change loads with `told` empty. Its map is recomputed from the seed: a node that
  was an event is now a "?", the other kinds are unchanged. An event waiting in such a save is dealt from the larger
  pool and may show another event than before the update, as in section 13's save note.
- **Bridge**: kind code `7` on `run_map` records; `run_foes` plans a fight for a `7` node as for a fight node. `engine_version`
  is unchanged (no game of another mode changes).

## 17. Commanders (#1464)

The starting armies of section 8 become **commanders**: a run starts with one, picked on the map before the first node.
A commander is a different start, not a stronger one (Decision #934): all four have 14 marbles, **a starting relic**
(one of section 9's first six, which every run has in its pools) and a **style**, at most 2 special marbles (the Captain and the Juggernaut start with none). Each has a
portrait (a line icon) and a line. Only variety carries over between runs, never power.

| Commander | Unlocked at (acts won in one run, section 8) | Style | Starting relic |
|---|---|---|---|
| The Captain | 0 | 14 plain marbles | Gyroscope |
| The Warden | 1 | 2 Anchors | Hull plating |
| The Saboteur | 2 | 2 Sparks | Detonator |
| The Juggernaut | 3 (a run won) | 14 plain marbles, the Heavies come from its Bunks | Bunks |

- **Tuned (#1632)**: the Juggernaut started with 2 Heavies and cleared act 1 in 52 % of the simulator's level 0 runs (section 30),
  against 28 to 45 % for the others, and 32 % at level 10 against 2 to 5 %: a stronger start. One Heavy did not move level 0 (52 %, 15 % at level 10);
  none did (40 % at level 0, 2 % at level 10), so it starts plain and its Bunks, a Heavy at each rest, are its style (its line: "Starts plain and
  turns every rest into more weight."). The simulator keeps its own copy of the four starts (`COMMANDERS` in `run_sim.rs`) and
  `client/src/runsim.test.ts` checks it equals the page's. A run saved as the Juggernaut before keeps the two Heavies it was saved with.
- **Pick**: the start screen has a button per commander (portrait, name, style and relic; a locked one is disabled with what
  unlocks it), the one picked pressed, and under them its line and what its relic does. A new run starts with the Captain
  picked. Picking another replaces the first one's marbles and relic: nothing of it stays. After the first node, or once the
  run is over, a pick does nothing. The relic is in the relic bar from the start, the Gyroscope and the Detonator are played
  by the engine as any relic (section 9), and a relic the run holds is never offered again.
- **Deterministic**: a commander is a pure choice of the player, so the run is a function of its seed, the commander and
  the moves, and replays. The commander changes no draw of the map, the reward offers or the events.
- **Saving**: the run keeps `commander` (an index, -1 for none). A run saved before this change loads with `-1`: its
  specials and relics stay as saved, so it plays as before.
- **Summary**: a commander is an unlock of section 8 (`The Warden commander`), listed in the run's summary when an act won
  earned it.
- **Turn it against the boss**: not a boss mechanic; no boss has a commander.

## 18. Biomes and exits (#1472)

Dead Cells' branching biomes make the route between acts a choice, not only the nodes inside one. At the end of an act (not
the last) two exits lead to two different biomes for the next. The biomes are the Open world's (`world::Biome`, section 2 of
openworld-terrain.md), the Meadow first. Only variety carries between runs (Decision #934): a biome changes what an act looks
like and asks, never what a run keeps.

- **Act 1 is the Meadow**, the default: no hazard, no signature, the boss dealt as before. It is never an exit. A run started from a
  dungeon gate of the Open world (#1597) begins in the biome of the gate's ground instead (`Run.first`, `biomeOf(run, 0)`): act 1 has
  that biome's look, holes, foes and act boss, and no exit ever offers it again. A run of the mode menu, the Hub or the Daily, and a
  run saved before (no `first`, read as the Meadow), are unchanged.
- **Exits**: `run::exits(seed, act, from)` (`run_exits` on the bridge) returns two different biomes for act `act` (1 or 2), never
  the Meadow, the biome `from` the run leaves nor the biome `first` it began in (`run_exits`' last argument), drawn from the run seed and the act (a pure function, so a run replays).
- **Hazard**: every fight and elite of the act opens the biome's **holes** on the board, cells removed with `Board::void`, the
  rule The Hull and The Ballast Mind already play with (their cracked cells and pillars): no marble walks onto a hole (a move
  there is refused), a marble pushed onto one goes off the board, an ejection for the other side. Each pattern is symmetric
  under the board's point reflection (fair to both sides), in the middle band `|r| <= 1` where no army stands, and a hole is
  never opened on a cell holding a marble (a formation of section 14 that stands there keeps its marble).

  | Biome | Holes (cells) | Signature special marble of its fights | Boss |
  |---|---|---|---|
  | Meadow | none | none | dealt by the seed |
  | Forest | 2 ponds: `(-2, 1)`, `(2, -1)` | Anchor | The Alien |
  | Tundra | a crevasse across: `(-1, 1)`, `(0, 0)`, `(1, -1)` | Shield | The Hull |
  | Desert | 2 sinkholes: `(-1, 0)`, `(1, 0)` | Spark | The Pulsar |
  | Badlands | 4 canyon holes on the flanks: `(-3, 1)`, `(-2, 0)`, `(2, 0)`, `(3, -1)` | Heavy | The Unstable Core |
  | Archipelago | 5 water holes around the centre: `(0, 1)`, `(-1, 0)`, `(0, 0)`, `(1, 0)`, `(0, -1)` | Magnet | The Ballast Mind |

- **Foes**: a fight of a biome always holds its signature among its special marbles (section 14): when the dealt mix lacks it,
  it takes the place of the first kind, the marbles and the other kinds unchanged. An elite keeps its archetype's marbles. The
  signature is one of the first five kinds, which every act from the second deals.
- **Boss**: the act's boss is the biome's, a roster boss at the act's strength (section 7), played on its own board (the holes
  are the fights'). When the roster lacks it the dealt boss stays. The Meadow's act keeps the dealt boss.
- **The exit screen** comes at the transition, after the boss's relic and reward screens and after the Collector (section 15)
  when the run carries a blueprint: the map waits until one exit is picked. Each button names the biome, its holes, its foes and its
  boss.
- **Look**: the page tints the map plate and the board (`body[data-biome]`) with the biome's colour while the run is in it; the
  Meadow has none, and the run line names the biome (`act 2 fight · Tundra · Snake`). The summary lists the biomes of the run.
  The fights of the act are also drawn in the biome's own space (#1551, art.md Decks, `ACT_SPACE`): its light, the colour of the ground and the sky
  round the board and its scatter, the Meadow's included; the act's boss keeps its own boss space, and the violet rim and posts of a run stay. Nothing
  is saved for it (a run loads as before and takes the space of its act).
- **Bridge**: `run_exits(seed, act, from)` gives the codes of the two exits; `run_foes(seed, node, less, biome)` and the plan
  `[count, formation, biome, ...]` that `Engine::with_foes` stands carry the biome (the Open world's codes: `0` Meadow, `1` Forest,
  `2` Tundra, `3` Desert, `4` Badlands, `5` Archipelago). `engine_version` is unchanged (no game of another mode changes).
- **Saving**: the run keeps `exits` (on for a run started after this change), `exit` (the screen waiting) and `biomes` (the codes
  picked for act 2 then act 3). A run saved before it loads with `exits` off: no exit is offered, every act is the Meadow, and its
  fight in progress replays on the board it started on.
- **Turn it against the bot**: a hole takes the bot's marbles as it takes the army's; push its marbles toward the middle band.

## 19. The run through the MCP server (#1469)

An AI agent reaches every mode a player reaches, to play it and to test it. `mcp/src/run.ts` plays a run with the client's own
rules: the pure functions of `client/src/roguelite.ts` and `collector.ts` (the nodes, rewards, relics, tactics, shop, rest,
events, "?" nodes, Collector, exits and the end of a fight) and the bridge's (`run_map`, `run_foes`, `run_exits`, the army's
`Engine`, the act boss), called in the order of `main.ts`. Nothing is copied: the same seed and the same choices give the
client's run, and a test checks it on a short scripted path. The tools are in `docs/specs/mcp.md` section 5 (Rogue-lite tools).

- **One run at a time**, separate from the Open world. `new_run` takes a seed, the `best` acts won and the blueprints `unlocked`
  that a browser would have banked, a `commander` (the Captain by default) and the bot's search budget (`bot_nodes`).
  The agent carries nothing but what it passes in (only variety carries between runs, Decision #934): the `banked` blueprints
  of a run over are the `unlocked` of the next.
- **Screens, as the page shows them** (`showRun`): `map`, `place`, `fight`, `reward`, `relic`, `event`, `rest`, `shop`,
  `collector`, `exit`, `won`, `lost`. A screen with a choice lists its `options`; `run_choose` takes one, and one that cannot be
  taken now (an event choice that cannot be paid, a purchase short of scrap) is listed `ok: false` and refused.
- **The fight is the session's game**: `run_pick` on a fight, an elite or a boss node starts it as the game of `get_state`,
  `legal_moves` and `play_move` (the agent is Black, the bot or the boss replies in `play_move`), with the army, the bot's plan,
  the relics and the budget of the client (an elite twice) or the act boss at its act's strength.
  `run_place` puts the special marbles before the first move, `run_tactic` plays a tactic and `run_flask` drinks a flask on the map (section 25). The run reads the fight's end
  after every move and folds it in as `runMoved` does (`fightOver`); `resign` loses it, a draw loses it. Starting another game
  while a fight is on leaves the run, as another mode does in the client.
- **Saving**: `save_run` is the client's save (`Run`), `new_run` with it as `save` resumes it, a fight in progress replayed
  (`loadRun`). A save of the client loads, and the client loads the server's.
- **Special marbles kept**: only the army's, not the bot's (bug #1492 counts both in `main.ts`).
- **Left out**: nothing of the page's looks. No UI changes.

## 20. Ascension (#1465)

Slay the Spire's ascension and Dead Cells' boss cells: a run won opens a harder one. There are **ten levels**; a run starts
at level 0 (the run as sections 1 to 17 describe it) or at a level picked on the start screen, and **each level adds one
handicap and keeps the ones before it**. Only variety carries between runs (Decision #934): a level unlocks a harder run,
never a stronger army.

| Level | Name | Handicap |
|---|---|---|
| 1 | Sharper elites | an elite bot searches 3 times the positions of a fight, not 2 (section 7) |
| 2 | Short rests | a rest brings the army back up to 12 marbles, not 14, and never lowers it (section 10) |
| 3 | Armed foes | the bot has 1 more special marble in fights and elites (section 14) |
| 4 | Dearer shops | every price of a shop, the removal too, is a quarter higher, rounded (section 12) |
| 5 | Lean pickings | a won fight, elite and act boss give 7, 14 and 21 scrap, not 10, 20 and 30 (section 12) |
| 6 | Thin ranks | the run starts with 12 marbles, not 14 |
| 7 | Hardened bosses | act bosses play at a quarter more strength (section 7) |
| 8 | Armed to the teeth | the bot has 2 more special marbles in fights and elites, one more than level 3 gave |
| 9 | Meagre rewards | a reward offers one choice fewer (2) |
| 10 | Hunted | the bot searches a quarter more positions in fights and elites |

- **Unlock**: a run **won** at level N unlocks level N + 1, up to 10, kept next to the acts won (`ab-alone.roguelite.ascension`,
  the highest level unlocked, 0 when none). A run lost unlocks nothing, and a win at a lower level than the highest never
  lowers it. Winning is the run ending in `won` (the last act's boss), and it is recorded at once.
- **Pick**: the start screen has a row of buttons 0 to 10 under the commanders, the levels not unlocked disabled, the one
  picked pressed (a new run is at level 0), and under it the rule of the one picked and that every level before it applies.
  Picking level 6 or more sets the army to 12, a lower level to 14. After the first node, or once the run is over,
  a pick does nothing. The commander and the level are picked independently.
- **Where each handicap acts**: the client (`roguelite.ts`) for the budgets, rests, prices, scrap, boss strength and offers,
  all pure functions of the run; the bot's extra special marbles in the core: `run::foe_plan_with(seed, node, less, more)`
  (`run_foes(seed, node, less, more)` on the bridge, `more` optional, `foe_plan` is `more` 0). A fight's extra special marbles
  are other kinds of its act's pool while the pool lasts, an elite's more of its own style, none more than a marble each. The
  plan for `more` 0 is the plan of before, so a run at level 0 is unchanged and `engine_version` stays.
- **Deterministic**: the level is a choice of the player, so a run is a function of its seed, the commander, the level and the
  moves; the extra foes are dealt by the seed and the node like the others, and the run replays.
- **Saving**: the run keeps `ascension` (0 to 10) and `top`, the highest level unlocked when it began, which the picker
  needs. A run saved before this change loads at level 0 with `top` 0: its fights and offers are those of before.
- **Summary and HUD**: the run line says `ascension N` from level 1 (`Rogue-lite run · ascension 3 · act 1 fight ...`), the
  summary of a run over an `Ascension: N` line, and a run won at its top level lists the level it unlocked (`Ascension 4`)
  among its unlocks (section 8).
- **Turn it against the boss**: not a boss mechanic; no boss has a level.

## 21. Score, daily run, history and compendium (#1466)

A reason to replay (Slay the Spire's daily climb, Dead Cells' unlocked-item list): a score at the end of a run, one shared run
a day, the last runs, and a list of what there is to find. Only variety is kept between runs (Decision #934): none of it
changes what a run holds.

- **Score**: shown at the end of a run, won or lost, as `Score: 210 (acts 1 × 100, elites 2 × 25, ...)`, in a line of its own
  above the summary of section 8. It counts, with the points each:

  | What | Points each |
  |---|---|
  | Acts won (section 8: bosses beaten, not the one fought or lost to) | 100 |
  | Elites beaten (not the one fought or lost to) | 25 |
  | Marbles left in the army at the end | 10 |
  | Flawless fights: a fight, an elite or a boss won with no marble lost (the Hull plating's marble back does not count) | 15 |
  | Ascension level of the run (section 20) | 50 |

  A part that counts nothing is left out of the line. The run keeps `flawless`, the fights won with no marble lost; it is a
  pure function of the run, so a replayed run has the same score.
- **Daily run**: a button on the start screen, `Daily run YYYY-MM-DD`. It plays the seed of the day, the one the Daily
  challenge's boss fight uses (`daily.ts` `dailySeed`: a hash of the UTC date, the same for everyone), with **every unlock open**
  (all the acts-won unlocks and blueprints, ascension 0, the Captain picked, any commander allowed), so no player's progress changes
  its map, offers or events, and no blueprint is dropped. The run keeps `daily`, its day, shown in the run line
  (`Daily run 2026-11-03 · ...`).
  - **One try a day**: pressing the button spends the day (`ab-alone.roguelite.daily`), even if the run is abandoned; the
    button then stays shut, `tried today, back tomorrow`. The day changes at 00:00 UTC.
  - **Its score** is kept when the run ends, and the button reads `score N, back tomorrow`.
- **Auto-play (#1542)**: the run keeps `auto`, on once the bot has played a move of any fight, elite or boss of the run (it
  is saved with the run, and a run saved before loads as played by hand). A run with `auto` says `Auto-play used` in its
  score line (`Score: 30 (marbles 3 × 10) · Auto-play used`), as a line of its summary, in its history line and in the daily
  button. Its score is shown, marked, but **the Daily's ranking and best score count only runs played by hand**: a daily try
  records `auto` with its score, and the button reads `score N (Auto-play used, not ranked)`. There is no online board yet; any
  ranking or best score added later counts the entries with `auto` off only. The MCP run has no Auto-play and no score (below), so
  it is always by hand.
- **Run history**: `Run history` on the start screen lists the last 10 runs over, the newest first: commander, result,
  score, the ascension level when above 0 and the day of a daily run (`The Warden · won · score 640 · ascension 2`).
  Kept in `ab-alone.roguelite.history`, a run once (by its seed).
- **Compendium**: `Compendium` on the start screen lists the 12 relics, the 10 special marbles, the 4 tactics and the 20 events,
  each with its rule once **seen** (a relic, special marble or tactic the army held, an event met), the others a silhouette
  with `???`, and `N of M seen` as its title. Kept in `ab-alone.roguelite.seen`, filled as a run screen is drawn, so a run
  abandoned still counts what it met. Back leaves a list for the start screen.
- **Saving**: the run keeps `flawless` and `daily`. A run saved before this change loads with `0` and `''`. The history, the
  daily try and the compendium are in the browser's localStorage, with the other progress: a blocked storage keeps none of them
  and loses no run; a bad value is read as empty.
- **MCP**: the server's run is the client's `Run`, its `fightOver` counts the flawless fights, and a save carries both
  fields. The score and the book are the page's, not the server's (section 19).
- **Turn it against the boss**: not a boss mechanic; no boss has a score.

## 22. Boss relics, keys and a fourth act (#1467)

Slay the Spire's boss relics and its three keys: the end of a won run holds one more secret. Only variety carries between runs
(Decision #934): nothing here is kept after the run, and a run without a key plays the three acts of section 1.

- **Boss relics**: four more relics, codes 12 to 15 (the bridge's `Relic` codes stop at 11: the page plays these, the engine is
  unchanged), each a strong effect with a cost. One of the 3 relics an act boss offers (section 9) is a boss relic, the last of the
  three, dealt from those the run does not hold by the run seed and the node; the other two are ordinary. Treasures, elites,
  events and shops never deal one. The relic screen marks it "Boss relic".

  | Code | Relic | Effect | Cost |
  |---|---|---|---|
  | 12 | War banner | the bot has 2 marbles fewer in fights and elites (3 with the Saboteur) | act bosses play at 150 % of their strength |
  | 13 | Mending core | a marble comes back after every won fight, elite and boss (up to 14) | a rest brings back only 3 marbles |
  | 14 | Static shroud | the bot searches half the positions in fights and elites | rewards offer one choice fewer |
  | 15 | Boss breaker | act bosses play at half their strength | the bot searches 25 % more positions in fights and elites |

  The knobs are the ones of the ordinary relics (the bot's marbles and budget, a boss's strength, the marbles back, the rest, the
  number of offers) and stack with them, multiplying: the Boss breaker and ascension level 10 make the budget 1.5625 times a fight's. The Mending core's
  marble adds to the War chest's.
- **Keys**: three, each taken by a costly choice, once each. A key is saved with the run (`keys`, the codes in the order taken).
  - **Ruby**: at a rest site, Give up the rest (no marble back, no upgrade) takes the Ruby key.
  - **Sapphire**: at a treasure, Give up the relic takes the Sapphire key.
  - **Emerald**: the first elite of each of the first three acts is **marked** on the map (a double border and "key"). It is a
    stronger bot: it searches one more time a fight's positions than an elite does (3, not 2; 4 from ascension level 1, section 20). Beating it takes the Emerald key, on top of its
    marbles, reward and relic; once the run holds the Emerald the other marked elites are ordinary elites.
  A key is not guaranteed on a path: an act can have no elite, rest or treasure on the way, as in Slay the Spire. The map shows how
  many keys the run holds and what the others ask once it has the first one.
- **Act 4**: with the three keys the third act's boss no longer wins the run. It still offers its relic (a boss relic among them),
  reward and Collector, but no exit, and the map grows by two rows: one **elite** (an archetype of section 14 with 5 special
  marbles, as any elite of an act past the third, searching an elite's positions) then a **final boss**. Without the three keys
  those two nodes are not on the map and not reachable. Act 4 is played in the Meadow (no hole, no signature marble); beating its
  boss wins the run, and a loss ends it as anywhere.
- **The final boss** is The Ballast Mind (`FINAL_BOSS`, "ballast"), at 300 % of its search budget (acts 1 to 3 play at 50, 120 and 200 %;
  the War banner, the Boss breaker and the Dampener scale it as any act boss), with its seed from the run seed and the node. Why
  it: it borrows an effect of five other bosses (the Hull's crack, the Pulsar's pulse, the Magnetizer's polarity, the Chaplain's
  conversion, the Swarm's wave), so it is the one boss that "holds all the others", and its fight is a fair race to 12 ejections
  between equal armies, which a run of 14 marbles can win at 300 %. It is also the Archipelago's boss: a run that took that exit
  meets it twice, in act 2 or 3 and again at the end, with another fight seed.
- **Acts won** count the fourth boss too (0 to 4, the score's and the MCP `acts_won`), but only the first three unlock anything: `ab-alone.roguelite` holds 0 to 3.
- **In the engine and the bridge**: `run_map(seed)` ends with the two nodes of the fourth act (act index 3, `FINAL_ACT`; an elite
  with its archetype and formation, then the boss), after the nodes of the other acts, so every node of a run saved before keeps its
  index. `run_foes` of the elite gives its plan (14 marbles, 5 special marbles). `engine_version` is unchanged.
- **Saving**: `keys` is saved with the run. A run saved before it has none and plays three acts as before; a save whose path walks
  into act 4 without the three keys does not load.
- **The MCP server** (section 19): `keys` in the run state once the run holds one, the Ruby and Sapphire as the last option of the
  rest and relic screens (`Give up the rest: take the Ruby key`), the boss relic among a boss's relic options, and the fourth act's
  nodes in `map` only once the three keys are held.
- **Turn it against the bot**: the marked elite and the final boss are fought like any other; the War banner, the Static shroud and
  the Mending core are the player's edge for the fights, paid for later, and the Boss breaker is the player's edge against the
  bosses, paid for in every fight.

## 23. Scrolls of power and affinities (#1471)

Dead Cells' scrolls let a run specialise: at the end of each act the player grows one family of special marbles. Only variety
carries between runs (Decision #934): nothing here is kept after the run.

- **Three affinities**, codes 0 to 2 on the bridge (`Affinity`), each a family of the special marbles of sections 5, 10 and 13, with
  two levels (`MAX_AFFINITY`). A level adds one rule, stated here and on the screens; level 2 holds the rule of level 1.

  | Code | Affinity | Special marbles | Level 1 | Level 2 |
  |---|---|---|---|---|
  | 0 | Force | Heavy, Heavy+ | they weigh 1 more in a push | they weigh 2 more in a push |
  | 1 | Tactics | Anchor, Anchor+, Shield | the Anchor keeps the marble in front of it on the board in a pushed line, like an Anchor+ | the Anchor, Anchor+ and Shield weigh 1 more in a push |
  | 2 | Chaos | Spark, Spark+, Bomb | a Spark's and a Bomb's burst pushes 1 cell further | the Bomb burns two turns of its fuse per turn |

  The bonuses are the **army's** (Black) alone: the bot's Heavy, Anchor, Spark and the like play as in section 5 and 13. A marble that
  weighs more weighs more on both sides of a push, attacking or defending. Chaos 1 stacks with the Detonator (section 9): a Spark
  with both bursts 3 cells, a Spark+ 4. With Chaos 2 a Bomb of fuse 3 bursts at the end of the army's second turn, not the third.
- **The scroll**: after an act boss beaten that is not the last of the run (acts 1 and 2, act 3 too when the three keys of section 22
  open act 4), a screen "Act N done · pick a scroll of power" offers one scroll per affinity below its top level (up to 3, the same
  on every run, so a reload offers the same). Picking one raises that affinity by one level and the map goes on. A run that took
  every level (6 scrolls, which a run cannot reach) gets no screen. The order of the screens at an act's end: the boss's relic
  and reward, then the **scroll**, then the Collector (section 15), then the exit (section 18). The scroll is its own screen: it is not
  part of anything an act's start refills.
- **On the map**: the affinity bar, next to the relic bar in the HUD of the map and of the fights: a glyph and the level per affinity
  grown, its name and the rule of its level as its tooltip (and under the glyph on focus). Nothing before the first scroll.
- **In the engine and the bridge**: `Board::set_affinities` gives the army its three levels before the first move (rogue-lite
  boards only, each capped at `MAX_AFFINITY`); they are part of the position's hash. `Engine::set_relics(mask)` carries them from
  bit 16: the level of Force, Tactics and Chaos on 2 bits each, so every path that sets the relics (the page, the bot's worker,
  the MCP server) sets the affinities, and the bot's search plays them like any rule. `engine_version` is unchanged.
- **Saving**: `affinities` (three levels) and `scroll` (the screen waiting) are saved with the run. A run saved before them has no
  affinity and no scroll waiting; a save with a level above 2, or not three levels, does not load.
- **The MCP server** (section 19): the screen `scroll` with one option per scroll (`Force 1 (Heavy, Heavy+): Heavy and Heavy+ weigh 1
  more in a push`), and `affinities` in the run state once a scroll was taken.
- **Turn it against the bot**: the bot's marbles keep the rules of sections 5 and 13; the player's scrolls are their edge against
  fights and elites of the acts to come, and in the act bosses that take the army's build (section 28).

## 24. The cursed chest (#1474)

Dead Cells' cursed chests are a pure risk-or-reward choice: a strong reward now, paid for in the next fights. The rogue-lite
gets one as the 21st **event** (section 16), so it comes from an event node or a "?" node, with no new kind of node and no
change to the bridge (`run_map`, `engine_version`). Only the rules change what a run offers, never what carries between runs
(Decision #934).

- **The event**: "Cursed chest", dealt like any event by the run seed and the node (section 16). Its choices:
  - **Open it for its relic**: +1 relic of the pools the run does not hold yet (dealt by the run seed and the node, as the
    Chapel box's). Not offered (disabled) when the run holds them all.
  - **Open it for its arms**: +3 Heavies (the special marble type always unlocked), only while the army has 3 plain marbles to
    make special.
  - **Leave**: always offered, takes no curse and changes nothing.
  Opening takes the curse. No marble is paid, the curse is the price.
- **The curse** (`Run.curse`, `CURSE_FIGHTS` = 2): for the next 2 fights, **each marble the army loses costs 2**. "A fight" is
  any fight that ends: a fight, an elite or an act boss, won or lost; each ends one fight of the curse (`fightOver`), even
  one with no marble lost. The marbles lost are those the bot ejected, less the one Hull plating brings
  back, then doubled: the army falls by 2 per marble, and a run that falls below 4 marbles ends as ever. Opening a second chest
  while cursed renews the curse to 2 fights, it does not stack. Marbles the army gains (rest, rewards, shop, Mending core) are
  unchanged.
- **On screen**: the run line, on the map and in the HUD of a fight, ends its army with `cursed: marbles lost cost 2, N fights
  left` (`1 fight left`), and the event's button reads `Open it for its relic · +1 relic, cursed: marbles lost cost 2 for the next 2
  fights`. Nothing shows once the curse is spent.
- **Saving**: `curse` (0 to 2) is saved with the run, and a fight in progress resumes cursed. A run saved before it has none and
  loads with no curse; a save with another value does not load.
- **The MCP server** (section 19): the chest is an event screen like the others, its options being the choices above; the run
  state has `curse` (the fights left) while it lasts, and `line` carries the curse.
- **Turn it against the bot**: the chest is the player's gamble: the curse makes the fights riskier, never the bot stronger, and
  the player who keeps the army out of trouble (the Hull plating, a Medic, the Anchors) is paid its reward for nothing.

## 25. Flasks (#1475)

Dead Cells' flasks free the route from always seeking rests: the player carries a few heals, refilled at each act. Only variety
carries between runs (Decision #934): nothing here is kept after the run.

- **Charges**: a run starts with 2 flask charges (`FLASKS`) and can hold at most 4 (`MAX_FLASKS`).
- **Drink**: a button on the map, "Drink a flask: 3 marbles back · N left", gives 3 marbles back (`FLASK_MARBLES`), never above
  START_ARMY (14, the cap of a fight's reward and an event's heal), and spends a charge. It is drunk on the map between two nodes
  only: not in a fight, not on the reward, relic, event, rest, shop, Collector or exit screen, not once the run is over. It is
  disabled, with its reason, when the army is full ("army full") or no charge is left ("no flask left"). It shows on the map
  from the start of the run.
- **Refilled at each act**: picking the first node of an act after the first refills the charges to 2 (`visit`); the charges the
  shop sold above 2 are kept, never lowered. The first act starts with 2 from the new run, so a drink before the first node is
  not refilled. A player who has charges left before the boss may drink them there, the act start refills them.
- **The shop** sells one more charge (id 5, `CHARGE_TEXT`) for 20 to 30 scrap, dealt by the run seed and the node as the other
  items, once per shop, until 4 are held ("flasks full"). No relic or event adds a charge: the shop is the one source (KISS, no
  new relic code, which the bridge's relic mask would have to know).
- **Determinism and saving**: `flasks` is saved with the run and nothing in it is random: a drink and a refill are functions of the
  run. A run saved before this change loads with 2 charges; a count above 4 does not load. The `bought` ids go to 5.
- **The MCP server** (section 19): `run_state` shows `flasks`, and `run_flask` drinks one on the map (`not_now` on any other screen,
  `bad_choice` with the army full or no charge left). The shop lists the charge as an option.

## 26. The bonus room (#1473)

Dead Cells' timed doors reward bold, fast play. Each act has a **move budget**; an act whose fights are won within it opens a
**bonus room** just before its boss, with a relic and scrap. It is a screen on the way to the boss, with no new kind of node and
no change to the bridge (`run_map`, `engine_version`). Only the rules change what a run offers, never what carries between runs
(Decision #934).

- **The budget** (`MOVE_BUDGET`, a fixed rule by act, no draw): 60 moves in act 1, 80 in act 2, 100 in act 3, 40 in act 4 (its
  elite only). The values are design numbers, easy to tune; a fight against the bot takes about 20 to 35 moves.
- **A move** is one round: the army's move and the bot's answer, counted from the move list of the fight (`rounds`). A tactic is not
  a move; a Swap, which costs the move, still gets its answer and counts; a Freeze, after which the bot does not answer, adds a move
  to the round, so it gains a move. The moves of every fight of the act count when it ends (`fightOver`), a fight, an elite or an
  act boss, won or lost (a lost one ends the run), and are kept in `Run.spent`, one count per act. Only the moves of the act
  count, so a new act starts from 0 with no step at the act transition: nothing after the boss (the Collector, the exits)
  changes.
- **The room**: picking the act boss (`visit`) with the count of its act at or under the budget shows the bonus room
  (`Run.bonus`) in place of starting the boss fight, and no node can be picked, no flask drunk (section 25), while it waits. It gives, once:
  - **a relic**, one the run's pools hold and the run lacks, dealt by the run seed and the node as the reward offers (a boss
    relic is never dealt, section 22); none when the run holds them all;
  - **40 scrap** (`BONUS_SCRAP`, more than a won boss's 30).
  One button takes both (`takeBonus`) and starts the boss fight at once. Over the budget there is no room and the boss fight
  starts as before. The room is for each act's boss, and once: the boss is picked once.
- **On screen**: the budget and the count show on the map, as a line under the run line (`moves 12 of 60 · bonus room open`,
  `moves 61 of 60 · bonus room closed`), and in the HUD line of each fight, the fight on counted in it (it grows with each move). After an act boss the line shows the next act's count. It does not show in the fight of an act boss,
  while the room waits or once the run is over. The room's screen reads `Bonus room · fast play pays`, `Act 1 won in 41 of 60
  moves.` and one button with the relic and `+40 scrap · then the boss`.
- **Saving**: `spent` (four counts, 0 to 9999) and `bonus` are saved with the run; a room waiting resumes waiting. A run saved
  before the room has `spent` empty (no count) and `bonus` off: it counts nothing and opens no room for the rest of the run. A save
  with another shape (a count of other than 0 or 4 acts, a number out of range, a `bonus` that is not a boolean) does not load.
  Deterministic: the count is a function of the moves played, the relic of the run seed and the node, so a run replays.
- **The MCP server** (section 19): a new `bonus` screen, one option (`run_choose` 0) that takes the room and starts the boss fight;
  the run state has `moves` (the count) and `budget` while the count shows, and `save_run` carries `spent` and `bonus`.
- **Turn it against the bot**: the budget is the player's gamble against time, not the bot's: a Freeze (the bot skips its answer)
  or a quick push saves moves, and the fast player is paid in relics and scrap for the boss, never in a stronger bot.

## 27. Runes (#1476)

Dead Cells' runes unlock places, not power: a reason to come back. Three runes, each found for good by beating one elite archetype
(section 14) for the first time, each opening one kind of hidden branch on the maps of the runs after it. Only variety carries between
runs (Decision #934): a branch is one more way across an act, never a stronger army, and a run without a rune is the run of section 1.

| Bit | Rune | Found by beating | Opens |
|---|---|---|---|
| 1 | Rune of Stone | The Wall | a secret room in every act |
| 2 | Rune of Spark | The Artificer | a shortcut in every act that skips a row |
| 4 | Rune of Might | The Brute | a third, secret exit between acts |

- **Found**: a won elite fight of an archetype whose rune the player neither owns nor found earlier in the run (`fightOver`, a run with
  the plain army of an old save finds none). The rune is kept for good in the browser (`ab-alone.roguelite.runes`, the mask, 0 to 7,
  read by `readRunes`, kept by `recordRunes` as the run shows) and the line the map tells reads `Rune of Stone found: a secret room in
  every act, on the maps of your next runs`. The run summary lists the runes it found. A rune found changes nothing in the run that
  found it: it opens its branch on the next runs (`Run.runes`, the mask owned when the run began, shapes the map and the exits
  of the whole run, so a run replays; `Run.found`, those it found). The Daily run owns none, as it is the same for everyone.
- **The secret room** (`NodeKind::Secret`, code 8; `RUNE_ROOM`): one per act, at the end of the second row, reached from the last
  node of the first row and leading to the last node of the third, so no path crosses another. It is a door on the map, named
  "Secret" in the legend only once the rune is owned, and played as a **treasure**: a relic to take, or the Sapphire key (section 22)
  in place of it. It is one more choice in its row, not an extra node on the way, so it is a route and not a reward on top of one. The
  secret rooms come after every other node on the map (after the fourth act's two), so no node of a map without a rune changes index.
- **The shortcut** (`RUNE_SHORTCUT`): one per act, a link from a node of the first row to a node of the third (`Node::skips`, the
  columns of the row after the next), both drawn from the seed and the act. The path skips the second row. It is drawn as a dotted
  line in the hazard colour (`line.shortcut`), and the nodes to pick after the first one include the end of its link.
- **The secret exit** (`RUNE_EXIT`): the exit screen of section 18 offers a third biome, drawn from the same shuffle as the two
  others (`exits_with`: the first two are unchanged, the third is another biome that is neither the Meadow nor the one left),
  its button marked `Secret exit ·`.
- **On screen**: the start screen lists the runes still to find with how (`Runes to find: Rune of Spark (beat The Artificer: a shortcut
  in every act that skips a row) · ...`), and the map names the runes owned (`Runes: Rune of Stone (a secret room in every act)`).
- **In the engine and the bridge**: `run_map_with(seed, runes)` and `exits_with(seed, act, from, runes)` take the mask; `run_map(seed)`
  and `exits` are the same with 0. The bridge's `run_map(seed, runes)` and `run_exits(seed, act, from, runes)` take it as an optional
  last argument (none is 0); the `links` mask of a node carries its shortcut in bits 8 to 13 (bit `8 + c`: column `c` of the row after
  the next). `engine_version` is unchanged (no fight changes).
- **Saving**: `runes` and `found` (0 to 7) are saved with the run. A run saved before has neither, so it loads with the map of no
  rune, which is the map it was saved on; a mask above 7 does not load.
- **The MCP server** (section 19): `new_run` takes `runes` (the mask the browser would keep), `run_state` names them (`runes`), the
  secret room is a node of kind `secret` (a relic to take) and the shortcut one more target of its node in `map`, the third exit is the
  last option of the exit screen (`Secret exit · ...`) and a run over lists the runes it found in `unlocked`.
- **Turn it against the bot**: nothing here changes a fight; the hidden branches are the player's routes (a treasure sooner, a row
  less of fights, one more biome to choose), the bot stays the bot of its node.

## 28. The build in an act boss fight (#1494, #1495)

The special marbles, relics, affinities and tactics a run built over its act count in its hardest fight too. An act boss fight
(`Encounter`) carries them as an army fight does, inside the boss's own rules.

- **What carries**: the rogue-lite flag of section 5 on the boss's board (`Encounter::equip`: `Game::set_rogue_lite`, then the relics
  and the affinity levels of `Engine::set_relics`), the army's special marbles placed on its Black marbles before the first move
  (`place_special`), and the tactics. Their rules, the Gyroscope and the Detonator, and the affinities' bonuses are the engine's
  and play on the army's marbles as in a fight. The boss's search plays the same moves and rules (it searches the game the
  `Encounter` holds, as the bot does in a fight), so it pushes, avoids and answers the Heavies, Anchors, Sparks and the rest. Boss-only
  relic effects (section 22: the Dampener, the War banner, the Boss breaker) are the page's and unchanged (the Dampener's Fall back is one of the two tactics played here).
- **Which bosses take it**: twelve of the fifteen, those that play Abalone on a board of their own with hooks that either remove marbles
  or move them with their special mark (#1495, below): **The Hull, The Chaplain, The Alien, The Rail Yard, The Overseer, The
  Stalker** (#1494), and **The Magnetizer, The Pulsar, The Assembly Line, The Unstable Core, The Dual Room and The Ballast Mind**
  (`takes_build` and `boss_takes_build(id)` on the bridge, one flag per boss in the roster). **The others fight as before** (no
  placement, no special marble, no tactic bar), each for its own reason: The Echo (its free moves and memory of moves), The Choir
  and The Swarm (their own fights, not a plain `Encounter`).
- **Marks and hooks** (#1494, #1495): a special mark is the marble's, so a hook that touches a marble takes its mark along. A hook that
  empties or voids a cell (a crack, a train, an incinerator, the martyr, an overload, a press, a belt's end) drops the mark of the cell
  (`Board::set` to Empty and `Board::void`), and a hook that moves marbles moves their marks to where they went and drops those of the
  marbles it threw off the board (`Board::follow_specials`, the same code in the game and in the boss's search tree): The Magnetizer's
  repulsion (the pair and every marble it pushes), The Pulsar's pulse (and the pulse The Ballast Mind borrows), The Assembly Line's belts
  (a marble carried off an end or struck by a press loses its mark), The Unstable Core's shockwave. The Dual Room's return keeps the mark
  with the marble: the special marble pushed into the void or over the rim comes back special in the other room (`Dual::marks`). The
  Chaplain's conversion keeps the mark on the marble, so a converted Heavy is the boss's. A hook is not a push: it ejects a marble
  whatever its mark, an Anchor stays on the board against the push of a move only, and a Spark does not burst nor a Medic come back from
  a hook (as in #1494). The weighted push of The Unstable Core adds up with the Heavies' weight as any push does.
- **Seen before the fight**: a boss node of the map says in its tip, once the biome of its act is known, which boss ends the act and
  whether it "takes your build" or "fights without your build" (`mapHtml`'s roster, `boss_takes_build` of the bridge); the placement
  screen is the sign of a boss that takes it, and one that does not starts its fight at once.
- **Placement**: a run with special marbles shows the placement of section 6 on the boss's board before the first move, on the
  army's marbles of that board (the Black ones: the layout is the boss's own, so a placement made for an army fight does not
  carry). A boss that takes no build starts its fight at once. The `placed` of the run are saved with it.
- **Tactics**: Reinforce (a marble joins the first free cell of the standard back row) and Fall back (the player's last move and
  the boss's answer are undone, with what the hooks of those plies showed) are played as in section 11. Freeze and Swap are not
  played in a boss fight (`TacticError::BossClock`, disabled in the bar): they skip a turn, and every boss counts its clock in
  plies (its cracks, trains, eggs, pulses and waves fire on the player's plies and the boss's), which a skipped ply would break.
  A tactic record joins the move list as in section 11, `Encounter.play` takes it, and the bot's worker, the replay and the save
  play it again. A boss wins at its own count (6): Reinforce does not move it.
- **Special marbles kept**: the army's special marbles still on the board at the end of the boss fight are kept, as after a fight
  (`armyKept`); a boss that takes no build leaves them all.
- **Saving**: nothing new is saved, the `placed` and the tactics of the run already are. A run saved in an act boss fight before this
  change loads as it was: its moves replay on the boss with the relics of the run (the Gyroscope only adds legal pushes), no special
  marble was placed and the tactics held can be played from the next turn. Deterministic: the same seed, placement and moves give
  the same fight. `engine_version` is unchanged: no game of another mode changes.
- **The bridge**: `boss_takes_build(id)` (the roster's flag, before any fight), `Encounter.takes_build()`, `set_relics(mask)` (the mask of `Engine::set_relics`; it turns the flag on), then
  `place_special(q, r, kind)`, `specials()`, `fuses()` and `tactics()` (the mask of `Engine::tactics`, only Reinforce and Fall back),
  and `play` takes a tactic record. An `Err` for a boss that takes no build. The client builds the fight with `encounterFor`
  (`client/src/bot.ts`, shared by the page and the bot's worker).
- **The MCP server** (section 19): `run_pick` on an act boss that takes the build shows the `place` screen, `run_place` puts the
  marbles on the boss's board, `run_tactic` plays Reinforce and Fall back (`illegal_move`, the tactic kept, for the others), and
  `save_run` carries the same.
- **Turn it against the boss**: the build is the player's edge in the fight, and the boss gets none of it, but a converted special
  marble (The Chaplain) is the boss's, and the player's Heavies and Anchors push and block the boss's marbles as they do the bot's.

## 29. The start screen (#1524)

The screen before the first pick says what a run is and has one way to begin; the choices are one tap away. From the top: the run line,
**what a run is** in two sentences (`RUN_INTRO`: "A run is a climb through 3 acts of fights with the army you keep: marbles lost stay
lost. Beat the act 3 boss to win; lose a fight, or fall below 4 marbles, and the run is over."), the choices Start takes (`Commander: The
Captain`, `Ascension 2` when picked), then **Start** and **More** on one row, 44 px high, then the flask, then the map.

- **Start** takes the first fight of the map (`choices(map, run)[0]`, as a pick of that node: the pick sound, the save, the placement
  or the fight), with the commander and the level as they stand. A new run starts with the Captain (`beginRun`), so a first-time player's
  Start needs no choice; a node of the map is still picked by itself.
- **More** (`data-more`, `aria-expanded`, then Less) opens one column under the flask: the special marbles of the rewards with what unlocks
  the others (section 8), the commander buttons and the picked one's line (section 17), the ascension row 0 to 10 and its rule
  (section 20), the runes still to find (section 27), the blueprints to bank (section 15), and the daily run, run history and compendium
  (section 21). Nothing was cut: every button and rule of those sections is there, in the same order. Opening More scrolls the plate to
  its first line, and the plate scrolls to the end of it, the ascension row included (it was cut off at the bottom of a 540 px window
  and 844 px phone before, under a long list).
- **Open or shut.** More is shut for every new run (`runMore` in `main.ts`, not saved), stays open through a commander or a level
  picked, the history, the compendium and their Back, and a reload shuts it. What the player chose is saved with the run as before
  (section 3), so the line above Start reads it back and Start takes it. `mapHtml(map, run, book, bosses, more)` draws it open by
  default, the page passes its state.
- **Held in view.** Start and More sit under two or three lines of text, in the first screen of the plate on a 960x540 window and a phone
  held upright; the flask and the map follow. `client/e2e/roguelite-start.spec.ts` checks both, and that every control of More can be
  scrolled into the plate.
- **Tests.** The specs that click a control of More open it first through `openMore` (`client/e2e/runstart.ts`, one click).
- **Turn it against the boss**: no new rule: the screen only orders what the player picks; the commanders and the ascension levels keep
  their rules (sections 17 and 20).

## 30. The difficulty curve, measured (#1537, #1598)

The run was stacked (ten ascension levels, relics, runes) without knowing how often a player gets through it. `run_sim`
(`crates/abalone-core/examples/run_sim.rs`) plays seeded runs with a bot (the act bosses with the ladder's bot, the fights and the elites with the army's fight bot of #1598) and counts the
acts cleared. These are **bot numbers, not human ones**: a person who reads the tells, takes the elites and builds a deck does better or worse in ways the bot
cannot say. The table is a measure of the curve (act against act, boss against boss) and of what the constants do to it.

- **Command**: `RUN_SIM_THREADS=8 nice -n 15 cargo run --release --example run_sim` (the defaults are the table's: 40 seeds, 0 to 39, the
  same for every row; levels 0, 5 and 10; the four commanders; the bot searches 3 times the boss's budget; the fights below). It is
  deterministic: the same command gives the same table on any machine, **after about 48 minutes on 8 threads** (208 CPU minutes, 480 runs,
  measured on a machine busy with other work, so a quiet one is faster; `RUN_SIM_ARMY=500` takes 20 minutes). `RUN_SIM_RUNS`, `RUN_SIM_BOSS_X` and a list of commanders
  (`... run_sim 0 1`) change the sample, `RUN_SIM_PERCENTS=50,120,200` tries other boss strengths, `RUN_SIM_POOL=1` plays the boss of every act
  for every seed, whatever the runs before did (the tuning sample), and `RUN_SIM_FIGHTS=0` counts the fights and the elites as won again
  (the table of before #1598, below). The fights have `RUN_SIM_PEAK=2000`, `RUN_SIM_ARMY=5000` and `RUN_SIM_FIGHT_PLIES=400` (below).
- **The map and the route**: the engine's (`run::run_map_v` at the current `MAP_VERSION`, since the paced map of section 2, #1543; `RUN_SIM_MAP=0` plays the map of before; a run seed per row of the table). The bot takes a rest when the army is
  under its ceiling (14, 12 from level 2), else a fight or the boss, else a node with nothing to play (an event, a "?", a
  treasure, a shop, a secret room: left at once), an elite last. At the end of an act it takes the first exit offered
  (`run::exits`), so acts 2 and 3 are the biome's boss (section 18), act 2 one of the four of `ACT_ONE_LEAVES` one seed in 3 (`LadderBoss::act_two`, #1635); act 1 deals one of the 11 bosses of its pool (`LadderBoss::act_one`, #1599: the roster less The Echo, The Hull, The Chaplain and The Choir) from the seed
  (the engine's splitmix64, not the page's hash: the same spread, not the same boss for a seed).
- **The act boss fight is the engine's**: `play_act_boss` (the ladder's bot of `boss-balance.md`, which plays two random first moves, never
  repeats a position and reads the tells and hooks) at the boss's own node budget times **3** against the boss at `ACT_PERCENT` of its
  budget (50, 120 and 200 %; a quarter more from level 7). A draw or 300 plies is a loss. The army loses the marbles the boss
  ejected; the run is over below 4 marbles. The ladder's pro level is 10 times: a 10 times player costs about 100 CPU
  seconds a fight, which no table of 480 runs can afford, and 3 times already finds the same walls (below). The fights are shared:
  one boss fight is played once per boss, seed and strength, whichever commander and level reach it.
- **A fight and an elite are played** (#1598, `armyfight.rs`; `RUN_SIM_FIGHTS=0` counts them won at a flat 1 and 2 marbles instead, the table
  of before). The army (Black) brings its marbles and its commander's special marbles to the foes of `run::foe_plan_v` for that node: its formation,
  its special marbles (a fight holds act + 1 of them, one more at level 3 and another at level 8, section 20; an elite its archetype's) and the biome's
  holes. The army's special marbles stand on the front of its army, in the order of the standard layout (the Warden's two Anchors, the
  Saboteur's two Sparks, the Captain and the Juggernaut none; the page lets the player place them, so this is a
  choice of the bot), the commander's relic is held in the engine (Gyroscope, Hull plating, Detonator, Bunks), and the Juggernaut's Bunks add a Heavy
  at each rest it takes while the army can hold it. A special marble that is thrown off is gone for the rest of the run. The army's marbles
  after the fight are the ones left on the board, one more saved by the Hull plating; a fight not won (a draw, 400 plies, or the army down to 3
  marbles) **ends the run**; a won fight, elite and boss give a marble back as before, and a won elite 2.
- **The foes' budget** is the page's (`runNodes` and `fightBudget`, `armyfight::foe_budget`): `RUN_SIM_PEAK` times a share that grows from
  25 % at the first fight to 100 % on the fourth act (25 % at the first row of act 1, 40 % at the start of act 2, 63 % at the start of act 3, about 86 % at its last row), an elite 2 times that (3 times
  from level 1, one more when it is the marked elite of its act holding a key), a quarter more from level 10. The page's peak is the bot's progress
  (section 32): the plain bot's 20000 positions at its end, **2000 for a player of about 6 medals**, which is the table's `RUN_SIM_PEAK=2000` (foes
  of 500 to 2000 positions: a 20000 peak costs 5 times more a fight, and the army bot below does not win it much more or less, see the sensitivity).
- **The army's bot** (`armyfight::fight_move`): a search of `RUN_SIM_ARMY` = 5000 positions (3 plies) with the plain evaluation less its cohesion term and
  plus one term, the **pressure** (`Weights::pressure`, 30 per marble of the army lined up behind a foe on the rim, in a line that ends off the
  board: one more push and the foe goes off). It never repeats a position into a draw (Auto-play's rule). Measured below.
- **The levels**: levels 1 (elites 3 times), 2 (rests to 12), 3 and 8 (the foes' special marbles), 6 (12 marbles to start), 7 (bosses a
  quarter stronger) and 10 (the foes search a quarter more) are played now. The levels 4 (shops), 5 (scrap) and 9 (rewards) are handicaps of the
  shops, the scrap and the offers, which the bot does not play. A level 5 row is the level 0 row with the sharper elites, the short rests and the foes' special
  marble of level 3; a level 10 row adds the thin ranks, the second foe special marble, the hardened bosses and the quarter more search.
  Only levels 0, 5 and 10 are measured (the sample that stays cheap).
- **Left out** (the page keeps these, and porting them to the engine would be large): every relic but the commander's own, the build in an act boss
  fight (section 28: the bosses are still played without the army's special marbles, as the ladder does), the tactics, the runes, events, shops, scrap,
  flasks, affinities, the cursed chest, the bonus room, the Collector, the fourth act, the route choices (the bot takes the first fight, never an
  elite while a fight is open), and the upgrade of the special marbles at a rest. **Bot-only numbers**: the army's bot is weak (below), and a person who
  places the special marbles, uses the tactics and reads the foes wins most of the fights the bot loses; read the rows against each other, not
  as a share of players.

### What limited `auto_move`, and the bot that replaced it (#1598)

The first fight of seeds 0 to 15 (14 marbles against 8), the army at 500 positions against a foe of 250 (`auto_move` wins 1 of 16):

- **The horizon is it, from the third ply.** The search finishes 2 plies at 500 and at 2000 positions and 3 at about 8000 (first fight of seed 0; the army's move costs about
  30 ms at 500, 60 ms at 2000 and 270 ms at 8000, CPU time on a busy machine), so 500, 1000, 2000 and 2500 play the same game move for move (four identical rows in the
  table below), and 5000 and 10000, which finish 3 plies, win 50 to 60 % and 70 to 80 % against every budget of the run's curve.
- **The repetition rule is not it.** The 15 games not won end 13 times by the 100 plies without an ejection and 2 by a threefold repetition. Auto-play's rule
  (a position not yet seen first) keeps the army moving, and it moves round the foes: it has ejected 3 to 5 marbles in 12 of the 15 games (and none in 2, drawn at
  ply 100), and then cannot finish. The last 3 or 4 foes huddle along the rim in a line, and a 2 plies search sees neither the push that ejects nor the two moves that line it up.
- **The evaluation is it.** The plain weights (marble 100, ejection 50, centre 3, cohesion 2) have no gradient toward the push. Dropping the cohesion and adding the
  pressure term took seeds 0 to 11 from 1 won to **10** (a foe of 250) and, against a foe of 1000 positions, to **7** of 12. What was tried, of 12 each, against a foe of 250:
  pressure 30 with centre 3: 10, with centre 10: 8; pressure 15 with centre 10: 9; pressure 100 with centre 10: 0; pressure 30 with centre 10 and the material halved: 3. Against a foe of 1000: pressure 30: 7, pressure 50: 4,
  pressure 20 with cohesion 1: 8, material 150, ejection 150, centre 1: 7 each. The sample is too small to rank the 7 and the 8 (one standard error is 14 points); the pressure is what
  matters, 30 was kept.

The army's bot against the run's fight budgets (`cargo run --release --example fight_bot`, the first fight of seeds 0 to 9, a foe of 25, 40, 63 and 100 %
of the 20000 peak, a draw and a game cut at 400 plies being not won). Fights won, with one standard error of the rate:

| army bot | foes 5000 | foes 8000 | foes 12600 | foes 20000 |
|---|---|---|---|---|
| 500 | 4/10 (40 % +/- 15), 266 plies, 30 s | 2/10 (20 % +/- 13), 208 plies, 134 s | 2/10 (20 % +/- 13), 189 plies, 205 s | 2/10 (20 % +/- 13), 248 plies, 208 s |
| 1000 | 4/10 (40 % +/- 15), 266 plies, 27 s | 2/10 (20 % +/- 13), 208 plies, 46 s | 2/10 (20 % +/- 13), 189 plies, 127 s | 2/10 (20 % +/- 13), 248 plies, 325 s |
| 2000 | 4/10 (40 % +/- 15), 266 plies, 60 s | 2/10 (20 % +/- 13), 208 plies, 75 s | 2/10 (20 % +/- 13), 189 plies, 121 s | 2/10 (20 % +/- 13), 248 plies, 253 s |
| 2500 | 4/10 (40 % +/- 15), 266 plies, 23 s | 2/10 (20 % +/- 13), 208 plies, 45 s | 2/10 (20 % +/- 13), 184 plies, 94 s | 2/10 (20 % +/- 13), 255 plies, 321 s |
| 5000 | 6/10 (60 % +/- 15), 196 plies, 43 s | 5/10 (50 % +/- 16), 180 plies, 100 s | 6/10 (60 % +/- 15), 175 plies, 102 s | 5/10 (50 % +/- 16), 242 plies, 106 s |
| 10000 | 7/10 (70 % +/- 14), 160 plies, 54 s | 7/10 (70 % +/- 14), 156 plies, 77 s | 7/10 (70 % +/- 14), 165 plies, 64 s | 8/10 (80 % +/- 13), 204 plies, 117 s |
| 500 (auto_move) | 0/10 (0 % +/- 0), 135 plies, 22 s | 0/10 (0 % +/- 0), 139 plies, 35 s | 0/10 (0 % +/- 0), 144 plies, 71 s | 0/10 (0 % +/- 0), 148 plies, 166 s |

The seconds are wall clock on a machine busy with other work, so a quiet one is faster; in CPU time the 280 fights took 14100 seconds (50 s a fight): 7600 for the first
160 in 41 minutes on 8 threads, 6500 for the last 120 in 32. A fight is its length (160 to 270 plies, half of them the foe's) times the foe's cost per ply (about 33 us a position
measured, 0.17 s at 5000 and 0.66 s at 20000) plus the army's (60 us a position with the pressure term, twice the plain evaluation's: 30 ms a move at 500, 0.3 s at 5000,
0.6 s at 10000), which is why a run is dear whatever the army's bot is. `auto_move` at the same 500 wins none of the 40 fights.

**The choice for the table**: `RUN_SIM_ARMY=5000` by default, the first budget of 3 plies. The 500 of 2 plies (the same game as 2500, 30 ms a move) wins 20 to
40 % of the first fights of the run's curve, the 5000 50 to 60 %, the 10000 70 to 80 % at twice the army's cost again; a run costs 26 CPU seconds at 5000 against 9 at
500 (the runs that live play more fights). The table below is the 5000, and the table at 500 follows it: the commanders' order depends on the bot's strength.

**The paced map changed nothing here (#1543).** The Captain at level 0 on the 40 seeds, the paced map against the map of before: act 1 32/40,
act 2 15/32, the run 8/15 for both, and the result of each of the 40 runs identical (`RUN_SIM_MAP=0`). **Bot numbers only**: the bot wins
every fight and elite it takes and plays no shop, so a rest or a shop before a boss, one elite fewer in a row and a fork it never chooses
by can only move its army by a marble, never an act boss fight, and the act boss fights are what the table measures. What the pacing does
for a person (a way to recover before a boss, a route to choose) is not in these numbers.

### The targets and the table

Targets at ascension 0 (the issue's), bot numbers: **act 1 about 85 %** of the runs and **the whole run 15 to 25 %**. A curve that
falls act by act between the two is implied (act 2 about 60 % and act 3 about 40 % of the runs that reach them would give 20 %). Each
cell below is the runs that cleared the act out of those that reached it, and its share of all the runs.

**With the fights played (#1598)**, the command above (the army's bot at 5000 positions, the foes at a peak of 2000), bot-only numbers, in
**48 minutes on 8 threads** (12480 CPU seconds, 480 runs, 26 CPU seconds a run, on a machine busy with other work). Each cell is the runs that cleared the act out
of those that reached it, its share of all the runs and the error of that share (one standard error, in points); the last column is where the runs ended (a
fight or an elite not won, an act boss not won, the army under 4 marbles):

| commander | level | runs | act 1 | act 2 | act 3 = the run | the runs lost to |
|---|---|---|---|---|---|---|
| The Captain | 0 | 40 | 11/40 (28 %), 28 % of runs (+/- 7) | 1/11 (9 %), 2 % of runs (+/- 2) | 0/1 (0 %), 0 % of runs (+/- 0) | fight 36, elite 1, boss 3, army 0 |
| The Captain | 5 | 40 | 6/40 (15 %), 15 % of runs (+/- 6) | 1/6 (17 %), 2 % of runs (+/- 2) | 0/1 (0 %), 0 % of runs (+/- 0) | fight 38, elite 1, boss 1, army 0 |
| The Captain | 10 | 40 | 1/40 (2 %), 2 % of runs (+/- 2) | 0/1 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 40, elite 0, boss 0, army 0 |
| The Warden | 0 | 40 | 12/40 (30 %), 30 % of runs (+/- 7) | 0/12 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 34, elite 2, boss 4, army 0 |
| The Warden | 5 | 40 | 4/40 (10 %), 10 % of runs (+/- 5) | 0/4 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 38, elite 1, boss 1, army 0 |
| The Warden | 10 | 40 | 2/40 (5 %), 5 % of runs (+/- 3) | 0/2 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 40, elite 0, boss 0, army 0 |
| The Saboteur | 0 | 40 | 18/40 (45 %), 45 % of runs (+/- 8) | 0/18 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 33, elite 2, boss 5, army 0 |
| The Saboteur | 5 | 40 | 4/40 (10 %), 10 % of runs (+/- 5) | 0/4 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 37, elite 1, boss 2, army 0 |
| The Saboteur | 10 | 40 | 1/40 (2 %), 2 % of runs (+/- 2) | 0/1 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 40, elite 0, boss 0, army 0 |
| The Juggernaut | 0 | 40 | 16/40 (40 %), 40 % of runs (+/- 8) | 1/16 (6 %), 2 % of runs (+/- 2) | 0/1 (0 %), 0 % of runs (+/- 0) | fight 31, elite 2, boss 7, army 0 |
| The Juggernaut | 5 | 40 | 4/40 (10 %), 10 % of runs (+/- 5) | 1/4 (25 %), 2 % of runs (+/- 2) | 0/1 (0 %), 0 % of runs (+/- 0) | fight 35, elite 2, boss 3, army 0 |
| The Juggernaut | 10 | 40 | 1/40 (2 %), 2 % of runs (+/- 2) | 0/1 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 40, elite 0, boss 0, army 0 |

**The Juggernaut tuned (#1632)**: the Juggernaut rows of the table above are the tuned ones (it starts with no Heavy, its Bunks make them); the other
nine rows are unchanged, as the same command gives the same runs. The Juggernaut before, and the candidates, act 1 cleared of 40 seeds (`RUN_SIM_THREADS=8 RUN_SIM_LEVELS=0 cargo run --release --example run_sim 3`
for one commander and a level, about 6 minutes on 8 threads, bot-only numbers):

| Juggernaut's start | level 0 | level 5 | level 10 |
|---|---|---|---|
| 2 Heavies and Bunks (before) | 21/40 (52 %, +/- 8) | 16/40 (40 %, +/- 8) | 13/40 (32 %, +/- 7) |
| 1 Heavy and Bunks | 21/40 (52 %, +/- 8) | not measured | 6/40 (15 %, +/- 6) |
| **no Heavy and Bunks (kept)** | **16/40 (40 %, +/- 8)** | **4/40 (10 %, +/- 5)** | **1/40 (2 %, +/- 2)** |
| the Captain, Warden, Saboteur | 28, 30 and 45 % (+/- 7, 7, 8) | 15, 10 and 10 % | 2, 5 and 2 % |

At level 0 the four are 28, 30, 40 and 45 % (the Juggernaut is 12 points over the Captain, 1.1 standard errors of the difference, and under the Saboteur), at level 5
10 to 15 % and at level 10 2 to 5 %: inside the error of each other, which the bot's act 1 sample cannot split further.

**The same with the army's bot at 500 positions** (before #1632, the Juggernaut with its two Heavies; `RUN_SIM_ARMY=500`, 2 plies, 20 minutes on 8 threads, 4180 CPU seconds, 9 CPU seconds a run), to show what the bot's strength does:

| commander | level | runs | act 1 | act 2 | act 3 = the run | the runs lost to |
|---|---|---|---|---|---|---|
| The Captain | 0 | 40 | 4/40 (10 %), 10 % of runs (+/- 5) | 0/4 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 35, elite 2, boss 3, army 0 |
| The Captain | 5 | 40 | 2/40 (5 %), 5 % of runs (+/- 3) | 0/2 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 36, elite 2, boss 2, army 0 |
| The Captain | 10 | 40 | 1/40 (2 %), 2 % of runs (+/- 2) | 0/1 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 40, elite 0, boss 0, army 0 |
| The Warden | 0 | 40 | 7/40 (18 %), 18 % of runs (+/- 6) | 0/7 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 36, elite 1, boss 3, army 0 |
| The Warden | 5 | 40 | 3/40 (8 %), 8 % of runs (+/- 4) | 0/3 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 40, elite 0, boss 0, army 0 |
| The Warden | 10 | 40 | 0/40 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 40, elite 0, boss 0, army 0 |
| The Saboteur | 0 | 40 | 6/40 (15 %), 15 % of runs (+/- 6) | 0/6 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 36, elite 1, boss 3, army 0 |
| The Saboteur | 5 | 40 | 2/40 (5 %), 5 % of runs (+/- 3) | 0/2 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 37, elite 1, boss 2, army 0 |
| The Saboteur | 10 | 40 | 0/40 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | 0/0 (0 %), 0 % of runs (+/- 0) | fight 40, elite 0, boss 0, army 0 |
| The Juggernaut | 0 | 40 | 21/40 (52 %), 52 % of runs (+/- 8) | 2/21 (10 %), 5 % of runs (+/- 3) | 0/2 (0 %), 0 % of runs (+/- 0) | fight 29, elite 1, boss 10, army 0 |
| The Juggernaut | 5 | 40 | 14/40 (35 %), 35 % of runs (+/- 8) | 2/14 (14 %), 5 % of runs (+/- 3) | 0/2 (0 %), 0 % of runs (+/- 0) | fight 36, elite 1, boss 3, army 0 |
| The Juggernaut | 10 | 40 | 1/40 (2 %), 2 % of runs (+/- 2) | 1/1 (100 %), 2 % of runs (+/- 2) | 0/1 (0 %), 0 % of runs (+/- 0) | fight 40, elite 0, boss 0, army 0 |

**Before, with every fight and elite counted won** (`RUN_SIM_FIGHTS=0`, the table of #1537 and #1543: it kept the same boss fights, 20 minutes on 8 threads):

| commander | level | runs | act 1 | act 2 | act 3 = the run |
|---|---|---|---|---|---|
| The Captain | 0 | 40 | 32/40 (80 %), 80 % of runs | 15/32 (47 %), 38 % of runs | 8/15 (53 %), 20 % of runs |
| The Captain | 5 | 40 | 32/40 (80 %), 80 % of runs | 15/32 (47 %), 38 % of runs | 8/15 (53 %), 20 % of runs |
| The Captain | 10 | 40 | 31/40 (78 %), 78 % of runs | 17/31 (55 %), 42 % of runs | 11/17 (65 %), 28 % of runs |
| The Warden | 0 | 40 | 32/40 (80 %), 80 % of runs | 17/32 (53 %), 42 % of runs | 9/17 (53 %), 22 % of runs |
| The Warden | 5 | 40 | 32/40 (80 %), 80 % of runs | 17/32 (53 %), 42 % of runs | 9/17 (53 %), 22 % of runs |
| The Warden | 10 | 40 | 31/40 (78 %), 78 % of runs | 18/31 (58 %), 45 % of runs | 11/18 (61 %), 28 % of runs |
| The Saboteur | 0 | 40 | 32/40 (80 %), 80 % of runs | 15/32 (47 %), 38 % of runs | 8/15 (53 %), 20 % of runs |
| The Saboteur | 5 | 40 | 32/40 (80 %), 80 % of runs | 15/32 (47 %), 38 % of runs | 8/15 (53 %), 20 % of runs |
| The Saboteur | 10 | 40 | 31/40 (78 %), 78 % of runs | 17/31 (55 %), 42 % of runs | 11/17 (65 %), 28 % of runs |
| The Juggernaut | 0 | 40 | 32/40 (80 %), 80 % of runs | 15/32 (47 %), 38 % of runs | 8/15 (53 %), 20 % of runs |
| The Juggernaut | 5 | 40 | 32/40 (80 %), 80 % of runs | 15/32 (47 %), 38 % of runs | 8/15 (53 %), 20 % of runs |
| The Juggernaut | 10 | 40 | 31/40 (78 %), 78 % of runs | 17/31 (55 %), 42 % of runs | 11/17 (65 %), 28 % of runs |

Error: 40 runs, so a cell at 50 % is known to about 8 points (one standard error), one at 20 % to 6 points, and the cells below
act 1 count few runs (the Captain's act 2 is 4 runs). The boss fights are shared between the rows that reach them, so the rows are not independent samples either.

**Reading the table with the fights** (bot-only; every number is of the first table above unless said, an error of 5 to 8 points on the rates):

- **Written before #1632**: the bullets below read the table with the Juggernaut's two Heavies (52, 40 and 32 %); its tuned rows are above and the three other commanders' are unchanged.

- **The fights end the runs.** 33 to 40 of the 40 runs of every row but the Juggernaut's end at a fight (23, 25 and 33 for the Juggernaut), 0 to 3 at an elite and 0 to 5 at an act
  boss (the Juggernaut's 13, 12 and 4), and none under 4 marbles. The bot clears act 1 in **28 %** of the Captain's level 0 runs where it counted every fight won and cleared **80 %** (the table of before): more
  than 6 in 10 of that 80 % were the fights counted as won. With a bot that wins about half of its fights the act 2 and 3 cells hold 0 to 21 runs: the act curve (act 2 against
  act 3, the targets above) can be read only for the Juggernaut (act 2 cleared 6 of 21 at level 0, act 3 2 of 6) and **4 of the 480 runs clear the whole run**, all four Juggernaut's.
  The targets (act 1 about 85 %, the run 15 to 25 %) are far from the bot's 28 to 52 % and 0 to 5 %, which says how many fights the bot loses, not that the game is too hard.
- **The commanders move the rows now, the Juggernaut most.** Act 1 cleared at level 0: the Juggernaut **52 %**, the Saboteur 45 %, the Warden 30 %, the Captain 28 %. The Juggernaut is
  +24 points over the Captain (2.3 standard errors of the difference), +25 at level 5 (40 against 15 %) and +30 at level 10 (32 against 2, 5 and 2 %): the only commander that gets through
  the act 1 of level 10, and the only one to win full runs there (2 of 40). With the army at 500 positions he is also first (52 % against 10, 18 and 15 %), with the same 52 %. The Saboteur's
  45 % (15 % at 500 positions) and the Warden's 30 % (18 %) are not stable with the bot's strength: the Sparks and the Anchors need a bot that plans with them, which this one does not (the
  special marbles stand on the front and it never plans a burst). Two Heavies, that weigh 2 in a push (section 5), turn the bot's fights at both strengths.
- **The levels move the rows.** Act 1 cleared at levels 0, 5 and 10: the Captain 28, 15 and 2 %, the Warden 30, 10 and 5 %, the Saboteur 45, 10 and 2 %, the Juggernaut **52, 40 and 32 %**.
  Level 5 is the level 0 row with the sharper elites (1), the short rests (2) and the foes' one more special marble (3): it takes 12 to 35 points off every row (the Saboteur's 35 and the Warden's 20 the most).
  Level 10 adds 12 marbles to start (6), a second special marble to the foes (8), a quarter more search for them (10) and the hardened bosses (7): act 1 is cleared by 1 to 2 runs of 40
  of the three other commanders. The table of before showed the levels doing nothing (78 % at level 10 against 80 % at level 0): they act in the fights, which it did not play.
- **The relics** cannot be told apart from the commanders' special marbles: only the commander's own relic is held (Gyroscope, Hull plating, Detonator,
  Bunks), and the rows that differ from the Captain's differ by their marbles and their relic together. The Hull plating's marble and the Bunks' Heavy
  per rest (a rest is taken only below the ceiling, so rarely) are inside the errors above.
- **The foes' peak** (`RUN_SIM_PEAK`, the army at 500 positions, level 0, share of the runs clearing act 1, one standard error; peaks 500 and 2000 are the 40 seeds, 20000 the seeds 0 to 9):

  | peak | foes at the first fight and the end of act 3 | the Captain | the Juggernaut | time |
  |---|---|---|---|---|
  | 500 | 125 to 430 | 48 % (+/- 8) | 70 % (+/- 7) | 80 runs, 1460 CPU seconds (18 s a run), 17 minutes on 4 threads |
  | 2000 (the table's) | 500 to 1720 | 10 % (+/- 5) | 52 % (+/- 8) | 40 runs a row, 9 s a run |
  | 20000 | 5000 to 17200 | 30 % (+/- 14) | 20 % (+/- 13) | 20 runs, 714 CPU seconds (36 s a run), 11 minutes on 4 threads |

  The rate falls from 500 to 2000 and does not fall from 2000 to 20000 (the seeds 0 to 9 of the 2000 row are 10 % and 60 %, against 30 % and 20 %): a foe above 5000
  searches a ply or two more than the army's 2, and the bot's win rate in the first fight (40 % at 5000, 20 % above) is flat from there. The sample of 10 cannot say more.
  A run costs the foes' budget times the fights and bosses it lives to play, which is why 500 is dearer a run than 2000.

**Reading the table of before.** At level 0 the whole run is cleared by **20 %** of the runs (8 of 40), inside the 15 to 25 % target, with act 1 at **80 %**, short of
85 %. Act 3 is **not harder** than act 2 (53 % against 47 % of the runs that reach them, each known to about 10 points), which is not the
falling curve the targets describe. The Captain, Saboteur and Juggernaut rows are the same runs and level 5 is level 0 (their relics and the other
handicaps are not played, "Left out"); the Warden's Hull plating saves a marble now and then (1 more run won of 40). Level 10
clears **more** runs (28 %) than level 0 (20 %), a difference inside the error: a quarter more budget and 2 marbles fewer do not lower
what the bot clears, so ascension 7 and 10 do not show in this measure. The act bosses are won or lost on their rules, not on a
quarter of budget (below).

### What was tuned

`ACT_PERCENT` was [50, 100, 200, 300] and is [50, 120, 200, 300]. The sample that decided it is the boss of every act for 32 seeds
(`RUN_SIM_POOL=1`, 3 times the budget, the same seeds at every strength), bosses won out of 32:

- act 1 at 30, 40, 50 and 70 %: 26, 27, 27 and 25;
- act 2 at 80, 100, 120 and 150 %: 23, 26, 20 and 20;
- act 3 at 160, 200, 240 and 300 %: 20, 18, 19 and 19.

Act 1 does not move with its strength, so its 50 % stays. Act 2 falls between 100 and 120 % and not after, so 120 % is the smallest rise
that takes it (two earlier samples of runs at 100 % cleared act 2 in 40 of 58 and the whole run in 19 of 72, 26 %; the table's level 0 at
120 % is 15 of 32 and 8 of 40). Act 3 does not move from 160 to 300 %, so 200 % stays, and the fourth act's 300 % is not measured.

**Not reached by numbers alone.** The pool of act 1 is flat at about 82 % because of the bosses the bot loses at any strength: The
Hull beats it 2 or 3 times in 32 from 30 to 70 %, The Choir, The Chaplain and The Echo once or twice. In act 3 The Hull beats it 7 or 8 times in
32 at every strength from 160 to 300 % (it is in the pool whenever the Tundra is an exit), The Pulsar and The Ballast Mind some more. A flat
multiplier cannot tune a boss that is won or lost on its rules, which is what the issue saw in the ladder. So act 1 stays below 85 %, and
act 3 as easy as act 2, whatever `ACT_PERCENT` is set to between 30 and 300 %. Only the whole run, which is the product, was brought into its
band. The follow-up is #1599.

**#1599, the act 1 pool.** The Echo, The Hull, The Chaplain and The Choir leave the Meadow's act 1 pool (`ACT_ONE_LEAVES`, the same list in
`roguelite.ts` and `ladder.rs`, a test keeps them equal). Acts 2 and 3 stay the biome's boss, so the four are in no act's pool yet: the
acts 2 and 3 that take them are a separate decision, not made here. Bot numbers, `RUN_SIM_POOL=1` on 40 seeds, the boss of each act at its
`ACT_PERCENT`:

| act | before (15 bosses) | after (11 bosses) |
|---|---|---|
| 1 at 50 % | 32/40 (80 %), lost to chaplain 2, choir 1, echo 1, hull 2, railyard 1, stalker 1 | 31/40 (78 %), lost to ballast 1, magnetizer 2, pulsar 1, railyard 1, stalker 1, swarm 2, unstable 1 |
| 2 at 120 % | 26/40 (65 %) | 26/40 (65 %) |
| 3 at 200 % | 21/40 (52 %) | 21/40 (52 %) |

Act 1 did not reach the 85 % target: 78 %, one fight in 40 fewer won. Not run: the whole-run table (`RUN_SIM` without `RUN_SIM_POOL`), not measured here.

**Decision #1635, act 2 deals the four.** One run in 3 (`ACT_TWO_GUEST_ODDS`, the same in `roguelite.ts` and `ladder.rs`, a test keeps them
equal), the run seed deals act 2 The Echo, The Hull, The Chaplain or The Choir in place of the biome's boss, the same one whatever the exit
(the exit screen and the map name it): the biome keeps its own boss 2 runs in 3, and each of the four comes up about one run in 12. Act 1
keeps its 11, act 3 its biome's boss.

## 31. The HUD of an army fight, and reading the special marbles (#1540, #1541)

The HUD of a run's army fight (a fight, an elite; not an act boss, whose plate is its boss's) says what the fight risks and what
the marbles on the board do. Every number is the engine's own count, never a rule of the page's.

- **The score** replaces the ejection line ("Black ejected 0/6 · White ejected 0/6") in an army fight of a run, in no other mode
  (`runScoreHtml`, `client/src/runhud.ts`). Two lines: `Army 14 (run ends below 9) · lost 0` and `Bot ejected 0/6`.
  - *Army* is the Black marbles on the board now, so a Reinforce counts.
  - *Run ends below N* is the army on the board less the ejections the bot still needs (`win_ejections(2)` less the marbles lost),
    plus one: the army at which the fight, and so the run, is lost. The bot wins at the number of marbles in `army_game_against`, `army - 3`
    at most 6 (the rule of `MIN_ARMY`): **below 4** for an army of 9 or fewer, the issue's wording, and 5 less than the army above it,
    **below 9** for an army of 14. The test reads the engine's count for every army from `MIN_ARMY` to 14.
  - *Lost* is the marbles the bot ejected this fight (lost for the run), in the danger colour once it is above 0, with its word, never
    the colour alone.
  - *Bot ejected 3/6* is the bot's marbles out of the 6 that end the fight: the fight ends at 6 whatever the bot has left (it has 10, or 8
    in the first fight, so 4 or 2 stand at the end), so the bot's marbles left are not shown: they would not say how close the fight is.
  - Held upright the ejection line leaves the screen (ui.md section 4), this score does not: the pips are hidden on a phone, so the
    score is the only count. The pips stay as they are, 6 a side.
- **The legend** is a line per kind of special marble on the board, either side's, that the player has not met (`Legend`,
  `client/src/specialhelp.ts`): the glyph, the name and a short line (`GIST`: "weighs 2 in a push", "bursts on its 3rd turn"). The first fight
  shows every kind on its board, and a later fight the kinds it holds that no earlier fight showed. The kinds are met at the end of the fight
  they were on the board in, so a fight keeps its lines whole; they are kept in the browser (`ab-alone.roguelite.met`, a list of kinds), a
  blocked storage shows them every fight. A fight of an act boss that takes the build has it too (section 28).
- **The card** is the rule of one marble (`RULES`, plain words, "Weighs 2 in a push, on either side. A lone Heavy pushes 1 plain
  marble, and it takes 3 plain marbles to push it.") with whose it is, "yours" or "the bot's", and, for a Bomb, the turns it has left. It
  takes the place of the legend's lines on the plate, so the plate stays as tall as the lines were (it covers no cell of the board at any
  size, `phone-layout`), and is shown:
  - **on a hover**: the mouse over a special marble (the board's own hover cell, `pointermove`), at any time of the fight, legend or not;
  - **on a tap of a legend line**, the way on a touch screen, which has no hover. **A press on a marble never shows it**: a press selects the
    marble and plays moves as it always did, so a card never blocks a move. The line is a button (24 px high on a touch screen at least,
    keys reach it), and the card is a button too: a second tap puts it away.
  A card read while the placement screen is up lies over the screen, which is below it otherwise.
- **The words**: the rules say what the engine does (`specialhelp.test.ts` reads the engine: a Bomb's fuse is 3, and the numbers of the
  compendium's short help are in the rule), use no word the story keeps back (`SECRETS` of `story.ts`) and no term the player has not met
  by then (a push, an ejection, a burst).
- **Not in this slice**: the bot's marbles left, a card on a marble of another mode, the upgraded forms in the legend beyond their name and rule.

## 32. The bot's estimated rating, and a bot that grows (#1611)

The bot is a search budget in positions (`BOT_NODES`, 20000 on the plain bot at Normal). The player sees a rating and a level for it,
and meets a weaker one at the start that grows with the game. `client/src/botrating.ts` holds the numbers, pure and tested.

- **The measure** (`crates/abalone-core/examples/bot_rating.rs`, `cargo run --release --example bot_rating`): self-play between adjacent
  budgets, half of the games with each colour, from the same random opening of 8 plies for a pair of games (so a deterministic search does
  not play one game 30 times), 300 plies at most (an unfinished game is a draw). It prints each budget's score against the one below, the rating
  difference that score means (Elo, `400 log10(s / (1 - s))`) and its standard error. `BOT_RATING_LADDER=nodes:noise,...`,
  `BOT_RATING_GAMES`, `BOT_RATING_ANCHOR` and `BOT_RATING_PLIES` change it; `noise` is the percent of random moves, for a low budget
  that still plays well. None was needed: the lowest budget measured, 100 positions, is already under 1000.
- **The table**, 30 games a pair, 9 pairs, about 20 minutes on 10 cores (the dearest pair, 20000 against 40000, plays 117-ply games at
  about 0.7 s a move). The rating is anchored at 20000 = 1500; the error is one standard error, summed from the bottom (so it grows up
  the ladder):

  | positions | score against the budget below | difference | error | rating |
  |---|---|---|---|---|
  | 100 | | | | 960 (+/- 0) |
  | 200 | 0.617 | +83 | 46 | 1042 (+/- 46) |
  | 400 | 0.667 | +120 | 34 | 1163 (+/- 57) |
  | 800 | 0.483 | -12 | 12 | 1151 (+/- 58) |
  | 1600 | 0.500 | 0 | 0 | 1151 (+/- 58) |
  | 3200 | 0.500 | 0 | 0 | 1151 (+/- 58) |
  | 6400 | 0.683 | +134 | 56 | 1285 (+/- 81) |
  | 12800 | 0.633 | +95 | 54 | 1380 (+/- 97) |
  | 20000 | 0.667 | +120 | 57 | 1500 (+/- 113) |
  | 40000 | 0.633 | +95 | 36 | 1595 (+/- 118) |

  The error of 0 on 800, 1600 and 3200 is not a precise zero: the 30 games of those pairs were all draws, or too nearly all of them (two
  deterministic searches that agree repeat a position, and a repetition is a draw), so they carry no information, and the flat stretch
  is a measure artefact. The line a least squares fit gives through the ten points is **65 points a doubling of the budget** (the code's
  `RATING_PER_DOUBLING`); the points lie within 180 of it, most within 50. So a rating is `1500 + 65 log2(positions / 20000)`, to the
  nearest ten: 200 positions is 1070, 2000 is 1290, 20000 is 1500, 60000 is 1600.
- **The anchor is a decision, not a measure.** Only differences are measured. The plain bot at `BOT_NODES` on Normal is 1500 because no
  average Abalone rating is published (a search found none on Board Game Arena, Little Golem or the apps), and Board Game Arena's
  starting rating is 1500 (above 1600 a good player, 1800 an expert, 2000 a master: site-wide figures). So every rating shown is an
  **estimate**, the HUD and its tooltip say so, and it is not comparable with the player's Ranked rating, which starts at 1200 on its own
  scale (`elo.ts`, unchanged).
- **The levels**: Easy under 1300, Normal 1300 to 1599, Hard 1600 to 1799, Very hard 1800 to 1999, Master 2000 and up. At 65 points a
  doubling, Hard starts at 58000 positions, Very hard at about 500000 and Master at about 4.2 million (30 s or more a move on a native
  machine): out of reach of a bot that answers in seconds. The curves below therefore peak at 60000, **Hard**, and Very hard and
  Master are not reached by search alone. **The peak, said plainly:** the levels table stays as it is, but Very hard and Master read as
  **unused for now**: no bot, boss or setting of the game is rated there. **The next step, written, not built:** a stronger evaluation (the
  weights and terms of `evaluate`, not more positions), measured with the same ladder: `bot_rating` run again with the new evaluation
  at the same budgets gives its own table, and the rating of a budget is then read off that one. A search budget alone cannot get there:
  each doubling is worth 65 points, and a doubling costs twice the time of a move.
- **Over the game**: the bot of a plain game searches `BOT_NODES` times `PROGRESS_PERCENT[medals]`, the medals count (the bosses beaten, 0 to
  15), from 1 % (200 positions, 1070, the bottom of Easy) geometrically up to 300 % (60000, Hard, with all 15 medals; 300 % is the fourth act
  boss's own strength): 1, 1.5, 2.1, 3.1, 4.6, 6.7, 9.8, 14.3, 21, 30.6, 44.8, 65.5, 95.8, 140, 205, 300 %. It never goes down. The
  player's difficulty setting still multiplies it (50, 100, 200 %), so Hard at the peak searches 120000 positions, about 1700.
- **Over a run**: a fight or an elite of a run searches `runNodes` = that budget times a share that grows with the node's place,
  `25 * 4^t` percent, `t` = (act + row / rows of the act) / 3 from 0 at the first fight to 1 on the fourth act (the peak), then the
  factors of `fightBudget` as before (an elite twice, three times when marked, relics, ascension). An elite stays above the fights of its
  row. The rows of the act are read from the map, so a run saved before the pacing, with fewer rows, keeps working. Nothing of the curve is saved
  in a run. The act bosses keep `ACT_PERCENT`: the curve is for the bot of a fight, and the boss is its own measure (section 30).
- **Fixed strength** (nothing above applies): the Daily, the boss fight, the duel and co-op, online games, the Trainer, a wild marble
  of the Open world, and the test budget of `?nodes=`. Boss fights outside a run keep their own `node_budget` and balance, with no progress
  scaling; the HUD rates them all the same (below). The MCP's run follows `runNodes` (its `bot_nodes` is the peak) and its plain bot the fixed `bot_nodes`.
- **The HUD** shows `Bot ~1070 · Easy` in the middle of the pips row of a plain bot game and of a run's fight (a line of its own where
  the pips are hidden: a compact landscape window, a phone held upright; there the score text is smaller so the plate stays as tall). The map of a run has no such line: a
  fight node has no bot yet to rate. The test hook is `body[data-bot-rating]`.
- **A boss is rated by its own search budget** (second slice): `Boss ~1650 · Hard`, the same rating and level scale, in a boss fight
  outside a run, as the act boss of a run, in the Daily, and in co-op and duel fights (also for those that have no bot worker on the page).
  The number is `ratingOfBudget` of the boss's `node_budget` at the percent the fight searches it at: the difficulty setting, or the act's
  `ACT_PERCENT` (with the relics that change it) for an act boss, as the engine scales it (the wasm `Encounter.node_budget(percent)`
  returns it, one function for the plain, Choir and Swarm fights, so the page does not copy the numbers). Co-op and duel bosses are shown at
  100 %, not scaled. Same tooltip as the bot's: an estimate of the search alone, without the boss's special rules, which a rating does
  not count (a boss rated Easy can still be hard to beat). The test hook is the same `body[data-bot-rating]`.
- **The simulator** (`run_sim`, section 30) played only the act bosses, at `ACT_PERCENT`, and counted every fight and elite as won, so
  the curve could not change its table (since #1598 it plays the fights at the curve's budgets, `RUN_SIM_PEAK`, and `RUN_SIM_FIGHTS=0` is this measure): it was the same before and after (bot-only numbers, 12 seeds, level 0, the same seeds as the first 12
  of section 30's table).

  `RUN_SIM_RUNS=12 RUN_SIM_LEVELS=0 cargo run --release --example run_sim`, before (the code of main) and after (this commit), bot-only numbers:

  | commander | level | runs | act 1 | act 2 | act 3 = the run |
  |---|---|---|---|---|---|
  | The Captain, The Warden, The Saboteur, The Juggernaut (identical rows) | 0 | 12 | 9/12 (75 %) | 5/9 (56 %) | 2/5 (40 %) |
