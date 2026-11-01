//! The Pulsar (#675, docs/specs/game-design.md section 7.10): six pulsars stand off the corners of
//! the board, and one at a time pushes every line like a sumito of force 2, 3 or infinite. The
//! active pulsar and its turn in the cycle are a mark on the board (`Board::pulsar`), never a
//! marble, so they change no move or push. The next pulsar is drawn by a seeded integer PRNG of
//! the fight seed and the ply, so every peer gets the same pulses.

use crate::board::{Board, Cell};
use crate::encounter::hull::mix;
use crate::encounter::{losses, BossDef, Encounter};
use crate::game::Game;
use crate::moves::{Move, Player};
use crate::search::{search_hooked, DEFAULT_WEIGHTS};

type P = (i32, i32);

/// The way each pulsar pushes, by its id: the move direction codes E, W, NE, SW, NW, SE. The
/// pulsar of push `d` stands off the corner in direction `-d`.
pub const PULSAR_PUSH: [P; 6] = [(1, 0), (-1, 0), (1, -1), (-1, 1), (0, -1), (0, 1)];
/// The force of a pulse per phase, `None` for infinite: a group this big or bigger resists. TUNE.
pub const PULSAR_FORCE: [Option<u8>; 3] = [Some(2), Some(3), None];
/// Player turns in the cycle of one pulsar: 3 pulses 2 turns apart, then 2 turns of rest.
pub const PULSAR_CYCLE: u8 = 8;
/// The turns of the cycle at whose end the pulsar fires, the start of the fight being turn 0. TUNE.
pub const PULSAR_FIRES: [u8; 3] = [3, 5, 7];
/// P2 and P3 start after this many ejections credited to the player. TUNE.
pub const PULSAR_PHASE_EJECTIONS: [u8; 2] = [3, 5];
/// Positions the boss search may visit per move (about depth 3, as the Hull). TUNE.
pub const PULSAR_NODE_BUDGET: u32 = 3000;

/// The board after a pulse of pulsar `pulsar` with `force` (`None` infinite), and the cells of the
/// marbles it moved, from where they stood. On each line, from the pulsar's end, the groups of
/// marbles of both colours smaller than the force move one cell; the first group as big as the
/// force resists and shields the rest of the line. A marble pushed past the rim is off the board.
pub fn pulse(board: &Board, pulsar: u8, force: Option<u8>) -> (Board, Vec<P>) {
    let (dq, dr) = PULSAR_PUSH[usize::from(pulsar)];
    let on = |(q, r): P| board.get(q, r).is_some();
    let radius = board.radius();
    let mut moved = Vec::new();
    for q in -radius..=radius {
        for r in -radius..=radius {
            if !on((q, r)) || on((q - dq, r - dr)) {
                continue;
            }
            let line: Vec<P> = (0..)
                .map(|k| (q + k * dq, r + k * dr))
                .take_while(|&c| on(c))
                .collect();
            let groups = line
                .split(|&(q, r)| board.get(q, r) == Some(Cell::Empty))
                .filter(|g| !g.is_empty());
            for group in groups {
                if force.is_some_and(|f| group.len() >= usize::from(f)) {
                    break;
                }
                moved.extend_from_slice(group);
            }
        }
    }
    let mut out = board.clone();
    for &(q, r) in &moved {
        out.set(q, r, Cell::Empty);
    }
    for &(q, r) in &moved {
        out.set(q + dq, r + dr, board.get(q, r).unwrap_or(Cell::Empty));
    }
    (out, moved)
}

/// Player turns left before the next pulse when `clock` turns of the cycle are played: from 1
/// (the pulse fires at the end of this turn) to 4 (the first turn of the rest).
pub fn turns_left(clock: u8) -> u8 {
    (1..=PULSAR_CYCLE)
        .find(|k| PULSAR_FIRES.contains(&((clock + k) % PULSAR_CYCLE)))
        .unwrap_or(PULSAR_CYCLE)
}

/// Special id of the ply that just ended: the phase at the end of each player turn (Black moves
/// first, so the player's plies are odd), none for a boss turn.
fn special(ply: u32, phase: usize) -> Option<u8> {
    (ply % 2 == 1).then_some(phase as u8)
}

