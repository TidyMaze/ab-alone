//! Encounter framework: a game against a boss (docs/specs/game-design.md section 3.3,
//! docs/specs/rules.md section 10.3). Standard move and sumito rules stay unchanged; a boss only
//! adds phases, a tell and a rule hook on top. Everything is a pure function of the game and the
//! seed, so the same seed and the same player moves give the same boss moves.

pub mod echo;

use crate::board::{Board, Cell, RADIUS};
use crate::game::{Game, GameError, Outcome};
use crate::moves::{Move, Player};
use crate::search::{search, SearchResult};

/// `special(ply, phase)`: the special that fires at the end of ply number `ply` (1 is the first
/// ply of the game), as a tell id, or `None`.
pub type SpecialFn = fn(u32, usize) -> Option<u8>;

/// `hook(board, tell_id, seed)`: the board after the special `tell_id` fires. Pure: the same
/// arguments give the same board.
pub type HookFn = fn(&Board, u8, u64) -> Board;

/// A boss: data plus pure hook functions.
#[derive(Clone, Debug)]
pub struct BossDef {
    pub name: &'static str,
    /// Phase `n` starts when the boss has at most `phase_marbles[n - 1]` marbles, highest first.
    pub phase_marbles: Vec<u8>,
    pub special: SpecialFn,
    pub hook: HookFn,
    /// Positions the boss search may visit per move. Never a clock.
    pub node_budget: u32,
}

/// How a finished encounter ended, for the player.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PveResult {
    Won,
    Lost,
}

/// A game against a boss. The player is Black, the boss is White.
#[derive(Clone, Debug)]
pub struct Encounter {
    game: Game,
    boss: BossDef,
    seed: u64,
}

/// Marbles of `color` on `board`.
pub fn marbles(board: &Board, color: Cell) -> u8 {
    let mut n = 0;
    for q in -RADIUS..=RADIUS {
        for r in -RADIUS..=RADIUS {
            n += u8::from(board.get(q, r) == Some(color));
        }
    }
    n
}

fn no_special(_ply: u32, _phase: usize) -> Option<u8> {
    None
}

fn keep_board(board: &Board, _id: u8, _seed: u64) -> Board {
    board.clone()
}

/// Boss with no special rule and one phase change, to prove the framework.
pub fn trivial_boss() -> BossDef {
    BossDef {
        name: "Trivial",
        phase_marbles: vec![10],
        special: no_special,
        hook: keep_board,
        node_budget: 200,
    }
}

impl Encounter {
    pub fn new(game: Game, boss: BossDef, seed: u64) -> Self {
        Self { game, boss, seed }
    }

    pub fn game(&self) -> &Game {
        &self.game
    }

    /// Current phase, 0 at the start.
    pub fn phase(&self) -> usize {
        let left = marbles(self.game.board(), Cell::White);
        self.boss
            .phase_marbles
            .iter()
            .filter(|&&t| left <= t)
            .count()
    }

    /// The special that fires right after the next ply, visible one ply ahead.
    pub fn tell(&self) -> Option<u8> {
        if self.game.outcome().is_some() {
            return None;
        }
        (self.boss.special)(self.game.history().len() as u32 + 1, self.phase())
    }

    /// Plays `mv` for the side to move, then fires the hook when the tell announced it.
    pub fn play(&mut self, mv: &Move) -> Result<(), GameError> {
        let told = self.tell();
        self.game.play(mv)?;
        if let (Some(id), None) = (told, self.game.outcome()) {
            let ply = self.game.history().len() as u64;
            let seed = self.seed ^ ply.wrapping_mul(0x9E37_79B9_7F4A_7C15);
            let board = (self.boss.hook)(self.game.board(), id, seed);
            self.game.replace_board(board);
        }
        Ok(())
    }

    /// The boss search for its turn: node-limited by the boss budget, `None` on the player's turn
    /// or when the game is over.
    pub fn boss_search(&self) -> Option<SearchResult> {
        if self.game.to_move() != Player::White {
            return None;
        }
        search(&self.game, self.boss.node_budget)
    }

