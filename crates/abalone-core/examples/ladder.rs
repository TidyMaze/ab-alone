//! The bot ladder: `cargo run --release --example ladder`. Four bosses, three player budgets
//! (4x, 1x, 0.5x of the boss budget), 10 seeds each, 300 plies at most. Prints a markdown table.
//! Arguments filter the bosses by id (`echo hull chaplain choir`), none runs all four.
//! Set `LADDER_JSONL=<file>` to also write every attempt as a JSON line.

use abalone_core::encounter::ladder::{player_budgets, run_ladder, LadderBoss, PLY_CAP};
use abalone_core::encounter::telemetry::death_counts;

const SEEDS: u32 = 10;

fn main() {
    let mut jsonl = String::new();
    println!("| boss | player budget | wins | median plies | max phase | deaths |");
    println!("|---|---|---|---|---|---|");
    let only: Vec<String> = std::env::args().skip(1).collect();
    for boss in LadderBoss::ALL {
        if !only.is_empty() && !only.iter().any(|id| id == boss.id()) {
            continue;
        }
        for budget in player_budgets(boss) {
            let report = run_ladder(boss, budget, SEEDS, PLY_CAP);
            let s = &report.summary;
            let deaths: Vec<String> = death_counts(&report.records)
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
            for r in &report.records {
                jsonl.push_str(&r.to_json_line());
                jsonl.push('\n');
            }
        }
    }
    if let Ok(path) = std::env::var("LADDER_JSONL") {
        std::fs::write(path, jsonl).expect("write the JSON lines file");
    }
}
