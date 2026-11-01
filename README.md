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

Real Abalone underneath: 61 cells, 14 marbles each, push 1 to 3 in a line, out-number to shove.
First to eject 6 wins. On top of it, the ship:

- **Play alone or together**: hot-seat on one screen, versus TALLY's bot (alpha-beta, in a Web Worker),
  online 1v1 peer to peer with an invite link, ranked online (Elo), a gamepad.
- **15 souls-like bosses**, each bends one rule, tells you one move ahead and has an answer on the
  board: The Echo, The Hull, The Choir, The Chaplain, The Ballast Mind, The Alien, The Rail Yard,
  The Magnetizer, The Pulsar, The Overseer, The Assembly Line, The Unstable Core, The Dual Room,
  The Stalker and The Swarm. A medal per beaten boss, with your fewest turns. Die, read the tell,
  retry with the same seed. Rules per boss: [docs/specs/boss-balance.md](docs/specs/boss-balance.md).
- **Daily challenge**: one boss and one seed for everyone each UTC day.
- **Rogue-lite run**: 3 acts of a branching map of fights, your army carried from fight to fight,
  every marble lost is lost for the run ([spec](docs/specs/roguelite.md)).
- **Trainer**: waves against the bot, one more marble each wave.
- **Stalker mode**: a fog of war against the bot.
- **Fight together**: two players share one army against a boss, online.
- **Battle royale** on the Furnace deck: up to 6 seats, hidden orders, bots fill empty seats.
- **Ship hub**: walk five decks, a door per boss, a room per mode, lore terminals. New players land there,
  after a short illustrated guide to the rules and the controls of their device (Guide in the cog menu opens it again).
- **Open world**: a generated hex map, a hero marble you walk and a troop that fights on its own
  ([spec](docs/specs/openworld.md)).
- **An AI agent plays** over MCP ([below](#let-an-ai-agent-play)).

Rusted deck plates, cold light, fog at the rim. The camera orbits and zooms; a **Clear board**
setting (cog menu) drops the fog.

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

Needs [bun](https://bun.sh), Rust and `wasm-pack`: `bun run dev` builds the WASM engine first.
Full gate before a push:

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

## Contribute

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
