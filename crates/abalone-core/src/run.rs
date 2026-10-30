//! Rogue-lite run (docs/specs/roguelite.md): the map of a run from its seed, the fight of an
//! army that lost marbles in the fights before, and its special marbles.

use crate::board::{Board, Cell, Special, STANDARD_BLACK};
use crate::encounter::hull::{mix, NEIGHBOURS};
use crate::encounter::marbles;
use crate::game::{Game, WIN_EJECTIONS};
use crate::moves::Player;

/// Acts of a run, each ending on its boss node.
pub const ACTS: usize = 3;
/// Rows of fight nodes in an act, before its boss row.
pub const FIGHT_ROWS: usize = 3;
/// Marbles of the army at the start of a run: the standard layout.
pub const FULL_ARMY: u8 = 14;
/// Below this many marbles the run is over.
pub const MIN_ARMY: u8 = 4;

/// What a node of the map holds (docs/specs/roguelite.md section 2).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NodeKind {
    Fight,
    Boss,
    Elite,
    Rest,
    Event,
}

/// One node of the map. `links` are the columns of the next row of the same act it leads to,
/// ascending; a boss node has none (it leads to the first row of the next act).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Node {
    pub act: usize,
    pub row: usize,
    pub col: usize,
    pub kind: NodeKind,
    pub links: Vec<usize>,
}

/// The next splitmix64 draw of `state`.
fn draw(state: &mut u64) -> u64 {
    *state = mix(*state);
    *state
}

/// The links from a row of `from` nodes to a row of `to` nodes: a walk from the first pair to the
/// last that steps one row, the other or both at random, so every node leads on, every node of the
/// next row is reached and no two paths cross.
fn links(from: usize, to: usize, state: &mut u64) -> Vec<Vec<usize>> {
    let mut out = vec![Vec::new(); from];
    let (mut i, mut j) = (0, 0);
    out[0].push(0);
    while i + 1 < from || j + 1 < to {
        let step = match (i + 1 < from, j + 1 < to) {
            (true, true) => draw(state) % 3,
            (true, false) => 0,
            _ => 1,
        };
        i += usize::from(step != 1);
        j += usize::from(step != 0);
        out[i].push(j);
    }
    out
}

/// The kinds a node after the first row of an act draws from, equally likely.
const DRAWN: [NodeKind; 6] = [
    NodeKind::Fight,
    NodeKind::Fight,
    NodeKind::Elite,
    NodeKind::Event,
    NodeKind::Event,
    NodeKind::Rest,
];

/// The kind of node `index` of the map of `seed` on `row` of its act: the first row fights, the
/// boss row its boss, the others drawn from `DRAWN`. Its own draw, apart from the map's shape, so
/// the shape stays the one of the runs saved before the kinds (#800).
fn kind(seed: u64, index: usize, row: usize) -> NodeKind {
    match row {
        0 => NodeKind::Fight,
        FIGHT_ROWS => NodeKind::Boss,
        _ => DRAWN[(mix(seed ^ mix(index as u64)) % DRAWN.len() as u64) as usize],
    }
}

/// The map of the run `seed`: act by act, row by row, column ascending. A fight row has 2 to 4
/// nodes, the boss row one.
pub fn run_map(seed: u64) -> Vec<Node> {
    let mut state = seed;
    let mut map = Vec::new();
    for act in 0..ACTS {
        let mut widths: Vec<usize> = (0..FIGHT_ROWS)
            .map(|_| 2 + (draw(&mut state) % 3) as usize)
            .collect();
        widths.push(1);
        for row in 0..=FIGHT_ROWS {
            let out = match widths.get(row + 1) {
                Some(&next) => links(widths[row], next, &mut state),
                None => vec![Vec::new()],
            };
            let first = map.len();
            map.extend(out.into_iter().enumerate().map(|(col, links)| Node {
                act,
                row,
                col,
                kind: kind(seed, first + col, row),
                links,
            }));
        }
    }
    map
}

