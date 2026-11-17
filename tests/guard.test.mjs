import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { root } from './helpers.mjs';
import { refusal } from '../tools/hooks/pre-push.mjs';

const hook = path.join(root, 'tools', 'hooks', 'pre-push.mjs');
const sha = 'a'.repeat(40);

function commonDirWith(stamp) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-guard-'));
  fs.mkdirSync(path.join(dir, 'ship-stamps'));
  if (stamp) fs.writeFileSync(path.join(dir, 'ship-stamps', `${stamp.sha}.json`), JSON.stringify(stamp));
  return dir;
}

test('no stamp: refused with the line claude2-plus probes for', () => {
  assert.match(refusal(sha, commonDirWith(null), () => 't'), /^no ship stamp for aaaaaaaaaa/);
});

test('a stamp for the same sha and tree lets it through; another tree does not', () => {
  const dir = commonDirWith({ sha, tree: 'tree1' });
  assert.equal(refusal(sha, dir, () => 'tree1'), null);
  assert.match(refusal(sha, dir, () => 'tree2'), /another tree/);
});

test('a stamp file naming another commit is refused', () => {
  const dir = commonDirWith(null);
  fs.writeFileSync(path.join(dir, 'ship-stamps', `${sha}.json`), JSON.stringify({ sha: 'b'.repeat(40), tree: 't' }));
  assert.match(refusal(sha, dir, () => 't'), /names another commit/);
});

function runHook(input, env = {}) {
  return spawnSync(process.execPath, [hook, 'origin', 'url'], {
    cwd: root,
    input,
    encoding: 'utf8',
    env: { ...process.env, MELBEES_SITE_ALLOW_UNGATED_PUSH: '', ...env }
  });
}

test('the hook refuses an unstamped push to main, ignores other refs and deletions, and honors the Owner bypass', () => {
  const head = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const zero = '0'.repeat(40);
  const refused = runHook(`refs/heads/x ${'c'.repeat(40)} refs/heads/main ${head}\n`);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /no ship stamp for cccccccccc/);
  assert.equal(runHook(`refs/heads/x ${'c'.repeat(40)} refs/heads/other ${zero}\n`).status, 0);
  assert.equal(runHook(`(delete) ${zero} refs/heads/main ${head}\n`).status, 0);
  assert.equal(runHook(`refs/heads/x ${'c'.repeat(40)} refs/heads/main ${head}\n`, { MELBEES_SITE_ALLOW_UNGATED_PUSH: '1' }).status, 0);
});
