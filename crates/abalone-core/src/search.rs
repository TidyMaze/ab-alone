//! Alpha-beta search with a hand-tuned evaluation (docs/specs/tech.md section 7).

use std::cmp::Reverse;

use crate::board::{Board, Cell, MAX_RADIUS};
use crate::game::Game;
use crate::moves::{apply, legal_moves, Move, Player};

/// Score of a won game, minus the ply it is won at, so a quicker win scores higher.
const WIN: i32 = 1_000_000;
const INF: i32 = 2 * WIN;
/// Iterative deepening stops here even with budget left (tiny positions).
const MAX_DEPTH: u32 = 12;

/// Evaluation weights, in centi-marbles. A boss swaps them for its own style.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Weights {
    pub marbles: i32,
    pub ejected: i32,
    pub centre: i32,
    pub cohesion: i32,
}

/// Hand-tuned weights of the plain search.
pub const DEFAULT_WEIGHTS: Weights = Weights {
    marbles: 100,
    ejected: 50,
    centre: 3,
    cohesion: 2,
};

/// What a search found.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SearchResult {
    pub mv: Move,
    /// Deepest iteration that finished, in plies. `0` when the budget ran out inside the first.
    pub depth: u32,
    /// Positions visited, never above the budget.
    pub nodes: u32,
}

/// A position inside the search: only what `legal_moves` and `apply` need, plus the score.
#[derive(Clone)]
struct Node {
    board: Board,
    to_move: Player,
    /// Opponent marbles ejected by Black and by White.
    ejected: [u8; 2],
}

struct Child {
    mv: Move,
    node: Node,
    ejects: bool,
    /// Static score for the side that just moved, used only to order siblings.
    score: i32,
}

fn other(player: Player) -> Player {
    match player {
        Player::Black => Player::White,
        Player::White => Player::Black,
    }
}

fn index(player: Player) -> usize {
    match player {
        Player::Black => 0,
        Player::White => 1,
    }
}

fn cell_of(player: Player) -> Cell {
    match player {
        Player::Black => Cell::Black,
        Player::White => Cell::White,
    }
}

/// Distance of a cell from the centre, in steps.
fn centre_distance(q: i32, r: i32) -> i32 {
    q.abs().max(r.abs()).max((q + r).abs())
}

/// Marbles, sum of centre distances and adjacent pairs of one colour.
fn shape(board: &Board, cell: Cell) -> (i32, i32, i32) {
    let (mut count, mut distance, mut pairs) = (0, 0, 0);
    for q in -MAX_RADIUS..=MAX_RADIUS {
        for r in -MAX_RADIUS..=MAX_RADIUS {
            if board.get(q, r) != Some(cell) {
                continue;
            }
            count += 1;
            distance += centre_distance(q, r);
            // E, NE and SE neighbours: every adjacent pair is counted once.
            pairs += [(1, 0), (1, -1), (0, 1)]
                .into_iter()
                .filter(|&(dq, dr)| board.get(q + dq, r + dr) == Some(cell))
                .count() as i32;
        }
    }
    (count, distance, pairs)
}

/// Score of a position for `player`: marble difference, ejections made, centrality (a lower
/// distance sum is better) and cohesion.
fn evaluate(board: &Board, player: Player, ejected: [u8; 2], w: &Weights) -> i32 {
    let (own_count, own_distance, own_pairs) = shape(board, cell_of(player));
    let (opp_count, opp_distance, opp_pairs) = shape(board, cell_of(other(player)));
    let made = i32::from(ejected[index(player)]) - i32::from(ejected[index(other(player))]);
    w.marbles * (own_count - opp_count)
        + w.ejected * made
        + w.centre * (opp_distance - own_distance)
        + w.cohesion * (own_pairs - opp_pairs)
}

