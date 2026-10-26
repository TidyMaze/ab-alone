//! The battle royale anti-kingmaking check (rules.md section 10.4):
//! `cargo run --release --example royale_sim`. Plays 10 000 games of 6 bots (seeds 0 to 9999)
//! twice: simultaneous rounds (option C, every order counts), then the sequential baseline
//! (option A: only the first seat in initiative order still in the game plays each round).
//!
//! The first round that starts with exactly 3 seats left opens the final phase. The seat of the
//! three with the worst place in `Royale::standings` is the dying third: two of them going out
//! in the same void are ranked by the breach tie rule. The other two are the final two, and the
//! one of them with more marbles at that round is the final-two leader. The leader loses to the
//! dying third when it does not win and the third ejected at least one of its marbles in the
//! final phase. A game without a final-two leader (no round with 3 seats left, the third sharing
//! its place, or the final two tied on marbles) is not counted.

use abalone_core::royale::{bot, initiative, resolve_round, start, Order};

const GAMES: u64 = 10_000;
const SEATS: usize = 6;

/// Plays the game of `seed`. `None` when it has no final-two leader, else whether the leader
/// lost to the dying third.
fn play(seed: u64, sequential: bool) -> Option<bool> {
    let mut s = start(SEATS).unwrap();
    // Seats left and their marbles at the start of the final phase.
    let mut three: Option<Vec<(usize, usize)>> = None;
    // (pusher, victim) of every ejection in the final phase.
    let mut hits = Vec::new();
    while !s.is_over() {
        let left: Vec<usize> = (0..SEATS).filter(|&k| !s.is_out(k)).collect();
        if left.len() == 3 && three.is_none() {
            three = Some(left.iter().map(|&k| (k, s.marbles(k))).collect());
        }
        let seats: Vec<usize> = if sequential {
            initiative(s.round(), SEATS)
                .into_iter()
                .find(|&k| !s.is_out(k))
                .into_iter()
                .collect()
        } else {
            left.clone()
        };
        let orders: Vec<(usize, Order)> = seats
            .into_iter()
            .map(|k| (k, bot::order(&s, k, seed)))
            .collect();
        let (next, log) = resolve_round(&s, &orders).unwrap();
        if left.len() == 3 {
            hits.extend(
                log.turns
                    .iter()
                    .filter_map(|t| t.ejected.map(|victim| (t.seat, victim))),
            );
        }
        s = next;
    }
    let place = |k: usize| s.standings().unwrap()[k].place;
    let mut three = three?;
    three.sort_by_key(|&(k, _)| std::cmp::Reverse(place(k)));
    let [(third, _), (a, ma), (b, mb)] = three[..] else {
        unreachable!("three seats");
    };
    if place(third) == place(a) || ma == mb {
        return None;
    }
    let leader = if ma > mb { a } else { b };
    let lost = !s.winners().unwrap().contains(&leader);
    Some(lost && hits.contains(&(third, leader)))
}

/// Plays every game on all cores: (games with a final-two leader, games it lost to the third).
fn tally(sequential: bool) -> (u32, u32) {
    let threads = std::thread::available_parallelism().map_or(1, |n| n.get() as u64);
    std::thread::scope(|scope| {
        let handles: Vec<_> = (0..threads)
            .map(|t| {
                scope.spawn(move || {
                    (t..GAMES)
                        .step_by(threads as usize)
                        .filter_map(|seed| play(seed, sequential))
                        .fold((0, 0), |(n, k), lost| (n + 1, k + u32::from(lost)))
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|h| h.join().unwrap())
            .fold((0, 0), |(n, k), (a, b)| (n + a, k + b))
    })
}

fn main() {
    println!(
        "| Rounds | Games | With a final-two leader | Leader lost to the dying third | Rate |"
    );
    println!("|---|---|---|---|---|");
    for (name, sequential) in [("simultaneous (C)", false), ("sequential (A)", true)] {
        let (counted, lost) = tally(sequential);
        let rate = f64::from(lost) / f64::from(counted.max(1));
        println!(
            "| {name} | {GAMES} | {counted} | {lost} | {:.1} % |",
            100.0 * rate
        );
    }
}
