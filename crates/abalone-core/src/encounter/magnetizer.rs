//! The Magnetizer (#645, docs/specs/game-design.md section 7.9): the player's marbles get a + or −
//! polarity, and two adjacent marbles of opposite polarity repel one cell each, pushing every
//! marble in front of them on their line with no sumito limit, off the board at the rim. The
//! polarities live on the board (`Board::polarities`) and move with their marbles. Every random
//! pick is splitmix64 of the fight seed and the ply, so every peer gets the same fight.

use crate::board::{Board, Cell};
use crate::encounter::hull::mix;
use crate::encounter::{carried_marks, BossDef, Encounter};
use crate::moves::{Move, Player};
use crate::search::{search_hooked, DEFAULT_WEIGHTS};

type P = (i32, i32);

/// P2 and P3 start after this many ejections credited to the player. TUNE.
pub const MAGNETIZER_PHASE_EJECTIONS: [u8; 2] = [3, 5];
/// Player turns between two assignments, per phase. TUNE.
pub const MAGNETIZER_ASSIGN_EVERY: [u32; 3] = [2, 1, 1];
/// The phase (0 based) from which every assignment re-rolls all the player's marbles.
pub const MAGNETIZER_ALL_PHASE: usize = 2;
/// Repulsions per settle at most, a safety bound the fights never reach.
pub const MAGNETIZER_SETTLE_CAP: usize = 64;
/// Positions the boss search may visit per move (about depth 3, as the Hull). TUNE.
pub const MAGNETIZER_NODE_BUDGET: u32 = 3000;
/// Special id: one player marble gets a polarity.
pub const MAGNETIZER_ASSIGN_ONE: u8 = 0;
/// Special id: every player marble gets a new polarity, half + and half −.
pub const MAGNETIZER_ASSIGN_ALL: u8 = 1;

/// One repulsion of a settle, for the client's animation: the pair, in the order the engine
/// drew it, and the board just before it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Repulsion {
    pub pair: [P; 2],
    pub before: Board,
}

/// The assignment at the end of ply `ply`: after every `MAGNETIZER_ASSIGN_EVERY[phase]`th player
/// turn (odd plies, Black moves first), none after a boss ply.
fn special(ply: u32, phase: usize) -> Option<u8> {
    let assigns = ply % 2 == 1
        && ply
            .div_ceil(2)
            .is_multiple_of(MAGNETIZER_ASSIGN_EVERY[phase]);
    assigns.then_some(if phase >= MAGNETIZER_ALL_PHASE {
        MAGNETIZER_ASSIGN_ALL
    } else {
        MAGNETIZER_ASSIGN_ONE
    })
}

/// Black marbles of `board`, in `q` then `r` order.
fn player_marbles(board: &Board) -> Vec<P> {
    let radius = board.radius();
    (-radius..=radius)
        .flat_map(|q| (-radius..=radius).map(move |r| (q, r)))
        .filter(|&(q, r)| board.get(q, r) == Some(Cell::Black))
        .collect()
}

/// The assignment: one marble picked by `seed` takes the sign fewer of the player's other marbles
/// hold (a tie: the seed picks), or every marble gets a new sign, half and half, shuffled.
fn hook(board: &Board, id: u8, seed: u64) -> Board {
    let cells = player_marbles(board);
    let n = cells.len();
    let mut state = mix(seed);
    let mut out = board.clone();
    if id == MAGNETIZER_ASSIGN_ONE {
        let pick = cells[(state % n as u64) as usize];
        let mut poles: Vec<_> = board
            .polarities()
            .iter()
            .copied()
            .filter(|&(c, _)| c != pick)
            .collect();
        let lean: i32 = poles.iter().map(|&(_, s)| i32::from(s)).sum();
        let sign = match lean.signum() {
            0 => [1, -1][(mix(state) % 2) as usize],
            s => -s as i8,
        };
        poles.push((pick, sign));
        out.set_polarities(poles);
    } else {
        let mut signs = [vec![1; n / 2], vec![-1; n / 2]].concat();
        if n % 2 == 1 {
            signs.push([1, -1][(state % 2) as usize]);
        }
        for i in (1..n).rev() {
            state = mix(state);
            signs.swap(i, (state % (i as u64 + 1)) as usize);
        }
        out.set_polarities(cells.into_iter().zip(signs).collect());
    }
    out
}

