//! Board model: the 61 cells of the radius-4 hexagon, in axial coordinates `(q, r)`.

use std::collections::HashMap;

/// Board radius. A cell `(q, r)` is on the board when `|q|`, `|r|` and `|q + r|` are all `<= RADIUS`.
pub const RADIUS: i32 = 4;

/// Content of one cell.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cell {
    Empty,
    Black,
    White,
}

/// Hexagonal Abalone board.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Board {
    cells: HashMap<(i32, i32), Cell>,
}

impl Board {
    /// Board with all 61 cells empty.
    pub fn empty() -> Self {
        todo!()
    }

    /// Content of `(q, r)`, or `None` when the cell is off the board.
    pub fn get(&self, q: i32, r: i32) -> Option<Cell> {
        todo!()
    }

    /// Sets `(q, r)`. Off-board cells are left untouched.
    pub fn set(&mut self, q: i32, r: i32, cell: Cell) {
        todo!()
    }

    /// Standard start layout: 14 marbles per side.
    pub fn standard() -> Self {
        todo!()
    }

    /// Belgian daisy start layout: 14 marbles per side.
    pub fn belgian_daisy() -> Self {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_coords() -> impl Iterator<Item = (i32, i32)> {
        (-RADIUS..=RADIUS).flat_map(|q| (-RADIUS..=RADIUS).map(move |r| (q, r)))
    }

    fn count(board: &Board, cell: Cell) -> usize {
        all_coords()
            .filter(|&(q, r)| board.get(q, r) == Some(cell))
            .count()
    }

    fn swap_colour(cell: Cell) -> Cell {
        match cell {
            Cell::Black => Cell::White,
            Cell::White => Cell::Black,
            Cell::Empty => Cell::Empty,
        }
    }

    #[test]
    fn board_has_61_cells() {
        let board = Board::empty();
        let on_board = all_coords()
            .filter(|&(q, r)| board.get(q, r).is_some())
            .count();
        assert_eq!(on_board, 61);
    }

    #[test]
    fn off_board_get_is_none() {
        let board = Board::standard();
        assert_eq!(board.get(5, 0), None);
        assert_eq!(board.get(0, -5), None);
        assert_eq!(board.get(3, 2), None);
    }

    #[test]
    fn set_then_get_on_board() {
        let mut board = Board::empty();
        board.set(1, -2, Cell::White);
        assert_eq!(board.get(1, -2), Some(Cell::White));
    }

    #[test]
    fn set_off_board_is_ignored() {
        let mut board = Board::empty();
        board.set(5, 0, Cell::Black);
        assert_eq!(board.get(5, 0), None);
        assert_eq!(count(&board, Cell::Black), 0);
    }

    #[test]
    fn standard_has_14_marbles_per_side() {
        let board = Board::standard();
        assert_eq!(count(&board, Cell::Black), 14);
        assert_eq!(count(&board, Cell::White), 14);
    }

    #[test]
    fn belgian_daisy_has_14_marbles_per_side() {
        let board = Board::belgian_daisy();
        assert_eq!(count(&board, Cell::Black), 14);
        assert_eq!(count(&board, Cell::White), 14);
    }

    #[test]
    fn standard_is_point_symmetric() {
        let board = Board::standard();
        for (q, r) in all_coords() {
            assert_eq!(board.get(q, r), board.get(-q, -r).map(swap_colour));
        }
    }
}
