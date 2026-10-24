#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Board, Cell};
    use crate::encounter::echo::echo_boss;
    use crate::encounter::telemetry::{AttemptResult, DeathCause};
    use crate::encounter::Encounter;
    use crate::game::Game;
    use crate::moves::Player;

    type P = (i32, i32);

    fn arena(black: &[P], white: &[P], to_move: Player, ejected: [u8; 2]) -> Arena {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        let game = Game::from_position(board, to_move, ejected);
        Arena::Plain(Encounter::new(game, echo_boss(), 0), LadderBoss::Echo)
    }

    #[test]
    fn every_boss_has_an_id_and_a_budget() {
        let ids: Vec<_> = LadderBoss::ALL.iter().map(|b| b.id()).collect();
        assert_eq!(ids, ["echo", "hull", "chaplain", "choir"]);
        let budgets: Vec<_> = LadderBoss::ALL.iter().map(|b| b.node_budget()).collect();
        assert_eq!(budgets, [400, 3000, 2000, 1500]);
    }

    #[test]
    fn player_budgets_are_4x_1x_and_half_of_the_boss_budget() {
        assert_eq!(player_budgets(LadderBoss::Echo), [1600, 400, 200]);
        assert_eq!(player_budgets(LadderBoss::Hull), [12000, 3000, 1500]);
    }

    #[test]
    fn the_player_wins_a_won_position() {
        let a = arena(&[(2, 0), (3, 0)], &[(4, 0), (-4, 4)], Player::Black, [5, 0]);
        let r = play_out(a, 7, 2, 50, 300);
        assert_eq!((r.boss, r.seed, r.attempt), ("echo", 7, 2));
        assert_eq!((r.result, r.plies, r.death), (AttemptResult::Won, 1, None));
        assert_eq!((r.player_marbles, r.boss_marbles), (2, 1));
    }

    #[test]
    fn the_boss_wins_a_lost_position_by_a_push() {
        let a = arena(
            &[(-4, 0), (3, 3)],
            &[(-2, 0), (-3, 0)],
            Player::White,
            [0, 5],
        );
        let r = play_out(a, 0, 1, 50, 300);
        assert_eq!(r.result, AttemptResult::Lost);
        assert_eq!(r.death, Some(DeathCause::Push));
        assert_eq!(r.plies, 1);
    }

    #[test]
    fn a_game_that_hits_the_ply_cap_is_a_capped_loss() {
        let r = play_attempt(LadderBoss::Echo, 0, 1, 50, 4);
        assert_eq!(r.plies, 4);
        assert_eq!(r.result, AttemptResult::Lost);
        assert_eq!(r.death, Some(DeathCause::PlyCap));
    }

    #[test]
    fn all_four_bosses_play_a_few_plies() {
        for boss in LadderBoss::ALL {
            let r = play_attempt(boss, 1, 2, 30, 6);
            assert_eq!((r.boss, r.plies, r.attempt), (boss.id(), 6, 2), "{boss:?}");
        }
    }

    #[test]
    fn the_same_seed_replays_the_same_attempt() {
        let a = play_attempt(LadderBoss::Hull, 5, 1, 60, 12);
        assert_eq!(a, play_attempt(LadderBoss::Hull, 5, 1, 60, 12));
    }

    #[test]
    fn a_tiny_ladder_runs_two_seeds_and_aggregates() {
        let report = run_ladder(LadderBoss::Echo, 40, 2, 20);
        assert_eq!(report.records.len(), 2);
        let attempts: Vec<_> = report.records.iter().map(|r| (r.seed, r.attempt)).collect();
        assert_eq!(attempts, [(0, 1), (1, 2)]);
        let s = &report.summary;
        assert_eq!((s.boss, s.player_budget, s.attempts), ("echo", 40, 2));
        assert!(s.median_plies > 0.0 && s.median_plies <= 20.0);
    }
}
