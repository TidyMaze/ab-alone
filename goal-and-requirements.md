---
id: goal
type: goal-and-requirements
status: draft
title: "AB-ALONE: goal and requirements"
---

# AB-ALONE: goal and requirements

Root of the spec graph. The owners' charter and phase plan stay in [SPEC.md](SPEC.md); this page
only states what the product is, so the other specs can hang off it.

## Goal

A browser game of real Abalone, dressed as a sci-fi horror story: you are the last person on a
derelict ship and the hardened crew plays you on a hex board. Under the mood, every mode is the
standard Abalone rules (61 cells, 14 marbles each, inline and broadside moves, sumito, first to
eject 6 wins).

## Audience

Players who open a link in a desktop or phone browser, with no install and no account. AI agents
can also play, through a local MCP server.

## Capabilities

What the code does today:

- Hot-seat on one screen, and play against an alpha-beta bot running in a Web Worker.
- Online 1v1 peer to peer by invite link, with a signed, hash-chained move log, spectators and ranked
  play (Elo, rank tiers).
- Souls-like boss fights: each boss bends one rule, telegraphs its move one turn ahead, and has a
  positional answer. A medal per beaten boss, a daily challenge (one boss and seed per UTC day), and
  online co-op against a boss.
- Battle royale for up to 6 seats with hidden orders (commit-reveal) and a closing hull breach,
  offline against bots or online.
- A ship hub to walk through: decks unlock as their boss falls, with game tables and lore terminals.
- An MCP server so an AI agent can play the bot, a boss or an online room.
- A terminal client, as a debug tool.

## Principles

- **The rules are not forked.** Modes and bosses add a rule layer around the moves and the sumito;
  they never change what a legal move is or how a push resolves (SPEC.md section 2).
- **One engine, every peer.** The Rust engine is the only judge, compiled to WASM for every peer,
  the CLI, the bot and the MCP server.
- **No peer is trusted.** Every peer re-validates every move; a mismatch pauses the game.
- **No server.** Everything is static on GitHub Pages; nothing we run or pay for (decision #36).

## Non-goals

- A game server, or anything that needs a trusted one (decision #36).
- *Unconfirmed as permanent: SPEC.md section 6 lists these as out of scope "for now".* Mobile native
  app, accounts, monetization, level editor, voice chat.
