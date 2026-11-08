use std::io;

fn main() {
    edgefall_cli::run(io::stdin().lock(), io::stdout().lock());
}
