//! Game state: turn order, ejected counts, win and draw rules (docs/specs/rules.md sections 6, 7 and 9).

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use crate::board::{Board, Cell, RADIUS};
use crate::moves::{apply, Move, MoveError, Player};

/// Ejections needed to win.
pub const WIN_EJECTIONS: u8 = 6;
/// Plies in a row with no ejection that make a draw.
pub const NO_EJECTION_PLY_LIMIT: u32 = 100;
/// Occurrences of one position that make a draw.
pub const REPETITION_LIMIT: usize = 3;

/// How a finished game ended.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Win(Player),
    Draw,
}

/// Why `Game::play` refused a move.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GameError {
    GameOver,
    Move(MoveError),
}

/// A move played, with the hash of the position it produced.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Played {
    pub mv: Move,
    pub hash: u64,
}

/// A game in progress or finished.
#[derive(Clone, Debug)]
pub struct Game {
    board: Board,
    to_move: Player,
    ejected: [u8; 2],
    no_ejection_plies: u32,
    start_hash: u64,
    history: Vec<Played>,
    outcome: Option<Outcome>,
}

fn index(player: Player) -> usize {
    match player {
        Player::Black => 0,
        Player::White => 1,
    }
}

fn other(player: Player) -> Player {
    match player {
        Player::Black => Player::White,
        Player::White => Player::Black,
    }
}

fn code(cell: Cell) -> u8 {
    match cell {
        Cell::Empty => 0,
        Cell::Black => 1,
        Cell::White => 2,
    }
}

/// Hash of a position: board and side to move.
fn position_hash(board: &Board, to_move: Player) -> u64 {
    let mut hasher = DefaultHasher::new();
    for q in -RADIUS..=RADIUS {
        for r in -RADIUS..=RADIUS {
            board.get(q, r).map(code).hash(&mut hasher);
        }
    }
    index(to_move).hash(&mut hasher);
    hasher.finish()
}

impl Game {
    /// Standard layout, Black to move.
    pub fn new() -> Self {
        let board = Board::standard();
        Self {
            start_hash: position_hash(&board, Player::Black),
            board,
            to_move: Player::Black,
            ejected: [0, 0],
            no_ejection_plies: 0,
            history: Vec::new(),
            outcome: None,
        }
    }

    /// Game on a hand-made position, for tests of other modules.
    #[cfg(test)]
    pub(crate) fn from_position(board: Board, to_move: Player, ejected: [u8; 2]) -> Self {
        let outcome = [Player::Black, Player::White]
            .into_iter()
            .find(|&p| ejected[index(p)] >= WIN_EJECTIONS)
            .map(Outcome::Win);
        Self {
            start_hash: position_hash(&board, to_move),
            board,
            to_move,
            ejected,
            no_ejection_plies: 0,
            history: Vec::new(),
            outcome,
        }
    }

    pub fn board(&self) -> &Board {
        &self.board
    }

    pub fn to_move(&self) -> Player {
        self.to_move
    }

    /// Opponent marbles `player` has ejected.
    pub fn ejected(&self, player: Player) -> u8 {
        self.ejected[index(player)]
    }

    pub fn history(&self) -> &[Played] {
        &self.history
    }

    /// Plies since the last ejection.
    pub fn no_ejection_plies(&self) -> u32 {
        self.no_ejection_plies
    }

    pub fn outcome(&self) -> Option<Outcome> {
        self.outcome
    }

    /// The winner, or `None` while the game runs or after a draw.
    pub fn winner(&self) -> Option<Player> {
        match self.outcome {
            Some(Outcome::Win(player)) => Some(player),
            _ => None,
        }
    }

    /// Plays `mv` for the side to move.
    pub fn play(&mut self, mv: &Move) -> Result<(), GameError> {
        if self.outcome.is_some() {
            return Err(GameError::GameOver);
        }
        let mover = self.to_move;
        let (board, ejected) = apply(&self.board, mover, mv).map_err(GameError::Move)?;
        self.board = board;
        self.to_move = other(mover);
        if ejected {
            self.ejected[index(mover)] += 1;
            self.no_ejection_plies = 0;
        } else {
            self.no_ejection_plies += 1;
        }
        let hash = position_hash(&self.board, self.to_move);
        self.history.push(Played {
            mv: mv.clone(),
            hash,
        });
        let seen = self.history.iter().filter(|p| p.hash == hash).count()
            + usize::from(self.start_hash == hash);
        self.outcome = if self.ejected[index(mover)] >= WIN_EJECTIONS {
            Some(Outcome::Win(mover))
        } else if seen >= REPETITION_LIMIT || self.no_ejection_plies >= NO_EJECTION_PLY_LIMIT {
            Some(Outcome::Draw)
        } else {
            None
        };
        Ok(())
    }
}