/// The repelling pairs of `board`: adjacent polarized marbles of opposite signs, in `q` then `r`
/// order of the pair's first cell (the lower one).
fn pairs(board: &Board) -> Vec<[P; 2]> {
    let mut poles = board.polarities().to_vec();
    poles.sort();
    let mut out = Vec::new();
    for &(a, sign) in &poles {
        for (dq, dr) in [(1, 0), (1, -1), (0, 1)] {
            let b = (a.0 + dq, a.1 + dr);
            if poles.contains(&(b, -sign)) {
                out.push([a, b]);
            }
        }
    }
    out
}

/// `b` moves one cell away from `a`, `a` one cell away from `b`, each pushing every marble in
/// front of it on the line; the last one leaves the board at the rim. The ejections credited to
/// Black and to White.
fn repel(board: &Board, [a, b]: [P; 2]) -> (Board, [u8; 2]) {
    let d = (b.0 - a.0, b.1 - a.1);
    let mut out = board.clone();
    let mut credits = [0, 0];
    let mut moved: Vec<(P, P)> = Vec::new();
    for (start, (dq, dr)) in [(b, d), (a, (-d.0, -d.1))] {
        let mut run = vec![start];
        loop {
            let (q, r) = run[run.len() - 1];
            match board.get(q + dq, r + dr) {
                Some(Cell::Empty) => break,
                None => {
                    let lost = board.get(q, r) == Some(Cell::White);
                    credits[usize::from(!lost)] += 1;
                    break;
                }
                Some(_) => run.push((q + dq, r + dr)),
            }
        }
        for &(q, r) in run.iter().rev() {
            out.set(q + dq, r + dr, board.get(q, r).expect("a marble"));
            out.set(q, r, Cell::Empty);
        }
        moved.extend(run.into_iter().map(|c| (c, (dq, dr))));
    }
    let poles = board
        .polarities()
        .iter()
        .map(|&(c, s)| match moved.iter().find(|m| m.0 == c) {
            Some(&(_, (dq, dr))) => ((c.0 + dq, c.1 + dr), s),
            None => (c, s),
        })
        .filter(|&((q, r), _)| board.get(q, r).is_some())
        .collect();
    out.set_polarities(poles);
    (out, credits)
}

/// Repels pairs until none is left (at most `MAGNETIZER_SETTLE_CAP`): `seed` draws each pair among
/// the pairs of the board at that point. `seen` gets the board before each repulsion and its pair.
/// The board after, and the ejections credited to Black and to White.
pub(crate) fn settle(
    board: &Board,
    seed: u64,
    seen: &mut dyn FnMut(&Board, [P; 2]),
) -> (Board, [u8; 2]) {
    let (mut out, mut credits, mut state) = (board.clone(), [0, 0], seed);
    for _ in 0..MAGNETIZER_SETTLE_CAP {
        let pairs = pairs(&out);
        if pairs.is_empty() {
            break;
        }
        state = mix(state);
        let pair = pairs[(state % pairs.len() as u64) as usize];
        seen(&out, pair);
        let (next, gained) = repel(&out, pair);
        out = next;
        credits = [credits[0] + gained[0], credits[1] + gained[1]];
    }
    (out, credits)
}

/// The polarities of `before` carried by `mv`, kept on the Black marbles of `after`.
pub(crate) fn carried_poles(before: &Board, mv: &Move, after: &Board) -> Vec<(P, i8)> {
    let cells: Vec<P> = before.polarities().iter().map(|&(c, _)| c).collect();
    carried_marks(before, mv, &cells)
        .into_iter()
        .zip(before.polarities().iter().map(|&(_, s)| s))
        .filter(|&((q, r), _)| after.get(q, r) == Some(Cell::Black))
        .collect()
}

