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
