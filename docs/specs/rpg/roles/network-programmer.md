# P2P party, combat lockstep and PvP transport: implementation spec (role `network-programmer`)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, still open). Source of truth:
the validated French gameplay spec (the approved plan, mirrored in `docs/specs/rpg/plan.fr.md`). A
section number like "§4.7" points to that gameplay spec. This file adds no game rule: it says how to
carry the RPG over the existing peer-to-peer stack with no server (decision #36), and lists every
gap or contradiction it found (section 18). Where a rule is missing, this file writes a PROPOSAL and
flags it there. No code yet: strict TDD applies from the first code Task (CONTRIBUTING section 11).

Tags, as in `rules.md`: **FINAL** (decided: by #313's four choices, by #36, by an existing FINAL spec,
or already shipped in `client/src`), **TUNE** (a starting value, set by measurement or playtest),
**PROPOSAL** (proposed here, an owner confirms). Every number below carries one. Values inside
Given/When/Then examples (keys, cells, seq numbers) are test data, not rules, and carry no tag.

---

## 0. Scope

The network-programmer owns everything that crosses the wire, and the trust rules around it:

- The **wire protocol v2**: message kinds, signed payloads, versioning in `Hello` (section 4).
- **Sealed values**: one commit-reveal primitive for the combat seed, PvP loadouts, PvP placement and
  battle royale orders (section 5).
- The **party** of at most 4 (FINAL, #313 choice 2): room, seats, leader, leader migration, party
  position on the map, pings and emotes (section 6).
- **Group combat start**: the handshake that makes every peer build the same `CombatSetup` (section 7).
- **Combat lockstep**: one signed record per player action, post-state hash, local AI turns, desync
  handling (section 8).
- **Catch-up and resume** of an online fight after a drop or a reload (section 9).
- **Deadlines**: turn timeout claims, takeover of an absent player by the player bot (section 10).
- **Duels and arenas**: rooms, normalised PvP checks, 2v2 seats (section 11). **Ranking** transport
  and identity (section 12, gated by a Decision).
- **Battle royale**: lobby, seating, commit-reveal rounds of RPG orders (section 13).
- **Presence**: hub rooms, callsigns, emotes, pings, inspection, group finder, world-boss rendezvous
  (section 14).
- **P2P trade** with double signed confirmation (section 15).
- The **anti-cheat** summary: what a peer can verify and what stays self-declared (section 16).
- Net **observability**: counters and diagnostics (section 17).

Out of scope (each section lists them under **Dependencies**): the combat rules and `apply_action`;
the board region, terrain and weighted push in `abalone-core`; the monster AI and the player bot;
world generation, the A* and encounters; the client scenes, HUD and IndexedDB stores; all content
data (classes, templates, items); loot, XP, quests and economy rules.

### 0.1 Role slugs used for dependencies

The same table as `gameplay-programmer.md` section 0.1, so the files cross-read. The lead maps the
slugs to the real roster.

| Slug | Owns (as used here) | Aliases in peer role files |
|---|---|---|
| `gameplay-programmer` | Crate `abalone-rpg`: `CombatState`, `apply_action`, `replay`, `state_hash`, action text notation, BR round resolver | `combat-engine`, `combat-engineer` |
| `engine-programmer` | Crate `abalone-core`: region mask, fixed scan order, no `HashMap` iteration | `engine-engineer` |
| `ai-programmer` | Monster AI and player bot with a node budget, deterministic | `ai-engineer` |
| `client-programmer` | WASM glue, scenes, HUD, IndexedDB stores, Playwright e2e harness | `client-ui`, `client-engineer` |
| `ux-designer` | Party panel, net status lines, emote and ping glyphs, "unverified" labels | |
| `world-programmer` | Crate `abalone-world`: tile content, `build_setup`, UTC-derived modifiers, schedules | `world-generator`, `world-engineer` |
| `progression-designer` | Hero stats, stat bounds per level, talent validation, PvP templates as data | `stats-progression`, `systems-designer` |
| `pvp-br-designer` | Arena and BR rules, normalisation templates, BR loot | `pvp-br` |
| `encounter-boss-designer` | Packs per player, world bosses and their schedule | `dungeons-bosses` |
| `economy-designer` | Item validity, trade rules, bound items | `items-loot`, `loot-economy` |
| `narrative-quest-designer` | Quest ids for quest sharing | `quest-designer` |
| `tech-lead` | Data bundle hash, `RULES_VERSION`, lints, CI jobs | `data-tools` |
| `lead-game-designer` | Arbitration of cross-role PROPOSALs | `game-designer` |
| `qa-engineer` | Playtest and e2e plans, fault-injection scenarios | `qa-balance` |

---

## 1. Inputs read

- Gameplay spec, the whole file; in detail §1 (pillars 2, 3, 5), §4.1, §4.4, §4.7, §4.8, §6.1, §6.2,
  §6.3, §6.6, §6.7, §6.8, §6.12, §11 (unlocks), §12 (personal loot), §13.4, §16 (group quests), §17
  (Mythic weekly affixes), §18 (world bosses, raids), §19, §20, §21, §23 (signed local boards), §24,
  §25, §26.
- `SPEC.md` sections 3, 4 (phases 2, 4, 5) and 6 (ranking out of scope).
- `docs/specs/tech.md` section 6 (trust model, signaling, identity, lockstep, rematch, BR
  commit-reveal, coordinator migration, reconnection, catch-up #226, spectators, clock), section 8
  (persistence), section 9 (versioning in `Hello`), section 10 (net testing, counters, diagnostics).
- `docs/specs/multiplayer.md` (options A to E, failure modes, no TURN in v1).
- `docs/specs/rules.md` sections 9, 10.2 (timeout claim, 60 s grace), 10.4 (BR rounds, initiative,
  fizzle, breach), 13 (OPEN-2, OPEN-7 to OPEN-11).
- `docs/specs/game-design.md` sections 3.2, 3.5 (best-effort public lobbies), 6 (BR, anti-kingmaking).
- `docs/specs/mcp.md` sections 7 and 8 (agent seats, `agent` flag in `Hello`).
- Peer role files: `gameplay-programmer.md` (sections 4.4 to 4.7 and 5: `apply_action`, one log record
  per action, FNV-1a 64 state hash, text notation, `CombatSetup` with a hex seed), `lead-game-designer.md`
  (section on public state: no RNG after setup; arbitration A2: each confirmed action commits).

### 1.1 Facts from the code that shape this spec

- `client/src/transport.ts`: the `Transport` interface (`send(message, to?)`, `onRecord`, `onState`,
  `onLeave`, `close`) and `localPair()`. Every new room kind in this file uses it unchanged.
- `client/src/p2p.ts`: Trystero over Nostr, one action `move` per room, app id `ab-alone`; the hook
  transport for e2e (`?net=hook`, `window.__netIn` / `__netOut`).
- `client/src/moverecord.ts`: Ed25519 (Web Crypto) keys per game and per tab, base64url, signed
  payloads as fixed-order JSON arrays, SHA-256 hash chain from `GENESIS`, wire kinds `MoveRecord`,
  `Hello`, `Rematch`, `Sync`, `Missed`, a shape parser per kind.
- `client/src/session.ts`: `OnlineSession` for 2 seats; the creator holds seat 1 and binds seats from
  the first valid `Hello`; a move counts only from the key of the side to move; a serial promise
  queue handles messages in arrival order; catch-up by `Sync` / `Missed`, live gap detection.
- `client/src/movelog.ts`, `seats.ts`, `presence.ts`, `rematch.ts`, `invite.ts`, `netcounters.ts`,
  `diagnostics.ts`, `savegame.ts`, `daily.ts` (`hash32`, UTC day).
- No commit-reveal code exists yet. BR is not built.
- `crates/abalone-core/src/board.rs` stores cells in a std `HashMap` and `MAX_RADIUS = 5`: both must
  go before any lockstep RPG fight (§24.1, §24.2; `engine-programmer`).

---

## 2. Conventions used by every section

- **One transport, many room kinds.** Every room (party, combat, arena, BR, hub, finder) is a
  `Transport` from `p2pTransport(roomId)` or the hook transport in e2e. Room ids are namespaced
  strings, for example `party/<code>` (PROPOSAL). The Trystero `appId` stays `ab-alone` (FINAL,
  shipped).
- **Signed payloads** are fixed-order JSON arrays whose first element is the message kind, exactly
  like `helloPayload` today (FINAL pattern, shipped). Keys and signatures are base64url Ed25519
  (FINAL, shipped). Hashes are lowercase hex SHA-256 (FINAL, shipped), except the engine state hash,
  which is the 16-hex FNV-1a 64 of `gameplay-programmer` section 4.6 (PROPOSAL there).
- **Every message off the wire** goes through a shape parser that returns a clean copy or `null`
  (FINAL pattern, shipped). A message over 16 KiB (TUNE) is refused as `too-big` before parsing.
- **No trusted clock.** Every deadline is local to each peer and anchored on a message it received
  (tech.md section 6, FINAL there). A deadline never changes game state by itself: only a signed
  record does (PROPOSAL, sections 10 and 13).
- **The engine is the only judge** (FINAL, tech.md, mcp.md). The network layer never decides
  legality, damage or victory: it asks the WASM engine.
- **Files.** New modules sit flat in `client/src/` like the shipped ones (FINAL convention):
  `signedlog.ts`, `sealed.ts`, `party.ts`, `engage.ts`, `combatsession.ts`, `takeover.ts`,
  `arena.ts`, `brlobby.ts`, `brround.ts`, `hubpresence.ts`, `finder.ts`, `trade.ts`, `profile.ts`,
  `rating.ts`, `fakemesh.ts` (tests only). The Rust side adds nothing to the network: it exposes pure
  functions through `abalone-wasm` (`client-programmer`).
- **Tests.** Unit tests next to each module (vitest). Network properties run as seeded loops over
  `fakeMesh` (section 3.3), no external property-test library (PROPOSAL). Client JS coverage is 100 %
  of lines (CONTRIBUTING section 11); `p2p.ts` stays out of the gate as today (shipped exclusion, the
  real relays need a second browser). Player-facing flows get a Playwright e2e with two or more pages
  on the hook transport (`?net=hook`), wired by the test as `online.spec.ts` does today.

---

## 3. The determinism contract the network relies on (§24.1, §6.3, §6.5, §4.5, §25 R1)

Lockstep without a server works only if every peer computes the same state from the same log. The
network layer does not implement determinism; it states what it needs and tests it end to end.

### 3.1 What the network needs from other roles

| Need | Gameplay ref | Owner |
|---|---|---|
| `replay(setup, actions)` gives the same `state_hash` on native and wasm32, in every browser | §24.1 | `gameplay-programmer` |
| No RNG after setup: `apply_action` takes no seed; the seed only feeds setup, placement tie-break, PvP initiative tie, BR chests | §6.1, §24.1, choice 4 | `gameplay-programmer` (FINAL in `lead-game-designer.md`) |
| No `HashMap` / `HashSet` iteration anywhere in a rules path, fixed scan order r then q | §24.1 | `engine-programmer`, `tech-lead` (lint) |
| Monster AI and player bot: node budget only, never a time budget; integer eval; fixed transposition table size and replacement rule | §5.3, §24.2 | `ai-programmer` |
| A canonical action text: `parse(print(a)) == a` and `print(parse(t)) == t` for every legal action | §1 pillar 4 | `gameplay-programmer` (section 4.7 there) |
| `CombatSetup` canonical JSON: one encoding per setup (sorted keys, no floats) | §24.4 | `gameplay-programmer`, `world-programmer` |
| `RULES_VERSION` and a hash of the bundled data files, exposed by the WASM bridge | §24.3 | `tech-lead`, `client-programmer` |

### 3.2 Determinism gate (Task NP-01, R1)

- **Implementation.** A folder of golden combat logs `crates/abalone-rpg/tests/golden/*.json`, each
  `{ "v": 1, "setup": CombatSetup, "actions": ["move (-1,0)(0,0)>E", ...], "hash": "16 hex" }`
  (PROPOSAL). A native test replays each and compares the hash. A client vitest loads the WASM build
  and replays the same files, same comparison. The R1 golden set: 10 logs (TUNE) recorded from
  seeded bot-vs-pack fights of 40 to 120 actions (TUNE), plus every `.scn` scenario of
  `gameplay-programmer` once it ends in a hash line.
- **Why the network owns it.** It is the lockstep's precondition: a hash that differs between
  Chrome and Safari is a desync in every group fight. R1's exit criterion "same log = same hash" is
  this gate (§25).
- **Tests (Given/When/Then).**
  - Given the golden log `r1-warrior-vs-pack-01.json`, When it is replayed natively, Then the final
    hash equals the file's `hash`.
  - Given the same file, When the vitest replays it through the WASM bridge, Then the hash is the same
    string.
  - Given a log edited by one action, When it is replayed, Then the hash differs (the gate is not
    vacuous).
  - Playwright: the same replay in Chromium, Firefox and WebKit through `bun run e2e:all` gives one
    hash (tech.md section 5.x runs the three engines).
- **Dependencies.** `gameplay-programmer` (`replay`, `state_hash`, notation), `ai-programmer` (seeded
  bot to record logs), `client-programmer` (bridge function `replay_hash(json) -> string`).
- **Risks.** A log recorded before a rule change breaks the gate: the file carries `RULES_VERSION`,
  and a version bump re-records the set in the same PR (PROPOSAL).

### 3.3 Fault-injecting mesh for tests (Task NP-02, R10)

- **Implementation.** `client/src/fakemesh.ts` (test helper, excluded from the bundle):
  `fakeMesh(n, { seed, drop, dup, reorder, delayMax })` returns `n` `Transport`s wired in a full mesh.
  A seeded generator (the `hash32` mixing of `daily.ts`, PROPOSAL) decides per message whether it is
  dropped, duplicated, held back, or delivered; `partition(a, b)` and `heal()` cut and restore one
  link; `leave(i)` closes one end. Delivery runs on a manual clock `mesh.tick()` so tests never wait on
  time (bug #190 lesson).
- **Tests.**
  - Given a 3-peer mesh with `drop = 0`, When peer 0 sends `x`, Then peers 1 and 2 receive `x` once,
    named `p0`.
  - Given seed 7 and `dup = 1`, When peer 0 sends `x`, Then peer 1 receives it twice.
  - Given `partition(0, 1)`, When peer 0 sends to all, Then only peer 2 receives it; after `heal()`,
    the next send reaches both.
  - Given `leave(2)`, Then peers 0 and 1 get `onLeave('p2')`.
- **Dependencies.** None. **Risks.** A fake that is too kind hides real bugs: one real WebRTC
  loopback test with two Playwright pages stays in the nightly run (tech.md section 10).

---

## 4. Wire protocol v2, identity and versioning (§4.7, §24.4, §24.5)

### 4.1 Message kinds

New kinds join the `Wire` union of `moverecord.ts`. The classic kinds stay byte for byte (FINAL: the
classic tables of the Mess stay intact, §21). "Signed by" names whose key signs the payload.

| Kind | Fields (besides `kind`, `pub`, `sig`) | Signed by | Room | Section |
|---|---|---|---|---|
| `hello` (v2) | classic fields + `proto`, `rules`, `data`, `world`, `profile?`, `bind?` | sender | all | 4.2 |
| `roster` | `room`, `epoch`, `seats: string[]` | leader | party, BR | 6.2, 13.1 |
| `leave` | `room` | sender | party | 6.2 |
| `pos` | `party`, `n`, `tile: [q, r]`, `path: [q, r][]` | leader | party | 6.3 |
| `signal` | `room`, `what: 'emote' \| 'ping' \| 'share'`, `id`, `cell?` | sender | party, hub | 6.4, 14.3 |
| `engage` | `party`, `id`, `tile`, `format`, `first`, `at` | leader | party | 7.1 |
| `join` | `engage`, `seat`, `entity` | sender | party | 7.2 |
| `lineup` | `engage`, `joins: Join[]` | leader | party | 7.3 |
| `seal` | `ctx`, `seat`, `h` | sender | any | 5 |
| `open` | `ctx`, `seat`, `v`, `salt` | sender | any | 5 |
| `ready` | `game`, `setup` (hash) | sender | combat | 7.4 |
| `act` | `game`, `seq`, `prev`, `act`, `post` | active seat | combat | 8.2 |
| `ctl` | `game`, `seq`, `prev`, `ctl: 'takeover' \| 'resume' \| 'claim'`, `seat` | see 10 | combat | 10 |
| `round` | `game`, `round`, `post` | each seat | BR | 13.3 |
| `beacon` | `room`, `cell`, `look: number[]` | sender | hub | 14.2 |
| `inspect-ask` / `inspect` | `to` / `gear` | sender | hub, party | 14.4 |
| `invite` | `to`, `mode`, `room` | sender | party, hub | 11.1 |
| `trade-offer` / `trade-lock` / `trade-confirm` | `trade`, `rev`, `give` / `terms` / `terms` | sender | party, hub | 15 |
| `sync` / `missed` | classic, `game` may be a combat id | unsigned / carries signed | combat | 9 |

All PROPOSAL. Each kind gets a `parseX` and, when signed, `signX` / `verifyX` in `moverecord.ts`
(or a sibling `wire.ts` if the file passes 400 lines, PROPOSAL).

### 4.2 `Hello` v2 and version gate (§4.7 "graine de version", tech.md section 9)

```ts
interface Hello {
  kind: 'hello'; game: string; seat: number; roster: string[]; agent?: true;
  proto?: number;   // 2 for every RPG room; absent means 1 (classic tables)
  rules?: string;   // RULES_VERSION of abalone-rpg
  data?: string;    // 16 hex of the SHA-256 of the bundled data files
  world?: string;   // id of the world version seed (§4.1, §4.7)
  profile?: string; // persistent profile key, section 12 (ranked only)
  bind?: string;    // profile signature of [room, pub], section 12
  pub: string; sig: string;
}
```

- Every new field is inside the signed payload, appended after the classic ones, so an old classic
  `Hello` still verifies (PROPOSAL, same trick as the `agent` flag of mcp.md section 8).
- A peer refuses a `Hello` whose `proto`, `rules`, `data` or `world` differs from its own, with the
  refusal reason `version-mismatch` and the HUD line "This player runs another version. Reload the
  page." (PROPOSAL, wording `ux-designer`). Same rule as tech.md section 9: different engine versions
  never play together (FINAL there).
- **Tests.** Given two pages with the same build, When they meet in a party room, Then both seats
  bind. Given a `Hello` with `rules = "r2"` against a peer on `"r3"`, When it arrives, Then it is
  refused `version-mismatch` and no seat is bound. Given a classic `Hello` without `proto`, When a
  classic 1v1 session receives it, Then it verifies as today (regression).
- **Dependencies.** `tech-lead` (`RULES_VERSION`, data hash at build time), `world-programmer` (world
  version id), `client-programmer` (bridge getters), `ux-designer` (line).

### 4.3 Identity (tech.md section 6, §19, §21)

- **Session key**: a fresh Ed25519 pair per room and per tab, as today (FINAL, shipped). It signs
  everything in a room.
- **Profile key** (ranked only, section 12): one non-extractable Ed25519 pair per save, in IndexedDB
  store `profile` (PROPOSAL). It never signs game records, only the `bind` of a session key.
- **Callsign**: what other players see instead of a name. Derived from the session key (or the
  profile key in ranked): `ADJ[h % 64] + "-" + NOUN[(h >> 6) % 64] + "-" + hex2`, with
  `h = hash32(pub)` (PROPOSAL, word lists `ux-designer`). No free text anywhere (FINAL, §1 pillar 5:
  no free chat).

---

## 5. Sealed values: one commit-reveal for seeds, loadouts, placements and orders (§4.7, §6.1, §19, §20, §24.1)

### 5.1 Implementation

`client/src/sealed.ts`, pure apart from Web Crypto:

```ts
type Ctx = string; // "<game>/seed", "<game>/loadout", "<game>/place", "<game>/order/<round>"
function sealOf(ctx: Ctx, seat: number, v: string, salt: string): Promise<string>;
//   = hex SHA-256(JSON ['seal', ctx, seat, v, salt])
class SealRound {
  constructor(ctx: Ctx, seats: number[]);   // the seats that must seal
  seal(seat, h): 'ok' | 'dup' | 'late';     // a second seal from a seat is refused
  open(seat, v, salt): Promise<'ok' | 'bad' | 'early'>; // an open before every seal is in is 'early'
  get sealed(): boolean;                    // every seat sealed
  get opened(): boolean;                    // every seat opened, each matching its seal
  values(): string[];                       // in seat order, once opened
}
function seedOf(ctx: Ctx, values: string[]): Promise<string>;
//   = first 16 hex of SHA-256(JSON ['seed', ctx, values]) (a u64 as hex, the CombatSetup "seed")
```

- `salt` is 32 random bytes in base64url (PROPOSAL). For the seed, `v` is also 32 random bytes.
- Flow: every seat sends `seal`; once a peer holds every seal of the round, it sends its `open`.
  An `open` that arrives before the peer holds every seal is kept and checked later (never
  dropped, never applied early).
- Deadlines (local, from the first `seal` received): 20 s in PvP and BR (TUNE, matches the 20 s
  placement of §6.1), 30 s in group PvE (TUNE).
- **What a missing or bad open does** (PROPOSAL, closes the last-revealer bias, Feedback F16):

| Context | Missing or bad `open` |
|---|---|
| Group PvE seed | The engage is aborted for everyone, the leader may engage again. Nothing is at stake. |
| PvP seed, loadout, placement | The silent seat forfeits (a loss, no rating change in unranked). A seat cannot abort after seeing the others to re-roll. |
| BR order | The order is `hold` and the seat is flagged (rules.md section 10.4, FINAL there). |

- **Hidden information list** (closed, `lead-game-designer.md`): BR orders before the reveal, PvP
  placement and PvP loadouts during their sealing. Everything else is public (§1 pillar 2, FINAL).

### 5.2 Dependencies

`gameplay-programmer` (seed as 16 hex in `CombatSetup`), `pvp-br-designer` (what a loadout and a
placement contain), `ux-designer` (sealing countdown, "waiting for 2 players").

### 5.3 Tests

- Given seats 1 and 2, When 1 seals `h1` and opens before 2 seals, Then `open` returns `early`, and once
  2 seals, the kept open of 1 is checked and counts.
- Given a seal of `v = "a"`, When the open says `v = "b"`, Then `open` returns `bad`.
- Given values `["x", "y"]` in seat order, When `seedOf("g/seed", ...)` runs on two pages, Then both get
  the same 16 hex; with `["y", "x"]`, a different one.
- Given a seat that sealed twice, Then the second is `dup` and the first stands.
- Property over `fakeMesh(4)` with `drop = 0.2, dup = 0.2, reorder` and resends on `Sync`: for 500 seeds
  (TUNE), every peer that finishes the round has the same seed.
- PvP: Given seat 2 never opens within 20 s, When seat 1's deadline fires, Then seat 1 sends a `ctl
  claim` (section 10.3) and the HUD shows "Opponent did not reveal: you win".

### 5.4 Risks

A slow link loses a BR round (game-design section 6, accepted there). A peer with a broken clock only
hurts itself: deadlines are local.

---

## 6. The party (§4.7, §1 pillar 5, §21 "Groupes et guildes", §11 level 15)

### 6.1 Room and invite

- A party is one Trystero room `party/<code>`, code = `newRoomId` (16 random bytes, FINAL shipped in
  `invite.ts`). Invite link `#party=<code>` next to the shipped `#room=` (PROPOSAL). A short code for
  voice sharing: the first 8 base32 characters (TUNE), as tech.md asks "random 8+ characters".
- At most **4 seats** (FINAL, #313 choice 2). A fifth `Hello` is refused `party-full` and the page
  says "This party is full (4 of 4)" (PROPOSAL, `ux-designer`).
- Topology: full mesh, 6 links at 4 peers (FINAL arithmetic). **Forwarding**: every peer forwards
  each new signed party or combat record it verified once to every other peer, dedup by
  `(game, seq)` or by message hash (PROPOSAL). Signed records are safe to relay, so a pair that cannot
  connect directly (symmetric NAT, no TURN in v1, multiplayer.md section 4) still plays through a
  third member.

### 6.2 Seats, roster, leader (§4.7 "le chef de groupe ne gère que deux choses")

- The creator holds seat 1 and is the first leader (as `session.ts`, FINAL pattern).
- **Leader = the lowest seat whose key is present** in the local view (PROPOSAL; tech.md's "lowest
  `join_seq`" needs an order Trystero does not give, the seat is that order).
- The leader binds a free seat to the first valid `Hello` that asks for one and publishes a signed
  `roster {room, epoch, seats}`; `epoch` grows by 1 on each change (PROPOSAL).
- A peer accepts a roster only from the key it sees as leader, with an epoch higher than its own; two
  rosters with the same epoch: the one signed by the lower seat wins (PROPOSAL, deterministic).
- A member that quits sends a signed `leave`; the leader frees its seat in the next roster. A member
  that only drops keeps its seat (tech.md reconnection, FINAL there).
- Seats of a running fight are frozen by its `lineup` (section 7.3): a new member waits outside the
  fight and joins the next one (PROPOSAL).
- The leader has no authority over combat (FINAL, §4.7, SPEC section 3): its key signs only
  `roster`, `pos`, `engage`, `lineup`.

### 6.3 Party position on the map (§4.7, §4.2)

- The leader sends `pos {party, n, tile, path}` each time its marble starts a path and each time it
  arrives (PROPOSAL); `n` grows by 1. Members show every party marble walking the leader's path at
  the leader's pace, one tile behind each other (PROPOSAL, `ux-designer`). A member's click on the
  map is a `ping`, not a move (PROPOSAL, Feedback F3).
- Fog, discovery, cleared tiles and nodes stay local to each member's save (FINAL, §4.7 "l'état du
  monde est local").
- Max rate: 4 `pos` per second (TUNE); more are ignored and counted `rate-limited`.

### 6.4 Signals: pings, emotes, quest share (§1 pillar 5, §16 "En groupe", §21)

- `signal {room, what, id, cell?}`: `emote` ids 0 to 3 (4 fixed emotes, FINAL, game-design section 6),
  `ping` ids 0 to 3 (go here, danger, gather, loot, PROPOSAL `ux-designer`) with a cell, `share` with a
  quest id (§16, the receiving client asks its quest engine whether it can accept).
- Rate: 1 emote per 2 s and 1 ping per second per key (TUNE); excess ignored and counted.
- A local mute per key, for the session (PROPOSAL).

### 6.5 Dependencies

`ux-designer` (party panel with 4 slots, callsigns, presence tone, leader crown glyph, invite and code
display, ping and emote glyphs), `client-programmer` (map markers, follow animation),
`world-programmer` (path format), `narrative-quest-designer` (quest share acceptance), `progression-designer`
(level 15 unlock of the group finder is self-declared, Feedback F18).

### 6.6 Tests

- Given a party with seats 1, 2 and 3 bound, When seat 1's key leaves, Then every peer sees seat 2 as
  leader, and seat 2's next `roster` has `epoch + 1`.
- Given rosters A (seat 2, epoch 5) and B (seat 3, epoch 5), When a peer receives both, Then it keeps A.
- Given 4 bound seats, When a fifth `Hello` arrives, Then it is refused `party-full`.
- Given a partition between seats 2 and 4 on `fakeMesh(4)`, When seat 2 sends a signed `ping`, Then
  seat 4 receives it once, through forwarding.
- Given a `pos` signed by seat 3 while seat 1 leads, Then it is refused `not-leader`.
- Given 3 emotes in 1 s from one key, Then the first is shown and the next two are dropped.
- E2E (Playwright, 3 pages, hook transport): page A creates a party, B and C join by link, all three
  see 3 slots filled; A closes, B shows the leader crown. Screenshot in the PR (UI change).

### 6.7 Risks

Two leaders during a partition: both may send `pos`; members follow the one they see. Harmless out
of combat, and a fight needs one `lineup` signed by one leader (section 7.3).

---

## 7. Group combat start: everyone builds the same `CombatSetup` (§4.4, §4.7, §6.1, §6.2, §6.8, §4.8, §17)

### 7.1 Engage

- Out of combat, only the leader's client checks aggro and clicks on packs (PROPOSAL, Feedback F2:
  the leader's world instance decides the encounter). On a trigger it sends
  `engage {party, id, tile, format, first, at}`: `id` 16 random bytes, `format` from §6.8
  (`skirmish`, `elite`, `dungeon-room`, `boss`, `raid`), `first` = the camp that plays first (ambush or
  not, §4.4), `at` = the leader's UTC ms.
- **UTC-derived modifiers** (night §4.8, weather §4.8, Mythic weekly affixes §17) are not sent: every
  peer computes them with the pure function `modifiers_at(at, tile)` of `world-programmer`. A member
  refuses an engage whose `at` is more than 120 s (TUNE) away from its own clock, reason `clock-skew`,
  with the HUD line "Your clock is off by more than 2 minutes" (PROPOSAL, Feedback F4).

### 7.2 Join

Each present member answers within 15 s (TUNE) with `join {engage, seat, entity}`: its hero (class,
level, final stats, current HP), its loadout (abilities with ranks and variants, passives, runes),
consumables (at most 3, §15.4), and nothing else. The squad size comes from the format table (§6.8),
not from the member (PROPOSAL).

- Each peer checks every `entity` with `validate_entity(entity, level)` (`progression-designer`):
  talent budgets (99 passive, 20 active at level 100), gates, stat bounds for the level. A failing
  entity is refused `bad-entity` and the leader leaves that seat out (section 16).

### 7.3 Lineup

The leader waits for joins up to the 15 s deadline, then sends `lineup {engage, joins}` with the
signed joins it holds, in seat order. Every peer verifies each join's signature again. The lineup
fixes who fights: a member left out spectates the fight from the party room (PROPOSAL).

### 7.4 Seed and ready

- The seats of the lineup run a `SealRound` on ctx `"<cid>/seed"` (section 5), with
  `cid = hex SHA-256(JSON ['combat', party, engage.id])` (PROPOSAL): the combat id, the `game` of every
  record of the fight, and the loot seed's "combat id" of §12.
- Every peer calls the pure `build_setup(engage, modifiers, lineup, seed) -> CombatSetup`
  (`world-programmer`; one pack per player at the level rule of §6.2, formats of §6.8) and hashes its
  canonical JSON. Each seat sends `ready {game: cid, setup: hash}`.
- The fight starts on a peer when it holds a `ready` from every lineup seat with its own hash. A
  different hash pauses the start with "Setup mismatch: copy diagnostics" and counts `setup-mismatch`
  (PROPOSAL). It means a version or data bug, since the inputs are identical and signed.

### 7.5 Dependencies

`world-programmer` (`build_setup`, `modifiers_at`, encounter of the leader's tile, group formats),
`encounter-boss-designer` (packs per player, level rule A12 of `lead-game-designer.md`),
`progression-designer` (`validate_entity`, stat bounds), `gameplay-programmer` (`CombatSetup` canonical
form, seed field), `client-programmer` (transition starts on "all ready"), `ux-designer` (join prompt
with countdown, lineup display).

### 7.6 Tests

- Given a lineup of seats 1 and 2 and opened seed values, When both pages run `build_setup`, Then both
  setup hashes are equal and both send `ready` with it.
- Given an `engage` with `at` 300 s ahead of the member's clock, Then it is refused `clock-skew`.
- Given a `join` signed by seat 2 but carrying `seat: 3`, Then it is refused `bad-join`.
- Given a `join` with 21 active points at level 100, Then `bad-entity` and the lineup leaves seat 2
  out.
- Given a `lineup` that drops the join of seat 3, When seat 3 receives it, Then seat 3 shows "You are
  not in this fight" and spectates.
- Given two `ready` with different hashes, Then no fight starts and `setup-mismatch` is counted.
- Integration (vitest, `fakeMesh(4)`, faults on): engage to start in under 100 ticks for 200 seeds
  (TUNE), every peer starts the same `cid` with the same setup hash.

### 7.7 Risks

The leader chooses the lineup and may leave a member out: harmless, the member just does not fight.
A member with a wrong clock cannot fight in the party until it fixes it: the HUD says so.

---

## 8. Combat lockstep (§4.7, §6.2, §6.3, §6.6, §6.7, §24.1, §24.5)

### 8.1 Who sends what

- **One signed record per player action** (`Move`, `Step`, `Ability`, `Consumable`, `Flee`, `EndTurn`,
  `Place`), as `gameplay-programmer` section 4.5 and arbitration A2 (each confirmed action commits,
  PROPOSAL there). Only the key of the seat that owns the **active entity** may send one.
- **Monster turns send nothing.** Every peer computes every AI entity's turn itself, with the same
  node budget, and the same `Effects` (PROPOSAL, Feedback F17). There is nothing to cheat and no
  owner to wait for. Preparations fire inside `apply_action` with no prompt (§6.3, FINAL there, "ça
  convient au P2P").
- **Prediction is free**: the active player applies its action locally, then sends it (tech.md
  section 6, FINAL there).

### 8.2 The `act` record

```ts
interface ActRecord {
  kind: 'act';
  game: string;  // the combat id
  seq: number;   // 0, 1, 2 ... over the whole fight, ctl records included
  prev: string;  // SHA-256 of the previous record, GENESIS for seq 0
  act: string;   // canonical action text, gameplay-programmer section 4.7
  post: string;  // state_hash right after this action, before any AI turn (16 hex)
  pub: string; sig: string;
}
// signed payload: JSON ['act', game, seq, prev, act, post, pub]
```

- Text, not JSON: it is short, canonical and already parsed by the engine (PROPOSAL). A text that
  does not round-trip through `parse`/`print` is refused `not-canonical`.
- `signedlog.ts`: a generic `SignedLog<R>` extracted from `MoveLog` (same verdicts: `wrong-game`,
  `replayed`, `out-of-order`, `bad-chain`, `wrong-key`, `bad-signature`), used by the classic
  `MoveLog` unchanged and by the combat log (PROPOSAL; Task NP-03 is a pure refactor with the classic
  tests green).

### 8.3 `CombatSession` (client/src/combatsession.ts)

A sibling of `OnlineSession`, not a fork of it: the classic session stays untouched (FINAL, §21 Mess).

```ts
interface CombatJudge {          // the WASM engine, the only judge
  activeSeat(): number;          // seat of the active player entity; 0 while an AI entity is active
  advance(): void;               // runs AI turns until a player entity is active or the fight ends
  play(act: string, live: boolean): string; // applies, returns the post hash; throws if illegal
  hash(): string;
  status(): number;              // 0 while the fight runs
}
```

- Receive path, inside the serial queue (shipped pattern): shape check, `SignedLog.verify`, seat of
  `pub` from the lineup, `judge.advance()`, then `activeSeat() === seat` else `not-their-turn`, then
  `play`; an exception is `illegal` and the sender is dropped from the fight (rules.md section 10.2,
  FINAL there). Then the post hash check (8.4), append, forward (6.1), `onAction`.
- Send path: the UI calls `act(text)` only when `canAct()`: we are the active seat, the transport is
  open, and every other lineup key is present or under takeover (shipped rule #143, extended).
- Order of AI work: a peer that receives a record while it still computes an AI turn finishes that
  turn first, since `advance()` runs before the seat check. Peers can be at different points in time,
  never at different states (PROPOSAL).

### 8.4 Desync (tech.md section 6, rules.md section 10.2)

- After `play`, the receiver compares its post hash with `post`. A mismatch pauses the fight on that
  peer, shows "Desync: this fight is void. Copy diagnostics", counts `desync`, and sends nothing more
  (PROPOSAL, FINAL in spirit: "a mismatch pauses the game", rules.md section 10.2).
- **Result of a void fight** (PROPOSAL, Feedback F21): group PvE, every member leaves the fight with
  no reward and no durability loss, the hero's HP as before the fight; PvP, no result and no rating
  change; BR, section 13.4.

### 8.5 Dependencies

`gameplay-programmer` (`apply_action`, `advance` semantics, canonical text, `state_hash`),
`ai-programmer` (AI turns fast enough on a low-end phone: 4 packs in under 2 s in total, TUNE),
`client-programmer` (bridge for `CombatJudge`, the "pack thinking" indicator, effects without
animation for replayed actions), `ux-designer` (net status line in a fight, desync banner).

### 8.6 Tests

- Given a lineup of seats 1 and 2 and seat 1 active, When seat 2 sends a valid `act`, Then it is
  refused `not-their-turn` and the state does not change.
- Given seat 1 sends `move (-1,0)(0,0)>E` with a `post` that differs from the receiver's hash, Then the
  receiver pauses, counts `desync`, and refuses every later record.
- Given seat 1 ends its turn and pack M1 plays next, When seat 2's record arrives before seat 2's peer
  finished M1's search, Then the peer finishes M1, applies the record, and the hash matches.
- Given an `act` with text `move  (-1,0)(0,0)>E` (two spaces), Then `not-canonical`.
- Given an illegal action signed by the active seat, Then `illegal`, and the sender's seat is dropped.
- Property (vitest, `fakeMesh(4)`, faults on, R10 golden fight with 4 bots driving the 4 seats through
  the session): for 100 seeds (TUNE), every peer ends with the same log head and the same final hash.
- E2E (Playwright, 2 pages, hook transport, R10 exit criterion "e2e à 2 onglets en groupe"): A and B
  form a party, engage a skirmish, play two full rounds (each a Move and an End turn), and both pages
  show the same HP and the same active entity. Screenshot in the PR.

### 8.7 Risks

- AI cost multiplies with the party: four packs searched on every peer. The node budget is the lever
  (`ai-programmer`); a slow peer lags but never diverges.
- A desync voids a 10-minute fight: the R1 determinism gate (3.2) and the cross-browser golden logs
  are the defence.

---

## 9. Catch-up, reload and retry (§6.12, §1 pillar 3)

### 9.1 Catch-up (#226 reused)

- The shipped `Sync {game, seq, asked}` / `Missed {of}` flow works unchanged with `game = cid`: a peer
  back from a drop asks from its `seq`, any lineup peer answers with the `act` and `ctl` records it
  missed, each checked like a live one (PROPOSAL: `Missed.of` widens to `ActRecord | CtlRecord`).
- A peer that joins late with no setup first asks for the lineup and the opens: the leader (or any
  peer) answers a `sync` whose `seq` is `-1` (PROPOSAL) with `engage`, `lineup`, the `open`s and every
  `ready`, then the records. The joiner rebuilds the setup itself and checks its hash.
- Replayed actions show without their effects (#232, FINAL shipped behaviour).

### 9.2 Reload (§6.12 "reprise après rechargement")

- The IndexedDB store `combat` (`client-programmer`) holds, for an online fight,
  `{ v: 1, online: true, party, cid, engage, lineup, opens, records: (ActRecord | CtlRecord)[],
  keys }` written after each record (PROPOSAL). The session key pair is kept for this fight only, so
  the reloaded page proves the same seat (tech.md reconnection, FINAL there: "keeps its keypair and
  seat").
- On load: rebuild the setup, replay the records through the engine (the only judge), rejoin
  `party/<code>`, send `Hello` then `Sync`. A save that does not replay is deleted, like
  `savegame.ts` (FINAL there).
- Private key storage: non-extractable `CryptoKey` in IndexedDB (structured clone keeps it
  non-extractable, PROPOSAL); never in the diagnostics export (FINAL, tech.md section 10).

### 9.3 Boss retry in a group (§1 pillar 3, §6.12)

A retry re-uses the same `CombatSetup` and seed, so no new handshake: the leader sends
`engage` with the same `id` and a flag `retry: true`, and every peer restarts from its stored setup
once every lineup seat sends `ready` again (PROPOSAL). Target: under 5 s from defeat to the first
turn (TUNE, §1 pillar 3). If a lineup member is gone, the retry needs a new engage (the format
changes with the party size, Feedback F23).

### 9.4 Dependencies

`client-programmer` (store `combat`, reload flow, no-animation replay), `gameplay-programmer`
(`replay`), `world-programmer` (`build_setup` pure), `ux-designer` ("Reconnecting...", "Catching
up...").

### 9.5 Tests

- Given a peer that missed records 10 to 14, When it sends `Sync {seq: 10}`, Then it gets 5 `Missed`
  in order, applies them, and its hash equals the others'.
- Given a reload after record 20, When the page loads, Then it shows the fight at record 20 with the
  same HP and active entity, and its `Sync` gets the records 21 and later.
- Given a stored fight whose record 7 no longer replays (rules changed), Then the save is deleted and
  the page shows the world.
- Given a defeat against a group boss, When the leader retries, Then both pages start turn 1 with the
  same setup hash in under 5 s (e2e timing assertion is soft, TUNE).
- E2E (2 pages): B reloads mid-fight, then both continue and finish with the same result.

### 9.6 Risks

IndexedDB can be cleared mid-fight (private mode): the peer then rejoins as a late joiner (9.1) and
proves nothing; its seat stays bound to the lost key, so the takeover of section 10 plays it.

---

## 10. Deadlines, stalls and drops (§6.2, §6.3, §19, rules.md section 10.2, OPEN-11)

### 10.1 The `ctl` record and the fork rule

```ts
interface CtlRecord { kind: 'ctl'; game; seq; prev; ctl: 'takeover' | 'resume' | 'claim'; seat: number; pub; sig; }
```

`ctl` records live in the same hash chain as `act` records. Two records with the same `seq` and
`prev` (a fork) can happen only when a deadline fires while the late player acts. **Fork rule**
(PROPOSAL): the record signed by the seat it concerns wins (its `act` or its `resume` beats a
`takeover` or a `claim` about it). A peer that applied the losing branch rebuilds the fight by replay
from the fork point and counts `fork-rewind`; records chained after the losing branch are dropped,
and their authors' clients rewind and let them play again (Feedback F7, Open question 3).

### 10.2 Group PvE: takeover by the player bot

- **Turn deadline**: 60 s (TUNE, the same as §19's reminder) from the moment the entity became active
  on the local screen. At 45 s (TUNE) the stalled player sees a countdown.
- **Drop**: a lineup key gone for 20 s (TUNE) counts like a missed deadline when its entity is
  active.
- **Who claims**: the lowest present lineup seat other than the stalled one (deterministic, no
  election). It signs `ctl takeover {seat}`.
- **Effect**: from that record on, every peer plays that seat's entity with the player bot of
  `ai-programmer` (pure, node budget, same on every peer), turn by turn, sending nothing. The owner
  returns by signing `ctl resume {seat}`; it takes effect at the start of its entity's next turn
  (PROPOSAL).
- Why a bot and not a rout: a friend whose tab crashed does not lose the fight for the party (§1
  pillar 5). An owner may prefer "rout after 2 missed turns" (Open question 2).

### 10.3 PvP: timeout claim (§19, rules.md section 10.2)

- The 60 s turn timer is a reminder (TUNE, §19). After it, the opponent may sign `ctl claim {seat}`.
  If the claimed seat sends no record within the 10 s grace (TUNE, rules.md section 10.2), the claim
  stands and the claimed seat loses (rules.md, PROPOSAL there). Same fork rule: a move at the same
  `seq` beats the claim.
- A claimed win is **settled** once the loser's peer acknowledges the head (any record or a `Sync`
  showing it holds it) or after the room closes (PROPOSAL). Until then the HUD shows "Win by timeout
  (pending)".
- The same claim ends a seal round when a PvP seat does not open (section 5.1).

### 10.4 Dependencies

`ai-programmer` (player bot callable as one entity's turn), `gameplay-programmer` (an entity "under
bot control" is not a state field: the session drives it, PROPOSAL), `ux-designer` (countdown,
"Bot plays for X", "pending" line), `pvp-br-designer` (claims in arena and BR).

### 10.5 Tests

- Given seat 3 active for 60 s, When the deadline fires on seat 1's peer, Then seat 1 signs `ctl
  takeover {seat: 3}` and every peer plays seat 3's turn with the bot, with equal hashes.
- Given seat 2 is lowest present, When seat 3 stalls, Then only seat 2 claims (seat 1 is gone).
- Given a fork at seq 30 (seat 3's `act` and seat 1's `takeover`), When a peer holds both, Then it keeps
  seat 3's `act`, rewinds if needed, counts `fork-rewind`, and its hash equals the others'.
- Given seat 3 under takeover, When it signs `resume`, Then its next turn waits for its own records.
- PvP: Given a claim and no move within 10 s, Then the claimant's HUD shows "Win by timeout
  (pending)", and "Win by timeout" once the loser's `Sync` holds the claim.
- Property: `fakeMesh(4)` with a random seat silenced for a random span, 200 seeds (TUNE): every fight
  ends, and every peer has the same final hash.

### 10.6 Risks

A rewind after a fork is visible (a turn replays). It needs a 60 s stall that ends in the same
instant as the claim: rare, and logged. Local clocks decide when to claim, never what the claim does.

---

## 11. Duels and arenas, normalised PvP (§19, §1 pillar 3, §6.1, §6.8, §11)

### 11.1 Rooms and invitations

- Every PvP match gets a fresh room `arena/<id>` (16 random bytes), never the party room (PROPOSAL:
  one room, one match, one log).
- **Duel** (§19, "n'importe où hors combat, sur invitation"): a signed `invite {to, mode: 'duel',
  room}` sent to a party member or to a key seen in a hub room (Feedback F14: there is no other way to
  reach a player). Accepting opens the room. The level-10 unlock (§11) is self-declared.
- **Arena 1v1 / 2v2** (§19): by link or code, or through an arena finder room (section 14.5). 2v2:
  4 seats, camps by seat (1 and 2 against 3 and 4, PROPOSAL), radius 5, 7 balls each (TUNE, §19).
- Spectators: the shipped relay tree (cap 4 per seated peer, FINAL there, tech.md).

### 11.2 Match start

1. `Hello` v2 (section 4.2) from each seat; `proto`, `rules`, `data` must match.
2. **Loadout seal** (ctx `"<cid>/loadout"`): class, Paths, abilities, ranks, variants, cosmetics.
   Sealed so nobody counter-picks after seeing the other (PROPOSAL, Feedback F5).
3. **Seed seal** (ctx `"<cid>/seed"`), may run in the same round as the loadout (one `SealRound`
   with `v = JSON [loadout, random]`, PROPOSAL: one round instead of two).
4. **Placement seal** (ctx `"<cid>/place"`): formation and hero swap, 20 s (TUNE, §6.1), opened
   together. Missing open: forfeit (section 5.1).
5. `ready` with the setup hash, then the lockstep of section 8. Initiative: highest VIT, tie by the
   seed (FINAL rule in §6.1; bit choice `gameplay-programmer`).

### 11.3 Normalisation check (§19 "gabarit de niveau 100", §1 pillar 3)

- **Ranked**: every peer rebuilds the opponent's hero from the opened loadout and the level-100
  template of its class (`pvp-br-designer` data), with `validate_entity` (budgets 99 and 20, gates,
  variants). Nothing about stats is declared: they are computed. A loadout that fails is a forfeit
  `bad-loadout` (PROPOSAL). This is the one place where P2P anti-cheat is complete (section 16).
- **Free arena and duels** (real gear): stats are self-declared and checked only against the bounds
  of `progression-designer` for the declared level (PROPOSAL); the inspect panel and the match screen
  say "self-declared, not verified" (FINAL wording in spirit, §13.4).
- PvP rules deltas (shorter controls, no level gap) are engine data selected by `setup.pvp`, not
  network code (`gameplay-programmer`).

### 11.4 Dependencies

`pvp-br-designer` (templates, arena formats, loadout content), `progression-designer`
(`validate_entity`, bounds), `gameplay-programmer` (`pvp` setup flag, initiative), `ux-designer`
(invite card, sealing and placement countdown, "unverified" labels), `client-programmer` (arena
scene, e2e).

### 11.5 Tests

- Given two seats that sealed loadouts, When seat 2 opens a loadout whose hash differs from its seal,
  Then `bad` and seat 2 forfeits.
- Given a ranked loadout with 21 active points, Then every peer refuses it `bad-loadout`.
- Given heroes at VIT 13 and 13 and seed `...1`, Then both pages agree on who plays first (rule from
  `gameplay-programmer`).
- Given a free-arena entity with 10 times the level-60 HP bound, Then it is refused `bad-entity`.
- Given a 2v2 room, When the fourth seat binds, Then camps are {1, 2} and {3, 4} on every page.
- E2E (Playwright, 2 pages, R10 exit criterion "e2e à 2 onglets en arène"): A invites B to a free
  1v1 arena, both pick a loadout, place in 20 s, and play until one hero dies; both pages show the
  same result. Screenshot in the PR.

### 11.6 Risks

A ranked match where both players use modified clients that agree on a fake template cannot be
caught: rating is "unverified" anyway (section 12).

---

## 12. Ranking (§19 "Classement"), gated by a Decision

§19 asks for a local Elo from signed match logs, shown as "unverified", and says it needs a Decision
because `SPEC.md` section 6 puts ranking out of scope. **No Task starts before that Decision** (Task
NP-21 is gated).

- **Persistent identity.** Session keys are per room (FINAL, shipped), so a rating needs the profile
  key of 4.3. `Hello.profile` + `Hello.bind` = profile signature of `JSON ['bind', room, pub]`
  (PROPOSAL). A ranked room refuses a seat without a valid bind.
- **Match record.** `{cid, setup hash, head hash, result, profiles: [p1, p2]}` stored in IndexedDB
  store `matches` (PROPOSAL). The signed log is the proof anyone can replay.
- **Rating.** Each player computes its own rating from its own match records: Elo with K = 24
  (TUNE), start 1200 (TUNE). The opponent's rating is the one it claims in a signed `rating` field of
  its ranked `Hello` (PROPOSAL, added to the fields of 4.2 with NP-21), clipped to 0..3000 (TUNE).
  Shown with the "unverified" glyph (FINAL in §19).
- **What it cannot stop**: new profile keys at will (Sybil), self-play between two keys. Accepted:
  nothing is at stake beyond a label (tech.md section 13 question 1).
- **Tests** (after the Decision): Given a 1200 vs 1200 win, Then 1212 (K 24); Given a ranked `Hello`
  without `bind`, Then refused `no-profile`; Given a stored match whose log does not replay, Then it
  does not count.
- **Dependencies.** An owner Decision (§19), `ux-designer` (rating display), `client-programmer`
  (stores `profile`, `matches`).
- §23's "classement local signé" of the Void Rifts uses the same profile signature on a local run
  record (PROPOSAL, same Decision).

---

## 13. Battle royale: lobby and RPG rounds (§20, §6.8, rules.md section 10.4, game-design section 6)

### 13.1 Lobby and seating (§20 "Calendrier")

- **Slots**: the schedule (daily 20:00 UTC and weekend slots, §20) is a pure function
  `br_slots(utc_day)` of `world-programmer` (PROPOSAL owner), like `daily.ts`.
- **Rooms**: `br/<build>/<slot ISO>/<shard>` (PROPOSAL). Lobby opens 5 min before the slot (TUNE). A
  page joins shard 0; if it sees 6 bound seats there, it tries the next shard, up to 16 shards (TUNE).
- **Coordinator** (liveness only, tech.md section 6, FINAL there): the present key with the lowest
  `hash32(pub + slot)` (PROPOSAL: deterministic, no join order needed, not always the same player).
- **Roster**: at the slot time, the coordinator signs `roster {room, epoch: 1, seats}` with up to 6
  keys (TUNE default 6, rules.md section 10.4) sorted by `hash32(pub + slot)`; empty seats are bots
  (FINAL, rules.md). A key not in the roster goes to the next shard, which starts 60 s later (TUNE).
- **Loadout seal**: everyone is normalised (level 20 template, 2 tier-1 abilities, §20); the two picks
  are sealed with the seed in one `SealRound` (section 5). Bot loadouts are a pure function of the
  seed (PROPOSAL).

### 13.2 Rounds (rules.md section 10.4 option C, §20 "un ordre de tour")

- An **order** is up to 3 actions in text, joined by `; `: at most 1 Action, 1 Quick action, 1 Move
  (§20), in the order the player wrote them (PROPOSAL, Feedback F10). Sealed with ctx
  `"<cid>/order/<round>"`.
- Round deadline: 15 s from the round start on the local screen (TUNE, rules.md section 10.4; OPEN-2
  there with tech.md's 30 s). A seat with no `open` by the deadline + 5 s (TUNE) holds.
- **Resolve**: every peer calls `resolve_round(state, orders)` of `gameplay-programmer` with the
  orders in the rotating initiative order (rules.md, PROPOSAL there). Each action of an order is
  validated at its own turn; an illegal action fizzles alone and the rest of the order still runs
  (PROPOSAL, Feedback F10). Bot orders are computed by every peer from the round-start state and the
  seed, before the reveal (FINAL, rules.md).
- **Round record**: each seat signs `round {game, round, post}` with its post-round hash (PROPOSAL).
  The BR log is `{setup, rounds: [{opens: Open[], post}]}`, the replay file.

### 13.3 Elimination and spectating

An eliminated seat (hero dead or no ball left, §20, FINAL there) keeps its connection as a spectator
and stops sealing (PROPOSAL; its forward of records continues, which helps the mesh).

### 13.4 Desync in BR

With 6 peers, a peer whose `round` hash differs from the majority of seated peers' hashes is told
"Desync: you left the match" and becomes a spectator of the majority (PROPOSAL). With no majority
(3 against 3), the match is void for all (PROPOSAL). An honest majority wins because the engine is
the same.

### 13.5 Dependencies

`gameplay-programmer` (`resolve_round` over RPG actions, fizzle per action), `pvp-br-designer` (seat
count, wedges OPEN-5, chests, breach, scoring OPEN-7), `world-programmer` (schedule), `ai-programmer`
(BR bot orders, pure), `ux-designer` (lobby list, order composer, resolution replay),
`engine-programmer` (radius 8 region beyond `MAX_RADIUS`).

### 13.6 Tests

- Given 8 keys in shard 0 at the slot, When the coordinator signs the roster, Then 6 keys are seated
  in `hash32` order and the 2 others move to shard 1.
- Given orders `cast mage.firebolt @(1,0); move (0,0)>E` where the cast is illegal at its turn, Then
  the cast fizzles and the move still resolves.
- Given 6 seats and one silent seat, When the deadline passes, Then that seat holds and is flagged, and
  every peer's round hash is equal.
- Given round hashes 5 equal and 1 different, Then the odd peer becomes a spectator, the 5 go on.
- Property: `fakeMesh(6)` with faults and bots on empty seats, 100 matches (TUNE): every seated honest
  peer ends with the same final hash.
- E2E (3 pages + 3 bots, hook transport): one BR match of 5 rounds (TUNE) completes on every page with
  the same standings.

### 13.7 Risks

Full mesh of 6 = 15 links (FINAL arithmetic, tech.md says fine). A slow link loses rounds (accepted
in game-design section 6). Two seats played by one person (collusion) cannot be stopped (accepted,
tech.md section 6).

---

## 14. Presence: hub, signals, inspection, finders (§4.7 "Présence au hub", §21, §18, §13.4)

### 14.1 Rooms and shards (§4.7: "salle Trystero publique, best effort, jamais nécessaire")

- One public room per hub area and shard: `hub/<build>/<area>/<shard>`, areas from §21 (Bridge, Mess,
  Hold, Furnace, Chapel, Launch bay, Archives) (PROPOSAL).
- **Cap 12 peers per shard** (TUNE, mesh of 66 links): a page that sees 12 or more keys in its first
  3 s (TUNE) leaves and tries the next shard, up to 8 shards (TUNE). Party members ask for the
  leader's shard first, so a party stays together (PROPOSAL).
- Never needed to play (FINAL, §4.7): every hub feature works with zero peers.

### 14.2 Beacons

`beacon {room, cell, look}`: the hub cell of the sender's marble and its cosmetic ids, signed by the
session key. Sent on each move, at most 2 per second (TUNE), plus a heartbeat every 5 s (TUNE); a key
silent for 15 s (TUNE) is hidden. Other marbles are drawn at their last cell, with their callsign.

### 14.3 Emotes and pings

The same `signal` as 6.4, same rates, plus a local mute per key. 4 emotes and pings only, no chat
(FINAL, §1 pillar 5, §21).

### 14.4 Inspection (§13.4, §21)

`inspect-ask {to}` to one key; it answers `inspect {gear}` (equipment manifest, level, class, Paths)
signed. Shown with "self-declared, not verified" (FINAL wording intent, §13.4). Answering is a
setting (on by default, PROPOSAL).

### 14.5 Group finder, arena finder, world-boss rendezvous (§21, §11, §18)

- **Group finder** (level 15, §11): room `lfg/<build>/<band>`, band = level / 10 (PROPOSAL); a listing
  is a beacon with `{party code, size, zone}`; joining a party is the normal invite flow. Same cap and
  shards.
- **Arena finder**: room `arena-lfg/<build>/<mode>`; two listed keys that both click each other get a
  room id from the lower key (PROPOSAL).
- **World bosses** (§18, every 3 h, UTC schedule from `encounter-boss-designer`): room
  `wboss/<build>/<boss>/<slot>/<shard>`, cap 4 (FINAL max party size); the first 4 bound keys form a
  party automatically, the creator being the lowest `hash32(pub + slot)` key (PROPOSAL).

### 14.6 Dependencies

`ux-designer` (callsigns, mute, inspect panel, finder lists), `client-programmer` (hub scene marbles),
`world-programmer` / `encounter-boss-designer` (slots), `economy-designer` (gear manifest format).

### 14.7 Tests

- Given 12 keys in shard 0, When a 13th page joins, Then within 3 s it moves to shard 1.
- Given a beacon every 100 ms from one key, Then at most 2 per second are applied, the rest counted
  `rate-limited`.
- Given a key silent for 15 s, Then its marble is hidden.
- Given a muted key, Then its emotes and pings are not shown, its marble still is.
- Given an `inspect` answer, Then the panel shows the "not verified" label.
- E2E (2 pages, hook transport): both enter the Mess, each sees the other's marble move and an emote.
  Screenshot in the PR.

### 14.8 Risks

Public rooms are spammable (game-design section 3.5, multiplayer.md section 3): rate limits and mutes
are client-side only. Public Nostr relays may rate-limit many shards: measured by the `net` counters.

---

## 15. P2P trade (§13.4)

### 15.1 Protocol

1. `trade-offer {trade, rev, give}`: `trade` 16 random bytes chosen by the opener, `rev` grows on each
   edit, `give` = the item manifests offered (at most 12, TUNE). Signed, sent to the other key only.
2. `trade-lock {trade, terms}`: first confirmation. `terms` = hex SHA-256 of
   `JSON ['terms', trade, pubA, giveA, pubB, giveB]` with A the lower key (PROPOSAL). Any new offer
   cancels both locks.
3. `trade-confirm {trade, terms}`: second confirmation, sent only once both locks with the same
   `terms` are held (FINAL in §13.4: "double confirmation, signed by both peers").
4. A peer that holds both confirms applies the trade to its own save: removes `give` of its side,
   adds the other side's items (PROPOSAL).

- Each received item passes `validate_item` (`economy-designer`): not bound (§12, FINAL there), stats
  within the ranges of its iLvl and rarity. A failing item cancels the trade `bad-item`.
- The pending trade (both offers, locks, confirms) is kept in IndexedDB store `trade` until applied,
  and its confirm is resent on reconnect (PROPOSAL), so a drop between the two confirms completes
  later instead of half-applying forever.

### 15.2 Limits (accepted in §13.4)

Saves are local: an item can be duplicated by editing a save. Trades stay "between friends" (§13.4).
There is no atomic swap without a third party: if one side never comes back, it may keep both sides
(the signed confirms prove what was agreed).

### 15.3 Dependencies

`economy-designer` (item manifest, `validate_item`, gold in trades: Feedback F13), `ux-designer`
(trade window), `client-programmer` (save update, store `trade`).

### 15.4 Tests

- Given both locks with equal terms, When each side confirms, Then both saves swap the items.
- Given an edit after one lock, Then both locks are void and confirm is refused `not-locked`.
- Given a bound item in an offer, Then `bad-item` and nothing changes.
- Given the second confirm lost in a drop, When the peers reconnect, Then the resent confirm applies
  the trade on the late side.
- E2E (2 pages in a party): A gives B one unbound ring, both confirm twice, B's inventory shows it.

---

## 16. Anti-cheat summary (§4.7, §13.4, §19, tech.md section 6)

| Input | Verified by every peer | How | Mode |
|---|---|---|---|
| Each combat action | Yes | Engine replay, seat check, post hash | all |
| Combat seed, loadouts, placement, BR orders | Yes (not biasable) | Sealed values (section 5) | all |
| Who acted | Yes | Ed25519 per room, hash chain | all |
| Hero stats and gear | Bounds only | `validate_entity` against the declared level | group PvE, free arena, duels |
| Hero stats in ranked | Yes | Computed from the template and the loadout | ranked arena, BR |
| Level, unlocks, quests, loot, gold | No | Local save | all ("unverified" where shown) |
| Rating | No | Local Elo, Sybil possible | ranked (Decision) |
| Clock | No | Local deadlines; `at` within 120 s (TUNE) | all |
| Collusion, two seats one player | No | Accepted (tech.md section 6) | BR |

The rule for the UI (PROPOSAL, `ux-designer`): anything in the "No" or "Bounds only" rows shown about
another player carries the "not verified" glyph.

---

## 17. Observability (tech.md section 10)

- `netcounters.ts` gains: `desync` (combat), `setup-mismatch`, `fork-rewind`, `takeover`, `claim`,
  `seal-missing`, `version-mismatch`, `clock-skew`, `rate-limited`, `forwarded`, and refused
  messages by the new reasons (PROPOSAL).
- `logger.ts` events: `party` (roster epoch, leader change), `engage` (id, lineup size), `seal`
  (ctx, done or missing), `combat` (cid, seq, hash on each record at `debug`).
- **Copy diagnostics** adds, for an online fight: party code, cid, lineup keys (public), the setup
  hash, the canonical setup, every `act` and `ctl` record, the opens (FINAL rule kept: public data
  only, no private key).
- **Tests.** Given a desync, Then the counter is 1 and the export holds the record that diverged.
  Given an export, Then no `priv` field appears anywhere (regression of the shipped rule).

---

## 18. Feedback on the gameplay spec

Each item: the problem, then a proposal. Numbered F1 to F24 for cross-reference.

- **F1. BR seat count.** §6.8 says the battle royale has "5 joueurs" as enemies; §20 says 6 players;
  rules.md section 10.4 says 3 to 6 with a default of 6 (TUNE there). Proposal: 6 seats, so 5
  opponents; reword §6.8 as "5 opponents".
- **F2. Whose world decides a group encounter.** §4.7 makes the world state local to each player
  (cleared tiles, packs), and §6.2 spawns one pack per player, but nothing says whose tile content,
  aggro and patrol trigger the group fight. Proposal: the leader's instance decides (section 7.1);
  each member's cleared flags change only in its own save.
- **F3. Party movement.** §4.7 gives the leader "the position of the group on the map", while each
  player has "its own instance": can members walk alone? Proposal: in a party the group moves as one,
  driven by the leader; members ping (section 6.3). Free roaming in a party would need per-member
  positions and a rule for who is in a fight.
- **F4. UTC values and peer clocks.** Night and weather (§4.8), weekly affixes (§17), world bosses
  every 3 h (§18), the BR calendar (§20) and the daily merchant (§13.2) come from UTC, but peers'
  clocks differ and nothing says whose clock decides at a fight's start. Proposal: the engage's `at`
  decides, members accept within 120 s (TUNE) (section 7.1).
- **F5. Hidden PvP placement and loadouts.** §6.1 gives PvP placement 20 s but not whether it is
  simultaneous and hidden; sequential placement lets the second player react. Loadout choice (§19,
  §20 "2 capacités au choix") has the same issue. Proposal: both sealed (sections 11.2, 13.1).
- **F6. What the combat seed drives.** Choice 4 says no dice in combat and §24.1 draws seeds by
  commit-reveal, but the spec never lists what the seed feeds. The converted Chaplain (§18) keeps a
  seeded 3-in-4 chance today (rules.md section 10.3, #207), which is a dice roll in combat. Proposal:
  the seed feeds only setup, placement tie-break, PvP initiative tie and BR chests (as
  `lead-game-designer.md`); the converted Chaplain loses its chance roll or has it in its tell.
- **F7. No AFK or drop rule in group combat.** §6.2 and §6.3 define turns but nothing for a player who
  stops playing or whose tab closes; three others wait forever. rules.md OPEN-11 is still open for
  1v1. Proposal: section 10.2 (takeover by the player bot) and a fork rule.
- **F8. The PvP timer relies on an unbuilt mechanism.** §19 points to rules.md section 10.2 for the
  timeout claim, which says "planned for later" and does not handle a move that crosses the claim.
  Proposal: section 10.3 (claim record, 10 s grace, the late move wins a fork, "pending" until the
  loser acknowledges).
- **F9. Ranking needs a persistent identity.** §19's local Elo from signed logs cannot work with the
  per-room keys of tech.md section 6; the spec does not define a profile identity and does not
  mention Sybil keys. Proposal: section 12, gated by the Decision §19 already asks for.
- **F10. BR order resolution details.** §20 allows 1 Action, 1 Quick action and 1 Move per order, but
  not their order inside the order, nor what happens when one of them is illegal at its turn
  (all fizzle, or only that one). Proposal: written order, per-action fizzle (section 13.2).
- **F11. BR lobby mechanics.** §20 says "on rejoint un salon P2P, des bots remplissent" but not how
  many lobbies exist per slot, who closes the roster, or what a 7th player does. Proposal: shards of
  6, a deterministic coordinator, overflow to the next shard 60 s later (section 13.1).
- **F12. Hub presence has no cap.** §4.7 and §21 want visible players in public rooms, but a
  Trystero full mesh does not scale past about a dozen peers (multiplayer.md section 1). Proposal:
  shards of 12 per hub area (section 14.1). The v2 contested zones of §19 (8 to 16 players) are at
  the edge of a mesh and need a measurement first.
- **F13. Trade atomicity and gold.** §13.4 asks for a signed double confirmation but cannot make the
  swap atomic without a third party, and does not say whether gold or Glow can be traded. Proposal:
  pending trade kept and resent (section 15); `economy-designer` decides on currencies.
- **F14. Duel invitations have no channel.** §19 allows a duel "anywhere out of combat", but outside
  a party or a hub room a player cannot see or reach another (§4.7: own instance). Proposal: invites
  only to party members and to keys seen in a hub or finder room (section 11.1).
- **F15. Self-declared inputs in group PvE.** §4.7 says each peer validates each action, which is
  true, but hero stats and gear in a group fight are declared by their owner and cannot be checked
  beyond bounds. The spec should say so next to §13.4's "unverified" gear. Proposal: section 16
  table.
- **F16. Last-revealer bias in commit-reveal.** §4.7 and §24.1 draw combat seeds by commit-reveal
  but do not say what happens when a peer never reveals: the last revealer can abort after seeing the
  others to re-roll. Proposal: forfeit in PvP, abort in PvE where nothing is at stake (section 5.1).
- **F17. Who computes monster turns online.** §4.7 says no peer has authority over combat, but not
  who plays the packs in a group fight. Proposal: every peer computes every AI turn with the node
  budget (section 8.1). The spec should give a node budget for a 4-pack round on a low-end device.
- **F18. Level-gated unlocks are self-declared.** §11 gates duels (10), group finder (15) and arena
  (25) by level, which is a local save value in P2P. Proposal: keep the gates as UI only and say so.
- **F19. Group size and formats outside the party limit.** §6.8 lists raid formats "3 to 7 tiles" for
  a quartet and §18 raids of 4, consistent with the 4-seat party; but §19's v2 contested zones (8 to
  16 players) and the v2 two-scale BR (§20) exceed it. Proposal: mark both as "needs a network
  spike" in the roadmap.
- **F20. Board region for BR and raids.** §6.8 BR radius 8 and 7-tile raids exceed
  `MAX_RADIUS = 5` (§24.2 already says so). Listed here because both are R10 network exit criteria;
  `engine-programmer` must land the region mask before R10.
- **F21. Result of a void fight.** Nothing says what a desync does to rewards, durability or HP.
  Proposal: section 8.4 (no reward, no loss, HP restored; no PvP result).
- **F22. "Seed of the combat" for personal loot.** §12 seeds loot with `(save, combat id)` but no
  combat id is defined online. Proposal: `cid` of section 7.4 (and a local counter offline,
  `client-programmer`).
- **F23. Group boss retry.** §1 pillar 3 promises a retry in under 5 s with the same seed; in a group
  that only holds if the same members are still there, since the format depends on party size (§6.8).
  Proposal: section 9.3 (same lineup: instant retry; changed party: new engage).
- **F24. Group quest credit is unverifiable.** §16 says a combat objective counts for each present
  member; each member's client decides it from its own log, which is fine, but the spec could state
  that shared credit is local (no proof sent to the others).

---

## 19. Open questions

1. Monster turns: every peer computes them (this file) or the pack's owner sends them and others
   only check legality (cheaper on slow phones, but lets the owner play its pack badly)?
2. A stalled or dropped player in group PvE: player-bot takeover (this file), rout after 2 missed
   turns, or pause until it returns?
3. Is the fork rule acceptable, with its rare visible rewind, or should a takeover wait for an extra
   acknowledgement round (no rewind, slower)?
4. PvP: does a missing reveal forfeit the match (this file), including in unranked duels?
5. Ranking and the profile key need the Decision §19 asks for: open it now or after R10?
6. Hub shard cap: 12 (TUNE here) or measured first with the R10 build?
7. Callsigns generated from keys (no free text, this file) or chosen from a word list by the player?
8. TURN stays out (multiplayer.md): with 4 peers, is forwarding through a third member enough, or
   should an owner revisit option E for parties?
9. Can gold and Glow be traded (F13)?
10. Does a member left out of a lineup spectate (this file) or stay in the world?
11. Clock skew tolerance for an engage: 120 s (TUNE here) or stricter around the night switch?
12. Should the free arena and duels refuse an entity outside stat bounds (this file), or only label it?

---

## 20. Tasks

One Task = one PR. Every code Task: strict TDD (test commit first), 100 % line coverage (Rust lines
and regions), unit tests, and a Playwright e2e when a player sees the change, with a screenshot in the
PR for a UI change (CONTRIBUTING sections 6.4 and 11). Phases from §25. Dependencies name the Task or
the role that must land first.

| ID | Phase | Title | Outcome (one sentence) | Done checklist | Needs |
|---|---|---|---|---|---|
| NP-01 | R1 | Golden combat logs: same hash native, wasm and three browsers | A recorded RPG fight replays to the same state hash on every target, so lockstep is safe to build. | 10 golden logs (TUNE) with `RULES_VERSION`; native test; vitest through the WASM bridge; e2e:all replay in Chromium, Firefox, WebKit; a mutated log changes the hash | `gameplay-programmer` `replay` and `state_hash`; `ai-programmer` seeded bot |
| NP-02 | R10 | Fault-injecting mesh transport for tests | Net tests can drop, duplicate, reorder, delay and partition messages with a seed and a manual clock. | `fakemesh.ts` with seed, drop, dup, reorder, delay, partition, heal, leave; unit tests per fault; excluded from the bundle | none |
| NP-03 | R10 | Generic signed log extracted from MoveLog | The combat log reuses the shipped hash chain and verdicts, with the classic game unchanged. | `SignedLog<R>` in `signedlog.ts`; `MoveLog` built on it; every classic test green unchanged; new tests for a second record type with a `post` field | none |
| NP-04 | R10 | Hello v2 with version gate | Peers on different rules, data or world versions refuse each other with a clear reload line. | `proto`, `rules`, `data`, `world` signed in `Hello`; classic Hello still verifies; refusal `version-mismatch` counted; HUD line; e2e two pages with different versions | `tech-lead` version and data hash; `client-programmer` getters |
| NP-05 | R10 | Sealed values and the combat seed | One commit-reveal module gives the same unbiasable seed on every peer. | `sealed.ts` (`sealOf`, `SealRound`, `seedOf`); early, bad, dup cases; deadline outcomes per context; 500-seed property on `fakeMesh(4)` | NP-02 |
| NP-06 | R10 | Party room of 4 with leader and roster | Players form a party of up to 4 by link or code and see who leads and who is connected. | `party.ts`; `#party=` link and short code; roster epochs; leader = lowest present seat; `party-full`; `leave`; forwarding of signed records; party panel; e2e 3 pages; screenshot | NP-02, NP-04; `ux-designer` panel |
| NP-07 | R10 | Party movement, pings, emotes and quest share | Party members follow the leader on the map and talk only with pings, emotes and quest shares. | `pos` from leader only, rate limit; `signal` emote, ping, share; rates and mute; follow animation; e2e 2 pages; screenshot | NP-06; `world-programmer` path; R6 quest ids for share |
| NP-08 | R10 | Group engage handshake | Every party member starts the same group fight from the same signed inputs. | `engage`, `join`, `lineup`, seed round, `ready` with setup hash; `clock-skew`, `bad-join`, `bad-entity`, `setup-mismatch`; 200-seed integration on `fakeMesh(4)` | NP-05, NP-06; `world-programmer` `build_setup`, `modifiers_at`; `progression-designer` `validate_entity` |
| NP-09 | R10 | Combat lockstep session | A party plays a fight turn by turn with signed actions, local monster turns and desync detection. | `combatsession.ts`; `act` record; seat check after `advance`; post hash; `not-canonical`, `illegal`, `not-their-turn`; desync pause and void result; 100-seed property; e2e 2 pages group skirmish (R10 exit); screenshot | NP-03, NP-08; `gameplay-programmer` canonical text; `client-programmer` judge bridge |
| NP-10 | R10 | Online combat catch-up and reload | A player who drops or reloads mid-fight comes back at the same action. | `Sync`/`Missed` for `cid`; late joiner gets engage, lineup, opens, ready; store `combat` online record with fight keys; delete on bad replay; group boss retry with the same setup; e2e reload mid-fight | NP-09; `client-programmer` store |
| NP-11 | R10 | Group stall and drop takeover | A stalled or disconnected member's entity is played by the player bot until it resumes. | `ctl takeover` and `resume`; claimer = lowest present seat; 60 s and 20 s deadlines (TUNE); fork rule with rewind; counters; 200-seed property; HUD countdown and "Bot plays for X" | NP-09; `ai-programmer` player bot per entity |
| NP-12 | R10 | Duels and free 1v1 arena | Two players fight a 1v1 with real gear after sealed loadouts and placement. | `invite`; fresh `arena/<id>` room; loadout and seed in one seal round; placement seal 20 s; forfeit on missing open; bounds check; spectators; e2e 2 pages arena (R10 exit); screenshot | NP-05, NP-09; `pvp-br-designer` loadout; `progression-designer` bounds |
| NP-13 | R10 | Ranked normalisation check | In ranked, every peer rebuilds the opponent's level-100 template hero and refuses an illegal loadout. | Template stats computed, never declared; `bad-loadout` forfeit; ranked flag in setup; tests per budget and gate | NP-12; `pvp-br-designer` templates |
| NP-14 | R10 | 2v2 arena seats | Four players play a 2v2 arena with fixed camps. | 4 seats; camps {1,2} vs {3,4}; radius 5 setup; e2e 4 pages (2 humans + hook-driven) | NP-12; `engine-programmer` radius 5 region |
| NP-15 | R10 | PvP timeout claim | A player can claim a win against an opponent who stays silent past the timer and the grace. | `ctl claim`; 60 s reminder and 10 s grace (TUNE); fork rule; "pending" until acknowledged; tests; HUD lines | NP-11, NP-12 |
| NP-16 | R10 | Battle royale lobby and seating | Players who join a scheduled BR slot are seated in shards of 6 with bots filling the rest. | `br/<build>/<slot>/<shard>` rooms; coordinator by `hash32`; signed roster; overflow shard; sealed normalised loadouts; lobby list UI; screenshot | NP-05, NP-06; `world-programmer` `br_slots` |
| NP-17 | R10 | Battle royale RPG rounds | A BR match resolves sealed orders of up to 3 actions per round identically on every peer. | Order text with `; `; seal per round; 15 s deadline + 5 s (TUNE); per-action fizzle; `round` hash; majority rule; spectating; 100-match property; e2e 3 pages + 3 bots | NP-16; `gameplay-programmer` `resolve_round`; `engine-programmer` radius 8 |
| NP-18 | R10 | Hub presence | Players in the same hub area see each other's marbles, emotes and pings, and can inspect gear. | Shards of 12 (TUNE); beacons and heartbeats; callsigns; rate limits; mute; inspect with "not verified"; works with zero peers; e2e 2 pages; screenshot | NP-04; `client-programmer` hub scene; `ux-designer` callsigns |
| NP-19 | R10 | Group finder, arena finder and world-boss rendezvous | Players find a party, an arena opponent or a world-boss group through public best-effort rooms. | `lfg`, `arena-lfg`, `wboss` rooms; listings; auto party of 4 for a world boss; shards; e2e 2 pages | NP-06, NP-12, NP-18; `encounter-boss-designer` schedule |
| NP-20 | R10 | P2P trade | Two players swap unbound items after a double signed confirmation. | `trade-offer`, `trade-lock`, `trade-confirm`; terms hash; edit voids locks; `validate_item`; pending trade store and resend; e2e 2 pages; screenshot | NP-06; `economy-designer` `validate_item`, R5 inventory |
| NP-21 | R10 | Profile key and unverified local rating | Ranked players keep a local rating computed from their signed match logs. | **Blocked until the §19 Decision**; profile key store; `bind` in Hello; `matches` store; Elo K 24, start 1200 (TUNE); "unverified" display | Decision (§19); NP-13 |

**Order.** NP-01 lands in R1 (it is the R1 determinism exit criterion). R10 order: NP-02, NP-03,
NP-04, NP-05, NP-06, NP-08, NP-09 (first group fight), NP-10, NP-11, NP-07, NP-12 (first arena),
NP-13, NP-15, NP-14, NP-16, NP-17, NP-18, NP-19, NP-20, NP-21. At most one open PR per author at a
time (CONTRIBUTING rule 16).

**R10 exit criterion covered** (§25: "e2e à 2 onglets, en groupe et en arène"): NP-09 (group) and
NP-12 (arena).
