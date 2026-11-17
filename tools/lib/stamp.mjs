// The stamp check of tools/hooks/pre-push.mjs, apart from it so the hook itself always runs its main.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const git = (...args) => {
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
