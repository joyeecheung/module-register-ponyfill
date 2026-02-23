import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

const polyfillPath = join(import.meta.dirname, '..', '..', 'src', 'polyfill.js');
const appPath = join(import.meta.dirname, 'app.mjs');

test('polyfill --import: named import { register } from node:module works', (t) => {
  t.plan(1);
  // The app uses `import { register } from 'node:module'` (named import)
  // instead of `nodeModule.register(...)` (property access on default).
  // If named exports are snapshots, the polyfill patch from --import
  // would not be visible and this would fail.
  execFileSync(process.execPath, ['--import', polyfillPath, appPath], {
    encoding: 'utf-8',
    timeout: 15_000,
  });
  t.assert.ok(true);
});