/// The pulsar after `pulsar`, drawn by `seed` among the 5 others in id order.
fn next_pulsar(pulsar: u8, seed: u64) -> u8 {
    let others: Vec<u8> = (0..6).filter(|&p| p != pulsar).collect();
    others[(mix(seed) % 5) as usize]
}

/// End of a player turn in `phase`: the cycle moves on one turn, the pulsar fires when the turn
/// says so, and after its last pulse the next pulsar is drawn.
fn hook(board: &Board, phase: u8, seed: u64) -> Board {
    let Some((pulsar, clock)) = board.pulsar() else {
        return board.clone();
    };
    let clock = (clock + 1) % PULSAR_CYCLE;
    let mut out = if PULSAR_FIRES.contains(&clock) {
        pulse(board, pulsar, PULSAR_FORCE[usize::from(phase)]).0
    } else {
        board.clone()
    };
    let next = if clock == PULSAR_FIRES[2] {
        next_pulsar(pulsar, seed)
    } else {
        pulsar
    };
    out.set_pulsar(Some((next, clock)));
    out
}

/// The Pulsar boss definition.
pub fn pulsar_boss() -> BossDef {
    BossDef {
        name: "The Pulsar",
        phase_marbles: Vec::new(),
        phase_ejections: PULSAR_PHASE_EJECTIONS.to_vec(),
        special,
        hook,
        conversions: None,
        node_budget: PULSAR_NODE_BUDGET,
    }
}

/// A new encounter: the standard layout, the player is Black and moves first, and the first
/// pulsar is drawn (ply 0 of the seed) at turn 0 of its cycle.
pub fn pulsar_start(seed: u64) -> Encounter {
    let mut board = Board::standard();
    board.set_pulsar(Some(((mix(seed) % 6) as u8, 0)));
    Encounter::new(
        Game::from_position(board, Player::Black, [0, 0]),
        pulsar_boss(),
        seed,
    )
}

/// The next pulse: the pulsar, the player turns left before it fires and its force (`None`
/// infinite), with the phase now. `None` for the other bosses.
pub fn pulsar_tell(enc: &Encounter) -> Option<(u8, u8, Option<u8>)> {
    let (pulsar, clock) = enc.game().board().pulsar()?;
    Some((pulsar, turns_left(clock), PULSAR_FORCE[enc.phase()]))
}

/// The pulse of the last ply: the pulsar, the board just before it and the marbles it moved,
/// from where they stood. `None` when the last ply fired no pulse.
pub fn last_pulse(enc: &Encounter) -> Option<(u8, Board, Vec<P>)> {
    let (before, phase) = enc.hooked()?;
    let (pulsar, clock) = before.pulsar()?;
    let fired = PULSAR_FIRES.contains(&((clock + 1) % PULSAR_CYCLE));
    fired.then(|| {
        let force = PULSAR_FORCE[usize::from(*phase)];
        (pulsar, before.clone(), pulse(before, pulsar, force).1)
    })
}

