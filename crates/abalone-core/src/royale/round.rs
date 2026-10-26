//! One battle royale round: every seat's order applied in rotating initiative, each validated
//! at its turn (rules.md section 10.4).

use super::{seat_cell, seat_of, Royale, RoyaleError};
use crate::board::Cell;
use crate::moves::{apply_for, Move, MoveError};

/// What a seat revealed for a round.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Order {
    Move(Move),
    Hold,
}

/// What became of a seat's order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    /// The move was legal at its turn and was played.
    Applied,
    /// The move was illegal at its turn: it counts as a pass.
    Fizzled(MoveError),
    /// The seat held, or sent no order.
    Held,
    /// The seat had no marble left at its turn: its order is ignored.
    Out,
}

/// One seat's turn in a round.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Turn {
    pub seat: usize,
    pub outcome: Outcome,
    /// Seat whose marble the move ejected, if any. The mover gets the credit.
    pub ejected: Option<usize>,
}

/// Every seat's turn of one round, in initiative order.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RoundLog {
    pub round: u32,
    pub turns: Vec<Turn>,
}

/// Seats in initiative order for `round` (from 1): round `k` starts at seat `(k - 1) mod N`
/// and goes round the list, so every seat leads once every N rounds.
pub fn initiative(round: u32, seats: usize) -> Vec<usize> {
    let first = (round as usize + seats - 1) % seats;
    (0..seats).map(|i| (first + i) % seats).collect()
}

/// Plays one round. `orders` holds at most one order per seat, in any order: the orders are
/// applied one by one in initiative order, each validated against the state the orders before
/// it produced. An illegal order fizzles, a seat with no order holds, and a seat with no marble
/// left at its turn is out, its order ignored.
pub fn resolve_round(
    state: &Royale,
    orders: &[(usize, Order)],
) -> Result<(Royale, RoundLog), RoyaleError> {
    let mut by_seat: Vec<Option<&Order>> = vec![None; state.seats];
    for (seat, order) in orders {
        let slot = by_seat
            .get_mut(*seat)
            .ok_or(RoyaleError::UnknownSeat(*seat))?;
        if slot.replace(order).is_some() {
            return Err(RoyaleError::DuplicateSeat(*seat));
        }
    }
    let mut next = state.clone();
    let mut turns = Vec::new();
    for seat in initiative(state.round, state.seats) {
        let (outcome, ejected) = if next.is_out(seat) {
            (Outcome::Out, None)
        } else {
            match by_seat[seat] {
                Some(Order::Move(mv)) => match next.play(seat, mv) {
                    Ok(ejected) => (Outcome::Applied, ejected),
                    Err(err) => (Outcome::Fizzled(err), None),
                },
                _ => (Outcome::Held, None),
            }
        };
        turns.push(Turn {
            seat,
            outcome,
            ejected,
        });
    }
    next.round += 1;
    let log = RoundLog {
        round: state.round,
        turns,
    };
    Ok((next, log))
}

