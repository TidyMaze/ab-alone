use std::io::Write;
use std::process::{Command, Stdio};

/// Runs the real binary with `script` on stdin and returns its stdout.
fn play(script: &str) -> String {
    let mut child = Command::new(env!("CARGO_BIN_EXE_abalone-cli"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("binary starts");
    child
        .stdin
        .take()
        .expect("stdin is piped")
        .write_all(script.as_bytes())
        .expect("script written");
    let output = child.wait_with_output().expect("binary exits");
    assert!(output.status.success());
    String::from_utf8(output.stdout).expect("utf-8 output")
}

/// Every kind of bad line, each followed by a legal move or the end of input.
const BAD_LINES: &str =
    "nope\n\n>SE\n(0,0)>X\n(0,0)(1,1>E\n0,0>E\n(00)>E\n(a,0)>E\n(0,x)>E\n(0,0) (1,1)>E\n(0,0)>E\n";

/// Scripted games through the binary: a game that is drawn by threefold repetition after bad lines,
/// and a game that stops when the input ends.
#[test]
fn scripted_games_through_the_binary() {
    let draw = play(&format!(
        "{BAD_LINES}(1,3)>NE\n(2,-2)>SE\n(2,2)>SW\n(2,-1)>NW\n(1,3)>NE\n(2,-2)>SE\n(2,2)>SW\n(2,-1)>NW\n"
    ));
    assert!(draw.ends_with("Draw\n"), "last lines were: {draw}");
    assert!(!draw.contains("input ended"));
    for message in [
        "error: missing '>' before the direction",
        "error: empty input",
        "error: no cell before '>'",
        "error: direction must be E, W, NE, SW, NW or SE",
        "error: cell must look like (q,r), for example (0,0)",
        "error: illegal move: ",
    ] {
        assert!(draw.contains(message), "{message} missing from {draw}");
    }

    let ended = play(BAD_LINES);
    assert!(ended.ends_with("input ended\n"), "last lines were: {ended}");
    assert!(!ended.contains("Draw"));
}
