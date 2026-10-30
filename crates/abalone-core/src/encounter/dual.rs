//! The Dual Room (#796, #955, docs/specs/game-design.md section 7.15): two radius 3 rooms split by
//! a void. One board of two hexes with a flag ([`Dual`]): the south room on the rows `r >= 1`, the
//! north room on `r <= -1`, and the void on the row `r = 0`, off the board, so a marble pushed into
//! it is ejected as over the rim. A marble pushed off comes back one ply later in the other room,
//! on the mirror of its cell in P1, on a random empty rim cell of the emptier room in P2; in P3 the
//! bridge fills the void and ejected marbles are gone. Every ejection counts. Every random pick is
//! splitmix64 of the fight seed and the ply, so every peer gets the same fight.

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
/// The centres of the two radius 3 rooms, south then north, the void between them.
pub const ROOMS: [P; 2] = [(-2, 4), (2, -4)];
/// The board scan of [`Board::radius`]: both rooms fit in `|q|, |r|, |q + r| <= 7`.
pub const DUAL_RADIUS: i32 = 7;
/// The void's cells, the row between the two facing edges: the bridge of P3.
pub const BRIDGE: [P; 5] = [(-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0)];
/// The player's start in the south room, on its far side; the north room holds its mirror.
pub const PLAYER_START: [P; 8] = [
    (-5, 7),
    (-4, 7),
    (-3, 7),
    (-2, 7),
    (-4, 6),
    (-3, 6),
    (-2, 6),
    (-1, 6),
];
/// The boss's start in the south room, near the void; the north room holds its mirror.
pub const BOSS_START: [P; 5] = [(-1, 1), (0, 1), (-2, 2), (-1, 2), (0, 2)];

/// Hex distance between two cells.
pub fn distance(a: P, b: P) -> i32 {
    let (dq, dr) = (a.0 - b.0, a.1 - b.1);
    (dq.abs() + dr.abs() + (dq + dr).abs()) / 2
}

