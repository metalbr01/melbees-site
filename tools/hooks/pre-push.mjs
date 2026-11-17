// pre-push guard: a push to `main` needs the stamp `node tools/ship.mjs` writes for the exact sha being
// pushed (<git-common-dir>/ship-stamps/<sha>.json, naming the sha and its tree). Installed with
// `git config core.hooksPath tools/hooks` (relative: each worktree runs its own tracked copy).
// Deleting main is refused too. The Owner, and only on his word, can bypass with MELBEES_SITE_ALLOW_UNGATED_PUSH=1.
import { readFileSync } from 'node:fs';
import { git, refusal } from '../lib/stamp.mjs';

const ZERO = /^0+$/;

if (process.env.MELBEES_SITE_ALLOW_UNGATED_PUSH === '1') {
  console.error('pre-push: MELBEES_SITE_ALLOW_UNGATED_PUSH=1, ship stamp NOT checked (Owner override)');
  process.exit(0);
}
const commonDir = git('rev-parse', '--path-format=absolute', '--git-common-dir');
if (!commonDir) {
  console.error('pre-push: refused push to main. no ship stamp: cannot find the git common dir');
  process.exit(1);
}
for (const line of readFileSync(0, 'utf8').split('\n').filter(Boolean)) {
  const [, localSha, remoteRef] = line.split(' ');
  if (remoteRef !== 'refs/heads/main') continue;
  const why = ZERO.test(localSha) ? 'deleting main is not allowed' : refusal(localSha, commonDir);
  if (why) {
    console.error(`pre-push: refused push to main. ${why}`);
    process.exit(1);
  }
}
process.exit(0);
