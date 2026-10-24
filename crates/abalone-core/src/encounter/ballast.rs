//! The Ballast Mind (#47, docs/specs/game-design.md section 7.5): the final exam. A radius 5
//! board with six void pillars, 16 boss marbles against 14, and no rule code of its own. It
//! composes the hooks of the earlier bosses:
//!
//! - P1 (16 to 11 boss marbles): plain Abalone, search depth 5, no hook, no tell.
//! - P2 (10 to 6): the Hull rim crack at its P1 interval (`hull_boss` hook, tell `board.cracks()`)
//!   and the Chaplain conversion at threshold 3 (`chaplain_boss` hook, tell `chaplain_tell`).
//! - P3 (5 or fewer): P2 plus the Echo of the player's previous move (`mirror_move`, tell
//!   [`BallastTell::echo`]).

use crate::board::{Board, Cell, RADIUS};
use crate::encounter::chaplain::{chaplain_boss, CHAPLAIN_BOSS_END};
use crate::encounter::echo::mirror_move;
use crate::encounter::hull::hull_boss;
use crate::encounter::{BossDef, Encounter};
use crate::game::Game;
use crate::moves::{apply, Move, Player};

type P = (i32, i32);

/// Radius of the Ballast board: 91 cells before the pillars.
pub const BALLAST_RADIUS: i32 = 5;
const _: () = assert!(BALLAST_RADIUS <= RADIUS);
/// The six void pillars: one cell on each of the six sides of the centre ring (radius 2), the
/// orbit of `(1, 1)` under the 60 degree rotation `(q, r) -> (-r, q + r)`. Symmetric under the
/// point reflection of the Echo and the rotation.
pub const BALLAST_PILLARS: [P; 6] = [(1, 1), (-1, 2), (-2, 1), (-1, -1), (1, -2), (2, -1)];
/// Player start, Black at the bottom: four cells of row 5, seven of row 4, three of row 3.
pub const BALLAST_PLAYER_START: [P; 14] = [
    (-4, 5),
    (-3, 5),
    (-2, 5),
    (-1, 5),
    (-5, 4),
    (-4, 4),
    (-3, 4),
    (-2, 4),
    (-1, 4),
    (0, 4),
    (1, 4),
    (-3, 3),
    (-2, 3),
    (-1, 3),
];
/// Boss start, White at the top: the point reflection of the player start plus the reflections
/// of the two back-row corners the player does not have, `(-5, 5)` and `(0, 5)`: 16 marbles.
pub const BALLAST_BOSS_START: [P; 16] = [
    (5, -5),
    (4, -5),
    (3, -5),
    (2, -5),
    (1, -5),
    (0, -5),
    (5, -4),
    (4, -4),
    (3, -4),
    (2, -4),
    (1, -4),
    (0, -4),
    (-1, -4),
    (3, -3),
    (2, -3),
    (1, -3),
];
/// P2 and P3 start at this many boss marbles left. TUNE.
pub const BALLAST_PHASE_MARBLES: [u8; 2] = [10, 5];
/// Positions the boss search may visit per move. Measured on the start position (release build):
/// 40 000 nodes finish depth 4, 150 000 finish depth 5 (2.4 s native), 800 000 finish depth 6. TUNE.
pub const BALLAST_NODE_BUDGET: u32 = 150_000;
/// First phase (0 based) with the Hull crack and the Chaplain conversion.
pub const BALLAST_RIM_PHASE: usize = 1;
/// First phase (0 based) where the boss echoes the player's previous move.
pub const BALLAST_ECHO_PHASE: usize = 2;
/// The Hull and Chaplain hooks run at their own first phase: interval 8, threshold 3, no extras.
pub const BALLAST_REUSED_PHASE: usize = 0;
/// Bits of a special id holding the Hull id, the Chaplain id sits above them.
pub const BALLAST_HULL_BITS: u32 = 2;

