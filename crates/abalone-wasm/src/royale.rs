//! Battle Royale multiplayer mode bridge to WebAssembly.

use crate::convert::{cell_code, cells_of, decode, encode, CRACKED, MOVE_STRIDE};
use abalone_core::board::MAX_RADIUS;
use abalone_core::moves::legal_moves_for;
use abalone_core::royale::{
    self, Order as RoyaleOrder, Outcome as RoyaleOutcome, RoundLog, Turn as RoyaleTurn,
};
use wasm_bindgen::prelude::*;

/// Integers per battle royale order: the seat, then its move record.
const ORDER_STRIDE: usize = MOVE_STRIDE + 1;

/// Round log outcome codes, see the module docs.
const APPLIED: i32 = 0;
const FIZZLED: i32 = 1;
const HELD: i32 = 2;
const OUT: i32 = 3;

/// One turn of a round log as `[seat, outcome, ejected]`, see the module docs.
fn turn_record(turn: &RoyaleTurn) -> [i32; 3] {
    let outcome = match turn.outcome {
        RoyaleOutcome::Applied => APPLIED,
        RoyaleOutcome::Fizzled(_) => FIZZLED,
        RoyaleOutcome::Held => HELD,
        RoyaleOutcome::Out => OUT,
    };
    let ejected = turn.ejected.map_or(-1, |seat| seat as i32);
    [turn.seat as i32, outcome, ejected]
}

/// A seat's order as its move record, empty for a hold.
fn order_record(order: &RoyaleOrder) -> Vec<i32> {
    match order {
        RoyaleOrder::Move(mv) => encode(mv).to_vec(),
        RoyaleOrder::Hold => Vec::new(),
    }
}

/// A battle royale handed to JavaScript (docs/specs/tech.md section 6): the state between
/// rounds, the log of the last round and the seed of its bots.
#[wasm_bindgen]
pub struct Royale {
    state: royale::Royale,
    log: Option<RoundLog>,
    seed: u64,
}

#[wasm_bindgen]
impl Royale {
    /// A new game of 3 to 6 `seats` on the radius 8 arena, round 1. `seed` drives the bots: the
    /// same state and seed give the same bot orders.
    #[wasm_bindgen(constructor)]
    pub fn new(seats: usize, seed: u32) -> Result<Royale, String> {
        let state = royale::start(seats).map_err(|e| format!("{e:?}"))?;
        Ok(Royale {
            state,
            log: None,
            seed: u64::from(seed),
        })
    }

    /// The 217 cells of the arena, see the module docs.
    pub fn board(&self) -> Vec<u8> {
        let board = self.state.board();
        cells_of(MAX_RADIUS)
            .map(|(q, r)| {
                let cracked = board.cracks().iter().any(|&(c, _)| c == (q, r));
                cell_code(board, q, r) + if cracked { CRACKED } else { 0 }
            })
            .collect()
    }

    /// Resolves one round from the orders, see the module docs. `Err` carries the reason and
    /// leaves the game unchanged: a malformed order, an unknown or repeated seat, a game over.
    pub fn resolve(&mut self, orders: &[i32]) -> Result<(), String> {
        if !orders.len().is_multiple_of(ORDER_STRIDE) {
            return Err(format!("an order needs {ORDER_STRIDE} integers"));
        }
        let orders = orders
            .chunks(ORDER_STRIDE)
            .map(|o| {
                let seat = usize::try_from(o[0]).map_err(|_| "seat must be 0 or more")?;
                Ok((seat, RoyaleOrder::Move(decode(&o[1..])?)))
            })
            .collect::<Result<Vec<_>, String>>()?;
        let (state, log) =
            royale::resolve_round(&self.state, &orders).map_err(|e| format!("{e:?}"))?;
        self.state = state;
        self.log = Some(log);
        Ok(())
    }

