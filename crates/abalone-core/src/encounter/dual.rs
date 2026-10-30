//! The Dual Room (#796, docs/specs/game-design.md section 7.15): two radius 4 rooms side by side,
//! split by a wall. One board of two hexes with a flag ([`Dual`]): the south room on the rows
//! `r >= 0`, the north room on `r <= -1`, and the wall between them blocks like a marble that never
//! moves (`moves::apply_for` asks `Board::walled`). A marble pushed off comes back one ply later in
//! the other room, on the mirror of its cell in P1, on a random empty rim cell of the emptier room
//! in P2; in P3 the wall collapses and ejected marbles are gone. Every ejection counts. Every random
//! pick is splitmix64 of the fight seed and the ply, so every peer gets the same fight.

use crate::board::{room, Board, Cell, Dual};
use crate::encounter::hull::{mix, NEIGHBOURS};
use crate::encounter::{BossDef, Encounter};
use crate::game::Game;
use crate::moves::{Move, Player};
use crate::search::{search_hooked, DEFAULT_WEIGHTS};

type P = (i32, i32);

/// P2 and P3 start after this many boss marbles ejected. TUNE.
pub const DUAL_PHASE_EJECTIONS: [u8; 2] = [3, 5];
/// Positions the boss search may visit per move. TUNE.
pub const DUAL_NODE_BUDGET: u32 = 3000;
/// The centres of the two radius 4 rooms, south then north: they touch along the wall.
pub const ROOMS: [P; 2] = [(-2, 4), (3, -5)];
/// The board scan of [`Board::radius`]: both rooms fit in `|q|, |r|, |q + r| <= 9`.
pub const DUAL_RADIUS: i32 = 9;
/// The player's start in the south room, on its far side; the north room holds its mirror.
pub const PLAYER_START: [P; 7] = [
    (-6, 8),
    (-5, 8),
    (-4, 8),
    (-3, 8),
    (-2, 8),
    (-4, 7),
    (-3, 7),
];
/// The boss's start in the south room, against the wall; the north room holds its mirror.
pub const BOSS_START: [P; 5] = [(-1, 0), (0, 0), (1, 0), (-1, 1), (0, 1)];

/// Hex distance between two cells.
pub fn distance(a: P, b: P) -> i32 {
    let (dq, dr) = (a.0 - b.0, a.1 - b.1);
    (dq.abs() + dr.abs() + (dq + dr).abs()) / 2
}

/// The cell symmetric to `cell` across the wall: its mirror in the rooms' own coordinates, on the
/// same row counted from the wall.
pub fn mirror((q, r): P) -> P {
    let shift = i32::from(room((q, r)) == 0);
    (q + r + shift, -1 - r)
}

/// Whether `cell` is a rim cell: a neighbour of it is off the board.
pub fn rim(board: &Board, (q, r): P) -> bool {
    NEIGHBOURS
        .iter()
        .any(|&(dq, dr)| board.get(q + dq, r + dr).is_none())
}

/// The phase after `ejections` boss marbles ejected: 0 to 2.
fn phase(ejections: u8) -> usize {
    DUAL_PHASE_EJECTIONS
        .iter()
        .filter(|&&t| ejections >= t)
        .count()
}

/// The cells of `board`, in `q` then `r` order.
fn cells(board: &Board) -> impl Iterator<Item = P> + '_ {
    let radius = board.radius();
    (-radius..=radius)
        .flat_map(move |q| (-radius..=radius).map(move |r| (q, r)))
        .filter(|&(q, r)| board.get(q, r).is_some())
}

/// The empty cell of the room of `cell` nearest to it (itself when empty), the lowest `q`, then
/// `r`, on a tie.
fn nearest_empty(board: &Board, cell: P) -> P {
    cells(board)
        .filter(|&(q, r)| room((q, r)) == room(cell) && board.get(q, r) == Some(Cell::Empty))
        .min_by_key(|&c| distance(c, cell))
        .expect("a room never fills up")
}

