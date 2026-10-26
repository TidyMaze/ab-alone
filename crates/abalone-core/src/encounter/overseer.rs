//! The Overseer (#635, docs/specs/game-design.md section 7.11): burn its cores before the
//! neurotoxin floods the chamber. The Overseer sits at the centre and nothing moves it; 6 passive
//! cores sit around it and both sides push them like opponent marbles; a core on one of the 6
//! incinerator cells of the rim burns at the end of the ply and counts for the player, whoever
//! pushed it. The incinerators burn the boss's marbles too (P1 and P2) and the player's (P2 and
//! P3). The player loses at the end of its turn 40 if it has not won. Nothing is random.

use crate::board::{Board, Cell};
use crate::encounter::{BossDef, Encounter};
use crate::game::Game;
use crate::moves::{Move, Player};
use crate::search::{search_hooked, DEFAULT_WEIGHTS};

type P = (i32, i32);

/// Where the 6 cores start: the cells 2 steps from the centre on the 3 middle rows. TUNE.
pub const OVERSEER_CORES: [P; 6] = [(-1, -1), (2, -1), (-2, 0), (2, 0), (-2, 1), (1, 1)];
/// The 6 incinerator cells: the rim cells of the 3 middle rows, 2 steps beyond a core each. TUNE.
pub const OVERSEER_INCINERATORS: [P; 6] = [(-3, -1), (4, -1), (-4, 0), (4, 0), (-4, 1), (3, 1)];
/// Player turns before the neurotoxin wins the fight for the boss. TUNE.
pub const OVERSEER_TURNS: u32 = 40;
/// P2 and P3 start after this many ejections credited to the player (cores burnt count). TUNE.
pub const OVERSEER_PHASE_EJECTIONS: [u8; 2] = [2, 4];
/// Positions the boss search may visit per move (about depth 3, as the Hull). TUNE.
pub const OVERSEER_NODE_BUDGET: u32 = 3000;
/// What the incinerators burn in each phase, besides the cores: the boss's marbles, the player's.
const BURNS: [[bool; 2]; 3] = [[true, false], [true, true], [false, true]];

/// Special id of every ply: the phase, which says what the incinerators burn.
fn special(_ply: u32, phase: usize) -> Option<u8> {
    Some(phase as u8)
}

/// The board after the incinerators burn: every core on one, and the marbles phase `id` burns.
fn burn(board: &Board, id: u8) -> Board {
    let [white, black] = BURNS[usize::from(id)];
    let mut out = board.clone();
    for &(q, r) in board.incinerators() {
        let burns = match board.get(q, r) {
            Some(Cell::Core) => true,
            Some(Cell::White) => white,
            Some(Cell::Black) => black,
            _ => false,
        };
        if burns {
            out.set(q, r, Cell::Empty);
        }
    }
    out
}

fn hook(board: &Board, id: u8, _seed: u64) -> Board {
    burn(board, id)
}

/// What a ply does in the search tree in `phase`: the burns, and the ejections they credit.
pub fn overseer_step(board: Board, phase: usize) -> (Board, [u8; 2]) {
    let after = burn(&board, phase as u8);
    let count = |b: &Board, cells: &[Cell]| {
        b.incinerators()
            .iter()
            .filter(|&&(q, r)| b.get(q, r).is_some_and(|c| cells.contains(&c)))
            .count() as u8
    };
    let black = count(&board, &[Cell::Black]) - count(&after, &[Cell::Black]);
    let other =
        count(&board, &[Cell::White, Cell::Core]) - count(&after, &[Cell::White, Cell::Core]);
    (after, [other, black])
}

/// The Overseer boss definition.
pub fn overseer_boss() -> BossDef {
    BossDef {
        name: "The Overseer",
        phase_marbles: Vec::new(),
        phase_ejections: OVERSEER_PHASE_EJECTIONS.to_vec(),
        special,
        hook,
        node_budget: OVERSEER_NODE_BUDGET,
    }
}

