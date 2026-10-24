//! The Hull (#43, docs/specs/game-design.md section 7.1): rim cells crack on a timer, vanish two
//! plies later, and a marble on a vanished cell is removed, either side. The crack timers live on
//! the board (`Board::cracks`), so the tell is `board.cracks()`: the cells that vanish soon.

use crate::board::{Board, MAX_RADIUS};
use crate::encounter::BossDef;

/// Plies between a crack appearing and the cell vanishing.
pub const HULL_CRACK_LEAD: u8 = 2;
/// Plies between crack waves, per phase (phase 1, 2 and 3). TUNE.
pub const HULL_INTERVALS: [u32; 3] = [8, 6, 4];
/// Cells cracked per wave, per phase. TUNE.
pub const HULL_CELLS_PER_WAVE: [u8; 3] = [1, 2, 2];
/// Phase 2 and phase 3 start at this many boss marbles left. TUNE.
pub const HULL_PHASE_MARBLES: [u8; 2] = [10, 5];
/// Positions the boss search may visit per move (about depth 3). TUNE.
pub const HULL_NODE_BUDGET: u32 = 3000;
/// Special id on a ply with no new crack: the hook still counts the timers down.
pub const HULL_TICK: u8 = 0;

pub(crate) const NEIGHBOURS: [(i32, i32); 6] = [(1, 0), (-1, 0), (1, -1), (-1, 1), (0, -1), (0, 1)];

/// Special id: the number of cells to crack at the end of this ply, `HULL_TICK` when none.
fn special(ply: u32, phase: usize) -> Option<u8> {
    Some(if ply.is_multiple_of(HULL_INTERVALS[phase]) {
        HULL_CELLS_PER_WAVE[phase]
    } else {
        HULL_TICK
    })
}

/// On-board cells with a missing neighbour (off the board or vanished), not already cracked.
fn rim(board: &Board, cracked: &[((i32, i32), u8)]) -> Vec<(i32, i32)> {
    let mut out = Vec::new();
    for q in -MAX_RADIUS..=MAX_RADIUS {
        for r in -MAX_RADIUS..=MAX_RADIUS {
            let open = NEIGHBOURS
                .iter()
                .any(|&(dq, dr)| board.get(q + dq, r + dr).is_none());
            if board.get(q, r).is_some() && open && !cracked.iter().any(|&(c, _)| c == (q, r)) {
                out.push((q, r));
            }
        }
    }
    out
}

