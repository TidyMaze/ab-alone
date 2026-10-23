use std::io;

fn main() {
    abalone_cli::run(io::stdin().lock(), io::stdout().lock());
}
