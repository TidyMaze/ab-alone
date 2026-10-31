//! The Rail Yard (#626, docs/specs/game-design.md section 7.8): freight trains sweep whole lines.
//! A train is announced 5 player turns ahead on one line of the board, edge to edge, then passes
//! and ejects every marble on it, either side. The trains are marks on the board
//! (`Board::trains`), never marbles, so they change no move or push. The track is picked by a
//! seeded integer PRNG of the fight seed and the ply, so every peer gets the same trains.

use crate::board::{Board, Cell, RADIUS};
use crate::encounter::hull::mix;
use crate::encounter::{marbles, BossDef, Encounter};
use crate::game::Game;
use crate::moves::{Move, Player};
use crate::search::{search_hooked, DEFAULT_WEIGHTS};

type P = (i32, i32);

/// Lines of the board, 9 on each of the 3 axes. A track is a line and its entry end: twice as many.
pub const RAILYARD_LINES: u8 = 27;
/// Player turns from the announce of a train to its pass. TUNE.
pub const RAILYARD_LEAD: u8 = 5;
/// A new train is announced every this many player turns, per phase. TUNE.
pub const RAILYARD_EVERY: [u32; 3] = [10, 5, 3];
/// The ply that ends the player's turn 1, so that the first train shows on turn 2, where the first train is announced. TUNE.
pub const RAILYARD_FIRST_PLY: u32 = 1;
/// P2 and P3 start after this many ejections credited to the player. TUNE.
pub const RAILYARD_PHASE_EJECTIONS: [u8; 2] = [3, 5];
/// Positions the boss search may visit per move (about depth 3, as the Hull). TUNE.
pub const RAILYARD_NODE_BUDGET: u32 = 3000;
/// Special id at the end of a player turn: the trains count down and the ones at zero pass.
pub const RAILYARD_COUNT: u8 = 0;
/// Special id at the end of a player turn that also announces a new train.
pub const RAILYARD_ANNOUNCE: u8 = 1;

/// The cells of `line`, from its end of lowest `q` (lowest `r` on axis 1). Line
/// `9 * axis + offset + 4`: axis 0 holds `r = offset`, axis 1 `q = offset`, axis 2
/// `q + r = -offset`.
pub fn line_cells(line: u8) -> Vec<P> {
    let (axis, offset) = (line / 9, i32::from(line % 9) - RADIUS);
    let on = move |(q, r): P| match axis {
        0 => r == offset,
        1 => q == offset,
        _ => q + r == -offset,
    };
    (-RADIUS..=RADIUS)
        .flat_map(|q| (-RADIUS..=RADIUS).map(move |r| (q, r)))
        .filter(|&(q, r)| (q + r).abs() <= RADIUS && on((q, r)))
        .collect()
}

/// The cells of `track` in the order its train runs them, the entry cell first: track
/// `2 * line` enters at the first cell of [`line_cells`], track `2 * line + 1` at the last.
pub fn track_cells(track: u8) -> Vec<P> {
    let mut cells = line_cells(track / 2);
    if track % 2 == 1 {
        cells.reverse();
    }
    cells
}

/// Special id of the ply that just ended: none for a boss turn (Black moves first, so the
/// player's plies are odd), an announce at the end of the player's turn 1 (the first train, seen on turn 2, #740)
/// and of the player's turn `n` when `n` is a multiple of the phase's rhythm, else the count down.
fn special(ply: u32, phase: usize) -> Option<u8> {
    (ply % 2 == 1).then(|| {
        if ply == RAILYARD_FIRST_PLY || ply.div_ceil(2).is_multiple_of(RAILYARD_EVERY[phase]) {
            RAILYARD_ANNOUNCE
        } else {
            RAILYARD_COUNT
        }
    })
}

/// Announces a train with `RAILYARD_LEAD` turns left, on a track whose line no announced train
/// holds, picked by `seed` in track order.
fn announce(board: &mut Board, seed: u64) {
    let mut trains = board.trains().to_vec();
    let free: Vec<u8> = (0..RAILYARD_LINES * 2)
        .filter(|t| trains.iter().all(|&(u, _)| u / 2 != t / 2))
        .collect();
    trains.push((
        free[(mix(seed) % free.len() as u64) as usize],
        RAILYARD_LEAD,
    ));
    board.set_trains(trains);
}