/// The special marbles of `next`, the board after a push of `board` that moved the marbles on
/// `moved` one step along `d` and threw the one on `off` off the board: the marks follow their
/// marbles, and an ejected Spark bursts (docs/specs/roguelite.md section 5).
pub(crate) fn carry_specials(
    board: &Board,
    next: &mut Board,
    moved: &[(i32, i32)],
    (dq, dr): (i32, i32),
    off: Option<(i32, i32)>,
) {
    let mut specials: Vec<_> = board
        .specials()
        .iter()
        .filter(|s| Some(s.0) != off)
        .map(|&((q, r), kind)| {
            if moved.contains(&(q, r)) {
                ((q + dq, r + dr), kind)
            } else {
                ((q, r), kind)
            }
        })
        .collect();
    if let Some(spark) = off.filter(|&c| board.special(c) == Some(Special::Spark)) {
        burst(next, &mut specials, spark);
    }
    specials.sort_by_key(|s| s.0);
    next.set_specials(specials);
}

/// A Spark's burst from its last cell: each marble next to it moves one cell straight away from
/// it, stays when that cell holds a marble, and goes off the board when there is none, unless it
/// is an Anchor. A Spark it throws off does not burst. The order, by cell, changes nothing: no
/// two neighbours aim at the same cell.
fn burst(next: &mut Board, specials: &mut Vec<((i32, i32), Special)>, (sq, sr): (i32, i32)) {
    let mut away = NEIGHBOURS;
    away.sort();
    for (dq, dr) in away {
        let (q, r) = (sq + dq, sr + dr);
        let Some(marble @ (Cell::Black | Cell::White)) = next.get(q, r) else {
            continue;
        };
        let mark = specials.iter().position(|s| s.0 == (q, r));
        let to = (q + dq, r + dr);
        match next.get(to.0, to.1) {
            Some(Cell::Empty) => {
                next.set(to.0, to.1, marble);
                if let Some(i) = mark {
                    specials[i].0 = to;
                }
            }
            None if mark.map(|i| specials[i].1) != Some(Special::Anchor) => {
                if let Some(i) = mark {
                    specials.remove(i);
                }
            }
            _ => continue,
        }
        next.set(q, r, Cell::Empty);
    }
}

/// The ejections a ply credits to Black and to White, `ejected` being whether the push of `mover`
/// threw a marble off `before`, giving `after`. On a rogue-lite board a Spark's burst can throw
/// more off, of both colours: each marble gone counts for the opponent of its colour.
pub fn credits(before: &Board, mover: Player, ejected: bool, after: &Board) -> [u8; 2] {
    if ejected && before.rogue_lite() {
        return [Cell::White, Cell::Black].map(|c| marbles(before, c) - marbles(after, c));
    }
    let mut credits = [0, 0];
    credits[usize::from(mover == Player::White)] = u8::from(ejected);
    credits
}

