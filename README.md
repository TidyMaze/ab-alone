<div align="center">

# AB-ALONE

**You are alone. They are shelled. Push them into the void.**

[![CI](https://github.com/TidyMaze/ab-alone/actions/workflows/ci.yml/badge.svg)](https://github.com/TidyMaze/ab-alone/actions/workflows/ci.yml)
[![Pages](https://github.com/TidyMaze/ab-alone/actions/workflows/pages.yml/badge.svg)](https://tidymaze.github.io/ab-alone/)

### [▶ Play in your browser](https://tidymaze.github.io/ab-alone/)

No install, no account, no server. Just a board, the dark, and whatever is left of the crew.

</div>

---

## The signal

The **CSV Ballast**, a 2.1 km ore hauler, drifts over **Hollow**, a dead moon. Power at 11 %.

The crew mined slag-glass. Slag-glass remembers heat. Everyone who touched it hardened from the
skin inward, rounded off, and kept moving: black spheres with a faint pulse.

Before the end, the captain ordered every dispute settled on a board, so nobody else would get
hurt. The ship mind, **TALLY**, still enforces it. Pushing a marble off the board is the old
airlock cycle in miniature. Whoever goes over the edge is gone for good.

You are the last one with a clear visor. Six of them over the edge, and you walk out.

## The game

Real Abalone underneath. 61 cells, 14 marbles each, push 1 to 3 in a line, out-number to shove.
First to eject 6 wins.

On top of it, the ship:

| | Mode | State |
|---|---|---|
| 🕹️ | **Hot-seat** on one screen | ✅ playable |
| 🤖 | **Versus TALLY's bot** (alpha-beta, runs in a Web Worker); an Auto-play toggle lets the bot play your side in any offline fight, a boss needs its medal | ✅ playable |
| 📡 | **Online 1v1**, peer to peer, invite link, signed move log | ✅ playable |
| 💀 | **Souls-like bosses**, ten of them (below), from the Boss fight menu, a medal per beaten boss with your fewest turns | ✅ playable |
| 📅 | **Daily challenge**: one boss and one seed for everyone each UTC day, a result to share | ✅ playable |
| 🗺️ | **Rogue-lite run**: 3 acts of a branching map of fights against the bot, your army of 14 marbles carried from fight to fight, every marble lost is lost for the run; a won fight rewards a marble or a special marble (Heavy, Anchor, Spark) you place before the next fight | 🚧 fight and boss nodes, rewards and special marbles; elites, rest and events to come |
| 🤝 | **Fight together**: two players share one army against a boss online, turn about | ✅ playable |
| 🔥 | **Battle royale** on the Furnace deck: up to 6 seats, hidden orders (commit-reveal), the hull breach closes in, bots fill empty seats | ✅ playable, offline vs 5 bots and online |
| 🛰️ | **Ship hub**: walk five decks, lifts that open as you beat each deck's boss, game tables, lore terminals, an audio log per deck, a Medal room on the Mess deck | ✅ playable, new players land there |
| 🏆 | **Ranked** online, Elo and rank tiers | ✅ playable |
| 🧠 | **An AI agent plays** over MCP ([below](#let-an-ai-agent-play)) | ✅ runs on your machine |

Each boss bends one rule, tells you one move ahead, and has a positional answer on the board.
Die, read the tell, retry with the same seed.

| Deck | Boss | The rule it bends |
|---|---|---|
| Mess | **The Echo** | when a move's mirror through the centre is legal, the other side plays it as a free bonus move, both ways: it gets the mirror of yours and you get the mirror of its own; after 3 ejections it also mirrors an older move |
| Cargo | **The Hull** | one announced cell at a time cracks, then falls away under both sides |
| Furnace | **The Choir** | three armies of six in triangles, one sings (moves) per turn; the weakest army is removed after 3 and 5 ejections, and the last one sings twice |
| Chapel | **The Chaplain** | a marble touching four foes changes side, a boss marble won costs it health and one lost heals it, and at four ejections a martyr explodes and converts its neighbours, who wear its glyph and a cracked shell |
| Bridge | **The Ballast Mind** | the final exam: a bigger board, void pillars, 16 marbles each, and every 3 turns an effect borrowed from the Hull, the Pulsar, the Magnetizer or the Chaplain, which its search plays, announced a turn ahead and ringed on the board when it fires |
| Cargo | **The Alien** | lays eggs near your marbles that hatch into new marbles unless you crush them |
| Cargo | **The Rail Yard** | freight trains, the first on turn 2, sweep a whole line, edge to edge, either side |
| Furnace | **The Magnetizer** | charges marbles of both sides, + then − in turn, and opposite charges side by side throw each other apart |
| Bridge | **The Pulsar** | six beacons pulse, pushing every line like a sumito |
| Chapel | **The Overseer** | burn its cores on the incinerators before the neurotoxin, at your 40th turn; it talks back in typed bubbles, its vents turn toxic, and its marble explodes with a farewell when you win |
| Cargo | **The Assembly Line** | three conveyor belts between the armies carry every marble off the board, then their presses strike |
| Furnace | **The Unstable Core** | the centre cells charge your marbles, a charged marble weighs more in a push and four charges blow it off; later the core collapses and shockwaves shove the busiest wedge |
| Mess | **The Dual Room** | two rooms side by side split by a wall: an ejected marble of either side comes back one turn later in the other room, on the mirror of its cell (after 3 ejections, on a rim cell of the emptier room), until at five ejections the wall falls and the rooms become one |

## What it looks like

Rusted deck plates, cold light, fog at the rim of the board. Your marbles are glass with a warm
core. Theirs are black shell. When one goes over the edge it slides off and the air goes with it.
Each deck has its own light, fog and drift in the air: dust, ore, steam, smoke, or nothing on the Bridge.

The camera orbits and zooms. A **Clear board** setting (in the settings menu, behind the cog) drops the fog for pure readability.

## Under the hull

```
crates/abalone-core   Rust rules engine: moves, sumito, draws, bot search, boss encounters, battle royale
crates/abalone-wasm   the same engine compiled to WebAssembly for the browser
crates/abalone-cli    play in a terminal (debug tool)
client/               TypeScript + Three.js (WebGPU, WebGL2 fallback), Vite
mcp/                  MCP server: an AI agent plays the bot or a boss over stdio
```

- **One engine, every peer.** Both browsers run the same WASM rules and replay each other's
  moves, so an illegal or tampered move never lands.
- **Online without a server.** WebRTC through Trystero, signaling over public Nostr relays.
  Moves are Ed25519-signed and hash-chained. Each seat is bound to one key; extra visitors watch.
- **Hosted on GitHub Pages.** Free, static, deployed on every merge to `main` that changes the game (docs, tests and CI merges don't deploy; Actions > Pages > Run workflow deploys by hand).
- **Tested hard.** Strict TDD, 100 % unit coverage of all the code (engine, client, MCP server),
  Playwright end to end in Chromium, the full suite run locally before every merge.

## Run it locally

```bash
cd client && bun install && bun run dev
```

`bun run dev` builds the WASM engine first, so it needs Rust and `wasm-pack`. Full gate before a push:

```bash
scripts/verify.sh
```

Homebrew Rust without rustup needs a couple of environment variables, see
[CONTRIBUTING.md](CONTRIBUTING.md) section 13.

## Let an AI agent play

`mcp/` is an [MCP](https://modelcontextprotocol.io) server: an AI agent plays a game against the
bot or a boss through tools, and the engine judges every move. It runs on your machine over stdio, nothing is
hosted. Build it once, and again after pulling `main`:

```bash
(cd client && bun install) && cd mcp && bun install && bun run wasm
```

Then add it to your MCP client, with the absolute path of your checkout. Claude Code:

```bash
claude mcp add ab-alone -- bun /path/to/ab-alone/mcp/src/main.ts
```

Other clients (Claude Desktop, Cursor, ...) take the same command in their JSON config. If the
client does not find `bun`, give its full path (`which bun`).

```json
{
  "mcpServers": {
    "ab-alone": { "command": "bun", "args": ["/path/to/ab-alone/mcp/src/main.ts"] }
  }
}
```

The agent is Black and moves first: `new_game`, then `legal_moves` and `play_move` (the bot
replies in the same call) until the game is over, or `resign`. `get_state` shows the board. Moves
use the notation of `abalone-cli`, for example `(1,3)>NE`. Tools, fields and error codes:
[docs/specs/mcp.md](docs/specs/mcp.md). `new_game` with `boss` (one of the ids in its input schema) and
an optional `seed` starts a boss fight: `get_state` then shows the boss phase, tell and marks.

Online, the agent plays a human or another agent over the same P2P rooms as the browser:
`create_room` gives an invite link a human opens, `join_room` takes a link or a room code. Then
`wait_for_opponent_move` and `play_move` in turn. The server imports the client's online code, so
run `bun install` in `client/` too.

## Crew manifest

- Built by two co-developers: [@TidyMaze](https://github.com/TidyMaze) and
  [@Varadiell](https://github.com/Varadiell)
- What we build: [SPEC.md](SPEC.md) and [docs/specs/](docs/specs/)
- How we work, strictly, issues first: [CONTRIBUTING.md](CONTRIBUTING.md)
  (AI agents: [AGENTS.md](AGENTS.md))
- Backlog: [project board](https://github.com/users/TidyMaze/projects/1)
- Ideas and votes: [Discussions](https://github.com/TidyMaze/ab-alone/discussions)

> This repo is public. Never commit a secret.

<sub>Earlier lives of this board: [Abalone](https://github.com/TidyMaze/Abalone) (Java),
[abalone-go](https://github.com/TidyMaze/abalone-go) (Go).</sub>