impl Default for Game {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::Cell;
    use crate::moves::Direction::*;
    use crate::moves::{legal_moves, Direction};

    type P = (i32, i32);

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    /// Game on a hand-made position (rules.md section 12 examples).
    fn game_from(black: &[P], white: &[P], to_move: Player) -> Game {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        Game {
            start_hash: position_hash(&board, to_move),
            board,
            to_move,
            ejected: [0, 0],
            no_ejection_plies: 0,
            history: Vec::new(),
            outcome: None,
        }
    }

    /// Two lone marbles that can shuffle forever: example 26 setup.
    fn lone() -> Game {
        game_from(&[(0, 0)], &[(4, -4)], Player::Black)
    }

    /// Black pair next to a lone White marble on the rim: one push wins a marble (example 30).
    fn rim_push() -> (Game, Move) {
        (
            game_from(&[(2, 0), (3, 0)], &[(4, 0)], Player::Black),
            mv(&[(2, 0), (3, 0)], E),
        )
    }

    #[test]
    fn new_game_is_standard_layout_black_first() {
        let game = Game::new();
        assert_eq!(game.board(), &Board::standard());
        assert_eq!(game.to_move(), Player::Black);
        assert_eq!(game.ejected(Player::Black), 0);
        assert_eq!(game.ejected(Player::White), 0);
        assert_eq!(game.no_ejection_plies(), 0);
        assert!(game.history().is_empty());
        assert_eq!(game.outcome(), None);
        assert_eq!(game.winner(), None);
    }

    #[test]
    fn default_is_new() {
        assert_eq!(Game::default().board(), Game::new().board());
        assert_eq!(Game::default().to_move(), Player::Black);
    }

    #[test]
    fn first_move_is_played_by_black() {
        let mut game = Game::new();
        let first = legal_moves(game.board(), Player::Black)[0].clone();
        assert_eq!(game.play(&first), Ok(()));
        assert_eq!(game.history().len(), 1);
        assert_eq!(game.history()[0].mv, first);
        assert_ne!(game.board(), &Board::standard());
    }

    #[test]
    fn turn_alternates_after_each_move() {
        let mut game = lone();
        assert_eq!(game.play(&mv(&[(0, 0)], SE)), Ok(()));
        assert_eq!(game.to_move(), Player::White);
        assert_eq!(game.play(&mv(&[(4, -4)], W)), Ok(()));
        assert_eq!(game.to_move(), Player::Black);
        assert_eq!(game.board().get(0, 1), Some(Cell::Black));
        assert_eq!(game.board().get(3, -4), Some(Cell::White));
    }

    #[test]
    fn move_of_the_side_not_to_move_is_refused() {
        let mut game = Game::new();
        let white_marble = mv(&[(4, -4)], E);
        assert_eq!(
            game.play(&white_marble),
            Err(GameError::Move(MoveError::NotOwnMarble))
        );
        assert_eq!(game.to_move(), Player::Black);
        assert_eq!(game.board(), &Board::standard());
        assert!(game.history().is_empty());
    }

    #[test]
    fn illegal_move_changes_nothing() {
        let mut game = game_from(&[(4, 0)], &[(-4, 4)], Player::Black);
        let before = game.clone();
        assert_eq!(
            game.play(&mv(&[(4, 0)], E)),
            Err(GameError::Move(MoveError::OffBoard))
        );
        assert_eq!(game.board(), before.board());
        assert_eq!(game.to_move(), Player::Black);
        assert_eq!(game.no_ejection_plies(), 0);
        assert!(game.history().is_empty());
    }

    #[test]
    fn ejection_raises_the_mover_count() {
        let (mut game, push) = rim_push();
        assert_eq!(game.play(&push), Ok(()));
        assert_eq!(game.ejected(Player::Black), 1);
        assert_eq!(game.ejected(Player::White), 0);
        assert_eq!(game.outcome(), None);
    }

    #[test]
    fn white_ejection_raises_the_white_count() {
        let mut game = game_from(&[(-4, 0)], &[(-3, 0), (-2, 0)], Player::White);
        assert_eq!(game.play(&mv(&[(-3, 0), (-2, 0)], W)), Ok(()));
        assert_eq!(game.ejected(Player::White), 1);
        assert_eq!(game.ejected(Player::Black), 0);
    }

    #[test]
    fn sixth_ejection_wins_at_once() {
        let (mut game, push) = rim_push();
        game.ejected[0] = 5;
        assert_eq!(game.play(&push), Ok(()));
        assert_eq!(game.ejected(Player::Black), 6);
        assert_eq!(game.winner(), Some(Player::Black));
        assert_eq!(game.outcome(), Some(Outcome::Win(Player::Black)));
    }

