//! The rogue-lite run simulator (#1537, docs/specs/roguelite.md section 30): `cargo run --release --example run_sim`.
//! A bot plays whole runs on the engine's map and exits against the engine's act bosses, and prints a markdown table:
//! how many runs of each commander and ascension level clear each act. What the bot does, and what is left out, is
//! stated in the spec.
//!
//! Environment (every one optional): `RUN_SIM_RUNS=40` runs per commander and level (seeds 0 to N - 1, the same for
//! every cell), `RUN_SIM_LEVELS=0,5,10` the ascension levels, `RUN_SIM_THREADS` the runs played at once,
//! `RUN_SIM_BOSS_X=3` the player's search in a boss fight as a multiple of the boss's own budget (the ladder's 10 is
//! the pro level, too slow to play a table), `RUN_SIM_PERCENTS=50,120,200` the strength of the act bosses to try in place of `ACT_PERCENT`,
//! `RUN_SIM_JSONL=<file>` one JSON line per run, `RUN_SIM_POOL=1` to play every act's boss for every seed, whatever the
//! run before it did, and print how many it won per act (the tuning sample). Arguments are the commanders to play, by index (0 to 3), none
//! for all four. The progress goes to stderr.

use abalone_core::encounter::ladder::{play_act_boss, LadderBoss, PLY_CAP};
use abalone_core::encounter::telemetry::AttemptResult;
use abalone_core::run::{exits, run_map, Node, NodeKind, Relic, ACTS, FULL_ARMY, MIN_ARMY};
use abalone_core::world::Biome;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

/// The act bosses' strength by act, as the page's `ACT_PERCENT` (client/src/roguelite.ts, a test keeps the two
/// equal); the fourth act is not played.
const ACT_PERCENT: [u32; 3] = [50, 120, 200];
/// What a fight node and an elite cost the army, in marbles (not measured, section 30): the bot wins them.
const FIGHT_LOSS: u8 = 1;
const ELITE_LOSS: u8 = 2;

/// The four commanders of section 17: name and starting relic. Only the Warden's relic is played here.
const COMMANDERS: [(&str, Relic); 4] = [
    ("The Captain", Relic::Gyroscope),
    ("The Warden", Relic::HullPlating),
    ("The Saboteur", Relic::Detonator),
    ("The Juggernaut", Relic::Bunks),
];

/// splitmix64, as the engine's.
fn mix(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    x ^ (x >> 31)
}

