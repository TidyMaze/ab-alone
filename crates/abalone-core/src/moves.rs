//! Move generation and validation: inline, broadside and sumito (docs/specs/rules.md sections 3 to 5).

use crate::board::{Board, Cell, RADIUS};

/// The six hex directions, as axial vectors.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Direction {
    E,
    W,
    NE,
    SW,
    NW,
    SE,
}

/// A side.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Player {
    Black,
    White,
}

/// One group (1 to 3 own marbles) moved one step in one direction.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Move {
    pub cells: Vec<(i32, i32)>,
    pub dir: Direction,
}

/// Why a move is refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MoveError {
    EmptySelection,
    TooManyMarbles,
    NotOwnMarble,
    NotALine,
    OffBoard,
    Blocked,
    NotStrongEnough,
    PushBlocked,
}

impl Direction {
    const ALL: [Direction; 6] = [
        Direction::E,
        Direction::W,
        Direction::NE,
        Direction::SW,
        Direction::NW,
        Direction::SE,
    ];

    fn vector(self) -> (i32, i32) {
        match self {
            Direction::E => (1, 0),
            Direction::W => (-1, 0),
            Direction::NE => (1, -1),
            Direction::SW => (-1, 1),
            Direction::NW => (0, -1),
            Direction::SE => (0, 1),
        }
    }
}

impl Player {
    fn cells(self) -> (Cell, Cell) {
        match self {
            Player::Black => (Cell::Black, Cell::White),
            Player::White => (Cell::White, Cell::Black),
        }
    }
}

fn step((q, r): (i32, i32), (dq, dr): (i32, i32), n: i32) -> (i32, i32) {
    (q + n * dq, r + n * dr)
}

fn at(board: &Board, (q, r): (i32, i32)) -> Option<Cell> {
    board.get(q, r)
}

/// Every legal move of `player` on `board`.
pub fn legal_moves(board: &Board, player: Player) -> Vec<Move> {
    let (own, _) = player.cells();
    let mut moves = Vec::new();
    for q in -RADIUS..=RADIUS {
        for r in -RADIUS..=RADIUS {
            if board.get(q, r) != Some(own) {
                continue;
            }
            // Axis vectors in ascending order: a group built from `(q, r)` is already sorted.
            for axis in [Direction::E, Direction::NE, Direction::SE] {
                let v = axis.vector();
                for size in 1..=3 {
                    // A single marble is the same group on every axis: generate it once.
                    if size == 1 && axis != Direction::E {
                        continue;
                    }
                    let cells: Vec<_> = (0..size).map(|i| step((q, r), v, i)).collect();
                    for dir in Direction::ALL {
                        let m = Move {
                            cells: cells.clone(),
                            dir,
                        };
                        if apply(board, player, &m).is_ok() {
                            moves.push(m);
                        }
                    }
                }
            }
        }
    }
    moves
}

/// Plays `mv` for `player`. Returns the new board and whether an opponent marble was ejected.
pub fn apply(board: &Board, player: Player, mv: &Move) -> Result<(Board, bool), MoveError> {
    let (own, opp) = player.cells();
    let mut group = mv.cells.clone();
    group.sort();
    let n = group.len();
    if n == 0 {
        return Err(MoveError::EmptySelection);
    }
    if n > 3 {
        return Err(MoveError::TooManyMarbles);
    }
    if group.iter().any(|&c| at(board, c) != Some(own)) {
        return Err(MoveError::NotOwnMarble);
    }
    // Sorted ascending, the gap between neighbours is E, NE or SE when the group is a line.
    let axis = Direction::ALL
        .into_iter()
        .find(|d| n == 1 || step(group[0], d.vector(), 1) == group[1]);
    let Some(axis) = axis else {
        return Err(MoveError::NotALine);
    };
    let v = axis.vector();
    if (0..n).any(|i| group[i] != step(group[0], v, i as i32)) {
        return Err(MoveError::NotALine);
    }
    let d = mv.dir.vector();
    let inline = n == 1 || d == v || d == step((0, 0), v, -1);
    let mut next = board.clone();
    let mut ejected = false;
    let mut moved: Vec<((i32, i32), Cell)> = group.iter().map(|&c| (c, own)).collect();
    if inline {
        let front = if d == v { group[n - 1] } else { group[0] };
        let lead = step(front, d, 1);
        let mut run = 0;
        while at(board, step(lead, d, run)) == Some(opp) {
            run += 1;
        }
        let behind = at(board, step(lead, d, run));
        if run == 0 {
            match behind {
                Some(Cell::Empty) => {}
                Some(_) => return Err(MoveError::Blocked),
                None => return Err(MoveError::OffBoard),
            }
        } else {
            if n as i32 <= run {
                return Err(MoveError::NotStrongEnough);
            }
            match behind {
                Some(Cell::Empty) => {}
                Some(_) => return Err(MoveError::PushBlocked),
                None => ejected = true,
            }
            moved.extend((0..run).map(|i| (step(lead, d, i), opp)));
        }
    } else {
        for &c in &group {
            match at(board, step(c, d, 1)) {
                Some(Cell::Empty) => {}
                Some(_) => return Err(MoveError::Blocked),
                None => return Err(MoveError::OffBoard),
            }
        }
    }
    for &(c, _) in &moved {
        next.set(c.0, c.1, Cell::Empty);
    }
    for &(c, cell) in &moved {
        let t = step(c, d, 1);
        next.set(t.0, t.1, cell);
    }
    Ok((next, ejected))
}

