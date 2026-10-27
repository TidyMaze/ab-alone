//! The Ballast Mind (#47, docs/specs/game-design.md section 7.5): the final exam. A radius 5
//! board with six void pillars, 16 boss marbles against 14, and no rule code of its own. Every
//! [`BALLAST_EVERY`] turns it borrows one effect of another boss, picked by the engine PRNG among
//! four one-shot hooks that run that boss's own code:
//!
//! - the Hull's crack (P1 rim, P2 inner, P3 any cell), whose timer the Hull ticks on every
//!   player turn (special id [`BALLAST_TICK`]);
//! - the Pulsar's pulse from a random direction, at force 2, 3 and infinite;
//! - the Magnetizer's polarity: one marble polarized, then the settle;
//! - the Chaplain's conversion check, at threshold 4.
//!
//! The phases come from the ejections (P2 after 3, P3 after 5), as in the bosses it borrows from.
//! The effect fires at the end of a boss turn, so the player reads it one turn ahead in the HUD.

use crate::board::{Board, Cell, MAX_RADIUS};
use crate::encounter::chaplain::{chaplain_boss, CHAPLAIN_BOSS_END};
use crate::encounter::hull::{hull_boss, mix, HULL_CRACKS, HULL_PLAYER_END};
use crate::encounter::magnetizer::{magnetizer_boss, MAGNETIZER_ANNOUNCE, MAGNETIZER_TURN};
use crate::encounter::pulsar::{pulse, PULSAR_FORCE};
use crate::encounter::{ply_seed, BossDef, Encounter};
use crate::game::{Game, WIN_EJECTIONS};
use crate::moves::Player;

type P = (i32, i32);

/// Ejections the player needs to win against The Ballast Mind (Decision #482). The boss starts
/// with 16 marbles: win at 12 ejections (4 boss marbles left).
pub const BALLAST_WIN_EJECTIONS: u8 = 12;

/// Radius of the Ballast board: 91 cells before the pillars.
pub const BALLAST_RADIUS: i32 = 5;
const _: () = assert!(BALLAST_RADIUS <= MAX_RADIUS);
/// The six void pillars: one cell on each of the six sides of the centre ring (radius 2), the
/// orbit of `(1, 1)` under the 60 degree rotation `(q, r) -> (-r, q + r)`. Symmetric under the
/// point reflection of the Echo and the rotation.
pub const BALLAST_PILLARS: [P; 6] = [(1, 1), (-1, 2), (-2, 1), (-1, -1), (1, -2), (2, -1)];
/// Player start, Black at the bottom: four cells of row 5, seven of row 4, three of row 3.
pub const BALLAST_PLAYER_START: [P; 14] = [
    (-4, 5),
    (-3, 5),
    (-2, 5),
    (-1, 5),
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
/// Boss start, White at the top: the point reflection of the player start plus the reflections
/// of the two back-row corners the player does not have, `(-5, 5)` and `(0, 5)`: 16 marbles.
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
/// Positions the boss search may visit per move. Measured on the start position (release build):
/// 40 000 nodes finish depth 4, 150 000 finish depth 5 (2.4 s native), 800 000 finish depth 6. TUNE.
pub const BALLAST_NODE_BUDGET: u32 = 150_000;
/// Boss turns between two borrowed effects. TUNE.
pub const BALLAST_EVERY: u32 = 3;
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
}

