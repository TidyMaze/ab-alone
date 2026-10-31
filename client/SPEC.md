---
id: client
type: module-design
status: draft
title: "client: browser game"
parent: architecture
depends-on: [abalone-wasm]
references: [ui, art, game-design]
---

# client: browser game

## Responsibility

The game the player opens: Vite + TypeScript + Three.js (WebGPU, WebGL2 fallback), served
static from GitHub Pages and installable offline (service worker). It owns everything except
the rules: rendering and effects, input, menus and HUD, the ship hub, audio, the bot worker,
peer-to-peer rooms (Trystero, signed move log, seats, co-op, ranked, battle royale reveal),
and persistence in IndexedDB. Design is set by [ui](../docs/specs/ui.md),
[art](../docs/specs/art.md) and [game-design](../docs/specs/game-design.md); the tech choices are
in [architecture](../docs/specs/tech.md) sections 5 to 9.

## Boundary

- Asks `abalone-wasm` for every rule decision: legal moves, the result of a move, boss turns,
  outcomes. The client never decides a rule itself.
- The bot search runs in a Web Worker (`bot.worker.ts`), so the render loop never waits on it.
  *Unconfirmed: the main thread also holds an engine instance for rule checks; tech.md section 4
  says the engine runs only in a worker.*
- No server calls beyond static assets and public signaling relays and STUN.
- Its P2P code (`p2p`, `session`, `transport`, `moverecord`, `invite`, `netcounters`, `daily`) is
  also imported by [mcp](../docs/specs/mcp.md) (decision 2 of mcp.md): changing those files changes
  the MCP server too.
- One flat `src/`, one spec: there are no inner boundaries yet.