#[cfg(test)]
mod tests {
    use super::Direction::*;
    use super::*;
    use crate::board::{Cell, RADIUS};

    type P = (i32, i32);

    fn board(black: &[P], white: &[P]) -> Board {
        let mut b = Board::empty();
        for &(q, r) in black {
            b.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            b.set(q, r, Cell::White);
        }
        b
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    fn cells_of(b: &Board, cell: Cell) -> Vec<P> {
        let mut v = Vec::new();
        for q in -RADIUS..=RADIUS {
            for r in -RADIUS..=RADIUS {
                if b.get(q, r) == Some(cell) {
                    v.push((q, r));
                }
            }
        }
        v.sort();
        v
    }

    /// Plays Black's move, expects success, returns (black cells, white cells, ejected).
    fn play(black: &[P], white: &[P], m: Move) -> (Vec<P>, Vec<P>, bool) {
        let (b, ejected) = apply(&board(black, white), Player::Black, &m).unwrap();
        (
            cells_of(&b, Cell::Black),
            cells_of(&b, Cell::White),
            ejected,
        )
    }

    fn refused(black: &[P], white: &[P], m: Move) -> MoveError {
        apply(&board(black, white), Player::Black, &m).unwrap_err()
    }

    // Example 1
    #[test]
    fn ex01_single_marble_se() {
        let (b, w, e) = play(&[(0, 0)], &[(4, -4)], mv(&[(0, 0)], SE));
        assert_eq!((b, w, e), (vec![(0, 1)], vec![(4, -4)], false));
    }

    // Example 2
    #[test]
    fn ex02_single_marble_ne() {
        let (b, _, e) = play(&[(0, 0)], &[(4, -4)], mv(&[(0, 0)], NE));
        assert_eq!((b, e), (vec![(1, -1)], false));
    }

    // Example 3
    #[test]
    fn ex03_inline_pair_east() {
        let (b, _, e) = play(&[(-1, 2), (0, 2)], &[(4, -4)], mv(&[(-1, 2), (0, 2)], E));
        assert_eq!((b, e), (vec![(0, 2), (1, 2)], false));
    }

    // Example 4
    #[test]
    fn ex04_inline_trio_east() {
        let g = [(-2, 2), (-1, 2), (0, 2)];
        let (b, _, e) = play(&g, &[(4, -4)], mv(&g, E));
        assert_eq!((b, e), (vec![(-1, 2), (0, 2), (1, 2)], false));
    }

    // Example 5
    #[test]
    fn ex05_broadside_pair_se() {
        let g = [(-1, 2), (0, 2)];
        let (b, _, e) = play(&g, &[(4, -4)], mv(&g, SE));
        assert_eq!((b, e), (vec![(-1, 3), (0, 3)], false));
    }

    // Example 6
    #[test]
    fn ex06_broadside_onto_own_marble_is_illegal() {
        let err = refused(
            &[(-1, 2), (0, 2), (0, 3)],
            &[(4, -4)],
            mv(&[(-1, 2), (0, 2)], SE),
        );
        assert_eq!(err, MoveError::Blocked);
    }

    // Example 7
    #[test]
    fn ex07_broadside_onto_opponent_is_illegal() {
        let err = refused(&[(-1, 2), (0, 2)], &[(0, 3)], mv(&[(-1, 2), (0, 2)], SE));
        assert_eq!(err, MoveError::Blocked);
    }

    // Example 8
    #[test]
    fn ex08_broadside_off_board_is_illegal() {
        let err = refused(&[(0, -4), (1, -4)], &[(4, -4)], mv(&[(0, -4), (1, -4)], NW));
        assert_eq!(err, MoveError::OffBoard);
    }

    // Example 9
    #[test]
    fn ex09_four_in_a_line_is_refused() {
        let g = [(-4, 1), (-3, 1), (-2, 1), (-1, 1)];
        assert_eq!(
            refused(&g, &[(4, -4)], mv(&g, E)),
            MoveError::TooManyMarbles
        );
    }

    // Example 10
    #[test]
    fn ex10_triangle_is_refused() {
        let g = [(0, 0), (1, 0), (0, 1)];
        assert_eq!(refused(&g, &[(4, -4)], mv(&g, E)), MoveError::NotALine);
    }

    // Example 11
    #[test]
    fn ex11_gap_is_refused() {
        let g = [(-1, 2), (1, 2)];
        assert_eq!(refused(&g, &[(4, -4)], mv(&g, E)), MoveError::NotALine);
    }

    // Example 12
    #[test]
    fn ex12_inline_off_board_is_illegal() {
        let err = refused(&[(4, 0)], &[(-4, 4)], mv(&[(4, 0)], E));
        assert_eq!(err, MoveError::OffBoard);
    }

    // Example 13
    #[test]
    fn ex13_push_1v1_is_illegal() {
        let err = refused(&[(0, 0)], &[(1, 0)], mv(&[(0, 0)], E));
        assert_eq!(err, MoveError::NotStrongEnough);
    }

    // Example 14
    #[test]
    fn ex14_push_2v2_is_illegal() {
        let g = [(0, 0), (1, 0)];
        let err = refused(&g, &[(2, 0), (3, 0)], mv(&g, E));
        assert_eq!(err, MoveError::NotStrongEnough);
    }

    // Example 15
    #[test]
    fn ex15_push_2v1_into_empty_cell() {
        let g = [(0, 0), (1, 0)];
        let (b, w, e) = play(&g, &[(2, 0)], mv(&g, E));
        assert_eq!((b, w, e), (vec![(1, 0), (2, 0)], vec![(3, 0)], false));
    }

    // Example 16
    #[test]
    fn ex16_push_3v2_into_empty_cell() {
        let g = [(-1, 0), (0, 0), (1, 0)];
        let (b, w, e) = play(&g, &[(2, 0), (3, 0)], mv(&g, E));
        assert_eq!(
            (b, w, e),
            (vec![(0, 0), (1, 0), (2, 0)], vec![(3, 0), (4, 0)], false)
        );
    }

    // Example 17
    #[test]
    fn ex17_push_3v2_ejects_at_the_rim() {
        let g = [(0, 0), (1, 0), (2, 0)];
        let (b, w, e) = play(&g, &[(3, 0), (4, 0)], mv(&g, E));
        assert_eq!(
            (b, w, e),
            (vec![(1, 0), (2, 0), (3, 0)], vec![(4, 0)], true)
        );
    }

    // Example 18 (and example 30, ejected flag)
    #[test]
    fn ex18_push_2v1_ejects_at_the_rim() {
        let g = [(2, 0), (3, 0)];
        let (b, w, e) = play(&g, &[(4, 0)], mv(&g, E));
        assert_eq!((b, w, e), (vec![(3, 0), (4, 0)], vec![], true));
    }

    // Example 19
    #[test]
    fn ex19_push_blocked_by_own_marble_behind() {
        let err = refused(
            &[(0, 0), (1, 0), (3, 0)],
            &[(2, 0)],
            mv(&[(0, 0), (1, 0)], E),
        );
        assert_eq!(err, MoveError::PushBlocked);
    }

    // Example 20
    #[test]
    fn ex20_push_along_ne() {
        let g = [(0, 0), (1, -1)];
        let (b, w, e) = play(&g, &[(2, -2)], mv(&g, NE));
        assert_eq!((b, w, e), (vec![(1, -1), (2, -2)], vec![(3, -3)], false));
    }

    // Example 21
    #[test]
    fn ex21_far_own_marble_does_not_block() {
        let g = [(-1, 0), (0, 0), (1, 0)];
        let (b, w, e) = play(&[(-1, 0), (0, 0), (1, 0), (4, 0)], &[(2, 0)], mv(&g, E));
        assert_eq!(
            (b, w, e),
            (vec![(0, 0), (1, 0), (2, 0), (4, 0)], vec![(3, 0)], false)
        );
    }

    // Example 22
    #[test]
    fn ex22_plain_move_next_to_opponent() {
        let g = [(0, 0), (1, 0)];
        let (b, w, e) = play(&g, &[(3, 0)], mv(&g, E));
        assert_eq!((b, w, e), (vec![(1, 0), (2, 0)], vec![(3, 0)], false));
    }

    // Section 5: 3v1 and 3v3
    #[test]
    fn push_3v1_into_empty_cell() {
        let g = [(-1, 0), (0, 0), (1, 0)];
        let (b, w, e) = play(&g, &[(2, 0)], mv(&g, E));
        assert_eq!(
            (b, w, e),
            (vec![(0, 0), (1, 0), (2, 0)], vec![(3, 0)], false)
        );
    }

    #[test]
    fn push_3v3_is_illegal() {
        let g = [(-2, 0), (-1, 0), (0, 0)];
        let err = refused(&g, &[(1, 0), (2, 0), (3, 0)], mv(&g, E));
        assert_eq!(err, MoveError::NotStrongEnough);
    }

    // Section 5: 3v2 blocked by own marble behind the run
    #[test]
    fn push_3v2_blocked_by_own_marble() {
        let g = [(-2, 0), (-1, 0), (0, 0)];
        let err = refused(
            &[(-2, 0), (-1, 0), (0, 0), (3, 0)],
            &[(1, 0), (2, 0)],
            mv(&g, E),
        );
        assert_eq!(err, MoveError::PushBlocked);
    }

    // Section 4.1: leading cell is an own marble
    #[test]
    fn inline_into_own_marble_is_illegal() {
        let err = refused(
            &[(0, 0), (1, 0), (2, 0)],
            &[(4, -4)],
            mv(&[(0, 0), (1, 0)], E),
        );
        assert_eq!(err, MoveError::Blocked);
    }

    // Inline in the negative axis direction: the front marble is the first one
    #[test]
    fn inline_pair_west() {
        let g = [(0, 0), (1, 0)];
        let (b, _, e) = play(&g, &[(4, -4)], mv(&g, W));
        assert_eq!((b, e), (vec![(-1, 0), (0, 0)], false));
    }

    #[test]
    fn push_2v1_west_ejects_at_the_rim() {
        let g = [(-3, 0), (-2, 0)];
        let (b, w, e) = play(&g, &[(-4, 0)], mv(&g, W));
        assert_eq!((b, w, e), (vec![(-4, 0), (-3, 0)], vec![], true));
    }

    // Selection order does not matter
    #[test]
    fn selection_order_does_not_matter() {
        let (b, _, _) = play(&[(0, 2), (-1, 2)], &[(4, -4)], mv(&[(0, 2), (-1, 2)], E));
        assert_eq!(b, vec![(0, 2), (1, 2)]);
    }

    // Section 3: only own marbles, 1 to 3
    #[test]
    fn selecting_an_opponent_marble_is_refused() {
        let err = refused(&[(0, 0)], &[(1, 0)], mv(&[(1, 0)], E));
        assert_eq!(err, MoveError::NotOwnMarble);
    }

    #[test]
    fn selecting_an_empty_cell_is_refused() {
        let err = refused(&[(0, 0)], &[(1, 0)], mv(&[(2, 2)], E));
        assert_eq!(err, MoveError::NotOwnMarble);
    }

    #[test]
    fn selecting_an_off_board_cell_is_refused() {
        let err = refused(&[(0, 0)], &[(1, 0)], mv(&[(5, 0)], E));
        assert_eq!(err, MoveError::NotOwnMarble);
    }

    #[test]
    fn empty_selection_is_refused() {
        let err = refused(&[(0, 0)], &[(1, 0)], mv(&[], E));
        assert_eq!(err, MoveError::EmptySelection);
    }

    #[test]
    fn duplicate_cell_is_refused() {
        let err = refused(&[(0, 0)], &[(4, -4)], mv(&[(0, 0), (0, 0)], E));
        assert_eq!(err, MoveError::NotALine);
    }

    // White plays with the same rules
    #[test]
    fn white_pushes_black() {
        let b = board(&[(-1, 0)], &[(1, 0), (0, 0)]);
        let m = mv(&[(0, 0), (1, 0)], W);
        let (nb, ejected) = apply(&b, Player::White, &m).unwrap();
        assert_eq!(cells_of(&nb, Cell::Black), vec![(-2, 0)]);
        assert_eq!(cells_of(&nb, Cell::White), vec![(-1, 0), (0, 0)]);
        assert!(!ejected);
    }

    #[test]
    fn white_cannot_move_black_marbles() {
        let b = board(&[(0, 0)], &[(4, -4)]);
        let err = apply(&b, Player::White, &mv(&[(0, 0)], E)).unwrap_err();
        assert_eq!(err, MoveError::NotOwnMarble);
    }

    #[test]
    fn apply_does_not_mutate_its_input() {
        let b = board(&[(0, 0)], &[(4, -4)]);
        let before = b.clone();
        apply(&b, Player::Black, &mv(&[(0, 0)], E)).unwrap();
        assert_eq!(b, before);
    }

    // legal_moves
    #[test]
    fn lone_marble_in_the_centre_has_6_moves() {
        let b = board(&[(0, 0)], &[]);
        assert_eq!(legal_moves(&b, Player::Black).len(), 6);
    }

    #[test]
    fn lone_marble_in_a_corner_has_3_moves() {
        let b = board(&[(4, -4)], &[]);
        assert_eq!(legal_moves(&b, Player::Black).len(), 3);
    }

    #[test]
    fn pair_in_the_centre_has_2_inline_and_4_broadside_moves_plus_singles() {
        // 2 singles x 5 free directions = 10 (each is blocked by the other), pair: 2 inline + 4 broadside
        let b = board(&[(0, 0), (1, 0)], &[]);
        let moves = legal_moves(&b, Player::Black);
        assert_eq!(moves.len(), 10 + 6);
        assert!(moves.contains(&mv(&[(0, 0), (1, 0)], E)));
        assert!(moves.contains(&mv(&[(0, 0), (1, 0)], W)));
        assert!(moves.contains(&mv(&[(0, 0), (1, 0)], NE)));
    }

    #[test]
    fn no_marbles_means_no_moves() {
        let b = board(&[], &[(0, 0)]);
        assert!(legal_moves(&b, Player::Black).is_empty());
    }

    #[test]
    fn legal_moves_include_a_sumito_push() {
        let b = board(&[(0, 0), (1, 0)], &[(2, 0)]);
        let moves = legal_moves(&b, Player::Black);
        assert!(moves.contains(&mv(&[(0, 0), (1, 0)], E)));
        assert!(!moves.contains(&mv(&[(1, 0)], E)));
    }

    #[test]
    fn legal_moves_for_white_use_white_marbles() {
        let b = board(&[(0, 0)], &[(2, 0)]);
        let moves = legal_moves(&b, Player::White);
        assert_eq!(moves.len(), 6);
        assert!(moves.iter().all(|m| m.cells == vec![(2, 0)]));
    }

    #[test]
    fn start_position_has_44_moves() {
        // Reference count for the standard Abalone start position.
        assert_eq!(legal_moves(&Board::standard(), Player::Black).len(), 44);
        assert_eq!(legal_moves(&Board::standard(), Player::White).len(), 44);
    }

    fn count(b: &Board, cell: Cell) -> usize {
        cells_of(b, cell).len()
    }

    #[test]
    fn every_generated_move_validates_and_conserves_marbles() {
        let positions = [
            Board::standard(),
            board(
                &[(0, 0), (1, 0), (2, 0), (-3, 2)],
                &[(3, 0), (4, 0), (0, 3)],
            ),
            board(&[(2, 0), (3, 0)], &[(4, 0)]),
            board(&[(-1, 0), (0, 0), (1, 0)], &[(2, 0), (3, 0), (-4, 4)]),
        ];
        for b in &positions {
            for player in [Player::Black, Player::White] {
                let (own, opp) = match player {
                    Player::Black => (Cell::Black, Cell::White),
                    Player::White => (Cell::White, Cell::Black),
                };
                let moves = legal_moves(b, player);
                assert_eq!(moves.len(), sorted_unique(&moves));
                for m in &moves {
                    let (nb, ejected) = apply(b, player, m).unwrap();
                    assert_eq!(count(&nb, own), count(b, own));
                    assert_eq!(count(&nb, opp), count(b, opp) - usize::from(ejected));
                }
            }
        }
    }

    fn sorted_unique(moves: &[Move]) -> usize {
        let mut seen: Vec<String> = moves.iter().map(|m| format!("{:?}", m)).collect();
        seen.sort();
        seen.dedup();
        seen.len()
    }
}