/// The start board: the standard layout, the Overseer at the centre, the cores and the
/// incinerators.
pub fn overseer_board() -> Board {
    let mut board = Board::standard();
    board.set(0, 0, Cell::Overseer);
    for (q, r) in OVERSEER_CORES {
        board.set(q, r, Cell::Core);
    }
    board.set_incinerators(OVERSEER_INCINERATORS.to_vec());
    board
}

/// A new encounter: the player is Black and moves first, with `OVERSEER_TURNS` turns.
pub fn overseer_start(seed: u64) -> Encounter {
    let game = Game::from_position(overseer_board(), Player::Black, [0, 0]);
    Encounter::new(game, overseer_boss(), seed).with_turn_limit(OVERSEER_TURNS)
}

/// The boss reply: its node-limited search, where every ply of the tree burns, so it sees what
/// the incinerators take. `None` on the player's turn or when the game is over.
pub fn overseer_move(enc: &Encounter) -> Option<Move> {
    if enc.game().to_move() != Player::White {
        return None;
    }
    let phase = enc.phase();
    let step = |_: &Board, _: Player, _: &Move, after: Board| overseer_step(after, phase);
    search_hooked(
        enc.game(),
        enc.boss.node_budget,
        DEFAULT_WEIGHTS,
        &|_| true,
        &step,
    )
    .map(|r| r.mv)
}

