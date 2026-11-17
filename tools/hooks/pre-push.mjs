// pre-push guard: a push to `main` needs the stamp `node tools/ship.mjs` writes for the exact sha being
// pushed (<git-common-dir>/ship-stamps/<sha>.json, naming the sha and its tree). Installed with
// `git config core.hooksPath tools/hooks` (relative: each worktree runs its own tracked copy).
// Deleting main is refused too. The Owner, and only on his word, can bypass with MELBEES_SITE_ALLOW_UNGATED_PUSH=1.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ZERO = /^0+$/;

const git = (...args) => {
  const r = spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
};

/** Why `sha` may not land on main, or null when it may. `commonDir` holds ship-stamps/. */
export function refusal(sha, commonDir, treeOf = (s) => git('rev-parse', `${s}^{tree}`)) {
  const short = sha.slice(0, 10);
  let stamp = null;
  try {
    stamp = JSON.parse(readFileSync(join(commonDir, 'ship-stamps', `${sha}.json`), 'utf8'));
  } catch {
    /* no stamp */
  }
  if (!stamp) return `no ship stamp for ${short}: land through \`node tools/ship.mjs\``;
  if (stamp.sha !== sha) return `ship stamp for ${short} names another commit: land through \`node tools/ship.mjs\``;
  const tree = treeOf(sha);
  if (!tree || stamp.tree !== tree) return `ship stamp for ${short} is for another tree: land through \`node tools/ship.mjs\``;
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
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
}
