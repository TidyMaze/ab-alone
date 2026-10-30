//! The Swarm (#795, docs/specs/game-design.md section 7.14): survive 30 turns of arriving waves.
//! The player starts with the standard layout minus its 3 marbles nearest the centre, the boss
//! with no marble. Each boss reply, the swarm marbles announced the turn before land on the
//! allowed rim cells (the rim with `r <= 0`), then the swarm plays one standard move, or passes
//! when it has none. The 6-ejection win is off for both sides: the player wins once the 30th boss
//! reply is done with a marble left, the boss when the player has none. No draw rule runs. Every
//! pick is splitmix64 of the fight seed and the ply.

use crate::board::{Board, Cell, STANDARD_BLACK};
use crate::encounter::hull::mix;
use crate::encounter::{marbles, ply_seed, PveResult};
use crate::game::{Game, GameError, Outcome};
use crate::moves::{legal_moves, Move, Player};
use crate::search::{search_phased, SearchResult, Weights, DEFAULT_WEIGHTS};

type P = (i32, i32);

/// Boss replies the player must outlast: the evac comes after the last one. TUNE.
pub const SWARM_TURNS: u32 = 30;
/// The first turn of P2 and of P3. TUNE.
pub const SWARM_PHASE_TURNS: [u32; 2] = [15, 25];
/// Swarm marbles that arrive each turn in P1, P2 and P3. TUNE.
pub const SWARM_ARRIVALS: [u8; 3] = [1, 2, 3];
/// Player marbles of the standard layout left out at the start, the nearest the centre. TUNE.
pub const SWARM_LEFT_OUT: usize = 3;
/// Positions the boss search may visit per move (the Choir's budget). TUNE.
pub const SWARM_NODE_BUDGET: u32 = 1500;
/// The swarm pushes toward the rim: ejections and the opponent's distance from the centre count
/// a lot, its own marbles keep coming. TUNE.
pub const SWARM_WEIGHTS: Weights = Weights {
    marbles: 100,
    ejected: 150,
    centre: 20,
    cohesion: 2,
    threat: 0,
    egg: 0,
};

/// Distance between two cells, in steps.
fn distance(a: P, b: P) -> i32 {
    todo!()
}

/// Phase of turn `turn` (1 based), 0 for P1.
fn phase(turn: u32) -> usize {
    todo!()
}

/// Swarm marbles that arrive on turn `turn` (1 based): none outside turns 1 to 30.
pub fn arrivals(turn: u32) -> u8 {
    todo!()
}

/// The rim cells a swarm marble may land on, in `q` then `r` order: the rim of the radius 4 board
/// with `r <= 0`, away from the player's start side.
pub fn allowed_rim() -> Vec<P> {
    todo!()
}

/// The empty allowed rim cells of `board`, in `q` then `r` order.
fn free_rim(board: &Board) -> Vec<P> {
    todo!()
}

/// The cells announced for `count` arrivals: distinct empty allowed rim cells picked by `seed`,
/// fewer when fewer are empty.
pub fn announce(board: &Board, seed: u64, count: u8) -> Vec<P> {
    todo!()
}

/// `board` after the marbles announced on `cells` land, in order, and the cells they landed on: a
/// taken cell sends its marble to the nearest empty allowed rim cell (the lowest `q`, then `r`, on a
/// tie), none left and it does not arrive.
pub fn land(board: &Board, cells: &[P]) -> (Board, Vec<P>) {
    todo!()
}

/// The start board: the player's standard layout minus its marbles nearest the centre, no swarm.
pub fn swarm_board() -> Board {
    todo!()
}