/// A fight of an army of `army` marbles (clamped to `MIN_ARMY..=FULL_ARMY`) against the bot, on
/// the standard layout less the missing marbles, back row first. The bot wins once the army is
/// down to 3 marbles, which ends the run; the army wins at the usual 6 ejections.
pub fn army_game(army: u8) -> Game {
    let army = army.clamp(MIN_ARMY, FULL_ARMY);
    let mut board = Board::standard();
    for &(q, r) in &STANDARD_BLACK[..usize::from(FULL_ARMY - army)] {
        board.set(q, r, Cell::Empty);
    }
    board.set_rogue_lite();
    Game::from_position(board, Player::Black, [0, 0])
        .with_win([WIN_EJECTIONS, (army - (MIN_ARMY - 1)).min(WIN_EJECTIONS)])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Board, Cell};
    use crate::moves::Player;

    fn row(map: &[Node], act: usize, row: usize) -> Vec<&Node> {
        map.iter()
            .filter(|n| n.act == act && n.row == row)
            .collect()
    }

    fn count(board: &Board, cell: Cell) -> usize {
        (-4..=4)
            .flat_map(|q| (-4..=4).map(move |r| (q, r)))
            .filter(|&(q, r)| board.get(q, r) == Some(cell))
            .count()
    }

    #[test]
    fn three_acts_of_three_fight_rows_then_one_boss() {
        let map = run_map(7);
        for act in 0..ACTS {
            for r in 0..FIGHT_ROWS {
                let nodes = row(&map, act, r);
                assert!((2..=4).contains(&nodes.len()), "act {act} row {r}");
                assert!(nodes.iter().all(|n| n.kind != NodeKind::Boss));
                let cols: Vec<usize> = nodes.iter().map(|n| n.col).collect();
                assert_eq!(cols, (0..nodes.len()).collect::<Vec<_>>());
            }
            let boss = row(&map, act, FIGHT_ROWS);
            assert_eq!(boss.len(), 1);
            assert_eq!(boss[0].kind, NodeKind::Boss);
            assert!(boss[0].links.is_empty());
        }
        assert_eq!(map.len(), map.iter().filter(|n| n.act < ACTS).count());
        assert!(map
            .windows(2)
            .all(|w| (w[0].act, w[0].row, w[0].col) < (w[1].act, w[1].row, w[1].col)));
    }

    #[test]
    fn the_same_seed_gives_the_same_map_and_another_seed_another() {
        assert_eq!(run_map(42), run_map(42));
        assert!((0..8).any(|s| run_map(s) != run_map(42)));
    }

    #[test]
    fn every_node_leads_on_and_is_reached_without_crossing_paths() {
        for seed in 0..200 {
            let map = run_map(seed);
            for act in 0..ACTS {
                for r in 0..FIGHT_ROWS {
                    let next = row(&map, act, r + 1).len();
                    let mut reached = vec![false; next];
                    let mut last = 0;
                    for node in row(&map, act, r) {
                        assert!(!node.links.is_empty(), "seed {seed}");
                        assert!(node.links.windows(2).all(|w| w[0] < w[1]));
                        assert!(node.links[0] >= last, "crossing, seed {seed}");
                        last = *node.links.last().unwrap();
                        for &c in &node.links {
                            reached[c] = true;
                        }
                    }
                    assert!(reached.iter().all(|&r| r), "seed {seed}");
                }
            }
        }
    }

    #[test]
    fn an_act_opens_on_fights_then_mixes_elites_rests_and_events() {
        let mut seen = Vec::new();
        for seed in 0..50 {
            let map = run_map(seed);
            for act in 0..ACTS {
                assert!(row(&map, act, 0).iter().all(|n| n.kind == NodeKind::Fight));
            }
            for node in map.iter().filter(|n| n.row > 0 && n.row < FIGHT_ROWS) {
                if !seen.contains(&node.kind) {
                    seen.push(node.kind);
                }
            }
        }
        seen.sort_by_key(|k| *k as u8);
        use NodeKind::*;
        assert_eq!(seen, [Fight, Elite, Rest, Event]);
    }

    #[test]
    fn the_node_kinds_leave_the_shape_of_the_map_of_slice_1() {
        // Computed on main before #800: the acts, rows, columns and links of 50 seeds, so a run
        // saved before the elites, rests and events still walks its map.
        let mut digest = 0u64;
        for seed in 0..50 {
            for n in run_map(seed) {
                digest = mix(digest ^ (n.act * 1000 + n.row * 100 + n.col) as u64);
                for l in n.links {
                    digest = mix(digest ^ l as u64);
                }
            }
        }
        assert_eq!(digest, 4066793024634845041);
    }

    #[test]
    fn paths_branch() {
        let map = run_map(3);
        assert!(map.iter().any(|n| n.links.len() > 1));
    }

    #[test]
    fn a_full_army_is_the_standard_game() {
        let game = army_game(FULL_ARMY);
        let mut standard = Board::standard();
        standard.set_rogue_lite();
        assert_eq!(game.board(), &standard);
        assert_eq!(game.to_move(), Player::Black);
        assert_eq!(game.win_ejections(Player::Black), 6);
        assert_eq!(game.win_ejections(Player::White), 6);
        assert!(game.outcome().is_none());
    }

    #[test]
    fn a_smaller_army_keeps_its_front_marbles_and_loses_below_four() {
        let game = army_game(9);
        assert_eq!(count(game.board(), Cell::Black), 9);
        assert_eq!(count(game.board(), Cell::White), 14);
        assert_eq!(game.board().get(-4, 4), Some(Cell::Empty)); // the back row goes first
        assert_eq!(game.board().get(0, 2), Some(Cell::Black));
        assert_eq!(game.win_ejections(Player::White), 6);
        assert_eq!(game.win_ejections(Player::Black), 6);
        assert_eq!(army_game(7).win_ejections(Player::White), 4); // 3 marbles left lose the run
        assert_eq!(army_game(MIN_ARMY).win_ejections(Player::White), 1);
    }

    #[test]
    fn the_army_is_clamped() {
        assert_eq!(army_game(0).board(), army_game(MIN_ARMY).board());
        assert_eq!(army_game(99).board(), army_game(FULL_ARMY).board());
    }
}

