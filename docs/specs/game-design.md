# Game design

Status: draft v0, for issue #18. Spec only, no code. Companion to `SPEC.md`.

Hard constraint: the **move and sumito rules are unchanged** (what a legal move is, how a push
resolves). A mode may add a **rule layer around them** (board mask, end-of-turn hooks,
adjudication, scoring), and change push weights or legality inside its own fight behind a flag
(pillar 1, Decision #935). Battle royale also needs an extension of the engine state (N owners,
217 cells, last-toucher per marble), but not of those rules. All hooks are built-in pure
functions run inside `apply`, so the AI search sees them. Every idea below must be testable on
a plain board with a move list.

There is no game server (see #36 and `tech.md`): every peer re-validates every move against a
signed, hash-chained move log.

Feature issues: #38 (input), #40 (anti-stalling), #41 (online), #42 (encounter framework),
#43 to #47 (bosses), #48 (calibration), #49 (battle royale), #50 (hub).

## 1. Design pillars

1. **Real Abalone first.** If a trick needs a new move type, we drop the trick. Bosses and
   arenas bend the board, the clock and the scoring, not the movement. A mode or boss may change
   push weights or legality inside its own fight, behind a flag (Decision #935): no new move type,
   and every other mode and the open-world fights (#313, #720) stay bit for bit unchanged.
2. **Readable dread.** Every threat is shown one turn before it hits (tell). Horror comes from
   the mood and the pressure, never from hidden rules.
3. **Die, learn, retry.** A loss teaches one thing. Retry in under 5 seconds. No difficulty
   slider, no stat grind: the player gets better, not the character. A rogue-lite run, a secondary
   mode like the boss fights (the core of the game stays Abalone 1v1), may grow its army inside
   the run; a run starts from zero, and what carries over is variety (other starting armies,
   always 14 marbles), never power (Decision #934).
4. **Every rule is testable.** Each twist has an acceptance test on a board position. If we
   cannot write the position, the rule is too vague.
5. **Alone together.** Solo mode is lonely on purpose. Multiplayer modes stay short, with no
   chat and no alliances, so the mood holds.

## 2. Controls and move input (#38)

Input is the same in every mode. The client asks the WASM engine for legal moves, and every
peer re-validates online moves (see `tech.md`).

1. **Select.** Click or tap an own marble. Click an adjacent aligned own marble to extend the
   group, up to 3, contiguous, on one line. Clicking a selected end marble removes it.
   **Drag (#794).** Press on an own marble and pass over in-line own neighbours (up to 3, one line) to select
   them, then release past the group: the move toward the nearest of the 6 directions from the group's centre
   to the pointer is played, as a click on its target would. A release with no legal move there, or still on
   the group, plays nothing and keeps the selection. A drag that starts anywhere else, or while a move is
   blocked, orbits the camera. Mouse and touch alike.
2. **Direction ring.** Once a group is selected, a ring of up to 6 arrows appears around it.
   Only legal directions are drawn. Inline arrows show push power (1v1, 2v1, 3v2...).
3. **Preview.** Hovering (or focusing) an arrow draws ghost marbles at the result and
   highlights any marble that would be ejected. Sumito pushes show a red arrow chain.
4. **Confirm.** Second click or Enter plays it. Esc or right click backs out one step.
   Hot-seat can undo the last move before the next player confirms.
5. **Keyboard.** The board is a tab stop. Tab and Shift+Tab walk the legal groups (past the last or the first the
   focus moves on, so the board never traps it), `Q W E A S D` pick the direction (NW NE / W E / SW SE, as on the
   hexagon), Enter confirms, Esc backs out one step. The group and the direction are announced in the HUD.
   Whole game playable without a mouse.
6. **Touch.** Tap to select, tap arrow, tap again to confirm. A drag works too (item 1).
7. **Not now.** Gamepad, voice, haptics.

Accessibility: legal-move highlight can be forced on, colorblind-safe palette, the "clear board"
toggle from `SPEC.md` section 5, reduced motion setting for ejection animations.

## 3. Modes

Rules delta is everything on top of standard Abalone (14v14, first to eject 6).

### 3.1 Hot-seat (Phase 1)

| Item | Rule |
|---|---|
| Players | 2, one screen |
| Layout | Standard, Belgian daisy as option |
| Delta | Anti-stalling (section 5), optional undo before confirm |
| Win | First to eject 6, or adjudication result |

Purpose: prove the input, the engine and the animation. Ships first.

### 3.2 Online 1v1 (Phase 2, #41)

| Item | Rule |
|---|---|
| Players | 2, invite link |
| Delta | **No clock in v1.** Later: an advisory clock, a timeout is only a claim (see below) |
| Rematch | Colors swap |
| Draw | Only by anti-stalling adjudication, no draw offers (avoids griefing) |
| Authority | No server. Every peer validates every move from the signed move log |

Clock, later: each peer only measures its own clock and a peer can lie or stall, so a timeout
cannot be enforced. Form: the opponent sends a signed "timeout" claim, and the game ends if the
slow side does not move within a 10 s grace. It stays advisory (no rating, no reward at stake).

### 3.3 Souls-like PvE (Phase 3, #42)

| Item | Rule |
|---|---|
| Players | You vs a boss AI |
| Delta | Board mask, boss rule hooks, phases on marble-count triggers |
| Win / loss | Normal win by 6 ejections, loss if you lose 6. **A draw is a loss** (the ship keeps the tie), so stalling never works against a boss |
| Retry | Same boss, same seed, instant restart |
| Difficulty | One tuning per boss, no slider |

Boss structure (all five follow it):
- **Concept**: the fiction, one line.
- **Twist**: the added rule, written as a hook (start of turn, end of turn, board mask).
- **Tell**: shown exactly one ply before the twist fires.
- **Counter**: a positional answer that exists on the board, not a stat check.
- **Phases**: triggered by **boss marbles remaining** (The Hull, The Echo, The Alien, The Rail Yard, The
  Magnetizer, The Pulsar, The Overseer and The Assembly Line: by your ejections, sections 7.1, 7.4 and 7.7 to
  7.12),
  always shown on the HUD as notches.

### 3.4 Battle royale (Phase 4, #49)

See section 6.

### 3.5 Open world hub (Phase 5, #50)

| Item | Rule |
|---|---|
| Entry | Visiting the root URL without query parameters or an active saved game lands directly on the Ship hub (Mess deck, #602). A "Ship" entry of the mode menu returns to it from anywhere. The menu itself stays ungated: the daily challenge and the tests need every boss |
| Space | One small hex map per deck (`client/src/hub.ts`): 19 cells (radius 2), drawn with the board's cell and marble meshes in that deck's look (`deck.ts`) |
| Walk | One glass marble rolls one cell at a time: click a neighbour cell, or the arrow keys (left and right along the row, up and down in a zigzag that keeps the column). A new save starts on the centre cell of the Mess |
| Rooms | Cells with a glyph, at least 6 per deck. Rolling onto a room enters it; standing on it again (Ship, Back to the ship) does not |
| Delta | None to Abalone. The hub is navigation, rooms launch the other modes |
| Gate | Only the lifts. A lift onto a deck opens once the boss of the deck below it is beaten (the Mess is always open). A locked lift keeps the marble out and Tally says one short line: "Lift to Cargo: locked. This deck's boss is still on the books." |
| Return | When the game a room started ends, "Back to the ship" puts the marble back on that room's cell. From an online table it leaves the room first |
| Save | Local storage (`client/src/progress.ts`, key `ab-alone.progress`): deck, cell and bosses beaten as versioned JSON. A save that does not read back (corrupt, another version) starts over on the centre cell of the Mess. Every boss win counts, the boss menu and the daily included. Later a signed export/import file (accounts are out of scope) |

Room kinds:

| Room | Enters |
|---|---|
| Boss | The deck's boss: the Echo (Mess), the Hull (Cargo), the Choir (Furnace), the Chaplain (Chapel), the Ballast Mind (Bridge) |
| Hot-seat, bot, online | A table: the same game as that mode menu entry. Every deck has the three |
| Terminal | One lore entry of the deck (`lore.ts`), in the reader. Two per deck |
| Medal room | On the Mess only (0, 2), a gold ring and core glyph (#812). The reader lists every boss of the roster in roster order with its medal and best turns (`medals.ts`), or Not beaten |
| Lift | The deck above or below. The marble arrives on that deck's lift back. Its glyph holds a near-black arrow up or down the map, toward its deck, with a bar across while it is locked (3:1 on the lit cell, as a target arrow) |
| BR lobby | Shown closed until battle royale ships (Phase 4): a bar across its glyph, the HUD says closed, the marble may stand on it. Every deck has one |

Layout, the same on every deck so it is learned once: the centre and its 6 neighbours are floor,
the rooms sit on the outer ring. Lift up at the top (q 1, r -2), lift down at the bottom (-1, 2),
boss at the east corner (2, 0) between the two terminals (2, -1) and (1, 1), the tables on the
west side: hot-seat (-1, -1), bot (-2, 0), online (-2, 1), and the BR lobby on the south-west corner (-2, 2)
next to them, and the Mess alone has the Medal room at the south cell (0, 2). The Mess has no lift down, the Bridge no lift up, so every deck has 8 or 9 rooms.

Lobbies without a matchmaker: a PvP table or BR lobby is a public peer-to-peer room (Trystero)
where waiting players are listed and pick each other, plus invite links. Invite-first. With no
accounts the public list is unauthenticated and spammable, so it is **best effort** and never
required to play.

Lore is found, never told: terminals and audio logs only, no cutscenes.

### 3.6 Rogue-lite run (#797)

A secondary mode: 3 acts of a branching map of fights, the army only shrinks. See
[roguelite.md](roguelite.md).

## 4. Core loop and progression

**Attempt loop (5 to 12 minutes):** enter encounter, read the board, spot the tell, apply the
counter, survive the phase change, win or die, retry. Loss screen shows one line: which phase,
which tell killed you.

**Meta loop:** hub, pick a door, boss, lore log, new deck opens, PvP table or BR as a break.

**Progression is knowledge and access, not power:**
- Unlocks: decks (new encounters), codex entries (lore, boss notes), marble skins, board skins.
- No health, no levels, no buffs. A day-one player with skill beats a grinder.
- Replays: each boss win stores a move list, replayable in the codex.
- Optional (open question Q4): one **relic** per run, a visible rule perk, only if calibration
  survives it.

## 5. Anti-stalling rule (#12, #40)

Lives in the **game-state wrapper** (`#10`), not in the move generator. Position identity =
board + side to move + **mode state** (crack timers, army cycle position, the Echo's moves never
echoed, boss phase), all inside the Zobrist hash. Otherwise repetition fires on positions that
are not identical. The repetition history and the 100-ply counter are part of the game state
and are rebuilt from the signed move log on every peer, so all peers agree.

1. **Threefold repetition**: the same position three times is a draw.
2. **No-ejection cap**: 100 plies in a row without an ejection ends the game. Decided by
   marbles ejected (equal here, so by marbles left), then by centrality (sum of hex distances
   to the center, lower wins), then draw. A 10-ply warning shows on the HUD.
3. **PvE**: draw = loss for the player. **BR**: see section 6, the breach makes stalling
   impossible.

Why not a plain 200-ply cap (proposal in #12): it ends lively games that are still evolving,
and it does not stop a 3-ply shuffle for 200 plies. Repetition catches the shuffle early,
the no-ejection cap catches slow dances without ejections.

Tests: scripted shuffle ends on the third repetition; a legal long game with an ejection every
99 plies never triggers the cap; both rules give the same result in hot-seat and online;
same board with a different boss timer or phase gives a different hash; history rebuilt from
a move log equals the live history.

## 6. Battle royale (#49)

| Item | Value |
|---|---|
| Players | 3 to 6 (default 6, bots fill, see below) |
| Arena | Hex radius 8 (217 cells), with a hole of radius 1 in the centre (7 void cells, #610) |
| Marbles | 10 per player, placed in 6 wedges at the rim sides, 3 players use alternating wedges |
| Win | Last player with marbles. If the breach ends the game, most marbles, then most ejections credited |
| Sumito | Same rule against any opponent, strictly smaller group, free cell or void behind |

**Bots** are a pure function of (round-start state, seed), computed before the reveal. Every
peer computes the same bot orders, nobody trusts a peer to run them, and a bot cannot peek at
human orders. N-player bots need MCTS or a cheap heuristic early, not "later".

**Hull breach** (the Dead Space decompression):
- Rounds 1 to 11: safe. Players close the distance.
- Round 12: outer ring (radius 8) cracks. One round later it is void.
- Then a new ring every 6 rounds, down to radius 3.
- From radius 3, a ring every 3 rounds down to ring 2, around the hole: its void at round 46
  ends every game.
- The hole in the centre (#610): parking there won every game, since once everyone is packed in
  the middle nothing can move. The centre cell and its 6 neighbours are void from round 1, so a
  marble next to the hole can be pushed into it.
- A marble on a cracked ring cell is **not** safe: it is ejected when the ring vanishes.
- Cracks glow and show a countdown. Wide warning, no surprise.

**Turn structure, options for #13:**

| Option | How | Pros | Cons |
|---|---|---|---|
| A. Sequential | Clockwise, 20 s clock | Trivial, engine as is | 5 players wait ~100 s between your turns |
| B. Simultaneous, conflict cancels both | All submit, conflicts cancel | Fast, chaotic | Needs a conflict definition, rewards guessing and copying, cancelled moves help the defender |
| C. **Simultaneous submit, ordered resolution** | All commit a signed hash of their order in 15 s, then reveal. Every peer applies the orders one by one in a rotating initiative order, each validated normally at its turn | Fast, no new conflict rule, uses the unchanged validator | A later order can fizzle, needs a clear reveal log |

Recommendation: **C**. A fizzled order (illegal by the time it resolves) means the player
loses the tempo, nothing else: it counts as a pass, by the same rule on every peer. Initiative
is derived from the round number and the seat list, so nobody is always last and every peer
computes it alone. Peers compare the state hash after each round. Resolution order is shown
before the reveal and replayed as a short animation.

Fairness detail: every peer treats an invalid or missing reveal as a pass and flags the
sender. The 15 s timer is a local deadline anchored on the coordinator's round-start message,
so a player on a slow link can lose a round. That is a known design consequence.

**Elimination:** at 0 marbles. Marbles vanish immediately (no zombie marbles blocking the
board). Eliminated players spectate.

**Anti-kingmaking:** a dying player must not decide the winner by choosing a target.
1. **Placement score.** Each game gives points by placement (6 players: 10, 6, 4, 2, 1, 0)
   plus 1 per ejection you caused. A doomed player maximizes ejections, not charity.
2. **Credit rule.** The last player whose move touched a marble gets the ejection.
3. **No chat, no alliances.** Emotes only (4 fixed ones).
4. **Hidden orders.** Orders are secret until the reveal (commit step, no trusted host), so
   targeting a leader needs a guess.
5. **Breach pace.** No hiding on the rim, no turtling in a corner for a draw.
6. **Fast elimination.** Marbles disappear on death, a loser cannot keep pushing for someone.
Measure it (acceptance): in 10 000 bot games (`royale_sim`, #547), the final-two leader should lose to a dying
third player less than 1 time in 5. Compare against option A as a baseline.

## 7. Boss roster

Five bosses, mapped to the lore slots of `world.md` (PR #51). Numbers (marble counts, timers) are **starting values** to tune in playtest.
Player always starts with 14 marbles on the standard layout unless stated.
Every boss mechanic can be turned against the boss (owner rule, #645): a new boss's twist must
also give the player a way to hurt the boss with it.
Each new boss: add its mechanic to The Ballast Mind's borrowed effects when it fits as a one-shot hook (a crack, a pulse, a polarity, a conversion today).

| Lore slot (`world.md`) | Deck | Our boss | Issue | Play order |
|---|---|---|---|---|
| B1 Gatekeeper | 1 Mess | The Echo (the quartermaster repeats your count) | #46 | 1st, teaches tells |
| B2 Hull | 2 Cargo | The Hull | #43 | 2nd |
| B3 Choir | 3 Furnace | The Choir | #44 | 3rd |
| B4 Converter | 4 Chapel | The Chaplain (was The Marker, renamed, see #19) | #45 | 4th |
| B5 Mind | 5 Bridge | The Ballast Mind | #47 | 5th |
| Extra | 2 Cargo | The Alien (proposed by @Varadiell, section 7.7) | #588 | any time, boss menu |
| Extra | 2 Cargo | The Rail Yard (proposed by @Varadiell, section 7.8) | #626 | any time, boss menu |
| Extra | 3 Furnace | The Magnetizer (proposed by @Varadiell, section 7.9) | #645 | any time, boss menu |
| Extra | 5 Bridge | The Pulsar (proposed by @Varadiell, section 7.10) | #675 | any time, boss menu |
| Extra | 4 Chapel | The Overseer (proposed by @TidyMaze, section 7.11) | #635 | any time, boss menu |
| Extra | 2 Cargo | The Assembly Line (proposed by @Varadiell, section 7.12) | #744 | any time, boss menu |
| Extra | 3 Furnace | The Unstable Core (proposed by @Varadiell, section 7.13) | #751 | any time, boss menu |
| Extra | 1 Mess | The Dual Room (proposed by @Varadiell, section 7.15) | #796 | any time, boss menu |

Issue numbers keep their original order, play order is the last column. The Echo opens the
game because its ghost preview shows the tell in the move UI itself, so it teaches the "read
the tell" habit. Calibration target for the Echo: first win between attempt 3 and 6.

### 7.1 The Hull (#43): first environment boss

- **Concept**: the ship itself, rusted, falling apart under you.
- **Twist**: one cell at a time cracks, picked by the engine's seeded PRNG (the same for every
  peer). Two player turns later it vanishes. A marble on a vanished cell is ejected, either
  side. Boss plays standard Abalone, depth 3, and its search sees the crack timers (#823): on
  every player ply of its tree the announced cracks tick and the due cells vanish with their
  marbles, so it pushes your marbles onto them and keeps its own off them. It does not guess
  where the next crack falls.
- **Tell**: a cracked cell wears a dark crack and ticks for 2 turns (it is announced 2 turns
  ahead; a turn is one player move and the boss reply).
- **Counter**: keep marbles off the cell that cracks, and **push boss marbles onto cracked
  cells**.
- **Phases**: by your ejections (P2 after **3**, P3 after **5**). P1: every
  **4** turns one **rim** cell cracks. P2: every **4** turns one cell **off the rim** cracks (a
  rim cell only if no other is left). P3: every **2** turns **any** cell cracks.
- **Calibrate**: knob = crack interval and AI depth. Fail if P1 deaths are over 50 percent of
  all deaths (the first environment boss must not kill early).

### 7.2 The Choir (#44, reworked in #747): three armies

- **Concept**: three groups of the crew, still singing in turn.
- **Twist**: the Choir plays on the **standard board** (radius 4). You have the standard 14
  marbles, the boss has **18** in 3 armies of **6** (Alto, Tenor, Bass), each a triangle: Alto on
  the left pointing up, Tenor in the middle pointing down, Bass on the right pointing up, with
  one empty cell between two groups where the rows allow it. Each boss turn only **one army**
  may move, in a fixed cycle (Alto, Tenor, Bass, Alto...). Alto is aggressive (push weights),
  Tenor flanks (edge weights), Bass anchors (cluster weights). Win at 6 ejections, lose at 6,
  as every boss.
- **Start cells** (`A` Alto, `T` Tenor, `B` Bass, `.` empty; the boss side is the top, rows
  `r = -4` to `r = -1`; the bottom row has two empty cells in the middle, a full gap does not
  fit there):

  ```
  r=-4      . T T T .
  r=-3     A . T T . B
  r=-2    A A . T . B B
  r=-1   A A A . . B B B
  ```

  In axial `(q, r)`: Alto `(-1,-3) (-2,-2) (-1,-2) (-3,-1) (-2,-1) (-1,-1)`, Tenor
  `(1,-4) (2,-4) (3,-4) (1,-3) (2,-3) (1,-2)`, Bass `(4,-3) (3,-2) (4,-2) (2,-1) (3,-1) (4,-1)`.
- **Tell**: the army that moves next wears a steady pale ring, from the end of your previous turn,
  and each army has its own glyph on its marbles (world.md section 5: never a halo or colour alone).
  The HUD line names the next army and how many are left.
  Next to the boss bar, one chip per army left (glyph, name, marbles left) shows the play order, the next army highlighted and "×2" on the last one (#816).
- **Counter**: you know who moves next, so set a trap for that army. An army with no legal move
  is skipped.
- **Phases**: P1 three armies, one moves per boss turn. P2 after **3** ejections: the army with
  the **fewest marbles left** is removed at once (a tie is broken by the engine splitmix64 of the
  fight seed and the ply), the two others alternate. P3 after **5** ejections: the weakest
  remaining army is removed the same way, and the last army plays **two moves** each boss turn.
  The marbles of a removed army sink (reduced motion: they vanish) and are **not** ejections:
  you still win at 6 ejections.
- **Calibrate**: knob = the ejection counts of the two removals (3, 5), the army search weights.

### 7.3 The Chaplain (#45): conversion by encirclement

- **Concept**: it marks the crew, then keeps them.
- **Twist (#748)**: at the end of **every** turn (yours and the boss's), any marble that touches
  **4 or more** marbles of the other side **changes side**, for **both sides** (a native boss
  marble flips to you just like a flipped one). The marble count is conserved: a flip removes no
  marble (the old threshold 3 and the loss of a boss marble per flip, #207, are gone), but it moves
  the boss's health (#810): your ejection credit goes **+1** per boss marble that flips to you and
  **-1** per player marble that flips to the boss, never below 0, and the boss's health is 6 minus
  that credit (the health bar, ui.md section 4, fills back one fragment on a heal and drains on a
  stolen marble). Both sides flipping in one turn net out. The martyr's blast does not move it
  down, it counts its own +1 (below). You still win at 6 (a credit that reaches 6 by flips wins),
  and your own count of lost marbles is unchanged by a flip. Void and off-board cells are not
  neighbours.
- **Tell**: when you hover a move, each of your marbles that the move would flip (the check runs
  right after your own move) shows a steady glyph and outline. Not a black halo: it would vanish
  against a black shell. A flipped marble shows shell growing over the glass.
- **Counter**: break contact (move or push), or surround a boss marble with 4 of yours.
- **Its play (#811)**: the Chaplain's search runs the end-of-turn conversion on every ply of its tree,
  yours and its own, and scores the health swing of each flip. Its evaluation also counts the marbles
  one neighbour short of converting (3 foes around them): a chance when they are yours, a danger when
  they are its. It seeks conversions and does not walk into one. The rules, the martyr and its node
  budget are unchanged.
- **Phases**: P1 above. **P2 the first time your credit reaches 4** (it never goes back when the boss heals), one time only: at the end of the
  next boss turn the Chaplain picks the marble whose explosion would convert the **most** of your
  adjacent marbles (a tie is broken by the seed) and announces it as the **martyr** (a steady
  marked ring and glyph on it, and a HUD line). At the end of the following boss turn the martyr
  explodes: every player marble adjacent to it converts, it is removed, and it counts as your
  **5th ejection**. If you push it off the board, or surround it with 4 of your marbles so it
  flips to you, before then, nothing explodes. A second martyr would hand you the 6th ejection,
  so there is none. There is no P3: the phase notches show two phases.
- **Explosion**: a flash and a ring of shards at the martyr's cell (reduced motion: a static
  flash), then the converted marbles take the flipped look: half shell and half glass, the Chaplain's
  pale glyph over the wax and pale cracks on the shell half (#790), a shape and a texture, never
  colour alone, 3:1 on every shell and glass skin.
- **Calibrate**: knob = threshold (4), the ejection count of P2 (4), AI aggression weight. Fail if
  the median attempt ends with fewer than 3 conversions seen (nobody learns the tell). Measured
  (#753, boss-balance.md section 3): the ladder pro player won 16 of 20 at 1x and 19 of 20 at
  10x, above the 7 to 9 of 10 target. With conversions on the health (#810) it wins 20 of 20 at
  both, in a median of 42 and 32.5 plies, and reaches P2; not tuned. After its AI played the conversion rule (#811) it won 10 of 20 at 10x and 0 at 1x;
  tuned in #821 (boss budget 2000 to 300, boss-balance.md section 3): 18 of 20 at 10x, 6 of 20 at
  1x. The rows tried are in boss-balance.md.

### 7.4 The Echo (#46, #859): every move is mirrored, both ways

- **Concept**: the last crew member, who copies you out of habit, and makes you copy it.
- **Twist**: when a move of one side can be played in **point symmetry** (through the board
  centre) by the other side, that mirror is played **at once for the other side as a free bonus
  move**, then that side plays its own move. Both ways: the Echo gets the mirror of your move, you
  get the mirror of its move. The mirror is playable when the normal validator accepts it for the
  side that gets it (no new move type). A bonus move is never mirrored itself (no chain).
- **Skipped bonus** (symmetric opt-out): a bonus that would end the game as a loss for the side
  that gets it is not played, and counts as echoed. A legal move never ejects its own marble nor
  gives the other side an ejection, so in practice this skips only the player's bonus that would
  make the third repetition or reach the 100-ply no-ejection cap (a draw is a player loss). Every other bonus
  is forced; there is no Decline button.
- **Phases**: P1 at the start; **P2 after 3** ejections credited to the player. There is no P3:
  the notches show two phases. In P2, after the bonus of the last move, the side also gets the
  mirror of **one older move** of the other side: the most recent one that was never echoed
  (its mirror was illegal when it was played) and whose mirror is legal now. Each move is echoed
  at most once, so a turn has at most two bonus moves. A skipped older bonus is also spent.
- **End**: the first side to 6 ejections wins, even during a bonus, and no bonus follows. When a
  main move brings both sides to 6, its mover is credited first. A draw is still a player loss.
- **Anti-stalling**: each bonus is a ply: it counts for the 100-ply no-ejection cap and for the repetitions,
  and the position hash includes the moves never echoed (section 5).
- **Tell**: while you prepare a move, its ghost shows the bonus moves it gives the Echo (the
  mirror, and in P2 the older move that will be echoed), each landing marble ringed in teal; a
  bonus that will be skipped is a ghost under a red cross (a shape, not colour alone). Once
  played, the bonus plies of the last move keep a teal ring on the marbles they moved until the
  next move, for both sides. Steady marks, no animation. Nothing is hidden (`Encounter.echo_tell`,
  `Encounter.last_bonuses`; MCP `play_move` lists them in `bonuses`).
- **Counter, turn it against the boss**: your free bonus moves. Every boss move whose mirror you
  can play is a free move for you: answer its pushes with their mirror, and in P2 keep blocked
  moves in its memory that turn into free pushes for you once their path opens. Play moves whose
  mirror is illegal or bad for the boss (asymmetric pushes, edges).
- **AI**: the Echo's search plays the bonus mirrors inside its tree, both ways, with the P2
  older-move bonus from the credits so far (`search_phased` with `echo_step`); the tree does not
  see repetitions, so it never skips a bonus. Node budget 100, one ply (#951; it was 400).
- **Calibrate**: knob = AI node budget. Fail if win rate on attempt 1 to 3 exceeds 40 percent
  (too readable) or the median is over 12 attempts. Measured after #859 (boss-balance.md section
  3): the ladder pro player wins none of 10 at 1x and 10x (2 of 40 at 10x), every loss a draw at
  the 100-ply no-ejection cap: the mirrors keep the board point-symmetric and the two-ply boss holds
  the rest. Tuned in #951 to 100 nodes: the pro player (10x the boss's own budget, 1000 nodes) wins
  7 of 10 (9 of 20), the #949 player at 400 nodes 8 of 10. Accepted by the lead at the low edge of
  the 7 to 9 target (decision on #951), to measure again after #958 (the player's bonus becomes an
  offer).

### 7.5 The Ballast Mind (#47, #749): final exam

- **Concept**: the ship's mind, the thing that kept the game running.
- **Twist**: a radius 5 board with 6 fixed void pillars (symmetric). Boss has 16 marbles, you
  have 16 too (#838): the point reflection of its start, two more marbles than the standard layout. It has no rule code of its own: every **3** turns, at the end of the boss turn (turns 3,
  6, 9...), it **borrows one effect of another boss**, picked by the engine PRNG (splitmix64 of the
  fight seed and the ply, so a Retry, the daily, a replay and every co-op peer get the same
  picks) among four one-shot effects that run that boss's own engine code (no copy):
  - **the Hull's crack**: one cell cracks and vanishes 2 player turns later, with its marble (P1 a
    rim cell, P2 an inner cell, P3 any cell). The Hull's timers tick at the end of every player
    turn, as for the Hull.
  - **the Pulsar's pulse**: one pulse from a random direction, force 2 in P1, 3 in P2, infinite in
    P3 (a group as big as the force resists), as for the Pulsar. Marbles it pushes off the rim are
    ejections of the side that loses them.
  - **the Magnetizer's polarity**: one marble of either side takes the next sign (+ then −), then
    the board settles: opposite neighbours repel, as for the Magnetizer.
  - **the Chaplain's conversion check**: every marble touching 4 or more marbles of the other
    side flips, both sides (threshold 4, no martyr), as for the Chaplain.
  Left out, not simple on this board: the trains, belts, eggs, armies, the martyr, the cores and
  the echo. The old mix (Hull rim crack, Chaplain threshold 3, Echo of the previous move) is gone.
- **Announce**: the HUD names the effect one turn ahead, during the turn before it lands
  ("Next turn: the Hull's crack"). The Hull's crack needs no longer lead, it is its own 2-turn
  warning once cracked. The pulse is also announced on the board (#838): the pulsar that will fire
  (the one off the corner the pulse comes from) shows its glowing core and its counter and ripples
  while the player thinks, as in the Pulsar's fight, with no chevrons. The other three effects
  pick their marble or cell as they land, so only the HUD line leads.
- **Fired**: once it has landed, the HUD names it until the next ply ("Fired: the Pulsar's pulse"),
  and an orange ring marks each cell it touched on the board (the cracked cell, the polarized marble
  and the marbles it repelled, the marbles a pulse pushed, the marbles the check flipped; none for a
  check that flips nothing). The effect still shows with the tell of its boss: the crack decal and
  its timer, the pulse shockwave and the sliding marbles, the polarity sign on the marble and the
  repulsions, the converted marks.
- **New bosses**: each new boss adds its mechanic to the borrowed effects when it fits as a one-shot hook (a crack, a pulse, a polarity, a conversion today).
- **Counter**: those of the Hull, the Pulsar, the Magnetizer and the Chaplain, one at a time, with
  the turn of warning.
- **Phases**: by ejections, as the bosses it borrows from: P1 at 0, P2 after **3** ejections, P3
  after **5**, shown as notches and in the HUD. A phase changes the strength of the effects (the
  crack, the force of the pulse), never the list. Win at **12** ejections (4 boss marbles left,
  Decision #482), so all three phases are experienced.
- **Calibrate**: last. It must be harder than any previous boss, with first win between
  attempt 5 and 10, never a wall.

### 7.7 The Alien: a brood that grows

- **Concept**: something came up with the ore. It nests in the Cargo hold and lays eggs between
  the crates. It is weak at first and gets stronger the longer you let it breed.
- **Board and side**: standard radius 4 board, Cargo deck look. You have 14 marbles on the
  standard layout. The Alien starts with **7** marbles (owner rule, #740): its back row (5) and the
  2 middle cells of its second row, a wedge symmetric about the board's middle line (a row of 6 has
  no 3 outer cells, #588). Its former front marble, the centre cell of its third row, the one
  nearest the board centre, is dropped. Win at **6** ejections, lose at 6 as usual (`rules.md` §10.3).
- **Twist, the eggs**: every **2nd** boss turn (its 2nd, 4th, 6th... move), after its move, the
  Alien lays **1 egg** on an empty cell picked at random, **within 3 cells (hex distance) of one of
  your marbles** when such a cell is free, else on any empty cell (owner rule, #740). The pick is deterministic, for P2P: a
  seeded integer PRNG of the fight's seed and the ply, in the engine, never `Math.random`, floats or
  the clock, so a Retry, the daily, a replayed game file and every co-op peer get the same eggs. At most **3** eggs
  are on the board at once; a lay with 3 eggs out is skipped. The pick: splitmix64 of the fight seed
  mixed with the ply (as the Hull's cracks), modulo the empty cells without an egg (the ones
  within 3 cells of your marbles when there are some), in `q` then `r` order. The phase of the lay is the one before the boss move.
- **Hatching**: an egg hatches after **4 of your turns**. The count runs down by 1 after each of
  your moves; when it reaches 0, at the start of the boss turn, a new Alien marble appears on the
  egg's cell and the egg is gone, then the boss plays. From the lay to the hatch, 8 plies go by (your 4 turns and the Alien's 4
  turns); with the 2 plies of the lay interval, an egg cycle is the 10 turns of @Varadiell's
  proposal.
- **An egg is not a marble**: it is a mark on an empty cell, like the Hull's crack, so it never
  blocks or changes a move or a push (`rules.md` §10: a mode adds rules, never changes a move).
  A marble that ends a move on an egg's cell, yours or the Alien's, pushed or not, **crushes**
  it: the egg is gone, no marble appears. At the end of each ply the crush comes first, then the
  count down and the hatch (your ply) or the lay (the Alien's ply), so a crushed egg never hatches.
  The Alien avoids its own eggs: its search keeps to the moves that leave every egg empty, unless
  every move lands on one.
- **Tell**: each egg shows a counter above it, the number of your turns left before it hatches
  (4, 3, 2, 1), facing the camera and readable at 3:1 (the pale digit on a near-black plate, drawn
  over the marbles). On 1 a pale glow under the egg pulses once a second, held still under reduced
  motion: it hatches after your next move. The HUD line reads "Eggs hatch: 1 in 1 turn · 2 in 4 turns".
- **Counter**: walk or push a marble onto an egg to crush it before it hatches, and press the
  Alien early, while it has few marbles. Every turn spent on eggs is a turn not spent pushing.
- **Phases**: P1 above. P2 after your **2nd** ejection: it lays an egg every boss turn. P3 after
  your **4th**: eggs hatch after **3** of your turns (the counter starts at 3). Unlike the other
  bosses, the phase follows the ejections credited to you, not the Alien's marbles left: the hatches
  add marbles and the fight ends at 6 ejections, so a marble count would never be reached (#621).
  A hatch never brings an earlier phase back; an egg keeps the counter it was laid with. The rim
  notches count the ejections left until the next phase.
- **Calibrate**: knobs = starting marbles (7), lay interval (2), hatch time (4), egg cap (3), phase
  ejections (2, 4), AI depth (3). Fail if the median fight ends with fewer than 2 eggs crushed (nobody learns the
  counter) or the Alien's marble count only ever goes up (the brood outruns the player).
  Measured in #646 and #667 (`alien_sim`, 50 seeds, `boss-balance.md` section 3): the rule holds
  against the ladder player at 10x and 1x the boss budget (median 2 eggs crushed, the count drops in
  every fight), but the ladder player wins every fight, 50 of 50 at both budgets, against the 7 to 9
  of 10 at 10x of the other bosses. No single knob above brings it inside: with more start
  marbles, up to the 14 of the standard layout, the player still wins every fight at 10x, and a
  faster or bigger brood or a bigger boss budget wins it no fight even at 1x. Owner decision on #667: the Alien stays as it is, the bot ladder cannot
  calibrate this boss, and humans judge its difficulty.
- **Where**: the boss menu and the daily challenge (it joins `boss_ids()`, so the daily pick of
  the days after it ships changes, section 7.6). It has no hub door: each deck keeps its one boss.

### 7.8 The Rail Yard: freight trains sweep whole lines

- **Concept**: the ore hauler's cargo rail yard. Freight trains still run on the old tracks
  through the Cargo hold, and they stop for nothing on the line.
- **Board and sides**: standard radius 4 board, 14 marbles each on the standard layout, Cargo
  deck look. Win at **6** ejections, lose at 6 as usual (`rules.md` §10.3). The boss plays
  standard Abalone.
- **Lines**: a train runs along one **whole line** of the board, edge to edge: a row on any of
  the 3 axes, 27 lines of 5 to 9 cells. Line `9 * axis + offset + 4`: axis 0 holds the cells with
  `r = offset` (it runs E or W), axis 1 `q = offset` (SE or NW), axis 2 `q + r = -offset` (NE or
  SW), offset -4 to 4. A track is a line and the end the train enters by: track `2 * line`
  enters at the line's cell of lowest `q` (lowest `r` on axis 1), track `2 * line + 1` at the
  other end.
- **The pass**: a train ejects **every marble on its line, either side**. A boss marble it
  ejects counts as an ejection for you, one of yours for the boss, as the Hull's voids. If one
  pass brings both sides to 6, the boss wins (it is credited first).
- **Announce**: each train is announced **5 of your turns** ahead. Its counter starts at 5 and
  goes down by 1 after each of your moves; after your 5th move from the announce it passes,
  before the boss replies. At the end of your move the order is: the counters go down, the
  trains at 0 pass, then a new train may be announced.
- **Rhythm**: the first train is announced at the end of your **turn 1** (owner rule, #740), so you
  see it during turn 2: there is none at the start. Then a new one is
  announced at the end of your turn `n` (your moves so far) when `n` is a multiple of **10** in
  P1, **5** in P2, **3** in P3, with the phase at the start of that turn.
- **No overlap**: a new train takes a line that no announced train holds (lines may cross).
  At most 2 trains are announced at once, and their passing
  turns always differ, as they were announced on different turns.
- **Deterministic, for P2P**: the track is splitmix64 of the fight seed mixed with the ply (the
  Hull's cracks), modulo the free tracks, in track order. No
  `Math.random`, floats or clock: a Retry, the daily, a replayed game file and every peer get the
  same trains.
- **Moves never change** (`rules.md` §10): a train is a hook between plies, like the Hull's
  crack. It is no marble and no wall, and moves and pushes are standard Abalone.
- **Tell**: chevrons pointing the way the train runs, at the two board edges where the line
  enters and leaves and on every cell of the line, readable at 3:1, and the counter (5 to 1) at
  the entry edge, facing the camera. Rails run under the line, out past both edges onto the
  deck. The HUD line reads "Trains pass: 1 in 2 turns · 1 in 5 turns".
- **The pass, drawn**: a low-poly freight train, a locomotive and ore wagons in the Cargo look,
  comes in at the entry edge, runs the line and leaves at the other edge. Each marble on the
  line is knocked off with the ejection fall when the train reaches it. Reduced motion: the
  train jumps across, no slide, and the marbles fade.
- **Counter**: move out of the line in time, or push boss marbles onto it. The boss AI avoids
  announced lines, as you should: its search keeps to the moves that leave the fewest of its
  marbles on the announced lines. Its budget is the Hull's (3000 nodes).
- **Phases**: P1 at the start, **P2 after 3 ejections** credited to you, **P3 after 5** (a
  boss marble a train ejects counts), as The Alien's phases (#621).
- **Calibrate**: knobs = announce lead (5), rhythm (10, 5, 3), AI depth. Fail if the median fight
  ends with no boss marble ejected by a train (nobody learns the counter).
- **Where**: the boss menu and the daily challenge (it joins `boss_ids()`, so the daily pick of
  the days after it ships changes, section 7.6). It has no hub door: each deck keeps its one boss.

### 7.9 The Magnetizer: polarities that repel

- **Concept**: the smelter's lifting magnets came back on by themselves. Whatever runs the Furnace
  now charges the marbles, yours and its own, and two opposite charges side by side throw each
  other apart.
- **Board and sides**: standard radius 4 board, Furnace deck look (its magnet cranes). 14 marbles
  each on the standard layout. Win at **6** ejections, lose at 6 as usual (`rules.md` §10.3).
- **Polarity**: any marble, **yours or the boss's**, can carry a polarity (+, − or none, owner rule
  #740). A polarity moves with its marble (moves, pushes, repulsions); an ejected marble loses it.
  The fight starts with none.
- **Assignment** (owner rules, #671, #740): one marble picked at random among **every marble on the
  board, both sides**, gets a polarity. The pool holds only the marbles with **no polarity**; the
  polarized ones join it only when every marble is polarized. The signs **alternate over the whole
  fight**, not per side: the first polarity is +, the next −, then + and so on. The picked marble
  takes the next sign of the cycle (no change if it already holds it). No coin, no flip.
- **Announce, one turn ahead**: at the start of your turn `t − 1`, when turn `t` is an assignment
  turn by the phase at that moment, the engine picks the marble and its coming sign and announces
  both. At the start of turn `t` that marble takes the announced sign (no change if it already
  holds it). The announce follows its marble (moves, pushes, repulsions) and is kept if the phase
  changes in between; the following schedule uses the new phase. If the marble leaves the board
  before turn `t`, turn `t` picks a marble at random with no announce. In P3 the assignment of a
  turn and the announce of the next happen together.
- **Repulsion**: two marbles of **opposite** polarity on adjacent cells, of either side, repel: each moves
  **1 cell straight away from the other**, along the line they share. The push ignores sumito
  (owner rule): every marble in front of it on that line, of either side and any number, moves one
  cell too, and the last one goes off the board if the line reaches the rim (ejected). A boss
  marble ejected this way counts for you, one of yours counts for the boss. Same polarity: nothing.
  After it repels, the pair **loses both polarities** (#671); the marbles it pushed keep theirs, so
  a pushed polarized marble can still repel in the same settle.
  Your own moves and pushes stay standard Abalone (`rules.md` §10): a repulsion is a hook between plies.
- **Settle (owner rule)**: after every ply (yours and the boss's) and after every assignment, the
  engine lists every repelling pair (in `q` then `r` order of the pair's first cell), the PRNG
  draws **one pair**, it repels, the list is rebuilt (chain reactions) and so on until no pair is
  left. Safety cap: 64 repulsions per settle; the engine tests show random fights never reach it.
- **Rhythm**, at the **start of your turn** (after the boss's ply settles, before you move, so you
  see the new polarity first; then the board settles, and a new pair may repel at once). Your
  turns count from 1:
  - **P1** (start): turns 3, 6, 9... (every **3rd**).
  - **P2** after your **3rd** ejection: every **2nd** turn (the even turns).
  - **P3** after your **5th** ejection: **every** turn.
  The phase is the one before the boss's ply that ends just before that turn.
- **Deterministic, for P2P**: every random pick (the marble, the pair) is splitmix64 of the fight
  seed mixed with the ply, in the engine, never `Math.random`, floats or the clock; the sign cycle
  has no randomness.
- **Tell**: a polarized marble wears a pale **+** or **−** glyph on top (a shape, not a colour,
  3:1 on both glass skins). A marble whose polarity the last assignment set or changed wears a
  pale ring until the next ply. The announced marble wears an indicator floating above it: the
  coming sign on a pale-edged near-black diamond, distinct from the disc on top and from the
  ring, and the announced marble itself **blinks in opacity** about once a second until it gets its
  sign (reduced motion: a steady pale outline instead, #741). Repulsions play in the engine's order: the pair slides apart and its glyphs fade out, the
  pushed lines slide, an ejected marble falls; reduced motion jumps to the end. The HUD line reads
  "Polarity in 2 turns" (P1, P2), "Polarity next turn" when the next turn assigns, and "Polarity
  every turn" in P3.
- **Counter, turn it against the boss**: walk a + marble next to a − marble aimed at a boss line:
  the repulsion shoves 3 or more boss marbles with one marble and can eject the last one, breaking
  a defence sumito never could. Keep opposite marbles apart near your own rim. The boss search sees
  repulsions (every ply of its tree settles, with the seed 0 for the pair draws) and keeps its
  marbles out of your repulsion lines; it cannot foresee an assignment.
- **Calibrate**: knobs = rhythm (3, 2, 1), phase ejections (3, 5), AI depth (3, the Hull's 3000
  nodes). Fail if most fights end with no boss marble ejected by a repulsion (nobody learns the
  counter) or most losses come from the player's own repulsions in P3.
- **Where**: the boss menu and the daily challenge (it joins `boss_ids()`, so the daily pick of
  the days after it ships changes, section 7.6). No hub door: each deck keeps its one boss.

### 7.10 The Pulsar: pulses that push the board like a sumito

- **Concept**: the Bridge's navigation beacons came back on by themselves. Six of them stand round
  the board, and one at a time charges and throws a pulse across it.
- **Board and sides**: standard radius 4 board, 14 marbles each on the standard layout, Bridge
  deck look (the ship mind's core). Win at **6** ejections, lose at 6 as usual (`rules.md` §10.3).
  The boss plays standard Abalone.
- **Pulsars**: six pulsars, one off each corner of the hexagon. A push runs along the board's
  lines, and the six directions of the lines point at the corners, so the pulsar off the corner
  in direction `-d` pushes in direction `d`, away from itself, along the 9 lines parallel to `d`
  (the "one per side, pushing straight inward" of #675, set on the lines). A pulsar is named by
  the direction it pushes, in the move codes: `0` E, `1` W, `2` NE, `3` SW, `4` NW, `5` SE.
- **A pulse is a simulated sumito of force F** (owner rule): on every line, walk from the
  pulsar's end; the marbles come in contiguous groups, **both colours mixed**. A group **smaller
  than F** moves one cell away from the pulsar; the first group of **F or more** resists and
  **shields everything behind it** on that line, every group further on included. All the moves
  of a pulse are simultaneous (two groups never collide: a gap stays between them). A group whose
  head stands on the far rim loses that marble off the board (ejected). Example at F = 2: a lone
  marble is pushed, two aligned marbles resist and protect the marbles further on.
- **Force by phase**: **P1** F = 2, **P2** (after **3** ejections credited to you) F = 3, **P3**
  (after **5**) F infinite: every group moves. A pulse takes the force of the phase at the start
  of your turn, the one the counter showed, as the other bosses' tells.
- **Ejection credit**: a boss marble a pulse ejects counts for you, one of yours for the boss, as
  the Hull's voids and the Rail Yard's trains. If one pulse brings both sides to 6, the boss wins
  (it is credited first).
- **Rhythm**, in your turns: the active pulsar fires **3 times, 2 turns apart**, then **2 turns of
  rest** (owner), so 4 turns from its last pulse to the first pulse of the next one: pulses at
  the end of your turns 3, 5, 7, then 11, 13, 15, and so on (turn `n` with `n mod 8` = 3, 5 or 7).
  The first pulsar is drawn at the start of the fight, each next one right after the last pulse
  of the one before, **at random among the 5 others** (owner).
- **When** (owner): a pulse fires **right after your move, before the boss replies**, as the Rail
  Yard's trains. A move that ends the fight fires no pulse.
- **Deterministic, for P2P** (owner rule): a draw is splitmix64 of the fight seed mixed with the
  ply (ply 0 for the first pulsar), modulo 6 for the first pulsar, modulo 5 among the others in
  direction order for the next. No `Math.random`, floats or clock: a Retry, the daily, a replayed
  game and every peer get the same pulsars. The pulsar and its turn in the cycle live on the board
  and in the position hash.
- **Moves never change** (`rules.md` §10): a pulse is a hook between plies; your moves and pushes
  stay standard Abalone.
- **Tell**: each pulse is announced **2 turns ahead**: the pulsar charges, a steady glow on its
  core, its counter (2, then 1) beside it, facing the camera, and an amber chevron one cell out
  before each of its 9 lines, pointing the way it pushes (3:1 and more, the Rail Yard's chevrons).
  During a run the pulsar is always charging; the next pulsar starts charging 2 turns before its
  first pulse, so the rest shows no charge. The pulsar that fires **next turn** (counter 1) also
  loops two small faint shockwave rings on itself while you think (the pulse's ring, much smaller
  and dimmer; reduced motion: one static faint ring, #741). The HUD line reads "Pulse in 2 turns, force 2" ("force
  ∞" in P3).
- **The pulse, drawn**: a low-poly pulsar off each corner, in the Bridge's cold white: a base, a
  core that spins, and two beam cones along its push axis. On each pulse a **circular shockwave**
  grows from the pulsar across the board, the pushed marbles slide one cell and the ejected ones
  fall with the ejection effect, after the move's own slide. Reduced motion: the ring shows at full
  size and fades (no growth), the marbles jump.
- **Counter, turn it against the boss** (owner design rule): keep your marbles in groups of F or
  more facing the charging pulsar, shield your loose marbles behind them, and leave boss marbles
  alone or in pairs on the far rim: the pulse throws them off for you. The boss search sees the
  pulses (every player ply of its tree goes through the hook, with seed 0 for the next pulsar
  draw) and avoids them the same way. Its budget is the Hull's (3000 nodes).
- **Calibrate**: knobs = forces (2, 3, ∞), rhythm (3 pulses, 2 apart, 2 of rest), phase ejections
  (3, 5), AI depth. Fail if most fights end with no boss marble ejected by a pulse (nobody learns
  the counter).
- **Where**: the boss menu and the daily challenge (it joins `boss_ids()`, so the daily pick of
  the days after it ships changes, section 7.6). No hub door: each deck keeps its one boss.

### 7.11 The Overseer: burn its cores before the neurotoxin

- **Concept**: the Chapel's old test supervisor woke up. It sits bolted to the middle of the
  chamber, guards its personality cores, comments on your every move and floods the room with
  neurotoxin while you think.
- **Board and sides**: standard radius 4 board, Chapel deck look. 14 marbles each on the standard
  layout: the boss has its army (14) and plays it with standard Abalone. On top of it:
  - **The Overseer** on the centre cell `(0, 0)`. Nothing moves it: a move onto it is refused and
    a push whose line reaches it is refused, as a push into your own marble (`PushBlocked`). It is
    not a marble of either side and is never ejected.
  - **6 cores**, the cells 2 steps from the centre on the 3 middle rows: `(-1,-1)`, `(2,-1)`,
    `(-2,0)`, `(2,0)`, `(-2,1)`, `(1,1)`. A core never moves by itself. Both sides push it as an
    opponent marble (the sumito counts it, a line may mix it with the other side's marbles), but a
    push that would take a core off the board over the rim is refused: only an incinerator takes it.
  - **6 incinerators**, the rim cells of the 3 middle rows, each 2 steps beyond a core:
    `(-3,-1)`, `(4,-1)`, `(-4,0)`, `(4,0)`, `(-4,1)`, `(3,1)`. A normal cell for moves.
- **Burn**: at the end of every ply, yours and the boss's, every core on an incinerator burns
  (removed) and counts as **one ejection for you, whoever pushed it**. The incinerators also burn,
  by phase: the boss's marbles in P1 and P2, yours in P2 and P3; a burnt marble counts for the
  other side, as the Hull's voids. The phase of a ply is the one before it.
- **Win and lose**: win at **6** ejections as usual (`rules.md` §10.3): the 6 cores burnt win, and a
  boss marble ejected or burnt counts too. Lose at 6 of yours, a draw, or the **neurotoxin**: at
  the end of your turn **40**, if you have not won, the boss wins. Your 40th move still wins if it
  brings your 6th ejection.
- **Phases**: P1 at the start, **P2 after 2 ejections** credited to you, **P3 after 4**, one change
  each: P2 burns your marbles too, P3 stops burning the boss's (the Overseer reroutes the vents to
  spare its guards, so a boss marble may stand on an incinerator in front of a core).
- **Deterministic, for P2P**: nothing is random. The burns, the clock and the boss search are pure
  functions of the position; a Retry, the daily, a replayed game file and every peer get the same
  fight.
- **Moves never change** except the three rules above (the Overseer blocks, a core never crosses
  the rim, the burns between plies, `rules.md` §10).
- **Tell**: the Overseer is a dark hexagonal pedestal with a pale eye; a core is a pale marble with
  a dark eye on top, a shape and not a colour (3:1 on both glass skins). Each incinerator wears a
  warm disc crossed by 3 dark slots on its cell. A burning marble sinks into its vent and fades (reduced motion: a fade).
  **Vents by phase** (#741): from P2, when the vents start burning your marbles too, a toxic green
  haze rises from them (reduced motion: a faint still haze) and the HUD adds "The vents now burn
  your marbles too." for 2 plies.
  **It talks** (#741): the sarcastic line of each 20 % is typed (17 characters a second, monospace,
  a short flicker and a soft blip per character; reduced motion: all at once) in a bubble over its
  pedestal, held 3 s after the last character, then faded. A core burnt on a vent angers it: a
  red bubble that shakes (reduced motion: still), typed the same way, held 1 s, with one of 6
  lines picked from the fight seed and the ply (the same on every peer): "That core was
  load-bearing. Like your hopes.", "Do you know what that cost? No. You can't count.", "Stop
  touching my things.", "I will remember that. I remember everything.", "Congratulations. You
  broke something. Again.", "That was mine. Everything here is mine."
  **It goes** (#789): when the player wins, its pedestal explodes like the Chaplain's martyr (a flash and
  a ring of shards, reduced motion: a static flash), then its bubble types "Well done. You broke the
  last thing that cared about you." (held 3 s). The farewell has priority: the angry line due on the
  winning ply is dropped.
  The HUD line reads "Neurotoxin 25 % · 30 turns left", then one sarcastic line of the Overseer
  that changes with the level, every 20 %: "Take your time. The neurotoxin will wait.", "The
  neurotoxin is now at a level we call festive.", "You are doing very well. For a corpse.", "Most
  test subjects stop moving around now.", "Goodbye. I mean it this time."
- **Counter, turn it against the boss**: the boss's own push burns a core when it puts one on an
  incinerator, and the vents burn its marbles in P1 and P2: push a boss marble one cell onto an
  incinerator instead of two cells off the board. The boss search sees the burns (every ply of its
  tree burns, in the phase the credits so far give), plays the neurotoxin clock (the player's last
  turn is a boss win in the tree) and keeps cores and its marbles off the vents; it never
  pushes a core in unless every other move costs it more.
- **Winnable** (`cargo run --release --example overseer_sim`): the bot ladder's player (4x the boss
  budget, its search sees the burns) wins about half of 20 seeded fights inside the 40 turns. The
  example fails when it wins none.
- **Calibrate**: knobs = the clock (40), phase ejections (2, 4), AI depth (the Hull's 3000 nodes).
  Fail if most fights end with fewer than 2 cores burnt (nobody learns the counter).
- **Where**: the boss menu and the daily challenge (it joins `boss_ids()`, so the daily pick of
  the days after it ships changes, section 7.6). No hub door: each deck keeps its one boss.

### 7.12 The Assembly Line: conveyor belts between the armies

- **Concept**: the ore hauler's cargo assembly line. Three conveyor belts still run across the
  Cargo hold, and what stands on them is carried to the edge and dropped. Later their presses
  start stamping.
- **Board and sides**: standard radius 4 board, 14 marbles each on the standard layout, Cargo deck
  look (the factory-floor machinery fits the Cargo hold best, `world.md`). Win at **6** ejections,
  lose at 6 as usual (`rules.md` §10.3). The boss plays standard Abalone.
- **Belts** (owner): the three middle rows, which separate the two armies: the **centre belt**
  (`r = 0`, 9 cells, `q` from -4 to 4) and the two rows beside it (`r = -1`, `q` from -3 to 4, and
  `r = 1`, `q` from -4 to 3, 8 cells each). A belt runs toward +q or toward -q.
- **Pattern** (owner): the slots of a belt alternate **plain, strike, plain, strike**, from the
  slot on its lowest-`q` cell at the start. The pattern scrolls with the belt and loops (a slot
  leaving one end comes back at the other), so a marble stays on its slot while the belt carries
  it. The loop of the 9-cell belt has two plain slots side by side where it closes.
- **Moving** (owner): a running belt shifts every marble on it, of either side, **one cell** in
  its direction, **all at once and ignoring sumito** (a marble never pushes another): the marble on
  the downstream end **falls off the board**. It counts as an ejection for the other side: a boss
  marble for you, one of yours for the boss. If one turn brings both sides to 6, the boss wins (it
  is credited first), as the Hull's voids.
- **When** (owner): once per turn, **right after your move, before the boss replies**, as the Rail
  Yard's trains. A move that ends the fight moves no belt. At the end of your move the order is:
  the belts move, then the presses strike, then a strike is announced, then the boss plays.
- **P1** (start): only the **centre belt** runs, in a direction drawn at the start of the fight.
  It **reverses after every 5 of your turns**: turns 1 to 5 run one way, 6 to 10 the other, and so
  on, to the end of the fight.
- **P2** (after **3** ejections credited to you): the two 8-cell belts run too, always in the
  **opposite direction** of the centre belt: they reverse with it. The phase counts at the start
  of your turn, as the other bosses' tells.
- **P3** (after **5**): every **2 turns** (at the end of your turns 2, 4, 6...) each belt draws one
  **strike slot** at random among its 4 strike slots. It **blinks red for one turn**, then at the
  end of your next turn, after the belts moved, the press strikes the cell that slot is on: a
  marble there, of either side, is **destroyed** and counts as an ejection for the other side. The
  announced slot is the pattern slot, not a cell: it moves with the belt and the blink follows it.
- **Deterministic, for P2P** (owner rule): the first direction is splitmix64 of the fight seed
  (ply 0), the strike slots splitmix64 of the seed mixed with the ply, modulo 4 among the strike
  slots in order. No `Math.random`, floats or clock: a Retry, the daily, a replayed game and every
  peer get the same belts. The belts, their scroll and the announced slots live on the board and in
  the position hash.
- **Moves never change** (`rules.md` §10): a belt turn is a hook between plies; your moves and
  pushes stay standard Abalone.
- **Tell**: a **chevron** on every cell of a running belt points the way it runs; at the end of
  the centre belt a **counter** shows the turns left before it reverses (5 right after a reversal,
  down to 1 for the last turn in that direction); an announced strike slot **blinks red** during
  the turn before it strikes. The HUD line reads "Belts reverse in 3 turns" (P1, P2) and "Belts
  reverse in 3 turns - press strikes next turn" in P3 while a strike is announced.
- **Drawn**: modelled belts: a roller at each end, a belt surface that scrolls the way it runs
  (steel, with the strike slots drawn as dark press plates), a press hanging over each strike
  slot. A marble slides one cell with its belt, and the one on the end falls off with the ejection
  effect. On a strike the press **slams** down on its plate, and the marble under it is crushed.
  Reduced motion: the marbles jump, the belt surface does not scroll, no slam.
- **Turn it against the boss** (owner design rule): push boss marbles onto a belt that runs toward
  the rim, or onto an announced strike slot, and let the belt and the press eject them for you;
  keep your own marbles off the belts' ends, and off a blinking slot. The boss search sees the
  belts and the presses (every player ply of its tree goes through the hook, with seed 0 for the
  strike draws, so it does not see announcements still to come) and avoids them the same way. Its
  budget is the Hull's (3000 nodes).
- **Calibrate**: knobs = the reversal (5 turns), the strike rhythm (2 turns), phase ejections (3,
  5), AI depth. Fail if most fights end with no boss marble ejected by a belt or a press (nobody
  learns the counter).
- **Where**: the boss menu and the daily challenge (it joins `boss_ids()`, so the daily pick of
  the days after it ships changes, section 7.6). No hub door: each deck keeps its one boss.

### 7.13 The Unstable Core: charge your marbles, weigh more, do not overload

- **Concept**: the Furnace's reactor core went unstable. The cells at its heart charge whatever
  stands on them, and a charged marble weighs more in a push, for both sides, until it blows.
- **Board and sides**: standard radius 4 board, 14 marbles each on the standard layout, Furnace
  deck look (the reactor). Win at **6** ejections, lose at 6 as usual (`rules.md` §10.3). The
  rules below apply **inside this fight only**: every other mode and boss keeps `rules.md`
  unchanged, and the boss search uses them.
- **Energy cells**: the 7 centre cells (the centre and its 6 neighbours).
- **Charging** (owner): at the end of each turn of a marble's own side (your marbles at the end
  of your turn, the boss's at the end of its turn), a marble standing on an energy cell gains
  **+1 charge**; a charged marble off the energy cells loses **1**, down to 0. A charge belongs to
  its marble: it follows its moves and pushes.
- **Weight** (owner): in a push, each marble weighs **1 + its charges**, on **both** sides, the
  pushing line and the pushed line. A move still moves at most **3** of your marbles (`rules.md`
  §4), and a push succeeds when the pushing weight is **greater** than the pushed weight, as plain
  sumito (every marble weighs 1 out of this fight). Example: two marbles, one charged twice, weigh
  4 and push 3 plain marbles. **A single charged marble can push**: weight 2 pushes a plain
  marble. A charged marble in the pushed line resists more. The other rules stay: no push into
  your own marble, and the pushed line must end on an empty cell or off the board.
- **Overload**: a marble that reaches **4** charges is **ejected at once**, counted for the other
  side, like a Hull void.
- **P2** (after **3** ejections credited to you): the core **vanishes**. After the boss's next
  turn it is announced (the core flickers, the HUD says so), and at the end of your next turn the
  7 cells vanish for good (void, as the Hull's): marbles standing on them are ejected, counted
  for the other side, and a push into the hole ejects. Charges then only decay.
- **P3** (after **5** ejections): every **3** of your turns a **wedge shockwave** hits, right
  after your move. It is announced 1 turn ahead: the wedge glows. The board has 6 wedges around
  the centre, 10 cells each (the centre belongs to none): the cells `a·c(i) + b·c(i+1)` with
  `a ≥ 1`, `b ≥ 0`, where `c(0..5)` are E, NE, NW, W, SW, SE. The wedge holding the **most marbles**
  (both colours) at the announce is hit, a tie drawn by the PRNG. Every marble in it moves **1 cell
  toward the nearest rim** (the neighbour one ring further out, a tie drawn by the PRNG), outermost
  first, ignoring sumito; a marble whose cell ahead is taken stays, and one pushed past the rim is
  ejected, counted for the other side.
- **Deterministic, for P2P**: every pick is splitmix64 of the fight seed and the ply. The charges
  and the wedge clock live on the board and in the position hash. No `Math.random`, no clock.
- **Tell**: a charge indicator above every charged marble (1 to 3 pips, a shape and not a colour
  only, 3:1; 3 pips glow and flash as a warning), the core glows (pulsing energy), the flicker
  before P2's collapse, the glowing wedge before a shockwave. The HUD line says the next event.
  The collapse is a crackle and a fall, the shockwave a pie slice of light sweeping outward;
  reduced motion: no sweep, a flash.
- **Turn it against the boss** (owner design rule): charge your own marbles to break its lines
  with fewer marbles; push a boss marble that sits at 3 charges back onto the core so it
  overloads; crowd the boss into the busiest wedge in P3. The boss search plays the weighted
  rule and the hooks of both sides (budget 3000 nodes, the Hull's).
- **Calibrate**: knobs = charge per turn, overload at 4, phase ejections (3, 5), the wedge rhythm
  (3 turns), AI depth. Fail if most fights end with no overload.
- **Where**: the boss menu and the daily challenge (it joins `boss_ids()`, so the daily pick of
  the days after it ships changes, section 7.6). No hub door.

### 7.15 The Dual Room: two rooms where ejected marbles come back

- **Concept**: the Mess deck's two galleys, split by a gap in the deck. What you throw out of one
  room is thrown back into the other, until a bridge closes the gap.
- **Board and sides** (owner, #955): two rooms, each a hexagon of **side 4** (radius 3, 37 cells),
  one above the other, split by a **void** one cell-row wide. In the engine it is one board with a
  flag (`Board::dual`), no general multi-board system: the south room is the hex of centre
  `(-2, 4)` (rows `r = 1` to `7`), the north room the hex of centre `(2, -4)` (rows `r = -7` to
  `-1`), and the void is the row `r = 0`. The void's 5 cells (`q = -2` to `2`, the hex row between
  the two facing 4-cell edges) are off the board: a marble pushed into the void is **ejected**, as
  over the rim, and nothing moves or lines up across it. Every other mode and boss keeps its
  board. Mess deck look. Win at **6** ejections, lose at 6 as usual (`rules.md` §10.3).
- **Start** (owner counts, #955): **8** player marbles in each room on its far side, **5** boss
  marbles in each room near the void. The north room is the mirror of the south one (below).

  ```text
  P = player, B = boss, ~ the void (the bridge from P3)
   r=-7         P P P P             north room, far side
   r=-6        . P P P P
   r=-5       . . . . . .
   r=-4      . . . . . . .
   r=-3       . . . . . .
   r=-2        . B B B .
   r=-1         . B B .             facing edge
   r=0         ~ ~ ~ ~ ~            the void, 5 cells
   r=1          . B B .             facing edge
   r=2         . B B B .
   r=3        . . . . . .
   r=4       . . . . . . .
   r=5        . . . . . .
   r=6         . P P P P
   r=7          P P P P             south room, far side
  ```

  South room: player `(-5..-2, 7)` and `(-4..-1, 6)`, boss `(-1, 1)`, `(0, 1)`, `(-2..0, 2)`.
- **Mirror**: the cell symmetric to `(q, r)` across the void is `(q + r, -r)`, both ways. Each row
  keeps its distance to the void (the facing edge maps to the facing edge, the far side to the far
  side) and its place across the screen.
- **Return** (owner): a marble ejected (of either side), over the rim or into the void, **comes
  back one ply later**, at the end of the opponent's next move, in the **other** room. Its landing
  cell is **announced** on the board as soon as it is ejected.
  - **P1** (start): it lands on the **mirror** of the cell it was pushed off from. If that cell is
    taken, on the nearest empty cell of that room (hex distance, then the lowest `q`, then `r`),
    at the announce and again at the landing.
  - **P2** (after **3** ejections credited to you): it lands in the room with **fewer marbles**
    (both colours; a tie keeps the other room) on a **random empty rim cell** of that room (a cell
    next to the off-board, the void included).
  - **P3** (after **5**): a **bridge** fills the void: its 5 cells join the board, the whole row
    between the two facing edges, and marbles move and push across it as on one board. Ejected
    marbles **no longer come back**: the game ends at the 6th ejection.
  The phase is the one after the ejecting move: the 3rd ejection already returns as P2, the 5th
  is gone, and the bridge appears at the end of that move. A return announced before still lands
  (in its room, never on the bridge).
- **Win and loss** (lead): **every ejection counts**, even when the marble comes back: win at 6,
  lose at 6. A return is not an ejection and credits nothing.
- **Deterministic, for P2P**: every random pick is splitmix64 of the fight seed and the ply. The
  bridge, the counted ejections, the marble just ejected and the announced return live on the board
  and in the position hash. No `Math.random`, no clock.
- **Tell**: the announce mark on the landing cell (the colour of the coming marble) during the
  ply before it lands; the HUD line says where it lands, and that the bridge comes at 5.
- **Look**: the two rooms under one camera, the void a dark gap, the bridge's 5 cells coming down into
  the gap at P3, the returning marble dropping in on its mark. Reduced motion: no animation, the
  bridge and the marble appear.
- **Turn it against the boss** (owner design rule): the boss starts near the void, so push its
  marbles into the void; an ejected boss marble lands on the mirror of the cell you push it off
  from, so pick that cell to drop it into a trap in the other room (onto the rim in front of your
  line); keep the mirror of your own exposed rim cells covered; in P2 the return goes to the
  emptier room, so thin out the room you want it out of. The boss search plays the void, the
  returns of both sides and the bridge (every ply of its tree goes through the hook, seed 0 for
  the P2 draw).
- **The Ballast Mind** (owner rule, section 7.5): not borrowed. A return needs a second room and
  spans two plies (ejected, then back one ply later): it is not a one-shot hook on the Ballast
  board, which has one room.
- **Calibrate**: knobs = the phase ejections (3, 5), the start layout, AI budget. Fail if most
  fights end before P3 (nobody sees the bridge). Ladder: `boss-balance.md` section 3.
- **Where**: the boss menu and the daily challenge (it joins `boss_ids()`, so the daily pick of
  the days after it ships changes, section 7.6). No hub door.

### 7.6 Daily challenge (#166)

Each UTC day, everyone gets the same boss with the same seed, with no server (#195).

- **Day**: the UTC date of the device clock as `YYYY-MM-DD`. It changes at 00:00 UTC, in every
  time zone.
- **Seed**: the 32-bit FNV-1a hash of the text `ab-alone daily YYYY-MM-DD`, then the murmur3
  finaliser, as an unsigned 32-bit integer. Integer maths only, so every browser gets the same
  value (`client/src/daily.ts`, pinned by its unit tests).
- **Boss**: `boss_ids()[seed mod count]`, from the bosses the WASM bridge lists, never a list in
  the client. The same build gives the same pick to everyone; adding a boss to the bridge changes
  the pick of the days after it ships. Encounters are deterministic, so the same seed and the same
  player moves give the same boss replies.
- **Entry**: a Daily challenge button under the boss menu, labelled with the date and the boss
  name. It does nothing during an online game, like the boss menu.
- **Attempts**: every start of the daily counts one attempt of the day, Retry and a start after a
  reload included. The count lives in `localStorage` (key `ab-alone.daily`, value
  `YYYY-MM-DD n`) and only the current day is kept, so a new UTC day starts again at attempt 1.
  Blocked storage counts every start as attempt 1. The HUD boss block shows the day and the attempt.
- **Retry** on a daily starts the daily of the current day: after 00:00 UTC it is the new day's
  boss and seed, attempt 1.
- **Result card** (#196): when a daily fight ends, won or lost, a card shows a short text to
  share, three lines: `AB-ALONE daily YYYY-MM-DD: <boss name>`, then `Victory in N plies on
  attempt A` or `Defeat in N plies on attempt A` (N counts both sides' plies, A is the attempt of
  the day of that fight), then the site link `https://tidymaze.github.io/ab-alone/`. A plain text
  and a link, no signed record in v1 (a signed record can come with #39). Built in the browser
  (`dailyCard` in `client/src/daily.ts`), it leaves the browser only when the player copies it. A
  plain boss fight from the boss menu shows no card, and Retry hides it until the next end.

## 8. Boss calibration (#48)

**Targets (all per boss):**
- First win between attempt **3 and 10** (median across playtesters).
- At most 20 percent of players quit before their first win.
- No phase takes more than 50 percent of deaths (except the last phase of the final boss).
- At most 40 percent of deaths come immediately after an unanswered tell (if more, the tell
  is not readable, fix the tell before the AI).
- An attempt lasts 5 to 12 minutes. Retry takes under 5 seconds.

**Telemetry per attempt:** boss, seed, attempt number, result, phase reached, cause of death
(tell id or plain loss), marbles left, duration, move list. Local only. There is no upload
destination without a server: the player **exports a JSON file** and attaches it to a GitHub
issue if they want to share it (no prefilled form in v1).

**Method:**
1. **Bot ladder before humans.** Random, then alpha-beta depth 1 to 5. Each boss must be beaten
   by depth N and not by depth N minus 2. Run nightly in CI. This catches a broken boss
   (always won, never won) before a human ever sees it.
2. **Fixed seed per boss.** Same boss, same opening, so a retry teaches something. Boss search
   is **depth or node-count limited, never wall-clock** (time-boxed search differs per machine
   and would break retries and the CI ladder). The seeded RNG only breaks ties between equal
   moves. Hooks (crack, flip, echo, army cycle) run inside `apply`, so the search sees them.
3. **One knob at a time.** Per boss: AI depth, timer, threshold, marble count. Change one,
   replay the bot ladder, then 5 human playtests.
4. **Playtest of 5 humans per boss** (a mix of Abalone players and non-players), recorded
   moves, then read the death heatmap.
5. **Anti-skill-wall check:** a player who knows Abalone but never saw the boss must lose by
   attempt 1 or 2 and learn the cause from the loss screen.

## 9. Testability checklist

For each feature, the acceptance test is a position plus a move list:
- Hull: position with a cracked cell and a boss marble next to it, push, assert ejection.
- Choir: army order and halo, assert the skipped turn after a wipe.
- Chaplain: position with 3 contacts, end boss turn, assert flip. Position at 2 contacts, none.
- Echo: reflect a move, assert it goes through the validator and equals the center reflection;
  play a move, assert the other side got its mirror as a bonus ply, both ways.
- Ballast: phase changes at 16, 10, 5 boss marbles, assert hooks switch on.
- BR: bot simulation of 1000 games, assert one winner, no game over 150 rounds, no crash.
- Anti-stalling: scripted shuffle, scripted long game.

## 10. Open questions

Q1. **Boss AI strength curve (#42).** Depth only, or also eval weights? Depth is simple, weights
give each boss a "personality" (see Choir). Recommendation: both, depth is the global knob.

Q2. **Draw = loss in PvE.** Fair? Alternative: draw = retry without a counted attempt.
Recommendation: loss, it keeps the pressure.

Q3. **BR marble count.** 10 per player is a guess. Is the first contact too early or too late
on radius 8? Needs a bot simulation.

Q4. **Relics.** Optional run-level perks, or never? They add fun, they break calibration.
Recommendation: never in v1.

Q5. **Hub persistence without accounts.** Local storage is fragile. Recommendation: a signed
export/import save file (matches `tech.md`).

Q6. **Fog on bosses.** Hide boss marbles beyond a radius? Cool mood, bad for fairness and for
online. Recommendation: no.

Q7. **Clock in PvE.** None (souls-like pacing) or a soft clock to avoid 30 minute attempts?
Recommendation: none, but attempts are paused-free and a quit counts as a loss.

Q8. **Catch-up in BR.** Should the player with the fewest marbles resolve first in the
initiative order? It helps the weak, but it also helps whoever sandbagged on purpose.