/// Legal moves of the side to move, ejections first, then the best static score.
fn children(node: &Node, weights: &Weights) -> Vec<Child> {
    let mover = node.to_move;
    let mut kids: Vec<Child> = legal_moves(&node.board, mover)
        .into_iter()
        .map(|mv| {
            let (board, ejects) = apply(&node.board, mover, &mv).expect("legal move");
            let mut ejected = node.ejected;
            ejected[index(mover)] += u8::from(ejects);
            let score = evaluate(&board, mover, ejected, weights);
            let node = Node {
                board,
                to_move: other(mover),
                ejected,
            };
            Child {
                mv,
                node,
                ejects,
                score,
            }
        })
        .collect();
    // Stable sort: ties keep the generation order, so the search is deterministic.
    kids.sort_by_key(|k| (Reverse(k.ejects), Reverse(k.score)));
    kids
}

struct Searcher {
    weights: Weights,
    budget: u32,
    nodes: u32,
    /// Ejections each side needs to win, from the game: Black then White.
    win: [u8; 2],
}

impl Searcher {
    /// Counts one visited position. `false` once the budget is spent.
    fn visit(&mut self) -> bool {
        if self.nodes >= self.budget {
            return false;
        }
        self.nodes += 1;
        true
    }

    /// Negamax with alpha-beta cuts. `None` when the budget ran out inside.
    fn negamax(&mut self, node: &Node, depth: u32, ply: i32, alpha: i32, beta: i32) -> Option<i32> {
        if !self.visit() {
            return None;
        }
        let mover = node.to_move;
        if node.ejected[index(other(mover))] >= self.win[index(other(mover))] {
            return Some(ply - WIN);
        }
        if depth == 0 {
            return Some(evaluate(&node.board, mover, node.ejected, &self.weights));
        }
        let kids = children(node, &self.weights);
        if kids.is_empty() {
            return Some(evaluate(&node.board, mover, node.ejected, &self.weights));
        }
        let (mut best, mut alpha) = (-INF, alpha);
        for kid in &kids {
            let score = -self.negamax(&kid.node, depth - 1, ply + 1, -beta, -alpha)?;
            best = best.max(score);
            alpha = alpha.max(score);
            if alpha >= beta {
                break;
            }
        }
        Some(best)
    }

    /// Index of the best child at `depth`, `None` when the budget ran out inside.
    fn root(&mut self, kids: &[Child], depth: u32) -> Option<usize> {
        if !self.visit() {
            return None;
        }
        let (mut best, mut alpha) = (0, -INF);
        for (i, kid) in kids.iter().enumerate() {
            let score = -self.negamax(&kid.node, depth - 1, 1, -INF, -alpha)?;
            if score > alpha {
                (best, alpha) = (i, score);
            }
        }
        Some(best)
    }
}

/// Best move for the side to move, visiting at most `node_budget` positions. Iterative deepening:
/// the answer is the last iteration that finished, or the best-ordered move when none did. No
/// clock and no randomness: the same game and budget always give the same result.
pub fn search(game: &Game, node_budget: u32) -> Option<SearchResult> {
    search_with(game, node_budget, DEFAULT_WEIGHTS, &|_| true)
}

/// [`search`] with custom `weights` (used at every ply) and a filter on the moves the root may
/// choose. Deeper plies see every legal move.
pub fn search_with(
    game: &Game,
    node_budget: u32,
    weights: Weights,
    allow: &dyn Fn(&Move) -> bool,
) -> Option<SearchResult> {
    if game.outcome().is_some() {
        return None;
    }
    let root = Node {
        board: game.board().clone(),
        to_move: game.to_move(),
        ejected: [game.ejected(Player::Black), game.ejected(Player::White)],
    };
    let mut kids = children(&root, &weights);
    kids.retain(|k| allow(&k.mv));
    if kids.is_empty() {
        return None;
    }
    let mut searcher = Searcher {
        weights,
        budget: node_budget,
        nodes: 0,
        win: [
            game.win_ejections(Player::Black),
            game.win_ejections(Player::White),
        ],
    };
    let mut depth = 0;
    for d in 1..=MAX_DEPTH {
        let Some(best) = searcher.root(&kids, d) else {
            break;
        };
        // Search the previous best first next time: the strongest ordering there is.
        kids[..=best].rotate_right(1);
        depth = d;
    }
    Some(SearchResult {
        mv: kids.swap_remove(0).mv,
        depth,
        nodes: searcher.nodes,
    })
}

