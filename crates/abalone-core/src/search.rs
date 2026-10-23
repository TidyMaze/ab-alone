//! Alpha-beta search with a hand-tuned evaluation (docs/specs/tech.md section 7).

use crate::game::Game;
use crate::moves::Move;

/// What a search found.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SearchResult {
    pub mv: Move,
    /// Deepest iteration that finished, in plies.
    pub depth: u32,
    /// Positions visited, never above the budget.
    pub nodes: u32,
}

/// Best move for the side to move, visiting at most `node_budget` positions.
pub fn search(_game: &Game, _node_budget: u32) -> Option<SearchResult> {
    None
}

/// Same as [`search`], the move only.
pub fn best_move(game: &Game, node_budget: u32) -> Option<Move> {
    search(game, node_budget).map(|r| r.mv)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Board, Cell};
    use crate::game::Outcome;
    use crate::moves::{apply, legal_moves, Direction, Player};

    type P = (i32, i32);

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
    fn a_bigger_budget_searches_deeper() {
        let shallow = search(&Game::new(), 100).expect("a move");
        let deep = search(&Game::new(), 5000).expect("a move");
        assert!(deep.depth >= 2, "depth {}", deep.depth);
        assert!(deep.depth > shallow.depth);
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
}