impl Royale {
    /// Plays `mv` for `seat`: the seat becomes the last toucher of every marble the move
    /// shifts, and gets the credit for an ejection. Returns the seat whose marble was ejected.
    fn play(&mut self, seat: usize, mv: &Move) -> Result<Option<usize>, MoveError> {
        let own = seat_cell(seat);
        let (board, _) = apply_for(&self.board, own, mv)?;
        let (dq, dr) = mv.dir.vector();
        let ahead = |(q, r): (i32, i32)| (q + dq, r + dr);
        // The shifted marbles: the group, then the opponent run ahead of its front.
        let mut shifted = mv.cells.clone();
        for &cell in &mv.cells {
            let mut c = ahead(cell);
            while !mv.cells.contains(&c)
                && self
                    .board
                    .get(c.0, c.1)
                    .is_some_and(|x| x != own && x != Cell::Empty)
            {
                shifted.push(c);
                c = ahead(c);
            }
        }
        for c in &shifted {
            self.touched.remove(c);
        }
        let mut ejected = None;
        for &c in &shifted {
            let to = ahead(c);
            if board.get(to.0, to.1).is_some() {
                self.touched.insert(to, seat);
            } else {
                ejected = self.board.get(c.0, c.1).and_then(seat_of);
                self.ejections[seat] += 1;
            }
        }
        self.board = board;
        Ok(ejected)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::super::start;
    use super::*;
    use crate::board::{Board, MAX_RADIUS};
    use crate::moves::{legal_moves_for, Direction, Direction::*};

    type P = (i32, i32);

    /// A royale of `seats` seats on the radius 8 arena with only the listed marbles, round 1.
    fn arena(seats: usize, marbles: &[(P, usize)]) -> Royale {
        let mut board = Board::with_radius(MAX_RADIUS);
        for &((q, r), seat) in marbles {
            board.set(q, r, seat_cell(seat));
        }
        Royale {
            board,
            seats,
            round: 1,
            ejections: vec![0; seats],
            touched: BTreeMap::new(),
        }
    }

    fn go(cells: &[P], dir: Direction) -> Order {
        Order::Move(Move {
            cells: cells.to_vec(),
            dir,
        })
    }

    fn turn(seat: usize, outcome: Outcome) -> Turn {
        Turn {
            seat,
            outcome,
            ejected: None,
        }
    }

    fn cells_of(s: &Royale, seat: usize) -> Vec<P> {
        let mut v = Vec::new();
        for q in -MAX_RADIUS..=MAX_RADIUS {
            for r in -MAX_RADIUS..=MAX_RADIUS {
                if s.board().get(q, r) == Some(seat_cell(seat)) {
                    v.push((q, r));
                }
            }
        }
        v
    }

    #[test]
    fn initiative_rotates_by_round() {
        // Example 38, and every round 1 to N + 1 for 3 and 6 seats.
        let three = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [0, 1, 2]];
        for (round, expected) in (1..).zip(three) {
            assert_eq!(initiative(round, 3), expected, "round {round}");
        }
        let six = [
            [0, 1, 2, 3, 4, 5],
            [1, 2, 3, 4, 5, 0],
            [2, 3, 4, 5, 0, 1],
            [3, 4, 5, 0, 1, 2],
            [4, 5, 0, 1, 2, 3],
            [5, 0, 1, 2, 3, 4],
            [0, 1, 2, 3, 4, 5],
        ];
        for (round, expected) in (1..).zip(six) {
            assert_eq!(initiative(round, 6), expected, "round {round}");
        }
        assert_eq!(initiative(4, 4), [3, 0, 1, 2]);
        assert_eq!(initiative(7, 5), [1, 2, 3, 4, 0]);
    }

    #[test]
    fn same_cell_conflict_goes_to_the_first_in_initiative() {
        // Example 37: both orders target (1,0). In round 1 seat 0 takes it, seat 1's order is
        // now a 1v1 push and fizzles. In round 2 seat 1 leads and seat 0 fizzles.
        let s = arena(3, &[((0, 0), 0), ((2, 0), 1), ((-5, 0), 2)]);
        let orders = [
            (0, go(&[(0, 0)], E)),
            (1, go(&[(2, 0)], W)),
            (2, Order::Hold),
        ];
        let (after, log) = resolve_round(&s, &orders).unwrap();
        assert_eq!(cells_of(&after, 0), [(1, 0)]);
        assert_eq!(cells_of(&after, 1), [(2, 0)]);
        assert_eq!(cells_of(&after, 2), [(-5, 0)]);
        assert_eq!(
            log,
            RoundLog {
                round: 1,
                turns: vec![
                    turn(0, Outcome::Applied),
                    turn(1, Outcome::Fizzled(MoveError::NotStrongEnough)),
                    turn(2, Outcome::Held),
                ],
            }
        );
        assert_eq!(after.round(), 2);

        let mut s2 = s.clone();
        s2.round = 2;
        let (after, log) = resolve_round(&s2, &orders).unwrap();
        assert_eq!(cells_of(&after, 0), [(0, 0)]);
        assert_eq!(cells_of(&after, 1), [(1, 0)]);
        assert_eq!(
            log.turns,
            [
                turn(1, Outcome::Applied),
                turn(2, Outcome::Held),
                turn(0, Outcome::Fizzled(MoveError::NotStrongEnough)),
            ]
        );
        assert_eq!(after.round(), 3);
    }

