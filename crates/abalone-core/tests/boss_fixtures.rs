//! One recorded winning game per boss (docs/specs/boss-balance.md), replayed through the
//! encounter API: the boss and seed start it, both sides' moves are played in order. A rule or
//! knob change that breaks a recorded win fails here, and the replay never searches, so it is
//! deterministic and fast.

use abalone_core::encounter::fixture::Fixture;
use abalone_core::encounter::PveResult;

fn fixture(id: &str) -> Fixture {
    let path = format!("{}/tests/fixtures/{id}.txt", env!("CARGO_MANIFEST_DIR"));
    let text = std::fs::read_to_string(&path).expect("the fixture file exists");
    let fixture = Fixture::parse(&text).expect("the fixture parses");
    assert_eq!(fixture.boss.id(), id, "{path} holds another boss");
    fixture
}

fn assert_win(id: &str) {
    let fixture = fixture(id);
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
fn the_hull_win_replays() {
    assert_win("hull");
}

#[test]
fn the_choir_win_replays() {
    assert_win("choir");
}
