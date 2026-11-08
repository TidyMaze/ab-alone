//! A recorded boss game as text, to store a winning game and replay it as a regression test
//! (docs/specs/boss-balance.md). One header line per field, then one move per line: the cells as
//! `q,r` joined by `;`, a space, the direction.
//!
//! ```text
//! boss: echo
//! seed: 3
//! player_budget: 4000
//! boss_budget: 400
//! moves:
//! -4,5;-3,5 NE
//! ```

use crate::encounter::ladder::{replay, LadderBoss};
use crate::encounter::PveResult;
use crate::moves::{Direction, Move};

/// A stored game: the boss and seed to start it, the budgets it was recorded with (information,
/// the replay does not search) and the moves of both sides.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Fixture {
    pub boss: LadderBoss,
    pub seed: u64,
    pub player_budget: u32,
    pub boss_budget: u32,
    pub moves: Vec<Move>,
}

const DIRECTIONS: [(Direction, &str); 6] = [
    (Direction::E, "E"),
    (Direction::W, "W"),
    (Direction::NE, "NE"),
    (Direction::SW, "SW"),
    (Direction::NW, "NW"),
    (Direction::SE, "SE"),
];

fn move_text(mv: &Move) -> String {
    let cells: Vec<String> = mv.cells.iter().map(|(q, r)| format!("{q},{r}")).collect();
    let dir = DIRECTIONS
        .iter()
        .find(|d| d.0 == mv.dir)
        .map_or("", |d| d.1);
    format!("{} {dir}", cells.join(";"))
}

fn parse_cell(text: &str) -> Option<(i32, i32)> {
    let (q, r) = text.split_once(',')?;
    Some((q.parse().ok()?, r.parse().ok()?))
}

fn parse_move(line: &str) -> Result<Move, String> {
    let bad = || format!("bad move line: {line:?}");
    let (cells, dir) = line.split_once(' ').ok_or_else(bad)?;
    let dir = DIRECTIONS.iter().find(|d| d.1 == dir).ok_or_else(bad)?.0;
    let cells = cells.split(';').map(parse_cell).collect::<Option<_>>();
    Ok(Move {
        cells: cells.ok_or_else(bad)?,
        dir,
    })
}

fn field<'a>(lines: &mut impl Iterator<Item = &'a str>, name: &str) -> Result<&'a str, String> {
    lines
        .next()
        .and_then(|l| l.strip_prefix(name))
        .and_then(|l| l.strip_prefix(": "))
        .ok_or_else(|| format!("expected the field {name:?}"))
}

fn number<'a, T: std::str::FromStr>(
    lines: &mut impl Iterator<Item = &'a str>,
    name: &str,
) -> Result<T, String> {
    let text = field(lines, name)?;
    text.parse().map_err(|_| format!("{name} is not a number"))
}

impl Fixture {
    /// The fixture as text, the format of the module doc.
    pub fn to_text(&self) -> String {
        let mut out = format!(
            "boss: {}\nseed: {}\nplayer_budget: {}\nboss_budget: {}\nmoves:\n",
            self.boss.id(),
            self.seed,
            self.player_budget,
            self.boss_budget
        );
        for mv in &self.moves {
            out.push_str(&move_text(mv));
            out.push('\n');
        }
        out
    }

    /// Reads the text format back.
    pub fn parse(text: &str) -> Result<Fixture, String> {
        let mut lines = text.lines();
        let id = field(&mut lines, "boss")?;
        let boss = LadderBoss::from_id(id).ok_or_else(|| format!("unknown boss {id:?}"))?;
        let seed = number(&mut lines, "seed")?;
        let player_budget = number(&mut lines, "player_budget")?;
        let boss_budget = number(&mut lines, "boss_budget")?;
        if lines.next() != Some("moves:") {
            return Err("expected the line \"moves:\"".to_string());
        }
        let moves = lines
            .filter(|l| !l.is_empty())
            .map(parse_move)
            .collect::<Result<_, _>>()?;
        Ok(Fixture {
            boss,
            seed,
            player_budget,
            boss_budget,
            moves,
        })
    }

    /// Plays the game through the encounter API: `Ok(Some(Won))` for a recorded player win.
    pub fn replay(&self) -> Result<Option<PveResult>, String> {
        replay(self.boss, self.seed, &self.moves)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encounter::ladder::play_attempt_moves;

    fn sample() -> Fixture {
        let (_, moves) = play_attempt_moves(LadderBoss::Echo, 3, 4, 50, 4);
        Fixture {
            boss: LadderBoss::Echo,
            seed: 3,
            player_budget: 50,
            boss_budget: 400,
            moves,
        }
    }

    #[test]
    fn text_round_trips_and_replays() {
        let f = sample();
        let text = f.to_text();
        assert!(
            text.starts_with("boss: echo\nseed: 3\nplayer_budget: 50\nboss_budget: 400\nmoves:\n")
        );
        assert_eq!(Fixture::parse(&text), Ok(f.clone()));
        assert_eq!(f.replay(), Ok(None));
    }

    #[test]
    fn a_move_line_has_cells_then_direction() {
        let mv = Move {
            cells: vec![(-4, 5), (-3, 5)],
            dir: Direction::SW,
        };
        assert_eq!(move_text(&mv), "-4,5;-3,5 SW");
        assert_eq!(parse_move("-4,5;-3,5 SW"), Ok(mv));
    }

    #[test]
    fn every_direction_round_trips() {
        for (dir, _) in DIRECTIONS {
            let mv = Move {
                cells: vec![(0, 0)],
                dir,
            };
            assert_eq!(parse_move(&move_text(&mv)), Ok(mv));
        }
    }

    #[test]
    fn bad_input_is_named() {
        let ok = sample().to_text();
        let cases = [
            ("", "expected the field \"boss\""),
            ("boss: nobody\n", "unknown boss"),
            ("boss: echo\n", "expected the field \"seed\""),
            ("boss: echo\nseed: x\n", "seed is not a number"),
            (
                "boss: echo\nseed: 1\n",
                "expected the field \"player_budget\"",
            ),
            ("boss: echo\nseed: 1\nplayer_budget: 2\n", "\"boss_budget\""),
            (
                "boss: echo\nseed: 1\nplayer_budget: 2\nboss_budget: x\n",
                "boss_budget is not",
            ),
            (&ok.replace("moves:", "moves"), "expected the line"),
            (
                &ok.replace(" NE", " UP").replace(" E\n", " UP\n"),
                "bad move line",
            ),
            (&format!("{ok}1,x NE\n"), "bad move line"),
            (&format!("{ok}x,1 NE\n"), "bad move line"),
            (&format!("{ok}11 NE\n"), "bad move line"),
            (&format!("{ok}nospace\n"), "bad move line"),
        ];
        for (text, want) in cases {
            let err = Fixture::parse(text).unwrap_err();
            assert!(err.contains(want), "{err} should contain {want}");
        }
    }

    #[test]
    fn a_refused_move_fails_the_replay() {
        let mut f = sample();
        f.moves.truncate(1);
        f.moves[0].cells = vec![(0, 0)];
        assert!(f.replay().unwrap_err().contains("move 1 refused"));
    }
}
