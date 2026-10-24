//! Telemetry of one encounter attempt and its aggregation (docs/specs/game-design.md section 8).
//! Pure data and functions: the engine does no I/O, a record encodes to one JSON line and the
//! caller decides where it goes (the player exports a file, the bot ladder prints a table).

/// How an attempt ended for the player. A draw counts as a loss, like everywhere in PvE.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AttemptResult {
    Won,
    Lost,
}

impl AttemptResult {
    pub fn as_str(self) -> &'static str {
        match self {
            AttemptResult::Won => "won",
            AttemptResult::Lost => "lost",
        }
    }
}

/// What ended a lost attempt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DeathCause {
    /// Plain Abalone: the boss pushed player marbles off.
    Push,
    /// A boss rule removed the marbles: the Hull rim cracks.
    RimEjection,
    /// Boss conversion ate the material: the Chaplain flips.
    Conversion,
    /// The boss pushed with a mirrored move: the Echo.
    Mirror,
    /// Repetition or the no-ejection cap.
    Draw,
    /// The ladder hit its ply cap before anyone won.
    PlyCap,
}

impl DeathCause {
    /// Stable id used in the JSON lines.
    pub fn as_str(self) -> &'static str {
        match self {
            DeathCause::Push => "push",
            DeathCause::RimEjection => "rim_ejection",
            DeathCause::Conversion => "conversion",
            DeathCause::Mirror => "mirror",
            DeathCause::Draw => "draw",
            DeathCause::PlyCap => "ply_cap",
        }
    }
}

/// Player marbles lost during an attempt, by source.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Losses {
    /// Pushed off by a plain boss move.
    pub pushed: u8,
    /// Removed by a boss rule hook (rim crack).
    pub rim: u8,
    /// Pushed off by a boss move that mirrored a player move.
    pub mirrored: u8,
    /// Flipped to the boss.
    pub converted: u8,
}

/// Names the cause of a lost attempt: the ply cap, then a draw, else the source that took the
/// most player marbles. A tie goes to the boss twist (rim, conversion, mirror) over a plain push.
pub fn classify_death(draw: bool, capped: bool, losses: &Losses) -> DeathCause {
    if capped {
        return DeathCause::PlyCap;
    }
    if draw {
        return DeathCause::Draw;
    }
    let ranked = [
        (losses.rim, DeathCause::RimEjection),
        (losses.converted, DeathCause::Conversion),
        (losses.mirrored, DeathCause::Mirror),
        (losses.pushed, DeathCause::Push),
    ];
    let most = ranked.iter().map(|r| r.0).max().unwrap_or(0);
    ranked
        .iter()
        .find(|r| r.0 > 0 && r.0 == most)
        .map_or(DeathCause::Push, |r| r.1)
}

/// One finished encounter attempt.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AttemptRecord {
    pub boss: &'static str,
    pub seed: u64,
    pub attempt: u32,
    pub result: AttemptResult,
    pub plies: u32,
    /// Highest phase reached, 0 for the first.
    pub max_phase: usize,
    /// `None` when the player won.
    pub death: Option<DeathCause>,
    pub player_marbles: u8,
    pub boss_marbles: u8,
    /// Player marbles flipped to the boss during the attempt.
    pub conversions: u8,
}

impl AttemptRecord {
    /// The record as one JSON object on one line. The ids are fixed ASCII, so no escaping.
    pub fn to_json_line(&self) -> String {
        let death = self
            .death
            .map_or("null".to_string(), |d| format!("\"{}\"", d.as_str()));
        format!(
            "{{\"boss\":\"{}\",\"seed\":{},\"attempt\":{},\"result\":\"{}\",\"plies\":{},\
             \"max_phase\":{},\"death\":{},\"player_marbles\":{},\"boss_marbles\":{},\
             \"conversions\":{}}}",
            self.boss,
            self.seed,
            self.attempt,
            self.result.as_str(),
            self.plies,
            self.max_phase,
            death,
            self.player_marbles,
            self.boss_marbles,
            self.conversions
        )
    }
}

/// Aggregate of the attempts of one boss against one player budget.
#[derive(Clone, Debug, PartialEq)]
pub struct Summary {
    pub boss: &'static str,
    pub player_budget: u32,
    pub attempts: u32,
    pub wins: u32,
    pub win_rate: f64,
    pub median_plies: f64,
    /// Highest phase any attempt reached.
    pub max_phase: usize,
}

/// Aggregates `records`. Empty input gives zeros.
pub fn summarize(boss: &'static str, player_budget: u32, records: &[AttemptRecord]) -> Summary {
    let attempts = records.len() as u32;
    let wins = records
        .iter()
        .filter(|r| r.result == AttemptResult::Won)
        .count() as u32;
    let mut plies: Vec<u32> = records.iter().map(|r| r.plies).collect();
    plies.sort_unstable();
    let mid = plies.len() / 2;
    let median_plies = if plies.is_empty() {
        0.0
    } else if plies.len() % 2 == 1 {
        f64::from(plies[mid])
    } else {
        f64::from(plies[mid - 1] + plies[mid]) / 2.0
    };
    Summary {
        boss,
        player_budget,
        attempts,
        wins,
        win_rate: f64::from(wins) / f64::from(attempts.max(1)),
        median_plies,
        max_phase: records.iter().map(|r| r.max_phase).max().unwrap_or(0),
    }
}