/// The cell symmetric to `cell` across the void: on the same row counted from the void and the
/// same column.
pub fn mirror((q, r): P) -> P {
    (q + r, -r)
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

/// Fills the void with the bridge's empty cells.
fn raise_bridge(board: &mut Board) {
    for (q, r) in BRIDGE {
        board.open(q, r);
    }
}

/// The end of a ply: the announced return lands, the marble the ply pushed off is announced in
/// the other room (P1, P2) or gone (P3), and the bridge fills the void once in P3.
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
    if phase >= 2 && !dual.bridged {
        raise_bridge(&mut board);
        dual.bridged = true;
    }
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

/// The Dual Room's board with no marble: its two rooms, the void between them.
pub fn dual_board() -> Board {
    let mut board = Board::with_radius(DUAL_RADIUS);
    for q in -DUAL_RADIUS..=DUAL_RADIUS {
        for r in -DUAL_RADIUS..=DUAL_RADIUS {
            if ROOMS.iter().all(|&c| distance((q, r), c) > 3) {
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

/// A new encounter: 8 player and 5 boss marbles in each room, the player is Black and moves first.
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

/// What a ply does in the boss search (and the ladder player's): the pushed-off marble is noted, then the hook runs with
/// seed 0. A return credits nothing: the search counts the push itself.
pub fn dual_step(before: &Board, _mover: Player, mv: &Move, mut after: Board) -> (Board, [u8; 2]) {
    after.set_dual(carried_dual(before, mv, &after));
    (run(after, 0), [0, 0])
}

/// The boss reply: its node-limited search, where every ply of the tree goes through the hook, so
/// it plays the void, the returns of both sides and the bridge. `None` on the player's turn or
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
        &dual_step,
    )
    .map(|r| r.mv)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encounter::{marbles, PveResult};
    use crate::moves::Direction::{E, NW, SE};
    use crate::moves::{apply, legal_moves, Direction, MoveError};
    use crate::search::Weights;

    fn board(black: &[P], white: &[P], dual: Dual) -> Board {
        let mut board = dual_board();
        if dual.bridged {
            raise_bridge(&mut board);
        }
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

    fn neighbours((q, r): P) -> impl Iterator<Item = P> {
        NEIGHBOURS.iter().map(move |&(dq, dr)| (q + dq, r + dr))
    }

    const BRIDGED: Dual = Dual {
        bridged: true,
        ejections: 5,
        ejected: None,
        coming: None,
    };

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
    fn the_board_is_two_rooms_of_37_cells_split_by_the_void() {
        let board = dual_board();
        assert_eq!(board.dual(), Some(Dual::default()));
        let cells = on_board(&board);
        assert_eq!(cells.len(), 74);
        for (which, &centre) in ROOMS.iter().enumerate() {
            let own: Vec<P> = cells
                .iter()
                .copied()
                .filter(|&c| room(c) == which)
                .collect();
            assert_eq!(own.len(), 37, "room {which}");
            assert!(own.iter().all(|&c| distance(c, centre) <= 3));
        }
        assert!(cells.iter().all(|&(_, r)| r != 0), "the void row");
        assert!(BRIDGE.iter().all(|&(q, r)| board.get(q, r).is_none()));
        assert!(
            cells.iter().all(
                |&c| neighbours(c).all(|n| board.get(n.0, n.1).is_none() || room(n) == room(c))
            ),
            "no cell of a room touches the other room"
        );
        for edge in [1, -1] {
            let facing: Vec<P> = cells.iter().copied().filter(|c| c.1 == edge).collect();
            assert_eq!(facing.len(), 4, "a facing edge of 4 cells");
            assert!(facing
                .iter()
                .all(|&c| neighbours(c).filter(|n| BRIDGE.contains(n)).count() == 2));
        }
        for cell in BRIDGE {
            assert_eq!(cell.1, 0);
            for edge in [1, -1] {
                assert!(neighbours(cell).any(|n| n.1 == edge && cells.contains(&n)));
            }
        }
    }

    #[test]
    fn the_bridge_fills_the_void_with_5_empty_cells() {
        let mut board = dual_board();
        raise_bridge(&mut board);
        assert_eq!(on_board(&board).len(), 79);
        assert!(BRIDGE
            .iter()
            .all(|&(q, r)| board.get(q, r) == Some(Cell::Empty)));
    }

    #[test]
    fn the_mirror_maps_each_room_onto_the_other_row_by_row() {
        let board = dual_board();
        for cell in on_board(&board) {
            let image = mirror(cell);
            assert!(board.get(image.0, image.1).is_some(), "{cell:?}");
            assert_ne!(room(image), room(cell));
            assert_eq!(image.1, -cell.1, "the same distance to the void");
            assert_eq!(
                2 * image.0 + image.1,
                2 * cell.0 + cell.1,
                "the same column"
            );
            assert_eq!(mirror(image), cell);
        }
        assert_eq!(mirror((-1, 1)), (0, -1), "facing edge to facing edge");
        assert_eq!(mirror((-2, 7)), (5, -7), "far side to far side");
        assert!(BRIDGE.iter().all(|&c| mirror(c) == c));
    }

    #[test]
    fn the_fight_starts_with_8_player_and_5_boss_marbles_in_each_room() {
        let enc = dual_start(3);
        let board = enc.game().board();
        for which in 0..2 {
            assert_eq!(in_room(board, Cell::Black, which).len(), 8);
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
        assert!(BOSS_START.iter().all(|&(_, r)| r <= 2), "near the void");
        assert!(PLAYER_START.iter().all(|&(_, r)| r >= 6), "on the far side");
        assert_eq!(board.dual(), Some(Dual::default()));
        assert_eq!(enc.game().to_move(), Player::Black);
        assert_eq!(enc.phase(), 0);
        assert_eq!(enc.game().win_ejections(Player::Black), 6);
        assert_eq!(enc.game().win_ejections(Player::White), 6);
    }

    #[test]
    fn a_marble_pushed_into_the_void_is_ejected_and_none_moves_into_it() {
        let lone = board(&[(0, 1)], &[], Dual::default());
        let err = apply(&lone, Player::Black, &mv(&[(0, 1)], NW)).unwrap_err();
        assert_eq!(err, MoveError::OffBoard, "the void is off the board");
        let push = mv(&[(0, 3), (0, 2)], NW);
        let edge = board(&[(0, 3), (0, 2)], &[(0, 1)], Dual::default());
        let (after, ejected) = apply(&edge, Player::Black, &push).unwrap();
        assert!(ejected, "into the void");
        assert_eq!(marbles(&after, Cell::White), 0);
        let bridge = board(&[(0, 3), (0, 2)], &[(0, 1)], BRIDGED);
        let (after, ejected) = apply(&bridge, Player::Black, &push).unwrap();
        assert!(!ejected, "onto the bridge");
        assert_eq!(after.get(0, 0), Some(Cell::White));
        let across = board(&[(0, 2), (0, 1)], &[(0, 0)], BRIDGED);
        let (after, _) = apply(&across, Player::Black, &mv(&[(0, 2), (0, 1)], NW)).unwrap();
        assert_eq!(after.get(0, -1), Some(Cell::White), "across the bridge");
        assert_eq!(after.get(0, 0), Some(Cell::Black));
    }

    #[test]
    fn an_ejected_marble_comes_back_on_the_mirror_one_ply_later() {
        let start = board(&[(-3, 5), (-3, 6)], &[(-3, 7), (3, -5)], Dual::default());
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(-3, 5), (-3, 6)], SE)).unwrap();
        assert_eq!(enc.game().ejected(Player::Black), 1);
        assert_eq!(marbles(enc.game().board(), Cell::White), 1);
        let announced = state(&enc);
        assert_eq!(announced.coming, Some((Cell::White, (4, -7))), "announced");
        assert_eq!((announced.ejections, announced.ejected), (1, None));
        enc.play(&mv(&[(3, -5)], E)).unwrap();
        assert_eq!(enc.game().board().get(4, -7), Some(Cell::White), "it lands");
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
    fn a_marble_pushed_into_the_void_comes_back_on_its_mirror() {
        let start = board(&[(0, 3), (0, 2)], &[(0, 1), (3, -5)], Dual::default());
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(0, 3), (0, 2)], NW)).unwrap();
        assert_eq!(enc.game().ejected(Player::Black), 1);
        assert_eq!(state(&enc).coming, Some((Cell::White, (1, -1))));
        enc.play(&mv(&[(3, -5)], E)).unwrap();
        assert_eq!(enc.game().board().get(1, -1), Some(Cell::White));
    }

    #[test]
    fn the_landed_marble_is_read_from_the_last_ply() {
        let start = board(&[(-3, 5), (-3, 6)], &[(-3, 7), (4, -6)], Dual::default());
        let mut enc = fight(start, Player::Black, [0, 0]);
        assert_eq!(dual_landed(&enc), None, "no ply yet");
        enc.play(&mv(&[(-3, 5), (-3, 6)], SE)).unwrap();
        assert_eq!(dual_landed(&enc), None, "announced, not landed");
        enc.play(&mv(&[(4, -6)], NW)).unwrap();
        assert_eq!(
            dual_landed(&enc),
            Some((Cell::White, (3, -7))),
            "where it fell"
        );
        enc.play(&mv(&[(-3, 6)], E)).unwrap();
        assert_eq!(dual_landed(&enc), None);
        let mut core = crate::encounter::unstable::unstable_start(1);
        let first = legal_moves(core.game().board(), Player::Black)[0].clone();
        core.play(&first).unwrap();
        assert!(core.hooked().is_some());
        assert_eq!(dual_landed(&core), None, "another boss's hook");
    }

    #[test]
    fn a_taken_landing_cell_moves_the_return_to_the_nearest_empty_cell() {
        let start = board(&[(-3, 5), (-3, 6)], &[(-3, 7), (4, -6)], Dual::default());
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(-3, 5), (-3, 6)], SE)).unwrap();
        enc.play(&mv(&[(4, -6)], NW)).unwrap();
        assert_eq!(
            enc.game().board().get(4, -7),
            Some(Cell::White),
            "the mover"
        );
        assert_eq!(
            enc.game().board().get(3, -7),
            Some(Cell::White),
            "distance 1, the lowest q"
        );
        let taken = board(&[(-3, 5), (-3, 6)], &[(-3, 7), (4, -7)], Dual::default());
        let mut enc = fight(taken, Player::Black, [0, 0]);
        enc.play(&mv(&[(-3, 5), (-3, 6)], SE)).unwrap();
        assert_eq!(
            state(&enc).coming,
            Some((Cell::White, (3, -7))),
            "at the announce"
        );
    }

    #[test]
    fn a_player_marble_comes_back_too_and_does_not_move_the_phase() {
        let start = board(&[(4, -7), (-3, 5)], &[(4, -5), (4, -6)], Dual::default());
        let mut enc = fight(start, Player::White, [0, 0]);
        enc.play(&mv(&[(4, -5), (4, -6)], NW)).unwrap();
        assert_eq!(enc.game().ejected(Player::White), 1);
        assert_eq!(state(&enc).coming, Some((Cell::Black, (-3, 7))));
        assert_eq!(
            state(&enc).ejections,
            0,
            "the phases count the boss marbles"
        );
        enc.play(&mv(&[(-3, 5)], E)).unwrap();
        assert_eq!(enc.game().board().get(-3, 7), Some(Cell::Black));
    }

    #[test]
    fn in_p2_it_lands_on_a_random_empty_rim_cell_of_the_emptier_room() {
        let third = Dual {
            ejections: 3,
            ejected: Some((Cell::White, (-3, 7))),
            ..Dual::default()
        };
        // The south room it left holds 2 marbles, the north room 5: it stays south.
        let south = board(
            &[(-3, 5), (-3, 6)],
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
        let tie = board(&[(-3, 5), (-3, 6)], &[(0, -5), (1, -5)], third);
        let (_, cell) = hook(&tie, 0, 3).dual().unwrap().coming.unwrap();
        assert_eq!(room(cell), 1);
        assert!(rim(&tie, cell));
        assert!(!rim(&tie, (-2, 4)), "the centre is no rim");
        assert!(rim(&tie, (0, 1)), "a facing edge cell is, by the void");
    }

    #[test]
    fn the_third_ejection_already_returns_as_p2() {
        let start = board(
            &[(-3, 5), (-3, 6)],
            &[(-3, 7), (0, -5), (1, -5), (2, -5)],
            Dual {
                ejections: 2,
                ..Dual::default()
            },
        );
        let mut enc = fight(start, Player::Black, [2, 0]);
        enc.play(&mv(&[(-3, 5), (-3, 6)], SE)).unwrap();
        assert_eq!(enc.phase(), 1);
        let (_, cell) = state(&enc).coming.unwrap();
        assert_eq!(room(cell), 0, "the south room holds 2 marbles, the north 3");
        assert_ne!(cell, mirror((-3, 7)));
    }

    #[test]
    fn the_fifth_ejection_raises_the_bridge_and_is_gone_for_good() {
        let start = board(
            &[(-3, 5), (-3, 6), (0, 3), (0, 2)],
            &[(-3, 7), (0, 1), (3, -5)],
            Dual {
                ejections: 4,
                ..Dual::default()
            },
        );
        let mut enc = fight(start, Player::Black, [4, 0]);
        enc.play(&mv(&[(-3, 5), (-3, 6)], SE)).unwrap();
        assert_eq!(enc.phase(), 2);
        let open = state(&enc);
        assert!(open.bridged, "the bridge comes at the end of the move");
        assert_eq!((open.coming, open.ejections), (None, 5));
        let board = enc.game().board();
        assert!(BRIDGE
            .iter()
            .all(|&(q, r)| board.get(q, r) == Some(Cell::Empty)));
        enc.play(&mv(&[(3, -5)], E)).unwrap();
        assert_eq!(
            marbles(enc.game().board(), Cell::White),
            2,
            "it never comes back"
        );
        enc.play(&mv(&[(0, 3), (0, 2)], NW)).unwrap();
        assert_eq!(
            enc.game().board().get(0, 0),
            Some(Cell::White),
            "a push onto the bridge"
        );
        assert_eq!(enc.game().ejected(Player::Black), 5);
    }

    #[test]
    fn a_return_announced_before_the_bridge_still_lands() {
        let last = Dual {
            ejections: 5,
            ejected: Some((Cell::White, (-3, 7))),
            coming: Some((Cell::Black, (4, -7))),
            ..Dual::default()
        };
        let out = hook(&board(&[(-3, 5)], &[(0, -5)], last), 0, 1);
        assert_eq!(out.get(4, -7), Some(Cell::Black));
        assert_eq!(out.get(-3, 7), Some(Cell::Empty), "the fifth is gone");
        let after = out.dual().unwrap();
        assert!(after.bridged);
        assert_eq!((after.coming, after.ejected), (None, None));
    }

    #[test]
    fn every_ejection_counts_and_the_sixth_wins() {
        let start = board(&[(-3, 5), (-3, 6)], &[(-3, 7), (3, -5)], BRIDGED);
        let mut enc = fight(start, Player::Black, [5, 0]);
        enc.play(&mv(&[(-3, 5), (-3, 6)], SE)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Won));
    }

    #[test]
    fn the_search_step_runs_the_returns_and_credits_nothing() {
        let before = board(&[(-3, 5), (-3, 6)], &[(-3, 7), (3, -5)], Dual::default());
        let push = mv(&[(-3, 5), (-3, 6)], SE);
        let after = apply(&before, Player::Black, &push).unwrap().0;
        let (out, credits) = dual_step(&before, Player::Black, &push, after);
        assert_eq!(credits, [0, 0], "the search counts the push itself");
        assert_eq!(out.dual().unwrap().coming, Some((Cell::White, (4, -7))));
        let reply = mv(&[(3, -5)], E);
        let next = apply(&out, Player::White, &reply).unwrap().0;
        let (back, _) = dual_step(&out, Player::White, &reply, next);
        assert_eq!(back.get(4, -7), Some(Cell::White), "the tree lands it too");
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
    fn the_boss_search_does_not_pull_its_marbles_to_the_void() {
        assert_eq!(
            BRIDGE[2],
            (0, 0),
            "the search's centre is the void's middle"
        );
        assert_eq!(
            DUAL_WEIGHTS,
            Weights {
                centre: 0,
                ..DEFAULT_WEIGHTS
            }
        );
        let mut enc = dual_start(5);
        enc.play(&mv(&[(-5, 7), (-4, 6)], Direction::NE)).unwrap();
        let read = search_hooked(
            enc.game(),
            DUAL_NODE_BUDGET,
            DUAL_WEIGHTS,
            &|_| true,
            &dual_step,
        );
        assert_eq!(dual_move(&enc), read.map(|r| r.mv));
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
    fn no_legal_move_of_the_start_moves_a_marble_to_the_other_room() {
        let mut enc = dual_start(2);
        for _ in 0..2 {
            let board = enc.game().board();
            let moves = legal_moves(board, enc.game().to_move());
            assert!(!moves.is_empty());
            for m in &moves {
                let (dq, dr) = m.dir.vector();
                assert!(m.cells.iter().all(|&(q, r)| {
                    let to = (q + dq, r + dr);
                    board.get(to.0, to.1).is_none() || room(to) == room((q, r))
                }));
            }
            enc.play(&moves[0]).unwrap();
        }
        assert_eq!(enc.tell(), Some(0));
    }
}
