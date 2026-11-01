//! The Assembly Line (#744, docs/specs/game-design.md section 7.12): three conveyor belts run
//! along the middle rows of the board and carry every marble on them one cell per player turn;
//! the one at the downstream end falls off the board. In P3 their presses strike. The belts are
//! marks on the board (`Board::belts`), never marbles, so they change no move or push. Every
//! random pick is a splitmix64 of the fight seed and the ply, so every peer gets the same line.

use crate::board::{Belts, Board, Cell, RADIUS};
use crate::encounter::hull::mix;
use crate::encounter::{BossDef, Encounter};
use crate::game::Game;
use crate::moves::{Move, Player};
use crate::search::{search_hooked, DEFAULT_WEIGHTS};

type P = (i32, i32);

/// The row of each belt: the centre belt (9 cells), then the two rows beside it (8 cells each).
pub const BELT_ROWS: [i32; 3] = [0, -1, 1];
/// Player turns between two reversals of the centre belt. TUNE.
pub const ASSEMBLY_FLIP: u16 = 5;
/// Player turns between two strike announcements in P3. TUNE.
pub const ASSEMBLY_STRIKE_EVERY: u16 = 2;
/// P2 and P3 start after this many ejections credited to the player. TUNE.
pub const ASSEMBLY_PHASE_EJECTIONS: [u8; 2] = [3, 5];
/// Positions the boss search may visit per move (about depth 3, as the Hull). TUNE.
pub const ASSEMBLY_NODE_BUDGET: u32 = 3000;

/// What a belt or a press did to a marble.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fate {
    /// Carried one cell.
    Moved,
    /// Carried off the board at the downstream end.
    Fell,
    /// Destroyed by a press.
    Struck,
}

/// A marble a turn of the belts touched: where it was, where it went (the cell past the end for
/// a marble that fell, its own cell for a struck one), what happened and which marble it was.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Carry {
    pub from: P,
    pub to: P,
    pub fate: Fate,
    pub cell: Cell,
}

/// The cells of `belt` from its end of lowest `q`.
pub fn belt_cells(belt: usize) -> Vec<P> {
    let r = BELT_ROWS[belt];
    ((-RADIUS).max(-RADIUS - r)..=RADIUS.min(RADIUS - r))
        .map(|q| (q, r))
        .collect()
}

/// Whether the pattern slot shown by cell `index` of a belt of `len` cells scrolled by `shift` is
/// a strike slot: the slots alternate plain, strike, plain, strike from slot 0.
pub fn is_strike(len: usize, shift: u8, index: usize) -> bool {
    slot(len, shift, index) % 2 == 1
}

/// The pattern slot cell `index` shows.
fn slot(len: usize, shift: u8, index: usize) -> usize {
    (index + len - usize::from(shift) % len) % len
}

/// Belts that run in `phase`: the centre belt alone in P1, all three after.
pub fn running(phase: u8) -> usize {
    if phase == 0 {
        1
    } else {
        3
    }
}

/// Whether `belt` runs toward +q on the next player turn: the centre belt reverses after every
/// [`ASSEMBLY_FLIP`] turns, the two others always run against it.
pub fn forward(belts: &Belts, belt: usize) -> bool {
    let centre = belts.first ^ (belts.turns / ASSEMBLY_FLIP % 2 == 1);
    centre ^ (belt != 0)
}

/// Player turns left on the centre belt before it reverses, counting the next one.
pub fn flip_left(belts: &Belts) -> u8 {
    (ASSEMBLY_FLIP - belts.turns % ASSEMBLY_FLIP) as u8
}

/// Special id of the ply that just ended: the phase at the end of each player turn (Black moves
/// first, so the player's plies are odd), none for a boss turn.
fn special(ply: u32, phase: usize) -> Option<u8> {
    (ply % 2 == 1).then_some(phase as u8)
}