/// The step of the search tree: every player ply lands `count` marbles where the announce of the
/// board before it with `seed` puts them. Deeper plies reuse the seed and the count: the tree
/// knows one wave and expects the next ones near it.
pub fn swarm_step(
    seed: u64,
    count: u8,
) -> impl Fn(&Board, Player, &Move, Board, [u8; 2]) -> (Board, [u8; 2]) {
    move |_: &Board, _: Player, _: &Move, _: Board, _: [u8; 2]| -> (Board, [u8; 2]) {
        let _ = (seed, count);
        todo!()
    }
}

/// A move of the scripted turtle of the balance gate: it pushes nothing and moves no marble away
/// from the centre.
pub(crate) fn turtles(board: &Board, mv: &Move) -> bool {
    todo!()
}

/// The scripted turtle (balance gate, #795): a turtle move picked by `seed` and the move `index`,
/// any legal move when it has none, `None` with no move at all.
pub fn turtle_move(game: &Game, seed: u64, index: u32) -> Option<Move> {
    todo!()
}

/// A fight against the Swarm. The player is Black and moves first, the swarm is White.
#[derive(Clone, Debug)]
pub struct Swarm {
    game: Game,
    seed: u64,
    /// Boss replies done.
    turn: u32,
    /// The cells where the next boss reply's marbles arrive.
    announced: Vec<P>,
    /// The cells where the last boss reply's marbles arrived.
    landed: Vec<P>,
}

impl Swarm {
    /// The start: 11 player marbles, no swarm, the first wave announced.
    pub fn start(seed: u64) -> Self {
        todo!()
    }

    /// A fight resumed after `turn` boss replies, the player to move. It is lost once the swarm has
    /// ejected every player marble on the board, and no draw rule ends it.
    pub fn from_position(game: Game, seed: u64, turn: u32) -> Self {
        todo!()
    }

    pub fn game(&self) -> &Game {
        todo!()
    }

    /// Boss replies done.
    pub fn turn(&self) -> u32 {
        todo!()
    }

    /// Boss replies left before the evac.
    pub fn turns_left(&self) -> u32 {
        todo!()
    }

    /// Phase of the turn being played, 0 for P1.
    pub fn phase(&self) -> usize {
        todo!()
    }

    /// The cells where the next boss reply's marbles arrive, empty once the fight is over.
    pub fn announced(&self) -> &[P] {
        todo!()
    }

    /// The cells where the last boss reply's marbles arrived.
    pub fn landed(&self) -> &[P] {
        todo!()
    }

    /// `None` while the fight runs.
    pub fn result(&self) -> Option<PveResult> {
        todo!()
    }

    /// Plays `mv` for the side to move. After a player move the boss reply starts: the announced
    /// marbles land, and a swarm with no move passes. After a boss move the reply ends.
    pub fn play(&mut self, mv: &Move) -> Result<(), GameError> {
        todo!()
    }

    fn arrive(&mut self) {
        todo!()
    }

    /// The reply is done: the evac after the last one, else the next wave is announced.
    fn end_reply(&mut self) {
        todo!()
    }

    fn announce_next(&mut self) {
        todo!()
    }

    /// The boss move for its reply: its own weights, node-limited, and its tree lands the next
    /// wave where the announce after its move will put it. `None` on the player's turn or when the
    /// fight is over.
    pub fn boss_move(&self) -> Option<Move> {
        todo!()
    }

    /// The player search with `budget` nodes (the ladder, auto-play): its tree lands the announced
    /// wave and sees the evac after the last boss reply. `None` on the boss's turn or when the
    /// fight is over.
    pub fn player_search(
        &self,
        budget: u32,
        allow: &dyn Fn(&Move) -> bool,
    ) -> Option<SearchResult> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::MAX_RADIUS;
    use crate::moves::Direction::{self, E, SW, W};
    use crate::search::WIN;

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    fn cells_of(board: &Board, color: Cell) -> Vec<P> {
        let mut out = Vec::new();
        for q in -MAX_RADIUS..=MAX_RADIUS {
            for r in -MAX_RADIUS..=MAX_RADIUS {
                if board.get(q, r) == Some(color) {
                    out.push((q, r));
                }
            }
        }
        out
    }