/// End of a player turn: every train counts down, the ones at zero pass and clear every marble
/// off their line, then a train is announced when `id` says so.
fn hook(board: &Board, id: u8, seed: u64) -> Board {
    let mut out = board.clone();
    let mut kept = Vec::new();
    for &(track, left) in board.trains() {
        if left > 1 {
            kept.push((track, left - 1));
            continue;
        }
        for (q, r) in line_cells(track / 2) {
            out.set(q, r, Cell::Empty);
        }
    }
    out.set_trains(kept);
    if id == RAILYARD_ANNOUNCE {
        announce(&mut out, seed);
    }
    out
}

/// The Rail Yard boss definition.
pub fn railyard_boss() -> BossDef {
    BossDef {
        name: "The Rail Yard",
        phase_marbles: Vec::new(),
        phase_ejections: RAILYARD_PHASE_EJECTIONS.to_vec(),
        special,
        hook,
        conversions: None,
        node_budget: RAILYARD_NODE_BUDGET,
    }
}

/// A new encounter: the standard layout, the player is Black and moves first, and no train is
/// announced before the end of the player's turn 1.
pub fn railyard_start(seed: u64) -> Encounter {
    Encounter::new(
        Game::from_position(Board::standard(), Player::Black, [0, 0]),
        railyard_boss(),
        seed,
    )
}

