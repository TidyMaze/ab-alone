//! The Overseer winnability check (docs/specs/game-design.md section 7.11, #635):
//! `cargo run --release --example overseer_sim`. The bot ladder's player (`ladder.rs`: 2 seeded
//! random opening moves, then the node-limited search that avoids a position already seen) plays
//! The Overseer over many seeds; its search sees the incinerators, as the boss's does. It prints
//! each fight and fails (exit 1) when the player wins none inside the neurotoxin limit.
//! Set `OVERSEER_SEEDS=<n>` to play n seeds (default 20) and `OVERSEER_X=<x>` for another player
//! budget, x times the boss budget (default 4, the ladder's strongest player). The seeds run on
//! all cores.

use abalone_core::board::Cell;
use abalone_core::encounter::overseer::{
    overseer_move, overseer_start, overseer_step, OVERSEER_CORES, OVERSEER_NODE_BUDGET,
};
use abalone_core::encounter::{marbles, Encounter, PveResult};
use abalone_core::moves::{legal_moves, Move, Player};
use abalone_core::search::{search_hooked, DEFAULT_WEIGHTS};

fn env(name: &str, default: f64) -> f64 {
    std::env::var(name)
        .ok()
        .and_then(|n| n.parse().ok())
        .unwrap_or(default)
}

/// splitmix64, as the ladder's opening moves.
fn mix(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    x ^ (x >> 31)
}

fn player_move(enc: &Encounter, seed: u64, index: u64, budget: u32) -> Option<Move> {
    let game = enc.game();
    if index < 2 {
        let moves = legal_moves(game.board(), Player::Black);
        let pick = mix(seed ^ mix(index)) % moves.len().max(1) as u64;
        return moves.get(pick as usize).cloned();
    }
    let phase = enc.phase();
    let step = |_: &_, _: Player, _: &Move, after| overseer_step(after, phase);
    let fresh = |mv: &Move| game.seen_after(mv) == 1;
    search_hooked(game, budget, DEFAULT_WEIGHTS, &fresh, &step)
        .or_else(|| search_hooked(game, budget, DEFAULT_WEIGHTS, &|_| true, &step))
        .map(|r| r.mv)
}

/// One fight: won or not, the player turns played, the ejections of each side (a burnt core
/// counts for the player), the cores burnt.
struct Fight {
    won: bool,
    turns: u32,
    made: u8,
    lost: u8,
    cores: u8,
}

fn fight(seed: u64, budget: u32) -> Fight {
    let mut enc = overseer_start(seed);
    let mut index = 0;
    while enc.result().is_none() {
        let mv = if enc.game().to_move() == Player::Black {
            index += 1;
            player_move(&enc, seed, index - 1, budget)
        } else {
            overseer_move(&enc)
        };
        let Some(mv) = mv else { break };
        enc.play(&mv).expect("a legal move");
    }
    let game = enc.game();
    Fight {
        won: enc.result() == Some(PveResult::Won),
        turns: index as u32,
        made: game.ejected(Player::Black),
        lost: game.ejected(Player::White),
        cores: OVERSEER_CORES.len() as u8 - marbles(game.board(), Cell::Core),
    }
}

fn main() {
    let seeds = env("OVERSEER_SEEDS", 20.0) as u64;
    let budget = (env("OVERSEER_X", 4.0) * f64::from(OVERSEER_NODE_BUDGET)) as u32;
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
    println!("Player budget {budget} nodes, boss budget {OVERSEER_NODE_BUDGET}, {seeds} seeds.\n");
    println!("| seed | result | your turns | your ejections | cores burnt | lost |");
    println!("|---|---|---|---|---|---|");
    for (seed, f) in &fights {
        let result = if f.won { "won" } else { "lost" };
        let (turns, made, cores, lost) = (f.turns, f.made, f.cores, f.lost);
        println!("| {seed} | {result} | {turns} | {made} | {cores} | {lost} |");
    }
    let wins = fights.iter().filter(|f| f.1.won).count();
    println!("\nWins {wins}/{seeds}.");
    if wins == 0 {
        std::process::exit(1);
    }
}