    #[test]
    fn white_wins_at_six_ejections() {
        let mut game = game_from(&[(-4, 0)], &[(-3, 0), (-2, 0)], Player::White);
        game.ejected[1] = 5;
        assert_eq!(game.play(&mv(&[(-3, 0), (-2, 0)], W)), Ok(()));
        assert_eq!(game.winner(), Some(Player::White));
    }

    #[test]
    fn fifth_ejection_does_not_win() {
        let (mut game, push) = rim_push();
        game.ejected[0] = 4;
        assert_eq!(game.play(&push), Ok(()));
        assert_eq!(game.winner(), None);
        assert_eq!(game.outcome(), None);
    }

    #[test]
    fn play_is_refused_after_a_win() {
        let (mut game, push) = rim_push();
        game.ejected[0] = 5;
        assert_eq!(game.play(&push), Ok(()));
        let history = game.history().len();
        assert_eq!(game.play(&mv(&[(4, 0)], W)), Err(GameError::GameOver));
        assert_eq!(game.history().len(), history);
        assert_eq!(game.winner(), Some(Player::Black));
    }

    #[test]
    fn position_seen_twice_is_not_a_draw() {
        let mut game = lone();
        for m in [
            mv(&[(0, 0)], SE),
            mv(&[(4, -4)], W),
            mv(&[(0, 1)], NW),
            mv(&[(3, -4)], E),
        ] {
            assert_eq!(game.play(&m), Ok(()));
        }
        assert_eq!(game.outcome(), None);
        assert_eq!(game.play(&mv(&[(0, 0)], SE)), Ok(()));
    }

    #[test]
    fn threefold_repetition_is_a_draw() {
        let mut game = lone();
        let cycle = [
            mv(&[(0, 0)], SE),
            mv(&[(4, -4)], W),
            mv(&[(0, 1)], NW),
            mv(&[(3, -4)], E),
        ];
        for m in cycle.iter().chain(cycle.iter()) {
            assert_eq!(game.outcome(), None);
            assert_eq!(game.play(m), Ok(()));
        }
        assert_eq!(game.outcome(), Some(Outcome::Draw));
        assert_eq!(game.winner(), None);
        assert_eq!(game.draw_reason(), Some(DrawReason::Repetition));
        assert_eq!(game.play(&cycle[0]), Err(GameError::GameOver));
    }

    #[test]
    fn same_board_with_other_side_to_move_is_another_position() {
        let mut game = lone();
        assert_eq!(game.play(&mv(&[(0, 0)], SE)), Ok(()));
        assert_eq!(game.play(&mv(&[(4, -4)], W)), Ok(()));
        assert_eq!(game.play(&mv(&[(0, 1)], NW)), Ok(()));
        assert_ne!(
            position_hash(game.board(), Player::Black),
            position_hash(game.board(), Player::White)
        );
    }

    #[test]
    fn hundredth_ply_without_ejection_is_a_draw() {
        let mut game = lone();
        game.no_ejection_plies = 99;
        assert_eq!(game.play(&mv(&[(0, 0)], SE)), Ok(()));
        assert_eq!(game.no_ejection_plies(), 100);
        assert_eq!(game.outcome(), Some(Outcome::Draw));
        assert_eq!(game.draw_reason(), Some(DrawReason::NoEjectionCap));
        assert_eq!(game.play(&mv(&[(4, -4)], W)), Err(GameError::GameOver));
    }

    #[test]
    fn ninety_ninth_ply_without_ejection_goes_on() {
        let mut game = lone();
        game.no_ejection_plies = 98;
        assert_eq!(game.play(&mv(&[(0, 0)], SE)), Ok(()));
        assert_eq!(game.no_ejection_plies(), 99);
        assert_eq!(game.outcome(), None);
    }

    #[test]
    fn ejection_resets_the_no_ejection_counter() {
        let (mut game, push) = rim_push();
        game.no_ejection_plies = 99;
        assert_eq!(game.play(&push), Ok(()));
        assert_eq!(game.no_ejection_plies(), 0);
        assert_eq!(game.ejected(Player::Black), 1);
        assert_eq!(game.outcome(), None);
    }

    #[test]
    fn win_beats_draw_on_the_same_ply() {
        let (mut game, push) = rim_push();
        game.ejected[0] = 5;
        game.no_ejection_plies = 99;
        assert_eq!(game.play(&push), Ok(()));
        assert_eq!(game.outcome(), Some(Outcome::Win(Player::Black)));
        assert_eq!(game.draw_reason(), None);
    }
}
