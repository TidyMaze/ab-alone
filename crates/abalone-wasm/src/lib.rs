//! Thin wasm-bindgen bridge over `abalone-core`. No game logic lives here: it only converts
//! between core types and flat integer arrays (decision #74, local transport, no network).
//!
//! Encodings, all stable and documented:
//! - Board: 61 bytes, row by row from `r = -4` to `r = 4`, inside a row by `q` ascending.
//!   Value `0` empty, `1` Black, `2` White. Index 0 is `(q=0, r=-4)`, index 60 is `(q=0, r=4)`.
//! - Side and winner: `1` Black, `2` White.
//! - Status: `0` running, `1` Black won, `2` White won, `3` draw.
//! - Move: 8 integers `[n, dir, q0, r0, q1, r1, q2, r2]`, `n` in 1..=3 marbles, unused
//!   coordinates are `0`. `dir`: `0` E, `1` W, `2` NE, `3` SW, `4` NW, `5` SE.
//!   `legal_moves` returns the records back to back.

use abalone_core::board::{Cell, RADIUS};
use abalone_core::game::{Game, Outcome};
use abalone_core::moves::{legal_moves, Direction, Move, Player};
use abalone_core::search::best_move;
use wasm_bindgen::prelude::*;

/// Integers per move record.
pub const MOVE_STRIDE: usize = 8;

/// Direction codes, the index is the code.
const DIRECTIONS: [Direction; 6] = [
    Direction::E,
    Direction::W,
    Direction::NE,
    Direction::SW,
    Direction::NW,
    Direction::SE,
];

fn side_code(player: Player) -> u8 {
    match player {
        Player::Black => 1,
        Player::White => 2,
    }
}

/// Status code of a game, see the module docs.
pub fn status_code(outcome: Option<Outcome>) -> u8 {
    match outcome {
        None => 0,
        Some(Outcome::Win(player)) => side_code(player),
        Some(Outcome::Draw) => 3,
    }
}

fn encode(mv: &Move) -> [i32; MOVE_STRIDE] {
    let mut record = [0; MOVE_STRIDE];
    record[0] = mv.cells.len() as i32;
    record[1] = DIRECTIONS.iter().position(|&d| d == mv.dir).unwrap_or(0) as i32;
    for (i, &(q, r)) in mv.cells.iter().enumerate() {
        record[2 + 2 * i] = q;
        record[3 + 2 * i] = r;
    }
    record
}

fn decode(record: &[i32]) -> Result<Move, String> {
    if record.len() != MOVE_STRIDE {
        return Err(format!("move needs {MOVE_STRIDE} integers"));
    }
    let n = usize::try_from(record[0])
        .ok()
        .filter(|n| (1..=3).contains(n))
        .ok_or("marble count must be 1 to 3")?;
    let dir = usize::try_from(record[1])
        .ok()
        .and_then(|i| DIRECTIONS.get(i))
        .copied()
        .ok_or("direction must be 0 to 5")?;
    let cells = (0..n)
        .map(|i| (record[2 + 2 * i], record[3 + 2 * i]))
        .collect();
    Ok(Move { cells, dir })
}

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
        let player = if side == 1 {
            Player::Black
        } else {
            Player::White
        };
        self.game.ejected(player)
    }

    /// The 61 cells, see the module docs for the order.
    pub fn board(&self) -> Vec<u8> {
        let board = self.game.board();
        (-RADIUS..=RADIUS)
            .flat_map(|r| (-RADIUS..=RADIUS).map(move |q| (q, r)))
            .filter_map(|(q, r)| board.get(q, r))
            .map(|cell| match cell {
                Cell::Empty => 0,
                Cell::Black => 1,
                Cell::White => 2,
            })
            .collect()
    }

    /// The bot's reply for the side to move, one move record, searching at most `nodes`
    /// positions. Empty once the game is over.
    pub fn best_move(&self, nodes: u32) -> Vec<i32> {
        best_move(&self.game, nodes)
            .map(|mv| encode(&mv).to_vec())
            .unwrap_or_default()
    }

    /// Winner or draw state, see the module docs.
    pub fn status(&self) -> u8 {
        status_code(self.game.outcome())
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
    use abalone_core::board::Board;
    use abalone_core::moves::{legal_moves, Player};

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
    fn ejected_counts_start_at_zero_for_both_sides() {
        let engine = Engine::new();
        assert_eq!(engine.ejected(1), 0);
        assert_eq!(engine.ejected(2), 0);
    }

    #[test]
    fn status_codes() {
        assert_eq!(status_code(None), 0);
        assert_eq!(status_code(Some(Outcome::Win(Player::Black))), 1);
        assert_eq!(status_code(Some(Outcome::Win(Player::White))), 2);
        assert_eq!(status_code(Some(Outcome::Draw)), 3);
    }

    #[test]
    fn draw_reason_codes() {
        use abalone_core::game::DrawReason;
        assert_eq!(draw_reason_code(None), 0);
        assert_eq!(draw_reason_code(Some(DrawReason::Repetition)), 1);
        assert_eq!(draw_reason_code(Some(DrawReason::NoEjectionCap)), 2);
    }
}
