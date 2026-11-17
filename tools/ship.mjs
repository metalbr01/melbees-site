// Light ship: the only way to origin/main. No gate, the site has no build.
//
//   node tools/ship.mjs
//
// clean tree -> fetch -> rebase onto origin/main -> regenerate (the tree must stay clean: generated HTML is
// committed) -> tests -> stamp -> push HEAD:main (never force; bounded retry) -> advance the primary's main when safe.
// Exit 0 landed, 1 tests red or generated site out of date, 2 misuse, 3 could not run.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_TRIES = 3;
const run = (cmd, args, { cwd, inherit = false } = {}) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true, stdio: inherit ? 'inherit' : 'pipe' });
  return { code: r.status ?? 3, out: String(r.stdout ?? '').trim(), err: String(r.stderr ?? '').trim() };
};
const git = (root, ...args) => run('git', ['-C', root, ...args]);

export const TESTS = [
  ['node', ['--test', 'tests/play.test.mjs', 'tests/site.test.mjs', 'tests/guard.test.mjs']],
  ['node', ['tests/http.test.mjs']]
];

function land(root, log) {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    git(root, 'fetch', '--quiet', 'origin', 'main');
    if (git(root, 'rebase', 'origin/main').code !== 0) {
      log('ship: rebase conflict, left in progress. Resolve, `git rebase --continue`, ship again.');
      return 3;
    }
    if (run('node', ['_fonte/gerar.mjs'], { cwd: root, inherit: true }).code !== 0) {
      log('ship: _fonte/gerar.mjs failed; nothing pushed');
      return 1;
    }
    if (git(root, 'status', '--porcelain').out) {
      log('ship: the generated site differs from the commit (run `node _fonte/gerar.mjs`, commit, ship again):\n' + git(root, 'status', '--short').out);
      return 1;
    }
    for (const [cmd, args] of TESTS) {
      if (run(cmd, args, { cwd: root, inherit: true }).code !== 0) {
        log(`ship: \`${cmd} ${args.join(' ')}\` failed; nothing pushed`);
        return 1;
      }
    }
    const sha = git(root, 'rev-parse', 'HEAD').out;
    const tree = git(root, 'rev-parse', 'HEAD^{tree}').out;
    const common = git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir').out;
    mkdirSync(join(common, 'ship-stamps'), { recursive: true });
    writeFileSync(join(common, 'ship-stamps', `${sha}.json`), JSON.stringify({ sha, tree, at: new Date().toISOString() }) + '\n');
    const push = git(root, 'push', 'origin', 'HEAD:main');
    if (push.code === 0) return 0;
    const text = push.err + push.out;
    if (!/non-fast-forward|fetch first|rejected/i.test(text) || /pre-push/i.test(text)) {
      log(`ship: push failed:\n${text}`);
      return 3;
    }
    log(`ship: main moved meanwhile (attempt ${attempt}/${MAX_TRIES}); rebasing again`);
  }
  log('ship: main kept moving; try again later');
  return 3;
}

export function ship({ log = console.log, cwd = process.cwd() } = {}) {
  const root = git(cwd, 'rev-parse', '--show-toplevel').out;
  if (!root) {
    log('ship: not inside a git worktree');
    return 2;
  }
  const gitDir = git(root, 'rev-parse', '--path-format=absolute', '--git-dir').out;
  const common = git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir').out;
  if (gitDir.toLowerCase() === common.toLowerCase()) {
    log('ship: run it from a linked worktree (git worktree add), not the primary checkout');
    return 2;
  }
  const branch = git(root, 'branch', '--show-current').out;
  if (!branch || branch === 'main') {
    log(`ship: run it from a mission branch, this is "${branch || 'detached HEAD'}"`);
    return 2;
  }
  if (git(root, 'status', '--porcelain').out) {
    log('ship: uncommitted changes; commit them first');
    return 2;
  }
  const code = land(root, log);
  if (code !== 0) return code;
  log(`LANDED ${branch} ${git(root, 'rev-parse', '--short=10', 'HEAD').out} on origin/main`);
  const primary = dirname(common);
  const onMain = git(primary, 'branch', '--show-current').out === 'main';
  if (onMain && !git(primary, 'status', '--porcelain').out && git(primary, 'merge', '--ff-only', '--quiet', 'origin/main').code === 0) log('primary checkout: main fast-forwarded');
  else log('primary checkout not advanced (not on main, dirty, or not a fast-forward); `git pull --ff-only` there.');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(ship());
