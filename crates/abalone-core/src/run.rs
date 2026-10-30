//! Rogue-lite run (docs/specs/roguelite.md): the map of a run from its seed, and the fight of an
//! army that lost marbles in the fights before.

use crate::game::Game;

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

/// The map of the run `seed`: act by act, row by row, column ascending.
pub fn run_map(_seed: u64) -> Vec<Node> {
    unimplemented!()
}

/// A fight of an army of `army` marbles (clamped to `MIN_ARMY..=FULL_ARMY`) against the bot.
pub fn army_game(_army: u8) -> Game {
    unimplemented!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Board, Cell};
    use crate::moves::Player;

    fn row(map: &[Node], act: usize, row: usize) -> Vec<&Node> {
        map.iter().filter(|n| n.act == act && n.row == row).collect()
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
        assert!(map.windows(2).all(|w| (w[0].act, w[0].row, w[0].col) < (w[1].act, w[1].row, w[1].col)));
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
