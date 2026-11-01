//! The Ballast Mind (#47, docs/specs/game-design.md section 7.5): the final exam. A radius 5
//! board with six void pillars, 16 marbles each, and no rule code of its own. Every
//! [`BALLAST_EVERY`] turns it borrows one effect of another boss, picked by the engine PRNG among
//! five one-shot hooks that run that boss's own code:
//!
//! - the Hull's crack (P1 rim, P2 inner, P3 any cell), whose timer the Hull ticks on every
//!   player turn (special id [`BALLAST_TICK`]);
//! - the Pulsar's pulse from a random direction, at force 2, 3 and infinite;
//! - the Magnetizer's polarity: one marble polarized, then the settle;
//! - the Chaplain's conversion check, at threshold 4;
//! - the Swarm's wave: the arrivals of the phase land at once on the empty rim cells away from the
//!   player's start side.
//!
//! The phases come from the ejections (P2 after 3, P3 after 5), as in the bosses it borrows from.
//! The effect fires at the end of a boss turn, so the player reads it one turn ahead in the HUD.

use crate::board::{Board, Cell, MAX_RADIUS};
use crate::encounter::chaplain::{chaplain_boss, CHAPLAIN_BOSS_END};
use crate::encounter::hull::{hull_boss, hull_step, mix, HULL_CRACKS, HULL_PLAYER_END};
use crate::encounter::magnetizer::{magnetizer_boss, MAGNETIZER_ANNOUNCE, MAGNETIZER_TURN};
use crate::encounter::pulsar::{pulse, PULSAR_FORCE};
use crate::encounter::swarm::wave;
use crate::encounter::{losses, no_gain, ply_seed, BossDef, Encounter};
use crate::game::{Game, WIN_EJECTIONS};
use crate::moves::{apply, legal_moves, Move, Player};
use crate::search::{search_phased, DEFAULT_WEIGHTS};

type P = (i32, i32);

/// Ejections the player needs to win against The Ballast Mind. The boss starts with 16 marbles: win
/// at 8 ejections (8 boss marbles left). It was 12 (Decision #482) before #1209. TUNE.
pub const BALLAST_WIN_EJECTIONS: u8 = 8;
/// Ejections of its marbles that make the player lose (16 marbles). It was 6 before #1209. TUNE.
pub const BALLAST_LOSE_EJECTIONS: u8 = 12;

/// Radius of the Ballast board: 91 cells before the pillars.
pub const BALLAST_RADIUS: i32 = 5;
const _: () = assert!(BALLAST_RADIUS <= MAX_RADIUS);
/// The six void pillars: one cell on each of the six sides of the centre ring (radius 2), the
/// orbit of `(1, 1)` under the 60 degree rotation `(q, r) -> (-r, q + r)`. Symmetric under the
/// point reflection of the Echo and the rotation.
pub const BALLAST_PILLARS: [P; 6] = [(1, 1), (-1, 2), (-2, 1), (-1, -1), (1, -2), (2, -1)];
/// Player start, Black at the bottom: the point reflection of the boss start, 16 marbles. Six cells
/// of row 5, seven of row 4, three of row 3.
pub const BALLAST_PLAYER_START: [P; 16] = [
    (-5, 5),
    (-4, 5),
    (-3, 5),
    (-2, 5),
    (-1, 5),
    (0, 5),
    (-5, 4),
    (-4, 4),
    (-3, 4),
    (-2, 4),
    (-1, 4),
    (0, 4),
    (1, 4),
    (-3, 3),
    (-2, 3),
    (-1, 3),
];
/// Boss start, White at the top: six cells of row -5, seven of row -4, three of row -3, 16 marbles.
pub const BALLAST_BOSS_START: [P; 16] = [
    (5, -5),
    (4, -5),
    (3, -5),
    (2, -5),
    (1, -5),
    (0, -5),
    (5, -4),
    (4, -4),
    (3, -4),
    (2, -4),
    (1, -4),
    (0, -4),
    (-1, -4),
    (3, -3),
    (2, -3),
    (1, -3),
];
/// P2 and P3 start after this many ejections credited to the player, as the bosses it borrows from. TUNE.
pub const BALLAST_PHASE_EJECTIONS: [u8; 2] = [3, 5];
/// Positions the boss search may visit per move. It was 150 000 (2.4 s native) before the search
/// played the borrowed effects, 3000 with them (#824), and 100 since #833, the best of the ladder
/// (docs/specs/boss-balance.md section 3). TUNE.
pub const BALLAST_NODE_BUDGET: u32 = 100;
/// Boss turns between two borrowed effects. TUNE.
pub const BALLAST_EVERY: u32 = 2;
/// Special id at the end of a player turn: the Hull's cracks count down.
pub const BALLAST_TICK: u8 = 0;
/// Special id at the end of the boss turn of a borrowed effect is this plus the phase.
pub const BALLAST_FIRE: u8 = 1;

/// The effect a boss turn borrows, with the pulse direction (the pulsar id, see `PULSAR_PUSH`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Borrowed {
    HullCrack,
    PulsarPulse(u8),
    MagnetizerPolarity,
    ChaplainConversion,
    SwarmWave,
}

/// The effect the hook seed `seed` picks (the PRNG of the fight seed and the ply).
pub fn borrowed(seed: u64) -> Borrowed {
    let state = mix(!seed);
    match state % 5 {
        0 => Borrowed::HullCrack,
        1 => Borrowed::PulsarPulse(((state / 5) % 6) as u8),
        2 => Borrowed::MagnetizerPolarity,
        3 => Borrowed::ChaplainConversion,
        _ => Borrowed::SwarmWave,
    }
}

