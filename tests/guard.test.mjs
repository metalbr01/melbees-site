import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { root, read } from './helpers.mjs';
import { refusal } from '../tools/hooks/pre-push.mjs';
import { ship, writeStamp } from '../tools/ship.mjs';

const hook = path.join(root, 'tools', 'hooks', 'pre-push.mjs');
const wrapper = path.join(root, 'tools', 'hooks', 'pre-push');
const sha = 'a'.repeat(40);
const zero = '0'.repeat(40);

const git = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: { ...process.env, MELBEES_SITE_ALLOW_UNGATED_PUSH: '' } });
const gitOut = (cwd, ...args) => git(cwd, ...args).stdout.trim();

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

test('a stamp file naming another commit, or a malformed one, is refused', () => {
  const dir = commonDirWith(null);
  fs.writeFileSync(path.join(dir, 'ship-stamps', `${sha}.json`), JSON.stringify({ sha: 'b'.repeat(40), tree: 't' }));
  assert.match(refusal(sha, dir, () => 't'), /names another commit/);
  fs.writeFileSync(path.join(dir, 'ship-stamps', `${sha}.json`), '{ half');
  assert.match(refusal(sha, dir, () => 't'), /^no ship stamp for/);
});

function runHook(input, env = {}) {
  return spawnSync(process.execPath, [hook, 'origin', 'url'], { cwd: root, input, encoding: 'utf8', env: { ...process.env, MELBEES_SITE_ALLOW_UNGATED_PUSH: '', ...env } });
}

test('the hook keys on the remote ref (the probe line shape), refuses deleting main, ignores other refs, honors the Owner bypass', () => {
  const head = gitOut(root, 'rev-parse', 'HEAD');
  const c = 'c'.repeat(40);
  for (const remoteSha of [head, zero]) {
    const refused = runHook(`refs/heads/claude2-probe ${c} refs/heads/main ${remoteSha}\n`);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /no ship stamp for cccccccccc/);
  }
  assert.match(runHook(`(delete) ${zero} refs/heads/main ${head}\n`).stderr, /deleting main is not allowed/);
  assert.equal(runHook(`refs/heads/main ${c} refs/heads/other ${zero}\n`).status, 0, 'a local main pushed to another ref is not a push to main');
  const bypass = runHook(`refs/heads/x ${c} refs/heads/main ${head}\n`, { MELBEES_SITE_ALLOW_UNGATED_PUSH: '1' });
  assert.equal(bypass.status, 0);
  assert.match(bypass.stderr, /NOT checked/);
});

test('the sh wrapper has no CR, and without node it refuses main, passes other refs and honors the bypass', () => {
  assert.ok(!fs.readFileSync(wrapper, 'utf8').includes('\r'), 'a CR in the shebang line breaks sh');
  const exec = gitOut(root, '--exec-path');
  const sh = [path.resolve(exec, '../../../usr/bin/sh.exe'), path.resolve(exec, '../../../bin/sh.exe'), '/bin/sh'].find((p) => fs.existsSync(p));
  if (!sh) return;
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'site-nonode-'));
  const go = (input, extra = {}) => spawnSync(sh, [wrapper.replace(/\\/g, '/'), 'origin', 'url'], { input, encoding: 'utf8', env: { PATH: empty, ...extra } });
  const refused = go(`refs/heads/x ${sha} refs/heads/main ${zero}\n`);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /node not found/);
  assert.doesNotMatch(refused.stderr, /no ship stamp for/, 'the fail-closed line is not the stamp refusal the probe reads');
  assert.equal(go(`refs/heads/x ${sha} refs/heads/y ${zero}\n`).status, 0);
  assert.equal(go(`refs/heads/x ${sha} refs/heads/main ${zero}\n`, { MELBEES_SITE_ALLOW_UNGATED_PUSH: '1' }).status, 0);
});

