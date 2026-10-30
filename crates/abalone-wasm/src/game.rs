//! Standard 1v1 Abalone game instance exposed to WebAssembly.

use crate::convert::{
    board_bytes, decode, draw_reason_code, encode, player, side_code, status_code,
};
use abalone_core::game::Game;
use abalone_core::moves::legal_moves;
use abalone_core::search::{best_move, position_score};
use wasm_bindgen::prelude::*;

/// One opaque game instance handed to JavaScript.
#[wasm_bindgen]
pub struct Engine {
    game: Game,
}

#[wasm_bindgen]
impl Engine {
    /// A new game: standard layout, Black to move.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Engine {
        Engine { game: Game::new() }
    }

    /// A rogue-lite fight (docs/specs/roguelite.md): the army's `army` marbles, clamped to 4..=14,
    /// against the bot's 14. White wins once the army is down to 3 marbles.
    pub fn with_army(_army: u8) -> Engine {
        unimplemented!()
    }

    /// Side to move: `1` Black, `2` White.
    pub fn to_move(&self) -> u8 {
        side_code(self.game.to_move())
    }

    /// Legal moves of the side to move, flat records of `MOVE_STRIDE` integers. Empty once the
    /// game is over.
    pub fn legal_moves(&self) -> Vec<i32> {
        if self.game.outcome().is_some() {
            return Vec::new();
        }
        legal_moves(self.game.board(), self.game.to_move())
            .iter()
            .flat_map(encode)
            .collect()
    }

    /// Plays one move record. `Err` carries the reason, the game is left unchanged.
    pub fn play(&mut self, mv: &[i32]) -> Result<(), String> {
        let mv = decode(mv)?;
        self.game.play(&mv).map_err(|e| format!("{e:?}"))
    }

    /// Opponent marbles ejected by a side: `1` Black, `2` White. The game ends at 6.
    pub fn ejected(&self, side: u8) -> u8 {
        self.game.ejected(player(side))
    }

    /// Ejections a side needs to win: `1` Black, `2` White.
    pub fn win_ejections(&self, side: u8) -> u8 {
        self.game.win_ejections(player(side))
    }

    /// The 61 cells, see the module docs for the order.
    pub fn board(&self) -> Vec<u8> {
        board_bytes(self.game.board())
    }

    /// The bot's reply for the side to move, one move record, searching at most `nodes`
    /// positions. Empty once the game is over.
    pub fn best_move(&self, nodes: u32) -> Vec<i32> {
        best_move(&self.game, nodes)
            .map(|mv| encode(&mv).to_vec())
            .unwrap_or_default()
    }

    /// Score of the position for the side to move, searching at most `nodes` positions. See the
    /// module docs.
    pub fn evaluate(&self, nodes: u32) -> i32 {
        position_score(&self.game, nodes)
    }

    /// Winner or draw state, see the module docs.
    pub fn status(&self) -> u8 {
        status_code(self.game.outcome())
    }

    /// Draw reason code, `0` when the game is not a draw. See the module docs.
    pub fn draw_reason(&self) -> u8 {
        draw_reason_code(self.game.draw_reason())
    }
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::convert::MOVE_STRIDE;
    use abalone_core::board::Board;
    use abalone_core::moves::Player;

    fn count(cells: &[u8], value: u8) -> usize {
        cells.iter().filter(|&&c| c == value).count()
    }

    #[test]
    fn new_game_black_to_move_and_running() {
        let engine = Engine::new();
        assert_eq!(engine.to_move(), 1);
        assert_eq!(engine.status(), 0);
    }

    #[test]
    fn with_army_starts_the_army_fight() {
        let engine = Engine::with_army(9);
        assert_eq!(count(&engine.board(), 1), 9);
        assert_eq!(count(&engine.board(), 2), 14);
        assert_eq!(engine.win_ejections(2), 6);
        assert_eq!(Engine::with_army(5).win_ejections(2), 2);
        assert_eq!(Engine::with_army(14).board(), Engine::new().board());
    }

    #[test]
    fn default_is_a_new_game() {
        assert_eq!(Engine::default().board(), Engine::new().board());
    }

    #[test]
    fn board_has_61_cells_14_per_side() {
        let cells = Engine::new().board();
        assert_eq!(cells.len(), 61);
        assert_eq!(count(&cells, 1), 14);
        assert_eq!(count(&cells, 2), 14);
        assert_eq!(count(&cells, 0), 33);
    }

    #[test]
    fn board_order_is_rows_from_r_minus_4_q_ascending() {
        let cells = Engine::new().board();
        // (0,-4) is White, (0,4) is Black, the centre (0,0) is empty.
        assert_eq!(cells[0], 2);
        assert_eq!(cells[60], 1);
        assert_eq!(cells[30], 0);
        // Row r=-4 has 5 cells, row r=-3 starts at index 5 with (q=-1).
        assert_eq!(cells[5], 2);
        // Row r=2 starts at index 5+6+7+8+9+8 = 43 with q=-4, so (q=-2, r=2) is index 45.
        assert_eq!(cells[45], 1);
    }

    #[test]
    fn legal_moves_match_the_core_count() {
        let expected = legal_moves(&Board::standard(), Player::Black).len();
        let flat = Engine::new().legal_moves();
        assert_eq!(flat.len(), expected * MOVE_STRIDE);
        for record in flat.chunks(MOVE_STRIDE) {
            assert!((1..=3).contains(&record[0]));
            assert!((0..=5).contains(&record[1]));
        }
    }

    #[test]
    fn play_a_legal_move_switches_side_and_changes_board() {
        let mut engine = Engine::new();
        let before = engine.board();
        let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
        assert_eq!(engine.play(&first), Ok(()));
        assert_eq!(engine.to_move(), 2);
        assert_ne!(engine.board(), before);
    }

    #[test]
    fn play_rejects_malformed_records() {
        let mut engine = Engine::new();
        assert!(engine.play(&[]).is_err());
        assert!(engine.play(&[1, 0, 0, 0]).is_err());
        assert!(engine.play(&[0, 0, 0, 0, 0, 0, 0, 0]).is_err());
        assert!(engine.play(&[4, 0, 0, 0, 0, 0, 0, 0]).is_err());
        assert!(engine.play(&[-1, 0, 0, 0, 0, 0, 0, 0]).is_err());
        assert!(engine.play(&[1, 6, 0, 4, 0, 0, 0, 0]).is_err());
        assert!(engine.play(&[1, -1, 0, 4, 0, 0, 0, 0]).is_err());
        assert_eq!(engine.to_move(), 1);
    }

    #[test]
    fn play_rejects_an_illegal_move_with_the_core_reason() {
        let mut engine = Engine::new();
        // (0,-4) is a White marble, Black may not move it.
        let err = engine.play(&[1, 0, 0, -4, 0, 0, 0, 0]).unwrap_err();
        assert_eq!(err, "Move(NotOwnMarble)");
        assert_eq!(engine.to_move(), 1);
    }

    /// Both sides play their first legal move until the game ends.
    fn play_until_over(engine: &mut Engine) {
        while engine.status() == 0 {
            let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
            engine.play(&first).unwrap();
        }
    }

    #[test]
    fn a_drawn_game_reports_draw_and_refuses_moves() {
        let mut engine = Engine::new();
        play_until_over(&mut engine);
        assert_eq!(engine.status(), 3);
        assert!((1..=2).contains(&engine.draw_reason()));
        assert!(engine.legal_moves().is_empty());
        assert!(engine.play(&[1, 0, 0, 0, 0, 0, 0, 0]).is_err());
    }

    #[test]
    fn best_move_is_one_legal_record() {
        let engine = Engine::new();
        let record = engine.best_move(300);
        assert_eq!(record.len(), MOVE_STRIDE);
        assert!(engine
            .legal_moves()
            .chunks(MOVE_STRIDE)
            .any(|m| m == record.as_slice()));
    }

    #[test]
    fn best_move_can_be_played_and_the_bot_answers_for_white() {
        let mut engine = Engine::new();
        let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
        engine.play(&first).unwrap();
        let reply = engine.best_move(300);
        assert_eq!(engine.play(&reply), Ok(()));
        assert_eq!(engine.to_move(), 1);
    }

    #[test]
    fn best_move_is_empty_once_the_game_is_over() {
        let mut engine = Engine::new();
        play_until_over(&mut engine);
        assert!(engine.best_move(300).is_empty());
    }

    #[test]
    fn evaluate_is_the_core_position_score_for_the_side_to_move() {
        use abalone_core::search::{position_score, WIN};
        let mut engine = Engine::new();
        let start = engine.evaluate(2000);
        assert_eq!(start, position_score(&Game::new(), 2000));
        assert!(start.abs() < WIN / 2, "a running game is not decided");
        let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
        engine.play(&first).unwrap();
        assert_eq!(engine.evaluate(2000), position_score(&engine.game, 2000));
    }

    #[test]
    fn evaluate_a_drawn_game_is_zero() {
        let mut engine = Engine::new();
        play_until_over(&mut engine);
        assert_eq!(engine.evaluate(300), 0);
    }

    #[test]
    fn a_game_is_won_at_6_ejections_for_both_sides() {
        let engine = Engine::new();
        assert_eq!((engine.win_ejections(1), engine.win_ejections(2)), (6, 6));
    }

    #[test]
    fn ejected_counts_start_at_zero_for_both_sides() {
        let engine = Engine::new();
        assert_eq!(engine.ejected(1), 0);
        assert_eq!(engine.ejected(2), 0);
    }
}
