---
id: abalone-cli
type: module-design
status: draft
title: "abalone-cli: terminal debug client"
parent: architecture
depends-on: [abalone-core]
references: [rules]
---

# abalone-cli: terminal debug client

## Responsibility

Play a game in a terminal: print the board as ASCII, read moves from stdin, play them. It is a debug
tool, not a product (SPEC.md phase 0). Its move notation (`(q,r)>DIR`, see
[rules](../../docs/specs/rules.md) sections 1 and 4) is the one the MCP server and the logs reuse.

## Boundary

- Uses only `abalone-core`'s public API. No rules of its own beyond parsing input.
