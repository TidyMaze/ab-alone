# Privacy notice (online play)

Best effort by the project's owners. Not reviewed by a lawyer.

**Who is responsible.** The owners of the GitHub project [TidyMaze/ab-alone](https://github.com/TidyMaze/ab-alone). There is no company and no postal address. Contact: open an issue on that repository (do not put personal data in it).

**Solo play** stays on your device. Nothing is sent. Saves live in your browser (localStorage). We run no game server, no account system and no analytics.

**Online play** (1v1, ranked, Battle royale, and the public Open world, the one world with a fixed seed where you land by default) connects you directly to other players. It starts only after you accept the notice in the game.

| What | Who sees it | Why |
|---|---|---|
| Your IP address | The players you connect to; the STUN servers (Google `stun*.l.google.com`, Cloudflare `stun.cloudflare.com`); the Nostr relays you reach | WebRTC needs it to connect you |
| A random public key, your public name (up to 16 characters, optional in the Open world), your moves, and in the public Open world your position and the cells of your troop (at most 4 times a second, as offsets from your hero) | The players in your room; for a room beacon, the relays | Play and signed move logs |
| In the public Open world, a random signing key (its private part stays in your browser's localStorage, `ab-alone.world-key`, and is never sent) and one signed event per obstacle you break: the cell and your public key | The players in the room, who may keep it and pass it to players who join later. Your browser also keeps the events it holds, yours and other players', in localStorage (`ab-alone.world-events`, at most 2000, about 384 KB) so the world is back after a reload | Showing others the obstacles you broke |
| Room topics and room beacons (ephemeral Nostr events) | The Nostr relays in [docs/specs/multiplayer.md](specs/multiplayer.md), and anyone reading them | Finding other players |

**Basis.** Your consent (GDPR art. 6(1)(a)), given by the opt-in. You can withdraw it by leaving online play.

**Retention.** We store nothing on a server, except for the ranked board below once it ships. Your browser keeps the Open world's signed events (cells and public keys) until you clear the site data. Relays are asked for ephemeral events (kinds 20000-29999), which the protocol says relays are not expected to store; a relay may still log. Other players keep what they received (moves, names, results) as long as they like. Relay and STUN operators have their own policies, which we do not control.

**Shared ranked board (opt-in).** This section applies only once publishing ships. Today the feature is off for players: nothing is asked, no key is made and nothing is sent. It describes what publishing will do. Ranked play stays local unless you tick a separate, unticked box at your first ranked entry.

| What | Who sees it | Why |
|---|---|---|
| A random board key (its private part stays in your browser, `ab-alone.board-key`, and is never sent), the name you pick (16 characters at most, pick one that does not identify you), your signed ranked results and a rating derived from them | Anyone, on the public Nostr relays `wss://nos.lol`, `wss://relay.piazza.today` and `wss://relay.bitmacro.cloud`, and anyone who reads them | A shared ranked board that anyone can check |

- **Basis.** Your consent (GDPR art. 6(1)(a)), a separate one from online play, versioned in your browser (`ab-alone.board-consent`). Declining keeps ranked play on your device, as today.
- **Retention.** The relays are run by third parties. We promise no retention and no deletion: a relay keeps or drops events as it likes, and others may copy them.
- **Leave, and a new key.** "Leave the board" builds a signed `retire` event for your key and clears your consent; the board ignores a retired key. "New key" makes a fresh random key. Both are as easy as joining.
- **Limit on erasure.** Events already on a relay or copied cannot be deleted, by you or by us. A `retire` event, and NIP-09 deletion requests, are only requests (GDPR art. 17 is limited). Your key is personal data even though it is random.
- **Age.** 16 or more. The game asks you to confirm, and does not verify.
- **Not reviewed by a lawyer.** This section is a best effort, like the rest of the notice.

**Leave.** In the public Open world use Hide (it leaves the room at once) or Esc, in a game use Leave, or close the tab: you stop sending, and peers drop you after about 10 s. Clearing the site data deletes your key and saves, and the next visit gets a new key.

**What cannot be recalled.** Moves and signed events (a broken obstacle among them) that other players already received cannot be deleted or taken back by you or by us. This limits the right to erasure (GDPR art. 17). Pick a name that does not identify you.

**Age.** Online play is for people aged 16 or more. Solo play has no age limit. The game asks you to confirm, and does not verify.

**Your rights.** Access, rectification, objection and complaint to your data protection authority apply. As we hold no data about you, most requests have nothing to act on; ask through an issue.
