# Co-op boss fights online (#175)

Two players fight one boss together in an online room. This file holds the v1 rules, decided by the
lead agent on delegation by @Varadiell (#525). The online room, its signed log, seats, spectators,
catch-up and rematch are those of [tech.md section 6](tech.md#6-peer-to-peer-multiplayer-decision-36-comments-on-13);
the boss encounter is that of [tech.md section 7](tech.md#7-ai-and-bosses). Only what differs is
written here.

## 1. What v1 is

- One boss, the same fight as solo: the same boss definition, phases, tells and hooks, and the same
  14 marbles on each side. No extra marbles and no harder boss for a duo in v1: the balance of
  [boss-balance.md](boss-balance.md) is measured for one player and is not redone here.
- Two player seats plus spectators, the seats of today's room. A room is either a versus room or a
  co-op room, from its invite link (section 4); it never changes kind.
- Solo boss mode is unchanged.

## 2. Turns: strict rotation on one shared army

The two players share the Black army; the boss plays White. Black moves first, as in solo. The plies
go **player A, boss, player B, boss, player A...**:

- Human ply `k` (0-based, counting human moves only) belongs to seat `(k % 2) + 1`. Seat 1 is the
  room creator, so the creator plays the first move.
- A seat may move only on its own human ply. A move from the other seat, or from a spectator, is
  refused as `not-their-turn`, like a move out of turn in versus.
- Either player may move any Black marble. Nobody owns a group of marbles.
- The HUD says **Your turn** or **Partner's turn** on the human plies, and the boss turn as in solo.
- The rotation lives in `client/src/coop.ts`: the judge of a co-op room tells the session which seat
  is to move (`Judge.mover`, #527).

## 3. The boss move never goes on the wire

Every peer, spectators included, builds the same `Encounter(boss, seed)` and computes every boss
reply itself. Bosses are node-limited and seeded (tech.md section 7), so every engine gets the same
reply. The signed log holds only the human moves:

1. A seated peer signs and sends its human move as in versus (`{game, seq, prev, move, pub, sig}`).
2. Every peer checks it (signature, hash chain, seat, turn, legality), applies it, then applies the
   boss reply at once, before it handles the next message. So the partner's next move can never
   arrive before the boss reply on any engine (#529).
3. Tells, phase changes, notches, ejections and the result come from that engine, so every page
   shows the same ones.

Catch-up and reconnection replay the human records the same way, each one followed by its boss
reply. A peer whose engine disagrees (a bug, a link edited by hand to another boss or seed) refuses
the next move it cannot replay and shows the existing refusal pause. v1 adds no other check.

Peers on different engine versions would compute different boss replies, so they refuse to play
(tech.md section 9, #526).

## 4. Invite link

The creator picks the boss and a random unsigned 32-bit seed when it opens the room. The link
carries them next to the room id, in this order:

```
<page>#room=<room>&boss=<boss id>&seed=<seed>
```

- `room` and `boss` are url-safe (`[A-Za-z0-9_-]`); `seed` is a decimal number from 0 to 4294967295,
  without leading zeros.
- A versus invite stays `#room=<room>`, unchanged. A link with any other shape is not a co-op
  invite, and an unknown boss id starts nothing.
- Format and parse live in `client/src/invite.ts` (#528).

## 5. Retry

When the fight is over, the seated players may ask for a Retry. It reuses the rematch messages of
tech.md section 6, with two differences (#531):

- The new game starts only once **both** seated players asked, like a rematch.
- **No colour swap**: the players stay Black against the boss, seat 1 still moves first, and the
  fight restarts with the same boss and the same seed.

The room keeps one attempt counter, shared by both players. Spectators follow the new game.

## 6. Later, not in v1

- Three or four player seats.
- Balance for a duo (extra marbles, a harder boss), once a duo has been measured.
- An agent player in a seat (#163).
- Daily challenge in co-op.

## 7. Tasks

#526 engine version in `Hello`, #527 whose turn it is, #528 invite link, #529 the encounter as the
online judge, #530 Fight together in the mode menu, #531 shared Retry.
