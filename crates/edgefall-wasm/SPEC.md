---
id: edgefall-wasm
type: module-design
status: draft
title: "edgefall-wasm: JS bridge"
parent: architecture
depends-on: [edgefall-core]
---

# edgefall-wasm: JS bridge

## Responsibility

A thin `wasm-bindgen` wrapper that exposes `edgefall-core` to JS: `Engine` (a plain game),
`Encounter` (a boss fight), `Royale`, `replay_score` (a ranked 1v1 move log replayed to its status and ejections, or refused; the shared board counts a result only if it matches, #1287), plus the engine version and boss list. It is built twice
from the same source, `--target web` for `client/` and `--target nodejs` for `mcp/`.

## Boundary

- No game logic. It only converts between core types and flat integer arrays (decision #74).
- The encodings (board codes, per-boss records) are a stable contract with both JS consumers and
  are documented at the top of `src/lib.rs`. Changing one means changing `client/` and `mcp/` in
  the same change.
- *Unconfirmed drift: tech.md section 4 describes a JSON or binary bridge with generated TS types.
  The code uses flat integer arrays.*
