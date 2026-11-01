//! The Magnetizer (#645, #671, #740, docs/specs/game-design.md section 7.9): at the start of some of
//! the player's turns one marble of either side with no polarity gets one, + then − in turn,
//! announced one turn ahead, and two adjacent marbles of opposite polarity repel one cell each, pushing every marble in front of them
//! on their line with no sumito limit, off the board at the rim; the pair then loses both
//! polarities. The polarities and the announce live on the board (`Board::polarities`,
//! `Board::announce`) and move with their marbles. Every random pick is splitmix64 of the fight
//! seed and the ply, so every peer gets the same fight.

use crate::board::{Announce, Board, Cell};
use crate::encounter::hull::mix;
use crate::encounter::{carried_marks, BossDef, Encounter};
use crate::moves::{Move, Player};
use crate::search::{search_hooked, DEFAULT_WEIGHTS};

type P = (i32, i32);

/// P2 and P3 start after this many ejections credited to the player. TUNE.
pub const MAGNETIZER_PHASE_EJECTIONS: [u8; 2] = [3, 5];
/// Player turns between two assignments, per phase: turns 3, 6, 9... in P1 and P2, the even
/// turns in P3 (#1237: the ladder's pro won 12 of 20 with [3, 2, 1], 15 with these). TUNE.
pub const MAGNETIZER_ASSIGN_EVERY: [u32; 3] = [3, 3, 2];
/// Repulsions per settle at most, a safety bound the fights never reach.
pub const MAGNETIZER_SETTLE_CAP: usize = 64;
/// Positions the boss search may visit per move (about depth 3, as the Hull). TUNE.
pub const MAGNETIZER_NODE_BUDGET: u32 = 3000;
/// Special id at the start of a player turn: the announced marble takes its sign.
pub const MAGNETIZER_TURN: u8 = 0;
/// Special id at the start of a player turn before an assignment turn: the same, then the next
/// marble and its sign are announced.
pub const MAGNETIZER_ANNOUNCE: u8 = 1;

/// One repulsion of a settle, for the client's animation: the pair, in the order the engine
/// drew it, and the board just before it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Repulsion {
    pub pair: [P; 2],
    pub before: Board,
}

/// The special at the end of ply `ply`, the start of a player turn when it is a boss ply (Black
/// moves first, so ply `2t - 2` ends just before turn `t`). It announces when the turn after that
/// one is an assignment turn of `phase`.
fn special(ply: u32, phase: usize) -> Option<u8> {
    let next = ply / 2 + 2;
    ply.is_multiple_of(2)
        .then_some(if next.is_multiple_of(MAGNETIZER_ASSIGN_EVERY[phase]) {
            MAGNETIZER_ANNOUNCE
        } else {
            MAGNETIZER_TURN
        })
}

/// The marbles of `board` of both sides, in `q` then `r` order.
fn marble_cells(board: &Board) -> Vec<P> {
    let radius = board.radius();
    (-radius..=radius)
        .flat_map(|q| (-radius..=radius).map(move |r| (q, r)))
        .filter(|&(q, r)| matches!(board.get(q, r), Some(Cell::Black | Cell::White)))
        .collect()
}

/// The sign after `board`'s last one: + first, then − and + in turn over the whole fight.
fn next_sign(board: &Board) -> i8 {
    if board.last_sign() == 1 {
        -1
    } else {
        1
    }
}

/// A marble picked by `state` among the marbles with no polarity, of either side; among all of
/// them once every marble holds one.
fn pick(board: &Board, state: u64) -> P {
    let all = marble_cells(board);
    let plain: Vec<P> = all
        .iter()
        .copied()
        .filter(|c| board.polarities().iter().all(|p| p.0 != *c))
        .collect();
    let pool = if plain.is_empty() { all } else { plain };
    pool[(state % pool.len() as u64) as usize]
}