/// The board after one turn of the belts in `phase`, and the marbles it touched: the running
/// belts shift their marbles one cell at once, then the presses strike the slots announced on the
/// last turn, then in P3 every second turn a strike slot per belt is announced by `seed`.
pub fn turn(board: &Board, phase: u8, seed: u64) -> (Board, Vec<Carry>) {
    let Some(mut belts) = board.belts() else {
        return (board.clone(), Vec::new());
    };
    let mut out = board.clone();
    let mut carries = Vec::new();
    for belt in 0..running(phase) {
        let cells = belt_cells(belt);
        let step: i32 = if forward(&belts, belt) { 1 } else { -1 };
        let held: Vec<Cell> = cells
            .iter()
            .map(|&(q, r)| board.get(q, r).unwrap_or(Cell::Empty))
            .collect();
        for &(q, r) in &cells {
            if matches!(board.get(q, r), Some(Cell::Black | Cell::White)) {
                out.set(q, r, Cell::Empty);
            }
        }
        for (i, &cell) in held.iter().enumerate() {
            if !matches!(cell, Cell::Black | Cell::White) {
                continue;
            }
            let to = i as i32 + step;
            let (q, r) = cells[i];
            if to < 0 || to >= cells.len() as i32 {
                let off = (q + step, r);
                carries.push(Carry {
                    from: (q, r),
                    to: off,
                    fate: Fate::Fell,
                    cell,
                });
            } else {
                let dest = cells[to as usize];
                out.set(dest.0, dest.1, cell);
                carries.push(Carry {
                    from: (q, r),
                    to: dest,
                    fate: Fate::Moved,
                    cell,
                });
            }
        }
        let len = cells.len() as u8;
        belts.shift[belt] = (belts.shift[belt] + if step > 0 { 1 } else { len - 1 }) % len;
    }
    for belt in 0..3 {
        let Some(s) = belts.strike[belt].take() else {
            continue;
        };
        let cells = belt_cells(belt);
        let (q, r) = cells[(usize::from(s) + usize::from(belts.shift[belt])) % cells.len()];
        if let Some(cell @ (Cell::Black | Cell::White)) = out.get(q, r) {
            out.set(q, r, Cell::Empty);
            carries.push(Carry {
                from: (q, r),
                to: (q, r),
                fate: Fate::Struck,
                cell,
            });
        }
    }
    belts.turns += 1;
    if phase == 2 && belts.turns % ASSEMBLY_STRIKE_EVERY == 0 {
        for belt in 0..3 {
            belts.strike[belt] = Some(2 * (mix(seed.wrapping_add(belt as u64)) % 4) as u8 + 1);
        }
    }
    out.set_belts(Some(belts));
    (out, carries)
}

/// The hook: one turn of the belts at the end of a player turn.
fn hook(board: &Board, phase: u8, seed: u64) -> Board {
    turn(board, phase, seed).0
}

/// The Assembly Line boss definition.
pub fn assembly_boss() -> BossDef {
    BossDef {
        name: "The Assembly Line",
        phase_marbles: Vec::new(),
        phase_ejections: ASSEMBLY_PHASE_EJECTIONS.to_vec(),
        special,
        hook,
        conversions: None,
        node_budget: ASSEMBLY_NODE_BUDGET,
    }
}

/// A new encounter: the standard layout, the player is Black and moves first, and the centre
/// belt's first direction is drawn (ply 0 of the seed).
pub fn assembly_start(seed: u64) -> Encounter {
    let mut board = Board::standard();
    board.set_belts(Some(Belts {
        first: mix(seed) % 2 == 1,
        turns: 0,
        shift: [0; 3],
        strike: [None; 3],
    }));
    Encounter::new(
        Game::from_position(board, Player::Black, [0, 0]),
        assembly_boss(),
        seed,
    )
}

/// What the player sees of one belt: whether it runs, which way, its pattern scroll and the
/// announced strike slot.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BeltTell {
    pub running: bool,
    pub forward: bool,
    pub shift: u8,
    pub strike: Option<u8>,
}

/// The belts now: the player turns left before the centre belt reverses and the three belts, with
/// the phase now. `None` for the other bosses.
pub fn assembly_tell(enc: &Encounter) -> Option<(u8, [BeltTell; 3])> {
    let belts = enc.game().board().belts()?;
    let tell = |belt: usize| BeltTell {
        running: belt < running(enc.phase() as u8),
        forward: forward(&belts, belt),
        shift: belts.shift[belt],
        strike: belts.strike[belt],
    };
    Some((flip_left(&belts), [tell(0), tell(1), tell(2)]))
}

/// The marbles the belts and presses of the last ply touched. Empty when the last ply fired no
/// hook.
pub fn last_belts(enc: &Encounter) -> Vec<Carry> {
    enc.hooked()
        .map_or_else(Vec::new, |(before, phase)| turn(before, *phase, 0).1)
}

/// What the boss search sees after `mover` played from `before` to `after`: on a player ply, the
/// belts in the phase the tree's credits reach at the start of that ply (`Encounter::phase_after`,
/// as the encounter takes the phase at the start of the turn); nothing on a boss ply. Seed 0 for
/// the strikes.
fn assembly_step(enc: &Encounter, before: &Board, mover: Player, after: Board) -> (Board, [u8; 2]) {
    if mover == Player::White {
        return (after, [0, 0]);
    }
    let out = hook(&after, enc.phase_after(before) as u8, 0);
    let [black, white] = crate::encounter::losses(&after, &out);
    (out, [white, black])
}

