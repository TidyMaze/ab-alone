//! The army's fight bot against the run's fight bot (#1598, docs/specs/roguelite.md section 30): `cargo run --release --example fight_bot`.
//! Every army bot plays the first fight of seeds 0 to N - 1 (14 marbles against 8, the foes' formation and special marbles of the
//! engine's map) against a foe searching each of the run's budgets (`armyfight::foe_budget`: 25 %, 40 %, 63 % and 100 % of the peak,
//! the page's curve at the start of each act and at the fourth), and prints a markdown table: the fights won, with the error of the
//! rate, and the plies and the seconds (wall clock) a fight takes. Fights not won are draws, cut at the ply cap, or lost.
//!
//! Environment (every one optional): `FIGHT_BOT_ARMY=250,500:auto,...` the army bots, each a search budget in positions, `:auto` for
//! the page's Auto-play (`auto_move`, the bot before #1598), `FIGHT_BOT_PEAK=20000` the foes' peak (the page's `BOT_NODES`),
//! `FIGHT_BOT_GAMES=12` the seeds, `FIGHT_BOT_PLIES=400`, `FIGHT_BOT_THREADS`. The progress goes to stderr.

use edgefall_core::armyfight::{army_fight, fight_move, foe_budget};
use edgefall_core::game::{Game, Outcome};
use edgefall_core::moves::Player;
use edgefall_core::run::{foe_plan_v, run_map_v, NodeKind, MAP_VERSION};
use edgefall_core::search::{auto_move, best_move};
use edgefall_core::world::Biome;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

fn setting(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

/// One fight of `seed`: whether the army won, and the plies and seconds it took.
fn play(seed: u64, army: (u32, bool), foes: u32, plies: u32) -> (bool, u32, f64) {
    let map = run_map_v(seed, 0, MAP_VERSION);
    let node = map
        .iter()
        .position(|n| n.kind == NodeKind::Fight && n.act == 0 && n.row == 0)
        .expect("a first fight");
    let plan = foe_plan_v(seed, node, 0, Biome::Meadow, 0, MAP_VERSION);
    let mut game: Game = army_fight(14, &plan, &[], &[]).expect("a fight");
    let start = Instant::now();
    let mut played = 0;
    while game.outcome().is_none() && played < plies {
        let mv = match (game.to_move(), army) {
            (Player::White, _) => best_move(&game, foes),
            (_, (nodes, true)) => auto_move(&game, nodes),
            (_, (nodes, false)) => fight_move(&game, nodes),
        };
        game.play(&mv.expect("a move")).expect("a legal move");
        played += 1;
    }
    (
        game.outcome() == Some(Outcome::Win(Player::Black)),
        played,
        start.elapsed().as_secs_f64(),
    )
}

fn main() {
    let armies: Vec<(u32, bool)> = std::env::var("FIGHT_BOT_ARMY")
        .unwrap_or_else(|_| "250,500,1000,2000,500:auto".into())
        .split(',')
        .map(|a| {
            let (nodes, auto) = a.split_once(':').map_or((a, false), |(n, _)| (n, true));
            (nodes.parse().expect("nodes"), auto)
        })
        .collect();
    let peak = setting("FIGHT_BOT_PEAK", 20000) as u32;
    let games = setting("FIGHT_BOT_GAMES", 12) as usize;
    let plies = setting("FIGHT_BOT_PLIES", 400) as u32;
    let threads = setting(
        "FIGHT_BOT_THREADS",
        std::thread::available_parallelism().map_or(4, |n| n.get() as u64),
    );
    // The peak's share at the start of act 1, 2 and 3 and at the fourth act, as the page's `runPercent`.
    let foes: Vec<u32> = [(0, 0), (1, 0), (2, 0), (3, 0)]
        .into_iter()
        .map(|(act, row)| foe_budget(peak, act, row, 3, None, 0))
        .collect();
    let jobs: Vec<(usize, usize, usize)> = (0..armies.len())
        .flat_map(|a| (0..foes.len()).flat_map(move |f| (0..games).map(move |g| (a, f, g))))
        .collect();
    let next = AtomicUsize::new(0);
    let done: Mutex<Vec<Option<(bool, u32, f64)>>> = Mutex::new(vec![None; jobs.len()]);
    std::thread::scope(|s| {
        for _ in 0..threads {
            s.spawn(|| loop {
                let j = next.fetch_add(1, Ordering::SeqCst);
                if j >= jobs.len() {
                    break;
                }
                let (a, f, g) = jobs[j];
                let out = play(g as u64, armies[a], foes[f], plies);
                eprintln!(
                    "army {:?} foes {} seed {g}: won {}, {} plies",
                    armies[a], foes[f], out.0, out.1
                );
                done.lock().unwrap()[j] = Some(out);
            });
        }
    });
    let done = done.into_inner().unwrap();
    print!("| army bot |");
    for f in &foes {
        print!(" foes {f} |");
    }
    println!();
    println!("|---|{}", "---|".repeat(foes.len()));
    for (a, (nodes, auto)) in armies.iter().enumerate() {
        print!("| {nodes}{} |", if *auto { " (auto_move)" } else { "" });
        for f in 0..foes.len() {
            let outs: Vec<_> = jobs
                .iter()
                .zip(&done)
                .filter(|(j, _)| j.0 == a && j.1 == f)
                .map(|(_, o)| o.expect("played"))
                .collect();
            let n = outs.len() as f64;
            let won = outs.iter().filter(|o| o.0).count() as f64;
            let p = won / n;
            let (ply, secs) = (
                outs.iter().map(|o| f64::from(o.1)).sum::<f64>() / n,
                outs.iter().map(|o| o.2).sum::<f64>() / n,
            );
            print!(
                " {won}/{n} ({:.0} % +/- {:.0}), {ply:.0} plies, {secs:.0} s |",
                100.0 * p,
                100.0 * (p * (1.0 - p) / n).sqrt()
            );
        }
        println!();
    }
}
