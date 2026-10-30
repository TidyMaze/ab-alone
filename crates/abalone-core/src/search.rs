//! Alpha-beta search with a hand-tuned evaluation (docs/specs/tech.md section 7).

use std::cmp::Reverse;

use crate::board::{Board, Cell, MAX_RADIUS};
use crate::encounter::hull::NEIGHBOURS;
use crate::game::{Game, Outcome};
use crate::moves::{apply, legal_moves, Move, Player};
use crate::run::credits;

/// Score of a won game, minus the ply it is won at, so a quicker win scores higher. A lost game
/// scores the opposite: any score beyond `WIN / 2` either way is a decided game.
pub const WIN: i32 = 1_000_000;
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
    /// Per marble one neighbour short of the Chaplain's conversion (3 foes around it): the foe's
    /// are a chance, the own are a danger.
    pub threat: i32,
    /// Per egg on the board (The Alien's): the White side's chance, the foe's loss.
    pub egg: i32,
}

/// Hand-tuned weights of the plain search.
pub const DEFAULT_WEIGHTS: Weights = Weights {
    marbles: 100,
    ejected: 50,
    centre: 3,
    cohesion: 2,
    threat: 0,
    egg: 0,
};

/// What a search found.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SearchResult {
    pub mv: Move,
    /// Deepest iteration that finished, in plies. `0` when the budget ran out inside the first.
    pub depth: u32,
    /// Positions visited, never above the budget.
    pub nodes: u32,
    /// Score of `mv` for the side to move, in centi-marbles, from the deepest iteration that
    /// finished: `WIN` minus the plies to a forced win, the opposite for a forced loss. The static
    /// score of the position after `mv` when no iteration finished.
    pub score: i32,
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
    let radius = board.radius();
    for q in -radius..=radius {
        for r in -radius..=radius {
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

/// Marbles of Black and of White with exactly 3 neighbours of the other colour: one more and the
/// Chaplain converts them.
fn threatened(board: &Board) -> [i32; 2] {
    let mut out = [0, 0];
    for q in -MAX_RADIUS..=MAX_RADIUS {
        for r in -MAX_RADIUS..=MAX_RADIUS {
            let (side, foe) = match board.get(q, r) {
                Some(Cell::Black) => (0, Cell::White),
                Some(Cell::White) => (1, Cell::Black),
                _ => continue,
            };
            let near = NEIGHBOURS
                .iter()
                .filter(|&&(dq, dr)| board.get(q + dq, r + dr) == Some(foe))
                .count();
            out[side] += i32::from(near == 3);
        }
    }
    out
}

/// Score of a position for `player`: marble difference, ejections made, centrality (a lower
/// distance sum is better) and cohesion.
fn evaluate(board: &Board, player: Player, ejected: [u8; 2], w: &Weights) -> i32 {
    let (own_count, own_distance, own_pairs) = shape(board, cell_of(player));
    let (opp_count, opp_distance, opp_pairs) = shape(board, cell_of(other(player)));
    let made = i32::from(ejected[index(player)]) - i32::from(ejected[index(other(player))]);
    let threat = if w.threat == 0 {
        0
    } else {
        let at = threatened(board);
        at[index(other(player))] - at[index(player)]
    };
    let eggs = if w.egg == 0 {
        0
    } else {
        let n = board.eggs().len() as i32;
        if player == Player::White {
            n
        } else {
            -n
        }
    };
    w.marbles * (own_count - opp_count)
        + w.ejected * made
        + w.centre * (opp_distance - own_distance)
        + w.cohesion * (own_pairs - opp_pairs)
        + w.threat * threat
        + w.egg * eggs
}

/// Legal moves of the side to move, ejections first, then the best static score.
fn children(node: &Node, weights: &Weights, step: Option<Hook>) -> Vec<Child> {
    let mover = node.to_move;
    let mut kids: Vec<Child> = legal_moves(&node.board, mover)
        .into_iter()
        .map(|mv| {
            let (board, ejects) = apply(&node.board, mover, &mv).expect("legal move");
            let [black, white] = credits(&node.board, mover, ejects, &board);
            let mut ejected = [node.ejected[0] + black, node.ejected[1] + white];
            let board = match step {
                Some(step) => {
                    let (board, credits) = step(&node.board, mover, &mv, board, node.ejected);
                    ejected[0] = ejected[0].saturating_add_signed(credits[0]);
                    ejected[1] = ejected[1].saturating_add_signed(credits[1]);
                    board
                }
                None => board,
            };
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

struct Searcher<'a> {
    weights: Weights,
    step: Option<Hook<'a>>,
    budget: u32,
    nodes: u32,
    /// Ejections each side needs to win, from the game: Black then White.
    win: [u8; 2],
    /// The ply from the root at which the root mover wins on the clock (a fight with a turn
    /// limit), `None` for no clock.
    last_ply: Option<i32>,
}

impl Searcher<'_> {
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
        if node.ejected[index(mover)] >= self.win[index(mover)] {
            return Some(WIN - ply);
        }
        if self.last_ply == Some(ply) {
            return Some(WIN - ply);
        }
        if depth == 0 {
            return Some(evaluate(&node.board, mover, node.ejected, &self.weights));
        }
        let kids = children(node, &self.weights, self.step);
        if kids.is_empty() && node.board.rogue_lite() {
            // No legal move loses a rogue-lite fight (docs/specs/roguelite.md).
            return Some(ply - WIN);
        }
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

    /// Index and score of the best child at `depth`, `None` when the budget ran out inside.
    fn root(&mut self, kids: &[Child], depth: u32) -> Option<(usize, i32)> {
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
        Some((best, alpha))
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
    run(game, node_budget, weights, allow, None, None)
}

fn run(
    game: &Game,
    node_budget: u32,
    weights: Weights,
    allow: &dyn Fn(&Move) -> bool,
    step: Option<Hook>,
    last_ply: Option<i32>,
) -> Option<SearchResult> {
    if game.outcome().is_some() {
        return None;
    }
    let root = Node {
        board: game.board().clone(),
        to_move: game.to_move(),
        ejected: [game.ejected(Player::Black), game.ejected(Player::White)],
    };
    let mut kids = children(&root, &weights, step);
    kids.retain(|k| allow(&k.mv));
    if kids.is_empty() {
        return None;
    }
    let mut searcher = Searcher {
        weights,
        step,
        budget: node_budget,
        nodes: 0,
        win: [
            game.win_ejections(Player::Black),
            game.win_ejections(Player::White),
        ],
        last_ply,
    };
    let (mut depth, mut score) = (0, kids[0].score);
    for d in 1..=MAX_DEPTH {
        let Some((best, value)) = searcher.root(&kids, d) else {
            break;
        };
        // Search the previous best first next time: the strongest ordering there is.
        kids[..=best].rotate_right(1);
        (depth, score) = (d, value);
    }
    Some(SearchResult {
        mv: kids.swap_remove(0).mv,
        depth,
        nodes: searcher.nodes,
        score,
    })
}

/// What a boss does to the board after `mover` played `mv` (the board before it, the board after
/// the move): the board after its hook, and the ejections the hook credits to Black and to White.
pub type Step<'a> = &'a dyn Fn(&Board, Player, &Move, Board) -> (Board, [u8; 2]);

/// What the tree runs for a ply: a step with the ejections credited before it and signed credits.
type Hook<'a> = &'a dyn Fn(&Board, Player, &Move, Board, [u8; 2]) -> (Board, [i8; 2]);

/// A [`Step`] whose credits can be negative: a hook that takes a credit back (The Chaplain's
/// health), never below 0 in total.
pub type SignedStep<'a> = &'a dyn Fn(&Board, Player, &Move, Board) -> (Board, [i8; 2]);

/// [`search_with`] where every ply also goes through `step`, so the tree sees the boss hooks.
pub fn search_hooked(
    game: &Game,
    node_budget: u32,
    weights: Weights,
    allow: &dyn Fn(&Move) -> bool,
    step: Step,
) -> Option<SearchResult> {
    let signed = |board: &Board, mover: Player, mv: &Move, after: Board, _: [u8; 2]| {
        let (after, [black, white]) = step(board, mover, mv, after);
        (after, [black as i8, white as i8])
    };
    run(game, node_budget, weights, allow, Some(&signed), None)
}

/// A [`Step`] that also gets the ejections credited to Black and to White before the ply, so a
/// boss recomputes its phase inside the tree.
pub type PhasedStep<'a> = &'a dyn Fn(&Board, Player, &Move, Board, [u8; 2]) -> (Board, [u8; 2]);

/// [`search_hooked`] with a [`PhasedStep`] and a clock: `turns` is the number of replies the
/// opponent of the root mover still has (a fight with a turn limit), `None` for no clock. The
/// root mover wins after the last one, unless that reply wins by ejection first.
pub fn search_phased(
    game: &Game,
    node_budget: u32,
    weights: Weights,
    allow: &dyn Fn(&Move) -> bool,
    step: PhasedStep,
    turns: Option<u32>,
) -> Option<SearchResult> {
    let signed = |board: &Board, mover: Player, mv: &Move, after: Board, ejected: [u8; 2]| {
        let (after, [black, white]) = step(board, mover, mv, after, ejected);
        (after, [black as i8, white as i8])
    };
    run(
        game,
        node_budget,
        weights,
        allow,
        Some(&signed),
        turns.map(|n| 2 * n as i32),
    )
}

/// [`search_hooked`] where the credits of a ply can be negative.
pub fn search_signed(
    game: &Game,
    node_budget: u32,
    weights: Weights,
    allow: &dyn Fn(&Move) -> bool,
    step: SignedStep,
) -> Option<SearchResult> {
    let hook = |board: &Board, mover: Player, mv: &Move, after: Board, _: [u8; 2]| {
        step(board, mover, mv, after)
    };
    run(game, node_budget, weights, allow, Some(&hook), None)
}

/// Score of the position for the side to move, visiting at most `node_budget` positions (the
/// evaluation bar, #191). A finished game scores `WIN` for the winner, `-WIN` for the loser and `0`
/// for a draw. A side with no legal move gets its static score.
pub fn position_score(game: &Game, node_budget: u32) -> i32 {
    let to_move = game.to_move();
    match game.outcome() {
        Some(Outcome::Win(winner)) if winner == to_move => WIN,
        Some(Outcome::Win(_)) => -WIN,
        Some(Outcome::Draw) => 0,
        None => search(game, node_budget).map_or_else(
            || {
                let ejected = [game.ejected(Player::Black), game.ejected(Player::White)];
                evaluate(game.board(), to_move, ejected, &DEFAULT_WEIGHTS)
            },
            |r| r.score,
        ),
    }
}

/// Same as [`search`], the move only.
pub fn best_move(game: &Game, node_budget: u32) -> Option<Move> {
    search(game, node_budget).map(|r| r.mv)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Board, Cell};
    use crate::game::WIN_EJECTIONS;
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
            step: None,
            budget: 100,
            nodes: 0,
            win,
            last_ply: None,
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

    #[test]
    fn a_side_a_step_brought_to_its_win_has_won_at_its_own_node() {
        // A bonus move (The Echo) can credit the side that moves next: it has already won there,
        // not one ply later.
        let node = Node {
            board: Board::standard(),
            to_move: Player::Black,
            ejected: [6, 0],
        };
        let mut searcher = Searcher {
            weights: DEFAULT_WEIGHTS,
            step: None,
            budget: 100,
            nodes: 0,
            win: [WIN_EJECTIONS; 2],
            last_ply: None,
        };
        assert_eq!(searcher.negamax(&node, 0, 3, -INF, INF), Some(WIN - 3));
        let gift = |_: &Board, mover: Player, _: &Move, after: Board| {
            (after, [u8::from(mover == Player::White) * 6, 0])
        };
        let game = Game::from_position(Board::standard(), Player::White, [0, 0]);
        let r = search_hooked(&game, 100, DEFAULT_WEIGHTS, &|_| true, &gift).unwrap();
        assert_eq!(r.score, 1 - WIN, "every move hands Black the win at once");
    }

    #[test]
    fn a_hooked_search_sees_what_the_hook_does_after_a_move() {
        let game = Game::new().with_win([6, 6]);
        let plain = search(&game, 3000).unwrap().mv;
        let punish = |_: &Board, mover: Player, mv: &Move, after: Board| {
            let credit = u8::from(mover == Player::Black && *mv == plain) * 6;
            (after, [0, credit])
        };
        let hooked = search_hooked(&game, 3000, DEFAULT_WEIGHTS, &|_| true, &punish).unwrap();
        assert_ne!(hooked.mv, plain, "a move the hook punishes is not played");
        let calm = |_: &Board, _: Player, _: &Move, after: Board| (after, [0, 0]);
        let same = search_hooked(&game, 3000, DEFAULT_WEIGHTS, &|_| true, &calm).unwrap();
        assert_eq!(
            same,
            search(&game, 3000).unwrap(),
            "a hook that does nothing"
        );
    }

    #[test]
    fn a_phased_step_sees_the_ejections_credited_before_each_ply() {
        let game = Game::new().with_win([6, 6]);
        let seen = std::cell::RefCell::new(Vec::new());
        let step = |_: &Board, mover: Player, _: &Move, after: Board, ejected: [u8; 2]| {
            seen.borrow_mut().push(ejected);
            (after, [u8::from(mover == Player::Black), 0])
        };
        search_phased(&game, 3000, DEFAULT_WEIGHTS, &|_| true, &step, None).unwrap();
        let seen = seen.borrow();
        assert_eq!(seen[0], [0, 0], "the root ply");
        assert!(seen.contains(&[1, 0]), "a ply below saw the first credit");
    }

    #[test]
    fn the_clock_gives_the_root_mover_the_win_at_its_last_ply() {
        let game = Game::from_position(Board::standard(), Player::White, [0, 0]);
        let calm = |_: &Board, _: Player, _: &Move, after: Board, _: [u8; 2]| (after, [0, 0]);
        let run = |clock| search_phased(&game, 3000, DEFAULT_WEIGHTS, &|_| true, &calm, clock);
        assert!(run(None).unwrap().score.abs() < WIN / 2, "no clock, no win");
        assert_eq!(run(Some(1)).unwrap().score, WIN - 2);
        let node = Node {
            board: Board::standard(),
            to_move: Player::White,
            ejected: [6, 0],
        };
        let searcher = Searcher {
            weights: DEFAULT_WEIGHTS,
            step: None,
            budget: 100,
            nodes: 0,
            win: [WIN_EJECTIONS; 2],
            last_ply: Some(2),
        };
        let mut searcher = searcher;
        assert_eq!(
            searcher.negamax(&node, 0, 2, -INF, INF),
            Some(2 - WIN),
            "an ejection on the last ply is still the opponent's win"
        );
    }

    #[test]
    fn an_egg_is_the_white_sides_chance_and_the_blacks_loss() {
        let mut board = Board::empty();
        board.set_eggs(vec![((0, 0), 4), ((1, 0), 2)]);
        let only_eggs = Weights {
            marbles: 0,
            ejected: 0,
            centre: 0,
            cohesion: 0,
            threat: 0,
            egg: 7,
        };
        assert_eq!(evaluate(&board, Player::White, [0, 0], &only_eggs), 14);
        assert_eq!(evaluate(&board, Player::Black, [0, 0], &only_eggs), -14);
        assert_eq!(evaluate(&board, Player::White, [0, 0], &DEFAULT_WEIGHTS), 0);
    }

    #[test]
    fn a_signed_credit_takes_a_credit_back_and_stops_at_zero() {
        let game = game_from(&[(0, 0)], &[(3, 0)], Player::Black, [3, 0]);
        let back = |_: &Board, _: Player, _: &Move, after: Board| (after, [-1, 1]);
        let hook = |b: &Board, p: Player, m: &Move, a: Board, _: [u8; 2]| back(b, p, m, a);
        let kids = children(&root_of(&game), &DEFAULT_WEIGHTS, Some(&hook));
        assert!(kids.iter().all(|k| k.node.ejected == [2, 1]));
        let none = game_from(&[(0, 0)], &[(3, 0)], Player::Black, [0, 0]);
        let kids = children(&root_of(&none), &DEFAULT_WEIGHTS, Some(&hook));
        assert!(
            kids.iter().all(|k| k.node.ejected == [0, 1]),
            "never below 0"
        );
        let found = search_signed(&game, 300, DEFAULT_WEIGHTS, &|_| true, &back).unwrap();
        assert_legal(&game, &found.mv);
    }

    #[test]
    fn a_marble_with_3_foes_around_it_is_a_threat_to_its_side() {
        let game = game_from(
            &[(0, 0)],
            &[(1, 0), (1, -1), (0, -1)],
            Player::White,
            [0, 0],
        );
        let only_threat = Weights {
            marbles: 0,
            ejected: 0,
            centre: 0,
            cohesion: 0,
            threat: 10,
            egg: 0,
        };
        let board = game.board();
        assert_eq!(evaluate(board, Player::White, [0, 0], &only_threat), 10);
        assert_eq!(evaluate(board, Player::Black, [0, 0], &only_threat), -10);
        let off = Weights {
            threat: 0,
            ..only_threat
        };
        assert_eq!(evaluate(board, Player::White, [0, 0], &off), 0);
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

    // Search score, for the evaluation bar (#191).

    #[test]
    fn a_win_in_one_scores_win_minus_one_ply() {
        assert_eq!(search(&winning_push(), 500).expect("a move").score, WIN - 1);
        let white = game_from(&[(-4, 0)], &[(-2, 0), (-3, 0)], Player::White, [0, 5]);
        assert_eq!(search(&white, 500).expect("a move").score, WIN - 1);
    }

    fn root_of(game: &Game) -> Node {
        Node {
            board: game.board().clone(),
            to_move: game.to_move(),
            ejected: [game.ejected(Player::Black), game.ejected(Player::White)],
        }
    }

    #[test]
    fn the_score_is_the_full_window_value_of_the_deepest_iteration() {
        let mut game = Game::new();
        game.play(&legal_moves(game.board(), Player::Black)[3])
            .unwrap();
        for g in [Game::new(), game] {
            let found = search(&g, 3000).expect("a move");
            assert!(found.depth >= 2, "depth {}", found.depth);
            let mut exact = Searcher {
                weights: DEFAULT_WEIGHTS,
                step: None,
                budget: u32::MAX,
                nodes: 0,
                win: [WIN_EJECTIONS; 2],
                last_ply: None,
            };
            let value = exact.negamax(&root_of(&g), found.depth, 0, -INF, INF);
            assert_eq!(Some(found.score), value);
        }
    }

    #[test]
    fn with_no_finished_iteration_the_score_is_the_static_one_of_the_move() {
        let game = Game::new();
        let found = search(&game, 0).expect("a move");
        let (board, _) = apply(game.board(), Player::Black, &found.mv).unwrap();
        assert_eq!(
            found.score,
            evaluate(&board, Player::Black, [0, 0], &DEFAULT_WEIGHTS)
        );
    }

    #[test]
    fn position_score_is_the_search_score_while_the_game_runs() {
        let game = Game::new();
        assert_eq!(
            position_score(&game, 2000),
            search(&game, 2000).unwrap().score
        );
        assert!(position_score(&game, 2000).abs() < WIN / 2);
    }

    #[test]
    fn position_score_of_a_won_game_is_win_for_the_winner_and_minus_win_for_the_loser() {
        let board = || Board::standard();
        let lost = Game::from_position(board(), Player::White, [6, 0]);
        assert_eq!(position_score(&lost, 500), -WIN);
        let won = Game::from_position(board(), Player::Black, [6, 0]);
        assert_eq!(position_score(&won, 500), WIN);
    }

    #[test]
    fn position_score_of_a_drawn_game_is_zero() {
        let mut game = Game::new();
        while game.outcome().is_none() {
            let first = legal_moves(game.board(), game.to_move())[0].clone();
            game.play(&first).unwrap();
        }
        assert_eq!(game.outcome(), Some(Outcome::Draw));
        assert_eq!(position_score(&game, 500), 0);
    }

    #[test]
    fn position_score_with_no_legal_move_is_the_static_score() {
        let game = game_from(&[], &[(0, 0)], Player::Black, [0, 0]);
        assert_eq!(
            position_score(&game, 500),
            evaluate(game.board(), Player::Black, [0, 0], &DEFAULT_WEIGHTS)
        );
        assert_eq!(position_score(&game, 500), -DEFAULT_WEIGHTS.marbles);
    }
}
