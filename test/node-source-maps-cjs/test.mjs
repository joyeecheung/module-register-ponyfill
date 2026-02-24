// Ported from Node.js: test-async-loader-hooks-source-maps-cjs.mjs
// Tests that a load hook providing source content for CJS modules enables --enable-source-maps.
// The hook reads and returns the raw source for CommonJS files, which Node.js normally
// does not expose to its source map handler for CJS modules.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const dir = import.meta.dirname;

test('node-source-maps-cjs: load hook enables --enable-source-maps for CJS', (t) => {
  t.plan(2);
  const child = spawnSync(
    process.execPath,
    [
      '--enable-source-maps',
      `--import=${pathToFileURL(join(dir, 'entry.mjs')).href}`,
      join(dir, 'fixture.js'),
    ],
    { encoding: 'utf-8', timeout: 15_000 }
  );
  // Without the hook, the error points to fixture.js. With it, it points to fixture.ts.
  t.assert.match(child.stderr.toString(), /fixture\.ts:1:\d+/);
  t.assert.strictEqual(child.status, 1);
});