/// The boss reply: its node-limited search, among the moves that leave the fewest of its marbles
/// on the announced lines. `None` on the player's turn or when the game is over.
pub fn railyard_move(enc: &Encounter) -> Option<Move> {
    let game = enc.game();
    if game.to_move() != Player::White {
        return None;
    }
    // Every player ply of the tree counts the trains down, and a pass ejects its line.
    let step = |_: &Board, mover: Player, _: &Move, after: Board| {
        if mover == Player::White {
            return (after, [0, 0]);
        }
        let out = hook(&after, RAILYARD_COUNT, 0);
        let lost = |c| marbles(&after, c) - marbles(&out, c);
        let credits = [lost(Cell::White), lost(Cell::Black)];
        (out, credits)
    };
    search_hooked(
        game,
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
    use crate::moves::{apply, legal_moves, Direction};

    type Train = (u8, u8);

    /// Line 4 is the row `r = 0`, line 13 the column `q = 0`, line 22 the diagonal `q + r = 0`.
    const ROW: u8 = 4;
    const COLUMN: u8 = 13;
    const DIAGONAL: u8 = 22;

    fn board(black: &[P], white: &[P], trains: &[Train]) -> Board {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        board.set_trains(trains.to_vec());
        board
    }

    fn fight(board: Board, to_move: Player, ejected: [u8; 2]) -> Encounter {
        Encounter::new(
            Game::from_position(board, to_move, ejected),
            railyard_boss(),
            0,
        )
    }

    fn trains(enc: &Encounter) -> Vec<Train> {
        enc.game().board().trains().to_vec()
    }

    /// The trains of a fight that began with a train in the position, without the first train the
    /// engine announces at the end of the player's turn 1 (the last one).
    fn set_trains(enc: &Encounter) -> Vec<Train> {
        let mut out = trains(enc);
        out.pop();
        out
    }

    fn whites(enc: &Encounter) -> u8 {
        marbles(enc.game().board(), Cell::White)
    }

    fn blacks(enc: &Encounter) -> u8 {
        marbles(enc.game().board(), Cell::Black)
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    /// The first legal move of the side to move that ejects nothing and moves no marble onto or
    /// off an announced line.
    fn quiet(enc: &mut Encounter) {
        let game = enc.game();
        let rails: Vec<P> = game
            .board()
            .trains()
            .iter()
            .flat_map(|&(t, _)| line_cells(t / 2))
            .collect();
        let off = |c: &P| !rails.contains(c);
        let mv = legal_moves(game.board(), game.to_move())
            .into_iter()
            .find(|m| {
                let (_, ejected) = apply(game.board(), game.to_move(), m).unwrap();
                let (dq, dr) = m.dir.vector();
                !ejected
                    && m.cells.iter().all(off)
                    && m.cells.iter().all(|&(q, r)| off(&(q + dq, r + dr)))
            })
            .unwrap();
        enc.play(&mv).unwrap();
        assert_eq!(enc.game().outcome(), None, "the test game goes on");
    }

    #[test]
    fn boss_definition_matches_the_spec() {
        let b = railyard_boss();
        assert_eq!(b.name, "The Rail Yard");
        assert!(b.phase_marbles.is_empty());
        assert_eq!(
            b.phase_ejections,
            vec![3, 5],
            "P2 after 3 ejections, P3 after 5"
        );
        assert_eq!(b.node_budget, RAILYARD_NODE_BUDGET);
        assert_eq!(
            RAILYARD_NODE_BUDGET, HULL_NODE_BUDGET,
            "the Hull's time budget"
        );
    }

    #[test]
    fn the_27_lines_run_edge_to_edge_on_the_3_axes() {
        let mut lengths = Vec::new();
        for line in 0..RAILYARD_LINES {
            let cells = line_cells(line);
            lengths.push(cells.len());
            let step = [(1, 0), (0, 1), (1, -1)][usize::from(line / 9)];
            for pair in cells.windows(2) {
                assert_eq!(
                    pair[1],
                    (pair[0].0 + step.0, pair[0].1 + step.1),
                    "line {line}"
                );
            }
            let (first, last) = (cells[0], cells[cells.len() - 1]);
            let board = Board::empty();
            assert_eq!(
                board.get(first.0 - step.0, first.1 - step.1),
                None,
                "an edge"
            );
            assert_eq!(board.get(last.0 + step.0, last.1 + step.1), None, "an edge");
        }
        let axis = [5, 6, 7, 8, 9, 8, 7, 6, 5];
        assert_eq!(lengths, [axis, axis, axis].concat());
        assert_eq!(line_cells(ROW).first(), Some(&(-4, 0)));
        assert_eq!(
            line_cells(COLUMN),
            (-4..=4).map(|r| (0, r)).collect::<Vec<_>>()
        );
        assert_eq!(line_cells(DIAGONAL).first(), Some(&(-4, 4)));
        for q in -MAX_RADIUS..=MAX_RADIUS {
            for r in -MAX_RADIUS..=MAX_RADIUS {
                let on = (0..RAILYARD_LINES)
                    .filter(|&l| line_cells(l).contains(&(q, r)))
                    .count();
                let expected = if Board::empty().get(q, r).is_some() {
                    3
                } else {
                    0
                };
                assert_eq!(on, expected, "({q}, {r}) is on one line per axis");
            }
        }
    }

    #[test]
    fn a_track_is_a_line_and_the_end_its_train_enters_by() {
        let mut back = line_cells(COLUMN);
        assert_eq!(track_cells(2 * COLUMN), back);
        back.reverse();
        assert_eq!(track_cells(2 * COLUMN + 1), back);
        assert_eq!(
            track_cells(2 * COLUMN + 1)[0],
            (0, 4),
            "enters at the bottom"
        );
    }

    #[test]
    fn the_fight_starts_on_the_standard_layout_with_no_train() {
        let enc = railyard_start(0);
        let b = enc.game().board();
        assert_eq!(*b, Board::standard());
        assert!(
            b.trains().is_empty(),
            "the first train is announced on turn 2"
        );
        assert_eq!(enc.game().to_move(), Player::Black);
        assert_eq!(enc.phase(), 0);
        assert_eq!(enc.game().win_ejections(Player::Black), 6);
        assert_eq!(enc.game().win_ejections(Player::White), 6);
    }

    #[test]
    fn special_schedule_follows_the_player_turn_and_the_phase() {
        let table = [
            ((1, 0), Some(RAILYARD_ANNOUNCE)),
            ((1, 1), Some(RAILYARD_ANNOUNCE)),
            ((1, 2), Some(RAILYARD_ANNOUNCE)),
            ((3, 0), Some(RAILYARD_COUNT)),
            ((2, 0), None),
            ((9, 0), Some(RAILYARD_COUNT)),
            ((19, 0), Some(RAILYARD_ANNOUNCE)),
            ((20, 0), None),
            ((29, 0), Some(RAILYARD_COUNT)),
            ((9, 1), Some(RAILYARD_ANNOUNCE)),
            ((29, 1), Some(RAILYARD_ANNOUNCE)),
            ((7, 1), Some(RAILYARD_COUNT)),
            ((5, 2), Some(RAILYARD_ANNOUNCE)),
            ((7, 2), Some(RAILYARD_COUNT)),
            ((11, 2), Some(RAILYARD_ANNOUNCE)),
            ((6, 2), None),
        ];
        for ((ply, phase), id) in table {
            assert_eq!(special(ply, phase), id, "ply {ply}, phase {phase}");
        }
    }

    /// The player turns, from 1 to 30, at the end of which a train is announced and a train
    /// passes, and the most trains announced at once, for a fight held in `phase`.
    fn schedule(phase: usize) -> (Vec<u32>, Vec<u32>, usize) {
        let mut b = railyard_start(5).game().board().clone();
        let (mut announced, mut passed, mut most) = (Vec::new(), Vec::new(), 0);
        for n in 1..=30u32 {
            let before = b.trains().to_vec();
            b = hook(&b, special(2 * n - 1, phase).unwrap(), u64::from(n));
            if before.iter().any(|&(_, left)| left == 1) {
                passed.push(n);
            }
            if b.trains().iter().any(|&(_, left)| left == RAILYARD_LEAD) {
                announced.push(n);
            }
            most = most.max(b.trains().len());
        }
        (announced, passed, most)
    }

    #[test]
    fn the_first_train_is_announced_on_turn_2_then_every_10_5_or_3_turns() {
        let (announced, passed, most) = schedule(0);
        assert_eq!(announced, vec![1, 10, 20, 30]);
        assert_eq!(passed, vec![6, 15, 25]);
        assert_eq!(most, 1);
        let (announced, passed, most) = schedule(1);
        assert_eq!(announced, vec![1, 5, 10, 15, 20, 25, 30]);
        assert_eq!(passed, vec![6, 10, 15, 20, 25, 30]);
        assert_eq!(most, 2, "the first train and the turn 5 one");
        let (announced, passed, most) = schedule(2);
        assert_eq!(
            announced,
            [vec![1], (1..=10).map(|k| 3 * k).collect()].concat()
        );
        assert_eq!(passed, vec![6, 8, 11, 14, 17, 20, 23, 26, 29]);
        assert_eq!(most, 2, "two trains, never passing on the same turn");
    }

    #[test]
    fn a_new_train_never_takes_a_line_already_announced_but_lines_may_cross() {
        let two = board(&[], &[], &[(2 * ROW, 3), (2 * COLUMN + 1, 1)]);
        let mut picked = Vec::new();
        for seed in 0..300 {
            let out = hook(&two, RAILYARD_ANNOUNCE, seed);
            let new = out.trains()[1];
            assert_eq!(out.trains()[0], (2 * ROW, 2), "the other counts down");
            assert_eq!(new.1, RAILYARD_LEAD);
            assert_eq!(out.trains().len(), 2, "the train on 1 passed");
            assert_ne!(new.0 / 2, ROW, "seed {seed}");
            picked.push(new.0);
        }
        picked.sort_unstable();
        picked.dedup();
        assert!(picked.len() > 40, "the seed spreads the tracks");
        assert!(
            picked.contains(&(2 * COLUMN)),
            "the line that just passed is free again"
        );
        assert!(
            picked.contains(&(2 * DIAGONAL + 1)),
            "a line that crosses the row"
        );
        let one = board(&[], &[], &[(2 * DIAGONAL, 2)]);
        for seed in 0..300 {
            let new = hook(&one, RAILYARD_ANNOUNCE, seed).trains()[1];
            assert_ne!(new.0 / 2, DIAGONAL, "seed {seed}");
        }
    }

    #[test]
    fn a_pass_ejects_every_marble_on_its_line_either_side_and_credits_the_other_side() {
        let black = [(0, 2), (0, 4), (1, 2)];
        let white = [(0, -3), (0, -1), (0, 0), (-1, -1)];
        let start = board(&black, &white, &[(2 * COLUMN, 1), (2 * ROW, 3)]);
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(1, 2)], Direction::E)).unwrap();
        let b = enc.game().board();
        assert!(line_cells(COLUMN)
            .iter()
            .all(|&(q, r)| b.get(q, r) == Some(Cell::Empty)));
        assert_eq!(b.get(2, 2), Some(Cell::Black), "off the line");
        assert_eq!(b.get(-1, -1), Some(Cell::White), "off the line");
        assert_eq!(set_trains(&enc), vec![(2 * ROW, 2)]);
        assert_eq!(
            enc.game().ejected(Player::Black),
            3,
            "3 boss marbles count for you"
        );
        assert_eq!(
            enc.game().ejected(Player::White),
            2,
            "2 of yours for the boss"
        );
        assert_eq!((blacks(&enc), whites(&enc)), (1, 1));
    }

    #[test]
    fn a_marble_moved_onto_the_line_is_ejected_and_one_moved_off_is_safe() {
        let start = board(&[(1, 1), (0, 3)], &[(0, -2)], &[(2 * COLUMN + 1, 1)]);
        let mut enc = fight(start.clone(), Player::Black, [0, 0]);
        enc.play(&mv(&[(1, 1)], Direction::W)).unwrap();
        assert_eq!(blacks(&enc), 0, "onto the line, and the one left on it");
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(0, 3)], Direction::E)).unwrap();
        assert_eq!(blacks(&enc), 2, "moved off in time");
        assert_eq!(enc.game().ejected(Player::Black), 1);
    }

    #[test]
    fn a_boss_turn_counts_nothing_down() {
        let start = board(&[(2, 2)], &[(0, 0), (-3, -1)], &[(2 * ROW, 2)]);
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(2, 2)], Direction::NW)).unwrap();
        assert_eq!(set_trains(&enc), vec![(2 * ROW, 1)]);
        enc.play(&mv(&[(-3, -1)], Direction::E)).unwrap();
        assert_eq!(set_trains(&enc), vec![(2 * ROW, 1)], "the boss turn");
        assert_eq!(whites(&enc), 2);
    }

    #[test]
    fn crossing_trains_pass_on_their_own_turns() {
        let start = board(
            &[(0, 2), (2, 2)],
            &[(0, 0), (2, 0), (-3, -1)],
            &[(2 * ROW, 1), (2 * COLUMN, 3)],
        );
        let mut enc = fight(start, Player::Black, [0, 0]);
        enc.play(&mv(&[(2, 2)], Direction::NW)).unwrap();
        assert_eq!(set_trains(&enc), vec![(2 * COLUMN, 2)]);
        let b = enc.game().board();
        assert_eq!(
            (b.get(0, 0), b.get(2, 0)),
            (Some(Cell::Empty), Some(Cell::Empty))
        );
        assert_eq!(
            b.get(0, 2),
            Some(Cell::Black),
            "on the column, still waiting"
        );
        enc.play(&mv(&[(-3, -1)], Direction::E)).unwrap();
        enc.play(&mv(&[(2, 1)], Direction::NW)).unwrap();
        enc.play(&mv(&[(-2, -1)], Direction::E)).unwrap();
        assert_eq!(set_trains(&enc)[0], (2 * COLUMN, 1));
        enc.play(&mv(&[(2, 0)], Direction::SE)).unwrap();
        assert!(set_trains(&enc).is_empty(), "passed");
        assert_eq!(enc.game().board().get(0, 2), Some(Cell::Empty));
        assert_eq!(enc.game().ejected(Player::White), 1);
    }

    #[test]
    fn the_phase_changes_after_3_and_5_ejections_by_the_player() {
        // A train on the diagonal, 5 turns out: 3 marbles of each side sit on it.
        let mut start = Board::standard();
        start.set_trains(vec![(2 * DIAGONAL, RAILYARD_LEAD)]);
        let game = Game::from_position(start, Player::Black, [0, 0]);
        let mut enc = Encounter::new(game, railyard_boss(), 1);
        for _ in 0..8 {
            quiet(&mut enc);
            assert_eq!(enc.phase(), 0);
        }
        quiet(&mut enc);
        assert_eq!(enc.game().history().len(), 9, "after the player's 5th move");
        assert_eq!(enc.game().ejected(Player::Black), 3);
        assert_eq!(enc.game().ejected(Player::White), 3);
        assert_eq!(enc.phase(), 1, "P2 after 3 ejections");
        let mut b = Board::standard();
        for c in [(0, -4), (1, -4), (2, -4)] {
            b.set(c.0, c.1, Cell::Empty);
        }
        b.set_trains(vec![(2 * COLUMN, 1)]);
        assert_eq!(
            fight(b.clone(), Player::Black, [0, 0]).phase(),
            0,
            "the ejections count"
        );
        let mut enc = fight(b, Player::Black, [3, 0]);
        assert_eq!(enc.phase(), 1);
        enc.play(&mv(&[(-1, 2)], Direction::NW)).unwrap();
        assert_eq!(enc.game().ejected(Player::Black), 5, "(0, -3) and (0, -2)");
        assert_eq!(enc.phase(), 2, "P3 after 5");
    }

    #[test]
    fn a_pass_can_win_or_lose_the_fight() {
        let start = board(&[(2, 2)], &[(0, 0), (-3, -1)], &[(2 * ROW, 1)]);
        let mut enc = fight(start, Player::Black, [5, 0]);
        enc.play(&mv(&[(2, 2)], Direction::NW)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Won));
        let start = board(&[(1, 0), (2, 2)], &[(0, 0), (-3, -1)], &[(2 * ROW, 1)]);
        let mut enc = fight(start, Player::Black, [5, 5]);
        enc.play(&mv(&[(2, 2)], Direction::NW)).unwrap();
        assert_eq!(
            enc.result(),
            Some(PveResult::Lost),
            "both at 6: the boss first"
        );
    }

    /// The trains and the board after each ply of first legal moves from `seed`, up to 40 or
    /// the end of the fight.
    fn yard(seed: u64) -> Vec<(Vec<Train>, Board)> {
        let mut enc = railyard_start(seed);
        (0..40)
            .map_while(|_| {
                let game = enc.game();
                let m = legal_moves(game.board(), game.to_move()).swap_remove(0);
                enc.play(&m).ok()?;
                Some((trains(&enc), enc.game().board().clone()))
            })
            .collect()
    }

    #[test]
    fn the_same_seed_and_moves_run_the_same_trains_and_the_seed_matters() {
        assert_eq!(yard(11), yard(11));
        assert!(yard(11).len() > 12, "past the second train");
        let runs: Vec<_> = (0..8).map(yard).collect();
        assert!(
            runs.iter().any(|r| *r != runs[0]),
            "the seed picks the tracks"
        );
    }

    #[test]
    fn the_boss_steps_off_an_announced_line_and_never_onto_one() {
        let on = board(&[(-4, 4)], &[(0, 0)], &[(2 * ROW, 1)]);
        let m = railyard_move(&fight(on, Player::White, [0, 0])).unwrap();
        assert_ne!(m.dir.vector().1, 0, "off the row: {m:?}");
        let near = board(&[(-4, 4)], &[(0, -1)], &[(2 * ROW, 4)]);
        let m = railyard_move(&fight(near, Player::White, [0, 0])).unwrap();
        assert_ne!(
            m.cells[0].1 + m.dir.vector().1,
            0,
            "not onto the row: {m:?}"
        );
    }

    #[test]
    fn a_train_five_turns_out_does_not_stop_the_boss_from_winning_but_one_about_to_pass_does() {
        // White pushes the black marble on (4, -4) off for its 6th ejection, ending on line 0.
        let start = |left| {
            board(
                &[(4, -4), (-2, 2)],
                &[(2, -4), (3, -4), (0, 0)],
                &[(0, left)],
            )
        };
        let win = mv(&[(2, -4), (3, -4)], Direction::E);
        let far = railyard_move(&fight(start(RAILYARD_LEAD), Player::White, [0, 5])).unwrap();
        assert_eq!(far, win, "the train is far: take the win");
        let near = railyard_move(&fight(start(1), Player::White, [0, 5])).unwrap();
        assert_eq!(near, win, "a win ends the fight before the train passes");
        let near = railyard_move(&fight(start(1), Player::White, [0, 0])).unwrap();
        assert_ne!(near, win, "no win to take: leave the line the train sweeps");
    }

    #[test]
    fn the_boss_replies_only_on_its_turn() {
        let mut enc = railyard_start(0);
        assert_eq!(railyard_move(&enc), None);
        quiet(&mut enc);
        let m = railyard_move(&enc).unwrap();
        assert!(legal_moves(enc.game().board(), Player::White).contains(&m));
    }
}
