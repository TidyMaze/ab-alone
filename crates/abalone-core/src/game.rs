//! Game state and win detection. Owner: issue #10.
use crate::board::{Board, Player};
use crate::moves::{Move, MoveError};
use serde::{Deserialize, Serialize};

pub const EJECTIONS_TO_WIN: u8 = 6;

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct Game {
    pub board: Board,
    pub to_move: Player,
    /// Marbles each player has ejected: `[black, white]`.
    pub ejected: [u8; 2],
}

impl Game {
    /// Standard layout, Black moves first.
    pub fn new() -> Game {
        todo!("#10")
    }

    /// Fails without changing state if the move is illegal or the game is over.
    pub fn play(&mut self, _m: &Move) -> Result<(), MoveError> {
        todo!("#10")
    }

    pub fn winner(&self) -> Option<Player> {
        todo!("#10")
    }
}

impl Default for Game {
    fn default() -> Self {
        Game::new()
    }
}
