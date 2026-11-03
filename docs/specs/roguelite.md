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
  back up to 14, or a special marble upgraded, section 10), event (a short text with 2 or 3 choices, a gain and a cost, some of them a gamble, section 16),
  unknown ("?", it turns into an event, a fight or a treasure when entered, section 16), treasure (a relic, section 9),
  shop (section 12), boss (a boss of the roster at the act's strength, ends the act). The currencies are the
  scrap of section 12 and the cells of section 15, which live and end with the run.
- **Army**: the run's progress is the number of marbles the player brings, 14 at the start. A
  fight starts with the army's marbles on the standard layout, the missing ones taken from the
  back row first; the bot has its 14 against an elite, 10 against a fight node (#1145): its
  standard layout without the 4 marbles of its front row (`FIGHT_FOES`), or the formation and special marbles of section 14. Marbles ejected in a fight are lost for the run. A won fight
  that does not end the run offers a reward (section 6): a marble or a special marble (Heavy,
  Anchor, Spark, and section 13's Magnet, Shield, Bomb, Medic), placed before the next fights.
- **End**: the run is lost when a fight is lost (a draw is a loss) or the army is below 4 marbles,
  and won by beating the act 3 boss. The bot wins a fight once the army is down to 3 marbles, so a
  fight never goes on after the run is lost; the army wins at the usual 6 ejections, also against the 10 marbles of a fight node (4 are left).
- **Meta**: unlocks only, between runs (section 8, #801, and the Collector's blueprints of section 15): other special
  marble types, relics, tactics and commanders (section 17), never power. Every run starts from zero.
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

The map screen (#1468) is an illustrated map. From the top: the run line, a legend (the icon and name of each kind of node, then
what an open ring and a filled one mean), and the acts one under the other, each under a header (`Act 2 · Tundra`: the biome is named
once it is picked, and for every act of a run that has exits, section 18). A node is a round line icon with its name under it (a
fight's crossed swords, an elite's skull with its archetype under the name, a rest's flame, a treasure's chest, a shop's bag, an
unknown's dashed "?", a boss's horned head, larger). The links are drawn under the nodes. The nodes a pick may take next have an accent
ring, and the links to them are dashed; the nodes taken are filled with the accent colour, the last of them with a second ring, and the
links taken are thick. Only the nodes that may be picked are enabled: the first row of act 1, then the links of the last node. After a
pick, the plate scrolls to put the first of them in the middle (before the first pick the commanders stay in view). Held upright on a
phone the plate sits above the thumb dock and scrolls inside itself (#1477); on a desktop it keeps clear of the toolbar. Every node
button keeps its `aria-label` (`Act 1, elite, The Wall`) and `data-node`, and holds its kind in `data-node-kind`.

## 3. Saving

The run (seed, army, its special marbles, its relics, its tactics, its scrap, the nodes picked, the special marbles placed on
the fight on and its moves, a reward waiting to be picked, an event, a rest site or a shop waiting for its
choice (with what the shop sold), a relic offer waiting to be taken, the commander picked (section 17), the ascension level (section 20), the line of what the last event told, and its cells, blueprints and Collector, section 15) is saved in IndexedDB after
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

  | Acts won in one run | Special marble type in rewards and events | Commander (14 marbles, section 17) |
  |---|---|---|
  | 0 | Heavy | The Captain (14 plain) |
  | 1 | Anchor, Shield | The Warden (12 plain, 2 Anchors) |
  | 2 | Spark, Medic | The Saboteur (12 plain, 2 Sparks) |
  | 3 (a run won) | Magnet, Bomb | The Juggernaut (12 plain, 2 Heavies) |

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
  cancels, and two marbles that cannot swap say so in the HUD line. Act boss fights (an `Encounter`, not an
  army fight) have no tactics for now.
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
  formation holds (10 against a fight, one fewer with the Saboteur) loses the marbles nearest the centre first (the
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

Five events repeat after two runs, and an event was one trade or Leave. The mode now holds **20 events**, each with 2 or
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
  effect. The map names it `?` and `Act 1, unknown` (aria-label); the summary of a run over names what it turned into.
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
  | Shelled crewmate | take it along: +1 marble; crack its shell: +30 scrap |
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
(one of section 9's first six, which every run has in its pools) and a **style**, at most 2 special marbles. Each has a
portrait (a line icon) and a line. Only variety carries over between runs, never power.

| Commander | Unlocked at (acts won in one run, section 8) | Style | Starting relic |
|---|---|---|---|
| The Captain | 0 | 14 plain marbles | Gyroscope |
| The Warden | 1 | 2 Anchors | Hull plating |
| The Saboteur | 2 | 2 Sparks | Detonator |
| The Juggernaut | 3 (a run won) | 2 Heavies | Bunks |

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

- **Act 1 is the Meadow**, the default: no hazard, no signature, the boss dealt as before. It is never an exit.
- **Exits**: `run::exits(seed, act, from)` (`run_exits` on the bridge) returns two different biomes for act `act` (1 or 2), never
  the Meadow nor the biome `from` the run leaves, drawn from the run seed and the act (a pure function, so a run replays).
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
  the relics and the budget of the client (an elite twice, the Jammer a quarter less) or the act boss at its act's strength.
  `run_place` puts the special marbles before the first move and `run_tactic` plays a tactic. The run reads the fight's end
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
| 9 | Meagre rewards | a reward offers one choice fewer (2, or 3 with the Lucky coin) |
| 10 | Hunted | the bot searches a quarter more positions in fights and elites, the Jammer's quarter less (section 9) included |

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
