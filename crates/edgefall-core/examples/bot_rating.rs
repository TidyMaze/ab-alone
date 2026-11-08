//! The bot rating ladder (#1611, docs/specs/roguelite.md section 31): `cargo run --release --example bot_rating`.
//! Self-play between adjacent search budgets, both colours, from the same random opening, and prints a markdown table:
//! each budget's score against the one below it, the rating difference that score means (Elo, with its standard error)
//! and the running rating, anchored by decision: the budget `BOT_RATING_ANCHOR` (the page's `BOT_NODES`) is 1500.
//! Only the differences are measured; the absolute number is an estimate.
//!
//! Environment (every one optional): `BOT_RATING_LADDER=100:0,200:0,...` the budgets, each `nodes:noise`, noise being the
//! percent of its moves played at random instead of searched (0 by default; for a low budget that still plays well),
//! `BOT_RATING_GAMES=40` the games per pair (half of them with each colour), `BOT_RATING_ANCHOR=20000`,
//! `BOT_RATING_PLIES=300` the length at which an unfinished game counts as a draw, `BOT_RATING_THREADS`.
//! The progress goes to stderr.

use edgefall_core::game::Game;
use edgefall_core::moves::{legal_moves, Player};
use edgefall_core::search::best_move;
use std::sync::atomic::{AtomicUsize, Ordering};

const LADDER: &str = "200:0,400:0,800:0,1600:0,3200:0,6400:0,12800:0,20000:0,40000:0,80000:0";
/// The plies played at random to give each pair of games its own opening.
const OPENING_PLIES: usize = 8;

/// splitmix64, as the engine's.
fn mix(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    x ^ (x >> 31)
}

fn setting(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

#[derive(Clone, Copy)]
struct Level {
    nodes: u32,
    noise: u64,
}

/// One game: `low` plays `low_side`, `high` the other. The score of `high`: 1, 0.5 or 0.
fn play(low: Level, high: Level, low_side: Player, seed: u64, plies: usize) -> f64 {
    let mut game = Game::new();
    let mut rng = seed;
    for ply in 0..plies {
        if game.outcome().is_some() {
            break;
        }
        let mover = game.to_move();
        let moves = legal_moves(game.board(), mover);
        rng = mix(rng);
        let level = if mover == low_side { low } else { high };
        let random = ply < OPENING_PLIES || rng % 100 < level.noise;
        let mv = if random {
            moves[(mix(rng) % moves.len() as u64) as usize].clone()
        } else {
            best_move(&game, level.nodes).expect("a move")
        };
        game.play(&mv).expect("a legal move");
    }
    match game.winner() {
        Some(winner) if winner == low_side => 0.0,
        Some(_) => 1.0,
        None => 0.5,
    }
}

/// The score of `high` over `games` games against `low`, half with each colour.
fn pair(low: Level, high: Level, games: u64, threads: u64, plies: usize) -> Vec<f64> {
    let next = AtomicUsize::new(0);
    let total = games as usize;
    let mut scores = vec![0.0; total];
    let slots: Vec<std::sync::Mutex<f64>> =
        (0..total).map(|_| std::sync::Mutex::new(0.0)).collect();
    std::thread::scope(|s| {
        for _ in 0..threads {
            s.spawn(|| loop {
                let g = next.fetch_add(1, Ordering::SeqCst);
                if g >= total {
                    break;
                }
                // Games 2k and 2k + 1 share the opening and swap the colours.
                let side = if g.is_multiple_of(2) {
                    Player::Black
                } else {
                    Player::White
                };
                let seed = mix(u64::from(low.nodes) * 31 + (g as u64 / 2));
                *slots[g].lock().expect("slot") = play(low, high, side, seed, plies);
            });
        }
    });
    for (i, slot) in slots.iter().enumerate() {
        scores[i] = *slot.lock().expect("slot");
    }
    scores
}

/// The rating difference a score share means, and its standard error (delta method), both in Elo points.
fn elo(scores: &[f64]) -> (f64, f64, f64) {
    let n = scores.len() as f64;
    let mean = scores.iter().sum::<f64>() / n;
    // Keep a sweep inside the table: half a game from the edge.
    let share = mean.clamp(0.5 / n, 1.0 - 0.5 / n);
    let diff = 400.0 * (share / (1.0 - share)).log10();
    let var = scores.iter().map(|s| (s - mean).powi(2)).sum::<f64>() / (n - 1.0);
    let error = (var / n).sqrt() * 400.0 / std::f64::consts::LN_10 / (share * (1.0 - share));
    (mean, diff, error)
}

fn main() {
    let levels: Vec<Level> = std::env::var("BOT_RATING_LADDER")
        .unwrap_or_else(|_| LADDER.into())
        .split(',')
        .map(|l| {
            let (nodes, noise) = l.split_once(':').unwrap_or((l, "0"));
            Level {
                nodes: nodes.parse().expect("nodes"),
                noise: noise.parse().expect("noise"),
            }
        })
        .collect();
    let games = setting("BOT_RATING_GAMES", 40);
    let anchor = setting("BOT_RATING_ANCHOR", 20000) as u32;
    let plies = setting("BOT_RATING_PLIES", 300) as usize;
    let threads = setting(
        "BOT_RATING_THREADS",
        std::thread::available_parallelism().map_or(4, |n| n.get() as u64),
    );
    // Differences up from the lowest budget, then shifted so the anchor is 1500.
    let mut rows = vec![(levels[0], 0.0, 0.0, 0.0, 0.0)];
    for w in levels.windows(2) {
        let scores = pair(w[0], w[1], games, threads, plies);
        let (mean, diff, error) = elo(&scores);
        let total = rows.last().expect("row").4 + diff;
        eprintln!("{} vs {}: {mean:.3}, {diff:+.0}", w[1].nodes, w[0].nodes);
        rows.push((w[1], mean, diff, error, total));
    }
    let shift = rows
        .iter()
        .find(|r| r.0.nodes == anchor)
        .map_or(0.0, |r| 1500.0 - r.4);
    println!(
        "| nodes | noise | score vs the budget below | difference | error (1 sigma) | rating |"
    );
    println!("|---|---|---|---|---|---|");
    let mut spread = 0.0_f64;
    for (level, mean, diff, error, total) in &rows {
        spread += error * error;
        println!(
            "| {} | {} % | {:.3} | {:+.0} | {:.0} | {:.0} (+/- {:.0}) |",
            level.nodes,
            level.noise,
            mean,
            diff,
            error,
            total + shift,
            spread.sqrt()
        );
    }
}