    fn board(black: &[P], white: &[P]) -> Board {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        board
    }

    /// A fight after `turn` boss replies, the player to move.
    fn swarm(black: &[P], white: &[P], ejected: [u8; 2], turn: u32) -> Swarm {
        let game = Game::from_position(board(black, white), Player::Black, ejected);
        Swarm::from_position(game, 7, turn)
    }

    /// The boss reply: its search move, or nothing when it passed.
    fn reply(s: &mut Swarm) {
        if let Some(m) = s.boss_move() {
            s.play(&m).unwrap();
        }
    }

    #[test]
    fn the_arrivals_are_1_then_2_from_turn_15_then_3_from_turn_25() {
        let counts: Vec<u8> = [0, 1, 14, 15, 24, 25, 30, 31]
            .into_iter()
            .map(arrivals)
            .collect();
        assert_eq!(counts, [0, 1, 1, 2, 2, 3, 3, 0]);
        let phases: Vec<usize> = [1, 14, 15, 24, 25, 30].into_iter().map(phase).collect();
        assert_eq!(phases, [0, 0, 1, 1, 2, 2]);
        let total: u32 = (1..=SWARM_TURNS).map(|t| u32::from(arrivals(t))).sum();
        assert_eq!(total, 52);
    }

    #[test]
    fn the_allowed_rim_is_the_13_rim_cells_away_from_the_player_side() {
        let rim = allowed_rim();
        assert_eq!(rim.len(), 13);
        assert!(rim.iter().all(|&(q, r)| r <= 0 && distance((q, r), (0, 0)) == 4));
        let mut sorted = rim.clone();
        sorted.sort();
        assert_eq!(rim, sorted, "in q then r order");
    }

    #[test]
    fn the_player_starts_with_11_marbles_and_the_boss_with_none() {
        let s = Swarm::start(3);
        let black = cells_of(s.game().board(), Cell::Black);
        assert_eq!(black.len(), 11);
        assert!(black.iter().all(|&(_, r)| r >= 3), "the row r = 2 is gone");
        assert!(cells_of(s.game().board(), Cell::White).is_empty());
        assert_eq!((s.turn(), s.turns_left(), s.phase()), (0, 30, 0));
        assert_eq!(s.announced().len(), 1, "turn 1 is announced at the start");
        assert!(allowed_rim().contains(&s.announced()[0]));
        assert!(s.landed().is_empty());
        assert_eq!(s.result(), None);
    }

    #[test]
    fn no_marble_is_announced_or_lands_on_the_player_side_over_1000_seeds() {
        for seed in 0..1000 {
            let mut s = Swarm::start(seed);
            let announced = s.announced().to_vec();
            let first = legal_moves(s.game().board(), Player::Black)[0].clone();
            s.play(&first).unwrap();
            assert_eq!(s.landed(), announced, "seed {seed}: an empty cell lands as announced");
            let next = legal_moves(s.game().board(), Player::White)[0].clone();
            s.play(&next).unwrap();
            for &cell in s.landed().iter().chain(s.announced()) {
                assert!(allowed_rim().contains(&cell), "seed {seed}: {cell:?}");
            }
        }
    }

    #[test]
    fn a_taken_announced_cell_lands_on_the_nearest_empty_allowed_cell() {
        // (2, -4) taken: (1, -4) and (3, -4) are both 1 away, the lowest q wins.
        let b = board(&[(2, -4)], &[]);
        assert_eq!(land(&b, &[(2, -4)]).1, [(1, -4)]);
        // (4, -2) taken: (4, -3) and (4, -1) are both 1 away, same q, the lowest r wins.
        let b = board(&[(4, -2)], &[]);
        let (after, landed) = land(&b, &[(4, -2)]);
        assert_eq!(landed, [(4, -3)]);
        assert_eq!(after.get(4, -3), Some(Cell::White));
        // Two marbles on one taken cell: the second goes one further.
        let b = board(&[(2, -4)], &[]);
        assert_eq!(land(&b, &[(2, -4), (2, -4)]).1, [(1, -4), (3, -4)]);
    }

