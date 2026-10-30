//! Rogue-lite run (docs/specs/roguelite.md): the map of a run from its seed, and the fight of an
//! army that lost marbles in the fights before.

use crate::board::{Board, Cell, STANDARD_BLACK};
use crate::encounter::hull::mix;
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

/// What a node of the map holds. Elites, rests and events come with later slices.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NodeKind {
    Fight,
    Boss,
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
            let kind = if row < FIGHT_ROWS {
                NodeKind::Fight
            } else {
                NodeKind::Boss
            };
            let out = match widths.get(row + 1) {
                Some(&next) => links(widths[row], next, &mut state),
                None => vec![Vec::new()],
            };
            map.extend(out.into_iter().enumerate().map(|(col, links)| Node {
                act,
                row,
                col,
                kind,
                links,
            }));
        }
    }
    map
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
                assert!(nodes.iter().all(|n| n.kind == NodeKind::Fight));
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
    fn paths_branch() {
        let map = run_map(3);
        assert!(map.iter().any(|n| n.links.len() > 1));
    }

    #[test]
    fn a_full_army_is_the_standard_game() {
        let game = army_game(FULL_ARMY);
        assert_eq!(game.board(), Game::new().board());
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