/// The start of a player turn: the announced marble takes its sign (a marble picked by `seed`
/// when the announced one left the board), then, on `MAGNETIZER_ANNOUNCE`, the next marble and
/// the next sign of the cycle are announced.
fn hook(board: &Board, id: u8, seed: u64) -> Board {
    let mut out = board.clone();
    let state = mix(seed);
    if let Some((cell, sign)) = board.announce() {
        let cell = cell.unwrap_or_else(|| pick(board, state));
        let mut poles: Vec<_> = board
            .polarities()
            .iter()
            .copied()
            .filter(|p| p.0 != cell)
            .collect();
        poles.push((cell, sign));
        out.set_polarities(poles);
        out.set_last_sign(sign);
    }
    let next =
        (id == MAGNETIZER_ANNOUNCE).then(|| (Some(pick(&out, mix(mix(state)))), next_sign(&out)));
    out.set_announce(next);
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
/// front of it on the line; the last one leaves the board at the rim. The pair loses its
/// polarities, the pushed marbles keep theirs. The ejections credited to Black and to White.
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
    let shift = |c: P| -> Option<P> {
        let to = match moved.iter().find(|m| m.0 == c) {
            Some(&(_, (dq, dr))) => (c.0 + dq, c.1 + dr),
            None => c,
        };
        board.get(to.0, to.1).map(|_| to)
    };
    let poles = board
        .polarities()
        .iter()
        .filter(|&&(c, _)| c != a && c != b)
        .filter_map(|&(c, s)| shift(c).map(|to| (to, s)))
        .collect();
    out.set_polarities(poles);
    out.set_announce(board.announce().map(|(c, s)| (c.and_then(shift), s)));
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

/// The polarities of `before` carried by `mv`, kept on the marbles of `after`.
pub(crate) fn carried_poles(before: &Board, mv: &Move, after: &Board) -> Vec<(P, i8)> {
    let cells: Vec<P> = before.polarities().iter().map(|&(c, _)| c).collect();
    carried_marks(before, mv, &cells)
        .into_iter()
        .zip(before.polarities().iter().map(|&(_, s)| s))
        .filter(|&((q, r), _)| matches!(after.get(q, r), Some(Cell::Black | Cell::White)))
        .collect()
}

/// The announce of `before` carried by `mv`: its cell `None` once the marble left the board.
pub(crate) fn carried_announce(before: &Board, mv: &Move, after: &Board) -> Option<Announce> {
    before.announce().map(|(cell, sign)| {
        let cell = cell
            .map(|c| carried_marks(before, mv, &[c])[0])
            .filter(|&(q, r)| matches!(after.get(q, r), Some(Cell::Black | Cell::White)));
        (cell, sign)
    })
}

/// What a ply does in the boss search, as in `Encounter::play`: the polarities and the announce
/// follow the move and the board settles. After a boss ply the hook then fires with the special
/// of that ply, in the phase the tree's credits reach at the start of the ply
/// (`Encounter::phase_after`, as the encounter takes the tell before the move), and the board
/// settles again; it is skipped when it has nothing to assign or announce. The ply comes from the
/// clock `magnetizer_move` puts on the root board. Seed 0 for the picks and the pairs: the search
/// cannot know the ply's seed deeper in the tree.
fn magnetizer_step(
    enc: &Encounter,
    before: &Board,
    mv: &Move,
    mut after: Board,
) -> (Board, [u8; 2]) {
    let ply = before.magnetizer_ply().expect("the tree's clock") + 1;
    after.set_polarities(carried_poles(before, mv, &after));
    after.set_announce(carried_announce(before, mv, &after));
    after.set_magnetizer_ply(Some(ply));
    let (board, credits) = settle(&after, 0, &mut |_, _| {});
    let id = ply
        .is_multiple_of(2)
        .then(|| special(ply, enc.phase_after(before)))
        .flatten();
    match id {
        Some(id) if board.announce().is_some() || id == MAGNETIZER_ANNOUNCE => {
            let (out, more) = settle(&hook(&board, id, 0), 0, &mut |_, _| {});
            (out, [credits[0] + more[0], credits[1] + more[1]])
        }
        _ => (board, credits),
    }
}

/// The Magnetizer boss definition.
pub fn magnetizer_boss() -> BossDef {
    BossDef {
        name: "The Magnetizer",
        phase_marbles: Vec::new(),
        phase_ejections: MAGNETIZER_PHASE_EJECTIONS.to_vec(),
        special,
        hook,
        conversions: None,
        node_budget: MAGNETIZER_NODE_BUDGET,
    }
}

/// The boss reply: its node-limited search, where every ply of the tree settles and runs the
/// assignments (`magnetizer_step`), so it sees the repulsions. `None` on the player's turn or when
/// the game is over.
pub fn magnetizer_move(enc: &Encounter) -> Option<Move> {
    if enc.game().to_move() != Player::White {
        return None;
    }
    magnetizer_search(enc, enc.boss.node_budget, &|_| true)
}

/// The node-limited search of `enc` for the side to move, every ply of its tree through
/// `magnetizer_step`: the boss reply of [`magnetizer_move`], or the ladder player, who reads the
/// polarities and the announce on the board.
pub(crate) fn magnetizer_search(
    enc: &Encounter,
    budget: u32,
    allow: &dyn Fn(&Move) -> bool,
) -> Option<Move> {
    let mut board = enc.game().board().clone();
    board.set_magnetizer_ply(Some(enc.game().history().len() as u32));
    let game = enc.game().clone().with_board(board);
    let step = |before: &Board, _: Player, mv: &Move, after: Board| {
        magnetizer_step(enc, before, mv, after)
    };
    search_hooked(&game, budget, DEFAULT_WEIGHTS, allow, &step).map(|r| r.mv)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encounter::marbles;
    use crate::game::Game;
    use crate::moves::Direction::{E, NE, NW, SE};
    use crate::moves::{legal_moves, Direction};

    /// The fight seed of the e2e fixture (client/e2e/magnetizer.spec.ts).
    pub(crate) const FIXTURE_SEED: u64 = 120;

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
    fn the_special_fires_at_the_start_of_each_player_turn_and_announces_the_next_assignment() {
        let (t, a) = (Some(MAGNETIZER_TURN), Some(MAGNETIZER_ANNOUNCE));
        let table = [
            ((1, 0), None),
            ((2, 0), a), // the start of turn 2 announces turn 3
            ((4, 0), t),
            ((6, 0), t),
            ((8, 0), a), // turn 5 announces turn 6
            ((3, 1), None),
            ((2, 1), a), // P2 assigns on turns 3, 6... as P1 (#1237)
            ((4, 1), t),
            ((2, 2), t),
            ((4, 2), a), // P3: turn 3 announces turn 4
            ((6, 2), t),
        ];
        for ((ply, phase), id) in table {
            assert_eq!(special(ply, phase), id, "ply {ply}, phase {phase}");
        }
    }

    /// Lone marbles far apart, a Black one walking a triangle, White's a segment: no push, no
    /// repulsion. `ejected` sets the phase.
    fn quiet_fight(ejected: u8, seed: u64) -> Encounter {
        let b = board(&[(0, 0), (-4, 4), (-2, 4)], &[(0, -3)], &[]);
        fight(b, Player::Black, [ejected, 0], seed)
    }

    /// The player turns that start with a new polarity, over `turns` turns.
    fn assignment_turns(ejected: u8, turns: u32) -> Vec<u32> {
        let tri = [(0, 0), (1, 0), (0, 1)];
        let seg = [(0, -3), (1, -3)];
        let dir = |from: P, to: P| {
            [E, Direction::W, NE, Direction::SW, NW, SE]
                .into_iter()
                .find(|d| d.vector() == (to.0 - from.0, to.1 - from.1))
                .unwrap()
        };
        let mut enc = quiet_fight(ejected, 4);
        let mut out = Vec::new();
        for turn in 1..=turns {
            if !enc.assigned().is_empty() {
                out.push(turn);
            }
            let k = turn as usize - 1;
            let (from, to) = (tri[k % 3], tri[(k + 1) % 3]);
            enc.play(&mv(&[from], dir(from, to))).unwrap();
            let (from, to) = (seg[k % 2], seg[(k + 1) % 2]);
            enc.play(&mv(&[from], dir(from, to))).unwrap();
            assert!(enc.repulsions().is_empty());
        }
        out
    }

    #[test]
    fn a_polarity_comes_at_the_start_of_turns_3_and_6_in_p1_and_p2_every_2nd_in_p3() {
        assert_eq!(assignment_turns(0, 10), vec![3, 6, 9]);
        assert_eq!(assignment_turns(3, 10), vec![3, 6, 9], "P2 as P1 (#1237)");
        assert_eq!(
            assignment_turns(5, 8),
            vec![4, 6, 8],
            "nothing announces turn 2 before turn 1"
        );
    }

    #[test]
    fn the_announce_comes_one_turn_ahead_and_the_marble_then_takes_its_sign() {
        let mut enc = quiet_fight(0, 7);
        enc.play(&mv(&[(0, 0)], E)).unwrap();
        assert_eq!(enc.game().board().announce(), None);
        enc.play(&mv(&[(0, -3)], E)).unwrap(); // the start of turn 2: turn 3 is announced
        let (cell, sign) = enc.game().board().announce().unwrap();
        assert_eq!(sign, 1, "the first is +");
        let cell = cell.unwrap();
        assert!(enc.game().board().polarities().is_empty());
        assert_eq!(enc.game().board().get(cell.0, cell.1), Some(Cell::Black));
        enc.play(&mv(&[cell], NE)).unwrap(); // the announced marble itself moves
        let moved = (cell.0 + 1, cell.1 - 1);
        assert_eq!(
            enc.game().board().announce(),
            Some((Some(moved), sign)),
            "it follows"
        );
        enc.play(&mv(&[(1, -3)], Direction::W)).unwrap(); // the start of turn 3
        assert_eq!(enc.game().board().polarities(), &[(moved, sign)]);
        assert_eq!(enc.assigned(), &[moved]);
        assert_eq!(
            enc.game().board().announce(),
            None,
            "turn 4 assigns nothing in P1"
        );
    }

    /// The signs of the announces over `n` announce hooks in a row, each applying the last one.
    fn announced_signs(mut b: Board, n: usize, seed: u64) -> Vec<i8> {
        (0..n)
            .map(|k| {
                b = hook(&b, MAGNETIZER_ANNOUNCE, seed + k as u64);
                b.announce().unwrap().1
            })
            .collect()
    }

    fn wide_board() -> Board {
        board(
            &[(-2, 0), (-1, 0), (0, 0), (1, 0)],
            &[(-2, 2), (-1, 2), (0, 2), (1, 2)],
            &[],
        )
    }

    #[test]
    fn the_signs_alternate_plus_then_minus_over_the_whole_fight() {
        assert_eq!(announced_signs(wide_board(), 4, 0), vec![1, -1, 1, -1]);
        assert_eq!(announced_signs(wide_board(), 4, 9), vec![1, -1, 1, -1]);
    }

    #[test]
    fn the_cycle_goes_on_across_turns_without_an_assignment() {
        let b = hook(&wide_board(), MAGNETIZER_ANNOUNCE, 3);
        assert_eq!(b.announce().unwrap().1, 1, "the first is +");
        let b = hook(&b, MAGNETIZER_TURN, 4);
        assert_eq!(b.announce(), None);
        assert_eq!(b.polarities().len(), 1);
        assert_eq!(b.polarities()[0].1, 1);
        let b = hook(&b, MAGNETIZER_TURN, 5);
        let b = hook(&b, MAGNETIZER_ANNOUNCE, 6);
        assert_eq!(b.announce().unwrap().1, -1, "then −");
        let b = hook(&b, MAGNETIZER_TURN, 7);
        let signs: Vec<i8> = b.polarities().iter().map(|p| p.1).collect();
        assert_eq!(signs.iter().filter(|&&s| s == -1).count(), 1);
        assert_eq!(signs.len(), 2);
    }

    #[test]
    fn the_boss_marbles_can_be_picked_too() {
        let colour = |seed: u64| {
            let b = hook(&wide_board(), MAGNETIZER_ANNOUNCE, seed);
            let (q, r) = b.announce().unwrap().0.unwrap();
            b.get(q, r).unwrap()
        };
        let picked: Vec<Cell> = (0..64).map(colour).collect();
        assert!(picked.contains(&Cell::White) && picked.contains(&Cell::Black));
    }

    #[test]
    fn only_unpolarized_marbles_are_picked_while_there_are_some() {
        let b = board(
            &[(0, 0), (1, 0)],
            &[(0, 2), (1, 2)],
            &[((0, 0), 1), ((0, 2), -1), ((1, 2), 1)],
        );
        for seed in 0..32 {
            let out = hook(&b, MAGNETIZER_ANNOUNCE, seed);
            assert_eq!(out.announce().unwrap().0, Some((1, 0)), "seed {seed}");
        }
    }

    #[test]
    fn when_every_marble_is_polarized_any_is_picked_and_takes_the_next_sign() {
        let b = board(
            &[(0, 0), (1, 0)],
            &[(0, 2)],
            &[((0, 0), 1), ((1, 0), -1), ((0, 2), 1)],
        );
        let picked: Vec<_> = (0..32)
            .map(|seed| hook(&b, MAGNETIZER_ANNOUNCE, seed).announce().unwrap())
            .collect();
        for cell in [(0, 0), (1, 0), (0, 2)] {
            assert!(picked.iter().any(|a| a.0 == Some(cell)), "{cell:?}");
        }
        assert!(picked.iter().all(|a| a.1 == 1), "the first sign is +");
        let mut held = b.clone();
        held.set_announce(Some((Some((0, 0)), 1)));
        let out = hook(&held, MAGNETIZER_TURN, 0);
        assert_eq!(sorted(&out), sorted(&b), "+ stays +");
    }

    #[test]
    fn a_polarity_follows_a_boss_marble_and_leaves_with_it() {
        let b = board(
            &[(3, 0), (4, 0)],
            &[(0, 0), (1, 0), (2, 0)],
            &[((0, 0), 1), ((2, 0), -1)],
        );
        let mut enc = fight(b, Player::White, [0, 0], 0);
        enc.play(&mv(&[(0, 0), (1, 0), (2, 0)], E)).unwrap();
        assert_eq!(
            sorted(enc.game().board()),
            vec![((1, 0), 1), ((3, 0), -1)],
            "both follow the push"
        );
        let mut enc = fight(
            board(&[(-4, 0)], &[(0, 0)], &[((0, 0), -1)]),
            Player::White,
            [0, 0],
            0,
        );
        enc.play(&mv(&[(0, 0)], NE)).unwrap();
        assert_eq!(sorted(enc.game().board()), vec![((1, -1), -1)]);
    }

    #[test]
    fn two_boss_marbles_or_a_boss_and_a_player_marble_repel_with_the_usual_credit() {
        let bosses = board(
            &[(3, 0), (4, 0)],
            &[(1, 0), (2, 0)],
            &[((1, 0), 1), ((2, 0), -1)],
        );
        let (out, credits, _) = settled(&bosses, 0);
        assert_eq!(credits, [0, 1], "a player marble off counts for the boss");
        assert_eq!(out.get(4, 0), Some(Cell::Black));
        assert_eq!(marbles(&out, Cell::White), 2);
        assert!(out.polarities().is_empty());
        let mixed = board(
            &[(1, 0)],
            &[(2, 0), (3, 0), (4, 0)],
            &[((1, 0), 1), ((2, 0), -1)],
        );
        let (out, credits, _) = settled(&mixed, 0);
        assert_eq!(credits, [1, 0], "a boss marble off counts for the player");
        assert_eq!(out.get(0, 0), Some(Cell::Black));
        assert_eq!(marbles(&out, Cell::White), 2);
    }

    #[test]
    fn the_boss_search_carries_the_polarity_of_its_own_marble() {
        let b = board(&[(4, 0)], &[(0, 0)], &[((0, 0), 1)]);
        let after = {
            let mut a = board(&[(4, 0)], &[(1, 0)], &[]);
            a.set_polarities(carried_poles(&b, &mv(&[(0, 0)], E), &a));
            a
        };
        assert_eq!(sorted(&after), vec![((1, 0), 1)]);
    }

    #[test]
    fn the_hook_applies_the_announce_and_picks_at_random_when_its_marble_left() {
        let mut b = board(&[(0, 0), (1, 0), (2, 0)], &[], &[((0, 0), 1)]);
        b.set_announce(Some((Some((0, 0)), -1)));
        let out = hook(&b, MAGNETIZER_TURN, 3);
        assert_eq!(out.polarities(), &[((0, 0), -1)]);
        assert_eq!(out.announce(), None);
        b.set_announce(Some((Some((0, 0)), 1)));
        assert_eq!(
            hook(&b, MAGNETIZER_TURN, 3).polarities(),
            &[((0, 0), 1)],
            "kept"
        );
        b.set_announce(Some((None, 1)));
        let polarized: Vec<usize> = (0..16)
            .map(|seed| hook(&b, MAGNETIZER_TURN, seed).polarities().len())
            .collect();
        assert!(
            polarized.iter().all(|&n| (1..=2).contains(&n)),
            "one marble picked"
        );
        assert!(polarized.contains(&2), "the pick lands elsewhere too");
        let plain = board(&[(0, 0)], &[], &[]);
        assert_eq!(
            hook(&plain, MAGNETIZER_TURN, 3),
            plain,
            "nothing announced, nothing to do"
        );
        let next = hook(&plain, MAGNETIZER_ANNOUNCE, 3);
        assert!(next.polarities().is_empty());
        assert_eq!(next.announce().map(|a| a.0), Some(Some((0, 0))));
    }

    #[test]
    fn the_announce_follows_moves_and_pushes_and_is_lost_with_its_marble() {
        let mut b = board(&[(3, 0), (4, 0)], &[(0, 0), (1, 0), (2, 0)], &[]);
        b.set_announce(Some((Some((3, 0)), 1)));
        let mut enc = fight(b.clone(), Player::Black, [0, 0], 0);
        enc.play(&mv(&[(3, 0)], NW)).unwrap();
        assert_eq!(enc.game().board().announce(), Some((Some((3, -1)), 1)));
        let mut enc = fight(b, Player::White, [0, 0], 0);
        enc.play(&mv(&[(0, 0), (1, 0), (2, 0)], E)).unwrap();
        assert_eq!(
            enc.game().board().announce(),
            Some((Some((4, 0)), 1)),
            "pushed"
        );
        let mut b = board(&[(4, 0)], &[(1, 0), (2, 0), (3, 0)], &[]);
        b.set_announce(Some((Some((4, 0)), -1)));
        let mut enc = fight(b, Player::White, [0, 0], 0);
        enc.play(&mv(&[(1, 0), (2, 0), (3, 0)], E)).unwrap();
        assert_eq!(enc.game().board().announce(), Some((None, -1)), "ejected");
    }

    #[test]
    fn the_announce_follows_a_repulsion() {
        let mut b = board(
            &[(0, 0), (1, 0), (2, 0), (-3, 0)],
            &[],
            &[((0, 0), 1), ((1, 0), -1)],
        );
        b.set_announce(Some((Some((2, 0)), 1)));
        assert_eq!(settled(&b, 0).0.announce(), Some((Some((3, 0)), 1)));
        b.set_announce(Some((Some((-3, 0)), 1)));
        assert_eq!(
            settled(&b, 0).0.announce(),
            Some((Some((-3, 0)), 1)),
            "not pushed"
        );
        b.set_announce(Some((None, 1)));
        assert_eq!(settled(&b, 0).0.announce(), Some((None, 1)));
        let mut rim = board(
            &[(-3, 0), (-4, 0), (-2, 0)],
            &[],
            &[((-3, 0), 1), ((-2, 0), -1)],
        );
        rim.set_announce(Some((Some((-4, 0)), 1)));
        assert_eq!(settled(&rim, 0).0.announce(), Some((None, 1)), "pushed off");
    }

    #[test]
    fn a_minus_next_to_a_plus_pushes_a_boss_line_of_3_ejects_the_last_and_both_lose_their_sign() {
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
        assert!(out.polarities().is_empty(), "the pair is spent");
    }

    #[test]
    fn a_repulsion_pushes_a_boss_line_of_5_and_its_own_side_ignoring_sumito() {
        let b = board(
            &[(-3, 0), (-2, 0), (-1, 0)],
            &[(0, 0), (1, 0), (2, 0), (3, 0), (4, 0)],
            &[((-2, 0), 1), ((-1, 0), -1), ((-3, 0), 1)],
        );
        let (out, credits, log) = settled(&b, 1);
        assert_eq!(log, vec![[(-2, 0), (-1, 0)]]);
        assert_eq!(credits, [1, 0], "(4, 0) went off the board");
        use Cell::{Black as B, Empty as O, White as W};
        let row: Vec<_> = (-4..=4).map(|q| out.get(q, 0).unwrap()).collect();
        assert_eq!(row, vec![B, B, O, O, B, W, W, W, W], "(-3, 0) pushed along");
        assert_eq!(
            sorted(&out),
            vec![((-4, 0), 1)],
            "the pushed marble keeps its sign"
        );
    }

    #[test]
    fn a_player_marble_pushed_off_counts_for_the_boss() {
        let b = board(&[(3, 0), (4, 0), (2, 0)], &[], &[((3, 0), -1), ((2, 0), 1)]);
        let (out, credits, _) = settled(&b, 0);
        assert_eq!(credits, [0, 1]);
        assert_eq!(out.get(4, 0), Some(Cell::Black));
        assert_eq!(out.get(1, 0), Some(Cell::Black));
        assert!(out.polarities().is_empty());
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
    fn a_pushed_polarized_marble_still_repels_in_the_same_settle() {
        // The pair (-1, 0)+ (0, 0)− pushes the − of (1, 0) next to the + of (3, 0): they repel too.
        let b = board(
            &[(-1, 0), (0, 0), (1, 0), (3, 0)],
            &[],
            &[((-1, 0), 1), ((0, 0), -1), ((1, 0), -1), ((3, 0), 1)],
        );
        let (out, _, log) = settled(&b, 5);
        assert_eq!(log, vec![[(-1, 0), (0, 0)], [(2, 0), (3, 0)]]);
        assert!(out.polarities().is_empty());
        let cells: Vec<i32> = (-4..=4)
            .filter(|&q| out.get(q, 0) == Some(Cell::Black))
            .collect();
        assert_eq!(cells, vec![-2, 0, 1, 4]);
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

    /// The e2e fixture (client/e2e/magnetizer.spec.ts), fight seed `FIXTURE_SEED`: quiet boss
    /// moves on the right, the player walks the centre column up. Turns 3 and 6 polarize two of
    /// its marbles, + then −; turn 6 moves the second next to the first, which shoves the boss
    /// column of 3 off at (0, -4), and both lose their sign. Then 3 player marbles in line push the
    /// rest of the column off, twice: 3 ejections, P2.
    pub(crate) fn fixture() -> Vec<Move> {
        [
            (vec![(0, 2)], NW),
            (vec![(4, -3)], SE),
            (vec![(0, 1)], NW),
            (vec![(4, -2)], SE),
            (vec![(0, 0)], NW),
            (vec![(4, -1)], SE),
            (vec![(0, 3)], NW),
            (vec![(3, -3)], SE),
            (vec![(0, 2)], NW),
            (vec![(3, -2)], SE),
            (vec![(0, 1)], NW),
            (vec![(4, -4)], SE),
            (vec![(0, 1)], NW),
            (vec![(4, -3)], SE),
            (vec![(0, 0)], NW),
            (vec![(3, -4)], SE),
            (vec![(-1, 2)], NE),
            (vec![(3, -3)], SE),
            (vec![(0, 1)], NW),
            (vec![(4, -2)], SE),
            (vec![(0, -2), (0, -1), (0, 0)], NW),
            (vec![(4, 0)], Direction::SW),
            (vec![(0, -3), (0, -2), (0, -1)], NW),
        ]
        .into_iter()
        .map(|(c, dir)| mv(&c, dir))
        .collect()
    }

    #[test]
    fn the_fixture_shoves_a_boss_line_of_3_off_then_reaches_p2() {
        let mut enc = Encounter::new(Game::new(), magnetizer_boss(), FIXTURE_SEED);
        let mut ejected = Vec::new();
        for (i, m) in fixture().iter().enumerate() {
            let before = enc.game().board().clone();
            enc.play(m).unwrap();
            ejected.push(enc.game().ejected(Player::Black));
            if i == 10 {
                let poles = before.polarities();
                assert_eq!(poles.len(), 2);
                let sign = |c: P| poles.iter().find(|p| p.0 == c).unwrap().1;
                assert_eq!(
                    sign((0, -1)),
                    -sign((0, 1)),
                    "opposite signs before the move"
                );
                assert_eq!(enc.repulsions().len(), 1);
                assert_eq!(enc.repulsions()[0].pair, [(0, -1), (0, 0)]);
                assert!([(0, -2), (0, -3), (0, -4)]
                    .iter()
                    .all(|&(q, r)| enc.repulsions()[0].before.get(q, r) == Some(Cell::White)));
                assert!(
                    enc.game().board().polarities().is_empty(),
                    "both lose their sign"
                );
            } else {
                assert!(enc.repulsions().is_empty(), "ply {i}");
            }
        }
        let expect = [vec![0; 10], vec![1; 10], vec![2; 2], vec![3]].concat();
        assert_eq!(ejected, expect);
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
        assert!(longest >= 1, "repulsions happen: {longest}");
        assert!(
            longest < MAGNETIZER_SETTLE_CAP / 2,
            "far from the cap: {longest}"
        );
    }

    /// The board and the counts after each ply of the fixture, while it is legal.
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
        assert_eq!(run(FIXTURE_SEED), run(FIXTURE_SEED));
        let runs: Vec<_> = (0..8).map(run).collect();
        assert!(runs.iter().any(|r| *r != runs[0]));
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

    /// A fight at `ejected` with the first `plies` quiet plies played (the boss to move at turn 1
    /// after 1, at turn 2 after 3), then on board `b`.
    fn played(b: Board, ejected: u8, plies: usize) -> Encounter {
        let quiet = [
            mv(&[(0, 0)], E),
            mv(&[(0, -3)], E),
            mv(&[(1, 0)], Direction::W),
        ];
        let mut enc = quiet_fight(ejected, 1);
        for m in &quiet[..plies] {
            enc.play(m).unwrap();
        }
        enc.game.replace_board(b);
        enc
    }

    #[test]
    fn the_tree_sees_the_assignment_at_the_start_of_turn_3_and_avoids_its_repulsion() {
        // Turn 2 of P1, boss to move: the start of turn 3 gives the announced (0, -3) its −, next
        // to the + boss marble (-1, -3) on the rim, which the repulsion throws off. 1 of 600 random
        // positions of this kind (the announced marble next to an opposite pole) gave two moves.
        let mut b = board(
            &[(-2, 2), (0, -3), (1, 0), (2, -3), (-1, -2), (3, 1)],
            &[(1, 1), (-1, 0), (-1, 3), (2, -1), (-1, -3)],
            &[((-1, -3), 1)],
        );
        b.set_announce(Some((Some((0, -3)), -1)));
        b.set_last_sign(1);
        let enc = played(b, 0, 3);
        assert_eq!((enc.phase(), enc.tell()), (0, Some(MAGNETIZER_TURN)));
        // The search before #916: the polarities follow the moves and settle, no assignment.
        let blind = |before: &Board, _: Player, mv: &Move, mut after: Board| {
            after.set_polarities(carried_poles(before, mv, &after));
            let (out, credits, _) = settled(&after, 0);
            (out, credits)
        };
        let old = search_hooked(
            enc.game(),
            MAGNETIZER_NODE_BUDGET,
            DEFAULT_WEIGHTS,
            &|_| true,
            &blind,
        )
        .unwrap()
        .mv;
        assert_eq!(old, mv(&[(-1, 3)], NE));
        let new = magnetizer_move(&enc).unwrap();
        assert_eq!(new, mv(&[(-1, -3)], Direction::SW), "the + leaves the rim");
        let lost = |m: &Move| {
            let mut e = enc.clone();
            e.play(m).unwrap();
            (e.repulsions().len(), e.game().ejected(Player::Black))
        };
        assert_eq!(
            lost(&old),
            (1, 1),
            "the old move loses (-1, -3) to the repulsion"
        );
        assert_eq!(lost(&new), (0, 0));
    }

    #[test]
    fn a_fifth_ejection_in_the_tree_switches_the_cadence_from_3_to_2() {
        // The root: turn 1, boss to move, 4 ejections for the player (P2), 3 boss marbles.
        let root = board(&[(0, 0), (-4, 4)], &[(0, -4), (4, -4), (-4, 0)], &[]);
        let enc = played(root.clone(), 4, 1);
        assert_eq!((enc.phase(), enc.game().history().len()), (1, 1));
        // Boss ply 4 of the tree ends just before turn 3. Its hook announces turn 4, an assignment
        // turn in P3 and not in P2: the phase at the start of the ply decides.
        let boss = mv(&[(0, -4)], E);
        let step = |gone: bool| {
            let mut before = root.clone();
            if gone {
                before.set(4, -4, Cell::Empty);
            }
            before.set_magnetizer_ply(Some(3));
            let mut after = before.clone();
            after.set(0, -4, Cell::Empty);
            after.set(1, -4, Cell::White);
            magnetizer_step(&enc, &before, &boss, after)
        };
        let (p1, credits) = step(false);
        assert_eq!(p1.announce(), None, "P2: turn 4 assigns nothing");
        assert_eq!(p1.magnetizer_ply(), Some(4), "the clock moves on");
        assert_eq!(credits, [0, 0]);
        let (p3, _) = step(true);
        let (cell, sign) = p3
            .announce()
            .expect("P3 after a fifth ejection in the tree: turn 4 is announced");
        assert!(cell.is_some());
        assert_eq!(sign, 1, "the first sign, +");
    }

    #[test]
    fn a_player_ply_of_the_tree_carries_the_announce_and_runs_no_hook() {
        let mut before = board(&[(0, 0), (-4, 4)], &[(0, -4)], &[]);
        before.set_announce(Some((Some((0, 0)), 1)));
        before.set_magnetizer_ply(Some(2));
        let enc = played(before.clone(), 0, 1);
        let mut after = before.clone();
        after.set(0, 0, Cell::Empty);
        after.set(1, 0, Cell::Black);
        let (out, _) = magnetizer_step(&enc, &before, &mv(&[(0, 0)], E), after);
        assert_eq!(
            out.announce(),
            Some((Some((1, 0)), 1)),
            "it follows its marble"
        );
        assert!(out.polarities().is_empty(), "ply 3 assigns nothing");
        assert_eq!(out.magnetizer_ply(), Some(3));
    }
}