    /// The last round resolved, see the module docs. Empty before the first one.
    pub fn round_log(&self) -> Vec<i32> {
        self.log.as_ref().map_or_else(Vec::new, |log| {
            let turns = log.turns.iter().flat_map(turn_record);
            std::iter::once(log.round as i32).chain(turns).collect()
        })
    }

    /// Cracked cells as `[q, r, rounds_left]` records: they go void at the end of the next round.
    pub fn cracks(&self) -> Vec<i32> {
        self.state
            .board()
            .cracks()
            .iter()
            .flat_map(|&((q, r), left)| [q, r, i32::from(left)])
            .collect()
    }

    /// Hash of the whole state, which every peer compares after a round, as 16 hex digits.
    pub fn state_hash(&self) -> String {
        format!("{:016x}", self.state.hash())
    }

    /// The bot order of `seat` for the next round, a move record, empty for a hold or a seat the
    /// game does not have.
    pub fn bot_order(&self, seat: usize) -> Vec<i32> {
        if seat >= self.state.seats() {
            return Vec::new();
        }
        order_record(&royale::bot::order(&self.state, seat, self.seed))
    }

    /// Every legal move of `seat`'s marbles on the arena, records back to back like
    /// `legal_moves`, empty for a seat the game does not have or with no marble left.
    pub fn legal_orders(&self, seat: usize) -> Vec<i32> {
        if seat >= self.state.seats() {
            return Vec::new();
        }
        legal_moves_for(self.state.board(), royale::seat_cell(seat))
            .iter()
            .flat_map(encode)
            .collect()
    }