/// Same as [`search`], the move only.
pub fn best_move(game: &Game, node_budget: u32) -> Option<Move> {
    search(game, node_budget).map(|r| r.mv)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Board, Cell};
    use crate::game::{Outcome, WIN_EJECTIONS};
    use crate::moves::{apply, legal_moves, Direction, Player};

    type P = (i32, i32);

    #[test]
    fn a_win_comes_from_the_game_threshold_not_a_constant() {
        // Black has ejected 6: a standard game is lost for White, one won at 10 is not (the Choir).
        let node = Node {
            board: Board::standard(),
            to_move: Player::White,
            ejected: [6, 0],
        };
        let searcher = |win| Searcher {
            weights: DEFAULT_WEIGHTS,
            budget: 100,
            nodes: 0,
            win,
        };
        assert_eq!(
            searcher([WIN_EJECTIONS; 2]).negamax(&node, 0, 0, -INF, INF),
            Some(-WIN)
        );
        assert!(searcher([10, 6]).negamax(&node, 0, 0, -INF, INF).unwrap() > -WIN / 2);
        let game = Game::from_position(Board::standard(), Player::White, [6, 0]).with_win([10, 6]);
        assert!(
            search(&game, 300).is_some(),
            "the game runs, the boss searches"
        );
    }

    fn game_from(black: &[P], white: &[P], to_move: Player, ejected: [u8; 2]) -> Game {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        Game::from_position(board, to_move, ejected)
    }

    /// Black pair next to a lone White marble on the rim, Black one push from the sixth marble.
    fn winning_push() -> Game {
        game_from(&[(2, 0), (3, 0)], &[(4, 0)], Player::Black, [5, 0])
    }

    fn assert_legal(game: &Game, mv: &Move) {
        assert!(legal_moves(game.board(), game.to_move()).contains(mv));
        assert!(game.clone().play(mv).is_ok());
    }

    #[test]
    fn returns_a_legal_move_from_the_start() {
        let game = Game::new();
        let mv = best_move(&game, 500).expect("a move");
        assert_legal(&game, &mv);
    }

    #[test]
    fn returns_a_legal_move_for_white() {
        let mut game = Game::new();
        game.play(&legal_moves(game.board(), Player::Black)[0])
            .unwrap();
        let mv = best_move(&game, 500).expect("a move");
        assert_legal(&game, &mv);
    }

    #[test]
    fn same_position_same_move_every_time() {
        let first = best_move(&Game::new(), 3000);
        for _ in 0..3 {
            assert_eq!(best_move(&Game::new(), 3000), first);
        }
        assert_eq!(search(&Game::new(), 3000), search(&Game::new(), 3000));
    }

    #[test]
    fn takes_the_ejection_when_the_win_is_one_move_away() {
        let game = winning_push();
        let mv = best_move(&game, 500).expect("a move");
        assert_eq!(
            mv,
            Move {
                cells: vec![(2, 0), (3, 0)],
                dir: Direction::E
            }
        );
        let mut after = game.clone();
        after.play(&mv).unwrap();
        assert_eq!(after.outcome(), Some(Outcome::Win(Player::Black)));
    }

    #[test]
    fn takes_the_ejection_even_with_the_smallest_budget() {
        let mv = best_move(&winning_push(), 1).expect("a move");
        assert_legal(&winning_push(), &mv);
    }

    #[test]
    fn white_takes_its_ejection_too() {
        let game = game_from(&[(-4, 0)], &[(-2, 0), (-3, 0)], Player::White, [0, 5]);
        let mv = best_move(&game, 500).expect("a move");
        let mut after = game.clone();
        after.play(&mv).unwrap();
        assert_eq!(after.outcome(), Some(Outcome::Win(Player::White)));
    }

    #[test]
    fn never_plays_an_illegal_move_along_a_whole_game() {
        let mut game = Game::new();
        for _ in 0..12 {
            let mv = best_move(&game, 300).expect("a move");
            assert_legal(&game, &mv);
            game.play(&mv).unwrap();
        }
    }

    #[test]
    fn no_move_when_the_game_is_over() {
        let game = game_from(&[(2, 0), (3, 0)], &[(4, 0)], Player::Black, [6, 0]);
        assert_eq!(best_move(&game, 500), None);
    }

    #[test]
    fn no_move_when_the_side_to_move_has_no_marble() {
        let game = game_from(&[], &[(0, 0)], Player::Black, [0, 0]);
        assert_eq!(best_move(&game, 500), None);
    }

    #[test]
    fn the_node_budget_is_respected() {
        for budget in [1, 2, 10, 100, 1000, 5000] {
            let found = search(&Game::new(), budget).expect("a move");
            assert!(
                found.nodes <= budget,
                "{} nodes for budget {budget}",
                found.nodes
            );
            assert_legal(&Game::new(), &found.mv);
        }
    }

    #[test]
    fn a_zero_budget_still_gives_the_best_ordered_legal_move() {
        let found = search(&Game::new(), 0).expect("a move");
        assert_eq!((found.depth, found.nodes), (0, 0));
        assert_legal(&Game::new(), &found.mv);
    }

    #[test]
    fn a_bigger_budget_searches_deeper() {
        let shallow = search(&Game::new(), 100).expect("a move");
        let deep = search(&Game::new(), 5000).expect("a move");
        assert!(deep.depth >= 2, "depth {}", deep.depth);
        assert!(deep.depth > shallow.depth);
    }

    #[test]
    fn a_side_with_no_marble_left_is_scored_not_searched() {
        // White pushes the only Black marble off the rim: Black then has no move at all.
        let game = game_from(&[(4, 0)], &[(2, 0), (3, 0)], Player::White, [0, 0]);
        let found = search(&game, 1000).expect("a move");
        assert_eq!(found.mv.dir, Direction::E);
    }

    #[test]
    fn a_lone_marble_walks_towards_the_centre() {
        let game = game_from(&[(3, 0)], &[(-4, 4)], Player::Black, [0, 0]);
        let mv = best_move(&game, 2000).expect("a move");
        let (board, _) = apply(game.board(), Player::Black, &mv).unwrap();
        let dist = |q: i32, r: i32| q.abs().max(r.abs()).max((q + r).abs());
        let (q, r) = (-4..=4)
            .flat_map(|q| (-4..=4).map(move |r| (q, r)))
            .find(|&(q, r)| board.get(q, r) == Some(Cell::Black))
            .unwrap();
        assert!(dist(q, r) < 3);
    }

    fn heavy(w: Weights) -> Option<Move> {
        search_with(&Game::new(), 3000, w, &|_| true).map(|r| r.mv)
    }

    #[test]
    fn default_weights_and_no_filter_match_search() {
        assert_eq!(
            search_with(&Game::new(), 1500, DEFAULT_WEIGHTS, &|_| true),
            search(&Game::new(), 1500)
        );
    }

    #[test]
    fn the_filter_limits_the_root_moves() {
        let game = Game::new();
        let only_east = |m: &Move| m.dir == Direction::E;
        let found = search_with(&game, 500, DEFAULT_WEIGHTS, &only_east).expect("a move");
        assert_eq!(found.mv.dir, Direction::E);
        assert_legal(&game, &found.mv);
        assert!(found.nodes <= 500);
        assert_eq!(search_with(&game, 500, DEFAULT_WEIGHTS, &|_| false), None);
    }

    #[test]
    fn the_weights_change_the_choice() {
        let styles = [
            DEFAULT_WEIGHTS,
            Weights {
                ejected: 400,
                ..DEFAULT_WEIGHTS
            },
            Weights {
                centre: 40,
                ..DEFAULT_WEIGHTS
            },
            Weights {
                cohesion: 40,
                ..DEFAULT_WEIGHTS
            },
        ];
        let picks: Vec<_> = styles.into_iter().map(heavy).collect();
        assert!(picks.iter().any(|m| *m != picks[0]), "{picks:?}");
    }

    #[test]
    fn search_with_is_deterministic() {
        let w = Weights {
            cohesion: 40,
            ..DEFAULT_WEIGHTS
        };
        assert_eq!(heavy(w), heavy(w));
    }
}