    #[test]
    fn with_no_empty_allowed_cell_no_marble_is_announced_or_lands() {
        let full = board(&allowed_rim(), &[]);
        assert_eq!(land(&full, &[(0, -4)]), (full.clone(), Vec::new()));
        assert!(announce(&full, 5, 3).is_empty());
        let mut one = full.clone();
        one.set(4, 0, Cell::Empty);
        assert_eq!(announce(&one, 5, 3), [(4, 0)], "only the free cell");
        let picks: Vec<_> = (0..20).map(|seed| announce(&Board::empty(), seed, 3)).collect();
        assert!(picks.iter().all(|p| p.len() == 3 && p[0] != p[1] && p[1] != p[2]));
        assert!(picks.windows(2).any(|w| w[0] != w[1]), "the seed picks the cells");
    }

    #[test]
    fn a_swarm_with_no_marble_passes_and_the_player_moves_again() {
        // The allowed rim is full of player marbles: nothing arrives, the swarm has no move.
        let mut black = allowed_rim();
        black.push((0, 0));
        let mut s = swarm(&black, &[], [0, 0], 0);
        assert!(s.announced().is_empty());
        assert_eq!(s.boss_move(), None, "the player's turn");
        s.play(&mv(&[(0, 0)], E)).unwrap();
        assert_eq!(s.game().to_move(), Player::Black);
        assert_eq!((s.turn(), s.result()), (1, None));
        assert!(s.landed().is_empty());
        assert_eq!(s.boss_move(), None);
    }

    #[test]
    fn the_fight_never_draws() {
        // The same pass position comes back again and again: no draw.
        let mut black = allowed_rim();
        black.push((0, 0));
        let mut s = swarm(&black, &[], [0, 0], 0);
        for i in 0..6 {
            let m = if i % 2 == 0 {
                mv(&[(0, 0)], E)
            } else {
                mv(&[(1, 0)], W)
            };
            s.play(&m).unwrap();
        }
        assert_eq!((s.turn(), s.result()), (6, None));
    }

    #[test]
    fn the_player_with_1_marble_after_the_30th_reply_wins() {
        let mut s = swarm(&[(0, 2)], &[], [0, 10], 29);
        assert_eq!(s.phase(), 2);
        s.play(&mv(&[(0, 2)], E)).unwrap();
        assert_eq!(s.landed().len(), 3, "turn 30 lands 3");
        assert_eq!(s.result(), None, "not before the 30th reply");
        reply(&mut s);
        assert_eq!((s.turn(), s.turns_left()), (30, 0));
        assert_eq!(s.result(), Some(PveResult::Won));
        assert!(s.announced().is_empty());
        // A pass on the 30th reply wins too.
        let mut black = allowed_rim();
        black.push((0, 0));
        let mut s = swarm(&black, &[], [0, 0], 29);
        s.play(&mv(&[(0, 0)], E)).unwrap();
        assert_eq!(s.result(), Some(PveResult::Won));
    }

    #[test]
    fn the_player_with_no_marble_left_on_turn_12_loses() {
        let mut s = swarm(&[(-4, 4)], &[(-1, 2), (-2, 3)], [0, 5], 11);
        s.play(&mv(&[(-4, 4)], E)).unwrap();
        s.play(&mv(&[(-1, 2), (-2, 3)], SW)).unwrap();
        assert_eq!(s.turn(), 12);
        assert_eq!(s.result(), Some(PveResult::Lost));
        assert!(s.announced().is_empty(), "nothing more arrives");
        assert!(s.play(&mv(&[(0, 0)], E)).is_err());
        let gone = swarm(&[], &[(0, 0)], [0, 11], 3);
        assert_eq!(gone.result(), Some(PveResult::Lost));
    }

