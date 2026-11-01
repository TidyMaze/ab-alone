//! The Hull (#43, docs/specs/game-design.md section 7.1): at the end of a boss turn every few
//! turns one cell cracks, two player turns later it vanishes, and a marble on a vanished cell is
//! removed, either side. The crack timers live on the board (`Board::cracks`, in player turns), so
//! the tell is `board.cracks()`: the cells that vanish soon.

use crate::board::Board;
use crate::encounter::{losses, BossDef, Encounter};
use crate::moves::{Move, Player};
use crate::search::{search_hooked, DEFAULT_WEIGHTS};

/// Player turns between a crack appearing and the cell vanishing.
pub const HULL_CRACK_LEAD: u8 = 2;
/// Boss turns between two cracks, per phase (phase 1, 2 and 3). TUNE.
pub const HULL_TURNS: [u32; 3] = [4, 4, 2];
/// P2 and P3 start after this many ejections credited to the player. TUNE.
pub const HULL_PHASE_EJECTIONS: [u8; 2] = [3, 5];
/// Positions the boss search may visit per move (about depth 3). TUNE.
pub const HULL_NODE_BUDGET: u32 = 3000;
/// Special id at the end of a player turn: the cracks count down, the ones at zero vanish.
pub const HULL_PLAYER_END: u8 = 0;
/// Special id at the end of a boss turn with no crack.
pub const HULL_BOSS_END: u8 = 1;
/// Special id of a new crack on a rim cell (P1).
pub const HULL_CRACK_RIM: u8 = 2;
/// Special id of a new crack on a cell off the rim, a rim cell if none is left (P2).
pub const HULL_CRACK_INNER: u8 = 3;
/// Special id of a new crack on any cell (P3).
pub const HULL_CRACK_ANY: u8 = 4;
/// The kind of new crack, per phase.
pub(crate) const HULL_CRACKS: [u8; 3] = [HULL_CRACK_RIM, HULL_CRACK_INNER, HULL_CRACK_ANY];

pub(crate) const NEIGHBOURS: [(i32, i32); 6] = [(1, 0), (-1, 0), (1, -1), (-1, 1), (0, -1), (0, 1)];

/// Special id of the ply that just ended: the player's (odd plies, Black moves first), or a boss
/// turn that cracks a cell (every `HULL_TURNS` of the phase) or not.
fn special(ply: u32, phase: usize) -> Option<u8> {
    Some(if ply % 2 == 1 {
        HULL_PLAYER_END
    } else if (ply / 2).is_multiple_of(HULL_TURNS[phase]) {
        HULL_CRACKS[phase]
    } else {
        HULL_BOSS_END
    })
}

