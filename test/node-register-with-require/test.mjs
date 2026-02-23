// Ported from Node.js: test-async-loader-hooks-register-with-require.mjs
// Tests that register() works when called from a --require CJS preload script.
// The preload uses native module.register() (not the ponyfill) since CJS
// --require scripts run synchronously and can't await the ponyfill's ESM import.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

const preloadPath = join(import.meta.dirname, 'preload.cjs');
const appPath = join(import.meta.dirname, 'app.mjs');

test('node-register-with-require: register() works via --require preload', (t) => {
  t.plan(1);
  // The load hook replaces node:os with a synthetic module.
  // If the hook didn't register, the assertion would fail.
  const stdout = execFileSync(process.execPath, ['--require', preloadPath, appPath], {
    encoding: 'utf-8',
    timeout: 15_000,
  });
  t.assert.strictEqual(stdout.trim(), 'from-require-hook');
});
