// Checks the download size budget of the production build (docs/specs/tech.md section 9, #505). After `vite build`, it
// sums the gzipped size of the files in dist/: the first screen (the page, the entry JS and CSS, the wasm, the icons,
// the shared KTX2 textures and the Mess deck's, and their transcoder), each deck (its `deck-<deck>*` files) and the
// whole site. It fails over a budget, or when dist/ holds a source file. The table goes to the run summary in CI, to
// the console elsewhere.
// Run from client/: bun run scripts/size-budget.mjs dist
import { appendFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DECK_NAMES } from '../src/deck.ts';
import { DEFAULT_GLASS_SKIN, glassSkinById } from '../src/glassskins.ts';
import { DEFAULT_SKIN, skinById } from '../src/skins.ts';

const MB = 1_000_000;
export const BUDGETS = { firstScreen: 5 * MB, deck: 15 * MB, site: 250 * MB };
const FIRST_DECK = 'mess'; // the hub's deck, loaded with the first screen
const FIRST_SKINS = [skinById(DEFAULT_SKIN).asset, glassSkinById(DEFAULT_GLASS_SKIN).asset]; // worn from the first frame, the others load when picked
const SOURCE = /\.(blend|wav|psd|kra|xcf)$/i;
const FIRST_SCREEN = new RegExp(
  String.raw`^(index\.html|assets\/(index-[^/]*\.(js|css)|basis_transcoder-[^/]*\.js|[^/]*\.ktx2|pbr\/skin-(${FIRST_SKINS.join('|')})-[^/]*\.ktx2)|.*\.wasm|icons\/.*)$`,
);

/** The deck a file belongs to (`deck-cargo.png`, `deck-cargo-normal.png`), or undefined for a shared file. */
const deckOf = (file) => DECK_NAMES.find((deck) => new RegExp(`^deck-${deck}[-.]`).test(basename(file)));

/** The parts of the build with their gzipped size and budget, and the source files, from each file's gzipped size. */
export function measure(sizes, budgets = BUDGETS) {
  const files = Object.keys(sizes);
  const sum = (keep) => files.filter(keep).reduce((total, file) => total + sizes[file], 0);
  const firstScreen = (file) => FIRST_SCREEN.test(file) && [undefined, FIRST_DECK].includes(deckOf(file));
  return {
    parts: [
      { name: 'First screen', bytes: sum(firstScreen), budget: budgets.firstScreen },
      ...DECK_NAMES.map((deck) => ({ name: `Deck ${deck}`, bytes: sum((f) => deckOf(f) === deck), budget: budgets.deck })),
      { name: 'Site', bytes: sum(() => true), budget: budgets.site },
    ],
    sources: files.filter((file) => SOURCE.test(file)),
  };
}

/** The run summary table. */
export function toMarkdown(parts, sources) {
  const rows = parts.map(
    (p) => `| ${p.name} | ${(p.bytes / MB).toFixed(2)} MB | ${p.budget / MB} MB | ${p.bytes > p.budget ? 'over budget' : 'ok'} |`,
  );
  const found = sources.length ? ['', `Source files in the build: ${sources.join(', ')}`] : [];
  const head = ['### Download size budget (gzipped, docs/specs/tech.md section 9)', '', '| Part | Size | Budget | Result |'];
  return [...head, '|---|---|---|---|', ...rows, ...found, ''].join('\n');
}

/** The script: measures `dir`, writes the table to `summary` (or the console), exits 1 when a check fails. */
export function main(dir, summary, budgets = BUDGETS) {
  const sizes = {};
  for (const file of readdirSync(dir, { recursive: true }).map(String)) {
    if (statSync(join(dir, file)).isFile()) sizes[file.split(sep).join('/')] = gzipSync(readFileSync(join(dir, file))).length;
  }
  const { parts, sources } = measure(sizes, budgets);
  const table = toMarkdown(parts, sources);
  if (summary) appendFileSync(summary, table);
  else console.log(table);
  const over = parts.filter((p) => p.bytes > p.budget).map((p) => p.name);
  if (over.length) console.error(`Over the download budget: ${over.join(', ')}.`);
  if (sources.length) console.error(`Source files in the build: ${sources.join(', ')}.`);
  if (over.length || sources.length) process.exit(1);
}

// Run as a script: the same check as the asset generators, which a test can make true (import.meta.main it cannot).
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv[2], process.env.GITHUB_STEP_SUMMARY);
