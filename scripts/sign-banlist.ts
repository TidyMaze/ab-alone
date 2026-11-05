// Signs client/src/bannedkeys.json with the owner key (docs/specs/multiplayer.md section 7) and writes client/src/bannedkeys.sig.json.
// Run on the owner's Mac: `cd client && bun ../scripts/sign-banlist.ts`. The private key is read from the macOS keychain
// (service ab-alone-banlist-signing, account owner) and is never printed, logged or written to a file.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OWNER_PUB, signBanList } from '../client/src/banverify';

const list = fileURLToPath(new URL('../client/src/bannedkeys.json', import.meta.url));
const out = fileURLToPath(new URL('../client/src/bannedkeys.sig.json', import.meta.url));

const secret = execFileSync('security', ['find-generic-password', '-s', 'ab-alone-banlist-signing', '-a', 'owner', '-w'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
}).trim();
const sig = await signBanList(JSON.parse(readFileSync(list, 'utf8')), secret);
if (sig.pubkey !== OWNER_PUB) throw new Error('the keychain key is not the owner key: nothing written');
writeFileSync(out, `${JSON.stringify(sig, null, 2)}\n`);
console.log(`signed ${list} with the owner key ${sig.pubkey}`);
