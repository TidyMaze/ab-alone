//! The Chaplain (#45, docs/specs/game-design.md section 7.3): conversion by encirclement. At the
//! end of every turn a marble touching 4 or more marbles of the other side changes side, for both
//! sides. A flip keeps the marble count and credits no ejection. P2 comes at 4 player ejections.

use crate::board::{Board, Cell};
use crate::encounter::hull::NEIGHBOURS;
use crate::encounter::{BossDef, Encounter};

/// Opposing marbles that flip a marble, for both sides. TUNE.
pub const CHAPLAIN_FLIP_THRESHOLD: usize = 4;
/// P2 starts at this many player ejections. TUNE.
pub const CHAPLAIN_PHASE_EJECTIONS: [u8; 1] = [4];
/// Positions the boss search may visit per move. TUNE.
pub const CHAPLAIN_NODE_BUDGET: u32 = 2000;
/// Special id at the end of the player turn.
pub const CHAPLAIN_PLAYER_END: u8 = 1;
/// Special id at the end of the boss turn is this plus the phase.
pub const CHAPLAIN_BOSS_END: u8 = 2;

type P = (i32, i32);

/// Special id: the turn that just ended and, at the end of the boss turn, the phase.
fn special(ply: u32, phase: usize) -> Option<u8> {
    Some(if ply % 2 == 1 {
        CHAPLAIN_PLAYER_END
    } else {
        CHAPLAIN_BOSS_END + phase as u8
    })
}

/// Cells of `victim` marbles with at least `CHAPLAIN_FLIP_THRESHOLD` `attacker` neighbours.
fn marked(board: &Board, victim: Cell, attacker: Cell) -> Vec<P> {
    let mut out = Vec::new();
    let radius = board.radius();
    for q in -radius..=radius {
        for r in -radius..=radius {
            if board.get(q, r) != Some(victim) {
                continue;
            }
            let near = NEIGHBOURS
                .iter()
                .filter(|&&(dq, dr)| board.get(q + dq, r + dr) == Some(attacker))
                .count();
            if near >= CHAPLAIN_FLIP_THRESHOLD {
                out.push((q, r));
            }
        }
    }
    out
}

/// The player marbles that flip at the end of a turn, and the board after the flips of both
/// sides, all decided on `board`. A marble that flips to the boss is marked converted, one that
/// flips back to the player loses its mark.
fn convert(board: &Board) -> (Vec<P>, Board) {
    let to_boss = marked(board, Cell::Black, Cell::White);
    let to_player = marked(board, Cell::White, Cell::Black);
    let mut out = board.clone();
    for &(q, r) in &to_boss {
        out.set(q, r, Cell::White);
    }
    for &(q, r) in &to_player {
        out.set(q, r, Cell::Black);
    }
    out.set_converted([board.converted(), &to_boss].concat());
    (to_boss, keep_white_marks(out))
}

/// Drops the converted marks that no longer sit on a White marble.
fn keep_white_marks(mut board: Board) -> Board {
    let kept = board
        .converted()
        .iter()
        .copied()
        .filter(|&(q, r)| board.get(q, r) == Some(Cell::White))
        .collect();
    board.set_converted(kept);
    board
}

fn hook(board: &Board, _id: u8, _seed: u64) -> Board {
    convert(board).1
}

/// The Black marbles of `before` that are White on `now`.
pub(crate) fn flipped(before: &Board, now: &Board) -> Vec<P> {
    let radius = before.radius();
    (-radius..=radius)
        .flat_map(|q| (-radius..=radius).map(move |r| (q, r)))
        .filter(|&(q, r)| {
            before.get(q, r) == Some(Cell::Black) && now.get(q, r) == Some(Cell::White)
        })
        .collect()
}

/// Player marbles that flipped to the boss at the end of the last ply: a hovered move shows
/// what it would flip.
pub fn chaplain_tell(enc: &Encounter) -> Vec<P> {
    enc.hooked()
        .map_or_else(Vec::new, |(before, _)| flipped(before, enc.game().board()))
}

