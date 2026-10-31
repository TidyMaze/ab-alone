---
id: multiplayer-spike
type: architecture-design
status: draft
title: "Multiplayer sync spike (#58)"
parent: architecture
---

# Multiplayer sync spike (#58)

Status: spec, no code. Date of every price check: 2026-10-23.
Constraint from [#36](https://github.com/TidyMaze/ab-alone/issues/36) (owner decision): GitHub Pages only, peer to peer, no game server.
Any option that needs a server we run or pay for **reopens #36**. Those rows are marked.

## 1. What has to be synced

- Abalone is turn-based. State is small (one board, a move list), so we sync an ordered, signed move log, not a state stream.
- A full WebRTC mesh does not scale past a few dozen peers per room. "MMO" therefore means many small rooms (one per board) plus a shared lobby and world layer.
- Load to design for: **100 concurrent players** (dozens of boards) and **10,000 concurrent players** (about 5,000 boards if all play 1v1).

## 2. Options compared

Prices are from vendor pages checked on 2026-10-23. "not verified" means the page did not give the figure or I could not check it.

| Option | Fits #36 | 100 players | 10k players | NAT failure | Persistence and lobby | Cheating | Ops effort |
|---|---|---|---|---|---|---|---|
| **A. Pure P2P**: WebRTC data channels, Trystero over public Nostr relays, public STUN, no TURN | Yes | Works for matched pairs. Lobby is ephemeral. | Matches still work pair by pair. No shared lobby or ladder without another layer. | Fails behind symmetric NAT, no fallback (see section 4) | None. Lobby only exists while peers are online. | Peers validate every move with the same WASM engine (tech spec section 6). | Low. No server. |
| **B. P2P matches + Nostr as shared signed log** (lobby, presence, ladder as signed events) | Yes | Same as A. | Lobby events go through public relays. Relay load is outside our control. Cost: free to use per the Nostr design, relay operators set limits (not verified). | Same as A | Public, signed, append-only. Anyone can replay. Relays can drop or censor events. | Signed events make forgery detectable. Spam is not stopped by the protocol (section 3). | Low. Depends on relay operators we do not run. |
| **C. P2P matches + Cloudflare Durable Objects** (one DO per board, `abalone-core` WASM via workers-rs) | **No, reopens #36** (server-side code) | Free tier covers this load on paper, but see the cost note below. | One DO per board. Cost scales with requests and GB-seconds. | Server relays the moves, so NAT failure disappears for the match | Authoritative per board. Lobby can live in one DO. | Server validates every move. Cheating stops at the server. | Medium. We run Workers code and a deploy pipeline. |
| **D. Hosted backends**: SpacetimeDB, Colyseus, Nakama | **No, reopens #36** (external server) | Within free or low tiers (see price table below) | Needs paid tiers | Relayed through the host | Managed | Server-side | Low to medium. Vendor lock-in and a second stack (Rust module, TypeScript, or Lua/Go). |
| **E. TURN fallback** (added to A or B to fix NAT failures) | Partly. TURN is a relay we do not run, paid by usage. | Only the few peers behind symmetric NAT use it. | Traffic grows with the share of relayed peers. | Fixes it | None | Relay sees ciphertext only if DTLS is used (not verified for every vendor) | Low, but needs credentials handled in client code or a token endpoint (which is a server). |

### Price table (vendor pages, checked 2026-10-23)

| Service | Price and free tier | Source |
|---|---|---|
| Trystero | MIT license. Library, no price. Supports Nostr (default), BitTorrent, MQTT, IPFS, Supabase, Firebase, self-hosted WebSocket relay. | [github.com/dmotz/trystero](https://github.com/dmotz/trystero) |
| Nostr relays | Public relays are run by third parties. No price is published by the protocol. Default relay list and their limits: **not verified**. | not verified |
| Cloudflare Workers Paid | **$5 per month minimum per account.** 10 million requests and 30 million CPU ms included per month (Standard usage model). | [developers.cloudflare.com/workers/platform/pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Cloudflare Durable Objects | Workers Paid: 1 million requests per month included, then $0.15 per million. 400,000 GB-s included per month, then $12.50 per million GB-s. Free plan: 100,000 requests per day and 13,000 GB-s per day, SQLite storage 5 GB total. Billing is rounded up per billable unit. | [developers.cloudflare.com/durable-objects/platform/pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) |
| Cloudflare Realtime TURN | $0.05 per real-time GB, outbound from Cloudflare to the client. Free when used with the Realtime SFU. No free GB allowance stated. Inbound charge: not stated (not verified). | [developers.cloudflare.com/calls/turn](https://developers.cloudflare.com/calls/turn/) |
| Twilio Network Traversal (TURN) | STUN free and unlimited. TURN is pay as you go by bandwidth. **Rate and currency not verified** (not on the page). | [twilio.com/en-us/stun-turn](https://www.twilio.com/en-us/stun-turn) |
| SpacetimeDB Maincloud | Free: $0, 2,500 TeV credit per month (about 3M function calls, 12.5 GB egress, 1 GB storage). Pro: $25 per month, 100,000 TeV credit. Team: $250 per month, 250,000 TeV credit. Enterprise: custom, not verified. Page states 2,592 TeV = $1 after credit. | [spacetimedb.com/pricing](https://spacetimedb.com/pricing) |
| Colyseus | Framework free and open source (self-hosted). Colyseus Cloud "starting at $15/mo". Included CCU and what the $15 covers: **not verified**. | [colyseus.io/pricing](https://colyseus.io/pricing/) |
| Nakama (Heroic Cloud) | Price **not verified** (the page shows a template placeholder). Satori starts from $600 per month. Nakama open source license: **not verified** on the page. | [heroiclabs.com/pricing](https://heroiclabs.com/pricing/) |

### Cost note for 10k players

The cost of option C depends on a load profile (moves per game, messages per move, active seconds per board), which the repo does not have yet.
**No 10k cost figure is given here.** A useful first step is to measure messages per game with the 1v1 prototype, then apply the Durable Objects rates above.
The formula is: requests (1 per message) against the 1M included and $0.15 per million, plus GB-s (memory GB times active seconds) against 400k included and $12.50 per million.

## 3. Failure modes

| Failure | Affects | Detection | Mitigation |
|---|---|---|---|
| **Relay outage** (Nostr or BitTorrent signaling down) | New matches and lobby. Running matches keep going once SDP is exchanged. | Connect timeout (`handshakeTimeoutMs`, default 10000 ms in Trystero) | Several relays in the config. Manual invite link or room code as fallback (no relay needed for a known peer, only if both can reach STUN). |
| **Host drop** (peer that owns the match leaves) | The match | Missing heartbeat, closed data channel | Move log is replicated on both peers, so a surviving peer keeps the last signed state. Host migration is the rule of tech spec section 6. Only the move log matters, so resume is cheap. |
| **NAT failure** (symmetric NAT, carrier-grade NAT, corporate network) | Some pairs cannot connect at all | ICE state `failed` after timeout | Option E (TURN) for those pairs, or a clear "cannot connect directly" screen. Share of such pairs: not verified. |
| **Cheating** (forged or illegal moves, forged lobby events) | Fairness | Every peer runs the same rules engine on every move. A bad move is rejected and reported. Signed, hash-chained log makes replay and forgery visible. | Deterministic engine plus signatures. Lobby rankings are not authoritative (anyone can publish a fake result). Ladder needs a witness or an owner-run check, which costs money (option C or D). |
| **Spam** (lobby flooding, fake rooms, relay abuse) | Lobby, relays | Rate of events per pubkey | Client-side rate limit, ignore unknown pubkeys, room codes with a short TTL. Relays can drop abusive events, but a public relay cannot be made to refuse spam. Server-side rate limit needs option C or D. |

## 4. Recommended v1 architecture (1v1, GitHub Pages only)

**Option A with option E as a fallback, plus the Trystero interface from the tech spec.**

- Signaling: Trystero with the Nostr strategy. Relays are in the config, at least three. Manual invite link (SDP in the URL or QR) as backup.
- Transport: WebRTC data channel, one per match. STUN: public, free. No TURN in v1 unless an owner accepts the cost of a relay account (option E, Cloudflare Realtime TURN at $0.05 per real-time GB outbound, the cheapest verified rate).
- Game logic: `abalone-core` WASM on both peers, same moves, same result. Turn-based lockstep: only the side to move sends a move. A divergence pauses the game and shows the mismatch.
- Lobby and ladder: none in v1. Share a room code. Ladder waits for option B or C.
- Cost: $0 for hosting. TURN cost only if enabled, rate verified, usage unknown.
- Why not C in v1: it breaks #36, and v1 needs 1v1 only.

Reconnect: the move log is the state. A peer that reconnects asks for the log from its last move number and checks the hash chain.

## 5. Path to MMO scale

Three steps, each reopening #36 only at step 2:

1. **v1 (now, #36 holds):** option A plus E. Rooms of two. Measure messages per game, NAT failure rate and TURN share with real players on GitHub Pages.
2. **Shared lobby and ladder (needs an owner decision, reopens #36):** Durable Objects (option C) for the lobby and one object per board, running the same WASM engine. Keeps the P2P board model. Cost per the Cloudflare rates above, with the Workers $5 minimum. Rate limits and anti-cheat live there.
3. **Full MMO (world state, many boards, spectators):** a hosted backend (option D) or a self-run server. SpacetimeDB and Colyseus are the candidates. Pricing for scale is custom or not verified, so it needs a quote before a choice.

The move from 1 to 2 keeps the engine and the move log. Only the transport and the lobby change. That is why the signaling layer sits behind a small interface.

## 6. Open items for the owners

- Decide whether to reopen #36 for step 2 (Durable Objects). Not decided in this spec.
- Decide whether TURN is acceptable in v1 and who pays.
- Get a Nakama price and a Colyseus Cloud allotment from the vendors (not verified).
- Get a Twilio TURN rate (not verified). It is only needed if we pick Twilio over Cloudflare TURN.
- Measure a real load profile before any 10k cost estimate.
- A `Decision` issue is still to be opened from this spec (not created in this PR).

## Sources

- [Trystero](https://github.com/dmotz/trystero)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Cloudflare Realtime TURN](https://developers.cloudflare.com/calls/turn/)
- [Twilio Network Traversal](https://www.twilio.com/en-us/stun-turn)
- [SpacetimeDB pricing](https://spacetimedb.com/pricing)
- [Colyseus pricing](https://colyseus.io/pricing/)
- [Heroic Labs pricing](https://heroiclabs.com/pricing/)
- Repo: [docs/specs/tech.md](docs/specs/tech.md) section 6, [SPEC.md](SPEC.md)
