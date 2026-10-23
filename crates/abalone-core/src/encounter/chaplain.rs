//! The Chaplain (#45, docs/specs/game-design.md section 7.3): conversion by encirclement. At the
//! end of the boss turn a player marble with enough boss neighbours flips to the boss, at the end
//! of the player turn a boss marble with enough player neighbours flips back. Flips keep the
//! marble count and credit no ejection. P2 counts void cells as boss neighbours, P3 chains one
//! more wave of flips and pays for each flip with a boss marble lost to the void.

use crate::board::Board;
use crate::encounter::{BossDef, Encounter};

/// Boss neighbours that flip a player marble. TUNE.
pub const CHAPLAIN_FLIP_THRESHOLD: usize = 3;
/// Player neighbours that flip a boss marble back. TUNE.
pub const CHAPLAIN_RESTORE_THRESHOLD: usize = 3;
/// P2 and P3 start at this many boss marbles left. TUNE.
pub const CHAPLAIN_PHASE_MARBLES: [u8; 2] = [8, 4];
/// Positions the boss search may visit per move. TUNE.
pub const CHAPLAIN_NODE_BUDGET: u32 = 2000;
/// First phase (0 based) where void cells count as boss neighbours.
pub const CHAPLAIN_VOID_PHASE: usize = 1;
/// First phase (0 based) where a flip chains once more.
pub const CHAPLAIN_CHAIN_PHASE: usize = 2;
/// Special id at the end of the player turn: boss marbles flip back.
pub const CHAPLAIN_PLAYER_END: u8 = 1;
/// Special id at the end of the boss turn is this plus the phase.
pub const CHAPLAIN_BOSS_END: u8 = 2;

type P = (i32, i32);

fn special(_ply: u32, _phase: usize) -> Option<u8> {
    None
}

fn hook(board: &Board, _id: u8, _seed: u64) -> Board {
    board.clone()
}

/// Player marbles that flip at the end of the next boss turn if nothing moves.
pub fn chaplain_tell(_enc: &Encounter) -> Vec<P> {
    Vec::new()
}