/// The effect the hook seed `seed` picks (the PRNG of the fight seed and the ply).
pub fn borrowed(seed: u64) -> Borrowed {
    let state = mix(!seed);
    match state % 4 {
        0 => Borrowed::HullCrack,
        1 => Borrowed::PulsarPulse(((state / 4) % 6) as u8),
        2 => Borrowed::MagnetizerPolarity,
        _ => Borrowed::ChaplainConversion,
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

/// The Hull tick at the end of a player turn, a borrowed effect at the end of every third boss
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
    }
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
        .with_win([BALLAST_WIN_EJECTIONS, WIN_EJECTIONS]);
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

    /// The first hook seed whose pick satisfies `want`.
    fn seed_of(want: impl Fn(Borrowed) -> bool) -> u64 {
        (0..).find(|&s| want(borrowed(s))).unwrap()
    }

    /// A fight seed whose pick at the end of ply 6 satisfies `want`.
    fn fight_seed(want: impl Fn(Borrowed) -> bool) -> u64 {
        (0..).find(|&s| want(borrowed(ply_seed(s, 6)))).unwrap()
    }

    /// A hook seed that picks a pulse, and its direction.
    fn pulse_seed() -> (u64, u8) {
        (0..)
            .find_map(|s| match borrowed(s) {
                Borrowed::PulsarPulse(dir) => Some((s, dir)),
                _ => None,
            })
            .unwrap()
    }

    /// A fight seed whose pick at the end of ply 6 is a pulse, and its direction.
    fn fight_pulse_seed() -> (u64, u8) {
        (0..)
            .find_map(|s| match borrowed(ply_seed(s, 6)) {
                Borrowed::PulsarPulse(dir) => Some((s, dir)),
                _ => None,
            })
            .unwrap()
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
    fn start_has_16_boss_and_14_player_marbles() {
        let enc = ballast_start(0);
        let board = enc.game().board();
        assert_eq!(count(board, Cell::White), 16);
        assert_eq!(count(board, Cell::Black), 14);
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
    fn the_ballast_mind_is_won_at_12_ejections() {
        assert_eq!(BALLAST_WIN_EJECTIONS, 12);
        let enc = ballast_start(0);
        assert_eq!(
            enc.game().win_ejections(Player::Black),
            BALLAST_WIN_EJECTIONS
        );
        assert_eq!(enc.game().win_ejections(Player::White), WIN_EJECTIONS);
    }

    #[test]
    fn boss_def_names_the_constants() {
        let boss = ballast_boss();
        assert_eq!(boss.name, "The Ballast Mind");
        assert!(boss.phase_marbles.is_empty());
        assert_eq!(boss.phase_ejections, vec![3, 5]);
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
    fn a_player_turn_ticks_and_every_third_boss_turn_borrows_in_every_phase() {
        let boss = ballast_boss();
        for phase in 0..3 {
            let ids: Vec<Option<u8>> = (1..=12).map(|ply| (boss.special)(ply, phase)).collect();
            let fire = Some(BALLAST_FIRE + phase as u8);
            let tick = Some(BALLAST_TICK);
            assert_eq!(
                ids,
                vec![tick, None, tick, None, tick, fire, tick, None, tick, None, tick, fire],
                "phase {phase}"
            );
        }
    }

    #[test]
    fn the_pick_covers_the_four_effects_and_the_six_pulse_directions() {
        let picks: Vec<Borrowed> = (0..400).map(borrowed).collect();
        assert_eq!(picks, (0..400).map(borrowed).collect::<Vec<_>>());
        assert!(picks.contains(&Borrowed::HullCrack));
        assert!(picks.contains(&Borrowed::MagnetizerPolarity));
        assert!(picks.contains(&Borrowed::ChaplainConversion));
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
        for _ in 0..8 {
            seen.push(ballast_next(&enc));
            let m = legal_moves(enc.game().board(), enc.game().to_move())[0].clone();
            enc.play(&m).unwrap();
        }
        let first = Some(borrowed(ply_seed(seed, 6)));
        assert_eq!(seen[..4], [None; 4]);
        assert_eq!(seen[4..6], [first; 2], "plies 4 and 5 lead to ply 6");
        assert_eq!(seen[6..], [None; 2]);
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

    /// Plays 6 plies: Black and White shuffle a marble east and west.
    fn play_six(enc: &mut Encounter) {
        for ply in 0..6 {
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

    #[test]
    fn the_last_pulse_is_none_for_another_effect_a_tick_or_no_hook() {
        assert_eq!(ballast_last_pulse(&corner_fight(0)), None, "no hook yet");
        let mut enc = corner_fight(fight_seed(|b| b == Borrowed::ChaplainConversion));
        enc.play(&mv(&[(0, 0)], E)).unwrap();
        assert_eq!(ballast_last_pulse(&enc), None, "a tick");
        play_rest(&mut enc);
        assert_eq!(ballast_last_pulse(&enc), None, "a conversion check");
    }

    fn play_rest(enc: &mut Encounter) {
        while enc.game().history().len() < 6 {
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
            for _ in 0..12 {
                let m = legal_moves(enc.game().board(), enc.game().to_move())[0].clone();
                enc.play(&m).unwrap();
            }
            enc.game().board().clone()
        };
        assert_eq!(run(4), run(4));
        let boards: Vec<_> = (0..8).map(run).collect();
        assert!(boards.iter().any(|b| *b != boards[0]));
    }
}
