//! Open world generation timing: `cargo run --release -p abalone-core --example world_timing`. One chunk and all
//! 4096 chunks of a 64 x 64 world, for `chunk` and `enemy_groups`. Prints the time per call.
use abalone_core::world::{chunk, enemy_groups, WORLD_CHUNKS};
use std::time::Instant;

fn main() {
    let mut sink = 0usize;
    let started = Instant::now();
    for _ in 0..200 {
        sink += chunk(7, 3, -2).unwrap().len();
    }
    println!("one chunk, chunk(): {:?} per call", started.elapsed() / 200);
    let started = Instant::now();
    for _ in 0..20 {
        sink += enemy_groups(7, 3, -2).len();
    }
    println!(
        "one chunk, enemy_groups(): {:?} per call",
        started.elapsed() / 20
    );
    let started = Instant::now();
    let mut all = 0usize;
    for cx in -WORLD_CHUNKS / 2..WORLD_CHUNKS / 2 {
        for cy in -WORLD_CHUNKS / 2..WORLD_CHUNKS / 2 {
            all += chunk(7, cx, cy).unwrap().len();
        }
    }
    println!(
        "4096 chunks, chunk(): {:?} total ({all} cells)",
        started.elapsed()
    );
    let started = Instant::now();
    for cx in -WORLD_CHUNKS / 2..WORLD_CHUNKS / 2 {
        for cy in -WORLD_CHUNKS / 2..WORLD_CHUNKS / 2 {
            sink += enemy_groups(7, cx, cy).len();
        }
    }
    println!("4096 chunks, enemy_groups(): {:?} total", started.elapsed());
    assert!(sink > 0);
}
