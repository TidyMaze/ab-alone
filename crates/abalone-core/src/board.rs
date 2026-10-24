//! Board model: the 61 cells of the radius-4 hexagon, in axial coordinates `(q, r)`.

use std::collections::HashMap;

/// Radius of the standard board: 61 cells. A cell `(q, r)` is on a board of radius `n` when
/// `|q|`, `|r|` and `|q + r|` are all `<= n`.
pub const RADIUS: i32 = 4;

/// Largest board radius the engine supports (The Ballast Mind plays on radius 5). Every scan over
/// the board runs `-MAX_RADIUS..=MAX_RADIUS` and relies on `get` giving `None` off the board.
pub const MAX_RADIUS: i32 = 5;

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

/// Belgian daisy start, Black side: two flowers (a cell and its six neighbours) centred on
/// (-3,3) at bottom left and (3,-3) at top right. White is the left-right mirror
/// `(q, r) -> (-q - r, r)`, flowers centred on (0,3) and (0,-3).
/// Sources, which agree cell for cell: Wikipedia "Abalone (board game)" (file
/// Abalone_belgian.svg); abalonegames.com (Abalone S.A.), Rules > Rule variations > Belgian
/// Daisy, author Belgian Federation of Abalone; playstrategy.org/variant/abalone.
const BELGIAN_DAISY_BLACK: [(i32, i32); 14] = [
    (-4, 4),
    (-3, 4),
    (-4, 3),
    (-3, 3),
    (-2, 3),
    (-3, 2),
    (-2, 2),
    (2, -2),
    (3, -2),
    (2, -3),
    (3, -3),
    (4, -3),
    (3, -4),
    (4, -4),
];

/// Hexagonal Abalone board.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Board {
    cells: HashMap<(i32, i32), Cell>,
    /// Cracked cells with the plies left before they vanish, for the Hull boss.
    cracks: Vec<((i32, i32), u8)>,
    /// Boss marbles that were player marbles, for the Chaplain: only these flip back.
    converted: Vec<(i32, i32)>,
}

impl Board {
    /// Board with all 61 cells empty.
    pub fn empty() -> Self {
        Self::with_radius(RADIUS)
    }

    /// Board of the given radius (at most [`MAX_RADIUS`]) with every cell empty.
    pub fn with_radius(radius: i32) -> Self {
        let mut cells = HashMap::new();
        for q in -radius..=radius {
            for r in -radius..=radius {
                if (q + r).abs() <= radius {
                    cells.insert((q, r), Cell::Empty);
                }
            }
        }
        Self {
            cells,
            cracks: Vec::new(),
            converted: Vec::new(),
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

    /// Cells holding a marble the boss converted.
    pub fn converted(&self) -> &[(i32, i32)] {
        &self.converted
    }

    pub fn set_converted(&mut self, converted: Vec<(i32, i32)>) {
        self.converted = converted;
    }

    /// Standard start layout: 14 marbles per side.
    pub fn standard() -> Self {
        Self::with_marbles(&STANDARD_BLACK, |q, r| (-q, -r))
    }

    /// Belgian daisy start layout: 14 marbles per side, two flowers each.
    pub fn belgian_daisy() -> Self {
        Self::with_marbles(&BELGIAN_DAISY_BLACK, |q, r| (-q - r, r))
    }

    /// Black marbles on `black`, White marbles on their images by `white_of`.
    fn with_marbles(black: &[(i32, i32)], white_of: impl Fn(i32, i32) -> (i32, i32)) -> Self {
        let mut board = Self::empty();
        for &(q, r) in black {
            let (wq, wr) = white_of(q, r);
            board.set(q, r, Cell::Black);
            board.set(wq, wr, Cell::White);
        }
        board
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_coords() -> impl Iterator<Item = (i32, i32)> {
        (-MAX_RADIUS..=MAX_RADIUS).flat_map(|q| (-MAX_RADIUS..=MAX_RADIUS).map(move |r| (q, r)))
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
    fn with_radius_sizes_the_board() {
        for (radius, cells) in [(0, 1), (4, 61), (5, 91)] {
            let board = Board::with_radius(radius);
            let on_board = all_coords()
                .filter(|&(q, r)| board.get(q, r).is_some())
                .count();
            assert_eq!(on_board, cells, "radius {radius}");
        }
        assert_eq!(Board::with_radius(RADIUS), Board::empty());
        assert_eq!(Board::with_radius(5).get(5, -5), Some(Cell::Empty));
        assert_eq!(Board::with_radius(5).get(6, 0), None);
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
    fn belgian_daisy_has_14_marbles_per_side() {
        let board = Board::belgian_daisy();
        assert_eq!(count(&board, Cell::Black), 14);
        assert_eq!(count(&board, Cell::White), 14);
    }

    #[test]
    fn belgian_daisy_layout_matches_spec() {
        // docs/specs/rules.md section 2.2: each side has a flower near the bottom and one near
        // the top, Black at bottom left and top right.
        let board = Board::belgian_daisy();
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
            (-4, 3),
            (-3, 3),
            (-2, 3),
            (-3, 2),
            (-2, 2),
            (2, -2),
            (3, -2),
            (2, -3),
            (3, -3),
            (4, -3),
            (3, -4),
            (4, -4),
        ];
        let mut expected_white = vec![
            (-1, 4),
            (0, 4),
            (-1, 3),
            (0, 3),
            (1, 3),
            (0, 2),
            (1, 2),
            (-1, -2),
            (0, -2),
            (-1, -3),
            (0, -3),
            (1, -3),
            (0, -4),
            (1, -4),
        ];
        expected_black.sort();
        expected_white.sort();
        assert_eq!(black, expected_black);
        assert_eq!(white, expected_white);
    }

    #[test]
    fn belgian_daisy_white_mirrors_black_left_right() {
        // The mirror (q, r) -> (-q - r, r) keeps the row and swaps colours. The point reflection
        // keeps colours: it maps each side's bottom flower onto its own top flower.
        let board = Board::belgian_daisy();
        for (q, r) in all_coords() {
            assert_eq!(board.get(q, r), board.get(-q - r, r).map(swap_colour));
            assert_eq!(board.get(q, r), board.get(-q, -r));
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

    #[test]
    fn converted_cells_start_empty_and_are_replaced_whole() {
        let mut board = Board::empty();
        assert!(board.converted().is_empty());
        board.set_converted(vec![(1, 0)]);
        assert_eq!(board.converted(), &[(1, 0)]);
        assert_ne!(board, Board::empty());
        board.set_converted(vec![]);
        assert_eq!(board, Board::empty());
    }
}
