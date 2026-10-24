//! The Chaplain (#45, docs/specs/game-design.md section 7.3): conversion by encirclement. At the
//! end of the boss turn a player marble with enough boss neighbours flips to the boss, at the end
//! of the player turn a boss marble with enough player neighbours flips back. Flips keep the
//! marble count and credit no ejection. P2 counts void cells as boss neighbours, P3 chains one
//! more wave of flips and pays for each flip with a boss marble lost to the void.

use crate::board::{Board, Cell, MAX_RADIUS};
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
    for q in -MAX_RADIUS..=MAX_RADIUS {
        for r in -MAX_RADIUS..=MAX_RADIUS {
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
        for q in -MAX_RADIUS..=MAX_RADIUS {
            for r in -MAX_RADIUS..=MAX_RADIUS {
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
        let seed = free_seed();
        let mut e = build(&[(0, 0)], &[(1, 0), (1, -1), (0, -1)], 8, &[], seed);
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

    /// Like `enc`, with `converted` marked as converted boss marbles.
    fn with_converted(black: &[P], white: &[P], converted: &[P], fillers: usize) -> Encounter {
        let e = enc(black, white, fillers);
        let mut board = e.game().board().clone();
        board.set_converted(converted.to_vec());
        Encounter::new(
            Game::from_position(board, Player::Black, [0, 0]),
            chaplain_boss(),
            0,
        )
    }

    #[test]
    fn a_native_boss_marble_never_flips_back() {
        let mut e = enc(&[(1, 0), (1, -1), (0, -1)], &[(0, 0)], 8);
        step(&mut e);
        assert_eq!(at(&e, (0, 0)), Some(Cell::White));
    }

    #[test]
    fn three_player_neighbours_flip_a_converted_marble_back_at_the_end_of_the_player_turn() {
        let mut e = with_converted(&[(1, 0), (1, -1), (0, -1)], &[(0, 0)], &[(0, 0)], 8);
        let (b, w) = (count(&e, Cell::Black), count(&e, Cell::White));
        step(&mut e);
        assert_eq!(at(&e, (0, 0)), Some(Cell::Black));
        assert_eq!(count(&e, Cell::Black), b + 1);
        assert_eq!(count(&e, Cell::White), w - 1);
        assert_eq!(e.game().ejected(Player::Black), 0);
        assert_eq!(e.game().ejected(Player::White), 0);
        assert!(
            e.game().board().converted().is_empty(),
            "no longer converted"
        );
    }

    #[test]
    fn two_player_neighbours_do_not_flip_a_converted_marble_back() {
        let mut e = with_converted(&[(1, 0), (1, -1)], &[(0, 0)], &[(0, 0)], 8);
        step(&mut e);
        assert_eq!(at(&e, (0, 0)), Some(Cell::White));
    }

    #[test]
    fn a_flipped_marble_is_remembered_and_flips_back_when_surrounded() {
        let mut e = enc(
            &[(0, 0), (-1, 0), (-1, 1), (0, 1)],
            &[(1, 0), (1, -1), (0, -1)],
            8,
        );
        turns(&mut e, 2);
        assert_eq!(at(&e, (0, 0)), Some(Cell::White));
        assert_eq!(e.game().board().converted(), &[(0, 0)]);
        step(&mut e);
        assert_eq!(at(&e, (0, 0)), Some(Cell::Black), "three Black neighbours");
        assert!(e.game().board().converted().is_empty());
    }

    #[test]
    fn a_converted_marble_keeps_its_mark_when_it_moves() {
        let blacks = [(-2, 0), (-2, 1), (-1, 1)];
        let mut e = with_converted(&blacks, &[(0, 0), (1, 0), (1, -1), (0, -1)], &[(0, 0)], 4);
        step(&mut e);
        e.play(&Move {
            cells: vec![(0, 0)],
            dir: W,
        })
        .unwrap();
        assert_eq!(e.game().board().converted(), &[(-1, 0)]);
        step(&mut e);
        assert_eq!(
            at(&e, (-1, 0)),
            Some(Cell::Black),
            "surrounded after it moved"
        );
    }

    #[test]
    fn a_converted_marble_pushed_by_a_sumito_keeps_its_mark() {
        let mut e = with_converted(
            &[(-2, 0), (-1, 0), (2, -1), (1, 1)],
            &[(0, 0)],
            &[(0, 0)],
            8,
        );
        e.play(&Move {
            cells: vec![(-2, 0), (-1, 0)],
            dir: E,
        })
        .unwrap();
        assert_eq!(
            at(&e, (1, 0)),
            Some(Cell::Black),
            "pushed to (1, 0), then flipped back"
        );
        assert!(e.game().board().converted().is_empty());
    }

    #[test]
    fn a_converted_marble_pushed_off_the_board_loses_its_mark() {
        let mut e = with_converted(&[(2, 0), (3, 0)], &[(4, 0)], &[(4, 0)], 8);
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
    fn off_board_cells_add_one_boss_contact_however_many_there_are() {
        // (4, -2) has two off-board neighbours, (4, -4) has three: both add 1, so 1 contact
        // is not enough and 2 are.
        for (rim, contacts) in [((4, -2), [(3, -2), (4, -3)]), ((4, -4), [(3, -3), (4, -3)])] {
            let one = enc(&[rim], &contacts[..1], 3);
            assert_eq!(one.phase(), 1);
            assert!(chaplain_tell(&one).is_empty(), "{rim:?} with 1 contact");
            let two = enc(&[rim], &contacts, 3);
            assert_eq!(chaplain_tell(&two), vec![rim], "{rim:?} with 2 contacts");
        }
        let none = enc(&[(4, -4)], &[], 3);
        assert!(chaplain_tell(&none).is_empty());
    }

    #[test]
    fn vanished_cells_count_as_boss_neighbours_in_phase_two() {
        let voids = [(1, 0), (1, -1)];
        let p2 = build(&[(0, 0)], &[(0, -1), (0, 1)], 3, &voids, 0);
        assert_eq!(p2.phase(), 1);
        assert_eq!(assert_tell_is_what_flips(p2), vec![(0, 0)]);
        let one = build(&[(0, 0)], &[(0, -1)], 3, &voids, 0);
        assert!(chaplain_tell(&one).is_empty(), "two voids still add 1");
        let p1 = build(&[(0, 0)], &[(0, -1), (0, 1)], 8, &voids, 0);
        assert!(chaplain_tell(&p1).is_empty());
    }

    /// One flip in phase one with this encounter seed, two plies played: the boss marble count
    /// afterwards and the player's ejected count.
    fn one_flip(seed: u64) -> (u8, u8) {
        let mut e = build(&[(0, 0)], &[(1, 0), (1, -1), (0, -1)], 8, &[], seed);
        turns(&mut e, 2);
        assert_eq!(at(&e, (0, 0)), Some(Cell::White));
        (count(&e, Cell::White), e.game().ejected(Player::Black))
    }

    /// A seed whose flip is free (the boss keeps the marble it gained).
    fn free_seed() -> u64 {
        (0..64).find(|&s| one_flip(s).1 == 0).unwrap()
    }

    #[test]
    fn a_flip_costs_the_boss_a_marble_three_times_in_four() {
        let paid = (0..64).filter(|&s| one_flip(s).1 == 1).count();
        assert!((40..=56).contains(&paid), "paid {paid} of 64");
        let w = 13;
        assert_eq!(one_flip(free_seed()), (w, 0), "free: the flip is a gain");
        let seed = (0..64).find(|&s| one_flip(s).1 == 1).unwrap();
        assert_eq!(one_flip(seed), (w - 1, 1), "paid: one lost, credited");
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
    fn nothing_flips_without_contact_in_any_phase() {
        for fillers in [8, 3, 0] {
            let mut e = enc(&[(0, 0)], &[], fillers);
            let (b, w) = (count(&e, Cell::Black), count(&e, Cell::White));
            turns(&mut e, 4);
            assert_eq!((count(&e, Cell::Black), count(&e, Cell::White)), (b, w));
            assert_eq!(e.game().ejected(Player::Black), 0);
        }
    }

    #[test]
    fn phase_two_does_not_chain_and_a_free_flip_costs_nothing() {
        let mut e = chain(1, free_seed());
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
            turns(&mut e, 2);
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
