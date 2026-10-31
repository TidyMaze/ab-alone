//! The Stalker (#1111, docs/specs/stalker.md): the player sees the boss marbles only within `sight` cells of their own,
//! and is offered the moves of the board as they see it. The engine stays the judge: a move a hidden marble blocks is
//! refused, nothing changes, and that marble is revealed until the player's next played move.

use crate::board::{Board, Cell};
use crate::encounter::{BossDef, Encounter};
use crate::game::{Game, GameError};
use crate::moves::{apply_for, legal_moves, Move, Player};

type P = (i32, i32);

/// The sight, in cells, per phase. TUNE.
pub const STALKER_SIGHT: [u8; 3] = [3, 2, 1];
/// P2 and P3 start after this many ejections credited to the player. TUNE.
pub const STALKER_PHASE_EJECTIONS: [u8; 2] = [3, 5];
/// Positions the boss search may visit per move (about depth 3, as the Pulsar). TUNE.
pub const STALKER_NODE_BUDGET: u32 = 3000;

/// The sight of `phase`.
pub fn sight(phase: usize) -> u8 {
    STALKER_SIGHT[phase]
}

fn distance(a: P, b: P) -> i32 {
    let (dq, dr) = (a.0 - b.0, a.1 - b.1);
    dq.abs().max(dr.abs()).max((dq + dr).abs())
}

fn cells_of(board: &Board, colour: Cell) -> Vec<P> {
    let radius = board.radius();
    let mut out = Vec::new();
    for q in -radius..=radius {
        for r in -radius..=radius {
            if board.get(q, r) == Some(colour) {
                out.push((q, r));
            }
        }
    }
    out
}

/// The cells within `sight` of a `side` marble, its own among them.
pub fn visible(board: &Board, side: Cell, sight: u8) -> Vec<P> {
    let own = cells_of(board, side);
    let radius = board.radius();
    let mut out = Vec::new();
    for q in -radius..=radius {
        for r in -radius..=radius {
            if board.get(q, r).is_some()
                && own.iter().any(|&o| distance(o, (q, r)) <= i32::from(sight))
            {
                out.push((q, r));
            }
        }
    }
    out
}

/// The board as the player sees it: the boss marbles neither visible nor revealed are empty cells.
pub fn seen_board(board: &Board, visible: &[P], revealed: &[P]) -> Board {
    let mut out = board.clone();
    for c in cells_of(board, Cell::White) {
        if !visible.contains(&c) && !revealed.contains(&c) {
            out.set(c.0, c.1, Cell::Empty);
        }
    }
    out
}

/// The hidden boss marbles that stop `mv` on the real board: the marbles in the lines ahead that `seen` does not show.
/// Empty when the real board accepts `mv`.
pub fn blockers(board: &Board, seen: &Board, mv: &Move) -> Vec<P> {
    if apply_for(board, Cell::Black, mv).is_ok() {
        return Vec::new();
    }
    let (dq, dr) = mv.dir.vector();
    let mut out = Vec::new();
    for &(q, r) in &mv.cells {
        let mut k = 1;
        while matches!(
            board.get(q + k * dq, r + k * dr),
            Some(Cell::Black | Cell::White)
        ) {
            let c = (q + k * dq, r + k * dr);
            if board.get(c.0, c.1) == Some(Cell::White) && seen.get(c.0, c.1) != Some(Cell::White) {
                out.push(c);
            }
            k += 1;
        }
    }
    out.sort_unstable();
    out.dedup();
    out
}

/// Refuses a player move a hidden marble blocks: nothing changes but the revealed marbles.
pub(super) fn refuse(enc: &mut Encounter, mv: &Move) -> Result<(), GameError> {
    if enc.game.to_move() != Player::Black || enc.game.outcome().is_some() {
        return Ok(());
    }
    let seen = enc.seen_board();
    let hidden = if apply_for(&seen, Cell::Black, mv).is_ok() {
        blockers(enc.game.board(), &seen, mv)
    } else {
        Vec::new()
    };
    if hidden.is_empty() {
        return Ok(());
    }
    enc.revealed.extend(hidden);
    enc.revealed.sort_unstable();
    enc.revealed.dedup();
    Err(GameError::Hidden)
}

impl Encounter {
    /// The same fight, under the Stalker's fog.
    pub fn stalking(mut self) -> Self {
        self.stalker = true;
        self
    }

