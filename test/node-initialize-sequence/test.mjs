// Ported from Node.js: test-async-loader-hooks-initialize-in-sequence.mjs
// Tests that multiple register() calls run initialize() sequentially, not
// concurrently, and that each register() blocks until initialize() completes.
import { test } from 'node:test';
import { register } from '../../index.js';

// SharedArrayBuffer layout (Int32):
//   [0]: number of initialize() calls so far
//   [1]: counter value from 1st call
//   [2]: counter value from 2nd call
const shared = new SharedArrayBuffer(12);
const opts = { parentURL: import.meta.url, data: { shared }, transferList: [] };

// Use the same URL so both calls share one module instance (and its counter).
register('./hook.mjs', opts);
register('./hook.mjs', opts);

test('node-initialize-sequence: multiple register() calls run initialize in order', async (t) => {
  t.plan(3);
  const view = new Int32Array(shared);
  t.assert.strictEqual(view[0], 2, 'initialize() should be called exactly twice');
  t.assert.strictEqual(view[1], 1, 'first initialize() sees counter 1');
  t.assert.strictEqual(view[2], 2, 'second initialize() sees counter 2');
});
