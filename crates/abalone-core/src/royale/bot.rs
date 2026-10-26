//! Battle royale bots: a cheap heuristic that gives a seat its order from the round-start state
//! and a seed alone, so it never sees the other orders (rules.md section 10.4, bots).

use super::{Order, Royale};

/// The order of `seat` for the next round of `state`. The same state and seed give the same
/// order.
pub fn order(_state: &Royale, _seat: usize, _seed: u64) -> Order {
    todo!()
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::super::{resolve_round, seat_cell, start};
    use super::*;
    use crate::board::{Board, MAX_RADIUS};
    use crate::moves::{Direction, Direction::*, Move};

    type P = (i32, i32);

    /// A royale of `seats` seats on an arena of `radius` with only the listed marbles, round 1.
    fn arena(seats: usize, radius: i32, marbles: &[(P, usize)]) -> Royale {
        let mut board = Board::with_radius(radius);
        for &((q, r), seat) in marbles {
            board.set(q, r, seat_cell(seat));
        }
        Royale {
            board,
            seats,
            round: 1,
            ejections: vec![0; seats],
            touched: BTreeMap::new(),
            last_void: vec![0; seats],
            eliminated: Vec::new(),
        }
    }

    fn go(cells: &[P], dir: Direction) -> Order {
        Order::Move(Move {
            cells: cells.to_vec(),
            dir,
        })
    }

    #[test]
    fn the_same_state_and_seed_give_the_same_order() {
        let s = start(6).unwrap();
        for seed in 0..5 {
            for seat in 0..6 {
                assert_eq!(order(&s, seat, seed), order(&s, seat, seed));
            }
        }
        // The seed picks among equally good moves.
        let mut orders: Vec<Order> = (0..20).map(|seed| order(&s, 0, seed)).collect();
        orders.dedup();
        assert!(orders.len() > 1, "the seed must matter");
    }

    #[test]
    fn a_bot_ejects_when_it_can() {
        // A 3v2 off the east rim, though it moves seat 0 away from the centre.
        let s = arena(
            3,
            MAX_RADIUS,
            &[
                ((4, 0), 0),
                ((5, 0), 0),
                ((6, 0), 0),
                ((7, 0), 1),
                ((8, 0), 1),
                ((0, 5), 2),
            ],
        );
        for seed in 0..10 {
            assert_eq!(order(&s, 0, seed), go(&[(4, 0), (5, 0), (6, 0)], E));
        }
    }

    #[test]
    fn a_bot_leaves_a_cracked_cell_for_one_off_the_rim() {
        // Seat 0 sits on a cracked centre. Every ring 1 cell is as close to the centre, and the
        // voids put all of them but (-1,0) on the rim.
        let mut s = arena(3, 2, &[((0, 0), 0), ((-2, 2), 1), ((2, 0), 2)]);
        for (q, r) in [(2, -1), (0, -2), (-1, 2)] {
            s.board.void(q, r);
        }
        s.board.set_cracks(vec![((0, 0), 1)]);
        for seed in 0..10 {
            assert_eq!(order(&s, 0, seed), go(&[(0, 0)], W));
        }
    }

    #[test]
    fn a_bot_moves_toward_the_centre_and_holds_when_nothing_is_better() {
        let s = arena(3, MAX_RADIUS, &[((3, 0), 0), ((0, 0), 1), ((-5, 0), 2)]);
        for seed in 0..10 {
            assert_eq!(order(&s, 0, seed), go(&[(3, 0)], W));
            assert_eq!(order(&s, 1, seed), Order::Hold);
        }
    }

    #[test]
    fn a_seat_with_no_marble_holds() {
        let s = arena(4, MAX_RADIUS, &[((3, 0), 0), ((0, 0), 1), ((-5, 0), 2)]);
        assert_eq!(order(&s, 3, 0), Order::Hold);
    }

    #[test]
    fn twenty_games_of_6_bots_end_with_one_winner_within_150_rounds() {
        for seed in 0..20 {
            let mut s = start(6).unwrap();
            while !s.is_over() {
                assert!(s.round() <= 150, "seed {seed}");
                let orders: Vec<(usize, Order)> =
                    (0..6).map(|seat| (seat, order(&s, seat, seed))).collect();
                s = resolve_round(&s, &orders).unwrap().0;
            }
            assert_eq!(s.winners().unwrap().len(), 1, "seed {seed}");
        }
    }
}
