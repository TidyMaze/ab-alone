//! One recorded winning game per boss (docs/specs/boss-balance.md), replayed through the
//! encounter API: the boss and seed start it, both sides' moves are played in order. A rule or
//! knob change that breaks a recorded win fails here, and the replay never searches, so it is
//! deterministic and fast.

use abalone_core::encounter::fixture::Fixture;
use abalone_core::encounter::PveResult;

fn fixture(file: &str, id: &str) -> Fixture {
    let path = format!("{}/tests/fixtures/{file}.txt", env!("CARGO_MANIFEST_DIR"));
    let text = std::fs::read_to_string(&path).expect("the fixture file exists");
    let fixture = Fixture::parse(&text).expect("the fixture parses");
    assert_eq!(fixture.boss.id(), id, "{path} holds another boss");
    fixture
}

fn assert_win(id: &str) {
    assert_win_file(id, id);
}

fn assert_win_file(file: &str, id: &str) {
    let fixture = fixture(file, id);
    assert_eq!(fixture.replay(), Ok(Some(PveResult::Won)), "{id}");
    assert_eq!(
        fixture.replay(),
        fixture.replay(),
        "{id} replays the same twice"
    );
}

#[test]
fn the_echo_win_replays() {
    assert_win("echo");
}

#[test]
fn the_swarm_win_replays() {
    assert_win("swarm");
}

#[test]
fn the_hull_win_replays() {
    assert_win("hull");
}

#[test]
fn the_choir_win_replays() {
    assert_win("choir");
}

#[test]
fn the_chaplain_win_replays() {
    assert_win("chaplain");
}

/// The Chaplain game of the ladder pro player (#753): it wipes the boss by conversion in phase 1.
/// `chaplain.txt` stays the random game that reaches phase 2 and the martyr, which the wasm and
/// e2e tests need.
#[test]
fn the_chaplain_ladder_win_replays() {
    assert_win_file("chaplain-ladder", "chaplain");
}
