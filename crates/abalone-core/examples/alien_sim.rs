//! The Alien calibration check (docs/specs/game-design.md section 7.7, #646):
//! `cargo run --release --example alien_sim`. The bot ladder's player (`ladder.rs`) plays The
//! Alien over many seeds at the pro level of `docs/specs/boss-balance.md` (10x the boss budget),
//! then each game is replayed through the encounter to count the eggs and follow the Alien's
//! marbles. The Calibrate rule fails when the median fight ends with fewer than 2 eggs crushed, or
//! when the Alien's marble count only ever goes up (it never drops in the fight).
//! Set `ALIEN_SEEDS=<n>` to play n seeds (default 20) and `ALIEN_X=<x>` for another player budget,
//! x times the boss budget. The seeds run on all cores.

use abalone_core::board::Cell;
use abalone_core::encounter::alien::{alien_start, ALIEN_NODE_BUDGET};
use abalone_core::encounter::ladder::{play_attempt_moves, LadderBoss, PLY_CAP};
use abalone_core::encounter::marbles;
use abalone_core::encounter::telemetry::{AttemptRecord, AttemptResult};
use abalone_core::moves::{apply, Player};

/// Plies between two points of the marble curve.
const STEP: usize = 20;

fn env(name: &str, default: f64) -> f64 {
    std::env::var(name)
        .ok()
        .and_then(|n| n.parse().ok())
        .unwrap_or(default)
}

/// One fight: its ladder record, the player's ejections, the eggs crushed and hatched, and the
/// Alien's marbles at the start and after each ply.
struct Fight {
    record: AttemptRecord,
    ejections: u8,
    crushed: u32,
    hatched: u32,
    alien: Vec<u8>,
}

fn fight(seed: u64, budget: u32) -> Fight {
    let (record, moves) = play_attempt_moves(LadderBoss::Alien, seed, 1, budget, PLY_CAP);
    let mut enc = alien_start(seed);
    let (mut crushed, mut hatched) = (0, 0);
    let mut alien = vec![marbles(enc.game().board(), Cell::White)];
    for mv in &moves {
        let before = enc.game().board().clone();
        let (after, _) = apply(&before, enc.game().to_move(), mv).expect("a played move");
        let ejected = enc.game().ejected(Player::Black);
        enc.play(mv).expect("a played move");
        if enc.game().outcome().is_none() {
            crushed += before
                .eggs()
                .iter()
                .filter(|&&((q, r), _)| after.get(q, r) != Some(Cell::Empty))
                .count() as u32;
        }
        // The Alien's count after the ply is the one before, minus your ejections, plus hatches.
        let now = marbles(enc.game().board(), Cell::White);
        let lost = enc.game().ejected(Player::Black) - ejected;
        hatched += u32::from(now + lost - alien.last().unwrap());
        alien.push(now);
    }
    Fight {
        record,
        ejections: enc.game().ejected(Player::Black),
        crushed,
        hatched,
        alien,
    }
}

fn median(mut xs: Vec<f64>) -> f64 {
    if xs.is_empty() {
        return f64::NAN;
    }
    xs.sort_by(f64::total_cmp);
    let n = xs.len();
    if n % 2 == 1 {
        xs[n / 2]
    } else {
        (xs[n / 2 - 1] + xs[n / 2]) / 2.0
    }
}

fn main() {
    let seeds = env("ALIEN_SEEDS", 20.0) as u64;
    let budget = (env("ALIEN_X", 10.0) * f64::from(ALIEN_NODE_BUDGET)) as u32;
    let threads = std::thread::available_parallelism().map_or(1, |n| n.get() as u64);
    let mut fights: Vec<(u64, Fight)> = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..threads)
            .map(|t| {
                scope.spawn(move || {
                    (t..seeds)
                        .step_by(threads as usize)
                        .map(|seed| (seed, fight(seed, budget)))
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|h| h.join().unwrap())
            .collect()
    });
    fights.sort_by_key(|f| f.0);

    println!("Player budget {budget} nodes, boss budget {ALIEN_NODE_BUDGET}, {seeds} seeds.\n");
    println!("| seed | result | plies | your ejections | Alien peak | Alien at end | eggs crushed | hatched | death |");
    println!("|---|---|---|---|---|---|---|---|---|");
    for (seed, f) in &fights {
        let r = &f.record;
        println!(
            "| {seed} | {} | {} | {} | {} | {} | {} | {} | {} |",
            r.result.as_str(),
            r.plies,
            f.ejections,
            f.alien.iter().max().unwrap(),
            f.alien.last().unwrap(),
            f.crushed,
            f.hatched,
            r.death.map_or("-", |d| d.as_str()),
        );
    }
    let wins = fights
        .iter()
        .filter(|f| f.1.record.result == AttemptResult::Won)
        .count();
    let only_up = fights
        .iter()
        .filter(|f| f.1.alien.windows(2).all(|w| w[1] >= w[0]))
        .count();
    let col = |g: &dyn Fn(&Fight) -> f64| median(fights.iter().map(|f| g(&f.1)).collect());
    println!(
        "\nWins {wins}/{seeds}, median plies {}, median eggs crushed {}, median hatched {}, \
         median Alien peak {}, fights where the Alien's count only goes up {only_up}/{seeds}.\n",
        col(&|f| f64::from(f.record.plies)),
        col(&|f| f64::from(f.crushed)),
        col(&|f| f64::from(f.hatched)),
        col(&|f| f64::from(*f.alien.iter().max().unwrap())),
    );
    println!("| ply | fights still on | median Alien marbles | min | max |");
    println!("|---|---|---|---|---|");
    let longest = fights.iter().map(|f| f.1.alien.len()).max().unwrap_or(0);
    for ply in (0..longest).step_by(STEP) {
        let at: Vec<u8> = fights
            .iter()
            .filter_map(|f| f.1.alien.get(ply).copied())
            .collect();
        println!(
            "| {ply} | {} | {} | {} | {} |",
            at.len(),
            median(at.iter().map(|&n| f64::from(n)).collect()),
            at.iter().min().unwrap(),
            at.iter().max().unwrap(),
        );
    }
}
