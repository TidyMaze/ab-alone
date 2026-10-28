---
id: abalone-wasm
type: module-design
status: draft
title: "abalone-wasm: JS bridge"
parent: architecture
depends-on: [abalone-core]
---

# abalone-wasm: JS bridge

## Responsibility

A thin `wasm-bindgen` wrapper that exposes `abalone-core` to JS: `Engine` (a plain game),
`Encounter` (a boss fight), `Royale`, plus the engine version and boss list. It is built twice
from the same source, `--target web` for `client/` and `--target nodejs` for `mcp/`.

## Boundary

- No game logic. It only converts between core types and flat integer arrays (decision #74).
- The encodings (board codes, per-boss records) are a stable contract with both JS consumers and
  are documented at the top of `src/lib.rs`. Changing one means changing `client/` and `mcp/` in
  the same change.
- *Unconfirmed drift: tech.md section 4 describes a JSON or binary bridge with generated TS types.
  The code uses flat integer arrays.*
