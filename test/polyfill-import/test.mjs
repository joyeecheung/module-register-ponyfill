import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

const polyfillPath = join(import.meta.dirname, '..', '..', 'src', 'polyfill.js');
const appPath = join(import.meta.dirname, 'app.mjs');

test('polyfill --import: node --import polyfill patches module.register()', (t) => {
  t.plan(1);
  // Run a child process that uses --import to load the polyfill,
  // then the app script calls module.register() and asserts it works.
  execFileSync(process.execPath, ['--import', polyfillPath, appPath], {
    encoding: 'utf-8',
    timeout: 15_000,
  });
  // If the subprocess exits cleanly, the polyfill worked.
  t.assert.ok(true);
});
