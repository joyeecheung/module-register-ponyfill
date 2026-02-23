// Ported from Node.js: test-async-loader-hooks-initialize-invoke.mjs
// Tests that initialize() is called when a hook module is registered.
import { test } from 'node:test';
import { register } from '../../index.js';

const shared = new SharedArrayBuffer(4);
register('./hook.mjs', { parentURL: import.meta.url, data: { shared }, transferList: [] });

test('node-initialize-invoke: initialize() should be invoked on register()', async (t) => {
  t.plan(1);
  const view = new Int32Array(shared);
  t.assert.strictEqual(
    Atomics.load(view, 0),
    1,
    'initialize() should have been called exactly once',
  );
});
