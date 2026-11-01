//! Game state: turn order, ejected counts, win and draw rules (docs/specs/rules.md sections 6, 7 and 9).

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use crate::board::{Board, Cell, PlaceError, Special};
use crate::encounter::marbles;
use crate::moves::{apply, legal_moves, Move, MoveError, Player};
use crate::run::credits;

/// Ejections needed to win, for both sides unless a boss changes it (the Choir, Decision #131).
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

/// Why a game ended in a draw.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DrawReason {
    Repetition,
    NoEjectionCap,
    /// Neither side has a legal move (rules.md section 7).
    Blocked,
}

/// Why `Game::play` refused a move.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GameError {
    GameOver,
    Move(MoveError),
    /// A hidden marble blocks the move (The Stalker): nothing changed, the marble is revealed.
    Hidden,
    /// The move is in the room out of turn (The Dual Room): nothing changed.
    OtherRoom,
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
    draw_reason: Option<DrawReason>,
    /// Ejections each side needs to win, Black then White.
    win: [u8; 2],
    /// The draw rules end the game: off for a fight with no draw (The Swarm).
    draws: bool,
    /// The side that wins in place of a draw by repetition or idle plies, if any (the Trainer).
    draw_to: Option<Player>,
    /// The side whose turn passed after the last ply: it had marbles but no legal move.
    passed: Option<Player>,
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

/// `0` empty, `1` Black, `2` White, then `3` to `6` for seats 3 to 6, in declaration order.
fn code(cell: Cell) -> u8 {
    cell as u8
}

/// Hash of a position: board and side to move.
fn position_hash(board: &Board, to_move: Player) -> u64 {
    let mut hasher = DefaultHasher::new();
    let radius = board.radius();
    for q in -radius..=radius {
        for r in -radius..=radius {
            board.get(q, r).map(code).hash(&mut hasher);
        }
    }
    index(to_move).hash(&mut hasher);
    if !board.cracks().is_empty() {
        board.cracks().hash(&mut hasher);
    }
    if !board.converted().is_empty() {
        board.converted().hash(&mut hasher);
    }
    if !board.eggs().is_empty() {
        board.eggs().hash(&mut hasher);
    }
    if !board.trains().is_empty() {
        board.trains().hash(&mut hasher);
    }
    if let Some(pulsar) = board.pulsar() {
        pulsar.hash(&mut hasher);
    }
    if let Some(belts) = board.belts() {
        belts.hash(&mut hasher);
    }
    if let Some(unstable) = board.unstable() {
        unstable.hash(&mut hasher);
    }
    if let Some(dual) = board.dual() {
        dual.hash(&mut hasher);
    }
    if !board.polarities().is_empty() {
        board.polarities().hash(&mut hasher);
    }
    if board.announce().is_some() {
        board.announce().hash(&mut hasher);
    }
    if !board.echoes().is_empty() {
        board.echoes().hash(&mut hasher);
    }
    if !board.specials().is_empty() {
        board.specials().hash(&mut hasher);
    }
    hasher.finish()
}

