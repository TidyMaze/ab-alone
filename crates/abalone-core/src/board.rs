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

/// Standard start, Black side (bottom, r > 0): row r=4 (5 cells), row r=3 (6), the three centre cells of r=2.
/// White is the point reflection `(q, r) -> (-q, -r)`.
const STANDARD_BLACK: [(i32, i32); 14] = [
    (-4, 4),
    (-3, 4),
    (-2, 4),
    (-1, 4),
    (0, 4),
    (-4, 3),
    (-3, 3),
    (-2, 3),
    (-1, 3),
    (0, 3),
    (1, 3),
    (-2, 2),
    (-1, 2),
    (0, 2),
];

/// Hexagonal Abalone board.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Board {
    cells: HashMap<(i32, i32), Cell>,
    /// Cracked cells with the plies left before they vanish, for the Hull boss.
    cracks: Vec<((i32, i32), u8)>,
}

impl Board {
    /// Board with all 61 cells empty.
    pub fn empty() -> Self {
        let mut cells = HashMap::new();
        for q in -RADIUS..=RADIUS {
            for r in -RADIUS..=RADIUS {
                if (q + r).abs() <= RADIUS {
                    cells.insert((q, r), Cell::Empty);
                }
            }
        }
        Self {
            cells,
            cracks: Vec::new(),
        }
    }

    /// Content of `(q, r)`, or `None` when the cell is off the board.
    pub fn get(&self, q: i32, r: i32) -> Option<Cell> {
        self.cells.get(&(q, r)).copied()
    }

    /// Sets `(q, r)`. Off-board cells are left untouched.
    pub fn set(&mut self, q: i32, r: i32, cell: Cell) {
        if let Some(slot) = self.cells.get_mut(&(q, r)) {
            *slot = cell;
        }
    }

    /// Removes `(q, r)` from the board for good, with its marble. Later `get` gives `None` and
    /// `set` is ignored, so moves onto it are refused and pushes onto it eject.
    pub fn void(&mut self, q: i32, r: i32) {
        self.cells.remove(&(q, r));
    }

    /// Cracked cells and the plies left before each vanishes.
    pub fn cracks(&self) -> &[((i32, i32), u8)] {
        &self.cracks
    }

    pub fn set_cracks(&mut self, cracks: Vec<((i32, i32), u8)>) {
        self.cracks = cracks;
    }

    /// Standard start layout: 14 marbles per side.
    pub fn standard() -> Self {
        Self::with_marbles(&STANDARD_BLACK)
    }

    /// Black marbles on `black`, White marbles on their point reflections.
    fn with_marbles(black: &[(i32, i32)]) -> Self {
        let mut board = Self::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
            board.set(-q, -r, Cell::White);
        }
        board
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
    fn standard_layout_matches_spec() {
        // docs/specs/rules.md section 2.1: Black at the bottom (r > 0), White at the top.
        let board = Board::standard();
        let mut black: Vec<(i32, i32)> = all_coords()
            .filter(|&(q, r)| board.get(q, r) == Some(Cell::Black))
            .collect();
        let mut white: Vec<(i32, i32)> = all_coords()
            .filter(|&(q, r)| board.get(q, r) == Some(Cell::White))
            .collect();
        black.sort();
        white.sort();
        let mut expected_black = vec![
            (-4, 4),
            (-3, 4),
            (-2, 4),
            (-1, 4),
            (0, 4),
            (-4, 3),
            (-3, 3),
            (-2, 3),
            (-1, 3),
            (0, 3),
            (1, 3),
            (-2, 2),
            (-1, 2),
            (0, 2),
        ];
        let mut expected_white = vec![
            (0, -4),
            (1, -4),
            (2, -4),
            (3, -4),
            (4, -4),
            (-1, -3),
            (0, -3),
            (1, -3),
            (2, -3),
            (3, -3),
            (4, -3),
            (0, -2),
            (1, -2),
            (2, -2),
        ];
        expected_black.sort();
        expected_white.sort();
        assert_eq!(black, expected_black);
        assert_eq!(white, expected_white);
    }

    #[test]
    fn standard_is_point_symmetric() {
        let board = Board::standard();
        for (q, r) in all_coords() {
            assert_eq!(board.get(q, r), board.get(-q, -r).map(swap_colour));
        }
    }

    #[test]
    fn void_removes_a_cell_and_its_marble() {
        let mut board = Board::standard();
        board.void(0, 4);
        assert_eq!(board.get(0, 4), None);
        assert_eq!(count(&board, Cell::Black), 13);
        assert_eq!(
            all_coords()
                .filter(|&(q, r)| board.get(q, r).is_some())
                .count(),
            60
        );
        board.set(0, 4, Cell::Black);
        assert_eq!(board.get(0, 4), None, "a vanished cell stays off the board");
    }

    #[test]
    fn cracks_start_empty_and_are_replaced_whole() {
        let mut board = Board::empty();
        assert!(board.cracks().is_empty());
        board.set_cracks(vec![((4, 0), 2)]);
        assert_eq!(board.cracks(), &[((4, 0), 2)]);
        assert_ne!(board, Board::empty());
        board.set_cracks(vec![]);
        assert_eq!(board, Board::empty());
    }
}