    #[test]
    fn a_push_makes_a_later_order_illegal() {
        // Seat 0 pushes seat 1's marble from (2,0) to (3,0); seat 1's order still names (2,0).
        let s = arena(3, &[((0, 0), 0), ((1, 0), 0), ((2, 0), 1), ((0, 5), 2)]);
        let orders = [
            (1, go(&[(2, 0)], SE)),
            (2, go(&[(0, 5)], E)),
            (0, go(&[(0, 0), (1, 0)], E)),
        ];
        let (after, log) = resolve_round(&s, &orders).unwrap();
        assert_eq!(cells_of(&after, 0), [(1, 0), (2, 0)]);
        assert_eq!(cells_of(&after, 1), [(3, 0)]);
        assert_eq!(cells_of(&after, 2), [(1, 5)]);
        assert_eq!(
            log.turns,
            [
                turn(0, Outcome::Applied),
                turn(1, Outcome::Fizzled(MoveError::NotOwnMarble)),
                turn(2, Outcome::Applied),
            ]
        );
    }

    #[test]
    fn the_last_toucher_of_each_marble_is_recorded() {
        let s = arena(3, &[((0, 0), 0), ((1, 0), 0), ((2, 0), 1), ((0, 5), 2)]);
        assert_eq!(s.last_toucher(2, 0), None);
        let (after, _) = resolve_round(&s, &[(0, go(&[(0, 0), (1, 0)], E))]).unwrap();
        assert_eq!(after.last_toucher(0, 0), None, "the cell left behind");
        assert_eq!(after.last_toucher(1, 0), Some(0));
        assert_eq!(after.last_toucher(2, 0), Some(0));
        assert_eq!(after.last_toucher(3, 0), Some(0), "the pushed marble");
        assert_eq!(after.last_toucher(0, 5), None, "a marble nobody moved");
        // Round 2: seat 1 moves its pushed marble away, and becomes its last toucher.
        let (later, _) = resolve_round(&after, &[(1, go(&[(3, 0)], SE))]).unwrap();
        assert_eq!(later.last_toucher(3, 0), None);
        assert_eq!(later.last_toucher(3, 1), Some(1));
        assert_eq!(later.last_toucher(2, 0), Some(0));
    }

    #[test]
    fn an_ejection_goes_to_the_pusher() {
        // Example 40 at the radius 8 rim: 3v2, seat 1's marble at (8,0) is ejected.
        let s = arena(
            3,
            &[
                ((4, 0), 0),
                ((5, 0), 0),
                ((6, 0), 0),
                ((7, 0), 1),
                ((8, 0), 1),
                ((0, 5), 2),
            ],
        );
        let orders = [(0, go(&[(4, 0), (5, 0), (6, 0)], E)), (1, Order::Hold)];
        let (after, log) = resolve_round(&s, &orders).unwrap();
        assert_eq!(cells_of(&after, 0), [(5, 0), (6, 0), (7, 0)]);
        assert_eq!(cells_of(&after, 1), [(8, 0)]);
        assert_eq!(after.ejections(0), 1);
        assert_eq!(after.ejections(1), 0);
        assert_eq!(after.last_toucher(8, 0), Some(0));
        assert_eq!(
            log.turns,
            [
                Turn {
                    seat: 0,
                    outcome: Outcome::Applied,
                    ejected: Some(1),
                },
                turn(1, Outcome::Held),
                turn(2, Outcome::Held),
            ]
        );
    }

    #[test]
    fn a_seat_at_0_marbles_is_out_and_its_orders_are_ignored() {
        // Seat 1's last marble is ejected by seat 0 in round 1; its own order comes later.
        // Seat 2 was out before the round.
        let s = arena(3, &[((6, 0), 0), ((7, 0), 0), ((8, 0), 1)]);
        assert!(s.is_out(2));
        let orders = [
            (0, go(&[(6, 0), (7, 0)], E)),
            (1, go(&[(8, 0)], W)),
            (2, Order::Hold),
        ];
        let (after, log) = resolve_round(&s, &orders).unwrap();
        assert!(after.is_out(1));
        assert_eq!(after.ejections(0), 1);
        assert_eq!(
            log.turns,
            [
                Turn {
                    seat: 0,
                    outcome: Outcome::Applied,
                    ejected: Some(1),
                },
                turn(1, Outcome::Out),
                turn(2, Outcome::Out),
            ]
        );
        // Round 2: seat 1 leads, still out.
        let (_, log) = resolve_round(&after, &[(1, go(&[(8, 0)], W))]).unwrap();
        assert_eq!(log.turns[0], turn(1, Outcome::Out));
    }