/// Where a marble pushed off from `from` lands, announced now: the mirror (P1), or a rim cell of
/// the emptier room drawn by `seed` (P2).
fn landing(board: &Board, from: P, phase: usize, seed: u64) -> P {
    if phase == 0 {
        return nearest_empty(board, mirror(from));
    }
    let mut count = [0; 2];
    for (q, r) in cells(board) {
        count[room((q, r))] += usize::from(board.get(q, r) != Some(Cell::Empty));
    }
    let left = room(from);
    let target = if count[left] < count[1 - left] {
        left
    } else {
        1 - left
    };
    let spots: Vec<P> = cells(board)
        .filter(|&c| room(c) == target && board.get(c.0, c.1) == Some(Cell::Empty) && rim(board, c))
        .collect();
    spots[(mix(seed) % spots.len() as u64) as usize]
}

/// The marble `mv` pushed off `before` and the cell it left, `None` when it ejected none.
fn pushed_off(before: &Board, mv: &Move) -> Option<(Cell, P)> {
    let (dq, dr) = mv.dir.vector();
    mv.cells.iter().find_map(|&(q, r)| {
        let mut cell = (q + dq, r + dr);
        if mv.cells.contains(&cell) {
            return None;
        }
        let mut last = None;
        while let Some(marble @ (Cell::Black | Cell::White)) = before.get(cell.0, cell.1) {
            last = Some((marble, cell));
            cell = (cell.0 + dq, cell.1 + dr);
        }
        last.filter(|_| before.get(cell.0, cell.1).is_none())
    })
}

/// The state of `before` after `mv`: the marble it pushed off, counted when it is the boss's.
/// `None` outside the Dual Room's fight.
pub(crate) fn carried_dual(before: &Board, mv: &Move, _after: &Board) -> Option<Dual> {
    let mut dual = before.dual()?;
    dual.ejected = pushed_off(before, mv);
    dual.ejections += u8::from(matches!(dual.ejected, Some((Cell::White, _))));
    Some(dual)
}

/// The end of a ply: the announced return lands, the marble the ply pushed off is announced in
/// the other room (P1, P2) or gone (P3), and the wall collapses once in P3.
fn run(mut board: Board, seed: u64) -> Board {
    let mut dual = board.dual().expect("the Dual Room's board");
    if let Some((marble, at)) = dual.coming.take() {
        let (q, r) = nearest_empty(&board, at);
        board.set(q, r, marble);
    }
    let phase = phase(dual.ejections);
    if let Some((marble, from)) = dual.ejected.take() {
        if phase < 2 {
            dual.coming = Some((marble, landing(&board, from, phase, seed)));
        }
    }
    dual.collapsed |= phase >= 2;
    board.set_dual(Some(dual));
    board
}

/// The hook runs after every ply.
fn special(_ply: u32, _phase: usize) -> Option<u8> {
    Some(0)
}

fn hook(board: &Board, _id: u8, seed: u64) -> Board {
    run(board.clone(), seed)
}

/// The Dual Room's board with no marble: its two rooms, the wall standing.
pub fn dual_board() -> Board {
    let mut board = Board::with_radius(DUAL_RADIUS);
    for q in -DUAL_RADIUS..=DUAL_RADIUS {
        for r in -DUAL_RADIUS..=DUAL_RADIUS {
            if ROOMS.iter().all(|&c| distance((q, r), c) > 4) {
                board.void(q, r);
            }
        }
    }
    board.set_dual(Some(Dual::default()));
    board
}

/// The Dual Room boss definition.
pub fn dual_boss() -> BossDef {
    BossDef {
        name: "The Dual Room",
        phase_marbles: Vec::new(),
        phase_ejections: DUAL_PHASE_EJECTIONS.to_vec(),
        special,
        hook,
        conversions: None,
        node_budget: DUAL_NODE_BUDGET,
    }
}

