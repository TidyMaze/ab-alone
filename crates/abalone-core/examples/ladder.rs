//! The bot ladder: `cargo run --release --example ladder`. Four bosses, three player budgets
//! (4x, 1x, 0.5x of the boss budget), 10 seeds each, 300 plies at most. Prints a markdown table.
//! Arguments filter the bosses by id (`echo hull chaplain choir`), none runs all four.
//! Set `LADDER_JSONL=<file>` to also write every attempt as a JSON line.
//! Set `LADDER_NODES=4000` to play one budget in nodes, to compare a boss before and after a
//! change of its own budget.
//! Set `LADDER_X=10` to play one budget, that many times the boss budget (pro level is 10).
//! Set `LADDER_FIXTURES=<dir>` to write the first won game of each cell as `<dir>/<boss>.txt`.
//! Set `LADDER_SEEDS=2` to play that many seeds per cell instead of 10 (one thread per seed, so
//! it also caps the cores used).
//! The seeds of a cell run in parallel, one thread each.

use abalone_core::encounter::fixture::Fixture;
use abalone_core::encounter::ladder::{play_attempt_moves, player_budgets, LadderBoss, PLY_CAP};
use abalone_core::encounter::telemetry::{death_counts, summarize, AttemptRecord, AttemptResult};
use abalone_core::moves::Move;

const SEEDS: u32 = 10;

fn seeds() -> u32 {
    std::env::var("LADDER_SEEDS")
        .ok()
        .and_then(|n| n.parse().ok())
        .unwrap_or(SEEDS)
}

fn budgets(boss: LadderBoss) -> Vec<u32> {
    if let Some(nodes) = std::env::var("LADDER_NODES")
        .ok()
        .and_then(|n| n.parse().ok())
    {
        return vec![nodes];
    }
    match std::env::var("LADDER_X")
        .ok()
        .and_then(|x| x.parse::<f64>().ok())
    {
        Some(x) => vec![(f64::from(boss.node_budget()) * x) as u32],
        None => player_budgets(boss).to_vec(),
    }
}

fn run_cell(boss: LadderBoss, budget: u32) -> Vec<(AttemptRecord, Vec<Move>)> {
    std::thread::scope(|s| {
        let threads: Vec<_> = (0..seeds())
            .map(|i| {
                s.spawn(move || play_attempt_moves(boss, u64::from(i), i + 1, budget, PLY_CAP))
            })
            .collect();
        threads
            .into_iter()
            .map(|t| t.join().expect("attempt"))
            .collect()
    })
}

fn main() {
    let mut jsonl = String::new();
    println!("| boss | player budget | wins | median plies | max phase | deaths |");
    println!("|---|---|---|---|---|---|");
    let only: Vec<String> = std::env::args().skip(1).collect();
    for boss in LadderBoss::ALL {
        if !only.is_empty() && !only.iter().any(|id| id == boss.id()) {
            continue;
        }
        for budget in budgets(boss) {
            let games = run_cell(boss, budget);
            let records: Vec<AttemptRecord> = games.iter().map(|g| g.0.clone()).collect();
            if let (Ok(dir), Some((r, moves))) = (
                std::env::var("LADDER_FIXTURES"),
                games.iter().find(|g| g.0.result == AttemptResult::Won),
            ) {
                let fixture = Fixture {
                    boss,
                    seed: r.seed,
                    player_budget: budget,
                    boss_budget: boss.node_budget(),
                    moves: moves.clone(),
                };
                std::fs::write(format!("{dir}/{}.txt", boss.id()), fixture.to_text())
                    .expect("write the fixture");
            }
            let s = summarize(boss.id(), budget, &records);
            let deaths: Vec<String> = death_counts(&records)
                .iter()
                .map(|(cause, n)| format!("{cause} {n}"))
                .collect();
            println!(
                "| {} | {} | {}/{} | {} | {} | {} |",
                s.boss,
                budget,
                s.wins,
                s.attempts,
                s.median_plies,
                s.max_phase,
                deaths.join(", ")
            );
            for r in &records {
                jsonl.push_str(&r.to_json_line());
                jsonl.push('\n');
            }
        }
    }
    if let Ok(path) = std::env::var("LADDER_JSONL") {
        std::fs::write(path, jsonl).expect("write the JSON lines file");
    }
}
