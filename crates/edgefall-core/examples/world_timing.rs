//! Open world generation timing: `cargo run --release -p edgefall-core --example world_timing`. One chunk and every
//! chunk of the hexagon world, for `chunk` and `enemy_groups`. Prints the time per call.
use edgefall_core::world::{chunk, enemy_groups, CHUNK, WORLD_RADIUS};
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
    // The chunks that reach the hexagon lie in this square; `chunk` is `None` for the others.
    let span = || -WORLD_RADIUS / CHUNK - 1..=WORLD_RADIUS / CHUNK;
    let started = Instant::now();
    let (mut chunks, mut all) = (0usize, 0usize);
    for cx in span() {
        for cy in span() {
            if let Some(cells) = chunk(7, cx, cy) {
                chunks += 1;
                all += cells.iter().flatten().count();
            }
        }
    }
    println!(
        "{chunks} chunks, chunk(): {:?} total ({all} cells)",
        started.elapsed()
    );
    let started = Instant::now();
    for cx in span() {
        for cy in span() {
            sink += enemy_groups(7, cx, cy).len();
        }
    }
    println!(
        "{chunks} chunks, enemy_groups(): {:?} total",
        started.elapsed()
    );
    assert!(sink > 0);
}