/// What the player can read about the next boss action, each part in the visual language of the
/// boss it comes from.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct BallastTell {
    /// Hull: cracked cells and the plies left before each vanishes.
    pub cracks: Vec<(P, u8)>,
    /// Chaplain: player marbles that flip at the end of the next boss turn if nothing moves.
    pub flips: Vec<P>,
    /// Echo: the move the boss mirrors on its next turn, when it has one.
    pub echo: Option<Move>,
}

/// Mask of the Hull id inside a packed special id.
const HULL_MASK: u8 = (1 << BALLAST_HULL_BITS) - 1;

/// The Ballast board with no marble: radius 5 with the six pillars void.
pub fn ballast_board() -> Board {
    let mut board = Board::with_radius(BALLAST_RADIUS);
    for (q, r) in BALLAST_PILLARS {
        board.void(q, r);
    }
    board
}

/// No special in P1. From P2 the Hull special and the Chaplain special of the same ply, packed
/// in one id (the Hull one in the low bits).
fn special(ply: u32, phase: usize) -> Option<u8> {
    if phase < BALLAST_RIM_PHASE {
        return None;
    }
    let at = |boss: &BossDef| (boss.special)(ply, BALLAST_REUSED_PHASE);
    at(&hull_boss())
        .zip(at(&chaplain_boss()))
        .map(|(hull, chaplain)| hull | (chaplain << BALLAST_HULL_BITS))
}

/// The Hull hook, then the Chaplain hook, each on its own half of the id.
fn hook(board: &Board, id: u8, seed: u64) -> Board {
    let cracked = (hull_boss().hook)(board, id & HULL_MASK, seed);
    (chaplain_boss().hook)(&cracked, id >> BALLAST_HULL_BITS, seed)
}

/// The Ballast Mind boss definition.
pub fn ballast_boss() -> BossDef {
    BossDef {
        name: "The Ballast Mind",
        phase_marbles: BALLAST_PHASE_MARBLES.to_vec(),
        special,
        hook,
        node_budget: BALLAST_NODE_BUDGET,
    }
}

/// A new encounter: the player is Black and moves first.
pub fn ballast_start(seed: u64) -> Encounter {
    let mut board = ballast_board();
    for (q, r) in BALLAST_PLAYER_START {
        board.set(q, r, Cell::Black);
    }
    for (q, r) in BALLAST_BOSS_START {
        board.set(q, r, Cell::White);
    }
    let game = Game::from_position(board, Player::Black, [0, 0]);
    Encounter::new(game, ballast_boss(), seed)
}

/// Player marbles the Chaplain flips at the end of the next boss turn if nothing moves, read off
/// the Chaplain hook itself at its own first phase.
fn flips(board: &Board) -> Vec<P> {
    let id = CHAPLAIN_BOSS_END + BALLAST_REUSED_PHASE as u8;
    let after = (chaplain_boss().hook)(board, id, 0);
    (-RADIUS..=RADIUS)
        .flat_map(|q| (-RADIUS..=RADIUS).map(move |r| (q, r)))
        .filter(|&(q, r)| {
            board.get(q, r) == Some(Cell::Black) && after.get(q, r) == Some(Cell::White)
        })
        .collect()
}

/// The mirror of the player move the boss echoes next: the one before the latest, as in the
/// Echo's P2. Known one ply early, on the player's turn too. `None` before P3 or too early.
fn echo_target(enc: &Encounter) -> Option<Move> {
    if enc.phase() < BALLAST_ECHO_PHASE {
        return None;
    }
    let game = enc.game();
    let back = if game.to_move() == Player::Black {
        2
    } else {
        3
    };
    let source = game.history().len().checked_sub(back)?;
    Some(mirror_move(&game.history()[source].mv))
}

/// What the player can read now, for the active phase.
pub fn ballast_tell(enc: &Encounter) -> BallastTell {
    let rim = enc.phase() >= BALLAST_RIM_PHASE;
    let board = enc.game().board();
    BallastTell {
        cracks: if rim {
            board.cracks().to_vec()
        } else {
            Vec::new()
        },
        flips: if rim { flips(board) } else { Vec::new() },
        echo: echo_target(enc),
    }
}