/** A bare remote, a primary with core.hooksPath = tools/hooks (relative) and a linked worktree on a mission branch. */
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-ship-'));
  const remote = path.join(dir, 'remote.git');
  const primary = path.join(dir, 'primary');
  git(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  git(dir, 'init', '-q', '-b', 'main', primary);
  git(primary, 'config', 'user.email', 't@example.invalid');
  git(primary, 'config', 'user.name', 't');
  fs.cpSync(path.join(root, 'tools'), path.join(primary, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(primary, 'a.txt'), 'one\n');
  git(primary, 'add', '-A');
  git(primary, 'commit', '-q', '-m', 'seed');
  git(primary, 'remote', 'add', 'origin', remote);
  git(primary, 'push', '-q', 'origin', 'main');
  git(primary, 'config', 'core.hooksPath', 'tools/hooks');
  const wt = path.join(dir, 'wt');
  git(primary, 'worktree', 'add', '-q', '-b', 'mission/x', wt, 'origin/main');
  fs.writeFileSync(path.join(wt, 'a.txt'), 'two\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'change');
  return { remote, primary, wt };
}
const node = (code) => ['node', ['-e', code]];

test('a plain push to main from the worktree is refused by the real hook; a ship with passing steps lands the stamped sha', () => {
  const { remote, wt } = fixture();
  const plain = git(wt, 'push', 'origin', 'HEAD:main');
  assert.notEqual(plain.status, 0);
  assert.match(plain.stderr, /no ship stamp for/);
  const logs = [];
  assert.equal(ship({ cwd: wt, steps: [node('0')], log: (l) => logs.push(l) }), 0, logs.join('\n'));
  assert.equal(gitOut(remote, 'rev-parse', 'main'), gitOut(wt, 'rev-parse', 'HEAD'));
  assert.ok(logs.some((l) => /^LANDED mission\/x/.test(l)));
});

test('ship failure paths push nothing and leave no stamp: a failing step, generator drift, a moved HEAD', () => {
  for (const [name, code] of [
    ['a failing step', 'process.exit(1)'],
    ['generator drift', "require('fs').writeFileSync('a.txt','drift\\n')"],
    ['a moved HEAD', "require('child_process').execFileSync('git',['commit','-q','--allow-empty','-m','x'])"]
  ]) {
    const { remote, wt } = fixture();
    const before = gitOut(remote, 'rev-parse', 'main');
    const logs = [];
    assert.equal(ship({ cwd: wt, steps: [node(code)], log: (l) => logs.push(l) }), 1, `${name}: ${logs.join('\n')}`);
    assert.equal(gitOut(remote, 'rev-parse', 'main'), before, name);
    const stamps = path.join(gitOut(wt, 'rev-parse', '--path-format=absolute', '--git-common-dir'), 'ship-stamps');
    assert.deepEqual(fs.existsSync(stamps) ? fs.readdirSync(stamps) : [], [], name);
  }
});

test('ship refuses the primary checkout, main, and an unclean tree', () => {
  const { primary, wt } = fixture();
  assert.equal(ship({ cwd: primary, steps: [], log: () => {} }), 2);
  fs.writeFileSync(path.join(wt, 'a.txt'), 'dirty\n');
  assert.equal(ship({ cwd: wt, steps: [], log: () => {} }), 2);
});

test('a stamp for the pushed sha lets a plain push through; a stamp of another tree does not', () => {
  const { remote, wt } = fixture();
  const sha1 = gitOut(wt, 'rev-parse', 'HEAD');
  writeStamp(wt, sha1, 'not-the-tree');
  assert.match(git(wt, 'push', 'origin', 'HEAD:main').stderr, /another tree/);
  writeStamp(wt, sha1, gitOut(wt, 'rev-parse', 'HEAD^{tree}'));
  assert.equal(git(wt, 'push', 'origin', 'HEAD:main').status, 0);
  assert.equal(gitOut(remote, 'rev-parse', 'main'), sha1);
  assert.ok(read('tools/hooks/pre-push').startsWith('#!/bin/sh'));
});