/// Deaths per cause id, only the causes seen, in the order of [`DeathCause`].
pub fn death_counts(records: &[AttemptRecord]) -> Vec<(&'static str, u32)> {
    [
        DeathCause::Push,
        DeathCause::RimEjection,
        DeathCause::Conversion,
        DeathCause::Mirror,
        DeathCause::Draw,
        DeathCause::PlyCap,
    ]
    .into_iter()
    .map(|c| {
        let n = records.iter().filter(|r| r.death == Some(c)).count() as u32;
        (c.as_str(), n)
    })
    .filter(|&(_, n)| n > 0)
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(result: AttemptResult, plies: u32, max_phase: usize) -> AttemptRecord {
        AttemptRecord {
            boss: "hull",
            seed: 3,
            attempt: 4,
            result,
            plies,
            max_phase,
            death: match result {
                AttemptResult::Won => None,
                AttemptResult::Lost => Some(DeathCause::RimEjection),
            },
            player_marbles: 8,
            boss_marbles: 9,
            conversions: 0,
        }
    }

    fn losses(pushed: u8, rim: u8, mirrored: u8, converted: u8) -> Losses {
        Losses {
            pushed,
            rim,
            mirrored,
            converted,
        }
    }

    #[test]
    fn a_capped_game_is_a_ply_cap_death() {
        assert_eq!(
            classify_death(false, true, &losses(5, 0, 0, 0)),
            DeathCause::PlyCap
        );
    }

    #[test]
    fn a_draw_is_a_draw_death() {
        assert_eq!(
            classify_death(true, false, &losses(5, 0, 0, 0)),
            DeathCause::Draw
        );
    }

    #[test]
    fn the_biggest_loss_source_names_the_death() {
        let cause = |l| classify_death(false, false, &l);
        assert_eq!(cause(losses(1, 4, 0, 0)), DeathCause::RimEjection);
        assert_eq!(cause(losses(1, 0, 0, 4)), DeathCause::Conversion);
        assert_eq!(cause(losses(1, 0, 4, 0)), DeathCause::Mirror);
        assert_eq!(cause(losses(4, 1, 1, 1)), DeathCause::Push);
    }

    #[test]
    fn ties_go_to_the_boss_twist_and_no_loss_is_a_plain_push() {
        let cause = |l| classify_death(false, false, &l);
        assert_eq!(cause(losses(2, 2, 0, 0)), DeathCause::RimEjection);
        assert_eq!(cause(losses(2, 0, 0, 2)), DeathCause::Conversion);
        assert_eq!(cause(losses(2, 0, 2, 0)), DeathCause::Mirror);
        assert_eq!(cause(losses(0, 0, 0, 0)), DeathCause::Push);
    }

    #[test]
    fn names_are_stable_ids() {
        assert_eq!(AttemptResult::Won.as_str(), "won");
        assert_eq!(AttemptResult::Lost.as_str(), "lost");
        let all = [
            (DeathCause::Push, "push"),
            (DeathCause::RimEjection, "rim_ejection"),
            (DeathCause::Conversion, "conversion"),
            (DeathCause::Mirror, "mirror"),
            (DeathCause::Draw, "draw"),
            (DeathCause::PlyCap, "ply_cap"),
            (DeathCause::BossStuck, "boss_stuck"),
        ];
        for (cause, name) in all {
            assert_eq!(cause.as_str(), name);
        }
    }

    #[test]
    fn a_lost_attempt_encodes_as_one_json_line() {
        assert_eq!(
            record(AttemptResult::Lost, 57, 1).to_json_line(),
            r#"{"boss":"hull","seed":3,"attempt":4,"result":"lost","plies":57,"max_phase":1,"death":"rim_ejection","player_marbles":8,"boss_marbles":9,"conversions":0}"#
        );
    }

    #[test]
    fn a_won_attempt_has_a_null_death() {
        let line = record(AttemptResult::Won, 90, 2).to_json_line();
        assert!(line.contains(r#""result":"won""#));
        assert!(
            line.ends_with(r#""death":null,"player_marbles":8,"boss_marbles":9,"conversions":0}"#)
        );
        assert!(!line.contains('\n'));
    }

    #[test]
    fn summary_counts_wins_and_takes_the_even_median() {
        let records = [
            record(AttemptResult::Won, 10, 2),
            record(AttemptResult::Lost, 20, 0),
            record(AttemptResult::Lost, 30, 1),
            record(AttemptResult::Lost, 41, 1),
        ];
        let s = summarize("hull", 3000, &records);
        assert_eq!((s.boss, s.player_budget), ("hull", 3000));
        assert_eq!((s.attempts, s.wins), (4, 1));
        assert_eq!(s.win_rate, 0.25);
        assert_eq!(s.median_plies, 25.0);
        assert_eq!(s.max_phase, 2);
    }

    #[test]
    fn summary_takes_the_odd_median_whatever_the_order() {
        let records = [
            record(AttemptResult::Lost, 90, 0),
            record(AttemptResult::Lost, 10, 0),
            record(AttemptResult::Lost, 30, 0),
        ];
        assert_eq!(summarize("hull", 1, &records).median_plies, 30.0);
    }

    #[test]
    fn summary_of_nothing_is_all_zero() {
        let s = summarize("hull", 1, &[]);
        assert_eq!((s.attempts, s.wins, s.max_phase), (0, 0, 0));
        assert_eq!((s.win_rate, s.median_plies), (0.0, 0.0));
    }

    #[test]
    fn death_counts_list_only_the_causes_seen() {
        let mut mirror = record(AttemptResult::Lost, 5, 0);
        mirror.death = Some(DeathCause::Mirror);
        let records = [
            record(AttemptResult::Won, 10, 0),
            record(AttemptResult::Lost, 20, 0),
            record(AttemptResult::Lost, 30, 0),
            mirror,
        ];
        assert_eq!(
            death_counts(&records),
            vec![("rim_ejection", 2), ("mirror", 1)]
        );
        assert!(death_counts(&[]).is_empty());
    }
}
