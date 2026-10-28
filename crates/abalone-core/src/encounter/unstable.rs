//! The Unstable Core (#751, docs/specs/game-design.md section 7.13): the 7 centre cells charge the
//! marbles that stay on them, and a charged marble weighs `1 + charges` in a push, for both sides
//! (the weighted rule is `moves::apply_for` on a board with `Board::unstable`; no other fight sets
//! it). Four charges blow a marble off the board. In P2 the core collapses, in P3 a wedge
//! shockwave shoves the busiest sixth of the board outward. The charges, the collapse announce and
//! the wedge clock live on the board and move with their marbles; every random pick is splitmix64
//! of the fight seed and the ply, so every peer gets the same fight.

use crate::board::{Board, Cell, Unstable};
use crate::encounter::hull::mix;
use crate::encounter::{carried_marks, losses, BossDef, Encounter};
use crate::game::Game;
use crate::moves::{Move, Player};
use crate::search::{search_hooked, DEFAULT_WEIGHTS};

type P = (i32, i32);

/// P2 and P3 start after this many ejections credited to the player. TUNE.
pub const UNSTABLE_PHASE_EJECTIONS: [u8; 2] = [3, 5];
/// Positions the boss search may visit per move (about depth 3, as the Hull). TUNE.
pub const UNSTABLE_NODE_BUDGET: u32 = 3000;
/// A marble that reaches this many charges is ejected. TUNE.
pub const OVERLOAD: u8 = 4;
/// Player turns between two wedge shockwaves in P3. TUNE.
pub const SHOCK_EVERY: u8 = 3;
/// The six corners of the board in turn: the wedge `i` lies between `CORNERS[i]` and the next.
const CORNERS: [P; 6] = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)];

/// The 7 energy cells: the centre and its 6 neighbours.
pub const ENERGY: [P; 7] = [(0, 0), (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)];

/// What a hook did, for the client's animation: the overloaded marbles (their cells), whether the
/// core collapsed, and the shockwave: its wedge and each marble it moved, from where it stood to
/// where it went (off the board for an ejection).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct UnstableEvents {
    pub overloaded: Vec<P>,
    pub collapsed: bool,
    pub shock: Option<(u8, Vec<(P, P)>)>,
}

/// What the player can read before the next event.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UnstableTell {
    /// The core still stands.
    pub core: bool,
    /// The core collapses at the end of the player's next turn.
    pub collapsing: bool,
    /// The wedge the next shockwave hits, once announced.
    pub wedge: Option<u8>,
    /// Player turns before the next shockwave, `None` before P3.
    pub shock_in: Option<u8>,
}

/// Distance of `cell` from the centre, in steps: its ring.
pub fn ring((q, r): P) -> i32 {
    q.abs().max(r.abs()).max((q + r).abs())
}

/// Whether `cell` is one of the 7 energy cells: the centre and its 6 neighbours.
pub fn is_energy(cell: P) -> bool {
    ENERGY.contains(&cell)
}

/// The wedge of `cell`, 0 to 5 (10 cells each): the cells `a * CORNERS[i] + b * CORNERS[i + 1]`
/// with `a >= 1` and `b >= 0`. The centre belongs to none.
pub fn wedge_of((q, r): P) -> Option<u8> {
    (0..6u8).find(|&i| {
        let ((x1, y1), (x2, y2)) = (CORNERS[usize::from(i)], CORNERS[usize::from(i + 1) % 6]);
        let det = x1 * y2 - x2 * y1;
        let (a, b) = ((q * y2 - x2 * r) / det, (x1 * r - y1 * q) / det);
        a >= 1 && b >= 0
    })
}

/// Special id of the ply that just ended: twice the phase at its start, plus one for a boss ply
/// (Black moves first, so the player's plies are odd).
fn special(ply: u32, phase: usize) -> Option<u8> {
    Some(phase as u8 * 2 + u8::from(ply.is_multiple_of(2)))
}

/// Black and White marbles of `board`, in `q` then `r` order.
fn marbles_of(board: &Board, color: Cell) -> Vec<P> {
    let radius = board.radius();
    (-radius..=radius)
        .flat_map(|q| (-radius..=radius).map(move |r| (q, r)))
        .filter(|&(q, r)| board.get(q, r) == Some(color))
        .collect()
}

/// The marks of `before` carried by `mv` onto `after`: each charge follows its marble, and a
/// marble pushed off the board loses its charges. `None` outside the Unstable Core's fight.
pub(crate) fn carried_unstable(before: &Board, mv: &Move, after: &Board) -> Option<Unstable> {
    let marks = before.unstable()?;
    let cells: Vec<P> = marks.charges.iter().map(|&(c, _)| c).collect();
    let mut charges: Vec<(P, u8)> = carried_marks(before, mv, &cells)
        .into_iter()
        .zip(marks.charges.iter().map(|&(_, n)| n))
        .filter(|&((q, r), _)| matches!(after.get(q, r), Some(Cell::Black | Cell::White)))
        .collect();
    charges.sort();
    Some(Unstable {
        charges,
        ..marks.clone()
    })
}

