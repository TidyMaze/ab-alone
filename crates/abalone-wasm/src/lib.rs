//! Thin wasm-bindgen bridge over `abalone-core`. No game logic lives here: it only converts
//! between core types and flat integer arrays (decision #74, local transport, no network).
//!
//! Encodings, all stable and documented:
//! - Board: 61 bytes, row by row from `r = -4` to `r = 4`, inside a row by `q` ascending.
//!   Value `0` empty, `1` Black, `2` White, `3` vanished (a cell a boss removed, The Hull),
//!   `4` to `7` a marble of battle royale seats 3 to 6, `8` a core and `9` the Overseer (The
//!   Overseer's fight).
//!   Index 0 is `(q=0, r=-4)`, index 60 is `(q=0, r=4)`. The radius 5 board of The Ballast Mind
//!   has 91: the same 61, then its outer ring, row by row from `r = -5`, `q` ascending.
//! - Cracks (The Hull): records of 3 integers `[q, r, plies_left]`, back to back.
//! - Eggs (The Alien): records of 3 integers `[q, r, player_turns_left]`, back to back.
//! - Trains (The Rail Yard): records of 6 integers `[line, player_turns_left, entry_q, entry_r,
//!   exit_q, exit_r]`, back to back: the train runs its line from the entry cell to the exit cell
//!   (docs/specs/game-design.md section 7.8 numbers the lines).
//! - Pulsar (The Pulsar): `[pulsar, player_turns_left, force]`, the pulsar of the next pulse as
//!   the direction code it pushes in (it stands off the corner the other way), the player turns
//!   before it fires and its force, `0` for infinite (docs/specs/game-design.md section 7.10).
//! - Last pulse (The Pulsar): the pulsar, then the 61 board codes just before the pulse, then the
//!   cells of the marbles it moved, from where they stood, as `[q, r]` pairs.
//! - Cell list (The Chaplain, the cells The Magnetizer just polarized): pairs `[q, r]`, back to back.
//! - Incinerators (The Overseer): a cell list. Removed (its burns): records of 3 integers
//!   `[q, r, code]`, the board code of each marble the last ply's hook removed, back to back.
//!   Turns left (its neurotoxin): the player turns before the boss wins, `-1` with no clock.
//! - Polarities (The Magnetizer): one integer per cell, in the board order: `0` none, `1` +, `-1` −.
//! - Announce (The Magnetizer): `[q, r, sign]` of the marble that takes `sign` at the start of the
//!   next assignment turn, empty when none.
//! - Repulsions (The Magnetizer): records of 126 integers, the pair `[q_a, r_a, q_b, r_b]` (`b`
//!   moves away from `a` and `a` away from `b`), then the 61 board codes and the 61 polarities just
//!   before that repulsion, in the order they happened during the last ply.
//! - Armies (The Choir): records of 3 integers `[q, r, army]`, back to back. Army `0` Alto,
//!   `1` Tenor, `2` Bass, the order of the cycle. On the Choir's radius 3 board the outer ring
//!   is `3`, like a vanished cell.
//! - Side and winner: `1` Black, `2` White.
//! - Status: `0` running, `1` Black won, `2` White won, `3` draw.
//! - Draw reason: `0` none, `1` threefold repetition, `2` 100 plies without ejection.
//! - Result of an encounter: `0` playing, `1` won, `2` lost (a draw is a loss).
//! - Move: 8 integers `[n, dir, q0, r0, q1, r1, q2, r2]`, `n` in 1..=3 marbles, unused
//!   coordinates are `0`. `dir`: `0` E, `1` W, `2` NE, `3` SW, `4` NW, `5` SE.
//!   `legal_moves` returns the records back to back.
//! - Score (the evaluation bar): the search score for the side to move, in centi-marbles (one
//!   marble is 100). A won game scores 1 000 000 minus the plies to the win, a lost one the
//!   opposite, a draw 0: beyond +/-500 000 the game is decided.
//! - Battle royale (`Royale`). A seat is a number from `0` to `seats - 1`.
//!   - Arena: 217 bytes, row by row from `r = -8` to `r = 8`, inside a row by `q` ascending, the
//!     order of `cellsFor(8)` in `client/src/board.ts`. Index 0 is `(q=0, r=-8)`, index 216 is
//!     `(q=0, r=8)`. The board codes above: `0` empty, `1` and `2` seats 0 and 1, `4` to `7`
//!     seats 2 to 5, `3` void. A cracked cell, which goes void at the end of the next round, adds
//!     `8` to its code: `8` cracked and empty, `9` a cracked cell with a seat 0 marble.
//!   - Legal orders (`legal_orders(seat)`): the seat's move records, back to back.
//!   - Orders: records of 9 integers `[seat, n, dir, q0, r0, q1, r1, q2, r2]`, a seat then its
//!     move record, back to back. A seat with no record holds, like the empty order of the client.
//!   - Round log: the round number, then one record of 3 integers `[seat, outcome, ejected]` per
//!     turn in initiative order. Outcome `0` applied, `1` fizzled (illegal at its turn, a pass),
//!     `2` held, `3` out (no marble left at its turn). `ejected` is the seat whose marble the
//!     move ejected, `-1` for none.
//!   - Cracks: records of 3 integers `[q, r, rounds_left]`, back to back.
//!   - Placement: one record of 2 integers `[place, points]` per seat in seat order, places from
//!     `1`, empty while the game runs.
//!   - State hash: 16 lowercase hex digits, the same on every peer for the same state.

pub mod convert;
pub mod encounter;
pub mod game;
pub mod royale;

pub use convert::{draw_reason_code, result_code, status_code, MOVE_STRIDE};
pub use encounter::{boss_goal, boss_ids, boss_name, engine_version, Encounter};
pub use game::Engine;
pub use royale::Royale;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn re_exports_and_submodules_are_accessible() {
        assert_eq!(MOVE_STRIDE, 8);
        assert_eq!(convert::MOVE_STRIDE, 8);
        assert_eq!(engine_version(), 3);
        assert_eq!(encounter::engine_version(), 3);
        let engine = Engine::new();
        assert_eq!(engine.to_move(), 1);
        let encounter = Encounter::new("echo", 1).unwrap();
        assert_eq!(encounter.name(), "The Echo");
        let royale = Royale::new(3, 1).unwrap();
        assert_eq!(royale.board().len(), 217);
    }
}
