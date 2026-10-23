//! Move generation and validation. Owner: issue #9.
use crate::board::{Board, Hex, Player};
use serde::{Deserialize, Serialize};

/// 1 to 3 own marbles in a line, moved one step in `DIRS[dir]`.
#[derive(Clone, PartialEq, Eq, Debug, Hash, Serialize, Deserialize)]
pub struct Move {
    /// Sorted ascending, 1..=3 cells, collinear and contiguous.
    pub marbles: Vec<Hex>,
    /// Index into `board::DIRS`.
    pub dir: usize,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub enum MoveError {
    BadShape,
    NotYourMarble,
    Blocked,
    PushTooStrong,
}

/// Every legal move for `p`. Each must pass `apply`.
pub fn legal_moves(_b: &Board, _p: Player) -> Vec<Move> {
    todo!("#9")
}

/// Returns the new board and the number of opposing marbles ejected (0 or 1).
pub fn apply(_b: &Board, _p: Player, _m: &Move) -> Result<(Board, u8), MoveError> {
    todo!("#9")
}