/// The Chaplain boss.
pub fn chaplain_boss() -> BossDef {
    BossDef {
        name: "The Chaplain",
        phase_marbles: Vec::new(),
        phase_ejections: CHAPLAIN_PHASE_EJECTIONS.to_vec(),
        special,
        hook,
        node_budget: CHAPLAIN_NODE_BUDGET,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Board, Cell, MAX_RADIUS};
    use crate::encounter::{marbles, Encounter};
    use crate::game::Game;
    use crate::moves::Direction::{E, W};
    use crate::moves::{Move, Player};

    /// Black's shuffle marble walks this pair, White's walks the other: far from every test cell.
    const BLACK_SHUFFLE: [P; 2] = [(0, 3), (-1, 3)];
    const WHITE_SHUFFLE: [P; 2] = [(0, -3), (1, -3)];
    /// Four of the six neighbours of (0, 0).
    const FOUR_AROUND: [P; 4] = [(1, 0), (1, -1), (0, -1), (-1, 1)];

    /// Black to move, `ejected` marbles already ejected by the player.
    fn build(black: &[P], white: &[P], voids: &[P], ejected: u8, seed: u64) -> Encounter {
        let mut board = Board::empty();
        board.set(BLACK_SHUFFLE[0].0, BLACK_SHUFFLE[0].1, Cell::Black);
        board.set(WHITE_SHUFFLE[0].0, WHITE_SHUFFLE[0].1, Cell::White);
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        for &(q, r) in voids {
            board.void(q, r);
        }
        Encounter::new(
            Game::from_position(board, Player::Black, [ejected, 0]),
            chaplain_boss(),
            seed,
        )
    }

    fn enc(black: &[P], white: &[P]) -> Encounter {
        build(black, white, &[], 0, 0)
    }

    /// One harmless shuffle ply for the side to move.
    fn step(e: &mut Encounter) {
        let ply = e.game().history().len();
        let k = ply / 2;
        let m = match (ply % 2, k % 2) {
            (0, 0) => (BLACK_SHUFFLE[0], W),
            (0, _) => (BLACK_SHUFFLE[1], E),
            (_, 0) => (WHITE_SHUFFLE[0], E),
            _ => (WHITE_SHUFFLE[1], W),
        };
        e.play(&Move {
            cells: vec![m.0],
            dir: m.1,
        })
        .unwrap();
    }

    fn turns(e: &mut Encounter, plies: usize) {
        for _ in 0..plies {
            step(e);
        }
    }

    fn at(e: &Encounter, (q, r): P) -> Option<Cell> {
        e.game().board().get(q, r)
    }

    fn count(e: &Encounter, color: Cell) -> u8 {
        marbles(e.game().board(), color)
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

    #[test]
    fn boss_definition_matches_the_spec() {
        let b = chaplain_boss();
        assert_eq!(b.name, "The Chaplain");
        assert!(b.phase_marbles.is_empty());
        assert_eq!(b.phase_ejections, vec![4], "P2 at 4 ejections, no P3");
        assert_eq!(b.node_budget, CHAPLAIN_NODE_BUDGET);
        assert_eq!(CHAPLAIN_FLIP_THRESHOLD, 4);
    }

    #[test]
    fn special_fires_after_every_ply_with_the_turn_and_the_phase() {
        assert_eq!(special(1, 0), Some(CHAPLAIN_PLAYER_END));
        assert_eq!(special(3, 1), Some(CHAPLAIN_PLAYER_END));
        assert_eq!(special(2, 0), Some(CHAPLAIN_BOSS_END));
        assert_eq!(special(4, 1), Some(CHAPLAIN_BOSS_END + 1));
    }

    #[test]
    fn the_phase_follows_the_player_ejections() {
        assert_eq!(build(&[], &[], &[], 3, 0).phase(), 0);
        assert_eq!(build(&[], &[], &[], 4, 0).phase(), 1);
        assert_eq!(build(&[], &[], &[], 5, 0).phase(), 1);
    }

    #[test]
    fn four_boss_neighbours_flip_a_marble_at_the_end_of_each_turn() {
        let mut e = enc(&[(0, 0)], &FOUR_AROUND);
        let (b, w) = (count(&e, Cell::Black), count(&e, Cell::White));
        step(&mut e);
        assert_eq!(
            at(&e, (0, 0)),
            Some(Cell::White),
            "at the end of the player turn"
        );
        assert_eq!(count(&e, Cell::Black), b - 1);
        assert_eq!(count(&e, Cell::White), w + 1);
        assert_eq!(
            e.game().ejected(Player::Black),
            0,
            "no marble lost to the void"
        );
        assert_eq!(e.game().ejected(Player::White), 0);
        assert_eq!(e.game().board().converted(), &[(0, 0)]);
    }

    #[test]
    fn a_boss_move_that_brings_the_fourth_neighbour_flips_at_the_end_of_the_boss_turn() {
        let mut e = enc(&[(0, 0)], &[(1, 0), (1, -1), (0, -1), (-2, 1)]);
        step(&mut e);
        assert_eq!(at(&e, (0, 0)), Some(Cell::Black), "3 neighbours only");
        e.play(&Move {
            cells: vec![(-2, 1)],
            dir: E,
        })
        .unwrap();
        assert_eq!(at(&e, (0, 0)), Some(Cell::White));
    }

    #[test]
    fn three_boss_neighbours_do_not_flip() {
        let mut e = enc(&[(0, 0)], &FOUR_AROUND[..3]);
        turns(&mut e, 4);
        assert_eq!(at(&e, (0, 0)), Some(Cell::Black));
    }

    #[test]
    fn four_player_neighbours_flip_a_boss_marble_to_the_player_at_the_end_of_each_turn() {
        let mut e = enc(&FOUR_AROUND, &[(0, 0)]);
        let (b, w) = (count(&e, Cell::Black), count(&e, Cell::White));
        step(&mut e);
        assert_eq!(
            at(&e, (0, 0)),
            Some(Cell::Black),
            "a native boss marble flips too"
        );
        assert_eq!(count(&e, Cell::Black), b + 1);
        assert_eq!(count(&e, Cell::White), w - 1);
        assert_eq!(e.game().ejected(Player::Black), 0);
        assert!(e.game().board().converted().is_empty());
        let mut three = enc(&FOUR_AROUND[..3], &[(0, 0)]);
        turns(&mut three, 4);
        assert_eq!(at(&three, (0, 0)), Some(Cell::White));
    }

    #[test]
    fn a_flipped_marble_flips_back_when_it_touches_four_player_marbles() {
        let mut e = enc(&FOUR_AROUND, &[(0, 0)]);
        let mut board = e.game().board().clone();
        board.set_converted(vec![(0, 0)]);
        e = Encounter::new(
            Game::from_position(board, Player::Black, [0, 0]),
            chaplain_boss(),
            0,
        );
        step(&mut e);
        assert_eq!(at(&e, (0, 0)), Some(Cell::Black));
        assert!(
            e.game().board().converted().is_empty(),
            "no longer converted"
        );
    }

    #[test]
    fn voids_and_the_rim_add_no_neighbour() {
        let voids = [(1, 0), (1, -1)];
        let e = build(&[(0, 0)], &[(0, -1), (0, 1)], &voids, 4, 0);
        assert!(chaplain_tell(&e).is_empty(), "2 voids and 2 marbles");
        let rim = enc(&[(4, -2)], &[(3, -2), (4, -3)]);
        assert!(
            chaplain_tell(&rim).is_empty(),
            "2 marbles and 2 off-board cells"
        );
    }

    #[test]
    fn the_tell_lists_the_player_marbles_the_last_ply_flipped() {
        let mut e = enc(&[(0, 0), (1, 2)], &FOUR_AROUND);
        assert!(chaplain_tell(&e).is_empty(), "no ply yet");
        step(&mut e);
        assert_eq!(chaplain_tell(&e), vec![(0, 0)]);
        step(&mut e);
        assert!(chaplain_tell(&e).is_empty(), "nothing flips twice");
        let mut moved = enc(&[(-1, 0)], &FOUR_AROUND);
        step(&mut moved);
        assert!(
            chaplain_tell(&moved).is_empty(),
            "breaking contact saves it"
        );
        let mut three = enc(&[(0, 0)], &FOUR_AROUND[..3]);
        step(&mut three);
        assert!(chaplain_tell(&three).is_empty());
    }

    #[test]
    fn a_converted_marble_keeps_its_mark_when_it_moves() {
        let mut e = enc(&[(-2, 0), (-2, 1), (-1, 1)], &FOUR_AROUND[..3]);
        let mut board = e.game().board().clone();
        board.set(0, 0, Cell::White);
        board.set_converted(vec![(0, 0)]);
        e = Encounter::new(
            Game::from_position(board, Player::Black, [0, 0]),
            chaplain_boss(),
            0,
        );
        step(&mut e);
        e.play(&Move {
            cells: vec![(0, 0)],
            dir: W,
        })
        .unwrap();
        assert_eq!(e.game().board().converted(), &[(-1, 0)]);
    }

    #[test]
    fn a_converted_marble_pushed_by_a_sumito_keeps_its_mark_and_off_the_board_loses_it() {
        let mut board = Board::empty();
        for &(q, r) in &[(-2, 0), (-1, 0), (3, -3), (2, 2)] {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in &[(0, 0), (4, -4)] {
            board.set(q, r, Cell::White);
        }
        board.set_converted(vec![(0, 0)]);
        let mut e = Encounter::new(
            Game::from_position(board, Player::Black, [0, 0]),
            chaplain_boss(),
            0,
        );
        e.play(&Move {
            cells: vec![(-2, 0), (-1, 0)],
            dir: E,
        })
        .unwrap();
        assert_eq!(e.game().board().converted(), &[(1, 0)]);
        let mut board = Board::empty();
        board.set(2, 0, Cell::Black);
        board.set(3, 0, Cell::Black);
        board.set(4, 0, Cell::White);
        board.set_converted(vec![(4, 0)]);
        let mut e = Encounter::new(
            Game::from_position(board, Player::Black, [0, 0]),
            chaplain_boss(),
            0,
        );
        e.play(&Move {
            cells: vec![(2, 0), (3, 0)],
            dir: E,
        })
        .unwrap();
        assert!(e.game().board().converted().is_empty());
    }

    #[test]
    fn the_player_is_black_and_moves_first() {
        let e = Encounter::new(Game::new(), chaplain_boss(), 0);
        assert_eq!(e.game().to_move(), Player::Black);
        assert_eq!(e.tell(), Some(CHAPLAIN_PLAYER_END), "ply 1 is the player's");
    }

    #[test]
    fn nothing_flips_without_contact() {
        let mut e = enc(&[(0, 0)], &[]);
        let (b, w) = (count(&e, Cell::Black), count(&e, Cell::White));
        turns(&mut e, 4);
        assert_eq!((count(&e, Cell::Black), count(&e, Cell::White)), (b, w));
        assert_eq!(
            cells_of(e.game().board(), Cell::Black).len(),
            usize::from(b)
        );
    }

    /// A white marble at (0, 0) with 3 black neighbours, just under the flip threshold.
    const MARTYR_SCENE: [P; 3] = [(1, 0), (1, -1), (0, -1)];

    fn martyr_of(e: &Encounter) -> Option<Option<P>> {
        e.game().board().martyr()
    }

    #[test]
    fn the_martyr_is_announced_at_the_end_of_the_first_boss_turn_from_4_ejections() {
        let mut e = build(&MARTYR_SCENE, &[(0, 0)], &[], 4, 0);
        step(&mut e);
        assert_eq!(martyr_of(&e), None, "not at the end of the player turn");
        step(&mut e);
        assert_eq!(martyr_of(&e), Some(Some((0, 0))));
        assert_eq!(at(&e, (0, 0)), Some(Cell::White), "still there, announced");
        let mut early = build(&MARTYR_SCENE, &[(0, 0)], &[], 3, 0);
        turns(&mut early, 4);
        assert_eq!(martyr_of(&early), None, "not before 4 ejections");
        let mut alone = build(&[], &[(0, 0)], &[], 4, 0);
        turns(&mut alone, 4);
        assert_eq!(
            martyr_of(&alone),
            None,
            "no boss marble touches a player marble"
        );
    }

    #[test]
    fn the_martyr_is_the_marble_converting_the_most_player_marbles() {
        let blacks = [(1, 0), (1, -1), (0, -1), (-3, 0)];
        let mut e = build(&blacks, &[(0, 0), (-3, 1), (-4, 1)], &[], 4, 0);
        // (0, 0) touches 3 black marbles, (-3, 1) touches 1, (-4, 1) touches 1.
        turns(&mut e, 2);
        assert_eq!(martyr_of(&e), Some(Some((0, 0))));
    }

    #[test]
    fn a_tie_is_broken_by_the_seed() {
        let pick = |seed| {
            let mut e = build(&[(1, 0), (-3, 0)], &[(0, 0), (-4, 1)], &[], 4, seed);
            turns(&mut e, 2);
            martyr_of(&e).unwrap().unwrap()
        };
        assert_eq!(pick(3), pick(3));
        let picks: Vec<P> = (0..16).map(pick).collect();
        assert!(
            picks.contains(&(0, 0)) && picks.contains(&(-4, 1)),
            "{picks:?}"
        );
    }

    #[test]
    fn the_martyr_explodes_at_the_end_of_the_next_boss_turn() {
        let mut e = build(&MARTYR_SCENE, &[(0, 0), (3, 0)], &[], 4, 0);
        turns(&mut e, 2);
        let (b, w) = (count(&e, Cell::Black), count(&e, Cell::White));
        step(&mut e);
        assert_eq!(
            at(&e, (0, 0)),
            Some(Cell::White),
            "not at the end of the player turn"
        );
        step(&mut e);
        assert_eq!(at(&e, (0, 0)), Some(Cell::Empty), "the martyr is gone");
        for c in MARTYR_SCENE {
            assert_eq!(at(&e, c), Some(Cell::White), "{c:?} converted");
        }
        assert_eq!(count(&e, Cell::Black), b - 3);
        assert_eq!(count(&e, Cell::White), w + 3 - 1);
        assert_eq!(e.game().ejected(Player::Black), 5, "the 5th ejection");
        assert_eq!(e.game().ejected(Player::White), 0);
        assert_eq!(martyr_of(&e), Some(None));
        assert_eq!(e.removed(), &[((0, 0), Cell::White)]);
        let mut marks = e.game().board().converted().to_vec();
        marks.sort_unstable();
        assert_eq!(marks, vec![(0, -1), (1, -1), (1, 0)]);
    }

    #[test]
    fn it_happens_once() {
        let mut e = build(&MARTYR_SCENE, &[(0, 0), (3, 0), (4, -1)], &[], 4, 0);
        turns(&mut e, 4);
        assert_eq!(e.game().ejected(Player::Black), 5);
        turns(&mut e, 8);
        assert_eq!(martyr_of(&e), Some(None), "no second martyr");
        assert_eq!(e.game().ejected(Player::Black), 5);
    }

    #[test]
    fn a_martyr_pushed_off_the_board_explodes_nothing() {
        let mut e = build(&[(2, 0), (3, 0)], &[(4, 0)], &[], 4, 0);
        turns(&mut e, 2);
        assert_eq!(martyr_of(&e), Some(Some((4, 0))));
        e.play(&Move {
            cells: vec![(2, 0), (3, 0)],
            dir: E,
        })
        .unwrap();
        assert_eq!(e.game().ejected(Player::Black), 5, "the push");
        assert_eq!(martyr_of(&e), Some(None));
        step(&mut e);
        assert_eq!(e.game().ejected(Player::Black), 5, "nothing explodes");
    }

    #[test]
    fn a_martyr_that_moved_with_a_push_is_still_the_martyr() {
        let mut e = build(&[(-2, 0), (-1, 0)], &[(0, 0)], &[], 4, 0);
        turns(&mut e, 2);
        assert_eq!(martyr_of(&e), Some(Some((0, 0))));
        e.play(&Move {
            cells: vec![(-2, 0), (-1, 0)],
            dir: E,
        })
        .unwrap();
        assert_eq!(martyr_of(&e), Some(Some((1, 0))));
    }

    #[test]
    fn a_martyr_converted_before_it_explodes_explodes_nothing() {
        let mut board = build(&[(1, 0), (1, -1), (0, -1), (-1, 0)], &[(0, 0)], &[], 4, 0)
            .game()
            .board()
            .clone();
        board.set_martyr(Some(Some((0, 0))));
        let mut e = Encounter::new(
            Game::from_position(board, Player::Black, [4, 0]),
            chaplain_boss(),
            0,
        );
        step(&mut e);
        assert_eq!(
            at(&e, (0, 0)),
            Some(Cell::Black),
            "converted by 4 neighbours"
        );
        step(&mut e);
        assert_eq!(e.game().ejected(Player::Black), 4, "nothing exploded");
        assert_eq!(at(&e, (1, 0)), Some(Cell::Black));
        assert_eq!(martyr_of(&e), Some(None));
    }
}
