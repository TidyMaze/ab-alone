//! Boss 4, The Echo (docs/specs/game-design.md section 7.4): after each player move it plays the
//! point-reflected move through the board center when that is legal, else its search picks.

use crate::board::Board;
use crate::encounter::{BossDef, Encounter};
use crate::moves::{apply, Direction, Move, Player};

/// P2 and P3 start after this many ejections credited to the player: notches only, the Echo
/// plays the same in every phase.
pub const ECHO_PHASE_EJECTIONS: [u8; 2] = [3, 5];
/// Positions the free-move search may visit. Starting value, to tune (calibration knob).
pub const ECHO_NODE_BUDGET: u32 = 400;

fn no_special(_ply: u32, _phase: usize) -> Option<u8> {
    None
}

fn keep_board(board: &Board, _id: u8, _seed: u64) -> Board {
    board.clone()
}

/// The Echo: no board special, its twist is the reply rule in [`echo_move`].
pub fn echo_boss() -> BossDef {
    BossDef {
        name: "The Echo",
        phase_marbles: Vec::new(),
        phase_ejections: ECHO_PHASE_EJECTIONS.to_vec(),
        special: no_special,
        hook: keep_board,
        node_budget: ECHO_NODE_BUDGET,
    }
}

fn opposite(dir: Direction) -> Direction {
    match dir {
        Direction::E => Direction::W,
        Direction::W => Direction::E,
        Direction::NE => Direction::SW,
        Direction::SW => Direction::NE,
        Direction::NW => Direction::SE,
        Direction::SE => Direction::NW,
    }
}

/// The point reflection of `mv` through the board center. Also the tell: the client can draw it
/// for any move the player hovers.
pub fn mirror_move(mv: &Move) -> Move {
    Move {
        cells: mv.cells.iter().map(|&(q, r)| (-q, -r)).collect(),
        dir: opposite(mv.dir),
    }
}