/// The boss reply: its node-limited search, where every player ply of the tree goes through the
/// belts (`assembly_step`), so it sees what they carry off and what the presses strike. `None` on
/// the player's turn or when the game is over.
pub fn assembly_move(enc: &Encounter) -> Option<Move> {
    if enc.game().to_move() != Player::White {
        return None;
    }
    assembly_search(enc, enc.boss.node_budget, &|_| true)
}

/// The node-limited search of `enc` for the side to move, every player ply of its tree through
/// the belts (`assembly_step`): the boss reply of [`assembly_move`], or the ladder player, who
/// reads the belts and the announced strikes on the board.
pub(crate) fn assembly_search(
    enc: &Encounter,
    budget: u32,
    allow: &dyn Fn(&Move) -> bool,
) -> Option<Move> {
    let step = |before: &Board, mover: Player, _: &Move, after: Board| {
        assembly_step(enc, before, mover, after)
    };
    search_hooked(enc.game(), budget, DEFAULT_WEIGHTS, allow, &step).map(|r| r.mv)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encounter::hull::HULL_NODE_BUDGET;
    use crate::encounter::{marbles, PveResult};
    use crate::moves::{legal_moves, Direction};

    fn belts(first: bool, turns: u16) -> Belts {
        Belts {
            first,
            turns,
            shift: [0; 3],
            strike: [None; 3],
        }
    }

    fn board(black: &[P], white: &[P], belts: Belts) -> Board {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        board.set_belts(Some(belts));
        board
    }

    fn fight(board: Board, to_move: Player, ejected: [u8; 2]) -> Encounter {
        Encounter::new(
            Game::from_position(board, to_move, ejected),
            assembly_boss(),
            0,
        )
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    fn cells_of(board: &Board, color: Cell) -> Vec<P> {
        let mut out: Vec<P> = (-4..=4)
            .flat_map(|q| (-4..=4).map(move |r| (q, r)))
            .filter(|&(q, r)| board.get(q, r) == Some(color))
            .collect();
        out.sort_unstable();
        out
    }

    /// The Black marble that steps off the belts for the player's turn in the small fights below.
    const STEP: (P, Direction) = ((0, 4), Direction::W);

    #[test]
    fn boss_definition_matches_the_spec() {
        let b = assembly_boss();
        assert_eq!(b.name, "The Assembly Line");
        assert!(b.phase_marbles.is_empty());
        assert_eq!(b.phase_ejections, vec![3, 5], "P2 after 3, P3 after 5");
        assert_eq!(b.node_budget, ASSEMBLY_NODE_BUDGET);
        assert_eq!(ASSEMBLY_NODE_BUDGET, HULL_NODE_BUDGET, "the Hull's budget");
    }

    #[test]
    fn the_belts_are_the_three_middle_rows() {
        let lengths: Vec<usize> = (0..3).map(|b| belt_cells(b).len()).collect();
        assert_eq!(lengths, vec![9, 8, 8]);
        assert_eq!(belt_cells(0).first(), Some(&(-4, 0)));
        assert_eq!(belt_cells(0).last(), Some(&(4, 0)));
        assert_eq!(belt_cells(1).first(), Some(&(-3, -1)));
        assert_eq!(belt_cells(1).last(), Some(&(4, -1)));
        assert_eq!(belt_cells(2).first(), Some(&(-4, 1)));
        assert_eq!(belt_cells(2).last(), Some(&(3, 1)));
        for belt in 0..3 {
            let b = Board::empty();
            let cells = belt_cells(belt);
            assert!(cells.iter().all(|&(q, r)| b.get(q, r).is_some()));
            let (first, last) = (cells[0], cells[cells.len() - 1]);
            assert_eq!(b.get(first.0 - 1, first.1), None, "an edge");
            assert_eq!(b.get(last.0 + 1, last.1), None, "an edge");
        }
    }

    #[test]
    fn the_slots_alternate_plain_and_strike_and_scroll_with_the_belt() {
        let at = |len, shift| -> Vec<bool> { (0..len).map(|i| is_strike(len, shift, i)).collect() };
        assert_eq!(
            at(8, 0),
            [false, true, false, true, false, true, false, true]
        );
        assert_eq!(
            at(8, 1),
            [true, false, true, false, true, false, true, false]
        );
        assert_eq!(
            at(9, 1),
            [false, false, true, false, true, false, true, false, true],
            "the loop of 9 has two plain slots side by side"
        );
        assert_eq!(at(9, 0).iter().filter(|&&s| s).count(), 4);
    }

    #[test]
    fn the_fight_starts_on_the_standard_layout_with_a_first_direction_drawn() {
        let enc = assembly_start(0);
        let mut plain = enc.game().board().clone();
        let start = plain.belts().unwrap();
        assert_eq!(
            (start.turns, start.shift, start.strike),
            (0, [0; 3], [None; 3])
        );
        plain.set_belts(None);
        assert_eq!(plain, Board::standard());
        assert_eq!(enc.game().to_move(), Player::Black);
        assert_eq!(enc.phase(), 0);
        assert_eq!(enc.game().win_ejections(Player::Black), 6);
        assert_eq!(enc.game().win_ejections(Player::White), 6);
        let firsts: Vec<bool> = (0..40)
            .map(|seed| assembly_start(seed).game().board().belts().unwrap().first)
            .collect();
        assert!(firsts.contains(&true) && firsts.contains(&false));
    }

    #[test]
    fn a_marble_is_carried_one_cell_and_the_downstream_end_falls_either_side_credited() {
        // The centre belt runs toward +q: the Black marble on the east end falls (the boss
        // scores), the White marble beside it moves, the row stays whole.
        let east = board(&[(4, 0), STEP.0], &[(3, 0), (-4, 0)], belts(true, 0));
        let mut enc = fight(east, Player::Black, [0, 0]);
        enc.play(&mv(&[STEP.0], STEP.1)).unwrap();
        let b = enc.game().board();
        assert_eq!(cells_of(b, Cell::White), vec![(-3, 0), (4, 0)]);
        assert_eq!(marbles(b, Cell::Black), 1, "the one on the end fell");
        assert_eq!(enc.game().ejected(Player::White), 1);
        assert_eq!(enc.game().ejected(Player::Black), 0);
        // Toward -q: the White marble on the west end falls (you score).
        let west = board(&[(4, 0), STEP.0], &[(3, 0), (-4, 0)], belts(false, 0));
        let mut enc = fight(west, Player::Black, [0, 0]);
        enc.play(&mv(&[STEP.0], STEP.1)).unwrap();
        let b = enc.game().board();
        assert_eq!(cells_of(b, Cell::Black), vec![(-1, 4), (3, 0)]);
        assert_eq!(marbles(b, Cell::White), 1);
        assert_eq!(enc.game().ejected(Player::Black), 1);
        assert_eq!(enc.game().ejected(Player::White), 0);
    }

    #[test]
    fn marbles_move_at_once_ignoring_sumito_and_keep_their_order() {
        let start = board(&[(0, 4), (1, 0)], &[(2, 0), (3, 0)], belts(true, 0));
        let (out, carries) = turn(&start, 0, 0);
        assert_eq!(cells_of(&out, Cell::Black), vec![(0, 4), (2, 0)]);
        assert_eq!(cells_of(&out, Cell::White), vec![(3, 0), (4, 0)]);
        assert_eq!(carries.len(), 3);
        assert!(carries.iter().all(|c| c.fate == Fate::Moved));
        assert_eq!(carries[0].from, (1, 0));
        assert_eq!(carries[0].to, (2, 0));
        assert_eq!(carries[0].cell, Cell::Black);
    }

    #[test]
    fn a_marble_off_the_belts_stays_and_a_fallen_one_is_reported_past_the_end() {
        let start = board(&[(0, 4), (4, 0)], &[(-4, 0)], belts(true, 0));
        let (out, carries) = turn(&start, 0, 0);
        assert_eq!(cells_of(&out, Cell::Black), vec![(0, 4)]);
        assert_eq!(cells_of(&out, Cell::White), vec![(-3, 0)]);
        assert!(carries.contains(&Carry {
            from: (4, 0),
            to: (5, 0),
            fate: Fate::Fell,
            cell: Cell::Black
        }));
        let (_, carries) = turn(&board(&[(-4, 0)], &[], belts(false, 0)), 0, 0);
        assert_eq!(carries[0].to, (-5, 0));
    }

    #[test]
    fn only_the_centre_belt_runs_in_p1_and_the_other_two_run_against_it_from_p2() {
        let start = board(&[(1, -1)], &[(-1, 1), (0, 0)], belts(true, 0));
        let (p1, _) = turn(&start, 0, 0);
        assert_eq!(
            cells_of(&p1, Cell::Black),
            vec![(1, -1)],
            "the side belts rest"
        );
        assert_eq!(cells_of(&p1, Cell::White), vec![(-1, 1), (1, 0)]);
        let (p2, _) = turn(&start, 1, 0);
        assert_eq!(
            cells_of(&p2, Cell::Black),
            vec![(0, -1)],
            "against the centre"
        );
        assert_eq!(cells_of(&p2, Cell::White), vec![(-2, 1), (1, 0)]);
        let back = board(&[(1, -1)], &[(-1, 1), (0, 0)], belts(false, 0));
        let (p2, _) = turn(&back, 2, 0);
        assert_eq!(cells_of(&p2, Cell::Black), vec![(2, -1)]);
        assert_eq!(cells_of(&p2, Cell::White), vec![(-1, 0), (0, 1)]);
    }

    #[test]
    fn a_side_belt_drops_its_marble_off_its_own_end() {
        let start = board(&[(4, -1)], &[(3, 1)], belts(false, 0));
        let (out, carries) = turn(&start, 1, 0);
        assert_eq!(marbles(&out, Cell::Black) + marbles(&out, Cell::White), 0);
        assert_eq!(carries.len(), 2);
        assert!(carries.iter().all(|c| c.fate == Fate::Fell));
    }

    #[test]
    fn the_centre_belt_reverses_after_turns_5_and_10_and_counts_down() {
        let mut b = board(&[(-4, 0)], &[], belts(true, 0));
        let mut seen = Vec::new();
        let mut left = Vec::new();
        for _ in 0..11 {
            left.push(flip_left(&b.belts().unwrap()));
            b = turn(&b, 0, 0).0;
            seen.push(cells_of(&b, Cell::Black)[0].0);
        }
        assert_eq!(seen, [-3, -2, -1, 0, 1, 0, -1, -2, -3, -4, -3]);
        assert_eq!(left, [5, 4, 3, 2, 1, 5, 4, 3, 2, 1, 5]);
        let at = |first, turns| forward(&belts(first, turns), 0);
        assert!(at(true, 4) && !at(true, 5) && !at(true, 9) && at(true, 10));
        assert!(!at(false, 4) && at(false, 5) && !at(false, 10));
        assert!(!forward(&belts(true, 0), 1), "the sides run against it");
        assert!(forward(&belts(true, 5), 2));
    }

    #[test]
    fn p3_announces_a_strike_slot_per_belt_every_second_turn_and_p1_p2_none() {
        let start = board(&[], &[], belts(true, 0));
        let one = turn(&start, 2, 7).0;
        assert_eq!(one.belts().unwrap().strike, [None; 3], "turn 1");
        let two = turn(&one, 2, 7).0;
        let strike = two.belts().unwrap().strike;
        assert!(strike.iter().all(|s| matches!(s, Some(1 | 3 | 5 | 7))));
        let three = turn(&two, 2, 8).0;
        assert_eq!(
            three.belts().unwrap().strike,
            [None; 3],
            "struck, no new one"
        );
        assert!(turn(&three, 2, 9)
            .0
            .belts()
            .unwrap()
            .strike
            .iter()
            .all(Option::is_some));
        let mut quiet = start;
        for _ in 0..6 {
            quiet = turn(&quiet, 1, 7).0;
        }
        assert_eq!(quiet.belts().unwrap().strike, [None; 3], "P2 has no strike");
        let mut picked: Vec<u8> = (0..40)
            .flat_map(|seed| {
                let b = board(&[], &[], belts(true, 1));
                turn(&b, 2, seed)
                    .0
                    .belts()
                    .unwrap()
                    .strike
                    .map(Option::unwrap)
            })
            .collect();
        picked.sort_unstable();
        picked.dedup();
        assert_eq!(
            picked,
            vec![1, 3, 5, 7],
            "any strike slot, never a plain one"
        );
    }

    #[test]
    fn the_press_destroys_a_marble_of_each_side_on_its_announced_slot() {
        // Centre slot 3 and upper slot 1 are announced. The belts move first: the centre toward
        // +q (slot 3 sits on cell 3, then 4), the upper toward -q (slot 1 on cell 1, then 0).
        let start = Belts {
            strike: [Some(3), Some(1), None],
            ..belts(true, 0)
        };
        let b = board(&[(-1, 0)], &[(-2, -1), (3, 1)], start);
        let (out, carries) = turn(&b, 2, 0);
        assert_eq!(marbles(&out, Cell::Black) + marbles(&out, Cell::White), 1);
        assert_eq!(
            cells_of(&out, Cell::White),
            vec![(2, 1)],
            "no strike on the third belt"
        );
        let struck: Vec<_> = carries.iter().filter(|c| c.fate == Fate::Struck).collect();
        assert_eq!(struck.len(), 2);
        assert_eq!(
            (struck[0].from, struck[0].to, struck[0].cell),
            ((0, 0), (0, 0), Cell::Black)
        );
        assert_eq!((struck[1].from, struck[1].cell), ((-3, -1), Cell::White));
        assert_eq!(out.belts().unwrap().strike[..2], [None, None]);
    }

    #[test]
    fn the_announced_slot_moves_with_the_belt_and_the_marble_ahead_of_it_is_safe() {
        // Slot 5 at shift 2 sits on cell 7 (3, 0); the belt moves it to cell 8 (4, 0).
        let start = Belts {
            shift: [2, 0, 0],
            strike: [Some(5), None, None],
            ..belts(true, 3)
        };
        let b = board(&[(3, 0)], &[(2, 0)], start);
        let (out, carries) = turn(&b, 2, 0);
        assert_eq!(
            cells_of(&out, Cell::White),
            vec![(3, 0)],
            "was on slot 4, safe"
        );
        assert_eq!(
            cells_of(&out, Cell::Black),
            vec![],
            "was on slot 5: struck at (4, 0)"
        );
        assert_eq!((carries[2].from, carries[2].fate), ((4, 0), Fate::Struck));
        assert_eq!(out.belts().unwrap().shift[0], 3);
        // The same slot with the belt running the other way ends on cell 6.
        let back = Belts {
            first: false,
            ..start
        };
        let (_, carries) = turn(&board(&[(3, 0)], &[], back), 2, 0);
        assert_eq!((carries[1].from, carries[1].fate), ((2, 0), Fate::Struck));
    }

    #[test]
    fn a_press_credits_the_other_side_in_the_fight() {
        let start = Belts {
            strike: [Some(1), None, None],
            ..belts(true, 1)
        };
        let b = board(&[(0, 4), (-3, 0)], &[(3, 0)], start);
        let mut enc = fight(b, Player::Black, [5, 0]);
        enc.play(&mv(&[STEP.0], STEP.1)).unwrap();
        assert_eq!(enc.phase(), 2);
        assert_eq!(
            marbles(enc.game().board(), Cell::Black),
            1,
            "(-3, 0) struck"
        );
        assert_eq!(enc.game().ejected(Player::White), 1);
        assert_eq!(enc.game().ejected(Player::Black), 5);
        assert_eq!(
            last_belts(&enc).iter().map(|c| c.fate).collect::<Vec<_>>(),
            vec![Fate::Moved, Fate::Moved, Fate::Struck]
        );
    }

    #[test]
    fn the_phase_changes_after_3_and_5_ejections_by_the_player() {
        let b = board(&[(0, 4)], &[(0, -4)], belts(true, 0));
        assert_eq!(fight(b.clone(), Player::Black, [2, 0]).phase(), 0);
        assert_eq!(fight(b.clone(), Player::Black, [3, 0]).phase(), 1);
        assert_eq!(fight(b, Player::Black, [5, 0]).phase(), 2);
    }

    #[test]
    fn a_belt_can_win_or_lose_the_fight() {
        let b = board(&[(0, 4)], &[(-4, 0), (0, -4)], belts(false, 0));
        let mut enc = fight(b, Player::Black, [5, 0]);
        enc.play(&mv(&[STEP.0], STEP.1)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Won));
        let b = board(&[(0, 4), (4, 0)], &[(0, -4)], belts(true, 0));
        let mut enc = fight(b, Player::Black, [0, 5]);
        enc.play(&mv(&[STEP.0], STEP.1)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Lost));
    }

    #[test]
    fn a_boss_turn_moves_no_belt_and_reports_nothing() {
        let b = board(&[(0, 4)], &[(-4, 0), (0, -4)], belts(true, 0));
        let mut enc = fight(b, Player::Black, [0, 0]);
        enc.play(&mv(&[STEP.0], STEP.1)).unwrap();
        assert_eq!(enc.game().board().belts().unwrap().turns, 1);
        enc.play(&mv(&[(0, -4)], Direction::E)).unwrap();
        assert_eq!(
            enc.game().board().belts().unwrap().turns,
            1,
            "the boss turn"
        );
        assert_eq!(last_belts(&enc), vec![]);
        assert_eq!(
            last_belts(&fight(Board::empty(), Player::Black, [0, 0])),
            vec![]
        );
        let plain = Board::standard();
        assert_eq!(turn(&plain, 2, 0).0, plain, "no belts, no turn");
    }

    #[test]
    fn the_tell_reports_the_belts_now() {
        let start = Belts {
            shift: [4, 0, 1],
            strike: [None, Some(3), None],
            ..belts(true, 7)
        };
        let enc = fight(board(&[], &[], start), Player::Black, [3, 0]);
        let (left, tell) = assembly_tell(&enc).unwrap();
        assert_eq!(left, 3);
        assert_eq!(
            tell[0],
            BeltTell {
                running: true,
                forward: false,
                shift: 4,
                strike: None
            }
        );
        assert_eq!(
            tell[1],
            BeltTell {
                running: true,
                forward: true,
                shift: 0,
                strike: Some(3)
            }
        );
        assert_eq!(tell[2].shift, 1);
        let p1 = assembly_tell(&assembly_start(1)).unwrap();
        assert_eq!(p1.0, 5);
        assert!(p1.1[0].running && !p1.1[1].running && !p1.1[2].running);
        assert_eq!(
            assembly_tell(&fight(Board::standard(), Player::Black, [0, 0])),
            None
        );
    }

    /// The belts and the board after each of 30 plies of first legal moves from `seed`.
    fn line(seed: u64) -> Vec<(Option<Belts>, Board)> {
        let mut enc = assembly_start(seed);
        (0..30)
            .map(|_| {
                let game = enc.game();
                let m = legal_moves(game.board(), game.to_move()).swap_remove(0);
                enc.play(&m).unwrap();
                (enc.game().board().belts(), enc.game().board().clone())
            })
            .collect()
    }

    #[test]
    fn the_same_seed_and_moves_run_the_same_belts_and_the_seed_matters() {
        assert_eq!(line(11), line(11));
        let runs: Vec<_> = (0..8).map(line).collect();
        assert!(
            runs.iter().any(|r| *r != runs[0]),
            "the seed picks the first way"
        );
    }

    #[test]
    fn the_boss_steps_off_a_belt_that_is_about_to_drop_its_marble() {
        // The centre belt runs toward -q: the White marble on its west end falls next turn.
        let b = board(&[(0, 4)], &[(-4, 0), (4, -4)], belts(false, 0));
        let m = assembly_move(&fight(b, Player::White, [0, 0])).unwrap();
        assert_eq!(m.cells, vec![(-4, 0)], "{m:?}");
    }

    #[test]
    fn the_tree_step_runs_three_belts_once_a_third_ejection_is_credited() {
        // The root: boss to move, 2 ejections for the player (P1), 3 boss marbles, Black alone on
        // a side belt, which runs toward -q once the side belts run (P2).
        let root = board(&[(0, -1)], &[(-4, 3), (4, -4), (3, 1)], belts(true, 0));
        let enc = fight(root.clone(), Player::White, [2, 0]);
        assert_eq!(enc.phase(), 0);
        // A player ply that starts with the root's boss marbles still belts at P1: only the centre.
        let (out, credits) = assembly_step(&enc, &root, Player::Black, root.clone());
        assert_eq!(out.get(0, -1), Some(Cell::Black), "P1: the side belt rests");
        assert_eq!(credits, [0, 0]);
        // One boss marble gone from the board at the start of the ply: 3 ejections, P2.
        let mut gone = root.clone();
        gone.set(3, 1, Cell::Empty);
        let (out, credits) = assembly_step(&enc, &gone, Player::Black, gone.clone());
        assert_eq!(out.get(0, -1), Some(Cell::Empty), "P2: the side belt runs");
        assert_eq!(out.get(-1, -1), Some(Cell::Black));
        assert_eq!(credits, [0, 0]);
        // A boss ply runs no belt.
        let (out, credits) = assembly_step(&enc, &gone, Player::White, gone.clone());
        assert_eq!((out, credits), (gone, [0, 0]));
    }

    #[test]
    fn the_phase_reached_in_the_tree_changes_the_best_move() {
        // Boss to move at 2 ejections (P1) with 5 marbles, the centre belt running toward -q: the
        // boss marble on its west end falls next turn, the third ejection, which opens the side
        // belts for the turn after. Found among 4000 random positions of this kind (2 gave two
        // moves) at the shipped 3000 nodes.
        let start = board(
            &[(2, 2), (-2, -2)],
            &[(-1, -1), (-4, 0), (-3, 2), (0, 2), (1, 2)],
            belts(false, 0),
        );
        let enc = fight(start, Player::White, [2, 0]);
        assert_eq!(enc.phase(), 0);
        // The search before #914: every player ply of the tree belts at the root phase.
        let frozen = |_: &Board, mover: Player, _: &Move, after: Board| {
            if mover == Player::White {
                return (after, [0, 0]);
            }
            let out = hook(&after, 0, 0);
            let [black, white] = crate::encounter::losses(&after, &out);
            (out, [white, black])
        };
        let old = search_hooked(
            enc.game(),
            ASSEMBLY_NODE_BUDGET,
            DEFAULT_WEIGHTS,
            &|_| true,
            &frozen,
        )
        .unwrap();
        assert_eq!(old.mv, mv(&[(-4, 0)], Direction::NE));
        assert_eq!(
            assembly_move(&enc),
            Some(mv(&[(0, 2), (1, 2)], Direction::E))
        );
    }

    #[test]
    fn the_boss_replies_only_on_its_turn() {
        let mut enc = assembly_start(0);
        assert_eq!(assembly_move(&enc), None);
        let first = legal_moves(enc.game().board(), Player::Black).swap_remove(0);
        enc.play(&first).unwrap();
        let m = assembly_move(&enc).unwrap();
        assert!(legal_moves(enc.game().board(), Player::White).contains(&m));
    }

    /// The fixture shared with the wasm bridge, the client harness and client/e2e/assembly.spec.ts:
    /// fight seed 1, whose centre belt first runs toward +q, then one-marble moves `(q, r,
    /// direction)` where the boss marbles walk onto the belts and you wait on the back rows. A boss
    /// marble is carried off the east end after ply 7 (turn 4), the belt reverses after turn 5, the
    /// side belts run from ply 21 (P2 after ply 19), P3 after ply 29, the presses are announced
    /// after ply 31 and strike your marble on the lower belt after ply 33.
    const FIXTURE_SEED: u64 = 1;
    const FIXTURE: [(i32, i32, Direction); 33] = [
        (-4, 3, Direction::NE),
        (2, -2, Direction::SE),
        (-4, 4, Direction::NW),
        (2, -1, Direction::SE),
        (-4, 3, Direction::NW),
        (3, 0, Direction::E),
        (-4, 2, Direction::SE),
        (0, -2, Direction::SW),
        (-4, 3, Direction::NW),
        (-1, -1, Direction::SW),
        (-4, 2, Direction::SE),
        (-3, 0, Direction::W),
        (-4, 3, Direction::NW),
        (-1, -3, Direction::SW),
        (-4, 2, Direction::SE),
        (-2, -2, Direction::SW),
        (-4, 3, Direction::NW),
        (-3, -1, Direction::SW),
        (-4, 2, Direction::SE),
        (1, -2, Direction::SW),
        (-4, 3, Direction::NW),
        (-1, -1, Direction::W),
        (-4, 2, Direction::SE),
        (0, -3, Direction::SW),
        (-4, 3, Direction::NW),
        (-1, -2, Direction::SW),
        (-4, 2, Direction::SE),
        (1, -3, Direction::SW),
        (-4, 3, Direction::NW),
        (0, -4, Direction::SW),
        (-4, 2, Direction::NE),
        (-1, -3, Direction::E),
        (-3, 2, Direction::NW),
    ];

    #[test]
    fn the_fixture_carries_a_boss_marble_off_reverses_and_ends_in_a_strike_on_your_marble() {
        let mut enc = assembly_start(FIXTURE_SEED);
        let mut falls = Vec::new();
        for (i, &(q, r, dir)) in FIXTURE.iter().enumerate() {
            enc.play(&mv(&[(q, r)], dir)).unwrap();
            let seen = last_belts(&enc);
            if let Some(c) = seen.iter().find(|c| c.fate != Fate::Moved) {
                falls.push((i + 1, c.fate, c.cell));
            }
            let belts = enc.game().board().belts().unwrap();
            match i + 1 {
                7 => assert_eq!(
                    assembly_tell(&enc).unwrap().0,
                    1,
                    "after turn 4: the next is the last"
                ),
                10 => assert!(!assembly_tell(&enc).unwrap().1[0].forward, "reversed"),
                19 => assert_eq!(enc.phase(), 1),
                29 => assert_eq!(enc.phase(), 2),
                31 => assert_eq!(belts.strike, [Some(5), Some(3), Some(5)]),
                _ => {}
            }
        }
        assert_eq!(
            falls,
            vec![
                (7, Fate::Fell, Cell::White),
                (13, Fate::Fell, Cell::White),
                (19, Fate::Fell, Cell::White),
                (25, Fate::Fell, Cell::White),
                (29, Fate::Fell, Cell::White),
                (33, Fate::Struck, Cell::Black),
            ]
        );
        assert_eq!(enc.game().ejected(Player::Black), 5);
        assert_eq!(enc.game().ejected(Player::White), 1);
        assert_eq!(enc.result(), None);
    }
}
