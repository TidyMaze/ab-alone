//! Debug terminal client: prints the board as ASCII, reads moves from stdin, plays them with `Game::play`.
//! Move notation and board layout: docs/specs/rules.md sections 1 and 4.

use std::io::{BufRead, Write};

use abalone_core::board::{Board, Cell};
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
        match self {
            ParseError::Empty => "empty input",
            ParseError::MissingArrow => "missing '>' before the direction",
            ParseError::NoCell => "no cell before '>'",
            ParseError::BadCell => "cell must look like (q,r), for example (0,0)",
            ParseError::BadDirection => "direction must be E, W, NE, SW, NW or SE",
        }
    }
}

/// Parses `(q,r)(q,r)>E`: the selected cells, then `>`, then the direction.
pub fn parse_move(input: &str) -> Result<Move, ParseError> {
    let input = input.trim();
    if input.is_empty() {
        return Err(ParseError::Empty);
    }
    let (cells, dir) = input.split_once('>').ok_or(ParseError::MissingArrow)?;
    let dir = match dir {
        "E" => Direction::E,
        "W" => Direction::W,
        "NE" => Direction::NE,
        "SW" => Direction::SW,
        "NW" => Direction::NW,
        "SE" => Direction::SE,
        _ => return Err(ParseError::BadDirection),
    };
    Ok(Move {
        cells: parse_cells(cells)?,
        dir,
    })
}

fn parse_cells(text: &str) -> Result<Vec<(i32, i32)>, ParseError> {
    if text.is_empty() {
        return Err(ParseError::NoCell);
    }
    let mut cells = Vec::new();
    let mut rest = text;
    while !rest.is_empty() {
        let inner = rest.strip_prefix('(').ok_or(ParseError::BadCell)?;
        let (pair, after) = inner.split_once(')').ok_or(ParseError::BadCell)?;
        let (q, r) = pair.split_once(',').ok_or(ParseError::BadCell)?;
        let q = q.parse().map_err(|_| ParseError::BadCell)?;
        let r = r.parse().map_err(|_| ParseError::BadCell)?;
        cells.push((q, r));
        rest = after;
    }
    Ok(cells)
}

/// Board as ASCII: a header with columns 1 to 9, then rows a (r = -4) to i (r = 4).
/// Column n is q = n - 5. `B` Black, `W` White, `.` empty, blank off the board.
pub fn render(board: &Board) -> String {
    let mut lines = vec!["  1 2 3 4 5 6 7 8 9".to_string()];
    for (row, letter) in ('a'..='i').enumerate() {
        let r = row as i32 - 4;
        let slots: Vec<String> = (1..=9)
            .map(|column| {
                let mark = match board.get(column - 5, r) {
                    None => ' ',
                    Some(Cell::Empty) => '.',
                    Some(Cell::Black) => 'B',
                    Some(Cell::White) => 'W',
                };
                mark.to_string()
            })
            .collect();
        lines.push(
            format!("{letter} {}", slots.join(" "))
                .trim_end()
                .to_string(),
        );
    }
    lines.join("\n")
}

/// Last line of a finished game: `Draw` or `Win(White)` (Debug format, no branch to cover).
pub fn outcome_line(outcome: Outcome) -> String {
    format!("{outcome:?}")
}

/// Reads moves from `input` until the game is won or drawn, or the input ends.
/// A failed read or write panics, as `println!` does: a broken stdout cannot be reported anywhere else.
pub fn run(input: impl BufRead, mut out: impl Write) {
    const IO: &str = "terminal I/O";
    let mut game = Game::new();
    writeln!(out, "{}", render(game.board())).expect(IO);
    let mut lines = input.lines();
    loop {
        write!(out, "move> ").expect(IO);
        out.flush().expect(IO);
        let Some(line) = lines.next() else { break };
        match parse_move(&line.expect(IO)) {
            Err(error) => writeln!(out, "error: {}", error.message()).expect(IO),
            Ok(mv) => {
                if let Err(error) = game.play(&mv) {
                    writeln!(out, "error: illegal move: {error:?}").expect(IO);
                } else {
                    writeln!(out, "{}", render(game.board())).expect(IO);
                    if let Some(outcome) = game.outcome() {
                        writeln!(out, "{}", outcome_line(outcome)).expect(IO);
                        return;
                    }
                }
            }
        }
    }
    writeln!(out, "input ended").expect(IO);
}

#[cfg(test)]
mod tests {
    use super::*;
    use abalone_core::board::Cell;
    use abalone_core::moves::Player;

    fn parsed(input: &str) -> Move {
        parse_move(input).unwrap()
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
        assert_eq!(parse_move("(0,x)>E"), Err(ParseError::BadCell));
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
    fn renders_seats_3_to_6_by_their_number() {
        let mut board = Board::empty();
        board.set(0, 0, Cell::Seat3);
        board.set(1, 0, Cell::Seat4);
        board.set(2, 0, Cell::Seat5);
        board.set(3, 0, Cell::Seat6);
        assert_eq!(render(&board).lines().nth(5), Some("e . . . . 3 4 5 6 ."));
    }

    #[test]
    fn outcome_lines() {
        assert_eq!(outcome_line(Outcome::Win(Player::White)), "Win(White)");
        assert_eq!(outcome_line(Outcome::Win(Player::Black)), "Win(Black)");
        assert_eq!(outcome_line(Outcome::Draw), "Draw");
    }

    #[test]
    fn invalid_input_is_reported_and_asked_again() {
        let mut out = Vec::new();
        run(&b"nope\n\n(0,0)>E\n"[..], &mut out);
        let text = String::from_utf8(out).unwrap();
        assert!(text.contains("error: missing '>' before the direction\n"));
        assert!(text.contains("error: empty input\n"));
        assert!(text.contains("error: illegal move: "));
        assert!(text.ends_with("input ended\n"));
    }

    #[test]
    fn a_threefold_repetition_ends_the_run_with_a_draw() {
        let mut out = Vec::new();
        run(
            &b"(1,3)>NE\n(2,-2)>SE\n(2,2)>SW\n(2,-1)>NW\n(1,3)>NE\n(2,-2)>SE\n(2,2)>SW\n(2,-1)>NW\n"[..],
            &mut out,
        );
        let text = String::from_utf8(out).unwrap();
        assert!(text.ends_with("Draw\n"));
        assert!(!text.contains("input ended"));
    }

    #[test]
    fn input_ending_before_the_game_is_reported() {
        let mut out = Vec::new();
        run(&b""[..], &mut out);
        assert!(String::from_utf8(out).unwrap().ends_with("input ended\n"));
    }
}
