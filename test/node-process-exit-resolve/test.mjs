// Ported from Node.js: test-async-loader-hooks-process-exit-sync.mjs
// Tests that process.exit() called from a resolve hook propagates the exit
// code to the main process.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

const dir = import.meta.dirname;

test('node-process-exit-resolve: process.exit(42) in resolve hook exits with code 42', (t) => {
  t.plan(2);
  const child = spawnSync(process.execPath, [join(dir, 'entry.mjs')], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 15_000,
  });
  t.assert.strictEqual(child.status, 42);
  t.assert.strictEqual(child.stdout, '');
});
