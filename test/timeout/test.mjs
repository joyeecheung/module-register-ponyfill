import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

const appPath = join(import.meta.dirname, 'app.mjs');

test('timeout: hanging hook triggers timeout with MODULE_REGISTER_TIMEOUT_MS', (t) => {
  t.plan(1);

  const stdout = execFileSync(process.execPath, [appPath], {
    encoding: 'utf-8',
    timeout: 30_000,
    env: {
      ...process.env,
      // Use a short timeout so the test finishes quickly.
      MODULE_REGISTER_TIMEOUT_MS: '1000',
    },
  });

  // The error message should mention the configured timeout value.
  t.assert.ok(stdout.includes('1000ms'), `expected timeout message, got: ${stdout.trim()}`);
});