/// The wedge holding the most marbles of both colours, a tie drawn by `state`.
fn busiest(board: &Board, state: u64) -> u8 {
    let mut count = [0usize; 6];
    for color in [Cell::Black, Cell::White] {
        for cell in marbles_of(board, color) {
            if let Some(w) = wedge_of(cell) {
                count[usize::from(w)] += 1;
            }
        }
    }
    let top = count.iter().max().copied().unwrap_or(0);
    let ties: Vec<u8> = (0..6u8).filter(|&w| count[usize::from(w)] == top).collect();
    ties[(state % ties.len() as u64) as usize]
}

/// The shockwave on `wedge`: every marble in it moves one cell toward the nearest rim, outermost
/// first, ignoring sumito. A marble whose cell ahead is taken stays, one pushed past the rim is
/// ejected. The charges follow. Returns the marbles it moved, from where they stood to where they
/// went.
fn shove(board: &mut Board, charges: &mut Vec<(P, u8)>, wedge: u8, seed: u64) -> Vec<(P, P)> {
    let mut group: Vec<P> = [Cell::Black, Cell::White]
        .into_iter()
        .flat_map(|c| marbles_of(board, c))
        .filter(|&c| wedge_of(c) == Some(wedge))
        .collect();
    group.sort_by_key(|&(q, r)| (-ring((q, r)), q, r));
    let mut moved = Vec::new();
    for (k, cell) in group.into_iter().enumerate() {
        let ahead: Vec<P> = CORNERS
            .iter()
            .map(|&(dq, dr)| (cell.0 + dq, cell.1 + dr))
            .filter(|&c| ring(c) == ring(cell) + 1)
            .collect();
        let to = ahead[(mix(seed.wrapping_add(k as u64)) % ahead.len() as u64) as usize];
        let marble = board.get(cell.0, cell.1).expect("a marble");
        match board.get(to.0, to.1) {
            Some(Cell::Empty) => board.set(to.0, to.1, marble),
            Some(_) => continue,
            None => {}
        }
        board.set(cell.0, cell.1, Cell::Empty);
        for charge in charges.iter_mut().filter(|c| c.0 == cell) {
            charge.0 = to;
        }
        moved.push((cell, to));
    }
    charges.retain(|&((q, r), _)| matches!(board.get(q, r), Some(Cell::Black | Cell::White)));
    charges.sort();
    moved
}

/// The end of a ply, `id` its special id: the side that moved charges or discharges its marbles,
/// an overloaded one is ejected; then the core announces its collapse after a boss ply in P2 and
/// collapses after the next player ply; in P3 the shockwave clock ticks after a player ply, the
/// wedge is announced on the 2nd tick and hits on the 3rd. The board after, and what happened.
fn run(board: &Board, id: u8, seed: u64) -> (Board, UnstableEvents) {
    let Some(marks) = board.unstable() else {
        return (board.clone(), UnstableEvents::default());
    };
    let (phase, boss_ply) = (id / 2, id % 2 == 1);
    let own = if boss_ply { Cell::White } else { Cell::Black };
    let mut out = board.clone();
    let mut events = UnstableEvents::default();
    let mut next = marks.clone();
    let core = board.get(0, 0).is_some();
    for cell in marbles_of(board, own) {
        let charge = marks.charge(cell);
        let charge = if core && is_energy(cell) {
            charge + 1
        } else {
            charge.saturating_sub(1)
        };
        next.charges.retain(|c| c.0 != cell);
        if charge >= OVERLOAD {
            out.set(cell.0, cell.1, Cell::Empty);
            events.overloaded.push(cell);
        } else if charge > 0 {
            next.charges.push((cell, charge));
        }
    }
    if core && boss_ply && phase >= 1 {
        next.collapsing = true;
    } else if core && !boss_ply && next.collapsing {
        for cell in ENERGY {
            out.void(cell.0, cell.1);
        }
        next.collapsing = false;
        events.collapsed = true;
    }
    if !boss_ply && phase >= 2 {
        next.clock += 1;
        if next.clock == 2 {
            next.wedge = Some(busiest(&out, mix(seed)));
        } else if next.clock == SHOCK_EVERY {
            let wedge = next.wedge.take().expect("announced");
            let moved = shove(&mut out, &mut next.charges, wedge, seed);
            events.shock = Some((wedge, moved));
            next.clock = 0;
        }
    }
    next.charges
        .retain(|&((q, r), _)| matches!(out.get(q, r), Some(Cell::Black | Cell::White)));
    next.charges.sort();
    out.set_unstable(Some(next));
    (out, events)
}

fn hook(board: &Board, id: u8, seed: u64) -> Board {
    run(board, id, seed).0
}

/// The Unstable Core boss definition.
pub fn unstable_boss() -> BossDef {
    BossDef {
        name: "The Unstable Core",
        phase_marbles: Vec::new(),
        phase_ejections: UNSTABLE_PHASE_EJECTIONS.to_vec(),
        special,
        hook,
        conversions: None,
        node_budget: UNSTABLE_NODE_BUDGET,
    }
}

/// A new encounter: the standard layout, no charge, the player is Black and moves first.
pub fn unstable_start(seed: u64) -> Encounter {
    let mut board = Board::standard();
    board.set_unstable(Some(Unstable::default()));
    Encounter::new(
        Game::from_position(board, Player::Black, [0, 0]),
        unstable_boss(),
        seed,
    )
}

