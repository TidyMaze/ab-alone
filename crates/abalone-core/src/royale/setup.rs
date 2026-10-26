//! Start position of a battle royale: 10 marbles per seat in the rim wedges (rules.md
//! section 10.4).

use std::collections::BTreeMap;

use super::{seat_cell, Royale, RoyaleError};
use crate::board::{Board, MAX_RADIUS};

/// Fewest seats in a battle royale.
pub const MIN_SEATS: usize = 3;
/// Most seats in a battle royale.
pub const MAX_SEATS: usize = 6;

/// Wedge 0, centred on the bottom side (r = 8): rows of 3, 4 and 3 marbles from the rim inwards,
/// symmetric about the side's middle. Wedge `k` is wedge 0 turned `k` times by 60 degrees.
const WEDGE_0: [(i32, i32); 10] = [
    (-5, 8),
    (-4, 8),
    (-3, 8),
    (-5, 7),
    (-4, 7),
    (-3, 7),
    (-2, 7),
    (-4, 6),
    (-3, 6),
    (-2, 6),
];

/// Wedge of each seat, by seat count from 3 to 6: 3 seats alternate, 4 seats leave two
/// opposite wedges empty.
const WEDGES: [&[usize]; 4] = [
    &[0, 2, 4],
    &[0, 1, 3, 4],
    &[0, 1, 2, 3, 4],
    &[0, 1, 2, 3, 4, 5],
];

/// Turns `(q, r)` by 60 degrees about the centre, clockwise on screen (E goes to SE).
fn rotate((q, r): (i32, i32)) -> (i32, i32) {
    (-r, q + r)
}

/// The radius 8 arena with 10 marbles per seat, round 1. Fewer than 3 or more than 6 seats is
/// refused.
pub fn start(seats: usize) -> Result<Royale, RoyaleError> {
    if !(MIN_SEATS..=MAX_SEATS).contains(&seats) {
        return Err(RoyaleError::SeatCount(seats));
    }
    let mut board = Board::with_radius(MAX_RADIUS);
    for (seat, &wedge) in WEDGES[seats - MIN_SEATS].iter().enumerate() {
        for &cell in &WEDGE_0 {
            let (q, r) = (0..wedge).fold(cell, |c, _| rotate(c));
            board.set(q, r, seat_cell(seat));
        }
    }
    Ok(Royale {
        board,
        seats,
        round: 1,
        ejections: vec![0; seats],
        touched: BTreeMap::new(),
        last_void: vec![0; seats],
    })
}

#[cfg(test)]
mod tests {
    use super::super::seat_cell;
    use super::*;
    use crate::board::{Board, Cell, MAX_RADIUS};

    type P = (i32, i32);

    fn on_board(board: &Board) -> Vec<P> {
        (-MAX_RADIUS..=MAX_RADIUS)
            .flat_map(|q| (-MAX_RADIUS..=MAX_RADIUS).map(move |r| (q, r)))
            .filter(|&(q, r)| board.get(q, r).is_some())
            .collect()
    }

    fn cells_of(board: &Board, cell: Cell) -> Vec<P> {
        let mut v: Vec<P> = on_board(board)
            .into_iter()
            .filter(|&(q, r)| board.get(q, r) == Some(cell))
            .collect();
        v.sort();
        v
    }

    /// Rotation by 60 degrees clockwise on screen: E goes to SE.
    fn rotate((q, r): P, times: usize) -> P {
        (0..times).fold((q, r), |(q, r), _| (-r, q + r))
    }

    fn rotated(cells: &[P], times: usize) -> Vec<P> {
        let mut v: Vec<P> = cells.iter().map(|&c| rotate(c, times)).collect();
        v.sort();
        v
    }

    /// Wedge 0 of rules.md section 10.4, on the bottom side (r = 8).
    const WEDGE_0: [P; 10] = [
        (-5, 8),
        (-4, 8),
        (-3, 8),
        (-5, 7),
        (-4, 7),
        (-3, 7),
        (-2, 7),
        (-4, 6),
        (-3, 6),
        (-2, 6),
    ];

    #[test]
    fn the_arena_has_217_cells_and_10_marbles_per_seat() {
        for seats in MIN_SEATS..=MAX_SEATS {
            let s = start(seats).unwrap();
            assert_eq!(s.seats(), seats);
            assert_eq!(s.board().radius(), 8);
            assert_eq!(on_board(s.board()).len(), 217);
            for seat in 0..6 {
                let expected = if seat < seats { 10 } else { 0 };
                assert_eq!(s.marbles(seat), expected, "{seats} seats, seat {seat}");
            }
            assert_eq!(s.round(), 1);
            assert!((0..seats).all(|seat| s.ejections(seat) == 0));
            assert!(on_board(s.board())
                .iter()
                .all(|&(q, r)| s.last_toucher(q, r).is_none()));
        }
    }

    #[test]
    fn seat_0_starts_on_wedge_0() {
        let mut wedge = WEDGE_0.to_vec();
        wedge.sort();
        for seats in MIN_SEATS..=MAX_SEATS {
            assert_eq!(cells_of(start(seats).unwrap().board(), Cell::Black), wedge);
        }
    }

    #[test]
    fn six_seats_are_6_fold_symmetric() {
        let s = start(6).unwrap();
        let board = s.board();
        for seat in 0..6 {
            assert_eq!(
                cells_of(board, seat_cell(seat)),
                rotated(&WEDGE_0, seat),
                "seat {seat}"
            );
        }
        for c in on_board(board) {
            let here = board.get(c.0, c.1).unwrap();
            let (q, r) = rotate(c, 1);
            let there = board.get(q, r).unwrap();
            let expected = match here {
                Cell::Empty => Cell::Empty,
                cell => {
                    let seat = (0..6).find(|&k| seat_cell(k) == cell).unwrap();
                    seat_cell((seat + 1) % 6)
                }
            };
            assert_eq!(there, expected, "{c:?}");
        }
    }

    #[test]
    fn seats_take_the_wedges_of_their_table() {
        // 3 seats alternate, 4 seats leave two opposite wedges empty, 5 seats leave the last one.
        for (seats, wedges) in [
            (3, &[0, 2, 4][..]),
            (4, &[0, 1, 3, 4][..]),
            (5, &[0, 1, 2, 3, 4][..]),
            (6, &[0, 1, 2, 3, 4, 5][..]),
        ] {
            let s = start(seats).unwrap();
            for (seat, &w) in wedges.iter().enumerate() {
                assert_eq!(
                    cells_of(s.board(), seat_cell(seat)),
                    rotated(&WEDGE_0, w),
                    "{seats} seats, seat {seat}"
                );
            }
            let marbles: usize = (0..6).map(|seat| s.marbles(seat)).sum();
            assert_eq!(marbles, 10 * seats);
        }
    }

    #[test]
    fn fewer_than_3_or_more_than_6_seats_is_refused() {
        for seats in [0, 1, 2, 7, 12] {
            assert_eq!(start(seats), Err(RoyaleError::SeatCount(seats)));
        }
    }
}
