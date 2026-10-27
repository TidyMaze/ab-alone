//! The Chaplain (#45, docs/specs/game-design.md section 7.3): conversion by encirclement. At the
//! end of the boss turn a player marble with enough boss neighbours flips to the boss, at the end
//! of the player turn a boss marble with enough player neighbours flips back. Flips keep the
//! marble count and credit no ejection. P2 counts void cells as boss neighbours, P3 chains one
//! more wave of flips and pays for each flip with a boss marble lost to the void.

use crate::board::{Board, Cell};
use crate::encounter::hull::{mix, NEIGHBOURS};
use crate::encounter::{BossDef, Encounter};

/// Boss neighbours that flip a player marble. TUNE.
pub const CHAPLAIN_FLIP_THRESHOLD: usize = 3;
/// Player neighbours that flip a boss marble back. TUNE.
pub const CHAPLAIN_RESTORE_THRESHOLD: usize = 3;
/// P2 and P3 start at this many boss marbles left. TUNE.
pub const CHAPLAIN_PHASE_MARBLES: [u8; 2] = [8, 4];
/// Positions the boss search may visit per move. TUNE.
pub const CHAPLAIN_NODE_BUDGET: u32 = 2000;
/// A flip is free on 1 boss turn in this many (the roll is seeded). TUNE.
pub const CHAPLAIN_FREE_FLIP_ODDS: u64 = 4;
/// First phase (0 based) where void cells count as boss neighbours.
pub const CHAPLAIN_VOID_PHASE: usize = 1;
/// First phase (0 based) where a flip chains once more.
pub const CHAPLAIN_CHAIN_PHASE: usize = 2;
/// Special id at the end of the player turn: boss marbles flip back.
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

/// Cells of `victim` marbles with at least `threshold` `attacker` neighbours. Off-board and
/// vanished neighbours add one attacker in total, however many there are, when `void_counts`.
fn marked(
    board: &Board,
    victim: Cell,
    attacker: Cell,
    threshold: usize,
    void_counts: bool,
) -> Vec<P> {
    let mut out = Vec::new();
    let radius = board.radius();
    for q in -radius..=radius {
        for r in -radius..=radius {
            if board.get(q, r) != Some(victim) {
                continue;
            }
            let around = NEIGHBOURS.map(|(dq, dr)| board.get(q + dq, r + dr));
            let near = around.iter().filter(|&&c| c == Some(attacker)).count()
                + usize::from(void_counts && around.contains(&None));
            if near >= threshold {
                out.push((q, r));
            }
        }
    }
    out
}

/// The player marbles that flip at the end of a boss turn in `phase`, and the board after the
/// flips. One wave, and from the chain phase on a second wave that sees the first.
fn convert(board: &Board, phase: usize) -> (Vec<P>, Board) {
    let waves = 1 + usize::from(phase >= CHAPLAIN_CHAIN_PHASE);
    let void_counts = phase >= CHAPLAIN_VOID_PHASE;
    let (mut flipped, mut out) = (Vec::new(), board.clone());
    for _ in 0..waves {
        let wave = marked(
            &out,
            Cell::Black,
            Cell::White,
            CHAPLAIN_FLIP_THRESHOLD,
            void_counts,
        );
        for &(q, r) in &wave {
            out.set(q, r, Cell::White);
        }
        flipped.extend(wave);
    }
    let marks = [board.converted(), &flipped].concat();
    out.set_converted(marks);
    (flipped, out)
}

/// The boss pays for its flips with one chance in `CHAPLAIN_FREE_FLIP_ODDS` of not paying, rolled
/// from the seed (#207). From the chain phase on the cost is certain.
fn flips_cost(phase: usize, seed: u64) -> bool {
    phase >= CHAPLAIN_CHAIN_PHASE || !mix(seed).is_multiple_of(CHAPLAIN_FREE_FLIP_ODDS)
}

/// End of the boss turn: flips, then, when they cost (`flips_cost`), one boss marble per flip is
/// pushed into the void, picked by `seed` among the marbles that did not just flip.
fn boss_turn_end(board: &Board, phase: usize, seed: u64) -> Board {
    let (flipped, mut out) = convert(board, phase);
    if flips_cost(phase, seed) {
        let mut pool: Vec<P> = marked(board, Cell::White, Cell::White, 0, false);
        let mut state = seed;
        for _ in 0..flipped.len().min(pool.len()) {
            state = mix(state);
            let (q, r) = pool.swap_remove((state % pool.len() as u64) as usize);
            out.set(q, r, Cell::Empty);
        }
    }
    keep_white_marks(out)
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

fn hook(board: &Board, id: u8, seed: u64) -> Board {
    if id == CHAPLAIN_PLAYER_END {
        let mut out = board.clone();
        let back = marked(
            board,
            Cell::White,
            Cell::Black,
            CHAPLAIN_RESTORE_THRESHOLD,
            false,
        );
        for &(q, r) in back.iter().filter(|c| board.converted().contains(c)) {
            out.set(q, r, Cell::Black);
        }
        keep_white_marks(out)
    } else {
        boss_turn_end(
            board,
            usize::from(id.saturating_sub(CHAPLAIN_BOSS_END)),
            seed,
        )
    }
}

/// Player marbles that flip at the end of the next boss turn if nothing moves.
pub fn chaplain_tell(enc: &Encounter) -> Vec<P> {
    convert(enc.game().board(), enc.phase()).0
}

/// The Chaplain boss.
pub fn chaplain_boss() -> BossDef {
    BossDef {
        name: "The Chaplain",
        phase_marbles: CHAPLAIN_PHASE_MARBLES.to_vec(),
        phase_ejections: Vec::new(),
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
    fn the_tell_lists_the_marbles_that_flip_next() {
        let e = enc(&[(0, 0), (1, 2)], &FOUR_AROUND);
        assert_eq!(chaplain_tell(&e), vec![(0, 0)]);
        let moved = enc(&[(-1, 0)], &FOUR_AROUND);
        assert!(
            chaplain_tell(&moved).is_empty(),
            "breaking contact saves it"
        );
        assert!(chaplain_tell(&enc(&[(0, 0)], &FOUR_AROUND[..3])).is_empty());
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
}
