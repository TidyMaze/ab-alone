# Game design

Status: draft v0, for issue #18. Spec only, no code. Companion to `SPEC.md`.

Hard constraint: the **move and sumito rules are unchanged** (what a legal move is, how a push
resolves). A mode may add a **rule layer around them** (board mask, end-of-turn hooks,
adjudication, scoring). Battle royale also needs an extension of the engine state (N owners,
217 cells, last-toucher per marble), but not of those rules. All hooks are built-in pure
functions run inside `apply`, so the AI search sees them. Every idea below must be testable on
a plain board with a move list.

There is no game server (see #36 and `tech.md`): every peer re-validates every move against a
signed, hash-chained move log.

Feature issues: #38 (input), #40 (anti-stalling), #41 (online), #42 (encounter framework),
#43 to #47 (bosses), #48 (calibration), #49 (battle royale), #50 (hub).

## 1. Design pillars

1. **Real Abalone first.** If a trick needs a new move type, we drop the trick. Bosses and
   arenas bend the board, the clock and the scoring, not the movement.
2. **Readable dread.** Every threat is shown one turn before it hits (tell). Horror comes from
   the mood and the pressure, never from hidden rules.
3. **Die, learn, retry.** A loss teaches one thing. Retry in under 5 seconds. No difficulty
   slider, no stat grind: the player gets better, not the character.
4. **Every rule is testable.** Each twist has an acceptance test on a board position. If we
   cannot write the position, the rule is too vague.
5. **Alone together.** Solo mode is lonely on purpose. Multiplayer modes stay short, with no
   chat and no alliances, so the mood holds.

## 2. Controls and move input (#38)

Input is the same in every mode. The client asks the WASM engine for legal moves, and every
peer re-validates online moves (see `tech.md`).

1. **Select.** Click or tap an own marble. Click an adjacent aligned own marble to extend the
   group, up to 3, contiguous, on one line. Dragging along a line selects the span. Clicking a
   selected end marble removes it.
2. **Direction ring.** Once a group is selected, a ring of up to 6 arrows appears around it.
   Only legal directions are drawn. Inline arrows show push power (1v1, 2v1, 3v2...).
3. **Preview.** Hovering (or focusing) an arrow draws ghost marbles at the result and
   highlights any marble that would be ejected. Sumito pushes show a red arrow chain.
4. **Confirm.** Second click or Enter plays it. Esc or right click backs out one step.
   Hot-seat can undo the last move before the next player confirms.
5. **Keyboard.** Tab cycles legal groups, `Q W E A S D` map to the 6 directions, Enter confirms.
   Whole game playable without a mouse.
6. **Touch.** Tap to select, tap arrow, tap again to confirm. No drag required.
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
- **Phases**: triggered by **boss marbles remaining** (The Alien: by your ejections, section 7.7),
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
| Lift | The deck above or below. The marble arrives on that deck's lift back. Its glyph holds a near-black arrow up or down the map, toward its deck, with a bar across while it is locked (3:1 on the lit cell, as a target arrow) |
| BR lobby | Shown closed until battle royale ships (Phase 4): a bar across its glyph, the HUD says closed, the marble may stand on it. Every deck has one |

Layout, the same on every deck so it is learned once: the centre and its 6 neighbours are floor,
the rooms sit on the outer ring. Lift up at the top (q 1, r -2), lift down at the bottom (-1, 2),
boss at the east corner (2, 0) between the two terminals (2, -1) and (1, 1), the tables on the
west side: hot-seat (-1, -1), bot (-2, 0), online (-2, 1), and the BR lobby on the south-west corner (-2, 2)
next to them. The Mess has no lift down, the Bridge no lift up, so every deck has 8 or 9 rooms.

Lobbies without a matchmaker: a PvP table or BR lobby is a public peer-to-peer room (Trystero)
where waiting players are listed and pick each other, plus invite links. Invite-first. With no
accounts the public list is unauthenticated and spammable, so it is **best effort** and never
required to play.

Lore is found, never told: terminals and audio logs only, no cutscenes.

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
board + side to move + **mode state** (crack timers, army cycle position, the Echo's remembered
move, boss phase), all inside the Zobrist hash. Otherwise repetition fires on positions that
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
| Arena | Hex radius 8 (217 cells) |
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
- From radius 3, a ring every 3 rounds until one marble group is left in the core.
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

| Lore slot (`world.md`) | Deck | Our boss | Issue | Play order |
|---|---|---|---|---|
| B1 Gatekeeper | 1 Mess | The Echo (the quartermaster repeats your count) | #46 | 1st, teaches tells |
| B2 Hull | 2 Cargo | The Hull | #43 | 2nd |
| B3 Choir | 3 Furnace | The Choir | #44 | 3rd |
| B4 Converter | 4 Chapel | The Chaplain (was The Marker, renamed, see #19) | #45 | 4th |
| B5 Mind | 5 Bridge | The Ballast Mind | #47 | 5th |
| Extra | 2 Cargo | The Alien (proposed by @Varadiell, section 7.7) | #588 | any time, boss menu |

Issue numbers keep their original order, play order is the last column. The Echo opens the
game because its ghost preview shows the tell in the move UI itself, so it teaches the "read
the tell" habit. Calibration target for the Echo: first win between attempt 3 and 6.

### 7.1 The Hull (#43): first environment boss

- **Concept**: the ship itself, rusted, falling apart under you.
- **Twist**: every 8 plies, rim cells crack, 2 plies later they vanish. A marble on a vanished
  cell is ejected, either side. Boss plays standard Abalone, depth 3.
- **Tell**: cracked cells wear a dark crack and tick for 2 plies.
- **Counter**: keep marbles off the rim, and **push boss marbles onto cracked cells**.
- **Phases**: P1 above. P2 when the boss has **10** marbles left: timer drops to 6 plies, two
  cells crack at once. P3 at **5**: timer 4, but the board is small and the boss is cornered.
- **Calibrate**: knob = crack interval and AI depth. Fail if P1 deaths are over 50 percent of
  all deaths (the first environment boss must not kill early).

### 7.2 The Choir (#44): three armies

- **Concept**: three groups of the crew, still singing in turn.
- **Twist**: the boss has 3 armies of 4 marbles (Alto, Tenor, Bass) on a radius 3 board. Each
  boss turn only **one army** may move, in a fixed cycle. Alto is aggressive (push weights),
  Tenor flanks (edge weights), Bass anchors (cluster weights). You have 10 marbles. Win by
  ejecting **10** (Decision #131: P3 starts at 8, so the last army is fought for two more), lose
  at 6 as usual.
- **Tell**: the army that moves next wears a steady pale ring, from the end of your previous turn,
  and each army has its own glyph on its marbles (world.md section 5: never a halo or colour alone).
- **Counter**: you know who moves next, so set a trap for that army. Wiping an army removes
  it from the cycle.
- **Phases**: P1 three armies. P2 when one army is wiped: the two others alternate and each
  gets **a free extra move every 4th turn** (they cover for the lost voice). P3 when one
  army is left (**4** marbles): it plays every turn but cannot push (no sumito).
- **Calibrate**: knob = player marbles (10), extra move frequency. Fail if nobody ever wipes
  the Bass first (the intended opener).

### 7.3 The Chaplain (#45): conversion by encirclement

- **Concept**: it marks the crew, then keeps them.
- **Twist**: at the end of the boss turn, a player marble with **3 or more adjacent boss
  marbles** flips to the boss. The marble count is conserved (conversion is not a loss for 6
  ejections, but it is a loss of material). **A flip costs the boss (#207):** on a boss turn
  that flips marbles, with a 3 in 4 chance (seeded per ply), the boss loses one marble to the
  void per flip, picked among its marbles that did not flip, and each one counts as an ejection
  for the player. Why: with free flips a 10x search never beat the boss (0 of 10), and with a
  sure cost it always did (10 of 10); encirclement is now a risk for the boss too.
- **Tell**: when you hover a move, each of your marbles that would flip at the end of the boss
  turn after it shows a steady glyph and outline (the check runs on the position after the
  hovered move, Decision #154: on the current position nothing is left to flip, the boss turn
  already flipped it). Not a black halo: it would vanish against a black shell. A flipped
  marble shows shell growing over the glass.
- **Counter**: break contact (move or push), or **surround a flipped marble with 3 of your
  marbles to flip it back**.
- **Phases**: P1 above. P2 when the boss has **8** left: void cells count as boss neighbours,
  so rim marbles flip at 2 contacts. P3 at **4**: a flip chains once (the flipped marble can
  flip another in the same turn), but the boss loses 1 marble to the void per flip (it
  pushes its own shell out), and from P3 that cost is certain, not 3 in 4.
- **Calibrate**: knob = threshold (3), flip-back threshold, AI aggression weight. Fail if the
  median attempt ends with fewer than 3 conversions seen (nobody learns the tell).

### 7.4 The Echo (#46): mirrors your moves

- **Concept**: the last crew member, who copies you out of habit.
- **Twist**: after each of your moves, the Echo plays the **point-reflected move** (through the
  board center) if legal. If not legal, its AI picks a move. Mirrored moves go through the
  normal validator, no new move type.
- **Tell**: a ghost of the mirrored move is drawn when you hover your arrow (preview shows
  both sides). Nothing is hidden.
- **Counter**: play moves whose mirror is bad for the boss (asymmetric pushes, edges), or
  force illegal mirrors so it uses its weaker free move.
- **Phases**: P1 above. P2 when the boss has **10** left: it echoes your **previous** move
  (one move late). P3 at **5**: it echoes with two groups, and the free move happens on
  every illegal mirror.
- **Calibrate**: knob = AI depth on free moves, delay. Fail if win rate on attempt 1 to 3
  exceeds 40 percent (too readable) or the median is over 12 attempts.

### 7.5 The Ballast Mind (#47): final exam

- **Concept**: the ship's mind, the thing that kept the game running.
- **Twist**: a radius 5 board with 6 fixed void pillars (symmetric). Boss has 16 marbles, you
  have 14. P1 is plain Abalone at depth 5. It reuses the hooks of earlier bosses (no new
  rule code).
- **Tell**: each twist keeps its original visual language, so the player recognizes it.
- **Counter**: those of the Hull, the Chaplain and the Echo.
- **Phases**: P1 at **16**, plain. P2 at **10**: Hull rim crack (interval 8) plus Chaplain
  (threshold 3). P3 at **5**: adds Echo of your previous move. Win at **12** ejections (4 boss
  marbles left, Decision #482), so all three phases are experienced.
- **Calibrate**: last. It must be harder than any previous boss, with first win between
  attempt 5 and 10, never a wall.

### 7.7 The Alien: a brood that grows

- **Concept**: something came up with the ore. It nests in the Cargo hold and lays eggs between
  the crates. It is weak at first and gets stronger the longer you let it breed.
- **Board and side**: standard radius 4 board, Cargo deck look. You have 14 marbles on the
  standard layout. The Alien starts with **8** marbles: its back row (5), the 2 middle cells of its
  second row and the centre cell of its third row, a wedge symmetric about the board's middle line
  (a row of 6 has no 3 outer cells, #588). Win at **6** ejections, lose at 6 as usual (`rules.md` §10.3).
- **Twist, the eggs**: every **2nd** boss turn (its 2nd, 4th, 6th... move), after its move, the
  Alien lays **1 egg** on an empty cell picked at random. The pick is deterministic, for P2P: a
  seeded integer PRNG of the fight's seed and the ply, in the engine, never `Math.random`, floats or
  the clock, so a Retry, the daily, a replayed game file and every co-op peer get the same eggs. At most **3** eggs
  are on the board at once; a lay with 3 eggs out is skipped. The pick: splitmix64 of the fight seed
  mixed with the ply (as the Hull's cracks), modulo the empty cells without an egg, in `q` then `r`
  order. The phase of the lay is the one before the boss move.
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
- **Calibrate**: knobs = starting marbles (8), lay interval (2), hatch time (4), egg cap (3), phase
  ejections (2, 4), AI depth (3). Fail if the median fight ends with fewer than 2 eggs crushed (nobody learns the
  counter) or the Alien's marble count only ever goes up (the brood outruns the player).
- **Where**: the boss menu and the daily challenge (it joins `boss_ids()`, so the daily pick of
  the days after it ships changes, section 7.6). It has no hub door: each deck keeps its one boss.

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
- Echo: reflect a move, assert it goes through the validator and equals the center reflection.
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
