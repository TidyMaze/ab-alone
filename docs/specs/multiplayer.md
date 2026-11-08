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
| **C. P2P matches + Cloudflare Durable Objects** (one DO per board, `edgefall-core` WASM via workers-rs) | **No, reopens #36** (server-side code) | Free tier covers this load on paper, but see the cost note below. | One DO per board. Cost scales with requests and GB-seconds. | Server relays the moves, so NAT failure disappears for the match | Authoritative per board. Lobby can live in one DO. | Server validates every move. Cheating stops at the server. | Medium. We run Workers code and a deploy pipeline. |
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
- Game logic: `edgefall-core` WASM on both peers, same moves, same result. Turn-based lockstep: only the side to move sends a move. A divergence pauses the game and shows the mismatch.
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

## 7. Relays, privacy and age (#1305, best effort, not reviewed by a lawyer)

Owner decision, 2026-11-01: the game does not use Trystero's 29 default relays. Read on 2026-11-01 (one NIP-11 GET each, comment on #1305): none publishes a `posting_policy` or a game-use term, none declares `payment_required` or `auth_required` true. "Allowed" is never stated; "not forbidden in what was readable".

- **Shortlist** (`relayUrls` of `joinRoom`): `wss://relay.piazza.today`, `wss://nostr.red5d.dev`, `wss://relay.bitmacro.cloud`; optional `wss://nostr.rblb.it`. Re-check NIP-11 before shipping. `wss://nos.lol` dropped from the shortlist too (#1287, below).
- **Board relay terms (#1287, read 2026-11-05, owner's legal decision on #1287: the board list is the two relays below).** One NIP-11 GET each (`Accept: application/nostr+json`), then the terms page the NIP-11 names, if any:
  - `wss://nos.lol`: DROPPED from the board list and the online shortlist (#1287). NIP-11 names `terms_of_service` `https://wikifreedia.xyz/nos.lol/`; that page is a directory listing with no terms text, and `https://nos.lol/` names the same link with no terms text. Its description says "Generally accepts notes, except spammy ones", which is not a term of use; no term found, so it is dropped.
  - `wss://relay.piazza.today`: KEPT. NIP-11 (name "Ditto Relay"): no terms page declared in NIP-11; homepage not read. No auth or payment required; no restriction stated. Public notes of this kind: not forbidden in what was readable, not stated as allowed.
  - `wss://relay.bitmacro.cloud`: KEPT. NIP-11 (name "BitMacro Cloud Relay", "Public relay ... Free and open to all"): no terms page declared in NIP-11; homepage not read. No restriction stated. Public notes of this kind: not forbidden in what was readable, not stated as allowed.
  - Not done: no event was sent to any relay; the NIP-11 documents were read over HTTP only. Not a lawyer's review.
- **Shared ranked board, read side (#1287, on by default, after its opt-in):** the board opens a socket to `wss://relay.piazza.today` and `wss://relay.bitmacro.cloud` and sends one `REQ` (`kinds [1]`, `#t ["ab-alone-ranked"]`, the last 7 days, 200 at most), closes at `EOSE` or after 8 s. Nothing is written without `?board=publish`: plain `?board` only reads. An event `content` is JSON `{ v: 1, game, black: { pub, name }, white: { pub, name }, moves, status, ejected: [black, white], ts }`, `moves` the move records of the game. The Rust `replay_score` replays `moves` on a standard game; a result counts only if its `status` and `ejected` equal the replayed ones, else it is not shown. Ratings are derived, never read: the valid results by `ts`, from `DEFAULT_RATING`, with `update1v1Elo`. Both seats sign (the #1317 rule): `content` also has `sigs: { black, white }`, each seat's Ed25519 signature (base64url) of `["ab-alone.result.v1", v, game, black.pub, black.name, white.pub, white.name, sha256(moves), status, ejected, ts]`, checked with the keys named in the content (`bothSigned`), before the replay; a result missing either signature, or with one that does not verify, is not shown and does not use up its game id. The Nostr event signature is not checked: it says nothing about who played. A seat that refuses to sign gives no result: the game is not rated, and there is no forfeit rule, because a one-sided claim of a refusal would let a winner invent one. **Creating `sigs` (#1287, `rankedseal.ts`, after the join):** the opponent's board key is agreed by an `intro` each seat sends only if it joined the board: `{ kind: 'seal', step: 'intro', game, board, name, pub, sig }`, signed by the seat's game key (its identity in the room, `pub` must be the other seat's). A seat that did not join sends none, so no result is signed without both opt-ins. When the pair of match reports agree, Black signs the result with its board key and sends `{ step: 'result', game, ts, sig }` (it chooses `ts`); White accepts `ts` within 600 s of its clock, rebuilds the result from ITS log and signs it only if Black's signature verifies on that, so a differing log, score or name gives no result; Black checks White's signature. Both then hold the same `sigs`. **Publishing (`publish.ts`):** when a seat holds the result with both `sigs`, it sends one kind 1 event tagged `ab-alone-ranked`, `content` the result, to the two relays (`['EVENT', ev]`, one try per relay, 8 s, no retry after a notice). The event is signed (BIP-340, `@noble/secp256k1` 3.2.0, already in the lockfile through Trystero) with a throwaway key made for that event, so it names nobody. Both seats publish; the reader keeps one per game id. A game that settles after White's 600 s check is refused and not rated. Still open: a seat can drop its own loss (no forfeit rule), spectators of the room see the seals, win-trading and fresh keys. The replay budget is 20000 plies per read, not measured on a calm machine.
- **Ranked board rules (#1287):** an unsigned game is not rated and a refusal is not a forfeit (known, accepted). A key is banned by a PR to `client/src/bannedkeys.json` (`{ pub, reason, date }` per entry); the reader ignores every result with a banned key in either seat. Ban only on two independent signals. Against throwaway keys: one unordered pair of keys counts at most 3 results per UTC day (the first ones), and a key is ranked only after counted results against 5 distinct opponent keys. A key retires with the `RetireEvent` that Leave and New key store (`shareboard.ts`): `{ v: 1, kind: 'retire', pub, at, sig }`, `sig` the key's signature of `ab-alone.retire.v1\n<pub>\n<at>`. Behind `?board=publish` it is sent as a kind 1 event like a result; the reader hides that key's results dated after `at` (the earliest valid one), earlier ones stay.
- **Signed ban list (#1287):** `client/src/bannedkeys.json` is accepted only with its owner signature in `client/src/bannedkeys.sig.json` (`{ version, pubkey, sig }`): a BIP-340 Schnorr signature (`@noble/secp256k1`, as the Nostr events) of the SHA-256 of the canonical JSON (keys sorted, no spaces) of `{ version, list }`. A signed `version` below `MIN_BAN_VERSION` (rollback) is rejected. Without WebCrypto (plain http) the list is not verified: no ban, one warning. The owner's public key is the constant `OWNER_PUB` in `client/src/banverify.ts`. A missing or invalid signature gives an empty ban list and one console warning. The owner re-signs after each PR to the list with `cd client && bun ../scripts/sign-banlist.ts` on his Mac; the private key sits in the macOS keychain (service `ab-alone-banlist-signing`, account `owner`) and is never in the repo.
- **Ranked identity cost (decision, ranked F3; no secret, no server, the reader derives it):** a rating change is scaled by min(1, the games the OPPONENT had counted before / `RAMP_GAMES` = 10), so beating a fresh key gains 0; a key shows only after `MIN_GAMES` = 10 counted games on top of the 5 distinct opponents. Cost stated: ring farming is slowed, not closed (a ring of 6 keys still reaches the display rule at the pair cap of 3 games per pair per day, 15 games per key); next steps: weight by key age, per-day limits per key. **F6, leaving a lost game, not fixable without a server (analysis, no code):** a forfeit needs a stall proof anyone can check, and a serverless one cannot exist: a winner-signed ping proves only that the winner signed it, not that the leaver received it, so 'unanswered' is unprovable; the winner holds every move the leaver signed and can present an old one as the last; a timestamp is attested only by its own signer, so nobody proves T minutes passed. Each gap lets a winner frame an honest player mid-game (an earlier winner-only claim was dropped for that). It needs a trusted witness of order and time (a server or notary). Accepted: a loser can drop a loss; a played-out both-signed result still counts.
- **Avoid:** the default 29, `relay.kaleidoswap.com` (restricted writes), dev and test relays, relays that were down.
- **Rules:** the Open world and room beacons use ephemeral kinds (NIP-01: 20000-29999) only; positions and live play on WebRTC, never on a relay; one beacon per room; stop and back off on `rate-limited:`. The one exception is the shared ranked board (#1287): a result both seats signed is a stored kind 1 event holding its move log (a few KB), written only behind `?board=publish` and after both opt-ins. Plain play signs the result in the browser and sends nothing; plain board reads never write. Whether kind 1 JSON results fit the terms of the two board relays is not settled: the NIP-11 reading of 2026-11-05 (section 7, board relay terms) names no posting term either way; legal-counsel decides, and the first real publish is the owner's to approve.
- **Persistence of the Open world (#1305):** each browser keeps the signed events it holds (breaks, beaten enemies, lairs) in its own localStorage, `ab-alone.world-events`, record `{ v: 1, events }`, at most 2000 (about 384 KB measured, with 2000 real signatures). On entering the public world each saved signature is verified again, events of another seed and of a broken record are dropped, the rest is applied and re-served to joiners through the sync (newest 200). On a quota error the oldest saved events go first; with storage refused the world lives in memory. Nothing is stored for a private seed or on a relay. No durability without one holder online.
- **STUN:** Trystero defaults (Google `stun`, `stun1`, `stun2` on 19302, Cloudflare 3478). No fair-use term found. Use no TURN.
- **Controller:** the project's owners, contact by GitHub issue. **Age:** online play from 16 (GDPR art. 8 default, the strictest member-state value; no verification). **Notice:** [docs/privacy.md](../privacy.md).
- **In-game opt-in**, shown once before any connection (ships with #1305's first slice; a Decline keeps solo play):

> Online play connects you directly to other players. They, the STUN servers (Google, Cloudflare) and the Nostr relays can see your IP address. Your public name, a random key and your moves or position are visible to the players in your room. Anything other players already received cannot be taken back. I am 16 or older. [Accept] [Stay solo] [Privacy notice]

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
