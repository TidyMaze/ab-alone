//! The Swarm's balance gate, the turtle half (docs/specs/game-design.md section 7.14, #795):
//! `cargo run --release --example swarm_sim`. A scripted turtle (it never pushes and never moves
//! a marble away from the centre, `turtle_move`) plays The Swarm over 10 seeds; the gate wants it
//! to lose at least 8 of 10. It prints each fight and the boss reply times, and fails (exit 1) when
//! the turtle wins more than 2. The pro half is the ladder: `LADDER_X=10 cargo run --release
//! --example ladder -- swarm`. Set `SWARM_SEEDS=<n>` to play n seeds. The seeds run on all cores.

use std::time::Instant;

use abalone_core::board::Cell;
use abalone_core::encounter::marbles;
use abalone_core::encounter::swarm::{turtle_move, Swarm};
use abalone_core::encounter::PveResult;
use abalone_core::moves::Player;

/// A turtle fight: the result, the turn it ended on, the marbles left and the boss reply times.
fn fight(seed: u64) -> (Option<PveResult>, u32, u8, Vec<f64>) {
    let mut swarm = Swarm::start(seed);
    let (mut index, mut times) = (0, Vec::new());
    while swarm.result().is_none() {
        let mv = if swarm.game().to_move() == Player::Black {
            index += 1;
            turtle_move(swarm.game(), seed, index).expect("the turtle has a marble")
        } else {
            let t = Instant::now();
            let mv = swarm.boss_move().expect("a swarm with a move");
            times.push(t.elapsed().as_secs_f64() * 1000.0);
            mv
        };
        swarm.play(&mv).expect("a legal move");
    }
    let left = marbles(swarm.game().board(), Cell::Black);
    (swarm.result(), swarm.turn(), left, times)
}

fn main() {
    let seeds: u64 = std::env::var("SWARM_SEEDS")
        .ok()
        .and_then(|n| n.parse().ok())
        .unwrap_or(10);
    let fights: Vec<_> = std::thread::scope(|s| {
        let threads: Vec<_> = (0..seeds).map(|i| s.spawn(move || fight(i))).collect();
        threads
            .into_iter()
            .map(|t| t.join().expect("fight"))
            .collect()
    });
    let mut times = Vec::new();
    let mut won = 0;
    for (seed, (result, turn, left, t)) in fights.into_iter().enumerate() {
        println!("seed {seed}: {result:?} at turn {turn}, {left} player marbles left");
        won += u32::from(result == Some(PveResult::Won));
        times.extend(t);
    }
    times.sort_by(f64::total_cmp);
    let average = times.iter().sum::<f64>() / times.len() as f64;
    let p95 = times[times.len() * 95 / 100];
    println!(
        "turtle wins {won} of {seeds}; boss replies {}: {average:.1} ms average, {p95:.1} at the \
         95th percentile, {:.1} at most",
        times.len(),
        times[times.len() - 1]
    );
    if u64::from(won) * 5 > seeds {
        std::process::exit(1);
    }
}