/// On-board cells not already cracked, each with whether it has a missing neighbour (off the
/// board or vanished): a rim cell.
fn free_cells(board: &Board, cracked: &[((i32, i32), u8)]) -> Vec<((i32, i32), bool)> {
    let mut out = Vec::new();
    let radius = board.radius();
    for q in -radius..=radius {
        for r in -radius..=radius {
            let open = NEIGHBOURS
                .iter()
                .any(|&(dq, dr)| board.get(q + dq, r + dr).is_none());
            if board.get(q, r).is_some() && !cracked.iter().any(|&(c, _)| c == (q, r)) {
                out.push(((q, r), open));
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

/// A player turn counts the timers down and removes the cells that reach zero (with their
/// marbles). A crack id then cracks one new cell of that kind, chosen by `seed`.
fn hull_hook(board: &Board, id: u8, seed: u64) -> Board {
    let mut out = board.clone();
    let mut cracked = Vec::new();
    for &(c, left) in board.cracks() {
        if id != HULL_PLAYER_END {
            cracked.push((c, left));
        } else if left <= 1 {
            out.void(c.0, c.1);
        } else {
            cracked.push((c, left - 1));
        }
    }
    if id >= HULL_CRACK_RIM {
        let free = free_cells(&out, &cracked);
        let of_kind = |rim: bool| {
            free.iter()
                .filter(move |&&(_, r)| r == rim)
                .map(|&(c, _)| c)
        };
        let mut candidates: Vec<_> = match id {
            HULL_CRACK_RIM => of_kind(true).collect(),
            HULL_CRACK_INNER => of_kind(false).collect(),
            _ => free.iter().map(|&(c, _)| c).collect(),
        };
        if candidates.is_empty() && id == HULL_CRACK_INNER {
            candidates = of_kind(true).collect();
        }
        if !candidates.is_empty() {
            let state = mix(seed);
            cracked.push((
                candidates[(state % candidates.len() as u64) as usize],
                HULL_CRACK_LEAD,
            ));
        }
    }
    out.set_cracks(cracked);
    out
}

/// The Hull boss: standard Abalone search, a crumbling board.
pub fn hull_boss() -> BossDef {
    BossDef {
        name: "The Hull",
        phase_marbles: Vec::new(),
        phase_ejections: HULL_PHASE_EJECTIONS.to_vec(),
        special,
        hook: hull_hook,
        conversions: None,
        node_budget: HULL_NODE_BUDGET,
    }
}

/// One ply of the boss search tree: a player ply ticks the cracks down and vanishes the due cells
/// with their marbles, each side credited with the other's losses. A boss ply adds no crack: where
/// the next one falls is drawn from the seed, which the tree does not know.
pub(crate) fn hull_step(_: &Board, mover: Player, _: &Move, after: Board) -> (Board, [u8; 2]) {
    if mover == Player::White {
        return (after, [0, 0]);
    }
    let out = hull_hook(&after, HULL_PLAYER_END, 0);
    let [black, white] = losses(&after, &out);
    (out, [white, black])
}

/// The boss reply: its node-limited search, where every player ply of the tree goes through the
/// crack timers, so it pushes player marbles onto announced cracks and keeps its own off them.
/// `None` on the player's turn or when the game is over.
pub fn hull_move(enc: &Encounter) -> Option<Move> {
    if enc.game().to_move() != Player::White {
        return None;
    }
    search_hooked(
        enc.game(),
        enc.boss.node_budget,
        DEFAULT_WEIGHTS,
        &|_| true,
        &hull_step,
    )
    .map(|r| r.mv)
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

    /// Black: the shuffle marble plus `black`. White: the shuffle marble plus `white`. The player
    /// has ejected `ejected` marbles: 0 is P1, 3 is P2, 5 is P3.
    fn encounter_at(black: &[P], white: &[P], ejected: u8, seed: u64) -> Encounter {
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
            Game::from_position(board, Player::Black, [ejected, 0]),
            hull_boss(),
            seed,
        )
    }

    fn encounter(black: &[P], white: &[P], seed: u64) -> Encounter {
        encounter_at(black, white, 0, seed)
    }

    /// Hull encounter in the phase the player's `ejected` marbles give.
    fn with_ejections(ejected: u8, seed: u64) -> Encounter {
        encounter_at(&[], &block(11), ejected, seed)
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

    /// Plays `turns` player turns: a player move and the boss reply each.
    fn play(enc: &mut Encounter, turns: usize) {
        for _ in 0..2 * turns {
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
        assert!(b.phase_marbles.is_empty());
        assert_eq!(b.phase_ejections, vec![3, 5], "P2 after 3, P3 after 5");
        assert_eq!(b.node_budget, HULL_NODE_BUDGET);
    }

    #[test]
    fn phases_follow_the_ejections_not_the_marbles() {
        for (ejected, phase) in [(0, 0), (2, 0), (3, 1), (4, 1), (5, 2)] {
            assert_eq!(with_ejections(ejected, 0).phase(), phase, "{ejected}");
        }
        assert_eq!(
            encounter(&[], &block(5), 0).phase(),
            0,
            "marbles do not count"
        );
    }

    #[test]
    fn special_schedule_follows_the_turn_and_the_phase() {
        assert_eq!(special(1, 0), Some(HULL_PLAYER_END));
        assert_eq!(special(2, 0), Some(HULL_BOSS_END));
        assert_eq!(special(8, 0), Some(HULL_CRACK_RIM));
        assert_eq!(special(16, 0), Some(HULL_CRACK_RIM));
        assert_eq!(special(6, 1), Some(HULL_BOSS_END));
        assert_eq!(special(8, 1), Some(HULL_CRACK_INNER));
        assert_eq!(special(4, 2), Some(HULL_CRACK_ANY));
        assert_eq!(special(12, 2), Some(HULL_CRACK_ANY));
        assert_eq!(special(6, 2), Some(HULL_BOSS_END));
        assert_eq!(special(7, 2), Some(HULL_PLAYER_END));
    }

    #[test]
    fn p1_cracks_one_rim_cell_after_the_4th_turn_and_it_is_announced() {
        let mut enc = with_ejections(0, 3);
        for _ in 0..7 {
            step(&mut enc);
            assert!(
                cracked(&enc).is_empty(),
                "no crack before the 4th boss turn"
            );
        }
        step(&mut enc);
        let cells = cracked(&enc);
        assert_eq!(cells.len(), 1, "one cell");
        assert_eq!(radius(cells[0]), 4, "a rim cell");
        assert_eq!(enc.game().board().cracks()[0].1, 2, "2 player turns ahead");
        assert_eq!(
            enc.game().board().get(cells[0].0, cells[0].1),
            Some(Cell::Empty)
        );
    }

    #[test]
    fn a_crack_vanishes_after_two_more_player_turns() {
        let mut enc = with_ejections(0, 3);
        play(&mut enc, 4);
        let (q, r) = cracked(&enc)[0];
        step(&mut enc);
        assert_eq!(
            enc.game().board().cracks()[0].1,
            1,
            "ticks at the player's move"
        );
        step(&mut enc);
        assert_eq!(enc.game().board().cracks()[0].1, 1, "not at the boss reply");
        step(&mut enc);
        assert_eq!(
            enc.game().board().get(q, r),
            None,
            "vanished after the 2nd move"
        );
        assert!(cracked(&enc).is_empty());
    }

    #[test]
    fn p2_cracks_an_inner_cell_every_4_turns() {
        for seed in 0..8 {
            let mut enc = with_ejections(3, seed);
            play(&mut enc, 3);
            assert!(cracked(&enc).is_empty());
            play(&mut enc, 1);
            let cells = cracked(&enc);
            assert_eq!(cells.len(), 1);
            assert!(radius(cells[0]) < 4, "not on the rim: {cells:?}");
        }
    }

    #[test]
    fn p3_cracks_any_cell_every_2_turns() {
        let mut rim = 0;
        for seed in 0..32 {
            let mut enc = with_ejections(5, seed);
            play(&mut enc, 1);
            assert!(cracked(&enc).is_empty());
            play(&mut enc, 1);
            let cells = cracked(&enc);
            assert_eq!(cells.len(), 1);
            rim += usize::from(radius(cells[0]) == 4);
        }
        assert!(rim > 0 && rim < 32, "any cell, rim or inner: {rim}");
    }

    #[test]
    fn same_seed_same_cracks_and_seed_matters() {
        let run = |seed| {
            let mut enc = with_ejections(0, seed);
            play(&mut enc, 4);
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
        play(&mut black_ring, 6);
        let b = black_ring.game();
        assert_eq!(marbles(b.board(), Cell::Black), 1 + 24 - 1);
        assert_eq!(b.ejected(Player::White), 1, "boss credited");
        assert_eq!(b.ejected(Player::Black), 0);

        let mut white_ring = encounter(&[], &[block(11), ring].concat(), 5);
        play(&mut white_ring, 6);
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
    fn the_player_turn_end_vanishes_due_cracks_and_ticks_the_others() {
        let mut board = Board::empty();
        board.set(4, 0, Cell::Black);
        board.set_cracks(vec![((4, 0), 1), ((0, 4), 2)]);
        let out = hull_hook(&board, HULL_PLAYER_END, 1);
        assert_eq!(out.get(4, 0), None);
        assert_eq!(out.cracks(), &[((0, 4), 1)]);
    }

    #[test]
    fn the_boss_turn_end_keeps_the_timers() {
        let mut board = Board::empty();
        board.set_cracks(vec![((4, 0), 1)]);
        let out = hull_hook(&board, HULL_BOSS_END, 1);
        assert_eq!(out.cracks(), &[((4, 0), 1)]);
        assert_eq!(out.get(4, 0), Some(Cell::Empty));
    }

    #[test]
    fn hook_cracks_nothing_when_no_cell_is_left() {
        let mut board = Board::empty();
        for q in -MAX_RADIUS..=MAX_RADIUS {
            for r in -MAX_RADIUS..=MAX_RADIUS {
                board.void(q, r);
            }
        }
        for id in [HULL_CRACK_RIM, HULL_CRACK_INNER, HULL_CRACK_ANY] {
            assert!(hull_hook(&board, id, 9).cracks().is_empty());
        }
    }

    #[test]
    fn a_new_crack_follows_its_kind_and_never_repeats_a_cracked_cell() {
        let board = Board::standard();
        for seed in 0..32 {
            for (id, rim, inner) in [
                (HULL_CRACK_RIM, true, false),
                (HULL_CRACK_INNER, false, true),
            ] {
                let out = hull_hook(&board, id, seed);
                let c = out.cracks();
                assert_eq!(c.len(), 1);
                assert_eq!(c[0].1, HULL_CRACK_LEAD);
                assert_eq!(radius(c[0].0) == 4, rim, "kind {id}");
                assert_eq!(radius(c[0].0) < 4, inner, "kind {id}");
            }
            let mut again = board.clone();
            again.set_cracks(vec![((0, 0), 2)]);
            let out = hull_hook(&again, HULL_CRACK_ANY, seed);
            assert_eq!(out.cracks().len(), 2);
            assert_ne!(out.cracks()[0].0, out.cracks()[1].0);
        }
    }

    #[test]
    fn an_inner_crack_falls_back_to_the_rim_when_no_inner_cell_is_left() {
        let mut board = Board::empty();
        for q in -MAX_RADIUS..=MAX_RADIUS {
            for r in -MAX_RADIUS..=MAX_RADIUS {
                if radius((q, r)) < 4 {
                    board.void(q, r);
                }
            }
        }
        let out = hull_hook(&board, HULL_CRACK_INNER, 4);
        assert_eq!(out.cracks().len(), 1);
        assert_eq!(radius(out.cracks()[0].0), 4);
    }

    /// White to move with one White marble on a crack that vanishes after the next player move,
    /// another White marble elsewhere and one Black marble.
    fn doomed_white() -> Encounter {
        let mut board = Board::empty();
        board.set(0, 0, Cell::White);
        board.set(-3, 3, Cell::White);
        board.set(2, 0, Cell::Black);
        board.set_cracks(vec![((0, 0), 1)]);
        Encounter::new(
            Game::from_position(board, Player::White, [0, 0]),
            hull_boss(),
            1,
        )
    }

    #[test]
    fn the_hull_moves_its_marble_off_a_crack_about_to_vanish() {
        let enc = doomed_white();
        let plain = enc.boss_search().unwrap().mv;
        assert_ne!(
            plain.cells,
            vec![(0, 0)],
            "the plain search leaves it there"
        );
        let mv = hull_move(&enc).unwrap();
        assert_eq!(mv.cells, vec![(0, 0)], "the Hull saves its marble");
    }

    /// White to move with a two-marble push west that lands a Black marble on a crack, Black
    /// already having another marble on a crack that vanishes after its next move: it can save
    /// only one of them. The lone White marble gives the plain search another good move.
    fn push_onto_crack() -> Encounter {
        let mut board = Board::empty();
        board.set(3, 0, Cell::White);
        board.set(2, 0, Cell::White);
        board.set(1, 0, Cell::Black);
        board.set(-1, 0, Cell::White);
        board.set(0, -4, Cell::Black);
        board.set_cracks(vec![((0, 0), 1), ((0, -4), 1)]);
        Encounter::new(
            Game::from_position(board, Player::White, [0, 0]),
            hull_boss(),
            1,
        )
    }

    #[test]
    fn the_hull_pushes_a_player_marble_onto_an_announced_crack() {
        let enc = push_onto_crack();
        let push = Move {
            cells: vec![(2, 0), (3, 0)],
            dir: W,
        };
        assert_ne!(
            enc.boss_search().unwrap().mv,
            push,
            "the plain search ignores the crack"
        );
        assert_eq!(
            hull_move(&enc),
            Some(push),
            "the Hull pushes it onto the crack"
        );
    }

    #[test]
    fn the_hull_does_not_reply_on_the_player_turn() {
        let enc = encounter(&[], &block(3), 0);
        assert_eq!(hull_move(&enc), None);
    }

    #[test]
    fn the_hull_step_credits_each_side_with_the_other_sides_vanished_marbles() {
        let mut board = Board::empty();
        board.set(0, 0, Cell::Black);
        board.set(1, 0, Cell::White);
        board.set(2, 0, Cell::White);
        board.set_cracks(vec![((0, 0), 1), ((1, 0), 1), ((2, 0), 2)]);
        let m = Move {
            cells: vec![(0, 0)],
            dir: E,
        };
        let (out, credits) = hull_step(&board, Player::Black, &m, board.clone());
        assert_eq!(marbles(&out, Cell::Black), 0);
        assert_eq!(marbles(&out, Cell::White), 1);
        assert_eq!(credits, [1, 1], "[to Black, to White]");
        let (same, none) = hull_step(&board, Player::White, &m, board.clone());
        assert_eq!(same, board, "a boss ply ticks nothing");
        assert_eq!(none, [0, 0]);
    }
}