/// The boss reply: the mirror of the player's previous move in P3 when it is legal, else the
/// node-limited search. `None` on the player's turn or when the game is over.
pub fn ballast_move(enc: &Encounter) -> Option<Move> {
    let game = enc.game();
    if game.outcome().is_some() || game.to_move() != Player::White {
        return None;
    }
    echo_target(enc)
        .filter(|m| apply(game.board(), Player::White, m).is_ok())
        .or_else(|| enc.boss_search().map(|r| r.mv))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encounter::echo::mirror_move;
    use crate::encounter::{chaplain, hull, marbles};
    use crate::moves::Direction::{E, SE, W};
    use crate::moves::{apply, legal_moves, Direction};

    fn cells() -> impl Iterator<Item = P> {
        (-RADIUS..=RADIUS).flat_map(|q| (-RADIUS..=RADIUS).map(move |r| (q, r)))
    }

    fn count(board: &Board, color: Cell) -> usize {
        cells()
            .filter(|&(q, r)| board.get(q, r) == Some(color))
            .count()
    }

    fn on_board(board: &Board) -> usize {
        cells().filter(|&(q, r)| board.get(q, r).is_some()).count()
    }

    fn small_boss() -> BossDef {
        BossDef {
            node_budget: 300,
            ..ballast_boss()
        }
    }

    /// The start layout with the boss cut down to its first `boss_marbles` start cells, and a
    /// small search budget so tests stay fast.
    fn with_boss_marbles(boss_marbles: usize, seed: u64) -> Encounter {
        let mut board = ballast_start(seed).game().board().clone();
        for &(q, r) in BALLAST_BOSS_START.iter().skip(boss_marbles) {
            board.set(q, r, Cell::Empty);
        }
        let game = Game::from_position(board, Player::Black, [0, 0]);
        Encounter::new(game, small_boss(), seed)
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    #[test]
    fn board_is_radius_5_minus_six_pillars() {
        let board = ballast_board();
        assert_eq!(on_board(&board), 91 - 6);
        assert_eq!(board.get(5, 0), Some(Cell::Empty));
        assert_eq!(board.get(-5, 5), Some(Cell::Empty));
        assert_eq!(board.get(6, 0), None);
        assert_eq!(board.get(0, 0), Some(Cell::Empty));
        for (q, r) in BALLAST_PILLARS {
            assert_eq!(board.get(q, r), None, "pillar ({q}, {r})");
        }
    }

    #[test]
    fn pillars_are_symmetric_and_distinct() {
        for (q, r) in BALLAST_PILLARS {
            assert!(BALLAST_PILLARS.contains(&(-q, -r)), "point reflection");
            assert!(BALLAST_PILLARS.contains(&(-r, q + r)), "60 degree rotation");
            assert_eq!(q.abs().max(r.abs()).max((q + r).abs()), 2);
        }
        let mut sorted = BALLAST_PILLARS;
        sorted.sort();
        assert!(sorted.windows(2).all(|w| w[0] != w[1]));
    }

    #[test]
    fn start_has_16_boss_and_14_player_marbles() {
        let enc = ballast_start(0);
        let board = enc.game().board();
        assert_eq!(count(board, Cell::White), 16);
        assert_eq!(count(board, Cell::Black), 14);
        assert_eq!(marbles(board, Cell::White), 16);
        for (q, r) in BALLAST_PLAYER_START {
            assert_eq!(board.get(q, r), Some(Cell::Black));
        }
        for (q, r) in BALLAST_BOSS_START {
            assert_eq!(board.get(q, r), Some(Cell::White));
        }
        assert_eq!(enc.game().to_move(), Player::Black);
        assert_eq!(enc.phase(), 0);
    }

    #[test]
    fn boss_def_names_the_constants() {
        let boss = ballast_boss();
        assert_eq!(boss.name, "The Ballast Mind");
        assert_eq!(boss.phase_marbles, BALLAST_PHASE_MARBLES.to_vec());
        assert_eq!(boss.node_budget, BALLAST_NODE_BUDGET);
    }

    #[test]
    fn phase_switches_at_10_and_5_boss_marbles() {
        let phases: Vec<usize> = [16, 11, 10, 6, 5, 1]
            .into_iter()
            .map(|n| with_boss_marbles(n, 0).phase())
            .collect();
        assert_eq!(phases, vec![0, 0, 1, 1, 2, 2]);
    }

    #[test]
    fn phase_1_fires_no_hook() {
        let boss = ballast_boss();
        assert!((1..=24).all(|ply| (boss.special)(ply, 0).is_none()));
    }

    #[test]
    fn phase_2_runs_the_hull_crack_and_the_chaplain_flip() {
        let boss = ballast_boss();
        // Ply 8 is a Hull wave and the end of a boss turn.
        let id = (boss.special)(8, 1).unwrap();
        let mut board = ballast_board();
        board.set(0, 0, Cell::Black);
        for (q, r) in [(1, 0), (-1, 0), (0, 1)] {
            board.set(q, r, Cell::White);
        }
        let out = (boss.hook)(&board, id, 7);
        assert_eq!(out.cracks().len(), 1, "one Hull crack");
        assert_eq!(out.get(0, 0), Some(Cell::White), "Chaplain flips (0, 0)");
        assert_eq!(out.converted(), &[(0, 0)]);
        // Ply 1 is the end of the player turn: a Hull tick (no new crack) and the restore.
        let tick = (boss.special)(1, 1).unwrap();
        assert!((boss.hook)(&ballast_board(), tick, 7).cracks().is_empty());
        // The ids are the reused bosses' own, packed.
        let hull_id = (hull::hull_boss().special)(8, 0).unwrap();
        let chaplain_id = (chaplain::chaplain_boss().special)(8, 0).unwrap();
        assert_eq!(id, hull_id | (chaplain_id << BALLAST_HULL_BITS));
    }

    #[test]
    fn phase_3_keeps_the_hooks_of_phase_2() {
        let boss = ballast_boss();
        assert!((1..=24).all(|ply| (boss.special)(ply, 2) == (boss.special)(ply, 1)));
    }

    /// Black has three marbles low on the left, White up to six marbles in the top right corner.
    fn echo_scene(boss_marbles: usize) -> Encounter {
        let mut board = ballast_board();
        for (q, r) in [(-2, 3), (-2, 4), (-3, 4)] {
            board.set(q, r, Cell::Black);
        }
        let whites = [(2, -3), (2, -4), (3, -4), (3, -5), (4, -5), (5, -5)];
        for &(q, r) in whites.iter().take(boss_marbles) {
            board.set(q, r, Cell::White);
        }
        Encounter::new(
            Game::from_position(board, Player::Black, [0, 0]),
            small_boss(),
            3,
        )
    }

    /// Plays Black `m1`, a White move that leaves the mirror of `m1` legal, then a second Black
    /// move.
    fn play_three(enc: &mut Encounter, m1: &Move) {
        enc.play(m1).unwrap();
        enc.play(&mv(&[(4, -5)], SE)).unwrap();
        enc.play(&mv(&[(-1, 3)], E)).unwrap();
    }

    #[test]
    fn phase_3_echoes_the_previous_player_move() {
        let mut enc = echo_scene(5);
        assert_eq!(enc.phase(), 2);
        let m1 = mv(&[(-2, 3)], E);
        play_three(&mut enc, &m1);
        let reply = ballast_move(&enc).unwrap();
        assert_eq!(reply, mirror_move(&m1));
        assert!(apply(enc.game().board(), Player::White, &reply).is_ok());
    }

    #[test]
    fn phase_2_searches_instead_of_echoing() {
        let mut enc = echo_scene(6);
        assert_eq!(enc.phase(), 1);
        play_three(&mut enc, &mv(&[(-2, 3)], E));
        let reply = ballast_move(&enc).unwrap();
        assert_eq!(Some(reply), enc.boss_search().map(|r| r.mv));
    }

    #[test]
    fn boss_move_is_none_on_the_player_turn() {
        assert_eq!(ballast_move(&ballast_start(0)), None);
    }

    #[test]
    fn boss_move_is_none_when_the_game_is_over() {
        let mut board = ballast_board();
        board.set(0, 0, Cell::Black);
        board.set(5, -5, Cell::White);
        let game = Game::from_position(board, Player::White, [0, 6]);
        let enc = Encounter::new(game, small_boss(), 0);
        assert!(enc.game().outcome().is_some());
        assert_eq!(ballast_move(&enc), None);
    }

    #[test]
    fn echo_falls_back_to_search_without_a_previous_move() {
        let mut enc = echo_scene(5);
        enc.play(&mv(&[(-2, 3)], E)).unwrap();
        assert_eq!(ballast_move(&enc), enc.boss_search().map(|r| r.mv));
    }

    #[test]
    fn echo_falls_back_to_search_when_the_mirror_is_illegal() {
        let mut enc = echo_scene(5);
        let m1 = mv(&[(-2, 3)], E);
        enc.play(&m1).unwrap();
        // White fills (1, -3), the target of the mirror of `m1`.
        enc.play(&mv(&[(2, -3)], W)).unwrap();
        enc.play(&mv(&[(-1, 3)], E)).unwrap();
        let reply = ballast_move(&enc).unwrap();
        assert_ne!(reply, mirror_move(&m1));
        assert_eq!(Some(reply), enc.boss_search().map(|r| r.mv));
    }

    #[test]
    fn tell_is_empty_in_phase_1() {
        assert_eq!(ballast_tell(&ballast_start(0)), BallastTell::default());
    }

    #[test]
    fn tell_shows_cracks_and_flips_in_phase_2() {
        let mut board = ballast_board();
        board.set(0, 0, Cell::Black);
        for (q, r) in [
            (1, 0),
            (-1, 0),
            (0, 1),
            (5, -5),
            (4, -5),
            (3, -5),
            (2, -5),
            (1, -5),
        ] {
            board.set(q, r, Cell::White);
        }
        board.set_cracks(vec![((5, 0), 1)]);
        let game = Game::from_position(board, Player::Black, [0, 0]);
        let enc = Encounter::new(game, small_boss(), 0);
        assert_eq!(enc.phase(), 1);
        let tell = ballast_tell(&enc);
        assert_eq!(tell.cracks, vec![((5, 0), 1)]);
        assert_eq!(tell.flips, vec![(0, 0)]);
        assert_eq!(tell.echo, None);
    }

    #[test]
    fn tell_shows_the_echo_in_phase_3() {
        let mut enc = echo_scene(5);
        let m1 = mv(&[(-2, 3)], E);
        assert_eq!(ballast_tell(&enc).echo, None, "no previous move yet");
        play_three(&mut enc, &m1);
        // Boss to move: the echo it plays now.
        assert_eq!(ballast_tell(&enc).echo, Some(mirror_move(&m1)));
        enc.play(&ballast_move(&enc).unwrap()).unwrap();
        // Player to move: the echo the boss plays after the next player move is the move
        // before the latest one, here the second.
        let m2 = enc.game().history()[2].mv.clone();
        assert_eq!(ballast_tell(&enc).echo, Some(mirror_move(&m2)));
    }

    #[test]
    fn same_seed_gives_the_same_game() {
        let run = |seed| {
            let mut enc = with_boss_marbles(10, seed);
            for _ in 0..5 {
                let m = legal_moves(enc.game().board(), Player::Black)[0].clone();
                enc.play(&m).unwrap();
                let reply = ballast_move(&enc).unwrap();
                enc.play(&reply).unwrap();
            }
            (enc.game().board().clone(), enc.game().history().len())
        };
        assert_eq!(run(4), run(4));
        let boards: Vec<_> = (0..8).map(|s| run(s).0).collect();
        assert!(
            boards.iter().any(|b| *b != boards[0]),
            "seed changes the cracks"
        );
    }
}