/// The Chaplain boss.
pub fn chaplain_boss() -> BossDef {
    BossDef {
        name: "The Chaplain",
        phase_marbles: CHAPLAIN_PHASE_MARBLES.to_vec(),
        special,
        hook,
        node_budget: CHAPLAIN_NODE_BUDGET,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Board, Cell, RADIUS};
    use crate::encounter::{marbles, Encounter};
    use crate::game::Game;
    use crate::moves::Direction::{E, W};
    use crate::moves::{Move, Player};

    /// Black's shuffle marble walks this pair, White's walks the other: far from every test cell.
    const BLACK_SHUFFLE: [P; 2] = [(0, 3), (-1, 3)];
    const WHITE_SHUFFLE: [P; 2] = [(0, -3), (1, -3)];
    /// Extra boss marbles on the far left, to push the boss count into a chosen phase.
    const FILLER: [P; 9] = [
        (-4, 0),
        (-4, 1),
        (-4, 2),
        (-3, -1),
        (-3, 0),
        (-3, 1),
        (-3, 2),
        (-4, 3),
        (-4, 4),
    ];
    /// The six neighbours of (0, 0) in ring order, then the whites and the black used by the
    /// chain scenario.
    const RING_WHITES: [P; 3] = [(1, 0), (0, -1), (-1, 1)];

    fn build(black: &[P], white: &[P], fillers: usize, voids: &[P], seed: u64) -> Encounter {
        let mut board = Board::empty();
        board.set(BLACK_SHUFFLE[0].0, BLACK_SHUFFLE[0].1, Cell::Black);
        board.set(WHITE_SHUFFLE[0].0, WHITE_SHUFFLE[0].1, Cell::White);
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white.iter().chain(&FILLER[..fillers]) {
            board.set(q, r, Cell::White);
        }
        for &(q, r) in voids {
            board.void(q, r);
        }
        Encounter::new(
            Game::from_position(board, Player::Black, [0, 0]),
            chaplain_boss(),
            seed,
        )
    }

    fn enc(black: &[P], white: &[P], fillers: usize) -> Encounter {
        build(black, white, fillers, &[], 0)
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
        for q in -RADIUS..=RADIUS {
            for r in -RADIUS..=RADIUS {
                if board.get(q, r) == Some(color) {
                    out.push((q, r));
                }
            }
        }
        out
    }

    /// The tell, then two plies: the tell must be exactly the Black cells that became White.
    fn assert_tell_is_what_flips(mut e: Encounter) -> Vec<P> {
        let told = chaplain_tell(&e);
        let before = e.game().board().clone();
        turns(&mut e, 2);
        let after = e.game().board();
        let flipped: Vec<P> = cells_of(&before, Cell::Black)
            .into_iter()
            .filter(|&(q, r)| after.get(q, r) == Some(Cell::White))
            .collect();
        assert_eq!(told, flipped);
        told
    }

    #[test]
    fn boss_definition_matches_the_spec() {
        let b = chaplain_boss();
        assert_eq!(b.name, "The Chaplain");
        assert_eq!(b.phase_marbles, vec![8, 4]);
        assert_eq!(b.node_budget, CHAPLAIN_NODE_BUDGET);
        assert_eq!(CHAPLAIN_FLIP_THRESHOLD, 3);
        assert_eq!(CHAPLAIN_RESTORE_THRESHOLD, 3);
    }

    #[test]
    fn special_fires_after_every_ply_with_the_turn_and_the_phase() {
        assert_eq!(special(1, 0), Some(CHAPLAIN_PLAYER_END));
        assert_eq!(special(3, 2), Some(CHAPLAIN_PLAYER_END));
        assert_eq!(special(2, 0), Some(CHAPLAIN_BOSS_END));
        assert_eq!(special(4, 1), Some(CHAPLAIN_BOSS_END + 1));
        assert_eq!(special(6, 2), Some(CHAPLAIN_BOSS_END + 2));
    }

    #[test]
    fn three_boss_neighbours_flip_a_marble_at_the_end_of_the_boss_turn() {
        let mut e = enc(&[(0, 0)], &[(1, 0), (1, -1), (0, -1)], 8);
        assert_eq!(e.phase(), 0);
        let (b, w) = (count(&e, Cell::Black), count(&e, Cell::White));
        step(&mut e);
        assert_eq!(
            at(&e, (0, 0)),
            Some(Cell::Black),
            "not at the end of the player turn"
        );
        step(&mut e);
        assert_eq!(at(&e, (0, 0)), Some(Cell::White));
        assert_eq!(count(&e, Cell::Black), b - 1);
        assert_eq!(count(&e, Cell::White), w + 1);
        assert_eq!(e.game().ejected(Player::Black), 0);
        assert_eq!(e.game().ejected(Player::White), 0);
    }

    #[test]
    fn two_boss_neighbours_do_not_flip_in_phase_one() {
        let mut e = enc(&[(0, 0)], &[(1, 0), (1, -1)], 8);
        turns(&mut e, 2);
        assert_eq!(at(&e, (0, 0)), Some(Cell::Black));
    }

    #[test]
    fn three_player_neighbours_flip_a_boss_marble_back_at_the_end_of_the_player_turn() {
        let mut e = enc(&[(1, 0), (1, -1), (0, -1)], &[(0, 0)], 8);
        let (b, w) = (count(&e, Cell::Black), count(&e, Cell::White));
        step(&mut e);
        assert_eq!(at(&e, (0, 0)), Some(Cell::Black));
        assert_eq!(count(&e, Cell::Black), b + 1);
        assert_eq!(count(&e, Cell::White), w - 1);
        assert_eq!(e.game().ejected(Player::Black), 0);
        assert_eq!(e.game().ejected(Player::White), 0);
    }

    #[test]
    fn two_player_neighbours_do_not_flip_a_boss_marble_back() {
        let mut e = enc(&[(1, 0), (1, -1)], &[(0, 0)], 8);
        step(&mut e);
        assert_eq!(at(&e, (0, 0)), Some(Cell::White));
    }

    #[test]
    fn the_tell_lists_the_marbles_that_flip_next_and_matches_what_flips() {
        let doomed = enc(&[(0, 0), (1, 2)], &[(1, 0), (1, -1), (0, -1)], 8);
        assert_eq!(chaplain_tell(&doomed), vec![(0, 0)]);
        assert_eq!(assert_tell_is_what_flips(doomed), vec![(0, 0)]);
        let safe = enc(&[(0, 0)], &[(1, 0), (1, -1)], 8);
        assert_eq!(assert_tell_is_what_flips(safe), Vec::<P>::new());
    }

    #[test]
    fn breaking_contact_saves_a_told_marble() {
        let e = enc(&[(0, 0)], &[(1, 0), (1, -1), (0, -1)], 8);
        assert_eq!(chaplain_tell(&e), vec![(0, 0)]);
        let moved = enc(&[(-1, 0)], &[(1, 0), (1, -1), (0, -1)], 8);
        assert!(chaplain_tell(&moved).is_empty());
    }

    #[test]
    fn rim_marbles_flip_at_two_contacts_in_phase_two_only() {
        let rim = [(3, -2), (4, -3)];
        let p1 = enc(&[(4, -2)], &rim, 8);
        assert_eq!(p1.phase(), 0);
        assert!(chaplain_tell(&p1).is_empty());
        let mut p2 = enc(&[(4, -2)], &rim, 3);
        assert_eq!(p2.phase(), 1);
        assert_eq!(chaplain_tell(&p2), vec![(4, -2)]);
        turns(&mut p2, 2);
        assert_eq!(at(&p2, (4, -2)), Some(Cell::White));
        assert_eq!(p2.game().ejected(Player::White), 0);
    }

    #[test]
    fn off_board_cells_count_as_boss_neighbours_in_phase_two() {
        // (4, -2) has two off-board neighbours: one boss contact is enough.
        let p2 = enc(&[(4, -2)], &[(3, -2)], 3);
        assert_eq!(chaplain_tell(&p2), vec![(4, -2)]);
        let p1 = enc(&[(4, -2)], &[(3, -2)], 8);
        assert!(chaplain_tell(&p1).is_empty());
    }

    #[test]
    fn vanished_cells_count_as_boss_neighbours_in_phase_two() {
        let voids = [(1, 0), (1, -1)];
        let p2 = build(&[(0, 0)], &[(0, -1)], 3, &voids, 0);
        assert_eq!(p2.phase(), 1);
        assert_eq!(assert_tell_is_what_flips(p2), vec![(0, 0)]);
        let p1 = build(&[(0, 0)], &[(0, -1)], 8, &voids, 0);
        assert!(chaplain_tell(&p1).is_empty());
    }

    /// (0, 0) flips from its three white neighbours, then (1, -1) from two whites plus the
    /// freshly flipped (0, 0).
    fn chain(fillers: usize, seed: u64) -> Encounter {
        build(&[(0, 0), (1, -1)], &RING_WHITES, fillers, &[], seed)
    }

    #[test]
    fn phase_three_chains_one_flip_and_the_boss_pays_a_marble_per_flip() {
        let mut e = chain(0, 1);
        assert_eq!(e.phase(), 2);
        assert_eq!(count(&e, Cell::White), 4);
        assert_eq!(count(&e, Cell::Black), 3);
        assert_eq!(chaplain_tell(&e), vec![(0, 0), (1, -1)]);
        turns(&mut e, 2);
        assert_eq!(at(&e, (0, 0)), Some(Cell::White));
        assert_eq!(at(&e, (1, -1)), Some(Cell::White));
        assert_eq!(count(&e, Cell::Black), 1, "two marbles converted");
        assert_eq!(
            count(&e, Cell::White),
            4,
            "two gained, two lost to the void"
        );
        assert_eq!(
            e.game().ejected(Player::Black),
            2,
            "player credited per loss"
        );
        assert_eq!(e.game().ejected(Player::White), 0);
    }

    #[test]
    fn phase_three_tell_matches_the_chain() {
        assert_eq!(
            assert_tell_is_what_flips(chain(0, 1)),
            vec![(0, 0), (1, -1)]
        );
    }

    #[test]
    fn phase_two_does_not_chain_and_costs_the_boss_nothing() {
        let mut e = chain(1, 1);
        assert_eq!(e.phase(), 1);
        turns(&mut e, 2);
        assert_eq!(at(&e, (0, 0)), Some(Cell::White));
        assert_eq!(at(&e, (1, -1)), Some(Cell::Black));
        assert_eq!(count(&e, Cell::White), 6);
        assert_eq!(e.game().ejected(Player::Black), 0);
    }

    #[test]
    fn same_seed_same_game_and_the_seed_picks_the_lost_marbles() {
        let run = |seed| {
            let mut e = chain(0, seed);
            turns(&mut e, 4);
            e.game().board().clone()
        };
        assert_eq!(run(3), run(3));
        let boards: Vec<Board> = (0..16).map(run).collect();
        assert!(
            boards.iter().any(|b| *b != boards[0]),
            "seed changes the loss"
        );
    }
}
