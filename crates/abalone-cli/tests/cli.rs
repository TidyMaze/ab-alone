use std::io::Write;
use std::process::{Command, Stdio};

/// Plays a scripted game through the real binary: one bad line, then a threefold repetition draw.
#[test]
fn scripted_game_ends_in_a_draw() {
    let script = "nope\n\
        (1,3)>NE\n\
        (2,-2)>SE\n\
        (2,2)>SW\n\
        (2,-1)>NW\n\
        (1,3)>NE\n\
        (2,-2)>SE\n\
        (2,2)>SW\n\
        (2,-1)>NW\n";
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
    let stdout = String::from_utf8(output.stdout).expect("utf-8 output");
    assert!(stdout.contains("error: missing '>' before the direction\n"));
    assert!(stdout.ends_with("Draw\n"), "last lines were: {stdout}");
    assert!(!stdout.contains("input ended"));
}
