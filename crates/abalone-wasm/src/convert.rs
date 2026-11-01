//! Encodings and conversions between core engine types and flat data structures.
//!
//! Encapsulates board serialization, move encoding/decoding strides,
//! status/result codes, and coordinate generators.

use abalone_core::board::{Board, Cell, Special, RADIUS};
use abalone_core::encounter::PveResult;
use abalone_core::game::{DrawReason, Outcome};
use abalone_core::moves::{Direction, Move, Player};

/// Integers per move record.
pub const MOVE_STRIDE: usize = 8;

/// Direction codes, the index is the code.
pub(crate) const DIRECTIONS: [Direction; 6] = [
    Direction::E,
    Direction::W,
    Direction::NE,
    Direction::SW,
    Direction::NW,
    Direction::SE,
];

/// The player of a side code: `1` Black, anything else White.
pub(crate) fn player(side: u8) -> Player {
    if side == 1 {
        Player::Black
    } else {
        Player::White
    }
}

pub(crate) fn side_code(player: Player) -> u8 {
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

/// Draw reason code, see the module docs.
pub fn draw_reason_code(reason: Option<DrawReason>) -> u8 {
    match reason {
        None => 0,
        Some(DrawReason::Repetition) => 1,
        Some(DrawReason::NoEjectionCap) => 2,
    }
}

/// Kind code of a special marble, see the module docs.
pub(crate) fn special_code(kind: Special) -> u8 {
    match kind {
        Special::Heavy => 1,
        Special::Anchor => 2,
        Special::Spark => 3,
    }
}

/// The special marble of a kind code, `None` for an unknown code.
pub(crate) fn special(code: u8) -> Option<Special> {
    [Special::Heavy, Special::Anchor, Special::Spark]
        .into_iter()
        .find(|&kind| special_code(kind) == code)
}

/// Result code of an encounter, see the module docs.
pub fn result_code(result: Option<PveResult>) -> u8 {
    match result {
        None => 0,
        Some(PveResult::Won) => 1,
        Some(PveResult::Lost) => 2,
    }
}

pub(crate) fn encode(mv: &Move) -> [i32; MOVE_STRIDE] {
    let mut record = [0; MOVE_STRIDE];
    record[0] = mv.cells.len() as i32;
    record[1] = DIRECTIONS.iter().position(|&d| d == mv.dir).unwrap_or(0) as i32;
    for (i, &(q, r)) in mv.cells.iter().enumerate() {
        record[2 + 2 * i] = q;
        record[3 + 2 * i] = r;
    }
    record
}

pub(crate) fn decode(record: &[i32]) -> Result<Move, String> {
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

/// Board value of a cell a boss removed.
pub(crate) const VANISHED: u8 = 3;

/// Added to the code of a cracked cell of the battle royale arena.
pub(crate) const CRACKED: u8 = 8;

/// The cells of the hexagon of `radius` in board order, see the module docs.
pub(crate) fn cells_of(radius: i32) -> impl Iterator<Item = (i32, i32)> {
    (-radius..=radius)
        .flat_map(move |r| (-radius..=radius).map(move |q| (q, r)))
        .filter(move |&(q, r)| (q + r).abs() <= radius)
}

/// The 61 cells of the hexagon in board order, see the module docs.
pub(crate) fn cells() -> impl Iterator<Item = (i32, i32)> {
    cells_of(RADIUS)
}

/// Board code of a cell's content, `None` for a vanished cell, see the module docs.
pub(crate) fn code(cell: Option<Cell>) -> u8 {
    match cell {
        Some(Cell::Empty) => 0,
        Some(Cell::Black) => 1,
        Some(Cell::White) => 2,
        Some(seat) => seat as u8 + 1,
        None => VANISHED,
    }
}

/// Board code of `(q, r)`, see the module docs.
pub(crate) fn cell_code(board: &Board, q: i32, r: i32) -> u8 {
    code(board.get(q, r))
}

/// The cells of a board in board order, see the module docs: the 61, then each ring beyond them
/// in turn (ring 5 of The Ballast Mind, rings 5 to 7 of The Dual Room), so no index shifts.
pub(crate) fn board_cells(radius: i32) -> impl Iterator<Item = (i32, i32)> {
    let ring = |(q, r): (i32, i32)| q.abs().max(r.abs()).max((q + r).abs());
    cells()
        .chain((RADIUS + 1..=radius).flat_map(move |k| cells_of(k).filter(move |&c| ring(c) == k)))
}

/// The cells of the board, vanished ones included, so the indices never shift.
pub(crate) fn board_bytes(board: &Board) -> Vec<u8> {
    board_cells(board.radius())
        .map(|(q, r)| cell_code(board, q, r))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_codes() {
        assert_eq!(status_code(None), 0);
        assert_eq!(status_code(Some(Outcome::Win(Player::Black))), 1);
        assert_eq!(status_code(Some(Outcome::Win(Player::White))), 2);
        assert_eq!(status_code(Some(Outcome::Draw)), 3);
    }

    #[test]
    fn draw_reason_codes() {
        assert_eq!(draw_reason_code(None), 0);
        assert_eq!(draw_reason_code(Some(DrawReason::Repetition)), 1);
        assert_eq!(draw_reason_code(Some(DrawReason::NoEjectionCap)), 2);
        assert_eq!(draw_reason_code(Some(DrawReason::Blocked)), 3);
    }

    #[test]
    fn special_codes_go_both_ways() {
        for (kind, code) in [
            (Special::Heavy, 1),
            (Special::Anchor, 2),
            (Special::Spark, 3),
        ] {
            assert_eq!(special_code(kind), code);
            assert_eq!(special(code), Some(kind));
        }
        assert_eq!(special(0), None);
        assert_eq!(special(4), None);
    }

    #[test]
    fn result_codes() {
        assert_eq!(result_code(None), 0);
        assert_eq!(result_code(Some(PveResult::Won)), 1);
        assert_eq!(result_code(Some(PveResult::Lost)), 2);
    }

    #[test]
    fn board_order_is_rows_from_r_minus_4_q_ascending() {
        let cells: Vec<(i32, i32)> = cells().collect();
        assert_eq!(cells.len(), 61);
        assert_eq!(cells[0], (0, -4));
        assert_eq!(cells[60], (0, 4));
        assert!(cells.windows(2).all(|w| {
            let (a, b) = (w[0], w[1]);
            b.1 > a.1 || (b.1 == a.1 && b.0 > a.0)
        }));
    }

    #[test]
    fn a_board_holds_its_rings_one_after_the_other_so_no_index_shifts() {
        let ring = |(q, r): (i32, i32)| q.abs().max(r.abs()).max((q + r).abs());
        let nine: Vec<(i32, i32)> = board_cells(9).collect();
        assert_eq!(nine.len(), 271);
        assert_eq!(board_cells(7).count(), 169, "The Dual Room's radius 7 scan");
        let five: Vec<(i32, i32)> = board_cells(5).collect();
        assert_eq!(five.len(), 91);
        assert_eq!(
            nine[..91],
            five[..],
            "The Ballast Mind's 91 keep their slots"
        );
        assert_eq!(board_cells(4).count(), 61);
        assert!(nine
            .windows(2)
            .all(|w| ring(w[0]).max(4) <= ring(w[1]).max(4)));
        assert_eq!(nine[91], (0, -6), "ring 6 starts on its first row");
    }

    #[test]
    fn board_bytes_give_seats_3_to_6_the_codes_4_to_7() {
        let mut b = Board::empty();
        b.set(0, 0, Cell::Seat3);
        b.set(1, 0, Cell::Seat4);
        b.set(2, 0, Cell::Seat5);
        b.set(3, 0, Cell::Seat6);
        let bytes = board_bytes(&b);
        let at = |q: i32, r: i32| cells().position(|c| c == (q, r)).map(|i| bytes[i]).unwrap();
        assert_eq!(at(0, 0), 4);
        assert_eq!(at(1, 0), 5);
        assert_eq!(at(2, 0), 6);
        assert_eq!(at(3, 0), 7);
    }
}