/// The next events, `None` for the other bosses.
pub fn unstable_tell(enc: &Encounter) -> Option<UnstableTell> {
    let board = enc.game().board();
    let marks = board.unstable()?;
    Some(UnstableTell {
        core: board.get(0, 0).is_some(),
        collapsing: marks.collapsing,
        wedge: marks.wedge,
        shock_in: (enc.phase() >= 2).then(|| SHOCK_EVERY - marks.clock),
    })
}

/// What the last ply's hook did and the board just before it, `None` when it did nothing to show.
pub fn last_events(enc: &Encounter) -> Option<(Board, UnstableEvents)> {
    let (before, id) = enc.hooked()?;
    let events = run(before, *id, enc.hook_seed()).1;
    (events != UnstableEvents::default()).then(|| (before.clone(), events))
}

/// What a ply does in the boss search: the charges follow the move, then the hook runs with the
/// phase of the root and seed 0. The board after, and the ejections credited to Black and White.
fn search_step(
    phase: u8,
    before: &Board,
    mover: Player,
    mv: &Move,
    mut after: Board,
) -> (Board, [u8; 2]) {
    after.set_unstable(carried_unstable(before, mv, &after));
    let id = phase * 2 + u8::from(mover == Player::White);
    let out = hook(&after, id, 0);
    let [black, white] = losses(&after, &out);
    (out, [white, black])
}

