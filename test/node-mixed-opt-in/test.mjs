// Ported from Node.js: test-async-loader-hooks-mixed-opt-in.mjs
// Tests that a loader handles mixed opt-in modules (virtual CJS entry with
// require() of a real file alongside ESM resolution).
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

const dir = import.meta.dirname;

test('node-mixed-opt-in: hook resolves virtual CJS entry that requires a real file', (t) => {
  t.plan(2);

  const child = spawnSync(process.execPath, [join(dir, 'entry.mjs')], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 15_000,
  });

  t.assert.strictEqual(child.stdout.trim(), 'Hello');
  t.assert.strictEqual(child.status, 0, `stderr: ${child.stderr}`);
});
