//! Battle royale bots: a cheap heuristic that gives a seat its order from the round-start state
//! and a seed alone, so it never sees the other orders (rules.md section 10.4, bots).

use super::{seat_cell, Order, Royale};
use crate::board::{Board, Cell};
use crate::moves::{apply_for, legal_moves_for};

/// Score of a move that ejects a marble: above anything the place of the marbles can give.
const EJECT: i64 = 10_000;
/// Cost of an own marble on a cracked cell, which goes void at the end of the round, and gain
/// of an opponent marble there.
const CRACKED: i64 = 100;
/// Cost of an own marble on an edge cell, next to the rim or the hole, where a push ejects it,
/// and gain of an opponent marble there.
const EDGE: i64 = 10;

/// The six neighbours of a cell, as axial vectors.
const NEIGHBOURS: [(i32, i32); 6] = [(1, 0), (-1, 0), (1, -1), (-1, 1), (0, -1), (0, 1)];

/// The order of `seat` for the next round of `state`, from that state and `seed` alone: the
/// same state and seed give the same order. It ejects a marble if it can, into the hole or off
/// the rim, else it plays the move that best keeps its marbles off cracked and edge cells and
/// pushes opponent marbles onto them, and holds when no move does better than staying put. The
/// seed breaks ties.
pub fn order(state: &Royale, seat: usize, seed: u64) -> Order {
    let own = seat_cell(seat);
    let board = state.board();
    let spots = spots(board);
    let stay = place(board, own, &spots);
    let key = mix(mix(mix(seed) ^ u64::from(state.round())) ^ seat as u64);
    legal_moves_for(board, own)
        .into_iter()
        .enumerate()
        .filter_map(|(i, mv)| {
            apply_for(board, own, &mv).ok().map(|(after, ejects)| {
                let score = place(&after, own, &spots) + if ejects { EJECT } else { 0 };
                (score, mix(key ^ i as u64), mv)
            })
        })
        .filter(|&(score, _, _)| score > stay)
        .max_by_key(|&(score, noise, _)| (score, noise))
        .map_or(Order::Hold, |(_, _, mv)| Order::Move(mv))
}

/// Every cell of `board` with what a marble there is worth: to its owner (a cost on a cracked
/// or edge cell), and to an opponent. A move changes no cell, so this holds for every move.
fn spots(board: &Board) -> Vec<((i32, i32), i64, i64)> {
    let radius = board.radius();
    (-radius..=radius)
        .flat_map(|q| (-radius..=radius).map(move |r| (q, r)))
        .filter(|&(q, r)| board.get(q, r).is_some())
        .map(|(q, r)| {
            let cracked = i64::from(board.cracks().iter().any(|&(c, _)| c == (q, r)));
            let edge = i64::from(
                NEIGHBOURS
                    .iter()
                    .any(|&(dq, dr)| board.get(q + dq, r + dr).is_none()),
            );
            let mine = -CRACKED * cracked - EDGE * edge;
            let theirs = CRACKED * cracked + EDGE * edge;
            ((q, r), mine, theirs)
        })
        .collect()
}

/// How well the marbles of `own` are placed on `board` against the others: the higher, the
/// better.
fn place(board: &Board, own: Cell, spots: &[((i32, i32), i64, i64)]) -> i64 {
    spots
        .iter()
        .map(|&((q, r), mine, theirs)| match board.get(q, r) {
            Some(Cell::Empty) => 0,
            Some(cell) if cell == own => mine,
            _ => theirs,
        })
        .sum()
}

/// SplitMix64 step: a cheap, well spread hash of `x`, the same on every peer.
fn mix(x: u64) -> u64 {
    let mut z = x.wrapping_add(0x9e37_79b9_7f4a_7c15);
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    z ^ (z >> 31)
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
        // A 3v2 off the east rim.
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

    /// Voids the hole of the arena: the centre cell and its 6 neighbours.
    fn hole(s: &mut Royale) {
        s.board.void(0, 0);
        for (dq, dr) in NEIGHBOURS {
            s.board.void(dq, dr);
        }
    }

    #[test]
    fn a_bot_steps_off_the_edge_of_the_hole_and_holds_when_nothing_is_better() {
        let mut s = arena(3, MAX_RADIUS, &[((2, 0), 0), ((-4, 0), 1), ((0, -5), 2)]);
        hole(&mut s);
        for seed in 0..10 {
            // E, NE and SE all leave the edge: the seed picks one.
            let o = order(&s, 0, seed);
            assert!(
                [go(&[(2, 0)], E), go(&[(2, 0)], NE), go(&[(2, 0)], SE)].contains(&o),
                "{o:?}"
            );
            assert_eq!(order(&s, 1, seed), Order::Hold);
        }
    }

    #[test]
    fn a_bot_pushes_an_opponent_into_the_hole() {
        let mut s = arena(
            3,
            MAX_RADIUS,
            &[((3, 0), 0), ((4, 0), 0), ((2, 0), 1), ((0, -5), 2)],
        );
        hole(&mut s);
        for seed in 0..10 {
            assert_eq!(order(&s, 0, seed), go(&[(3, 0), (4, 0)], W));
        }
    }

    #[test]
    fn a_bot_pushes_an_opponent_onto_a_cracked_cell() {
        let mut s = arena(
            3,
            MAX_RADIUS,
            &[((-2, 3), 0), ((-1, 3), 0), ((0, 3), 1), ((0, -5), 2)],
        );
        hole(&mut s);
        s.board.set_cracks(vec![((1, 3), 1)]);
        for seed in 0..10 {
            assert_eq!(order(&s, 0, seed), go(&[(-2, 3), (-1, 3)], E));
        }
    }

    #[test]
    fn a_seat_with_no_marble_holds() {
        let s = arena(4, MAX_RADIUS, &[((3, 0), 0), ((0, 0), 1), ((-5, 0), 2)]);
        assert_eq!(order(&s, 3, 0), Order::Hold);
    }

    #[test]
    fn ten_games_of_6_bots_end_by_round_46() {
        let mut shared = 0;
        for seed in 0..10 {
            let mut s = start(6).unwrap();
            while !s.is_over() {
                let orders: Vec<(usize, Order)> =
                    (0..6).map(|seat| (seat, order(&s, seat, seed))).collect();
                s = resolve_round(&s, &orders).unwrap().0;
            }
            assert!(s.round() <= 47, "seed {seed}");
            shared += usize::from(s.winners().unwrap().len() > 1);
        }
        // The last void can take several seats tied on the breach rule (rules.md 10.4).
        assert!(shared <= 2, "{shared} shared wins");
    }
}
