// Runs nightly-report.mjs with the real file system, git and gh. Called by .github/workflows/nightly.yml from
// client/, after the e2e step. Needs the GitHub Actions environment (GITHUB_*), E2E_BASE_URL, NIGHTLY_REPORT,
// ISSUE_BODY_FILE and GH_TOKEN (for gh run list).
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { main } from './nightly-report.mjs';

main({
  env: process.env,
  cwd: process.cwd(),
  readFile: (path) => readFileSync(path, 'utf8'),
  writeFile: (path, text) => writeFileSync(path, text),
  appendFile: (path, text) => appendFileSync(path, text),
  exec: (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
  log: (line) => console.log(line),
});