/// An act boss fight is the same for every commander and run that reaches it (the bot brings no build to it), so it
/// is played once per boss, seed and strength, and shared: whether it was won and the marbles the boss ejected.
type BossFights = Mutex<HashMap<(&'static str, u64, u32), Arc<OnceLock<(bool, u8)>>>>;

struct Settings {
    percents: [u32; 3],
    boss_x: f64,
    bosses: BossFights,
}

/// The roster boss of the biome of an act (section 18); the Meadow's act 1 boss is dealt from the whole roster.
fn boss_of(seed: u64, act: usize, biome: Biome) -> LadderBoss {
    match biome {
        Biome::Forest => LadderBoss::Alien,
        Biome::Tundra => LadderBoss::Hull,
        Biome::Desert => LadderBoss::Pulsar,
        Biome::Badlands => LadderBoss::Unstable,
        Biome::Archipelago => LadderBoss::Ballast,
        Biome::Meadow => {
            let deal = mix(seed ^ mix(act as u64 | 5 << 32));
            LadderBoss::ALL[(deal % LadderBoss::ALL.len() as u64) as usize]
        }
    }
}

/// The biome of each act of a run of `seed`: the Meadow, then the first exit offered.
fn biomes(seed: u64) -> [Biome; ACTS] {
    let second = exits(seed, 1, Biome::Meadow)[0];
    [Biome::Meadow, second, exits(seed, 2, second)[0]]
}

/// The act boss fight at node `i` of the map of `seed`, `boss` at `percent` of its budget: whether the bot won it and the
/// marbles it lost. Played once, then shared.
fn boss_fight(set: &Settings, seed: u64, i: usize, boss: LadderBoss, percent: u32) -> (bool, u8) {
    let fight_seed = mix(seed ^ i as u64);
    let shared = set
        .bosses
        .lock()
        .unwrap()
        .entry((boss.id(), fight_seed, percent))
        .or_default()
        .clone();
    *shared.get_or_init(|| {
        let budget = (f64::from(boss.node_budget()) * set.boss_x) as u32;
        let (record, lost) = play_act_boss(boss, fight_seed, budget, percent, PLY_CAP);
        (record.result == AttemptResult::Won, lost)
    })
}

/// How a run ended: the acts cleared (0 to 3) and where it was lost.
struct Ended {
    cleared: usize,
    end: String,
}

/// The nodes the bot may pick after `at` (none yet: the first row of act 1) on the map of a run.
fn choices(map: &[Node], at: Option<usize>) -> Vec<usize> {
    (0..map.len())
        .filter(|&i| {
            let n = &map[i];
            n.act < ACTS
                && match at.map(|a| &map[a]) {
                    None => n.act == 0 && n.row == 0,
                    Some(p) if p.kind == NodeKind::Boss => n.act == p.act + 1 && n.row == 0,
                    Some(p) => n.act == p.act && n.row == p.row + 1 && p.links.contains(&n.col),
                }
        })
        .collect()
}

/// One run of `seed` of the commander `c` at ascension `level`. The player's choices are in
/// docs/specs/roguelite.md section 30.
fn play_run(seed: u64, c: usize, level: u32, set: &Settings) -> Ended {
    let relic = COMMANDERS[c].1;
    let map = run_map(seed);
    let rest_to = FULL_ARMY - 2 * u8::from(level >= 2);
    let mut army = FULL_ARMY - 2 * u8::from(level >= 6);
    let biomes = biomes(seed);
    let mut at = None;
    let mut cleared = 0;
    loop {
        // A rest when hurt, then a fight or a boss, then the free nodes, an elite last.
        let rank = |n: &Node| match n.kind {
            NodeKind::Rest => 8 * u8::from(army >= rest_to),
            NodeKind::Fight | NodeKind::Boss => 1,
            NodeKind::Elite => 9,
            _ => 5,
        };
        let i = *choices(&map, at)
            .iter()
            .min_by_key(|&&i| rank(&map[i]))
            .expect("a node leads on");
        let node = &map[i];
        at = Some(i);
        let hull = u8::from(relic == Relic::HullPlating);
        let lost = match node.kind {
            NodeKind::Rest => {
                army = army.max(rest_to);
                continue;
            }
            NodeKind::Fight => FIGHT_LOSS.saturating_sub(hull),
            NodeKind::Elite => ELITE_LOSS.saturating_sub(hull),
            NodeKind::Boss => {
                let boss = boss_of(seed, node.act, biomes[node.act]);
                let percent = set.percents[node.act] * if level >= 7 { 5 } else { 4 } / 4;
                let (won, lost) = boss_fight(set, seed, i, boss, percent);
                if !won {
                    return Ended {
                        cleared,
                        end: format!("act {} boss {}", node.act + 1, boss.id()),
                    };
                }
                lost.saturating_sub(hull)
            }
            _ => continue, // an event, a treasure, a shop, an unknown or a secret room: left
        };
        if army.saturating_sub(lost) < MIN_ARMY {
            return Ended {
                cleared,
                end: format!("act {} army", node.act + 1),
            };
        }
        army -= lost;
        if node.kind == NodeKind::Elite {
            army = (army + 2).min(FULL_ARMY);
        }
        if node.kind == NodeKind::Boss {
            cleared += 1;
            if cleared == ACTS {
                return Ended {
                    cleared,
                    end: "won".into(),
                };
            }
        }
        // The reward of a won fight, elite or boss: a marble back when the army is under 14.
        army = (army + 1).min(FULL_ARMY);
    }
}

fn setting(name: &str, default: u32) -> u32 {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

/// `f(0)` to `f(n - 1)`, `threads` at a time, in the order of their index.
fn parallel<T: Send>(n: usize, threads: u32, f: impl Fn(usize) -> T + Sync) -> Vec<T> {
    let next = AtomicUsize::new(0);
    let done: Mutex<Vec<Option<T>>> = Mutex::new((0..n).map(|_| None).collect());
    std::thread::scope(|s| {
        for _ in 0..threads {
            s.spawn(|| loop {
                let j = next.fetch_add(1, Ordering::SeqCst);
                if j >= n {
                    break;
                }
                let out = f(j);
                done.lock().unwrap()[j] = Some(out);
            });
        }
    });
    done.into_inner()
        .unwrap()
        .into_iter()
        .map(|o| o.expect("every job ran"))
        .collect()
}

/// The tuning sample: the boss of each act of seeds `0..runs` played at its strength, whatever happened before it, so
/// every act has `runs` fights; how many the bot won, per act, and the bosses it lost to.
fn pool(set: &Settings, runs: u64, threads: u32) {
    let fights = parallel(runs as usize * ACTS, threads, |j| {
        let (seed, act) = ((j / ACTS) as u64, j % ACTS);
        let map = run_map(seed);
        let i = map
            .iter()
            .position(|n| n.kind == NodeKind::Boss && n.act == act)
            .expect("a boss ends the act");
        let boss = boss_of(seed, act, biomes(seed)[act]);
        (boss, boss_fight(set, seed, i, boss, set.percents[act]).0)
    });
    println!("| act | percent | fights won | lost to |");
    println!("|---|---|---|---|");
    for act in 0..ACTS {
        let of: Vec<_> = fights.iter().skip(act).step_by(ACTS).collect();
        let won = of.iter().filter(|f| f.1).count();
        let mut lost: Vec<String> = LadderBoss::ALL
            .iter()
            .filter_map(|b| {
                let n = of.iter().filter(|f| f.0 == *b && !f.1).count();
                (n > 0).then(|| format!("{} {n}", b.id()))
            })
            .collect();
        lost.sort();
        println!(
            "| {} | {} | {won}/{} ({:.0} %) | {} |",
            act + 1,
            set.percents[act],
            of.len(),
            100.0 * won as f64 / of.len() as f64,
            lost.join(", ")
        );
    }
}

fn main() {
    let list = |name: &str, default: &str| -> Vec<u32> {
        std::env::var(name)
            .unwrap_or_else(|_| default.into())
            .split(',')
            .filter_map(|l| l.parse().ok())
            .collect()
    };
    let set = Settings {
        percents: std::env::var("RUN_SIM_PERCENTS").map_or(ACT_PERCENT, |_| {
            list("RUN_SIM_PERCENTS", "")
                .try_into()
                .expect("three percents")
        }),
        boss_x: std::env::var("RUN_SIM_BOSS_X")
            .ok()
            .and_then(|x| x.parse().ok())
            .unwrap_or(3.0),
        bosses: Mutex::default(),
    };
    let runs = u64::from(setting("RUN_SIM_RUNS", 40));
    let levels = list("RUN_SIM_LEVELS", "0,5,10");
    let only: Vec<usize> = std::env::args()
        .skip(1)
        .filter_map(|a| a.parse().ok())
        .collect();
    let commanders: Vec<usize> = (0..COMMANDERS.len())
        .filter(|c| only.is_empty() || only.contains(c))
        .collect();
    // Cell by cell, the seeds of a cell in parallel: the first cells play the boss fights, the others find them played.
    let jobs: Vec<(usize, u32, u64)> = commanders
        .iter()
        .flat_map(|&c| {
            let levels = &levels;
            levels
                .iter()
                .flat_map(move |&l| (0..runs).map(move |s| (c, l, s)))
        })
        .collect();
    let threads = setting("RUN_SIM_THREADS", 4);
    if std::env::var("RUN_SIM_POOL").is_ok() {
        pool(&set, runs, threads);
        return;
    }
    let done = parallel(jobs.len(), threads, |j| {
        let (c, l, seed) = jobs[j];
        let out = play_run(seed, c, l, &set);
        eprintln!(
            "{} level {l} seed {seed}: {} acts, {}",
            COMMANDERS[c].0, out.cleared, out.end
        );
        out
    });
    let mut jsonl = String::new();
    println!("| commander | level | runs | act 1 | act 2 | act 3 = the run |");
    println!("|---|---|---|---|---|---|");
    let share = |n: usize, d: usize| {
        if d == 0 {
            0.0
        } else {
            100.0 * n as f64 / d as f64
        }
    };
    for &c in &commanders {
        for &l in &levels {
            let outs: Vec<_> = jobs
                .iter()
                .zip(done.iter())
                .filter(|(j, _)| j.0 == c && j.1 == l)
                .collect();
            // Act `k` cleared: of the runs that reached it, and of all the runs.
            let cell = |k: usize| {
                let reached = outs.iter().filter(|o| o.1.cleared + 1 >= k).count();
                let won = outs.iter().filter(|o| o.1.cleared >= k).count();
                format!(
                    "{won}/{reached} ({:.0} %), {:.0} % of runs",
                    share(won, reached),
                    share(won, outs.len())
                )
            };
            println!(
                "| {} | {l} | {} | {} | {} | {} |",
                COMMANDERS[c].0,
                outs.len(),
                cell(1),
                cell(2),
                cell(3)
            );
            for (j, o) in &outs {
                jsonl.push_str(&format!(
                    "{{\"commander\":{},\"level\":{},\"seed\":{},\"cleared\":{},\"end\":\"{}\"}}\n",
                    j.0, j.1, j.2, o.cleared, o.end
                ));
            }
        }
    }
    if let Ok(path) = std::env::var("RUN_SIM_JSONL") {
        std::fs::write(path, jsonl).expect("write the JSON lines file");
    }
}