/// The boss reply: its node-limited search, where every ply of the tree carries the charges and
/// goes through the hook (seed 0 for the picks), so it plays the weighted rule and sees the
/// overloads, the collapse and the shockwaves. `None` on the player's turn or when over.
pub fn unstable_move(enc: &Encounter) -> Option<Move> {
    if enc.game().to_move() != Player::White {
        return None;
    }
    let phase = enc.phase() as u8;
    let step = |before: &Board, mover: Player, mv: &Move, after: Board| {
        search_step(phase, before, mover, mv, after)
    };
    search_hooked(
        enc.game(),
        enc.boss.node_budget,
        DEFAULT_WEIGHTS,
        &|_| true,
        &step,
    )
    .map(|r| r.mv)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encounter::{marbles, trivial_boss, PveResult};
    use crate::moves::Direction::{E, SE, W};
    use crate::moves::{apply, legal_moves, Direction, MoveError};

    fn board(black: &[P], white: &[P], charges: &[(P, u8)]) -> Board {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        board.set_unstable(Some(Unstable {
            charges: charges.to_vec(),
            ..Unstable::default()
        }));
        board
    }

    fn fight(board: Board, to_move: Player, ejected: [u8; 2]) -> Encounter {
        Encounter::new(
            Game::from_position(board, to_move, ejected),
            unstable_boss(),
            7,
        )
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    fn marks(enc: &Encounter) -> Unstable {
        enc.game().board().unstable().unwrap().clone()
    }

    fn cells_of(board: &Board, color: Cell) -> Vec<P> {
        marbles_of(board, color)
    }

    /// The fixture shared with the wasm bridge, the client harness and client/e2e/unstable.spec.ts
    /// is `FIXTURE_SEED` with the plies of `FIXTURE`: one marble per ply, `(q, r, direction)`.
    #[test]
    fn the_boss_definition_matches_the_spec() {
        let b = unstable_boss();
        assert_eq!(b.name, "The Unstable Core");
        assert!(b.phase_marbles.is_empty());
        assert_eq!(b.phase_ejections, vec![3, 5], "P2 after 3, P3 after 5");
        assert_eq!(b.node_budget, UNSTABLE_NODE_BUDGET);
        assert_eq!((OVERLOAD, SHOCK_EVERY), (4, 3));
        assert_eq!(special(1, 0), Some(0), "a player ply of P1");
        assert_eq!(special(4, 2), Some(5), "a boss ply of P3");
    }

    #[test]
    fn the_fight_starts_on_the_standard_layout_with_no_charge() {
        let enc = unstable_start(3);
        let mut plain = enc.game().board().clone();
        assert_eq!(plain.unstable(), Some(&Unstable::default()));
        plain.set_unstable(None);
        assert_eq!(plain, Board::standard());
        assert_eq!(enc.game().to_move(), Player::Black);
        assert_eq!(enc.phase(), 0);
        assert_eq!(enc.game().win_ejections(Player::Black), 6);
        assert_eq!(enc.game().win_ejections(Player::White), 6);
    }

    #[test]
    fn the_energy_cells_are_the_centre_and_its_6_neighbours() {
        assert_eq!(ENERGY.len(), 7);
        let board = Board::empty();
        for q in -4..=4 {
            for r in -4..=4 {
                if board.get(q, r).is_some() {
                    assert_eq!(is_energy((q, r)), ring((q, r)) <= 1, "{q},{r}");
                }
            }
        }
        assert_eq!(ring((3, -4)), 4);
    }

    #[test]
    fn the_wedges_cut_the_board_in_six_of_ten_cells_round_the_centre() {
        let board = Board::empty();
        let mut count = [0; 6];
        for q in -4..=4 {
            for r in -4..=4 {
                match (board.get(q, r), wedge_of((q, r))) {
                    (Some(_), Some(w)) => count[usize::from(w)] += 1,
                    (Some(_), None) => assert_eq!((q, r), (0, 0), "only the centre has none"),
                    (None, _) => {}
                }
            }
        }
        assert_eq!(count, [10; 6]);
        let corners: Vec<_> = CORNERS.iter().map(|&c| wedge_of(c)).collect();
        assert_eq!(corners, (0..6).map(Some).collect::<Vec<_>>());
        assert_eq!(wedge_of((2, -1)), Some(0));
        assert_eq!(wedge_of((1, 1)), Some(5));
        assert_eq!(wedge_of((0, 0)), None);
    }

    #[test]
    fn two_marbles_with_a_charge_of_two_push_three() {
        let charged = board(
            &[(-2, 0), (-1, 0)],
            &[(0, 0), (1, 0), (2, 0)],
            &[((-2, 0), 2)],
        );
        let push = mv(&[(-2, 0), (-1, 0)], E);
        let (after, ejected) = apply(&charged, Player::Black, &push).unwrap();
        assert!(!ejected);
        assert_eq!(cells_of(&after, Cell::White), vec![(1, 0), (2, 0), (3, 0)]);
        assert_eq!(cells_of(&after, Cell::Black), vec![(-1, 0), (0, 0)]);
        let plain = board(&[(-2, 0), (-1, 0)], &[(0, 0), (1, 0), (2, 0)], &[]);
        assert_eq!(
            apply(&plain, Player::Black, &push).unwrap_err(),
            MoveError::NotStrongEnough,
            "2 against 3 without the charge"
        );
    }

    #[test]
    fn a_single_charged_marble_pushes_alone() {
        let lone = |charge: &[(P, u8)]| board(&[(0, 0)], &[(1, 0)], charge);
        let push = mv(&[(0, 0)], E);
        let (after, _) = apply(&lone(&[((0, 0), 1)]), Player::Black, &push).unwrap();
        assert_eq!(cells_of(&after, Cell::White), vec![(2, 0)]);
        assert_eq!(
            apply(&lone(&[]), Player::Black, &push).unwrap_err(),
            MoveError::NotStrongEnough
        );
        assert!(legal_moves(&lone(&[((0, 0), 1)]), Player::Black).contains(&push));
        assert!(!legal_moves(&lone(&[]), Player::Black).contains(&push));
    }

    #[test]
    fn a_charged_marble_resists_a_push() {
        let pair = [(-1, 0), (0, 0)];
        let push = mv(&pair, E);
        let resisting = board(&pair, &[(1, 0)], &[((1, 0), 1)]);
        assert_eq!(
            apply(&resisting, Player::Black, &push).unwrap_err(),
            MoveError::NotStrongEnough,
            "weight 2 against weight 2"
        );
        let plain = board(&pair, &[(1, 0)], &[]);
        assert!(apply(&plain, Player::Black, &push).is_ok());
    }

    #[test]
    fn a_move_still_moves_3_marbles_at_most_and_pushes_what_the_line_holds() {
        let four = [(-4, 0), (-3, 0), (-2, 0), (-1, 0)];
        let heavy = board(&four, &[(4, -4)], &[((-4, 0), 3)]);
        assert_eq!(
            apply(&heavy, Player::Black, &mv(&four, E)).unwrap_err(),
            MoveError::TooManyMarbles
        );
        // Three marbles of weight 3 push 4 plain marbles.
        let trio = [(-4, 0), (-3, 0), (-2, 0)];
        let charges: Vec<_> = trio.iter().map(|&c| (c, 2)).collect();
        let strong = board(&trio, &[(-1, 0), (0, 0), (1, 0), (2, 0)], &charges);
        let (after, _) = apply(&strong, Player::Black, &mv(&trio, E)).unwrap();
        assert_eq!(
            cells_of(&after, Cell::White),
            vec![(0, 0), (1, 0), (2, 0), (3, 0)]
        );
        // The usual rule stays: no push into your own marble.
        let blocked = board(&[(-1, 0), (0, 0), (2, 0)], &[(1, 0)], &[((0, 0), 1)]);
        assert_eq!(
            apply(&blocked, Player::Black, &mv(&[(-1, 0), (0, 0)], E)).unwrap_err(),
            MoveError::PushBlocked
        );
    }

    #[test]
    fn the_charges_follow_the_pushing_and_the_pushed_marbles() {
        let start = board(&[(-1, 0), (0, 0)], &[(1, 0)], &[((0, 0), 1), ((1, 0), 1)]);
        let push = mv(&[(-1, 0), (0, 0)], E);
        let (after, _) = apply(&start, Player::Black, &push).unwrap();
        let carried = carried_unstable(&start, &push, &after).unwrap();
        assert_eq!(carried.charges, vec![((1, 0), 1), ((2, 0), 1)]);
        // Pushed off the rim: the charge goes with the marble.
        let rim = board(&[(2, 0), (3, 0)], &[(4, 0)], &[((3, 0), 1), ((4, 0), 1)]);
        let push = mv(&[(2, 0), (3, 0)], E);
        let (after, ejected) = apply(&rim, Player::Black, &push).unwrap();
        assert!(ejected);
        let carried = carried_unstable(&rim, &push, &after).unwrap();
        assert_eq!(carried.charges, vec![((4, 0), 1)]);
        // A broadside move and a marble that stays.
        let side = board(
            &[(0, 0), (1, 0), (-3, 0)],
            &[],
            &[((0, 0), 2), ((-3, 0), 1)],
        );
        let step = mv(&[(0, 0), (1, 0)], SE);
        let (after, _) = apply(&side, Player::Black, &step).unwrap();
        let carried = carried_unstable(&side, &step, &after).unwrap();
        assert_eq!(carried.charges, vec![((-3, 0), 1), ((0, 1), 2)]);
        assert_eq!(carried_unstable(&Board::empty(), &step, &after), None);
    }

    #[test]
    fn a_marble_on_an_energy_cell_gains_a_charge_at_the_end_of_its_own_turn_only() {
        let start = board(&[(0, 0), (3, -3)], &[(-4, 4)], &[]);
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(3, -3)], W)).unwrap();
        assert_eq!(marks(&enc).charges, vec![((0, 0), 1)]);
        enc.play(&mv(&[(-4, 4)], E)).unwrap();
        assert_eq!(
            marks(&enc).charges,
            vec![((0, 0), 1)],
            "the boss turn charges its own"
        );
        enc.play(&mv(&[(2, -3)], W)).unwrap();
        assert_eq!(marks(&enc).charges, vec![((0, 0), 2)]);
    }

    #[test]
    fn a_charged_marble_off_the_energy_cells_loses_one_down_to_zero() {
        let start = board(&[(2, 0), (3, -3)], &[(-4, 4)], &[((2, 0), 2)]);
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(3, -3)], W)).unwrap();
        assert_eq!(marks(&enc).charges, vec![((2, 0), 1)]);
        enc.play(&mv(&[(-4, 4)], E)).unwrap();
        enc.play(&mv(&[(2, -3)], W)).unwrap();
        assert_eq!(marks(&enc).charges, vec![], "no entry left at 0");
    }

    #[test]
    fn a_charge_stays_with_its_marble_when_it_moves() {
        let start = board(&[(0, 0)], &[(-4, 4)], &[((0, 0), 1)]);
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(0, 0)], E)).unwrap();
        assert_eq!(
            marks(&enc).charges,
            vec![((1, 0), 2)],
            "(1, 0) is an energy cell too"
        );
        enc.play(&mv(&[(-4, 4)], E)).unwrap();
        enc.play(&mv(&[(1, 0)], E)).unwrap();
        assert_eq!(
            marks(&enc).charges,
            vec![((2, 0), 1)],
            "off the core it decays"
        );
    }

    #[test]
    fn four_charges_blow_a_marble_off_at_once_for_the_other_side() {
        let start = board(&[(0, 0), (3, -3)], &[(-4, 4)], &[((0, 0), 3)]);
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(3, -3)], W)).unwrap();
        assert_eq!(enc.game().board().get(0, 0), Some(Cell::Empty));
        assert_eq!(marks(&enc).charges, vec![]);
        assert_eq!(
            enc.game().ejected(Player::White),
            1,
            "yours, counted for the boss"
        );
        let (_, events) = last_events(&enc).unwrap();
        assert_eq!(events.overloaded, vec![(0, 0)]);
        // A boss marble: counted for the player.
        let start = board(&[(3, -3)], &[(-1, 0), (-4, 4)], &[((-1, 0), 3)]);
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(3, -3)], W)).unwrap();
        enc.play(&mv(&[(-4, 4)], E)).unwrap();
        assert_eq!(enc.game().ejected(Player::Black), 1);
        assert_eq!(marbles(enc.game().board(), Cell::White), 1);
    }

    #[test]
    fn an_overload_can_win_or_lose_the_fight() {
        let start = board(&[(0, 0), (3, -3)], &[(-4, 4)], &[((0, 0), 3)]);
        let mut enc = fight(start, Player::Black, [0, 5]);
        enc.play(&mv(&[(3, -3)], W)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Lost));
        let start = board(&[(3, -3)], &[(-1, 0), (-4, 4)], &[((-1, 0), 3)]);
        let mut enc = fight(start, Player::Black, [5, 0]);
        enc.play(&mv(&[(3, -3)], W)).unwrap();
        enc.play(&mv(&[(-4, 4)], E)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Won));
    }

    #[test]
    fn nothing_to_show_when_a_ply_changes_nothing_but_a_charge() {
        let mut enc = fight(board(&[(3, -3)], &[(-4, 4)], &[]), Player::Black, [0, 0]);
        assert_eq!(last_events(&enc), None, "no ply yet");
        enc.play(&mv(&[(3, -3)], W)).unwrap();
        assert_eq!(last_events(&enc), None);
    }

    #[test]
    fn the_hook_leaves_a_board_with_no_marks_alone() {
        let plain = Board::standard();
        assert_eq!(hook(&plain, 0, 0), plain);
    }

    /// A fight in P2 (3 ejections credited to the player) with a marble of each side on the core,
    /// and far marbles that shuffle. It plays one player ply first, so the next one is the boss's.
    fn collapsing_fight() -> Encounter {
        let start = board(
            &[(0, 1), (3, -3)],
            &[(-1, 0), (-4, 4)],
            &[((0, 1), 1), ((-1, 0), 1)],
        );
        let mut enc = fight(start, Player::Black, [3, 0]);
        enc.play(&mv(&[(3, -3)], W)).unwrap();
        enc
    }

    #[test]
    fn the_core_is_announced_after_a_boss_turn_of_p2_then_collapses_after_your_turn() {
        let mut enc = collapsing_fight();
        assert!(!unstable_tell(&enc).unwrap().collapsing);
        enc.play(&mv(&[(-4, 4)], E)).unwrap();
        let tell = unstable_tell(&enc).unwrap();
        assert!(tell.core && tell.collapsing, "announced, still standing");
        assert_eq!(enc.game().board().get(0, 0), Some(Cell::Empty));
        enc.play(&mv(&[(2, -3)], W)).unwrap();
        let board = enc.game().board();
        for cell in ENERGY {
            assert_eq!(board.get(cell.0, cell.1), None, "{cell:?} vanished");
        }
        assert_eq!(cells_of(board, Cell::Black), vec![(1, -3)], "(0, 1) fell");
        assert_eq!(cells_of(board, Cell::White), vec![(-3, 4)], "(-1, 0) fell");
        assert_eq!(
            enc.game().ejected(Player::Black),
            4,
            "the boss marble counts for you"
        );
        assert_eq!(enc.game().ejected(Player::White), 1);
        let tell = unstable_tell(&enc).unwrap();
        assert!(!tell.core && !tell.collapsing);
        assert_eq!(
            marks(&enc).charges,
            vec![],
            "charges leave with their marbles"
        );
        let (_, events) = last_events(&enc).unwrap();
        assert!(events.collapsed);
    }

    #[test]
    fn the_core_never_collapses_in_p1_and_charges_stop_once_it_is_gone() {
        let start = board(&[(0, 1), (3, -3)], &[(-1, 0), (-4, 4)], &[]);
        let mut enc = fight(start, Player::Black, [2, 0]);
        enc.play(&mv(&[(3, -3)], W)).unwrap();
        enc.play(&mv(&[(-4, 4)], E)).unwrap();
        assert!(!unstable_tell(&enc).unwrap().collapsing);
        // On a board whose centre is gone nothing charges, whatever the cell.
        let mut hole = board(&[(1, 0)], &[(4, -4)], &[]);
        hole.void(0, 0);
        assert_eq!(hook(&hole, 0, 0).unstable().unwrap().charges, vec![]);
    }

    /// Black marbles shuffling in wedge 3 and the White marble in it, and `crowd` White marbles in
    /// wedge 0, in P3.
    fn p3_fight(black: &[P], white: &[P]) -> Encounter {
        fight(board(black, white, &[]), Player::Black, [5, 0])
    }

    #[test]
    fn in_p3_the_busiest_wedge_is_announced_then_shoved_outward_every_3_turns() {
        // A Black marble on the rim of wedge 0, three White marbles inside it; a Black and a
        // White marble shuffle in wedge 3.
        let mut enc = p3_fight(&[(-3, 0), (4, -2)], &[(2, 0), (3, -1), (2, -1), (-4, 2)]);
        let shuffle = [
            mv(&[(-3, 0)], E),
            mv(&[(-4, 2)], E),
            mv(&[(-2, 0)], W),
            mv(&[(-3, 2)], W),
            mv(&[(-3, 0)], E),
        ];
        let tell = |enc: &Encounter| unstable_tell(enc).unwrap();
        assert_eq!(tell(&enc).shock_in, Some(3));
        for ply in &shuffle[..2] {
            enc.play(ply).unwrap();
        }
        assert_eq!((tell(&enc).wedge, tell(&enc).shock_in), (None, Some(2)));
        for ply in &shuffle[2..4] {
            enc.play(ply).unwrap();
        }
        assert_eq!((tell(&enc).wedge, tell(&enc).shock_in), (Some(0), Some(1)));
        enc.play(&shuffle[4]).unwrap();
        let (before, events) = last_events(&enc).unwrap();
        let (wedge, moved) = events.shock.clone().unwrap();
        assert_eq!(wedge, 0);
        assert_eq!(moved.len(), 4, "the 4 marbles of the wedge");
        assert_eq!(moved[0], ((4, -2), moved[0].1), "outermost first");
        assert_eq!(ring(moved[0].1), 5, "off the board");
        assert_eq!(cells_of(&before, Cell::White).len(), 4);
        let board = enc.game().board();
        assert_eq!(
            cells_of(board, Cell::Black),
            vec![(-2, 0)],
            "the rim marble fell"
        );
        assert_eq!(enc.game().ejected(Player::White), 1);
        let white = cells_of(board, Cell::White);
        assert_eq!(white.len(), 4);
        assert!(moved[1..]
            .iter()
            .all(|&(from, to)| ring(to) == ring(from) + 1));
        assert_eq!(
            (tell(&enc).wedge, tell(&enc).shock_in),
            (None, Some(3)),
            "the clock restarts"
        );
    }

    #[test]
    fn the_busiest_wedge_is_drawn_on_a_tie() {
        let tied = board(&[(2, 0)], &[(0, -2)], &[]);
        let picked: Vec<u8> = (0..16).map(|state| busiest(&tied, state)).collect();
        assert!(picked.contains(&0) && picked.contains(&2));
        assert!(picked.iter().all(|w| [0, 2].contains(w)));
        // A marble on the centre belongs to no wedge.
        let centre = board(&[(0, 0), (2, 0), (3, 0)], &[(0, -2)], &[]);
        assert_eq!(busiest(&centre, 5), 0);
    }

    #[test]
    fn a_shoved_marble_moves_one_ring_out_and_stays_when_the_cell_ahead_is_taken() {
        // (3, 0), the corner of wedge 0, has (4, 0) and (4, -1) ahead in its wedge, and (3, 1) of
        // wedge 5, taken by a Black marble.
        let start = board(&[(3, 1)], &[(3, 0)], &[((3, 0), 2)]);
        let results: Vec<_> = (0..24)
            .map(|seed| {
                let mut b = start.clone();
                let mut charges = vec![((3, 0), 2)];
                let moved = shove(&mut b, &mut charges, 0, seed);
                (moved, cells_of(&b, Cell::White), charges)
            })
            .collect();
        assert!(results
            .iter()
            .any(|r| r.0 == vec![((3, 0), (4, 0))] && r.1 == vec![(4, 0)]));
        assert!(results.iter().any(|r| r.0 == vec![((3, 0), (4, -1))]));
        assert!(results
            .iter()
            .any(|r| r.0.is_empty() && r.1 == vec![(3, 0)]));
        for (_, white, charges) in results {
            assert_eq!(charges, vec![(white[0], 2)], "the charge follows");
        }
        // Outermost first: the rim marble leaves its cell to the one behind it.
        let mut chain = board(&[(3, 0)], &[(4, 0)], &[((4, 0), 1)]);
        let mut charges = vec![((4, 0), 1)];
        let moved = shove(&mut chain, &mut charges, 0, 0);
        assert_eq!(moved[0].0, (4, 0));
        assert_eq!(charges, vec![], "ejected with its charge");
        assert_eq!(moved.len(), 2);
    }

    #[test]
    fn the_same_seed_and_moves_give_the_same_fight_and_the_seed_matters() {
        let run = |seed: u64| {
            let mut enc = Encounter::new(
                {
                    let mut b = board(
                        &[(-3, 0), (4, -2)],
                        &[(2, 0), (3, -1), (2, -1), (-4, 2)],
                        &[],
                    );
                    b.set_unstable(Some(Unstable::default()));
                    Game::from_position(b, Player::Black, [5, 0])
                },
                unstable_boss(),
                seed,
            );
            for m in [
                mv(&[(-3, 0)], E),
                mv(&[(-4, 2)], E),
                mv(&[(-2, 0)], W),
                mv(&[(-3, 2)], W),
                mv(&[(-3, 0)], E),
            ] {
                enc.play(&m).unwrap();
            }
            enc.game().board().clone()
        };
        assert_eq!(run(1), run(1));
        let boards: Vec<Board> = (0..12).map(run).collect();
        assert!(
            boards.iter().any(|b| *b != boards[0]),
            "the seed changes the shove"
        );
    }

    #[test]
    fn the_tell_is_none_for_the_other_bosses() {
        let enc = Encounter::new(Game::new(), trivial_boss(), 0);
        assert_eq!(unstable_tell(&enc), None);
    }

    #[test]
    fn the_boss_replies_with_a_legal_move_and_the_same_move_twice() {
        let mut enc = unstable_start(5);
        assert_eq!(unstable_move(&enc), None, "the player's turn");
        let first = legal_moves(enc.game().board(), Player::Black)[0].clone();
        enc.play(&first).unwrap();
        enc.scale_node_budget(10);
        let reply = unstable_move(&enc).unwrap();
        assert!(legal_moves(enc.game().board(), Player::White).contains(&reply));
        assert_eq!(unstable_move(&enc), Some(reply));
    }

    #[test]
    fn the_boss_search_plays_the_weighted_rule() {
        // Only a charged marble can push here: the lone boss marble wins by pushing yours off.
        let start = board(&[(4, 0), (3, -3)], &[(3, 0), (-4, 4)], &[((3, 0), 1)]);
        let mut enc = fight(start, Player::Black, [0, 5]);
        enc.play(&mv(&[(3, -3)], W)).unwrap();
        assert_eq!(unstable_move(&enc), Some(mv(&[(3, 0)], E)));
    }

    #[test]
    fn the_search_step_carries_the_charges_and_credits_an_overload() {
        let start = board(&[(0, 0), (3, -3)], &[(-4, 4)], &[((0, 0), 3)]);
        let push = mv(&[(3, -3)], W);
        let (after, _) = apply(&start, Player::Black, &push).unwrap();
        let (out, credits) = search_step(0, &start, Player::Black, &push, after);
        assert_eq!(out.get(0, 0), Some(Cell::Empty));
        assert_eq!(credits, [0, 1], "your marble counts for the boss");
        let next = board(&[(3, -3)], &[(-4, 4)], &[]);
        let step = mv(&[(-4, 4)], E);
        let (after, _) = apply(&next, Player::White, &step).unwrap();
        let (out, credits) = search_step(1, &next, Player::White, &step, after);
        assert_eq!(credits, [0, 0]);
        assert!(
            out.unstable().unwrap().collapsing,
            "the boss ply of P2 announces"
        );
    }

    #[test]
    fn a_ply_hooks_with_the_seed_it_ran_with() {
        let mut enc = unstable_start(9);
        assert_eq!(enc.hook_seed(), 0);
        let first = legal_moves(enc.game().board(), Player::Black)[0].clone();
        enc.play(&first).unwrap();
        assert_ne!(enc.hook_seed(), 0);
    }

    use crate::moves::Direction::{NE, NW, SW};

    /// The fixture shared with the wasm bridge, the client harness and client/e2e/unstable.spec.ts:
    /// the plies of one fight, `(q, r, direction)`, one marble each unless the cells are listed
    /// (`PUSH`). `PUSH`: a pair walks up the centre column, charging, and pushes the boss column of
    /// three at ply 7 (a plain pair could not).
    const PUSH: [(&[P], Direction); 7] = [
        (&[(0, 2), (0, 3)], NW),
        (&[(-1, -3)], SW),
        (&[(0, 1), (0, 2)], NW),
        (&[(-2, -2)], NE),
        (&[(0, 0), (0, 1)], NW),
        (&[(-1, -3)], SW),
        (&[(0, -1), (0, 0)], NW),
    ];

    /// `FULL`: the boss walks 5 marbles onto the core one after another and they overload (plies
    /// 8, 10 and 16, 18), the 5th stands on it when it collapses (ply 19), then P3's shockwave hits
    /// at the end of the player's 3rd turn of it (ply 25).
    const FULL: [(P, Direction); 25] = [
        ((1, 3), NE),
        ((0, -2), SE),
        ((2, 2), SW),
        ((2, -2), SW),
        ((1, 3), NE),
        ((0, -3), SE),
        ((2, 2), SW),
        ((3, -3), SW),
        ((1, 3), NE),
        ((1, -2), SW),
        ((2, 2), SW),
        ((2, -2), SW),
        ((1, 3), NE),
        ((1, -3), SE),
        ((2, 2), SW),
        ((4, -3), SW),
        ((1, 3), NE),
        ((0, -2), SE),
        ((2, 2), SW),
        ((3, -2), NE),
        ((1, 3), NE),
        ((4, -3), SW),
        ((2, 2), SW),
        ((3, -2), NE),
        ((1, 3), NE),
    ];

    #[test]
    fn a_charged_pair_pushes_three_boss_marbles_in_the_fixture() {
        let mut enc = unstable_start(0);
        for (cells, dir) in &PUSH[..6] {
            enc.play(&mv(cells, *dir)).unwrap();
        }
        let push = mv(PUSH[6].0, PUSH[6].1);
        assert!(legal_moves(enc.game().board(), Player::Black).contains(&push));
        let plain = Board::standard();
        let trio_in_line = |b: &Board| (0..3).all(|i| b.get(0, -2 - i) == Some(Cell::White));
        assert!(trio_in_line(enc.game().board()));
        assert!(
            !legal_moves(&plain, Player::Black).contains(&push),
            "not on a plain board"
        );
        enc.play(&push).unwrap();
        assert_eq!(enc.game().ejected(Player::Black), 1);
        let board = enc.game().board();
        assert_eq!(board.get(0, -3), Some(Cell::White));
        assert_eq!(board.get(0, -4), Some(Cell::White));
        assert_eq!(board.get(0, -2), Some(Cell::Black));
        assert_eq!(marks(&enc).charges, vec![((0, -2), 2), ((0, -1), 3)]);
    }

    #[test]
    fn the_fixture_overloads_three_boss_marbles_collapses_the_core_and_shoves_a_wedge() {
        let mut enc = unstable_start(0);
        let mut ejected = Vec::new();
        for (ply, &((q, r), dir)) in FULL.iter().enumerate() {
            enc.play(&mv(&[(q, r)], dir)).unwrap();
            ejected.push(enc.game().ejected(Player::Black));
            let at = ply + 1;
            let events = last_events(&enc).map(|e| e.1);
            let overloaded = events.as_ref().map_or(0, |e| e.overloaded.len());
            assert_eq!(
                overloaded,
                usize::from([8, 10, 16, 18].contains(&at)),
                "ply {at}"
            );
            assert_eq!(
                events.as_ref().is_some_and(|e| e.collapsed),
                at == 19,
                "ply {at}"
            );
            assert_eq!(
                events.is_some_and(|e| e.shock.is_some()),
                at == 25,
                "ply {at}"
            );
        }
        assert_eq!(ejected[7], 1);
        assert_eq!(ejected[9], 2);
        assert_eq!(ejected[15], 3, "P2 from here");
        assert_eq!(ejected[17], 4);
        assert_eq!(ejected[18], 5, "the 5th fell with the core, P3 from here");
        assert_eq!(enc.phase(), 2);
        assert!(!unstable_tell(&enc).unwrap().core);
        let (_, events) = last_events(&enc).unwrap();
        assert!(events.shock.unwrap().1.len() > 3);
    }
}