    /// The sight of the player now.
    pub fn sight(&self) -> u8 {
        sight(self.phase())
    }

    /// The boss marbles a refused move revealed, until the player's next played move.
    pub fn revealed(&self) -> &[P] {
        &self.revealed
    }

    /// The cells the player sees now.
    pub fn visible(&self) -> Vec<P> {
        visible(self.game.board(), Cell::Black, self.sight())
    }

    /// The board as the player sees it.
    pub fn seen_board(&self) -> Board {
        seen_board(self.game.board(), &self.visible(), &self.revealed)
    }

    /// The moves the player is offered: those of the seen board.
    pub fn seen_moves(&self) -> Vec<Move> {
        legal_moves(&self.seen_board(), Player::Black)
    }
}

/// The Stalker boss definition: standard Abalone, no special, no hook.
pub fn stalker_boss() -> BossDef {
    BossDef {
        name: "The Stalker",
        phase_marbles: Vec::new(),
        phase_ejections: STALKER_PHASE_EJECTIONS.to_vec(),
        special: |_, _| None,
        hook: |board, _, _| board.clone(),
        conversions: None,
        node_budget: STALKER_NODE_BUDGET,
    }
}

/// A new encounter: the standard layout, the player is Black and moves first.
pub fn stalker_start(seed: u64) -> Encounter {
    Encounter::new(Game::new(), stalker_boss(), seed).stalking()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::moves::Direction::{E, NE, W};
    use crate::moves::MoveError;

    fn fight(black: &[P], white: &[P], ejected: [u8; 2]) -> Encounter {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        Encounter::new(
            Game::from_position(board, Player::Black, ejected),
            stalker_boss(),
            1,
        )
        .stalking()
    }

    fn east(cells: &[P]) -> Move {
        Move {
            cells: cells.to_vec(),
            dir: E,
        }
    }

    const PAIR: [P; 2] = [(-1, 0), (0, 0)];
    const TRIO: [P; 3] = [(-2, 0), (-1, 0), (0, 0)];

    #[test]
    fn the_sight_narrows_with_the_phase_and_the_boss_is_standard() {
        assert_eq!([sight(0), sight(1), sight(2)], [3, 2, 1]);
        let boss = stalker_boss();
        assert_eq!(boss.name, "The Stalker");
        assert_eq!(boss.phase_ejections, vec![3, 5]);
        assert_eq!(boss.node_budget, 3000);
        assert_eq!((boss.special)(1, 0), None);
        let board = Board::standard();
        assert_eq!((boss.hook)(&board, 0, 0), board);
    }

    #[test]
    fn a_lone_marble_sees_its_neighbours_only_at_sight_1() {
        let board = fight(&[(0, 0)], &[(4, -4)], [0, 0]).game().board().clone();
        assert_eq!(visible(&board, Cell::Black, 1).len(), 7);
        assert_eq!(visible(&board, Cell::Black, 2).len(), 19);
    }

    #[test]
    fn a_boss_marble_out_of_sight_is_hidden_unless_revealed() {
        let enc = fight(&[(0, 0)], &[(1, 0), (4, -4)], [0, 0]);
        let seen = enc.seen_board();
        assert_eq!(seen.get(1, 0), Some(Cell::White));
        assert_eq!(seen.get(4, -4), Some(Cell::Empty));
        let shown = seen_board(enc.game().board(), &[], &[(4, -4)]);
        assert_eq!(shown.get(4, -4), Some(Cell::White));
        assert_eq!(shown.get(1, 0), Some(Cell::Empty));
    }

    #[test]
    fn the_standard_start_hides_the_whole_boss_and_so_does_a_far_marble() {
        let start = stalker_start(1);
        assert_eq!(cells_of(&start.seen_board(), Cell::White), vec![]);
        assert_eq!(cells_of(start.game().board(), Cell::White).len(), 14);
        let far = fight(&[(-4, 4)], &[(4, -4)], [0, 0]);
        assert_eq!(cells_of(&far.seen_board(), Cell::White), vec![]);
    }

    #[test]
    fn seen_moves_are_those_of_the_board_as_seen() {
        let enc = fight(&PAIR, &[(1, 0)], [0, 0]);
        assert!(enc.seen_moves().contains(&east(&PAIR)), "2 pushes 1");
        let enc = fight(&PAIR, &[(1, 0), (2, 0)], [0, 0]);
        assert!(!enc.seen_moves().contains(&east(&PAIR)), "visible blocker");
        let enc = fight(&PAIR, &[(1, 0), (2, 0)], [5, 0]);
        assert!(enc.seen_moves().contains(&east(&PAIR)), "hidden blocker");
    }

    #[test]
    fn a_move_blocked_by_hidden_marbles_is_refused_and_reveals_them_all() {
        let mut enc = fight(&TRIO, &[(1, 0), (2, 0), (3, 0)], [5, 0]);
        assert_eq!(enc.sight(), 1);
        let mv = east(&TRIO);
        assert!(enc.seen_moves().contains(&mv));
        let before = enc.game().board().clone();
        assert_eq!(enc.play(&mv), Err(GameError::Hidden));
        assert_eq!(enc.revealed(), &[(2, 0), (3, 0)]);
        assert_eq!(enc.game().board(), &before);
        assert_eq!(enc.game().history().len(), 0, "first move of the fight");
        assert_eq!(enc.game().to_move(), Player::Black);
        assert!(!enc.seen_moves().contains(&mv));
        assert_eq!(
            enc.play(&mv),
            Err(GameError::Move(MoveError::NotStrongEnough))
        );
    }

    #[test]
    fn a_hidden_marble_behind_the_pushed_one_does_not_stop_a_bigger_push() {
        let mut enc = fight(&TRIO, &[(1, 0), (2, 0)], [5, 0]);
        assert_eq!(enc.seen_board().get(2, 0), Some(Cell::Empty));
        enc.play(&east(&TRIO)).unwrap();
        assert_eq!(enc.game().board().get(3, 0), Some(Cell::White));
        assert!(enc.revealed().is_empty());
    }

    #[test]
    fn the_reveal_ends_with_the_next_played_move_even_across_a_phase() {
        let mut enc = fight(&PAIR, &[(1, 0), (2, 0)], [5, 0]);
        assert_eq!(enc.play(&east(&PAIR)), Err(GameError::Hidden));
        assert_eq!(enc.revealed(), &[(2, 0)]);
        assert!(enc
            .play(&Move {
                cells: vec![(0, 0)],
                dir: E
            })
            .is_err());
        assert_eq!(enc.revealed(), &[(2, 0)], "an illegal move keeps it");
        enc.play(&Move {
            cells: vec![(-1, 0)],
            dir: NE,
        })
        .unwrap();
        assert!(enc.revealed().is_empty());
    }

    #[test]
    fn an_illegal_move_is_no_refusal_and_the_boss_is_not_fogged() {
        let mut enc = fight(&PAIR, &[(4, -4)], [0, 0]);
        let bad = Move {
            cells: vec![(3, 3)],
            dir: W,
        };
        assert_eq!(
            enc.play(&bad),
            Err(GameError::Move(MoveError::NotOwnMarble))
        );
        assert!(enc.revealed().is_empty());
        enc.play(&east(&PAIR)).unwrap();
        let reply = enc.boss_search().unwrap().mv;
        enc.play(&reply).unwrap();
    }

    #[test]
    fn a_finished_fight_refuses_with_the_game_error() {
        let mut enc = fight(&[(2, 0), (3, 0)], &[(4, 0)], [5, 0]);
        enc.play(&east(&[(2, 0), (3, 0)])).unwrap();
        assert!(enc.game().outcome().is_some());
        assert_eq!(enc.play(&east(&[(3, 0)])), Err(GameError::GameOver));
    }

    #[test]
    fn an_ejection_that_brings_the_phase_up_narrows_the_next_sight() {
        let mut enc = fight(&[(2, 0), (3, 0)], &[(4, 0)], [2, 0]);
        assert_eq!(enc.sight(), 3);
        enc.play(&east(&[(2, 0), (3, 0)])).unwrap();
        assert_eq!(enc.game().ejected(Player::Black), 3);
        assert_eq!(enc.sight(), 2);
    }

    #[test]
    fn the_boss_replies_as_the_plain_search_of_the_same_budget() {
        let mut enc = stalker_start(7);
        let first = enc.seen_moves()[0].clone();
        enc.play(&first).unwrap();
        let plain = crate::search::search(enc.game(), STALKER_NODE_BUDGET).unwrap();
        assert_eq!(enc.boss_search().unwrap().mv, plain.mv);
    }
}