/// The effect announced for the next boss turn that borrows one, when it is the turn after this
/// one: during the turn before it. `None` otherwise or when the game is over.
pub fn ballast_next(enc: &Encounter) -> Option<Borrowed> {
    let played = enc.game().history().len() as u32;
    let fire = (played / (2 * BALLAST_EVERY) + 1) * 2 * BALLAST_EVERY;
    (enc.game().outcome().is_none() && fire - played <= 2)
        .then(|| borrowed(ply_seed(enc.seed, u64::from(fire))))
}

/// The pulse announced for the next boss turn, `(pulsar, force)` with `None` for the infinite force:
/// `None` when the effect due next is not a pulse. The turn before it, the pulsar ripples.
pub fn ballast_pulse_tell(enc: &Encounter) -> Option<(u8, Option<u8>)> {
    match ballast_next(enc)? {
        Borrowed::PulsarPulse(dir) => Some((dir, PULSAR_FORCE[enc.phase()])),
        _ => None,
    }
}

/// The effect the last ply borrowed and the cells it touched (the marks it left and the cells
/// whose content changed): the player reads where it acted. `None` when the last ply borrowed
/// nothing.
pub fn ballast_fired(enc: &Encounter) -> Option<(Borrowed, Vec<P>)> {
    let (before, id) = enc.hooked()?;
    id.checked_sub(BALLAST_FIRE)?;
    Some((
        borrowed(enc.hook_seed()),
        touched(before, enc.game().board()),
    ))
}

/// The cells an effect touched going from `before` to `after`: those whose content changed and
/// the new cracks, polarities and converted marbles.
fn touched(before: &Board, after: &Board) -> Vec<P> {
    let marks = |board: &Board| -> Vec<P> {
        let cracks = board.cracks().iter().map(|c| c.0);
        let polarities = board.polarities().iter().map(|p| p.0);
        cracks
            .chain(polarities)
            .chain(board.converted().iter().copied())
            .collect()
    };
    let old = marks(before);
    let radius = after.radius();
    let mut cells: Vec<P> = (-radius..=radius)
        .flat_map(|q| (-radius..=radius).map(move |r| (q, r)))
        .filter(|&(q, r)| before.get(q, r) != after.get(q, r))
        .chain(marks(after).into_iter().filter(|c| !old.contains(c)))
        .collect();
    cells.sort_unstable();
    cells.dedup();
    cells
}

/// The pulse of the last ply: the pulsar id, the board just before it and the cells it moved,
/// from where they stood. `None` when the last ply borrowed no pulse.
pub fn ballast_last_pulse(enc: &Encounter) -> Option<(u8, Board, Vec<P>)> {
    let (before, id) = enc.hooked()?;
    let phase = usize::from(id.checked_sub(BALLAST_FIRE)?);
    match borrowed(enc.hook_seed()) {
        Borrowed::PulsarPulse(dir) => Some((
            dir,
            before.clone(),
            pulse(before, dir, PULSAR_FORCE[phase]).1,
        )),
        _ => None,
    }
}

/// The Hull tick at the end of a player turn, a borrowed effect at the end of every second boss
/// turn (the id carries the phase).
fn special(ply: u32, phase: usize) -> Option<u8> {
    if ply % 2 == 1 {
        Some(BALLAST_TICK)
    } else {
        (ply / 2)
            .is_multiple_of(BALLAST_EVERY)
            .then_some(BALLAST_FIRE + phase as u8)
    }
}

/// The phase at a ply of the tree: the root's phase or the one the player's ejections credited so
/// far reach, so a player move that ejects (P2 at 3, P3 at 5) strengthens the effect that answers
/// it (#1115). Ejections never go back, so it never falls below the root's.
fn tree_phase(root: usize, ejected: [u8; 2]) -> usize {
    let reached = BALLAST_PHASE_EJECTIONS
        .iter()
        .filter(|&&t| ejected[0] >= t)
        .count();
    reached.max(root)
}

/// The tick, or the effect the seed picks, each by the code of the boss it comes from.
fn hook(board: &Board, id: u8, seed: u64) -> Board {
    let run = |boss: BossDef, id: u8, board: &Board| (boss.hook)(board, id, seed);
    if id == BALLAST_TICK {
        return run(hull_boss(), HULL_PLAYER_END, board);
    }
    let phase = usize::from(id - BALLAST_FIRE);
    match borrowed(seed) {
        Borrowed::HullCrack => run(hull_boss(), HULL_CRACKS[phase], board),
        Borrowed::PulsarPulse(dir) => pulse(board, dir, PULSAR_FORCE[phase]).0,
        Borrowed::MagnetizerPolarity => {
            let announced = run(magnetizer_boss(), MAGNETIZER_ANNOUNCE, board);
            run(magnetizer_boss(), MAGNETIZER_TURN, &announced)
        }
        Borrowed::ChaplainConversion => run(chaplain_boss(), CHAPLAIN_BOSS_END, board),
        Borrowed::SwarmWave => wave(board, seed, phase),
    }
}