/// The e2e fixture (client/e2e/overseer.spec.ts), from the start of any seed: the player walks two
/// marbles behind the core `(1, 1)` and burns it on `(3, 1)`, then the core `(-2, 1)` on `(-4, 1)`;
/// the boss walks three marbles onto `(4, -1)`, where they burn in P1 and P2, then pushes the core
/// `(2, -1)` onto it itself: the player's 6th ejection, at ply 24.
#[cfg(test)]
pub(crate) fn fixture() -> Vec<Move> {
    use crate::moves::Direction::{E, NE, NW, SE, W};
    let plies: [(&[P], _); 24] = [
        (&[(0, 2)], NW),
        (&[(4, -3)], SE),
        (&[(-1, 2)], NW),
        (&[(4, -2)], SE),
        (&[(-1, 1), (0, 1)], E),
        (&[(4, -4)], SE),
        (&[(0, 1), (1, 1)], E),
        (&[(4, -3)], SE),
        (&[(-2, 2)], NE),
        (&[(4, -2)], SE),
        (&[(-1, 3)], NE),
        (&[(3, -3)], SE),
        (&[(0, 2)], NW),
        (&[(3, -2)], E),
        (&[(-1, 1), (0, 1)], W),
        (&[(4, -2)], SE),
        (&[(-2, 1), (-1, 1)], W),
        (&[(0, -2)], SE),
        (&[(-4, 3)], NE),
        (&[(1, -2)], SE),
        (&[(-3, 2)], E),
        (&[(0, -1), (1, -1)], E),
        (&[(-2, 2)], E),
        (&[(1, -1), (2, -1)], E),
    ];
    plies
        .iter()
        .map(|&(cells, dir)| Move {
            cells: cells.to_vec(),
            dir,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encounter::hull::HULL_NODE_BUDGET;
    use crate::encounter::{marbles, PveResult};
    use crate::moves::Direction::{E, NE, SW};
    use crate::moves::{apply, legal_moves, Direction, MoveError};

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    /// A fight on a hand-made position with the incinerators, `ejected` already credited.
    fn fight(
        black: &[P],
        white: &[P],
        cores: &[P],
        to_move: Player,
        ejected: [u8; 2],
    ) -> Encounter {
        let mut board = Board::empty();
        board.set(0, 0, Cell::Overseer);
        board.set_incinerators(OVERSEER_INCINERATORS.to_vec());
        for (cells, cell) in [
            (black, Cell::Black),
            (white, Cell::White),
            (cores, Cell::Core),
        ] {
            for &(q, r) in cells {
                board.set(q, r, cell);
            }
        }
        let game = Game::from_position(board, to_move, ejected);
        Encounter::new(game, overseer_boss(), 0).with_turn_limit(OVERSEER_TURNS)
    }

    fn at(enc: &Encounter, q: i32, r: i32) -> Option<Cell> {
        enc.game().board().get(q, r)
    }

    fn ejected(enc: &Encounter) -> [u8; 2] {
        let game = enc.game();
        [game.ejected(Player::Black), game.ejected(Player::White)]
    }

    #[test]
    fn boss_definition_matches_the_spec() {
        let b = overseer_boss();
        assert_eq!(b.name, "The Overseer");
        assert!(b.phase_marbles.is_empty());
        assert_eq!(b.phase_ejections, vec![2, 4], "P2 after 2, P3 after 4");
        assert_eq!(b.node_budget, HULL_NODE_BUDGET, "the Hull's time budget");
        assert_eq!(OVERSEER_TURNS, 40);
        assert_eq!((b.special)(1, 2), Some(2), "every ply burns, by phase");
    }

    #[test]
    fn the_start_has_the_overseer_6_cores_6_incinerators_and_both_armies() {
        let enc = overseer_start(7);
        let board = enc.game().board();
        assert_eq!(board.get(0, 0), Some(Cell::Overseer));
        assert_eq!(marbles(board, Cell::Core), 6);
        assert!(OVERSEER_CORES
            .iter()
            .all(|&(q, r)| board.get(q, r) == Some(Cell::Core)));
        assert_eq!(board.incinerators(), &OVERSEER_INCINERATORS);
        for (q, r) in OVERSEER_INCINERATORS {
            assert_eq!(board.get(q, r), Some(Cell::Empty), "{q},{r} starts empty");
            assert_eq!(q.abs().max(r.abs()).max((q + r).abs()), 4, "on the rim");
        }
        assert_eq!(marbles(board, Cell::Black), 14);
        assert_eq!(marbles(board, Cell::White), 14);
        assert_eq!(enc.game().to_move(), Player::Black);
        assert_eq!(enc.turns_left(), Some(40));
        assert_eq!(enc.phase(), 0);
    }

    #[test]
    fn nothing_moves_the_overseer() {
        let enc = fight(
            &[(-3, 0), (-2, 0), (-1, 0)],
            &[(1, 0)],
            &[],
            Player::Black,
            [0, 0],
        );
        let board = enc.game().board();
        let trio = [(-3, 0), (-2, 0), (-1, 0)];
        assert!(
            apply(board, Player::Black, &mv(&trio, E)).is_err(),
            "onto it"
        );
        let enc = fight(&[(-3, 0), (-2, 0)], &[(-1, 0)], &[], Player::Black, [0, 0]);
        let push = mv(&[(-3, 0), (-2, 0)], E);
        assert!(
            apply(enc.game().board(), Player::Black, &push).is_err(),
            "a push into it"
        );
        let enc = fight(&[(-1, 1), (0, 1)], &[], &[], Player::Black, [0, 0]);
        let side = mv(&[(-1, 1), (0, 1)], NE);
        assert!(
            apply(enc.game().board(), Player::Black, &side).is_err(),
            "broadside onto it"
        );
        assert!(
            legal_moves(enc.game().board(), Player::White).is_empty(),
            "never the boss's"
        );
    }

    #[test]
    fn both_sides_push_a_core_like_an_opponent_marble() {
        let enc = fight(&[(-1, 1), (0, 1)], &[], &[(1, 1)], Player::Black, [0, 0]);
        let (after, ejected) = apply(
            enc.game().board(),
            Player::Black,
            &mv(&[(-1, 1), (0, 1)], E),
        )
        .unwrap();
        assert_eq!((after.get(2, 1), ejected), (Some(Cell::Core), false));
        let enc = fight(&[], &[(0, -2), (0, -1)], &[(1, -1)], Player::White, [0, 0]);
        let lone = apply(enc.game().board(), Player::White, &mv(&[(0, -1)], E));
        assert!(lone.is_err(), "1 against 1 is no sumito");
        let mut board = Board::empty();
        board.set(1, 2, Cell::Core);
        board.set(2, 2, Cell::Black);
        let trio = [(-2, 2), (-1, 2), (0, 2)];
        for c in trio {
            board.set(c.0, c.1, Cell::White);
        }
        let (after, ejected) = apply(&board, Player::White, &mv(&trio, E)).unwrap();
        assert!(
            ejected,
            "a core and a player marble in one line, the marble off"
        );
        assert_eq!(after.get(2, 2), Some(Cell::Core));
        assert!(
            legal_moves(&board, Player::Black)
                .iter()
                .all(|m| !m.cells.contains(&(1, 2))),
            "a core never moves itself"
        );
    }

    #[test]
    fn a_core_never_leaves_the_board_over_the_rim() {
        let pair = mv(&[(0, 2), (1, 2)], E);
        let enc = fight(&[(0, 2), (1, 2)], &[], &[(2, 2)], Player::Black, [0, 0]);
        let refused = apply(enc.game().board(), Player::Black, &pair);
        assert_eq!(
            refused,
            Err(MoveError::PushBlocked),
            "only an incinerator takes it"
        );
        let enc = fight(&[(2, 2)], &[(0, 2), (1, 2)], &[], Player::White, [0, 0]);
        let (_, ejected) = apply(enc.game().board(), Player::White, &pair).unwrap();
        assert!(ejected, "a marble still goes off");
    }

    #[test]
    fn a_core_pushed_onto_an_incinerator_burns_and_counts_for_the_player() {
        let mut enc = fight(
            &[(0, 1), (1, 1)],
            &[(4, -4)],
            &[(2, 1)],
            Player::Black,
            [0, 0],
        );
        enc.play(&mv(&[(0, 1), (1, 1)], E)).unwrap();
        assert_eq!(at(&enc, 3, 1), Some(Cell::Empty), "burnt");
        assert_eq!(enc.removed(), &[((3, 1), Cell::Core)]);
        assert_eq!(ejected(&enc), [1, 0]);
        assert_eq!(enc.game().no_ejection_plies(), 0);
    }

    #[test]
    fn turn_it_against_the_boss_its_own_push_burns_a_core_for_the_player() {
        let mut enc = fight(
            &[(-4, 4)],
            &[(1, -1), (2, -1)],
            &[(3, -1)],
            Player::White,
            [0, 0],
        );
        enc.play(&mv(&[(1, -1), (2, -1)], E)).unwrap();
        assert_eq!(enc.removed(), &[((4, -1), Cell::Core)]);
        assert_eq!(
            ejected(&enc),
            [1, 0],
            "the boss's push, the player's ejection"
        );
    }

    #[test]
    fn turn_it_against_the_boss_its_marbles_burn_in_p1_and_p2_not_in_p3() {
        for (credited, burns) in [(0, true), (2, true), (4, false)] {
            let mut enc = fight(
                &[(1, 0), (2, 0)],
                &[(3, 0)],
                &[],
                Player::Black,
                [credited, 0],
            );
            enc.play(&mv(&[(1, 0), (2, 0)], E)).unwrap();
            assert_eq!(
                at(&enc, 4, 0) == Some(Cell::White),
                !burns,
                "{credited} credited"
            );
            assert_eq!(ejected(&enc)[0], credited + u8::from(burns));
        }
    }

    #[test]
    fn the_player_marbles_burn_in_p2_and_p3_not_in_p1() {
        for (credited, burns) in [(0, false), (2, true), (4, true)] {
            let mut enc = fight(&[(3, 0)], &[(4, -4)], &[], Player::Black, [credited, 0]);
            enc.play(&mv(&[(3, 0)], E)).unwrap();
            assert_eq!(
                at(&enc, 4, 0) == Some(Cell::Black),
                !burns,
                "{credited} credited"
            );
            assert_eq!(ejected(&enc)[1], u8::from(burns));
        }
    }

    #[test]
    fn the_neurotoxin_wins_at_the_end_of_the_players_last_turn() {
        let enc = fight(&[(-4, 4)], &[(4, -4)], &[], Player::Black, [0, 0]);
        let mut enc = Encounter::new(enc.game().clone(), overseer_boss(), 0).with_turn_limit(2);
        assert_eq!(enc.turns_left(), Some(2));
        enc.play(&mv(&[(-4, 4)], NE)).unwrap();
        assert_eq!(enc.turns_left(), Some(1));
        enc.play(&mv(&[(4, -4)], SW)).unwrap();
        assert_eq!(enc.result(), None, "the boss's ply runs no clock");
        enc.play(&mv(&[(-3, 3)], NE)).unwrap();
        assert_eq!(enc.turns_left(), Some(0));
        assert_eq!(enc.result(), Some(PveResult::Lost));
        assert_eq!(enc.game().winner(), Some(Player::White));
        assert_eq!(
            Encounter::new(Game::new(), overseer_boss(), 0).turns_left(),
            None
        );
    }

    #[test]
    fn the_40th_move_still_wins_with_the_6th_ejection() {
        let mut enc = fight(
            &[(0, 1), (1, 1)],
            &[(4, -4)],
            &[(2, 1)],
            Player::Black,
            [5, 0],
        );
        let mut fresh = Encounter::new(enc.game().clone(), overseer_boss(), 0).with_turn_limit(1);
        fresh.play(&mv(&[(0, 1), (1, 1)], E)).unwrap();
        assert_eq!(fresh.result(), Some(PveResult::Won));
        enc.play(&mv(&[(0, 1), (1, 1)], E)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Won));
    }

    #[test]
    fn the_step_of_the_search_burns_and_credits_like_the_encounter() {
        let mut board = Board::empty();
        board.set_incinerators(OVERSEER_INCINERATORS.to_vec());
        board.set(3, 1, Cell::Core);
        board.set(4, 0, Cell::White);
        board.set(4, -1, Cell::Black);
        let (after, credits) = overseer_step(board.clone(), 0);
        assert_eq!((marbles(&after, Cell::Core), credits), (0, [2, 0]));
        assert_eq!(after.get(4, -1), Some(Cell::Black));
        assert_eq!(overseer_step(board.clone(), 1).1, [2, 1]);
        assert_eq!(overseer_step(board, 2).1, [1, 1]);
    }

    #[test]
    fn the_boss_keeps_its_marbles_and_cores_off_the_vents() {
        let enc = fight(&[(-4, 4)], &[(3, -1), (2, -2)], &[], Player::White, [0, 0]);
        let reply = overseer_move(&enc).unwrap();
        let (after, _) = apply(enc.game().board(), Player::White, &reply).unwrap();
        assert!(OVERSEER_INCINERATORS
            .iter()
            .all(|&(q, r)| after.get(q, r) != Some(Cell::White)));
        assert_eq!(overseer_move(&overseer_start(0)), None, "the player's turn");
        let mut enc = overseer_start(3);
        enc.play(&legal_moves(enc.game().board(), Player::Black)[0])
            .unwrap();
        let reply = overseer_move(&enc).unwrap();
        assert!(legal_moves(enc.game().board(), Player::White).contains(&reply));
    }

    #[test]
    fn the_fixture_burns_cores_and_boss_marbles_and_wins_at_ply_24() {
        let mut enc = overseer_start(153);
        let mut credits = Vec::new();
        for m in fixture() {
            assert_eq!(enc.result(), None);
            enc.play(&m).unwrap();
            credits.push(enc.game().ejected(Player::Black));
        }
        assert_eq!(credits[3], 1, "a boss marble burns on (4, -1)");
        assert_eq!(credits[6], 2, "the core (1, 1) burns on (3, 1): P2");
        assert_eq!(enc.result(), Some(PveResult::Won));
        assert_eq!(
            enc.removed(),
            &[((4, -1), Cell::Core)],
            "the boss's own push"
        );
        assert_eq!(ejected(&enc), [6, 0]);
        assert_eq!(enc.turns_left(), Some(28));
    }
}