/// What a ply does in the boss search: the polarities follow the move, then the board settles.
/// The search draws the pairs with the seed 0: it cannot know the ply's seed deeper in the tree.
fn search_step(before: &Board, mv: &Move, mut after: Board) -> (Board, [u8; 2]) {
    after.set_polarities(carried_poles(before, mv, &after));
    settle(&after, 0, &mut |_, _| {})
}

/// The Magnetizer boss definition.
pub fn magnetizer_boss() -> BossDef {
    BossDef {
        name: "The Magnetizer",
        phase_marbles: Vec::new(),
        phase_ejections: MAGNETIZER_PHASE_EJECTIONS.to_vec(),
        special,
        hook,
        node_budget: MAGNETIZER_NODE_BUDGET,
    }
}

/// The boss reply: its node-limited search, where every ply of the tree settles, so it sees the
/// repulsions. `None` on the player's turn or when the game is over.
pub fn magnetizer_move(enc: &Encounter) -> Option<Move> {
    if enc.game().to_move() != Player::White {
        return None;
    }
    let step = |before: &Board, _: Player, mv: &Move, after: Board| search_step(before, mv, after);
    search_hooked(
        enc.game(),
        MAGNETIZER_NODE_BUDGET,
        DEFAULT_WEIGHTS,
        &|_| true,
        &step,
    )
    .map(|r| r.mv)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encounter::marbles;
    use crate::game::Game;
    use crate::moves::Direction::{E, NW, SE};
    use crate::moves::{legal_moves, Direction};

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    fn board(black: &[P], white: &[P], poles: &[(P, i8)]) -> Board {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        board.set_polarities(poles.to_vec());
        board
    }

    fn fight(b: Board, to_move: Player, ejected: [u8; 2], seed: u64) -> Encounter {
        Encounter::new(
            Game::from_position(b, to_move, ejected),
            magnetizer_boss(),
            seed,
        )
    }

    fn settled(b: &Board, seed: u64) -> (Board, [u8; 2], Vec<[P; 2]>) {
        let mut log = Vec::new();
        let (out, credits) = settle(b, seed, &mut |_, pair| log.push(pair));
        (out, credits, log)
    }

    fn sorted(b: &Board) -> Vec<(P, i8)> {
        let mut poles = b.polarities().to_vec();
        poles.sort();
        poles
    }

    fn signs(b: &Board) -> (usize, usize) {
        let plus = b.polarities().iter().filter(|p| p.1 == 1).count();
        (plus, b.polarities().len() - plus)
    }

    #[test]
    fn boss_definition_matches_the_spec() {
        let b = magnetizer_boss();
        assert_eq!(b.name, "The Magnetizer");
        assert!(b.phase_marbles.is_empty());
        assert_eq!(b.phase_ejections, vec![3, 5]);
        assert_eq!(b.node_budget, MAGNETIZER_NODE_BUDGET);
    }

    #[test]
    fn the_phase_follows_the_ejections_credited_to_the_player() {
        let phases: Vec<usize> = (0..=5)
            .map(|n| fight(Board::standard(), Player::Black, [n, 0], 0).phase())
            .collect();
        assert_eq!(phases, vec![0, 0, 0, 1, 1, 2], "P2 after 3, P3 after 5");
    }

    #[test]
    fn the_rhythm_follows_the_player_turns_and_the_phase() {
        let table = [
            ((1, 0), None),
            ((2, 0), None),
            ((3, 0), Some(MAGNETIZER_ASSIGN_ONE)),
            ((4, 0), None),
            ((5, 0), None),
            ((7, 0), Some(MAGNETIZER_ASSIGN_ONE)),
            ((1, 1), Some(MAGNETIZER_ASSIGN_ONE)),
            ((2, 1), None),
            ((5, 1), Some(MAGNETIZER_ASSIGN_ONE)),
            ((1, 2), Some(MAGNETIZER_ASSIGN_ALL)),
            ((6, 2), None),
        ];
        for ((ply, phase), id) in table {
            assert_eq!(special(ply, phase), id, "ply {ply}, phase {phase}");
        }
    }

    #[test]
    fn an_assignment_gives_the_minority_sign_of_the_other_marbles() {
        let cells = [(-2, 2), (-1, 2), (0, 2), (1, 2), (2, 2)];
        let leaning = board(&cells, &[], &[((-2, 2), 1), ((-1, 2), 1), ((0, 2), -1)]);
        let mut picked = Vec::new();
        for seed in 0..64 {
            let out = hook(&leaning, MAGNETIZER_ASSIGN_ONE, seed);
            let new: Vec<_> = sorted(&out)
                .into_iter()
                .filter(|p| !leaning.polarities().contains(p))
                .collect();
            let changed = out.polarities().len() - leaning.polarities().len();
            assert!(
                changed <= 1 && new.len() <= 1,
                "seed {seed}: one marble at most"
            );
            if let [(cell, sign)] = new[..] {
                let lean: i8 = leaning
                    .polarities()
                    .iter()
                    .filter(|p| p.0 != cell)
                    .map(|p| p.1)
                    .sum();
                assert!(lean == 0 || sign == -lean.signum(), "seed {seed}");
                picked.push(cell);
            }
        }
        picked.sort();
        picked.dedup();
        assert!(picked.len() >= 4, "the seed spreads the picks: {picked:?}");
        let unpolarized = board(&[(0, 0)], &[], &[]);
        let ties: Vec<i8> = (0..32)
            .map(|seed| hook(&unpolarized, MAGNETIZER_ASSIGN_ONE, seed).polarities()[0].1)
            .collect();
        assert!(
            ties.contains(&1) && ties.contains(&-1),
            "a tie: the seed picks"
        );
    }

    #[test]
    fn assignments_keep_the_signs_balanced() {
        let mut b = Board::standard();
        for seed in 0..40 {
            b = hook(&b, MAGNETIZER_ASSIGN_ONE, seed);
            let (plus, minus) = signs(&b);
            assert!(
                plus.abs_diff(minus) <= 1,
                "after {seed}: {plus} + and {minus} -"
            );
        }
        assert!(b.polarities().len() > 10, "most marbles got one");
    }

    #[test]
    fn a_p3_roll_gives_every_marble_a_sign_half_and_half() {
        let even = Board::standard();
        let mut layouts = Vec::new();
        for seed in 0..16 {
            let out = hook(&even, MAGNETIZER_ASSIGN_ALL, seed);
            assert_eq!(signs(&out), (7, 7));
            layouts.push(sorted(&out));
        }
        layouts.dedup();
        assert!(layouts.len() > 1, "the seed shuffles the signs");
        let mut odd = Board::standard();
        odd.set(0, 2, Cell::Empty);
        let extras: Vec<_> = (0..32)
            .map(|seed| signs(&hook(&odd, MAGNETIZER_ASSIGN_ALL, seed)))
            .collect();
        assert!(extras.iter().all(|&s| s == (7, 6) || s == (6, 7)));
        assert!(
            extras.contains(&(7, 6)) && extras.contains(&(6, 7)),
            "the seed picks the extra"
        );
    }

    #[test]
    fn a_minus_next_to_a_plus_pushes_a_boss_line_of_3_and_ejects_the_last() {
        let b = board(
            &[(0, -1), (0, 0)],
            &[(0, -2), (0, -3), (0, -4)],
            &[((0, -1), -1), ((0, 0), 1)],
        );
        let (out, credits, log) = settled(&b, 9);
        assert_eq!(log, vec![[(0, -1), (0, 0)]]);
        assert_eq!(credits, [1, 0], "the boss marble counts for the player");
        assert_eq!(out.get(0, -2), Some(Cell::Black));
        assert_eq!(out.get(0, -1), Some(Cell::Empty));
        assert_eq!(out.get(0, 0), Some(Cell::Empty));
        assert_eq!(out.get(0, 1), Some(Cell::Black));
        assert_eq!(marbles(&out, Cell::White), 2);
        assert_eq!(
            sorted(&out),
            vec![((0, -2), -1), ((0, 1), 1)],
            "the poles move along"
        );
    }

    #[test]
    fn a_repulsion_pushes_a_boss_line_of_5_and_its_own_side_ignoring_sumito() {
        let b = board(
            &[(-3, 0), (-2, 0), (-1, 0)],
            &[(0, 0), (1, 0), (2, 0), (3, 0), (4, 0)],
            &[((-2, 0), 1), ((-1, 0), -1)],
        );
        let (out, credits, log) = settled(&b, 1);
        assert_eq!(log, vec![[(-2, 0), (-1, 0)]]);
        assert_eq!(credits, [1, 0], "(4, 0) went off the board");
        use Cell::{Black as B, Empty as O, White as W};
        let row: Vec<_> = (-4..=4).map(|q| out.get(q, 0).unwrap()).collect();
        assert_eq!(row, vec![B, B, O, O, B, W, W, W, W], "(-3, 0) pushed along");
        assert_eq!(sorted(&out), vec![((-3, 0), 1), ((0, 0), -1)]);
    }

    #[test]
    fn a_player_marble_pushed_off_counts_for_the_boss_and_loses_its_polarity() {
        let b = board(&[(3, 0), (4, 0), (2, 0)], &[], &[((3, 0), -1), ((2, 0), 1)]);
        let (out, credits, _) = settled(&b, 0);
        assert_eq!(credits, [0, 1]);
        assert_eq!(out.get(4, 0), Some(Cell::Black));
        assert_eq!(sorted(&out), vec![((1, 0), 1), ((4, 0), -1)]);
    }

    #[test]
    fn same_signs_or_apart_do_nothing() {
        let same = board(&[(0, 0), (1, 0)], &[], &[((0, 0), 1), ((1, 0), 1)]);
        let apart = board(&[(0, 0), (2, 0)], &[], &[((0, 0), 1), ((2, 0), -1)]);
        for b in [same, apart] {
            assert_eq!(settled(&b, 3), (b, [0, 0], vec![]));
        }
    }

    #[test]
    fn a_repulsion_can_start_a_chain() {
        let b = board(
            &[(0, 0), (1, 0), (3, 0)],
            &[],
            &[((0, 0), 1), ((1, 0), -1), ((3, 0), 1)],
        );
        let (out, _, log) = settled(&b, 5);
        assert_eq!(log, vec![[(0, 0), (1, 0)], [(2, 0), (3, 0)]]);
        assert_eq!(sorted(&out), vec![((-1, 0), 1), ((1, 0), -1), ((4, 0), 1)]);
    }

    #[test]
    fn the_seed_draws_the_pair_order() {
        let b = board(
            &[(-3, 0), (-2, 0), (2, 0), (3, 0)],
            &[],
            &[((-3, 0), 1), ((-2, 0), -1), ((2, 0), 1), ((3, 0), -1)],
        );
        let firsts: Vec<_> = (0..16).map(|seed| settled(&b, seed).2[0]).collect();
        assert!(firsts.contains(&[(-3, 0), (-2, 0)]) && firsts.contains(&[(2, 0), (3, 0)]));
        assert_eq!(settled(&b, 4), settled(&b, 4));
    }

    #[test]
    fn polarities_follow_moves_and_pushes_and_leave_with_an_ejected_marble() {
        let b = board(
            &[(0, 0), (2, 0), (3, 0)],
            &[(4, 0), (-1, 0), (-2, 0), (-3, 0)],
            &[((0, 0), 1), ((3, 0), 1)],
        );
        let mut enc = fight(b, Player::Black, [0, 0], 0);
        enc.play(&mv(&[(2, 0), (3, 0)], E)).unwrap();
        assert_eq!(enc.game().ejected(Player::Black), 1);
        assert_eq!(sorted(enc.game().board()), vec![((0, 0), 1), ((4, 0), 1)]);
        enc.play(&mv(&[(-3, 0), (-2, 0), (-1, 0)], E)).unwrap();
        assert_eq!(sorted(enc.game().board()), vec![((1, 0), 1), ((4, 0), 1)]);
        let mut enc = fight(
            board(
                &[(3, 0), (4, 0)],
                &[(0, 0), (1, 0), (2, 0)],
                &[((4, 0), -1)],
            ),
            Player::White,
            [0, 0],
            0,
        );
        enc.play(&mv(&[(0, 0), (1, 0), (2, 0)], E)).unwrap();
        assert!(enc.game().board().polarities().is_empty(), "ejected");
    }

    #[test]
    fn a_ply_settles_and_credits_the_repulsions_in_order() {
        let b = board(
            &[(0, 1), (0, 0), (-3, 4)],
            &[(0, -2), (0, -3), (0, -4), (4, -4)],
            &[((0, 1), -1), ((0, 0), 1)],
        );
        let mut enc = fight(b.clone(), Player::Black, [0, 0], 0);
        enc.play(&mv(&[(0, 1), (0, 0)], NW)).unwrap();
        assert_eq!(enc.game().ejected(Player::Black), 1);
        let reps = enc.repulsions();
        assert_eq!(reps.len(), 1);
        assert_eq!(reps[0].pair, [(0, -1), (0, 0)]);
        assert_eq!(
            reps[0].before.get(0, -1),
            Some(Cell::Black),
            "after the move"
        );
        assert_eq!(reps[0].before.get(0, -4), Some(Cell::White));
        enc.play(&mv(&[(4, -4)], SE)).unwrap();
        assert!(enc.repulsions().is_empty(), "a quiet ply clears the log");
        let mut won = fight(b, Player::Black, [5, 0], 0);
        won.play(&mv(&[(0, 1), (0, 0)], NW)).unwrap();
        assert_eq!(won.result(), Some(crate::encounter::PveResult::Won));
    }

    /// The e2e fixture (client/e2e/magnetizer.spec.ts): fight seed 153, quiet boss moves on the
    /// right, the player walks the centre column up. The 2nd and 4th turns polarize the two
    /// marbles of the column, − and +; the 6th moves the + next to the −, which shoves the boss
    /// column of 3 off at (0, -4). The + then walks up twice more for the 2nd and 3rd ejection.
    pub(crate) fn fixture() -> Vec<Move> {
        [
            ((0, 2), NW),
            ((4, -3), SE),
            ((0, 1), NW),
            ((4, -2), SE),
            ((0, 0), NW),
            ((4, -1), SE),
            ((0, 3), NW),
            ((3, -3), SE),
            ((0, 2), NW),
            ((3, -2), SE),
            ((0, 1), NW),
            ((4, -4), SE),
            ((0, 1), NW),
            ((4, -3), SE),
            ((0, 0), NW),
            ((3, -4), SE),
            ((0, 0), NW),
            ((3, -3), SE),
            ((0, -1), NW),
        ]
        .into_iter()
        .map(|(c, dir)| mv(&[c], dir))
        .collect()
    }

    #[test]
    fn the_fixture_shoves_a_boss_line_of_3_off_then_reaches_p2() {
        let mut enc = Encounter::new(Game::new(), magnetizer_boss(), 153);
        let moves = fixture();
        let mut ejected = Vec::new();
        for (i, m) in moves.iter().enumerate() {
            enc.play(m).unwrap();
            ejected.push(enc.game().ejected(Player::Black));
            if i == 2 {
                assert_eq!(enc.game().board().polarities().len(), 1, "after turn 2");
            }
            if i == 10 {
                assert_eq!(enc.repulsions().len(), 1);
                assert_eq!(enc.repulsions()[0].pair, [(0, -1), (0, 0)]);
                let before = &enc.repulsions()[0].before;
                let poles = before.polarities();
                assert!(poles.contains(&((0, -1), -1)) && poles.contains(&((0, 0), 1)));
                assert!(
                    enc.assigned()
                        .iter()
                        .all(|c| ![(0, -1), (0, 0)].contains(c)),
                    "moved, not assigned"
                );
                assert!([(0, -2), (0, -3), (0, -4)]
                    .iter()
                    .all(|&(q, r)| before.get(q, r) == Some(Cell::White)));
            }
        }
        assert_eq!(
            ejected,
            [vec![0; 10], vec![1; 4], vec![2; 4], vec![3]].concat(),
            "each ejection by a repulsion"
        );
        assert_eq!(enc.phase(), 1, "P2 after 3 ejections");
        assert_eq!(enc.game().ejected(Player::White), 0);
    }

    /// The most repulsions in one ply over `plies` random plies of a P3 fight from `seed`.
    fn longest_settle(seed: u64, plies: usize) -> usize {
        let mut enc = fight(Board::standard(), Player::Black, [5, 0], seed);
        let mut state = seed;
        let mut longest = 0;
        for _ in 0..plies {
            if enc.game().outcome().is_some() {
                break;
            }
            let moves = legal_moves(enc.game().board(), enc.game().to_move());
            state = mix(state);
            enc.play(&moves[(state % moves.len() as u64) as usize])
                .unwrap();
            longest = longest.max(enc.repulsions().len());
        }
        longest
    }

    #[test]
    fn random_p3_fights_never_reach_the_settle_cap() {
        let longest = (0..40).map(|seed| longest_settle(seed, 120)).max().unwrap();
        assert!(longest > 1, "chains happen: {longest}");
        assert!(
            longest < MAGNETIZER_SETTLE_CAP / 2,
            "far from the cap: {longest}"
        );
    }

    /// The board, the polarities and the counts after each ply of the fixture, while it is legal.
    fn run(seed: u64) -> Vec<(Board, [u8; 2])> {
        let mut enc = Encounter::new(Game::new(), magnetizer_boss(), seed);
        fixture()
            .iter()
            .map_while(|m| {
                enc.play(m).ok()?;
                let g = enc.game();
                Some((
                    g.board().clone(),
                    [g.ejected(Player::Black), g.ejected(Player::White)],
                ))
            })
            .collect()
    }

    #[test]
    fn the_same_seed_and_moves_give_the_same_fight_and_the_seed_matters() {
        assert_eq!(run(153), run(153));
        let runs: Vec<_> = (150..158).map(run).collect();
        assert!(runs.iter().any(|r| *r != runs[3]));
    }

    #[test]
    fn the_boss_search_sees_a_repulsion_it_can_set_off() {
        // White pushes the + from (0, 0) next to the − at (2, 0): the − shoves (3, 0) and (4, 0)
        // and (4, 0) leaves the board, for the boss.
        let b = board(
            &[(0, 0), (2, 0), (3, 0), (4, 0)],
            &[(-2, 0), (-1, 0)],
            &[((0, 0), 1), ((2, 0), -1)],
        );
        let mut enc = fight(b, Player::White, [0, 0], 0);
        let m = magnetizer_move(&enc).unwrap();
        assert_eq!(m, mv(&[(-2, 0), (-1, 0)], E));
        enc.play(&m).unwrap();
        assert_eq!(enc.game().ejected(Player::White), 1);
        assert_eq!(magnetizer_move(&enc), None, "the player's turn");
    }

    #[test]
    fn an_assignment_marks_the_cells_it_polarized() {
        let mut enc = Encounter::new(Game::new(), magnetizer_boss(), 153);
        for m in &fixture()[..3] {
            enc.play(m).unwrap();
            let poles = enc.game().board().polarities();
            assert_eq!(
                enc.assigned(),
                &poles.iter().map(|p| p.0).collect::<Vec<_>>()[..]
            );
        }
        assert_eq!(enc.assigned().len(), 1);
    }
}
