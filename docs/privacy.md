# Privacy notice (online play)

Best effort by the project's owners. Not reviewed by a lawyer.

**Who is responsible.** The owners of the GitHub project [TidyMaze/ab-alone](https://github.com/TidyMaze/ab-alone). There is no company and no postal address. Contact: open an issue on that repository (do not put personal data in it).

**Solo play** stays on your device. Nothing is sent. Saves live in your browser (localStorage). We run no game server, no account system and no analytics.

**Online play** (1v1, ranked, Battle royale, and the public Open world, the one world with a fixed seed where you land by default) connects you directly to other players. It starts only after you accept the notice in the game.

| What | Who sees it | Why |
|---|---|---|
| Your IP address | The players you connect to; the STUN servers (Google `stun*.l.google.com`, Cloudflare `stun.cloudflare.com`); the Nostr relays you reach | WebRTC needs it to connect you |
| A random public key, your public name (up to 16 characters, optional in the Open world), your moves, and in the public Open world your position (a cell, at most 4 times a second) | The players in your room; for a room beacon, the relays | Play and signed move logs |
| In the public Open world, a random signing key (its private part stays in your browser's localStorage, `ab-alone.world-key`, and is never sent) and one signed event per obstacle you break: the cell and your public key | The players in the room, who may keep it and pass it to players who join later | Showing others the obstacles you broke |
| Room topics and room beacons (ephemeral Nostr events) | The Nostr relays in [docs/specs/multiplayer.md](specs/multiplayer.md), and anyone reading them | Finding other players |

**Basis.** Your consent (GDPR art. 6(1)(a)), given by the opt-in. You can withdraw it by leaving online play.

**Retention.** We store nothing. Relays are asked for ephemeral events (kinds 20000-29999), which the protocol says relays are not expected to store; a relay may still log. Other players keep what they received (moves, names, results) as long as they like. Relay and STUN operators have their own policies, which we do not control.

**Leave.** In the public Open world use Hide (it leaves the room at once) or Esc, in a game use Leave, or close the tab: you stop sending, and peers drop you after about 10 s. Clearing the site data deletes your key and saves, and the next visit gets a new key.

**What cannot be recalled.** Moves and signed events (a broken obstacle among them) that other players already received cannot be deleted or taken back by you or by us. This limits the right to erasure (GDPR art. 17). Pick a name that does not identify you.

**Age.** Online play is for people aged 16 or more. Solo play has no age limit. The game asks you to confirm, and does not verify.

**Your rights.** Access, rectification, objection and complaint to your data protection authority apply. As we hold no data about you, most requests have nothing to act on; ask through an issue.