    /// Each seat's `[place, points]` in seat order once the game is over, empty before.
    pub fn placement(&self) -> Vec<i32> {
        self.state.standings().map_or_else(Vec::new, |standings| {
            standings
                .iter()
                .flat_map(|s| [s.place as i32, s.points as i32])
                .collect()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::convert::VANISHED;

    fn count(cells: &[u8], value: u8) -> usize {
        cells.iter().filter(|&&c| c == value).count()
    }

    /// Index of `(q, r)` in the 217 arena bytes: rows from `r = -8`, `q` ascending, like
    /// `cellsFor(8)` in `client/src/board.ts`.
    fn arena_index(q: i32, r: i32) -> usize {
        (-8..=8)
            .flat_map(|r| ((-8).max(-8 - r)..=8.min(8 - r)).map(move |q| (q, r)))
            .position(|c| c == (q, r))
            .unwrap()
    }

    /// The 8-integer record of a one-marble move, with its seat in front.
    fn seat_move(seat: i32, dir: i32, q: i32, r: i32) -> Vec<i32> {
        vec![seat, 1, dir, q, r, 0, 0, 0, 0]
    }

    /// Resolves rounds where every seat holds until the game is over.
    fn hold_to_the_end(g: &mut Royale) {
        while g.placement().is_empty() {
            g.resolve(&[]).unwrap();
        }
    }

    #[test]
    fn a_royale_starts_with_a_hole_and_10_marbles_per_seat() {
        let g = Royale::new(3, 7).unwrap();
        let cells = g.board();
        assert_eq!(cells.len(), 217);
        assert_eq!(count(&cells, 1), 10);
        assert_eq!(count(&cells, 2), 10);
        assert_eq!(count(&cells, 4), 10);
        assert_eq!(count(&cells, 0), 180);
        assert_eq!(count(&cells, VANISHED), 7, "the hole in the centre");
        let cells = Royale::new(6, 7).unwrap().board();
        for code in [1, 2, 4, 5, 6, 7] {
            assert_eq!(count(&cells, code), 10, "seat code {code}");
        }
        assert!(g.cracks().is_empty());
        assert!(g.round_log().is_empty(), "no round resolved yet");
        assert!(g.placement().is_empty(), "the game is not over");
    }

    #[test]
    fn a_royale_needs_3_to_6_seats() {
        for seats in [0, 2, 7] {
            assert!(Royale::new(seats, 7).is_err(), "{seats} seats");
        }
    }

    #[test]
    fn the_arena_order_is_rows_from_r_minus_8_q_ascending() {
        assert_eq!(arena_index(0, -8), 0);
        assert_eq!(arena_index(0, 8), 216);
        let cells = Royale::new(3, 7).unwrap().board();
        // Seat 1 on the bottom wedge, seat 2 two wedges on, seat 3 four wedges on.
        assert_eq!(cells[211], 1, "(-5, 8)");
        assert_eq!(cells[30], 2, "(-3, -5)");
        assert_eq!(cells[68], 4, "(8, -3)");
        assert_eq!(cells[arena_index(-5, 8)], 1);
        assert_eq!(cells[arena_index(0, 0)], VANISHED);
    }

    #[test]
    fn the_breach_marks_the_cracked_ring_then_voids_it() {
        let mut g = Royale::new(3, 7).unwrap();
        for _ in 0..12 {
            g.resolve(&[]).unwrap();
        }
        let cells = g.board();
        assert_eq!(
            cells[arena_index(-5, 8)],
            1 | CRACKED,
            "a cracked cell keeps its marble"
        );
        assert_eq!(cells[arena_index(-4, 8)], 1 | CRACKED);
        assert_eq!(cells[arena_index(0, 8)], CRACKED, "a cracked empty cell");
        assert_eq!(cells[arena_index(0, 0)], VANISHED);
        let cracks = g.cracks();
        assert_eq!(
            cracks.len(),
            48 * 3,
            "the whole rim, as [q, r, rounds left]"
        );
        assert!(cracks.chunks(3).all(|c| c[2] == 1));
        assert!(cracks.chunks(3).any(|c| c[..2] == [-5, 8]));
        g.resolve(&[]).unwrap();
        let cells = g.board();
        assert_eq!(cells.len(), 217, "a void cell keeps its slot");
        assert_eq!(count(&cells, VANISHED), 48 + 7);
        assert_eq!(cells[arena_index(-5, 8)], VANISHED);
        assert_eq!(count(&cells, 1), 7, "the 3 rim marbles went with the rim");
        assert!(g.cracks().is_empty());
    }

    #[test]
    fn resolve_plays_the_orders_and_logs_each_turn_in_initiative_order() {
        let mut g = Royale::new(3, 7).unwrap();
        let start = g.state_hash();
        let order = g.bot_order(0);
        assert_eq!(order.len(), MOVE_STRIDE);
        // Seat 2 orders a move of a seat 1 marble: it fizzles.
        let mut orders = vec![0];
        orders.extend(&order);
        orders.extend(seat_move(1, 4, -2, 6));
        g.resolve(&orders).unwrap();
        assert_eq!(
            g.round_log(),
            vec![1, 0, APPLIED, -1, 1, FIZZLED, -1, 2, HELD, -1]
        );
        assert_ne!(g.state_hash(), start);
        // Round 2 starts at seat 2.
        g.resolve(&[]).unwrap();
        assert_eq!(
            g.round_log(),
            vec![2, 1, HELD, -1, 2, HELD, -1, 0, HELD, -1]
        );
    }

    #[test]
    fn resolve_refuses_bad_orders_and_leaves_the_game_unchanged() {
        let mut g = Royale::new(3, 7).unwrap();
        let start = g.state_hash();
        let ok = seat_move(0, 4, -2, 6);
        let mut twice = ok.clone();
        twice.extend(&ok);
        for orders in [
            vec![0, 1, 4],                    // not records of 9 integers
            seat_move(-1, 4, -2, 6),          // no such seat
            seat_move(3, 4, -2, 6),           // a 3-seat game has seats 0 to 2
            twice,                            // two orders for seat 0
            vec![0, 0, 4, -2, 6, 0, 0, 0, 0], // no marble
        ] {
            assert!(g.resolve(&orders).is_err(), "{orders:?}");
        }
        assert_eq!(g.state_hash(), start);
        assert!(g.round_log().is_empty());
    }

    #[test]
    fn turn_records_code_every_outcome_and_the_ejected_seat() {
        use abalone_core::moves::MoveError;
        let turn = |outcome, ejected| RoyaleTurn {
            seat: 2,
            outcome,
            ejected,
        };
        assert_eq!(
            turn_record(&turn(RoyaleOutcome::Applied, Some(1))),
            [2, APPLIED, 1]
        );
        assert_eq!(
            turn_record(&turn(RoyaleOutcome::Fizzled(MoveError::Blocked), None)),
            [2, FIZZLED, -1]
        );
        assert_eq!(turn_record(&turn(RoyaleOutcome::Held, None)), [2, HELD, -1]);
        assert_eq!(turn_record(&turn(RoyaleOutcome::Out, None)), [2, OUT, -1]);
    }

    #[test]
    fn a_bot_order_is_a_legal_record_the_same_for_the_same_seed() {
        let g = Royale::new(4, 7).unwrap();
        for seat in 0..4 {
            let order = g.bot_order(seat);
            assert_eq!(order, Royale::new(4, 7).unwrap().bot_order(seat));
            let mut orders = vec![seat as i32];
            orders.extend(&order);
            let mut played = Royale::new(4, 7).unwrap();
            played.resolve(&orders).unwrap();
            // Round 1 plays the seats in seat order.
            let turn = 1 + 3 * seat;
            assert_eq!(
                played.round_log()[turn..turn + 3],
                [seat as i32, APPLIED, -1]
            );
        }
        assert!(g.bot_order(4).is_empty(), "a 4-seat game has seats 0 to 3");
        assert!(
            order_record(&RoyaleOrder::Hold).is_empty(),
            "a hold is empty"
        );
    }

    #[test]
    fn legal_orders_are_the_move_records_of_one_seat() {
        let g = Royale::new(3, 7).unwrap();
        let orders = g.legal_orders(0);
        assert!(!orders.is_empty());
        assert_eq!(orders.len() % MOVE_STRIDE, 0);
        // Each one plays when seat 0 leads round 1.
        for record in orders.chunks(MOVE_STRIDE) {
            let mut played = Royale::new(3, 7).unwrap();
            let mut order = vec![0];
            order.extend(record);
            played.resolve(&order).unwrap();
            assert_eq!(played.round_log()[1..4], [0, APPLIED, -1], "{record:?}");
        }
        assert!(
            orders
                .chunks(MOVE_STRIDE)
                .any(|o| o == [1, 4, -2, 6, 0, 0, 0, 0]),
            "(-2, 6) NW"
        );
        assert_ne!(g.legal_orders(1), orders, "seat 1 moves its own marbles");
        assert!(
            g.legal_orders(3).is_empty(),
            "a 3-seat game has seats 0 to 2"
        );
    }

    #[test]
    fn the_state_hash_is_16_hex_digits_that_tell_states_apart() {
        let g = Royale::new(3, 7).unwrap();
        let hash = g.state_hash();
        assert_eq!(hash.len(), 16);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(hash, Royale::new(3, 9).unwrap().state_hash());
        assert_ne!(hash, Royale::new(4, 7).unwrap().state_hash());
    }

    #[test]
    fn placement_gives_each_seat_its_place_and_points_once_over() {
        let mut g = Royale::new(3, 7).unwrap();
        hold_to_the_end(&mut g);
        // Nobody moved: the void of ring 6 takes the last 3 marbles of every seat at once. Seat 0
        // leads round 25 and wins the tie, the others share second (#641).
        assert_eq!(g.round_log()[0], 25);
        assert_eq!(g.placement(), vec![1, 10, 2, 6, 2, 6]);
        assert!(g.resolve(&[]).is_err(), "the game is over");
    }
}