    /// `None` while the game runs. A draw is a loss for the player.
    pub fn result(&self) -> Option<PveResult> {
        self.game.outcome().map(|o| match o {
            Outcome::Win(Player::Black) => PveResult::Won,
            _ => PveResult::Lost,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::moves::Direction::{E, NE, SW, W};
    use crate::moves::{legal_moves, Direction, Player};

    type P = (i32, i32);

    fn cells_of(board: &Board, color: Cell) -> Vec<P> {
        let mut out = Vec::new();
        for q in -RADIUS..=RADIUS {
            for r in -RADIUS..=RADIUS {
                if board.get(q, r) == Some(color) {
                    out.push((q, r));
                }
            }
        }
        out
    }

    fn position(black: &[P], white: &[P], to_move: Player, ejected: [u8; 2]) -> Game {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        Game::from_position(board, to_move, ejected)
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    /// Removes the White marble picked by the seed.
    fn clear_white(board: &Board, _id: u8, seed: u64) -> Board {
        let whites = cells_of(board, Cell::White);
        let (q, r) = whites[(seed as usize) % whites.len()];
        let mut out = board.clone();
        out.set(q, r, Cell::Empty);
        out
    }

    /// Fires special 7 at the end of every third ply.
    fn every_third(ply: u32, _phase: usize) -> Option<u8> {
        ply.is_multiple_of(3).then_some(7)
    }

    fn every_ply(_ply: u32, _phase: usize) -> Option<u8> {
        Some(1)
    }

    fn boss(special: SpecialFn) -> BossDef {
        BossDef {
            name: "test",
            phase_marbles: vec![],
            special,
            hook: clear_white,
            node_budget: 200,
        }
    }

    fn step(enc: &mut Encounter) {
        let m = legal_moves(enc.game().board(), enc.game().to_move())[0].clone();
        enc.play(&m).unwrap();
    }

    fn white_count(enc: &Encounter) -> u8 {
        marbles(enc.game().board(), Cell::White)
    }

    #[test]
    fn marbles_counts_one_color() {
        let board = Board::standard();
        assert_eq!(marbles(&board, Cell::Black), 14);
        assert_eq!(marbles(&board, Cell::Empty), 33);
    }

    #[test]
    fn trivial_boss_has_one_phase_change_and_no_special() {
        let b = trivial_boss();
        assert_eq!(b.phase_marbles, vec![10]);
        assert_eq!((b.special)(1, 0), None);
        let board = Board::standard();
        assert_eq!((b.hook)(&board, 0, 0), board);
    }

    #[test]
    fn phase_changes_at_the_marble_count() {
        let game = position(&[(2, 0), (3, 0)], &[(4, 0), (-4, 4)], Player::Black, [0, 0]);
        let mut b = trivial_boss();
        b.phase_marbles = vec![1];
        let mut enc = Encounter::new(game, b, 0);
        assert_eq!(enc.phase(), 0);
        enc.play(&mv(&[(2, 0), (3, 0)], E)).unwrap();
        assert_eq!(white_count(&enc), 1);
        assert_eq!(enc.phase(), 1);
    }

    #[test]
    fn phase_stays_zero_above_the_threshold() {
        let enc = Encounter::new(Game::new(), trivial_boss(), 0);
        assert_eq!(enc.phase(), 0);
    }

    #[test]
    fn tell_is_set_one_ply_before_the_special_fires() {
        let mut enc = Encounter::new(Game::new(), boss(every_third), 0);
        let mut told = Vec::new();
        let mut fired = Vec::new();
        for _ in 0..6 {
            let before = white_count(&enc);
            told.push(enc.tell());
            step(&mut enc);
            fired.push(white_count(&enc) < before);
        }
        assert_eq!(
            told,
            vec![None, None, Some(7), None, None, Some(7)],
            "tell shows exactly one ply ahead"
        );
        assert_eq!(fired, vec![false, false, true, false, false, true]);
        assert_eq!(enc.game().outcome(), None);
    }

    #[test]
    fn hook_is_deterministic_for_the_same_seed() {
        let run = |seed| {
            let mut enc = Encounter::new(Game::new(), boss(every_third), seed);
            for _ in 0..6 {
                step(&mut enc);
            }
            enc.game().board().clone()
        };
        assert_eq!(run(5), run(5));
        let boards: Vec<Board> = (0..8).map(run).collect();
        assert!(
            boards.iter().any(|b| *b != boards[0]),
            "seed changes the hook"
        );
    }

    #[test]
    fn pve_draw_is_a_loss_for_the_player() {
        let game = position(&[(0, 0)], &[(4, -4)], Player::Black, [0, 0]);
        let mut enc = Encounter::new(game, trivial_boss(), 0);
        let cycle = [
            mv(&[(0, 0)], E),
            mv(&[(4, -4)], SW),
            mv(&[(1, 0)], W),
            mv(&[(3, -3)], NE),
        ];
        for m in cycle.iter().cycle().take(8) {
            assert_eq!(enc.result(), None);
            enc.play(m).unwrap();
        }
        assert_eq!(enc.game().outcome(), Some(crate::game::Outcome::Draw));
        assert_eq!(enc.result(), Some(PveResult::Lost));
    }

    #[test]
    fn player_win_is_a_win_and_ends_the_tell() {
        let game = position(&[(2, 0), (3, 0)], &[(4, 0), (-4, 4)], Player::Black, [5, 0]);
        let mut enc = Encounter::new(game, boss(every_ply), 0);
        assert_eq!(enc.tell(), Some(1));
        enc.play(&mv(&[(2, 0), (3, 0)], E)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Won));
        assert_eq!(enc.tell(), None);
        assert_eq!(white_count(&enc), 1, "no hook after the game ended");
        assert!(enc.boss_search().is_none());
    }

    #[test]
    fn boss_win_is_a_loss() {
        let game = position(
            &[(-4, 0), (3, 3)],
            &[(-2, 0), (-3, 0)],
            Player::White,
            [0, 5],
        );
        let mut enc = Encounter::new(game, trivial_boss(), 0);
        enc.play(&mv(&[(-2, 0), (-3, 0)], W)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Lost));
    }

    #[test]
    fn refused_move_changes_nothing() {
        let mut enc = Encounter::new(Game::new(), boss(every_ply), 0);
        let bad = mv(&[(0, 0)], E);
        assert!(enc.play(&bad).is_err());
        assert_eq!(enc.game().history().len(), 0);
        assert_eq!(white_count(&enc), 14);
    }

    #[test]
    fn boss_move_is_legal_and_uses_the_node_budget() {
        for budget in [30, 300] {
            let mut b = trivial_boss();
            b.node_budget = budget;
            let mut enc = Encounter::new(Game::new(), b, 0);
            assert!(enc.boss_search().is_none(), "player's turn");
            step(&mut enc);
            let found = enc.boss_search().unwrap();
            assert!(found.nodes > 0 && found.nodes <= budget);
            let legal = legal_moves(enc.game().board(), Player::White);
            assert!(legal.contains(&found.mv));
            assert_eq!(enc.boss_search(), Some(found), "same position, same move");
        }
    }
}