/// The side whose ejected count reached its threshold, if any.
fn won(ejected: [u8; 2], win: [u8; 2]) -> Option<Outcome> {
    [Player::Black, Player::White]
        .into_iter()
        .find(|&p| ejected[index(p)] >= win[index(p)])
        .map(Outcome::Win)
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
            draw_reason: None,
            win: [WIN_EJECTIONS; 2],
            draws: true,
            draw_to: None,
            passed: None,
        }
    }

    /// Game on a hand-made position: a boss start layout, or a test position.
    pub fn from_position(board: Board, to_move: Player, ejected: [u8; 2]) -> Self {
        let win = [WIN_EJECTIONS; 2];
        Self {
            start_hash: position_hash(&board, to_move),
            board,
            to_move,
            ejected,
            no_ejection_plies: 0,
            history: Vec::new(),
            outcome: won(ejected, win),
            draw_reason: None,
            win,
            draws: true,
            draw_to: None,
            passed: None,
        }
    }

    /// The same game won at `win` ejections, Black then White: a boss fight with its own rule.
    pub(crate) fn with_win(mut self, win: [u8; 2]) -> Self {
        self.win = win;
        self.outcome = won(self.ejected, win);
        self
    }

    /// The same game where no draw rule ends it, for a fight with no draw (The Swarm).
    pub(crate) fn without_draws(mut self) -> Self {
        self.draws = false;
        self
    }

    /// The same game where a draw by repetition or idle plies is a win for `side` (#1159); `draw_reason` still
    /// says it was one.
    pub(crate) fn with_draw_to(mut self, side: Player) -> Self {
        self.draw_to = Some(side);
        self
    }

    /// Makes the marble on `cell` a `kind` special marble, before the first move of a rogue-lite
    /// fight (docs/specs/roguelite.md section 5).
    pub fn place_special(&mut self, cell: (i32, i32), kind: Special) -> Result<(), PlaceError> {
        if !self.history.is_empty() {
            return Err(PlaceError::Started);
        }
        self.board.place_special(cell, kind)?;
        self.start_hash = position_hash(&self.board, self.to_move);
        Ok(())
    }

    /// The same game on `board`, for a search whose boards carry marks the fight keeps elsewhere.
    pub(crate) fn with_board(mut self, board: Board) -> Self {
        self.board = board;
        self
    }

    /// Ejections `player` needs to win.
    pub fn win_ejections(&self, player: Player) -> u8 {
        self.win[index(player)]
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

    /// Why the game is a draw, `None` otherwise.
    pub fn draw_reason(&self) -> Option<DrawReason> {
        self.draw_reason
    }

    /// The winner, or `None` while the game runs or after a draw.
    pub fn winner(&self) -> Option<Player> {
        match self.outcome {
            Some(Outcome::Win(player)) => Some(player),
            _ => None,
        }
    }

    /// Times the position after the side to move plays `mv` has been seen in this game, that
    /// occurrence included; 0 when `mv` is illegal. [`REPETITION_LIMIT`] ends the game in a draw.
    pub fn seen_after(&self, mv: &Move) -> usize {
        self.seen_then(mv, other(self.to_move))
    }

    /// [`Game::seen_after`] for `mv` played as a free bonus move: the same side moves again.
    pub fn seen_after_bonus(&self, mv: &Move) -> usize {
        self.seen_then(mv, self.to_move)
    }

    /// Times the position after `mv`, with `next` to move, would have been seen.
    fn seen_then(&self, mv: &Move, next: Player) -> usize {
        let Ok((board, _)) = apply(&self.board, self.to_move, mv) else {
            return 0;
        };
        1 + self.seen(position_hash(&board, next))
    }

    /// Replaces the board after a ply (a boss hook) and re-hashes that ply's position, so
    /// repetition sees the position the players actually face.
    pub(crate) fn replace_board(&mut self, board: Board) {
        self.board = board;
        let hash = position_hash(&self.board, self.to_move);
        self.history.last_mut().expect("called after a ply").hash = hash;
        if self.draws && self.outcome.is_none() && self.seen(hash) >= REPETITION_LIMIT {
            self.outcome = Some(Outcome::Draw);
            self.draw_reason = Some(DrawReason::Repetition);
        }
    }

    /// Times the position `hash` has been seen in this game, the start included.
    fn seen(&self, hash: u64) -> usize {
        self.history.iter().filter(|p| p.hash == hash).count()
            + usize::from(self.start_hash == hash)
    }

    /// The side whose turn passed after the last ply, because it had marbles but no legal move.
    pub fn passed(&self) -> Option<Player> {
        self.passed
    }

    /// The side to move has marbles but no legal move: it passes, the other side moves on the
    /// same board. When that side has no legal move either, the game ends in a draw, or the mode's
    /// own draw rule (rules.md section 7). A side with no marble left keeps its own rule.
    pub(crate) fn pass_when_blocked(&mut self) {
        let side = self.to_move;
        if self.outcome.is_some()
            || marbles(&self.board, side.cell()) == 0
            || !legal_moves(&self.board, side).is_empty()
        {
            return;
        }
        if legal_moves(&self.board, other(side)).is_empty() {
            self.end_blocked();
        } else {
            self.pass_turn();
        }
    }

    /// Both sides are blocked in turn: the game ends in a draw, or the mode's own draw rule.
    pub(crate) fn end_blocked(&mut self) {
        self.outcome = Some(self.draw_to.map_or(Outcome::Draw, Outcome::Win));
        self.draw_reason = Some(DrawReason::Blocked);
    }

    /// The side to move passes its turn, as it has no move.
    pub(crate) fn pass_turn(&mut self) {
        self.passed = Some(self.to_move);
        self.pass();
    }

    /// Gives the move back to the side that just played, for a rule that grants a free move.
    pub(crate) fn pass(&mut self) {
        self.to_move = other(self.to_move);
        let board = self.board.clone();
        self.replace_board(board);
    }

    /// Credits `n` ejections to `by` for marbles a boss hook removed (rules.md OPEN-13).
    pub(crate) fn credit(&mut self, by: Player, n: u8) {
        if n == 0 {
            return;
        }
        self.ejected[index(by)] += n;
        self.no_ejection_plies = 0;
        if self.ejected[index(by)] >= self.win[index(by)] {
            self.outcome.get_or_insert(Outcome::Win(by));
        }
    }

    /// Moves the credit of `by` by `gained` and `lost` conversions at once, never below 0 (The
    /// Chaplain's health).
    pub(crate) fn credit_conversions(&mut self, by: Player, gained: u8, lost: u8) {
        let i = index(by);
        self.ejected[i] = (self.ejected[i] + gained).saturating_sub(lost);
        if gained > 0 {
            self.no_ejection_plies = 0;
        }
        if self.ejected[i] >= self.win[i] {
            self.outcome.get_or_insert(Outcome::Win(by));
        }
    }

    /// Ends a running game with `winner`, for a boss rule that ends the fight (The Overseer's
    /// neurotoxin). A finished game keeps its outcome.
    pub(crate) fn end(&mut self, winner: Player) {
        self.outcome.get_or_insert(Outcome::Win(winner));
    }

    /// Plays `mv` for the side to move. The next side passes when it has no legal move.
    pub fn play(&mut self, mv: &Move) -> Result<(), GameError> {
        self.play_ply(mv)?;
        self.pass_when_blocked();
        Ok(())
    }

    /// Plays `mv` for the side to move, for a mode that changes the board after the ply and checks
    /// the pass itself.
    pub(crate) fn play_ply(&mut self, mv: &Move) -> Result<(), GameError> {
        self.play_then(mv, other(self.to_move))
    }

    /// Plays `mv` for the side to move, which then moves again: a free bonus move (The Echo).
    pub(crate) fn play_bonus(&mut self, mv: &Move) -> Result<(), GameError> {
        self.play_then(mv, self.to_move)
    }

    /// Plays `mv` for the side to move, then `next` is to move.
    fn play_then(&mut self, mv: &Move, next: Player) -> Result<(), GameError> {
        if self.outcome.is_some() {
            return Err(GameError::GameOver);
        }
        let mover = self.to_move;
        let (board, ejected) = apply(&self.board, mover, mv).map_err(GameError::Move)?;
        let [black, white] = credits(&self.board, mover, ejected, &board);
        self.board = board;
        self.to_move = next;
        self.passed = None;
        if ejected {
            self.ejected[0] += black;
            self.ejected[1] += white;
            self.no_ejection_plies = 0;
        } else {
            self.no_ejection_plies += 1;
        }
        let hash = position_hash(&self.board, self.to_move);
        self.history.push(Played {
            mv: mv.clone(),
            hash,
        });
        let repeated = self.seen(hash) >= REPETITION_LIMIT;
        let capped = self.no_ejection_plies >= NO_EJECTION_PLY_LIMIT;
        let rogue = self.board.rogue_lite();
        let foe = other(mover);
        let mut stalled = false;
        self.outcome = if self.ejected[index(mover)] >= self.win[index(mover)] {
            Some(Outcome::Win(mover))
        } else if rogue && self.ejected[index(foe)] >= self.win[index(foe)] {
            // A Spark's burst threw the pusher's own marbles off (docs/specs/roguelite.md).
            Some(Outcome::Win(foe))
        } else if self.draws && (repeated || capped) {
            stalled = true;
            Some(self.draw_to.map_or(Outcome::Draw, Outcome::Win))
        } else {
            None
        };
        self.draw_reason = match (stalled, repeated) {
            (false, _) => None,
            (true, true) => Some(DrawReason::Repetition),
            (true, false) => Some(DrawReason::NoEjectionCap),
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
    use crate::board::{Cell, Dual};
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
            draw_reason: None,
            win: [WIN_EJECTIONS; 2],
            draws: true,
            draw_to: None,
            passed: None,
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
    fn the_win_threshold_is_six_by_default_and_can_differ_per_side() {
        let game = Game::new();
        assert_eq!(game.win_ejections(Player::Black), WIN_EJECTIONS);
        assert_eq!(game.win_ejections(Player::White), WIN_EJECTIONS);
        let (game, push) = rim_push();
        let mut game = game.with_win([10, 6]);
        game.ejected[0] = 8;
        assert_eq!(game.play(&push), Ok(()));
        assert_eq!(game.ejected(Player::Black), 9);
        assert_eq!(game.outcome(), None, "9 of 10 is not a win");
        game.credit(Player::Black, 1);
        assert_eq!(game.outcome(), Some(Outcome::Win(Player::Black)));
        let lost = Game::from_position(Board::standard(), Player::Black, [0, 6]).with_win([10, 6]);
        assert_eq!(
            lost.outcome(),
            Some(Outcome::Win(Player::White)),
            "the other side still wins at 6"
        );
        let running =
            Game::from_position(Board::standard(), Player::Black, [6, 0]).with_win([10, 6]);
        assert_eq!(running.outcome(), None);
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
    fn a_replaced_board_that_repeats_a_position_a_third_time_is_a_draw() {
        let mut game = lone();
        let cycle = [
            mv(&[(0, 0)], SE),
            mv(&[(4, -4)], W),
            mv(&[(0, 1)], NW),
            mv(&[(3, -4)], E),
        ];
        game.play(&cycle[0]).unwrap();
        let twice = game.board().clone();
        for m in cycle[1..].iter().chain(&cycle[..2]) {
            game.play(m).unwrap();
        }
        game.play(&mv(&[(0, 1)], E)).unwrap();
        assert_eq!(game.outcome(), None);
        game.replace_board(twice);
        assert_eq!(game.outcome(), Some(Outcome::Draw), "the third time");
        assert_eq!(game.draw_reason(), Some(DrawReason::Repetition));
    }

    #[test]
    fn seen_after_counts_the_position_a_move_would_make() {
        let mut game = lone();
        let cycle = [
            mv(&[(0, 0)], SE),
            mv(&[(4, -4)], W),
            mv(&[(0, 1)], NW),
            mv(&[(3, -4)], E),
        ];
        assert_eq!(game.seen_after(&cycle[0]), 1, "a new position");
        assert_eq!(game.seen_after(&mv(&[(1, 1)], E)), 0, "an illegal move");
        for m in &cycle[..3] {
            game.play(m).unwrap();
        }
        assert_eq!(game.seen_after(&cycle[3]), 2, "the start position again");
        game.play(&cycle[3]).unwrap();
        assert_eq!(game.seen_after(&cycle[0]), 2, "the position after ply 1");
        assert_eq!(game.outcome(), None);
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
    fn a_draw_can_be_a_win_for_one_side() {
        let mut game = lone().with_draw_to(Player::Black);
        game.no_ejection_plies = 99;
        assert_eq!(game.play(&mv(&[(0, 0)], SE)), Ok(()));
        assert_eq!(game.outcome(), Some(Outcome::Win(Player::Black)));
        assert_eq!(game.draw_reason(), Some(DrawReason::NoEjectionCap)); // still says it was a draw
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
    fn a_game_without_draws_ignores_the_repetition_and_the_cap() {
        let mut game = lone().without_draws();
        let cycle = [
            mv(&[(0, 0)], SE),
            mv(&[(4, -4)], W),
            mv(&[(0, 1)], NW),
            mv(&[(3, -4)], E),
        ];
        for m in cycle.iter().chain(cycle.iter()).chain(cycle.iter()) {
            assert_eq!(game.play(m), Ok(()));
        }
        let board = game.board().clone();
        game.replace_board(board);
        assert_eq!(game.outcome(), None);
        game.no_ejection_plies = 99;
        assert_eq!(game.play(&cycle[0]), Ok(()));
        assert_eq!((game.outcome(), game.draw_reason()), (None, None));
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

    #[test]
    fn hook_credit_counts_toward_the_win_and_resets_the_ply_counter() {
        let mut game = lone();
        game.play(&mv(&[(0, 0)], E)).unwrap();
        assert_eq!(game.no_ejection_plies(), 1);
        game.credit(Player::Black, 2);
        assert_eq!(game.ejected(Player::Black), 2);
        assert_eq!(game.no_ejection_plies(), 0);
        assert_eq!(game.outcome(), None);
        game.credit(Player::Black, 4);
        assert_eq!(game.outcome(), Some(Outcome::Win(Player::Black)));
        game.credit(Player::White, 6);
        assert_eq!(
            game.outcome(),
            Some(Outcome::Win(Player::Black)),
            "first win stands"
        );
    }

    #[test]
    fn credit_of_zero_changes_nothing() {
        let mut game = lone();
        game.play(&mv(&[(0, 0)], E)).unwrap();
        game.credit(Player::White, 0);
        assert_eq!(game.ejected(Player::White), 0);
        assert_eq!(game.no_ejection_plies(), 1);
    }

    #[test]
    fn converted_marks_change_the_position_hash() {
        let plain = position_hash(&Board::empty(), Player::Black);
        let mut marked = Board::empty();
        marked.set_converted(vec![(1, 0)]);
        assert_ne!(position_hash(&marked, Player::Black), plain);
    }

    #[test]
    fn crack_marks_change_the_position_hash() {
        let plain = position_hash(&Board::empty(), Player::Black);
        let mut cracked = Board::empty();
        cracked.set_cracks(vec![((4, 0), 2)]);
        assert_ne!(position_hash(&cracked, Player::Black), plain);
    }

    #[test]
    fn egg_marks_change_the_position_hash() {
        let plain = position_hash(&Board::empty(), Player::Black);
        let mut laid = Board::empty();
        laid.set_eggs(vec![((1, 0), 4)]);
        assert_ne!(position_hash(&laid, Player::Black), plain);
        let mut older = Board::empty();
        older.set_eggs(vec![((1, 0), 3)]);
        assert_ne!(
            position_hash(&older, Player::Black),
            position_hash(&laid, Player::Black)
        );
    }

    #[test]
    fn train_marks_change_the_position_hash() {
        let plain = position_hash(&Board::empty(), Player::Black);
        let mut announced = Board::empty();
        announced.set_trains(vec![(26, 5)]);
        assert_ne!(position_hash(&announced, Player::Black), plain);
        let mut nearer = Board::empty();
        nearer.set_trains(vec![(26, 4)]);
        assert_ne!(
            position_hash(&nearer, Player::Black),
            position_hash(&announced, Player::Black)
        );
    }

    #[test]
    fn the_dual_room_state_changes_the_position_hash() {
        let plain = position_hash(&Board::empty(), Player::Black);
        let mut walled = Board::empty();
        walled.set_dual(Some(Dual::default()));
        assert_ne!(position_hash(&walled, Player::Black), plain);
        let mut coming = walled.clone();
        coming.set_dual(Some(Dual {
            coming: Some((Cell::White, (1, -1))),
            ..Dual::default()
        }));
        assert_ne!(
            position_hash(&coming, Player::Black),
            position_hash(&walled, Player::Black)
        );
        let mut north = walled.clone();
        north.set_dual(Some(Dual {
            turn: 2,
            ..Dual::default()
        }));
        assert_ne!(
            position_hash(&north, Player::Black),
            position_hash(&walled, Player::Black),
            "the room in turn"
        );
    }

    #[test]
    fn the_announce_changes_the_position_hash() {
        let plain = position_hash(&Board::empty(), Player::Black);
        let mut plus = Board::empty();
        plus.set_announce(Some((Some((1, 0)), 1)));
        assert_ne!(position_hash(&plus, Player::Black), plain);
        let mut minus = Board::empty();
        minus.set_announce(Some((Some((1, 0)), -1)));
        assert_ne!(
            position_hash(&minus, Player::Black),
            position_hash(&plus, Player::Black)
        );
    }

    #[test]
    fn polarities_change_the_position_hash() {
        let plain = position_hash(&Board::empty(), Player::Black);
        let mut plus = Board::empty();
        plus.set_polarities(vec![((1, 0), 1)]);
        assert_ne!(position_hash(&plus, Player::Black), plain);
        let mut minus = Board::empty();
        minus.set_polarities(vec![((1, 0), -1)]);
        assert_ne!(
            position_hash(&minus, Player::Black),
            position_hash(&plus, Player::Black)
        );
    }

    #[test]
    fn the_pulsar_mark_changes_the_position_hash() {
        let plain = position_hash(&Board::empty(), Player::Black);
        let mut charging = Board::empty();
        charging.set_pulsar(Some((4, 1)));
        assert_ne!(position_hash(&charging, Player::Black), plain);
        let mut later = Board::empty();
        later.set_pulsar(Some((4, 2)));
        assert_ne!(
            position_hash(&later, Player::Black),
            position_hash(&charging, Player::Black)
        );
    }

    #[test]
    fn the_belts_change_the_position_hash() {
        use crate::board::Belts;
        let belts = Belts {
            first: true,
            turns: 0,
            shift: [0; 3],
            strike: [None; 3],
        };
        let plain = position_hash(&Board::empty(), Player::Black);
        let mut running = Board::empty();
        running.set_belts(Some(belts));
        assert_ne!(position_hash(&running, Player::Black), plain);
        let mut later = Board::empty();
        later.set_belts(Some(Belts { turns: 1, ..belts }));
        assert_ne!(
            position_hash(&later, Player::Black),
            position_hash(&running, Player::Black)
        );
    }

    #[test]
    fn the_unstable_marks_change_the_position_hash() {
        let plain = position_hash(&Board::empty(), Player::Black);
        let mut charged = Board::empty();
        charged.set_unstable(Some(crate::board::Unstable::default()));
        assert_ne!(position_hash(&charged, Player::Black), plain);
        let mut more = Board::empty();
        more.set_unstable(Some(crate::board::Unstable {
            charges: vec![((1, 0), 1)],
            ..Default::default()
        }));
        assert_ne!(
            position_hash(&more, Player::Black),
            position_hash(&charged, Player::Black)
        );
    }

    #[test]
    fn seen_after_a_bonus_hashes_with_the_same_side_to_move() {
        let mut game = Game::new();
        let up = mv(&[(0, 2)], NW);
        let down = mv(&[(0, 1)], SE);
        assert_eq!(game.seen_after_bonus(&up), 1);
        game.play_bonus(&up).unwrap();
        assert_eq!(game.seen_after_bonus(&down), 2, "the start, Black to move");
        assert_eq!(
            game.seen_after(&down),
            1,
            "the start with White to move: never seen"
        );
        assert_eq!(game.seen_after_bonus(&mv(&[(0, 0)], E)), 0, "illegal");
    }

    #[test]
    fn the_echo_memory_changes_the_position_hash() {
        let plain = position_hash(&Board::empty(), Player::Black);
        let mut remembered = Board::empty();
        remembered.set_echoes(vec![(Player::Black, mv(&[(0, 2)], E))]);
        assert_ne!(position_hash(&remembered, Player::Black), plain);
        let mut other_move = Board::empty();
        other_move.set_echoes(vec![(Player::Black, mv(&[(0, 2)], W))]);
        assert_ne!(
            position_hash(&other_move, Player::Black),
            position_hash(&remembered, Player::Black)
        );
    }

    #[test]
    fn a_bonus_move_keeps_the_turn_and_counts_as_a_ply() {
        let mut game = lone();
        game.play_bonus(&mv(&[(0, 0)], E)).unwrap();
        assert_eq!(game.to_move(), Player::Black, "the mover plays again");
        assert_eq!(game.history().len(), 1);
        assert_eq!(
            game.no_ejection_plies(),
            1,
            "a bonus ply counts for the cap"
        );
        assert_eq!(
            game.history()[0].hash,
            position_hash(game.board(), Player::Black)
        );
        game.play(&mv(&[(1, 0)], E)).unwrap();
        assert_eq!(game.to_move(), Player::White);
        let (mut won, push) = rim_push();
        won.ejected = [5, 0];
        won.play_bonus(&push).unwrap();
        assert_eq!(won.outcome(), Some(Outcome::Win(Player::Black)));
        assert_eq!(won.play_bonus(&push), Err(GameError::GameOver));
    }

    /// White's lone marble in the corner: walled in once Black's (4,-2) steps to (4,-3).
    fn corner() -> Game {
        game_from(&[(3, -4), (3, -3), (4, -2)], &[(4, -4)], Player::Black)
    }

    #[test]
    fn a_side_with_marbles_but_no_legal_move_passes_its_turn() {
        let mut game = corner();
        game.play(&mv(&[(4, -2)], NW)).unwrap();
        assert!(legal_moves(game.board(), Player::White).is_empty());
        assert_eq!(game.to_move(), Player::Black, "White passed");
        assert_eq!(game.passed(), Some(Player::White));
        assert_eq!(game.outcome(), None);
        assert_eq!(game.history().len(), 1, "a pass is no ply");
        assert_eq!(
            game.history()[0].hash,
            position_hash(game.board(), Player::Black)
        );
        game.play(&mv(&[(4, -3)], SE)).unwrap();
        assert_eq!(game.to_move(), Player::White, "White can move again");
        assert_eq!(game.passed(), None, "the next ply clears the pass");
    }

    #[test]
    fn a_side_with_no_marble_left_does_not_pass() {
        let mut game = game_from(&[(0, 0)], &[], Player::Black);
        game.play(&mv(&[(0, 0)], E)).unwrap();
        assert_eq!(game.to_move(), Player::White);
        assert_eq!(game.passed(), None);
    }

    /// A line of four cells, the rest void: Black, White, Black, White. No side can move.
    fn jammed(draw_to: Option<Player>) -> Game {
        let mut game = game_from(&[(0, 0), (2, 0)], &[(1, 0), (3, 0)], Player::Black);
        for q in -4..=4 {
            for r in -4..=4 {
                if r != 0 || !(0..=3).contains(&q) {
                    game.board.void(q, r);
                }
            }
        }
        game.draw_to = draw_to;
        game
    }

    #[test]
    fn both_sides_blocked_end_the_game_in_a_draw() {
        let mut game = jammed(None);
        assert!(legal_moves(game.board(), Player::Black).is_empty());
        assert!(legal_moves(game.board(), Player::White).is_empty());
        game.pass_when_blocked();
        assert_eq!(game.outcome(), Some(Outcome::Draw));
        assert_eq!(game.draw_reason(), Some(DrawReason::Blocked));
        assert_eq!((game.to_move(), game.passed()), (Player::Black, None));
        let mut trainer = jammed(Some(Player::Black));
        trainer.pass_when_blocked();
        assert_eq!(
            trainer.outcome(),
            Some(Outcome::Win(Player::Black)),
            "the mode's own draw rule"
        );
        assert_eq!(trainer.draw_reason(), Some(DrawReason::Blocked));
    }

    #[test]
    fn pass_gives_the_move_back_and_rehashes_the_last_ply() {
        let mut game = lone();
        game.play(&mv(&[(0, 0)], E)).unwrap();
        let before = game.history()[0].hash;
        game.pass();
        assert_eq!(game.to_move(), Player::Black);
        assert_ne!(game.history()[0].hash, before);
        assert_eq!(
            game.history()[0].hash,
            position_hash(game.board(), Player::Black)
        );
        game.play(&mv(&[(1, 0)], E)).unwrap();
        assert_eq!(game.history().len(), 2);
    }
}