/// The boss reply: its node-limited search, where every player ply of the tree ends with the Hull
/// tick and the boss ply of the root turn with the effect due this turn, if there is one (the
/// effect of the seed of that ply, as `Encounter::play` fires it). The deeper boss plies of the
/// tree fire none: the tree does not know which turn they are. `None` on the player's turn or when
/// the game is over.
pub fn ballast_move(enc: &Encounter) -> Option<Move> {
    if enc.game().to_move() != Player::White {
        return None;
    }
    ballast_search(enc, enc.boss.node_budget, &|_| true)
}

/// The node-limited search of `enc` with the Ballast hooks of its tree, for the side to move: the
/// boss reply of [`ballast_move`], or the ladder player. Every Black ply ends with the Hull tick.
/// The boss ply that fires the effect due this turn is the root one on the boss's turn, and on the
/// player's turn the reply to the player's move (the player reads the effect one turn ahead).
pub(crate) fn ballast_search(
    enc: &Encounter,
    budget: u32,
    allow: &dyn Fn(&Move) -> bool,
) -> Option<Move> {
    let root = enc.game().board();
    let boss_turn = enc.game().to_move() == Player::White;
    let ply = enc.game().history().len() as u32 + if boss_turn { 1 } else { 2 };
    // Only a boss ply fires, so the id of the effect waits for the phase of the tree.
    let due = special(ply, 0).map(|_| ply_seed(enc.seed, u64::from(ply)));
    let tick = |before: &Board, mover: Player, mv: &Move, after: Board| {
        // The Hull's own tick, which does nothing without a crack: skip its board copy.
        if after.cracks().is_empty() {
            (after, [0, 0])
        } else {
            hull_step(before, mover, mv, after)
        }
    };
    // The positions the due effect fires from: the root, or each position after a player move.
    let fires: Vec<Board> = match due {
        None => Vec::new(),
        Some(_) if boss_turn => vec![root.clone()],
        Some(_) => legal_moves(root, Player::Black)
            .iter()
            .map(|mv| {
                tick(
                    root,
                    Player::Black,
                    mv,
                    apply(root, Player::Black, mv).unwrap().0,
                )
                .0
            })
            .collect(),
    };
    let root_phase = enc.phase();
    let step = |before: &Board, mover: Player, mv: &Move, after: Board, ejected: [u8; 2]| {
        if mover == Player::Black {
            return tick(before, mover, mv, after);
        }
        let Some(seed) = due.filter(|_| fires.contains(before)) else {
            return (after, [0, 0]);
        };
        let id = BALLAST_FIRE + tree_phase(root_phase, ejected) as u8;
        let out = hook(&after, id, seed);
        // A conversion moves marbles to the other side without ejecting any.
        let [lost_black, lost_white] = if no_gain(&after, &out) {
            losses(&after, &out)
        } else {
            [0, 0]
        };
        (out, [lost_white, lost_black])
    };
    search_phased(enc.game(), budget, DEFAULT_WEIGHTS, allow, &step, None).map(|r| r.mv)
}

/// The Ballast board with no marble: radius 5 with the six pillars void.
pub fn ballast_board() -> Board {
    let mut board = Board::with_radius(BALLAST_RADIUS);
    for (q, r) in BALLAST_PILLARS {
        board.void(q, r);
    }
    board
}

/// The Ballast Mind boss definition.
pub fn ballast_boss() -> BossDef {
    BossDef {
        name: "The Ballast Mind",
        phase_marbles: Vec::new(),
        phase_ejections: BALLAST_PHASE_EJECTIONS.to_vec(),
        special,
        hook,
        conversions: None,
        node_budget: BALLAST_NODE_BUDGET,
    }
}