/// The boss reply for the current position, `None` on the player's turn or when the game is over.
/// It is the mirror of the last player move in every phase when the normal validator accepts it,
/// else the boss search picks.
pub fn echo_move(enc: &Encounter) -> Option<Move> {
    let game = enc.game();
    if game.outcome().is_some() || game.to_move() != Player::White {
        return None;
    }
    game.history()
        .last()
        .map(|p| mirror_move(&p.mv))
        .filter(|m| apply(game.board(), Player::White, m).is_ok())
        .or_else(|| enc.boss_search().map(|r| r.mv))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Board, Cell};
    use crate::game::Game;
    use crate::moves::Direction::{E, NE, NW, SE, SW, W};
    use crate::moves::{apply, legal_moves, Direction, Player};

    type P = (i32, i32);

    const WHITES: [P; 11] = [
        (0, -3),
        (-3, -1),
        (-2, -1),
        (-1, -1),
        (0, -1),
        (1, -1),
        (2, -1),
        (3, -1),
        (4, -1),
        (4, -2),
        (2, -3),
    ];

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    fn enc(black: &[P], white: &[P]) -> Encounter {
        enc_at(black, white, 0)
    }

    /// The player has ejected `ejected` marbles: 0 is P1, 3 is P2, 5 is P3.
    fn enc_at(black: &[P], white: &[P], ejected: u8) -> Encounter {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        let game = Game::from_position(board, Player::Black, [ejected, 0]);
        Encounter::new(game, echo_boss(), 7)
    }

    /// Black plays `a`, White replies with a neutral move, Black plays `b`.
    fn two_black_moves(e: &mut Encounter, a: &Move, b: &Move) {
        e.play(a).unwrap();
        e.play(&mv(&[(4, -2)], NW)).unwrap();
        e.play(b).unwrap();
    }

    #[test]
    fn mirror_reflects_cells_and_direction() {
        assert_eq!(mirror_move(&mv(&[(0, 2)], SE)), mv(&[(0, -2)], NW));
        assert_eq!(
            mirror_move(&mv(&[(1, 0), (2, 0)], E)),
            mv(&[(-1, 0), (-2, 0)], W)
        );
        for (d, m) in [(E, W), (W, E), (NE, SW), (SW, NE), (NW, SE), (SE, NW)] {
            assert_eq!(mirror_move(&mv(&[(1, 2)], d)), mv(&[(-1, -2)], m));
        }
    }

    #[test]
    fn echo_boss_phases_follow_the_ejections_3_and_5() {
        let boss = echo_boss();
        assert!(boss.phase_marbles.is_empty());
        assert_eq!(boss.phase_ejections, vec![3, 5], "P2 after 3, P3 after 5");
        assert_eq!(boss.node_budget, ECHO_NODE_BUDGET);
        assert_eq!((boss.special)(1, 0), None);
        let board = Board::standard();
        assert_eq!((boss.hook)(&board, 0, 0), board);
        for (ejected, phase) in [(0, 0), (2, 0), (3, 1), (4, 1), (5, 2)] {
            assert_eq!(enc_at(&[(0, 3)], &WHITES, ejected).phase(), phase);
        }
    }

    #[test]
    fn p1_plays_the_mirror_when_legal() {
        let mut e = enc(&[(0, 2)], &[(0, -2)]);
        e.play(&mv(&[(0, 2)], SE)).unwrap();
        assert_eq!(echo_move(&e), Some(mv(&[(0, -2)], NW)));
    }

    #[test]
    fn p1_uses_the_search_when_the_mirror_is_illegal() {
        let mut e = enc(&[(0, 2)], &[(0, -2), (-1, -2)]);
        let played = mv(&[(0, 2)], E);
        e.play(&played).unwrap();
        let mirror = mirror_move(&played);
        assert!(apply(e.game().board(), Player::White, &mirror).is_err());
        let found = echo_move(&e).unwrap();
        assert_eq!(Some(found.clone()), e.boss_search().map(|r| r.mv));
        assert!(legal_moves(e.game().board(), Player::White).contains(&found));
    }

    #[test]
    fn no_reply_on_the_players_turn_or_after_the_end() {
        let mut e = enc(&[(0, 2)], &[(0, -2)]);
        assert_eq!(echo_move(&e), None);
        let end = enc(&[(2, 0), (3, 0)], &[(4, 0)]);
        let mut end = Encounter::new(
            Game::from_position(end.game().board().clone(), Player::Black, [5, 0]),
            echo_boss(),
            0,
        );
        end.play(&mv(&[(2, 0), (3, 0)], E)).unwrap();
        assert_eq!(echo_move(&end), None);
        e.play(&mv(&[(0, 2)], SE)).unwrap();
        assert!(echo_move(&e).is_some());
    }

    #[test]
    fn every_phase_mirrors_the_last_move() {
        for (ejected, phase) in [(0, 0), (3, 1), (5, 2)] {
            let mut e = enc_at(&[(0, 3), (-2, 3)], &[(0, -3), (2, -3), (4, -2)], ejected);
            assert_eq!(e.phase(), phase);
            let a = mv(&[(-2, 3)], E);
            let b = mv(&[(0, 3)], E);
            two_black_moves(&mut e, &a, &b);
            assert_eq!(echo_move(&e), Some(mirror_move(&b)), "{ejected} ejected");
        }
    }

    #[test]
    fn every_phase_uses_the_search_when_the_mirror_is_illegal() {
        for ejected in [0, 3, 5] {
            let mut e = enc_at(
                &[(0, 3), (-2, 3)],
                &[(0, -3), (2, -3), (1, -3), (4, -2)],
                ejected,
            );
            // The mirror of the last move, (2,-3)>W, is blocked by the own marble at (1,-3), and
            // the earlier mirror is no fallback any more.
            let a = mv(&[(0, 3)], E);
            let b = mv(&[(-2, 3)], E);
            two_black_moves(&mut e, &a, &b);
            assert!(apply(e.game().board(), Player::White, &mirror_move(&b)).is_err());
            assert_eq!(echo_move(&e), e.boss_search().map(|r| r.mv), "{ejected}");
        }
    }

    #[test]
    fn same_seed_same_game() {
        let run = || {
            let mut e = Encounter::new(Game::new(), echo_boss(), 3);
            for _ in 0..8 {
                let m = if e.game().to_move() == Player::White {
                    echo_move(&e).unwrap()
                } else {
                    legal_moves(e.game().board(), Player::Black)[0].clone()
                };
                e.play(&m).unwrap();
            }
            e.game()
                .history()
                .iter()
                .map(|p| p.mv.clone())
                .collect::<Vec<_>>()
        };
        assert_eq!(run(), run());
    }
}
