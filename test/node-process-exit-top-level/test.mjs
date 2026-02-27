// Ported from Node.js: test-async-loader-hooks-process-exit-top-level.mjs
// Tests that process.exit() called at hook module top-level propagates the
// exit code to the main process.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

const dir = import.meta.dirname;

test('node-process-exit-top-level: process.exit(42) at hook top-level exits with code 42', (t) => {
  t.plan(2);
  const child = spawnSync(process.execPath, [join(dir, 'entry.mjs')], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 15_000,
  });
  t.assert.strictEqual(child.status, 42);
  t.assert.strictEqual(child.stdout, '');
});