    #[test]
    fn ejections_never_end_the_fight_before_the_last_player_marble() {
        // The player ejects a 6th swarm marble: nothing ends.
        let mut s = swarm(&[(2, 0), (3, 0)], &[(4, 0)], [5, 0], 4);
        s.play(&mv(&[(2, 0), (3, 0)], E)).unwrap();
        assert_eq!(s.game().ejected(Player::Black), 6);
        assert_eq!(s.result(), None);
        // The swarm ejects a 6th player marble, one is left: nothing ends.
        let mut s = swarm(&[(-4, 4), (2, -1)], &[(-1, 2), (-2, 3)], [0, 5], 4);
        s.play(&mv(&[(-4, 4)], E)).unwrap();
        s.play(&mv(&[(-1, 2), (-2, 3)], SW)).unwrap();
        assert_eq!(s.game().ejected(Player::White), 6);
        assert_eq!(s.result(), None);
    }

    #[test]
    fn the_same_seed_gives_the_same_waves() {
        let play = |seed: u64| {
            let mut s = Swarm::start(seed);
            let mut cells = Vec::new();
            for i in 0..4 {
                let m = turtle_move(s.game(), seed, i).unwrap();
                s.play(&m).unwrap();
                reply(&mut s);
                cells.push((s.landed().to_vec(), s.announced().to_vec()));
            }
            (cells, s.game().board().clone())
        };
        assert_eq!(play(11), play(11));
        assert_ne!(play(11).0, play(12).0);
    }

    #[test]
    fn the_search_lands_the_announced_wave_on_each_player_ply() {
        let step = swarm_step(9, 2);
        let before = Board::empty();
        let m = mv(&[(0, 0)], E);
        let (after, credits) = step(&before, Player::Black, &m, before.clone(), [0, 0]);
        assert_eq!(credits, [0, 0]);
        assert_eq!(cells_of(&after, Cell::White), {
            let mut c = announce(&before, 9, 2);
            c.sort();
            c
        });
        let (kept, _) = step(&before, Player::White, &m, before.clone(), [0, 0]);
        assert_eq!(kept, before);
    }

    #[test]
    fn the_player_search_sees_the_evac_and_the_boss_search_plays_the_swarm() {
        let s = swarm(&[(0, 2), (1, 2)], &[], [0, 0], 29);
        let read = s.player_search(400, &|_| true).unwrap();
        assert_eq!(read.score, WIN - 2, "the evac after the boss's last reply");
        let mut s = Swarm::start(4);
        let first = turtle_move(s.game(), 4, 0).unwrap();
        s.play(&first).unwrap();
        let reply = s.boss_move().unwrap();
        assert!(legal_moves(s.game().board(), Player::White).contains(&reply));
        assert_eq!(s.player_search(50, &|_| true), None, "the boss's turn");
    }

    #[test]
    fn the_turtle_never_pushes_and_never_moves_a_marble_outward() {
        let s = Swarm::start(2);
        for i in 0..20 {
            let m = turtle_move(s.game(), 2, i).unwrap();
            assert!(turtles(s.game().board(), &m), "{m:?}");
        }
        // Inward but a push: not a turtle move.
        let b = board(&[(0, 2), (0, 1)], &[(0, 0)]);
        assert!(!turtles(&b, &mv(&[(0, 2), (0, 1)], Direction::NW)));
        // A lone marble at the centre can only go outward: it plays a legal move anyway.
        let lone = Game::from_position(board(&[(0, 0)], &[]), Player::Black, [0, 0]);
        assert!(turtle_move(&lone, 0, 0).is_some());
        let none = Game::from_position(board(&[], &[(0, 0)]), Player::Black, [0, 0]);
        assert_eq!(turtle_move(&none, 0, 0), None);
    }
}
