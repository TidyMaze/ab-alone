//! Bot ladder (docs/specs/game-design.md section 8): a seeded alpha-beta bot plays one boss and
//! the attempts are aggregated into telemetry. The player bot is the plain node-limited search of
//! `search.rs`; the boss plays with its own node budget, never a clock, so a run is the same on
//! every machine. The ladder is slow: it runs from `cargo run --release --example ladder`, never
//! from the unit tests beyond a tiny run.

use crate::board::Cell;
use crate::encounter::chaplain::chaplain_boss;
use crate::encounter::choir::Choir;
use crate::encounter::echo::{echo_boss, echo_move, mirror_move};
use crate::encounter::hull::hull_boss;
use crate::encounter::telemetry::{
    classify_death, summarize, AttemptRecord, AttemptResult, DeathCause, Losses, Summary,
};
use crate::encounter::{marbles, Encounter, PveResult};
use crate::game::{Game, Outcome};
use crate::moves::{apply, legal_moves, Move, Player};
use crate::search::search;

/// A game longer than this many plies is stopped and counted as a loss.
pub const PLY_CAP: u32 = 300;
/// The first player moves of an attempt are random (seeded), so the seeds give different games
/// against a deterministic boss.
pub const OPENING_RANDOM_MOVES: u32 = 2;

/// The bosses the ladder can play.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LadderBoss {
    Echo,
    Hull,
    Chaplain,
    Choir,
}

impl LadderBoss {
    pub const ALL: [LadderBoss; 4] = [
        LadderBoss::Echo,
        LadderBoss::Hull,
        LadderBoss::Chaplain,
        LadderBoss::Choir,
    ];

    /// Stable id used in the telemetry.
    pub fn id(self) -> &'static str {
        match self {
            LadderBoss::Echo => "echo",
            LadderBoss::Hull => "hull",
            LadderBoss::Chaplain => "chaplain",
            LadderBoss::Choir => "choir",
        }
    }

    /// The boss search budget, the unit of the player budgets.
    pub fn node_budget(self) -> u32 {
        match self {
            LadderBoss::Echo => echo_boss().node_budget,
            LadderBoss::Hull => hull_boss().node_budget,
            LadderBoss::Chaplain => chaplain_boss().node_budget,
            LadderBoss::Choir => crate::encounter::choir::CHOIR_NODE_BUDGET,
        }
    }
}

/// Player node budgets of the ladder: 4x, 1x and 0.5x of the boss budget.
pub fn player_budgets(boss: LadderBoss) -> [u32; 3] {
    let b = boss.node_budget();
    [b * 4, b, b / 2]
}

/// A running encounter, whichever boss it is.
enum Arena {
    Plain(Encounter, LadderBoss),
    Choir(Choir),
}

impl Arena {
    fn new(boss: LadderBoss, seed: u64) -> Self {
        let plain = |def| Arena::Plain(Encounter::new(Game::new(), def, seed), boss);
        match boss {
            LadderBoss::Echo => plain(echo_boss()),
            LadderBoss::Hull => plain(hull_boss()),
            LadderBoss::Chaplain => plain(chaplain_boss()),
            LadderBoss::Choir => Arena::Choir(Choir::start()),
        }
    }

    fn kind(&self) -> LadderBoss {
        match self {
            Arena::Plain(_, kind) => *kind,
            Arena::Choir(_) => LadderBoss::Choir,
        }
    }

    fn game(&self) -> &Game {
        match self {
            Arena::Plain(enc, _) => enc.game(),
            Arena::Choir(choir) => choir.game(),
        }
    }

    fn phase(&self) -> usize {
        match self {
            Arena::Plain(enc, _) => enc.phase(),
            Arena::Choir(choir) => choir.phase(),
        }
    }

    fn result(&self) -> Option<PveResult> {
        match self {
            Arena::Plain(enc, _) => enc.result(),
            Arena::Choir(choir) => choir.result(),
        }
    }

    fn boss_move(&self) -> Option<Move> {
        match self {
            Arena::Plain(enc, LadderBoss::Echo) => echo_move(enc),
            Arena::Plain(enc, _) => enc.boss_search().map(|r| r.mv),
            Arena::Choir(choir) => choir.boss_move(),
        }
    }

    fn play(&mut self, mv: &Move) {
        match self {
            Arena::Plain(enc, _) => enc.play(mv).expect("the ladder plays legal moves"),
            Arena::Choir(choir) => choir.play(mv).expect("the ladder plays legal moves"),
        }
    }
}

/// splitmix64: a cheap seeded hash, enough to pick an opening move.
fn mix(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    x ^ (x >> 31)
}

/// The player bot move: a seeded random legal move for its first `opening` moves, then the plain
/// alpha-beta search with `budget` nodes. `None` when the player has no move (every marble was
/// converted).
fn player_move(game: &Game, seed: u64, index: u32, opening: u32, budget: u32) -> Option<Move> {
    if index < opening {
        let moves = legal_moves(game.board(), Player::Black);
        let pick = mix(seed ^ mix(u64::from(index))) % moves.len().max(1) as u64;
        moves.get(pick as usize).cloned()
    } else {
        search(game, budget).map(|r| r.mv)
    }
}