#[cfg(test)]
mod plain_games {
    use crate::encounter::hull::mix;
    use crate::game::Game;
    use crate::moves::legal_moves;
    use crate::search::best_move;

    /// A digest of 24 seeded games of 60 plies, a random legal move and a bot move in turn, on
    /// the plain rules: the history hashes, the ejections and the outcome of each.
    fn digest() -> u64 {
        let mut digest = 0;
        for seed in 0..24u64 {
            let mut game = Game::new();
            let mut state = seed;
            for ply in 0..60 {
                if game.outcome().is_some() {
                    break;
                }
                let mv = if ply % 2 == 0 {
                    state = mix(state);
                    let moves = legal_moves(game.board(), game.to_move());
                    moves[(state % moves.len() as u64) as usize].clone()
                } else {
                    best_move(&game, 60).expect("a running game has a move")
                };
                game.play(&mv).expect("a legal move");
            }
            for played in game.history() {
                digest = mix(digest ^ played.hash);
            }
            let [black, white] = [crate::moves::Player::Black, crate::moves::Player::White]
                .map(|p| u64::from(game.ejected(p)));
            digest =
                mix(digest ^ black ^ (white << 8) ^ (u64::from(game.outcome().is_some()) << 16));
        }
        digest
    }

    #[test]
    fn plain_games_are_bit_for_bit_the_games_before_the_special_marbles() {
        // Computed on main before #799: any change to the plain rules, the credits or the search
        // moves it.
        assert_eq!(digest(), 1811593443741359660);
    }
}

#[cfg(test)]
mod special_marbles {
    use super::*;
    use crate::board::{PlaceError, Special};
    use crate::encounter::hull::mix;
    use crate::game::Outcome;
    use crate::moves::Direction::{self, E, NE, SE};
    use crate::moves::{apply, legal_moves, Move, MoveError};
    use crate::search::{best_move, search};

    type P = (i32, i32);
    use Special::{Anchor, Heavy, Spark};

