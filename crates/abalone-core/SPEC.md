---
id: abalone-core
type: module-design
status: draft
title: "abalone-core: rules engine"
parent: architecture
references: [rules, game-design]
---

# abalone-core: rules engine

## Responsibility

The one judge of the game. It owns the board and moves (`board`, `moves`), a game and its
outcome, draws included (`game`), the bot's alpha-beta search (`search`), boss fights as rule
layers around the moves (`encounter`, one file per boss), and battle royale with N seats,
simultaneous rounds, the hull breach and its bots (`royale`). The rules it follows are in
[rules](../../docs/specs/rules.md) and [game-design](../../docs/specs/game-design.md); its design
intent is in [architecture](../../docs/specs/tech.md) section 3.

## Boundary

- No dependencies: no I/O, no clock, no threads, no global RNG. Every random pick comes from the
  fight's seed (splitmix64), so the same state and move give the same result on every peer. P2P
  validation, replays and the seeded daily challenge all rely on that.
- A boss or a mode adds hooks around `Game::play`; it never changes what a legal move is or how a
  sumito resolves (goal: "The rules are not forked").
- Knows nothing of WASM, JS or rendering: `abalone-wasm` and `abalone-cli` wrap it.
- *Unconfirmed drift: tech.md section 3 says `no_std` friendly with bitboards. The crate uses
  `std` (`HashMap`, `DefaultHasher`) today.*