/// A new encounter: the player is Black and moves first.
pub fn ballast_start(seed: u64) -> Encounter {
    let mut board = ballast_board();
    for (q, r) in BALLAST_PLAYER_START {
        board.set(q, r, Cell::Black);
    }
    for (q, r) in BALLAST_BOSS_START {
        board.set(q, r, Cell::White);
    }
    let game = Game::from_position(board, Player::Black, [0, 0])
        .with_win([BALLAST_WIN_EJECTIONS, BALLAST_LOSE_EJECTIONS]);
    Encounter::new(game, ballast_boss(), seed).counting_by_colour()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encounter::{losses, marbles};
    use crate::moves::Direction::{E, W};
    use crate::moves::{legal_moves, Direction, Move};

    fn cells() -> impl Iterator<Item = P> {
        (-MAX_RADIUS..=MAX_RADIUS).flat_map(|q| (-MAX_RADIUS..=MAX_RADIUS).map(move |r| (q, r)))
    }

    fn count(board: &Board, color: Cell) -> usize {
        cells()
            .filter(|&(q, r)| board.get(q, r) == Some(color))
            .count()
    }

    fn on_board(board: &Board) -> usize {
        cells().filter(|&(q, r)| board.get(q, r).is_some()).count()
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    /// The ply a borrowed effect fires on first: the end of the second boss turn since #1209.
    const FIRE: u64 = 2 * BALLAST_EVERY as u64;

    /// The first hook seed whose pick satisfies `want`.
    fn seed_of(want: impl Fn(Borrowed) -> bool) -> u64 {
        (0..).find(|&s| want(borrowed(s))).unwrap()
    }

    /// A fight seed whose pick at the end of the fire ply satisfies `want`.
    fn fight_seed(want: impl Fn(Borrowed) -> bool) -> u64 {
        (0..).find(|&s| want(borrowed(ply_seed(s, FIRE)))).unwrap()
    }

    /// The direction of the pulse the hook seed `seed` picks.
    fn pulse_dir(seed: u64) -> u8 {
        (0..6)
            .find(|&d| borrowed(seed) == Borrowed::PulsarPulse(d))
            .unwrap()
    }

    /// A hook seed that picks a pulse, and its direction.
    fn pulse_seed() -> (u64, u8) {
        let seed = seed_of(|b| matches!(b, Borrowed::PulsarPulse(_)));
        (seed, pulse_dir(seed))
    }

    /// A fight seed whose pick at the end of the fire ply is a pulse from the west (direction 0).
    fn fight_pulse_seed() -> (u64, u8) {
        let seed = fight_seed(|b| matches!(b, Borrowed::PulsarPulse(0)));
        (seed, 0)
    }

    fn is_rim(board: &Board, (q, r): P) -> bool {
        [(1, 0), (-1, 0), (1, -1), (-1, 1), (0, -1), (0, 1)]
            .iter()
            .any(|&(dq, dr)| board.get(q + dq, r + dr).is_none())
    }

    #[test]
    fn board_is_radius_5_minus_six_pillars() {
        let board = ballast_board();
        assert_eq!(on_board(&board), 91 - 6);
        assert_eq!(board.get(5, 0), Some(Cell::Empty));
        assert_eq!(board.get(-5, 5), Some(Cell::Empty));
        assert_eq!(board.get(6, 0), None);
        assert_eq!(board.get(0, 0), Some(Cell::Empty));
        for (q, r) in BALLAST_PILLARS {
            assert_eq!(board.get(q, r), None, "pillar ({q}, {r})");
        }
    }

    #[test]
    fn pillars_are_symmetric_and_distinct() {
        for (q, r) in BALLAST_PILLARS {
            assert!(BALLAST_PILLARS.contains(&(-q, -r)), "point reflection");
            assert!(BALLAST_PILLARS.contains(&(-r, q + r)), "60 degree rotation");
            assert_eq!(q.abs().max(r.abs()).max((q + r).abs()), 2);
        }
        let mut sorted = BALLAST_PILLARS;
        sorted.sort();
        assert!(sorted.windows(2).all(|w| w[0] != w[1]));
    }

    #[test]
    fn start_has_16_marbles_each_the_player_start_mirroring_the_boss_start() {
        let enc = ballast_start(0);
        let board = enc.game().board();
        assert_eq!(count(board, Cell::White), 16);
        assert_eq!(count(board, Cell::Black), 16);
        for (q, r) in BALLAST_BOSS_START {
            assert!(
                BALLAST_PLAYER_START.contains(&(-q, -r)),
                "({q}, {r}) mirrored"
            );
        }
        for (q, r) in BALLAST_PLAYER_START {
            assert_eq!(board.get(q, r), Some(Cell::Black));
        }
        for (q, r) in BALLAST_BOSS_START {
            assert_eq!(board.get(q, r), Some(Cell::White));
        }
        assert_eq!(enc.game().to_move(), Player::Black);
        assert_eq!(enc.phase(), 0);
    }

    #[test]
    fn the_ballast_mind_is_won_at_8_ejections_and_lost_at_12_1209() {
        assert_eq!(BALLAST_WIN_EJECTIONS, 8);
        assert_eq!(BALLAST_LOSE_EJECTIONS, 12);
        assert_eq!(BALLAST_EVERY, 2);
        let enc = ballast_start(0);
        assert_eq!(
            enc.game().win_ejections(Player::Black),
            BALLAST_WIN_EJECTIONS
        );
        assert_eq!(
            enc.game().win_ejections(Player::White),
            BALLAST_LOSE_EJECTIONS
        );
    }

    #[test]
    fn boss_def_names_the_constants() {
        let boss = ballast_boss();
        assert_eq!(boss.name, "The Ballast Mind");
        assert!(boss.phase_marbles.is_empty());
        assert_eq!(boss.phase_ejections, vec![3, 5]);
        assert_eq!(BALLAST_NODE_BUDGET, 100, "#833");
        assert_eq!(boss.node_budget, BALLAST_NODE_BUDGET);
    }

    fn with_ejections(ejected: u8) -> Encounter {
        let game = Game::from_position(ballast_board(), Player::Black, [ejected, 0]);
        Encounter::new(game, ballast_boss(), 0)
    }

    #[test]
    fn phases_switch_at_3_and_5_ejections() {
        let phases: Vec<usize> = [0, 2, 3, 4, 5, 9]
            .into_iter()
            .map(|n| with_ejections(n).phase())
            .collect();
        assert_eq!(phases, vec![0, 0, 1, 1, 2, 2]);
    }

    #[test]
    fn a_player_turn_ticks_and_every_second_boss_turn_borrows_in_every_phase() {
        let boss = ballast_boss();
        for phase in 0..3 {
            let ids: Vec<Option<u8>> = (1..=12).map(|ply| (boss.special)(ply, phase)).collect();
            let fire = Some(BALLAST_FIRE + phase as u8);
            let tick = Some(BALLAST_TICK);
            assert_eq!(
                ids,
                vec![tick, None, tick, fire, tick, None, tick, fire, tick, None, tick, fire],
                "phase {phase}"
            );
        }
    }

    #[test]
    fn the_pick_covers_the_five_effects_and_the_six_pulse_directions() {
        let picks: Vec<Borrowed> = (0..400).map(borrowed).collect();
        assert_eq!(picks, (0..400).map(borrowed).collect::<Vec<_>>());
        assert!(picks.contains(&Borrowed::HullCrack));
        assert!(picks.contains(&Borrowed::MagnetizerPolarity));
        assert!(picks.contains(&Borrowed::ChaplainConversion));
        assert!(picks.contains(&Borrowed::SwarmWave));
        for dir in 0..6 {
            assert!(
                picks.contains(&Borrowed::PulsarPulse(dir)),
                "direction {dir}"
            );
        }
    }

    /// One Black marble in the middle, three White marbles in the open.
    fn open_board() -> Board {
        let mut board = ballast_board();
        board.set(0, 0, Cell::Black);
        for (q, r) in [(-4, 0), (3, -3), (0, 4)] {
            board.set(q, r, Cell::White);
        }
        board
    }

    #[test]
    fn the_hull_crack_is_a_rim_cell_in_p1_an_inner_cell_in_p2_any_in_p3() {
        let seed = seed_of(|b| b == Borrowed::HullCrack);
        for (phase, rim) in [(0, Some(true)), (1, Some(false)), (2, None)] {
            let out = hook(&open_board(), BALLAST_FIRE + phase, seed);
            assert_eq!(out.cracks().len(), 1, "phase {phase}");
            if let Some(rim) = rim {
                assert_eq!(is_rim(&out, out.cracks()[0].0), rim, "phase {phase}");
            }
        }
    }

    #[test]
    fn the_swarm_wave_lands_the_phase_count_on_empty_rim_cells_away_from_the_player_side() {
        let seed = seed_of(|b| b == Borrowed::SwarmWave);
        for (phase, count) in [(0, 1), (1, 1), (2, 2)] {
            let out = hook(&open_board(), BALLAST_FIRE + phase, seed);
            let landed: Vec<P> = touched(&open_board(), &out);
            assert_eq!(landed.len(), count, "phase {phase}");
            for &(q, r) in &landed {
                assert_eq!(out.get(q, r), Some(Cell::White), "phase {phase}");
                assert!(r <= 0 && is_rim(&out, (q, r)), "{q}, {r}");
                assert_eq!(open_board().get(q, r), Some(Cell::Empty));
            }
        }
    }

    #[test]
    fn the_swarm_wave_of_a_full_allowed_rim_does_not_arrive() {
        let mut board = open_board();
        for (q, r) in crate::encounter::swarm::allowed_rim_of(BALLAST_RADIUS) {
            board.set(q, r, Cell::White);
        }
        let seed = seed_of(|b| b == Borrowed::SwarmWave);
        assert_eq!(hook(&board, BALLAST_FIRE + 2, seed), board);
    }

    #[test]
    fn the_tick_counts_the_hull_cracks_down_and_vanishes_the_cell_with_its_marble() {
        let mut board = open_board();
        board.set_cracks(vec![((-4, 0), 1), ((0, 0), 2)]);
        let out = hook(&board, BALLAST_TICK, 0);
        assert_eq!(out.get(-4, 0), None, "the cell vanished");
        assert_eq!(out.cracks(), &[((0, 0), 1)]);
    }

    #[test]
    fn the_pulsar_pulse_pushes_the_lines_at_the_force_of_the_phase() {
        let (seed, dir) = pulse_seed();
        for phase in 0..3 {
            let out = hook(&open_board(), BALLAST_FIRE + phase, seed);
            let expected = pulse(&open_board(), dir, PULSAR_FORCE[usize::from(phase)]).0;
            assert_eq!(out, expected, "phase {phase}");
            assert_ne!(out, open_board());
        }
    }

    #[test]
    fn the_magnetizer_polarity_polarizes_one_marble_and_keeps_no_announce() {
        let seed = seed_of(|b| b == Borrowed::MagnetizerPolarity);
        let out = hook(&open_board(), BALLAST_FIRE, seed);
        assert_eq!(out.polarities().len(), 1);
        assert_eq!(out.polarities()[0].1, 1, "+ first");
        assert_eq!(out.announce(), None);
        let cell = out.polarities()[0].0;
        assert_ne!(open_board().get(cell.0, cell.1), Some(Cell::Empty));
    }

    #[test]
    fn the_chaplain_check_flips_a_marble_beside_four_foes_and_nothing_else() {
        let seed = seed_of(|b| b == Borrowed::ChaplainConversion);
        let mut board = open_board();
        for (q, r) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            board.set(q, r, Cell::White);
        }
        let out = hook(&board, BALLAST_FIRE, seed);
        assert_eq!(out.get(0, 0), Some(Cell::White));
        assert_eq!(out.converted(), &[(0, 0)]);
        assert_eq!(out.martyr(), None, "no martyr: the check only");
        assert_eq!(hook(&open_board(), BALLAST_FIRE, seed), open_board());
    }

    #[test]
    fn the_effect_is_announced_during_the_turn_before_it() {
        let seed = 3;
        let mut enc = Encounter::new(
            Game::from_position(open_board(), Player::Black, [0, 0]),
            BossDef {
                node_budget: 200,
                ..ballast_boss()
            },
            seed,
        );
        let mut seen = Vec::new();
        for _ in 0..6 {
            seen.push(ballast_next(&enc));
            let m = legal_moves(enc.game().board(), enc.game().to_move())[0].clone();
            enc.play(&m).unwrap();
        }
        let first = Some(borrowed(ply_seed(seed, FIRE)));
        assert_eq!(seen[..2], [None; 2]);
        assert_eq!(seen[2..4], [first; 2], "plies 2 and 3 lead to ply 4");
        assert_eq!(seen[4..], [None; 2]);
    }

    #[test]
    fn nothing_is_announced_once_the_game_is_over() {
        let mut board = ballast_board();
        board.set(0, 0, Cell::Black);
        board.set(5, -5, Cell::White);
        let game = Game::from_position(board, Player::White, [0, 6]);
        let enc = Encounter::new(game, ballast_boss(), 0);
        assert!(enc.game().outcome().is_some());
        assert_eq!(ballast_next(&enc), None);
    }

    /// Two Black shufflers, White marbles on all six corners to lose to a pulse. The boss shuffles
    /// too, the corner marbles stay.
    fn corner_fight(seed: u64) -> Encounter {
        let mut board = ballast_board();
        board.set(0, 0, Cell::Black);
        board.set(0, 1, Cell::Black);
        board.set(-1, 0, Cell::White);
        for (q, r) in [(5, -5), (5, 0), (0, 5), (-5, 5), (-5, 0), (0, -5)] {
            board.set(q, r, Cell::White);
        }
        Encounter::new(
            Game::from_position(board, Player::Black, [0, 0]),
            ballast_boss(),
            seed,
        )
        .counting_by_colour()
    }

    /// Plays the plies up to the fire ply: Black and White shuffle a marble east and west.
    fn play_six(enc: &mut Encounter) {
        for ply in 0..FIRE {
            let m = match ply % 4 {
                0 => mv(&[(0, 0)], E),
                1 => mv(&[(-1, 0)], W),
                2 => mv(&[(1, 0)], W),
                _ => mv(&[(-2, 0)], E),
            };
            enc.play(&m).unwrap();
        }
    }

    #[test]
    fn a_pulse_credits_the_marbles_it_pushes_off_by_colour_and_shows_as_the_last_pulse() {
        let (seed, dir) = fight_pulse_seed();
        let mut enc = corner_fight(seed);
        play_six(&mut enc);
        let (before, id) = enc.hooked().unwrap();
        assert_eq!(*id, BALLAST_FIRE);
        let [lost_black, lost_white] = losses(before, enc.game().board());
        assert!(lost_white >= 2, "corner marbles fall");
        assert_eq!(enc.game().ejected(Player::Black), lost_white);
        assert_eq!(enc.game().ejected(Player::White), lost_black);
        let (pulsar, shown, moved) = ballast_last_pulse(&enc).unwrap();
        assert_eq!((pulsar, &shown), (dir, before));
        assert_eq!(moved, pulse(before, dir, Some(2)).1);
        assert_eq!(marbles(enc.game().board(), Cell::White), 7 - lost_white);
    }

    /// A Black shuffler on the bottom row, a White shuffler on the west rim and a lone White marble
    /// on the east rim, where a pulse from the west pushes it off.
    fn rim_fight(seed: u64) -> Encounter {
        let mut board = ballast_board();
        board.set(-4, 5, Cell::Black);
        board.set(-5, 0, Cell::White);
        board.set(5, 0, Cell::White);
        let game = Game::from_position(board, Player::Black, [0, 0]);
        let mut enc = Encounter::new(game, ballast_boss(), seed).counting_by_colour();
        enc.boss.node_budget = 300;
        enc
    }

    /// The plies of `rim_fight` before the fire ply: the boss is to play the ply that fires the effect.
    fn play_rim(enc: &mut Encounter) {
        for m in [mv(&[(-4, 5)], E), mv(&[(-5, 0)], E), mv(&[(-3, 5)], W)] {
            enc.play(&m).unwrap();
        }
    }

    #[test]
    fn the_search_sees_the_pulse_due_this_turn_and_the_plain_one_does_not() {
        let (seed, dir) = fight_pulse_seed();
        assert_eq!(dir, 0, "from the west: the east rim marble falls");
        let mut enc = rim_fight(seed);
        play_rim(&mut enc);
        let lost_by = |mv: &Move| {
            let mut after = enc.clone();
            after.play(mv).unwrap();
            after.game().ejected(Player::Black)
        };
        let plain = enc.boss_search().unwrap().mv;
        let hooked = ballast_move(&enc).unwrap();
        assert_eq!(lost_by(&hooked), 0, "{hooked:?} steps off the rim");
        assert_eq!(lost_by(&plain), 1, "{plain:?} stays under the pulse");
    }

    #[test]
    fn the_player_search_sees_the_pulse_due_on_the_boss_reply() {
        let (seed, _) = fight_pulse_seed();
        let mut board = ballast_board();
        board.set(-4, 5, Cell::Black);
        board.set(5, 0, Cell::Black);
        board.set(-5, 0, Cell::White);
        let game = Game::from_position(board, Player::Black, [0, 0]);
        let mut enc = Encounter::new(game, ballast_boss(), seed).counting_by_colour();
        enc.boss.node_budget = 300;
        for m in [mv(&[(-4, 5)], E), mv(&[(-5, 0)], E)] {
            enc.play(&m).unwrap();
        }
        let player = ballast_search(&enc, 300, &|_| true).unwrap();
        enc.play(&player).unwrap();
        enc.play(&ballast_move(&enc).unwrap()).unwrap();
        assert_eq!(
            enc.game().ejected(Player::White),
            0,
            "{player:?} steps off the rim"
        );
    }

    #[test]
    fn the_search_plays_the_conversion_check_due_this_turn() {
        let mut board = ballast_board();
        board.set(-4, 5, Cell::Black);
        board.set(0, 0, Cell::Black);
        for (q, r) in [(-5, 0), (1, 0), (-1, 0), (0, -1), (0, 2)] {
            board.set(q, r, Cell::White);
        }
        let game = Game::from_position(board, Player::Black, [0, 0]);
        let seed = fight_seed(|b| b == Borrowed::ChaplainConversion);
        let mut enc = Encounter::new(game, ballast_boss(), seed).counting_by_colour();
        enc.boss.node_budget = 300;
        play_rim(&mut enc);
        let hooked = ballast_move(&enc).unwrap();
        assert_eq!(hooked.cells, vec![(0, 2)], "the fourth foe closes the ring");
        enc.play(&hooked).unwrap();
        assert_eq!(enc.game().board().get(0, 0), Some(Cell::White));
    }

    #[test]
    fn the_search_sees_the_hull_tick_that_voids_a_cracked_cell_on_the_next_player_ply() {
        let mut board = ballast_board();
        board.set(-4, 5, Cell::Black);
        board.set(-5, 0, Cell::White);
        board.set(5, 0, Cell::White);
        board.set_cracks(vec![((5, 0), 3)]);
        let game = Game::from_position(board, Player::Black, [0, 0]);
        let mut enc = Encounter::new(game, ballast_boss(), 0).counting_by_colour();
        enc.boss.node_budget = 300;
        for m in [mv(&[(-4, 5)], E), mv(&[(-5, 0)], E), mv(&[(-3, 5)], W)] {
            enc.play(&m).unwrap();
        }
        assert_eq!(enc.game().board().cracks(), &[((5, 0), 1)]);
        let hooked = ballast_move(&enc).unwrap();
        assert_eq!(
            hooked.cells,
            vec![(5, 0)],
            "it leaves the cell about to vanish"
        );
    }

    #[test]
    fn the_search_plays_the_swarm_wave_due_this_turn() {
        let seed = fight_seed(|b| b == Borrowed::SwarmWave);
        let mut enc = Encounter::new(
            Game::from_position(open_board(), Player::Black, [0, 0]),
            ballast_boss(),
            seed,
        )
        .counting_by_colour();
        enc.boss.node_budget = 300;
        while enc.game().history().len() < FIRE as usize - 1 {
            let m = legal_moves(enc.game().board(), enc.game().to_move())[0].clone();
            enc.play(&m).unwrap();
        }
        let before = count(enc.game().board(), Cell::White);
        let hooked = ballast_move(&enc).unwrap();
        enc.play(&hooked).unwrap();
        assert_eq!(count(enc.game().board(), Cell::White), before + 1);
    }

    #[test]
    fn the_search_is_for_the_boss_turn_only() {
        assert_eq!(ballast_move(&ballast_start(0)), None);
    }

    #[test]
    fn the_last_pulse_is_none_for_another_effect_a_tick_or_no_hook() {
        assert_eq!(ballast_last_pulse(&corner_fight(0)), None, "no hook yet");
        let mut enc = corner_fight(fight_seed(|b| b == Borrowed::ChaplainConversion));
        enc.play(&mv(&[(0, 0)], E)).unwrap();
        assert_eq!(ballast_last_pulse(&enc), None, "a tick");
        play_rest(&mut enc);
        assert_eq!(ballast_last_pulse(&enc), None, "a conversion check");
    }

    #[test]
    fn the_fired_effect_touches_its_marks_and_the_cells_that_changed() {
        let crack = seed_of(|b| b == Borrowed::HullCrack);
        let cracked = hook(&open_board(), BALLAST_FIRE, crack);
        assert_eq!(
            touched(&open_board(), &cracked),
            vec![cracked.cracks()[0].0]
        );
        let polar = seed_of(|b| b == Borrowed::MagnetizerPolarity);
        let polarized = hook(&open_board(), BALLAST_FIRE, polar);
        assert!(touched(&open_board(), &polarized).contains(&polarized.polarities()[0].0));
        let (push, dir) = pulse_seed();
        let pushed = hook(&open_board(), BALLAST_FIRE, push);
        let moved = pulse(&open_board(), dir, PULSAR_FORCE[0]).1;
        let cells = touched(&open_board(), &pushed);
        assert!(!moved.is_empty() && moved.iter().all(|c| cells.contains(c)));
        let flip = seed_of(|b| b == Borrowed::ChaplainConversion);
        let mut board = open_board();
        for (q, r) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            board.set(q, r, Cell::White);
        }
        let flipped = hook(&board, BALLAST_FIRE, flip);
        assert_eq!(
            touched(&board, &flipped),
            vec![(0, 0)],
            "the flipped marble"
        );
        let wave = seed_of(|b| b == Borrowed::SwarmWave);
        let landed = hook(&open_board(), BALLAST_FIRE, wave);
        let cells = touched(&open_board(), &landed);
        assert_eq!(cells.len(), 1, "the cell the swarm marble landed on");
        assert_eq!(landed.get(cells[0].0, cells[0].1), Some(Cell::White));
        let idle = hook(&open_board(), BALLAST_FIRE, flip);
        assert_eq!(
            touched(&open_board(), &idle),
            Vec::<P>::new(),
            "a check that flips nothing"
        );
    }

    #[test]
    fn the_last_fired_effect_is_known_after_the_boss_turn_that_borrowed_it_only() {
        assert_eq!(ballast_fired(&corner_fight(0)), None, "no hook yet");
        let mut enc = corner_fight(fight_seed(|b| b == Borrowed::ChaplainConversion));
        enc.play(&mv(&[(0, 0)], E)).unwrap();
        assert_eq!(ballast_fired(&enc), None, "a tick");
        play_rest(&mut enc);
        assert_eq!(
            ballast_fired(&enc),
            Some((Borrowed::ChaplainConversion, Vec::new()))
        );
        let (seed, dir) = fight_pulse_seed();
        let mut enc = corner_fight(seed);
        play_six(&mut enc);
        let (effect, cells) = ballast_fired(&enc).unwrap();
        assert_eq!(effect, Borrowed::PulsarPulse(dir));
        assert!(cells.contains(&ballast_last_pulse(&enc).unwrap().2[0]));
    }

    #[test]
    fn the_pulse_is_announced_with_its_pulsar_and_force_the_turn_before_it_only() {
        let play_all = |seed: u64| {
            let mut enc = Encounter::new(
                Game::from_position(open_board(), Player::Black, [0, 0]),
                BossDef {
                    node_budget: 200,
                    ..ballast_boss()
                },
                seed,
            );
            (0..6)
                .map(|_| {
                    let tell = ballast_pulse_tell(&enc);
                    let m = legal_moves(enc.game().board(), enc.game().to_move())[0].clone();
                    enc.play(&m).unwrap();
                    tell
                })
                .collect::<Vec<_>>()
        };
        let (seed, dir) = fight_pulse_seed();
        let seen = play_all(seed);
        assert_eq!(seen[..2], [None; 2]);
        assert_eq!(
            seen[2..4],
            [Some((dir, PULSAR_FORCE[0])); 2],
            "plies 2 and 3 lead to ply 4"
        );
        assert_eq!(seen[4..], [None; 2]);
        let other = fight_seed(|b| b == Borrowed::HullCrack);
        assert_eq!(play_all(other), vec![None; 6], "another effect");
    }

    fn play_rest(enc: &mut Encounter) {
        while enc.game().history().len() < FIRE as usize {
            let m = legal_moves(enc.game().board(), enc.game().to_move())[0].clone();
            enc.play(&m).unwrap();
        }
    }

    #[test]
    fn a_conversion_check_credits_no_ejection() {
        let mut enc = corner_fight(fight_seed(|b| b == Borrowed::ChaplainConversion));
        play_rest(&mut enc);
        assert_eq!(enc.game().ejected(Player::Black), 0);
        assert_eq!(enc.game().ejected(Player::White), 0);
    }

    #[test]
    fn same_seed_gives_the_same_game_and_the_seed_changes_it() {
        let run = |seed| {
            let mut enc = corner_fight(seed);
            for _ in 0..8 {
                let m = legal_moves(enc.game().board(), enc.game().to_move())[0].clone();
                enc.play(&m).unwrap();
            }
            enc.game().board().clone()
        };
        assert_eq!(run(4), run(4));
        let boards: Vec<_> = (0..8).map(run).collect();
        assert!(boards.iter().any(|b| *b != boards[0]));
    }

    #[test]
    fn the_tree_phase_is_the_root_phase_or_the_one_the_credits_reach() {
        assert_eq!(tree_phase(0, [2, 0]), 0);
        assert_eq!(tree_phase(0, [3, 0]), 1, "P2 at 3");
        assert_eq!(tree_phase(0, [5, 0]), 2, "P3 at 5");
        assert_eq!(tree_phase(2, [0, 0]), 2, "the root phase holds");
        assert_eq!(tree_phase(0, [0, 9]), 0, "only the player's credit counts");
    }

    /// Black to move after four plies, 2 ejections credited to the player (P1): the due effect is a
    /// pulse. A player move that ejects a third marble reaches P2 before the boss reply, so the
    /// pulse that answers it is stronger (#1115).
    fn pulse_after_an_ejection() -> Encounter {
        let mut board = ballast_board();
        for (q, r) in [
            (-5, 1),
            (-2, 0),
            (-1, -2),
            (0, -4),
            (0, -3),
            (4, -4),
            (4, -3),
            (4, 1),
        ] {
            board.set(q, r, Cell::Black);
        }
        for (q, r) in [(-3, 2), (2, -5), (2, 3), (3, 2), (5, -1), (5, 0)] {
            board.set(q, r, Cell::White);
        }
        let game = Game::from_position(board, Player::Black, [2, 0]).with_win([12, 12]);
        let mut enc = Encounter::new(game, ballast_boss(), 5).counting_by_colour();
        for m in [
            mv(&[(-1, -2), (0, -3)], Direction::NE),
            mv(&[(2, 3)], Direction::NW),
            mv(&[(0, -4)], Direction::SW),
            mv(&[(-3, 2)], E),
        ] {
            enc.play(&m).unwrap();
        }
        assert_eq!(enc.phase(), 0, "P1 at the root");
        assert_eq!(
            std::mem::discriminant(&borrowed(ply_seed(enc.seed, 6))),
            std::mem::discriminant(&Borrowed::PulsarPulse(0)),
            "a pulse is due on the boss reply"
        );
        enc
    }

    #[test]
    fn the_phase_reached_in_the_tree_changes_the_best_move() {
        let enc = pulse_after_an_ejection();
        // The search that keeps the phase of its root, as before #1115, picked this move.
        let frozen = mv(&[(4, 1)], W);
        let new = ballast_search(&enc, 1000, &|_| true).unwrap();
        assert_eq!(new, mv(&[(0, -3), (1, -4)], Direction::NE));
        assert_ne!(new, frozen);
    }
}
