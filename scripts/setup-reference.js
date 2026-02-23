#!/usr/bin/env node
// Clone all reference repositories listed in reference.json into the
// reference/ directory.
//
// Every entry is pinned to the commit recorded in reference.json, making
// checkouts fully reproducible. The Node.js entry uses a short commit hash;
// all others use a full SHA captured at the time of the initial clone.
//
// Usage:
//   node scripts/setup-reference.js
//   npm run setup-reference
//
// Already-present directories are skipped. Delete the directory first to
// re-clone.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const refRoot = join(root, 'reference');

const entries = JSON.parse(
  await readFile(join(root, 'reference.json'), 'utf8'),
);

/**
 * Derive the clone directory name from a git URL.
 * e.g. "https://github.com/nodejs/node.git" -> "node"
 *
 * @param {string} gitUrl
 * @returns {string}
 */
function dirFromGit(gitUrl) {
  return gitUrl.split('/').pop().replace(/\.git$/, '');
}

/**
 * Run a command, streaming its output to the terminal.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} cwd
 */
function run(cmd, args, cwd) {
  console.log(`  $ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

for (const entry of entries) {
  const dir = join(refRoot, dirFromGit(entry.git));
  const label = entry.name;

  if (existsSync(dir)) {
    console.log(`[skip]  ${label} -- already present`);
    continue;
  }

  if (entry.commit) {
    // Pinned commit: shallow-clone without checkout, fetch the exact commit,
    // then check it out.
    console.log(`[clone] ${label} @ ${entry.commit}`);
    run('git', ['clone', '--depth=1', '--no-checkout', entry.git, dir], root);
    run('git', ['fetch', '--depth=1', 'origin', entry.commit], dir);
    run('git', ['checkout', entry.commit], dir);
  } else {
    // Latest HEAD, shallow.
    console.log(`[clone] ${label}`);
    run('git', ['clone', '--depth=1', entry.git, dir], root);
  }
}

console.log('Done.');