/// The boss reply: its node-limited search, where every player ply of the tree goes through the
/// hook (seed 0 for the next pulsar), so it sees the pulses. `None` on the player's turn or when
/// the game is over.
pub fn pulsar_move(enc: &Encounter) -> Option<Move> {
    if enc.game().to_move() != Player::White {
        return None;
    }
    let phase = enc.phase() as u8;
    let step = |_: &Board, mover: Player, _: &Move, after: Board| {
        if mover == Player::White {
            return (after, [0, 0]);
        }
        let out = hook(&after, phase, 0);
        let [black, white] = losses(&after, &out);
        (out, [white, black])
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
    use crate::board::MAX_RADIUS;
    use crate::encounter::hull::HULL_NODE_BUDGET;
    use crate::encounter::{marbles, PveResult};
    use crate::moves::{legal_moves, Direction};

    /// Pulsar ids, the move direction codes.
    const E: u8 = 0;
    const NW: u8 = 4;
    const SE: u8 = 5;

    /// The fixture shared with the wasm bridge, the client harness and client/e2e/pulsar.spec.ts:
    /// fight seed 2, whose first pulsar pushes NW, then one-marble moves `(q, r, direction)`. The
    /// pulse after ply 5 throws the lone boss marble on (4, -4) off and leaves the pairs at the
    /// bottom left; the ones after plies 9 and 13 eject 2 more: P2.
    const FIXTURE_SEED: u64 = 2;
    const FIXTURE: [(i32, i32, Direction); 13] = [
        (-2, 2, Direction::NW),
        (4, -3, Direction::SW),
        (-1, 2, Direction::NW),
        (0, -2, Direction::SW),
        (0, 2, Direction::NW),
        (3, -3, Direction::E),
        (-2, 1, Direction::NW),
        (-1, -1, Direction::W),
        (-1, 1, Direction::NW),
        (-2, -1, Direction::W),
        (0, 1, Direction::NW),
        (-3, -1, Direction::SE),
        (-2, 0, Direction::NW),
    ];

    fn board(black: &[P], white: &[P], pulsar: Option<(u8, u8)>) -> Board {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        board.set_pulsar(pulsar);
        board
    }

    fn fight(board: Board, to_move: Player, ejected: [u8; 2]) -> Encounter {
        Encounter::new(
            Game::from_position(board, to_move, ejected),
            pulsar_boss(),
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

    /// The marbles of a pulse of `pulsar` with `force` on `black` and `white`: Black then White.
    fn pulsed(black: &[P], white: &[P], pulsar: u8, force: Option<u8>) -> (Vec<P>, Vec<P>) {
        let (out, _) = pulse(&board(black, white, None), pulsar, force);
        (cells_of(&out, Cell::Black), cells_of(&out, Cell::White))
    }

    fn play_fixture(plies: usize) -> Encounter {
        let mut enc = pulsar_start(FIXTURE_SEED);
        for &(q, r, dir) in &FIXTURE[..plies] {
            enc.play(&mv(&[(q, r)], dir)).unwrap();
        }
        enc
    }

    #[test]
    fn boss_definition_matches_the_spec() {
        let b = pulsar_boss();
        assert_eq!(b.name, "The Pulsar");
        assert!(b.phase_marbles.is_empty());
        assert_eq!(b.phase_ejections, vec![3, 5], "P2 after 3, P3 after 5");
        assert_eq!(b.node_budget, PULSAR_NODE_BUDGET);
        assert_eq!(PULSAR_NODE_BUDGET, HULL_NODE_BUDGET, "the Hull's budget");
        assert_eq!(PULSAR_FORCE, [Some(2), Some(3), None]);
    }

    #[test]
    fn the_fight_starts_on_the_standard_layout_with_a_pulsar_drawn() {
        let enc = pulsar_start(FIXTURE_SEED);
        let mut plain = enc.game().board().clone();
        assert_eq!(
            plain.pulsar(),
            Some((NW, 0)),
            "seed 2 draws the pulsar pushing NW"
        );
        plain.set_pulsar(None);
        assert_eq!(plain, Board::standard());
        assert_eq!(enc.game().to_move(), Player::Black);
        assert_eq!(enc.phase(), 0);
        assert_eq!(enc.game().win_ejections(Player::Black), 6);
        assert_eq!(enc.game().win_ejections(Player::White), 6);
        let mut drawn: Vec<u8> = (0..60)
            .map(|seed| pulsar_start(seed).game().board().pulsar().unwrap().0)
            .collect();
        drawn.sort_unstable();
        drawn.dedup();
        assert_eq!(
            drawn,
            vec![0, 1, 2, 3, 4, 5],
            "the seed draws any of the six"
        );
    }

    #[test]
    fn each_pulsar_pushes_its_way_on_its_9_lines() {
        // A lone marble at the centre goes one cell the pulsar's way, at any force.
        for (id, push) in PULSAR_PUSH.iter().enumerate() {
            let (out, moved) = pulse(&board(&[(0, 0)], &[], None), id as u8, Some(2));
            assert_eq!(moved, vec![(0, 0)]);
            assert_eq!(cells_of(&out, Cell::Black), vec![*push], "pulsar {id}");
        }
        // One lone marble at the pulsar's end of each line: all 9 move, the board's other lines
        // hold none.
        let starts: Vec<P> = (-4..=4).map(|r: i32| ((-4 - r).max(-4), r)).collect();
        let (_, moved) = pulse(&board(&starts, &[], None), E, Some(2));
        assert_eq!(moved.len(), 9);
        assert!(
            starts
                .iter()
                .all(|&(q, r)| Board::empty().get(q - 1, r).is_none()),
            "the W end of every row"
        );
    }

    #[test]
    fn at_force_2_a_lone_marble_is_pushed_and_a_pair_resists() {
        // Pulsar E: rows, walked from their W end.
        let (black, white) = pulsed(&[(-2, 0)], &[(-1, -1), (0, -1)], E, Some(2));
        assert_eq!(black, vec![(-1, 0)], "lone, pushed");
        assert_eq!(white, vec![(-1, -1), (0, -1)], "a pair resists");
    }

    #[test]
    fn at_force_3_a_pair_is_pushed_and_a_trio_resists() {
        let (black, white) = pulsed(
            &[(-2, 0), (-1, 0)],
            &[(-1, -1), (0, -1), (1, -1)],
            E,
            Some(3),
        );
        assert_eq!(black, vec![(-1, 0), (0, 0)], "a pair, pushed");
        assert_eq!(white, vec![(-1, -1), (0, -1), (1, -1)], "a trio resists");
    }

    #[test]
    fn a_group_that_resists_shields_every_group_behind_it() {
        // Row r = 0 from the W end: a lone marble, a pair, then a lone one and another pair.
        let (black, white) = pulsed(
            &[(-4, 0), (-2, 0), (-1, 0)],
            &[(1, 0), (3, 0), (4, 0)],
            E,
            Some(2),
        );
        assert_eq!(
            black,
            vec![(-3, 0), (-2, 0), (-1, 0)],
            "the lone one goes up to the pair"
        );
        assert_eq!(
            white,
            vec![(1, 0), (3, 0), (4, 0)],
            "shielded: all of the rest stays"
        );
    }

    #[test]
    fn a_group_mixes_both_colours() {
        // B and W side by side make one pair: it resists at force 2 and moves at force 3.
        let (black, white) = pulsed(&[(0, 0)], &[(1, 0)], E, Some(2));
        assert_eq!((black, white), (vec![(0, 0)], vec![(1, 0)]));
        let (black, white) = pulsed(&[(0, 0)], &[(1, 0)], E, Some(3));
        assert_eq!((black, white), (vec![(1, 0)], vec![(2, 0)]));
    }

    #[test]
    fn groups_move_at_once_and_keep_their_gaps() {
        // Two lone marbles one cell apart both move: they never collide.
        let (out, moved) = pulse(&board(&[(-2, 0)], &[(0, 0)], None), E, Some(2));
        assert_eq!(moved, vec![(-2, 0), (0, 0)]);
        assert_eq!(cells_of(&out, Cell::Black), vec![(-1, 0)]);
        assert_eq!(cells_of(&out, Cell::White), vec![(1, 0)]);
    }

    #[test]
    fn at_infinite_force_every_group_moves_and_the_head_on_the_rim_falls() {
        let black = [(-4, 0), (-3, 0), (-2, 0)];
        let white = [(1, 0), (2, 0), (3, 0), (4, 0)];
        let (out, moved) = pulse(&board(&black, &white, None), E, None);
        assert_eq!(moved.len(), 7);
        assert_eq!(cells_of(&out, Cell::Black), vec![(-3, 0), (-2, 0), (-1, 0)]);
        assert_eq!(
            cells_of(&out, Cell::White),
            vec![(2, 0), (3, 0), (4, 0)],
            "(4, 0) off"
        );
    }

    #[test]
    fn a_pulse_ejects_on_the_far_rim_and_credits_the_other_side() {
        // Pulsar SE, one turn before its first pulse: columns, walked from the top.
        let start = board(&[(0, 4), (2, -1)], &[(1, 3), (-2, -2)], Some((SE, 2)));
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(2, -1)], Direction::E)).unwrap();
        let b = enc.game().board();
        assert_eq!(
            cells_of(b, Cell::Black),
            vec![(3, 0)],
            "(0, 4) off, the lone (3, -1) pushed"
        );
        assert_eq!(cells_of(b, Cell::White), vec![(-2, -1)], "(1, 3) off");
        assert_eq!(
            enc.game().ejected(Player::Black),
            1,
            "the boss marble counts for you"
        );
        assert_eq!(enc.game().ejected(Player::White), 1, "yours for the boss");
        assert_eq!(b.pulsar(), Some((SE, 3)));
    }

    #[test]
    fn the_rhythm_is_3_pulses_2_turns_apart_then_2_turns_of_rest() {
        // A board with no marble: each player turn moves the cycle on; record the pulses and
        // the pulsar over 20 turns.
        let (mut b, mut fired, mut pulsars) =
            (board(&[], &[], Some((NW, 0))), Vec::new(), vec![NW]);
        let mut left = vec![turns_left(0)];
        for n in 1..=20u32 {
            let before = b.pulsar().unwrap();
            b = hook(&b, 0, u64::from(n));
            let (pulsar, clock) = b.pulsar().unwrap();
            if PULSAR_FIRES.contains(&clock) {
                fired.push(n);
            }
            if pulsar != before.0 {
                assert_eq!(
                    clock, PULSAR_FIRES[2],
                    "the next pulsar comes after the last pulse"
                );
                pulsars.push(pulsar);
            }
            left.push(turns_left(clock));
        }
        assert_eq!(fired, vec![3, 5, 7, 11, 13, 15, 19]);
        assert_eq!(pulsars.len(), 3, "the start one, then after turns 7 and 15");
        assert!(
            pulsars.windows(2).all(|w| w[0] != w[1]),
            "never the same twice in a row"
        );
        assert_eq!(
            left[..12],
            [3, 2, 1, 2, 1, 2, 1, 4, 3, 2, 1, 2],
            "charging (2, 1) through a run, 4 and 3 at rest"
        );
    }

    #[test]
    fn the_next_pulsar_is_drawn_among_the_5_others() {
        for pulsar in 0..6 {
            let mut drawn: Vec<u8> = (0..100).map(|seed| next_pulsar(pulsar, seed)).collect();
            drawn.sort_unstable();
            drawn.dedup();
            let others: Vec<u8> = (0..6).filter(|&p| p != pulsar).collect();
            assert_eq!(drawn, others, "pulsar {pulsar}");
        }
    }

    #[test]
    fn a_board_with_no_pulsar_is_left_as_it_is() {
        let plain = board(&[(0, 0)], &[], None);
        assert_eq!(hook(&plain, 0, 0), plain);
    }

    #[test]
    fn special_fires_after_each_player_turn_with_the_phase() {
        assert_eq!(special(1, 0), Some(0));
        assert_eq!(special(2, 0), None, "a boss turn");
        assert_eq!(special(7, 1), Some(1));
        assert_eq!(special(9, 2), Some(2));
    }

    #[test]
    fn the_fixture_pulses_throw_lone_boss_marbles_off_and_raise_the_force() {
        let enc = play_fixture(4);
        assert_eq!(pulsar_tell(&enc), Some((NW, 1, Some(2))), "charging, on 1");
        assert!(last_pulse(&enc).is_none(), "a boss ply");
        let enc = play_fixture(5);
        let b = enc.game().board();
        assert_eq!(
            b.get(4, -4),
            Some(Cell::Empty),
            "the lone boss marble is off"
        );
        assert_eq!(enc.game().ejected(Player::Black), 1);
        assert_eq!(b.get(-4, 4), Some(Cell::Black), "the pair stays");
        assert_eq!(b.get(-4, 3), Some(Cell::Black));
        assert_eq!(
            b.get(-2, 1),
            Some(Cell::Black),
            "shielded by the pair under it"
        );
        assert_eq!(b.get(1, 2), Some(Cell::Black), "the lone (1, 3) pushed");
        let (pulsar, before, moved) = last_pulse(&enc).unwrap();
        assert_eq!(pulsar, NW);
        assert_eq!(
            before.get(4, -4),
            Some(Cell::White),
            "the board just before it"
        );
        assert_eq!(moved, vec![(1, 3), (4, -4)]);
        assert_eq!(pulsar_tell(&enc), Some((NW, 2, Some(2))), "charging again");
        let enc = play_fixture(12);
        assert_eq!(enc.game().ejected(Player::Black), 2);
        assert!(last_pulse(&enc).is_none());
        let enc = play_fixture(13);
        assert_eq!(enc.game().ejected(Player::Black), 3);
        assert_eq!(enc.game().ejected(Player::White), 0);
        assert_eq!(enc.phase(), 1, "P2 after 3 ejections");
        let (pulsar, left, force) = pulsar_tell(&enc).unwrap();
        assert_ne!(pulsar, NW, "the next pulsar");
        assert_eq!((left, force), (4, Some(3)), "at rest, force 3");
        assert!(
            last_pulse(&play_fixture(11)).is_none(),
            "a player turn with no pulse"
        );
    }

    #[test]
    fn a_pulse_takes_the_force_of_the_phase_at_the_start_of_the_turn() {
        // P2 from 3 ejections: the pair on the rim is pushed and its head falls.
        let start = board(&[(0, 0)], &[(4, -2), (3, -2), (-3, 3)], Some((E, 2)));
        let mut enc = fight(start.clone(), Player::Black, [3, 0]);
        assert_eq!(pulsar_tell(&enc), Some((E, 1, Some(3))));
        enc.play(&mv(&[(0, 0)], Direction::NW)).unwrap();
        assert_eq!(enc.game().board().get(4, -2), Some(Cell::White));
        assert_eq!(enc.game().board().get(3, -2), Some(Cell::Empty));
        assert_eq!(enc.game().ejected(Player::Black), 4);
        let mut enc = fight(start.clone(), Player::Black, [1, 0]);
        enc.play(&mv(&[(0, 0)], Direction::NW)).unwrap();
        assert_eq!(enc.game().ejected(Player::Black), 1, "P1: the pair resists");
        let enc = fight(start, Player::Black, [5, 0]);
        assert_eq!(pulsar_tell(&enc), Some((E, 1, None)), "P3: infinite");
    }

    #[test]
    fn a_pulse_can_win_or_lose_the_fight() {
        let start = board(&[(0, 0)], &[(4, -1), (-3, 3)], Some((E, 2)));
        let mut enc = fight(start, Player::Black, [5, 0]);
        enc.play(&mv(&[(0, 0)], Direction::NW)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Won));
        let start = board(&[(0, 0), (4, 0)], &[(4, -1), (-3, 3)], Some((E, 2)));
        let mut enc = fight(start, Player::Black, [5, 5]);
        enc.play(&mv(&[(0, 0)], Direction::NW)).unwrap();
        assert_eq!(
            enc.result(),
            Some(PveResult::Lost),
            "both at 6: the boss first"
        );
    }

    #[test]
    fn a_move_that_ends_the_fight_fires_no_pulse() {
        let start = board(&[(2, 0), (3, 0)], &[(4, 0), (4, -1), (-3, 3)], Some((E, 2)));
        let mut enc = fight(start, Player::Black, [5, 0]);
        enc.play(&mv(&[(2, 0), (3, 0)], Direction::E)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Won));
        assert_eq!(enc.game().board().get(4, -1), Some(Cell::White), "no pulse");
        assert_eq!(enc.game().board().pulsar(), Some((E, 2)));
    }

    /// The pulsars and boards after each of 40 plies of first legal moves from `seed`.
    fn run(seed: u64) -> Vec<(Option<(u8, u8)>, Board)> {
        let mut enc = pulsar_start(seed);
        (0..40)
            .map(|_| {
                let game = enc.game();
                let m = legal_moves(game.board(), game.to_move()).swap_remove(0);
                enc.play(&m).unwrap();
                (enc.game().board().pulsar(), enc.game().board().clone())
            })
            .collect()
    }

    #[test]
    fn the_same_seed_and_moves_give_the_same_pulses_and_the_seed_matters() {
        assert_eq!(run(11), run(11));
        assert_ne!(
            run(11)[39].0.unwrap().0,
            run(11)[0].0.unwrap().0,
            "past the second pulsar"
        );
        let runs: Vec<_> = (0..8).map(run).collect();
        assert!(
            runs.iter().any(|r| *r != runs[0]),
            "the seed draws the pulsars"
        );
    }

    #[test]
    fn the_boss_sees_the_pulse_and_lets_it_eject_for_it() {
        // Pulsar E fires after the player's second move. A plain search ejects (4, -4) with its
        // pair, which leaves its head alone on the E rim of row r = -4, for the pulse to throw
        // off. The boss search sees the pulse: it keeps its pair, and the pulse ejects the lone
        // player marble on (4, -4) for it.
        let start = board(
            &[(4, -4), (-3, 3), (-4, 4)],
            &[(2, -2), (3, -3)],
            Some((E, 1)),
        );
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(-4, 4)], Direction::E)).unwrap();
        let sumito = mv(&[(2, -2), (3, -3)], Direction::NE);
        let plain = crate::search::search(enc.game(), PULSAR_NODE_BUDGET).unwrap();
        assert_eq!(plain.mv, sumito);
        let m = pulsar_move(&enc).unwrap();
        assert_ne!(m, sumito);
        enc.play(&m).unwrap();
        enc.play(&mv(&[(-3, 3)], Direction::NE)).unwrap();
        assert_eq!(enc.game().board().pulsar(), Some((E, 3)), "it fired");
        assert_eq!(marbles(enc.game().board(), Cell::White), 2, "{m:?}");
        assert_eq!(
            enc.game().ejected(Player::White),
            1,
            "the pulse ejected for the boss"
        );
    }

    #[test]
    fn the_tree_step_fires_the_p2_force_once_a_third_ejection_is_credited() {
        // The root: boss to move, 2 ejections for the player (P1), 4 boss marbles, pulsar E due
        // at the end of the next player turn. The pair on row r = -2 resists force 2, not force 3.
        let pair = [(3, -2), (4, -2)];
        let root = board(
            &[(0, 0)],
            &[pair[0], pair[1], (-3, 3), (0, -4)],
            Some((E, 2)),
        );
        let enc = fight(root.clone(), Player::White, [2, 0]);
        assert_eq!(enc.phase(), 0);
        // The ply that ejects the third marble still pulses at the phase of its start, P1.
        let mut third = root.clone();
        third.set(0, -4, Cell::Empty);
        let (out, credits) = pulsar_step(&enc, &root, Player::Black, third.clone());
        assert_eq!(out.get(3, -2), Some(Cell::White), "P1: the pair resists");
        assert_eq!(credits, [0, 0]);
        // A player ply that starts with the third marble gone pulses at P2: force 3.
        let (out, credits) = pulsar_step(&enc, &third, Player::Black, third.clone());
        assert_eq!(out.get(3, -2), Some(Cell::Empty), "P2: the pair is pushed");
        assert_eq!(out.get(4, -2), Some(Cell::White), "and its head is off");
        assert_eq!(credits, [1, 0], "an ejection for the player");
        // A boss ply runs no hook.
        let (out, credits) = pulsar_step(&enc, &third, Player::White, third.clone());
        assert_eq!((out, credits), (third, [0, 0]));
    }

    #[test]
    fn the_boss_replies_only_on_its_turn() {
        let mut enc = pulsar_start(0);
        assert_eq!(pulsar_move(&enc), None);
        let m = legal_moves(enc.game().board(), Player::Black).swap_remove(0);
        enc.play(&m).unwrap();
        let m = pulsar_move(&enc).unwrap();
        assert!(legal_moves(enc.game().board(), Player::White).contains(&m));
    }

    #[test]
    fn other_bosses_have_no_pulsar_and_no_pulse() {
        let mut enc = crate::encounter::railyard::railyard_start(0);
        assert_eq!(pulsar_tell(&enc), None);
        let m = legal_moves(enc.game().board(), Player::Black).swap_remove(0);
        enc.play(&m).unwrap();
        assert!(enc.hooked().is_some(), "the Rail Yard's hook ran");
        assert_eq!(last_pulse(&enc), None);
    }
}