/// A new encounter: 7 player and 5 boss marbles in each room, the player is Black and moves first.
pub fn dual_start(seed: u64) -> Encounter {
    let mut board = dual_board();
    for (color, start) in [(Cell::Black, &PLAYER_START[..]), (Cell::White, &BOSS_START)] {
        for &cell in start {
            for (q, r) in [cell, mirror(cell)] {
                board.set(q, r, color);
            }
        }
    }
    Encounter::new(
        Game::from_position(board, Player::Black, [0, 0]),
        dual_boss(),
        seed,
    )
}

/// The marble that landed at the end of the last ply and its cell, `None` when none did or outside
/// the Dual Room's fight.
pub fn dual_landed(enc: &Encounter) -> Option<(Cell, P)> {
    let (before, _) = enc.hooked()?;
    let (marble, at) = before.dual()?.coming?;
    Some((marble, nearest_empty(before, at)))
}

/// What a ply does in the boss search: the pushed-off marble is noted, then the hook runs with
/// seed 0. A return credits nothing: the search counts the push itself.
fn search_step(before: &Board, _mover: Player, mv: &Move, mut after: Board) -> (Board, [u8; 2]) {
    after.set_dual(carried_dual(before, mv, &after));
    (run(after, 0), [0, 0])
}

/// The boss reply: its node-limited search, where every ply of the tree goes through the hook, so
/// it plays the wall, the returns of both sides and the collapse. `None` on the player's turn or
/// when over.
pub fn dual_move(enc: &Encounter) -> Option<Move> {
    if enc.game().to_move() != Player::White {
        return None;
    }
    search_hooked(
        enc.game(),
        enc.boss.node_budget,
        DEFAULT_WEIGHTS,
        &|_| true,
        &search_step,
    )
    .map(|r| r.mv)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encounter::{marbles, PveResult};
    use crate::moves::Direction::{E, NW, SE, W};
    use crate::moves::{apply, legal_moves, Direction, MoveError};

    fn board(black: &[P], white: &[P], dual: Dual) -> Board {
        let mut board = dual_board();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        board.set_dual(Some(dual));
        board
    }

    fn fight(board: Board, to_move: Player, ejected: [u8; 2]) -> Encounter {
        Encounter::new(Game::from_position(board, to_move, ejected), dual_boss(), 7)
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    fn state(enc: &Encounter) -> Dual {
        enc.game().board().dual().unwrap()
    }

    fn on_board(board: &Board) -> Vec<P> {
        (-DUAL_RADIUS..=DUAL_RADIUS)
            .flat_map(|q| (-DUAL_RADIUS..=DUAL_RADIUS).map(move |r| (q, r)))
            .filter(|&(q, r)| board.get(q, r).is_some())
            .collect()
    }

    fn in_room(board: &Board, color: Cell, which: usize) -> Vec<P> {
        on_board(board)
            .into_iter()
            .filter(|&(q, r)| board.get(q, r) == Some(color) && room((q, r)) == which)
            .collect()
    }

    #[test]
    fn the_boss_definition_matches_the_spec() {
        let b = dual_boss();
        assert_eq!(b.name, "The Dual Room");
        assert!(b.phase_marbles.is_empty());
        assert_eq!(b.phase_ejections, vec![3, 5], "P2 after 3, P3 after 5");
        assert_eq!(b.node_budget, DUAL_NODE_BUDGET);
        assert_eq!((b.special)(1, 0), Some(0), "the hook runs after every ply");
        assert_eq!((b.special)(8, 2), Some(0));
    }

    #[test]
    fn the_board_is_two_rooms_of_61_cells_with_the_wall_between() {
        let board = dual_board();
        assert_eq!(board.dual(), Some(Dual::default()));
        let cells = on_board(&board);
        assert_eq!(cells.len(), 122);
        for (which, &centre) in ROOMS.iter().enumerate() {
            let own: Vec<P> = cells
                .iter()
                .copied()
                .filter(|&c| room(c) == which)
                .collect();
            assert_eq!(own.len(), 61, "room {which}");
            assert!(own.iter().all(|&c| distance(c, centre) <= 4));
        }
        let crossings: Vec<(P, P)> = cells
            .iter()
            .flat_map(|&c| {
                NEIGHBOURS
                    .iter()
                    .map(move |&(dq, dr)| (c, (c.0 + dq, c.1 + dr)))
            })
            .filter(|&(a, b)| board.get(b.0, b.1).is_some() && room(a) == 0 && room(b) == 1)
            .collect();
        assert_eq!(
            crossings.len(),
            9,
            "the 5 wall cells of a room touch 9 times"
        );
        assert!(crossings.iter().all(|&(a, b)| board.walled(a, b)));
        assert!(crossings.iter().all(|&(a, _)| a.1 == 0));
    }

    #[test]
    fn the_mirror_maps_each_room_onto_the_other_row_by_row() {
        let board = dual_board();
        for cell in on_board(&board) {
            let image = mirror(cell);
            assert!(board.get(image.0, image.1).is_some(), "{cell:?}");
            assert_ne!(room(image), room(cell));
            assert_eq!(image.1, -1 - cell.1, "the same distance to the wall");
            assert_eq!(mirror(image), cell);
        }
        assert_eq!(mirror((0, 0)), (1, -1), "wall row to wall row");
        assert_eq!(mirror((-4, 8)), (5, -9), "far side to far side");
    }

    #[test]
    fn the_fight_starts_with_7_player_and_5_boss_marbles_in_each_room() {
        let enc = dual_start(3);
        let board = enc.game().board();
        for which in 0..2 {
            assert_eq!(in_room(board, Cell::Black, which).len(), 7);
            assert_eq!(in_room(board, Cell::White, which).len(), 5);
        }
        let mut south = in_room(board, Cell::Black, 0);
        let mut want = PLAYER_START.to_vec();
        south.sort();
        want.sort();
        assert_eq!(south, want);
        for (color, start) in [(Cell::Black, &PLAYER_START[..]), (Cell::White, &BOSS_START)] {
            for &cell in start {
                let (q, r) = mirror(cell);
                assert_eq!(
                    board.get(q, r),
                    Some(color),
                    "the north room mirrors the south"
                );
            }
        }
        assert!(BOSS_START.iter().all(|&(_, r)| r <= 1), "against the wall");
        assert!(PLAYER_START.iter().all(|&(_, r)| r >= 7), "on the far side");
        assert_eq!(board.dual(), Some(Dual::default()));
        assert_eq!(enc.game().to_move(), Player::Black);
        assert_eq!(enc.phase(), 0);
        assert_eq!(enc.game().win_ejections(Player::Black), 6);
        assert_eq!(enc.game().win_ejections(Player::White), 6);
    }

    #[test]
    fn no_move_or_push_crosses_the_wall_until_it_collapses() {
        let lone = board(&[(1, 0)], &[], Dual::default());
        let err = apply(&lone, Player::Black, &mv(&[(1, 0)], NW)).unwrap_err();
        assert_eq!(err, MoveError::Blocked, "the wall blocks like a marble");
        let side = board(&[(0, 0), (1, 0)], &[], Dual::default());
        let err = apply(&side, Player::Black, &mv(&[(0, 0), (1, 0)], NW)).unwrap_err();
        assert_eq!(err, MoveError::Blocked, "a broadside too");
        let across = board(&[(0, 0), (0, -1)], &[], Dual::default());
        let err = apply(&across, Player::Black, &mv(&[(0, 0), (0, -1)], W)).unwrap_err();
        assert_eq!(err, MoveError::NotALine, "the wall splits a line");
        let push = mv(&[(0, 2), (0, 1)], NW);
        let walled = board(&[(0, 2), (0, 1)], &[(0, 0)], Dual::default());
        let err = apply(&walled, Player::Black, &push).unwrap_err();
        assert_eq!(err, MoveError::PushBlocked, "a marble that does not move");
        let open = Dual {
            collapsed: true,
            ..Dual::default()
        };
        let passage = board(&[(0, 2), (0, 1)], &[(0, 0)], open);
        let (after, ejected) = apply(&passage, Player::Black, &push).unwrap();
        assert!(!ejected);
        assert_eq!(after.get(0, -1), Some(Cell::White), "across the passage");
        assert_eq!(after.get(0, 0), Some(Cell::Black));
    }

    #[test]
    fn a_push_off_the_board_beside_the_wall_still_ejects() {
        let corner = board(&[(-2, 2), (-2, 1)], &[(-2, 0)], Dual::default());
        let (after, ejected) = apply(&corner, Player::Black, &mv(&[(-2, 2), (-2, 1)], NW)).unwrap();
        assert!(ejected, "(-2, -1) is off the board, not behind the wall");
        assert_eq!(marbles(&after, Cell::White), 0);
    }

    #[test]
    fn an_ejected_marble_comes_back_on_the_mirror_one_ply_later() {
        let start = board(&[(-4, 6), (-4, 7)], &[(-4, 8), (3, -5)], Dual::default());
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(-4, 6), (-4, 7)], SE)).unwrap();
        assert_eq!(enc.game().ejected(Player::Black), 1);
        assert_eq!(marbles(enc.game().board(), Cell::White), 1);
        let announced = state(&enc);
        assert_eq!(announced.coming, Some((Cell::White, (5, -9))), "announced");
        assert_eq!((announced.ejections, announced.ejected), (1, None));
        enc.play(&mv(&[(3, -5)], E)).unwrap();
        assert_eq!(enc.game().board().get(5, -9), Some(Cell::White), "it lands");
        assert_eq!(state(&enc).coming, None);
        assert_eq!(marbles(enc.game().board(), Cell::White), 2);
        assert_eq!(
            enc.game().ejected(Player::Black),
            1,
            "the ejection still counts"
        );
        assert_eq!(enc.result(), None);
    }

    #[test]
    fn the_landed_marble_is_read_from_the_last_ply() {
        let start = board(&[(-4, 6), (-4, 7)], &[(-4, 8), (5, -8)], Dual::default());
        let mut enc = fight(start, Player::Black, [0, 0]);
        assert_eq!(dual_landed(&enc), None, "no ply yet");
        enc.play(&mv(&[(-4, 6), (-4, 7)], SE)).unwrap();
        assert_eq!(dual_landed(&enc), None, "announced, not landed");
        enc.play(&mv(&[(5, -8)], NW)).unwrap();
        assert_eq!(
            dual_landed(&enc),
            Some((Cell::White, (4, -9))),
            "where it fell"
        );
        enc.play(&mv(&[(-4, 7)], E)).unwrap();
        assert_eq!(dual_landed(&enc), None);
        let mut core = crate::encounter::unstable::unstable_start(1);
        let first = legal_moves(core.game().board(), Player::Black)[0].clone();
        core.play(&first).unwrap();
        assert!(core.hooked().is_some());
        assert_eq!(dual_landed(&core), None, "another boss's hook");
    }

    #[test]
    fn a_taken_landing_cell_moves_the_return_to_the_nearest_empty_cell() {
        let start = board(&[(-4, 6), (-4, 7)], &[(-4, 8), (5, -8)], Dual::default());
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(-4, 6), (-4, 7)], SE)).unwrap();
        enc.play(&mv(&[(5, -8)], NW)).unwrap();
        assert_eq!(
            enc.game().board().get(5, -9),
            Some(Cell::White),
            "the mover"
        );
        assert_eq!(
            enc.game().board().get(4, -9),
            Some(Cell::White),
            "distance 1, the lowest q"
        );
        let taken = board(&[(-4, 6), (-4, 7)], &[(-4, 8), (5, -9)], Dual::default());
        let mut enc = fight(taken, Player::Black, [0, 0]);
        enc.play(&mv(&[(-4, 6), (-4, 7)], SE)).unwrap();
        assert_eq!(
            state(&enc).coming,
            Some((Cell::White, (4, -9))),
            "at the announce"
        );
    }

    #[test]
    fn a_player_marble_comes_back_too_and_does_not_move_the_phase() {
        let start = board(&[(5, -9), (-4, 6)], &[(5, -7), (5, -8)], Dual::default());
        let mut enc = fight(start, Player::White, [0, 0]);
        enc.play(&mv(&[(5, -7), (5, -8)], NW)).unwrap();
        assert_eq!(enc.game().ejected(Player::White), 1);
        assert_eq!(state(&enc).coming, Some((Cell::Black, (-4, 8))));
        assert_eq!(
            state(&enc).ejections,
            0,
            "the phases count the boss marbles"
        );
        enc.play(&mv(&[(-4, 6)], E)).unwrap();
        assert_eq!(enc.game().board().get(-4, 8), Some(Cell::Black));
    }

    #[test]
    fn in_p2_it_lands_on_a_random_empty_rim_cell_of_the_emptier_room() {
        let third = Dual {
            ejections: 3,
            ejected: Some((Cell::White, (-4, 8))),
            ..Dual::default()
        };
        // The south room it left holds 2 marbles, the north room 5: it stays south.
        let south = board(
            &[(-4, 6), (-4, 7)],
            &[(0, -5), (1, -5), (2, -5), (3, -5), (4, -5)],
            third,
        );
        let mut landed = Vec::new();
        for seed in 0..16 {
            let out = hook(&south, 0, seed);
            assert_eq!(out, hook(&south, 0, seed), "the same seed, the same cell");
            let (color, cell) = out.dual().unwrap().coming.unwrap();
            assert_eq!(color, Cell::White);
            assert_eq!(room(cell), 0, "the emptier room");
            assert_eq!(south.get(cell.0, cell.1), Some(Cell::Empty));
            assert!(rim(&south, cell), "{cell:?}");
            landed.push(cell);
        }
        landed.sort();
        landed.dedup();
        assert!(landed.len() > 4, "the seed draws the cell");
        // As many marbles in each room: the other room.
        let tie = board(&[(-4, 6), (-4, 7)], &[(0, -5), (1, -5)], third);
        let (_, cell) = hook(&tie, 0, 3).dual().unwrap().coming.unwrap();
        assert_eq!(room(cell), 1);
        assert!(rim(&tie, cell));
        assert!(!rim(&tie, (0, 0)), "the inner wall cells are no rim");
        assert!(rim(&tie, (-2, 0)), "a wall corner is");
    }

    #[test]
    fn the_third_ejection_already_returns_as_p2() {
        let start = board(
            &[(-4, 6), (-4, 7)],
            &[(-4, 8), (0, -5), (1, -5), (2, -5)],
            Dual {
                ejections: 2,
                ..Dual::default()
            },
        );
        let mut enc = fight(start, Player::Black, [2, 0]);
        enc.play(&mv(&[(-4, 6), (-4, 7)], SE)).unwrap();
        assert_eq!(enc.phase(), 1);
        let (_, cell) = state(&enc).coming.unwrap();
        assert_eq!(room(cell), 0, "the south room holds 2 marbles, the north 3");
        assert_ne!(cell, mirror((-4, 8)));
    }

    #[test]
    fn the_fifth_ejection_collapses_the_wall_and_is_gone_for_good() {
        let start = board(
            &[(-4, 6), (-4, 7), (0, 2), (0, 1)],
            &[(-4, 8), (0, 0), (3, -5)],
            Dual {
                ejections: 4,
                ..Dual::default()
            },
        );
        let mut enc = fight(start, Player::Black, [4, 0]);
        enc.play(&mv(&[(-4, 6), (-4, 7)], SE)).unwrap();
        assert_eq!(enc.phase(), 2);
        let open = state(&enc);
        assert!(open.collapsed, "the wall falls at the end of the move");
        assert_eq!((open.coming, open.ejections), (None, 5));
        enc.play(&mv(&[(3, -5)], E)).unwrap();
        assert_eq!(
            marbles(enc.game().board(), Cell::White),
            2,
            "it never comes back"
        );
        enc.play(&mv(&[(0, 2), (0, 1)], NW)).unwrap();
        assert_eq!(
            enc.game().board().get(0, -1),
            Some(Cell::White),
            "a push across"
        );
    }

    #[test]
    fn a_return_announced_before_the_collapse_still_lands() {
        let last = Dual {
            ejections: 5,
            ejected: Some((Cell::White, (-4, 8))),
            coming: Some((Cell::Black, (5, -9))),
            ..Dual::default()
        };
        let out = hook(&board(&[(-4, 6)], &[(0, -5)], last), 0, 1);
        assert_eq!(out.get(5, -9), Some(Cell::Black));
        assert_eq!(out.get(-4, 8), Some(Cell::Empty), "the fifth is gone");
        let after = out.dual().unwrap();
        assert!(after.collapsed);
        assert_eq!((after.coming, after.ejected), (None, None));
    }

    #[test]
    fn every_ejection_counts_and_the_sixth_wins() {
        let start = board(
            &[(-4, 6), (-4, 7)],
            &[(-4, 8), (3, -5)],
            Dual {
                collapsed: true,
                ejections: 5,
                ..Dual::default()
            },
        );
        let mut enc = fight(start, Player::Black, [5, 0]);
        enc.play(&mv(&[(-4, 6), (-4, 7)], SE)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Won));
    }

    #[test]
    fn the_search_step_runs_the_returns_and_credits_nothing() {
        let before = board(&[(-4, 6), (-4, 7)], &[(-4, 8), (3, -5)], Dual::default());
        let push = mv(&[(-4, 6), (-4, 7)], SE);
        let after = apply(&before, Player::Black, &push).unwrap().0;
        let (out, credits) = search_step(&before, Player::Black, &push, after);
        assert_eq!(credits, [0, 0], "the search counts the push itself");
        assert_eq!(out.dual().unwrap().coming, Some((Cell::White, (5, -9))));
        let reply = mv(&[(3, -5)], E);
        let next = apply(&out, Player::White, &reply).unwrap().0;
        let (back, _) = search_step(&out, Player::White, &reply, next);
        assert_eq!(back.get(5, -9), Some(Cell::White), "the tree lands it too");
    }

    #[test]
    fn the_boss_reply_is_a_legal_move_and_the_same_for_the_same_position() {
        let mut enc = dual_start(1);
        assert_eq!(dual_move(&enc), None, "the player's turn");
        let first = legal_moves(enc.game().board(), Player::Black)[0].clone();
        enc.play(&first).unwrap();
        let reply = dual_move(&enc).unwrap();
        assert!(legal_moves(enc.game().board(), Player::White).contains(&reply));
        assert_eq!(dual_move(&enc), Some(reply));
    }

    #[test]
    fn the_same_seed_and_moves_give_the_same_fight() {
        let run = |seed| {
            let mut enc = dual_start(seed);
            enc.scale_node_budget(5);
            for _ in 0..8 {
                let next = match enc.game().to_move() {
                    Player::Black => enc.player_search().unwrap().mv,
                    Player::White => dual_move(&enc).unwrap(),
                };
                enc.play(&next).unwrap();
            }
            (enc.game().board().clone(), enc.game().history().len())
        };
        assert_eq!(run(4), run(4));
    }

    #[test]
    fn no_legal_move_of_the_start_crosses_the_wall() {
        let mut enc = dual_start(2);
        for _ in 0..2 {
            let board = enc.game().board();
            let moves = legal_moves(board, enc.game().to_move());
            assert!(!moves.is_empty());
            for m in &moves {
                let (dq, dr) = m.dir.vector();
                assert!(m
                    .cells
                    .iter()
                    .all(|&(q, r)| room((q, r)) == room((q + dq, r + dr))));
            }
            enc.play(&moves[0]).unwrap();
        }
        assert_eq!(enc.tell(), Some(0));
    }
}
