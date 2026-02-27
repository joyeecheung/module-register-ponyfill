// Ported from Node.js: test-async-loader-hooks-remove-beforeexit-listener.mjs
// Tests that calling process.removeAllListeners("beforeExit") on the main
// thread does not crash or interfere with async loader hooks.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

const dir = import.meta.dirname;

test("node-remove-beforeexit-listener: removeAllListeners('beforeExit') does not break hooks", (t) => {
  t.plan(3);

  const child = spawnSync(process.execPath, [join(dir, 'entry.mjs')], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 15_000,
  });

  t.assert.strictEqual(child.status, 0, `stderr: ${child.stderr}`);
  t.assert.strictEqual(child.stdout, '');
  t.assert.strictEqual(child.stderr, '');
});
