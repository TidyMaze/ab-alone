# AB-ALONE: spec

> Abalone, rebuilt with the most over-the-top stack we can justify. Dead Space mood, souls-like
> bosses, online multiplayer, battle royale. The core game stays real Abalone.

Status: **draft v0**. Every section below is open for debate in an issue. A change to this file
goes through a PR that links the issue where it was decided.

## 1. Pitch

You wake up alone on the *CSV Ballast*, a derelict mining hauler drifting over a dead moon. The
crew is gone. What is left of them rolls through the corridors: black, fused spheres that push,
crush and throw each other into the void. To get off the ship you have to beat them at the one
game the ship's mind still respects.

*Ab-alone*: you are alone. *Scarab-alone*: the things you fight are shelled.

## 2. Core rules (non-negotiable, phase 0)

Standard Abalone, see the [official rules](https://en.wikipedia.org/wiki/Abalone_(board_game)).

- Hex board, 61 cells (radius 4), axial coordinates `(q, r)`.
- 2 players, 14 marbles each, standard start layout. Belgian daisy as an option.
- A move = 1 to 3 own marbles in a line, moving one step in one of 6 directions:
  - **inline** (along the line axis) or **broadside** (sideways, all target cells empty).
- **Sumito**: an inline group pushes a strictly smaller opposing group (3v2, 3v1, 2v1) if the
  cell behind the opponents is empty or off-board. Own marble behind blocks the push.
- A marble pushed off the board is lost. First to eject **6** wins.
- Draw / anti-stalling rule: open question (see issues).

Every game mode below is built on this rules engine. Modes add rules, they never fork the engine.

## 3. Stack (the over-the-top part)

| Layer | Choice | Why |
|---|---|---|
| Rules engine | Rust crate `abalone-core`, `no_std` friendly | One source of truth, fast, testable |
| Client logic | `abalone-core` compiled to WASM (`wasm-bindgen`, `wasm-pack`) | Same rules in browser and server |
| Rendering | Three.js (TypeScript, Vite) | Asked for. WebGPU renderer when stable enough |
| Server | Rust (`axum` + WebSocket), authoritative, same crate | No rules drift, anti-cheat for free |
| AI / bosses | Rust, alpha-beta first, MCTS later, in a Web Worker via WASM | Runs offline and server-side |
| Hosting | Static client on GitHub Pages, server on a small VM / Fly.io | Cheap |
| CI | GitHub Actions: `cargo test`, `clippy`, `wasm-pack build`, client build | Green main |

Rule: the client never decides the outcome of an online move. It predicts, the server validates.

## 4. Game modes, by phase

Each phase is a GitHub milestone. A phase starts only when the previous one is playable.

### Phase 0: Core engine
- `abalone-core`: board, move generation, move validation, sumito, win detection.
- Property tests: no move creates or destroys marbles except an ejection, every generated move is
  valid, perft-style move counts on the start position.
- CLI to play a game in the terminal (debug tool, not a product).

### Phase 1: Local hot-seat in the browser
- WASM build of the engine, Three.js board, 2 players on one screen.
- Input: select 1 to 3 marbles, pick a direction, preview the result (ghost marbles).
- Animations: slide, push, ejection into the void (marble falls and fades).

### Phase 2: Online 1v1
- Rust server, rooms by invite link, reconnection, server-side clock (optional).
- Spectator mode.

### Phase 3: Souls-like PvE (bosses)
- You play a sequence of **encounters** on board variants. Each boss = an AI with **phases**
  (changes rules, board or behaviour at 10, 8, 4 marbles left...).
- Souls-like loop: die, retry the same boss, learn its pattern. No difficulty slider.
- Boss design checklist (bosses must be fair and readable):
  1. A **tell**: the boss telegraphs its special move one turn ahead.
  2. A **counter**: every special move has a positional answer.
  3. A **phase change** that the player can see coming.
  4. Tuned by playtest logs (win rate per attempt), target: first win between attempt 3 and 10.
- Example bosses (to debate):
  - *The Hull*: board edges crumble every N turns (board shrinks).
  - *The Choir*: 3 small boss armies acting in sequence.
  - *The Marker*: converts one of your marbles if it is surrounded by 3 of its own.

### Phase 4: Battle royale
- N players (3 to 6) on a large hex arena (radius 8+), free-for-all.
- **Hull breach**: the outer ring decompresses every K turns (Dead Space zone). Marbles on it are
  sucked out.
- Turn structure: simultaneous orders resolved by the server (to define, see issues).
- Last player with marbles wins.

### Phase 5: Open world hub
- The ship is the menu: you walk (as a marble) through decks, each room is an encounter, a PvP
  table or a lore terminal.
- Lore delivered only through environment and audio logs. No cutscenes.

## 5. Art and audio direction

- Dead Space references: rusty industrial metal, flickering lights, fog, HUD projected in world
  space (no flat UI overlay where avoidable), heavy low-frequency sound.
- Marbles: player = dimly lit glass with an inner light; enemy = black organic shell (scarab).
- Ejection = sucked into space with a decompression sound.
- Accessibility: colorblind-safe player colors, a "clear board" toggle that turns off fog and
  post-processing.

## 6. Out of scope (for now)

Mobile native app, accounts and ranking, monetization, level editor, voice chat.

## 7. Open questions

Tracked as issues with the `question` label. Answers land in this file through a PR.
