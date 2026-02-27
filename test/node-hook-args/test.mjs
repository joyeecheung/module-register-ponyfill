// Ported from Node.js: test-async-loader-hooks-called-with-expected-args.mjs
//                   and test-async-loader-hooks-called-with-register.mjs
// Both Node.js tests verify the same hook (hooks-input.mjs) with the same
// assertions -- one loads via --experimental-loader, the other via register().
// For the ponyfill they collapse into a single test since we always use
// register().
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

const dir = import.meta.dirname;

test('node-hook-args: resolve/load hooks receive expected arguments', (t) => {
  t.plan(3);

  const child = spawnSync(process.execPath, [join(dir, 'entry.mjs')], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 15_000,
  });

  t.assert.strictEqual(child.status, 0, `stderr: ${child.stderr}`);

  const lines = child.stdout.trim().split('\n');
  // 2 resolve calls + 2 load calls = 4 lines of JSON output
  t.assert.strictEqual(lines.length, 4);

  // Validate shapes: resolve results have url+format+shortCircuit,
  // load results have source+format+shortCircuit
  t.assert.match(
    lines[0],
    /\{"url":"file:\/\/\/.*\/json-modules\.mjs","format":"test","shortCircuit":true\}/,
  );
});
