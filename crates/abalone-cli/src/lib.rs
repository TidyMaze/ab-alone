//! Debug terminal client: prints the board as ASCII, reads moves from stdin, plays them with `Game::play`.
//! Move notation and board layout: docs/specs/rules.md sections 1 and 4.

use std::io::{self, BufRead, Write};

use abalone_core::board::Board;
use abalone_core::game::{Game, Outcome};
use abalone_core::moves::{Direction, Move};

/// Why a line of input is not a move.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParseError {
    Empty,
    MissingArrow,
    NoCell,
    BadCell,
    BadDirection,
}

impl ParseError {
    /// One-line message printed after `error:`.
    pub fn message(&self) -> &'static str {
        todo!()
    }
}

/// Parses `(q,r)(q,r)>E`: the selected cells, then `>`, then the direction.
pub fn parse_move(input: &str) -> Result<Move, ParseError> {
    todo!()
}

/// Board as ASCII: a header with columns 1 to 9, then rows a (r = -4) to i (r = 4).
/// Column n is q = n - 5. `B` Black, `W` White, `.` empty, blank off the board.
pub fn render(board: &Board) -> String {
    todo!()
}

/// Last line of a finished game.
pub fn outcome_line(outcome: Outcome) -> String {
    todo!()
}

/// Reads moves from `input` until the game is won or drawn, or the input ends.
pub fn run(input: impl BufRead, mut out: impl Write) -> io::Result<()> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use abalone_core::board::Cell;
    use abalone_core::moves::Player;

    fn parsed(input: &str) -> Move {
        parse_move(input).unwrap_or_else(|e| panic!("{input:?} should parse, got {e:?}"))
    }

    #[test]
    fn parses_a_single_marble_in_each_direction() {
        let cases = [
            ("(0,0)>E", Direction::E),
            ("(0,0)>W", Direction::W),
            ("(0,0)>NE", Direction::NE),
            ("(0,0)>SW", Direction::SW),
            ("(0,0)>NW", Direction::NW),
            ("(0,0)>SE", Direction::SE),
        ];
        for (input, dir) in cases {
            assert_eq!(
                parsed(input),
                Move {
                    cells: vec![(0, 0)],
                    dir
                }
            );
        }
    }

    #[test]
    fn parses_a_pair_and_a_triple_keeping_cell_order() {
        assert_eq!(
            parsed("(-1,2)(0,2)>E"),
            Move {
                cells: vec![(-1, 2), (0, 2)],
                dir: Direction::E
            }
        );
        assert_eq!(
            parsed("(0,4)(0,3)(0,2)>NW"),
            Move {
                cells: vec![(0, 4), (0, 3), (0, 2)],
                dir: Direction::NW
            }
        );
    }

    #[test]
    fn surrounding_whitespace_is_ignored() {
        assert_eq!(parsed("  (0,0)>SE \n"), parsed("(0,0)>SE"));
    }

    #[test]
    fn rejects_empty_input() {
        assert_eq!(parse_move(""), Err(ParseError::Empty));
        assert_eq!(parse_move("   "), Err(ParseError::Empty));
    }

    #[test]
    fn rejects_a_missing_arrow() {
        assert_eq!(parse_move("(0,0)SE"), Err(ParseError::MissingArrow));
        assert_eq!(parse_move("nope"), Err(ParseError::MissingArrow));
    }

    #[test]
    fn rejects_a_direction_with_no_cell() {
        assert_eq!(parse_move(">SE"), Err(ParseError::NoCell));
    }

    #[test]
    fn rejects_an_unknown_direction() {
        assert_eq!(parse_move("(0,0)>X"), Err(ParseError::BadDirection));
        assert_eq!(parse_move("(0,0)>se"), Err(ParseError::BadDirection));
        assert_eq!(parse_move("(0,0)>E>W"), Err(ParseError::BadDirection));
    }

    #[test]
    fn rejects_malformed_cells() {
        assert_eq!(parse_move("0,0>E"), Err(ParseError::BadCell));
        assert_eq!(parse_move("(0,0>E"), Err(ParseError::BadCell));
        assert_eq!(parse_move("(00)>E"), Err(ParseError::BadCell));
        assert_eq!(parse_move("(a,0)>E"), Err(ParseError::BadCell));
        assert_eq!(parse_move("(0,0)(1,1>E"), Err(ParseError::BadCell));
        assert_eq!(parse_move("(0,0) (1,1)>E"), Err(ParseError::BadCell));
    }

    #[test]
    fn every_error_has_its_message() {
        assert_eq!(ParseError::Empty.message(), "empty input");
        assert_eq!(
            ParseError::MissingArrow.message(),
            "missing '>' before the direction"
        );
        assert_eq!(ParseError::NoCell.message(), "no cell before '>'");
        assert_eq!(
            ParseError::BadCell.message(),
            "cell must look like (q,r), for example (0,0)"
        );
        assert_eq!(
            ParseError::BadDirection.message(),
            "direction must be E, W, NE, SW, NW or SE"
        );
    }

    #[test]
    fn renders_the_standard_start() {
        let expected = [
            "  1 2 3 4 5 6 7 8 9",
            "a         W W W W W",
            "b       W W W W W W",
            "c     . . W W W . .",
            "d   . . . . . . . .",
            "e . . . . . . . . .",
            "f . . . . . . . .",
            "g . . B B B . .",
            "h B B B B B B",
            "i B B B B B",
        ]
        .join("\n");
        assert_eq!(render(&Board::standard()), expected);
    }

    #[test]
    fn renders_one_black_and_one_white_marble() {
        let mut board = Board::empty();
        board.set(0, 0, Cell::Black);
        board.set(4, -4, Cell::White);
        let expected = [
            "  1 2 3 4 5 6 7 8 9",
            "a         . . . . W",
            "b       . . . . . .",
            "c     . . . . . . .",
            "d   . . . . . . . .",
            "e . . . . B . . . .",
            "f . . . . . . . .",
            "g . . . . . . .",
            "h . . . . . .",
            "i . . . . .",
        ]
        .join("\n");
        assert_eq!(render(&board), expected);
    }

    #[test]
    fn outcome_lines() {
        assert_eq!(outcome_line(Outcome::Win(Player::White)), "White wins");
        assert_eq!(outcome_line(Outcome::Win(Player::Black)), "Black wins");
        assert_eq!(outcome_line(Outcome::Draw), "Draw");
    }

    #[test]
    fn invalid_input_is_reported_and_asked_again() {
        let mut out = Vec::new();
        run(&b"nope\n\n(0,0)>E\n"[..], &mut out).unwrap();
        let text = String::from_utf8(out).unwrap();
        assert!(text.contains("error: missing '>' before the direction\n"));
        assert!(text.contains("error: empty input\n"));
        assert!(text.contains("error: illegal move: "));
        assert!(text.ends_with("input ended\n"));
    }

    #[test]
    fn input_ending_before_the_game_is_reported() {
        let mut out = Vec::new();
        run(&b""[..], &mut out).unwrap();
        assert!(String::from_utf8(out).unwrap().ends_with("input ended\n"));
    }
}