/// Plays `arena` to its end or to `ply_cap` plies and records it. A player with no move left lost
/// every marble to conversion, the only way to lose them all. `opening` is the number of
/// random first player moves.
fn play_out(
    mut arena: Arena,
    seed: u64,
    attempt: u32,
    player_budget: u32,
    opening: u32,
    ply_cap: u32,
) -> AttemptRecord {
    let echo = arena.kind() == LadderBoss::Echo;
    let mut losses = Losses::default();
    let mut max_phase = arena.phase();
    let (mut plies, mut player_moves, mut stuck) = (0, 0, false);
    while arena.game().outcome().is_none() && plies < ply_cap {
        let game = arena.game();
        let player_turn = game.to_move() == Player::Black;
        let mv = if player_turn {
            player_moves += 1;
            let Some(mv) = player_move(game, seed, player_moves - 1, opening, player_budget) else {
                stuck = true;
                break;
            };
            mv
        } else {
            arena.boss_move().expect("the boss has a move")
        };
        let boss_push = !player_turn & apply(game.board(), Player::White, &mv).is_ok_and(|a| a.1);
        let mirror = echo
            & game
                .history()
                .iter()
                .rev()
                .step_by(2)
                .take(2)
                .any(|p| mirror_move(&p.mv) == mv);
        let black = marbles(game.board(), Cell::Black);
        let lost_before = game.ejected(Player::White);
        arena.play(&mv);
        let game = arena.game();
        let lost = game.ejected(Player::White) - lost_before;
        let flipped = i32::from(black) - i32::from(marbles(game.board(), Cell::Black));
        losses.mirrored += u8::from(boss_push & mirror);
        losses.pushed += u8::from(boss_push & !mirror);
        losses.rim += lost.saturating_sub(u8::from(boss_push));
        losses.converted = losses
            .converted
            .saturating_add((flipped - i32::from(lost)).max(0) as u8);
        max_phase = max_phase.max(arena.phase());
        plies += 1;
    }
    let game = arena.game();
    let won = arena.result() == Some(PveResult::Won);
    let draw = game.outcome() == Some(Outcome::Draw);
    let capped = game.outcome().is_none();
    AttemptRecord {
        boss: arena.kind().id(),
        seed,
        attempt,
        result: if won {
            AttemptResult::Won
        } else {
            AttemptResult::Lost
        },
        plies,
        max_phase,
        death: (!won).then(|| {
            if stuck {
                DeathCause::Conversion
            } else {
                classify_death(draw, capped, &losses)
            }
        }),
        player_marbles: marbles(game.board(), Cell::Black),
        boss_marbles: marbles(game.board(), Cell::White),
        conversions: losses.converted,
    }
}

/// One seeded encounter of `boss` against the alpha-beta bot with `player_budget` nodes.
pub fn play_attempt(
    boss: LadderBoss,
    seed: u64,
    attempt: u32,
    player_budget: u32,
    ply_cap: u32,
) -> AttemptRecord {
    play_out(
        Arena::new(boss, seed),
        seed,
        attempt,
        player_budget,
        OPENING_RANDOM_MOVES,
        ply_cap,
    )
}

/// The attempts of one ladder cell and their aggregate.
#[derive(Clone, Debug, PartialEq)]
pub struct LadderReport {
    pub summary: Summary,
    pub records: Vec<AttemptRecord>,
}

/// Plays `seeds` encounters of `boss` (seed `i`, attempt `i + 1`) and aggregates them.
pub fn run_ladder(boss: LadderBoss, player_budget: u32, seeds: u32, ply_cap: u32) -> LadderReport {
    let records: Vec<AttemptRecord> = (0..seeds)
        .map(|i| play_attempt(boss, u64::from(i), i + 1, player_budget, ply_cap))
        .collect();
    LadderReport {
        summary: summarize(boss.id(), player_budget, &records),
        records,
    }
}

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
        let r = play_out(a, 7, 2, 50, 0, 300);
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
        let r = play_out(a, 0, 1, 50, 0, 300);
        assert_eq!(r.result, AttemptResult::Lost);
        assert_eq!(r.death, Some(DeathCause::Push));
        assert_eq!(r.plies, 1);
    }

    #[test]
    fn a_player_with_no_marble_left_has_no_move_and_loses_to_conversion() {
        let a = arena(&[], &[(0, 0)], Player::Black, [0, 0]);
        let r = play_out(a, 0, 1, 50, 2, 300);
        assert_eq!(r.result, AttemptResult::Lost);
        assert_eq!(r.death, Some(DeathCause::Conversion));
        assert_eq!((r.plies, r.player_marbles), (0, 0));
    }

    #[test]
    fn a_game_that_hits_the_ply_cap_is_a_capped_loss() {
        let r = play_attempt(LadderBoss::Echo, 0, 1, 50, 4);
        assert_eq!(r.plies, 4);
        assert_eq!(r.result, AttemptResult::Lost);
        assert_eq!(r.death, Some(DeathCause::PlyCap));
    }

    #[test]
    fn all_four_bosses_play_a_round() {
        for boss in LadderBoss::ALL {
            let r = play_attempt(boss, 1, 2, 30, 2);
            assert_eq!((r.boss, r.plies, r.attempt), (boss.id(), 2, 2), "{boss:?}");
        }
    }

    #[test]
    fn the_same_seed_replays_the_same_attempt() {
        let a = play_attempt(LadderBoss::Hull, 5, 1, 60, 12);
        assert_eq!(a, play_attempt(LadderBoss::Hull, 5, 1, 60, 12));
    }

    #[test]
    fn a_tiny_ladder_runs_two_seeds_and_aggregates() {
        let report = run_ladder(LadderBoss::Echo, 40, 2, 8);
        assert_eq!(report.records.len(), 2);
        let attempts: Vec<_> = report.records.iter().map(|r| (r.seed, r.attempt)).collect();
        assert_eq!(attempts, [(0, 1), (1, 2)]);
        let s = &report.summary;
        assert_eq!((s.boss, s.player_budget, s.attempts), ("echo", 40, 2));
        assert!(s.median_plies > 0.0 && s.median_plies <= 8.0);
    }
}
