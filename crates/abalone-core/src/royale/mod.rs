//! Battle royale: 3 to 6 seats on the radius 8 arena, simultaneous orders resolved in rotating
//! initiative (docs/specs/rules.md section 10.4).

use std::collections::hash_map::DefaultHasher;
use std::collections::BTreeMap;
use std::hash::{Hash, Hasher};

use crate::board::{Board, Cell};

mod breach;
mod round;
mod setup;

pub use round::{initiative, resolve_round, Order, Outcome, RoundLog, Turn};
pub use setup::{start, MAX_SEATS, MIN_SEATS};

/// Marble colour of each seat, in seat order.
const SEAT_CELLS: [Cell; 6] = [
    Cell::Black,
    Cell::White,
    Cell::Seat3,
    Cell::Seat4,
    Cell::Seat5,
    Cell::Seat6,
];

/// Why the engine refused a battle royale call.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RoyaleError {
    /// A game needs 3 to 6 seats.
    SeatCount(usize),
    /// An order names a seat the game does not have.
    UnknownSeat(usize),
    /// Two orders name the same seat.
    DuplicateSeat(usize),
}

/// A battle royale between rounds.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Royale {
    board: Board,
    seats: usize,
    /// Number of the next round to resolve, from 1.
    round: u32,
    /// Ejections credited to each seat.
    ejections: Vec<u32>,
    /// Seat whose order last moved the marble now on each cell.
    touched: BTreeMap<(i32, i32), usize>,
}

/// Marble colour of `seat`.
pub fn seat_cell(seat: usize) -> Cell {
    SEAT_CELLS[seat]
}

/// Seat whose marbles have colour `cell`, or `None` for an empty cell.
fn seat_of(cell: Cell) -> Option<usize> {
    SEAT_CELLS.iter().position(|&c| c == cell)
}

impl Royale {
    pub fn board(&self) -> &Board {
        &self.board
    }

    pub fn seats(&self) -> usize {
        self.seats
    }

    /// Number of the next round to resolve, from 1.
    pub fn round(&self) -> u32 {
        self.round
    }

    /// Ejections credited to `seat`.
    pub fn ejections(&self, seat: usize) -> u32 {
        self.ejections[seat]
    }

    /// Seat whose order last moved the marble on `(q, r)`, or `None` if no order moved it.
    pub fn last_toucher(&self, q: i32, r: i32) -> Option<usize> {
        self.touched.get(&(q, r)).copied()
    }

    /// Marbles `seat` has on the board.
    pub fn marbles(&self, seat: usize) -> usize {
        let own = seat_cell(seat);
        let radius = self.board.radius();
        (-radius..=radius)
            .flat_map(|q| (-radius..=radius).map(move |r| (q, r)))
            .filter(|&(q, r)| self.board.get(q, r) == Some(own))
            .count()
    }

    /// A seat with no marble left is out of the game (rules.md section 10.4).
    pub fn is_out(&self, seat: usize) -> bool {
        self.marbles(seat) == 0
    }

    /// Hash of the whole state, which every peer compares after a round.
    pub fn hash(&self) -> u64 {
        let mut hasher = DefaultHasher::new();
        let radius = self.board.radius();
        for q in -radius..=radius {
            for r in -radius..=radius {
                self.board.get(q, r).map(|c| c as u8).hash(&mut hasher);
            }
        }
        self.seats.hash(&mut hasher);
        self.round.hash(&mut hasher);
        self.ejections.hash(&mut hasher);
        self.touched.hash(&mut hasher);
        hasher.finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seats_have_their_own_colours_in_order() {
        let cells: Vec<Cell> = (0..6).map(seat_cell).collect();
        assert_eq!(cells, SEAT_CELLS);
        assert_eq!(seat_cell(0), Cell::Black);
        assert_eq!(seat_cell(5), Cell::Seat6);
        assert_eq!(seat_of(Cell::Seat4), Some(3));
        assert_eq!(seat_of(Cell::Empty), None);
    }

    #[test]
    fn hash_tells_states_apart() {
        let s = start(3).unwrap();
        assert_eq!(s.hash(), start(3).unwrap().hash());
        assert_ne!(s.hash(), start(4).unwrap().hash());
        let mut later = s.clone();
        later.round = 2;
        assert_ne!(s.hash(), later.hash());
        let mut credited = s.clone();
        credited.ejections[1] = 1;
        assert_ne!(s.hash(), credited.hash());
        let mut touched = s.clone();
        touched.touched.insert((-4, 6), 0);
        assert_ne!(s.hash(), touched.hash());
        let mut cracked = s.clone();
        cracked.board.set_cracks(vec![((8, 0), 1)]);
        assert_ne!(s.hash(), cracked.hash());
        let mut voided = s.clone();
        voided.last_void[2] = 3;
        assert_ne!(s.hash(), voided.hash());
    }

    #[test]
    fn marbles_and_is_out_count_the_seat_colour() {
        let mut s = start(3).unwrap();
        assert_eq!(s.marbles(2), 10);
        assert!(!s.is_out(2));
        for q in -8..=8 {
            for r in -8..=8 {
                if s.board.get(q, r) == Some(Cell::Seat3) {
                    s.board.set(q, r, Cell::Empty);
                }
            }
        }
        assert_eq!(s.marbles(2), 0);
        assert!(s.is_out(2));
        assert_eq!(s.marbles(0), 10);
    }
}