    #[test]
    fn a_missing_order_holds() {
        let s = start(4).unwrap();
        let (after, log) = resolve_round(&s, &[]).unwrap();
        assert_eq!(after.board(), s.board());
        assert_eq!(after.round(), 2);
        assert_eq!(
            log.turns,
            (0..4)
                .map(|seat| turn(seat, Outcome::Held))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn orders_for_an_unknown_or_repeated_seat_are_refused() {
        let s = start(3).unwrap();
        assert_eq!(
            resolve_round(&s, &[(3, Order::Hold)]),
            Err(RoyaleError::UnknownSeat(3))
        );
        assert_eq!(
            resolve_round(&s, &[(1, Order::Hold), (0, Order::Hold), (1, Order::Hold)]),
            Err(RoyaleError::DuplicateSeat(1))
        );
    }

    #[test]
    fn resolve_round_leaves_its_input_unchanged() {
        let s = start(3).unwrap();
        let copy = s.clone();
        resolve_round(&s, &[(0, go(&[(-4, 6)], NW))]).unwrap();
        assert_eq!(s, copy);
    }

    /// Small deterministic generator for the property test.
    struct Lcg(u64);

    impl Lcg {
        fn below(&mut self, n: usize) -> usize {
            self.0 = self
                .0
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            ((self.0 >> 33) % n as u64) as usize
        }
    }

    #[test]
    fn shuffling_the_order_list_gives_the_same_state_and_hash() {
        let mut rng = Lcg(494);
        // A crowd against the east rim, so orders conflict, push, fizzle and eject.
        let mut marbles = Vec::new();
        for seat in 0..6 {
            for _ in 0..10 {
                let (q, r) = (rng.below(5) as i32 + 4, rng.below(9) as i32 - 4);
                if q + r <= 8 && !marbles.iter().any(|&(c, _)| c == (q, r)) {
                    marbles.push(((q, r), seat));
                }
            }
        }
        let mut states = [arena(6, &marbles), start(6).unwrap(), start(3).unwrap()];
        let mut fizzled = 0;
        let mut ejected = 0;
        for _ in 0..30 {
            for state in states.iter_mut() {
                let mut orders: Vec<(usize, Order)> = Vec::new();
                for seat in 0..state.seats() {
                    let own = seat_cell(seat);
                    let mut moves = legal_moves_for(state.board(), own);
                    // A seat that can eject does.
                    let ejecting: Vec<Move> = moves
                        .iter()
                        .filter(|m| apply_for(state.board(), own, m).unwrap().1)
                        .cloned()
                        .collect();
                    if !ejecting.is_empty() {
                        moves = ejecting;
                    }
                    let pick = rng.below(moves.len() + 1);
                    let order = moves.get(pick).cloned().map_or(Order::Hold, Order::Move);
                    orders.push((seat, order));
                }
                let (expected, log) = resolve_round(state, &orders).unwrap();
                for _ in 0..8 {
                    for i in (1..orders.len()).rev() {
                        orders.swap(i, rng.below(i + 1));
                    }
                    let (got, got_log) = resolve_round(state, &orders).unwrap();
                    assert_eq!(got, expected);
                    assert_eq!(got.hash(), expected.hash());
                    assert_eq!(got_log, log);
                }
                fizzled += log
                    .turns
                    .iter()
                    .filter(|t| matches!(t.outcome, Outcome::Fizzled(_)))
                    .count();
                ejected += log.turns.iter().filter(|t| t.ejected.is_some()).count();
                *state = expected;
            }
        }
        assert!(fizzled > 0, "the test must exercise fizzled orders");
        assert!(ejected > 0, "the test must exercise ejections");
    }
}