/// One splitmix64 step: deterministic, no state outside the seed.
pub(crate) fn mix(seed: u64) -> u64 {
    let z = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    let z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// Counts the timers down and removes the cells that reach zero (with their marbles), then
/// cracks `cells` new rim cells chosen by `seed`.
fn hull_hook(board: &Board, cells: u8, seed: u64) -> Board {
    let mut out = board.clone();
    let mut cracked = Vec::new();
    for &(c, left) in board.cracks() {
        if left <= 1 {
            out.void(c.0, c.1);
        } else {
            cracked.push((c, left - 1));
        }
    }
    let mut state = seed;
    for _ in 0..cells {
        let candidates = rim(&out, &cracked);
        if candidates.is_empty() {
            break;
        }
        state = mix(state);
        cracked.push((
            candidates[(state % candidates.len() as u64) as usize],
            HULL_CRACK_LEAD,
        ));
    }
    out.set_cracks(cracked);
    out
}

/// The Hull boss: standard Abalone search, a crumbling rim.
pub fn hull_boss() -> BossDef {
    BossDef {
        name: "The Hull",
        phase_marbles: HULL_PHASE_MARBLES.to_vec(),
        special,
        hook: hull_hook,
        node_budget: HULL_NODE_BUDGET,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Board, Cell, MAX_RADIUS};
    use crate::encounter::{marbles, Encounter};
    use crate::game::Game;
    use crate::moves::Direction::{E, NE, NW, SE, SW, W};
    use crate::moves::{apply, legal_moves, Direction, Move, MoveError, Player};

    type P = (i32, i32);

    /// Black's shuffle marble walks this triangle, White's walks the segment: both stay far from
    /// the rim and the combined position does not repeat inside 24 plies.
    const TRI: [P; 3] = [(0, 0), (1, 0), (0, 1)];
    const SEG: [P; 2] = [(0, -3), (1, -3)];

    fn radius((q, r): P) -> i32 {
        q.abs().max(r.abs()).max((q + r).abs())
    }

    fn cells_at(radius_wanted: i32) -> Vec<P> {
        let mut out = Vec::new();
        for q in -MAX_RADIUS..=MAX_RADIUS {
            for r in -MAX_RADIUS..=MAX_RADIUS {
                if radius((q, r)) == radius_wanted && radius((q, r)) <= MAX_RADIUS {
                    out.push((q, r));
                }
            }
        }
        out
    }

    fn dir(from: P, to: P) -> Direction {
        let table = [
            ((1, 0), E),
            ((-1, 0), W),
            ((1, -1), NE),
            ((-1, 1), SW),
            ((0, -1), NW),
            ((0, 1), SE),
        ];
        table
            .into_iter()
            .find(|&(d, _)| d == (to.0 - from.0, to.1 - from.1))
            .unwrap()
            .1
    }

    /// Whites on radius-3 cells other than the shuffle cells, `n` of them.
    fn block(n: usize) -> Vec<P> {
        cells_at(3)
            .into_iter()
            .filter(|c| !SEG.contains(c))
            .take(n)
            .collect()
    }

    /// Black: the shuffle marble plus `black`. White: the shuffle marble plus `white`.
    fn encounter(black: &[P], white: &[P], seed: u64) -> Encounter {
        let mut board = Board::empty();
        board.set(TRI[0].0, TRI[0].1, Cell::Black);
        board.set(SEG[0].0, SEG[0].1, Cell::White);
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        Encounter::new(
            Game::from_position(board, Player::Black, [0, 0]),
            hull_boss(),
            seed,
        )
    }

    /// Hull encounter where the boss has `whites` marbles in total.
    fn with_boss_marbles(whites: usize, seed: u64) -> Encounter {
        encounter(&[], &block(whites - 1), seed)
    }

    fn step(enc: &mut Encounter) {
        let ply = enc.game().history().len();
        let k = ply / 2;
        let (from, to) = if ply.is_multiple_of(2) {
            (TRI[k % 3], TRI[(k + 1) % 3])
        } else {
            (SEG[k % 2], SEG[(k + 1) % 2])
        };
        let m = Move {
            cells: vec![from],
            dir: dir(from, to),
        };
        enc.play(&m).unwrap();
    }

    fn play(enc: &mut Encounter, plies: usize) {
        for _ in 0..plies {
            step(enc);
        }
    }

    fn cracked(enc: &Encounter) -> Vec<P> {
        enc.game()
            .board()
            .cracks()
            .iter()
            .map(|&(c, _)| c)
            .collect()
    }

    #[test]
    fn boss_definition_matches_the_spec() {
        let b = hull_boss();
        assert_eq!(b.name, "The Hull");
        assert_eq!(b.phase_marbles, vec![10, 5]);
        assert_eq!(b.node_budget, HULL_NODE_BUDGET);
    }

    #[test]
    fn special_schedule_follows_the_phase() {
        assert_eq!(special(8, 0), Some(1));
        assert_eq!(special(16, 0), Some(1));
        assert_eq!(special(7, 0), Some(HULL_TICK));
        assert_eq!(special(6, 1), Some(2));
        assert_eq!(special(8, 1), Some(HULL_TICK));
        assert_eq!(special(4, 2), Some(2));
        assert_eq!(special(8, 2), Some(2));
        assert_eq!(special(6, 2), Some(HULL_TICK));
    }

    #[test]
    fn cracks_appear_at_ply_8_and_are_visible_ahead() {
        let mut enc = with_boss_marbles(11, 3);
        for _ in 0..7 {
            step(&mut enc);
            assert!(cracked(&enc).is_empty(), "no crack before ply 8");
        }
        step(&mut enc);
        let cells = cracked(&enc);
        assert_eq!(cells.len(), 1, "one cell in phase 1");
        assert_eq!(radius(cells[0]), 4, "a rim cell");
        assert_eq!(
            enc.game().board().get(cells[0].0, cells[0].1),
            Some(Cell::Empty)
        );
    }

    #[test]
    fn cracked_cells_vanish_two_plies_later() {
        let mut enc = with_boss_marbles(11, 3);
        play(&mut enc, 8);
        let (q, r) = cracked(&enc)[0];
        step(&mut enc);
        assert_eq!(cracked(&enc), vec![(q, r)], "still cracked after ply 9");
        assert!(enc.game().board().get(q, r).is_some());
        step(&mut enc);
        assert_eq!(enc.game().board().get(q, r), None, "vanished after ply 10");
        assert!(cracked(&enc).is_empty());
        assert_eq!(marbles(enc.game().board(), Cell::White), 11);
    }

    #[test]
    fn phase_two_cracks_two_cells_every_6_plies() {
        let mut enc = with_boss_marbles(10, 3);
        assert_eq!(enc.phase(), 1);
        play(&mut enc, 5);
        assert!(cracked(&enc).is_empty());
        step(&mut enc);
        let cells = cracked(&enc);
        assert_eq!(cells.len(), 2);
        assert_ne!(cells[0], cells[1]);
        assert!(cells.iter().all(|&c| radius(c) == 4));
        play(&mut enc, 2);
        assert!(cracked(&enc).is_empty(), "vanished at ply 8");
        assert!(cells
            .iter()
            .all(|&(q, r)| enc.game().board().get(q, r).is_none()));
    }

    #[test]
    fn phase_three_cracks_two_cells_every_4_plies() {
        let mut enc = with_boss_marbles(5, 3);
        assert_eq!(enc.phase(), 2);
        play(&mut enc, 3);
        assert!(cracked(&enc).is_empty());
        step(&mut enc);
        assert_eq!(cracked(&enc).len(), 2);
        play(&mut enc, 2);
        assert!(cracked(&enc).is_empty(), "vanished at ply 6");
    }

    #[test]
    fn eleven_boss_marbles_is_still_phase_one() {
        assert_eq!(with_boss_marbles(11, 0).phase(), 0);
    }

    #[test]
    fn same_seed_same_cracks_and_seed_matters() {
        let run = |seed| {
            let mut enc = with_boss_marbles(11, seed);
            play(&mut enc, 8);
            cracked(&enc)
        };
        assert_eq!(run(7), run(7));
        let all: Vec<_> = (0..16).map(run).collect();
        assert!(all.iter().any(|c| *c != all[0]), "seed changes the choice");
    }

    #[test]
    fn marble_on_a_vanished_cell_is_ejected_for_either_side() {
        let ring = cells_at(4);
        let mut black_ring = encounter(&ring, &block(11), 5);
        play(&mut black_ring, 10);
        let b = black_ring.game();
        assert_eq!(marbles(b.board(), Cell::Black), 1 + 24 - 1);
        assert_eq!(b.ejected(Player::White), 1, "boss credited");
        assert_eq!(b.ejected(Player::Black), 0);

        let mut white_ring = encounter(&[], &[block(11), ring].concat(), 5);
        play(&mut white_ring, 10);
        let w = white_ring.game();
        assert_eq!(marbles(w.board(), Cell::White), 1 + 11 + 24 - 1);
        assert_eq!(w.ejected(Player::Black), 1, "player credited");
        assert_eq!(w.ejected(Player::White), 0);
    }

    #[test]
    fn vanished_cell_rejects_a_move_onto_it() {
        let mut board = Board::empty();
        board.set(3, 0, Cell::Black);
        board.void(4, 0);
        let m = Move {
            cells: vec![(3, 0)],
            dir: E,
        };
        assert_eq!(apply(&board, Player::Black, &m), Err(MoveError::OffBoard));
        assert!(!legal_moves(&board, Player::Black).contains(&m));
    }

    #[test]
    fn pushing_a_marble_onto_a_vanished_cell_ejects_it() {
        let mut board = Board::empty();
        board.set(1, 0, Cell::Black);
        board.set(2, 0, Cell::Black);
        board.set(3, 0, Cell::White);
        board.void(4, 0);
        let m = Move {
            cells: vec![(1, 0), (2, 0)],
            dir: E,
        };
        let (next, ejected) = apply(&board, Player::Black, &m).unwrap();
        assert!(ejected);
        assert_eq!(marbles(&next, Cell::White), 0);
    }

    #[test]
    fn hook_vanishes_due_cracks_and_ticks_the_others() {
        let mut board = Board::empty();
        board.set(4, 0, Cell::Black);
        board.set_cracks(vec![((4, 0), 1), ((0, 4), 2)]);
        let out = hull_hook(&board, HULL_TICK, 1);
        assert_eq!(out.get(4, 0), None);
        assert_eq!(out.cracks(), &[((0, 4), 1)]);
    }

    #[test]
    fn hook_cracks_nothing_when_no_cell_is_left() {
        let mut board = Board::empty();
        for q in -MAX_RADIUS..=MAX_RADIUS {
            for r in -MAX_RADIUS..=MAX_RADIUS {
                board.void(q, r);
            }
        }
        assert!(hull_hook(&board, 2, 9).cracks().is_empty());
    }

    #[test]
    fn new_cracks_are_rim_cells_and_never_repeat_a_cracked_cell() {
        let board = Board::standard();
        for seed in 0..32 {
            let out = hull_hook(&board, 2, seed);
            let c = out.cracks();
            assert_eq!(c.len(), 2);
            assert_ne!(c[0].0, c[1].0);
            assert!(c.iter().all(|&(cell, left)| radius(cell) == 4 && left == 2));
        }
    }
}