    /// A rogue-lite board: Black and White marbles, then the special ones among them.
    fn board(black: &[P], white: &[P], specials: &[(P, Special)]) -> Board {
        let mut b = Board::empty();
        b.set_rogue_lite();
        for &(q, r) in black {
            b.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            b.set(q, r, Cell::White);
        }
        for &(cell, kind) in specials {
            b.place_special(cell, kind).unwrap();
        }
        b
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    fn cells(b: &Board, cell: Cell) -> Vec<P> {
        let mut v: Vec<P> = (-4..=4)
            .flat_map(|q| (-4..=4).map(move |r| (q, r)))
            .filter(|&(q, r)| b.get(q, r) == Some(cell))
            .collect();
        v.sort();
        v
    }

    fn black_plays(b: &Board, m: &Move) -> Result<Board, MoveError> {
        apply(b, Player::Black, m).map(|(b, _)| b)
    }

    #[test]
    fn specials_are_placed_only_on_a_marble_of_a_rogue_lite_board_in_cell_order() {
        let mut plain = Board::standard();
        assert_eq!(
            plain.place_special((0, 4), Heavy),
            Err(PlaceError::NotRogueLite)
        );
        assert!(!plain.rogue_lite() && plain.specials().is_empty());
        let mut b = Board::standard();
        b.set_rogue_lite();
        assert!(b.rogue_lite() && b.specials().is_empty());
        assert_eq!(b.place_special((0, 0), Heavy), Err(PlaceError::NoMarble));
        assert_eq!(b.place_special((9, 0), Heavy), Err(PlaceError::NoMarble));
        b.place_special((0, 4), Spark).unwrap();
        b.place_special((-4, 4), Heavy).unwrap();
        b.place_special((0, -4), Anchor).unwrap(); // a White marble may be one too
        b.place_special((0, 4), Anchor).unwrap(); // in place of the Spark
        assert_eq!(
            b.specials(),
            [((-4, 4), Heavy), ((0, -4), Anchor), ((0, 4), Anchor)]
        );
        assert_eq!(b.special((0, 4)), Some(Anchor));
        assert_eq!(b.special((0, 3)), None);
    }

    #[test]
    fn a_fight_places_its_specials_before_its_first_move_only() {
        let mut game = army_game(FULL_ARMY);
        assert!(game.board().rogue_lite(), "the army's fight has the flag");
        assert_eq!(game.place_special((0, 2), Heavy), Ok(()));
        assert_eq!(game.board().special((0, 2)), Some(Heavy));
        let first = legal_moves(game.board(), Player::Black)[0].clone();
        game.play(&first).unwrap();
        assert_eq!(game.place_special((0, 4), Spark), Err(PlaceError::Started));
        assert_eq!(
            Game::new().place_special((0, 4), Spark),
            Err(PlaceError::NotRogueLite)
        );
    }

    #[test]
    fn a_heavy_weighs_2_in_a_push_on_both_sides() {
        // A lone Heavy pushes a plain marble; a plain one cannot.
        let lone = mv(&[(0, 0)], E);
        let b = board(&[(0, 0)], &[(1, 0)], &[((0, 0), Heavy)]);
        let after = black_plays(&b, &lone).unwrap();
        assert_eq!(
            (cells(&after, Cell::Black), cells(&after, Cell::White)),
            (vec![(1, 0)], vec![(2, 0)])
        );
        assert_eq!(
            after.specials(),
            [((1, 0), Heavy)],
            "the mark moves with it"
        );
        assert_eq!(
            black_plays(&board(&[(0, 0)], &[(1, 0)], &[]), &lone),
            Err(MoveError::NotStrongEnough)
        );
        // Heavy + 1 (3) pushes 2 plain, not 3 (a tie); Heavy + 2 (4) pushes 3.
        let pair = mv(&[(-1, 0), (0, 0)], E);
        let b = board(&[(-1, 0), (0, 0)], &[(1, 0), (2, 0)], &[((-1, 0), Heavy)]);
        let after = black_plays(&b, &pair).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(2, 0), (3, 0)]);
        let three = [(1, 0), (2, 0), (3, 0)];
        let b = board(&[(-1, 0), (0, 0)], &three, &[((-1, 0), Heavy)]);
        assert_eq!(black_plays(&b, &pair), Err(MoveError::NotStrongEnough));
        let trio = mv(&[(-2, 0), (-1, 0), (0, 0)], E);
        let b = board(&[(-2, 0), (-1, 0), (0, 0)], &three, &[((-2, 0), Heavy)]);
        let after = black_plays(&b, &trio).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(2, 0), (3, 0), (4, 0)]);
        // 2 plain cannot push a White Heavy (2 against 2); 3 plain can, and it keeps its mark.
        let b = board(&[(0, 0), (1, 0)], &[(2, 0)], &[((2, 0), Heavy)]);
        assert_eq!(
            black_plays(&b, &mv(&[(0, 0), (1, 0)], E)),
            Err(MoveError::NotStrongEnough)
        );
        let b = board(&[(-1, 0), (0, 0), (1, 0)], &[(2, 0)], &[((2, 0), Heavy)]);
        let after = black_plays(&b, &mv(&[(-1, 0), (0, 0), (1, 0)], E)).unwrap();
        assert_eq!(after.specials(), [((3, 0), Heavy)]);
    }

    #[test]
    fn a_broadside_move_carries_the_marks_and_leaves_the_others() {
        let b = board(
            &[(0, 0), (1, 0), (-3, 3)],
            &[(4, -4)],
            &[((1, 0), Spark), ((-3, 3), Heavy)],
        );
        let after = black_plays(&b, &mv(&[(0, 0), (1, 0)], SE)).unwrap();
        assert_eq!(after.specials(), [((-3, 3), Heavy), ((1, 1), Spark)]);
    }

    #[test]
    fn an_anchor_is_never_pushed_off_but_is_pushed_along() {
        let push = mv(&[(2, 0), (3, 0)], E);
        let plain = board(&[(2, 0), (3, 0)], &[(4, 0)], &[]);
        assert!(legal_moves(&plain, Player::Black).contains(&push));
        assert!(apply(&plain, Player::Black, &push).unwrap().1);
        let anchored = board(&[(2, 0), (3, 0)], &[(4, 0)], &[((4, 0), Anchor)]);
        assert!(!legal_moves(&anchored, Player::Black).contains(&push));
        assert_eq!(black_plays(&anchored, &push), Err(MoveError::PushBlocked));
        // Along the board it moves with its mark.
        let b = board(&[(1, 0), (2, 0)], &[(3, 0)], &[((3, 0), Anchor)]);
        let after = black_plays(&b, &mv(&[(1, 0), (2, 0)], E)).unwrap();
        assert_eq!(after.specials(), [((4, 0), Anchor)]);
        // It shields itself only: the plain marble in front of it goes off.
        let trio = [(0, 0), (1, 0), (2, 0)];
        let b = board(&trio, &[(3, 0), (4, 0)], &[((3, 0), Anchor)]);
        let (after, ejected) = apply(&b, Player::Black, &mv(&trio, E)).unwrap();
        assert!(ejected);
        assert_eq!(cells(&after, Cell::White), vec![(4, 0)]);
        assert_eq!(after.specials(), [((4, 0), Anchor)]);
    }

    #[test]
    fn an_ejected_spark_pushes_each_neighbour_one_cell_away() {
        // The Spark goes off from (4,-2): its 4 neighbours on the board move away from it.
        let push = mv(&[(2, -2), (3, -2)], E);
        let b = board(
            &[(2, -2), (3, -2), (4, -1)],
            &[(4, -2), (4, -3), (3, -1)],
            &[((4, -2), Spark), ((4, -1), Heavy)],
        );
        let (after, ejected) = apply(&b, Player::Black, &push).unwrap();
        assert!(ejected);
        // The pusher left on (3,-2) goes back to (2,-2); the one on the Spark's cell stays.
        assert_eq!(cells(&after, Cell::Black), vec![(2, -2), (4, -2), (4, 0)]);
        assert_eq!(cells(&after, Cell::White), vec![(2, 0), (4, -4)]);
        assert_eq!(
            after.specials(),
            [((4, 0), Heavy)],
            "the Spark's mark is gone"
        );
        // The same push of a plain marble moves nobody else.
        let plain = board(
            &[(2, -2), (3, -2), (4, -1)],
            &[(4, -2), (4, -3), (3, -1)],
            &[],
        );
        let after = black_plays(&plain, &push).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(3, -1), (4, -3)]);
    }

    #[test]
    fn a_neighbour_whose_cell_away_is_taken_stays() {
        // (3,-1) has (2,0) behind it and stays; (4,-3) has (4,-4) free and moves.
        let b = board(
            &[(2, -2), (3, -2)],
            &[(4, -2), (3, -1), (2, 0), (4, -3)],
            &[((4, -2), Spark)],
        );
        let after = black_plays(&b, &mv(&[(2, -2), (3, -2)], E)).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(2, 0), (3, -1), (4, -4)]);
    }

    #[test]
    fn a_neighbour_at_the_rim_is_ejected_and_counts_for_the_opponent_of_its_colour() {
        // The Spark goes off from (4,-3): its neighbour (4,-4) goes off over the corner.
        let push = mv(&[(2, -3), (3, -3)], E);
        let b = board(
            &[(2, -3), (3, -3)],
            &[(4, -3), (4, -4), (-4, 4)],
            &[((4, -3), Spark)],
        );
        let mut game = Game::from_position(b, Player::Black, [0, 0]);
        game.play(&push).unwrap();
        assert_eq!(cells(game.board(), Cell::White), vec![(-4, 4)]);
        assert_eq!(
            (game.ejected(Player::Black), game.ejected(Player::White)),
            (2, 0)
        );
        assert_eq!(game.no_ejection_plies(), 0);
        // A Black marble the burst throws off counts for White.
        let b = board(
            &[(2, -3), (3, -3), (4, -4)],
            &[(4, -3), (-4, 4)],
            &[((4, -3), Spark)],
        );
        let mut game = Game::from_position(b, Player::Black, [0, 0]);
        game.play(&push).unwrap();
        assert_eq!(cells(game.board(), Cell::Black), vec![(2, -3), (4, -3)]);
        assert_eq!(
            (game.ejected(Player::Black), game.ejected(Player::White)),
            (1, 1)
        );
        assert_eq!(game.outcome(), None);
    }

    #[test]
    fn a_burst_that_throws_the_pushers_own_marble_off_can_lose_the_fight() {
        let push = mv(&[(2, -3), (3, -3)], E);
        let b = board(
            &[(2, -3), (3, -3), (4, -4)],
            &[(4, -3), (-4, 4)],
            &[((4, -3), Spark)],
        );
        let mut game = Game::from_position(b.clone(), Player::Black, [0, 5]);
        game.play(&push).unwrap();
        assert_eq!(game.outcome(), Some(Outcome::Win(Player::White)));
        // When both reach their count on the same ply, the pusher wins.
        let mut game = Game::from_position(b, Player::Black, [5, 5]);
        game.play(&push).unwrap();
        assert_eq!(game.outcome(), Some(Outcome::Win(Player::Black)));
    }

    #[test]
    fn a_spark_thrown_off_by_a_burst_does_not_burst_and_an_anchor_stays() {
        let push = mv(&[(2, -3), (3, -3)], E);
        // (4,-4) is a Spark too: it goes off, and its own neighbour (3,-4) stays.
        let b = board(
            &[(2, -3), (3, -3)],
            &[(4, -3), (4, -4), (3, -4)],
            &[((4, -3), Spark), ((4, -4), Spark)],
        );
        let after = black_plays(&b, &push).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(3, -4)]);
        assert!(after.specials().is_empty());
        // An Anchor at the rim stays where it is.
        let b = board(
            &[(2, -3), (3, -3)],
            &[(4, -3), (4, -4)],
            &[((4, -3), Spark), ((4, -4), Anchor)],
        );
        let after = black_plays(&b, &push).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(4, -4)]);
        assert_eq!(after.specials(), [((4, -4), Anchor)]);
    }

    /// Black around White's pair on (2,0) and (3,0); (4,0) is the end of the row.
    const LOCK: [P; 9] = [
        (4, 0),
        (1, 0),
        (0, 0),
        (2, -1),
        (3, -1),
        (4, -2),
        (1, 1),
        (2, 1),
        (3, 1),
    ];

    /// White's pair can only push the Black Anchor on (4,0) off, once Black fills (4,-1).
    fn locked() -> Board {
        board(&LOCK, &[(2, 0), (3, 0)], &[((4, 0), Anchor)])
    }

    #[test]
    fn a_side_left_with_no_legal_move_loses_the_fight() {
        let fill = mv(&[(4, -2)], SE);
        let mut game = Game::from_position(locked(), Player::Black, [0, 0]);
        assert!(!legal_moves(game.board(), Player::White).is_empty());
        game.play(&fill).unwrap();
        assert!(legal_moves(game.board(), Player::White).is_empty());
        assert_eq!(game.outcome(), Some(Outcome::Win(Player::Black)));
        // With a plain marble on (4,0) White still has its push, and the fight goes on.
        let plain = board(&LOCK, &[(2, 0), (3, 0)], &[]);
        let mut game = Game::from_position(plain, Player::Black, [0, 0]);
        game.play(&fill).unwrap();
        assert_eq!(game.outcome(), None);
    }

    #[test]
    fn the_bot_sees_that_locking_the_opponent_wins() {
        let game = Game::from_position(locked(), Player::Black, [0, 0]);
        let found = search(&game, 4000).unwrap();
        assert_eq!(found.mv, mv(&[(4, -2)], SE));
        assert_eq!(found.score, crate::search::WIN - 1);
    }

    #[test]
    fn the_bot_never_pushes_an_anchor_off_even_for_the_win() {
        // Black needs one more ejection; the only push off the board is the Anchor's.
        let b = board(
            &[(2, 0), (3, 0), (-2, 2)],
            &[(4, 0), (-4, 0)],
            &[((4, 0), Anchor)],
        );
        let game = Game::from_position(b, Player::Black, [5, 0]);
        let found = best_move(&game, 3000).unwrap();
        assert_ne!(found, mv(&[(2, 0), (3, 0)], E));
        assert!(legal_moves(game.board(), Player::Black).contains(&found));
    }

    #[test]
    fn the_bot_takes_the_spark_whose_burst_clears_one_more_marble() {
        // Two pushes off the board: a plain marble on (4,1), or the Spark on (4,-3) whose burst
        // throws (4,-4) off too.
        let b = board(
            &[(2, -3), (3, -3), (2, 1), (3, 1)],
            &[(4, -3), (4, -4), (4, 1), (-4, 4), (-3, 4)],
            &[((4, -3), Spark)],
        );
        let mut game = Game::from_position(b, Player::Black, [0, 0]);
        let found = best_move(&game, 3000).unwrap();
        assert_eq!(found, mv(&[(2, -3), (3, -3)], E));
        game.play(&found).unwrap();
        assert_eq!(game.ejected(Player::Black), 2);
    }

    #[test]
    fn a_special_marble_is_part_of_the_position() {
        let first = mv(&[(0, 2)], NE);
        let mut plain = army_game(FULL_ARMY);
        let mut heavy = army_game(FULL_ARMY);
        heavy.place_special((-4, 4), Heavy).unwrap();
        plain.play(&first).unwrap();
        heavy.play(&first).unwrap();
        assert_ne!(plain.history()[0].hash, heavy.history()[0].hash);
    }

    #[test]
    fn the_same_fight_gives_the_same_burst_every_time() {
        let play = || {
            let b = board(
                &[(2, -2), (3, -2), (4, -1)],
                &[(4, -2), (4, -3), (3, -1)],
                &[((4, -2), Spark), ((4, -1), Heavy)],
            );
            let mut game = Game::from_position(b, Player::Black, [0, 0]);
            game.play(&mv(&[(2, -2), (3, -2)], E)).unwrap();
            game
        };
        let (a, b) = (play(), play());
        assert_eq!(a.board(), b.board());
        assert_eq!(a.history(), b.history());
    }

    /// Random positions reached by seeded random moves from the standard start.
    fn positions() -> Vec<(Board, Player)> {
        let mut out = Vec::new();
        for seed in 0..40u64 {
            let mut game = Game::new();
            let mut state = seed;
            for _ in 0..(seed % 30 + 10) {
                state = mix(state);
                let moves = legal_moves(game.board(), game.to_move());
                game.play(&moves[(state % moves.len() as u64) as usize])
                    .unwrap();
            }
            out.push((game.board().clone(), game.to_move()));
        }
        out
    }

    #[test]
    fn the_flag_alone_changes_no_move_and_no_credit() {
        for (plain, side) in positions() {
            let mut flagged = plain.clone();
            flagged.set_rogue_lite();
            let moves = legal_moves(&plain, side);
            assert_eq!(moves, legal_moves(&flagged, side));
            for m in &moves {
                let (a, ejected) = apply(&plain, side, m).unwrap();
                let (mut b, flagged_ejected) = apply(&flagged, side, m).unwrap();
                assert_eq!(ejected, flagged_ejected);
                assert_eq!(
                    credits(&plain, side, ejected, &a),
                    credits(&flagged, side, ejected, &b)
                );
                assert!(b.rogue_lite() && b.specials().is_empty());
                let mut unflagged = Board::empty();
                for (q, r) in (-4..=4).flat_map(|q| (-4..=4).map(move |r| (q, r))) {
                    unflagged.set(q, r, b.get(q, r).unwrap_or(Cell::Empty));
                }
                b = unflagged;
                assert_eq!(a, b);
            }
        }
    }
}

